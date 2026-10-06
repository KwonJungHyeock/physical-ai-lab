/** Figures for 학문 7 로봇 비전 · 인식 (그림 제작 요청서 §2, 원고 7-로봇비전인식.md 의 탐구 활동 1 · 2 · 3 기준). */

import type { ReactNode } from 'react';

import { Arm, Arrow, Base, C, Check, Cross, Dividers, Dot, Floor, G, Graph, Grid, Ln, Poly, T, Title, chain, cols, type FigureDef, type Panel } from './kit';

/* ─────────────────────────── shared parts */

/** The camera picture is 320 × 240 px; `at(u, v)` maps a pixel into the drawn frame. */
const IMG_W = 320;
const IMG_H = 240;
const photo = (x: number, y: number, sc: number) => ({ x, y, w: IMG_W * sc, h: IMG_H * sc, at: (u: number, v: number): [number, number] => [x + u * sc, y + v * sc] });
type Photo = ReturnType<typeof photo>;

/** A camera picture frame (light table, or dark room / mask background). */
function Frame({ ph, bg = 'white', children }: { ph: Photo; bg?: string; children?: ReactNode }) {
  return (
    <g>
      <rect x={ph.x} y={ph.y} width={ph.w} height={ph.h} fill={bg} stroke={C.ink} strokeWidth={4} />
      {children}
      <rect x={ph.x} y={ph.y} width={ph.w} height={ph.h} fill="none" stroke={C.ink} strokeWidth={4} />
    </g>
  );
}

/** A square seen from above, centred on (x, y). */
function Sq({ x, y, s, fill, stroke = C.ink, dash, w = 4 }: { x: number; y: number; s: number; fill: string; stroke?: string; dash?: boolean; w?: number }) {
  return <rect x={x - s / 2} y={y - s / 2} width={s} height={s} fill={fill} stroke={stroke} strokeWidth={w} strokeDasharray={dash ? '9 7' : undefined} />;
}

/** A centroid "+" mark. */
function Plus({ x, y, s = 16, c = 'blue', an }: { x: number; y: number; s?: number; c?: keyof typeof C; an?: number }) {
  return (
    <G an={an}>
      <path d={`M${x - s} ${y} L${x + s} ${y} M${x} ${y - s} L${x} ${y + s}`} stroke={C[c]} strokeWidth={5} strokeLinecap="round" />
    </G>
  );
}

const DARK_ROOM = '#4A4A4A';
const RED_BRIGHT = C.red;
const RED_DARK = '#5E2020';
const ORANGE_OBJ = C.orange;
const PINK_OBJ = '#E58FB0';

/* ─────────────────────────── 7-1 카메라와 좌표 */

/** Fixed camera (G1Camera): the three blocks' and four markers' pixels. */
const BLOCKS71: [number, number][] = [
  [118.5, 86],
  [217, 150.4],
  [193.9, 63.5],
];
const MARKERS71: [number, number][] = [
  [251.4, 188.5],
  [68.6, 188.5],
  [250.3, 44.8],
  [69.7, 44.8],
];
const MARKER_MM: [number, number][] = [
  [100, -120],
  [100, 120],
  [290, -120],
  [290, 120],
];

/** Plane two-link IK, elbow up: base (bx, by) → wrist (wx, wy), page coordinates. */
export function reach2(bx: number, by: number, l1: number, l2: number, wx: number, wy: number): [number, number] {
  const dx = wx - bx;
  const dy = by - wy;
  const d = Math.min(Math.hypot(dx, dy), l1 + l2 - 1);
  const c2 = (d * d - l1 * l1 - l2 * l2) / (2 * l1 * l2);
  const t2 = -Math.acos(Math.max(-1, Math.min(1, c2)));
  const t1 = Math.atan2(dy, dx) - Math.atan2(l2 * Math.sin(t2), l1 + l2 * Math.cos(t2));
  return [(t1 * 180) / Math.PI, (t2 * 180) / Math.PI];
}

/** A side-view arm whose last link points straight down to (tx, ty). */
export function downArm(bx: number, by: number, tx: number, ty: number, l: [number, number, number]) {
  const [a1, a2] = reach2(bx, by, l[0], l[1], tx, ty - l[2]);
  const a3 = -90 - a1 - a2;
  return chain(bx, by, l, [a1, a2, a3]);
}

/** Table mm → page for a top view (robot x up, robot y to the left). */
export const topView = (cx: number, cy: number, x0: number, y0: number, s: number) => (x: number, y: number): [number, number] => [cx - (y - y0) * s, cy - (x - x0) * s];

