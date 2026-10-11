'use client';

/** B3 속도와 자코비안: A one joint's tool-velocity arrow (a Jacobian column), B direction buttons driving the tool straight by mixing joint speeds, C the same near the stretched-out singularity. */

import { useEffect, useMemo, useRef, useState } from 'react';

import { jacobianAt, manipulability, resolvedRateStep, toolVelocity, type Manipulability } from '@/engine/physics/jacobian';
import { poseContact } from '@/engine/physics/collide';

import css from '../../learn.module.css';
import { Bars, Readout } from '../../widgets';
import { LEARN_COLORS, STEP_COLORS, TCP, Verdict, fmt, tipOf, useGlide, usePose, type Mm } from '../kit';
import type { TopicProps } from '../types';

const JOINT_COLORS = ['#e5484d', '#e08a0b', '#1fae66', '#1592c9', '#6d4fe8', '#d63d73'];
const JOINT_DEG_S = 30;
const MAX_JOINT_DEG_S = 200;
const LIMITS = [MAX_JOINT_DEG_S, MAX_JOINT_DEG_S, MAX_JOINT_DEG_S, MAX_JOINT_DEG_S, MAX_JOINT_DEG_S, MAX_JOINT_DEG_S];
const DRIVE_MM_S = 40;
/** A tap (shorter than this, ms) drives for TAP_S instead of stopping at once — easier on a touch screen. */
const TAP_MS = 300;
const TAP_S = 2;
const ELLIPSE_SCALE = 0.2;
/** A comfortable pose: arm half out in front. */
const START = [0, -10, -40, -30, 0, 0];
/** Arm almost straight out in front: near the boundary singularity. */
const STRETCH = [0, -80, -5, 0, 0, 0];
/** Below this the ellipsoid counts as flat (stretched out with the gripper it reaches about 0.20; a comfortable pose is about 0.46). */
const NEAR_ISO = 0.22;

type Dir = [number, number, number];
const DIRS: { label: string; v: Dir }[] = [
  { label: '+x 앞', v: [1, 0, 0] },
  { label: '−x 뒤', v: [-1, 0, 0] },
  { label: '+y 왼', v: [0, 1, 0] },
  { label: '−y 오른', v: [0, -1, 0] },
  { label: '+z 위', v: [0, 0, 1] },
  { label: '−z 아래', v: [0, 0, -1] },
];

interface Drive {
  dir: Dir;
  raf: number;
  last: number;
  start: Mm;
  peak: number;
  step: 'B' | 'C';
  /** performance.now() when the button went down. */
  pressed: number;
  /** Released after a short tap: drive on until TAP_S of motion (a long press stops on release). */
  tap: boolean;
  /** Motion time integrated so far, s (frames can come slowly; the speed is measured on this clock). */
  simS: number;
  /** The drive's own pose (not read back from the rendered state, which can lag a frame behind). */
  q: number[];
}
interface Held {
  q: number[];
  speedMmS: number;
  peakDegS: number;
  man: Manipulability;
}

/** Tool velocity (mm/s) of each joint turning alone at `degS`. */
const columns = (J: number[][], degS: number) =>
  [0, 1, 2, 3, 4, 5].map((j) => {
    const d = [0, 0, 0, 0, 0, 0];
    d[j] = degS;
    return toolVelocity(J, d).linearMmS as Mm;
  });

