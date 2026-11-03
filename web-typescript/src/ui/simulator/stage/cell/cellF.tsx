'use client';

/**
 * 실습 셀 F 로봇 카페 (입문 트랙 ① 생활 로봇): a café counter round the arm (engine/simulator/cell/
 * cells.ts cafeLayout · cafe.ts), in the simulator's own style: a wooden counter top on a dark body,
 * and round the arm the cup dispenser (a stainless tube of stacked cups), the ice maker, the coffee
 * machine (its lamp: amber while it extracts, green when done), the water dispenser and the pickup
 * shelf behind a glass door that slides up for the customer (whose hand reaches in while 손 감지).
 *
 * Round it, as robot cafés are set up in malls and highway rest areas (보고 #43 §2-3): a glass booth
 * (1~2 평, ~2,050 × 2,250 × 1,700 mm) with a lit header, the order kiosk and a self bar on its right,
 * numbered pickup windows in its front, a tiled floor with a few tables, and customers.
 *
 * What changes is read from the world every frame: the door, the streams while a station pours, what
 * is in each cup (ice, coffee, water: the level and the colour), the spills on the drip trays.
 */

import { useFrame } from '@react-three/fiber';
import { Suspense, useRef, type RefObject } from 'react';
import type { Group, Mesh, MeshPhysicalMaterial, MeshStandardMaterial } from 'three';

import { CUP_ML, CUP_SIZE, RECIPE, drinkMl } from '@/engine/simulator/cell/cafe';
import { CAFE_AT, cellLayout } from '@/engine/simulator/cell/cells';
import type { WorldState } from '@/engine/simulator/sim';

import Model from '@/ui/education/lab/ambient/Model';

import { RBox, Turned, brushed, wood } from '../sceneKit';
import { F, Paint, Skin, Steel, Tagged, m, travel, useSheet } from './kit';

const WOOD = '#b98a5a';
const BODY = '#2b2f36';

/* --- materials: brushed stainless, glossy plastics, wood grain (sceneKit textures, made in the browser) --- */

const Inox = ({ rep = [1, 1] as [number, number], tone = '#dfe3e7' }) => <meshStandardMaterial color={tone} metalness={0.86} roughness={0.3} map={brushed(rep)} />;
const Chrome = () => <meshStandardMaterial color="#eef1f4" metalness={1} roughness={0.12} />;
const Gloss = ({ color }: { color: string }) => <meshPhysicalMaterial color={color} roughness={0.32} clearcoat={0.7} clearcoatRoughness={0.25} />;
const Smoked = ({ opacity = 0.55 }) => <meshPhysicalMaterial color="#1b1f25" transparent opacity={opacity} roughness={0.05} metalness={0.2} />;

/** A slotted grille (drip trays, vents): dark slots on stainless, as a texture. */
function useGrille(key: string, slots = 9) {
  return useSheet(`cafe-grille-${key}`, 40, 40, (ctx, w, h) => {
    ctx.fillStyle = '#b9bfc6';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#1d2127';
    for (let k = 0; k < slots; k += 1) ctx.fillRect(w * 0.08, (h * (k + 0.3)) / slots, w * 0.84, h / slots / 2.2);
  });
}

/** The counter: a wood-grain top with a stainless front band, a dark body with a kick plate, mats under the stations. */
function Counter() {
  const grainTex = wood([2, 1]);
  return (
    <group>
      <RBox at={[110, 5, -6]} size={[440, 500, 12]} radius={3}>
        <meshPhysicalMaterial color={WOOD} map={grainTex} roughness={0.5} clearcoat={0.35} clearcoatRoughness={0.4} />
      </RBox>
      {/* Stainless edge band along the front (the customer's side) and the right. */}
      <RBox at={[110, -245.5, -6]} size={[442, 3, 13]} radius={1}>
        <Inox rep={[4, 1]} />
      </RBox>
      <RBox at={[110, 5, (F - 12) / 2]} size={[428, 488, -F - 12]} radius={2}>
        <Skin color={BODY} />
      </RBox>
      {/* Vertical slats on the front of the body (as café counters are clad). */}
      {Array.from({ length: 21 }, (_, k) => (
        <RBox key={k} at={[-96 + k * 20.5, -239.5, (F - 12) / 2 + 6]} size={[9, 3, -F - 32]} radius={1.2}>
          <meshStandardMaterial color="#3a3f47" roughness={0.6} />
        </RBox>
      ))}
      <RBox at={[110, -239, F + 6]} size={[428, 4, 12]} radius={1}>
        <Inox rep={[6, 1]} tone="#c9ced3" />
      </RBox>
      {/* Syrup bottles with pumps in the back corner, out of the arm's reach (decoration: 입문 drinks have no syrup). */}
      {['#c47a2c', '#7a3b1f', '#e8d8b0'].map((c, k) => (
        <group key={c}>
          <Turned at={[300, 175 + k * 22, 0]} profile={[[0, 0], [8, 0], [8, 34], [5, 40], [0, 40]]}>
            <meshPhysicalMaterial color={c} transparent opacity={0.85} roughness={0.08} clearcoat={1} />
          </Turned>
          <Turned at={[300, 175 + k * 22, 40]} profile={[[0, 0], [3, 0], [3, 10], [0, 10]]}>
            <meshStandardMaterial color="#1f2329" />
          </Turned>
          <RBox at={[296, 175 + k * 22, 51]} size={[10, 2.4, 2.4]} radius={1}>
            <meshStandardMaterial color="#1f2329" />
          </RBox>
        </group>
      ))}
      {/* A small knock box and a towel by the machine (a café's bench). */}
      <RBox at={[300, 95, 6]} size={[18, 18, 12]} radius={3}>
        <Gloss color="#202429" />
      </RBox>
      <RBox at={[300, -150, 1.5]} size={[34, 22, 3]} radius={1.5}>
        <meshStandardMaterial color="#e9e4da" roughness={0.95} />
      </RBox>
    </group>
  );
}

