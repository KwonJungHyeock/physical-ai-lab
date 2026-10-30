/**
 * Practice menu of the console, one list per theme.
 *
 * AI 키트: the seven acceptance checks of the proposal ("검수 대응 — 규격서
 * 검수항목 7종": 전 축 구동, 반복 위치제어, RGB/Depth 영상 취득, 비전-로봇 연계,
 * 엔드이펙터 2종 이상 교체 작동, AI 샘플 로컬 실행, ROS/ROS2·API 실행), each
 * turned into a short exercise with a ready program and a progress check.
 * 로봇팔 단독: the same basics on a bare desk, plus the arm-only lessons of the
 * curriculum (드래그 티칭, 좌표로 옮기기, 펜 드로잉, 실린더).
 */

import { COLORS, COLOR_TO_BIN, type ColorName, type Theme } from './board';
import { demoFor, joints as jointSweep } from './demos';
import { SCENES, activeDesk } from './desk';
import { EFFECTOR_BY_ID, armGripper, type EffectorId } from './effectors';
import { starterProgram, type CameraId } from './program';
import { PY_PRACTICES, ROS_PRACTICES } from './practicesPy';
import { blocksOnSpots, blocksSorted, mission, type MissionStatus, type WorldState } from './sim';
import type { PyResult } from '../python/types';
import { activeArm, adaptBlocks, adaptPython } from '../robot/arms';

/** 초급 = blocks, 중급 = Python (pymycobot), 고급 = ROS 2 (rclpy). */
export type Level = 'basic' | 'python' | 'ros';
export const LEVELS: readonly { id: Level; name: string; short: string }[] = [
  { id: 'basic', name: '초급 · 블록 코딩', short: '초급' },
  { id: 'python', name: '중급 · 파이썬', short: '중급' },
  { id: 'ros', name: '고급 · ROS 2', short: '고급' },
];

/** What happened in this browser tab across runs (the world is reset every run). */
export interface Session {
  /** Tools that have carried a block to its place in a successful run. */
  pickTools: Set<EffectorId>;
  /** Cameras that delivered an image (find, or the photo button). */
  cameras: Set<CameraId>;
  /** Image-processing runs ("영상처리 실행"), in the browser or on the robot. */
  visionRuns: number;
  /** Programs handed to the robot API: copied/downloaded pymycobot code, or run on the robot. */
  apiRuns: number;
  /** Nodes, topics and messages of the latest ROS 2 run (고급). */
  lastRos?: PyResult['ros'];
}

export function newSession(): Session {
  return { pickTools: new Set(), cameras: new Set(), visionRuns: 0, apiRuns: 0 };
}

export type PracticeId =
  | 'free'
  | 'joints'
  | 'repeat'
  | 'image'
  | 'vision'
  | 'tools'
  | 'ai'
  | 'api'
  | 'teach'
  | 'place'
  | 'pen'
  | 'press'
  | 'topic'
  | 'timer'
  | 'rosrun'
  | 'demo';

export interface Practice {
  id: PracticeId;
  /** Acceptance check number in the proposal (1–7), when the practice is one. */
  check?: number;
  title: string;
  /** One line: what to do. */
  goal: string;
  effector: EffectorId;
  cameraFlange?: boolean;
  /** Extra action the practice card offers. */
  action?: 'photo' | 'vision' | 'api';
  starter(effector: EffectorId, theme: Theme): string;
  progress(w: WorldState, s: Session): MissionStatus;
}

/** The observation pose, then every joint turned both ways and back, one at a time. */
const ALL_JOINTS = `from edu import robot

robot.set_speed(35)
robot.home()
robot.move_joint(1, 40)
robot.move_joint(1, -40)
robot.move_joint(1, 0)
robot.move_joint(2, 15)
robot.move_joint(2, 46)
robot.move_joint(3, -60)
robot.move_joint(3, -92)
robot.move_joint(4, -10)
robot.move_joint(4, -50)
robot.move_joint(4, -41)
robot.move_joint(5, 40)
robot.move_joint(5, -40)
robot.move_joint(5, 2)
robot.move_joint(6, 90)
robot.move_joint(6, -90)
robot.move_joint(6, 10)
robot.home()
`;

