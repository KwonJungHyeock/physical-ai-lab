/**
 * Arm models the simulator can open: their official description (URDF + meshes from Elephant
 * Robotics' mycobot_ros2, BSD; ROBOTIS's open_manipulator for OMX-F, Apache 2.0), joint ranges
 * (pymycobot robot_info.py, the SDK's own table; OMX-F: its motor limits) and the SDK class a
 * program uses. One arm is active at a time (the one chosen on the console's first
 * screen); the simulator's limits, poses and Python header follow it.
 *
 * The real-robot side (robot server, Web Serial) is myCobot 280's: other arms run in simulation.
 */

import type { EffectorId } from '../simulator/effectors';
import { JOINT_ANGLE_MAX, JOINT_ANGLE_MIN, setJointRanges } from './limits';
import { HOME_DEG, setArmLayoutShift } from '../simulator/board';
import type { RobotModelId } from './catalog';

export type ArmFamily = 'mycobot280' | 'mycobot320' | 'mecharm270' | 'mypalletizer260' | 'omx';

/**
 * How the suction pump is switched on this board (Elephant Robotics' own AI-kit scripts,
 * elephantrobotics/mycobot_ros mycobot_ai/…):
 *  - hobot: RDK X5 — Hobot.GPIO, BOARD 31 · 37 (the RDK X5 vision kit);
 *  - rpi: Raspberry Pi / Jetson Nano — RPi.GPIO, BCM 20 · 21, both LOW = on (ai_mycobot_280, ai_mecharm_270);
 *  - basic25: M5Stack — the robot's own outputs, set_basic_output(2 · 5, 0) = on (ai_mycobot_280 m5);
 *  - basic12: myCobot 320 — set_basic_output(1, 0) + (2, 1) = on, off releases with 2 (aikit_320_pi);
 *  - none: no pump for this arm (OMX-F: its own gripper only).
 */
export type PumpWiring = 'hobot' | 'rpi' | 'basic25' | 'basic12' | 'none';

export interface ArmSpec {
  id: RobotModelId;
  family: ArmFamily;
  /** Product and board, for headings. */
  name: string;
  board: string;
  urdf: string;
  /**
   * Model files whose nodes the URDF's mesh names refer to, looked up across all of them (a later
   * file's node wins a shared name). The first is always the RDK X5 file: the tools' meshes.
   */
  glbs: readonly string[];
  /** The link tools are mounted on. */
  flangeLink: string;
  /**
   * Joints of its own: 6, 5 on OMX-F (no sixth wrist joint), or 4 on myPalletizer (its head is
   * kept level by a linkage). Angle lists always have six slots; the slots past `dof` stay 0.
   */
  dof: 4 | 5 | 6;
  /** Names on the control panel and in the monitor (the 6-axis arms use the teach-pendant names). */
  jointNames?: readonly { name: string; what: string }[];
  /** Joint ranges, degrees (pymycobot robot_info.py). */
  min: readonly number[];
  max: readonly number[];
  /** Coordinate ranges a program may ask for (x, y, z mm; rx, ry, rz °), pymycobot robot_info.py. */
  coordsMin: readonly number[];
  coordsMax: readonly number[];
  /** Ready pose (tool pointing down over the desk) and all-zero pose, degrees. */
  home: readonly number[];
  zero: readonly number[];
  /** Furthest reach and rated payload (datasheet). */
  reachMm: number;
  payloadG: number;
  /** pymycobot class and how a Python program opens it on this board. */
  sdk: { module: string; cls: string; port: string; baud: number };
  /** Node colours other than the white shell, and the official textures drawn on shells. */
  dark: readonly string[];
  flange: readonly string[];
  textures: Readonly<Record<string, string>>;
  /** The official AI Kit environment is modelled for this arm. */
  kit: boolean;
  /** Tools that fit (the adaptive gripper's linkage and the camera flange are modelled for the 280). */
  tools: readonly EffectorId[];
  cameraFlange: boolean;
  pump: PumpWiring;
  /**
   * The official ROS 2 package for this arm and board (elephantrobotics/mycobot_ros2, humble):
   * its slider_control driver takes /joint_states in this joint order; `follow` shows the real
   * arm in RViz.
   */
  ros: { pkg: string; follow: string; joints: readonly string[] };
  /** Arm-only theme: how far the practice mat sits from the 280's place along x, mm (where this arm reaches tool-down). */
  matShiftMm: number;
  /**
   * 'black': the arm is sold black (OMX-F) and is drawn black, in the light studio so it stands out
   * (the white arms keep the dark slate one).
   */
  finish?: 'black';
}

