'use client';

/**
 * A work bench at real size under a site's cell: its top is the cell's work surface (z = 0 of the
 * robot frame, the arm's base stands on it) and its legs reach the room's floor `h` below. Kinds: a
 * steel shop bench (factory, logistics, recycling), a white lab bench with cabinets (bio), a black
 * phenolic top on a light frame (AI lab), a plain table (farm sorting room).
 */

import { RBox } from '../../../simulator/stage/sceneKit';

export type BenchKind = 'steel' | 'lab' | 'phenolic' | 'table';

const LOOK: Record<BenchKind, { top: string; frame: string; panel?: string; rough: number; metal: number }> = {
  steel: { top: '#b9c0c7', frame: '#3b4652', rough: 0.45, metal: 0.55 },
  lab: { top: '#f1f3f4', frame: '#c9ced4', panel: '#dfe3e7', rough: 0.5, metal: 0.1 },
  phenolic: { top: '#2a2f36', frame: '#d0d5da', rough: 0.35, metal: 0.2 },
  table: { top: '#e8e2d6', frame: '#5d6670', rough: 0.6, metal: 0.3 },
};

interface Props {
  /** The top's extent in the robot frame, mm. */
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  /** Height of the top above the floor, mm. */
  h: number;
  kind?: BenchKind;
}

export default function Bench({ x0, x1, y0, y1, h, kind = 'steel' }: Props) {
  const c = LOOK[kind];
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const w = x1 - x0;
  const d = y1 - y0;
  const t = kind === 'steel' ? 30 : 25;
  const frame = <meshStandardMaterial color={c.frame} roughness={0.5} metalness={c.metal} />;
  const legs = [-1, 1].flatMap((sx) => [-1, 1].map((sy) => [cx + sx * (w / 2 - 40), cy + sy * (d / 2 - 40)] as const));
  return (
    <group>
      <RBox at={[cx, cy, -t / 2]} size={[w, d, t]} radius={3}>
        <meshStandardMaterial color={c.top} roughness={c.rough} metalness={c.metal * 0.6} />
      </RBox>
      {c.panel ? (
        // a lab bench: closed cabinets under the top, a recessed plinth
        <>
          <RBox at={[cx, cy, -(h - t) / 2 - t - 50]} size={[w - 20, d - 30, h - t - 100]} radius={4}>
            <meshStandardMaterial color={c.panel} roughness={0.6} />
          </RBox>
          <RBox at={[cx, cy + 10, -h + 50]} size={[w - 60, d - 80, 100]} radius={2}>
            <meshStandardMaterial color="#8d949b" roughness={0.6} />
          </RBox>
        </>
      ) : (
        <>
          {legs.map(([x, y]) => (
            <RBox key={`${x},${y}`} at={[x, y, -(h + t) / 2]} size={[50, 50, h - t]} radius={4}>
              {frame}
            </RBox>
          ))}
          {/* the apron under the top, and a low shelf */}
          <RBox at={[cx, cy, -t - 40]} size={[w - 60, d - 60, 60]} radius={3}>
            {frame}
          </RBox>
          <RBox at={[cx, cy, -h + 180]} size={[w - 80, d - 80, 20]} radius={2}>
            <meshStandardMaterial color={c.top} roughness={0.6} metalness={c.metal * 0.5} />
          </RBox>
        </>
      )}
    </group>
  );
}
