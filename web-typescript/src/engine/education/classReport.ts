/**
 * 반 결과 모으기: what a student did on this computer, as one small file the teacher collects. Progress
 * and lab records live in each browser's localStorage with no name on them, so a teacher cannot see the
 * class; each student exports a StudentReport (`<이름>-로봇시티-결과.json`), the teacher loads every
 * file in the 관제센터's 반 결과 and gets one table (and a CSV for Excel). Files only — no server.
 *
 *  - buildReport(read): collects from the keys the 교육 tab writes (read is localStorage.getItem, or a
 *    fake store in the checks): finished 차시 (learn-done), solved site problems (lab-solved*), the run
 *    log (runLog.ts 'lab-runs'), hints · stars per problem when kept (EFFORT_KEY), the 마무리 평가
 *    sheet (FinalExam's 'final-exam', read only), the course level and the student's name and 번호;
 *  - parseReport(text): a file from a student is untrusted — size and every string capped, every field
 *    checked, unknown or prototype keys refused, and the report rebuilt from the checked values only;
 *  - mergeReports: the same student (이름 + 번호) sent twice → the newest file wins;
 *  - classCsv: one row per student, Korean headers, UTF-8 BOM (Excel reads Korean right), cells quoted
 *    and a leading = + - @ defused (a cell is never read as a formula);
 *  - flagsOf: what a teacher should look at — a problem run many times without a pass, many hints.
 *
 * No React, no DOM: the screens pass localStorage in.
 */

import { TOPICS, TOPIC_BY_ID, type TopicId } from './catalog';
import { FINAL_ITEMS, scoreFinal, type FinalRecord } from './lab/final';
import { THEMES, type LabId, type ProblemNo } from './park';
import { RUN_LOG_KEY } from './runLog';
import { subj } from '../robot/selfCollision';

export const REPORT_KIND = 'robot-city-report';
export const REPORT_VERSION = 1;

/** Where the student's name and 번호 are kept (plain text). */
export const STUDENT_NAME_KEY = 'student-name';
export const STUDENT_NO_KEY = 'student-no';
/** Hints and stars per lab problem ({ factory: { 1: { hints, stars } } }), once a lab keeps them. */
export const EFFORT_KEY = 'lab-effort';

/** The keys the 교육 view keeps progress under (ui/education/LearnView.tsx). */
const DONE_KEY = 'learn-done';
const LEVEL_KEY = 'learn-level';
const FINAL_KEY = 'final-exam';
export const SOLVED_KEYS: Readonly<Record<LabId, string>> = {
  factory: 'lab-solved',
  logistics: 'lab-solved-logistics',
  bio: 'lab-solved-bio',
  farm: 'lab-solved-farm',
  cafe: 'lab-solved-cafe',
  ai: 'lab-solved-ai',
  energy: 'lab-solved-energy',
};

/** The seven labs in map order, and their 21 problems. */
export const REPORT_LABS: readonly LabId[] = THEMES.map((s) => s.lab!);
const NOS: readonly ProblemNo[] = [1, 2, 3];
export const THEORY_OF = TOPICS.length;
export const PROBLEMS_OF = REPORT_LABS.length * NOS.length;

/** Caps: a report file's text (characters; a real one is a few thousand), a name, 번호. */
export const MAX_FILE_CHARS = 64 * 1024;
export const MAX_NAME = 30;
export const MAX_NO = 10;
/** No count in a report goes above this (the run log keeps 2000). */
const MAX_COUNT = 100_000;

/** One site problem: solved or not, the runs made on it, and hints · stars when this computer kept them. */
export interface ProblemReport {
  lab: LabId;
  problem: ProblemNo;
  solved: boolean;
  /** Simulator runs (each [실행] = one 다시 가동), and how many of them passed. */
  runs: number;
  passes: number;
  /** Runs on the real robot. */
  robot: number;
  /** null: not kept on this computer. */
  hints: number | null;
  stars: number | null;
}

/** 대단원 마무리 평가: the score out of 100 and its grade, items finished, hints opened. */
export interface FinalReport {
  score: number;
  grade: string;
  done: number;
  of: number;
  hints: number;
}

