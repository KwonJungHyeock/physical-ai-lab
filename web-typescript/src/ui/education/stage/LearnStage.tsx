'use client';

/**
 * The 교육 screens' 3D view: the real arm (official model) on the simulator's
 * desk, plus what each lesson draws over it — joint frames, the workspace,
 * a target, ghost arms, velocity arrows, the manipulability ellipsoid, paths,
 * search trees, obstacles and physics blocks. Everything is described by one
 * `scene` object, in millimetres in the robot base frame.
 */

import { CameraControls, Grid, Html, Line, useGLTF } from '@react-three/drei';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { Suspense, useCallback, useEffect, useMemo, useRef, type ReactNode, type RefObject } from 'react';
import { Matrix4, NeutralToneMapping, Quaternion, Vector3, type Group, type PerspectiveCamera } from 'three';

import { forwardKinematicsFrames, type ChainSegment } from '@/engine/robot/kinematics';
import type { UrdfRobot } from '@/engine/robot/urdf';
import type { Box } from '@/engine/physics/collide';
import type { BlockPose } from '@/engine/physics/physics';
import type { WorkspaceProfile } from '@/engine/physics/workspace';
import { createWorld, type WorldState } from '@/engine/simulator/sim';
import type { EffectorId } from '@/engine/simulator/effectors';

import { buildArm, buildTool, type GlbNodes } from '../../simulator/stage/robotModel';
import { DESK_M, SCENE, axesTriad, deskSpot, textSprite } from '../../simulator/stage/sceneHelpers';
import StudioLight from '../../simulator/stage/StudioLight';
import { VIEWS, type ViewName } from '../../simulator/stage/Stage';
import { GLYPH, ToolGlyph, ViewCube } from '../../simulator/stage/StageTools';
import tools from '../../simulator/console.module.css';
import { LEARN_COLORS, ellipsoid, ghostify, workspaceEnvelope, workspaceSection } from './learn3d';
import { StageRobot, setAmbient, useAmbient } from '../lab/ambient/ambient';
import { SiteGround, type SiteLook } from '../lab/ambient/Ground';
import css from '../learn.module.css';

const MODEL_URL = '/robot/rdkx5/rdkx5.glb';
const DRACO_PATH = '/draco/';
const OVERLAY = 1;

type Mm = [number, number, number];

export interface LearnScene {
  angles: readonly number[];
  tool?: EffectorId;
  /** Pump suction on (unit 6). */
  pumpOn?: boolean;
  ghosts?: { key: string; angles: readonly number[]; color?: string; opacity?: number }[];
  /** Joint frames: none, all, or up to joint k (1..6) with k highlighted. */
  frames?: 'none' | 'all' | number;
  workspace?: { profile: WorkspaceProfile; frontDeg: number; shell: boolean; section: boolean } | null;
  target?: { mm: Mm; ok: boolean; label?: string } | null;
  arrows?: { key: string; from: Mm; vec: Mm; color: string; label?: string }[];
  ellipsoid?: { centre: Mm; lengthsMm: Mm; dirs: Mm[] } | null;
  lines?: { key: string; points: Mm[]; color: string; width?: number; dashed?: boolean; segments?: boolean }[];
  boxes?: (Box & { color?: string })[];
  blocks?: BlockPose[];
  payload?: { mm: Mm; kg: number } | null;
  contact?: { mm: Mm; text: string } | null;
  labels?: { key: string; mm: Mm; text: string; color?: string }[];
  /** A free-standing gripper model held at a point with a given orientation (1-3 자세 표현), quaternion [x, y, z, w] in the base frame. */
  orient?: { mm: Mm; quat: readonly [number, number, number, number]; ghost?: readonly [number, number, number, number] | null } | null;
  /** Spots drawn on the table (unit 6 goals). */
  spots?: { key: string; mm: Mm; color: string; label?: string }[];
}

