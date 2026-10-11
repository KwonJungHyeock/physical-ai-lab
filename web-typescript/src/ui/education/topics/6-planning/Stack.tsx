'use client';

/** F3 쌓기: the same three-block pump stacking at three speeds — A slow, B fast, C too fast (torque over the limit, the tower leans). */

import { useEffect, useRef, useState } from 'react';

import type { ChainSegment } from '@/engine/robot/kinematics';
import { tcpFor } from '@/engine/simulator/effectors';
import type { RobotAction } from '@/engine/simulator/sim';
import { inverseDynamics, torqueLimits } from '@/engine/physics/dynamics';
import { moveContact, poseContact } from '@/engine/physics/collide';
import { createPhysics, type BlockPose, type BlockSpec, type PhysicsWorld } from '@/engine/physics/physics';
import { quinticWithin, rrtConnect, trapezoid, type Profile } from '@/engine/physics/planning';
import { STEP_NAME } from '@/engine/education/catalog';

import css from '../../learn.module.css';
import { Graph, Readout } from '../../widgets';
import { HOME_POSE, LEARN_COLORS, STEP_COLORS, Verdict, fmt, reachFor, tipOf, type Mm } from '../kit';
import type { TopicProps } from '../types';

type K = 'A' | 'B' | 'C';

const TCP = tcpFor('pump', false);
const DT = 1 / 60;
const SIZE = 25;
const GOAL: Mm = [170, -140, 0];
const START: BlockSpec[] = [
  { id: 'r', color: '#e5484d', at: [230, 40, 12.5] },
  { id: 'y', color: '#f3c51f', at: [160, 110, 12.5] },
  { id: 'b', color: '#3454d1', at: [250, -40, 12.5] },
];
const ORDER = ['b', 'r', 'y'];
const NAMES: Record<string, string> = { r: '빨강', y: '노랑', b: '파랑' };

/** Time profile of every move (joint distance in degrees → profile). */
const SPEEDS: Record<K, { name: string; how: string; profile: (deg: number) => Profile }> = {
  A: { name: '느리게', how: '5차 곡선, 최대 90°/s', profile: (d) => quinticWithin(d, 90, 300) },
  B: { name: '빠르게', how: '5차 곡선, 최대 180°/s', profile: (d) => quinticWithin(d, 180, 1200) },
  C: { name: '너무 빠르게', how: '사다리꼴, 최대 400°/s · 4000°/s²', profile: (d) => trapezoid(d, 400, 4000) },
};

/**
 * The servos follow the commanded angles like a spring with a damper (about 3 Hz, damping 0.3): a slow
 * motion is followed closely, a fast stop overshoots and swings — that swing is what tips a tower.
 */
const SERVO_WN = 20;
const SERVO_ZETA = 0.3;

export interface Servo {
  q: number[];
  v: number[];
}

/** Advance the servos one step towards `cmd`. */
export function followServo(s: Servo, cmd: readonly number[]): void {
  const n = 8;
  const h = DT / n;
  for (let k = 0; k < n; k += 1) {
    for (let j = 0; j < s.q.length; j += 1) {
      const acc = SERVO_WN * SERVO_WN * (cmd[j] - s.q[j]) - 2 * SERVO_ZETA * SERVO_WN * s.v[j];
      s.v[j] += acc * h;
      s.q[j] += s.v[j] * h;
    }
  }
}

export interface Ctl {
  cmd: number[];
  /** Where the servos really are (they follow `cmd`). */
  servo: Servo;
  pump: boolean;
  phase: string;
}

/** A robot command without its line number. */
type NoLine<T> = T extends unknown ? Omit<T, 'line'> : never;

const restingServo = (): Servo => ({ q: HOME_POSE.slice(), v: [0, 0, 0, 0, 0, 0] });

export interface StackResult {
  ok: boolean;
  /** Why it stopped, when it did. */
  note: string;
  timeS: number;
  /** Largest |τ| / limit over the run, and which joint. */
  peak: number;
  peakJ: number;
  /** Largest |τ| / limit at each step of the run (for the graph). */
  torque: number[];
  /** Blocks resting on another block + 1. */
  floors: number;
  /** Top block's horizontal offset from the bottom one, mm. */
  leanMm: number;
  blocks: BlockPose[];
  /** The motion as robot commands (to replay on the real arm). */
  actions: RobotAction[];
}