export interface StudentReport {
  kind: typeof REPORT_KIND;
  version: typeof REPORT_VERSION;
  name: string;
  /** 번호 ('' when not given). */
  no: string;
  /** When it was exported, ms since 1970. */
  exportedAt: number;
  level: 'hs' | 'uni';
  /** The 차시 finished, in course order. */
  theory: TopicId[];
  /** All 21 problems, in map order. */
  problems: ProblemReport[];
  /** null: the 마무리 평가 not started. */
  final: FinalReport | null;
  /** The whole run log in short. */
  runs: { sim: number; robot: number; passes: number };
}

type Read = (key: string) => string | null;

/** A key's text (a store that throws — blocked site data — reads as empty). */
function readText(read: Read, key: string): string {
  try {
    return read(key) ?? '';
  } catch {
    return '';
  }
}
function readJson(read: Read, key: string): unknown {
  try {
    const s = readText(read, key);
    return s ? JSON.parse(s) : null;
  } catch {
    return null;
  }
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const count = (v: unknown, max = MAX_COUNT) => (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= max ? v : null);

/** A name or 번호 as typed: control characters out, spaces squeezed, capped. */
export const cleanText = (s: string, max: number) =>
  s
    .replace(/\s+/g, ' ')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, max);

/** The 마무리 평가's grades (lab/final.ts scoreFinal). */
const GRADES = ['A', 'B', 'C', 'D', 'E'] as const;

/** A FinalRecord as kept, its fields checked (a broken one counts as not started). */
function finalRecord(v: unknown): FinalRecord | null {
  if (!isObj(v)) return null;
  const nums = (a: unknown) => (Array.isArray(a) ? a.filter((x): x is number => typeof x === 'number') : []);
  return {
    picks: nums(v.picks),
    calcChecks: Array.isArray(v.calcChecks) ? v.calcChecks.map((x) => x === true) : [],
    hints: count(v.hints) ?? 0,
    runs: count(v.runs) ?? 0,
    pass: v.pass === true,
    last: '',
    done: v.done === true,
  };
}

/** The report of what this computer holds (`read` is localStorage.getItem, or a fake store). */
export function buildReport(read: Read, now = Date.now()): StudentReport {
  const done = readJson(read, DONE_KEY);
  const theory = TOPICS.map((t) => t.id).filter((id) => isObj(done) && done[id] === true);

  const log = readJson(read, RUN_LOG_KEY);
  const runs = (Array.isArray(log) ? log : []).filter(
    (r): r is { lab: string; problem: number; pass: boolean; source?: string } => isObj(r) && typeof r.lab === 'string' && typeof r.problem === 'number',
  );
  const effort = readJson(read, EFFORT_KEY);
  const problems: ProblemReport[] = REPORT_LABS.flatMap((lab) => {
    const solved = readJson(read, SOLVED_KEYS[lab]);
    const kept = isObj(effort) && isObj(effort[lab]) ? effort[lab] : null;
    return NOS.map((problem): ProblemReport => {
      const mine = runs.filter((r) => r.lab === lab && r.problem === problem);
      const sim = mine.filter((r) => r.source !== 'robot');
      const e = kept && isObj(kept[problem]) ? kept[problem] : null;
      return {
        lab,
        problem,
        solved: isObj(solved) && solved[problem] === true,
        runs: sim.length,
        passes: sim.filter((r) => r.pass === true).length,
        robot: mine.length - sim.length,
        hints: e ? count(e.hints, 3) : null,
        stars: e ? count(e.stars, 3) : null,
      };
    });
  });

  const saved = readJson(read, FINAL_KEY);
  const records: Record<string, FinalRecord> = {};
  if (isObj(saved) && isObj(saved.records))
    for (const it of FINAL_ITEMS) {
      const r = finalRecord(saved.records[it.id]);
      if (r) records[it.id] = r;
    }
  const started = Object.values(records).some((r) => r.done || r.runs > 0 || r.picks.length > 0);
  const total = scoreFinal(records);
  const final: FinalReport | null = started
    ? {
        score: total.score,
        grade: total.grade,
        done: FINAL_ITEMS.filter((it) => records[it.id]?.done).length,
        of: FINAL_ITEMS.length,
        hints: Object.values(records).reduce((s, r) => s + r.hints, 0),
      }
    : null;

  // The name: the one typed for the export, else the one on the 마무리 평가 sheet.
  const typed = cleanText(readText(read, STUDENT_NAME_KEY), MAX_NAME);
  const name = typed || (isObj(saved) && typeof saved.name === 'string' ? cleanText(saved.name, MAX_NAME) : '');
  const level = readJson(read, LEVEL_KEY) === 'uni' ? 'uni' : 'hs';
  return {
    kind: REPORT_KIND,
    version: REPORT_VERSION,
    name,
    no: cleanText(readText(read, STUDENT_NO_KEY), MAX_NO),
    exportedAt: now,
    level,
    theory,
    problems,
    final,
    runs: {
      sim: problems.reduce((s, p) => s + p.runs, 0),
      robot: problems.reduce((s, p) => s + p.robot, 0),
      passes: problems.reduce((s, p) => s + p.passes, 0),
    },
  };
}

