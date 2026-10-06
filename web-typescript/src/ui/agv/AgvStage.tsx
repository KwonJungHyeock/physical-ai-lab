'use client';

/**
 * The myAGV classroom in 3D: the same light floor and fading grid as the arm
 * console, walls with windows and a board, the printed course mat, the
 * calibration tape, cardboard boxes, colour cards and ArUco markers on
 * stands, and the official myAGV model driving on its four mecanum wheels.
 *
 * Screen-only helpers (trail, camera field of view, lidar points, the
 * straight-line test ribbons) sit on layer 1, which the robot's own camera
 * does not see. That camera is drawn into the same canvas, inside the
 * rectangle of the camera panel (`pipRef`), after the main view.
 */

import { Grid, OrbitControls, useGLTF } from '@react-three/drei';
import { Canvas, useFrame } from '@react-three/fiber';
import { Suspense, memo, useEffect, useMemo, useRef, type MutableRefObject, type RefObject } from 'react';
import {
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  CatmullRomCurve3,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Line,
  LineBasicMaterial,
  LineSegments,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  NearestFilter,
  NeutralToneMapping,
  PerspectiveCamera,
  Points,
  PointsMaterial,
  RepeatWrapping,
  SRGBColorSpace,
  TubeGeometry,
  Vector3,
  type Material,
  type Object3D,
} from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';

import { ARUCO_6X6 } from '@/engine/simulator/board';
import {
  BOXES,
  COURSE,
  LANE,
  MAT,
  ROOM,
  STAND,
  TARGETS,
  type AgvModel,
  type AgvSim,
  type LidarScan,
  type Target,
} from '@/engine/agv/sim';

import StudioLight from '../simulator/stage/StudioLight';

/** Things only the screen shows (the robot's camera does not). */
const SCREEN = 1;
/** The robot's own body: on screen and in shadows, but not in its own camera's picture. */
const BODY = 2;
const DRACO = '/draco/';

/** Floor (x ahead, y left, h up; metres) → three (x, h, −y). */
const P = (x: number, y: number, h = 0) => new Vector3(x, h, -y);

export type AgvView = 'fit' | 'top' | 'follow' | 'lane';

export interface Found {
  name: string;
  kind: Target['kind'];
  /** Distance from the camera (m), where it is across the picture (−50 left … 50 right, %), share of the picture (%). */
  dist: number;
  off: number;
  size: number;
  /** Box in the picture, 0..1 from the top left. */
  box: [number, number, number, number];
}

export interface CalRun {
  points: { x: number; y: number }[];
  ok: boolean;
}

export interface AgvStageProps {
  model: AgvModel;
  sim: MutableRefObject<AgvSim>;
  /** Called every frame before drawing (drive input, the simulator step). */
  onTick(dt: number): void;
  show: { trail: boolean; fov: boolean; lidar: boolean };
  view: AgvView;
  /** Bumped to re-apply the same view. */
  viewKey: number;
  /** The newest lidar turn (the console scans ~7 times a second). */
  lidar: MutableRefObject<LidarScan | null>;
  /** The camera panel's picture area; the robot's camera view is drawn there while `camOn`. */
  pipRef: RefObject<HTMLElement | null>;
  camOn: boolean;
  onFound(found: Found[]): void;
  calRuns: CalRun[];
  led: string;
  /** Room taken by the panels over the canvas (px): the view centres on what is left. */
  insets: { left: number; right: number; top: number; bottom: number };
}

// ---------------------------------------------------------------- textures (drawn once, in the browser)

let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, repeat?: [number, number]) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) {
    t.wrapS = t.wrapT = RepeatWrapping;
    t.repeat.set(...repeat);
  }
  return t;
}

