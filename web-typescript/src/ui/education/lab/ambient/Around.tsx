'use client';

/**
 * What stands and moves round each site's cell (inside LearnStage's robot-frame group: metres, z up;
 * positions in mm): the rest of the line or room, out of the robot's reach and mostly behind the cell
 * (the views look from the front right, so behind-left fills the top of the picture). Each site has
 * its look (floor and sky) and its surroundings; the cell itself is the site's own *Cell.
 */

import { createInstances } from '@react-three/drei';
import type { ReactNode } from 'react';

import { RBox, Turned, pill, vessel } from '../../../simulator/stage/sceneKit';
import { CardBox } from '../ConveyorCell';
import { Sign, Steel, Tape, m } from '../CellKit';
import type { SiteLook } from './Ground';
import { Blob } from './Ground';
import Model from './Model';
import { CAFE_COUNTER_MM, CARE_ARM_Z, Beacon, Fan, Leds, Monitor, RouteAgv, RunningBelt, SignalTower, Steam, Sway, Turn, WorkingArm } from './Props';

type Xy = readonly [number, number];

export type AroundSite = 'factory' | 'logistics' | 'bio' | 'farm' | 'cafe' | 'care' | 'ai';

export const LOOKS: Record<AroundSite, SiteLook> = {
  factory: { sky: '#c3ccd6', floor: 'epoxy' },
  logistics: { sky: '#cfd2d4', floor: 'concrete' },
  bio: { sky: '#dfe6ec', floor: 'vinyl' },
  farm: { sky: '#dfe9e4', floor: 'greenhouse' },
  cafe: { sky: '#e9e0d4', floor: 'wood', groundZ: -CAFE_COUNTER_MM },
  /** 스마트시티 돌봄 (카페 ③): a resident's room; the arm stands on a myAGV, so the floor is lower. */
  care: { sky: '#e6ebe4', floor: 'vinyl', groundZ: -CARE_ARM_Z },
  ai: { sky: '#d9dde6', floor: 'tiles' },
};

/**
 * The building's two back walls (along y at x = `x`, along x at y = `y`), seen when the view is drawn
 * back: a wall with a coloured band, tall windows full of daylight (or glass panes for a greenhouse),
 * and pillars between them. The walls stand far enough out that the fog softens them.
 */
export function Hall({ x = -2600, y = 2600, h = 1500, wall = '#e6e9ed', band = '#2f5be7', glass = false }: { x?: number; y?: number; h?: number; wall?: string; band?: string; glass?: boolean }) {
  const span = 6000;
  const pitch = 1000;
  const runs = [
    { along: 'y' as const, at: x, from: -2400 },
    { along: 'x' as const, at: y, from: x },
  ];
  return (
    <group>
      {runs.map((r) => {
        const n = Math.floor(span / pitch);
        const pos = (u: number, z: number, out = 0): [number, number, number] => (r.along === 'y' ? [r.at + out, u, z] : [u, r.at - out, z]);
        const size = (lu: number, lz: number, t: number): [number, number, number] => (r.along === 'y' ? [t, lu, lz] : [lu, t, lz]);
        return (
          <group key={r.along}>
            {!glass && (
              <RBox at={pos(r.from + span / 2, h / 2, -40)} size={size(span, h, 80)} radius={4} shadow={false}>
                <meshStandardMaterial color={wall} roughness={0.9} />
              </RBox>
            )}
            <RBox at={pos(r.from + span / 2, 60, 2)} size={size(span, 120, glass ? 60 : 12)} radius={2} shadow={false}>
              <meshStandardMaterial color={glass ? '#f2f4f1' : '#59616b'} roughness={0.7} />
            </RBox>
            {!glass && (
              <RBox at={pos(r.from + span / 2, h - 160, 2)} size={size(span, 50, 10)} radius={2} shadow={false}>
                <meshStandardMaterial color={band} roughness={0.5} />
              </RBox>
            )}
            {Array.from({ length: n }, (_, i) => r.from + pitch / 2 + i * pitch).map((u) => (
              <group key={u}>
                {/* A window (or a glass pane) between two pillars. */}
                <RBox at={pos(u, 120 + (h - 420) / 2 + 60, glass ? 0 : 3)} size={size(pitch - 220, h - 420, 6)} radius={2} shadow={false}>
                  {glass ? <meshPhysicalMaterial color="#e8f3ea" transparent opacity={0.25} roughness={0.05} clearcoat={1} /> : <meshStandardMaterial color="#dceefe" emissive="#cfe6ff" emissiveIntensity={0.55} roughness={0.2} />}
                </RBox>
                {!glass && (
                  <RBox at={pos(u, 120 + (h - 420) / 2 + 60, 7)} size={size(12, h - 420, 6)} radius={1} shadow={false}>
                    <meshStandardMaterial color="#c9cfd6" roughness={0.5} />
                  </RBox>
                )}
                <RBox at={pos(u + pitch / 2, h / 2, 30)} size={size(90, h, 90)} radius={4} shadow={false}>
                  <meshStandardMaterial color={glass ? '#f5f7f4' : '#d3d8de'} roughness={0.6} metalness={glass ? 0.3 : 0} />
                </RBox>
              </group>
            ))}
          </group>
        );
      })}
    </group>
  );
}

