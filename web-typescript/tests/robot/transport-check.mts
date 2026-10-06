/**
 * End-to-end exercise of SerialTransport + MyCobot280Client against an
 * in-process emulation of the ATOM controller.
 *
 * The emulator answers with the frames the real firmware is documented to send
 * (see src/engine/serial/protocol.ts for the pymycobot references). It covers the
 * paths that are easy to get wrong and impossible to see from a type checker:
 * byte-level reassembly across chunk boundaries, request serialisation,
 * reply/opcode matching, echo suppression, and the retry-then-fail path.
 *
 * Run with: npm run check:transport
 */
import assert from 'node:assert/strict';

import { MyCobot280Client } from '../../src/engine/serial/client';
import { SerialTransport } from '../../src/engine/serial/transport';
import { Opcode, buildFrame, encodeInt16, angleToInt, toHex } from '../../src/engine/serial/protocol';

interface EmulatorOptions {
  /** Echo each request frame back before replying, as some firmwares do. */
  echoRequests?: boolean;
  /** Deliver replies one byte at a time to stress frame reassembly. */
  dribble?: boolean;
  /** Opcodes to deliberately leave unanswered, to exercise the timeout path. */
  silentFor?: number[];
}

class AtomEmulator {
  angles = [0, -45.5, 90, 12.34, -155, 180];
  power = 0;
  gripper = 37;
  readonly received: number[][] = [];

  private controller: ReadableStreamDefaultController<Uint8Array> | null = null;

  private readonly options: EmulatorOptions;

  constructor(options: EmulatorOptions = {}) {
    this.options = options;
  }

  readonly readable = new ReadableStream<Uint8Array>({
    start: (controller) => {
      this.controller = controller;
    },
  });

  readonly writable = new WritableStream<Uint8Array>({
    write: (chunk) => this.onRequest(chunk),
  });

  private emit(bytes: Uint8Array): void {
    if (!this.controller) return;
    if (this.options.dribble) {
      for (const b of bytes) this.controller.enqueue(new Uint8Array([b]));
    } else {
      this.controller.enqueue(bytes);
    }
  }

  private onRequest(chunk: Uint8Array): void {
    this.received.push(Array.from(chunk));
    const opcode = chunk[3];
    const payload = chunk.slice(4, chunk.length - 1);

    if (this.options.echoRequests) this.emit(chunk);
    if (this.options.silentFor?.includes(opcode)) return;

    switch (opcode) {
      case Opcode.IS_CONTROLLER_CONNECTED:
        this.emit(buildFrame(opcode, [1]));
        break;
      case Opcode.POWER_ON:
        this.power = 1;
        break; // no reply: generate.py::power_on() does not set has_reply
      case Opcode.POWER_OFF:
        this.power = 0;
        break;
      case Opcode.IS_POWER_ON:
        this.emit(buildFrame(opcode, [this.power]));
        break;
      case Opcode.RELEASE_ALL_SERVOS:
        break; // no reply
      case Opcode.GET_ANGLES: {
        const bytes: number[] = [];
        for (const a of this.angles) bytes.push(...encodeInt16(angleToInt(a)));
        this.emit(buildFrame(opcode, bytes));
        break;
      }
      case Opcode.SEND_ANGLES: {
        const next: number[] = [];
        for (let i = 0; i < 12; i += 2) {
          const raw = (payload[i] << 8) | payload[i + 1];
          next.push((raw >= 0x8000 ? raw - 0x10000 : raw) / 100);
        }
        this.angles = next;
        this.emit(buildFrame(opcode, [1]));
        break;
      }
      case Opcode.SET_GRIPPER_STATE:
        this.gripper = payload[0] === 0 ? 100 : payload[0] === 1 ? 0 : this.gripper;
        break; // no reply
      case Opcode.GET_GRIPPER_VALUE:
        this.emit(buildFrame(opcode, [this.gripper]));
        break;
      default:
        break;
    }
  }

  asSerialPort(): SerialPort {
    return {
      readable: this.readable,
      writable: this.writable,
      open: async () => {},
      close: async () => {},
      getInfo: () => ({ usbVendorId: 0x1a86, usbProductId: 0x55d4 }),
      setSignals: async () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
    } as unknown as SerialPort;
  }
}

/** Keep the ATOM boot delay out of the test's wall-clock budget. */
function fastSettle<T>(fn: () => Promise<T>): Promise<T> {
  const realSetTimeout = globalThis.setTimeout;
  const patched = ((handler: TimerHandler, ms?: number, ...rest: unknown[]) =>
    realSetTimeout(handler as () => void, ms && ms >= 1500 ? 5 : ms, ...rest)) as typeof setTimeout;
  globalThis.setTimeout = patched;
  return fn().finally(() => {
    globalThis.setTimeout = realSetTimeout;
  });
}

