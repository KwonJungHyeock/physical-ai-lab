'use client';

/**
 * 물류 허브: round the palletising cell (robot frame, mm; see ../Around.tsx). The cell stands on a
 * steel bench LOGISTICS_BENCH_MM high (its top is the robot frame's z = 0); the warehouse floor is that
 * far below, and everything on it is at real size: pallet racking with loaded EUR pallets, the AGV
 * aisle, the dispatch lane with stretch-wrapped pallets, the next palletising station, a worker.
 */

import { Instance, Instances } from '@react-three/drei';
import { useMemo } from 'react';

import { RBox, cardboard, wood } from '../../../../simulator/stage/sceneKit';
import { Tape, m, useTextTexture } from '../../CellKit';
import Bench from '../Bench';
import type { SiteLook } from '../Ground';
import { Blob } from '../Ground';
import { Hall } from '../Hall';
import Model from '../Model';
import { Beacon, Monitor, RouteAgv, RunningBelt, SignalTower, WorkingArm } from '../Props';

type Xy = readonly [number, number];
type Xyz = [number, number, number];

/** The steel bench the palletising cell stands on: its top (the robot frame's z = 0) above the warehouse floor, mm. */
export const LOGISTICS_BENCH_MM = 800;

export const LOGISTICS_LOOK: SiteLook = { sky: '#d3d5d6', floor: 'concrete', groundZ: -LOGISTICS_BENCH_MM, fog: [2.6, 8] };

/* --- pallets and their loads ---------------------------------------------------------------- */

/** A EUR pallet, mm: 1200 long, 800 wide, 144 high. */
const EUR = { l: 1200, w: 800, h: 144 } as const;
/** Carton patterns on a pallet: cartons along its length × across, and a layer's height. */
const PATTERNS = [
  { n: [3, 2], h: 240 },
  { n: [2, 2], h: 300 },
  { n: [4, 2], h: 200 },
] as const;
const CARTON_TONES = ['#c9995f', '#bf8d55', '#d2a56c', '#b8864f', '#cfa067'] as const;

/** One pallet load: its centre on the floor or a beam (`z`), turned by `yaw` (0: its length along x, or a quarter turn), what is stacked on it. */
export interface PalletLoad {
  at: Xy;
  z?: number;
  yaw?: number;
  /** PATTERNS index, layers of cartons (0: an empty pallet), and whether it is wrapped in stretch film. */
  pattern?: number;
  layers?: number;
  wrap?: boolean;
}

interface Piece {
  p: Xyz;
  s: Xyz;
  c: string;
}

/** A load's boxes in its parent's frame: the pallet's boards and blocks, the cartons, the film round them. */
function loadPieces(q: PalletLoad, k: number): { wood: Piece[]; cartons: Piece[]; film: Piece | null } {
  const [x, y] = q.at;
  const z0 = q.z ?? 0;
  const turned = Math.abs(Math.sin(q.yaw ?? 0)) > 0.5;
  // (a along the pallet's length, b across, height) → the parent's frame; sizes likewise.
  const at = (a: number, b: number, h: number): Xyz => (turned ? [x - b, y + a, z0 + h] : [x + a, y + b, z0 + h]);
  const size = (sa: number, sb: number, sh: number): Xyz => (turned ? [sb, sa, sh] : [sa, sb, sh]);
  const wood: Piece[] = [];
  const tone = (i: number) => (['#c49564', '#b88a58', '#cc9f6e'] as const)[(i + k) % 3];
  const rows = [-327.5, 0, 327.5];
  const cols = [-527.5, 0, 527.5];
  // Bottom boards, nine blocks, three cross boards, five top boards (EUR: 22 + 78 + 22 + 22 mm).
  rows.forEach((b, i) => wood.push({ p: at(0, b, 11), s: size(EUR.l, i === 1 ? 145 : 100, 22), c: tone(i) }));
  cols.forEach((a) => rows.forEach((b, i) => wood.push({ p: at(a, b, 61), s: size(145, i === 1 ? 145 : 100, 78), c: '#a9784a' })));
  cols.forEach((a, i) => wood.push({ p: at(a, 0, 111), s: size(145, EUR.w, 22), c: tone(i + 1) }));
  [-327.5, -170, 0, 170, 327.5].forEach((b, i) => wood.push({ p: at(0, b, 133), s: size(EUR.l, i % 2 ? 100 : 145, 22), c: tone(i + 2) }));
  const pat = PATTERNS[(q.pattern ?? k) % PATTERNS.length];
  const layers = q.layers ?? 4;
  const [na, nb] = pat.n;
  const ca = EUR.l / na;
  const cb = EUR.w / nb;
  const cartons: Piece[] = [];
  for (let l = 0; l < layers; l += 1)
    for (let i = 0; i < na; i += 1)
      for (let j = 0; j < nb; j += 1) {
        const r = Math.sin((k + 1) * 12.9898 + l * 78.233 + i * 37.719 + j * 4.581) * 43758.5453;
        const f = r - Math.floor(r);
        cartons.push({
          p: at(-EUR.l / 2 + ca * (i + 0.5) + (f - 0.5) * 8, -EUR.w / 2 + cb * (j + 0.5) + (f - 0.5) * 6, EUR.h + pat.h * (l + 0.5)),
          s: size(ca - 6, cb - 6, pat.h - 4),
          c: CARTON_TONES[Math.floor(f * CARTON_TONES.length)],
        });
      }
  const hh = layers * pat.h;
  const film = layers && q.wrap !== false ? { p: at(0, 0, EUR.h + hh / 2 - 10), s: size(EUR.l + 14, EUR.w + 14, hh - 20), c: '#eef4fb' } : null;
  return { wood, cartons, film };
}

