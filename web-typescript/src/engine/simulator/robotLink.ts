/**
 * Talking to the on-robot server (robot-python/server/server.py).
 *
 * The console is the same web app everywhere. When it is served by the robot,
 * `/api/state` answers and the console switches to robot mode: it mirrors the
 * real arm, and "로봇에서 실행" drives it. Anywhere else (Vercel, dev server)
 * that request fails and the console stays a simulator.
 */

import type { RobotAction } from './sim';

export interface RobotState {
  connected: boolean;
  demo: boolean;
  angles: number[] | null;
  running: boolean;
  step: number;
  line: number;
  total: number;
  released: boolean;
  message: string;
  error: string;
  speedCap: number;
  /** Id of the latest run the server started. */
  run: number;
  /** Seconds since the robot last answered an angle read (robot clock); null before the first. */
  age: number | null;
  /** Arrivals measured in the latest run (fetch them with fetchArrivals). */
  arrivalCount: number;
  /** The robot has OpenCV and a camera source configured. */
  camera: boolean;
  /** How many cameras the robot found (kit camera, hand camera); 0 while still looking. */
  cameras?: number;
  /** The robot can switch the suction pump (Hobot.GPIO present); why not, when it cannot. */
  pump: boolean;
  pumpError: string;
  /** The gripper as last commanded on the robot (null: not yet since the server started). */
  gripper?: 'open' | 'closed' | null;
  /** Servo off per joint (J1..J6), e.g. while one joint is zero-calibrated by hand. */
  limp?: boolean[];
  /** When each joint was last zero-calibrated from the console: {"1": unix seconds, ...}. */
  calibrated?: Record<string, number>;
  /** The robot's ID (last number of its address) and its addresses, so each student finds their robot. */
  robotId?: string;
  ips?: string[];
  /** 'arm' or 'agv', the product name and the robot computer's name (shown by 로봇 찾기). */
  kind?: string;
  model?: string;
  host?: string;
}

/** Where the arm really stopped for one move: commanded and measured joint angles. */
export interface Arrival {
  target: number[];
  actual: number[];
}

export async function fetchArrivals(): Promise<Arrival[]> {
  try {
    const r = await fetch('/api/arrivals', { cache: 'no-store' });
    return ((await r.json()) as { arrivals: Arrival[] }).arrivals ?? [];
  } catch {
    return [];
  }
}

/** Frame URL of the robot's camera number `cam` (from 0); a fresh one each call, so the browser does not cache it. */
export const cameraFrameUrl = (cam = 0) => `/api/camera.jpg?cam=${cam}&t=${Date.now()}`;

/** Result of the official colour program run on the robot (robot-python/server/camera.py). */
export interface RobotVision {
  ok: boolean;
  error?: string;
  ms: number;
  engine: string;
  markers: number[];
  detections: { color: string; u: number; v: number; x?: number; y?: number }[];
}

export async function visionOnRobot(cam = 0): Promise<RobotVision> {
  try {
    const r = await fetch('/api/vision', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cam }) });
    return (await r.json()) as RobotVision;
  } catch (err) {
    return { ok: false, error: String(err), ms: 0, engine: '', markers: [], detections: [] };
  }
}

/**
 * Hand camera (camera flange) on the robot: the official RDK X5 vision kit colour program and its
 * hand-eye calibration, with the arm's pose read on the robot → each block's position (mm, robot frame).
 * `planeZ`: height of the block tops in the robot's frame (block size, minus a base under the robot).
 */
export async function handVisionOnRobot(cam: number, planeZ: number): Promise<RobotVision> {
  try {
    const r = await fetch('/api/vision/hand', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cam, planeZ }) });
    const j = (await r.json()) as RobotVision;
    return { ...j, markers: j.markers ?? [], detections: j.detections ?? [] };
  } catch (err) {
    return { ok: false, error: String(err), ms: 0, engine: '', markers: [], detections: [] };
  }
}

/** The AI sample run on the robot: YOLOv5s object detection (official RDK X5 vision kit yolo_demo). */
export interface RobotAi {
  ok: boolean;
  error?: string;
  ms: number;
  loadMs?: number;
  engine: string;
  detections: { name: string; label: string; score: number; box: number[] }[];
  /** The frame with the boxes drawn on the robot (data URL). */
  image?: string;
}