/** A stack of cartons on the floor (a 2 × 2 × n block of 60 mm boxes). */
function Cartons({ at, n = 2, color = '#c8925a' }: { at: readonly [number, number]; n?: number; color?: string }) {
  const out: ReactNode[] = [];
  for (let k = 0; k < n; k += 1)
    for (const dx of [-31, 31])
      for (const dy of [-31, 31])
        out.push(
          <group key={`${k}${dx}${dy}`} position={[(at[0] + dx) / 1000, (at[1] + dy) / 1000, (30 + k * 61) / 1000]}>
            <CardBox size={[60, 60, 60]} color={color} />
          </group>,
        );
  return (
    <group>
      {out}
      <Blob at={at} w={130} d={130} k={0.25} />
    </group>
  );
}

/** The rest of the factory floor: the next station's arm, the main line's belt, an AGV on its lane, the line board. */
export function FactoryAround() {
  return (
    <group>
      <Hall band="#2f5be7" />
      {/* The neighbouring station: an arm moving parts between two fixtures. */}
      <WorkingArm at={[-720, 300]} yaw={-0.25} job={{ pick: [150, -95, 25], place: [150, 95, 25], period: 9, block: '#d9622b' }} phase={2.5} />
      <SignalTower at={[-560, 470]} h={200} />
      {/* The main line behind: a long belt with cartons going by. */}
      <RunningBelt at={[-200, 860]} yaw={Math.PI / 2} belt={{ x: 0, width: 110, top: 70, yIn: 650, yOut: -700 }} speed={55} />
      <SignalTower at={[-950, 940]} h={240} phase={4} />
      {/* The AGV lane: tape both sides, an AGV with a crate driving round, a beacon at the crossing. */}
      <Tape a={[-1500, 1180]} b={[900, 1180]} w={14} color="#f2c230" />
      <Tape a={[-1500, 1520]} b={[900, 1520]} w={14} color="#f2c230" />
      <RouteAgv
        route={[
          [-1350, 1270],
          [750, 1270],
          [750, 1430],
          [-1350, 1430],
        ]}
        speed={150}
        cargo={
          <RBox at={[0, 0, 30]} size={[200, 150, 60]} radius={4}>
            <meshStandardMaterial color="#2f5be7" roughness={0.5} />
          </RBox>
        }
      />
      <Beacon at={[900, 1160]} />
      {/* Finished goods waiting by the lane, and the line's dashboard. */}
      <Cartons at={[-1250, 700]} n={3} />
      <Cartons at={[-1250, 520]} n={2} color="#b9824d" />
      <Monitor at={[-420, 640]} yaw={-0.75} w={180} kind="line" accent="#2f5be7" title="2라인 · 생산 현황" />
      <Sign at={[-860, 1100, 120]} yaw={0} w={160} h={36} lines={['2 LINE · 부품 조립', 'AGV 통로 · 보행 주의']} fg="#ffffff" bg="#2f5be7" />
    </group>
  );
}

/* --- 물류 센터 ----------------------------------------------------------------------------- */

/** A mini pallet with a stretch-wrapped stack of cartons (`h` high). */
function PalletLoad({ at, z = 0, h = 90, color = '#c8925a' }: { at: Xy; z?: number; h?: number; color?: string }) {
  return (
    <group position={[m(at[0]), m(at[1]), m(z)]}>
      <RBox at={[0, 0, 7]} size={[150, 150, 14]} radius={1.5}>
        <meshStandardMaterial color="#c08a52" roughness={0.75} />
      </RBox>
      <RBox at={[0, 0, 14 + h / 2]} size={[142, 142, h]} radius={3}>
        <meshStandardMaterial color={color} roughness={0.8} />
      </RBox>
      <RBox at={[0, 0, 14 + h / 2]} size={[146, 146, h - 6]} radius={4} shadow={false}>
        <meshPhysicalMaterial color="#eef3f7" transparent opacity={0.28} roughness={0.15} clearcoat={1} />
      </RBox>
    </group>
  );
}

/** Pallet racking along y: blue uprights, orange beams, a load on most bays. */
/** Shapes repeated many times round the cells, each drawn in one call (instancing). */
const [UprightSet, Upright] = createInstances();
const [PalletSet, PalletPiece] = createInstances();
const [LoadSet, Load] = createInstances();
const [WrapSet, Wrap] = createInstances();
const [StemSet, Stem] = createInstances();
const [LeafSet, Leaf] = createInstances();
const [FruitSet, Fruit] = createInstances();

