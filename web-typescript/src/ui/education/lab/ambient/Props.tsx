'use client';

/**
 * What moves round a site's cell (inside LearnStage's robot-frame group: metres, z up; mm here):
 * another myCobot 280 at its own station picking and placing on a loop, myAGVs driving their
 * routes, a belt with boxes going by, signal towers, beacons, fans, and monitors whose pictures
 * change. All on the ambient clock (ambient.ts): they stop when the viewer turns motion off.
 */

import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useContext, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { CanvasTexture, Color, DoubleSide, Group, Mesh, MeshStandardMaterial, SRGBColorSpace, type Object3D } from 'three';

import { HOME_DEG } from '@/engine/simulator/board';
import { poseAt, toolAt } from '@/engine/education/lab/ai';
import type { Mm } from '@/engine/education/lab/cell';

import { buildArm, buildTool, type GlbNodes } from '../../../simulator/stage/robotModel';
import { RBox, belt as beltTex } from '../../../simulator/stage/sceneKit';
import { BeltConveyor, CardBox, scroll, type BeltGeometry } from '../ConveyorCell';
import { m } from '../CellKit';
import { StageRobot, ease, loopPath, turnToward, useAmbientClock } from './ambient';
import { Blob } from './Ground';

const DRACO = '/draco/';
const ARM_URL = '/robot/rdkx5/rdkx5.glb';
/** The myAGV 2023's height to its top plate (the model's bounds), mm: where a mobile manipulator's arm stands. */
export const AGV_TOP_MM = 132;
const AGV_URL = '/robot/myagv/myagv2023.glb';

type Xy = readonly [number, number];

/** Where a station stands: position (mm) and turn (rad) on the floor. */
function Place({ at, yaw = 0, z = 0, children }: { at: Xy; yaw?: number; z?: number; children: ReactNode }) {
  return (
    <group position={[m(at[0]), m(at[1]), m(z)]} rotation={[0, 0, yaw]}>
      {children}
    </group>
  );
}

/* --- another arm at work ------------------------------------------------------------------- */

interface ArmJob {
  /** Pick and place spots in the arm's own base frame (mm, the block's top). */
  pick: Mm;
  place: Mm;
  /** Seconds for a whole cycle. */
  period?: number;
  block?: string;
  /** What it carries: a 25 mm block (default), a 26 mm ball (a tomato), or a lidded paper cup. */
  item?: 'cube' | 'ball' | 'cup';
}

/**
 * A myCobot 280 with a suction pump at its own station, carrying a 25 mm block from one spot to
 * another and back again, forever: poses from the same IK the lessons use, so the cup really
 * lands on the block.
 */
