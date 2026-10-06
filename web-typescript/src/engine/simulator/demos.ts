/**
 * ▶ 데모 of each 실습 환경: a short block program of the arm doing that place's typical job, in four
 * steps with a line of text each. The console plays it on the simulated arm with the caption bar, and
 * [블록으로 보기] opens the same program in 블록 코딩. The places are the scenes' own (desk.ts
 * SCENE_FIXED and sceneObjects; the kit: board.ts): tests/simulator/demo-check.mts runs every demo
 * through the simulator, collision checks and all, on the arms DEMO_ARMS lists.
 */

import { activeArm, type ArmFamily, type ArmSpec } from '../robot/arms';
import { BLOCK_START, COLOR_TO_BIN, type ColorName } from './board';
import type { SceneId } from './desk';
import type { EffectorId } from './effectors';

export interface DemoStep {
  title: string;
  /** One short line: what the arm does in this step. */
  note: string;
}

export interface Demo {
  scene: SceneId;
  /** The tool the demo puts on. */
  effector: EffectorId;
  steps: DemoStep[];
  /** The block program (the classroom subset of Python). */
  code: string;
  /** The program line each step starts on. */
  starts: number[];
}

/** The arms each demo is made for (the places are where these arms reach them). */
export const DEMO_ARMS: Record<SceneId, readonly ArmFamily[]> = {
  empty: ['mycobot280', 'mycobot320', 'mecharm270', 'mypalletizer260'],
  lab: ['mycobot280', 'mycobot320', 'mecharm270', 'mypalletizer260'],
  factory: ['mycobot280', 'mycobot320', 'mypalletizer260'],
  logistics: ['mycobot280'],
  home: ['mycobot280'],
  kit: ['mycobot280'],
};

export const demoFits = (scene: SceneId, arm: ArmSpec = activeArm()): boolean => DEMO_ARMS[scene].includes(arm.family) && (scene !== 'kit' || arm.kit);

/** The step a program line belongs to (0..3). */
export function demoStepAt(d: Demo, line: number): number {
  let k = 0;
  d.starts.forEach((s, i) => {
    if (line >= s) k = i;
  });
  return k;
}

const to = (x: number, y: number, z: number) => `robot.move_to(${x}, ${y}, ${z})`;

function build(scene: SceneId, effector: EffectorId, imports: string, parts: (DemoStep & { lines: string[] })[]): Demo {
  const out = [`from edu import ${imports}`, ''];
  const starts: number[] = [];
  for (const p of parts) {
    starts.push(out.length + 1);
    out.push(...p.lines);
  }
  return { scene, effector, steps: parts.map(({ title, note }) => ({ title, note })), code: `${out.join('\n')}\n`, starts };
}

/** The arm's own gripper: the adaptive one on the 280, the flexible one on the others. */
const gripperOf = (arm: ArmSpec): EffectorId => (arm.tools.includes('adaptive') ? 'adaptive' : 'flexible');

/** Each joint turned on its own from the ready pose and back. */
function joints(arm: ArmSpec): Demo {
  const h = arm.home.map((a) => Math.round(a));
  const clamp = (i: number, deg: number) => Math.round(Math.min(arm.max[i] - 5, Math.max(arm.min[i] + 5, deg)));
  const j = (n: number, deg: number) => `robot.move_joint(${n}, ${clamp(n - 1, deg)})`;
  // 30° back from the ready pose, or forward where the joint has no room back (myPalletizer's shoulder).
  const swing = (n: number, d: number) => j(n, h[n - 1] - d >= arm.min[n - 1] + 5 && h[n - 1] - d <= arm.max[n - 1] - 5 ? h[n - 1] - d : h[n - 1] + d);
  const wrist =
    arm.dof === 6 ? [j(4, h[3] + 30), j(4, h[3]), j(5, h[4] + 40), j(5, h[4] - 40), j(5, h[4]), j(6, h[5] + 90), j(6, h[5] - 90), j(6, h[5])] : [j(4, h[3] + 90), j(4, h[3] - 90), j(4, h[3])];
  return build('empty', 'none', 'robot', [
    { title: 'J1 좌우', note: '몸통 전체가 왼쪽 · 오른쪽으로 돌아요.', lines: ['robot.set_speed(35)', 'robot.home()', j(1, h[0] + 60), j(1, h[0] - 60), j(1, h[0])] },
    { title: 'J2 · J3 앞뒤', note: '어깨와 팔꿈치가 팔을 앞뒤로 숙였다 펴요.', lines: [swing(2, 30), j(2, h[1]), swing(3, -30), j(3, h[2])] },
    {
      title: arm.dof === 6 ? '손목 J4 ~ J6' : '손끝 J4',
      note: arm.dof === 6 ? '손목이 까딱이고, 옆으로 꺾이고, 손끝이 빙글 돌아요.' : '손끝이 빙글 돌아요. 이 팔은 손끝이 늘 아래를 봐요.',
      lines: wrist,
    },
    { title: '기본 자세', note: '관절 6개가 각각 어떻게 도는지 봤어요. 처음 자세로 돌아가요.'.replace('6개', `${arm.dof}개`), lines: ['robot.home()'] },
  ]);
}

