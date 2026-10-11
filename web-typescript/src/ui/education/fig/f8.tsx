/** Figures for 학문 8 로봇 학습 (그림 제작 요청서 §2, 원고 8-로봇학습.md 의 탐구 활동 1 · 2 · 3 기준). */

import { downArm, topView } from './f7';
import { Arm, Arrow, Base, C, Check, Cross, Dividers, Dot, Floor, G, Grid, Ln, P, Poly, T, Title, cols, rad, type Color, type FigureDef, type Panel } from './kit';

/* ─────────────────────────── shared parts */

/** A suction cup (흡착 컵) whose bottom is at (x, y). */
function Cup({ x, y, c = 'ink' }: { x: number; y: number; c?: Color }) {
  return <path d={`M${x - 12} ${y - 16} L${x + 12} ${y - 16} L${x + 21} ${y} L${x - 21} ${y} Z`} fill={C.white} stroke={C[c]} strokeWidth={5} strokeLinejoin="round" />;
}

/** A side-view arm with the suction cup, the cup's bottom at (tx, ty). */
function PumpArm({ bx, by, tx, ty, c = 'ink', dash }: { bx: number; by: number; tx: number; ty: number; c?: Color; dash?: boolean }) {
  const pts = downArm(bx, by, tx, ty - 16, [190, 170, 52]);
  return (
    <g>
      <Arm pts={pts} w={18} c={c} dash={dash} gripper={false} />
      <Cup x={tx} y={ty} c={c} />
    </g>
  );
}

/** A side-view block (front face) standing on the floor at centre x. */
function SideBlock({ x, floor, s = 46, c = 'ink', fill = C.light, dash }: { x: number; floor: number; s?: number; c?: Color; fill?: string; dash?: boolean }) {
  return <rect x={x - s / 2} y={floor - s} width={s} height={s} fill={dash ? 'none' : fill} stroke={C[c]} strokeWidth={4} strokeDasharray={dash ? '10 8' : undefined} />;
}

/* ─────────────────────────── 8-1 시연으로 배우기 */

const ease = (u: number) => u * u * (3 - 2 * u);
/** G4Demo: 12 samples per move between key poses (0.05 s apart), eased; the tool point in page coordinates. */
function demoDots(keys: readonly [number, number][]): [number, number][] {
  const out: [number, number][] = [keys[0]];
  for (let s = 0; s + 1 < keys.length; s += 1)
    for (let k = 1; k <= 12; k += 1) {
      const u = ease(k / 12);
      out.push([keys[s][0] + (keys[s + 1][0] - keys[s][0]) * u, keys[s][1] + (keys[s + 1][1] - keys[s][1]) * u]);
    }
  return out;
}

const FLOOR81 = 540;
const scene81 = (p: Panel) => {
  const bx = p.x + 78;
  const block = p.x + 400;
  const place = p.x + 232;
  const top = FLOOR81 - 46;
  const keys: [number, number][] = [
    [p.x + 300, 250],
    [block, 400],
    [block, top],
    [block, 400],
    [place, 400],
    [place, top],
    [place, 400],
    [p.x + 300, 250],
  ];
  return { bx, by: FLOOR81 - 30, block, place, top, dots: demoDots(keys) };
};

const p81 = cols(3);
export const fig81: FigureDef = {
  label: '흡착 컵으로 블록을 옮기는 시연을 0.05 s 마다 기록, 블록을 옮긴 뒤 그대로 재생하면 허공을 집음, 시연 3개를 섞어 처음 보는 자리 (205, 5) 의 블록을 집음',
  caption: '시연에서 배우기: 시연 1개 기록 · 블록을 옮기고 그대로 재생 · 시연 3개를 섞어 새 자리 (205, 5) 에서 집기',
  symbols: ['x', 'y', 'w'],
  panels: p81.map((p, i) => ({ ...p, title: ['시연 1개', '블록 옮기고 재생', '시연 3개로 일반화'][i] })),
  draw: () => (
    <g>
      <Dividers panels={p81} />
      <PanelA81 p={p81[0]} />
      <PanelB81 p={p81[1]} />
      <PanelC81 p={p81[2]} />
    </g>
  ),
};

