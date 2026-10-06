'use client';

/**
 * /spike/serial — Web Serial bridge to a myCobot 280 AR.
 *
 * Feasibility spike: prove that a browser can drive the arm's M5Stack ATOM
 * controller directly over the Web Serial API, using the myCobot serial
 * protocol transcribed from pymycobot (see src/engine/serial/protocol.ts).
 */

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';

import { MyCobot280Client } from '@/engine/serial/client';
import { SerialTransport, type LogEntry } from '@/engine/serial/transport';
import { SERIAL_BAUD_RATE } from '@/engine/serial/protocol';
import {
  JOINT_ANGLE_MAX,
  JOINT_ANGLE_MIN,
  JOINT_COUNT,
  JOINT_NAMES,
  clampJointAngle,
} from '@/engine/robot/limits';

type ConnectionState = 'idle' | 'connecting' | 'connected' | 'error';

/** Current-angle poll period, per the spike brief. */
const POLL_INTERVAL_MS = 200;
/** Ring-buffer size for the on-screen hex log. */
const MAX_LOG_ENTRIES = 400;
/** Debounce on slider input so we do not flood the 115200 baud link. */
const SLIDER_SEND_DEBOUNCE_MS = 120;

const DIRECTION_STYLE: Record<LogEntry['direction'], string> = {
  tx: 'text-sky-300',
  rx: 'text-emerald-300',
  info: 'text-neutral-400',
  error: 'text-red-300',
};

const DIRECTION_LABEL: Record<LogEntry['direction'], string> = {
  tx: 'TX',
  rx: 'RX',
  info: '··',
  error: '!!',
};

/** Web Serial presence is a client-only fact; useSyncExternalStore keeps SSR honest. */
const NO_OP_SUBSCRIBE = () => () => {};
const readSerialSupport = () => typeof navigator !== 'undefined' && !!navigator.serial;
const serialSupportOnServer = () => null;

function formatTime(ms: number): string {
  const d = new Date(ms);
  return `${d.toLocaleTimeString('en-GB', { hour12: false })}.${String(d.getMilliseconds()).padStart(3, '0')}`;
}

