import type { TopicScenario } from './types';

/** 학문 4 — what to press for each try and what its results must say. */
export const S4: TopicScenario[] = [
  {
    topic: '4-1',
    A: { do: [{ click: '세운 자세' }, { wait: 1800 }, { click: '반쯤 숙인 자세' }], expect: { 'J2 토크': '0.01 → 0.52 N·m', '한계 대비': '1 → 33 %' } },
    B: { do: [{ slider: '무게', value: 250 }], expect: { 무게: '250 g', 'J2 토크': '1.12 N·m', '한계 대비': '71 %', '어깨~손끝 수평 거리': '247 mm' } },
    C: { do: [{ click: '팔 뻗기' }], expect: { 'J2 토크': '1.31 N·m', '한계 대비': '83 %', '어깨~손끝 수평 거리': '247 → 280 mm' } },
  },
  {
    topic: '4-2',
    A: { do: [{ click: '느리게 2.5 초' }], expect: { '걸린 시간': '2.50 s', '최대 토크': '0.02 N·m', '한계 넘음': '아니오' } },
    B: { do: [{ click: '빠르게 0.8 초' }], expect: { '걸린 시간': '0.80 s', '최대 토크': '0.23 N·m', '한계 넘음': '아니오' } },
    C: { do: [{ click: '빠르게 + 사다리꼴(급하게)' }], expect: { '걸린 시간': '0.80 s', '최대 토크': '0.38 N·m', '한계 넘음': '예' } },
  },
  {
    // Each try has its own block (A 20 g, B 200 g, C 20 g slippery); the same push each time.
    topic: '4-3',
    A: { do: [{ click: '밀기 (200 mm/s · 1 초)' }], expect: { '밀린 거리': '/^1[56]\\d mm$/', '미는 데 드는 힘': '0.15 N' }, timeout: 90000 },
    B: { do: [{ click: '밀기 (200 mm/s · 1 초)' }], expect: { '밀린 거리': '/^[34]\\d mm$/', '미는 데 드는 힘': '1.47 N' }, timeout: 90000 },
    C: { do: [{ click: '밀기 (200 mm/s · 1 초)' }], expect: { '밀린 거리': '/^2[01]\\d mm$/', '팔이 멈춘 뒤 미끄러진 시간': '/^0\\.[34]\\d s$/', '미는 데 드는 힘': '0.01 N' }, timeout: 90000 },
  },
];
