'use client';

/**
 * 물류 센터 · 팔레타이징 셀 in 3D (inside LearnStage's robot-frame group: metres, z up), in the
 * simulator's own style like the conveyor cell: the in-feed belt conveyor with its end stop, a
 * small wooden pallet, cardboard cartons (a crushed one is drawn pressed down), and the pallet
 * check — a post with a light curtain head and a stack light that turns red when it trips.
 *
 * Every frame it plays the run (engine/education/lab/pallet.ts frames) through PalletPlayback:
 * the arm follows it (LearnStage reads `player.arm`), the boxes move and turn as the physics had
 * them. Overlays: where the next box will be let go (값 고치기), the pressed depth and what has
 * been measured (원인 찾기), the cup's acceleration while it carries a box (②).
 *
 * Around it, the warehouse the story happens in (CellDressing): floor markings, a shelf with
 * stock, a finished pallet wrapped in film — and per problem what the story names: the old and
 * the new cartons (①), heavy cartons with their weight sticker, the scale and the dispatch
 * deadline (②), the pallet's floor marking where it used to stand, puddles and a wet-floor sign (③).
 */

import { Html, Line } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, type ReactNode, type RefObject } from 'react';
import { CanvasTexture, DoubleSide, Quaternion, RepeatWrapping, SRGBColorSpace, Vector3, type Group, type Mesh, type MeshStandardMaterial } from 'three';

import { FEED, HEAVY_G, MARK_OFF, N_BOXES, PAL, PAL_HOME, PBOX, type LogiProblem, type PFrame, type PalletPose, type PalletRun } from '@/engine/education/lab/pallet';
import type { Mm } from '@/engine/education/lab/cell';

import { RBox, belt, wood } from '../../simulator/stage/sceneKit';
import { LEARN_COLORS } from '../stage/learn3d';
import type { LiveArm } from '../stage/LearnStage';
import { BeltConveyor, CardBox, scroll } from './ConveyorCell';

const m = (mm: number) => mm / 1000;
const v3 = (p: readonly number[]) => new Vector3(m(p[0]), m(p[1]), m(p[2]));
const FRAME_DT = 0.02;
const BOX_SIZE: Mm = [PBOX.sx, PBOX.sy, PBOX.h];
const CARTON = '#c9995f';
/** ②'s heavy cartons: a darker, double-wall board. */
const HEAVY_CARTON = '#9c6b3c';
/** The conveyor as drawn: its frame ends just behind the end stop. */
const FEED_BELT = { x: FEED.x, width: FEED.width, top: FEED.top, yIn: FEED.yIn, yOut: FEED.yStop + 16 } as const;
/** The pallet check post, at the pallet's back corner (away from the arm, out of the way of the view). */
const checkPost = (p: PalletPose): Mm => [p.x - PAL.sx / 2 - 22, p.y - PAL.sy / 2 - 16, 0];

/** Playback of a pallet run: the time, whether it plays, and the arm pose LearnStage reads. */
export class PalletPlayback {
  run: PalletRun | null = null;
  t = 0;
  playing = false;
  rate = 1;
  /** Boxes to show when there is no run. */
  still: PFrame['boxes'] | null = null;
  readonly arm: { current: LiveArm | null } = { current: null };
  private onTick: ((t: number, done: boolean) => void) | null = null;
  private lastTick = 0;

