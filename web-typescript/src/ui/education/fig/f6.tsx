/** Figures for 학문 6 동작 계획 (그림 제작 요청서 §2, numbers from content-markdown/6-동작계획.md). */

import type { ReactNode } from 'react';

import { Arm, Arrow, Base, C, Cross, Dividers, Dot, G, Graph, Level, Ln, Poly, T, Title, cols, curve, rad, type Color, type FigureDef, type Panel } from './kit';

type Pt = readonly [number, number];

/* ─────────────────────────── shared parts */

/** Bottom result labels of a panel: a bold first line and an optional second line. */
function Result({ p, a, b, ca = 'ink', cb = 'ink', delay }: { p: Panel; a: ReactNode; b?: ReactNode; ca?: Color; cb?: Color; delay?: number }) {
  return (
    <g>
      <T x={p.x + p.w / 2} y={p.y + p.h - 92} s={36} b c={ca} delay={delay}>
        {a}
      </T>
      {b !== undefined && (
        <T x={p.x + p.w / 2} y={p.y + p.h - 40} s={30} b c={cb} delay={delay}>
          {b}
        </T>
      )}
    </g>
  );
}

/** A block seen from the side: front square and top face, neutral (ink outline, light fill). */
function Blk({ x, y, s, c = 'ink', dash, tilt = 0, fill = 'light' }: { x: number; y: number; s: number; c?: Color; dash?: boolean; tilt?: number; fill?: Color | 'none' }) {
  const d = s * 0.28;
  const da = dash ? '10 8' : undefined;
  const f = dash || fill === 'none' ? 'none' : C[fill];
  return (
    <g transform={tilt ? `rotate(${tilt} ${x + s} ${y + s})` : undefined}>
      <path d={`M${x} ${y} L${x + d} ${y - d} L${x + s + d} ${y - d} L${x + s + d} ${y + s - d} L${x + s} ${y + s}`} fill={f === 'none' ? 'none' : C.white} stroke={C[c]} strokeWidth={4} strokeDasharray={da} strokeLinejoin="round" />
      <rect x={x} y={y} width={s} height={s} fill={f} stroke={C[c]} strokeWidth={4} strokeDasharray={da} />
      <path d={`M${x} ${y} L${x + d} ${y - d} M${x + s} ${y} L${x + s + d} ${y - d}`} stroke={C[c]} strokeWidth={4} strokeDasharray={da} />
    </g>
  );
}

/** Suction tool: a vertical shaft down to a cup whose bottom rim is at (x, y). */
function Suction({ x, y, len = 70, c = 'ink', dash, on }: { x: number; y: number; len?: number; c?: Color; dash?: boolean; on?: boolean }) {
  const da = dash ? '10 8' : undefined;
  return (
    <g>
      <line x1={x} y1={y - 16} x2={x} y2={y - 16 - len} stroke={C[c]} strokeWidth={dash ? 5 : 12} strokeLinecap="round" strokeDasharray={da} />
      <path d={`M${x - 9} ${y - 16} L${x + 9} ${y - 16} L${x + 20} ${y} L${x - 20} ${y} Z`} fill={dash ? 'none' : on ? C.blue : C.white} stroke={on ? C.blue : C[c]} strokeWidth={4} strokeLinejoin="round" strokeDasharray={da} />
    </g>
  );
}

/** Two-link elbow-up solution from a to b (screen coordinates, y down). */
function elbow(a: Pt, b: Pt, l1: number, l2: number): [number, number] {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const d = Math.min(l1 + l2 - 1, Math.hypot(dx, dy));
  const base = Math.atan2(dy, dx);
  const t = Math.acos((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d));
  const e1: [number, number] = [a[0] + l1 * Math.cos(base - t), a[1] + l1 * Math.sin(base - t)];
  const e2: [number, number] = [a[0] + l1 * Math.cos(base + t), a[1] + l1 * Math.sin(base + t)];
  return e1[1] < e2[1] ? e1 : e2;
}

