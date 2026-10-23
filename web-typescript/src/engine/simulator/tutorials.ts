/**
 * 코딩 튜토리얼: the way a practice's example program is learnt, without typing it from scratch.
 * Each practice gets a few steps; each step names the yellow places (slots) to change — the rest of
 * the program stays locked until the student opens it for full editing — and a mission adds a
 * ready code snippet with one press.
 *
 * A slot is found in the program by a regular expression whose first group is the part that may be
 * changed (so it is found again after other edits); `all` changes every match together (the same
 * block named in three lines). Practices without their own tutorial get a plain one: run it, change
 * the numbers, add a snippet.
 *
 * Checked by tests/simulator/tutorial-check (every slot is found in its example; every snippet
 * keeps the program valid).
 */

import type { Theme } from './board';
import type { PracticeId } from './practices';
import type { Level } from './practices';

export interface SlotDef {
  re: RegExp;
  label: string;
  /** Which match (0 = first); ignored with `all`. */
  nth?: number;
  /** Change every match together. */
  all?: boolean;
  /** The values to choose from (a list instead of typing). */
  choices?: readonly string[];
}

export interface TutStep {
  title: string;
  text: string;
  /** The slots this step asks to change (indices into `slots`). */
  slots: number[];
}

export interface Snippet {
  label: string;
  code: string;
  /** Where it goes instead of before the program's last return home: a change of its own. */
  apply?: (code: string) => string;
}

export interface Tutorial {
  steps: TutStep[];
  slots: SlotDef[];
  snippets: Snippet[];
}

/** A slot found in the program: where its changeable part is (string offsets) and its value. */
export interface SlotHit {
  index: number;
  label: string;
  value: string;
  start: number;
  end: number;
  /** 1-based line. */
  line: number;
  choices?: readonly string[];
}

const COLORS = ['빨강', '노랑', '초록', '파랑'] as const;
const SPOTS = ['자리 1', '자리 2', '자리 3', '자리 4'] as const;
const NUM = String.raw`-?\d+(?:\.\d+)?`;

const run = (text: string): TutStep => ({ title: '그대로 실행', text, slots: [] });

/* --- snippets ---------------------------------------------------------------- */