function matTexture() {
  return canvasTexture(2400, 1600, (g) => {
    g.fillStyle = '#f7f8f9';
    g.fillRect(0, 0, 2400, 1600);
    for (let i = 0; i < 9000; i++) {
      g.fillStyle = `rgba(0,0,0,${rnd() * 0.025})`;
      g.fillRect(rnd() * 2400, rnd() * 1600, 2, 2);
    }
    g.strokeStyle = '#e4e7eb';
    g.lineWidth = 2;
    for (let x = 0; x <= 2400; x += 100) {
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x, 1600);
      g.stroke();
    }
    for (let y = 0; y <= 1600; y += 100) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(2400, y);
      g.stroke();
    }
    const px = (x: number, y: number) => [(x - (MAT.cx - MAT.w / 2)) * 1000, (MAT.cy + MAT.h / 2 - y) * 1000] as const;
    g.strokeStyle = '#1b1e22';
    g.lineWidth = 38;
    g.lineJoin = 'round';
    g.lineCap = 'round';
    g.beginPath();
    COURSE.forEach(([x, y], i) => {
      const [u, v] = px(x, y);
      if (i) g.lineTo(u, v);
      else g.moveTo(u, v);
    });
    g.stroke();
    const box = (x: number, y: number, w: number, h: number, col: string, label: string) => {
      const [u, v] = px(x - w / 2, y + h / 2);
      g.strokeStyle = col;
      g.lineWidth = 12;
      g.setLineDash([34, 20]);
      g.strokeRect(u, v, w * 1000, h * 1000);
      g.setLineDash([]);
      g.fillStyle = col;
      g.font = '700 64px Pretendard, sans-serif';
      g.fillText(label, u + 18, v + 76);
    };
    box(0, 0, 0.42, 0.36, '#1fae66', '출발');
    box(1.95, -0.62, 0.42, 0.3, '#3454d1', '도착');
  });
}

function laneTexture() {
  return canvasTexture(1400, 300, (g) => {
    g.clearRect(0, 0, 1400, 300);
    g.fillStyle = '#f5c518';
    g.fillRect(40, 138, 1320, 24);
    g.fillStyle = '#1b1e22';
    for (let i = 0; i <= 12; i++) {
      const x = 90 + i * 100;
      g.fillRect(x - 2, i % 5 ? 118 : 100, 4, i % 5 ? 64 : 100);
    }
    g.font = '700 40px Pretendard, sans-serif';
    g.fillText('보정 줄 1m', 90, 70);
    g.fillText('0', 80, 262);
    g.fillText('1m', 1060, 262);
  });
}

function cardboardTexture() {
  return canvasTexture(512, 512, (g) => {
    g.fillStyle = '#c7a37a';
    g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 4000; i++) {
      g.fillStyle = `rgba(90,60,30,${rnd() * 0.06})`;
      g.fillRect(rnd() * 512, rnd() * 512, 3, 1);
    }
    g.fillStyle = 'rgba(210,190,150,.8)';
    g.fillRect(0, 236, 512, 40);
  });
}

function faceTexture(t: Target) {
  if (t.kind === 'card') {
    return canvasTexture(200, 280, (g) => {
      g.fillStyle = '#fff';
      g.fillRect(0, 0, 200, 280);
      g.fillStyle = t.color!;
      g.fillRect(14, 14, 172, 252);
    });
  }
  // A real 6×6 ArUco marker (the kit's dictionary): black border, 6×6 bits, white margin.
  const bits = ARUCO_6X6[t.id ?? 1];
  const tex = canvasTexture(320, 320, (g) => {
    g.fillStyle = '#fff';
    g.fillRect(0, 0, 320, 320);
    g.fillStyle = '#000';
    g.fillRect(20, 20, 280, 280);
    g.fillStyle = '#fff';
    const cell = 280 / 8;
    for (let r = 0; r < 6; r++) for (let c = 0; c < 6; c++) if (bits?.[r * 6 + c] === '1') g.fillRect(20 + (c + 1) * cell, 20 + (r + 1) * cell, cell + 0.5, cell + 0.5);
  });
  tex.magFilter = NearestFilter;
  return tex;
}

