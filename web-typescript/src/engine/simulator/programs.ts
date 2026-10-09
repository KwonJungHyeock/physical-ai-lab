/**
 * The student's programs, kept in this browser so a reload, a closed window or another practice
 * loses nothing: one program per robot model, level, environment and practice (an untouched starter
 * is not kept), and the practice each level was left on.
 *
 * Connecting to a robot opens the console from the robot (another address, so another browser
 * store): the open program goes along in the address (`#carry=`) and is put back on arrival.
 */

import type { Theme } from './board';
import type { Level, PracticeId } from './practices';

const KEY = 'robot-console-programs';
const LAST_KEY = 'robot-console-last-practice';
/** Programs kept at most (the oldest go first); a program is a few kB at most. */
const MAX = 120;

interface Kept {
  code: string;
  /** Saved at (ms), to drop the oldest first. */
  at: number;
}

const slot = (arm: string, level: Level, theme: Theme, id: PracticeId) => `${arm}|${level}|${theme}|${id}`;

function readAll(): Record<string, Kept> {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '{}') as unknown;
    if (!v || typeof v !== 'object') return {};
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>).filter(
        (e): e is [string, Kept] => !!e[1] && typeof (e[1] as Kept).code === 'string' && typeof (e[1] as Kept).at === 'number',
      ),
    );
  } catch {
    return {};
  }
}

/** The kept program of this practice, or null (never saved, or put back to its starter). */
export function loadProgram(arm: string, level: Level, theme: Theme, id: PracticeId): string | null {
  return readAll()[slot(arm, level, theme, id)]?.code ?? null;
}

/** Keep a program; `null` (an untouched starter) forgets it. */
export function saveProgram(arm: string, level: Level, theme: Theme, id: PracticeId, code: string | null): void {
  const all = readAll();
  const k = slot(arm, level, theme, id);
  if (code === null) {
    if (!(k in all)) return;
    delete all[k];
  } else {
    if (all[k]?.code === code) return;
    all[k] = { code, at: Date.now() };
  }
  const list = Object.entries(all).sort((a, b) => b[1].at - a[1].at).slice(0, MAX);
  try {
    localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(list)));
  } catch {
    /* storage full or blocked: this session only */
  }
}

/** The practice each level was left on. */
export function loadLastPractice(level: Level): PracticeId | null {
  try {
    const v = JSON.parse(localStorage.getItem(LAST_KEY) ?? '{}') as Partial<Record<Level, PracticeId>>;
    return typeof v?.[level] === 'string' ? v[level]! : null;
  } catch {
    return null;
  }
}

export function saveLastPractice(level: Level, id: PracticeId): void {
  try {
    const v = JSON.parse(localStorage.getItem(LAST_KEY) ?? '{}') as Partial<Record<Level, PracticeId>>;
    if (v[level] === id) return;
    localStorage.setItem(LAST_KEY, JSON.stringify({ ...v, [level]: id }));
  } catch {
    /* this session only */
  }
}

/** The open program, carried to the robot's console in the address. */
export interface Carried {
  level: Level;
  theme: Theme;
  id: PracticeId;
  code: string;
}

const CARRY = 'carry=';

export function carryHash(c: Carried): string {
  const bytes = new TextEncoder().encode(JSON.stringify(c));
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return `#${CARRY}${encodeURIComponent(btoa(bin))}`;
}

/** The program carried in this address (`#carry=`), or null. */
export function readCarried(hash: string): Carried | null {
  const i = hash.indexOf(CARRY);
  if (i < 0) return null;
  try {
    const bin = atob(decodeURIComponent(hash.slice(i + CARRY.length)));
    const v = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (ch) => ch.charCodeAt(0)))) as Partial<Carried>;
    const levelOk = v.level === 'basic' || v.level === 'python' || v.level === 'ros';
    const themeOk = v.theme === 'arm' || v.theme === 'kit';
    if (!levelOk || !themeOk || typeof v.id !== 'string' || typeof v.code !== 'string' || v.code.length > 200_000) return null;
    return v as Carried;
  } catch {
    return null;
  }
}