const RDK_TEX = Object.fromEntries(['joint2', 'joint3', 'joint4', 'joint5', 'joint6'].map((n) => [n, `/robot/rdkx5/tex/${n}.jpg`]));
const M5_TEX = Object.fromEntries([1, 2, 3, 4, 5, 6].map((n) => [`joint${n}`, `/robot/mycobot280/tex/joint${n}.jpg`]));
const JOINTS_280 = ['joint2_to_joint1', 'joint3_to_joint2', 'joint4_to_joint3', 'joint5_to_joint4', 'joint6_to_joint5', 'joint6output_to_joint6'];
/** mechArm 270's URDF names its joints from the base up (mecharm_270_pi.urdf). */
const JOINTS_MECHARM = ['joint1_to_base', 'joint2_to_joint1', 'joint3_to_joint2', 'joint4_to_joint3', 'joint5_to_joint4', 'joint6_to_joint5'];
/** myPalletizer 260: its four joints of its own, as its URDF names them (the linkage joints are not sent). */
const JOINTS_PALLETIZER = ['joint1_to_base', 'joint2_to_joint1', 'joint3_to_joint2', 'joint5_to_joint4'];
const ros = (pkg: string, joints = JOINTS_280, follow = 'mycobot_follow.launch.py') => ({ pkg, follow, joints });
const ALL_TOOLS: readonly EffectorId[] = ['none', 'adaptive', 'parallel', 'flexible', 'pump', 'pen', 'phone', 'cylinder'];
const SIMPLE_TOOLS: readonly EffectorId[] = ['none', 'parallel', 'flexible', 'pump', 'pen', 'cylinder'];

const MYCOBOT280 = {
  family: 'mycobot280' as const,
  name: 'myCobot 280',
  dof: 6 as const,
  flangeLink: 'joint6_flange',
  min: JOINT_ANGLE_MIN,
  max: JOINT_ANGLE_MAX,
  coordsMin: [-281.45, -281.45, -70, -180, -180, -180],
  coordsMax: [281.45, 281.45, 412.67, 180, 180, 180],
  home: HOME_DEG,
  zero: [0, 0, 0, 0, 0, 0],
  reachMm: 280,
  payloadG: 250,
  flange: ['joint7'],
  kit: true,
  tools: ALL_TOOLS,
  cameraFlange: true,
  pump: 'rpi' as PumpWiring,
  matShiftMm: 0,
};

/** myCobot 320: pymycobot "MyCobot320"; home: tool straight down over (210, 0, 200) mm (tests/robot/arms-check). */
const MYCOBOT320 = {
  family: 'mycobot320' as const,
  name: 'myCobot 320',
  dof: 6 as const,
  flangeLink: 'link6',
  min: [-168, -135, -145, -145, -168, -180],
  max: [168, 135, 145, 145, 168, 180],
  coordsMin: [-350, -350, -41, -180, -180, -180],
  coordsMax: [350, 350, 523.9, 180, 180, 180],
  home: [25.1, 7.2, -118.3, 21.1, 90, 0],
  zero: [0, 0, 0, 0, 0, 0],
  reachMm: 350,
  payloadG: 1000,
  dark: ['base_pi', 'base_m5'],
  flange: ['link6'],
  textures: {},
  kit: false,
  tools: SIMPLE_TOOLS,
  cameraFlange: false,
  pump: 'basic12' as PumpWiring,
  // Folded in close the 320 cannot point its tool down: its mat starts 100 mm further out.
  matShiftMm: 100,
};

