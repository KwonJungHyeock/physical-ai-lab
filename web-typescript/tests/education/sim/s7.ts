import type { TopicScenario } from './types';

/** 학문 7 — what to press for each try and what its results must say. */
export const S7: TopicScenario[] = [
  {
    topic: '7-1',
    note: 'A·B: the 원고 says "블록 하나를 누른다" — the panel\'s [빨강] button picks the same block as a press on the picture.',
    A: { do: [{ click: '빨강' }], expect: { '위치 단위': 'px', '블록 위치 오차': '/어림 1\\d mm/', 카메라: '고정' } },
    B: { do: [{ click: '보정' }, { click: '빨강' }], expect: { '위치 단위': 'mm', '블록 위치 오차': '/^[345]\\.\\d mm$/', 카메라: '고정' } },
    C: { do: [{ click: '자세 1' }, { wait: 1600 }, { click: '자세 2' }, { wait: 1600 }, { click: '자세 3' }, { wait: 1800 }], expect: { '블록 위치 오차': '/^0\\.\\d mm$/', 카메라: '손 (자세 3개)' } },
  },
  {
    topic: '7-2',
    A: { do: [{ slider: 'H 최소', value: -15 }, { slider: 'H 최대', value: 15 }], expect: { 조건: '-15°~15°', 결과: '찾음' } },
    B: { do: [{ slider: '조명', value: 0.3 }, { click: 'RGB기준' }, { click: 'HSV기준' }], expect: { 조건: '×0.30', 결과: 'RGB 못 찾음 · HSV 찾음' } },
    C: { do: [{ click: '팔로 가리기' }], expect: { 결과: '덩어리 2개', '위치 오차': '/가린 블록 [2-5]\\.\\d px/' } },
  },
  {
    topic: '7-3',
    A: { do: [{ click: '한 번 보고 가기' }], expect: { 방식: '한 번 보고 가기', '평균 추적 오차': '/^(4[5-9]|5[0-6])\\.\\d mm$/', 흔들림: '없음' }, timeout: 60000 },
    B: { do: [{ slider: '이득 K', value: 3 }, { click: '계속 보며 따라가기' }, { click: '이미지 자코비안' }], expect: { 방식: 'K = 3', '평균 추적 오차': '/^(8|9|1[0-2])\\.\\d mm$/', 흔들림: '없음' }, timeout: 60000 },
    C: { do: [{ slider: '이득 K', value: 9 }, { click: '계속 보며 따라가기' }], expect: { 방식: 'K = 9', '평균 추적 오차': '/^(2[0-9])\\.\\d mm$/', 흔들림: '큼' }, timeout: 60000 },
  },
];