function PanelA81({ p }: { p: Panel }) {
  const s = scene81(p);
  const cols81 = ['t (s)', 'J1', 'J2', 'J3', 'J4', 'J5', 'J6'];
  const colX = (i: number) => p.x + 70 + (i === 0 ? 0 : 50 + i * 56);
  return (
    <g>
      <Title p={p}>A 시연 1개</Title>
      <Floor x1={p.x + 30} x2={p.x + p.w - 30} y={FLOOR81} />
      <Base x={s.bx} y={FLOOR81} s={0.9} />
      <SideBlock x={s.place} floor={FLOOR81} c="gray" dash />
      <T x={s.place} y={FLOOR81 + 40} s={28} c="gray">
        놓는 곳
      </T>
      <SideBlock x={s.block} floor={FLOOR81} />
      <PumpArm bx={s.bx} by={s.by} tx={s.block} ty={s.top} />
      {s.dots.map(([x, y], i) => (
        <Dot key={i} x={x} y={y} rr={5} c="blue" an={0.2 + i * 0.025} />
      ))}
      <T x={p.x + 330} y={176} a="start" s={28} b c="blue" delay={0.3}>
        ● 0.05 s 마다
      </T>
      <Ln x1={s.block + 26} y1={s.top - 8} x2={s.block + 70} y2={s.top - 70} c="gray" w={3} />
      <T x={s.block + 74} y={s.top - 78} a="middle" s={28}>
        흡착 컵
      </T>
      {/* the record: one row per 0.05 s */}
      <g>
        {cols81.map((h, i) => (
          <T key={h} x={colX(i)} y={636} s={28} b>
            {h}
          </T>
        ))}
        <Ln x1={p.x + 30} y1={652} x2={p.x + p.w - 30} y2={652} c="gray" w={3} />
        {['0.00', '0.05', '0.10'].map((t, r) => (
          <G key={t} an={0.6 + r * 0.4}>
            <T x={colX(0)} y={694 + r * 42} s={28}>
              {t}
            </T>
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <rect key={i} x={colX(i) - 20} y={680 + r * 42} width={40} height={12} rx={6} fill={C.gray} />
            ))}
          </G>
        ))}
        <T x={colX(0)} y={810} s={28} c="gray">
          ⋮
        </T>
      </g>
      <T x={p.x + p.w / 2} y={858} s={32} b c="blue" delay={1.8}>
        시연한 자리 → 집음
      </T>
    </g>
  );
}

function PanelB81({ p }: { p: Panel }) {
  // the same scene as 활동 1, set 25 px to the left so the "허공" mark stays inside the panel
  const s = scene81({ ...p, x: p.x - 25 });
  const moved = s.block - 110;
  return (
    <g>
      <Title p={p}>B 블록 옮기고 재생</Title>
      <Floor x1={p.x + 30} x2={p.x + p.w - 30} y={FLOOR81} />
      <Base x={s.bx} y={FLOOR81} s={0.9} />
      {s.dots.map(([x, y], i) => (
        <Dot key={i} x={x} y={y} rr={5} c="gray" />
      ))}
      <SideBlock x={s.block} floor={FLOOR81} c="gray" dash />
      <T x={s.block} y={FLOOR81 + 40} s={28} c="gray">
        시연한 자리
      </T>
      <G an={0.3}>
        <SideBlock x={moved} floor={FLOOR81} />
      </G>
      <G an={0.8}>
        <PumpArm bx={s.bx} by={s.by} tx={s.block} ty={s.top} />
      </G>
      <Cross x={s.block + 52} y={s.top - 40} s={16} an={1.4} />
      <T x={s.block + 76} y={s.top - 30} a="start" s={32} b c="red" delay={1.4}>
        허공
      </T>
      {/* how far the replay misses */}
      <Ln x1={moved} y1={FLOOR81 + 60} x2={moved} y2={FLOOR81 + 120} c="gray" w={3} />
      <Ln x1={s.block} y1={FLOOR81 + 60} x2={s.block} y2={FLOOR81 + 120} c="gray" w={3} />
      <Arrow x1={moved} y1={FLOOR81 + 100} x2={s.block} y2={FLOOR81 + 100} c="red" w={5} both an={1.6} />
      <T x={(moved + s.block) / 2} y={FLOOR81 + 160} s={30} b c="red" delay={1.6}>
        약 110 mm
      </T>
      <T x={moved - 50} y={FLOOR81 + 40} a="end" s={28}>
        옮긴 블록
      </T>
      <T x={p.x + p.w / 2} y={858} s={32} b c="red" delay={1.8}>
        그대로 재생 → 허공을 집음
      </T>
    </g>
  );
}

