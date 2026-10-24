/**
 * 로봇 실습 7 "선생님과 함께": each unit as a lesson the teacher leads (engine/account/lead.ts keeps the
 * shared step). A lesson is a few steps; every step has what the projector shows (headline, one line,
 * 지금 할 일), what the teacher says and asks (with the expected answer, shown only on the teacher's
 * rail), what each student's screen asks for, and the activity that makes a student's mark (a pick, a
 * question, the 3D steps, the real robot). The 기초교육 1~2차시 (manuals/course/teacher-guide.md, 로봇 실습 7) are
 * lessons 7-1 + 7-2 and 7-5 + 7-3 + 7-7.
 *
 * Plain data and checks, no React.
 */

import { UNIT_BY_ID, type UnitId } from './practice7';

export interface LeadQuiz {
  q: string;
  options: readonly string[];
  answer: number;
  why: string;
}

/** What a student does on a step (and so what the teacher's projector shows of the class). */
export type Activity =
  /** A pick with no right answer (thinking aloud): the projector shows how the class picked. */
  | { kind: 'vote'; q: string; options: readonly string[] }
  /** A question: the right answer shows on every screen when the teacher reveals it. */
  | ({ kind: 'quiz' } & LeadQuiz)
  /** The unit's 따라 하기 steps (practice7 step ids) in the 3D view. */
  | { kind: 'sim'; steps: readonly string[] }
  /** Unit 4: tap the four blocks in the hand camera's photo. */
  | { kind: 'tap' }
  /** Unit 4: where on the table is the red block (A · B · C)? */
  | { kind: 'pick' }
  /** The real robot: the group's robot PC checks the three things, then runs it once the teacher allows;
   * the others predict, then watch the robot. */
  | { kind: 'real'; checks: readonly string[]; predict: { q: string; options: readonly string[] } }
  /** The wrap-up: the lesson's order as cards, and one question. */
  | { kind: 'wrap'; flow: readonly (readonly [string, string])[]; quiz: LeadQuiz };

export interface LeadStep {
  name: string;
  /** Minutes planned. */
  min: number;
  /** Projector: the headline, one line under it, and what to do now. */
  title: string;
  say: string;
  doNow: string;
  /** Teacher's rail: what to say, what to ask and the answer to expect. */
  script: readonly string[];
  ask: string;
  expect: string;
  /** Student's screen: the task and one line under it. */
  task: string;
  sub: string;
  act: Activity;
}

export interface LeadLesson {
  /** "p7-1" … "p7-7" (the class server's lesson id). */
  id: string;
  unit: UnitId;
  /** Where it belongs: 기초교육 1 · 2차시, or a 검수 lesson of its own. */
  period: string;
  steps: readonly LeadStep[];
}

const SAFE = ['로봇 둘레 50 cm 를 비웠어요', '손을 로봇에서 뗐어요', '정지 버튼이 어디 있는지 알아요'] as const;

/** Unit 4's hand-camera photo (640 × 480): the four blocks' pixel centres and where they are on the table (mm). */
export const HAND_PHOTO = {
  src: '/education/lead/cam-hand.jpg',
  w: 640,
  h: 480,
  blocks: [
    { color: '초록', hex: '#12a150', u: 246, v: 134, x: 165, y: -75 },
    { color: '노랑', hex: '#e6b800', u: 222, v: 311, x: 165, y: -20 },
    { color: '빨강', hex: '#d92d20', u: 406, v: 158, x: 115, y: -75 },
    { color: '파랑', hex: '#2f5bd3', u: 381, v: 332, x: 115, y: -20 },
  ],
} as const;

/** Unit 4's "where is red on the table?": three points on the board (mm); B is right. */
export const RED_CANDIDATES = [
  { key: 'A', x: 165, y: -20 },
  { key: 'B', x: 115, y: -75 },
  { key: 'C', x: 60, y: 25 },
] as const;
export const RED_RIGHT = 'B';

const u = (id: UnitId) => UNIT_BY_ID.get(id)!;
const quizOf = (id: UnitId, k: 0 | 1): LeadQuiz => {
  const q = u(id).quiz[k];
  return { q: q.q, options: q.options, answer: q.answer, why: q.why };
};