interface Props {
  robot: UrdfRobot;
  chain: readonly ChainSegment[];
  gripperRobot: UrdfRobot | null;
  scene: LearnScene;
  /** Click on the table (not a drag): point in mm, z = 0. */
  onTablePick?: (mm: Mm) => void;
  /** Pause rendering while hidden. */
  paused?: boolean;
  /** Pixels of the view's left side covered by a panel: the picture is centred in the rest. */
  shift?: number;
  /** The first view (and 처음 시점): camera then target, three.js metres (y up). */
  home?: ViewPose;
  /** A close look the camera glides to (and back to `home` when it goes null): e.g. the moment a run went wrong. */
  focus?: ViewPose | null;
  /** Drives the arm every frame instead of `scene.angles` while it holds a pose (a played-back run). */
  live?: RefObject<LiveArm | null>;
  /** More to draw, in the robot base frame (metres, z up). */
  children?: ReactNode;
  /** A site's own floor and sky instead of the dark studio and grid (the site labs), with the ambient-motion switch. */
  look?: SiteLook;
}

/** Camera position then target, three.js metres (y up). */
export type ViewPose = readonly [number, number, number, number, number, number];

/** The arm as a frame loop sets it. */
export interface LiveArm {
  angles: readonly number[];
  pump: boolean;
  /** A gripper's finger opening, mm (none: as the tool rests). */
  gap?: number;
}

const v = (p: readonly number[]) => new Vector3(p[0] / 1000, p[1] / 1000, p[2] / 1000);

export default function LearnStage({ robot, chain, gripperRobot, scene, onTablePick, paused, shift = 0, home = HOME_VIEW, focus = null, live, children, look }: Props) {
  const api = useRef<ViewApi | null>(null);
  const stageRobot = useMemo(() => ({ robot, chain }), [robot, chain]);
  return (
    <>
      <Canvas
        shadows="percentage"
        frameloop={paused ? 'never' : 'always'}
        dpr={[1, 1.75]}
        gl={{ antialias: true, preserveDrawingBuffer: true }}
        camera={{ position: [0.66, 0.5, 0.62], fov: 34, near: 0.01, far: 30 }}
        onCreated={({ gl, camera }) => {
          camera.layers.enable(OVERLAY);
          gl.toneMapping = NeutralToneMapping;
        }}
      >
        {/* The simulator's studio: slate background, its lights, its spot-lit desk and grid. */}
        <color attach="background" args={[look?.sky ?? SCENE.sky]} />
        {look && <fog attach="fog" args={[look.sky, look.fog?.[0] ?? 2.2, look.fog?.[1] ?? 6.5]} />}
        <StudioLight intensity={0.5} softbox />
        <hemisphereLight args={['#ffffff', '#cfd6de', 0.3]} />
        <directionalLight
          position={[0.55, 1.35, 0.45]}
          intensity={2.5}
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-camera-left={-0.7}
          shadow-camera-right={0.7}
          shadow-camera-top={0.7}
          shadow-camera-bottom={-0.7}
          shadow-bias={-0.0003}
          shadow-normalBias={0.002}
        />
        <directionalLight position={[-0.9, 0.55, -0.7]} intensity={0.35} color="#dfe8ff" />
        {/* Rim light from behind: a cool edge along the arm's silhouette against the dark backdrop. */}
        <directionalLight position={[-0.35, 0.95, -1.2]} intensity={1.15} color="#cfe0ff" />
        {look ? (
          <group rotation={[-Math.PI / 2, 0, 0]}>
            <SiteGround look={look} />
          </group>
        ) : (
          <Desk onTablePick={onTablePick} />
        )}
        <Suspense fallback={null}>
          <StageRobot.Provider value={stageRobot}>
            <SceneContent robot={robot} chain={chain} gripperRobot={gripperRobot} scene={scene} live={live}>
              {children}
            </SceneContent>
          </StageRobot.Provider>
        </Suspense>
        <ViewControl apiRef={api} home={home} focus={focus} />
        <ViewShift px={shift} />
        <CameraControls makeDefault smoothTime={0.25} minDistance={0.15} maxDistance={3.2} maxPolarAngle={Math.PI * 0.49} dollyToCursor dollySpeed={0.6} />
      </Canvas>
      {!paused && <ViewTools apiRef={api} ambient={!!look} />}
    </>
  );
}