async function scenario(name: string, options: EmulatorOptions, body: (c: MyCobot280Client, e: AtomEmulator) => Promise<void>) {
  const emulator = new AtomEmulator(options);
  const client = new MyCobot280Client(new SerialTransport());
  await fastSettle(() => client.open(emulator.asSerialPort()));
  try {
    await body(client, emulator);
    console.log(`  ok   ${name}`);
  } finally {
    await client.close();
  }
}

// --- 1. Happy path, whole frames in single chunks ---------------------------
await scenario('round trip: status, angles, gripper', {}, async (client, emulator) => {
  assert.equal(await client.isControllerConnected(), 1, 'IS_CONTROLLER_CONNECTED');

  await client.powerOn();
  assert.equal(await client.isPowerOn(), 1, 'power on');
  await client.powerOff();
  assert.equal(await client.isPowerOn(), 0, 'power off');

  const angles = await client.getAngles();
  assert.deepEqual(angles, [0, -45.5, 90, 12.34, -155, 180], 'GET_ANGLES decode');

  await client.sendAngles([10, 20, -30, 40, -50, 60], 42);
  assert.deepEqual(emulator.angles, [10, 20, -30, 40, -50, 60], 'SEND_ANGLES round trip');
  const sent = emulator.received.at(-1)!;
  assert.equal(sent[2], 0x0f, 'SEND_ANGLES LEN byte');
  assert.equal(sent.at(-2), 42, 'speed byte trails the angles');

  await client.setGripperState('OPEN', 50);
  assert.equal(await client.getGripperValue(), 100, 'gripper opened');
  await client.setGripperState('CLOSE', 50);
  assert.equal(await client.getGripperValue(), 0, 'gripper closed');
});

// --- 2. Byte-at-a-time delivery, i.e. worst-case chunk boundaries -----------
await scenario('frame reassembly across single-byte chunks', { dribble: true }, async (client) => {
  const angles = await client.getAngles();
  assert.deepEqual(angles, [0, -45.5, 90, 12.34, -155, 180], 'dribbled GET_ANGLES');
  assert.equal(await client.isControllerConnected(), 1, 'dribbled status reply');
});

// --- 3. Controller echoes every request before replying ----------------------
await scenario('echoed requests are not mistaken for replies', { echoRequests: true }, async (client) => {
  const angles = await client.getAngles();
  assert.deepEqual(angles, [0, -45.5, 90, 12.34, -155, 180], 'reply found past the echo');
  assert.equal(await client.isPowerOn(), 0, 'single-byte reply found past the echo');
});

// --- 4. Silent controller: retry, then surface the failure -------------------
await scenario('retry then fail when no reply arrives', { silentFor: [Opcode.IS_CONTROLLER_CONNECTED] }, async (client, emulator) => {
  const t0 = Date.now();
  await assert.rejects(
    () => client.isControllerConnected(),
    /No reply for IS_CONTROLLER_CONNECTED after 3 attempt\(s\)/,
    'required reply should reject after 3 tries',
  );
  const attempts = emulator.received.filter((f) => f[3] === Opcode.IS_CONTROLLER_CONNECTED).length;
  assert.equal(attempts, 3, 'three attempts, per MyCobot280._res');
  assert.ok(Date.now() - t0 >= 3 * 500 - 50, 'each attempt waited the full timeout');

  // getAngles is `optional`, so a silent controller yields null, not a throw.
  assert.deepEqual(await client.getAngles(), [0, -45.5, 90, 12.34, -155, 180], 'other opcodes still work');
});

// --- 5. Requests are serialised, never interleaved ---------------------------
await scenario('concurrent calls are serialised', {}, async (client, emulator) => {
  const results = await Promise.all([
    client.getAngles(),
    client.isPowerOn(),
    client.getGripperValue(),
    client.getAngles(),
  ]);
  assert.deepEqual(results[0], [0, -45.5, 90, 12.34, -155, 180]);
  assert.equal(results[1], 0);
  assert.equal(results[2], 37);
  assert.deepEqual(results[3], results[0]);
  const opcodes = emulator.received.map((f) => f[3]);
  assert.deepEqual(
    opcodes,
    [Opcode.GET_ANGLES, Opcode.IS_POWER_ON, Opcode.GET_GRIPPER_VALUE, Opcode.GET_ANGLES],
    'issued in call order, one at a time',
  );
});

// --- 6. The hex log records both directions ---------------------------------
await scenario('hex log captures TX and RX', {}, async (client) => {
  const lines: string[] = [];
  client.setLogListener((e) => lines.push(`${e.direction} ${e.hex}`));
  await client.getAngles();
  assert.ok(lines.includes(`tx ${toHex(buildFrame(Opcode.GET_ANGLES))}`), 'TX frame logged as hex');
  assert.ok(
    lines.some((l) => l.startsWith('rx FE FE 0E 20 ')),
    `RX frame logged as hex, got: ${JSON.stringify(lines)}`,
  );
  client.setLogListener(null);
});

console.log('\nTransport and client behave correctly against the emulated controller.');