/** Side-view arm (base on the floor at bx) holding the suction tool with its cup rim at q. */
function PumpArm({ bx, floor, q, c = 'ink', len = 70, dash, on, l = 150, opacity }: { bx: number; floor: number; q: Pt; c?: Color; len?: number; dash?: boolean; on?: boolean; l?: number; opacity?: number }) {
  const sh: Pt = [bx, floor - 30];
  const f: Pt = [q[0], q[1] - 16 - len];
  const w: Pt = [f[0] - 44, f[1]];
  const e = elbow(sh, w, l, l);
  return (
    <g opacity={opacity}>
      <Arm pts={[sh, e, w, f]} c={c} w={20} dash={dash} gripper={false} />
      <Suction x={q[0]} y={q[1]} len={len} c={c} dash={dash} on={on} />
    </g>
  );
}

/* ─────────────────────────── 6-1 충돌 검사 */

/**
 * Top view of the 6-1 move (E1Collision): J1 52.8° → −18.8° (71.6°), tool down, across a 6 mm wall at
 * y = 0, x 150–290 mm. The arm's capsule chain seen from above at J1 = 52.8°: base → (53, 69) → (135, 71)
 * → wrist/tool (179, 129) mm; turning J1 turns it about the base. J5 meets the wall for J1 ≈ 22.4°…11.6°.
 */
const J1_START = 52.8;
const J1_GOAL = -18.8;
const ARM_TOP: Pt[] = [
  [0, 0],
  [53, 69],
  [135, 71],
  [179, 129],
];
const TIP_R = Math.hypot(179, 129);
const TIP_AZ = (Math.atan2(129, 179) * 180) / Math.PI;
/** Check poses (J1) and which of them overlap the wall — as the simulator computes them. */
const checks = (n: number) => Array.from({ length: n + 1 }, (_, i) => J1_START + ((J1_GOAL - J1_START) * i) / n);
const HIT = (j1: number) => j1 < 22.4 && j1 > 11.6;
/** Where the real move stops (the first contact of J5 with the wall). */
const J1_STOP = 22.4;

const p61 = cols(3);
const S61 = 1.7;
function topView(p: Panel) {
  const cx = p.x + p.w / 2;
  const oy = 690;
  /** Robot x forward = up the page, robot y (left) = left. */
  const at = (x: number, y: number): [number, number] => [cx - y * S61, oy - x * S61];
  const pose = (j1: number): [number, number][] => {
    const f = rad(j1 - J1_START);
    return ARM_TOP.map(([x, y]) => at(x * Math.cos(f) - y * Math.sin(f), x * Math.sin(f) + y * Math.cos(f)));
  };
  return { cx, oy, at, pose };
}

/** A capsule cage seen from above: the link polyline with a wide translucent round stroke (r ≈ 20 mm). */
function Capsules({ pts, c }: { pts: Pt[]; c: Color }) {
  const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  return (
    <g>
      <path d={d} fill="none" stroke={C[c]} strokeOpacity={0.16} strokeWidth={20 * 2 * S61} strokeLinecap="round" strokeLinejoin="round" />
    </g>
  );
}

function TopArm({ pts, c, w = 14, dash, opacity }: { pts: Pt[]; c: Color; w?: number; dash?: boolean; opacity?: number }) {
  return <Arm pts={pts} c={c} w={w} dash={dash} gripper={false} opacity={opacity} />;
}

