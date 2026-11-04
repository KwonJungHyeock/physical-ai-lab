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

export interface Observation {
  id: string;
  /** What to see, one line (shown on the card and in the bubble). */
  text: string;
  /** Where the bubble stands, robot mm. */
  at: [number, number, number];
  /** Is it happening now? */
  when(run: CellRun, w: WorldState): boolean;
}

export interface StepGuide {
  predict: { q: string; options: string[]; answer: number; why: string };
  observe: Observation[];
  concept: { term: string; def: string; real: string };
}

const on = (name: string) => (run: CellRun) => !!run.line.in[name];
const out = (name: string) => (run: CellRun) => !!run.line.out[name];
const served = (n: number) => (run: CellRun) => (run.cafe?.served.filter((d) => d.ok).length ?? 0) >= n;
const cardsDone = (n: number) => (run: CellRun) => (run.draw?.done.length ?? 0) >= n;
/** The pen tip on the paper (the trail grows). */
const inking = (_run: CellRun, w: WorldState) => w.penDown;
/** The pen up between two strokes (off the paper, at travel height), after some ink. */
const lifted = (run: CellRun, w: WorldState) => !w.penDown && w.trail.some((s) => s.length > 2) && !!run.line.in['카드 있음'];

const A = CAFE_AT;
const CUP: [number, number, number] = [A.cup.x, A.cup.y, 120];
const ICE: [number, number, number] = [A.ice.x, A.ice.y, 110];
const COFFEE: [number, number, number] = [A.coffee.x, A.coffee.y, 110];
const WATER: [number, number, number] = [A.water.x, A.water.y, 100];
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
  /* --- F: 로봇 카페 --- */
  F1: {
    predict: {
      q: '로봇이 커피 머신 앞에서 가장 오래 기다리는 까닭은?',
      options: ['컵이 무거워서', '에스프레소 추출(28초)이 끝나길 기다려서', '손님 주문을 기다려서'],
      answer: 1,
      why: '커피 머신이 [추출 끝] 신호를 보낼 때까지 로봇은 다음 동작을 하지 않아요.',
    },
    observe: [
      { id: 'cup', text: '[컵 준비됨] 켜짐: 컵이 내려왔어요', at: CUP, when: on('컵 준비됨') },
      { id: 'shot', text: '[추출 중] 28초: 로봇은 기다려요', at: COFFEE, when: on('추출 중') },
      { id: 'hand', text: '[손 감지]: 손님 손이 있는 동안 팔은 밖에', at: PICKUP, when: on('손 감지') },
    ],
    concept: { term: '작업 순서 (레시피)', def: '어느 장비를 어떤 순서로 돌고, 장비마다 어떤 신호를 기다릴지 정한 것이에요.', real: '실제 로봇 카페도 주문이 들어오면 정해진 레시피대로 컵 → 얼음 → 샷 → 물 → 픽업 순서로 돌아요.' },
  },
  F2: {
    predict: { q: '[추출 끝]을 기다리지 않고 컵을 빼면?', options: ['커피가 더 빨리 완성된다', '남은 커피가 받침대로 쏟아진다', '아무 일도 없다'], answer: 1, why: '추출은 28초 동안 계속돼요. 컵이 빠지면 남은 커피는 받침대로 떨어져요.' },
    observe: [
      { id: 'cup', text: '[컵 준비됨] 켜짐: 이제 집어도 돼요', at: CUP, when: on('컵 준비됨') },
      { id: 'shot', text: '[추출 중]: 28초 동안 커피가 나와요', at: COFFEE, when: on('추출 중') },
      { id: 'done', text: '[추출 끝] 켜짐: 이제 컵을 빼도 돼요', at: COFFEE, when: on('추출 끝') },
    ],
    concept: { term: '인터록 (신호 기다리기)', def: '앞 장비가 "끝났어요" 신호를 보내야 다음 동작을 하도록 묶어 두는 것이에요.', real: '공장 로봇도 기계의 완료 신호를 받고 나서 문을 열고 부품을 꺼내요.' },
  },
  F3: {
    predict: { q: '얼음 → 샷 → 물 순서로 넣는 까닭은?', options: ['뜨거운 샷이 얼음에 바로 식어서', '물이 가장 무거워서', '순서는 상관없어서'], answer: 0, why: '얼음을 먼저 넣으면 뜨거운 에스프레소가 바로 식고, 물로 농도를 맞춰요.' },
    observe: [
      { id: 'ice', text: '[얼음 나오는 중]: 얼음 145 ml', at: ICE, when: on('얼음 나오는 중') },
      { id: 'shot', text: '[추출 중]: 2샷 60 ml', at: COFFEE, when: on('추출 중') },
      { id: 'water', text: '[물 나오는 중]: 물 150 ml', at: WATER, when: on('물 나오는 중') },
    ],
    concept: { term: '레시피 = 순서 + 양', def: '무엇을, 어떤 순서로, 얼마나 넣을지 정해 두면 누가 만들어도 같은 맛이 나요.', real: '톨 아이스 아메리카노(355 ml 컵): 얼음 145 · 샷 60 · 물 150 ml. 한 번 더 누르면 넘쳐요.' },
  },
  F4: {
    predict: {
      q: '손님이 음료를 가져가는 동안 로봇 팔은 어디에 있어야 할까요?',
      options: ['픽업대 안에서 컵을 잡고', '픽업대 밖 (기본 자세)', '문 바로 앞'],
      answer: 1,
      why: '문이 열린 동안 사람과 로봇이 같은 곳에 있으면 안 돼요. 팔은 빼고 기다려요.',
    },
    observe: [
      { id: 'open', text: '[문 열림]: 손님 쪽 문이 열렸어요', at: PICKUP, when: on('문 열림') },
      { id: 'hand', text: '[손 감지]: 손님이 가져가는 중', at: PICKUP, when: on('손 감지') },
      { id: 'closed', text: '[문 닫힘] 뒤에 다시 움직여요', at: PICKUP, when: (r) => served(1)(r) && on('문 닫힘')(r) },
    ],
    concept: {
      term: '안전문 (협동 작업 영역 나누기)',
      def: '사람과 로봇이 같은 곳에 동시에 있지 않도록 문과 센서로 나누는 것이에요.',
      real: '협동로봇 안전 규칙도 같아요. 사람이 가까이 오면 로봇은 멈추거나 느려져요. 로봇 카페의 픽업 문도 같은 원리예요.',
    },
  },

  /* --- G: 로봇 캘리그라피 --- */
  G1: {
    predict: { q: '한 획을 다 쓰고 다음 획으로 옮길 때 펜은?', options: ['종이에 닿은 채로 간다', '조금 들어 올려서 간다', '꽂이에 꽂고 간다'], answer: 1, why: '펜을 들어야 옮기는 길이 선으로 남지 않아요.' },
    observe: [
      { id: 'card', text: '[카드 있음]: 손님이 카드를 놓았어요', at: CARD, when: on('카드 있음') },
      { id: 'ink', text: '펜 끝이 종이에 닿으면 선이 나와요', at: CARD, when: inking },
      { id: 'lamp', text: '[완성 램프]: 손님이 카드를 가져가요', at: LAMP, when: out('완성 램프') },
    ],
    concept: { term: '작업 흐름 (한 사이클)', def: '카드 받기 → 쓰기 → 완성 알리기가 한 사이클이에요. 손님마다 같은 사이클을 반복해요.', real: '행사장 그림 · 글씨 로봇 부스는 한 장에 평균 40초쯤 걸려요.' },
  },
  G2: {
    predict: {
      q: '카드가 다른 자리에 놓였는데 로봇에게 알려 주지 않으면?',
      options: ['로봇이 알아서 카드를 찾는다', '글씨가 그만큼 비켜서 써진다', '로봇이 쓰지 않는다'],
      answer: 1,
      why: '로봇은 카드를 보지 못해요. 알려 준 기준점(원점)과 높이에 맞춰 그대로 써요.',
    },
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
    predict: { q: '관절 이동으로 네모를 그리면?', options: ['변이 곧다', '변이 휜다', '더 빨라서 더 곧다'], answer: 1, why: '관절 이동은 모든 관절이 한꺼번에 돌아서 펜 끝이 곡선으로 가요.' },
    observe: [
      { id: 'ink', text: '펜 끝이 가는 길 = 선', at: CARD, when: inking },
      { id: 'lamp', text: '[완성 램프]: 변이 곧은지 보세요', at: LAMP, when: out('완성 램프') },
    ],
    concept: { term: '직선 이동 vs 관절 이동', def: '직선 이동은 펜 끝이 곧게 가고, 관절 이동은 관절이 한꺼번에 돌아서 끝이 휘어 가요.', real: '접착제를 바르는 공장 로봇도 직선 이동으로 곧고 고른 선을 그어요.' },
  },
  G4: {
    predict: { q: '펜을 내린 채 다음 획의 시작점으로 가면?', options: ['글자 사이에 줄이 생긴다', '글씨가 굵어진다', '아무 일도 없다'], answer: 0, why: '펜이 닿은 채 움직인 길은 모두 선이 돼요.' },
    observe: [
      { id: 'ink', text: '그리기 이동: 펜이 닿아 있어요', at: CARD, when: inking },
      { id: 'up', text: '빈 이동: 펜을 들고 옮겨요', at: CARD, when: lifted },
      { id: 'two', text: '2장 완성: 줄 끝', at: LAMP, when: cardsDone(2) },
    ],
    concept: { term: '그리기 이동과 빈 이동', def: '일하는 구간(펜이 닿음)과 옮기는 구간(펜을 듦)을 나눠 움직이는 것이에요.', real: '용접 · 도포 로봇도 작업 구간에서만 토치 · 노즐을 켜고, 옮길 때는 끄고 들어 올려요.' },
  },

  /* --- H: 보드게임 로봇 --- */
  H1: {
    predict: { q: '로봇은 언제 판 위로 움직이기 시작할까요?', options: ['프로그램을 켜자마자', '사람이 돌을 두고 손을 뺀 뒤', '사람이 손을 뻗을 때'], answer: 1, why: '[로봇 차례] 신호가 켜져야 움직여요. 사람이 손을 뺀 뒤에 켜져요.' },
    observe: [
      { id: 'hand', text: '[손 감지]: 사람이 돌을 두는 중', at: NEAR_PERSON, when: on('손 감지') },
      { id: 'turn', text: '[로봇 차례] 켜짐: 이제 움직여요', at: BOARD_AT, when: on('로봇 차례') },
      { id: 'held', text: '흡착 펌프가 흰 돌을 들었어요', at: TRAY_AT, when: held },
    ],
    concept: { term: '한 수의 흐름', def: '차례 기다리기 → 돌 집기 → 칸으로 옮겨 내려놓기 → 기본 자세. 한 수마다 같은 흐름을 반복해요.', real: '체스 · 바둑을 두는 로봇도 사람의 수를 확인한 뒤 같은 흐름으로 말을 옮겨요.' },
  },
  H2: {
    predict: {
      q: '칸 간격을 16 mm 대신 15 mm로 알려 주면 가로 7 · 세로 6의 돌은?',
      options: ['정확히 그 교차점에 놓인다', '가로 1 쪽으로 몇 mm 벗어난다', '판 밖으로 떨어진다'],
      answer: 1,
      why: '칸마다 1 mm씩 모자라서 가로로 6 mm, 세로로 5 mm 벗어나요.',
    },
    observe: [
      { id: 'held', text: '흰 돌을 들고 계산한 좌표로 가요', at: TRAY_AT, when: held },
      { id: 'placed', text: '돌이 교차점 위에 놓였는지 보세요', at: BOARD_AT, when: placed(1) },
    ],
    concept: { term: '격자 좌표 → 로봇 좌표', def: 'x = 가로 1의 x + (가로 − 1) × 칸 간격. 칸 번호를 mm로 바꿔야 로봇이 움직일 수 있어요.', real: '창고의 선반 칸, 반도체 웨이퍼의 칩 자리도 이렇게 칸 번호를 좌표로 바꿔 찾아가요.' },
  },
  H3: {
    predict: { q: '차례를 기다리지 않고 바로 판 위로 가면?', options: ['더 빨리 두어서 좋다', '사람 손과 겹쳐 로봇이 멈춘다', '사람이 기다려 준다'], answer: 1, why: '사람 손이 판 위에 있는 동안 팔이 오면 안전 정지해요.' },
    observe: [
      { id: 'hand', text: '[손 감지]: 사람 손이 판 위에 있어요', at: NEAR_PERSON, when: on('손 감지') },
      { id: 'turn', text: '[로봇 차례]를 기다렸다가 움직여요', at: BOARD_AT, when: on('로봇 차례') },
      { id: 'two', text: '흰 돌 2개: 수마다 차례를 기다렸어요', at: BOARD_AT, when: placed(2) },
    ],
    concept: { term: '차례 = 신호 (주고받기)', def: '사람과 로봇이 같은 판에서 일할 때, 차례 신호로 번갈아 움직이고 손이 있으면 멈춰요.', real: '사람과 함께 조립하는 협동로봇도 작업자가 버튼을 누르거나 손을 뺀 뒤에 움직여요.' },
  },
  H4: {
    predict: { q: "규칙이 '빈 칸 차례대로'면 누가 이길까요?", options: ['로봇', '사람', '비긴다'], answer: 1, why: '판을 보지 않고 빈 칸에만 두면 사람의 줄을 막지 못해요.' },
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

/** Note the step's moments as they happen (the cell time each was first seen). */
export function observe(run: CellRun, w: WorldState): void {
  const g = guideOf(run.mission);
  if (!g) return;
  for (const o of g.observe) if (run.observed[o.id] === undefined && o.when(run, w)) run.observed[o.id] = run.line.t;
}
