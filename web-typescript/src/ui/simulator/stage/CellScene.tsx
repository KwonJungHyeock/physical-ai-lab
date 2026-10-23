'use client';

/**
 * A 실습 셀 drawn around the arm (engine/simulator/cell/cells.ts has its geometry and the solids the
 * arm and the physics know): an industrial cell at 1/5 of shop size — the robot on a pedestal over a
 * concrete floor, the equipment on aluminium-profile frames down to the floor.
 *
 *  A 공급 · 적재: a stack magazine (four profile posts, a clear tube) on the feed table, the blue feed
 *  cylinder whose pusher slides out under it, the belt conveyor with guide rails, its drive and end
 *  stop, the end sensor's light beam, the source plate and the pallet plate on their stands, and the
 *  control cabinet with its stack light and signal lamps.
 *
 * What moves is read from the world every frame (the pusher, the belt, the beam, the lamps).
 */

import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, type ReactNode, type RefObject } from 'react';
import { CanvasTexture, CatmullRomCurve3, Color, ExtrudeGeometry, Fog, SRGBColorSpace, Shape, TubeGeometry, Vector3, type Group, type Mesh, type MeshStandardMaterial, type Texture } from 'three';

import { CELL_FLOOR_Z, cellLayout, gridPlace, type CellId } from '@/engine/simulator/cell/cells';
import type { WorldState } from '@/engine/simulator/sim';

import { RBox, Turned, belt, brushed, grain, pill } from './sceneKit';

const m = (mm: number) => mm / 1000;
const F = CELL_FLOOR_Z;

const Alu = ({ rep = [1, 1] as [number, number] }) => <meshStandardMaterial color="#c9cfd6" metalness={0.75} roughness={0.36} map={brushed(rep)} />;
const Paint = ({ color, rough = 0.45 }: { color: string; rough?: number }) => <meshPhysicalMaterial color={color} roughness={rough} clearcoat={0.3} clearcoatRoughness={0.5} bumpMap={grain([3, 3])} bumpScale={0.3} />;
const Steel = ({ color = '#5b636d' }: { color?: string }) => <meshStandardMaterial color={color} metalness={0.55} roughness={0.45} />;
const Rubber = () => <meshStandardMaterial color="#1d2025" roughness={0.9} />;

/** A drawn sheet (canvas texture, 4 px per mm) lying flat at z, mm. */
function useSheet(key: string, w: number, h: number, draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void): Texture {
  return useMemo(() => {
    const c = document.createElement('canvas');
    c.width = Math.round(w * 4);
    c.height = Math.round(h * 4);
    draw(c.getContext('2d')!, c.width, c.height);
    const t = new CanvasTexture(c);
    t.colorSpace = SRGBColorSpace;
    t.anisotropy = 8;
    return t;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- drawn once per key
  }, [key, w, h]);
}

/** An aluminium profile's cross-section, w × h mm, with a T-slot in the middle of each face (two on a long face). */
function profileShape(w: number, h: number): Shape {
  const sh = new Shape();
  const slot = Math.min(w, h) * 0.3;
  const deep = Math.min(w, h) * 0.16;
  const slots = (len: number) => (len > Math.min(w, h) * 1.6 ? [-len / 4, len / 4] : [0]);
  // Round the outline, cutting a slot into each face as it goes (counter-clockwise from bottom-left).
  const pts: [number, number][] = [];
  const edge = (from: [number, number], to: [number, number], inward: [number, number]) => {
    const len = Math.hypot(to[0] - from[0], to[1] - from[1]);
    const ux = (to[0] - from[0]) / len;
    const uy = (to[1] - from[1]) / len;
    pts.push(from);
    for (const c of slots(len).map((o) => o + len / 2).sort((a, b) => a - b)) {
      const a = c - slot / 2;
      const b = c + slot / 2;
      pts.push([from[0] + ux * a, from[1] + uy * a]);
      pts.push([from[0] + ux * a + inward[0] * deep, from[1] + uy * a + inward[1] * deep]);
      pts.push([from[0] + ux * b + inward[0] * deep, from[1] + uy * b + inward[1] * deep]);
      pts.push([from[0] + ux * b, from[1] + uy * b]);
    }
  };
  edge([-w / 2, -h / 2], [w / 2, -h / 2], [0, 1]);
  edge([w / 2, -h / 2], [w / 2, h / 2], [-1, 0]);
  edge([w / 2, h / 2], [-w / 2, h / 2], [0, -1]);
  edge([-w / 2, h / 2], [-w / 2, -h / 2], [1, 0]);
  sh.moveTo(m(pts[0][0]), m(pts[0][1]));
  for (const p of pts.slice(1)) sh.lineTo(m(p[0]), m(p[1]));
  sh.closePath();
  return sh;
}

const profileGeos = new Map<string, ExtrudeGeometry>();
/** A slotted profile extruded `len` mm along z (shared by every profile of that size). */
function profileGeo(w: number, h: number, len: number): ExtrudeGeometry {
  const key = `${w}x${h}x${Math.round(len * 10)}`;
  let g = profileGeos.get(key);
  if (!g) {
    g = new ExtrudeGeometry(profileShape(w, h), { depth: m(len), bevelEnabled: false, steps: 1 });
    profileGeos.set(key, g);
  }
  return g;
}

const AluProfile = () => <meshStandardMaterial color="#d3d8de" metalness={0.35} roughness={0.38} map={brushed([1, 4])} />;

