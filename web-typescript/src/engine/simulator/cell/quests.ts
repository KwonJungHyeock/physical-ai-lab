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
  /** A card is missing: [+ 카드] is lit too. */
  add?: boolean;
}

export const QUESTS: Record<string, Quest> = {
  F1: { todo: '▶ 시뮬레이션: 주문 한 잔이 만들어지는 과정을 말풍선으로 따라가요. 멈추면 O · X' },
  F2: { todo: '아래 [추출] 버튼을 눌러 컵에 샷을 받고, [추출 끝]이 켜질 때까지 지켜봐요' },
  F3: { todo: '아래 조그로 로봇 손끝을 장면의 고리까지 옮겨요' },
  F4: { todo: '내 메뉴를 만들고 ▶ 시뮬레이션으로 한 잔을 픽업대에 놓아요' },
  F5: { todo: "건네기를 '픽업 문으로'로 바꾸고 손님에게 건네요" },
  F6: { todo: '주문 2잔: 그대로 ▶ 시뮬레이션을 눌러 두 잔을 이어서 만들어요' },
  F7: { todo: '[+ 메뉴]로 메뉴 2를 만들고, 두 손님의 주문을 만들어요' },
  F8: { todo: '카페를 열어요(▶). 손님 10명 중 8명 이상에게 건네면 성공' },
  G1: { todo: '카드는 그대로 두고 ▶ 시뮬레이션을 눌러, 펜이 언제 닿고 언제 들리는지 봐요' },
  G2: { todo: '② 보정 카드에서 펜 높이를 0으로, 카드 위치를 매트 눈금으로 읽어 바꿔요', cards: [2] },
  G3: { todo: "③ 쓰기 카드를 펼쳐 '직선 이동으로 쓰기'를 켜요", cards: [3] },
  G4: { todo: "③ 쓰기 카드를 펼쳐 '획 사이 펜 들기'를 켜요", cards: [3] },
  H1: { todo: '카드는 그대로 두고 ▶ 시뮬레이션을 눌러, 로봇이 언제 움직이기 시작하는지 봐요' },
  H2: { todo: '① 판 카드의 칸 간격을 판 가장자리 눈금으로 재서 바꿔요', cards: [1] },
  H3: { todo: "② · ③ 한 수 카드를 펼쳐 '[로봇 차례]까지 기다리기'를 켜요", cards: [2, 3] },
  H4: { todo: '② 한 수 카드의 규칙을 바꿔 가며 돌려 보고, 한 판을 이기는 규칙을 찾아요', cards: [2] },
};

export type QuestPhase = 'do' | 'run' | 'result';

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
