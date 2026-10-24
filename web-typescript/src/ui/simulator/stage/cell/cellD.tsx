'use client';

/**
 * 실습 셀 D 머신 텐딩: a CNC machine in front of the robot — its enclosure (light grey, a dark plinth
 * and top band), the sliding front door with a window (the 문 output opens it), inside a three-jaw chuck
 * standing up on the spindle (the 척 output closes the jaws; it spins while 가공 중) under a lamp and a
 * coolant nozzle, the control panel on its side with a screen, and its own stack light — standing at
 * the robot's right with the door towards it; the raw-part jig and the finished-part tray on stands in
 * front, a small waiting stand by the door (where the next blank waits, D6), and a light curtain across
 * the operator's way to them.
 */

import { useFrame } from '@react-three/fiber';
import { useRef, type RefObject } from 'react';
import type { Group, MeshStandardMaterial } from 'three';

import { D_MACHINE, D_POSE, D_WAIT, cellLayout } from '@/engine/simulator/cell/cells';
import type { WorldState } from '@/engine/simulator/sim';

import { RBox, Turned, pill } from '../sceneKit';
import { F, Hose, MarkedPlate, Paint, Skin, Stand, Steel, Tagged, m, travel, useSheet } from './kit';

const SKIN = '#d6dade';
const DARK = '#4a5059';

/** Lamp and nozzle height inside the work area, mm. */
const INSIDE = 180;

/** The door: a panel with a tinted window and a roof flap (the opening runs up into the roof), sliding along +y as 문 opens. */
function Door({ world }: { world: RefObject<WorldState | null> }) {
  const M = D_MACHINE;
  const g = useRef<Group>(null);
  const w = M.door.y1 - M.door.y0;
  useFrame(() => {
    if (g.current) g.current.position.y = m(travel(world, '문') * w);
  });
  return (
    <group ref={g}>
      <RBox at={[M.x0 - 2, 0, M.door.z1 / 2]} size={[4, w, M.door.z1]} radius={1}>
        <Skin color={SKIN} />
      </RBox>
      <RBox at={[(M.x0 + 290) / 2, 0, M.top - 3]} size={[290 - M.x0, w, 4]} radius={1}>
        <Skin color={SKIN} />
      </RBox>
      <mesh position={[m(M.x0 - 4.2), 0, m(M.door.z1 * 0.58)]} rotation={[Math.PI / 2, -Math.PI / 2, 0]}>
        <planeGeometry args={[m(w - 22), m(M.door.z1 * 0.52)]} />
        <meshPhysicalMaterial color="#5a6d7c" transparent opacity={0.45} roughness={0.05} metalness={0.2} />
      </mesh>
      <RBox at={[M.x0 - 6, -w / 2 + 10, M.door.z1 * 0.45]} size={[4, 5, 40]} radius={1.5}>
        <Steel color="#2a2f36" />
      </RBox>
    </group>
  );
}

/** The chuck: body on the spindle, three jaws that close as 척 locks; it turns while the machine runs. */
function Chuck({ world }: { world: RefObject<WorldState | null> }) {
  const C = D_MACHINE.chuck;
  const spin = useRef<Group>(null);
  const jaws = useRef<(Group | null)[]>([]);
  useFrame((_, dt) => {
    const line = world.current?.cell?.line;
    const t = travel(world, '척');
    jaws.current.forEach((j) => {
      if (j) j.position.x = m(14 - t * 4.5);
    });
    if (spin.current && line?.in['가공 중']) spin.current.rotation.z += Math.min(dt, 0.1) * 18;
  });
  return (
    <group position={[m(C.x), m(C.y), 0]}>
      <Turned profile={pill(C.r + 6, 8, 1)} segments={40}>
        <Steel color="#6b737c" />
      </Turned>
      <group ref={spin}>
        <Turned at={[0, 0, 8]} profile={pill(C.r, C.top - 14, 1.5)} segments={48}>
          <meshStandardMaterial color="#b8c0c8" metalness={0.8} roughness={0.25} />
        </Turned>
        {[0, 1, 2].map((k) => (
          <group key={k} rotation={[0, 0, (k * 2 * Math.PI) / 3]}>
            <RBox at={[11, 0, C.top - 6.5]} size={[16, 3, 1]} radius={0.3}>
              <meshStandardMaterial color="#5b636d" metalness={0.6} roughness={0.4} />
            </RBox>
            <group
              ref={(r) => {
                jaws.current[k] = r;
              }}
            >
              <RBox at={[0, 0, C.top - 2]} size={[6, 7, 8]} radius={0.8}>
                <meshStandardMaterial color="#d7dde3" metalness={0.75} roughness={0.2} />
              </RBox>
            </group>
          </group>
        ))}
      </group>
    </group>
  );
}

