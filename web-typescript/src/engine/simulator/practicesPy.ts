/**
 * Practices of the Python levels.
 *
 * 중급 — 파이썬: the official pymycobot API as students will use it on the
 * robot (MyCobot280RDKX5 on /dev/ttyS1), plus Hobot.GPIO for the suction pump
 * (BOARD 31/37, the RDK X5 vision kit wiring). The program that passes the
 * simulator is the program that runs on the robot.
 * 고급 — ROS 2: rclpy nodes publishing /joint_states, which the official
 * mycobot_280_rdkx5 driver (slider_control) turns into arm motion.
 */

import { BINS, BLOCK_MM, BLOCK_START, HOME_DEG, SPOTS, type Theme } from './board';
import { EFFECTOR_BY_ID, tcpFor, type EffectorId } from './effectors';
import type { MissionStatus, WorldState } from './sim';
import { blocksOnSpots, blocksSorted, mission } from './sim';
import type { Practice, Session } from './practices';
import { activeArm, pumpPython } from '../robot/arms';

const HOME = `[${HOME_DEG.join(', ')}]`;
const HEADER = `from pymycobot import MyCobot280RDKX5
import time

mc = MyCobot280RDKX5("/dev/ttyS1", 1000000)
mc.power_on()

home = ${HOME}   # 관찰 자세 (공식 AI 키트)
mc.sync_send_angles(home, 40)
`;

/** Tool pointing straight down, as the official AI Kit program holds it (rx ~180). */
const DOWN = '-180, 0, -90';

function jointsMoved(w: WorldState): number {
  return w.stats.jointMin.filter((lo, i) => w.stats.jointMax[i] - lo >= 30).length;
}

function repeatCount(w: WorldState): number {
  let best = 0;
  for (const a of w.stats.arrivals) {
    best = Math.max(best, w.stats.arrivals.filter((b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) < 1).length);
  }
  return best;
}

const PY_JOINTS = `${HEADER}
# 관절을 하나씩 +20°, -20° 돌렸다가 제자리로
for joint in range(1, 7):
    for delta in (20, -20, 0):
        mc.send_angle(joint, home[joint - 1] + delta, 40)
        time.sleep(1)
    print(joint, "번 관절:", mc.get_angles()[joint - 1])

mc.sync_send_angles(home, 40)
`;

/** x on this arm's mat (the bigger 320 works further out, mechArm 270 closer in; the 280: as written). */
const X = (x: number) => x + activeArm().matShiftMm;

const PY_REPEAT = () => `${HEADER}
point = [${X(180)}, 0, 200, ${DOWN}]   # x, y, z (mm), rx, ry, rz (°)

for i in range(5):
    mc.sync_send_coords(point, 40)
    x, y, z = mc.get_coords()[:3]
    print(f"{i + 1}번째 도착: x {x:.1f}, y {y:.1f}, z {z:.1f}")
    mc.sync_send_angles(home, 40)
`;

/** Pick a block with the fitted tool and carry it (kit: into its bin; arm only: onto a spot). */
function pyPick(effector: EffectorId, theme: Theme): string {
  const e = EFFECTOR_BY_ID[effector];
  const tcp = tcpFor(effector, false);
  const b = BLOCK_START['파랑'];
  // Suction cup on the block's top face; gripper fingers around its middle.
  const grab = e.kind === 'grip' ? BLOCK_MM / 2 + tcp : BLOCK_MM + tcp;
  const dest = theme === 'kit' ? { ...BINS.A.official } : { ...SPOTS['자리 4'], z: 0 };
  const destLow = theme === 'kit' ? `[${dest.x}, ${dest.y}, ${dest.z}, 178.06, -0.92, -6.11]` : `[${dest.x}, ${dest.y}, ${Math.round(grab + 1)}, ${DOWN}]`;
  const destNote = theme === 'kit' ? '분류함 A 위 (공식 AI 키트 좌표)' : '자리 4에 내려놓기';
  const destHigh = theme === 'kit' ? '' : `mc.sync_send_coords([${dest.x}, ${dest.y}, 180, ${DOWN}], 40)\n`;
  const toolSetup =
    e.kind === 'grip'
      ? e.id === 'adaptive'
        ? `def grip(close):
    # 닫기: 끝까지가 아니라 4 cm 블록을 살짝 조이는 자리(82)까지 천천히 (끝까지 닫으면 블록에 막혀 모터가 웅웅거려요)
    if close:
        mc.set_gripper_value(82, 30, ${e.gripperType})
    else:
        mc.set_gripper_state(0, 50, ${e.gripperType})
    time.sleep(1.5)
`
        : `def grip(close):
    mc.set_gripper_state(1 if close else 0, 50${e.gripperType ? `, ${e.gripperType})   # 0 열기, 1 닫기 · ${e.gripperType} = ${e.name}` : `)   # 0 열기, 1 닫기 (${e.name})`}
    time.sleep(1.5)