/** A drip tray: a stainless grille the cup stands on, the spill (brown) showing when a station poured with no cup. */
function Tray({ x, y, spill }: { x: number; y: number; spill: RefObject<Mesh | null> }) {
  const g = useGrille('tray', 8);
  return (
    <group>
      <RBox at={[x, y, -0.2]} size={[34, 34, 2.4]} radius={1.2}>
        <meshStandardMaterial color="#c3c9cf" metalness={0.8} roughness={0.35} map={g} />
      </RBox>
      <mesh ref={spill} position={[m(x), m(y), m(1.3)]} visible={false}>
        <cylinderGeometry args={[m(14), m(14), m(0.4), 28]} />
        <meshPhysicalMaterial color="#4a2a15" roughness={0.05} clearcoat={1} transparent opacity={0.9} />
      </mesh>
    </group>
  );
}

/** A stream from a spout down into the cup (or the tray): a thin glossy column that shimmers while it pours. */
function Stream({ world, busy, from, to, color, thick = 1.6 }: { world: RefObject<WorldState | null>; busy: string; from: [number, number, number]; to: [number, number]; color: string; thick?: number }) {
  const r = useRef<Mesh>(null);
  useFrame(({ clock }) => {
    if (!r.current) return;
    const on = !!world.current?.cell?.line.in[busy];
    r.current.visible = on;
    if (on) r.current.scale.x = r.current.scale.z = 0.85 + 0.15 * Math.sin(clock.elapsedTime * 40);
  });
  const [x0, y0, z0] = from;
  const len = z0;
  const mx = (x0 + to[0]) / 2;
  const my = (y0 + to[1]) / 2;
  const tilt = Math.atan2(Math.hypot(to[0] - x0, to[1] - y0), len);
  const yaw = Math.atan2(to[1] - y0, to[0] - x0);
  return (
    <group position={[m(mx), m(my), m(len / 2)]} rotation={[0, 0, yaw]}>
      <mesh ref={r} rotation={[0, -tilt, 0]} visible={false}>
        <cylinderGeometry args={[m(thick), m(thick * 0.7), m(Math.hypot(len, Math.hypot(to[0] - x0, to[1] - y0))), 12]} />
        <meshPhysicalMaterial color={color} roughness={0.05} clearcoat={1} transparent opacity={0.88} />
      </mesh>
    </group>
  );
}

/** Ice falling from the chute: a few cubes dropping in a loop while the ice maker pours. */
function IceFall({ world, from, to }: { world: RefObject<WorldState | null>; from: [number, number, number]; to: [number, number] }) {
  const cubes = useRef<(Mesh | null)[]>([]);
  useFrame(({ clock }) => {
    const on = !!world.current?.cell?.line.in['얼음 나오는 중'];
    cubes.current.forEach((c, k) => {
      if (!c) return;
      c.visible = on;
      if (!on) return;
      const f = (clock.elapsedTime * 2.2 + k / 6) % 1;
      c.position.set(m(from[0] + (to[0] - from[0]) * f), m(from[1] + (to[1] - from[1]) * f + (k % 2 ? 1.5 : -1.5)), m(from[2] * (1 - f * f) + 16 * f * f));
      c.rotation.set(f * 6 + k, f * 4, k);
    });
  });
  return (
    <group>
      {Array.from({ length: 6 }, (_, k) => (
        <mesh key={k} ref={(e) => void (cubes.current[k] = e)} visible={false}>
          <boxGeometry args={[m(3.2), m(3.2), m(3.2)]} />
          <meshPhysicalMaterial color="#f2fbff" transparent opacity={0.8} roughness={0.05} clearcoat={1} />
        </mesh>
      ))}
    </group>
  );
}

/** A station's lamp: off, amber while busy, green when done (a glowing LED in a chrome bezel). */
function Lamp({ world, at, busy, done }: { world: RefObject<WorldState | null>; at: [number, number, number]; busy: string; done: string }) {
  const mat = useRef<MeshStandardMaterial>(null);
  useFrame(() => {
    const s = world.current?.cell?.line.in;
    if (!mat.current) return;
    const c = s?.[done] ? '#22c55e' : s?.[busy] ? '#f59e0b' : '#3a3f47';
    mat.current.color.set(c);
    mat.current.emissive.set(c);
    mat.current.emissiveIntensity = s?.[done] || s?.[busy] ? 1.6 : 0;
  });
  return (
    <group position={[m(at[0]), m(at[1]), m(at[2])]}>
      <mesh rotation={[0, 0, Math.PI / 2]}>
        <torusGeometry args={[m(3.4), m(0.7), 8, 20]} />
        <Chrome />
      </mesh>
      <mesh>
        <sphereGeometry args={[m(2.8), 16, 12]} />
        <meshStandardMaterial ref={mat} color="#3a3f47" />
      </mesh>
    </group>
  );
}

/** A screen facing the robot (-x): a canvas texture, glowing. */
function Screen({ at, w, h, tex, glow = 0.55 }: { at: [number, number, number]; w: number; h: number; tex: ReturnType<typeof useSheet>; glow?: number }) {
  return (
    <mesh position={[m(at[0]), m(at[1]), m(at[2])]} rotation={[Math.PI / 2, -Math.PI / 2, 0]}>
      <planeGeometry args={[m(w), m(h)]} />
      <meshStandardMaterial map={tex} emissive="#ffffff" emissiveMap={tex} emissiveIntensity={glow} roughness={0.2} />
    </mesh>
  );
}

