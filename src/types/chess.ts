// src/types/chess.ts
import { z } from "zod";
import type { Square, PieceSymbol, Color } from "chess.js";

export type GeminiModelId = "gemini-4-argon" | "gemini-3.8-flash";
export type OpenAIModelId = "gpt-5.5" | "gpt-4o" | "gpt-4o-mini";
export type ThinkingLevel = "low" | "medium" | "high";

export type ControllerType = "human" | "gemini" | "openai";

export type CameraViewPreset = "white" | "black" | "top" | "side" | "broadcast";

export type CoachingSkillLevel = "beginner" | "casual" | "club";

export interface SeatConfig {
  color: Color; // 'w' | 'b'
  controller: ControllerType;
  geminiModel: GeminiModelId;
  openaiModel: OpenAIModelId;
  thinkingLevel: ThinkingLevel;
  personaName: string;
  interactionId: string | null; // Stores previous_interaction_id or previous_response_id
}

export type GameMode = "match" | "teacher";
export type MatchStatus = "idle" | "playing" | "paused" | "gameover";

export interface TrackedPiece {
  id: string; // Stable ID across turns, e.g. 'w-p-e2'
  type: PieceSymbol;
  color: Color;
  square: Square;
  captured: boolean;
}

export type MoveClassification =
  | "brilliant"
  | "great"
  | "best"
  | "book"
  | "inaccuracy"
  | "mistake"
  | "blunder";

export interface BoardArrow {
  from: string;
  to: string;
  color: string;
  sequenceIndex?: number;
}

export interface BoardHighlight {
  square: string;
  color: string;
  label: string | null;
}

export interface PendingPromotion {
  from: Square;
  to: Square;
  color: Color;
}

export interface LegalMoveDetail {
  to: Square;
  san: string;
  isCapture: boolean;
  isSafe: boolean;
  enemyAttackersCount: number;
}

export interface InspectedPieceInfo {
  square: Square;
  type: PieceSymbol;
  color: Color;
  name: string;
  movementRule: string;
  specialNote: string | null;
  attackedSquares: Square[];
}

export interface ThoughtLogEntry {
  id: string;
  timestamp: string;
  seatColor: Color | "teacher" | "user";
  modelLabel: string;
  sanMove: string | null;
  thoughtSummary: string | null;
  chatMessage: string;
  positionalEvaluation: number | null;
  tacticalMotif: string | null;
  thoughtTokens: number | null;
  latencyMs: number | null;
  interactionId: string | null;
  expectedReplySan?: string | null;
  wasExpectedReply?: boolean | null;
  noteworthyBadges?: string[];
  moveClassification?: MoveClassification;
}

// Unified Deterministic Command Union
export type ChessCommand =
  | {
      type: "MOVE";
      move: string | { from: string; to: string; promotion?: string };
      source: "human-3d" | "human-cli" | "ai-agent" | "teacher-demo";
      meta?: {
        thoughtSummary?: string | null;
        chatMessage?: string;
        positionalEvaluation?: number;
        tacticalMotif?: string;
        thoughtTokens?: number | null;
        latencyMs?: number;
        interactionId?: string;
        modelLabel?: string;
        expectedReplySan?: string | null;
      };
    }
  | { type: "UNDO" }
  | { type: "RESET" }
  | { type: "LOAD_FEN"; fen: string }
  | { type: "SET_ANNOTATIONS"; arrows: BoardArrow[]; highlights: BoardHighlight[] };

// JSON Schema for AI Opponent Move Generation (Compatible with Gemini Interactions API & OpenAI Strict Mode)
export const aiMoveJsonSchema = {
  type: "object",
  properties: {
    selected_move_san: {
      type: "string",
      description: "The chosen legal move in exact Standard Algebraic Notation (SAN) from the provided legal_moves list.",
    },
    from_square: {
      type: "string",
      description: "Origin algebraic square (e.g., 'e2').",
    },
    to_square: {
      type: "string",
      description: "Destination algebraic square (e.g., 'e4').",
    },
    positional_evaluation_cp: {
      type: "number",
      description: "Estimated evaluation in pawns from White's perspective (e.g., +0.75 favors White, -1.20 favors Black).",
    },
    tactical_justification: {
      type: "string",
      description: "Concise tactical or strategic explanation of why this move was chosen.",
    },
    table_talk_message: {
      type: "string",
      description: "Interactive in-character message for the live match chat log.",
    },
    expected_opponent_reply_san: {
      type: ["string", "null"],
      description: "The primary move expected from the opponent on the next turn, or null if game over.",
    },
  },
  required: [
    "selected_move_san",
    "from_square",
    "to_square",
    "positional_evaluation_cp",
    "tactical_justification",
    "table_talk_message",
    "expected_opponent_reply_san",
  ],
  additionalProperties: false,
} as const;

