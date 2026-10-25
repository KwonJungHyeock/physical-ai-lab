/**
 * Robot models the console knows, in the order they are being built. The
 * console opens on a model choice; only models marked 'ready' can be opened.
 *
 * The arm console (/console) connects to a real myCobot 280 RDK X5 and simulates the other arms
 * (src/engine/robot/arms.ts: their official URDF, meshes and joint ranges); myAGV has its own
 * driving console (/agv, robot-python/server/agv_server.py on the robot).
 * A new model adds its entry here, its description files under
 * public/robot/<id>/, and its way of connecting (see `link`).
 */

export type RobotModelId =
  | 'mycobot280-rdkx5'
  | 'mycobot280-pi'
  | 'mycobot280-jn'
  | 'mycobot280-m5'
  | 'mycobot280-arduino'
  | 'mycobot320-pi'
  | 'mycobot320-m5'
  | 'mecharm270-pi'
  | 'mecharm270-m5'
  | 'myagv'
  | 'mypalletizer260-pi'
  | 'mypalletizer260-m5'
  | 'four-axis'
  | 'omx-f';

export interface RobotModel {
  id: RobotModelId;
  kind: 'arm' | 'agv';
  /** Product name. */
  name: string;
  /** Controller board. */
  board: string;
  /** One line: what it is. */
  summary: string;
  /**
   * How the console reaches the real robot:
   *  'onboard' — a server runs on the robot's own computer, the PC browser opens its address;
   *  'usb'     — the robot hangs on the PC's USB port; the browser talks to it (Web Serial);
   *  'sim'     — simulation only for now (the 3D model, jog, blocks and Python run in the browser).
   */
  link: 'onboard' | 'usb' | 'sim';
  status: 'ready' | 'next' | 'planned';
  /** Short label for the top bar. */
  short: string;
  /** Product line, for grouping the model choice. */
  line: string;
}

const arm = (id: RobotModelId, line: string, name: string, board: string, summary: string, link: RobotModel['link'] = 'sim'): RobotModel => ({
  id,
  kind: 'arm',
  name,
  board,
  summary,
  link,
  status: 'ready',
  short: `${name} · ${board}`,
  line,
});

export const MODELS: readonly RobotModel[] = [
  arm('mycobot280-rdkx5', 'myCobot 280', 'myCobot 280', 'RDK X5', '6축 · 가반 250g · 반경 280mm · 실물 연결 (로봇의 RDK X5 에서 서버가 돌고 PC 브라우저로 접속)', 'onboard'),
  arm('mycobot280-pi', 'myCobot 280', 'myCobot 280', 'Raspberry Pi', '같은 팔 · 라즈베리 파이 4 내장 · 시뮬레이션'),
  arm('mycobot280-jn', 'myCobot 280', 'myCobot 280', 'Jetson Nano', '같은 팔 · 젯슨 나노 내장 · 시뮬레이션'),
  arm('mycobot280-m5', 'myCobot 280', 'myCobot 280', 'M5Stack', '같은 팔 · M5Stack 베이스 · 시뮬레이션'),
  arm('mycobot280-arduino', 'myCobot 280', 'myCobot 280', 'Arduino', '같은 팔 · 아두이노 베이스 · 시뮬레이션'),
  arm('mycobot320-pi', 'myCobot 320', 'myCobot 320', 'Raspberry Pi', '6축 · 가반 1kg · 반경 350mm · 시뮬레이션'),
  arm('mycobot320-m5', 'myCobot 320', 'myCobot 320', 'M5Stack', '같은 팔 · M5Stack 베이스 · 시뮬레이션'),
  arm('mecharm270-pi', 'mechArm 270', 'mechArm 270', 'Raspberry Pi', '6축 · 중심 대칭형 산업용 구조 · 반경 270mm · 시뮬레이션'),
  arm('mecharm270-m5', 'mechArm 270', 'mechArm 270', 'M5Stack', '같은 팔 · M5Stack 베이스 · 시뮬레이션'),
  arm('mypalletizer260-pi', '4축 로봇팔', 'myPalletizer 260', 'Raspberry Pi', '4축 · 평행 링크로 손끝이 늘 아래를 봐요 · 반경 260mm · 시뮬레이션'),
  arm('mypalletizer260-m5', '4축 로봇팔', 'myPalletizer 260', 'M5Stack', '같은 팔 · M5Stack 베이스 · 시뮬레이션'),
  arm('omx-f', 'ROBOTIS OMX', 'OMX-F', 'U2D2', 'ROBOTIS 5축 + 그리퍼 · 다이나믹셀 · 반경 380mm · 시뮬레이션 (AI 키트 팔로워 팔)'),
  {
    id: 'myagv',
    kind: 'agv',
    name: 'myAGV',
    board: '2023 Pi · Jetson Nano · Plus',
    summary: '이동 로봇 · 조이스틱·키보드 주행, 앞 카메라로 찾기, 라이다, 직진 보정',
    link: 'onboard',
    status: 'ready',
    short: 'myAGV',
    line: '이동 로봇',
  },
  {
    id: 'four-axis',
    kind: 'arm',
    name: 'ultraArm P340',
    board: '',
    summary: '고정밀 4축 팔. 공식 3D 모델에 손끝(머리) 부분이 없어 다음 순서예요',
    link: 'sim',
    status: 'next',
    short: 'ultraArm P340',
    line: '4축 로봇팔',
  },
];

export const DEFAULT_MODEL: RobotModelId = 'mycobot280-rdkx5';

/**
 * The course is built for the myCobot 280 RDK X5 alone: the console opens on it without a model
 * choice, and the other models (still all here, simulated) are hidden. `true` brings the choice back
 * (first screen, gear menu, the panel's [바꾸기], the 라이브러리's 로봇 모델).
 */
export const MODEL_CHOICE = false;

export const modelById = (id: string | null | undefined): RobotModel | undefined => MODELS.find((m) => m.id === id);

/**
 * Arms a teacher can open beside the course robot even with the model choice hidden: ⚙ 설정 ›
 * [다른 로봇팔 쓰기] turns them on in this browser (simulation only).
 */
export const EXTRA_MODELS: readonly RobotModelId[] = ['omx-f'];
const EXTRA_KEY = 'pai.extra-arms';

export function extraArmsOn(): boolean {
  try {
    return localStorage.getItem(EXTRA_KEY) === '1';
  } catch {
    return false;
  }
}

export function setExtraArms(on: boolean): void {
  try {
    if (on) localStorage.setItem(EXTRA_KEY, '1');
    else localStorage.removeItem(EXTRA_KEY);
  } catch {
    /* this session only */
  }
}

/** The models the model choice offers: all (MODEL_CHOICE), or the course robot and the teacher's extra arms. */
export const offeredModels = (extra: boolean): readonly RobotModel[] => (MODEL_CHOICE ? MODELS : extra ? MODELS.filter((m) => m.id === DEFAULT_MODEL || EXTRA_MODELS.includes(m.id)) : []);
