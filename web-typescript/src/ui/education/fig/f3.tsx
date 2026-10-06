/** Figures for 학문 3 미분기구학 · 궤적 생성 (그림 제작 요청서 §2; numbers from content-markdown/3-미분기구학궤적.md). */

import type { ReactElement } from 'react';

import { Arm, Arrow, anim, Base, C, Check, Cross, Cube, Dividers, Dot, Floor, G, Graph, Level, Ln, P, Poly, T, Title, chain, cols, type Color, type FigureDef, type Panel, type Scale } from './kit';

type Pt = [number, number];

/* ─────────────────────────── motion profiles (the simulator's shapes) */

interface Prof {
  T: number;
  p(t: number): number;
  v(t: number): number;
  a(t: number): number;
}

/** Trapezoid (or triangle when short) from 0 to D with top speed vm and acceleration am. */
function trap(D: number, vm: number, am: number): Prof {
  const v = D < (vm * vm) / am ? Math.sqrt(D * am) : vm;
  const ta = v / am;
  const T = D / v + ta;
  return {
    T,
    p: (t) => (t <= 0 ? 0 : t >= T ? D : t < ta ? 0.5 * am * t * t : t > T - ta ? D - 0.5 * am * (T - t) ** 2 : 0.5 * am * ta * ta + v * (t - ta)),
    v: (t) => (t <= 0 || t >= T ? 0 : t < ta ? am * t : t > T - ta ? am * (T - t) : v),
    a: (t) => (t <= 0 || t >= T ? 0 : t < ta ? am : t > T - ta ? -am : 0),
  };
}

/** Quintic (S자) from 0 to D in T: rest to rest, acceleration zero at both ends. */
function quintic(D: number, T: number): Prof {
  const u = (t: number) => Math.min(1, Math.max(0, t / T));
  return {
    T,
    p: (t) => D * (10 * u(t) ** 3 - 15 * u(t) ** 4 + 6 * u(t) ** 5),
    v: (t) => (t <= 0 || t >= T ? 0 : (D / T) * (30 * u(t) ** 2 - 60 * u(t) ** 3 + 30 * u(t) ** 4)),
    a: (t) => (t <= 0 || t >= T ? 0 : (D / (T * T)) * (60 * u(t) - 180 * u(t) ** 2 + 120 * u(t) ** 3)),
  };
}

/** Sample f on [t0, t1] into graph points, clipped to [lo, hi]. */
const plot = (s: Scale, f: (t: number) => number, t0: number, t1: number, n = 160, lo = -Infinity, hi = Infinity): Pt[] =>
  Array.from({ length: n + 1 }, (_, i) => {
    const t = t0 + ((t1 - t0) * i) / n;
    return [s.sx(t), s.sy(Math.min(hi, Math.max(lo, f(t))))];
  });

/* ─────────────────────────── 3-1 속도와 자코비안 */

/** Side view: J2 → J3 → J4 → tip, mm (110 · 96 · 60), drawn at K px/mm. */
const K31 = 1.3;
const L31 = [110, 96, 60];
/** A comfortable pose (J2 → tip 200 mm) and the arm stretched almost straight. */
const NORMAL31 = [55, -63, -42];
const STRAIGHT31 = [8, -5, -3];
const OMEGA = (30 * Math.PI) / 180; // 30°/s
const LIMIT_DEG_S = 200;
const DRIVE_MM_S = 40;

/** Velocity direction (screen px) of point q when the joint at j turns counter-clockwise at 1 rad/s. */
const spin = (j: Pt, q: Pt): Pt => [q[1] - j[1], -(q[0] - j[0])];

/** Joint speeds (rad/s) of J2, J3 that move the tip +x at DRIVE_MM_S (wrist held). */
function mix(pts: Pt[]): [number, number] {
  const tip = pts[3];
  const [a, b] = [spin(pts[0], tip), spin(pts[1], tip)].map(([x, y]) => [x / K31, -y / K31]);
  const det = a[0] * b[1] - b[0] * a[1];
  return [(DRIVE_MM_S * b[1]) / det, (-DRIVE_MM_S * a[1]) / det];
}

/** Horizontal speed bars with the joint limit line (B, C) or plain (A). */
function Bars31({ x, y, rows, max, limit }: { x: number; y: number; rows: { label: string; v: number; c: Color }[]; max: number; limit?: string }) {
  const w = 300;
  return (
    <g>
      {rows.map((r, i) => (
        <g key={r.label}>
          <T x={x - 14} y={y + i * 48 + 10} a="end" s={28} b>
            {r.label}
          </T>
          <rect x={x} y={y + i * 48 - 14} width={w} height={28} fill="none" stroke={C.light} strokeWidth={3} />
          <rect x={x} y={y + i * 48 - 14} width={Math.max(0, Math.min(1, r.v / max)) * w} height={28} fill={C[r.c]} {...anim('pop', 0.6 + i * 0.15)} />
        </g>
      ))}
      {limit && (
        <g>
          <line x1={x + w} x2={x + w} y1={y - 34} y2={y + rows.length * 48 - 20} stroke={C.red} strokeWidth={4} strokeDasharray="10 8" />
          <T x={x + w} y={y - 42} a="end" s={28} c="red" b>
            {limit}
          </T>
        </g>
      )}
    </g>
  );
}

