/**
 * The interchangeable end effectors of the classroom set: seven tools plus the
 * camera flange, which sits between the robot flange and a tool.
 *
 * Tool lengths (flange face to working point, along the flange axis) come from
 * the official meshes where Elephant Robotics publishes one (adaptive gripper,
 * suction pump, camera flange; measured by robot-python/tools/convert_meshes.py's
 * output with the official URDF mounting offsets). The other four have no
 * published model; their shapes and lengths are simplified stand-ins sized from
 * the product pages, and are marked `official: false`.
 */

export type EffectorId = 'adaptive' | 'parallel' | 'flexible' | 'pump' | 'pen' | 'phone' | 'cylinder' | 'none';

/** What the tool does — decides which commands are allowed while it is attached. */
export type EffectorKind = 'grip' | 'suction' | 'pen' | 'press' | 'hold' | 'none';

export interface Effector {
  id: EffectorId;
  name: string;
  kind: EffectorKind;
  /** Flange face -> working point, mm (without the camera flange). */
  tcpMm: number;
  /** For grippers: finger gap range, mm (open, closed). */
  gapMm?: { open: number; closed: number };
  /** pymycobot `gripper_type` for set_gripper_state. */
  gripperType?: 1 | 3 | 4;
  official: boolean;
}

export const EFFECTORS: readonly Effector[] = [
  // Datasheet: 112 x 94 x 50 mm, gripping range 20-45 mm.
  // Grasp point sits ~4 mm above the fingertips when closed on a 25 mm block
  // (tips reach 104.5 mm open, 122.7 mm fully closed; URDF motor range -0.74..0.15).
  { id: 'adaptive', name: '어댑티브 그리퍼', kind: 'grip', tcpMm: 112, gapMm: { open: 43, closed: 4 }, gripperType: 1, official: true },
  // Datasheet (docs 4-SupportAndService/Accessories/ParallelGripper.md): 66 x 78 x 46 mm,
  // gripping range < 20 mm (effective 15 mm) — too narrow for the kit's 25 mm blocks.
  { id: 'parallel', name: '평행 그리퍼', kind: 'grip', tcpMm: 58, gapMm: { open: 20, closed: 0 }, gripperType: 3, official: false },
  { id: 'flexible', name: '플렉서블 그리퍼', kind: 'grip', tcpMm: 82, gapMm: { open: 46, closed: 6 }, gripperType: 4, official: false },
  // Suction cup contact face: 89.3 mm (pump_head mesh + URDF mount).
  { id: 'pump', name: '흡착 펌프', kind: 'suction', tcpMm: 89, official: true },
  { id: 'pen', name: '펜 홀더', kind: 'pen', tcpMm: 104, official: false },
  { id: 'phone', name: '폰 홀더', kind: 'hold', tcpMm: 60, official: false },
  { id: 'cylinder', name: '실린더', kind: 'press', tcpMm: 74, official: false },
  // Nothing fitted: the working point is the flange face itself.
  { id: 'none', name: '도구 없음', kind: 'none', tcpMm: 0, official: true },
];

/** "지금 달린 도구는 흡착 펌프예요" / "지금 로봇에 도구가 없어요", for messages about a tool command. */
export function fittedPhrase(id: EffectorId): string {
  const e = EFFECTOR_BY_ID[id];
  return e.kind === 'none' ? '지금 로봇에 도구가 없어요' : `지금 달린 도구는 ${e.name}예요`;
}

export const EFFECTOR_BY_ID: Record<EffectorId, Effector> = Object.fromEntries(
  EFFECTORS.map((e) => [e.id, e]),
) as Record<EffectorId, Effector>;

/**
 * The camera flange adds this much between the robot flange and the tool:
 * the pump head sits at 89.3 mm on the bare flange and at 106.2 mm on the
 * camera flange (official URDFs mycobot_280_m5_with_pump / _with_camera_flange_pump).
 */
export const CAMERA_FLANGE_SPACER_MM = 16.9;

/**
 * Hand camera on the camera flange, in the robot flange frame, mm, looking out
 * along the flange axis. From the hand-eye calibration in Elephant Robotics'
 * RDK X5 vision kit (color_demo.py EyesInHand_matrix, tool reference 100 mm):
 * the lens sits 44.4 mm off the flange axis and 11.6 mm out from the flange
 * face. The direction off the axis is the camera module's side of the official
 * camera_flange mesh (+x here).
 */
export const HAND_CAMERA_MOUNT = { x: 44.4, y: 0, z: 11.6 };

/**
 * The hand camera's full pose from the same calibration: camera (OpenCV axes: x right, y down,
 * z forward) → the kit's tool frame, mm. Row-major 4 × 4 (color_demo.py EyesInHand_matrix).
 * robot-python/server/camera.py uses it with the robot's own get_coords to place blocks.
 */
export const EYES_IN_HAND = [
  [-0.6939603779673582, -0.7171871341589221, -0.06373074931549055, -7.2912624200794731],
  [0.7196847052210569, -0.6935946078435518, -0.031312059038481804, 43.800953790167206],
  [-0.021746698192629678, -0.06759537385991699, 0.9974757874507313, -88.38631938563842],
  [0, 0, 0, 1],
] as const;
/** The kit measured EYES_IN_HAND with the tool reference this far out along the flange axis. */
export const EYES_IN_HAND_TOOL_MM = 100;
/**
 * Turn about the flange axis from the robot firmware's tool frame (get_coords) to the URDF
 * flange frame, as the camera flange mesh shows it: the calibrated lens offset (-7.3, 43.8) mm
 * lies on the mesh's camera side (+x) once turned by this much. The console's self-check
 * (/api/selfcheck, "끝 회전 차이") measures the real difference on a robot.
 */
export const FIRMWARE_TO_FLANGE_DEG = (-Math.atan2(EYES_IN_HAND[1][3], EYES_IN_HAND[0][3]) * 180) / Math.PI;

/** "펜 올리기" lifts the arm this far off the paper (the holder itself has no lift). */
export const PEN_LIFT_MM = 10;
/** "누르기" moves the arm down this far and back (the cylinder is a fixed pressing rod). */
export const CYLINDER_PRESS_MM = 10;

export function tcpFor(id: EffectorId, cameraFlange: boolean): number {
  return EFFECTOR_BY_ID[id].tcpMm + (cameraFlange ? CAMERA_FLANGE_SPACER_MM : 0);
}
