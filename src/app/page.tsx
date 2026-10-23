// src/app/page.tsx
"use client";

import React, { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import type { PieceSymbol } from "chess.js";
import { useChessStore } from "@/store/useChessStore";
import type {
  CameraViewPreset,
  CoachingSkillLevel,
  ControllerType,
  GeminiModelId,
  OpenAIModelId,
  SeatConfig,
  ThinkingLevel,
} from "@/types/chess";
import SpectatorDashboard, {
  VerticalEvalBar,
} from "@/components/SpectatorDashboard";
import { MOVE_CLASSIFICATION_META } from "@/lib/chess-analytics";

// Dynamically load the 3D WebGL Canvas on the client
const ChessScene = dynamic(() => import("@/components/canvas/ChessScene"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-slate-950 text-slate-400 font-mono text-sm rounded-xl border border-slate-800">
      Initializing Lightweight Procedural 3D WebGL Engine...
    </div>
  ),
});

function SeatConfigCard({
  label,
  seat,
  isTurn,
  onChange,
}: {
  label: string;
  seat: SeatConfig;
  isTurn: boolean;
  onChange: (partial: Partial<SeatConfig>) => void;
}) {
  return (
    <div
      className={`p-3 rounded-lg border transition-colors ${
        isTurn
          ? "bg-slate-900/90 border-blue-500/80 shadow-md"
          : "bg-slate-900/40 border-slate-800"
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-bold uppercase tracking-wider text-slate-200 flex items-center gap-2">
          <span
            className={`w-2.5 h-2.5 rounded-full ${
              seat.color === "w" ? "bg-white" : "bg-amber-500"
            }`}
          />
          {label}
        </span>
        {seat.interactionId && (
          <span
            className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800"
            title={seat.interactionId}
          >
            Stateful ID Active
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <label className="block text-[10px] text-slate-400 mb-1">
            Controller
          </label>
          <select
            value={seat.controller}
            onChange={(e) =>
              onChange({
                controller: e.target.value as ControllerType,
                interactionId: null,
              })
            }
            className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-slate-200"
          >
            <option value="human">Human Player</option>
            <option value="gemini">Google Gemini AI</option>
            <option value="openai">OpenAI Responses AI</option>
          </select>
        </div>

        {seat.controller === "gemini" && (
          <div>
            <label className="block text-[10px] text-slate-400 mb-1">
              Gemini Model (Latest Only)
            </label>
            <select
              value={seat.geminiModel}
              onChange={(e) =>
                onChange({ geminiModel: e.target.value as GeminiModelId })
              }
              className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-slate-200"
            >
              <option value="gemini-4-argon">gemini-4-argon</option>
              <option value="gemini-3.8-flash">gemini-3.8-flash</option>
            </select>
          </div>
        )}

        {seat.controller === "openai" && (
          <div>
            <label className="block text-[10px] text-slate-400 mb-1">
              OpenAI Model
            </label>
            <select
              value={seat.openaiModel}
              onChange={(e) =>
                onChange({ openaiModel: e.target.value as OpenAIModelId })
              }
              className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-slate-200"
            >
              <option value="gpt-5.5">gpt-5.5</option>
              <option value="gpt-4o">gpt-4o</option>
              <option value="gpt-4o-mini">gpt-4o-mini</option>
            </select>
          </div>
        )}

        {seat.controller !== "human" && (
          <div className="col-span-2">
            <label className="block text-[10px] text-slate-400 mb-1">
              Deliberation Mode (thinking_level)
            </label>
            <div className="grid grid-cols-3 gap-1">
              {(["low", "medium", "high"] as ThinkingLevel[]).map((lvl) => (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => onChange({ thinkingLevel: lvl })}
                  className={`py-1 rounded text-[11px] font-mono uppercase border ${
                    seat.thinkingLevel === lvl
                      ? "bg-blue-600 border-blue-400 text-white"
                      : "bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {lvl}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const PROMOTION_OPTIONS: { type: PieceSymbol; label: string; symbol: string }[] = [
  { type: "q", label: "Queen", symbol: "♛" },
  { type: "r", label: "Rook", symbol: "♜" },
  { type: "b", label: "Bishop", symbol: "♝" },
  { type: "n", label: "Knight", symbol: "♞" },
];

const PIECE_SYMBOLS: Record<PieceSymbol, string> = {
  p: "♟",
  n: "♞",
  b: "♝",
  r: "♜",
  q: "♛",
  k: "♚",
};

const TELESTRATOR_PALETTE = [
  { color: "#10B981", label: "🟢 Plan / Best" },
  { color: "#EF4444", label: "🔴 Threat / Danger" },
  { color: "#F59E0B", label: "🟡 Counter / Idea" },
  { color: "#3B82F6", label: "🔵 Alternative" },
];

export default function ChessPlatformPage() {
  const {
    fen,
    pgn,
    turn,
    inCheck,
    isGameOver,
    gameResultText,
    moveHistorySan,
    inspectedPiece,
    threatenedPlayerSquares,
    showBeginnerHelpers,
    showBoardHeatmap,
    skillLevel,
    awaitingTakebackDecision,
    pendingPromotion,
    telestratorMode,
    telestratorColor,
    telestratorAnchorSquare,
    hypeCommentatorMode,
    cameraPreset,
    apiError,
    gameMode,
    matchStatus,
    aiDelayMs,
    isAiThinking,
    whiteSeat,
    blackSeat,
    teacherModel,
    teacherThinkingLevel,
    activeLesson,
    isTeacherLoading,
    thoughtLogs,
    boardAnalytics,
    noteworthyEvents,
    dispatchCommand,
    completePromotion,
    cancelPromotion,
    setCameraPreset,
    setShowBeginnerHelpers,
    setShowBoardHeatmap,
    setSkillLevel,
    setTelestratorMode,
    setTelestratorColor,
    clearBoardAnnotations,
    visualizeMultiStepLine,
    setHypeCommentatorMode,
    tryTeacherRecommendedMove,
    undoMistakeAndRetry,
    keepMoveAndContinue,
    rewindFromGameOver,
    clearApiError,
    setSeatConfig,
    setGameMode,
    setMatchStatus,
    setAiDelayMs,
    setTeacherConfig,
    startSpectatorShowcase,
    requestAiTurn,
    requestTeacherCoaching,
  } = useChessStore();

  const [cliInput, setCliInput] = useState("");
  const [chatInput, setChatInput] = useState("");
  const [teacherQuestion, setTeacherQuestion] = useState("");
  const [copiedBadge, setCopiedBadge] = useState<"fen" | "pgn" | null>(null);

  const latestMoveEvent =
    noteworthyEvents.length > 0 &&
    noteworthyEvents[0].ply === moveHistorySan.length
      ? noteworthyEvents[0]
      : null;

  // Autonomous AI Turn Orchestrator (Supports Human vs AI and AI vs AI auto-play in Match mode)
  useEffect(() => {
    if (
      matchStatus !== "playing" ||
      isGameOver ||
      isAiThinking ||
      awaitingTakebackDecision
    )
      return;

    const currentSeat = turn === "w" ? whiteSeat : blackSeat;
    if (currentSeat.controller !== "human") {
      const timer = setTimeout(() => {
        requestAiTurn();
      }, aiDelayMs);
      return () => clearTimeout(timer);
    }
  }, [
    fen,
    turn,
    matchStatus,
    isGameOver,
    isAiThinking,
    awaitingTakebackDecision,
    whiteSeat,
    blackSeat,
    aiDelayMs,
    requestAiTurn,
  ]);

  const handleCliSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const raw = cliInput.trim();
    if (!raw) return;

    if (raw.toLowerCase() === "/reset") {
      dispatchCommand({ type: "RESET" });
    } else if (raw.toLowerCase() === "/undo") {
      dispatchCommand({ type: "UNDO" });
    } else if (raw.toLowerCase().startsWith("/fen ")) {
      dispatchCommand({ type: "LOAD_FEN", fen: raw.slice(5).trim() });
    } else {
      dispatchCommand({
        type: "MOVE",
        move: raw,
        source: "human-cli",
      });
    }
    setCliInput("");
  };

  const handleCopy = async (type: "fen" | "pgn") => {
    const text = type === "fen" ? fen : pgn || moveHistorySan.join(" ");
    await navigator.clipboard.writeText(text);
    setCopiedBadge(type);
    setTimeout(() => setCopiedBadge(null), 1600);
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex flex-col p-4 gap-4">
      {/* Top Header & Mode Switcher */}
      <header className="flex flex-wrap items-center justify-between gap-4 bg-slate-900/80 border border-slate-800 px-4 py-3 rounded-xl">
        <div>
          <h1 className="text-lg font-bold tracking-tight text-white">
            Next.js 3D WebGL AI Chess Arena, Broadcast Spectator &amp; Gentle Coach
          </h1>
          <p className="text-xs text-slate-400 font-mono">
            Google Gemini Interactions API (gemini-4-argon &amp; gemini-3.8-flash)
            + OpenAI Responses API
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setHypeCommentatorMode(!hypeCommentatorMode)}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border transition ${
              hypeCommentatorMode
                ? "bg-amber-500 text-slate-950 border-amber-400 shadow-sm"
                : "bg-slate-900 border-slate-700 text-amber-300 hover:border-amber-500/60"
            }`}
            title="Enables GothamChess / Levy Rozman energetic creator commentary ('THE ROOOOOOK!!', 'Danger Levels', 'PP on the PP') in AI coaching & match chat!"
          >
            {hypeCommentatorMode
              ? "🎙️ Gotham Hype Mode: ON"
              : "🎙️ Gotham Hype Mode: OFF"}
          </button>

          <button
            type="button"
            onClick={() => setShowBoardHeatmap(!showBoardHeatmap)}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition ${
              showBoardHeatmap
                ? "bg-fuchsia-950/90 border-fuchsia-500 text-fuchsia-200"
                : "bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-200"
            }`}
          >
            {showBoardHeatmap
              ? "🔥 3D Territory Heatmap: ON"
              : "🔥 3D Territory Heatmap: OFF"}
          </button>

          <button
            type="button"
            onClick={() => setShowBeginnerHelpers(!showBeginnerHelpers)}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition ${
              showBeginnerHelpers
                ? "bg-emerald-950/90 border-emerald-600 text-emerald-300"
                : "bg-slate-900 border-slate-700 text-slate-400"
            }`}
          >
            {showBeginnerHelpers
              ? "✓ Piece & Threat Guide: ON"
              : "Piece & Threat Guide: OFF"}
          </button>

          <button
            type="button"
            onClick={() => handleCopy("fen")}
            className="px-2.5 py-1.5 rounded-lg text-xs font-mono bg-slate-950 border border-slate-800 text-slate-300 hover:border-slate-600 transition"
            title={fen}
          >
            {copiedBadge === "fen" ? "Copied FEN!" : "Copy FEN"}
          </button>
          <button
            type="button"
            onClick={() => handleCopy("pgn")}
            className="px-2.5 py-1.5 rounded-lg text-xs font-mono bg-slate-950 border border-slate-800 text-slate-300 hover:border-slate-600 transition"
          >
            {copiedBadge === "pgn" ? "Copied PGN!" : "Copy PGN"}
          </button>

          <div className="h-4 w-px bg-slate-800 mx-1" />

          <button
            type="button"
            onClick={() => setGameMode("teacher")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              gameMode === "teacher"
                ? "bg-emerald-600 text-white shadow-sm"
                : "bg-slate-800 text-slate-300 hover:bg-slate-700"
            }`}
          >
            Gentle AI Teacher Mode
          </button>
          <button
            type="button"
            onClick={() => setGameMode("match")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              gameMode === "match"
                ? "bg-blue-600 text-white shadow-sm"
                : "bg-slate-800 text-slate-300 hover:bg-slate-700"
            }`}
          >
            Match &amp; Spectator Arena
          </button>
          <button
            type="button"
            onClick={() => startSpectatorShowcase("gemini-duel")}
            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white shadow-md transition flex items-center gap-1.5"
          >
            🎥 Spectate AI vs AI Live
          </button>
        </div>
      </header>

      {/* Optional API Error Banner */}
      {apiError && (
        <div className="bg-red-950/90 border border-red-800 text-red-200 px-4 py-2.5 rounded-xl flex items-center justify-between text-xs font-mono">
          <span>API Alert: {apiError}</span>
          <button
            type="button"
            onClick={clearApiError}
            className="px-2 py-0.5 rounded bg-red-900 hover:bg-red-800 text-white"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 flex-1">
        {/* Left Column: Live Eval Bar + 3D Viewport, Piece Movement Helper & Command Input Bar (7 cols) */}
        <section className="lg:col-span-7 flex flex-col gap-3 min-h-[540px]">
          <div className="flex-1 flex gap-2.5 min-h-[440px]">
            {/* Broadcast Vertical Tug-of-War Evaluation Bar */}
            <VerticalEvalBar />

            <div className="flex-1 relative">
              <ChessScene />

              {/* Live Status Overlay Badge */}
              <div className="absolute top-3 left-3 bg-slate-900/90 backdrop-blur border border-slate-700 px-3 py-1.5 rounded-lg flex flex-wrap items-center gap-2.5 text-xs">
                <span className="font-semibold">
                  Turn:{" "}
                  {turn === "w"
                    ? `White (${whiteSeat.controller === "human" ? "You" : whiteSeat.geminiModel})`
                    : `Black (${blackSeat.controller === "human" ? "Human" : blackSeat.controller === "gemini" ? blackSeat.geminiModel : blackSeat.openaiModel})`}
                </span>
                <span className="px-2 py-0.5 rounded bg-slate-800 text-blue-300 font-mono text-[11px]">
                  {boardAnalytics.opening.eco}: {boardAnalytics.opening.name}
                </span>
                {inCheck && (
                  <span className="px-2 py-0.5 rounded bg-red-600 text-white font-bold">
                    CHECK
                  </span>
                )}
                {showBeginnerHelpers &&
                  whiteSeat.controller === "human" &&
                  threatenedPlayerSquares.length > 0 && (
                    <span className="px-2 py-0.5 rounded bg-amber-600/90 text-white font-semibold">
                      ⚠ {threatenedPlayerSquares.length} Piece
                      {threatenedPlayerSquares.length > 1 ? "s" : ""} Threatened (
                      {threatenedPlayerSquares.join(", ")})
                    </span>
                  )}
                {(isAiThinking || isTeacherLoading) && (
                  <span className="px-2 py-0.5 rounded bg-blue-600/80 text-white font-mono animate-pulse">
                    {isTeacherLoading
                      ? "Coach Reviewing Move..."
                      : `${turn === "w" ? "White" : "Black"} AI Deliberating...`}
                  </span>
                )}
                {gameResultText && (
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-amber-500 text-slate-950 font-bold">
                      {gameResultText}
                    </span>
                    {gameMode === "teacher" && (
                      <button
                        type="button"
                        onClick={rewindFromGameOver}
                        className="px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-semibold"
                      >
                        ↺ Rewind &amp; Keep Practicing
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Live Broadcast Noteworthy Event Callout Banner on 3D Canvas */}
              {latestMoveEvent && (
                <div className="absolute top-14 left-3 bg-slate-950/95 backdrop-blur border border-amber-500/80 px-3 py-1.5 rounded-lg flex items-center gap-2 text-xs shadow-lg max-w-md">
                  <span className="px-1.5 py-0.5 rounded bg-amber-500 text-slate-950 font-mono font-extrabold text-[10px] shrink-0">
                    {latestMoveEvent.badge}
                  </span>
                  <div className="truncate">
                    <span className="font-bold text-amber-200 mr-1.5">
                      {latestMoveEvent.title}
                    </span>
                    <span className="text-slate-300 text-[11px]">
                      {latestMoveEvent.description}
                    </span>
                  </div>
                </div>
              )}

              {/* Camera View Preset Selector Overlay */}
              <div className="absolute top-3 right-3 bg-slate-900/90 backdrop-blur border border-slate-700 p-1 rounded-lg flex items-center gap-1 text-[11px] font-mono">
                {(
                  [
                    { id: "broadcast", label: "🎥 Orbit" },
                    { id: "white", label: "White POV" },
                    { id: "black", label: "Black POV" },
                    { id: "top", label: "Top 2D" },
                    { id: "side", label: "Side" },
                  ] as { id: CameraViewPreset; label: string }[]
                ).map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => setCameraPreset(preset.id)}
                    className={`px-2 py-1 rounded transition ${
                      cameraPreset === preset.id
                        ? "bg-blue-600 text-white"
                        : "text-slate-300 hover:bg-slate-800"
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

              {/* Beginner & Spectator Visual Color Legend Overlay (Bottom of 3D Canvas) */}
              {(showBeginnerHelpers || showBoardHeatmap) && (
                <div className="absolute bottom-3 left-3 right-3 bg-slate-950/90 backdrop-blur border border-slate-800 px-3 py-2 rounded-lg flex flex-wrap items-center justify-between gap-2 text-[11px]">
                  <div className="flex flex-wrap items-center gap-3 text-slate-300">
                    {showBoardHeatmap ? (
                      <>
                        <span className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-sm bg-blue-500 inline-block" />
                          White Territory Control
                        </span>
                        <span className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-sm bg-amber-500 inline-block" />
                          Black Territory Control
                        </span>
                        <span className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-sm bg-pink-500 inline-block" />
                          Contested Battleground (Equal Attackers)
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
                          Safe Move / Capture
                        </span>
                        <span className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" />
                          Risky (Enemy Watches Square)
                        </span>
                        <span className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full border-2 border-red-500 inline-block" />
                          Piece In Danger
                        </span>
                        <span className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block" />
                          Clicked Piece Attack Range
                        </span>
                      </>
                    )}
                  </div>
                  <span className="text-slate-400 font-mono">
                    Tip: Click ANY piece on the 3D board to inspect its range &amp; rules!
                  </span>
                </div>
              )}

              {/* Interactive Pawn Promotion Selector Modal */}
              {pendingPromotion && (
                <div className="absolute inset-0 bg-slate-950/75 backdrop-blur-sm flex items-center justify-center z-20">
                  <div className="bg-slate-900 border border-slate-700 rounded-xl p-4 shadow-2xl max-w-xs w-full space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold uppercase tracking-wider text-white">
                        Promote Pawn ({pendingPromotion.from} &rarr;{" "}
                        {pendingPromotion.to})
                      </span>
                      <button
                        type="button"
                        onClick={cancelPromotion}
                        className="text-xs text-slate-400 hover:text-white"
                      >
                        Cancel
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {PROMOTION_OPTIONS.map((opt) => (
                        <button
                          key={opt.type}
                          type="button"
                          onClick={() => completePromotion(opt.type)}
                          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-950 hover:bg-blue-600/30 border border-slate-800 hover:border-blue-500 text-xs font-semibold text-slate-100 transition"
                        >
                          <span className="text-lg">{opt.symbol}</span>
                          <span>{opt.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Streamer Telestrator & Multi-Step Calculation Toolbar (GothamChess Style) */}
          <div className="bg-slate-900/95 border border-slate-800 px-3 py-2 rounded-xl flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setTelestratorMode(!telestratorMode)}
                className={`px-2.5 py-1 rounded-lg font-bold border transition flex items-center gap-1.5 ${
                  telestratorMode
                    ? "bg-emerald-600 border-emerald-400 text-white shadow"
                    : "bg-slate-950 border-slate-700 text-slate-300 hover:border-slate-500"
                }`}
              >
                🎨 Streamer Telestrator: {telestratorMode ? "DRAWING ON" : "OFF"}
              </button>

              {TELESTRATOR_PALETTE.map((swatch) => (
                <button
                  key={swatch.color}
                  type="button"
                  onClick={() => {
                    setTelestratorColor(swatch.color);
                    if (!telestratorMode) setTelestratorMode(true);
                  }}
                  className={`px-2 py-1 rounded-md text-[11px] font-medium border transition ${
                    telestratorColor === swatch.color && telestratorMode
                      ? "bg-slate-800 border-white text-white"
                      : "bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {swatch.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              {telestratorMode && (
                <span className="text-[11px] font-mono text-emerald-300">
                  {telestratorAnchorSquare
                    ? `From ${telestratorAnchorSquare} → Click target square (or ${telestratorAnchorSquare} to highlight)`
                    : "Click 1st square → 2nd square for arrow!"}
                </span>
              )}
              <button
                type="button"
                onClick={visualizeMultiStepLine}
                className="px-2.5 py-1 rounded-lg bg-indigo-950/90 hover:bg-indigo-800 border border-indigo-600/80 text-indigo-200 text-[11px] font-bold transition"
                title="Draws numbered 3-step continuation arrows (① → ② → ③) on the 3D board!"
              >
                🎯 Show 3-Move Line (①→②→③)
              </button>
              <button
                type="button"
                onClick={clearBoardAnnotations}
                className="px-2 py-1 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-700 text-slate-300 text-[11px] transition"
              >
                🧹 Clear Arrows
              </button>
            </div>
          </div>

          {/* Beginner Piece Movement & Rules Guide Card */}
          {showBeginnerHelpers && (
            <div className="bg-slate-900/90 border border-slate-800 px-3.5 py-2.5 rounded-xl flex items-start gap-3 text-xs">
              <div className="text-2xl leading-none bg-slate-950 border border-slate-800 rounded-lg p-2 text-blue-400 select-none">
                {inspectedPiece ? PIECE_SYMBOLS[inspectedPiece.type] : "♟"}
              </div>
              <div className="flex-1 space-y-1">
                {inspectedPiece ? (
                  <>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-bold text-white">
                        {inspectedPiece.color === "w" ? "Your" : "Opponent's"}{" "}
                        {inspectedPiece.name} on{" "}
                        <span className="font-mono text-blue-400">
                          {inspectedPiece.square}
                        </span>
                      </span>
                      {inspectedPiece.specialNote && (
                        <span
                          className={`text-[11px] font-medium px-2 py-0.5 rounded ${
                            inspectedPiece.color === "w"
                              ? "bg-emerald-950/90 text-emerald-300 border border-emerald-800/70"
                              : "bg-rose-950/90 text-rose-300 border border-rose-800/70"
                          }`}
                        >
                          {inspectedPiece.specialNote}
                        </span>
                      )}
                    </div>
                    <p className="text-slate-300 leading-relaxed">
                      <span className="text-slate-400 font-semibold">
                        How the {inspectedPiece.name} moves:{" "}
                      </span>
                      {inspectedPiece.movementRule}
                    </p>
                  </>
                ) : (
                  <>
                    <span className="font-bold text-slate-200 block">
                      Interactive Piece Movement Guide
                    </span>
                    <p className="text-slate-400">
                      Click any of your White pieces on the 3D board to see where
                      it can move (green = safe, amber = watched by an enemy
                      piece), or click any Black piece to see which squares it
                      is currently attacking!
                    </p>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Deterministic Command-Line Input Bar */}
          <form
            onSubmit={handleCliSubmit}
            className="flex items-center gap-2 bg-slate-900 border border-slate-800 p-2 rounded-xl"
          >
            <span className="text-xs font-mono text-blue-400 px-2">CMD&gt;</span>
            <input
              type="text"
              value={cliInput}
              onChange={(e) => setCliInput(e.target.value)}
              placeholder="Enter SAN move (e.g. e4, Nf3, O-O) or /undo, /reset, /fen <string>..."
              className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs font-mono text-slate-100 focus:outline-none focus:border-blue-500"
            />
            <button
              type="submit"
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold"
            >
              Execute Command
            </button>
          </form>
        </section>

        {/* Right Column: Interactive AI Chess Teacher, Controllers, and Live Thought Log (5 cols) */}
        <aside className="lg:col-span-5 flex flex-col gap-3">
          {/* Interactive AI Chess Teacher Panel (Primary Panel in Teacher Mode) */}
          {gameMode === "teacher" && (
            <div className="bg-emerald-950/20 border border-emerald-800/60 p-3.5 rounded-xl flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                    Gentle AI Chess Teacher
                  </span>
                  <button
                    type="button"
                    disabled={isTeacherLoading}
                    onClick={() =>
                      requestTeacherCoaching(
                        "I'm not sure what to do next. Can you show me 2 or 3 safe moves I can play right now and explain them simply?",
                        null
                      )
                    }
                    className="px-2 py-0.5 rounded bg-emerald-700 hover:bg-emerald-600 text-white text-[11px] font-semibold transition disabled:opacity-40"
                  >
                    💡 Give Me a Hint
                  </button>
                </div>

                <div className="flex items-center gap-1.5">
                  <select
                    value={skillLevel}
                    onChange={(e) =>
                      setSkillLevel(e.target.value as CoachingSkillLevel)
                    }
                    title="Coach & Sparring Partner Gentleness"
                    className="bg-slate-950 border border-emerald-700/70 text-emerald-300 rounded px-2 py-0.5 text-[11px]"
                  >
                    <option value="beginner">Gentle Beginner</option>
                    <option value="casual">Casual Learner</option>
                    <option value="club">Club Practice</option>
                  </select>
                  <select
                    value={teacherModel}
                    onChange={(e) =>
                      setTeacherConfig(
                        e.target.value as GeminiModelId | OpenAIModelId,
                        teacherThinkingLevel
                      )
                    }
                    className="bg-slate-950 border border-slate-700 rounded px-2 py-0.5 text-[11px]"
                    title="Select Gemini Interactions API or OpenAI Responses API model for Coaching"
                  >
                    <optgroup label="Google Gemini Interactions API">
                      <option value="gemini-4-argon">gemini-4-argon</option>
                      <option value="gemini-3.8-flash">gemini-3.8-flash</option>
                    </optgroup>
                    <optgroup label="OpenAI Responses API (ChatGPT)">
                      <option value="gpt-5.5">gpt-5.5</option>
                      <option value="gpt-4o">gpt-4o</option>
                      <option value="gpt-4o-mini">gpt-4o-mini</option>
                    </optgroup>
                  </select>
                  <select
                    value={teacherThinkingLevel}
                    onChange={(e) =>
                      setTeacherConfig(
                        teacherModel,
                        e.target.value as ThinkingLevel
                      )
                    }
                    className="bg-slate-950 border border-slate-700 rounded px-2 py-0.5 text-[11px]"
                  >
                    <option value="low">low</option>
                    <option value="medium">medium</option>
                    <option value="high">high</option>
                  </select>
                </div>
              </div>

              {/* Learning Moment / Takeback Intervention Banner */}
              {awaitingTakebackDecision && activeLesson && (
                <div className="bg-amber-950/60 border-2 border-amber-500/80 rounded-xl p-3 text-xs space-y-2.5 shadow-lg">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-amber-300 uppercase tracking-wide flex items-center gap-1.5">
                      ✋ Hold On — Learning Moment!
                    </span>
                    <span className="px-2 py-0.5 rounded bg-amber-900/90 text-amber-200 font-mono text-[10px] uppercase">
                      {activeLesson.last_move_assessment}
                    </span>
                  </div>

                  {activeLesson.mistake_consequence && (
                    <p className="text-amber-100 font-medium leading-relaxed bg-slate-950/70 p-2 rounded border border-amber-800/60">
                      ⚠️ {activeLesson.mistake_consequence}
                    </p>
                  )}

                  <p className="text-slate-200 leading-relaxed">
                    {activeLesson.coaching_explanation}
                  </p>

                  {activeLesson.recommended_moves.length > 0 && (
                    <div className="space-y-1.5 pt-1">
                      <span className="text-[11px] font-bold text-emerald-300 block">
                        Undo that move and try one of these stronger options
                        instead:
                      </span>
                      <div className="space-y-1.5">
                        {activeLesson.recommended_moves.map((rm, idx) => (
                          <div
                            key={idx}
                            className="bg-slate-950/90 border border-emerald-800/70 rounded-lg p-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                          >
                            <div className="text-[11px] text-slate-300">
                              <span className="font-mono font-bold text-emerald-300 mr-1.5">
                                {rm.san} ({rm.from_square}&rarr;{rm.to_square}):
                              </span>
                              {rm.explanation}
                            </div>
                            <button
                              type="button"
                              onClick={() => tryTeacherRecommendedMove(rm.san)}
                              className="shrink-0 px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-[11px] transition"
                            >
                              Undo &amp; Play {rm.san}
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-amber-800/50">
                    <button
                      type="button"
                      onClick={undoMistakeAndRetry}
                      className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold text-xs transition"
                    >
                      ↺ Undo Move &amp; Let Me Pick on Board
                    </button>
                    <button
                      type="button"
                      onClick={keepMoveAndContinue}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition"
                    >
                      Keep My Move Anyway &rarr;
                    </button>
                  </div>
                </div>
              )}

              {/* Standard Encouraging Coaching Card (when not in a paused takeback intervention) */}
              {!awaitingTakebackDecision && activeLesson ? (
                <div className="bg-slate-950/90 border border-slate-800 rounded-lg p-2.5 text-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-emerald-300">
                      Concept: {activeLesson.concept_taught}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-slate-800 text-[10px] font-mono uppercase text-emerald-300">
                      {activeLesson.last_move_assessment}
                    </span>
                  </div>
                  <p className="text-slate-300 leading-relaxed">
                    {activeLesson.coaching_explanation}
                  </p>
                  {activeLesson.recommended_moves.length > 0 && (
                    <div className="space-y-1.5 pt-1">
                      <span className="text-[10px] uppercase text-slate-400 font-semibold block">
                        Suggested Moves (Click to Try on the 3D Board):
                      </span>
                      <div className="space-y-1">
                        {activeLesson.recommended_moves.map((rm, idx) => (
                          <div
                            key={idx}
                            className="flex items-center justify-between gap-2 bg-slate-900/90 border border-slate-800 rounded p-1.5"
                          >
                            <span className="text-[11px] text-slate-300">
                              <strong className="font-mono text-emerald-300">
                                {rm.san} ({rm.from_square}&rarr;{rm.to_square})
                              </strong>{" "}
                              — {rm.explanation}
                            </span>
                            <button
                              type="button"
                              onClick={() => tryTeacherRecommendedMove(rm.san)}
                              className="shrink-0 px-2 py-1 rounded bg-emerald-900/70 hover:bg-emerald-700 border border-emerald-700 text-emerald-100 font-mono text-[11px]"
                            >
                              Try {rm.san}
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                !awaitingTakebackDecision && (
                  <div className="bg-slate-950/70 border border-slate-800/80 rounded-lg p-2.5 text-xs text-slate-300 space-y-1">
                    <p className="font-semibold text-emerald-300">
                      Welcome to Gentle Learning Mode!
                    </p>
                    <p className="text-slate-400 leading-relaxed">
                      Play freely by clicking any White piece. Your AI Coach plays
                      at a gentle beginner pace and watches your back—if you make
                      a risky mistake, the Coach will pause before the opponent
                      moves so you can undo it and try a better move!
                    </p>
                  </div>
                )
              )}

              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={teacherQuestion}
                  onChange={(e) => setTeacherQuestion(e.target.value)}
                  placeholder="Ask the Coach anything (e.g. 'Why is my Knight in danger?', 'How do I castle?')..."
                  className="flex-1 bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs"
                />
                <button
                  type="button"
                  disabled={isTeacherLoading}
                  onClick={() => {
                    requestTeacherCoaching(
                      teacherQuestion || undefined,
                      null
                    );
                    setTeacherQuestion("");
                  }}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-semibold disabled:opacity-40"
                >
                  {isTeacherLoading ? "Analyzing..." : "Ask Coach"}
                </button>
              </div>
            </div>
          )}

          {/* Live Spectator Broadcast & Match Telemetry Dashboard */}
          <SpectatorDashboard />

          {/* Match Orchestration Controls */}
          <div className="bg-slate-900/90 border border-slate-800 p-3 rounded-xl flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Match &amp; Board Controls
              </span>
              <div className="flex items-center gap-1.5">
                {gameMode === "match" && (
                  <button
                    type="button"
                    onClick={() =>
                      setMatchStatus(
                        matchStatus === "playing" ? "paused" : "playing"
                      )
                    }
                    className={`px-3 py-1 rounded text-xs font-bold ${
                      matchStatus === "playing"
                        ? "bg-amber-600 text-white"
                        : "bg-emerald-600 text-white"
                    }`}
                  >
                    {matchStatus === "playing"
                      ? "Pause Auto-Loop"
                      : "Start / Resume Match"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => requestAiTurn()}
                  disabled={isAiThinking || isGameOver}
                  className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 disabled:opacity-40"
                >
                  Step AI
                </button>
                <button
                  type="button"
                  onClick={() => dispatchCommand({ type: "UNDO" })}
                  className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-xs text-slate-200"
                >
                  Undo
                </button>
                <button
                  type="button"
                  onClick={() => dispatchCommand({ type: "RESET" })}
                  className="px-2.5 py-1 rounded bg-red-950/80 hover:bg-red-900 text-xs text-red-200 border border-red-800"
                >
                  Reset
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <SeatConfigCard
                label="White Seat"
                seat={whiteSeat}
                isTurn={turn === "w"}
                onChange={(p) => setSeatConfig("w", p)}
              />
              <SeatConfigCard
                label="Black Seat"
                seat={blackSeat}
                isTurn={turn === "b"}
                onChange={(p) => setSeatConfig("b", p)}
              />
            </div>

            <div className="flex items-center justify-between text-xs text-slate-400 pt-1 border-t border-slate-800">
              <span>AI Pacing Delay: {aiDelayMs} ms</span>
              <input
                type="range"
                min={100}
                max={2500}
                step={100}
                value={aiDelayMs}
                onChange={(e) => setAiDelayMs(Number(e.target.value))}
                className="w-36 accent-blue-500"
              />
            </div>
          </div>

          {/* Live AI Thinking Summaries & Interactive Chat Stream */}
          <div className="bg-slate-900/90 border border-slate-800 p-3 rounded-xl flex-1 flex flex-col gap-2 min-h-[240px] max-h-[380px]">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Live AI Deliberation (`thought` Steps) &amp; Match Log
              </span>
              <span className="text-[11px] font-mono text-slate-500">
                Moves: {moveHistorySan.length}
              </span>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {thoughtLogs.length === 0 ? (
                <div className="text-xs text-slate-500 font-mono py-8 text-center">
                  No turns recorded yet. Click any White piece on the 3D board to
                  make your first move, or click &ldquo;🎥 Spectate AI vs AI
                  Live&rdquo; above!
                </div>
              ) : (
                thoughtLogs.map((log) => (
                  <div
                    key={log.id}
                    className="bg-slate-950 border border-slate-800/90 rounded-lg p-2.5 text-xs space-y-1.5"
                  >
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-bold text-blue-400">
                        {log.modelLabel}
                      </span>
                      <div className="flex items-center gap-2 font-mono text-slate-400">
                        {log.moveClassification && (
                          <span
                            className="px-1.5 py-0.5 rounded font-black text-[10px] text-slate-950"
                            style={{
                              backgroundColor:
                                MOVE_CLASSIFICATION_META[
                                  log.moveClassification
                                ].color,
                            }}
                            title={
                              MOVE_CLASSIFICATION_META[log.moveClassification]
                                .label
                            }
                          >
                            {
                              MOVE_CLASSIFICATION_META[log.moveClassification]
                                .symbol
                            }{" "}
                            {
                              MOVE_CLASSIFICATION_META[log.moveClassification]
                                .label
                            }
                          </span>
                        )}
                        {log.sanMove && (
                          <span className="px-1.5 py-0.5 rounded bg-slate-800 text-white font-bold">
                            {log.sanMove}
                          </span>
                        )}
                        {log.positionalEvaluation !== null && (
                          <span>
                            Eval: {log.positionalEvaluation > 0 ? "+" : ""}
                            {log.positionalEvaluation.toFixed(2)}
                          </span>
                        )}
                        {log.thoughtTokens !== null && (
                          <span>{log.thoughtTokens} thought tok</span>
                        )}
                        {log.latencyMs !== null && <span>{log.latencyMs}ms</span>}
                      </div>
                    </div>

                    {/* Spectator Highlight Badges & AI Prediction Status */}
                    {((log.noteworthyBadges &&
                      log.noteworthyBadges.length > 0) ||
                      log.expectedReplySan) && (
                      <div className="flex flex-wrap items-center gap-1.5">
                        {log.noteworthyBadges?.map((b, i) => (
                          <span
                            key={i}
                            className="px-1.5 py-0.5 rounded bg-amber-500/20 border border-amber-500/50 text-amber-300 font-mono text-[10px] font-bold"
                          >
                            {b}
                          </span>
                        ))}
                        {log.expectedReplySan && (
                          <span className="px-1.5 py-0.5 rounded bg-indigo-950/90 border border-indigo-700/70 text-indigo-300 font-mono text-[10px]">
                            🔮 Predicts Next: {log.expectedReplySan}
                          </span>
                        )}
                      </div>
                    )}

                    <p className="text-slate-200">{log.chatMessage}</p>

                    {log.thoughtSummary && (
                      <details className="bg-slate-900/80 border border-slate-800 rounded p-2 text-[11px] text-slate-400">
                        <summary className="cursor-pointer font-mono text-amber-400/90 select-none">
                          Inspect Internal Thought Summary (`step.type ===
                          &quot;thought&quot;`)
                        </summary>
                        <p className="mt-1.5 whitespace-pre-wrap leading-relaxed font-mono text-[11px] text-slate-300">
                          {log.thoughtSummary}
                        </p>
                      </details>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Interactive Player-to-AI Chat Bar */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!chatInput.trim()) return;
                requestAiTurn(chatInput.trim());
                setChatInput("");
              }}
              className="flex gap-1.5 pt-2 border-t border-slate-800"
            >
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Send a message to the active AI opponent..."
                className="flex-1 bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-xs"
              />
              <button
                type="submit"
                disabled={isAiThinking || isGameOver}
                className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs font-semibold disabled:opacity-40"
              >
                Send &amp; Prompt Turn
              </button>
            </form>
          </div>
        </aside>
      </div>
    </main>
  );
}