function Racking({ x, y0, y1, levels = [0, 170, 340], filled }: { x: number; y0: number; y1: number; levels?: readonly number[]; filled: (bay: number, level: number) => boolean }) {
  const bay = 190;
  const n = Math.floor((y1 - y0) / bay);
  const top = levels[levels.length - 1] + 150;
  const loads = levels.flatMap((z, l) => Array.from({ length: n }, (_, b) => ({ b, l, z, h: l === 2 ? 70 : 100 })).filter((q) => filled(q.b, q.l)));
  return (
    <group>
      <UprightSet limit={(n + 1) * 2}>
        <boxGeometry args={[m(10), m(10), m(top)]} />
        <meshStandardMaterial color="#2f5be7" metalness={0.35} roughness={0.45} />
        {Array.from({ length: n + 1 }, (_, i) => y0 + i * bay).flatMap((y) => [-1, 1].map((sx) => <Upright key={`${y}${sx}`} position={[m(x + sx * 85), m(y), m(top / 2)]} />))}
      </UprightSet>
      {levels.slice(1).flatMap((z) =>
        [-1, 1].map((sx) => (
          <RBox key={`${z}${sx}`} at={[x + sx * 85, (y0 + y0 + n * bay) / 2, z - 6]} size={[8, n * bay, 12]} radius={1}>
            <meshStandardMaterial color="#f08a24" roughness={0.5} />
          </RBox>
        )),
      )}
      {/* The loads: a pallet, a block of cartons (one box scaled to its height), the stretch wrap round it. */}
      <PalletSet limit={loads.length}>
        <boxGeometry args={[m(150), m(150), m(14)]} />
        <meshStandardMaterial color="#c08a52" roughness={0.75} />
        {loads.map((q) => (
          <PalletPiece key={`${q.b}-${q.l}`} position={[m(x), m(y0 + bay / 2 + q.b * bay), m(q.z + 7)]} />
        ))}
      </PalletSet>
      <LoadSet limit={loads.length}>
        <boxGeometry args={[m(142), m(142), m(1)]} />
        <meshStandardMaterial color="#ffffff" roughness={0.8} />
        {loads.map((q) => (
          <Load key={`${q.b}-${q.l}`} position={[m(x), m(y0 + bay / 2 + q.b * bay), m(q.z + 14 + q.h / 2)]} scale={[1, 1, q.h]} color={(q.b + q.l) % 3 ? '#c8925a' : '#b9824d'} />
        ))}
      </LoadSet>
      <WrapSet limit={loads.length}>
        <boxGeometry args={[m(146), m(146), m(1)]} />
        <meshPhysicalMaterial color="#eef3f7" transparent opacity={0.28} roughness={0.15} clearcoat={1} depthWrite={false} />
        {loads.map((q) => (
          <Wrap key={`${q.b}-${q.l}`} position={[m(x), m(y0 + bay / 2 + q.b * bay), m(q.z + 14 + q.h / 2)]} scale={[1, 1, q.h - 6]} />
        ))}
      </WrapSet>
      <Blob at={[x, (y0 + y0 + n * bay) / 2]} w={200} d={n * bay} k={0.25} />
    </group>
  );
}

/** The warehouse round the palletising cell: racking, an AGV carrying loads down the aisle, the in-feed belt, the next station. */
export function LogisticsAround() {
  return (
    <group>
      <Hall band="#e0802a" wall="#e3e1dc" />
      <Racking x={-680} y0={-260} y1={1000} filled={(b, l) => (b * 3 + l * 5) % 7 !== 2} />
      <Racking x={-1360} y0={-260} y1={1000} filled={(b, l) => (b * 5 + l) % 6 !== 1} />
      <Tape a={[-1020, -300]} b={[-1020, 1300]} w={10} color="#f2c230" />
      {/* Two AGVs on the same one-way loop round the aisle, half a lap apart. */}
      {[0, 11.2].map((ph, i) => (
        <RouteAgv
          key={i}
          route={[
            [-900, -200],
            [-900, 1250],
            [-1140, 1250],
            [-1140, -200],
          ]}
          speed={140}
          phase={ph}
          led={i ? '#38bdf8' : '#1fae66'}
          cargo={i ? undefined : <PalletLoad at={[0, 0]} h={70} />}
        />
      ))}
      <Beacon at={[-770, 1320]} />
      <RunningBelt at={[-60, 700]} yaw={Math.PI / 2} belt={{ x: 0, width: 110, top: 70, yIn: 420, yOut: -380 }} speed={50} gap={150} />
      <WorkingArm at={[-260, 1060]} yaw={-Math.PI / 2} job={{ pick: [150, -95, 25], place: [150, 95, 25], period: 8, block: '#c8925a' }} phase={1.5} />
      <SignalTower at={[-470, 480]} h={210} />
      <Monitor at={[-470, 300]} yaw={-0.6} w={170} kind="line" accent="#e0802a" title="출고 B동 · 적재 현황" />
      <Sign at={[-1020, 1380, 110]} w={170} h={34} lines={['B동 랙 · AGV 통로', '사람 출입 금지']} fg="#ffffff" bg="#e0802a" />
    </group>
  );
}

/* --- 바이오 실험실 ------------------------------------------------------------------------- */

/** A lab bench along y (top at `h`): white top, grey cabinets below. */
function LabBench({ x, y0, y1, d = 240, h = 110 }: { x: number; y0: number; y1: number; d?: number; h?: number }) {
  return (
    <group>
      <RBox at={[x, (y0 + y1) / 2, h - 6]} size={[d, y1 - y0, 12]} radius={2}>
        <meshStandardMaterial color="#f4f6f8" roughness={0.35} />
      </RBox>
      <RBox at={[x - 6, (y0 + y1) / 2, (h - 12) / 2]} size={[d - 24, y1 - y0 - 20, h - 12]} radius={3}>
        <meshStandardMaterial color="#b9c2cc" roughness={0.6} />
      </RBox>
      {Array.from({ length: Math.floor((y1 - y0) / 160) }, (_, i) => (
        <RBox key={i} at={[x + d / 2 - 17.5, y0 + 90 + i * 160, (h - 12) / 2]} size={[1, 140, h - 30]} radius={0.5} shadow={false}>
          <meshStandardMaterial color="#cfd6de" roughness={0.5} />
        </RBox>
      ))}
      <Blob at={[x, (y0 + y1) / 2]} w={d} d={y1 - y0} k={0.25} />
    </group>
  );
}