/** Floors and lean of what stands on the goal spot. */
export function towerOf(blocks: readonly BlockPose[]) {
  const sorted = blocks.slice().sort((a, b) => a.at.z - b.at.z);
  const base = sorted.filter((b) => b.at.z < SIZE).sort((a, b) => Math.hypot(a.at.x - GOAL[0], a.at.y - GOAL[1]) - Math.hypot(b.at.x - GOAL[0], b.at.y - GOAL[1]))[0];
  const floors = 1 + blocks.filter((b) => b.at.z > SIZE + 5).length;
  const top = sorted[sorted.length - 1];
  const leanMm = base && top ? Math.hypot(top.at.x - base.at.x, top.at.y - base.at.y) : 0;
  return { floors, leanMm };
}

/**
 * Pick each block from above with the pump and stack it on the goal spot: IK for every pose, a
 * collision-checked (or RRT) joint path, the chosen time profile, the torque it needs with the block held.
 * One physics step per yield; the caller moves the servos towards `ctl.cmd` and steps the world.
 */
export function* stackRun(w: PhysicsWorld, chain: readonly ChainSegment[], k: K, ctl: Ctl): Generator<void, StackResult, void> {
  const limits = torqueLimits(chain, TCP);
  w.reset(START, [], HOME_POSE);
  ctl.cmd = HOME_POSE.slice();
  ctl.servo = restingServo();
  ctl.pump = false;
  for (let i = 0; i < 20; i += 1) yield;
  let frames = 0;
  let peak = 0;
  let peakJ = 0;
  const torque: number[] = [];
  const actions: RobotAction[] = [{ type: 'angles', angles: HOME_POSE.slice(), speed: 30, line: 1 }];
  const act = (a: NoLine<RobotAction>) => actions.push({ ...a, line: actions.length + 1 } as RobotAction);
  const done = (ok: boolean, note: string): StackResult => {
    const blocks = w.blocks().map((b) => ({ ...b, at: b.at.clone(), q: b.q.clone() }));
    const { floors, leanMm } = towerOf(blocks);
    return { ok, note, timeS: frames * DT, peak, peakJ, torque, floors, leanMm, blocks, actions };
  };

  /** Along the joint poses `path` with this speed's profile; torque with `kg` held. */
  function* glide(path: number[][], kg: number): Generator<void, void, void> {
    const seg = path.slice(1).map((p, i) => Math.max(...p.map((v, j) => Math.abs(v - path[i][j]))));
    const len = seg.reduce((a, b) => a + b, 0);
    const prof = SPEEDS[k].profile(len);
    const n = Math.max(1, Math.ceil(prof.durationS / DT));
    for (let f = 1; f <= n; f += 1) {
      const s = prof.sample(Math.min(prof.durationS, f * DT));
      let left = s.p;
      let i = 1;
      while (i < path.length - 1 && left > seg[i - 1]) {
        left -= seg[i - 1];
        i += 1;
      }
      const a = path[i - 1];
      const b = path[i];
      const u = seg[i - 1] ? Math.min(1, left / seg[i - 1]) : 1;
      const q = a.map((v, j) => v + (b[j] - v) * u);
      const dir = a.map((v, j) => (b[j] - v) / (seg[i - 1] || 1));
      const tau = inverseDynamics(chain, q, dir.map((d) => d * s.v), dir.map((d) => d * s.a), { payloadKg: kg, tcpMm: TCP });
      let worst = 0;
      tau.forEach((t, j) => {
        const r = Math.abs(t) / limits[j];
        if (r > worst) worst = r;
        if (r > peak) {
          peak = r;
          peakJ = j;
        }
      });
      torque.push(worst * 100);
      ctl.cmd = q;
      frames += 1;
      yield;
    }
    path.slice(1).forEach((angles, i) => act({ type: 'angles', angles, speed: 40, via: i < path.length - 2 }));
  }

  /** Tool point (mm) → pose (IK) → a free path there (straight, or RRT round the table) → move. */
  function* goTo(p: Mm, phase: string, kg: number): Generator<void, boolean, void> {
    ctl.phase = phase;
    const from = ctl.cmd.slice();
    const q = reachFor(chain, p, from, TCP);
    if (!q) return false;
    let path = [from, q];
    if (moveContact(chain, from, q, [], TCP)) {
      const r = rrtConnect(from, q, (qq) => !poseContact(chain, qq, [], TCP));
      if (!r.ok) return false;
      path = r.path;
    }
    yield* glide(path, kg);
    return true;
  }

  function* wait(s: number): Generator<void, void, void> {
    for (let i = 0; i < Math.round(s / DT); i += 1) {
      frames += 1;
      torque.push(torque[torque.length - 1] ?? 0);
      yield;
    }
  }

  let level = 0;
  for (const id of ORDER) {
    const b = w.blocks().find((x) => x.id === id);
    if (!b) continue;
    const top = b.at.z + SIZE / 2;
    if (!(yield* goTo([b.at.x, b.at.y, top + 50], `${NAMES[id]} 블록 위`, 0))) return done(false, '닿지 않는 자리예요.');
    if (!(yield* goTo([b.at.x, b.at.y, top + 1.5], '내려가기', 0))) return done(false, '닿지 않는 자리예요.');
    ctl.pump = true;
    ctl.phase = '펌프 켜기';
    act({ type: 'pump', on: true });
    act({ type: 'wait', sec: 0.5 });
    yield* wait(0.3);
    if (!w.grab(8)) {
      ctl.pump = false;
      return done(false, `${NAMES[id]} 블록을 못 집었어요. 팔이 흔들려 블록을 건드렸어요.`);
    }
    const kg = w.heldMassKg();
    const stackTop = level * SIZE;
    if (!(yield* goTo([b.at.x, b.at.y, top + 70], '들어 올리기', kg))) return done(false, '닿지 않는 자리예요.');
    if (!(yield* goTo([GOAL[0], GOAL[1], stackTop + SIZE + 60], '쌓을 자리 위', kg))) return done(false, '닿지 않는 자리예요.');
    if (!(yield* goTo([GOAL[0], GOAL[1], stackTop + SIZE + 1.5], '내려놓기', kg))) return done(false, '닿지 않는 자리예요.');
    w.release();
    ctl.pump = false;
    ctl.phase = '펌프 끄기';
    act({ type: 'pump', on: false });
    act({ type: 'wait', sec: 0.5 });
    yield* wait(0.2);
    if (!(yield* goTo([GOAL[0], GOAL[1], stackTop + SIZE + 60], '위로 빠지기', 0))) return done(false, '닿지 않는 자리예요.');
    level += 1;
  }
  ctl.phase = '';
  for (let i = 0; i < 90; i += 1) yield;
  act({ type: 'angles', angles: HOME_POSE.slice(), speed: 30 });
  const r = done(true, '');
  return { ...r, ok: r.floors === 3 };
}