export function WorkingArm({ at, yaw = 0, job, phase = 0, table = [380, 260, 70], tableAt = [70, 0], children }: { at: Xy; yaw?: number; job: ArmJob; phase?: number; table?: readonly [number, number, number]; tableAt?: Xy; children?: ReactNode }) {
  const ctx = useContext(StageRobot);
  const { nodes } = useGLTF(ARM_URL, DRACO) as unknown as { nodes: GlbNodes };
  const arm = useMemo(() => (ctx ? buildArm(ctx.robot, ctx.chain, nodes) : null), [ctx, nodes]);
  const tool = useMemo(() => buildTool('pump', false, nodes, null), [nodes]);
  useEffect(() => {
    if (!arm) return;
    arm.flange.add(tool.group);
    arm.root.traverse((o) => {
      if ((o as Mesh).isMesh) o.castShadow = o.receiveShadow = true;
    });
    return () => void arm.flange.remove(tool.group);
  }, [arm, tool]);
  const H = job.item === 'ball' ? 26 : job.item === 'cup' ? 40 : 25;
  // The cycle as joint keyframes: home, over A, down, (lift with the block), over B, down, (let go), home.
  const plan = useMemo(() => {
    if (!ctx) return null;
    const above = (p: Mm, dz: number): Mm => [p[0], p[1], p[2] + dz];
    const pts: Mm[] = [above(job.pick, 60), job.pick, above(job.pick, 60), above(job.place, 60), job.place, above(job.place, 60)];
    let seed = HOME_DEG;
    const qs: number[][] = [];
    for (const p of pts) {
      const q = poseAt(ctx.chain, p, seed);
      if (!q) return null;
      qs.push(q);
      seed = q;
    }
    // [pose, seconds to get there, seconds to stay]
    const back = [HOME_DEG, qs[0], qs[1], qs[2], qs[3], qs[4], qs[5], HOME_DEG, qs[3], qs[4], qs[3], qs[0], qs[1], qs[0], HOME_DEG];
    const go = [1.2, 1.0, 0.6, 0.6, 1.4, 0.6, 0.6, 1.2, 1.2, 0.6, 0.6, 1.4, 0.6, 0.6, 1.2];
    const stay = [0.8, 0, 0.35, 0, 0, 0.35, 0, 0.8, 0, 0.35, 0, 0, 0.35, 0, 0];
    return { back, go, stay, total: go.reduce((s, v) => s + v, 0) + stay.reduce((s, v) => s + v, 0) };
  }, [ctx, job.pick, job.place]);
  const blockRef = useRef<Group>(null);
  const q = useRef<number[]>(HOME_DEG.slice());
  const scale = (job.period ?? 0) > 0 && plan ? plan.total / job.period! : 1;
  const clock = useAmbientClock(phase);
  useFrame((_, dt) => {
    const t = clock.tick(dt);
    if (t === null) return;
    if (!arm || !plan || !ctx) return;
    let s = (t * scale) % plan.total;
    let i = 0;
    let from = plan.back[plan.back.length - 1];
    let k = 1;
    for (; i < plan.back.length; i += 1) {
      if (s < plan.go[i]) {
        k = ease(s, 0, plan.go[i]);
        break;
      }
      s -= plan.go[i];
      if (s < plan.stay[i]) {
        k = 1;
        from = plan.back[i];
        break;
      }
      s -= plan.stay[i];
      from = plan.back[i];
    }
    const to = plan.back[Math.min(i, plan.back.length - 1)];
    for (let j = 0; j < 6; j += 1) q.current[j] = from[j] + (to[j] - from[j]) * k;
    arm.setAngles(q.current);
    // The block: carried between the first down (index 2) and the next down (5) on the way there, and
    // between 9 and 12 on the way back; otherwise it waits at the spot it was last put down.
    const b = blockRef.current;
    if (!b) return;
    const carrying = (i > 2 && i <= 5) || (i > 9 && i <= 12);
    const rest = i <= 2 || i > 12 ? job.pick : job.place;
    const p = carrying ? toolAt(ctx.chain, q.current) : [rest[0], rest[1], rest[2]];
    b.position.set(m(p[0]), m(p[1]), m(p[2] - H / 2));
  });
  if (!arm) return null;
  const [tw, td, th] = table;
  return (
    <Place at={at} yaw={yaw}>
      {/* The station's table (the arm and its blocks stand on its top); `children` sit on it too. */}
      <RBox at={[tableAt[0], tableAt[1], th - 9]} size={[tw, td, 18]} radius={3}>
        <meshStandardMaterial color="#e4e8ec" roughness={0.6} />
      </RBox>
      {[-1, 1].flatMap((sx) =>
        [-1, 1].map((sy) => (
          <RBox key={`${sx}${sy}`} at={[tableAt[0] + sx * (tw / 2 - 16), tableAt[1] + sy * (td / 2 - 16), (th - 18) / 2]} size={[20, 20, th - 18]} radius={2}>
            <meshStandardMaterial color="#aeb6bf" metalness={0.7} roughness={0.35} />
          </RBox>
        )),
      )}
      <group position={[0, 0, m(th)]}>
        <primitive object={arm.root} />
        <primitive object={tool.baseExtras} />
        <group ref={blockRef}>
          {job.item === 'cup' ? (
            <group position={[0, 0, m(-H / 2)]}>
              <mesh position={[0, 0, m(H / 2 - 2)]} rotation={[Math.PI / 2, 0, 0]} castShadow>
                <cylinderGeometry args={[m(18), m(14), m(H - 4), 24]} />
                <meshStandardMaterial color="#fbfaf7" roughness={0.6} />
              </mesh>
              <mesh position={[0, 0, m(H * 0.45)]} rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[m(17.4), m(16.2), m(14), 24, 1, true]} />
                <meshStandardMaterial color={job.block ?? '#b4530f'} roughness={0.7} />
              </mesh>
              <mesh position={[0, 0, m(H - 2)]} rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[m(19), m(19), m(4), 24]} />
                <meshStandardMaterial color="#3a2a20" roughness={0.5} />
              </mesh>
            </group>
          ) : job.item === 'ball' ? (
            <mesh castShadow>
              <sphereGeometry args={[m(H / 2), 20, 14]} />
              <meshPhysicalMaterial color={job.block ?? '#d8331f'} roughness={0.3} clearcoat={0.8} />
            </mesh>
          ) : (
            <RBox size={[H, H, H]} radius={1.5}>
              <meshStandardMaterial color={job.block ?? '#2f5be7'} roughness={0.55} />
            </RBox>
          )}
        </group>
        {children}
      </group>
      <Blob at={tableAt} w={tw} d={td} k={0.3} />
    </Place>
  );
}

