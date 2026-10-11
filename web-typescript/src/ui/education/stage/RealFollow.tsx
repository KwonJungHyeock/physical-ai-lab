'use client';

/**
 * 실물 연동 on the 교육 screens: the real arm follows the 3D arm (engine/education/follow.ts).
 *
 * LearnView holds the follower (useRealFollow) and shows the bar (FollowBar) — the switch only
 * when the robot is connected, a big stop while it is on. Every LearnStage feeds its arm into
 * FollowContext each frame (hidden stages are paused, so only the one on screen feeds). Where it
 * may follow is decided per screen: a theory lesson always; a site lab says so itself with
 * useFollowGate — only while the fixed program re-runs (다시 가동 · 비교), never where the real
 * setup differs from the screen (the care robot on its AGV, the AI kit).
 */

import { createContext, useContext, useEffect, useMemo, useState } from 'react';

import { Follower, FOLLOW_CAP, type FollowStatus, type FollowTool } from '@/engine/education/follow';
import type { RunLab } from '@/engine/education/runLog';
import type { ChainSegment } from '@/engine/robot/kinematics';
import { jointMax, jointMin } from '@/engine/robot/limits';
import type { PostResult } from '@/engine/simulator/robotLink';
import { EFFECTOR_BY_ID, type EffectorId } from '@/engine/simulator/effectors';
import { createWorld, moveProblem, type WorldState } from '@/engine/simulator/sim';

import type { RealArm } from '../lessons';
import css from './follow.module.css';

export interface FollowLink {
  /** The arm on screen, every frame: its angles, the tool as drawn, and which tool it is. */
  feed(angles: readonly number[], tool: FollowTool, toolId: EffectorId): void;
  /** A site lab says whether the real arm may follow now (null) or why not. */
  allow(key: string, why: string | null): void;
}

export const FollowContext = createContext<FollowLink | null>(null);

/** The tool as drawn: the pump, or the gripper open when its fingers are past half way. */
export function toolOf(toolId: EffectorId, pump: boolean, gapMm?: number): FollowTool {
  const e = EFFECTOR_BY_ID[toolId];
  if (e.kind === 'suction') return { pump };
  if (e.kind === 'grip' && e.gapMm && gapMm !== undefined) return { open: gapMm > (e.gapMm.open + e.gapMm.closed) / 2 };
  return {};
}

const LAB_WAIT = '현장 실습에서는 값을 고친 뒤 [다시 가동 · 비교]에서 고친 프로그램이 돌 때만 실물이 따라 움직여요.';

/** A site lab's say: follows only while the fixed program re-runs, never where the real setup differs. */
export function useFollowGate(lab: RunLab, prob: 1 | 2 | 3, rerun: boolean) {
  const link = useContext(FollowContext);
  const why =
    lab === 'ai'
      ? 'AI 연구소는 실물 키트의 배치가 화면과 달라 실물 연동을 쓰지 않아요.'
      : lab === 'cafe' && prob === 3
        ? '돌봄 문제는 실물에서 팔이 myAGV 위에 있어 세팅이 달라요. 실물 연동을 쓰지 않아요.'
        : rerun
          ? null
          : LAB_WAIT;
  useEffect(() => link?.allow(lab, why), [link, lab, why]);
}

/** What the follower talks to: the real arm and the chain as of the last render, the tool on screen. */
class FollowRig {
  real: RealArm | null = null;
  private chain: readonly ChainSegment[] = [];
  private tool: EffectorId = 'parallel';
  private following = false;
  private readonly worlds = new Map<EffectorId, WorldState>();
  readonly follower = new Follower(
    {
      actual: () => this.real?.now() ?? null,
      target: (a, speed) => this.call((r) => r.target(a, speed)),
      stop: () => this.call((r) => r.stop()),
      pump: (on) => this.call((r) => r.pump(on)),
      grip: (open) => this.call((r) => r.grip(open)),
      check: (from, to) => {
        let w = this.worlds.get(this.tool);
        if (!w) this.worlds.set(this.tool, (w = createWorld(this.tool, false, undefined, 'arm')));
        return moveProblem(this.chain, { ...w, angles: from.slice() }, to, 8);
      },
      get min() {
        return jointMin();
      },
      get max() {
        return jointMax();
      },
    },
    { speed: FOLLOW_CAP },
  );
  /** The arm and the chain as of the last render. */
  update(real: RealArm, chain: readonly ChainSegment[]) {
    this.real = real;
    this.chain = chain;
  }
  /** Follow from now on, or stop the arm. */
  follow(on: boolean) {
    this.following = on;
    if (on) this.follower.start();
    else this.follower.stop();
  }
  /** The arm on screen this frame. */
  feed(angles: readonly number[], tool: FollowTool, toolId: EffectorId) {
    if (!this.following) return;
    this.tool = toolId;
    this.follower.feed(performance.now(), angles, tool);
  }
  private call(f: (r: RealArm) => Promise<PostResult>): Promise<PostResult> {
    return this.real ? f(this.real) : Promise.resolve({ ok: false, error: '로봇이 연결되지 않았어요.' });
  }
}

