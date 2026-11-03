'use client';

/**
 * 실습 셀 F 로봇 카페 (입문 트랙 ① 생활 로봇): a café counter round the arm (engine/simulator/cell/
 * cells.ts cafeLayout · cafe.ts), in the simulator's own style: a wooden counter top on a dark body,
 * and round the arm the cup dispenser (a stainless tube of stacked cups), the ice maker, the coffee
 * machine (its lamp: amber while it extracts, green when done), the water dispenser and the pickup
 * shelf behind a glass door that slides up for the customer (whose hand reaches in while 손 감지).
 *
 * What changes is read from the world every frame: the door, the streams while a station pours, what
 * is in each cup (ice, coffee, water: the level and the colour), the spills on the drip trays.
 */

import { useFrame } from '@react-three/fiber';
import { useRef, type RefObject } from 'react';
import type { Group, Mesh, MeshStandardMaterial } from 'three';

import { CUP_ML, CUP_SIZE, drinkMl } from '@/engine/simulator/cell/cafe';
import { CAFE_AT, cellLayout } from '@/engine/simulator/cell/cells';
import type { WorldState } from '@/engine/simulator/sim';

import { RBox, Turned } from '../sceneKit';
import { F, Paint, Skin, Steel, Tagged, m, travel } from './kit';

const WOOD = '#b98a5a';
const BODY = '#2b2f36';
const INOX = '#c3c9cf';

/** The counter: a wooden top (z 0, where the robot and the cups stand) on a dark body down to the floor. */
function Counter() {
  return (
    <group>
      <RBox at={[110, 5, -6]} size={[440, 500, 12]} radius={3}>
        <Paint color={WOOD} rough={0.55} />
      </RBox>
      <RBox at={[110, 5, (F - 12) / 2]} size={[428, 488, -F - 12]} radius={2}>
        <Skin color={BODY} />
      </RBox>
    </group>
  );
}

/** A drip tray: a dark grille the cup stands on, the spill (brown) showing when a station poured with no cup. */
function Tray({ x, y, spill }: { x: number; y: number; spill: RefObject<Mesh | null> }) {
  return (
    <group>
      <RBox at={[x, y, -0.5]} size={[34, 34, 2]} radius={1}>
        <Steel color="#3a3f47" />
      </RBox>
      <mesh ref={spill} position={[m(x), m(y), m(0.8)]} visible={false}>
        <cylinderGeometry args={[m(13), m(13), m(0.4), 24]} />
        <meshStandardMaterial color="#5a3720" roughness={0.2} transparent opacity={0.85} />
      </mesh>
    </group>
  );
}

