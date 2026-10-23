// src/app/api/ai/teacher/route.ts
import { NextResponse } from "next/server";
import { Chess, type Square } from "chess.js";
import {
  aiTeacherJsonSchema,
  AiTeacherZodSchema,
  type AiTeacherStructuredOutput,
  type CoachingSkillLevel,
  type GeminiModelId,
  type OpenAIModelId,
  type ThinkingLevel,
} from "@/types/chess";
import { executeGeminiStructuredInteraction } from "@/lib/ai/gemini-interactions";
import { executeOpenAIStructuredResponse } from "@/lib/ai/openai-responses";

export type TeacherModelChoice = GeminiModelId | OpenAIModelId;

const OPENAI_MODELS: ReadonlySet<string> = new Set([
  "gpt-5.5",
  "gpt-4o",
  "gpt-4o-mini",
]);

interface TeacherRequestBody {
  fen: string;
  previousFen?: string | null;
  pgn: string;
  lastStudentMoveSan: string | null;
  studentQuestion: string | null;
  skillLevel?: CoachingSkillLevel;
  geminiModel: TeacherModelChoice;
  thinkingLevel: ThinkingLevel;
  previousTeacherInteractionId: string | null;
  hypeCommentatorMode?: boolean;
}

const PIECE_NAMES: Record<string, string> = {
  p: "Pawn",
  n: "Knight",
  b: "Bishop",
  r: "Rook",
  q: "Queen",
  k: "King",
};

/**
 * Computes deterministic tactical ground truth using chess.board() and chess.attackers()
 * so the AI Chess Teacher never hallucinates undefended pieces or attack vectors.
 */
