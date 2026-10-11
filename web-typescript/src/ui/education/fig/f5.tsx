/**
 * Figures for 학문 5 로봇 제어공학 (그림 제작 요청서 §2; numbers from 5-로봇제어공학.md).
 * The curves are the one-joint model of the 5-x practice screens (topics/5-control/joint1.tsx
 * `simulate`), sampled every 50 ms once with a node script and pasted here — this
 * file stays plain drawing code.
 */

import type { ReactNode } from 'react';

import { Arc, Arm, Arrow, Base, C, Check, Cross, Dividers, Dot, Floor, G, Graph, Ln, Poly, T, Title, cols, rad, type Color, type FigureDef, type Scale } from './kit';

/* ─────────────────────────── the one-joint model's runs (θ in °, every 50 ms) */

const RUN = {
  /** 5-1 A: open loop, no load. */
  open0: [0,1.2,4.4,8.9,14.3,20.1,26,31.7,37.1,41.9,46.2,50,53.1,55.8,58,59.7,61.1,62.1,62.9,63.4,63.7,63.9,64,63.9,63.8,63.6,63.4,63.2,62.9,62.7,62.4,62.1,61.9,61.7,61.4,61.2,61,60.9,60.7,60.6,60.5,60.4,60.3,60.2,60.1,60.1,60,60,60,60,59.9,59.9,59.9,59.9,59.9,59.9,59.9,59.9,59.9,59.9,59.9],
  /** 5-1 B: open loop, 250 g. */
  open250: [0,0.7,2.7,5.6,9.1,13.1,17.1,21,24.5,27.6,30.1,31.9,33.2,33.8,33.8,33.4,32.6,31.4,30.1,28.6,27.1,25.7,24.4,23.2,22.3,21.6,21.2,20.9,20.9,21.1,21.4,21.9,22.4,22.9,23.5,24,24.5,24.9,25.2,25.4,25.6,25.7,25.6,25.6,25.4,25.3,25.1,24.9,24.7,24.5,24.3,24.1,24,23.9,23.9,23.9,23.9,23.9,24,24,24.1],
  /** 5-1 C and 5-2 A: P (Kp 4), 250 g. */
  p250: [0,4,14.8,30.7,47.9,62.5,71.8,74.7,71.5,63.6,53.1,42.7,34.5,29.9,29.6,33,38.9,45.6,51.6,55.7,57.3,56.4,53.5,49.5,45.4,42,40.1,39.8,40.9,43.1,45.7,48.1,49.9,50.6,50.4,49.3,47.8,46.2,44.8,44,43.8,44.2,45,46,47,47.7,48,48,47.6,47,46.4,45.8,45.5,45.4,45.5,45.8,46.2,46.6,46.9,47,47],
  /** 5-2 B: PI (Kp 4, Ki 6), 250 g. */
  pi250: [0,4,14.8,31,50.1,68,81.4,87.9,87.1,79.7,67.5,53.5,40.7,31.9,28.7,31.5,39.3,50,61.1,70.4,76.1,77.4,74.5,68.3,60.2,52.1,45.8,42.3,42.5,45.8,51.5,58.1,64.2,68.6,70.7,70.1,67.2,62.8,57.8,53.5,50.5,49.6,50.7,53.4,57.2,61,64.2,66.1,66.5,65.4,63.2,60.3,57.5,55.3,54.1,54.2,55.3,57.3,59.6,61.7,63.3],
  /** 5-2 C: PID (Kp 4, Ki 6, Kd 0.4), 250 g. */
  pid250: [0,4,14.5,27.8,40.8,51.4,58.8,63.1,64.9,64.8,63.5,61.8,60,58.5,57.4,56.8,56.6,56.7,57,57.4,57.9,58.3,58.6,58.8,59,59.1,59.2,59.2,59.2,59.2,59.3,59.3,59.3,59.4,59.4,59.5,59.5,59.5,59.6,59.6,59.7,59.7,59.7,59.7,59.7,59.8,59.8,59.8,59.8,59.8,59.8,59.8,59.9,59.9,59.9,59.9,59.9,59.9,59.9,59.9,59.9],
  /** 5-3 A: PID following a 3 s quintic, no load (0–4 s). */
  slow3: [0,0,0,0,0.1,0.2,0.3,0.5,0.8,1.2,1.6,2.1,2.7,3.4,4.2,5.1,6.1,7.2,8.3,9.6,10.9,12.3,13.7,15.3,16.9,18.5,20.2,21.9,23.7,25.5,27.3,29.1,30.9,32.8,34.6,36.4,38.1,39.9,41.5,43.2,44.8,46.3,47.7,49.1,50.4,51.6,52.7,53.8,54.7,55.6,56.3,57,57.5,58,58.4,58.7,59,59.1,59.3,59.3,59.4,59.4,59.4,59.5,59.5,59.5,59.6,59.6,59.6,59.7,59.7,59.7,59.7,59.8,59.8,59.8,59.8,59.8,59.8,59.9,59.9],
  /** 5-3 B: the same, 1 s. */
  fast1: [0,0,0.1,0.6,1.7,3.6,6.3,9.8,14,18.9,24.2,29.6,35.1,40.3,45.1,49.2,52.6,55.2,57,58,58.3,58.3,58.2,58.1,58,58,58.1,58.2,58.3,58.5,58.6,58.7,58.8,58.9,59,59.1,59.2,59.2,59.3,59.4,59.4,59.5,59.5,59.6,59.6,59.6,59.7,59.7,59.7,59.7,59.8,59.8,59.8,59.8,59.8,59.8,59.9,59.9,59.9,59.9,59.9,59.9,59.9,59.9,59.9,59.9,59.9,59.9,59.9,60,60,60,60,60,60,60,60,60,60,60,60],
  /** 5-3 C: 1 s with feedforward. */
  fast1ff: [0,0.1,0.5,1.6,3.5,6.2,9.8,14.1,19.1,24.4,30,35.6,41,45.9,50.2,53.8,56.5,58.4,59.5,59.9,60,60,60,60,60,60,60,60,60,60,60,60,60,60,60,60,60,60,60,60,60,60,60,60,60,60,60,60,60,60,60,60,60,60,60,60,60,60,60,60,60,60,60,60,60,60,60,60,60,60,60,60,60,60,60,60,60,60,60,60,60],
} as const;
const STEP_S = 0.05;