/** The machine's screen: a small CNC program page, and its state line. */
function usePanelFace() {
  return useSheet('cnc-panel', 44, 30, (ctx, w, h) => {
    ctx.fillStyle = '#0d1a24';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#5ee0a0';
    ctx.font = `${h * 0.075}px monospace`;
    ['O0001 (TURN)', 'G28 U0 W0', 'T0101', 'G97 S1200 M03', 'G00 X52 Z2', 'G01 Z-30 F0.2', 'M30'].forEach((t, i) => ctx.fillText(t, w * 0.05, h * (0.14 + i * 0.1)));
    ctx.fillStyle = '#1f3b52';
    ctx.fillRect(0, h * 0.84, w, h * 0.16);
    ctx.fillStyle = '#cfe6ff';
    ctx.font = `bold ${h * 0.09}px sans-serif`;
    ctx.fillText('AUTO  ·  CYCLE', w * 0.05, h * 0.95);
  });
}

/** The machine's own stack light: green while it runs, amber when a part is done. */
function MachineLight({ world }: { world: RefObject<WorldState | null> }) {
  const mats = useRef<(MeshStandardMaterial | null)[]>([]);
  useFrame(() => {
    const line = world.current?.cell?.line;
    const busy = !!line?.in['가공 중'];
    const done = !!line?.in['가공 끝'];
    const blink = Math.floor((line?.t ?? 0) * 2) % 2 === 0;
    [busy, done && blink].forEach((on, i) => {
      const mat = mats.current[i];
      if (mat) mat.emissiveIntensity = on ? 2.2 : 0.06;
    });
  });
  const M = D_MACHINE;
  return (
    <group position={[m(M.x1 - 14), m(M.y1 - 16), m(M.top)]}>
      <Turned profile={pill(2.5, 16, 0.6)} segments={12}>
        <Steel color="#2a2f36" />
      </Turned>
      {['#29c46a', '#f5a524'].map((c, i) => (
        <Turned key={c} at={[0, 0, 16 + i * 11]} profile={pill(5.5, 10.5, 1.2)} segments={20}>
          <meshStandardMaterial
            ref={(r) => {
              mats.current[i] = r;
            }}
            color={c}
            emissive={c}
            emissiveIntensity={0.06}
            roughness={0.3}
            toneMapped={false}
          />
        </Turned>
      ))}
    </group>
  );
}

