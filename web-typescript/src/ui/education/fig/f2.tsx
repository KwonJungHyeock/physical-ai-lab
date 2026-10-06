/** Figures for 학문 2 기구학 & 역기구학 (그림 제작 요청서 §2; 원고 2-기구학역기구학.md 의 그림·실습이 기준). */

import type { ReactElement, ReactNode } from 'react';

import { Arc, Arm, Arrow, Axes3, Base, C, Cross, Dividers, Dot, Floor, G, Graph, Gripper, Level, Ln, P, Poly, T, Title, anim, cols, oblique, rad, type Color, type FigureDef, type Panel } from './kit';

type Pt = [number, number];

/** Two bottom lines of a panel: the result (coloured) and the summary (bold). */
function Foot({ p, result, sum, c = 'blue', sumC = 'ink' }: { p: Panel; result?: ReactNode; sum: ReactNode; c?: Color; sumC?: Color }) {
  return (
    <g>
      {result && (
        <T x={p.x + p.w / 2} y={p.y + p.h - 92} s={30} b c={c} delay={1.6}>
          {result}
        </T>
      )}
      <T x={p.x + p.w / 2} y={p.y + p.h - 36} s={36} b c={sumC}>
        {sum}
      </T>
    </g>
  );
}

/** Labels drawn over lines: a white outline keeps them readable. */
function Halo({ children }: { children: ReactElement | ReactElement[] }) {
  return (
    <g stroke={C.white} strokeWidth={9} strokeLinejoin="round" style={{ paintOrder: 'stroke' }}>
      {children}
    </g>
  );
}

/** A small side-view frame: x (red) at `ang` degrees (y up), z (blue) 90° further. */
function Frame2({ x, y, ang = 0, len = 46, ghost }: { x: number; y: number; ang?: number; len?: number; ghost?: boolean }) {
  const ex: Pt = [x + len * Math.cos(rad(ang)), y - len * Math.sin(rad(ang))];
  const ez: Pt = [x + len * Math.cos(rad(ang + 90)), y - len * Math.sin(rad(ang + 90))];
  return (
    <g>
      <Arrow x1={x} y1={y} x2={ex[0]} y2={ex[1]} c={ghost ? 'gray' : 'axisX'} w={4} />
      <Arrow x1={x} y1={y} x2={ez[0]} y2={ez[1]} c={ghost ? 'gray' : 'axisZ'} w={4} />
      <circle cx={x} cy={y} r={6} fill={C.ink} />
    </g>
  );
}

/** A curved arrow from a to b, bulging to the left of a → b by `bend` px. */
function Bend({ a, b, bend = 30, c = 'ink' }: { a: Pt; b: Pt; bend?: number; c?: Color }) {
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
  const L = Math.hypot(dx, dy) || 1;
  const m: Pt = [(a[0] + b[0]) / 2 + (dy / L) * bend, (a[1] + b[1]) / 2 - (dx / L) * bend];
  const pts: Pt[] = Array.from({ length: 21 }, (_, i) => {
    const t = i / 20;
    return [(1 - t) ** 2 * a[0] + 2 * (1 - t) * t * m[0] + t * t * b[0], (1 - t) ** 2 * a[1] + 2 * (1 - t) * t * m[1] + t * t * b[1]];
  });
  return (
    <g>
      <Poly pts={pts.slice(2, 19)} c={c} w={3} />
      <Arrow x1={pts[17][0]} y1={pts[17][1]} x2={pts[19][0]} y2={pts[19][1]} c={c} w={3} />
    </g>
  );
}