/** G4Demo positions (mm): the three demonstrations, the new spot and the blend weights wᵢ ∝ 1/dᵢ². */
const DEMOS: [number, number][] = [
  [180, -40],
  [240, 0],
  [180, 40],
];
const TEST: [number, number] = [205, 5];
const W81 = (() => {
  const raw = DEMOS.map(([x, y]) => 1 / ((TEST[0] - x) ** 2 + (TEST[1] - y) ** 2));
  const sum = raw.reduce((a, b) => a + b, 0);
  return raw.map((v) => v / sum);
})();

function PanelC81({ p }: { p: Panel }) {
  const m = topView(p.x + 266, 330, 212, 2, 2.05);
  const corner = [m(130, 115), m(130, -110), m(295, -110), m(295, 115)];
  // the demonstrated range: the demos' triangle, a little wider
  const cx = DEMOS.reduce((a, d) => a + d[0], 0) / 3;
  const cy = DEMOS.reduce((a, d) => a + d[1], 0) / 3;
  const range = DEMOS.map(([x, y]) => m(cx + (x - cx) * 1.35, cy + (y - cy) * 1.35));
  const t = m(...TEST);
  const out = m(282, -92);
  return (
    <g>
      <Title p={p}>C 시연 3개로 일반화</Title>
      <Grid x={corner[0][0]} y={corner[2][1]} w={corner[1][0] - corner[0][0]} h={corner[0][1] - corner[2][1]} step={30.75} />
      <Poly pts={corner} c="gray" w={3} closed />
      <G an={0.6}>
        <path d={`M${range.map((q) => q.join(' ')).join(' L')} Z`} fill={C.blue} fillOpacity={0.14} stroke={C.blue} strokeWidth={4} strokeDasharray="12 9" strokeLinejoin="round" />
      </G>
      <T x={(range[0][0] + range[2][0]) / 2} y={corner[0][1] - 16} s={28} b c="blue" delay={0.6}>
        시연 범위
      </T>
      {DEMOS.map((d, i) => {
        const [x, y] = m(...d);
        return (
          <g key={i}>
            <Dot x={x} y={y} rr={11} c="ink" an={0.2 + i * 0.2} />
            <T x={x} y={i === 1 ? y - 46 : y + 44} s={28} b>
              {`시연 ${i + 1}`}
            </T>
          </g>
        );
      })}
      <G an={1.2}>
        <rect x={t[0] - 15} y={t[1] - 15} width={30} height={30} fill={C.white} stroke={C.blue} strokeWidth={5} />
      </G>
      <Check x={t[0] + 44} y={t[1] - 2} s={14} an={1.4} />
      <T x={t[0]} y={t[1] + 50} s={28} b c="blue" delay={1.2}>
        (205, 5)
      </T>
      <Cross x={out[0]} y={out[1]} s={14} an={1.7} />
      <T x={out[0] - 26} y={out[1] + 10} a="end" s={28} b c="red" delay={1.7}>
        범위 밖 → 빗나감
      </T>
      {/* robot directions */}
      <Arrow x1={p.x + 486} y1={corner[0][1] + 66} x2={p.x + 486} y2={corner[0][1] + 14} c="axisX" w={4} />
      <T x={p.x + 504} y={corner[0][1] + 36} a="start" c="axisX" s={28} b>
        x
      </T>
      <Arrow x1={p.x + 486} y1={corner[0][1] + 66} x2={p.x + 430} y2={corner[0][1] + 66} c="axisY" w={4} />
      <T x={p.x + 414} y={corner[0][1] + 76} c="axisY" s={28} b>
        y
      </T>
      {/* blend weights */}
      <T x={p.x + 40} y={632} a="start" s={28} b>
        섞은 비율 w
      </T>
      {W81.map((w, i) => (
        <G key={i} an={1.8 + i * 0.15}>
          <T x={p.x + 40} y={680 + i * 42} a="start" s={28}>
            {`시연 ${i + 1}`}
          </T>
          <rect x={p.x + 150} y={662 + i * 42} width={w * 520} height={24} fill={i === 1 ? C.blue : C.gray} />
          {i === 1 && (
            <T x={p.x + 162 + w * 520} y={683 + i * 42} a="start" s={28} b c="blue">
              약 47%
            </T>
          )}
        </G>
      ))}
      <T x={p.x + p.w / 2} y={858} s={32} b c="blue" delay={2.2}>
        새 자리 → 집음
      </T>
    </g>
  );
}

