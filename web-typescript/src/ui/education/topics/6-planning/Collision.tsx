'use client';

/**
 * 6-1 충돌 검사: the same move — a 71.6° turn of J1 with the tool held down,
 * across a 6 mm wall — checked three ways. A: only the start and end poses.
 * B: every 30°. C: every 5°. A check that says "free" lets the arm move, and it
 * meets the wall the check skipped.
 */

import { useEffect, useMemo, useState } from 'react';

import { armCapsules, poseContact, type Box, type Capsule, type Contact } from '@/engine/physics/collide';
import { STEP_NAME } from '@/engine/education/catalog';

import type { LearnScene } from '../../stage/LearnStage';
import css from '../../learn.module.css';
import { Readout } from '../../widgets';
import { LEARN_COLORS, STEP_COLORS, Verdict, dots, fmt, lerpQ, tipOf, useAnimator, usePose, type Mm, TCP } from '../kit';
import type { TopicProps } from '../types';

type K = 'A' | 'B' | 'C';

const START = [52.8, -51.9, -95.7, 57.6, 0, -73];
const GOAL = [-18.8, -51.9, -95.7, 57.6, 0, -73];
const WALL: Box = { min: [150, -3, 0], max: [290, 3, 100], name: '벽' };
/** The check interval of each try, degrees of J1 (0 = only the start and end poses). */
const GAP: Record<K, number> = { A: 0, B: 30, C: 5 };
const GAP_NAME: Record<K, string> = { A: '멈춘 자세만 검사', B: '검사 간격 30°', C: '검사 간격 5°' };
const gapText = (k: K) => (GAP[k] === 0 ? '출발·도착만' : `${GAP[k]}°`);
const CAPSULE_COLOR = '#2f7de1';

/* -------------------------------------------------------------------------- */
/* Geometry                                                                   */
/* -------------------------------------------------------------------------- */

const sub = (a: readonly number[], b: readonly number[]): Mm => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const norm = (a: readonly number[]) => Math.hypot(a[0], a[1], a[2]);
const crossV = (a: readonly number[], b: readonly number[]): Mm => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a: readonly number[]): Mm => {
  const n = norm(a) || 1;
  return [a[0] / n, a[1] / n, a[2] / n];
};
const at = (c: readonly number[], u: readonly number[], v: readonly number[], r: number, ang: number): Mm => [
  c[0] + r * (Math.cos(ang) * u[0] + Math.sin(ang) * v[0]),
  c[1] + r * (Math.cos(ang) * u[1] + Math.sin(ang) * v[1]),
  c[2] + r * (Math.cos(ang) * u[2] + Math.sin(ang) * v[2]),
];

