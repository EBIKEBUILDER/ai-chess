// src/components/SpectatorDashboard.tsx
"use client";

import React, { useMemo, useState } from "react";
import type { PieceSymbol } from "chess.js";
import type { MoveClassification } from "@/types/chess";
import { useChessStore } from "@/store/useChessStore";
import {
  computeGameReviewSummary,
  MOVE_CLASSIFICATION_META,
} from "@/lib/chess-analytics";

const CLASSIFICATION_ORDER: MoveClassification[] = [
  "brilliant",
  "great",
  "best",
  "book",
  "inaccuracy",
  "mistake",
  "blunder",
];

const PIECE_ICONS: Record<PieceSymbol, string> = {
  q: "♛",
  r: "♜",
  b: "♝",
  n: "♞",
  p: "♟",
  k: "♚",
};

const FAMOUS_OPENING_SCENARIOS: {
  id: string;
  label: string;
  subtitle: string;
  moves: string[];
}[] = [
  {
    id: "italian",
    label: "Italian Game: Giuoco Piano",
    subtitle: "Classic f7 Bishop & Center Clash",
    moves: ["e4", "e5", "Nf3", "Nc6", "Bc4", "Bc5"],
  },
  {
    id: "queens-gambit",
    label: "Queen's Gambit Declined",
    subtitle: "High-Stakes Central Pawn Tension",
    moves: ["d4", "d5", "c4", "e6", "Nc3", "Nf6"],
  },
  {
    id: "sicilian",
    label: "Sicilian Defense: Open Clash",
    subtitle: "Asymmetric Counter-Attacking Battle",
    moves: ["e4", "c5", "Nf3", "d6", "d4", "cxd4", "Nxd4", "Nf6", "Nc3"],
  },
  {
    id: "kings-gambit",
    label: "King's Gambit Fireworks",
    subtitle: "Romantic-Era Pawn Sacrifice for Attack Lanes",
    moves: ["e4", "e5", "f4", "exf4", "Nf3"],
  },
  {
    id: "ruy-lopez",
    label: "Ruy Lopez: Morphy Defense",
    subtitle: "Grandmaster Championship Staple",
    moves: ["e4", "e5", "Nf3", "Nc6", "Bb5", "a6", "Ba4", "Nf6"],
  },
];

function DualStatBar({
  label,
  tooltip,
  whiteVal,
  blackVal,
  whiteDisplay,
  blackDisplay,
}: {
  label: string;
  tooltip: string;
  whiteVal: number;
  blackVal: number;
  whiteDisplay?: string | number;
  blackDisplay?: string | number;
}) {
  const total = Math.max(1, whiteVal + blackVal);
  const whitePct = Math.round((whiteVal / total) * 100);

  return (
    <div className="space-y-1" title={tooltip}>
      <div className="flex items-center justify-between text-[11px]">
        <span className="font-mono font-bold text-slate-100">
          {whiteDisplay ?? whiteVal}
        </span>
        <span className="text-slate-400 font-medium flex items-center gap-1">
          {label}
        </span>
        <span className="font-mono font-bold text-amber-400">
          {blackDisplay ?? blackVal}
        </span>
      </div>
      <div className="h-2 w-full rounded-full bg-slate-800 overflow-hidden flex border border-slate-700/70">
        <div
          className="h-full bg-gradient-to-r from-blue-400 to-slate-100 transition-all duration-500"
          style={{ width: `${whitePct}%` }}
        />
        <div
          className="h-full bg-gradient-to-r from-amber-600 to-amber-400 transition-all duration-500"
          style={{ width: `${100 - whitePct}%` }}
        />
      </div>
    </div>
  );
}

