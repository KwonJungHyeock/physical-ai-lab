'use client';

/**
 * What moves on the world map, so the city looks alive: cars in their lanes round the blocks and the
 * ring road, people on the pavements and the academy square, myAGVs and mobile manipulators (a
 * myAGV with a myCobot 280 on top) at work in the yards and the fields, drones over the AI lab, the
 * farm and the city, a ship sailing round the island, wind turbines turning, smoke from the
 * chimneys, boxes riding the conveyors, clouds drifting over. A place that is still locked keeps
 * its robots still (the traffic and the people move everywhere).
 *
 * Many-of-a-kind things (cars, people, conveyor boxes) are instanced and moved each frame.
 */

import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box3,
  BoxGeometry,
  CapsuleGeometry,
  Color,
  Euler,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  SphereGeometry,
  Vector3,
  type BufferGeometry,
  type Material,
  type Object3D,
} from 'three';

import type { SiteId } from '@/engine/education/park';
import { DEFAULT_ARM } from '@/engine/robot/arms';
import { buildChain } from '@/engine/robot/kinematics';
import { parseUrdf, type UrdfRobot } from '@/engine/robot/urdf';

import { buildArm, type GlbNodes } from '../../../simulator/stage/robotModel';
import { Ship } from './Features';
import { packUrl, type PackId } from './worldAssets';
import { LINES, SLAB_TOP, groundY, type WorldFeatures } from './worldLayout';
import { circleLoop, rectLoop, rows, run, type Route } from './worldPaths';

const DRACO = '/draco/';
const AGV_URL = '/robot/myagv/myagv2023.glb';
const ROAD_Y = 0.11;

const _m = new Matrix4();
const _t = new Matrix4();
const _q = new Quaternion();
const _e = new Euler();
const _p = new Vector3();
const _s = new Vector3();

/** A seeded random, so the city moves the same way every time it opens. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Mover {
  route: Route;
  /** Where along the route it starts, units. */
  s0: number;
  /** Units per second. */
  speed: number;
  y: number;
}

const poseOf = (m: Mover, t: number) => m.route.at(m.s0 + m.speed * t);

// ── Cars ──────────────────────────────────────────────────────────────────────

/** The meshes of one pack model with their transforms relative to the pack root. */
function parts(root: Object3D, model: string) {
  const holder = root.children.find((c) => c.name === model);
  const out: { geometry: BufferGeometry; material: Material | Material[]; rel: Matrix4 }[] = [];
  if (!holder) return out;
  root.updateMatrixWorld(true);
  holder.traverse((o) => {
    const m = o as Mesh;
    if (m.isMesh) out.push({ geometry: m.geometry, material: m.material, rel: m.matrixWorld.clone() });
  });
  return out;
}

/** One pack model, many copies, each following its mover. */
function MovingModels({ pack, model, movers, yaw = 0 }: { pack: PackId; model: string; movers: readonly Mover[]; yaw?: number }) {
  const { scene } = useGLTF(packUrl(pack));
  const meshes = useMemo(
    () =>
      parts(scene, model).map((p) => {
        const im = new InstancedMesh(p.geometry, p.material, movers.length);
        im.castShadow = true;
        im.receiveShadow = true;
        im.frustumCulled = false;
        im.userData.rel = p.rel;
        return im;
      }),
    [scene, model, movers.length],
  );
  useEffect(() => () => meshes.forEach((im) => im.dispose()), [meshes]);
  const group = useRef<Group>(null);
  useFrame(({ clock }) => {
    const ims = (group.current?.children ?? []) as InstancedMesh[];
    const t = clock.elapsedTime;
    movers.forEach((mv, i) => {
      const p = poseOf(mv, t);
      _m.compose(_p.set(p.x, mv.y, p.z), _q.setFromEuler(_e.set(0, p.rot + yaw, 0)), _s.set(1, 1, 1));
      for (const im of ims) im.setMatrixAt(i, _t.multiplyMatrices(_m, im.userData.rel as Matrix4));
    });
    for (const im of ims) im.instanceMatrix.needsUpdate = true;
  });
  return (
    <group ref={group}>
      {meshes.map((im, i) => (
        <primitive key={i} object={im} />
      ))}
    </group>
  );
}

