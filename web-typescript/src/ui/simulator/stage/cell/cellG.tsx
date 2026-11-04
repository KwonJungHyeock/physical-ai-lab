'use client';

/**
 * 실습 셀 G 로봇 캘리그라피 (입문 트랙 ① 생활 로봇): an event booth where a desk cobot with a pen
 * holder writes a customer's message card (engine/simulator/cell/draw.ts · 보고 #44). Unlike the
 * other cells it is drawn at full size: the arm itself on a white event table, the card (120 × 80
 * mm) on a green cutting mat whose printed grid is the robot's own x · y in mm, the pen stand, a
 * board of sample cards, the 완성 lamp at the customer's corner, a banner wall behind, the
 * customer across the table (−y) and the next one waiting.
 *
 * What changes is read from the world every frame: the card on the mat (where the customer put it),
 * the ink on it (the pen's trail, drawn as a brush-pen line), the customer's hand putting a card
 * down or taking it, the lamp.
 */

import { useFrame } from '@react-three/fiber';
import { Suspense, useMemo, useRef, type RefObject } from 'react';
import { BufferGeometry, Float32BufferAttribute, type Group, type Mesh, type MeshStandardMaterial } from 'three';

import { CARD_HOME, CARD_MM, MAT } from '@/engine/simulator/cell/draw';
import type { WorldState } from '@/engine/simulator/sim';

import Model from '@/ui/education/lab/ambient/Model';

import { RBox, Turned, brushed, wood } from '../sceneKit';
import { Tagged, m, useSheet } from './kit';

/** The table top, the mat's top and the card's top, mm (the paper is the robot base's z 0). */
const TABLE_Z = -2.3;
const MAT_Z = -0.3;
const CARD_T = 0.35;
/** The hall's floor (a 740 mm event table). */
const FLOOR_Z = -742;
const TABLE = { x0: -170, x1: 340, y0: -175, y1: 215 } as const;

const smooth = (s: number) => s * s * (3 - 2 * s);
/** The customer's hand over the mat: 0 away … 1 at the card, eased, over the 1.5 s it is there (in · rest · out). */
function handAt(d: NonNullable<NonNullable<WorldState['cell']>['draw']>, t: number): number {
  if (!d.hand) return 0;
  const left = d.hand.until - t;
  return smooth(Math.max(0, Math.min(1, Math.min(1.5 - left, left) / 0.5)));
}