export const LESSONS: readonly LeadLesson[] = [
  {
    id: 'p7-1',
    unit: 1,
    period: '기초교육 1차시 (앞 25분)',
    steps: [
      {
        name: '생각 열기',
        min: 4,
        title: '로봇팔에는 관절이 몇 개 있을까요?',
        say: '내 팔의 어깨 · 팔꿈치 · 손목을 움직여 보고 골라요.',
        doNow: '학생 화면: 셋 중 하나 고르기',
        script: ['"내 팔에서 접히거나 도는 곳을 세어 볼까요?"', '학생이 어깨 · 팔꿈치 · 손목을 직접 움직여 보게 해요. 고른 결과가 화면에 모이면 정답을 보여 줘요.'],
        ask: '관절이 많으면 무엇이 좋을까요?',
        expect: '더 여러 방향으로 손끝을 댈 수 있어요. 이 로봇팔은 6개라서 자리와 방향을 모두 맞출 수 있어요.',
        task: '로봇팔에는 관절이 몇 개 있을까요?',
        sub: '하나를 골라요. 선생님이 정답을 보여 줄 때까지 바꿀 수 있어요.',
        act: { kind: 'quiz', q: '로봇팔(myCobot 280)의 관절은 몇 개일까요?', options: ['3개', '6개', '10개'], answer: 1, why: 'J1 베이스부터 J6 손끝 돌리기까지 6개예요. 관절 하나가 한 가지 움직임을 맡아요.' },
      },
      {
        name: '아래 관절 3개',
        min: 7,
        title: '아래 관절 3개: 베이스 · 어깨 · 팔꿈치',
        say: '이 셋이 손끝을 "어디로" 보낼지 정해요.',
        doNow: '학생 화면: J1 · J2 · J3 를 차례로 눌러 3D 로 보기',
        script: ['선생님 화면에서 J1 을 먼저 눌러 보여 줘요. "로봇 전체가 돌죠? 맨 아래 관절이라 그 위가 모두 따라 돌아요."', '학생이 J1 · J2 · J3 를 누르는 동안, 자기 팔로 같은 움직임을 따라 하게 해요.'],
        ask: 'J2(어깨)를 움직이면 왜 팔 전체가 숙여질까요?',
        expect: 'J2 위에 달린 팔 전체가 함께 움직이기 때문이에요. 아래 관절일수록 많이 움직여요.',
        task: 'J1 · J2 · J3 를 차례로 눌러요.',
        sub: '3D 로봇이 움직이는 동안 내 팔로도 따라 해 봐요.',
        act: { kind: 'sim', steps: ['j1', 'j2', 'j3'] },
      },
      {
        name: '손목 관절 3개',
        min: 6,
        title: '손목 관절 3개: 손끝의 "방향"',
        say: 'J4 · J5 · J6 는 손끝이 어느 쪽을 볼지 정해요.',
        doNow: '학생 화면: J4 · J5 · J6 누르기',
        script: ['"앞의 셋이 손을 어디로 보낼지 정했다면, 손목 셋은 무엇을 정할까요?"', '용접 로봇이 토치 방향을 맞추는 예를 들어 줘요.'],
        ask: 'J6 만 돌리면 손끝의 자리는 바뀔까요?',
        expect: '거의 안 바뀌어요. 제자리에서 손끝이 돌기만 해요. 그래서 나사를 돌리거나 물건 방향을 맞출 때 써요.',
        task: 'J4 · J5 · J6 를 눌러요.',
        sub: '손끝의 자리와 방향 가운데 무엇이 바뀌는지 봐요.',
        act: { kind: 'sim', steps: ['j4', 'j5', 'j6'] },
      },
      {
        name: '실물로',
        min: 6,
        title: '조마다 실물 로봇의 관절 6개를 움직여요',
        say: '로봇 담당만 버튼을 눌러요. 나머지는 예상하고 실물을 지켜봐요.',
        doNow: '로봇 담당: 준비 3가지 → 선생님 허락 → 실물로 · 모둠원: 예상하고 지켜보기',
        script: ['모든 조가 "준비 끝" 이 되면 [모든 조 로봇 움직여도 돼요] 를 눌러요. 그 전에는 학생의 실물 버튼이 잠겨 있어요.', '이상한 소리나 움직임이 있으면 위쪽 [■ 모든 로봇 정지].'],
        ask: '명령한 각도와 로봇이 잰 각도가 조금 다른 까닭은?',
        expect: '모터와 기어에 작은 틈과 무게가 있어서예요. 차이가 1° 안이면 괜찮아요.',
        task: '실물 로봇의 관절 6개를 움직여요.',
        sub: '선생님이 허락하면 버튼이 열려요. 이상하면 바로 [■ 멈추기].',
        act: { kind: 'real', checks: SAFE, predict: { q: '명령한 각도와 로봇이 잰 각도의 차이는 얼마쯤일까요?', options: ['0°', '1° 안', '10° 넘게'] } },
      },
      {
        name: '정리',
        min: 2,
        title: '관절 6개가 하는 일',
        say: '아래 셋은 "어디로", 손목 셋은 "어느 방향으로".',
        doNow: '학생 화면: 확인 문제 1개',
        script: ['네 줄을 같이 읽어요.', '확인 문제를 틀린 학생이 많으면 J1 을 다시 보여 줘요.'],
        ask: '다음 시간(반복 정밀도)에는 무엇을 잴까요?',
        expect: '같은 곳에 여러 번 보냈을 때 얼마나 똑같이 도착하는지예요.',
        task: '확인 문제를 풀어요.',
        sub: '선생님이 정답을 보여 주면 맞았는지 나와요.',
        act: { kind: 'wrap', flow: [['J1 베이스', '로봇 전체가 좌우로'], ['J2 · J3', '팔을 숙이고 접어 손을 보내요'], ['J4 · J5', '손목을 위아래 · 좌우로'], ['J6', '손끝이 제자리에서 돌아요']], quiz: quizOf(1, 0) },
      },
    ],
  },
  {
    id: 'p7-2',
    unit: 2,
    period: '기초교육 1차시 (뒤 25분)',
    steps: [
      {
        name: '생각 열기',
        min: 4,
        title: '다트를 다섯 번 던졌어요. 누가 더 "똑같이" 던졌나요?',
        say: '가운데에 맞히는 것과 한 점에 모으는 것은 달라요.',
        doNow: '학생 화면: 하나 고르기',
        script: ['칠판에 과녁 두 개를 그려요. 하나는 한쪽 구석에 다섯 점이 모여 있고, 하나는 가운데 근처에 흩어져 있어요.', '"어느 쪽이 같은 동작을 똑같이 되풀이했나요?"'],
        ask: '공장 로봇에게 더 중요한 것은 어느 쪽일까요?',
        expect: '한 점에 모이는 쪽(반복 정밀도)이에요. 모이기만 하면 위치는 보정으로 옮길 수 있어요.',
        task: '누가 더 똑같이 던졌을까요?',
        sub: '하나를 골라요.',
        act: { kind: 'quiz', q: '어느 쪽이 같은 동작을 더 똑같이 되풀이했을까요?', options: ['구석이지만 한 점에 모였다', '가운데 근처에 흩어졌다'], answer: 0, why: '한 점에 모였다 = 매번 같은 곳에 간다. 이것이 반복 정밀도예요.' },
      },
      {
        name: '화면에서 5번',
        min: 7,
        title: '로봇을 같은 점에 다섯 번 보내요',
        say: '[목표 점 보기] → [5번 다녀오기]. 도착할 때마다 점이 찍혀요.',
        doNow: '학생 화면: 두 단추를 차례로',
        script: ['선생님 화면에서 먼저 [목표 점 보기] 를 눌러 빨간 점을 보여 줘요.', '"시뮬레이션은 흩어진 폭이 얼마일까요?" 하고 묻고, 학생이 해 보게 해요.'],
        ask: '시뮬레이션은 왜 흩어진 폭이 0 mm 일까요?',
        expect: '계산 속 로봇에는 틈 · 무게 · 열이 없어서예요. 실물은 조금 흩어져요.',
        task: '[목표 점 보기] 다음 [5번 다녀오기] 를 눌러요.',
        sub: '아래에 흩어진 폭(mm)이 나와요.',
        act: { kind: 'sim', steps: ['show', 'run'] },
      },
      {
        name: '실물로',
        min: 10,
        title: '실물 로봇은 얼마나 흩어질까요?',
        say: '로봇 담당이 실물로 5번 보내요. 나머지는 흩어진 폭을 예상해요.',
        doNow: '로봇 담당: 준비 → 선생님 허락 → 실물로 · 모둠원: 예상하기',
        script: ['모든 조 "준비 끝" 이면 로봇을 허락해요.', '조마다 나온 흩어진 폭(mm)을 칠판에 적고 비교해요.'],
        ask: '조마다 값이 조금씩 다른 까닭은?',
        expect: '로봇마다 조립 · 영점 · 모터가 조금씩 달라서예요. 그래서 공장은 로봇마다 이 값을 확인해요.',
        task: '실물 로봇을 같은 점에 5번 보내요.',
        sub: '선생님이 허락하면 버튼이 열려요.',
        act: { kind: 'real', checks: ['로봇 앞 책상을 비웠어요', SAFE[1], SAFE[2]], predict: { q: '실물 로봇의 흩어진 폭은 얼마일까요?', options: ['0 mm', '1 mm 안', '5 mm 넘게'] } },
      },
      {
        name: '정리',
        min: 4,
        title: '반복 정밀도 = 같은 곳에 얼마나 똑같이',
        say: '흩어진 폭이 작을수록 정밀해요.',
        doNow: '학생 화면: 확인 문제 1개',
        script: ['칠판의 조별 값을 보며 "가장 정밀한 조" 를 찾아요.', '다음 차시: 도구 바꾸기 · 카메라 · 코드.'],
        ask: '흩어진 폭이 크면 공장에서 어떤 일이 생길까요?',
        expect: '나사 구멍을 비껴가거나 부품을 놓쳐요. 그래서 검수에서 이 값을 재요.',
        task: '확인 문제를 풀어요.',
        sub: '선생님이 정답을 보여 주면 맞았는지 나와요.',
        act: { kind: 'wrap', flow: [['목표 점', '같은 곳을 정해요'], ['5번 다녀오기', '도착할 때마다 위치를 재요'], ['흩어진 폭', '가장 먼 점까지의 거리 (mm)'], ['작을수록', '더 정밀해요']], quiz: quizOf(2, 1) },
      },
    ],
  },
  {
    id: 'p7-3',
    unit: 3,
    period: '기초교육 2차시 (가운데 15분)',
    steps: [
      {
        name: '생각 열기',
        min: 3,
        title: '천장 CCTV 와 손에 든 휴대폰, 물건 자리를 재기 좋은 것은?',
        say: '하나를 고르고, 까닭을 생각해요.',
        doNow: '학생 화면: 하나 고르기',
        script: ['"CCTV 는 늘 같은 곳을 같은 크기로 봐요. 휴대폰은 내가 움직이면 보는 곳이 바뀌어요."', '고른 결과를 보고 두 카메라의 좋은 점을 하나씩 말하게 해요.'],
        ask: '로봇에는 왜 카메라가 두 대일까요?',
        expect: '위에서 전체를 보는 카메라와, 집기 직전에 가까이 보는 카메라가 하는 일이 달라서예요.',
        task: '물건 자리를 재기 좋은 카메라는?',
        sub: '하나를 골라요.',
        act: { kind: 'quiz', q: '물건이 책상 어디에 있는지 재기 좋은 카메라는?', options: ['천장에 고정된 카메라', '손에 들고 움직이는 카메라'], answer: 0, why: '움직이지 않으니 같은 자리를 늘 같은 크기로 봐요. 그래서 위치 계산이 쉬워요.' },
      },
      {
        name: '두 카메라로 찍기',
        min: 5,
        title: '키트 카메라와 손 카메라로 한 장씩',
        say: '같은 블록이 두 사진에서 어떻게 다르게 보이나요?',
        doNow: '학생 화면: [키트 카메라로 찍기] → [손 카메라로 찍기]',
        script: ['두 사진이 나오면 "같은 블록인데 크기가 왜 다를까요?" 하고 물어요.'],
        ask: '손 카메라 사진에서 블록이 더 크게 보이는 까닭은?',
        expect: '팔 끝에서 가까이 내려다보기 때문이에요. 가까울수록 크게, 자세히 보여요.',
        task: '두 카메라로 한 장씩 찍어요.',
        sub: '찍은 사진은 아래에 나와요.',
        act: { kind: 'sim', steps: ['top', 'hand'] },
      },
      {
        name: '실물로',
        min: 5,
        title: '실제 카메라 두 대로 찍어요',
        say: '로봇 담당이 찍고, 나머지는 예상해요.',
        doNow: '로봇 담당: 카메라 2대 확인 → 선생님 허락 → 찍기',
        script: ['카메라가 한 대만 나오는 조는 USB 를 다시 꽂게 해요 (검수 3 은 두 대가 필요해요).'],
        ask: '사진의 크기 640×480 은 무슨 뜻일까요?',
        expect: '가로 640 개, 세로 480 개의 점(픽셀)으로 된 사진이에요.',
        task: '실제 카메라 두 대로 사진을 찍어요.',
        sub: '선생님이 허락하면 버튼이 열려요.',
        act: { kind: 'real', checks: ['키트 카메라 USB 가 로봇에 꽂혀 있어요', '손 카메라 USB 가 로봇에 꽂혀 있어요', '작업판이 카메라에 보여요'], predict: { q: '같은 블록이 더 크게 보이는 사진은?', options: ['키트 카메라', '손 카메라'] } },
      },
      {
        name: '정리',
        min: 2,
        title: '로봇의 눈 두 개',
        say: '키트 카메라는 전체를, 손 카메라는 가까이.',
        doNow: '학생 화면: 확인 문제 1개',
        script: ['다음은 도구 대신 코드로 명령하기예요.'],
        ask: '물류센터 로봇은 두 카메라를 어떻게 나눠 쓸까요?',
        expect: '천장 카메라로 상자를 찾고, 집기 직전에 손 카메라로 다시 확인해요.',
        task: '확인 문제를 풀어요.',
        sub: '선생님이 정답을 보여 주면 맞았는지 나와요.',
        act: { kind: 'wrap', flow: [['키트 카메라', '위에서 전체를, 늘 같은 크기로'], ['손 카메라', '팔 끝에서 가까이, 팔 따라 움직여요'], ['사진', '640 × 480 개의 점']], quiz: quizOf(3, 0) },
      },
    ],
  },
  {
    id: 'p7-4',
    unit: 4,
    period: '검수 4 수업 (40분)',
    steps: [
      {
        name: '생각 열기',
        min: 3,
        title: '사람은 컵을 집기 전에, 무엇부터 할까요?',
        say: '학생 화면에서 하나를 골라요. 정답은 없어요.',
        doNow: '학생 화면: 셋 중 하나 고르기',
        script: ['"컵을 집을 때 여러분은 무엇부터 하나요?"', '손을 뻗기 전에 무엇을 하는지, 두세 명에게 물어봐요.'],
        ask: '눈을 감고 컵을 집으면 어떻게 될까요?',
        expect: '어디 있는지 몰라 손이 헤매요. 로봇도 "보기" 가 먼저예요. 오늘은 로봇의 눈(카메라)을 다뤄요.',
        task: '사람은 컵을 집기 전에, 무엇부터 할까요?',
        sub: '하나를 골라요. 정답은 없어요. 고르면 선생님 화면에 모여요.',
        act: { kind: 'vote', q: '컵을 집기 전에 무엇부터 할까요?', options: ['눈으로 컵을 본다', '손을 뻗는다', '힘을 준다'] },
      },
      {
        name: '로봇 눈으로 보기',
        min: 7,
        title: '로봇의 눈이 본 사진이에요. 블록이 어디 있나요?',
        say: '사진에서 블록 4개를 눌러 표시해요.',
        doNow: '학생 화면: 블록 4개 누르기',
        script: ['로봇 팔 끝에 달린 "손 카메라" 가 찍은 사진이에요.', '사람 눈처럼, 로봇도 먼저 사진에서 물건을 찾아요.'],
        ask: '로봇은 사진에서 블록을 무엇으로 구별할까요?',
        expect: '색이에요. 빨강 · 초록 · 파랑 · 노랑의 색 범위로 찾아요 (실제 키트 프로그램과 같은 방법).',
        task: '사진에서 블록 4개를 눌러 표시해요.',
        sub: '로봇 팔 끝의 손 카메라가 찍은 사진이에요.',
        act: { kind: 'tap' },
      },
      {
        name: '자리 바꾸기',
        min: 8,
        title: '사진 속 자리로는, 로봇이 움직일 수 없어요',
        say: '사진 속 자리(픽셀)를 책상 위 자리(mm)로 바꿔야 해요.',
        doNow: '학생 화면: 빨강 블록의 책상 위 자리 고르기 (A · B · C)',
        script: ['"빨강은 사진의 (406, 158) 에 있어요. 로봇에게 그대로 말하면 될까요?"', '대답을 듣고, 사진의 숫자와 책상의 숫자가 다르다는 것을 보여 줘요.'],
        ask: '사진 속 위치를 책상 위 위치로 바꾸는 것을 뭐라고 할까요?',
        expect: '보정(캘리브레이션)이에요. 카메라가 어디서 어떻게 보는지 알아야 바꿀 수 있어요.',
        task: '빨강 블록은 책상 위 어디일까요?',
        sub: '사진의 (406, 158) 픽셀 → 책상 위 (x, y) mm. 로봇은 mm 로만 움직여요.',
        act: { kind: 'pick' },
      },
      {
        name: '화면에서 먼저',
        min: 7,
        title: '진짜 로봇을 움직이기 전에, 화면에서 먼저 해 봐요',
        say: '부딪히거나 떨어뜨리는지 화면에서 미리 확인해요.',
        doNow: '학생 화면: [블록 찾기] → [색깔별로 넣기]',
        script: ['"실물로 바로 하면 어떤 일이 생길 수 있을까요?"', '책상에 부딪힘 · 블록 떨어뜨림 · 다른 상자에 넣음 같은 대답을 모아요.'],
        ask: '시뮬레이션으로 먼저 확인하는 까닭은?',
        expect: '실물은 부딪히면 고장 나고 위험해요. 화면에서는 몇 번을 틀려도 괜찮아요.',
        task: '[블록 찾기] 다음 [색깔별로 넣기] 를 눌러요.',
        sub: '실물을 움직이기 전에, 화면에서 먼저 해 봐요.',
        act: { kind: 'sim', steps: ['find', 'sort'] },
      },
      {
        name: '실물로',
        min: 10,
        title: '조마다 로봇 담당이 실물 로봇을 움직여요',
        say: '로봇 담당만 버튼을 눌러요. 나머지는 몇 개 성공할지 예상하고 지켜봐요.',
        doNow: '로봇 담당: 준비 3가지 확인 → 실물로 옮기기 · 모둠원: 예상하고 지켜보기',
        script: ['모든 조가 "준비 끝" 이 되면, 아래 [모든 조 로봇 움직여도 돼요] 를 눌러요.', '그 전에는 학생 화면의 실물 버튼이 잠겨 있어요.'],
        ask: '실물이 화면과 다르게 한 조가 있다면, 까닭은 무엇일까요?',
        expect: '블록을 놓은 자리 · 조명 · 카메라 보정의 작은 차이 때문이에요. 실물과 화면의 차이 = 오늘의 핵심.',
        task: '로봇 담당: 준비를 확인하고 실물로 옮겨요.',
        sub: '선생님이 허락하면 버튼이 열려요. 이상하면 바로 [■ 멈추기].',
        act: { kind: 'real', checks: ['로봇 둘레 50 cm 를 비웠어요', '흡착 펌프를 끼웠어요', '블록 4개를 작업판 가운데에 놓았어요'], predict: { q: '몇 개가 맞는 상자에 들어갈까요?', options: ['0', '1', '2', '3', '4'] } },
      },
      {
        name: '정리',
        min: 5,
        title: '로봇이 물건을 집는 순서',
        say: '보고 → 자리를 바꾸고 → 화면에서 확인하고 → 움직여요.',
        doNow: '학생 화면: 확인 문제 1개',
        script: ['네 단계를 학생과 같이 소리 내어 읽어요.', '확인 문제 결과를 보고, 틀린 학생이 많으면 3단계를 다시 짚어요.'],
        ask: '오늘 실물 결과가 화면과 달랐던 조는 무엇을 바꾸면 될까요?',
        expect: '블록을 가운데로 · 카메라 자세 확인 · 보정 다시. 다음 차시(검수 5 도구 바꾸기)로 이어져요.',
        task: '확인 문제를 풀어요.',
        sub: '선생님이 정답을 보여 주면 맞았는지 나와요.',
        act: { kind: 'wrap', flow: [['보기', '카메라 사진에서 색으로 블록을 찾아요'], ['자리 바꾸기', '사진 속 픽셀을 책상 위 mm 로 (보정)'], ['화면에서 확인', '시뮬레이션으로 부딪힘 · 떨어뜨림 확인'], ['움직이기', '확인한 그대로 실물 로봇이 옮겨요']], quiz: quizOf(4, 0) },
      },
    ],
  },
  {
    id: 'p7-5',
    unit: 5,
    period: '기초교육 2차시 (앞 20분)',
    steps: [
      {
        name: '생각 열기',
        min: 3,
        title: '얇고 평평한 카드를 집기 좋은 도구는?',
        say: '집게와 흡착 펌프, 어느 쪽일까요?',
        doNow: '학생 화면: 하나 고르기',
        script: ['책상 위 카드를 손가락 두 개로 집어 보게 해요. 잘 안 집혀요.', '"윗면에 붙여서 들면 어떨까요?"'],
        ask: '둥근 공은 어느 도구가 좋을까요?',
        expect: '집게예요. 둥근 면에는 흡착 컵이 잘 붙지 않아요.',
        task: '얇고 평평한 카드를 집기 좋은 도구는?',
        sub: '하나를 골라요.',
        act: { kind: 'quiz', q: '얇고 평평한 카드를 집기 좋은 도구는?', options: ['집게(그리퍼)', '흡착 펌프'], answer: 1, why: '얇아서 양쪽에서 잡기 어려워요. 윗면에 컵을 붙여 공기를 빼면 들려요.' },
      },
      {
        name: '그리퍼로',
        min: 4,
        title: '집게(그리퍼)로 노랑 블록을 옮겨요',
        say: '양쪽에서 잡아 들어 올려요.',
        doNow: '학생 화면: [그리퍼로 옮기기]',
        script: ['3D 에서 집게가 블록 가운데를 잡는 것을 보여 줘요.'],
        ask: '그리퍼는 블록의 어디를 잡나요?',
        expect: '옆면 가운데예요. 흡착 펌프는 윗면을 잡아요.',
        task: '[그리퍼로 옮기기] 를 눌러요.',
        sub: '집게가 블록 어디를 잡는지 봐요.',
        act: { kind: 'sim', steps: ['grip'] },
      },
      {
        name: '바꿔 끼우기',
        min: 4,
        title: '도구를 흡착 펌프로 바꿔요',
        say: '도구는 반드시 로봇이 멈춘 뒤에 바꿔 껴요.',
        doNow: '학생 화면: [흡착 펌프로 바꾸기] → [펌프로 옮기기]',
        script: ['"도구를 바꾸는 동안 로봇이 움직이면 어떻게 될까요?" (손이 끼일 수 있어요)', '공장 로봇은 도구를 자동으로 바꿔 끼운다는 것도 말해 줘요.'],
        ask: '도구를 바꿀 때 지킬 약속은?',
        expect: '로봇이 멈춘 뒤에, 두 사람이 함께, 전원은 그대로 두고 바꿔요.',
        task: '도구를 바꾸고 펌프로 옮겨요.',
        sub: '[흡착 펌프로 바꾸기] 다음 [펌프로 옮기기].',
        act: { kind: 'sim', steps: ['swap', 'pump'] },
      },
      {
        name: '실물로',
        min: 7,
        title: '실물 도구를 바꿔 끼우고 써 봐요',
        say: '로봇 담당: 그리퍼 → 바꿔 끼우기 → 펌프. 모둠원: 바꿔 끼우기를 함께.',
        doNow: '로봇 담당: 준비 → 선생님 허락 → ① 그리퍼 → 바꿔 끼우기 → ② 펌프',
        script: ['도구를 바꿔 끼우는 동안 로봇이 멈춰 있는지 확인해요.', '펌프 소리가 나지 않는 조는 배선(G2 · G5)을 확인해요.'],
        ask: '펌프를 켜면 어떤 소리가 나나요?',
        expect: '작은 모터 소리가 나요. 소리가 없으면 배선을 확인해요.',
        task: '실물 도구를 쓰고, 바꿔 끼우고, 다시 써요.',
        sub: '선생님이 허락하면 버튼이 열려요.',
        act: { kind: 'real', checks: ['로봇이 멈춰 있어요', '그리퍼를 끼웠어요', '흡착 펌프가 옆에 있어요'], predict: { q: '도구를 바꿔 끼울 때는?', options: ['로봇이 멈춘 뒤에', '움직이는 동안 빨리'] } },
      },
      {
        name: '정리',
        min: 2,
        title: '물건에 따라 손을 바꿔요',
        say: '옆에서 잡는 집게, 위에서 붙이는 흡착.',
        doNow: '학생 화면: 확인 문제 1개',
        script: ['다음은 로봇의 눈(카메라 두 대)이에요.'],
        ask: '자동차 공장 로봇은 도구를 어떻게 바꿀까요?',
        expect: '도구 교환 장치로 스스로 바꿔 껴요 (용접기 · 집게 · 흡착판).',
        task: '확인 문제를 풀어요.',
        sub: '선생님이 정답을 보여 주면 맞았는지 나와요.',
        act: { kind: 'wrap', flow: [['그리퍼', '옆에서 잡아요 (둥근 것도)'], ['흡착 펌프', '평평한 윗면에 붙여요'], ['바꿔 끼우기', '로봇이 멈춘 뒤에']], quiz: quizOf(5, 1) },
      },
    ],
  },
  {
    id: 'p7-6',
    unit: 6,
    period: '검수 6 수업 (30분)',
    steps: [
      {
        name: '생각 열기',
        min: 3,
        title: '휴대폰은 인터넷 없이 사진 속 얼굴을 찾을 수 있을까요?',
        say: '하나를 골라요.',
        doNow: '학생 화면: 하나 고르기',
        script: ['비행기 모드에서도 사진첩의 "인물" 이 되는지 물어봐요.'],
        ask: '인터넷 없이 계산하면 좋은 점은?',
        expect: '빠르고(보내고 받는 시간 없음), 사진이 밖으로 나가지 않아요.',
        task: '휴대폰은 인터넷 없이 얼굴을 찾을 수 있을까요?',
        sub: '하나를 골라요.',
        act: { kind: 'quiz', q: '휴대폰은 인터넷 없이도 사진 속 얼굴을 찾을 수 있을까요?', options: ['찾을 수 있다', '찾을 수 없다'], answer: 0, why: '휴대폰 안의 컴퓨터가 바로 계산해요. 이것을 "로컬 실행" 이라고 해요.' },
      },
      {
        name: '화면에서 찾기',
        min: 7,
        title: '사진을 찍고, 물건을 알아봐요',
        say: '찾은 물건에 상자와 이름 · 확률이 붙어요.',
        doNow: '학생 화면: [사진 찍기] → [물건 알아보기]',
        script: ['이 화면의 찾기는 색으로 찾는 연습이에요. 실물은 진짜 AI(YOLOv5s)를 써요.'],
        ask: '상자 옆의 % 는 무슨 뜻일까요?',
        expect: 'AI 가 얼마나 확신하는지예요. 100% 가 아니어도 틀린 것은 아니에요.',
        task: '[사진 찍기] 다음 [물건 알아보기] 를 눌러요.',
        sub: '찾은 상자와 이름을 봐요.',
        act: { kind: 'sim', steps: ['shot', 'detect'] },
      },
      {
        name: '생각하기',
        min: 4,
        title: 'AI 가 알려 주는 두 가지',
        say: '무엇인지(이름)와 어디 있는지(상자).',
        doNow: '학생 화면: 문제 1개',
        script: ['재활용 선별장 로봇이 페트병을 골라내는 예를 들어 줘요.'],
        ask: '이름만 알고 자리를 모르면 로봇은 무엇을 못 할까요?',
        expect: '집으러 갈 수 없어요. 그래서 상자(위치)가 함께 필요해요.',
        task: '문제를 풀어요.',
        sub: '선생님이 정답을 보여 주면 맞았는지 나와요.',
        act: { kind: 'quiz', ...quizOf(6, 0) },
      },
      {
        name: '실물로',
        min: 12,
        title: '로봇 안의 AI 로 진짜 물건을 알아봐요',
        say: '로봇 담당이 실행하고, 나머지는 몇 개 찾을지 예상해요.',
        doNow: '로봇 담당: 물건 놓기 → 선생님 허락 → AI 실행',
        script: ['처음 한 번은 모델을 읽느라 몇 초 걸린다고 미리 말해요.', '조마다 걸린 시간(ms)과 찾은 물건을 칠판에 적어요.'],
        ask: '같은 물건인데 조마다 확률이 다른 까닭은?',
        expect: '조명 · 각도 · 거리가 달라서예요. AI 도 보이는 대로 판단해요.',
        task: '로봇 안에서 AI 를 실행해요.',
        sub: '선생님이 허락하면 버튼이 열려요.',
        act: { kind: 'real', checks: ['카메라 앞에 컵 · 병 · 공을 놓았어요', '키트 카메라 USB 가 꽂혀 있어요', '처음엔 몇 초 걸린다는 것을 알아요'], predict: { q: '로봇 AI 가 몇 개를 알아볼까요?', options: ['0~1개', '2~3개', '4개 이상'] } },
      },
      {
        name: '정리',
        min: 4,
        title: '로봇 안에서 바로 알아보기',
        say: '사진 → AI(로봇 안) → 이름과 상자.',
        doNow: '학생 화면: 확인 문제 1개',
        script: ['검수 6 은 "로봇 안에서" 가 핵심이에요.'],
        ask: '공장에서 로컬 실행이 중요한 까닭은?',
        expect: '인터넷이 끊겨도 멈추지 않고, 빨라야 컨베이어를 따라갈 수 있어요.',
        task: '확인 문제를 풀어요.',
        sub: '선생님이 정답을 보여 주면 맞았는지 나와요.',
        act: { kind: 'wrap', flow: [['사진', '카메라가 찍어요'], ['AI (로봇 안)', 'YOLOv5s 가 계산해요'], ['결과', '이름 · 확률 · 상자']], quiz: quizOf(6, 1) },
      },
    ],
  },
  {
    id: 'p7-7',
    unit: 7,
    period: '기초교육 2차시 (뒤 15분)',
    steps: [
      {
        name: '생각 열기',
        min: 2,
        title: '같은 일을 백 번 시킬 때, 리모컨과 문자 명령 중 좋은 것은?',
        say: '하나를 골라요.',
        doNow: '학생 화면: 하나 고르기',
        script: ['"버튼을 백 번 누르는 것과, 명령을 한 번 써서 백 번 실행하는 것."'],
        ask: '코드로 명령하면 좋은 점은?',
        expect: '저장해서 몇 번이고 똑같이 실행할 수 있고, 숫자 하나만 바꿔 다르게 할 수 있어요.',
        task: '같은 일을 여러 번 시키기 좋은 것은?',
        sub: '하나를 골라요.',
        act: { kind: 'quiz', q: '같은 동작을 백 번 시키기 좋은 것은?', options: ['리모컨 버튼', '문자 명령(코드)'], answer: 1, why: '한 번 써 둔 코드는 몇 번이고 똑같이 실행돼요.' },
      },
      {
        name: '코드 한 줄씩',
        min: 5,
        title: '코드 한 줄 = 동작 하나',
        say: '[코드 보기] → [한 줄씩 실행]. 실행 중인 줄에 색이 들어와요.',
        doNow: '학생 화면: 두 단추를 차례로',
        script: ['괄호 안 숫자 6개 = 관절 J1~J6 의 각도, 마지막 30 = 속도라고 짚어 줘요.'],
        ask: '두 번째 줄의 20 은 어느 관절의 각도일까요?',
        expect: 'J1(베이스)이에요. 첫 번째 숫자가 J1 이에요.',
        task: '[코드 보기] 다음 [한 줄씩 실행] 을 눌러요.',
        sub: '줄마다 3D 로봇이 어떻게 움직이는지 봐요.',
        act: { kind: 'sim', steps: ['code', 'line'] },
      },
      {
        name: '숫자 바꾸기',
        min: 3,
        title: '20 을 -20 으로 바꾸면?',
        say: '먼저 예상하고, 그다음 확인해요.',
        doNow: '학생 화면: 하나 고르기',
        script: ['예상이 모이면 정답을 보여 주고, 3D 에서 같은 줄을 다시 봐요.'],
        ask: '속도 30 을 60 으로 바꾸면?',
        expect: '같은 곳으로 두 배쯤 빠르게 움직여요.',
        task: 'sync_send_angles([20, 0, 0, 0, 0, 0], 30) 에서 20 을 -20 으로 바꾸면?',
        sub: '하나를 골라요.',
        act: { kind: 'quiz', q: '20 을 -20 으로 바꾸면 로봇은?', options: ['반대쪽으로 돈다', '더 빨리 돈다', '움직이지 않는다'], answer: 0, why: '부호가 바뀌면 방향이 바뀌어요. 크기(20°)는 그대로예요.' },
      },
      {
        name: '실물로',
        min: 4,
        title: '같은 코드를 실물 로봇에서',
        say: '로봇 담당이 실행해요. 나머지는 몇 번 움직일지 예상해요.',
        doNow: '로봇 담당: 준비 → 선생님 허락 → 실행',
        script: ['ROS 2 는 시뮬레이터의 ROS 2 탭에서 이어서 한다고 알려 줘요.'],
        ask: '화면의 코드와 로봇의 코드가 같은 까닭은?',
        expect: '둘 다 같은 pymycobot API 를 써요. 화면에서 확인한 코드를 그대로 실물에 보낼 수 있어요.',
        task: '같은 코드를 실물로 실행해요.',
        sub: '선생님이 허락하면 버튼이 열려요.',
        act: { kind: 'real', checks: SAFE, predict: { q: '코드 4줄이면 로봇은 몇 번 움직일까요?', options: ['2번', '4번', '8번'] } },
      },
      {
        name: '정리',
        min: 1,
        title: '코드로 로봇에게 말하기',
        say: '한 줄 = 동작 하나 · 숫자 6개 = 관절 각도 · 마지막 숫자 = 속도.',
        doNow: '학생 화면: 확인 문제 1개',
        script: ['기초교육 끝. 다음은 검수 4(카메라로 찾아서 집기) 수업이에요.'],
        ask: '오늘 배운 것 셋은?',
        expect: '도구 바꾸기 · 카메라 두 대 · 코드로 명령하기.',
        task: '확인 문제를 풀어요.',
        sub: '선생님이 정답을 보여 주면 맞았는지 나와요.',
        act: { kind: 'wrap', flow: [['코드 한 줄', '동작 하나'], ['숫자 6개', '관절 J1~J6 각도'], ['마지막 숫자', '속도 (1~100)']], quiz: quizOf(7, 1) },
      },
    ],
  },
];