function armAt(p: Panel, ang: number[], j2y = 430, j2x = 110): { pts: Pt[]; base: Pt; floor: number } {
  const j2: Pt = [p.x + j2x, p.y + j2y];
  const pts = chain(j2[0], j2[1], L31.map((l) => l * K31), ang);
  return { pts, base: [j2[0], j2[1] + 96], floor: j2[1] + 96 };
}

function Robot31({ arm, ghost }: { arm: { pts: Pt[]; base: Pt; floor: number }; ghost?: boolean }) {
  return (
    <g>
      <Floor x1={arm.base[0] - 50} x2={arm.base[0] + 120} y={arm.floor} />
      <Base x={arm.base[0]} y={arm.floor} s={0.8} />
      <Arm pts={[[arm.base[0], arm.floor - 24], ...arm.pts]} w={20} c={ghost ? 'gray' : 'ink'} />
    </g>
  );
}

const p31 = cols(3);
export const fig31: FigureDef = {
  label: '관절 하나만 30°/s 로 돌 때 손끝 속도 화살표(축에서 멀수록 김), J2·J3 몫을 더해 앞으로 40 mm/s, 팔을 쭉 펴면 앞쪽 화살표가 없어 관절 속도가 한계 200°/s 에 걸림',
  caption: '관절 속도에서 손끝 속도로 — 관절 하나의 화살표 (30°/s) · 두 관절을 섞어 앞으로 40 mm/s · 팔을 쭉 편 특이점 (관절 한계 200°/s)',
  symbols: ['v', 'r', 'ω'],
  panels: p31.map((p, i) => ({ ...p, title: ['관절 하나', '섞어서 한 방향', '특이점 근처'][i] })),
  draw: () => {
    const [pa, pb, pc] = p31;
    /* A — one joint at a time: arrows ∝ distance from the axis. */
    const A = armAt(pa, NORMAL31, 395);
    const tipA = A.pts[3];
    const S = 1.8; // px per mm/s
    const colA = [0, 1, 2].map((j) => {
      const d = spin(A.pts[j], tipA);
      return [(d[0] / K31) * OMEGA * S, (d[1] / K31) * OMEGA * S] as Pt;
    });
    const rA = Math.hypot(tipA[0] - A.pts[0][0], tipA[1] - A.pts[0][1]) / K31;
    const tipSpeed = [0, 1, 2].map((j) => (Math.hypot(tipA[0] - A.pts[j][0], tipA[1] - A.pts[j][1]) / K31) * OMEGA);

    /* B — the same pose, J2 + J3 mixed to go +x. */
    const B = armAt(pb, NORMAL31, 395, 60);
    const tipB = B.pts[3];
    const [w2, w3] = mix(B.pts);
    const F = 2.4; // px per mm/s
    const sh2 = spin(B.pts[0], tipB).map((v) => (v / K31) * w2 * F) as Pt;
    const sh3 = spin(B.pts[1], tipB).map((v) => (v / K31) * w3 * F) as Pt;
    const sumB: Pt = [tipB[0] + sh2[0] + sh3[0], tipB[1] + sh2[1] + sh3[1]];

    /* C — stretched out: both arrows across the arm, none along it; the mix saturates at the limit. */
    const Cc = armAt(pc, STRAIGHT31, 395, 40);
    const tipC = Cc.pts[3];
    const [c2, c3] = mix(Cc.pts).map((w) => (Math.abs(w) * 180) / Math.PI);
    const kC = Math.min(1, LIMIT_DEG_S / Math.max(c2, c3));
    const colC = [0, 1].map((j) => spin(Cc.pts[j], tipC).map((v) => (v / K31) * OMEGA * 1.1) as Pt);
    const deg = (w: number) => (Math.abs(w) * 180) / Math.PI;
    const bc = (v: number): Color => (v >= LIMIT_DEG_S - 1 ? 'red' : v >= 0.7 * LIMIT_DEG_S ? 'orange' : 'blue');

    return (
      <g>
        <Dividers panels={p31} />
        {/* A */}
        <Title p={pa}>A 관절 하나 (30°/s)</Title>
        <Robot31 arm={A} />
        <Ln x1={A.pts[0][0]} y1={A.pts[0][1]} x2={tipA[0]} y2={tipA[1]} c="gray" w={3} dash />
        <T x={(A.pts[0][0] + tipA[0]) / 2 + 30} y={(A.pts[0][1] + tipA[1]) / 2 + 58} s={28} c="ink" b>
          r = {Math.round(rA / 10) * 10} mm
        </T>
        <Arrow x1={tipA[0]} y1={tipA[1]} x2={tipA[0] + colA[2][0]} y2={tipA[1] + colA[2][1]} c="gray" w={5} an={0.9} />
        <Arrow x1={tipA[0]} y1={tipA[1]} x2={tipA[0] + colA[1][0]} y2={tipA[1] + colA[1][1]} c="gray" w={5} an={0.6} />
        <Arrow x1={tipA[0]} y1={tipA[1]} x2={tipA[0] + colA[0][0]} y2={tipA[1] + colA[0][1]} c="blue" w={7} an={0.3} />
        <T x={tipA[0] + colA[0][0] - 14} y={tipA[1] + colA[0][1] - 18} a="end" s={30} c="blue" b delay={0.5}>
          J2 ≈ 105 mm/s
        </T>
        <T x={tipA[0] + colA[1][0] + 12} y={tipA[1] + colA[1][1] - 8} a="start" s={28} delay={0.8}>
          J3
        </T>
        <T x={tipA[0] + colA[2][0] + 12} y={tipA[1] + colA[2][1] + 6} a="start" s={28} delay={1.1}>
          J4
        </T>
        <Dot x={tipA[0]} y={tipA[1]} rr={8} c="blue" />
        <Bars31
          x={pa.x + 150}
          y={pa.y + 640}
          max={tipSpeed[0] * 1.05}
          rows={[
            { label: 'J2', v: tipSpeed[0], c: 'blue' },
            { label: 'J3', v: tipSpeed[1], c: 'gray' },
            { label: 'J4', v: tipSpeed[2], c: 'gray' },
            { label: 'J6', v: 0, c: 'gray' },
          ]}
        />
        <T x={pa.x + 160} y={pa.y + 585} a="start" s={28} c="ink">
          손끝 속도 (mm/s)
        </T>
        <T x={pa.x + 464} y={pa.y + 794} a="start" s={28} b>
          0
        </T>
        <T x={pa.x + pa.w / 2} y={pa.y + pa.h - 30} s={32} b c="blue">
          v = r × ω
        </T>

        {/* B */}
        <Title p={pb}>B 섞어서 +x 앞</Title>
        <ellipse cx={tipB[0]} cy={tipB[1]} rx={95} ry={72} fill="none" stroke={C.gray} strokeWidth={3} strokeDasharray="10 8" />
        <T x={tipB[0] - 100} y={tipB[1] + 96} a="end" s={28} c="gray" b>
          둥글다
        </T>
        <Robot31 arm={B} />
        <Ln x1={tipB[0] + sh2[0]} y1={tipB[1] + sh2[1]} x2={sumB[0]} y2={sumB[1]} c="gray" w={3} dash />
        <Ln x1={tipB[0] + sh3[0]} y1={tipB[1] + sh3[1]} x2={sumB[0]} y2={sumB[1]} c="gray" w={3} dash />
        <Arrow x1={tipB[0]} y1={tipB[1]} x2={tipB[0] + sh2[0]} y2={tipB[1] + sh2[1]} c="ink" w={5} an={0.3} />
        <Arrow x1={tipB[0]} y1={tipB[1]} x2={tipB[0] + sh3[0]} y2={tipB[1] + sh3[1]} c="ink" w={5} an={0.6} />
        <Arrow x1={tipB[0]} y1={tipB[1]} x2={sumB[0]} y2={sumB[1]} c="blue" w={8} an={1.1} />
        <T x={tipB[0] + sh2[0] - 12} y={tipB[1] + sh2[1] + 30} a="middle" s={28} b delay={0.5}>
          J2 몫
        </T>
        <T x={tipB[0] + sh3[0] - 12} y={tipB[1] + sh3[1] - 16} a="middle" s={28} b delay={0.8}>
          J3 몫
        </T>
        <T x={sumB[0] + 16} y={sumB[1] + 11} a="start" s={30} c="blue" b delay={1.3}>
          앞으로
        </T>
        <Dot x={tipB[0]} y={tipB[1]} rr={8} c="blue" />
        <T x={pb.x + 160} y={pb.y + 585} a="start" s={28} c="ink">
          관절 속도 (°/s)
        </T>
        <Bars31
          x={pb.x + 150}
          y={pb.y + 690}
          max={LIMIT_DEG_S}
          limit="한계 200°/s"
          rows={[
            { label: 'J2', v: deg(w2), c: bc(deg(w2)) },
            { label: 'J3', v: deg(w3), c: bc(deg(w3)) },
          ]}
        />
        <T x={pb.x + pb.w / 2} y={pb.y + pb.h - 30} s={32} b c="blue">
          손끝 40 mm/s 곧게
        </T>

        {/* C */}
        <Title p={pc}>C 쭉 편 자세 — 특이점</Title>
        <ellipse cx={tipC[0]} cy={tipC[1]} rx={10} ry={96} fill="none" stroke={C.orange} strokeWidth={4} />
        <T x={tipC[0] - 22} y={tipC[1] + 96} a="end" s={28} c="orange" b>
          납작하다
        </T>
        <Robot31 arm={Cc} />
        <Arrow x1={tipC[0]} y1={tipC[1]} x2={tipC[0] + colC[0][0]} y2={tipC[1] + colC[0][1]} c="ink" w={5} an={0.3} />
        <Arrow x1={tipC[0]} y1={tipC[1]} x2={tipC[0] + colC[1][0]} y2={tipC[1] + colC[1][1]} c="ink" w={5} an={0.5} />
        <T x={tipC[0] + colC[0][0] + 16} y={tipC[1] + colC[0][1] + 10} a="start" s={28} b>
          J2
        </T>
        <T x={tipC[0] + colC[1][0] + 16} y={tipC[1] + colC[1][1] + 22} a="start" s={28} b>
          J3
        </T>
        <Arrow x1={tipC[0] + 46} y1={tipC[1]} x2={tipC[0] + 120} y2={tipC[1]} c="blue" w={5} dash />
        <Cross x={tipC[0] + 80} y={tipC[1]} s={16} an={1} />
        <T x={tipC[0] + 78} y={tipC[1] + 56} a="middle" s={28} c="red" b delay={1.1}>
          펴진 방향
        </T>
        <Dot x={tipC[0]} y={tipC[1]} rr={8} c="blue" />
        <T x={pc.x + 160} y={pc.y + 585} a="start" s={28} c="ink">
          관절 속도 (°/s)
        </T>
        <Bars31
          x={pc.x + 150}
          y={pc.y + 690}
          max={LIMIT_DEG_S}
          limit="한계 200°/s"
          rows={[
            { label: 'J2', v: c2 * kC, c: bc(c2 * kC) },
            { label: 'J3', v: c3 * kC, c: bc(c3 * kC) },
          ]}
        />
        <T x={pc.x + pc.w / 2} y={pc.y + pc.h - 30} s={32} b c="red">
          손끝 40 mm/s 보다 느림
        </T>
      </g>
    );
  },
};