/** A benchtop centrifuge with its lid up and the rotor spinning. */
function Centrifuge({ at, z }: { at: Xy; z: number }) {
  return (
    <group position={[m(at[0]), m(at[1]), m(z)]}>
      <Turned profile={pill(46, 48, 6)}>
        <meshStandardMaterial color="#e9edf2" roughness={0.4} />
      </Turned>
      <mesh position={[m(-40), 0, m(78)]} rotation={[0, -1.1, 0]}>
        <cylinderGeometry args={[m(44), m(44), m(5), 32]} />
        <meshPhysicalMaterial color="#9fd3ff" transparent opacity={0.45} roughness={0.1} clearcoat={1} />
      </mesh>
      <Turn at={[0, 0]} z={44} rps={3}>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[m(30), m(34), m(8), 24]} />
          <meshStandardMaterial color="#aeb6bf" metalness={0.8} roughness={0.3} />
        </mesh>
        {[0, 1, 2, 3, 4, 5].map((k) => (
          <mesh key={k} position={[m(Math.cos((k * Math.PI) / 3) * 22), m(Math.sin((k * Math.PI) / 3) * 22), m(6)]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[m(4), m(4), m(10), 10]} />
            <meshStandardMaterial color={k % 2 ? '#e5484d' : '#2f5be7'} roughness={0.4} />
          </mesh>
        ))}
      </Turn>
    </group>
  );
}

/** A stirrer plate with a flask of blue medium, its stir bar turning. */
function Stirrer({ at, z }: { at: Xy; z: number }) {
  return (
    <group position={[m(at[0]), m(at[1]), m(z)]}>
      <RBox at={[0, 0, 8]} size={[70, 70, 16]} radius={4}>
        <meshStandardMaterial color="#f5f7fa" roughness={0.4} />
      </RBox>
      <Turned at={[0, 0, 16]} profile={vessel(26, 9, 70, 1.6, 2)}>
        <meshPhysicalMaterial color="#e8f4ff" transparent opacity={0.35} roughness={0.05} clearcoat={1} side={2} />
      </Turned>
      <Turned at={[0, 0, 18]} profile={[[0, 0], [24, 0], [22, 8], [15, 26], [0, 26]]}>
        <meshStandardMaterial color="#3d7bd9" transparent opacity={0.7} roughness={0.2} />
      </Turned>
      <Turn at={[0, 0]} z={20} rps={2}>
        <mesh rotation={[0, Math.PI / 2, 0]}>
          <capsuleGeometry args={[m(2.5), m(14), 4, 8]} />
          <meshStandardMaterial color="#ffffff" roughness={0.3} />
        </mesh>
      </Turn>
    </group>
  );
}

/** The lab round the sample cell: a bench of instruments, the next station's arm, a sample AGV, the incubator. */
export function BioAround() {
  return (
    <group>
      <Hall band="#2f9e6b" wall="#eef1f4" x={-2200} y={2200} />
      <LabBench x={-520} y0={60} y1={900} />
      <Centrifuge at={[-530, 180]} z={110} />
      <Stirrer at={[-530, 360]} z={110} />
      <Steam at={[-530, 360]} z={210} n={4} r={5} rise={50} />
      <Monitor at={[-540, 560]} z={110} yaw={-0.35} w={150} kind="plot" accent="#2f9e6b" title="흡광도 · 시료 12" />
      {[0, 1, 2].map((k) => (
        <RBox key={k} at={[-530, 720 + k * 55, 140]} size={[60, 40, 60]} radius={4}>
          <meshStandardMaterial color={['#e9edf3', '#dfe9f6', '#eaf6ef'][k]} roughness={0.5} />
        </RBox>
      ))}
      <WorkingArm at={[-150, 980]} yaw={-Math.PI / 2} job={{ pick: [150, -95, 25], place: [150, 95, 25], period: 10, block: '#e9edf3' }} phase={3} table={[380, 260, 110]} />
      {/* The incubator: a tall white cabinet, a glass door, its status LEDs. */}
      <group>
        <RBox at={[-900, 700, 160]} size={[220, 220, 320]} radius={8}>
          <meshStandardMaterial color="#f4f6f8" roughness={0.4} />
        </RBox>
        <RBox at={[-789, 700, 170]} size={[2, 170, 220]} radius={1} shadow={false}>
          <meshPhysicalMaterial color="#cfe7ff" transparent opacity={0.5} roughness={0.05} clearcoat={1} />
        </RBox>
        <Leds at={[-788, 620]} z={292} cols={3} rows={2} pitch={8} />
        <Sign at={[-788.5, 760, 296]} yaw={Math.PI / 2} w={80} h={16} lines={['37 °C · CO₂ 5 %']} fg="#e6ebf2" bg="#141a22" />
        <Blob at={[-900, 700]} w={220} d={220} />
      </group>
      <Tape a={[-1250, 1170]} b={[700, 1170]} w={10} color="#2f9e6b" />
      <Tape a={[-1250, 1500]} b={[700, 1500]} w={10} color="#2f9e6b" />
      <RouteAgv
        route={[
          [-1150, 1270],
          [600, 1270],
          [600, 1400],
          [-1150, 1400],
        ]}
        speed={110}
        led="#38bdf8"
        cargo={
          <RBox at={[0, 0, 25]} size={[150, 110, 50]} radius={6}>
            <meshStandardMaterial color="#ffffff" roughness={0.4} />
          </RBox>
        }
      />
    </group>
  );
}

