'use client';

/**
 * 스마트팜 · 방울토마토 선별 셀 in 3D (inside LearnStage's robot-frame group: metres, z up), in the
 * simulator's own style: the black sorting tray with its two calibration markers, the tomatoes (their
 * colour from the hue the engine gives them, a green calyx on top), the clear punnet they are packed
 * into, the USB camera on its stand looking straight down (its view drawn as thin lines to the tray's
 * corners), and the greenhouse around it — tomato rows, grow lights, harvest crates — with per problem
 * what the story names (last season's paprika program, the raised camera, the force gauge).
 *
 * Every frame it plays the run (engine/education/lab/farm.ts frames) through FarmPlayback: the arm and
 * gripper follow it, the tomatoes go where the run had them (a burst one flattens, red juice under it).
 */

import { Html, Line } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { Color, type Group, type Mesh } from 'three';

import type { Mm } from '@/engine/education/lab/cell';
import { CAM, MARKER, MARKERS, PUNNET, TRAY, punnetSlot, type FarmFrame, type FarmProblem, type FarmRun, type Tomato } from '@/engine/education/lab/farm';

import { RBox } from '../../simulator/stage/sceneKit';
import { LEARN_COLORS } from '../stage/learn3d';
import type { LiveArm } from '../stage/LearnStage';
import { Dim, Sign, Tape, m, tag, v3, type CellDim } from './CellKit';

const FRAME_DT = 0.02;

/** Playback of a farm run: the time, whether it plays, and the arm (with the gripper's opening) LearnStage reads. */
export class FarmPlayback {
  run: FarmRun | null = null;
  t = 0;
  playing = false;
  rate = 1;
  /** Tomatoes to show when there is no run. */
  still: FarmFrame['tomatoes'] | null = null;
  readonly arm: { current: LiveArm | null } = { current: null };
  private onTick: ((t: number, done: boolean) => void) | null = null;
  private lastTick = 0;

