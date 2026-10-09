/**
 * Every run a student makes in a theme lab, kept in the browser for the 디지털 트윈 관제센터 (its
 * data science screen). One record per [실행] of the student's own values: which lab and problem,
 * the values set, whether it passed, how long the robot's job took, and each check with its value.
 * A record can also come from the real robot (`source: 'robot'`), for the twin comparison.
 *
 * Kept in localStorage under RUN_LOG_KEY, newest last, at most RUN_LOG_MAX (the oldest go first).
 * No React, no DOM beyond localStorage (absent: nothing is kept, nothing breaks).
 */

export const RUN_LOG_KEY = 'lab-runs';
export const RUN_LOG_MAX = 2000;

/** The labs that log (the six site labs and 에너지·자원순환). */
export type RunLab = 'factory' | 'logistics' | 'bio' | 'farm' | 'cafe' | 'ai' | 'energy';

export interface RunCheck {
  label: string;
  ok: boolean;
  /** As shown to the student, e.g. "3 / 4", "최대 4.2 mm". */
  value: string;
}

export interface RunRecord {
  /** When, ms since 1970. */
  t: number;
  lab: RunLab;
  problem: 1 | 2 | 3;
  pass: boolean;
  /** How long the robot's job took in the run, s (NaN when the run stopped before it began). */
  durationS: number;
  /** The values the student set, flattened to numbers and short strings ("speed": 60, "mode": "policy"). */
  values: Record<string, number | string | boolean>;
  checks: RunCheck[];
  /** 'sim' (the simulator) or 'robot' (the same program on the real arm). */
  source: 'sim' | 'robot';
}

function store(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** Every record, oldest first (a broken store reads as empty). */
export function loadRuns(): RunRecord[] {
  const s = store();
  if (!s) return [];
  try {
    const v = JSON.parse(s.getItem(RUN_LOG_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((r) => r && typeof r.lab === 'string' && typeof r.t === 'number') : [];
  } catch {
    return [];
  }
}

/** Flattens a lab's values object to one level: nested keys joined with '.', arrays by index. */
export function flatValues(v: unknown, prefix = '', out: Record<string, number | string | boolean> = {}): Record<string, number | string | boolean> {
  if (typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') out[prefix || 'value'] = v;
  else if (Array.isArray(v)) v.forEach((x, i) => flatValues(x, prefix ? `${prefix}.${i}` : String(i), out));
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) flatValues(x, prefix ? `${prefix}.${k}` : k, out);
  return out;
}

/** Adds one run (time defaults to now). Listeners on 'lab-runs' (window event) hear of it. */
export function logRun(r: Omit<RunRecord, 't' | 'source' | 'values'> & { t?: number; source?: RunRecord['source']; values: unknown }): RunRecord {
  const rec: RunRecord = {
    t: r.t ?? Date.now(),
    lab: r.lab,
    problem: r.problem,
    pass: r.pass,
    durationS: Number.isFinite(r.durationS) ? Math.round(r.durationS * 100) / 100 : NaN,
    values: flatValues(r.values),
    checks: r.checks.map((c) => ({ label: c.label, ok: c.ok, value: c.value })),
    source: r.source ?? 'sim',
  };
  const s = store();
  if (s) {
    const all = [...loadRuns(), rec].slice(-RUN_LOG_MAX);
    try {
      s.setItem(RUN_LOG_KEY, JSON.stringify(all));
    } catch {
      /* full or private: not kept */
    }
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(RUN_LOG_KEY));
  return rec;
}

export function clearRuns() {
  try {
    store()?.removeItem(RUN_LOG_KEY);
  } catch {
    /* nothing to clear */
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(RUN_LOG_KEY));
}