/**
 * An aluminium profile from `a` to `b` (axis-aligned), w × h mm across: the frame members of the
 * equipment. `h` is across along z for a horizontal member, along y for a post.
 */
function Prof({ a, b, w = 8, h = w }: { a: readonly [number, number, number]; b: readonly [number, number, number]; w?: number; h?: number }) {
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const axis = Math.abs(d[0]) > 0.01 ? 0 : Math.abs(d[1]) > 0.01 ? 1 : 2;
  const len = Math.abs(d[axis]);
  const lo = [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.min(a[2], b[2])];
  // Extruded along local z: turned onto x or y.
  const rot: [number, number, number] = axis === 0 ? [0, Math.PI / 2, 0] : axis === 1 ? [-Math.PI / 2, 0, 0] : [0, 0, 0];
  const start: [number, number, number] = [a[0], a[1], a[2]];
  start[axis] = lo[axis];
  const geo = axis === 0 ? profileGeo(h, w, len) : profileGeo(w, h, len);
  return (
    <mesh geometry={geo} position={[m(start[0]), m(start[1]), m(start[2])]} rotation={rot} castShadow receiveShadow>
      <AluProfile />
    </mesh>
  );
}

/** A levelling foot (threaded stem, rubber pad) under a post standing at (x, y). */
function Foot({ x, y, s = 8 }: { x: number; y: number; s?: number }) {
  return (
    <group>
      <Turned at={[x, y, F]} profile={pill(s * 0.75, 2.5, 0.8)} segments={16}>
        <Rubber />
      </Turned>
      <Turned at={[x, y, F + 2.5]} profile={[[0, 0], [1.6, 0], [1.6, 5], [0, 5]]} segments={10}>
        <Steel color="#9aa3ad" />
      </Turned>
    </group>
  );
}

/** A profile post from the floor (on a foot) up to z, mm. */
function Post({ x, y, top, s = 8 }: { x: number; y: number; top: number; s?: number }) {
  return (
    <group>
      <Prof a={[x, y, F + 7.5]} b={[x, y, top]} w={s} />
      <Foot x={x} y={y} s={s} />
    </group>
  );
}

/** A table on a profile frame: four posts, rails round the top and near the floor, the top at z, mm. */
function Stand({ x0, x1, y0, y1, top, thick = 4, s = 8, children }: { x0: number; x1: number; y0: number; y1: number; top: number; thick?: number; s?: number; children?: ReactNode }) {
  const i = s / 2;
  const zt = top - thick - s / 2;
  const legs: [number, number][] = [
    [x0 + i, y0 + i],
    [x1 - i, y0 + i],
    [x0 + i, y1 - i],
    [x1 - i, y1 - i],
  ];
  return (
    <group>
      {legs.map(([x, y]) => (
        <Post key={`${x},${y}`} x={x} y={y} top={top - thick} s={s} />
      ))}
      {[zt, F + 26].map((z) => (
        <group key={z}>
          <Prof a={[x0 + s, y0 + i, z]} b={[x1 - s, y0 + i, z]} w={s} />
          <Prof a={[x0 + s, y1 - i, z]} b={[x1 - s, y1 - i, z]} w={s} />
          <Prof a={[x0 + i, y0 + s, z]} b={[x0 + i, y1 - s, z]} w={s} />
          <Prof a={[x1 - i, y0 + s, z]} b={[x1 - i, y1 - s, z]} w={s} />
        </group>
      ))}
      {children ?? (
        <RBox at={[(x0 + x1) / 2, (y0 + y1) / 2, top - thick / 2]} size={[x1 - x0, y1 - y0, thick]} radius={0.8}>
          <Alu />
        </RBox>
      )}
    </group>
  );
}

/** A flexible hose from a to b, sagging between them (mm). */
function Hose({ pts, r = 1.6, color = '#2f7ff0' }: { pts: [number, number, number][]; r?: number; color?: string }) {
  const key = JSON.stringify(pts);
  const geo = useMemo(() => new TubeGeometry(new CatmullRomCurve3((JSON.parse(key) as number[][]).map((p) => new Vector3(m(p[0]), m(p[1]), m(p[2])))), 40, m(r), 8, false), [key, r]);
  useEffect(() => () => geo.dispose(), [geo]);
  return (
    <mesh geometry={geo} castShadow>
      <meshStandardMaterial color={color} roughness={0.45} />
    </mesh>
  );
}

