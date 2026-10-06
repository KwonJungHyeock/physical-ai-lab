/** Figures for 학문 4 로봇 동역학 (그림 제작 요청서 §2; numbers from content-markdown/4-로봇동역학.md). */

import { Arm, Arrow, anim, Base, C, Cross, Cube, Dividers, Floor, G, Graph, Gripper, Grid, Level, Ln, Poly, T, Title, chain, cols, type Color, type FigureDef, type Panel } from './kit';

type Pt = [number, number];

/** Strip under the panels (not part of any try's crop). */
function Strip({ children }: { children: string }) {
  return (
    <g>
      <Ln x1={24} x2={1576} y1={836} y2={836} c="light" w={3} />
      <T x={800} y={878} s={32} b>
        {children}
      </T>
    </g>
  );
}

/* ─────────────────────────── 4-1 중력 토크 */

/** Side view, J2 → J3 → J4 → tip (110 · 96 · 81 mm), J2 131 mm above the table, at 1 px/mm. */
const K41 = 1.0;
const L41 = [110, 96, 81];
const POSE41 = { up: [90, 0, 0], half: [45, -45, 0], reach: [0, 0, 0] };

/** A torque bar 0–100 % of the J2 limit, lying under the arm, filled to pct (blue < 70, orange 70–99, red ≥ 100). */
function Meter41({ x, y, pct, from }: { x: number; y: number; pct: number; from?: number }) {
  const w = 340;
  const h = 40;
  const c: Color = pct >= 100 ? 'red' : pct >= 70 ? 'orange' : 'blue';
  const at = (v: number) => x + Math.max(3, (v / 100) * w);
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill="none" stroke={C.gray} strokeWidth={4} />
      <rect x={x + 4} y={y + 4} width={(pct / 100) * w - 4} height={h - 8} fill={C[c]} {...anim('pop', 0.6)} />
      {from !== undefined && <line x1={at(from)} x2={at(from)} y1={y - 10} y2={y + h + 10} stroke={C.gray} strokeWidth={4} />}
      <line x1={x + w} x2={x + w} y1={y - 14} y2={y + h + 14} stroke={C.red} strokeWidth={4} strokeDasharray="10 8" />
      <T x={x + w} y={y - 24} a="end" s={28} c="red">
        모터 한계
      </T>
      <T x={x + w + 18} y={y + h / 2 + 12} a="start" s={34} b c={c} delay={0.8}>
        {`${pct}%`}
      </T>
    </g>
  );
}

function Arm41({ p, pose, load, dist, ghost }: { p: Panel; pose: number[]; load?: boolean; dist?: string; ghost?: number[] }) {
  const j2: Pt = [p.x + 100, p.y + 450];
  const floor = j2[1] + 131 * K41;
  const pts = chain(j2[0], j2[1], L41.map((l) => l * K41), pose);
  const tip = pts[3];
  const blk = 40;
  const cx = tip[0] + 6 + blk / 2; // block centre, where its weight acts
  const dy = j2[1] + 100;
  return (
    <g>
      <Floor x1={j2[0] - 60} x2={j2[0] + 64} y={floor} />
      <Base x={j2[0]} y={floor} s={0.8} />
      {ghost && <Arm pts={[[j2[0], floor - 24], ...chain(j2[0], j2[1], L41.map((l) => l * K41), ghost)]} c="gray" w={20} dash />}
      <G an={ghost ? 0.3 : undefined}>
        <Arm pts={[[j2[0], floor - 24], ...pts]} w={20} />
      </G>
      {load && (
        <g>
          <Cube x={tip[0] + 6} y={tip[1] - blk / 2} s={blk} c="ink" />
          <Arrow x1={cx} y1={tip[1] + blk / 2 + 4} x2={cx} y2={tip[1] + blk / 2 + 64} c="ink" w={5} />
          <T x={cx - 14} y={tip[1] + blk / 2 + 52} a="end" s={28} b>
            250 g
          </T>
        </g>
      )}
      {dist && (
        <G an={0.9}>
          <Ln x1={cx} y1={tip[1] + blk / 2 + 70} x2={cx} y2={dy + 16} c="gray" w={3} dash />
          <Arrow x1={j2[0]} y1={dy} x2={cx} y2={dy} c="blue" w={5} both />
          <T x={(j2[0] + cx) / 2 + 24} y={dy + 46} s={30} b c="blue">
            {dist}
          </T>
        </G>
      )}
    </g>
  );
}

