'use client';

/**
 * 피지컬 AI 연구소: round the AI kit (robot frame, mm; see ../Around.tsx).
 */

import { RBox } from '../../../../simulator/stage/sceneKit';
import { Sign, Tape, m } from '../../CellKit';
import type { SiteLook } from '../Ground';
import { Blob } from '../Ground';
import { Hall } from '../Hall';
import { Leds, Monitor, RouteAgv, WorkingArm } from '../Props';

type Xy = readonly [number, number];

export const AI_LOOK: SiteLook = { sky: '#d9dde6', floor: 'tiles' };

/* --- AI 연구소 ----------------------------------------------------------------------------- */

/** A small lane track (a loop with white edges and a dashed middle) for the self-driving AGV. */
function Track({ x0, x1, y0, y1, w = 300 }: { x0: number; x1: number; y0: number; y1: number; w?: number }) {
  const h = w / 2;
  const edges: [Xy, Xy][] = [
    [
      [x0 - h, y0 - h],
      [x1 + h, y0 - h],
    ],
    [
      [x1 + h, y0 - h],
      [x1 + h, y1 + h],
    ],
    [
      [x1 + h, y1 + h],
      [x0 - h, y1 + h],
    ],
    [
      [x0 - h, y1 + h],
      [x0 - h, y0 - h],
    ],
    [
      [x0 + h, y0 + h],
      [x1 - h, y0 + h],
    ],
    [
      [x1 - h, y0 + h],
      [x1 - h, y1 - h],
    ],
    [
      [x1 - h, y1 - h],
      [x0 + h, y1 - h],
    ],
    [
      [x0 + h, y1 - h],
      [x0 + h, y0 + h],
    ],
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
      <WorkingArm
        at={[-560, -40]}
        yaw={0.15}
        job={{
          pick: [150, -95, 25],
          place: [150, 95, 25],
          period: 8,
          block: '#7a3fd1',
        }}
        phase={1}
      />
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