/* ─────────────── 2-1 좌표 변환과 순기구학: A 행렬 1개 · B 행렬 2개(순서) · C 행렬 6개 */
const p21 = cols(3);
export const fig21: FigureDef = {
  label: 'J1 을 돌리면 T₀¹ 의 회전 3×3 만 바뀌고 위치 열은 그대로, T₀¹·T₁² 와 순서를 바꾼 T₁²·T₀¹ 은 다른 위치, 바닥 {0} 부터 플랜지 {6} 까지 6개를 곱하고 그리퍼 끝은 58 mm 더',
  caption: '순기구학 — 관절 행렬을 바닥부터 차례로 곱하기: T₀¹ 하나 · T₀¹·T₁² · T₀¹ … T₅⁶ (그리퍼 끝 = 플랜지 + 58 mm)',
  symbols: ['T₀¹', 'T₁²', 'T₀²', 'T₀⁶', 'T₅⁶', 'θ₁'],
  panels: p21.map((p, i) => ({ ...p, title: ['행렬 1개 — T₀¹', '행렬 2개 — 곱하는 순서', '행렬 6개 — T₀⁶'][i] })),
  draw: () => {
    const [pa, pb, pc] = p21;
    // A: {0} on the base, {1} on the J1 axis turned by θ₁.
    const o = oblique(pa.x + 230, pa.y + 410, 1);
    const th = 65;
    const at1 = o(0, 0, 190);
    const dir = (x: number, y: number, z: number, len: number): Pt => {
      const q = o(x * len, y * len, 190 + z * len);
      return [q[0], q[1]];
    };
    const axes1 = (t: number, ghost: boolean) => (
      <g>
        {[
          [Math.cos(rad(t)), Math.sin(rad(t)), 'axisX'],
          [-Math.sin(rad(t)), Math.cos(rad(t)), 'axisY'],
        ].map(([x, y, c], i) => {
          const e = dir(x as number, y as number, 0, 115);
          return <Arrow key={i} x1={at1[0]} y1={at1[1]} x2={e[0]} y2={e[1]} c={ghost ? 'gray' : (c as Color)} w={5} />;
        })}
      </g>
    );
    const cell = 92;
    const mx = pa.x + (pa.w - 4 * cell) / 2;
    const my = pa.y + 500;
    const M = [
      ['c', '−s', '0', 'x'],
      ['s', 'c', '0', 'y'],
      ['0', '0', '1', 'z'],
      ['0', '0', '0', '1'],
    ];
    // B: side view — {0} on the floor, {1} on top of the base, {2} at the shoulder.
    const fb = pb.y + 700;
    const bx = pb.x + 150;
    const F0: Pt = [bx, fb];
    const F1: Pt = [bx, fb - 110];
    const F2: Pt = [bx, fb - 200];
    const armB = (a: number): Pt[] => {
      const e: Pt = [F2[0] + 175 * Math.cos(rad(a)), F2[1] - 175 * Math.sin(rad(a))];
      return [F1, F2, e, [e[0] + 150 * Math.cos(rad(a - 105)), e[1] - 150 * Math.sin(rad(a - 105))]];
    };
    const wrong: Pt = [bx + 120, fb - 110];
    // C: the chain {0} … {6}, the flange and the tool tip 58 mm further.
    const X = pc.x;
    const Y = pc.y;
    const Fs: { p: Pt; ang: number; dx: number; dy: number }[] = [
      { p: [X + 110, Y + 720], ang: 0, dx: -26, dy: 10 },
      { p: [X + 110, Y + 630], ang: 0, dx: -26, dy: 10 },
      { p: [X + 110, Y + 545], ang: 20, dx: -26, dy: 10 },
      { p: [X + 170, Y + 345], ang: -15, dx: -24, dy: -10 },
      { p: [X + 330, Y + 300], ang: 0, dx: 0, dy: -60 },
      { p: [X + 430, Y + 300], ang: 0, dx: 34, dy: -40 },
      { p: [X + 430, Y + 420], ang: -90, dx: 34, dy: 10 },
    ];
    const tool: Pt = [X + 430, Y + 512];
    return (
      <g>
        <Dividers panels={p21} />
        {/* ── A */}
        <Title p={pa}>A 행렬 1개 — T₀¹</Title>
        <Ln x1={o(0, 0, 0)[0]} y1={o(0, 0, 0)[1]} x2={at1[0]} y2={at1[1]} w={18} />
        <Base x={o(0, 0, 0)[0]} y={o(0, 0, 0)[1]} s={0.9} />
        <Axes3 x={o(0, 0, 0)[0] - 130} y={o(0, 0, 0)[1] + 30} len={70} />
        {axes1(0, true)}
        <G an={0.4}>{axes1(th, false)}</G>
        <Arrow x1={at1[0]} y1={at1[1]} x2={at1[0]} y2={at1[1] - 110} c="axisZ" w={5} />
        <Poly pts={Array.from({ length: 21 }, (_, i) => dir(Math.cos(rad((th * i) / 20)), Math.sin(rad((th * i) / 20)), 0, 80))} c="ink" w={4} />
        <T x={dir(Math.cos(rad(20)), Math.sin(rad(20)), 0, 80)[0] + 30} y={dir(Math.cos(rad(20)), Math.sin(rad(20)), 0, 80)[1] + 6} s={30} b a="start">
          θ₁
        </T>
        <T x={at1[0] - 70} y={at1[1] + 30} s={30} b a="end">
          {'{1}'}
        </T>
        <T x={o(0, 0, 0)[0] - 56} y={o(0, 0, 0)[1] - 44} s={30} b a="end">
          {'{0}'}
        </T>
        <T x={pa.x + pa.w - 24} y={pa.y + 330} s={28} a="end">
          c = cos θ₁
        </T>
        <T x={pa.x + pa.w - 24} y={pa.y + 370} s={28} a="end">
          s = sin θ₁
        </T>
        {/* the 4 × 4 matrix */}
        <T x={mx + 1.5 * cell} y={my - 16} s={28} b c="blue">
          회전 3×3
        </T>
        <T x={mx + 3.5 * cell} y={my - 16} s={28} b c="orange">
          위치 열
        </T>
        <G an={0.9} kind="fade">
          <rect x={mx} y={my} width={3 * cell} height={3 * 58} rx={8} fill={C.blue} fillOpacity={0.14} stroke={C.blue} strokeWidth={4} />
        </G>
        <rect x={mx + 3 * cell + 8} y={my} width={cell - 8} height={3 * 58} rx={8} fill={C.orange} fillOpacity={0.12} stroke={C.orange} strokeWidth={4} />
        <rect x={mx} y={my + 3 * 58 + 6} width={4 * cell} height={52} rx={8} fill="none" stroke={C.gray} strokeWidth={3} />
        {M.map((row, i) =>
          row.map((v, j) => (
            <T key={`${i}${j}`} x={mx + (j + 0.5) * cell + (j === 3 ? 4 : 0)} y={my + i * 58 + 40 + (i === 3 ? 6 : 0)} s={30} b c={i === 3 ? 'gray' : j === 3 ? 'orange' : 'blue'}>
              {v}
            </T>
          )),
        )}
        <T x={mx + 1.5 * cell} y={my + 4 * 58 + 50} s={30} b c="blue" delay={1.2}>
          바뀜
        </T>
        <T x={mx + 3.5 * cell} y={my + 4 * 58 + 50} s={30} b c="orange" delay={1.2}>
          그대로
        </T>
        <Foot p={pa} sum="J1 → 3×3 만 바뀜" />

        {/* ── B */}
        <Title p={pb}>B 행렬 2개 — T₀² = T₀¹ · T₁²</Title>
        <Floor x1={pb.x + 30} x2={pb.x + pb.w - 30} y={fb} />
        <Arm pts={armB(105)} c="gray" w={16} />
        <Arm pts={armB(55)} w={18} an={0.3} />
        <Ln x1={F0[0]} y1={F0[1] - 26} x2={F1[0]} y2={F1[1]} w={18} />
        <Base x={F0[0]} y={F0[1]} s={0.9} />
        <Arc cx={F2[0]} cy={F2[1]} rr={70} from={100} to={62} head w={4} />
        <Halo>
          <T x={F2[0] + 19} y={F2[1] - 100} s={28} b>
            J2
          </T>
        </Halo>
        <T x={pb.x + pb.w - 24} y={pb.y + 132} s={28} b a="end">
          {'{2} 뒤 전부 따라 돎'}
        </T>
        <Frame2 x={F0[0]} y={F0[1] - 40} />
        <Frame2 x={F1[0]} y={F1[1]} />
        <Frame2 x={F2[0]} y={F2[1]} ang={20} />
        <Halo>
          <T x={F0[0] - 34} y={F0[1] - 32} s={28} b a="end">
            {'{0}'}
          </T>
          <T x={F1[0] - 34} y={F1[1] + 10} s={28} b a="end">
            {'{1}'}
          </T>
        </Halo>
        <Dot x={F2[0]} y={F2[1]} rr={14} c="blue" an={1.0} />
        <Ln x1={F2[0]} y1={F2[1]} x2={wrong[0]} y2={wrong[1]} c="gray" w={3} dash />
        <Cross x={wrong[0]} y={wrong[1]} c="red" an={1.4} />
        <Halo>
          <T x={F2[0] - 30} y={F2[1] + 10} s={30} b c="blue" a="end" delay={1}>
            T₀¹ · T₁²
          </T>
          <T x={wrong[0] + 30} y={wrong[1] + 10} s={30} b c="red" a="start" delay={1.4}>
            T₁² · T₀¹
          </T>
        </Halo>
        <Foot p={pb} result="순서 바꾸면 → 다른 위치" c="red" sum="곱하는 순서 = 바닥부터" />

        {/* ── C */}
        <Title p={pc}>C 행렬 6개 — T₀⁶</Title>
        <Floor x1={pc.x + 30} x2={pc.x + pc.w - 30} y={Fs[0].p[1]} />
        <Arm pts={Fs.slice(1).map((f) => f.p)} w={14} gripper={false} />
        <Ln x1={Fs[0].p[0]} y1={Fs[0].p[1] - 26} x2={Fs[1].p[0]} y2={Fs[1].p[1]} w={14} />
        <Base x={Fs[0].p[0]} y={Fs[0].p[1]} s={0.9} />
        <Gripper x={Fs[6].p[0]} y={Fs[6].p[1] + 26} angle={-90} />
        <Ln x1={Fs[6].p[0]} y1={Fs[6].p[1]} x2={Fs[6].p[0]} y2={Fs[6].p[1] + 26} w={10} />
        {Fs.slice(0, -1).map((f, i) => (
          <G key={`t${i}`} an={0.2 + i * 0.25}>
            <Bend a={f.p} b={Fs[i + 1].p} bend={i < 2 ? 34 : -34} c="gray" />
          </G>
        ))}
        {Fs.map((f, i) => (
          <G key={`f${i}`} an={0.2 + i * 0.25}>
            <Frame2 x={f.p[0]} y={f.p[1] - (i === 0 ? 40 : 0)} ang={f.ang} len={40} />
          </G>
        ))}
        <Halo>
          {Fs.map((f, i) => (
            <T key={`l${i}`} x={f.p[0] + f.dx} y={f.p[1] + f.dy - (i === 0 ? 40 : 0)} s={28} b a={f.dx < 0 ? 'end' : f.dx > 0 ? 'start' : 'middle'}>
              {`{${i}}`}
            </T>
          ))}
        </Halo>
        <Arrow x1={Fs[6].p[0] - 70} y1={Fs[6].p[1]} x2={tool[0] - 70} y2={tool[1]} w={3} both an={1.9} />
        <Ln x1={Fs[6].p[0] - 82} y1={Fs[6].p[1]} x2={Fs[6].p[0] - 10} y2={Fs[6].p[1]} c="gray" w={2} />
        <Ln x1={tool[0] - 82} y1={tool[1]} x2={tool[0] - 10} y2={tool[1]} c="gray" w={2} />
        <T x={tool[0] - 84} y={(Fs[6].p[1] + tool[1]) / 2 + 10} s={28} b a="end" delay={1.9}>
          58 mm
        </T>
        <Dot x={tool[0]} y={tool[1]} rr={11} c="blue" an={2.1} />
        <Halo>
          <T x={Fs[6].p[0] - 90} y={Fs[6].p[1] + 8} s={28} b a="end" delay={1.7}>
            플랜지
          </T>
          <T x={tool[0]} y={tool[1] + 48} s={28} b c="blue" delay={2.1}>
            그리퍼 끝
          </T>
        </Halo>
        <Foot p={pc} result="T₀⁶ = T₀¹ · T₁² · … · T₅⁶" c="ink" sum="플랜지 + 58 mm = 그리퍼 끝" />
      </g>
    );
  },
};

