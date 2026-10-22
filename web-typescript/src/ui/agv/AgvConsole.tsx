'use client';

/**
 * 이동 로봇 실습 (myAGV): drive with the joystick, the keyboard or a game
 * pad, watch the front camera find cards and markers, see the lidar, and
 * straighten the robot's straight line.
 *
 * Anywhere it is a simulator. Served by a myAGV (robot-python/server/
 * agv_server.py) it drives the real base: the page sends the speed it wants
 * a few times a second while something is held, and the robot stops by itself
 * when that stops. The 3D robot then follows the same commands (where the
 * real one really is, only the room shows).
 */

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';

import {
  agvCameraUrl,
  fetchAgvState,
  ledAgv,
  reconnectAgv,
  stopAgv,
  straightTestAgv,
  trimAgv,
  type AgvState,
} from '@/engine/agv/link';
import { KEEP_ALIVE_MS, startKeepAlive, type KeepAlive } from '@/engine/agv/keepAlive';
import {
  AGV_MODELS,
  AgvSim,
  LANE,
  MAX_V,
  STRAIGHT_TEST,
  driveCommand,
  scanLidar,
  straightOk,
  straightResult,
  trimFromRun,
  trimFromSide,
  type AgvModelId,
  type DriveInput,
  type LidarScan,
  type Pose,
  type StraightResult,
  type Twist,
  type Wheels,
} from '@/engine/agv/sim';

import ConnectDialog from '../simulator/connect/ConnectDialog';
import Icon from '../simulator/Icon';
import cc from '../simulator/console.module.css';
import AgvStage, { type AgvView, type CalRun, type Found } from './AgvStage';
import DrivePad, { type DrivePadHandle } from './DrivePad';
import css from './agv.module.css';

const MODEL_KEY = 'agv-console-model';
const START: Pose = { x: 0, y: 0, th: 0 };
const LEDS = ['#ef4638', '#f59a1b', '#f5d90a', '#1fae66', '#3454d1', '#ffffff'];
/** One lidar turn every this many seconds (the X2L turns ~7 times a second). */
const LIDAR_S = 0.14;
/** Room the panels take over the 3D (px), so the view centres on what is left. */
const INSETS = { left: 372, right: 16, top: 86, bottom: 64 };

// ---------------------------------------------------------------- live readouts (10× a second, outside React state)

interface Live {
  pose: Pose;
  vel: Twist;
  wheels: Wheels;
  lidar: { near: number | null; front: number | null } | null;
  moving: boolean;
  found: Found[];
  pad: string | null;
}

function createLive(init: Live) {
  let value = init;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set(patch: Partial<Live>) {
      value = { ...value, ...patch };
      listeners.forEach((l) => l());
    },
    subscribe(l: () => void) {
      listeners.add(l);
      return () => void listeners.delete(l);
    },
  };
}
type LiveStore = ReturnType<typeof createLive>;
const useLive = (store: LiveStore) => useSyncExternalStore(store.subscribe, store.get, store.get);

const fmt = (v: number) => (Math.abs(v) < 0.005 ? '0.00' : v.toFixed(2));
const deg = (r: number) => (r * 180) / Math.PI;
const signed = (v: number, digits = 1) => {
  const a = Math.abs(v).toFixed(digits);
  return `${Number(a) === 0 ? '' : v > 0 ? '+' : '−'}${a}`;
};
const speedWord = (v: number) => (v < 0.15 ? '느리게' : v < 0.3 ? '보통' : '빠르게');

function Readout({ live }: { live: LiveStore }) {
  const s = useLive(live);
  const l = s.lidar;
  return (
    <div className={css.readout}>
      <div>
        <span>X</span>
        <b>{fmt(s.pose.x)}</b>
      </div>
      <div>
        <span>Y</span>
        <b>{fmt(s.pose.y)}</b>
      </div>
      <div>
        <span>방향</span>
        <b>{Math.round(deg(s.pose.th))}°</b>
      </div>
      <div className={css.v}>
        <span>앞뒤</span>
        <b>{fmt(s.vel.vx)}</b>
      </div>
      <div className={css.v}>
        <span>옆</span>
        <b>{fmt(s.vel.vy)}</b>
      </div>
      <div className={css.v}>
        <span>회전</span>
        <b>{Math.round(deg(s.vel.wz))}</b>
      </div>
      <div className={css.l}>
        <span>라이다 · 가장 가까운 물체</span>
        <b>{l && l.near !== null ? `${Math.round(l.near * 100)} cm · 앞 ${l.front !== null ? `${Math.round(l.front * 100)} cm` : '없음'}` : '—'}</b>
      </div>
      <p>
        <span>위치 m · 방향 °</span>
        <span>속도 m/s · °/s</span>
      </p>
    </div>
  );
}

