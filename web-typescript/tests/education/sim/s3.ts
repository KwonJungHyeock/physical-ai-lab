import type { TopicScenario } from './types';

/** 학문 3 — what to press for each try and what its results must say. */
export const S3: TopicScenario[] = [
  {
    topic: '3-1',
    // A: J1·J2 a little over 100 mm/s, the wrist J5 about half, J6 0.
    A: { do: [{ click: 'J1' }, { click: 'J2' }, { click: 'J5' }, { click: 'J6' }], expect: { '손끝 속도': '/^J1 10\\d · J2 10\\d · J5 5\\d · J6 0 mm\\/s$/' } },
    // B: a tap drives 2 s at 40 mm/s; the fastest joint, about 20 °/s, stays far below 200 °/s.
    B: { do: [{ click: '+x 앞' }], expect: { '손끝 속도': '/^(39|40)\\.\\d mm\\/s/', '최대 관절 속도': '/^[12]\\d °\\/s$/' }, timeout: 60000 },
    // C: stretched out — the joints hit 200 °/s and the tool slows to about 22 mm/s; the ellipsoid is flat.
    C: {
      do: [{ click: '앞으로 쭉 뻗기' }, { wait: 4000 }, { click: '+x 앞' }],
      expect: { '손끝 속도': '/^2[0-4]\\.\\d mm\\/s/', '최대 관절 속도': '200 °/s', '둥근 정도': '/^0\\.0\\d\\d$/' },
      timeout: 60000,
    },
  },
  {
    topic: '3-2',
    A: { do: [{ click: '위치만으로 옮기기' }], expect: { '걸린 시간': '0.12 s', '최대 가속도': '88.2 m/s²', 블록: '떨어짐' } },
    B: { do: [{ click: '일정 속도로 옮기기' }], expect: { '걸린 시간': '0.79 s', '최대 가속도': '30.0 m/s²', 블록: '밀림 (최대 9 mm)' } },
    // C: the trapezoid (0.83 s, 3 m/s²), then once more with the S-curve — the result shown is the S-curve's.
    C: {
      do: [{ click: '사다리꼴' }, { click: '가속도 제한으로 옮기기' }, { wait: 5000 }, { click: 'S자 (5차)' }, { click: '가속도 제한으로 옮기기' }, { wait: 5000 }],
      expect: { '걸린 시간': '1.00 s', '최대 가속도': '1.3 m/s²', 블록: '그대로' },
    },
  },
  {
    topic: '3-3',
    A: { do: [{ click: '멈추며 가기' }], expect: { '걸린 시간': '3.93 s', '경유점에서 벗어남': '0.0 mm' } },
    B: { do: [{ click: '꺾어 가기' }], expect: { '걸린 시간': '3.18 s', '최대 가속도': '12.7 m/s²' } },
    C: { do: [{ slider: '둥글기', value: 20 }, { click: '둥글게 잇기' }], expect: { '걸린 시간': '3.01 s', '최대 가속도': '1.1 m/s²', '경유점에서 벗어남': '8.3 mm' } },
  },
  {
    topic: '3-4',
    A: { do: [{ click: '따로' }], expect: { '걸린 시간': '1.30 s', '관절이 멈춘 시각': '제각각 (0.26~1.30 s)', '손끝 자취': '휘는 모양 바뀜' } },
    B: { do: [{ click: '같은 시간' }], expect: { '걸린 시간': '2.00 s', '관절이 멈춘 시각': '동시에 (2.00 s)', '손끝 자취': '매끄러움' } },
    C: { do: [{ click: '가장 느린 관절에 맞춤' }], expect: { '걸린 시간': '1.30 s', '관절이 멈춘 시각': '동시에 (1.30 s)', '손끝 자취': '매끄러움' } },
  },
];
