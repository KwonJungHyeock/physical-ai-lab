/**
 * High-level myCobot 280 AR command surface, built on SerialTransport.
 *
 * Every method below names the pymycobot 4.0.6 function it reproduces, so the
 * argument order and reply handling can be checked against the SDK.
 *   pymycobot/generate.py   -> class CommandGenerator
 *   pymycobot/mycobot280.py -> class MyCobot280
 */

import { SerialTransport, type LogListener } from './transport';
import {
  GripperState,
  Opcode,
  angleToInt,
  decodeAngles,
  decodeSingle,
  encodeInt16,
} from './protocol';
import {
  JOINT_COUNT,
  SPEED_MAX,
  SPEED_MIN,
  clamp,
  clampJointAngle,
} from '@/engine/robot/limits';

export type GripperCommand = keyof typeof GripperState;

// Joint clamping lives in @/engine/robot/limits (single source of truth, shared
// with the kinematics and viewer code). Re-exported so existing callers of
// `clampJointAngle` from this module keep working.
export { clampJointAngle } from '@/engine/robot/limits';

export class MyCobot280Client {
  private readonly transport: SerialTransport;

  constructor(transport: SerialTransport) {
    this.transport = transport;
  }

  get isOpen(): boolean {
    return this.transport.isOpen;
  }

  setLogListener(listener: LogListener | null): void {
    this.transport.setLogListener(listener);
  }

  setDisconnectHandler(handler: (() => void) | null): void {
    this.transport.setDisconnectHandler(handler);
  }

  static requestPort(): Promise<SerialPort> {
    return SerialTransport.requestPort();
  }

  open(port: SerialPort): Promise<void> {
    return this.transport.open(port);
  }

  close(): Promise<void> {
    return this.transport.close();
  }

  /* ---------------------------------------------------------------------- */
  /* Overall status                                                          */
  /* ---------------------------------------------------------------------- */

  /**
   * generate.py::is_controller_connected()
   *     return self._mesg(ProtocolCode.IS_CONTROLLER_CONNECTED, has_reply=True)
   * Docstring: 1 - succeed, 0 - failed, -1 - error data.
   * Reply decoded by mycobot280.py::_res through `_process_single`.
   */
  async isControllerConnected(): Promise<number> {
    const reply = await this.transport.request(Opcode.IS_CONTROLLER_CONNECTED, [], {
      expectReply: true,
    });
    return reply ? decodeSingle(reply.payload) : -1;
  }

  /**
   * generate.py::power_on()
   *     return self._mesg(ProtocolCode.POWER_ON)
   * No reply is requested by the SDK, so this is fire-and-forget.
   */
  async powerOn(): Promise<void> {
    await this.transport.request(Opcode.POWER_ON);
  }

  /**
   * generate.py::power_off()
   *     return self._mesg(ProtocolCode.POWER_OFF)
   */
  async powerOff(): Promise<void> {
    await this.transport.request(Opcode.POWER_OFF);
  }

  /**
   * generate.py::is_power_on()
   *     return self._mesg(ProtocolCode.IS_POWER_ON, has_reply=True)
   * Docstring: 1 - power on, 0 - power off, -1 - error data.
   */
  async isPowerOn(): Promise<number> {
    const reply = await this.transport.request(Opcode.IS_POWER_ON, [], { expectReply: true });
    return reply ? decodeSingle(reply.payload) : -1;
  }

  /**
   * generate.py::release_all_servos()
   *     return self._mesg(ProtocolCode.RELEASE_ALL_SERVOS)   # data is None
   * Relaxes every joint so the arm can be moved by hand.
   */
  async releaseAllServos(): Promise<void> {
    await this.transport.request(Opcode.RELEASE_ALL_SERVOS);
  }

  /* ---------------------------------------------------------------------- */
  /* MDI mode and operation                                                  */
  /* ---------------------------------------------------------------------- */

  /**
   * generate.py::get_angles()
   *     return self._mesg(ProtocolCode.GET_ANGLES, has_reply=True)
   * Reply payload is 6 x signed BE int16 in hundredths of a degree
   * (mycobot280.py::_res -> `[self._int2angle(angle) for angle in res]`).
   */
  async getAngles(): Promise<number[] | null> {
    const reply = await this.transport.request(Opcode.GET_ANGLES, [], {
      expectReply: true,
      optional: true,
    });
    if (!reply) return null;
    return decodeAngles(reply.payload);
  }

