/**
 * 말로 만들기: what the student's simulator tells the class server's AI about the scene, and how its
 * answer becomes a block program. The AI (desktop-go/classroom/llm.go, instructions in
 * llm_system.md) answers only with block lines; here they go through the same parser and checks as a
 * program the student builds, so a line the blocks do not know never reaches the editor unnoticed,
 * and its problems can be sent back for one more try ([다시 만들기]).
 */

import type { LlmContext, LlmMode } from '../account/client';
import type { ArmSpec } from '../robot/arms';
import { AlertTracker } from '../robot/jointAlert';
import type { ChainSegment } from '../robot/kinematics';
import { tcpPositionMm } from '../robot/motion';
import { solveToolPose } from '../robot/tool';
import { BINS, BIN_NAMES, BLOCK_MM, BUTTON, COLORS, SPOTS, SPOT_NAMES, type Theme } from './board';
import { OBJECT_KINDS } from './desk';
import { EFFECTOR_BY_ID, tcpFor, type EffectorId } from './effectors';
import { check, parse, type Problem } from './program';
import type { WorldState } from './sim';

/** The longest program sent along (the server takes 1500 characters). */
const MAX_PROGRAM = 1400;

/** Example sentences shown under the box, by what the arm holds. */
export function speakExamples(effector: EffectorId, theme: Theme): string[] {
  const kind = EFFECTOR_BY_ID[effector].kind;
  const to = theme === 'kit' ? '분류함 A' : '1번 자리';
  if (kind === 'grip' || kind === 'suction') return [`빨간 블록 집어서 ${to}에 놔`, '노란 블록 위로 가서 천천히 내려가', '몸통을 왼쪽으로 30도 돌렸다 와, 세 번'];
  return ['몸통을 왼쪽으로 30도 돌렸다 와, 세 번', '빨간 블록 위로 가 줘', '기본 자세로 돌아가'];
}

