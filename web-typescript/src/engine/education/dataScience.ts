/**
 * 디지털 트윈 관제센터: data science over the students' lab runs (runLog.ts). Everything the screen
 * (ui/education/data/DataCenter.tsx) shows is computed here, from a plain list of RunRecord:
 *
 *  - per lab and problem: runs, pass rate, mean · median · standard deviation of the job time, how many
 *    tries it took to the first pass, the latest run (summarize, labOverview);
 *  - the numeric columns a lab problem's runs have — the values the students set and the numbers in the
 *    checks' values ("최대 4.2 mm" → 4.2 mm, "3 / 4" → 3) — for a scatter of any X against any Y with its
 *    least-squares line and Pearson r, read out in plain Korean (columnsOf, scatter, regression, describeR);
 *  - a histogram of the job times (histogram), the 병목 (the lab whose job takes longest, the one that
 *    fails most: bottleneck);
 *  - the twin: a run on the real robot paired with the simulator run of the same lab, problem and values,
 *    and how far apart they came out (pairTwin, twinSummary);
 *  - three guided questions answered from the data shown (quizzes), CSV for a spreadsheet (toCsv);
 *  - demoRuns(seed): a made-up class (25 students) for a teacher to show the screen before there is any
 *    real data. Its records carry `who` ('예시 01' …); the screen keeps them apart from the real log.
 *
 * No React, no DOM: tests/education/data-check.mts runs these headless.
 */

import { SITES } from './park';
import type { RunLab, RunRecord } from './runLog';

/** A run record, with the student it belongs to when known (the example class; the real log is one browser). */
export type DataRecord = RunRecord & { who?: string };

/* --- labs ---------------------------------------------------------------------------------- */

/** Every lab that logs, in the park's route order (에너지·자원순환 last). */
export const RUN_LABS: readonly RunLab[] = ['factory', 'logistics', 'bio', 'farm', 'cafe', 'ai', 'energy'];

export interface LabInfo {
  lab: string;
  name: string;
  color: string;
  /** The three problems' titles. */
  problems: readonly string[];
}

/** A lab's name, colour and problem titles (park.ts; a lab not there yet gets a plain label). */
export function labInfo(lab: string): LabInfo {
  const s = SITES.find((x) => (x.lab as string | undefined) === lab);
  if (s)
    return {
      lab,
      name: s.name,
      color: s.color,
      problems: s.problems.map((p) => p.title),
    };
  if (lab === 'energy')
    return {
      lab,
      name: '에너지·자원순환',
      color: '#c48a00',
      problems: ['문제 ①', '문제 ②', '문제 ③'],
    };
  return {
    lab,
    name: lab,
    color: '#7c8db0',
    problems: ['문제 ①', '문제 ②', '문제 ③'],
  };
}

export const problemTitle = (lab: string, p: number) => labInfo(lab).problems[p - 1] ?? `문제 ${p}`;

/** The labs to show: RUN_LABS, then any other lab the records name. */
export function labsIn(rs: readonly DataRecord[]): string[] {
  const out: string[] = [...RUN_LABS];
  for (const r of rs) if (!out.includes(r.lab)) out.push(r.lab);
  return out;
}

export const ofProblem = (rs: readonly DataRecord[], lab: string, problem?: number) =>
  rs.filter((r) => r.lab === lab && (problem === undefined || r.problem === problem));
export const simOnly = (rs: readonly DataRecord[]) => rs.filter((r) => r.source !== 'robot');

/* --- statistics ------------------------------------------------------------------------------ */

const finite = (xs: readonly number[]) => xs.filter((x) => Number.isFinite(x));

export function mean(xs: readonly number[]): number {
  const v = finite(xs);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN;
}

export function median(xs: readonly number[]): number {
  const v = finite(xs).sort((a, b) => a - b);
  if (!v.length) return NaN;
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

/** The sample standard deviation (n − 1); 0 for one value, NaN for none. */
export function std(xs: readonly number[]): number {
  const v = finite(xs);
  if (!v.length) return NaN;
  if (v.length === 1) return 0;
  const m = mean(v);
  return Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1));
}

export interface Spread {
  n: number;
  mean: number;
  median: number;
  std: number;
  min: number;
  max: number;
}

export function spread(xs: readonly number[]): Spread {
  const v = finite(xs);
  return { n: v.length, mean: mean(v), median: median(v), std: std(v), min: v.length ? Math.min(...v) : NaN, max: v.length ? Math.max(...v) : NaN };
}

/* --- summaries ------------------------------------------------------------------------------- */

export interface RunSummary {
  runs: number;
  passes: number;
  /** passes ÷ runs (NaN with no runs). */
  passRate: number;
  sim: number;
  robot: number;
  /** The job time, s (the runs that have one). */
  duration: Spread;
  /**
   * Tries to the first pass: per student (`who`; the real log is one group), the number of the run that
   * first passed, averaged over the students that passed (null: none did).
   */
  triesToPass: number | null;
  /** Students (groups) that ran it and have not passed yet. */
  notYet: number;
  groups: number;
  latest: DataRecord | null;
}

export function summarize(rs: readonly DataRecord[]): RunSummary {
  const passes = rs.filter((r) => r.pass).length;
  const byWho = new Map<string, DataRecord[]>();
  for (const r of [...rs].sort((a, b) => a.t - b.t)) {
    const k = `${r.who ?? ''}|${r.lab}|${r.problem}`;
    byWho.set(k, [...(byWho.get(k) ?? []), r]);
  }
  const tries: number[] = [];
  let notYet = 0;
  for (const g of byWho.values()) {
    const i = g.findIndex((r) => r.pass);
    if (i < 0) notYet++;
    else tries.push(i + 1);
  }
  let latest: DataRecord | null = null;
  for (const r of rs) if (!latest || r.t >= latest.t) latest = r;
  return {
    runs: rs.length,
    passes,
    passRate: rs.length ? passes / rs.length : NaN,
    sim: rs.filter((r) => r.source !== 'robot').length,
    robot: rs.filter((r) => r.source === 'robot').length,
    duration: spread(rs.map((r) => r.durationS)),
    triesToPass: tries.length ? mean(tries) : null,
    notYet,
    groups: byWho.size,
    latest,
  };
}

/** How many runs fall in each of `n` equal stretches of time from t0 to t1 (a sparkline of attempts). */
export function activity(rs: readonly DataRecord[], t0: number, t1: number, n = 12): number[] {
  const out = new Array<number>(n).fill(0);
  const span = Math.max(1, t1 - t0);
  for (const r of rs) out[Math.min(n - 1, Math.max(0, Math.floor(((r.t - t0) / span) * n)))]++;
  return out;
}

export interface LabOverview {
  lab: string;
  info: LabInfo;
  /** The simulator runs (what the students tried). */
  all: RunSummary;
  problems: { problem: 1 | 2 | 3; title: string; summary: RunSummary }[];
  robot: number;
  /** Simulator runs in 12 equal stretches of the lab's own time span (empty: none). */
  spark: number[];
}