export default function B3Jacobian({ chain, show, step, record, results }: TopicProps) {
  const [q, setQ, qRef] = usePose(START);
  const { glide, running, stop } = useGlide(setQ, qRef);
  const [joint, setJoint] = useState(1);
  const [qdot, setQdot] = useState<number[]>([0, 0, 0, 0, 0, 0]);
  const [speedNow, setSpeedNow] = useState(0);
  const [trail, setTrail] = useState<Mm[]>([]);
  const [note, setNote] = useState('');
  const [driving, setDriving] = useState(false);
  const [held, setHeld] = useState<{ B?: Held; C?: Held }>({});
  const drive = useRef<Drive | null>(null);

  const { J } = useMemo(() => jacobianAt(chain, q, TCP), [chain, q]);
  const man = useMemo(() => manipulability(J), [J]);
  const tip = useMemo(() => tipOf(chain, q), [chain, q]);
  const cols = useMemo(() => columns(J, JOINT_DEG_S), [J]);
  const lens = useMemo(() => cols.map((c) => Math.hypot(...c)), [cols]);
  const near = man.isotropy < NEAR_ISO;

  // Each try starts from the comfortable pose (C stretches out with its button).
  useEffect(() => {
    stop();
    const d = drive.current;
    if (d) cancelAnimationFrame(d.raf);
    drive.current = null;
    // A drive cut off by the step change leaves its buttons usable again.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the step tabs end any drive; the panel is not remounted per step
    setDriving(false);
    if (step !== 'cmp') setQ(START.slice());
  }, [step, stop, setQ]);
  useEffect(
    () => () => {
      if (drive.current) cancelAnimationFrame(drive.current.raf);
    },
    [],
  );

  // ── A: one joint
  const pickJoint = (j: number) => {
    setJoint(j);
    // The shoulder joints, the wrist and the flange — the three the 원고 compares.
    record('A', {
      '손끝 속도': `${[0, 1, 4, 5].map((i) => `J${i + 1} ${lens[i].toFixed(0)}`).join(' · ')} mm/s`,
      '최대 관절 속도': `${JOINT_DEG_S} °/s (한 관절만)`,
      '둥근 정도': fmt(man.isotropy, 2),
    });
  };

  // ── B / C: resolved-rate drive while a button is held
  const stopDrive = () => {
    const d = drive.current;
    if (!d) return;
    cancelAnimationFrame(d.raf);
    drive.current = null;
    setDriving(false);
    setQdot([0, 0, 0, 0, 0, 0]);
    setSpeedNow(0);
    const secs = d.simS;
    if (secs < 0.3) return;
    const end = d.q.slice();
    const p = tipOf(chain, end);
    const along = (p[0] - d.start[0]) * d.dir[0] + (p[1] - d.start[1]) * d.dir[1] + (p[2] - d.start[2]) * d.dir[2];
    const h: Held = { q: end, speedMmS: Math.max(0, along / secs), peakDegS: d.peak, man: manipulability(jacobianAt(chain, end, TCP).J) };
    setHeld((s) => ({ ...s, [d.step]: h }));
    record(d.step, {
      '손끝 속도': `${fmt(h.speedMmS, 1)} mm/s (목표 ${DRIVE_MM_S})`,
      '최대 관절 속도': `${fmt(h.peakDegS, 0)} °/s`,
      '둥근 정도': fmt(h.man.isotropy, 3),
    });
  };
  const startDrive = (dir: Dir, at: number) => {
    if (step !== 'B' && step !== 'C') return;
    stopDrive();
    stop();
    const start = tipOf(chain, qRef.current);
    setTrail([start]);
    setNote('');
    const d: Drive = { dir, raf: 0, last: 0, start, peak: 0, step, pressed: at, tap: false, simS: 0, q: qRef.current.slice() };
    drive.current = d;
    setDriving(true);
    const tick = (now: number) => {
      if (drive.current !== d) return;
      if (d.tap && d.simS >= TAP_S) {
        stopDrive();
        return;
      }
      // Real time since the last frame, integrated in short steps (slow frames do not slow the motion).
      const total = d.last ? Math.min(0.5, (now - d.last) / 1000) : 0;
      d.last = now;
      const n = Math.max(1, Math.ceil(total / 0.04));
      const dt = total / n;
      let q = d.q;
      let r = resolvedRateStep(chain, q, dir.map((x) => x * DRIVE_MM_S), dt, TCP);
      let k = 1;
      let peak = 0;
      for (let i = 0; i < n; i += 1) {
        if (i > 0) r = resolvedRateStep(chain, q, dir.map((x) => x * DRIVE_MM_S), dt, TCP);
        // Joints cannot turn faster than the servos: slow the whole move down instead.
        peak = Math.max(...r.qdotDegS.map(Math.abs));
        k = peak > MAX_JOINT_DEG_S ? MAX_JOINT_DEG_S / peak : 1;
        const next = q.map((a, j) => a + r.qdotDegS[j] * k * dt);
        const hit = poseContact(chain, next, [], TCP);
        if (hit) {
          setQ(q);
          setNote(`J${hit.joint} 가 ${hit.what}에 닿아 멈췄어요.`);
          stopDrive();
          return;
        }
        q = next;
        d.q = next;
        d.simS += dt;
        d.peak = Math.max(d.peak, peak * k);
      }
      const next = q;
      const v = r.achievedMmS;
      const speed = Math.max(0, (v[0] * dir[0] + v[1] * dir[1] + v[2] * dir[2]) * k);
      if (peak * k >= MAX_JOINT_DEG_S - 1 || speed < DRIVE_MM_S * 0.8) setNote(`관절 속도가 한계(${MAX_JOINT_DEG_S}°/s)에 걸려 손끝이 ${fmt(speed, 0)} mm/s 로 느려졌어요.`);
      setQdot(r.qdotDegS.map((x) => x * k));
      setSpeedNow(speed);
      setQ(next);
      const t = tipOf(chain, next);
      setTrail((tr) => (tr.length > 400 ? [...tr.slice(-400), t] : [...tr, t]));
      d.raf = requestAnimationFrame(tick);
    };
    d.raf = requestAnimationFrame(tick);
  };

  /** Button released: a long press stops; a tap keeps going for TAP_S. */
  const release = (at: number) => {
    const d = drive.current;
    if (!d || d.tap) return;
    // A short press (by the clock, or by motion when frames come slowly) keeps going for TAP_S.
    if (at - d.pressed < TAP_MS || d.simS < 0.3) d.tap = true;
    else stopDrive();
  };

  // ── 3D view
  useEffect(() => {
    const ell = (m: Manipulability, at: Mm) => ({ centre: at, lengthsMm: m.axes.map((a) => a.lengthMm * ELLIPSE_SCALE) as Mm, dirs: m.axes.map((a) => a.dir as Mm) });
    const arrows =
      step === 'A'
        ? [joint].map((j) => {
            const c = cols[j];
            const s = Math.min(1, 150 / Math.max(1, lens[j]));
            return { key: `c${j}`, from: tip, vec: [c[0] * s, c[1] * s, c[2] * s] as Mm, color: JOINT_COLORS[j], label: `J${j + 1}: ${fmt(lens[j], 0)} mm/s` };
          })
        : [];
    if (step === 'cmp') {
      // Normal pose (ghost, axes drawn as lines) against the stretched pose (ellipsoid).
      const B = held.B;
      const C = held.C;
      const main = C?.q ?? q;
      const mainTip = tipOf(chain, main);
      const bTip = B ? tipOf(chain, B.q) : null;
      show({
        angles: main,
        frames: 'none',
        ghosts: B ? [{ key: 'b', angles: B.q, color: STEP_COLORS.B, opacity: 0.25 }] : [],
        ellipsoid: ell(C?.man ?? man, mainTip),
        lines:
          B && bTip
            ? [
                {
                  key: 'bAxes',
                  points: B.man.axes.flatMap((a) => {
                    const L = a.lengthMm * ELLIPSE_SCALE;
                    return [
                      [bTip[0] - a.dir[0] * L, bTip[1] - a.dir[1] * L, bTip[2] - a.dir[2] * L] as Mm,
                      [bTip[0] + a.dir[0] * L, bTip[1] + a.dir[1] * L, bTip[2] + a.dir[2] * L] as Mm,
                    ];
                  }),
                  color: STEP_COLORS.B,
                  width: 2.5,
                  segments: true,
                },
              ]
            : [],
        labels: [
          ...(bTip ? [{ key: 'b', mm: [bTip[0], bTip[1], bTip[2] + 70] as Mm, text: `보통 자세 · 둥근 정도 ${fmt(B!.man.isotropy, 2)}`, color: STEP_COLORS.B }] : []),
          ...(C ? [{ key: 'c', mm: [mainTip[0], mainTip[1], mainTip[2] + 70] as Mm, text: `특이점 근처 · 둥근 정도 ${fmt(C.man.isotropy, 3)}`, color: STEP_COLORS.C }] : []),
        ],
      });
      return;
    }
    show({
      angles: q,
      frames: 'none',
      arrows,
      ellipsoid: step === 'A' ? null : ell(man, tip),
      lines: step !== 'A' && trail.length > 1 ? [{ key: 'trail', points: trail, color: LEARN_COLORS.path, width: 3 }] : [],
      labels: step !== 'A' && near ? [{ key: 'sing', mm: [tip[0], tip[1], tip[2] + 60], text: '특이점 가까움: 타원체가 납작해요', color: LEARN_COLORS.bad }] : [],
    });
  }, [q, step, joint, cols, lens, man, tip, trail, near, held, chain, show]);

  if (step === 'cmp') {
    const B = held.B;
    const C = held.C;
    return (
      <section className={css.card}>
        <h3>보통 자세 vs 특이점 근처</h3>
        <div className={css.row3}>
          <Readout label="활동 2 타원체 큰축 / 작은축" value={B ? `${fmt(B.man.axes[0].lengthMm, 0)} / ${fmt(B.man.axes[2].lengthMm, 0)}` : '—'} unit="mm/s" />
          <Readout label="활동 3 타원체 큰축 / 작은축" value={C ? `${fmt(C.man.axes[0].lengthMm, 0)} / ${fmt(C.man.axes[2].lengthMm, 0)}` : '—'} unit="mm/s" tone={C ? 'bad' : undefined} />
          <Readout label="최대 관절 속도 활동 2 → 3" value={`${results.B?.['최대 관절 속도'] ?? '—'} → ${results.C?.['최대 관절 속도'] ?? '—'}`} />
        </div>
        <p className={css.note}>하늘색 선 = 활동 2 보통 자세의 타원체 축(반투명 팔), 타원체 = 활동 3 팔을 편 자세. 펴진 쪽으로는 타원체가 거의 납작해서, 같은 손끝 속도에 관절이 훨씬 빨라야 해요.</p>
      </section>
    );
  }

  return (
    <section className={css.card}>
      <h3>{step === 'A' ? '관절 하나가 만드는 손끝 속도' : step === 'B' ? '관절 속도를 섞어 원하는 방향으로' : '팔을 쭉 편 자세에서'}</h3>

      {step === 'A' && (
        <>
          <div className={css.seg} role="group" aria-label="관절 고르기">
            {[0, 1, 2, 3, 4, 5].map((j) => (
              <button key={j} type="button" aria-pressed={joint === j} style={{ color: JOINT_COLORS[j] }} onClick={() => pickJoint(j)}>
                J{j + 1}
              </button>
            ))}
          </div>
          <p className={css.live}>관절 하나만 {JOINT_DEG_S}°/s 로 돌 때 손끝 속도 (= 자코비안의 열):</p>
          <Bars values={lens} limits={lens.map(() => Math.max(...lens) || 1)} unit="mm/s" digits={0} />
          <p className={css.note}>J6 은 손끝(플랜지) 축 자체를 돌려서 손끝 위치는 그대로예요. 그래서 화살표가 0 이에요.</p>
        </>
      )}

      {(step === 'B' || step === 'C') && (
        <>
          {step === 'C' && (
            <div className={css.btnRow}>
              <button type="button" className={css.primary} disabled={running || driving} onClick={() => glide(STRETCH, 1.4)}>
                앞으로 쭉 뻗기
              </button>
              <button type="button" disabled={running || driving} onClick={() => glide(START, 1.2)}>
                처음 자세
              </button>
            </div>
          )}
          <p className={css.note}>
            {step === 'C' && !near ? '먼저 [앞으로 쭉 뻗기] 로 팔을 펴세요. 그다음 ' : ''}버튼을 누르고 있는 동안 손끝이 {DRIVE_MM_S} mm/s 로 그 방향으로 가요{step === 'C' ? '. [+x 앞] 을 눌러 보세요.' : '.'}
          </p>
          <div className={css.dpad}>
            {DIRS.map((d) => (
              <button
                key={d.label}
                type="button"
                disabled={running || (step === 'C' && !near && !driving)}
                onPointerDown={(e) => {
                  (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
                  startDrive(d.v, e.timeStamp);
                }}
                onPointerUp={(e) => release(e.timeStamp)}
                onPointerCancel={(e) => release(e.timeStamp)}
                onLostPointerCapture={(e) => release(e.timeStamp)}
              >
                {d.label}
              </button>
            ))}
          </div>
          <div className={css.row3}>
            <Readout label="손끝 속도" value={fmt(driving ? speedNow : (held[step]?.speedMmS ?? 0), 0)} unit="mm/s" tone={driving && speedNow < DRIVE_MM_S * 0.8 ? 'bad' : undefined} />
            <Readout label="가장 빠른 관절" value={fmt(driving ? Math.max(...qdot.map(Math.abs)) : (held[step]?.peakDegS ?? 0), 0)} unit="°/s" />
            <Readout label="둥근 정도 (작은축/큰축)" value={fmt(man.isotropy, 3)} tone={near ? 'bad' : man.isotropy < 0.25 ? 'warn' : 'ok'} />
          </div>
          <Bars values={qdot} limits={LIMITS} unit="°/s" digits={0} />
          {note && <Verdict tone="warn">{note}</Verdict>}
        </>
      )}
    </section>
  );
}
