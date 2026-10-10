'use client';

/**
 * The floor a site stands on, instead of the lessons' dark studio and grid: a wide plane with the
 * site's own surface — factory epoxy, warehouse concrete, lab vinyl, café planks, a care room's
 * laminate, office tiles: real material textures (CC0, public/models/tex, see its ATTRIBUTION.md) at
 * their real tile size; greenhouse ground cover drawn once on a canvas — fading into the site's sky
 * with the fog. And a soft contact shadow for the things round the cell (outside the sun's shadow).
 *
 * Inside LearnStage's robot-frame group: metres, z up; sizes here in mm.
 */

import { useTexture } from '@react-three/drei';
import { useMemo } from 'react';
import { RepeatWrapping, SRGBColorSpace, type Texture } from 'three';

import { canvasTexture } from '../../../simulator/stage/sceneKit';
import { m } from '../CellKit';

export type FloorKind = 'epoxy' | 'concrete' | 'vinyl' | 'greenhouse' | 'wood' | 'tiles' | 'laminate';

/** How a site's 3D view looks: its sky (background and fog) and floor. */
export interface SiteLook {
  sky: string;
  floor: FloorKind;
  /** Fog from / to, m from the camera. */
  fog?: readonly [number, number];
  /** The floor's height in the robot frame, mm (default: where the robot stands; lower when the arm stands on a myAGV). */
  groundZ?: number;
}

const S = 1024;

type Draw = (g: CanvasRenderingContext2D, r: () => number) => void;

/** Soft blotches of light and dark (`k` = strength). */
function mottle(g: CanvasRenderingContext2D, r: () => number, n: number, size: number, k: number) {
  for (let i = 0; i < n; i += 1) {
    const x = r() * S;
    const y = r() * S;
    const rad = size * (0.4 + r());
    const light = r() > 0.5;
    for (const [dx, dy] of [
      [0, 0],
      [S, 0],
      [-S, 0],
      [0, S],
      [0, -S],
    ]) {
      const grd = g.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, rad);
      grd.addColorStop(0, light ? `rgba(255,255,255,${k})` : `rgba(0,0,0,${k})`);
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd;
      g.fillRect(x + dx - rad, y + dy - rad, rad * 2, rad * 2);
    }
  }
}

/** Fine flecks: `n` dots of up to `size` px in the given colours. */
function flecks(g: CanvasRenderingContext2D, r: () => number, n: number, size: number, colors: readonly string[]) {
  for (let i = 0; i < n; i += 1) {
    g.fillStyle = colors[Math.floor(r() * colors.length)];
    const s = 0.6 + r() * size;
    g.fillRect(r() * S, r() * S, s, s);
  }
}

/** A cut joint across the texture: a dark groove with a light lip. */
function joint(g: CanvasRenderingContext2D, at: number, vertical: boolean, dark = 0.3) {
  g.fillStyle = `rgba(0,0,0,${dark})`;
  if (vertical) g.fillRect(at - 1.5, 0, 3, S);
  else g.fillRect(0, at - 1.5, S, 3);
  g.fillStyle = 'rgba(255,255,255,0.18)';
  if (vertical) g.fillRect(at + 1.5, 0, 1, S);
  else g.fillRect(0, at + 1.5, S, 1);
}