// ---------------------------------------------------------------- the room

function Classroom() {
  const tex = useMemo(() => ({ mat: matTexture(), lane: laneTexture(), cardboard: cardboardTexture() }), []);
  useEffect(() => () => Object.values(tex).forEach((t) => t.dispose()), [tex]);
  const cx = (ROOM.x0 + ROOM.x1) / 2;
  const cy = (ROOM.y0 + ROOM.y1) / 2;
  const walls: [number, number, number, number][] = [
    [ROOM.x1, ROOM.y0, ROOM.x1, ROOM.y1],
    [ROOM.x0, ROOM.y1, ROOM.x1, ROOM.y1],
  ];
  return (
    <group>
      {/* floor: the arm console's light grey */}
      <mesh rotation-x={-Math.PI / 2} position={P(cx, cy)} receiveShadow>
        <planeGeometry args={[ROOM.x1 - ROOM.x0, ROOM.y1 - ROOM.y0]} />
        <meshStandardMaterial color="#e9edf2" roughness={0.95} />
      </mesh>
      {walls.map(([x0, y0, x1, y1], i) => {
        const len = Math.hypot(x1 - x0, y1 - y0);
        const yaw = Math.atan2(y1 - y0, x1 - x0);
        return (
          <group key={i} position={P((x0 + x1) / 2, (y0 + y1) / 2)} rotation-y={yaw}>
            <mesh position-y={0.8} receiveShadow>
              <boxGeometry args={[len, 1.6, 0.08]} />
              <meshStandardMaterial color="#f6f7f9" roughness={0.92} />
            </mesh>
            <mesh position-y={0.04}>
              <boxGeometry args={[len, 0.08, 0.1]} />
              <meshStandardMaterial color="#b9b2a6" roughness={0.7} />
            </mesh>
          </group>
        );
      })}
      {[-1.4, 0.2].map((y) => (
        <group key={y} position={P(ROOM.x1 - 0.05, y + 0.6, 1.0)} rotation-y={-Math.PI / 2}>
          <mesh position-z={-0.006}>
            <boxGeometry args={[1.26, 0.96, 0.02]} />
            <meshStandardMaterial color="#d7d2c8" />
          </mesh>
          <mesh position-z={0.006}>
            <planeGeometry args={[1.2, 0.9]} />
            <meshBasicMaterial color="#dcebff" />
          </mesh>
        </group>
      ))}
      <mesh position={P(0.9, ROOM.y1 - 0.06, 1.05)} rotation-y={Math.PI}>
        <boxGeometry args={[1.8, 0.8, 0.03]} />
        <meshStandardMaterial color="#fbfbf8" roughness={0.25} />
      </mesh>
      {/* the course mat and the calibration tape */}
      <mesh position={P(MAT.cx, MAT.cy, 0.002)} receiveShadow>
        <boxGeometry args={[MAT.w, 0.004, MAT.h]} />
        {[0, 0, 1, 0, 0, 0].map((top, i) =>
          top ? <meshStandardMaterial key={i} attach={`material-${i}`} map={tex.mat} roughness={0.72} /> : <meshStandardMaterial key={i} attach={`material-${i}`} color="#d9dde2" />,
        )}
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={P(LANE.x0 + 0.55, LANE.y, 0.003)} receiveShadow>
        <planeGeometry args={[1.4, 0.3]} />
        <meshStandardMaterial map={tex.lane} transparent roughness={0.6} />
      </mesh>
      {BOXES.map((b, i) => (
        <mesh key={i} position={P(b.x, b.y, b.h / 2)} castShadow receiveShadow>
          <boxGeometry args={[b.w, b.h, b.d]} />
          <meshStandardMaterial map={tex.cardboard} roughness={0.85} />
        </mesh>
      ))}
      {TARGETS.map((t) => (
        <Stand key={t.name} t={t} />
      ))}
    </group>
  );
}