/**
 * The follower behind LearnView. `place`: what is on screen — 'topic' (a lesson), a site lab's id,
 * or null (the map, the course, the data centre, the final assessment: nothing follows there).
 */
export function useRealFollow(real: RealArm, chain: readonly ChainSegment[], place: string | null) {
  const [rig] = useState(() => new FollowRig());
  const [on, setOn] = useState(false);
  const [gates, setGates] = useState<Record<string, string | null>>({});
  const [status, setStatus] = useState<FollowStatus>(() => rig.follower.status);
  const [error, setError] = useState('');

  const reason = !real.online ? '로봇이 연결되지 않았어요.' : place === null ? '수업이나 현장 실습 화면에서 따라 움직여요.' : place === 'topic' ? null : place in gates ? gates[place] : LAB_WAIT;
  const following = on && reason === null;
  useEffect(() => rig.update(real, chain), [rig, real, chain]);
  useEffect(() => rig.follow(following), [rig, following]);
  // The arm stops when the 교육 screen goes away.
  useEffect(() => () => rig.follower.stop(), [rig]);

  // The status line, a few times a second; a stop with a reason turns the mode off and says why.
  useEffect(() => {
    if (!on) return;
    const id = window.setInterval(() => {
      const s = rig.follower.status;
      setStatus(s);
      if (s.phase === 'stopped') {
        setError(s.message);
        setOn(false);
      }
    }, 250);
    return () => window.clearInterval(id);
  }, [on, rig]);

  const link = useMemo<FollowLink>(
    () => ({
      feed: (angles, tool, toolId) => rig.feed(angles, tool, toolId),
      allow: (key, why) => setGates((g) => (g[key] === why ? g : { ...g, [key]: why })),
    }),
    [rig],
  );

  const toggle = () => {
    setError('');
    setOn((v) => !v);
  };
  const stop = () => {
    setOn(false);
    rig.follower.stop();
    void rig.real?.stop();
  };

  return { link, online: real.online, on, following, reason, status, error, toggle, stop };
}

/** The 실물 연동 switch, its state, and the big stop while it is on. */
export function FollowBar(p: ReturnType<typeof useRealFollow> & { hidden?: boolean; /** Where the 3D view is: left (site labs) or right (a lesson). */ stage?: 'left' | 'right' }) {
  const { on, stop } = p;
  // Esc stops the real arm, as the stop button does.
  useEffect(() => {
    if (!on) return;
    const key = (e: KeyboardEvent) => e.key === 'Escape' && stop();
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [on, stop]);
  if (!p.online || p.hidden) return null;
  const lag = Number.isFinite(p.status.lag) ? `${p.status.lag.toFixed(0)}°` : '—';
  return (
    <div className={css.bar} data-on={p.on || undefined} data-stage={p.stage} role="region" aria-label="실물 연동">
      <button type="button" className={css.toggle} aria-pressed={p.on} onClick={p.toggle}>
        <i aria-hidden /> 실물 연동 {p.on ? '켜짐' : '꺼짐'}
      </button>
      <span className={css.state}>
        {p.error ? (
          <b className={css.err}>{p.error}</b>
        ) : !p.on ? (
          '켜면 화면의 팔을 실물이 따라 움직여요 (속도 50 이하). 팔 둘레를 비워 주세요.'
        ) : p.following ? (
          <>실물이 따라오는 중 · 화면과 차이 {lag}</>
        ) : (
          <>지금은 따라가지 않아요 — {p.reason}</>
        )}
      </span>
      {p.on && (
        <button type="button" className={css.stop} onClick={p.stop}>
          ■ 실물 멈춤 <small>Esc</small>
        </button>
      )}
    </div>
  );
}
