/**
 * Minimal URDF parser — just enough for a serial-chain arm.
 *
 * Reads the parts of the URDF this project actually renders and solves against:
 * the link tree, each joint's fixed origin (xyz + rpy), its rotation axis, its
 * limits, and the mesh each link's <visual> refers to.
 *
 * Deliberately NOT a general URDF implementation: no xacro expansion, no
 * <transmission>, no inertial properties, no multi-visual links, no meshes with
 * a scale factor. The myCobot 280 description needs none of them, and a parser
 * that silently half-supports a feature is worse than one that does not claim it.
 */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface UrdfOrigin {
  /** Translation in metres, in the parent frame. */
  xyz: Vec3;
  /** Fixed-axis roll/pitch/yaw in radians, applied X then Y then Z. */
  rpy: Vec3;
}

export interface UrdfVisual {
  /** Mesh filename exactly as written in the URDF (a package:// URI). */
  meshFilename: string;
  /** Mesh's own offset inside the link frame. */
  origin: UrdfOrigin;
}

export interface UrdfLink {
  name: string;
  visual: UrdfVisual | null;
}

export interface UrdfJoint {
  name: string;
  /** 'revolute' | 'fixed' | ... — only these two occur in this description. */
  type: string;
  parent: string;
  child: string;
  origin: UrdfOrigin;
  axis: Vec3;
  /** Radians. Null when the joint declares no <limit> (e.g. fixed joints). */
  limit: { lower: number; upper: number } | null;
  /**
   * <mimic>: this joint follows another one as `multiplier * other + offset`.
   * The adaptive gripper uses it so six finger links follow one motor.
   */
  mimic: { joint: string; multiplier: number; offset: number } | null;
}

export interface UrdfRobot {
  name: string;
  links: Map<string, UrdfLink>;
  joints: UrdfJoint[];
  /** Link that is never a joint's child. */
  rootLink: string;
  /** Movable joints in base-to-tip order. */
  movableJoints: UrdfJoint[];
}

const ZERO: Vec3 = { x: 0, y: 0, z: 0 };

/** URDF writes vectors as whitespace-separated numbers, sometimes padded. */
function parseVec3(raw: string | null | undefined, fallback: Vec3): Vec3 {
  if (!raw) return fallback;
  const parts = raw.trim().split(/\s+/).map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return fallback;
  return { x: parts[0], y: parts[1], z: parts[2] };
}

function parseOrigin(el: Element | null): UrdfOrigin {
  const origin = el?.querySelector(':scope > origin') ?? null;
  return {
    xyz: parseVec3(origin?.getAttribute('xyz'), ZERO),
    rpy: parseVec3(origin?.getAttribute('rpy'), ZERO),
  };
}

export function parseUrdf(xml: string): UrdfRobot {
  // The official files declare XML 1.1, which Firefox's parser rejects ("XML declaration not
  // well-formed"). They use nothing beyond 1.0, so drop the declaration and parse as 1.0.
  const body = xml.replace(/^\uFEFF?\s*<\?xml[^?]*\?>/, '');
  const doc = new DOMParser().parseFromString(body, 'application/xml');
  const error = doc.querySelector('parsererror');
  if (error) throw new Error(`URDF is not well-formed XML: ${error.textContent ?? ''}`);

  const robotEl = doc.querySelector('robot');
  if (!robotEl) throw new Error('URDF has no <robot> element.');

  const links = new Map<string, UrdfLink>();
  for (const linkEl of Array.from(robotEl.querySelectorAll(':scope > link'))) {
    const name = linkEl.getAttribute('name');
    if (!name) continue;
    const visualEl = linkEl.querySelector(':scope > visual');
    const meshEl = visualEl?.querySelector(':scope > geometry > mesh') ?? null;
    const meshFilename = meshEl?.getAttribute('filename') ?? null;
    links.set(name, {
      name,
      visual: meshFilename ? { meshFilename, origin: parseOrigin(visualEl) } : null,
    });
  }

  const joints: UrdfJoint[] = [];
  for (const jointEl of Array.from(robotEl.querySelectorAll(':scope > joint'))) {
    const name = jointEl.getAttribute('name');
    const parent = jointEl.querySelector(':scope > parent')?.getAttribute('link');
    const child = jointEl.querySelector(':scope > child')?.getAttribute('link');
    if (!name || !parent || !child) continue;

    const limitEl = jointEl.querySelector(':scope > limit');
    const mimicEl = jointEl.querySelector(':scope > mimic');
    const lower = Number(limitEl?.getAttribute('lower'));
    const upper = Number(limitEl?.getAttribute('upper'));

    joints.push({
      name,
      type: jointEl.getAttribute('type') ?? 'fixed',
      parent,
      child,
      origin: parseOrigin(jointEl),
      // A revolute joint with a zero axis is malformed; fall back to Z, which is
      // what every joint in this description uses anyway.
      axis: parseVec3(jointEl.querySelector(':scope > axis')?.getAttribute('xyz'), {
        x: 0,
        y: 0,
        z: 1,
      }),
      limit:
        Number.isFinite(lower) && Number.isFinite(upper) ? { lower, upper } : null,
      mimic: mimicEl?.getAttribute('joint')
        ? {
            joint: mimicEl.getAttribute('joint') as string,
            multiplier: Number(mimicEl.getAttribute('multiplier') ?? 1),
            offset: Number(mimicEl.getAttribute('offset') ?? 0),
          }
        : null,
    });
  }

  const childLinks = new Set(joints.map((j) => j.child));
  const rootLink = Array.from(links.keys()).find((name) => !childLinks.has(name));
  if (!rootLink) throw new Error('URDF has no root link (every link is some joint’s child).');

  // Walk parent -> child from the root so the movable joints come out in
  // kinematic order regardless of the order they appear in the file.
  const byParent = new Map<string, UrdfJoint[]>();
  for (const j of joints) {
    const list = byParent.get(j.parent);
    if (list) list.push(j);
    else byParent.set(j.parent, [j]);
  }

  const ordered: UrdfJoint[] = [];
  const walk = (linkName: string) => {
    for (const joint of byParent.get(linkName) ?? []) {
      ordered.push(joint);
      walk(joint.child);
    }
  };
  walk(rootLink);

  const movableJoints = ordered.filter(
    (j) => j.type === 'revolute' || j.type === 'continuous' || j.type === 'prismatic',
  );

  return {
    name: robotEl.getAttribute('name') ?? 'robot',
    links,
    joints: ordered,
    rootLink,
    movableJoints,
  };
}

/**
 * `package://mycobot_description/urdf/mycobot_280_m5/joint1.dae` -> `joint1`.
 *
 * The eight source meshes were merged into one GLB with a node per link, named
 * after the mesh basename, so the URDF's mesh reference resolves to a node name
 * rather than to a file. Keeping the URDF byte-identical to upstream (instead of
 * rewriting its filenames) means it can be re-diffed against a future release.
 */
export function meshNodeName(meshFilename: string): string {
  const base = meshFilename.split('/').pop() ?? meshFilename;
  return base.replace(/\.[^.]+$/, '');
}
