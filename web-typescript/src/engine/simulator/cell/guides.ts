/**
 * 단계 안내 (입문 트랙 · 생활 로봇 현장): each step of the café (F) and the calligraphy booth (G)
 * goes 예측 → 관찰 → 개념, as the simulation chapters do (docs: 시뮬레이션 챕터 공통 양식).
 *
 *  - 예측: one multiple-choice question before the run. Not graded: it is kept and compared with
 *    what happened once the run is over.
 *  - 관찰: two or three moments the scene shows during a run (a sensor coming on, the pen touching
 *    the paper, the customer's hand). Each is read off the run as it goes (`observe`, from stepCell)
 *    and pops up as a bubble at its place in the scene; the mission card ticks it off.
 *  - 개념: after the run, the one idea the step is about, in the words the trade uses, and where
 *    it is in real robot cafés / booths / factories (보고 #43 · #44).
 *
 * No React: CellHud.tsx and CellScene.tsx show them.
 */

import type { WorldState } from '../sim';
import { CAFE_AT } from './cells';
import { CARD_HOME, CARD_MM } from './draw';
import { BOARD, pointXY, robotStones } from './board';
import { STONE_TRAY } from './cells';
import type { CellRun } from './run';
import { quizText } from './courseText';

export interface Observation {
  id: string;
  /** What to see, one line (shown on the card and in the bubble). */
  text: string;
  /** Where the bubble stands, robot mm. */
  at: [number, number, number];
  /** Is it happening now? */
  when(run: CellRun, w: WorldState): boolean;
}

/** A question asked over the scene at its moment (the scene holds still until it is answered). */
export interface Ask {
  q: string;
  options: string[];
  answer: number;
  why: string;
  at?(run: CellRun, w: WorldState): boolean;
}

export interface StepGuide {
  /**
   * 예측: asked over the scene at the moment the result splits (`at`; the scene holds still until
   * it is answered), once per step; without `at`, at the step's first moment to observe.
   */
  predict?: Ask;
  /** 미리보기: several O · X questions, each at its own moment, in order (in place of a 예측). */
  asks?: Ask[];
  observe: Observation[];
  /** The idea, after the run (none where the explanation is the worksheet's). */
  concept?: { term: string; def: string; real: string };
}

/** The step's questions in order (a 예측 is one), and the key each answer is kept under. */
export function asksOf(id: string): { ask: Ask; key: string; at: (run: CellRun, w: WorldState) => boolean }[] {
  const g = guideOf(id);
  if (!g) return [];
  if (g.asks) return g.asks.map((ask, k) => ({ ask, key: `${id}#${k + 1}`, at: ask.at ?? (() => false) }));
  if (!g.predict) return [];
  const at = g.predict.at ?? (g.observe.length ? g.observe[0].when : null);
  return at ? [{ ask: g.predict, key: id, at }] : [];
}

const on = (name: string) => (run: CellRun) => !!run.line.in[name];
const out = (name: string) => (run: CellRun) => !!run.line.out[name];
const cardsDone = (n: number) => (run: CellRun) => (run.draw?.done.length ?? 0) >= n;
/** The pen tip on the paper (the trail grows). */
const inking = (_run: CellRun, w: WorldState) => w.penDown;
/** The pen up between two strokes (off the paper, at travel height), after some ink. */
const lifted = (run: CellRun, w: WorldState) => !w.penDown && w.trail.some((s) => s.length > 2) && !!run.line.in['카드 있음'];