const p71 = cols(3);
export const fig71: FigureDef = {
  label: '고정 카메라 사진의 픽셀 (u, v) 와 1 px = 1 mm 어림의 오차, 마커 4개로 구한 픽셀 → mm 변환, 손 카메라 두 자세에서 픽셀은 달라도 같은 책상 위치',
  caption: '사진 속 픽셀 (u, v) 를 책상 위 (x, y) mm 로 — 픽셀만 · 마커 4개로 보정(H) · 손 카메라 (고정 카메라 높이 620 mm)',
  symbols: ['u', 'v', 'H', 'x', 'y'],
  panels: p71.map((p, i) => ({ ...p, title: ['픽셀만', '마커 보정', '손 카메라'][i] })),
  draw: () => {
    const [pa, pb, pc] = p71;
    return (
      <g>
        <Dividers panels={p71} />
        <PanelA71 p={pa} />
        <PanelB71 p={pb} />
        <PanelC71 p={pc} />
      </g>
    );
  },
};

/** The fixed-camera picture: table grid, markers, three blocks. */
function FixedShot({ ph, markers }: { ph: Photo; markers?: boolean }) {
  const bs = 36;
  return (
    <Frame ph={ph}>
      <Grid x={ph.x} y={ph.y} w={ph.w} h={ph.h} step={ph.w / 8} />
      {MARKERS71.map(([u, v], i) => {
        const [x, y] = ph.at(u, v);
        return markers ? (
          <g key={i}>
            <Sq x={x} y={y} s={20} fill={C.ink} />
            <T x={x + (u > 160 ? 16 : -16)} y={y + 10} a={u > 160 ? 'start' : 'end'} s={28} b>
              {`M${i + 1}`}
            </T>
          </g>
        ) : (
          <Sq key={i} x={x} y={y} s={20} fill={C.ink} />
        );
      })}
      {BLOCKS71.map(([u, v], i) => {
        const [x, y] = ph.at(u, v);
        return <Sq key={i} x={x} y={y} s={bs} fill={C.light} stroke={C.ink} />;
      })}
    </Frame>
  );
}

function PanelA71({ p }: { p: Panel }) {
  const ph = photo(p.x + 67, 100, 1.25);
  const [bx, by] = ph.at(...BLOCKS71[0]);
  // A zoomed table patch, 10 mm cells: the real block (235, 55) and the "1 px = 1 mm" guess (234, 41.5).
  const s = 4;
  const z = topView(p.x + 300, 640, 235, 48, s);
  const real = z(235, 55);
  const guess = z(234, 41.5);
  return (
    <g>
      <Title p={p}>A 픽셀만</Title>
      <FixedShot ph={ph} />
      {/* pixel axes from the top-left corner */}
      <T x={ph.x - 4} y={ph.y - 14} a="start" s={28} b>
        (0, 0)
      </T>
      <Arrow x1={ph.x + 16} y1={ph.y + 22} x2={ph.x + 128} y2={ph.y + 22} w={5} />
      <T x={ph.x + 144} y={ph.y + 32} a="start" b>
        u
      </T>
      <Arrow x1={ph.x + 16} y1={ph.y + 22} x2={ph.x + 16} y2={ph.y + 130} w={5} />
      <T x={ph.x + 16} y={ph.y + 166} b>
        v
      </T>
      <Plus x={bx} y={by} an={0.3} />
      <T x={bx} y={by + 58} s={30} b c="blue" delay={0.5}>
        (u, v)
      </T>
      {/* guess on the table */}
      <Arrow x1={p.x + 140} y1={ph.y + ph.h + 18} x2={p.x + 140} y2={548} w={5} c="orange" an={0.9} />
      <T x={p.x + 162} y={500} a="start" s={30} b c="orange" delay={0.9}>
        1 px = 1 mm ?
      </T>
      <Grid x={p.x + 180} y={560} w={280} h={200} step={40} />
      <rect x={p.x + 180} y={560} width={280} height={200} fill="none" stroke={C.gray} strokeWidth={3} />
      <Sq x={real[0]} y={real[1]} s={25 * s} fill={C.light} stroke={C.ink} />
      <Dot x={real[0]} y={real[1]} rr={9} c="ink" />
      <G an={1.3}>
        <Sq x={guess[0]} y={guess[1]} s={25 * s} fill="none" stroke={C.orange} dash />
        <Dot x={guess[0]} y={guess[1]} rr={9} c="orange" />
      </G>
      <Ln x1={real[0]} y1={real[1]} x2={guess[0]} y2={guess[1]} c="red" w={5} an={1.6} />
      <T x={p.x + 166} y={600} a="end" s={28} c="ink">
        실제
      </T>
      <Ln x1={p.x + 170} y1={592} x2={real[0] - 14} y2={real[1] - 4} c="gray" w={3} />
      <T x={p.x + 166} y={724} a="end" s={28} c="orange">
        어림
      </T>
      <Ln x1={p.x + 170} y1={716} x2={guess[0] - 12} y2={guess[1] + 8} c="gray" w={3} />
      <T x={p.x + 460} y={792} a="end" s={28} c="gray">
        칸 = 10 mm
      </T>
      <T x={p.x + p.w / 2} y={858} s={32} b c="red" delay={1.8}>
        px 만 → 10 mm 넘게 어긋남
      </T>
    </g>
  );
}