const p41 = cols(3, 0, 830);
export const fig41: FigureDef = {
  label: '어깨(J2) 토크: 세움 0.01 → 반쯤 숙임 0.52 N·m(33%), 숙임 + 250 g 1.12 N·m(71%, 수평 거리 247 mm), 뻗음 + 250 g 1.31 N·m(83%, 280 mm), 한계 1.57 N·m',
  caption: '어깨(J2)의 중력 토크 — 세움 → 반쯤 숙임 · 숙임 + 250 g · 뻗음 + 250 g (J2 모터 한계 1.57 N·m 대비 %)',
  symbols: [],
  panels: p41.map((p, i) => ({ ...p, title: ['버티는 자세', '무게 들기', '팔 뻗기'][i] })),
  draw: () => {
    const [pa, pb, pc] = p41;
    return (
      <g>
        <Dividers panels={p41} />
        <Title p={pa}>A 세움 → 숙임</Title>
        <Title p={pb}>B 숙임 + 250 g</Title>
        <Title p={pc}>C 뻗음 + 250 g</Title>
        <Arm41 p={pa} pose={POSE41.half} ghost={POSE41.up} />
        <T x={pa.x + 140} y={pa.y + 186} a="start" s={28} c="gray" b>
          세움 · 수평 거리 ≈ 0
        </T>
        {[pa, pb].map((p, i) => (
          <T key={i} x={p.x + 226} y={p.y + 334} a="middle" s={28} b delay={0.5}>
            숙임
          </T>
        ))}
        <T x={pc.x + 226} y={pc.y + 422} a="middle" s={28} b delay={0.5}>
          뻗음
        </T>
        <Arm41 p={pb} pose={POSE41.half} load dist="247 mm" />
        <Arm41 p={pc} pose={POSE41.reach} load dist="280 mm" ghost={POSE41.half} />
        {p41.map((p, i) => (
          <Meter41 key={i} x={p.x + 60} y={p.y + 690} pct={[33, 71, 83][i]} from={i === 0 ? 1 : undefined} />
        ))}
        {p41.map((p, i) => (
          <T key={i} x={p.x + p.w / 2} y={p.y + p.h - 26} s={34} b c={(['blue', 'orange', 'orange'] as Color[])[i]} delay={1}>
            {['J2 0.01 → 0.52 N·m', 'J2 1.12 N·m', 'J2 1.31 N·m'][i]}
          </T>
        ))}
        <Strip>토크 = 힘 × 수평 거리 · J2 모터 한계 1.57 N·m</Strip>
      </g>
    );
  },
};

/* ─────────────────────────── 4-2 관성과 가속 토크 */

/** J1 turns 120° (arm reached out sideways): quintic 2.5 s, quintic 0.8 s, sharp trapezoid 0.8 s (12 % speeding up, 12 % slowing down). */
const D42 = 120;
const quinticV = (T: number) => (t: number) => (t <= 0 || t >= T ? 0 : (D42 / T) * (30 * (t / T) ** 2 - 60 * (t / T) ** 3 + 30 * (t / T) ** 4));
const quinticA = (T: number) => (t: number) => (t <= 0 || t >= T ? 0 : (D42 / (T * T)) * (60 * (t / T) - 180 * (t / T) ** 2 + 120 * (t / T) ** 3));
const TRAP_V = D42 / (0.8 * 0.88);
const TA = 0.8 * 0.12;
const trapV = (t: number) => (t <= 0 || t >= 0.8 ? 0 : t < TA ? (TRAP_V * t) / TA : t > 0.8 - TA ? (TRAP_V * (0.8 - t)) / TA : TRAP_V);
const trapA = (t: number) => (t <= 0 || t >= 0.8 ? 0 : t < TA ? TRAP_V / TA : t > 0.8 - TA ? -TRAP_V / TA : 0);
/** J1 has no gravity torque: torque ∝ angular acceleration, scaled so B peaks at 0.23 N·m (the simulator's value). */
const TAU_K = 0.23 / ((5.7735 * D42) / 0.64);
const TRIES42 = [
  { v: quinticV(2.5), a: quinticA(2.5), c: 'blue' as Color, title: 'A 느리게 2.5 s', peak: '최대 0.02 N·m' },
  { v: quinticV(0.8), a: quinticA(0.8), c: 'orange' as Color, title: 'B 빠르게 0.8 s', peak: '최대 0.23 N·m' },
  { v: trapV, a: trapA, c: 'red' as Color, title: 'C 빠르고 급하게 0.8 s', peak: '최대 0.38 N·m · 한계 넘음' },
];

