'use client';

/** A4 작업 공간: J1 alone draws a circle, the vertical section, then the 3D shell — and what narrower joint limits do. */

import { useEffect, useMemo, useState } from 'react';

import { JOINT_ANGLE_MAX, JOINT_ANGLE_MIN } from '@/engine/robot/limits';
import { profileOutline, workspaceProfile, type WorkspaceProfile } from '@/engine/physics/workspace';

import css from '../../learn.module.css';
import { JointSliders, Readout } from '../../widgets';
import { STEP_COLORS, TCP, fmt, tipOf, useAnimator, usePose, type Mm } from '../kit';
import type { TopicProps } from '../types';

const START = [0, -35, -45, -10, 0, 0];
const SCALES = [1, 0.7, 0.4] as const;

/** Area of the section outline (r, z in mm), cm². */
function areaCm2(p: WorkspaceProfile) {
  return p.rows.reduce((s, r, i) => s + (r.rMax - r.rMin) * (i ? r.z - p.rows[i - 1].z : 6), 0) / 100;
}
/** J1's turning range, degrees. */
const spanDeg = (p: WorkspaceProfile) => p.j1Range[1] - p.j1Range[0];
/** Volume of the shell: the section spun over J1's range, litres. */
function volumeL(p: WorkspaceProfile) {
  const ring = p.rows.reduce((s, r, i) => s + Math.PI * (r.rMax ** 2 - r.rMin ** 2) * (i ? r.z - p.rows[i - 1].z : 6), 0);
  return (ring * spanDeg(p)) / 360 / 1e6;
}