  listen(fn: ((t: number, done: boolean) => void) | null): void {
    this.onTick = fn;
  }
  start(run: FarmRun | null, at: number | 'end' = 0, rate = 1): void {
    this.run = run;
    this.rate = rate;
    this.t = run ? (at === 'end' ? run.durationS : Math.min(at, run.durationS)) : 0;
    this.playing = !!run && this.t < run.durationS;
    this.lastTick = this.t;
  }
  setStill(tomatoes: FarmFrame['tomatoes'] | null): void {
    this.still = tomatoes;
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
  frame(): FarmFrame | null {
    const r = this.run;
    return r ? r.frames[Math.min(r.frames.length - 1, Math.max(0, Math.round(this.t / FRAME_DT)))] : null;
  }
  advance(dt: number): FarmFrame | null {
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
    this.arm.current = { angles: f.q, pump: false, gap: f.gap };
    return f;
  }
}

export interface FarmMarker {
  key: string;
  mm: Mm;
  ok: boolean;
  text?: string;
}

export interface FarmOverlay {
  path?: Mm[] | null;
  dims?: CellDim[];
  markers?: FarmMarker[];
  /** Show the camera's view lines (to the tray's corners). */
  view?: boolean;
}

interface Props {
  player: FarmPlayback;
  prob: FarmProblem;
  tomatoes: readonly Tomato[];
  overlay: FarmOverlay;
}

/** A tomato's skin colour for its hue (the same HSV the camera picture uses). */
export function tomatoColor(hue: number): string {
  return new Color().setHSL((((hue % 360) + 360) % 360) / 360, 0.78, 0.44).getStyle();
}

export default function FarmCell({ player, prob, tomatoes, overlay }: Props) {
  const refs = useRef<(Group | null)[]>([]);
  const juice = useRef<(Mesh | null)[]>([]);

  useFrame((_, dt) => {
    const f = player.advance(dt);
    const list = f?.tomatoes ?? player.still ?? [];
    refs.current.forEach((g, i) => {
      if (!g) return;
      const t = list[i];
      g.visible = !!t;
      if (!t) return;
      const burst = t.mode === 'burst';
      g.position.set(m(t.c[0]), m(t.c[1]), m(burst ? TRAY.top + 5 : t.c[2]));
      g.scale.set(burst ? 1.25 : 1, burst ? 1.25 : 1, burst ? 0.35 : 1);
      const j = juice.current[i];
      if (j) j.visible = burst;
    });
  });

  return (
    <group>
      <Floor />
      <Greenhouse prob={prob} />
      <SortTray />
      <Punnet />
      <CameraStand raised={prob === 2} />
      {tomatoes.map((t, i) => (
        <group key={i}>
          <group
            ref={(el) => {
              refs.current[i] = el;
            }}
            visible={false}
          >
            <TomatoMesh d={t.d} hue={t.hue} />
          </group>
          <mesh
            ref={(el) => {
              juice.current[i] = el;
            }}
            visible={false}
            position={[m(t.x), m(t.y), m(TRAY.top + 0.6)]}
          >
            <circleGeometry args={[m(t.d * 0.9), 28]} />
            <meshPhysicalMaterial color="#b3141c" transparent opacity={0.8} roughness={0.05} clearcoat={1} depthWrite={false} />
          </mesh>
        </group>
      ))}
      <Overlays overlay={overlay} />
    </group>
  );
}

/* --- models ------------------------------------------------------------------------------- */

/** The sorting room's floor-level bench: a light work surface. */
function Floor() {
  return (
    <RBox at={[130, 0, 0.5]} size={[460, 520, 1]} radius={0.5} shadow={false}>
      <meshStandardMaterial color="#e3e8e1" roughness={0.9} />
    </RBox>
  );
}

/** A tomato (centre at the group's origin): a slightly squat sphere, a calyx of five sepals and a stem. */
function TomatoMesh({ d, hue }: { d: number; hue: number }) {
  const color = useMemo(() => tomatoColor(hue), [hue]);
  const r = d / 2;
  return (
    <group>
      <mesh scale={[1, 1, 0.9]} castShadow>
        <sphereGeometry args={[m(r), 28, 20]} />
        <meshPhysicalMaterial color={color} roughness={0.28} clearcoat={0.8} clearcoatRoughness={0.2} />
      </mesh>
      {[0, 1, 2, 3, 4].map((k) => (
        <mesh key={k} position={[m(Math.cos((k * 2 * Math.PI) / 5) * r * 0.22), m(Math.sin((k * 2 * Math.PI) / 5) * r * 0.22), m(r * 0.88)]} rotation={[0, 0, (k * 2 * Math.PI) / 5]} scale={[1, 0.35, 0.18]}>
          <sphereGeometry args={[m(r * 0.32), 10, 6]} />
          <meshStandardMaterial color="#3f7d2a" roughness={0.7} />
        </mesh>
      ))}
      <mesh position={[0, 0, m(r * 0.98)]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[m(1.2), m(1.5), m(5), 8]} />
        <meshStandardMaterial color="#4d8a32" roughness={0.7} />
      </mesh>
    </group>
  );
}

/** The black sorting tray, ribbed, with the two printed calibration markers at its ends. */
function SortTray() {
  const { x, y, sx, sy, top } = TRAY;
  return (
    <group>
      <RBox at={[x, y, top / 2]} size={[sx, sy, top]} radius={4}>
        <meshStandardMaterial color="#25282d" roughness={0.75} />
      </RBox>
      {Array.from({ length: 7 }, (_, k) => (
        <RBox key={k} at={[x - sx / 2 + 12 + k * ((sx - 24) / 6), y, top + 0.4]} size={[1.6, sy - 16, 0.8]} radius={0.3} shadow={false}>
          <meshStandardMaterial color="#30343a" roughness={0.8} />
        </RBox>
      ))}
      {/* A low rim round the tray. */}
      {[
        [x, y - sy / 2 + 2, sx, 4],
        [x, y + sy / 2 - 2, sx, 4],
      ].map(([cx, cy, w, h], i) => (
        <RBox key={i} at={[cx, cy, top + 3]} size={[w, h, 6]} radius={1.5}>
          <meshStandardMaterial color="#1c1f23" roughness={0.7} />
        </RBox>
      ))}
      {MARKERS.map(([mx, my], i) => (
        <group key={i} position={[m(mx), m(my), m(top + 0.9)]}>
          <mesh>
            <planeGeometry args={[m(MARKER.size), m(MARKER.size)]} />
            <meshBasicMaterial color="#f4f4f4" toneMapped={false} />
          </mesh>
          <mesh position={[0, 0, m(0.1)]}>
            <planeGeometry args={[m(MARKER.size * 0.8), m(MARKER.size * 0.8)]} />
            <meshBasicMaterial color="#141414" toneMapped={false} />
          </mesh>
          {[
            [-1, -1],
            [1, 1],
            [-1, 1],
            [0, 0],
          ].map(([a, b], j) => (
            <mesh key={j} position={[m(a * MARKER.size * 0.17), m(b * MARKER.size * 0.17), m(0.2)]}>
              <planeGeometry args={[m(MARKER.size * 0.16), m(MARKER.size * 0.16)]} />
              <meshBasicMaterial color="#f4f4f4" toneMapped={false} />
            </mesh>
          ))}
          <Html zIndexRange={[11, 4]} center position={[m(-MARKER.size * 0.9), 0, m(2)]} style={{ pointerEvents: 'none' }}>
            <span style={{ ...tag('#344054'), font: '800 10px var(--font-ui, system-ui)', padding: '0 4px' }}>마커 {i + 1}</span>
          </Html>
        </group>
      ))}
      <Sign at={[x - sx / 2 - 0.6, y, top / 2]} yaw={-Math.PI / 2} w={70} h={12} lines={['선별 트레이']} fg="#ffffff" bg="#3a9b3a" />
    </group>
  );
}

/** The clear packing punnet (2 × 4 places) with a label. */
function Punnet() {
  const { x, y, floor, wall } = PUNNET;
  const sx = 2 * PUNNET.pitchX + 12;
  const sy = 4 * PUNNET.pitchY + 10;
  return (
    <group>
      <RBox at={[x, y, floor / 2]} size={[sx, sy, floor]} radius={3}>
        <meshStandardMaterial color="#dfe9ef" roughness={0.4} />
      </RBox>
      {[
        [x, y - sy / 2, sx, 1.4],
        [x, y + sy / 2, sx, 1.4],
        [x - sx / 2, y, 1.4, sy],
        [x + sx / 2, y, 1.4, sy],
      ].map(([cx, cy, w, h], i) => (
        <mesh key={i} position={[m(cx), m(cy), m(wall / 2)]} renderOrder={3}>
          <boxGeometry args={[m(w), m(h), m(wall)]} />
          <meshPhysicalMaterial color="#eef7ff" transparent opacity={0.35} roughness={0.05} clearcoat={1} depthWrite={false} />
        </mesh>
      ))}
      {Array.from({ length: 8 }, (_, k) => {
        const [px, py] = punnetSlot(k);
        return (
          <mesh key={k} position={[m(px), m(py), m(floor + 0.3)]}>
            <ringGeometry args={[m(9), m(11), 24]} />
            <meshStandardMaterial color="#b9c7d2" roughness={0.5} />
          </mesh>
        );
      })}
      <Sign at={[x + sx / 2 + 0.8, y, wall / 2]} yaw={Math.PI / 2} w={86} h={16} lines={['포장 용기 · 익은 것만']} fg="#1d2939" bg="#ffffff" />
    </group>
  );
}

/** The USB camera on a stand: a weighted base behind the tray, a post, a boom over the tray, the camera looking down. ② also shows where it was before. */
function CameraStand({ raised }: { raised: boolean }) {
  const py = TRAY.y + TRAY.sy / 2 + 55;
  const z = CAM.z;
  return (
    <group>
      <RBox at={[CAM.x, py, 6]} size={[90, 70, 12]} radius={4}>
        <meshStandardMaterial color="#2f3439" roughness={0.6} />
      </RBox>
      <mesh position={[m(CAM.x), m(py), m(z / 2 + 10)]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[m(6), m(6), m(z + 20), 16]} />
        <meshStandardMaterial color="#c9cfd6" metalness={0.6} roughness={0.35} />
      </mesh>
      <RBox at={[CAM.x, (py + CAM.y) / 2, z + 30]} size={[10, py - CAM.y + 12, 10]} radius={2}>
        <meshStandardMaterial color="#c9cfd6" metalness={0.6} roughness={0.35} />
      </RBox>
      <RBox at={[CAM.x, CAM.y, z + 18]} size={[30, 64, 20]} radius={5}>
        <meshStandardMaterial color="#1f2226" roughness={0.4} />
      </RBox>
      <mesh position={[m(CAM.x), m(CAM.y), m(z + 6)]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[m(9), m(10), m(6), 24]} />
        <meshPhysicalMaterial color="#0d1014" roughness={0.1} clearcoat={1} />
      </mesh>
      <Html zIndexRange={[11, 4]} center position={[m(CAM.x), m(CAM.y), m(z + 52)]} style={{ pointerEvents: 'none' }}>
        <span style={{ ...tag('#fff', '#344054'), font: '800 11px var(--font-ui, system-ui)' }}>USB 카메라 · 책상에서 {z} mm</span>
      </Html>
      {raised && (
        <group>
          <RBox at={[CAM.x, CAM.y, CAM.zOld + 18]} size={[30, 64, 20]} radius={5} shadow={false}>
            <meshStandardMaterial color="#e5484d" transparent opacity={0.25} depthWrite={false} />
          </RBox>
          <Html zIndexRange={[11, 4]} center position={[m(CAM.x - 60), m(CAM.y), m(CAM.zOld + 18)]} style={{ pointerEvents: 'none' }}>
            <span style={{ ...tag('#fff', '#e5484d'), font: '800 11px var(--font-ui, system-ui)' }}>어제까지 {CAM.zOld} mm</span>
          </Html>
          <Sign at={[CAM.x, py - 7, 240]} yaw={Math.PI} w={60} h={26} lines={['80 mm 올림', '큰 트레이용']} fg="#ffffff" bg="#e5484d" />
        </group>
      )}
    </group>
  );
}

/** One greenhouse row: a raised bed, tall tomato plants on strings, a few trusses of fruit. */
function PlantRow({ x0, x1, y }: { x0: number; x1: number; y: number }) {
  const plants = useMemo(() => Array.from({ length: Math.floor((x1 - x0) / 60) + 1 }, (_, k) => x0 + k * 60), [x0, x1]);
  return (
    <group>
      <RBox at={[(x0 + x1) / 2, y, 30]} size={[x1 - x0 + 40, 70, 60]} radius={4}>
        <meshStandardMaterial color="#f2f4f1" roughness={0.6} />
      </RBox>
      {plants.map((px, k) => (
        <group key={px}>
          <mesh position={[m(px), m(y), m(60 + 170)]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[m(4), m(5), m(340), 8]} />
            <meshStandardMaterial color="#3d7a2c" roughness={0.8} />
          </mesh>
          {[110, 190, 270, 350].map((h, j) => (
            <mesh key={h} position={[m(px + (j % 2 ? 16 : -16)), m(y), m(60 + h)]} scale={[1.4, 0.7, 0.5]}>
              <sphereGeometry args={[m(26), 10, 8]} />
              <meshStandardMaterial color={j % 2 ? '#4f9a37' : '#5aa83f'} roughness={0.8} />
            </mesh>
          ))}
          {[0, 1, 2].map((j) => (
            <mesh key={j} position={[m(px + 8 + j * 9), m(y - 22), m(60 + 150 - j * 6 + (k % 2) * 60)]}>
              <sphereGeometry args={[m(13), 14, 10]} />
              <meshPhysicalMaterial color={tomatoColor([3, 26, 80][(j + k) % 3])} roughness={0.3} clearcoat={0.8} />
            </mesh>
          ))}
        </group>
      ))}
      {/* A grow light over the row. */}
      <RBox at={[(x0 + x1) / 2, y, 470]} size={[x1 - x0 + 40, 26, 10]} radius={3}>
        <meshStandardMaterial color="#d7c8ff" emissive="#b28cff" emissiveIntensity={0.9} toneMapped={false} />
      </RBox>
    </group>
  );
}

/** The greenhouse round the sorting cell, and per problem the story's props. */
function Greenhouse({ prob }: { prob: FarmProblem }) {
  return (
    <group>
      <Tape a={[-120, 260]} b={[380, 260]} w={8} color="#3a9b3a" />
      <Tape a={[-120, -270]} b={[380, -270]} w={8} color="#3a9b3a" />
      <PlantRow x0={-80} x1={340} y={380} />
      {/* Harvest crates stacked by the bench. */}
      {[0, 1].map((k) => (
        <group key={k}>
          <RBox at={[-110, 150, 30 + k * 62]} size={[120, 80, 58]} radius={4}>
            <meshStandardMaterial color={k ? '#2f8f46' : '#e0a321'} roughness={0.6} />
          </RBox>
          {Array.from({ length: 6 }, (_, j) => (
            <mesh key={j} position={[m(-140 + (j % 3) * 30), m(135 + Math.floor(j / 3) * 30), m(62 + k * 62)]}>
              <sphereGeometry args={[m(13), 14, 10]} />
              <meshPhysicalMaterial color={tomatoColor(k ? 4 : 28)} roughness={0.3} clearcoat={0.8} />
            </mesh>
          ))}
        </group>
      ))}
      <Sign at={[-110, 150 - 40.8, 60]} w={100} h={22} lines={['햇살 스마트팜 선별장', '오늘 수확 · 방울토마토']} fg="#ffffff" bg="#3a9b3a" />
      {prob === 1 && <Sign at={[300, -135, 40]} yaw={0.6} w={94} h={34} lines={['파프리카 선별 프로그램', '(지난 시즌) 색상 −10 ~ 40°']} fg="#1d2939" bg="#fff6d6" />}
      {prob === 3 && (
        <group>
          {/* The farm's force gauge on the bench, a tomato in its jaws. */}
          <RBox at={[-60, -150, 10]} size={[50, 36, 20]} radius={4}>
            <meshStandardMaterial color="#f5f7fa" roughness={0.5} />
          </RBox>
          <RBox at={[-60, -150, 21]} size={[30, 20, 2]} radius={1}>
            <meshStandardMaterial color="#0f1a14" emissive="#3a9b3a" emissiveIntensity={0.5} />
          </RBox>
          <Sign at={[-60, -190, 46]} yaw={0.3} w={90} h={30} lines={['힘 측정기 · 완숙 토마토', '6 N 터짐 · 1 mm에 1.2 N']} fg="#ffffff" bg="#e5484d" />
        </group>
      )}
    </group>
  );
}

/* --- overlays ----------------------------------------------------------------------------- */

function Overlays({ overlay }: { overlay: FarmOverlay }) {
  const { path, dims, markers, view } = overlay;
  const corners = useMemo(() => {
    const z = TRAY.top;
    const c: Mm[] = [
      [TRAY.x - TRAY.sx / 2, TRAY.y - TRAY.sy / 2, z],
      [TRAY.x + TRAY.sx / 2, TRAY.y - TRAY.sy / 2, z],
      [TRAY.x + TRAY.sx / 2, TRAY.y + TRAY.sy / 2, z],
      [TRAY.x - TRAY.sx / 2, TRAY.y + TRAY.sy / 2, z],
    ];
    return c;
  }, []);
  return (
    <group>
      {view &&
        corners.map((c, i) => (
          <Line key={i} points={[v3([CAM.x, CAM.y, CAM.z]), v3(c)]} color="#7c8db0" lineWidth={1} transparent opacity={0.6} dashed dashSize={0.01} gapSize={0.006} />
        ))}
      {path && path.length > 1 && <Line points={path.map(v3)} color={LEARN_COLORS.path} lineWidth={2} transparent depthTest={false} renderOrder={7} />}
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