/** The scene for the AI: arm, joints and ranges, tool, the places on the desk, saved poses, the program now. */
export function speakContext(o: { arm: ArmSpec; effector: EffectorId; theme: Theme; poseNames: readonly string[]; program: string; errors?: string }): LlmContext {
  const e = EFFECTOR_BY_ID[o.effector];
  const n = o.arm.dof;
  const blocks = COLORS.map((c) => `${c.name} 블록`);
  const places = o.theme === 'kit' ? [...blocks, ...BIN_NAMES.map((b) => `분류함 ${b}`)] : [...blocks, ...SPOT_NAMES];
  const program = o.program.trim();
  return {
    arm: `${o.arm.name} ${o.arm.board}`.trim(),
    joints: n,
    ranges: Array.from({ length: n }, (_, i) => `J${i + 1} ${Math.round(o.arm.min[i])}~${Math.round(o.arm.max[i])}`).join(', '),
    tool: e.name,
    toolKind: e.kind,
    places,
    poses: o.poseNames.filter((p) => p.length <= 24 && !/["\n]/.test(p)).slice(0, 20),
    program: program.length <= MAX_PROGRAM ? program : '',
    errors: o.errors ? o.errors.slice(0, 590) : undefined,
  };
}

/** The AI's lines as a program for this scene, with what the block checks say about it. */
export function answerProgram(lines: readonly string[], ctx: { theme: Theme; effector: EffectorId; cameraFlange: boolean; poses: Record<string, readonly number[]> }): { code: string; errors: Problem[]; warnings: Problem[] } {
  const body = lines.filter((l) => !/^\s*from\s+edu\s+import\b/.test(l));
  const code = `from edu import robot\n\n${body.join('\n')}\n`;
  const parsed = parse(code);
  if (parsed.errors.length) return { code, errors: parsed.errors, warnings: [] };
  const c = check(parsed.steps, { theme: ctx.theme, effector: ctx.effector, cameraFlange: ctx.cameraFlange, poses: ctx.poses });
  return { code, errors: c.errors, warnings: c.warnings };
}

/** The checks' complaints as the server takes them back ("3번 줄: …"), for 다시 만들기. */
export const problemsText = (code: string, errors: readonly Problem[]): string => {
  const src = code.split('\n');
  return errors
    .slice(0, 6)
    .map((p) => `${src[p.line - 1]?.trim() ?? ''} → ${p.msg}`)
    .join('\n');
};

/* --- AI 버튼: the scene now, how a run went, the conversation ------------------------------------ */

/** The class server's limits for the scene and the conversation (llm.go llmMaxScene, llmMaxHistory). */
export const MAX_SCENE = 1500;
export const MAX_HISTORY = 2000;
/** A joint this close to a limit is mentioned, degrees. */
const ROOM_NOTE_DEG = 15;

const r0 = (v: number) => Math.round(v);
const r1 = (v: number) => Math.round(v * 10) / 10;

/** Tool-tip height that grips a block on the desk (gripper: mid-height; pump: on top), and puts a held one down. */
function heights(kind: string): { pick: number; put: number } | null {
  if (kind === 'grip') return { pick: BLOCK_MM / 2, put: BLOCK_MM / 2 + 1.5 };
  if (kind === 'suction') return { pick: BLOCK_MM, put: BLOCK_MM + 2 };
  return null;
}

const comfortCache = new Map<string, { from: number; to: number } | null>();
/**
 * How far from the base (straight ahead, at block height, tool down) every joint keeps at least
 * ROOM_NOTE_DEG of room: closer, the elbow folds to its limit; farther, the arm stretches out. Worked out
 * by the arm's own inverse kinematics, once per arm and tool.
 */
export function comfortRange(chain: readonly ChainSegment[], arm: ArmSpec, tcpMm: number, z: number): { from: number; to: number } | null {
  const key = `${arm.id}:${tcpMm.toFixed(1)}:${z}`;
  if (comfortCache.has(key)) return comfortCache.get(key)!;
  let best: { from: number; to: number } | null = null;
  let run: { from: number; to: number } | null = null;
  let seed = arm.home.slice();
  for (let x = 60; x <= arm.reachMm + 40; x += 10) {
    const ik = solveToolPose(chain, { x, y: 0, z }, seed, { tcpMm });
    // Straight down only: further out the solver leans the tool, which a block cannot be picked with.
    const ok = ik.converged && Math.abs(ik.orientation.tiltDeg) < 1 && ik.anglesDeg.slice(0, arm.dof).every((a, i) => Math.min(a - arm.min[i], arm.max[i] - a) >= ROOM_NOTE_DEG);
    if (ik.converged) seed = ik.anglesDeg;
    if (ok) {
      run = run ? { from: run.from, to: x } : { from: x, to: x };
      if (!best || run.to - run.from > best.to - best.from) best = { ...run };
    } else run = null;
  }
  comfortCache.set(key, best);
  return best;
}

/**
 * The scene for the AI, in the arm's coordinates (mm from the centre of its base; x forward, y left, z up
 * from the desk top): where the tool tip is, each joint and how much room it has, what the tool holds,
 * the blocks, the named spots, the comfortable distance from the base, and anything else on the desk.
 * Only numbers the simulator has; nothing is made up.
 */
export function sceneText(o: { chain: readonly ChainSegment[]; world: WorldState; arm: ArmSpec }): string {
  const w = o.world;
  const e = EFFECTOR_BY_ID[w.effector];
  const tcp = tcpFor(w.effector, w.cameraFlange);
  const tip = tcpPositionMm(o.chain, w.angles, tcp);
  const out: string[] = [];
  out.push(`tool tip now: x ${r0(tip.x)}, y ${r0(tip.y)}, z ${r0(tip.z)}`);
  out.push(
    `joints now: ${w.angles
      .slice(0, o.arm.dof)
      .map((a, i) => {
        const room = Math.min(a - o.arm.min[i], o.arm.max[i] - a);
        return `J${i + 1} ${r1(a)}°${room < ROOM_NOTE_DEG ? ` (${r0(Math.max(0, room))}° from its limit)` : ''}`;
      })
      .join(', ')}`,
  );
  const held = w.held ? `holding ${w.held.color} 블록` : 'holding nothing';
  const tool = e.kind === 'grip' ? `gripper ${w.gapMm < (e.gapMm?.open ?? 0) - 0.5 ? 'closed' : 'open'}, ${held}` : e.kind === 'suction' ? `pump ${w.pump ? 'on' : 'off'}, ${held}` : `${e.name} (cannot pick blocks up)`;
  out.push(`tool: ${tool}`);
  const h = heights(e.kind);
  const comfort = comfortRange(o.chain, o.arm, tcp, h?.pick ?? 20);
  if (w.blocks.length) {
    out.push(
      `blocks: ${w.blocks
        .map((b) => {
          const d = Math.hypot(b.x, b.y);
          const near = comfort && d < comfort.from - 5 ? ' (close to the base: the elbow folds near its limit to pick it)' : '';
          const up = b.z > BLOCK_MM / 2 + 3 ? `, z ${r0(b.z)}` : '';
          return `${b.color} 블록 x ${r0(b.x)}, y ${r0(b.y)}${up}${w.held?.color === b.color ? ' (in the tool)' : near}`;
        })
        .join('; ')}`,
    );
  } else out.push('blocks: none on the desk');
  const spots = w.theme === 'kit' ? [...BIN_NAMES.map((n) => `분류함 ${n} x ${r0(BINS[n].drop.x)}, y ${r0(BINS[n].drop.y)}`), `버튼 x ${r0(BUTTON.x)}, y ${r0(BUTTON.y)}`] : w.blocks.length ? SPOT_NAMES.map((n) => `${n} x ${SPOTS[n].x}, y ${SPOTS[n].y}`) : [];
  if (spots.length) out.push(`named places: ${spots.join('; ')}`);
  if (comfort) out.push(`comfortable distance from the base at block height: ${comfort.from}–${comfort.to} mm (closer: the elbow J3 folds near its limit; farther: the arm stretches out)`);
  out.push(`reach: about ${o.arm.reachMm} mm from the base`);
  if (h) out.push(`put-down height for this tool (a held block on the desk): ${h.put}`);
  const things = w.objects.filter((x) => x.kind !== 'block').slice(0, 6);
  if (things.length) out.push(`other things on the desk (keep clear): ${things.map((x) => `${OBJECT_KINDS[x.kind].name} x ${r0(x.x)}, y ${r0(x.y)}, ${r0(x.size[2])} mm tall`).join('; ')}`);
  let text = out.join('\n');
  if (text.length > MAX_SCENE) text = text.slice(0, MAX_SCENE - 1) + '…';
  return text;
}

/**
 * Follows a run frame by frame (the same judgement as the 3D view's joint colours, jointAlert.ts) and
 * keeps, per joint, the least room to its limit and the most load it had: what the AI hears about the run.
 */
export class RunWatch {
  private tracker: AlertTracker;
  private room: number[];
  private load: (number | null)[];
  constructor(
    chain: readonly ChainSegment[],
    tcpMm: number,
    withLoad: boolean,
    private dof: number,
  ) {
    this.tracker = new AlertTracker(chain, tcpMm, withLoad, dof);
    this.room = new Array(dof).fill(180);
    this.load = new Array(dof).fill(null);
  }
  update(tS: number, q: readonly number[], payloadKg = 0): void {
    this.tracker.update(tS, q, payloadKg).forEach((a, i) => {
      if (i >= this.dof) return;
      this.room[i] = Math.min(this.room[i], a.roomDeg);
      if (a.loadPct !== null) this.load[i] = Math.max(this.load[i] ?? 0, a.loadPct);
    });
  }
  /** Joints that came near a limit or worked hard ("J3 한계까지 1°", "J2 부하 85%"); [] when all was easy. */
  notes(): string[] {
    const n: string[] = [];
    for (let i = 0; i < this.dof; i += 1) {
      if (this.room[i] < 10) n.push(`J${i + 1} 한계까지 ${r0(Math.max(0, this.room[i]))}°`);
      const l = this.load[i];
      if (l !== null && l >= 60) n.push(`J${i + 1} 부하 ${r0(l)}%`);
    }
    return n;
  }
}

/** One turn of the AI conversation, as the AI hears it back. */
export interface TalkTurn {
  said: string;
  mode?: LlmMode;
  ok: boolean;
  explain: string;
  /** The block lines of the answer (without the import line). */
  lines: string[];
  /** How its run went, when it ran: "끝까지 했어요", "3번째 줄에서 멈췄어요: …", plus joint notes. */
  run?: string;
}

/** The last turns, newest kept: what was said, what was done, and how it went. */
export function historyText(turns: readonly TalkTurn[]): string {
  const parts = turns.map((t) => {
    const done = !t.ok ? 'you could not do it' : t.mode === 'blocks' ? 'you wrote a block program' : t.mode === 'talk' ? 'you answered' : 'you moved the arm';
    const lines = t.lines.filter((l) => l.trim() && !/^\s*from\s+edu\b/.test(l));
    return [`student: ${t.said}`, `${done}: ${t.explain}`, lines.length ? `lines: ${lines.map((l) => l.trim()).join(' | ')}` : '', t.run ? `run: ${t.run}` : ''].filter(Boolean).join('\n');
  });
  // Oldest first, dropping the oldest until it fits.
  while (parts.length > 1 && parts.join('\n\n').length > MAX_HISTORY) parts.shift();
  const text = parts.join('\n\n');
  return text.length > MAX_HISTORY ? text.slice(text.length - MAX_HISTORY) : text;
}

/**
 * What to do with an answer: the AI's own word, except that a student who says 블록 · 프로그램 · 코드 with
 * 짜 · 만들 · 바꿔 · 넣 asked for blocks whatever the AI said.
 */
export function answerMode(said: string, a: { ok: boolean; mode?: LlmMode; lines?: readonly string[] | null }): LlmMode {
  if (!a.ok) return 'talk';
  if (/(블록|프로그램|코드)/.test(said) && /(짜|만들|바꿔|바꾸|넣|고쳐)/.test(said)) return 'blocks';
  if (a.mode) return a.mode;
  return a.lines?.some((l) => l.trim() && !/^\s*from\s+edu\b/.test(l)) ? 'blocks' : 'talk';
}