`
      : pumpPython(activeArm(), 'grip');
  return `${HEADER}
${toolSetup}

block = [${b.x}, ${b.y}]   # 파랑 블록 위치 (mm)

grip(False)
mc.sync_send_coords([block[0], block[1], 180, ${DOWN}], 40)            # 블록 위
mc.sync_send_coords([block[0], block[1], ${Math.round(grab)}, ${DOWN}], 20)   # 내려가기
grip(True)
mc.sync_send_coords([block[0], block[1], 200, ${DOWN}], 40)            # 들어 올리기
${destHigh}mc.sync_send_coords(${destLow}, 40)   # ${destNote}
grip(False)
mc.sync_send_angles(home, 40)
`;
}

const PY_API = () => `${HEADER}
mc.sync_send_coords([${X(180)}, -60, 200, ${DOWN}], 40)
mc.sync_send_coords([${X(180)}, 60, 200, ${DOWN}], 40)
mc.sync_send_angles(home, 40)
print("끝:", mc.get_angles())
`;

const JOINT_NAMES = `["joint2_to_joint1", "joint3_to_joint2", "joint4_to_joint3",
         "joint5_to_joint4", "joint6_to_joint5", "joint6output_to_joint6"]`;

const ROS_TOPIC = `import math

import rclpy
from rclpy.node import Node
from sensor_msgs.msg import JointState

HOME = ${HOME}
POSES = [HOME, [0, 20, -60, -40, 0, 0], [30, 20, -60, -40, 0, 0], HOME]


class JointCommander(Node):
    """/joint_states 로 관절 각도를 보내면 로봇 드라이버(control_slider)가 팔을 움직여요."""

    def __init__(self):
        super().__init__("joint_commander")
        self.pub = self.create_publisher(JointState, "joint_states", 10)
        self.k = 0
        self.create_timer(2.0, self.send_next)

    def send_next(self):
        if self.k >= len(POSES):
            rclpy.shutdown()
            return
        msg = JointState()
        msg.header.stamp = self.get_clock().now().to_msg()
        msg.name = ${JOINT_NAMES}
        msg.position = [math.radians(a) for a in POSES[self.k]]
        self.pub.publish(msg)
        self.get_logger().info(f"보냄: {POSES[self.k]}")
        self.k += 1


def main():
    rclpy.init()
    node = JointCommander()
    rclpy.spin(node)
    node.destroy_node()


main()
`;

const ROS_WAVE = `import math

import rclpy
from rclpy.node import Node
from sensor_msgs.msg import JointState

HOME = ${HOME}


class Waver(Node):
    """타이머로 0.5초마다 1번 관절 각도를 사인파로 바꿔 보내요 (손 흔들기)."""

    def __init__(self):
        super().__init__("waver")
        self.pub = self.create_publisher(JointState, "joint_states", 10)
        self.k = 0
        self.create_timer(0.5, self.tick)

    def tick(self):
        pose = list(HOME)
        pose[0] = 30 * math.sin(self.k / 2)
        msg = JointState()
        msg.name = ${JOINT_NAMES}
        msg.position = [math.radians(a) for a in pose]
        self.pub.publish(msg)
        self.k += 1
        if self.k > 16:
            rclpy.shutdown()