const CARS = ['car_sedan', 'car_hatchback', 'car_taxi', 'car_stationwagon', 'car_police'] as const;

/** Cars round the ring road (both ways) and round each block, in the right-hand lane. */
function Traffic() {
  const byModel = useMemo(() => {
    const r = rng(7);
    const all: { model: string; mv: Mover }[] = [];
    const add = (route: Route, n: number, speed: number) => {
      for (let i = 0; i < n; i++) all.push({ model: CARS[Math.floor(r() * (CARS.length - 0.6))], mv: { route, s0: (i / n) * route.length + r() * 3, speed: speed * (0.9 + r() * 0.2), y: ROAD_Y } });
    };
    const lo = LINES[0];
    const hi = LINES[3];
    const c = (lo + hi) / 2;
    const h = (hi - lo) / 2;
    add(rectLoop(c, c, h - 0.45, h - 0.45, 3.2, true), 5, 2.6);
    add(rectLoop(c, c, h + 0.45, h + 0.45, 4.0, false), 5, 2.4);
    let k = 0;
    for (const bx of [-16, 0, 16])
      for (const bz of [-16, 0, 16]) {
        const cw = k++ % 2 === 0;
        add(rectLoop(bx, bz, cw ? 7.55 : 8.45, cw ? 7.55 : 8.45, 1.0, cw), bx === 0 && bz === 0 ? 2 : 1, 2.2);
      }
    const m = new Map<string, Mover[]>();
    for (const a of all) m.set(a.model, [...(m.get(a.model) ?? []), a.mv]);
    return [...m.entries()];
  }, []);
  return (
    <>
      {byModel.map(([model, movers]) => (
        <MovingModels key={model} pack="city" model={model} movers={movers} />
      ))}
      <MovingModels
        pack="cars"
        model="delivery"
        movers={[
          { route: rectLoop(0, 0, 24.45, 24.45, 4.0, false), s0: 30, speed: 2.3, y: ROAD_Y },
          { route: rectLoop(16, 16, 7.55, 7.55, 1.0, true), s0: 10, speed: 2.0, y: ROAD_Y },
        ]}
      />
      <MovingModels pack="cars" model="garbage-truck" movers={[{ route: rectLoop(0, 16, 8.45, 8.45, 1.0, false), s0: 5, speed: 1.8, y: ROAD_Y }]} />
      <MovingModels pack="cars" model="ambulance" movers={[{ route: rectLoop(16, -16, 7.55, 7.55, 1.0, true), s0: 12, speed: 2.8, y: ROAD_Y }]} />
    </>
  );
}

// ── People ────────────────────────────────────────────────────────────────────

const SHIRTS = ['#2f5be7', '#e0662b', '#3f9b3a', '#d23c6a', '#7a4fe0', '#e3a21a', '#0fa3b8', '#f4f4f2', '#3b4656', '#c23b3b'];
const SKIN = ['#f1c9a5', '#e0ac85', '#c68863', '#8d5a3b'];