/**
 * Pallet loads, all drawn in a few calls (instancing): the pallets' boards and blocks, the cartons
 * (taped cardboard, a tone each), the stretch film round the stacks; and a soft shadow under each.
 */
export function PalletLoads({ loads, shadows = true }: { loads: readonly PalletLoad[]; shadows?: boolean }) {
  const { woods, cartons, films } = useMemo(() => {
    const all = loads.map((q, k) => loadPieces(q, k));
    return { woods: all.flatMap((a) => a.wood), cartons: all.flatMap((a) => a.cartons), films: all.flatMap((a) => (a.film ? [a.film] : [])) };
  }, [loads]);
  const grainTex = useMemo(() => wood([1, 1]), []);
  const boardTex = useMemo(() => cardboard(), []);
  return (
    <group>
      <Instances limit={woods.length} castShadow receiveShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial map={grainTex} roughness={0.85} />
        {woods.map((w, i) => (
          <Instance key={i} position={w.p.map(m) as Xyz} scale={w.s.map(m) as Xyz} color={w.c} />
        ))}
      </Instances>
      {cartons.length > 0 && (
        <Instances limit={cartons.length} castShadow receiveShadow>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial map={boardTex} roughness={0.82} />
          {cartons.map((w, i) => (
            <Instance key={i} position={w.p.map(m) as Xyz} scale={w.s.map(m) as Xyz} color={w.c} />
          ))}
        </Instances>
      )}
      {films.length > 0 && (
        <Instances limit={films.length}>
          <boxGeometry args={[1, 1, 1]} />
          <meshPhysicalMaterial color="#f4f8fc" transparent opacity={0.4} roughness={0.1} clearcoat={1} depthWrite={false} />
          {films.map((w, i) => (
            <Instance key={i} position={w.p.map(m) as Xyz} scale={w.s.map(m) as Xyz} />
          ))}
        </Instances>
      )}
      {shadows && loads.filter((q) => !q.z).map((q, i) => <Blob key={i} at={q.at} w={Math.abs(Math.sin(q.yaw ?? 0)) > 0.5 ? EUR.w : EUR.l} d={Math.abs(Math.sin(q.yaw ?? 0)) > 0.5 ? EUR.l : EUR.w} k={0.4} />)}
    </group>
  );
}

/* --- pallet racking ------------------------------------------------------------------------- */

/** A bay of pallet racking: beam length (three EUR pallets side by side), depth, upright height, mm. */
const RACK = { bay: 2700, depth: 1100, h: 2700 } as const;

/**
 * Selective pallet racking at real size (no CC0 model exists): blue upright frames with their
 * bracing, orange box beams, yellow post guards on the aisle side, location plates; `bays` bays
 * along the run from `at`, its front (the aisle) facing −y of its own frame, turned by `yaw`. Loads
 * stand on the floor and on each beam level, three to a bay, where `filled` says so.
 */
