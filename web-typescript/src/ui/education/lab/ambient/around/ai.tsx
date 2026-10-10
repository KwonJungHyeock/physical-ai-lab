'use client';

/**
 * 피지컬 AI 연구소: round the AI kit (robot frame, mm; see ../Around.tsx).
 */

import { useMemo } from 'react';
import { DoubleSide } from 'three';

import { DESK_Z } from '@/engine/simulator/board';

import { RBox, canvasTexture } from '../../../../simulator/stage/sceneKit';
import Bench from '../Bench';
import { Sign, Tape, m } from '../../CellKit';
import type { SiteLook } from '../Ground';
import { Blob } from '../Ground';
import { Hall } from '../Hall';
import Model from '../Model';
import { Leds, Monitor, RouteAgv, WorkingArm } from '../Props';

type Xy = readonly [number, number];

/** The black phenolic lab bench the kit stands on: its top (DESK_Z, under the kit's plate) above the lab floor, mm. */
export const AI_BENCH_MM = 750;
/** The lab floor in the robot frame, mm. */
const FLOOR_Z = DESK_Z - AI_BENCH_MM;

export const AI_LOOK: SiteLook = { sky: '#d9dde6', floor: 'tiles', groundZ: FLOOR_Z, fog: [3.2, 8] };

/* --- AI 연구소 ----------------------------------------------------------------------------- */

/** A lane track on the floor at real size for the self-driving myAGV: a dark loop with white edges and a dashed centre line, a stop line. */
function Track({ x0, x1, y0, y1, w = 450 }: { x0: number; x1: number; y0: number; y1: number; w?: number }) {
  const h = w / 2;
  const ring = (d: number): [number, number][] => [
    [x0 - d, y0 - d],
    [x1 + d, y0 - d],
    [x1 + d, y1 + d],
    [x0 - d, y1 + d],
  ];
  const sides = (pts: [number, number][]) => pts.map((p, i) => [p, pts[(i + 1) % pts.length]] as const);
  // The dashed centre line: 150 mm dashes every 300 mm along each side.
  const dashes = sides(ring(0)).flatMap(([a, b]) => {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n = Math.floor(len / 300);
    return Array.from({ length: n }, (_, k) => {
      const t0 = (k * 300 + 75) / len;
      const t1 = (k * 300 + 225) / len;
      return [
        [a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0],
        [a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1],
      ] as [[number, number], [number, number]];
    });
  });
  return (
    <group>
      <mesh position={[m((x0 + x1) / 2), m((y0 + y1) / 2), m(0.3)]} receiveShadow>
        <planeGeometry args={[m(x1 - x0 + w), m(y1 - y0 + w)]} />
        <meshStandardMaterial color="#3a4048" roughness={0.85} />
      </mesh>
      <mesh position={[m((x0 + x1) / 2), m((y0 + y1) / 2), m(0.4)]} receiveShadow>
        <planeGeometry args={[m(x1 - x0 - w), m(y1 - y0 - w)]} />
        <meshStandardMaterial color="#d9dde2" roughness={0.6} />
      </mesh>
      {[...sides(ring(h - 20)), ...sides(ring(-h + 20))].map(([a, b], i) => (
        <Tape key={i} a={a} b={b} w={25} color="#ffffff" />
      ))}
      {dashes.map(([a, b], i) => (
        <Tape key={`d${i}`} a={a} b={b} w={18} color="#f2c230" />
      ))}
      {/* A stop line across the lane, with a small traffic light beside the lane. */}
      <Tape a={[x1 - 260, y0 - h + 20]} b={[x1 - 260, y0 + h - 20]} w={40} color="#ffffff" />
      <TrafficLight at={[x1 + h + 150, y1 - 250]} />
    </group>
  );
}

/** A small traffic light on a pole for the AGV's lane (what the vision model learns to read), its lamps facing −y. */
function TrafficLight({ at }: { at: Xy }) {
  const [x, y] = at;
  return (
    <group>
      <RBox at={[x, y, 10]} size={[140, 140, 20]} radius={4}>
        <meshStandardMaterial color="#2b3038" roughness={0.6} />
      </RBox>
      <RBox at={[x, y, 300]} size={[24, 24, 580]} radius={4}>
        <meshStandardMaterial color="#59616b" roughness={0.5} metalness={0.5} />
      </RBox>
      <RBox at={[x, y - 10, 650]} size={[90, 60, 220]} radius={10}>
        <meshStandardMaterial color="#1f2328" roughness={0.5} />
      </RBox>
      {[
        ['#e5484d', 0.2],
        ['#ffb020', 0.2],
        ['#22c55e', 1.6],
      ].map(([c, k], i) => (
        <mesh key={i} position={[m(x), m(y - 41), m(715 - i * 65)]} rotation={[Math.PI / 2, 0, 0]}>
          <circleGeometry args={[m(24), 20]} />
          <meshStandardMaterial color="#111" emissive={String(c)} emissiveIntensity={Number(k)} toneMapped={false} side={DoubleSide} />
        </mesh>
      ))}
    </group>
  );
}