/** One tile per lab: the simulator runs' summary, per problem too, and the attempts over time. */
export function labOverview(rs: readonly DataRecord[]): LabOverview[] {
  const sim = simOnly(rs);
  return labsIn(rs).map((lab) => {
    const mine = ofProblem(sim, lab);
    const ts = mine.map((r) => r.t);
    return {
      lab,
      info: labInfo(lab),
      all: summarize(mine),
      problems: ([1, 2, 3] as const).map((p) => ({ problem: p, title: problemTitle(lab, p), summary: summarize(ofProblem(mine, lab, p)) })),
      robot: rs.filter((r) => r.lab === lab && r.source === 'robot').length,
      spark: ts.length ? activity(mine, Math.min(...ts), Math.max(...ts)) : [],
    };
  });
}

/* --- columns -------------------------------------------------------------------------------- */

export interface Column {
  /** 'durationS', 'pass', 'v:<value key>' or 'c:<check label>'. */
  key: string;
  name: string;
  unit: string;
  kind: 'run' | 'value' | 'check';
  /** Only 0 and 1 (pass, a yes/no value). */
  binary?: boolean;
  /** A check column's full label (its name is what it measures). */
  label?: string;
}

/** The value names the labs use (a lab's own name first), with units. */
const VALUE_NAMES: Record<string, [string, string]> = {
  speed: ['속도', '%'],
  acc: ['가속도', 'm/s²'],
  zoneSpeed: ['손 앞 속도', 'mm/s'],
  detect: ['감지 거리', 'mm'],
  radius: ['회전 반경', 'mm'],
  time: ['회전 시간', 's'],
  j1: ['J1 각도', '°'],
  j2: ['J2 각도', '°'],
  j3: ['J3 각도', '°'],
  belt: ['벨트 속도', 'mm/s'],
  waitY: ['기다리는 자리 y', 'mm'],
  delayMs: ['출발 지연', 'ms'],
  approach: ['접근 높이', 'mm'],
  s3: ['센서 3 위치', 'mm'],
  pitch: ['층 간격', 'mm'],
  gap: ['놓는 여유', 'mm'],
  carry: ['운반 속도', '%'],
  empty: ['빈손 속도', '%'],
  vert: ['오르내림 속도', '%'],
  x: ['기준점 x', 'mm'],
  y: ['기준점 y', 'mm'],
  tilt: ['기울기', '°'],
  yaw: ['돌림', '°'],
  zero: ['J1 영점 보정', '°'],
  lift: ['나르는 높이', 'mm'],
  via: ['경유점', ''],
  vx: ['경유점 x', 'mm'],
  vy: ['경유점 y', 'mm'],
  vz: ['경유점 z', 'mm'],
  lo: ['색 범위 아래', '°'],
  hi: ['색 범위 위', '°'],
  ratio: ['mm/픽셀 비율', ''],
  squeeze: ['조이는 양', 'mm'],
  yellowHi: ['노랑 범위 위', 'H'],
  greenLo: ['초록 범위 아래', 'H'],
  power: ['거리 거듭제곱 p', ''],
  height: ['물체 높이', 'mm'],
  parallax: ['시차 보정', ''],
};
const LAB_VALUE_NAMES: Record<string, Record<string, [string, string]>> = {
  cafe: { speed: ['최고 속도', 'mm/s'] },
  farm: { speed: ['그리퍼 속도', '%'] },
  factory: { speed: ['팔 속도', '%'] },
};

export function valueName(lab: string, key: string): [string, string] {
  const last = key.split('.').pop()!;
  return LAB_VALUE_NAMES[lab]?.[key] ?? VALUE_NAMES[key] ?? (key.includes('.') ? [key, ''] : (LAB_VALUE_NAMES[lab]?.[last] ?? VALUE_NAMES[last] ?? [key, '']));
}

/** What a check's number measures, from its label (the label itself when none fits). */
const CHECK_NAMES: readonly [RegExp, string][] = [
  [/수면 기울기/, '수면 기울기'],
  [/기울기/, '최대 기울기'],
  [/가운데에서 .*mm 안/, '가운데에서 어긋난 거리'],
  [/자리가 .*mm 안/, '놓인 자리 오차'],
  [/높이가 .*mm 안/, '놓는 높이 오차'],
  [/시간/, '걸린 시간'],
  [/미끄러지지/, '미끄러진 상자'],
  [/부딪히지 않음/, '가장 가까운 거리'],
  [/남기고 멈춤/, '손과 남은 거리'],
  [/닿지 않는 자리/, '닿지 않는 자리'],
  [/손에 닿지 않음/, '닿은 속도'],
  [/토크/, 'J1 토크'],
  [/잡는 힘/, '최대 잡는 힘'],
  [/담지 않음/, '잘못 담은 개수'],
  [/들어간 블록 없음/, '잘못 넣은 개수'],
  [/모두|연달아|놓음|넣음|꽂음|쌓음|담음/, '해낸 개수'],
];
export const checkName = (label: string) => CHECK_NAMES.find(([re]) => re.test(label))?.[1] ?? label;

const UNITS = ['mm/s', 'm/s²', 'N·m', 'mm', 'ms', 'px', '°', '%', 's', 'N', 'g', '개', '곳', '번'];

/** The number in a check's value as shown ("최대 4.2 mm" → 4.2 mm, "3 / 4개" → 3 개, "없음" → null). */
export function parseCheckNumber(value: string): { n: number; unit: string } | null {
  const m = /(-?\d+(?:\.\d+)?)(?:\s*\/\s*\d+(?:\.\d+)?)?\s*(\S*)/.exec(value);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return null;
  const unit = UNITS.find((u) => m[2].startsWith(u)) ?? '';
  return { n, unit };
}

/** A record's number in a column (null: none — a check without a number, a value not set, a string). */
export function columnValue(r: DataRecord, key: string): number | null {
  if (key === 'durationS') return Number.isFinite(r.durationS) ? r.durationS : null;
  if (key === 'pass') return r.pass ? 1 : 0;
  if (key.startsWith('v:')) {
    const v = r.values[key.slice(2)];
    return typeof v === 'number' ? (Number.isFinite(v) ? v : null) : typeof v === 'boolean' ? (v ? 1 : 0) : null;
  }
  if (key.startsWith('c:')) {
    const c = r.checks.find((x) => x.label === key.slice(2));
    return c ? (parseCheckNumber(c.value)?.n ?? null) : null;
  }
  return null;
}

/** The numeric columns of a set of runs (best one lab problem): its values, its checks' numbers, then job time and pass. */
export function columnsOf(rs: readonly DataRecord[]): Column[] {
  const values = new Map<string, Column>();
  const checks = new Map<string, Column>();
  for (const r of rs) {
    for (const [k, v] of Object.entries(r.values)) {
      if (values.has(`v:${k}`) || !(typeof v === 'number' || typeof v === 'boolean')) continue;
      const [name, unit] = valueName(r.lab, k);
      values.set(`v:${k}`, { key: `v:${k}`, name, unit: typeof v === 'boolean' ? '' : unit, kind: 'value', binary: typeof v === 'boolean' });
    }
    for (const c of r.checks) {
      if (checks.has(`c:${c.label}`)) continue;
      const p = parseCheckNumber(c.value);
      if (p) checks.set(`c:${c.label}`, { key: `c:${c.label}`, name: checkName(c.label), unit: p.unit, kind: 'check', label: c.label });
    }
  }
  // Two checks that measure the same kind of thing keep their own labels.
  for (const c of checks.values()) if ([...checks.values()].filter((d) => d.name === c.name).length > 1) c.name = c.label!;
  const run: Column[] = rs.length
    ? [
        { key: 'durationS', name: '작업 시간', unit: 's', kind: 'run' },
        { key: 'pass', name: '성공', unit: '', kind: 'run', binary: true },
      ]
    : [];
  return [...values.values(), ...checks.values(), ...run];
}