/* ─────────────────────────── 3-2 위치 → 속도 → 가속도 */

const D32 = 220;
const PROF32 = { A: quintic(D32, 0.12), B: trap(D32, 282, 30000), C: trap(D32, 300, 3000), S: quintic(D32, 1.0) };

/** The tray (seen from the side) carrying a block; `shift` px along the tray, or `fall`. */
function Tray({ cx, y, block, c }: { cx: number; y: number; block: 'fall' | 'slid' | 'stay'; c: Color }) {
  const s = 54;
  return (
    <g>
      <Arrow x1={cx - 110} y1={y - 120} x2={cx + 110} y2={y - 120} c="gray" w={5} />
      <T x={cx} y={y - 140} s={28} c="gray">
        220 mm
      </T>
      <Ln x1={cx - 140} y1={y} x2={cx + 140} y2={y} w={10} />
      <Ln x1={cx} y1={y + 6} x2={cx - 70} y2={y + 80} w={18} />
      <circle cx={cx} cy={y + 12} r={11} fill={C.white} stroke={C.ink} strokeWidth={5} />
      {block === 'stay' && <Cube x={cx - s / 2} y={y - 5 - s} s={s} c={c} />}
      {block !== 'stay' && <Cube x={cx - s / 2} y={y - 5 - s} s={s} c="gray" dash />}
      {block === 'slid' && (
        <g {...anim('pop', 1)}>
          <Cube x={cx - s / 2 + 26} y={y - 5 - s} s={s} c={c} />
        </g>
      )}
      {block === 'fall' && (
        <g {...anim('pop', 1)}>
          <Cube x={cx + 150} y={y + 20} s={s} c={c} tilt={35} />
          <Arrow x1={cx + 150} y1={y - 30} x2={cx + 200} y2={y + 8} c="red" w={5} />
        </g>
      )}
    </g>
  );
}