/** The cup dispenser: a stainless cabinet, two clear tubes with chrome rings — iced cups (clear) and hot cups (kraft) — over the shelf the next cup drops onto. */
function CupDispenser() {
  const { x, y } = CAFE_AT.cup;
  const label = useSheet('cafe-cup-label', 40, 12, (ctx, w, h) => {
    ctx.fillStyle = '#1d2127';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#e8eef3';
    ctx.font = `700 ${h * 0.42}px Pretendard, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('ICE  ·  HOT', w / 2, h / 2);
  });
  const tube = (cx: number, r: number, color: string, clear: boolean) => (
    <group>
      <Turned at={[cx, y + 22, 60]} profile={[[r - 0.6, 0], [r, 0], [r, 88], [r - 0.6, 88]]}>
        <meshPhysicalMaterial color="#e8eef3" transparent opacity={0.22} roughness={0.03} clearcoat={1} depthWrite={false} />
      </Turned>
      {[60, 104, 147].map((z) => (
        <Turned key={z} at={[cx, y + 22, z]} profile={[[r - 0.4, 0], [r + 1.2, 0], [r + 1.2, 2.4], [r - 0.4, 2.4]]}>
          <Chrome />
        </Turned>
      ))}
      {Array.from({ length: 10 }, (_, k) => (
        <Turned key={k} at={[cx, y + 22, 63 + k * 8]} profile={[[r - 4.5, 0], [r - 1.6, 12], [r - 2.2, 12], [r - 5, 0.6]]}>
          {clear ? <meshPhysicalMaterial color="#eef6fb" transparent opacity={0.5} roughness={0.06} clearcoat={1} /> : <meshStandardMaterial color={color} roughness={0.7} />}
        </Turned>
      ))}
    </group>
  );
  return (
    <group>
      <RBox at={[95, 222, 30]} size={[52, 46, 60]} radius={4}>
        <Inox rep={[1, 2]} />
      </RBox>
      <mesh position={[m(95), m(198.8), m(46)]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[m(30), m(9)]} />
        <meshStandardMaterial map={label} roughness={0.4} />
      </mesh>
      {tube(x, 11, '#f3efe6', true)}
      {tube(x + 24, 10, '#c9a77c', false)}
      {/* The shelf with its guide where the cup comes down. */}
      <RBox at={[x, y + 8, 1.5]} size={[32, 28, 3]} radius={1.5}>
        <Inox />
      </RBox>
      <RBox at={[x, y + 21, 26]} size={[30, 5, 40]} radius={2}>
        <Smoked opacity={0.35} />
      </RBox>
    </group>
  );
}

function IceMaker({ world, spill }: { world: RefObject<WorldState | null>; spill: RefObject<Mesh | null> }) {
  const { x, y } = CAFE_AT.ice;
  const louver = useGrille('ice-louver', 7);
  const iceView = useSheet('cafe-ice-view', 30, 20, (ctx, w, h) => {
    ctx.fillStyle = '#9fc9e6';
    ctx.fillRect(0, 0, w, h);
    let s = 3;
    const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
    for (let k = 0; k < 70; k += 1) {
      const v = 200 + r() * 55;
      ctx.fillStyle = `rgba(${v}, ${v + 2}, 255, 0.9)`;
      const cx = r() * w;
      const cy = h * 0.35 + r() * h * 0.65;
      const sz = 3 + r() * 4;
      ctx.fillRect(cx, cy, sz, sz);
    }
  });
  return (
    <group>
      <RBox at={[248, 116, 65]} size={[53, 52, 130]} radius={5}>
        <Gloss color="#f1f3f5" />
      </RBox>
      {/* The ice bin window, the lower louvre, the status display. */}
      <Screen at={[221.2, 116, 100]} w={38} h={24} tex={iceView} glow={0.15} />
      <mesh position={[m(221.2), m(116), m(22)]} rotation={[Math.PI / 2, -Math.PI / 2, 0]}>
        <planeGeometry args={[m(40), m(26)]} />
        <meshStandardMaterial map={louver} metalness={0.5} roughness={0.45} />
      </mesh>
      <RBox at={[222, 116, 120]} size={[2, 20, 6]} radius={1}>
        <meshStandardMaterial color="#0b1520" emissive="#38bdf8" emissiveIntensity={0.6} />
      </RBox>
      {/* The chute over the cup and its dispensing paddle. */}
      <RBox at={[215, y, 56]} size={[16, 16, 12]} radius={3}>
        <Inox />
      </RBox>
      <RBox at={[210, y, 47]} size={[8, 10, 5]} radius={1.5}>
        <Inox tone="#cfd4d9" />
      </RBox>
      <RBox at={[218, y, 38]} size={[2, 12, 14]} radius={1}>
        <Gloss color="#20252b" />
      </RBox>
      <Lamp world={world} at={[221, 140, 72]} busy="얼음 나오는 중" done="얼음 끝" />
      <Tray x={x} y={y} spill={spill} />
      <IceFall world={world} from={[210, y, 44]} to={[x, y]} />
    </group>
  );
}

/** The coffee machine: a super-automatic one as in robot cafés — stainless fascia on a black body, two bean hoppers, a touch screen whose bar fills while it extracts, a lit group head with two spouts, a grille drip tray. */
function CoffeeMachine({ world, spill }: { world: RefObject<WorldState | null>; spill: RefObject<Mesh | null> }) {
  const { x, y } = CAFE_AT.coffee;
  const bar = useRef<Mesh>(null);
  const ui = useSheet('cafe-machine-ui', 40, 26, (ctx, w, h) => {
    ctx.fillStyle = '#0d1116';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#e8eef3';
    ctx.font = `700 ${h * 0.13}px Pretendard, sans-serif`;
    ctx.fillText('ESPRESSO  ×2', w * 0.08, h * 0.2);
    const tiles = ['Espresso', 'Americano', 'Latte', 'Hot water'];
    tiles.forEach((s, k) => {
      const tx = w * (0.08 + (k % 2) * 0.44);
      const ty = h * (0.3 + Math.floor(k / 2) * 0.26);
      ctx.fillStyle = k === 0 ? '#3b2416' : '#1f2630';
      ctx.fillRect(tx, ty, w * 0.4, h * 0.21);
      ctx.fillStyle = '#e8eef3';
      ctx.font = `600 ${h * 0.09}px Pretendard, sans-serif`;
      ctx.fillText(s, tx + w * 0.03, ty + h * 0.13);
    });
  });
  useFrame(() => {
    const c = world.current?.cell?.cafe?.stations['추출 시작'];
    if (!bar.current) return;
    const f = c?.t != null ? Math.min(1, c.t / 28) : world.current?.cell?.line.in['추출 끝'] ? 1 : 0;
    bar.current.scale.y = Math.max(0.001, f);
    bar.current.position.y = m(16 - 17 + 17 * f);
  });
  const g = useGrille('machine-vent', 6);
  return (
    <group>
      <RBox at={[279, 16, 62]} size={[66, 77, 124]} radius={5}>
        <Gloss color="#1a1d22" />
      </RBox>
      {/* The stainless fascia, proud of the body. */}
      <RBox at={[245.5, 16, 85]} size={[3, 74, 76]} radius={2}>
        <Inox rep={[1, 2]} />
      </RBox>
      <Screen at={[243.7, 16, 104]} w={34} h={22} tex={ui} />
      {/* The extraction bar under the screen: fills over the 28 s shot. */}
      <mesh position={[m(243.5), m(-1), m(89)]}>
        <boxGeometry args={[m(0.6), m(34), m(2.4)]} />
        <meshStandardMaterial color="#20262e" />
      </mesh>
      <mesh ref={bar} position={[m(243.2), m(-1), m(89)]}>
        <boxGeometry args={[m(0.6), m(34), m(2.4)]} />
        <meshStandardMaterial color="#f59e0b" emissive="#f59e0b" emissiveIntensity={1.2} />
      </mesh>
      {/* Top: a black lid and two smoked bean hoppers with beans in them. */}
      <RBox at={[279, 16, 126]} size={[60, 70, 5]} radius={2}>
        <Gloss color="#111316" />
      </RBox>
      {[2, 30].map((dy) => (
        <group key={dy}>
          <Turned at={[285, dy, 128]} profile={[[9.5, 0], [12.5, 28], [0, 28], [0, 0]]}>
            <Smoked opacity={0.5} />
          </Turned>
          <Turned at={[285, dy, 128.5]} profile={[[8.8, 0], [10.6, 15], [0, 15], [0, 0]]}>
            <meshStandardMaterial color="#3a2414" roughness={0.9} />
          </Turned>
          <Turned at={[285, dy, 156]} profile={[[0, 0], [13, 0], [13, 2.5], [0, 2.5]]}>
            <Gloss color="#111316" />
          </Turned>
        </group>
      ))}
      {/* Side vents. */}
      <mesh position={[m(285), m(-22.4), m(60)]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[m(36), m(30)]} />
        <meshStandardMaterial map={g} metalness={0.4} roughness={0.5} />
      </mesh>
      {/* The group head: a stainless block with a warm light under it, two chrome spouts over the cup. */}
      <RBox at={[234, y, 55]} size={[26, 32, 11]} radius={3}>
        <Inox />
      </RBox>
      <mesh position={[m(232), m(y), m(49.3)]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[m(20), m(26)]} />
        <meshStandardMaterial color="#fff1d6" emissive="#ffd9a0" emissiveIntensity={1.1} side={2} />
      </mesh>
      {[-3.5, 3.5].map((d) => (
        <Turned key={d} at={[226, y + d, 44]} profile={[[0, 0], [1.6, 0], [2.4, 5], [0, 5]]}>
          <Chrome />
        </Turned>
      ))}
      <Lamp world={world} at={[244, -14, 66]} busy="추출 중" done="추출 끝" />
      <Tray x={x} y={y} spill={spill} />
      <Stream world={world} busy="추출 중" from={[226, y - 3, 44]} to={[x, y - 1.5]} color="#3a2010" thick={0.75} />
      <Stream world={world} busy="추출 중" from={[226, y + 3, 44]} to={[x, y + 1.5]} color="#3a2010" thick={0.75} />
    </group>
  );
}

function WaterDispenser({ world, spill }: { world: RefObject<WorldState | null>; spill: RefObject<Mesh | null> }) {
  const { x, y } = CAFE_AT.water;
  return (
    <group>
      <RBox at={[244, -85, 57]} size={[44, 54, 115]} radius={5}>
        <Gloss color="#f3f5f7" />
      </RBox>
      <RBox at={[244, -85, 110]} size={[44, 54, 10]} radius={4}>
        <Gloss color="#2f6fed" />
      </RBox>
      {/* The tap: a stainless arm and nozzle over the cup, two buttons and a little display on the front. */}
      <RBox at={[214, y, 52]} size={[20, 9, 6]} radius={2.5}>
        <Inox />
      </RBox>
      <Turned at={[206, y, 44]} profile={[[0, 0], [2, 0], [2.6, 6], [0, 6]]}>
        <Chrome />
      </Turned>
      {[['#38bdf8', -96], ['#ef4444', -74]].map(([c, by]) => (
        <RBox key={by as number} at={[221.6, by as number, 80]} size={[2, 8, 8]} radius={2}>
          <meshStandardMaterial color={c as string} emissive={c as string} emissiveIntensity={0.35} />
        </RBox>
      ))}
      <RBox at={[221.8, -85, 95]} size={[1.6, 22, 8]} radius={1}>
        <meshStandardMaterial color="#0b1520" emissive="#60a5fa" emissiveIntensity={0.5} />
      </RBox>
      <Lamp world={world} at={[221, -62, 66]} busy="물 나오는 중" done="물 끝" />
      <Tray x={x} y={y} spill={spill} />
      <Stream world={world} busy="물 나오는 중" from={[206, y, 44]} to={[x, y]} color="#d6efff" thick={1.3} />
    </group>
  );
}

/** The pickup: the shelf lit from above, a glass door in an aluminium frame on the customer's side that slides up, and the customer's hand while 손 감지. */
function Pickup({ world }: { world: RefObject<WorldState | null> }) {
  const D = CAFE_AT.door;
  const door = useRef<Group>(null);
  const hand = useRef<Group>(null);
  useFrame(() => {
    if (door.current) door.current.position.z = m(travel(world, '픽업 문') * D.h);
    if (hand.current) hand.current.visible = !!world.current?.cell?.line.in['손 감지'];
  });
  const cx = (D.x0 + D.x1) / 2;
  const dy = (D.y0 + D.y1) / 2;
  return (
    <group>
      <RBox at={[cx, -178, CAFE_AT.shelfTop / 2]} size={[D.x1 - D.x0, 56, CAFE_AT.shelfTop]} radius={1.5}>
        <Inox rep={[2, 1]} />
      </RBox>
      {/* A divider between the two pickup places and a light strip over them. */}
      <RBox at={[cx, -178, 22]} size={[2, 52, 40]} radius={0.8}>
        <meshPhysicalMaterial color="#dfeef6" transparent opacity={0.3} roughness={0.05} />
      </RBox>
      <mesh position={[m(cx), m(dy + 6), m(D.h * 2 - 4)]}>
        <boxGeometry args={[m(D.x1 - D.x0 - 8), m(3), m(1.5)]} />
        <meshStandardMaterial color="#fff6e6" emissive="#ffe2b0" emissiveIntensity={1.6} />
      </mesh>
      {/* The window frame. */}
      {[D.x0 - 4, D.x1 + 4].map((px) => (
        <RBox key={px} at={[px, dy, D.h]} size={[6, 10, D.h * 2]} radius={1}>
          <Inox tone="#9aa1a9" />
        </RBox>
      ))}
      <RBox at={[cx, dy, D.h * 2 + 2]} size={[D.x1 - D.x0 + 14, 10, 4]} radius={1}>
        <Inox tone="#9aa1a9" />
      </RBox>
      <group ref={door}>
        <RBox at={[cx, dy, D.h / 2]} size={[D.x1 - D.x0, D.y1 - D.y0, D.h]} radius={1}>
          <meshPhysicalMaterial color="#cfe7f5" transparent opacity={0.3} roughness={0.03} metalness={0.1} clearcoat={1} depthWrite={false} />
        </RBox>
        <RBox at={[cx, dy, 2]} size={[D.x1 - D.x0, D.y1 - D.y0 + 1, 4]} radius={1}>
          <Inox tone="#9aa1a9" />
        </RBox>
        <RBox at={[cx, D.y0 - 2, 12]} size={[30, 3, 3]} radius={1.4}>
          <Chrome />
        </RBox>
      </group>
      {/* The customer's hand reaching in over the shelf. */}
      <group ref={hand} visible={false}>
        <RBox at={[CAFE_AT.pickup[0].x, -236, 18]} size={[20, 64, 12]} radius={6}>
          <meshStandardMaterial color="#e5b894" roughness={0.7} />
        </RBox>
        {[-6, -2, 2, 6].map((d) => (
          <RBox key={d} at={[CAFE_AT.pickup[0].x + d, -200, 19]} size={[3.6, 12, 4]} radius={1.8}>
            <meshStandardMaterial color="#e5b894" roughness={0.7} />
          </RBox>
        ))}
        <RBox at={[CAFE_AT.pickup[0].x, -262, 18]} size={[24, 20, 14]} radius={5}>
          <meshStandardMaterial color="#3b5b8f" roughness={0.8} />
        </RBox>
      </group>
    </group>
  );
}

/* --- the shop round the booth (보고 #43 §2-3) ----------------------------------------------- */

/** Booth walls: glass on the front and sides, a back panel; header with the sign and a warm light strip. Simulator mm (shop ÷ 5). */
const BOOTH = { x0: -110, x1: 330, y0: -250, y1: 262, top: 390 } as const;

function Glass({ at, size }: { at: [number, number, number]; size: [number, number, number] }) {
  return (
    <RBox at={at} size={size} radius={0.5} shadow={false}>
      <meshPhysicalMaterial color="#dfeef6" transparent opacity={0.16} roughness={0.03} metalness={0.05} depthWrite={false} />
    </RBox>
  );
}

function Booth() {
  const B = BOOTH;
  const D = CAFE_AT.door;
  const h = B.top - F;
  const zc = (F + B.top) / 2;
  const sign = useSheet('cafe-sign', 220, 18, (ctx, w, hh) => {
    ctx.fillStyle = '#18201d';
    ctx.fillRect(0, 0, w, hh);
    ctx.fillStyle = '#f4ede1';
    ctx.font = `800 ${hh * 0.52}px Pretendard, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('ROBOT CAFE  ·  로봇 바리스타', w / 2, hh / 2);
  });
  const nums = useSheet('cafe-pickup-nums', 100, 12, (ctx, w, hh) => {
    ctx.fillStyle = '#0d1014';
    ctx.fillRect(0, 0, w, hh);
    ctx.fillStyle = '#7CFC9A';
    ctx.font = `700 ${hh * 0.6}px Pretendard, sans-serif`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillText('픽업 1', w * 0.3, hh / 2);
    ctx.fillText('픽업 2', w * 0.72, hh / 2);
  });
  const backWood = wood([3, 2]);
  const post = (x: number, y: number) => (
    <RBox key={`${x},${y}`} at={[x, y, zc]} size={[6, 6, h]} radius={1}>
      <Steel color="#2a2f36" />
    </RBox>
  );
  return (
    <group>
      {[post(B.x0, B.y0), post(B.x1, B.y0), post(B.x0, B.y1), post(B.x1, B.y1)]}
      {/* Front glass, left and right of the pickup window; above it. */}
      <Glass at={[(B.x0 + D.x0 - 8) / 2, B.y0, zc]} size={[D.x0 - 8 - B.x0, 3, h]} />
      <Glass at={[(D.x1 + 8 + B.x1) / 2, B.y0, zc]} size={[B.x1 - D.x1 - 8, 3, h]} />
      <Glass at={[(D.x0 + D.x1) / 2, B.y0, (D.h * 2 + 6 + B.top) / 2]} size={[D.x1 - D.x0 + 16, 3, B.top - D.h * 2 - 6]} />
      <Glass at={[B.x0, (B.y0 + B.y1) / 2, zc]} size={[3, B.y1 - B.y0, h]} />
      <Glass at={[B.x1, (B.y0 + B.y1) / 2, zc]} size={[3, B.y1 - B.y0, h]} />
      {/* Back panel (the service door side), wood-faced, with a shelf of retail bean bags. */}
      <RBox at={[(B.x0 + B.x1) / 2, B.y1, zc]} size={[B.x1 - B.x0, 5, h]} radius={1}>
        <meshStandardMaterial color="#d8c2a2" map={backWood} roughness={0.65} />
      </RBox>
      {[230, 300].map((z) => (
        <group key={z}>
          <RBox at={[(B.x0 + B.x1) / 2 + 40, B.y1 - 10, z]} size={[260, 16, 3]} radius={1}>
            <Paint color="#2a2f36" rough={0.5} />
          </RBox>
          {Array.from({ length: 9 }, (_, k) => (
            <RBox key={k} at={[(B.x0 + B.x1) / 2 - 75 + k * 28, B.y1 - 11, z + 13]} size={[16, 9, 23]} radius={2}>
              <meshStandardMaterial color={['#1f2329', '#8a5a2b', '#e9e4da'][k % 3]} roughness={0.75} />
            </RBox>
          ))}
        </group>
      ))}
      {/* Header: the sign over the front, a light strip under the roof edge. */}
      <RBox at={[(B.x0 + B.x1) / 2, B.y0 - 2, B.top + 12]} size={[B.x1 - B.x0 + 8, 8, 26]} radius={2}>
        <meshStandardMaterial map={sign} roughness={0.5} />
      </RBox>
      {/* Roof frame only (open, so the arm is seen from above). */}
      {[B.y0, B.y1].map((y) => (
        <RBox key={`ry${y}`} at={[(B.x0 + B.x1) / 2, y, B.top]} size={[B.x1 - B.x0 + 6, 6, 6]} radius={1}>
          <Steel color="#2a2f36" />
        </RBox>
      ))}
      {[B.x0, B.x1].map((x) => (
        <RBox key={`rx${x}`} at={[x, (B.y0 + B.y1) / 2, B.top]} size={[6, B.y1 - B.y0 + 6, 6]} radius={1}>
          <Steel color="#2a2f36" />
        </RBox>
      ))}
      <mesh position={[m((B.x0 + B.x1) / 2), m(B.y0 + 12), m(B.top - 3)]}>
        <boxGeometry args={[m(B.x1 - B.x0 - 20), m(4), m(2)]} />
        <meshStandardMaterial color="#ffe7c2" emissive="#ffd9a0" emissiveIntensity={1.4} />
      </mesh>
      {/* Two warm pendant lamps over the bench and their light (no shadow: the key light casts them). */}
      {[60, 220].map((x) => (
        <group key={x}>
          <mesh position={[m(x), m(10), m(B.top - 40)]}>
            <cylinderGeometry args={[m(0.6), m(0.6), m(80), 6]} />
            <meshStandardMaterial color="#1f2329" />
          </mesh>
          <Turned at={[x, 10, B.top - 98]} profile={[[2, 11], [8, 0], [7.4, 0], [1.4, 10.4], [0, 11], [0, 12], [2, 12]]}>
            <meshStandardMaterial color="#1f2329" metalness={0.6} roughness={0.35} side={2} />
          </Turned>
          <mesh position={[m(x), m(10), m(B.top - 97)]}>
            <sphereGeometry args={[m(3), 16, 12]} />
            <meshStandardMaterial color="#fff3dc" emissive="#ffd59a" emissiveIntensity={2.2} />
          </mesh>
          <pointLight position={[m(x), m(10), m(B.top - 110)]} color="#ffd6a0" intensity={0.35} distance={m(520)} decay={1.6} />
        </group>
      ))}
      {/* Pickup numbers over the window. */}
      <mesh position={[m((D.x0 + D.x1) / 2), m(B.y0 - 2.2), m(D.h * 2 + 16)]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[m(D.x1 - D.x0), m(12)]} />
        <meshStandardMaterial map={nums} emissive="#ffffff" emissiveMap={nums} emissiveIntensity={0.6} />
      </mesh>
    </group>
  );
}