const FLOORS: Record<Exclude<FloorKind, 'laminate'>, { tile: number; rough: number; draw: Draw }> = {
  // Grey-blue epoxy with flecks and scuffs; saw cuts every 1.2 m.
  epoxy: {
    tile: 2400,
    rough: 0.42,
    draw(g, r) {
      g.fillStyle = '#8c959d';
      g.fillRect(0, 0, S, S);
      mottle(g, r, 40, 160, 0.05);
      flecks(g, r, 9000, 1.6, ['rgba(255,255,255,0.10)', 'rgba(0,0,0,0.10)', 'rgba(60,80,100,0.12)']);
      g.lineCap = 'round';
      for (let i = 0; i < 60; i += 1) {
        g.strokeStyle = `rgba(0,0,0,${0.025 + r() * 0.03})`;
        g.lineWidth = 1 + r() * 2;
        g.beginPath();
        const x = r() * S;
        const y = r() * S;
        const a = r() * Math.PI;
        const l = 10 + r() * 40;
        g.moveTo(x, y);
        g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
        g.stroke();
      }
      for (const a of [0, S / 2]) {
        joint(g, a, true);
        joint(g, a, false);
      }
    },
  },
  // Warehouse concrete, cloudy, with forklift tyre marks; joints every 1.5 m.
  concrete: {
    tile: 3000,
    rough: 0.6,
    draw(g, r) {
      g.fillStyle = '#a3a19b';
      g.fillRect(0, 0, S, S);
      mottle(g, r, 70, 200, 0.07);
      flecks(g, r, 12000, 1.4, ['rgba(255,255,255,0.08)', 'rgba(0,0,0,0.09)']);
      g.lineCap = 'round';
      for (let i = 0; i < 7; i += 1) {
        g.strokeStyle = `rgba(30,30,30,${0.04 + r() * 0.04})`;
        g.lineWidth = 10 + r() * 6;
        g.beginPath();
        const y = r() * S;
        g.moveTo(-20, y);
        g.bezierCurveTo(S * 0.3, y + (r() - 0.5) * 300, S * 0.7, y + (r() - 0.5) * 300, S + 20, y + (r() - 0.5) * 120);
        g.stroke();
      }
      for (const a of [0, S / 2]) {
        joint(g, a, true, 0.26);
        joint(g, a, false, 0.26);
      }
    },
  },
  // Light lab vinyl with fine flecks; welded seams every 2 m.
  vinyl: {
    tile: 2000,
    rough: 0.5,
    draw(g, r) {
      g.fillStyle = '#d9dfe3';
      g.fillRect(0, 0, S, S);
      mottle(g, r, 30, 180, 0.03);
      flecks(g, r, 16000, 1.8, ['rgba(120,135,150,0.25)', 'rgba(255,255,255,0.5)', 'rgba(90,100,110,0.18)']);
      g.fillStyle = 'rgba(80,95,110,0.22)';
      g.fillRect(0, 0, 2, S);
    },
  },
  // Black woven ground cover with its guide lines every 30 cm.
  greenhouse: {
    tile: 1200,
    rough: 0.92,
    draw(g, r) {
      g.fillStyle = '#2d3230';
      g.fillRect(0, 0, S, S);
      for (let p = 0; p < S; p += 6) {
        g.fillStyle = `rgba(255,255,255,${0.02 + r() * 0.025})`;
        g.fillRect(p, 0, 2, S);
        g.fillStyle = `rgba(0,0,0,${0.08 + r() * 0.05})`;
        g.fillRect(0, p, S, 2);
      }
      mottle(g, r, 25, 160, 0.05);
      g.fillStyle = 'rgba(235,240,225,0.35)';
      for (let k = 0; k < 4; k += 1) g.fillRect(0, (k * S) / 4 + 4, S, 4);
      flecks(g, r, 1500, 2.5, ['rgba(120,100,70,0.25)', 'rgba(160,170,120,0.15)']);
    },
  },
  // Oak planks 80 mm wide, staggered ends, each its own tone, with grain.
  wood: {
    tile: 640,
    rough: 0.55,
    draw(g, r) {
      const n = 8;
      const w = S / n;
      for (let i = 0; i < n; i += 1) {
        const ends = [r() * S];
        ends.push((ends[0] + S * (0.45 + r() * 0.2)) % S);
        const tone = 0.85 + r() * 0.25;
        const base = [Math.round(176 * tone), Math.round(128 * tone), Math.round(86 * tone)];
        g.fillStyle = `rgb(${base.join(',')})`;
        g.fillRect(i * w, 0, w, S);
        for (let k = 0; k < 14; k += 1) {
          g.strokeStyle = `rgba(70,40,20,${0.06 + r() * 0.1})`;
          g.lineWidth = 0.8 + r() * 1.6;
          g.beginPath();
          const x0 = i * w + r() * w;
          const amp = 2 + r() * 5;
          const f = 0.004 + r() * 0.01;
          for (let y = 0; y <= S; y += 16) g.lineTo(Math.min(i * w + w - 2, Math.max(i * w + 2, x0 + Math.sin(y * f + k) * amp)), y);
          g.stroke();
        }
        g.fillStyle = 'rgba(40,22,10,0.55)';
        g.fillRect(i * w, 0, 2, S);
        for (const e of ends) g.fillRect(i * w, e, w, 2);
      }
    },
  },
  // Raised floor: 600 mm tiles, one in four a perforated vent tile.
  tiles: {
    tile: 1200,
    rough: 0.5,
    draw(g, r) {
      g.fillStyle = '#d3d8dd';
      g.fillRect(0, 0, S, S);
      mottle(g, r, 20, 140, 0.03);
      flecks(g, r, 9000, 1.4, ['rgba(110,120,130,0.18)', 'rgba(255,255,255,0.4)']);
      const h = S / 2;
      g.fillStyle = 'rgba(70,80,92,0.13)';
      for (let y = h * 0.08; y < h * 0.92; y += 16) for (let x = h + h * 0.08; x < S - h * 0.08; x += 16) {
        g.beginPath();
        g.arc(x, y, 3, 0, Math.PI * 2);
        g.fill();
      }
      for (const a of [0, h]) {
        g.fillStyle = 'rgba(80,90,100,0.45)';
        g.fillRect(a - 2, 0, 4, S);
        g.fillRect(0, a - 2, S, 4);
      }
    },
  },
};

