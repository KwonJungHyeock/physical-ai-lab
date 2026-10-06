import { JOINT_COUNT } from '@/engine/robot/limits';

/**
 * myCobot 280 serial protocol — framing, opcodes, and value encoding.
 *
 * ============================================================================
 * SOURCE OF TRUTH
 * ============================================================================
 * Everything in this file is transcribed from the official Elephant Robotics
 * Python SDK, `pymycobot`, version 4.0.6 (PyPI: pymycobot-4.0.6-py3-none-any.whl).
 * Nothing here is guessed. Each constant/rule cites the file and symbol it
 * came from so it can be re-verified against a future SDK release.
 *
 * Files referenced:
 *   - pymycobot/common.py      -> class ProtocolCode, class DataProcessor,
 *                                 module-level `write()` / `read()`
 *   - pymycobot/generate.py    -> class CommandGenerator (command argument order)
 *   - pymycobot/mycobot280.py  -> class MyCobot280 (serial params, response decode)
 *   - pymycobot/robot_info.py  -> per-model joint limits
 *
 * Target hardware for this spike: myCobot 280 AR (Elephant Robotics), whose
 * controller board is an M5Stack ATOM ESP32. The ATOM is a serial slave; the
 * PC is the host. This matches pymycobot's `MyCobot280` class (NOT the
 * `MyCobot280RDK-X5` class, which targets the RDK variant).
 * ============================================================================
 */

/* -------------------------------------------------------------------------- */
/* Framing                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Frame delimiters.
 * Source: pymycobot/common.py -> `class ProtocolCode`:
 *     HEADER = 0xFE
 *     FOOTER = 0xFA
 */
export const HEADER = 0xfe;
export const FOOTER = 0xfa;

/**
 * Frame layout (both directions):
 *
 *   +------+------+-----+--------+-------------------+------+
 *   | 0xFE | 0xFE | LEN | OPCODE | PAYLOAD (LEN - 2) | 0xFA |
 *   +------+------+-----+--------+-------------------+------+
 *     [0]    [1]   [2]    [3]      [4 .. 4+LEN-3]     last
 *
 * LEN = payload length + 2, i.e. it counts the opcode and the footer but not
 * the two header bytes nor itself. Total frame length on the wire = LEN + 3.
 *
 * Source (transmit): pymycobot/common.py -> `DataProcessor._mesg`:
 *     LEN = len(command_data) + 2
 *     command = [ProtocolCode.HEADER, ProtocolCode.HEADER, LEN, genre]
 *     command.extend(command_data)
 *     command.append(ProtocolCode.FOOTER)
 *   (the alternative CRC-16 trailer in `_mesg` applies only to
 *    `DataProcessor.crc_robot_class` = Mercury/Pro-series arms. MyCobot280 is
 *    not in that list, so it uses the plain 0xFA footer.)
 *
 * Source (receive): pymycobot/common.py -> `DataProcessor._process_received`:
 *     cmd_id   = data[header_i + 3]        # arm == 6
 *     data_len = data[header_i + 2] - 2    # arm == 6
 *     data_pos = header_i + 4              # arm == 6
 *     valid_data = data[data_pos : data_pos + data_len]
 *
 * NOTE: 0xFA is NOT escaped, so a payload byte may legitimately equal the
 * footer value. Parsers must therefore use LEN, never a scan for 0xFA.
 * pymycobot does the same (its `read()` counts down `data_len`).
 */
export const FRAME_OVERHEAD = 3; // total frame length === LEN + FRAME_OVERHEAD

/**
 * Sanity ceiling on the LEN byte when resynchronising the receive stream.
 * Source: pymycobot/common.py -> `read()`:
 *     if data_len < 0 or data_len > 30: data_len = -1; continue
 */
export const MAX_FRAME_LEN_BYTE = 30;

/* -------------------------------------------------------------------------- */
/* Opcodes                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Opcode subset used by this spike.
 * Source: pymycobot/common.py -> `class ProtocolCode`. Values copied verbatim.
 *
 * `ProtocolCode` reuses some numeric values across different robot families
 * (e.g. 0x13 is both RELEASE_ALL_SERVOS and SET_MOTOR_ENABLED). The names below
 * are the ones that `pymycobot/generate.py::CommandGenerator` and
 * `pymycobot/mycobot280.py::MyCobot280` actually dispatch on for this model.
 */