export function VerticalEvalBar() {
  const { boardAnalytics, turn, isGameOver } = useChessStore();
  const { evaluationCp, whiteWinProb } = boardAnalytics;

  const formattedEval =
    evaluationCp > 0
      ? `+${evaluationCp.toFixed(1)}`
      : evaluationCp.toFixed(1);

  return (
    <div
      className="w-8 sm:w-9 h-full rounded-xl overflow-hidden border border-slate-800 bg-slate-900 flex flex-col justify-between relative select-none shadow-xl"
      title={`Evaluation: ${formattedEval} pawns (${whiteWinProb}% White Win Probability)`}
    >
      {/* Black Top Half (expands downward when Black leads) */}
      <div
        className="w-full bg-gradient-to-b from-slate-900 via-slate-800 to-amber-950/80 transition-all duration-500"
        style={{ height: `${100 - whiteWinProb}%` }}
      />

      {/* White Bottom Half (expands upward when White leads) */}
      <div
        className="w-full bg-gradient-to-t from-slate-100 via-slate-200 to-blue-200 transition-all duration-500"
        style={{ height: `${whiteWinProb}%` }}
      />

      {/* Center 50% Equal Marker */}
      <div className="absolute left-0 right-0 top-1/2 h-0.5 bg-blue-500/60 z-10 pointer-events-none" />

      {/* Top Label (Black %) */}
      <div className="absolute top-2 inset-x-0 text-center z-10 pointer-events-none">
        <span className="text-[10px] font-mono font-bold text-amber-300 drop-shadow">
          {100 - whiteWinProb}%
        </span>
      </div>

      {/* Center Evaluation Pill */}
      <div className="absolute inset-x-0.5 top-1/2 -translate-y-1/2 z-20 pointer-events-none flex justify-center">
        <span
          className={`px-1 py-0.5 rounded text-[9px] font-mono font-extrabold tracking-tighter border shadow ${
            evaluationCp >= 0.25
              ? "bg-white text-slate-950 border-blue-400"
              : evaluationCp <= -0.25
                ? "bg-slate-950 text-amber-400 border-amber-500/70"
                : "bg-slate-900 text-slate-200 border-slate-700"
          }`}
        >
          {isGameOver && Math.abs(evaluationCp) >= 14 ? "MATE" : formattedEval}
        </span>
      </div>

      {/* Bottom Label (White %) */}
      <div className="absolute bottom-2 inset-x-0 text-center z-10 pointer-events-none">
        <span className="text-[10px] font-mono font-bold text-slate-900 drop-shadow">
          {whiteWinProb}%
        </span>
      </div>

      {/* Active Turn Dot */}
      <div
        className={`absolute left-1/2 -translate-x-1/2 w-2 h-2 rounded-full z-20 ${
          turn === "w"
            ? "bottom-6 bg-blue-600 ring-2 ring-white"
            : "top-6 bg-amber-400 ring-2 ring-slate-950"
        }`}
      />
    </div>
  );
}

