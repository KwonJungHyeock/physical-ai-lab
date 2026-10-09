'use client';

/**
 * AI 연구소 셀 in 3D (inside LearnStage's robot-frame group: metres, z up): the official AI Kit 2023
 * as the simulator draws it (its plate, four bins, camera stand and camera — Stage's Kit — and the
 * calibration board with its two real ArUco markers), the blocks or parts of the problem in their
 * colours, ② the demonstration spots, and around it a small lab: a monitor with the camera's
 * picture, a shelf of spare parts, the lab's sign, and per problem what the story names.
 *
 * Every frame it plays the run (engine/education/lab/ai.ts frames) through AiPlayback.
 */

import { Html, Line } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import { Color, type Group } from 'three';

import type { Mm } from '@/engine/education/lab/cell';
import { BLOCK_MM } from '@/engine/simulator/board';
import { DEMOS, POST, type AiFrame, type AiProblem, type AiRun, type Thing } from '@/engine/education/lab/ai';

import { RBox } from '../../simulator/stage/sceneKit';
import { CalibrationBoard, Kit } from '../../simulator/stage/Stage';
import { LEARN_COLORS } from '../stage/learn3d';
import type { LiveArm } from '../stage/LearnStage';
import { Dim, Sign, m, tag, v3, type CellDim } from './CellKit';

const FRAME_DT = 0.02;

/** Playback of an AI-lab run: the time, whether it plays, and the arm (with the pump) LearnStage reads. */
export class AiPlayback {
  run: AiRun | null = null;
  t = 0;
  playing = false;
  rate = 1;
  still: AiFrame['things'] | null = null;
  readonly arm: { current: LiveArm | null } = { current: null };
  private onTick: ((t: number, done: boolean) => void) | null = null;
  private lastTick = 0;

