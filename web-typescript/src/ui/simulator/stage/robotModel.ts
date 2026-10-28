/**
 * Builds the three.js objects for the console's robot and its tools.
 *
 * Imperative on purpose: the arm is re-posed on every animation frame, and
 * setting six quaternions directly is far cheaper than re-rendering a React tree
 * sixty times a second. Everything here is in the URDF frame (Z up, metres);
 * the caller puts it under one group rotated into three.js's Y-up world.
 */

import {
  Box3,
  BoxGeometry,
  CanvasTexture,
  CatmullRomCurve3,
  Color,
  CylinderGeometry,
  DoubleSide,
  Euler,
  Group,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  Quaternion,
  Shape,
  ExtrudeGeometry,
  SphereGeometry,
  SRGBColorSpace,
  TextureLoader,
  TubeGeometry,
  Vector3,
  type BufferGeometry,
  type Material,
  type Texture,
} from 'three';
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

import { URDF_EULER_ORDER, type ChainSegment } from '@/engine/robot/kinematics';
import { meshNodeName, type UrdfOrigin, type UrdfRobot } from '@/engine/robot/urdf';
import { HAND_CAMERA, verticalFov } from '@/engine/simulator/board';
import {
  CAMERA_FLANGE_SPACER_MM,
  EYES_IN_HAND,
  EYES_IN_HAND_TOOL_MM,
  FIRMWARE_TO_FLANGE_DEG,
  HAND_CAMERA_MOUNT,
  type EffectorId,
} from '@/engine/simulator/effectors';
import type { WorldState } from '@/engine/simulator/sim';

export const COLORS = {
  shell: '#eceef1',
  dark: '#2f3439',
  metal: '#8a939c',
  flange: '#4b5259',
  tool: '#3a4046',
  accent: '#1ea7df',
};

/**
 * Neighbouring links take two whites in turn (the second a light grey), so each joint reads apart
 * from the next on the all-white arm.
 */
const SHELL_TONES = [COLORS.shell, '#d2d7de'];

const mat = (color: string, roughness = 0.5, metalness = 0.05) =>
  new MeshStandardMaterial({ color: new Color(color), roughness, metalness });

/**
 * The arm's white shells as injection-moulded plastic: a satin surface with a soft clear coat, so
 * the studio lights leave long highlights along each link instead of a flat white. `map` is one of
 * the official mesh textures (connectors, the wrist's ATOM screen), drawn over the white; `tone`
 * picks one of the two shell whites.
 */
const shellMaterial = (map?: Texture, tone = 0) => {
  const m = new MeshPhysicalMaterial({ color: new Color(SHELL_TONES[tone]), roughness: 0.42, metalness: 0, clearcoat: 0.4, clearcoatRoughness: 0.5, map: map ?? null });
  m.userData.shell = true;
  // Surfaces turning away from the eye darken towards the outline, as in a studio product shot.
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace(
      '#include <opaque_fragment>',
      'float edge = 1.0 - clamp(abs(dot(normalize(normal), normalize(vViewPosition))), 0.0, 1.0);\noutgoingLight *= mix(1.0, 0.62, pow(edge, 2.2));\n#include <opaque_fragment>',
    );
  };
  m.customProgramCacheKey = () => 'shell-shaded';
  return m;
};

/**
 * A black arm (ArmSpec.finish 'black', OMX-F): matte black frames in two near-blacks taken in turn so
 * each link reads apart, with a soft sheen towards the outline (in a bright studio the edges of a
 * black part catch the light instead of going darker).
 */
const BLACK_TONES = ['#1b1e22', '#2b3036'];
const blackMaterial = (tone = 0) => {
  const m = new MeshPhysicalMaterial({ color: new Color(BLACK_TONES[tone]), roughness: 0.5, metalness: 0.05, clearcoat: 0.3, clearcoatRoughness: 0.45 });
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace(
      '#include <opaque_fragment>',
      'float edge = 1.0 - clamp(abs(dot(normalize(normal), normalize(vViewPosition))), 0.0, 1.0);\noutgoingLight += vec3(0.05, 0.055, 0.06) * pow(edge, 2.0);\n#include <opaque_fragment>',
    );
  };
  m.customProgramCacheKey = () => 'black-shaded';
  return m;
};
const BLACK = [blackMaterial(0), blackMaterial(1)];