/** x on this arm's mat (the bigger 320 works further out, mechArm 270 closer in; the 280: as written). */
const X = (x: number) => x + activeArm().matShiftMm;

const REPEAT = () => `from edu import robot

robot.home()
for _ in range(5):
    robot.move_to(${X(160)}, 0, 60)
    robot.move_to(${X(160)}, 0, 120)
robot.home()
`;

const IMAGE = `from edu import robot, camera, hand_camera

robot.home()
a = camera.find("빨강")
robot.move_to(200, -40, 130)
b = hand_camera.find("빨강")
robot.home()
`;

/** The official colour program for all four blocks: red → D, green → C, blue → A, yellow → B. */
function sortAll(effector: EffectorId): string {
  const grip = EFFECTOR_BY_ID[effector].kind === 'grip';
  const [grab, release] = grip ? ['robot.gripper.close()', 'robot.gripper.open()'] : ['robot.pump.on()', 'robot.pump.off()'];
  const one = (c: ColorName) => `robot.home()
block = camera.find("${c}")
robot.move_above(block)
robot.move_down(block)
${grab}
robot.move_above(block)
robot.move_above("분류함 ${COLOR_TO_BIN[c]}")
${release}`;
  return `from edu import robot, camera

${release}
${(['빨강', '초록', '파랑', '노랑'] as ColorName[]).map(one).join('\n')}
robot.home()
`;
}

const API = `from edu import robot

robot.home()
robot.move_to(160, 0, 120)
robot.move_to(160, -60, 120)
robot.move_to(160, 60, 120)
robot.home()
`;

/** Arm only: every block to its square on the mat, by name (no camera on a bare desk). */
function placeAll(effector: EffectorId): string {
  const grip = EFFECTOR_BY_ID[effector].kind === 'grip';
  const [grab, release] = grip ? ['robot.gripper.close()', 'robot.gripper.open()'] : ['robot.pump.on()', 'robot.pump.off()'];
  const pairs: [ColorName, string][] = [
    ['빨강', '자리 1'],
    ['초록', '자리 2'],
    ['노랑', '자리 3'],
    ['파랑', '자리 4'],
  ];
  const one = ([c, spot]: [ColorName, string]) => `robot.move_above("${c} 블록")
robot.move_down("${c} 블록")
${grab}
robot.move_above("${c} 블록")
robot.move_above("${spot}")
robot.move_down("${spot}")
${release}
robot.move_above("${spot}")`;
  return `from edu import robot

robot.home()
${release}
${pairs.map(one).join('\n')}
robot.home()
`;
}

const TEACH = `from edu import robot

robot.home()
# 왼쪽 [자세]에서 자세를 3개 기록한 뒤 실행해요.
robot.go_pose("내 자세 1")
robot.go_pose("내 자세 2")
robot.go_pose("내 자세 3")
robot.home()
`;

/** Most arrivals at one spot (within 1 mm of each other). */
function repeatCount(w: WorldState): number {
  let best = 0;
  for (const a of w.stats.arrivals) {
    const n = w.stats.arrivals.filter((b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) < 1).length;
    best = Math.max(best, n);
  }
  return best;
}

/** Joints that turned at least 30° during the run. */
function jointsMoved(w: WorldState): number {
  return w.stats.jointMin.filter((lo, i) => w.stats.jointMax[i] - lo >= 30).length;
}

const JOINTS: Practice = {
  id: 'joints',
  check: 1,
  title: '전 축 구동',
  goal: '6개 관절을 하나씩 양쪽으로 30° 넘게 돌려 봐요.',
  effector: 'pump',
  starter: () => ALL_JOINTS,
  progress: (w) => ({ title: '관절 6개 모두 움직이기', done: jointsMoved(w), total: 6 }),
};