export async function aiOnRobot(cam = 0): Promise<RobotAi> {
  try {
    const r = await fetch('/api/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cam }) });
    const j = (await r.json()) as RobotAi;
    return { ...j, detections: j.detections ?? [] };
  } catch (err) {
    return { ok: false, error: String(err), ms: 0, engine: '', detections: [] };
  }
}

/** Before the acceptance demonstration: what the robot has for each check (/api/selfcheck). */
export async function fetchSelfcheck(): Promise<{ ok: boolean; error?: string; items: import('./evidence').PrepItem[] }> {
  try {
    const r = await fetch('/api/selfcheck', { cache: 'no-store' });
    const j = (await r.json()) as { items?: import('./evidence').PrepItem[] };
    return { ok: r.ok, items: j.items ?? [] };
  } catch (err) {
    return { ok: false, error: String(err), items: [] };
  }
}

export async function fetchRobotState(signal?: AbortSignal): Promise<RobotState | null> {
  try {
    const r = await fetch('/api/state', { cache: 'no-store', signal });
    if (!r.ok) return null;
    const s = (await r.json()) as RobotState;
    return typeof s.connected === 'boolean' ? s : null;
  } catch {
    return null;
  }
}

/** `run` is the id of the run a /api/run or /api/move started; the run is over once /api/state shows that id not running. */
export interface PostResult {
  ok: boolean;
  error?: string;
  run?: number;
  /** HTTP status (409: refused, e.g. the arm is still moving). */
  status?: number;
}

async function post(path: string, body: unknown = {}): Promise<PostResult> {
  try {
    const r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { ...((await r.json()) as PostResult), status: r.status };
  } catch (err) {
    return { ok: false, error: `로봇 서버에 연결할 수 없어요 (${err instanceof Error ? err.message : String(err)})` };
  }
}

/** A program the simulator has run: its recorded actions, plus the gripper type of the fitted tool. */
export function runOnRobot(actions: RobotAction[], gripperType?: number) {
  return post('/api/run', { actions: actions.map((a) => (a.type === 'gripper' ? { ...a, gripperType: gripperType ?? 1 } : a)) });
}

export const moveRobot = (angles: number[], speed = 20) => post('/api/move', { angles, speed });
export const stopRobot = () => post('/api/stop');
export const releaseRobot = () => post('/api/release');
export const focusRobot = () => post('/api/focus');
/** Suction pump on/off right now (control panel test). */
export const pumpRobot = (on: boolean) => post('/api/pump', { on });
/** Gripper open/close right now (control panel); `gripperType` is pymycobot's: 1 adaptive, 3 parallel, 4 flexible. */
export const gripRobot = (open: boolean, gripperType = 1) => post('/api/gripper', { open, gripperType });
/** Zero calibration of the given joints (servos must be released and the marks lined up by hand). */
export const calibrateRobot = (joints: number[]) => post('/api/calibrate', { joints });
/** One joint's servo off (to line up its zero marks by hand) or on again. */
export const jointServo = (joint: number, off: boolean) => post('/api/joint', { joint, off });
/**
 * Real-time jog: the next target of a held jog key. The server sends it on at
 * once (no waiting for arrival) and stops the arm when targets stop coming.
 */
export const targetRobot = (angles: number[], speed: number) => post('/api/target', { angles, speed });
/** Reopen the robot's serial port on the server (after the arm was switched off and on, or a cable hiccup). */
export const reconnectRobot = () => post('/api/reconnect');
/**
 * Smooth joint jog on the robot (its own continuous jog). Call every ~0.2 s while the key is held;
 * the robot stops when the calls stop, on stopRobot(), or near the joint's limit.
 */
export const jogRobot = (joint: number, dir: -1 | 1, speed: number) => post('/api/jog', { joint, dir, speed });
/** Smooth tool jog along a base axis on the robot (its own continuous jog_coord), same keep-alive. */
export const jogRobotAxis = (axis: 'x' | 'y' | 'z', dir: -1 | 1, speed: number) => post('/api/jog', { axis, dir, speed });

/** Where the robot's Wi-Fi is connected (robot-python/server/wifi.py). */
export interface WifiStatus {
  ok: boolean;
  error?: string;
  /** 'hotspot' = the robot's own network, 'wifi' = joined a router, null = not connected. */
  mode?: 'hotspot' | 'wifi' | null;
  ssid?: string | null;
  device?: string;
  robotId?: string;
  ips?: string[];
  /** The last switch the console asked for, and how it went. */
  last?: { ssid: string; state: 'switching' | 'ok' | 'failed'; error: string; at: number } | null;
}

export interface WifiNetwork {
  ssid: string;
  signal: number;
  secure: boolean;
  current?: boolean;
}

export async function fetchWifi(signal?: AbortSignal): Promise<WifiStatus> {
  try {
    const r = await fetch('/api/wifi', { cache: 'no-store', signal });
    return (await r.json()) as WifiStatus;
  } catch (err) {
    return { ok: false, error: `로봇이 대답하지 않아요 (${err instanceof Error ? err.message : String(err)})` };
  }
}

export async function scanWifi(): Promise<{ ok: boolean; error?: string; networks: WifiNetwork[] }> {
  try {
    const r = await fetch('/api/wifi/scan', { cache: 'no-store', signal: AbortSignal.timeout(40000) });
    return (await r.json()) as { ok: boolean; error?: string; networks: WifiNetwork[] };
  } catch (err) {
    return { ok: false, error: `Wi-Fi 목록을 받지 못했어요 (${err instanceof Error ? err.message : String(err)})`, networks: [] };
  }
}

/** The robot leaves its current network for `ssid` a moment after answering (this page loses it if the network changes). */
export const connectWifi = (ssid: string, password: string) => post('/api/wifi/connect', { ssid, password });
/** Back to the robot's own hotspot. */
export const hotspotWifi = () => post('/api/wifi/hotspot');