/* ─────────────────────────── 8-2 캡스톤 */

/** Capstone.tsx: pick zone, the 60 mm divider, the three squares, and the layouts of A, B (5 random places, seed 82) and C (3 blocks). */
const ZONE = { x0: 150, x1: 270, y0: -130, y1: -10 };
const DIVIDER = { x0: 120, x1: 270, y0: 15, y1: 30 };
type Col3 = 'red' | 'blue' | 'green';
const COL: Record<Col3, { c: Color; name: string; bin: [number, number] }> = {
  red: { c: 'red', name: '빨강', bin: [120, 120] },
  blue: { c: 'blue', name: '파랑', bin: [175, 115] },
  green: { c: 'axisY', name: '초록', bin: [225, 95] },
};
const A82: [Col3, number, number][] = [['red', 220, -70]];
const B82: [Col3, number, number][] = [
  ['red', 234, -38],
  ['red', 212, -57],
  ['red', 210, -83],
  ['red', 250, -81],
  ['red', 195, -56],
];
const C82: [Col3, number, number][] = [
  ['red', 230, -93],
  ['blue', 182, -84],
  ['green', 175, -31],
];

const BAND_H = 316;
const p82 = cols(3, BAND_H, 900 - BAND_H);
const band: Panel = { x: 0, y: 0, w: 1600, h: BAND_H, title: '다섯 단계' };
export const fig82: FigureDef = {
  label: '보기 → 좌표 → 역기구학 → 경로 → 집기·놓기 다섯 단계, 블록 1개 정해진 자리, 무작위 5곳, 블록 3개 색 분류를 위에서 본 책상',
  caption: '보고 판단해서 집어 놓기: 다섯 단계 파이프라인(위)과 블록 1개 정해진 자리 · 무작위 5곳 · 3개 색 분류(아래)',
  symbols: ['u', 'v', 'x', 'y', 'θ'],
  panels: [band, ...p82.map((p, i) => ({ ...p, title: ['블록 1개 · 정해진 자리', '블록 1개 · 무작위 자리', '블록 3개 · 색 분류'][i] }))],
  draw: () => (
    <g>
      <Dividers panels={[band, ...p82]} />
      <Stages />
      {p82.map((p, i) => (
        <Table82 key={i} p={p} k={(['A', 'B', 'C'] as const)[i]} />
      ))}
    </g>
  ),
};

const STAGES = [
  { name: '1 보기', ref: '7-2', out: '(u, v) px' },
  { name: '2 좌표', ref: '7-1', out: '(x, y) mm' },
  { name: '3 역기구학', ref: '2-2', out: '관절 각' },
  { name: '4 경로', ref: '6-2', out: '칸막이 넘는 길' },
  { name: '5 집기·놓기', ref: '6-3', out: '같은 색 칸' },
];