const A = CAFE_AT;
const CUP: [number, number, number] = [A.cup.x, A.cup.y, 120];
const COFFEE: [number, number, number] = [A.coffee.x, A.coffee.y, 110];
const PICKUP: [number, number, number] = [98, -190, 100];
const CARD: [number, number, number] = [CARD_HOME.x + CARD_MM.w / 2, CARD_HOME.y + CARD_MM.h / 2, 60];
const LAMP: [number, number, number] = [312, -140, 90];
const MID = pointXY({ c: 5, r: 5 });
const BOARD_AT: [number, number, number] = [MID.x, MID.y, 60];
const NEAR_PERSON: [number, number, number] = [MID.x, BOARD.y0 - 10, 70];
const TRAY_AT: [number, number, number] = [STONE_TRAY.x + STONE_TRAY.pitch, STONE_TRAY.y + 2 * STONE_TRAY.pitch, 50];
const placed = (n: number) => (run: CellRun) => (run.board ? robotStones(run.board).length : 0) >= n;
const held = (_run: CellRun, w: WorldState) => !!w.carry;

export const STEP_GUIDES: Record<string, StepGuide> = {
  /* --- F: 로봇 카페 (미리보기 only: the rest is done, its explanation is the worksheet's) --- */
  F1: {
    asks: [
      { q: '로봇은 [컵 준비됨] 신호를 받고 나서 컵을 집는다.', options: ['O', 'X'], answer: 0, why: '컵이 나왔다는 신호를 보고 집어요.', at: on('컵 준비됨') },
      { q: '샷이 다 나오기 전에 컵을 빼도 괜찮다.', options: ['O', 'X'], answer: 1, why: '남은 커피가 받침대로 쏟아져요. [추출 끝]을 기다려요.', at: on('추출 중') },
      { q: '손님이 음료를 가져가는 동안 로봇 팔은 픽업대 안에 있다.', options: ['O', 'X'], answer: 1, why: '문이 열린 동안 팔은 밖에서 기다려요.', at: on('문 열림') },
    ],
    observe: [
      { id: 'cup', text: '[컵 준비됨] 켜짐: 컵이 내려왔어요', at: CUP, when: on('컵 준비됨') },
      { id: 'shot', text: '[추출 중] 28초: 로봇은 기다려요', at: COFFEE, when: on('추출 중') },
      { id: 'hand', text: '[손 감지]: 손님 손이 있는 동안 팔은 밖에', at: PICKUP, when: on('손 감지') },
    ],
  },

  /* --- G: 로봇 캘리그라피 --- */
  G1: {
    // (입문 과정 5-1 · 5-2 · 5-3: the question's words are in the 문구 파일, courseText.ts.)
    predict: { ...quizText('5-1'), at: lifted },
    observe: [
      { id: 'card', text: '[카드 있음]: 손님이 카드를 놓았어요', at: CARD, when: on('카드 있음') },
      { id: 'ink', text: '펜 끝이 종이에 닿으면 선이 나와요', at: CARD, when: inking },
      { id: 'lamp', text: '[완성 램프]: 손님이 카드를 가져가요', at: LAMP, when: out('완성 램프') },
    ],
    concept: { term: '작업 흐름 (한 사이클)', def: '카드 받기 → 쓰기 → 완성 알리기가 한 사이클이에요. 손님마다 같은 사이클을 반복해요.', real: '행사장 그림 · 글씨 로봇 부스는 한 장에 평균 40초쯤 걸려요.' },
  },
  G2: {
    predict: { ...quizText('5-2'), at: on('카드 있음') },
    observe: [
      { id: 'ink', text: '펜이 종이에 닿았어요: 선이 나와요', at: CARD, when: inking },
      { id: 'lamp', text: '[완성 램프]: 다 썼어요', at: LAMP, when: out('완성 램프') },
    ],
    concept: {
      term: '보정 (펜 높이 · 카드 자리)',
      def: '공구 끝이 닿는 높이와 작업물의 기준점(원점)을 로봇 좌표로 알려 주는 것이에요. 펜을 갈거나 카드가 옮겨지면 다시 맞춰요.',
      real: '그림 로봇 부스는 설치할 때 종이 높이와 위치부터 맞춰요. 공장 로봇도 일감이 놓인 자리를 먼저 알려 주고 일해요.',
    },
  },
  G3: {
    predict: { q: '네모를 관절 이동으로 그리고 있어요. 네 변은?', options: ['곧게 그려진다', '휘어진다'], answer: 1, why: '관절 이동은 모든 관절이 한꺼번에 돌아서 펜 끝이 곡선으로 가요.', at: inking },
    observe: [
      { id: 'ink', text: '펜 끝이 가는 길 = 선', at: CARD, when: inking },
      { id: 'lamp', text: '[완성 램프]: 변이 곧은지 보세요', at: LAMP, when: out('완성 램프') },
    ],
    concept: { term: '직선 이동 vs 관절 이동', def: '직선 이동은 펜 끝이 곧게 가고, 관절 이동은 관절이 한꺼번에 돌아서 끝이 휘어 가요.', real: '접착제를 바르는 공장 로봇도 직선 이동으로 곧고 고른 선을 그어요.' },
  },
  G4: {
    predict: { ...quizText('5-3'), at: inking },
    observe: [
      { id: 'ink', text: '그리기 이동: 펜이 닿아 있어요', at: CARD, when: inking },
      { id: 'up', text: '빈 이동: 펜을 들고 옮겨요', at: CARD, when: lifted },
      { id: 'two', text: '2장 완성: 줄 끝', at: LAMP, when: cardsDone(2) },
    ],
    concept: { term: '그리기 이동과 빈 이동', def: '일하는 구간(펜이 닿음)과 옮기는 구간(펜을 듦)을 나눠 움직이는 것이에요.', real: '용접 · 도포 로봇도 작업 구간에서만 토치 · 노즐을 켜고, 옮길 때는 끄고 들어 올려요.' },
  },

  /* --- H: 보드게임 로봇 --- */
  H1: {
    predict: { q: '사람이 돌을 두고 있어요. 로봇은 언제 움직일까요?', options: ['지금 바로', '사람이 손을 뺀 뒤'], answer: 1, why: '[로봇 차례] 신호가 켜져야 움직여요. 사람이 손을 뺀 뒤에 켜져요.', at: on('손 감지') },
    observe: [
      { id: 'hand', text: '[손 감지]: 사람이 돌을 두는 중', at: NEAR_PERSON, when: on('손 감지') },
      { id: 'turn', text: '[로봇 차례] 켜짐: 이제 움직여요', at: BOARD_AT, when: on('로봇 차례') },
      { id: 'held', text: '흡착 펌프가 흰 돌을 들었어요', at: TRAY_AT, when: held },
    ],
    concept: { term: '한 수의 흐름', def: '차례 기다리기 → 돌 집기 → 칸으로 옮겨 내려놓기 → 기본 자세. 한 수마다 같은 흐름을 반복해요.', real: '체스 · 바둑을 두는 로봇도 사람의 수를 확인한 뒤 같은 흐름으로 말을 옮겨요.' },
  },
  H2: {
    predict: {
      q: '칸 간격을 15 mm로 알려 줬어요(판은 16 mm). 가로 7 · 세로 6의 돌은?',
      options: ['정확히 그 교차점에 놓인다', '가로 1 쪽으로 몇 mm 벗어난다'],
      answer: 1,
      why: '칸마다 1 mm씩 모자라서 가로로 6 mm, 세로로 5 mm 벗어나요.',
      at: held,
    },
    observe: [
      { id: 'held', text: '흰 돌을 들고 계산한 좌표로 가요', at: TRAY_AT, when: held },
      { id: 'placed', text: '돌이 교차점 위에 놓였는지 보세요', at: BOARD_AT, when: placed(1) },
    ],
    concept: { term: '격자 좌표 → 로봇 좌표', def: 'x = 가로 1의 x + (가로 − 1) × 칸 간격. 칸 번호를 mm로 바꿔야 로봇이 움직일 수 있어요.', real: '창고의 선반 칸, 반도체 웨이퍼의 칩 자리도 이렇게 칸 번호를 좌표로 바꿔 찾아가요.' },
  },
  H3: {
    predict: {
      q: '로봇이 한 수를 두었고 이제 사람 차례예요. 다음 수에서 로봇이 [로봇 차례]를 기다리지 않고 바로 판 위로 가면?',
      options: ['사람 차례에 끼어들어 실패한다 (손이 있으면 멈춘다)', '아무 문제 없다'],
      answer: 0,
      why: '사람이 생각하고 두는 동안은 사람 차례예요. 그때 팔이 판 위로 오면 차례를 어긴 것이고, 손이 판 위에 있으면 안전 정지해요.',
      at: placed(1),
    },
    observe: [
      { id: 'hand', text: '[손 감지]: 사람 손이 판 위에 있어요', at: NEAR_PERSON, when: on('손 감지') },
      { id: 'turn', text: '[로봇 차례]를 기다렸다가 움직여요', at: BOARD_AT, when: on('로봇 차례') },
      { id: 'two', text: '흰 돌 2개: 수마다 차례를 기다렸어요', at: BOARD_AT, when: placed(2) },
    ],
    concept: { term: '차례 = 신호 (주고받기)', def: '사람과 로봇이 같은 판에서 일할 때, 차례 신호로 번갈아 움직이고 손이 있으면 멈춰요.', real: '사람과 함께 조립하는 협동로봇도 작업자가 버튼을 누르거나 손을 뺀 뒤에 움직여요.' },
  },
  H4: {
    predict: {
      q: '사람 돌이 한 줄로 길어지고 있어요. 로봇이 막지 않으면?',
      options: ['사람이 다섯 개를 먼저 잇는다', '로봇이 먼저 다섯 개를 잇는다'],
      answer: 0,
      why: '판을 보지 않고 빈 칸에만 두거나 내 줄만 이으면 사람의 줄을 막지 못해요.',
      at: placed(3),
    },
    observe: [
      { id: 'turn', text: '[로봇 차례]: 판 센서로 돌을 읽어요', at: BOARD_AT, when: on('로봇 차례') },
      { id: 'placed', text: '규칙으로 고른 칸에 두었어요', at: BOARD_AT, when: placed(1) },
      { id: 'over', text: '[게임 끝]: 5개가 이어졌어요', at: BOARD_AT, when: on('게임 끝') },
    ],
    concept: {
      term: '센서로 읽고 규칙으로 판단하기',
      def: '상황을 읽고(판의 돌), 정한 순서의 규칙(이기기 → 막기 → 잇기)으로 할 일을 고르는 것. 피지컬 AI의 가장 기본이에요.',
      real: '청소 로봇이 장애물을 보면 피하고, 아니면 앞으로 가는 것도 같은 방식이에요. 더 똑똑한 AI는 이 규칙을 데이터로 배워요.',
    },
  },
};

export const guideOf = (mission: string | null) => (mission ? (STEP_GUIDES[mission] ?? null) : null);

/**
 * The question to ask now, if its moment has come (the scene holds still until it is answered): the
 * first one not answered yet (`answered`, by key), and only when its moment is on.
 */
export function askNow(run: CellRun, w: WorldState, answered: (key: string) => boolean): { ask: Ask; key: string } | null {
  if (!run.mission) return null;
  const next = asksOf(run.mission).find((a) => !answered(a.key));
  return next && next.at(run, w) ? { ask: next.ask, key: next.key } : null;
}

/** Is it the moment to ask the step's (first) question? (The checks: each step's moment must come.) */
export const predictNow = (run: CellRun, w: WorldState): boolean => {
  const first = run.mission ? asksOf(run.mission)[0] : undefined;
  return !!first && first.at(run, w);
};

/** Note the step's moments as they happen (the cell time each was first seen). */
export function observe(run: CellRun, w: WorldState): void {
  const g = guideOf(run.mission);
  if (!g) return;
  for (const o of g.observe) if (run.observed[o.id] === undefined && o.when(run, w)) run.observed[o.id] = run.line.t;
}