/** A run as graph points. */
const pts = (s: Scale, y: readonly number[]) => y.map((v, i) => [s.sx(i * STEP_S), s.sy(v)] as [number, number]);

/** The command of 5-3: a quintic 0° → 60° in T s. */
const quintic = (T: number, t: number) => {
  const u = Math.min(1, Math.max(0, t / T));
  return 60 * (10 * u ** 3 - 15 * u ** 4 + 6 * u ** 5);
};

/* ─────────────────────────── shared parts */

/** Graph with the time label above the end of the x axis (the kit puts it on the tick row, where it meets the last tick). */
function TGraph({ xLabel, children, ...g }: Parameters<typeof Graph>[0]) {
  return (
    <Graph {...g} xLabel="">
      {(s) => (
        <g>
          {children(s)}
          <T x={s.x + s.w + 30} y={s.sy(Math.max(g.yMin ?? 0, 0)) - 16} a="end" s={28}>
            {xLabel}
          </T>
        </g>
      )}
    </Graph>
  );
}

/** The shoulder as a pendulum (the one-joint model): θ from straight down, swinging out to the right. */
const tipAt = (px: number, py: number, L: number, th: number): [number, number] => [px + L * Math.sin(rad(th)), py + L * Math.cos(rad(th))];

/** Robot body: floor, base, a post and the shoulder bracket ending at the pivot (px, py). */
function Body({ px, py, floorY, x1, x2 }: { px: number; py: number; floorY: number; x1: number; x2: number }) {
  const bx = px - 52;
  return (
    <g>
      <Floor x1={x1} x2={x2} y={floorY} />
      <Ln x1={bx} y1={floorY - 26} x2={bx} y2={py} w={24} />
      <Ln x1={bx} y1={py} x2={px} y2={py} w={24} />
      <Base x={bx} y={floorY} s={0.9} />
    </g>
  );
}

/** The arm (one bar + gripper) at θ. */
function Link({ px, py, L, th, c = 'ink', dash, an, opacity }: { px: number; py: number; L: number; th: number; c?: Color; dash?: boolean; an?: number; opacity?: number }) {
  return <Arm pts={[[px, py], tipAt(px, py, L, th)]} c={c} w={20} dash={dash} tipAngle={-90 + th} an={an} opacity={opacity} />;
}

/** A small block diagram row: target → (⊕) → box1 → joint → θ, with the sensor line back (or crossed out). */
function Loop({ x0, y, box1, over1, closed, load }: { x0: number; y: number; box1: string; over1: string; closed: boolean; load?: string }) {
  const sum = x0 + 112;
  const b1 = [x0 + 150, 160] as const;
  const b2 = [x0 + 352, 92] as const;
  const out = x0 + 488;
  const fbY = y + 72;
  const fbC: Color = closed ? 'ink' : 'gray';
  return (
    <g>
      <T x={x0 + 24} y={y + 10} a="start" b c="blue">
        60°
      </T>
      <T x={x0 + 24} y={y - 46} a="start" s={28} c="gray">
        목표
      </T>
      <Arrow x1={x0 + 76} y1={y} x2={sum - 18} y2={y} w={4} />
      <circle cx={sum} cy={y} r={18} fill={C.white} stroke={C[closed ? 'ink' : 'gray']} strokeWidth={4} />
      {closed && <path d={`M${sum - 9} ${y} H${sum + 9} M${sum} ${y - 9} V${y + 9}`} stroke={C.ink} strokeWidth={4} />}
      <Arrow x1={sum + 18} y1={y} x2={b1[0]} y2={y} w={4} />
      <rect x={b1[0]} y={y - 34} width={b1[1]} height={68} rx={12} fill={C.white} stroke={C[closed ? 'blue' : 'ink']} strokeWidth={4} />
      <T x={b1[0] + b1[1] / 2} y={y + 10} s={28} b c={closed ? 'blue' : 'ink'}>
        {box1}
      </T>
      <T x={b1[0] + b1[1] / 2} y={y - 46} s={28} c="gray">
        {over1}
      </T>
      <Arrow x1={b1[0] + b1[1]} y1={y} x2={b2[0]} y2={y} w={4} />
      <rect x={b2[0]} y={y - 34} width={b2[1]} height={68} rx={12} fill={C.white} stroke={C.ink} strokeWidth={4} />
      <T x={b2[0] + b2[1] / 2} y={y + 10} s={28} b>
        관절
      </T>
      <Arrow x1={b2[0] + b2[1]} y1={y} x2={out - 14} y2={y} w={4} />
      <T x={out} y={y + 10} b c="orange">
        θ
      </T>
      {load && (
        <g>
          <Arrow x1={b2[0] + b2[1] / 2} y1={y - 96} x2={b2[0] + b2[1] / 2} y2={y - 36} c="orange" w={5} />
          <T x={b2[0] + b2[1] / 2 + 16} y={y - 74} a="start" s={28} b c="orange">
            {load}
          </T>
        </g>
      )}
      {/* sensor line back to the comparison */}
      <G an={closed ? 0.4 : undefined}>
        <Poly
          pts={[
            [out - 30, y],
            [out - 30, fbY],
            [sum, fbY],
            [sum, y + 20],
          ]}
          c={fbC}
          w={4}
          dash={!closed}
        />
        {closed ? (
          <path d={`M${sum} ${y + 20} l-9 16 h18 Z`} fill={C.ink} />
        ) : (
          <Cross x={(sum + out - 30) / 2} y={fbY} s={14} c="red" />
        )}
        <T x={(sum + out - 30) / 2 + (closed ? 0 : 30)} y={fbY + 36} s={28} a={closed ? 'middle' : 'start'} c={closed ? 'ink' : 'red'}>
          {closed ? '센서 (잰 각도)' : '안 봄'}
        </T>
      </G>
    </g>
  );
}

