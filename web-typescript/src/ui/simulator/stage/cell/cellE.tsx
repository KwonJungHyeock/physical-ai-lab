'use client';

/**
 * 실습 셀 E 조립 · 삽입: the work table with the vibratory bowl feeder (it shivers while 피더 runs)
 * and its pin track out to the nest the robot picks from; the housing belt bringing housings to the
 * jig station — a stopper on a bridge and the blue clamp cylinder whose jaw holds the housing — and
 * the finished-box at the belt's end.
 */

import { useFrame } from '@react-three/fiber';
import { useRef, type RefObject } from 'react';
import type { Group } from 'three';

import { E_AT, cellLayout } from '@/engine/simulator/cell/cells';
import type { WorldState } from '@/engine/simulator/sim';

import { RBox, Turned, pill, vessel } from '../sceneKit';
import { ActuatorBox, AirCylinder, Alu, Bin, Conveyor, Hose, Paint, Stand, Steel, Tagged, m } from './kit';

/** The bowl feeder: a drive base and a stainless bowl with its spiral ledge; it shivers while 피더 runs. */
function BowlFeeder({ world }: { world: RefObject<WorldState | null> }) {
  const B = E_AT.bowl;
  const z0 = E_AT.table.top;
  const g = useRef<Group>(null);
  useFrame(({ clock }) => {
    const on = !!world.current?.cell?.line.out['피더'];
    if (g.current) {
      const t = clock.getElapsedTime();
      g.current.position.z = on ? m(Math.sin(t * 90) * 0.35) : 0;
      g.current.rotation.z = on ? Math.sin(t * 90) * 0.004 : 0;
    }
  });
  const bowlZ = z0 + 22;
  return (
    <group position={[m(B.x), m(B.y), 0]}>
      <Turned at={[0, 0, z0]} profile={pill(B.r * 0.62, 22, 2)} segments={40}>
        <Paint color="#3a4048" rough={0.45} />
      </Turned>
      <group ref={g}>
        <Turned at={[0, 0, bowlZ]} profile={vessel(B.r, B.r * 0.86, B.top - bowlZ, 2.2, 3)} segments={56}>
          <meshStandardMaterial color="#c9d0d7" metalness={0.85} roughness={0.22} side={2} />
        </Turned>
        {/* The spiral ledge (two turns) the pins climb on. */}
        {[0.35, 0.7].map((f) => (
          <mesh key={f} position={[0, 0, m(bowlZ + (B.top - bowlZ) * f)]}>
            <torusGeometry args={[m(B.r * 0.86), m(1.6), 8, 48]} />
            <meshStandardMaterial color="#aeb6be" metalness={0.8} roughness={0.25} />
          </mesh>
        ))}
        <mesh position={[0, 0, m(bowlZ + 4)]}>
          <circleGeometry args={[m(B.r * 0.8), 32]} />
          <meshStandardMaterial color="#9aa3ab" metalness={0.7} roughness={0.35} />
        </mesh>
      </group>
    </group>
  );
}

/** The pin track from the bowl's rim out to the nest, on a post. */
function PinTrack() {
  const z0 = E_AT.table.top;
  const N = E_AT.nest;
  return (
    <group>
      <RBox at={[130, -176, z0 + 4]} size={[16, 72, 8]} radius={0.8}>
        <meshStandardMaterial color="#c9d0d7" metalness={0.8} roughness={0.25} />
      </RBox>
      {[-1, 1].map((s) => (
        <RBox key={s} at={[130 + s * 7, -176, z0 + 10]} size={[2, 72, 4]} radius={0.4}>
          <meshStandardMaterial color="#b8c0c8" metalness={0.8} roughness={0.25} />
        </RBox>
      ))}
      <RBox at={[N.x, N.y, z0 + 4]} size={[20, 20, 8]} radius={1}>
        <Steel color="#7d868f" />
      </RBox>
      <Turned at={[N.x, N.y, z0 + 8]} profile={pill(5.5, 0.6, 0.2)} segments={20}>
        <meshStandardMaterial color="#2a2f36" />
      </Turned>
      {/* The linear vibrator under the track. */}
      <RBox at={[130, -190, z0 - 6]} size={[14, 30, 12]} radius={1.5}>
        <Paint color="#3a4048" />
      </RBox>
    </group>
  );
}

/** The jig station on the belt: the stopper on its bridge and the clamp cylinder with its jaw. */
function JigStation({ world }: { world: RefObject<WorldState | null> }) {
  const l = cellLayout('assembly');
  const J = E_AT.jig;
  const stopY = J.y - E_AT.housing[1] / 2;
  return (
    <group>
      {[169, 231].map((x) => (
        <RBox key={x} at={[x, stopY - 3, 42]} size={[6, 8, 42]} radius={0.8}>
          <Alu />
        </RBox>
      ))}
      <RBox at={[200, stopY - 3, 64]} size={[68, 10, 8]} radius={1}>
        <Alu />
      </RBox>
      <AirCylinder at={[200, stopY - 3, 76]} len={16} d={12} axis="z" />
      <ActuatorBox world={world} l={l} output="스토퍼" color="#e8eaed" />
      {/* Clamp: a bracket on the frame, the cylinder pointing at the belt, its jaw. */}
      <RBox at={[255, J.y, 26]} size={[36, 24, 4]} radius={0.8}>
        <Steel color="#8c949d" />
      </RBox>
      <AirCylinder at={[255, J.y, 39]} len={30} d={18} />
      <ActuatorBox world={world} l={l} output="클램프" color="#f2c200" metal={0.1} />
      <Hose pts={[[245, J.y + 6, 49], [246, J.y + 14, 52], [250, J.y + 20, 30], [258, J.y + 22, 22]]} />
      <Hose pts={[[265, J.y + 6, 49], [266, J.y + 14, 52], [262, J.y + 21, 30], [258, J.y + 23, 22]]} />
    </group>
  );
}

export function AssemblyCell({ world, onHover }: { world: RefObject<WorldState | null>; onHover: (n: string | null) => void }) {
  const l = cellLayout('assembly');
  const T = E_AT.table;
  return (
    <group>
      <Tagged name="작업대" onHover={onHover}>
        <Stand x0={T.x0} x1={T.x1} y0={T.y0} y1={T.y1} top={T.top} s={8} />
      </Tagged>
      <Tagged name="진동 피더" onHover={onHover}>
        <BowlFeeder world={world} />
      </Tagged>
      <Tagged name="핀 트랙" onHover={onHover}>
        <PinTrack />
      </Tagged>
      <Tagged name="하우징 컨베이어" onHover={onHover}>
        <Conveyor world={world} l={l} tint="#8fd4a0" />
      </Tagged>
      <Tagged name="클램프 지그" onHover={onHover}>
        <JigStation world={world} />
      </Tagged>
      <Tagged name="완성 상자" onHover={onHover}>
        <Stand x0={170} x1={230} y0={-198} y1={-126} top={-80} s={8} />
        <Bin x0={168} x1={232} y0={-200} y1={-124} z0={-80} z1={22} color="#5d6670" />
      </Tagged>
    </group>
  );
}