function Floor() {
  // Polished concrete: mottled grey with fine grit, saw cuts every 1 m of shop floor.
  const tex = useSheet('cell-floor2', 400, 400, (ctx, w, h) => {
    ctx.fillStyle = '#a9adaf';
    ctx.fillRect(0, 0, w, h);
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let k = 0; k < 260; k += 1) {
      const v = 150 + rnd() * 50;
      const x = rnd() * w;
      const y = rnd() * h;
      const g = ctx.createRadialGradient(x, y, 0, x, y, 40 + rnd() * 160);
      g.addColorStop(0, `rgba(${v}, ${v}, ${v + 2}, 0.10)`);
      g.addColorStop(1, `rgba(${v}, ${v}, ${v + 2}, 0)`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
    for (let k = 0; k < 14000; k += 1) {
      const v = 120 + rnd() * 110;
      ctx.fillStyle = `rgba(${v}, ${v}, ${v}, 0.22)`;
      ctx.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 2, 1 + rnd() * 2);
    }
    ctx.strokeStyle = 'rgba(70, 74, 78, 0.18)';
    ctx.lineWidth = 2;
    for (const x of [0, w / 2, w]) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (const y of [0, h / 2, h]) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
  });
  const hazard = useSheet('cell-hazard', 200, 8, (ctx, w, h) => {
    ctx.fillStyle = '#f2c200';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#1b1b1b';
    for (let x = -h; x < w + h; x += 32) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + 16, 0);
      ctx.lineTo(x + 16 - h, h);
      ctx.lineTo(x - h, h);
      ctx.fill();
    }
  });
  const tiles: [number, number][] = [];
  for (let x = -1400; x <= 1400; x += 400) for (let y = -1600; y <= 1400; y += 400) tiles.push([x, y]);
  // The cell's floor: a painted work area inside a hazard line.
  const box = { x0: -170, x1: 520, y0: -450, y1: 240 };
  const tape: [number, number, number, number][] = [
    [(box.x0 + box.x1) / 2, box.y0, box.x1 - box.x0 + 10, 0],
    [(box.x0 + box.x1) / 2, box.y1, box.x1 - box.x0 + 10, 0],
    [box.x0, (box.y0 + box.y1) / 2, box.y1 - box.y0, Math.PI / 2],
    [box.x1, (box.y0 + box.y1) / 2, box.y1 - box.y0, Math.PI / 2],
  ];
  return (
    <group>
      {tiles.map(([x, y]) => (
        <mesh key={`${x},${y}`} position={[m(x), m(y), m(F)]} receiveShadow>
          <planeGeometry args={[m(400), m(400)]} />
          <meshStandardMaterial map={tex} roughness={0.78} metalness={0.02} />
        </mesh>
      ))}
      <mesh position={[m((box.x0 + box.x1) / 2), m((box.y0 + box.y1) / 2), m(F + 0.2)]} receiveShadow>
        <planeGeometry args={[m(box.x1 - box.x0), m(box.y1 - box.y0)]} />
        <meshStandardMaterial color="#7f898e" roughness={0.55} transparent opacity={0.35} />
      </mesh>
      {tape.map(([x, y, len, rot], i) => (
        <mesh key={i} position={[m(x), m(y), m(F + 0.4)]} rotation={[0, 0, rot]} receiveShadow>
          <planeGeometry args={[m(len), m(10)]} />
          <meshStandardMaterial map={hazard} roughness={0.6} />
        </mesh>
      ))}
    </group>
  );
}

/** The robot's pedestal: a grey steel column with gussets, on an anchored base plate; its top at z 0. */
function Pedestal() {
  const H = -F;
  return (
    <group>
      <RBox at={[-20, 0, F + 4]} size={[180, 170, 8]} radius={2}>
        <Steel color="#5d646c" />
      </RBox>
      {[
        [-100, -75],
        [60, -75],
        [-100, 75],
        [60, 75],
      ].map(([x, y]) => (
        <Turned key={`${x},${y}`} at={[x, y, F + 8]} profile={[[0, 0], [5, 0], [5, 3], [3, 3], [3, 8], [0, 8]]} segments={6}>
          <Steel color="#a7afb8" />
        </Turned>
      ))}
      <RBox at={[-20, 0, F + 8 + (H - 20) / 2]} size={[110, 100, H - 20]} radius={3}>
        <Paint color="#7d868f" rough={0.38} />
      </RBox>
      {[-1, 1].map((sd) => (
        <group key={sd}>
          <RBox at={[-20 + sd * 61, 0, F + 26]} size={[12, 4, 36]} radius={0.6}>
            <Paint color="#7d868f" rough={0.38} />
          </RBox>
          <RBox at={[-20, sd * 56, F + 26]} size={[4, 12, 36]} radius={0.6}>
            <Paint color="#7d868f" rough={0.38} />
          </RBox>
        </group>
      ))}
      <RBox at={[-20, 0, -6]} size={[150, 140, 12]} radius={2}>
        <Steel color="#4b525b" />
      </RBox>
      {/* The robot's cable from the back down to the floor duct. */}
      <Hose pts={[[-72, 30, -20], [-90, 40, -60], [-100, 60, F + 30], [-110, 90, F + 6]]} r={3} color="#20252b" />
    </group>
  );
}

