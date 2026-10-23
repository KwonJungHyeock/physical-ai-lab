'use client';

/**
 * 실습 셀 A 공급 · 적재: the feed table with its stack magazine (four profile posts, a clear tube)
 * and the blue feed cylinder whose pusher slides out under it, with its air lines and valve, and a
 * trolley with a bin of parts. The belt, the plates and the cabinet are the kit's.
 */

import { useFrame } from '@react-three/fiber';
import { useRef, type RefObject } from 'react';
import type { Group, Mesh } from 'three';

import { cellLayout } from '@/engine/simulator/cell/cells';
import type { WorldState } from '@/engine/simulator/sim';

import { RBox, brushed } from '../sceneKit';
import { Alu, Hose, Paint, Prof, Stand, Steel, Tagged, m } from './kit';

/** Feed table, magazine tower and feed cylinder with its air lines; the pusher follows the line's cylinder travel. */
export function Feeder({ world, onHover }: { world: RefObject<WorldState | null>; onHover: (n: string | null) => void }) {
  const l = cellLayout('feed');
  const pu = l.line.pusher!;
  const mag = l.line.magazine!;
  const pusher = useRef<Group>(null);
  const rod = useRef<Mesh>(null);
  const len = pu.retracted[1] - pu.retracted[0];
  const head = 414;
  useFrame(() => {
    const ext = world.current?.cell?.line.ext ?? 0;
    const x0 = pu.retracted[0] + (pu.extended[0] - pu.retracted[0]) * ext;
    if (pusher.current) pusher.current.position.x = m(x0 + len / 2);
    if (rod.current) {
      // The rod runs from the cylinder's head to the pusher's back.
      const back = x0 + len;
      rod.current.position.x = m((back + head) / 2);
      rod.current.scale.y = Math.max(0.01, head - back);
    }
  });
  const cy = (pu.y[0] + pu.y[1]) / 2;
  const cz = (pu.z[0] + pu.z[1]) / 2;
  const inner = 27;
  const t = { x0: mag.x - inner / 2 - 6, x1: mag.x + inner / 2 + 6, y0: mag.y - inner / 2 - 6, y1: mag.y + inner / 2 + 6 };
  const TOP = 262;
  return (
    <group>
      {/* Feed table: a profile frame long enough for the cylinder, its top level with the belt. */}
      <Stand x0={259} x1={500} y0={-404} y1={-336} top={mag.floorZ} s={8}>
        <RBox at={[300, -370, mag.floorZ - 2]} size={[82, 64, 4]} radius={0.6}>
          <Alu />
        </RBox>
        <RBox at={[455, -370, mag.floorZ - 2]} size={[90, 64, 4]} radius={0.6}>
          <Alu />
        </RBox>
      </Stand>
      {/* A trolley with a blue bin of parts waiting to go into the magazine. */}
      <Stand x0={380} x1={470} y0={-300} y1={-240} top={-40} s={8}>
        <RBox at={[425, -270, -42]} size={[90, 60, 4]} radius={0.6}>
          <Steel color="#6b737c" />
        </RBox>
      </Stand>
      <RBox at={[425, -270, -40 + 18]} size={[76, 50, 36]} radius={3}>
        <Paint color="#2f6fd6" rough={0.5} />
      </RBox>
      <RBox at={[425, -270, -40 + 35]} size={[68, 42, 2]} radius={1}>
        <meshStandardMaterial color="#c7ccd3" metalness={0.3} roughness={0.4} />
      </RBox>
      <Tagged name="매거진" onHover={onHover}>
      {/* Magazine tower: four profile posts with rails, a clear tube, a cap and the "있음" sensor at the slot. */}
      {[
        [t.x0, t.y0],
        [t.x1, t.y0],
        [t.x0, t.y1],
        [t.x1, t.y1],
      ].map(([x, y]) => (
        <Prof key={`${x},${y}`} a={[x, y, mag.floorZ]} b={[x, y, TOP]} w={10} />
      ))}
      {[100, 180, TOP - 4].map((z) => (
        <group key={z}>
          <Prof a={[t.x0 + 4, t.y0, z]} b={[t.x1 - 4, t.y0, z]} w={6} />
          <Prof a={[t.x0 + 4, t.y1, z]} b={[t.x1 - 4, t.y1, z]} w={6} />
        </group>
      ))}
      <mesh position={[m(mag.x), m(mag.y), m((51 + TOP) / 2)]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[m(inner / 2 + 2), m(inner / 2 + 2), m(TOP - 51), 32, 1, true]} />
        <meshPhysicalMaterial color="#e6f2fa" transparent opacity={0.25} roughness={0.05} side={2} depthWrite={false} />
      </mesh>
      <RBox at={[mag.x, mag.y, TOP + 3]} size={[t.x1 - t.x0 + 8, t.y1 - t.y0 + 8, 6]} radius={1}>
        <Paint color="#3a4350" />
      </RBox>
      <RBox at={[t.x0 - 6, mag.y, mag.floorZ + 10]} size={[8, 10, 10]} radius={1.2}>
        <Paint color="#1f2a36" rough={0.35} />
      </RBox>
      </Tagged>
      <Tagged name="공급 실린더" onHover={onHover}>
      {/* Cylinder: a blue body with end caps on a bracket, two air hoses down to the valve. */}
      <group position={[m(445), m(cy), m(cz + 6)]}>
        <RBox size={[58, 22, 22]} radius={2.5}>
          <Paint color="#2a68d8" rough={0.28} />
        </RBox>
        {[-31, 31].map((dx) => (
          <RBox key={dx} at={[dx, 0, 0]} size={[6, 25, 25]} radius={1.5}>
            <meshStandardMaterial color="#cfd5db" metalness={0.4} roughness={0.35} />
          </RBox>
        ))}
        {[-22, 22].map((dx) => (
          <mesh key={dx} position={[m(dx), 0, m(13)]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[m(2.2), m(2.2), m(6), 12]} />
            <meshStandardMaterial color="#b8bec6" metalness={0.6} roughness={0.3} />
          </mesh>
        ))}
      </group>
      <RBox at={[445, cy, mag.floorZ + 3]} size={[50, 26, 6]} radius={1}>
        <Steel color="#8c949d" />
      </RBox>
      {/* Valve terminal on the table's side with its two solenoids. */}
      <group position={[m(470), m(-334), m(mag.floorZ - 16)]}>
        <RBox size={[36, 8, 18]} radius={1.5}>
          <Paint color="#3a4350" />
        </RBox>
        {[-8, 8].map((dx) => (
          <RBox key={dx} at={[dx, 5, 2]} size={[10, 6, 14]} radius={1.2}>
            <Paint color="#2a2f36" />
          </RBox>
        ))}
      </group>
      <Hose pts={[[423, cy, cz + 21], [420, cy + 10, cz + 34], [440, -330, cz + 20], [462, -330, mag.floorZ - 8]]} />
      <Hose pts={[[467, cy, cz + 21], [474, cy + 8, cz + 32], [480, -330, cz + 16], [478, -330, mag.floorZ - 8]]} />
      </Tagged>
      <mesh ref={rod} position={[0, m(cy), m(cz + 6)]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[m(3), m(3), m(1), 16]} />
        <meshStandardMaterial color="#e8ecf0" metalness={0.7} roughness={0.12} />
      </mesh>
      <group ref={pusher} position={[0, m(cy), m(cz)]}>
        <RBox size={[len, pu.y[1] - pu.y[0], pu.z[1] - pu.z[0]]} radius={1.2}>
          <meshStandardMaterial color="#cfd5db" metalness={0.35} roughness={0.35} map={brushed([3, 1])} />
        </RBox>
      </group>
    </group>
  );
}