function Machine() {
  const M = D_MACHINE;
  const panel = usePanelFace();
  // The skins stop 2 mm under the top band, so no two faces share a plane.
  const H = M.top - 2 - F;
  const side = (y0: number, y1: number) => (
    <RBox at={[(M.x0 + 290) / 2, (y0 + y1) / 2, F + 18 + (H - 18) / 2]} size={[290 - M.x0, y1 - y0, H - 18]} radius={3}>
      <Skin color={SKIN} />
    </RBox>
  );
  return (
    <group>
      {/* Plinth, the enclosure's back block, its two cheeks, the roof over the opening, a dark top band. */}
      <RBox at={[(M.x0 + M.x1) / 2, 0, F + 9]} size={[M.x1 - M.x0 + 6, M.y1 - M.y0 + 6, 18]} radius={2}>
        <Skin color={DARK} rough={0.5} />
      </RBox>
      <RBox at={[(290 + M.x1) / 2, 0, F + 18 + (H - 18) / 2]} size={[M.x1 - 290, M.y1 - M.y0, H - 18]} radius={3}>
        <Skin color={SKIN} />
      </RBox>
      {side(M.y0, M.door.y0)}
      {side(M.door.y1, M.y1)}
      {/* The top band round the roof opening over the work area. */}
      <RBox at={[(290 + M.x1) / 2, 0, M.top - 8.5]} size={[M.x1 - 290 + 2, M.y1 - M.y0 + 2, 17]} radius={3}>
        <Skin color={DARK} />
      </RBox>
      {[
        [M.y0 - 1, M.door.y0],
        [M.door.y1, M.y1 + 1],
      ].map(([y0, y1]) => (
        <RBox key={y0} at={[(M.x0 + 290) / 2, (y0 + y1) / 2, M.top - 8.5]} size={[290 - M.x0, y1 - y0, 17]} radius={3}>
          <Skin color={DARK} />
        </RBox>
      ))}
      {/* The work area inside: a dark bed and stainless walls, a lamp, a coolant nozzle. */}
      <RBox at={[(M.x0 + 290) / 2, 0, F + 18 + (-F - 18) / 2]} size={[290 - M.x0, M.door.y1 - M.door.y0, -F - 18]} radius={1}>
        <Paint color="#2f343b" rough={0.6} />
      </RBox>
      <mesh position={[m(289.5), 0, m(M.door.z1 / 2)]} rotation={[Math.PI / 2, -Math.PI / 2, 0]}>
        <planeGeometry args={[m(M.door.y1 - M.door.y0), m(M.door.z1)]} />
        <meshStandardMaterial color="#8d959e" metalness={0.6} roughness={0.35} />
      </mesh>
      <pointLight position={[m(250), 0, m(INSIDE - 12)]} distance={0.22} decay={2} intensity={0.05} color="#fff3dc" />
      <RBox at={[262, 0, INSIDE - 4]} size={[40, 10, 4]} radius={1}>
        <meshStandardMaterial color="#fff6e6" emissive="#fff1d6" emissiveIntensity={1.2} toneMapped={false} />
      </RBox>
      <Hose pts={[[285, 40, INSIDE - 6], [270, 30, 95], [258, 14, 60], [253, 7, 44]]} r={1.6} color="#4aa3e0" />
      {/* Door rail along the top of the opening, out over the right cheek. */}
      <RBox at={[M.x0 - 3, (M.door.y0 + M.door.y1 + 124) / 2, M.door.z1 + 4]} size={[5, M.door.y1 - M.door.y0 + 124, 6]} radius={1}>
        <Steel color="#8c949d" />
      </RBox>
      {/* Control panel on the right side: a screen and keys, a red stop. */}
      <group position={[m(330), m(M.y1 + 6), m(110)]}>
        <RBox size={[66, 12, 86]} radius={3}>
          <Paint color="#2a2f36" rough={0.5} />
        </RBox>
        <mesh position={[0, m(6.2), m(14)]} rotation={[-Math.PI / 2, Math.PI, 0]}>
          <planeGeometry args={[m(48), m(32)]} />
          <meshStandardMaterial map={panel} emissive="#ffffff" emissiveMap={panel} emissiveIntensity={0.6} toneMapped={false} />
        </mesh>
        {[-18, -6, 6, 18].map((x) => (
          <RBox key={x} at={[x, 6.5, -20]} size={[8, 1.5, 6]} radius={0.6}>
            <Paint color="#9aa3ad" />
          </RBox>
        ))}
        <mesh position={[m(24), m(8), m(-33)]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[m(5), m(5.5), m(4), 20]} />
          <Paint color="#d91e18" rough={0.3} />
        </mesh>
      </group>
      {/* Coolant tank at the back. */}
      <RBox at={[M.x1 + 22, -60, F + 30]} size={[36, 90, 60]} radius={3}>
        <Paint color="#5d6670" rough={0.45} />
      </RBox>
    </group>
  );
}