function PanelB71({ p }: { p: Panel }) {
  const ph = photo(p.x + 67, 100, 1.25);
  const [bx, by] = ph.at(...BLOCKS71[0]);
  const m = topView(p.x + 266, 640, 195, 0, 1.0);
  const corner = [m(85, 140), m(85, -140), m(305, -140), m(305, 140)];
  const blk = m(235, 55);
  return (
    <g>
      <Title p={p}>B 마커 보정</Title>
      <FixedShot ph={ph} markers />
      <Plus x={bx} y={by} />
      {/* px ↔ mm → H */}
      <T x={p.x + 246} y={474} a="end" s={28} b>
        px 4쌍 ↔ mm 4쌍
      </T>
      <Arrow x1={p.x + 266} y1={ph.y + ph.h + 14} x2={p.x + 266} y2={518} w={6} c="blue" an={0.3} />
      <T x={p.x + 288} y={476} a="start" s={36} b c="blue" delay={0.3}>
        H
      </T>
      {/* the table map in mm */}
      <Poly pts={corner} c="gray" w={3} closed />
      <Grid x={corner[0][0]} y={corner[2][1]} w={corner[1][0] - corner[0][0]} h={corner[0][1] - corner[2][1]} step={20} />
      <Poly pts={corner} c="gray" w={3} closed />
      {MARKER_MM.map(([x, y], i) => {
        const [px, py] = m(x, y);
        return (
          <g key={i}>
            <Sq x={px} y={py} s={18} fill={C.ink} />
            <T x={px + (y < 0 ? 14 : -14)} y={py + (x < 200 ? -14 : 36)} a={y < 0 ? 'start' : 'end'} s={28} b>
              {`M${i + 1}`}
            </T>
          </g>
        );
      })}
      <Sq x={blk[0]} y={blk[1]} s={26} fill={C.light} stroke={C.ink} />
      <Dot x={blk[0]} y={blk[1]} rr={11} c="blue" an={0.8} />
      <T x={blk[0] + 22} y={blk[1] - 20} a="start" s={30} b c="blue" delay={0.9}>
        (x, y) mm
      </T>
      {/* robot directions */}
      <Arrow x1={p.x + 470} y1={782} x2={p.x + 470} y2={700} c="axisX" w={5} />
      <T x={p.x + 470} y={686} c="axisX" b s={28}>
        x
      </T>
      <Arrow x1={p.x + 470} y1={782} x2={p.x + 402} y2={782} c="axisY" w={5} />
      <T x={p.x + 384} y={792} c="axisY" b s={28}>
        y
      </T>
      <T x={p.x + p.w / 2} y={858} s={32} b c="blue" delay={1.2}>
        mm → 오차 3~5 mm
      </T>
    </g>
  );
}

function PanelC71({ p }: { p: Panel }) {
  const floorY = 770;
  const bx = p.x + 84;
  const by = floorY - 30;
  const blockX = p.x + 318;
  const blockTop = floorY - 46;
  const L: [number, number, number] = [210, 190, 50];
  const tips: [number, number][] = [
    [blockX - 82, 500],
    [blockX + 92, 600],
  ];
  // small pictures: the same block at a different pixel
  const shots = [photo(p.x + 40, 96, 0.66), photo(p.x + 285, 96, 0.66)];
  const seen: [number, number][] = [
    [214, 168],
    [118, 92],
  ];
  return (
    <g>
      <Title p={p}>C 손 카메라</Title>
      {shots.map((ph, i) => {
        const [x, y] = ph.at(...seen[i]);
        return (
          <g key={i}>
            <Frame ph={ph}>
              <Sq x={x} y={y} s={34} fill={C.light} stroke={C.ink} />
            </Frame>
            <Plus x={x} y={y} s={13} c="orange" an={0.4 + i * 0.6} />
            <T x={ph.x + ph.w / 2} y={ph.y + ph.h + 38} s={28} b>
              {`자세 ${i + 1}`}
            </T>
            <T x={ph.x + ph.w / 2} y={ph.y + ph.h + 74} s={28} c="orange" b>
              {i === 0 ? '(u₁, v₁)' : '(u₂, v₂)'}
            </T>
          </g>
        );
      })}
      <T x={p.x + p.w / 2} y={186} s={34} b c="orange">
        ≠
      </T>
      <Floor x1={p.x + 30} x2={p.x + p.w - 30} y={floorY} />
      <Base x={bx} y={floorY} s={0.9} />
      <rect x={blockX - 24} y={blockTop} width={48} height={46} fill={C.light} stroke={C.ink} strokeWidth={4} />
      {tips.map(([tx0, ty0], i) => {
        const pts = downArm(bx, by, tx0, ty0, L);
        const [tx, ty] = pts[pts.length - 1];
        const [wx, wy] = pts[pts.length - 2];
        const cam: [number, number] = [wx + 62, wy + 26];
        return (
          <G key={i} an={0.2 + i * 0.6}>
            {/* what the camera sees */}
            <path d={`M${cam[0]} ${cam[1] + 12} L${blockX - 34} ${blockTop} L${blockX + 34} ${blockTop} Z`} fill={C.orange} fillOpacity={0.1} stroke={C.orange} strokeWidth={2} strokeDasharray="8 7" />
            <Arm pts={pts} w={18} dash={i === 1} gripper tipAngle={-90} />
            <Ln x1={wx + 8} y1={wy + 18} x2={cam[0] - 14} y2={cam[1]} w={6} />
            <rect x={cam[0] - 16} y={cam[1] - 13} width={32} height={26} rx={4} fill={C.orange} stroke={C.ink} strokeWidth={3} />
            <T x={i === 0 ? tx - 40 : cam[0] - 6} y={i === 0 ? ty - 90 : cam[1] - 44} a={i === 0 ? 'end' : 'middle'} s={28} b>
              {`자세 ${i + 1}`}
            </T>
            {i === 0 && (
              <g>
                <Arrow x1={tx + 22} y1={ty + 4} x2={cam[0] + 2} y2={cam[1] + 20} c="blue" w={4} both />
                <T x={cam[0] + 26} y={cam[1] - 4} a="start" s={28} b c="blue" delay={1.4}>
                  손-눈 변환
                </T>
              </g>
            )}
          </G>
        );
      })}
      <T x={blockX + 40} y={floorY - 14} a="start" s={30} b c="blue" delay={1.6}>
        (x, y) 같음
      </T>
      <T x={p.x + p.w / 2} y={858} s={32} b c="blue" delay={1.8}>
        px 달라도 mm 같음
      </T>
    </g>
  );
}

