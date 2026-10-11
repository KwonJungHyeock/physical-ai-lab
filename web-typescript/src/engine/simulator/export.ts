/**
 * Turns a simulated run into a pymycobot script for the real myCobot 280 RDK X5.
 *
 * The script replays the joint angles the simulator computed, so the real arm
 * follows exactly the path that was checked for collisions — nothing is
 * re-solved on the robot. That also means camera results are baked in: the
 * positions found in the simulation are the ones used. A run on the robot with
 * its own camera is a later step (see docs).
 *
 * Only calls whose meaning is documented are emitted: pymycobot's
 * MyCobot280RDKX5 (sync_send_angles, set_gripper_state with gripper_type) and,
 * for the suction pump, the sequence of Elephant Robotics' own RDK X5 vision
 * kit (elephantrobotics/mycobot280RDKX5_vision_kit color_demo.py: Hobot.GPIO,
 * BOARD pins 31 and 37). The pen holder and the cylinder have no pins — the
 * simulator turns them into arm motion.
 */

import type { ColorName, Theme } from './board';
import { CAL_BOARD, TOP_CAMERA } from './board';
import { EFFECTOR_BY_ID, type EffectorId } from './effectors';
import type { RobotAction } from './sim';
import { activeArm, pumpPython } from '../robot/arms';

const r1 = (v: number) => (Math.round(v * 10) / 10).toFixed(1);

/** `theme`: the 실습 환경 the program was checked in (the AI kit's fixed layout, or the arm alone on a desk). */
export function toPymycobot(actions: readonly RobotAction[], effector: EffectorId, code: string, theme: Theme = 'kit'): string {
  const e = EFFECTOR_BY_ID[effector];
  const found = actions.filter((a): a is Extract<RobotAction, { type: 'found' }> => a.type === 'found');
  const usesPump = actions.some((a) => a.type === 'pump');
  const out: string[] = [
    '# 로봇팔 실습에서 만든 프로그램 (myCobot 280 RDK X5)',
    '# 시뮬레이션에서 계산하고 충돌 검사를 마친 관절 각도를 그대로 보냅니다.',
    `# 도구: ${e.name}`,
    ...(theme === 'kit'
      ? [
          '# 작업 환경: AI 로봇 확장 키트 2023 (공식 배치 그대로). 로봇을 키트 받침판의 로봇 자리에 고정하세요.',
          `#   보정판 중심 x ${CAL_BOARD.x}, y ${CAL_BOARD.y} mm / 카메라 렌즈 x ${TOP_CAMERA.x}, y ${TOP_CAMERA.y}, 높이 ${TOP_CAMERA.z} mm`,
        ]
      : ['# 작업 환경: 로봇팔 단독 (책상 위). 물건은 시뮬레이션에서 놓은 자리와 같게 놓으세요 (로봇 바닥 중심 기준 mm).']),
  ];
  if (found.length) {
    out.push('# 카메라로 찾은 위치는 시뮬레이션에서 찾은 값으로 고정되어 있어요:');
    for (const f of found) out.push(`#   ${f.color}: x ${Math.round(f.x)}, y ${Math.round(f.y)} mm`);
  }
  out.push(
    '#',
    '# 로봇에서 실행: python3 이파일.py   (멈추기: Ctrl+C)',
    '',
    'import time',
    'from pymycobot import MyCobot280RDKX5',
    '',
    'mc = MyCobot280RDKX5("/dev/ttyS1", 1000000)',
    'time.sleep(0.5)',
    'mc.focus_all_servos()',
    '',
    '',
    'def move(angles, speed):',
    '    mc.sync_send_angles(angles, speed)',
    '',
  );
  if (e.kind === 'grip') {
    out.push(
      '',
      'def gripper(open_):',
      `    mc.set_gripper_state(0 if open_ else 1, 50, ${e.gripperType})  # 0 열기, 1 닫기 / ${e.gripperType} = ${e.name}`,
      '    time.sleep(1.5)',
      '',
    );
  }
  if (usesPump) {
    out.push(
      '',
      ...pumpPython(activeArm(), 'pump').split('\n'),
      '',
    );
  }
  out.push('');

  const source = code.split('\n');
  let lastLine = -1;
  for (const a of actions) {
    if (a.line !== lastLine) {
      const text = (source[a.line - 1] ?? '').trim();
      out.push(`# ${a.line}: ${text}`);
      lastLine = a.line;
    }
    switch (a.type) {
      case 'angles':
        out.push(`move([${a.angles.map(r1).join(', ')}], ${Math.round(a.speed)})`);
        break;
      case 'gripper':
        out.push(`gripper(${a.open ? 'True' : 'False'})`);
        break;
      case 'wait':
        out.push(`time.sleep(${a.sec})`);
        break;
      case 'pump':
        out.push(`pump(${a.on ? 'True' : 'False'})`);
        break;
      case 'found':
        out.push(`# ${a.color as ColorName} 블록: x ${Math.round(a.x)}, y ${Math.round(a.y)} mm`);
        break;
    }
  }
  out.push('');
  return out.join('\n');
}