rclpy.init()
rclpy.spin(Waver())
`;

function rosProgress(title: string) {
  return (w: WorldState, s: Session): MissionStatus => {
    const ros = s.lastRos;
    const published = ros ? ros.messages.filter((m) => m.topic === '/joint_states').length : 0;
    const driver = ros?.graph.nodes.some((n) => n.name === 'control_slider' && n.subscribes.includes('/joint_states')) ?? false;
    const mine = ros?.graph.nodes.some((n) => n.name !== 'control_slider' && n.publishes.includes('/joint_states')) ?? false;
    const done = (mine && published >= 3 ? 1 : 0) + (driver && jointsMoved(w) >= 1 ? 1 : 0);
    return { title, done, total: 2 };
  };
}

const PY_FREE: Practice = {
  id: 'free',
  title: '자유 실습',
  goal: 'pymycobot 명령으로 마음대로 프로그램을 만들어요.',
  effector: 'pump',
  starter: () => PY_API(),
  progress: (w) => mission(w),
};

function pyList(theme: Theme): Practice[] {
  const placed = (w: WorldState) => (theme === 'kit' ? blocksSorted(w) : blocksOnSpots(w));
  return [
    {
      id: 'joints',
      check: 1,
      title: '전 축 구동 (send_angle)',
      goal: 'for 반복과 send_angle 로 6개 관절을 하나씩 움직이고 get_angles 로 확인해요.',
      effector: 'pump',
      starter: () => PY_JOINTS,
      progress: (w) => ({ title: '관절 6개 모두 움직이기', done: jointsMoved(w), total: 6 }),
    },
    {
      id: 'repeat',
      check: 2,
      title: '반복 위치제어 (send_coords)',
      goal: '같은 좌표에 5번 가고 get_coords 로 도착 위치를 출력해요.',
      effector: 'pump',
      starter: () => PY_REPEAT(),
      progress: (w) => ({ title: '같은 점에 5번 가기', done: Math.min(5, repeatCount(w)), total: 5 }),
    },
    {
      id: 'place',
      title: theme === 'kit' ? '흡착 펌프로 분류함에 넣기' : '흡착 펌프로 자리에 놓기',
      goal: '좌표로 블록 위에 가서 흡착 펌프를 켜고 옮겨요 (보드에 맞는 공식 배선).',
      effector: 'pump',
      starter: (e) => pyPick(e, theme),
      progress: (w) => ({ title: '블록 1개 옮기기', done: Math.min(1, placed(w)), total: 1 }),
    },
    {
      id: 'tools',
      check: 5,
      title: '엔드이펙터 교체 (그리퍼 · 펌프)',
      goal: '어댑티브 그리퍼(set_gripper_state)로 옮긴 뒤, 흡착 펌프로 바꿔 한 번 더 옮겨요.',
      effector: 'adaptive',
      starter: (e) => pyPick(e, theme),
      progress: (_w, s) => ({ title: '도구 2종으로 블록 옮기기', done: Math.min(2, s.pickTools.size), total: 2 }),
    },
    {
      id: 'api',
      check: 7,
      title: 'API 로 로봇에서 실행',
      goal: '시뮬레이션을 통과한 이 파이썬 코드를 로봇에서 그대로 실행해요 ([로봇 실행] 또는 [로봇용 파일로 받기] 뒤 python3).',
      effector: 'pump',
      action: 'api',
      starter: () => PY_API(),
      progress: (_w, s) => ({ title: 'API 로 실행', done: Math.min(1, s.apiRuns), total: 1 }),
    },
    PY_FREE,
  ];
}

function rosList(): Practice[] {
  return [
    {
      id: 'topic',
      title: '토픽으로 팔 움직이기',
      goal: '노드를 만들어 /joint_states 토픽에 관절 각도를 보내요. 로봇 드라이버 노드가 받아서 팔을 움직여요.',
      effector: 'pump',
      starter: () => ROS_TOPIC,
      progress: rosProgress('발행 → 드라이버가 팔 움직이기'),
    },
    {
      id: 'timer',
      title: '타이머로 반복 동작',
      goal: 'create_timer 로 0.5초마다 메시지를 보내 손을 흔들어요.',
      effector: 'pump',
      starter: () => ROS_WAVE,
      progress: rosProgress('타이머로 계속 발행하기'),
    },
    {
      id: 'rosrun',
      check: 7,
      title: 'ROS 2 노드 로봇에서 실행',
      goal: '같은 노드를 로봇에서 ros2 로 실행해요. [ROS 2 로 실행하는 법]에 명령이 있어요.',
      effector: 'pump',
      action: 'api',
      starter: () => ROS_TOPIC,
      progress: rosProgress('노드·토픽 연결 확인'),
    },
    {
      id: 'free',
      title: '자유 실습',
      goal: 'rclpy 로 마음대로 노드를 만들어요.',
      effector: 'pump',
      starter: () => ROS_TOPIC,
      progress: rosProgress('발행 → 드라이버가 팔 움직이기'),
    },
  ];
}

export const PY_PRACTICES: Record<Theme, readonly Practice[]> = { kit: pyList('kit'), arm: pyList('arm') };
export const ROS_PRACTICES: Record<Theme, readonly Practice[]> = { kit: rosList(), arm: rosList() };