/* ─────────────────────────── 5-1 피드백의 원리 */

const p51 = cols(3);
const R51 = [
  { title: 'A 개루프 · 짐 0 g', y: RUN.open0, th: 59.9, kg: '', closed: false, err: '오차 0.1°', res: '60° 에 섬 · 오차 0.1°', c: 'blue' as Color },
  { title: 'B 개루프 · 짐 250 g', y: RUN.open250, th: 24.1, kg: '250 g', closed: false, err: '오차 약 36°', res: '약 24° 에서 멈춤 · 오차 36°', c: 'red' as Color },
  { title: 'C P 제어 · 짐 250 g', y: RUN.p250, th: 47, kg: '250 g', closed: true, err: '오차 13°', res: '약 47° 에 섬 · 오차 13°', c: 'orange' as Color },
];
export const fig51: FigureDef = {
  caption: '개루프와 피드백(P 제어)의 어깨 각도: 짐 0 g 개루프 · 짐 250 g 개루프 · 짐 250 g P 제어 (목표 60°)',
  symbols: ['θ', 'Kp'],
  label: '어깨 관절 하나를 0° 에서 60° 로: 짐 없는 개루프는 60° 에 서고, 짐 250 g 의 개루프는 약 24° 에서 멈추고, 같은 짐의 P 제어는 약 47° 까지 올라간다',
  panels: p51.map((p, i) => ({ ...p, title: R51[i].title })),
  draw: () => (
    <g>
      <Dividers panels={p51} />
      {p51.map((p, i) => {
        const r = R51[i];
        const x0 = p.x;
        const px = x0 + 170;
        const py = 312;
        const L = 150;
        const floorY = 545;
        const tip = tipAt(px, py, L, r.th);
        const gTip = tipAt(px, py, L + 40, 60);
        return (
          <g key={i}>
            <Title p={p}>{r.title}</Title>
            <Loop x0={x0} y={170} box1={r.closed ? 'Kp × 오차' : '0.54 N·m'} over1={r.closed ? 'P 제어' : '계산한 토크'} closed={r.closed} load={r.kg ? `짐 ${r.kg}` : undefined} />
            {/* the arm: start (gray), goal (blue dashed), where it stopped */}
            <Body px={px} py={py} floorY={floorY} x1={x0 + 40} x2={x0 + p.w - 40} />
            <Link px={px} py={py} L={L} th={0} c="gray" dash />
            <Link px={px} py={py} L={L} th={60} c="blue" dash />
            <T x={gTip[0] + 30} y={gTip[1] - 4} a="start" s={28} b c="blue">
              목표 60°
            </T>
            <G an={1.4}>
              <Link px={px} py={py} L={L} th={r.th} />
              {r.kg && (
                <g>
                  <Ln x1={tip[0] + 22 * Math.sin(rad(r.th))} y1={tip[1] + 22 * Math.cos(rad(r.th))} x2={tip[0] + 22 * Math.sin(rad(r.th))} y2={tip[1] + 44} c="orange" w={4} />
                  <rect x={tip[0] + 22 * Math.sin(rad(r.th)) - 20} y={tip[1] + 44} width={40} height={34} rx={6} fill={C.orange} />
                </g>
              )}
            </G>
            {i > 0 && <Arc cx={px} cy={py} rr={L + 40} from={-90 + r.th} to={-30} c={r.c} w={6} an={1.8} />}
            {i > 0 && (
              <T x={px + (L + 78) * Math.sin(rad((r.th + 60) / 2))} y={py + (L + 78) * Math.cos(rad((r.th + 60) / 2)) + 10} a="start" s={28} b c={r.c} delay={2}>
                {r.err}
              </T>
            )}
            {/* angle over 3 s */}
            <TGraph x={x0 + 100} y={608} w={360} h={180} xMax={3} yMax={80} xLabel="시간(s)" yLabel="어깨 각도(°)" xTicks={[1, 2, 3]} yTicks={[0, 30, 60]}>
              {(s) => (
                <g>
                  <Ln x1={s.x} y1={s.sy(60)} x2={s.x + s.w} y2={s.sy(60)} c="blue" w={4} dash />
                  <Poly pts={pts(s, r.y)} c="orange" w={6} an={0.2} />
                </g>
              )}
            </TGraph>
            <T x={x0 + p.w / 2} y={872} s={32} b c={r.c} delay={2.2}>
              {r.res}
            </T>
          </g>
        );
      })}
    </g>
  ),
};


/* ─────────────────────────── 5-2 PID 제어 */

/** A shower (line drawing): the knob at (x, y), the pipe up to the head; `mode` is how the hand turns the knob. */
function Shower({ x, y, mode, an }: { x: number; y: number; mode: 'P' | 'I' | 'D'; an?: number }) {
  const hx = x + 66;
  const hy = y - 140;
  return (
    <g>
      <Poly
        pts={[
          [x, y - 30],
          [x, hy],
          [hx, hy],
        ]}
        w={8}
      />
      <path d={`M${hx - 10} ${hy - 6} L${hx + 30} ${hy - 6} L${hx + 46} ${hy + 22} L${hx - 26} ${hy + 22} Z`} fill={C.white} stroke={C.ink} strokeWidth={5} strokeLinejoin="round" />
      {[-14, 10, 34].map((d) => (
        <Ln key={d} x1={hx + d} y1={hy + 40} x2={hx + d - 6} y2={hy + 92} c="blue" w={4} dash />
      ))}
      <circle cx={x} cy={y} r={28} fill={C.white} stroke={C.ink} strokeWidth={5} />
      <Ln x1={x} y1={y} x2={x} y2={y - 20} w={6} />
      <G an={an}>
        {mode === 'P' && <Arc cx={x} cy={y} rr={50} from={160} to={20} c="blue" w={6} head />}
        {mode === 'I' && (
          <g>
            <Arc cx={x} cy={y} rr={52} from={172} to={128} c="blue" w={6} head />
            <Arc cx={x} cy={y} rr={52} from={112} to={68} c="blue" w={6} head />
            <Arc cx={x} cy={y} rr={52} from={52} to={8} c="blue" w={6} head />
          </g>
        )}
        {mode === 'D' && (
          <g>
            <Arc cx={x} cy={y} rr={50} from={160} to={60} c="blue" w={6} />
            <Ln x1={x + 50 * Math.cos(rad(60)) - 14} y1={y - 50 * Math.sin(rad(60)) - 22} x2={x + 50 * Math.cos(rad(60)) + 14} y2={y - 50 * Math.sin(rad(60)) + 22} c="red" w={8} />
          </g>
        )}
      </G>
    </g>
  );
}