/* --- 스마트팜 ------------------------------------------------------------------------------ */

/** A raised bed of tomato plants along x at `y`, every plant stirring a little in the fans' air. */
function TomatoBed({ x0, x1, y, seed = 0 }: { x0: number; x1: number; y: number; seed?: number }) {
  const plants = Array.from({ length: Math.floor((x1 - x0) / 70) + 1 }, (_, k) => x0 + k * 70);
  return (
    <group>
      <RBox at={[(x0 + x1) / 2, y, 25]} size={[x1 - x0 + 50, 80, 50]} radius={4}>
        <meshStandardMaterial color="#f2f4f1" roughness={0.6} />
      </RBox>
      <mesh position={[m((x0 + x1) / 2), m(y + 30), m(52)]} rotation={[0, Math.PI / 2, 0]}>
        <cylinderGeometry args={[m(2), m(2), m(x1 - x0 + 40), 6]} />
        <meshStandardMaterial color="#1d2025" roughness={0.6} />
      </mesh>
      <StemSet limit={plants.length}>
        <cylinderGeometry args={[m(3.5), m(4.5), m(300), 6]} />
        <meshStandardMaterial color="#3d7a2c" roughness={0.8} />
        <LeafSet limit={plants.length * 4}>
          <sphereGeometry args={[m(24), 9, 7]} />
          <meshStandardMaterial color="#ffffff" roughness={0.8} />
          <FruitSet limit={plants.length * 3}>
            <sphereGeometry args={[m(11), 12, 9]} />
            <meshPhysicalMaterial color="#ffffff" roughness={0.3} clearcoat={0.8} />
            {plants.map((px, k) => (
              <Sway key={px} at={[px, y]} deg={2.5} rate={0.7 + ((k * 13 + seed) % 5) * 0.08} phase={k * 1.3 + seed}>
                <Stem position={[0, 0, m(50 + 150)]} rotation={[Math.PI / 2, 0, 0]} />
                {[100, 170, 240, 310].map((h, j) => (
                  <Leaf key={h} position={[m(j % 2 ? 15 : -15), 0, m(50 + h)]} scale={[1.5, 0.75, 0.5]} color={j % 2 ? '#4f9a37' : '#5aa83f'} />
                ))}
                {[0, 1, 2].map((j) => (
                  <Fruit key={j} position={[m(6 + j * 8), m(-20), m(50 + 130 - j * 6 + (k % 2) * 60)]} color={['#d8331f', '#e8762c', '#7dbb3c'][(j + k + seed) % 3]} />
                ))}
              </Sway>
            ))}
          </FruitSet>
        </LeafSet>
      </StemSet>
      <RBox at={[(x0 + x1) / 2, y, 430]} size={[x1 - x0 + 40, 22, 8]} radius={3} shadow={false}>
        <meshStandardMaterial color="#d7c8ff" emissive="#b28cff" emissiveIntensity={0.9} toneMapped={false} />
      </RBox>
      <Blob at={[(x0 + x1) / 2, y]} w={x1 - x0 + 60} d={110} k={0.3} />
    </group>
  );
}

/** A harvest crate (on an AGV). */
function Crate({ color = '#e0a321', fruit = '#d8331f' }: { color?: string; fruit?: string }) {
  return (
    <group>
      <RBox at={[0, 0, 28]} size={[190, 140, 56]} radius={4}>
        <meshStandardMaterial color={color} roughness={0.6} />
      </RBox>
      {Array.from({ length: 12 }, (_, j) => (
        <mesh key={j} position={[m(-75 + (j % 6) * 30), m(-30 + Math.floor(j / 6) * 40), m(58)]}>
          <sphereGeometry args={[m(13), 12, 9]} />
          <meshPhysicalMaterial color={fruit} roughness={0.3} clearcoat={0.8} />
        </mesh>
      ))}
    </group>
  );
}

/** The greenhouse round the sorting cell: rows of plants, a harvest AGV between them, a fan, the packing arm. */
export function FarmAround() {
  return (
    <group>
      <Hall glass x={-2400} y={2400} />
      <TomatoBed x0={-1100} x1={380} y={720} seed={1} />
      <TomatoBed x0={-1100} x1={380} y={1120} seed={2} />
      <TomatoBed x0={-1100} x1={380} y={1520} seed={3} />
      <RouteAgv
        route={[
          [-1000, 920],
          [500, 920],
          [500, 1320],
          [-1000, 1320],
        ]}
        speed={110}
        cargo={<Crate />}
      />
      <WorkingArm at={[-700, 230]} yaw={-0.2} job={{ pick: [150, -95, 26], place: [150, 95, 26], period: 9, item: 'ball', block: '#d8331f' }} phase={4} />
      {/* A circulation fan on a post, blowing along the rows. */}
      <group>
        <mesh position={[m(-420), m(520), m(200)]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[m(6), m(6), m(400), 10]} />
          <Steel />
        </mesh>
        <Fan at={[-420, 520]} z={420} r={70} yaw={0.4} rps={3} />
      </group>
      <Monitor at={[-420, 0]} yaw={-0.5} w={150} kind="line" accent="#3a9b3a" title="1동 온도 24 °C · 습도 68 %" />
    </group>
  );
}