export default function A4Workspace({ chain, show, step, record, workspace, frontDeg }: TopicProps) {
  const [q, setQ] = usePose(START);
  const [circle, setCircle] = useState<Mm[]>([]);
  const [scale, setScale] = useState<number>(1);
  const [profiles, setProfiles] = useState<Record<number, WorkspaceProfile>>({});
  const anim = useAnimator();
  const tip = useMemo(() => tipOf(chain, q), [chain, q]);
  const prof = scale === 1 ? workspace : (profiles[scale] ?? null);

  // C: every limit pressed so far, shown 100 → 70 → 40 % side by side once its shell is computed.
  const [seen, setSeen] = useState<number[]>([]);
  // Narrower limits: sample once per scale, after the click paints.
  const pickScale = (s: number) => {
    setScale(s);
    setSeen((v) => (v.includes(s) ? v : [...v, s]));
    if (s === 1 || profiles[s]) return;
    window.setTimeout(() => setProfiles((p) => ({ ...p, [s]: workspaceProfile(chain, TCP, 4, 6, 0, s) })), 30);
  };
  useEffect(() => {
    if (step !== 'C' || !workspace || !seen.length) return;
    const done = SCALES.filter((s) => seen.includes(s) && (s === 1 || profiles[s]));
    if (!done.length) return;
    const join = (f: (p: WorkspaceProfile) => string) => done.map((s) => f(s === 1 ? workspace : profiles[s])).join(' → ');
    record('C', {
      '보이는 것': `3D 껍질 (공간, 한계 ${done.map((s) => s * 100).join(' → ')}%)`,
      '가장 멀리': `${join((p) => fmt(p.reachMm, 0))} mm`,
      'J1 범위': `${join((p) => fmt(spanDeg(p), 0))}°`,
      '닿는 크기': `부피 ${join((p) => fmt(volumeL(p), 0))} L`,
    });
  }, [step, seen, workspace, profiles, record]);

  const spin = () => {
    const pts: Mm[] = [];
    anim.play(
      3,
      (t) => {
        const next = START.slice();
        next[0] = JOINT_ANGLE_MIN[0] + ((JOINT_ANGLE_MAX[0] - JOINT_ANGLE_MIN[0]) * t) / 3;
        pts.push(tipOf(chain, next));
        setQ(next);
        setCircle(pts.slice());
      },
      () => {
        const r = Math.hypot(pts[0][0], pts[0][1]);
        const span = JOINT_ANGLE_MAX[0] - JOINT_ANGLE_MIN[0];
        // The arc's length from J1 every degree — not from the drawn frames, which a slow screen thins out.
        const arc = Array.from({ length: span + 1 }, (_, d) => {
          const next = START.slice();
          next[0] = JOINT_ANGLE_MIN[0] + d;
          return tipOf(chain, next);
        });
        const len = arc.reduce((s, p, i) => (i ? s + Math.hypot(p[0] - arc[i - 1][0], p[1] - arc[i - 1][1]) : 0), 0);
        record('A', { '보이는 것': `원 (선, 반지름 ${fmt(r, 0)} mm)`, '가장 멀리': `${fmt(r, 0)} mm`, 'J1 범위': `${span}° (뒤 ${360 - span}° 빔)`, '닿는 크기': `길이 ${fmt(len, 0)} mm` });
      },
    );
  };

  const moved = (next: number[]) => {
    setQ(next);
    if (step === 'B' && workspace) record('B', { '보이는 것': '세로 단면 (면, 반달 모양)', '가장 멀리': `${fmt(workspace.reachMm, 0)} mm`, 'J1 범위': '— (한 평면)', '닿는 크기': `넓이 ${fmt(areaCm2(workspace), 0)} cm²` });
  };

  // Outlines of the three limit settings, drawn in the arm's plane for the comparison.
  const outlines = useMemo(() => {
    const ang = ((frontDeg + q[0]) * Math.PI) / 180;
    return SCALES.map((s) => {
      const p = s === 1 ? workspace : profiles[s];
      if (!p) return null;
      const pts = profileOutline(p).map(([r, z]) => [r * Math.cos(ang), r * Math.sin(ang), z] as Mm);
      return pts.length ? [...pts, pts[0]] : null;
    });
  }, [workspace, profiles, frontDeg, q]);

  useEffect(() => {
    show({
      angles: q,
      workspace: prof && step !== 'A' && step !== 'cmp' ? { profile: prof, frontDeg, shell: step === 'C', section: step === 'B' || step === 'C' } : null,
      lines: [
        ...(step === 'A' || step === 'cmp' ? [{ key: 'circle', points: circle, color: STEP_COLORS.A, width: 3 }] : []),
        ...(step === 'cmp'
          ? outlines.flatMap((pts, i) => (pts ? [{ key: `o${i}`, points: pts, color: ['#3454d1', '#f59a1b', '#ef4638'][i], width: 2.5 }] : []))
          : []),
      ],
      labels: [{ key: 'tip', mm: [tip[0], tip[1], tip[2] + 26], text: `거리 ${fmt(Math.hypot(tip[0], tip[1]), 0)} mm`, color: STEP_COLORS.A }],
    });
  }, [q, step, prof, frontDeg, circle, outlines, tip, show]);

  if (step === 'cmp')
    return (
      <section className={css.card}>
        <h3>관절 한계와 작업 공간</h3>
        <p className={css.note}>지금 팔이 있는 평면의 단면 바깥선: 파랑 = 한계 100%, 주황 = 70%, 빨강 = 40%. 아래 숫자는 닿는 부피예요. 활동 3에서 눌러 본 것만 보여요.</p>
        <div className={css.row3}>
          {SCALES.map((s) => {
            const p = s === 1 ? workspace : profiles[s];
            return <Readout key={s} label={`한계 ${s * 100}% · J1 ${p ? fmt(spanDeg(p), 0) : '—'}°`} value={p ? `${fmt(volumeL(p), 0)} L` : '—'} />;
          })}
        </div>
      </section>
    );

  return (
    <section className={css.card}>
      <h3>{step === 'A' ? 'J1 만 돌리기' : step === 'B' ? '세로 단면 안 돌아다니기' : '3D 작업 공간과 관절 한계'}</h3>
      {step === 'A' && (
        <div className={css.btnRow}>
          <button type="button" className={css.primary} disabled={anim.running} onClick={spin}>
            J1 끝에서 끝까지 돌리기
          </button>
        </div>
      )}
      <JointSliders angles={q} onChange={moved} joints={step === 'A' ? [0] : step === 'B' ? [1, 2, 3] : [0, 1, 2]} disabled={anim.running} />
      {step === 'C' && (
        <div className={css.seg} role="group" aria-label="관절 한계">
          {SCALES.map((s) => (
            <button key={s} type="button" aria-pressed={scale === s} onClick={() => pickScale(s)}>
              한계 {s * 100}%
            </button>
          ))}
        </div>
      )}
      <div className={css.row3}>
        <Readout label="바닥 가운데에서 거리" value={fmt(Math.hypot(tip[0], tip[1]), 0)} unit="mm" />
        <Readout label="높이" value={fmt(tip[2], 0)} unit="mm" />
        <Readout label="가장 멀리 (작업 공간)" value={prof ? fmt(prof.reachMm, 0) : '…'} unit="mm" />
      </div>
      <p className={css.note}>
        {step === 'A'
          ? 'J1 은 ±168° 라서 뒤쪽 24° 는 못 가요 — 원이 조금 끊겨 있어요.'
          : step === 'B'
            ? '파란 면 = 이 평면에서 손끝이 닿는 곳. 몸 가까이와 바로 아래는 비어 있어요. 슬라이더로 면 끝까지 가 보세요.'
            : prof
              ? `한계 ${Math.round(scale * 100)}%: J1 이 ${fmt(spanDeg(prof), 0)}° 만 돌아 껍질이 그만큼 잘리고, 부피 ${fmt(volumeL(prof), 0)} L, 가장 멀리 ${fmt(prof.reachMm, 0)} mm, 가장 낮은 곳 ${fmt(Math.max(0, prof.rows[0].z - 3), 0)} mm${prof.rows[0].z > 20 ? ' — 책상 면까지 못 내려가요' : ''}. 뻗는 거리는 링크 길이가 정해서 잘 줄지 않아요.`
              : '작업 공간을 계산하는 중…'}
      </p>
    </section>
  );
}