/** A perforated steel door panel: black sheet with round holes (transparent), as a texture. */
function usePerforated() {
  return useMemo(
    () =>
      canvasTexture('rack-perf', 256, 256, (g) => {
        g.fillStyle = '#16191d';
        g.fillRect(0, 0, 256, 256);
        g.globalCompositeOperation = 'destination-out';
        for (let r = 0; r < 16; r += 1)
          for (let c = 0; c < 16; c += 1) {
            g.beginPath();
            g.arc(c * 16 + 8 + (r % 2) * 8, r * 16 + 8, 5.5, 0, Math.PI * 2);
            g.fill();
          }
      }),
    [],
  );
}

/** What fills a rack, bottom up: [height in rack units (44.45 mm), kind]. */
const RACK_FILL: readonly (readonly [number, 'ups' | 'server' | 'gpu' | 'switch' | 'patch' | 'blank'])[] = [
  [3, 'ups'],
  [1, 'blank'],
  [4, 'gpu'],
  [4, 'gpu'],
  [2, 'server'],
  [2, 'server'],
  [2, 'server'],
  [1, 'blank'],
  [2, 'server'],
  [2, 'server'],
  [1, 'blank'],
  [1, 'patch'],
  [1, 'switch'],
  [1, 'switch'],
  [1, 'patch'],
];
const U = 44.45;
/** Each unit's kind, size and centre height in the rack (the rails start 100 mm up), mm. */
const RACK_UNITS = RACK_FILL.map(([n, kind], i) => {
  const below = RACK_FILL.slice(0, i).reduce((s, [k]) => s + k, 0);
  return { n, kind, z: 100 + (below + n / 2) * U };
});

/**
 * A 42U server rack at real size (600 wide, 1070 deep, 2000 tall), its front facing +x before the turn
 * `yaw`: a black frame with side panels on a plinth, GPU and storage servers, switches and patch panels
 * with their status lights blinking, and the front door — perforated steel, or tinted glass.
 */