function Stages() {
  const bw = 262;
  const gap = (1600 - 48 - 5 * bw) / 4;
  const y = 30;
  const h = 252;
  return (
    <g>
      {STAGES.map((st, i) => {
        const x = 24 + i * (bw + gap);
        const cx = x + bw / 2;
        const iy = y + 128;
        return (
          <G key={i} an={0.1 + i * 0.4}>
            <rect x={x} y={y} width={bw} height={h} rx={16} fill={C.white} stroke={C.ink} strokeWidth={4} />
            <T x={x + 16} y={y + 44} a="start" s={32} b>
              {st.name}
            </T>
            <T x={x + bw - 14} y={y + 44} a="end" s={28} c="gray">
              {st.ref}
            </T>
            {i === 0 && (
              <g>
                <rect x={cx - 66} y={iy - 50} width={132} height={99} fill={C.white} stroke={C.ink} strokeWidth={3} />
                {(['red', 'blue', 'green'] as Col3[]).map((k, j) => {
                  const [u, v] = [cx - 34 + j * 34, iy - 18 + (j % 2) * 34];
                  return (
                    <g key={k}>
                      <rect x={u - 11} y={v - 11} width={22} height={22} fill={C[COL[k].c]} />
                      <path d={`M${u - 16} ${v} L${u + 16} ${v} M${u} ${v - 16} L${u} ${v + 16}`} stroke={C.ink} strokeWidth={3} />
                    </g>
                  );
                })}
              </g>
            )}
            {i === 1 && (
              <g>
                <Grid x={cx - 106} y={iy - 58} w={80} h={72} step={18} />
                <rect x={cx - 106} y={iy - 58} width={80} height={72} fill="none" stroke={C.ink} strokeWidth={3} />
                <T x={cx - 66} y={iy + 46} s={28}>
                  px
                </T>
                <Arrow x1={cx - 16} y1={iy - 22} x2={cx + 18} y2={iy - 22} w={5} c="blue" />
                <Grid x={cx + 28} y={iy - 58} w={80} h={72} step={18} />
                <rect x={cx + 28} y={iy - 58} width={80} height={72} fill="none" stroke={C.ink} strokeWidth={3} />
                <T x={cx + 68} y={iy + 46} s={28}>
                  mm
                </T>
              </g>
            )}
            {i === 2 && (
              <g>
                <Arm pts={[[cx - 60, iy + 56], [cx - 30, iy - 30], [cx + 46, iy - 8], [cx + 46, iy + 40]]} w={12} gripper={false} />
                <P d={`M${cx - 30 + 26 * Math.cos(rad(-20))} ${iy - 30 - 26 * Math.sin(rad(-20))} A26 26 0 0 0 ${cx - 30 - 26 * Math.cos(rad(70)) + 4} ${iy - 30 + 26 * Math.sin(rad(70)) - 2}`} c="blue" w={4} />
                <T x={cx + 2} y={iy + 46} s={28} b c="blue">
                  θ
                </T>
              </g>
            )}
            {i === 3 && (
              <g>
                <Floor x1={cx - 96} x2={cx + 96} y={iy + 46} />
                <rect x={cx - 9} y={iy - 14} width={18} height={60} fill={C.gray} stroke={C.ink} strokeWidth={3} />
                <P d={`M${cx - 80} ${iy + 36} C${cx - 70} ${iy - 70} ${cx + 70} ${iy - 70} ${cx + 80} ${iy + 36}`} c="blue" w={5} dash />
                <Arrow x1={cx + 76} y1={iy + 8} x2={cx + 80} y2={iy + 36} c="blue" w={5} />
              </g>
            )}
            {i === 4 && (
              <g>
                {(['red', 'blue', 'green'] as Col3[]).map((k, j) => {
                  const bx = cx - 76 + j * 76;
                  return (
                    <g key={k}>
                      <rect x={bx - 30} y={iy - 30} width={60} height={60} fill={C[COL[k].c]} fillOpacity={0.12} stroke={C[COL[k].c]} strokeWidth={4} />
                      <rect x={bx - 13} y={iy - 13} width={26} height={26} fill={C[COL[k].c]} />
                    </g>
                  );
                })}
              </g>
            )}
            <T x={cx} y={y + h - 26} s={28} b c="blue">
              {st.out}
            </T>
            {i < 4 && <Arrow x1={x + bw + 8} y1={y + h / 2} x2={x + bw + gap - 8} y2={y + h / 2} w={5} />}
          </G>
        );
      })}
    </g>
  );
}

