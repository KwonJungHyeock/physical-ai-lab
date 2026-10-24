/**
 * The 교육 screens' physics world (Rapier, a rigid-body engine compiled to
 * WebAssembly — it runs in the browser and offline, no server).
 *
 * What is simulated:
 *  - the table, and blocks as real rigid bodies: they fall, slide, tip over,
 *    stack and topple, with friction;
 *  - the arm as moving solid capsules (the same shapes as collide.ts), driven
 *    by the joint angles — it pushes blocks out of the way;
 *  - gripping: closing on a block within reach of the tool point carries it
 *    with the tool (as a servo-held part); opening drops it, with the tool's
 *    speed at that moment.
 * What is not: the arm against the table — a servo cannot push through the
 * table, so the lesson screens stop the motion at the last free pose
 * (collide.ts) before it ever reaches the physics.
 *
 * Units: Rapier works in metres, z up (the robot base frame); this API takes
 * and returns millimetres, like the rest of the simulator.
 */

import type RAPIER_NS from '@dimforge/rapier3d-compat';
import { Quaternion, Vector3 } from 'three';

import type { ChainSegment } from '../robot/kinematics';
import { armCapsules, type Box } from './collide';

type Rapier = typeof RAPIER_NS;

let loading: Promise<Rapier> | null = null;

/** Load the engine once (≈2 MB of WebAssembly, fetched on first use). */
export function loadRapier(): Promise<Rapier> {
  loading ??= import('@dimforge/rapier3d-compat').then(async (m) => {
    const R = (m.default ?? m) as Rapier;
    await R.init();
    return R;
  });
  return loading;
}

export interface BlockSpec {
  id: string;
  color: string;
  /** Centre, mm. */
  at: [number, number, number];
  /** Edge, mm. */
  size?: number;
  /** Mass, g (a 25 mm wooden cube is about 10 g). */
  massG?: number;
  /** Friction coefficient against the table and other blocks (default 0.7; ice-like ≈ 0.05). */
  friction?: number;
  /** Other shapes than a cube (the simulator's desk objects): x, y, z size in mm, and how it is turned. */
  shape?: 'box' | 'cylinder' | 'ball';
  dims?: readonly [number, number, number];
  yawDeg?: number;
  /** Continuous collision detection (default on: a fast block does not pass through a thin one). Off for parts set down slowly next to a moving held part, where its swept volume would push them. */
  ccd?: boolean;
  /** Full orientation (x, y, z, w), when it is known (overrides yawDeg). */
  q?: readonly [number, number, number, number];
  /** It may tip over but not spin about the vertical (a round part drawn as a box: its corners must not turn into the guides). */
  noSpin?: boolean;
}

export interface BlockPose {
  id: string;
  color: string;
  size: number;
  /** mm */
  at: Vector3;
  q: Quaternion;
  held: boolean;
}

/**
 * Where the world stands (the simulator's 실습 셀): without it, a table with its top at z 0 (the
 * lesson screens and the desk). `floorZ`: a floor this far below the robot base instead (a cell's
 * furniture is then all in the obstacles), mm.
 */
export interface PhysicsEnv {
  floorZ?: number;
  /**
   * Small parts stacked high (a magazine of nine): stiffer contacts and more solver passes, so a
   * stack does not sink into itself.
   */
  fine?: boolean;
}

/** A moving part of a machine (a cylinder's pusher, a stopper, a door): a box the caller moves, mm. */
export interface Mover {
  id: string;
  min: readonly [number, number, number];
  max: readonly [number, number, number];
}

/** A running belt: what rests on its top inside the area travels with it, mm and mm/s. */
export interface Belt {
  min: readonly [number, number];
  max: readonly [number, number];
  topZ: number;
  v: readonly [number, number];
}

/** A hard knock: the speed a block lost in one step (it fell onto something, or was struck), m/s. */
export interface Impact {
  id: string;
  dv: number;
}

