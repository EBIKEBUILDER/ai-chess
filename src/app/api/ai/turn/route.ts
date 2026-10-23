// src/app/api/ai/turn/route.ts
import { NextResponse } from "next/server";
import { Chess } from "chess.js";
import {
  aiMoveJsonSchema,
  AiMoveZodSchema,
  type AiMoveStructuredOutput,
  type CoachingSkillLevel,
  type ControllerType,
  type GeminiModelId,
  type OpenAIModelId,
  type ThinkingLevel,
} from "@/types/chess";
import { executeGeminiStructuredInteraction } from "@/lib/ai/gemini-interactions";
import { executeOpenAIStructuredResponse } from "@/lib/ai/openai-responses";

interface TurnRequestBody {
  fen: string;
  pgn: string;
  lastMoveSan: string | null;
  userChatMessage?: string | null;
  controller: ControllerType;
  geminiModel: GeminiModelId;
  openaiModel: OpenAIModelId;
  thinkingLevel: ThinkingLevel;
  previousInteractionId: string | null;
  isTeacherSparring?: boolean;
  skillLevel?: CoachingSkillLevel;
  hypeCommentatorMode?: boolean;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as TurnRequestBody;
    const chess = new Chess(body.fen);

    if (chess.isGameOver()) {
      return NextResponse.json(
        { error: "Game is already over; no legal moves remain." },
        { status: 400 }
      );
    }

    const activeColorName = chess.turn() === "w" ? "White" : "Black";
    const legalMovesSan = chess.moves();
    const verboseMoves = chess.moves({ verbose: true });
    const asciiBoard = chess.ascii();

    const isGentleMode =
      body.isTeacherSparring &&
      (body.skillLevel === "beginner" || !body.skillLevel);
    const isCasualMode =
      body.isTeacherSparring && body.skillLevel === "casual";

    const hypeSuffix = body.hypeCommentatorMode
      ? ` COMMENTATOR STYLE (GothamChess / Levy Rozman Mode ENABLED): Write table_talk_message with energetic, witty YouTube chess creator flair! If there is a Rook move or sacrifice, hype up "THE ROOOOOOK!!"; if there is a counter-attack, mention "Danger Levels"; if piling pressure on a pinned piece, mention "PP on the PP (Put Pressure on the Pinned Piece)"; and keep the tactical explanation dramatic and fun!`
      : "";

    const systemInstruction =
      (isGentleMode
        ? [
            `Role: Gentle, Supportive Chess Teacher Sparring Partner playing as ${activeColorName} against a complete beginner.`,
            `Objective: Play a friendly, natural, low-pressure move at a beginner level! DO NOT play ruthless engine-crushing tactics or punishing traps. Play simple developing moves that give the student fun opportunities to practice defending, capturing, or controlling the center.`,
            `In table_talk_message, explain in warm, plain English what piece you just moved, where it moved, and give the student a gentle hint about what to look out for on their turn!`,
            `Constraint: The selected_move_san field MUST match one of the exact strings in legal_moves.`,
          ].join(" ")
        : isCasualMode
          ? [
              `Role: Friendly Club Sparring Coach playing as ${activeColorName} against a developing learner.`,
              `Objective: Play natural, human-like moves at a casual pace without overwhelming the student. In table_talk_message, share a friendly tip about why you chose your move.`,
              `Constraint: The selected_move_san field MUST match one of the exact strings in legal_moves.`,
            ].join(" ")
          : [
              `Role: Grandmaster Chess Engine playing as ${activeColorName}.`,
              `Objective: Analyze the board position, formulate a multi-turn strategic plan, and select a single legal move strictly from the provided legal_moves array.`,
              `Constraint: The selected_move_san field MUST match one of the exact strings in legal_moves. Include a concise tactical justification and an engaging message for the live match log.`,
            ].join(" ")) + hypeSuffix;

    // Because previous_interaction_id retains prior turns on the server, send only the current turn delta
    const turnInputPrompt = [
      `Current Turn: ${activeColorName} to move.`,
      body.lastMoveSan
        ? `Opponent's Last Move (SAN): ${body.lastMoveSan}`
        : `Match Start: Opening move of the game.`,
      body.userChatMessage
        ? `Live Chat Message from Opponent/Spectator: "${body.userChatMessage}"`
        : null,
      `Current FEN: ${body.fen}`,
      `ASCII Board:\n${asciiBoard}`,
      `In Check: ${chess.inCheck()}`,
      `STRICT LEGAL MOVES (Select one exact string from this list): ${JSON.stringify(legalMovesSan)}`,
    ]
      .filter(Boolean)
      .join("\n");