/* --- 서비스 카페 --------------------------------------------------------------------------- */

/** A small café table with two chairs and a cup on it, steaming. */
/** A café table with two chairs and a steaming cup on it, at real size on the floor (z = 0 of its group). */
function CafeTable({ at, phase = 0, yaw = 0 }: { at: Xy; phase?: number; yaw?: number }) {
  const [x, y] = at;
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return (
    <group>
      <Model group="cafe" name="table" at={at} yaw={yaw} />
      {[-1, 1].map((k) => (
        <Model key={k} group="cafe" name="chair" at={[x + k * 640 * c, y + k * 640 * s]} yaw={yaw + (k > 0 ? -Math.PI / 2 : Math.PI / 2)} />
      ))}
      <group position={[m(x + 120), m(y - 60), m(754)]}>
        <mesh position={[0, 0, m(45)]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[m(40), m(30), m(90), 20]} />
          <meshStandardMaterial color="#fbfaf7" roughness={0.5} />
        </mesh>
        <mesh position={[0, 0, m(82)]}>
          <circleGeometry args={[m(36), 20]} />
          <meshStandardMaterial color="#4a2511" roughness={0.3} />
        </mesh>
      </group>
      <Steam at={[x + 120, y - 60]} z={850} n={5} r={14} rise={160} phase={phase} />
    </group>
  );
}

/**
 * The café round the robot bar, at real size on the floor CAFE_COUNTER_MM below the counter top:
 * tables with steaming cups, a serving robot doing its round, the back bar with the second robot,
 * the order screen, a plant and the menu board.
 */
export function CafeAround() {
  return (
    <group position={[0, 0, m(-CAFE_COUNTER_MM)]}>
      <Hall band="#b4530f" wall="#efe6da" x={-2600} y={2600} h={3000} />
      <CafeTable at={[-1700, 900]} />
      <CafeTable at={[-1700, -600]} phase={1.3} />
      <CafeTable at={[-200, 1900]} phase={2.6} yaw={Math.PI / 2} />
      <RouteAgv
        route={[
          [-900, 300],
          [-900, 1500],
          [-1200, 1500],
          [-1200, 300],
        ]}
        speed={160}
        led="#f0a14a"
        cargo={
          <group>
            <mesh position={[0, 0, m(40)]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[m(8), m(8), m(80), 10]} />
              <meshStandardMaterial color="#e9e2d6" roughness={0.5} />
            </mesh>
            <mesh position={[0, 0, m(84)]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[m(110), m(110), m(8), 32]} />
              <meshStandardMaterial color="#efe6da" roughness={0.5} />
            </mesh>
            {[-40, 40].map((dx) => (
              <mesh key={dx} position={[m(dx), 0, m(102)]} rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[m(16), m(12), m(28), 20]} />
                <meshStandardMaterial color="#fbfaf7" roughness={0.5} />
              </mesh>
            ))}
          </group>
        }
      />
      {/* The back bar: a long counter, the second robot moving cups to the lids station, the order screen. */}
      <RBox at={[-560, 300, 450]} size={[600, 1400, 900]} radius={6}>
        <meshStandardMaterial color="#5c3b23" roughness={0.6} />
      </RBox>
      <RBox at={[-560, 300, 905]} size={[620, 1420, 10]} radius={3}>
        <meshStandardMaterial color="#efe6da" roughness={0.4} />
      </RBox>
      <WorkingArm at={[-420, 900]} yaw={Math.PI} job={{ pick: [150, -95, 40], place: [150, 95, 40], period: 10, item: 'cup' }} phase={2} table={[380, 260, 910]} />
      <Monitor at={[-640, 80]} z={910} yaw={-0.25} w={300} kind="orders" accent="#f0a14a" title="주문 현황" />
      <Steam at={[-560, 420]} z={930} n={4} r={10} rise={90} phase={0.7} />
      <Model group="cafe" name="plant" at={[1100, -1300]} />
      <Model group="cafe" name="chalkboard" at={[-1100, -1500]} yaw={-0.4} />
    </group>
  );
}

/* --- 스마트시티 돌봄 (카페 ③) ------------------------------------------------------------------ */

/**
 * A care bed at real size (along x, head at −x, turned by `yaw` about its centre): a frame on four castors, a mattress with its back
 * section raised, side rails, head and foot boards, a folded blanket and a pillow; `z` is the floor, mm.
 */
