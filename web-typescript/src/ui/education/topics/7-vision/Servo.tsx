'use client';

/** G3 시각 서보 (활동 1 · 2 · 3 = steps A · B · C): a red block moves on the table; A look once and go (arrives late), B keep looking and correct each frame with gain K = 3 (follows), C the same loop with only K raised to 9 (the 0.2 s late picture makes it overshoot and shake). The image Jacobian (pixel error arrow → tool motion arrow) can be shown in B and C. */

import { useEffect, useMemo, useState } from 'react';
import { Quaternion, Vector3 } from 'three';

import { STRAIGHT_DOWN, solveToolPose } from '@/engine/robot/tool';

import { Sym } from '../../lesson/Rich';
import css from '../../learn.module.css';
import { Graph, Readout } from '../../widgets';
import { CamImage, cube, develop, frustumLines, handCam, project, shoot, toPlane, IMG_H, IMG_W, type Cam } from '../gcam';
import { HOME_POSE, LEARN_COLORS, STEP_COLORS, Verdict, ease, fmt, useAnimator, usePose, type Mm } from '../kit';
import type { TopicProps } from '../types';

/** Like reachFor, but solved to 0.1 mm (reachFor stops at 1 mm, which would show up as error here). */
function reachTight(chain: TopicProps['chain'], mm: Mm, seed: readonly number[], tcpMm = 0): number[] | null {
  const r = solveToolPose(chain, { x: mm[0], y: mm[1], z: mm[2] }, seed, { tcpMm, orientation: STRAIGHT_DOWN, toleranceMm: 0.1 });
  return r.converged ? r.anglesDeg : null;
}

type Run = 'A' | 'B' | 'C';

const FLANGE_Z = 170;
const BLOCK_TOP = 25;
const RUN_S = 12;
const DT = 1 / 30;
/** Camera delay: the picture used is this many frames old (0.2 s). */
const DELAY = 6;
const V_MAX = 200;
const GLIDE_S = 2;
const START_CAM: [number, number] = [180, -25];
const RED: [number, number, number] = [205, 35, 40];

/** Where the block is at time t (mm, centre on the table). */
const blockAt = (t: number): [number, number] => [205 + 40 * Math.sin(0.45 * t), 55 * Math.sin(0.7 * t)];
const PATH: Mm[] = Array.from({ length: 121 }, (_, i) => {
  const p = blockAt((i / 120) * RUN_S);
  return [p[0], p[1], 1];
});

/** Flange point that puts the camera (44.4 mm out along the radial flange x) straight above `c`. */
function flangeFor(c: readonly number[]): Mm {
  const r = Math.hypot(c[0], c[1]);
  const k = (r - 44.4) / r;
  return [c[0] * k, c[1] * k, FLANGE_Z];
}

/** Image Jacobian: pixels the block moves per mm the camera moves (x, y), at the block's depth. */
function imageJacobian(cam: Cam): [[number, number], [number, number]] {
  const k = cam.f / (cam.pos[2] - BLOCK_TOP);
  const [X, Y] = cam.R;
  return [
    [-k * X[0], -k * X[1]],
    [-k * Y[0], -k * Y[1]],
  ];
}

/** v = −K · J⁻¹ · e (mm/s), limited to V_MAX. */
function control(J: [[number, number], [number, number]], e: readonly number[], K: number): [number, number] {
  const det = J[0][0] * J[1][1] - J[0][1] * J[1][0];
  let vx = (-K * (J[1][1] * e[0] - J[0][1] * e[1])) / det;
  let vy = (-K * (-J[1][0] * e[0] + J[0][0] * e[1])) / det;
  const n = Math.hypot(vx, vy);
  if (n > V_MAX) {
    vx *= V_MAX / n;
    vy *= V_MAX / n;
  }
  return [vx, vy];
}

const START_Q = (chain: TopicProps['chain']) => reachTight(chain, flangeFor(START_CAM), HOME_POSE) ?? HOME_POSE.slice();

