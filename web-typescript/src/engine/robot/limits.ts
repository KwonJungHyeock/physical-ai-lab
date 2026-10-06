/**
 * myCobot 280 — canonical robot constants.
 *
 * Single source of truth for joint limits and reach. Everything downstream
 * (Web Serial slider clamping, forward kinematics, the IK solver, workspace
 * checks) imports from here so the numbers can never drift apart.
 *
 * ============================================================================
 * JOINT LIMIT PROVENANCE
 * ============================================================================
 * Two sources disagree, so the adopted value is the NARROWER of the two on each
 * axis independently — a limit that is too tight can only refuse a reachable
 * pose, while one that is too loose lets the solver and the sliders command a
 * pose the hardware will refuse or stall on.
 *
 *   [A] pymycobot 4.0.6 -> robot_info.py -> robot_limit["MyCobot280"]
 *         angles_min = [-168, -140, -150, -150, -155, -180]
 *         angles_max = [ 168,  140,  150,  150,  160,  180]
 *
 *   [B] Elephant Robotics myCobot 280 datasheet (published working range)
 *         J1 ±168, J2 ±135, J3 ±150, J4 ±145, J5 ±165, J6 ±180
 *
 * Per-axis resolution (min = the greater lower bound, max = the lesser upper bound):
 *
 *   J1  [A] ±168        [B] ±168        -> ±168        (identical)
 *   J2  [A] ±140        [B] ±135        -> ±135        ([B] narrower)
 *   J3  [A] ±150        [B] ±150        -> ±150        (identical)
 *   J4  [A] ±150        [B] ±145        -> ±145        ([B] narrower)
 *   J5  [A] -155..160   [B] ±165        -> -155..160   ([A] narrower on both ends)
 *   J6  [A] ±180        [B] ±180        -> ±180        (identical)
 *
 * A third source, the URDF this project renders
 * (mycobot_description/urdf/mycobot_280_m5/mycobot_280_m5.urdf), states its own
 * <limit lower=.. upper=..> in radians:
 *   J1 ±2.9321 = ±168.0   J2 ±2.4434 = ±140.0   J3 ±2.6179 = ±150.0
 *   J4 ±2.6179 = ±150.0   J5 -2.7052..2.7925 = -155.0..160.0   J6 ±3.14 = ±180.0
 * It agrees with [A] everywhere, including the asymmetric J5, and is wider than
 * [B] on J2/J4 — so it does not change any adopted value, but it independently
 * confirms that J5's asymmetry is real and not a typo in the SDK table.
 *
 * Corroboration: the adopted vector is byte-for-byte the same as pymycobot's own
 * robot_limit["MyCobot280RDK-X5"] entry —
 *     angles_min = [-168, -135, -150, -145, -155, -180]
 *     angles_max = [ 168,  135,  150,  145,  160,  180]
 * i.e. the SDK already ships this exact intersection for the sibling model, which
 * is independent support for it rather than a value invented here.
 *
 * Note J5 is asymmetric (-155..160, not ±). That asymmetry comes from [A] and is
 * deliberately preserved; do not "tidy" it into a symmetric range.
 * ============================================================================
 */

export const JOINT_COUNT = 6;

/** Adopted lower bounds, degrees. See provenance above. */
export const JOINT_ANGLE_MIN = [-168, -135, -150, -145, -155, -180] as const;

/** Adopted upper bounds, degrees. See provenance above. */
export const JOINT_ANGLE_MAX = [168, 135, 150, 145, 160, 180] as const;

export const JOINT_NAMES = ['J1', 'J2', 'J3', 'J4', 'J5', 'J6'] as const;

/**
 * Speed argument range accepted by the motion commands.
 * Source: pymycobot/generate.py -> `send_angles(self, angles, speed)` docstring:
 *     speed : (int) 1 ~ 100
 */
export const SPEED_MIN = 1;
export const SPEED_MAX = 100;

/**
 * Working radius, millimetres — the datasheet figure, and the radius of the
 * workspace sphere drawn in the viewer.
 * Source: Elephant Robotics myCobot 280 datasheet ("280" in the model name is
 * the working radius).
 *
 * MEASUREMENT DATUM — this tripped us up once, so it is written down.
 * Sweeping the shipped URDF over 200 000 random in-limit poses gives, as the
 * maximum distance from the J1 axis origin (the "shoulder", 131.6 mm above the
 * base plate on the M5, 139.6 mm on the RDK X5):
 *     to the J6 frame (wrist centre) .... 287 mm (both models)
 *     to joint6_flange (flange face) .... 302 mm (both models)
 * So the datasheet's 280 mm is measured to the WRIST CENTRE, not the flange:
 * 287 vs 280 is ordinary rounding on a model-name figure. The URDF and the
 * datasheet therefore agree; they just quote different datums. Nothing was
 * adjusted to make them line up.
 *
 * (An earlier revision said 332.5 mm to the flange. That figure came from
 * composing the URDF rpy angles in the wrong order — see URDF_EULER_ORDER in
 * kinematics.ts. The wrist-centre figure does not depend on the order, which is
 * why it did not move.)
 */
export const REACH_MM = 280;

/** Origin of the J1 axis above the base plate, metres. From the URDF. */
export const SHOULDER_HEIGHT_M = 0.13156;

/**
 * Maximum flange-face distance from the shoulder, millimetres, measured from the
 * URDF as described above. The flange reaches further than the datasheet
 * working radius, so a target between REACH_MM and this value is outside the
 * quoted envelope yet still kinematically solvable — the viewer distinguishes
 * the two rather than calling both "unreachable".
 */
export const FLANGE_REACH_MM = 302.2;

/**
 * The joint ranges in force: myCobot 280's (above), or another arm's while the simulator has it
 * open (src/engine/robot/arms.ts sets them). The IK, the jog and the program checks read these;
 * the real-robot protocol keeps the 280's own constants.
 */
let liveMin: readonly number[] = JOINT_ANGLE_MIN;
let liveMax: readonly number[] = JOINT_ANGLE_MAX;
export const jointMin = (): readonly number[] => liveMin;
export const jointMax = (): readonly number[] => liveMax;
export function setJointRanges(min: readonly number[], max: readonly number[]): void {
  liveMin = min;
  liveMax = max;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Clamp one joint angle (0-based index) to its adopted limit. */
export function clampJointAngle(jointIndex: number, angleDeg: number): number {
  return clamp(angleDeg, liveMin[jointIndex], liveMax[jointIndex]);
}

/** Clamp a whole 6-vector of joint angles in place-free fashion. */
export function clampJointAngles(anglesDeg: readonly number[]): number[] {
  return anglesDeg.map((a, i) => clampJointAngle(i, a));
}

/** True when every joint of the pose is inside its adopted limit. */
export function isWithinJointLimits(anglesDeg: readonly number[]): boolean {
  return anglesDeg.every(
    (a, i) => a >= liveMin[i] - 1e-9 && a <= liveMax[i] + 1e-9,
  );
}
