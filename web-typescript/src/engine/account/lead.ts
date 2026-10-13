/**
 * A lesson the teacher leads (로봇 실습 7 "선생님과 함께"): the shared state of the lesson going on now,
 * kept by the class server in memory (desktop-go/classroom/lead.go, the same shapes). The teacher's screen
 * says which lesson and step the class is on, whether robots may move (gate), whether the answer is shown
 * (reveal) and when every robot must stop (stop: a counter); each student's screen follows it and sends a
 * mark (done, needs help, an answer, group and robot role, what the robot did). Both sides poll.
 *
 * Without a class server the teacher can still lead on the projector alone: LocalLead keeps the same state
 * on this PC (no students' marks). summarize() turns the marks into what the teacher's rail shows.
 * No React, no DOM.
 */

import type { ClassServerClient } from './client';

export interface Lead {
  /** "p7-1" … "p7-7" (engine/education/lead.ts). */
  lesson: string;
  /** The step the teacher has opened (students can go back, not past it). */
  step: number;
  /** Robots may move (the teacher's go for the real-robot step). */
  gate: boolean;
  /** The answer is shown on every screen. */
  reveal: boolean;
  /** Each increase: stop every robot now. */
  stop: number;
  rev: number;
  /** ms: the lead started, this step started. */
  at: number;
  since: number;
}

export type LeadRole = 'robot' | 'screen';
export type RobotState = '' | 'prep' | 'ready' | 'run' | 'done' | 'fail';

/** What a student sends (no 번호: the server knows who). */
export interface MarkIn {
  /** 조 번호 (0: none). */
  group: number;
  role: LeadRole | '';
  lesson: string;
  step: number;
  done: boolean;
  help: boolean;
  /** The pick or answer of this step (≤ 40 characters). */
  answer: string;
  robot: RobotState;
  /** What the robot did (≤ 80 characters). */
  result: string;
}

export interface Mark extends MarkIn {
  no: number;
  at: number;
}

/** The group's robot PC as a member following on screen sees it. */
export interface Mate {
  no: number;
  lesson: string;
  step: number;
  robot: RobotState;
  result: string;
}

export interface LeadView {
  lead: Lead | null;
  marks: Mark[];
}

export interface MyLead {
  lead: Lead | null;
  me: Mark | null;
  mate: Mate | null;
}

/** What the teacher sets. */
export type LeadSet = Pick<Lead, 'lesson' | 'step' | 'gate' | 'reveal' | 'stop'>;

export const LEAD_MAX_STEP = 20;
export const LEAD_MAX_GROUP = 12;
export const LEAD_POLL_MS = 1500;

/** The teacher's side: a class on the class server, or this PC alone. */
export interface LeadHost {
  /** Students can follow (a class server); false: the projector only. */
  readonly shared: boolean;
  get(): Promise<LeadView>;
  set(l: LeadSet): Promise<LeadView>;
  end(): Promise<void>;
}

export function serverLead(client: ClassServerClient, classId: string): LeadHost {
  return {
    shared: true,
    get: () => client.lead(classId),
    set: (l) => client.setLead(classId, l),
    end: async () => {
      await client.endLead(classId);
    },
  };
}

/** The projector alone: the same state on this PC, no marks. */
export class LocalLead implements LeadHost {
  readonly shared = false;
  private lead: Lead | null = null;
  constructor(private readonly now: () => number = Date.now) {}
  async get(): Promise<LeadView> {
    return { lead: this.lead, marks: [] };
  }
  async set(l: LeadSet): Promise<LeadView> {
    const ms = this.now();
    const old = this.lead;
    const changed = !old || old.lesson !== l.lesson || old.step !== l.step;
    this.lead = { ...l, stop: Math.max(l.stop, old?.stop ?? 0), rev: (old?.rev ?? 0) + 1, at: old?.at ?? ms, since: changed ? ms : old!.since };
    return { lead: this.lead, marks: [] };
  }
  async end(): Promise<void> {
    this.lead = null;
  }
}