export default function SpectatorDashboard() {
  const {
    boardAnalytics,
    telemetryHistory,
    noteworthyEvents,
    showBoardHeatmap,
    setShowBoardHeatmap,
    startSpectatorShowcase,
    dispatchCommand,
    matchStatus,
    setMatchStatus,
    whiteSeat,
    blackSeat,
    visualizeMultiStepLine,
  } = useChessStore();

  const [activeTab, setActiveTab] = useState<
    "overview" | "review" | "momentum" | "highlights"
  >("overview");
  const [hoveredPly, setHoveredPly] = useState<number | null>(null);

  const gameReview = useMemo(
    () => computeGameReviewSummary(telemetryHistory),
    [telemetryHistory]
  );

  const latestTelemetry =
    telemetryHistory.length > 0
      ? telemetryHistory[telemetryHistory.length - 1]
      : null;

  const inspectedTelemetry =
    hoveredPly !== null
      ? telemetryHistory.find((t) => t.ply === hoveredPly) || latestTelemetry
      : latestTelemetry;

  // Load a famous opening by resetting and executing its moves deterministically
  const handleLoadOpeningScenario = (moves: string[]) => {
    dispatchCommand({ type: "RESET" });
    for (const san of moves) {
      dispatchCommand({
        type: "MOVE",
        move: san,
        source: "human-cli",
      });
    }
  };

  // Build SVG path for the Evaluation & Momentum Sparkline Chart
  const chartWidth = 360;
  const chartHeight = 96;
  const midY = chartHeight / 2;

  const points = [
    { ply: 0, evalCp: 0, san: "Start" },
    ...telemetryHistory.map((t) => ({
      ply: t.ply,
      evalCp: t.evaluationCp,
      san: t.san,
    })),
  ];

  const maxStep = Math.max(10, points.length - 1);
  const toX = (idx: number) =>
    Math.round((idx / maxStep) * (chartWidth - 20) + 10);
  const toY = (evalCp: number) => {
    const clamped = Math.max(-6, Math.min(6, evalCp));
    return Math.round(midY - (clamped / 6) * (midY - 10));
  };

  const lineCoords = points.map((p, idx) => `${toX(idx)},${toY(p.evalCp)}`);
  const polylineString = lineCoords.join(" ");
  const areaString = `${toX(0)},${midY} ${polylineString} ${toX(points.length - 1)},${midY}`;

  return (
    <div className="bg-slate-900/95 border border-slate-800 rounded-xl p-3.5 flex flex-col gap-3 shadow-xl">
      {/* Header: Broadcast Badge & Quick AI vs AI Showcases */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span
              className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                matchStatus === "playing" ? "bg-rose-400" : "bg-blue-400"
              }`}
            />
            <span
              className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                matchStatus === "playing" ? "bg-rose-500" : "bg-blue-500"
              }`}
            />
          </span>
          <span className="text-xs font-extrabold uppercase tracking-wider text-white">
            Live Spectator Broadcast &amp; Match Telemetry
          </span>
        </div>

        <button
          type="button"
          onClick={() => setShowBoardHeatmap(!showBoardHeatmap)}
          className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition flex items-center gap-1.5 ${
            showBoardHeatmap
              ? "bg-fuchsia-950/90 border-fuchsia-500 text-fuchsia-200 shadow-sm"
              : "bg-slate-950 border-slate-700 text-slate-300 hover:border-slate-500"
          }`}
          title="Colors the 3D chessboard squares by which player controls them (Blue = White, Amber = Black, Pink = Contested Battleground)"
        >
          🔥 3D Territory Heatmap: {showBoardHeatmap ? "ON" : "OFF"}
        </button>
      </div>

      {/* One-Click AI vs AI Spectator Showcases */}
      <div className="bg-slate-950/90 border border-slate-800/90 rounded-lg p-2.5 space-y-2">
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-slate-400 font-semibold uppercase tracking-wider">
            🎥 Instant AI vs AI Spectator Showdowns
          </span>
          {whiteSeat.controller !== "human" &&
            blackSeat.controller !== "human" && (
              <button
                type="button"
                onClick={() =>
                  setMatchStatus(
                    matchStatus === "playing" ? "paused" : "playing"
                  )
                }
                className={`px-2 py-0.5 rounded font-bold text-[10px] uppercase ${
                  matchStatus === "playing"
                    ? "bg-amber-600 text-white"
                    : "bg-emerald-600 text-white"
                }`}
              >
                {matchStatus === "playing" ? "⏸ Pause Broadcast" : "▶ Resume Broadcast"}
              </button>
            )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
          <button
            type="button"
            onClick={() => startSpectatorShowcase("gemini-duel")}
            className="px-2.5 py-1.5 rounded-lg bg-gradient-to-r from-blue-950/90 to-indigo-950/90 hover:from-blue-900 hover:to-indigo-900 border border-blue-700/70 text-left transition group"
          >
            <div className="text-[11px] font-bold text-blue-200 group-hover:text-white">
              🤖 Argon vs Flash
            </div>
            <div className="text-[10px] text-slate-400">
              Gemini Deep vs Speed
            </div>
          </button>

          <button
            type="button"
            onClick={() => startSpectatorShowcase("cross-vendor")}
            className="px-2.5 py-1.5 rounded-lg bg-gradient-to-r from-emerald-950/80 to-slate-900 hover:from-emerald-900/80 hover:to-slate-800 border border-emerald-700/60 text-left transition group"
          >
            <div className="text-[11px] font-bold text-emerald-200 group-hover:text-white">
              ⚔️ Gemini vs GPT-5.5
            </div>
            <div className="text-[10px] text-slate-400">
              Cross-Vendor Clash
            </div>
          </button>

          <button
            type="button"
            onClick={() => startSpectatorShowcase("openai-duel")}
            className="px-2.5 py-1.5 rounded-lg bg-gradient-to-r from-purple-950/80 to-slate-900 hover:from-purple-900/80 hover:to-slate-800 border border-purple-700/60 text-left transition group"
          >
            <div className="text-[11px] font-bold text-purple-200 group-hover:text-white">
              🧠 GPT-5.5 vs GPT-4o
            </div>
            <div className="text-[10px] text-slate-400">
              OpenAI Responses Duel
            </div>
          </button>

          <button
            type="button"
            onClick={() => startSpectatorShowcase("blitz")}
            className="px-2.5 py-1.5 rounded-lg bg-gradient-to-r from-amber-950/80 to-slate-900 hover:from-amber-900/80 hover:to-slate-800 border border-amber-700/60 text-left transition group"
          >
            <div className="text-[11px] font-bold text-amber-200 group-hover:text-white">
              ⚡ Fast Blitz Arena
            </div>
            <div className="text-[10px] text-slate-400">
              Rapid-Fire Moves
            </div>
          </button>
        </div>
      </div>

      {/* Opening Book & Live Storyline Card */}
      <div className="bg-slate-950 border border-slate-800 rounded-lg p-2.5 space-y-1.5">
        <div className="flex flex-wrap items-center justify-between gap-1.5">
          <div className="flex items-center gap-1.5">
            <span className="px-1.5 py-0.5 rounded bg-blue-950 text-blue-300 border border-blue-800 font-mono text-[10px] font-bold">
              {boardAnalytics.opening.eco}
            </span>
            <span className="text-xs font-bold text-white">
              {boardAnalytics.opening.name}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-[10px] font-mono text-slate-300">
              Phase: {boardAnalytics.phase}
            </span>
            <span
              className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                boardAnalytics.tensionScore >= 4
                  ? "bg-rose-950 text-rose-300 border border-rose-800"
                  : boardAnalytics.tensionScore >= 2
                    ? "bg-amber-950 text-amber-300 border border-amber-800"
                    : "bg-slate-900 text-slate-400 border border-slate-800"
              }`}
            >
              🔥 {boardAnalytics.tensionLabel}
            </span>
          </div>
        </div>

        <p className="text-[11px] text-slate-300 leading-relaxed">
          {boardAnalytics.storylineHeadline}
        </p>

        {/* Latest Move Classification Banner + 1-Click Multi-Step Calculation Line */}
        {latestTelemetry && (
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1.5 border-t border-slate-800/80">
            <div className="flex items-center gap-2">
              <span
                className="px-2 py-0.5 rounded-md font-mono text-[11px] font-black text-slate-950 shadow-sm"
                style={{
                  backgroundColor:
                    MOVE_CLASSIFICATION_META[latestTelemetry.classification]
                      .color,
                }}
              >
                {
                  MOVE_CLASSIFICATION_META[latestTelemetry.classification]
                    .symbol
                }{" "}
                {
                  MOVE_CLASSIFICATION_META[latestTelemetry.classification]
                    .label
                }
              </span>
              <span className="text-[11px] text-slate-300 font-mono">
                {latestTelemetry.color === "w" ? "White" : "Black"} played{" "}
                <strong className="text-white">{latestTelemetry.san}</strong> (
                {latestTelemetry.from}→{latestTelemetry.to})
              </span>
            </div>

            <button
              type="button"
              onClick={visualizeMultiStepLine}
              className="px-2.5 py-1 rounded-md bg-indigo-950/90 hover:bg-indigo-800 border border-indigo-600/80 text-indigo-200 text-[10px] font-bold transition flex items-center gap-1"
              title="Draws numbered multi-step calculation arrows (① → ② → ③) on the 3D chessboard showing what happens next!"
            >
              🎯 Show 3-Move Line (①→②→③)
            </button>
          </div>
        )}

        {/* Captured Pieces & Material Advantage Tray */}
        <div className="pt-1.5 border-t border-slate-800/80 grid grid-cols-2 gap-2 text-xs">
          <div className="flex items-center justify-between bg-slate-900/70 px-2 py-1 rounded border border-slate-800">
            <span className="text-[10px] font-semibold text-slate-300">
              White Captures:
            </span>
            <div className="flex items-center gap-1">
              <span className="text-amber-400 text-sm tracking-tighter">
                {boardAnalytics.white.capturedPieces.length > 0
                  ? boardAnalytics.white.capturedPieces
                      .map((p) => PIECE_ICONS[p])
                      .join("")
                  : "—"}
              </span>
              {boardAnalytics.materialDiff > 0 && (
                <span className="px-1 py-0.2 rounded bg-blue-600/30 border border-blue-500/50 text-blue-200 font-mono text-[10px] font-bold">
                  +{boardAnalytics.materialDiff}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between bg-slate-900/70 px-2 py-1 rounded border border-slate-800">
            <span className="text-[10px] font-semibold text-amber-300">
              Black Captures:
            </span>
            <div className="flex items-center gap-1">
              <span className="text-slate-100 text-sm tracking-tighter">
                {boardAnalytics.black.capturedPieces.length > 0
                  ? boardAnalytics.black.capturedPieces
                      .map((p) => PIECE_ICONS[p])
                      .join("")
                  : "—"}
              </span>
              {boardAnalytics.materialDiff < 0 && (
                <span className="px-1 py-0.2 rounded bg-amber-600/30 border border-amber-500/50 text-amber-200 font-mono text-[10px] font-bold">
                  +{Math.abs(boardAnalytics.materialDiff)}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Sub-Navigation Tabs for Spectator Insights */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 text-[11px] font-semibold">
        <button
          type="button"
          onClick={() => setActiveTab("overview")}
          className={`py-1 rounded transition ${
            activeTab === "overview"
              ? "bg-blue-600 text-white"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          📊 Live Stats
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("review")}
          className={`py-1 rounded transition ${
            activeTab === "review"
              ? "bg-blue-600 text-white"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          🏆 Review &amp; Elo
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("momentum")}
          className={`py-1 rounded transition ${
            activeTab === "momentum"
              ? "bg-blue-600 text-white"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          📈 Momentum
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("highlights")}
          className={`py-1 rounded transition flex items-center justify-center gap-1 ${
            activeTab === "highlights"
              ? "bg-blue-600 text-white"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <span>⚡ Highlights</span>
          {noteworthyEvents.length > 0 && (
            <span className="px-1.5 rounded-full bg-amber-500 text-slate-950 text-[10px] font-bold">
              {noteworthyEvents.length}
            </span>
          )}
        </button>
      </div>

      {/* TAB: GAME REVIEW & GUESS THE ELO SCORECARD */}
      {activeTab === "review" && (
        <div className="space-y-3 bg-slate-950/90 border border-slate-800 rounded-lg p-3">
          {/* Accuracy % + Guess The Elo Header Cards */}
          <div className="grid grid-cols-2 gap-2.5">
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-2.5 flex flex-col items-center text-center">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                ⚪ White Accuracy
              </span>
              <span className="text-xl font-black font-mono text-white mt-0.5">
                {gameReview.white.accuracy}%
              </span>
              <div className="mt-1 px-2 py-0.5 rounded bg-blue-950/90 border border-blue-700 text-[10px] font-mono font-bold text-blue-300">
                🎯 Guess the Elo: {gameReview.white.estimatedElo}
              </div>
              <span className="text-[10px] text-slate-400 mt-0.5">
                {gameReview.white.eloTitle}
              </span>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-lg p-2.5 flex flex-col items-center text-center">
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400">
                ⚫ Black Accuracy
              </span>
              <span className="text-xl font-black font-mono text-amber-300 mt-0.5">
                {gameReview.black.accuracy}%
              </span>
              <div className="mt-1 px-2 py-0.5 rounded bg-amber-950/90 border border-amber-700 text-[10px] font-mono font-bold text-amber-300">
                🎯 Guess the Elo: {gameReview.black.estimatedElo}
              </div>
              <span className="text-[10px] text-slate-400 mt-0.5">
                {gameReview.black.eloTitle}
              </span>
            </div>
          </div>

          {/* Move Classification Breakdown (!!, !, ★, 📖, ✓, ?!, ?, ??) */}
          <div className="space-y-1">
            <div className="grid grid-cols-3 text-[10px] font-mono uppercase text-slate-400 px-2 pb-1 border-b border-slate-800">
              <span className="text-left font-bold text-slate-200">White</span>
              <span className="text-center font-bold">Move Rating</span>
              <span className="text-right font-bold text-amber-300">Black</span>
            </div>

            {CLASSIFICATION_ORDER.map((cls) => {
              const meta = MOVE_CLASSIFICATION_META[cls];
              const wCount = gameReview.white.counts[cls];
              const bCount = gameReview.black.counts[cls];
              return (
                <div
                  key={cls}
                  className="grid grid-cols-3 items-center px-2 py-1 rounded bg-slate-900/60 border border-slate-800/60 text-xs"
                >
                  <span
                    className="font-mono font-extrabold text-left"
                    style={{ color: wCount > 0 ? meta.color : "#64748B" }}
                  >
                    {wCount}
                  </span>
                  <div className="flex items-center justify-center gap-1.5">
                    <span
                      className="px-1.5 py-0.2 rounded font-mono text-[10px] font-black text-slate-950"
                      style={{ backgroundColor: meta.color }}
                    >
                      {meta.symbol}
                    </span>
                    <span className="text-[11px] font-semibold text-slate-200">
                      {meta.label}
                    </span>
                  </div>
                  <span
                    className="font-mono font-extrabold text-right"
                    style={{ color: bCount > 0 ? meta.color : "#64748B" }}
                  >
                    {bCount}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {activeTab === "overview" && (
        <div className="space-y-2.5 bg-slate-950/90 border border-slate-800 rounded-lg p-3">
          <div className="flex items-center justify-between text-[11px] border-b border-slate-800 pb-1.5">
            <span className="font-bold text-slate-100 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-white inline-block" />
              WHITE ({boardAnalytics.white.kingSafetyLabel})
            </span>
            <span className="text-[10px] font-mono uppercase text-blue-400 font-bold">
              {boardAnalytics.advantageSummary}
            </span>
            <span className="font-bold text-amber-400 flex items-center gap-1.5">
              BLACK ({boardAnalytics.black.kingSafetyLabel})
              <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
            </span>
          </div>

          <DualStatBar
            label="Win Probability"
            tooltip="Estimated chance to win based on material, board control, and AI evaluation"
            whiteVal={boardAnalytics.whiteWinProb}
            blackVal={100 - boardAnalytics.whiteWinProb}
            whiteDisplay={`${boardAnalytics.whiteWinProb}%`}
            blackDisplay={`${100 - boardAnalytics.whiteWinProb}%`}
          />

          <DualStatBar
            label="Board Territory (Squares Controlled)"
            tooltip="How many of the 64 squares each player attacks more strongly than their opponent"
            whiteVal={boardAnalytics.white.controlledSquaresCount}
            blackVal={boardAnalytics.black.controlledSquaresCount}
            whiteDisplay={`${boardAnalytics.white.controlledSquaresCount} sq`}
            blackDisplay={`${boardAnalytics.black.controlledSquaresCount} sq`}
          />

          <DualStatBar
            label="Center Dominance (d4, d5, e4, e5)"
            tooltip="Control over the 4 golden center squares—the high ground of the chessboard!"
            whiteVal={boardAnalytics.white.centerControl}
            blackVal={boardAnalytics.black.centerControl}
            whiteDisplay={`${boardAnalytics.white.centerControl} pts`}
            blackDisplay={`${boardAnalytics.black.centerControl} pts`}
          />

          <DualStatBar
            label="Piece Mobility & Freedom"
            tooltip="Number of legal moves available—more options means more active, dangerous pieces!"
            whiteVal={boardAnalytics.white.mobility}
            blackVal={boardAnalytics.black.mobility}
            whiteDisplay={`${boardAnalytics.white.mobility} moves`}
            blackDisplay={`${boardAnalytics.black.mobility} moves`}
          />

          <DualStatBar
            label="Army Deployed & King Shield"
            tooltip="How many minor/major pieces have entered the battle and how well-protected the King is"
            whiteVal={boardAnalytics.white.developedPieces}
            blackVal={boardAnalytics.black.developedPieces}
            whiteDisplay={`${boardAnalytics.white.developedPieces}/7 active`}
            blackDisplay={`${boardAnalytics.black.developedPieces}/7 active`}
          />

          {/* Famous Opening Scenarios Quick-Loader */}
          <div className="pt-2 border-t border-slate-800/80 space-y-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
              ♟ Jump to Famous Chess Strategy &amp; Watch AIs Battle:
            </span>
            <div className="flex flex-wrap gap-1.5">
              {FAMOUS_OPENING_SCENARIOS.map((sc) => (
                <button
                  key={sc.id}
                  type="button"
                  onClick={() => handleLoadOpeningScenario(sc.moves)}
                  title={sc.subtitle}
                  className="px-2 py-1 rounded bg-slate-900 hover:bg-blue-950/80 border border-slate-700 hover:border-blue-500 text-[10px] text-slate-200 transition"
                >
                  {sc.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: MOMENTUM CHART & AI MIND-READER */}
      {activeTab === "momentum" && (
        <div className="space-y-2.5 bg-slate-950/90 border border-slate-800 rounded-lg p-3">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-bold text-slate-200">
              Match Advantage &amp; Momentum Curve
            </span>
            <span className="text-[10px] font-mono text-slate-400">
              Above Line = White Lead • Below = Black Lead
            </span>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-lg p-2 relative">
            <svg
              viewBox={`0 0 ${chartWidth} ${chartHeight}`}
              className="w-full h-24 overflow-visible"
            >
              {/* Zero / Even Baseline */}
              <line
                x1={10}
                y1={midY}
                x2={chartWidth - 10}
                y2={midY}
                stroke="#475569"
                strokeDasharray="3 3"
                strokeWidth={1}
              />

              {/* Shaded Advantage Polygon */}
              {points.length > 1 && (
                <polygon
                  points={areaString}
                  fill="rgba(59, 130, 246, 0.22)"
                />
              )}

              {/* Momentum Polyline */}
              {points.length > 1 && (
                <polyline
                  fill="none"
                  stroke="#60A5FA"
                  strokeWidth={2.2}
                  points={polylineString}
                />
              )}

              {/* Interactive Move Nodes */}
              {points.map((pt, idx) => {
                if (idx === 0) return null;
                const snap = telemetryHistory[idx - 1];
                const hasEvent = snap && snap.events.length > 0;
                const cx = toX(idx);
                const cy = toY(pt.evalCp);
                return (
                  <circle
                    key={pt.ply}
                    cx={cx}
                    cy={cy}
                    r={hoveredPly === pt.ply ? 5 : hasEvent ? 3.8 : 2.5}
                    fill={
                      hasEvent
                        ? "#F59E0B"
                        : pt.evalCp >= 0
                          ? "#F8FAFC"
                          : "#38BDF8"
                    }
                    stroke="#0F172A"
                    strokeWidth={1}
                    className="cursor-pointer"
                    onMouseEnter={() => setHoveredPly(pt.ply)}
                    onMouseLeave={() => setHoveredPly(null)}
                  />
                );
              })}
            </svg>
          </div>

          {/* AI Mind-Reader & Move Inspector Card */}
          {inspectedTelemetry ? (
            <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-2.5 text-xs space-y-1.5">
              <div className="flex flex-wrap items-center justify-between gap-1">
                <span className="font-bold text-white">
                  Move #{inspectedTelemetry.moveNumber} (
                  {inspectedTelemetry.color === "w" ? "White" : "Black"}):{" "}
                  <span className="font-mono text-blue-400">
                    {inspectedTelemetry.san}
                  </span>
                </span>
                <span className="font-mono text-[11px] text-slate-300">
                  Eval:{" "}
                  {inspectedTelemetry.evaluationCp > 0 ? "+" : ""}
                  {inspectedTelemetry.evaluationCp.toFixed(2)} (
                  {inspectedTelemetry.whiteWinProb}% W)
                </span>
              </div>

              {inspectedTelemetry.tacticalMotif && (
                <p className="text-[11px] text-slate-300">
                  <strong className="text-emerald-400">Strategy: </strong>
                  {inspectedTelemetry.tacticalMotif}
                </p>
              )}

              <div className="flex flex-wrap items-center gap-2 pt-1">
                {inspectedTelemetry.expectedReplySan && (
                  <span className="px-2 py-0.5 rounded bg-indigo-950/90 border border-indigo-700 text-indigo-200 font-mono text-[10px]">
                    🔮 AI Predicts Next Reply:{" "}
                    <strong>{inspectedTelemetry.expectedReplySan}</strong>
                  </span>
                )}
                {inspectedTelemetry.wasExpectedReply === true && (
                  <span className="px-2 py-0.5 rounded bg-emerald-950 border border-emerald-700 text-emerald-300 font-mono text-[10px] font-bold">
                    🎯 Predicted by Opponent AI!
                  </span>
                )}
                {inspectedTelemetry.wasExpectedReply === false && (
                  <span className="px-2 py-0.5 rounded bg-amber-950 border border-amber-700 text-amber-300 font-mono text-[10px] font-bold">
                    ⚡ Surprise Twist (Deviated from AI Prediction)
                  </span>
                )}
              </div>
            </div>
          ) : (
            <div className="text-center text-xs text-slate-500 py-3 font-mono">
              Start or step the match to watch the live momentum curve &amp; AI
              predictions unfold!
            </div>
          )}
        </div>
      )}

      {/* TAB 3: NOTEWORTHY HIGHLIGHTS & PLAY-BY-PLAY REEL */}
      {activeTab === "highlights" && (
        <div className="bg-slate-950/90 border border-slate-800 rounded-lg p-2.5 max-h-60 overflow-y-auto space-y-2">
          {noteworthyEvents.length === 0 ? (
            <div className="text-xs text-slate-500 font-mono py-6 text-center">
              No major tactical fireworks yet—watch for First Blood, Castling,
              Tactical Forks, Checks, and AI Prediction Twists as the game
              unfolds!
            </div>
          ) : (
            noteworthyEvents.map((ev) => (
              <div
                key={ev.id}
                className={`p-2 rounded-lg border text-xs space-y-1 ${
                  ev.importance === "critical"
                    ? "bg-rose-950/30 border-rose-700/70"
                    : ev.importance === "notable"
                      ? "bg-amber-950/30 border-amber-700/60"
                      : "bg-slate-900 border-slate-800"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="px-1.5 py-0.5 rounded bg-slate-950 border border-slate-700 font-mono text-[10px] font-bold text-amber-300">
                    {ev.badge}
                  </span>
                  <span className="text-[10px] font-mono text-slate-400">
                    Move #{ev.moveNumber} •{" "}
                    {ev.color === "w" ? "White" : "Black"} played{" "}
                    <strong className="text-white">{ev.san}</strong>
                  </span>
                </div>
                <div className="font-bold text-slate-100">{ev.title}</div>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  {ev.description}
                </p>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