/** A light curtain across the operator's way to the trays: two yellow posts with their dark lens strips facing each other, faint beams between. */
function LightCurtain() {
  const x = 215;
  const ys = [-80, 160];
  return (
    <group>
      {ys.map((y, i) => (
        <group key={y}>
          <RBox at={[x, y, F + 4]} size={[22, 22, 8]} radius={1}>
            <Steel color="#3a3f46" />
          </RBox>
          <RBox at={[x, y, (F + 8 + 110) / 2]} size={[12, 12, 110 - F - 8]} radius={1.5}>
            <Paint color="#f2c200" />
          </RBox>
          <RBox at={[x, y + (i ? -6.4 : 6.4), (F + 8 + 110) / 2]} size={[8, 1, 110 - F - 28]} radius={0.3}>
            <meshStandardMaterial color="#1a1d22" roughness={0.3} />
          </RBox>
        </group>
      ))}
      {Array.from({ length: 9 }, (_, k) => (
        <mesh key={k} position={[m(x), m((ys[0] + ys[1]) / 2), m(F + 30 + k * 24)]}>
          <cylinderGeometry args={[m(0.35), m(0.35), m(ys[1] - ys[0] - 14), 6]} />
          <meshStandardMaterial color="#ff3b30" emissive="#ff2a1f" emissiveIntensity={0.9} transparent opacity={0.35} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

/** The waiting stand in front of the door: a small dark plate with a yellow square marking the spot. */
function WaitStand() {
  const b = cellLayout('tend').fixed.find((f) => f.name === '대기 자리')!;
  const top = b.max[2];
  const [x, y] = [D_WAIT.x, D_WAIT.y];
  const S = b.max[0] - b.min[0];
  return (
    <Stand x0={b.min[0] + 3} x1={b.max[0] - 3} y0={b.min[1] + 3} y1={b.max[1] - 3} top={top - 6} s={6}>
      <RBox at={[x, y, top - 4]} size={[S, S, 8]} radius={2}>
        <meshStandardMaterial color="#454c55" roughness={0.6} />
      </RBox>
      {[
        [x, y - 11, 24, 2],
        [x, y + 11, 24, 2],
        [x - 11, y, 2, 24],
        [x + 11, y, 2, 24],
      ].map(([cx, cy, sx, sy]) => (
        <RBox key={`${cx},${cy}`} at={[cx, cy, top + 0.3]} size={[sx, sy, 0.6]} radius={0.2}>
          <meshStandardMaterial color="#f2c230" roughness={0.5} />
        </RBox>
      ))}
    </Stand>
  );
}

export function TendCell({ world, onHover }: { world: RefObject<WorldState | null>; onHover: (n: string | null) => void }) {
  return (
    <group>
      {/* The machine is drawn in its own frame, set at the robot's right with its door towards the robot. */}
      <group position={[m(D_POSE.dx), m(D_POSE.dy), 0]} rotation={[0, 0, -Math.PI / 2]}>
        <Tagged name="CNC 머신" onHover={onHover}>
          <Machine />
          <MachineLight world={world} />
        </Tagged>
        <Tagged name="문" onHover={onHover}>
          <Door world={world} />
        </Tagged>
        <Tagged name="척" onHover={onHover}>
          <Chuck world={world} />
        </Tagged>
      </group>
      <Tagged name="소재 트레이" onHover={onHover}>
        <MarkedPlate cell="tend" grid="소재 트레이" jig />
      </Tagged>
      <Tagged name="완성품 트레이" onHover={onHover}>
        <MarkedPlate cell="tend" grid="완성품 트레이" />
      </Tagged>
      <Tagged name="대기 자리" onHover={onHover}>
        <WaitStand />
      </Tagged>
      <Tagged name="라이트 커튼" onHover={onHover}>
        <LightCurtain />
      </Tagged>
    </group>
  );
}