function ServerRack({ at, yaw = 0, glass = false }: { at: Xy; yaw?: number; glass?: boolean }) {
  const perf = usePerforated();
  const W = 600;
  const D = 1070;
  const H = 2000;
  const fx = D / 2;
  const body = <meshStandardMaterial color="#22262c" roughness={0.5} metalness={0.35} />;
  return (
    <group position={[m(at[0]), m(at[1]), 0]} rotation={[0, 0, yaw]}>
      {/* plinth, side panels, roof, the rear */}
      <RBox at={[0, 0, 40]} size={[D - 20, W - 20, 80]} radius={4}>
        <meshStandardMaterial color="#14171b" roughness={0.7} />
      </RBox>
      {[-1, 1].map((s) => (
        <RBox key={s} at={[0, s * (W / 2 - 10), H / 2 + 40]} size={[D, 20, H - 80]} radius={4}>
          {body}
        </RBox>
      ))}
      <RBox at={[0, 0, H - 15]} size={[D, W, 30]} radius={4}>
        {body}
      </RBox>
      <RBox at={[-D / 2 + 10, 0, H / 2 + 40]} size={[20, W - 40, H - 80]} radius={2}>
        {body}
      </RBox>
      {/* the 19-inch rails and the equipment in them */}
      {[-1, 1].map((s) => (
        <RBox key={`r${s}`} at={[fx - 90, s * 245, H / 2]} size={[20, 30, H - 120]} radius={2}>
          <meshStandardMaterial color="#3b4048" roughness={0.5} metalness={0.5} />
        </RBox>
      ))}
      {RACK_UNITS.map(({ n, kind, z }, i) => {
        const h = n * U - 3;
        const face = kind === 'gpu' ? '#3a3f47' : kind === 'server' ? '#c5cbd2' : kind === 'ups' ? '#2b2f35' : kind === 'switch' ? '#1d2126' : kind === 'patch' ? '#1d2126' : '#15181c';
        return (
          <group key={i}>
            <RBox at={[fx - 100 - (D - 300) / 2, 0, z]} size={[D - 300, 440, h]} radius={2}>
              <meshStandardMaterial color={kind === 'server' ? '#9aa2ab' : '#2a2e34'} roughness={0.5} metalness={0.4} />
            </RBox>
            <RBox at={[fx - 95, 0, z]} size={[10, 482, h]} radius={1.5}>
              <meshStandardMaterial color={face} roughness={kind === 'server' ? 0.35 : 0.55} metalness={kind === 'server' ? 0.6 : 0.3} />
            </RBox>
            {kind === 'gpu' && [0, 1, 2].map((k) => <RBox key={k} at={[fx - 89, -120 + k * 120, z]} size={[2, 100, h - 30]} radius={1}><meshStandardMaterial color="#1b1e22" roughness={0.8} /></RBox>)}
            {kind === 'server' && [0, 1, 2, 3, 4, 5].map((k) => <RBox key={k} at={[fx - 89, -170 + k * 50, z]} size={[2, 42, h - 18]} radius={1}><meshStandardMaterial color="#2a2e34" roughness={0.6} /></RBox>)}
            {kind === 'patch' && (
              // patch cords looping from the panel down to the switch below
              <group>
                {[-150, -100, -50, 0, 50, 100, 150].map((dy, k) => (
                  <RBox key={dy} at={[fx - 80, dy + 12, z - 22]} size={[10, 6, 52]} radius={2} shadow={false}>
                    <meshStandardMaterial color={['#2f5be7', '#f2c230', '#2f5be7', '#e5484d', '#22c55e', '#2f5be7', '#f2c230'][k]} roughness={0.6} />
                  </RBox>
                ))}
              </group>
            )}
            {kind !== 'blank' && kind !== 'patch' && (
              <Leds at={[fx - 89.5, kind === 'switch' ? -170 : 180]} z={z - (kind === 'switch' ? 6 : 8)} cols={kind === 'switch' ? 24 : 3} rows={kind === 'switch' ? 2 : kind === 'ups' ? 4 : 2} pitch={kind === 'switch' ? 14 : 9} />
            )}
          </group>
        );
      })}
      {/* the front door: a frame with a perforated or a glass panel, and its handle */}
      <group position={[m(fx + 5), 0, 0]}>
        {[-1, 1].map((s) => (
          <RBox key={s} at={[0, s * (W / 2 - 20), H / 2 + 40]} size={[14, 40, H - 80]} radius={3}>
            {body}
          </RBox>
        ))}
        {[110, H - 50].map((z) => (
          <RBox key={z} at={[0, 0, z]} size={[14, W, 60]} radius={3}>
            {body}
          </RBox>
        ))}
        <mesh position={[m(2), 0, m(H / 2 + 30)]} rotation={[Math.PI / 2, Math.PI / 2, 0]}>
          <planeGeometry args={[m(W - 80), m(H - 220)]} />
          {glass ? (
            <meshPhysicalMaterial color="#9fb3c8" transparent opacity={0.22} roughness={0.05} clearcoat={1} side={DoubleSide} />
          ) : (
            <meshStandardMaterial map={perf} transparent alphaTest={0.4} roughness={0.5} metalness={0.4} side={DoubleSide} />
          )}
        </mesh>
        <RBox at={[18, -W / 2 + 50, H / 2 + 60]} size={[20, 24, 160]} radius={6}>
          <meshStandardMaterial color="#aeb6bf" metalness={0.8} roughness={0.3} />
        </RBox>
      </group>
      <Blob at={[0, 0]} w={D} d={W} k={0.3} />
    </group>
  );
}

/** A ladder cable tray hung under the ceiling along x from x0 to x1 at y, `z` mm up (where the racks' cables run). */
function CableTray({ x0, x1, y, z }: { x0: number; x1: number; y: number; z: number }) {
  const n = Math.floor((x1 - x0) / 300);
  return (
    <group>
      {[-1, 1].map((s) => (
        <RBox key={s} at={[(x0 + x1) / 2, y + s * 150, z]} size={[x1 - x0, 8, 80]} radius={2}>
          <meshStandardMaterial color="#b9c0c7" metalness={0.6} roughness={0.4} />
        </RBox>
      ))}
      {Array.from({ length: n + 1 }, (_, k) => x0 + k * 300).map((x) => (
        <RBox key={x} at={[x, y, z - 30]} size={[30, 300, 12]} radius={2} shadow={false}>
          <meshStandardMaterial color="#b9c0c7" metalness={0.6} roughness={0.4} />
        </RBox>
      ))}
      {[-60, -20, 25, 70].map((dy, k) => (
        <RBox key={dy} at={[(x0 + x1) / 2, y + dy, z - 12]} size={[x1 - x0 - 40, 26, 22]} radius={10} shadow={false}>
          <meshStandardMaterial color={['#2f5be7', '#1d2126', '#f2c230', '#1d2126'][k]} roughness={0.7} />
        </RBox>
      ))}
    </group>
  );
}