function MoveLamp({ live }: { live: LiveStore }) {
  const { moving } = useLive(live);
  return (
    <span className={css.lamp} data-on={moving ? 'move' : undefined}>
      <i />
      {moving ? '주행 중' : '멈춤'}
    </span>
  );
}

function Motors({ live }: { live: LiveStore }) {
  const { wheels } = useLive(live);
  const names: [keyof Wheels, string][] = [
    ['fl', '앞 왼쪽'],
    ['fr', '앞 오른쪽'],
    ['rl', '뒤 왼쪽'],
    ['rr', '뒤 오른쪽'],
  ];
  return (
    <div className={css.motors} aria-label="바퀴 속도 (rad/s)">
      {names.map(([k, name]) => {
        const v = wheels[k];
        return (
          <div key={k} className={css.motor}>
            {name}
            <i>
              <u style={{ width: `${Math.min(100, Math.abs(v) * 8)}%` }} />
            </i>
            <b>{Math.abs(v) < 0.05 ? '0.0' : signed(v)}</b>
          </div>
        );
      })}
    </div>
  );
}

function PadLamp({ live }: { live: LiveStore }) {
  const { pad } = useLive(live);
  return (
    <div className={css.src}>
      <b>
        <i data-off={pad ? undefined : ''} />
        {pad ? '게임패드 연결됨' : '게임패드'}
      </b>
      <span>{pad ? '왼쪽 스틱 이동 · 오른쪽 스틱 돌기 · B 멈춤' : 'USB·블루투스 패드를 꽂고 버튼을 누르세요'}</span>
    </div>
  );
}

/** Boxes and names over the camera picture, and the line under it. */
function CameraFinds({ live, spec }: { live: LiveStore; spec: string }) {
  const { found } = useLive(live);
  return (
    <>
      <svg className={css.finds} viewBox="0 0 640 480" preserveAspectRatio="none" aria-hidden="true">
        {found.map((f, i) => {
          const [x0, y0, x1, y1] = f.box.map((v, j) => v * (j % 2 ? 480 : 640));
          const label = `${f.name} ${Math.round(f.dist * 100)}cm`;
          const w = label.length * 15 + 16;
          const lx = Math.min(640 - w, Math.max(0, x0 - 4));
          const ly = Math.max(0, y0 - 40 - i * 36);
          return (
            <g key={f.name}>
              <rect x={x0 - 4} y={y0 - 4} width={x1 - x0 + 8} height={y1 - y0 + 8} fill="none" stroke={f.kind === 'marker' ? '#22c55e' : '#fff'} strokeWidth={4} />
              {i < 2 && (
                <>
                  <rect x={lx} y={ly} width={w} height={32} rx={4} fill="rgba(16,24,40,.85)" />
                  <text x={lx + 8} y={ly + 24} fill="#fff" fontSize={24} fontWeight={700}>
                    {label}
                  </text>
                </>
              )}
            </g>
          );
        })}
      </svg>
      <span className={css.rec}>● 640×480 · {spec}</span>
    </>
  );
}

function CameraFoot({ live }: { live: LiveStore }) {
  const { found } = useLive(live);
  if (!found.length) return <span>찾은 것이 없어요. 돌면서 찾아 보세요</span>;
  return (
    <>
      {found.slice(0, 2).map((f) => (
        <span key={f.name}>
          <b>{f.name}</b> · 거리 약 {Math.round(f.dist * 100)}cm · 화면 {f.off === 0 ? '가운데' : f.off < 0 ? `왼쪽 ${-f.off}%` : `오른쪽 ${f.off}%`} · 크기 {f.size}%
        </span>
      ))}
    </>
  );
}

/** The real robot's camera, a new frame as soon as the last one has arrived. */
function RobotCamera() {
  const [src, setSrc] = useState(agvCameraUrl);
  const [error, setError] = useState('');
  return error ? (
    <span className={css.camError}>{error}</span>
  ) : src ? (
    // eslint-disable-next-line @next/next/no-img-element -- a live JPEG frame from the robot
    <img
      className={css.camImg}
      src={src}
      alt="로봇 앞 카메라"
      onLoad={() => window.setTimeout(() => setSrc(agvCameraUrl()), 120)}
      onError={() => {
        setError('로봇 카메라 영상을 받지 못했어요. 카메라 연결을 확인해 주세요.');
        window.setTimeout(() => {
          setError('');
          setSrc(agvCameraUrl());
        }, 3000);
      }}
    />
  ) : null;
}

type CalPhase = 'idle' | 'running' | 'measured' | 'saved';