const MATERIALS = {
  shell: shellMaterial(),
  dark: new MeshPhysicalMaterial({ color: new Color('#23272c'), roughness: 0.55, metalness: 0.05, clearcoat: 0.2, clearcoatRoughness: 0.5 }),
  flange: mat(COLORS.flange, 0.34, 0.55),
  tool: mat(COLORS.tool, 0.55),
  metal: mat(COLORS.metal, 0.35, 0.6),
  rubber: mat('#20242a', 0.9),
  orange: Object.assign(mat('#f59a1b', 0.6), { side: DoubleSide }),
  pen: mat('#1ea7df', 0.4),
  glass: mat('#0d1117', 0.15, 0.3),
  phone: mat('#22272e', 0.3, 0.2),
  cable: new MeshPhysicalMaterial({ color: new Color('#16191d'), roughness: 0.62, metalness: 0, clearcoat: 0.25, clearcoatRoughness: 0.6 }),
  plug: mat('#3b4148', 0.45, 0.1),
};

/**
 * Dobot MG400, from Dobot's product photos: satin anodised aluminium shells and base box, charcoal links
 * with the same edge sheen as the black parts above, smoked see-through covers on the J1 housing (its
 * aluminium core shows through), a black glass top on the base with a cyan LED ring, black vent slots on
 * the head, polished steel pin caps and tool flange.
 */
const charcoalMaterial = () => {
  const m = new MeshPhysicalMaterial({ color: new Color('#3a3e44'), roughness: 0.45, metalness: 0.3, clearcoat: 0.2, clearcoatRoughness: 0.45 });
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace(
      '#include <opaque_fragment>',
      'float edge = 1.0 - clamp(abs(dot(normalize(normal), normalize(vViewPosition))), 0.0, 1.0);\noutgoingLight += vec3(0.05, 0.055, 0.06) * pow(edge, 2.0);\n#include <opaque_fragment>',
    );
  };
  m.customProgramCacheKey = () => 'charcoal-shaded';
  return m;
};
const MG400 = {
  alu: new MeshPhysicalMaterial({ color: new Color('#dde0e4'), metalness: 0.85, roughness: 0.28, clearcoat: 0.2, clearcoatRoughness: 0.4 }),
  aluBase: new MeshPhysicalMaterial({ color: new Color('#cdd1d6'), metalness: 0.8, roughness: 0.38 }),
  charcoal: charcoalMaterial(),
  smoke: new MeshPhysicalMaterial({ color: new Color('#2b2e33'), roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.1, transparent: true, opacity: 0.86 }),
  glass: new MeshPhysicalMaterial({ color: new Color('#111316'), roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.08 }),
  led: new MeshStandardMaterial({ color: new Color('#8ff3f5'), emissive: new Color('#2fd6e0'), emissiveIntensity: 2 }),
  steel: mat('#e3e6ea', 0.15, 1),
  vent: mat('#15171a', 0.6),
};
/** MG400 parts split into finishes (convert_meshes.py mg400): child meshes named <node>__<region>. */
const REGION_MATERIAL: Record<string, Material> = { pin: MG400.steel, cover: MG400.smoke, top: MG400.glass, led: MG400.led, vent: MG400.vent };

/** Which colour each GLB node of the arm gets (RDK X5: black base, white shells). */
const NODE_MATERIAL: Record<string, Material> = {
  joint1_rdkx5: MATERIALS.dark,
  joint7: MATERIALS.flange,
  gripper_base: MATERIALS.tool,
  gripper_left1: MATERIALS.tool,
  gripper_left2: MATERIALS.metal,
  gripper_left3: MATERIALS.tool,
  gripper_right1: MATERIALS.tool,
  gripper_right2: MATERIALS.metal,
  gripper_right3: MATERIALS.tool,
  pump_head: MATERIALS.tool,
  pump_box: MATERIALS.dark,
  camera_flange: MATERIALS.flange,
  omx_finger1: BLACK[1],
  omx_finger2: BLACK[1],
  mg400_base: MG400.aluBase,
  mg400_link1: MG400.alu,
  mg400_link2_1: MG400.charcoal,
  mg400_link2_2: MG400.alu,
  mg400_link3_1: MG400.charcoal,
  mg400_link3_2: MG400.charcoal,
  mg400_link4_1: MG400.alu,
  mg400_link4_2: MG400.alu,
  mg400_link5: MG400.steel,
};