function Racking({ at, yaw = 0, bays, levels = [1350], filled }: { at: Xy; yaw?: number; bays: number; levels?: readonly number[]; filled: (bay: number, slot: number, level: number) => boolean }) {
  const { bay, depth: D, h: H } = RACK;
  const posts = Array.from({ length: bays + 1 }, (_, i) => i * bay).flatMap((x) => [40, D - 40].map((y) => [x, y] as const));
  // The frame bracing: a strut low down, then a zigzag of diagonals up between the front and back posts.
  const struts = Array.from({ length: bays + 1 }, (_, i) => i * bay).flatMap((x) => {
    const out: { p: Xyz; rx: number; len: number }[] = [{ p: [x, D / 2, 150], rx: 0, len: D - 80 }];
    for (let z = 150, up = true; z + 600 <= H - 100; z += 600, up = !up) out.push({ p: [x, D / 2, z + 300], rx: (up ? 1 : -1) * Math.atan2(600, D - 80), len: Math.hypot(600, D - 80) });
    return out;
  });
  const beamZ = [...levels, H - 80];
  const beams = Array.from({ length: bays }, (_, i) => i * bay + bay / 2).flatMap((x) => beamZ.flatMap((z) => [40, D - 40].map((y) => [x, y, z - 55] as Xyz)));
  const loads = useMemo(
    () =>
      [0, ...levels].flatMap((z, l) =>
        Array.from({ length: bays * 3 }, (_, k) => k)
          .filter((k) => filled(Math.floor(k / 3), k % 3, l))
          .map((k): PalletLoad => ({ at: [Math.floor(k / 3) * bay + (bay / 6) * (2 * (k % 3) + 1), D / 2], z, yaw: Math.PI / 2, pattern: (k * 7 + l * 3) % 3, layers: 2 + ((k + l) % 3) })),
      ),
    [bays, bay, D, levels, filled],
  );
  return (
    <group position={[m(at[0]), m(at[1]), 0]} rotation={[0, 0, yaw]}>
      <Instances limit={posts.length + struts.length} castShadow receiveShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#1f4fc4" metalness={0.35} roughness={0.42} />
        {posts.map(([x, y]) => (
          <Instance key={`p${x},${y}`} position={[m(x), m(y), m(H / 2)]} scale={[m(80), m(70), m(H)]} />
        ))}
        {struts.map((s, i) => (
          <Instance key={`s${i}`} position={s.p.map(m) as Xyz} rotation={[s.rx, 0, 0]} scale={[m(28), m(s.len), m(28)]} />
        ))}
      </Instances>
      <Instances limit={beams.length} castShadow receiveShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#ef7d1a" metalness={0.25} roughness={0.45} />
        {beams.map((p) => (
          <Instance key={p.join()} position={p.map(m) as Xyz} scale={[m(bay - 80), m(50), m(110)]} />
        ))}
      </Instances>
      {/* Location plates on the front beams (one per pallet place), post guards and base plates on the aisle side. */}
      <Instances limit={bays * 3 * levels.length + (bays + 1) * 2}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#f4f5f6" roughness={0.6} />
        {levels.flatMap((z) =>
          Array.from({ length: bays * 3 }, (_, k) => (
            <Instance key={`l${z},${k}`} position={[m(Math.floor(k / 3) * bay + (bay / 6) * (2 * (k % 3) + 1)), m(40 - 27), m(z - 55)]} scale={[m(150), m(4), m(60)]} />
          )),
        )}
        {Array.from({ length: bays + 1 }, (_, i) => (
          <Instance key={`b${i}`} position={[m(i * bay), m(40), m(4)]} scale={[m(150), m(130), m(8)]} color="#59616b" />
        ))}
        {Array.from({ length: bays + 1 }, (_, i) => (
          <Instance key={`g${i}`} position={[m(i * bay), m(-30), m(200)]} scale={[m(140), m(70), m(400)]} color="#f2c230" />
        ))}
      </Instances>
      <PalletLoads loads={loads} shadows={false} />
      <Blob at={[(bays * bay) / 2, D / 2]} w={bays * bay} d={D} k={0.3} />
    </group>
  );
}

/* --- signs and markings ---------------------------------------------------------------------- */

/**
 * A real-size sign (a plate hung over the aisle, painted on the floor, standing on the bench), `w` × `h`
 * mm, its face towards −y of `yaw`; `k` pixels a millimetre (one is sharp enough at the room's distance
 * and keeps a big sign's canvas small).
 */
export function Plate({ at, z, w, h, yaw = 0, lines, fg, bg, flat = false, k = 1 }: { at: Xy; z: number; w: number; h: number; yaw?: number; lines: readonly string[]; fg: string; bg: string; flat?: boolean; k?: number }) {
  const tex = useTextTexture(lines, w, h, fg, bg, k);
  return (
    <mesh position={[m(at[0]), m(at[1]), m(z)]} rotation={flat ? [0, 0, yaw] : [Math.PI / 2, yaw, 0]} receiveShadow>
      <planeGeometry args={[m(w), m(h)]} />
      <meshStandardMaterial map={tex} roughness={0.6} />
    </mesh>
  );
}