/** Moves the picture right by half the covered width (a lens shift, so orbiting and picking stay true). */
function ViewShift({ px }: { px: number }) {
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const size = useThree((s) => s.size);
  useEffect(() => {
    if (px > 0 && size.width > px * 1.6) camera.setViewOffset(size.width, size.height, -px / 2, 0, size.width, size.height);
    else camera.clearViewOffset();
    camera.updateProjectionMatrix();
  }, [camera, size.width, size.height, px]);
  return null;
}

/** The first view: the arm's middle (robot z ≈ 130 mm) from the front right, camera then target. */
const HOME_VIEW: ViewPose = [0.74, 0.62, 0.86, 0.0, 0.14, 0.0];

/** What the view tools (outside the canvas) can do with the camera. */
interface ViewApi {
  view(name: ViewName): void;
  zoom(direction: 1 | -1): void;
  orient(): { azimuth: number; polar: number } | null;
}

type Controls = {
  setLookAt(...a: [number, number, number, number, number, number, boolean]): Promise<void>;
  dolly(distance: number, transition: boolean): Promise<void>;
  distance: number;
  azimuthAngle: number;
  polarAngle: number;
};

/** Once the camera controls exist: the first view, and the view tools' handle on the camera. */
function ViewControl({ apiRef, home, focus = null }: { apiRef: RefObject<ViewApi | null>; home: ViewPose; focus?: ViewPose | null }) {
  const controls = useThree((s) => s.controls) as Controls | null;
  const done = useRef(false);
  const focused = useRef(false);
  useEffect(() => {
    if (!controls?.setLookAt) return;
    if (focus) {
      focused.current = true;
      void controls.setLookAt(...focus, true);
    } else if (focused.current) {
      focused.current = false;
      void controls.setLookAt(...home, true);
    }
  }, [controls, focus, home]);
  useEffect(() => {
    if (!controls?.setLookAt) return;
    if (!done.current) {
      done.current = true;
      // The arm in the middle of the free part of the view (ViewShift moves it clear of the panel).
      void controls.setLookAt(...home, false);
    }
    apiRef.current = {
      // The simulator's directions (its view cube), and this view's own first one for 처음 시점.
      view: (name) => {
        const to = name === 'home' || name === 'fit' ? home : ([...VIEWS[name].pos, ...VIEWS[name].target] as const);
        void controls.setLookAt(to[0], to[1], to[2], to[3], to[4], to[5], true);
      },
      zoom: (d) => void controls.dolly(controls.distance * 0.18 * d, true),
      orient: () => ({ azimuth: controls.azimuthAngle, polar: controls.polarAngle }),
    };
    return () => {
      apiRef.current = null;
    };
  }, [controls, apiRef, home]);
  return null;
}

/** Ambient motion on: a play-like wave; off: two pause bars. */
const AMBIENT_ON = 'M3 12c2.5-5 5.5-5 8 0s5.5 5 8 0M3 17c2.5-3 5.5-3 8 0s5.5 3 8 0';
const AMBIENT_OFF = 'M8 6v12M16 6v12';

