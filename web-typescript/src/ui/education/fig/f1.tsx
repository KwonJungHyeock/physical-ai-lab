/** Figures for 학문 1 기초 로봇공학 (그림 제작 요청서 §2). */

import type { ReactElement } from 'react';

import { Arc, Arm, Arrow, Base, C, Dividers, Dot, Floor, G, Gripper, Ln, P, Poly, T, Title, cols, oblique, rad, type Color, type FigureDef, type Panel } from './kit';

type Pt = readonly [number, number];
type V3 = readonly [number, number, number];
type Proj = (x: number, y: number, z?: number) => [number, number];

/** A tiny repeatable random sequence (the same picture every render). */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** A horizontal circle of radius rr at height z around the z axis (degrees from → to), in a projected view. */
const ring = (o: Proj, rr: number, z: number, from: number, to: number, n = 72): [number, number][] =>
  Array.from({ length: n + 1 }, (_, i) => {
    const a = rad(from + ((to - from) * i) / n);
    return o(rr * Math.cos(a), rr * Math.sin(a), z);
  });

/** An arm given in its own vertical plane as (reach, height) points, turned by J1 = phi (deg) about z. */
const turned = (o: Proj, rz: readonly Pt[], phi: number): [number, number][] => rz.map(([r, z]) => o(r * Math.cos(rad(phi)), r * Math.sin(rad(phi)), z));

