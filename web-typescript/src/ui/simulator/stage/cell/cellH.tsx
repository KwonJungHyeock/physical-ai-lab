'use client';

/**
 * 실습 셀 H 보드게임 로봇 (입문 트랙 ① 생활 로봇): a board-game café's table where a desk cobot with
 * a suction pump plays 오목 with a person (engine/simulator/cell/board.ts · 보고 #45). Drawn at full
 * size like G: the arm on a walnut table, the 9 × 9 board in front of it (16 mm between the lines;
 * the robot's x · y in mm printed along two edges, so the spacing can be measured), the white stones'
 * tray at its right, the black stones' bowl and the turn lamp on the person's side, a café wall behind,
 * the person across the table (−y, seen by the hand only) and other guests at the back.
 *
 * The stones themselves are the world's objects (DeskObjects.tsx draws them as go stones); what is
 * read here every frame is the person's hand (reaching in with a black stone, then out) and the lamp.
 */

import { useFrame } from '@react-three/fiber';
import { Suspense, useRef, type RefObject } from 'react';
import type { Group, Mesh, MeshStandardMaterial } from 'three';

import { BLACK, BOARD, pointXY, type BoardState } from '@/engine/simulator/cell/board';
import { STONE_TRAY } from '@/engine/simulator/cell/cells';
import type { WorldState } from '@/engine/simulator/sim';

import Model from '@/ui/education/lab/ambient/Model';

import { RBox, Turned, brushed, wood } from '../sceneKit';
import { Tagged, m, useSheet } from './kit';

/** The table top is the robot base's z 0; the café's floor is a 740 mm table below. */
const TABLE_Z = 0;
const FLOOR_Z = -742;
const TABLE = { x0: -170, x1: 345, y0: -200, y1: 225 } as const;
/** The board's wooden block (the lines' area and a 14 mm border), mm. */
const B = { x0: BOARD.x0 - 14, x1: BOARD.x0 + (BOARD.n - 1) * BOARD.pitch + 14, y0: BOARD.y0 - 14, y1: BOARD.y0 + (BOARD.n - 1) * BOARD.pitch + 14 } as const;
const BOWL = { x: 200, y: -122 } as const;
const LAMP = { x: 300, y: -128 } as const;

const smooth = (s: number) => s * s * (3 - 2 * s);
/** The person's hand: 0 away … 1 at the point, eased in over 0.8 s and out over the last 0.8 s of the reach. */
function reach(b: BoardState | undefined, t: number): number {
  const p = b?.person;
  if (!p || t < p.reachAt) return 0;
  const f = Math.min((t - p.reachAt) / 0.8, (p.putAt - t) / 0.8, 1);
  return smooth(Math.max(0, f));
}