const p32 = cols(3, 0, 830);
export const fig32: FigureDef = {
  label: '같은 220 mm 를 위치만(0.12 s, 떨어짐) · 일정 속도(0.79 s, 약 9 mm 밀림) · 가속도 제한(0.83 s, 그대로)으로 옮길 때 판의 속도 그래프와 블록',
  caption: '판 위 블록을 220 mm 옮기는 세 시간 계획 — 위치만 0.12 s · 일정 속도 0.79 s · 가속도 제한 0.83 s (미끄러지는 경계 μg ≈ 4.9 m/s²)',
  symbols: ['μ', 'g'],
  panels: p32.map((p, i) => ({ ...p, title: ['위치만', '일정 속도', '가속도 제한'][i] })),
  draw: () => {
    const g = (p: Panel, body: (s: Scale) => ReactElement) => (
      <Graph x={p.x + 100} y={p.y + 150} w={360} h={230} xMax={1.4} yMax={450} xLabel="시간(s)" yLabel="속도(mm/s)" xTicks={[0, 0.5, 1]} yTicks={[0, 200, 400]}>
        {body}
      </Graph>
    );
    const [pa, pb, pc] = p32;
    const res = [
      { acc: '가속도 > 80 m/s²', c: 'red' as Color, block: 'fall' as const, word: '떨어짐' },
      { acc: '가속도 30 m/s²', c: 'orange' as Color, block: 'slid' as const, word: '약 9 mm 밀림' },
      { acc: '가속도 3 m/s²', c: 'blue' as Color, block: 'stay' as const, word: '그대로' },
    ];
    return (
      <g>
        <Dividers panels={p32} />
        <Title p={pa}>A 위치만</Title>
        <Title p={pb}>B 일정 속도</Title>
        <Title p={pc}>C 가속도 제한</Title>
        {g(pa, (s) => (
          <g>
            <Poly pts={plot(s, PROF32.A.v, 0, 1.3, 650, 0, 450)} c="red" w={6} an={0.2} />
            <Arrow x1={s.sx(0.2)} y1={s.sy(330)} x2={s.sx(0.2)} y2={s.sy(450)} c="red" w={5} an={0.8} />
            <T x={s.sx(0.12) + 52} y={s.sy(250)} a="start" s={30} c="red" b delay={1}>
              0.12 s
            </T>
          </g>
        ))}
        {g(pb, (s) => (
          <g>
            <Poly pts={plot(s, PROF32.B.v, 0, 1.3, 520)} c="orange" w={6} an={0.2} />
            <T x={s.sx(0.79) + 12} y={s.sy(282) - 14} a="start" s={30} c="orange" b delay={1.4}>
              0.79 s
            </T>
          </g>
        ))}
        {g(pc, (s) => (
          <g>
            <Poly pts={plot(s, PROF32.S.v, 0, 1.3, 200)} c="blue" w={4} dash />
            <Poly pts={plot(s, PROF32.C.v, 0, 1.3, 260)} c="blue" w={6} an={0.2} />
            <T x={s.sx(0.45)} y={s.sy(120)} a="middle" s={30} c="blue" b delay={1.4}>
              0.83 s
            </T>
            <T x={s.sx(1.02)} y={s.sy(150)} a="start" s={28} c="blue" delay={1.6}>
              S자
            </T>
            <T x={s.sx(1.02)} y={s.sy(150) + 34} a="start" s={28} c="blue" delay={1.6}>
              1.00 s
            </T>
          </g>
        ))}
        {p32.map((p, i) => (
          <g key={i}>
            <T x={p.x + p.w / 2} y={p.y + 500} s={30} b c={res[i].c} delay={1.2}>
              {res[i].acc}
            </T>
            <Tray cx={p.x + p.w / 2 - 20} y={p.y + 690} block={res[i].block} c={res[i].c} />
            <T x={p.x + p.w / 2} y={p.y + p.h - 18} s={34} b c={res[i].c} delay={1.4}>
              {res[i].word}
            </T>
          </g>
        ))}
        <Ln x1={24} x2={1576} y1={836} y2={836} c="light" w={3} />
        <T x={800} y={878} s={32} b>
          μ = 0.5 → 한계 가속도 μg ≈ 4.9 m/s²
        </T>
      </g>
    );
  },
};

