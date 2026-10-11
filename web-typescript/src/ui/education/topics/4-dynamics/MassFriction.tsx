'use client';

/** F1 질량과 마찰: the arm pushes a block sideways the same way three times — A light (20 g), B heavy (200 g), C slippery (friction 0.05). */

import { useEffect, useMemo, useRef, useState } from 'react';

import type { ChainSegment } from '@/engine/robot/kinematics';
import { tcpFor } from '@/engine/simulator/effectors';
import { createPhysics, type BlockPose, type BlockSpec, type PhysicsWorld } from '@/engine/physics/physics';

import css from '../../learn.module.css';
import { Sym } from '../../lesson/Rich';
import { Graph, Readout } from '../../widgets';
import { HOME_POSE, LEARN_COLORS, STEP_COLORS, Verdict, fmt, reachFor, tipOf, type Mm } from '../kit';
import type { TopicProps } from '../types';

type K = 'A' | 'B' | 'C';
const NUM: Record<K, string> = { A: '활동 1', B: '활동 2', C: '활동 3' };

const TCP = tcpFor('pump', false);
/** Fixed physics step: the same result on every screen (and in the headless check). */
const DT = 1 / 60;
/** The push: the tool point runs along y at x = 190 mm, 6 mm above the table, so the tool's side hits the block. */
const LINE_X = 190;
const Y0 = -120;
const Y1 = 80;
const LOW_Z = 6;
const STEP_MM = 2;
const BLOCK_AT: Mm = [LINE_X, -70, 12.5];
/** Commanded speed and how long the arm pushes. */
const SPEED = 200;
const PUSH_S = 1;
/**
 * The most the arm can push with at the tool, N (a servo's torque–speed line: it slows as the load
 * grows and stalls at this force). A rough figure for the J1 servo at this reach.
 */
const ARM_MAX_N = 2;
/** The table's friction in the physics world; a block without its own value averages 0.7 with it. */
const TABLE_MU = 0.8;
const G = 9.81;

const KINDS: Record<K, { massG: number; friction?: number; name: string }> = {
  A: { massG: 20, name: '가벼운 블록 (20 g)' },
  B: { massG: 200, name: '무거운 블록 (200 g)' },
  C: { massG: 20, friction: 0.05, name: '미끄러운 블록 (20 g, 마찰 0.05)' },
};

/** Friction coefficient between the block and the table, as the engine combines them. */
export const muOf = (k: K) => (KINDS[k].friction !== undefined ? Math.min(KINDS[k].friction!, TABLE_MU) : (0.7 + TABLE_MU) / 2);
/** Force needed to keep the block sliding: μ m g, N. */
export const pushForce = (k: K) => muOf(k) * (KINDS[k].massG / 1000) * G;
const specOf = (k: K): BlockSpec => ({ id: 'blk', color: STEP_COLORS[k], at: BLOCK_AT, massG: KINDS[k].massG, friction: KINDS[k].friction });

/** Joint poses along the push line, one every STEP_MM (null when some point is out of reach). */
export function sweepPath(chain: readonly ChainSegment[]): number[][] | null {
  const out: number[][] = [];
  let seed: readonly number[] = HOME_POSE;
  for (let y = Y0; y <= Y1 + 1e-9; y += STEP_MM) {
    const q = reachFor(chain, [LINE_X, y, LOW_Z], seed, TCP);
    if (!q) return null;
    out.push(q);
    seed = q;
  }
  return out;
}

const poseAt = (path: number[][], s: number) => {
  const f = Math.max(0, Math.min(path.length - 1, s / STEP_MM));
  const i = Math.min(path.length - 2, Math.floor(f));
  const u = f - i;
  return path[i].map((a, j) => a + (path[i + 1][j] - a) * u);
};

export interface PushResult {
  /** Block centre moved (horizontal), mm. */
  movedMm: number;
  /** How long the block kept moving after the arm stopped, s. */
  stopS: number;
  forceN: number;
  /** Arm speed while it pushed, mm/s. */
  armMmS: number;
  /** Block displacement every DT from the start of the push, mm. */
  trace: number[];
  final: BlockPose;
}

/**
 * One try, one physics step per `yield` (the caller then steps the world to `ctl.cmd`): settle, push for
 * PUSH_S at SPEED (slowed by the load while the tool touches the block), stop, wait until the block rests.
 */
