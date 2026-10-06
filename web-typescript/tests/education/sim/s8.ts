import type { TopicScenario } from './types';

/** 학문 8 — what to press for each try and what its results must say. */
export const S8: TopicScenario[] = [
  {
    topic: '8-1',
    A: { do: [{ click: '자동 시연' }], expect: { '시연 수': '1', 결과: '집음', '거리 오차': '/^[0-4]\\.\\d mm$/' } },
    B: { do: [{ click: '블록 옮기기' }, { click: '재생' }], expect: { '시연 수': '1', '블록 위치': '(175, 70)', 결과: '허공', '거리 오차': '/^1(0[5-9]|1[0-4])\\.\\d mm$/' } },
    C: {
      do: [{ click: '시연 3개 자동 기록' }, { wait: 15000 }, { click: '배운 대로 하기' }],
      expect: { '시연 수': '3', '블록 위치': '(205, 5)', 결과: '집음', '섞은 비율': '시연 2 47%' },
      timeout: 40000,
    },
  },
  {
    topic: '8-2',
    note: 'The physics (Rapier) loads when the topic opens; the buttons wait for it. On a busy machine (software WebGL) a run is slow, hence the long timeouts.',
    A: { do: [{ wait: 15000 }, { click: '실행' }], expect: { 성공: '1 / 1', '찾은 위치 오차': '/^[0-2]\\.\\d mm$/', '놓은 위치 오차': '/^[0-2]\\.\\d mm$/', '칸막이 충돌': '0' }, timeout: 700000 },
    B: { do: [{ click: '무작위 자리로 5번' }], expect: { 성공: '5 / 5', '찾은 위치 오차': '/^[0-2]\\.\\d mm/', '칸막이 충돌': '0' }, timeout: 2400000 },
    C: { do: [{ click: '블록 3개 무작위 배치' }, { click: '실행' }], expect: { 성공: '3 / 3 (색 맞음)', '찾은 위치 오차': '/^[0-2]\\.\\d mm/', '칸막이 충돌': '0' }, timeout: 1500000 },
  },
];