export const fig61: FigureDef = {
  caption: '검사 간격에 따른 충돌 검사: 출발·도착만 · 30° 간격 · 5° 간격 (J1 71.6°, 벽 6 mm)',
  label: '위에서 본 J1 71.6° 이동과 6 mm 벽: 출발·도착만 검사(2 번) · 30° 간격(4 번)은 벽을 놓치고, 5° 간격(16 번)은 벽과 겹친 자세 2 개를 찾음',
  panels: p61.map((p, i) => ({ ...p, title: ['출발·도착만: 검사 2 번, 놓침', '30° 간격: 검사 4 번, 놓침', '5° 간격: 검사 16 번, 찾음'][i] })),
  draw: () => (
    <g>
      <Dividers panels={p61} />
      {p61.map((p, i) => {
        const { cx, oy, at, pose } = topView(p);
        const n = [1, 3, 15][i];
        const qs = checks(n);
        const found = i === 2;
        const start = pose(J1_START);
        const goal = pose(J1_GOAL);
        const tipAt = (j1: number) => pose(j1)[3];
        const wallA = at(150, 0);
        const wallB = at(290, 0);
        const arcPts = Array.from({ length: 41 }, (_, k) => {
          const a = rad(TIP_AZ - (2 * TIP_AZ * k) / 40);
          return at(TIP_R * Math.cos(a), TIP_R * Math.sin(a));
        });
        const stop = pose(J1_STOP);
        const hitAt = at(219.7, 0);
        return (
          <g key={i}>
            <Title p={p}>{['A  출발·도착만', 'B  30° 간격', 'C  5° 간격'][i]}</Title>
            {/* the swept arc of the tool and its J1 angle */}
            <Poly pts={arcPts} c="gray" w={4} dash />
            <Arrow x1={arcPts[38][0]} y1={arcPts[38][1]} x2={arcPts[40][0]} y2={arcPts[40][1]} c="gray" w={4} />
            <T x={cx - 24} y={arcPts[20][1] - 48} s={30} b c="ink" a="end">
              J1 71.6°
            </T>
            {/* goal pose (gray dashed) and start pose with its capsule cage */}
            <TopArm pts={goal} c="gray" w={12} dash />
            <Capsules pts={start} c="blue" />
            <TopArm pts={start} c="ink" />
            <Base x={cx} y={oy + 30} s={0.9} />
            <T x={start[3][0] - 14} y={start[3][1] - 58} s={30} b c="ink" a="start">
              출발
            </T>
            <T x={goal[3][0] + 14} y={goal[3][1] - 58} s={30} b c="gray" a="end">
              도착
            </T>
            {i === 0 && (
              <T x={start[1][0] - 50} y={start[1][1] + 6} s={28} c="blue" a="end">
                캡슐
              </T>
            )}
            {/* the thin wall */}
            <rect x={wallA[0] - 5} y={wallB[1]} width={10} height={wallA[1] - wallB[1]} fill={C.ink} />
            <T x={wallB[0]} y={wallB[1] - 18} s={30} b>
              벽 6 mm
            </T>
            {/* the checked poses: thin arms for a few, dots at the tool for all */}
            {i < 2 && qs.slice(1, -1).map((j1, k) => <TopArm key={`g${k}`} pts={pose(j1)} c="blue" w={8} opacity={0.55} />)}
            {found &&
              qs.filter(HIT).map((j1, k) => (
                <G key={`h${k}`} an={1.4 + k * 0.2}>
                  <Capsules pts={pose(j1).slice(2)} c="red" />
                  <TopArm pts={pose(j1)} c="red" w={8} />
                </G>
              ))}
            {qs.map((j1, k) => {
              const [x, y] = tipAt(j1);
              return <Dot key={`d${k}`} x={x} y={y} rr={i === 2 ? 9 : 12} c={HIT(j1) ? 'red' : 'blue'} an={0.2 + k * (i === 2 ? 0.08 : 0.3)} />;
            })}
            {/* A, B: "충돌 없음" — the arm moves and J5 meets the wall the check skipped */}
            {!found && (
              <g>
                <G an={1.6}>
                  <TopArm pts={stop} c="orange" w={12} />
                </G>
                <Cross x={hitAt[0]} y={hitAt[1]} s={20} an={2.1} />
                <T x={hitAt[0] + 34} y={hitAt[1] - 36} s={34} b c="red" a="start" delay={2.2}>
                  놓침
                </T>
              </g>
            )}
            {found && (
              <T x={hitAt[0] + 40} y={hitAt[1] - 40} s={30} b c="red" a="start" delay={2}>
                J5 ↔ 벽
              </T>
            )}
            <Result
              p={p}
              a={`검사 ${qs.length} 번`}
              b={found ? '벽 찾음 (2 자세) → 맞음' : '충돌 없음 → 놓침'}
              cb={found ? 'blue' : 'red'}
              delay={found ? 2.3 : 2.4}
            />
          </g>
        );
      })}
    </g>
  ),
};

/* ─────────────────────────── 6-2 경로 계획 */

/**
 * Side elevation across the wall (E2Planning): start and goal low on either side of a 170 mm wall, via
 * points 220 mm up (B), two RRT-Connect trees meeting over the wall and the shortcut path (C).
 * Coordinates in mm: u across the wall, h up.
 */