/* ─────────────────────────── 7-2 색으로 찾기 */

/** G2Color camera pixels: red block, orange and pink objects (A, B); two red blocks (C). */
const OBJ72 = [
  { at: [131.7, 107.9] as [number, number], fill: RED_BRIGHT, name: '빨강' },
  { at: [208.5, 75.6] as [number, number], fill: ORANGE_OBJ, name: '주황' },
  { at: [204.4, 152.3] as [number, number], fill: PINK_OBJ, name: '분홍' },
];
const C72: [number, number][] = [
  [123.6, 99.8],
  [212.5, 140.2],
];
const OBJ_PX = 40;

const p72 = cols(3);
export const fig72: FigureDef = {
  label: '색상 범위를 좁혀 빨강 블록만 남기기, 조명 ×0.3 에서 RGB 기준은 놓치고 HSV 기준은 찾음, 팔이 가린 블록의 무게중심이 어긋남',
  caption: '색으로 빨강 블록 찾기 — 색상 범위 좁히기 · 조명 ×0.3 에서 RGB 기준과 HSV 기준 · 팔이 가린 블록의 가운데',
  symbols: ['R', 'H', 'S', 'V'],
  panels: p72.map((p, i) => ({ ...p, title: ['임계값', '조명', '여러 개 · 가림'][i] })),
  draw: () => (
    <g>
      <Dividers panels={p72} />
      <PanelA72 p={p72[0]} />
      <PanelB72 p={p72[1]} />
      <PanelC72 p={p72[2]} />
    </g>
  ),
};

/** A black/white mask; `blobs` are white rectangles in picture pixels [u0, v0, u1, v1]. */
function Mask({ ph, blobs }: { ph: Photo; blobs: [number, number, number, number][] }) {
  return (
    <Frame ph={ph} bg={C.ink}>
      {blobs.map(([u0, v0, u1, v1], i) => {
        const [x0, y0] = ph.at(u0, v0);
        const [x1, y1] = ph.at(u1, v1);
        return <rect key={i} x={x0} y={y0} width={x1 - x0} height={y1 - y0} fill={C.white} />;
      })}
    </Frame>
  );
}
const blobAt = ([u, v]: [number, number], h = OBJ_PX / 2): [number, number, number, number] => [u - h, v - h, u + h, v + h];

