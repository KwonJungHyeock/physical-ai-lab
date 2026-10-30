'use client';

/**
 * 공정 짜기 in 3D: the taught places (A 집을 곳, B 놓을 곳, 가운데, P1 …) as labelled pins on the
 * desk and the planned tool path (관절로 J legs dashed curves, 곧게 L legs solid lines), in the robot base frame (parent group: z up,
 * metres). Screen only: the simulated cameras never see them.
 */

import { Html, Line } from '@react-three/drei';
import { useEffect, useRef } from 'react';
import type { Group } from 'three';

import css from '../console.module.css';

export interface PlanMarksData {
  spots: { tag: string; label: string; at: { x: number; y: number; z: number } }[];
  path: { x: number; y: number; z: number }[];
  /** The path leg by leg as the arm goes (else `path` as one line): J (관절로) a dashed curve, L (곧게) a solid straight line. */
  legs?: { mode: 'J' | 'L'; pts: { x: number; y: number; z: number }[] }[];
}

const m = (mm: number) => mm / 1000;
const v3 = (p: { x: number; y: number; z: number }) => [m(p.x), m(p.y), m(p.z)] as [number, number, number];

export default function PlanMarks({ marks, layer }: { marks: PlanMarksData; layer: number }) {
  const g = useRef<Group>(null);
  const pts = marks.path.map((p) => [m(p.x), m(p.y), m(p.z)] as [number, number, number]);
  // Everything here on the screen-only layer (set after each change of what is drawn).
  useEffect(() => {
    g.current?.traverse((o) => o.layers.set(layer));
  });
  return (
    <group ref={g}>
      {marks.legs
        ? marks.legs.map((l, k) =>
            l.mode === 'J' ? (
              <Line key={k} points={l.pts.map(v3)} color="#c4cbd4" lineWidth={1.4} dashed dashSize={0.006} gapSize={0.006} transparent opacity={0.8} depthTest={false} />
            ) : (
              <Line key={k} points={l.pts.map(v3)} color="#ffffff" lineWidth={2.4} transparent opacity={0.95} depthTest={false} />
            ),
          )
        : pts.length > 1 && <Line points={pts} color="#f1f4f9" lineWidth={1.6} dashed dashSize={0.008} gapSize={0.006} transparent opacity={0.85} depthTest={false} />}
      {marks.spots.map((s, k) => (
        <group key={`${s.tag}${k}`} position={[m(s.at.x), m(s.at.y), m(s.at.z)]}>
          <mesh renderOrder={2}>
            <sphereGeometry args={[0.0045, 16, 12]} />
            <meshBasicMaterial color="#e8edf3" depthTest={false} transparent />
          </mesh>
          <Html center zIndexRange={[5, 4]} position={[0, 0, 0.018]} pointerEvents="none">
            <span className={css.planMark}>
              <b>{s.tag}</b>
              {s.label}
            </span>
          </Html>
        </group>
      ))}
    </group>
  );
}