const p62 = cols(3);
/** Diagram scales: across the wall and height, px per mm. */
const SU = 1.45;
const SH = 1.75;
const START62: Pt = [-135, 30];
const GOAL62: Pt = [135, 30];
/** Hand-drawn trees (parent → child edges), clear of the wall (|u| ≤ 24 drawn, h ≤ 170). */
const TREE_S: [Pt, Pt][] = [
  [START62, [-160, 105]],
  [[-160, 105], [-125, 180]],
  [[-125, 180], [-85, 245]],
  [[-85, 245], [-30, 290]],
  [START62, [-90, 85]],
  [[-90, 85], [-60, 140]],
  [[-160, 105], [-172, 160]],
  [[-125, 180], [-168, 225]],
  [[-85, 245], [-120, 300]],
  [[-60, 140], [-80, 200]],
];
const TREE_G: [Pt, Pt][] = [
  [GOAL62, [105, 100]],
  [[105, 100], [130, 175]],
  [[130, 175], [75, 235]],
  [[75, 235], [25, 280]],
  [GOAL62, [170, 80]],
  [[105, 100], [55, 125]],
  [[130, 175], [170, 215]],
  [[75, 235], [100, 300]],
  [[55, 125], [65, 190]],
];
const RAW62: Pt[] = [START62, [-160, 105], [-125, 180], [-85, 245], [-30, 290], [25, 280], [75, 235], [130, 175], [105, 100], GOAL62];
const SMOOTH62: Pt[] = [START62, [-85, 245], [75, 235], GOAL62];

export const fig62: FigureDef = {
  caption: '벽 너머로 가는 세 가지 길: 그냥 직선 · 사람이 찍은 경유점 · RRT 자동 탐색 (벽 170 mm)',
  label: '170 mm 벽을 사이에 둔 출발과 도착: 그냥 직선은 벽에 부딪히고, 사람이 찍은 경유점 1·2(220 mm)로 넘어가고, RRT-Connect 두 나무가 만나 찾은 길을 다듬음',
  panels: p62.map((p, i) => ({ ...p, title: ['그냥 직선: 충돌', '경유점 직접: 사람이 찍음', '자동 탐색 RRT: RRT-Connect + 다듬기'][i] })),
  draw: () => (
    <g>
      <Dividers panels={p62} />
      {p62.map((p, i) => {
        const cx = p.x + p.w / 2;
        const floor = 700;
        const at = ([u, h]: Pt): [number, number] => [cx + u * SU, floor - h * SH];
        const s = at(START62);
        const g = at(GOAL62);
        const wTop = at([-24, 170]);
        const wBot = at([24, 0]);
        return (
          <g key={i}>
            <Title p={p}>{['A  그냥 직선', 'B  경유점 직접', 'C  자동 탐색 RRT'][i]}</Title>
            <T x={cx} y={108} s={30} b c={(['ink', 'orange', 'blue'] as const)[i]} delay={0.2}>
              {['관절 보간: 장애물을 모름', '사람이 경유점을 찍음', 'RRT-Connect + 다듬기'][i]}
            </T>
            <Ln x1={p.x + 40} y1={floor} x2={p.x + p.w - 40} y2={floor} w={7} />
            <rect x={wTop[0]} y={wTop[1]} width={wBot[0] - wTop[0]} height={wBot[1] - wTop[1]} fill={C.light} stroke={C.ink} strokeWidth={4} />
            <T x={cx} y={wTop[1] + 64} s={28} b>
              벽
            </T>
            <T x={cx} y={wTop[1] + 100} s={28} b>
              170
            </T>
            <T x={cx} y={wTop[1] + 134} s={28} b>
              mm
            </T>
            {i === 0 && (
              <g>
                <Ln x1={wBot[0]} y1={(s[1] + g[1]) / 2} x2={g[0]} y2={g[1]} c="gray" w={4} dash />
                <T x={cx} y={at([0, 220])[1] - 100} s={30} c="gray">
                  관절 각을 출발 → 도착으로
                </T>
                <T x={cx} y={at([0, 220])[1] - 58} s={30} c="gray">
                  같은 비율로 바꿀 뿐
                </T>
                <Ln x1={s[0]} y1={s[1]} x2={wTop[0] - 4} y2={s[1]} c="red" w={8} an={0.2} />
                <Cross x={wTop[0] - 6} y={s[1]} s={22} an={1.4} />
                <T x={wTop[0] - 70} y={s[1] - 48} s={34} b c="red" delay={1.5}>
                  충돌
                </T>
              </g>
            )}
            {i === 1 &&
              (() => {
                const v1 = at([-70, 220]);
                const v2 = at([70, 220]);
                return (
                  <g>
                    <Ln x1={p.x + 40} y1={v1[1]} x2={p.x + p.w - 40} y2={v1[1]} c="gray" w={3} dash />
                    <T x={p.x + p.w - 44} y={v1[1] - 14} s={28} c="ink" a="end">
                      220 mm
                    </T>
                    <Poly pts={[s, v1, v2, g]} c="blue" w={8} an={0.3} />
                    <Dot x={v1[0]} y={v1[1]} rr={20} c="orange" an={0.1} />
                    <Dot x={v2[0]} y={v2[1]} rr={20} c="orange" an={0.2} />
                    <T x={v1[0]} y={v1[1] + 10} s={28} b c="white">
                      1
                    </T>
                    <T x={v2[0]} y={v2[1] + 10} s={28} b c="white">
                      2
                    </T>
                    <T x={cx} y={v1[1] - 100} s={30} c="gray" delay={1.2}>
                      벽이 바뀌면
                    </T>
                    <T x={cx} y={v1[1] - 58} s={30} c="gray" delay={1.4}>
                      다시 찍어야 함
                    </T>
                  </g>
                );
              })()}
            {i === 2 && (
              <g>
                {[...TREE_S, ...TREE_G].map(([a, b], k) => {
                  const [x1, y1] = at(a);
                  const [x2, y2] = at(b);
                  return <Ln key={`e${k}`} x1={x1} y1={y1} x2={x2} y2={y2} c="gray" w={3} an={0.1 + k * 0.05} />;
                })}
                {[...TREE_S, ...TREE_G].map(([, b], k) => {
                  const [x, y] = at(b);
                  return <Dot key={`n${k}`} x={x} y={y} rr={6} c="gray" />;
                })}
                <Poly pts={RAW62.map(at)} c="gray" w={6} dash />
                <Poly pts={SMOOTH62.map(at)} c="blue" w={9} an={1.4} />
                <T x={cx} y={166} s={28} b c="gray">
                  다듬기 전
                </T>
                <T x={cx} y={at([0, 220])[1] + 44} s={28} b c="blue" delay={1.8}>
                  다듬은 길
                </T>
              </g>
            )}
            <Dot x={s[0]} y={s[1]} rr={14} c="ink" />
            <Dot x={g[0]} y={g[1]} rr={14} c="blue" />
            <T x={s[0]} y={floor + 46} s={30} b>
              출발
            </T>
            <T x={g[0]} y={floor + 46} s={30} b c="blue">
              도착
            </T>
            <Result p={p} a={['성공 X', '성공 O', '성공 O'][i]} b={['J3 가 벽에 부딪혀 멈춤', '찍는 시간 = 계획 시간', '누를 때마다 다른 길'][i]} ca={i === 0 ? 'red' : 'blue'} cb="gray" delay={2} />
          </g>
        );
      })}
    </g>
  ),
};

