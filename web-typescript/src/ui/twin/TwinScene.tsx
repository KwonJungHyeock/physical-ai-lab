'use client';

/**
 * The 3D scene for /spike/twin.
 *
 * Coordinates: the URDF (like all of ROS) is Z-up, three.js is Y-up. Rather than
 * converting every number, the whole robot and every overlay drawn in robot
 * coordinates live inside one group rotated -90° about X. Everything inside that
 * group is therefore in URDF frame — including the IK target's local position —
 * so the kinematics code never has to know the viewer exists.
 *
 * Renderer is WebGL, explicitly: WebGPU is still gated or absent on the managed
 * school PCs this has to run on.
 */

import { Canvas } from '@react-three/fiber';
import { Grid, OrbitControls, TransformControls, useGLTF } from '@react-three/drei';
import { Suspense, useEffect, useMemo, useRef } from 'react';
import {
  BackSide,
  Color,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Quaternion,
  Vector3,
} from 'three';

import { DEG2RAD, URDF_EULER_ORDER, type ChainSegment } from '@/engine/robot/kinematics';
import { REACH_MM, SHOULDER_HEIGHT_M } from '@/engine/robot/limits';
import { meshNodeName, type UrdfRobot, type UrdfVisual } from '@/engine/robot/urdf';

export const MODEL_URL = '/robot/mycobot280/mycobot280.glb';
/** Self-hosted decoder: no CDN request, so an offline classroom still loads. */
export const DRACO_PATH = '/draco/';

useGLTF.preload(MODEL_URL, DRACO_PATH);

/** Top of the table, in viewer (Y-up) metres — see the floor comment below. */
const FLOOR_Y = -0.031;

const BODY_COLOR = '#e8e8ea';
const JOINT_COLOR = '#3f4046';

interface TwinSceneProps {
  robot: UrdfRobot;
  chain: readonly ChainSegment[];
  anglesDeg: readonly number[];
  showJointAxes: boolean;
  showWorkspace: boolean;
  /** IK target in URDF coordinates, metres. */
  target: Vector3;
  onTargetChange: (position: Vector3) => void;
  targetEnabled: boolean;
  onLoaded?: () => void;
}

export default function TwinScene(props: TwinSceneProps) {
  return (
    <Canvas
      // Explicit WebGL. `frameloop="demand"` would save power but the transform
      // gizmo needs continuous frames to feel right while dragging.
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      camera={{ position: [0.62, 0.48, 0.62], fov: 50, near: 0.01, far: 50 }}
      dpr={[1, 2]}
    >
      <color attach="background" args={['#0b0b0d']} />
      <hemisphereLight intensity={0.55} groundColor="#1a1a1f" />
      <directionalLight position={[2, 4, 2]} intensity={2.1} />
      <directionalLight position={[-2, 2, -1.5]} intensity={0.7} />

      {/* The table the arm is bolted to, drawn as a real surface rather than only
          a grid: "below the floor" is a condition the viewer warns about, so the
          plane it refers to should be visible.

          Height: the g_base mesh hangs 30 mm below the URDF origin (its <visual>
          origin is z = -0.03), so a plane at z = 0 would slice the mounting plate
          in half. It sits at the bottom of that plate instead. The z < 0 warning
          still uses the URDF origin, as specified — the 30 mm difference is the
          thickness of the base, not a different datum. Kept as a disc rather than
          a large quad so it reads as a desk and not as a distant wall. */}
      <group position={[0, FLOOR_Y, 0]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <circleGeometry args={[0.75, 64]} />
          <meshStandardMaterial color="#131318" roughness={1} metalness={0} />
        </mesh>
        <Grid
          args={[1.5, 1.5]}
          cellSize={0.05}
          cellColor="#2b2b33"
          sectionSize={0.1}
          sectionColor="#3f3f4a"
          fadeDistance={2.2}
          fadeStrength={1}
          followCamera={false}
        />
      </group>

      <Suspense fallback={null}>
        <SceneContents {...props} />
      </Suspense>

      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.08}
        minDistance={0.15}
        maxDistance={3}
        target={[0, 0.18, 0]}
      />
    </Canvas>
  );
}

function SceneContents({
  robot,
  chain,
  anglesDeg,
  showJointAxes,
  showWorkspace,
  target,
  onTargetChange,
  targetEnabled,
  onLoaded,
}: TwinSceneProps) {
  const { nodes } = useGLTF(MODEL_URL, DRACO_PATH);

  // Fires once the GLB has actually decoded, which is what the loading time
  // reported in the UI measures.
  useEffect(() => {
    onLoaded?.();
  }, [onLoaded]);

  return (
    // ROS Z-up -> three Y-up. Everything below is in URDF coordinates.
    <group rotation={[-Math.PI / 2, 0, 0]}>
      <WorldAxes size={0.09} />

      <LinkSubtree
        robot={robot}
        chain={chain}
        linkName={robot.rootLink}
        anglesDeg={anglesDeg}
        showJointAxes={showJointAxes}
        nodes={nodes as Record<string, Object3D>}
      />

      {showWorkspace && (
        <mesh position={[0, 0, SHOULDER_HEIGHT_M]}>
          <sphereGeometry args={[REACH_MM / 1000, 48, 32]} />
          {/* BackSide so the arm inside stays visible through the shell. */}
          <meshBasicMaterial color="#38bdf8" transparent opacity={0.06} side={BackSide} />
        </mesh>
      )}
      {showWorkspace && (
        <mesh position={[0, 0, SHOULDER_HEIGHT_M]}>
          <sphereGeometry args={[REACH_MM / 1000, 32, 20]} />
          <meshBasicMaterial color="#38bdf8" wireframe transparent opacity={0.09} />
        </mesh>
      )}

      {targetEnabled && <TargetGizmo target={target} onTargetChange={onTargetChange} />}
    </group>
  );
}

