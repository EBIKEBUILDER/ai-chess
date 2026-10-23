// src/lib/chess-analytics.ts
import { Chess, type Color, type PieceSymbol, type Square } from "chess.js";
import type { BoardArrow, MoveClassification } from "@/types/chess";

export const MOVE_CLASSIFICATION_META: Record<
  MoveClassification,
  {
    symbol: string;
    label: string;
    color: string;
    badgeBg: string;
    textColor: string;
  }
> = {
  brilliant: {
    symbol: "!!",
    label: "Brilliant",
    color: "#06B6D4",
    badgeBg: "bg-cyan-500 text-slate-950 border-cyan-300",
    textColor: "text-cyan-400",
  },
  great: {
    symbol: "!",
    label: "Great Move",
    color: "#3B82F6",
    badgeBg: "bg-blue-500 text-white border-blue-300",
    textColor: "text-blue-400",
  },
  best: {
    symbol: "★",
    label: "Best Move",
    color: "#10B981",
    badgeBg: "bg-emerald-500 text-slate-950 border-emerald-300",
    textColor: "text-emerald-400",
  },
  book: {
    symbol: "📖",
    label: "Book Move",
    color: "#D97706",
    badgeBg: "bg-amber-600 text-white border-amber-400",
    textColor: "text-amber-400",
  },
  inaccuracy: {
    symbol: "?!",
    label: "Inaccuracy",
    color: "#EAB308",
    badgeBg: "bg-yellow-500 text-slate-950 border-yellow-300",
    textColor: "text-yellow-400",
  },
  mistake: {
    symbol: "?",
    label: "Mistake",
    color: "#F97316",
    badgeBg: "bg-orange-500 text-white border-orange-300",
    textColor: "text-orange-400",
  },
  blunder: {
    symbol: "??",
    label: "Blunder",
    color: "#EF4444",
    badgeBg: "bg-red-600 text-white border-red-300",
    textColor: "text-red-400",
  },
};

export interface OpeningInfo {
  eco: string;
  name: string;
  style: string;
  description: string;
}

export interface NoteworthyEvent {
  id: string;
  ply: number;
  moveNumber: number;
  color: Color;
  san: string;
  type:
    | "opening"
    | "first_blood"
    | "major_capture"
    | "capture"
    | "fork"
    | "check"
    | "castle"
    | "momentum_swing"
    | "promotion"
    | "surprise"
    | "predicted"
    | "hanging_piece"
    | "sacrifice"
    | "danger_levels"
    | "pressure"
    | "principle_warning"
    | "checkmate";
  badge: string;
  title: string;
  description: string;
  importance: "normal" | "notable" | "critical";
}

export interface PlayerSideMetrics {
  materialPoints: number;
  capturedPieces: PieceSymbol[]; // Enemy pieces captured by this player
  centerControl: number; // Attacks + presence on center squares
  controlledSquaresCount: number; // Total squares (out of 64) dominated by this side
  mobility: number; // Available legal moves
  developedPieces: number; // Minor/major pieces developed off starting squares (0-6)
  kingSafetyLabel: "Fortified" | "Safe" | "Uncastled" | "Exposed" | "In Check!";
  kingSafetyScore: number; // 0-100
  hasCastled: boolean;
  hangingPiecesCount: number;
  hangingSquares: Square[];
}

export interface SquareControlCell {
  square: Square;
  whiteAttackers: number;
  blackAttackers: number;
  owner: "w" | "b" | "contested" | "neutral";
  intensity: number; // 0 to 1
}

export interface MoveTelemetrySnapshot {
  ply: number;
  moveNumber: number;
  color: Color;
  san: string;
  from: string;
  to: string;
  classification: MoveClassification;
  evaluationCp: number; // In pawns from White's perspective (+ favors White, - favors Black)
  whiteWinProb: number; // 0 to 100%
  expectedReplySan: string | null;
  wasExpectedReply: boolean | null;
  tacticalMotif: string | null;
  chatMessage: string | null;
  modelLabel: string;
  latencyMs: number | null;
  thoughtTokens: number | null;
  events: NoteworthyEvent[];
}

export interface BoardAnalyticsReport {
  phase: "Opening" | "Middlegame" | "Endgame";
  phaseDescription: string;
  opening: OpeningInfo;
  evaluationCp: number;
  whiteWinProb: number;
  advantageSummary: string;
  advantageColor: "w" | "b" | "even";
  white: PlayerSideMetrics;
  black: PlayerSideMetrics;
  materialDiff: number; // White material - Black material
  tensionScore: number; // Number of pieces under attack on the board
  tensionLabel:
    | "Calm / Positional"
    | "Building Tension"
    | "Sharp Tactical Battle"
    | "All-Out Chaos!";
  squareControl: Record<Square, SquareControlCell>;
  storylineHeadline: string;
}

const PIECE_VALUES: Record<PieceSymbol, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 0,
};

const PIECE_NAMES: Record<PieceSymbol, string> = {
  p: "Pawn",
  n: "Knight",
  b: "Bishop",
  r: "Rook",
  q: "Queen",
  k: "King",
};

const CORE_CENTER: Square[] = ["d4", "d5", "e4", "e5"];
const EXTENDED_CENTER: Square[] = [
  "c3",
  "d3",
  "e3",
  "f3",
  "c4",
  "f4",
  "c5",
  "f5",
  "c6",
  "d6",
  "e6",
  "f6",
];

const ALL_SQUARES: Square[] = [];
const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];
const RANKS = ["1", "2", "3", "4", "5", "6", "7", "8"];
for (const r of RANKS) {
  for (const f of FILES) {
    ALL_SQUARES.push(`${f}${r}` as Square);
  }
}