/* --- myAGV on its route -------------------------------------------------------------------- */

/** The myAGV model, its materials (dark shell, rubber wheels) and a way to turn its wheels. */
function useAgvBody() {
  const { scene } = useGLTF(AGV_URL, DRACO);
  const body = useMemo(() => {
    const root = scene.clone(true);
    const mats = {
      rubber: new MeshStandardMaterial({ color: '#2a2e35', roughness: 0.78 }),
      shell: new MeshStandardMaterial({ color: '#23272e', roughness: 0.32, metalness: 0.55 }),
      laser: new MeshStandardMaterial({ color: '#1d2026', roughness: 0.3, metalness: 0.3 }),
    };
    const wheels: { node: Object3D; base: number }[] = [];
    root.traverse((o) => {
      if (o.name.startsWith('wheel_')) wheels.push({ node: o, base: o.rotation.y });
      const mesh = o as Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = mesh.receiveShadow = true;
      let wheel = false;
      for (let p: Object3D | null = o; p; p = p.parent) if (p.name.startsWith('wheel_')) wheel = true;
      mesh.material = wheel ? mats.rubber : o.name.startsWith('laser') ? mats.laser : mats.shell;
    });
    return {
      root,
      mats,
      /** Turns the wheels to `a` rad. */
      roll(a: number) {
        for (const w of wheels) w.node.rotation.y = w.base + a;
      },
    };
  }, [scene]);
  useEffect(() => () => Object.values(body.mats).forEach((x) => x.dispose()), [body]);
  return body;
}

/** The official myAGV (2023) driving a closed route at `speed` mm/s, wheels turning, its LED bar lit; `cargo` rides on top. */
export function RouteAgv({ route, speed = 120, phase = 0, cargo, led = '#1fae66' }: { route: readonly Xy[]; speed?: number; phase?: number; cargo?: ReactNode; led?: string }) {
  const path = useMemo(() => loopPath(route), [route]);
  const body = useAgvBody();
  const g = useRef<Group>(null);
  const yaw = useRef<number | null>(null);
  const clock = useAmbientClock(phase);
  useFrame((_, dt) => {
    const t = clock.tick(dt);
    if (t === null) return;
    const s = t * speed;
    const p = path.at(s);
    const ahead = path.at(s + 60);
    const want = Math.atan2(ahead.y - p.y, ahead.x - p.x);
    yaw.current = yaw.current === null ? want : turnToward(yaw.current, want, dt * 6);
    const o = g.current;
    if (o) {
      o.position.set(m(p.x), m(p.y), 0);
      o.rotation.z = yaw.current;
    }
    // Wheel radius ~ 32 mm.
    body.roll(s / 32);
  });
  return (
    <group ref={g}>
      <primitive object={body.root} />
      <mesh position={[m(-150), 0, m(AGV_TOP_MM + 2)]}>
        <boxGeometry args={[m(12), m(110), m(3)]} />
        <meshBasicMaterial color={led} toneMapped={false} />
      </mesh>
      {cargo && <group position={[0, 0, m(140)]}>{cargo}</group>}
      <Blob at={[0, 0]} w={320} d={250} k={0.32} />
    </group>
  );
}

/**
 * A myAGV standing still with something on its back (a mobile manipulator's arm stands on it in the
 * cell itself): `z` is where its wheels touch the floor, mm.
 */