/** Little people (a capsule and a head), walking their routes with a bob in their step. */
function Walkers({ movers }: { movers: readonly Mover[] }) {
  const { body, head } = useMemo(() => {
    const r = rng(11);
    const bodyGeo = new CapsuleGeometry(0.075, 0.2, 3, 8);
    bodyGeo.translate(0, 0.17, 0);
    const headGeo = new SphereGeometry(0.065, 10, 8);
    headGeo.translate(0, 0.4, 0);
    const body = new InstancedMesh(bodyGeo, new MeshStandardMaterial({ roughness: 0.8 }), movers.length);
    const head = new InstancedMesh(headGeo, new MeshStandardMaterial({ roughness: 0.7 }), movers.length);
    const c = new Color();
    movers.forEach((_, i) => {
      body.setColorAt(i, c.set(SHIRTS[Math.floor(r() * SHIRTS.length)]));
      head.setColorAt(i, c.set(SKIN[Math.floor(r() * SKIN.length)]));
    });
    for (const m of [body, head]) {
      m.castShadow = true;
      m.frustumCulled = false;
    }
    return { body, head };
  }, [movers]);
  useEffect(
    () => () => {
      body.dispose();
      head.dispose();
    },
    [body, head],
  );
  const bodyRef = useRef<InstancedMesh>(null);
  const headRef = useRef<InstancedMesh>(null);
  useFrame(({ clock }) => {
    const b = bodyRef.current;
    const h = headRef.current;
    if (!b || !h) return;
    const t = clock.elapsedTime;
    movers.forEach((mv, i) => {
      const p = poseOf(mv, t);
      const bob = mv.speed > 0 ? Math.abs(Math.sin((mv.s0 + t) * 7)) * 0.025 : 0;
      _m.compose(_p.set(p.x, mv.y + bob, p.z), _q.setFromEuler(_e.set(0, p.rot, 0)), _s.set(1, 1, 1));
      b.setMatrixAt(i, _m);
      h.setMatrixAt(i, _m);
    });
    b.instanceMatrix.needsUpdate = true;
    h.instanceMatrix.needsUpdate = true;
  });
  return (
    <>
      <primitive ref={bodyRef} object={body} />
      <primitive ref={headRef} object={head} />
    </>
  );
}

function people(f: WorldFeatures): Mover[] {
  const r = rng(23);
  const out: Mover[] = [];
  const walk = (route: Route, n: number, y: number, speed = 0.45) => {
    for (let i = 0; i < n; i++) out.push({ route, s0: r() * route.length, speed: speed * (0.75 + r() * 0.5), y });
  };
  for (const b of f.slabs) {
    walk(rectLoop(b.x, b.z, 6.55, 6.55, 0.4, true), 3, SLAB_TOP);
    walk(rectLoop(b.x, b.z, 6.7, 6.7, 0.4, false), 2, SLAB_TOP);
  }
  walk(circleLoop(0, 0.8, 2.45, true), 5, SLAB_TOP + 0.08, 0.35);
  walk(circleLoop(0, 0.8, 2.75, false), 4, SLAB_TOP + 0.08, 0.35);
  walk(rectLoop(-15, -14.6, 2.2, 1.6, 0.6, true), 4, SLAB_TOP, 0.3);
  walk(run([[-22, 13.4], [-12, 13.4]]), 2, 0.05, 0.4);
  walk(run([[-21.5, 18.6], [-13, 18.6]]), 1, 0.05, 0.35);
  walk(run([[27, -4], [27, 9]]), 2, 0.36, 0.5);
  // A few standing about: watching the statue, at the café, on the quay.
  for (const [x, z, y] of [
    [-1.6, 3.4, SLAB_TOP + 0.08],
    [1.7, 3.2, SLAB_TOP + 0.08],
    [-14.2, -13.6, SLAB_TOP],
    [-13.0, -14.4, SLAB_TOP],
    [17.6, 3.0, SLAB_TOP],
    [-6, 25.6, 0.05],
  ] as const)
    out.push({ route: run([[x, z], [x + 0.01, z + 0.01]]), s0: 0, speed: 0, y });
  return out;
}

// ── Robots on the move ────────────────────────────────────────────────────────

/** The myAGV model (z up as authored → y up), dark base and white body, about `s` times real size. */
function useAgv() {
  const { scene } = useGLTF(AGV_URL, DRACO);
  return useMemo(() => {
    const dark = new MeshStandardMaterial({ color: '#2a3039', roughness: 0.45 });
    const white = new MeshStandardMaterial({ color: '#f2f4f7', roughness: 0.4 });
    return () => {
      const o = scene.clone(true);
      o.traverse((c) => {
        const m = c as Mesh;
        if (!m.isMesh) return;
        let base = false;
        for (let p: Object3D | null = c; p; p = p.parent) if (p.name.startsWith('base')) base = true;
        m.material = base ? dark : white;
        m.castShadow = m.receiveShadow = true;
      });
      const g = new Group();
      o.rotation.x = -Math.PI / 2;
      g.add(o);
      return g;
    };
  }, [scene]);
}