function PanelA72({ p }: { p: Panel }) {
  const ph = photo(p.x + 86, 100, 1.13);
  const wide = photo(p.x + 28, 496, 0.71);
  const narrow = photo(p.x + 278, 496, 0.71);
  const [cu, cv] = narrow.at(...OBJ72[0].at);
  return (
    <g>
      <Title p={p}>A 임계값</Title>
      <Frame ph={ph}>
        {OBJ72.map((o, i) => {
          const [x, y] = ph.at(...o.at);
          return (
            <g key={i}>
              <Sq x={x} y={y} s={OBJ_PX * 1.13} fill={o.fill} stroke={C.ink} w={3} />
              <T x={x + (i === 0 ? -36 : 36)} y={y + 10} a={i === 0 ? 'end' : 'start'} s={28}>
                {o.name}
              </T>
            </g>
          );
        })}
      </Frame>
      <Arrow x1={p.x + 150} y1={ph.y + ph.h + 14} x2={p.x + 150} y2={452} w={5} />
      <Arrow x1={p.x + 382} y1={ph.y + ph.h + 14} x2={p.x + 382} y2={452} w={5} an={0.9} />
      <T x={wide.x + wide.w / 2} y={484} s={28} b>
        색상 −40°~40°
      </T>
      <T x={narrow.x + narrow.w / 2} y={484} s={28} b c="blue" delay={0.9}>
        색상 −15°~15°
      </T>
      <Mask ph={wide} blobs={OBJ72.map((o) => blobAt(o.at))} />
      <G an={1.1}>
        <Mask ph={narrow} blobs={[blobAt(OBJ72[0].at)]} />
        <Plus x={cu} y={cv} s={9} />
      </G>
      <T x={wide.x + wide.w / 2} y={wide.y + wide.h + 44} s={30} b c="orange" delay={0.5}>
        덩어리 3개
      </T>
      <T x={narrow.x + narrow.w / 2} y={narrow.y + narrow.h + 44} s={30} b c="blue" delay={1.4}>
        덩어리 1개
      </T>
      <T x={p.x + p.w / 2} y={858} s={32} b c="blue" delay={1.6}>
        빨강만 남음 → 찾음
      </T>
    </g>
  );
}

function PanelB72({ p }: { p: Panel }) {
  const bright = photo(p.x + 28, 128, 0.7);
  const dark = photo(p.x + 281, 128, 0.7);
  const rgb = photo(p.x + 28, 500, 0.7);
  const hsv = photo(p.x + 281, 500, 0.7);
  const [hu, hv] = hsv.at(...OBJ72[0].at);
  const shot = (ph: Photo, dim: boolean) => (
    <Frame ph={ph} bg={dim ? DARK_ROOM : C.white}>
      {OBJ72.map((o, i) => {
        const [x, y] = ph.at(...o.at);
        return <Sq key={i} x={x} y={y} s={OBJ_PX * 0.9} fill={i === 0 ? (dim ? RED_DARK : RED_BRIGHT) : dim ? '#6A5148' : o.fill} stroke={dim ? '#222222' : C.ink} w={3} />;
      })}
    </Frame>
  );
  return (
    <g>
      <Title p={p}>B 조명</Title>
      <T x={bright.x + bright.w / 2} y={116} s={28} b>
        조명 ×1
      </T>
      <T x={dark.x + dark.w / 2} y={116} s={28} b>
        조명 ×0.3
      </T>
      {shot(bright, false)}
      {shot(dark, true)}
      <T x={bright.x + bright.w / 2} y={bright.y + bright.h + 40} s={28} c="blue" b>
        R ≥ 140
      </T>
      <T x={dark.x + dark.w / 2} y={dark.y + dark.h + 40} s={28} c="red" b>
        R ≈ 60
      </T>
      <T x={p.x + p.w / 2} y={bright.y + bright.h + 90} s={30} b>
        H·S 그대로, V 만 ↓
      </T>
      <T x={rgb.x + rgb.w / 2} y={rgb.y - 16} s={28} b>
        RGB 기준
      </T>
      <T x={hsv.x + hsv.w / 2} y={hsv.y - 16} s={28} b>
        HSV 기준
      </T>
      <Mask ph={rgb} blobs={[]} />
      <G an={0.6}>
        <Mask ph={hsv} blobs={[blobAt(OBJ72[0].at)]} />
        <Plus x={hu} y={hv} s={9} />
      </G>
      <Cross x={rgb.x + rgb.w / 2 - 52} y={rgb.y + rgb.h + 32} s={14} an={0.4} />
      <T x={rgb.x + rgb.w / 2 - 20} y={rgb.y + rgb.h + 43} a="start" s={30} b c="red" delay={0.4}>
        놓침
      </T>
      <Check x={hsv.x + hsv.w / 2 - 52} y={hsv.y + hsv.h + 32} s={15} an={1} />
      <T x={hsv.x + hsv.w / 2 - 20} y={hsv.y + hsv.h + 43} a="start" s={30} b c="blue" delay={1}>
        찾음
      </T>
      <T x={p.x + p.w / 2} y={858} s={32} b c="blue" delay={1.3}>
        ×0.3: RGB 놓침 · HSV 찾음
      </T>
    </g>
  );
}