/* ─────────────────────────── 3-3 경유점 잇기 */

/** The square the simulator runs (80 × 140 mm), top view, at 1.6 px/mm: 1 → 2 → 3 → 4 → 1. */
const V33 = 150; // mm/s
const A33 = 600; // mm/s²
const SIDES = [80, 140, 80, 140];
const R33 = 20; // 둥글기, mm
const CUT = 2 * R33 - (Math.PI / 2) * R33; // path shortened per rounded corner
const KINDS33 = {
  A: (() => {
    const segs = SIDES.map((d) => trap(d, V33, A33));
    const T = segs.reduce((s, p) => s + p.T, 0);
    const at = (t: number) => {
      let t0 = 0;
      for (const sg of segs) {
        if (t <= t0 + sg.T) return { v: sg.v(t - t0), a: Math.abs(sg.a(t - t0)) };
        t0 += sg.T;
      }
      return { v: 0, a: 0 };
    };
    return { T, v: (t: number) => at(t).v, a: (t: number) => at(t).a };
  })(),
  B: (() => {
    const pr = trap(440, V33, A33);
    const ts = [80, 220, 300].map((s) => 0.25 + (s - 18.75) / V33);
    return { T: pr.T, v: pr.v, a: (t: number) => Math.abs(pr.a(t)), spikes: ts };
  })(),
  C: (() => {
    const pr = trap(440 - 3 * CUT, V33, A33);
    const arcs = [80, 220, 300].map((s, k) => {
      const s0 = s - R33 - k * CUT;
      return [0.25 + (s0 - 18.75) / V33, 0.25 + (s0 + (Math.PI / 2) * R33 - 18.75) / V33] as const;
    });
    return { T: pr.T, v: pr.v, a: (t: number) => (arcs.some(([a, b]) => t >= a && t <= b) ? (V33 * V33) / R33 / 1000 : Math.abs(pr.a(t)) / 1000) };
  })(),
};