/** Belt conveyor of cell A on a profile frame, with what moves on it read from the world. */
function Conveyor({ world }: { world: RefObject<WorldState | null> }) {
  const l = cellLayout('feed');
  const b = l.line.belt!;
  const [x0, y0] = b.min;
  const [x1, y1] = b.max;
  const w = x1 - x0;
  const len = y1 - y0;
  const tex = useMemo(() => {
    const t = belt([1, len / 40]).clone();
    t.needsUpdate = true;
    return t;
  }, [len]);
  const beam = useRef<Mesh>(null);
  const beltMat = useRef<MeshStandardMaterial>(null);
  useFrame((_, dt) => {
    const run = world.current?.cell;
    if (!run) return;
    const map = beltMat.current?.map;
    if (map && run.line.out[l.line.beltOutput!] && !run.line.halted) map.offset.y -= (b.speed * Math.min(dt, 0.1)) / 40;
    const mat = beam.current?.material as MeshStandardMaterial | undefined;
    if (mat) {
      const cut = !!run.line.in['끝 센서'];
      mat.emissiveIntensity = cut ? 0.25 : 1.6;
      mat.opacity = cut ? 0.25 : 0.85;
    }
  });
  const cx = (x0 + x1) / 2;
  const legs = [y0 + 14, (y0 + y1) / 2, y1 - 14];
  const sideZ = b.topZ - 9;
  const beamS = l.line.sensors.find((x) => x.kind === 'beam')!;
  return (
    <group>
      {/* Belt over its bed, with the return run underneath. */}
      <RBox at={[cx, (y0 + y1) / 2, b.topZ - 3]} size={[w - 2, len, 6]} radius={2.5}>
        <meshStandardMaterial ref={beltMat} map={tex} roughness={0.85} />
      </RBox>
      <RBox at={[cx, (y0 + y1) / 2, b.topZ - 17]} size={[w - 6, len - 10, 2]} radius={0.8}>
        <meshStandardMaterial color="#1f2328" roughness={0.9} />
      </RBox>
      {/* Side profiles the length of the belt, with end plates. */}
      {[-1, 1].map((sd) => (
        <group key={sd}>
          <Prof a={[cx + sd * (w / 2 + 3), y0 - 8, sideZ - 4]} b={[cx + sd * (w / 2 + 3), y1 + 4, sideZ - 4]} w={6} h={26} />
          <RBox at={[cx + sd * (w / 2 + 6.5), y0 - 2, sideZ - 4]} size={[1.5, 16, 26]} radius={0.4}>
            <Steel color="#8c949d" />
          </RBox>
        </group>
      ))}
      {[y0 - 2, y1 - 3].map((y) => (
        <mesh key={y} position={[m(cx), m(y), m(b.topZ - 6)]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[m(6), m(6), m(w), 24]} />
          <meshStandardMaterial color="#b9c1ca" metalness={0.6} roughness={0.3} />
        </mesh>
      ))}
      {/* Legs on feet, cross members and a long brace near the floor. */}
      {legs.map((y) => (
        <group key={y}>
          {[-1, 1].map((sd) => (
            <Post key={sd} x={cx + sd * (w / 2 - 2)} y={y} top={sideZ - 9} />
          ))}
          <Prof a={[cx - w / 2 + 6, y, F + 30]} b={[cx + w / 2 - 6, y, F + 30]} w={8} />
          <Prof a={[cx - w / 2 + 6, y, sideZ - 13]} b={[cx + w / 2 - 6, y, sideZ - 13]} w={8} />
        </group>
      ))}
      <Prof a={[cx, legs[0] + 4, F + 30]} b={[cx, legs[2] - 4, F + 30]} w={8} />
      {/* Guide rails (the cell's fixed boxes) and the yellow end stop. */}
      {l.fixed
        .filter((f) => f.name === '컨베이어 가이드')
        .map((f, i) => (
          <RBox key={i} at={[(f.min[0] + f.max[0]) / 2, (f.min[1] + f.max[1]) / 2, (f.min[2] + f.max[2]) / 2]} size={[f.max[0] - f.min[0], f.max[1] - f.min[1], f.max[2] - f.min[2]]} radius={0.6}>
            <meshStandardMaterial color="#e6e9ec" roughness={0.35} metalness={0.2} />
          </RBox>
        ))}
      {l.fixed
        .filter((f) => f.name === '끝 멈춤판')
        .map((f, i) => (
          <RBox key={i} at={[(f.min[0] + f.max[0]) / 2, (f.min[1] + f.max[1]) / 2, (f.min[2] + f.max[2]) / 2]} size={[f.max[0] - f.min[0], f.max[1] - f.min[1], f.max[2] - f.min[2]]} radius={0.8}>
            <Paint color="#f2c200" />
          </RBox>
        ))}
      {/* Drive at the far drum: a grey gear box and a blue motor with its fan cover. */}
      <group position={[m(x1 + 20), m(y1 - 6), m(b.topZ - 8)]}>
        <RBox at={[-8, 0, 0]} size={[16, 24, 26]} radius={2.5}>
          <Paint color="#5d6670" rough={0.4} />
        </RBox>
        <mesh position={[m(4), m(-22), 0]} castShadow>
          <cylinderGeometry args={[m(10), m(10), m(30), 28]} />
          <Paint color="#2f5fd0" rough={0.32} />
        </mesh>
        <mesh position={[m(4), m(-39), 0]} castShadow>
          <cylinderGeometry args={[m(9.5), m(9.5), m(5), 28]} />
          <meshStandardMaterial color="#2a2f36" roughness={0.6} />
        </mesh>
        <RBox at={[4, -18, 11]} size={[12, 12, 6]} radius={1}>
          <Paint color="#2a2f36" />
        </RBox>
      </group>
      <Hose pts={[[x1 + 24, y1 - 24, b.topZ + 4], [x1 + 30, y1 - 40, b.topZ - 30], [x1 + 18, y1 - 60, F + 40], [x1 + 4, y1 - 80, F + 4]]} r={1.8} color="#22272d" />
      {/* End sensor: emitter and reflector on brackets, the beam between them, a cable from the emitter. */}
      {beamS.kind === 'beam' &&
        (['a', 'b'] as const).map((k) => {
          const p = beamS[k];
          const out = k === 'a' ? -1 : 1;
          return (
            <group key={k}>
              <RBox at={[p[0] + out * 6, p[1], p[2]]} size={[9, 11, 16]} radius={1.5}>
                <Paint color={k === 'a' ? '#1f2a36' : '#e8e2d0'} rough={0.35} />
              </RBox>
              <RBox at={[p[0] + out * 6, p[1], (sideZ + p[2]) / 2]} size={[3, 8, p[2] - sideZ]} radius={0.5}>
                <Steel color="#9aa3ad" />
              </RBox>
            </group>
          );
        })}
      <Hose pts={[[199, 12, 48], [190, 8, 40], [189, -10, sideZ - 4], [189, -60, sideZ - 6]]} r={1} color="#2a2f36" />
      {beamS.kind === 'beam' && (
        <mesh ref={beam} position={[m((beamS.a[0] + beamS.b[0]) / 2), m(beamS.a[1]), m(beamS.a[2])]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[m(0.6), m(0.6), m(beamS.b[0] - beamS.a[0]), 8]} />
          <meshStandardMaterial color="#ff3b30" emissive="#ff2a1f" emissiveIntensity={1.6} transparent opacity={0.85} toneMapped={false} />
        </mesh>
      )}
    </group>
  );
}