// Curated Opening Book matched by longest move prefix
const OPENING_BOOK: {
  moves: string[];
  info: OpeningInfo;
}[] = [
  {
    moves: ["e4", "e5", "Nf3", "Nc6", "Bb5", "a6"],
    info: {
      eco: "C70",
      name: "Ruy Lopez: Morphy Defense",
      style: "Grandmaster Classical",
      description:
        "One of the oldest and most respected openings in chess. White pressures Black's defender of the center while Black challenges the Bishop immediately.",
    },
  },
  {
    moves: ["e4", "e5", "Nf3", "Nc6", "Bb5"],
    info: {
      eco: "C60",
      name: "Ruy Lopez (Spanish Opening)",
      style: "Strategic Pressure",
      description:
        "White develops the Bishop to b5 to pin or pressure the Knight that defends Black's central e5 pawn, preparing rapid castling.",
    },
  },
  {
    moves: ["e4", "e5", "Nf3", "Nc6", "Bc4", "Bc5"],
    info: {
      eco: "C50",
      name: "Italian Game: Giuoco Piano",
      style: "Classical & Tactical",
      description:
        "Both players deploy their Bishops to active diagonals aiming straight at the opponent's vulnerable f7 and f2 squares near the Kings.",
    },
  },
  {
    moves: ["e4", "e5", "Nf3", "Nc6", "Bc4", "Nf6"],
    info: {
      eco: "C55",
      name: "Italian Game: Two Knights Defense",
      style: "Sharp Counter-Attack",
      description:
        "Instead of mirroring White's Bishop, Black leaps out with a second Knight to counter-attack White's center pawn on e4.",
    },
  },
  {
    moves: ["e4", "e5", "Nf3", "Nc6", "Bc4"],
    info: {
      eco: "C50",
      name: "Italian Game",
      style: "Aggressive Development",
      description:
        "White aims the Bishop directly at f7—the weakest square around Black's King—while preparing to castle early.",
    },
  },
  {
    moves: ["e4", "e5", "Nf3", "Nc6", "d4"],
    info: {
      eco: "C44",
      name: "Scotch Game",
      style: "Open & Explosive",
      description:
        "White immediately blasts open the center of the board with d4 to unleash wide-open diagonals for both Bishops and the Queen.",
    },
  },
  {
    moves: ["e4", "e5", "Nf3", "Nf6"],
    info: {
      eco: "C42",
      name: "Petrov's Defense (Russian Game)",
      style: "Symmetrical Counter",
      description:
        "Black refuses to play passively and counter-attacks White's e4 pawn immediately, often leading to balanced, calculated battles.",
    },
  },
  {
    moves: ["e4", "e5", "Bc4", "Nc6", "Qh5"],
    info: {
      eco: "C20",
      name: "Scholar's Mate Attempt",
      style: "Early Knockout Trap",
      description:
        "White brings the Queen out early to team up with the Bishop on c4, threatening an instant 4-move checkmate on f7!",
    },
  },
  {
    moves: ["e4", "e5", "f4"],
    info: {
      eco: "C30",
      name: "King's Gambit",
      style: "Swashbuckling Romantic",
      description:
        "A fearless 19th-century sacrifice! White offers a pawn right next to the King to rip open attack lanes as fast as possible.",
    },
  },
  {
    moves: ["e4", "c5", "Nf3", "d6", "d4", "cxd4", "Nxd4", "Nf6", "Nc3"],
    info: {
      eco: "B90",
      name: "Sicilian Defense: Open Sicilian",
      style: "High-Octane Asymmetric",
      description:
        "The ultimate clash of styles! White attacks aggressively on the Kingside while Black counter-punches down the open c-file.",
    },
  },
  {
    moves: ["e4", "c5", "Nf3"],
    info: {
      eco: "B27",
      name: "Sicilian Defense",
      style: "Asymmetric & Combative",
      description:
        "The most popular winning response to 1.e4. Black avoids symmetry to create an unbalanced battle where both sides play for a win.",
    },
  },
  {
    moves: ["e4", "c5"],
    info: {
      eco: "B20",
      name: "Sicilian Defense",
      style: "Dynamic Counter-Attack",
      description:
        "Black fights for the central d4 square from the flank, steering the game into thrilling, asymmetrical territory.",
    },
  },
  {
    moves: ["e4", "e6", "d4", "d5"],
    info: {
      eco: "C00",
      name: "French Defense",
      style: "Fortress & Counter-Strike",
      description:
        "Black builds a resilient pawn chain to challenge White's center, accepting a cramped early game in exchange for lethal counter-attacks.",
    },
  },
  {
    moves: ["e4", "e6"],
    info: {
      eco: "C00",
      name: "French Defense",
      style: "Solid & Strategic",
      description:
        "Black prepares to strike at the center with d5 while keeping a rock-solid defensive barrier in front of the King.",
    },
  },
  {
    moves: ["e4", "c6", "d4", "d5"],
    info: {
      eco: "B12",
      name: "Caro-Kann Defense",
      style: "Ultra-Solid Endgame",
      description:
        "Favored by positional masters—Black challenges White's center pawn while keeping the light-squared Bishop free to develop.",
    },
  },
  {
    moves: ["e4", "c6"],
    info: {
      eco: "B10",
      name: "Caro-Kann Defense",
      style: "Resilient & Structured",
      description:
        "Black prepares a supported d5 pawn push, famous for creating nearly unbreakable pawn structures.",
    },
  },
  {
    moves: ["e4", "d5"],
    info: {
      eco: "B01",
      name: "Scandinavian Defense",
      style: "Direct Challenge",
      description:
        "Black wastes zero time and immediately challenges White's e4 pawn on Move 1, often bringing Black's Queen out early.",
    },
  },
  {
    moves: ["d4", "d5", "c4", "e6"],
    info: {
      eco: "D30",
      name: "Queen's Gambit Declined",
      style: "Classical Heavyweight",
      description:
        "White offers a wing pawn (c4) to distract Black's central pawn. Black declines the bait and reinforces the center with e6.",
    },
  },
  {
    moves: ["d4", "d5", "c4", "dxc4"],
    info: {
      eco: "D20",
      name: "Queen's Gambit Accepted",
      style: "Open Tactical Stride",
      description:
        "Black accepts White's offered c4 pawn, giving up the center temporarily to fight for rapid piece activity.",
    },
  },
  {
    moves: ["d4", "d5", "c4", "c6"],
    info: {
      eco: "D10",
      name: "Slav Defense",
      style: "Rock-Solid Counter",
      description:
        "Black supports the central d5 pawn with c6, keeping diagonals open for both Bishops.",
    },
  },
  {
    moves: ["d4", "d5", "c4"],
    info: {
      eco: "D06",
      name: "Queen's Gambit",
      style: "Grand Strategic Battle",
      description:
        "One of the most famous openings in history! White offers the c4 pawn to win total dominance over the center of the board.",
    },
  },
  {
    moves: ["d4", "d5", "Bf4"],
    info: {
      eco: "D00",
      name: "London System",
      style: "Pyramid Structure",
      description:
        "White builds a bulletproof triangle of pawns around d4 while developing the dark-squared Bishop outside the pawn chain.",
    },
  },
  {
    moves: ["d4", "Nf6", "c4", "g6", "Nc3", "Bg7"],
    info: {
      eco: "E60",
      name: "King's Indian Defense",
      style: "Hypermodern Firestorm",
      description:
        "Black allows White to take the center early, planning to coil up like a spring and launch a devastating Kingside attack later.",
    },
  },
  {
    moves: ["d4", "Nf6", "c4", "e6", "Nc3", "Bb4"],
    info: {
      eco: "E20",
      name: "Nimzo-Indian Defense",
      style: "Hypermodern Control",
      description:
        "Instead of occupying the center with pawns, Black pins White's Knight on c3 to control the center from afar.",
    },
  },
  {
    moves: ["d4", "Nf6"],
    info: {
      eco: "A45",
      name: "Indian Defense",
      style: "Flexible Hypermodern",
      description:
        "Black develops the Knight first to control central squares flexibly before committing pawns.",
    },
  },
  {
    moves: ["e4", "e5"],
    info: {
      eco: "C20",
      name: "Open Game (King's Pawn)",
      style: "Classical Center Clash",
      description:
        "Both sides stake an immediate claim in the dead center of the board and open diagonals for their Queens and Bishops.",
    },
  },
  {
    moves: ["d4", "d5"],
    info: {
      eco: "D00",
      name: "Closed Game (Queen's Pawn)",
      style: "Strategic Maneuvering",
      description:
        "Both players lock pawns in the center, setting the stage for a deep, strategic battle of piece maneuvering and pawn breaks.",
    },
  },
  {
    moves: ["c4"],
    info: {
      eco: "A10",
      name: "English Opening",
      style: "Flank Ambush",
      description:
        "A favorite of World Champions—White fights for the central d5 square from the wing, keeping the game flexible and strategic.",
    },
  },
  {
    moves: ["Nf3"],
    info: {
      eco: "A04",
      name: "Réti / Zukertort Opening",
      style: "Hypermodern Flexible",
      description:
        "White develops a Knight immediately to watch the center without revealing which pawn structure they will choose.",
    },
  },
  {
    moves: ["e4"],
    info: {
      eco: "B00",
      name: "King's Pawn Opening",
      style: "Fast & Tactical",
      description:
        "Bobby Fischer called 1.e4 'Best by test!' It grabs central territory and frees both the Queen and King's Bishop in one stroke.",
    },
  },
  {
    moves: ["d4"],
    info: {
      eco: "A40",
      name: "Queen's Pawn Opening",
      style: "Solid & Strategic",
      description:
        "White claims the center with a pawn that is already protected by the Queen right from the start.",
    },
  },
];

