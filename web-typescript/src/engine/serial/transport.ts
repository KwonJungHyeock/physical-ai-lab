/**
 * Web Serial transport for the myCobot 280 AR (M5Stack ATOM ESP32 controller).
 *
 * Responsibilities:
 *   - own the SerialPort, the reader loop and the write stream
 *   - reassemble FE FE ... FA frames out of the byte stream
 *   - serialise requests (the ATOM answers one command at a time)
 *   - emit every transmitted and received byte to a listener for the hex log
 *
 * Request/response behaviour is modelled on pymycobot 4.0.6:
 *   pymycobot/mycobot280.py -> `MyCobot280._res`
 *   pymycobot/common.py     -> module-level `write()` / `read()`
 */

import {
  DEFAULT_RETRIES,
  DEFAULT_REPLY_TIMEOUT_MS,
  OPCODE_NAMES,
  PORT_SETTLE_MS,
  SERIAL_BAUD_RATE,
  SERIAL_DATA_BITS,
  SERIAL_PARITY,
  SERIAL_STOP_BITS,
  buildFrame,
  scanFrames,
  toHex,
  type ParsedFrame,
} from './protocol';

export type LogDirection = 'tx' | 'rx' | 'info' | 'error';

export interface LogEntry {
  id: number;
  at: number;
  direction: LogDirection;
  /** Space-separated uppercase hex, empty for info/error lines. */
  hex: string;
  note: string;
}

export type LogListener = (entry: LogEntry) => void;

export interface RequestOptions {
  /** Wait for a reply frame carrying the same opcode. */
  expectReply?: boolean;
  /** Milliseconds to wait for that reply. Defaults to DEFAULT_REPLY_TIMEOUT_MS. */
  timeoutMs?: number;
  /**
   * Attempts when a reply is expected. Defaults to DEFAULT_RETRIES (3), matching
   * `MyCobot280._res`'s `while try_count < 3` loop.
   */
  retries?: number;
  /**
   * When true a missing reply resolves to null instead of throwing. Used for
   * motion commands, which pymycobot marks `has_reply=True` but whose ack is
   * not needed to make progress.
   */
  optional?: boolean;
}

class Deferred<T> {
  readonly promise: Promise<T>;
  resolve!: (value: T) => void;
  reject!: (reason: Error) => void;

  constructor() {
    this.promise = new Promise<T>((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
    });
  }
}

interface PendingRequest {
  opcode: number;
  /** Exact bytes we sent, used to drop a controller echo of our own frame. */
  sent: Uint8Array;
  deferred: Deferred<ParsedFrame | null>;
  timer: ReturnType<typeof setTimeout> | null;
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function opcodeLabel(opcode: number): string {
  return OPCODE_NAMES[opcode] ?? `0x${opcode.toString(16).padStart(2, '0').toUpperCase()}`;
}

export class SerialTransport {
  private port: SerialPort | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private readLoop: Promise<void> | null = null;

  private rxBuffer = new Uint8Array(0);
  private pending: PendingRequest | null = null;
  /** Serialises requests: the ATOM handles one command at a time. */
  private queue: Promise<unknown> = Promise.resolve();

  private logListener: LogListener | null = null;
  private logSeq = 0;

  private disconnectListener: (() => void) | null = null;
  private onDisconnected: (() => void) | null = null;

  get isOpen(): boolean {
    return this.port !== null;
  }

  setLogListener(listener: LogListener | null): void {
    this.logListener = listener;
  }

  setDisconnectHandler(handler: (() => void) | null): void {
    this.onDisconnected = handler;
  }

  private log(direction: LogDirection, hex: string, note: string): void {
    this.logSeq += 1;
    this.logListener?.({ id: this.logSeq, at: Date.now(), direction, hex, note });
  }

  /** Prompt the user to pick a port. Must be called from a user gesture. */
  static async requestPort(): Promise<SerialPort> {
    if (typeof navigator === 'undefined' || !navigator.serial) {
      throw new Error('Web Serial API is not available in this browser.');
    }
    return navigator.serial.requestPort();
  }

  async open(port: SerialPort): Promise<void> {
    if (this.port) throw new Error('Port is already open.');

    await port.open({
      baudRate: SERIAL_BAUD_RATE,
      dataBits: SERIAL_DATA_BITS,
      stopBits: SERIAL_STOP_BITS,
      parity: SERIAL_PARITY,
      flowControl: 'none',
    });
    this.port = port;
    this.log(
      'info',
      '',
      `Port opened @ ${SERIAL_BAUD_RATE} 8N1 (pymycobot MyCobot280.__init__ baudrate="115200")`,
    );

    // pymycobot/mycobot280.py sets `self._serial_port.rts = False` before open.
    // Web Serial exposes the same line through setSignals(); the ESP32 uses
    // DTR/RTS as auto-reset lines, so both are de-asserted here.
    try {
      await port.setSignals({ requestToSend: false, dataTerminalReady: false });
      this.log('info', '', 'RTS/DTR de-asserted (pymycobot: self._serial_port.rts = False)');
    } catch {
      this.log('info', '', 'setSignals() unsupported by this port; continuing');
    }

    if (!port.readable || !port.writable) {
      await this.close();
      throw new Error('Serial port opened without readable/writable streams.');
    }

    this.writer = port.writable.getWriter();
    this.reader = port.readable.getReader();
    this.readLoop = this.pumpReader();

    this.disconnectListener = () => {
      this.log('error', '', 'Device disconnected.');
      this.onDisconnected?.();
    };
    port.addEventListener('disconnect', this.disconnectListener);

    // ATOM ESP32 reboots on port open. pymycobot/mycobot280.py:
    //     time.sleep(1.5)  # use to 280 AR
    this.log('info', '', `Waiting ${PORT_SETTLE_MS} ms for ATOM boot (pymycobot: time.sleep(1.5))`);
    await new Promise((resolve) => setTimeout(resolve, PORT_SETTLE_MS));
  }

