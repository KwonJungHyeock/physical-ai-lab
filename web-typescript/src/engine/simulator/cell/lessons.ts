/**
 * 수업 설계 (입문 트랙 ① 생활 로봇 · 로봇 카페 · 캘리그라피 · 보드게임, 교실 수업형): one source for
 * the app and the 교안s (one a place).
 *
 *  - PLANS_OF: each place's quests grouped into 차시 by the plan the teacher picks (⚙ 교사 열쇠): the
 *    café's 8 into 4, 6 or 8 차시, the four of 캘리그라피 · 보드게임 into 2, 3 or 4.
 *  - LESSON_QUEST: per quest, what is learned (one sentence, 학습 목표), the idea it names (개념 ·
 *    실제 현장, on the pass card), its pages in the 교안 (fixed, whatever the plan) and three 확인
 *    문제 (객관식, auto-graded: the 수행평가 element, kept in the 학습 기록).
 *  - checksOf(lesson): the three questions asked at the end of a 차시 (from its quests, in turn).
 *  - levelOf: the 3단계 기준 (잘함 · 보통 · 노력) from quests passed and 확인 점수.
 *
 * The 교안 (manuals/course, built from this file) prints the same page numbers the app shows
 * ('교안 6쪽'), so the two media keep to one order. No React.
 */

import { STEP_GUIDES } from './guides';

export type PlanSize = 4 | 6 | 8;
export const PLAN_SIZES: readonly PlanSize[] = [4, 6, 8];

/** The three 생활 로봇 places, in course order (로봇 카페 → 캘리그라피 → 보드게임); each has its own 교안. */
export type SiteId = 'cafe' | 'draw' | 'board';
export const SITES: readonly SiteId[] = ['cafe', 'draw', 'board'];
export const SITE_NAME: Record<SiteId, string> = { cafe: '로봇 카페', draw: '로봇 캘리그라피', board: '보드게임 로봇' };
export const SITE_QUESTS: Record<SiteId, readonly string[]> = {
  cafe: ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8'],
  draw: ['G1', 'G2', 'G3', 'G4'],
  board: ['H1', 'H2', 'H3', 'H4'],
};
export const siteOf = (quest: string): SiteId | null => SITES.find((s) => SITE_QUESTS[s].includes(quest)) ?? null;

export interface Choice {
  q: string;
  options: readonly string[];
  answer: number;
  /** Why (shown after answering, and in the 교안's 정답 쪽). */
  why: string;
}

export interface LessonQuest {
  /** 학습 목표: what this quest teaches, one sentence (the 차시's '오늘 배울 것'). */
  learn: string;
  /** The idea, named after the quest (pass card · 교안). */
  concept: { term: string; def: string; real: string };
  /** Its pages in the 교안 (설명 쪽, 수행 쪽). */
  pages: readonly [number, number];
  /** Three 확인 문제. */
  checks: readonly [Choice, Choice, Choice];
}

/** The 로봇 카페 교안's fixed pages besides the quests'. */
export const GUIDE_PAGES = { cover: 1, plan: 2, screen: 3, answers: 20, rubric: 21, results: 22 } as const;

/** A place's 교안: cover · 수업 안내 · 화면, two pages a quest, then 정답 · 평가 기준 · 반 결과. */
export function guidePagesOf(site: SiteId) {
  const end = 3 + SITE_QUESTS[site].length * 2;
  return { cover: 1, plan: 2, screen: 3, answers: end + 1, rubric: end + 2, results: end + 3 };
}

/** The concept of a 캘리그라피 · 보드게임 step, as its scene guide names it (guides.ts). */
const conceptOf = (id: string) => STEP_GUIDES[id].concept!;

const P = (n: number): readonly [number, number] => [4 + (n - 1) * 2, 5 + (n - 1) * 2];

