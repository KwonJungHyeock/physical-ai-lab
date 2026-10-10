'use client';

/**
 * 바이오 실험실 · 시험관 옮기기 셀 in 3D (inside LearnStage's robot-frame group: metres, z up), in
 * the simulator's own style: a lab bench mat, white tube racks with their holes, a sample tray, glass
 * tubes with the sample inside (lower once some has spilt, a puddle where it fell), the centrifuge
 * of problem ③, and the lab around it — a reagent shelf, a pipette stand, a biohazard bin, and per
 * problem what the story names (the copied pouring program, the servo's maintenance tag, the
 * centrifuge's "새로 설치" tag).
 *
 * Every frame it plays the run (engine/education/lab/bio.ts frames) through BioPlayback: the arm
 * follows it (LearnStage reads `player.arm`, the gripper's opening too), the tubes go where the run
 * had them. Overlays: the tool path, measured lengths, markers, the tube's tilt against the
 * vertical, the planned route of ③.
 */

import { Html, Line } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { Quaternion, Vector3, type Group, type Mesh } from 'three';

import type { Mm } from '@/engine/education/lab/cell';
import { CENTRIFUGE, DST, RACK, ROW, SRC, TRAY, TUBE, rowHole, trayHole, type BioFrame, type BioProblem, type BioRun } from '@/engine/education/lab/bio';

import { RBox } from '../../simulator/stage/sceneKit';
import { LEARN_COLORS } from '../stage/learn3d';
import type { LiveArm } from '../stage/LearnStage';
import { Dim, Sign, Tape, m, tag, v3, type CellDim } from './CellKit';
import Bench from './ambient/Bench';
import Model from './ambient/Model';
import { BIO_BENCH_MM } from './ambient/around/bio';

const FRAME_DT = 0.02;
const UP = new Vector3(0, 0, 1);

/** Playback of a bio run: the time, whether it plays, and the arm (with the gripper's opening) LearnStage reads. */
export class BioPlayback {
  run: BioRun | null = null;
  t = 0;
  playing = false;
  rate = 1;
  /** Tubes to show when there is no run. */
  still: BioFrame['tubes'] | null = null;
  readonly arm: { current: LiveArm | null } = { current: null };
  private onTick: ((t: number, done: boolean) => void) | null = null;
  private lastTick = 0;