/** mechArm 270: pymycobot "MechArm270"; home: tool straight down over (149, 0, 160) mm (tests/robot/arms-check). */
const MECHARM270 = {
  family: 'mecharm270' as const,
  name: 'mechArm 270',
  dof: 6 as const,
  flangeLink: 'link6',
  min: [-160, -75, -175, -155, -115, -180],
  max: [160, 120, 65, 155, 115, 180],
  coordsMin: [-272, -272, -86, -180, -180, -180],
  coordsMax: [272, 272, 408.9, 180, 180, 180],
  home: [0, 24.5, -17.2, 0, 82.8, 0],
  zero: [0, 0, 0, 0, 0, 0],
  reachMm: 270,
  payloadG: 250,
  dark: ['base'],
  flange: ['link6'],
  textures: {},
  kit: false,
  tools: SIMPLE_TOOLS,
  cameraFlange: false,
  pump: 'rpi' as PumpWiring,
  // Tool down, mechArm 270 reaches about 160 mm out at block height: its mat sits 40 mm closer.
  matShiftMm: -40,
};

/**
 * myPalletizer 260: pymycobot "MyPalletizer260", 4 axes (base, shoulder, elbow, tool turn); the
 * head is kept level by its parallelogram linkage, so the tool always points down. URDF: the
 * official file with the linkage added (public/robot/mypalletizer260/mypalletizer_260.urdf).
 */
const MYPALLETIZER260 = {
  family: 'mypalletizer260' as const,
  name: 'myPalletizer 260',
  dof: 4 as const,
  jointNames: [
    { name: '베이스', what: '몸통 좌우로 돌리기' },
    { name: '어깨', what: '큰 팔 앞뒤로 숙이기' },
    { name: '팔꿈치', what: '작은 팔 위아래' },
    { name: '손끝', what: '손끝 돌리기' },
  ],
  urdf: '/robot/mypalletizer260/mypalletizer_260.urdf',
  glbs: ['/robot/rdkx5/rdkx5.glb', '/robot/mypalletizer260/mypalletizer260.glb'],
  flangeLink: 'link5',
  min: [-162, -2, -92, -180, 0, 0],
  max: [162, 90, 60, 180, 0, 0],
  coordsMin: [-260, -260, -15, -180, -180, -180],
  coordsMax: [260, 260, 357.58, 180, 180, 180],
  // Flange over (227, 0, 195) mm, tool down (always, on this arm); every joint has 20° to spare.
  home: [0, 25, 0, 0, 0, 0],
  zero: [0, 0, 0, 0, 0, 0],
  reachMm: 260,
  payloadG: 250,
  dark: ['pal_base'],
  flange: [] as string[],
  textures: {},
  kit: false,
  tools: ['none', 'pump', 'flexible', 'pen', 'cylinder'] as EffectorId[],
  cameraFlange: false,
  // Its shoulder stops at -2°: close in, it cannot lift the tool high — the mat sits 40 mm further out.
  matShiftMm: 40,
};

/**
 * ROBOTIS OMX-F, the follower arm of the OMX AI kit: 5 joints (base turn, three pitch joints, wrist
 * roll) and its own two-finger gripper, all Dynamixel servos on one bus (U2D2, 1 Mbps). URDF and
 * meshes: ROBOTIS-GIT/open_manipulator (Apache 2.0), public/robot/omx_f/ (ATTRIBUTION.md there).
 * Joint ranges: the servo position limits in its ros2_control file (joint2 830–3129, joint3
 * 1024–3140 of 4096 around 2048); joints 1, 4 and 5 turn a full turn on the servo, ±180° here.
 * Simulation only for now (no pymycobot: the Python class is the simulator's own `omx.OMXF`).
 */
/** OMX-F ready pose: upper arm and forearm as built, wrist bent 90° — gripper straight down, its grasp point over (192, -2, 94) mm (tests/robot/arms-check). */
const OMX_HOME = [0, 0, 0, 90, 0, 0];