/* --- scatter, regression ---------------------------------------------------------------------- */

export interface Point {
  x: number;
  y: number;
  pass: boolean;
  source: RunRecord['source'];
  r: DataRecord;
}

/** The runs that have both numbers, as points. */
export function scatter(rs: readonly DataRecord[], xKey: string, yKey: string): Point[] {
  const out: Point[] = [];
  for (const r of rs) {
    const x = columnValue(r, xKey);
    const y = columnValue(r, yKey);
    if (x !== null && y !== null) out.push({ x, y, pass: r.pass, source: r.source, r });
  }
  return out;
}

export interface Fit {
  n: number;
  slope: number;
  intercept: number;
  /** Pearson r (null: one of the two never changes). */
  r: number | null;
}

/** The least-squares line y = slope · x + intercept and Pearson r (null: fewer than two points or x never changes). */
export function regression(pts: readonly { x: number; y: number }[]): Fit | null {
  const n = pts.length;
  if (n < 2) return null;
  const mx = pts.reduce((a, p) => a + p.x, 0) / n;
  const my = pts.reduce((a, p) => a + p.y, 0) / n;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const p of pts) {
    sxx += (p.x - mx) ** 2;
    syy += (p.y - my) ** 2;
    sxy += (p.x - mx) * (p.y - my);
  }
  if (sxx <= 1e-12 * Math.max(1, mx * mx)) return null;
  const slope = sxy / sxx;
  return {
    n,
    slope,
    intercept: my - slope * mx,
    r: syy <= 1e-12 * Math.max(1, my * my) ? null : sxy / Math.sqrt(sxx * syy),
  };
}

/** Does the word end in a final consonant (받침)? Hangul by its code, digits as read (일, 삼, 육, 칠, 팔, 십), l m n r. */
function batchim(word: string): boolean {
  const w = word.replace(/\s*\([^)]*\)\s*$/, '').trim();
  const ch = w[w.length - 1] ?? '';
  const c = ch.charCodeAt(0);
  if (c >= 0xac00 && c <= 0xd7a3) return (c - 0xac00) % 28 !== 0;
  if (/[0-9]/.test(ch)) return '1367890'.includes(ch);
  return /[lmnr]/i.test(ch);
}
/** Korean particle after a word: josa('속도', '이', '가') → '속도가'. */
export const josa = (word: string, withB: string, without: string) => `${word}${batchim(word) ? withB : without}`;

/** A number for the screen: '—' when missing, fewer decimals the bigger it is (1234 · 12.3 · 1.23). */
export function fmtNum(x: number | null | undefined, digits?: number): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return '—';
  const a = Math.abs(x);
  const s = digits === undefined ? String(Number(x.toFixed(a >= 100 ? 0 : a >= 10 ? 1 : 2))) : x.toFixed(digits);
  return s.replace(/^-(?=.*[1-9])/, '−').replace(/^-/, '');
}

/** A number with its unit: "4.2 mm", "31°", "23%" (no space before °, %). */
export const withUnit = (s: string, unit: string) => (!unit ? s : unit === '°' || unit === '%' ? `${s}${unit}` : `${s} ${unit}`);

export const fmtR = (r: number) => (r < 0 ? `−${Math.abs(r).toFixed(2)}` : r.toFixed(2));

/** How strong a correlation is, in a word. */
export const strength = (r: number) =>
  Math.abs(r) >= 0.7 ? '강한 관계' : Math.abs(r) >= 0.4 ? '보통 관계' : Math.abs(r) >= 0.2 ? '약한 관계' : '관계 거의 없음';

/** A scatter's correlation in plain Korean: "운반 속도가 빠를수록 실패가 늘어요 (r = −0.62 · 보통 관계)". */
export function describeR(fit: Fit | null, x: Column, y: Column): string {
  if (!fit || fit.n < 3) return '점이 셋보다 적거나 X가 한 값뿐이라, 관계를 말하기 어려워요.';
  if (fit.r === null) return `${josa(y.name, '은', '는')} 늘 같아요. X에 따라 바뀌지 않아요.`;
  const r = fit.r;
  const tail = ` (r = ${fmtR(r)} · ${strength(r)})`;
  if (Math.abs(r) < 0.2) return `${josa(x.name, '과', '와')} ${josa(y.name, '은', '는')} 거의 관계가 없어요${tail}`;
  const xs = x.binary ? `${x.name}을 켜면` : `${josa(x.name, '이', '가')} ${x.name.includes('속도') ? '빠를수록' : '클수록'}`;
  const up = r > 0;
  const ys =
    y.key === 'pass'
      ? up
        ? '성공이 늘어요'
        : '실패가 늘어요'
      : y.key === 'durationS'
        ? up
          ? '작업 시간이 길어져요'
          : '작업 시간이 짧아져요'
        : up
          ? `${y.name}도 커져요`
          : `${josa(y.name, '은', '는')} 작아져요`;
  return `${xs} ${ys}${tail}`;
}

/* --- axes, histogram ---------------------------------------------------------------------------- */

/** A round step near span ÷ target: 1, 2, 2.5, 5 × 10ᵏ. */
export function niceStep(span: number, target: number): number {
  const raw = Math.abs(span) / Math.max(1, target) || 1;
  const p = 10 ** Math.floor(Math.log10(raw));
  const m = raw / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
}

const tidy = (x: number) => Number(x.toPrecision(12));

/** Round tick values covering lo … hi (about `count` of them), and the range they span. */
export function niceTicks(lo: number, hi: number, count = 5): { ticks: number[]; lo: number; hi: number } {
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return { ticks: [0, 1], lo: 0, hi: 1 };
  if (hi - lo < 1e-9) {
    const pad = Math.abs(lo) > 0 ? Math.abs(lo) * 0.1 : 1;
    lo -= pad;
    hi += pad;
  }
  const step = niceStep(hi - lo, count);
  const a = Math.floor(lo / step + 1e-9) * step;
  const b = Math.ceil(hi / step - 1e-9) * step;
  const ticks: number[] = [];
  for (let v = a; v <= b + step * 1e-6; v += step) ticks.push(tidy(v));
  return { ticks, lo: tidy(a), hi: tidy(b) };
}

export interface Histogram {
  n: number;
  lo: number;
  step: number;
  /** counts[i]: lo + i·step ≤ x < lo + (i + 1)·step (the last bin takes its top edge too). */
  counts: number[];
}

export function histogram(xs: readonly number[], target = 8): Histogram {
  const v = finite(xs);
  if (!v.length) return { n: 0, lo: 0, step: 1, counts: [] };
  const min = Math.min(...v);
  const max = Math.max(...v);
  const step = max > min ? niceStep(max - min, target) : niceStep(Math.abs(min) || 1, 10);
  const lo = tidy(Math.floor(min / step + 1e-9) * step);
  const k = Math.max(1, Math.ceil((max - lo) / step - 1e-9));
  const counts = new Array<number>(k).fill(0);
  for (const x of v) counts[Math.min(k - 1, Math.floor((x - lo) / step + 1e-9))]++;
  return { n: v.length, lo, step, counts };
}