function Stand({ t }: { t: Target }) {
  const face = useMemo(() => faceTexture(t), [t]);
  useEffect(() => () => face.dispose(), [face]);
  return (
    <group position={P(t.x, t.y)} rotation-y={MathUtils.degToRad(t.yawDeg)}>
      <mesh position-y={0.005} castShadow>
        <boxGeometry args={[0.07, 0.01, STAND.d]} />
        <meshStandardMaterial color="#9aa3b0" roughness={0.35} metalness={0.7} />
      </mesh>
      <mesh position-y={0.035}>
        <cylinderGeometry args={[0.004, 0.004, 0.05]} />
        <meshStandardMaterial color="#9aa3b0" roughness={0.35} metalness={0.7} />
      </mesh>
      <mesh position-y={STAND.board + t.h / 2} castShadow>
        <boxGeometry args={[0.004, t.h, t.w]} />
        {[0, 1, 2, 3, 4, 5].map((i) =>
          i === 1 ? <meshStandardMaterial key={i} attach={`material-${i}`} map={face} roughness={0.55} /> : <meshStandardMaterial key={i} attach={`material-${i}`} color="#f5f6f8" roughness={0.5} />,
        )}
      </mesh>
    </group>
  );
}

// ---------------------------------------------------------------- the robot

type WheelKey = 'fl' | 'fr' | 'rl' | 'rr';

/** The robot's camera: a perspective camera riding on the robot at the model's lens position. */
function makeEye() {
  const camera = new PerspectiveCamera(50, 4 / 3, 0.045, 12);
  return {
    camera,
    fit(model: AgvModel) {
      camera.fov = 2 * MathUtils.radToDeg(Math.atan(Math.tan(MathUtils.degToRad(model.hfov / 2)) * 0.75));
      camera.position.set(model.cam[0], model.cam[1], 0);
      camera.rotation.set(0, -Math.PI / 2, 0);
      camera.updateProjectionMatrix();
    },
    aspect(a: number) {
      if (Math.abs(camera.aspect - a) < 1e-4) return;
      camera.aspect = a;
      camera.updateProjectionMatrix();
    },
  };
}
type Eye = ReturnType<typeof makeEye>;