const p52 = cols(3);
const R52 = [
  { title: 'A P 만 · Kp 4', y: RUN.p250, term: 'P · 지금 오차', how: ['차이만큼 돌리기', '(가까우면 조금만)'], mode: 'P' as const },
  { title: 'B PI · + Ki 6', y: RUN.pi250, term: '+ I · 쌓인 오차', how: ['계속 미지근하면', '조금씩 더'], mode: 'I' as const },
  { title: 'C PID · + Kd 0.4', y: RUN.pid250, term: '+ D · 변하는 빠르기', how: ['빨리 변하면 미리 멈춤', '(브레이크)'], mode: 'D' as const },
];
export const fig52: FigureDef = {
  caption: '게인을 하나씩 더할 때의 계단 응답: P 만 · PI · PID (짐 250 g, 목표 60°)',
  symbols: ['Kp', 'Ki', 'Kd'],
  label: '짐 250 g 에서 어깨 0° → 60° 계단 응답: P 만은 25% 넘친 뒤 13° 모자라고, PI 는 47% 넘쳐 3 초가 지나도 출렁이고, PID 는 8% 넘친 뒤 약 1.2 초에 ±2% 띠 안에 든다',
  panels: p52.map((p, i) => ({ ...p, title: R52[i].title })),
  draw: () => (
    <g>
      <Dividers panels={p52} />
      {p52.map((p, i) => {
        const r = R52[i];
        const x0 = p.x;
        return (
          <g key={i}>
            <Title p={p}>{r.title}</Title>
            <TGraph x={x0 + 100} y={150} w={360} h={450} xMax={3} yMax={90} xLabel="시간(s)" yLabel="어깨 각도(°)" xTicks={[1, 2, 3]} yTicks={[0, 30, 60, 90]}>
              {(s) => {
                const vArrow = (t: number, a: number, b: number, c: Color, an: number) => <Arrow x1={s.sx(t)} y1={s.sy(a)} x2={s.sx(t)} y2={s.sy(b)} c={c} w={4} both an={an} />;
                return (
                  <g>
                    <rect x={s.x} y={s.sy(61.2)} width={s.w} height={s.sy(58.8) - s.sy(61.2)} fill={C.blue} fillOpacity={0.18} />
                    <Ln x1={s.x} y1={s.sy(60)} x2={s.x + s.w} y2={s.sy(60)} c="blue" w={4} dash />
                    <Poly pts={pts(s, r.y)} c="orange" w={6} an={0.2} />
                    {i === 0 && (
                      <g>
                        {vArrow(0.35, 60, 74.7, 'orange', 1.4)}
                        <T x={s.sx(0.5)} y={s.sy(80)} a="start" s={28} b c="orange" delay={1.4}>
                          오버슈트 25%
                        </T>
                        {vArrow(2.9, 47, 60, 'red', 1.8)}
                        <T x={s.sx(2.8)} y={s.sy(34)} a="end" s={28} b c="red" delay={1.8}>
                          남은 오차 13°
                        </T>
                      </g>
                    )}
                    {i === 1 && (
                      <g>
                        {vArrow(0.37, 60, 88.5, 'red', 1.4)}
                        <T x={s.sx(0.52)} y={s.sy(84)} a="start" s={28} b c="red" delay={1.4}>
                          오버슈트 47%
                        </T>
                        <T x={s.sx(3)} y={s.sy(30)} a="end" s={28} b c="red" delay={1.8}>
                          3 s 지나도 출렁임
                        </T>
                      </g>
                    )}
                    {i === 2 && (
                      <g>
                        <Ln x1={s.sx(0.42)} y1={s.sy(65)} x2={s.sx(0.62)} y2={s.sy(76)} c="orange" w={3} />
                        <T x={s.sx(0.64)} y={s.sy(76) + 8} a="start" s={28} b c="orange" delay={1.4}>
                          오버슈트 8%
                        </T>
                        <G an={1.8}>
                          <Ln x1={s.sx(1.15)} y1={s.sy(0)} x2={s.sx(1.15)} y2={s.sy(58.8)} c="blue" w={4} dash />
                        </G>
                        <T x={s.sx(1.15) + 12} y={s.sy(22)} a="start" s={28} b c="blue" delay={1.8}>
                          정착 약 1.2 s
                        </T>
                        <T x={s.sx(3)} y={s.sy(48)} a="end" s={28} b c="blue" delay={2.2}>
                          남은 오차 0.1°
                        </T>
                      </g>
                    )}
                  </g>
                );
              }}
            </TGraph>
            <rect x={x0 + 282} y={100} width={36} height={22} fill={C.blue} fillOpacity={0.18} />
            <Ln x1={x0 + 282} y1={111} x2={x0 + 318} y2={111} c="blue" w={4} dash />
            <T x={x0 + 326} y={121} a="start" s={28} c="blue">
              목표 60° ±2%
            </T>
            {/* the shower: what the term does */}
            <Shower x={x0 + 76} y={836} mode={r.mode} an={2} />
            <T x={x0 + 196} y={712} a="start" s={30} b c="blue">
              {r.term}
            </T>
            {r.how.map((l, j) => (
              <T key={j} x={x0 + 196} y={770 + j * 40} a="start" s={28}>
                {l}
              </T>
            ))}
          </g>
        );
      })}
    </g>
  ),
};

/* ─────────────────────────── 5-3 궤적 추종 */