export function ParkedAgv({ at = [0, 0], z = 0, yaw = 0, led = '#1fae66' }: { at?: Xy; z?: number; yaw?: number; led?: string }) {
  const body = useAgvBody();
  return (
    <Place at={at} yaw={yaw} z={z}>
      <primitive object={body.root} />
      <mesh position={[m(-150), 0, m(AGV_TOP_MM + 2)]}>
        <boxGeometry args={[m(12), m(110), m(3)]} />
        <meshBasicMaterial color={led} toneMapped={false} />
      </mesh>
      <Blob at={[0, 0]} w={320} d={250} k={0.32} />
    </Place>
  );
}

/* --- a belt with boxes going by ------------------------------------------------------------ */

/**
 * The cell's belt conveyor (ConveyorCell's model) set down elsewhere, running: its belt scrolls and
 * boxes ride it from the in-feed end to the out-feed end, then start again.
 */
export function RunningBelt({ at, yaw = 0, belt, speed = 60, boxes = ['#c8925a', '#b9824d', '#d2a06a'], gap = 170 }: { at: Xy; yaw?: number; belt: BeltGeometry; speed?: number; boxes?: readonly string[]; gap?: number }) {
  const tex = useMemo(() => {
    const t = beltTex([1, (belt.yIn - belt.yOut + 44) / 70]).clone();
    t.needsUpdate = true;
    return t;
  }, [belt.yIn, belt.yOut]);
  useEffect(() => () => tex.dispose(), [tex]);
  const refs = useRef<(Group | null)[]>([]);
  const len = belt.yIn - belt.yOut;
  const n = Math.max(1, Math.floor(len / gap));
  const clock = useAmbientClock();
  useFrame((_, dt) => {
    const t = clock.tick(dt);
    if (t === null) return;
    scroll(tex, (t * speed) / 70);
    refs.current.forEach((r, i) => {
      if (!r) return;
      const d = (t * speed + i * gap) % (n * gap);
      r.visible = d < len;
      r.position.set(m(belt.x), m(belt.yIn - d), m(belt.top + 20));
    });
  });
  return (
    <Place at={at} yaw={yaw}>
      <BeltConveyor tex={tex} belt={belt} />
      {Array.from({ length: n }, (_, i) => (
        <group
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
        >
          <CardBox size={[40, 40, 40]} color={boxes[i % boxes.length]} />
        </group>
      ))}
      <Blob at={[belt.x, (belt.yIn + belt.yOut) / 2]} w={belt.width + 40} d={len + 80} k={0.25} />
    </Place>
  );
}

/* --- lamps, fans, screens ------------------------------------------------------------------ */

/** One lamp segment of a signal tower: glows when `lit(t)` says so. */
function Lamp({ color, z, lit, phase }: { color: string; z: number; lit: (t: number) => number; phase: number }) {
  const mat = useRef<MeshStandardMaterial>(null);
  const dim = useMemo(() => '#' + new Color(color).multiplyScalar(0.35).getHexString(), [color]);
  const clock = useAmbientClock(phase);
  useFrame((_, dt) => {
    const t = clock.tick(dt);
    if (t === null || !mat.current) return;
    mat.current.emissiveIntensity = 0.08 + 1.6 * lit(t);
  });
  return (
    <mesh position={[0, 0, m(z)]} rotation={[Math.PI / 2, 0, 0]}>
      <cylinderGeometry args={[m(12), m(12), m(17), 24]} />
      <meshStandardMaterial ref={mat} color={dim} emissive={color} emissiveIntensity={0} roughness={0.3} toneMapped={false} />
    </mesh>
  );
}

