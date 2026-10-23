// src/store/useChessStore.ts
import { create } from "zustand";
import { Chess, type Color, type PieceSymbol, type Square } from "chess.js";
import type {
  AiTeacherStructuredOutput,
  BoardArrow,
  BoardHighlight,
  CameraViewPreset,
  ChessCommand,
  CoachingSkillLevel,
  GameMode,
  GeminiModelId,
  InspectedPieceInfo,
  LegalMoveDetail,
  MatchStatus,
  OpenAIModelId,
  PendingPromotion,
  SeatConfig,
  ThinkingLevel,
  ThoughtLogEntry,
  TrackedPiece,
} from "@/types/chess";
import {
  computeBoardAnalytics,
  computeMultiStepContinuation,
  detectMoveNoteworthyEvents,
  type BoardAnalyticsReport,
  type MoveTelemetrySnapshot,
  type NoteworthyEvent,
} from "@/lib/chess-analytics";

const PIECE_GUIDE: Record<
  PieceSymbol,
  { name: string; movementRule: string }
> = {
  p: {
    name: "Pawn",
    movementRule:
      "Moves 1 square straight forward (or 2 squares on its very first move). Captures 1 square diagonally forward. Promotes to a Queen if it reaches the far side!",
  },
  n: {
    name: "Knight",
    movementRule:
      "Moves in an 'L' shape: 2 squares in one direction and then 1 square to the side. The ONLY piece that can jump over other pieces!",
  },
  b: {
    name: "Bishop",
    movementRule:
      "Glides diagonally any number of open squares. Each Bishop stays on its starting square color (light or dark) for the entire game.",
  },
  r: {
    name: "Rook",
    movementRule:
      "Glides straight horizontally (across ranks) or vertically (up and down files) any number of open squares. Very powerful on open lines!",
  },
  q: {
    name: "Queen",
    movementRule:
      "The most powerful piece! Combines the Rook and Bishop—glides straight or diagonally any number of open squares in any direction.",
  },
  k: {
    name: "King",
    movementRule:
      "Moves 1 square in any direction. Must be protected at all times—he can never move onto a square that an enemy piece is attacking!",
  },
};

const ALL_SQUARES: Square[] = [];
const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];
const RANKS = ["1", "2", "3", "4", "5", "6", "7", "8"];
for (const r of RANKS) {
  for (const f of FILES) {
    ALL_SQUARES.push(`${f}${r}` as Square);
  }
}

function createInitialTrackedPieces(chess: Chess): TrackedPiece[] {
  const board = chess.board();
  const pieces: TrackedPiece[] = [];
  for (const row of board) {
    for (const cell of row) {
      if (cell) {
        pieces.push({
          id: `${cell.color}-${cell.type}-${cell.square}`,
          type: cell.type,
          color: cell.color,
          square: cell.square as Square,
          captured: false,
        });
      }
    }
  }
  return pieces;
}

function computeThreatenedSquares(chess: Chess, playerColor: Color): Square[] {
  const enemyColor: Color = playerColor === "w" ? "b" : "w";
  const board = chess.board();
  const threatened: Square[] = [];
  for (const row of board) {
    for (const cell of row) {
      if (cell && cell.color === playerColor) {
        const sq = cell.square as Square;
        const attackers = chess.attackers(sq, enemyColor);
        if (attackers.length > 0) {
          threatened.push(sq);
        }
      }
    }
  }
  return threatened;
}

function computeLegalMoveDetails(
  chess: Chess,
  fromSquare: Square
): LegalMoveDetail[] {
  const verboseMoves = chess.moves({ square: fromSquare, verbose: true });
  return verboseMoves.map((m) => {
    const simChess = new Chess(chess.fen());
    simChess.move({ from: m.from, to: m.to, promotion: m.promotion || "q" });
    const enemyColor: Color = m.color === "w" ? "b" : "w";
    const enemyAttackers = simChess.attackers(m.to as Square, enemyColor);
    return {
      to: m.to as Square,
      san: m.san,
      isCapture: Boolean(m.captured),
      isSafe: enemyAttackers.length === 0,
      enemyAttackersCount: enemyAttackers.length,
    };
  });
}

function buildInspectedPieceInfo(
  chess: Chess,
  square: Square,
  legalDetails: LegalMoveDetail[]
): InspectedPieceInfo | null {
  const piece = chess.get(square);
  if (!piece) return null;

  const guide = PIECE_GUIDE[piece.type];
  // Find all squares this piece currently attacks
  const attackedSquares = ALL_SQUARES.filter((targetSq) => {
    const attackers = chess.attackers(targetSq, piece.color);
    return attackers.includes(square);
  });

  let specialNote: string | null = null;
  if (piece.color === chess.turn()) {
    if (legalDetails.length === 0) {
      specialNote = chess.inCheck()
        ? "Your King is in CHECK! This piece cannot resolve the check right now—try moving your King or blocking/capturing the attacker."
        : "This piece has no open moves right now (it is either blocked by your own pieces or pinned protecting your King).";
    } else {
      const safeCount = legalDetails.filter((d) => d.isSafe).length;
      const riskyCount = legalDetails.length - safeCount;
      const captureCount = legalDetails.filter((d) => d.isCapture).length;
      const parts: string[] = [
        `${safeCount} safe move${safeCount === 1 ? "" : "s"} (green rings)`,
      ];
      if (captureCount > 0) {
        parts.push(
          `${captureCount} capture${captureCount === 1 ? "" : "s"} available`
        );
      }
      if (riskyCount > 0) {
        parts.push(
          `${riskyCount} risky square${riskyCount === 1 ? "" : "s"} watched by enemy (amber warning rings)`
        );
      }
      specialNote = parts.join(" • ");
    }
  } else {
    specialNote = `Opponent's ${guide.name}: Currently aiming at ${attackedSquares.length} square${attackedSquares.length === 1 ? "" : "s"} (shown in rose on the board).`;
  }

  return {
    square,
    type: piece.type,
    color: piece.color,
    name: guide.name,
    movementRule: guide.movementRule,
    specialNote,
    attackedSquares,
  };
}

