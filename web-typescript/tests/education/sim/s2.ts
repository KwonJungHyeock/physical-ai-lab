import type { TopicScenario } from './types';

/** 학문 2 — what to press for each try and what its results must say. */
export const S2: TopicScenario[] = [
  {
    topic: '2-1',
    A: { do: [{ slider: 'J1 각도', value: 60 }], expect: { '곱한 행렬': '1개', 위치열: '그대로' } },
    B: { do: [{ slider: 'J2 각도', value: 0 }], expect: { '곱한 행렬': '2개', '바뀐 것': '{2} 와 그 뒤 전부' } },
    C: {
      do: [{ click: '{0}' }, { click: '×T₀¹' }, { click: '×T₁²' }, { click: '×T₂³' }, { click: '×T₃⁴' }, { click: '×T₄⁵' }, { click: '×T₅⁶' }],
      expect: { '곱한 행렬': '6개', 위치열: '플랜지 (66, -62, 239)' },
    },
  },
  {
    topic: '2-2',
    note: 'A: 손으로 맞추는 대신, 반복 풀이의 답(0.5° 단위로 반올림)을 슬라이더에 넣는다 — 마지막 J1 에서 12 mm 안에 든다.',
    A: {
      do: [
        { slider: 'J6 각도', value: 9.5 },
        { slider: 'J5 각도', value: 4.5 },
        { slider: 'J4 각도', value: 19 },
        { slider: 'J3 각도', value: -95 },
        { slider: 'J2 각도', value: -17.5 },
        { slider: 'J1 각도', value: 40.5 },
      ],
      expect: { 방법: '손 (슬라이더)', '답 개수': '1 개' },
    },
    B: { do: [{ click: '풀기' }], expect: { 방법: '반복 6회', '남은 오차': '/^0\\.0\\d mm$/', '답 개수': '1 개' } },
    C: { do: [{ click: '다른 답 찾기' }, { wait: 3000 }, { click: '~답 1' }], expect: { '답 개수': '4 개' } },
  },
  {
    topic: '2-3',
    A: { do: [{ click: '관절 이동 (MOVJ)' }], expect: { '자취 길이': '253 mm', '직선에서 최대 벗어남': '/^3[56]\\.\\d mm$/', '펜 최대 기울기': '0.0°' } },
    B: { do: [{ click: '직선 이동 (MOVL)' }], expect: { '자취 길이': '/^2(39|40|41) mm$/', '직선에서 최대 벗어남': '/^[01]\\.\\d mm$/', '펜 최대 기울기': '/^1[23]\\.\\d°$/' } },
    C: { do: [{ click: '직선 + 자세 유지' }], expect: { '자취 길이': '/^2(39|40|41) mm$/', '직선에서 최대 벗어남': '/^[01]\\.\\d mm$/', '펜 최대 기울기': '/^0\\.\\d°$/' } },
  },
];