/* --- 병목 -------------------------------------------------------------------------------------- */

export interface LabStat {
  lab: string;
  name: string;
  runs: number;
  passRate: number;
  meanS: number;
}

export interface Bottleneck {
  /** The labs with at least `minRuns` simulator runs. */
  labs: LabStat[];
  /** The lab whose job takes longest on average — the line's 병목. */
  slowest: LabStat | null;
  /** The lab that fails most. */
  weakest: LabStat | null;
  /** The problem that fails most (of those with `minRuns`). */
  hardest: { lab: string; problem: number; title: string; passRate: number; runs: number } | null;
}

export function bottleneck(rs: readonly DataRecord[], minRuns = 3): Bottleneck {
  const sim = simOnly(rs);
  const labs: LabStat[] = [];
  let hardest: Bottleneck['hardest'] = null;
  for (const lab of labsIn(sim)) {
    const mine = ofProblem(sim, lab);
    if (mine.length < minRuns) continue;
    const s = summarize(mine);
    labs.push({
      lab,
      name: labInfo(lab).name,
      runs: s.runs,
      passRate: s.passRate,
      meanS: s.duration.mean,
    });
    for (const p of [1, 2, 3]) {
      const q = summarize(ofProblem(mine, lab, p));
      if (q.runs >= minRuns && (!hardest || q.passRate < hardest.passRate))
        hardest = {
          lab,
          problem: p,
          title: problemTitle(lab, p),
          passRate: q.passRate,
          runs: q.runs,
        };
    }
  }
  const timed = labs.filter((l) => Number.isFinite(l.meanS));
  return {
    labs,
    slowest: timed.length ? timed.reduce((a, b) => (b.meanS > a.meanS ? b : a)) : null,
    weakest: labs.length ? labs.reduce((a, b) => (b.passRate < a.passRate ? b : a)) : null,
    hardest,
  };
}

/* --- 디지털 트윈 -------------------------------------------------------------------------------- */

/** The same values (same keys, equal numbers, strings and flags). */
export function sameValues(a: RunRecord['values'], b: RunRecord['values']): boolean {
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  return ka.every((k) => {
    const x = a[k];
    const y = b[k];
    return typeof x === 'number' && typeof y === 'number' ? Math.abs(x - y) <= 1e-9 * Math.max(1, Math.abs(x)) : x === y;
  });
}

export interface TwinCheck {
  label: string;
  unit: string;
  sim: number;
  robot: number;
  /** robot − sim. */
  diff: number;
}

export interface TwinPair {
  lab: string;
  problem: number;
  sim: DataRecord;
  robot: DataRecord;
  /** Robot job time − simulator job time, s (null: one has none). */
  dDuration: number | null;
  /** The checks with a number in both runs. */
  checks: TwinCheck[];
  samePass: boolean;
}

/**
 * Each robot run with its simulator run: same lab, problem, student and values — the latest one before it
 * (else the first after it). A robot run with no such simulator run is left out.
 */
export function pairTwin(rs: readonly DataRecord[]): TwinPair[] {
  const sims = rs.filter((r) => r.source !== 'robot');
  const out: TwinPair[] = [];
  for (const robot of rs.filter((r) => r.source === 'robot').sort((a, b) => a.t - b.t)) {
    const cand = sims.filter((s) => s.lab === robot.lab && s.problem === robot.problem && s.who === robot.who && sameValues(s.values, robot.values));
    if (!cand.length) continue;
    const before = cand.filter((s) => s.t <= robot.t).sort((a, b) => b.t - a.t)[0];
    const sim = before ?? cand.sort((a, b) => a.t - b.t)[0];
    const checks: TwinCheck[] = [];
    for (const c of robot.checks) {
      const a = sim.checks.find((x) => x.label === c.label);
      const ps = a && parseCheckNumber(a.value);
      const pr = parseCheckNumber(c.value);
      if (ps && pr) checks.push({ label: c.label, unit: pr.unit || ps.unit, sim: ps.n, robot: pr.n, diff: tidy(pr.n - ps.n) });
    }
    out.push({
      lab: robot.lab,
      problem: robot.problem,
      sim,
      robot,
      dDuration: Number.isFinite(robot.durationS) && Number.isFinite(sim.durationS) ? tidy(robot.durationS - sim.durationS) : null,
      checks,
      samePass: sim.pass === robot.pass,
    });
  }
  return out;
}

export interface TwinCheckStat {
  lab: string;
  problem: number;
  label: string;
  unit: string;
  n: number;
  /** Mean absolute error |robot − sim|. */
  mae: number;
  /** Mean signed difference robot − sim (a steady bias shows here). */
  bias: number;
}

export interface TwinSummary {
  pairs: number;
  /** Robot − simulator job time: mean (signed), mean absolute, s. */
  durationBias: number;
  durationMae: number;
  /** Robot job time ÷ simulator job time, mean. */
  durationRatio: number;
  /** Share of pairs where both passed or both failed. */
  passAgree: number;
  /** Mean absolute error over every mm check of every pair (null: no mm check). */
  mmMae: number | null;
  byCheck: TwinCheckStat[];
}

export function twinSummary(pairs: readonly TwinPair[]): TwinSummary {
  const dd = pairs.map((p) => p.dDuration).filter((x): x is number => x !== null);
  const ratio = pairs.filter((p) => p.dDuration !== null && p.sim.durationS > 0).map((p) => p.robot.durationS / p.sim.durationS);
  const groups = new Map<string, TwinCheckStat & { sum: number; sumAbs: number }>();
  const mm: number[] = [];
  for (const p of pairs) {
    for (const c of p.checks) {
      const k = `${p.lab}|${p.problem}|${c.label}`;
      const g = groups.get(k) ?? { lab: p.lab, problem: p.problem, label: c.label, unit: c.unit, n: 0, mae: 0, bias: 0, sum: 0, sumAbs: 0 };
      g.n++;
      g.sum += c.diff;
      g.sumAbs += Math.abs(c.diff);
      groups.set(k, g);
      if (c.unit === 'mm') mm.push(Math.abs(c.diff));
    }
  }
  return {
    pairs: pairs.length,
    durationBias: mean(dd),
    durationMae: mean(dd.map(Math.abs)),
    durationRatio: mean(ratio),
    passAgree: pairs.length ? pairs.filter((p) => p.samePass).length / pairs.length : NaN,
    mmMae: mm.length ? mean(mm) : null,
    byCheck: [...groups.values()].map(({ sum, sumAbs, ...g }) => ({
      ...g,
      mae: sumAbs / g.n,
      bias: sum / g.n,
    })),
  };
}

/* --- guided questions ----------------------------------------------------------------------------- */

/** Where a question's chart is: the overview's 병목 card, a lab problem's scatter (X, Y), the twin tab. */
export type QuizLook = { tab: 'overview' } | { tab: 'lab'; lab: string; problem: 1 | 2 | 3; x: string; y: string } | { tab: 'twin' };