/** A signal tower on a pole: red, amber, green; `mode` 'run' (green, amber blinks now and then) or 'wait' (amber blinking). */
export function SignalTower({ at, h = 220, mode = 'run', phase = 0 }: { at: Xy; h?: number; mode?: 'run' | 'wait'; phase?: number }) {
  const lamps = [
    { color: '#22c55e', lit: (t: number) => (mode === 'run' ? 1 : t % 9 < 0.1 ? 1 : 0) },
    { color: '#ffb020', lit: (t: number) => (mode === 'wait' ? (t % 1 < 0.5 ? 1 : 0) : t % 9 < 1.2 && t % 0.6 < 0.3 ? 1 : 0) },
    { color: '#ff3b30', lit: () => 0 },
  ];
  return (
    <Place at={at}>
      <mesh position={[0, 0, m(4)]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[m(22), m(24), m(8), 24]} />
        <meshStandardMaterial color="#2b3038" roughness={0.5} />
      </mesh>
      <mesh position={[0, 0, m(h / 2)]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[m(4), m(4), m(h), 12]} />
        <meshStandardMaterial color="#aeb6bf" metalness={0.8} roughness={0.3} />
      </mesh>
      {lamps.map((l, i) => (
        <Lamp key={i} color={l.color} z={h + 10 + i * 19} lit={l.lit} phase={phase} />
      ))}
      <mesh position={[0, 0, m(h + 10 + 3 * 19 - 4)]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[m(12.5), m(12.5), m(6), 24]} />
        <meshStandardMaterial color="#2b3038" roughness={0.5} />
      </mesh>
      <Blob at={[0, 0]} w={60} d={60} />
    </Place>
  );
}

/** A small rotating beacon (an AGV crossing, a warning): a cap whose light sweeps round. */
export function Beacon({ at, z = 0, color = '#ffb020', phase = 0 }: { at: Xy; z?: number; color?: string; phase?: number }) {
  const spin = useRef<Group>(null);
  const clock = useAmbientClock(phase);
  useFrame((_, dt) => {
    const t = clock.tick(dt);
    if (t === null) return;
    if (spin.current) spin.current.rotation.z = t * 6;
  });
  return (
    <Place at={at} z={z}>
      <mesh position={[0, 0, m(6)]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[m(16), m(18), m(12), 20]} />
        <meshStandardMaterial color="#2b3038" roughness={0.5} />
      </mesh>
      <mesh position={[0, 0, m(24)]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[m(13), m(14), m(24), 20]} />
        <meshStandardMaterial color={color} transparent opacity={0.55} roughness={0.1} emissive={color} emissiveIntensity={0.4} />
      </mesh>
      <group ref={spin} position={[0, 0, m(24)]}>
        <mesh position={[m(6), 0, 0]}>
          <boxGeometry args={[m(10), m(14), m(16)]} />
          <meshBasicMaterial color={color} toneMapped={false} />
        </mesh>
      </group>
    </Place>
  );
}

/** Blades turning in a ring (a wall fan, a cooler), facing +x of its group. */
export function Fan({ at, z, r = 60, yaw = 0, rps = 2.5, color = '#d9dde2' }: { at: Xy; z: number; r?: number; yaw?: number; rps?: number; color?: string }) {
  const rot = useRef<Group>(null);
  const clock = useAmbientClock();
  useFrame((_, dt) => {
    const t = clock.tick(dt);
    if (t === null) return;
    if (rot.current) rot.current.rotation.x = t * rps * Math.PI * 2;
  });
  return (
    <Place at={at} yaw={yaw} z={z}>
      <mesh rotation={[0, Math.PI / 2, 0]}>
        <torusGeometry args={[m(r), m(5), 8, 40]} />
        <meshStandardMaterial color={color} roughness={0.4} metalness={0.4} />
      </mesh>
      <group ref={rot}>
        {[0, 1, 2, 3, 4].map((k) => (
          <group key={k} rotation={[(k * Math.PI * 2) / 5, 0, 0]}>
            <mesh position={[m(-4), 0, m(r * 0.5)]} rotation={[0, 0.35, 0]}>
              <boxGeometry args={[m(2), m(r * 0.34), m(r * 0.62)]} />
              <meshStandardMaterial color="#5b6470" roughness={0.5} side={DoubleSide} />
            </mesh>
          </group>
        ))}
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[m(r * 0.18), m(r * 0.18), m(14), 16]} />
          <meshStandardMaterial color="#3a414b" roughness={0.4} />
        </mesh>
      </group>
    </Place>
  );
}

export type ScreenKind = 'line' | 'vision' | 'plot' | 'log' | 'orders';

