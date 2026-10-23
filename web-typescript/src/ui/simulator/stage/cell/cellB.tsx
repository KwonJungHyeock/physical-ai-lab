'use client';

/**
 * 실습 셀 B 비전 분류: the belt with a camera gantry over its end — two profile posts and a beam, the
 * camera hanging from it tilted down at the pick zone with its ring light (lit by the 조명 output) —
 * the three sorting totes on a stand at the robot's left, the yellow reject chute into a box, and an
 * infeed chute at the belt's start.
 */

import { useFrame } from '@react-three/fiber';
import { useRef, type RefObject } from 'react';
import type { MeshStandardMaterial, PointLight } from 'three';

import { B_CAMERA, cellLayout } from '@/engine/simulator/cell/cells';
import type { WorldState } from '@/engine/simulator/sim';

import { RBox, Turned, pill } from '../sceneKit';
import { Bin, Conveyor, F, Hopper, Hose, Paint, Post, Prof, Stand, Steel, Tagged, m } from './kit';

/** The camera on its gantry, aimed at the pick zone; the ring light glows while 조명 is on. */
function Camera({ world }: { world: RefObject<WorldState | null> }) {
  const C = B_CAMERA;
  const ring = useRef<MeshStandardMaterial>(null);
  const lamp = useRef<PointLight>(null);
  useFrame(() => {
    const on = !!world.current?.cell?.line.out['조명'];
    if (ring.current) ring.current.emissiveIntensity = on ? 2.4 : 0.05;
    if (lamp.current) lamp.current.intensity = on ? 0.05 : 0;
  });
  const d = [C.lookAt[0] - C.x, C.lookAt[1] - C.y, C.lookAt[2] - C.z];
  const tilt = Math.atan2(d[1], -d[2]);
  return (
    <group>
      {C.posts.map((x) => (
        <Post key={x} x={x} y={C.y} top={C.beamZ + 6} s={12} />
      ))}
      <Prof a={[C.posts[0] - 6, C.y, C.beamZ]} b={[C.posts[1] + 6, C.y, C.beamZ]} w={12} />
      {/* Corner gussets where the beam meets the posts. */}
      {C.posts.map((x, i) => (
        <RBox key={x} at={[x + (i ? -9 : 9), C.y, C.beamZ - 9]} size={[10, 3, 10]} radius={0.6}>
          <Steel color="#a7afb8" />
        </RBox>
      ))}
      {/* Hanger from the beam down to the camera. */}
      <RBox at={[C.x, C.y, (C.z + C.beamZ) / 2 + 4]} size={[6, 14, C.beamZ - C.z - 4]} radius={0.8}>
        <Steel color="#8c949d" />
      </RBox>
      <group position={[m(C.x), m(C.y), m(C.z)]} rotation={[tilt, 0, 0]}>
        <RBox at={[0, 0, 8]} size={[30, 34, 24]} radius={3}>
          <Paint color="#2b3138" rough={0.35} />
        </RBox>
        <RBox at={[0, 0, 21]} size={[18, 22, 3]} radius={1}>
          <Steel color="#9aa3ad" />
        </RBox>
        <Turned at={[0, 0, -12]} profile={pill(7.5, 8, 1)} segments={24}>
          <meshStandardMaterial color="#14171b" metalness={0.5} roughness={0.25} />
        </Turned>
        <mesh position={[0, 0, m(-12.2)]} rotation={[0, 0, 0]}>
          <circleGeometry args={[m(5), 24]} />
          <meshStandardMaterial color="#1d4e7a" metalness={0.9} roughness={0.05} />
        </mesh>
        {/* Ring light round the lens. */}
        <mesh position={[0, 0, m(-6)]}>
          <torusGeometry args={[m(13), m(2.6), 12, 40]} />
          <meshStandardMaterial ref={ring} color="#f4f7fb" emissive="#ffffff" emissiveIntensity={0.05} roughness={0.3} toneMapped={false} />
        </mesh>
        <pointLight ref={lamp} position={[0, 0, m(-20)]} distance={0.3} decay={2} intensity={0} color="#f4f8ff" />
      </group>
      <Hose pts={[[C.x + 12, C.y, C.z + 20], [C.x + 20, C.y + 6, C.beamZ - 4], [C.posts[1] - 10, C.y + 7, C.beamZ - 4], [C.posts[1] + 7, C.y + 6, C.beamZ - 20], [C.posts[1] + 8, C.y + 6, F + 10]]} r={1.4} color="#22272d" />
    </group>
  );
}

export function VisionCell({ world, onHover }: { world: RefObject<WorldState | null>; onHover: (n: string | null) => void }) {
  const l = cellLayout('vision');
  const bins = ['함 1', '함 2', '함 3'].map((n) => l.places[n]);
  const chute = l.places['불량 슈트'];
  return (
    <group>
      <Tagged name="컨베이어" onHover={onHover}>
        <Conveyor world={world} l={l} />
      </Tagged>
      <Tagged name="위 카메라" onHover={onHover}>
        <Camera world={world} />
      </Tagged>
      <Tagged name="분류함" onHover={onHover}>
        <Stand x0={102} x1={148} y0={62} y1={208} top={bins[0].z} s={8} />
        {bins.map((b, i) => (
          <Bin key={i} x0={b.x - 21} x1={b.x + 21} y0={b.y - 21} y1={b.y + 21} z0={b.z} z1={b.z + 22} color="#8d99a6" label={String(i + 1)} />
        ))}
      </Tagged>
      <Tagged name="불량 슈트" onHover={onHover}>
        {/* A yellow chute sloping down into a grey box on a low stand. */}
        <Stand x0={88} x1={132} y0={-182} y1={-138} top={chute.z} s={8}>
          <RBox at={[110, -160, chute.z - 2]} size={[44, 44, 4]} radius={0.6}>
            <Steel color="#6b737c" />
          </RBox>
        </Stand>
        <Bin x0={89} x1={131} y0={-181} y1={-139} z0={chute.z} z1={chute.z + 26} color="#5d6670" />
        <group position={[m(110), m(-160), m(14)]} rotation={[0, 0.5, 0]}>
          <RBox size={[56, 46, 2.5]} radius={0.6}>
            <Paint color="#f2c200" />
          </RBox>
          {[-1, 1].map((s) => (
            <RBox key={s} at={[0, s * 23, 5]} size={[56, 2.5, 12]} radius={0.6}>
              <Paint color="#f2c200" />
            </RBox>
          ))}
        </group>
      </Tagged>
      <Hopper x={225} y={-440} z={52} />
    </group>
  );
}