  async close(): Promise<void> {
    const port = this.port;
    this.port = null;

    this.failPending(new Error('Port closed.'));

    if (port && this.disconnectListener) {
      port.removeEventListener('disconnect', this.disconnectListener);
      this.disconnectListener = null;
    }

    if (this.reader) {
      try {
        await this.reader.cancel();
      } catch {
        /* stream already errored */
      }
      try {
        this.reader.releaseLock();
      } catch {
        /* already released */
      }
      this.reader = null;
    }
    if (this.readLoop) {
      await this.readLoop.catch(() => undefined);
      this.readLoop = null;
    }
    if (this.writer) {
      try {
        await this.writer.close();
      } catch {
        /* stream already errored */
      }
      try {
        this.writer.releaseLock();
      } catch {
        /* already released */
      }
      this.writer = null;
    }
    if (port) {
      try {
        await port.close();
      } catch {
        /* already closed */
      }
      this.log('info', '', 'Port closed.');
    }
    this.rxBuffer = new Uint8Array(0);
  }

  private async pumpReader(): Promise<void> {
    const reader = this.reader;
    if (!reader) return;
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value && value.length > 0) this.ingest(value);
      }
    } catch (err) {
      if (this.port) {
        this.log('error', '', `Read loop stopped: ${(err as Error).message}`);
        this.failPending(err as Error);
      }
    }
  }

  private ingest(chunk: Uint8Array): void {
    const merged = new Uint8Array(this.rxBuffer.length + chunk.length);
    merged.set(this.rxBuffer, 0);
    merged.set(chunk, this.rxBuffer.length);

    const { frames, rest } = scanFrames(merged);
    // Copy into a fresh buffer so the field keeps a plain ArrayBuffer backing.
    this.rxBuffer = new Uint8Array(rest);

    for (const frame of frames) {
      const pending = this.pending;

      // The controller may echo the frame we just sent. pymycobot guards
      // against this in common.py::read() (`if [i for i in datas] == command`).
      // Drop a byte-identical echo rather than mistaking it for the reply.
      if (pending && bytesEqual(frame.raw, pending.sent)) {
        this.log('rx', toHex(frame.raw), `echo of ${opcodeLabel(frame.opcode)}, ignored`);
        continue;
      }

      this.log('rx', toHex(frame.raw), opcodeLabel(frame.opcode));

      // pymycobot/mycobot280.py::_res retries whenever `data[3] != expected_genre`,
      // i.e. a frame for another opcode is not the reply we are waiting for.
      if (pending && frame.opcode === pending.opcode) {
        this.settle(frame);
      }
    }

    // Anything left that cannot start a frame is noise (e.g. ATOM boot text).
    if (this.rxBuffer.length > 0 && this.rxBuffer[0] !== 0xfe && !this.rxBuffer.includes(0xfe)) {
      this.log('rx', toHex(this.rxBuffer), 'unframed bytes, discarded');
      this.rxBuffer = new Uint8Array(0);
    }
  }

  private settle(frame: ParsedFrame | null): void {
    const pending = this.pending;
    if (!pending) return;
    this.pending = null;
    if (pending.timer !== null) clearTimeout(pending.timer);
    pending.deferred.resolve(frame);
  }

  private failPending(err: Error): void {
    const pending = this.pending;
    if (!pending) return;
    this.pending = null;
    if (pending.timer !== null) clearTimeout(pending.timer);
    pending.deferred.reject(err);
  }

  /**
   * Send one command and optionally wait for its reply.
   * Calls are serialised through an internal queue.
   */
  request(
    opcode: number,
    payload: readonly number[] = [],
    options: RequestOptions = {},
  ): Promise<ParsedFrame | null> {
    const run = () => this.doRequest(opcode, payload, options);
    const result = this.queue.then(run, run);
    // Keep the chain alive even when a request rejects.
    this.queue = result.catch(() => undefined);
    return result;
  }

  private async doRequest(
    opcode: number,
    payload: readonly number[],
    options: RequestOptions,
  ): Promise<ParsedFrame | null> {
    if (!this.writer) throw new Error('Not connected.');

    const {
      expectReply = false,
      timeoutMs = DEFAULT_REPLY_TIMEOUT_MS,
      retries = expectReply ? DEFAULT_RETRIES : 1,
      optional = false,
    } = options;

    const frame = buildFrame(opcode, payload);
    const attempts = Math.max(1, expectReply ? retries : 1);

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      // pymycobot/mycobot280.py::_res calls reset_input_buffer() before each
      // write so a stale reply cannot be mistaken for the current one.
      this.rxBuffer = new Uint8Array(0);

      const deferred = expectReply ? new Deferred<ParsedFrame | null>() : null;
      if (deferred) {
        this.pending = { opcode, sent: frame, deferred, timer: null };
        this.pending.timer = setTimeout(() => this.settle(null), timeoutMs);
      }

      this.log(
        'tx',
        toHex(frame),
        attempts > 1 ? `${opcodeLabel(opcode)} (attempt ${attempt}/${attempts})` : opcodeLabel(opcode),
      );
      await this.writer.write(frame);

      if (!deferred) return null;

      const reply = await deferred.promise;
      if (reply) return reply;
      this.log('error', '', `${opcodeLabel(opcode)}: no reply within ${timeoutMs} ms`);
    }

    if (optional) return null;
    throw new Error(`No reply for ${opcodeLabel(opcode)} after ${attempts} attempt(s).`);
  }
}