const rowOf = (r: StackResult) => ({
  '걸린 시간': `${fmt(r.timeS, 1)} s`,
  '최대 토크': `${fmt(r.peak * 100, 0)}% (J${r.peakJ + 1})${r.peak > 1 ? ' 넘음' : ''}`,
  '탑 기울기': r.floors === 3 ? `${fmt(r.leanMm, 1)} mm` : `무너짐 (${r.floors}층)`,
});

export default function F3Stack({ chain, show, real, step, record }: TopicProps) {
  const k: K = step === 'cmp' ? 'C' : step;
  const [view, setView] = useState<{ q: number[]; blocks: BlockPose[]; pump: boolean; phase: string }>({ q: HOME_POSE.slice(), blocks: [], pump: false, phase: '' });
  const [res, setRes] = useState<Partial<Record<K, StackResult>>>({});
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [realMsg, setRealMsg] = useState('');
  const sim = useRef<{
    w: PhysicsWorld | null;
    prog: Generator<void, StackResult, void> | null;
    ctl: Ctl;
    done: ((r: StackResult) => void) | null;
    reset: boolean;
  }>({ w: null, prog: null, ctl: { cmd: HOME_POSE.slice(), servo: restingServo(), pump: false, phase: '' }, done: null, reset: false });

  // Each step starts over: the three blocks in their places, the arm at home.
  /** The step the last run was started on: a step change resets the scene, but never a run already started on the new step. */
  const runStep = useRef<string | null>(null);
  useEffect(() => {
    if (runStep.current !== step) sim.current.reset = true;
  }, [step]);

  useEffect(() => {
    let alive = true;
    let raf = 0;
    const s = sim.current;
    void createPhysics(chain, TCP, START, [], HOME_POSE).then((w) => {
      if (!alive) {
        w.dispose();
        return;
      }
      s.w = w;
      setReady(true);
      let last = -1;
      let acc = 0;
      const tick = (now: number) => {
        if (last < 0) last = now;
        // While a try runs, catch up to 0.25 s per frame so a slow PC still finishes it (same fixed steps, same result).
        acc = Math.min(acc + (now - last) / 1000, (s.prog ? 15 : 4) * DT);
        last = now;
        while (acc >= DT) {
          acc -= DT;
          if (s.reset) {
            s.reset = false;
            w.reset(START, [], HOME_POSE);
            s.ctl = { cmd: HOME_POSE.slice(), servo: restingServo(), pump: false, phase: '' };
            if (s.prog) {
              s.prog = null;
              s.done = null;
              setBusy(false);
            }
          }
          if (s.prog) {
            const r = s.prog.next();
            if (r.done) {
              s.prog = null;
              s.done?.(r.value);
            }
          }
          followServo(s.ctl.servo, s.ctl.cmd);
          w.stepTo(s.ctl.servo.q, DT);
        }
        setView({ q: s.ctl.servo.q.slice(), blocks: w.blocks(), pump: s.ctl.pump, phase: s.ctl.phase });
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    });
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      s.w?.dispose();
      s.w = null;
      s.prog = null;
    };
  }, [chain]);

  const run = () => {
    const s = sim.current;
    if (!s.w || step === 'cmp') return;
    const key = k;
    // The run resets the world itself; a step change's pending reset must not cancel it on the next tick.
    runStep.current = step;
    s.reset = false;
    s.ctl = { cmd: HOME_POSE.slice(), servo: restingServo(), pump: false, phase: '' };
    s.prog = stackRun(s.w, chain, key, s.ctl);
    s.done = (r) => {
      setBusy(false);
      setRes((old) => ({ ...old, [key]: r }));
      record(key, rowOf(r));
    };
    setRealMsg('');
    setBusy(true);
  };

  const sendReal = async () => {
    const a = res.A?.actions;
    if (!a) return;
    setRealMsg('보내는 중…');
    const r = await real.run(a);
    setRealMsg(r.ok ? '실물 로봇이 느린 동작(활동 1)을 해요 (흡착 펌프 필요).' : (r.error ?? '로봇이 받지 않았어요.'));
  };

  useEffect(() => {
    const goal = { key: 'goal', mm: [GOAL[0], GOAL[1], 0.5] as Mm, color: LEARN_COLORS.accent, label: '쌓을 자리' };
    if (step === 'cmp') {
      // The three towers side by side: B and C shifted along y so they don't overlap.
      const keys = (['A', 'B', 'C'] as K[]).filter((key) => res[key]);
      const shift: Record<K, number> = { A: -70, B: 0, C: 70 };
      show({
        angles: HOME_POSE,
        tool: 'pump',
        frames: 'none',
        blocks: keys.flatMap((key) =>
          res[key]!.blocks.map((b) => {
            const at = b.at.clone();
            at.x += shift[key];
            return { ...b, id: `${key}${b.id}`, at, color: STEP_COLORS[key] };
          }),
        ),
        labels: keys.map((key) => ({ key, mm: [GOAL[0] + shift[key], GOAL[1], 105] as Mm, text: `${key} ${SPEEDS[key].name}`, color: STEP_COLORS[key] })),
      });
      return;
    }
    const tip = tipOf(chain, view.q, TCP);
    show({
      angles: view.q,
      tool: 'pump',
      pumpOn: view.pump,
      frames: 'none',
      blocks: view.blocks,
      spots: [goal],
      labels: view.phase ? [{ key: 'phase', mm: [tip[0], tip[1], tip[2] + 45], text: view.phase, color: view.pump ? LEARN_COLORS.ok : LEARN_COLORS.accent }] : [],
    });
  }, [view, step, res, chain, show]);

  if (step === 'cmp') {
    const keys = (['A', 'B', 'C'] as K[]).filter((key) => res[key]);
    const n = Math.max(1, ...keys.map((key) => res[key]!.torque.length));
    return (
      <section className={css.card}>
        <h3>세 속도 비교</h3>
        {keys.length > 0 ? (
          <Graph
            title="가장 힘든 관절의 토크 (한계 대비, 점선 = 100%)"
            x={Array.from({ length: n }, (_, i) => i * DT)}
            series={keys.map((key) => ({ label: `${STEP_NAME[key]} ${SPEEDS[key].name}`, color: STEP_COLORS[key], values: res[key]!.torque }))}
            unit="%"
            limit={100}
            height={110}
          />
        ) : (
          <p className={css.note}>활동 1 · 2 · 3 을 해 보면 여기에 겹쳐 보여요.</p>
        )}
        <p className={css.note}>3D 화면: 끝난 탑 셋을 나란히 (왼쪽부터 활동 1 · 2 · 3).</p>
      </section>
    );
  }

  const r = res[k];
  const live = towerOf(view.blocks);
  return (
    <section className={css.card}>
      <h3>
        {SPEEDS[k].name}: {SPEEDS[k].how}
      </h3>
      <div className={css.btnRow}>
        <button type="button" className={css.primary} disabled={busy || !ready} onClick={run}>
          {SPEEDS[k].name}
        </button>
      </div>
      <div className={css.row3}>
        <Readout label="걸린 시간" value={r ? fmt(r.timeS, 1) : '—'} unit="s" />
        <Readout label="최대 토크 (한계 대비)" value={r ? fmt(r.peak * 100, 0) : '—'} unit="%" tone={r ? (r.peak > 1 ? 'bad' : r.peak > 0.8 ? 'warn' : 'ok') : undefined} />
        <Readout label="탑 기울기" value={r ? (r.floors === 3 ? fmt(r.leanMm, 1) : '무너짐') : busy ? '…' : '—'} unit={r && r.floors === 3 ? 'mm' : undefined} tone={r ? (r.floors < 3 || r.leanMm > 5 ? 'bad' : r.leanMm > 2.5 ? 'warn' : 'ok') : undefined} />
      </div>
      {r && (
        <>
          <Graph title="토크 (가장 힘든 관절, 한계 대비)" x={r.torque.map((_, i) => i * DT)} series={[{ label: SPEEDS[k].name, color: STEP_COLORS[k], values: r.torque }]} unit="%" limit={100} height={80} />
          <Verdict tone={r.peak > 1 || r.floors < 3 || r.leanMm > 5 ? 'bad' : r.leanMm > 2.5 || r.peak > 0.8 ? 'warn' : 'ok'}>
            {r.note ||
              (r.floors < 3
                ? `탑이 무너졌어요 (${r.floors}층). 멈출 때 팔이 흔들려 블록을 밀었어요.`
                : `${fmt(r.timeS, 1)} 초 · 토크 ${fmt(r.peak * 100, 0)}%${r.peak > 1 ? ' (모터 한계를 넘어요)' : ''} · 맨 위 블록이 ${fmt(r.leanMm, 1)} mm 어긋났어요.`)}
          </Verdict>
        </>
      )}
      {busy && <p className={css.note}>쌓는 중… 지금 {live.floors}층</p>}
      <p className={css.note}>
        블록마다: 역기구학 → 충돌 검사한 길 → 시간 곡선 → 토크 확인 → 물리 결과. 서보는 명령을 스프링처럼 따라가서, 급히 서면 흔들려요.
      </p>
      {k === 'A' && (
        <div className={css.real}>
          <button type="button" className={css.realBtn} disabled={!real.online || busy || !res.A?.ok} onClick={() => void sendReal()}>
            느린 동작(활동 1)을 실물 로봇으로
          </button>
          <small>{real.online ? realMsg || (res.A?.ok ? '흡착 펌프를 달고, 실물 블록을 화면과 같은 자리에 두세요.' : '먼저 [느리게] 로 탑을 쌓아 보세요.') : '로봇에 연결된 콘솔에서 쓸 수 있어요 (지금: 시뮬레이션).'}</small>
        </div>
      )}
    </section>
  );
}