function useArmParts(): { robot: UrdfRobot; nodes: GlbNodes } | null {
  const [robot, setRobot] = useState<UrdfRobot | null>(null);
  useEffect(() => {
    void fetch(DEFAULT_ARM.urdf)
      .then((res) => res.text())
      .then((t) => setRobot(parseUrdf(t)));
  }, []);
  const gltfs = useGLTF(DEFAULT_ARM.glbs as string[], DRACO) as unknown as { nodes: GlbNodes }[];
  const nodes = useMemo(() => Object.assign({}, ...gltfs.map((g) => g.nodes)) as GlbNodes, [gltfs]);
  return robot ? { robot, nodes } : null;
}

interface Rover {
  district: SiteId;
  route: Route;
  speed: number;
  y: number;
  /** Scale of the myAGV (and its arm). */
  s: number;
  /** A myCobot 280 on top: a mobile manipulator. */
  arm?: boolean;
  /** Stops at the ends of a back-and-forth run to work, s. */
  phase: number;
}

/** A myAGV driving its route; with `arm`, a myCobot 280 on its back reaching down and up as it goes. */
function RoverView({ rv, agv, arm, still }: { rv: Rover; agv: () => Group; arm: { robot: UrdfRobot; nodes: GlbNodes } | null; still: boolean }) {
  const body = useMemo(() => agv(), [agv]);
  const top = useMemo(() => new Box3().setFromObject(body).max.y, [body]);
  const a = useMemo(() => {
    if (!rv.arm || !arm) return null;
    const m = buildArm(arm.robot, buildChain(arm.robot), arm.nodes, { dark: DEFAULT_ARM.dark, flange: DEFAULT_ARM.flange, textures: DEFAULT_ARM.textures, flangeLink: DEFAULT_ARM.flangeLink });
    m.root.traverse((c) => {
      if ((c as Mesh).isMesh) c.castShadow = true;
    });
    return m;
  }, [rv.arm, arm]);
  const g = useRef<Group>(null);
  const q = useRef([0, 0, 0, 0, 0, 0]);
  useFrame(({ clock }) => {
    if (still || !g.current) return;
    const t = clock.elapsedTime;
    const p = rv.route.at(rv.phase * 7 + rv.speed * t);
    g.current.position.set(p.x, rv.y, p.z);
    g.current.rotation.y = p.rot - Math.PI / 2;
    if (a) {
      const w = t * 0.9 + rv.phase;
      q.current[0] = 60 * Math.sin(w * 0.5);
      q.current[1] = -30 + 25 * Math.sin(w);
      q.current[2] = -60 + 30 * Math.sin(w + 1);
      q.current[3] = -20 * Math.sin(w + 2);
      a.setAngles(q.current);
    }
  });
  return (
    <group ref={g} position={[rv.route.at(rv.phase * 7).x, rv.y, rv.route.at(rv.phase * 7).z]}>
      <group scale={rv.s}>
        <primitive object={body} />
        {a && (
          <group position={[0.02, top, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <primitive object={a.root} />
          </group>
        )}
      </group>
    </group>
  );
}

function rovers(): Rover[] {
  const Y = SLAB_TOP + 0.02;
  return [
    // 스마트팩토리: an AGV feeding the line, a mobile manipulator bringing parts round the halls.
    { district: 'factory', route: rectLoop(16.2, 1.2, 4.6, 1.0, 0.6, true), speed: 0.7, y: Y, s: 3.2, phase: 0 },
    { district: 'factory', route: run([[12, 5.2], [19.5, 5.2]]), speed: 0.5, y: Y, s: 3.2, arm: true, phase: 1 },
    // 물류 허브: AGVs carrying between the warehouse door and the container rows.
    { district: 'logistics', route: rectLoop(17, 17.6, 3.6, 1.2, 0.6, false), speed: 0.8, y: Y, s: 3.2, phase: 2 },
    { district: 'logistics', route: run([[14, 21.4], [20.6, 21.4]]), speed: 0.6, y: Y, s: 3.2, phase: 3 },
    // 피지컬 AI 연구소: a mobile manipulator circling the test pad.
    { district: 'ai', route: circleLoop(-14.6, 2.2, 3.1, true), speed: 0.5, y: Y, s: 3.2, arm: true, phase: 4 },
    // 바이오·헬스케어: a delivery robot between the hospital and the labs.
    { district: 'lab', route: run([[12.6, -12.6], [19.4, -12.6], [19.4, -15.6]]), speed: 0.5, y: Y, s: 3.0, phase: 5 },
    // 스마트시티: a delivery robot on the pavement.
    { district: 'cafe', route: rectLoop(-16, -16, 6.2, 6.2, 0.5, false), speed: 0.6, y: Y, s: 2.8, phase: 6 },
    // 스마트팜: a harvesting mobile manipulator going up and down the rows.
    { district: 'farm', route: rows(-21.2, -15.6, 12.4, 1.7, 3), speed: 0.35, y: 0.06, s: 3.2, arm: true, phase: 7 },
    // 에너지·자원순환: an AGV taking sorted bins to the trucks.
    { district: 'energy', route: run([[-4.4, 12.6], [3.8, 12.6]]), speed: 0.6, y: Y, s: 3.0, phase: 8 },
  ];
}

function Rovers({ still }: { still: ReadonlySet<SiteId> }) {
  const agv = useAgv();
  const arm = useArmParts();
  const list = useMemo(() => rovers(), []);
  return (
    <>
      {list.map((rv, i) => (
        <RoverView key={i} rv={rv} agv={agv} arm={arm} still={still.has(rv.district)} />
      ))}
    </>
  );
}

// ── Drones ────────────────────────────────────────────────────────────────────

const droneBody = new MeshStandardMaterial({ color: '#2a3039', roughness: 0.4 });
const droneArm = new MeshStandardMaterial({ color: '#f2f4f7', roughness: 0.5 });
const droneLight = new MeshStandardMaterial({ color: '#ff5a4a', emissive: '#ff3b2f', emissiveIntensity: 3 });

function Drone({ route, speed, y, phase, parcel }: { route: Route; speed: number; y: number; phase: number; parcel?: string }) {
  const g = useRef<Group>(null);
  const props = useRef<Mesh[]>([]);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const p = route.at(phase + speed * t);
    if (!g.current) return;
    g.current.position.set(p.x, y + Math.sin(t * 1.7 + phase) * 0.25, p.z);
    g.current.rotation.y = p.rot;
    g.current.rotation.x = 0.12;
    for (const m of props.current) if (m) m.rotation.y = t * 40;
  });
  return (
    <group ref={g}>
      <mesh material={droneBody} castShadow>
        <boxGeometry args={[0.32, 0.1, 0.32]} />
      </mesh>
      {[45, 135, 225, 315].map((a, i) => {
        const r = (a * Math.PI) / 180;
        const x = Math.cos(r) * 0.32;
        const z = Math.sin(r) * 0.32;
        return (
          <group key={a}>
            <mesh position={[x / 2, 0, z / 2]} rotation={[0, -r, 0]} material={droneArm}>
              <boxGeometry args={[0.34, 0.04, 0.05]} />
            </mesh>
            <mesh
              ref={(m) => {
                if (m) props.current[i] = m;
              }}
              position={[x, 0.07, z]}
              material={droneArm}
            >
              <boxGeometry args={[0.3, 0.01, 0.04]} />
            </mesh>
          </group>
        );
      })}
      <mesh position={[0, 0.06, -0.17]} material={droneLight}>
        <sphereGeometry args={[0.03, 8, 6]} />
      </mesh>
      {parcel && (
        <mesh position={[0, -0.16, 0]} castShadow>
          <boxGeometry args={[0.18, 0.16, 0.18]} />
          <meshStandardMaterial color={parcel} roughness={0.8} />
        </mesh>
      )}
    </group>
  );
}