/** The official model with its own materials, turning wheels, the camera's field of view and the light. */
function buildRobot(scene: Object3D, model: AgvModel, eye: Eye) {
  const group = new Group();
  const root = scene.clone(true);
  root.rotation.x = -Math.PI / 2;
  const rubber = new MeshStandardMaterial({ color: '#2a2e35', roughness: 0.78 });
  const body = model.plus
    ? new MeshPhysicalMaterial({ color: '#f1f2f4', roughness: 0.38, clearcoat: 0.35, clearcoatRoughness: 0.4 })
    : new MeshStandardMaterial({ color: '#23272e', roughness: 0.32, metalness: 0.55 });
  const laser = new MeshStandardMaterial({ color: '#1d2026', roughness: 0.3, metalness: 0.3 });
  const wheels: Partial<Record<WheelKey, { node: Object3D; base: number }>> = {};
  root.traverse((o) => {
    if (o.name.startsWith('wheel_')) wheels[o.name.slice(6) as WheelKey] = { node: o, base: o.rotation.y };
    const m = o as Mesh;
    if (!m.isMesh) return;
    m.layers.set(BODY);
    m.castShadow = m.receiveShadow = true;
    let wheel = false;
    for (let p: Object3D | null = o; p; p = p.parent) if (p.name.startsWith('wheel_')) wheel = true;
    m.material = wheel ? rubber : o.name.startsWith('laser') ? laser : body;
  });
  group.add(root);

  // the camera's field of view on the floor, as lines and a faint fill (screen only)
  const [cx, cz] = model.cam;
  const v = 2 * Math.atan(Math.tan(MathUtils.degToRad(model.hfov / 2)) * 0.75);
  const L = 0.4;
  const hw = Math.tan(MathUtils.degToRad(model.hfov / 2)) * L;
  const hh = Math.tan(v / 2) * L;
  const o = new Vector3(cx, cz, 0);
  const c = [
    [L, hh, hw],
    [L, hh, -hw],
    [L, -hh, -hw],
    [L, -hh, hw],
  ].map(([x, y, z]) => new Vector3(cx + x, Math.max(0.003, cz + y), z));
  const seg: Vector3[] = [];
  const tri: Vector3[] = [];
  c.forEach((p, i) => {
    seg.push(o, p, p, c[(i + 1) % 4]);
    tri.push(o, p, c[(i + 1) % 4]);
  });
  const lines = new LineSegments(new BufferGeometry().setFromPoints(seg), new LineBasicMaterial({ color: '#e0457b', transparent: true, opacity: 0.8 }));
  const fill = new Mesh(new BufferGeometry().setFromPoints(tri), new MeshBasicMaterial({ color: '#e0457b', transparent: true, opacity: 0.06, side: DoubleSide, depthWrite: false }));
  lines.layers.set(SCREEN);
  fill.layers.set(SCREEN);
  group.add(lines, fill);

  const ledMat = new MeshBasicMaterial({ color: '#1fae66', toneMapped: false });
  const ledBar = new Mesh(new BoxGeometry(0.012, 0.003, 0.11), ledMat);
  ledBar.layers.set(BODY);
  ledBar.position.set(-model.size[0] / 2 + 0.022, model.plus ? 0.1 : 0.1335, 0);
  group.add(ledBar);

  eye.fit(model);
  group.add(eye.camera);

  return {
    group,
    update(sim: AgvSim, showFov: boolean, led: string) {
      group.position.copy(P(sim.pose.x, sim.pose.y));
      group.rotation.y = sim.pose.th;
      for (const k of ['fl', 'fr', 'rl', 'rr'] as const) {
        const w = wheels[k];
        if (w) w.node.rotation.y = w.base + sim.wheelAngle[k];
      }
      lines.visible = fill.visible = showFov;
      ledMat.color.set(led);
    },
    dispose() {
      group.remove(eye.camera);
      for (const m of [rubber, body, laser, ledMat, lines.material, fill.material] as Material[]) m.dispose();
      for (const g of [lines.geometry, fill.geometry, ledBar.geometry]) g.dispose();
    },
  };
}

function Robot({ model, sim, led, eye, show }: { model: AgvModel; sim: MutableRefObject<AgvSim>; led: string; eye: Eye; show: AgvStageProps['show'] }) {
  const { scene } = useGLTF(model.file, DRACO);
  const robot = useMemo(() => buildRobot(scene, model, eye), [scene, model, eye]);
  useEffect(() => () => robot.dispose(), [robot]);
  useFrame(() => robot.update(sim.current, show.fov, led));
  return <primitive object={robot.group} />;
}

// ---------------------------------------------------------------- screen helpers

/**
 * A line through where the robot has been, rebuilt when the trail changes. Always at least two
 * points (a zero-length line at the start), so it is drawn — and its shader compiled — at load,
 * not a moment after driving starts (a compile holds the page up to half a second on slow graphics,
 * long enough for the real robot's keep-alive to lapse).
 */
function makeTrail() {
  const line = new Line(new BufferGeometry(), new LineBasicMaterial({ color: '#3454d1' }));
  line.layers.set(SCREEN);
  line.frustumCulled = false;
  let version = -1;
  return {
    line,
    update(sim: AgvSim, visible: boolean) {
      line.visible = visible;
      if (sim.trailVersion === version) return;
      version = sim.trailVersion;
      const pts = sim.trail.length > 1 ? sim.trail : [sim.trail[0] ?? sim.pose, sim.trail[0] ?? sim.pose];
      const arr = new Float32Array(pts.length * 3);
      pts.forEach((p, i) => arr.set([p.x, 0.006, -p.y], i * 3));
      line.geometry.setAttribute('position', new Float32BufferAttribute(arr, 3));
      line.geometry.setDrawRange(0, pts.length);
    },
    dispose() {
      line.geometry.dispose();
      (line.material as Material).dispose();
    },
  };
}