export function CareBed({ at, z = 0, yaw = 0, rails = 'both', blanket = '#9fc7b5' }: { at: Xy; z?: number; yaw?: number; rails?: 'both' | 'far'; blanket?: string }) {
  const x = 0;
  const y = 0;
  const L = 2000;
  const W = 920;
  const top = 520;
  const head = x - L / 2;
  const back = 650;
  const tilt = 0.5;
  const frame = <meshStandardMaterial color="#d6dbe0" metalness={0.55} roughness={0.35} />;
  const board = <meshStandardMaterial color="#c9b79c" roughness={0.55} />;
  return (
    <group position={[m(at[0]), m(at[1]), m(z)]} rotation={[0, 0, yaw]}>
      {[-1, 1].flatMap((sx) =>
        [-1, 1].map((sy) => (
          <group key={`${sx}${sy}`}>
            <RBox at={[x + sx * (L / 2 - 80), y + sy * (W / 2 - 70), (top - 180) / 2 + 60]} size={[40, 40, top - 180]} radius={4}>
              {frame}
            </RBox>
            <mesh position={[m(x + sx * (L / 2 - 80)), m(y + sy * (W / 2 - 70)), m(40)]}>
              <sphereGeometry args={[m(40), 16, 12]} />
              <meshStandardMaterial color="#3a3f46" roughness={0.6} />
            </mesh>
          </group>
        )),
      )}
      <RBox at={[x, y, top - 170]} size={[L - 80, W - 60, 60]} radius={8}>
        {frame}
      </RBox>
      {/* mattress: the flat part, and the back section raised */}
      <RBox at={[x + back / 2, y, top - 70]} size={[L - back - 60, W - 80, 140]} radius={30}>
        <meshStandardMaterial color="#f4f6f7" roughness={0.9} />
      </RBox>
      <group position={[m(head + back + 30), m(y), m(top - 140)]} rotation={[0, -tilt, 0]}>
        <RBox at={[-back / 2, 0, 70]} size={[back, W - 80, 140]} radius={30}>
          <meshStandardMaterial color="#f4f6f7" roughness={0.9} />
        </RBox>
        <RBox at={[-back + 140, 0, 175]} size={[200, W * 0.55, 80]} radius={30}>
          <meshStandardMaterial color="#ffffff" roughness={0.95} />
        </RBox>
      </group>
      <RBox at={[x + 420, y, top + 10]} size={[900, W - 60, 40]} radius={14}>
        <meshStandardMaterial color={blanket} roughness={0.95} />
      </RBox>
      <RBox at={[head + 20, y, top + 120]} size={[40, W, 520]} radius={10}>
        {board}
      </RBox>
      <RBox at={[x + L / 2 - 20, y, top - 10]} size={[40, W, 340]} radius={10}>
        {board}
      </RBox>
      {/* side rails along the upper half: both sides, or only the far one (+y) where someone sits on the near edge */}
      {(rails === 'both' ? [-1, 1] : [1]).map((sy) => (
        <group key={sy}>
          {[0, 1, 2].map((k) => (
            <RBox key={k} at={[head + 520, y + sy * (W / 2 + 10), top + 60 + k * 90]} size={[800, 22, 22]} radius={10}>
              {frame}
            </RBox>
          ))}
          {[-1, 1].map((e) => (
            <RBox key={e} at={[head + 520 + e * 380, y + sy * (W / 2 + 10), top + 100]} size={[22, 22, 220]} radius={10}>
              {frame}
            </RBox>
          ))}
        </group>
      ))}
    </group>
  );
}

/**
 * Round the resident's room (the floor CARE_ARM_Z below the arm, which stands on a myAGV and its lift column): the
 * room's walls, a second bed, the vital-signs screen, and the centre's delivery robot going up and
 * down the corridor with cups on its tray.
 */
export function CareAround() {
  const z = -CARE_ARM_Z;
  return (
    <group>
      <group position={[0, 0, m(z)]}>
        <Hall band="#3a8f6b" wall="#eef1ec" x={-2000} y={2000} />
        <RouteAgv
          route={[
            [-1300, -400],
            [-1300, 1500],
            [-1500, 1500],
            [-1500, -400],
          ]}
          speed={90}
          led="#3a8f6b"
          cargo={
            <group>
              <RBox at={[0, 0, 6]} size={[220, 160, 8]} radius={4}>
                <meshStandardMaterial color="#e6ebe4" roughness={0.6} />
              </RBox>
              {[-50, 0, 50].map((dx) => (
                <mesh key={dx} position={[m(dx), 0, m(26)]} rotation={[Math.PI / 2, 0, 0]}>
                  <cylinderGeometry args={[m(15), m(12), m(32), 18]} />
                  <meshStandardMaterial color="#fbfaf7" roughness={0.5} />
                </mesh>
              ))}
            </group>
          }
        />
      </group>
      <CareBed at={[-1700, 900]} z={z} blanket="#c9b3d9" />
      <RBox at={[-1600, -200, z / 2]} size={[400, 300, -z]} radius={4}>
        <meshStandardMaterial color="#c9b79c" roughness={0.6} />
      </RBox>
      <Monitor at={[-1600, -200]} yaw={0.9} w={260} kind="plot" accent="#3a8f6b" title="생체 신호" />
    </group>
  );
}

/* --- AI 연구소 ----------------------------------------------------------------------------- */

/** A small lane track (a loop with white edges and a dashed middle) for the self-driving AGV. */
function Track({ x0, x1, y0, y1, w = 300 }: { x0: number; x1: number; y0: number; y1: number; w?: number }) {
  const h = w / 2;
  const edges: [Xy, Xy][] = [
    [[x0 - h, y0 - h], [x1 + h, y0 - h]],
    [[x1 + h, y0 - h], [x1 + h, y1 + h]],
    [[x1 + h, y1 + h], [x0 - h, y1 + h]],
    [[x0 - h, y1 + h], [x0 - h, y0 - h]],
    [[x0 + h, y0 + h], [x1 - h, y0 + h]],
    [[x1 - h, y0 + h], [x1 - h, y1 - h]],
    [[x1 - h, y1 - h], [x0 + h, y1 - h]],
    [[x0 + h, y1 - h], [x0 + h, y0 + h]],
  ];
  return (
    <group>
      <mesh position={[m((x0 + x1) / 2), m((y0 + y1) / 2), m(0.1)]} receiveShadow>
        <planeGeometry args={[m(x1 - x0 + w), m(y1 - y0 + w)]} />
        <meshStandardMaterial color="#3a4048" roughness={0.85} />
      </mesh>
      <mesh position={[m((x0 + x1) / 2), m((y0 + y1) / 2), m(0.2)]}>
        <planeGeometry args={[m(x1 - x0 - w), m(y1 - y0 - w)]} />
        <meshStandardMaterial color="#cfd5db" roughness={0.6} />
      </mesh>
      {edges.map(([a, b], i) => (
        <Tape key={i} a={a as [number, number]} b={b as [number, number]} w={10} color="#ffffff" />
      ))}
    </group>
  );
}

