/**
 * 입문 트랙 (① 생활 로봇) 튜토리얼: three short quests on the controls every step uses — 제어, 자세,
 * and teaching places (the 공정 짜기 screen, which 입문 has only here). Each quest is three steps,
 * shown at the top of the right panel the step is done in: one short line, a meter where the step
 * is a number (30°, 40 mm), and the button to press ringed in the panel. A step is done when the
 * arm, the saved poses or the 공정 screen show it (read a few times a second), so the student just
 * does it and the strip moves on. After the third step, the idea in one line (개념).
 *
 * No React: Console.tsx reads the arm into a TutCtx; TutorialStrip.tsx shows a step and rings its targets.
 */

export interface TutCtx {
  /** Joint angles now, degrees. */
  angles: readonly number[];
  /** The arm's 기본 자세. */
  home: readonly number[];
  /** The tool tip, robot mm. */
  tip: { x: number; y: number; z: number };
  /** The poses saved by name. */
  poses: Readonly<Record<string, readonly number[]>>;
  /** The 공정 짜기 screen's step (1 준비 · 2 실습 고르기 · 3 위치 가르치기 · 4 실행), and process runs finished well so far. */
  flowStep: number;
  runs: number;
}

/** What a step remembers between two looks (e.g. the arm went away from a saved pose). */
export type TutMem = Record<string, boolean>;

/** A control to ring: by CSS selector, or by the text it shows; `say`: the line by its spotlight. */
export type TutTarget = ({ sel: string } | { text: string }) & { say?: string };

export interface TutStep {
  /** One short line: what to do. */
  short: string;
  /** The panel the step is done in (opened when the step begins). */
  panel: 'jog' | 'pose' | 'process';
  /** The controls to press, ringed. */
  target: TutTarget[];
  /**
   * What to press now, from the arm (instead of `target`): the first of these on screen gets the
   * spotlight (the screen dims round it until it is pressed), the others are where to go first.
   */
  lead?(now: TutCtx): TutTarget[];
  /** How far along, for a step that is a number. */
  meter?(now: TutCtx, start: TutCtx): { v: number; of: number; unit: string };
  /** Done now? `start`: the context when the step began. */
  done(now: TutCtx, start: TutCtx, mem: TutMem): boolean;
  /** A glowing ring in the 3D view to bring the tool tip into (robot mm; 맛보기). */
  ring?: readonly [number, number, number];
}

export interface LifeTutorial {
  id: string;
  title: string;
  /** One line for the list. */
  note: string;
  steps: TutStep[];
  /** The idea, a term and one line. */
  concept: { term: string; def: string };
}

const maxDiff = (a: readonly number[], b: readonly number[]) => Math.max(0, ...a.map((v, i) => Math.abs(v - (b[i] ?? 0))));
/** Poses saved since `start` (new names, or a name saved again with other angles). */
const newPoses = (now: TutCtx, start: TutCtx) => Object.entries(now.poses).filter(([k, v]) => !start.poses[k] || maxDiff(v, start.poses[k]) > 0.5);

/** The jog keys of a joint (their labels: "베이스 (J1) +5°"). */
const jointKeys = (name: string, j: number): TutTarget[] => [{ sel: `[aria-label^="${name} (J${j}) +"]` }, { sel: `[aria-label^="${name} (J${j}) −"]` }];
const HOME_KEY: TutTarget = { sel: '[title="관찰 자세 (공식 AI 키트)"]' };

export const LIFE_TUTORIALS: LifeTutorial[] = [
  {
    id: 'move',
    title: '제어로 팔 움직이기',
    note: '관절 하나씩 · 손끝을 좌표로 · 기본 자세',
    steps: [
      {
        short: '베이스(J1)를 30° 돌려요',
        panel: 'jog',
        target: jointKeys('베이스', 1),
        meter: (n, s) => ({ v: Math.abs(n.angles[0] - s.angles[0]), of: 30, unit: '°' }),
        done: (n, s) => Math.abs(n.angles[0] - s.angles[0]) >= 30,
      },
      {
        short: '좌표로 손끝을 40 mm 올려요',
        panel: 'jog',
        target: [{ sel: '[title^="좌표: 손끝"]' }, { sel: '[aria-label$="(Z+)"]' }],
        meter: (n, s) => ({ v: Math.max(0, n.tip.z - s.tip.z), of: 40, unit: 'mm' }),
        done: (n, s) => n.tip.z - s.tip.z >= 40,
      },
      { short: '기본 자세로 돌아가요', panel: 'jog', target: [HOME_KEY], done: (n) => maxDiff(n.angles, n.home) <= 2 },
    ],
    concept: { term: '관절 좌표 · 직교 좌표', def: '관절을 하나씩, 또는 손끝을 x · y · z로 움직여요.' },
  },
  {
    id: 'pose',
    title: '자세 저장 · 불러오기',
    note: '자세를 기억시키고 다시 데려오기',
    steps: [
      {
        // The sentence names the one key to press (피드백 v2: one place at a time).
        short: '어깨 +5° 버튼을 눌러 팔을 20° 움직여요',
        panel: 'jog',
        target: [{ sel: '[aria-label^="어깨 (J2) +"]' }],
        meter: (n, s) => ({ v: maxDiff(n.angles, s.angles), of: 20, unit: '°' }),
        done: (n, s) => maxDiff(n.angles, s.angles) >= 20,
      },
      { short: "'지금 자세 저장하기' 버튼을 눌러 저장해요", panel: 'pose', target: [{ text: '지금 자세 저장하기' }], done: (n, s) => newPoses(n, s).length > 0 },
      {
        short: "'기본 자세'를 눌렀다가, 저장한 자세 버튼을 눌러 불러와요",
        panel: 'pose',
        target: [HOME_KEY, { sel: '[data-pose]' }],
        // Away first (기본 자세), then the saved pose: one key at a time.
        lead: (n) => (Object.values(n.poses).some((p) => maxDiff(n.angles, p) < 15) ? [HOME_KEY] : [{ sel: '[data-pose]' }]),
        done: (n, s, mem) => {
          const saved = Object.values(s.poses);
          if (!saved.length) return false;
          if (saved.every((p) => maxDiff(n.angles, p) >= 15)) mem.away = true;
          return !!mem.away && saved.some((p) => maxDiff(n.angles, p) <= 2);
        },
      },
    ],
    concept: { term: '티칭', def: '자세를 저장해 두면 언제든 똑같이 돌아가요.' },
  },
  {
    id: 'teach',
    title: '위치 가르쳐 옮기기',
    note: '공정 짜기: 실습 고르기 → 위치 → 실행',
    steps: [
      { short: '실습을 골라요', panel: 'process', target: [{ text: '다음: 실습 고르기' }], done: (n) => n.flowStep >= 2 },
      { short: '이 실습으로 시작해요', panel: 'process', target: [{ text: '이 실습으로 시작' }], done: (n) => n.flowStep >= 3 },
      { short: '시뮬레이션으로 끝까지 봐요', panel: 'process', target: [{ sel: '[aria-label="시뮬레이션"]' }], done: (n, s) => n.runs > s.runs || n.flowStep >= 4 },
    ],
    concept: { term: '공정', def: '위치를 차례로 가르치면 그 순서대로 일해요.' },
  },
];