/** Two bottom lines of a panel: the result (coloured) and the summary (bold). */
function Foot({ p, result, sum, c = 'blue', sumC = 'ink' }: { p: Panel; result?: string; sum: string; c?: Color; sumC?: Color }) {
  return (
    <g>
      {result && (
        <T x={p.x + p.w / 2} y={p.y + p.h - 92} s={30} b c={c} delay={1.6}>
          {result}
        </T>
      )}
      <T x={p.x + p.w / 2} y={p.y + p.h - 36} s={38} b c={sumC}>
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

/* 1-1 관절·링크·자유도: J1 → a circle, J2·J3 → a plane, all six → space (and many directions at one point). */
const p11 = cols(3);
/** The arm in its own plane (reach, height): base top, shoulder, elbow, wrist, tip. */
const ARM11: Pt[] = [
  [0, 26],
  [0, 140],
  [36, 310],
  [160, 292],
  [160, 205],
];
export const fig11: FigureDef = {
  label: '관절 1개면 손끝 자취가 원, 관절 2개면 세로 면, 관절 6개면 공간을 채우고 같은 점에서도 방향이 여러 개 — 자유도 1 / 2 / 6',
  caption: '관절 수에 따른 손끝 자취 — 관절 1개 원 · 2개 면 · 6개 공간 (자유도 1 / 2 / 6)',
  symbols: [],
  panels: p11.map((p, i) => ({ ...p, title: ['관절 1개 — 원', '관절 2개 — 면', '관절 6개 — 공간'][i] })),
  draw: () => {
    const [pa, pb, pc] = p11;
    // A: J1 only — the tip goes round a level circle (J1 ±168°).
    const oa = oblique(pa.x + pa.w / 2, pa.y + 690, 1.3);
    const tipR = ARM11[ARM11.length - 1][0];
    const tipZ = ARM11[ARM11.length - 1][1];
    const j1 = ring(oa, 70, 70, 215, -60);
    // B: J2·J3 in a side view — rows of J3, J2 back and forth (what the screen draws), and the plane they fill.
    const floorB = pb.y + 690;
    const S: Pt = [pb.x + 250, floorB - 150];
    const L2 = 150;
    const L3 = 132;
    const tipB = (phi: number, psi: number): [number, number] => [
      S[0] + L2 * Math.cos(rad(phi)) + L3 * Math.cos(rad(phi + psi)),
      S[1] - L2 * Math.sin(rad(phi)) - L3 * Math.sin(rad(phi + psi)),
    ];
    const ROWS = 10;
    const psiOf = (r: number) => -150 + (r / (ROWS - 1)) * 128;
    const phiOf = (k: number) => 30 + (k / 30) * 118;
    const raster: [number, number][] = [];
    for (let r = 0; r < ROWS; r++) for (let k = 0; k <= 30; k++) raster.push(tipB(phiOf(r % 2 ? 30 - k : k), psiOf(r)));
    const strips = Array.from({ length: ROWS - 1 }, (_, r) => [
      ...Array.from({ length: 31 }, (_, k) => tipB(phiOf(k), psiOf(r))),
      ...Array.from({ length: 31 }, (_, k) => tipB(phiOf(30 - k), psiOf(r + 1))),
    ]);
    const elbowB = (phi: number): [number, number] => [S[0] + L2 * Math.cos(rad(phi)), S[1] - L2 * Math.sin(rad(phi))];
    const armB = (phi: number, psi: number): [number, number][] => [[S[0], floorB - 26], [S[0], S[1]], elbowB(phi), tipB(phi, psi)];
    // C: 20 random tips in space, each with the way the tool pointed; one point reached three ways.
    const oc = oblique(pc.x + pc.w / 2 - 30, pc.y + 690, 1.2);
    const rand = rng(5);
    const cloud = Array.from({ length: 20 }, () => {
      const az = -150 + rand() * 300;
      const z = 90 + rand() * 340;
      const rr = 70 + rand() * 120;
      const pt = oc(rr * Math.cos(rad(az)), rr * Math.sin(rad(az)), z);
      return { pt, d: rand() * 360 };
    });
    const palmC = oc(165, -30, 250);
    const grab: Pt = [palmC[0], palmC[1] + 26];
    // Keep the random tips clear of the three grippers at the same point and of its label.
    const clear = cloud.filter(({ pt }) => Math.hypot(pt[0] - grab[0], pt[1] - grab[1]) > 120 && !(Math.abs(pt[0] - (grab[0] - 20)) < 90 && Math.abs(pt[1] - (grab[1] + 66)) < 50));
    return (
      <g>
        <Dividers panels={p11} />
        {/* ── A */}
        <Title p={pa}>A 관절 1개 (J1)</Title>
        <Floor x1={pa.x + 30} x2={pa.x + pa.w - 30} y={pa.y + 690} />
        <Ln x1={oa(0, 0, 0)[0]} y1={oa(0, 0, 0)[1]} x2={oa(0, 0, 400)[0]} y2={oa(0, 0, 400)[1]} c="gray" w={3} dash />
        <T x={oa(0, 0, 400)[0]} y={oa(0, 0, 400)[1] - 16} s={28} c="ink">
          J1 축
        </T>
        <Arm pts={turned(oa, ARM11, 150)} c="gray" w={16} />
        <Poly pts={ring(oa, tipR, tipZ, -168, 168, 96)} c="blue" w={6} an={0.3} />
        <Arm pts={turned(oa, ARM11, -35)} />
        <Base x={oa(0, 0, 0)[0]} y={oa(0, 0, 0)[1]} s={0.9} />
        <Poly pts={j1} c="ink" w={4} />
        <Arrow x1={j1[71][0]} y1={j1[71][1]} x2={j1[72][0]} y2={j1[72][1]} w={4} />
        <T x={oa(0, 0, 0)[0] + 116} y={oa(0, 0, 70)[1] + 10} s={30} b a="start">
          J1
        </T>
        <Foot p={pa} result="자취: 원 (선)" sum="자유도 1" />

        {/* ── B */}
        <Title p={pb}>B 관절 2개 (J2·J3)</Title>
        <G an={0.2} kind="fade">
          {strips.map((st, i) => (
            <path key={i} d={`M${st.map((q) => q.join(' ')).join(' L')} Z`} fill={C.blue} fillOpacity={0.12} stroke="none" />
          ))}
        </G>
        <Poly pts={raster} c="blue" w={3} an={0.3} />
        <Floor x1={pb.x + 30} x2={pb.x + pb.w - 30} y={floorB} />
        <Arm pts={armB(130, -45)} c="gray" w={16} />
        <Arm pts={armB(62, -88)} />
        <Base x={S[0]} y={floorB} s={0.9} />
        <Halo>
          <T x={S[0] - 34} y={S[1] + 10} s={30} b a="end">
            J2
          </T>
          <T x={elbowB(62)[0] + 30} y={elbowB(62)[1] - 26} s={30} b a="start">
            J3
          </T>
          <T x={pb.x + pb.w / 2} y={pb.y + 150} s={30} b c="blue" delay={1.4}>
            세로로 선 면
          </T>
        </Halo>
        <Foot p={pb} result="자취: 면 (부채꼴)" sum="자유도 2" />

        {/* ── C */}
        <Title p={pc}>C 관절 6개 (전체)</Title>
        <Floor x1={pc.x + 30} x2={pc.x + pc.w - 30} y={pc.y + 690} />
        <G an={0.4}>
          {clear.map(({ pt, d }, i) => (
            <g key={i}>
              <Ln x1={pt[0]} y1={pt[1]} x2={pt[0] + 30 * Math.cos(rad(d))} y2={pt[1] - 30 * Math.sin(rad(d))} c="ink" w={3} />
              <Dot x={pt[0]} y={pt[1]} rr={8} c="blue" />
            </g>
          ))}
        </G>
        <Arm pts={[oc(0, 0, 26), oc(0, 0, 120), oc(40, -15, 290), oc(165, -30, 330), palmC]} w={18} />
        <Base x={oc(0, 0, 0)[0]} y={oc(0, 0, 0)[1]} s={0.9} />
        <G an={1.2}>
          {[0, 145].map((a) => {
            const d: Pt = [Math.cos(rad(a)), -Math.sin(rad(a))];
            const palm: Pt = [grab[0] - 26 * d[0], grab[1] - 26 * d[1]];
            return (
              <g key={a}>
                <Ln x1={palm[0]} y1={palm[1]} x2={palm[0] - 70 * d[0]} y2={palm[1] - 70 * d[1]} c="gray" w={14} />
                <Gripper x={palm[0]} y={palm[1]} angle={a} c="gray" />
              </g>
            );
          })}
        </G>
        <Dot x={grab[0]} y={grab[1]} rr={10} c="orange" an={1.5} />
        <Halo>
          <T x={grab[0] - 20} y={grab[1] + 76} s={28} b c="orange" delay={1.5}>
            같은 점
          </T>
        </Halo>
        <Foot p={pc} result="자취: 공간 · 같은 점, 방향 여러 개" sum="자유도 6" />
      </g>
    );
  },
};

/* 1-2 위치와 자세: x·y on the table → + z above it → the same point, two orientations; under each, the pose's six numbers filled so far. */
const p12 = cols(3);
/** The six numbers of a pose, as slots: how many each panel has fixed (2 · 3 · 6). */
const POSE_SLOTS: { t: string; c: Color }[] = [
  { t: 'x', c: 'axisX' },
  { t: 'y', c: 'axisY' },
  { t: 'z', c: 'axisZ' },
  { t: '롤', c: 'orange' },
  { t: '피치', c: 'orange' },
  { t: '요', c: 'orange' },
];
export const fig12: FigureDef = {
  label: '책상 격자에서 손끝의 x·y, 높이 z 를 더한 (x, y, z), 같은 점에서 위에서 내려다본 손끝과 옆에서 본 손끝 — 정해진 숫자 2개 · 3개 · 6개',
  caption: '손끝 포즈를 정하는 숫자 — 책상 위 (x, y) · 높이를 더한 (x, y, z) · 같은 점에서 자세만 다름 (3 + 3 = 6)',
  symbols: ['x', 'y', 'z'],
  panels: p12.map((p, i) => ({ ...p, title: ['x·y — 책상 위 한 점', '+ z — 공간의 한 점', '위치 같음, 자세 다름'][i] })),
  draw: () => (
    <g>
      <Dividers panels={p12} />
      {p12.map((p, i) => {
        const o = oblique(p.x + 75, p.y + 560, 1.0);
        const tbl = [o(0, -60), o(300, -60), o(300, 200), o(0, 200)];
        const pt: [number, number] = [200, 100];
        const at = o(pt[0], pt[1]);
        const top = o(pt[0], pt[1], i === 0 ? 0 : 200);
        const org = o(0, 0);
        const ex = o(120, 0);
        const ey = o(0, 150);
        const ez = o(0, 0, 150);
        const fixed = [2, 3, 6][i];
        const slotW = 74;
        const slotX = (k: number) => p.x + (p.w - (6 * slotW + 5 * 5 + 10)) / 2 + k * (slotW + 5) + (k >= 3 ? 10 : 0);
        const slotY = p.y + 680;
        return (
          <g key={i}>
            <Title p={p}>{['A  x · y', 'B  x · y + z', 'C  같은 점, 다른 자세'][i]}</Title>
            {/* table grid */}
            <P d={`M${tbl.map((q) => q.join(' ')).join(' L')} Z`} c="gray" w={3} />
            {[50, 100, 150, 200, 250].map((x) => (
              <Ln key={`gx${x}`} x1={o(x, -60)[0]} y1={o(x, -60)[1]} x2={o(x, 200)[0]} y2={o(x, 200)[1]} c="light" w={2} />
            ))}
            {[0, 50, 100, 150].map((y) => (
              <Ln key={`gy${y}`} x1={o(0, y)[0]} y1={o(0, y)[1]} x2={o(300, y)[0]} y2={o(300, y)[1]} c="light" w={2} />
            ))}
            {/* the robot's base on the table, and the base frame from its centre */}
            <ellipse cx={org[0]} cy={org[1]} rx={42} ry={17} fill={C.white} stroke={C.ink} strokeWidth={5} />
            <Arrow x1={org[0]} y1={org[1]} x2={ex[0]} y2={ex[1]} c="axisX" w={5} />
            <Arrow x1={org[0]} y1={org[1]} x2={ey[0]} y2={ey[1]} c="axisY" w={5} />
            <Arrow x1={org[0]} y1={org[1]} x2={ez[0]} y2={ez[1]} c="axisZ" w={5} />
            <T x={ex[0] + 12} y={ex[1] + 10} s={28} b c="axisX" a="start">
              x 앞
            </T>
            <T x={ey[0] + 10} y={ey[1] - 6} s={28} b c="axisY" a="start">
              y 왼쪽
            </T>
            <T x={ez[0]} y={ez[1] - 14} s={28} b c="axisZ">
              z 위
            </T>
            {/* the point on the table and how to read x, y */}
            <Ln x1={o(pt[0], 0)[0]} y1={o(pt[0], 0)[1]} x2={at[0]} y2={at[1]} c="gray" w={3} dash />
            <Ln x1={o(0, pt[1])[0]} y1={o(0, pt[1])[1]} x2={at[0]} y2={at[1]} c="gray" w={3} dash />
            <Dot x={at[0]} y={at[1]} rr={12} c="blue" an={0.2} />
            {i === 0 && (
              <T x={at[0] + 20} y={at[1] - 26} a="start" b c="blue" delay={0.5}>
                (x, y)
              </T>
            )}
            {i === 1 && (
              <g>
                <Arrow x1={at[0]} y1={at[1]} x2={top[0]} y2={top[1]} c="axisZ" w={6} an={0.3} />
                <T x={top[0] + 24} y={(top[1] + at[1]) / 2 + 10} a="start" c="axisZ" b>
                  z
                </T>
                <Dot x={top[0]} y={top[1]} rr={14} c="blue" an={1} />
                <T x={top[0] + 24} y={top[1] - 24} a="start" b c="blue" delay={1.1}>
                  (x, y, z)
                </T>
              </g>
            )}
            {i === 2 && (
              <g>
                <Ln x1={at[0]} y1={at[1]} x2={top[0]} y2={top[1]} c="gray" w={3} dash />
                {/* looking down: the gripper above the point, fingers pointing down at it */}
                <G an={0.3}>
                  <Ln x1={top[0]} y1={top[1] - 105} x2={top[0]} y2={top[1] - 190} c="blue" w={16} />
                  <Gripper x={top[0]} y={top[1] - 105} angle={-90} c="blue" s={1.5} open={0.6} />
                </G>
                {/* seen from the side: the gripper beside the point, fingers pointing forward at it */}
                <G an={0.9}>
                  <Ln x1={top[0] - 105} y1={top[1]} x2={top[0] - 190} y2={top[1]} c="orange" w={16} />
                  <Gripper x={top[0] - 105} y={top[1]} angle={0} c="orange" s={1.5} open={0.6} />
                </G>
                <Dot x={top[0]} y={top[1]} rr={14} c="ink" />
                <T x={top[0] - 34} y={top[1] - 150} a="end" s={30} c="blue" b>
                  위에서 내려다봄
                </T>
                <T x={top[0] - 190} y={top[1] - 40} s={30} c="orange" b>
                  옆에서 봄
                </T>
              </g>
            )}
            {/* the pose's six numbers: the ones this panel has fixed, and the ones still open */}
            {POSE_SLOTS.map((sl, k) => {
              const on = k < fixed;
              return (
                <g key={sl.t}>
                  <rect x={slotX(k)} y={slotY - 26} width={slotW} height={52} rx={8} fill={C.white} stroke={on ? C[sl.c] : C.gray} strokeWidth={on ? 4 : 3} strokeDasharray={on ? undefined : '8 7'} />
                  <T x={slotX(k) + slotW / 2} y={slotY + 10} s={28} b c={on ? sl.c : 'gray'}>
                    {sl.t}
                  </T>
                </g>
              );
            })}
            <T x={p.x + p.w / 2} y={p.y + p.h - 52} s={32} b c={i === 2 ? 'ink' : 'blue'}>
              {['숫자 2개 (x, y)', '숫자 3개 (x, y, z)', '위치 3 + 자세 3 = 6'][i]}
            </T>
          </g>
        );
      })}
    </g>
  ),
};

/* 1-3 자세 표현 — 회전의 순서: roll · pitch · yaw one at a time / the same two 90° turns in both orders / pitch 90°. */
type M3 = readonly (readonly [number, number, number])[];
const I3: M3 = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];
const rotX = (d: number): M3 => {
  const [c, s] = [Math.cos(rad(d)), Math.sin(rad(d))];
  return [
    [1, 0, 0],
    [0, c, -s],
    [0, s, c],
  ];
};
const rotY = (d: number): M3 => {
  const [c, s] = [Math.cos(rad(d)), Math.sin(rad(d))];
  return [
    [c, 0, s],
    [0, 1, 0],
    [-s, 0, c],
  ];
};
const rotZ = (d: number): M3 => {
  const [c, s] = [Math.cos(rad(d)), Math.sin(rad(d))];
  return [
    [c, -s, 0],
    [s, c, 0],
    [0, 0, 1],
  ];
};
const mulM = (a: M3, b: M3): M3 => a.map((row) => [0, 1, 2].map((j) => row[0] * b[0][j] + row[1] * b[1][j] + row[2] * b[2][j]) as [number, number, number]);
const mulV = (m: M3, v: V3): V3 => [0, 1, 2].map((i) => m[i][0] * v[0] + m[i][1] * v[1] + m[i][2] * v[2]) as unknown as V3;

/** Oblique view centred on (x, y): robot x to the right, y up-right (into the page), z up. */
const view =
  (x: number, y: number, s: number) =>
  (v: V3): [number, number] => [x + (v[0] + v[1] * 0.42) * s, y - (v[1] * 0.58 + v[2]) * s];

/**
 * A gripper model turned by R (the screen's model in 1-3): wrist rod behind,
 * two fingers pointing along its x (손끝), the palm across its y.
 */
function Hand({ x, y, R, s = 1, c = 'ink', point }: { x: number; y: number; R: M3; s?: number; c?: Color; point?: Color }) {
  const pr = view(x, y, s);
  const q = (v: V3) => pr(mulV(R, v));
  const seg = (a: V3, b: V3, w: number, key: string) => {
    const [p1, p2] = [q(a), q(b)];
    return <line key={key} x1={p1[0]} y1={p1[1]} x2={p2[0]} y2={p2[1]} stroke={C[c]} strokeWidth={w * Math.max(0.7, s)} strokeLinecap="round" />;
  };
  const tip = q([44, 0, 0]);
  const far = q([104, 0, 0]);
  return (
    <g>
      {seg([-74, 0, 0], [-22, 0, 0], 18, 'w')}
      {seg([-22, -38, 0], [-22, 38, 0], 11, 'p')}
      {seg([-22, -38, 0], [34, -38, 0], 9, 'f1')}
      {seg([-22, 38, 0], [34, 38, 0], 9, 'f2')}
      {seg([34, -38, 0], [34, -26, 0], 9, 'h1')}
      {seg([34, 38, 0], [34, 26, 0], 9, 'h2')}
      {point && <Arrow x1={tip[0]} y1={tip[1]} x2={far[0]} y2={far[1]} c={point} w={5} />}
    </g>
  );
}

/** A circular arc in 3D (centre, two in-plane unit vectors, radius, degrees), with a head at the end. */
function Arc3({ pr, c0, u, v, r, from, to, c, an }: { pr: (v: V3) => [number, number]; c0: V3; u: V3; v: V3; r: number; from: number; to: number; c: Color; an?: number }) {
  const n = 40;
  const pts = Array.from({ length: n + 1 }, (_, i) => {
    const a = rad(from + ((to - from) * i) / n);
    return pr([0, 1, 2].map((k) => c0[k] + r * (Math.cos(a) * u[k] + Math.sin(a) * v[k])) as unknown as V3);
  });
  return (
    <g>
      <Poly pts={pts} c={c} w={5} an={an} />
      <Arrow x1={pts[n - 2][0]} y1={pts[n - 2][1]} x2={pts[n][0]} y2={pts[n][1]} c={c} w={5} an={an === undefined ? undefined : an + 0.8} />
    </g>
  );
}

/** A dashed axis line through the model (local direction d, ±len). */
function Axis3({ pr, d, len, c, dash = '14 12', off = 0 }: { pr: (v: V3) => [number, number]; d: V3; len: [number, number]; c: Color; dash?: string; off?: number }) {
  const [a, b] = [pr([d[0] * len[0], d[1] * len[0], d[2] * len[0]]), pr([d[0] * len[1], d[1] * len[1], d[2] * len[1]])];
  return <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={C[c]} strokeWidth={5} strokeDasharray={dash} strokeDashoffset={off} strokeLinecap="butt" />;
}

const p13: Panel[] = [
  { x: 0, y: 0, w: 1600, h: 450, step: 'A', title: '롤 · 피치 · 요 하나씩' },
  { x: 0, y: 450, w: 800, h: 450, step: 'B', title: '같은 두 회전, 순서만 바꾸기' },
  { x: 800, y: 450, w: 800, h: 450, step: 'C', title: '피치 90° — 롤 축 = 요 축' },
];
export const fig13: FigureDef = {
  label: '그리퍼의 롤(비틀기)·피치(숙이기)·요(좌우 돌리기), 롤 90°와 피치 90°를 순서만 바꾸면 손끝이 아래와 왼쪽으로 달라짐, 피치 90°에서 롤 축과 요 축이 한 줄에 겹침',
  caption: '회전의 순서와 짐벌락 — 롤 · 피치 · 요 하나씩, 같은 두 90° 회전을 순서만 바꾸기, 피치 90° 에서 겹친 두 축',
  symbols: [],
  panels: p13,
  draw: () => {
    const [pa, pb, pc] = p13;
    const X: V3 = [1, 0, 0];
    const Y: V3 = [0, 1, 0];
    const Z: V3 = [0, 0, 1];
    const ONE = [
      { name: '롤', what: '비틀기', axis: X, c: 'axisX' as Color, R: rotX(45), len: [-140, 110] as [number, number], arc: { c0: [-52, 0, 0] as V3, u: Y, v: Z, r: 46, from: 70, to: 200 } },
      { name: '피치', what: '숙이기', axis: Y, c: 'axisY' as Color, R: rotY(45), len: [-120, 120] as [number, number], arc: { c0: [0, 0, 0] as V3, u: X, v: Z, r: 100, from: 22, to: -52 } },
      { name: '요', what: '좌우 돌리기', axis: Z, c: 'axisZ' as Color, R: rotZ(45), len: [-90, 120] as [number, number], arc: { c0: [0, 0, 0] as V3, u: X, v: Y, r: 100, from: -22, to: 62 } },
    ];
    // B: both turns about the fixed base axes (the second multiplies from the left).
    const rows = [
      { y: pb.y + 175, steps: ['롤 90°', '피치 90°'], Rs: [I3, rotX(90), mulM(rotY(90), rotX(90))], end: '손끝 아래' },
      { y: pb.y + 345, steps: ['피치 90°', '롤 90°'], Rs: [I3, rotY(90), mulM(rotX(90), rotY(90))], end: '손끝 왼쪽' },
    ];
    const bx = [pb.x + 105, pb.x + 330, pb.x + 555];
    // C: pitch 90° — the gripper looks straight down; its roll axis lies on the base z (yaw) axis.
    const cx = pc.x + 520;
    const cy = pc.y + 300;
    const prC = view(cx, cy, 1.05);
    return (
      <g>
        <Dividers panels={p13} />
        <Title p={pa}>A 축 하나씩 (0° → 45°) — 독립 회전축 3개</Title>
        {ONE.map((o, i) => {
          const x = 267 + i * 533;
          const y = 248;
          const pr = view(x, y, 1.4);
          return (
            <g key={o.name}>
              <Axis3 pr={pr} d={o.axis} len={o.len} c={o.c} />
              <Hand x={x} y={y} R={I3} s={1.4} c="gray" />
              <G an={0.4 + i * 0.5}>
                <Hand x={x} y={y} R={o.R} s={1.4} />
              </G>
              <Arc3 pr={pr} {...o.arc} c={o.c} an={0.2 + i * 0.5} />
              <T x={x - 8} y={pa.y + 418} s={34} b c={o.c} a="end">
                {o.name}
              </T>
              <T x={x + 8} y={pa.y + 418} s={30} a="start">
                {o.what}
              </T>
            </g>
          );
        })}

        <Title p={pb}>B 순서 바꾸기</Title>
        {rows.map((row, k) => (
          <g key={k}>
            {row.Rs.map((R, j) => (
              <G key={j} an={j ? 0.3 + k * 0.9 + j * 0.4 : undefined}>
                <Hand x={bx[j]} y={row.y} R={R} s={0.85} c={j ? 'ink' : 'gray'} point={j === 2 ? 'orange' : undefined} />
              </G>
            ))}
            {row.steps.map((label, j) => (
              <g key={label}>
                <Arrow x1={bx[j] + 70} y1={row.y - 6} x2={bx[j + 1] - 92} y2={row.y - 6} w={4} />
                <T x={(bx[j] + bx[j + 1]) / 2 - 10} y={row.y - 40} s={28} b>
                  {label}
                </T>
              </g>
            ))}
            <T x={pb.x + 700} y={row.y + 12} s={30} b c="orange" delay={1.2 + k * 0.9}>
              {row.end}
            </T>
          </g>
        ))}
        <T x={pb.x + 700} y={pb.y + 272} s={44} b c="orange" delay={2.2}>
          ≠
        </T>

        <Title p={pc}>C 피치 90°</Title>
        <Axis3 pr={prC} d={Z} len={[-100, 175]} c="axisZ" dash="22 22" />
        <Axis3 pr={prC} d={Z} len={[-100, 175]} c="axisX" dash="22 22" off={22} />
        {/* yaw 90° as well, so the palm faces the viewer: the same pitch-90° pose, easier to read */}
        <Hand x={cx} y={cy} R={mulM(rotZ(90), rotY(90))} s={1.05} />
        <Arc3 pr={prC} c0={[0, 0, 62]} u={X} v={Y} r={56} from={-130} to={160} c="axisX" an={0.4} />
        <Arc3 pr={prC} c0={[0, 0, 140]} u={X} v={Y} r={66} from={-130} to={160} c="axisZ" an={1.0} />
        <T x={cx + 112} y={cy - 62 * 1.05 + 12} s={32} b c="axisX" a="start">
          롤
        </T>
        <T x={cx + 124} y={cy - 140 * 1.05 + 12} s={32} b c="axisZ" a="start">
          요
        </T>
        <T x={pc.x + 40} y={pc.y + 175} s={32} b c="red" a="start" delay={1.6}>
          롤 축 = 요 축
        </T>
        <T x={pc.x + 40} y={pc.y + 220} s={28} c="red" a="start" delay={1.6}>
          (한 줄)
        </T>
        <T x={pc.x + 40} y={pc.y + 395} s={34} b c="red" a="start" delay={2}>
          독립 회전축 2개
        </T>
      </g>
    );
  },
};

/* 1-4 작업 공간: J1 circle with the 24° gap / the vertical section with the hole / the 3D shell at 100 · 70 · 40 %. */
const p14 = cols(3);
export const fig14: FigureDef = {
  label: '위에서 본 J1 원은 336° 호와 뒤쪽 24° 빈 부채꼴, 옆에서 본 세로 단면은 가장 멀리 339 mm 인 바깥 호와 몸통 쪽 빈 구멍, 관절 한계 100 · 70 · 40 % 에서 J1 이 도는 범위 336° · 235° · 134° 로 껍질이 잘리고 부피 116 · 80 · 34 L',
  caption: '작업 공간 — J1 원 (뒤쪽 24° 빔) · 세로 단면 (가장 멀리 339 mm, 그리퍼 끝) · 관절 한계 100 · 70 · 40 % 의 껍질 (위에서 봄)',
  symbols: [],
  panels: p14.map((p, i) => ({ ...p, title: ['J1 만 — 위에서 본 원', '세로 단면', '관절 한계 — 위에서 본 껍질'][i] })),
  draw: () => {
    const [pa, pb, pc] = p14;
    // A: top view, x (앞) to the right, y (왼쪽) up.
    const ax = pa.x + pa.w / 2 + 20;
    const ay = pa.y + 400;
    const R = 185;
    const onA = (a: number, rr = R): [number, number] => [ax + rr * Math.cos(rad(a)), ay - rr * Math.sin(rad(a))];
    const arcA = Array.from({ length: 85 }, (_, i) => onA(-168 + (336 * i) / 84));
    // B: side view, the section around the shoulder.
    const floor = pb.y + 720;
    const S: Pt = [pb.x + 175, floor - 195];
    const Ro = 290;
    const Ri = 150;
    const onB = (a: number, rr: number): [number, number] => [S[0] + rr * Math.cos(rad(a)), S[1] - rr * Math.sin(rad(a))];
    const [a0, a1] = [-24, 112];
    const outer = Array.from({ length: 41 }, (_, i) => onB(a0 + ((a1 - a0) * i) / 40, Ro));
    const inner = Array.from({ length: 41 }, (_, i) => onB(a1 - ((a1 - a0) * i) / 40, Ri));
    const sec = [...outer, ...inner];
    const elbow = onB(76, 175);
    const wrist: Pt = [elbow[0] + 140 * Math.cos(rad(-22)), elbow[1] - 140 * Math.sin(rad(-22))];
    // C: the shell seen from above for limits 100 · 70 · 40 % (the screen's numbers): J1's range
    // narrows (336° · 235° · 134°), so the shell is cut to a fan; the reach hardly changes (339 · 339 · 319 mm).
    const ox = pc.x + pc.w / 2 - 10;
    const oy = pc.y + 545;
    const K = 0.6;
    const shells = [
      { pct: 100, span: 336, r: 339, vol: 116, c: 'blue' as Color },
      { pct: 70, span: 235, r: 339, vol: 80, c: 'orange' as Color },
      { pct: 40, span: 134, r: 319, vol: 34, c: 'red' as Color },
    ];
    const fan = (r: number, span: number) => {
      const pts = Array.from({ length: 49 }, (_, i) => {
        const a = rad(-span / 2 + (span * i) / 48);
        return `${ox + r * K * Math.cos(a)} ${oy - r * K * Math.sin(a)}`;
      });
      return `M${ox} ${oy} L${pts.join(' L')} Z`;
    };
    return (
      <g>
        <Dividers panels={p14} />
        {/* ── A */}
        <Title p={pa}>A J1 만 (위에서 봄)</Title>
        <P d={`M${ax} ${ay} L${onA(168)[0]} ${onA(168)[1]} L${onA(192)[0]} ${onA(192)[1]} Z`} c="red" w={4} dash />
        <Poly pts={arcA} c="blue" w={7} an={0.2} />
        <circle cx={ax} cy={ay} r={44} fill={C.white} stroke={C.ink} strokeWidth={5} />
        <Ln x1={ax} y1={ay} x2={ax + 120} y2={ay} w={22} />
        <circle cx={ax} cy={ay} r={13} fill={C.white} stroke={C.ink} strokeWidth={5} />
        <Gripper x={ax + 120} y={ay} angle={0} />
        <Arc cx={ax} cy={ay} rr={78} from={40} to={130} head w={4} />
        <T x={ax} y={ay - 92} s={28} b a="end">
          J1
        </T>
        <T x={ax} y={ay - R - 26} s={34} b c="blue" delay={1.2}>
          336°
        </T>
        <T x={onA(180, R + 18)[0]} y={ay + 12} s={34} b c="red" a="end" delay={1.4}>
          24°
        </T>
        <T x={onA(180, R + 18)[0]} y={ay + 52} s={28} c="red" a="end" delay={1.4}>
          뒤
        </T>
        <T x={ax} y={ay + R + 52} s={30} b>
          J1 ±168°
        </T>
        <Arrow x1={pa.x + 50} y1={pa.y + 760} x2={pa.x + 140} y2={pa.y + 760} c="axisX" w={5} />
        <Arrow x1={pa.x + 50} y1={pa.y + 760} x2={pa.x + 50} y2={pa.y + 670} c="axisY" w={5} />
        <T x={pa.x + 150} y={pa.y + 770} s={28} b c="axisX" a="start">
          x 앞
        </T>
        <T x={pa.x + 66} y={pa.y + 680} s={28} b c="axisY" a="start">
          y 왼쪽
        </T>
        <Foot p={pa} sum="원 — 뒤쪽 24° 빔" sumC="blue" />

        {/* ── B */}
        <Title p={pb}>B 세로 단면 (옆에서 봄)</Title>
        <G an={0.2} kind="fade">
          <path d={`M${sec.map((q) => q.join(' ')).join(' L')} Z`} fill={C.blue} fillOpacity={0.13} stroke={C.blue} strokeWidth={5} strokeLinejoin="round" />
        </G>
        <Floor x1={pb.x + 30} x2={pb.x + pb.w - 30} y={floor} />
        <Arm pts={[[S[0], floor - 26], S, elbow, wrist]} />
        <Base x={S[0]} y={floor} s={0.9} />
        <Arrow x1={S[0]} y1={S[1]} x2={S[0] + Ro} y2={S[1]} w={4} both an={1.2} />
        <T x={S[0] + Ro / 2 + 60} y={S[1] + 44} s={30} b delay={1.2}>
          339 mm
        </T>
        <T x={onB(8, 222)[0]} y={onB(8, 222)[1] + 4} s={30} b c="blue" delay={1}>
          닿는 곳
        </T>
        <T x={onB(25, 85)[0]} y={onB(25, 85)[1] + 10} s={28} b c="gray">
          빈 구멍
        </T>
        <Foot p={pb} sum="바깥 호 + 몸통 쪽 빈 구멍" sumC="blue" />

        {/* ── C */}
        <Title p={pc}>C 관절 한계 (위에서 봄)</Title>
        {shells.map((sh, i) => (
          <G key={sh.pct} an={0.3 + i * 0.6}>
            <path d={fan(sh.r, sh.span)} fill={C[sh.c]} fillOpacity={0.1} stroke={C[sh.c]} strokeWidth={5} strokeLinejoin="round" strokeDasharray={i === 1 ? '16 10' : undefined} />
          </G>
        ))}
        <circle cx={ox} cy={oy} r={34} fill={C.white} stroke={C.ink} strokeWidth={5} />
        <Ln x1={ox} y1={oy} x2={ox + 100} y2={oy} w={18} />
        <circle cx={ox} cy={oy} r={11} fill={C.white} stroke={C.ink} strokeWidth={4} />
        <T x={pc.x + 40} y={pc.y + 120} s={30} b a="start">
          관절 한계 · J1 범위 · 부피
        </T>
        {shells.map((sh, i) => (
          <g key={sh.pct}>
            <Ln x1={pc.x + 44} y1={pc.y + 160 + i * 44} x2={pc.x + 104} y2={pc.y + 160 + i * 44} c={sh.c} w={7} />
            <T x={pc.x + 118} y={pc.y + 170 + i * 44} s={30} b c={sh.c} a="start">
              {`${sh.pct}% · ${sh.span}° · ${sh.vol} L`}
            </T>
          </g>
        ))}
        <T x={ox + 339 * K + 12} y={oy + 10} s={28} b a="start" c="gray">
          앞
        </T>
        <Foot p={pc} sum="한계 ↓ → 도는 범위·부피 ↓" />
      </g>
    );
  },
};

export const FIGS1: Record<string, FigureDef> = { '1-1': fig11, '1-2': fig12, '1-3': fig13, '1-4': fig14 };