/** Lightning mark (acceleration jump) at a corner. */
const Bolt = ({ x, y, an }: { x: number; y: number; an?: number }) => (
  <G an={an}>
    <Poly pts={[[x - 6, y - 26], [x + 8, y - 4], [x - 6, y + 2], [x + 8, y + 26]]} c="red" w={6} />
  </G>
);

const p33 = cols(3);
export const fig33: FigureDef = {
  label: '80 × 140 mm 네모의 경유점 1~4 를 멈추며(3.9 s) · 꺾어서(3.2 s, 가속도 12.7 m/s²) · 둥글게(3.0 s, 1.1 m/s², 8.3 mm 비켜 감) 지날 때 길과 속도·가속도 그래프',
  caption: '네모 길의 경유점 잇기 — 점마다 멈춤 3.9 s · 꺾어 가기 3.2 s (가속도 12.7 m/s²) · 둥글기 20 mm 로 잇기 3.0 s (1.1 m/s², 8.3 mm 비켜 감)',
  symbols: [],
  panels: p33.map((p, i) => ({ ...p, title: ['점마다 멈춤', '꺾어 가기', '둥글게 잇기'][i] })),
  draw: () => (
    <g>
      <Dividers panels={p33} />
      {p33.map((p, i) => {
        const k = (['A', 'B', 'C'] as const)[i];
        const cx = p.x + p.w / 2 - 10;
        const top = p.y + 130;
        const sw = 140 * 1.6;
        const sh = 80 * 1.6;
        const pt: Pt[] = [
          [cx + sw / 2, top + sh],
          [cx + sw / 2, top],
          [cx - sw / 2, top],
          [cx - sw / 2, top + sh],
        ];
        const r = R33 * 1.6;
        const round = `M${pt[0][0]} ${pt[0][1]} L${pt[1][0]} ${pt[1][1] + r} A${r} ${r} 0 0 0 ${pt[1][0] - r} ${pt[1][1]} L${pt[2][0] + r} ${pt[2][1]} A${r} ${r} 0 0 0 ${pt[2][0]} ${pt[2][1] + r} L${pt[3][0]} ${pt[3][1] - r} A${r} ${r} 0 0 0 ${pt[3][0] + r} ${pt[3][1]} L${pt[0][0]} ${pt[0][1]}`;
        const mid: Pt = [pt[1][0] - r + r / Math.SQRT2, pt[1][1] + r - r / Math.SQRT2];
        const kind = KINDS33[k];
        return (
          <g key={k}>
            <Title p={p}>{['A 점마다 멈춤', 'B 꺾어 가기', 'C 둥글게 (20 mm)'][i]}</Title>
            {k === 'C' ? <Poly pts={[...pt, pt[0]]} c="gray" w={3} dash /> : null}
            {k === 'C' ? <P d={round} c="blue" w={6} an={0.2} /> : <Poly pts={[...pt, pt[0]]} c={k === 'A' ? 'ink' : 'ink'} w={6} an={0.2} />}
            {pt.map(([x, y], j) => (
              <g key={j}>
                <Dot x={x} y={y} rr={11} c="ink" hollow={!(k === 'A' && j > 0)} />
                <T x={x + (j === 0 || j === 1 ? -22 : 22)} y={y + (j === 1 || j === 2 ? 38 : -16)} a={j === 0 || j === 1 ? 'end' : 'start'} s={28} b>
                  {String(j + 1)}
                </T>
              </g>
            ))}
            {k === 'A' && (
              <T x={cx} y={top + sh + 48} s={28} c="ink" delay={1}>
                ● = 속도 0
              </T>
            )}
            {k === 'B' && [1, 2, 3].map((j) => <Bolt key={j} x={pt[j][0] + (j === 1 ? 30 : -30)} y={pt[j][1] + (j === 3 ? 30 : -30)} an={0.6 + j * 0.3} />)}
            {k === 'C' && (
              <G an={1.2}>
                <Ln x1={pt[1][0]} y1={pt[1][1]} x2={mid[0]} y2={mid[1]} c="red" w={4} />
                <T x={pt[1][0] + 18} y={pt[1][1] - 18} a="start" s={28} c="red" b>
                  8.3 mm
                </T>
              </G>
            )}
            <Graph x={p.x + 100} y={p.y + 380} w={350} h={120} xMax={4.3} yMax={200} xLabel="시간(s)" yLabel="속도(mm/s)" xTicks={[0, 1, 2, 3]} yTicks={[0, 150]}>
              {(s) => (
                <g>
                  <Poly pts={plot(s, kind.v, 0, 4.3, 400)} c="blue" w={5} an={0.4} />
                  <T x={s.sx(kind.T) + 4} y={s.sy(150) - 12} a="start" s={28} b c={k === 'A' ? 'orange' : 'blue'} delay={1.2}>
                    {['3.9 s', '3.2 s', '3.0 s'][i]}
                  </T>
                </g>
              )}
            </Graph>
            <Graph x={p.x + 100} y={p.y + 620} w={350} h={150} xMax={4.3} yMax={14} xLabel="시간(s)" yLabel="가속도(m/s²)" xTicks={[0, 1, 2, 3]} yTicks={[0]}>
              {(s) => (
                <g>
                  <Level s={s} v={4.9} c="orange" />
                  <T x={s.x + s.w} y={s.sy(4.9) - 10} a="end" s={28} c="orange">
                    블록 한계 4.9
                  </T>
                  {k === 'A' && <Poly pts={plot(s, (t) => kind.a(t) / 1000, 0, 4.3, 600)} c="blue" w={4} an={0.6} />}
                  {k === 'B' && (
                    <g>
                      <Poly pts={plot(s, (t) => kind.a(t) / 1000, 0, 4.3, 600)} c="blue" w={4} an={0.6} />
                      {KINDS33.B.spikes.map((t, j) => (
                        <Ln key={j} x1={s.sx(t)} y1={s.sy(0)} x2={s.sx(t)} y2={s.sy(12.7)} c="red" w={6} an={0.8 + j * 0.2} />
                      ))}
                      <T x={s.sx(KINDS33.B.spikes[2]) + 14} y={s.sy(12.7) + 20} a="start" s={28} c="red" b delay={1.4}>
                        {'12.7 m/s²'}
                      </T>
                    </g>
                  )}
                  {k === 'C' && (
                    <g>
                      <Poly pts={plot(s, kind.a, 0, 4.3, 800)} c="blue" w={4} an={0.6} />
                      <T x={s.sx(1.5)} y={s.sy(1.1) - 14} a="middle" s={28} c="blue" b delay={1.4}>
                        1.1
                      </T>
                    </g>
                  )}
                </g>
              )}
            </Graph>
            <T x={p.x + p.w / 2} y={p.y + p.h - 22} s={32} b c={['orange', 'red', 'blue'][i] as Color}>
              {['3.9 s · 가장 느림', '3.2 s · 가속도 튐', '3.0 s · 8.3 mm 비켜 감'][i]}
            </T>
          </g>
        );
      })}
    </g>
  ),
};