  listen(fn: ((t: number, done: boolean) => void) | null): void {
    this.onTick = fn;
  }
  start(run: AiRun | null, at: number | 'end' = 0, rate = 1): void {
    this.run = run;
    this.rate = rate;
    this.t = run ? (at === 'end' ? run.durationS : Math.min(at, run.durationS)) : 0;
    this.playing = !!run && this.t < run.durationS;
    this.lastTick = this.t;
  }
  setStill(s: AiFrame['things'] | null): void {
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
  frame(): AiFrame | null {
    const r = this.run;
    return r ? r.frames[Math.min(r.frames.length - 1, Math.max(0, Math.round(this.t / FRAME_DT)))] : null;
  }
  advance(dt: number): AiFrame | null {
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

export interface AiMarker {
  key: string;
  mm: Mm;
  ok: boolean;
  text?: string;
}

export interface AiOverlay {
  path?: Mm[] | null;
  dims?: CellDim[];
  markers?: AiMarker[];
  /** ②: show the demonstration spots (the first is the job's own). */
  demos?: boolean;
  /** Where the cup is aimed vs where the top really is (the miss), drawn as a red line. */
  misses?: { from: Mm; to: Mm }[];
}

interface Props {
  player: AiPlayback;
  prob: AiProblem;
  things: readonly Thing[];
  overlay: AiOverlay;
}

/** A thing's colour in 3D, from the HSV its top has. */
export const thingColor = (t: Thing) => new Color().setHSL(((t.hue * 2) % 360) / 360, Math.min(0.85, t.sat), t.val * 0.52).getStyle();

export default function AiCell({ player, prob, things, overlay }: Props) {
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
      <LabRoom prob={prob} />
      {things.map((t, i) => (
        <group
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          visible={false}
        >
          {t.shape === 'cube' ? (
            <RBox at={[0, 0, BLOCK_MM / 2]} size={[BLOCK_MM, BLOCK_MM, BLOCK_MM]} radius={1.5}>
              <meshStandardMaterial color={thingColor(t)} roughness={0.55} />
            </RBox>
          ) : (
            <mesh position={[0, 0, m(POST.h / 2)]} rotation={[Math.PI / 2, 0, 0]} castShadow>
              <cylinderGeometry args={[m(POST.d / 2), m(POST.d / 2), m(POST.h), 28]} />
              <meshStandardMaterial color={thingColor(t)} roughness={0.5} />
            </mesh>
          )}
        </group>
      ))}
      {overlay.demos && <Demos />}
      <Overlays overlay={overlay} />
    </group>
  );
}

/** ②: the demonstration spots on the board — grey rings with their numbers; the job's own in orange. */
function Demos() {
  return (
    <group>
      {DEMOS.map(([x, y], i) => (
        <group key={i} position={[m(x), m(y), m(0.6)]}>
          <mesh>
            <ringGeometry args={[m(9), m(12.5), 28]} />
            <meshBasicMaterial color={i === 0 ? '#f08c2e' : '#98a2b3'} transparent opacity={0.9} toneMapped={false} />
          </mesh>
          <Html zIndexRange={[11, 4]} center position={[0, 0, m(4)]} style={{ pointerEvents: 'none' }}>
            <span style={{ ...tag(i === 0 ? '#fff' : '#344054', i === 0 ? '#f08c2e' : 'rgba(255,255,255,.9)'), font: '800 9px var(--font-ui, system-ui)', padding: '0 3px' }}>{i === 0 ? '시연 1' : i + 1}</span>
          </Html>
        </group>
      ))}
    </group>
  );
}

/** The lab around the kit: a monitor showing the camera, a parts shelf, the sign. */
function LabRoom({ prob }: { prob: AiProblem }) {
  return (
    <group>
      {/* A monitor on the desk behind-left: the camera's view and the program's log. */}
      <group>
        <RBox at={[-150, -60, 60]} size={[10, 170, 110]} radius={4}>
          <meshStandardMaterial color="#1f2226" roughness={0.4} />
        </RBox>
        <RBox at={[-144.4, -60, 62]} size={[1, 156, 96]} radius={1} shadow={false}>
          <meshStandardMaterial color="#0f1720" emissive="#2f5be7" emissiveIntensity={0.35} />
        </RBox>
        <RBox at={[-150, -60, 4]} size={[50, 60, 8]} radius={3}>
          <meshStandardMaterial color="#2b3038" roughness={0.5} />
        </RBox>
        <Sign at={[-143.6, -60, 90]} yaw={Math.PI / 2} w={120} h={22} lines={['카메라 → 색 찾기 → 좌표', '→ 역기구학 → 집기 · 놓기']} fg="#e6ebf2" bg="#141a22" />
      </group>
      {/* Spare parts shelf on the right-back. */}
      <group>
        <RBox at={[-40, 420, 40]} size={[220, 60, 80]} radius={4}>
          <meshStandardMaterial color="#f5f7fa" roughness={0.6} />
        </RBox>
        {[-80, -40, 0, 40, 80].map((dx, i) => (
          <RBox key={dx} at={[-40 + dx, 420, 80 + BLOCK_MM / 2]} size={[BLOCK_MM, BLOCK_MM, BLOCK_MM]} radius={1.5}>
            <meshStandardMaterial color={['#d63a26', '#f2c230', '#2e9e5b', '#2c55c9', '#9bd23a'][i]} roughness={0.55} />
          </RBox>
        ))}
        <Sign at={[-40, 420 - 30.6, 40]} w={110} h={20} lines={['AI 연구소 · 피지컬 AI', '보고 · 판단하고 · 움직인다']} fg="#ffffff" bg="#7a3fd1" />
      </group>
      {prob === 1 && <Sign at={[400, -230, 40]} yaw={0.7} w={92} h={30} lines={['새 블록 세트 도착', '초록이 연두색이에요']} fg="#1d2939" bg="#fff6d6" />}
      {prob === 2 && <Sign at={[400, -230, 40]} yaw={0.7} w={92} h={30} lines={['시연 기록 10개', '시연 1 = 지금 프로그램']} fg="#ffffff" bg="#7a3fd1" />}
      {prob === 3 && <Sign at={[400, -230, 40]} yaw={0.7} w={92} h={30} lines={['새 부품 Ø30 × 60 mm', '블록은 25 mm']} fg="#ffffff" bg="#e5484d" />}
    </group>
  );
}

/* --- overlays ----------------------------------------------------------------------------- */

function Overlays({ overlay }: { overlay: AiOverlay }) {
  const { path, dims, markers, misses } = overlay;
  return (
    <group>
      {path && path.length > 1 && <Line points={path.map(v3)} color={LEARN_COLORS.path} lineWidth={2} transparent depthTest={false} renderOrder={7} />}
      {misses?.map((x, i) => <Line key={i} points={[v3(x.from), v3(x.to)]} color={LEARN_COLORS.bad} lineWidth={3} depthTest={false} renderOrder={8} />)}
      {dims?.map((d) => <Dim key={d.key} d={d} />)}
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