export const AiMoveZodSchema = z.object({
  selected_move_san: z.string(),
  from_square: z.string(),
  to_square: z.string(),
  positional_evaluation_cp: z.number(),
  tactical_justification: z.string(),
  table_talk_message: z.string(),
  expected_opponent_reply_san: z.string().nullable(),
});

export type AiMoveStructuredOutput = z.infer<typeof AiMoveZodSchema>;

// JSON Schema for AI Chess Teacher Mode
export const aiTeacherJsonSchema = {
  type: "object",
  properties: {
    last_move_assessment: {
      type: "string",
      enum: ["opening_book", "brilliant", "good", "inaccuracy", "mistake", "blunder", "question_response"],
      description: "Pedagogical classification of the student's last move or current query.",
    },
    should_suggest_takeback: {
      type: "boolean",
      description: "Set to true if the student's move was a mistake, blunder, or dangerous inaccuracy where they should be offered to undo and try a better move before the opponent replies.",
    },
    mistake_consequence: {
      type: ["string", "null"],
      description: "If should_suggest_takeback is true, a gentle plain-English explanation of what danger or capture the move allows (e.g. 'Black's Bishop on c5 can now capture your undefended Knight on f2'). Otherwise null.",
    },
    coaching_explanation: {
      type: "string",
      description: "Clear, warm, beginner-friendly explanation of the current board state, threats, and strategic principles without heavy chess jargon.",
    },
    concept_taught: {
      type: "string",
      description: "Name of the primary chess concept highlighted (e.g., 'Protecting Hanging Pieces', 'Center Control', 'King Safety').",
    },
    recommended_moves: {
      type: "array",
      items: {
        type: "object",
        properties: {
          san: { type: "string", description: "Legal move for the student in SAN format." },
          from_square: { type: "string", description: "Origin square." },
          to_square: { type: "string", description: "Target square." },
          explanation: { type: "string", description: "Plain-English reason why this move is safe and strong for the student." },
        },
        required: ["san", "from_square", "to_square", "explanation"],
        additionalProperties: false,
      },
    },
    visual_highlights: {
      type: "array",
      items: {
        type: "object",
        properties: {
          square: { type: "string", description: "Algebraic square to highlight in 3D (e.g., 'f7')." },
          color: { type: "string", enum: ["#1A73E8", "#81C995", "#FA903E", "#D93025"] },
          label: { type: ["string", "null"], description: "Short badge text." },
        },
        required: ["square", "color", "label"],
        additionalProperties: false,
      },
    },
    visual_arrows: {
      type: "array",
      items: {
        type: "object",
        properties: {
          from: { type: "string", description: "Arrow start square." },
          to: { type: "string", description: "Arrow end square." },
          color: { type: "string", enum: ["#1A73E8", "#81C995", "#FA903E", "#D93025"] },
        },
        required: ["from", "to", "color"],
        additionalProperties: false,
      },
    },
  },
  required: [
    "last_move_assessment",
    "should_suggest_takeback",
    "mistake_consequence",
    "coaching_explanation",
    "concept_taught",
    "recommended_moves",
    "visual_highlights",
    "visual_arrows",
  ],
  additionalProperties: false,
} as const;

export const AiTeacherZodSchema = z.object({
  last_move_assessment: z.enum([
    "opening_book",
    "brilliant",
    "good",
    "inaccuracy",
    "mistake",
    "blunder",
    "question_response",
  ]),
  should_suggest_takeback: z.boolean(),
  mistake_consequence: z.string().nullable(),
  coaching_explanation: z.string(),
  concept_taught: z.string(),
  recommended_moves: z.array(
    z.object({
      san: z.string(),
      from_square: z.string(),
      to_square: z.string(),
      explanation: z.string(),
    })
  ),
  visual_highlights: z.array(
    z.object({
      square: z.string(),
      color: z.enum(["#1A73E8", "#81C995", "#FA903E", "#D93025"]),
      label: z.string().nullable(),
    })
  ),
  visual_arrows: z.array(
    z.object({
      from: z.string(),
      to: z.string(),
      color: z.enum(["#1A73E8", "#81C995", "#FA903E", "#D93025"]),
    })
  ),
});

export type AiTeacherStructuredOutput = z.infer<typeof AiTeacherZodSchema>;