const OMX_F = {
  family: 'omx' as const,
  name: 'OMX-F',
  dof: 5 as const,
  jointNames: [
    { name: '베이스', what: '몸통 좌우로 돌리기' },
    { name: '어깨', what: '위팔 앞뒤로 숙이기' },
    { name: '팔꿈치', what: '아래팔 위아래' },
    { name: '손목', what: '손목 위아래로 꺾기' },
    { name: '손목 돌리기', what: '그리퍼 돌리기' },
  ],
  urdf: '/robot/omx_f/omx_f.urdf',
  glbs: ['/robot/rdkx5/rdkx5.glb', '/robot/omx_f/omx_f.glb'],
  flangeLink: 'flange',
  min: [-180, -107, -90, -180, -180, 0],
  max: [180, 95, 95, 180, 180, 0],
  coordsMin: [-380, -380, -100, -180, -180, -180],
  coordsMax: [380, 380, 420, 180, 180, 180],
  home: OMX_HOME,
  zero: [0, 0, 0, 0, 0, 0],
  reachMm: 380,
  payloadG: 100,
  dark: ['omx_base'],
  flange: [] as string[],
  textures: {},
  kit: false,
  tools: ['omx'] as EffectorId[],
  cameraFlange: false,
  pump: 'none' as PumpWiring,
  sdk: { module: 'omx', cls: 'OMXF', port: '/dev/ttyACM0', baud: 1000000 },
  ros: { pkg: 'open_manipulator_bringup', follow: 'omx_f.launch.py', joints: ['joint1', 'joint2', 'joint3', 'joint4', 'joint5'] },
  matShiftMm: 0,
  finish: 'black' as const,
};

