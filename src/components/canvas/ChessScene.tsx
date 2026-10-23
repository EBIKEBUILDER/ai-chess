// src/components/canvas/ChessScene.tsx
"use client";

import React, { useEffect, useMemo, useRef } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, ContactShadows, Text } from "@react-three/drei";
import * as THREE from "three";
import type { Square } from "chess.js";
import type { CameraViewPreset } from "@/types/chess";
import { useChessStore } from "@/store/useChessStore";
import { MOVE_CLASSIFICATION_META } from "@/lib/chess-analytics";
import {
  ProceduralPieceMesh,
  squareToWorldCoords,
} from "./ProceduralPieces";

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];
const RANKS = ["1", "2", "3", "4", "5", "6", "7", "8"];

const CAMERA_PRESET_POSITIONS: Record<
  CameraViewPreset,
  [number, number, number]
> = {
  white: [0, 7.2, 7.8],
  black: [0, 7.2, -7.8],
  top: [0, 11.2, 0.01],
  side: [8.2, 6.2, 0],
  broadcast: [5.8, 7.4, 6.4],
};

function CameraRig({ preset }: { preset: CameraViewPreset }) {
  const { camera } = useThree();
  const controlsRef = useRef<any>(null);

  useEffect(() => {
    const [x, y, z] = CAMERA_PRESET_POSITIONS[preset];
    camera.position.set(x, y, z);
    if (controlsRef.current) {
      controlsRef.current.target.set(0, 0, 0);
      controlsRef.current.update();
    }
  }, [preset, camera]);

  return (
    <OrbitControls
      ref={controlsRef}
      enablePan={false}
      autoRotate={preset === "broadcast"}
      autoRotateSpeed={0.9}
      minPolarAngle={0.05}
      maxPolarAngle={Math.PI / 2.2}
      minDistance={5}
      maxDistance={14}
    />
  );
}

function TacticalArrow3D({
  from,
  to,
  color,
  sequenceIndex,
}: {
  from: string;
  to: string;
  color: string;
  sequenceIndex?: number;
}) {
  const { position, rotationY, length } = useMemo(() => {
    const [x1, , z1] = squareToWorldCoords(from);
    const [x2, , z2] = squareToWorldCoords(to);
    const dx = x2 - x1;
    const dz = z2 - z1;
    const len = Math.hypot(dx, dz);
    const midX = (x1 + x2) / 2;
    const midZ = (z1 + z2) / 2;
    const angle = Math.atan2(dx, dz);
    return {
      position: [midX, 0.08, midZ] as [number, number, number],
      rotationY: angle,
      length: Math.max(0.2, len - 0.25),
    };
  }, [from, to]);

  return (
    <group position={position}>
      <group rotation={[0, rotationY, 0]}>
        <mesh position={[0, 0, -0.08]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.06, 0.06, length, 12]} />
          <meshStandardMaterial
            color={color}
            emissive={color}
            emissiveIntensity={0.35}
            transparent
            opacity={0.85}
          />
        </mesh>
        <mesh position={[0, 0, length / 2]} rotation={[Math.PI / 2, 0, 0]}>
          <coneGeometry args={[0.16, 0.28, 16]} />
          <meshStandardMaterial
            color={color}
            emissive={color}
            emissiveIntensity={0.45}
          />
        </mesh>
      </group>
      {sequenceIndex !== undefined && (
        <group position={[0, 0.14, 0]}>
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[0.16, 20]} />
            <meshBasicMaterial color={color} side={THREE.DoubleSide} />
          </mesh>
          <Text
            position={[0, 0.02, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
            fontSize={0.16}
            color="#090D16"
          >
            {String(sequenceIndex)}
          </Text>
        </group>
      )}
    </group>
  );
}

