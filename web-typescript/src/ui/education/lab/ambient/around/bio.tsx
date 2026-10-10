'use client';

/**
 * 바이오·헬스케어: round the sample cell (robot frame, mm; see ../Around.tsx).
 */

import { RBox, Turned, pill, vessel } from '../../../../simulator/stage/sceneKit';
import { Sign, Tape, m } from '../../CellKit';
import type { SiteLook } from '../Ground';
import { Blob } from '../Ground';
import { Hall } from '../Hall';
import { Leds, Monitor, RouteAgv, Steam, Turn, WorkingArm } from '../Props';

type Xy = readonly [number, number];

export const BIO_LOOK: SiteLook = { sky: '#dfe6ec', floor: 'vinyl' };

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
      <Turned
        at={[0, 0, 18]}
        profile={[
          [0, 0],
          [24, 0],
          [22, 8],
          [15, 26],
          [0, 26],
        ]}
      >
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
      <WorkingArm
        at={[-150, 980]}
        yaw={-Math.PI / 2}
        job={{
          pick: [150, -95, 25],
          place: [150, 95, 25],
          period: 10,
          block: '#e9edf3',
        }}
        phase={3}
        table={[380, 260, 110]}
      />
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
