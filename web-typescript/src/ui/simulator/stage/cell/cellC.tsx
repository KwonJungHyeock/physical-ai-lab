'use client';

/**
 * 실습 셀 C 검사 · 불량 배출: along the belt, a hopper at the start, the height sensor's laser on a
 * bridge, the two proximity sensors (금속: orange, 비금속: blue) at the belt's edge, the ejector on its
 * stand pushing across through a gap in the guides into the red reject bin, the stopper on a bridge
 * near the end, and the two trays the robot sorts the good parts into.
 */

import type { ReactNode, RefObject } from 'react';

import { C_AT, cellLayout } from '@/engine/simulator/cell/cells';
import type { WorldState } from '@/engine/simulator/sim';

import { RBox } from '../sceneKit';
import { ActuatorBox, AirCylinder, Alu, Bin, Conveyor, Hopper, Hose, MarkedPlate, Paint, Stand, Steel, Tagged, m } from './kit';

/** A bridge over the belt: two short posts on the side profiles and a cross bar at z, mm. */
function Bridge({ y, z, children }: { y: number; z: number; children?: ReactNode }) {
  return (
    <group>
      {[189, 261].map((x) => (
        <RBox key={x} at={[x, y, (21 + z) / 2]} size={[6, 8, z - 21]} radius={0.8}>
          <Alu />
        </RBox>
      ))}
      <RBox at={[225, y, z]} size={[78, 10, 10]} radius={1}>
        <Alu />
      </RBox>
      {children}
    </group>
  );
}

/** A cylindrical proximity sensor (M18) on a bracket at the belt's far edge, pointing across the belt. */
function Proximity({ y, cap }: { y: number; cap: string }) {
  return (
    <group>
      <RBox at={[254, y, 30]} size={[8, 10, 14]} radius={0.8}>
        <Steel color="#9aa3ad" />
      </RBox>
      <mesh position={[m(248), m(y), m(39)]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[m(4), m(4), m(16), 18]} />
        <meshStandardMaterial color="#b8c0c8" metalness={0.75} roughness={0.25} />
      </mesh>
      <mesh position={[m(239.5), m(y), m(39)]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[m(3.8), m(3.8), m(2), 18]} />
        <Paint color={cap} />
      </mesh>
      <Hose pts={[[256, y, 39], [262, y, 36], [264, y - 6, 22], [262, y - 30, 16]]} r={0.9} color="#2a2f36" />
    </group>
  );
}

export function InspectCell({ world, onHover }: { world: RefObject<WorldState | null>; onHover: (n: string | null) => void }) {
  const l = cellLayout('inspect');
  const ej = C_AT.eject;
  return (
    <group>
      <Tagged name="컨베이어" onHover={onHover}>
        <Conveyor world={world} l={l} />
        <Hopper x={225} y={-446} z={52} />
      </Tagged>
      <Tagged name="높이 센서" onHover={onHover}>
        <Bridge y={C_AT.height} z={58}>
          <RBox at={[225, C_AT.height, 50]} size={[16, 12, 12]} radius={1.5}>
            <Paint color="#f2c200" />
          </RBox>
          <RBox at={[225, C_AT.height, 43.4]} size={[6, 4, 1]} radius={0.4}>
            <meshStandardMaterial color="#ff3b30" emissive="#ff2a1f" emissiveIntensity={1.2} toneMapped={false} />
          </RBox>
        </Bridge>
      </Tagged>
      <Tagged name="근접 센서" onHover={onHover}>
        <Proximity y={C_AT.metal} cap="#f08a24" />
        <Proximity y={C_AT.nonMetal} cap="#2f6fd6" />
      </Tagged>
      <Tagged name="배출 실린더" onHover={onHover}>
        <Stand x0={70} x1={118} y0={ej - 13} y1={ej + 13} top={28} s={8} />
        <AirCylinder at={[94, ej, 40]} len={44} d={22} />
        <ActuatorBox world={world} l={l} output="배출 실린더" color="#cfd5db" />
        <Hose pts={[[80, ej, 52], [76, ej + 12, 60], [70, ej + 30, 30], [72, ej + 40, -100]]} />
        <Hose pts={[[108, ej, 52], [104, ej + 14, 62], [96, ej + 34, 30], [90, ej + 44, -100]]} />
      </Tagged>
      <Tagged name="불량함" onHover={onHover}>
        <Stand x0={266} x1={328} y0={ej - 31} y1={ej + 31} top={-60} s={8} />
        <Bin x0={265} x1={329} y0={ej - 32} y1={ej + 32} z0={-60} z1={22} color="#c8352b" />
      </Tagged>
      <Tagged name="스토퍼" onHover={onHover}>
        <Bridge y={C_AT.stop} z={66}>
          <AirCylinder at={[225, C_AT.stop, 78]} len={18} d={12} axis="z" />
        </Bridge>
        <ActuatorBox world={world} l={l} output="스토퍼" color="#e8eaed" />
      </Tagged>
      <Tagged name="양품 트레이" onHover={onHover}>
        <MarkedPlate cell="inspect" grid="양품 트레이" origin />
      </Tagged>
      <Tagged name="비금속 트레이" onHover={onHover}>
        <MarkedPlate cell="inspect" grid="비금속 트레이" />
      </Tagged>
    </group>
  );
}