export const LESSON_BY_ID: ReadonlyMap<string, LeadLesson> = new Map(LESSONS.map((l) => [l.id, l]));
export const lessonOfUnit = (unit: UnitId): LeadLesson => LESSONS.find((l) => l.unit === unit)!;
export const lessonMinutes = (l: LeadLesson) => l.steps.reduce((s, x) => s + x.min, 0);

/** The 기초교육 차시 as led lessons in order. */
export const BASIC_PERIODS: readonly { name: string; lessons: readonly string[] }[] = [
  { name: '기초교육 1차시 · 로봇팔과 친해지기', lessons: ['p7-1', 'p7-2'] },
  { name: '기초교육 2차시 · 로봇에게 일 시키기', lessons: ['p7-5', 'p7-3', 'p7-7'] },
];

/** The lesson to offer after this one: the next in its 차시, else the next unit's. */
export function nextLesson(id: string): LeadLesson | null {
  for (const p of BASIC_PERIODS) {
    const i = p.lessons.indexOf(id);
    if (i >= 0 && i + 1 < p.lessons.length) return LESSON_BY_ID.get(p.lessons[i + 1]) ?? null;
  }
  const l = LESSON_BY_ID.get(id);
  return l ? (LESSONS.find((x) => x.unit === l.unit + 1) ?? null) : null;
}