const BASIC_SNIPPETS: Snippet[] = [
  { label: '1초 쉬기', code: 'robot.wait(1)' },
  { label: '1번 관절 흔들기 3번', code: 'for _ in range(3):\n    robot.move_joint(1, 30)\n    robot.move_joint(1, -30)' },
  { label: '블록 한 번에 옮기기', code: 'robot.pick_place("빨강 블록", "자리 1")' },
  { label: '네모 그리기', code: 'robot.draw_shape("네모", 6)' },
];
const PY_SNIPPETS: Snippet[] = [
  { label: '지금 각도 출력', code: 'print("지금 각도:", mc.get_angles())' },
  { label: '1초 쉬기', code: 'time.sleep(1)' },
  { label: '1번 관절 흔들기 3번', code: 'for i in range(3):\n    mc.send_angle(1, 30, 40)\n    time.sleep(1)\n    mc.send_angle(1, -30, 40)\n    time.sleep(1)' },
  { label: '좌표로 가기', code: 'mc.sync_send_coords([180, 0, 200, -180, 0, -90], 40)' },
];
const ROS_SNIPPETS: Snippet[] = [
  {
    label: '자세 하나 더 넣기',
    code: '[-30, 20, -60, -40, 0, 0]',
    apply: (c) => c.replace(/POSES = \[HOME, /, 'POSES = [HOME, [-30, 20, -60, -40, 0, 0], '),
  },
  {
    label: '시작할 때 로그 남기기',
    code: 'self.get_logger().info("노드를 시작했어요")',
    apply: (c) => c.replace(/(\n(\s+)self\.k = 0\n)/, '$1$2self.get_logger().info("노드를 시작했어요")\n'),
  },
];

/* --- authored tutorials -------------------------------------------------------- */

const basicCarry = (grip: boolean): Tutorial => ({
  steps: [
    run('▶ 시뮬레이션을 눌러 로봇이 블록을 어떻게 옮기는지 먼저 보세요.'),
    { title: '블록 바꾸기', text: '노란 칸 1 을 눌러 옮길 블록의 색을 바꿔요. 세 줄이 함께 바뀌어요.', slots: [0] },
    { title: '자리 바꾸기', text: `노란 칸 2 를 눌러 내려놓을 자리를 바꾸고 다시 실행해요.`, slots: [1] },
    { title: '미션', text: `아래 코드 조각 [블록 한 번에 옮기기]를 넣어 블록을 하나 더 옮겨 보세요. ${grip ? '그리퍼' : '흡착 펌프'}로 해요.`, slots: [] },
  ],
  slots: [
    { re: /"(빨강|노랑|초록|파랑) 블록"/g, label: '블록 색', all: true, choices: COLORS },
    { re: /"(자리 [1-4])"/g, label: '놓을 자리', all: true, choices: SPOTS },
  ],
  snippets: BASIC_SNIPPETS,
});

const AUTHORED: Partial<Record<Level, Partial<Record<PracticeId, Tutorial>>>> = {
  basic: {
    joints: {
      steps: [
        run('▶ 시뮬레이션을 눌러 관절 6개가 차례로 움직이는 것을 보세요.'),
        { title: '속도 바꾸기', text: '노란 칸 1 의 속도를 20 ~ 50 사이로 바꿔 보세요.', slots: [0] },
        { title: '각도 바꾸기', text: '노란 칸 2 · 3 의 각도를 바꿔 1번 관절이 더 크게 돌게 해요.', slots: [1, 2] },
        { title: '미션', text: '코드 조각 [1초 쉬기]를 넣어 마지막에 잠깐 멈추게 해 보세요.', slots: [] },
      ],
      slots: [
        { re: new RegExp(String.raw`robot\.set_speed\((${NUM})\)`, 'g'), label: '속도' },
        { re: new RegExp(String.raw`robot\.move_joint\(1, (${NUM})\)`, 'g'), label: '1번 관절 왼쪽 끝', nth: 0 },
        { re: new RegExp(String.raw`robot\.move_joint\(1, (${NUM})\)`, 'g'), label: '1번 관절 오른쪽 끝', nth: 1 },
      ],
      snippets: BASIC_SNIPPETS,
    },
    repeat: {
      steps: [
        run('▶ 시뮬레이션을 눌러 같은 점을 몇 번 오가는지 세어 보세요.'),
        { title: '횟수 바꾸기', text: '노란 칸 1 의 반복 횟수를 바꿔요.', slots: [0] },
        { title: '높이 바꾸기', text: '노란 칸 2 · 3 의 높이(mm)를 바꿔 오르내리는 폭을 바꿔요.', slots: [1, 2] },
        { title: '미션', text: '코드 조각 [1초 쉬기]를 넣어 돌아오기 전에 쉬게 해 보세요.', slots: [] },
      ],
      slots: [
        { re: /range\((\d+)\)/g, label: '반복 횟수' },
        { re: new RegExp(String.raw`robot\.move_to\(${NUM}, ${NUM}, (${NUM})\)`, 'g'), label: '아래 높이', nth: 0 },
        { re: new RegExp(String.raw`robot\.move_to\(${NUM}, ${NUM}, (${NUM})\)`, 'g'), label: '위 높이', nth: 1 },
      ],
      snippets: BASIC_SNIPPETS,
    },
    teach: {
      steps: [
        { title: '자세 기록', text: '[자세]에서 자세 3개를 「내 자세 1~3」 이름으로 저장하세요.', slots: [] },
        run('▶ 시뮬레이션을 눌러 기록한 자세를 차례로 도는지 보세요.'),
        { title: '순서 바꾸기', text: '노란 칸의 자세 이름을 바꿔 도는 순서를 바꿔요.', slots: [0, 1] },
      ],
      slots: [
        { re: /robot\.go_pose\("([^"]+)"\)/g, label: '첫 자세', nth: 0 },
        { re: /robot\.go_pose\("([^"]+)"\)/g, label: '둘째 자세', nth: 1 },
      ],
      snippets: BASIC_SNIPPETS,
    },
    tools: basicCarry(true),
    free: basicCarry(false),
    place: basicCarry(true),
    pen: {
      steps: [
        run('▶ 시뮬레이션을 눌러 펜으로 네모를 그리는 것을 보세요.'),
        { title: '크기 바꾸기', text: '노란 칸 1 의 X(앞쪽 끝)를 바꾸면 네모가 길어지거나 짧아져요.', slots: [0] },
        { title: '미션', text: '코드 조각 [네모 그리기]를 넣어 한 줄로 네모를 하나 더 그려 보세요.', slots: [] },
      ],
      slots: [{ re: /robot\.move_to\((\d+), -?\d+, 0\)/g, label: '앞쪽 끝 X', nth: 1 }],
      snippets: BASIC_SNIPPETS,
    },
    press: {
      steps: [
        run('▶ 시뮬레이션을 눌러 버튼을 몇 번 누르는지 세어 보세요.'),
        { title: '횟수 바꾸기', text: '노란 칸 1 의 누르는 횟수를 바꿔요.', slots: [0] },
      ],
      slots: [{ re: /range\((\d+)\)/g, label: '누르는 횟수' }],
      snippets: BASIC_SNIPPETS,
    },
  },
  python: {
    joints: {
      steps: [
        run('▶ 시뮬레이션을 눌러 관절이 하나씩 움직이는 것과 출력 창을 보세요.'),
        { title: '각도 바꾸기', text: '노란 칸 1 의 돌릴 각도를 바꿔요.', slots: [0] },
        { title: '시간 바꾸기', text: '노란 칸 2 · 3 의 속도와 쉬는 시간을 바꿔 빠르기를 비교해요.', slots: [1, 2] },
        { title: '미션', text: '코드 조각 [지금 각도 출력]을 넣어 마지막 각도를 출력해 보세요.', slots: [] },
      ],
      slots: [
        { re: /for delta in \((\d+), /g, label: '돌릴 각도' },
        { re: /mc\.send_angle\(joint, home\[joint - 1\] \+ delta, (\d+)\)/g, label: '속도' },
        { re: new RegExp(String.raw`time\.sleep\((${NUM})\)`, 'g'), label: '쉬는 시간', nth: 0 },
      ],
      snippets: PY_SNIPPETS,
    },
    repeat: {
      steps: [
        run('▶ 시뮬레이션을 눌러 같은 점에 5번 가고 출력된 좌표를 보세요.'),
        { title: '점 바꾸기', text: '노란 칸 1 · 2 의 x, y 를 바꿔 다른 점으로 가게 해요.', slots: [0, 1] },
        { title: '횟수 바꾸기', text: '노란 칸 3 의 반복 횟수를 바꿔요.', slots: [2] },
        { title: '미션', text: '코드 조각 [1초 쉬기]를 넣어 보세요.', slots: [] },
      ],
      slots: [
        { re: /point = \[(-?\d+), /g, label: 'x (mm)' },
        { re: /point = \[-?\d+, (-?\d+), /g, label: 'y (mm)' },
        { re: /for i in range\((\d+)\)/g, label: '반복 횟수' },
      ],
      snippets: PY_SNIPPETS,
    },
    tools: pyCarry(),
    place: pyCarry(),
    api: pyTwoPoints(),
    free: pyTwoPoints(),
  },
  ros: {
    topic: rosPoses(),
    rosrun: rosPoses(),
    free: rosPoses(),
    timer: {
      steps: [
        run('▶ 시뮬레이션을 눌러 타이머가 팔을 흔드는 것을 보세요.'),
        { title: '크기 바꾸기', text: '노란 칸 1 의 흔드는 크기(°)를 바꿔요.', slots: [0] },
        { title: '빠르기 바꾸기', text: '노란 칸 2 의 타이머 간격(초)을 바꿔 빠르기를 비교해요.', slots: [1] },
        { title: '미션', text: '노란 칸 3 의 횟수를 바꾸고 코드 조각으로 시작 로그를 남겨 보세요.', slots: [2] },
      ],
      slots: [
        { re: /pose\[0\] = (\d+) \* math\.sin/g, label: '흔드는 크기 (°)' },
        { re: new RegExp(String.raw`create_timer\((${NUM}), self\.tick\)`, 'g'), label: '간격 (초)' },
        { re: /if self\.k > (\d+):/g, label: '횟수' },
      ],
      snippets: ROS_SNIPPETS,
    },
  },
};

function pyCarry(): Tutorial {
  return {
    steps: [
      run('▶ 시뮬레이션을 눌러 블록을 집어 자리에 놓는 것을 보세요.'),
      { title: '블록 위치', text: '노란 칸 1 · 2 의 블록 위치(x, y)를 다른 블록 위치로 바꿔요.', slots: [0, 1] },
      { title: '놓을 곳', text: '노란 칸 3 · 4 의 놓을 곳 좌표를 바꿔요. 두 줄이 함께 바뀌어요.', slots: [2, 3] },
      { title: '미션', text: '코드 조각 [지금 각도 출력]을 넣어 끝난 자세를 출력해 보세요.', slots: [] },
    ],
    slots: [
      { re: /block = \[(-?\d+), /g, label: '블록 x (mm)' },
      { re: /block = \[-?\d+, (-?\d+)\]/g, label: '블록 y (mm)' },
      { re: /mc\.sync_send_coords\(\[(-?\d+), -?\d+, \d+, -180, 0, -90\], \d+\)/g, label: '놓을 곳 x', all: true },
      { re: /mc\.sync_send_coords\(\[-?\d+, (-?\d+), \d+, -180, 0, -90\], \d+\)/g, label: '놓을 곳 y', all: true },
    ],
    snippets: PY_SNIPPETS,
  };
}

function pyTwoPoints(): Tutorial {
  return {
    steps: [
      run('▶ 시뮬레이션을 눌러 두 점을 오가는 것을 보세요.'),
      { title: '점 바꾸기', text: '노란 칸 1 · 2 의 y 를 바꿔 오가는 폭을 바꿔요.', slots: [0, 1] },
      { title: '높이 바꾸기', text: '노란 칸 3 의 높이 z 를 바꿔요. 두 줄이 함께 바뀌어요.', slots: [2] },
      { title: '미션', text: '코드 조각 [1번 관절 흔들기 3번]을 넣어 보세요.', slots: [] },
    ],
    slots: [
      { re: /mc\.sync_send_coords\(\[-?\d+, (-?\d+), \d+, /g, label: '첫 점 y', nth: 0 },
      { re: /mc\.sync_send_coords\(\[-?\d+, (-?\d+), \d+, /g, label: '둘째 점 y', nth: 1 },
      { re: /mc\.sync_send_coords\(\[-?\d+, -?\d+, (\d+), /g, label: '높이 z', all: true },
    ],
    snippets: PY_SNIPPETS,
  };
}

function rosPoses(): Tutorial {
  return {
    steps: [
      run('▶ 시뮬레이션을 눌러 노드가 자세를 차례로 보내는 것을 보세요.'),
      { title: '자세 바꾸기', text: '노란 칸 1 의 셋째 자세 1번 관절 각도를 바꿔요.', slots: [0] },
      { title: '간격 바꾸기', text: '노란 칸 2 의 타이머 간격(초)을 바꿔요.', slots: [1] },
      { title: '미션', text: '코드 조각 [자세 하나 더 넣기]로 자세를 하나 더 보내 보세요.', slots: [] },
    ],
    slots: [
      { re: /\[(-?\d+), 20, -60, -40, 0, 0\], HOME\]/g, label: '1번 관절 (°)' },
      { re: new RegExp(String.raw`create_timer\((${NUM}), self\.send_next\)`, 'g'), label: '간격 (초)' },
    ],
    snippets: ROS_SNIPPETS,
  };
}

/** Any practice without its own: run it, change its numbers, add a snippet. */
function plain(level: Level): Tutorial {
  const slots: SlotDef[] =
    level === 'basic'
      ? [
          { re: new RegExp(String.raw`robot\.set_speed\((${NUM})\)`, 'g'), label: '속도' },
          { re: /range\((\d+)\)/g, label: '반복 횟수' },
          { re: new RegExp(String.raw`robot\.wait\((${NUM})\)`, 'g'), label: '쉬는 시간', nth: 0 },
        ]
      : level === 'python'
        ? [
            { re: /range\((\d+)\)/g, label: '반복 횟수', nth: 0 },
            { re: new RegExp(String.raw`time\.sleep\((${NUM})\)`, 'g'), label: '쉬는 시간', nth: 0 },
          ]
        : [{ re: new RegExp(String.raw`create_timer\((${NUM}), `, 'g'), label: '간격 (초)' }];
  return {
    steps: [run('▶ 시뮬레이션을 눌러 예제가 어떻게 움직이는지 보세요.'), { title: '값 바꾸기', text: '노란 칸의 값을 바꿔 다시 실행해요.', slots: slots.map((_, k) => k) }, { title: '미션', text: '아래 코드 조각을 하나 넣어 보세요.', slots: [] }],
    slots,
    snippets: level === 'basic' ? BASIC_SNIPPETS : level === 'python' ? PY_SNIPPETS : ROS_SNIPPETS,
  };
}

export function tutorialFor(level: Level, _theme: Theme, id: PracticeId): Tutorial {
  return AUTHORED[level]?.[id] ?? plain(level);
}

/* --- slots in a program ------------------------------------------------------- */

/** The slots found in the program (one hit per match for `all` slots, all with the slot's index). */
export function findSlots(code: string, t: Tutorial): SlotHit[] {
  const hits: SlotHit[] = [];
  t.slots.forEach((s, index) => {
    const re = new RegExp(s.re.source, s.re.flags.includes('g') ? s.re.flags : `${s.re.flags}g`);
    const all = [...code.matchAll(re)];
    const pick = s.all ? all : all[s.nth ?? 0] ? [all[s.nth ?? 0]] : [];
    for (const m of pick) {
      if (m[1] === undefined || m.index === undefined) continue;
      const start = m.index + m[0].indexOf(m[1]);
      hits.push({ index, label: s.label, value: m[1], start, end: start + m[1].length, line: code.slice(0, start).split('\n').length, choices: s.choices });
    }
  });
  return hits.sort((a, b) => a.start - b.start);
}

/** The program with every hit of slot `index` set to `value`. */
export function setSlot(code: string, t: Tutorial, index: number, value: string): string {
  const hits = findSlots(code, t)
    .filter((h) => h.index === index)
    .sort((a, b) => b.start - a.start);
  let out = code;
  for (const h of hits) out = out.slice(0, h.start) + value + out.slice(h.end);
  return out;
}

/** Where a snippet goes: before the program's last return home (or at the end). */
export function insertSnippet(code: string, s: Snippet): string {
  if (s.apply) {
    const next = s.apply(code);
    if (next !== code) return next;
  }
  const lines = code.replace(/\n+$/, '').split('\n');
  let at = lines.length;
  for (let k = lines.length - 1; k >= 0; k -= 1) {
    if (/^(robot\.home\(\)|mc\.sync_send_angles\(home, \d+\))\s*(#.*)?$/.test(lines[k])) {
      at = k;
      break;
    }
  }
  lines.splice(at, 0, ...s.code.split('\n'));
  return `${lines.join('\n')}\n`;
}