export const Opcode = {
  /** ProtocolCode.POWER_ON = 0x10 — generate.py::power_on() */
  POWER_ON: 0x10,
  /** ProtocolCode.POWER_OFF = 0x11 — generate.py::power_off() */
  POWER_OFF: 0x11,
  /** ProtocolCode.IS_POWER_ON = 0x12 — generate.py::is_power_on() */
  IS_POWER_ON: 0x12,
  /** ProtocolCode.RELEASE_ALL_SERVOS = 0x13 — generate.py::release_all_servos() */
  RELEASE_ALL_SERVOS: 0x13,
  /** ProtocolCode.IS_CONTROLLER_CONNECTED = 0x14 — generate.py::is_controller_connected() */
  IS_CONTROLLER_CONNECTED: 0x14,

  /** ProtocolCode.GET_ANGLES = 0x20 — generate.py::get_angles() */
  GET_ANGLES: 0x20,
  /** ProtocolCode.SEND_ANGLE = 0x21 — generate.py::send_angle() */
  SEND_ANGLE: 0x21,
  /** ProtocolCode.SEND_ANGLES = 0x22 — generate.py::send_angles() */
  SEND_ANGLES: 0x22,

  /** ProtocolCode.GET_GRIPPER_VALUE = 0x65 — mycobot280.py::get_gripper_value() */
  GET_GRIPPER_VALUE: 0x65,
  /** ProtocolCode.SET_GRIPPER_STATE = 0x66 — mycobot280.py::set_gripper_state() */
  SET_GRIPPER_STATE: 0x66,
  /** ProtocolCode.IS_GRIPPER_MOVING = 0x69 — mycobot280.py::is_gripper_moving() */
  IS_GRIPPER_MOVING: 0x69,
} as const;

export type OpcodeValue = (typeof Opcode)[keyof typeof Opcode];

/** Human-readable opcode names, for the hex log. */
export const OPCODE_NAMES: Record<number, string> = Object.fromEntries(
  Object.entries(Opcode).map(([name, value]) => [value, name]),
);

/**
 * Gripper switch states.
 * Source: pymycobot/mycobot280.py -> `set_gripper_state(flag, speed, ...)` docstring:
 *     flag (int): 0 - open, 1 - close, 254 - release
 */
export const GripperState = {
  OPEN: 0,
  CLOSE: 1,
  RELEASE: 254,
} as const;

/* -------------------------------------------------------------------------- */
/* Serial port parameters                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Source: pymycobot/mycobot280.py -> `MyCobot280.__init__`:
 *     def __init__(self, port, baudrate="115200", timeout=0.1, ...)
 *     self._serial_port.rts = False
 *     self._serial_port.open()
 *     time.sleep(1.5)  # use to 280 AR
 *
 * The 1.5 s settle delay is commented in the SDK as being specifically for the
 * 280 AR — the ATOM ESP32 reboots when the port opens and must finish booting
 * before it will answer. `rts = False` keeps that reset line de-asserted.
 */
export const SERIAL_BAUD_RATE = 115200;
export const SERIAL_DATA_BITS = 8 as const;
export const SERIAL_STOP_BITS = 1 as const;
export const SERIAL_PARITY = 'none' as const;
/** ATOM ESP32 boot settle after opening the port. mycobot280.py: `time.sleep(1.5)`. */
export const PORT_SETTLE_MS = 1500;

/**
 * Default per-request response timeout.
 * Source: pymycobot/common.py -> `read()`:
 *     if platform.system() == "Windows": wait_time = 0.15
 *     else:                              wait_time = 0.5
 *
 * The browser cannot reliably tell us the robot-side platform, so we take the
 * larger of the two documented values (0.5 s). Both values come straight from
 * the SDK; neither is invented here.
 */
export const DEFAULT_REPLY_TIMEOUT_MS = 500;

/**
 * Retry count for commands that expect a reply.
 * Source: pymycobot/mycobot280.py -> `MyCobot280._res`:
 *     try_count = 0
 *     while try_count < 3: ... (retry when no data, short data, or data[3] != genre)
 *     else: return -1
 */
export const DEFAULT_RETRIES = 3;

/* -------------------------------------------------------------------------- */
/* Joint limits and speed range                                               */
/* -------------------------------------------------------------------------- */

/*
 * Joint limits are NOT defined here. They are robot specification, not wire
 * protocol, and are shared with the kinematics and viewer code, so they live in
 * one canonical module: src/engine/robot/limits.ts (which documents why the adopted
 * values differ from pymycobot's robot_limit["MyCobot280"] entry).
 * Re-exported here only so existing protocol-layer imports keep resolving.
 */
export {
  JOINT_ANGLE_MAX,
  JOINT_ANGLE_MIN,
  JOINT_COUNT,
  SPEED_MAX,
  SPEED_MIN,
} from '@/engine/robot/limits';

/* -------------------------------------------------------------------------- */
/* Value encoding                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Angles travel the wire as signed big-endian int16 in hundredths of a degree.
 * Source: pymycobot/common.py -> `DataProcessor`:
 *     def _angle2int(self, angle):  return int(angle * 100)
 *     def _int2angle(self, _int):   return round(_int / 100.0, 3)
 *     def _encode_int16(cls, data): struct.pack(">h", data)   # ">h" = BE int16
 *     def _decode_int16(self, data): struct.unpack(">h", data)[0]
 */
export function angleToInt(angleDeg: number): number {
  return Math.trunc(angleDeg * 100);
}