/** A wire cage for each capsule (rings at both ends, four side lines, the rounded ends), as segment pairs. */
function capsuleWire(caps: readonly Capsule[], grow = 0): Mm[] {
  const out: Mm[] = [];
  const N = 16;
  const circle = (c: readonly number[], u: Mm, v: Mm, r: number, from = 0, to = 2 * Math.PI) => {
    for (let i = 0; i < N; i += 1) out.push(at(c, u, v, r, from + ((to - from) * i) / N), at(c, u, v, r, from + ((to - from) * (i + 1)) / N));
  };
  for (const c of caps) {
    const r = c.r + grow;
    const axis = sub(c.b, c.a);
    const len = norm(axis);
    const w: Mm = len > 1 ? unit(axis) : [0, 0, 1];
    const p1 = unit(crossV(w, Math.abs(w[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0]));
    const p2 = crossV(w, p1);
    if (len <= 1) {
      // A ball (the flange end): three circles.
      circle(c.a, p1, p2, r);
      circle(c.a, w, p1, r);
      circle(c.a, w, p2, r);
      continue;
    }
    circle(c.a, p1, p2, r);
    circle(c.b, p1, p2, r);
    for (const p of [p1, p2]) {
      out.push([c.a[0] + p[0] * r, c.a[1] + p[1] * r, c.a[2] + p[2] * r], [c.b[0] + p[0] * r, c.b[1] + p[1] * r, c.b[2] + p[2] * r]);
      out.push([c.a[0] - p[0] * r, c.a[1] - p[1] * r, c.a[2] - p[2] * r], [c.b[0] - p[0] * r, c.b[1] - p[1] * r, c.b[2] - p[2] * r]);
      // Half circles closing each end.
      circle(c.b, p, w, r, -Math.PI / 2, Math.PI / 2);
      circle(c.a, p, w, r, Math.PI / 2, (3 * Math.PI) / 2);
    }
  }
  return out;
}

interface Run {
  poses: number[][];
  hits: (Contact | null)[];
  /** For a run whose check said "free": where the real move met the wall. */
  real: Contact | null;
}

export default function E1Collision({ chain, show, step, record }: TopicProps) {
  const k: K = step === 'cmp' ? 'C' : step;
  const [q, setQ] = usePose(START);
  const [runs, setRuns] = useState<Partial<Record<K, Run>>>({});
  const [shownN, setShownN] = useState(0);
  const anim = useAnimator();
  const { stop } = anim;

  // Each try starts from the start pose; leaving a step stops a check or move still playing.
  useEffect(() => {
    stop();
    // A fresh start for the try that was opened.
    setQ(START.slice());
  }, [step, stop, setQ]);

  const caps = useMemo(() => armCapsules(chain, q, TCP), [chain, q]);

  const checkMove = () => {
    const span = Math.max(...START.map((v, i) => Math.abs(GOAL[i] - v)));
    const n = GAP[k] === 0 ? 1 : Math.ceil(span / GAP[k]);
    const poses = Array.from({ length: n + 1 }, (_, i) => lerpQ(START, GOAL, i / n));
    const hits = poses.map((p) => poseContact(chain, p, [WALL], TCP));
    const found = hits.filter(Boolean) as Contact[];
    const run: Run = { poses, hits, real: null };
    setQ(START.slice());
    setRuns((r) => ({ ...r, [k]: run }));
    setShownN(0);
    const each = poses.length > 6 ? 0.12 : 0.4;
    anim.play(
      poses.length * each,
      (t) => setShownN(Math.min(poses.length, Math.floor(t / each) + 1)),
      () => {
        if (found.length) {
          record(k, { '검사 간격': gapText(k), '검사 횟수': `${poses.length} 번`, '찾은 충돌': `J${found[0].joint} ↔ 벽 (${found.length} 자세)`, 판정: '맞음 (움직이지 않음)' });
          return;
        }
        // "No collision" — so the arm moves, and meets the wall it skipped.
        let stopT = 1;
        let real: Contact | null = null;
        for (let i = 1; i <= 400; i += 1) {
          const c = poseContact(chain, lerpQ(START, GOAL, i / 400), [WALL], TCP);
          if (c) {
            stopT = (i - 1) / 400;
            real = c;
            break;
          }
        }
        const T = 2.2;
        anim.play(
          T * stopT,
          (t) => setQ(lerpQ(START, GOAL, Math.min(stopT, t / T))),
          () => {
            setRuns((r) => ({ ...r, [k]: { ...run, real } }));
            record(k, { '검사 간격': gapText(k), '검사 횟수': `${poses.length} 번`, '찾은 충돌': '없음', 판정: real ? `놓침 (실제로는 J${real.joint} 가 벽에 닿음)` : '맞음' });
          },
        );
      },
    );
  };

  /* Scene */
  const path = useMemo(() => Array.from({ length: 61 }, (_, i) => tipOf(chain, lerpQ(START, GOAL, i / 60))), [chain]);
  const tips = useMemo(() => {
    const out: Partial<Record<K, Mm[]>> = {};
    for (const key of ['A', 'B', 'C'] as const) {
      const r = runs[key];
      if (r) out[key] = r.poses.map((p) => tipOf(chain, p));
    }
    return out;
  }, [runs, chain]);
  const playing = anim.running;

  const scene = useMemo<LearnScene>(() => {
    const lines: NonNullable<LearnScene['lines']> = [
      { key: 'path', points: path, color: '#8792a6', width: 1.5, dashed: true },
      { key: 'caps', points: capsuleWire(caps), color: CAPSULE_COLOR, width: 1.2, segments: true },
    ];
    const ghosts: NonNullable<LearnScene['ghosts']> = [{ key: 'goal', angles: GOAL, color: LEARN_COLORS.accent, opacity: 0.15 }];
    let contact: LearnScene['contact'] = null;
    const keys: K[] = step === 'cmp' ? ['A', 'B', 'C'] : [k];
    for (const key of keys) {
      const r = runs[key];
      const tp = tips[key];
      if (!r || !tp) continue;
      const shown = step === 'cmp' || !playing ? r.poses.length : shownN;
      const free = tp.slice(0, shown).filter((_, i) => !r.hits[i]);
      const bad = tp.slice(0, shown).filter((_, i) => r.hits[i]);
      const size = key === 'C' ? 4.5 : 7;
      lines.push({ key: `free${key}`, points: dots(free, size), color: step === 'cmp' ? STEP_COLORS[key] : LEARN_COLORS.ok, width: 3, segments: true });
      lines.push({ key: `bad${key}`, points: dots(bad, 7), color: LEARN_COLORS.bad, width: 3.5, segments: true });
      if (key !== 'C') r.poses.slice(0, shown).forEach((p, i) => ghosts.push({ key: `c${key}-${i}`, angles: p, color: STEP_COLORS[key], opacity: 0.2 }));
      r.poses.slice(0, shown).forEach((p, i) => {
        if (r.hits[i]) ghosts.push({ key: `h${key}-${i}`, angles: p, color: LEARN_COLORS.bad, opacity: 0.3 });
      });
      if (step !== 'cmp') {
        const first = r.hits.slice(0, shown).find(Boolean);
        if (first) contact = { mm: first.at, text: `검사에서 찾음: J${first.joint} ↔ 벽` };
        else if (r.real) contact = { mm: r.real.at, text: `실제로는 J${r.real.joint} 가 벽에 닿음` };
      }
    }
    const a = tipOf(chain, START);
    const b = tipOf(chain, GOAL);
    return {
      angles: q,
      frames: 'none',
      boxes: [{ ...WALL, color: '#f0a06d' }],
      ghosts,
      lines,
      contact,
      labels: [
        { key: 's', mm: [a[0], a[1], a[2] + 40], text: '출발', color: LEARN_COLORS.ok },
        { key: 'g', mm: [b[0], b[1], b[2] + 40], text: '도착', color: LEARN_COLORS.accent },
        { key: 'w', mm: [290, 0, 112], text: '벽 6 mm', color: '#b5562a' },
      ],
    };
  }, [k, step, q, caps, runs, tips, shownN, playing, path, chain]);

  useEffect(() => {
    show(scene);
  }, [scene, show]);

  if (step === 'cmp')
    return (
      <section className={css.card}>
        <h3>검사 간격 세 가지</h3>
        <div className={css.row3}>
          {(['A', 'B', 'C'] as const).map((key) => {
            const r = runs[key];
            const ok = r && r.hits.some(Boolean);
            return <Readout key={key} label={`${STEP_NAME[key]} ${gapText(key)}`} value={r ? `${r.poses.length} 번 · ${ok ? '찾음' : '놓침'}` : '–'} tone={r ? (ok ? 'ok' : 'bad') : undefined} />;
          })}
        </div>
        <p className={css.note}>점 색 = 활동 1 · 2 · 3 에서 검사한 자세의 손끝, 빨강 = 벽과 겹친 자세. 간격을 좁힐수록 검사는 많아지고, 얇은 벽을 놓치지 않아요.</p>
      </section>
    );

  const cur = runs[k];
  const done = cur && !anim.running;
  const found = cur ? cur.hits.filter(Boolean).length : 0;
  return (
    <section className={css.card}>
      <h3>{GAP_NAME[k]}: 얇은 벽 (6 mm)</h3>
      <div className={css.btnRow}>
        <button type="button" className={css.primary} disabled={anim.running} onClick={checkMove}>
          {GAP_NAME[k]}
        </button>
      </div>
      <div className={css.row3}>
        <Readout label="검사 횟수" value={cur ? String(cur.poses.length) : '–'} unit="번" />
        <Readout label="찾은 충돌" value={cur ? (found ? `${found} 자세` : '없음') : '–'} tone={cur && done ? (found ? 'ok' : 'warn') : undefined} />
        <Readout label="판정" value={done ? (found ? '맞음' : cur.real ? '놓침' : '맞음') : '–'} tone={done ? (found || !cur.real ? 'ok' : 'bad') : undefined} />
      </div>
      {done && found > 0 && <Verdict tone="ok">검사에서 벽을 찾았어요. 그래서 움직이지 않아요.</Verdict>}
      {done && !found && cur.real && <Verdict tone="bad">검사는 &quot;충돌 없음&quot; 이라고 했는데, 실제로 움직이니 J{cur.real.joint} 가 벽에 닿았어요.</Verdict>}
      <p className={css.note}>
        J1 을 {fmt(Math.abs(GOAL[0] - START[0]), 1)}° 돌려 벽 너머로 가요. 점 = 검사한 자세의 손끝(초록 비어 있음 · 빨강 겹침), 반투명 팔 = 검사한 자세. 파란 철망 = 충돌 검사에 쓰는 캡슐(링크를 감싼 원통 + 양끝 반구).
      </p>
    </section>
  );
}