/**
 * Recursively renders the link tree. Each joint contributes two nested groups:
 * the fixed <origin> from the URDF, then the variable rotation about <axis>.
 * Keeping them separate is what lets the joint-axis helper sit exactly on the
 * real axis of rotation, which is what the joint-axis toggle is there to teach.
 */
function LinkSubtree({
  robot,
  chain,
  linkName,
  anglesDeg,
  showJointAxes,
  nodes,
}: {
  robot: UrdfRobot;
  chain: readonly ChainSegment[];
  linkName: string;
  anglesDeg: readonly number[];
  showJointAxes: boolean;
  nodes: Record<string, Object3D>;
}) {
  const link = robot.links.get(linkName);
  const children = chain.filter((segment) => segment.joint.parent === linkName);

  return (
    <group>
      {link?.visual && <LinkMesh visual={link.visual} nodes={nodes} linkName={linkName} />}

      {children.map((segment) => {
        const { origin, axis } = segment.joint;
        const angleDeg = segment.movableIndex >= 0 ? (anglesDeg[segment.movableIndex] ?? 0) : 0;
        const quaternion = new Quaternion().setFromAxisAngle(
          new Vector3(axis.x, axis.y, axis.z).normalize(),
          angleDeg * DEG2RAD,
        );

        return (
          <group
            key={segment.joint.name}
            position={[origin.xyz.x, origin.xyz.y, origin.xyz.z]}
            rotation={[origin.rpy.x, origin.rpy.y, origin.rpy.z, URDF_EULER_ORDER]}
          >
            {showJointAxes && segment.movableIndex >= 0 && (
              <JointAxes axis={new Vector3(axis.x, axis.y, axis.z)} />
            )}
            <group quaternion={quaternion}>
              <LinkSubtree
                robot={robot}
                chain={chain}
                linkName={segment.joint.child}
                anglesDeg={anglesDeg}
                showJointAxes={showJointAxes}
                nodes={nodes}
              />
            </group>
          </group>
        );
      })}
    </group>
  );
}

function LinkMesh({
  visual,
  nodes,
  linkName,
}: {
  visual: UrdfVisual;
  nodes: Record<string, Object3D>;
  linkName: string;
}) {
  const object = useMemo(() => {
    const source = nodes[meshNodeName(visual.meshFilename)];
    if (!source) return null;

    // Clone so several links could reuse one mesh without sharing a transform.
    const clone = source.clone(true);
    const material = new MeshStandardMaterial({
      color: new Color(linkName === 'g_base' ? JOINT_COLOR : BODY_COLOR),
      roughness: 0.55,
      metalness: 0.08,
    });
    clone.traverse((child) => {
      if ((child as Mesh).isMesh) {
        (child as Mesh).material = material;
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    return clone;
  }, [visual, nodes, linkName]);

  if (!object) return null;

  return (
    <group
      position={[visual.origin.xyz.x, visual.origin.xyz.y, visual.origin.xyz.z]}
      rotation={[visual.origin.rpy.x, visual.origin.rpy.y, visual.origin.rpy.z, URDF_EULER_ORDER]}
    >
      <primitive object={object} />
    </group>
  );
}

/** Small RGB triad = XYZ, the convention students will meet again in RViz. */
function WorldAxes({ size }: { size: number }) {
  return <axesHelper args={[size]} />;
}

/** Local frame at a joint, plus a highlighted arrow along its rotation axis. */
function JointAxes({ axis }: { axis: Vector3 }) {
  const direction = useMemo(() => axis.clone().normalize(), [axis]);
  return (
    <group>
      <axesHelper args={[0.035]} />
      <arrowHelper args={[direction, new Vector3(0, 0, 0), 0.06, 0xffd166, 0.014, 0.009]} />
    </group>
  );
}

/**
 * Draggable IK target. Lives inside the Z-up group, so `object.position` is
 * already in URDF coordinates and needs no conversion on the way out.
 */
function TargetGizmo({
  target,
  onTargetChange,
}: {
  target: Vector3;
  onTargetChange: (position: Vector3) => void;
}) {
  const ref = useRef<Group>(null);

  // Follow the prop when the target moves for a reason other than a drag
  // (a preset button, a reset) without fighting the gizmo mid-drag.
  useEffect(() => {
    const group = ref.current;
    if (group && !group.position.equals(target)) group.position.copy(target);
  }, [target]);

  return (
    <TransformControls
      mode="translate"
      size={0.6}
      onObjectChange={() => {
        const group = ref.current;
        if (group) onTargetChange(group.position.clone());
      }}
    >
      <group ref={ref} position={[target.x, target.y, target.z]}>
        <mesh>
          <sphereGeometry args={[0.012, 20, 16]} />
          <meshBasicMaterial color="#f472b6" />
        </mesh>
      </group>
    </TransformControls>
  );
}
