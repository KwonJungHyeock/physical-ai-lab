/**
 * 문제 해결 실습 (시범): the chapter's words — its six steps and, per problem, the situation, the
 * question that points at the cause, the hint for fixing and the principle with the theory PDF
 * (public/materials, built by tools/build/materials.mjs; `#page=` opens the PDF at that 차시 — the
 * page numbers follow the PDFs as built, check them when the theory text changes).
 */

import type { ProblemId } from './problems';

export const CHAPTER = { title: '컨베이어 공정', badge: '시범' } as const;

export const STEPS = [
  { id: 'situation', label: '상황' },
  { id: 'cause', label: '원인 찾기' },
  { id: 'fix', label: '값 고치기' },
  { id: 'compare', label: '다시 실행 · 비교' },
  { id: 'verify', label: '해결 확인' },
  { id: 'principle', label: '원리 정리' },
] as const;

export type StepId = (typeof STEPS)[number]['id'];

export interface Pdf {
  label: string;
  href: string;
}

export interface ProblemText {
  id: ProblemId;
  mark: string;
  title: string;
  /** 상황: what goes wrong, in two or three short lines. */
  story: string;
  /** 원인 찾기: where to look, and a question with its answer. */
  look: string;
  question: string;
  choices: readonly string[];
  answer: number;
  why: string;
  /** 값 고치기: one hint. */
  hint: string;
  /** 원리 정리: one or two lines. */
  principle: readonly string[];
  pdf: readonly Pdf[];
}

export const PROBLEMS: readonly ProblemText[] = [
  {
    id: 1,
    mark: '1',
    title: '옆을 집는다',
    story: '작업 지시서에 적힌 관절 각도로 팔이 내려갔는데, 흡착 컵이 상자 옆 허공에 내려왔어요. 멈춤 센서를 옮긴 뒤로 상자가 서는 자리가 바뀌었대요.',
    look: '관절 각도로 계산한 손끝 자리와 상자 가운데를 나란히 놓고 보세요.',
    question: '손끝이 내려오는 자리는 무엇이 정할까요?',
    choices: ['관절 각도', '흡착 펌프의 힘', '컨베이어 속도'],
    answer: 0,
    why: '관절 각도가 정해지면 손끝 자리는 계산으로 딱 하나 나와요. 그래서 각도를 고쳐야 해요.',
    hint: 'J1은 손끝을 옆(y)으로, J2 · J3은 앞뒤(x)와 높이(z)로 옮겨요. 손목(J4 ~ J6)은 컵이 늘 아래를 보도록 따라와요.',
    principle: ['순기구학: 관절 각도를 알면 손끝 자리(x · y · z)를 계산할 수 있어요.', '팔이 길어서 각도가 1°만 틀려도 손끝은 몇 mm씩 벗어나요.'],
    pdf: [{ label: '2-1 좌표 변환과 순기구학', href: '/materials/theory-2.pdf#page=2' }],
  },
  {
    id: 2,
    mark: '2',
    title: '자리가 매번 바뀐다',
    story: '이번에는 상자 세 개가 서로 다른 센서 앞에서 멈춰요. 문제 1에서 맞춘 각도 하나로는 첫 상자만 집혀요. 상자마다 각도를 맞추려면 값이 9개나 돼요.',
    look: '상자마다 멈춘 자리, 그리고 로봇 몸통에서 그 자리까지의 거리를 보세요.',
    question: '자리가 바뀔 때마다 각도를 맞추는 대신 어떻게 하면 될까요?',
    choices: ['좌표를 주고 각도는 계산하게 하기', '상자를 더 크게 만들기', '팔을 더 빠르게 움직이기'],
    answer: 0,
    why: '목표 좌표를 주면 역기구학이 관절 각도를 거꾸로 계산해 줘요. 단, 팔이 닿는 범위 안이어야 해요.',
    hint: '좌표로 지정하면 각도는 역기구학이 계산해요. 닿지 않는 자리는 센서를 로봇 쪽으로 옮기거나 접근 높이를 낮춰 보세요.',
    principle: ['역기구학: 손끝이 갈 좌표를 주면 관절 각도를 거꾸로 계산해요.', '작업 공간 밖의 좌표는 답이 없어요. 높이 올라갈수록 닿는 거리가 짧아져요.'],
    pdf: [
      { label: '2-2 역기구학', href: '/materials/theory-2.pdf#page=7' },
      { label: '1-4 작업 공간', href: '/materials/theory-1.pdf#page=14' },
    ],
  },
  {
    id: 3,
    mark: '3',
    title: '움직이는 상자를 놓친다',
    story: '이제 컨베이어가 멈추지 않아요. 센서가 상자를 보면 팔이 내려가는데, 늦게 출발하고 천천히 내려와서 상자가 벌써 지나가 버려요.',
    look: '상자가 대기 지점 아래에 오는 시간과 팔이 도착하는 시간을 비교해 보세요.',
    question: '상자를 잡으려면 팔은 언제 도착해야 할까요?',
    choices: ['상자가 바로 아래에 오는 순간', '센서가 상자를 보는 순간', '상자가 지나간 다음'],
    answer: 0,
    why: '너무 일찍 내려가면 오는 상자에 부딪히고, 늦으면 놓쳐요. 출발 지연 = 상자가 오는 시간 − 내려가는 시간이에요.',
    hint: '출발 지연 = 상자가 오는 시간 − 내려가는 시간. 다음 상자가 오기 전에 돌아올 수 있게 팔 속도도 보세요.',
    principle: [
      '궤적과 시간 계획: 손끝이 언제 어디에 있을지 미리 계산해서, 상자가 오는 순간에 맞춰 도착해요.',
      '관절 이동은 빠르지만 길이 조금 휘고, 직선 이동은 곧지만 손끝 속도 한계 때문에 느려요.',
    ],
    pdf: [
      { label: '2-3 관절 이동과 직선 이동', href: '/materials/theory-2.pdf#page=11' },
      { label: '3-2 궤적 프로파일', href: '/materials/theory-3.pdf#page=7' },
    ],
  },
];
