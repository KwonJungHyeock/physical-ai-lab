/**
 * 물류 센터 (팔레타이징): the site's words — its six steps and, per problem, the work order, the
 * question that points at the cause, the hints, the predictions and the principle with the theory
 * PDF. The runs are pallet.ts; every number the screen shows next to these words comes from there.
 */

import type { Pdf } from './chapter';
import type { LogiProblem } from './pallet';

export const LOGI_STEPS = [
  { id: 'brief', label: '작업 지시' },
  { id: 'run', label: '가동 · 문제' },
  { id: 'cause', label: '원인 찾기' },
  { id: 'fix', label: '값 고치기' },
  { id: 'compare', label: '다시 가동 · 비교' },
  { id: 'done', label: '해결 · 원리' },
] as const;

export type LogiStepId = (typeof LOGI_STEPS)[number]['id'];

export interface LogiText {
  id: LogiProblem;
  title: string;
  /** What the problem is about, a few words (the bar's tooltip, the map card). */
  about: string;
  order: string;
  orderTitle: string;
  brief: string;
  /** 가동 · 문제: what happened, in a line. */
  happened: string;
  look: string;
  question: string;
  choices: readonly string[];
  answer: number;
  why: string;
  whyNot: string;
  hints: readonly { k: string; t: string }[];
  predictions: readonly string[];
  principle: { unit: string; title: string; formula: string; lines: readonly string[] };
  pdf: readonly Pdf[];
  /** 해결 뒤: trying it on the real arm. */
  real: string;
}