function Trail({ sim, visible }: { sim: MutableRefObject<AgvSim>; visible: boolean }) {
  const trail = useMemo(() => makeTrail(), []);
  useEffect(() => () => trail.dispose(), [trail]);
  useFrame(() => trail.update(sim.current, visible));
  return <primitive object={trail.line} />;
}

/** The lidar's hits as red dots at the lidar's height. */
function makeLidarPoints() {
  const points = new Points(new BufferGeometry(), new PointsMaterial({ color: '#ff3b30', size: 0.03, sizeAttenuation: true }));
  points.layers.set(SCREEN);
  points.frustumCulled = false;
  let last: LidarScan | null = null;
  return {
    points,
    update(scan: LidarScan | null, visible: boolean, height: number) {
      points.visible = visible;
      if (!scan || scan === last) return;
      last = scan;
      const arr = new Float32Array(scan.points.length * 3);
      scan.points.forEach(([x, y], i) => arr.set([x, height, -y], i * 3));
      points.geometry.setAttribute('position', new Float32BufferAttribute(arr, 3));
    },
    dispose() {
      points.geometry.dispose();
      (points.material as Material).dispose();
    },
  };
}

function LidarPoints({ scan, visible, model }: { scan: MutableRefObject<LidarScan | null>; visible: boolean; model: AgvModel }) {
  const lidar = useMemo(() => makeLidarPoints(), []);
  useEffect(() => () => lidar.dispose(), [lidar]);
  useFrame(() => lidar.update(scan.current, visible, model.lidar[1] + 0.0175));
  return <primitive object={lidar.points} />;
}

function CalRibbons({ runs, visible }: { runs: CalRun[]; visible: boolean }) {
  const meshes = useMemo(
    () =>
      runs
        .filter((r) => r.points.length > 3)
        .map((r) => {
          const pts = r.points.filter((_, i) => i % 3 === 0).map((p) => P(p.x, p.y, 0.01));
          const m = new Mesh(new TubeGeometry(new CatmullRomCurve3(pts), 120, 0.006, 6), new MeshBasicMaterial({ color: r.ok ? '#1fae66' : '#ef4638' }));
          m.layers.set(SCREEN);
          return m;
        }),
    [runs],
  );
  useEffect(
    () => () =>
      meshes.forEach((m) => {
        m.geometry.dispose();
        (m.material as Material).dispose();
      }),
    [meshes],
  );
  return (
    <group visible={visible}>
      {meshes.map((m, i) => (
        <primitive key={i} object={m} />
      ))}
    </group>
  );
}

// ---------------------------------------------------------------- views and drawing

const VIEWS: Record<Exclude<AgvView, 'follow'>, { pos: Vector3; target: Vector3 }> = {
  fit: { pos: P(-1.45, -1.75, 1.8), target: P(0.8, -0.3, 0) },
  top: { pos: P(0.8, -0.32, 3.9), target: P(0.8, -0.3, 0) },
  lane: { pos: P(LANE.x0 + 0.6, LANE.y - 0.55, 1.75), target: P(LANE.x0 + 0.6, LANE.y + 0.05, 0) },
};

/** How often the robot's camera looks for things (s). */
const FIND_S = 0.14;