/** A soft contact shadow under a thing on the table. */
function Contact({ at, w, d, k = 0.5 }: { at: [number, number]; w: number; d: number; k?: number }) {
  const tex = useSheet('board-contact', 64, 64, (ctx, cw, ch) => {
    const g = ctx.createRadialGradient(cw / 2, ch / 2, 0, cw / 2, ch / 2, cw / 2);
    g.addColorStop(0, 'rgba(0,0,0,0.8)');
    g.addColorStop(0.55, 'rgba(0,0,0,0.4)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, cw, ch);
  });
  return (
    <mesh position={[m(at[0]), m(at[1]), m(TABLE_Z + 0.15)]} renderOrder={1}>
      <planeGeometry args={[m(w * 1.4), m(d * 1.4)]} />
      <meshBasicMaterial map={tex} transparent opacity={k} depthWrite={false} />
    </mesh>
  );
}

/** The café round the table: a warm oak floor and a dark green wall with the café's sign. */
function Cafe() {
  const floor = useSheet('board-floor', 512, 512, (ctx, w, h) => {
    const plank = h / 8;
    let s = 11;
    const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
    for (let k = 0; k < 8; k += 1) {
      const v = 120 + r() * 30;
      ctx.fillStyle = `rgb(${v + 40}, ${v + 8}, ${v - 40})`;
      ctx.fillRect(0, k * plank, w, plank);
      ctx.fillStyle = 'rgba(40, 22, 10, 0.35)';
      ctx.fillRect(0, k * plank, w, 2);
      ctx.fillRect(r() * w, k * plank, 2, plank);
      for (let g = 0; g < 30; g += 1) {
        ctx.fillStyle = `rgba(60, 34, 14, ${0.05 + r() * 0.08})`;
        ctx.fillRect(0, k * plank + r() * plank, w, 1);
      }
    }
  });
  const wall = useSheet('board-wall', 700, 500, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#1f3a30');
    g.addColorStop(1, '#13261f');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f4ede1';
    ctx.font = `800 ${h * 0.1}px Pretendard, sans-serif`;
    ctx.fillText('BOARD GAME CAFÉ', w / 2, h * 0.3);
    ctx.font = `600 ${h * 0.06}px Pretendard, sans-serif`;
    ctx.fillStyle = '#cfe8dc';
    ctx.fillText('로봇과 오목 한 판 · 먼저 다섯 개를 이으면 이겨요', w / 2, h * 0.42);
    // A board pattern as the café's motif.
    ctx.strokeStyle = 'rgba(244, 237, 225, 0.14)';
    ctx.lineWidth = 3;
    for (let k = 0; k < 7; k += 1) {
      ctx.beginPath();
      ctx.moveTo(w * 0.3, h * (0.55 + k * 0.06));
      ctx.lineTo(w * 0.7, h * (0.55 + k * 0.06));
      ctx.moveTo(w * (0.3 + k * 0.0667), h * 0.55);
      ctx.lineTo(w * (0.3 + k * 0.0667), h * 0.91);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(244, 237, 225, 0.3)';
    for (const [c, r] of [
      [2, 2],
      [3, 3],
      [4, 4],
    ]) {
      ctx.beginPath();
      ctx.arc(w * (0.3 + c * 0.0667), h * (0.55 + r * 0.06), h * 0.022, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  return (
    <group>
      <mesh position={[m(80), m(-200), m(FLOOR_Z)]} receiveShadow>
        <planeGeometry args={[m(2600), m(2200)]} />
        <meshStandardMaterial map={floor} roughness={0.7} />
      </mesh>
      <mesh position={[m(80), m(540), m(FLOOR_Z + 1000)]} rotation={[Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[m(1400), m(2000)]} />
        <meshStandardMaterial map={wall} roughness={0.8} side={2} />
      </mesh>
      {/* A warm pendant over the table. */}
      <pointLight position={[m(160), m(-40), m(650)]} color="#ffe6c4" intensity={0.55} distance={m(1700)} decay={1.4} />
    </group>
  );
}

/** The café table: a walnut top with a rounded edge, a dark steel frame, the robot's plate. */
function CafeTable() {
  const T = TABLE;
  const cx = (T.x0 + T.x1) / 2;
  const cy = (T.y0 + T.y1) / 2;
  return (
    <group>
      <RBox at={[cx, cy, TABLE_Z - 15]} size={[T.x1 - T.x0, T.y1 - T.y0, 30]} radius={6}>
        <meshPhysicalMaterial color="#6b4528" map={wood([2, 2])} roughness={0.5} clearcoat={0.35} clearcoatRoughness={0.35} />
      </RBox>
      {[
        [T.x0 + 40, T.y0 + 40],
        [T.x1 - 40, T.y0 + 40],
        [T.x0 + 40, T.y1 - 40],
        [T.x1 - 40, T.y1 - 40],
      ].map(([x, y]) => (
        <mesh key={`${x},${y}`} position={[m(x), m(y), m((TABLE_Z - 30 + FLOOR_Z) / 2)]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[m(16), m(16), m(TABLE_Z - 30 - FLOOR_Z), 16]} />
          <meshStandardMaterial color="#2a2d31" metalness={0.6} roughness={0.4} map={brushed([1, 4])} />
        </mesh>
      ))}
      <RBox at={[0, 0, TABLE_Z + 1]} size={[170, 170, 2]} radius={3}>
        <meshStandardMaterial color="#d6dadf" metalness={0.75} roughness={0.32} map={brushed([2, 2])} />
      </RBox>
    </group>
  );
}

/**
 * The board: a pale kaya-wood block, 9 × 9 lines 16 mm apart, the star points, 가로 1 … 9 along the
 * person's edge and 세로 1 … 9 along the left one, and a mm ruler in the robot's x (front edge) and y
 * (left edge) so the spacing can be read off it (H2).
 */
function Board() {
  const W = B.x1 - B.x0;
  const H = B.y1 - B.y0;
  const tex = useSheet('board-face', W * 6, H * 6, (ctx, w, h) => {
    const k = w / W;
    const X = (x: number) => (x - B.x0) * k;
    const Y = (y: number) => h - (y - B.y0) * k;
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, '#e2c08a');
    g.addColorStop(1, '#d3ab72');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    // Wood grain.
    let s = 5;
    const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
    for (let n = 0; n < 70; n += 1) {
      ctx.strokeStyle = `rgba(140, 92, 40, ${0.05 + r() * 0.07})`;
      ctx.lineWidth = 1 + r() * 2;
      const y0 = r() * h;
      ctx.beginPath();
      ctx.moveTo(0, y0);
      ctx.bezierCurveTo(w * 0.3, y0 + (r() - 0.5) * 30, w * 0.7, y0 + (r() - 0.5) * 30, w, y0 + (r() - 0.5) * 20);
      ctx.stroke();
    }
    const last = BOARD.x0 + (BOARD.n - 1) * BOARD.pitch;
    const lastY = BOARD.y0 + (BOARD.n - 1) * BOARD.pitch;
    ctx.strokeStyle = '#2b1d10';
    for (let i = 0; i < BOARD.n; i += 1) {
      ctx.lineWidth = i === 0 || i === BOARD.n - 1 ? k * 0.55 : k * 0.32;
      const x = BOARD.x0 + i * BOARD.pitch;
      const y = BOARD.y0 + i * BOARD.pitch;
      ctx.beginPath();
      ctx.moveTo(X(x), Y(BOARD.y0));
      ctx.lineTo(X(x), Y(lastY));
      ctx.moveTo(X(BOARD.x0), Y(y));
      ctx.lineTo(X(last), Y(y));
      ctx.stroke();
    }
    ctx.fillStyle = '#2b1d10';
    for (const [c, rr] of [
      [3, 3],
      [7, 3],
      [5, 5],
      [3, 7],
      [7, 7],
    ]) {
      const q = pointXY({ c, r: rr });
      ctx.beginPath();
      ctx.arc(X(q.x), Y(q.y), k * 1.1, 0, Math.PI * 2);
      ctx.fill();
    }
    // 가로 1 … 9 (the person's edge) and 세로 1 … 9 (the left edge).
    ctx.font = `700 ${k * 3.4}px Pretendard, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 1; i <= BOARD.n; i += 1) {
      const q = pointXY({ c: i, r: 1 });
      ctx.fillText(String(i), X(q.x), Y(BOARD.y0 - 6.5));
      const p = pointXY({ c: 1, r: i });
      ctx.fillText(String(i), X(BOARD.x0 - 7.5), Y(p.y));
    }
    // The ruler: every mm a tick, every 10 mm a number, in the robot's x and y.
    ctx.fillStyle = '#5a3a1c';
    ctx.font = `600 ${k * 2}px Pretendard, sans-serif`;
    for (let x = Math.ceil(B.x0); x <= B.x1; x += 1) {
      const big = x % 10 === 0;
      ctx.fillRect(X(x) - k * 0.08, h - k * (big ? 2.4 : 1.2), k * 0.16, k * (big ? 2.4 : 1.2));
      if (big && x % 20 === 0) ctx.fillText(String(x), X(x), h - k * 3.6);
    }
    for (let y = Math.ceil(B.y0); y <= B.y1; y += 1) {
      const big = y % 10 === 0;
      ctx.fillRect(0, Y(y) - k * 0.08, k * (big ? 2.4 : 1.2), k * 0.16);
    }
    ctx.textAlign = 'right';
    ctx.font = `700 ${k * 2.2}px Pretendard, sans-serif`;
    ctx.fillText('x (mm) →', w - k * 1.5, h - k * 6.2);
  });
  return (
    <group>
      <RBox at={[(B.x0 + B.x1) / 2, (B.y0 + B.y1) / 2, BOARD.top / 2]} size={[W, H, BOARD.top]} radius={1.2}>
        <meshPhysicalMaterial color="#cfa46c" map={wood([1, 1])} roughness={0.5} clearcoat={0.3} />
      </RBox>
      <mesh position={[m((B.x0 + B.x1) / 2), m((B.y0 + B.y1) / 2), m(BOARD.top + 0.03)]} receiveShadow>
        <planeGeometry args={[m(W), m(H)]} />
        <meshPhysicalMaterial map={tex} roughness={0.45} clearcoat={0.35} clearcoatRoughness={0.4} />
      </mesh>
    </group>
  );
}

/** The white stones' tray at the robot's right: a walnut tray with 3 × 5 shallow pockets. */
function StoneTray() {
  const T = STONE_TRAY;
  const w = (T.rows - 1) * T.pitch + 24;
  const d = (T.cols - 1) * T.pitch + 24;
  const tex = useSheet('board-tray', 240, 360, (ctx, cw, ch) => {
    ctx.fillStyle = '#5d3b21';
    ctx.fillRect(0, 0, cw, ch);
    const k = cw / w;
    for (let i = 0; i < T.rows; i += 1)
      for (let j = 0; j < T.cols; j += 1) {
        const x = (12 + i * T.pitch) * k;
        const y = ch - (12 + j * T.pitch) * k;
        const g = ctx.createRadialGradient(x, y, 0, x, y, 8 * k);
        g.addColorStop(0, '#2f1d0f');
        g.addColorStop(1, '#5d3b21');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, 8 * k, 0, Math.PI * 2);
        ctx.fill();
      }
  });
  const cx = T.x + (T.rows - 1) * T.pitch * 0.5;
  const cy = T.y + (T.cols - 1) * T.pitch * 0.5;
  return (
    <group>
      <RBox at={[cx, cy, T.top / 2]} size={[w, d, T.top]} radius={2}>
        <meshPhysicalMaterial color="#5d3b21" map={wood([1, 1])} roughness={0.5} clearcoat={0.3} />
      </RBox>
      <mesh position={[m(cx), m(cy), m(T.top + 0.03)]}>
        <planeGeometry args={[m(w), m(d)]} />
        <meshStandardMaterial map={tex} roughness={0.6} />
      </mesh>
    </group>
  );
}

/** The person's bowl of black stones (a turned wooden pot, a few stones showing). */
function Bowl() {
  return (
    <group>
      <Turned
        at={[BOWL.x, BOWL.y, TABLE_Z]}
        profile={[
          [0, 0],
          [18, 0],
          [24, 8],
          [26, 20],
          [23, 24],
          [21, 22],
          [19, 10],
          [0, 9],
        ]}
      >
        <meshPhysicalMaterial color="#7a4e2b" map={wood([1, 1])} roughness={0.45} clearcoat={0.5} />
      </Turned>
      {[
        [-6, -4, 12],
        [5, -3, 12.5],
        [0, 6, 12.8],
        [-8, 7, 13.4],
        [8, 6, 13],
      ].map(([dx, dy, z]) => (
        <mesh key={`${dx},${dy}`} position={[m(BOWL.x + dx), m(BOWL.y + dy), m(TABLE_Z + z)]} scale={[1, 1, 0.38]}>
          <sphereGeometry args={[m(7), 18, 12]} />
          <meshPhysicalMaterial color={BLACK} roughness={0.35} clearcoat={0.9} />
        </mesh>
      ))}
    </group>
  );
}

/** The turn lamp at the person's corner: glows green while it is the robot's turn. */
function TurnLamp({ world }: { world: RefObject<WorldState | null> }) {
  const mat = useRef<MeshStandardMaterial>(null);
  const glow = useRef(0);
  useFrame((_, dt) => {
    const on = !!world.current?.cell?.line.in['로봇 차례'];
    if (!mat.current) return;
    glow.current += ((on ? 1 : 0) - glow.current) * (1 - Math.exp(-Math.min(dt, 0.1) / 0.1));
    mat.current.color.setRGB(0.914 - 0.674 * glow.current, 0.925 - 0.063 * glow.current, 0.937 - 0.42 * glow.current);
    mat.current.emissive.set('#22c55e');
    mat.current.emissiveIntensity = 2 * glow.current;
  });
  return (
    <group>
      <Turned
        at={[LAMP.x, LAMP.y, TABLE_Z]}
        profile={[
          [0, 0],
          [22, 0],
          [22, 26],
          [18, 30],
          [0, 30],
        ]}
      >
        <meshPhysicalMaterial color="#20252b" roughness={0.35} clearcoat={0.6} />
      </Turned>
      <Turned
        at={[LAMP.x, LAMP.y, TABLE_Z + 30]}
        profile={[
          [0, 0],
          [15, 0],
          [15, 7],
          [10, 13],
          [0, 15],
        ]}
      >
        <meshStandardMaterial ref={mat} color="#e9ecef" roughness={0.3} />
      </Turned>
    </group>
  );
}

/** The person's hand: reaching in from their side with a black stone, putting it on its point, going back. */
function Hand({ world }: { world: RefObject<WorldState | null> }) {
  const g = useRef<Group>(null);
  const stone = useRef<Mesh>(null);
  useFrame(() => {
    const b = world.current?.cell?.board;
    const t = world.current?.cell?.line.t ?? 0;
    if (!g.current) return;
    const f = reach(b, t);
    g.current.visible = f > 0.01 && !!b?.person;
    if (!b?.person) return;
    const q = pointXY(b.person.move);
    // The fingertips (and the stone between them) end over the point.
    g.current.position.set(m(q.x), m(q.y - 46 - (1 - f) * 150), m(BOARD.top + 14 + (1 - f) * 40));
    if (stone.current) stone.current.visible = !b.person.dropped;
  });
  const skin = <meshPhysicalMaterial color="#e2b48f" roughness={0.55} sheen={0.5} sheenRoughness={0.6} clearcoat={0.1} />;
  return (
    <group ref={g} visible={false}>
      <RBox at={[0, -10, 6]} size={[56, 72, 20]} radius={9}>
        {skin}
      </RBox>
      {/* Index and middle finger forward, holding the stone; the others curled. */}
      {[-6, 6].map((d) => (
        <RBox key={d} at={[d, 36, 2]} size={[11, 34, 10]} radius={5}>
          {skin}
        </RBox>
      ))}
      {[-19, 19].map((d) => (
        <RBox key={d} at={[d, 22, 4]} size={[11, 20, 11]} radius={5}>
          {skin}
        </RBox>
      ))}
      <RBox at={[0, -85, 10]} size={[72, 64, 30]} radius={12}>
        <meshStandardMaterial color="#8a3b2e" roughness={0.85} />
      </RBox>
      <mesh ref={stone} position={[0, m(48), m(-5)]} scale={[1, 1, 0.38]}>
        <sphereGeometry args={[m(7), 18, 12]} />
        <meshPhysicalMaterial color={BLACK} roughness={0.35} clearcoat={0.9} />
      </mesh>
    </group>
  );
}

/** Other guests at the back of the café (the person at the table is seen by the hand only). */
function People() {
  return (
    <Suspense fallback={null}>
      <Model group="people" name="customer" at={[760, -600]} z={FLOOR_Z} h={1640} yaw={-Math.PI * 0.75} pose="Idle" poseAt={0.4} smooth live />
      <Model group="people" name="workerMan" at={[-420, -720]} z={FLOOR_Z} h={1720} yaw={-Math.PI * 0.2} pose="Idle" poseAt={0.65} smooth live />
    </Suspense>
  );
}

export function BoardCell({ world, onHover }: { world: RefObject<WorldState | null>; onHover: (n: string | null) => void }) {
  return (
    <>
      <Cafe />
      <People />
      <CafeTable />
      <Contact at={[0, 0]} w={170} d={170} k={0.35} />
      <Contact at={[(B.x0 + B.x1) / 2, (B.y0 + B.y1) / 2]} w={B.x1 - B.x0} d={B.y1 - B.y0} k={0.3} />
      <Contact at={[BOWL.x, BOWL.y]} w={52} d={52} />
      <Contact at={[LAMP.x, LAMP.y]} w={44} d={44} />
      <Tagged name="오목판" onHover={onHover}>
        <Board />
      </Tagged>
      <Tagged name="흰 돌 상자" onHover={onHover}>
        <StoneTray />
      </Tagged>
      <Tagged name="검은 돌 통" onHover={onHover}>
        <Bowl />
      </Tagged>
      <Tagged name="차례 램프" onHover={onHover}>
        <TurnLamp world={world} />
      </Tagged>
      <Hand world={world} />
    </>
  );
}