export const LESSON_QUEST: Record<string, LessonQuest> = {
  F1: {
    learn: '로봇 카페가 음료 한 잔을 만드는 순서와, 로봇이 장비의 신호를 보고 움직인다는 것을 알아요.',
    concept: {
      term: '작업 순서와 신호',
      def: '로봇은 정해진 순서(컵 → 얼음 → 샷 → 물 → 건네기)대로 일하고, 장비가 보내는 신호를 확인한 뒤 다음 동작을 해요.',
      real: '실제 로봇 카페도 주문 · 컵 · 얼음 · 커피 · 건네기 순서로 움직이고, 장비마다 끝났다는 신호를 받아요.',
    },
    pages: P(1),
    checks: [
      { q: '아이스 아메리카노를 만드는 순서로 알맞은 것은?', options: ['얼음 → 컵 → 샷 → 물', '컵 → 얼음 → 샷 → 물', '샷 → 컵 → 물 → 얼음'], answer: 1, why: '컵을 먼저 꺼내야 얼음 · 샷 · 물을 받을 수 있어요.' },
      { q: '로봇이 컵을 집으러 가는 때는?', options: ['[컵 준비됨] 신호가 켜진 뒤', '주문이 들어오자마자', '아무 때나'], answer: 0, why: '컵 디스펜서가 컵이 나왔다고 알려 준 뒤에 집어요.' },
      { q: '손님이 음료를 가져가는 동안 로봇 팔은?', options: ['픽업대 안에서 기다린다', '픽업대 밖에서 기다린다', '다음 컵을 놓는다'], answer: 1, why: '문이 열린 동안 팔은 밖에 있어야 손님 손과 부딪히지 않아요.' },
    ],
  },
  F2: {
    learn: '장비는 버튼(입력)을 받으면 일을 하고, 끝나면 신호(출력)를 보낸다는 것을 알아요.',
    concept: {
      term: '입력 신호와 출력 신호',
      def: '로봇이 장비에 보내는 신호(추출 시작)가 입력, 장비가 로봇에 보내는 신호(추출 중 · 추출 끝)가 출력이에요. 로봇은 출력을 보고 기다릴지 움직일지 정해요.',
      real: '공장의 기계도 시작 버튼을 받으면 일하고, 끝나면 완료 램프와 신호로 로봇에게 알려요.',
    },
    pages: P(2),
    checks: [
      { q: '[추출]을 누른 뒤 [추출 끝]이 켜질 때까지 걸린 시간은?', options: ['약 3초', '약 28초', '약 3분'], answer: 1, why: '커피 머신이 샷을 내리는 데 28초쯤 걸려요.' },
      { q: '[추출 중]이 켜져 있을 때 로봇이 해야 할 일은?', options: ['컵을 바로 뺀다', '[추출 끝]을 기다린다', '물을 붓는다'], answer: 1, why: '추출 중에 컵을 빼면 남은 커피가 받침대로 쏟아져요.' },
      { q: '[추출 끝]은 누가 누구에게 보내는 신호일까요?', options: ['로봇 → 커피 머신', '커피 머신 → 로봇', '손님 → 로봇'], answer: 1, why: '장비가 일이 끝났다고 로봇에게 알려 주는 출력 신호예요.' },
    ],
  },
  F3: {
    learn: '조그로 로봇 손끝을 원하는 자리(X · Y · Z)에 옮기고, 그 자리를 로봇에게 가르칠 수 있다는 것을 알아요.',
    concept: {
      term: '좌표와 티칭',
      def: '로봇 손끝의 자리는 X(앞뒤) · Y(좌우) · Z(높이) 세 숫자(mm)로 나타내요. 사람이 조그로 옮겨 알려 주는 것을 티칭이라고 해요.',
      real: '공장에서도 작업자가 조그로 로봇을 옮겨 집는 자리 · 놓는 자리를 하나씩 가르쳐 둬요.',
    },
    pages: P(3),
    checks: [
      { q: '로봇 손끝의 높이를 바꾸는 축은?', options: ['X', 'Y', 'Z'], answer: 2, why: 'Z는 위(+) · 아래(−) 높이예요.' },
      { q: '조그 한 번에 10 mm씩 움직이게 했어요. 30 mm 옮기려면 몇 번 눌러야 할까요?', options: ['1번', '3번', '30번'], answer: 1, why: '10 mm × 3번 = 30 mm예요.' },
      { q: '사람이 로봇을 옮겨 자리를 알려 주는 것을 무엇이라고 할까요?', options: ['티칭', '추출', '보정'], answer: 0, why: '가르친다(teach)는 뜻이에요. 로봇은 가르친 자리를 그대로 반복해요.' },
    ],
  },
  F4: {
    learn: '메뉴(레시피)는 재료의 순서와 양으로 정해지고, 로봇은 레시피대로 장비를 움직인다는 것을 알아요.',
    concept: {
      term: '레시피 = 순서 + 양',
      def: '같은 장비로도 샷 수 · 얼음 · 물의 양과 순서를 바꾸면 다른 음료가 돼요. 로봇은 레시피에 적힌 대로 장비마다 기다리며 받아요.',
      real: '로봇 카페의 메뉴판은 레시피 목록이에요. 새 메뉴는 로봇을 다시 만들지 않고 레시피만 더해 만들어요.',
    },
    pages: P(4),
    checks: [
      { q: '아이스 아메리카노와 따뜻한 아메리카노를 다르게 만드는 것은?', options: ['로봇 팔', '레시피(얼음 · 물의 종류와 양)', '컵 디스펜서'], answer: 1, why: '장비는 같고 레시피가 달라요.' },
      { q: '샷 1개는 30 ml예요. 레시피의 샷을 2개로 하면 커피는 몇 ml일까요?', options: ['30 ml', '60 ml', '90 ml'], answer: 1, why: '30 ml × 2 = 60 ml. 양을 바꾸면 맛이 바뀌어요.' },
      { q: '장비가 붓는 동안 기다리는 방법으로 더 안전한 것은?', options: ['정해 둔 초만큼', '장비의 끝 신호까지'], answer: 1, why: '붓는 시간이 바뀌어도 끝 신호를 기다리면 쏟아지지 않아요.' },
    ],
  },
  F5: {
    learn: '사람과 로봇이 같은 곳을 쓸 때 문 · 센서로 자리를 나누어 안전하게 건넨다는 것을 알아요.',
    concept: {
      term: '안전문 (자리 나누기)',
      def: '로봇은 음료를 놓고 팔을 뺀 뒤 문을 열어요. 문이 열린 동안이나 손 감지 센서가 켜진 동안에는 팔이 픽업대에 들어가지 않아요.',
      real: '협동로봇 작업장은 문 · 레이저 센서 · 매트 스위치로 사람이 들어오면 로봇이 멈추게 해요.',
    },
    pages: P(5),
    checks: [
      { q: '픽업 문을 열기 전에 로봇이 먼저 해야 할 일은?', options: ['음료를 놓고 팔을 뺀다', '다음 컵을 꺼낸다', '문을 닫는다'], answer: 0, why: '팔이 밖에 있어야 손님 손과 부딪히지 않아요.' },
      { q: '[손 감지]가 켜져 있으면 로봇은?', options: ['계속 움직인다', '픽업대로 가지 않고 기다린다'], answer: 1, why: '손님 손이 있는 동안 팔은 움직이지 않아요.' },
      { q: '손님이 음료를 가져간 뒤 로봇이 할 일은?', options: ['문을 닫는다', '문을 연 채 둔다'], answer: 0, why: '문을 닫아야 다음 음료를 놓을 수 있어요.' },
    ],
  },
  F6: {
    learn: '같은 동작을 주문마다 되풀이하는 반복과, 다음 일을 시작하는 조건을 알아요.',
    concept: {
      term: '반복과 조건',
      def: '주문이 2잔이면 같은 순서를 두 번 반복해요. 픽업대가 비었을 때만 다음 잔을 놓는 것처럼, 반복 사이에는 조건이 있어요.',
      real: '공장 로봇은 같은 일을 하루 수천 번 반복하고, 다음 칸이 비었다는 센서 신호를 보고 다음 물건을 놓아요.',
    },
    pages: P(6),
    checks: [
      { q: '주문 2잔을 만들 때 로봇이 하는 일은?', options: ['같은 순서를 2번 반복', '한 컵에 두 잔을 담기'], answer: 0, why: '주문마다 같은 레시피를 되풀이해요.' },
      { q: '첫 잔이 아직 픽업대에 있어요. 둘째 잔은?', options: ['그 위에 놓는다', '손님이 가져갈 때까지 기다린다'], answer: 1, why: '픽업대가 비었다는 조건이 맞아야 다음 잔을 놓아요.' },
      { q: '두 잔을 만들면 한 잔보다 시간이 어떻게 될까요?', options: ['거의 같다', '약 2배', '절반'], answer: 1, why: '같은 순서를 두 번 하니 시간도 두 배쯤 걸려요.' },
    ],
  },
  F7: {
    learn: '로봇은 주문 신호(메뉴 번호)를 읽고, 그 번호의 레시피를 골라 만든다는 것을 알아요.',
    concept: {
      term: '주문 신호로 고르기 (분기)',
      def: '키오스크가 보낸 메뉴 번호에 따라 로봇은 메뉴 1 또는 메뉴 2의 레시피를 골라요. 신호에 따라 다른 일을 하는 것을 분기라고 해요.',
      real: '배달 로봇 · 물류 로봇도 주문 번호와 목적지 신호를 읽고 갈 길과 할 일을 골라요.',
    },
    pages: P(7),
    checks: [
      { q: '로봇은 어느 메뉴를 만들지 무엇을 보고 정할까요?', options: ['주문의 메뉴 번호', '손님 얼굴', '아무거나'], answer: 0, why: '키오스크가 보내는 주문 번호 신호를 읽어요.' },
      { q: '첫 손님은 메뉴 1, 둘째 손님은 메뉴 2를 주문했어요. 로봇이 만드는 차례는?', options: ['메뉴 1 → 메뉴 2', '메뉴 2 → 메뉴 1'], answer: 0, why: '주문이 들어온 차례대로, 주문마다 그 번호의 레시피로 만들어요.' },
      { q: '신호에 따라 다른 일을 하는 것을 무엇이라고 할까요?', options: ['반복', '분기', '보정'], answer: 1, why: '길이 나뉜다는 뜻이에요.' },
    ],
  },
  F8: {
    learn: '손님이 계속 오는 카페에서 한 잔에 걸리는 시간이 성공률을 정한다는 것(처리 속도)을 알아요.',
    concept: {
      term: '처리 속도와 기다림',
      def: '손님은 오래 기다리면 돌아가요. 한 잔에 걸리는 시간을 줄이면(끝 신호에 맞춰 기다리기) 더 많은 손님에게 건넬 수 있어요.',
      real: '매장 · 공장은 한 시간에 몇 개를 만드는지(시간당 처리량)로 로봇 공정을 평가해요.',
    },
    pages: P(8),
    checks: [
      { q: '손님이 돌아가는 까닭은?', options: ['너무 오래 기다려서', '음료가 너무 빨리 나와서'], answer: 0, why: '기다릴 수 있는 시간을 넘기면 돌아가요.' },
      { q: '더 많은 손님에게 건네려면?', options: ['한 잔 시간을 줄인다', '레시피 양을 늘린다'], answer: 0, why: '한 잔이 빨라야 줄이 짧아져요.' },
      { q: "운영 현황의 '시간당 잔'이 뜻하는 것은?", options: ['한 시간에 건넬 수 있는 잔 수', '손님이 기다린 시간'], answer: 0, why: '처리 속도를 한 시간 기준으로 나타낸 값이에요.' },
    ],
  },
  G1: {
    learn: '캘리그라피 로봇이 카드 받기 → 쓰기 → 완성 알리기를 한 사이클로, 손님마다 반복한다는 것을 알아요.',
    concept: conceptOf('G1'),
    pages: P(1),
    checks: [
      { q: '한 획을 다 썼어요. 다음 획으로 옮길 때 펜은?', options: ['종이에 닿은 채로 간다', '조금 들어 올려서 간다'], answer: 1, why: '펜을 들어야 옮기는 길이 선으로 남지 않아요.' },
      { q: '로봇이 쓰기를 시작하는 때는?', options: ['[카드 있음] 신호가 켜진 뒤', '전원을 켜자마자'], answer: 0, why: '손님이 카드를 매트에 놓았다는 신호를 받고 시작해요.' },
      { q: '다 쓰면 로봇은 손님에게 어떻게 알리나요?', options: ['완성 램프를 켠다', '카드를 손님에게 던진다'], answer: 0, why: '[완성 램프]가 켜지면 손님이 카드를 가져가요.' },
    ],
  },
  G2: {
    learn: '펜이 닿는 높이와 카드의 기준점을 로봇 좌표로 알려 주는 보정을 알아요.',
    concept: conceptOf('G2'),
    pages: P(2),
    checks: [
      { q: '펜 끝이 종이에 닿아 선이 나오려면 펜 높이는?', options: ['0 mm', '3 mm'], answer: 0, why: '종이 높이가 0 mm예요. 3 mm면 펜이 떠서 선이 안 나와요.' },
      { q: '카드 위치는 카드의 어디를 기준으로 알려 주나요?', options: ['왼쪽 아래 모서리', '가운데'], answer: 0, why: '기준점(원점)은 카드 왼쪽 아래 모서리예요. 매트 눈금으로 읽어요.' },
      { q: '카드를 다른 자리에 놓고 로봇에게 알려 주지 않으면?', options: ['로봇이 알아서 카드를 찾는다', '글씨가 그만큼 비켜서 써진다'], answer: 1, why: '로봇은 카드를 보지 못해요. 알려 준 자리에 그대로 써요.' },
    ],
  },
  G3: {
    learn: '직선 이동은 펜 끝이 곧게 가고, 관절 이동은 관절이 한꺼번에 돌아 휘어 간다는 것을 알아요.',
    concept: conceptOf('G3'),
    pages: P(3),
    checks: [
      { q: '네모를 관절 이동으로 그리면 네 변은?', options: ['곧게 그려진다', '휘어진다'], answer: 1, why: '관절이 한꺼번에 돌아서 펜 끝이 곡선으로 가요.' },
      { q: '이 퀘스트에서 변이 곧다고 보는 기준은?', options: ['선에서 1 mm 안', '선에서 10 mm 안'], answer: 0, why: "통과 조건이 '선에서 1 mm 안'이에요." },
      { q: '직선 이동을 쓰는 공장 일은?', options: ['접착제 · 실링 바르기', '상자를 아무 데나 쌓기'], answer: 0, why: '곧고 고른 선이 필요한 일에 직선 이동을 써요.' },
    ],
  },
  G4: {
    learn: '일하는 구간(그리기 이동)과 옮기는 구간(빈 이동)을 나눠 움직인다는 것을 알아요.',
    concept: conceptOf('G4'),
    pages: P(4),
    checks: [
      { q: '펜을 내린 채 다음 획의 시작점으로 가면?', options: ['글자 사이에 줄이 생긴다', '아무 일도 없다'], answer: 0, why: '펜이 닿은 채 움직인 길은 모두 선이 돼요.' },
      { q: "'빈 이동'은 무엇일까요?", options: ['펜을 들고 옮기는 것', '펜을 대고 그리는 것'], answer: 0, why: '일하지 않는 구간이라 펜(공구)을 들어요.' },
      { q: '손님 2명에게 카드를 쓰려면?', options: ['같은 사이클을 두 번 반복', '카드 한 장에 두 번 쓰기'], answer: 0, why: '손님마다 카드 받기 → 쓰기 → 완성 알리기를 반복해요.' },
    ],
  },
  H1: {
    learn: '보드게임 로봇이 한 수마다 차례 기다리기 → 돌 집기 → 칸에 놓기 → 기본 자세를 반복한다는 것을 알아요.',
    concept: conceptOf('H1'),
    pages: P(1),
    checks: [
      { q: '로봇이 움직이기 시작하는 때는?', options: ['사람이 돌을 두는 중', '사람이 손을 뺀 뒤 [로봇 차례]가 켜지면'], answer: 1, why: '[로봇 차례] 신호가 켜져야 움직여요.' },
      { q: '로봇은 흰 돌을 무엇으로 집나요?', options: ['흡착 펌프', '집게 손가락'], answer: 0, why: '흡착 펌프로 돌을 빨아들여 하나씩 집어요.' },
      { q: '한 수가 끝나면 로봇 팔은?', options: ['기본 자세로 돌아간다', '판 위에 그대로 머문다'], answer: 0, why: '사람이 둘 자리를 비켜 주려고 기본 자세로 돌아가요.' },
    ],
  },
  H2: {
    learn: '칸 번호(가로 · 세로)를 칸 간격으로 계산해 로봇 좌표(mm)로 바꾼다는 것을 알아요.',
    concept: conceptOf('H2'),
    pages: P(2),
    checks: [
      { q: '이 오목판의 줄 사이 간격은?', options: ['15 mm', '16 mm'], answer: 1, why: '판 가장자리 눈금에서 가로 1 줄(x 136)과 가로 2 줄(x 152)의 차이예요.' },
      { q: '가로 1 줄이 x 136 mm예요. 가로 3 줄의 x는?', options: ['152 mm', '168 mm', '184 mm'], answer: 1, why: 'x = 136 + (3 − 1) × 16 = 168 mm.' },
      { q: '칸 간격을 1 mm 작게 알려 주면 돌은?', options: ['먼 칸일수록 더 많이 벗어난다', '모든 돌이 똑같이 1 mm 벗어난다'], answer: 0, why: '칸마다 1 mm씩 모자라서 멀수록 쌓여요.' },
    ],
  },
  H3: {
    learn: '사람과 로봇이 차례 신호로 번갈아 움직이고, 손이 있으면 멈춘다는 것을 알아요.',
    concept: conceptOf('H3'),
    pages: P(3),
    checks: [
      { q: '사람 손이 판 위에 있을 때 로봇 팔이 오면?', options: ['안전 정지한다', '그대로 돌을 놓는다'], answer: 0, why: '손과 겹치면 다칠 수 있어서 멈춰요.' },
      { q: '로봇이 돌을 집기 전에 기다려야 할 신호는?', options: ['[로봇 차례]', '[완성 램프]'], answer: 0, why: '사람이 두고 손을 빼면 [로봇 차례]가 켜져요.' },
      { q: '차례 기다리기는 언제 해야 할까요?', options: ['돌을 집기 전 매번', '게임이 끝난 뒤 한 번'], answer: 0, why: '한 수마다 사람 차례가 있어서 매번 기다려요.' },
    ],
  },
  H4: {
    learn: '규칙 블록을 위에서부터 차례로 따지므로, 이기기 → 막기 → 잇기 순서가 결과를 바꾼다는 것을 알아요.',
    concept: conceptOf('H4'),
    pages: P(4),
    checks: [
      { q: '로봇이 이길 수는 없고, 사람 돌이 4개 이어졌어요. 먼저 할 일은?', options: ['사람 줄을 막는다', '빈 칸 아무 데나 둔다'], answer: 0, why: '막지 않으면 사람이 다음 수에 5개를 이어요.' },
      { q: '한 판을 이기는 규칙의 순서는?', options: ['이기기 → 막기 → 잇기', '잇기 → 막기 → 이기기'], answer: 0, why: '이길 수 있으면 이기고, 아니면 막고, 그다음 내 줄을 이어요.' },
      {
        q: '잇기 블록이 막기 블록보다 위에 있으면 지는 까닭은?',
        options: ['잇기는 언제나 칸을 찾아서 막기 차례가 오지 않아요', '돌이 모자라서'],
        answer: 0,
        why: '위 블록이 칸을 고르면 아래 블록은 따지지 않아요. 막기가 잇기보다 먼저여야 해요.',
      },
    ],
  },
};

