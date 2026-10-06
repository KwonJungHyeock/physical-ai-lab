import type { TopicScenario } from './types';

/** 학문 1 — what to press for each try and what its results must say. */
export const S1: TopicScenario[] = [
  {
    topic: '1-1',
    A: { do: [{ click: 'J1 끝에서 끝까지' }], expect: { '손끝 자취': '원', 자유도: '1', '같은 점에서 손끝 방향': '1개' } },
    B: { do: [{ click: 'J2·J3 번갈아 훑기' }], expect: { '손끝 자취': '면', 자유도: '2' } },
    C: {
      do: [{ click: '무작위 자세 20회' }, { wait: 13000 }, { click: '같은 점, 방향 바꾸기' }],
      expect: { '손끝 자취': '공간', 자유도: '6', '같은 점에서 손끝 방향': '여러 개 (3가지)' },
    },
  },
  {
    topic: '1-2',
    A: { do: [{ wait: 3000 }, { click: '예시 칸 (200, 60)' }], expect: { '손끝 x·y·z': '200, 60, 40', '바뀐 숫자': '2개' } },
    B: { do: [{ slider: '높이', value: 60 }, { click: '이 높이로 가기' }], expect: { '손끝 x·y·z': '200, 60, 60', '바뀐 숫자': '1개 (z)' } },
    C: {
      do: [{ click: '피치 0°' }, { wait: 3000 }, { click: '피치 45°' }, { wait: 3000 }, { click: '피치 90°' }],
      expect: { '손끝 x·y·z': '200, 0, 100', 피치: '0° → 45° → 90°', '바뀐 숫자': '1개 (피치)' },
    },
  },
  {
    topic: '1-3',
    A: { do: [{ slider: '롤', value: 45 }, { slider: '피치', value: 45 }, { slider: '요', value: 45 }], expect: { '독립 회전축': '3개' } },
    B: { do: [{ click: '롤 90° 뒤 피치 90°' }, { wait: 4000 }, { click: '피치 90° 뒤 롤 90°' }], expect: { '최종 손끝 방향': '다름 (아래 / 왼쪽)', '독립 회전축': '3개' } },
    C: { do: [{ slider: '롤', value: 30 }, { slider: '요', value: 30 }], expect: { '최종 손끝 방향': '롤과 요가 같은 회전', '독립 회전축': '2개' } },
  },
  {
    topic: '1-4',
    A: { do: [{ click: 'J1 끝에서 끝까지 돌리기' }], expect: { '가장 멀리': '240 mm', 'J1 범위': '336°', '닿는 크기': '/길이 14\\d\\d mm/' } },
    B: { do: [{ slider: 'J2 각도', value: 30 }, { slider: 'J3 각도', value: -90 }], expect: { '보이는 것': '면', '가장 멀리': '339 mm', '닿는 크기': '넓이 1060 cm²' } },
    C: {
      do: [{ click: '한계 100%' }, { click: '한계 70%' }, { wait: 3000 }, { click: '한계 40%' }, { wait: 4000 }],
      expect: { '가장 멀리': '339 → 339 → 319 mm', 'J1 범위': '336 → 235 → 134°', '닿는 크기': '부피 116 → 80 → 34 L' },
    },
  },
];