export const ARMS: Readonly<Partial<Record<RobotModelId, ArmSpec>>> = {
  'mycobot280-rdkx5': {
    ...MYCOBOT280,
    id: 'mycobot280-rdkx5',
    board: 'RDK X5',
    urdf: '/robot/rdkx5/mycobot_280_rdkx5.urdf',
    glbs: ['/robot/rdkx5/rdkx5.glb'],
    sdk: { module: 'pymycobot', cls: 'MyCobot280RDKX5', port: '/dev/ttyS1', baud: 1000000 },
    dark: ['joint1_rdkx5'],
    textures: RDK_TEX,
    pump: 'hobot',
    ros: ros('mycobot_280_rdkx5'),
  },
  'mycobot280-pi': {
    ...MYCOBOT280,
    id: 'mycobot280-pi',
    board: 'Raspberry Pi',
    urdf: '/robot/mycobot280/mycobot_280_pi.urdf',
    glbs: ['/robot/rdkx5/rdkx5.glb', '/robot/mycobot280/bases.glb'],
    sdk: { module: 'pymycobot', cls: 'MyCobot280', port: '/dev/ttyAMA0', baud: 1000000 },
    dark: ['G_base'],
    textures: RDK_TEX,
    kit: true,
    ros: ros('mycobot_280pi'),
  },
  'mycobot280-jn': {
    ...MYCOBOT280,
    id: 'mycobot280-jn',
    board: 'Jetson Nano',
    urdf: '/robot/mycobot280/mycobot_280_jn.urdf',
    glbs: ['/robot/rdkx5/rdkx5.glb', '/robot/mycobot280/bases.glb'],
    sdk: { module: 'pymycobot', cls: 'MyCobot280', port: '/dev/ttyTHS1', baud: 1000000 },
    dark: ['joint1_jet'],
    textures: RDK_TEX,
    ros: ros('mycobot_280jn'),
  },
  'mycobot280-m5': {
    ...MYCOBOT280,
    id: 'mycobot280-m5',
    board: 'M5Stack',
    urdf: '/robot/mycobot280/mycobot_280_m5.urdf',
    glbs: ['/robot/rdkx5/rdkx5.glb', '/robot/mycobot280/mycobot280.glb'],
    sdk: { module: 'pymycobot', cls: 'MyCobot280', port: 'COM3', baud: 115200 },
    dark: ['G_base'],
    flange: ['joint7'],
    textures: M5_TEX,
    pump: 'basic25',
    ros: ros('mycobot_280'),
  },
  'mycobot280-arduino': {
    ...MYCOBOT280,
    id: 'mycobot280-arduino',
    board: 'Arduino',
    urdf: '/robot/mycobot280/mycobot_280_arduino.urdf',
    glbs: ['/robot/rdkx5/rdkx5.glb', '/robot/mycobot280/mycobot280.glb', '/robot/mycobot280/bases.glb'],
    sdk: { module: 'pymycobot', cls: 'MyCobot280', port: 'COM3', baud: 115200 },
    dark: ['G_base'],
    textures: { ...M5_TEX, joint1_arduino: '/robot/mycobot280/tex/joint1.jpg' },
    // The official AI kit has no Arduino version: the M5 outputs, to be checked on the robot.
    pump: 'basic25',
    ros: ros('mycobot_280_arduino'),
  },
  'mycobot320-pi': {
    ...MYCOBOT320,
    id: 'mycobot320-pi',
    board: 'Raspberry Pi',
    urdf: '/robot/mycobot320/mycobot_320_pi_2022.urdf',
    glbs: ['/robot/rdkx5/rdkx5.glb', '/robot/mycobot320/mycobot320.glb'],
    sdk: { module: 'pymycobot', cls: 'MyCobot320', port: '/dev/ttyAMA0', baud: 115200 },
    ros: ros('mycobot_320pi'),
  },
  'mycobot320-m5': {
    ...MYCOBOT320,
    id: 'mycobot320-m5',
    board: 'M5Stack',
    urdf: '/robot/mycobot320/mycobot_320_m5_2022.urdf',
    glbs: ['/robot/rdkx5/rdkx5.glb', '/robot/mycobot320/mycobot320.glb'],
    sdk: { module: 'pymycobot', cls: 'MyCobot320', port: 'COM3', baud: 115200 },
    ros: ros('mycobot_320'),
  },
  'mecharm270-pi': {
    ...MECHARM270,
    id: 'mecharm270-pi',
    board: 'Raspberry Pi',
    urdf: '/robot/mecharm270/mecharm_270_pi.urdf',
    glbs: ['/robot/rdkx5/rdkx5.glb', '/robot/mecharm270/mecharm270.glb'],
    sdk: { module: 'pymycobot', cls: 'MechArm270', port: '/dev/ttyAMA0', baud: 1000000 },
    ros: ros('mecharm_pi', JOINTS_MECHARM, 'follow.launch.py'),
  },
  'mecharm270-m5': {
    ...MECHARM270,
    id: 'mecharm270-m5',
    board: 'M5Stack',
    urdf: '/robot/mecharm270/mecharm_270_m5.urdf',
    glbs: ['/robot/rdkx5/rdkx5.glb', '/robot/mecharm270/mecharm270.glb'],
    sdk: { module: 'pymycobot', cls: 'MechArm270', port: 'COM3', baud: 115200 },
    pump: 'basic25',
    ros: ros('mecharm', JOINTS_MECHARM, 'follow.launch.py'),
  },
  'mypalletizer260-pi': {
    ...MYPALLETIZER260,
    id: 'mypalletizer260-pi',
    board: 'Raspberry Pi',
    sdk: { module: 'pymycobot', cls: 'MyPalletizer260', port: '/dev/ttyAMA0', baud: 1000000 },
    pump: 'rpi',
    ros: ros('mypalletizer_260_pi', JOINTS_PALLETIZER, 'follow.launch.py'),
  },
  'mypalletizer260-m5': {
    ...MYPALLETIZER260,
    id: 'mypalletizer260-m5',
    board: 'M5Stack',
    sdk: { module: 'pymycobot', cls: 'MyPalletizer260', port: 'COM3', baud: 115200 },
    pump: 'basic25',
    ros: ros('mypalletizer_260', JOINTS_PALLETIZER),
  },
  'omx-f': { ...OMX_F, id: 'omx-f', board: 'U2D2' },
};