export interface PhysicsWorld {
  /** Pose the arm (joint angles in degrees); call before step(). */
  setArm(anglesDeg: readonly number[]): void;
  step(dtS: number): void;
  /**
   * Move the arm to `anglesDeg` over `dtS` seconds, in small sub-steps (≤ 0.75° per step), so a
   * slow frame rate does not make the arm jump through the blocks.
   */
  stepTo(anglesDeg: readonly number[], dtS: number): void;
  blocks(): BlockPose[];
  /**
   * Close the gripper / switch the pump on: the nearest block within reach (mm) of the tool point is held.
   * `upright`: it keeps its own orientation and only follows the tool point (a suction cup held
   * straight down, whose turn about the vertical the lesson does not model).
   */
  grab(reachMm?: number, opts?: { upright?: boolean; passThrough?: boolean }): string | null;
  release(): void;
  /**
   * Hold one block exactly where the caller puts it (the simulator's carried object, which follows its
   * own tool tip); null lets the last one go (it falls from where it was, at rest).
   */
  pin(id: string | null, at?: readonly [number, number, number], q?: readonly [number, number, number, number]): void;
  held(): string | null;
  /** Mass held, kg (for the torque calculation). */
  heldMassKg(): number;
  /** Put one more block in the world (a part that comes in during a run). */
  add(block: BlockSpec): void;
  /** Take a block out of the world (a pin pressed into a housing becomes part of it). */
  remove(id: string): void;
  /** Start over with these blocks (and the arm at `armAngles`, when given; `env` kept when not given). */
  reset(blocks: readonly BlockSpec[], obstacles?: readonly Box[], armAngles?: readonly number[], env?: PhysicsEnv): void;
  /** The machines' moving parts where they are now (a new id is added, a missing one taken away). */
  setMovers(list: readonly Mover[]): void;
  /** The belts running now (an empty list: all stopped). */
  setBelts(list: readonly Belt[]): void;
  /** The hardest knock each block took since the last call (only those above 0.25 m/s). */
  impacts(): Impact[];
  dispose(): void;
}

const M = 0.001;

/** Distance (mm) from point p to the segment a–b. */
function segmentDistance(p: readonly number[], a: readonly number[], b: readonly number[]): number {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const len2 = ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2];
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1] + (p[2] - a[2]) * ab[2]) / len2)) : 0;
  return Math.hypot(p[0] - a[0] - ab[0] * t, p[1] - a[1] - ab[1] * t, p[2] - a[2] - ab[2] * t);
}

