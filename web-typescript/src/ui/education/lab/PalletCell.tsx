'use client';

/**
 * 물류 센터 · 팔레타이징 셀 in 3D (inside LearnStage's robot-frame group: metres, z up), in the
 * simulator's own style like the conveyor cell: the in-feed belt conveyor with its end stop, a
 * small wooden pallet, cardboard cartons (a crushed one is drawn pressed down), and the pallet
 * check — a post with a light curtain head and a stack light that turns red when it trips.
 *
 * Every frame it plays the run (engine/education/lab/pallet.ts frames) through PalletPlayback:
 * the arm follows it (LearnStage reads `player.arm`), the boxes move and turn as the physics had
 * them. Overlays: where the next box will be let go (값 고치기), the pressed depth (원인 찾기).
 */

import { Html, Line } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, type RefObject } from 'react';
import { Vector3, type Group, type Mesh, type MeshStandardMaterial } from 'three';

import { FEED, N_BOXES, PAL, PBOX, type PFrame, type PalletRun } from '@/engine/education/lab/pallet';
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
/** The conveyor as drawn: its frame ends just behind the end stop. */
const FEED_BELT = { x: FEED.x, width: FEED.width, top: FEED.top, yIn: FEED.yIn, yOut: FEED.yStop + 16 } as const;
/** The pallet check post, at the pallet's back corner (away from the arm, out of the way of the view). */
const CHECK_POST: Mm = [PAL.x - PAL.sx / 2 - 22, PAL.y - PAL.sy / 2 - 16, 0];

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

export interface PalletOverlay {
  /** Where a box will be let go (값 고치기): its centre, and how it sits on what is under it. */
  ghosts?: { key: string; at: Mm; state: 'press' | 'drop' | 'ok'; text?: string }[];
  /** The pressed depth (원인 찾기): the lower box's top, and how deep. */
  press?: { at: Mm; mm: number } | null;
  /** Tool tip path so far. */
  path?: Mm[] | null;
  /** Show the slot numbers on the pallet. */
  slots?: boolean;
}

interface Props {
  player: PalletPlayback;
  overlay: PalletOverlay;
}

export default function PalletCell({ player, overlay }: Props) {
  const beltTex = useMemo(() => {
    const t = belt([1, 1]).clone();
    t.repeat.set(1, (FEED_BELT.yIn - FEED_BELT.yOut) / 40);
    t.needsUpdate = true;
    return t;
  }, []);
  useEffect(() => () => beltTex.dispose(), [beltTex]);
  const boxRefs = useRef<(Group | null)[]>([]);
  const crushRefs = useRef<(Group | null)[]>([]);
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
      // A crushed carton: pressed down from the top, standing on its own bottom.
      const c = Math.min(PBOX.h * 0.5, f?.crush[i] ?? 0);
      const inner = crushRefs.current[i];
      if (inner) {
        inner.scale.set(1 + c / 400, 1 + c / 400, (PBOX.h - c) / PBOX.h);
        inner.position.z = m(-c / 2);
      }
    });
    scroll(beltTex, (f?.travel ?? 0) / 40);
    const alarm = !!f?.alarm;
    if (lampRef.current) (lampRef.current.material as MeshStandardMaterial).emissiveIntensity = alarm ? 2.2 : 0.05;
    if (greenRef.current) (greenRef.current.material as MeshStandardMaterial).emissiveIntensity = alarm ? 0.05 : 1.6;
  });

  return (
    <group>
      <BeltConveyor tex={beltTex} belt={FEED_BELT} />
      <EndStop />
      <MiniPallet />
      <CheckPost lampRef={lampRef} greenRef={greenRef} />
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
            <CardBox size={BOX_SIZE} color={CARTON} />
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
function MiniPallet() {
  const W = <meshStandardMaterial color="#c8925a" map={wood([1, 1])} roughness={0.85} />;
  const { x, y, sx, sy, top } = PAL;
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
    </group>
  );
}

/** The pallet check: an aluminium post, a light curtain head looking at the stack, a green / red stack light on top. */
function CheckPost({ lampRef, greenRef }: { lampRef: RefObject<Mesh | null>; greenRef: RefObject<Mesh | null> }) {
  const [x, y] = CHECK_POST;
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
  const { ghosts, press, path } = overlay;
  return (
    <group>
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
      {press && (
        <group position={v3(press.at)}>
          <Line points={[v3([0, 0, 0]), v3([0, 0, -press.mm])]} color={LEARN_COLORS.bad} lineWidth={4} depthTest={false} renderOrder={9} />
          <Line points={[v3([-28, 0, 0]), v3([28, 0, 0])]} color="#ffffff" lineWidth={2} dashed dashSize={0.004} gapSize={0.003} depthTest={false} renderOrder={9} />
          <Line points={[v3([-28, 0, -press.mm]), v3([28, 0, -press.mm])]} color={LEARN_COLORS.bad} lineWidth={2} depthTest={false} renderOrder={9} />
          <Html zIndexRange={[12, 0]} center position={[0, 0, m(34)]} style={{ pointerEvents: 'none' }}>
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
