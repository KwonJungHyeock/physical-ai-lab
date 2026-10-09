'use client';

/**
 * Pieces the site cells share in 3D (inside LearnStage's robot-frame group: metres, z up; all
 * positions here in mm): the label style of overlays, a measured length with its value, text
 * signs and labels drawn on canvas textures, floor tape (plain or hazard stripes), a small steel
 * shelf and a notice board on legs — the props that make a cell look like a place.
 */

import { Html, Line } from '@react-three/drei';
import { useEffect, useMemo, type ReactNode } from 'react';
import { CanvasTexture, RepeatWrapping, SRGBColorSpace, Vector3 } from 'three';

import type { Mm } from '@/engine/education/lab/cell';

import { RBox } from '../../simulator/stage/sceneKit';

export const m = (mm: number) => mm / 1000;
export const v3 = (p: readonly number[]) => new Vector3(m(p[0]), m(p[1]), m(p[2]));

/** A measured length drawn in the cell (원인 찾기): from a to b, with its value. */
export interface CellDim {
  key: string;
  a: Mm;
  b: Mm;
  text: string;
  color: string;
  /** Where its value sits: at the middle (default), or at the far end to the left / right. */
  label?: 'l' | 'r';
}

export const Steel = () => <meshStandardMaterial color="#aeb6bf" metalness={0.8} roughness={0.3} />;


/** A canvas texture with lines of text (signs, labels, stickers), px per mm `k`. */
export function useTextTexture(lines: readonly string[], w: number, h: number, fg: string, bg: string, k = 8): CanvasTexture {
  const key = lines.join('\n');
  const tex = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = Math.round(w * k);
    c.height = Math.round(h * k);
    const g = c.getContext('2d')!;
    g.fillStyle = bg;
    g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = fg;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const rows = key.split('\n');
    const size = Math.min(c.height / (rows.length * 1.25), (c.width * 1.6) / Math.max(...rows.map((r) => r.length + 1)));
    rows.forEach((r, i) => {
      g.font = `${i === 0 ? 800 : 700} ${Math.round(i === 0 ? size : size * 0.8)}px Pretendard, system-ui, sans-serif`;
      g.fillText(r, c.width / 2, (c.height * (i + 0.5)) / rows.length);
    });
    const t = new CanvasTexture(c);
    t.colorSpace = SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }, [key, w, h, fg, bg, k]);
  useEffect(() => () => tex.dispose(), [tex]);
  return tex;
}


/** A flat sign standing up (its face towards `yaw`, 0 = facing −y, robot frame), centre `at`, mm. */
export function Sign({ at, w, h, yaw = 0, lines, fg = '#1d2025', bg = '#ffffff' }: { at: Mm; w: number; h: number; yaw?: number; lines: readonly string[]; fg?: string; bg?: string }) {
  const tex = useTextTexture(lines, w, h, fg, bg);
  return (
    <group position={v3(at)} rotation={[0, 0, yaw]}>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[m(w), m(h)]} />
        <meshStandardMaterial map={tex} roughness={0.6} />
      </mesh>
    </group>
  );
}


/** A label lying flat (on a box top, the floor), centre `at`, mm. */
export function FlatLabel({ at, w, h, rot = 0, lines, fg, bg }: { at: Mm; w: number; h: number; rot?: number; lines: readonly string[]; fg: string; bg: string }) {
  const tex = useTextTexture(lines, w, h, fg, bg);
  return (
    <mesh position={v3(at)} rotation={[0, 0, rot]}>
      <planeGeometry args={[m(w), m(h)]} />
      <meshStandardMaterial map={tex} roughness={0.5} />
    </mesh>
  );
}


/** Yellow and black hazard tape (a repeating stripe texture). */
export function useHazard(): CanvasTexture {
  const tex = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 16;
    const g = c.getContext('2d')!;
    g.fillStyle = '#f2c230';
    g.fillRect(0, 0, 64, 16);
    g.fillStyle = '#1d2025';
    for (let x = -16; x < 64; x += 16) {
      g.beginPath();
      g.moveTo(x, 16);
      g.lineTo(x + 8, 16);
      g.lineTo(x + 16, 0);
      g.lineTo(x + 8, 0);
      g.fill();
    }
    const t = new CanvasTexture(c);
    t.colorSpace = SRGBColorSpace;
    t.wrapS = RepeatWrapping;
    return t;
  }, []);
  useEffect(() => () => tex.dispose(), [tex]);
  return tex;
}