/* ─────────────── 2-2 역기구학: A 손으로 · B 반복 풀이 · C 출발 자세 여러 개 */
const p22 = cols(3);
const L1 = 150;
const L2 = 135;
const LG = 52;
/** Side-view arm (y up, relative to the shoulder): absolute upper-arm angle, then relative elbow and wrist. */
const fk = (a1: number, a2: number, a3: number): Pt[] => {
  const e: Pt = [L1 * Math.cos(rad(a1)), L1 * Math.sin(rad(a1))];
  const w: Pt = [e[0] + L2 * Math.cos(rad(a1 + a2)), e[1] + L2 * Math.sin(rad(a1 + a2))];
  return [[0, 0], e, w, [w[0] + LG * Math.cos(rad(a1 + a2 + a3)), w[1] + LG * Math.sin(rad(a1 + a2 + a3))]];
};
/** Two-link IK for the wrist w, then the wrist joint that points the tool along `tool` (deg); up = elbow above. */
const ik = (target: Pt, tool: number, up: boolean): [number, number, number] => {
  const reach = 24 + LG;
  const w: Pt = [target[0] - reach * Math.cos(rad(tool)), target[1] - reach * Math.sin(rad(tool))];
  const d = Math.hypot(w[0], w[1]);
  const c2 = Math.max(-1, Math.min(1, (d * d - L1 * L1 - L2 * L2) / (2 * L1 * L2)));
  const a2 = ((up ? -1 : 1) * Math.acos(c2) * 180) / Math.PI;
  const a1 = ((Math.atan2(w[1], w[0]) - Math.atan2(L2 * Math.sin(rad(a2)), L1 + L2 * Math.cos(rad(a2)))) * 180) / Math.PI;
  return [a1, a2, tool - a1 - a2];
};
export const fig22: FigureDef = {
  label: '관절 슬라이더 6개로 손끝을 목표 공 12 mm 안에 넣기는 오래 걸리고, 반복 풀이는 손끝이 공에 다가가며 오차가 197 mm 에서 6 번 만에 0.1 mm 아래로 떨어져 멈추고, 같은 공에 닿는 팔 모양이 답 1~4 로 여러 개',
  caption: '역기구학 세 가지 — 손으로 · 반복 풀이 (오차 197 → 0.01 mm, 6 번) · 출발 자세를 바꿔 찾은 답 4개 (목표 180, 80, 100 mm)',
  symbols: ['L₁', 'L₂', 'r'],
  panels: p22.map((p, i) => ({ ...p, title: ['손으로 — 슬라이더 6개', '반복 풀이', '같은 목표, 다른 자세'][i] })),
  draw: () => {
    const [pa, pb, pc] = p22;
    const BALL: Pt = [220, 40];
    const scene = (p: Panel, floorY: number) => {
      const S: Pt = [p.x + 125, floorY - 140];
      const to = (q: Pt): Pt => [S[0] + q[0], S[1] - q[1]];
      const arm = (a: [number, number, number]) => [[S[0], floorY - 26] as Pt, ...fk(...a).map(to)];
      return { S, to, arm, ball: to(BALL) };
    };
    const ballMark = (b: Pt, an?: number) => (
      <g>
        <circle cx={b[0]} cy={b[1]} r={17} fill={C.blue} fillOpacity={0.85} stroke={C.blue} strokeWidth={4} {...(an !== undefined ? anim('pop', an) : {})} />
      </g>
    );
    // A: by hand — the tip wanders around the ball before it gets inside 12 mm.
    const sa = scene(pa, pa.y + 520);
    const handQ: [number, number, number] = [80, -55, -70];
    const tipA = (q: [number, number, number]) => sa.to(fk(...q)[3]);
    const tipNow = tipA(handQ);
    const a0w = Math.atan2(tipNow[1] - sa.ball[1], tipNow[0] - sa.ball[0]);
    const r0w = Math.hypot(tipNow[0] - sa.ball[0], tipNow[1] - sa.ball[1]);
    const wander: Pt[] = Array.from({ length: 61 }, (_, i) => {
      const t = i / 60;
      const r = r0w * (1 - t) ** 1.2 + 6 * Math.sin(t * 40);
      return [sa.ball[0] + r * Math.cos(a0w + t * 4.5 * Math.PI), sa.ball[1] + r * Math.sin(a0w + t * 4.5 * Math.PI)];
    });
    // B: the solver — joint angles pulled toward the answer, the error shrinking each round.
    const sb = scene(pb, pb.y + 450);
    const goal = ik(BALL, -90, true);
    const home: [number, number, number] = [100, -150, -40];
    const steps = [0, 1, 2, 3, 4].map((k) => {
      const f = 0.42 ** k;
      return goal.map((g, i) => g + (home[i] - g) * f) as [number, number, number];
    });
    // The screen's solve from its first pose to (180, 80, 100): error (mm) after each iteration.
    const errs = [197, 150, 106, 70, 33, 1.9, 0.01];
    /** Log scale: 0.01 mm at 0, one decade per unit. */
    const lg = (e: number) => Math.log10(e) + 2;
    // C: four answers for the same ball.
    const sc = scene(pc, pc.y + 660);
    const answers: { q: [number, number, number]; c: Color; dash: boolean }[] = [
      { q: ik(BALL, -90, true), c: 'ink', dash: false },
      { q: ik(BALL, -90, false), c: 'ink', dash: true },
      { q: ik(BALL, -35, true), c: 'gray', dash: false },
      { q: ik(BALL, -35, false), c: 'gray', dash: true },
    ];
    const a0 = fk(...answers[0].q).map(sc.to);
    return (
      <g>
        <Dividers panels={p22} />
        {/* ── A */}
        <Title p={pa}>A 손으로</Title>
        <Floor x1={pa.x + 30} x2={pa.x + pa.w - 30} y={pa.y + 520} />
        <Arm pts={sa.arm(handQ)} tipAngle={-90} />
        <Base x={sa.S[0]} y={pa.y + 520} s={0.9} />
        <circle cx={sa.ball[0]} cy={sa.ball[1]} r={46} fill="none" stroke={C.blue} strokeWidth={3} strokeDasharray="10 8" />
        <Ln x1={sa.ball[0] + 46 * Math.cos(rad(60))} y1={sa.ball[1] + 46 * Math.sin(rad(60))} x2={sa.ball[0] + 66} y2={pa.y + 470} c="blue" w={2} />
        {ballMark(sa.ball)}
        <Poly pts={wander} c="orange" w={4} an={0.3} />
        <Halo>
          <T x={sa.ball[0] + 70} y={pa.y + 496} s={28} b c="blue" a="start">
            12 mm
          </T>
        </Halo>
        {['J1', 'J2', 'J3', 'J4', 'J5', 'J6'].map((j, i) => {
          const x = pa.x + 50 + (i % 2) * 240;
          const y = pa.y + 590 + Math.floor(i / 2) * 50;
          const k = [0.3, 0.7, 0.45, 0.6, 0.2, 0.5][i];
          return (
            <g key={j}>
              <T x={x} y={y + 10} s={28} b a="start">
                {j}
              </T>
              <Ln x1={x + 52} y1={y} x2={x + 200} y2={y} c="gray" w={5} />
              <circle cx={x + 52 + 148 * k} cy={y} r={11} fill={C.white} stroke={C.ink} strokeWidth={4} />
            </g>
          );
        })}
        <Foot p={pa} result="걸린 시간: 초 단위" c="orange" sum="하나 돌리면 다시 맞추기" />

        {/* ── B */}
        <Title p={pb}>B 반복 풀이</Title>
        <Floor x1={pb.x + 30} x2={pb.x + pb.w - 30} y={pb.y + 450} />
        {steps.slice(0, -1).map((q, k) => (
          <Arm key={k} pts={sb.arm(q)} c="gray" w={12} opacity={0.35 + k * 0.12} gripper={false} />
        ))}
        <Arm pts={sb.arm(goal)} tipAngle={-90} an={1.0} />
        <Base x={sb.S[0]} y={pb.y + 450} s={0.9} />
        {ballMark(sb.ball)}
        {steps.map((q, k) => {
          const t = sb.to(fk(...q)[3]);
          return <Dot key={k} x={t[0]} y={t[1]} rr={8} c="orange" an={0.2 + k * 0.2} />;
        })}
        <Graph x={pb.x + 110} y={pb.y + 540} w={360} h={170} xMax={7} yMax={4.5} xLabel="반복 (회)" yLabel="오차 (mm, 로그)">
          {(s) => (
            <g>
              {[
                [lg(100), '100'],
                [lg(1), '1'],
              ].map(([v, l]) => (
                <T key={l} x={s.x - 12} y={s.sy(v as number) + 10} a="end" s={28}>
                  {l}
                </T>
              ))}
              <Level s={s} v={lg(0.1)} c="blue" />
              <T x={s.x - 12} y={s.sy(lg(0.1)) + 10} a="end" s={28} b c="blue">
                0.1
              </T>
              <Poly pts={errs.map((e, k) => [s.sx(k + 0.5), s.sy(lg(e))] as Pt)} c="orange" w={5} an={0.6} />
              {errs.map((e, k) => (
                <Dot key={k} x={s.sx(k + 0.5)} y={s.sy(lg(e))} rr={6} c="orange" />
              ))}
              <T x={s.sx(2.6)} y={s.sy(1.6)} s={28} b c="blue" delay={2}>
                6 번에 멈춤
              </T>
            </g>
          )}
        </Graph>
        <Foot p={pb} result="197 → 0.01 mm · 걸린 시간: ms" sum="오차 보며 조금씩 고치기" />

        {/* ── C */}
        <Title p={pc}>C 출발 자세 여러 개</Title>
        <Floor x1={pc.x + 30} x2={pc.x + pc.w - 30} y={pc.y + 660} />
        {answers
          .slice()
          .reverse()
          .map((a, k) => (
            <Arm key={k} pts={sc.arm(a.q)} c={a.c} dash={a.dash} w={a.c === 'ink' ? 20 : 14} an={0.3 + (3 - k) * 0.35} />
          ))}
        <Base x={sc.S[0]} y={pc.y + 660} s={0.9} />
        <Ln x1={a0[0][0]} y1={a0[0][1]} x2={a0[2][0]} y2={a0[2][1]} c="blue" w={3} dash />
        {ballMark(sc.ball)}
        <Halo>
          <T x={(a0[0][0] + a0[1][0]) / 2 - 44} y={(a0[0][1] + a0[1][1]) / 2} s={28} b a="end">
            L₁
          </T>
          <T x={(a0[1][0] + a0[2][0]) / 2} y={(a0[1][1] + a0[2][1]) / 2 - 24} s={28} b>
            L₂
          </T>
          <T x={(a0[0][0] + a0[2][0]) / 2 + 10} y={(a0[0][1] + a0[2][1]) / 2 + 36} s={28} b c="blue">
            r
          </T>
        </Halo>
        {answers.map((a, k) => {
          const x = pc.x + 70 + (k % 2) * 230;
          const y = pc.y + 130 + Math.floor(k / 2) * 52;
          return (
            <G key={k} an={0.3 + k * 0.35}>
              <line x1={x} y1={y} x2={x + 80} y2={y} stroke={C[a.c]} strokeWidth={a.dash ? 6 : 14} strokeDasharray={a.dash ? '14 10' : undefined} strokeLinecap={a.dash ? 'butt' : 'round'} />
              <T x={x + 100} y={y + 10} s={30} b c={a.c} a="start">
                {`답 ${k + 1}`}
              </T>
            </G>
          );
        })}
        <Foot p={pc} result="손끝 같음, 팔 모양 다름" sum="답 4개 — 덜 움직이는 답" />
      </g>
    );
  },
};