/* --- what the teacher's rail shows ------------------------------------------------------------- */

export interface GroupRow {
  group: number;
  /** The robot PC's 번호 (null: no one took the robot). */
  robotNo: number | null;
  robot: RobotState;
  result: string;
  members: number[];
}

export interface LeadSummary {
  /** Students in the class (the roll), and how many have joined this lesson. */
  total: number;
  joined: number;
  /** On this step: done, asking for help (번호), still at it. */
  done: number;
  help: number[];
  doing: number;
  /** Answers of this step: answer → count. */
  answers: Map<string, number>;
  groups: GroupRow[];
}

const ORDER: Record<RobotState, number> = { '': 0, prep: 1, ready: 2, run: 3, fail: 4, done: 5 };

/**
 * The marks of the lesson on show, step by step. `total`: the class's students (0: count those joined).
 * A mark of another lesson (a student who has not caught up) counts as joined but not on this step.
 */
export function summarize(lead: Lead, marks: readonly Mark[], total = 0): LeadSummary {
  const here = marks.filter((m) => m.lesson === lead.lesson);
  const onStep = here.filter((m) => m.step === lead.step);
  const done = onStep.filter((m) => m.done && !m.help).length;
  const help = here.filter((m) => m.help).map((m) => m.no).sort((a, b) => a - b);
  const joined = marks.length;
  const all = Math.max(total, joined);
  const answers = new Map<string, number>();
  for (const m of onStep) if (m.answer) answers.set(m.answer, (answers.get(m.answer) ?? 0) + 1);
  const byGroup = new Map<number, GroupRow>();
  for (const m of marks) {
    if (m.group < 1) continue;
    const g = byGroup.get(m.group) ?? { group: m.group, robotNo: null, robot: '' as RobotState, result: '', members: [] };
    g.members.push(m.no);
    if (m.role === 'robot' && (g.robotNo === null || m.no < g.robotNo)) {
      g.robotNo = m.no;
      // Only what the robot did in this lesson.
      g.robot = m.lesson === lead.lesson ? m.robot : '';
      g.result = m.lesson === lead.lesson ? m.result : '';
    }
    byGroup.set(m.group, g);
  }
  const groups = [...byGroup.values()].sort((a, b) => a.group - b.group);
  for (const g of groups) g.members.sort((a, b) => a - b);
  return { total: all, joined, done, help, doing: Math.max(0, joined - done - help.length), answers, groups };
}

/** All groups with a robot PC are ready (or further): the teacher can let them move. */
export function groupsReady(s: LeadSummary): boolean {
  const withRobot = s.groups.filter((g) => g.robotNo !== null);
  return withRobot.length > 0 && withRobot.every((g) => ORDER[g.robot] >= ORDER.ready);
}

export const ROBOT_WORD: Record<RobotState, string> = { '': '아직', prep: '준비 중', ready: '준비 끝', run: '움직이는 중', done: '끝', fail: '멈춤' };

/* --- the student's side ------------------------------------------------------------------------- */

export function emptyMark(group = 0, role: LeadRole | '' = ''): MarkIn {
  return { group, role, lesson: '', step: 0, done: false, help: false, answer: '', robot: '', result: '' };
}

/** A mark as the server takes it: lengths cut, values in range. */
export function cleanMark(m: MarkIn): MarkIn {
  const cut = (s: string, n: number) => [...s].slice(0, n).join('');
  return {
    ...m,
    group: Math.max(0, Math.min(LEAD_MAX_GROUP, Math.round(m.group) || 0)),
    step: Math.max(0, Math.min(LEAD_MAX_STEP, Math.round(m.step) || 0)),
    answer: cut(m.answer, 40),
    result: cut(m.result, 80),
  };
}

export const sameMark = (a: MarkIn, b: MarkIn) =>
  a.group === b.group && a.role === b.role && a.lesson === b.lesson && a.step === b.step && a.done === b.done && a.help === b.help && a.answer === b.answer && a.robot === b.robot && a.result === b.result;