/* ─────────────────────────── 6-3 집기와 놓기 */

/**
 * Side view, 25 mm block (F2PickPlace): the suction pump, not the gripper — the 20 mm parallel gripper
 * cannot hold a 25 mm block. A: straight to the grasp pose, low, pushing the block. B: the four steps
 * (30 mm above → down → pump on → up 50 mm). C: release 0 / 10 / 40 mm above the table.
 */
const p63 = cols(3);
const S63 = 3.5;
const BLK = 25 * S63;
const DROPS: { h: number; v: string; c: Color }[] = [
  { h: 0, v: '0.1 m/s', c: 'blue' },
  { h: 10, v: '0.46 m/s', c: 'orange' },
  { h: 40, v: '0.89 m/s', c: 'red' },
];
const STEPS63 = [
  { n: '①', a: '접근', b: '30 mm 위' },
  { n: '②', a: '내리기', b: '' },
  { n: '③', a: '펌프 켜기', b: '' },
  { n: '④', a: '들기', b: '50 mm' },
];

export const fig63: FigureDef = {
  caption: '블록을 집고 놓는 순서와 놓는 높이: 바로 집기 · 4단계로 집기 · 놓는 높이 0 · 10 · 40 mm',
  label: '흡착 펌프로 25 mm 블록 집기: 바로 집기는 낮게 다가가 블록을 밀어 실패, 4단계(위 30 mm 접근 → 수직 내리기 → 펌프 켜기 → 수직 50 mm 들기)는 성공, 놓는 높이 0 · 10 · 40 mm 의 부딪는 속도',
  panels: p63.map((p, i) => ({ ...p, title: ['바로 집기: 밀림, 실패', '4단계로 집기: 성공', '놓는 높이 0 · 10 · 40 mm'][i] })),
  draw: () => {
    const floor = 570;
    return (
      <g>
        <Dividers panels={p63} />
        {p63.map((p, i) => (
          <g key={i}>
            <Title p={p}>{['A  바로 집기', 'B  4단계로 집기', 'C  놓는 높이'][i]}</Title>
            <Ln x1={p.x + 30} y1={floor} x2={p.x + p.w - 30} y2={floor} w={7} />
          </g>
        ))}
        {/* A: straight to the block — the tool comes in low and pushes it away */}
        {(() => {
          const p = p63[0];
          const bx = p.x + 280;
          const shift = 64;
          const q: Pt = [bx + BLK / 2 + BLK * 0.14, floor - BLK - BLK * 0.14];
          const x0 = p.x + 150;
          const path: Pt[] = Array.from({ length: 41 }, (_, k) => {
            const u = k / 40;
            const rise = u > 0.7 ? ((u - 0.7) / 0.3) ** 2 : 0;
            return [x0 + (q[0] - x0) * u, floor - 46 - (q[1] - (floor - 46)) * -rise];
          });
          return (
            <g>
              <Blk x={bx} y={floor - BLK} s={BLK} c="gray" dash />
              <G an={1.2}>
                <Blk x={bx + shift} y={floor - BLK} s={BLK} tilt={7} />
              </G>
              <Poly pts={path} c="orange" w={6} an={0.2} />
              <PumpArm bx={p.x + 80} floor={floor} q={q} l={185} len={80} />
              <Base x={p.x + 80} y={floor} s={0.9} />
              <Arrow x1={q[0] + 34} y1={floor - BLK - 52} x2={q[0] + shift + 46} y2={floor - BLK - 52} c="orange" w={6} an={1.3} />
              <T x={q[0] + shift / 2 + 40} y={floor - BLK - 74} s={30} b c="orange" a="start" delay={1.3}>
                밀림
              </T>
              <Cross x={q[0] + 20} y={floor - BLK - 250} s={24} an={1.8} />
              <T x={q[0] + 20} y={floor - BLK - 296} s={30} b c="red" delay={1.8}>
                못 집음
              </T>
              <T x={p.x + p.w / 2} y={floor + 60} s={30}>
                관절을 한꺼번에 돌려
              </T>
              <T x={p.x + p.w / 2} y={floor + 100} s={30}>
                낮게 옆으로 다가감
              </T>
              <Result p={p} a="집기 실패" b="블록 약 18 mm 밀림" ca="red" cb="red" delay={2} />
            </g>
          );
        })()}
        {/* B: four cells — approach 30 mm above, straight down, pump on, straight up 50 mm */}
        {(() => {
          const p = p63[1];
          const cw = p.w / 4;
          const sb = 2.8;
          const bk = 25 * sb;
          const top = floor - bk;
          const appr = top - 30 * sb - bk * 0.14;
          const lift = 50 * sb;
          return (
            <g>
              {STEPS63.map((st, k) => {
                const bx = p.x + cw * k + (cw - bk * 1.28) / 2;
                const cx = bx + bk * 0.64;
                const held = k >= 2;
                const dy = k === 3 ? lift : 0;
                const cupY = k === 0 ? appr : top - bk * 0.14 - dy;
                return (
                  <g key={k}>
                    {k > 0 && <Ln x1={p.x + cw * k} y1={150} x2={p.x + cw * k} y2={floor - 20} c="light" w={3} />}
                    {k === 3 && <Blk x={bx} y={top} s={bk} c="gray" dash />}
                    {k === 1 && <Suction x={cx} y={appr} len={70} c="gray" dash />}
                    <G an={0.2 + k * 0.45}>
                      <Blk x={bx} y={top - dy} s={bk} c={held ? 'blue' : 'ink'} />
                      <Suction x={cx} y={cupY} len={70} on={held} />
                    </G>
                    {k === 0 && (
                      <g>
                        <Arrow x1={cx - 30} y1={appr - 230} x2={cx - 4} y2={appr - 100} c="blue" w={5} dash an={0.3} />
                        <Dot x={cx} y={appr} rr={8} c="blue" />
                      </g>
                    )}
                    {k === 1 && <Arrow x1={bx - 14} y1={appr - 40} x2={bx - 14} y2={top - 26} c="blue" w={6} an={0.8} />}
                    {k === 3 && <Arrow x1={bx - 14} y1={top - 10} x2={bx - 14} y2={top - lift - 10} c="blue" w={6} an={1.6} />}
                    <T x={cx} y={floor + 46} s={34} b c="blue">
                      {st.n}
                    </T>
                    <T x={cx} y={floor + 88} s={28} b>
                      {st.a}
                    </T>
                    {st.b && (
                      <T x={cx} y={floor + 124} s={28} b>
                        {st.b}
                      </T>
                    )}
                  </g>
                );
              })}
              <Result p={p} a="집기 성공" b="놓은 오차 1 mm 미만" ca="blue" cb="blue" delay={2} />
            </g>
          );
        })()}
        {/* C: release heights 0 / 10 / 40 mm and the speed at the table */}
        {(() => {
          const p = p63[2];
          return (
            <g>
              {DROPS.map((d, k) => {
                const x = p.x + 44 + k * 160;
                const rel = floor - BLK - d.h * S63;
                return (
                  <g key={k}>
                    <Suction x={x + BLK * 0.64} y={rel - BLK * 0.14} len={80} />
                    {d.h > 0 && <Blk x={x} y={rel} s={BLK} c="gray" dash />}
                    {d.h > 0 && <Arrow x1={x + BLK + 40} y1={rel + BLK / 2} x2={x + BLK + 40} y2={floor - BLK / 2 + 6} c={d.c} w={6} an={0.4 + k * 0.4} />}
                    <G an={0.6 + k * 0.4}>
                      <Blk x={x} y={floor - BLK} s={BLK} />
                    </G>
                    <T x={x + BLK / 2 + 12} y={floor + 48} s={32} b>
                      {`${d.h} mm`}
                    </T>
                    <T x={x + BLK / 2 + 12} y={p.y + p.h - 40} s={30} b c={d.c} delay={0.8 + k * 0.4}>
                      {d.v}
                    </T>
                  </g>
                );
              })}
              <T x={p.x + p.w / 2} y={floor + 100} s={30} c="gray">
                펌프를 끄는 높이
              </T>
              <Result p={p} a="부딪는 속도" ca="ink" delay={2} />
            </g>
          );
        })()}
      </g>
    );
  },
};

