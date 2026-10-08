/**
 * 물류 센터 (팔레타이징): the site's words — its six steps and, per problem, the work order, the
 * question that points at the cause, the hints and the principle with the theory PDF. Problem ①
 * runs on pallet.ts; ② and ③ are planned (their titles are in park.ts) and not yet built.
 */

import type { Pdf } from './chapter';

export const LOGI_STEPS = [
  { id: 'brief', label: '작업 지시' },
  { id: 'run', label: '가동 · 문제' },
  { id: 'cause', label: '원인 찾기' },
  { id: 'fix', label: '값 고치기' },
  { id: 'compare', label: '다시 가동 · 비교' },
  { id: 'done', label: '해결 · 원리' },
] as const;

export type LogiStepId = (typeof LOGI_STEPS)[number]['id'];

export const LOGI_PROBLEMS = [
  { id: 1, title: '쌓다가 무너진다', ready: true },
  { id: 2, title: '빨리 하니 미끄러진다', ready: false },
  { id: 3, title: '팔레트 자리가 바뀐다', ready: false },
] as const;

export const STACK_TEXT = {
  order: 'WO-0412',
  brief: '오늘부터 새 상자로 바뀌었어요. 컨베이어로 오는 상자를 로봇팔이 하나씩 집어 팔레트에 3층으로 쌓아요. 작업 프로그램은 예전 그대로예요.',
  tryFirst: '지금 값 그대로 한 번 가동해 보세요. 무엇이 문제인지는 그다음에 찾아요.',
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
  ] satisfies Pdf[],
} as const;