function Table82({ p, k }: { p: Panel; k: 'A' | 'B' | 'C' }) {
  const s = 1.22;
  // the table sits a little right of centre so the square names fit outside its left edge
  const m = topView(p.x + 292, p.y + 296, 140, 0, s);
  const blocks = k === 'A' ? A82 : k === 'B' ? B82 : C82;
  const table = [m(60, 150), m(60, -150), m(298, -150), m(298, 150)];
  const z = [m(ZONE.x0, ZONE.y1), m(ZONE.x0, ZONE.y0), m(ZONE.x1, ZONE.y0), m(ZONE.x1, ZONE.y1)];
  const d0 = m(DIVIDER.x1, DIVIDER.y1);
  const d1 = m(DIVIDER.x0, DIVIDER.y0);
  const robot = m(0, 0);
  const title = k === 'A' ? 'A 블록 1개 · 정해진 자리' : k === 'B' ? 'B 블록 1개 · 무작위 자리' : 'C 블록 3개 · 색 분류';
  const result = k === 'A' ? '빨강 칸에 놓음 · 1 / 1' : k === 'B' ? '매번 찾아 놓음 · 5 / 5' : '같은 색 칸 · 분류 3 / 3';
  const half = 25 * s;
  return (
    <g>
      <Title p={p}>{title}</Title>
      <Grid x={table[0][0]} y={table[2][1]} w={table[1][0] - table[0][0]} h={table[0][1] - table[2][1]} step={24.4} />
      <Poly pts={table} c="gray" w={3} closed />
      {/* the robot at the table's edge */}
      <circle cx={robot[0]} cy={robot[1]} r={30} fill={C.white} stroke={C.ink} strokeWidth={5} />
      <circle cx={robot[0]} cy={robot[1]} r={8} fill={C.ink} />
      <T x={robot[0] + 44} y={robot[1] + 10} a="start" s={28}>
        로봇
      </T>
      {/* pick zone */}
      <Poly pts={z} c="gray" w={3} dash closed />
      <T x={z[1][0] - 4} y={z[1][1] + 38} a="end" s={28}>
        집는 곳
      </T>
      {/* divider */}
      <rect x={d0[0]} y={d0[1]} width={d1[0] - d0[0]} height={d1[1] - d0[1]} fill={C.gray} stroke={C.ink} strokeWidth={4} />
      <T x={(d0[0] + d1[0]) / 2 + 30} y={d1[1] + 38} s={28} b>
        칸막이 60 mm
      </T>
      {/* the coloured squares */}
      {(Object.keys(COL) as Col3[]).map((key) => {
        const [x, y] = m(...COL[key].bin);
        return (
          <g key={key}>
            <rect x={x - half} y={y - half} width={half * 2} height={half * 2} fill={C[COL[key].c]} fillOpacity={0.1} stroke={C[COL[key].c]} strokeWidth={4} />
            <T x={table[0][0] - 10} y={y + 10} a="end" s={28} c={COL[key].c}>
              {COL[key].name}
            </T>
          </g>
        );
      })}
      {/* each block and the way it is carried (over the divider) to its square */}
      {blocks.map(([key, bx, by], i) => {
        const [x0, y0] = m(bx, by);
        const [x1, y1] = m(...COL[key].bin);
        const off = k === 'B' ? (i - 2) * 6 : 0;
        const qx = (x0 + x1) / 2 + off;
        const qy = Math.min(y0, y1) - 40 + off * 2;
        const a = 1.1 * (k === 'B' ? 0.4 : 0.5);
        return (
          <g key={i}>
            <rect x={x0 - 12.5 * s} y={y0 - 12.5 * s} width={25 * s} height={25 * s} fill={C[COL[key].c]} fillOpacity={k === 'B' ? 0.55 : 1} stroke={C.ink} strokeWidth={3} />
            <P d={`M${x0} ${y0} Q${qx} ${qy} ${x1 + (k === 'B' ? (i - 2) * 4 : 0)} ${y1}`} c="ink" w={k === 'B' ? 3 : 4} an={0.3 + i * a} />
            <G an={0.9 + i * a}>
              <rect x={x1 - 10 + (k === 'B' ? (i - 2) * 4 : 0)} y={y1 - 10} width={20} height={20} fill={C[COL[key].c]} stroke={C.ink} strokeWidth={2} />
            </G>
          </g>
        );
      })}
      <T x={p.x + p.w / 2} y={858} s={32} b c="blue" delay={2.2}>
        {result}
      </T>
    </g>
  );
}

export const FIGS8: Record<string, FigureDef> = { '8-1': fig81, '8-2': fig82 };