export const LOGI_TEXT: Record<LogiProblem, LogiText> = {
  1: {
    id: 1,
    title: '쌓다가 무너진다',
    about: '층마다 놓는 높이',
    order: 'WO-0412',
    orderTitle: '팔레트에 상자 12개를 3층으로',
    brief: '오늘부터 새 상자로 바뀌었어요. 컨베이어로 오는 상자를 로봇팔이 하나씩 집어 팔레트에 3층으로 쌓아요. 작업 프로그램은 예전 그대로예요.',
    happened: '1층 4개는 잘 쌓였는데, 2층 첫 상자를 내려놓다가 라인이 멈췄어요.',
    look: '멈춘 순간을 보세요. 5번 상자를 내려놓는 높이와 아래 1번 상자의 윗면을 비교해요.',
    question: '왜 2층 첫 상자에서 멈췄을까요?',
    choices: ['층 간격이 상자 높이보다 작아서, 2층 상자를 너무 낮게 내렸다', '컨베이어가 빨라서 상자를 늦게 집었다', '상자가 무거워서 팔의 힘이 모자랐다'],
    answer: 0,
    why: '층이 하나 올라가면 놓는 높이도 상자 높이(40 mm)만큼 올라가야 해요. 작업 지시서는 예전 상자(30 mm) 기준이라 2층 상자를 10 mm 낮게 내려 아래 상자를 눌렀어요.',
    whyNot: '1층 4개는 문제없이 쌓였어요. 속도나 힘이 문제라면 1층부터 틀렸을 거예요.',
    hints: [
      { k: '방향', t: '2층 상자의 바닥은 1층 상자의 윗면에 닿아야 해요. 층이 하나 올라갈 때 얼마나 올라가야 할까요?' },
      { k: '범위', t: '새 상자의 높이는 40 mm예요. 층 간격은 상자 높이와 같아야 해요.' },
      { k: '거의 답', t: '층 간격 40 mm, 여유 1 ~ 3 mm. 여유는 놓을 때 상자를 띄우는 높이라, 크면 떨어뜨려요.' },
    ],
    predictions: ['12개 모두 쌓인다', '2층은 되지만 3층에서 멈춘다', '여전히 2층에서 멈춘다'],
    principle: {
      unit: '역기구학 · 동작 계획',
      title: '끝점은 층마다 다시 계산한다',
      formula: 'z(층) = 1층 높이 + (층 − 1) × 상자 높이 + 여유',
      lines: [
        '로봇은 좌표를 받으면 관절 각도를 거꾸로 계산해 그 자리로 가요. 좌표가 틀리면 아무리 정확하게 움직여도 결과가 틀려요.',
        '놓는 높이가 낮으면 아래 상자를 누르고, 높으면 떨어뜨려요. 여유는 몇 mm면 충분해요.',
      ],
    },
    pdf: [
      { label: '2-2 역기구학', href: '/materials/theory-2.pdf#page=7' },
      { label: '6단원 동작 계획', href: '/materials/theory-6.pdf' },
    ],
    real: '실제 myCobot 280에서도 같은 상자와 높이로 해 볼 수 있어요. 놓는 높이를 1 mm씩 바꿔 가며 상자가 눌리는지 보세요.',
  },
  2: {
    id: 2,
    title: '빨리 하니 미끄러진다',
    about: '속도 · 가속도와 흡착력',
    order: 'WO-0418',
    orderTitle: '무거운 상자 12개를 70초 안에',
    brief: '무거운 상자(200 g) 주문이 들어왔어요. 시간이 급해서 반장님이 이동 속도를 모두 최고로 올렸어요. 한 번 가동해 보세요.',
    happened: '첫 상자를 들고 옮기다가 상자가 흡착 컵에서 떨어졌어요.',
    look: '떨어진 순간 손끝의 가속도를 보세요. 그래프의 빨간 선이 흡착 컵이 버틸 수 있는 한계예요.',
    question: '왜 상자가 흡착 컵에서 떨어졌을까요?',
    choices: ['들고 옮길 때 가속도가 커서, 흡착력이 상자를 붙잡지 못했다', '흡착 컵이 상자 가운데를 못 잡았다', '컨베이어가 상자를 늦게 보냈다'],
    answer: 0,
    why: '흡착 컵은 상자 무게와, 상자를 빨리 움직이게 하는 힘(질량 × 가속도)을 함께 버텨야 해요. 무거운 상자일수록 견딜 수 있는 가속도가 작아요.',
    whyNot: '가운데는 정확히 잡았고, 상자는 제때 왔어요. 떨어진 건 옮기는 도중, 가장 세게 움직일 때예요.',
    hints: [
      { k: '방향', t: '상자를 들고 있을 때와 빈손일 때는 다르게 움직여도 돼요.' },
      { k: '범위', t: '속도를 반으로 줄이면 가속도는 약 1/4이 돼요. 들고 이동은 70 정도면 한계 아래예요. 시간은 다른 값에서 줄여요.' },
      { k: '거의 답', t: '들고 이동 70, 빈손 이동 100, 위아래 이동 70. 위아래 이동은 거리가 짧아 빨라도 가속도가 크지 않아요.' },
    ],
    predictions: ['떨어지지 않고 70초 안에 끝난다', '떨어지지는 않지만 70초를 넘긴다', '여전히 상자가 떨어진다'],
    principle: {
      unit: '궤적 · 동역학',
      title: '들고 있을 때는 부드럽게, 빈손일 때는 빠르게',
      formula: '흡착력 ≥ 질량 × (중력 가속도 + 손끝 가속도)',
      lines: [
        '흡착 컵이 버틸 수 있는 가속도의 한계는 흡착력과 상자 무게가 정해요. 무게가 두 배면 한계는 훨씬 작아져요.',
        '같은 거리를 두 배 빨리 가면 가속도는 약 네 배가 돼요. 시간은 짐이 없을 때 줄이는 게 안전해요.',
      ],
    },
    pdf: [
      { label: '3-2 궤적 프로파일', href: '/materials/theory-3.pdf#page=7' },
      { label: '4단원 동역학', href: '/materials/theory-4.pdf' },
    ],
    real: '실제 280의 흡착 펌프로도 무거운 상자를 빠르게 옮기면 떨어져요. 들고 이동 속도만 낮추고 빈손 이동은 그대로 두어 시간을 재 보세요.',
  },
  3: {
    id: 3,
    title: '팔레트 자리가 바뀐다',
    about: '기준점 다시 잡기 · 좌표 보정',
    order: 'WO-0423',
    orderTitle: '옮겨진 팔레트에 상자 12개를',
    brief: '어젯밤 바닥 청소를 하면서 팔레트를 옮겼어요. 바닥 표시선과 맞지 않게 놓였어요. 로봇 프로그램은 예전 자리를 그대로 기억해요.',
    happened: '첫 상자를 내려놓았는데, 팔레트 가장자리에 걸쳐 떨어졌어요.',
    look: '프로그램이 기억하는 팔레트 자리(점선)와 실제 팔레트를 비교해 보세요.',
    question: '왜 첫 상자부터 떨어졌을까요?',
    choices: ['팔레트가 옮겨졌는데, 프로그램은 예전 팔레트 자리에 상자를 놓았다', '층 간격이 상자 높이와 달랐다', '흡착력이 약해서 상자를 놓쳤다'],
    answer: 0,
    why: '로봇은 기억하는 좌표로만 움직여요. 팔레트가 옮겨졌다는 걸 모르니, 예전 자리에 그대로 놓았어요.',
    whyNot: '상자는 놓으려던 자리에 정확히 놓였어요. 그 자리에 팔레트가 없었던 거예요.',
    hints: [
      { k: '방향', t: '팔레트 모서리의 빨간 기준 표시를 찾아, 손끝을 그 위에 맞춰 보세요.' },
      { k: '범위', t: '팔레트는 앞쪽으로 25 mm, 로봇 쪽으로 40 mm쯤 옮겨졌어요. 화면을 확대해서 손끝과 표시를 맞춰요.' },
      { k: '거의 답', t: `기준점 x = 160 mm, y = −171 mm 근처예요.` },
    ],
    predictions: ['12개 모두 새 팔레트에 쌓인다', '몇 개는 가장자리에 걸친다', '여전히 첫 상자가 떨어진다'],
    principle: {
      unit: '좌표와 좌표계',
      title: '자리는 기준점에서 잰 상대 좌표로',
      formula: '놓는 자리 = 팔레트 기준점 + 기준점에서 잰 자리',
      lines: [
        '상자 12개의 자리를 팔레트 기준점에서 잰 좌표로 저장해 두면, 팔레트가 옮겨져도 기준점 하나만 다시 잡으면 모든 자리가 따라와요.',
        '공장에서는 이것을 사용자 좌표계(작업 좌표계)라고 하고, 손끝으로 기준점을 찍어 다시 잡는 일을 "터치업"이라고 해요.',
      ],
    },
    pdf: [
      { label: '1-2 위치와 자세', href: '/materials/theory-1.pdf' },
      { label: '2-1 좌표 변환', href: '/materials/theory-2.pdf#page=2' },
    ],
    real: '실제 280으로도 해 볼 수 있어요. 팔레트를 옮긴 뒤 조그로 손끝을 모서리 표시에 맞추고, 그 좌표를 기준점으로 저장해 보세요.',
  },
};