interface ChessStoreState {
  chess: Chess;
  fen: string;
  lastHumanPreMoveFen: string | null;
  pgn: string;
  turn: "w" | "b";
  inCheck: boolean;
  isGameOver: boolean;
  gameResultText: string | null;
  moveHistorySan: string[];
  trackedPieces: TrackedPiece[];
  selectedSquare: Square | null;
  legalDestinationsForSelected: Square[];
  legalMoveDetailsForSelected: LegalMoveDetail[];
  inspectedPiece: InspectedPieceInfo | null;
  threatenedPlayerSquares: Square[];
  showBeginnerHelpers: boolean;
  skillLevel: CoachingSkillLevel;
  awaitingTakebackDecision: boolean;
  pendingPromotion: PendingPromotion | null;
  cameraPreset: CameraViewPreset;
  apiError: string | null;
  gameMode: GameMode;
  matchStatus: MatchStatus;
  sessionId: number;
  aiDelayMs: number;
  isAiThinking: boolean;
  whiteSeat: SeatConfig;
  blackSeat: SeatConfig;
  teacherModel: GeminiModelId | OpenAIModelId;
  teacherThinkingLevel: ThinkingLevel;
  teacherInteractionId: string | null;
  activeLesson: AiTeacherStructuredOutput | null;
  isTeacherLoading: boolean;
  boardArrows: BoardArrow[];
  boardHighlights: BoardHighlight[];
  thoughtLogs: ThoughtLogEntry[];
  boardAnalytics: BoardAnalyticsReport;
  telemetryHistory: MoveTelemetrySnapshot[];
  noteworthyEvents: NoteworthyEvent[];
  showBoardHeatmap: boolean;
  telestratorMode: boolean;
  telestratorColor: string;
  telestratorAnchorSquare: Square | null;
  hypeCommentatorMode: boolean;

  // Actions
  dispatchCommand: (command: ChessCommand) => boolean;
  selectSquare: (square: Square) => void;
  completePromotion: (piece: PieceSymbol) => void;
  cancelPromotion: () => void;
  setCameraPreset: (preset: CameraViewPreset) => void;
  setShowBeginnerHelpers: (show: boolean) => void;
  setShowBoardHeatmap: (show: boolean) => void;
  setTelestratorMode: (enabled: boolean) => void;
  setTelestratorColor: (color: string) => void;
  clearBoardAnnotations: () => void;
  visualizeMultiStepLine: () => string;
  setHypeCommentatorMode: (enabled: boolean) => void;
  setSkillLevel: (level: CoachingSkillLevel) => void;
  tryTeacherRecommendedMove: (san: string) => void;
  undoMistakeAndRetry: () => void;
  keepMoveAndContinue: () => void;
  rewindFromGameOver: () => void;
  clearApiError: () => void;
  setSeatConfig: (color: "w" | "b", partial: Partial<SeatConfig>) => void;
  setGameMode: (mode: GameMode) => void;
  setMatchStatus: (status: MatchStatus) => void;
  setAiDelayMs: (ms: number) => void;
  setTeacherConfig: (
    model: GeminiModelId | OpenAIModelId,
    level: ThinkingLevel
  ) => void;
  startSpectatorShowcase: (
    preset?: "gemini-duel" | "cross-vendor" | "openai-duel" | "blitz"
  ) => void;
  requestAiTurn: (customUserMessage?: string) => Promise<void>;
  requestTeacherCoaching: (
    studentQuestion?: string,
    overridePreMoveFen?: string | null
  ) => Promise<void>;
}

const initialChess = new Chess();