export default function SerialSpikePage() {
  const [client] = useState(() => new MyCobot280Client(new SerialTransport()));

  // null until mounted, so server and client render the same markup.
  const supported = useSyncExternalStore(
    NO_OP_SUBSCRIBE,
    readSerialSupport,
    serialSupportOnServer,
  );

  const [state, setState] = useState<ConnectionState>('idle');
  const [statusMessage, setStatusMessage] = useState('연결되지 않음');
  const [portLabel, setPortLabel] = useState('');

  const [angles, setAngles] = useState<number[] | null>(null);
  const [targets, setTargets] = useState<number[]>(() => new Array(JOINT_COUNT).fill(0));
  const [speed, setSpeed] = useState(50);
  const [gripperSpeed, setGripperSpeed] = useState(50);
  const [gripperValue, setGripperValue] = useState<number | null>(null);
  const [controllerOk, setControllerOk] = useState<number | null>(null);
  const [powerOn, setPowerOn] = useState<number | null>(null);

  const [polling, setPolling] = useState(true);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [autoScroll, setAutoScroll] = useState(true);

  const logRef = useRef<HTMLDivElement | null>(null);
  const sendTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectedRef = useRef(false);

  const connected = state === 'connected';

  useEffect(() => {
    client.setLogListener((entry) => {
      setLog((prev) => {
        const next =
          prev.length >= MAX_LOG_ENTRIES ? prev.slice(prev.length - MAX_LOG_ENTRIES + 1) : prev.slice();
        next.push(entry);
        return next;
      });
    });
    return () => client.setLogListener(null);
  }, [client]);

  useEffect(() => {
    if (autoScroll && logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [log, autoScroll]);

  const disconnect = useCallback(async () => {
    connectedRef.current = false;
    if (sendTimer.current !== null) {
      clearTimeout(sendTimer.current);
      sendTimer.current = null;
    }
    await client.close();
    setState('idle');
    setStatusMessage('연결 해제됨');
    setPortLabel('');
    setAngles(null);
    setControllerOk(null);
    setPowerOn(null);
    setGripperValue(null);
  }, [client]);

  const connect = useCallback(async () => {
    setState('connecting');
    setStatusMessage('포트 선택 대기 중…');
    try {
      const port = await MyCobot280Client.requestPort();
      setStatusMessage(`포트 여는 중 (${SERIAL_BAUD_RATE} baud)…`);
      await client.open(port);

      const info = port.getInfo();
      setPortLabel(
        info.usbVendorId !== undefined
          ? `USB ${info.usbVendorId.toString(16).padStart(4, '0')}:${(info.usbProductId ?? 0).toString(16).padStart(4, '0')}`
          : '시리얼 포트',
      );

      client.setDisconnectHandler(() => {
        void disconnect().then(() => {
          setState('error');
          setStatusMessage('장치가 물리적으로 분리되었습니다.');
        });
      });

      connectedRef.current = true;
      setState('connected');
      setStatusMessage('연결됨');

      // IS_CONTROLLER_CONNECTED is the SDK's own liveness probe.
      setControllerOk(await client.isControllerConnected());
      setPowerOn(await client.isPowerOn());

      const initial = await client.getAngles();
      if (initial) {
        setAngles(initial);
        setTargets(initial);
      }
    } catch (err) {
      connectedRef.current = false;
      // requestPort() rejects with NotFoundError when the chooser is dismissed.
      if ((err as Error).name === 'NotFoundError') {
        setState('idle');
        setStatusMessage('포트를 선택하지 않았습니다.');
      } else {
        setState('error');
        setStatusMessage((err as Error).message);
      }
      await client.close().catch(() => undefined);
    }
  }, [client, disconnect]);

  /**
   * Poll GET_ANGLES on a self-rescheduling timer rather than setInterval, so a
   * slow reply cannot pile requests up behind itself.
   */
  useEffect(() => {
    if (!connected || !polling) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      if (cancelled) return;
      try {
        const next = await client.getAngles();
        if (!cancelled && next) setAngles(next);
      } catch {
        // Transport already logged it; keep polling.
      }
      if (!cancelled) timer = setTimeout(tick, POLL_INTERVAL_MS);
    };

    timer = setTimeout(tick, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      if (timer !== null) clearTimeout(timer);
    };
  }, [connected, polling, client]);

  // Tear the port down if the page unmounts while connected.
  useEffect(() => {
    return () => {
      connectedRef.current = false;
      if (sendTimer.current !== null) clearTimeout(sendTimer.current);
      void client.close();
    };
  }, [client]);

  const queueSendAngles = useCallback(
    (next: number[]) => {
      if (!connectedRef.current) return;
      if (sendTimer.current !== null) clearTimeout(sendTimer.current);
      sendTimer.current = setTimeout(() => {
        sendTimer.current = null;
        void client.sendAngles(next, speed).catch(() => undefined);
      }, SLIDER_SEND_DEBOUNCE_MS);
    },
    [client, speed],
  );

  const onSliderChange = useCallback(
    (index: number, value: number) => {
      setTargets((prev) => {
        const next = prev.slice();
        next[index] = clampJointAngle(index, value);
        queueSendAngles(next);
        return next;
      });
    },
    [queueSendAngles],
  );

  const runPowerOn = useCallback(async () => {
    await client.powerOn();
    setPowerOn(await client.isPowerOn());
  }, [client]);

  const runPowerOff = useCallback(async () => {
    await client.powerOff();
    setPowerOn(await client.isPowerOn());
  }, [client]);

  const syncTargetsFromRobot = useCallback(() => {
    if (angles) setTargets(angles);
  }, [angles]);

  const statusTone = useMemo(() => {
    if (state === 'connected') return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200';
    if (state === 'error') return 'border-red-500/40 bg-red-500/10 text-red-200';
    if (state === 'connecting') return 'border-amber-500/40 bg-amber-500/10 text-amber-200';
    return 'border-neutral-700 bg-neutral-900/60 text-neutral-300';
  }, [state]);

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-10">
      <nav className="mb-6 text-sm">
        <Link href="/" className="text-neutral-400 underline hover:text-neutral-200">
          ← 홈
        </Link>
        <span className="mx-2 text-neutral-600">/</span>
        <Link href="/spike/diag" className="text-neutral-400 underline hover:text-neutral-200">
          환경 진단
        </Link>
      </nav>

      <h1 className="text-2xl font-semibold">Web Serial 브리지 스파이크</h1>
      <p className="mt-2 text-sm text-neutral-400">
        myCobot 280 AR (M5Stack ATOM ESP32) 을 브라우저에서 직접 제어합니다. 프로토콜은 pymycobot
        4.0.6 소스에서 추출했습니다.
      </p>

      {supported === false && (
        <div className="mt-6 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          이 브라우저는 Web Serial API 를 지원하지 않습니다.{' '}
          <Link href="/spike/diag" className="underline">
            환경 진단
          </Link>{' '}
          에서 원인을 확인하세요.
        </div>
      )}

      {/* Connection ------------------------------------------------------- */}
      <section className="mt-6 rounded-lg border border-neutral-800 bg-neutral-900/40 p-4">
        <div className="flex flex-wrap items-center gap-3">
          {connected ? (
            <button
              type="button"
              onClick={() => void disconnect().catch(() => undefined)}
              className="rounded bg-neutral-200 px-4 py-2 text-sm font-medium text-neutral-900 hover:bg-white"
            >
              연결 해제
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void connect().catch(() => undefined)}
              disabled={supported !== true || state === 'connecting'}
              className="rounded bg-sky-500 px-4 py-2 text-sm font-medium text-white hover:bg-sky-400 disabled:cursor-not-allowed disabled:bg-neutral-700 disabled:text-neutral-400"
            >
              연결
            </button>
          )}

          <span className={`rounded border px-3 py-1.5 text-sm ${statusTone}`}>
            {statusMessage}
            {portLabel && <span className="ml-2 font-mono text-xs opacity-70">{portLabel}</span>}
          </span>
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div className="rounded border border-neutral-800 px-3 py-2">
            <dt className="text-xs text-neutral-500">baudrate</dt>
            <dd className="font-mono">{SERIAL_BAUD_RATE} 8N1</dd>
          </div>
          <div className="rounded border border-neutral-800 px-3 py-2">
            <dt className="text-xs text-neutral-500">controller (0x14)</dt>
            <dd className="font-mono">
              {controllerOk === null ? '—' : controllerOk === 1 ? '1 (연결)' : `${controllerOk}`}
            </dd>
          </div>
          <div className="rounded border border-neutral-800 px-3 py-2">
            <dt className="text-xs text-neutral-500">power (0x12)</dt>
            <dd className="font-mono">
              {powerOn === null ? '—' : powerOn === 1 ? '1 (ON)' : `${powerOn}`}
            </dd>
          </div>
          <div className="rounded border border-neutral-800 px-3 py-2">
            <dt className="text-xs text-neutral-500">gripper (0x65)</dt>
            <dd className="font-mono">{gripperValue === null ? '—' : gripperValue}</dd>
          </div>
        </dl>
      </section>

      {/* Power / controller ------------------------------------------------ */}
      <section className="mt-4 rounded-lg border border-neutral-800 bg-neutral-900/40 p-4">
        <h2 className="text-sm font-medium">전원 및 상태</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <ActionButton
            disabled={!connected}
            onClick={() => void runPowerOn().catch(() => undefined)}
          >
            전원 ON (0x10)
          </ActionButton>
          <ActionButton
            disabled={!connected}
            onClick={() => void runPowerOff().catch(() => undefined)}
          >
            전원 OFF (0x11)
          </ActionButton>
          <ActionButton
            disabled={!connected}
            onClick={() => void (async () => setControllerOk(await client.isControllerConnected()))().catch(() => undefined)}
          >
            컨트롤러 확인 (0x14)
          </ActionButton>
          <ActionButton
            disabled={!connected}
            onClick={() => void (async () => setPowerOn(await client.isPowerOn()))().catch(() => undefined)}
          >
            전원 상태 읽기 (0x12)
          </ActionButton>
          <ActionButton disabled={!connected} onClick={() => void client.releaseAllServos().catch(() => undefined)}>
            서보 해제 (0x13)
          </ActionButton>
        </div>
      </section>

      {/* Joints ------------------------------------------------------------ */}
      <section className="mt-4 rounded-lg border border-neutral-800 bg-neutral-900/40 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-medium">관절각 (6축)</h2>
          <div className="flex items-center gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={polling}
                onChange={(e) => setPolling(e.target.checked)}
                className="accent-sky-500"
              />
              <span className="text-neutral-400">{POLL_INTERVAL_MS}ms 폴링 (0x20)</span>
            </label>
            <button
              type="button"
              onClick={syncTargetsFromRobot}
              disabled={!connected || !angles}
              className="rounded border border-neutral-700 px-2 py-1 text-xs text-neutral-300 hover:border-neutral-500 disabled:opacity-40"
            >
              슬라이더를 현재값으로
            </button>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          {JOINT_NAMES.map((label, i) => (
            <div key={label} className="grid grid-cols-[2.5rem_1fr_5.5rem_5.5rem] items-center gap-3">
              <span className="font-mono text-sm text-neutral-400">{label}</span>
              <input
                type="range"
                min={JOINT_ANGLE_MIN[i]}
                max={JOINT_ANGLE_MAX[i]}
                step={0.1}
                value={targets[i]}
                disabled={!connected}
                onChange={(e) => onSliderChange(i, Number(e.target.value))}
                className="w-full accent-sky-500 disabled:opacity-40"
              />
              <span className="text-right font-mono text-sm text-sky-300">
                {targets[i].toFixed(1)}°
              </span>
              <span className="text-right font-mono text-sm text-emerald-300">
                {angles ? `${angles[i].toFixed(2)}°` : '—'}
              </span>
            </div>
          ))}
        </div>

        <div className="mt-3 grid grid-cols-[2.5rem_1fr_5.5rem_5.5rem] gap-3 text-right text-xs text-neutral-500">
          <span />
          <span className="text-left">
            범위는 pymycobot robot_info.py 의 MyCobot280 angles_min/max 를 따릅니다.
          </span>
          <span className="text-sky-300/70">목표</span>
          <span className="text-emerald-300/70">현재</span>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <span className="text-neutral-400">속도</span>
            <input
              type="range"
              min={1}
              max={100}
              value={speed}
              onChange={(e) => setSpeed(Number(e.target.value))}
              className="w-40 accent-sky-500"
            />
            <span className="w-10 font-mono">{speed}</span>
          </label>
          <ActionButton
            disabled={!connected}
            onClick={() => void client.sendAngles(targets, speed).catch(() => undefined)}
          >
            전체 전송 (0x22)
          </ActionButton>
          <ActionButton
            disabled={!connected}
            onClick={() => void client.sendAngles(new Array(JOINT_COUNT).fill(0), speed).catch(() => undefined)}
          >
            영점 자세 (0x22)
          </ActionButton>
        </div>
      </section>

      {/* Gripper ----------------------------------------------------------- */}
      <section className="mt-4 rounded-lg border border-neutral-800 bg-neutral-900/40 p-4">
        <h2 className="text-sm font-medium">그리퍼</h2>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <span className="text-neutral-400">속도</span>
            <input
              type="range"
              min={0}
              max={100}
              value={gripperSpeed}
              onChange={(e) => setGripperSpeed(Number(e.target.value))}
              className="w-40 accent-sky-500"
            />
            <span className="w-10 font-mono">{gripperSpeed}</span>
          </label>
          <ActionButton
            disabled={!connected}
            onClick={() => void client.setGripperState('OPEN', gripperSpeed).catch(() => undefined)}
          >
            열기 (0x66 flag=0)
          </ActionButton>
          <ActionButton
            disabled={!connected}
            onClick={() => void client.setGripperState('CLOSE', gripperSpeed).catch(() => undefined)}
          >
            닫기 (0x66 flag=1)
          </ActionButton>
          <ActionButton
            disabled={!connected}
            onClick={() => void client.setGripperState('RELEASE', gripperSpeed).catch(() => undefined)}
          >
            해제 (0x66 flag=254)
          </ActionButton>
          <ActionButton
            disabled={!connected}
            onClick={() => void (async () => setGripperValue(await client.getGripperValue()))().catch(() => undefined)}
          >
            값 읽기 (0x65)
          </ActionButton>
        </div>
      </section>

      {/* Hex log ----------------------------------------------------------- */}
      <section className="mt-4 rounded-lg border border-neutral-800 bg-neutral-900/40 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-medium">송수신 바이트 로그 (hex)</h2>
          <div className="flex items-center gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={autoScroll}
                onChange={(e) => setAutoScroll(e.target.checked)}
                className="accent-sky-500"
              />
              <span className="text-neutral-400">자동 스크롤</span>
            </label>
            <button
              type="button"
              onClick={() => {
                const text = log
                  .map((e) => `${formatTime(e.at)} ${DIRECTION_LABEL[e.direction]} ${e.hex} ${e.note}`)
                  .join('\n');
                void navigator.clipboard?.writeText(text);
              }}
              className="rounded border border-neutral-700 px-2 py-1 text-xs text-neutral-300 hover:border-neutral-500"
            >
              복사
            </button>
            <button
              type="button"
              onClick={() => setLog([])}
              className="rounded border border-neutral-700 px-2 py-1 text-xs text-neutral-300 hover:border-neutral-500"
            >
              지우기
            </button>
          </div>
        </div>

        <div
          ref={logRef}
          className="mt-3 h-80 overflow-auto rounded border border-neutral-800 bg-black/40 p-3 font-mono text-xs leading-relaxed"
        >
          {log.length === 0 ? (
            <p className="text-neutral-600">아직 로그가 없습니다.</p>
          ) : (
            log.map((entry) => (
              <div key={entry.id} className="whitespace-pre-wrap break-all">
                <span className="text-neutral-600">{formatTime(entry.at)} </span>
                <span className={DIRECTION_STYLE[entry.direction]}>
                  {DIRECTION_LABEL[entry.direction]}
                </span>
                {entry.hex && <span className="text-neutral-200"> {entry.hex}</span>}
                {entry.note && <span className="text-neutral-500"> — {entry.note}</span>}
              </div>
            ))
          )}
        </div>
        <p className="mt-2 text-xs text-neutral-500">
          최근 {MAX_LOG_ENTRIES}줄만 유지합니다. 실기기 응답이 pymycobot 문서와 다르면 이 로그를
          그대로 첨부해 보고하세요.
        </p>
      </section>
    </main>
  );
}

function ActionButton({
  children,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="rounded border border-neutral-700 bg-neutral-800/60 px-3 py-1.5 text-sm text-neutral-200 hover:border-neutral-500 hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}