  listen(fn: ((t: number, done: boolean) => void) | null): void {
    this.onTick = fn;
  }
  start(run: PalletRun | null, at: number | 'end' = 0, rate = 1): void {
    this.run = run;
    this.rate = rate;
    this.t = run ? (at === 'end' ? run.durationS : Math.min(at, run.durationS)) : 0;
    this.playing = !!run && this.t < run.durationS;
    this.lastTick = this.t;
  }
  setStill(boxes: PFrame['boxes'] | null): void {
    this.still = boxes;
  }
  setRate(rate: number): void {
    this.rate = rate;
  }
  pause(): void {
    this.playing = false;
  }
  resume(): void {
    if (this.run && this.t < this.run.durationS) this.playing = true;
  }
  seek(t: number): void {
    if (!this.run) return;
    this.t = Math.max(0, Math.min(this.run.durationS, t));
    this.lastTick = this.t;
    this.onTick?.(this.t, this.t >= this.run.durationS);
  }
  frame(): PFrame | null {
    const r = this.run;
    return r ? r.frames[Math.min(r.frames.length - 1, Math.max(0, Math.round(this.t / FRAME_DT)))] : null;
  }
  advance(dt: number): PFrame | null {
    const run = this.run;
    if (!run) {
      this.arm.current = null;
      return null;
    }
    if (this.playing) {
      this.t = Math.min(run.durationS, this.t + Math.min(dt, 0.1) * this.rate);
      const done = this.t >= run.durationS;
      if (done) this.playing = false;
      if (done || this.t - this.lastTick >= 0.1) {
        this.lastTick = this.t;
        this.onTick?.(this.t, done);
      }
    }
    const f = this.frame()!;
    this.arm.current = { angles: f.q, pump: f.pump };
    return f;
  }
}

/** A measured length drawn in the cell (원인 찾기): from a to b, with its value. */
export interface PalletDim {
  key: string;
  a: Mm;
  b: Mm;
  text: string;
  color: string;
  /** Where its value sits: at the middle (default), or at the far end to the left / right. */
  label?: 'l' | 'r';
}

export interface PalletOverlay {
  /** Where a box will be let go (값 고치기): its centre, and how it sits on what is under it. */
  ghosts?: { key: string; at: Mm; state: 'press' | 'drop' | 'ok'; text?: string }[];
  /** The pressed depth (원인 찾기): the lower box's top, and how deep. */
  press?: { at: Mm; mm: number } | null;
  /** Tool tip path so far. */
  path?: Mm[] | null;
  /** Where the program thinks the pallet is (③): its outline on the floor, dashed. */
  progPallet?: PalletPose | null;
  /** The taught reference point under the cup (③ 값 고치기). */
  refCursor?: Mm | null;
  /** What has been measured (원인 찾기). */
  dims?: PalletDim[];
  /** ②: the cup's acceleration while it carries a box: where, which way (unit), how much, and whether it is over the cup's limit. */
  acc?: { at: Mm; dir: Mm; mag: number; over: boolean } | null;
}

interface Props {
  player: PalletPlayback;
  overlay: PalletOverlay;
  /** The problem (what the warehouse around the cell shows). */
  prob?: LogiProblem;
  /** Where the pallet really stands. */
  pallet?: PalletPose;
}

export default function PalletCell({ player, overlay, prob = 1, pallet = PAL_HOME }: Props) {
  const beltTex = useMemo(() => {
    const t = belt([1, 1]).clone();
    t.repeat.set(1, (FEED_BELT.yIn - FEED_BELT.yOut) / 40);
    t.needsUpdate = true;
    return t;
  }, []);
  useEffect(() => () => beltTex.dispose(), [beltTex]);
  const boxRefs = useRef<(Group | null)[]>([]);
  const crushRefs = useRef<(Group | null)[]>([]);
  const creaseRefs = useRef<(Group | null)[]>([]);
  const lampRef = useRef<Mesh>(null);
  const greenRef = useRef<Mesh>(null);

  useFrame((_, dt) => {
    const f = player.advance(dt);
    const list = f?.boxes ?? player.still ?? [];
    boxRefs.current.forEach((g, i) => {
      if (!g) return;
      const b = list[i];
      g.visible = !!b && b.mode !== 'wait';
      if (!b) return;
      g.position.set(m(b.at[0]), m(b.at[1]), m(b.at[2]));
      g.quaternion.set(b.q[0], b.q[1], b.q[2], b.q[3]);
      // A crushed carton: pressed down from the top, standing on its own bottom, its sides bulging
      // and folded.
      const c = Math.min(PBOX.h * 0.5, f?.crush[i] ?? 0);
      const inner = crushRefs.current[i];
      if (inner) {
        inner.scale.set(1 + c / 160, 1 + c / 160, (PBOX.h - c) / PBOX.h);
        inner.position.z = m(-c / 2);
      }
      const crease = creaseRefs.current[i];
      if (crease) crease.visible = c > 1;
    });
    scroll(beltTex, (f?.travel ?? 0) / 40);
    const alarm = !!f?.alarm;
    if (lampRef.current) (lampRef.current.material as MeshStandardMaterial).emissiveIntensity = alarm ? 2.2 : 0.05;
    if (greenRef.current) (greenRef.current.material as MeshStandardMaterial).emissiveIntensity = alarm ? 0.05 : 1.6;
  });

  const heavy = prob === 2;
  return (
    <group>
      <CellDressing prob={prob} />
      <BeltConveyor tex={beltTex} belt={FEED_BELT} />
      <EndStop />
      <MiniPallet pose={pallet} />
      <CheckPost at={checkPost(pallet)} lampRef={lampRef} greenRef={greenRef} />
      {Array.from({ length: N_BOXES }, (_, i) => (
        <group
          key={i}
          ref={(el) => {
            boxRefs.current[i] = el;
          }}
          visible={false}
        >
          <group
            ref={(el) => {
              crushRefs.current[i] = el;
            }}
          >
            <CardBox size={BOX_SIZE} color={heavy ? HEAVY_CARTON : CARTON} />
            {heavy && <WeightSticker />}
            <group
              ref={(el) => {
                creaseRefs.current[i] = el;
              }}
              visible={false}
            >
              <Creases />
            </group>
          </group>
        </group>
      ))}
      <Overlays overlay={overlay} />
    </group>
  );
}

