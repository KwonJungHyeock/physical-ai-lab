'use client';

/**
 * Shared look of the desk scenes (ScenePreset.tsx) and the desk objects (DeskObjects.tsx): rounded
 * boxes and turned (lathe) shapes instead of bare primitives, and small surface textures drawn once
 * on a canvas — cardboard with its tape, wood grain, brushed metal, a cleated belt, plastic grain,
 * hazard stripes. Nothing is downloaded (the app also runs offline inside the desktop program).
 *
 * Sizes in mm, robot base frame (z up); turned shapes stand on z = 0 of their group.
 */

import { useEffect, useMemo, type ReactNode } from 'react';
import { CanvasTexture, LatheGeometry, RepeatWrapping, SRGBColorSpace, Vector2, type Texture } from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

const m = (mm: number) => mm / 1000;

/* --- textures (drawn once, shared) ----------------------------------------- */

const cache = new Map<string, Texture>();

/** A seeded random, so every texture looks the same on every load. */
function rand(seed: number) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

function canvasTexture(key: string, w: number, h: number, draw: (ctx: CanvasRenderingContext2D, r: () => number) => void, color = true, repeat: [number, number] = [1, 1]): Texture {
  const id = `${key}:${repeat.join('x')}`;
  const hit = cache.get(id);
  if (hit) return hit;
  const base = cache.get(`${key}:1x1`);
  let t: Texture;
  if (base) t = base.clone();
  else {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    draw(c.getContext('2d')!, rand(key.length * 7919 + w));
    t = new CanvasTexture(c);
    if (color) t.colorSpace = SRGBColorSpace;
    t.anisotropy = 4;
    cache.set(`${key}:1x1`, t);
    if (repeat[0] === 1 && repeat[1] === 1) return t;
    t = t.clone();
  }
  t.wrapS = t.wrapT = RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.needsUpdate = true;
  cache.set(id, t);
  return t;
}