/** The café's quests grouped into 차시 (PLANS_OF: every place's). */
export const PLANS: Record<PlanSize, readonly (readonly string[])[]> = {
  // Even 차시 (practice ~15 min each, 교안 and 확인 문제 the rest): 보기 · 버튼 · 조그 are short, the
  // 운영 day (F8) takes a 차시 of its own.
  4: [['F1', 'F2', 'F3'], ['F4', 'F5'], ['F6', 'F7'], ['F8']],
  6: [['F1'], ['F2', 'F3'], ['F4'], ['F5', 'F6'], ['F7'], ['F8']],
  8: [['F1'], ['F2'], ['F3'], ['F4'], ['F5'], ['F6'], ['F7'], ['F8']],
};

/** A place of four quests at the class's pace: 4 → 2차시, 6 → 3차시, 8 → 4차시. */
const fourIn = (q: readonly string[]): Record<PlanSize, readonly (readonly string[])[]> => ({
  4: [
    [q[0], q[1]],
    [q[2], q[3]],
  ],
  6: [[q[0]], [q[1], q[2]], [q[3]]],
  8: [[q[0]], [q[1]], [q[2]], [q[3]]],
});

/** Every place's 차시, by the plan the teacher picked (named for the café's: 4 · 6 · 8차시). */
export const PLANS_OF: Record<SiteId, Record<PlanSize, readonly (readonly string[])[]>> = {
  cafe: PLANS,
  draw: fourIn(SITE_QUESTS.draw),
  // 보드게임: 보기 · 칸 간격 · 차례 are short runs; finding the rule order (H4) takes a 차시 of its own.
  board: { ...fourIn(SITE_QUESTS.board), 4: [['H1', 'H2', 'H3'], ['H4']] },
};