/** What a monitor shows at time t (a 320 × 200 canvas). */
function drawScreen(g: CanvasRenderingContext2D, kind: ScreenKind, t: number, accent: string, title: string) {
  const W = 320;
  const H = 200;
  g.fillStyle = '#0f1620';
  g.fillRect(0, 0, W, H);
  g.fillStyle = '#1b2633';
  g.fillRect(0, 0, W, 26);
  g.fillStyle = accent;
  g.fillRect(0, 24, W, 2);
  g.font = '700 15px Pretendard, system-ui, sans-serif';
  g.fillStyle = '#e6ebf2';
  g.textBaseline = 'middle';
  g.fillText(title, 10, 13);
  g.fillStyle = '#22c55e';
  g.beginPath();
  g.arc(W - 14, 13, 5, 0, Math.PI * 2);
  g.fill();
  if (kind === 'line') {
    // Line dashboard: output count, rate bars, a moving trend.
    const count = 1200 + Math.floor(t * 0.8);
    g.font = '800 34px Pretendard, system-ui, sans-serif';
    g.fillStyle = '#ffffff';
    g.fillText(String(count), 12, 60);
    g.font = '600 12px Pretendard, system-ui, sans-serif';
    g.fillStyle = '#9fb0c3';
    g.fillText('오늘 생산 (개)', 14, 86);
    ['가동률', '품질', '속도'].forEach((label, i) => {
      const v = 0.82 + 0.1 * Math.sin(t * 0.4 + i * 2);
      g.fillStyle = '#9fb0c3';
      g.fillText(label, 170, 46 + i * 22);
      g.fillStyle = '#263445';
      g.fillRect(212, 40 + i * 22, 96, 12);
      g.fillStyle = i === 1 ? '#22c55e' : accent;
      g.fillRect(212, 40 + i * 22, 96 * v, 12);
    });
    g.strokeStyle = accent;
    g.lineWidth = 2;
    g.beginPath();
    for (let x = 0; x <= 300; x += 6) g.lineTo(10 + x, 160 - 22 * Math.sin((x + t * 40) * 0.03) - 10 * Math.sin((x + t * 25) * 0.11));
    g.stroke();
  } else if (kind === 'plot') {
    // An instrument trace: grid, a peak travelling across, the reading.
    g.strokeStyle = '#223042';
    g.lineWidth = 1;
    for (let x = 10; x < W; x += 30) {
      g.beginPath();
      g.moveTo(x, 34);
      g.lineTo(x, H - 10);
      g.stroke();
    }
    for (let y = 40; y < H; y += 30) {
      g.beginPath();
      g.moveTo(10, y);
      g.lineTo(W - 10, y);
      g.stroke();
    }
    g.strokeStyle = accent;
    g.lineWidth = 2.2;
    g.beginPath();
    const c = ((t * 30) % 360) - 20;
    for (let x = 10; x <= W - 10; x += 3) g.lineTo(x, H - 24 - 110 * Math.exp(-(((x - c) / 18) ** 2)) - 6 * Math.sin(x * 0.2 + t));
    g.stroke();
    g.font = '700 14px Pretendard, system-ui, sans-serif';
    g.fillStyle = '#ffffff';
    g.fillText(`OD ${(0.42 + 0.05 * Math.sin(t * 0.5)).toFixed(3)}`, W - 110, 46);
  } else if (kind === 'vision') {
    // A camera picture: a board with blocks, the detector's boxes on them.
    g.fillStyle = '#d9dee4';
    g.fillRect(10, 34, W - 20, H - 44);
    const items = [
      ['#d23c3c', 0],
      ['#2f5be7', 1.7],
      ['#12935f', 3.4],
      ['#e0a020', 5.1],
    ] as const;
    items.forEach(([col, ph], i) => {
      const x = 40 + ((i * 70 + t * 18) % 250);
      const y = 70 + 40 * Math.sin(t * 0.3 + ph);
      g.fillStyle = col;
      g.fillRect(x, y, 26, 26);
      g.strokeStyle = '#22c55e';
      g.lineWidth = 2;
      g.strokeRect(x - 5, y - 5, 36, 36);
      g.fillStyle = '#22c55e';
      g.fillRect(x - 5, y - 19, 44, 14);
      g.fillStyle = '#05130b';
      g.font = '700 10px Pretendard, system-ui, sans-serif';
      g.fillText((0.9 + 0.08 * Math.sin(t + i)).toFixed(2), x - 2, y - 12);
    });
  } else if (kind === 'log') {
    g.font = '600 12px ui-monospace, Menlo, Consolas, monospace';
    const first = Math.floor(t * 1.5);
    for (let i = 0; i < 11; i += 1) {
      const n = first + i;
      const ok = n % 7 !== 3;
      g.fillStyle = ok ? '#9fb0c3' : '#ffb020';
      g.fillText(`[${String(10 + (n % 50)).padStart(2, '0')}:${String((n * 7) % 60).padStart(2, '0')}] ${ok ? 'epoch' : 'eval '} ${n}  loss ${(0.9 / (1 + n * 0.05)).toFixed(3)}`, 10, 40 + i * 15);
    }
  } else {
    // A café order screen: numbers ready and being made.
    g.font = '700 13px Pretendard, system-ui, sans-serif';
    g.fillStyle = '#9fb0c3';
    g.fillText('준비 중', 18, 42);
    g.fillText('완료', 178, 42);
    const k = Math.floor(t / 4);
    g.font = '800 26px Pretendard, system-ui, sans-serif';
    for (let i = 0; i < 3; i += 1) {
      g.fillStyle = '#e6ebf2';
      g.fillText(String(100 + k + i + 2), 18, 76 + i * 36);
      g.fillStyle = accent;
      g.fillText(String(100 + k - i + 1), 178, 76 + i * 36);
    }
  }
}

