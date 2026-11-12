/**
 * myCobot 280 협동로봇 1단계: 기초 조작과 로봇 글씨 쓰기 — the 입문 트랙's course.
 *
 * The 매칭 표 (피드백 v3 파트 2, 8차시 지시서) is one file the platform and the simulator both read:
 * `public/course/mycobot-280-1.json` (served at /course/mycobot-280-1.json). It holds each 절: its
 * number ('3-4', the 교안's 장 · 절 number, never renumbered), name, 교안 pages (temporary until the
 * 8차시 교안), its status (열림 / 만드는 중 / 사용 안 함) and, for each kind (장면 보기 · 실습 하기),
 * 있음 / 만드는 중 / 없음; and the two courses (8차시 · 4차시). Change pages or states there only.
 *
 * What the simulator alone knows is here: the scene each 절 sits in and what its 실습 opens (a 실습 셀
 * quest — 글씨 쓰기 G1 … — or a 기초 조작 tutorial, lifeTutorials.ts). No React.
 */

import TABLE from '../../../../public/course/mycobot-280-1.json';

/** The six kinds of scene, all on one stage (보고 #49): the camera and the props change. */
export type SceneKind = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';

/** A 실습 셀 quest, a 기초 조작 tutorial, a 절 built for the course (courseSteps.ts), or a chapter's 수행평가 (courseTests.ts, its chapter). */
export type SubRun = { kind: 'quest'; id: string } | { kind: 'tutorial'; id: string } | { kind: 'step'; id: string } | { kind: 'test'; id: string };

/** A 절 in the course: 열림 (something opens), 만드는 중, 사용 안 함 (kept, never listed). */
export type SubStatus = 'open' | 'soon' | 'unused';
/** One kind of a 절 (장면 보기 or 실습 하기): 있음, 만드는 중, 없음 (no button for it). */
export type KindState = 'open' | 'soon' | 'none';
/** 장면 보기 (the scene and its motion, nothing to press: the teacher shows it) or 실습 하기. */
export type SubMode = 'scene' | 'practice';

export const MODE_NAME: Record<SubMode, string> = { scene: TABLE.words.scene, practice: TABLE.words.practice };

export interface CourseSub {
  /** '3-2': the 교안's 장 · 절 number. */
  id: string;
  title: string;
  chapter: number;
  /** Its 교안 pages (temporary until the 8차시 교안). */
  pages: readonly [number, number];
  status: SubStatus;
  kinds: Record<SubMode, KindState>;
  /** 선택: the real robot's 절. A class without a robot skips it; it never counts against the record. */
  optional?: boolean;
  /** A chapter's 수행평가 (O · X 5 + 미션): not a 절 of its own, it follows the chapter's last 절. */
  test?: boolean;
  scene: SceneKind;
  /** What its 실습 하기 opens (its 장면 보기 plays the same quest by itself). */
  run?: SubRun;
}

export interface CourseChapter {
  n: number;
  title: string;
  /** Its 수행평가's number (the old 절, kept in the table as 사용 안 함). */
  test?: string;
  subs: CourseSub[];
}

const q = (id: string): SubRun => ({ kind: 'quest', id });
const t = (id: string): SubRun => ({ kind: 'tutorial', id });
const st = (id: string): SubRun => ({ kind: 'step', id });
const test = (chapter: number): SubRun => ({ kind: 'test', id: String(chapter) });