/* --- what a student's answer means -------------------------------------------------------------- */

/** The answer to record for a pick (index → text the teacher's tally counts). */
export const pickAnswer = (i: number) => String(i);

/** Is this answer right (questions and the red-block pick); null: nothing right or wrong about it. */
export function answerRight(act: Activity, answer: string): boolean | null {
  if (!answer) return null;
  if (act.kind === 'quiz') return answer === pickAnswer(act.answer);
  if (act.kind === 'wrap') return answer === pickAnswer(act.quiz.answer);
  if (act.kind === 'pick') return answer === RED_RIGHT;
  return null;
}

/** The options a step's answers are counted under (for the projector's tally); [] when it has none. */
export function answerOptions(act: Activity): readonly string[] {
  if (act.kind === 'vote' || act.kind === 'quiz') return act.options;
  if (act.kind === 'wrap') return act.quiz.options;
  if (act.kind === 'pick') return RED_CANDIDATES.map((c) => c.key);
  if (act.kind === 'real') return act.predict.options;
  return [];
}

/** Answer → the option index it counts under (picks are stored as their index, the red-block pick as its letter). */
export function answerIndex(act: Activity, answer: string): number {
  if (act.kind === 'pick') return RED_CANDIDATES.findIndex((c) => c.key === answer);
  const n = Number(answer);
  return Number.isInteger(n) && n >= 0 && n < answerOptions(act).length ? n : -1;
}