export interface Quiz {
  id: 'bottleneck' | 'speed' | 'twin';
  q: string;
  /** Which chart to look at, in words. */
  look: string;
  view: QuizLook | null;
  choices: string[];
  /** The right choice for the data given (null: not enough data to answer). */
  answer: number | null;
  /** Why, from the data (or what is missing). */
  why: string;
}

/** Speed values the speed question can use, best first: [lab, problem, value key]. */
const SPEED_COLUMNS: readonly [string, 1 | 2 | 3, string][] = [
  ['logistics', 2, 'carry'],
  ['farm', 3, 'speed'],
  ['cafe', 1, 'speed'],
  ['factory', 3, 'speed'],
];

export const MM_BANDS = ['1 mm 아래', '1 ~ 3 mm', '3 ~ 10 mm', '10 mm 넘게'] as const;
export const mmBand = (mm: number) => (mm < 1 ? 0 : mm < 3 ? 1 : mm < 10 ? 2 : 3);

/** The three questions, answered from `rs` (the twin one from `twinRs`, the records the twin tab shows). */
export function quizzes(rs: readonly DataRecord[], twinRs: readonly DataRecord[] = rs): Quiz[] {
  const out: Quiz[] = [];

  const b = bottleneck(rs);
  const labs = b.labs.filter((l) => Number.isFinite(l.meanS));
  out.push({
    id: 'bottleneck',
    q: '어느 현장이 병목인가요? (로봇 한 번의 작업이 가장 오래 걸리는 곳)',
    look: '한눈에 보기의 ‘병목 찾기’ 막대 — 현장마다 평균 작업 시간',
    view: { tab: 'overview' },
    choices: labs.map((l) => l.name),
    answer: labs.length >= 2 && b.slowest ? labs.indexOf(b.slowest) : null,
    why:
      labs.length >= 2 && b.slowest
        ? `${josa(b.slowest.name, '은', '는')} 한 번에 평균 ${b.slowest.meanS.toFixed(1)} s가 걸려 가장 길어요. 줄 전체의 속도는 가장 느린 곳이 정해요.`
        : '두 현장 넘게 기록이 있어야 비교할 수 있어요.',
  });

  const sim = simOnly(rs);
  let speed: Quiz | null = null;
  for (const [lab, problem, key] of SPEED_COLUMNS) {
    const pts = scatter(ofProblem(sim, lab, problem), `v:${key}`, 'pass');
    const fit = regression(pts);
    if (pts.length < 6 || !fit || fit.r === null) continue;
    const [name] = valueName(lab, key);
    const r = fit.r;
    const xCol: Column = { key: `v:${key}`, name, unit: '', kind: 'value' };
    speed = {
      id: 'speed',
      q: `${labInfo(lab).name} 문제 ${problem} ‘${problemTitle(lab, problem)}’ — ${josa(name, '과', '와')} 성공의 관계는?`,
      look: `현장 분석의 산점도 — X: ${name}, Y: 성공 (기울기와 r을 봐요)`,
      view: { tab: 'lab', lab, problem, x: `v:${key}`, y: 'pass' },
      choices: ['빠를수록 성공이 늘어요', '빠를수록 실패가 늘어요', '거의 관계가 없어요'],
      answer: Math.abs(r) < 0.2 ? 2 : r > 0 ? 0 : 1,
      why: `${describeR(fit, xCol, { key: 'pass', name: '성공', unit: '', kind: 'run', binary: true })}. 실행 ${pts.length}번의 기록이에요.`,
    };
    break;
  }
  out.push(
    speed ?? {
      id: 'speed',
      q: '속도와 성공의 관계는?',
      look: '현장 분석의 산점도 — X: 속도, Y: 성공',
      view: null,
      choices: ['빠를수록 성공이 늘어요', '빠를수록 실패가 늘어요', '거의 관계가 없어요'],
      answer: null,
      why: `속도를 바꿔 본 실행이 여섯 번은 있어야 해요 (${SPEED_COLUMNS.map(([l, p]) => `${labInfo(l).name} 문제 ${p}`).join(', ')}).`,
    },
  );

  const t = twinSummary(pairTwin(twinRs));
  out.push({
    id: 'twin',
    q: '시뮬레이션과 실제 로봇의 위치 오차는 평균 몇 mm인가요?',
    look: '디지털 트윈의 ‘시뮬 ↔ 실제’ 그래프와 오차 표 — mm 항목의 평균 오차',
    view: { tab: 'twin' },
    choices: [...MM_BANDS],
    answer: t.mmMae === null ? null : mmBand(t.mmMae),
    why:
      t.mmMae === null
        ? '실제 로봇에서 같은 값으로 돌린 실행이 있어야 해요.'
        : `짝 지은 실행 ${t.pairs}쌍에서 mm로 잰 값의 차이를 평균하면 ${t.mmMae.toFixed(2)} mm예요.`,
  });
  return out;
}

/* --- CSV ------------------------------------------------------------------------------------------ */

