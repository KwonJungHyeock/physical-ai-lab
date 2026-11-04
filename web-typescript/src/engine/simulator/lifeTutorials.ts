/**
 * 입문 트랙 (① 생활 로봇) 튜토리얼: three short quests on the controls every step uses — 제어, 자세,
 * and teaching points (the 공정 editor, which 입문 has only here). Each quest is three steps; a step
 * is done when the arm, the saved poses or the process show it (read a few times a second), so the
 * student just does it and the card ticks. After the third step, the idea in one card (개념).
 *
 * No React: Console.tsx reads the arm into a TutCtx and asks each step `done`.
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

export interface TutStep {
  title: string;
  /** What to do, one or two sentences. */
  text: string;
  /** The panel the step is done in (the card's [열기]). */
  panel: 'jog' | 'pose' | 'process';
  /** Done now? `start`: the context when the step began. */
  done(now: TutCtx, start: TutCtx, mem: TutMem): boolean;
}

export interface LifeTutorial {
  id: string;
  title: string;
  /** One line for the list. */
  note: string;
  steps: TutStep[];
  concept: { term: string; def: string };
}

const maxDiff = (a: readonly number[], b: readonly number[]) => Math.max(0, ...a.map((v, i) => Math.abs(v - (b[i] ?? 0))));
/** Poses saved since `start` (new names, or a name saved again with other angles). */
const newPoses = (now: TutCtx, start: TutCtx) => Object.entries(now.poses).filter(([k, v]) => !start.poses[k] || maxDiff(v, start.poses[k]) > 0.5);

export const LIFE_TUTORIALS: LifeTutorial[] = [
  {
    id: 'move',
    title: '제어로 팔 움직이기',
    note: '관절 하나씩 · 손끝을 좌표로 · 기본 자세',
    steps: [
      { title: '관절 돌리기', text: '[제어]에서 1번 관절을 30° 넘게 돌려 보세요. 로봇 전체가 옆으로 돌아요.', panel: 'jog', done: (n, s) => Math.abs(n.angles[0] - s.angles[0]) >= 30 },
      { title: '손끝 올리기', text: '좌표 조그로 손끝을 위(Z +)로 40 mm 넘게 올려 보세요. 관절 여러 개가 함께 움직여요.', panel: 'jog', done: (n, s) => n.tip.z - s.tip.z >= 40 },
      { title: '기본 자세로', text: '아래의 [기본 자세] 버튼으로 처음 자세로 돌아가요.', panel: 'jog', done: (n) => maxDiff(n.angles, n.home) <= 2 },
    ],
    concept: { term: '관절 좌표와 직교 좌표', def: '관절 각도로 움직이면 관절 하나만, 손끝 좌표(x · y · z)로 움직이면 로봇이 여러 관절을 함께 계산해 움직여요.' },
  },
  {
    id: 'pose',
    title: '자세 저장 · 불러오기',
    note: '자세를 기억시키고 다시 데려오기',
    steps: [
      { title: '자세 만들기', text: '[제어]로 팔을 원하는 자세로 움직여요 (아무 관절이나 20° 넘게).', panel: 'jog', done: (n, s) => maxDiff(n.angles, s.angles) >= 20 },
      { title: '자세 저장', text: '[자세]에서 [지금 자세 저장하기]를 눌러요.', panel: 'pose', done: (n, s) => newPoses(n, s).length > 0 },
      {
        title: '자세 불러오기',
        text: '팔을 다른 곳으로 움직인 뒤, 저장한 자세의 [이 자세로]를 눌러 다시 데려와요.',
        panel: 'pose',
        done: (n, s, mem) => {
          const saved = Object.values(s.poses);
          if (!saved.length) return false;
          if (saved.every((p) => maxDiff(n.angles, p) >= 15)) mem.away = true;
          return !!mem.away && saved.some((p) => maxDiff(n.angles, p) <= 2);
        },
      },
    ],
    concept: { term: '티칭 (자세 기억시키기)', def: '사람이 로봇을 원하는 자세로 데려가 저장해 두면, 로봇은 언제든 그 자세로 똑같이 돌아가요. 공장 로봇을 가르치는 기본 방법이에요.' },
  },
  {
    id: 'teach',
    title: '위치 가르쳐 옮기기',
    note: '공정 짜기: 실습 고르기 → 위치 가르치기 → 실행',
    steps: [
      { title: '실습 고르기', text: '공정 화면 아래 [다음: 실습 고르기]를 눌러 해 볼 실습을 골라요.', panel: 'process', done: (n) => n.flowStep >= 2 },
      { title: '위치 가르치기', text: '실습을 고르고 [다음]으로 가서, [제어]로 팔을 옮겨 위치를 저장해요.', panel: 'process', done: (n) => n.flowStep >= 3 },
      { title: '실행', text: '아래 [▶ 시뮬레이션]으로 가르친 위치를 차례로 도는지 끝까지 봐요.', panel: 'process', done: (n, s) => n.runs > s.runs || n.flowStep >= 4 },
    ],
    concept: { term: '공정 (위치 가르치기)', def: '일할 위치를 차례로 가르치고 그 사이를 어떻게 갈지 정하면 로봇이 그 순서대로 일해요. 실제 공장의 티칭 펜던트와 같은 방식이에요.' },
  },
];

export const lifeTutorialById = (id: string) => LIFE_TUTORIALS.find((t) => t.id === id) ?? null;