function Director(props: AgvStageProps & { eye: Eye }) {
  const timers = useRef({ find: 0, t: 0 });
  const offset = useRef('');
  const pendingView = useRef<AgvView | null>(props.view);
  const { view, viewKey, sim, eye } = props;
  useEffect(() => {
    pendingView.current = view;
  }, [view, viewKey]);

  useFrame((state, delta) => {
    const { gl, scene, size } = state;
    const cam = state.camera as PerspectiveCamera;
    const controls = state.controls as unknown as OrbitControlsImpl | null;
    const dt = Math.min(0.05, delta);
    props.onTick(dt);
    const s = sim.current;
    const t = (timers.current.t += dt);

    const want = pendingView.current;
    if (want && controls) {
      pendingView.current = null;
      if (want !== 'follow') {
        cam.position.copy(VIEWS[want].pos);
        controls.target.copy(VIEWS[want].target);
      }
    }
    // centre the picture on the part of the screen the panels leave free
    const { left, right, top, bottom } = props.insets;
    const key = `${size.width}x${size.height}:${left},${right},${top},${bottom}`;
    if (key !== offset.current) {
      offset.current = key;
      cam.setViewOffset(size.width, size.height, -((left + (size.width - right)) / 2 - size.width / 2), -((top + (size.height - bottom)) / 2 - size.height / 2), size.width, size.height);
      cam.updateProjectionMatrix();
    }
    if (view === 'follow' && controls) {
      const c = Math.cos(s.pose.th);
      const n = Math.sin(s.pose.th);
      cam.position.lerp(P(s.pose.x - c * 0.9, s.pose.y - n * 0.9, 0.55), 0.08);
      controls.target.lerp(P(s.pose.x + c * 0.3, s.pose.y + n * 0.3, 0.05), 0.12);
    }
    controls?.update();

    // draw: the room, then the robot's camera inside the camera panel
    gl.setScissorTest(false);
    gl.setViewport(0, 0, size.width, size.height);
    gl.render(scene, cam);
    const pip = props.pipRef.current;
    if (props.camOn && pip) {
      const box = gl.domElement.getBoundingClientRect();
      const r = pip.getBoundingClientRect();
      const x = r.left - box.left;
      const y = box.bottom - r.bottom;
      if (r.width > 4 && r.height > 4 && x < size.width && y < size.height) {
        eye.aspect(r.width / r.height);
        gl.setScissorTest(true);
        gl.setScissor(x, y, r.width, r.height);
        gl.setViewport(x, y, r.width, r.height);
        const exposure = gl.toneMappingExposure;
        gl.toneMappingExposure = 1.2;
        gl.render(scene, eye.camera);
        gl.toneMappingExposure = exposure;
        gl.setScissorTest(false);
        gl.setViewport(0, 0, size.width, size.height);
      }
      if (t - timers.current.find > FIND_S) {
        timers.current.find = t;
        props.onFound(findTargets(eye.camera));
      }
    }
  }, 1);
  return null;
}

/** Cards and markers the robot's camera sees now: facing it, in the picture, within 3 m, not behind a box. */
export function findTargets(eye: PerspectiveCamera): Found[] {
  eye.updateMatrixWorld();
  const eyePos = new Vector3().setFromMatrixPosition(eye.matrixWorld);
  const found: Found[] = [];
  for (const t of TARGETS) {
    const yaw = MathUtils.degToRad(t.yawDeg);
    const centre = P(t.x, t.y, STAND.board + t.h / 2);
    // the board faces −X of the stand, turned by its yaw (three: yaw about +Y)
    const normal = new Vector3(-Math.cos(yaw), 0, Math.sin(yaw));
    if (eyePos.clone().sub(centre).dot(normal) <= 0) continue;
    const across = new Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const corners = [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ].map(([a, b]) => centre.clone().addScaledVector(across, (a * t.w) / 2).add(new Vector3(0, (b * t.h) / 2, 0)).project(eye));
    if (corners.some((p) => p.z > 1 || p.z < -1)) continue;
    const xs = corners.map((p) => (p.x + 1) / 2);
    const ys = corners.map((p) => (1 - p.y) / 2);
    const x0 = Math.min(...xs);
    const x1 = Math.max(...xs);
    const y0 = Math.min(...ys);
    const y1 = Math.max(...ys);
    if (x1 < 0 || x0 > 1 || y1 < 0 || y0 > 1 || x1 - x0 < 0.01) continue;
    const dist = eyePos.distanceTo(centre);
    if (dist > 3) continue;
    // a box in between (taller than the line of sight where it crosses) hides it
    const ex = eyePos.x;
    const ey = -eyePos.z;
    const dx = t.x - ex;
    const dy = t.y - ey;
    const flat = Math.hypot(dx, dy);
    const hidden = BOXES.some((b) => {
      let t0 = 0;
      let t1 = 1;
      for (const [o, d, lo, hi] of [
        [ex, dx, b.x - b.w / 2, b.x + b.w / 2],
        [ey, dy, b.y - b.d / 2, b.y + b.d / 2],
      ]) {
        if (Math.abs(d) < 1e-9) {
          if (o < lo || o > hi) return false;
          continue;
        }
        let a = (lo - o) / d;
        let c = (hi - o) / d;
        if (a > c) [a, c] = [c, a];
        t0 = Math.max(t0, a);
        t1 = Math.min(t1, c);
        if (t0 > t1) return false;
      }
      const h = eyePos.y + (centre.y - eyePos.y) * t0;
      return t0 * flat > 0.02 && h < b.h;
    });
    if (hidden) continue;
    const cxp = (x0 + x1) / 2;
    found.push({
      name: t.name,
      kind: t.kind,
      dist,
      off: Math.round((cxp - 0.5) * 100),
      size: Math.round((x1 - x0) * (y1 - y0) * 100),
      box: [x0, y0, x1, y1],
    });
  }
  return found.sort((a, b) => a.dist - b.dist);
}