  listen(fn: ((t: number, done: boolean) => void) | null): void {
    this.onTick = fn;
  }
  start(run: BioRun | null, at: number | 'end' = 0, rate = 1): void {
    this.run = run;
    this.rate = rate;
    this.t = run ? (at === 'end' ? run.durationS : Math.min(at, run.durationS)) : 0;
    this.playing = !!run && this.t < run.durationS;
    this.lastTick = this.t;
  }
  setStill(tubes: BioFrame['tubes'] | null): void {
    this.still = tubes;
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
  frame(): BioFrame | null {
    const r = this.run;
    return r ? r.frames[Math.min(r.frames.length - 1, Math.max(0, Math.round(this.t / FRAME_DT)))] : null;
  }
  advance(dt: number): BioFrame | null {
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

export interface BioMarker {
  key: string;
  mm: Mm;
  ok: boolean;
  text?: string;
}

export interface BioOverlay {
  path?: Mm[] | null;
  dims?: CellDim[];
  markers?: BioMarker[];
  /** The tube's tilt: its rim, its axis (unit, down the tube), the angle. */
  tilt?: { at: Mm; axis: Mm; deg: number; bad: boolean } | null;
  /** ③: the planned route of the grip point, and whether it is free. */
  route?: { points: Mm[]; ok: boolean } | null;
}

interface Props {
  player: BioPlayback;
  prob: BioProblem;
  overlay: BioOverlay;
  /** How many tubes the run has (their meshes). */
  tubes: number;
  /** Where the sample fell (①), mm, once it has. */
  spill?: Mm | null;
}

export default function BioCell({ player, prob, overlay, tubes, spill }: Props) {
  const tubeRefs = useRef<(Group | null)[]>([]);
  const liquidRefs = useRef<(Mesh | null)[]>([]);
  const q = useMemo(() => new Quaternion(), []);
  const d = useMemo(() => new Vector3(), []);

  useFrame((_, dt) => {
    const f = player.advance(dt);
    const list = f?.tubes ?? player.still ?? [];
    tubeRefs.current.forEach((g, i) => {
      if (!g) return;
      const t = list[i];
      g.visible = !!t;
      if (!t) return;
      // The tube's group sits at its bottom, its +z along the tube (bottom → rim).
      g.position.set(m(t.bottom[0]), m(t.bottom[1]), m(t.bottom[2]));
      d.set(t.top[0] - t.bottom[0], t.top[1] - t.bottom[1], t.top[2] - t.bottom[2]).normalize();
      g.quaternion.copy(q.setFromUnitVectors(UP, d));
      const liq = liquidRefs.current[i];
      if (liq) liq.scale.set(1, 1, t.left < 1 ? 0.62 : 1);
    });
  });

  return (
    <group>
      <BenchMat />
      <LabDressing prob={prob} />
      {prob === 2 ? (
        <>
          <Rack at={[TRAY.x, TRAY.y0 + 45]} size={[30, 124]} holes={Array.from({ length: ROW.n }, (_, k) => trayHole(k))} label="시료 트레이" />
          <RowRack />
        </>
      ) : (
        <>
          <Rack at={SRC} size={[44, 120]} holes={[[SRC[0], SRC[1] - 40, 0], [SRC[0], SRC[1] - 20, 0], [SRC[0], SRC[1], 0], [SRC[0], SRC[1] + 20, 0], [SRC[0], SRC[1] + 40, 0]]} label="시료 랙" />
          <Rack at={DST} size={[44, 120]} holes={[[DST[0], DST[1] - 40, 0], [DST[0], DST[1] - 20, 0], [DST[0], DST[1], 0], [DST[0], DST[1] + 20, 0], [DST[0], DST[1] + 40, 0]]} label="분석 랙" />
        </>
      )}
      {prob === 3 && <Centrifuge />}
      {Array.from({ length: tubes }, (_, i) => (
        <group
          key={i}
          ref={(el) => {
            tubeRefs.current[i] = el;
          }}
          visible={false}
        >
          <Tube
            liquidRef={(el) => {
              liquidRefs.current[i] = el;
            }}
            full={prob === 1}
            color={['#b3262e', '#c0392b', '#a93226', '#b03a2e', '#922b21', '#c0392b'][i % 6]}
          />
        </group>
      ))}
      {spill && (
        <mesh position={[m(spill[0]), m(spill[1]), m(1.6)]} scale={[1.6, 1, 1]}>
          <circleGeometry args={[m(16), 40]} />
          <meshPhysicalMaterial color="#9b1c22" transparent opacity={0.75} roughness={0.05} clearcoat={1} depthWrite={false} />
        </mesh>
      )}
      <Overlays overlay={overlay} />
    </group>
  );
}

/* --- models ------------------------------------------------------------------------------- */

/** The lab bench's mat under the work area: light, chemical-resistant. */
function BenchMat() {
  return (
    <RBox at={[110, 20, 0.5]} size={[420, 440, 1]} radius={0.5} shadow={false}>
      <meshStandardMaterial color="#dfe6ee" roughness={0.9} />
    </RBox>
  );
}

/** A glass tube (bottom at the group's origin, rim up its +z), the sample inside, a barcode band. */
function Tube({ liquidRef, full, color }: { liquidRef(el: Mesh | null): void; full: boolean; color: string }) {
  const L = TUBE.len;
  const fill = full ? L - 3 : L * 0.55;
  return (
    <group>
      <mesh position={[0, 0, m(L / 2)]} rotation={[Math.PI / 2, 0, 0]} renderOrder={3}>
        <cylinderGeometry args={[m(TUBE.d / 2), m(TUBE.d / 2), m(L), 24, 1, true]} />
        <meshPhysicalMaterial color="#f4fbff" transparent opacity={0.32} roughness={0.05} clearcoat={1} depthWrite={false} side={2} />
      </mesh>
      <mesh position={[0, 0, m(2)]}>
        <sphereGeometry args={[m(TUBE.d / 2), 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2]} />
        <meshPhysicalMaterial color="#f4fbff" transparent opacity={0.32} roughness={0.05} depthWrite={false} />
      </mesh>
      <group ref={liquidRef}>
        <mesh position={[0, 0, m(fill / 2 + 1)]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[m(TUBE.inner / 2), m(TUBE.inner / 2), m(fill - 2), 20]} />
          <meshStandardMaterial color={color} roughness={0.3} />
        </mesh>
      </group>
      <mesh position={[0, 0, m(L * 0.62)]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[m(TUBE.d / 2 + 0.2), m(TUBE.d / 2 + 0.2), m(14), 24, 1, true]} />
        <meshStandardMaterial color="#ffffff" roughness={0.6} side={2} />
      </mesh>
    </group>
  );
}

/** A white plastic rack (top at RACK.top) with dark holes where tubes go, a label on its side. */
function Rack({ at, size, holes, label }: { at: readonly number[]; size: [number, number]; holes: readonly Mm[]; label: string }) {
  const [x, y] = at;
  const [sx, sy] = size;
  return (
    <group>
      <RBox at={[x, y, RACK.top / 2]} size={[sx, sy, RACK.top]} radius={3}>
        <meshStandardMaterial color="#eef2f6" roughness={0.55} />
      </RBox>
      {holes.map((h) => (
        <group key={`${h[0]}${h[1]}`} position={[m(h[0]), m(h[1]), m(RACK.top + 0.3)]}>
          <mesh>
            <circleGeometry args={[m(9), 24]} />
            <meshStandardMaterial color="#2b3038" roughness={0.8} />
          </mesh>
          <mesh position={[0, 0, m(0.1)]}>
            <ringGeometry args={[m(9), m(10.5), 24]} />
            <meshStandardMaterial color="#c3ccd6" roughness={0.5} />
          </mesh>
        </group>
      ))}
      <Sign at={[x + sx / 2 + 0.6, y, RACK.top / 2]} yaw={Math.PI / 2} w={Math.min(sy - 20, 70)} h={13} lines={[label]} fg="#1d2939" bg="#ffffff" />
    </group>
  );
}

/** ②: the analyser rack, one line of holes going out from the robot, each numbered. */
function RowRack() {
  const a = (ROW.dirDeg * Math.PI) / 180;
  const holes = Array.from({ length: ROW.n }, (_, k) => rowHole(k));
  const mid = holes[Math.floor(ROW.n / 2)];
  const len = (ROW.n - 1) * ROW.pitch + 34;
  return (
    <group>
      <group position={[m(mid[0] - (ROW.pitch / 2) * Math.cos(a)), m(mid[1] - (ROW.pitch / 2) * Math.sin(a)), 0]} rotation={[0, 0, a]}>
        <RBox at={[0, 0, RACK.top / 2]} size={[len, 30, RACK.top]} radius={3}>
          <meshStandardMaterial color="#eef2f6" roughness={0.55} />
        </RBox>
        <Sign at={[0, -15.6, RACK.top / 2]} w={70} h={12} lines={['분석 랙 (1 → 6)']} fg="#1d2939" bg="#ffffff" />
      </group>
      {holes.map((h, k) => (
        <group key={k} position={[m(h[0]), m(h[1]), m(RACK.top + 0.3)]}>
          <mesh>
            <circleGeometry args={[m(9), 24]} />
            <meshStandardMaterial color="#2b3038" roughness={0.8} />
          </mesh>
          <mesh position={[0, 0, m(0.1)]}>
            <ringGeometry args={[m(9), m(10.5), 24]} />
            <meshStandardMaterial color="#c3ccd6" roughness={0.5} />
          </mesh>
          <Html zIndexRange={[11, 4]} center position={[m(-4), m(-16), m(2)]} style={{ pointerEvents: 'none' }}>
            <span style={{ ...tag('#344054'), font: '800 10px var(--font-ui, system-ui)', padding: '0 4px' }}>{k + 1}</span>
          </Html>
        </group>
      ))}
    </group>
  );
}

/** ③: the bench centrifuge — a white body, a dark lid with its window, a display and the new-install tag. */
function Centrifuge() {
  const [x0, y0] = CENTRIFUGE.min;
  const [x1, y1, z1] = CENTRIFUGE.max;
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  return (
    <group>
      <RBox at={[cx, cy, z1 / 2 - 4]} size={[x1 - x0, y1 - y0, z1 - 8]} radius={8}>
        <meshStandardMaterial color="#f5f7fa" roughness={0.45} />
      </RBox>
      <RBox at={[cx, cy, z1 - 4]} size={[x1 - x0 - 6, y1 - y0 - 6, 8]} radius={4}>
        <meshStandardMaterial color="#3a414b" roughness={0.35} />
      </RBox>
      <mesh position={[m(cx), m(cy), m(z1 + 0.3)]}>
        <circleGeometry args={[m(16), 32]} />
        <meshPhysicalMaterial color="#8fb4d6" transparent opacity={0.6} roughness={0.1} clearcoat={1} />
      </mesh>
      <RBox at={[x1 + 0.5, cy, 40]} size={[2, 30, 16]} radius={1}>
        <meshStandardMaterial color="#0f1a14" emissive="#1f9d55" emissiveIntensity={0.4} />
      </RBox>
      <Sign at={[x1 + 1.8, cy, 64]} yaw={Math.PI / 2} w={44} h={16} lines={['새로 설치', '위치 고정']} fg="#ffffff" bg="#e5484d" />
      <Sign at={[cx, y0 - 0.8, 55]} w={56} h={11} lines={['원심분리기 · 높이 95']} fg="#1d2939" bg="#ffffff" />
    </group>
  );
}

/** The lab bench under the cell (robot frame): its top's extent, mm; the top is z = 0, the floor BIO_BENCH_MM below. */
const BENCH = { x0: -420, x1: 460, y0: -700, y1: 780 } as const;

/**
 * The front of the lab bench's cabinets (its +x face): a row of drawers under the top, door pairs
 * below, each with its bar handle; the bench itself (top, cabinet body, plinth) is the shared <Bench kind="lab">.
 */
function BenchFront() {
  const { x1, y0, y1 } = BENCH;
  const H = BIO_BENCH_MM;
  const n = 4;
  const bay = (y1 - y0 - 40) / n;
  const face = <meshStandardMaterial color="#e6eaee" roughness={0.55} />;
  const bar = <meshStandardMaterial color="#8d969f" metalness={0.6} roughness={0.35} />;
  return (
    <group>
      {Array.from({ length: n }, (_, i) => y0 + 20 + bay * (i + 0.5)).map((y) => (
        <group key={y}>
          <RBox at={[x1 - 6, y, -75]} size={[8, bay - 8, 86]} radius={2}>
            {face}
          </RBox>
          <RBox at={[x1 - 1, y, -60]} size={[8, 120, 10]} radius={4}>
            {bar}
          </RBox>
          {[-1, 1].map((s) => (
            <group key={s}>
              <RBox at={[x1 - 6, y + (s * bay) / 4, -(H + 125) / 2 + 50]} size={[8, bay / 2 - 8, H - 245]} radius={2}>
                {face}
              </RBox>
              <RBox at={[x1 - 1, y + s * 22, -200]} size={[8, 10, 120]} radius={4}>
                {bar}
              </RBox>
            </group>
          ))}
        </group>
      ))}
    </group>
  );
}

/**
 * A low reagent shelf across the bench's far end (+y), beside the cell and off the view's line past
 * the arm to the lab: one white shelf on steel uprights, brown and clear bottles and wash bottles on
 * it, buffer bottles under it, the lab's sign along its edge.
 */
function ReagentShelf() {
  const y = BENCH.y1 - 95;
  const x0 = BENCH.x0;
  const x1 = 180;
  const shelf = 300;
  const steel = <meshStandardMaterial color="#9aa3ad" metalness={0.65} roughness={0.35} />;
  const bottles: readonly { x: number; z: number; name: string; color: string; h: number }[] = [
    ...[-360, -285, -210].map((x, i) => ({ x, z: shelf, name: 'reagentBottle', color: i % 2 ? '#dfe9ef' : '#7a3f12', h: 160 })),
    ...[-110, -30].map((x) => ({ x, z: shelf, name: 'plasticBottle', color: '#2f7de1', h: 190 })),
    ...[60, 135].map((x) => ({ x, z: shelf, name: 'reagentBottle', color: '#7a3f12', h: 150 })),
    ...[-350, -270].map((x) => ({ x, z: 0, name: 'plasticBottle', color: '#f3f5f7', h: 220 })),
    ...[-150, -80].map((x) => ({ x, z: 0, name: 'washBottle', color: '#f2f4f6', h: 180 })),
  ];
  return (
    <group>
      {[x0 + 15, x1 - 15].map((x) => (
        <RBox key={x} at={[x, y, (shelf + 40) / 2]} size={[30, 30, shelf + 40]} radius={3}>
          {steel}
        </RBox>
      ))}
      <RBox at={[(x0 + x1) / 2, y, shelf - 9]} size={[x1 - x0, 180, 18]} radius={3}>
        <meshStandardMaterial color="#f2f4f6" roughness={0.5} />
      </RBox>
      {bottles.map((b) => (
        <Model key={`${b.x},${b.z}`} group="bio" name={b.name} at={[b.x, y]} z={b.z} h={b.h} color={b.color} />
      ))}
      <Sign at={[(x0 + x1) / 2, y - 91, shelf - 9]} w={300} h={17} lines={['새움 바이오 분석실 · 장갑 · 보안경 착용']} fg="#ffffff" bg="#12935f" />
    </group>
  );
}

/** A pipette stand at real size: a heavy round foot, a post, three micropipettes hanging from its arms. */
function PipetteStand({ at }: { at: readonly [number, number] }) {
  const [x, y] = at;
  return (
    <group>
      <mesh position={[m(x), m(y), m(8)]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[m(75), m(80), m(16), 32]} />
        <meshStandardMaterial color="#3a414b" roughness={0.5} />
      </mesh>
      <RBox at={[x, y, 190]} size={[14, 14, 360]} radius={4}>
        <meshStandardMaterial color="#c9cfd6" metalness={0.6} roughness={0.35} />
      </RBox>
      {[-1, 0, 1].map((k) => {
        const a = (k * 2 * Math.PI) / 3 + 0.4;
        const px = x + 45 * Math.cos(a);
        const py = y + 45 * Math.sin(a);
        return (
          <group key={k}>
            <RBox at={[(x + px) / 2, (y + py) / 2, 330]} rot={a} size={[48, 12, 10]} radius={3}>
              <meshStandardMaterial color="#e5e7eb" roughness={0.45} />
            </RBox>
            <Model group="bio" name="micropipette" at={[px, py]} z={70} h={250} yaw={a} color={k ? '#eef0f2' : '#12935f'} />
          </group>
        );
      })}
    </group>
  );
}

/** A benchtop biohazard waste box: yellow, a lid with a slot, the label. */
function WasteBox({ at }: { at: readonly [number, number] }) {
  const [x, y] = at;
  return (
    <group>
      <RBox at={[x, y, 95]} size={[160, 130, 190]} radius={8}>
        <meshStandardMaterial color="#f2c230" roughness={0.5} />
      </RBox>
      <RBox at={[x, y, 196]} size={[168, 138, 14]} radius={5}>
        <meshStandardMaterial color="#e2a91a" roughness={0.5} />
      </RBox>
      <Sign at={[x + 80.5, y, 105]} yaw={Math.PI / 2} w={100} h={50} lines={['의료 폐기물', '생물 위해']} fg="#1d2025" bg="#ffffff" />
    </group>
  );
}

/**
 * The lab round the cell at real size: the white lab bench the arm stands on (its cabinets down to
 * the floor), a reagent shelf across its far end, a pipette stand, the biohazard waste box and a
 * rack of tubes waiting — and per problem the story's props.
 */
function LabDressing({ prob }: { prob: BioProblem }) {
  return (
    <group>
      <Bench {...BENCH} h={BIO_BENCH_MM} kind="lab" />
      <BenchFront />
      <Tape a={[330, -260]} b={[330, 300]} w={8} color="#2f9e6b" />
      <ReagentShelf />
      <PipetteStand at={[-300, -330]} />
      <WasteBox at={[-320, -610]} />
      <Model group="bio" name="tubeRack" at={[330, 430]} yaw={Math.PI / 2} w={250} color="#2f7de1" />
      {prob === 1 && <Sign at={[250, 80, 40]} yaw={0.9} w={88} h={34} lines={['붓기 프로그램 (복사본)', 'ry −35 · 병을 기울여 붓기']} fg="#1d2939" bg="#fff6d6" />}
      {prob === 2 && <Sign at={[-30, -62, 60]} yaw={0.4} w={86} h={30} lines={['정비 기록 · J1 서보 교체', '영점 확인 필요']} fg="#ffffff" bg="#e5484d" />}
    </group>
  );
}

/* --- overlays ----------------------------------------------------------------------------- */

function Overlays({ overlay }: { overlay: BioOverlay }) {
  const { path, dims, markers, tilt, route } = overlay;
  return (
    <group>
      {path && path.length > 1 && <Line points={path.map(v3)} color={LEARN_COLORS.path} lineWidth={2} transparent depthTest={false} renderOrder={7} />}
      {route && route.points.length > 1 && (
        <Line points={route.points.map(v3)} color={route.ok ? LEARN_COLORS.ok : LEARN_COLORS.bad} lineWidth={3} dashed dashSize={0.008} gapSize={0.005} depthTest={false} renderOrder={8} />
      )}
      {dims?.map((d) => <Dim key={d.key} d={d} />)}
      {markers?.map((k) => (
        <group key={k.key} position={v3(k.mm)}>
          <mesh renderOrder={8}>
            <sphereGeometry args={[m(4.5), 20, 14]} />
            <meshBasicMaterial color={k.ok ? LEARN_COLORS.ok : LEARN_COLORS.bad} transparent opacity={0.9} depthTest={false} toneMapped={false} />
          </mesh>
          {k.text && (
            <Html zIndexRange={[12, 4]} center position={[0, 0, m(22)]} style={{ pointerEvents: 'none' }}>
              <span style={tag(k.ok ? '#1f7a45' : '#fff', k.ok ? 'rgba(255,255,255,.92)' : '#e5484d')}>{k.text}</span>
            </Html>
          )}
        </group>
      ))}
      {tilt && (
        <group>
          <Line points={[v3(tilt.at), v3([tilt.at[0], tilt.at[1], tilt.at[2] - 70])]} color="#ffffff" lineWidth={2} dashed dashSize={0.005} gapSize={0.004} depthTest={false} renderOrder={9} />
          <Line
            points={[v3(tilt.at), v3([tilt.at[0] + tilt.axis[0] * 70, tilt.at[1] + tilt.axis[1] * 70, tilt.at[2] + tilt.axis[2] * 70])]}
            color={tilt.bad ? LEARN_COLORS.bad : LEARN_COLORS.ok}
            lineWidth={3}
            depthTest={false}
            renderOrder={9}
          />
          <Html zIndexRange={[12, 4]} center position={v3([tilt.at[0], tilt.at[1], tilt.at[2] + 18]).toArray()} style={{ pointerEvents: 'none' }}>
            <span style={tag('#fff', tilt.bad ? '#e5484d' : '#1f9d55')}>기울기 {tilt.deg.toFixed(1)}°</span>
          </Html>
        </group>
      )}
    </group>
  );
}