export const DEFAULT_ARM = ARMS['mycobot280-rdkx5']!;

export const armById = (id: RobotModelId | null | undefined): ArmSpec => (id && ARMS[id]) || DEFAULT_ARM;

/* --- the active arm ----------------------------------------------------- */

let active: ArmSpec = DEFAULT_ARM;

/** The arm the simulator has open. */
export const activeArm = (): ArmSpec => active;

export function setActiveArm(id: RobotModelId | null | undefined): ArmSpec {
  active = armById(id);
  setJointRanges(active.min, active.max);
  setArmLayoutShift(active.matShiftMm);
  return active;
}

/**
 * The suction pump for a program on this arm: the setup lines and `def <fn>(on)`, as Elephant
 * Robotics' AI-kit scripts do it on this board. `mc` is the robot object of the program.
 */
export function pumpPython(arm: ArmSpec = active, fn = 'pump'): string {
  switch (arm.pump) {
    case 'hobot':
      return `import Hobot.GPIO as GPIO

# 흡착 펌프: 베이스 40핀 BOARD 31·37번 (RDK X5 공식 비전 키트와 같은 배선)
GPIO.setwarnings(False)
GPIO.setmode(GPIO.BOARD)
GPIO.setup(37, GPIO.OUT)
GPIO.output(37, GPIO.HIGH)
GPIO.setup(31, GPIO.OUT)
GPIO.output(31, GPIO.HIGH)


def ${fn}(on):
    if on:
        GPIO.output(31, GPIO.HIGH)
        time.sleep(0.05)
        GPIO.output(37, GPIO.LOW)
    else:
        GPIO.output(31, GPIO.LOW)
        time.sleep(0.05)
        GPIO.output(37, GPIO.HIGH)
    time.sleep(0.5)
`;
    case 'rpi':
      return `import RPi.GPIO as GPIO

# 흡착 펌프: ${arm.board} GPIO BCM 20·21번, 둘 다 LOW = 켜기 (공식 AI 키트 코드와 같은 배선)
GPIO.setwarnings(False)
GPIO.setmode(GPIO.BCM)
GPIO.setup(20, GPIO.OUT)
GPIO.setup(21, GPIO.OUT)
GPIO.output(20, 1)
GPIO.output(21, 1)


def ${fn}(on):
    GPIO.output(20, 0 if on else 1)
    GPIO.output(21, 0 if on else 1)
    time.sleep(0.5)
`;
    case 'basic25':
      return `# 흡착 펌프: 로봇 ${arm.board} 의 기본 출력 2·5번, 0 = 켜기 (공식 AI 키트 코드와 같은 배선)
def ${fn}(on):
    mc.set_basic_output(2, 0 if on else 1)
    mc.set_basic_output(5, 0 if on else 1)
    time.sleep(0.5)
`;
    case 'none':
      return `# 이 로봇팔(${arm.name})에는 흡착 펌프가 없어요: 그리퍼로 집어요.
def ${fn}(on):
    pass
`;
    case 'basic12':
      return `# 흡착 펌프: myCobot 320 기본 출력 1·2번 (공식 AI 키트 aikit_320 과 같은 순서)
def ${fn}(on):
    if on:
        mc.set_basic_output(1, 0)
        mc.set_basic_output(2, 1)
    else:
        mc.set_basic_output(1, 1)
        mc.set_basic_output(2, 0)   # 남은 흡입을 풀어 블록을 놓고
        time.sleep(1)
        mc.set_basic_output(2, 1)
    time.sleep(0.5)
`;
  }
}

/** Clamp an angle to joint i's range on the active arm. */
export const clampJoint = (i: number, deg: number): number => Math.min(active.max[i], Math.max(active.min[i], deg));

/**
 * A program written for the RDK X5 (the practices' starters and the export) opened for the active
 * arm: the import and the constructor line use the arm's own pymycobot class and port, and the
 * ready pose is the arm's.
 */
