/**
 * The drive keep-alive, in a Web Worker.
 *
 * The robot's server stops the base when no drive command has come for 0.5 s
 * (Wi-Fi gone, tab closed). The page itself can be busy for a moment — the 3D
 * scene getting ready, a slow graphics card — and a timer on the page would
 * then miss its beat and the robot would stutter. A worker's timer keeps
 * running meanwhile, so it sends the commands; the page tells it what to send
 * a few times a second. If the page goes quiet for longer (really stuck), the
 * worker stops sending too, and the server stops the robot.
 */

import type { Twist } from './sim';

/** Send period (ms) and how long the worker keeps going without hearing from the page (ms). */
export const KEEP_ALIVE_MS = 150;
export const PAGE_SILENT_MS = 1000;

const WORKER = `
let cmd = null, heard = 0, moving = false, busy = null;
const post = (path, body) => fetch(location.origin + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
// One request at a time, in order: a stop can never overtake the drive command before it.
const run = (job) => {
  busy = (async () => {
    try {
      await job();
    } catch (err) {
      postMessage({ error: String(err) });
    }
  })().finally(() => (busy = null));
};
onmessage = async (e) => {
  heard = Date.now();
  if (e.data.stop) {
    // [멈춤]: forget the command at once, let a request on its way finish, stop the robot, then answer.
    cmd = null;
    moving = false;
    while (busy) await busy;
    await post('/api/stop').catch(() => {});
    postMessage({ stopped: e.data.stop });
    return;
  }
  cmd = e.data.cmd;
};
setInterval(() => {
  if (busy) return;
  const c = Date.now() - heard < ${PAGE_SILENT_MS} ? cmd : null;
  const now = !!c && Math.abs(c.vx) + Math.abs(c.vy) + Math.abs(c.wz) > 1e-3;
  const was = moving;
  moving = now;
  if (now) {
    run(async () => {
      const j = await (await post('/api/drive', c)).json();
      if (!j.ok && j.error) postMessage({ error: j.error });
    });
  } else if (was) {
    run(() => post('/api/stop'));
  }
}, ${KEEP_ALIVE_MS});
`;

export interface KeepAlive {
  /** The command to keep sending (null or zero: stop). Call every tick — it is also the page's heartbeat. */
  set(cmd: Twist | null): void;
  /** Stop now: the worker drops its command and tells the robot to stop; resolves once the robot has the stop. */
  stop(): Promise<void>;
  close(): void;
}

export function startKeepAlive(onError: (message: string) => void): KeepAlive {
  const url = URL.createObjectURL(new Blob([WORKER], { type: 'text/javascript' }));
  const worker = new Worker(url);
  URL.revokeObjectURL(url);
  const waiting = new Map<number, () => void>();
  let next = 1;
  worker.onmessage = (e: MessageEvent<{ error?: string; stopped?: number }>) => {
    if (e.data.error) onError(e.data.error);
    if (e.data.stopped) {
      waiting.get(e.data.stopped)?.();
      waiting.delete(e.data.stopped);
    }
  };
  return {
    set: (cmd) => worker.postMessage({ cmd }),
    stop: () =>
      new Promise<void>((resolve) => {
        const id = next++;
        waiting.set(id, resolve);
        worker.postMessage({ stop: id });
        // Never wait long: the page's own stop goes out as well.
        window.setTimeout(() => {
          waiting.delete(id);
          resolve();
        }, 1500);
      }),
    close: () => {
      waiting.forEach((resolve) => resolve());
      worker.terminate();
    },
  };
}
