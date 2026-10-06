import type { TopicScenario } from './types';

/** 학문 5 — what to press for each try and what its results must say. */
export const S5: TopicScenario[] = [
  {
    topic: '5-1',
    A: { do: [{ click: '짐 0 g' }, { click: '개루프' }], expect: { '멈춘 각도': '/^(59\\.9|60\\.[01])°$/', '남은 오차': '0.1°' } },
    B: { do: [{ click: '짐 250 g' }, { click: '개루프' }], expect: { '멈춘 각도': '/^2[34]\\.\\d°$/', '남은 오차': '/^3[5-7]\\.\\d°$/' } },
    C: { do: [{ click: '짐 250 g' }, { click: 'P 제어' }], expect: { '멈춘 각도': '/^4[67]\\.\\d°$/', '남은 오차': '/^1[23]\\.\\d°$/' } },
  },
  {
    topic: '5-2',
    A: {
      do: [{ slider: 'Kp', value: 2 }, { click: '실행' }, { wait: 6500 }, { slider: 'Kp', value: 10 }, { click: '실행' }, { wait: 6500 }, { slider: 'Kp', value: 4 }, { click: '실행' }, { slider: 'Kp', value: 4 }],
      expect: { 오버슈트: '25 %', '남은 오차': '13.0°' },
    },
    B: { do: [{ click: '실행' }], expect: { 오버슈트: '47 %' } },
    C: { do: [{ click: '실행' }], expect: { 오버슈트: '8 %', '정착 시간': '/^1\\.[12]\\d? s$/', '남은 오차': '0.1°' } },
  },
  {
    topic: '5-3',
    A: { do: [{ click: '느리게 3 초' }], expect: { '최대 추종 오차': '/^(2\\.[5-9]|3\\.[0-4])°$/', '끝난 뒤 ±1° 안까지': '0.00 s' } },
    B: { do: [{ click: '빠르게 1 초' }], expect: { '최대 추종 오차': '/^(5\\.[5-9]|6\\.[0-4])°$/', '끝난 뒤 ±1° 안까지': '/^0\\.[67]\\d s$/' } },
    C: { do: [{ check: '피드포워드', on: true }, { click: '빠르게 1 초' }], expect: { 피드포워드: '켬', '최대 추종 오차': '/^0\\.[01]°$/' } },
  },
  {
    topic: '5-4',
    A: { do: [{ slider: '토크 제한', value: 3 }, { click: '올리기' }], expect: { '누르는 토크': '/^2\\.[56]\\d N·m$/', '누르는 힘': '/^8\\.\\d N$/', '손 없을 때 도착': '/^1\\.[01]\\d s$/' } },
    B: { do: [{ slider: '토크 제한', value: 1.5 }, { click: '올리기' }], expect: { '누르는 토크': '/^1\\.[01]\\d N·m$/', '누르는 힘': '/^3\\.[45] N$/', '손 없을 때 도착': '/^1\\.[45]\\d s$/' } },
    C: { do: [{ slider: '토크 제한', value: 0.6 }, { click: '올리기' }], expect: { '누르는 토크': '/^0\\.[12]\\d N·m$/', '누르는 힘': '/^0\\.[5-7] N$/', '손 없을 때 도착': '/^2\\.[56]\\d s$/' } },
  },
  {
    topic: '5-5',
    A: { do: [{ click: '4곳으로 보내기' }], expect: { '평균 오차': '0.0 mm', '최대 오차': '0.0 mm' } },
    B: { do: [{ slider: 'J2 영점 오차', value: 2 }, { click: '4곳으로 보내기' }], expect: { '평균 오차': '8.4 mm', '최대 오차': '10.1 mm' } },
    C: { do: [{ slider: 'J2 영점 오차', value: 2 }, { click: '측정' }, { click: '보정 계산' }], expect: { '추정한 영점 오차': '1.99°', '평균 오차': '0.0 mm' } },
  },
];
