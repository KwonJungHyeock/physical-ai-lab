/**
 * 퀘스트 모드 (입문 트랙 ① 생활 로봇): each step of a place is one quest — 브리핑 (the goal and the
 * prediction) → 해 보기 (one thing to do, the card to change lit) → 실행 · 관찰 → 결과 (the checklist,
 * the idea, the next quest). This file holds what the quest card says to do now, one sentence that
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
  F1: { todo: '카드는 그대로 두고 ▶ 시뮬레이션을 눌러, 로봇이 장비마다 무엇을 기다리는지 봐요' },
  F2: { todo: "카드 3 '샷 추출'의 [추출 끝]까지 기다리기를 켜요", cards: [3] },
  F3: { todo: "카드 7 뒤에 '정수기에 놓기 → 물 받기 → 정수기에서 집기'를 넣어요", cards: [7], add: true },
  F4: { todo: "맨 끝에 '픽업 문 열기 → 손님이 가져갈 때까지 기다리기 → 픽업 문 닫기'를 넣어요", cards: [12], add: true },
  G1: { todo: '카드는 그대로 두고 ▶ 시뮬레이션을 눌러, 펜이 언제 닿고 언제 들리는지 봐요' },
  G2: { todo: '카드 3 펜 높이를 0으로, 카드 2 카드 위치를 매트 눈금으로 읽어 바꿔요', cards: [2, 3] },
  G3: { todo: "카드 4 '네모 쓰기'의 직선 이동을 켜요", cards: [4] },
  G4: { todo: "카드 4 '사랑해 쓰기'의 획 사이 펜 들기를 켜요", cards: [4] },
  H1: { todo: '카드는 그대로 두고 ▶ 시뮬레이션을 눌러, 로봇이 언제 움직이기 시작하는지 봐요' },
  H2: { todo: '카드 2의 칸 간격을 판 가장자리 눈금으로 재서 바꿔요', cards: [2] },
  H3: { todo: "카드 2와 카드 5 앞에 '차례 기다리기'를 넣어요", cards: [2, 5], add: true },
  H4: { todo: '카드 3의 규칙을 바꿔 가며 돌려 보고, 한 판을 이기는 규칙을 찾아요', cards: [3] },
};

export type QuestPhase = 'brief' | 'do' | 'run' | 'result';

/** What the quest card says now, by phase (해 보기: the quest's own sentence). */
export function questNow(phase: QuestPhase, id: string, passed: boolean | null): string {
  switch (phase) {
    case 'brief':
      return '오른쪽에서 결과를 먼저 예측하고 [시작]을 눌러요';
    case 'do':
      return QUESTS[id]?.todo ?? '카드를 고치고 ▶ 시뮬레이션을 눌러요';
    case 'run':
      return '장면의 관찰 말풍선을 따라 봐요';
    case 'result':
      return passed ? '통과! 오른쪽에서 개념을 읽고 다음 퀘스트로 가요' : '✗ 항목을 보고 카드를 고쳐 다시 ▶ 시뮬레이션을 눌러요';
  }
}
