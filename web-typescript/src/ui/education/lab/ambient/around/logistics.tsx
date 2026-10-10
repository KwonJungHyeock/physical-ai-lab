'use client';

/**
 * 물류 허브: round the palletising cell (robot frame, mm; see ../Around.tsx).
 */

import { createInstances } from '@react-three/drei';

import { RBox } from '../../../../simulator/stage/sceneKit';
import { Sign, Tape, m } from '../../CellKit';
import type { SiteLook } from '../Ground';
import { Blob } from '../Ground';
import { Hall } from '../Hall';
import { Beacon, Monitor, RouteAgv, RunningBelt, SignalTower, WorkingArm } from '../Props';

type Xy = readonly [number, number];

export const LOGISTICS_LOOK: SiteLook = { sky: '#cfd2d4', floor: 'concrete' };

const [UprightSet, Upright] = createInstances();
const [PalletSet, PalletPiece] = createInstances();
const [LoadSet, Load] = createInstances();
const [WrapSet, Wrap] = createInstances();

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

function Racking({ x, y0, y1, levels = [0, 170, 340], filled }: { x: number; y0: number; y1: number; levels?: readonly number[]; filled: (bay: number, level: number) => boolean }) {
  const bay = 190;
  const n = Math.floor((y1 - y0) / bay);
  const top = levels[levels.length - 1] + 150;
  const loads = levels.flatMap((z, l) =>
    Array.from({ length: n }, (_, b) => ({
      b,
      l,
      z,
      h: l === 2 ? 70 : 100,
    })).filter((q) => filled(q.b, q.l)),
  );
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
      <WorkingArm
        at={[-260, 1060]}
        yaw={-Math.PI / 2}
        job={{
          pick: [150, -95, 25],
          place: [150, 95, 25],
          period: 8,
          block: '#c8925a',
        }}
        phase={1.5}
      />
      <SignalTower at={[-470, 480]} h={210} />
      <Monitor at={[-470, 300]} yaw={-0.6} w={170} kind="line" accent="#e0802a" title="출고 B동 · 적재 현황" />
      <Sign at={[-1020, 1380, 110]} w={170} h={34} lines={['B동 랙 · AGV 통로', '사람 출입 금지']} fg="#ffffff" bg="#e0802a" />
    </group>
  );
}