const REPEATED: Practice = {
  id: 'repeat',
  check: 2,
  title: '반복 위치제어',
  goal: '같은 점에 5번 갔다 와요. 실제 로봇에서는 도착 오차를 재서 보여 줘요.',
  effector: 'pump',
  starter: () => REPEAT(),
  progress: (w) => ({ title: '같은 점에 5번 가기', done: Math.min(5, repeatCount(w)), total: 5 }),
};

function toolsProgress(w: WorldState, s: Session): MissionStatus {
  return { title: '도구 2종으로 블록 옮기기', done: Math.min(2, s.pickTools.size), total: 2 };
}

const PEN: Practice = {
  id: 'pen',
  title: '펜 드로잉',
  goal: '펜을 내리고 선을 그어 20cm 넘게 그려요.',
  effector: 'pen',
  starter: (e, t) => starterProgram(e, t),
  progress: (w) => mission(w),
};

const PRESS: Practice = {
  id: 'press',
  title: '실린더로 버튼 누르기',
  goal: '실린더로 버튼을 3번 눌러요.',
  effector: 'cylinder',
  starter: (e, t) => starterProgram(e, t),
  progress: (w) => mission(w),
};

const FREE: Practice = {
  id: 'free',
  title: '자유 실습',
  goal: '도구를 골라 마음대로 프로그램을 만들어요.',
  effector: 'pump',
  starter: (e, t) => starterProgram(e, t),
  progress: (w) => mission(w),
};

export const PRACTICES: Record<Theme, readonly Practice[]> = {
  kit: [
    JOINTS,
    REPEATED,
    {
      id: 'image',
      check: 3,
      title: '영상 취득',
      goal: '키트 카메라(고정)와 손 카메라(카메라 플랜지)로 한 장씩 찍어요.',
      effector: 'pump',
      cameraFlange: true,
      action: 'photo',
      starter: () => IMAGE,
      progress: (_w, s) => ({ title: '카메라 2대로 찍기', done: s.cameras.size, total: 2 }),
    },
    {
      id: 'vision',
      check: 4,
      title: '비전-로봇 연계',
      goal: '카메라로 블록 4개를 찾아 색깔별 분류함에 넣어요.',
      effector: 'pump',
      starter: (e) => sortAll(e),
      progress: (w) => ({ title: '색깔별로 분류함에 넣기', done: blocksSorted(w), total: COLORS.length }),
    },
    {
      id: 'tools',
      check: 5,
      title: '엔드이펙터 교체',
      goal: '어댑티브 그리퍼로 옮긴 뒤, 흡착 펌프로 바꿔 한 번 더 옮겨요.',
      effector: 'adaptive',
      starter: (e, t) => starterProgram(e, t),
      progress: toolsProgress,
    },
    {
      id: 'ai',
      check: 6,
      title: 'AI 샘플 로컬 실행',
      goal: '로봇에 연결하면 [AI 샘플 실행]으로 로봇(RDK X5) 안에서 YOLO 물체 인식을 돌려요. 로봇 없이는 색 인식으로 연습해요.',
      effector: 'pump',
      action: 'vision',
      starter: () => `from edu import robot, camera\n\nrobot.home()\nblock = camera.find("빨강")\n`,
      progress: (_w, s) => ({ title: '영상처리 실행', done: Math.min(1, s.visionRuns), total: 1 }),
    },
    {
      id: 'api',
      check: 7,
      title: 'ROS 2 · API 실행',
      goal: '시뮬레이션이 통과한 프로그램을 파이썬 API(pymycobot) 코드로 받아 로봇에서 실행해요.',
      effector: 'pump',
      action: 'api',
      starter: () => API,
      progress: (_w, s) => ({ title: 'API 로 실행', done: Math.min(1, s.apiRuns), total: 1 }),
    },
    FREE,
  ],
  arm: [
    JOINTS,
    REPEATED,
    {
      id: 'teach',
      title: '드래그 티칭',
      goal: '손으로 팔을 옮겨 자세 3개를 기록하고, 그대로 다시 움직여요.',
      effector: 'pump',
      starter: () => TEACH,
      progress: (w) => ({ title: '기록한 자세 3개로 가기', done: Math.min(3, new Set(w.stats.posesUsed).size), total: 3 }),
    },
    {
      id: 'place',
      title: '블록 옮기기',
      goal: '블록 4개를 작업 매트의 자리 1~4로 옮겨요.',
      effector: 'pump',
      starter: (e) => placeAll(e),
      progress: (w) => ({ title: '블록을 자리 1~4로 옮기기', done: blocksOnSpots(w), total: COLORS.length }),
    },
    {
      id: 'tools',
      check: 5,
      title: '엔드이펙터 교체',
      goal: '어댑티브 그리퍼로 옮긴 뒤, 흡착 펌프로 바꿔 한 번 더 옮겨요.',
      effector: 'adaptive',
      starter: (e, t) => starterProgram(e, t),
      progress: toolsProgress,
    },
    PEN,
    PRESS,
    FREE,
  ],
};