export default function ChessScene() {
  const trackedPieces = useChessStore((s) => s.trackedPieces);
  const selectedSquare = useChessStore((s) => s.selectedSquare);
  const legalDestinations = useChessStore(
    (s) => s.legalDestinationsForSelected
  );
  const legalMoveDetails = useChessStore((s) => s.legalMoveDetailsForSelected);
  const inspectedPiece = useChessStore((s) => s.inspectedPiece);
  const threatenedPlayerSquares = useChessStore(
    (s) => s.threatenedPlayerSquares
  );
  const showBeginnerHelpers = useChessStore((s) => s.showBeginnerHelpers);
  const showBoardHeatmap = useChessStore((s) => s.showBoardHeatmap);
  const boardAnalytics = useChessStore((s) => s.boardAnalytics);
  const telemetryHistory = useChessStore((s) => s.telemetryHistory);
  const telestratorAnchorSquare = useChessStore(
    (s) => s.telestratorAnchorSquare
  );
  const telestratorColor = useChessStore((s) => s.telestratorColor);
  const turn = useChessStore((s) => s.turn);
  const boardArrows = useChessStore((s) => s.boardArrows);
  const boardHighlights = useChessStore((s) => s.boardHighlights);
  const cameraPreset = useChessStore((s) => s.cameraPreset);
  const selectSquare = useChessStore((s) => s.selectSquare);

  const latestMove =
    telemetryHistory.length > 0
      ? telemetryHistory[telemetryHistory.length - 1]
      : null;

  const squares = useMemo(() => {
    const list: { sq: Square; isLight: boolean; pos: [number, number, number] }[] = [];
    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const sq = `${FILES[f]}${RANKS[r]}` as Square;
        list.push({
          sq,
          isLight: (r + f) % 2 === 1,
          pos: squareToWorldCoords(sq),
        });
      }
    }
    return list;
  }, []);

  return (
    <div className="w-full h-full relative bg-slate-950 rounded-xl overflow-hidden border border-slate-800 shadow-2xl">
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ position: [0, 7.2, 7.8], fov: 42 }}
      >
        <color attach="background" args={["#090D16"]} />
        <ambientLight intensity={0.65} />
        <directionalLight
          position={[6, 12, 8]}
          intensity={1.45}
          castShadow
          shadow-mapSize={[1024, 1024]}
        />
        <pointLight position={[-6, 8, -6]} intensity={0.5} color="#93C5FD" />

        {/* Wooden Outer Frame */}
        <mesh position={[0, -0.16, 0]} receiveShadow>
          <boxGeometry args={[8.8, 0.28, 8.8]} />
          <meshStandardMaterial color="#1E293B" roughness={0.6} metalness={0.2} />
        </mesh>

        {/* 64 Interactive Board Squares */}
        {squares.map(({ sq, isLight, pos }) => {
          const isSelected = selectedSquare === sq;
          const isInspectedEnemy =
            inspectedPiece &&
            inspectedPiece.color !== turn &&
            inspectedPiece.square === sq;
          const isEnemyAttackPreview =
            showBeginnerHelpers &&
            inspectedPiece &&
            inspectedPiece.color !== turn &&
            inspectedPiece.attackedSquares.includes(sq);
          const isLegalTarget = legalDestinations.includes(sq);
          const moveDetail = legalMoveDetails.find((d) => d.to === sq);
          const isThreatenedPlayerPiece =
            showBeginnerHelpers && threatenedPlayerSquares.includes(sq);
          const customHighlight = boardHighlights.find((h) => h.square === sq);
          const heatCell = boardAnalytics.squareControl?.[sq];

          let squareColor = isLight ? "#E2E8F0" : "#475569";
          if (customHighlight) squareColor = customHighlight.color;
          if (isSelected) squareColor = "#3B82F6";
          if (isInspectedEnemy) squareColor = "#E11D48";

          // Color-code legal move rings for beginners:
          // - Safe Move: Mint/Emerald (#10B981)
          // - Risky Move (Enemy can capture there): Amber Warning (#F59E0B)
          const ringColor =
            showBeginnerHelpers && moveDetail && !moveDetail.isSafe
              ? "#F59E0B"
              : "#10B981";

          const heatColor =
            heatCell?.owner === "w"
              ? "#3B82F6"
              : heatCell?.owner === "b"
                ? "#F59E0B"
                : heatCell?.owner === "contested"
                  ? "#EC4899"
                  : null;

          return (
            <group key={sq} position={[pos[0], 0, pos[2]]}>
              <mesh
                position={[0, -0.02, 0]}
                receiveShadow
                onClick={(e) => {
                  e.stopPropagation();
                  selectSquare(sq);
                }}
              >
                <boxGeometry args={[1, 0.05, 1]} />
                <meshStandardMaterial color={squareColor} roughness={0.4} />
              </mesh>

              {/* 3D Spectator Territory & Attack Heatmap Overlay */}
              {showBoardHeatmap && heatColor && (
                <group position={[0, 0.014, 0]}>
                  <mesh
                    rotation={[-Math.PI / 2, 0, 0]}
                    onClick={(e) => {
                      e.stopPropagation();
                      selectSquare(sq);
                    }}
                  >
                    <planeGeometry args={[0.92, 0.92]} />
                    <meshBasicMaterial
                      color={heatColor}
                      transparent
                      opacity={0.22 + (heatCell?.intensity || 0) * 0.32}
                      side={THREE.DoubleSide}
                    />
                  </mesh>
                  {(heatCell.whiteAttackers + heatCell.blackAttackers >= 2 ||
                    heatCell.owner === "contested") && (
                    <Text
                      position={[0, 0.01, -0.34]}
                      rotation={[-Math.PI / 2, 0, 0]}
                      fontSize={0.11}
                      color="#F8FAFC"
                    >
                      {heatCell.owner === "contested"
                        ? `⚔ ${heatCell.whiteAttackers}v${heatCell.blackAttackers}`
                        : `${heatCell.whiteAttackers}:${heatCell.blackAttackers}`}
                    </Text>
                  )}
                </group>
              )}

              {/* Optional Teacher Highlight Badge Label */}
              {customHighlight?.label && (
                <Text
                  position={[0, 0.04, 0.32]}
                  rotation={[-Math.PI / 2, 0, 0]}
                  fontSize={0.13}
                  color="#FFFFFF"
                >
                  {customHighlight.label}
                </Text>
              )}

              {/* Streamer Telestrator Anchor Square Ring */}
              {telestratorAnchorSquare === sq && (
                <group position={[0, 0.025, 0]}>
                  <mesh rotation={[-Math.PI / 2, 0, 0]}>
                    <ringGeometry args={[0.34, 0.45, 28]} />
                    <meshBasicMaterial
                      color={telestratorColor}
                      side={THREE.DoubleSide}
                    />
                  </mesh>
                  <Text
                    position={[0, 0.02, -0.35]}
                    rotation={[-Math.PI / 2, 0, 0]}
                    fontSize={0.1}
                    color="#FFFFFF"
                  >
                    DRAW FROM
                  </Text>
                </group>
              )}

              {/* 3D Move Classification Badge (!!, !, ★, 📖, ?!, ?, ??) on Latest Destination Square */}
              {latestMove && latestMove.to === sq && (
                <group position={[0.31, 0.05, -0.31]}>
                  <mesh rotation={[-Math.PI / 2, 0, 0]}>
                    <circleGeometry args={[0.17, 24]} />
                    <meshBasicMaterial
                      color={
                        MOVE_CLASSIFICATION_META[latestMove.classification]
                          .color
                      }
                      side={THREE.DoubleSide}
                    />
                  </mesh>
                  <Text
                    position={[0, 0.02, 0]}
                    rotation={[-Math.PI / 2, 0, 0]}
                    fontSize={0.14}
                    color="#090D16"
                  >
                    {
                      MOVE_CLASSIFICATION_META[latestMove.classification]
                        .symbol
                    }
                  </Text>
                </group>
              )}

              {/* Threatened Player Piece Warning Ring (Beginner X-Ray) */}
              {isThreatenedPlayerPiece && !isSelected && (
                <group position={[0, 0.018, 0]}>
                  <mesh rotation={[-Math.PI / 2, 0, 0]}>
                    <ringGeometry args={[0.37, 0.45, 28]} />
                    <meshBasicMaterial
                      color="#EF4444"
                      side={THREE.DoubleSide}
                    />
                  </mesh>
                  <Text
                    position={[0, 0.02, -0.37]}
                    rotation={[-Math.PI / 2, 0, 0]}
                    fontSize={0.11}
                    color="#FCA5A5"
                  >
                    IN DANGER
                  </Text>
                </group>
              )}

              {/* Enemy Piece Attack Range Preview Ring */}
              {isEnemyAttackPreview && (
                <mesh
                  position={[0, 0.019, 0]}
                  rotation={[-Math.PI / 2, 0, 0]}
                  onClick={(e) => {
                    e.stopPropagation();
                    selectSquare(sq);
                  }}
                >
                  <ringGeometry args={[0.18, 0.28, 24]} />
                  <meshBasicMaterial
                    color="#F43F5E"
                    side={THREE.DoubleSide}
                  />
                </mesh>
              )}

              {/* Legal Move Target Ring (Safe vs Risky vs Capture) */}
              {isLegalTarget && (
                <group
                  position={[0, 0.022, 0]}
                  onClick={(e) => {
                    e.stopPropagation();
                    selectSquare(sq);
                  }}
                >
                  <mesh rotation={[-Math.PI / 2, 0, 0]}>
                    <ringGeometry
                      args={
                        moveDetail?.isCapture
                          ? [0.33, 0.44, 28]
                          : [0.15, 0.26, 24]
                      }
                    />
                    <meshBasicMaterial
                      color={ringColor}
                      side={THREE.DoubleSide}
                    />
                  </mesh>
                  {showBeginnerHelpers && moveDetail && (
                    <Text
                      position={[0, 0.02, 0.35]}
                      rotation={[-Math.PI / 2, 0, 0]}
                      fontSize={0.11}
                      color={moveDetail.isSafe ? "#064E3B" : "#78350F"}
                    >
                      {moveDetail.isCapture
                        ? moveDetail.isSafe
                          ? "CAPTURE"
                          : "RISKY CAPTURE"
                        : moveDetail.isSafe
                          ? ""
                          : "RISKY"}
                    </Text>
                  )}
                </group>
              )}
            </group>
          );
        })}

        {/* File and Rank Coordinate Labels */}
        {FILES.map((file, idx) => (
          <Text
            key={`file-${file}`}
            position={[idx - 3.5, 0.02, 4.18]}
            rotation={[-Math.PI / 2, 0, 0]}
            fontSize={0.22}
            color="#94A3B8"
          >
            {file.toUpperCase()}
          </Text>
        ))}
        {RANKS.map((rank, idx) => (
          <Text
            key={`rank-${rank}`}
            position={[-4.18, 0.02, 3.5 - idx]}
            rotation={[-Math.PI / 2, 0, 0]}
            fontSize={0.22}
            color="#94A3B8"
          >
            {rank}
          </Text>
        ))}

        {/* Active 3D Pieces (Keyed by stable id for smooth interpolation) */}
        {trackedPieces
          .filter((p) => !p.captured)
          .map((piece) => (
            <ProceduralPieceMesh
              key={piece.id}
              type={piece.type}
              color={piece.color}
              square={piece.square}
              isSelected={
                selectedSquare === piece.square ||
                inspectedPiece?.square === piece.square
              }
              onSelect={selectSquare}
            />
          ))}

        {/* 3D Tactical & Last-Move Arrows */}
        {boardArrows.map((arrow, i) => (
          <TacticalArrow3D
            key={`${arrow.from}-${arrow.to}-${i}`}
            from={arrow.from}
            to={arrow.to}
            color={arrow.color}
            sequenceIndex={arrow.sequenceIndex}
          />
        ))}

        <ContactShadows
          position={[0, -0.01, 0]}
          opacity={0.45}
          scale={10}
          blur={1.8}
          far={4}
        />
        <CameraRig preset={cameraPreset} />
      </Canvas>
    </div>
  );
}