function buildTacticalBoardDigest(chess: Chess): string {
  const board = chess.board();
  const tacticalNotes: string[] = [];

  for (const row of board) {
    for (const cell of row) {
      if (!cell) continue;
      const sq = cell.square as Square;
      const whiteAttackers = chess.attackers(sq, "w");
      const blackAttackers = chess.attackers(sq, "b");
      const pieceName = PIECE_NAMES[cell.type] || cell.type.toUpperCase();

      if (cell.color === "w" && blackAttackers.length > 0) {
        tacticalNotes.push(
          `White ${pieceName} on ${sq} is attacked by Black from [${blackAttackers.join(", ")}] and defended by White from [${whiteAttackers.join(", ") || "NONE - UNDEFENDED / HANGING PIECE!"}].`
        );
      } else if (cell.color === "b" && whiteAttackers.length > 0) {
        tacticalNotes.push(
          `Black ${pieceName} on ${sq} is attacked by White from [${whiteAttackers.join(", ")}] and defended by Black from [${blackAttackers.join(", ") || "NONE - UNDEFENDED / HANGING PIECE!"}].`
        );
      }
    }
  }

  return tacticalNotes.length > 0
    ? tacticalNotes.join("\n")
    : "No pieces are currently under direct attack.";
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as TeacherRequestBody;
    const chess = new Chess(body.fen);
    const activeTurnName = chess.turn() === "w" ? "White" : "Black";
    const tacticalDigest = buildTacticalBoardDigest(chess);

    // If previousFen is provided (the student just made a move), extract the student's
    // alternative legal moves from previousFen so they can Undo & Try a better move!
    const studentChess = body.previousFen
      ? new Chess(body.previousFen)
      : chess;
    const studentLegalVerbose = studentChess.moves({ verbose: true });
    const studentLegalMovesSummary = studentLegalVerbose.map(
      (m) => `${m.san} (${m.from}->${m.to})`
    );

    const skillDescription =
      body.skillLevel === "club"
        ? "Intermediate club player looking to sharpen tactics."
        : body.skillLevel === "casual"
          ? "Casual learner who knows basic piece rules but wants gentle guidance."
          : "Complete beginner who is brand new to chess and does not have piece movements or tactics memorized.";

    const hypeTeachingNote = body.hypeCommentatorMode
      ? `CREATOR TEACHING STYLE (GothamChess / Levy Rozman Mode ENABLED): Teach with energetic, entertaining, unforgettable YouTube chess instructor charisma! Use signature teaching phrases naturally when relevant: "Checks, Captures, Attacks!" (the 3-step checklist every player should scan), "Danger Levels!" (when a counter-attack threatens something worth more than the attacked piece), "PP on the PP — Put Pressure on the Pinned Piece!", "Never play f6/f3!", and if a Rook sacrifice or active Rook move appears, celebrate "THE ROOOOOOK!!". Keep it supportive and super clear for a learner!`
      : null;

    const systemInstruction = [
      `Role: Warm, Patient, Beginner-Friendly Interactive Chess Teacher and Coach.`,
      `Student Profile: ${skillDescription}`,
      `Objective: Gently guide the learner as they play. Let them learn from mistakes without feeling overwhelmed. Avoid cryptic chess jargon—always name the pieces (e.g., 'your Knight on f3', 'the Pawn on e4') and explain WHY a move is dangerous or helpful in plain English.`,
      hypeTeachingNote,
      `Takeback & Learning Moment Rule: If the student just made a move that puts their piece in danger for free (hanging piece), walks into a trap, misses an easy capture, or is classified as 'mistake' or 'blunder' (or a risky 'inaccuracy'), set should_suggest_takeback to true, explain the danger gently in mistake_consequence, and provide 2 to 3 better alternative moves from the Student's Legal Moves list in recommended_moves so the student can click 'Undo & Try This Move'.`,
      `If the student's move was good ('opening_book', 'brilliant', 'good') or they asked a general question, set should_suggest_takeback to false and still populate recommended_moves with 2 to 3 great candidate moves for the student to explore.`,
      `Output Requirements: Populate recommended_moves ONLY with legal moves from the provided Student Legal Moves list. Populate visual_highlights and visual_arrows to visually illustrate threats (#D93025 Red or #FA903E Orange) and recommended better moves (#81C995 Mint Green or #1A73E8 Blue) on the 3D chessboard.`,
    ]
      .filter(Boolean)
      .join(" ");

    const inputPrompt = [
      body.previousFen
        ? `Board Position BEFORE Student's Move (FEN): ${body.previousFen}`
        : null,
      body.lastStudentMoveSan
        ? `Student Just Played Move (SAN): ${body.lastStudentMoveSan}`
        : null,
      `Current Board Position AFTER Move (FEN): ${body.fen}`,
      `Side to Move Next: ${activeTurnName}`,
      `In Check Now: ${chess.inCheck()}`,
      body.studentQuestion
        ? `Student Question / Request: "${body.studentQuestion}"`
        : body.lastStudentMoveSan
          ? `Task: Evaluate the student's move "${body.lastStudentMoveSan}". Did it leave any of the student's pieces undefended/hanging, or was it a solid move? If it was a mistake or risky, gently suggest undoing it and trying one of the better moves from the Student Legal Moves list below.`
          : `Task: Show the student 2-3 friendly, easy-to-understand moves they can play right now and explain why each move helps them.`,
      `Deterministic Tactical Attackers Digest on Current Board (from chess.attackers):\n${tacticalDigest}`,
      `Student Legal Moves Available (Select recommended_moves strictly from this list): ${JSON.stringify(studentLegalMovesSummary)}`,
    ]
      .filter(Boolean)
      .join("\n\n");

    let parsedOutput: AiTeacherStructuredOutput;
    let thoughtSummaryText: string | null = null;
    let totalThoughtTokens: number | null = null;
    let latencyMs = 0;
    let interactionId: string;

    if (OPENAI_MODELS.has(body.geminiModel)) {
      const openaiResult =
        await executeOpenAIStructuredResponse<AiTeacherStructuredOutput>({
          model: body.geminiModel as OpenAIModelId,
          thinkingLevel: body.thinkingLevel,
          systemInstruction,
          inputPrompt,
          schemaName: "chess_teacher_coaching",
          jsonSchema: aiTeacherJsonSchema as unknown as Record<string, unknown>,
          previousResponseId: body.previousTeacherInteractionId,
        });
      parsedOutput = openaiResult.parsedOutput;
      thoughtSummaryText = openaiResult.thoughtSummaryText;
      totalThoughtTokens = openaiResult.totalThoughtTokens;
      latencyMs = openaiResult.latencyMs;
      interactionId = openaiResult.responseId;
    } else {
      const geminiResult =
        await executeGeminiStructuredInteraction<AiTeacherStructuredOutput>({
          model: body.geminiModel as GeminiModelId,
          thinkingLevel: body.thinkingLevel,
          systemInstruction,
          inputPrompt,
          jsonSchema: aiTeacherJsonSchema as unknown as Record<string, unknown>,
          previousInteractionId: body.previousTeacherInteractionId,
        });
      parsedOutput = geminiResult.parsedOutput;
      thoughtSummaryText = geminiResult.thoughtSummaryText;
      totalThoughtTokens = geminiResult.totalThoughtTokens;
      latencyMs = geminiResult.latencyMs;
      interactionId = geminiResult.interactionId;
    }

    const validatedLesson = AiTeacherZodSchema.parse(parsedOutput);

    // Ensure recommended_moves have exact from_square / to_square reconciled with studentChess
    const reconciledRecommendations = validatedLesson.recommended_moves
      .map((rm) => {
        const match = studentLegalVerbose.find(
          (m) =>
            m.san === rm.san ||
            (m.from === rm.from_square && m.to === rm.to_square)
        );
        if (!match) return null;
        return {
          san: match.san,
          from_square: String(match.from),
          to_square: String(match.to),
          explanation: rm.explanation,
        };
      })
      .filter(
        (
          item
        ): item is {
          san: string;
          from_square: string;
          to_square: string;
          explanation: string;
        } => item !== null
      );

    validatedLesson.recommended_moves =
      reconciledRecommendations.length > 0
        ? reconciledRecommendations
        : studentLegalVerbose.slice(0, 3).map((m) => ({
            san: m.san,
            from_square: m.from,
            to_square: m.to,
            explanation: `Solid developing move with your ${PIECE_NAMES[m.piece] || "piece"} from ${m.from} to ${m.to}.`,
          }));

    return NextResponse.json({
      lesson: validatedLesson,
      thoughtSummary: thoughtSummaryText,
      thoughtTokens: totalThoughtTokens,
      latencyMs,
      interactionId,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "AI Chess Teacher request failed." },
      { status: 500 }
    );
  }
}