const plot42 = (s: { sx(v: number): number; sy(v: number): number }, f: (t: number) => number, n = 640): Pt[] =>
  Array.from({ length: n + 1 }, (_, i) => {
    const t = (3.3 * i) / n;
    return [s.sx(t), s.sy(f(t))];
  });

const p42 = cols(3, 0, 830);
export const fig42: FigureDef = {
  label: 'J1 120° 회전: 느리게 2.5 s(최대 0.02 N·m) · 빠르게 0.8 s(0.23 N·m) · 빠르고 급하게 0.8 s(0.38 N·m, 한계 0.28 N·m 넘음)의 속도와 토크 그래프',
  caption: 'J1 을 120° 돌릴 때의 속도와 토크 — 느리게 2.5 s · 빠르게 0.8 s · 빠르고 급하게 0.8 s (J1 한계 0.28 N·m)',
  symbols: [],
  panels: p42.map((p, i) => ({ ...p, title: ['느리게', '빠르게', '빠르고 급하게'][i] })),
  draw: () => (
    <g>
      <Dividers panels={p42} />
      {p42.map((p, i) => {
        const tr = TRIES42[i];
        return (
          <g key={i}>
            <Title p={p}>{tr.title}</Title>
            <Graph x={p.x + 110} y={p.y + 150} w={330} h={190} xMax={3.5} yMax={300} xLabel="시간(s)" yLabel="J1 속도(°/s)" xTicks={[0, 0.8, 2.5]} yTicks={[0]}>
              {(s) => <Poly pts={plot42(s, tr.v)} c={tr.c} w={5} an={0.2} />}
            </Graph>
            <Graph x={p.x + 110} y={p.y + 470} w={330} h={240} xMax={3.5} yMax={0.45} yMin={-0.45} xLabel="시간(s)" yLabel="J1 토크(N·m)" yTicks={[-0.28, 0.28]}>
              {(s) => (
                <g>
                  <Level s={s} v={0.28} c="red" />
                  <Level s={s} v={-0.28} c="red" />
                  <T x={s.x + s.w} y={s.sy(0.28) - 12} a="end" s={28} c="red">
                    한계
                  </T>
                  <Poly pts={plot42(s, (t) => TAU_K * tr.a(t))} c={tr.c} w={5} an={0.6} />
                  {i > 0 && (
                    <g>
                      <T x={s.sx(i === 1 ? 0.2 : 0.05) + (i === 1 ? 26 : 60)} y={s.sy(0.33)} a="start" s={28} b delay={1}>
                        출발 +
                      </T>
                      <T x={s.sx(i === 1 ? 0.6 : 0.75) + 26} y={s.sy(-0.33) + 20} a="start" s={28} b delay={1.2}>
                        정지 −
                      </T>
                    </g>
                  )}
                  {i === 2 && <Cross x={s.sx(0.05) + 34} y={s.sy(0.38)} s={14} an={1.4} />}
                </g>
              )}
            </Graph>
            <T x={p.x + p.w / 2} y={p.y + p.h - 26} s={i === 2 ? 30 : 34} b c={tr.c} delay={1.2}>
              {tr.peak}
            </T>
          </g>
        );
      })}
      <Strip>토크 = 관성 × 각가속도 · J1 120° · 한계 0.28 N·m</Strip>
    </g>
  ),
};

/* ─────────────────────────── 4-3 질량과 마찰 */

/** Same push (200 mm/s for 1 s); where the arm stops and how far the block went, mm. */
const PUSH43 = [
  { mass: '20 g', mu: '0.75', force: '0.15 N', arm: 160, block: 160, note: '팔이 서자 멈춤 (0.03 s)', title: 'A 가벼운 블록', c: 'blue' as Color },
  { mass: '200 g', mu: '0.75', force: '1.47 N', arm: 40, block: 40, note: '팔 53 mm/s 로 느려짐', title: 'B 무거운 블록', c: 'orange' as Color },
  { mass: '20 g', mu: '0.05', force: '0.01 N', arm: 160, block: 210, note: '팔이 선 뒤 0.4 s 더', title: 'C 미끄러운 블록', c: 'orange' as Color },
];
const K43 = 1.25;

