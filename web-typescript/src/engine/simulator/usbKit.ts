/**
 * 로봇 USB 만들기: the desktop simulator (desktop-go/usbkit.go) writes the robot kit it carries onto a
 * USB stick and fills its wifi.txt; the robots read it (robot-python/server/usb_setup.py) and write
 * eduino/result-<robot>.txt back onto it. Here: the program's requests, the form's check (the same as
 * the program's) and the result files read into what the screen shows.
 * Only the desktop program answers these (on this PC only); anywhere else `usbAvailable()` is false.
 */

const API = '/__physical-ai-simulator/usb';
const HEAD = { 'X-Physical-AI': '1' };

export interface UsbDrive {
  /** "E:" on Windows, a folder elsewhere. */
  id: string;
  name: string;
  fs: string;
  free: number;
  total: number;
  /** A USB stick (false: another data drive of this PC, listed only on request). */
  removable: boolean;
  /** The kit already on it (robot_console VERSION), its wifi.txt and how many robot results. */
  kitVersion?: string;
  wifi?: WifiForm;
  results: number;
  /** Bytes still to free before the kit fits (0: it fits). */
  need: number;
}

export interface WifiForm {
  ssid: string;
  password: string;
  label: string;
  /** More networks (wifi.txt 와이파이2= … 와이파이4=): the robot joins whichever of them is there. */
  more?: WifiNet[];
}

export interface WifiNet {
  ssid: string;
  password: string;
}

/** Networks a wifi.txt can hold, the first one included (desktop-go/usbkit.go, robot-python usb_setup.MORE_WIFI). */
export const MAX_WIFI = 4;

export interface UsbJob {
  drive: string;
  state: 'copying' | 'done' | 'error';
  done: number;
  total: number;
  error?: string;
  /** Earlier results moved into 지난 결과/. */
  moved: number;
}

export interface UsbState {
  /** The kit this program carries; null: built without one. */
  kit: { version: string; size: number } | null;
  drives: UsbDrive[];
  job: UsbJob | null;
}

/** What one robot wrote back. */
export interface RobotResult {
  file: string;
  /** When the robot wrote it ("2026-10-14 09:12"), as written. */
  when: string;
  robot: string;
  user: string;
  /** Wi-Fi: joined, failed, or left as it was (a stick without wifi.txt, or applied before). */
  wifi: 'ok' | 'fail' | 'same';
  message: string;
  version: string;
  update: string;
  robotId: string;
  /** The addresses to connect to, Wi-Fi first (not the fixed one for a LAN cable straight to a PC). */
  ips: string[];
  /** Every address with where it is: 무선 (Wi-Fi), 유선 (LAN port), 직결 (the cable straight to a PC). */
  addrs: { kind: AddrKind; ip: string }[];
  /** The file's time (ms), for the newest first. */
  time: number;
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(API + path, { cache: 'no-store', ...init, headers: { ...HEAD, ...(init?.body ? { 'Content-Type': 'application/json' } : {}) } });
  const j = (await r.json().catch(() => ({}))) as T & { error?: string };
  if (!r.ok) throw new Error(j.error ?? `프로그램이 대답하지 않아요 (${r.status}).`);
  return j;
}

/** Is this the desktop program (the only one that can write a USB stick)? */
export async function usbAvailable(): Promise<boolean> {
  try {
    const r = await fetch(API, { cache: 'no-store', headers: HEAD, signal: AbortSignal.timeout(2500) });
    return r.ok;
  } catch {
    return false;
  }
}

export const usbState = () => call<UsbState>('');
/** The Wi-Fi this PC is on (and its password when Windows gives it). */
export const pcWifi = () => call<WifiForm>('/pcwifi');
export const makeUsb = (drive: string, wifi: WifiForm) => call<{ job: UsbJob }>('/make', { method: 'POST', body: JSON.stringify({ drive, wifi }) });
export const usbJob = () => call<{ job: UsbJob | null }>('/job');
export const ejectUsb = (drive: string) => call<{ ok: boolean }>('/eject', { method: 'POST', body: JSON.stringify({ drive }) });
export async function usbResults(drive: string): Promise<RobotResult[]> {
  const j = await call<{ results: { file: string; text: string; time: number }[] }>(`/results?drive=${encodeURIComponent(drive)}`);
  return j.results.map((r) => parseResult(r.file, r.text, r.time)).sort((a, b) => b.time - a.time);
}

/** wifi.txt's 와이파이= word the robot reads as a choice, not a network name (usb_setup.py). */
export const WIFI_OFF = '끔';
/** No longer a choice: the robot has no hotspot (one that came on held the Wi-Fi chip, wifi.py). */
const HOTSPOT_WORDS = ['핫스팟', 'hotspot'];
/** The robot's fixed address on its LAN port, for a cable straight to a PC (robot-python/server/lan.py). */
export const DIRECT_IP = '169.254.127.10';
export type AddrKind = '무선' | '유선' | '직결' | '';

