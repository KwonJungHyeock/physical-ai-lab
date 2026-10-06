'use client';

/** E2 경로 계획: 벽 너머로 — A 그냥 직선(관절 보간, 벽에서 멈춤), B 책상을 찍어 경유점으로, C RRT-Connect 로 자동 탐색(+ 다듬기). */

import { useEffect, useMemo, useRef, useState } from 'react';

import type { ChainSegment } from '@/engine/robot/kinematics';
import { moveContact, poseContact, type Box, type Contact } from '@/engine/physics/collide';
import { mulberry32, pathLengthDeg, quinticWithin, rrtConnect, type PlanResult } from '@/engine/physics/planning';
import { STEP_NAME } from '@/engine/education/catalog';

import type { LearnScene } from '../../stage/LearnStage';
import css from '../../learn.module.css';
import { Readout } from '../../widgets';
import { LEARN_COLORS, STEP_COLORS, Verdict, dist, fmt, reachFor, tipOf, useAnimator, usePose, type Mm, TCP } from '../kit';
import type { TopicProps } from '../types';

type K = 'A' | 'B' | 'C';

/** Tool held down beside a wall, to the same spot on its other side. */
const START = [53.4, -58.1, -103.6, 71.7, 0, -71.8];
const GOAL = [-17, -58.1, -103.8, 71.8, 0, -71.8];
const WALL: Box = { min: [110, -15, 0], max: [260, 15, 170], name: '벽' };
const BOXES = [WALL];
/** Via points sit this high above the clicked spot (the wall is 170 mm). */
const VIA_Z = 220;
const MAX_VIAS = 3;
/** Speed along a path, as on U5: largest joint change 90°/s, 240°/s². */
const V_MAX = 90;
const A_MAX = 240;
const TREE_S = 1.6;

interface Via {
  mm: Mm;
  q: number[];
}

interface Run {
  ok: boolean;
  /** Tool track actually travelled. */
  track: Mm[];
  lengthMm: number;
  plan: string;
  moveS: number;
}

/** Pose at `s` degrees of travel along a joint path. */
function along(path: number[][], s: number): number[] {
  let left = s;
  for (let i = 1; i < path.length; i += 1) {
    const seg = Math.max(...path[i].map((v, k) => Math.abs(v - path[i - 1][k])));
    if (left <= seg || i === path.length - 1) {
      const t = seg > 0 ? Math.min(1, left / seg) : 1;
      return path[i - 1].map((v, k) => v + (path[i][k] - v) * t);
    }
    left -= seg;
  }
  return path[path.length - 1].slice();
}

/** The tool's track along a joint path (a point every 2° of joint travel). */
function trackOf(chain: readonly ChainSegment[], path: number[][]): Mm[] {
  const pts: Mm[] = [tipOf(chain, path[0])];
  for (let i = 1; i < path.length; i += 1) {
    const n = Math.max(2, Math.ceil(Math.max(...path[i].map((v, k) => Math.abs(v - path[i - 1][k]))) / 2));
    for (let k = 1; k <= n; k += 1) pts.push(tipOf(chain, path[i - 1].map((v, j) => v + ((path[i][j] - v) * k) / n)));
  }
  return pts;
}

const lengthOf = (pts: Mm[]) => pts.reduce((s, p, i) => (i ? s + dist(pts[i - 1], p) : 0), 0);

/** The part of a joint path that is free: cut at the first contact (checked every 2°). */
function freePart(chain: readonly ChainSegment[], path: number[][]): { path: number[][]; contact: Contact | null } {
  const out = [path[0]];
  for (let i = 1; i < path.length; i += 1) {
    const hit = moveContact(chain, path[i - 1], path[i], BOXES, TCP, 2);
    if (hit) {
      const n = Math.max(1, Math.ceil(Math.max(...path[i].map((v, k) => Math.abs(v - path[i - 1][k]))) / 2));
      const t = Math.max(0, hit.t - 1 / n);
      out.push(path[i - 1].map((v, k) => v + (path[i][k] - v) * t));
      return { path: out, contact: hit.contact };
    }
    out.push(path[i]);
  }
  return { path: out, contact: null };
}

