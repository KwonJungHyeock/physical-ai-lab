import type { TopicScenario } from './types';

/** 학문 6 — what to press for each try and what its results must say. */
export const S6: TopicScenario[] = [
  {
    topic: '6-1',
    A: { do: [{ click: '멈춘 자세만 검사' }], expect: { '검사 횟수': '2 번', '찾은 충돌': '없음', 판정: '/^놓침 \\(실제로는 J5/' } },
    B: { do: [{ click: '검사 간격 30°' }], expect: { '검사 횟수': '4 번', '찾은 충돌': '없음', 판정: '/^놓침 \\(실제로는 J5/' } },
    C: { do: [{ click: '검사 간격 5°' }], expect: { '검사 횟수': '16 번', '찾은 충돌': 'J5 ↔ 벽 (2 자세)', 판정: '맞음' } },
  },
  {
    topic: '6-2',
    note: 'B 는 책상 클릭을 window.__learnPick 으로 대신한다 — 벽(x 110~260, y ±15, 높이 170) 바로 위 양쪽에 경유점 두 개.',
    A: { do: [{ click: '그냥 직선' }], expect: { 성공: 'X (J3 가 벽에 닿음)' } },
    B: { do: [{ pick: [150, 40, 0] }, { pick: [150, -40, 0] }, { click: '경유점으로 가기' }], expect: { 성공: 'O' }, timeout: 40000 },
    C: { do: [{ click: 'RRT 로 길 찾기' }, { wait: 9000 }, { click: '다시 찾기' }, { wait: 9000 }, { click: '다시 찾기' }], expect: { 성공: 'O', '계획 시간': '/ ms$/' }, timeout: 40000 },
  },
  {
    topic: '6-3',
    A: { do: [{ click: '바로 집기' }], expect: { 집기: '/^실패 \\(블록 1[789] mm 밀림\\)$/' }, timeout: 40000 },
    B: { do: [{ click: '4단계로 집기' }], expect: { 집기: '성공', '놓은 위치 오차': '/^0\\.\\d mm$/' }, timeout: 40000 },
    C: {
      do: [{ slider: '놓는 높이', value: 0 }, { click: '놓기' }, { wait: 12000 }, { slider: '놓는 높이', value: 1 }, { click: '놓기' }, { wait: 12000 }, { slider: '놓는 높이', value: 2 }, { click: '놓기' }, { slider: '놓는 높이', value: 2 }],
      expect: { 집기: '성공', '부딪는 속도': '0.89 m/s (40 mm)' },
      timeout: 40000,
    },
  },
  {
    topic: '6-4',
    A: { do: [{ click: '느리게' }], expect: { '걸린 시간': '18.8 s', '최대 토크': '/^3[6-8]% /', '탑 기울기': '/^0\\.[3-7] mm$/' }, timeout: 120000 },
    B: { do: [{ click: '빠르게' }], expect: { '걸린 시간': '10.3 s', '최대 토크': '/^6[2-4]% /', '탑 기울기': '/^(1\\.[5-9]|2\\.[01]) mm$/' }, timeout: 120000 },
    C: { do: [{ click: '너무 빠르게' }], expect: { '걸린 시간': '5.3 s', '최대 토크': '/^2[34]\\d% .*넘음$/', '탑 기울기': '/^[78]\\.\\d mm$/' }, timeout: 120000 },
  },
];
