/**
 * 새 로봇 설치: the desktop simulator (desktop-go/setup.go) installs a robot that was never set up, over
 * one LAN cable — the robot's factory address 192.168.127.10 and account sunrise/sunrise (Elephant
 * Robotics' RDK X5 manual). It copies the robot kit it carries, starts the kit's install.py with the
 * Wi-Fi the teacher wrote, and follows its log. Here: the requests and what the screen says per stage.
 * Only the desktop program answers these (on this PC only), like the USB maker (usbKit.ts).
 */

import type { WifiForm } from './usbKit';

const API = '/__physical-ai-simulator/setup';
const HEAD = { 'X-Physical-AI': '1' };

export type SetupStage = 'find' | 'lan' | 'login' | 'upload' | 'install' | 'done' | 'moved' | 'error';

export interface SetupJob {
  state: SetupStage;
  host?: string;
  user?: string;
  board?: string;
  done: number;
  total: number;
  /** install.py's last lines on the robot. */
  log: string[];
  /** The robot's result file (result-<robot>.txt), when it wrote one. */
  result?: string;
  error?: string;
  /** The Wi-Fi the robot was told to join. */
  ssid: string;
}

export interface SetupState {
  /** The kit this program carries; null: built without one. */
  kit: { version: string; size: number } | null;
  /** The Wi-Fi this PC is on (to fill the form). */
  pcSsid: string;
  job: SetupJob | null;
}

/** Typed only when the factory account was changed (else the program tries the factory ones). */
export interface SetupLogin {
  host: string;
  user: string;
  password: string;
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(API + path, { cache: 'no-store', ...init, headers: { ...HEAD, ...(init?.body ? { 'Content-Type': 'application/json' } : {}) } });
  const j = (await r.json().catch(() => ({}))) as T & { error?: string };
  if (!r.ok) throw new Error(j.error ?? `프로그램이 대답하지 않아요 (${r.status}).`);
  return j;
}

/** A job as the screen reads it: the log always a list. */
const tidy = (j: SetupJob | null): SetupJob | null => (j ? { ...j, log: Array.isArray(j.log) ? j.log : [] } : null);

export const setupState = () => call<SetupState>('').then((s) => ({ ...s, job: tidy(s.job) }));
export const startSetup = (wifi: WifiForm, login?: Partial<SetupLogin>) =>
  call<{ job: SetupJob }>('/start', { method: 'POST', body: JSON.stringify({ wifi, host: login?.host ?? '', user: login?.user ?? '', password: login?.password ?? '' }) }).then((r) => ({ job: tidy(r.job) as SetupJob }));

/** Still going (the screen asks again). */
export const setupRunning = (j: SetupJob | null | undefined) => !!j && !['done', 'moved', 'error'].includes(j.state);

/** The stages as the screen lists them, and which one the job is at (-1: not started). */
export const SETUP_STEPS = ['로봇 찾기', '로그인', '키트 보내기', '설치 · Wi-Fi'] as const;
export function setupStep(j: SetupJob | null | undefined): number {
  if (!j) return -1;
  switch (j.state) {
    case 'find':
    case 'lan':
      return 0;
    case 'login':
      return 1;
    case 'upload':
      return 2;
    case 'install':
      return 3;
    case 'done':
    case 'moved':
      return SETUP_STEPS.length;
    default:
      return -1;
  }
}

/** One line for the stage now. */
export function setupLine(j: SetupJob): string {
  switch (j.state) {
    case 'find':
      return '랜선으로 이은 로봇을 찾는 중…';
    case 'lan':
      return "PC 랜 포트 주소를 로봇에 맞추는 중… '이 앱이 디바이스를 변경하도록 허용' 창이 뜨면 [예] 를 눌러 주세요.";
    case 'login':
      return `로봇(${j.host})에 로그인하는 중…`;
    case 'upload':
      return `로봇 키트를 보내는 중… ${j.total ? Math.round((j.done / j.total) * 100) : 0}%`;
    case 'install': {
      const step = [...j.log].reverse().find((l) => /^\[\d\/4\]/.test(l.trim()));
      return `로봇에서 설치하는 중… ${step ? step.trim() : ''} (1~3분)`;
    }
    case 'done':
      return '설치를 마쳤어요.';
    case 'moved':
      return `설치를 마치고 로봇이 '${j.ssid}' 로 옮겨 갔어요.`;
    default:
      return j.error ?? '설치하지 못했어요.';
  }
}