/** A stream from a spout down into the cup (or the tray): a thin column, its colour the station's. */
function Stream({ world, busy, from, to, color, thick = 1.6 }: { world: RefObject<WorldState | null>; busy: string; from: [number, number, number]; to: [number, number]; color: string; thick?: number }) {
  const r = useRef<Mesh>(null);
  useFrame(() => {
    if (r.current) r.current.visible = !!world.current?.cell?.line.in[busy];
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
        <cylinderGeometry args={[m(thick), m(thick * 0.7), m(Math.hypot(len, Math.hypot(to[0] - x0, to[1] - y0))), 10]} />
        <meshStandardMaterial color={color} roughness={0.15} transparent opacity={0.85} />
      </mesh>
    </group>
  );
}

/** A station's lamp: off, amber while busy, green when done. */
function Lamp({ world, at, busy, done }: { world: RefObject<WorldState | null>; at: [number, number, number]; busy: string; done: string }) {
  const mat = useRef<MeshStandardMaterial>(null);
  useFrame(() => {
    const s = world.current?.cell?.line.in;
    if (!mat.current) return;
    const c = s?.[done] ? '#22c55e' : s?.[busy] ? '#f59e0b' : '#3a3f47';
    mat.current.color.set(c);
    mat.current.emissive.set(c);
    mat.current.emissiveIntensity = s?.[done] || s?.[busy] ? 1.2 : 0;
  });
  return (
    <mesh position={[m(at[0]), m(at[1]), m(at[2])]}>
      <sphereGeometry args={[m(3.2), 16, 12]} />
      <meshStandardMaterial ref={mat} color="#3a3f47" />
    </mesh>
  );
}

/** The cup dispenser: a stainless tube with the cups stacked upside down, letting one down onto the shelf below. */
function CupDispenser() {
  const { x, y } = CAFE_AT.cup;
  return (
    <group>
      <RBox at={[95, 222, 75]} size={[50, 45, 150]} radius={4}>
        <Skin color={INOX} rough={0.3} />
      </RBox>
      <Turned at={[x, y + 22, 60]} profile={[[0, 0], [11, 0], [11, 85], [0, 85]]}>
        <meshPhysicalMaterial color="#e8eef3" transparent opacity={0.35} roughness={0.05} />
      </Turned>
      {Array.from({ length: 9 }, (_, k) => (
        <Turned key={k} at={[x, y + 22, 64 + k * 8]} profile={[[6.5, 0], [9, 12], [8.4, 12], [6, 0.6]]}>
          <meshStandardMaterial color="#f3efe6" roughness={0.6} />
        </Turned>
      ))}
      <RBox at={[x, y + 8, 2]} size={[30, 26, 4]} radius={1.5}>
        <Steel color="#4a5059" />
      </RBox>
    </group>
  );
}

function IceMaker({ world, spill }: { world: RefObject<WorldState | null>; spill: RefObject<Mesh | null> }) {
  const { x, y } = CAFE_AT.ice;
  return (
    <group>
      <RBox at={[248, 116, 65]} size={[53, 52, 130]} radius={4}>
        <Skin color="#eef1f4" />
      </RBox>
      {/* The chute over the cup. */}
      <RBox at={[218, y, 52]} size={[22, 14, 8]} radius={2}>
        <Steel color={INOX} />
      </RBox>
      <RBox at={[223, 116, 98]} size={[2, 34, 22]} radius={1}>
        <meshPhysicalMaterial color="#9fd4ff" transparent opacity={0.5} roughness={0.05} />
      </RBox>
      <Lamp world={world} at={[223, 140, 115]} busy="얼음 나오는 중" done="얼음 끝" />
      <Tray x={x} y={y} spill={spill} />
      <Stream world={world} busy="얼음 나오는 중" from={[210, y, 48]} to={[x, y]} color="#eaf6ff" thick={2.6} />
    </group>
  );
}

function CoffeeMachine({ world, spill }: { world: RefObject<WorldState | null>; spill: RefObject<Mesh | null> }) {
  const { x, y } = CAFE_AT.coffee;
  return (
    <group>
      <RBox at={[278, 16, 62]} size={[67, 77, 124]} radius={5}>
        <Skin color={INOX} rough={0.28} />
      </RBox>
      <RBox at={[279, 16, 126]} size={[60, 70, 6]} radius={2}>
        <Steel color="#1f2329" />
      </RBox>
      {/* The group head and its two spouts over the cup. */}
      <RBox at={[236, y, 52]} size={[24, 26, 12]} radius={3}>
        <Steel color="#2a2f36" />
      </RBox>
      <RBox at={[244, 16, 96]} size={[2, 40, 22]} radius={1}>
        <meshStandardMaterial color="#0e1a24" emissive="#1d4ed8" emissiveIntensity={0.25} />
      </RBox>
      <Lamp world={world} at={[244, -10, 112]} busy="추출 중" done="추출 끝" />
      <Tray x={x} y={y} spill={spill} />
      <Stream world={world} busy="추출 중" from={[226, y - 3, 46]} to={[x, y - 2]} color="#4a2a15" thick={0.9} />
      <Stream world={world} busy="추출 중" from={[226, y + 3, 46]} to={[x, y + 2]} color="#4a2a15" thick={0.9} />
    </group>
  );
}

function WaterDispenser({ world, spill }: { world: RefObject<WorldState | null>; spill: RefObject<Mesh | null> }) {
  const { x, y } = CAFE_AT.water;
  return (
    <group>
      <RBox at={[244, -85, 57]} size={[44, 54, 115]} radius={4}>
        <Skin color="#f2f5f8" />
      </RBox>
      <RBox at={[244, -85, 108]} size={[40, 50, 12]} radius={3}>
        <Paint color="#2f6fed" />
      </RBox>
      <RBox at={[214, y, 50]} size={[18, 10, 6]} radius={2}>
        <Steel color={INOX} />
      </RBox>
      <Lamp world={world} at={[221, -62, 90]} busy="물 나오는 중" done="물 끝" />
      <Tray x={x} y={y} spill={spill} />
      <Stream world={world} busy="물 나오는 중" from={[207, y, 46]} to={[x, y]} color="#bfe3ff" thick={1.4} />
    </group>
  );
}

/** The pickup: the shelf, a glass door on the customer's side that slides up, and the customer's hand while 손 감지. */
function Pickup({ world }: { world: RefObject<WorldState | null> }) {
  const D = CAFE_AT.door;
  const door = useRef<Group>(null);
  const hand = useRef<Group>(null);
  useFrame(() => {
    if (door.current) door.current.position.z = m(travel(world, '픽업 문') * D.h);
    if (hand.current) hand.current.visible = !!world.current?.cell?.line.in['손 감지'];
  });
  const cx = (D.x0 + D.x1) / 2;
  return (
    <group>
      <RBox at={[cx, -178, CAFE_AT.shelfTop / 2]} size={[D.x1 - D.x0, 56, CAFE_AT.shelfTop]} radius={1.5}>
        <Steel color="#8a929b" />
      </RBox>
      {/* Frame posts each side of the door. */}
      <RBox at={[D.x0 - 4, (D.y0 + D.y1) / 2, D.h]} size={[6, 10, D.h * 2]} radius={1}>
        <Steel color={BODY} />
      </RBox>
      <RBox at={[D.x1 + 4, (D.y0 + D.y1) / 2, D.h]} size={[6, 10, D.h * 2]} radius={1}>
        <Steel color={BODY} />
      </RBox>
      <group ref={door}>
        <RBox at={[cx, (D.y0 + D.y1) / 2, D.h / 2]} size={[D.x1 - D.x0, D.y1 - D.y0, D.h]} radius={1}>
          <meshPhysicalMaterial color="#cfe7f5" transparent opacity={0.38} roughness={0.04} metalness={0.1} />
        </RBox>
      </group>
      {/* The customer's hand reaching in over the shelf. */}
      <group ref={hand} visible={false}>
        <RBox at={[CAFE_AT.pickup[0].x, -232, 18]} size={[22, 70, 12]} radius={6}>
          <meshStandardMaterial color="#e5b894" roughness={0.7} />
        </RBox>
      </group>
    </group>
  );
}

const FILLS = 6;

/** What is in each cup: ice cubes (white, under the liquid line), coffee darkening as shots go in, water lightening it. */
function Drinks({ world }: { world: RefObject<WorldState | null> }) {
  const liquid = useRef<(Mesh | null)[]>([]);
  const ice = useRef<(Mesh | null)[]>([]);
  useFrame(() => {
    const cups = (world.current?.objects ?? []).filter((o) => o.drink);
    for (let k = 0; k < FILLS; k += 1) {
      const o = cups[k];
      const l = liquid.current[k];
      const i = ice.current[k];
      if (!l || !i) continue;
      const d = o?.drink;
      const total = d ? drinkMl(d) : 0;
      if (!o || !d || total <= 0) {
        l.visible = false;
        i.visible = false;
        continue;
      }
      const h = CUP_SIZE[2] - 2;
      const frac = Math.min(1, total / CUP_ML);
      const fluid = d.shot + d.water;
      const fh = Math.max(0.6, h * frac);
      l.visible = fluid > 0;
      l.position.set(m(o.x), m(o.y), m(o.z + 1 + fh / 2));
      l.scale.set(1, fh / 10, 1);
      const mat = l.material as MeshStandardMaterial;
      const dark = fluid > 0 ? d.shot / fluid : 0;
      mat.color.setRGB(0.29 + (1 - dark) * 0.35, 0.17 + (1 - dark) * 0.26, 0.08 + (1 - dark) * 0.2);
      const ih = Math.max(0.6, Math.min(h, (h * d.ice) / CUP_ML) * 1.4);
      i.visible = d.ice > 0;
      i.position.set(m(o.x), m(o.y), m(o.z + 1 + ih / 2));
      i.scale.set(1, ih / 10, 1);
    }
  });
  return (
    <group>
      {Array.from({ length: FILLS }, (_, k) => (
        <group key={k}>
          <mesh ref={(e) => void (liquid.current[k] = e)} visible={false}>
            <cylinderGeometry args={[m(7.6), m(6.4), m(10), 24]} />
            <meshStandardMaterial color="#4a2a15" roughness={0.12} transparent opacity={0.88} />
          </mesh>
          <mesh ref={(e) => void (ice.current[k] = e)} visible={false}>
            <boxGeometry args={[m(10), m(10), m(10)]} />
            <meshPhysicalMaterial color="#f4fbff" transparent opacity={0.55} roughness={0.05} transmission={0.4} />
          </mesh>
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