export default function AgvConsole() {
  const [modelId, setModelId] = useState<AgvModelId>('pi');
  const model = AGV_MODELS[modelId];
  const [simObject] = useState(() => new AgvSim(AGV_MODELS.pi));
  const sim = useRef(simObject);
  const live = useMemo(
    () =>
      createLive({
        pose: START,
        vel: { vx: 0, vy: 0, wz: 0 },
        wheels: { fl: 0, fr: 0, rl: 0, rr: 0 },
        lidar: null,
        moving: false,
        found: [],
        pad: null,
      }),
    [],
  );
  const lidar = useRef<LidarScan | null>(null);
  const input = useRef<DriveInput & { keys: Set<string> }>({ joy: [0, 0], turn: 0, keys: new Set(), pad: [0, 0, 0] });
  const joy = useRef<DrivePadHandle>(null);
  const turn = useRef<DrivePadHandle>(null);
  const pipRef = useRef<HTMLDivElement>(null);

  const [speed, setSpeed] = useState(0.2);
  const speedRef = useRef(speed);
  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);
  const [show, setShow] = useState({ trail: true, fov: true, lidar: true });
  const [view, setViewState] = useState<AgvView>('fit');
  const [viewKey, setViewKey] = useState(0);
  const setView = (v: AgvView) => {
    setViewState(v);
    setViewKey((k) => k + 1);
  };
  const [menu, setMenu] = useState(false);
  const [connectOpen, setConnectOpen] = useState(false);
  const [hold, setHold] = useState(false);
  const [led, setLed] = useState('#1fae66');
  const [log, setLogState] = useState<{ kind: '' | 'ok' | 'err'; text: string }>({
    kind: '',
    text: '조이스틱을 끌거나 W A S D 로 움직여 보세요. 앞 카메라에 카드가 보이면 이름과 거리가 나와요.',
  });
  const setLog = useCallback((kind: '' | 'ok' | 'err', text: string) => setLogState((l) => (l.text === text && l.kind === kind ? l : { kind, text })), []);

  // the real robot (only when this page is served by a myAGV)
  const [robot, setRobot] = useState<AgvState | null>(null);
  const [robotMode, setRobotMode] = useState(false);
  const [lost, setLost] = useState(false);
  const robotModeRef = useRef(false);
  const robotRef = useRef<AgvState | null>(null);
  const keepRef = useRef<KeepAlive | null>(null);
  const [camSource, setCamSource] = useState<'sim' | 'robot'>('sim');

  // straight-line calibration
  const [cal, setCal] = useState<{ phase: CalPhase; result: StraightResult | null; runs: CalRun[] }>({ phase: 'idle', result: null, runs: [] });
  const calStart = useRef<Pose>(START);
  /** The robot's own 1 m test in progress: when it started, and whether the robot has reported it running. */
  const robotTest = useRef<{ at: number; seen: boolean } | null>(null);
  const [sideCm, setSideCm] = useState('');
  const [trimShown, setTrimShown] = useState({ w: 0, y: 0 });

  useEffect(() => {
    try {
      const m = localStorage.getItem(MODEL_KEY) as AgvModelId | null;
      // Read after the first render so server and client HTML agree.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (m && m in AGV_MODELS) setModelId(m);
    } catch {
      /* storage blocked */
    }
    sim.current.reset(START);
  }, []);
  useEffect(() => {
    sim.current.model = model;
  }, [model]);
  useEffect(() => {
    sim.current.hold = hold;
  }, [hold]);

  const chooseModel = (id: AgvModelId) => {
    setModelId(id);
    setMenu(false);
    try {
      localStorage.setItem(MODEL_KEY, id);
    } catch {
      /* this session only */
    }
  };

  /* --- stopping ------------------------------------------------------------ */
  const stopAll = useCallback((): Promise<unknown> => {
    const i = input.current;
    i.joy = [0, 0];
    i.turn = 0;
    i.keys.clear();
    i.pad = [0, 0, 0];
    joy.current?.reset();
    turn.current?.reset();
    sim.current.cmd = { vx: 0, vy: 0, wz: 0 };
    robotTest.current = null;
    if (sim.current.scripted) {
      sim.current.cancelScript();
      setCal((c) => (c.phase === 'running' ? { ...c, phase: 'idle' } : c));
    }
    if (robotModeRef.current) {
      // The keep-alive worker first, so it cannot send the old command once more after the stop.
      return Promise.all([keepRef.current?.stop(), stopAgv()]);
    }
    return Promise.resolve();
  }, []);

  /* --- every frame: input → simulator ------------------------------------- */
  const uiT = useRef(0);
  const lidarT = useRef(0);
  const padSeen = useRef<string | null>(null);
  /** Game pad B was down last frame (stop once per press). */
  const padStop = useRef(false);
  const calDone = useRef<() => void>(() => {});
  const onTick = useCallback(
    (dt: number) => {
      const i = input.current;
      // game pad: left stick moves, right stick turns, B stops
      const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
      const p = [...pads].find(Boolean) ?? null;
      if (p) {
        const dz = (v: number | undefined) => (v === undefined || Math.abs(v) < 0.12 ? 0 : v);
        i.pad = [-dz(p.axes[1]), -dz(p.axes[0]), -dz(p.axes[2])];
        const b = !!p.buttons[1]?.pressed;
        if (b && !padStop.current) void stopAll();
        padStop.current = b;
      } else i.pad = [0, 0, 0];
      const s = sim.current;
      if (!s.scripted) s.cmd = driveCommand(i, speedRef.current);
      const r = s.step(dt, !robotModeRef.current);
      if (r.blocked) {
        i.joy = [0, 0];
        i.turn = 0;
        joy.current?.reset();
        turn.current?.reset();
        setLog('err', r.blocked === 'wall' ? '벽이에요. 부딪히기 전에 멈췄어요. 다른 방향으로 움직여 보세요.' : '앞에 물건이 있어요. 부딪히기 전에 멈췄어요. 다른 방향으로 움직여 보세요.');
      }
      if (r.scriptDone && !robotModeRef.current) window.setTimeout(() => calDone.current(), 700);
      lidarT.current += dt;
      if (lidarT.current > LIDAR_S && !robotModeRef.current) {
        lidarT.current = 0;
        lidar.current = scanLidar(s.model, s.pose);
      }
      uiT.current += dt;
      if (uiT.current > 0.1) {
        uiT.current = 0;
        const padName = p ? p.id : null;
        const moving = Math.hypot(s.vel.vx, s.vel.vy, s.vel.wz) > 0.005;
        live.set({ pose: s.pose, vel: { ...s.vel }, wheels: { ...s.wheels }, lidar: robotModeRef.current ? null : lidar.current, moving, pad: padName });
        if (padName !== padSeen.current) padSeen.current = padName;
      }
    },
    [live, setLog, stopAll],
  );
  const onFound = useCallback((found: Found[]) => live.set({ found }), [live]);

  /* --- keyboard ------------------------------------------------------------ */
  useEffect(() => {
    const KEYS: Record<string, string> = { w: 'w', a: 'a', s: 's', d: 'd', q: 'q', e: 'e', arrowup: 'w', arrowdown: 's', arrowleft: 'q', arrowright: 'e' };
    const typing = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable || !!t.closest('[role=dialog]'));
    };
    const down = (e: KeyboardEvent) => {
      if (typing(e) || e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === ' ' || k === 'escape') {
        e.preventDefault();
        stopAll();
        return;
      }
      if (KEYS[k]) {
        e.preventDefault();
        input.current.keys.add(KEYS[k]);
      }
    };
    const up = (e: KeyboardEvent) => {
      const k = KEYS[e.key.toLowerCase()];
      if (k) input.current.keys.delete(k);
    };
    // A key let go in another window never comes back as keyup here: stop.
    const blur = () => input.current.keys.clear();
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, [stopAll]);

  /* --- the real robot ------------------------------------------------------ */
  useEffect(() => {
    let alive = true;
    let timer = 0;
    let misses = 0;
    let shown = '';
    const tick = async () => {
      const s = await fetchAgvState(AbortSignal.timeout(900));
      if (!alive) return;
      if (s) {
        misses = 0;
        setLost(false);
        if (!robotModeRef.current) {
          robotModeRef.current = true;
          setRobotMode(true);
          setCamSource(s.camera ? 'robot' : 'sim');
          // Mirror the commands, not motors: the real motors are the real robot's.
          sim.current.gains = { fl: 1, fr: 1, rl: 1, rr: 1 };
          setLog('', `로봇 ${s.robotId ?? ''} 에 연결됐어요. 조이스틱이나 W A S D 로 움직이면 실제 로봇이 움직여요. 주변을 비워 두세요.`);
        }
        robotRef.current = s;
        sim.current.trim = s.trim;
        // The 1 m test runs on the robot: it is over when the robot says so (not when the picture's copy ends).
        const w = robotTest.current;
        if (w) {
          if (s.running) w.seen = true;
          if (!s.running && (w.seen || Date.now() - w.at > 1500)) {
            robotTest.current = null;
            sim.current.cancelScript();
            calDone.current();
          }
        }
        const key = JSON.stringify({ ...s, vx: 0, vy: 0, wz: 0, moving: 0, demoPose: 0 });
        if (key !== shown) {
          shown = key;
          setRobot(s);
          setTrimShown(s.trim);
        }
      } else if (robotModeRef.current && ++misses === 3) setLost(true);
      timer = window.setTimeout(tick, robotModeRef.current ? 300 : 3000);
    };
    void tick();
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [setLog]);

  // Keep-alive: a worker sends the speed while something is held, and zero once when let go (engine/agv/keepAlive).
  // The page tells it the current command every tick; that is also its sign that the page is alive.
  useEffect(() => {
    if (!robotMode) return;
    const keep = startKeepAlive((error) => setLog('err', `로봇: ${error}`));
    keepRef.current = keep;
    const id = window.setInterval(() => {
      const r = robotRef.current;
      const drive = r?.connected && !lost && !sim.current.scripted;
      keep.set(drive ? driveCommand(input.current, speedRef.current) : null);
    }, KEEP_ALIVE_MS);
    return () => {
      window.clearInterval(id);
      keepRef.current = null;
      keep.close();
    };
  }, [robotMode, lost, setLog]);

  /* --- straight-line calibration ------------------------------------------ */
  const startStraight = async () => {
    // Every stop has reached the robot before the test starts (a late one would cancel it).
    await stopAll();
    if (robotMode) {
      const res = await straightTestAgv();
      if (!res.ok) return setLog('err', `로봇: ${res.error ?? '시작하지 못했어요.'}`);
      robotTest.current = { at: Date.now(), seen: false };
    }
    const s = sim.current;
    s.reset({ x: LANE.x0, y: LANE.y, th: 0 });
    calStart.current = { ...s.pose };
    s.runScript({ vx: STRAIGHT_TEST.speed, vy: 0, wz: 0 }, STRAIGHT_TEST.seconds);
    setCal((c) => ({ ...c, phase: 'running', result: null }));
    setView('lane');
    setSideCm('');
    setLog('', robotMode ? '1m 직진 테스트 중이에요. 로봇이 보정 줄(테이프)을 따라가는지 보세요.' : '1m 직진 테스트 중이에요. 보정 줄을 따라가는지 보세요.');
  };
  const finishStraight = () => {
    const s = sim.current;
    if (robotModeRef.current) {
      setCal((c) => ({ ...c, phase: 'measured' }));
      setLog('', '로봇이 멈췄어요. 테이프 끝(1m)에서 로봇 가운데가 옆으로 몇 cm 벗어났는지 재서 넣어 주세요.');
      return;
    }
    const res = straightResult(calStart.current, s.pose);
    const ok = straightOk(res);
    const calibrated = s.trim.w !== 0 || s.trim.y !== 0 || s.hold;
    setCal((c) => ({ phase: 'measured', result: res, runs: [...c.runs.slice(-3), { points: s.trail.slice(), ok: ok && calibrated }] }));
    setLog(
      ok ? 'ok' : '',
      ok
        ? calibrated
          ? '직진 보정이 잘 되었어요. 이 값으로 곧게 가요.'
          : '처음부터 곧게 가요. 보정할 필요가 없어요.'
        : `1m 에 ${Math.abs(deg(res.dth)).toFixed(1)}° 틀어지고 ${Math.abs(res.side * 100).toFixed(1)}cm 밀렸어요. [보정 저장]을 눌러 보세요.`,
    );
  };
  useEffect(() => {
    calDone.current = finishStraight;
  });
  const saveStraight = async () => {
    if (robotMode) {
      const cm = Number(sideCm.replace(',', '.'));
      if (!Number.isFinite(cm) || Math.abs(cm) > 30) return setLog('err', '옆으로 벗어난 거리를 cm 로 넣어 주세요 (왼쪽 +, 오른쪽 −, 30cm 까지).');
      const t = trimFromSide(robotRef.current?.trim ?? { w: 0, y: 0 }, cm / 100);
      const res = await trimAgv(t);
      if (!res.ok) return setLog('err', `로봇: ${res.error ?? '저장하지 못했어요.'}`);
      setTrimShown(t);
      setCal((c) => ({ ...c, phase: 'saved' }));
      return setLog('ok', '보정값을 로봇에 저장했어요 (다음에 켜도 남아요). 다시 [1m 직진 테스트]로 확인해요.');
    }
    if (!cal.result) return;
    const s = sim.current;
    s.trim = trimFromRun(s.trim, cal.result);
    setTrimShown(s.trim);
    setCal((c) => ({ ...c, phase: 'saved' }));
    setLog('ok', '보정값을 저장했어요. 다시 [1m 직진 테스트]로 곧게 가는지 확인해요.');
  };
  const clearTrim = async () => {
    if (robotMode) {
      const res = await trimAgv({ w: 0, y: 0 });
      if (!res.ok) return setLog('err', `로봇: ${res.error ?? '지우지 못했어요.'}`);
    } else sim.current.trim = { w: 0, y: 0 };
    setTrimShown({ w: 0, y: 0 });
    setCal({ phase: 'idle', result: null, runs: [] });
    setLog('', '보정값을 지웠어요.');
  };

  const pickLed = async (c: string) => {
    setLed(c);
    if (robotMode) {
      const n = parseInt(c.slice(1), 16);
      const res = await ledAgv((n >> 16) & 255, (n >> 8) & 255, n & 255);
      if (!res.ok) setLog('err', `로봇: ${res.error ?? '불빛을 바꾸지 못했어요.'}`);
    }
  };

  const toStart = () => {
    stopAll();
    sim.current.reset(START);
    setView('fit');
  };

  const robotId = robot?.robotId;
  useEffect(() => {
    document.title = robotId ? `로봇 ${robotId} · Physical AI 이동 로봇 실습` : 'Physical AI 이동 로봇 실습';
  }, [robotId]);

  const camOn = camSource === 'sim';
  const stageProps = useMemo(
    () => ({ show: { ...show, lidar: show.lidar && !robotMode } }),
    [show, robotMode],
  );
  const r = cal.result;

  return (
    <div className={`${cc.app} ${css.agv}`}>
      <div className={css.stage}>
        <AgvStage
          model={model}
          sim={sim}
          onTick={onTick}
          show={stageProps.show}
          view={view}
          viewKey={viewKey}
          lidar={lidar}
          pipRef={pipRef}
          camOn={camOn}
          onFound={onFound}
          calRuns={cal.runs}
          led={led}
          insets={INSETS}
        />
      </div>

      {connectOpen && <ConnectDialog current={robotMode && robot?.robotId ? { id: robot.robotId, ips: robot.ips ?? [] } : null} onClose={() => setConnectOpen(false)} />}

      <header className={css.top}>
        <div className={css.brand}>
          {/* eslint-disable-next-line @next/next/no-img-element -- fixed logo, also in the robot's static export */}
          <img src="/brand/sim-logo-ink.svg" alt="ROBODYNE SYSTEMS" width={73} height={36} />
          <b>이동 로봇 실습</b>
        </div>
        <div className={css.modelWrap}>
          <button type="button" className={css.chipBtn} onClick={() => setMenu((m) => !m)} aria-expanded={menu} aria-haspopup="menu">
            <small>모델</small>
            <b>{model.short}</b>
          </button>
          {menu && (
            <div className={css.modelMenu} role="menu">
              {(Object.keys(AGV_MODELS) as AgvModelId[]).map((id) => (
                <button key={id} type="button" role="menuitemradio" aria-checked={id === modelId} onClick={() => chooseModel(id)}>
                  <b>{AGV_MODELS[id].name}</b>
                  <small>{AGV_MODELS[id].line}</small>
                </button>
              ))}
              <Link href="/console?pick=1" className={css.menuLink} role="menuitem">
                로봇팔 (myCobot 280) 로 바꾸기 →
              </Link>
            </div>
          )}
        </div>
        <span className={css.spacer} />
        <span className={css.modeChip} data-mode={robotMode ? (robot?.demo ? 'demo' : 'real') : 'sim'}>
          {robotMode ? (robot?.demo ? 'DEMO' : 'REAL') : 'SIM'}
        </span>
        <button type="button" className={css.conn} data-state={robotMode ? (lost || !robot?.connected ? 'off' : 'on') : 'sim'} onClick={() => setConnectOpen(true)}>
          <i />
          <span>
            <b>{!robotMode ? '로봇 연결' : lost ? '로봇 서버 연결 끊김' : robot?.connected ? `${robot.demo ? '데모 ' : ''}로봇 ${robot.robotId ?? ''} 연결됨` : `로봇 ${robot?.robotId ?? ''} 바닥 보드 끊김`}</b>
            <small>{robotMode ? (robot?.ips?.[0] ?? '') : '지금: 시뮬레이션 · 로봇 찾기'}</small>
          </span>
          <Icon name="link" size={15} />
        </button>
      </header>

      <aside className={css.dock} aria-label="주행 패널">
        <header>
          <b>주행 패널</b>
          <span className={css.badge} data-mode={robotMode ? 'real' : 'sim'}>
            {robotMode ? (robot?.demo ? 'DEMO' : 'REAL') : 'SIM'}
          </span>
        </header>
        <div className={css.dockBody}>
          <section className={css.card} aria-label="로봇 상태">
            <h3>
              로봇 상태 <em>0.1초마다</em>
            </h3>
            <div className={css.lamps}>
              <span className={css.lamp} data-on={robotMode ? (robot?.connected && !lost ? 'ok' : 'err') : 'ok'}>
                <i />
                {robotMode ? (robot?.connected && !lost ? '로봇 연결' : '연결 끊김') : '시뮬레이션'}
              </span>
              <span className={css.lamp} data-on="ok">
                <i />
                배터리 {robotMode ? (robot?.battery ? `${robot.battery.toFixed(1)}V` : '—') : '12.1V'}
              </span>
              <MoveLamp live={live} />
            </div>
            <Readout live={live} />
            {robotMode && (
              <p className={css.note}>
                화면 속 위치는 보낸 명령으로 계산한 값이에요. 라이다는 시뮬레이션에서만 보여요.
                {robot && !robot.connected && (
                  <button type="button" className={cc.ghost} onClick={() => void reconnectAgv().then((res) => setLog(res.ok ? 'ok' : 'err', res.ok ? '바닥 보드와 다시 연결됐어요.' : `로봇: ${res.error}`))}>
                    다시 연결
                  </button>
                )}
              </p>
            )}
          </section>

          <section className={css.card} aria-label="조종">
            <h3>
              조종 <em>손을 떼면 멈춰요</em>
            </h3>
            <div className={css.sticks}>
              <DrivePad
                ref={joy}
                axis="xy"
                label="이동 조이스틱"
                knob="이동"
                onMove={(x, y) => {
                  input.current.joy = [x, y];
                }}
              >
                <span className={css.lbl} data-at="top">
                  앞
                </span>
                <span className={css.lbl} data-at="bottom">
                  뒤
                </span>
                <span className={css.lbl} data-at="left">
                  왼
                </span>
                <span className={css.lbl} data-at="right">
                  오
                </span>
              </DrivePad>
              <div className={css.turn}>
                <DrivePad
                  ref={turn}
                  axis="x"
                  label="돌기"
                  knob="⟲⟳"
                  onMove={(x) => {
                    input.current.turn = x;
                  }}
                />
                <small>돌기 (좌우로 끌기)</small>
                <button type="button" className={css.stopBig} onClick={stopAll}>
                  ■ 멈춤
                </button>
                <small>Space</small>
              </div>
            </div>
            <label className={css.speed}>
              <span>
                최고 속도{' '}
                <b>
                  {speed.toFixed(2)} m/s · {speedWord(speed)}
                </b>
              </span>
              <input type="range" min={0.05} max={MAX_V} step={0.05} value={speed} onChange={(e) => setSpeed(Number(e.target.value))} aria-label="최고 속도" />
            </label>
            <div className={css.inputs}>
              <div className={css.src}>
                <b>
                  <i />
                  키보드
                </b>
                <span>
                  <kbd>W</kbd>
                  <kbd>A</kbd>
                  <kbd>S</kbd>
                  <kbd>D</kbd> 이동 · <kbd>Q</kbd>
                  <kbd>E</kbd> 돌기
                </span>
              </div>
              <PadLamp live={live} />
            </div>
            <button type="button" className={cc.ghost} onClick={toStart}>
              출발 칸으로 옮기기
            </button>
          </section>

          <section className={css.card} aria-label="직진 보정">
            <h3>
              직진 보정 <em>모터 차이로 휘는 것 바로잡기</em>
            </h3>
            <div className={css.calSteps}>
              <span data-on="">① 1m 직진 테스트</span>
              <span data-on={cal.phase === 'measured' || cal.phase === 'saved' ? '' : undefined}>② 휜 정도 재기</span>
              <span data-on={cal.phase === 'saved' ? '' : undefined}>③ 보정 저장</span>
            </div>
            <Motors live={live} />
            <div className={css.calRes} aria-live="polite">
              {cal.phase === 'idle' && (
                <span>
                  로봇을 <b>보정 줄</b>(노란 테이프) 시작점에 두고 [1m 직진 테스트]를 눌러요.
                </span>
              )}
              {cal.phase === 'running' && <span>1m 앞으로 가는 중… (0.2 m/s, 5초)</span>}
              {cal.phase === 'measured' && r && !robotMode && (
                <>
                  <span>
                    간 거리 <b>{r.d.toFixed(2)} m</b>
                  </span>
                  <span>
                    방향 틀어짐 <b data-good={straightOk(r) || undefined}>{signed(deg(r.dth))}°</b> · 옆 밀림 <b data-good={straightOk(r) || undefined}>{signed(r.side * 100)} cm</b>
                  </span>
                  <span className={css.muted}>{straightOk(r) ? '✓ 거의 곧게 가요 (초록 선)' : '빨간 선: 모터 힘이 조금씩 달라 휘어요'}</span>
                </>
              )}
              {cal.phase === 'measured' && robotMode && (
                <label className={css.sideInput}>
                  <span>1m 끝에서 옆으로 벗어난 거리 (왼쪽 +, 오른쪽 −)</span>
                  <span>
                    <input value={sideCm} onChange={(e) => setSideCm(e.target.value)} inputMode="decimal" placeholder="예: -3.5" aria-label="옆으로 벗어난 거리 cm" /> cm
                  </span>
                </label>
              )}
              {cal.phase === 'saved' && (
                <>
                  <span>저장한 보정값 (1m 갈 때마다)</span>
                  <span>
                    회전 <b>{signed(deg(trimShown.w), 2)}°</b> · 옆 <b>{signed(trimShown.y * 100, 2)} cm</b>
                  </span>
                  <span className={css.muted}>다시 [1m 직진 테스트]로 확인해요.</span>
                </>
              )}
            </div>
            <div className={css.row2}>
              <button type="button" className={css.primary} onClick={() => void startStraight()} disabled={cal.phase === 'running' || (robotMode && !robot?.connected)}>
                ▶ 1m 직진 테스트
              </button>
              <button
                type="button"
                className={css.btn}
                onClick={() => void saveStraight()}
                disabled={cal.phase !== 'measured' || (!robotMode && !!r && straightOk(r)) || (robotMode && !sideCm.trim())}
              >
                보정 저장
              </button>
            </div>
            <div className={css.calFoot}>
              {!robotMode && (
                <label className={css.toggle}>
                  <input type="checkbox" checked={hold} onChange={(e) => setHold(e.target.checked)} /> 방향 유지 (자이로) <small>직진 중 틀어지면 바로잡기</small>
                </label>
              )}
              {(trimShown.w !== 0 || trimShown.y !== 0) && (
                <button type="button" className={cc.ghost} onClick={() => void clearTrim()}>
                  보정 지우기
                </button>
              )}
            </div>
          </section>

          <section className={css.card} aria-label="불빛">
            <h3>
              불빛 <em>{robotMode ? '로봇 뒤쪽 LED' : '연결 확인 때 깜빡여요'}</em>
            </h3>
            <div className={css.leds}>
              {LEDS.map((c) => (
                <button key={c} type="button" style={{ background: c }} aria-pressed={led === c} aria-label={`불빛 ${c}`} onClick={() => void pickLed(c)} />
              ))}
            </div>
          </section>
        </div>
      </aside>

      <div className={css.viewbar} role="toolbar" aria-label="보기">
        {(
          [
            ['fit', '맞춤'],
            ['top', '위'],
            ['follow', '뒤따라 보기'],
          ] as [AgvView, string][]
        ).map(([v, name]) => (
          <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)}>
            {name}
          </button>
        ))}
        <i />
        {(
          [
            ['trail', '궤적'],
            ['fov', '카메라 시야'],
            ['lidar', '라이다'],
          ] as [keyof typeof show, string][]
        ).map(([k, name]) => (
          <button key={k} type="button" aria-pressed={show[k]} disabled={k === 'lidar' && robotMode} onClick={() => setShow((s) => ({ ...s, [k]: !s[k] }))}>
            {name}
          </button>
        ))}
      </div>

      <section className={css.pip} aria-label="앞 카메라">
        <div className={css.pipHead}>
          앞 카메라
          {robotMode && (
            <span className={css.seg}>
              <button type="button" aria-pressed={camSource === 'robot'} onClick={() => setCamSource('robot')} disabled={!robot?.camera}>
                로봇
              </button>
              <button type="button" aria-pressed={camSource === 'sim'} onClick={() => setCamSource('sim')}>
                시뮬레이션
              </button>
            </span>
          )}
          <span className={css.camSpec}>{model.camSpec}</span>
        </div>
        <div ref={pipRef} className={css.pipView} data-source={camSource}>
          {camSource === 'robot' ? <RobotCamera /> : <CameraFinds live={live} spec={robotMode ? '시뮬레이션' : '15fps'} />}
        </div>
        <div className={css.pipFoot}>{camSource === 'robot' ? <span>로봇 카메라 영상 (찾기 표시는 시뮬레이션에서)</span> : <CameraFoot live={live} />}</div>
      </section>

      <div className={css.logbar} role="status">
        <span className={css.k} data-kind={log.kind || undefined}>
          {log.kind === 'err' ? '멈춤' : log.kind === 'ok' ? '완료' : '안내'}
        </span>
        <span className={css.logText}>{log.text}</span>
        {lost && <span className={css.lostNote}>로봇 전원·같은 Wi-Fi 인지 확인해요. 화면은 스스로 다시 연결해요.</span>}
      </div>
    </div>
  );
}