/** The order kiosk on the booth's right: a pedestal with a touch screen showing the menu and the queue. */
function Kiosk({ world }: { world: RefObject<WorldState | null> }) {
  const screen = useSheet('cafe-kiosk', 60, 90, (ctx, w, h) => {
    ctx.fillStyle = '#f6f3ee';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#18201d';
    ctx.fillRect(0, 0, w, h * 0.13);
    ctx.fillStyle = '#fff';
    ctx.font = `800 ${h * 0.06}px Pretendard, sans-serif`;
    ctx.fillText('주문하기', w * 0.08, h * 0.085);
    const items = ['아이스 아메리카노', '아메리카노', '카페라떼', '아이스티'];
    items.forEach((s, k) => {
      const y = h * (0.18 + k * 0.17);
      ctx.fillStyle = k === 0 ? '#0f6b4c' : '#e4ddd2';
      ctx.fillRect(w * 0.06, y, w * 0.88, h * 0.14);
      ctx.fillStyle = k === 0 ? '#fff' : '#18201d';
      ctx.font = `700 ${h * 0.045}px Pretendard, sans-serif`;
      ctx.fillText(s, w * 0.1, y + h * 0.085);
    });
    ctx.fillStyle = '#c2410c';
    ctx.fillRect(w * 0.06, h * 0.86, w * 0.88, h * 0.1);
    ctx.fillStyle = '#fff';
    ctx.fillText('결제하기', w * 0.36, h * 0.925);
  });
  void world;
  const x = 372;
  const y = -232;
  return (
    <group>
      <RBox at={[x, y, (F + 70) / 2]} size={[34, 22, 70 - F]} radius={4}>
        <Skin color="#f2f2ef" />
      </RBox>
      <RBox at={[x, y - 4, 105]} size={[40, 6, 60]} radius={3}>
        <Steel color="#1f2329" />
      </RBox>
      <mesh position={[m(x), m(y - 7.2), m(105)]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[m(34), m(52)]} />
        <meshStandardMaterial map={screen} emissive="#ffffff" emissiveMap={screen} emissiveIntensity={0.45} />
      </mesh>
    </group>
  );
}