function PanelC72({ p }: { p: Panel }) {
  const ph = photo(p.x + 107, 100, 1.0);
  // the mask sits where 활동 1 · 2 put theirs: bottom at 666, its result line at 710
  const mk = photo(p.x + 122.5, 450, 0.9);
  const h = 32;
  const [u2, v2] = C72[1];
  // the arm link crosses the lower-right half of block 2; the mask keeps only the part still seen
  const armA = ph.at(u2 - 16, v2 + 17);
  const armB = ph.at(IMG_W + 20, v2 + 17);
  const visible: [number, number, number, number] = [u2 - h, v2 - h, u2 + h, v2];
  const truth = mk.at(u2, v2);
  const seen = mk.at((visible[0] + visible[2]) / 2, (visible[1] + visible[3]) / 2);
  const [c1x, c1y] = mk.at(...C72[0]);
  return (
    <g>
      <Title p={p}>C 여러 개 · 가림</Title>
      <Frame ph={ph}>
        {C72.map((q, i) => {
          const [x, y] = ph.at(...q);
          return <Sq key={i} x={x} y={y} s={h * 2} fill={RED_BRIGHT} stroke={C.ink} w={3} />;
        })}
        <path d={`M${ph.x + ph.w} ${armA[1] - 17} L${armA[0]} ${armA[1] - 17} A17 17 0 0 0 ${armA[0]} ${armB[1] + 17} L${ph.x + ph.w} ${armB[1] + 17} Z`} fill={C.gray} />
      </Frame>
      <T x={armA[0] + 40} y={armA[1] + 64} a="start" s={28}>
        팔
      </T>
      <Arrow x1={p.x + 266} y1={ph.y + ph.h + 14} x2={p.x + 266} y2={432} w={5} />
      <T x={p.x + 290} y={406} a="start" s={28} b>
        마스크
      </T>
      <Mask ph={mk} blobs={[blobAt(C72[0], h), visible]} />
      <Plus x={c1x} y={c1y} s={12} an={0.4} />
      <G an={0.9}>
        <circle cx={truth[0]} cy={truth[1]} r={8} fill="none" stroke={C.blue} strokeWidth={4} />
        <Plus x={seen[0]} y={seen[1]} s={8} c="orange" />
      </G>
      <T x={p.x + p.w / 2} y={mk.y + mk.h + 44} s={30} b delay={0.6}>
        덩어리 2개 · + ≠ ○
      </T>
      <T x={p.x + p.w / 2} y={858} s={32} b c="orange" delay={1.4}>
        가림 → 가운데 약 3 px 어긋남
      </T>
    </g>
  );
}

/* ─────────────────────────── 7-3 시각 서보 */

/**
 * G3Servo runs (the screen's own loop with the arm's IK, recorded every 0.1 s for 12 s): the hand
 * camera centre on the table (mm) and its distance to the moving block (mm). A looks once and goes
 * there in 2 s; B and C keep looking with K = 3 and K = 9 (the picture is 0.2 s late).
 */