/** The file a student hands in: `<이름>-로봇시티-결과.json` (characters a file name cannot hold left out). */
export function reportFileName(r: Pick<StudentReport, 'name'>): string {
  const safe = r.name.replace(/[\\/:*?"<>|.]/g, '').trim() || '이름없음';
  return `${safe}-로봇시티-결과.json`;
}

export const reportText = (r: StudentReport) => JSON.stringify(r, null, 1);

/* --- reading a student's file ------------------------------------------------------------------ */

export type ParseResult = { ok: true; report: StudentReport } | { ok: false; reason: string };

class Bad extends Error {}
function bad(reason: string): never {
  throw new Bad(reason);
}

const FORBIDDEN = new Set(['__proto__', 'constructor', 'prototype']);

/** An object with exactly these keys (some may be left out); anything else is refused. */
function only(v: unknown, keys: readonly string[], what: string): Record<string, unknown> {
  if (!isObj(v)) return bad(`${what}의 모양이 달라요`);
  for (const k of Object.keys(v)) {
    if (FORBIDDEN.has(k)) bad(`허용되지 않는 항목 이름 (${what})`);
    if (!keys.includes(k)) bad(`알 수 없는 항목 '${k.slice(0, 20)}' (${what})`);
  }
  return v;
}
function str(v: unknown, max: number, what: string, empty = true): string {
  if (typeof v !== 'string') return bad(`${subj(what)} 글자가 아니에요`);
  if (v.length > max) bad(`${subj(what)} 너무 길어요`);
  const s = cleanText(v, max);
  if (!s && !empty) bad(`${subj(what)} 비어 있어요`);
  return s;
}
function int(v: unknown, max: number, what: string): number {
  const n = count(v, max);
  return n === null ? bad(`${what} 값이 맞지 않아요`) : n;
}
function intOrNull(v: unknown, max: number, what: string): number | null {
  return v === null ? null : int(v, max, what);
}
function bool(v: unknown, what: string): boolean {
  return typeof v === 'boolean' ? v : bad(`${what} 값이 맞지 않아요`);
}

/** Exported between 2024 and 2200 (a forged far date would sort first forever). */
const T_MIN = Date.UTC(2024, 0, 1);
const T_MAX = Date.UTC(2200, 0, 1);

/**
 * A student's file, checked: never evaluated, only JSON.parse; the text, every string and every count
 * capped; the shape exactly a StudentReport of this version; the report rebuilt from the checked values
 * (nothing of the file's own objects is kept). A reason in Korean for the teacher when it is refused.
 */
export function parseReport(text: string): ParseResult {
  try {
    if (typeof text !== 'string') bad('파일을 읽을 수 없어요');
    if (text.length > MAX_FILE_CHARS) bad('파일이 너무 커요 (결과 파일이 아닌 것 같아요)');
    let raw: unknown;
    try {
      raw = JSON.parse(text.replace(/^﻿/, ''));
    } catch {
      return bad('JSON 파일이 아니에요');
    }
    const top = only(raw, ['kind', 'version', 'name', 'no', 'exportedAt', 'level', 'theory', 'problems', 'final', 'runs'], '파일');
    if (top.kind !== REPORT_KIND) bad('로봇 시티 결과 파일이 아니에요');
    if (top.version !== REPORT_VERSION) bad(`다른 버전의 파일이에요 (${typeof top.version === 'number' ? top.version : '?'})`);
    const name = str(top.name, MAX_NAME, '이름', false);
    const no = str(top.no, MAX_NO, '번호');
    const exportedAt = typeof top.exportedAt === 'number' && Number.isFinite(top.exportedAt) && top.exportedAt >= T_MIN && top.exportedAt <= T_MAX ? Math.round(top.exportedAt) : bad('내보낸 때가 맞지 않아요');
    const level = top.level === 'hs' || top.level === 'uni' ? top.level : bad('과정 값이 맞지 않아요');

    if (!Array.isArray(top.theory) || top.theory.length > THEORY_OF) bad('이론 차시 목록이 맞지 않아요');
    const seen = new Set<string>();
    for (const t of top.theory as unknown[]) {
      if (typeof t !== 'string' || !TOPIC_BY_ID.has(t as TopicId) || seen.has(t)) bad('이론 차시 목록이 맞지 않아요');
      seen.add(t as string);
    }
    const theory = TOPICS.map((t) => t.id).filter((id) => seen.has(id));

    if (!Array.isArray(top.problems) || top.problems.length !== PROBLEMS_OF) bad('현장 문제 목록이 맞지 않아요');
    const got = new Map<string, ProblemReport>();
    for (const v of top.problems as unknown[]) {
      const p = only(v, ['lab', 'problem', 'solved', 'runs', 'passes', 'robot', 'hints', 'stars'], '현장 문제');
      const lab = REPORT_LABS.find((l) => l === p.lab) ?? bad('현장 이름이 맞지 않아요');
      const problem = NOS.find((k) => k === p.problem) ?? bad('문제 번호가 맞지 않아요');
      const runs = int(p.runs, MAX_COUNT, '실행 수');
      const passes = int(p.passes, runs, '성공 수');
      const row: ProblemReport = {
        lab,
        problem,
        solved: bool(p.solved, '해결'),
        runs,
        passes,
        robot: int(p.robot, MAX_COUNT, '로봇 실행 수'),
        hints: intOrNull(p.hints, 3, '힌트'),
        stars: intOrNull(p.stars, 3, '별'),
      };
      const key = `${lab}${problem}`;
      if (got.has(key)) bad('같은 문제가 두 번 있어요');
      got.set(key, row);
    }
    const problems = REPORT_LABS.flatMap((l) => NOS.map((k) => got.get(`${l}${k}`)!));

    let final: FinalReport | null = null;
    if (top.final !== null) {
      const f = only(top.final, ['score', 'grade', 'done', 'of', 'hints'], '마무리 평가');
      const score = int(f.score, 100, '평가 점수');
      const grade = GRADES.find((g) => g === f.grade) ?? bad('평가 등급이 맞지 않아요');
      const of = int(f.of, 20, '평가 문항 수');
      final = { score, grade, done: int(f.done, of, '끝낸 문항 수'), of, hints: int(f.hints, MAX_COUNT, '평가 힌트') };
    }

    const r = only(top.runs, ['sim', 'robot', 'passes'], '실행 기록');
    const runs = { sim: int(r.sim, MAX_COUNT, '실행 수'), robot: int(r.robot, MAX_COUNT, '로봇 실행 수'), passes: int(r.passes, MAX_COUNT, '성공 수') };
    // The totals are the problems' sums (a file edited by hand rarely keeps them so).
    if (runs.sim !== problems.reduce((s, p) => s + p.runs, 0) || runs.robot !== problems.reduce((s, p) => s + p.robot, 0) || runs.passes !== problems.reduce((s, p) => s + p.passes, 0))
      bad('실행 기록 합계가 맞지 않아요');

    return { ok: true, report: { kind: REPORT_KIND, version: REPORT_VERSION, name, no, exportedAt, level, theory, problems, final, runs } };
  } catch (e) {
    if (e instanceof Bad) return { ok: false, reason: e.message };
    return { ok: false, reason: '파일을 읽을 수 없어요' };
  }
}

/* --- the class ------------------------------------------------------------------------------------ */

/** One student: 이름 + 번호 (spaces and case as typed are ignored). */
export const studentKey = (r: Pick<StudentReport, 'name' | 'no'>) => `${r.name.replace(/\s+/g, '').toLowerCase()}\u0000${r.no.replace(/\s+/g, '')}`;

/** The same student sent more than once: the newest file is kept. Ordered by 번호, then 이름. */
export function mergeReports(list: readonly StudentReport[]): StudentReport[] {
  const by = new Map<string, StudentReport>();
  for (const r of list) {
    const k = studentKey(r);
    const had = by.get(k);
    if (!had || r.exportedAt > had.exportedAt) by.set(k, r);
  }
  const noOf = (r: StudentReport) => (/^\d+$/.test(r.no) ? Number(r.no) : Infinity);
  return [...by.values()].sort((a, b) => noOf(a) - noOf(b) || a.no.localeCompare(b.no) || a.name.localeCompare(b.name, 'ko'));
}

/** A problem run this many times in the simulator without one pass is where a student is stuck. */
export const STUCK_RUNS = 6;
/** Hints opened across the site problems before it is worth a look. */
export const MANY_HINTS = 8;

/** One student's numbers for the table and the CSV. */
export interface StudentRow {
  name: string;
  no: string;
  level: string;
  theory: number;
  solved: number;
  /** null: no problem's stars or hints kept. */
  stars: number | null;
  hints: number | null;
  /** 다시 가동: simulator runs. */
  runs: number;
  robot: number;
  finalScore: number | null;
  finalGrade: string;
  exportedAt: number;
  /** What to look at (none: on track). */
  flags: string[];
}

const LAB_SHORT: Readonly<Record<LabId, string>> = Object.fromEntries(THEMES.map((s) => [s.lab!, s.short])) as Record<LabId, string>;

/** What a teacher should look at: problems run many times without a pass, many hints, a low 마무리 평가. */
export function flagsOf(r: StudentReport): string[] {
  const out: string[] = [];
  for (const p of r.problems) if (!p.solved && p.passes === 0 && p.runs >= STUCK_RUNS) out.push(`${LAB_SHORT[p.lab]} ${p.problem}번 ${p.runs}번 실행, 아직 성공 없음`);
  const hints = r.problems.reduce((s, p) => s + (p.hints ?? 0), 0);
  if (hints >= MANY_HINTS) out.push(`힌트 ${hints}번`);
  if (r.final && r.final.done === r.final.of && r.final.score < 60) out.push(`마무리 평가 ${r.final.score}점`);
  return out;
}

export function rowOf(r: StudentReport): StudentRow {
  const kept = r.problems.filter((p) => p.stars !== null || p.hints !== null);
  return {
    name: r.name,
    no: r.no,
    level: r.level === 'uni' ? '대학' : '고등',
    theory: r.theory.length,
    solved: r.problems.filter((p) => p.solved).length,
    stars: kept.length ? kept.reduce((s, p) => s + (p.stars ?? 0), 0) : null,
    hints: kept.length ? kept.reduce((s, p) => s + (p.hints ?? 0), 0) : null,
    runs: r.runs.sim,
    robot: r.runs.robot,
    finalScore: r.final?.score ?? null,
    finalGrade: r.final?.grade ?? '',
    exportedAt: r.exportedAt,
    flags: flagsOf(r),
  };
}

/** "2026-10-11 14:05", local time. */
export function stampOf(t: number): string {
  const d = new Date(t);
  const two = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())} ${two(d.getHours())}:${two(d.getMinutes())}`;
}

/** One CSV cell: a leading = + - @ (or tab, return) gets a ' so Excel shows it as text; quoted when it holds , " or a line break. */
export function csvCell(v: string | number | null): string {
  let s = v === null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const CSV_HEAD = ['이름', '번호', '과정', `이론 차시 (/${THEORY_OF})`, `현장 문제 (/${PROBLEMS_OF})`, '별 합', '힌트 합', '다시 가동 합', '마무리 평가 점수', '마무리 평가 등급', '실물 실행 수', '내보낸 때', '살펴볼 점'];

/** The class as CSV for Excel: UTF-8 BOM, Korean headers, one row per student, CRLF lines. */
export function classCsv(reports: readonly StudentReport[]): string {
  const rows = mergeReports(reports).map(rowOf);
  const lines = [
    CSV_HEAD,
    ...rows.map((r) => [r.name, r.no, r.level, r.theory, r.solved, r.stars, r.hints, r.runs, r.finalScore, r.finalGrade, r.robot, stampOf(r.exportedAt), r.flags.join(' · ')]),
  ];
  return `﻿${lines.map((l) => l.map(csvCell).join(',')).join('\r\n')}\r\n`;
}