/** The simulator's own side of each 절: its scene and what it opens. */
const SIM: Record<string, { scene: SceneKind; run?: SubRun }> = {
  '1-1': { scene: 'A', run: st('1-1') },
  '1-2': { scene: 'C', run: st('1-2') },
  '1-3': { scene: 'A', run: st('1-3') },
  '1-4': { scene: 'F', run: test(1) },
  '2-1': { scene: 'B', run: st('2-1') },
  '2-2': { scene: 'A' },
  '2-3': { scene: 'C', run: st('2-3') },
  '2-4': { scene: 'E', run: st('2-4') },
  '2-5': { scene: 'F', run: test(2) },
  '3-1': { scene: 'C' },
  '3-2': { scene: 'C' },
  '3-3': { scene: 'C' },
  '3-4': { scene: 'C', run: t('pose') },
  '3-5': { scene: 'C' },
  '3-6': { scene: 'C' },
  '4-1': { scene: 'D', run: t('taste') },
  '4-2': { scene: 'D' },
  '4-3': { scene: 'D', run: q('G3') },
  '4-4': { scene: 'D' },
  '4-5': { scene: 'D' },
  '5-1': { scene: 'A', run: q('G1') },
  '5-2': { scene: 'E', run: q('G2') },
  '5-3': { scene: 'E', run: q('G4') },
  '5-4': { scene: 'D' },
  '5-5': { scene: 'A' },
  '5-6': { scene: 'A' },
  '6-1': { scene: 'F' },
  '6-2': { scene: 'F' },
  '6-3': { scene: 'F' },
};

const isStatus = (v: string): v is SubStatus => v === 'open' || v === 'soon' || v === 'unused';
const isKind = (v: string): v is KindState => v === 'open' || v === 'soon' || v === 'none';

export const COURSE_SUBS: CourseSub[] = TABLE.sections.map((s) => {
  const sim = SIM[s.id] ?? { scene: 'A' as const };
  const kinds = { scene: isKind(s.scene) ? s.scene : 'none', practice: isKind(s.practice) ? s.practice : 'none' } as const;
  return {
    id: s.id,
    title: s.title,
    chapter: s.chapter,
    pages: [s.pages[0], s.pages[1] ?? s.pages[0]] as const,
    status: isStatus(s.status) ? s.status : 'soon',
    kinds,
    ...('optional' in s && s.optional ? { optional: true } : {}),
    ...('test' in s && s.test ? { test: true } : {}),
    scene: sim.scene,
    // A 절 opens only with a kind that is there and something to open.
    // (A chapter's 수행평가 opens with its chapter, not as a 절 of its own.)
    ...(sim.run && (kinds.scene === 'open' || kinds.practice === 'open' || ('test' in s && s.test)) ? { run: sim.run } : {}),
  };
});

export const COURSE: CourseChapter[] = TABLE.chapters.map((c) => ({ n: c.n, title: c.title, ...('test' in c && c.test ? { test: c.test } : {}), subs: COURSE_SUBS.filter((s) => s.chapter === c.n) }));

export const subById = (id: string): CourseSub | undefined => COURSE_SUBS.find((s) => s.id === id);

/** The 절 a quest or a tutorial is (the first one it opens). */
export const subOfRun = (kind: SubRun['kind'], id: string): CourseSub | undefined => COURSE_SUBS.find((s) => s.run?.kind === kind && s.run.id === id);

/** The kinds a 절 has a button for (있음 or 만드는 중; 없음 has none). */
export const kindsOf = (s: CourseSub): SubMode[] => (['scene', 'practice'] as const).filter((m) => s.kinds[m] !== 'none');

/** The kind a 절 opens in when `want` was asked for: that one if it is there, else the other (none: it does not open). */
export function modeFor(s: CourseSub, want: SubMode): SubMode | null {
  if (!s.run) return null;
  // A chapter's 수행평가 opens as itself (no 장면 보기 · 실습 하기 of its own).
  if (s.test) return 'practice';
  if (s.kinds[want] === 'open') return want;
  const other: SubMode = want === 'scene' ? 'practice' : 'scene';
  return s.kinds[other] === 'open' ? other : null;
}

/** The topic mark after a 절 number, read aloud: '3-6은', '3-4는'. */
export const topicMark = (id: string) => (/[013678]$/.test(id) ? '은' : '는');

/** '교안 34~35쪽' (or '교안 76쪽'). */
export const pagesText = (p: readonly [number, number]) => (p[0] === p[1] ? `교안 ${p[0]}쪽` : `교안 ${p[0]}~${p[1]}쪽`);