export interface Lesson {
  site: SiteId;
  /** 1-based 차시 (in its place). */
  n: number;
  quests: readonly string[];
  /** 오늘 배울 것 (its quests' 학습 목표). */
  goals: string[];
  /** The 교안 pages it covers. */
  pages: readonly [number, number];
}

export function lessonsOf(size: PlanSize, site: SiteId = 'cafe'): Lesson[] {
  return PLANS_OF[site][size].map((qs, i) => ({
    site,
    n: i + 1,
    quests: qs,
    goals: qs.map((q) => LESSON_QUEST[q].learn),
    pages: [LESSON_QUEST[qs[0]].pages[0], LESSON_QUEST[qs[qs.length - 1]].pages[1]],
  }));
}

/** The 차시 a quest is in (1-based), or 0. */
export function lessonOfQuest(size: PlanSize, quest: string): number {
  const site = siteOf(quest);
  if (!site) return 0;
  return PLANS_OF[site][size].findIndex((qs) => qs.includes(quest)) + 1;
}

/** One 확인 문제 as asked: its key (quest · index) and the question. */
export interface AskedCheck extends Choice {
  key: string;
}

/** A 차시's three 확인 문제: its quests' questions in turn (q1 of each, then q2 of each, …), three. */
export function checksOf(size: PlanSize, n: number, site: SiteId = 'cafe'): AskedCheck[] {
  const qs = PLANS_OF[site][size][n - 1] ?? [];
  const out: AskedCheck[] = [];
  for (let k = 0; k < 3 && out.length < 3; k += 1)
    for (const q of qs) {
      if (out.length >= 3) break;
      out.push({ ...LESSON_QUEST[q].checks[k], key: `${q}.${k + 1}` });
    }
  return out;
}

export type Level = '잘함' | '보통' | '노력';

/**
 * 3단계 기준 (a 차시 or the whole): quests passed out of those given, and 확인 문제 right out of
 * those asked. 잘함: every quest passed and at least 2/3 of the questions right; 보통: at least half
 * the quests passed or half the questions right; 노력: less.
 */
export function levelOf(passed: number, quests: number, right: number, asked: number): Level {
  const qp = quests ? passed / quests : 0;
  const cr = asked ? right / asked : 0;
  if (qp >= 1 && cr >= 2 / 3) return '잘함';
  if (qp >= 0.5 || cr >= 0.5) return '보통';
  return '노력';
}

export const RUBRIC: readonly { level: Level; text: string }[] = [
  { level: '잘함', text: '차시의 퀘스트를 모두 통과하고, 확인 문제를 3개 중 2개 이상 맞혔어요.' },
  { level: '보통', text: '퀘스트를 절반 이상 통과했거나, 확인 문제를 절반 이상 맞혔어요.' },
  { level: '노력', text: '퀘스트 통과와 확인 문제가 모두 절반에 못 미쳐요. 교사와 함께 다시 해 봐요.' },
];