function Drones() {
  return (
    <>
      <Drone route={circleLoop(-16, 0, 4.2, true)} speed={1.3} y={5.2} phase={0} />
      <Drone route={rows(-31, -24, -4, 4.5, 5)} speed={1.6} y={3.6} phase={3} />
      <Drone route={run([[-14, -15], [16, -15], [16, 14]])} speed={2.2} y={7.5} phase={9} parcel="#c9a26b" />
      <Drone route={run([[2, 14], [28, 2]])} speed={2.0} y={6.2} phase={20} parcel="#2f6fe7" />
    </>
  );
}

// ── Sea, wind, smoke, conveyors, clouds ───────────────────────────────────────

function Sailing() {
  const g = useRef<Group>(null);
  const route = useMemo(() => circleLoop(0, 0, 52, false, 96), []);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const p = route.at(t * 1.4 + 60);
    if (!g.current) return;
    g.current.position.set(p.x, -1.0 + Math.sin(t * 0.9) * 0.08, p.z);
    g.current.rotation.set(Math.sin(t * 0.7) * 0.02, p.rot + Math.PI, Math.sin(t * 0.8) * 0.03);
  });
  return (
    <group ref={g} scale={0.75}>
      <Ship boxes={4} />
    </group>
  );
}

function Turbines({ f }: { f: WorldFeatures }) {
  const { scene } = useGLTF(packUrl('space'));
  const list = useMemo(
    () =>
      f.turbines.map((t) => {
        const o = scene.children.find((c) => c.name === 'windturbine_tall')!.clone(true);
        o.traverse((c) => {
          if ((c as Mesh).isMesh) c.castShadow = c.receiveShadow = true;
        });
        const fan = o.getObjectByName('windturbine_tall_fan') ?? null;
        return { o, fan, t };
      }),
    [scene, f.turbines],
  );
  useFrame((_, dt) => {
    list.forEach(({ fan }, i) => {
      if (fan) fan.rotation.z += dt * (1.2 + i * 0.13);
    });
  });
  return (
    <>
      {list.map(({ o, t }, i) => (
        <primitive key={i} object={o} position={[t.x, groundY(f, t.x, t.z) - 0.1, t.z]} rotation={[0, (t.rot * Math.PI) / 180, 0]} scale={t.s} />
      ))}
    </>
  );
}