/* --- models ------------------------------------------------------------------- */

const Steel = () => <meshStandardMaterial color="#aeb6bf" metalness={0.8} roughness={0.3} />;

/** The end stop across the belt: a steel plate on two brackets with a black rubber bumper facing the boxes. */
function EndStop() {
  const y = FEED.yStop - 8;
  const w = FEED.width + 20;
  return (
    <group>
      <RBox at={[FEED.x, y, FEED.top + 11]} size={[w, 6, 22]} radius={1.2}>
        <Steel />
      </RBox>
      <RBox at={[FEED.x, FEED.yStop - 3, FEED.top + 11]} size={[w - 24, 4, 14]} radius={1.5}>
        <meshStandardMaterial color="#1d2025" roughness={0.9} />
      </RBox>
      {[-1, 1].map((s) => (
        <RBox key={s} at={[FEED.x + s * (w / 2 - 4), y - 6, FEED.top - 2]} size={[8, 14, 26]} radius={1}>
          <Steel />
        </RBox>
      ))}
    </group>
  );
}

/** A small wooden pallet: three bottom boards, nine blocks, five deck boards; deck top at PAL.top. */
function MiniPallet({ pose, plain }: { pose: PalletPose; plain?: boolean }) {
  const W = <meshStandardMaterial color="#c8925a" map={wood([1, 1])} roughness={0.85} />;
  const { sx, sy, top } = PAL;
  const { x, y } = pose;
  const boardH = 3;
  const blockH = top - 2 * boardH;
  return (
    <group position={[m(x), m(y), 0]}>
      {[-1, 0, 1].map((k) => (
        <RBox key={`b${k}`} at={[0, (k * (sy - 18)) / 2, boardH / 2]} size={[sx, 18, boardH]} radius={0.8}>
          {W}
        </RBox>
      ))}
      {[-1, 0, 1].flatMap((i) =>
        [-1, 0, 1].map((k) => (
          <RBox key={`k${i}${k}`} at={[(i * (sx - 18)) / 2, (k * (sy - 18)) / 2, boardH + blockH / 2]} size={[18, 18, blockH]} radius={1}>
            <meshStandardMaterial color="#b98451" map={wood([1, 1])} roughness={0.9} />
          </RBox>
        )),
      )}
      {[-2, -1, 0, 1, 2].map((k) => (
        <RBox key={`d${k}`} at={[(k * (sx - 16)) / 4, 0, top - boardH / 2]} size={[16, sy, boardH]} radius={0.8}>
          <meshStandardMaterial color="#d29d66" map={wood([1, 1])} roughness={0.82} />
        </RBox>
      ))}
      {/* The reference mark: a red corner sticker with a cross, at the deck's far corner. */}
      <group visible={!plain} position={[m(MARK_OFF[0]), m(MARK_OFF[1]), m(top + 0.4)]}>
        <mesh>
          <circleGeometry args={[m(7), 32]} />
          <meshStandardMaterial color="#e5484d" roughness={0.6} />
        </mesh>
        {[0, Math.PI / 2].map((r) => (
          <mesh key={r} position={[0, 0, m(0.2)]} rotation={[0, 0, r]}>
            <planeGeometry args={[m(12), m(1.4)]} />
            <meshBasicMaterial color="#ffffff" />
          </mesh>
        ))}
      </group>
    </group>
  );
}

