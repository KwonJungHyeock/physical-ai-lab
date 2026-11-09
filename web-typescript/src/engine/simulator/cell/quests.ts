/**
 * 퀘스트 모드 (입문 트랙 ① 생활 로봇): each step of a place is one quest — 해 보기 (one thing to do,
 * the card to change lit) → 실행 · 관찰 (the 예측 asked over the scene at the moment that decides)
 * → 결과 (the checklist, the idea, the next quest). This file holds what the quest card says to do now, one sentence that
 * ends in a verb (시뮬레이션 챕터 공통 양식 v2: '지금 할 일'), and which of the step's start cards it
 * points at (1-based, in the start recipe's order; `add`: a card has to be added with [+ 카드]).
 *
 * No React: CellHud.tsx (the quest card) and the card editors read it.
 */

export interface Quest {
  /** 해 보기: the one thing to do now. */
  todo: string;
  /** The start cards to light (1-based). */
  cards?: number[];
  /** A card is missing: [+ 카드] is lit too (and shown with the cards it adds). */
  add?: boolean;
  /** The repeat (손님 수 · 반복) is set here: shown above the cards. */
  times?: boolean;
  /** The goal in a few words (the side panel's objective line; `todo` and the hint behind its ?). */
  short: string;
}

export const QUESTS: Record<string, Quest> = {
  F1: { todo: '▶ 시뮬레이션: 주문 한 잔이 만들어지는 과정을 말풍선으로 따라가요. 멈추면 O · X', short: '▶ 눌러 주문 한 잔 지켜보기' },
  F2: { todo: '아래 [추출] 버튼을 눌러 컵에 샷을 받고, [추출 끝]이 켜질 때까지 지켜봐요', short: '[추출] 누르고 끝 신호 기다리기' },
  F3: { todo: '아래 조그로 로봇 손끝을 장면의 고리(높이 60 mm)까지 옮겨요. 아래 \'고리까지\' 세 숫자를 모두 0 가까이로', short: '손끝을 고리 안으로 · 높이 60 mm' },
  F4: { todo: '아이스 아메리카노에서 샷 · 얼음 · 물 · 이름 중 하나 이상을 바꿔 내 메뉴를 만들고, ▶ 시뮬레이션으로 한 잔을 픽업대에 놓아요', short: '메뉴 하나 바꿔 내 메뉴로 ▶' },
  F5: { todo: "건네기 블록을 '문으로 건네기'로 바꾸고 손님에게 건네요. 블록 안에 문 열기 · 기다리기 · 닫기가 묶여 있어요", short: "건네기 블록 → 문으로 ▶" },
  F6: { todo: '주문이 2잔이에요. 🔁 반복 블록의 횟수를 주문 수에 맞추고 ▶ 시뮬레이션으로 두 잔을 이어서 만들어요', short: '🔁 반복 횟수 맞추고 ▶ · 두 잔' },
  F7: { todo: '[+ 메뉴]로 메뉴 2를 만들고, 두 손님의 주문을 만들어요', short: '메뉴 2 만들고 ▶' },
  F8: { todo: '카페를 열어요(▶). 손님 10명 중 8명 이상에게 건네면 성공', short: '▶ 카페 열기 · 10명 중 8명 성공' },
  G1: { todo: '카드는 그대로 두고 ▶ 시뮬레이션을 눌러, 펜이 언제 닿고 언제 들리는지 봐요', short: '그대로 ▶ · 펜이 언제 닿나' },
  G2: { todo: '② 보정 카드에서 펜 높이를 0으로, 카드 위치를 매트 눈금으로 읽어 바꿔요', cards: [2], short: '② 펜 높이 · 카드 위치 맞추고 ▶' },
  G3: { todo: "③ 쓰기 카드를 펼쳐 '직선 이동으로 쓰기'를 켜요", cards: [3], short: "③ '직선 이동' 켜고 ▶" },
  G4: { todo: "손님이 2명이에요. 손님 수(반복)를 주문에 맞추고, ③ 쓰기 카드의 '획 사이 펜 들기'를 켜요", cards: [3], times: true, short: "손님 수 맞추고 · ③ '펜 들기' 켜고 ▶" },
  H1: { todo: '카드는 그대로 두고 ▶ 시뮬레이션을 눌러, 로봇이 언제 움직이기 시작하는지 봐요', short: '그대로 ▶ · 로봇은 언제 움직이나' },
  H2: { todo: '① 판 카드의 칸 간격을 판 가장자리 눈금으로 재서 바꿔요', cards: [1], short: '① 칸 간격 재서 고치고 ▶' },
  H3: { todo: "[+ 카드]로 한 수 카드를 하나 더 넣어 가로 6 · 세로 4로 정해요. 새 카드는 '[로봇 차례]까지 기다리기'가 꺼져 있어요", cards: [2], add: true, short: "+ 한 수 (가로 6 · 세로 4) · 차례 기다리기 ▶" },
  H4: { todo: '② 한 수 카드의 규칙 블록(이기기 · 막기 · 잇기) 순서를 바꿔 가며 돌려 보고, 9수 안에 이기는 순서를 찾아요', cards: [2], short: '② 블록 순서 바꿔 ▶ · 9수 안에 이기기' },
};