  /**
   * generate.py::send_angles(angles, speed)
   *     angles = [self._angle2int(angle) for angle in angles]
   *     return self._mesg(ProtocolCode.SEND_ANGLES, angles, speed, has_reply=True)
   *
   * `_process_data_command` expands the list through `_encode_int16`, so the
   * payload is 12 angle bytes followed by the 1-byte speed:
   *     FE FE 0F 22 <j1..j6 as BE int16> <speed> FA
   *
   * The SDK marks this `has_reply=True`, but the ack carries nothing we need,
   * so a missing ack is tolerated rather than treated as a failure.
   */
  async sendAngles(anglesDeg: readonly number[], speed: number): Promise<void> {
    if (anglesDeg.length !== JOINT_COUNT) {
      throw new RangeError(`send_angles expects ${JOINT_COUNT} angles, got ${anglesDeg.length}`);
    }
    const payload: number[] = [];
    anglesDeg.forEach((angle, i) => {
      payload.push(...encodeInt16(angleToInt(clampJointAngle(i, angle))));
    });
    payload.push(clamp(Math.round(speed), SPEED_MIN, SPEED_MAX));

    await this.transport.request(Opcode.SEND_ANGLES, payload, {
      expectReply: true,
      retries: 1,
      optional: true,
    });
  }

  /**
   * generate.py::send_angle(id, degree, speed)
   *     return self._mesg(ProtocolCode.SEND_ANGLE, id, [self._angle2int(degree)],
   *                       speed, has_reply=True)
   * `id` is the 1-based joint id (genre.py::Angle J1..J6).
   * Payload: <id> <angle BE int16> <speed>.
   */
  async sendAngle(jointId: number, angleDeg: number, speed: number): Promise<void> {
    if (jointId < 1 || jointId > JOINT_COUNT) {
      throw new RangeError(`joint id must be 1..${JOINT_COUNT}, got ${jointId}`);
    }
    const clamped = clampJointAngle(jointId - 1, angleDeg);
    const payload = [
      jointId,
      ...encodeInt16(angleToInt(clamped)),
      clamp(Math.round(speed), SPEED_MIN, SPEED_MAX),
    ];
    await this.transport.request(Opcode.SEND_ANGLE, payload, {
      expectReply: true,
      retries: 1,
      optional: true,
    });
  }

  /* ---------------------------------------------------------------------- */
  /* Gripper (Atom IO)                                                       */
  /* ---------------------------------------------------------------------- */

  /**
   * mycobot280.py::set_gripper_state(flag, speed, _type_1=None, is_torque=None)
   *     args = [flag, speed]                       # optional args omitted
   *     return self._mesg(ProtocolCode.SET_GRIPPER_STATE, *args)
   * Docstring: flag 0 - open, 1 - close, 254 - release; speed 0 ~ 100.
   * The `_type_1` gripper-kind byte is left off, which the SDK documents as
   * defaulting to the adaptive gripper. No reply is requested.
   */
  async setGripperState(command: GripperCommand, speed: number): Promise<void> {
    const flag = GripperState[command];
    const payload = [flag, clamp(Math.round(speed), 0, SPEED_MAX)];
    await this.transport.request(Opcode.SET_GRIPPER_STATE, payload);
  }

  /**
   * mycobot280.py::get_gripper_value(gripper_type=None)
   *     return self._mesg(ProtocolCode.GET_GRIPPER_VALUE, has_reply=True)
   * Reply decoded by `_process_single`.
   */
  async getGripperValue(): Promise<number> {
    const reply = await this.transport.request(Opcode.GET_GRIPPER_VALUE, [], {
      expectReply: true,
      optional: true,
    });
    return reply ? decodeSingle(reply.payload) : -1;
  }

  /**
   * mycobot280.py::is_gripper_moving()
   *     return self._mesg(ProtocolCode.IS_GRIPPER_MOVING, has_reply=True)
   * Docstring: 0 - not moving, 1 - is moving, -1 - error data.
   */
  async isGripperMoving(): Promise<number> {
    const reply = await this.transport.request(Opcode.IS_GRIPPER_MOVING, [], {
      expectReply: true,
      optional: true,
    });
    return reply ? decodeSingle(reply.payload) : -1;
  }
}