/* ─────────────────────────── 6-4 쌓기 */

/**
 * F3Stack: three blocks stacked by the pump at three speeds. Above: the finished tower. Below: the
 * torque of the hardest joint against its limit, same axes in all three (time to the right). The numbers
 * are the panel's own results (deterministic physics): 18.8 · 10.3 · 5.3 s, peak 37 · 63 · 239 %, lean 0.5 · 1.8 · 8 mm.
 */
const p64 = cols(3);
const SPEED64 = [
  { how: '5차 · 최대 90°/s', timeS: 18.8, peak: 37, leanMm: 0.5, trap: false, c: 'blue' as Color, lean: [0, 1, 2], tower: '반듯' },
  { how: '5차 · 최대 180°/s', timeS: 10.3, peak: 63, leanMm: 1.8, trap: false, c: 'orange' as Color, lean: [0, 2, 5], tower: '거의 반듯' },
  { how: '사다리꼴 · 최대 400°/s', timeS: 5.3, peak: 239, leanMm: 8, trap: true, c: 'red' as Color, lean: [0, 9, 26], tower: '맨 위 어긋남' },
];
/** The time axis runs to 20 s; each run ends at its own time. */
const T64 = 20;
/** Torque (% of limit) over a run ending at `end`: gravity plus one hill per block (three blocks). */
function shape(u: number, trap: boolean): number {
  const hill = Math.sin(Math.PI * u) ** 2;
  return trap ? hill ** 3 * 0.75 + (Math.sin(Math.PI * 4 * u) ** 2) * hill * 0.35 : hill;
}
const SHAPE_MAX = { false: 1, true: Math.max(...Array.from({ length: 1001 }, (_, i) => shape(i / 1000, true))) };
/** Torque (% of limit) over a run of `end` s peaking at `peak` %: gravity (30 %) plus one hill per block. */
function torque(t: number, end: number, peak: number, trap: boolean): number {
  if (t > end) return 0;
  const u = ((t / end) * 3) % 1;
  return 30 + ((peak - 30) * shape(u, trap)) / SHAPE_MAX[`${trap}`];
}