/** A monitor on a stand (or on a wall: `stand` false) showing a picture that keeps changing. */
export function Monitor({ at, z = 0, yaw = 0, w = 160, kind, accent = '#2f5be7', title, stand = true, tilt = 0 }: { at: Xy; z?: number; yaw?: number; w?: number; kind: ScreenKind; accent?: string; title: string; stand?: boolean; tilt?: number }) {
  const h = (w * 200) / 320;
  const screen = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 320;
    c.height = 200;
    const tex = new CanvasTexture(c);
    tex.colorSpace = SRGBColorSpace;
    tex.anisotropy = 4;
    return {
      tex,
      draw(t: number) {
        drawScreen(c.getContext('2d')!, kind, t, accent, title);
        tex.needsUpdate = true;
      },
    };
  }, [kind, accent, title]);
  useEffect(() => () => screen.tex.dispose(), [screen]);
  const last = useRef(-1);
  const clock = useAmbientClock();
  useFrame((_, dt) => {
    const t = clock.tick(dt);
    if (t === null) return;
    // A few pictures a second is plenty for a screen in the background.
    if (last.current >= 0 && t - last.current < 0.2) return;
    last.current = t;
    screen.draw(t);
  });
  const lift = stand ? 70 + h / 2 : 0;
  return (
    <Place at={at} yaw={yaw} z={z}>
      {stand && (
        <>
          <RBox at={[0, 0, 3]} size={[70, 60, 6]} radius={3}>
            <meshStandardMaterial color="#2b3038" roughness={0.5} />
          </RBox>
          <RBox at={[-8, 0, 40]} size={[10, 26, 74]} radius={3}>
            <meshStandardMaterial color="#2b3038" roughness={0.5} />
          </RBox>
        </>
      )}
      <group position={[0, 0, m(lift)]} rotation={[0, tilt, 0]}>
        <RBox at={[0, 0, 0]} size={[10, w + 10, h + 10]} radius={3}>
          <meshStandardMaterial color="#1f2226" roughness={0.4} />
        </RBox>
        <mesh position={[m(5.2), 0, 0]} rotation={[Math.PI / 2, Math.PI / 2, 0]}>
          <planeGeometry args={[m(w), m(h)]} />
          <meshBasicMaterial map={screen.tex} toneMapped={false} />
        </mesh>
      </group>
    </Place>
  );
}

/* --- small motions ------------------------------------------------------------------------- */