/* ─────────────────────────── 3-4 관절 동기화 */

/** The simulator's move: J1 90°, J3 60°, J2 30° (wrist a little), each joint 90°/s and 300°/s² at most. */
const P34 = [-45, 10, -80];
const DQ34 = [90, -30, 60];
const ALONE = DQ34.map((d) => trap(Math.abs(d), 90, 300));
const T34 = ALONE[0].T; // J1, 1.30 s
const SYNC = { B: quintic(1, 2), C: trap(1, 1, 300 / 90) };

/** Joint angles at t for each try. */
const q34 = (k: 'A' | 'B' | 'C', t: number) => (k === 'A' ? DQ34.map((d, i) => P34[i] + Math.sign(d) * ALONE[i].p(t)) : DQ34.map((d, i) => P34[i] + d * SYNC[k].p(t)));

/** Tool point seen from the front-above: J1 sweeps it sideways, J2/J3 change its reach and height (mm, 110 · 150 links). */
function tool34(q: number[]): [number, number, number] {
  const [a1, a2, a3] = q.map((d) => (d * Math.PI) / 180);
  const r = 110 * Math.sin(-a2) + 150 * Math.sin(-a2 - a3);
  const z = 110 * Math.cos(a2) + 150 * Math.cos(a2 + a3);
  return [r * Math.cos(a1), r * Math.sin(a1), z];
}

/** Scale and centring of the tool traces (fitted to A's, the same for all three). */
const TRACE = (() => {
  const raw = Array.from({ length: 121 }, (_, j) => tool34(q34('A', (T34 * j) / 120)));
  const xs = raw.map(([, y]) => -y);
  const ys = raw.map(([x, , z]) => x * 0.6 - z);
  const s = 340 / (Math.max(...xs) - Math.min(...xs));
  return { s, cx: (-s * (Math.max(...xs) + Math.min(...xs))) / 2, cy: (-s * (Math.max(...ys) + Math.min(...ys))) / 2 };
})();