export const useChessStore = create<ChessStoreState>((set, get) => ({
  chess: initialChess,
  fen: initialChess.fen(),
  lastHumanPreMoveFen: null,
  pgn: initialChess.pgn(),
  turn: "w",
  inCheck: false,
  isGameOver: false,
  gameResultText: null,
  moveHistorySan: [],
  trackedPieces: createInitialTrackedPieces(initialChess),
  selectedSquare: null,
  legalDestinationsForSelected: [],
  legalMoveDetailsForSelected: [],
  inspectedPiece: null,
  threatenedPlayerSquares: [],
  showBeginnerHelpers: true,
  skillLevel: "beginner",
  awaitingTakebackDecision: false,
  pendingPromotion: null,
  cameraPreset: "white",
  apiError: null,
  gameMode: "teacher",
  matchStatus: "idle",
  sessionId: 1,
  aiDelayMs: 600,
  isAiThinking: false,
  whiteSeat: {
    color: "w",
    controller: "human",
    geminiModel: "gemini-3.8-flash",
    openaiModel: "gpt-5.5",
    thinkingLevel: "medium",
    personaName: "White Player",
    interactionId: null,
  },
  blackSeat: {
    color: "b",
    controller: "gemini",
    geminiModel: "gemini-3.8-flash",
    openaiModel: "gpt-5.5",
    thinkingLevel: "low",
    personaName: "Gentle Coach Partner",
    interactionId: null,
  },
  teacherModel: "gemini-4-argon",
  teacherThinkingLevel: "medium",
  teacherInteractionId: null,
  activeLesson: null,
  isTeacherLoading: false,
  boardArrows: [],
  boardHighlights: [],
  thoughtLogs: [],
  boardAnalytics: computeBoardAnalytics(initialChess, [], 0),
  telemetryHistory: [],
  noteworthyEvents: [],
  showBoardHeatmap: false,
  telestratorMode: false,
  telestratorColor: "#10B981",
  telestratorAnchorSquare: null,
  hypeCommentatorMode: true,

  dispatchCommand: (command: ChessCommand) => {
    const state = get();
    const { chess } = state;

    if (command.type === "RESET") {
      const freshChess = new Chess();
      set({
        chess: freshChess,
        fen: freshChess.fen(),
        lastHumanPreMoveFen: null,
        pgn: "",
        turn: "w",
        inCheck: false,
        isGameOver: false,
        gameResultText: null,
        moveHistorySan: [],
        trackedPieces: createInitialTrackedPieces(freshChess),
        selectedSquare: null,
        legalDestinationsForSelected: [],
        legalMoveDetailsForSelected: [],
        inspectedPiece: null,
        threatenedPlayerSquares: [],
        awaitingTakebackDecision: false,
        pendingPromotion: null,
        apiError: null,
        matchStatus: "idle",
        sessionId: state.sessionId + 1,
        isAiThinking: false,
        whiteSeat: { ...state.whiteSeat, interactionId: null },
        blackSeat: { ...state.blackSeat, interactionId: null },
        teacherInteractionId: null,
        activeLesson: null,
        boardArrows: [],
        boardHighlights: [],
        thoughtLogs: [],
        boardAnalytics: computeBoardAnalytics(freshChess, [], 0),
        telemetryHistory: [],
        noteworthyEvents: [],
      });
      return true;
    }

    if (command.type === "LOAD_FEN") {
      try {
        const customChess = new Chess(command.fen);
        const hist = customChess.history();
        set({
          chess: customChess,
          fen: customChess.fen(),
          lastHumanPreMoveFen: null,
          pgn: customChess.pgn(),
          turn: customChess.turn(),
          inCheck: customChess.inCheck(),
          isGameOver: customChess.isGameOver(),
          gameResultText: null,
          moveHistorySan: hist,
          trackedPieces: createInitialTrackedPieces(customChess),
          selectedSquare: null,
          legalDestinationsForSelected: [],
          legalMoveDetailsForSelected: [],
          inspectedPiece: null,
          threatenedPlayerSquares: computeThreatenedSquares(customChess, "w"),
          awaitingTakebackDecision: false,
          pendingPromotion: null,
          apiError: null,
          sessionId: state.sessionId + 1,
          boardArrows: [],
          boardHighlights: [],
          boardAnalytics: computeBoardAnalytics(customChess, hist, null),
          telemetryHistory: [],
          noteworthyEvents: [],
        });
        return true;
      } catch {
        return false;
      }
    }

    if (command.type === "UNDO") {
      const undone = chess.undo();
      if (!undone) return false;
      const nextHistory = chess.history();
      const nextTelemetry = state.telemetryHistory.slice(0, nextHistory.length);
      const latestEval =
        nextTelemetry.length > 0
          ? nextTelemetry[nextTelemetry.length - 1].evaluationCp
          : 0;
      set({
        fen: chess.fen(),
        pgn: chess.pgn(),
        turn: chess.turn(),
        inCheck: chess.inCheck(),
        isGameOver: chess.isGameOver(),
        gameResultText: null,
        moveHistorySan: nextHistory,
        trackedPieces: createInitialTrackedPieces(chess),
        selectedSquare: null,
        legalDestinationsForSelected: [],
        legalMoveDetailsForSelected: [],
        inspectedPiece: null,
        threatenedPlayerSquares: computeThreatenedSquares(chess, "w"),
        awaitingTakebackDecision: false,
        pendingPromotion: null,
        boardArrows: [],
        boardHighlights: [],
        boardAnalytics: computeBoardAnalytics(chess, nextHistory, latestEval),
        telemetryHistory: nextTelemetry,
        noteworthyEvents: state.noteworthyEvents.filter(
          (ev) => ev.ply <= nextHistory.length
        ),
      });
      return true;
    }

    if (command.type === "SET_ANNOTATIONS") {
      set({
        boardArrows: command.arrows,
        boardHighlights: command.highlights,
      });
      return true;
    }

    if (command.type === "MOVE") {
      if (chess.isGameOver()) return false;

      const preMoveFen = chess.fen();
      const prevEvalCp = state.boardAnalytics.evaluationCp;
      const hadPriorCaptures = state.trackedPieces.some((p) => p.captured);
      const previousExpectedReplySan =
        state.telemetryHistory.length > 0
          ? state.telemetryHistory[state.telemetryHistory.length - 1]
              .expectedReplySan
          : null;

      let executedMove = null;
      try {
        executedMove = chess.move(command.move);
      } catch {
        return false;
      }
      if (!executedMove) return false;

      // Reconcile persistent TrackedPiece coordinates for smooth 3D R3F interpolation
      const updatedPieces = state.trackedPieces.map((p) => ({ ...p }));

      // Handle captures (standard and en passant)
      if (executedMove.captured) {
        let captureSquare = executedMove.to as Square;
        if (executedMove.flags.includes("e")) {
          const epRank = executedMove.color === "w" ? "5" : "4";
          captureSquare = `${executedMove.to[0]}${epRank}` as Square;
        }
        const victim = updatedPieces.find(
          (p) => !p.captured && p.square === captureSquare
        );
        if (victim) victim.captured = true;
      }

      // Move active piece
      const mover = updatedPieces.find(
        (p) => !p.captured && p.square === executedMove.from
      );
      if (mover) {
        mover.square = executedMove.to as Square;
        if (executedMove.promotion) {
          mover.type = executedMove.promotion;
        }
      }

      // Handle castling rook movement
      if (executedMove.flags.includes("k")) {
        const rank = executedMove.color === "w" ? "1" : "8";
        const rook = updatedPieces.find(
          (p) => !p.captured && p.square === (`h${rank}` as Square)
        );
        if (rook) rook.square = `f${rank}` as Square;
      } else if (executedMove.flags.includes("q")) {
        const rank = executedMove.color === "w" ? "1" : "8";
        const rook = updatedPieces.find(
          (p) => !p.captured && p.square === (`a${rank}` as Square)
        );
        if (rook) rook.square = `d${rank}` as Square;
      }

      const isOver = chess.isGameOver();
      let resultText: string | null = null;
      if (isOver) {
        if (chess.isCheckmate()) {
          resultText = `Checkmate! ${executedMove.color === "w" ? "White" : "Black"} wins.`;
        } else if (chess.isStalemate()) {
          resultText = "Draw by Stalemate.";
        } else if (chess.isThreefoldRepetition()) {
          resultText = "Draw by Threefold Repetition.";
        } else if (chess.isInsufficientMaterial()) {
          resultText = "Draw by Insufficient Material.";
        } else {
          resultText = "Game Drawn.";
        }
      }

      const nextMoveHistorySan = chess.history();
      const ply = nextMoveHistorySan.length;
      const moveNumber = Math.ceil(ply / 2);

      // Compute updated board analytics & noteworthy spectator highlights
      const nextAnalytics = computeBoardAnalytics(
        chess,
        nextMoveHistorySan,
        command.meta?.positionalEvaluation ?? null
      );

      const {
        events: detectedEvents,
        wasExpectedReply,
        classification,
      } = detectMoveNoteworthyEvents({
        preMoveFen,
        postMoveChess: chess,
        executedMove,
        ply,
        prevEvalCp,
        newEvalCp: nextAnalytics.evaluationCp,
        previousExpectedReplySan,
        hadPriorCaptures,
      });

      const pieceLabel = PIECE_GUIDE[executedMove.piece]?.name || "Piece";
      const resolvedModelLabel = command.meta
        ? command.meta.modelLabel ||
          (executedMove.color === "w" ? "White" : "Black")
        : command.source === "teacher-demo"
          ? `Coach Suggested Move (${executedMove.color === "w" ? "White" : "Black"})`
          : `Learner (${executedMove.color === "w" ? "White" : "Black"})`;

      const resolvedChatMessage = command.meta
        ? command.meta.chatMessage || `Played ${executedMove.san}`
        : `${pieceLabel} moved from ${executedMove.from} to ${executedMove.to} (${executedMove.san})`;

      const telemetryEntry: MoveTelemetrySnapshot = {
        ply,
        moveNumber,
        color: executedMove.color,
        san: executedMove.san,
        from: executedMove.from,
        to: executedMove.to,
        evaluationCp: nextAnalytics.evaluationCp,
        whiteWinProb: nextAnalytics.whiteWinProb,
        expectedReplySan: command.meta?.expectedReplySan ?? null,
        wasExpectedReply,
        classification,
        tacticalMotif: command.meta?.tacticalMotif ?? null,
        chatMessage: resolvedChatMessage,
        modelLabel: resolvedModelLabel,
        latencyMs: command.meta?.latencyMs ?? null,
        thoughtTokens: command.meta?.thoughtTokens ?? null,
        events: detectedEvents,
      };

      // Update interactionId for the seat that just moved and append thought log
      const newLogs = [...state.thoughtLogs];
      let nextWhiteSeat = state.whiteSeat;
      let nextBlackSeat = state.blackSeat;

      if (command.meta) {
        if (executedMove.color === "w" && command.meta.interactionId) {
          nextWhiteSeat = {
            ...state.whiteSeat,
            interactionId: command.meta.interactionId,
          };
        } else if (executedMove.color === "b" && command.meta.interactionId) {
          nextBlackSeat = {
            ...state.blackSeat,
            interactionId: command.meta.interactionId,
          };
        }
      }

      newLogs.unshift({
        id: `${Date.now()}-${Math.random()}`,
        timestamp: new Date().toLocaleTimeString(),
        seatColor: executedMove.color,
        modelLabel: resolvedModelLabel,
        sanMove: executedMove.san,
        thoughtSummary: command.meta?.thoughtSummary || null,
        chatMessage: resolvedChatMessage,
        positionalEvaluation: nextAnalytics.evaluationCp,
        tacticalMotif: command.meta?.tacticalMotif ?? null,
        thoughtTokens: command.meta?.thoughtTokens ?? null,
        latencyMs: command.meta?.latencyMs ?? null,
        interactionId: command.meta?.interactionId ?? null,
        expectedReplySan: command.meta?.expectedReplySan ?? null,
        wasExpectedReply,
        noteworthyBadges: detectedEvents.map((e) => e.badge),
        moveClassification: classification,
      });

      const isHumanMove = command.source.startsWith("human");

      set({
        fen: chess.fen(),
        lastHumanPreMoveFen: isHumanMove
          ? preMoveFen
          : state.lastHumanPreMoveFen,
        pgn: chess.pgn(),
        turn: chess.turn(),
        inCheck: chess.inCheck(),
        isGameOver: isOver,
        gameResultText: resultText,
        moveHistorySan: nextMoveHistorySan,
        trackedPieces: updatedPieces,
        selectedSquare: null,
        legalDestinationsForSelected: [],
        legalMoveDetailsForSelected: [],
        inspectedPiece: null,
        threatenedPlayerSquares: computeThreatenedSquares(chess, "w"),
        awaitingTakebackDecision: false,
        pendingPromotion: null,
        telestratorAnchorSquare: null,
        whiteSeat: nextWhiteSeat,
        blackSeat: nextBlackSeat,
        thoughtLogs: newLogs,
        boardAnalytics: nextAnalytics,
        telemetryHistory: [...state.telemetryHistory, telemetryEntry],
        noteworthyEvents: [...detectedEvents, ...state.noteworthyEvents],
        matchStatus: isOver ? "gameover" : state.matchStatus,
        boardArrows: [
          {
            from: executedMove.from,
            to: executedMove.to,
            color: executedMove.color === "w" ? "#1A73E8" : "#FA903E",
          },
        ],
        boardHighlights: [],
      });

      // In Teacher Mode:
      // 1) If the human made a move, first ask the AI Teacher to review it!
      //    If it's a mistake/blunder, the Teacher pauses so the human can Undo & Try a better move.
      //    If it's a good move, the Teacher praises it and then triggers the gentle sparring reply!
      // 2) If the human clicked a Teacher-recommended demo move ("Undo & Try Move"),
      //    and it's now the AI sparring partner's turn, schedule the gentle sparring reply!
      if (state.gameMode === "teacher") {
        if (isHumanMove) {
          setTimeout(() => {
            get().requestTeacherCoaching(undefined, preMoveFen);
          }, 150);
        } else if (
          command.source === "teacher-demo" &&
          !isOver &&
          chess.turn() === "b" &&
          get().blackSeat.controller !== "human"
        ) {
          setTimeout(() => {
            get().requestAiTurn();
          }, 650);
        }
      }

      return true;
    }

    return false;
  },

  selectSquare: (square: Square) => {
    const state = get();

    // Streamer Telestrator Mode: click 1st square + 2nd square to draw numbered arrow, or click same square twice to highlight!
    if (state.telestratorMode) {
      if (!state.telestratorAnchorSquare) {
        set({ telestratorAnchorSquare: square });
        return;
      }
      if (state.telestratorAnchorSquare === square) {
        const exists = state.boardHighlights.some((h) => h.square === square);
        const nextHighlights: BoardHighlight[] = exists
          ? state.boardHighlights.filter((h) => h.square !== square)
          : [
              ...state.boardHighlights,
              { square, color: state.telestratorColor, label: null },
            ];
        set({
          boardHighlights: nextHighlights,
          telestratorAnchorSquare: null,
        });
        return;
      }
      const from = state.telestratorAnchorSquare;
      const to = square;
      const exists = state.boardArrows.some(
        (a) => a.from === from && a.to === to
      );
      const nextArrows = exists
        ? state.boardArrows.filter((a) => !(a.from === from && a.to === to))
        : [
            ...state.boardArrows,
            {
              from,
              to,
              color: state.telestratorColor,
              sequenceIndex: state.boardArrows.length + 1,
            },
          ];
      set({
        boardArrows: nextArrows,
        telestratorAnchorSquare: null,
      });
      return;
    }

    const { chess, selectedSquare, legalDestinationsForSelected } = state;

    if (selectedSquare && legalDestinationsForSelected.includes(square)) {
      const movingPiece = chess.get(selectedSquare);
      const isPromotion =
        movingPiece?.type === "p" &&
        ((movingPiece.color === "w" && square[1] === "8") ||
          (movingPiece.color === "b" && square[1] === "1"));

      if (isPromotion) {
        set({
          pendingPromotion: {
            from: selectedSquare,
            to: square,
            color: movingPiece.color,
          },
        });
        return;
      }

      const success = state.dispatchCommand({
        type: "MOVE",
        move: { from: selectedSquare, to: square, promotion: "q" },
        source: "human-3d",
      });
      if (success) return;
    }

    const pieceOnSquare = chess.get(square);
    if (pieceOnSquare && pieceOnSquare.color === chess.turn()) {
      const details = computeLegalMoveDetails(chess, square);
      const inspected = buildInspectedPieceInfo(chess, square, details);
      set({
        selectedSquare: square,
        legalDestinationsForSelected: details.map((d) => d.to),
        legalMoveDetailsForSelected: details,
        inspectedPiece: inspected,
        pendingPromotion: null,
      });
    } else if (pieceOnSquare) {
      // Clicked an opponent's piece! Show beginner guide & which squares that enemy piece attacks
      const inspected = buildInspectedPieceInfo(chess, square, []);
      set({
        selectedSquare: null,
        legalDestinationsForSelected: [],
        legalMoveDetailsForSelected: [],
        inspectedPiece: inspected,
        pendingPromotion: null,
      });
    } else {
      set({
        selectedSquare: null,
        legalDestinationsForSelected: [],
        legalMoveDetailsForSelected: [],
        inspectedPiece: null,
        pendingPromotion: null,
      });
    }
  },

  completePromotion: (piece: PieceSymbol) => {
    const { pendingPromotion, dispatchCommand } = get();
    if (!pendingPromotion) return;
    dispatchCommand({
      type: "MOVE",
      move: {
        from: pendingPromotion.from,
        to: pendingPromotion.to,
        promotion: piece,
      },
      source: "human-3d",
    });
  },

  cancelPromotion: () => set({ pendingPromotion: null }),

  setCameraPreset: (preset) => set({ cameraPreset: preset }),
  setShowBeginnerHelpers: (show) => set({ showBeginnerHelpers: show }),
  setShowBoardHeatmap: (show) => set({ showBoardHeatmap: show }),
  setSkillLevel: (level) => set({ skillLevel: level }),
  setTelestratorMode: (enabled) =>
    set({
      telestratorMode: enabled,
      telestratorAnchorSquare: null,
      selectedSquare: null,
      legalDestinationsForSelected: [],
      legalMoveDetailsForSelected: [],
    }),
  setTelestratorColor: (color) => set({ telestratorColor: color }),
  clearBoardAnnotations: () =>
    set({
      boardArrows: [],
      boardHighlights: [],
      telestratorAnchorSquare: null,
    }),
  visualizeMultiStepLine: () => {
    const state = get();
    const lastEntry =
      state.telemetryHistory.length > 0
        ? state.telemetryHistory[state.telemetryHistory.length - 1]
        : null;
    const { arrows, summaryText } = computeMultiStepContinuation(
      state.fen,
      lastEntry ? { from: lastEntry.from, to: lastEntry.to } : null,
      lastEntry?.expectedReplySan ?? null
    );
    const highlights: BoardHighlight[] = arrows.map((a) => ({
      square: a.to,
      color: a.color,
      label: a.sequenceIndex ? `Step ${a.sequenceIndex}` : null,
    }));
    set({
      boardArrows: arrows,
      boardHighlights: highlights,
      telestratorAnchorSquare: null,
    });
    return summaryText;
  },
  setHypeCommentatorMode: (enabled) => set({ hypeCommentatorMode: enabled }),

  tryTeacherRecommendedMove: (san: string) => {
    const state = get();
    // If the student just played a move and it is now Black's turn (or awaiting takeback),
    // automatically undo the student's mistake first, then play the better move!
    if (state.turn === "b" && state.moveHistorySan.length > 0) {
      state.dispatchCommand({ type: "UNDO" });
    }
    get().dispatchCommand({
      type: "MOVE",
      move: san,
      source: "teacher-demo",
    });
  },

  undoMistakeAndRetry: () => {
    const state = get();
    const lesson = state.activeLesson;
    if (state.turn === "b" && state.moveHistorySan.length > 0) {
      state.dispatchCommand({ type: "UNDO" });
    }
    // Highlight the Teacher's recommended better moves on the 3D board so the student can see & click them
    if (lesson && lesson.recommended_moves.length > 0) {
      const greenArrows: BoardArrow[] = lesson.recommended_moves.map((rm) => ({
        from: rm.from_square,
        to: rm.to_square,
        color: "#81C995",
      }));
      const greenHighlights: BoardHighlight[] = lesson.recommended_moves.map(
        (rm) => ({
          square: rm.to_square,
          color: "#81C995",
          label: `Try ${rm.san}`,
        })
      );
      set({
        awaitingTakebackDecision: false,
        boardArrows: greenArrows,
        boardHighlights: greenHighlights,
      });
    }
  },

  keepMoveAndContinue: () => {
    set({ awaitingTakebackDecision: false });
    const state = get();
    if (
      state.gameMode === "teacher" &&
      !state.isGameOver &&
      state.turn === "b" &&
      state.blackSeat.controller !== "human"
    ) {
      state.requestAiTurn();
    }
  },

  rewindFromGameOver: () => {
    const state = get();
    // Undo the checkmating/ending ply (and one more ply if needed to return to White's turn)
    state.chess.undo();
    if (state.chess.turn() === "b" && state.chess.history().length > 0) {
      state.chess.undo();
    }
    const nextHist = state.chess.history();
    const nextTelemetry = state.telemetryHistory.slice(0, nextHist.length);
    const latestEval =
      nextTelemetry.length > 0
        ? nextTelemetry[nextTelemetry.length - 1].evaluationCp
        : 0;
    set({
      fen: state.chess.fen(),
      pgn: state.chess.pgn(),
      turn: state.chess.turn(),
      inCheck: state.chess.inCheck(),
      isGameOver: state.chess.isGameOver(),
      gameResultText: null,
      moveHistorySan: nextHist,
      trackedPieces: createInitialTrackedPieces(state.chess),
      selectedSquare: null,
      legalDestinationsForSelected: [],
      legalMoveDetailsForSelected: [],
      inspectedPiece: null,
      threatenedPlayerSquares: computeThreatenedSquares(state.chess, "w"),
      awaitingTakebackDecision: false,
      matchStatus: "idle",
      boardArrows: [],
      boardHighlights: [],
      boardAnalytics: computeBoardAnalytics(state.chess, nextHist, latestEval),
      telemetryHistory: nextTelemetry,
      noteworthyEvents: state.noteworthyEvents.filter(
        (ev) => ev.ply <= nextHist.length
      ),
    });
  },

  clearApiError: () => set({ apiError: null }),

  setSeatConfig: (color, partial) => {
    set((state) => ({
      whiteSeat:
        color === "w" ? { ...state.whiteSeat, ...partial } : state.whiteSeat,
      blackSeat:
        color === "b" ? { ...state.blackSeat, ...partial } : state.blackSeat,
    }));
  },

  setGameMode: (mode) => set({ gameMode: mode }),
  setMatchStatus: (status) => set({ matchStatus: status }),
  setAiDelayMs: (ms) => set({ aiDelayMs: ms }),
  setTeacherConfig: (model, level) =>
    set((s) => ({
      teacherModel: model,
      teacherThinkingLevel: level,
      teacherInteractionId:
        s.teacherModel !== model ? null : s.teacherInteractionId,
    })),

  startSpectatorShowcase: (preset = "gemini-duel") => {
    const state = get();
    if (state.isGameOver) {
      state.dispatchCommand({ type: "RESET" });
    }
    if (preset === "cross-vendor") {
      set((s) => ({
        gameMode: "match",
        matchStatus: "playing",
        cameraPreset: "broadcast",
        whiteSeat: {
          ...s.whiteSeat,
          controller: "gemini",
          geminiModel: "gemini-4-argon",
          thinkingLevel: "medium",
          personaName: "Gemini 4 Argon",
          interactionId: null,
        },
        blackSeat: {
          ...s.blackSeat,
          controller: "openai",
          openaiModel: "gpt-5.5",
          thinkingLevel: "medium",
          personaName: "GPT-5.5",
          interactionId: null,
        },
      }));
    } else if (preset === "openai-duel") {
      set((s) => ({
        gameMode: "match",
        matchStatus: "playing",
        cameraPreset: "broadcast",
        whiteSeat: {
          ...s.whiteSeat,
          controller: "openai",
          openaiModel: "gpt-5.5",
          thinkingLevel: "medium",
          personaName: "OpenAI GPT-5.5 (W)",
          interactionId: null,
        },
        blackSeat: {
          ...s.blackSeat,
          controller: "openai",
          openaiModel: "gpt-4o",
          thinkingLevel: "medium",
          personaName: "OpenAI GPT-4o (B)",
          interactionId: null,
        },
      }));
    } else if (preset === "blitz") {
      set((s) => ({
        gameMode: "match",
        matchStatus: "playing",
        aiDelayMs: 300,
        cameraPreset: "broadcast",
        whiteSeat: {
          ...s.whiteSeat,
          controller: "gemini",
          geminiModel: "gemini-3.8-flash",
          thinkingLevel: "low",
          personaName: "Flash Speedster (W)",
          interactionId: null,
        },
        blackSeat: {
          ...s.blackSeat,
          controller: "gemini",
          geminiModel: "gemini-3.8-flash",
          thinkingLevel: "low",
          personaName: "Flash Tactician (B)",
          interactionId: null,
        },
      }));
    } else {
      set((s) => ({
        gameMode: "match",
        matchStatus: "playing",
        cameraPreset: "broadcast",
        whiteSeat: {
          ...s.whiteSeat,
          controller: "gemini",
          geminiModel: "gemini-4-argon",
          thinkingLevel: "medium",
          personaName: "Gemini 4 Argon (W)",
          interactionId: null,
        },
        blackSeat: {
          ...s.blackSeat,
          controller: "gemini",
          geminiModel: "gemini-3.8-flash",
          thinkingLevel: "medium",
          personaName: "Gemini 3.8 Flash (B)",
          interactionId: null,
        },
      }));
    }
  },

  requestAiTurn: async (customUserMessage?: string) => {
    const state = get();
    if (state.isGameOver || state.isAiThinking) return;

    const activeSeat = state.turn === "w" ? state.whiteSeat : state.blackSeat;
    if (activeSeat.controller === "human" && !customUserMessage) return;

    const currentSession = state.sessionId;
    set({ isAiThinking: true, apiError: null });

    try {
      const lastMoveSan =
        state.moveHistorySan.length > 0
          ? state.moveHistorySan[state.moveHistorySan.length - 1]
          : null;

      const response = await fetch("/api/ai/turn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fen: state.fen,
          pgn: state.pgn,
          lastMoveSan,
          userChatMessage: customUserMessage || null,
          controller:
            activeSeat.controller === "human" ? "gemini" : activeSeat.controller,
          geminiModel: activeSeat.geminiModel,
          openaiModel: activeSeat.openaiModel,
          thinkingLevel: activeSeat.thinkingLevel,
          previousInteractionId: activeSeat.interactionId,
          isTeacherSparring: state.gameMode === "teacher",
          skillLevel: state.skillLevel,
          hypeCommentatorMode: state.hypeCommentatorMode,
        }),
      });

      const data = await response.json();
      if (!response.ok || get().sessionId !== currentSession) {
        set({
          isAiThinking: false,
          apiError: !response.ok
            ? data?.error || "AI Turn request failed. Check your API key in .env.local."
            : null,
          matchStatus:
            !response.ok && get().matchStatus === "playing"
              ? "paused"
              : get().matchStatus,
        });
        return;
      }

      set({ isAiThinking: false });

      get().dispatchCommand({
        type: "MOVE",
        move: data.move,
        source: "ai-agent",
        meta: {
          thoughtSummary: data.thoughtSummary,
          chatMessage: data.chatMessage,
          positionalEvaluation: data.positionalEvaluation,
          tacticalMotif: data.tacticalMotif,
          expectedReplySan: data.expectedReplySan,
          thoughtTokens: data.thoughtTokens,
          latencyMs: data.latencyMs,
          interactionId: data.interactionId,
          modelLabel: data.modelLabel,
        },
      });
    } catch (err: any) {
      set({
        isAiThinking: false,
        apiError: err?.message || "Network error during AI Turn.",
      });
    }
  },

  requestTeacherCoaching: async (
    studentQuestion?: string,
    overridePreMoveFen?: string | null
  ) => {
    const state = get();
    if (state.isTeacherLoading) return;

    const currentSession = state.sessionId;
    set({ isTeacherLoading: true, apiError: null });
    try {
      const lastMoveSan =
        state.moveHistorySan.length > 0
          ? state.moveHistorySan[state.moveHistorySan.length - 1]
          : null;

      const preMoveFenToUse =
        overridePreMoveFen !== undefined
          ? overridePreMoveFen
          : state.turn === "b"
            ? state.lastHumanPreMoveFen
            : null;

      const response = await fetch("/api/ai/teacher", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fen: state.fen,
          previousFen: preMoveFenToUse,
          pgn: state.pgn,
          lastStudentMoveSan: lastMoveSan,
          studentQuestion: studentQuestion || null,
          skillLevel: state.skillLevel,
          geminiModel: state.teacherModel,
          thinkingLevel: state.teacherThinkingLevel,
          previousTeacherInteractionId: state.teacherInteractionId,
          hypeCommentatorMode: state.hypeCommentatorMode,
        }),
      });

      const data = await response.json();
      if (!response.ok || get().sessionId !== currentSession) {
        set({
          isTeacherLoading: false,
          apiError: !response.ok
            ? data?.error ||
              "AI Chess Teacher request failed. Check GEMINI_API_KEY in .env.local."
            : null,
        });
        return;
      }

      const lesson = data.lesson as AiTeacherStructuredOutput;

      const isTakebackMoment =
        !studentQuestion &&
        state.turn === "b" &&
        (lesson.should_suggest_takeback ||
          lesson.last_move_assessment === "mistake" ||
          lesson.last_move_assessment === "blunder");

      set((prev) => ({
        isTeacherLoading: false,
        activeLesson: lesson,
        awaitingTakebackDecision: isTakebackMoment,
        teacherInteractionId: data.interactionId,
        boardArrows: lesson.visual_arrows,
        boardHighlights: lesson.visual_highlights,
        thoughtLogs: [
          {
            id: `${Date.now()}-teacher`,
            timestamp: new Date().toLocaleTimeString(),
            seatColor: "teacher",
            modelLabel: `Teacher: ${prev.teacherModel} (${prev.teacherThinkingLevel})`,
            sanMove: lesson.recommended_moves[0]?.san || null,
            thoughtSummary: data.thoughtSummary,
            chatMessage: lesson.coaching_explanation,
            positionalEvaluation: null,
            tacticalMotif: lesson.concept_taught,
            thoughtTokens: data.thoughtTokens,
            latencyMs: data.latencyMs,
            interactionId: data.interactionId,
          },
          ...prev.thoughtLogs,
        ],
      }));

      // If the student's move was good (not a takeback intervention moment) and it is now
      // the gentle coach partner's turn (Black), automatically play a gentle sparring move!
      const latest = get();
      if (
        !isTakebackMoment &&
        !studentQuestion &&
        latest.gameMode === "teacher" &&
        !latest.isGameOver &&
        latest.turn === "b" &&
        latest.blackSeat.controller !== "human"
      ) {
        setTimeout(() => {
          if (
            get().sessionId === currentSession &&
            !get().awaitingTakebackDecision &&
            get().turn === "b"
          ) {
            get().requestAiTurn();
          }
        }, 700);
      }
    } catch (err: any) {
      set({
        isTeacherLoading: false,
        apiError: err?.message || "Network error contacting AI Chess Teacher.",
      });
    }
  },
}));