const PUFF = new SphereGeometry(1, 10, 8);

/** Soft puffs rising from a chimney top, growing and fading. */
function Smoke({ x, y, z }: { x: number; y: number; z: number }) {
  const puffs = useMemo(() => Array.from({ length: 6 }, () => new MeshStandardMaterial({ color: '#f2f3f5', roughness: 1, transparent: true, depthWrite: false })), []);
  const refs = useRef<Mesh[]>([]);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    refs.current.forEach((m, i) => {
      if (!m) return;
      const k = ((t * 0.18 + i / 6) % 1 + 1) % 1;
      m.position.set(x + k * 1.2, y + k * 3.2, z - k * 0.4);
      m.scale.setScalar(0.18 + k * 0.6);
      (m.material as MeshStandardMaterial).opacity = 0.75 * (1 - k);
    });
  });
  return (
    <>
      {puffs.map((mt, i) => (
        <mesh
          key={i}
          ref={(m) => {
            if (m) refs.current[i] = m;
          }}
          geometry={PUFF}
          material={mt}
        />
      ))}
    </>
  );
}

const BELT = new MeshStandardMaterial({ color: '#3a3f47', roughness: 0.6 });
const FRAME = new MeshStandardMaterial({ color: '#c9ced6', roughness: 0.5, metalness: 0.2 });

