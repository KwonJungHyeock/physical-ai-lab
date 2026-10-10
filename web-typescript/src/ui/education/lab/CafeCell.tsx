'use client';

/**
 * 스마트시티 · 서비스 카페와 돌봄 셀 in 3D (inside LearnStage's robot-frame group: metres, z up), in the
 * simulator's own style. ①② the café: the wooden bar with its espresso machine, the pickup counter
 * (customers stand beyond its edge), the tasting cup with the coffee inside — its surface tilting with
 * the run's acceleration (①) — and the customer's hand reaching over the counter (②) with the sensor's
 * detection zone; round it a menu board, stools, pendant lights, plants. ③ 돌봄: a resident's room —
 * the arm on a parked myAGV, the mini fridge, the low table by the bed, the full water bottle and the
 * resident's hand on the bed.
 *
 * Every frame it plays the run (engine/education/lab/cafe.ts frames) through CafePlayback.
 */

import { Html, Line } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import { Vector3, type Group, type Mesh } from 'three';

import type { Mm } from '@/engine/education/lab/cell';
import { BAR, BOTTLE, COUNTER_EDGE_Y, CUP, FRIDGE, PICKUP, ZONE_MM, CARRY_Z, GRIP_Z, type CafeFrame, type CafeProblem, type CafeRun } from '@/engine/education/lab/cafe';

import { RBox } from '../../simulator/stage/sceneKit';
import { LEARN_COLORS } from '../stage/learn3d';
import type { LiveArm } from '../stage/LearnStage';
import { Dim, Sign, m, tag, v3, type CellDim } from './CellKit';
import { CareBed } from './ambient/Around';
import Model from './ambient/Model';
import { AGV_TOP_MM, CAFE_COUNTER_MM, CARE_ARM_Z, ParkedAgv } from './ambient/Props';

const FRAME_DT = 0.02;
const UP = new Vector3(0, 0, 1);

/** Playback of a cafe run: the time, whether it plays, and the arm (with the gripper's opening) LearnStage reads. */
export class CafePlayback {
  run: CafeRun | null = null;
  t = 0;
  playing = false;
  rate = 1;
  /** Where the drink stands when there is no run. */
  still: { drink: Mm; mode: CafeFrame['mode'] } | null = null;
  readonly arm: { current: LiveArm | null } = { current: null };
  private onTick: ((t: number, done: boolean) => void) | null = null;
  private lastTick = 0;