/** A small box with a label (block diagram). */
function Blk({ x, y, w, h = 64, children, c = 'ink', dash }: { x: number; y: number; w: number; h?: number; children: ReactNode; c?: Color; dash?: boolean }) {
  return (
    <g>
      <rect x={x} y={y - h / 2} width={w} height={h} rx={12} fill={C.white} stroke={C[c]} strokeWidth={4} strokeDasharray={dash ? '12 9' : undefined} />
      <T x={x + w / 2} y={y + 10} s={28} b c={c}>
        {children}
      </T>
    </g>
  );
}

/** A summing junction. */
function Sum({ x, y, c = 'ink' }: { x: number; y: number; c?: Color }) {
  return (
    <g>
      <circle cx={x} cy={y} r={16} fill={C.white} stroke={C[c]} strokeWidth={4} />
      <path d={`M${x - 8} ${y} H${x + 8} M${x} ${y - 8} V${y + 8}`} stroke={C[c]} strokeWidth={4} />
    </g>
  );
}

const p53 = cols(3);
const R53 = [
  { title: 'A 느리게 3 s', T: 3, y: RUN.slow3, ff: false, tMax: 1.73, rMax: 38.5, yMax: 35.6, gap: '약 3°', res: '최대 추종 오차 약 3°', c: 'orange' as Color },
  { title: 'B 빠르게 1 s', T: 1, y: RUN.fast1, ff: false, tMax: 0.55, rMax: 35.6, yMax: 29.6, gap: '약 6°', res: '최대 약 6° · 끝난 뒤 0.7 s 더', c: 'red' as Color },
  { title: 'C 빠르게 1 s + 피드포워드', T: 1, y: RUN.fast1ff, ff: true, tMax: 0, rMax: 0, yMax: 0, gap: '', res: '최대 추종 오차 0.1° 아래', c: 'blue' as Color },
];
export const fig53: FigureDef = {
  caption: '궤적을 따라가는 어깨 각도와 추종 오차: 3 s · 1 s · 1 s + 피드포워드 (0° → 60°)',
  symbols: ['r', 'θ'],
  label: '어깨를 0° → 60° 명령 궤적으로: 3 초에는 최대 약 3° 뒤처지고, 1 초에는 약 6° 뒤처져 끝난 뒤 0.7 초 더 걸리고, 피드포워드를 더하면 0.1° 아래로 겹친다',
  panels: p53.map((p, i) => ({ ...p, title: R53[i].title })),
  draw: () => (
    <g>
      <Dividers panels={p53} />
      {p53.map((p, i) => {
        const r = R53[i];
        const x0 = p.x;
        const my = 700;
        const fy = 596;
        const fbY = my + 62;
        const sum1 = x0 + 118;
        const sum2 = x0 + 304;
        const out = x0 + 478;
        const ffC: Color = r.ff ? 'blue' : 'gray';
        return (
          <g key={i}>
            <Title p={p}>{r.title}</Title>
            {/* legend */}
            <Ln x1={x0 + 290} y1={111} x2={x0 + 326} y2={111} c="blue" w={4} dash />
            <T x={x0 + 334} y={121} a="start" s={28} c="blue">
              명령
            </T>
            <Ln x1={x0 + 410} y1={111} x2={x0 + 446} y2={111} c="orange" w={6} />
            <T x={x0 + 454} y={121} a="start" s={28} c="orange">
              실제
            </T>
            <TGraph x={x0 + 100} y={160} w={360} h={320} xMax={4} yMax={70} xLabel="시간(s)" yLabel="어깨 각도(°)" xTicks={[1, 2, 3, 4]} yTicks={[0, 30, 60]}>
              {(s) => (
                <g>
                  <Ln x1={s.sx(r.T)} y1={s.sy(0)} x2={s.sx(r.T)} y2={s.sy(66)} c="gray" w={3} dash />
                  <Poly pts={Array.from({ length: 81 }, (_, k) => [s.sx(k * STEP_S), s.sy(quintic(r.T, k * STEP_S))] as [number, number])} c="blue" w={4} dash />
                  <Poly pts={pts(s, r.y)} c="orange" w={6} an={0.2} />
                  {r.gap && (
                    <G an={1.6}>
                      <Ln x1={s.sx(r.tMax)} y1={s.sy(r.rMax)} x2={s.sx(r.tMax)} y2={s.sy(r.yMax)} c="red" w={8} />
                      {i === 0 ? (
                        // Up and to the left, clear of the dashed "궤적 끝 3 s" line on the right.
                        <g>
                          <Ln x1={s.sx(r.tMax) - 10} y1={s.sy(r.rMax) - 4} x2={s.sx(1.25)} y2={s.sy(45)} c="red" w={3} />
                          <T x={s.sx(0.15)} y={s.sy(57)} a="start" s={28} b c="red">
                            추종 오차
                          </T>
                          <T x={s.sx(0.15)} y={s.sy(57) + 36} a="start" s={28} b c="red">
                            {r.gap}
                          </T>
                        </g>
                      ) : (
                        <g>
                          <Ln x1={s.sx(r.tMax) + 8} y1={(s.sy(r.rMax) + s.sy(r.yMax)) / 2} x2={s.sx(r.tMax) + 52} y2={(s.sy(r.rMax) + s.sy(r.yMax)) / 2 + 30} c="red" w={3} />
                          <T x={s.sx(r.tMax) + 56} y={(s.sy(r.rMax) + s.sy(r.yMax)) / 2 + 58} a="start" s={28} b c="red">
                            {`추종 오차 ${r.gap}`}
                          </T>
                        </g>
                      )}
                    </G>
                  )}
                  {i === 0 && (
                    <G an={2}>
                      <T x={s.sx(3) + 12} y={s.sy(60) + 42} a="start" s={28} b c="blue">
                        ±1° 안
                      </T>
                      <Check x={s.sx(3) + 132} y={s.sy(60) + 32} s={14} />
                    </G>
                  )}
                  {i === 1 && (
                    <G an={2}>
                      <Arrow x1={s.sx(1)} y1={s.sy(46)} x2={s.sx(1.69)} y2={s.sy(46)} c="red" w={4} />
                      <T x={s.sx(1.75)} y={s.sy(46) + 10} a="start" s={28} b c="red">
                        +0.7 s
                      </T>
                    </G>
                  )}
                  {i === 2 && (
                    <G an={1.6}>
                      <T x={s.sx(1.3)} y={s.sy(34)} a="start" s={28} b c="blue">
                        명령 = 실제
                      </T>
                      <Check x={s.sx(1.3) + 180} y={s.sy(34) - 10} s={14} />
                    </G>
                  )}
                  <T x={s.sx(r.T)} y={s.sy(66) - 8} s={28} c="gray">
                    {`궤적 끝 ${r.T} s`}
                  </T>
                </g>
              )}
            </TGraph>
            {/* block diagram: feedback, and the feedforward path beside it */}
            <T x={x0 + 12} y={my + 10} a="start" b c="blue">
              r(t)
            </T>
            <Arrow x1={x0 + 68} y1={my} x2={sum1 - 16} y2={my} w={4} />
            <Sum x={sum1} y={my} />
            <Arrow x1={sum1 + 16} y1={my} x2={x0 + 160} y2={my} w={4} />
            <Blk x={x0 + 160} y={my} w={100}>
              PID
            </Blk>
            <Arrow x1={x0 + 260} y1={my} x2={sum2 - 16} y2={my} w={4} />
            <Sum x={sum2} y={my} c={r.ff ? 'blue' : 'ink'} />
            <Arrow x1={sum2 + 16} y1={my} x2={x0 + 350} y2={my} w={4} />
            <Blk x={x0 + 350} y={my} w={92}>
              관절
            </Blk>
            <Arrow x1={x0 + 442} y1={my} x2={out - 14} y2={my} w={4} />
            <T x={out} y={my + 10} b c="orange">
              θ
            </T>
            <Poly
              pts={[
                [out - 22, my],
                [out - 22, fbY],
                [sum1, fbY],
                [sum1, my + 30],
              ]}
              w={4}
            />
            <path d={`M${sum1} ${my + 17} l-9 16 h18 Z`} fill={C.ink} />
            <T x={(sum1 + out) / 2} y={fbY + 34} s={28}>
              센서
            </T>
            <G an={r.ff ? 1 : undefined}>
              <Poly
                pts={[
                  [x0 + 84, my],
                  [x0 + 84, fy],
                  [x0 + 116, fy],
                ]}
                c={ffC}
                w={4}
                dash={!r.ff}
              />
              <Blk x={x0 + 116} y={fy} w={174} c={ffC} dash={!r.ff}>
                피드포워드
              </Blk>
              <Poly
                pts={[
                  [x0 + 290, fy],
                  [sum2, fy],
                  [sum2, my - 34],
                ]}
                c={ffC}
                w={4}
                dash={!r.ff}
              />
              <path d={`M${sum2} ${my - 17} l-9 -16 h18 Z`} fill={C[ffC]} />
              <Dot x={x0 + 84} y={my} rr={7} c={ffC} />
              {r.ff ? (
                <T x={sum2 + 14} y={fy + 50} a="start" s={28} b c="blue">
                  켬
                </T>
              ) : (
                <g>
                  <Cross x={sum2} y={fy + 40} s={12} c="red" />
                  <T x={sum2 + 22} y={fy + 50} a="start" s={28} b c="red">
                    끔
                  </T>
                </g>
              )}
            </G>
            <T x={x0 + 205} y={fy - 44} s={28} c={r.ff ? 'blue' : 'gray'}>
              관성 + 마찰 + 중력
            </T>
            <T x={x0 + p.w / 2} y={870} s={32} b c={r.c} delay={2.2}>
              {r.res}
            </T>
          </g>
        );
      })}
    </g>
  ),
};