/** The self bar beside the kiosk: lids, straws and napkins on a small counter. */
function SelfBar() {
  const x = 372;
  const y = -150;
  return (
    <group>
      <RBox at={[x, y, (F + 40) / 2]} size={[40, 70, 40 - F]} radius={3}>
        <Paint color="#b98a5a" rough={0.6} />
      </RBox>
      {[-22, 0, 22].map((dy, k) => (
        <Turned key={k} at={[x, y + dy, 40]} profile={[[0, 0], [7, 0], [7, 16], [0, 16]]}>
          <meshStandardMaterial color={['#f3efe6', '#e5484d', '#ffffff'][k]} roughness={0.5} />
        </Turned>
      ))}
    </group>
  );
}

/** The shop floor round the booth: large warm-grey tiles. */
function ShopFloor() {
  const tex = useSheet('cafe-floor', 300, 300, (ctx, w, h) => {
    let s = 11;
    const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
    const n = 7;
    const t = w / n;
    ctx.fillStyle = '#9d958a';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < n; i += 1)
      for (let j = 0; j < n; j += 1) {
        const v = 196 + r() * 16;
        ctx.fillStyle = `rgb(${v}, ${v - 6}, ${v - 15})`;
        ctx.fillRect(i * t + 1.2, j * t + 1.2, t - 2.4, t - 2.4);
        // Speckles of a terrazzo-like porcelain tile.
        for (let k = 0; k < 26; k += 1) {
          const q = 140 + r() * 80;
          ctx.fillStyle = `rgba(${q}, ${q - 8}, ${q - 18}, 0.35)`;
          ctx.fillRect(i * t + 2 + r() * (t - 4), j * t + 2 + r() * (t - 4), 0.8 + r(), 0.8 + r());
        }
      }
  });
  return (
    <mesh position={[m(100), m(-80), m(F + 0.5)]} receiveShadow>
      <planeGeometry args={[m(1400), m(1100)]} />
      <meshPhysicalMaterial map={tex} roughness={0.55} clearcoat={0.25} clearcoatRoughness={0.5} />
    </mesh>
  );
}

