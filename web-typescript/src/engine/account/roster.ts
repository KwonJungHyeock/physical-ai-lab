/**
 * The teacher's 번호 ↔ 이름 list. It stays on the teacher's computer only — in that browser's storage
 * (or a file the teacher keeps) — and is never sent to the class server or the cloud: the server knows
 * students by class code + 번호 alone, and the dashboard puts names back on screen from this list.
 *
 * Also: the login cards to print when students are issued (학급 코드 · 번호 · PIN, the name only if the
 * teacher has the list here), and the list as CSV.
 * No React, no DOM: the store is passed in (localStorage on the teacher's PC).
 */

import type { KVStore } from './queue';
import type { IssuedStudent } from './types';

export type Roster = Record<number, string>;

export const MAX_ROSTER_NAME = 30;

export function rosterKey(classId: string): string {
  return `class-roster:${classId}`;
}

function cleanName(s: string): string {
  return s.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_ROSTER_NAME);
}

/**
 * The list pasted or loaded by the teacher: one student per line, "번호,이름", "번호<tab>이름" or
 * "번호 이름" (Excel copy works). A header line and blank lines are skipped; bad lines are reported.
 */
export function parseRosterText(text: string): { roster: Roster; errors: string[] } {
  const roster: Roster = {};
  const errors: string[] = [];
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    const m = /^"?(\d{1,2})"?\s*[,\t; ]\s*"?(.*?)"?\s*$/.exec(line);
    if (!m) {
      if (i > 0 || /\d/.test(line)) errors.push(`${i + 1}번째 줄: "${line.slice(0, 20)}"`);
      return;
    }
    const no = Number(m[1]);
    const name = cleanName(m[2]);
    if (no < 1 || no > 99 || !name) {
      errors.push(`${i + 1}번째 줄: 번호 1~99 와 이름이 필요해요`);
      return;
    }
    if (roster[no]) errors.push(`${no}번이 두 번 있어요 (뒤의 것을 씁니다)`);
    roster[no] = name;
  });
  return { roster, errors };
}

export function loadRoster(store: KVStore | null, classId: string): Roster {
  if (!store) return {};
  try {
    const v = JSON.parse(store.getItem(rosterKey(classId)) ?? '{}') as unknown;
    if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
    const out: Roster = {};
    for (const [k, name] of Object.entries(v as Record<string, unknown>)) {
      const no = Number(k);
      if (Number.isInteger(no) && no >= 1 && no <= 99 && typeof name === 'string' && cleanName(name)) out[no] = cleanName(name);
    }
    return out;
  } catch {
    return {};
  }
}

export function saveRoster(store: KVStore | null, classId: string, roster: Roster): void {
  store?.setItem(rosterKey(classId), JSON.stringify(roster));
}

/** Year-end: forget the names with the class. */
export function clearRoster(store: KVStore | null, classId: string): void {
  store?.removeItem?.(rosterKey(classId));
}

/** Rows with the teacher's names put back (null where the list has no name). */
export function withNames<T extends { no: number }>(rows: readonly T[], roster: Roster): (T & { name: string | null })[] {
  return rows.map((r) => ({ ...r, name: roster[r.no] ?? null }));
}

const defuse = (c: string) => (/^[=+\-@\t\r]/.test(c) ? `'${c}` : c);
const quote = (c: string) => `"${defuse(c).replace(/"/g, '""')}"`;

/** The list as CSV for Excel (UTF-8 BOM, formula-looking names defused). */
export function rosterCsv(roster: Roster): string {
  const nos = Object.keys(roster)
    .map(Number)
    .sort((a, b) => a - b);
  return '\uFEFF' + ['"번호","이름"', ...nos.map((no) => `${no},${quote(roster[no])}`)].join('\r\n') + '\r\n';
}

export interface LoginCard {
  classCode: string;
  className: string;
  no: number;
  pin: string;
  /** From the teacher's list on this PC, when there is one. */
  name: string | null;
  /** The join address (for a QR code), when given. */
  link: string | null;
}

/** Cards to print right after issuing (the PINs are not shown again; a lost one is reset, not looked up). */
export function loginCards(cls: { code: string; name: string }, issued: readonly IssuedStudent[], roster: Roster = {}, link: string | null = null): LoginCard[] {
  return [...issued]
    .sort((a, b) => a.no - b.no)
    .map((s) => ({ classCode: cls.code, className: cls.name, no: s.no, pin: s.pin, name: roster[s.no] ?? null, link }));
}
