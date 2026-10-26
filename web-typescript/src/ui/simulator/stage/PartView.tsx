'use client';

/**
 * A single tool, accessory or robot, framed to fill a square (the /spike/parts page): tools hang
 * down as they do from the arm's flange, everything seen from the front-right and a little above.
 */

import { Canvas, useThree } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { Box3, Group, MeshStandardMaterial, Vector3, type Mesh, type Object3D, type PerspectiveCamera } from 'three';

import { EFFECTOR_BY_ID, type EffectorId } from '@/engine/simulator/effectors';
import { buildChain } from '@/engine/robot/kinematics';
import { parseUrdf, type UrdfRobot } from '@/engine/robot/urdf';
import { ARMS, armById } from '@/engine/robot/arms';
import type { RobotModelId } from '@/engine/robot/catalog';

import { buildArm, buildTool, partMesh, type GlbNodes } from './robotModel';
import StudioLight from './StudioLight';

const DRACO = '/draco/';
const RDK = '/robot/rdkx5/rdkx5.glb';
const BASES = '/robot/mycobot280/bases.glb';
const OMX = '/robot/omx_f/omx_f.glb';
const AGV = '/robot/myagv/myagv2023.glb';
const GRIPPER_URDF = '/robot/rdkx5/mycobot_280_rdkx5_adaptive_gripper.urdf';

type ToolPart = EffectorId | 'flange' | 'gbase';
/**
 * The parts: every tool id, `flange` (the camera flange), `gbase` (the G base the robot can stand
 * on), and whole robots for the intro: `arm:<model id>` in its home pose, `agv` (myAGV).
 */
export type PartId = ToolPart | `arm:${string}` | 'agv';

/** Frame the camera on `object` and tell the page it is ready to photograph. */
function useFraming(object: Group) {
  const get = useThree((s) => s.get);
  useEffect(() => {
    const camera = get().camera as PerspectiveCamera;
    object.updateMatrixWorld(true);
    const box = new Box3().setFromObject(object);
    const c = box.getCenter(new Vector3());
    const r = box.getSize(new Vector3()).length() / 2;
    const dir = new Vector3(1, 0.75, 1.5).normalize();
    const d = (r / Math.sin((camera.fov * Math.PI) / 360)) * 1.02;
    camera.position.copy(c).addScaledVector(dir, d);
    camera.near = d / 50;
    camera.far = d * 5;
    camera.lookAt(c);
    camera.updateProjectionMatrix();
    const t = window.setTimeout(() => document.body.setAttribute('data-ready', ''), 600);
    return () => window.clearTimeout(t);
  }, [object, get]);
}

function Tool({ part, gripper }: { part: ToolPart; gripper: UrdfRobot }) {
  const [rdk, bases, omx] = useGLTF([RDK, BASES, OMX], DRACO) as unknown as { nodes: GlbNodes }[];
  const object = useMemo(() => {
    const g = new Group();
    if (part === 'gbase') g.add(partMesh(bases.nodes, 'G_base', true));
    else if (part === 'none') g.add(partMesh(rdk.nodes, 'joint7'));
    else g.add(buildTool(part === 'flange' ? 'none' : part, part === 'flange', { ...rdk.nodes, ...omx.nodes }, gripper).group);
    // URDF z up -> three y up; tools point along the flange's +z, so they hang down.
    g.rotation.x = part === 'gbase' ? -Math.PI / 2 : Math.PI / 2;
    return g;
  }, [part, rdk, bases, omx, gripper]);
  useFraming(object);
  return <primitive object={object} />;
}

function Robot({ id, urdf }: { id: RobotModelId; urdf: string }) {
  const spec = armById(id);
  const gltfs = useGLTF(spec.glbs as string[], DRACO) as unknown as { nodes: GlbNodes }[];
  const object = useMemo(() => {
    const nodes = Object.assign({}, ...gltfs.map((g) => g.nodes)) as GlbNodes;
    const robot = parseUrdf(urdf);
    const arm = buildArm(robot, buildChain(robot), nodes, { dark: spec.dark, flange: spec.flange, textures: spec.textures, flangeLink: spec.flangeLink, finish: spec.finish });
    arm.setAngles(spec.home);
    // An arm with a gripper of its own (OMX-F) is shown holding it, as it is sold.
    if (spec.tools.length === 1 && spec.tools[0] !== 'none') arm.flange.add(buildTool(spec.tools[0], false, nodes, null).group);
    const g = new Group();
    g.add(arm.root);
    g.rotation.x = -Math.PI / 2;
    return g;
  }, [gltfs, urdf, spec]);
  useFraming(object);
  return <primitive object={object} />;
}

function Agv() {
  const { scene } = useGLTF(AGV, DRACO);
  const object = useMemo(() => {
    // As the driving console shows it (AgvStage): z up, dark metal body, rubber wheels.
    const root = scene.clone(true);
    root.rotation.x = -Math.PI / 2;
    const body = new MeshStandardMaterial({ color: '#23272e', roughness: 0.32, metalness: 0.55 });
    const rubber = new MeshStandardMaterial({ color: '#2a2e35', roughness: 0.78 });
    root.traverse((o) => {
      const m = o as Mesh;
      if (!m.isMesh) return;
      let wheel = false;
      for (let p: Object3D | null = o; p; p = p.parent) if (p.name.startsWith('wheel_')) wheel = true;
      m.material = wheel ? rubber : body;
    });
    const g = new Group();
    g.add(root);
    return g;
  }, [scene]);
  useFraming(object);
  return <primitive object={object} />;
}

export default function PartView() {
  const [part, setPart] = useState<PartId | null>(null);
  const [gripper, setGripper] = useState<UrdfRobot | null>(null);
  const [urdf, setUrdf] = useState<string | null>(null);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('part') ?? 'pump';
    const armId = q.startsWith('arm:') && q.slice(4) in ARMS ? (q.slice(4) as RobotModelId) : null;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read the address after hydration
    setPart(armId || q === 'agv' || q === 'flange' || q === 'gbase' || q in EFFECTOR_BY_ID ? (q as PartId) : 'pump');
    void fetch(GRIPPER_URDF)
      .then((r) => r.text())
      .then((t) => setGripper(parseUrdf(t)));
    if (armId)
      void fetch(armById(armId).urdf)
        .then((r) => r.text())
        .then(setUrdf);
  }, []);
  return (
    <div style={{ width: 480, height: 480, background: 'transparent' }}>
      {part && gripper && (
        <Canvas gl={{ alpha: true, preserveDrawingBuffer: true }} dpr={1.5} camera={{ fov: 30 }}>
          <StudioLight intensity={0.6} softbox />
          <hemisphereLight args={['#ffffff', '#cfd6de', 0.35]} />
          <directionalLight position={[2, 3, 2.5]} intensity={2.2} />
          <directionalLight position={[-2, 1, -2]} intensity={0.8} color="#cfe0ff" />
          <Suspense fallback={null}>
            {part === 'agv' ? (
              <Agv />
            ) : part.startsWith('arm:') ? (
              urdf && <Robot id={part.slice(4) as RobotModelId} urdf={urdf} />
            ) : (
              <Tool part={part as ToolPart} gripper={gripper} />
            )}
          </Suspense>
        </Canvas>
      )}
    </div>
  );
}