function AgvStage(props: AgvStageProps) {
  const eye = useMemo(() => makeEye(), []);
  return (
    <Canvas
      shadows="percentage"
      dpr={[1, 1.5]}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      camera={{ position: VIEWS.fit.pos, fov: 36, near: 0.02, far: 40 }}
      onCreated={({ gl, camera }) => {
        camera.layers.enable(SCREEN);
        camera.layers.enable(BODY);
        gl.toneMapping = NeutralToneMapping;
        gl.toneMappingExposure = 1;
        gl.autoClear = true;
      }}
      style={{ position: 'absolute', inset: 0 }}
    >
      <color attach="background" args={['#eef1f5']} />
      <StudioLight intensity={0.5} />
      <hemisphereLight args={['#ffffff', '#cfd6de', 0.55]} />
      <directionalLight
        position={[3.6, 3.4, 2.6]}
        intensity={2.4}
        color="#fff4e6"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-3}
        shadow-camera-right={3}
        shadow-camera-top={3}
        shadow-camera-bottom={-3}
        shadow-camera-near={0.5}
        shadow-camera-far={10}
        shadow-bias={-0.0006}
        onUpdate={(light) => light.shadow.camera.layers.enable(BODY)}
      />
      <directionalLight position={[-3, 2.5, -3]} intensity={0.6} color="#dfe8ff" />
      <Classroom />
      <Grid
        onUpdate={(g) => g.layers.set(SCREEN)}
        position={[0.8, 0.0008, 0.3]}
        infiniteGrid
        cellSize={0.1}
        cellThickness={0.6}
        cellColor="#d9dfe6"
        sectionSize={1}
        sectionThickness={1}
        sectionColor="#c3ccd6"
        fadeDistance={7}
        fadeStrength={1.6}
      />
      <Suspense fallback={null}>
        <Robot model={props.model} sim={props.sim} led={props.led} eye={eye} show={props.show} />
      </Suspense>
      <Trail sim={props.sim} visible={props.show.trail} />
      <LidarPoints scan={props.lidar} visible={props.show.lidar} model={props.model} />
      <CalRibbons runs={props.calRuns} visible={props.show.trail} />
      <OrbitControls makeDefault enableDamping maxPolarAngle={Math.PI * 0.49} minDistance={0.25} maxDistance={9} />
      <Director {...props} eye={eye} />
    </Canvas>
  );
}

export default memo(AgvStage);

useGLTF.preload('/robot/myagv/myagv2023.glb', DRACO);