/** The lab round the AI kit: a self-driving AGV on its track, research desks with screens, the server rack, another arm sorting. */
export function AiAround() {
  return (
    <group>
      <Hall band="#7a3fd1" wall="#e9eaf0" x={-2200} y={2200} />
      <Track x0={-1250} x1={-500} y0={420} y1={1150} />
      <RouteAgv
        route={[
          [-1250, 420],
          [-500, 420],
          [-500, 1150],
          [-1250, 1150],
        ]}
        speed={130}
        led="#7a3fd1"
      />
      <Monitor at={[-280, 860]} yaw={-0.9} w={170} kind="vision" accent="#7a3fd1" title="객체 인식 · 실시간" />
      <Monitor at={[-120, 1020]} yaw={-1.2} w={170} kind="log" accent="#7a3fd1" title="학습 로그 · 모델 v3" />
      <WorkingArm at={[-560, -40]} yaw={0.15} job={{ pick: [150, -95, 25], place: [150, 95, 25], period: 8, block: '#7a3fd1' }} phase={1} />
      {/* The server rack: a tall dark cabinet, rows of blinking lights. */}
      <group>
        <RBox at={[-300, 1350, 260]} size={[200, 200, 520]} radius={6}>
          <meshStandardMaterial color="#1f2328" roughness={0.45} metalness={0.3} />
        </RBox>
        {[0, 1, 2, 3].map((k) => (
          <Leds key={k} at={[-199, 1350]} z={120 + k * 100} cols={8} rows={3} pitch={9} />
        ))}
        <Blob at={[-300, 1350]} w={200} d={200} />
      </group>
      <Sign at={[-900, 1300, 160]} w={180} h={60} lines={['자율주행 · 비전 연구', 'Physical AI Lab', '데이터 → 학습 → 로봇']} fg="#ffffff" bg="#7a3fd1" />
    </group>
  );
}

/* --- 에너지 · 자원순환 ------------------------------------------------------------------------ */

/** The sorting hall's look: a pale green-grey sky over a concrete floor. */
export const ENERGY_LOOK: SiteLook = { sky: '#d5e0da', floor: 'concrete' };

/** A pressed bale of one kind (cans, PET, paper): a block with its two steel straps. */
function Bale({ at, color, z = 0 }: { at: Xy; color: string; z?: number }) {
  return (
    <group>
      <RBox at={[at[0], at[1], z + 110]} size={[260, 220, 220]} radius={10}>
        <meshStandardMaterial color={color} roughness={0.85} />
      </RBox>
      {[-60, 60].map((dx) => (
        <RBox key={dx} at={[at[0] + dx, at[1], z + 110]} size={[8, 224, 224]} radius={2} shadow={false}>
          <Steel />
        </RBox>
      ))}
      {z === 0 && <Blob at={at} w={280} d={240} />}
    </group>
  );
}

/** The sorting hall round the cell: the main line's belt with a sorting arm at it, pressed bales of each kind, the line's screen and sign. */
export function EnergyAround() {
  return (
    <group>
      <Hall band="#0b8a7a" wall="#e4e9e6" />
      <RunningBelt at={[-80, 720]} yaw={Math.PI / 2} belt={{ x: 0, width: 110, top: 70, yIn: 420, yOut: -380 }} speed={45} gap={130} boxes={['#c3cad2', '#cfe8f7', '#3c8f5c', '#f08a24', '#b9824d']} />
      <WorkingArm at={[-300, 1080]} yaw={-Math.PI / 2} job={{ pick: [150, -95, 25], place: [150, 95, 25], period: 7, block: '#c3cad2' }} phase={0.8} />
      <Bale at={[-900, 200]} color="#b9c1c9" />
      <Bale at={[-900, 200]} z={220} color="#aab3bc" />
      <Bale at={[-900, 480]} color="#cfe3ef" />
      <Bale at={[-1200, 200]} color="#b08a5a" />
      <Bale at={[-1200, 480]} color="#5f8f6b" />
      <Tape a={[-700, -100]} b={[-700, 1300]} w={10} color="#f2c230" />
      <SignalTower at={[-470, 480]} h={210} />
      <Monitor at={[-470, 300]} yaw={-0.6} w={170} kind="plot" accent="#0b8a7a" title="재활용률 · 처리량 (개/분)" />
      <Sign at={[-1050, 660, 300]} w={220} h={60} lines={['자원순환센터 · 선별동', '캔 · PET · 종이팩', '비우고 · 헹구고 · 분리해요']} fg="#ffffff" bg="#0b8a7a" />
    </group>
  );
}