const p43 = cols(3, 0, 830);
export const fig43: FigureDef = {
  label: '같은 밀기(200 mm/s · 1 s)로 20 g 블록 약 160 mm, 200 g 블록 약 40 mm, 마찰 0.05 인 20 g 블록 약 210 mm 밀림',
  caption: '같은 밀기(200 mm/s · 1 s)로 민 세 블록 — 가벼운 20 g · 무거운 200 g · 미끄러운 20 g (마찰 계수 0.75 · 0.75 · 0.05)',
  symbols: ['μ', 'm', 'g'],
  panels: p43.map((p, i) => ({ ...p, title: ['가벼운 블록', '무거운 블록', '미끄러운 블록'][i] })),
  draw: () => (
    <g>
      <Dividers panels={p43} />
      {p43.map((p, i) => {
        const k = PUSH43[i];
        const floor = p.y + 520;
        const sx0 = p.x + 150;
        const bs = 56;
        const left = sx0 + k.block * K43;
        const gx = sx0 + k.arm * K43 - 35;
        const gx0 = sx0 - 80;
        const gy = floor - 8 - 44;
        return (
          <g key={i}>
            <Title p={p}>{k.title}</Title>
            <rect x={p.x + 90} y={p.y + 92} width={350} height={150} rx={12} fill="none" stroke={C.light} strokeWidth={3} />
            {[
              ['질량', k.mass],
              ['μ', k.mu],
              ['미는 힘 μmg', k.force],
            ].map(([key, v], j) => (
              <g key={key}>
                <T x={p.x + 112} y={p.y + 135 + j * 45} a="start" s={30} c="ink">
                  {key}
                </T>
                <T x={p.x + 418} y={p.y + 135 + j * 45} a="end" s={30} b c={j === 2 ? k.c : 'ink'}>
                  {v}
                </T>
              </g>
            ))}
            <Grid x={p.x + 40} y={floor} w={460} h={40} step={40} />
            <Floor x1={p.x + 40} x2={p.x + 500} y={floor} />
            <Ln x1={sx0} y1={floor - 150} x2={sx0} y2={floor + 70} c="gray" w={3} dash />
            <T x={sx0} y={floor + 132} s={28} c="gray">
              출발
            </T>
            <Cube x={sx0} y={floor - bs} s={bs} c="gray" dash />
            {/* the arm: where it started (gray) and where it stopped */}
            <g opacity={0.6}>
              <Gripper x={gx0} y={gy} angle={-90} c="gray" s={1.3} />
              <Ln x1={gx0} y1={gy} x2={gx0} y2={floor - 190} c="gray" w={16} />
            </g>
            <Arrow x1={gx0 + 20} y1={floor - 210} x2={gx - 20} y2={floor - 210} c="gray" w={4} an={0.3} />
            <G an={0.6}>
              <Gripper x={gx} y={gy} angle={-90} s={1.3} />
              <Ln x1={gx} y1={gy} x2={gx} y2={floor - 190} w={16} />
              <circle cx={gx} cy={floor - 190} r={12} fill={C.white} stroke={C.ink} strokeWidth={5} />
            </G>
            <G an={1}>
              <Cube x={left} y={floor - bs} s={bs} c="blue" />
            </G>
            <Arrow x1={sx0} y1={floor + 90} x2={left} y2={floor + 90} c={k.c} w={5} both an={1.2} />
            <T x={p.x + p.w / 2} y={floor + 170} s={28} c="ink" delay={1.4}>
              {k.note}
            </T>
            <T x={p.x + p.w / 2} y={p.y + p.h - 26} s={36} b c={k.c} delay={1.4}>
              {`약 ${k.block} mm`}
            </T>
          </g>
        );
      })}
      <Strip>같은 밀기 200 mm/s · 1 s · 마찰력 = μ × 무게</Strip>
    </g>
  ),
};

export const FIGS4: Record<string, FigureDef> = { '4-1': fig41, '4-2': fig42, '4-3': fig43 };