export function detectOpening(moveHistorySan: string[]): OpeningInfo {
  if (moveHistorySan.length === 0) {
    return {
      eco: "A00",
      name: "Starting Position",
      style: "Pre-Match",
      description:
        "All 32 pieces are on their starting squares. Watch how both players fight for the 4 golden center squares (d4, d5, e4, e5)!",
    };
  }

  for (const entry of OPENING_BOOK) {
    if (moveHistorySan.length >= entry.moves.length) {
      const matches = entry.moves.every(
        (m, idx) => moveHistorySan[idx] === m
      );
      if (matches) {
        return entry.info;
      }
    }
  }

  return {
    eco: "A00",
    name: "Custom / Unorthodox Opening",
    style: "Creative Freestyle",
    description:
      "The players have ventured off standard opening theory into an original battle of tactics and board control.",
  };
}

/**
 * Converts a centipawn/pawn evaluation (e.g., +1.50 pawns) into a 0-100% White Win Probability
 */
export function evalToWinProbability(evalPawns: number): number {
  const clamped = Math.max(-12, Math.min(12, evalPawns));
  // Standard logistic curve used in chess broadcast bars
  const prob = 1 / (1 + Math.exp(-0.42 * clamped));
  return Math.round(prob * 100);
}

/**
 * Safely computes legal move count (mobility) for any side by inspecting a cloned FEN
 */
function computeSideMobility(chess: Chess, color: Color): number {
  if (chess.turn() === color) {
    return chess.moves().length;
  }
  try {
    const parts = chess.fen().split(" ");
    parts[1] = color;
    parts[3] = "-"; // Clear en-passant target to ensure valid FEN
    const flipped = new Chess(parts.join(" "));
    return flipped.moves().length;
  } catch {
    // Fallback if non-active side cannot legally be to move (e.g. opponent is in check)
    return 18;
  }
}

/**
 * Computes comprehensive real-time analytics from a Chess instance
 */