export function adaptPython(code: string, arm: ArmSpec = active): string {
  if (arm.sdk.cls === 'MyCobot280RDKX5') return code;
  const home280 = `[${HOME_DEG.join(', ')}]`;
  // A ROS 2 node names the joints as this arm's URDF does (the 280's list, however it is wrapped).
  const joints280 = new RegExp(`\\[\\s*${JOINTS_280.map((j) => `"${j}"`).join(',\\s*')}\\s*\\]`, 'g');
  const joints = `[${arm.ros.joints.map((j) => `"${j}"`).join(', ')}]`;
  const out = code
    .replace(joints280, joints)
    .split(home280)
    .join(`[${arm.home.slice(0, arm.dof).join(', ')}]`)
    .replace(/from pymycobot import MyCobot280RDKX5\b/g, `from ${arm.sdk.module} import ${arm.sdk.cls}`)
    .replace(/MyCobot280RDKX5\("[^"]*",\s*\d+\)/g, `${arm.sdk.cls}("${arm.sdk.port}", ${arm.sdk.baud})`);
  if (arm.dof === 6) return out;
  const n = String.raw`-?\d+(?:\.\d+)?`;
  const six = new RegExp(String.raw`\[\s*(${n})\s*,\s*(${n})\s*,\s*(${n})\s*,\s*(${n})\s*,\s*(${n})\s*,\s*${n}\s*\]`, 'g');
  if (arm.dof === 5) {
    // OMX-F: coordinates keep all six numbers (its 5 joints still reach a tool-down pose at any
    // turn); angle lists lose the sixth joint, and there are five joints to loop over. A list is a
    // coordinate when its line sends coordinates or it is assigned to a name that is sent as one
    // (directly or as the loop variable over a list of them).
    const coordNames = new Set([...out.matchAll(/send_coords\(\s*([A-Za-z_]\w*)/g)].map((m) => m[1]));
    for (const m of out.matchAll(/for\s+([A-Za-z_]\w*)\s+in\s+([A-Za-z_]\w*)/g)) if (coordNames.has(m[1])) coordNames.add(m[2]);
    const isCoord = (l: string) => /coords/.test(l) || [...coordNames].some((v) => new RegExp(String.raw`^\s*${v}\s*=`).test(l));
    return out
      .split('\n')
      .map((l) => (isCoord(l) ? l : l.replace(six, '[$1, $2, $3, $4, $5]')))
      .join('\n')
      .replace(/range\(1, 7\)/g, 'range(1, 6)');
  }
  // A 4-axis arm: coordinates are [x, y, z, θ] (its tool always points down), angle lists have four
  // numbers, and there are four joints to loop over.
  return out
    .replace(/,\s*-180,\s*0,\s*-90\]/g, ', 0]')
    .replace(new RegExp(String.raw`\[\s*(${n})\s*,\s*(${n})\s*,\s*(${n})\s*,\s*(${n})\s*,\s*${n}\s*,\s*${n}\s*\]`, 'g'), '[$1, $2, $3, $4]')
    .replace(/range\(1, 7\)/g, `range(1, ${arm.dof + 1})`);
}

/**
 * A program for the block level written for the 280's six joints, for this arm: no line for a joint
 * it does not have, and a single-joint move kept 5° inside this arm's range.
 */
export function adaptBlocks(code: string, arm: ArmSpec = active): string {
  if (arm.id === 'mycobot280-rdkx5') return code;
  return code
    .split('\n')
    .filter((l) => arm.dof === 6 || !new RegExp(String.raw`robot\.move_joint\(\s*[${arm.dof + 1}-6]\s*,`).test(l))
    .map((l) =>
      l.replace(/robot\.move_joint\(\s*([1-6])\s*,\s*(-?\d+(?:\.\d+)?)/, (all, n: string, v: string) => {
        const i = Number(n) - 1;
        const deg = Math.round(Math.min(arm.max[i] - 5, Math.max(arm.min[i] + 5, Number(v))));
        return all.replace(/(-?\d+(?:\.\d+)?)$/, String(deg));
      }),
    )
    .join('\n');
}