/** Feed table, magazine tower and feed cylinder with its air lines; the pusher follows the line's cylinder travel. */
function Feeder({ world }: { world: RefObject<WorldState | null> }) {
  const l = cellLayout('feed');
  const pu = l.line.pusher!;
  const mag = l.line.magazine!;
  const pusher = useRef<Group>(null);
  const rod = useRef<Mesh>(null);
  const len = pu.retracted[1] - pu.retracted[0];
  const head = 414;
  useFrame(() => {
    const ext = world.current?.cell?.line.ext ?? 0;
    const x0 = pu.retracted[0] + (pu.extended[0] - pu.retracted[0]) * ext;
    if (pusher.current) pusher.current.position.x = m(x0 + len / 2);
    if (rod.current) {
      // The rod runs from the cylinder's head to the pusher's back.
      const back = x0 + len;
      rod.current.position.x = m((back + head) / 2);
      rod.current.scale.y = Math.max(0.01, head - back);
    }
  });
  const cy = (pu.y[0] + pu.y[1]) / 2;
  const cz = (pu.z[0] + pu.z[1]) / 2;
  const inner = 27;
  const t = { x0: mag.x - inner / 2 - 6, x1: mag.x + inner / 2 + 6, y0: mag.y - inner / 2 - 6, y1: mag.y + inner / 2 + 6 };
  const TOP = 262;
  return (
    <group>
      {/* Feed table: a profile frame long enough for the cylinder, its top level with the belt. */}
      <Stand x0={259} x1={500} y0={-404} y1={-336} top={mag.floorZ} s={8}>
        <RBox at={[300, -370, mag.floorZ - 2]} size={[82, 64, 4]} radius={0.6}>
          <Alu />
        </RBox>
        <RBox at={[455, -370, mag.floorZ - 2]} size={[90, 64, 4]} radius={0.6}>
          <Alu />
        </RBox>
      </Stand>
      {/* A trolley with a blue bin of parts waiting to go into the magazine. */}
      <Stand x0={380} x1={470} y0={-300} y1={-240} top={-40} s={8}>
        <RBox at={[425, -270, -42]} size={[90, 60, 4]} radius={0.6}>
          <Steel color="#6b737c" />
        </RBox>
      </Stand>
      <RBox at={[425, -270, -40 + 18]} size={[76, 50, 36]} radius={3}>
        <Paint color="#2f6fd6" rough={0.5} />
      </RBox>
      <RBox at={[425, -270, -40 + 35]} size={[68, 42, 2]} radius={1}>
        <meshStandardMaterial color="#c7ccd3" metalness={0.3} roughness={0.4} />
      </RBox>
      {/* Magazine tower: four profile posts with rails, a clear tube, a cap and the "있음" sensor at the slot. */}
      {[
        [t.x0, t.y0],
        [t.x1, t.y0],
        [t.x0, t.y1],
        [t.x1, t.y1],
      ].map(([x, y]) => (
        <Prof key={`${x},${y}`} a={[x, y, mag.floorZ]} b={[x, y, TOP]} w={10} />
      ))}
      {[100, 180, TOP - 4].map((z) => (
        <group key={z}>
          <Prof a={[t.x0 + 4, t.y0, z]} b={[t.x1 - 4, t.y0, z]} w={6} />
          <Prof a={[t.x0 + 4, t.y1, z]} b={[t.x1 - 4, t.y1, z]} w={6} />
        </group>
      ))}
      <mesh position={[m(mag.x), m(mag.y), m((51 + TOP) / 2)]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[m(inner / 2 + 2), m(inner / 2 + 2), m(TOP - 51), 32, 1, true]} />
        <meshPhysicalMaterial color="#e6f2fa" transparent opacity={0.25} roughness={0.05} side={2} depthWrite={false} />
      </mesh>
      <RBox at={[mag.x, mag.y, TOP + 3]} size={[t.x1 - t.x0 + 8, t.y1 - t.y0 + 8, 6]} radius={1}>
        <Paint color="#3a4350" />
      </RBox>
      <RBox at={[t.x0 - 6, mag.y, mag.floorZ + 10]} size={[8, 10, 10]} radius={1.2}>
        <Paint color="#1f2a36" rough={0.35} />
      </RBox>
      {/* Cylinder: a blue body with end caps on a bracket, two air hoses down to the valve. */}
      <group position={[m(445), m(cy), m(cz + 6)]}>
        <RBox size={[58, 22, 22]} radius={2.5}>
          <Paint color="#2a68d8" rough={0.28} />
        </RBox>
        {[-31, 31].map((dx) => (
          <RBox key={dx} at={[dx, 0, 0]} size={[6, 25, 25]} radius={1.5}>
            <meshStandardMaterial color="#cfd5db" metalness={0.4} roughness={0.35} />
          </RBox>
        ))}
        {[-22, 22].map((dx) => (
          <mesh key={dx} position={[m(dx), 0, m(13)]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[m(2.2), m(2.2), m(6), 12]} />
            <meshStandardMaterial color="#b8bec6" metalness={0.6} roughness={0.3} />
          </mesh>
        ))}
      </group>
      <RBox at={[445, cy, mag.floorZ + 3]} size={[50, 26, 6]} radius={1}>
        <Steel color="#8c949d" />
      </RBox>
      {/* Valve terminal on the table's side with its two solenoids. */}
      <group position={[m(470), m(-334), m(mag.floorZ - 16)]}>
        <RBox size={[36, 8, 18]} radius={1.5}>
          <Paint color="#3a4350" />
        </RBox>
        {[-8, 8].map((dx) => (
          <RBox key={dx} at={[dx, 5, 2]} size={[10, 6, 14]} radius={1.2}>
            <Paint color="#2a2f36" />
          </RBox>
        ))}
      </group>
      <Hose pts={[[423, cy, cz + 21], [420, cy + 10, cz + 34], [440, -330, cz + 20], [462, -330, mag.floorZ - 8]]} />
      <Hose pts={[[467, cy, cz + 21], [474, cy + 8, cz + 32], [480, -330, cz + 16], [478, -330, mag.floorZ - 8]]} />
      <mesh ref={rod} position={[0, m(cy), m(cz + 6)]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[m(3), m(3), m(1), 16]} />
        <meshStandardMaterial color="#e8ecf0" metalness={0.7} roughness={0.12} />
      </mesh>
      <group ref={pusher} position={[0, m(cy), m(cz)]}>
        <RBox size={[len, pu.y[1] - pu.y[0], pu.z[1] - pu.z[0]]} radius={1.2}>
          <meshStandardMaterial color="#cfd5db" metalness={0.35} roughness={0.35} map={brushed([3, 1])} />
        </RBox>
      </group>
    </group>
  );
}

