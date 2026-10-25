/**
 * 말로 만들기: what the student's simulator tells the class server's AI about the scene, and how its
 * answer becomes a block program. The AI (desktop-go/classroom/llm.go, instructions in
 * llm_system.md) answers only with block lines; here they go through the same parser and checks as a
 * program the student builds, so a line the blocks do not know never reaches the editor unnoticed,
 * and its problems can be sent back for one more try ([다시 만들기]).
 */

import type { LlmContext } from '../account/client';
import type { ArmSpec } from '../robot/arms';
import { BIN_NAMES, COLORS, SPOT_NAMES, type Theme } from './board';
import { EFFECTOR_BY_ID, type EffectorId } from './effectors';
import { check, parse, type Problem } from './program';

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