/**
 * 입문 퀘스트: the controls to press in turn (Spotlight `seq`): the screen dims for the first one when
 * the quest opens, then each is ringed until pressed. The panel's controls carry `data-lead`; ▶ is the
 * run bar's. 퀘스트 3 (the jog) leads from the arm instead (lifeTutorials ringLead).
 */
const RUN = { sel: '[data-panel="run"] [aria-label="시뮬레이션"]', say: '▶ 눌러 확인해요' };
const CARD = (say: string) => ({ sel: 'aside li[data-glow]', say });

export const QUEST_LEAD: Record<string, readonly { sel: string; say: string }[]> = {
  F1: [{ ...RUN, say: '▶ 눌러 시작해요' }],
  F2: [{ sel: '[data-lead="press"]', say: '[추출]을 눌러요' }],
  F4: [{ sel: '[data-lead="menu"]', say: '메뉴를 골라 바꿔요' }, RUN],
  F5: [{ sel: '[data-lead="door"]', say: "건네기 블록을 '문으로 건네기'로 바꿔요" }, RUN],
  F6: [{ sel: '[data-lead="repeat"]', say: '🔁 반복 블록을 주문 수(2)에 맞춰요' }, RUN],
  F7: [{ sel: '[data-lead="add"]', say: '[+ 메뉴]로 메뉴 2를 만들어요' }, RUN],
  F8: [{ ...RUN, say: '▶ 눌러 카페를 열어요' }],
  G1: [{ ...RUN, say: '그대로 ▶ 눌러요' }],
  G2: [CARD('② 보정 카드를 고쳐요'), RUN],
  G3: [CARD("③ '직선 이동'을 켜요"), RUN],
  G4: [{ sel: '[data-lead="times"]', say: '손님 수를 주문(2명)에 맞춰요' }, CARD("③ '획 사이 펜 들기'를 켜요"), RUN],
  H1: [{ ...RUN, say: '그대로 ▶ 눌러요' }],
  H2: [CARD('① 칸 간격을 고쳐요'), RUN],
  H3: [{ sel: '[data-lead="add-card"]', say: '[+ 카드]로 한 수를 하나 더 넣어요' }, RUN],
  H4: [CARD('② 블록 순서를 바꿔요'), RUN],
};

export type QuestPhase = 'do' | 'run' | 'result';

/** The side panel's objective line, by phase: the few words (the quest's `short`, the run, the result). */
export function questShort(phase: QuestPhase, id: string, passed: boolean | null): string {
  switch (phase) {
    case 'do':
      return QUESTS[id]?.short ?? '카드 고치고 ▶';
    case 'run':
      return '말풍선 따라 보기 · 멈추면 예측';
    case 'result':
      return passed ? '통과! 개념 읽고 다음 퀘스트로' : '✗ 항목 보고 고쳐서 다시 ▶';
  }
}

/** What the quest card says now, by phase (해 보기: the quest's own sentence). */
export function questNow(phase: QuestPhase, id: string, passed: boolean | null): string {
  switch (phase) {
    case 'do':
      return QUESTS[id]?.todo ?? '카드를 고치고 ▶ 시뮬레이션을 눌러요';
    case 'run':
      return '장면의 관찰 말풍선을 따라 보고, 장면이 멈추면 예측을 골라요';
    case 'result':
      return passed ? '통과! 아래에서 개념을 읽고 [다음 퀘스트]로 가요' : '✗ 항목을 보고 카드를 고쳐 다시 ▶ 시뮬레이션을 눌러요';
  }
}