export function computeBoardAnalytics(
  chess: Chess,
  moveHistorySan: string[],
  latestAiEvalCp: number | null
): BoardAnalyticsReport {
  const board = chess.board();
  const opening = detectOpening(moveHistorySan);

  const startingCounts: Record<PieceSymbol, number> = {
    p: 8,
    n: 2,
    b: 2,
    r: 2,
    q: 1,
    k: 1,
  };
  const currentCounts: Record<Color, Record<PieceSymbol, number>> = {
    w: { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 },
    b: { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 },
  };

  let whiteMaterial = 0;
  let blackMaterial = 0;
  let totalNonPawnMaterial = 0;

  let whiteKingSq: Square = "e1";
  let blackKingSq: Square = "e8";

  const whiteHangingSquares: Square[] = [];
  const blackHangingSquares: Square[] = [];
  let tensionScore = 0;

  // Track developed pieces (minor/major pieces that have moved off their initial squares)
  const whiteHomeMinorMajor: Square[] = ["b1", "c1", "d1", "f1", "g1", "a1", "h1"];
  const blackHomeMinorMajor: Square[] = ["b8", "c8", "d8", "f8", "g8", "a8", "h8"];
  let whiteOnHome = 0;
  let blackOnHome = 0;

  for (const row of board) {
    for (const cell of row) {
      if (!cell) continue;
      const sq = cell.square as Square;
      currentCounts[cell.color][cell.type]++;
      const val = PIECE_VALUES[cell.type];

      if (cell.color === "w") {
        whiteMaterial += val;
        if (cell.type === "k") whiteKingSq = sq;
        if (cell.type !== "p" && cell.type !== "k") {
          totalNonPawnMaterial += val;
          if (whiteHomeMinorMajor.includes(sq)) whiteOnHome++;
        }
      } else {
        blackMaterial += val;
        if (cell.type === "k") blackKingSq = sq;
        if (cell.type !== "p" && cell.type !== "k") {
          totalNonPawnMaterial += val;
          if (blackHomeMinorMajor.includes(sq)) blackOnHome++;
        }
      }

      // Check tactical tension and hanging pieces
      const enemyColor: Color = cell.color === "w" ? "b" : "w";
      const enemyAttackers = chess.attackers(sq, enemyColor);
      const friendlyDefenders = chess.attackers(sq, cell.color);

      if (enemyAttackers.length > 0) {
        tensionScore++;
        if (
          cell.type !== "k" &&
          (friendlyDefenders.length === 0 ||
            enemyAttackers.length > friendlyDefenders.length)
        ) {
          if (cell.color === "w") whiteHangingSquares.push(sq);
          else blackHangingSquares.push(sq);
        }
      }
    }
  }

  // Compute captured pieces lists (sorted by piece value descending)
  const order: PieceSymbol[] = ["q", "r", "b", "n", "p"];
  const capturedByWhite: PieceSymbol[] = [];
  const capturedByBlack: PieceSymbol[] = [];

  for (const type of order) {
    const missingBlack = Math.max(0, startingCounts[type] - currentCounts.b[type]);
    for (let i = 0; i < missingBlack; i++) capturedByWhite.push(type);

    const missingWhite = Math.max(0, startingCounts[type] - currentCounts.w[type]);
    for (let i = 0; i < missingWhite; i++) capturedByBlack.push(type);
  }

  // Compute 64-square territory & center control
  const squareControl = {} as Record<Square, SquareControlCell>;
  let whiteControlledSquares = 0;
  let blackControlledSquares = 0;
  let whiteCenterControl = 0;
  let blackCenterControl = 0;

  for (const sq of ALL_SQUARES) {
    const wAtt = chess.attackers(sq, "w").length;
    const bAtt = chess.attackers(sq, "b").length;
    const occupant = chess.get(sq);

    let owner: "w" | "b" | "contested" | "neutral" = "neutral";
    if (wAtt > bAtt) {
      owner = "w";
      whiteControlledSquares++;
    } else if (bAtt > wAtt) {
      owner = "b";
      blackControlledSquares++;
    } else if (wAtt > 0 && wAtt === bAtt) {
      owner = "contested";
    }

    const totalAtt = wAtt + bAtt;
    const intensity = Math.min(1, totalAtt / 4);

    squareControl[sq] = {
      square: sq,
      whiteAttackers: wAtt,
      blackAttackers: bAtt,
      owner,
      intensity,
    };

    if (CORE_CENTER.includes(sq)) {
      whiteCenterControl += wAtt * 2 + (occupant?.color === "w" ? 3 : 0);
      blackCenterControl += bAtt * 2 + (occupant?.color === "b" ? 3 : 0);
    } else if (EXTENDED_CENTER.includes(sq)) {
      whiteCenterControl += wAtt + (occupant?.color === "w" ? 1 : 0);
      blackCenterControl += bAtt + (occupant?.color === "b" ? 1 : 0);
    }
  }

  const whiteMobility = computeSideMobility(chess, "w");
  const blackMobility = computeSideMobility(chess, "b");

  // Developed pieces count (0 to 7 non-pawn, non-king pieces)
  const whiteDeveloped = Math.max(0, 7 - whiteOnHome);
  const blackDeveloped = Math.max(0, 7 - blackOnHome);

  // King safety evaluation
  function evaluateKingSafety(
    color: Color,
    kingSq: Square
  ): {
    label: "Fortified" | "Safe" | "Uncastled" | "Exposed" | "In Check!";
    score: number;
    hasCastled: boolean;
  } {
    if (chess.inCheck() && chess.turn() === color) {
      return {
        label: "In Check!",
        score: 20,
        hasCastled: !["e1", "e8"].includes(kingSq),
      };
    }

    const castledSquares =
      color === "w" ? ["g1", "c1", "h1", "b1"] : ["g8", "c8", "h8", "b8"];
    const hasCastled = castledSquares.includes(kingSq);
    const enemyColor: Color = color === "w" ? "b" : "w";

    // Check enemy attackers aiming at the King or adjacent squares
    const kFile = kingSq.charCodeAt(0);
    const kRank = parseInt(kingSq[1], 10);
    let nearbyEnemyAttacks = 0;
    let pawnShields = 0;

    for (let df = -1; df <= 1; df++) {
      for (let dr = -1; dr <= 1; dr++) {
        const f = String.fromCharCode(kFile + df);
        const r = kRank + dr;
        if (f >= "a" && f <= "h" && r >= 1 && r <= 8) {
          const adjSq = `${f}${r}` as Square;
          nearbyEnemyAttacks += chess.attackers(adjSq, enemyColor).length;
          const p = chess.get(adjSq);
          if (p && p.color === color && p.type === "p") {
            pawnShields++;
          }
        }
      }
    }

    let score = 65 + pawnShields * 10 + (hasCastled ? 15 : 0) - nearbyEnemyAttacks * 8;
    score = Math.max(10, Math.min(100, score));

    let label: "Fortified" | "Safe" | "Uncastled" | "Exposed" = "Safe";
    if (score >= 82 && hasCastled) label = "Fortified";
    else if (score < 48 || nearbyEnemyAttacks >= 4) label = "Exposed";
    else if (!hasCastled && moveHistorySan.length >= 14) label = "Uncastled";

    return { label, score, hasCastled };
  }

  const whiteKingSafety = evaluateKingSafety("w", whiteKingSq);
  const blackKingSafety = evaluateKingSafety("b", blackKingSq);

  // Determine Game Phase
  let phase: "Opening" | "Middlegame" | "Endgame" = "Opening";
  let phaseDescription =
    "Both players are bringing their Knights and Bishops out and fighting for the center.";
  if (totalNonPawnMaterial <= 26) {
    phase = "Endgame";
    phaseDescription =
      "Most heavy pieces have been traded off! Every pawn now dreams of reaching the far side to promote into a new Queen.";
  } else if (moveHistorySan.length >= 14 || whiteKingSafety.hasCastled && blackKingSafety.hasCastled) {
    phase = "Middlegame";
    phaseDescription =
      "Pieces are developed and Kings seek shelter—now tactical combinations, pins, and attacks take center stage!";
  }

  // Compute deterministic evaluation fallback or blend with AI evaluation
  const materialDiff = whiteMaterial - blackMaterial;
  const positionalBonus =
    (whiteCenterControl - blackCenterControl) * 0.06 +
    (whiteControlledSquares - blackControlledSquares) * 0.03 +
    (whiteMobility - blackMobility) * 0.02 +
    (whiteKingSafety.score - blackKingSafety.score) * 0.008;

  let deterministicEval = Number((materialDiff + positionalBonus).toFixed(2));
  if (chess.isCheckmate()) {
    deterministicEval = chess.turn() === "w" ? -15 : 15;
  } else if (chess.isDraw()) {
    deterministicEval = 0;
  }

  const evaluationCp =
    chess.isCheckmate() || chess.isDraw()
      ? deterministicEval
      : latestAiEvalCp !== null
        ? Number((latestAiEvalCp * 0.7 + deterministicEval * 0.3).toFixed(2))
        : deterministicEval;

  const whiteWinProb = chess.isCheckmate()
    ? chess.turn() === "w"
      ? 0
      : 100
    : chess.isDraw()
      ? 50
      : evalToWinProbability(evaluationCp);

  let advantageSummary = "Dead Even Battle";
  let advantageColor: "w" | "b" | "even" = "even";
  if (chess.isCheckmate()) {
    advantageColor = chess.turn() === "w" ? "b" : "w";
    advantageSummary = `${advantageColor === "w" ? "White" : "Black"} Wins by Checkmate!`;
  } else if (Math.abs(evaluationCp) < 0.35) {
    advantageSummary = "Balanced Position — Anyone's Game";
  } else if (evaluationCp >= 3.0) {
    advantageColor = "w";
    advantageSummary = "White has a Commanding Lead";
  } else if (evaluationCp >= 1.2) {
    advantageColor = "w";
    advantageSummary = "White Presses a Clear Advantage";
  } else if (evaluationCp >= 0.35) {
    advantageColor = "w";
    advantageSummary = "Slight Edge for White";
  } else if (evaluationCp <= -3.0) {
    advantageColor = "b";
    advantageSummary = "Black has a Commanding Lead";
  } else if (evaluationCp <= -1.2) {
    advantageColor = "b";
    advantageSummary = "Black Presses a Clear Advantage";
  } else {
    advantageColor = "b";
    advantageSummary = "Slight Edge for Black";
  }

  let tensionLabel:
    | "Calm / Positional"
    | "Building Tension"
    | "Sharp Tactical Battle"
    | "All-Out Chaos!" = "Calm / Positional";
  if (tensionScore >= 7) tensionLabel = "All-Out Chaos!";
  else if (tensionScore >= 4) tensionLabel = "Sharp Tactical Battle";
  else if (tensionScore >= 2) tensionLabel = "Building Tension";

  // Build plain-English Storyline Headline for spectators
  let storylineHeadline = opening.description;
  if (chess.isCheckmate()) {
    storylineHeadline = `The match concludes in Checkmate after ${moveHistorySan.length} half-moves!`;
  } else if (chess.inCheck()) {
    storylineHeadline = `${chess.turn() === "w" ? "White's" : "Black's"} King is under direct fire (CHECK!) and must find immediate safety.`;
  } else if (whiteHangingSquares.length > 0 || blackHangingSquares.length > 0) {
    const exposedSide = whiteHangingSquares.length > 0 ? "White" : "Black";
    const sqs =
      whiteHangingSquares.length > 0
        ? whiteHangingSquares.join(", ")
        : blackHangingSquares.join(", ");
    storylineHeadline = `Tactical Alert: ${exposedSide} has undefended piece(s) under attack on ${sqs}!`;
  } else if (Math.abs(materialDiff) >= 3) {
    const leader = materialDiff > 0 ? "White" : "Black";
    storylineHeadline = `${leader} is up +${Math.abs(materialDiff)} points of material and looking to convert the advantage.`;
  } else if (moveHistorySan.length > 6) {
    const spaceLeader =
      whiteControlledSquares > blackControlledSquares + 4
        ? "White controls more board territory"
        : blackControlledSquares > whiteControlledSquares + 4
          ? "Black controls more board territory"
          : "Both players are locked in a tight territorial tug-of-war";
    storylineHeadline = `${phase} Phase: ${spaceLeader} (${whiteControlledSquares} vs ${blackControlledSquares} squares) with ${tensionLabel.toLowerCase()} on the board.`;
  }

  return {
    phase,
    phaseDescription,
    opening,
    evaluationCp,
    whiteWinProb,
    advantageSummary,
    advantageColor,
    white: {
      materialPoints: whiteMaterial,
      capturedPieces: capturedByWhite,
      centerControl: whiteCenterControl,
      controlledSquaresCount: whiteControlledSquares,
      mobility: whiteMobility,
      developedPieces: whiteDeveloped,
      kingSafetyLabel: whiteKingSafety.label,
      kingSafetyScore: whiteKingSafety.score,
      hasCastled: whiteKingSafety.hasCastled,
      hangingPiecesCount: whiteHangingSquares.length,
      hangingSquares: whiteHangingSquares,
    },
    black: {
      materialPoints: blackMaterial,
      capturedPieces: capturedByBlack,
      centerControl: blackCenterControl,
      controlledSquaresCount: blackControlledSquares,
      mobility: blackMobility,
      developedPieces: blackDeveloped,
      kingSafetyLabel: blackKingSafety.label,
      kingSafetyScore: blackKingSafety.score,
      hasCastled: blackKingSafety.hasCastled,
      hangingPiecesCount: blackHangingSquares.length,
      hangingSquares: blackHangingSquares,
    },
    materialDiff,
    tensionScore,
    tensionLabel,
    squareControl,
    storylineHeadline,
  };
}