export type GlbNodes = Record<string, Object3D>;

/**
 * Official texture per shell part (mycobot_description/urdf/mycobot_280_rdkx5/*.png, the UVs
 * came through the GLB conversion): the cable connectors on the links and the ATOM screen on
 * the wrist. Loaded once, on first use (never on the server).
 */
const SHELL_TEXTURE: Record<string, string> = {
  joint2: '/robot/rdkx5/tex/joint2.jpg',
  joint3: '/robot/rdkx5/tex/joint3.jpg',
  joint4: '/robot/rdkx5/tex/joint4.jpg',
  joint5: '/robot/rdkx5/tex/joint5.jpg',
  joint6: '/robot/rdkx5/tex/joint6.jpg',
};
const texturedShell = new Map<string, Material>();
const toneShell = [MATERIALS.shell, shellMaterial(undefined, 1)];
function shellFor(name: string, url = SHELL_TEXTURE[name], tone = 0): Material {
  if (!url || typeof window === 'undefined') return toneShell[tone];
  const key = `${url}#${tone}`;
  let m = texturedShell.get(key);
  if (!m) {
    const t = new TextureLoader().load(url);
    t.colorSpace = SRGBColorSpace;
    // glTF texture coordinates: no flip.
    t.flipY = false;
    t.anisotropy = 4;
    m = shellMaterial(t, tone);
    texturedShell.set(key, m);
  }
  return m;
}

/**
 * The official meshes are faceted (flat normals per triangle): rounded shells showed their
 * polygons. Normals are averaged across edges flatter than 40°, so curved surfaces read as smooth
 * while real edges (rims, flats, holes) stay crisp. Once per source geometry.
 *
 * three's toCreasedNormals finds shared corners on a 0.01-unit grid. The meshes are in metres, so
 * that grid was 1 cm: every corner within a centimetre was treated as one, and the round shells
 * shaded in blotchy 1 cm blocks with stepped edges. It runs on a millimetre copy instead (a 0.01 mm
 * grid) and is scaled back; a uniform scale leaves the normals as they are.
 */
const smoothed = new WeakMap<BufferGeometry, BufferGeometry>();
function smoothGeometry(g: BufferGeometry): BufferGeometry {
  let out = smoothed.get(g);
  if (!out) {
    out = toCreasedNormals(g.clone().scale(1000, 1000, 1000), (40 * Math.PI) / 180).scale(0.001, 0.001, 0.001);
    smoothed.set(g, out);
  }
  return out;
}

function originGroup(origin: UrdfOrigin): Group {
  const g = new Group();
  g.position.set(origin.xyz.x, origin.xyz.y, origin.xyz.z);
  g.rotation.copy(new Euler(origin.rpy.x, origin.rpy.y, origin.rpy.z, URDF_EULER_ORDER));
  return g;
}

/**
 * How an arm's parts look, from its spec (src/engine/robot/arms.ts): which nodes are the dark base or
 * the metal flange, the official textures on the white shells, and the link tools mount on.
 */
export interface ArmLook {
  dark: readonly string[];
  flange: readonly string[];
  textures: Readonly<Record<string, string>>;
  flangeLink: string;
  /** 'black': every part black (ArmSpec.finish). */
  finish?: 'black';
}