/* ─────────────── 2-3 관절 이동과 직선 이동: 같은 펜, 같은 A → B — A MOVJ · B MOVL(위치만) · C MOVL + 자세 유지 */
const p23 = cols(3);
/** A and B on the table (mm, robot x forward, y left) — the screen's 240 mm move. */
const PA: Pt = [180, -120];
const PB: Pt = [180, 120];
export const fig23: FigureDef = {
  label: '펜을 단 채 위에서 본 A→B 세 번: 관절 이동은 펜 자취가 바깥으로 약 35 mm 휘고 펜은 0°, 직선 이동(위치만)은 자취가 곧지만 펜이 약 13° 기울고, 직선 + 자세 유지는 자취도 곧고 펜도 0°',
  caption: '같은 펜, 같은 A → B (240 mm) — 관절 이동 · 직선 이동(위치만) · 직선 + 자세 유지의 자취, 펜 기울기, 관절 각도',
  symbols: ['s'],
  panels: p23.map((p, i) => ({ ...p, title: ['관절 이동 (MOVJ)', '직선 이동 (MOVL)', '직선 + 자세 유지'][i] })),
  draw: () => {
    const [pa, pb, pc] = p23;
    const top = (p: Panel, line: boolean) => {
      const s = 1.1;
      const bx = p.x + 80;
      const cy = p.y + 255;
      const to = ([x, y]: Pt): Pt => [bx + x * s, cy - y * s];
      const r0 = Math.hypot(PA[0], PA[1]);
      const a0 = Math.atan2(PA[1], PA[0]);
      const path: Pt[] = line
        ? [to(PA), to(PB)]
        : Array.from({ length: 41 }, (_, i) => {
            const a = a0 + (-2 * a0 * i) / 40;
            return to([r0 * Math.cos(a), r0 * Math.sin(a)]);
          });
      const [A, B] = [to(PA), to(PB)];
      return (
        <g>
          <Ln x1={A[0]} y1={A[1]} x2={B[0]} y2={B[1]} c="gray" w={4} dash />
          <circle cx={bx} cy={cy} r={34} fill={C.white} stroke={C.ink} strokeWidth={5} />
          <Ln x1={bx} y1={cy} x2={bx + 100 * Math.cos(-a0)} y2={cy + 100 * Math.sin(-a0)} w={18} />
          <circle cx={bx} cy={cy} r={11} fill={C.white} stroke={C.ink} strokeWidth={4} />
          <Poly pts={path} c={line ? 'blue' : 'orange'} w={7} an={0.3} />
          <Dot x={A[0]} y={A[1]} rr={11} />
          <Dot x={B[0]} y={B[1]} rr={11} />
          <T x={A[0] - 24} y={A[1] + 11} s={32} b a="end">
            A
          </T>
          <T x={B[0] - 24} y={B[1] + 11} s={32} b a="end">
            B
          </T>
        </g>
      );
    };
    /** The pen seen from the side at the end of the move: upright (0°) or leaning. */
    const pen = (p: Panel, deg: number, c: 'blue' | 'red') => {
      const x = p.x + 410;
      const y0 = p.y + 315;
      const L = 190;
      const r = (deg * Math.PI) / 180;
      const top: Pt = [x + L * Math.sin(r), y0 - L * Math.cos(r)];
      return (
        <g>
          <Ln x1={x - 70} y1={y0} x2={x + 70} y2={y0} c="ink" w={4} />
          <Ln x1={x} y1={y0} x2={x} y2={y0 - L - 10} c="gray" w={3} dash />
          <G an={0.6}>
            <Ln x1={x} y1={y0} x2={top[0]} y2={top[1]} c={c} w={14} />
            <P d={`M${x - 8} ${y0 - 20} L${x} ${y0} L${x + 8} ${y0 - 20} Z`} fill={c} w={3} />
          </G>
          {deg > 0 && <Arc cx={x} cy={y0} rr={150} from={90} to={90 - deg} c={c} w={4} />}
          <T x={x} y={y0 + 44} s={30} b c={c}>
            {`펜 ${deg}°`}
          </T>
        </g>
      );
    };
    // Joint angles against progress: MOVJ straight lines, MOVL bent (J1 = atan, J2/J3 follow the reach).
    const jointsAt = (u: number, line: boolean): [number, number, number] => {
      if (!line) return [-33.7 + 67.4 * u, 16, -30];
      const y = PA[1] + (PB[1] - PA[1]) * u;
      const r = Math.hypot(PA[0], y);
      const k = Math.hypot(PA[0], PA[1]) - r;
      return [(Math.atan2(y, PA[0]) * 180) / Math.PI, 16 + 0.6 * k, -30 - 0.5 * k];
    };
    const graph = (p: Panel, line: boolean) => (
      <Graph x={p.x + 80} y={p.y + 500} w={360} h={230} xMax={1} yMax={55} yMin={-55} xLabel="진행 s (0 → 1)" yLabel="관절 각도 (°)">
        {(s) => (
          <g>
            {[0, 1, 2].map((j) => {
              const pts = Array.from({ length: 41 }, (_, i) => [s.sx(i / 40), s.sy(jointsAt(i / 40, line)[j])] as Pt);
              return (
                <g key={j}>
                  <Poly pts={pts} c={line ? 'blue' : 'orange'} w={5} an={0.8 + j * 0.3} />
                  <T x={pts[40][0] + 12} y={pts[40][1] + 10} s={28} b a="start">
                    {`J${j + 1}`}
                  </T>
                </g>
              );
            })}
          </g>
        )}
      </Graph>
    );
    return (
      <g>
        <Dividers panels={p23} />
        <Title p={pa}>A 관절 보간 (MOVJ)</Title>
        {top(pa, false)}
        {pen(pa, 0, 'blue')}
        {graph(pa, false)}
        <Foot p={pa} result="자취: 바깥으로 약 35 mm 휨" c="orange" sum="관절 그래프 곧음 · 펜 0°" />

        <Title p={pb}>B 직선 보간 (위치만)</Title>
        {top(pb, true)}
        {pen(pb, 13, 'red')}
        {graph(pb, true)}
        <Foot p={pb} result="자취: 곧음 (1 mm 안) · 펜 약 13° 기욺" c="red" sum="관절 그래프 휨" />

        <Title p={pc}>C 직선 + 자세 유지</Title>
        {top(pc, true)}
        {pen(pc, 0, 'blue')}
        {graph(pc, true)}
        <Foot p={pc} result="자취: 곧음 · 펜 끝까지 0°" sum="MOVL + 자세 유지" />
      </g>
    );
  },
};

export const FIGS2: Record<string, FigureDef> = { '2-1': fig21, '2-2': fig22, '2-3': fig23 };