/** One CSV cell: quoted when it holds a comma, a quote, a line break or edge spaces; quotes doubled. */
export function csvCell(v: string | number | boolean | null | undefined): string {
  const s = v === null || v === undefined || (typeof v === 'number' && !Number.isFinite(v)) ? '' : String(v);
  return /[",\r\n]|^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const pad2 = (n: number) => String(n).padStart(2, '0');
/** Local time as 2026-09-14 09:05:30. */
export const stamp = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
};

/** Every record, one row each: when, who, lab, problem, source, pass, job time, every value, every check (통과, 값). */
export function toCsv(rs: readonly DataRecord[]): string {
  const vk = [...new Set(rs.flatMap((r) => Object.keys(r.values)))];
  const ck = [...new Set(rs.flatMap((r) => r.checks.map((c) => c.label)))];
  const head = [
    '시각',
    '학생',
    '현장',
    '문제',
    '문제 이름',
    '출처',
    '성공',
    '작업 시간 (s)',
    ...vk.map((k) => `값: ${k}`),
    ...ck.flatMap((c) => [`${c} — 통과`, `${c} — 값`]),
  ];
  const rows = [...rs]
    .sort((a, b) => a.t - b.t)
    .map((r) => [
      stamp(r.t),
      r.who ?? '',
      labInfo(r.lab).name,
      r.problem,
      problemTitle(r.lab, r.problem),
      r.source === 'robot' ? '실제 로봇' : '시뮬레이터',
      r.pass ? 'O' : 'X',
      r.durationS,
      ...vk.map((k) => r.values[k]),
      ...ck.flatMap((c) => {
        const x = r.checks.find((y) => y.label === c);
        return x ? [x.ok ? 'O' : 'X', x.value] : ['', ''];
      }),
    ]);
  return [head, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

/* --- the example class -------------------------------------------------------------------------- */

/** A small seeded random generator (mulberry32): the same seed, the same class. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Rnd = () => number;
const gauss = (rnd: Rnd) => Math.sqrt(-2 * Math.log(Math.max(1e-12, rnd()))) * Math.cos(2 * Math.PI * rnd());
const r2 = (x: number) => Math.round(x * 100) / 100;
const roundTo = (x: number, step: number) => tidy(Math.round(x / step) * step);
const ok = (b: boolean) => (b ? '했어요' : '못 했어요');

/** A value a student changes: from the work sheet's (def) toward a fix, kept in lo … hi, on a step. */
interface NumParam {
  def: number;
  fix: number;
  lo: number;
  hi: number;
  step: number;
}
/** A choice: the sheet's, then (past `at` of the way) the fix; `mid` in between when given. */
interface CatParam {
  def: string | boolean;
  fix: string | boolean;
  mid?: string | boolean;
  at: number;
}
type Vals = Record<string, number | string | boolean>;
interface Outcome {
  durationS: number;
  checks: { label: string; ok: boolean; value: string }[];
}
/** A lab problem for the example class: its values and what a run of them gives (`real`: on the robot — a little off and slower). */
interface DemoSpec {
  lab: RunLab;
  problem: 1 | 2 | 3;
  params: Record<string, NumParam | CatParam>;
  run(v: Vals, rnd: Rnd, real: boolean): Outcome;
}

const num = (def: number, fix: number, lo: number, hi: number, step: number): NumParam => ({ def, fix, lo, hi, step });
const cat = (def: string | boolean, fix: string | boolean, at: number, mid?: string | boolean): CatParam => ({ def, fix, at, mid });
const N = (v: Vals, k: string) => v[k] as number;
/** The robot's extra position error, mm (the twin's gap: backlash, calibration). */
const realMm = (rnd: Rnd, real: boolean) => (real ? Math.abs(1.3 + 0.5 * gauss(rnd)) : 0);

const SPECS: readonly DemoSpec[] = [
  {
    lab: 'factory',
    problem: 1,
    params: { j1: num(22.7, 15.6, -40, 60, 0.1), j2: num(-14.3, -22.4, -60, 30, 0.1), j3: num(-67.7, -58.2, -110, -20, 0.1) },
    run(v, rnd, real) {
      const d = Math.hypot((N(v, 'j1') - 15.6) * 3.1, (N(v, 'j2') + 22.4) * 2.4, (N(v, 'j3') + 58.2) * 1.8) + Math.abs(0.4 * gauss(rnd)) + realMm(rnd, real);
      const grip = d <= 3;
      return {
        durationS: 7.6 + 0.3 * gauss(rnd) + (real ? 0.7 : 0),
        checks: [
          { label: '손끝이 상자 가운데에서 3 mm 안', ok: grip, value: `${d.toFixed(1)} mm` },
          { label: '팔레트에 내려놓음', ok: grip, value: ok(grip) },
          { label: '부딪히거나 관절 한계를 넘지 않음', ok: true, value: '없음' },
        ],
      };
    },
  },
  {
    lab: 'factory',
    problem: 2,
    params: { mode: cat('angles', 'coords', 0.35), approach: num(60, 40, 20, 80, 5), s3: num(250, 170, 120, 280, 5) },
    run(v, rnd) {
      const coords = v.mode === 'coords';
      const far = N(v, 's3') > 205 ? 1 : 0;
      const placed = coords ? 3 - far : 1;
      return {
        durationS: 19.5 + (N(v, 'approach') - 40) * 0.04 + 0.6 * gauss(rnd),
        checks: [
          { label: '상자 3개를 모두 집어 팔레트에 놓음', ok: placed === 3, value: `${placed} / 3개` },
          { label: '손이 닿지 않는 자리가 없음', ok: !far, value: far ? '1곳' : '없음' },
          { label: '부딪히거나 관절 한계를 넘지 않음', ok: true, value: '없음' },
        ],
      };
    },
  },
  {
    lab: 'factory',
    problem: 3,
    params: {
      belt: num(120, 120, 120, 120, 1),
      waitY: num(-60, 40, -100, 100, 5),
      delayMs: num(2000, 1300, 0, 3000, 50),
      move: cat('linear', 'joint', 0.5),
      speed: num(30, 80, 10, 100, 5),
    },
    run(v, rnd) {
      const ideal = 1300 + (40 - N(v, 'waitY')) * 7;
      const e = Math.abs(N(v, 'delayMs') - ideal) + (v.move === 'joint' ? 0 : 260) + Math.max(0, 60 - N(v, 'speed')) * 9 + 60 * Math.abs(gauss(rnd));
      const caught = e < 220 ? 3 : e < 520 ? 2 : e < 900 ? 1 : 0;
      return {
        durationS: 16 + (100 - N(v, 'speed')) * 0.06 + 0.5 * gauss(rnd),
        checks: [
          { label: '상자 3개를 연달아 잡음', ok: caught === 3, value: `${caught} / 3개` },
          { label: '잡은 상자를 팔레트에 놓음', ok: caught === 3, value: `${caught} / 3개` },
        ],
      };
    },
  },
  {
    lab: 'logistics',
    problem: 1,
    params: { pitch: num(30, 40, 20, 60, 1), gap: num(0, 2, 0, 30, 1) },
    run(v, rnd) {
      const err = Math.abs(N(v, 'pitch') - 40) * 3 + (N(v, 'gap') < 1 ? 2.5 : 0) + Math.max(0, N(v, 'gap') - 6) * 0.8 + Math.abs(0.4 * gauss(rnd));
      const stacked = err <= 4 ? 12 : Math.max(3, 12 - Math.round(err / 3));
      return {
        durationS: 57 + N(v, 'gap') * 0.15 + 1.4 * gauss(rnd),
        checks: [
          { label: '12개 모두 쌓음 (무너짐 없이)', ok: stacked === 12, value: `${stacked} / 12` },
          { label: '놓는 높이가 상자 위 4 mm 안', ok: err <= 4, value: `최대 ${err.toFixed(1)} mm` },
        ],
      };
    },
  },
  {
    lab: 'logistics',
    problem: 2,
    params: { carry: num(100, 70, 30, 100, 5), empty: num(100, 100, 30, 100, 5), vert: num(35, 70, 10, 100, 5) },
    run(v, rnd) {
      const slip = Math.max(0, Math.round((N(v, 'carry') - 74) / 7 + 0.7 * gauss(rnd)));
      const time = 39 + 1080 / N(v, 'carry') + 300 / N(v, 'empty') + 450 / N(v, 'vert') + 0.8 * gauss(rnd);
      return {
        durationS: r2(time),
        checks: [
          { label: '상자가 미끄러지지 않음', ok: slip === 0, value: `${slip}개 미끄러짐` },
          { label: '주문 시간 70 s 안', ok: time <= 70, value: `${time.toFixed(1)} s` },
        ],
      };
    },
  },
  {
    lab: 'logistics',
    problem: 3,
    params: { x: num(245, 270, 200, 320, 1), y: num(-95, -55, -140, -20, 1) },
    run(v, rnd, real) {
      const err = Math.hypot(N(v, 'x') - 270, N(v, 'y') + 55) + Math.abs(0.5 * gauss(rnd)) + realMm(rnd, real);
      const placed = err <= 5 ? 12 : Math.max(0, 12 - Math.round(err / 4));
      return {
        durationS: 56 + 1.2 * gauss(rnd) + (real ? 3 : 0),
        checks: [
          { label: '12개 모두 팔레트 위에 바르게 놓음', ok: placed === 12, value: `${placed} / 12` },
          { label: '놓인 자리가 5 mm 안', ok: err <= 5, value: `최대 ${err.toFixed(1)} mm` },
        ],
      };
    },
  },
  {
    lab: 'bio',
    problem: 1,
    params: { tilt: num(35, 0, 0, 60, 1), yaw: num(0, 0, -90, 90, 5) },
    run(v, rnd, real) {
      const maxTilt = Math.abs(N(v, 'tilt')) + 1.5 + Math.abs(0.6 * gauss(rnd)) + (real ? 0.8 : 0);
      const safe = maxTilt < 31;
      return {
        durationS: 11.2 + 0.4 * gauss(rnd) + (real ? 0.9 : 0),
        checks: [
          { label: '옮기는 내내 기울기 31° 아래 (쏟지 않음)', ok: safe, value: `최대 ${maxTilt.toFixed(1)}°` },
          { label: '분석 랙에 꽂음', ok: safe, value: ok(safe) },
          { label: '작업 중지 없음', ok: safe, value: safe ? '없음' : '시험관이 쏟아짐' },
        ],
      };
    },
  },
  {
    lab: 'bio',
    problem: 2,
    params: { zero: num(0, 1, -3, 3, 0.1) },
    run(v, rnd, real) {
      const worst = Math.abs(N(v, 'zero') - 1) * 4.4 + 0.25 + Math.abs(0.12 * gauss(rnd)) + realMm(rnd, real);
      return {
        durationS: 31 + 0.8 * gauss(rnd) + (real ? 2.4 : 0),
        checks: [
          { label: '5개 모두 꽂음', ok: worst < 3.5, value: `${worst < 3.5 ? 5 : 3} / 5` },
          { label: '모두 칸 가운데에서 1 mm 안 (분석기가 읽음)', ok: worst <= 1, value: `최대 ${worst.toFixed(1)} mm` },
        ],
      };
    },
  },
  {
    lab: 'bio',
    problem: 3,
    params: {
      lift: num(125, 125, 80, 200, 5),
      via: cat(false, true, 0.4),
      vx: num(100, 90, 40, 200, 5),
      vy: num(0, 0, -100, 100, 5),
      vz: num(125, 125, 80, 200, 5),
    },
    run(v, rnd) {
      const clear = v.via ? 14 + (100 - N(v, 'vx')) * 0.6 + (N(v, 'vz') - 125) * 0.3 + 2 * gauss(rnd) : -1;
      const hit = clear < 5;
      return {
        durationS: 13 + (v.via ? 1.6 : 0) + 0.4 * gauss(rnd),
        checks: [
          { label: '원심분리기 · 랙에 부딪히지 않음', ok: !hit, value: hit ? '부딪힘' : `가장 가까이 ${clear.toFixed(0)} mm` },
          { label: '분석 랙에 꽂음', ok: !hit, value: ok(!hit) },
        ],
      };
    },
  },
  {
    lab: 'farm',
    problem: 1,
    params: { lo: num(-10, -10, -30, 10, 1), hi: num(40, 15, 0, 60, 1) },
    run(v, rnd) {
      const unripe = Math.max(0, Math.round((N(v, 'hi') - 19) / 6));
      const ripe = N(v, 'hi') < 9 ? 4 : N(v, 'lo') > -2 ? 5 : 6;
      return {
        durationS: 27 + unripe * 2.2 + 0.9 * gauss(rnd),
        checks: [
          { label: '익은 토마토 6개 모두 담음', ok: ripe === 6, value: `${ripe} / 6` },
          { label: '덜 익은 토마토는 담지 않음', ok: unripe === 0, value: `${unripe}개 담음` },
        ],
      };
    },
  },
  {
    lab: 'farm',
    problem: 2,
    params: { ratio: num(0.69, 0.83, 0.5, 1.1, 0.01) },
    run(v, rnd, real) {
      const worst = Math.abs(N(v, 'ratio') - 0.83) * 110 + 0.8 + Math.abs(0.4 * gauss(rnd)) + realMm(rnd, real);
      const packed = worst <= 9 ? 6 : 4;
      return {
        durationS: 30 + 0.9 * gauss(rnd) + (real ? 2.1 : 0),
        checks: [
          { label: '6개 모두 담음', ok: packed === 6, value: `${packed} / 6` },
          { label: '손가락 가운데에서 5 mm 안에 잡음', ok: worst <= 5, value: `최대 ${worst.toFixed(1)} mm` },
        ],
      };
    },
  },
  {
    lab: 'farm',
    problem: 3,
    params: { squeeze: num(3, 2, 0, 6, 0.5), speed: num(100, 40, 10, 100, 5) },
    run(v, rnd) {
      const force = 1.1 + N(v, 'squeeze') * 0.75 + N(v, 'speed') * 0.011 + 0.12 * gauss(rnd);
      const okF = force <= 3.4 && N(v, 'squeeze') > 0.4;
      return {
        durationS: 25 + (100 - N(v, 'speed')) * 0.06 + 0.7 * gauss(rnd),
        checks: [
          { label: '6개 모두 담음 (터짐 · 떨어뜨림 없이)', ok: okF, value: `${okF ? 6 : force > 3.4 ? 4 : 5} / 6` },
          { label: '최대 잡는 힘 3.4 N 이하 (터지는 힘의 70%)', ok: force <= 3.4, value: `최대 ${force.toFixed(1)} N` },
        ],
      };
    },
  },
  {
    lab: 'cafe',
    problem: 1,
    params: { speed: num(250, 250, 100, 400, 10), acc: num(4, 2, 0.5, 6, 0.1) },
    run(v, rnd, real) {
      const slope = N(v, 'acc') * 0.082 + 0.012 * gauss(rnd) + (real ? 0.02 : 0);
      const carryS = 0.85 + 175 / N(v, 'speed') + 0.95 / N(v, 'acc') + 0.04 * gauss(rnd) + (real ? 0.12 : 0);
      const spill = slope > 0.28;
      return {
        durationS: r2(carryS + 1.6),
        checks: [
          { label: '넘치지 않음 (수면 기울기 28% 아래)', ok: !spill, value: `최대 ${(slope * 100).toFixed(0)}% (${N(v, 'acc').toFixed(1)} m/s²)` },
          { label: '옮기는 시간 2.5 s 안', ok: carryS <= 2.5, value: `${carryS.toFixed(2)} s` },
          { label: '픽업 자리에 놓음', ok: !spill, value: ok(!spill) },
        ],
      };
    },
  },
  {
    lab: 'cafe',
    problem: 2,
    params: { zoneSpeed: num(250, 100, 50, 300, 10), detect: num(50, 90, 20, 150, 5) },
    run(v, rnd) {
      const gap = N(v, 'detect') - N(v, 'zoneSpeed') * 0.25 - 12 + 2 * gauss(rnd);
      const hit = gap < 0;
      return {
        durationS: 3.5 + 260 / N(v, 'zoneSpeed') + 0.15 * gauss(rnd),
        checks: [
          { label: '움직이는 컵이 손에 닿지 않음', ok: !hit, value: hit ? `${(N(v, 'zoneSpeed') * 0.4).toFixed(0)} mm/s로 닿음` : '닿지 않음' },
          { label: '손 앞 20 mm 넘게 남기고 멈춤', ok: !hit && gap >= 20, value: hit ? '—' : `${gap.toFixed(0)} mm` },
          { label: '손님에게 건넴', ok: !hit, value: ok(!hit) },
        ],
      };
    },
  },
  {
    lab: 'cafe',
    problem: 3,
    params: { radius: num(230, 180, 120, 280, 5), time: num(0.8, 1.0, 0.4, 2, 0.1) },
    run(v, rnd) {
      const tau = 0.8 * (N(v, 'radius') / 180) * (0.95 / N(v, 'time')) + 0.02 * gauss(rnd);
      const over = tau > 0.85;
      return {
        durationS: r2(2.6 + N(v, 'time') + 0.1 * gauss(rnd)),
        checks: [
          { label: 'J1 토크가 한계 안 (과부하 없음)', ok: !over, value: over ? `${tau.toFixed(2)} N·m 필요` : `최대 ${tau.toFixed(2)} N·m` },
          { label: '픽업 자리에 놓음', ok: !over, value: ok(!over) },
          { label: '작업 중지 없음', ok: !over, value: over ? 'J1 과부하' : '없음' },
        ],
      };
    },
  },
  {
    lab: 'ai',
    problem: 1,
    params: { yellowHi: num(59, 34, 15, 70, 1), greenLo: num(35, 35, 20, 60, 1) },
    run(v, rnd) {
      const yh = N(v, 'yellowHi');
      const right = (yh >= 50 && N(v, 'greenLo') <= 50 ? 3 : 4) - (yh < 26 ? 1 : 0);
      return {
        durationS: 34 + 1.1 * gauss(rnd),
        checks: [
          { label: '네 블록 모두 제 색 분류함에', ok: right === 4, value: `${right} / 4` },
          { label: '다른 색 칸에 들어간 블록 없음', ok: right === 4, value: `${4 - right}개` },
        ],
      };
    },
  },
  {
    lab: 'ai',
    problem: 2,
    params: { mode: cat('replay', 'relative', 0.75, 'blend'), power: num(2, 3, 1, 4, 1) },
    run(v, rnd, real) {
      const base = v.mode === 'replay' ? 58 : v.mode === 'blend' ? 9.5 - N(v, 'power') * 1.3 : 1.6;
      const worst = base + Math.abs(0.5 * gauss(rnd)) + realMm(rnd, real);
      const picked = worst <= 6 ? 3 : v.mode === 'replay' ? 1 : 2;
      return {
        durationS: 27 + 0.8 * gauss(rnd) + (real ? 2.2 : 0),
        checks: [
          { label: '세 번 모두 집어 D에 넣음', ok: picked === 3, value: `${picked} / 3` },
          { label: '블록 가운데에서 6 mm 안에 집음', ok: worst <= 6, value: `최대 ${worst.toFixed(1)} mm` },
        ],
      };
    },
  },
  {
    lab: 'ai',
    problem: 3,
    params: { height: num(25, 60, 10, 80, 5), parallax: cat(false, true, 0.55) },
    run(v, rnd, real) {
      const worst = Math.abs(N(v, 'height') - 60) * 0.32 + (v.parallax ? 0.8 : 9.5) + Math.abs(0.4 * gauss(rnd)) + realMm(rnd, real);
      const right = worst <= 6 ? 4 : worst <= 12 ? 2 : 0;
      return {
        durationS: 36 + 1.2 * gauss(rnd) + (real ? 2.6 : 0),
        checks: [
          { label: '네 부품 모두 제 분류함에', ok: right === 4, value: `${right} / 4` },
          { label: '윗면 가운데에서 6 mm 안에 집음', ok: worst <= 6, value: `최대 ${worst.toFixed(1)} mm` },
        ],
      };
    },
  },
];

/** The example class's first day (Mon 14 Sep 2026, 09:00 in Korea). */
export const DEMO_START = Date.UTC(2026, 8, 14, 0, 0);
export const DEMO_STUDENTS = 25;

/** The problems the example class also ran on the real robot (after passing in the simulator). */
const ROBOT_PROBLEMS = new Set(['factory|1', 'logistics|3', 'bio|1', 'bio|2', 'farm|2', 'cafe|1', 'ai|2', 'ai|3']);

/**
 * A made-up class of 25 students working through the six site labs, one lab a school day: each starts a
 * problem from the work sheet's values, then moves toward a fix (some overshoot, some give up after six
 * tries), and a few run their passing program on the real robot as well — a little off (≈1 mm) and slower.
 * Fewer students reach the later labs. Deterministic: the same seed, the same records, oldest first.
 */
export function demoRuns(seed = 1): DataRecord[] {
  const rnd = rng(seed);
  const out: DataRecord[] = [];
  const labs: RunLab[] = ['factory', 'logistics', 'bio', 'farm', 'cafe', 'ai'];
  const skill = Array.from({ length: DEMO_STUDENTS }, () => 0.35 + 0.6 * rnd());
  const robotOwner = Array.from({ length: DEMO_STUDENTS }, () => rnd() < 0.36);
  labs.forEach((lab, li) => {
    const n = DEMO_STUDENTS - li * 2;
    for (let s = 0; s < n; s++) {
      const who = `예시 ${pad2(s + 1)}`;
      let t = DEMO_START + li * 86_400_000 + Math.floor(rnd() * 35) * 60_000;
      for (const spec of SPECS.filter((x) => x.lab === lab)) {
        let progress = 0;
        let passed = false;
        const maxTries = 3 + Math.floor(rnd() * 4);
        const jitter = 0.6 + rnd() * 0.8;
        for (let k = 0; k < maxTries && !passed; k++) {
          // The first run is the sheet's; then a step toward a fix, bigger for a stronger student, with some wandering.
          if (k > 0) progress = Math.min(1, progress + skill[s] * (0.3 + 0.5 * rnd()));
          const values: Vals = {};
          for (const [key, p] of Object.entries(spec.params)) {
            if ('step' in p) {
              const span = Math.max(Math.abs(p.fix - p.def), (p.hi - p.lo) * 0.08);
              const wander = k === 0 ? 0 : gauss(rnd) * span * 0.3 * jitter * (1 - progress) + gauss(rnd) * p.step * 0.4;
              values[key] = Math.min(p.hi, Math.max(p.lo, roundTo(p.def + (p.fix - p.def) * progress + wander, p.step)));
            } else values[key] = progress >= p.at ? p.fix : p.mid !== undefined && progress >= p.at * 0.45 ? p.mid : p.def;
          }
          const o = spec.run(values, rnd, false);
          const pass = o.checks.every((c) => c.ok);
          out.push({
            t,
            lab,
            problem: spec.problem,
            pass,
            durationS: r2(Math.max(0.5, o.durationS)),
            values,
            checks: o.checks,
            source: 'sim',
            who,
          });
          t += Math.round((o.durationS + 40 + rnd() * 140) * 1000);
          if (pass) {
            passed = true;
            if (robotOwner[s] && ROBOT_PROBLEMS.has(`${lab}|${spec.problem}`)) {
              const ro = spec.run(values, rnd, true);
              t += Math.round((60 + rnd() * 120) * 1000);
              out.push({
                t,
                lab,
                problem: spec.problem,
                pass: ro.checks.every((c) => c.ok),
                durationS: r2(Math.max(0.5, ro.durationS)),
                values: { ...values },
                checks: ro.checks,
                source: 'robot',
                who,
              });
              t += Math.round((ro.durationS + 30) * 1000);
            }
          }
        }
        t += Math.round((120 + rnd() * 300) * 1000);
      }
    }
  });
  return out.sort((a, b) => a.t - b.t);
}