/** The four sides of a rectangle, for Tape. */
const outline = (x0: number, y0: number, x1: number, y1: number): [number, number][][] => [
  [
    [x0, y0],
    [x1, y0],
  ],
  [
    [x1, y0],
    [x1, y1],
  ],
  [
    [x1, y1],
    [x0, y1],
  ],
  [
    [x0, y1],
    [x0, y0],
  ],
];

/** Painted floor lines: yellow lane edges and the cell's zone, the AGVs' blue guide tape, white pallet places, painted names. */
function Lines() {
  const Y = '#e8b923';
  const W = 75;
  return (
    <group>
      {/* The AGV aisle along the racking: both edges, the guide tape loop the AGVs follow, its name. */}
      <Tape a={[-2050, -3000]} b={[-2050, 2050]} w={W} color={Y} />
      <Tape a={[-450, -3000]} b={[-450, 2050]} w={W} color={Y} />
      <Tape a={[-2050, 2050]} b={[1700, 2050]} w={W} color={Y} />
      {outline(-1550, -2800, -1150, 1700).map(([a, b], i) => (
        <Tape key={`g${i}`} a={a} b={b} w={50} color="#2c4f9e" />
      ))}
      <Plate at={[-1350, -650]} z={1} yaw={Math.PI / 2} w={440} h={140} flat lines={['AGV 전용']} fg="#ffffff" bg="#2c4f9e" />
      {/* The cell's zone round the bench (the aisle's edge is its fourth side), the walkway past it. */}
      {outline(-450, -520, 700, 560)
        .slice(0, 3)
        .map(([a, b], i) => (
          <Tape key={`z${i}`} a={a} b={b} w={W} color={Y} />
        ))}
      <Tape a={[1500, -3000]} b={[1500, 2050]} w={W} color={Y} />
      {/* The dispatch lane: pallet places outlined in white, its name painted on the floor. */}
      {[0, 1, 2].flatMap((i) =>
        outline(-300 + i * 950, -2350, 550 + i * 950, -1050).map(([a, b], k) => <Tape key={`d${i}${k}`} a={a} b={b} w={50} color="#f4f5f6" />),
      )}
      <Plate at={[1100, -900]} z={1} w={700} h={170} flat lines={['출고 대기 · B-03']} fg="#1d2025" bg="#e8b923" />
    </group>
  );
}

/* --- 물류 센터 ----------------------------------------------------------------------------- */

/** A mini pallet with a stretch-wrapped stack of cartons (`h` high): what the AGVs carry from the cell. */
function MiniLoad({ h = 90, color = '#c8925a' }: { h?: number; color?: string }) {
  return (
    <group>
      <RBox at={[0, 0, 7]} size={[150, 150, 14]} radius={1.5}>
        <meshStandardMaterial color="#c08a52" roughness={0.75} />
      </RBox>
      <RBox at={[0, 0, 14 + h / 2]} size={[142, 142, h]} radius={3}>
        <meshStandardMaterial color={color} roughness={0.8} />
      </RBox>
      <RBox at={[0, 0, 14 + h / 2]} size={[146, 146, h - 6]} radius={4} shadow={false}>
        <meshPhysicalMaterial color="#eef3f7" transparent opacity={0.28} roughness={0.15} clearcoat={1} />
      </RBox>
    </group>
  );
}

/** A ceiling lamp over the aisle (its rod reaches up out of the view). */
function Lamp({ at }: { at: Xy }) {
  return <Model group="logistics" name="lamp" at={at} z={2350} />;
}

/** A sign hung over the aisle on two rods, its face towards −y of `yaw`. */
function HangingSign({ at, z, yaw = 0, lines }: { at: Xy; z: number; yaw?: number; lines: readonly string[] }) {
  return (
    <group position={[m(at[0]), m(at[1]), 0]} rotation={[0, 0, yaw]}>
      {[-1, 1].map((k) => (
        <RBox key={k} at={[k * 380, 6, z + 500]} size={[12, 12, 1000]} radius={3} shadow={false}>
          <meshStandardMaterial color="#8d949b" metalness={0.6} roughness={0.4} />
        </RBox>
      ))}
      <RBox at={[0, 8, z]} size={[920, 12, 300]} radius={4} shadow={false}>
        <meshStandardMaterial color="#2b3038" roughness={0.5} />
      </RBox>
      <Plate at={[0, 1]} z={z} w={900} h={280} lines={lines} fg="#ffffff" bg="#e0802a" />
    </group>
  );
}