/** A plate's face, drawn: the source plate a machined jig with a numbered pocket per part, the pallet a grey tray with its places marked. */
function usePlateFace(grid: 'source' | 'pallet', label: string, origin: boolean): Texture {
  const l = cellLayout('feed');
  const g = l.grids[grid === 'source' ? '소재 판' : '적재 판'];
  const box = l.fixed.find((f) => f.name === (grid === 'source' ? '소재 판' : '적재 판'))!;
  const [x0, y0, x1] = [box.min[0], box.min[1], box.max[0]];
  const W = x1 - x0;
  const H = box.max[1] - y0;
  const jig = grid === 'source';
  const face = useSheet(`plate2-${grid}`, W, H, (ctx, w, h) => {
    const s = w / W;
    ctx.fillStyle = jig ? '#c9ced4' : '#5d6670';
    ctx.fillRect(0, 0, w, h);
    for (let k = 0; k < 2600; k += 1) {
      const v = jig ? 180 + ((k * 37) % 60) : 80 + ((k * 37) % 30);
      ctx.strokeStyle = `rgba(${v}, ${v}, ${v + 3}, ${jig ? 0.35 : 0.25})`;
      ctx.beginPath();
      const y = (k * 53) % h;
      const x = (k * 97) % w;
      ctx.moveTo(x, y);
      ctx.lineTo(x + (jig ? 40 : 6), y + (jig ? 0 : 6));
      ctx.stroke();
    }
    // The canvas's x is the plate's y (the robot's left-right), its y the plate's x, flipped.
    const at = (px: number, py: number) => [(py - y0) * s, (x1 - px) * s] as const;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let k = 0; k < g.rows * g.cols; k += 1) {
      const p = gridPlace(g, k);
      const [cx, cy] = at(p.x, p.y);
      if (jig) {
        // A pocket: a dark floor inside a bright chamfer ring, its number beside it.
        const gr = ctx.createRadialGradient(cx, cy, 9 * s, cx, cy, 13.5 * s);
        gr.addColorStop(0, '#8a9097');
        gr.addColorStop(0.8, '#6b7178');
        gr.addColorStop(0.88, '#eef1f4');
        gr.addColorStop(1, '#aeb4ba');
        ctx.fillStyle = gr;
        ctx.beginPath();
        ctx.arc(cx, cy, 13.5 * s, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#2b3036';
        ctx.font = `bold ${4.5 * s}px sans-serif`;
        ctx.fillText(String(k + 1), cx + 11 * s, cy - 11 * s);
      } else {
        ctx.strokeStyle = 'rgba(230, 234, 238, 0.7)';
        ctx.lineWidth = 1.5 * s;
        ctx.setLineDash([4 * s, 3 * s]);
        ctx.beginPath();
        ctx.arc(cx, cy, 12.5 * s, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    if (origin) {
      const [cx, cy] = at(g.origin.x, g.origin.y);
      ctx.strokeStyle = '#ff3b30';
      ctx.lineWidth = 2.5 * s;
      ctx.strokeRect(cx - 14 * s, cy - 14 * s, 28 * s, 28 * s);
      ctx.fillStyle = '#ff3b30';
      ctx.font = `bold ${5 * s}px sans-serif`;
      ctx.fillText('기준', cx, cy - 17.5 * s);
    }
    ctx.fillStyle = jig ? 'rgba(30, 36, 44, 0.8)' : 'rgba(235, 238, 242, 0.85)';
    ctx.font = `bold ${6 * s}px sans-serif`;
    ctx.fillText(label, w / 2, h - 4 * s);
    // Lying with the robot's left-right along the canvas's width.
    const c = ctx.canvas;
    const turned = document.createElement('canvas');
    turned.width = c.height;
    turned.height = c.width;
    const t2 = turned.getContext('2d')!;
    t2.translate(turned.width / 2, turned.height / 2);
    t2.rotate(Math.PI / 2);
    t2.drawImage(c, -c.width / 2, -c.height / 2);
    c.width = turned.width;
    c.height = turned.height;
    ctx.drawImage(turned, 0, 0);
  });
  return face;
}

/** The source plate or the pallet on its profile stand. */
function MarkedPlate({ grid, label, origin }: { grid: 'source' | 'pallet'; label: string; origin: boolean }) {
  const l = cellLayout('feed');
  const box = l.fixed.find((f) => f.name === (grid === 'source' ? '소재 판' : '적재 판'))!;
  const [x0, y0] = [box.min[0], box.min[1]];
  const [x1, y1] = [box.max[0], box.max[1]];
  const W = x1 - x0;
  const H = y1 - y0;
  const jig = grid === 'source';
  const face = usePlateFace(grid, label, origin);
  const top = box.max[2];
  return (
    <Stand x0={x0 + 4} x1={x1 - 4} y0={y0 + 4} y1={y1 - 4} top={top - 6} s={8}>
      <RBox at={[(x0 + x1) / 2, (y0 + y1) / 2, top - 4]} size={[W, H, 8]} radius={jig ? 1.2 : 3}>
        <meshStandardMaterial map={face} metalness={jig ? 0.3 : 0.05} roughness={jig ? 0.4 : 0.7} />
      </RBox>
      {!jig &&
        // The tray's low rim.
        [
          [(x0 + x1) / 2, y0 + 1.5, W, 3],
          [(x0 + x1) / 2, y1 - 1.5, W, 3],
          [x0 + 1.5, (y0 + y1) / 2, 3, H],
          [x1 - 1.5, (y0 + y1) / 2, 3, H],
        ].map(([x, y, sx, sy]) => (
          <RBox key={`${x},${y}`} at={[x, y, top + 1.5]} size={[sx, sy, 3]} radius={0.8}>
            <meshStandardMaterial color="#4b535c" roughness={0.7} />
          </RBox>
        ))}
    </Stand>
  );
}

/** Control cabinet with a stack light (green: running, amber: a 주의, red: stopped or broken), signal lamps, an E-stop. */
function Cabinet({ world, cell }: { world: RefObject<WorldState | null>; cell: CellId }) {
  const l = cellLayout(cell);
  const lights = useRef<(MeshStandardMaterial | null)[]>([]);
  const lamps = useRef<(MeshStandardMaterial | null)[]>([]);
  const signals = [...l.inputs, ...l.outputs];
  useFrame(() => {
    const run = world.current?.cell;
    if (!run) return;
    const recent = run.alerts.length ? run.alerts[run.alerts.length - 1] : null;
    const red = !!run.halt || !!run.health.fault;
    const amber = !red && !!recent && recent.level === 'warn' && run.line.t - recent.t < 4;
    const green = !red && !amber;
    [green, amber, red].forEach((on, i) => {
      const mat = lights.current[i];
      if (mat) mat.emissiveIntensity = on ? (i === 2 && Math.floor(run.line.t * 3) % 2 ? 0.3 : 2.2) : 0.06;
    });
    signals.forEach((name, i) => {
      const mat = lamps.current[i];
      const on = i < l.inputs.length ? run.line.in[name] : run.line.out[name];
      if (mat) mat.emissiveIntensity = on ? 1.8 : 0.05;
    });
  });
  const at = { x: -80, y: -300 };
  const H = 200;
  const z0 = F + 16;
  return (
    <group>
      <RBox at={[at.x, at.y, F + 8]} size={[56, 84, 16]} radius={1}>
        <Steel color="#3a3f46" />
      </RBox>
      <RBox at={[at.x, at.y, z0 + H / 2]} size={[50, 80, H]} radius={2.5}>
        <Paint color="#e2e5e8" rough={0.45} />
      </RBox>
      {/* Door seam, handle, name plate, lamp panel and E-stop on the front (facing +x). */}
      <RBox at={[at.x + 25.2, at.y, z0 + H / 2]} size={[0.6, 74, H - 8]} radius={0.3}>
        <meshStandardMaterial color="#c9cdd2" roughness={0.5} />
      </RBox>
      <RBox at={[at.x + 27, at.y + 30, z0 + H * 0.45]} size={[4, 4, 26]} radius={1.5}>
        <Steel color="#2a2f36" />
      </RBox>
      <RBox at={[at.x + 25.6, at.y - 6, z0 + H - 18]} size={[0.8, 44, 12]} radius={0.3}>
        <meshStandardMaterial color="#1d4ed8" roughness={0.4} />
      </RBox>
      <RBox at={[at.x + 25.6, at.y - 6, z0 + H - 58]} size={[1.2, 50, 44]} radius={0.5}>
        <meshStandardMaterial color="#2a3038" roughness={0.6} />
      </RBox>
      {signals.map((name, i) => {
        const col = i < l.inputs.length ? '#3ddc84' : '#ffb020';
        const row = i < l.inputs.length ? 0 : 1;
        const k = i < l.inputs.length ? i : i - l.inputs.length;
        return (
          <mesh key={name} position={[m(at.x + 26.6), m(at.y - 24 + k * 12), m(z0 + H - 48 - row * 18)]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[m(3.2), m(3.2), m(1.5), 18]} />
            <meshStandardMaterial
              ref={(r) => {
                lamps.current[i] = r;
              }}
              color={col}
              emissive={col}
              emissiveIntensity={0.05}
              toneMapped={false}
            />
          </mesh>
        );
      })}
      <RBox at={[at.x + 25.8, at.y - 6, z0 + H - 100]} size={[1, 20, 20]} radius={1}>
        <Paint color="#f2c200" />
      </RBox>
      <mesh position={[m(at.x + 29), m(at.y - 6), m(z0 + H - 100)]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[m(6), m(6.5), m(6), 24]} />
        <Paint color="#d91e18" rough={0.3} />
      </mesh>
      {/* Stack light on a short pole. */}
      <group position={[m(at.x), m(at.y + 26), m(z0 + H)]}>
        <Turned profile={pill(3, 14, 0.8)} segments={16}>
          <Steel color="#2a2f36" />
        </Turned>
        <Turned at={[0, 0, 14]} profile={pill(6, 5, 1)} segments={20}>
          <Paint color="#2a2f36" />
        </Turned>
        {['#29c46a', '#f5a524', '#ff4a3d'].map((c, i) => (
          <Turned key={c} at={[0, 0, 19 + i * 12]} profile={pill(6.5, 11.5, 1.4)} segments={24}>
            <meshStandardMaterial
              ref={(r) => {
                lights.current[i] = r;
              }}
              color={c}
              emissive={c}
              emissiveIntensity={0.06}
              roughness={0.3}
              toneMapped={false}
            />
          </Turned>
        ))}
        <Turned at={[0, 0, 55]} profile={pill(6, 3, 1)} segments={20}>
          <Paint color="#2a2f36" />
        </Turned>
      </group>
      {/* Cable duct from the cabinet along the floor towards the line. */}
      <RBox at={[at.x + 60, at.y - 30, F + 4]} size={[70, 14, 8]} radius={2}>
        <Paint color="#4b535c" rough={0.6} />
      </RBox>
    </group>
  );
}

/** A guard behind the robot: yellow posts with clear panels, low enough to see over. */
function Fence() {
  const H = 260;
  const xs = -205;
  const ys: number[] = [];
  for (let y = -460; y <= 260; y += 120) ys.push(y);
  return (
    <group>
      {ys.slice(0, -1).map((y) => (
        <group key={y}>
          <mesh position={[m(xs), m(y + 60), m(F + 20 + H / 2)]} rotation={[Math.PI / 2, Math.PI / 2, 0]}>
            <planeGeometry args={[m(112), m(H - 20)]} />
            <meshPhysicalMaterial color="#dbe7ef" transparent opacity={0.18} roughness={0.08} side={2} depthWrite={false} />
          </mesh>
          {[F + 22, F + H + 8].map((z) => (
            <RBox key={z} at={[xs, y + 60, z]} size={[4, 112, 4]} radius={0.8}>
              <Paint color="#f2c200" />
            </RBox>
          ))}
        </group>
      ))}
      {ys.map((y) => (
        <group key={y}>
          <RBox at={[xs, y, F + (H + 12) / 2]} size={[8, 8, H + 12]} radius={1}>
            <Paint color="#f2c200" />
          </RBox>
          <RBox at={[xs, y, F + 2]} size={[18, 18, 4]} radius={1}>
            <Steel color="#3a3f46" />
          </RBox>
        </group>
      ))}
    </group>
  );
}

/** The workshop round the cell: a light, hazy backdrop so the cell stands out (the stage's own is put back on leaving). */
function Backdrop() {
  const get = useThree((s) => s.get);
  useEffect(() => {
    const scene = get().scene;
    const bg = scene.background;
    const fog = scene.fog;
    scene.background = new Color('#d9dde1');
    scene.fog = new Fog('#d9dde1', 1.4, 3.6);
    return () => {
      scene.background = bg;
      scene.fog = fog;
    };
  }, [get]);
  return null;
}

export default function CellScene({ world, cell }: { world: RefObject<WorldState | null>; cell: CellId }) {
  return (
    <group>
      <Backdrop />
      <Floor />
      <Fence />
      <Pedestal />
      {cell === 'feed' && (
        <>
          <Conveyor world={world} />
          <Feeder world={world} />
          <MarkedPlate grid="source" label="소재 판" origin={false} />
          <MarkedPlate grid="pallet" label="적재 판" origin />
        </>
      )}
      <Cabinet world={world} cell={cell} />
    </group>
  );
}
