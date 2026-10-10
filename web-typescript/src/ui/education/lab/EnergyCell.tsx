'use client';

/**
 * 에너지 · 자원순환 셀 in 3D (inside LearnStage's robot-frame group: metres, z up): the official AI Kit
 * 2023 as the simulator draws it (plate, four bins, camera stand and camera — Stage's Kit — and the
 * calibration board with its two ArUco markers) set up as a sorting cell: a sign on each bin for the
 * kind it takes, the flattened pieces of the problem (crushed cans, clear and coloured PET, paper
 * packs) where they lie or fly — on a steel shop bench at real size, with the day's intake crate,
 * the cell's screen and per problem the note the story names.
 *
 * Every frame it plays the run (engine/education/lab/energy.ts frames) through EnergyPlayback.
 */

import { Html, Line } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import { Color, type Group } from 'three';

import type { Mm } from '@/engine/education/lab/cell';
import { KIND_NAME, KIND_OF_BIN, dims, type EnergyFrame, type EnergyProblem, type EnergyRun, type Item } from '@/engine/education/lab/energy';
import { BINS, BIN_NAMES, DESK_Z } from '@/engine/simulator/board';

import { RBox } from '../../simulator/stage/sceneKit';
import { CalibrationBoard, Kit } from '../../simulator/stage/Stage';
import { LEARN_COLORS } from '../stage/learn3d';
import type { LiveArm } from '../stage/LearnStage';
import Bench from './ambient/Bench';
import Model from './ambient/Model';
import { Monitor } from './ambient/Props';
import { ENERGY_BENCH_MM } from './ambient/around/energy';
import { Dim, Sign, m, tag, v3, type CellDim } from './CellKit';

const FRAME_DT = 0.02;

/** Playback of a sorting run: the time, whether it plays, and the arm (with the pump) LearnStage reads. */
export class EnergyPlayback {
  run: EnergyRun | null = null;
  t = 0;
  playing = false;
  rate = 1;
  still: EnergyFrame['things'] | null = null;
  readonly arm: { current: LiveArm | null } = { current: null };
  private onTick: ((t: number, done: boolean) => void) | null = null;
  private lastTick = 0;