/** Tables, stools, a plant and the menu board out in the shop; a customer at the pickup window, one at the kiosk. */
function Shop() {
  const fz = F;
  return (
    <Suspense fallback={null}>
      <Model group="cafe" name="table" at={[-260, -420]} z={fz} h={150} />
      <Model group="cafe" name="stool" at={[-200, -380]} z={fz} h={130} />
      <Model group="cafe" name="stool" at={[-320, -460]} z={fz} h={130} />
      <Model group="cafe" name="table" at={[520, -420]} z={fz} h={150} />
      <Model group="cafe" name="chair" at={[580, -380]} z={fz} h={180} yaw={-Math.PI / 2} />
      <Model group="cafe" name="plant" at={[-190, 280]} z={fz} h={260} />
      <Model group="cafe" name="chalkboard" at={[-200, -300]} z={fz} h={230} yaw={0.5} />
      <Model group="people" name="customer" at={[98, -330]} z={fz} h={340} yaw={Math.PI} pose="Idle" />
      <Model group="people" name="customer" at={[402, -300]} z={fz} h={330} yaw={Math.PI * 0.95} pose="Idle" />
    </Suspense>
  );
}

const FILLS = 6;
/** Where the ice cubes sit in a cup (mm from the cup's centre and floor, and a twist). */
const ICE_CUBES: [number, number, number, number][] = [
  [-2.6, -1.8, 0, 0.2],
  [2.4, -2.2, 0.4, 0.9],
  [0.2, 2.8, 0.2, 0.5],
  [-1.6, 1.2, 4.6, 1.3],
  [2.2, 1.6, 4.9, 0.1],
  [0.4, -2.4, 5.2, 0.7],
  [-0.4, 0.4, 9.6, 1.1],
  [2.6, -0.6, 10, 0.4],
  [-2.4, -0.4, 10.3, 0.8],
];