export function practicesFor(level: Level, theme: Theme): readonly Practice[] {
  const list = level === 'python' ? PY_PRACTICES[theme] : level === 'ros' ? ROS_PRACTICES[theme] : PRACTICES[theme];
  const arm = activeArm();
  if (arm.id === 'mycobot280-rdkx5') return list;
  // Another arm: its own tools (its gripper, armGripper, for one it does not have), no hand-camera
  // practices without a camera flange, and Python with its own class, port and ready pose.
  // A drawing or pressing practice needs that very tool, and 도구 2종 needs two picking tools: an arm
  // without them (OMX-F: its own gripper only) leaves them out.
  const pickers = arm.tools.filter((t) => ['grip', 'suction'].includes(EFFECTOR_BY_ID[t].kind)).length;
  return list
    .filter((p) => arm.cameraFlange || !p.cameraFlange)
    .filter((p) => arm.tools.includes(p.effector) || !['pen', 'press'].includes(EFFECTOR_BY_ID[p.effector].kind))
    .filter((p) => p.id !== 'tools' || pickers >= 2)
    .map((p) => {
      const effector = arm.tools.includes(p.effector) ? p.effector : armGripper(arm.tools);
      let goal = effector === p.effector ? p.goal : p.goal.replace(EFFECTOR_BY_ID[p.effector].name, EFFECTOR_BY_ID[effector].name);
      if (arm.dof !== 6) goal = goal.replace('6개 관절', `${arm.dof}개 관절`);
      // 전 축 구동 counts the arm's own joints.
      const progress: Practice['progress'] =
        p.id === 'joints' && arm.dof !== 6 ? (w, s) => ({ ...p.progress(w, s), title: `관절 ${arm.dof}개 모두 움직이기`, total: arm.dof }) : p.progress;
      // 전 축 구동's starter is the 280's angles: another arm sweeps each joint from its own ready pose.
      const sweep = p.id === 'joints' && arm.family !== 'mycobot280';
      return level === 'basic'
        ? { ...p, effector, goal, progress, starter: (e: EffectorId, t: Theme) => (sweep ? jointSweep(arm).code : adaptBlocks(p.starter(e, t), arm)) }
        : { ...p, effector, goal, progress, starter: (e: EffectorId, t: Theme) => adaptPython(p.starter(e, t), arm) };
    });
}

/**
 * The ▶ 데모 of the open 실습 환경 as a block program ([블록으로 보기]): to run again or change. Not in the
 * task lists; its program is the demo of the scene on the desk now.
 */
function demoPractice(theme: Theme): Practice {
  const scene = theme === 'kit' ? 'kit' : activeDesk().scene;
  return {
    id: 'demo',
    title: '데모 따라 하기',
    goal: '데모와 같은 움직임의 블록 프로그램이에요. 블록을 바꿔 [시뮬레이션] 해 봐요.',
    effector: demoFor(scene).effector,
    starter: () => demoFor(scene).code,
    progress: () => ({ title: '데모 프로그램 돌려 보기', done: 0, total: 0 }),
  };
}