  listen(fn: ((t: number, done: boolean) => void) | null): void {
    this.onTick = fn;
  }
  start(run: EnergyRun | null, at: number | 'end' = 0, rate = 1): void {
    this.run = run;
    this.rate = rate;
    this.t = run ? (at === 'end' ? run.durationS : Math.min(at, run.durationS)) : 0;
    this.playing = !!run && this.t < run.durationS;
    this.lastTick = this.t;
  }
  setStill(s: EnergyFrame['things'] | null): void {
    this.still = s;
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
  frame(): EnergyFrame | null {
    const r = this.run;
    return r ? r.frames[Math.min(r.frames.length - 1, Math.max(0, Math.round(this.t / FRAME_DT)))] : null;
  }
  advance(dt: number): EnergyFrame | null {
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

export interface EnergyMarker {
  key: string;
  mm: Mm;
  ok: boolean;
  text?: string;
}

export interface EnergyOverlay {
  path?: Mm[] | null;
  dims?: CellDim[];
  markers?: EnergyMarker[];
  /** Where something went vs where it should have (a miss, a piece's flight), drawn as a red line. */
  misses?: { from: Mm; to: Mm }[];
}

interface Props {
  player: EnergyPlayback;
  prob: EnergyProblem;
  things: readonly Item[];
  overlay: EnergyOverlay;
}

/** A piece's colour in 3D, from the HSV of its top (a can: its aluminium). */
export const pieceColor = (t: Item) => (t.kind === 'clear' ? '#dcefff' : new Color().setHSL(((t.hue * 2) % 360) / 360, Math.min(0.85, t.sat), t.val * 0.55).getStyle());
/** The kinds' colours on the screens (bins, labels, the camera window's boxes). */
export const KIND_HEX = { can: '#8d99a6', clear: '#38bdf8', color: '#2e9e5b', pack: '#f08a24' } as const;

export default function EnergyCell({ player, prob, things, overlay }: Props) {
  const refs = useRef<(Group | null)[]>([]);

  useFrame((_, dt) => {
    const f = player.advance(dt);
    const list = f?.things ?? player.still ?? [];
    refs.current.forEach((g, i) => {
      if (!g) return;
      const s = list[i];
      g.visible = !!s && s.c[2] > -100;
      if (s) g.position.set(m(s.c[0]), m(s.c[1]), m(s.c[2]));
    });
  });

  return (
    <group>
      <Kit />
      <CalibrationBoard />
      <BinSigns />
      <Station prob={prob} />
      {things.map((t, i) => (
        <group
          key={`${prob}-${i}`}
          ref={(el) => {
            refs.current[i] = el;
          }}
          visible={false}
        >
          <Piece t={t} />
        </group>
      ))}
      <Overlays overlay={overlay} />
    </group>
  );
}

/** One flattened piece, its foot at the group's origin. */
function Piece({ t }: { t: Item }) {
  const d = dims(t);
  if (t.kind === 'can') {
    // A crushed can: an aluminium disc with the brand's red showing round its rim.
    return (
      <group>
        <mesh position={[0, 0, m(d.h / 2)]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[m(d.sx / 2), m(d.sx / 2 - 1.5), m(d.h), 28]} />
          <meshStandardMaterial color="#b9312a" roughness={0.45} metalness={0.4} />
        </mesh>
        <mesh position={[0, 0, m(d.h + 0.2)]}>
          <circleGeometry args={[m(d.sx / 2 - 1), 28]} />
          <meshStandardMaterial color="#c3cad2" roughness={0.3} metalness={0.85} />
        </mesh>
      </group>
    );
  }
  if (t.kind === 'clear')
    return (
      <RBox at={[0, 0, d.h / 2]} size={[d.sx, d.sy, d.h]} radius={1.5} shadow={false}>
        <meshPhysicalMaterial color="#e6f6ff" transparent opacity={0.38} roughness={0.08} clearcoat={1} />
      </RBox>
    );
  if (t.kind === 'color')
    return (
      <RBox at={[0, 0, d.h / 2]} size={[d.sx, d.sy, d.h]} radius={1.5}>
        <meshPhysicalMaterial color={pieceColor(t)} transparent opacity={0.8} roughness={0.15} clearcoat={0.8} />
      </RBox>
    );
  // A flattened paper pack: its print, and a white band across it.
  return (
    <group>
      <RBox at={[0, 0, d.h / 2]} size={[d.sx, d.sy, d.h]} radius={1}>
        <meshStandardMaterial color={pieceColor(t)} roughness={0.8} />
      </RBox>
      <mesh position={[0, 0, m(d.h + 0.2)]}>
        <planeGeometry args={d.sx > d.sy ? [m(10), m(d.sy - 4)] : [m(d.sx - 4), m(10)]} />
        <meshStandardMaterial color="#fff7ec" roughness={0.8} />
      </mesh>
    </group>
  );
}

/** A sign over each bin naming the kind it takes, facing the front right (where the views look from). */
function BinSigns() {
  return (
    <group>
      {BIN_NAMES.map((b) => {
        const B = BINS[b];
        const kind = KIND_OF_BIN[b];
        const y = B.outer.y + (B.outer.y > 0 ? 1 : -1) * (B.outer.sy / 2 + 1);
        return <Sign key={b} at={[B.outer.x, y, B.rimZ + 16]} w={74} h={20} lines={[`${b} · ${KIND_NAME[kind]}`]} fg="#ffffff" bg={KIND_HEX[kind]} />;
      })}
    </group>
  );
}

/**
 * The steel bench under the cell at real size (its top under the kit's plate, ENERGY_BENCH_MM above the
 * hall's floor) and what stands on it: the day's intake crate of mixed pieces, the cell's screen with
 * a keyboard, and per problem the note the story names.
 */
function Station({ prob }: { prob: EnergyProblem }) {
  const note = (lines: readonly string[], fg: string, bg: string) => (
    <group>
      <RBox at={[400, -230, DESK_Z + 3]} size={[70, 24, 6]} radius={2} rot={0.7}>
        <meshStandardMaterial color="#c9ced4" roughness={0.3} />
      </RBox>
      <Sign at={[400, -230, DESK_Z + 6 + 15]} yaw={0.7} w={92} h={30} lines={lines} fg={fg} bg={bg} />
    </group>
  );
  return (
    <group>
      <group position={[0, 0, m(DESK_Z)]}>
        <Bench x0={-340} x1={480} y0={-720} y1={720} h={ENERGY_BENCH_MM} kind="steel" />
        {/* The intake crate behind-right: today's mixed pieces waiting their turn. */}
        <Model group="energy" name="crate" at={[-130, 500]} scale={0.65} />
        {(
          [
            ['can', -90, -45, 0.3],
            ['#dcefff', -20, 20, 1.3],
            ['#3c8f5c', 50, -35, 1.9],
            ['#f08a24', 90, 40, 1.2],
            ['can', 10, -60, 2],
            ['#dcefff', -90, 50, 1.8],
            ['can', 110, -60, 0.7],
          ] as const
        ).map(([c, dx, dy, rot], i) =>
          c === 'can' ? (
            <Model key={i} group="energy" name="can" at={[-130 + dx, 500 + dy]} z={110 + (i % 3) * 8} yaw={rot} />
          ) : (
            <RBox key={i} at={[-130 + dx, 500 + dy, 120 + (i % 3) * 8]} size={[60, 160, 22]} radius={8} rot={rot}>
              <meshStandardMaterial color={c} roughness={0.4} transparent={c === '#dcefff'} opacity={c === '#dcefff' ? 0.6 : 1} />
            </RBox>
          ),
        )}
        <Sign at={[-130, 500 - 133, 80]} w={240} h={56} lines={['오늘 들어온 것', '캔 · PET · 종이팩']} fg="#ffffff" bg="#2f8f6a" />
        {/* The cell's screen on the bench behind-left: what it has sorted, its throughput. */}
        <Monitor at={[-250, -560]} yaw={0.45} w={470} kind="plot" accent="#0b8a7a" title="재활용 선별 셀 · 제 칸 ÷ 시간 = 처리량" />
        <group position={[m(-40), m(-480), 0]} rotation={[0, 0, 0.45]}>
          <RBox at={[0, 0, 12]} size={[150, 440, 24]} radius={6}>
            <meshStandardMaterial color="#3a3f47" roughness={0.6} />
          </RBox>
        </group>
      </group>
      {prob === 1 && note(['투명 PET는 따로!', 'A 분류함 새로 만듦'], '#0b3b5c', '#e6f6ff')}
      {prob === 2 && note(['오늘 목표', '1분에 12개 이상'], '#ffffff', '#0b8a7a')}
      {prob === 3 && note(['겹쳐서 들어왔어요', '위에서부터?'], '#ffffff', '#e5484d')}
    </group>
  );
}

/* --- overlays ----------------------------------------------------------------------------- */

function Overlays({ overlay }: { overlay: EnergyOverlay }) {
  const { path, dims: ds, markers, misses } = overlay;
  return (
    <group>
      {path && path.length > 1 && <Line points={path.map(v3)} color={LEARN_COLORS.path} lineWidth={2} transparent depthTest={false} renderOrder={7} />}
      {misses?.map((x, i) => <Line key={i} points={[v3(x.from), v3(x.to)]} color={LEARN_COLORS.bad} lineWidth={3} depthTest={false} renderOrder={8} />)}
      {ds?.map((d) => <Dim key={d.key} d={d} />)}
      {markers?.map((k) => (
        <group key={k.key} position={v3(k.mm)}>
          <mesh renderOrder={8}>
            <sphereGeometry args={[m(3.5), 16, 12]} />
            <meshBasicMaterial color={k.ok ? LEARN_COLORS.ok : LEARN_COLORS.bad} transparent opacity={0.9} depthTest={false} toneMapped={false} />
          </mesh>
          {k.text && (
            <Html zIndexRange={[12, 4]} center position={[0, 0, m(20)]} style={{ pointerEvents: 'none' }}>
              <span style={tag(k.ok ? '#1f7a45' : '#fff', k.ok ? 'rgba(255,255,255,.92)' : '#e5484d')}>{k.text}</span>
            </Html>
          )}
        </group>
      ))}
    </group>
  );
}
