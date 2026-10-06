/** What a Python run (중급 · 고급) hands back: timed robot commands and printed output. */

import type { UrdfRobot } from '../robot/urdf';
import type { RobotModelId } from '../robot/catalog';

/** One robot command at simulated time t (seconds from the start), from program line `line`. */
export type PyEvent =
  | { t: number; line: number; kind: 'move'; to: number[]; speed: number; what: string }
  | { t: number; line: number; kind: 'stop' }
  | { t: number; line: number; kind: 'gripper'; open: boolean; gripperType: number }
  | { t: number; line: number; kind: 'pump'; on: boolean }
  | { t: number; line: number; kind: 'servos'; on: boolean };

export interface PyOutput {
  t: number;
  text: string;
}

/** A ROS 2 message seen on a topic (고급). */
export interface RosMessage {
  t: number;
  topic: string;
  type: string;
  data: string;
}

export interface RosGraph {
  nodes: { name: string; publishes: string[]; subscribes: string[] }[];
}

export interface PyError {
  line: number;
  type: string;
  message: string;
  /** Plain-language explanation for a student. */
  hint?: string;
}

export interface PyResult {
  ok: boolean;
  events: PyEvent[];
  /** Simulated time the program ended (the arm may still be moving). */
  endT: number;
  output: PyOutput[];
  error?: PyError;
  ros?: { graph: RosGraph; messages: RosMessage[] };
}

export interface PyInit {
  /** Parsed URDF (plain data), for get_coords / send_coords. */
  robot: UrdfRobot;
  startAngles: number[];
  /** 'python' = pymycobot; 'ros' = rclpy with the official mycobot_280_rdkx5 driver node. */
  mode: 'python' | 'ros';
  /** The arm open in the simulator: the web worker has its own copy of the active arm (joint count, ranges), set from this. */
  armId?: RobotModelId;
}

/** Simulated-time limit of one run, seconds. */
export const MAX_SIM_S = 300;