export const fig64: FigureDef = {
  caption: '빠르기에 따른 블록 세 개 쌓기: 느리게 · 빠르게 · 너무 빠르게의 탑, 걸린 시간과 토크(한계 100%)',
  label: '블록 세 개 탑을 느리게 · 빠르게 · 너무 빠르게 쌓은 결과: 걸린 시간 18.8 · 10.3 · 5.3 s, 가장 힘든 관절의 최대 토크 37 · 63 · 239 %(한계 100%), 탑 기울기 0.5 · 1.8 · 8 mm. 너무 빠르게만 한계를 넘고 맨 위 블록이 어긋남',
  panels: p64.map((p, i) => ({ ...p, title: ['느리게: 반듯, 한계 안', '빠르게: 거의 반듯, 한계 안', '너무 빠르게: 한계 넘음, 어긋남'][i] })),
  draw: () => (
    <g>
      <Dividers panels={p64} />
      {p64.map((p, i) => {
        const sp = SPEED64[i];
        const cx = p.x + p.w / 2;
        const floor = 430;
        const b = 74;
        const x0 = cx - b / 2 - 40;
        return (
          <g key={i}>
            <Title p={p}>{['A  느리게', 'B  빠르게', 'C  너무 빠르게'][i]}</Title>
            <T x={cx} y={100} s={28} c="ink">
              {sp.how}
            </T>
            {/* the finished tower */}
            <Ln x1={cx - 150} y1={floor} x2={cx + 150} y2={floor} w={7} />
            {sp.lean.map((dx, k) => (
              <G key={k} an={0.2 + k * 0.3}>
                <Blk x={x0 + dx} y={floor - b * (k + 1) - 2 * k} s={b} c={i === 2 && k === 2 ? 'red' : 'ink'} />
              </G>
            ))}
            {i === 2 && (
              <g>
                <Ln x1={x0} y1={floor} x2={x0} y2={floor - 3 * b - 70} c="gray" w={3} dash />
                <Ln x1={x0} y1={floor - 3 * b - 44} x2={x0 + sp.lean[2]} y2={floor - 3 * b - 44} c="red" w={5} />
                <Ln x1={x0 + sp.lean[2]} y1={floor - 3 * b - 58} x2={x0 + sp.lean[2]} y2={floor - 3 * b - 30} c="red" w={5} />
              </g>
            )}
            {sp.tower.split(' 어').map((line, k, all) => (
              <T key={k} x={x0 + b + 50 + (i === 2 ? 24 : 0)} y={floor - 2.4 * b + k * 38} s={30} b c={i === 2 ? 'red' : 'blue'} a="start" delay={1.2}>
                {all.length > 1 && k === 1 ? `어${line}` : line}
              </T>
            ))}
            {/* torque of the hardest joint, % of its limit */}
            <Graph x={p.x + 100} y={530} w={360} h={190} xMax={T64} yMax={250} xLabel="시간 (s)" yLabel="토크 (%)" yTicks={[100, 200]}>
              {(s) => (
                <g>
                  <Level s={s} v={100} label="한계 100%" c="red" />
                  <Poly pts={curve(s, (t) => torque(t, sp.timeS, sp.peak, sp.trap), sp.timeS, sp.trap ? 400 : 200).map(([x, y]) => [x, Math.max(s.y, y)] as [number, number])} c={sp.c} w={4} an={0.4} />
                  <Ln x1={s.sx(sp.timeS)} y1={s.sy(0) - 14} x2={s.sx(sp.timeS)} y2={s.sy(0) + 14} c="ink" w={5} />
                </g>
              )}
            </Graph>
            <Result
              p={p}
              a={i === 2 ? '토크 한계 넘음' : '토크 한계 안'}
              b={`${sp.timeS} s · 최대 ${sp.peak}% · 기울기 ${sp.leanMm} mm`}
              ca={i === 2 ? 'red' : 'blue'}
              cb={i === 2 ? 'red' : 'ink'}
              delay={1.8}
            />
          </g>
        );
      })}
    </g>
  ),
};

export const FIGS6: Record<string, FigureDef> = { '6-1': fig61, '6-2': fig62, '6-3': fig63, '6-4': fig64 };