/** 피지컬 AI 실험실: the red block, then the blue one, onto the tray (desk.ts sceneObjects('lab')). */
function lab(arm: ArmSpec): Demo {
  const g = gripperOf(arm);
  const pick = (x: number, y: number) => [to(x, y, 15), 'robot.gripper.close()', to(x, y, 90)];
  const place = (x: number, y: number) => [to(x, y, 90), to(x, y, 28), 'robot.gripper.open()', to(x, y, 90)];
  return build('lab', g, 'robot', [
    { title: '빨간 블록 위로', note: '그리퍼를 벌리고 빨간 블록 바로 위로 가요.', lines: ['robot.home()', 'robot.gripper.open()', to(190, -70, 90)] },
    { title: '집기', note: '블록 가운데 높이까지 내려가서 그리퍼를 닫아요.', lines: pick(190, -70) },
    { title: '트레이에 놓기', note: '트레이 위로 옮겨 살짝 내려놓아요.', lines: place(20, -200) },
    { title: '파랑 블록도 같은 순서로', note: '위로 → 집기 → 놓기, 같은 순서를 한 번 더 해요.', lines: [to(190, 50, 90), ...pick(190, 50), ...place(100, -200), 'robot.home()'] },
  ]);
}

/** 제조 라인: a part off the conveyor into the OK bin (the green one). The pump holds the ring beside its hole. */
function factory(): Demo {
  const [x, y] = [226, -150];
  return build('factory', 'pump', 'robot', [
    { title: '부품이 오길 기다리기', note: '컨베이어 위에서 부품이 올 때까지 기다려요.', lines: ['robot.home()', to(x, y, 150), 'robot.wait(1.5)'] },
    { title: '집기', note: '흡착 펌프를 부품 윗면에 대고 빨아들여요.', lines: [to(x, y, 88), 'robot.pump.on()', to(x, y, 150)] },
    { title: '높이 들어 옮기기', note: '컨베이어와 함에 닿지 않게 들어서 옮겨요.', lines: [to(76, -250, 150)] },
    { title: 'OK 함에 넣기', note: '초록 OK 함 위에서 펌프를 끄면 쏙 들어가요.', lines: [to(76, -250, 112), 'robot.pump.off()', to(76, -250, 150), 'robot.home()'] },
  ]);
}

/** 물류 · 팔레타이징: the box at the end of the rollers onto the pallet's free place. */
function logistics(): Demo {
  return build('logistics', 'pump', 'robot', [
    { title: '롤러 끝 상자 집기', note: '상자 윗면에 흡착 펌프를 대고 들어 올려요.', lines: ['robot.home()', to(205, 135, 200), to(205, 135, 151), 'robot.pump.on()', to(205, 135, 200)] },
    { title: '팔레트 위로', note: '다른 상자에 닿지 않게 높이 들고 팔레트로 가요.', lines: [to(210, -178, 170)] },
    { title: '4번 자리에 놓기', note: '남은 빈자리에 천천히 내려놓아요.', lines: ['robot.set_speed(20)', to(210, -178, 102), 'robot.pump.off()', to(210, -178, 170), 'robot.set_speed(35)'] },
    { title: '다 쌓았어요', note: '팔레트 네 칸이 다 찼어요.', lines: ['robot.home()'] },
  ]);
}

/** 서비스 · 생활: the cup, held by its rim, onto the serving tray beside the plate. */
function home(arm: ArmSpec): Demo {
  return build('home', gripperOf(arm), 'robot', [
    { title: '컵 위로', note: '그리퍼를 벌리고 컵 가장자리 위로 가요.', lines: ['robot.home()', 'robot.gripper.open()', to(85, 85, 140)] },
    { title: '집기', note: '컵 테두리를 사이에 두고 그리퍼를 닫아요.', lines: [to(85, 85, 70), 'robot.gripper.close()', to(85, 85, 140)] },
    { title: '천천히 옮기기', note: '쏟지 않게 느린 속도로 옮겨요.', lines: ['robot.set_speed(20)', to(75, -225, 140)] },
    { title: '접시 옆에 내려놓기', note: '접시 옆 쟁반에 내려놓고 그리퍼를 벌려요.', lines: [to(75, -225, 82), 'robot.gripper.open()', to(75, -225, 140), 'robot.set_speed(35)', 'robot.home()'] },
  ]);
}

/** AI 키트: the camera finds the blocks; nearest first, each into its colour's bin (the official colour program). */
function kit(): Demo {
  const order = (Object.keys(BLOCK_START) as ColorName[]).sort((a, b) => Math.hypot(BLOCK_START[a].x, BLOCK_START[a].y) - Math.hypot(BLOCK_START[b].x, BLOCK_START[b].y));
  const pick = ['robot.move_above(block)', 'robot.move_down(block)', 'robot.pump.on()', 'robot.move_above(block)'];
  const drop = (c: ColorName) => [`robot.move_above("분류함 ${COLOR_TO_BIN[c]}")`, 'robot.pump.off()'];
  const find = (c: ColorName) => ['robot.home()', `block = camera.find("${c}")`];
  return build('kit', 'pump', 'robot, camera', [
    { title: '카메라로 블록 찾기', note: `위 카메라로 블록을 찾아요. 로봇에서 가장 가까운 ${order[0]}부터예요.`, lines: ['robot.pump.off()', ...find(order[0])] },
    { title: '가까운 것부터 집기', note: '찾은 자리로 내려가 흡착 펌프로 집어요.', lines: pick },
    { title: '색깔 칸에 놓기', note: `${order[0]}은 분류함 ${COLOR_TO_BIN[order[0]]}에 넣어요.`, lines: drop(order[0]) },
    { title: '4개 끝', note: '나머지도 찾기 → 집기 → 놓기를 되풀이해요.', lines: [...order.slice(1).flatMap((c) => [...find(c), ...pick, ...drop(c)]), 'robot.home()'] },
  ]);
}

/** The demo of a 실습 환경, for this arm. */
export function demoFor(scene: SceneId, arm: ArmSpec = activeArm()): Demo {
  switch (scene) {
    case 'empty':
      return joints(arm);
    case 'lab':
      return lab(arm);
    case 'factory':
      return factory();
    case 'logistics':
      return logistics();
    case 'home':
      return home(arm);
    case 'kit':
      return kit();
  }
}