export default function E2Planning({ chain, show, onPick, real, step, record }: TopicProps) {
  const k: K = step === 'cmp' ? 'C' : step;
  const [q, setQ] = usePose(START);
  const [trail, setTrail] = useState<Mm[]>([]);
  const [contact, setContact] = useState<Contact | null>(null);
  const [vias, setVias] = useState<Via[]>([]);
  const [viaMsg, setViaMsg] = useState('');
  const [plan, setPlan] = useState<{ r: PlanResult; ms: number; seed: number } | null>(null);
  const [grown, setGrown] = useState(1);
  const [runs, setRuns] = useState<Partial<Record<K, Run>>>({});
  const [lastRun, setLastRun] = useState<K | null>(null);
  const seed = useRef(7);
  const firstClick = useRef(0);
  const anim = useAnimator();
  const { stop } = anim;

  useEffect(() => {
    stop();
  }, [step, stop]);

  // B: clicks on the table add via points above them.
  useEffect(() => {
    if (step !== 'B') {
      onPick(null);
      return;
    }
    onPick((mm) => {
      if (Math.hypot(mm[0], mm[1]) < 90) return; // the robot's base
      if (vias.length >= MAX_VIAS) {
        setViaMsg(`경유점은 ${MAX_VIAS} 개까지예요. 지우고 다시 찍어 보세요.`);
        return;
      }
      const at: Mm = [mm[0], mm[1], VIA_Z];
      const a = reachFor(chain, at, vias.length ? vias[vias.length - 1].q : START);
      if (!a) {
        setViaMsg('거기 위로는 손이 닿지 않아요. 로봇에 더 가까운 곳을 찍어 보세요.');
        return;
      }
      if (!vias.length) firstClick.current = Date.now();
      setViaMsg('');
      setVias([...vias, { mm: at, q: a }]);
    });
    return () => onPick(null);
  }, [step, onPick, chain, vias]);

  /** Move along a joint path, stopping where it would meet the wall. */
  const follow = (key: K, path: number[][], planText: string) => {
    const { path: free, contact: hit } = freePart(chain, path);
    const len = pathLengthDeg(free);
    const prof = quinticWithin(Math.max(len, 1e-3), V_MAX, A_MAX);
    const track = trackOf(chain, free);
    setContact(null);
    setLastRun(key);
    const pts: Mm[] = [];
    anim.play(
      prof.durationS,
      (t) => {
        const qq = along(free, prof.sample(t).p);
        setQ(qq);
        pts.push(tipOf(chain, qq));
        setTrail(pts.slice());
      },
      () => {
        setContact(hit);
        const run: Run = { ok: !hit, track, lengthMm: lengthOf(track), plan: planText, moveS: prof.durationS };
        setRuns((rs) => ({ ...rs, [key]: run }));
        record(key, {
          성공: hit ? `X (J${hit.joint} 가 벽에 닿음)` : 'O',
          '손끝 이동 거리': `${fmt(run.lengthMm, 0)} mm`,
          '계획 시간': planText,
          '이동 시간': `${fmt(prof.durationS, 1)} s`,
        });
      },
    );
  };

  const reset = () => {
    setQ(START.slice());
    setTrail([]);
    setContact(null);
  };

  const straight = () => {
    reset();
    follow('A', [START, GOAL], '0 s (계획 없음)');
  };

  const viaGo = () => {
    reset();
    const s = firstClick.current ? (Date.now() - firstClick.current) / 1000 : 0;
    follow('B', [START, ...vias.map((v) => v.q), GOAL], `${fmt(s, 0)} s (찍기)`);
  };

  const search = (again: boolean) => {
    reset();
    if (again) seed.current += 1;
    const t0 = performance.now();
    const r = rrtConnect(START, GOAL, (qq) => !poseContact(chain, qq, BOXES, TCP), { rng: mulberry32(seed.current), checkDeg: 2 });
    const ms = performance.now() - t0;
    setPlan({ r, ms, seed: seed.current });
    setGrown(0);
    anim.play(
      TREE_S,
      (t) => setGrown(t / TREE_S),
      () => {
        setGrown(1);
        if (r.ok) follow('C', r.path, `${fmt(ms, 0)} ms`);
      },
    );
  };

  const runReal = async () => {
    const path = plan?.r.ok ? plan.r.path : null;
    if (!path) return;
    await real.run(path.map((angles, i) => ({ type: 'angles' as const, angles, speed: i === 0 ? 25 : 30, line: i + 1, via: i > 0 && i < path.length - 1 })));
  };

  /* Scene */
  const tips = useMemo(() => ({ s: tipOf(chain, START), g: tipOf(chain, GOAL) }), [chain]);
  const viaLine = useMemo(() => (vias.length ? trackOf(chain, [START, ...vias.map((v) => v.q), GOAL]) : []), [vias, chain]);
  const trees = useMemo(() => {
    if (!plan) return null;
    return plan.r.trees.map((tree) => {
      const pts = tree.map((n) => tipOf(chain, n.q));
      return tree.map((n, i) => (n.parent >= 0 ? [pts[n.parent], pts[i]] : null));
    });
  }, [plan, chain]);
  const planLines = useMemo(() => (plan?.r.ok ? { raw: trackOf(chain, plan.r.raw), path: trackOf(chain, plan.r.path) } : null), [plan, chain]);

  useEffect(() => {
    const lines: NonNullable<LearnScene['lines']> = [];
    const labels: NonNullable<LearnScene['labels']> = [
      { key: 's', mm: [tips.s[0], tips.s[1], tips.s[2] + 40], text: '출발', color: LEARN_COLORS.ok },
      { key: 'g', mm: [tips.g[0], tips.g[1], tips.g[2] + 40], text: '도착', color: LEARN_COLORS.accent },
    ];
    let spots: LearnScene['spots'] = [];
    if (step === 'cmp') {
      (['A', 'B', 'C'] as const).forEach((key) => {
        const r = runs[key];
        if (r) lines.push({ key, points: r.track, color: STEP_COLORS[key], width: 3.5 });
      });
    } else {
      if (k === 'B') {
        if (viaLine.length) lines.push({ key: 'plan', points: viaLine, color: STEP_COLORS.B, width: 1.5, dashed: true });
        spots = vias.map((v, i) => ({ key: `v${i}`, mm: [v.mm[0], v.mm[1], 0] as Mm, color: STEP_COLORS.B, label: `경유 ${i + 1}` }));
        vias.forEach((v, i) => {
          lines.push({ key: `drop${i}`, points: [[v.mm[0], v.mm[1], 0], v.mm], color: STEP_COLORS.B, width: 1, dashed: true });
          labels.push({ key: `vl${i}`, mm: [v.mm[0], v.mm[1], v.mm[2] + 18], text: `${i + 1}`, color: STEP_COLORS.B });
        });
      }
      if (k === 'C' && trees) {
        trees.forEach((tree, ti) => {
          const n = Math.ceil(tree.length * grown);
          const pts = tree.slice(0, n).flatMap((e) => e ?? []);
          lines.push({ key: `tree${ti}`, points: pts, color: ti === 0 ? '#7f93b8' : '#c49a6c', width: 1.5, segments: true });
        });
        if (planLines && grown >= 1) {
          lines.push({ key: 'raw', points: planLines.raw, color: LEARN_COLORS.path, width: 1.5, dashed: true });
          lines.push({ key: 'path', points: planLines.path, color: LEARN_COLORS.path, width: 3.5 });
        }
      }
      if (trail.length > 1 && lastRun === k) lines.push({ key: 'trail', points: trail, color: contact ? LEARN_COLORS.bad : STEP_COLORS[k], width: 3 });
    }
    show({
      angles: step === 'cmp' ? START : lastRun === k || anim.running ? q : START,
      frames: 'none',
      boxes: BOXES.map((b) => ({ ...b, color: '#f0a06d' })),
      ghosts: [
        { key: 'start', angles: START, color: LEARN_COLORS.ok, opacity: 0.16 },
        { key: 'goal', angles: GOAL, color: LEARN_COLORS.accent, opacity: 0.22 },
      ],
      lines,
      spots,
      labels,
      contact: contact && lastRun === k && step !== 'cmp' ? { mm: contact.at, text: `J${contact.joint} 가 벽에 부딪힘 — 멈춤` } : null,
    });
  }, [step, k, q, trail, contact, lastRun, vias, viaLine, trees, grown, planLines, runs, tips, anim.running, show]);

  const run = runs[k];
  const done = run && lastRun === k && !anim.running;

  if (step === 'cmp')
    return (
      <section className={css.card}>
        <h3>세 길 겹쳐 보기</h3>
        <div className={css.row3}>
          {(['A', 'B', 'C'] as const).map((key) => {
            const r = runs[key];
            return <Readout key={key} label={`${STEP_NAME[key]} ${key === 'A' ? '직선' : key === 'B' ? '경유점' : 'RRT'}`} value={r ? (r.ok ? `${fmt(r.lengthMm, 0)} mm` : '실패') : '–'} tone={r ? (r.ok ? 'ok' : 'bad') : undefined} />;
          })}
        </div>
        <p className={css.note}>손끝이 지나간 길: 주황 = 그냥 직선(벽에서 멈춤), 하늘색 = 경유점, 초록 = RRT(다듬은 뒤).</p>
      </section>
    );

  return (
    <section className={css.card}>
      <h3>{k === 'A' ? '그냥 직선 (관절 보간)' : k === 'B' ? '경유점을 직접 찍기' : '자동 탐색 — RRT-Connect'}</h3>
      {k === 'B' && (
        <p className={css.live}>
          책상을 클릭하면 그 위 {VIA_Z} mm 에 경유점이 생겨요 (최대 {MAX_VIAS} 개, 지금 {vias.length} 개). 벽 높이는 170 mm.
        </p>
      )}
      <div className={css.btnRow}>
        {k === 'A' && (
          <button type="button" className={css.primary} disabled={anim.running} onClick={straight}>
            그냥 직선
          </button>
        )}
        {k === 'B' && (
          <>
            <button type="button" className={css.primary} disabled={anim.running || !vias.length} onClick={viaGo}>
              경유점으로 가기
            </button>
            <button
              type="button"
              disabled={anim.running || !vias.length}
              onClick={() => {
                setVias([]);
                setViaMsg('');
                firstClick.current = 0;
                reset();
              }}
            >
              경유점 지우기
            </button>
          </>
        )}
        {k === 'C' && (
          <>
            <button type="button" className={css.primary} disabled={anim.running} onClick={() => search(false)}>
              RRT 로 길 찾기
            </button>
            <button type="button" disabled={anim.running || !plan} onClick={() => search(true)}>
              다시 찾기
            </button>
          </>
        )}
      </div>
      {viaMsg && k === 'B' && <p className={css.warnNote}>{viaMsg}</p>}
      {k === 'C' && plan && (
        <div className={css.row3}>
          <Readout label={`나무 가지 (출발 / 도착) · 난수 ${plan.seed}`} value={`${plan.r.trees[0].length} / ${plan.r.trees[1].length}`} />
          <Readout label="충돌 검사한 자세" value={String(plan.r.checks)} unit="개" />
          <Readout label="길이 (관절, 다듬기 전 → 후)" value={plan.r.ok ? `${fmt(pathLengthDeg(plan.r.raw), 0)} → ${fmt(pathLengthDeg(plan.r.path), 0)}` : '–'} unit="°" />
        </div>
      )}
      <div className={css.row3}>
        <Readout label="성공" value={done ? (run.ok ? '성공' : '실패') : '–'} tone={done ? (run.ok ? 'ok' : 'bad') : undefined} />
        <Readout label="손끝 이동 거리" value={done ? fmt(run.lengthMm, 0) : '–'} unit="mm" />
        <Readout label="계획 · 이동 시간" value={done ? `${run.plan} · ${fmt(run.moveS, 1)} s` : '–'} />
      </div>
      {done && !run.ok && <Verdict tone="bad">{k === 'A' ? '관절을 똑바로 돌리면 손이 벽을 지나가요 — 부딪혀 멈췄어요.' : '경유점 사이 어딘가에서 벽에 닿았어요. 벽 바로 위를 지나도록 다시 찍어 보세요.'}</Verdict>}
      {done && run.ok && <Verdict tone="ok">{k === 'B' ? '벽을 넘어 도착했어요. 찍는 데 걸린 시간도 계획 시간이에요.' : '벽을 피해 도착했어요.'}</Verdict>}
      {k === 'C' && (
        <>
          <p className={css.note}>회색·갈색 선 = 출발·도착에서 자란 두 나무(가지 끝의 손끝 위치), 주황 점선 = 찾은 길, 굵은 주황 = 다듬은 길. [다시 찾기] 는 다른 난수로 다시 뻗어요.</p>
          <div className={css.real}>
            <button type="button" className={css.realBtn} disabled={!real.online || !plan?.r.ok || anim.running} onClick={() => void runReal()}>
              찾은 길을 실물 로봇으로
            </button>
            <small>{real.online ? '벽은 화면에만 있어요 — 실물 주변을 비워 두세요.' : '로봇에 연결된 콘솔에서 쓸 수 있어요 (지금: 시뮬레이션).'}</small>
          </div>
        </>
      )}
    </section>
  );
}