/** The floors with a real material: its texture set (public/models/tex/<set>), real tile size, mm, and a tint. */
const TEXTURED: Partial<Record<FloorKind, { set: string; tile: number; tint: string }>> = {
  epoxy: { set: 'floor-epoxy', tile: 3000, tint: '#c4cecc' },
  concrete: { set: 'floor-concrete', tile: 2500, tint: '#e9e9e6' },
  vinyl: { set: 'floor-lab', tile: 1500, tint: '#e6ecef' },
  wood: { set: 'floor-wood', tile: 1700, tint: '#ffffff' },
  tiles: { set: 'floor-tiles', tile: 1500, tint: '#d9dee3' },
  laminate: { set: 'floor-laminate', tile: 1700, tint: '#ffffff' },
};

const GROUND_MM = 14000;

/** The site's floor, 14 m across round the cell, a hair below the cell's own floors. */
export function SiteGround({ look }: { look: SiteLook }) {
  const t = TEXTURED[look.floor];
  const z = m((look.groundZ ?? 0) - 0.3);
  return t ? <TexturedGround set={t.set} tile={t.tile} tint={t.tint} z={z} /> : <DrawnGround kind={look.floor as Exclude<FloorKind, 'laminate'>} z={z} />;
}

/** A texture set repeated at its real tile size over a `w` × `h` mm surface (copies, so each surface sets its own repeat). */
export function useTiled(set: string, tile: number, w: number, h = w): { map: Texture; normalMap: Texture; roughnessMap: Texture } {
  const base = useTexture({ map: `/models/tex/${set}/color.webp`, normalMap: `/models/tex/${set}/normal.webp`, roughnessMap: `/models/tex/${set}/rough.webp` });
  return useMemo(() => {
    const tiled = (t: Texture, srgb = false) => {
      const c = t.clone();
      c.wrapS = c.wrapT = RepeatWrapping;
      c.repeat.set(w / tile, h / tile);
      c.anisotropy = 8;
      if (srgb) c.colorSpace = SRGBColorSpace;
      c.needsUpdate = true;
      return c;
    };
    return { map: tiled(base.map, true), normalMap: tiled(base.normalMap), roughnessMap: tiled(base.roughnessMap) };
  }, [base, tile, w, h]);
}

function TexturedGround({ set, tile, tint, z }: { set: string; tile: number; tint: string; z: number }) {
  const maps = useTiled(set, tile, GROUND_MM);
  return (
    <mesh position={[m(150), 0, z]} receiveShadow>
      <planeGeometry args={[m(GROUND_MM), m(GROUND_MM)]} />
      <meshStandardMaterial {...maps} color={tint} normalScale={[0.6, 0.6]} envMapIntensity={0.6} />
    </mesh>
  );
}

function DrawnGround({ kind, z }: { kind: Exclude<FloorKind, 'laminate'>; z: number }) {
  const f = FLOORS[kind];
  const map = useMemo(() => canvasTexture(`floor-${kind}`, S, S, f.draw, true, [GROUND_MM / f.tile, GROUND_MM / f.tile]), [kind, f]);
  return (
    <mesh position={[m(150), 0, z]} receiveShadow>
      <planeGeometry args={[m(GROUND_MM), m(GROUND_MM)]} />
      <meshStandardMaterial map={map} roughness={f.rough} envMapIntensity={0.6} />
    </mesh>
  );
}

/** A soft dark patch on the floor under a thing (`w` × `d` mm), for what stands outside the sun's shadow. */
export function Blob({ at, w, d, k = 0.35, rot = 0 }: { at: readonly [number, number]; w: number; d: number; k?: number; rot?: number }) {
  const map = useMemo(
    () =>
      canvasTexture('blob', 128, 128, (g) => {
        const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
        grd.addColorStop(0, 'rgba(0,0,0,1)');
        grd.addColorStop(0.55, 'rgba(0,0,0,0.6)');
        grd.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = grd;
        g.fillRect(0, 0, 128, 128);
      }),
    [],
  );
  return (
    <mesh position={[m(at[0]), m(at[1]), m(0.2)]} rotation={[0, 0, rot]} renderOrder={1}>
      <planeGeometry args={[m(w * 1.25), m(d * 1.25)]} />
      <meshBasicMaterial map={map} transparent opacity={k} depthWrite={false} color="#000000" />
    </mesh>
  );
}
