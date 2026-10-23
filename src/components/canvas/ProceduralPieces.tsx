// src/components/canvas/ProceduralPieces.tsx
"use client";

import React, { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import type { PieceSymbol, Color, Square } from "chess.js";

export function squareToWorldCoords(square: string): [number, number, number] {
  const file = square.charCodeAt(0) - 97; // 'a' -> 0 .. 'h' -> 7
  const rank = parseInt(square[1], 10) - 1; // '1' -> 0 .. '8' -> 7
  const x = file - 3.5;
  const z = 3.5 - rank;
  return [x, 0, z];
}

function buildLatheProfile(points: [number, number][]): THREE.LatheGeometry {
  const vectors = points.map(([x, y]) => new THREE.Vector2(x, y));
  const geom = new THREE.LatheGeometry(vectors, 28);
  geom.computeVertexNormals();
  return geom;
}

export function useProceduralChessGeometries() {
  return useMemo(() => {
    const pawn = buildLatheProfile([
      [0, 0],
      [0.34, 0],
      [0.34, 0.08],
      [0.26, 0.14],
      [0.14, 0.45],
      [0.22, 0.52],
      [0.12, 0.58],
      [0.2, 0.72],
      [0.18, 0.85],
      [0, 0.9],
    ]);

    const rook = buildLatheProfile([
      [0, 0],
      [0.36, 0],
      [0.36, 0.1],
      [0.28, 0.18],
      [0.2, 0.68],
      [0.28, 0.74],
      [0.28, 0.96],
      [0.18, 0.96],
      [0.18, 0.86],
      [0, 0.86],
    ]);

    const bishop = buildLatheProfile([
      [0, 0],
      [0.36, 0],
      [0.36, 0.1],
      [0.26, 0.18],
      [0.14, 0.68],
      [0.24, 0.74],
      [0.22, 0.98],
      [0.14, 1.14],
      [0.06, 1.22],
      [0, 1.26],
    ]);

    const queen = buildLatheProfile([
      [0, 0],
      [0.38, 0],
      [0.38, 0.1],
      [0.28, 0.2],
      [0.15, 0.82],
      [0.26, 0.9],
      [0.2, 1.15],
      [0.28, 1.32],
      [0.12, 1.36],
      [0.07, 1.44],
      [0, 1.46],
    ]);

    const king = buildLatheProfile([
      [0, 0],
      [0.4, 0],
      [0.4, 0.12],
      [0.3, 0.22],
      [0.16, 0.92],
      [0.28, 1.0],
      [0.22, 1.28],
      [0.28, 1.42],
      [0.08, 1.46],
      [0.08, 1.65],
      [0, 1.65],
    ]);

    const knightBase = buildLatheProfile([
      [0, 0],
      [0.36, 0],
      [0.36, 0.1],
      [0.28, 0.18],
      [0.22, 0.32],
      [0, 0.32],
    ]);

    const horseShape = new THREE.Shape();
    horseShape.moveTo(-0.18, 0.28);
    horseShape.lineTo(0.18, 0.28);
    horseShape.lineTo(0.22, 0.62);
    horseShape.lineTo(0.08, 0.85);
    horseShape.lineTo(0.24, 0.94);
    horseShape.lineTo(0.2, 1.06);
    horseShape.lineTo(0.02, 1.08);
    horseShape.lineTo(-0.06, 1.2);
    horseShape.lineTo(-0.16, 1.05);
    horseShape.lineTo(-0.22, 0.72);
    horseShape.closePath();

    const knightHead = new THREE.ExtrudeGeometry(horseShape, {
      depth: 0.16,
      bevelEnabled: true,
      bevelThickness: 0.04,
      bevelSize: 0.04,
      bevelSegments: 4,
    });
    knightHead.translate(0, 0, -0.08);
    knightHead.computeVertexNormals();

    return { pawn, rook, bishop, queen, king, knightBase, knightHead };
  }, []);
}

interface PieceMeshProps {
  type: PieceSymbol;
  color: Color;
  square: Square;
  isSelected: boolean;
  onSelect: (sq: Square) => void;
}

export const ProceduralPieceMesh: React.FC<PieceMeshProps> = ({
  type,
  color,
  square,
  isSelected,
  onSelect,
}) => {
  const groupRef = useRef<THREE.Group>(null);
  const geometries = useProceduralChessGeometries();
  const [targetX, , targetZ] = squareToWorldCoords(square);
  const initializedRef = useRef(false);

  useFrame((_, delta) => {
    if (!groupRef.current) return;
    if (!initializedRef.current) {
      groupRef.current.position.set(targetX, 0, targetZ);
      initializedRef.current = true;
      return;
    }

    const pos = groupRef.current.position;
    const dx = targetX - pos.x;
    const dz = targetZ - pos.z;
    const dist = Math.hypot(dx, dz);

    const speed = Math.min(1, delta * 11);
    pos.x = THREE.MathUtils.lerp(pos.x, targetX, speed);
    pos.z = THREE.MathUtils.lerp(pos.z, targetZ, speed);

    // Smooth vertical arc during piece movement or selection hover
    const selectionLift = isSelected ? 0.22 : 0;
    const transitHop = dist > 0.05 ? Math.min(0.55, dist * 0.35) : 0;
    pos.y = THREE.MathUtils.lerp(pos.y, selectionLift + transitHop, speed);
  });

  const materialProps = useMemo(
    () =>
      color === "w"
        ? {
            color: isSelected ? "#60A5FA" : "#F8FAFC",
            roughness: 0.22,
            metalness: 0.08,
            clearcoat: 0.6,
          }
        : {
            color: isSelected ? "#F59E0B" : "#1E293B",
            roughness: 0.28,
            metalness: 0.25,
            clearcoat: 0.7,
          },
    [color, isSelected]
  );

  return (
    <group
      ref={groupRef}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(square);
      }}
    >
      {type === "n" ? (
        <group rotation={[0, color === "w" ? Math.PI / 2 : -Math.PI / 2, 0]}>
          <mesh geometry={geometries.knightBase} castShadow receiveShadow>
            <meshPhysicalMaterial {...materialProps} />
          </mesh>
          <mesh geometry={geometries.knightHead} castShadow receiveShadow>
            <meshPhysicalMaterial {...materialProps} />
          </mesh>
        </group>
      ) : (
        <mesh
          geometry={
            type === "p"
              ? geometries.pawn
              : type === "r"
                ? geometries.rook
                : type === "b"
                  ? geometries.bishop
                  : type === "q"
                    ? geometries.queen
                    : geometries.king
          }
          castShadow
          receiveShadow
        >
          <meshPhysicalMaterial {...materialProps} />
        </mesh>
      )}
    </group>
  );
};
