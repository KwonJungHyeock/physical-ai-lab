'use client';

/**
 * 스마트팩토리: what stands and moves round the conveyor cell (robot frame, mm; see ../Around.tsx).
 */

import type { ReactNode } from 'react';

import { RBox } from '../../../../simulator/stage/sceneKit';
import { CardBox } from '../../ConveyorCell';
import { Sign, Tape } from '../../CellKit';
import type { SiteLook } from '../Ground';
import { Blob } from '../Ground';
import { Hall } from '../Hall';
import { Beacon, Monitor, RouteAgv, RunningBelt, SignalTower, WorkingArm } from '../Props';

export const FACTORY_LOOK: SiteLook = { sky: '#c3ccd6', floor: 'epoxy' };

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
      <WorkingArm
        at={[-720, 300]}
        yaw={-0.25}
        job={{
          pick: [150, -95, 25],
          place: [150, 95, 25],
          period: 9,
          block: '#d9622b',
        }}
        phase={2.5}
      />
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
