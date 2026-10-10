'use client';

/**
 * 스마트팜: round the sorting cell (robot frame, mm; see ../Around.tsx).
 */

import { createInstances } from '@react-three/drei';

import { RBox } from '../../../../simulator/stage/sceneKit';
import { Steel, m } from '../../CellKit';
import type { SiteLook } from '../Ground';
import { Blob } from '../Ground';
import { Hall } from '../Hall';
import { Fan, Monitor, RouteAgv, Sway, WorkingArm } from '../Props';

export const FARM_LOOK: SiteLook = { sky: '#dfe9e4', floor: 'greenhouse' };

const [StemSet, Stem] = createInstances();
const [LeafSet, Leaf] = createInstances();
const [FruitSet, Fruit] = createInstances();

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
      <WorkingArm
        at={[-700, 230]}
        yaw={-0.2}
        job={{
          pick: [150, -95, 26],
          place: [150, 95, 26],
          period: 9,
          item: 'ball',
          block: '#d8331f',
        }}
        phase={4}
      />
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