export function* pushTry(w: PhysicsWorld, chain: readonly ChainSegment[], path: number[][], k: K, ctl: { cmd: number[] }): Generator<void, PushResult, void> {
  w.reset([specOf(k)], [], path[0]);
  ctl.cmd = path[0];
  for (let i = 0; i < 30; i += 1) yield;
  const start = w.blocks()[0].at.clone();
  const forceN = pushForce(k);
  const slow = Math.max(0, 1 - forceN / ARM_MAX_N);
  const L = (path.length - 1) * STEP_MM;
  const trace: number[] = [];
  const moved = () => {
    const p = w.blocks()[0].at;
    return Math.hypot(p.x - start.x, p.y - start.y);
  };
  let s = 0;
  let pushS = 0;
  let pushMm = 0;
  for (let n = 0; n < Math.round(PUSH_S / DT); n += 1) {
    const tip = tipOf(chain, ctl.cmd, TCP);
    const b = w.blocks()[0].at;
    const touching = Math.hypot(tip[0] - b.x, tip[1] - b.y) < 30 && b.y > tip[1];
    const ds = Math.min(L - s, SPEED * DT * (touching ? slow : 1));
    s += ds;
    if (touching) {
      pushS += DT;
      pushMm += ds;
    }
    ctl.cmd = poseAt(path, s);
    yield;
    trace.push(moved());
  }
  // The arm has stopped; the block may slide on.
  let prev = w.blocks()[0].at.clone();
  let lastMove = 0;
  let quiet = 0;
  for (let n = 1; n <= 240; n += 1) {
    yield;
    const p = w.blocks()[0].at;
    trace.push(moved());
    const v = p.distanceTo(prev) / DT;
    prev = p.clone();
    if (v > 2) {
      lastMove = n * DT;
      quiet = 0;
    } else if ((quiet += DT) > 0.3) break;
  }
  const b = w.blocks()[0];
  return { movedMm: moved(), stopS: lastMove, forceN, armMmS: pushS > 0 ? pushMm / pushS : SPEED, trace, final: { ...b, at: b.at.clone(), q: b.q.clone() } };
}

const feel = (n: number) => (n >= 1 ? '큼' : n >= 0.05 ? '작음' : '아주 작음');