/**
 * Inspects a just-executed move to detect exciting spectator highlights (Forks, First Blood, Castling, Momentum Swings, AI Surprises, etc.)
 */
export function detectMoveNoteworthyEvents(params: {
  preMoveFen: string;
  postMoveChess: Chess;
  executedMove: {
    color: Color;
    from: string;
    to: string;
    san: string;
    piece: PieceSymbol;
    captured?: PieceSymbol;
    promotion?: PieceSymbol;
    flags: string;
  };
  ply: number;
  prevEvalCp: number;
  newEvalCp: number;
  previousExpectedReplySan: string | null;
  hadPriorCaptures: boolean;
}): {
  events: NoteworthyEvent[];
  wasExpectedReply: boolean | null;
  classification: MoveClassification;
} {
  const {
    preMoveFen,
    postMoveChess,
    executedMove,
    ply,
    prevEvalCp,
    newEvalCp,
    previousExpectedReplySan,
    hadPriorCaptures,
  } = params;

  const events: NoteworthyEvent[] = [];
  const moveNumber = Math.ceil(ply / 2);
  const sideName = executedMove.color === "w" ? "White" : "Black";
  const enemyName = executedMove.color === "w" ? "Black" : "White";
  const enemyColor: Color = executedMove.color === "w" ? "b" : "w";
  const moverName = PIECE_NAMES[executedMove.piece] || "Piece";
  const moverValue = PIECE_VALUES[executedMove.piece];

  // Positive delta means the move improved the moving side's evaluation
  const sideEvalDelta =
    executedMove.color === "w"
      ? newEvalCp - prevEvalCp
      : prevEvalCp - newEvalCp;

  // 1. Check if move matched opponent AI's prediction
  let wasExpectedReply: boolean | null = null;
  if (previousExpectedReplySan) {
    const normalizedExpected = previousExpectedReplySan
      .replace(/[+#!?]/g, "")
      .trim();
    const normalizedActual = executedMove.san.replace(/[+#!?]/g, "").trim();
    wasExpectedReply = normalizedExpected === normalizedActual;

    if (wasExpectedReply) {
      events.push({
        id: `pred-${ply}`,
        ply,
        moveNumber,
        color: executedMove.color,
        san: executedMove.san,
        type: "predicted",
        badge: "🎯 READ LIKE A BOOK",
        title: `${enemyName} AI Predicted ${executedMove.san}!`,
        description: `${enemyName} anticipated this exact reply (${executedMove.san}) on the previous turn.`,
        importance: "notable",
      });
    } else {
      events.push({
        id: `surp-${ply}`,
        ply,
        moveNumber,
        color: executedMove.color,
        san: executedMove.san,
        type: "surprise",
        badge: "⚡ SURPRISE TWIST",
        title: `${sideName} Deviates from Prediction!`,
        description: `${enemyName} expected ${previousExpectedReplySan}, but ${sideName} played ${executedMove.san} instead!`,
        importance: "normal",
      });
    }
  }

  // 2. Checkmate
  if (postMoveChess.isCheckmate()) {
    events.push({
      id: `mate-${ply}`,
      ply,
      moveNumber,
      color: executedMove.color,
      san: executedMove.san,
      type: "checkmate",
      badge: "👑 CHECKMATE!",
      title: `${sideName} Delivers Checkmate with ${executedMove.san}!`,
      description: `${enemyName}'s King is trapped with nowhere to run.`,
      importance: "critical",
    });
    return { events, wasExpectedReply, classification: "brilliant" };
  }

  // 3. Gotham-Style Sacrifice Detection ("THE ROOOOOOK!!" / Brilliant Sacrifice)
  const destSquare = executedMove.to as Square;
  const enemyAttackersOnDest = postMoveChess.attackers(destSquare, enemyColor);
  const friendlyDefendersOnDest = postMoveChess.attackers(
    destSquare,
    executedMove.color
  );
  const capturedVal = executedMove.captured
    ? PIECE_VALUES[executedMove.captured]
    : 0;

  let isBrilliantSacrifice = false;
  if (
    moverValue >= 3 &&
    enemyAttackersOnDest.length > 0 &&
    moverValue > capturedVal &&
    (friendlyDefendersOnDest.length === 0 ||
      postMoveChess.inCheck() ||
      sideEvalDelta >= -0.3) &&
    sideEvalDelta >= -0.65
  ) {
    isBrilliantSacrifice = true;
    const isRookSac = executedMove.piece === "r";
    events.push({
      id: `sac-${ply}`,
      ply,
      moveNumber,
      color: executedMove.color,
      san: executedMove.san,
      type: "sacrifice",
      badge: isRookSac ? "🔥 THE ROOOOOOK!!" : "💎 BRILLIANT SACRIFICE!!",
      title: isRookSac
        ? `AND ${sideName.toUpperCase()} SACRIFICES... THE ROOOOOOK!! (${executedMove.san})`
        : `${sideName} Sacrifices the ${moverName} on ${executedMove.to}! (${executedMove.san})`,
      description: `${sideName} Boldly places the ${moverName} in the line of fire on ${executedMove.to} for maximum tactical devastation!`,
      importance: "critical",
    });
  }

  // 4. Gotham-Style "DANGER LEVELS!" Detection
  // Check if moving side had a piece under attack in preMoveFen, ignored it, and created a bigger counter-threat
  try {
    const preChess = new Chess(preMoveFen);
    let hadAttackedPieceBefore = false;
    for (const sq of ALL_SQUARES) {
      const p = preChess.get(sq);
      if (
        p &&
        p.color === executedMove.color &&
        PIECE_VALUES[p.type] >= 3 &&
        sq !== executedMove.from
      ) {
        if (preChess.attackers(sq, enemyColor).length > 0) {
          hadAttackedPieceBefore = true;
          break;
        }
      }
    }

    if (hadAttackedPieceBefore) {
      // Did the new move attack an enemy Queen/Rook/King?
      let counterAttackedHighValue = postMoveChess.inCheck();
      for (const sq of ALL_SQUARES) {
        const ep = postMoveChess.get(sq);
        if (ep && ep.color === enemyColor && PIECE_VALUES[ep.type] >= 5) {
          if (
            postMoveChess
              .attackers(sq, executedMove.color)
              .includes(destSquare)
          ) {
            counterAttackedHighValue = true;
            break;
          }
        }
      }

      if (counterAttackedHighValue) {
        events.push({
          id: `danger-${ply}`,
          ply,
          moveNumber,
          color: executedMove.color,
          san: executedMove.san,
          type: "danger_levels",
          badge: "🎯 DANGER LEVELS!",
          title: `DANGER LEVELS! ${sideName} Counter-Attacks with ${executedMove.san}!`,
          description: `Instead of passively retreating an attacked piece, ${sideName} creates an even bigger threat against ${enemyName}!`,
          importance: "critical",
        });
      }
    }
  } catch {
    // Ignore FEN parse edge cases
  }

  // 5. "PP ON THE PP" (Put Pressure on the Pinned/Attacked Piece)
  for (const sq of ALL_SQUARES) {
    const targetPiece = postMoveChess.get(sq);
    if (
      targetPiece &&
      targetPiece.color === enemyColor &&
      PIECE_VALUES[targetPiece.type] >= 3
    ) {
      const currentAttackers = postMoveChess.attackers(sq, executedMove.color);
      if (
        currentAttackers.length >= 2 &&
        currentAttackers.includes(destSquare)
      ) {
        events.push({
          id: `pp-${ply}`,
          ply,
          moveNumber,
          color: executedMove.color,
          san: executedMove.san,
          type: "pressure",
          badge: "📌 PILING UP PRESSURE!",
          title: `Putting Pressure on ${enemyName}'s ${PIECE_NAMES[targetPiece.type]} (${sq})!`,
          description: `${sideName} brings a ${currentAttackers.length === 2 ? "second" : "third"} attacker onto the ${PIECE_NAMES[targetPiece.type]} on ${sq}!`,
          importance: "notable",
        });
        break;
      }
    }
  }

  // 6. Classic Principle Callout: "Never Play f6 / f3!"
  if (
    ply <= 14 &&
    ((executedMove.color === "w" && executedMove.san === "f3") ||
      (executedMove.color === "b" && executedMove.san === "f6"))
  ) {
    events.push({
      id: `f6-${ply}`,
      ply,
      moveNumber,
      color: executedMove.color,
      san: executedMove.san,
      type: "principle_warning",
      badge: `⚠️ NEVER PLAY ${executedMove.san.toUpperCase()}!`,
      title: `${sideName} Pushes ${executedMove.san} — Opening the King's Diagonal!`,
      description: `Classic chess rule: pushing the f-pawn early weakens the protective shield right in front of the ${sideName} King!`,
      importance: "notable",
    });
  }

  // 7. Pawn Promotion
  if (executedMove.promotion) {
    const promoName = PIECE_NAMES[executedMove.promotion] || "Queen";
    events.push({
      id: `promo-${ply}`,
      ply,
      moveNumber,
      color: executedMove.color,
      san: executedMove.san,
      type: "promotion",
      badge: "👑 PAWN PROMOTION",
      title: `Pawn Promoted to a ${promoName}!`,
      description: `${sideName}'s pawn marched all the way to ${executedMove.to} and transformed into a ${promoName}!`,
      importance: "critical",
    });
  }

  // 8. Castling
  if (executedMove.flags.includes("k") || executedMove.flags.includes("q")) {
    const sideType = executedMove.flags.includes("k")
      ? "Kingside"
      : "Queenside";
    events.push({
      id: `castle-${ply}`,
      ply,
      moveNumber,
      color: executedMove.color,
      san: executedMove.san,
      type: "castle",
      badge: "🏰 CASTLED",
      title: `${sideName} Castles ${sideType} (${executedMove.san})`,
      description: `${sideName} tucks the King away to safety and activates the Rook toward the center!`,
      importance: "notable",
    });
  }

  // 9. Captures (First Blood & Major Captures)
  if (executedMove.captured) {
    const victimName = PIECE_NAMES[executedMove.captured] || "Piece";
    const victimVal = PIECE_VALUES[executedMove.captured];
    if (!hadPriorCaptures) {
      events.push({
        id: `fb-${ply}`,
        ply,
        moveNumber,
        color: executedMove.color,
        san: executedMove.san,
        type: "first_blood",
        badge: "🔥 FIRST BLOOD",
        title: `First Capture of the Match! (${executedMove.san})`,
        description: `${sideName}'s ${moverName} captures ${enemyName}'s ${victimName} on ${executedMove.to}, drawing first blood!`,
        importance: "notable",
      });
    } else if (victimVal >= 5) {
      events.push({
        id: `majcap-${ply}`,
        ply,
        moveNumber,
        color: executedMove.color,
        san: executedMove.san,
        type: "major_capture",
        badge: victimVal >= 9 ? "💥 QUEEN CAPTURED!" : "⚔️ ROOK CAPTURED!",
        title: `${sideName} Captures ${enemyName}'s ${victimName} on ${executedMove.to}!`,
        description: `A high-value ${victimName} (${victimVal} pts) comes off the board on ${executedMove.to}.`,
        importance: "critical",
      });
    }
  }

  // 10. Check
  if (postMoveChess.inCheck()) {
    events.push({
      id: `check-${ply}`,
      ply,
      moveNumber,
      color: executedMove.color,
      san: executedMove.san,
      type: "check",
      badge: "⚡ CHECK!",
      title: `${sideName} Puts ${enemyName}'s King in Check!`,
      description: `${sideName}'s ${executedMove.san} attacks the ${enemyName} King directly—${enemyName} is forced to respond immediately.`,
      importance: "notable",
    });
  }

  // 11. Fork / Double Attack Detection
  const attackedValuableTargets: string[] = [];
  for (const sq of ALL_SQUARES) {
    const targetPiece = postMoveChess.get(sq);
    if (
      targetPiece &&
      targetPiece.color === enemyColor &&
      (PIECE_VALUES[targetPiece.type] >= 3 || targetPiece.type === "k")
    ) {
      const attackers = postMoveChess.attackers(sq, executedMove.color);
      if (attackers.includes(destSquare)) {
        attackedValuableTargets.push(
          `${PIECE_NAMES[targetPiece.type]} on ${sq}`
        );
      }
    }
  }

  if (attackedValuableTargets.length >= 2) {
    events.push({
      id: `fork-${ply}`,
      ply,
      moveNumber,
      color: executedMove.color,
      san: executedMove.san,
      type: "fork",
      badge: "🍴 TACTICAL FORK!",
      title: `${sideName}'s ${moverName} Forks ${attackedValuableTargets.length} Pieces!`,
      description: `From ${executedMove.to}, the ${moverName} simultaneously threatens ${enemyName}'s ${attackedValuableTargets.join(" and ")}!`,
      importance: "critical",
    });
  }

  // 12. Momentum Swing Detection
  const swing = newEvalCp - prevEvalCp;
  if (Math.abs(swing) >= 1.5 && ply > 2) {
    const favored = swing > 0 ? "White" : "Black";
    events.push({
      id: `swing-${ply}`,
      ply,
      moveNumber,
      color: executedMove.color,
      san: executedMove.san,
      type: "momentum_swing",
      badge: "📈 MOMENTUM SWING",
      title: `Evaluation Swings ${swing > 0 ? "+" : ""}${swing.toFixed(1)} Toward ${favored}!`,
      description: `Move ${executedMove.san} dramatically shifts the balance of power on the board.`,
      importance: "critical",
    });
  }

  // 13. Determine Chess.com / Gotham-Style Move Classification (!!, !, ★, 📖, ?!, ?, ??)
  let classification: MoveClassification = "best";
  const historySan = postMoveChess.history();
  const isKnownBook =
    ply <= 10 &&
    OPENING_BOOK.some(
      (entry) =>
        historySan.length <= entry.moves.length &&
        historySan.every((m, idx) => entry.moves[idx] === m)
    );

  if (isBrilliantSacrifice) {
    classification = "brilliant";
  } else if (sideEvalDelta <= -2.0) {
    classification = "blunder";
  } else if (sideEvalDelta <= -1.0) {
    classification = "mistake";
  } else if (sideEvalDelta <= -0.45) {
    classification = "inaccuracy";
  } else if (isKnownBook) {
    classification = "book";
  } else if (
    sideEvalDelta >= 0.85 ||
    attackedValuableTargets.length >= 2 ||
    (executedMove.captured && PIECE_VALUES[executedMove.captured] >= 5)
  ) {
    classification = "great";
  } else {
    classification = "best";
  }

  return { events, wasExpectedReply, classification };
}

export interface SideGameReviewStats {
  accuracy: number;
  estimatedElo: number;
  eloTitle: string;
  counts: Record<MoveClassification, number>;
}

/**
 * Computes Chess.com / GothamChess "Guess the Elo" & Game Review Accuracy Scorecard
 */
export function computeGameReviewSummary(
  telemetryHistory: MoveTelemetrySnapshot[]
): {
  white: SideGameReviewStats;
  black: SideGameReviewStats;
} {
  function buildForColor(color: Color): SideGameReviewStats {
    const counts: Record<MoveClassification, number> = {
      brilliant: 0,
      great: 0,
      best: 0,
      book: 0,
      inaccuracy: 0,
      mistake: 0,
      blunder: 0,
    };

    const moves = telemetryHistory.filter((t) => t.color === color);
    if (moves.length === 0) {
      return {
        accuracy: 100,
        estimatedElo: 1500,
        eloTitle: "Awaiting Opening Move",
        counts,
      };
    }

    const scoreMap: Record<MoveClassification, number> = {
      brilliant: 100,
      great: 98,
      best: 93,
      book: 96,
      inaccuracy: 72,
      mistake: 45,
      blunder: 15,
    };

    let totalScore = 0;
    for (const m of moves) {
      counts[m.classification]++;
      totalScore += scoreMap[m.classification];
    }

    const accuracy = Number((totalScore / moves.length).toFixed(1));
    const rawElo =
      600 +
      Math.round((accuracy / 100) * 1850) +
      counts.brilliant * 90 +
      counts.great * 35 -
      counts.blunder * 140 -
      counts.mistake * 60;
    const estimatedElo = Math.max(400, Math.min(2750, Math.round(rawElo / 25) * 25));

    let eloTitle = "Club Contender";
    if (estimatedElo >= 2400) eloTitle = "Grandmaster Energy 🔥";
    else if (estimatedElo >= 2000) eloTitle = "Master Tactician ⚡";
    else if (estimatedElo >= 1600) eloTitle = "Sharp Club Player 🎯";
    else if (estimatedElo >= 1150) eloTitle = "Rising Improver 📈";
    else eloTitle = "Chaotic Entertainer 🍿";

    return {
      accuracy,
      estimatedElo,
      eloTitle,
      counts,
    };
  }

  return {
    white: buildForColor("w"),
    black: buildForColor("b"),
  };
}

/**
 * Generates a numbered 3-step continuation arrow chain (① -> ② -> ③) on the 3D board,
 * just like GothamChess's multi-move calculation sequences!
 */
export function computeMultiStepContinuation(
  currentFen: string,
  lastMove: { from: string; to: string } | null,
  expectedReplySan: string | null
): { arrows: BoardArrow[]; summaryText: string } {
  const arrows: BoardArrow[] = [];
  const stepLabels: string[] = [];

  if (lastMove) {
    arrows.push({
      from: lastMove.from,
      to: lastMove.to,
      color: "#10B981", // Green Step 1
      sequenceIndex: 1,
    });
  }

  try {
    const simChess = new Chess(currentFen);
    if (simChess.isGameOver()) {
      return {
        arrows,
        summaryText: "Game is over — no further continuation moves.",
      };
    }

    const verboseMoves = simChess.moves({ verbose: true });
    let step2Move = expectedReplySan
      ? verboseMoves.find(
          (m) =>
            m.san.replace(/[+#!?]/g, "") ===
            expectedReplySan.replace(/[+#!?]/g, "")
        )
      : null;

    if (!step2Move) {
      // Pick the most active capture/check or central developing move
      step2Move =
        verboseMoves.find((m) => m.san.includes("+") || m.captured) ||
        verboseMoves[0];
    }

    if (step2Move) {
      const seqNum2 = arrows.length + 1;
      arrows.push({
        from: step2Move.from,
        to: step2Move.to,
        color: "#EF4444", // Red Opponent Reply
        sequenceIndex: seqNum2,
      });
      stepLabels.push(
        `(${seqNum2}) ${simChess.turn() === "w" ? "White" : "Black"} replies ${step2Move.san}`
      );
      simChess.move(step2Move);

      // Step 3: Follow-up counter-strike
      if (!simChess.isGameOver()) {
        const followUpVerbose = simChess.moves({ verbose: true });
        const step3Move =
          followUpVerbose.find((m) => m.san.includes("+") || m.captured) ||
          followUpVerbose[0];
        if (step3Move) {
          const seqNum3 = arrows.length + 1;
          arrows.push({
            from: step3Move.from,
            to: step3Move.to,
            color: "#3B82F6", // Blue Follow-up Plan
            sequenceIndex: seqNum3,
          });
          stepLabels.push(
            `(${seqNum3}) ${simChess.turn() === "w" ? "White" : "Black"} counters with ${step3Move.san}`
          );
        }
      }
    }
  } catch {
    // Fallback
  }

  return {
    arrows,
    summaryText:
      stepLabels.length > 0
        ? `Calculated Line: ${stepLabels.join(" → ")}`
        : "Showing active move vector on the 3D board.",
  };
}