/** A conveyor on legs with boxes riding it end to end. */
function Conveyor({ x, z, len, rot }: { x: number; z: number; len: number; rot: number }) {
  const n = Math.max(3, Math.round(len / 1.1));
  const boxes = useMemo(() => {
    const im = new InstancedMesh(new BoxGeometry(0.32, 0.26, 0.32), new MeshStandardMaterial({ color: '#c9a26b', roughness: 0.85 }), n);
    im.castShadow = true;
    im.frustumCulled = false;
    return im;
  }, [n]);
  useEffect(() => () => boxes.dispose(), [boxes]);
  const ref = useRef<InstancedMesh>(null);
  useFrame(({ clock }) => {
    const b = ref.current;
    if (!b) return;
    const t = clock.elapsedTime;
    for (let i = 0; i < n; i++) {
      const k = ((t * 0.45) / len + i / n) % 1;
      _m.compose(_p.set(-len / 2 + k * len, 0.42, 0), _q.identity(), _s.set(1, 1, 1));
      b.setMatrixAt(i, _m);
    }
    b.instanceMatrix.needsUpdate = true;
  });
  return (
    <group position={[x, SLAB_TOP, z]} rotation={[0, (rot * Math.PI) / 180, 0]}>
      <mesh position={[0, 0.27, 0]} material={BELT} castShadow receiveShadow>
        <boxGeometry args={[len, 0.06, 0.5]} />
      </mesh>
      <mesh position={[0, 0.22, 0]} material={FRAME} castShadow>
        <boxGeometry args={[len + 0.1, 0.08, 0.6]} />
      </mesh>
      {[-len / 2 + 0.2, 0, len / 2 - 0.2].map((lx) => (
        <mesh key={lx} position={[lx, 0.1, 0]} material={FRAME}>
          <boxGeometry args={[0.08, 0.2, 0.5]} />
        </mesh>
      ))}
      <primitive ref={ref} object={boxes} />
    </group>
  );
}

const CLOUD = new MeshStandardMaterial({ color: '#ffffff', roughness: 1, transparent: true, opacity: 0.8, depthWrite: false });

function Clouds() {
  const list = useMemo(() => {
    const r = rng(31);
    // Small clouds over the sea round the island (behind and beside it, never between the camera and the city).
    return Array.from({ length: 6 }, (_, i) => ({
      x0: -80 + i * 30 + r() * 10,
      z: i % 2 === 0 ? -48 - r() * 10 : -20 - r() * 30,
      y: 9 + r() * 4,
      s: 0.9 + r() * 0.8,
      blobs: Array.from({ length: 4 + Math.floor(r() * 3) }, () => [r() * 3 - 1.5, r() * 0.6, r() * 2 - 1, 0.9 + r() * 0.9] as const),
    }));
  }, []);
  const refs = useRef<Group[]>([]);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    list.forEach((c, i) => {
      const g = refs.current[i];
      if (g) g.position.x = ((((c.x0 + t * 0.8 + 90) % 180) + 180) % 180) - 90;
    });
  });
  return (
    <>
      {list.map((c, i) => (
        <group
          key={i}
          ref={(g) => {
            if (g) refs.current[i] = g;
          }}
          position={[c.x0, c.y, c.z]}
          scale={[c.s * 1.6, c.s * 0.7, c.s]}
        >
          {c.blobs.map(([bx, by, bz, br], k) => (
            <mesh key={k} geometry={PUFF} material={CLOUD} position={[bx, by, bz]} scale={br} castShadow />
          ))}
        </group>
      ))}
    </>
  );
}

export default function Life({ f, still }: { f: WorldFeatures; still: ReadonlySet<SiteId> }) {
  const walkers = useMemo(() => people(f), [f]);
  return (
    <>
      <Traffic />
      <Walkers movers={walkers} />
      <Rovers still={still} />
      <Drones />
      <Sailing />
      <Turbines f={f} />
      <Smoke x={20.4} y={SLAB_TOP + 2.75} z={-0.4} />
      <Smoke x={-0.8} y={SLAB_TOP + 1.75} z={11.6} />
      {f.conveyors.map((c, i) => (
        <Conveyor key={i} {...c} />
      ))}
      <Clouds />
    </>
  );
}