/** A soft contact shadow under a thing on the table (a radial fade under the key light's sharp one). */
function Contact({ at, w, d, k = 0.5 }: { at: [number, number]; w: number; d: number; k?: number }) {
  const tex = useSheet('draw-contact', 64, 64, (ctx, cw, ch) => {
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

/** The event table: a white laminate top with a rounded edge, a printed front skirt facing the customer, steel legs. */
function BoothTable() {
  const T = TABLE;
  const skirt = useSheet('draw-skirt', 510, 160, (ctx, w, h) => {
    ctx.fillStyle = '#18201d';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#0f6b4c';
    ctx.fillRect(0, h * 0.82, w, h * 0.18);
    ctx.fillStyle = '#f4ede1';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `800 ${h * 0.2}px Pretendard, sans-serif`;
    ctx.fillText('ROBOT CALLIGRAPHY', w / 2, h * 0.32);
    ctx.font = `600 ${h * 0.13}px Pretendard, sans-serif`;
    ctx.fillText('로봇이 써 주는 메시지 카드', w / 2, h * 0.58);
    ctx.fillStyle = '#fff';
    ctx.font = `700 ${h * 0.09}px Pretendard, sans-serif`;
    ctx.fillText('카드를 매트에 올려 주세요 · 완성 램프가 켜지면 가져가세요', w / 2, h * 0.91);
  });
  const cx = (T.x0 + T.x1) / 2;
  const cy = (T.y0 + T.y1) / 2;
  return (
    <group>
      <RBox at={[cx, cy, TABLE_Z - 12.5]} size={[T.x1 - T.x0, T.y1 - T.y0, 25]} radius={6}>
        <meshPhysicalMaterial color="#f4f4f1" roughness={0.42} clearcoat={0.4} clearcoatRoughness={0.3} />
      </RBox>
      {/* The printed skirt on the customer's side, down to near the floor. */}
      <mesh position={[m(cx), m(T.y0 - 1.5), m((TABLE_Z - 25 + FLOOR_Z + 40) / 2)]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[m(T.x1 - T.x0), m(TABLE_Z - 25 - FLOOR_Z - 40)]} />
        <meshStandardMaterial map={skirt} roughness={0.85} />
      </mesh>
      {[
        [T.x0 + 30, T.y0 + 30],
        [T.x1 - 30, T.y0 + 30],
        [T.x0 + 30, T.y1 - 30],
        [T.x1 - 30, T.y1 - 30],
      ].map(([x, y]) => (
        <mesh key={`${x},${y}`} position={[m(x), m(y), m((TABLE_Z - 25 + FLOOR_Z) / 2)]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[m(14), m(14), m(TABLE_Z - 25 - FLOOR_Z), 16]} />
          <meshStandardMaterial color="#c8cdd2" metalness={0.8} roughness={0.3} map={brushed([1, 4])} />
        </mesh>
      ))}
      {/* The robot's mounting plate. */}
      <RBox at={[0, 0, TABLE_Z / 2]} size={[170, 170, -TABLE_Z]} radius={3}>
        <meshStandardMaterial color="#d6dadf" metalness={0.75} roughness={0.32} map={brushed([2, 2])} />
      </RBox>
    </group>
  );
}

/** The hall round the booth: a grey exhibition carpet and a banner wall behind the robot. */
function Hall() {
  const carpet = useSheet('draw-carpet', 400, 400, (ctx, w, h) => {
    ctx.fillStyle = '#5b5f66';
    ctx.fillRect(0, 0, w, h);
    let s = 7;
    const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
    for (let k = 0; k < 9000; k += 1) {
      const v = 70 + r() * 40;
      ctx.fillStyle = `rgba(${v}, ${v + 3}, ${v + 9}, 0.5)`;
      ctx.fillRect(r() * w, r() * h, 1.4, 1.4);
    }
  });
  const banner = useSheet('draw-banner', 700, 500, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#173a2e');
    g.addColorStop(1, '#0d211a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f4ede1';
    ctx.font = `800 ${h * 0.11}px Pretendard, sans-serif`;
    ctx.fillText('ROBOT CALLIGRAPHY', w / 2, h * 0.3);
    ctx.font = `600 ${h * 0.065}px Pretendard, sans-serif`;
    ctx.fillStyle = '#cfe8dc';
    ctx.fillText('협동로봇이 한 획씩 써 드려요', w / 2, h * 0.42);
    // A big brush-stroke 'ㅅ' as the booth's motif.
    ctx.strokeStyle = 'rgba(244, 237, 225, 0.18)';
    ctx.lineCap = 'round';
    ctx.lineWidth = h * 0.05;
    ctx.beginPath();
    ctx.moveTo(w * 0.42, h * 0.55);
    ctx.quadraticCurveTo(w * 0.36, h * 0.75, w * 0.28, h * 0.9);
    ctx.moveTo(w * 0.4, h * 0.68);
    ctx.quadraticCurveTo(w * 0.5, h * 0.8, w * 0.62, h * 0.88);
    ctx.stroke();
  });
  return (
    <group>
      <mesh position={[m(80), m(-200), m(FLOOR_Z)]} receiveShadow>
        <planeGeometry args={[m(2600), m(2200)]} />
        <meshStandardMaterial map={carpet} roughness={0.95} />
      </mesh>
      <mesh position={[m(80), m(520), m(FLOOR_Z + 1000)]} rotation={[Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[m(1400), m(2000)]} />
        <meshStandardMaterial map={banner} roughness={0.8} side={2} />
      </mesh>
      {/* A warm spot over the table. */}
      <pointLight position={[m(120), m(-60), m(700)]} color="#fff1dc" intensity={0.5} distance={m(1800)} decay={1.4} />
    </group>
  );
}

/** The cutting mat: green, a 10 mm grid with every 50 mm bold, the robot's x and y printed along its edges, and the usual card place. */
function Mat() {
  const W = MAT.x1 - MAT.x0;
  const H = MAT.y1 - MAT.y0;
  const tex = useSheet('draw-mat', W * 2, H * 2, (ctx, w, h) => {
    const k = w / W;
    const X = (x: number) => (x - MAT.x0) * k;
    const Y = (y: number) => h - (y - MAT.y0) * k;
    ctx.fillStyle = '#1f6b4f';
    ctx.fillRect(0, 0, w, h);
    for (let x = Math.ceil(MAT.x0 / 10) * 10; x <= MAT.x1; x += 10) {
      ctx.strokeStyle = x % 50 === 0 ? 'rgba(235,245,238,0.75)' : 'rgba(235,245,238,0.32)';
      ctx.lineWidth = x % 50 === 0 ? k * 0.45 : k * 0.22;
      ctx.beginPath();
      ctx.moveTo(X(x), 0);
      ctx.lineTo(X(x), h);
      ctx.stroke();
    }
    for (let y = Math.ceil(MAT.y0 / 10) * 10; y <= MAT.y1; y += 10) {
      ctx.strokeStyle = y % 50 === 0 ? 'rgba(235,245,238,0.75)' : 'rgba(235,245,238,0.32)';
      ctx.lineWidth = y % 50 === 0 ? k * 0.45 : k * 0.22;
      ctx.beginPath();
      ctx.moveTo(0, Y(y));
      ctx.lineTo(w, Y(y));
      ctx.stroke();
    }
    ctx.fillStyle = '#f4f7f5';
    ctx.font = `700 ${k * 4}px Pretendard, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    for (let x = Math.ceil(MAT.x0 / 20) * 20; x <= MAT.x1 - 5; x += 20) ctx.fillText(String(x), X(x), h - k * 1.2);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    for (let y = Math.ceil(MAT.y0 / 20) * 20; y <= MAT.y1 - 5; y += 20) if (y > MAT.y0 + 6) ctx.fillText(String(y), k * 1.2, Y(y));
    ctx.font = `800 ${k * 4.4}px Pretendard, sans-serif`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText('x (mm) →', w - k * 2, h - k * 6);
    ctx.textAlign = 'left';
    ctx.fillText('↑ y (mm)', k * 12, k * 7);
    // The usual card place: corner marks and a note.
    ctx.strokeStyle = '#ffd36b';
    ctx.lineWidth = k * 0.7;
    const [cx, cy] = [X(CARD_HOME.x), Y(CARD_HOME.y)];
    const L = k * 8;
    ctx.beginPath();
    ctx.moveTo(cx, cy - L);
    ctx.lineTo(cx, cy);
    ctx.lineTo(cx + L, cy);
    const [ex, ey] = [X(CARD_HOME.x + CARD_MM.w), Y(CARD_HOME.y + CARD_MM.h)];
    ctx.moveTo(ex - L, ey);
    ctx.lineTo(ex, ey);
    ctx.lineTo(ex, ey + L);
    ctx.stroke();
    ctx.fillStyle = '#ffd36b';
    ctx.beginPath();
    ctx.arc(cx, cy, k * 1.3, 0, Math.PI * 2);
    ctx.fill();
  });
  return (
    <group>
      <RBox at={[(MAT.x0 + MAT.x1) / 2, (MAT.y0 + MAT.y1) / 2, (TABLE_Z + MAT_Z) / 2]} size={[W, H, MAT_Z - TABLE_Z]} radius={1.5} shadow={false}>
        <meshStandardMaterial color="#1c5f46" roughness={0.75} />
      </RBox>
      <mesh position={[m((MAT.x0 + MAT.x1) / 2), m((MAT.y0 + MAT.y1) / 2), m(MAT_Z + 0.02)]} receiveShadow>
        <planeGeometry args={[m(W), m(H)]} />
        <meshStandardMaterial map={tex} roughness={0.7} />
      </mesh>
    </group>
  );
}

/** The card on the mat (where the customer put it): cream stock with a thin printed frame. */
function CardOnMat({ world }: { world: RefObject<WorldState | null> }) {
  const g = useRef<Group>(null);
  const face = useSheet('draw-card', CARD_MM.w * 2, CARD_MM.h * 2, (ctx, w, h) => {
    ctx.fillStyle = '#fbf7ef';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#c9a77c';
    ctx.lineWidth = w * 0.004;
    ctx.strokeRect(w * 0.03, h * 0.045, w * 0.94, h * 0.91);
    ctx.fillStyle = '#b08a5c';
    ctx.font = `600 ${h * 0.045}px Pretendard, sans-serif`;
    ctx.textAlign = 'right';
    ctx.fillText('ROBOT CALLIGRAPHY', w * 0.95, h * 0.92);
  });
  useFrame(() => {
    const d = world.current?.cell?.draw;
    const t = world.current?.cell?.line.t ?? 0;
    if (!g.current) return;
    g.current.visible = !!d?.corner;
    if (!d?.corner) return;
    // Being taken: once the hand is on it, the card goes away with the hand (lifted a little).
    const taking = d.hand?.then === 'take' && d.hand.until - t < 0.5;
    const f = taking ? handAt(d, t) : 1;
    g.current.position.set(m(d.corner.x + CARD_MM.w / 2), m(d.corner.y + CARD_MM.h / 2 - 130 * (1 - f)), m(-CARD_T / 2 + 0.05 + 14 * (1 - f)));
  });
  return (
    <group ref={g}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[m(CARD_MM.w), m(CARD_MM.h), m(CARD_T)]} />
        <meshPhysicalMaterial color="#f3ede2" roughness={0.82} sheen={0.3} sheenRoughness={0.9} />
      </mesh>
      <mesh position={[0, 0, m(CARD_T / 2 + 0.01)]}>
        <planeGeometry args={[m(CARD_MM.w), m(CARD_MM.h)]} />
        <meshStandardMaterial map={face} roughness={0.85} />
      </mesh>
    </group>
  );
}

/** The ink: the pen's trail as a brush-pen line 0.9 mm wide on the paper (a flat ribbon per segment). */
function Ink({ world }: { world: RefObject<WorldState | null> }) {
  const geo = useMemo(() => new BufferGeometry(), []);
  const seen = useRef(-1);
  useFrame(() => {
    const w = world.current;
    if (!w) return;
    const n = w.trail.reduce((a, s) => a + s.length, 0) + w.trail.length * 1000;
    if (n === seen.current) return;
    seen.current = n;
    const pos: number[] = [];
    const half = 0.45;
    const z = m(0.13);
    for (const s of w.trail)
      for (let i = 1; i < s.length; i += 1) {
        const [ax, ay] = s[i - 1];
        const [bx, by] = s[i];
        const len = Math.hypot(bx - ax, by - ay) || 1;
        // Across the segment, and a little past each end so the joints close.
        const nx = (-(by - ay) / len) * half;
        const ny = ((bx - ax) / len) * half;
        const ex = ((bx - ax) / len) * half * 0.8;
        const ey = ((by - ay) / len) * half * 0.8;
        const p = [
          [ax - ex + nx, ay - ey + ny],
          [ax - ex - nx, ay - ey - ny],
          [bx + ex - nx, by + ey - ny],
          [bx + ex + nx, by + ey + ny],
        ].map(([x, y]) => [m(x), m(y), z]);
        pos.push(...p[0], ...p[1], ...p[2], ...p[0], ...p[2], ...p[3]);
      }
    geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
  });
  return (
    <mesh geometry={geo} frustumCulled={false}>
      <meshPhysicalMaterial color="#141a33" roughness={0.28} clearcoat={0.6} clearcoatRoughness={0.3} side={2} polygonOffset polygonOffsetFactor={-2} />
    </mesh>
  );
}

/** The customer's hand over the mat: bringing a card in, or taking the written one away. */
function Hand({ world }: { world: RefObject<WorldState | null> }) {
  const g = useRef<Group>(null);
  const held = useRef<Mesh>(null);
  useFrame(() => {
    const d = world.current?.cell?.draw;
    const t = world.current?.cell?.line.t ?? 0;
    if (!g.current) return;
    g.current.visible = !!d?.hand;
    if (!d?.hand) return;
    // In, rest, out over the 1.5 s the hand is there, eased at each end.
    const f = handAt(d, t);
    const c = d.corner ?? d.place;
    g.current.position.set(m(c.x + CARD_MM.w / 2), m(c.y - 120 + f * 130), m(30 - f * 18));
    // Putting a card down: it is in the hand until the hand is out again (then it lies on the mat).
    if (held.current) held.current.visible = d.hand.then === 'put';
  });
  return (
    <group ref={g} visible={false}>
      <RBox at={[0, -10, 14]} size={[62, 80, 22]} radius={10}>
        <meshPhysicalMaterial color="#e2b48f" roughness={0.55} sheen={0.5} sheenRoughness={0.6} clearcoat={0.1} />
      </RBox>
      {[-21, -7, 7, 21].map((d) => (
        <RBox key={d} at={[d, 40, 12]} size={[12, 34, 12]} radius={5.5}>
          <meshPhysicalMaterial color="#e2b48f" roughness={0.55} sheen={0.5} sheenRoughness={0.6} clearcoat={0.1} />
        </RBox>
      ))}
      <RBox at={[0, -95, 16]} size={[78, 70, 34]} radius={12}>
        <meshStandardMaterial color="#3b5b8f" roughness={0.85} />
      </RBox>
      <mesh ref={held} position={[0, m(20), m(1)]}>
        <boxGeometry args={[m(CARD_MM.w), m(CARD_MM.h), m(CARD_T)]} />
        <meshStandardMaterial color="#f3ede2" roughness={0.9} />
      </mesh>
    </group>
  );
}

/** The 완성 lamp at the customer's corner: a white cap that glows green when the card is ready. */
function DoneLamp({ world }: { world: RefObject<WorldState | null> }) {
  const mat = useRef<MeshStandardMaterial>(null);
  const glow = useRef(0);
  useFrame((_, dt) => {
    const on = !!world.current?.cell?.line.out['완성 램프'];
    if (!mat.current) return;
    // The lamp fades on and off.
    glow.current += ((on ? 1 : 0) - glow.current) * (1 - Math.exp(-Math.min(dt, 0.1) / 0.1));
    mat.current.color.setRGB(0.914 - 0.674 * glow.current, 0.925 - 0.063 * glow.current, 0.937 - 0.42 * glow.current);
    mat.current.emissive.set('#22c55e');
    mat.current.emissiveIntensity = 2 * glow.current;
  });
  const x = 312;
  const y = -140;
  return (
    <group>
      <Turned
        at={[x, y, TABLE_Z]}
        profile={[
          [0, 0],
          [24, 0],
          [24, 30],
          [20, 34],
          [0, 34],
        ]}
      >
        <meshPhysicalMaterial color="#20252b" roughness={0.35} clearcoat={0.6} />
      </Turned>
      <Turned
        at={[x, y, TABLE_Z + 34]}
        profile={[
          [0, 0],
          [17, 0],
          [17, 8],
          [12, 15],
          [0, 17],
        ]}
      >
        <meshStandardMaterial ref={mat} color="#e9ecef" roughness={0.3} />
      </Turned>
    </group>
  );
}

/** The pen stand (spare pens) and the stack of blank cards behind the robot. */
function PenStand() {
  return (
    <group>
      <Turned
        at={[55, 135, TABLE_Z]}
        profile={[
          [0, 0],
          [14, 0],
          [15, 58],
          [13.5, 58],
          [12.5, 2],
          [0, 2],
        ]}
      >
        <meshStandardMaterial color="#d6dadf" metalness={0.8} roughness={0.3} />
      </Turned>
      {[
        ['#141a33', -4, 2, 0.12],
        ['#7a1f2b', 4, -3, -0.1],
        ['#1d4ed8', 1, 5, 0.05],
      ].map(([c, dx, dy, lean]) => (
        <group key={c as string} position={[m(55 + (dx as number)), m(135 + (dy as number)), m(TABLE_Z + 2)]} rotation={[lean as number, (lean as number) * 0.7, 0]}>
          <mesh position={[0, 0, m(65)]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[m(4.5), m(4.5), m(130), 14]} />
            <meshPhysicalMaterial color={c as string} roughness={0.3} clearcoat={0.7} />
          </mesh>
        </group>
      ))}
      {/* Blank cards, stacked in a wooden tray. */}
      <RBox at={[-95, -110, TABLE_Z + 5]} size={[140, 100, 10]} radius={3}>
        <meshStandardMaterial color="#b98a5a" map={wood([1, 1])} roughness={0.6} />
      </RBox>
      <RBox at={[-95, -110, TABLE_Z + 12]} size={[CARD_MM.w + 2, CARD_MM.h + 2, 6]} radius={0.8}>
        <meshStandardMaterial color="#f3ede2" roughness={0.9} />
      </RBox>
    </group>
  );
}

/** A small easel of sample cards (what the robot can write), facing the customer. */
function SampleBoard() {
  const tex = useSheet('draw-samples', 240, 170, (ctx, w, h) => {
    ctx.fillStyle = '#efe6d6';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#18201d';
    ctx.textAlign = 'center';
    ctx.font = `800 ${h * 0.09}px Pretendard, sans-serif`;
    ctx.fillText('오늘의 글귀', w / 2, h * 0.13);
    const items: [string, string][] = [
      ['HELLO', '700'],
      ['사랑해', '700'],
      ['♥', '400'],
      ['□', '400'],
    ];
    items.forEach(([s, wt], k) => {
      const cx = w * (0.27 + (k % 2) * 0.46);
      const cy = h * (0.4 + Math.floor(k / 2) * 0.36);
      ctx.fillStyle = '#fbf7ef';
      ctx.fillRect(cx - w * 0.2, cy - h * 0.15, w * 0.4, h * 0.3);
      ctx.fillStyle = '#141a33';
      ctx.font = `${wt} ${h * 0.12}px Pretendard, sans-serif`;
      ctx.textBaseline = 'middle';
      ctx.fillText(s, cx, cy);
    });
  });
  const x = -110;
  const y = 150;
  return (
    <group position={[m(x), m(y), m(TABLE_Z)]} rotation={[0, 0, 0.35]}>
      <group rotation={[Math.PI / 2 - 0.25, 0, 0]}>
        <mesh position={[0, m(95), 0]}>
          <planeGeometry args={[m(240), m(170)]} />
          <meshStandardMaterial map={tex} roughness={0.85} side={2} />
        </mesh>
        <RBox at={[0, 95, -2]} size={[250, 180, 3]} radius={2}>
          <meshStandardMaterial color="#b98a5a" map={wood([1, 1])} roughness={0.6} />
        </RBox>
      </group>
    </group>
  );
}

/** The next customers waiting off to the side (the one at the table is seen by the hand only: full-size people would stand in the camera's way). */
function People() {
  return (
    <Suspense fallback={null}>
      <Model group="people" name="customer" at={[720, -620]} z={FLOOR_Z} h={1640} yaw={-Math.PI * 0.75} pose="Idle" poseAt={0.3} smooth live />
      <Model group="people" name="workerMan" at={[900, -420]} z={FLOOR_Z} h={1720} yaw={-Math.PI * 0.6} pose="Idle" poseAt={0.75} smooth live />
    </Suspense>
  );
}

export function DrawCell({ world, onHover }: { world: RefObject<WorldState | null>; onHover: (n: string | null) => void }) {
  return (
    <>
      <Hall />
      <People />
      <BoothTable />
      {/* Soft contact shadows on the table: the robot's plate, the lamp, the pen stand, the card tray. */}
      <Contact at={[0, 0]} w={170} d={170} k={0.35} />
      <Contact at={[312, -140]} w={48} d={48} />
      <Contact at={[55, 135]} w={30} d={30} />
      <Contact at={[-95, -110]} w={140} d={100} k={0.35} />
      <Tagged name="커팅 매트" onHover={onHover}>
        <Mat />
      </Tagged>
      <Tagged name="메시지 카드" onHover={onHover}>
        <CardOnMat world={world} />
      </Tagged>
      <Ink world={world} />
      <Hand world={world} />
      <Tagged name="완성 램프" onHover={onHover}>
        <DoneLamp world={world} />
      </Tagged>
      <Tagged name="펜 꽂이" onHover={onHover}>
        <PenStand />
      </Tagged>
      <Tagged name="샘플 보드" onHover={onHover}>
        <SampleBoard />
      </Tagged>
    </>
  );
}