export default function F1MassFriction({ chain, show, step, record }: TopicProps) {
  const k: K = step === 'cmp' ? 'C' : step;
  const path = useMemo(() => sweepPath(chain), [chain]);
  const [view, setView] = useState<{ q: number[]; blocks: BlockPose[] }>({ q: [0, 0, 0, 0, 0, 0], blocks: [] });
  const [res, setRes] = useState<Partial<Record<K, PushResult>>>({});
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const sim = useRef<{
    w: PhysicsWorld | null;
    prog: Generator<void, PushResult, void> | null;
    cmd: number[];
    done: ((r: PushResult) => void) | null;
    reset: K | null;
  }>({ w: null, prog: null, cmd: [0, 0, 0, 0, 0, 0], done: null, reset: 'A' });

  // Each step starts with its own block, the arm at the start of the line.
  useEffect(() => {
    sim.current.reset = step === 'cmp' ? null : step;
  }, [step]);

  // The physics world, stepped at a fixed rate while the topic is open.
  useEffect(() => {
    if (!path) return;
    let alive = true;
    let raf = 0;
    const s = sim.current;
    void createPhysics(chain, TCP, [specOf('A')], [], path[0]).then((w) => {
      if (!alive) {
        w.dispose();
        return;
      }
      s.w = w;
      s.cmd = path[0];
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
            w.reset([specOf(s.reset)], [], path[0]);
            s.cmd = path[0];
            s.reset = null;
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
          w.stepTo(s.cmd, DT);
        }
        setView({ q: s.cmd, blocks: w.blocks() });
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
  }, [chain, path]);

  const push = () => {
    const s = sim.current;
    if (!s.w || !path || step === 'cmp') return;
    const key = k;
    s.prog = pushTry(s.w, chain, path, key, s);
    s.done = (r) => {
      setBusy(false);
      setRes((old) => ({ ...old, [key]: r }));
      record(key, { '밀린 거리': `${fmt(r.movedMm, 0)} mm`, '팔이 멈춘 뒤 미끄러진 시간': `${fmt(r.stopS, 2)} s`, '미는 데 드는 힘': `${fmt(r.forceN, 2)} N (${feel(r.forceN)})` });
    };
    setBusy(true);
  };

  useEffect(() => {
    const start: Mm = [BLOCK_AT[0], BLOCK_AT[1], 0.5];
    const line = { key: 'line', points: [[LINE_X, Y0, 0.5], [LINE_X, Y1, 0.5]] as Mm[], color: LEARN_COLORS.accent, dashed: true };
    if (step === 'cmp') {
      const keys = (['A', 'B', 'C'] as K[]).filter((key) => res[key]);
      show({
        angles: view.q,
        tool: 'pump',
        frames: 'none',
        blocks: keys.map((key) => ({ ...res[key]!.final, id: `${key}-blk` })),
        lines: [line],
        spots: [
          { key: 'start', mm: start, color: '#98a2b3', label: '처음 자리' },
          ...keys.map((key) => ({ key, mm: [res[key]!.final.at.x, res[key]!.final.at.y, 0.5] as Mm, color: STEP_COLORS[key], label: `${key} ${fmt(res[key]!.movedMm, 0)} mm` })),
        ],
      });
      return;
    }
    const b = view.blocks[0];
    const moved = b ? Math.hypot(b.at.x - BLOCK_AT[0], b.at.y - BLOCK_AT[1]) : 0;
    show({
      angles: view.q,
      tool: 'pump',
      frames: 'none',
      blocks: view.blocks,
      lines: [line],
      spots: [{ key: 'start', mm: start, color: '#98a2b3', label: '처음 자리' }],
      labels: b && moved > 3 ? [{ key: 'd', mm: [b.at.x, b.at.y, 48], text: `${fmt(moved, 0)} mm`, color: STEP_COLORS[k] }] : [],
    });
  }, [view, step, k, res, show]);

  const graphX = useMemo(() => {
    const n = Math.max(1, ...Object.values(res).map((r) => r.trace.length));
    return Array.from({ length: n }, (_, i) => (i + 1) * DT);
  }, [res]);

  if (!path) return <p className={css.warnNote}>미는 길이 팔이 닿는 범위 밖이에요.</p>;

  if (step === 'cmp') {
    const keys = (['A', 'B', 'C'] as K[]).filter((key) => res[key]);
    return (
      <section className={css.card}>
        <h3>세 블록이 멈춘 자리</h3>
        {keys.length > 0 ? (
          <Graph
            title="밀린 거리 (팔은 1 초 동안 밀고 멈춤)"
            x={graphX}
            series={keys.map((key) => ({ label: `${NUM[key]} ${KINDS[key].name}`, color: STEP_COLORS[key], values: res[key]!.trace }))}
            unit="mm"
            cursor={PUSH_S}
            height={110}
          />
        ) : (
          <p className={css.note}>활동 1 · 2 · 3 에서 밀어 보면 여기에 겹쳐 보여요.</p>
        )}
        <p className={css.note}>책상 위 색 점이 블록이 멈춘 자리예요. 회색 점 = 처음 자리. 세로선 = 팔이 멈춘 때.</p>
      </section>
    );
  }

  const r = res[k];
  const F = pushForce(k);
  return (
    <section className={css.card}>
      <h3>{KINDS[k].name}</h3>
      <div className={css.btnRow}>
        <button type="button" className={css.primary} disabled={busy || !ready} onClick={push}>
          밀기 ({SPEED} mm/s · {PUSH_S} 초)
        </button>
      </div>
      <div className={css.row3}>
        <Readout label="밀린 거리" value={r ? fmt(r.movedMm, 0) : '—'} unit="mm" />
        <Readout label="팔이 멈춘 뒤 미끄러진 시간" value={r ? fmt(r.stopS, 2) : '—'} unit="s" />
        <Readout label="미는 데 드는 힘 μmg" value={fmt(F, 2)} unit="N" tone={F >= 1 ? 'warn' : 'ok'} />
      </div>
      {r && (
        <>
          <Graph title="밀린 거리" x={r.trace.map((_, i) => (i + 1) * DT)} series={[{ label: KINDS[k].name, color: STEP_COLORS[k], values: r.trace }]} unit="mm" cursor={PUSH_S} height={90} />
          <Verdict tone={k === 'B' ? 'warn' : 'ok'}>
            {k === 'A'
              ? `밀 때 팔 속도 ${fmt(r.armMmS, 0)} mm/s 예요. 가볍게 밀려 ${fmt(r.movedMm, 0)} mm 갔어요.`
              : k === 'B'
                ? `힘이 ${fmt(F / pushForce('A'), 0)} 배 들어 팔이 ${fmt(r.armMmS, 0)} mm/s 로 느려졌어요. 팔이 서자 블록도 바로 섰어요.`
                : `마찰이 작아 팔이 멈춘 뒤에도 ${fmt(r.stopS, 2)} 초 더 미끄러졌어요.`}
          </Verdict>
        </>
      )}
      <p className={css.note}>
        블록을 계속 밀려면 마찰을 이길 힘 = 마찰 계수 <Sym s="μ" name={false} /> × 질량 <Sym s="m" name={false} /> × 중력가속도 <Sym s="g" name={false} /> 가 필요해요 (이 블록 <Sym s="μ" name={false} /> = {fmt(muOf(k), 2)}). 팔의 서보는 손끝에서 약 {ARM_MAX_N} N 까지 밀 수 있어서, 힘이 클수록 느려져요.
      </p>
    </section>
  );
}