/** The pallet check: an aluminium post, a light curtain head looking at the stack, a green / red stack light on top. */
function CheckPost({ at, lampRef, greenRef }: { at: Mm; lampRef: RefObject<Mesh | null>; greenRef: RefObject<Mesh | null> }) {
  const [x, y] = at;
  const h = PAL.top + 3 * PBOX.h + 40;
  return (
    <group>
      <RBox at={[x, y, 4]} size={[34, 34, 8]} radius={2}>
        <meshStandardMaterial color="#3a414b" roughness={0.6} />
      </RBox>
      <RBox at={[x, y, h / 2]} size={[14, 14, h]} radius={1.5}>
        <meshStandardMaterial color="#c9cfd6" metalness={0.75} roughness={0.38} />
      </RBox>
      <RBox at={[x + 10, y + 8, h - 34]} size={[12, 16, 60]} radius={2}>
        <meshStandardMaterial color="#2b3038" roughness={0.35} />
      </RBox>
      {/* Stack light: green (running), red (stopped). */}
      <mesh ref={greenRef} position={[m(x), m(y), m(h + 9)]}>
        <cylinderGeometry args={[m(8), m(8), m(14), 24]} />
        <meshStandardMaterial color="#173a26" emissive="#28c76f" emissiveIntensity={1.6} roughness={0.3} toneMapped={false} />
      </mesh>
      <mesh ref={lampRef} position={[m(x), m(y), m(h + 24)]}>
        <cylinderGeometry args={[m(8), m(8), m(14), 24]} />
        <meshStandardMaterial color="#3a1616" emissive="#ff3b30" emissiveIntensity={0.05} roughness={0.3} toneMapped={false} />
      </mesh>
      <mesh position={[m(x), m(y), m(h + 33)]}>
        <cylinderGeometry args={[m(8.5), m(8.5), m(3), 24]} />
        <meshStandardMaterial color="#2b3038" roughness={0.4} />
      </mesh>
    </group>
  );
}

/* --- the warehouse around the cell --------------------------------------------- */