export function intToAngle(raw: number): number {
  return Math.round((raw / 100.0) * 1000) / 1000;
}

/** struct.pack(">h", value) — signed big-endian int16. */
export function encodeInt16(value: number): [number, number] {
  const v = value & 0xffff;
  return [(v >> 8) & 0xff, v & 0xff];
}

/** struct.unpack(">h", ...) — signed big-endian int16. */
export function decodeInt16(hi: number, lo: number): number {
  const v = ((hi & 0xff) << 8) | (lo & 0xff);
  return v >= 0x8000 ? v - 0x10000 : v;
}

/* -------------------------------------------------------------------------- */
/* Frame construction and parsing                                             */
/* -------------------------------------------------------------------------- */

/**
 * Build a request frame: FE FE LEN OPCODE [payload...] FA.
 * Mirrors pymycobot/common.py -> `DataProcessor._mesg` for the non-CRC path.
 */
export function buildFrame(opcode: number, payload: readonly number[] = []): Uint8Array {
  const len = payload.length + 2;
  if (len > 0xff) {
    throw new RangeError(`payload too long for a single frame: ${payload.length} bytes`);
  }
  const frame = new Uint8Array(payload.length + 5);
  frame[0] = HEADER;
  frame[1] = HEADER;
  frame[2] = len;
  frame[3] = opcode;
  for (let i = 0; i < payload.length; i += 1) {
    frame[4 + i] = payload[i] & 0xff;
  }
  frame[frame.length - 1] = FOOTER;
  return frame;
}

export interface ParsedFrame {
  /** Opcode echoed by the controller (byte [3]). */
  opcode: number;
  /** Payload bytes, i.e. LEN - 2 bytes starting at offset 4. */
  payload: Uint8Array;
  /** The complete frame as it appeared on the wire, for the hex log. */
  raw: Uint8Array;
}

export interface FrameScanResult {
  frames: ParsedFrame[];
  /** Bytes that could not yet be interpreted; carry these into the next scan. */
  rest: Uint8Array;
}

/**
 * Pull every complete frame out of a receive buffer.
 *
 * Resynchronisation mirrors pymycobot/common.py -> `read()`: find a 0xFE 0xFE
 * pair, read LEN, require a sane LEN, then consume LEN + 3 bytes and require
 * the trailing byte to be the 0xFA footer. Garbage before a header is dropped.
 */
export function scanFrames(buffer: Uint8Array): FrameScanResult {
  const frames: ParsedFrame[] = [];
  let offset = 0;

  while (offset + 1 < buffer.length) {
    // Seek the 0xFE 0xFE frame header.
    if (buffer[offset] !== HEADER || buffer[offset + 1] !== HEADER) {
      offset += 1;
      continue;
    }
    // Need at least LEN and OPCODE to decide anything.
    if (offset + 3 >= buffer.length) break;

    const len = buffer[offset + 2];
    if (len < 2 || len > MAX_FRAME_LEN_BYTE) {
      // Implausible length: this was not a real header, keep scanning.
      offset += 1;
      continue;
    }

    const total = len + FRAME_OVERHEAD;
    if (offset + total > buffer.length) break; // frame still in flight

    if (buffer[offset + total - 1] !== FOOTER) {
      // Footer missing where LEN said it would be: false header, resync.
      offset += 1;
      continue;
    }

    frames.push({
      opcode: buffer[offset + 3],
      payload: buffer.slice(offset + 4, offset + total - 1),
      raw: buffer.slice(offset, offset + total),
    });
    offset += total;
  }

  return { frames, rest: buffer.slice(offset) };
}

/**
 * Decode a GET_ANGLES payload into six degrees.
 * Source: pymycobot/common.py -> `_process_received` (pairs of bytes through
 * `_decode_int16` when data_len is one of 6/8/12/...), then
 * pymycobot/mycobot280.py -> `_res`:
 *     elif genre in [ProtocolCode.GET_ANGLES, ...]:
 *         return [self._int2angle(angle) for angle in res]
 */
export function decodeAngles(payload: Uint8Array): number[] | null {
  if (payload.length !== JOINT_COUNT * 2) return null;
  const out: number[] = [];
  for (let i = 0; i < payload.length; i += 2) {
    out.push(intToAngle(decodeInt16(payload[i], payload[i + 1])));
  }
  return out;
}

/**
 * Decode a single-byte reply.
 * Source: pymycobot/common.py -> `DataProcessor._process_single`:
 *     return data[0] if data else -1
 * Applied by mycobot280.py::_res to IS_POWER_ON, IS_CONTROLLER_CONNECTED,
 * GET_GRIPPER_VALUE, IS_GRIPPER_MOVING, ...
 */
export function decodeSingle(payload: Uint8Array): number {
  return payload.length > 0 ? payload[0] : -1;
}

/** Render bytes as space-separated uppercase hex, for the on-screen log. */
export function toHex(bytes: Uint8Array | readonly number[]): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
}