/** The dispatch lane's pallets (stretch-wrapped, waiting for the truck) and the supply pallet of cartons for the next station. */
const FLOOR_LOADS: readonly PalletLoad[] = [
  { at: [125, -1700], yaw: Math.PI / 2, pattern: 0, layers: 4 },
  { at: [1075, -1700], yaw: Math.PI / 2, pattern: 1, layers: 3 },
  { at: [2025, -1700], yaw: Math.PI / 2, pattern: 2, layers: 4 },
  { at: [350, 1650], pattern: 2, layers: 2, wrap: false },
];

/**
 * The warehouse round the palletising cell, on the floor LOGISTICS_BENCH_MM below the bench top: two
 * runs of pallet racking along the AGV aisle and the back wall, two AGVs on their guide tape loop, the
 * dispatch lane with wrapped pallets and a hand truck, the next palletising station with its screen
 * and signal tower, a worker there, the supply pallet and cartons, lamps over the aisle.
 */
export function LogisticsAround() {
  return (
    <group position={[0, 0, m(-LOGISTICS_BENCH_MM)]}>
      <Hall band="#e0802a" wall="#e3e1dc" x={-3300} y={3300} h={3000} />
      <Lines />
      {/* Racking along the aisle (its front faces the cell) and along the back wall. */}
      <Racking at={[-2150, -3600]} yaw={Math.PI / 2} bays={2} filled={(b, s, l) => (b * 3 + s * 5 + l * 7) % 7 > 2} />
      <Racking at={[-2000, 2150]} bays={1} filled={(b, s, l) => (s + l * 2) % 3 !== 1} />
      <PalletLoads loads={FLOOR_LOADS} />
      {/* Two AGVs on their loop along the aisle, half a lap apart, one carrying a finished mini pallet. */}
      {[0, 17].map((ph, i) => (
        <RouteAgv
          key={i}
          route={[
            [-1150, -2800],
            [-1150, 1700],
            [-1550, 1700],
            [-1550, -2800],
          ]}
          speed={180}
          phase={ph}
          led={i ? '#38bdf8' : '#1fae66'}
          cargo={i ? undefined : <MiniLoad h={70} />}
        />
      ))}
      <HangingSign at={[-1350, 1500]} z={2250} yaw={0.6} lines={['B동 랙 · AGV 통로', '사람 출입 금지']} />
      <Beacon at={[-450, 2050]} z={0} />
      {/* The next palletising station past the zone line: its belt bringing cartons, its arm stacking them, the line's screen. */}
      <group position={[0, 0, m(LOGISTICS_BENCH_MM)]}>
        <Bench x0={80} x1={380} y0={700} y1={1220} h={LOGISTICS_BENCH_MM} />
        <RunningBelt at={[230, 960]} belt={{ x: 0, width: 110, top: 70, yIn: 230, yOut: -230 }} speed={50} gap={150} />
      </group>
      <WorkingArm
        at={[-200, 950]}
        yaw={-Math.PI / 2}
        job={{
          pick: [150, -95, 25],
          place: [150, 95, 25],
          period: 8,
          block: '#c8925a',
        }}
        phase={1.5}
        table={[500, 360, LOGISTICS_BENCH_MM]}
      />
      <SignalTower at={[430, 640]} h={LOGISTICS_BENCH_MM + 300} />
      <RBox at={[500, 1320, (LOGISTICS_BENCH_MM + 300) / 2]} size={[60, 60, LOGISTICS_BENCH_MM + 300]} radius={6}>
        <meshStandardMaterial color="#59616b" metalness={0.5} roughness={0.4} />
      </RBox>
      <Monitor at={[500, 1320]} yaw={-1.1} w={420} z={LOGISTICS_BENCH_MM + 300} stand={false} kind="line" accent="#e0802a" title="출고 B동 · 적재 현황" />
      {/* The worker at the next station (to the side, out of the way of the view of the arm), cartons by the supply pallet, the hand truck at the dispatch lane. */}
      <Model group="people" name="workerMan" at={[750, 1150]} yaw={-1.3} pose="Idle" />
      <Model group="logistics" name="handTruck" at={[2300, -900]} yaw={-0.6} />
      <Model group="logistics" name="box" at={[1100, 1650]} yaw={0.3} />
      <Model group="logistics" name="box" at={[1120, 1650]} z={342} yaw={0.15} />
      <Model group="logistics" name="box" at={[1500, 1700]} yaw={-0.4} />
      {[-1500, 0, 1500].map((y) => (
        <Lamp key={y} at={[-1350, y]} />
      ))}
    </group>
  );
}