/** A canvas texture with lines of text (signs, labels, stickers), px per mm `k`. */
function useTextTexture(lines: readonly string[], w: number, h: number, fg: string, bg: string, k = 8): CanvasTexture {
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
function Sign({ at, w, h, yaw = 0, lines, fg = '#1d2025', bg = '#ffffff' }: { at: Mm; w: number; h: number; yaw?: number; lines: readonly string[]; fg?: string; bg?: string }) {
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
function FlatLabel({ at, w, h, rot = 0, lines, fg, bg }: { at: Mm; w: number; h: number; rot?: number; lines: readonly string[]; fg: string; bg: string }) {
  const tex = useTextTexture(lines, w, h, fg, bg);
  return (
    <mesh position={v3(at)} rotation={[0, 0, rot]}>
      <planeGeometry args={[m(w), m(h)]} />
      <meshStandardMaterial map={tex} roughness={0.5} />
    </mesh>
  );
}

/** ②: the weight sticker on a heavy carton's top. */
function WeightSticker() {
  return <FlatLabel at={[-8, 8, PBOX.h / 2 + 0.5]} w={20} h={13} rot={Math.PI / 2} lines={[`${HEAVY_G} g`, '무거움']} fg="#ffffff" bg="#d92d20" />;
}

/** A crushed carton's folds: dark creases round its sides. */
function Creases() {
  return (
    <>
      {[-6, 4].map((z) => (
        <RBox key={z} at={[0, 0, z]} size={[PBOX.sx + 1.2, PBOX.sy + 1.2, 1.6]} radius={0.6} shadow={false}>
          <meshStandardMaterial color="#5b3f22" roughness={0.95} />
        </RBox>
      ))}
    </>
  );
}

/** Yellow and black hazard tape (a repeating stripe texture). */
function useHazard(): CanvasTexture {
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
function Tape({ a, b, w = 8, color, hazard }: { a: [number, number]; b: [number, number]; w?: number; color?: string; hazard?: CanvasTexture }) {
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

/** A plain stock carton (on the shelf, in a pile), standing on z. */
function Stock({ at, h = PBOX.h, color = CARTON }: { at: Mm; h?: number; color?: string }) {
  return (
    <group position={v3([at[0], at[1], at[2] + h / 2])}>
      <CardBox size={[PBOX.sx, PBOX.sy, h]} color={color} />
    </group>
  );
}

/** A small steel shelving unit (front facing −y), its centre x, y and size, with what stands on it. */
function Shelf({ x, y, w = 250, d = 70, levels = [8, 98, 188] as const, children }: { x: number; y: number; w?: number; d?: number; levels?: readonly number[]; children?: ReactNode }) {
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

/** A finished pallet: twelve cartons wrapped in stretch film, waiting for the truck. */
function WrappedPallet({ at, color = CARTON }: { at: [number, number]; color?: string }) {
  const [x, y] = at;
  return (
    <group>
      <MiniPallet pose={{ x, y }} plain />
      {[0, 1, 2].flatMap((l) =>
        [0, 1, 2, 3].map((k) => <Stock key={`${l}${k}`} at={[x + (k % 2 ? -24 : 24), y + (k < 2 ? -24 : 24), PAL.top + l * PBOX.h]} color={color} />),
      )}
      <mesh position={v3([x, y, PAL.top + (3 * PBOX.h) / 2 + 1])}>
        <boxGeometry args={[m(2 * 24 + PBOX.sx + 3), m(2 * 24 + PBOX.sy + 3), m(3 * PBOX.h + 4)]} />
        <meshPhysicalMaterial color="#eef4fb" transparent opacity={0.28} roughness={0.15} metalness={0} clearcoat={1} depthWrite={false} />
      </mesh>
    </group>
  );
}

/** A puddle on the floor (③: the floor was washed last night). */
function Puddle({ at, rx, ry, rot = 0 }: { at: [number, number]; rx: number; ry: number; rot?: number }) {
  return (
    <mesh position={[m(at[0]), m(at[1]), m(0.8)]} rotation={[0, 0, rot]} scale={[rx / 10, ry / 10, 1]}>
      <circleGeometry args={[m(10), 40]} />
      <meshPhysicalMaterial color="#7d97ad" transparent opacity={0.5} roughness={0.04} metalness={0.2} clearcoat={1} depthWrite={false} />
    </mesh>
  );
}

/** ③: the yellow A-frame wet floor sign. */
function WetSign({ at, yaw }: { at: [number, number]; yaw: number }) {
  const tex = useTextTexture(['청소 중', '미끄럼 주의'], 46, 60, '#1d2025', '#f7c731');
  const h = 72;
  return (
    <group position={[m(at[0]), m(at[1]), 0]} rotation={[0, 0, yaw]}>
      {[1, -1].map((s) => (
        <group key={s} position={[0, m(s * -8), m(h / 2)]} rotation={[s * 0.22, 0, 0]}>
          <mesh rotation={[Math.PI / 2, s > 0 ? 0 : Math.PI, 0]} castShadow>
            <planeGeometry args={[m(50), m(h)]} />
            <meshStandardMaterial map={s > 0 ? tex : null} color={s > 0 ? '#ffffff' : '#f7c731'} roughness={0.5} side={DoubleSide} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** ②: the parcel scale by the belt, a heavy carton on it and its reading. */
function Scale({ at }: { at: [number, number] }) {
  const [x, y] = at;
  return (
    <group>
      <RBox at={[x, y, 6]} size={[64, 64, 12]} radius={3}>
        <meshStandardMaterial color="#3a414b" roughness={0.5} />
      </RBox>
      <RBox at={[x, y, 13]} size={[58, 58, 3]} radius={1}>
        <Steel />
      </RBox>
      <Stock at={[x, y, 14.5]} color={HEAVY_CARTON} />
      <RBox at={[x + 30, y - 44, 22]} size={[40, 8, 30]} radius={2}>
        <meshStandardMaterial color="#2b3038" roughness={0.35} />
      </RBox>
      <Sign at={[x + 30, y - 48.6, 24]} w={34} h={20} lines={[`${HEAVY_G} g`]} fg="#6fe3a5" bg="#0f1a14" />
    </group>
  );
}

/** ②: a notice board on two legs by the line (the dispatch deadline). */
function Board({ at, yaw, lines }: { at: [number, number]; yaw: number; lines: readonly string[] }) {
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

/**
 * The warehouse around the cell (all on the desk, the cell's scale): the walkway lines, a shelf of
 * stock behind the arm, a finished pallet wrapped for dispatch, and what each problem's story
 * names (see the file comment).
 */
function CellDressing({ prob }: { prob: LogiProblem }) {
  const hazard = useHazard();
  const [hx, hy] = [PAL.sx / 2 + 8, PAL.sy / 2 + 8];
  const home: [number, number][] = [
    [PAL_HOME.x - hx, PAL_HOME.y - hy],
    [PAL_HOME.x + hx, PAL_HOME.y - hy],
    [PAL_HOME.x + hx, PAL_HOME.y + hy],
    [PAL_HOME.x - hx, PAL_HOME.y + hy],
  ];
  return (
    <group>
      {/* Walkway: a yellow line in front of the line and one on the far side of the pallet. */}
      <Tape a={[320, -420]} b={[320, 340]} w={10} color="#f2c230" />
      <Tape a={[-300, -330]} b={[320, -330]} w={10} color="#f2c230" />
      {/* The pallet's place, taped on the floor when the cell was set up (③: the pallet is no longer on it). */}
      {home.map((a, i) => (
        <Tape key={i} a={a} b={home[(i + 1) % 4]} w={7} hazard={hazard} />
      ))}
      <Shelf x={-30} y={265}>
        {prob === 1 ? (
          <>
            {[-90, -40].map((dx) => (
              <Stock key={`o${dx}`} at={[-30 + dx, 265, 8]} h={30} color="#b88a55" />
            ))}
            <Sign at={[-95, 265 - 36.5, -1 + 22]} w={70} h={14} lines={['예전 상자 30 mm']} />
            {[30, 80].map((dx) => (
              <Stock key={`n${dx}`} at={[-30 + dx, 265, 8]} />
            ))}
            <Sign at={[25, 265 - 36.5, 21]} w={70} h={14} lines={['NEW 새 상자 40 mm']} fg="#ffffff" bg="#2f5be7" />
          </>
        ) : (
          [-90, -40, 30, 80].map((dx) => <Stock key={dx} at={[-30 + dx, 265, 8]} color={prob === 2 ? HEAVY_CARTON : CARTON} />)
        )}
        {[-80, -30, 20].map((dx) => (
          <Stock key={`u${dx}`} at={[-30 + dx, 265, 98]} />
        ))}
        {[-60, 0].map((dx) => (
          <Stock key={`t${dx}`} at={[-30 + dx, 265, 188]} />
        ))}
      </Shelf>
      <WrappedPallet at={[-170, -235]} color={prob === 2 ? HEAVY_CARTON : CARTON} />
      {prob === 1 && (
        // The new cartons, piled up by the line.
        <>
          {[
            [110, 210, 0],
            [158, 210, 0],
            [110, 258, 0],
            [134, 234, PBOX.h],
          ].map(([x, y, z]) => (
            <Stock key={`${x}${y}${z}`} at={[x, y, z]} />
          ))}
          <Sign at={[134, 186, 62]} yaw={0.6} w={56} h={14} lines={['새 상자 · 높이 40']} fg="#ffffff" bg="#2f5be7" />
        </>
      )}
      {prob === 2 && (
        <>
          <Scale at={[300, 150]} />
          <Board at={[300, 260]} yaw={0.75} lines={['출고 마감 16:30', '음료 세트 300건 · 트럭 대기']} />
        </>
      )}
      {prob === 3 && (
        <>
          <Puddle at={[205, -250]} rx={42} ry={24} rot={0.3} />
          <Puddle at={[20, -262]} rx={30} ry={17} rot={-0.4} />
          <Puddle at={[-60, -150]} rx={24} ry={14} rot={0.8} />
          <WetSign at={[-150, -110]} yaw={0.9} />
        </>
      )}
    </group>
  );
}

/* --- overlays ------------------------------------------------------------------- */

const tag = (color: string, bg = 'rgba(255,255,255,.92)') => ({
  font: '800 12px var(--font-ui, system-ui)',
  color,
  background: bg,
  padding: '2px 7px',
  borderRadius: 7,
  whiteSpace: 'nowrap' as const,
  boxShadow: '0 1px 4px rgba(0,0,0,.25)',
});

const GHOST_COLOR = { press: LEARN_COLORS.bad, drop: '#e0a020', ok: LEARN_COLORS.ok } as const;

function Overlays({ overlay }: { overlay: PalletOverlay }) {
  const { ghosts, press, path, progPallet, refCursor, dims, acc } = overlay;
  const outline = useMemo(() => {
    if (!progPallet) return null;
    const [hx, hy] = [PAL.sx / 2, PAL.sy / 2];
    const z = PAL.top + 1;
    return [
      [-hx, -hy],
      [hx, -hy],
      [hx, hy],
      [-hx, hy],
      [-hx, -hy],
    ].map(([a, b]) => v3([progPallet.x + a, progPallet.y + b, z]));
  }, [progPallet]);
  return (
    <group>
      {outline && progPallet && (
        <>
          <Line points={outline} color="#3454d1" lineWidth={2.5} dashed dashSize={0.008} gapSize={0.005} depthTest={false} renderOrder={9} />
          <Html zIndexRange={[12, 0]} center position={v3([progPallet.x + MARK_OFF[0], progPallet.y + MARK_OFF[1], PAL.top + 30]).toArray()} style={{ pointerEvents: 'none' }}>
            <span style={tag('#fff', '#3454d1')}>프로그램이 기억하는 팔레트</span>
          </Html>
        </>
      )}
      {refCursor && (
        <group position={v3(refCursor)}>
          <mesh renderOrder={9}>
            <ringGeometry args={[m(4), m(6), 32]} />
            <meshBasicMaterial color="#ffd28a" depthTest={false} toneMapped={false} />
          </mesh>
          <Line points={[v3([-12, 0, 0]), v3([12, 0, 0])]} color="#ffd28a" lineWidth={2} depthTest={false} renderOrder={9} />
          <Line points={[v3([0, -12, 0]), v3([0, 12, 0])]} color="#ffd28a" lineWidth={2} depthTest={false} renderOrder={9} />
        </group>
      )}
      {path && path.length > 1 && <Line points={path.map(v3)} color={LEARN_COLORS.path} lineWidth={2} transparent depthTest={false} renderOrder={7} />}
      {ghosts?.map((g) => (
        <group key={g.key} position={v3(g.at)}>
          <mesh renderOrder={6}>
            <boxGeometry args={[m(PBOX.sx), m(PBOX.sy), m(PBOX.h)]} />
            <meshBasicMaterial color={GHOST_COLOR[g.state]} transparent opacity={0.28} depthWrite={false} toneMapped={false} />
          </mesh>
          <BoxEdges color={GHOST_COLOR[g.state]} />
          {g.text && (
            <Html zIndexRange={[12, 0]} center position={[0, 0, m(PBOX.h / 2 + 22)]} style={{ pointerEvents: 'none' }}>
              <span style={tag('#fff', GHOST_COLOR[g.state])}>{g.text}</span>
            </Html>
          )}
        </group>
      ))}
      {dims?.map((d) => <Dim key={d.key} d={d} />)}
      {acc && <AccArrow acc={acc} />}
      {press && (
        <group position={v3(press.at)}>
          <Line points={[v3([0, 0, 0]), v3([0, 0, -press.mm])]} color={LEARN_COLORS.bad} lineWidth={4} depthTest={false} renderOrder={9} />
          <Line points={[v3([-28, 0, 0]), v3([28, 0, 0])]} color="#ffffff" lineWidth={2} dashed dashSize={0.004} gapSize={0.003} depthTest={false} renderOrder={9} />
          <Line points={[v3([-28, 0, -press.mm]), v3([28, 0, -press.mm])]} color={LEARN_COLORS.bad} lineWidth={2} depthTest={false} renderOrder={9} />
          <Html zIndexRange={[12, 0]} center position={[0, 0, m(64)]} style={{ pointerEvents: 'none' }}>
            <span style={tag('#fff', '#e5484d')}>아래 상자를 {press.mm.toFixed(0)} mm 눌렀어요</span>
          </Html>
        </group>
      )}
    </group>
  );
}

/** The twelve edges of a box the carton's size, centred. */
function BoxEdges({ color }: { color: string }) {
  const pts = useMemo(() => {
    const [x, y, z] = [PBOX.sx / 2, PBOX.sy / 2, PBOX.h / 2];
    const c = (a: number, b: number, d: number) => v3([a, b, d]);
    const corners = [c(-x, -y, -z), c(x, -y, -z), c(x, y, -z), c(-x, y, -z), c(-x, -y, z), c(x, -y, z), c(x, y, z), c(-x, y, z)];
    const e: [number, number][] = [
      [0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7],
    ];
    return e.flatMap(([a, b]) => [corners[a], corners[b]]);
  }, []);
  return <Line points={pts} segments color={color} lineWidth={1.6} transparent depthTest={false} renderOrder={8} />;
}

/** A measured length: the line, a tick at each end, the value in the middle. */
function Dim({ d }: { d: PalletDim }) {
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
      <Html zIndexRange={[12, 0]} center position={(d.label ? v3(b) : v3([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2])).toArray()} style={{ pointerEvents: 'none' }}>
        <span style={{ ...tag('#fff', d.color), display: 'inline-block', transform: d.label === 'l' ? 'translate(-58%, -70%)' : d.label === 'r' ? 'translate(58%, -70%)' : undefined }}>{d.text}</span>
      </Html>
    </group>
  );
}

/** ②: the cup's acceleration as an arrow from the carried box (length ∝ m/s²), red over the cup's limit. */
function AccArrow({ acc }: { acc: NonNullable<PalletOverlay['acc']> }) {
  const color = acc.over ? LEARN_COLORS.bad : LEARN_COLORS.ok;
  const len = Math.min(140, acc.mag * 14);
  const from: Mm = [acc.at[0], acc.at[1], acc.at[2] - PBOX.h / 2];
  const to: Mm = [from[0] + acc.dir[0] * len, from[1] + acc.dir[1] * len, from[2] + acc.dir[2] * len];
  const q = useMemo(() => new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), new Vector3(...acc.dir).normalize()), [acc.dir]);
  return (
    <group>
      <Line points={[v3(from), v3(to)]} color={color} lineWidth={5} depthTest={false} renderOrder={11} />
      <mesh position={v3(to)} quaternion={q} renderOrder={11}>
        <coneGeometry args={[m(6), m(14), 16]} />
        <meshBasicMaterial color={color} depthTest={false} toneMapped={false} />
      </mesh>
      <Html zIndexRange={[12, 0]} center position={v3([to[0], to[1], to[2] + 16]).toArray()} style={{ pointerEvents: 'none' }}>
        <span style={tag('#fff', color)}>가속도 {acc.mag.toFixed(1)} m/s²</span>
      </Html>
    </group>
  );
}