function meshFromNode(nodes: GlbNodes, name: string, look?: ArmLook, tone = 0): Object3D {
  const source = nodes[name];
  if (!source) return new Group();
  const clone = source.clone(true);
  const material =
    look?.finish === 'black' && !look.flange.includes(name)
      ? BLACK[tone % 2]
      : look?.dark.includes(name)
        ? MATERIALS.dark
        : look?.flange.includes(name)
          ? MATERIALS.flange
          : look
            ? shellFor(name, look.textures[name], tone)
            : (NODE_MATERIAL[name] ?? shellFor(name, undefined, tone));
  clone.traverse((child) => {
    if ((child as Mesh).isMesh) {
      (child as Mesh).geometry = smoothGeometry((child as Mesh).geometry);
      (child as Mesh).material = REGION_MATERIAL[child.name.split('__')[1] ?? ''] ?? material;
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
  return clone;
}

/** One part of the GLB on its own, in its own frame (a parts preview): `dark` for the black base parts. */
export function partMesh(nodes: GlbNodes, name: string, dark = false): Object3D {
  return meshFromNode(nodes, name, dark ? { dark: [name], flange: [], textures: {}, flangeLink: '' } : undefined);
}

function linkVisual(robot: UrdfRobot, linkName: string, nodes: GlbNodes, look?: ArmLook, tone = 0): Object3D | null {
  const visual = robot.links.get(linkName)?.visual;
  if (!visual) return null;
  const g = originGroup(visual.origin);
  g.add(meshFromNode(nodes, meshNodeName(visual.meshFilename), look, tone));
  return g;
}

export interface ArmModel {
  root: Group;
  /** Rotation group per movable joint, base to tip; `housing`: the link that holds its motor (the joint's parent link). */
  joints: { group: Group; axis: Vector3; housing: Object3D | null }[];
  /** The flange link (joint6_flange on the 280, link6 on the 320 and mechArm): tools are attached here. */
  flange: Group;
  setAngles(anglesDeg: readonly number[]): void;
}

/** The six-axis arm, straight from the URDF; `look` = its spec's colours, textures and flange link (myCobot 280 RDK X5 when left out). */
export function buildArm(robot: UrdfRobot, chain: readonly ChainSegment[], nodes: GlbNodes, look?: ArmLook): ArmModel {
  const root = new Group();
  const joints: ArmModel['joints'] = [];
  // Joints that follow another (URDF <mimic>: the 4-axis arms' level head).
  const followers: { group: Group; axis: Vector3; index: number; k: number; offsetDeg: number }[] = [];
  let flange = root;

  // `depth`: links from the base, so neighbouring links can take the two shell tones in turn.
  const visuals = new Map<string, Object3D>();
  const addLink = (linkName: string, parent: Group, depth = 0) => {
    const v = linkVisual(robot, linkName, nodes, look, depth % 2);
    if (v) {
      parent.add(v);
      visuals.set(linkName, v);
    }
    for (const seg of chain.filter((s) => s.joint.parent === linkName)) {
      const o = originGroup(seg.joint.origin);
      const r = new Group();
      o.add(r);
      parent.add(o);
      if (seg.movableIndex >= 0) joints[seg.movableIndex] = { group: r, axis: seg.axis.clone(), housing: visuals.get(seg.joint.parent) ?? null };
      else if (seg.mimic) followers.push({ group: r, axis: seg.axis.clone(), index: seg.mimic.index, k: seg.mimic.multiplier, offsetDeg: seg.mimic.offsetDeg });
      if (seg.joint.child === (look?.flangeLink ?? 'joint6_flange')) flange = r;
      addLink(seg.joint.child, r, depth + 1);
    }
  };
  addLink(robot.rootLink, root);

  const q = new Quaternion();
  return {
    root,
    joints,
    flange,
    setAngles(anglesDeg) {
      joints.forEach((j, i) => j.group.quaternion.copy(q.setFromAxisAngle(j.axis, ((anglesDeg[i] ?? 0) * Math.PI) / 180)));
      for (const f of followers) f.group.quaternion.copy(q.setFromAxisAngle(f.axis, ((f.k * (anglesDeg[f.index] ?? 0) + f.offsetDeg) * Math.PI) / 180));
    },
  };
}

/** Half the long side (150 mm, along x) of the G base an arm can stand on (MountBase in Stage.tsx). */
const MOUNT_HALF_M = 0.075;

/**
 * What sits around a real arm's base on a desk: a soft dark patch where the base meets the desk, and
 * the USB and power cables leaving the base's far side, drooping to the desk and running off. Laid
 * out from the footprint of the arm's base link (`arm.root`'s first child), so it fits every arm.
 * The group is in the robot base frame with the table at z = 0; `liftM` is the height of a base
 * block the arm stands on (the cables then come down its side).
 */
export function baseDressing(root: Group, liftM = 0): Group {
  const out = new Group();
  root.updateMatrixWorld(true);
  const b = new Box3().setFromObject(root.children[0] ?? root);
  if (b.isEmpty()) return out;
  const c = b.getCenter(new Vector3());
  // Some bases hang below the URDF origin (the 280 Pi's G base plate); the table is at the origin.
  const top = liftM + Math.max(b.max.z, 0.002);
  // Contact shadow: a radial dark gradient on whatever the base stands on.
  if (typeof document !== 'undefined') {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 128;
    const g2 = cv.getContext('2d')!;
    const grad = g2.createRadialGradient(64, 64, 10, 64, 64, 64);
    grad.addColorStop(0, 'rgba(0,0,0,0.55)');
    grad.addColorStop(0.55, 'rgba(0,0,0,0.28)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g2.fillStyle = grad;
    g2.fillRect(0, 0, 128, 128);
    const size = b.getSize(new Vector3());
    const blob = new Mesh(new PlaneGeometry(size.x * 1.35, size.y * 1.35), new MeshBasicMaterial({ map: new CanvasTexture(cv), transparent: true, depthWrite: false }));
    blob.position.set(c.x, c.y, liftM + 0.0004);
    blob.renderOrder = -1;
    out.add(blob);
  }
  // Cables: out of the side of the base farthest from the J1 axis (behind it when centred).
  const dir = new Vector3(c.x, c.y, 0);
  if (dir.lengthSq() < 1e-6) dir.set(-1, 0, 0);
  dir.normalize();
  const side = new Vector3(-dir.y, dir.x, 0);
  // How far the base reaches that way: its farthest box corner (or the edge of the block under it).
  const corner = Math.max(...[b.min.x, b.max.x].flatMap((x) => [b.min.y, b.max.y].map((y) => x * dir.x + y * dir.y)));
  const reach = liftM > 0 ? Math.max(corner, MOUNT_HALF_M + 0.004) : corner;
  const cable = (lateral: number, r: number, zFrac: number, bend: number) => {
    const at = (along: number, z: number, lat = 0) =>
      new Vector3().addScaledVector(dir, reach + along).addScaledVector(side, lateral + lat).setZ(z);
    const z0 = liftM + Math.max(Math.min((top - liftM) * zFrac, 0.03), r);
    const pts = [at(-0.004, z0), at(0.012, z0), at(0.03, (z0 + r) * 0.55), at(0.05, r), at(0.1, r, bend * 0.3), at(0.18, r, bend), at(0.3, r, bend * 1.35)];
    const tube = new Mesh(new TubeGeometry(new CatmullRomCurve3(pts, false, 'centripetal'), 96, r, 10), MATERIALS.cable);
    tube.castShadow = true;
    tube.receiveShadow = true;
    out.add(tube);
    // The plug's boot at the port.
    const boot = new Mesh(new CylinderGeometry(r * 1.9, r * 1.9, 0.016, 14), MATERIALS.plug);
    boot.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), dir);
    boot.position.copy(at(0.004, z0));
    boot.castShadow = true;
    out.add(boot);
  };
  cable(-0.012, 0.0022, 0.3, -0.06);
  cable(0.012, 0.0032, 0.22, -0.035);
  // Desk dressing, not part of the robot: left out of the view's framing.
  out.traverse((o) => (o.userData.noFit = true));
  return out;
}

/* -------------------------------------------------------------------------- */
/* Tools                                                                      */
/* -------------------------------------------------------------------------- */

export interface ToolModel {
  /** Goes under the arm's flange group. */
  group: Group;
  /** Extra objects placed in the robot base frame (the pump's box). */
  baseExtras: Group;
  /** Present when the camera flange is fitted. */
  handCamera: PerspectiveCamera | null;
  update(world: WorldState): void;
}

/** Adaptive gripper motor angle for a finger gap, from the official meshes (see effectors.ts). */
const ADAPTIVE_GAP_TO_Q: [number, number][] = [
  [3.6, -0.74],
  [27.4, -0.3],
  [39.3, 0],
  [43.4, 0.15],
];

export function adaptiveMotorAngle(gapMm: number): number {
  const t = ADAPTIVE_GAP_TO_Q;
  if (gapMm <= t[0][0]) return t[0][1];
  for (let i = 1; i < t.length; i += 1) {
    if (gapMm <= t[i][0]) {
      const f = (gapMm - t[i - 1][0]) / (t[i][0] - t[i - 1][0]);
      return t[i - 1][1] + (t[i][1] - t[i - 1][1]) * f;
    }
  }
  return t[t.length - 1][1];
}

/**
 * OMX-F finger angle (rad) for a gap at its grasp line (88 mm out): measured on the official finger
 * meshes, the gap opens about 120 mm per radian (0.3 rad 40 mm, 0.5 rad 60 mm); 0 = closed.
 */
export const omxFingerAngle = (gapMm: number): number => Math.min(1, Math.max(0, gapMm / 120));

const box = (w: number, h: number, d: number, m: Material, x = 0, y = 0, z = 0) => {
  const mesh = new Mesh(new BoxGeometry(w / 1000, h / 1000, d / 1000), m);
  mesh.position.set(x / 1000, y / 1000, z / 1000);
  mesh.castShadow = true;
  return mesh;
};
/** Cylinder along the flange axis (z), from z0 to z1 mm. */
const zCylinder = (r: number, z0: number, z1: number, m: Material, x = 0, y = 0) => {
  const mesh = new Mesh(new CylinderGeometry(r / 1000, r / 1000, (z1 - z0) / 1000, 32), m);
  mesh.rotation.x = Math.PI / 2;
  mesh.position.set(x / 1000, y / 1000, (z0 + z1) / 2000);
  mesh.castShadow = true;
  return mesh;
};

/**
 * One tool, optionally on the camera flange. `gripperRobot` is the parsed
 * official adaptive-gripper URDF (for its linkage).
 */
export function buildTool(
  id: EffectorId,
  cameraFlange: boolean,
  nodes: GlbNodes,
  gripperRobot: UrdfRobot | null,
): ToolModel {
  const group = new Group();
  const baseExtras = new Group();
  let handCamera: PerspectiveCamera | null = null;

  // Everything the tool is made of sits in `mount`, pushed out by the camera
  // flange when one is fitted.
  const mount = new Group();
  group.add(mount);
  if (cameraFlange) {
    // Official mount: flange -> camera_flange (0 0 0.01, rpy 1.579 0 0), visual (0.024 -0.008 0, rpy 0 π 0).
    const cf = originGroup({ xyz: { x: 0, y: 0, z: 0.01 }, rpy: { x: 1.579, y: 0, z: 0 } });
    const v = originGroup({ xyz: { x: 0.024, y: -0.008, z: 0 }, rpy: { x: 0, y: 3.14159, z: 0 } });
    v.add(meshFromNode(nodes, 'camera_flange'));
    cf.add(v);
    group.add(cf);
    mount.position.z = CAMERA_FLANGE_SPACER_MM / 1000;

    handCamera = new PerspectiveCamera(
      verticalFov(HAND_CAMERA.hfovDeg, HAND_CAMERA.width, HAND_CAMERA.height),
      HAND_CAMERA.width / HAND_CAMERA.height,
      0.03,
      2,
    );
    // Placed and turned as the kit's hand-eye calibration measured it (EYES_IN_HAND, in the
    // firmware's tool frame 100 mm out), turned into the URDF flange frame; OpenCV axes → three.js
    // camera axes (y and z flipped).
    const e = EYES_IN_HAND;
    const cv = new Matrix4().set(e[0][0], e[0][1], e[0][2], e[0][3], e[1][0], e[1][1], e[1][2], e[1][3], e[2][0], e[2][1], e[2][2], e[2][3], 0, 0, 0, 1);
    const pose = new Matrix4()
      .makeRotationZ((FIRMWARE_TO_FLANGE_DEG * Math.PI) / 180)
      .multiply(new Matrix4().makeTranslation(0, 0, EYES_IN_HAND_TOOL_MM))
      .multiply(cv)
      .multiply(new Matrix4().makeScale(1, -1, -1));
    const at = new Vector3();
    const turn = new Quaternion();
    pose.decompose(at, turn, new Vector3());
    handCamera.position.copy(at.multiplyScalar(0.001));
    handCamera.quaternion.copy(turn);
    group.add(handCamera);
    // A visible lens so students can see where the hand camera looks from.
    const lens = zCylinder(4, HAND_CAMERA_MOUNT.z - 2, HAND_CAMERA_MOUNT.z + 1.5, MATERIALS.glass, HAND_CAMERA_MOUNT.x, 0);
    group.add(lens);
  }

  let update: (world: WorldState) => void = () => {};

  switch (id) {
    case 'adaptive': {
      if (!gripperRobot) break;
      const chain = gripperRobot.joints;
      const mountJoint = chain.find((j) => j.name === 'joint6output_to_gripper_base');
      if (!mountJoint) break;
      const base = originGroup(mountJoint.origin);
      mount.add(base);
      const rotating: { group: Group; axis: Vector3; multiplier: number }[] = [];
      const addLink = (linkName: string, parent: Group) => {
        const v = linkVisual(gripperRobot, linkName, nodes);
        if (v) parent.add(v);
        for (const j of chain.filter((k) => k.parent === linkName)) {
          const o = originGroup(j.origin);
          const r = new Group();
          o.add(r);
          parent.add(o);
          if (j.type === 'revolute') {
            rotating.push({
              group: r,
              axis: new Vector3(j.axis.x, j.axis.y, j.axis.z).normalize(),
              multiplier: j.name === 'gripper_controller' ? 1 : (j.mimic?.multiplier ?? 1),
            });
          }
          addLink(j.child, r);
        }
      };
      addLink('gripper_base', base);
      const q = new Quaternion();
      update = (w) => {
        const motor = adaptiveMotorAngle(w.gapMm);
        rotating.forEach((r) => r.group.quaternion.copy(q.setFromAxisAngle(r.axis, motor * r.multiplier)));
      };
      break;
    }
    case 'parallel': {
      // 66 mm long overall (datasheet); fingers open to 20 mm.
      mount.add(zCylinder(22, 0, 8, MATERIALS.tool));
      mount.add(box(46, 30, 34, MATERIALS.tool, 0, 0, 25));
      mount.add(box(40, 10, 4, MATERIALS.metal, 0, 0, 44));
      const left = box(7, 16, 24, MATERIALS.tool);
      const right = box(7, 16, 24, MATERIALS.tool);
      const padL = box(2, 14, 10, MATERIALS.rubber);
      const padR = box(2, 14, 10, MATERIALS.rubber);
      mount.add(left, right, padL, padR);
      update = (w) => {
        const half = w.gapMm / 2;
        left.position.set((half + 4.5) / 1000, 0, 0.054);
        right.position.set(-(half + 4.5) / 1000, 0, 0.054);
        padL.position.set((half + 1) / 1000, 0, 0.061);
        padR.position.set(-(half + 1) / 1000, 0, 0.061);
      };
      break;
    }
    case 'flexible': {
      mount.add(zCylinder(22, 0, 8, MATERIALS.tool));
      mount.add(box(56, 30, 26, MATERIALS.tool, 0, 0, 21));
      // Fin-ray fingers: orange wedges whose flat inner faces close on the object.
      // Drawn in the x/z plane (x = closing direction, z = along the flange axis).
      const fin = (mirror: boolean) => {
        const s = new Shape();
        s.moveTo(0, 0);
        s.lineTo(0.016, 0);
        s.lineTo(0.003, 0.058);
        s.lineTo(0, 0.058);
        s.lineTo(0, 0);
        const g = new ExtrudeGeometry(s, { depth: 0.02, bevelEnabled: false });
        g.translate(0, 0, -0.01);
        // Shape x -> flange x, shape y -> flange z, extrusion -> flange y.
        g.rotateX(Math.PI / 2);
        if (mirror) g.scale(-1, 1, 1);
        g.computeVertexNormals();
        const m = new Mesh(g, MATERIALS.orange);
        m.castShadow = true;
        return m;
      };
      const left = new Group();
      const right = new Group();
      left.add(fin(false));
      right.add(fin(true));
      mount.add(left, right);
      update = (w) => {
        const half = w.gapMm / 2;
        left.position.set(half / 1000, 0, 0.034);
        right.position.set(-half / 1000, 0, 0.034);
      };
      break;
    }
    case 'pump': {
      // Official mount: flange -> pump_head (0 0 0.01, rpy 1.579 0 0), visual (0 -0.008 0).
      const ph = originGroup({ xyz: { x: 0, y: 0, z: 0.01 }, rpy: { x: 1.579, y: 0, z: 0 } });
      const v = originGroup({ xyz: { x: 0, y: -0.008, z: 0 }, rpy: { x: 0, y: 0, z: 0 } });
      v.add(meshFromNode(nodes, 'pump_head'));
      ph.add(v);
      mount.add(ph);
      // Pump box beside the base (official: 150 mm to the side of the base, lying flat).
      const pb = originGroup({ xyz: { x: 0, y: -0.15, z: 0 }, rpy: { x: 1.5708, y: 3.14159, z: 0 } });
      pb.add(meshFromNode(nodes, 'pump_box'));
      baseExtras.add(pb);
      const glow = new Mesh(new SphereGeometry(0.004, 16, 12), new MeshStandardMaterial({ color: '#1fae66', emissive: '#1fae66', emissiveIntensity: 0.9 }));
      glow.position.set(0.012, 0, 0.03);
      mount.add(glow);
      update = (w) => {
        glow.visible = w.pump;
      };
      break;
    }
    case 'pen': {
      mount.add(zCylinder(22, 0, 8, MATERIALS.tool));
      mount.add(box(30, 36, 40, MATERIALS.tool, 0, 0, 28));
      const slider = new Group();
      slider.add(zCylinder(6, 40, 60, MATERIALS.metal));
      slider.add(zCylinder(4.5, 48, 98, MATERIALS.pen));
      const cone = new Mesh(new CylinderGeometry(0.0045, 0.0006, 0.006, 20), MATERIALS.dark);
      cone.rotation.x = -Math.PI / 2;
      cone.position.z = 0.101;
      slider.add(cone);
      // The holder has no lift; the pen tip only floats ±1 mm on a spring.
      mount.add(slider);
      break;
    }
    case 'phone': {
      mount.add(zCylinder(22, 0, 8, MATERIALS.tool));
      mount.add(box(24, 24, 40, MATERIALS.tool, 0, 0, 28));
      mount.add(box(80, 10, 10, MATERIALS.tool, 0, 0, 52));
      mount.add(box(8, 12, 22, MATERIALS.tool, 40, 0, 58));
      mount.add(box(8, 12, 22, MATERIALS.tool, -40, 0, 58));
      // The phone, screen facing the base, camera looking down.
      mount.add(box(76, 8, 150, MATERIALS.phone, 0, 0, 60));
      mount.add(zCylinder(3.5, 134, 135.5, MATERIALS.glass, 20, 0));
      break;
    }
    case 'omx': {
      // OMX-F's own gripper, drawn in its wrist link's frame (link5): the flange is on the gripper's
      // centre line, turned so its z runs along link5's x (public/robot/omx_f/omx_f.urdf), so the
      // fingers hang under the inverse of that turn. Two fingers swing about link5's z, the second
      // the mirror of the first (the official gripper_joint_2 mimics gripper_joint_1 by -1).
      const link5 = new Group();
      new Matrix4()
        .makeTranslation(0, -0.00165, 0)
        .multiply(new Matrix4().makeRotationFromEuler(new Euler(Math.PI, -Math.PI / 2, 0, URDF_EULER_ORDER)))
        .invert()
        .decompose(link5.position, link5.quaternion, link5.scale);
      mount.add(link5);
      const finger = (node: string, y: number) => {
        const pivot = new Group();
        pivot.position.set(0.0295, y, 0);
        pivot.add(meshFromNode(nodes, node));
        link5.add(pivot);
        return pivot;
      };
      const a = finger('omx_finger1', 0.0075);
      const b = finger('omx_finger2', -0.0108);
      update = (w) => {
        const th = omxFingerAngle(w.gapMm);
        a.rotation.z = th;
        b.rotation.z = -th;
      };
      break;
    }
    case 'cylinder': {
      mount.add(zCylinder(22, 0, 8, MATERIALS.tool));
      mount.add(zCylinder(12, 8, 64, MATERIALS.metal));
      mount.add(zCylinder(13, 60, 66, MATERIALS.tool));
      // A fixed pressing rod: the arm does the pressing.
      mount.add(zCylinder(3.5, 60, 74, MATERIALS.metal));
      mount.add(zCylinder(5, 71, 74, MATERIALS.rubber));
      break;
    }
  }

  return { group, baseExtras, handCamera, update };
}