/** The form's problem in words ("" when fine): the same rules as desktop-go/usbkit.go checkWifi. */
export function checkWifi(w: WifiForm): string {
  const first = checkOne(w);
  if (first) return first;
  const more = w.more ?? [];
  if (more.length > MAX_WIFI - 1) return `Wi-Fi 는 ${MAX_WIFI}개까지 적을 수 있어요.`;
  for (let i = 0; i < more.length; i++) {
    const m = more[i];
    if (!m.ssid && !m.password) continue;
    if (m.ssid === WIFI_OFF) return `${i + 2}번째 Wi-Fi: 끔 은 첫 번째 칸에만 적어요.`;
    const msg = checkOne({ ssid: m.ssid, password: m.password, label: '' });
    if (msg) return `${i + 2}번째 Wi-Fi: ${msg}`;
  }
  return '';
}

function checkOne(w: WifiForm): string {
  const ssid = w.ssid.trim();
  if (!ssid) return 'Wi-Fi 이름을 적어 주세요.';
  if (HOTSPOT_WORDS.includes(ssid.toLowerCase())) return "로봇 핫스팟은 이제 쓰지 않아요. 교실 Wi-Fi 이름을 적거나, 랜선만 쓰면 '끔' 을 골라 주세요.";
  if (ssid === WIFI_OFF) return [...w.label.trim()].length > 24 ? '사용자 이름은 24자까지예요.' : '';
  if (new TextEncoder().encode(ssid).length > 32) return 'Wi-Fi 이름이 너무 길어요 (32바이트까지).';
  if (ssid !== w.ssid) return 'Wi-Fi 이름 앞뒤에 빈칸이 있어요. 빈칸을 지워 주세요.';
  if (ssid.startsWith('#')) return 'Wi-Fi 이름이 # 로 시작하면 로봇이 읽지 못해요.';
  const p = w.password;
  if (p) {
    if (p !== p.trim()) return '비밀번호 앞뒤에 빈칸이 있어요. 빈칸을 지워 주세요.';
    const n = [...p].length;
    if ((n < 8 || n > 63) && !(p.length === 64 && /^[0-9a-f]+$/i.test(p))) return 'Wi-Fi 비밀번호는 8~63자예요. 비밀번호가 없는 Wi-Fi 면 비워 두세요.';
  }
  if ([...w.label.trim()].length > 24) return '사용자 이름은 24자까지예요.';
   
  if ([w.ssid, w.password, w.label].some((s) => /[\u0000-\u001f\u007f]/.test(s))) return '줄바꿈 같은 보이지 않는 글자는 넣을 수 없어요.';
  return '';
}

/**
 * One result-<robot>.txt (usb_setup.apply writes it):
 *   2026-10-14 09:12
 *   로봇: ubuntu-3a7f   사용자: 3조 김민수
 *   결과: 성공 — 'EDUINO-LAB' 에 연결했어요.
 *   버전: 20261002-… → 20261014-…
 *   업데이트: 성공
 *   로봇 ID: 107   주소: 무선 192.168.0.107 · 직결 169.254.127.10
 * (an older robot writes the addresses alone, with commas: 주소: 192.168.0.107, 10.0.0.5)
 */
export function parseResult(file: string, text: string, time = 0): RobotResult {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).map((l) => l.trim());
  const field = (key: string) => {
    const l = lines.find((x) => x.startsWith(`${key}:`));
    return l ? l.slice(key.length + 1).trim() : '';
  };
  const robotLine = field('로봇');
  const [robot, user = ''] = robotLine.split(/\s{2,}사용자:\s*/);
  const result = field('결과');
  const [word, ...rest] = result.split(/\s+—\s+/);
  const idLine = field('로봇 ID');
  const id = /^(\S+)/.exec(idLine)?.[1] ?? '';
  const addr = /주소:\s*(.+)$/.exec(idLine)?.[1] ?? '';
  const addrs = (addr && addr !== '-' ? addr.split(/\s*[·,]\s*/).filter(Boolean) : []).map((t) => {
    const m = /^(무선|유선|직결)\s+(\S+)$/.exec(t);
    return m ? { kind: m[1] as AddrKind, ip: m[2] } : { kind: '' as AddrKind, ip: t };
  });
  return {
    file,
    when: /^\d{4}-\d\d-\d\d \d\d:\d\d$/.test(lines[0] ?? '') ? lines[0] : '',
    robot: robot.trim() || file.replace(/^result-|\.txt$/g, ''),
    user: user.trim(),
    wifi: word === '성공' ? 'ok' : word === '실패' ? 'fail' : 'same',
    message: rest.join(' — ').trim(),
    version: field('버전'),
    update: field('업데이트'),
    robotId: id === '-' ? '' : id,
    ips: addrs.filter((a) => a.kind !== '직결').map((a) => a.ip),
    addrs,
    time,
  };
}

export function formatBytes(n: number): string {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)} GB`;
  if (n >= 1024 ** 2) return `${Math.round(n / 1024 ** 2)} MB`;
  return `${Math.max(1, Math.round(n / 1024))} KB`;
}

/** The kit's version stamp (20261014-051829-c782f72) as a date for people: 2026.10.14. */
export function kitDate(version: string | undefined): string {
  const m = /^(\d{4})(\d\d)(\d\d)/.exec(version ?? '');
  return m ? `${m[1]}.${m[2]}.${m[3]}` : '';
}

/** On the robot, first time only: the line that finds the stick's install.py and runs it. */
export const INSTALL_LINE = `sudo python3 "$(find /media /mnt -maxdepth 6 -path '*eduino/install.py' 2>/dev/null | head -1)"`;