/** What is in each cup: ice cubes (white, under the liquid line), coffee darkening as shots go in, water lightening it. */
function Drinks({ world }: { world: RefObject<WorldState | null> }) {
  const liquid = useRef<(Mesh | null)[]>([]);
  const ice = useRef<(Mesh | null)[][]>(Array.from({ length: FILLS }, () => []));
  useFrame(() => {
    const cups = (world.current?.objects ?? []).filter((o) => o.drink);
    for (let k = 0; k < FILLS; k += 1) {
      const o = cups[k];
      const l = liquid.current[k];
      const cubes = ice.current[k];
      if (!l) continue;
      const d = o?.drink;
      const total = d ? drinkMl(d) : 0;
      if (!o || !d || total <= 0) {
        l.visible = false;
        cubes.forEach((c) => c && (c.visible = false));
        continue;
      }
      const h = CUP_SIZE[2] - 2;
      const frac = Math.min(1, total / CUP_ML);
      const fluid = d.shot + d.water;
      const fh = Math.max(0.6, h * frac);
      l.visible = fluid > 0;
      l.position.set(m(o.x), m(o.y), m(o.z + 1 + fh / 2));
      l.scale.set(1, fh / 10, 1);
      const mat = l.material as MeshPhysicalMaterial;
      const dark = fluid > 0 ? d.shot / fluid : 0;
      mat.color.setRGB(0.29 + (1 - dark) * 0.35, 0.17 + (1 - dark) * 0.26, 0.08 + (1 - dark) * 0.2);
      // The ice as cubes stacked in the cup, as many as the ice poured so far (a full scoop = all of them).
      const shown = Math.round(Math.min(1, d.ice / RECIPE.ice) * ICE_CUBES.length);
      cubes.forEach((c, j) => {
        if (!c) return;
        c.visible = j < shown;
        const [dx, dy, dz, rz] = ICE_CUBES[j];
        c.position.set(m(o.x + dx), m(o.y + dy), m(o.z + 2.4 + dz));
        c.rotation.set(rz * 0.6, rz * 0.4, rz);
      });
    }
  });
  return (
    <group>
      {Array.from({ length: FILLS }, (_, k) => (
        <group key={k}>
          <mesh ref={(e) => void (liquid.current[k] = e)} visible={false}>
            <cylinderGeometry args={[m(8.1), m(6.6), m(10), 28]} />
            <meshPhysicalMaterial color="#4a2a15" roughness={0.08} clearcoat={1} transparent opacity={0.86} />
          </mesh>
          {ICE_CUBES.map((_, j) => (
            <mesh key={j} ref={(e) => void (ice.current[k][j] = e)} visible={false}>
              <boxGeometry args={[m(4.6), m(4.6), m(4.6)]} />
              <meshPhysicalMaterial color="#f4fbff" transparent opacity={0.7} roughness={0.04} clearcoat={1} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

/** Spills on the drip trays: shown from the moment a station poured with no cup (the café's record). */
function Spills({ world, refs }: { world: RefObject<WorldState | null>; refs: Record<string, RefObject<Mesh | null>> }) {
  useFrame(() => {
    const pours = world.current?.cell?.cafe?.trayPours ?? [];
    for (const [name, r] of Object.entries(refs)) if (r.current) r.current.visible = pours.includes(name);
  });
  return null;
}

export function CafeCell({ world, onHover }: { world: RefObject<WorldState | null>; onHover: (n: string | null) => void }) {
  void cellLayout('cafe');
  const iceSpill = useRef<Mesh>(null);
  const coffeeSpill = useRef<Mesh>(null);
  const waterSpill = useRef<Mesh>(null);
  return (
    <>
      <ShopFloor />
      <Shop />
      <Booth />
      <Tagged name="키오스크" onHover={onHover}>
        <Kiosk world={world} />
      </Tagged>
      <Tagged name="셀프바" onHover={onHover}>
        <SelfBar />
      </Tagged>
      <Counter />
      <Tagged name="컵 디스펜서" onHover={onHover}>
        <CupDispenser />
      </Tagged>
      <Tagged name="제빙기" onHover={onHover}>
        <IceMaker world={world} spill={iceSpill} />
      </Tagged>
      <Tagged name="커피 머신" onHover={onHover}>
        <CoffeeMachine world={world} spill={coffeeSpill} />
      </Tagged>
      <Tagged name="정수기" onHover={onHover}>
        <WaterDispenser world={world} spill={waterSpill} />
      </Tagged>
      <Tagged name="픽업대" onHover={onHover}>
        <Pickup world={world} />
      </Tagged>
      <Drinks world={world} />
      <Spills world={world} refs={{ 제빙기: iceSpill, '커피 머신': coffeeSpill, 정수기: waterSpill }} />
    </>
  );
}