interface Live {
  t: number;
  block: [number, number];
  /** Pixel error now (block − picture centre), null when out of the picture. */
  e: [number, number] | null;
  v: [number, number];
  err: number;
  goal: [number, number] | null;
}

interface Series {
  t: number[];
  err: number[];
}

const f2 = (n: number) => (Math.abs(n) < 0.005 ? 0 : n).toFixed(2);
const shake = (ratio: number) => (ratio > 1.4 ? '큼' : ratio > 1.15 ? '조금' : '없음');
/** The gain each step starts at (the slider can still move it): B follows well, C is past the delay limit π/2τ ≈ 7.9 /s. */
const K_START = { B: 3, C: 9 } as const;
const NUM: Record<Run, string> = { A: '활동 1', B: '활동 2', C: '활동 3' };

export default function G3Servo({ chain, show, step, record }: TopicProps) {
  const [q, setQ] = usePose(useMemo(() => START_Q(chain), [chain]));
  const anim = useAnimator();
  const { stop } = anim;
  const [K, setK] = useState<number>(step === 'C' ? K_START.C : K_START.B);
  const [jac, setJac] = useState(false);
  const [live, setLive] = useState<Live>({ t: 0, block: blockAt(0), e: null, v: [0, 0], err: 0, goal: null });
  const [series, setSeries] = useState<Partial<Record<Run, Series>>>({});
  const [result, setResult] = useState<Partial<Record<Run, { mean: number; max: number; ratio: number; K: number }>>>({});

  // Leaving a step stops a run in progress.
  useEffect(() => () => stop(), [step, stop]);
  // Entering B or C sets its gain.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- each step starts at its own K (B 3, C 9); the slider still moves it afterwards
    if (step === 'B' || step === 'C') setK(K_START[step]);
  }, [step]);

  const cam = useMemo(() => handCam(chain, q), [chain, q]);
  const rgba = useMemo(() => develop(shoot(cam, { boxes: [cube(1, live.block[0], live.block[1], RED)] }), 1, 6), [cam, live.block]);
  const J = useMemo(() => imageJacobian(cam), [cam]);
  const seen = useMemo(() => project(cam, [live.block[0], live.block[1], BLOCK_TOP]), [cam, live.block]);

  const start = (mode: Run) => {
    let qq = START_Q(chain);
    let c: [number, number] = [...START_CAM];
    const c0: [number, number] = [...START_CAM];
    const buf: ([number, number] | null)[] = [];
    let goal: [number, number] | null = null;
    let simT = 0;
    let v: [number, number] = [0, 0];
    let camPath = 0;
    let blockPath = 0;
    let prevCam: [number, number] | null = null;
    let prevBlock = blockAt(0);
    const errs: number[] = [];
    const out: Series = { t: [], err: [] };
    let nextSample = 0;
    let lastE: [number, number] | null = null;
    let lastErr = 0;
    setQ(qq);
    setSeries((s) => ({ ...s, [mode]: { t: [], err: [] } }));

    const tick = () => {
      const b = blockAt(simT);
      const cm = handCam(chain, qq);
      const p = project(cm, [b[0], b[1], BLOCK_TOP]);
      const e: [number, number] | null = p && p[0] >= 0 && p[0] < IMG_W && p[1] >= 0 && p[1] < IMG_H ? [p[0] - IMG_W / 2, p[1] - IMG_H / 2] : null;
      buf.push(e);
      lastE = e;
      if (mode === 'A') {
        if (!goal && p) {
          const m = toPlane(cm, p[0], p[1], BLOCK_TOP);
          if (m) goal = [m[0], m[1]];
        }
        if (goal) {
          const u = ease(Math.min(1, simT / GLIDE_S));
          const next: [number, number] = [c0[0] + (goal[0] - c0[0]) * u, c0[1] + (goal[1] - c0[1]) * u];
          v = [(next[0] - c[0]) / DT, (next[1] - c[1]) / DT];
          c = next;
        }
      } else {
        const old = buf.length > DELAY ? buf[buf.length - 1 - DELAY] : null;
        v = old ? control(imageJacobian(cm), old, K) : [0, 0];
        c = [c[0] + v[0] * DT, c[1] + v[1] * DT];
        const r = Math.hypot(c[0], c[1]);
        if (r > 300 || r < 140) c = [(c[0] / r) * Math.min(300, Math.max(140, r)), (c[1] / r) * Math.min(300, Math.max(140, r))];
      }
      const nq = reachTight(chain, flangeFor(c), qq);
      if (nq) qq = nq;
      simT += DT;
      const cp = handCam(chain, qq).pos;
      const nb = blockAt(simT);
      lastErr = Math.hypot(cp[0] - nb[0], cp[1] - nb[1]);
      errs.push(lastErr);
      if (prevCam) camPath += Math.hypot(cp[0] - prevCam[0], cp[1] - prevCam[1]);
      prevCam = [cp[0], cp[1]];
      blockPath += Math.hypot(nb[0] - prevBlock[0], nb[1] - prevBlock[1]);
      prevBlock = nb;
      if (simT >= nextSample - 1e-9) {
        out.t.push(Math.round(simT * 10) / 10);
        out.err.push(lastErr);
        nextSample += 0.1;
      }
    };

    anim.play(
      RUN_S,
      (t) => {
        while (simT < t) tick();
        setQ(qq);
        setLive({ t: simT, block: blockAt(simT), e: lastE, v, err: lastErr, goal });
        setSeries((s) => ({ ...s, [mode]: { t: out.t.slice(), err: out.err.slice() } }));
      },
      () => {
        const mean = errs.reduce((s, x) => s + x, 0) / Math.max(1, errs.length);
        const late = errs.slice(Math.round(2 / DT));
        const max = Math.max(...late);
        const ratio = camPath / Math.max(1e-6, blockPath);
        setResult((r) => ({ ...r, [mode]: { mean, max, ratio, K } }));
        record(mode, {
          방식: mode === 'A' ? '한 번 보고 가기' : `계속 보기 (K = ${K})`,
          '평균 추적 오차': `${fmt(mean)} mm`,
          '최대 오차 (2 s 뒤)': `${fmt(max)} mm`,
          흔들림: `${shake(ratio)} (이동 ${fmt(ratio, 1)}배)`,
        });
      },
    );
  };

  const vLen = Math.hypot(live.v[0], live.v[1]);
  const showJac = (step === 'B' || step === 'C') && jac;

  useEffect(() => {
    const blocks = [{ id: 'g3', color: '#d42a2f', size: 25, at: new Vector3(live.block[0], live.block[1], 12.5), q: new Quaternion(), held: false }];
    show({
      angles: q,
      blocks,
      lines: [{ key: 'path', points: PATH, color: '#98a2b3', dashed: true }, ...(step === 'cmp' ? [] : frustumLines(cam, LEARN_COLORS.warn))],
      spots: [
        { key: 'aim', mm: [cam.pos[0], cam.pos[1], 0.5], color: LEARN_COLORS.warn, label: '카메라 가운데' },
        ...(live.goal && step === 'A' ? [{ key: 'goal', mm: [live.goal[0], live.goal[1], 0.5] as Mm, color: STEP_COLORS.A, label: '본 순간의 위치' }] : []),
      ],
      arrows:
        showJac && vLen > 1
          ? [{ key: 'v', from: [cam.pos[0], cam.pos[1], 30] as Mm, vec: [(live.v[0] / vLen) * Math.min(90, 25 + vLen), (live.v[1] / vLen) * Math.min(90, 25 + vLen), 0] as Mm, color: LEARN_COLORS.accent, label: `손끝 ${fmt(vLen, 0)} mm/s` }]
          : [],
    });
  }, [show, q, live.block, live.goal, live.v, vLen, cam, step, showJac]);

  const graphX = useMemo(() => Array.from({ length: RUN_S * 10 + 1 }, (_, i) => i / 10), []);
  const runs: Run[] = ['A', 'B', 'C'];

  if (step === 'cmp')
    return (
      <section className={css.card}>
        <h3>세 방식의 추적 오차</h3>
        <Graph
          x={graphX}
          unit="mm"
          title="카메라 가운데 ↔ 블록 거리"
          series={runs.filter((r) => series[r]?.err.length).map((r) => ({ label: r === 'A' ? `${NUM.A} 한 번 보고` : `${NUM[r]} 계속 보기 K=${result[r]?.K ?? K}`, color: STEP_COLORS[r], values: series[r]!.err }))}
        />
        <p className={css.note}>한 번 보고 가면(활동 1) 도착 뒤에도 오차가 크게 남고, 계속 보면(활동 2, K = 3) 작게 유지돼요. K 만 9 로 올리면(활동 3) 0.2 s 늦은 사진 때문에 지나쳤다 돌아오며 흔들려요.</p>
      </section>
    );

  const res = step === 'A' || step === 'B' || step === 'C' ? result[step] : undefined;
  const cur = step === 'A' || step === 'B' || step === 'C' ? series[step] : undefined;
  const e = live.e;

  return (
    <section className={css.card}>
      <h3>{step === 'A' ? '한 번 보고 이동' : step === 'B' ? `계속 보며 이동 · 이득 ${K_START.B}` : `계속 보며 이동 · 이득 ${K_START.C} (크게)`}</h3>
      {step !== 'A' && (
        <label className={css.slider}>
          <b>
            이득 <Sym s="K" name={false} />
          </b>
          <input type="range" min={1} max={10} step={0.5} value={K} disabled={anim.running} onChange={(ev) => setK(Number(ev.target.value))} aria-label="이득 K" />
          <span className={css.num}>{fmt(K, 1)} /s</span>
        </label>
      )}
      <div className={css.btnRow}>
        <button type="button" className={css.primary} disabled={anim.running} onClick={() => start(step === 'A' ? 'A' : step === 'B' ? 'B' : 'C')}>
          {step === 'A' ? '한 번 보고 가기' : '계속 보며 따라가기'}
        </button>
        {step !== 'A' && (
          <span className={css.seg}>
            <button type="button" aria-pressed={jac} onClick={() => setJac(!jac)}>
              이미지 자코비안
            </button>
          </span>
        )}
      </div>
      <CamImage rgba={rgba} caption={`손 카메라 화면 · ${fmt(live.t, 1)} s`}>
        <circle cx={IMG_W / 2} cy={IMG_H / 2} r={7} fill="none" stroke="#fff" strokeWidth={2} />
        <line x1={IMG_W / 2 - 12} x2={IMG_W / 2 + 12} y1={IMG_H / 2} y2={IMG_H / 2} stroke="#fff" strokeWidth={1} />
        <line x1={IMG_W / 2} x2={IMG_W / 2} y1={IMG_H / 2 - 12} y2={IMG_H / 2 + 12} stroke="#fff" strokeWidth={1} />
        {showJac && seen && (
          <g>
            <defs>
              <marker id="g3-head" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M0,0 L10,5 L0,10 z" fill={LEARN_COLORS.bad} />
              </marker>
            </defs>
            <line x1={IMG_W / 2} y1={IMG_H / 2} x2={seen[0]} y2={seen[1]} stroke={LEARN_COLORS.bad} strokeWidth={2.5} markerEnd="url(#g3-head)" />
            <text x={(IMG_W / 2 + seen[0]) / 2 + 6} y={(IMG_H / 2 + seen[1]) / 2 - 6} fontSize={12} fontWeight={800} fill={LEARN_COLORS.bad} stroke="#fff" strokeWidth={3} paintOrder="stroke">
              오차 e
            </text>
          </g>
        )}
      </CamImage>
      <div className={css.row3}>
        <Readout label="사진 속 오차" value={e ? `${fmt(e[0], 0)}, ${fmt(e[1], 0)}` : '—'} unit="px" />
        <Readout label="추적 오차" value={fmt(live.err)} unit="mm" tone={live.err < 10 ? 'ok' : live.err < 25 ? 'warn' : 'bad'} />
        <Readout label="손끝 속도" value={fmt(Math.hypot(live.v[0], live.v[1]), 0)} unit="mm/s" />
      </div>
      {showJac && (
        <>
          <table className={css.matrix}>
            <caption>
              이미지 자코비안 <Sym s="L" name={false} /> (손끝 1 mm → 사진 몇 px)
            </caption>
            <tbody>
              <tr>
                <td>∂u/∂x {f2(J[0][0])}</td>
                <td>∂u/∂y {f2(J[0][1])}</td>
              </tr>
              <tr>
                <td>∂v/∂x {f2(J[1][0])}</td>
                <td>∂v/∂y {f2(J[1][1])}</td>
              </tr>
            </tbody>
          </table>
          <p className={css.live}>
            손끝 속도 = −K · L⁻¹ · e = −{fmt(K, 1)} · L⁻¹ · ({e ? `${fmt(e[0], 0)}, ${fmt(e[1], 0)}` : '—'}) → 손끝 ({fmt(live.v[0], 0)}, {fmt(live.v[1], 0)}) mm/s. 사진 속 빨간 화살표(오차)가 3D 의 파란 화살표(손끝 움직임, 카메라 가운데에서 출발)가 돼요.
          </p>
        </>
      )}
      {cur && cur.err.length > 0 && <Graph x={graphX} unit="mm" title="추적 오차 (카메라 가운데 ↔ 블록)" series={[{ label: NUM[step as Run], color: STEP_COLORS[step as Run], values: cur.err }]} cursor={live.t} />}
      {res && (
        <Verdict tone={res.mean < 12 && res.ratio < 1.4 ? 'ok' : res.ratio >= 1.4 ? 'warn' : 'bad'}>
          평균 {fmt(res.mean)} mm, 최대 {fmt(res.max)} mm, 흔들림 {shake(res.ratio)}.{' '}
          {step === 'A' ? '도착했을 때 블록은 이미 다른 곳에 있어요.' : res.ratio >= 1.4 ? 'K 가 너무 커서 넘쳐 흔들려요.' : res.mean > 12 ? 'K 가 작아 뒤처져요.' : '잘 따라가요.'}
        </Verdict>
      )}
      <p className={css.note}>
        {step === 'A'
          ? `처음 한 번 사진을 보고 블록 위치를 계산해 ${GLIDE_S} 초 동안 그곳으로 가요. 그 뒤로는 보지 않아요.`
          : step === 'B'
            ? '매 프레임(1/30 s) 사진 속 오차 e 를 보고 그 반대쪽으로 이득 K 에 비례한 빠르기로 움직여요(K = 3 이면 오차 10 px 에 1 초당 30 px 를 줄이는 빠르기). 사진은 0.2 s 늦게 들어와요(지연 τ). [이미지 자코비안] 을 켜면 사진 속 빨간 오차 화살표와 그 오차로 계산한 손끝 움직임(파란 화살표)이 보여요. 표 L(이미지 자코비안)의 숫자는 손끝을 1 mm 옮길 때 블록이 사진에서 몇 px 움직이는지예요.'
            : '활동 2 와 같은 루프에서 이득 K 만 9 로 올렸어요. 사진이 0.2 s 늦게 들어오니, 늦은 오차를 보고 세게 고치면 블록을 지나쳤다 되돌아오기를 되풀이해요(이득 K × 지연 τ(0.2 s) 가 π/2 ≈ 1.57 을 넘으면, 곧 K 가 약 7.9 /s 를 넘으면 흔들림이 커져요).'}
      </p>
    </section>
  );
}
