'use client';

/**
 * 3D stage of the classroom console: the RDK X5 arm with its tool, the work
 * board, and the two cameras.
 *
 * The whole robot world lives in one group rotated -90° about X, so inside it
 * coordinates are the URDF's (Z up, metres) — the same frame the simulator and
 * the kinematics use. The simulator mutates a WorldState object; this component
 * reads it every frame instead of going through React state, so motion is as
 * smooth as the display allows.
 *
 * Look: physically based materials lit by a procedural photo studio (softbox
 * and strip lights, StudioLight.tsx — no download, works offline), soft shadows, a neutral
 * tone curve that keeps the block colours true, and in high quality ambient
 * occlusion and SMAA. The simulated cameras render without any of the
 * screen-only effects (tone mapping and post-processing apply to the screen
 * only), so the vision pipeline sees the same colours as before.
 */

import { Canvas, createPortal, useFrame, useThree } from '@react-three/fiber';
import { CameraControls, Grid, Html, useGLTF } from '@react-three/drei';
import { EffectComposer, N8AO, SMAA, ToneMapping } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import type CameraControlsImpl from 'camera-controls';
import { Fragment, Suspense, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import {
  Box3,
  BoxGeometry,
  BufferGeometry,
  type Camera,
  type WebGLRenderer,
  CanvasTexture,
  Float32BufferAttribute,
  DirectionalLight,
  Group,
  HemisphereLight,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  type Object3D,
  MeshStandardMaterial,
  NeutralToneMapping,
  NoToneMapping,
  PerspectiveCamera,
  Scene,
  TorusGeometry,
  Vector3,
  WebGLRenderTarget,
} from 'three';

import {
  ARM_MAT,
  ARUCO_6X6,
  BLOCK_MM,
  BLOCK_START,
  BUTTON,
  CAL_BOARD,
  COLORS,
  DESK_Z,
  HAND_CAMERA,
  MARKER_MM,
  MARKERS,
  PLATE,
  SPOTS,
  SPOT_NAMES,
  TOP_CAMERA,
  verticalFov,
  type Theme,
} from '@/engine/simulator/board';
import type { DeskObject, SceneId } from '@/engine/simulator/desk';
import type { EffectorId } from '@/engine/simulator/effectors';
import type { WorldState } from '@/engine/simulator/sim';
import { forwardKinematicsFrames, type ChainSegment } from '@/engine/robot/kinematics';
import { workspaceProfile } from '@/engine/physics/workspace';
import type { UrdfRobot } from '@/engine/robot/urdf';
import type { CameraId } from '@/engine/simulator/program';
import type { ImageLike, PinholeCamera } from '@/engine/vision/color';
import { jointMax, jointMin } from '@/engine/robot/limits';

import { baseDressing, buildArm, buildTool, partMesh, type GlbNodes } from './robotModel';
import StudioLight from './StudioLight';
import { jointLabels } from '../control/jointInfo';
import { useLive, type Live } from '../liveStore';
import css from '../console.module.css';
import { DESK_M, SCENE, TOOL_LAYER, addJointAxes, axesTriad, deskSpot, framing, meshBox, reachDisc, type DisplayOpts, type FreeFrame } from './sceneHelpers';
import { workspaceEnvelope } from '../../education/stage/learn3d';
import type { ArmSpec } from '@/engine/robot/arms';
import { DeskObjects, DeskPhysics, type DeskEdit } from './DeskObjects';
import { ScenePreset } from './ScenePreset';

export const MODEL_URL = '/robot/rdkx5/rdkx5.glb';
/** The AI Kit, from Elephant Robotics' own kit model (robot-python/tools/convert_meshes.py kit). */
export const KIT_URL = '/robot/rdkx5/aikit.glb';
/** The bases an arm can stand on (the G base). */
const BASES_URL = '/robot/mycobot280/bases.glb';
const DRACO_PATH = '/draco/';
useGLTF.preload(MODEL_URL, DRACO_PATH);
useGLTF.preload(KIT_URL, DRACO_PATH);

export interface CameraFrame {
  image: ImageLike;
  pinhole: PinholeCamera;
}

/** Viewpoints of the 3D view (buttons on the stage). */
export type ViewName = 'home' | 'top' | 'front' | 'side' | 'back' | 'left' | 'tall' | 'fit';

export interface StageApi {
  /**
   * Render one camera now and return its image; null when that camera is not fitted.
   * `scale` < 1 renders a smaller picture (the corner preview), much cheaper to read back.
   */
  capture(camera: CameraId, scale?: number): CameraFrame | null;
  /** Glide the view to a preset direction, framed so the arm and its work area fill the view. */
  view(name: ViewName): void;
  /** Zoom in (+1) or out (−1) one step, towards the middle of the view. */
  zoom(direction: 1 | -1): void;
  /** Frame the arm and its work area from the direction the view looks now. */
  fit(): void;
  /** Dragging with the left button moves the view sideways (pan) instead of turning it. */
  setPan(on: boolean): void;
  /** Flat (near-orthographic) projection: sizes do not shrink with distance, as on a drawing. */
  setFlat(on: boolean): void;
  /** The picture on screen now, as a PNG data URL. */
  snapshot(): string | null;
  /** Where the view looks from: azimuth around the vertical and the angle down from it, radians. */
  orient(): { azimuth: number; polar: number } | null;
}

/**
 * Viewpoints in three.js coordinates (Y up; robot x -> x, robot y -> -z, robot z -> y), metres.
 * The direction is what counts: the distance and the point looked at come from framing the
 * arm and its work area (fitView).
 */
export const VIEWS: Record<Exclude<ViewName, 'fit'>, { pos: [number, number, number]; target: [number, number, number] }> = {
  home: { pos: [0.62, 0.62, 0.72], target: [0.13, 0.06, 0] },
  top: { pos: [0.16, 1.05, 0.0005], target: [0.16, 0, 0] },
  front: { pos: [0.98, 0.3, 0], target: [0.12, 0.12, 0] },
  side: { pos: [0.18, 0.34, 0.95], target: [0.16, 0.1, 0] },
  back: { pos: [-0.8, 0.3, 0], target: [0.12, 0.12, 0] },
  left: { pos: [0.18, 0.34, -0.95], target: [0.16, 0.1, 0] },
  /** The whole arm standing straight up (0° pose, zero calibration). */
  tall: { pos: [0.72, 0.42, 0.62], target: [0.02, 0.2, 0] },
};

/** A joint this close to its limit (degrees) gets the amber ring. */
const LIMIT_WARN_DEG = 10;
/** The view's angle (degrees), and the narrow one of the flat projection. */
const VIEW_FOV = 34;
const FLAT_FOV = 5;
/** camera-controls' ACTION values (its enum is on the class, a type import here). */
const ACTION_ROTATE = 1;
const ACTION_TRUCK = 2;
const ACTION_TOUCH_ROTATE = 64;
const ACTION_TOUCH_TRUCK = 128;

interface StageProps {
  /** Stop drawing (the 교육 tab is showing instead). */
  paused?: boolean;
  theme: Theme;
  /** The arm: its model files, colours, textures and flange link (src/engine/robot/arms.ts). */
  arm: ArmSpec;
  robot: UrdfRobot;
  chain: readonly ChainSegment[];
  gripperRobot: UrdfRobot;
  world: RefObject<WorldState>;
  effector: EffectorId;
  cameraFlange: boolean;
  onApi(api: StageApi | null): void;
  /** Called with the live camera's image whenever the scene changed (at most ~4 times a second). */
  onCameraFrame?: (camera: CameraId, frame: CameraFrame) => void;
  /** Camera whose picture is streamed to onCameraFrame; null streams nothing. */
  liveCamera: CameraId | null;
  /** Size of the streamed picture: 1 = the camera's own (camera window open), less for the corner preview. */
  liveCameraScale?: number;
  /** 'high': ambient occlusion, SMAA, sharper shadows and full resolution (a PC with a decent GPU). */
  quality: 'high' | 'normal';
  /**
   * The arm follows the real robot (read about 7 times a second): glide between
   * readings instead of jumping. Off while simulating, where every frame is exact.
   */
  smoothFollow: boolean;
  /** Tool tip distance from the flange, mm, for the path line. */
  tcpMm: number;
  /**
   * A shader did not compile on this graphics card (the arm then does not
   * show): the page switches to the plain picture and reports it.
   */
  onRenderError?(message: string): void;
  /** The full picture runs too slowly on this computer (under ~28 frames a second): use the lighter one. */
  onSlow?(): void;
  /** The arm and the table are loaded and on screen. */
  onReady?(): void;
  /** Ring this joint (1..6) — the one being zero-calibrated; null for none. */
  ringJoint?: number | null;
  /** Drawing aids: frames, joint axes, path, grid, reach. */
  display: DisplayOpts;
  /**
   * Pixels of the view covered by floating panels on each side (PC layout), measured when the
   * view is framed; null when nothing floats over the view.
   */
  frameInsets?: () => { l: number; r: number; t: number; b: number } | null;
  /** Changes when panels open or fold: the view is framed again (unless the user moved it). */
  layoutKey?: string;
  /** Joint points on the arm (joint jog): pick a joint, turn the picked one on its dial; null hides them. */
  jointPick?: JointPick | null;
  /** The robot stands on a base (G base) this many mm above the table; 0 = on the table. */
  mountMm?: number;
  /** 작업대 (arm-only theme): the scene, the objects on the desk, the practice mat, editing. */
  desk?: { scene: SceneId; objects: readonly DeskObject[]; mat: boolean; edit?: DeskEdit };
  /** Where the program will leave the arm (its joint angles), drawn as a see-through arm; null for none. */
  ghost?: readonly number[] | null;
}

export interface JointPick {
  live: Live;
  /** Picked joint, 0..5. */
  selected: number;
  busy: boolean;
  onSelect(i: number): void;
  /** The dial is being turned: the joint's new angle, degrees (like dragging its slider). */
  onDrag(i: number, deg: number): void;
  onDragEnd(i: number, deg: number): void;
  /** The pointer is on a point or the dial (true) or has left it (false): keeps the points shown. */
  onHover(on: boolean): void;
}

/**
 * Render layer of the screen-only helpers (floor grid, tool path): the 3D view
 * draws it, the simulated cameras do not — a blue path line must never look
 * like a blue block to the vision program.
 */
const SCREEN_ONLY = 1;

/** The scene lights; the simulated cameras switch them to the camera lighting while they render. */
export interface Lights {
  hemi: RefObject<HemisphereLight | null>;
  key: RefObject<DirectionalLight | null>;
  fill: RefObject<DirectionalLight | null>;
}

/**
 * Light the simulated cameras see: the plain, even lighting the colour ranges
 * of the official kit program were checked against (no studio reflections).
 * Returns a function that puts the screen lighting back.
 */
function cameraLighting(scene: Scene, lights: Lights): () => void {
  const env = scene.environment;
  const hemi = lights.hemi.current;
  const key = lights.key.current;
  const fill = lights.fill.current;
  const before = [hemi?.intensity ?? 0, key?.intensity ?? 0, fill?.intensity ?? 0];
  scene.environment = null;
  if (hemi) hemi.intensity = 1.35;
  if (key) key.intensity = 1.6;
  if (fill) fill.intensity = 0.45;
  return () => {
    scene.environment = env;
    if (hemi) hemi.intensity = before[0];
    if (key) key.intensity = before[1];
    if (fill) fill.intensity = before[2];
  };
}

export default function Stage(props: StageProps) {
  const high = props.quality === 'high';
  const hemi = useRef<HemisphereLight>(null);
  const key = useRef<DirectionalLight>(null);
  const fill = useRef<DirectionalLight>(null);
  const lights = useMemo<Lights>(() => ({ hemi, key, fill }), []);
  return (
    <Canvas
      // High quality: variance shadows with a blur, soft edges like a room light. Normal: plain
      // PCF, the cheapest ('soft' = PCFSoft is deprecated in this three and falls back to it anyway).
      shadows={high ? 'variance' : 'percentage'}
      gl={{ antialias: !high, preserveDrawingBuffer: true, powerPreference: 'high-performance' }}
      dpr={high ? [1, 2] : [1, 1.5]}
      frameloop={props.paused ? 'never' : 'always'}
      camera={{ position: VIEWS.home.pos, fov: VIEW_FOV, near: 0.01, far: 20 }}
      // A new renderer per quality: antialiasing is fixed when the renderer is made.
      key={props.quality}
      onCreated={({ gl, camera }) => {
        camera.layers.enable(SCREEN_ONLY);
        camera.layers.enable(TOOL_LAYER);
        let reported = false;
        gl.debug.onShaderError = (ctx, _program, vertex, fragment) => {
          if (reported) return;
          reported = true;
          const log = `${ctx.getShaderInfoLog(fragment) ?? ''} ${ctx.getShaderInfoLog(vertex) ?? ''}`.trim();
          props.onRenderError?.(log.slice(0, 300) || '셰이더 오류');
        };
        // With post-processing the composer applies the tone curve at the end instead.
        gl.toneMapping = high ? NoToneMapping : NeutralToneMapping;
        gl.toneMappingExposure = 1;
      }}
    >
      <color attach="background" args={[SCENE.sky]} />
      <StudioLight intensity={0.5} softbox />
      <hemisphereLight ref={hemi} args={['#ffffff', '#cfd6de', 0.3]} />
      <directionalLight
        ref={key}
        position={[0.55, 1.35, 0.45]}
        intensity={2.5}
        castShadow
        shadow-mapSize={high ? [4096, 4096] : [2048, 2048]}
        shadow-camera-left={-0.55}
        shadow-camera-right={0.55}
        shadow-camera-top={0.55}
        shadow-camera-bottom={-0.55}
        shadow-camera-near={0.3}
        shadow-camera-far={3}
        shadow-bias={-0.0003}
        shadow-normalBias={0.002}
        shadow-radius={high ? 6 : 4}
        shadow-blurSamples={high ? 16 : 10}
      />
      <directionalLight ref={fill} position={[-0.9, 0.55, -0.7]} intensity={0.35} color="#dfe8ff" />
      {/* Rim light from behind: a cool edge along the arm's silhouette against the dark backdrop. 3D view only. */}
      <directionalLight position={[-0.35, 0.95, -1.2]} intensity={1.15} color="#cfe0ff" onUpdate={(l) => l.layers.set(SCREEN_ONLY)} />
      <Suspense fallback={null}>
        <World {...props} lights={lights} />
      </Suspense>
      {props.display.grid && (
        <Grid
          onUpdate={(g) => g.layers.set(SCREEN_ONLY)}
          position={[0.14, (props.theme === 'kit' ? DESK_Z : 0) / 1000 + 0.0001, 0]}
          infiniteGrid
          cellSize={0.01}
          cellThickness={0.7}
          cellColor={SCENE.cell}
          sectionSize={0.1}
          sectionThickness={1}
          sectionColor={SCENE.section}
          fadeDistance={2.4}
          fadeStrength={1.4}
        />
      )}
      <CameraControls
        makeDefault
        smoothTime={0.25}
        minDistance={0.1}
        maxDistance={2.6}
        maxPolarAngle={Math.PI * 0.49}
        // The wheel zooms towards the point under the mouse, in gentle steps.
        dollyToCursor
        dollySpeed={0.6}
      />
      {high && props.onSlow && <FrameWatch onSlow={props.onSlow} />}
      {high && (
        <EffectComposer multisampling={0} enableNormalPass={false}>
          <N8AO aoRadius={0.05} distanceFalloff={0.6} intensity={2.2} quality="medium" halfRes />
          <SMAA />
          <ToneMapping mode={ToneMappingMode.NEUTRAL} />
        </EffectComposer>
      )}
    </Canvas>
  );
}

function World({
  theme,
  arm: spec,
  robot,
  chain,
  gripperRobot,
  world,
  effector,
  cameraFlange,
  onApi,
  onCameraFrame,
  liveCamera,
  liveCameraScale = 1,
  smoothFollow,
  tcpMm,
  lights,
  onReady,
  ringJoint,
  onRenderError,
  display,
  frameInsets,
  layoutKey,
  jointPick,
  mountMm = 0,
  desk,
  ghost,
}: StageProps & { lights: Lights }) {
  // Every node of the arm's model files, by name (a later file wins a shared name).
  const gltfs = useGLTF(spec.glbs as string[], DRACO_PATH) as unknown as { nodes: GlbNodes }[];
  const nodes = useMemo(() => Object.assign({}, ...gltfs.map((g) => g.nodes)) as GlbNodes, [gltfs]);
  const root = useRef<Group>(null);

  const arm = useMemo(() => buildArm(robot, chain, nodes, { dark: spec.dark, flange: spec.flange, textures: spec.textures, flangeLink: spec.flangeLink }), [robot, chain, nodes, spec]);
  // The program's end pose: the same arm, see-through blue, on screen only (not in the camera pictures).
  const ghostArm = useMemo(() => {
    const g = buildArm(robot, chain, nodes, { dark: spec.dark, flange: spec.flange, textures: spec.textures, flangeLink: spec.flangeLink });
    const mat = new MeshBasicMaterial({ color: '#6f9bff', transparent: true, opacity: 0.2, depthWrite: false });
    g.root.traverse((o) => {
      const m = o as Mesh;
      if (!m.isMesh) return;
      m.material = mat;
      m.castShadow = false;
      m.receiveShadow = false;
      m.layers.set(SCREEN_ONLY);
    });
    return g;
  }, [robot, chain, nodes, spec]);
  useEffect(() => {
    if (ghost) ghostArm.setAngles(ghost);
  }, [ghost, ghostArm]);
  // A joint near its limit gets a pulsing amber ring around its axis (the monitor flags it too).
  const halos = useMemo(
    () =>
      arm.joints.map((j) => {
        const m = new Mesh(new TorusGeometry(0.042, 0.0032, 8, 48), new MeshBasicMaterial({ color: '#ffad1f', transparent: true, depthTest: false }));
        m.quaternion.setFromUnitVectors(new Vector3(0, 0, 1), j.axis.clone().normalize());
        m.visible = false;
        m.renderOrder = 10;
        m.layers.set(SCREEN_ONLY);
        j.group.add(m);
        return m;
      }),
    [arm],
  );
  useEffect(
    () => () =>
      halos.forEach((h) => {
        h.parent?.remove(h);
        h.geometry.dispose();
        (h.material as MeshBasicMaterial).dispose();
      }),
    [halos],
  );
  useFrame(({ clock }) => {
    const q = world.current?.angles;
    if (!q) return;
    const lo = jointMin();
    const hi = jointMax();
    const pulse = 0.5 + 0.45 * Math.sin(clock.elapsedTime * 6);
    halos.forEach((h, i) => {
      const a = q[i];
      const near = a !== undefined && lo[i] !== undefined && (a - lo[i] < LIMIT_WARN_DEG || hi[i] - a < LIMIT_WARN_DEG);
      h.visible = near;
      if (near) (h.material as MeshBasicMaterial).opacity = pulse;
    });
  });
  // Cables and the contact shadow around the base, on the table (or on the block the arm stands on).
  const dressing = useMemo(() => baseDressing(arm.root, mountMm / 1000), [arm, mountMm]);
  useEffect(
    () => () =>
      dressing.traverse((o) => {
        const m = o as Mesh;
        if (m.isMesh) m.geometry.dispose();
      }),
    [dressing],
  );
  useEffect(() => setJointRing(arm, ringJoint ?? null), [arm, ringJoint]);
  const ready = useRef(false);
  useFrame(() => {
    if (ready.current) return;
    ready.current = true;
    onReady?.();
  });
  const { gl, camera } = useThree();
  const checked = useRef(0);
  const misses = useRef(0);
  const displayReach = useRef(display.reach);
  useEffect(() => {
    displayReach.current = display.reach;
  }, [display.reach]);
  const pending = useRef<(() => number | null | undefined) | null>(null);
  useFrame(() => {
    // Some graphics drivers compile the shaders yet draw nothing (the path line and the grid
    // show, the robot does not). Once, shortly after the first frames, look at the screen where
    // the robot's dark base must be; light pixels there mean it was not drawn.
    if (pending.current) {
      const lum = pending.current();
      if (lum === undefined) return;
      pending.current = null;
      // Read while the workspace shell was switched on: not a fair reading, try again later.
      if (displayReach.current) {
        checked.current = 0;
        return;
      }
      // The base reads about 0.13; the lit desk under it about 0.37. One light reading can be a frame
      // caught while the view changed (the panels fold for a run): only three in a row are reported.
      if (lum !== null && lum > 0.25) {
        misses.current += 1;
        if (misses.current < 3) checked.current = 0;
        else onRenderError?.(`로봇이 화면에 그려지지 않았어요 (밝기 ${lum.toFixed(2)})`);
      }
      return;
    }
    if (checked.current < 0) return;
    // The workspace shell tints the base blue: no reading then (it would look like no robot).
    if (displayReach.current) return;
    checked.current += 1;
    if (checked.current < 45 || !root.current) return;
    checked.current = -1;
    unbindPixelPack(gl);
    pending.current = readBaseLuminance(gl, camera, arm.root.children[0] ?? arm.root);
  });
  const tool = useMemo(() => buildTool(effector, cameraFlange, nodes, gripperRobot), [effector, cameraFlange, nodes, gripperRobot]);

  useEffect(() => {
    // The hand camera looks past the tool it is fitted beside: the gripper body and the camera
    // flange itself would fill its picture, so they go on a layer only the 3D view and the kit
    // camera draw.
    tool.group.traverse((o) => {
      if (o !== tool.handCamera) o.layers.set(TOOL_LAYER);
    });
    arm.flange.add(tool.group);
    return () => {
      arm.flange.remove(tool.group);
    };
  }, [arm, tool]);

  // Angles on screen: the world's, or gliding towards them when following the real robot.
  const shown = useRef<number[] | null>(null);
  useFrame((_, dt) => {
    const w = world.current;
    if (!w) return;
    if (!smoothFollow || !shown.current) shown.current = w.angles.slice();
    else {
      // Critically damped towards the latest reading (~60 ms), so 10 readings a second look like motion.
      const k = 1 - Math.exp(-Math.min(dt, 0.1) / 0.06);
      shown.current = shown.current.map((a, i) => a + (w.angles[i] - a) * k);
    }
    arm.setAngles(shown.current);
    tool.update(w);
  });

  // Framing: on load, on a theme change, on the view buttons, and when the view is resized
  // (unless the user has turned or zoomed the view since). Done in a frame, after the arm is posed.
  const controls = useThree((s) => s.controls) as CameraControlsImpl | null;
  const size = useThree((s) => s.size);
  const fitReq = useRef<{ name: ViewName; animate: boolean } | null>({ name: 'home', animate: false });
  const lastView = useRef<ViewName>('home');
  const userMoved = useRef(false);
  useFrame(() => {
    const req = fitReq.current;
    if (!req || !controls || !root.current) return;
    fitReq.current = null;
    const f = fitView(req.name, root.current, arm.root, theme, camera as PerspectiveCamera, freeFrame(frameInsets?.() ?? null, gl.domElement.clientWidth, gl.domElement.clientHeight));
    void controls.setLookAt(f.position.x, f.position.y, f.position.z, f.target.x, f.target.y, f.target.z, req.animate);
    if (req.name !== 'fit') lastView.current = req.name;
    userMoved.current = false;
  });
  const themeSeen = useRef(theme);
  useEffect(() => {
    if (themeSeen.current === theme) return;
    themeSeen.current = theme;
    fitReq.current = { name: 'home', animate: true };
  }, [theme]);
  useEffect(() => {
    if (!userMoved.current && !fitReq.current) fitReq.current = { name: lastView.current, animate: true };
  }, [size.width, size.height, layoutKey]);
  useEffect(() => {
    if (!controls) return;
    const moved = () => {
      userMoved.current = true;
    };
    controls.addEventListener('controlstart', moved);
    return () => controls.removeEventListener('controlstart', moved);
  }, [controls]);
  const gl3 = useThree((s) => s.gl);
  const getThree = useThree((s) => s.get);
  const viewApi: Omit<StageApi, 'capture'> = {
    view: (name: ViewName) => {
      fitReq.current = { name, animate: true };
    },
    zoom: (direction: 1 | -1) => {
      if (!controls) return;
      userMoved.current = true;
      // One step = a quarter of the distance to the target, so it feels the same near and far.
      void controls.dolly(controls.distance * 0.25 * direction, true);
    },
    fit: () => {
      fitReq.current = { name: 'fit', animate: true };
    },
    setPan: (on: boolean) => {
      const c = getThree().controls as CameraControlsImpl | null;
      if (!c) return;
      c.mouseButtons.left = on ? ACTION_TRUCK : ACTION_ROTATE;
      c.touches.one = on ? ACTION_TOUCH_TRUCK : ACTION_TOUCH_ROTATE;
    },
    setFlat: (on: boolean) => {
      const { controls: c0, camera: cam0 } = getThree();
      const c = c0 as CameraControlsImpl | null;
      const cam = cam0 as PerspectiveCamera;
      const fov = on ? FLAT_FOV : VIEW_FOV;
      if (!c || cam.fov === fov) return;
      // The same picture size at the target: the distance grows as the angle narrows.
      const k = Math.tan(((cam.fov / 2) * Math.PI) / 180) / Math.tan(((fov / 2) * Math.PI) / 180);
      cam.fov = fov;
      cam.far = on ? 80 : 20;
      cam.near = on ? 0.1 : 0.01;
      cam.updateProjectionMatrix();
      c.minDistance = on ? 0.1 * (VIEW_FOV / FLAT_FOV) : 0.1;
      c.maxDistance = on ? 2.6 * (VIEW_FOV / FLAT_FOV) : 2.6;
      void c.dollyTo(c.distance * k, false);
    },
    snapshot: () => {
      try {
        return gl3.domElement.toDataURL('image/png');
      } catch {
        return null;
      }
    },
    orient: () => (controls ? { azimuth: controls.azimuthAngle, polar: controls.polarAngle } : null),
  };

  // Drawing aids (표시 menu).
  const baseAxes = useMemo(() => axesTriad(0.1, 0.0022, ['X', 'Y', 'Z'], SCREEN_ONLY), []);
  const toolAxes = useMemo(() => axesTriad(0.045, 0.0014, ['x', 'y', 'z'], SCREEN_ONLY), []);
  const reach = useMemo(() => reachDisc(0, SCREEN_ONLY, spec.reachMm), [spec.reachMm]);
  // The 3D workspace (everywhere the flange can reach), sampled once when first shown (~0.3 s).
  const [shell, setShell] = useState<ReturnType<typeof workspaceEnvelope> | null>(null);
  useEffect(() => {
    if (!display.reach || shell) return;
    const id = window.setTimeout(() => {
      const f = forwardKinematicsFrames(chain, [0, 45.87, -92.37, -41.3, 0, 0]);
      const e = f[f.length - 1].elements;
      const env = workspaceEnvelope(workspaceProfile(chain), (Math.atan2(e[13], e[12]) * 180) / Math.PI);
      env.group.traverse((c) => c.layers.set(SCREEN_ONLY));
      setShell(env);
    }, 30);
    return () => window.clearTimeout(id);
  }, [display.reach, chain, shell]);
  // The workspace's cross-section stays in the vertical plane through the tool tip.
  const tipAt = useMemo(() => new Vector3(), []);
  useFrame(() => {
    if (!shell || !display.reach) return;
    arm.flange.getWorldPosition(tipAt);
    arm.root.worldToLocal(tipAt);
    shell.setAzimuth(Math.atan2(tipAt.y, tipAt.x));
  });
  useEffect(() => {
    if (!display.toolAxes) return;
    return attachAt(arm.flange, toolAxes, tcpMm / 1000);
  }, [arm, toolAxes, tcpMm, display.toolAxes]);
  useEffect(() => (display.jointAxes ? addJointAxes(arm.joints, SCREEN_ONLY) : undefined), [arm, display.jointAxes]);

  return (
    <group ref={root} rotation={[-Math.PI / 2, 0, 0]}>
      <Desk z={theme === 'kit' ? DESK_Z : 0} />
      {theme === 'kit' ? (
        <>
          <Kit />
          <CalibrationBoard />
        </>
      ) : (
        <>
          {desk && desk.scene !== 'empty' && desk.scene !== 'kit' && <ScenePreset id={desk.scene} />}
          {(desk?.mat ?? true) && <WorkMat />}
          {desk && <DeskObjects world={world} objects={desk.objects} edit={desk.edit} />}
          {desk && <DeskPhysics world={world} chain={chain} tcpMm={tcpMm} effector={effector} />}
        </>
      )}
      <Blocks world={world} />
      {effector === 'cylinder' && <PushButton world={world} />}
      <PenTrail world={world} />
      {mountMm > 0 && <MountBase mm={mountMm} />}
      {theme === 'arm' && <primitive object={dressing} />}
      {/* On a base the arm and its base axes stand mountMm above the table; the table, kit and blocks stay put. */}
      <group position={[0, 0, mountMm / 1000]}>
        <primitive object={arm.root} />
        {ghost && <primitive object={ghostArm.root} />}
        {display.baseAxes && <primitive object={baseAxes} />}
        {display.reach && shell && <primitive object={shell.group} />}
      </group>
      {jointPick && arm.joints.map((j, i) => <Fragment key={i}>{createPortal(<JointPoint i={i} axis={j.axis} group={j.group} pick={jointPick} />, j.group)}</Fragment>)}
      {display.reach && <primitive object={reach} />}
      {display.path && <ToolPath world={world} flange={arm.flange} tcpMm={tcpMm} root={root} />}
      <CameraRig
        root={root}
        tool={tool}
        world={world}
        topAvailable={theme === 'kit'}
        onApi={onApi}
        onCameraFrame={onCameraFrame}
        liveCamera={liveCamera}
        liveCameraScale={liveCameraScale}
        lights={lights}
        viewApi={viewApi}
      />
    </group>
  );
}

/**
 * The base under the robot: the official myCobot G base (Elephant Robotics' mesh), centred under the
 * robot's foot, standing on the table and reaching up to the robot's height above it — its own
 * thickness when the height is left as it is, stretched or squeezed for another height.
 */
function MountBase({ mm }: { mm: number }) {
  const { nodes } = useGLTF(BASES_URL, DRACO_PATH) as unknown as { nodes: GlbNodes };
  const base = useMemo(() => {
    const mesh = partMesh(nodes, 'G_base', true);
    mesh.traverse((o) => {
      if ((o as Mesh).isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    const inner = new Group();
    inner.add(mesh);
    inner.updateMatrixWorld(true);
    const box = new Box3().setFromObject(inner);
    const c = box.getCenter(new Vector3());
    mesh.position.set(-c.x, -c.y, -box.min.z);
    const outer = new Group();
    outer.add(inner);
    return { group: outer, height: box.max.z - box.min.z };
  }, [nodes]);
  base.group.scale.set(1, 1, mm / 1000 / base.height);
  return <primitive object={base.group} />;
}

/** Put `o` on `parent` at `z` metres along its Z axis; returns a function that takes it off. */
function attachAt(parent: Group, o: Group, z: number): () => void {
  o.position.set(0, 0, z);
  parent.add(o);
  return () => {
    parent.remove(o);
  };
}

/** Work area per theme, robot frame, mm: the kit's plate and bins, or the arm's mat. */
const WORK_AREA: Record<Theme, { min: [number, number, number]; max: [number, number, number] }> = {
  kit: { min: [-40, -215, -8], max: [320, 225, 40] },
  arm: { min: [40, -160, 0], max: [300, 160, 10] },
};
/** The arm standing straight up (0° pose), robot frame, mm. */
const UPRIGHT = { min: [-60, -60, 0] as const, max: [60, 60, 470] as const };

/** The uncovered part of a w × h view, from the panel insets in pixels. */
function freeFrame(insets: { l: number; r: number; t: number; b: number } | null, w: number, h: number): FreeFrame | undefined {
  if (!insets || w <= 0 || h <= 0) return undefined;
  const fw = Math.max(0.3 * w, w - insets.l - insets.r);
  const fh = Math.max(0.3 * h, h - insets.t - insets.b);
  const cxPx = insets.l + fw / 2;
  const cyPx = insets.t + fh / 2;
  return { sx: fw / w, sy: fh / h, cx: (cxPx / w) * 2 - 1, cy: 1 - (cyPx / h) * 2 };
}

/** Camera position and target for a view: its direction, framed on the arm (as posed now) and the work area. */
function fitView(name: ViewName, root: Group, arm: Group, theme: Theme, camera: PerspectiveCamera, free?: FreeFrame): { position: Vector3; target: Vector3 } {
  root.updateWorldMatrix(true, false);
  const toWorld = (min: readonly number[], max: readonly number[]) =>
    new Box3(new Vector3(min[0], min[1], min[2]).multiplyScalar(0.001), new Vector3(max[0], max[1], max[2]).multiplyScalar(0.001)).applyMatrix4(root.matrixWorld);
  const box = meshBox(arm);
  const area = WORK_AREA[theme];
  box.union(toWorld(area.min, area.max));
  if (name === 'tall') box.union(toWorld(UPRIGHT.min, UPRIGHT.max));
  let dir: Vector3;
  if (name === 'fit') dir = camera.getWorldDirection(new Vector3()).negate();
  else {
    const v = VIEWS[name];
    dir = new Vector3(...v.pos).sub(new Vector3(...v.target));
  }
  return framing(box, dir, camera, 0.045, free);
}

/* --- the AI Kit ------------------------------------------------------------- */

/** The desk: a plane lit like a spot under the robot (sceneHelpers' SCENE · deskSpot). */
function Desk({ z }: { z: number }) {
  const spot = useMemo(() => deskSpot(), []);
  useEffect(() => () => spot.dispose(), [spot]);
  return (
    <mesh position={[0.14, 0, z / 1000 - 0.0005]} receiveShadow>
      <boxGeometry args={[DESK_M, DESK_M, 0.001]} />
      <meshStandardMaterial map={spot} roughness={0.95} />
    </mesh>
  );
}

/**
 * The path of the tool tip, last few seconds of motion, fading out: shows
 * where a program took the tool (and in robot mode, where the real arm went).
 * Cleared when the world is reset.
 */
const PATH_POINTS = 480;

/**
 * The picture quality is chosen by itself: after the scene settles (2 s), three seconds of frames are
 * counted; fewer than 28 a second and the lighter picture is used instead.
 */
function FrameWatch({ onSlow }: { onSlow(): void }) {
  const t = useRef({ time: 0, frames: 0, done: false });
  useFrame((_, dt) => {
    const w = t.current;
    if (w.done || document.hidden) return;
    w.time += Math.min(dt, 0.5);
    if (w.time < 2) return;
    w.frames += 1;
    if (w.time < 5) return;
    w.done = true;
    if (w.frames / (w.time - 2) < 28) onSlow();
  });
  return null;
}

/** Reads into client memory need no pixel buffer bound (an asynchronous read binds one while it waits). */
function unbindPixelPack(gl: WebGLRenderer): void {
  const ctx = gl.getContext();
  if ('PIXEL_PACK_BUFFER' in ctx) ctx.bindBuffer(ctx.PIXEL_PACK_BUFFER, null);
}

/**
 * Average brightness (0..1) of the last drawn frame around the robot's base,
 * which is dark grey in every theme. The pixels are read without waiting for
 * the GPU (a waiting read stalls the page for as long as the GPU is behind,
 * seconds with a software renderer, and a held jog's keep-alive with it):
 * returns a poll that gives undefined until the pixels are there, then the
 * brightness; null when the base is off screen or the read failed.
 */
/**
 * The darkest of five small patches over the base link: its middle and four points around it,
 * from its own bounding box (some bases, like the 4-axis arms', sit off the URDF origin), so a
 * line drawn over the base (the base axes) cannot make a drawn robot look missing.
 */
function readBaseLuminance(gl: WebGLRenderer, camera: Camera, base: Object3D): () => number | null | undefined {
  base.updateMatrixWorld(true);
  const box = new Box3().setFromObject(base);
  if (box.isEmpty()) return () => null;
  const c = box.getCenter(new Vector3());
  const half = box.getSize(new Vector3()).multiplyScalar(0.25);
  const canvas = gl.domElement;
  const points: [number, number][] = [];
  for (const [dx, dy] of [
    [0, 0],
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]) {
    const p = new Vector3(c.x + dx * half.x, c.y, c.z + dy * half.z).project(camera);
    if (Math.abs(p.x) > 0.95 || Math.abs(p.y) > 0.95 || p.z > 1) continue;
    points.push([Math.round(((p.x + 1) / 2) * canvas.width), Math.round(((p.y + 1) / 2) * canvas.height)]);
  }
  if (!points.length) return () => null;
  const ctx = gl.getContext() as WebGL2RenderingContext;
  const patch = 5 * 5 * 4;
  const px = new Uint8Array(patch * points.length);
  const buf = ctx.createBuffer();
  ctx.bindBuffer(ctx.PIXEL_PACK_BUFFER, buf);
  ctx.bufferData(ctx.PIXEL_PACK_BUFFER, px.byteLength, ctx.STREAM_READ);
  ctx.bindFramebuffer(ctx.FRAMEBUFFER, null);
  points.forEach(([x, y], i) => ctx.readPixels(x - 2, y - 2, 5, 5, ctx.RGBA, ctx.UNSIGNED_BYTE, i * patch));
  ctx.bindBuffer(ctx.PIXEL_PACK_BUFFER, null);
  const sync = ctx.fenceSync(ctx.SYNC_GPU_COMMANDS_COMPLETE, 0);
  ctx.flush();
  const done = () => {
    if (sync) ctx.deleteSync(sync);
    ctx.deleteBuffer(buf);
  };
  return () => {
    const status = sync ? ctx.clientWaitSync(sync, 0, 0) : ctx.WAIT_FAILED;
    if (status === ctx.TIMEOUT_EXPIRED) return undefined;
    if (status === ctx.WAIT_FAILED) {
      done();
      return null;
    }
    ctx.bindBuffer(ctx.PIXEL_PACK_BUFFER, buf);
    ctx.getBufferSubData(ctx.PIXEL_PACK_BUFFER, 0, px);
    ctx.bindBuffer(ctx.PIXEL_PACK_BUFFER, null);
    done();
    let darkest = Infinity;
    for (let k = 0; k < points.length; k += 1) {
      let sum = 0;
      for (let i = 0; i < 25; i += 1) {
        const o = k * patch + i * 4;
        sum += (0.2126 * px[o] + 0.7152 * px[o + 1] + 0.0722 * px[o + 2]) / 255;
      }
      darkest = Math.min(darkest, sum / 25);
    }
    return darkest;
  };
}

const DIAL_R = 62;
/** Screen point at `deg` (counter-clockwise from 3 o'clock) on a circle of radius r around (80, 80). */
const dialAt = (deg: number, r = DIAL_R) => [80 + r * Math.cos((deg * Math.PI) / 180), 80 - r * Math.sin((deg * Math.PI) / 180)] as const;

/**
 * A joint's point on the arm (a page element that follows the joint on screen). The picked
 * joint gets a dial facing the viewer: drag round the ring and the joint turns the same way
 * as the drag goes round (the joint's axis decides which way that is from this viewpoint);
 * seen edge-on, where turning round would be ambiguous, drag sideways instead.
 */
function JointPoint({ i, axis, group, pick }: { i: number; axis: Vector3; group: Group; pick: JointPick }) {
  const sel = i === pick.selected;
  const deg = useLive(pick.live, (v) => v.angles[i] ?? 0);
  const camera = useThree((s) => s.camera);
  // +1: the axis points at the viewer (counter-clockwise on screen = +), −1: away, 0: edge-on.
  const [facing, setFacing] = useState<-1 | 0 | 1>(1);
  const tmp = useRef<{ a: Vector3; p: Vector3 } | null>(null);
  useFrame(() => {
    if (!sel) return;
    const t = (tmp.current ??= { a: new Vector3(), p: new Vector3() });
    t.a.copy(axis).transformDirection(group.matrixWorld);
    group.getWorldPosition(t.p);
    const d = t.a.dot(t.p.sub(camera.position).negate().normalize());
    const f = Math.abs(d) < 0.3 ? 0 : d > 0 ? 1 : -1;
    if (f !== facing) setFacing(f);
  });
  // A point that goes away under the pointer (hidden, another view) no longer holds the points.
  const hovered = useRef(false);
  const hoverRef = useRef(pick.onHover);
  useEffect(() => {
    hoverRef.current = pick.onHover;
  });
  useEffect(
    () => () => {
      if (hovered.current) hoverRef.current(false);
    },
    [],
  );
  const hover = (on: boolean) => {
    hovered.current = on;
    pick.onHover(on);
  };
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<{ id: number; cx: number; cy: number; last: number; turned: number; x0: number; start: number; to: number; raf: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const lo = jointMin()[i];
  const hi = jointMax()[i];
  const screenAngle = (x: number, y: number, d: { cx: number; cy: number }) => Math.atan2(-(y - d.cy), x - d.cx);
  const finish = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    cancelAnimationFrame(d.raf);
    drag.current = null;
    setDragging(false);
    pick.onDrag(i, d.to);
    pick.onDragEnd(i, d.to);
  };
  // J1's point sits on the base body, below the shoulder (their centres coincide on screen).
  const at: [number, number, number] = i === 0 ? [-axis.x * 0.07, -axis.y * 0.07, -axis.z * 0.07] : [0, 0, 0];
  const shownAngle = facing === 0 ? 0 : facing * deg;
  const [hx, hy] = dialAt(shownAngle);
  const [zx, zy] = dialAt(0);
  const big = Math.abs(shownAngle) > 180 ? 1 : 0;
  return (
    <Html position={at} zIndexRange={[4, 1]} pointerEvents="none" eps={0.5}>
      <div className={css.jpt} data-sel={sel || undefined}>
        {sel && (
          <>
            <svg ref={svg} className={css.jptDial} viewBox="0 0 160 160" data-drag={dragging || undefined} aria-hidden="true">
              <circle cx="80" cy="80" r={DIAL_R} fill="#2f5bea" fillOpacity="0.05" stroke="#2f5bea" strokeWidth="2" />
              {Array.from({ length: 36 }, (_, k) => {
                const long = k % 3 === 0;
                const [x1, y1] = dialAt(k * 10);
                const [x2, y2] = dialAt(k * 10, DIAL_R + (long ? 7 : 3.5));
                return <line key={k} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#2f5bea" strokeWidth={long ? 1.4 : 0.8} opacity="0.65" />;
              })}
              <line x1="80" y1="80" x2={zx} y2={zy} stroke="#2f5bea" strokeWidth="1.2" strokeDasharray="3 3" />
              {shownAngle !== 0 && <path d={`M80 80 L${zx} ${zy} A${DIAL_R} ${DIAL_R} 0 ${big} ${shownAngle > 0 ? 0 : 1} ${hx} ${hy} Z`} fill="#2f5bea" fillOpacity="0.16" />}
              <circle cx={hx} cy={hy} r="8" fill="#2f5bea" stroke="#fff" strokeWidth="3" />
              <circle
                className={css.jptHit}
                cx="80"
                cy="80"
                r={DIAL_R}
                fill="none"
                stroke="transparent"
                strokeWidth="22"
                onPointerDown={(e) => {
                  if (pick.busy || e.button !== 0 || !svg.current) return;
                  e.stopPropagation();
                  const r = svg.current.getBoundingClientRect();
                  const d = { id: e.pointerId, cx: r.left + r.width / 2, cy: r.top + r.height / 2, last: 0, turned: 0, x0: e.clientX, start: deg, to: deg, raf: 0 };
                  d.last = screenAngle(e.clientX, e.clientY, d);
                  e.currentTarget.setPointerCapture(e.pointerId);
                  drag.current = d;
                  setDragging(true);
                }}
                onPointerMove={(e) => {
                  const d = drag.current;
                  if (!d || d.id !== e.pointerId) return;
                  let delta: number;
                  if (facing === 0) delta = (e.clientX - d.x0) * 0.5;
                  else {
                    const a = screenAngle(e.clientX, e.clientY, d);
                    let da = a - d.last;
                    if (da > Math.PI) da -= 2 * Math.PI;
                    if (da < -Math.PI) da += 2 * Math.PI;
                    d.last = a;
                    d.turned += da;
                    delta = (facing * d.turned * 180) / Math.PI;
                  }
                  d.to = Math.round(Math.min(hi, Math.max(lo, d.start + delta)) * 10) / 10;
                  if (!d.raf)
                    d.raf = requestAnimationFrame(() => {
                      d.raf = 0;
                      pick.onDrag(i, d.to);
                    });
                }}
                onPointerUp={finish}
                onPointerCancel={finish}
                onPointerEnter={() => hover(true)}
                onPointerLeave={() => hover(false)}
              />
            </svg>
            <div className={css.jptChip}>
              <small>
                J{i + 1} · {jointLabels()[i].name}
              </small>
              <b>
                {deg >= 0 ? '+' : '−'}
                {Math.abs(deg).toFixed(1)}°
              </b>
              <span>{pick.busy ? '움직이는 중' : facing === 0 ? '링을 좌우로 끌어 회전' : '링을 돌려 끌어 회전'}</span>
            </div>
          </>
        )}
        <button
          type="button"
          className={css.jptDot}
          aria-pressed={sel}
          aria-label={`관절 ${i + 1} ${jointLabels()[i].name} 고르기`}
          onClick={() => pick.onSelect(i)}
          onPointerEnter={() => hover(true)}
          onPointerLeave={() => hover(false)}
        >
          {i + 1}
        </button>
        {!sel && (
          <span className={css.jptTag}>
            <em>J{i + 1}</em>
            {jointLabels()[i].name}
          </span>
        )}
      </div>
    </Html>
  );
}

/** One ring per arm, around the joint being zero-calibrated (drawn over the arm, screen only). */
const RINGS = new WeakMap<object, Mesh>();

function setJointRing(arm: ReturnType<typeof buildArm>, joint: number | null): void {
  let ring = RINGS.get(arm);
  if (!ring) {
    ring = new Mesh(new TorusGeometry(0.048, 0.0032, 12, 72), new MeshBasicMaterial({ color: '#3454d1', transparent: true, opacity: 0.9, depthTest: false }));
    ring.renderOrder = 10;
    ring.layers.set(SCREEN_ONLY);
    RINGS.set(arm, ring);
  }
  ring.removeFromParent();
  if (!joint) return;
  const j = arm.joints[joint - 1];
  if (!j) return;
  // The torus lies in its XY plane: turn its axis (+Z) onto the joint axis.
  ring.quaternion.setFromUnitVectors(new Vector3(0, 0, 1), j.axis.clone().normalize());
  j.group.add(ring);
}

/**
 * The line is always drawn, fully transparent while it has no path: its shader then compiles
 * with the rest of the scene while the model loads, not in the middle of the first jog (a
 * slow graphics chip can take seconds to compile it, and the page stands still meanwhile).
 */
function newPathLine(): Line2 {
  const material = new LineMaterial({ linewidth: 2.5, vertexColors: true, transparent: true, depthWrite: false });
  const l = new Line2(new LineGeometry(), material);
  l.frustumCulled = false;
  l.renderOrder = 2;
  l.layers.set(SCREEN_ONLY);
  clearPath(l);
  return l;
}

/** Add the tip position (robot frame, metres) to the path and redraw it; returns the new point list. */
function extendPath(line: Line2, pts: number[], tip: Vector3): number[] {
  const n = pts.length;
  if (n >= 3 && Math.hypot(pts[n - 3] - tip.x, pts[n - 2] - tip.y, pts[n - 1] - tip.z) < 0.0015) return pts;
  const next = [...pts.slice(Math.max(0, n - (PATH_POINTS - 1) * 3)), tip.x, tip.y, tip.z];
  if (next.length < 6) return next;
  (line.material as LineMaterial).opacity = 1;
  const count = next.length / 3;
  const colors: number[] = [];
  for (let i = 0; i < count; i += 1) {
    // Old points fade into the background colour, the newest are the accent blue.
    const a = (i + 1) / count;
    colors.push(0.87 - 0.75 * a, 0.89 - 0.24 * a, 0.92 - 0.05 * a);
  }
  const g = new LineGeometry();
  g.setPositions(next);
  g.setColors(colors);
  line.geometry.dispose();
  line.geometry = g;
  return next;
}

function clearPath(line: Line2): void {
  const g = new LineGeometry();
  g.setPositions([0, 0, 0, 0, 0, 0.001]);
  g.setColors([1, 1, 1, 1, 1, 1]);
  line.geometry.dispose();
  line.geometry = g;
  (line.material as LineMaterial).opacity = 0;
}

function setLineResolution(line: Line2, width: number, height: number): void {
  (line.material as LineMaterial).resolution.set(width, height);
}

function ToolPath({ world, flange, tcpMm, root }: { world: RefObject<WorldState>; flange: Group; tcpMm: number; root: RefObject<Group | null> }) {
  const size = useThree((st) => st.size);
  const line = useMemo(() => newPathLine(), []);
  useEffect(() => setLineResolution(line, size.width, size.height), [line, size]);
  const pts = useRef<number[]>([]);
  const owner = useRef<WorldState | null>(null);
  const tip = useRef(new Vector3());
  const settle = useRef(0);
  useFrame(() => {
    const w = world.current;
    const r = root.current;
    if (!w || !r) return;
    if (owner.current !== w) {
      owner.current = w;
      pts.current = [];
      settle.current = 0;
      clearPath(line);
    }
    // This runs before the arm is posed in the same frame (child components update first):
    // skip the first frames, when the arm still shows its built-in 0° pose.
    if (settle.current < 2) {
      settle.current += 1;
      return;
    }
    // The arm was posed this frame: bring its world matrices up to date before reading the tip.
    r.updateWorldMatrix(true, true);
    const p = tip.current.set(0, 0, tcpMm / 1000);
    flange.localToWorld(p);
    r.worldToLocal(p);
    pts.current = extendPath(line, pts.current, p);
  });
  return <primitive object={line} />;
}

const KIT_LOOK: Record<string, { color: string; roughness: number; metalness: number }> = {
  plate: { color: '#15171a', roughness: 0.25, metalness: 0.05 }, // black acrylic, as in the kit photo
  bin_A: { color: '#e4e8ec', roughness: 0.6, metalness: 0 },
  bin_B: { color: '#e4e8ec', roughness: 0.6, metalness: 0 },
  bin_C: { color: '#e4e8ec', roughness: 0.6, metalness: 0 },
  bin_D: { color: '#e4e8ec', roughness: 0.6, metalness: 0 },
  box_spare: { color: '#eef0f2', roughness: 0.6, metalness: 0 },
  camera_post: { color: '#b8bfc6', roughness: 0.35, metalness: 0.6 }, // aluminium
  camera_head: { color: '#2b2f34', roughness: 0.5, metalness: 0.2 },
  pump_box: { color: '#2b2f34', roughness: 0.6, metalness: 0 },
};

/** Official AI Kit 2023 parts, already in the robot frame (robot-python/tools/convert_meshes.py kit). */
function Kit() {
  const { nodes } = useGLTF(KIT_URL, DRACO_PATH) as unknown as { nodes: GlbNodes };
  const parts = useMemo(
    () =>
      Object.entries(KIT_LOOK).flatMap(([name, look]) => {
        const src = nodes[name];
        if (!src) return [];
        const obj = src.clone(true);
        const material = new MeshStandardMaterial(look);
        obj.traverse((c) => {
          if ((c as Mesh).isMesh) {
            (c as Mesh).material = material;
            c.castShadow = name !== 'plate';
            c.receiveShadow = true;
          }
        });
        return [obj];
      }),
    [nodes],
  );
  return (
    <group>
      {parts.map((o) => (
        <primitive key={o.name || o.uuid} object={o} />
      ))}
    </group>
  );
}

/**
 * The white 150 mm calibration board with its two ArUco markers, drawn as the
 * camera sees it: canvas right = robot +y, canvas down = robot +x. The marker
 * patterns are real DICT_6X6_250 markers, so OpenCV would detect them too.
 */
function boardTexture(): CanvasTexture {
  const px = 1024;
  const c = document.createElement('canvas');
  c.width = px;
  c.height = px;
  const g = c.getContext('2d')!;
  g.fillStyle = '#f7f8f8';
  g.fillRect(0, 0, px, px);
  const s = px / CAL_BOARD.size; // px per mm
  for (const m of MARKERS) {
    const u = (m.y - (CAL_BOARD.y - CAL_BOARD.size / 2)) * s;
    const v = (m.x - (CAL_BOARD.x - CAL_BOARD.size / 2)) * s;
    const cellPx = (MARKER_MM * s) / 8;
    const left = u - (MARKER_MM * s) / 2;
    const top = v - (MARKER_MM * s) / 2;
    g.fillStyle = '#0e0f10';
    g.fillRect(left, top, MARKER_MM * s, MARKER_MM * s);
    const bits = ARUCO_6X6[m.id];
    g.fillStyle = '#f7f8f8';
    for (let r = 0; r < 6; r += 1) {
      for (let k = 0; k < 6; k += 1) {
        if (bits[r * 6 + k] === '1') g.fillRect(left + (k + 1) * cellPx, top + (r + 1) * cellPx, cellPx + 0.5, cellPx + 0.5);
      }
    }
  }
  const t = new CanvasTexture(c);
  t.anisotropy = 8;
  return t;
}

function CalibrationBoard() {
  const tex = useMemo(() => boardTexture(), []);
  const side = CAL_BOARD.size / 1000;
  return (
    // Canvas "right" (plane +x) -> robot +y, canvas "up" (plane +y) -> robot -x: a +90° turn about z.
    <mesh position={[CAL_BOARD.x / 1000, CAL_BOARD.y / 1000, PLATE.topZ / 1000 + 0.0003]} rotation={[0, 0, Math.PI / 2]} receiveShadow>
      <planeGeometry args={[side, side]} />
      <meshStandardMaterial map={tex} roughness={0.7} />
    </mesh>
  );
}

/**
 * Arm-only theme: a printed paper mat on the desk — 10 mm grid, the block
 * start squares, and the place squares "자리 1"–"자리 4". Canvas right = robot
 * +y, canvas down = robot +x, like the calibration board.
 */
function matTexture(): CanvasTexture {
  const w = ARM_MAT.yMax - ARM_MAT.yMin; // mm across (robot y)
  const h = ARM_MAT.xMax - ARM_MAT.xMin; // mm down (robot x)
  const s = 4; // px per mm
  const c = document.createElement('canvas');
  c.width = w * s;
  c.height = h * s;
  const g = c.getContext('2d')!;
  const u = (y: number) => (y - ARM_MAT.yMin) * s;
  const v = (x: number) => (x - ARM_MAT.xMin) * s;
  g.fillStyle = '#fbfbfa';
  g.fillRect(0, 0, c.width, c.height);
  for (let mm = 0; mm <= Math.max(w, h); mm += 10) {
    const major = mm % 50 === 0;
    g.strokeStyle = major ? '#c9d3dc' : '#e7ecf0';
    g.lineWidth = major ? 2 : 1;
    if (mm <= w) {
      g.beginPath();
      g.moveTo(mm * s, 0);
      g.lineTo(mm * s, c.height);
      g.stroke();
    }
    if (mm <= h) {
      g.beginPath();
      g.moveTo(0, mm * s);
      g.lineTo(c.width, mm * s);
      g.stroke();
    }
  }
  const half = (BLOCK_MM / 2 + 4) * s;
  g.setLineDash([10, 8]);
  g.lineWidth = 3;
  g.strokeStyle = '#9aa6b2';
  for (const p of Object.values(BLOCK_START)) g.strokeRect(u(p.y) - half, v(p.x) - half, 2 * half, 2 * half);
  g.setLineDash([]);
  g.strokeStyle = '#1fae66';
  g.fillStyle = '#1fae66';
  g.font = `bold ${14 * s}px sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  SPOT_NAMES.forEach((n, i) => {
    const p = SPOTS[n];
    g.strokeRect(u(p.y) - half, v(p.x) - half, 2 * half, 2 * half);
    g.fillText(String(i + 1), u(p.y), v(p.x));
  });
  const t = new CanvasTexture(c);
  t.anisotropy = 8;
  return t;
}

function WorkMat() {
  const tex = useMemo(() => matTexture(), []);
  const w = (ARM_MAT.yMax - ARM_MAT.yMin) / 1000;
  const h = (ARM_MAT.xMax - ARM_MAT.xMin) / 1000;
  return (
    // Plane +x (canvas right) -> robot +y, plane +y (canvas up) -> robot -x: a +90° turn about z.
    <mesh position={[(ARM_MAT.xMin + ARM_MAT.xMax) / 2000, (ARM_MAT.yMin + ARM_MAT.yMax) / 2000, 0.0002]} rotation={[0, 0, Math.PI / 2]} receiveShadow>
      <planeGeometry args={[w, h]} />
      <meshStandardMaterial map={tex} roughness={0.9} />
    </mesh>
  );
}

function Blocks({ world }: { world: RefObject<WorldState> }) {
  const refs = useRef<(Mesh | null)[]>([]);
  const geometry = useMemo(() => new BoxGeometry(BLOCK_MM / 1000, BLOCK_MM / 1000, BLOCK_MM / 1000), []);
  const materials = useMemo(() => COLORS.map((c) => new MeshStandardMaterial({ color: c.hex, roughness: 0.62 })), []);
  useFrame(() => {
    const w = world.current;
    if (!w) return;
    w.blocks.forEach((b, i) => {
      const m = refs.current[i];
      if (!m) return;
      m.position.set(b.x / 1000, b.y / 1000, b.z / 1000);
      m.rotation.set(0, 0, (b.yawDeg * Math.PI) / 180);
    });
  });
  return (
    <group>
      {COLORS.map((c, i) => (
        <mesh key={c.name} ref={(m) => void (refs.current[i] = m)} geometry={geometry} material={materials[i]} castShadow receiveShadow />
      ))}
    </group>
  );
}

function PushButton({ world }: { world: RefObject<WorldState> }) {
  const cap = useRef<Mesh>(null);
  // Orange, not red: the colour detector must not mistake the button for a red block
  // (orange sits between the red and yellow hue ranges; pressed = pale, unsaturated).
  const capMat = useMemo(() => new MeshStandardMaterial({ color: '#f7851e', roughness: 0.45 }), []);
  const baseH = BUTTON.heightMm - 6;
  useFrame(() => {
    const w = world.current;
    if (!w || !cap.current) return;
    cap.current.position.z = (BUTTON.heightMm - 3 - BUTTON.travelMm * w.buttonDepth) / 1000;
    capMat.color.set(w.buttonDepth > 0.5 ? '#fff1e2' : '#f7851e');
  });
  return (
    <group position={[BUTTON.x / 1000, BUTTON.y / 1000, 0]}>
      <mesh position={[0, 0, baseH / 2000]} rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[(BUTTON.radiusMm + 5) / 1000, (BUTTON.radiusMm + 6) / 1000, baseH / 1000, 40]} />
        <meshStandardMaterial color="#39424b" roughness={0.6} />
      </mesh>
      <mesh ref={cap} rotation={[Math.PI / 2, 0, 0]} material={capMat} castShadow>
        <cylinderGeometry args={[BUTTON.radiusMm / 1000, BUTTON.radiusMm / 1000, 0.006, 40]} />
      </mesh>
    </group>
  );
}

function PenTrail({ world }: { world: RefObject<WorldState> }) {
  const lines = useMemo(() => {
    const g = new BufferGeometry();
    const l = new LineSegments(g, new LineBasicMaterial({ color: '#1f6fd1' }));
    l.frustumCulled = false;
    return l;
  }, []);
  const seen = useRef(-1);
  useFrame(() => {
    const w = world.current;
    if (!w || w.version === seen.current) return;
    seen.current = w.version;
    const pts: number[] = [];
    for (const stroke of w.trail) {
      for (let i = 1; i < stroke.length; i += 1) {
        pts.push(stroke[i - 1][0] / 1000, stroke[i - 1][1] / 1000, 0.0007, stroke[i][0] / 1000, stroke[i][1] / 1000, 0.0007);
      }
    }
    lines.geometry.setAttribute('position', new Float32BufferAttribute(pts, 3));
    lines.geometry.computeBoundingSphere();
  });
  return <primitive object={lines} />;
}

/* --- cameras ------------------------------------------------------------------ */

/** sRGB encode lookup for linear 0..255 values read back from a render target. */
const TO_SRGB = (() => {
  const t = new Uint8ClampedArray(256);
  for (let i = 0; i < 256; i += 1) {
    const c = i / 255;
    t[i] = Math.round(255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055));
  }
  return t;
})();

function CameraRig({
  root,
  tool,
  world,
  topAvailable,
  onApi,
  onCameraFrame,
  liveCamera,
  liveCameraScale,
  lights,
  viewApi,
}: {
  lights: Lights;
  viewApi: Omit<StageApi, 'capture'>;
  root: RefObject<Group | null>;
  tool: { handCamera: PerspectiveCamera | null; group: Group };
  world: RefObject<WorldState>;
  topAvailable: boolean;
  onApi(api: StageApi | null): void;
  onCameraFrame?: (camera: CameraId, frame: CameraFrame) => void;
  liveCamera: CameraId | null;
  liveCameraScale: number;
}) {
  const { gl, scene } = useThree();
  const topCamera = useMemo(() => {
    const cam = new PerspectiveCamera(verticalFov(TOP_CAMERA.hfovDeg, TOP_CAMERA.width, TOP_CAMERA.height), TOP_CAMERA.width / TOP_CAMERA.height, 0.01, 3);
    cam.position.set(TOP_CAMERA.x / 1000, TOP_CAMERA.y / 1000, TOP_CAMERA.z / 1000);
    // Looking straight down; image "up" = -x (towards the robot), "right" = +y —
    // the orientation the official pixel -> robot formula assumes.
    cam.quaternion.setFromRotationMatrix(new Matrix4().makeBasis(new Vector3(0, 1, 0), new Vector3(-1, 0, 0), new Vector3(0, 0, 1)));
    cam.layers.enable(TOOL_LAYER);
    return cam;
  }, []);
  // One render target per camera and picture size, made when first needed.
  const targets = useRef(new Map<string, WebGLRenderTarget>());
  useEffect(() => {
    const made = targets.current;
    return () => {
      made.forEach((t) => t.dispose());
      made.clear();
    };
  }, []);
  const targetFor = (which: CameraId, scale: number): WebGLRenderTarget => {
    const size = which === 'top' ? TOP_CAMERA : HAND_CAMERA;
    const key = `${which}:${scale}`;
    let rt = targets.current.get(key);
    if (!rt) {
      rt = new WebGLRenderTarget(Math.round(size.width * scale), Math.round(size.height * scale));
      targets.current.set(key, rt);
    }
    return rt;
  };

  /** Draw one camera into its render target; returns what is needed to read the picture back. */
  const renderCamera = (which: CameraId, scale: number) => {
    const cam = which === 'top' ? (topAvailable ? topCamera : null) : tool.handCamera;
    const group = root.current;
    if (!cam || !group) return null;
    const rt = targetFor(which, scale);
    scene.updateMatrixWorld();
    cam.updateMatrixWorld();
    const prev = gl.getRenderTarget();
    const restore = cameraLighting(scene, lights);
    gl.setRenderTarget(rt);
    gl.render(scene, cam);
    gl.setRenderTarget(prev);
    restore();
    // Camera pose in the robot base frame, millimetres (taken now, not when the pixels arrive).
    const rel = new Matrix4().copy(group.matrixWorld).invert().multiply(cam.matrixWorld);
    rel.elements[12] *= 1000;
    rel.elements[13] *= 1000;
    rel.elements[14] *= 1000;
    const { width, height } = rt;
    return { rt, width, height, raw: new Uint8Array(width * height * 4), pinhole: { cameraToWorld: rel, fovDeg: cam.fov, width, height } };
  };

  const toFrame = (shot: NonNullable<ReturnType<typeof renderCamera>>): CameraFrame => {
    const { raw, width, height } = shot;
    // GL rows run bottom-up; images run top-down. Encode linear -> sRGB on the way.
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y += 1) {
      const src = (height - 1 - y) * width * 4;
      const dst = y * width * 4;
      for (let x = 0; x < width * 4; x += 4) {
        data[dst + x] = TO_SRGB[raw[src + x]];
        data[dst + x + 1] = TO_SRGB[raw[src + x + 1]];
        data[dst + x + 2] = TO_SRGB[raw[src + x + 2]];
        data[dst + x + 3] = 255;
      }
    }
    return { image: { data, width, height }, pinhole: shot.pinhole };
  };

  /** One picture now (vision, a program's camera call): waits for the graphics card. */
  const capture = (which: CameraId, scale = 1): CameraFrame | null => {
    const shot = renderCamera(which, scale);
    if (!shot) return null;
    unbindPixelPack(gl);
    gl.readRenderTargetPixels(shot.rt, 0, 0, shot.width, shot.height, shot.raw);
    return toFrame(shot);
  };

  useEffect(() => {
    onApi({ capture, ...viewApi });
    return () => onApi(null);
  });

  // Rendering a camera and reading its pixels back is the heaviest thing on the
  // page: do it only when something in the scene moved, at most 4 times a second,
  // and read the pixels back without waiting — a waiting read stops the whole page
  // (jog keep-alives included) until the graphics card has finished drawing.
  const last = useRef({ t: 0, key: '', pending: false });
  useFrame(({ clock }) => {
    if (!onCameraFrame || !liveCamera || last.current.pending) return;
    const t = clock.getElapsedTime();
    const key = `${liveCamera}:${liveCameraScale}:${world.current?.version}:${topAvailable}:${tool.group.uuid}`;
    if (t - last.current.t < 0.25 || key === last.current.key) return;
    const shot = renderCamera(liveCamera, liveCameraScale);
    last.current = { t, key, pending: !!shot };
    if (!shot) return;
    const cam = liveCamera;
    const read = gl.readRenderTargetPixelsAsync(shot.rt, 0, 0, shot.width, shot.height, shot.raw);
    // three leaves its pixel buffer bound while it waits: any other read in the meantime
    // (a vision picture, the render check) would then fail and come back blank.
    unbindPixelPack(gl);
    read
      .then(() => onCameraFrame(cam, toFrame(shot)))
      .catch(() => {
        // The picture is lost (context lost, target resized); the next change draws a new one.
      })
      .finally(() => {
        last.current.pending = false;
      });
  });

  return <primitive object={topCamera} />;
}