  listen(fn: ((t: number, done: boolean) => void) | null): void {
    this.onTick = fn;
  }
  start(run: CafeRun | null, at: number | 'end' = 0, rate = 1): void {
    this.run = run;
    this.rate = rate;
    this.t = run ? (at === 'end' ? run.durationS : Math.min(at, run.durationS)) : 0;
    this.playing = !!run && this.t < run.durationS;
    this.lastTick = this.t;
  }
  setStill(s: { drink: Mm; mode: CafeFrame['mode'] } | null): void {
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
  frame(): CafeFrame | null {
    const r = this.run;
    return r ? r.frames[Math.min(r.frames.length - 1, Math.max(0, Math.round(this.t / FRAME_DT)))] : null;
  }
  advance(dt: number): CafeFrame | null {
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

export interface CafeMarker {
  key: string;
  mm: Mm;
  ok: boolean;
  text?: string;
}

export interface CafeOverlay {
  path?: Mm[] | null;
  dims?: CellDim[];
  markers?: CafeMarker[];
  /** ②: the sensor's detection zone in front of the cup (its length, mm) and the slow zone near the counter. */
  detect?: number | null;
  zone?: boolean;
  /** ③: the circle the bottle turns on (its radius, mm), ok or not. */
  turn?: { radius: number; ok: boolean } | null;
}

interface Props {
  player: CafePlayback;
  prob: CafeProblem;
  overlay: CafeOverlay;
}

export default function CafeCell({ player, prob, overlay }: Props) {
  const drink = useRef<Group | null>(null);
  const surface = useRef<Mesh | null>(null);
  const hand = useRef<Group | null>(null);
  const zone = useRef<Group | null>(null);
  const puddle = useRef<Mesh | null>(null);
  const n = new Vector3();

  useFrame((_, dt) => {
    const f = player.advance(dt);
    const d = f?.drink ?? player.still?.drink ?? null;
    if (drink.current) {
      drink.current.visible = !!d && f?.mode !== 'taken';
      if (d) drink.current.position.set(m(d[0]), m(d[1]), m(d[2]));
    }
    if (surface.current && f) {
      n.set(-f.slope[0], -f.slope[1], 1).normalize();
      surface.current.quaternion.setFromUnitVectors(UP, n);
      surface.current.position.z = m(CUP.h - CUP.headspace - (f.left < 1 ? 9 : 0));
    }
    if (puddle.current) puddle.current.visible = !!f && f.left < 1;
    if (hand.current) {
      const h = f?.hand ?? null;
      hand.current.visible = !!h;
      if (h) hand.current.position.set(m(h[0]), m(h[1]), m(h[2]));
    }
    if (zone.current && f && overlay.detect) {
      zone.current.visible = f.mode === 'held';
      zone.current.position.set(m(f.drink[0]), m(f.drink[1] - CUP.d / 2), m(f.drink[2] + GRIP_Z));
    }
  });

  const spillAt: Mm = [BAR[0] + 10, (BAR[1] + PICKUP[1]) / 2 + 60, 0];

  return (
    <group>
      {prob === 3 ? (
        <CareRoom />
      ) : (
        <>
          <Floor />
          <CounterBody />
          <Bar />
          <Counter />
          <CafeDressing prob={prob} />
        </>
      )}
      <group ref={drink} visible={false}>
        {prob === 3 ? <Bottle /> : <Cup
            surfaceRef={(el) => {
              surface.current = el;
            }}
          />}
      </group>
      {prob === 1 && (
        <mesh ref={(el) => {
            puddle.current = el;
          }} visible={false} position={[m(spillAt[0]), m(spillAt[1]), m(1.2)]} scale={[1.4, 1, 1]}>
          <circleGeometry args={[m(14), 32]} />
          <meshPhysicalMaterial color="#5a3018" transparent opacity={0.8} roughness={0.05} clearcoat={1} depthWrite={false} />
        </mesh>
      )}
      {prob === 2 && (
        <>
          <group
            ref={(el) => {
              hand.current = el;
            }}
            visible={false}
          >
            <Hand />
          </group>
          {overlay.detect && (
            <group
              ref={(el) => {
                zone.current = el;
              }}
              visible={false}
            >
              <mesh position={[0, m(-overlay.detect / 2), 0]} renderOrder={4}>
                <boxGeometry args={[m(CUP.d + 10), m(overlay.detect), m(60)]} />
                <meshBasicMaterial color="#ffb020" transparent opacity={0.16} depthWrite={false} />
              </mesh>
            </group>
          )}
        </>
      )}
      <Overlays overlay={overlay} />
    </group>
  );
}

/* --- models ------------------------------------------------------------------------------- */

function Floor() {
  return (
    <RBox at={[100, -40, 0.5]} size={[520, 560, 1]} radius={0.5} shadow={false}>
      <meshStandardMaterial color="#efe6da" roughness={0.85} />
    </RBox>
  );
}

/** The tasting cup: a white paper cup, coffee inside (its surface a separate disc that tilts), a sleeve. */
function Cup({ surfaceRef }: { surfaceRef(el: Mesh | null): void }) {
  const r = CUP.d / 2;
  const fill = CUP.h - CUP.headspace;
  return (
    <group>
      <mesh position={[0, 0, m(CUP.h / 2)]} rotation={[Math.PI / 2, 0, 0]} renderOrder={3}>
        <cylinderGeometry args={[m(r), m(r - 3), m(CUP.h), 28, 1, true]} />
        <meshStandardMaterial color="#fbfaf7" roughness={0.6} side={2} transparent opacity={0.9} />
      </mesh>
      <mesh position={[0, 0, m(fill / 2)]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[m(CUP.inner / 2 - 0.5), m(CUP.inner / 2 - 3), m(fill - 1), 24]} />
        <meshStandardMaterial color="#4a2511" roughness={0.3} />
      </mesh>
      <mesh ref={surfaceRef} position={[0, 0, m(fill)]}>
        <circleGeometry args={[m(CUP.inner / 2 + 3), 28]} />
        <meshPhysicalMaterial color="#6b3a1c" roughness={0.15} clearcoat={1} />
      </mesh>
      <mesh position={[0, 0, m(CUP.h * 0.45)]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[m(r - 0.9), m(r - 1.6), m(18), 28, 1, true]} />
        <meshStandardMaterial color="#b4530f" roughness={0.7} side={2} />
      </mesh>
    </group>
  );
}

/** ③: the full water bottle: clear plastic, water, a blue cap and a label. */
function Bottle() {
  const r = BOTTLE.d / 2;
  return (
    <group>
      <mesh position={[0, 0, m(BOTTLE.h * 0.4)]} rotation={[Math.PI / 2, 0, 0]} renderOrder={3}>
        <cylinderGeometry args={[m(r), m(r), m(BOTTLE.h * 0.8), 28]} />
        <meshPhysicalMaterial color="#9fd3f0" transparent opacity={0.7} roughness={0.05} clearcoat={1} />
      </mesh>
      <mesh position={[0, 0, m(BOTTLE.h * 0.88)]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[m(r * 0.55), m(r), m(BOTTLE.h * 0.16), 24]} />
        <meshPhysicalMaterial color="#d8eef9" transparent opacity={0.55} roughness={0.05} clearcoat={1} />
      </mesh>
      <mesh position={[0, 0, m(BOTTLE.h + 3)]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[m(r * 0.58), m(r * 0.58), m(9), 20]} />
        <meshStandardMaterial color="#2f6fd6" roughness={0.5} />
      </mesh>
      <mesh position={[0, 0, m(BOTTLE.h * 0.4)]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[m(r + 0.3), m(r + 0.3), m(36), 28, 1, true]} />
        <meshStandardMaterial color="#ffffff" roughness={0.6} side={2} />
      </mesh>
    </group>
  );
}

/** ②: the customer's hand reaching over the counter: a sleeve, the hand, fingers toward the cup (+y). */
function Hand() {
  return (
    <group>
      <mesh position={[0, m(-110), m(-6)]} rotation={[0, 0, 0]}>
        <boxGeometry args={[m(46), m(170), m(40)]} />
        <meshStandardMaterial color="#d6d9de" roughness={0.8} />
      </mesh>
      <mesh position={[0, m(-22), 0]} scale={[1, 1.3, 0.55]}>
        <sphereGeometry args={[m(26), 20, 14]} />
        <meshStandardMaterial color="#f0c4a3" roughness={0.6} />
      </mesh>
      {[-13, -4, 5, 14].map((x) => (
        <mesh key={x} position={[m(x), m(-2), m(2)]} rotation={[Math.PI / 2, 0, 0]}>
          <capsuleGeometry args={[m(4.2), m(16), 6, 10]} />
          <meshStandardMaterial color="#f0c4a3" roughness={0.6} />
        </mesh>
      ))}
    </group>
  );
}

/** The bar on the left: a wooden top with the espresso machine and the cup's spot. */
function Bar() {
  const [x, y] = BAR;
  return (
    <group>
      <RBox at={[x, y + 20, 1]} size={[120, 90, 2]} radius={0.8} shadow={false}>
        <meshStandardMaterial color="#8a5a35" roughness={0.6} />
      </RBox>
      {/* Espresso machine behind the cup's spot. */}
      <RBox at={[x, y + 100, 75]} size={[140, 60, 150]} radius={8}>
        <meshStandardMaterial color="#c9cfd6" metalness={0.7} roughness={0.3} />
      </RBox>
      <RBox at={[x, y + 100, 152]} size={[130, 52, 4]} radius={1.5}>
        <meshStandardMaterial color="#2b3038" roughness={0.4} />
      </RBox>
      {/* The group head with its portafilter, the drip tray, a small display. */}
      <RBox at={[x, y + 64, 110]} size={[44, 14, 18]} radius={4}>
        <meshStandardMaterial color="#2b3038" roughness={0.4} />
      </RBox>
      <RBox at={[x + 30, y + 50, 100]} size={[60, 8, 8]} radius={3}>
        <meshStandardMaterial color="#1f2226" roughness={0.5} />
      </RBox>
      <RBox at={[x, y + 62, 5]} size={[110, 28, 6]} radius={2}>
        <meshStandardMaterial color="#9aa3ad" metalness={0.7} roughness={0.35} />
      </RBox>
      <RBox at={[x - 45, y + 69.6, 128]} size={[26, 1, 14]} radius={1} shadow={false}>
        <meshStandardMaterial color="#0f1a14" emissive="#3fb37f" emissiveIntensity={0.6} />
      </RBox>
      <Sign at={[x - 70.6, y + 100, 120]} yaw={-Math.PI / 2} w={60} h={16} lines={['바 · 시음 커피']} fg="#ffffff" bg="#b4530f" />
    </group>
  );
}

/** The pickup counter on the right: a long wooden top, its edge (customers beyond), the PICK-UP mark, the sensor. */
function Counter() {
  const [x, y] = PICKUP;
  return (
    <group>
      <RBox at={[x, (y + COUNTER_EDGE_Y) / 2 + 10, 1]} size={[200, 110, 2]} radius={0.8} shadow={false}>
        <meshStandardMaterial color="#8a5a35" roughness={0.6} />
      </RBox>
      <RBox at={[x, COUNTER_EDGE_Y - 18, 50]} size={[260, 36, 100]} radius={4}>
        <meshStandardMaterial color="#5c3b23" roughness={0.6} />
      </RBox>
      <mesh position={[m(x), m(y), m(2.4)]}>
        <ringGeometry args={[m(24), m(28), 32]} />
        <meshBasicMaterial color="#b4530f" toneMapped={false} />
      </mesh>
      <Sign at={[x, COUNTER_EDGE_Y - 36.6, 70]} yaw={Math.PI} w={90} h={22} lines={['PICK-UP', '음료 받는 곳']} fg="#ffffff" bg="#b4530f" />
      {/* The counter's distance sensor. */}
      <RBox at={[x + 70, COUNTER_EDGE_Y + 6, 18]} size={[20, 12, 20]} radius={3}>
        <meshStandardMaterial color="#1f2226" roughness={0.4} />
      </RBox>
      <mesh position={[m(x + 70), m(COUNTER_EDGE_Y + 12.3), m(20)]} rotation={[Math.PI / 2, 0, 0]}>
        <circleGeometry args={[m(4), 16]} />
        <meshStandardMaterial color="#ff4d4f" emissive="#ff4d4f" emissiveIntensity={0.8} toneMapped={false} />
      </mesh>
      <Html zIndexRange={[11, 4]} center position={[m(x + 70), m(COUNTER_EDGE_Y + 6), m(44)]} style={{ pointerEvents: 'none' }}>
        <span style={{ ...tag('#344054'), font: '800 10px var(--font-ui, system-ui)', padding: '0 4px' }}>거리 센서</span>
      </Html>
    </group>
  );
}

/**
 * ③ 돌봄: the resident's room at real size. The arm stands on a lift column on a parked myAGV (a
 * mobile manipulator), its base CARE_ARM_Z above the floor — the height of the bedside table, whose
 * top is where the engine puts the bottle down; the mini fridge stands with its top at the same
 * height, the bottle on a tray on it. Round them: the care bed, a wheelchair, the privacy curtain, an
 * armchair and a chest of drawers (model packs, see ambient/Model.tsx).
 */
function CareRoom() {
  const fz = -CARE_ARM_Z;
  const [tx, ty] = PICKUP;
  const [fx, fy] = FRIDGE;
  return (
    <group>
      <ParkedAgv z={fz} led="#3a8f6b" />
      <LiftColumn />
      <Model group="care" name="sideTable" at={[tx, ty - 20]} z={fz} h={CARE_ARM_Z} />
      <mesh position={[m(tx), m(ty), m(0.6)]}>
        <ringGeometry args={[m(24), m(28), 32]} />
        <meshBasicMaterial color="#3a8f6b" toneMapped={false} />
      </mesh>
      {/* A pill cup on the table, and the tray on the fridge the bottle is taken from. */}
      <mesh position={[m(tx - 150), m(ty - 60), m(12)]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[m(14), m(11), m(24), 18]} />
        <meshStandardMaterial color="#ffffff" roughness={0.5} />
      </mesh>
      <Model group="care" name="fridge" at={[fx - 20, fy + 40]} z={fz} yaw={-Math.PI / 2} h={CARE_ARM_Z - 6} />
      <RBox at={[fx, fy, -3]} size={[120, 90, 6]} radius={2}>
        <meshStandardMaterial color="#c9ced4" roughness={0.5} />
      </RBox>
      {/* The bed along y beyond the table, its head away; the resident sits on its edge facing the robot. */}
      <CareBed at={[1000, -300]} z={fz} yaw={-Math.PI / 2} rails="far" />
      <Model group="people" name="elderWoman" at={[700, -260]} z={fz} yaw={-Math.PI / 2} />
      <Model group="care" name="nightstand" at={[1080, 620]} z={fz} h={600} />
      <Model group="care" name="wheelchair" at={[-350, 900]} z={fz} yaw={2.6} />
      <Model group="care" name="curtain" at={[1650, -300]} z={fz} yaw={Math.PI / 2} />
      <Model group="care" name="armchair" at={[-760, 420]} z={fz} yaw={-2.3} />
      <Model group="care" name="drawers" at={[-1150, -150]} z={fz} yaw={Math.PI / 2} />
      <Sign at={[-130, 0, 260]} yaw={Math.PI / 2} w={150} h={70} lines={['스마트시티 돌봄 센터', '302호 · 물 드리기']} fg="#ffffff" bg="#3a8f6b" />
      <Sign at={[300, 30, 120]} yaw={0.7} w={92} h={30} lines={['물병 180 g', '아침 컵 60 g의 3배']} fg="#ffffff" bg="#e5484d" />
    </group>
  );
}

/** The lift column between the myAGV's top plate and the arm's base: an aluminium profile with its plates. */
function LiftColumn() {
  const fz = -CARE_ARM_Z;
  const bottom = fz + AGV_TOP_MM;
  const h = -bottom;
  return (
    <group>
      <RBox at={[0, 0, bottom + 5]} size={[200, 160, 10]} radius={2}>
        <meshStandardMaterial color="#2b3038" metalness={0.5} roughness={0.4} />
      </RBox>
      <RBox at={[0, 0, bottom + h / 2]} size={[90, 90, h - 20]} radius={3}>
        <meshStandardMaterial color="#c7ccd2" metalness={0.75} roughness={0.32} />
      </RBox>
      {[-1, 1].map((sx) => (
        <RBox key={sx} at={[sx * 46, 0, bottom + h / 2]} size={[2, 30, h - 40]} radius={0.5} shadow={false}>
          <meshStandardMaterial color="#8d949c" metalness={0.7} roughness={0.4} />
        </RBox>
      ))}
      <RBox at={[0, 0, -6]} size={[150, 150, 12]} radius={2}>
        <meshStandardMaterial color="#2b3038" metalness={0.5} roughness={0.4} />
      </RBox>
      <Html zIndexRange={[11, 4]} center position={[m(0), m(130), m(bottom + 60)]} style={{ pointerEvents: 'none' }}>
        <span style={{ ...tag('#344054'), font: '800 10px var(--font-ui, system-ui)', padding: '0 4px' }}>myAGV + 승강 기둥 · 멈춘 채</span>
      </Html>
    </group>
  );
}

/**
 * The bar counter under the cell at real size: the arm, the bar and the pickup spot are on its top
 * (z = 0); its body goes down CAFE_COUNTER_MM to the café floor — wood panels on the customers' side,
 * a dark kick plate, a stone top edge.
 */
function CounterBody() {
  const H = CAFE_COUNTER_MM;
  const x0 = -180;
  const x1 = 460;
  const y0 = COUNTER_EDGE_Y;
  const y1 = 420;
  const cx = (x0 + x1) / 2;
  return (
    <group>
      <RBox at={[cx, (y0 + y1) / 2, -H / 2 - 2]} size={[x1 - x0, y1 - y0, H - 4]} radius={4}>
        <meshStandardMaterial color="#6b4529" roughness={0.65} />
      </RBox>
      {/* vertical wood slats along the customers' side */}
      {Array.from({ length: 16 }, (_, i) => x0 + 20 + (i * (x1 - x0 - 40)) / 15).map((x) => (
        <RBox key={x} at={[x, y0 - 4, -H / 2 + 40]} size={[30, 8, H - 160]} radius={2}>
          <meshStandardMaterial color="#8a5a35" roughness={0.6} />
        </RBox>
      ))}
      <RBox at={[cx, y0 + 20, -H + 50]} size={[x1 - x0 + 4, 50, 100]} radius={2}>
        <meshStandardMaterial color="#2b2420" roughness={0.6} />
      </RBox>
      <RBox at={[cx, y0 - 10, -12]} size={[x1 - x0 + 30, 40, 24]} radius={4}>
        <meshStandardMaterial color="#e9e4dc" roughness={0.35} />
      </RBox>
    </group>
  );
}

/**
 * The café round the cell at real size: bar stools on the customers' side, pendant lamps over the
 * counter, the menu board on the bar, the customer (②) — and per problem the story's props.
 */
function CafeDressing({ prob }: { prob: CafeProblem }) {
  const fz = -CAFE_COUNTER_MM;
  return (
    <group>
      <Sign at={[-130, 0, 200]} yaw={Math.PI / 2} w={150} h={90} lines={['로봇 시음 카페', '오늘의 커피 · 시음 무료', '스마트시티 1층']} fg="#fdf3e2" bg="#2b2420" />
      {[560, 900].map((x) => (
        <Model key={x} group="cafe" name="stool" at={[x, -520]} z={fz} yaw={0.3} />
      ))}
      {[-60, 420].map((x) => (
        <Model key={x} group="cafe" name="lamp" at={[x, 120]} z={2000 - 952} scale={0.8} />
      ))}
      {/* ② the customer stands behind the counter edge; her reaching hand is the one the sensor sees */}
      {prob === 2 && <Model group="people" name="customer" at={[200, -640]} z={fz} yaw={Math.PI} pose="Idle" />}
      {prob === 1 && <Sign at={[290, 20, 40]} yaw={0.7} w={90} h={30} lines={['빈 컵 회수 프로그램', '250 mm/s · 4 m/s²']} fg="#1d2939" bg="#fff6d6" />}
      {prob === 2 && <Sign at={[300, -110, 40]} yaw={0.7} w={92} h={30} lines={['점심시간 · 손님 많음', '센서 감지 50 mm']} fg="#ffffff" bg="#e5484d" />}
    </group>
  );
}

/* --- overlays ----------------------------------------------------------------------------- */

function Overlays({ overlay }: { overlay: CafeOverlay }) {
  const { path, dims, markers, zone, turn } = overlay;
  const z0 = CARRY_Z - GRIP_Z + 2;
  return (
    <group>
      {path && path.length > 1 && <Line points={path.map(v3)} color={LEARN_COLORS.path} lineWidth={2} transparent depthTest={false} renderOrder={7} />}
      {zone && (
        <group>
          <Line points={[v3([PICKUP[0] - 30, PICKUP[1] + ZONE_MM, 9]), v3([PICKUP[0] + 30, PICKUP[1] + ZONE_MM, 9])]} color="#ffb020" lineWidth={3} dashed dashSize={0.008} gapSize={0.005} />
          <Html zIndexRange={[11, 4]} center position={v3([PICKUP[0] + 40, PICKUP[1] + ZONE_MM, 12]).toArray()} style={{ pointerEvents: 'none' }}>
            <span style={{ ...tag('#7a4b00', 'rgba(255,240,200,.95)'), font: '800 10px var(--font-ui, system-ui)' }}>여기부터 픽업대 구역</span>
          </Html>
        </group>
      )}
      {turn && (
        <Line
          points={Array.from({ length: 49 }, (_, k) => {
            const a = Math.atan2(PICKUP[1], PICKUP[0]) + (k / 48) * (Math.atan2(FRIDGE[1], FRIDGE[0]) - Math.atan2(PICKUP[1], PICKUP[0]));
            return v3([turn.radius * Math.cos(a), turn.radius * Math.sin(a), z0]);
          })}
          color={turn.ok ? LEARN_COLORS.ok : LEARN_COLORS.bad}
          lineWidth={3}
          dashed
          dashSize={0.008}
          gapSize={0.005}
          depthTest={false}
          renderOrder={8}
        />
      )}
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