/** Steam rising from a cup or a machine: a few soft puffs that grow and fade as they climb. */
export function Steam({ at, z, n = 6, rise = 70, r = 7, phase = 0 }: { at: Xy; z: number; n?: number; rise?: number; r?: number; phase?: number }) {
  const puffs = useMemo(() => Array.from({ length: n }, () => new MeshStandardMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false, roughness: 1 })), [n]);
  useEffect(() => () => puffs.forEach((p) => p.dispose()), [puffs]);
  const refs = useRef<(Mesh | null)[]>([]);
  const clock = useAmbientClock(phase);
  useFrame((_, dt) => {
    const t = clock.tick(dt);
    if (t === null) return;
    refs.current.forEach((o, i) => {
      if (!o) return;
      const k = ((t * 0.45 + i / n) % 1 + 1) % 1;
      o.position.set(m(Math.sin(t * 1.3 + i * 2.1) * 6 * k), m(Math.cos(t * 0.9 + i) * 4 * k), m(z + k * rise));
      const s = 0.6 + k * 1.6;
      o.scale.set(s, s, s);
      puffs[i].opacity = 0.32 * Math.sin(Math.PI * k);
    });
  });
  return (
    <Place at={at}>
      {puffs.map((mat, i) => (
        <mesh
          key={i}
          material={mat}
          ref={(el) => {
            refs.current[i] = el;
          }}
        >
          <sphereGeometry args={[m(r), 10, 8]} />
        </mesh>
      ))}
    </Place>
  );
}

/** Leaves stirring in moving air: tilts its children a little, slowly. */
export function Sway({ at, deg = 3, rate = 0.8, phase = 0, children }: { at: Xy; deg?: number; rate?: number; phase?: number; children: ReactNode }) {
  const g = useRef<Group>(null);
  const clock = useAmbientClock();
  useFrame((_, dt) => {
    const t = clock.tick(dt);
    if (t === null) return;
    const o = g.current;
    if (!o) return;
    const a = (deg * Math.PI) / 180;
    o.rotation.x = a * Math.sin(t * rate + phase);
    o.rotation.y = a * 0.6 * Math.sin(t * rate * 1.37 + phase * 2);
  });
  return (
    <group position={[m(at[0]), m(at[1]), 0]}>
      <group ref={g}>{children}</group>
    </group>
  );
}

/** Turns its children about the vertical at `rps` turns a second (a rotor, a stirrer bar, a turntable). */
export function Turn({ at, z = 0, rps = 1, children }: { at: Xy; z?: number; rps?: number; children: ReactNode }) {
  const g = useRef<Group>(null);
  const clock = useAmbientClock();
  useFrame((_, dt) => {
    const t = clock.tick(dt);
    if (t === null) return;
    if (g.current) g.current.rotation.z = t * rps * Math.PI * 2;
  });
  return (
    <group position={[m(at[0]), m(at[1]), m(z)]}>
      <group ref={g}>{children}</group>
    </group>
  );
}

const LED_COLORS = ['#22c55e', '#22c55e', '#38bdf8', '#ffb020'];

/** A panel of status LEDs (a server, an instrument), each blinking at its own pace; on the +x face of its group. */
export function Leds({ at, z, yaw = 0, cols = 4, rows = 8, pitch = 9, colors = LED_COLORS }: { at: Xy; z: number; yaw?: number; cols?: number; rows?: number; pitch?: number; colors?: readonly string[] }) {
  const panel = useMemo(() => {
    const leds = Array.from({ length: cols * rows }, (_, i) => {
      const c = colors[(i * 7 + (i >> 2)) % colors.length];
      return { mat: new MeshStandardMaterial({ color: '#111', emissive: c, emissiveIntensity: 1, toneMapped: false }), rate: 0.6 + ((i * 37) % 23) / 6, ph: (i * 1.7) % 6.28 };
    });
    return {
      leds,
      blink(t: number) {
        for (const l of leds) l.mat.emissiveIntensity = Math.sin(t * l.rate * 3 + l.ph) > -0.2 ? 1.4 : 0.05;
      },
    };
  }, [cols, rows, colors]);
  useEffect(() => () => panel.leds.forEach((l) => l.mat.dispose()), [panel]);
  const clock = useAmbientClock();
  useFrame((_, dt) => {
    const t = clock.tick(dt);
    if (t === null) return;
    panel.blink(t);
  });
  return (
    <Place at={at} yaw={yaw} z={z}>
      {panel.leds.map((l, i) => (
        <mesh key={i} position={[0, m((i % cols) * pitch - ((cols - 1) * pitch) / 2), m(Math.floor(i / cols) * pitch)]} material={l.mat}>
          <boxGeometry args={[m(1.5), m(3), m(3)]} />
        </mesh>
      ))}
    </Place>
  );
}