/* ─────────────────────────── 5-4 힘 제한과 안전 여유 */

/** A hand (line drawing, icon size): palm centred at (x, y), fingers toward `angle` (deg, y up). */
function Hand({ x, y, angle, s = 1 }: { x: number; y: number; angle: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${-angle}) scale(${s})`}>
      <path
        d="M-34 -30 Q-40 0 -34 30 L10 34 L46 30 Q54 28 52 20 Q50 14 40 14 L52 14 Q60 12 60 4 Q60 -4 52 -4 L56 -4 Q64 -6 62 -14 Q60 -22 52 -20 L50 -20 Q58 -24 54 -32 Q50 -38 40 -34 L10 -34 Q18 -48 6 -54 Q-4 -56 -10 -40 Z"
        fill="#FBF4EE"
        stroke={C.ink}
        strokeWidth={4}
        strokeLinejoin="round"
      />
    </g>
  );
}

const p54 = cols(3);
const N_M = 137; // px per N·m on the bars
const R54 = [
  { title: 'A 토크 제한 3 N·m', lim: 3, push: 2.56, pushT: '2.6', arrive: '손 없을 때 60° 도착 약 1.1 s', res: '손을 누르는 토크 약 2.6 N·m', c: 'red' as Color, w: 16 },
  { title: 'B 토크 제한 1.5 N·m', lim: 1.5, push: 1.08, pushT: '1.1', arrive: '손 없을 때 60° 도착 약 1.5 s', res: '손을 누르는 토크 약 1.1 N·m', c: 'orange' as Color, w: 9 },
  { title: 'C 토크 제한 0.6 N·m', lim: 0.6, push: 0.2, pushT: '0.2', arrive: '손 없을 때 60° 도착 약 2.6 s', res: '손을 누르는 토크 약 0.2 N·m', c: 'blue' as Color, w: 4 },
];
export const fig54: FigureDef = {
  caption: '토크 제한에 따라 손을 누르는 토크: 3 · 1.5 · 0.6 N·m (손 40° 자리)',
  label: '어깨가 올라가다 40° 자리의 손에 막힐 때, 토크 제한 3 · 1.5 · 0.6 N·m 에서 손을 계속 누르는 토크는 약 2.6 · 1.1 · 0.2 N·m (= 제한 − 중력 토크 0.40), 60° 에서 버티는 데는 0.54 N·m 가 든다',
  panels: p54.map((p, i) => ({ ...p, title: R54[i].title })),
  draw: () => (
    <g>
      <Dividers panels={p54} />
      {p54.map((p, i) => {
        const r = R54[i];
        const x0 = p.x;
        const px = x0 + 170;
        const py = 150;
        const L = 190;
        const floorY = 445;
        const tip = tipAt(px, py, L + 30, 40);
        const dir = [Math.cos(rad(40)), -Math.sin(rad(40))];
        const hand = [tip[0] + dir[0] * 64, tip[1] + dir[1] * 64];
        const bx = x0 + 90;
        const by = 580;
        const gx = bx + 0.4 * N_M;
        const lx = bx + r.lim * N_M;
        const hx = bx + 0.54 * N_M;
        return (
          <g key={i}>
            <Title p={p}>{r.title}</Title>
            {/* the arm stopped by the hand at 40° */}
            <Body px={px} py={py} floorY={floorY} x1={x0 + 40} x2={x0 + p.w - 40} />
            <Arc cx={px} cy={py} rr={L + 34} from={-90} to={-50} c="gray" w={4} dash />
            <Link px={px} py={py} L={L} th={0} c="gray" dash />
            <Link px={px} py={py} L={L} th={40} an={0.2} />
            <Hand x={hand[0] + 34} y={hand[1] - 10} angle={-140} s={0.9} />
            <Arc cx={px} cy={py} rr={L + 34} from={-50} to={-30} c="blue" w={4} dash head />
            <T x={x0 + p.w - 24} y={hand[1] - 70} a="end" s={28} b c="blue">
              목표 60°
            </T>
            <T x={hand[0] + 50} y={hand[1] + 76} a="middle" s={28} b>
              손 40°
            </T>
            <G an={0.9}>
              <Arrow x1={tip[0] - dir[0] * 10} y1={tip[1] - dir[1] * 10} x2={hand[0] - dir[0] * 4} y2={hand[1] - dir[1] * 4} c={r.c} w={r.w} />
            </G>
            {/* the torque: gravity at 40° + what presses the hand = the limit */}
            <rect x={bx} y={by} width={3 * N_M} height={50} fill="none" stroke={C.light} strokeWidth={3} />
            <G an={1.3}>
              <rect x={bx} y={by} width={0.4 * N_M} height={50} fill={C.gray} />
              <rect x={gx} y={by} width={lx - gx} height={50} fill={C[r.c]} />
            </G>
            <Ln x1={lx} y1={by - 14} x2={lx} y2={by + 64} c="red" w={4} />
            <T x={Math.max(x0 + 80, (gx + lx) / 2)} y={by - 20} s={28} b c={r.c} a={(gx + lx) / 2 < x0 + 80 ? 'start' : 'middle'} delay={1.5}>
              {`누름 ${r.pushT}`}
            </T>
            <T x={hx - 12} y={by + 92} a="end" s={28} c="gray">
              중력 0.40
            </T>
            <T x={bx + 3 * N_M} y={by + 92} a="end" s={28} c="gray">
              3 N·m
            </T>
            <Ln x1={hx} y1={by - 6} x2={hx} y2={by + 108} c="blue" w={4} dash />
            <T x={hx + 10} y={by + 140} a="start" s={28} b c="blue">
              60° 버티기 0.54
            </T>
            {r.arrive && (
              <T x={x0 + p.w / 2} y={800} s={28} c={i === 2 ? 'orange' : 'ink'} delay={2}>
                {r.arrive}
              </T>
            )}
            <T x={x0 + p.w / 2} y={870} s={32} b c={r.c} delay={1.8}>
              {r.res}
            </T>
          </g>
        );
      })}
    </g>
  ),
};

/* ─────────────────────────── 5-5 오차와 캘리브레이션 */

const MM = 1.2; // px per mm in the side view
/** Points P1–P4 by their distance along the table from the J2 axis (mm), from r = 203 · 233 · 265 · 296 mm to J2 with J2 129 mm above the tips. */
const P_D = [157, 195, 231, 266];
const J2_H = 139;

/** Side-view arm reaching P4: J2 → elbow → wrist above the point → tip, rotated about J2 by `d` degrees (drawn larger than it is). */
function armTo(jx: number, jy: number, d: number): [number, number][] {
  const W: [number, number] = [P_D[3], 160 - J2_H];
  const L1 = 150;
  const dd = Math.hypot(W[0], W[1]);
  const a = Math.atan2(W[1], W[0]) + Math.acos(dd / 2 / L1);
  const E: [number, number] = [L1 * Math.cos(a), L1 * Math.sin(a)];
  const tipP: [number, number] = [P_D[3], 10 + 30 / MM - J2_H]; // the fingers reach down to the point
  const rot = ([x, y]: [number, number]): [number, number] => {
    const c = Math.cos(rad(d));
    const s = Math.sin(rad(d));
    return [jx + (x * c - y * s) * MM, jy - (x * s + y * c) * MM];
  };
  return [rot([0, 0]), rot(E), rot(W), rot(tipP)];
}

function Target({ x, y, off, c }: { x: number; y: number; off: [number, number]; c: Color }) {
  const dots: [number, number][] = [
    [0, 0],
    [7, -5],
    [-6, 6],
    [5, 8],
    [-7, -6],
  ];
  return (
    <g>
      {[66, 44, 22].map((rr) => (
        <circle key={rr} cx={x} cy={y} r={rr} fill="none" stroke={C.gray} strokeWidth={4} />
      ))}
      <Ln x1={x - 8} y1={y} x2={x + 8} y2={y} c="gray" w={3} />
      <Ln x1={x} y1={y - 8} x2={x} y2={y + 8} c="gray" w={3} />
      <G an={0.3}>
        {dots.map(([dx, dy], k) => (
          <circle key={k} cx={x + off[0] + dx} cy={y + off[1] + dy} r={7} fill={C[c]} />
        ))}
      </G>
    </g>
  );
}

const p55 = cols(3);
const R55 = [
  { title: 'A 이상적', d: 0, off: [0, 0] as [number, number], acc: ['정확도 좋음', 'blue'] as const, bars: [0, 0, 0, 0], res: '4곳 모두 오차 0 mm', c: 'blue' as Color },
  { title: 'B J2 영점 2° 어긋남', d: 6, off: [-34, -26] as [number, number], acc: ['정확도 나쁨', 'red'] as const, bars: [6.7, 7.8, 9.0, 10.1], res: '평균 8.4 mm · P4 10.1 mm', c: 'red' as Color },
  { title: 'C 측정 → 보정', d: 0, off: [0, 0] as [number, number], acc: ['정확도 좋음', 'blue'] as const, bars: [0, 0, 0, 0], res: '평균 오차 0.1 mm 아래', c: 'blue' as Color },
];
export const fig55: FigureDef = {
  caption: 'J2 영점 오차가 만드는 손끝 오차와 보정: 이상적 · 영점 2° 어긋남 · 측정 후 보정 (P1~P4)',
  label: '책상 위 P1~P4 로 손끝을 보낼 때: 이상적이면 오차 0 mm, J2 영점이 2° 어긋나면 6.7 · 7.8 · 9.0 · 10.1 mm (평균 8.4 mm) 빗나가고, 측정해 영점 1.99° 를 찾아 빼면 평균 0.1 mm 아래',
  panels: p55.map((p, i) => ({ ...p, title: R55[i].title })),
  draw: () => (
    <g>
      <Dividers panels={p55} />
      {p55.map((p, i) => {
        const r = R55[i];
        const x0 = p.x;
        const tableY = 530;
        const jx = x0 + 80;
        const jy = tableY - J2_H * MM;
        const cmd = armTo(jx, jy, 0);
        const act = armTo(jx, jy, r.d);
        const pX = P_D.map((d) => jx + d * MM);
        const pY = tableY - 10 * MM;
        return (
          <g key={i}>
            <Title p={p}>{r.title}</Title>
            {/* repeatability vs accuracy */}
            <Target x={x0 + 110} y={170} off={r.off} c={i === 1 ? 'orange' : 'blue'} />
            <T x={x0 + 210} y={160} a="start" s={28} b c="blue">
              반복 정밀도 좋음
            </T>
            <T x={x0 + 210} y={204} a="start" s={28} b c={r.acc[1]} delay={0.6}>
              {r.acc[0]}
            </T>
            {/* the arm over the table */}
            <Floor x1={x0 + 30} x2={x0 + p.w - 30} y={tableY} />
            <Ln x1={jx} y1={tableY - 24} x2={jx} y2={jy} w={24} />
            <Base x={jx} y={tableY} s={0.9} />
            {pX.map((x, k) => (
              <g key={k}>
                <Dot x={x} y={pY} rr={9} c="blue" />
                <T x={x} y={tableY + 36} s={28} c="blue">
                  {`P${k + 1}`}
                </T>
              </g>
            ))}
            {i === 1 && <Arm pts={cmd} c="blue" w={18} dash tipAngle={-90} />}
            <Arm pts={act} c={i === 1 ? 'orange' : 'ink'} w={18} tipAngle={-90 + r.d} an={0.2} />
            {i === 1 && (
              <G an={1}>
                <Arc cx={jx} cy={jy} rr={64} from={-45} to={18} c="orange" w={5} head />
                <T x={jx + 40} y={jy + 92} a="start" s={28} b c="orange">
                  J2 +2°
                </T>
                <Ln x1={act[3][0]} y1={act[3][1] + 30} x2={pX[3]} y2={pY} c="red" w={6} />
                <Ln x1={pX[3] - 8} y1={pY - 20} x2={pX[3] - 36} y2={pY - 56} c="red" w={3} />
                <T x={pX[3] - 40} y={pY - 62} a="end" s={28} b c="red">
                  10.1 mm
                </T>
              </G>
            )}
            {i === 2 && (
              <G an={1}>
                <Arc cx={jx} cy={jy} rr={64} from={18} to={-45} c="blue" w={5} head />
                <T x={jx + 40} y={jy + 92} a="start" s={28} b c="blue">
                  영점 1.99° 찾아 빼기
                </T>
                <Check x={pX[3] + 40} y={pY - 40} s={14} />
              </G>
            )}
            {i === 0 && <Check x={pX[3] + 40} y={pY - 40} s={14} an={1} />}
            {/* error at each point */}
            <TGraph x={x0 + 100} y={640} w={370} h={150} xMax={5} yMax={12} xLabel="" yLabel="오차(mm)" yTicks={[0, 5, 10]}>
              {(s) => (
                <G an={1.4}>
                  {r.bars.map((v, k) => (
                    <g key={k}>
                      <rect x={s.sx(k + 1) - 24} y={s.sy(v) - 3} width={48} height={s.sy(0) - s.sy(v) + 3} fill={C[i === 1 ? 'red' : 'blue']} />
                      <T x={s.sx(k + 1)} y={s.sy(0) + 34} s={28} c="blue">
                        {`P${k + 1}`}
                      </T>
                      {i === 1 && (
                        <T x={s.sx(k + 1)} y={s.sy(v) - 10} s={28} b c="red">
                          {v.toFixed(1)}
                        </T>
                      )}
                    </g>
                  ))}
                  {i === 0 && (
                    <T x={s.sx(2.5)} y={s.sy(5)} s={28} b c="blue">
                      모두 0
                    </T>
                  )}
                  {i === 2 && (
                    <T x={s.sx(2.5)} y={s.sy(5)} s={28} b c="blue">
                      모두 거의 0
                    </T>
                  )}
                </G>
              )}
            </TGraph>
            <T x={x0 + p.w / 2} y={876} s={32} b c={r.c} delay={2}>
              {r.res}
            </T>
          </g>
        );
      })}
    </g>
  ),
};

export const FIGS5: Record<string, FigureDef> = { '5-1': fig51, '5-2': fig52, '5-3': fig53, '5-4': fig54, '5-5': fig55 };

