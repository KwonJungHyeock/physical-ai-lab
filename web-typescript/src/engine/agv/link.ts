/**
 * Talking to the myAGV's own server (robot-python/server/agv_server.py).
 *
 * Served by the robot, `/api/state` answers with kind 'agv' and the driving
 * console mirrors and drives the real base; anywhere else it stays a
 * simulator. Driving is a keep-alive: the speed it wants goes out every
 * ~0.15 s while something is held (POST /api/drive, from engine/agv/keepAlive's
 * worker), and the robot stops when that stops.
 */

import type { Trim } from './sim';

export interface AgvState {
  connected: boolean;
  demo: boolean;
  kind: string;
  model?: string;
  /** The speed being sent to the base now (after the trim). */
  vx: number;
  vy: number;
  wz: number;
  moving: boolean;
  /** The 1 m straight-line test (or 로봇 찾기) is running on the robot. */
  running: boolean;
  battery: number | null;
  trim: Trim;
  led: number[];
  message: string;
  error: string;
  maxV: number;
  maxW: number;
  camera: boolean;
  robotId?: string;
  ips?: string[];
  host?: string;
  /** Demo server only: where its stand-in base is (x, y, th). */
  demoPose?: [number, number, number];
}

export async function fetchAgvState(signal?: AbortSignal): Promise<AgvState | null> {
  try {
    const r = await fetch('/api/state', { cache: 'no-store', signal });
    if (!r.ok) return null;
    const s = (await r.json()) as AgvState;
    return s.kind === 'agv' && typeof s.connected === 'boolean' ? s : null;
  } catch {
    return null;
  }
}

export interface PostResult {
  ok: boolean;
  error?: string | null;
}

async function post(path: string, body: unknown = {}): Promise<PostResult> {
  try {
    const r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return (await r.json()) as PostResult;
  } catch (err) {
    return { ok: false, error: `로봇 서버에 연결할 수 없어요 (${err instanceof Error ? err.message : String(err)})` };
  }
}

export const stopAgv = () => post('/api/stop');
/** The 1 m straight-line test, driven by the robot itself (0.2 m/s for 5 s). */
export const straightTestAgv = () => post('/api/straight');
export const trimAgv = (trim: Trim) => post('/api/trim', trim);
export const ledAgv = (r: number, g: number, b: number) => post('/api/led', { r, g, b });
export const reconnectAgv = () => post('/api/reconnect');
export const agvCameraUrl = () => `/api/camera.jpg?t=${Date.now()}`;