/** How close the tool tip has to come to a ring's centre, mm. */
export const RING_MM = 15;
/** A ring's lead leaves an axis alone once the tip is this close on it, mm (the ring is round, 15 mm). */
const LEAD_SLACK_MM = 6;
const dist = (tip: TutCtx['tip'], r: readonly [number, number, number]) => Math.hypot(tip.x - r[0], tip.y - r[1], tip.z - r[2]);
/** The 좌표 jog keys by axis and way (their labels end "(X+)", "(Y−)"), and what each is called on the pad. */
const TIP_KEYS: Record<string, string> = { 'X+': '앞', 'X−': '뒤', 'Y+': '왼쪽', 'Y−': '오른쪽', 'Z+': '위', 'Z−': '아래' };
const COORD_KEY: TutTarget = { sel: '[title^="좌표: 손끝"]', say: '좌표 버튼을 눌러요' };
/**
 * The key that brings the tip to the ring: up first, then across (the axis it is furthest off on),
 * down last — the way a tip is carried over the desk. Across first, low past the robot's base, the
 * tip meets the arm's reach and hardly moves (맛보기 고리 3 from 고리 2: Y− at z 110), so a student who
 * only presses the lit key would not get there. Where the 좌표 keys are not on screen (관절 mode),
 * the 좌표 button first.
 */
export function ringLead(tip: TutCtx['tip'], r: readonly [number, number, number]): TutTarget[] {
  const d = [r[0] - tip.x, r[1] - tip.y, r[2] - tip.z];
  const off = (i: number) => Math.abs(d[i]) > LEAD_SLACK_MM;
  const across = Math.abs(d[0]) >= Math.abs(d[1]) ? 0 : 1;
  const k = d[2] > LEAD_SLACK_MM ? 2 : off(across) ? across : off(1 - across) ? 1 - across : 2;
  const key = `${'XYZ'[k]}${d[k] > 0 ? '+' : '−'}`;
  return [{ sel: `[aria-label$="(${key})"]`, say: `${TIP_KEYS[key]} (${key}) 키를 눌러요` }, COORD_KEY];
}
/** A 맛보기 step: bring the tip into the ring (the meter: how much of the way is done). */
function ringStep(n: number, r: readonly [number, number, number]): TutStep {
  return {
    short: `손끝을 고리 ${n} 안으로 넣어요`,
    panel: 'jog',
    target: [],
    lead: (now) => ringLead(now.tip, r),
    ring: r,
    meter: (now, start) => {
      const of = Math.max(1, Math.round(dist(start.tip, r) - RING_MM));
      return { v: Math.max(0, Math.round(dist(start.tip, r) - dist(now.tip, r))), of, unit: 'mm' };
    },
    done: (now) => dist(now.tip, r) <= RING_MM,
  };
}

/**
 * 맛보기 (before the three): a quest to feel the controls — three glowing rings in turn, the tool tip
 * into each with the 제어 keys (joints or the tip's x · y · z). All three are in easy reach of the
 * 기본 자세's tip, in front, left and right.
 */
export const LIFE_TASTE: LifeTutorial = {
  id: 'taste',
  title: '맛보기 · 고리 3개 통과',
  note: '제어 키로 손끝을 빛나는 고리 안에',
  steps: [ringStep(1, [170, 0, 150]), ringStep(2, [130, 120, 110]), ringStep(3, [130, -130, 190])],
  concept: { term: '손끝 (TCP)', def: '로봇이 일하는 곳은 손끝이에요. 관절을 돌리면 손끝이 움직여요.' },
};

export const lifeTutorialById = (id: string) => (id === LIFE_TASTE.id ? LIFE_TASTE : (LIFE_TUTORIALS.find((t) => t.id === id) ?? null));