const RUN_S = 12;
const START: [number, number] = [180, -25];
const blockAt = (t: number): [number, number] => [205 + 40 * Math.sin(0.45 * t), 55 * Math.sin(0.7 * t)];
const RUNS73: Record<'A' | 'B' | 'C', { x: number[]; y: number[]; err: number[] }> = {
  A: {
    x: [180,180,181,182,183,185,186,188,190,192,194,196,197,199,200,202,203,204,205,205,205,205,205,205,205,205,205,205,205,205,205,205,205,205,205,205,205,205,205,205,205,205,205,205,205,205,205,205,205,205,205,205,205,205,205,205,205,205,205,205,205,205,205,205,205,205,205,205,205,205,205,205,205,205,205,205,205,205,205,205,205,205,205,205,205,205,205,205,205,205,205,205,205,205,205,205,205,205,205,205,205,205,205,205,205,205,205,205,205,205,205,205,205,205,205,205,205,205,205,205],
    y: [-25,-24,-24,-23,-22,-20,-18,-17,-15,-13,-11,-9,-8,-6,-4,-3,-2,-1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    err: [39,43,46,48,51,52,54,55,56,57,58,59,59,60,60,60,61,61,62,63,64,64,65,65,65,65,64,64,63,62,60,59,57,55,53,51,49,47,45,43,41,40,38,37,36,35,35,35,36,37,38,39,40,42,44,45,47,48,50,51,52,53,54,54,55,55,55,55,55,54,53,52,51,50,48,46,45,43,41,39,37,35,34,32,31,30,30,30,30,32,33,35,37,39,41,44,46,48,51,53,55,57,59,61,63,64,65,66,66,67,67,67,66,66,65,64,62,60,58,56],
  },
  B: {
    x: [180,180,188,195,202,208,212,214,216,218,219,221,222,223,225,226,228,229,231,232,234,235,236,237,238,239,240,241,242,242,243,244,244,244,245,245,245,245,245,245,245,244,244,243,243,242,242,241,240,239,238,237,236,235,234,233,231,230,229,227,226,224,222,221,219,218,216,214,212,211,209,207,205,204,202,200,198,196,194,193,191,189,188,186,184,183,181,180,178,177,176,174,173,172,171,170,169,168,168,167,166,166,165,165,165,165,165,165,165,165,165,165,166,166,167,167,168,169,170,170],
    y: [-25,-25,-17,-7,3,11,18,22,25,28,30,32,34,37,40,42,45,47,49,51,52,54,54,55,55,55,55,55,54,53,52,50,49,47,44,42,39,36,33,30,27,23,20,16,12,9,5,1,-3,-7,-11,-14,-18,-22,-25,-29,-32,-35,-38,-41,-43,-45,-48,-49,-51,-52,-54,-54,-55,-55,-55,-55,-55,-54,-53,-52,-50,-48,-46,-44,-42,-39,-36,-33,-30,-27,-23,-20,-16,-12,-8,-4,-1,3,7,11,15,18,22,26,29,32,35,38,41,44,46,48,50,51,53,54,55,55,55,55,55,55,54,53],
    err: [39,43,36,28,20,14,10,8,8,9,10,10,10,10,10,9,8,7,6,5,4,4,3,3,3,3,4,4,5,6,6,7,8,9,9,10,10,11,11,12,12,12,13,13,13,13,13,13,13,13,13,12,12,12,11,11,10,10,10,9,8,8,7,7,7,6,6,6,6,6,6,7,7,8,8,9,9,10,10,11,11,12,12,12,13,13,13,13,14,14,14,13,13,13,13,12,12,12,11,11,10,9,9,8,7,6,6,5,4,3,3,2,2,2,3,4,4,5,6,7],
  },
  C: {
    x: [180,180,194,205,215,224,227,224,215,206,204,212,221,229,237,240,238,230,220,218,224,232,241,250,254,250,240,228,224,229,240,254,265,265,256,241,225,220,228,245,264,273,267,252,234,216,212,223,243,262,269,257,239,219,203,203,219,238,253,252,236,216,199,190,196,215,231,238,229,210,191,180,179,190,209,223,222,207,187,171,164,166,179,198,211,207,190,171,157,151,153,165,184,199,196,180,160,146,140,143,157,176,190,190,174,155,140,135,141,158,177,188,186,171,152,140,139,150,170,186],
    y: [-25,-25,-10,6,23,39,44,36,20,7,7,22,40,58,72,70,55,37,23,26,43,62,80,85,74,54,37,27,31,48,65,77,71,52,35,21,15,19,31,42,45,32,14,0,-7,-8,-4,2,4,-1,-16,-32,-38,-38,-31,-24,-21,-26,-39,-57,-67,-66,-56,-41,-30,-29,-40,-58,-75,-79,-71,-55,-36,-21,-20,-34,-54,-67,-66,-54,-36,-16,-1,1,-13,-32,-42,-37,-23,-4,15,31,34,21,2,-8,-4,10,29,48,62,64,51,32,20,22,36,54,73,84,79,63,44,30,31,46,65,81,84,72],
    err: [39,43,28,12,4,19,21,8,14,33,37,23,7,12,25,23,6,16,33,33,17,10,25,32,24,8,15,28,27,15,20,35,37,24,11,12,24,25,18,23,36,37,26,11,10,24,28,20,21,32,34,24,10,13,27,29,22,22,30,32,23,15,18,28,30,26,26,30,30,26,22,21,25,29,30,31,31,31,28,25,22,22,24,28,32,34,34,31,27,24,22,23,26,30,33,34,32,29,26,26,25,25,26,29,30,30,30,31,31,30,26,22,21,24,28,31,35,37,35,28],
  },
};
const ERR_MAX = 70;

const p73 = cols(3);
export const fig73: FigureDef = {
  label: '움직이는 블록을 한 번 보고 따라가기, 계속 보며 이득 K = 3 으로 따라가기, K = 9 로 흔들리기 — 위에서 본 자취와 추적 오차 그래프',
  caption: '움직이는 블록 따라가기 — 한 번 보고 · 계속 보기 이득 3 · 이득 9 (사진 지연 0.2 s): 위에서 본 카메라 가운데의 자취와 추적 오차',
  symbols: ['e', 'L'],
  panels: p73.map((p, i) => ({ ...p, title: ['한 번 보고', '계속 보기 · 이득 3', '계속 보기 · 이득 9'][i] })),
  draw: () => (
    <g>
      <Dividers panels={p73} />
      {p73.map((p, i) => (
        <Panel73 key={i} p={p} k={(['A', 'B', 'C'] as const)[i]} />
      ))}
    </g>
  ),
};

function Panel73({ p, k }: { p: Panel; k: 'A' | 'B' | 'C' }) {
  const run = RUNS73[k];
  const m = topView(p.x + 256, 300, 205, 0, 2.5);
  const path = Array.from({ length: 241 }, (_, i) => m(...blockAt((i / 240) * RUN_S)));
  const col = k === 'A' ? 'red' : k === 'B' ? 'blue' : 'orange';
  const n = k === 'A' ? 20 : k === 'C' ? 45 : 120;
  const camPts = [m(...START), ...run.x.slice(0, n).map((x, i) => m(x, run.y[i]))];
  const title = k === 'A' ? 'A 한 번 보고' : k === 'B' ? 'B 계속 보기 · 이득 3' : 'C 계속 보기 · 이득 9';
  const b2 = m(...blockAt(2));
  const end = m(run.x[n - 1], run.y[n - 1]);
  const bEnd = m(...blockAt(k === 'A' ? 2 : n / 10));
  const s0 = m(...START);
  const result = k === 'A' ? '2 s 뒤 도착 → 블록은 이미 다른 곳' : k === 'B' ? '따라감 · 흔들림 없음' : '지나쳤다 되돌아옴 · 흔들림 큼';
  return (
    <g>
      <Title p={p}>{title}</Title>
      {/* block path (gray dashed) and the camera centre's track */}
      <Poly pts={path} c="gray" w={3} dash />
      <Dot x={s0[0]} y={s0[1]} rr={8} c="ink" />
      <Poly pts={camPts} c={col} w={k === 'C' ? 3.5 : 5} an={0.2} />
      {k === 'A' && (
        <g>
          <Dot x={end[0]} y={end[1]} rr={12} c="red" hollow an={0.3} />
          <T x={end[0] - 20} y={end[1] + 44} a="end" s={28} b c="red" delay={0.4}>
            본 순간의 위치
          </T>
          <G an={1.6}>
            <Sq x={b2[0]} y={b2[1]} s={30} fill={C.light} stroke={C.ink} />
          </G>
          <Ln x1={end[0]} y1={end[1]} x2={b2[0]} y2={b2[1]} c="red" w={4} dash an={1.8} />
          <T x={b2[0] + 4} y={b2[1] - 30} a="middle" s={28} b delay={1.6}>
            2 s 뒤 블록
          </T>
        </g>
      )}
      {k !== 'A' && (
        <g>
          <G an={2}>
            <Sq x={bEnd[0]} y={bEnd[1]} s={30} fill={C.light} stroke={C.ink} />
          </G>
          <Dot x={end[0]} y={end[1]} rr={9} c={col} an={2.1} />
        </g>
      )}
      {k === 'B' && <ImageJacobian p={p} />}
      {k === 'C' && (
        <T x={p.x + p.w - 30} y={122} a="end" s={28} b c="orange" delay={0.6}>
          사진 0.2 s 늦음
        </T>
      )}
      <Ln x1={p.x + 34} y1={444} x2={p.x + 80} y2={444} c="gray" w={4} dash />
      <T x={p.x + 90} y={454} a="start" s={28} c="gray">
        블록 길
      </T>
      <Ln x1={p.x + 214} y1={444} x2={p.x + 260} y2={444} c={col} w={5} />
      <T x={p.x + 270} y={454} a="start" s={28} c={col}>
        카메라 가운데
      </T>
      <Graph x={p.x + 80} y={548} w={390} h={196} xMax={RUN_S} yMax={ERR_MAX} xLabel="시간(s)" yLabel="추적 오차(mm)" xTicks={[0, 2]}>
        {(s) => <Poly pts={run.err.map((e, i) => [s.sx((i + 1) / 10), s.sy(e)] as [number, number])} c={col} w={4} an={0.8} />}
      </Graph>
      <T x={p.x + p.w / 2} y={858} s={30} b c={col} delay={2}>
        {result}
      </T>
    </g>
  );
}

/** B: the picture's red error arrow e → L⁻¹ → the blue tool-motion arrow. */
function ImageJacobian({ p }: { p: Panel }) {
  const ph = photo(p.x + 368, 92, 0.46);
  const [cx, cy] = ph.at(IMG_W / 2, IMG_H / 2);
  const [bx, by] = ph.at(IMG_W / 2 + 70, IMG_H / 2 - 40);
  return (
    <G an={1.2}>
      <Frame ph={ph}>
        <circle cx={cx} cy={cy} r={8} fill="none" stroke={C.ink} strokeWidth={3} />
        <Sq x={bx} y={by} s={18} fill={C.light} stroke={C.ink} w={3} />
        <Arrow x1={cx} y1={cy} x2={bx - 6} y2={by + 4} c="red" w={4} />
      </Frame>
      <T x={ph.x - 10} y={ph.y + 40} a="end" s={28} b c="red">
        e
      </T>
      <Arrow x1={ph.x + ph.w / 2} y1={ph.y + ph.h + 8} x2={ph.x + ph.w / 2} y2={ph.y + ph.h + 70} c="blue" w={5} />
      <T x={ph.x + ph.w / 2 + 14} y={ph.y + ph.h + 50} a="start" s={28} b c="blue">
        L⁻¹
      </T>
      <Arrow x1={ph.x + ph.w / 2 - 20} y1={ph.y + ph.h + 110} x2={ph.x + ph.w / 2 + 40} y2={ph.y + ph.h + 86} c="blue" w={6} />
      <T x={ph.x + ph.w / 2 + 10} y={ph.y + ph.h + 150} s={28} b c="blue">
        손끝
      </T>
    </G>
  );
}

export const FIGS7: Record<string, FigureDef> = { '7-1': fig71, '7-2': fig72, '7-3': fig73 };