/** A keyboard and a mouse on a desk top `z` mm up, in front of a screen facing +x turned by `yaw`. */
function Keyboard({ at, z, yaw = 0 }: { at: Xy; z: number; yaw?: number }) {
  return (
    <group position={[m(at[0]), m(at[1]), m(z)]} rotation={[0, 0, yaw]}>
      <RBox at={[0, 0, 12]} size={[150, 440, 24]} radius={6}>
        <meshStandardMaterial color="#2b3038" roughness={0.6} />
      </RBox>
      <RBox at={[10, 300, 16]} size={[110, 64, 32]} radius={20}>
        <meshStandardMaterial color="#2b3038" roughness={0.5} />
      </RBox>
    </group>
  );
}

/**
 * The lab round the AI kit's bench, at real size on the floor AI_BENCH_MM below the bench top: the
 * self-driving myAGV on its lane track, a second kit station with its arm at work, the server racks
 * with the cable tray, the researchers' desks with screens and chairs, a parts shelf, a researcher.
 */
export function AiAround() {
  return (
    <group position={[0, 0, m(FLOOR_Z)]}>
      <Hall band="#7a3fd1" wall="#e9eaf0" x={-2600} y={2600} h={3000} />
      {/* The self-driving lane on the floor to the right, the AGV driving it. */}
      <Track x0={-1150} x1={-250} y0={1300} y1={2050} />
      <RouteAgv
        route={[
          [-1150, 1300],
          [-250, 1300],
          [-250, 2050],
          [-1150, 2050],
        ]}
        speed={220}
        led="#7a3fd1"
      />
      {/* A second kit station behind: the same black bench, an arm sorting blocks, its screen. */}
      <group position={[0, 0, m(AI_BENCH_MM)]}>
        <Bench x0={-1550} x1={-850} y0={-750} y1={650} h={AI_BENCH_MM} kind="phenolic" />
        <WorkingArm
          at={[-1300, -150]}
          yaw={0.2}
          table={[396, 510, 20]}
          tableAt={[142, 5]}
          job={{
            pick: [150, -95, 25],
            place: [150, 95, 25],
            period: 8,
            block: '#7a3fd1',
          }}
          phase={1}
        />
        <Monitor at={[-1420, 430]} yaw={-0.3} w={470} kind="vision" accent="#7a3fd1" title="객체 인식 · 실시간" />
      </group>
      {/* The server racks against the back wall, the cable tray from them over the room. */}
      <ServerRack at={[-2015, 1300]} />
      <ServerRack at={[-2015, 1920]} glass />
      <CableTray x0={-2560} x1={-600} y={1610} z={2650} />
      <group position={[m(-2550), m(1610), m(2280)]} scale={2}>
        <Sign at={[0, 0, 0]} yaw={Math.PI / 2} w={320} h={60} lines={['GPU 서버 · 학습용']} fg="#ffffff" bg="#1d2126" />
      </group>
      {/* The researchers' desk along the back wall: two screens, a keyboard, a chair. */}
      <Model group="ai" name="desk" at={[-2100, -1650]} yaw={Math.PI / 2} />
      <Monitor at={[-2320, -2050]} z={788} yaw={0.15} w={520} kind="plot" accent="#7a3fd1" title="학습 곡선 · 정확도" />
      <Monitor at={[-2320, -1450]} z={788} yaw={-0.1} w={520} kind="log" accent="#7a3fd1" title="학습 로그 · 모델 v3" />
      <Keyboard at={[-1950, -1700]} z={788} />
      <Model group="ai" name="chair" at={[-1450, -1650]} yaw={-Math.PI / 2 - 0.3} />
      {/* A parts shelf between them, with totes. */}
      <Model group="ai" name="shelves" at={[-2330, 150]} yaw={Math.PI / 2} />
      <Model group="ai" name="tote" at={[-1950, 600]} yaw={Math.PI / 2 + 0.2} />
      {/* A small work desk by the lane: a screen, a chair, a plant in the corner. */}
      <Model group="ai" name="workDesk" at={[650, 2180]} />
      <Model group="ai" name="screen" at={[650, 2380]} z={745} color="#2b2f36" />
      <Model group="ai" name="chair" at={[650, 1650]} yaw={Math.PI + 0.4} />
      <Model group="ai" name="plant" at={[1500, 2300]} h={1100} />
      {/* The lab's sign on the back wall, 1.3 m wide (drawn at a quarter and scaled up: its texture stays small). */}
      <group position={[m(-2550), m(-500), m(2250)]} scale={4}>
        <Sign at={[0, 0, 0]} yaw={Math.PI / 2} w={325} h={105} lines={['피지컬 AI 연구소', 'Physical AI Lab', '보고 · 판단하고 · 움직인다']} fg="#ffffff" bg="#7a3fd1" />
      </group>
      {/* A researcher to the side, by the lane, watching the AGV. */}
      <Model group="people" name="customer" at={[-1000, 2450]} yaw={0.1} pose="Idle" />
    </group>
  );
}