    let currentInteractionId = body.previousInteractionId;
    let promptToSend = turnInputPrompt;
    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts) {
      attempts++;

      let candidateOutput: AiMoveStructuredOutput;
      let thoughtSummary: string | null = null;
      let thoughtTokens: number | null = null;
      let latencyMs = 0;

      if (body.controller === "gemini") {
        const geminiRes =
          await executeGeminiStructuredInteraction<AiMoveStructuredOutput>({
            model: body.geminiModel,
            thinkingLevel: body.thinkingLevel,
            systemInstruction,
            inputPrompt: promptToSend,
            jsonSchema: aiMoveJsonSchema as unknown as Record<string, unknown>,
            previousInteractionId: currentInteractionId,
          });
        candidateOutput = AiMoveZodSchema.parse(geminiRes.parsedOutput);
        currentInteractionId = geminiRes.interactionId;
        thoughtSummary = geminiRes.thoughtSummaryText;
        thoughtTokens = geminiRes.totalThoughtTokens;
        latencyMs = geminiRes.latencyMs;
      } else {
        const openaiRes =
          await executeOpenAIStructuredResponse<AiMoveStructuredOutput>({
            model: body.openaiModel,
            thinkingLevel: body.thinkingLevel,
            systemInstruction,
            inputPrompt: promptToSend,
            schemaName: "chess_move_decision",
            jsonSchema: aiMoveJsonSchema as unknown as Record<string, unknown>,
            previousResponseId: currentInteractionId,
          });
        candidateOutput = AiMoveZodSchema.parse(openaiRes.parsedOutput);
        currentInteractionId = openaiRes.responseId;
        thoughtSummary = openaiRes.thoughtSummaryText;
        thoughtTokens = openaiRes.totalThoughtTokens;
        latencyMs = openaiRes.latencyMs;
      }

      // Deterministic validation against chess.js
      const validatorChess = new Chess(body.fen);
      let validatedMove = null;
      try {
        validatedMove = validatorChess.move(candidateOutput.selected_move_san);
      } catch {
        try {
          validatedMove = validatorChess.move({
            from: candidateOutput.from_square,
            to: candidateOutput.to_square,
            promotion: "q",
          });
        } catch {
          validatedMove = null;
        }
      }

      if (validatedMove) {
        const activeModelName =
          body.controller === "gemini" ? body.geminiModel : body.openaiModel;
        return NextResponse.json({
          move: {
            san: validatedMove.san,
            from: validatedMove.from,
            to: validatedMove.to,
            promotion: validatedMove.promotion,
          },
          thoughtSummary:
            thoughtSummary || candidateOutput.tactical_justification,
          chatMessage: candidateOutput.table_talk_message,
          positionalEvaluation: candidateOutput.positional_evaluation_cp,
          tacticalMotif: candidateOutput.tactical_justification,
          expectedReplySan: candidateOutput.expected_opponent_reply_san,
          thoughtTokens,
          latencyMs,
          interactionId: currentInteractionId,
          modelLabel: body.isTeacherSparring
            ? `Coach Sparring (${activeModelName})`
            : `${activeModelName} (${body.thinkingLevel})`,
        });
      }

      // Chained self-correction prompt using the updated currentInteractionId
      promptToSend = `CORRECTION REQUIRED: The move "${candidateOutput.selected_move_san}" (${candidateOutput.from_square}->${candidateOutput.to_square}) is illegal in FEN "${body.fen}". Choose strictly one exact string from this array: ${JSON.stringify(legalMovesSan)}`;
    }

    // Fallback deterministic selection if retries are exhausted
    const fallbackMove = verboseMoves[0];
    return NextResponse.json({
      move: {
        san: fallbackMove.san,
        from: fallbackMove.from,
        to: fallbackMove.to,
        promotion: fallbackMove.promotion,
      },
      thoughtSummary: "Fallback legal move selected after validation check.",
      chatMessage: `Playing ${fallbackMove.san}.`,
      positionalEvaluation: 0.0,
      tacticalMotif: "Standard development.",
      expectedReplySan: null,
      thoughtTokens: null,
      latencyMs: 0,
      interactionId: currentInteractionId,
      modelLabel:
        body.controller === "gemini"
          ? `${body.geminiModel} (${body.thinkingLevel})`
          : body.openaiModel,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "AI Turn execution failed." },
      { status: 500 }
    );
  }
}