/** The simulator's view cube and a short rail (처음 시점 · 확대 · 축소) at the top right of the view. */
function ViewTools({ apiRef, ambient }: { apiRef: RefObject<ViewApi | null>; ambient: boolean }) {
  const orient = useCallback(() => apiRef.current?.orient() ?? null, [apiRef]);
  const moving = useAmbient();
  return (
    <div className={css.viewTools}>
      <ViewCube orient={orient} onView={(v) => apiRef.current?.view(v)} />
      <div className={tools.viewRail} role="toolbar" aria-label="3D 보기 도구" aria-orientation="vertical">
        <button type="button" title="처음 시점" aria-label="처음 시점" onClick={() => apiRef.current?.view('home')}>
          <ToolGlyph d={GLYPH.home} />
        </button>
        <i className={tools.railSep} />
        <button type="button" title="확대 (마우스 휠)" aria-label="확대" onClick={() => apiRef.current?.zoom(1)}>
          <ToolGlyph d={GLYPH.plus} />
        </button>
        <button type="button" title="축소 (마우스 휠)" aria-label="축소" onClick={() => apiRef.current?.zoom(-1)}>
          <ToolGlyph d={GLYPH.minus} />
        </button>
        {ambient && (
          <>
            <i className={tools.railSep} />
            <button
              type="button"
              title={moving ? '주변 움직임 끄기 (다른 로봇·AGV·벨트 멈춤)' : '주변 움직임 켜기'}
              aria-label="주변 움직임"
              aria-pressed={moving}
              data-on={moving || undefined}
              onClick={() => setAmbient(!moving)}
            >
              <ToolGlyph d={moving ? AMBIENT_ON : AMBIENT_OFF} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * The simulator's desk: a plane at the robot's z = 0 lit like a spot under the robot, fading into
 * the background, with the endless 1 cm / 10 cm grid. A click on it (not a drag) picks a point.
 */
function Desk({ onTablePick }: { onTablePick?: (mm: Mm) => void }) {
  const spot = useMemo(() => deskSpot(), []);
  useEffect(() => () => spot.dispose(), [spot]);
  const pick = (e: ThreeEvent<MouseEvent>) => {
    if (!onTablePick || e.delta > 4) return;
    e.stopPropagation();
    // Three's y-up world -> robot base frame (z up): (x, -z, y).
    onTablePick([e.point.x * 1000, -e.point.z * 1000, 0]);
  };
  return (
    <group>
      <mesh position={[0.14, -0.0005, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow onClick={pick}>
        <planeGeometry args={[DESK_M, DESK_M]} />
        <meshStandardMaterial map={spot} roughness={0.95} />
      </mesh>
      <Grid
        position={[0.14, 0.0001, 0]}
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
    </group>
  );
}

function SceneContent({ robot, chain, gripperRobot, scene, live, children }: Omit<Props, 'onTablePick' | 'paused'>) {
  const { nodes } = useGLTF(MODEL_URL, DRACO_PATH) as unknown as { nodes: GlbNodes };
  const arm = useMemo(() => buildArm(robot, chain, nodes), [robot, chain, nodes]);
  // A small gripper unless the lesson fits another tool (its tool point is the topics' 손끝).
  const toolId = scene.tool ?? 'parallel';
  const tool = useMemo(() => buildTool(toolId, false, nodes, gripperRobot), [toolId, nodes, gripperRobot]);
  useEffect(() => {
    arm.flange.add(tool.group);
    return () => {
      arm.flange.remove(tool.group);
    };
  }, [arm, tool]);
  // What the frame loop reads, kept current after each render.
  const angles = useRef(scene.angles);
  const pumpOn = useRef(false);
  const toolWorld = useRef<WorldState | null>(null);
  useEffect(() => {
    angles.current = scene.angles;
    pumpOn.current = !!scene.pumpOn;
  }, [scene.angles, scene.pumpOn]);
  useEffect(() => {
    toolWorld.current = createWorld(toolId, false, undefined, 'arm');
  }, [toolId]);
  useFrame(() => {
    const drive = live?.current;
    arm.setAngles(drive?.angles ?? angles.current);
    const w = toolWorld.current;
    if (!w) return;
    w.angles = (drive?.angles ?? angles.current).slice();
    w.pump = drive ? drive.pump : pumpOn.current;
    if (drive?.gap !== undefined) w.gapMm = drive.gap;
    tool.update(w);
  });

  return (
    <group rotation={[-Math.PI / 2, 0, 0]}>
      <primitive object={arm.root} />
      <primitive object={tool.baseExtras} />
      {scene.ghosts?.map((g) => <Ghost key={g.key} robot={robot} chain={chain} nodes={nodes} angles={g.angles} color={g.color} opacity={g.opacity} />)}
      {scene.frames && scene.frames !== 'none' && <Frames chain={chain} angles={scene.angles} upTo={scene.frames} />}
      {scene.workspace && <Workspace {...scene.workspace} j1={scene.angles[0]} />}
      {scene.target && <Target {...scene.target} />}
      {scene.orient && <OrientModel {...scene.orient} />}
      {scene.arrows?.map(({ key, ...a }) => <Arrow key={key} {...a} />)}
      {scene.ellipsoid && <Ellipsoid {...scene.ellipsoid} />}
      {scene.lines?.map((l) =>
        l.points.length > 1 ? (
          <Line
            key={l.key}
            points={l.points.map(v)}
            color={l.color}
            lineWidth={l.width ?? 2}
            dashed={l.dashed}
            dashSize={0.008}
            gapSize={0.006}
            segments={l.segments}
            transparent
            depthTest={false}
            renderOrder={6}
          />
        ) : null,
      )}
      {scene.boxes?.map((b, i) => (
        <mesh
          key={`box${i}`}
          position={v([(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2])}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[(b.max[0] - b.min[0]) / 1000, (b.max[1] - b.min[1]) / 1000, (b.max[2] - b.min[2]) / 1000]} />
          <meshStandardMaterial color={b.color ?? '#f08a5d'} transparent opacity={0.72} roughness={0.6} />
        </mesh>
      ))}
      {scene.blocks?.map((b) => (
        <mesh key={b.id} position={[b.at.x / 1000, b.at.y / 1000, b.at.z / 1000]} quaternion={b.q} castShadow receiveShadow>
          <boxGeometry args={[b.size / 1000, b.size / 1000, b.size / 1000]} />
          <meshStandardMaterial color={b.color} roughness={0.55} emissive={b.held ? b.color : '#000000'} emissiveIntensity={b.held ? 0.25 : 0} />
        </mesh>
      ))}
      {scene.spots?.map((s) => (
        <group key={s.key} position={v(s.mm)}>
          <mesh position={[0, 0, 0.0007]}>
            <ringGeometry args={[0.016, 0.019, 40]} />
            <meshBasicMaterial color={s.color} toneMapped={false} />
          </mesh>
          {s.label && (
            <Html zIndexRange={[12, 4]} center position={[0, -0.03, 0]} style={{ pointerEvents: 'none' }}>
              <span style={{ font: '700 12px var(--font, system-ui)', color: s.color, whiteSpace: 'nowrap', textShadow: '0 0 3px #fff' }}>{s.label}</span>
            </Html>
          )}
        </group>
      ))}
      {scene.payload && scene.payload.kg > 0 && (
        <mesh position={v(scene.payload.mm)} castShadow>
          <sphereGeometry args={[0.006 + Math.cbrt(scene.payload.kg) * 0.03, 24, 16]} />
          <meshStandardMaterial color="#5b6577" metalness={0.6} roughness={0.35} />
        </mesh>
      )}
      {scene.contact && (
        <group position={v(scene.contact.mm)}>
          <mesh>
            <sphereGeometry args={[0.012, 20, 14]} />
            <meshBasicMaterial color={LEARN_COLORS.bad} transparent opacity={0.55} depthTest={false} toneMapped={false} />
          </mesh>
          <Html zIndexRange={[12, 4]} center position={[0, 0, 0.04]} style={{ pointerEvents: 'none' }}>
            <span style={{ font: '800 13px var(--font, system-ui)', color: '#fff', background: LEARN_COLORS.bad, padding: '3px 8px', borderRadius: 8, whiteSpace: 'nowrap' }}>{scene.contact.text}</span>
          </Html>
        </group>
      )}
      {scene.labels?.map((l) => (
        <Html zIndexRange={[12, 4]} key={l.key} center position={v(l.mm)} style={{ pointerEvents: 'none' }}>
          <span style={{ font: '700 12px var(--font, system-ui)', color: l.color ?? '#101828', background: 'rgba(255,255,255,.88)', padding: '2px 6px', borderRadius: 6, whiteSpace: 'nowrap', boxShadow: '0 1px 3px rgba(16,24,40,.15)' }}>
            {l.text}
          </span>
        </Html>
      ))}
      {children}
    </group>
  );
}

function Ghost({ robot, chain, nodes, angles, color = LEARN_COLORS.ghost, opacity = 0.28 }: { robot: UrdfRobot; chain: readonly ChainSegment[]; nodes: GlbNodes; angles: readonly number[]; color?: string; opacity?: number }) {
  const arm = useMemo(() => {
    const a = buildArm(robot, chain, nodes);
    ghostify(a.root, color, opacity);
    return a;
  }, [robot, chain, nodes, color, opacity]);
  useEffect(() => arm.setAngles(angles), [arm, angles]);
  return <primitive object={arm.root} />;
}

function Frames({ chain, angles, upTo }: { chain: readonly ChainSegment[]; angles: readonly number[]; upTo: 'all' | number }) {
  const triads = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const g = axesTriad(i === 0 ? 0.06 : 0.04, i === 0 ? 0.0016 : 0.0012, i === 0 ? ['x', 'y', 'z'] : null, OVERLAY);
        if (i > 0) {
          const s = textSprite(`{${i}}`, '#101828', 0.012);
          s.position.set(0.012, 0.012, 0.012);
          s.layers.set(OVERLAY);
          g.add(s);
        }
        g.matrixAutoUpdate = false;
        return g;
      }),
    [],
  );
  const group = useRef<Group>(null);
  useFrame(() => {
    const frames = forwardKinematicsFrames(chain, angles);
    const joint: Matrix4[] = [new Matrix4()];
    chain.forEach((seg, i) => {
      if (seg.movableIndex >= 0) joint[seg.movableIndex + 1] = frames[i];
    });
    triads.forEach((t, i) => {
      const k = upTo === 'all' ? 6 : upTo;
      t.visible = i <= k;
      t.matrix.copy(joint[i] ?? new Matrix4());
      const s = i === k && upTo !== 'all' ? 1.5 : 1;
      t.matrix.multiply(new Matrix4().makeScale(s, s, s));
    });
  });
  return (
    <group ref={group}>
      {triads.map((t, i) => (
        <primitive key={i} object={t} />
      ))}
    </group>
  );
}

function Workspace({ profile, frontDeg, shell, section, j1 }: { profile: WorkspaceProfile; frontDeg: number; shell: boolean; section: boolean; j1: number }) {
  // The simulator's 작업 범위 (glowing shell, contour rings); its own cross-section stands for the
  // lesson's when both are shown, turned to the arm's plane.
  const env = useMemo(() => workspaceEnvelope(profile, frontDeg), [profile, frontDeg]);
  const sectionObj = useMemo(() => workspaceSection(profile, 0, 0), [profile]);
  useEffect(() => {
    env.showSection(section);
    env.setAzimuth(((frontDeg + j1) * Math.PI) / 180);
  }, [env, section, frontDeg, j1]);
  return (
    <>
      {shell && <primitive object={env.group} />}
      {section && !shell && (
        <group rotation={[0, 0, ((frontDeg + j1) * Math.PI) / 180]}>
          <primitive object={sectionObj} />
        </group>
      )}
    </>
  );
}

function Target({ mm, ok, label }: { mm: Mm; ok: boolean; label?: string }) {
  const color = ok ? LEARN_COLORS.ok : LEARN_COLORS.bad;
  return (
    <group position={v(mm)}>
      <mesh>
        <sphereGeometry args={[0.009, 24, 16]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.35} transparent opacity={0.85} />
      </mesh>
      <mesh>
        <sphereGeometry args={[0.016, 24, 16]} />
        <meshBasicMaterial color={color} transparent opacity={0.18} depthWrite={false} />
      </mesh>
      {/* Drop line to the table. */}
      <Line points={[new Vector3(0, 0, 0), new Vector3(0, 0, -mm[2] / 1000)]} color={color} lineWidth={1} dashed dashSize={0.006} gapSize={0.004} />
      {label && (
        <Html zIndexRange={[12, 4]} center position={[0, 0, 0.03]} style={{ pointerEvents: 'none' }}>
          <span style={{ font: '700 12px var(--font, system-ui)', color, background: 'rgba(255,255,255,.9)', padding: '2px 6px', borderRadius: 6, whiteSpace: 'nowrap' }}>{label}</span>
        </Html>
      )}
    </group>
  );
}

/**
 * A gripper model, 1.5× life size, its tool axis along local +x (points where the fingers point),
 * fingers opening along local y and a fin on local +z (so a twist about the tool axis shows).
 */
function OrientModel({ mm, quat, ghost }: { mm: Mm; quat: readonly [number, number, number, number]; ghost?: readonly [number, number, number, number] | null }) {
  const q = useMemo(() => new Quaternion(...quat), [quat]);
  const gq = useMemo(() => (ghost ? new Quaternion(...ghost) : null), [ghost]);
  const triad = useMemo(() => axesTriad(0.075, 0.0018, ['x', 'y', 'z'], OVERLAY), []);
  return (
    <group position={v(mm)}>
      <group quaternion={q}>
        <GripperShape color="#d9dee7" accent={LEARN_COLORS.accent} />
        <primitive object={triad} />
      </group>
      {gq && (
        <group quaternion={gq}>
          <GripperShape color={LEARN_COLORS.ghost} accent={LEARN_COLORS.ghost} opacity={0.28} />
        </group>
      )}
    </group>
  );
}

function GripperShape({ color, accent, opacity = 1 }: { color: string; accent: string; opacity?: number }) {
  const mat = { color, roughness: 0.45, metalness: 0.15, transparent: opacity < 1, opacity, depthWrite: opacity >= 1 };
  return (
    <group>
      {/* Wrist plate and palm. */}
      <mesh position={[-0.012, 0, 0]} castShadow>
        <cylinderGeometry args={[0.024, 0.024, 0.008, 32]} />
        <meshStandardMaterial {...mat} />
      </mesh>
      <mesh position={[0.012, 0, 0]} castShadow>
        <boxGeometry args={[0.036, 0.06, 0.03]} />
        <meshStandardMaterial {...mat} />
      </mesh>
      {/* Two fingers along +x, apart along y. */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[0.05, s * 0.02, 0]} castShadow>
          <boxGeometry args={[0.042, 0.008, 0.02]} />
          <meshStandardMaterial {...mat} />
        </mesh>
      ))}
      {/* A fin on top (+z) so a twist about the tool axis is visible. */}
      <mesh position={[0.012, 0, 0.024]} castShadow>
        <boxGeometry args={[0.03, 0.006, 0.018]} />
        <meshStandardMaterial color={accent} roughness={0.5} transparent={opacity < 1} opacity={opacity} />
      </mesh>
    </group>
  );
}