/** A strip of floor tape from a to b (on the floor), width w, mm. */
export function Tape({ a, b, w = 8, color, hazard }: { a: [number, number]; b: [number, number]; w?: number; color?: string; hazard?: CanvasTexture }) {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const map = useMemo(() => {
    if (!hazard) return null;
    const t = hazard.clone();
    t.repeat.set(len / 32, 1);
    t.needsUpdate = true;
    return t;
  }, [hazard, len]);
  useEffect(() => () => map?.dispose(), [map]);
  return (
    <mesh position={[m((a[0] + b[0]) / 2), m((a[1] + b[1]) / 2), m(0.6)]} rotation={[0, 0, Math.atan2(b[1] - a[1], b[0] - a[0])]} receiveShadow>
      <planeGeometry args={[m(len), m(w)]} />
      <meshStandardMaterial color={map ? '#ffffff' : color} map={map} roughness={0.7} />
    </mesh>
  );
}


/** A small steel shelving unit (front facing −y), its centre x, y and size, with what stands on it. */
export function Shelf({ x, y, w = 250, d = 70, levels = [8, 98, 188] as const, children }: { x: number; y: number; w?: number; d?: number; levels?: readonly number[]; children?: ReactNode }) {
  const top = levels[levels.length - 1] + 70;
  return (
    <group>
      {[-1, 1].flatMap((sx) =>
        [-1, 1].map((sy) => (
          <RBox key={`${sx}${sy}`} at={[x + sx * (w / 2 - 4), y + sy * (d / 2 - 4), top / 2]} size={[7, 7, top]} radius={1}>
            <meshStandardMaterial color="#2f5be7" metalness={0.4} roughness={0.45} />
          </RBox>
        )),
      )}
      {levels.map((z) => (
        <group key={z}>
          <RBox at={[x, y, z - 2]} size={[w - 4, d - 4, 4]} radius={0.8}>
            <meshStandardMaterial color="#c9cfd6" metalness={0.6} roughness={0.4} />
          </RBox>
          <RBox at={[x, y - d / 2 + 3, z - 5]} size={[w - 4, 5, 10]} radius={1}>
            <meshStandardMaterial color="#f08a24" roughness={0.5} />
          </RBox>
        </group>
      ))}
      {children}
    </group>
  );
}


/** A notice board on two legs (a deadline, a production target …), its face towards `yaw`. */
export function Board({ at, yaw, lines }: { at: [number, number]; yaw: number; lines: readonly string[] }) {
  const [x, y] = at;
  return (
    <group position={[m(x), m(y), 0]} rotation={[0, 0, yaw]}>
      {[-1, 1].map((s) => (
        <RBox key={s} at={[s * 50, 3, 60]} size={[5, 5, 120]} radius={1}>
          <Steel />
        </RBox>
      ))}
      <RBox at={[0, 3, 112]} size={[118, 4, 50]} radius={1.5}>
        <meshStandardMaterial color="#2b3038" roughness={0.5} />
      </RBox>
      <Sign at={[0, 0.6, 112]} w={112} h={44} lines={lines} fg="#ffffff" bg="#d92d20" />
    </group>
  );
}


export const tag = (color: string, bg = 'rgba(255,255,255,.92)') => ({
  font: '800 12px var(--font-ui, system-ui)',
  color,
  background: bg,
  padding: '2px 7px',
  borderRadius: 7,
  whiteSpace: 'nowrap' as const,
  boxShadow: '0 1px 4px rgba(0,0,0,.25)',
});


/** A measured length: the line, a tick at each end, the value in the middle. */
export function Dim({ d }: { d: CellDim }) {
  const { a, b } = d;
  const [dx, dy, dz] = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  // Ticks across the line: along x for an upright one, across it on the floor otherwise.
  const flat = Math.hypot(dx, dy);
  const t: Mm = Math.abs(dz) > flat ? [5, 0, 0] : [(-dy / flat) * 5, (dx / flat) * 5, 0];
  const tick = (p: Mm) => [v3([p[0] - t[0], p[1] - t[1], p[2] - t[2]]), v3([p[0] + t[0], p[1] + t[1], p[2] + t[2]])];
  return (
    <group>
      <Line points={[v3(a), v3(b)]} color={d.color} lineWidth={3} depthTest={false} renderOrder={10} />
      <Line points={[...tick(a), ...tick(b)]} segments color={d.color} lineWidth={3} depthTest={false} renderOrder={10} />
      <Html zIndexRange={[12, 4]} center position={(d.label ? v3(b) : v3([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2])).toArray()} style={{ pointerEvents: 'none' }}>
        <span style={{ ...tag('#fff', d.color), display: 'inline-block', transform: d.label === 'l' ? 'translate(-58%, -70%)' : d.label === 'r' ? 'translate(58%, -70%)' : undefined }}>{d.text}</span>
      </Html>
    </group>
  );
}