const p34 = cols(3);
export const fig34: FigureDef = {
  label: 'J1 90° · J3 60° · J2 30° 를 따로(관절마다 다른 때 멈춤, 1.30 s, 꺾인 자취) · 모두 2 s(2.00 s, 매끄러움) · J1 에 맞춰(1.30 s, 매끄러움) 돌릴 때 관절 각 그래프와 손끝 자취',
  caption: '관절 동기화 — 따로 (관절마다 다른 때 멈춤) · 모두 2 s · 가장 오래 걸리는 J1 에 맞춤 1.30 s',
  symbols: [],
  panels: p34.map((p, i) => ({ ...p, title: ['따로', '모두 2 s', 'J1 에 맞춤'][i] })),
  draw: () => (
    <g>
      <Dividers panels={p34} />
      {p34.map((p, i) => {
        const k = (['A', 'B', 'C'] as const)[i];
        const col: Color = k === 'A' ? 'orange' : 'blue';
        const TT = k === 'B' ? 2 : T34;
        const order = [0, 2, 1]; // J1, J3, J2
        // Tool trace, projected: robot y → left, x → slightly down, z → up.
        const proj = ([x, y, z]: [number, number, number]): Pt => [p.x + p.w / 2 + TRACE.cx - y * TRACE.s, p.y + 650 + TRACE.cy + (x * 0.6 - z) * TRACE.s];
        const n = 120;
        const pts = Array.from({ length: n + 1 }, (_, j) => proj(tool34(q34(k, (TT * j) / n))));
        const stops = k === 'A' ? [1, 2].map((j) => ({ j, at: proj(tool34(q34('A', ALONE[j].T))) })) : [];
        return (
          <g key={k}>
            <Title p={p}>{['A 따로', 'B 모두 2 s', 'C J1 에 맞춤'][i]}</Title>
            <Graph x={p.x + 100} y={p.y + 140} w={330} h={250} xMax={2.6} yMax={95} xLabel="시간(s)" yLabel="관절 각(°)" xTicks={[0, 1, 2]} yTicks={[0, 30, 60, 90]}>
              {(s) => (
                <g>
                  <Ln x1={s.sx(TT)} y1={s.sy(0)} x2={s.sx(TT)} y2={s.sy(95)} c="gray" w={3} dash />
                  <T x={s.sx(TT)} y={s.sy(95) - 4} s={28} b c={col}>
                    {k === 'B' ? '2.00 s' : '1.30 s'}
                  </T>
                  {order.map((j, m) => {
                    const f = (t: number) => (k === 'A' ? ALONE[j].p(t) : Math.abs(DQ34[j]) * SYNC[k].p(t));
                    const tEnd = k === 'A' ? ALONE[j].T : TT;
                    return (
                      <g key={j}>
                        <Poly pts={plot(s, f, 0, 2.6, 160)} c={col} w={j === 0 ? 7 : 4} an={0.2 + m * 0.2} />
                        <Dot x={s.sx(tEnd)} y={s.sy(Math.abs(DQ34[j]))} rr={9} c={col} an={0.9 + m * 0.2} />
                        <T x={s.x + s.w + 12} y={s.sy(Math.abs(DQ34[j])) + 10} a="start" s={28} b>
                          {`J${j + 1}`}
                        </T>
                      </g>
                    );
                  })}
                  {k === 'C' && (
                    <T x={s.sx(TT) + 14} y={s.sy(90) + 44} a="start" s={28} c="blue" b>
                      J1 기준
                    </T>
                  )}
                </g>
              )}
            </Graph>
            <T x={p.x + 60} y={p.y + 520} a="start" s={28} c="ink">
              손끝 자취
            </T>
            <Dot x={pts[0][0]} y={pts[0][1]} rr={10} c="gray" />
            <T x={pts[0][0] + 20} y={pts[0][1] + 10} a="start" s={28} c="gray">
              출발
            </T>
            <Poly pts={pts} c={col} w={6} an={0.6} />
            <Dot x={pts[n][0]} y={pts[n][1]} rr={10} c="ink" />
            <T x={pts[n][0] - 20} y={pts[n][1] + 10} a="end" s={28}>
              도착
            </T>
            {stops.map(({ j, at }) => (
              <g key={j}>
                <Dot x={at[0]} y={at[1]} rr={11} c="red" hollow an={1.4} />
                <T x={at[0] + (j === 1 ? -20 : 70)} y={at[1] + (j === 1 ? 40 : -22)} a={j === 1 ? 'end' : 'middle'} s={28} c="red" b delay={1.5}>
                  {`J${j + 1} 멈춤`}
                </T>
              </g>
            ))}
            {k !== 'A' && <Check x={p.x + p.w - 80} y={p.y + 560} an={1.4} />}
            <T x={p.x + p.w / 2} y={p.y + 815} s={30} b c={col}>
              {['멈춘 시각 제각각', '동시에 멈춤', '동시에 멈춤'][i]}
            </T>
            <T x={p.x + p.w / 2} y={p.y + p.h - 26} s={34} b c={col}>
              {['총 1.30 s · 꺾임', '총 2.00 s · 매끄러움', '총 1.30 s · 매끄러움'][i]}
            </T>
          </g>
        );
      })}
    </g>
  ),
};

export const FIGS3: Record<string, FigureDef> = { '3-1': fig31, '3-2': fig32, '3-3': fig33, '3-4': fig34 };