export function practiceFor(level: Level, theme: Theme, id: PracticeId): Practice {
  if (id === 'demo' && level === 'basic') return demoPractice(theme);
  const list = practicesFor(level, theme);
  return list.find((p) => p.id === id) ?? list[0];
}

/**
 * The tool a practice's program works with, or null when it only moves the arm (any tool, or none,
 * will do). The console starts with no tool on; a practice that needs one asks for it ([끼우기]).
 */
export function toolNeeded(p: Practice, theme: Theme): EffectorId | null {
  if (p.effector === 'none') return null;
  const kind = EFFECTOR_BY_ID[p.effector].kind;
  if (kind === 'pen' || kind === 'press') return p.effector;
  return /robot\.(gripper|pump)\b|set_gripper|def grip|grip\((True|False)\)|set_basic_output|pump_o(n|ff)/.test(p.starter(p.effector, theme)) ? p.effector : null;
}

/** Whether the fitted tool does the job of the one a practice needs (any gripper or the pump picks a block). */
export function toolFits(need: EffectorId, fitted: EffectorId): boolean {
  const kind = EFFECTOR_BY_ID[need].kind;
  if (kind === 'pen' || kind === 'press') return fitted === need;
  const has = EFFECTOR_BY_ID[fitted].kind;
  return has === 'grip' || has === 'suction';
}

/** The practice's ready program for the fitted tool, or for the tool it needs while that is not on yet. */
export function starterFor(p: Practice, fitted: EffectorId, theme: Theme): string {
  const need = toolNeeded(p, theme);
  return p.starter(need && !toolFits(need, fitted) ? need : fitted, theme);
}

/** Every starter text of every practice, to tell an untouched program from the student's own. */
export function isStarter(code: string): boolean {
  const effectors = Object.keys(EFFECTOR_BY_ID) as EffectorId[];
  for (const level of ['basic', 'python', 'ros'] as Level[]) {
    for (const theme of ['kit', 'arm'] as Theme[]) {
      for (const p of practicesFor(level, theme)) {
        for (const e of effectors) if (p.starter(e, theme) === code) return true;
      }
    }
  }
  return SCENES.some((s) => demoFor(s.id).code === code);
}

/**
 * Repeatability from the real robot's own measurements (robot-python/server
 * server: commanded and settled joint angles of every move). The arrivals of
 * the most repeated target: how far apart the tool tip landed (largest distance
 * from their mean) and how far that mean is from the commanded point. Null when
 * no target was visited twice.
 */
export function repeatability(
  arrivals: readonly { target: number[]; actual: number[] }[],
  tip: (angles: number[]) => { x: number; y: number; z: number },
): { count: number; spreadMm: number; offsetMm: number } | null {
  const groups = new Map<string, { target: number[]; actual: number[][] }>();
  for (const a of arrivals) {
    const key = a.target.map((v) => Math.round(v * 2) / 2).join(',');
    const g = groups.get(key) ?? { target: a.target, actual: [] };
    g.actual.push(a.actual);
    groups.set(key, g);
  }
  const best = [...groups.values()].sort((a, b) => b.actual.length - a.actual.length)[0];
  if (!best || best.actual.length < 2) return null;
  const pts = best.actual.map(tip);
  const mean = pts.reduce((m, p) => ({ x: m.x + p.x / pts.length, y: m.y + p.y / pts.length, z: m.z + p.z / pts.length }), { x: 0, y: 0, z: 0 });
  const dist = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
  return {
    count: pts.length,
    spreadMm: Math.max(...pts.map((p) => dist(p, mean))),
    offsetMm: dist(tip(best.target), mean),
  };
}

/** Did this run carry a block to where it belongs (kit: its bin; arm: a spot)? */
export function placedBlocks(w: WorldState): number {
  return w.theme === 'kit' ? blocksSorted(w) : blocksOnSpots(w);
}