export async function createPhysics(
  chain: readonly ChainSegment[],
  tcpMm: number,
  blocks: readonly BlockSpec[] = [],
  obstacles: readonly Box[] = [],
  startAngles: readonly number[] = [0, 0, 0, 0, 0, 0],
  startEnv: PhysicsEnv = {},
): Promise<PhysicsWorld> {
  const R = await loadRapier();
  let world = new R.World({ x: 0, y: 0, z: -9.81 });
  world.timestep = 1 / 120;
  let env = startEnv;
  let movers = new Map<string, { body: RAPIER_NS.RigidBody; dims: string }>();
  let belts: readonly Belt[] = [];
  const knocks = new Map<string, number>();
  let arm: { body: RAPIER_NS.RigidBody; len: number }[] = [];
  let bodies = new Map<string, { body: RAPIER_NS.RigidBody; spec: BlockSpec; size: number; massKg: number }>();
  const tool = { p: new Vector3(), q: new Quaternion(), v: new Vector3() };
  let hold: { id: string; rel: Vector3; relQ: Quaternion; upright: boolean } | null = null;
  let pinned: string | null = null;
  let angles = startAngles.slice();
  let lastDt = 1 / 60;
  const up = new Vector3(0, 1, 0);

  const addBody = (s: BlockSpec) => {
    const d = s.dims ?? [s.size ?? 25, s.size ?? 25, s.size ?? 25];
    const size = Math.max(...d);
    const massKg = (s.massG ?? 10) / 1000;
    const desc = R.RigidBodyDesc.dynamic().setTranslation(s.at[0] * M, s.at[1] * M, s.at[2] * M).setCanSleep(true).setCcdEnabled(s.ccd ?? true);
    if (s.noSpin) desc.enabledRotations(true, true, false);
    const q = s.q ?? (s.yawDeg ? [0, 0, Math.sin((s.yawDeg * Math.PI) / 360), Math.cos((s.yawDeg * Math.PI) / 360)] : null);
    if (q) desc.setRotation({ x: q[0], y: q[1], z: q[2], w: q[3] });
    const body = world.createRigidBody(desc);
    const h = d.map((v) => (v / 2) * M);
    // Rapier's cylinder stands along its y axis: turned to stand on z.
    const shape =
      s.shape === 'ball'
        ? R.ColliderDesc.ball(h[0])
        : s.shape === 'cylinder'
          ? R.ColliderDesc.cylinder(h[2], h[0]).setRotation({ x: Math.SQRT1_2, y: 0, z: 0, w: Math.SQRT1_2 })
          : R.ColliderDesc.cuboid(h[0], h[1], h[2]);
    const volume = s.shape === 'ball' ? (4 / 3) * Math.PI * h[0] ** 3 : s.shape === 'cylinder' ? Math.PI * h[0] ** 2 * 2 * h[2] : 8 * h[0] * h[1] * h[2];
    const col = shape.setFriction(s.friction ?? 0.7).setRestitution(0.05).setDensity(massKg / volume);
    // A given friction is the block's own surface: the slipperier of the two surfaces in contact sets it (Rapier averages by default).
    if (s.friction !== undefined) col.setFrictionCombineRule(R.CoefficientCombineRule.Min);
    world.createCollider(col, body);
    bodies.set(s.id, { body, spec: s, size, massKg });
  };

  const build = (specs: readonly BlockSpec[], obs: readonly Box[]) => {
    world.free();
    world = new R.World({ x: 0, y: 0, z: -9.81 });
    world.timestep = 1 / 120;
    if (env.fine) {
      // Tolerances for centimetre parts: Rapier's defaults are for metre-sized bodies (5 mm of
      // allowed overlap, contacts predicted 20 mm out — a part stuck on a guide rail 3 mm away);
      // and stiffer contacts (they are soft springs: nine 20 g parts sank 4 mm into each other).
      world.lengthUnit = 0.1;
      world.numSolverIterations = 8;
      world.numInternalPgsIterations = 2;
      world.integrationParameters.contact_natural_frequency = 300;
    }
    hold = null;
    pinned = null;
    // Table: a thick slab with its top at z = 0; or a wide floor further down.
    if (env.floorZ === undefined) {
      const table = world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(0.15, 0, -0.02));
      world.createCollider(R.ColliderDesc.cuboid(0.6, 0.6, 0.02).setFriction(0.8), table);
    } else {
      const floor = world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(0, 0, env.floorZ * M - 0.05));
      world.createCollider(R.ColliderDesc.cuboid(3, 3, 0.05).setFriction(0.8), floor);
    }
    movers = new Map();
    knocks.clear();
    for (const b of obs) {
      const c = [0, 1, 2].map((k) => ((b.min[k] + b.max[k]) / 2) * M);
      const h = [0, 1, 2].map((k) => ((b.max[k] - b.min[k]) / 2) * M);
      const body = world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(c[0], c[1], c[2]));
      world.createCollider(R.ColliderDesc.cuboid(h[0], h[1], h[2]).setFriction(0.6), body);
    }
    bodies = new Map();
    for (const s of specs) addBody(s);
    arm = armCapsules(chain, angles, tcpMm).map((c) => {
      const len = Math.hypot(c.b[0] - c.a[0], c.b[1] - c.a[1], c.b[2] - c.a[2]) * M;
      const body = world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased());
      world.createCollider(R.ColliderDesc.capsule(Math.max(len / 2, 0.001), c.r * M).setFriction(0.5), body);
      return { body, len };
    });
    placeArm(true);
  };

  const placeArm = (teleport = false) => {
    const caps = armCapsules(chain, angles, tcpMm);
    caps.forEach((c, i) => {
      const a = arm[i];
      if (!a) return;
      const mid = { x: ((c.a[0] + c.b[0]) / 2) * M, y: ((c.a[1] + c.b[1]) / 2) * M, z: ((c.a[2] + c.b[2]) / 2) * M };
      const dir = new Vector3(c.b[0] - c.a[0], c.b[1] - c.a[1], c.b[2] - c.a[2]).normalize();
      const q = new Quaternion().setFromUnitVectors(up, dir.lengthSq() > 0 ? dir : up);
      const rot = { x: q.x, y: q.y, z: q.z, w: q.w };
      if (teleport) {
        a.body.setTranslation(mid, true);
        a.body.setRotation(rot, true);
      } else {
        a.body.setNextKinematicTranslation(mid);
        a.body.setNextKinematicRotation(rot);
      }
    });
    // A resting block falls asleep, and Rapier does not wake it when a kinematic body runs into it:
    // wake the blocks the moving arm comes near, or it would pass through them.
    if (!teleport) {
      for (const { body, size } of bodies.values()) {
        if (!body.isSleeping()) continue;
        const t = body.translation();
        const p = [t.x / M, t.y / M, t.z / M];
        if (caps.some((c) => segmentDistance(p, c.a, c.b) < c.r + size + 20)) body.wakeUp();
      }
    }
    const last = caps[caps.length - 1];
    const prev = tool.p.clone();
    const d = new Vector3(last.b[0] - last.a[0], last.b[1] - last.a[1], last.b[2] - last.a[2]).normalize();
    // Tool point: the end of the last capsule's rounded cap.
    tool.p = new Vector3(last.b[0], last.b[1], last.b[2]).addScaledVector(d, last.r);
    tool.q = new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), d);
    tool.v = teleport ? new Vector3() : tool.p.clone().sub(prev);
  };

  /** Half the height of a block as it stands (to find what rests on a belt), mm. */
  const halfHeight = (s: BlockSpec) => (s.dims ? (s.shape === 'ball' ? s.dims[0] : s.dims[2]) : (s.size ?? 25)) / 2;

  /** The running belt a block rests on, or none. */
  const beltUnder = (body: RAPIER_NS.RigidBody, spec: BlockSpec): Belt | undefined => {
    if (!belts.length) return undefined;
    const t = body.translation();
    const x = t.x / M;
    const y = t.y / M;
    const bottom = t.z / M - halfHeight(spec);
    return belts.find((b) => x > b.min[0] && x < b.max[0] && y > b.min[1] && y < b.max[1] && Math.abs(bottom - b.topZ) < 2.5);
  };

  /**
   * One step of the world, with the belts carrying what lies on them and the knocks noted. A belt
   * moves what rests on it by its own travel each step (as a belt does: the part goes with it, no
   * slip); what stops the part (the end plate, another part) pushes it back in the next step.
   */
  const tick = () => {
    const before = new Map<string, { x: number; y: number; z: number }>();
    const carried: { body: RAPIER_NS.RigidBody; v: readonly [number, number] }[] = [];
    for (const [id, { body, spec }] of bodies) {
      if (body.bodyType() !== R.RigidBodyType.Dynamic || body.isSleeping()) continue;
      const belt = beltUnder(body, spec);
      if (belt) carried.push({ body, v: belt.v });
      before.set(id, body.linvel());
    }
    world.step();
    const dt = world.timestep;
    for (const { body, v } of carried) {
      const t = body.translation();
      body.setTranslation({ x: t.x + v[0] * M * dt, y: t.y + v[1] * M * dt, z: t.z }, true);
    }
    const onBelt = new Set(carried.map((c) => c.body));
    for (const [id, v0] of before) {
      const b = bodies.get(id);
      // (a part the belt pushes against the end stop is not knocked)
      if (!b || b.body.bodyType() !== R.RigidBodyType.Dynamic || onBelt.has(b.body)) continue;
      const v = b.body.linvel();
      const dv = Math.hypot(v.x - v0.x, v.y - v0.y, v.z - v0.z);
      if (dv > 0.25) knocks.set(id, Math.max(knocks.get(id) ?? 0, dv));
    }
  };
  // Belts wake what lies on them (a sleeping block would not be carried).
  const wakeOnBelts = () => {
    if (!belts.length) return;
    for (const { body, spec } of bodies.values()) if (body.isSleeping() && beltUnder(body, spec)) body.wakeUp();
  };

  build(blocks, obstacles);

  const api: PhysicsWorld = {
    setArm(q) {
      angles = q.slice();
      placeArm(false);
      if (hold) {
        const h = bodies.get(hold.id);
        if (h) {
          const p = (hold.upright ? hold.rel.clone() : hold.rel.clone().applyQuaternion(tool.q)).add(tool.p).multiplyScalar(M);
          const r = hold.upright ? hold.relQ : tool.q.clone().multiply(hold.relQ);
          h.body.setNextKinematicTranslation({ x: p.x, y: p.y, z: p.z });
          h.body.setNextKinematicRotation({ x: r.x, y: r.y, z: r.z, w: r.w });
        }
      }
    },
    step(dt) {
      lastDt = Math.max(1e-3, dt);
      const n = Math.max(1, Math.min(8, Math.round(dt / world.timestep)));
      wakeOnBelts();
      for (let k = 0; k < n; k += 1) tick();
    },
    stepTo(target, dt) {
      const from = angles.slice();
      const span = Math.max(...target.map((a, i) => Math.abs(a - from[i])));
      const n = Math.max(1, Math.min(32, Math.max(Math.round(dt / world.timestep), Math.ceil(span / 0.75))));
      lastDt = Math.max(1e-3, dt / n);
      wakeOnBelts();
      for (let k = 1; k <= n; k += 1) {
        api.setArm(from.map((a, i) => a + ((target[i] - a) * k) / n));
        tick();
      }
    },
    blocks() {
      return [...bodies.values()].map(({ body, spec, size }) => {
        const t = body.translation();
        const r = body.rotation();
        return { id: spec.id, color: spec.color, size, at: new Vector3(t.x / M, t.y / M, t.z / M), q: new Quaternion(r.x, r.y, r.z, r.w), held: hold?.id === spec.id };
      });
    },
    grab(reachMm = 22, opts = {}) {
      if (hold) return hold.id;
      let best: string | null = null;
      let bd = Infinity;
      for (const [id, { body, size }] of bodies) {
        const t = body.translation();
        const d = new Vector3(t.x / M, t.y / M, t.z / M).distanceTo(tool.p) - size / 2;
        if (d < bd) {
          bd = d;
          best = id;
        }
      }
      if (!best || bd > reachMm) return null;
      const h = bodies.get(best)!;
      const t = h.body.translation();
      const r = h.body.rotation();
      const inv = tool.q.clone().invert();
      const at = new Vector3(t.x / M, t.y / M, t.z / M).sub(tool.p);
      const rot = new Quaternion(r.x, r.y, r.z, r.w);
      hold = opts.upright
        ? { id: best, rel: at, relQ: rot, upright: true }
        : { id: best, rel: at.applyQuaternion(inv), relQ: inv.multiply(rot), upright: false };
      h.body.setBodyType(R.RigidBodyType.KinematicPositionBased, true);
      // A part carried through other parts without touching them (the lesson checks contact itself).
      if (opts.passThrough) h.body.collider(0).setSensor(true);
      return best;
    },
    release() {
      if (!hold) return;
      const h = bodies.get(hold.id);
      hold = null;
      if (!h) return;
      h.body.setBodyType(R.RigidBodyType.Dynamic, true);
      h.body.collider(0).setSensor(false);
      const v = tool.v.clone().multiplyScalar(M / lastDt);
      h.body.setLinvel({ x: v.x, y: v.y, z: v.z }, true);
    },
    pin(id, at, q) {
      if (pinned && pinned !== id) {
        const was = bodies.get(pinned);
        if (was) {
          was.body.setBodyType(R.RigidBodyType.Dynamic, true);
          was.body.collider(0).setSensor(false);
          was.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
          was.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
        }
        pinned = null;
      }
      const b = id ? bodies.get(id) : undefined;
      if (!id || !b) return;
      if (pinned !== id) {
        b.body.setBodyType(R.RigidBodyType.KinematicPositionBased, true);
        // Carried, it touches nothing here: the simulator checks what it runs into itself (a moving
        // kinematic body also shoves its old neighbours through stale contacts).
        b.body.collider(0).setSensor(true);
        pinned = id;
      }
      if (at) b.body.setNextKinematicTranslation({ x: at[0] * M, y: at[1] * M, z: at[2] * M });
      if (q) b.body.setNextKinematicRotation({ x: q[0], y: q[1], z: q[2], w: q[3] });
    },
    held: () => hold?.id ?? null,
    heldMassKg: () => (hold ? (bodies.get(hold.id)?.massKg ?? 0) : 0),
    reset(specs, obs = [], armAngles, nextEnv) {
      if (armAngles) angles = armAngles.slice();
      if (nextEnv) env = nextEnv;
      build(specs, obs);
    },
    setMovers(list) {
      const keep = new Set<string>();
      for (const mv of list) {
        keep.add(mv.id);
        const h = [0, 1, 2].map((k) => ((mv.max[k] - mv.min[k]) / 2) * M);
        const c = { x: ((mv.min[0] + mv.max[0]) / 2) * M, y: ((mv.min[1] + mv.max[1]) / 2) * M, z: ((mv.min[2] + mv.max[2]) / 2) * M };
        const dims = h.map((v) => v.toFixed(5)).join(',');
        const had = movers.get(mv.id);
        if (had && had.dims === dims) {
          had.body.setNextKinematicTranslation(c);
          continue;
        }
        if (had) world.removeRigidBody(had.body);
        const body = world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(c.x, c.y, c.z));
        world.createCollider(R.ColliderDesc.cuboid(h[0], h[1], h[2]).setFriction(0.5), body);
        movers.set(mv.id, { body, dims });
      }
      for (const [id, { body }] of movers) {
        if (keep.has(id)) continue;
        world.removeRigidBody(body);
        movers.delete(id);
      }
    },
    setBelts(list) {
      belts = list;
    },
    impacts() {
      const out = [...knocks].map(([id, dv]) => ({ id, dv }));
      knocks.clear();
      return out;
    },
    add(spec) {
      addBody(spec);
    },
    remove(id) {
      const b = bodies.get(id);
      if (!b) return;
      if (pinned === id) pinned = null;
      if (hold?.id === id) hold = null;
      world.removeRigidBody(b.body);
      bodies.delete(id);
    },
    dispose() {
      world.free();
    },
  };
  return api;
}
