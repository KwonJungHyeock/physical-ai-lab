/**
 * 로봇 찾기: list every robot console on the classroom network.
 *
 * The browser asks each address of the network (prefix.1 … prefix.254) for
 * `/api/state` on the console port; robot servers answer it to any page
 * (CORS + Private Network Access headers, robot-python/server/server.py).
 * Addresses with nothing behind them are given up after a short timeout, and
 * many are asked at once, so a whole network takes a few seconds.
 *
 * From an HTTPS page (the web version) Chrome asks once for permission to
 * reach local network devices, and `targetAddressSpace` tells it a request is
 * meant for the local network (it must match the address, or Chrome refuses
 * the request; its name for "local" changed between versions, so both are
 * tried). A plain-HTTP page, like the robot's own console, needs none of it.
 */

export const ROBOT_PORT = 8080;

export interface FoundRobot {
  /** host:port, as used in http://<address>/console */
  address: string;
  ip: string;
  /** All the robot's addresses (one robot reached on two addresses is listed once). */
  ips: string[];
  robotId: string;
  kind: 'arm' | 'agv' | string;
  model: string;
  host: string;
  /** 사용자 이름 set from the USB stick (wifi.txt 사용자=), '' when none. */
  label: string;
  demo: boolean;
  /** The server reaches the robot hardware (serial port answers). */
  connected: boolean;
  running: boolean;
  /** Its server takes commands from the PC program's own screens (newer robots). */
  remote: boolean;
  /** Round trip of the answer, ms. */
  ms: number;
}

interface StateReply {
  connected?: boolean;
  demo?: boolean;
  running?: boolean;
  robotId?: string;
  ips?: string[];
  kind?: string;
  model?: string;
  host?: string;
  label?: string;
  remote?: boolean;
}

/** Chrome's Local Network Access options to try for `ip` (other browsers ignore the field). */
function localAccess(ip: string): RequestInit[] {
  if (typeof location === 'undefined' || location.protocol !== 'https:') return [{}];
  const space = (s: string) => ({ targetAddressSpace: s }) as RequestInit;
  return ip.startsWith('127.') || ip === 'localhost' ? [space('loopback')] : [space('local'), space('private')];
}

/** fetch with the first Local Network Access option the browser takes (a refused one fails at once). */
async function fetchLocal(ip: string, url: string, init: RequestInit): Promise<Response> {
  const options = localAccess(ip);
  for (let i = 0; ; i++) {
    try {
      return await fetch(url, { ...options[i], ...init });
    } catch (err) {
      if (i + 1 >= options.length || (err as Error).name !== 'TypeError') throw err;
    }
  }
}

/** "192.168.0" / "192.168.0." / "192.168.0.7" → "192.168.0." (null if it is not the first three numbers of an address). */
export function networkPrefix(input: string): string | null {
  const m = input.trim().match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})(?:\.\d{0,3})?$/);
  if (!m) return null;
  const parts = m.slice(1, 4).map(Number);
  return parts.every((n) => n <= 255) ? `${parts.join('.')}.` : null;
}

/** One address: the robot's reply, or null (nothing there, not a robot console, or too slow). */
export async function probeRobot(ip: string, timeoutMs = 1500, port = ROBOT_PORT): Promise<FoundRobot | null> {
  const address = `${ip}:${port}`;
  const t0 = performance.now();
  try {
    const r = await fetchLocal(ip, `http://${address}/api/state`, { mode: 'cors', cache: 'no-store', signal: AbortSignal.timeout(timeoutMs) });
    if (!r.ok) return null;
    const s = (await r.json()) as StateReply;
    if (typeof s.connected !== 'boolean') return null;
    return {
      address,
      ip,
      ips: s.ips ?? [ip],
      robotId: s.robotId || ip.split('.').at(-1) || '',
      kind: s.kind ?? 'arm',
      model: s.model ?? '로봇팔',
      host: s.host ?? '',
      label: typeof s.label === 'string' ? s.label.slice(0, 40) : '',
      demo: !!s.demo,
      connected: s.connected,
      running: !!s.running,
      remote: !!s.remote,
      ms: Math.round(performance.now() - t0),
    };
  } catch {
    return null;
  }
}

/** The same server reached on two addresses (e.g. wired and Wi-Fi on one network). */
export const sameRobot = (a: FoundRobot, b: FoundRobot) => a.host === b.host && a.ips.join() === b.ips.join();

/**
 * Ask every address of `prefix` (e.g. "192.168.0."). `onFound` gets each robot as it answers,
 * `onProgress` the number of addresses done; stops early when `signal` aborts.
 */
export async function scanNetwork(
  prefix: string,
  { onFound, onProgress, signal, parallel = 48, timeoutMs = 1500, port = ROBOT_PORT }: {
    onFound(robot: FoundRobot): void;
    onProgress?(done: number, total: number): void;
    signal?: AbortSignal;
    parallel?: number;
    timeoutMs?: number;
    port?: number;
  },
): Promise<FoundRobot[]> {
  const found: FoundRobot[] = [];
  const total = 254;
  let next = 1;
  let done = 0;
  const worker = async () => {
    while (next <= total && !signal?.aborted) {
      const n = next++;
      const robot = await probeRobot(`${prefix}${n}`, timeoutMs, port);
      done += 1;
      if (signal?.aborted) return;
      if (robot && !found.some((f) => sameRobot(f, robot))) {
        found.push(robot);
        onFound(robot);
      }
      onProgress?.(done, total);
    }
  };
  await Promise.all(Array.from({ length: parallel }, worker));
  return found.sort((a, b) => Number(a.robotId) - Number(b.robotId));
}

/**
 * The networks of this PC, when the page is served by the desktop simulator (desktop-go/main.go
 * answers with its own IPv4 prefixes, e.g. ["192.168.0."]); [] anywhere else.
 */
export async function pcNetworks(): Promise<string[]> {
  try {
    const r = await fetch('/__physical-ai-simulator/lan', { cache: 'no-store', signal: AbortSignal.timeout(2000) });
    if (!r.ok) return [];
    const j = (await r.json()) as { prefixes?: unknown };
    return Array.isArray(j.prefixes) ? j.prefixes.map((p) => (typeof p === 'string' ? networkPrefix(p) : null)).filter((p): p is string => !!p) : [];
  } catch {
    return [];
  }
}

/** "이 로봇 맞나요?": that robot moves a little (arm: base 5° and back) so the student sees which one it is. */
export async function identifyRobot(address: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const r = await fetchLocal(address.split(':')[0], `http://${address}/api/identify`, {
      method: 'POST',
      mode: 'cors',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
      signal: AbortSignal.timeout(4000),
    });
    return (await r.json()) as { ok: boolean; error?: string };
  } catch {
    return { ok: false, error: '그 로봇이 대답하지 않아요.' };
  }
}