function Arrow({ from, vec, color, label }: { from: Mm; vec: Mm; color: string; label?: string }) {
  const len = Math.hypot(...vec) / 1000;
  const q = useMemo(() => {
    const d = new Vector3(vec[0], vec[1], vec[2]).normalize();
    return new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), d.lengthSq() ? d : new Vector3(0, 0, 1));
  }, [vec]);
  if (len < 1e-4) return null;
  const head = Math.min(len * 0.35, 0.016);
  return (
    <group position={v(from)} quaternion={q}>
      <mesh position={[0, (len - head) / 2, 0]} renderOrder={7}>
        <cylinderGeometry args={[0.0018, 0.0018, len - head, 10]} />
        <meshBasicMaterial color={color} depthTest={false} toneMapped={false} />
      </mesh>
      <mesh position={[0, len - head / 2, 0]} renderOrder={7}>
        <coneGeometry args={[0.005, head, 16]} />
        <meshBasicMaterial color={color} depthTest={false} toneMapped={false} />
      </mesh>
      {label && (
        <Html zIndexRange={[12, 4]} center position={[0, len + 0.012, 0]} style={{ pointerEvents: 'none' }}>
          <span style={{ font: '700 12px var(--font, system-ui)', color, background: 'rgba(255,255,255,.9)', padding: '1px 6px', borderRadius: 6, whiteSpace: 'nowrap' }}>{label}</span>
        </Html>
      )}
    </group>
  );
}

function Ellipsoid({ centre, lengthsMm, dirs }: { centre: Mm; lengthsMm: Mm; dirs: Mm[] }) {
  const m = useMemo(() => ellipsoid(v(centre), lengthsMm.map((l) => Math.max(l, 0.4) / 1000), dirs), [centre, lengthsMm, dirs]);
  return <primitive object={m} />;
}

useGLTF.preload(MODEL_URL, DRACO_PATH);