/** Fine grain for bump maps (plastic, painted metal). */
export const grain = (repeat: [number, number] = [1, 1]) =>
  canvasTexture(
    'grain',
    128,
    128,
    (ctx, r) => {
      const img = ctx.createImageData(128, 128);
      for (let i = 0; i < img.data.length; i += 4) {
        const v = 118 + r() * 20;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
        img.data[i + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
    },
    false,
    repeat,
  );

/** Light cardboard (tinted by the material colour) with a band of packing tape down the middle. */
export const cardboard = () =>
  canvasTexture('cardboard', 256, 256, (ctx, r) => {
    ctx.fillStyle = '#f1e7da';
    ctx.fillRect(0, 0, 256, 256);
    for (let k = 0; k < 900; k += 1) {
      ctx.strokeStyle = `rgba(120, 82, 40, ${0.03 + r() * 0.05})`;
      ctx.lineWidth = 0.6 + r();
      const x = r() * 256;
      const y = r() * 256;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (r() - 0.5) * 3, y + 6 + r() * 14);
      ctx.stroke();
    }
    for (let k = 0; k < 14; k += 1) {
      ctx.fillStyle = `rgba(110, 72, 30, ${0.04 + r() * 0.05})`;
      ctx.beginPath();
      ctx.ellipse(r() * 256, r() * 256, 10 + r() * 30, 6 + r() * 16, r() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
    // Tape: a lighter glossy band with crinkle lines.
    const g = ctx.createLinearGradient(100, 0, 156, 0);
    g.addColorStop(0, 'rgba(255, 244, 222, 0.0)');
    g.addColorStop(0.08, 'rgba(255, 244, 222, 0.75)');
    g.addColorStop(0.92, 'rgba(255, 244, 222, 0.75)');
    g.addColorStop(1, 'rgba(255, 244, 222, 0.0)');
    ctx.fillStyle = g;
    ctx.fillRect(100, 0, 56, 256);
    ctx.strokeStyle = 'rgba(140, 110, 70, 0.18)';
    for (let k = 0; k < 9; k += 1) {
      const y = r() * 256;
      ctx.beginPath();
      ctx.moveTo(104, y);
      ctx.lineTo(152, y + (r() - 0.5) * 10);
      ctx.stroke();
    }
    // Printed "this side up" arrows in a corner.
    ctx.strokeStyle = 'rgba(60, 40, 20, 0.55)';
    ctx.lineWidth = 3;
    for (const x of [26, 46]) {
      ctx.beginPath();
      ctx.moveTo(x, 232);
      ctx.lineTo(x, 200);
      ctx.moveTo(x - 7, 208);
      ctx.lineTo(x, 199);
      ctx.lineTo(x + 7, 208);
      ctx.stroke();
    }
    ctx.strokeRect(16, 190, 40, 50);
  });

/** Wood grain along x (light, tinted by the material colour). */
export const wood = (repeat: [number, number] = [1, 1]) =>
  canvasTexture(
    'wood',
    512,
    128,
    (ctx, r) => {
      ctx.fillStyle = '#efe2cf';
      ctx.fillRect(0, 0, 512, 128);
      for (let k = 0; k < 70; k += 1) {
        const y0 = r() * 128;
        const amp = 1 + r() * 4;
        const f = 0.004 + r() * 0.01;
        const ph = r() * 6;
        ctx.strokeStyle = `rgba(120, 76, 36, ${0.06 + r() * 0.14})`;
        ctx.lineWidth = 0.5 + r() * 1.6;
        ctx.beginPath();
        for (let x = 0; x <= 512; x += 8) {
          const y = y0 + Math.sin(x * f + ph) * amp + Math.sin(x * f * 3.1) * amp * 0.3;
          if (x) ctx.lineTo(x, y);
          else ctx.moveTo(x, y);
        }
        ctx.stroke();
      }
      for (let k = 0; k < 2; k += 1) {
        const x = 60 + r() * 380;
        const y = 20 + r() * 88;
        for (let j = 6; j > 0; j -= 1) {
          ctx.strokeStyle = `rgba(100, 60, 25, ${0.12 + j * 0.03})`;
          ctx.beginPath();
          ctx.ellipse(x, y, j * 4, j * 1.6, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    },
    true,
    repeat,
  );

/** Brushed metal streaks (light; tinted). */
export const brushed = (repeat: [number, number] = [1, 1]) =>
  canvasTexture(
    'brushed',
    256,
    256,
    (ctx, r) => {
      ctx.fillStyle = '#e4e7eb';
      ctx.fillRect(0, 0, 256, 256);
      for (let k = 0; k < 1400; k += 1) {
        const v = 180 + r() * 75;
        ctx.strokeStyle = `rgba(${v}, ${v}, ${v + 4}, ${0.18 + r() * 0.25})`;
        ctx.lineWidth = 0.5 + r() * 0.8;
        const y = r() * 256;
        const x = r() * 256;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + 30 + r() * 90, y + (r() - 0.5) * 0.6);
        ctx.stroke();
      }
    },
    true,
    repeat,
  );

/** Rubber conveyor belt with cleats across it. */
export const belt = (repeat: [number, number] = [1, 1]) =>
  canvasTexture(
    'belt',
    128,
    128,
    (ctx, r) => {
      ctx.fillStyle = '#25292f';
      ctx.fillRect(0, 0, 128, 128);
      for (let k = 0; k < 1500; k += 1) {
        ctx.fillStyle = `rgba(255, 255, 255, ${r() * 0.035})`;
        ctx.fillRect(r() * 128, r() * 128, 1.5, 1.5);
      }
      for (let y = 8; y < 128; y += 32) {
        ctx.fillStyle = '#31363e';
        ctx.fillRect(6, y, 116, 7);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
        ctx.fillRect(6, y, 116, 1.5);
      }
    },
    true,
    repeat,
  );

/** Yellow-black stripes (white-black: tinted by the material colour). */
export const stripes = (repeat: [number, number] = [1, 1], key = 'stripes') =>
  canvasTexture(
    key,
    128,
    128,
    (ctx) => {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, 128, 128);
      ctx.fillStyle = '#1b1b1b';
      for (let x = -128; x < 256; x += 32) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x + 16, 0);
        ctx.lineTo(x + 16 - 128, 128);
        ctx.lineTo(x - 128, 128);
        ctx.fill();
      }
    },
    true,
    repeat,
  );

/* --- shapes ------------------------------------------------------------------ */

/** A box with rounded edges, centred at `at`, mm. */
export function RBox({ at = [0, 0, 0], size, radius = 2, rot = 0, children, shadow = true }: { at?: readonly number[]; size: readonly number[]; radius?: number; rot?: number; children: ReactNode; shadow?: boolean }) {
  const [sx, sy, sz] = size;
  const geo = useMemo(() => new RoundedBoxGeometry(m(sx), m(sy), m(sz), 3, m(Math.max(0.2, radius))), [sx, sy, sz, radius]);
  useEffect(() => () => geo.dispose(), [geo]);
  return (
    <mesh geometry={geo} position={[m(at[0]), m(at[1]), m(at[2])]} rotation={[0, 0, rot]} castShadow={shadow} receiveShadow>
      {children}
    </mesh>
  );
}

/** A turned shape standing on z = 0: `profile` is [radius, height] mm from the bottom up (a closed outline for thick walls). */
export function Turned({ profile, at = [0, 0, 0], segments = 48, children, shadow = true }: { profile: readonly (readonly [number, number])[]; at?: readonly number[]; segments?: number; children: ReactNode; shadow?: boolean }) {
  // Keyed by the numbers (profiles are written inline).
  const key = profile.map((p) => p.join(',')).join(';');
  const geo = useMemo(
    () =>
      new LatheGeometry(
        key.split(';').map((p) => {
          const [r, h] = p.split(',').map(Number);
          return new Vector2(m(Math.max(0, r)), m(h));
        }),
        segments,
      ),
    [key, segments],
  );
  useEffect(() => () => geo.dispose(), [geo]);
  return (
    <mesh geometry={geo} position={[m(at[0]), m(at[1]), m(at[2])]} rotation={[Math.PI / 2, 0, 0]} castShadow={shadow} receiveShadow>
      {children}
    </mesh>
  );
}

/** Upright cylinder with rounded top and bottom edges: radius r, height h, edge b, mm. */
export const pill = (r: number, h: number, b = Math.min(2.5, r * 0.18, h * 0.25)): [number, number][] => {
  const out: [number, number][] = [[0, 0]];
  const arc = (cx: number, cy: number, a0: number, a1: number) => {
    for (let k = 0; k <= 4; k += 1) {
      const a = a0 + ((a1 - a0) * k) / 4;
      out.push([cx + Math.cos(a) * b, cy + Math.sin(a) * b]);
    }
  };
  arc(r - b, b, -Math.PI / 2, 0);
  arc(r - b, h - b, 0, Math.PI / 2);
  out.push([0, h]);
  return out;
};

/** A thin-walled open vessel (cup, bowl, bin wall) from bottom radius r0 to rim radius r1, height h, wall t, mm; a rolled rim. */
export const vessel = (r0: number, r1: number, h: number, t = 2.2, base = 3): [number, number][] => {
  const inner = (z: number) => r0 + ((r1 - r0) * z) / h - t;
  return [
    [0, 0],
    [r0 - 1.5, 0],
    [r0, 1.5],
    [r1, h - t / 2],
    [r1 - t / 2, h + t * 0.25],
    [inner(h) + 0.2, h - t / 2],
    [inner(base) + 0.6, base + 0.6],
    [inner(base) - 0.6, base],
    [0, base],
  ];
};
