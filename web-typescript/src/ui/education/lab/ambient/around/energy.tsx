'use client';

/**
 * 에너지·자원순환: round the sorting cell (robot frame, mm; see ../Around.tsx).
 */

import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import type { Group } from 'three';

import { DESK_Z } from '@/engine/simulator/board';

import { RBox, belt as beltTex, canvasTexture } from '../../../../simulator/stage/sceneKit';
import { scroll } from '../../ConveyorCell';
import { Sign, Steel, Tape, m } from '../../CellKit';
import { useAmbientClock } from '../ambient';
import type { SiteLook } from '../Ground';
import { Blob } from '../Ground';
import { Hall } from '../Hall';
import Model from '../Model';
import { Monitor, SignalTower, WorkingArm } from '../Props';

type Xy = readonly [number, number];

/** The steel bench the sorting cell stands on: its top (DESK_Z, under the kit's plate) above the hall's floor, mm. */
export const ENERGY_BENCH_MM = 850;
/** The hall's floor in the robot frame, mm. */
const FLOOR_Z = DESK_Z - ENERGY_BENCH_MM;

/** The sorting hall's look: a pale green-grey sky over a concrete floor, the bench's height below the cell. */
export const ENERGY_LOOK: SiteLook = { sky: '#d5e0da', floor: 'concrete', groundZ: FLOOR_Z, fog: [3.4, 8.5] };

/* --- 에너지 · 자원순환 ------------------------------------------------------------------------ */

type BaleKind = 'cans' | 'pet' | 'paper';

/** The pressed material's face for a bale: a dense jumble of flattened pieces in the kind's colours. */
function useBaleTexture(kind: BaleKind) {
  return useMemo(
    () =>
      canvasTexture(`bale-${kind}`, 512, 512, (g, r) => {
        // A crumpled grey (aluminium, clear plastic, card) base, then many small flattened bits, mostly the base's tones.
        const look = {
          cans: { base: '#8f979f', bits: ['#c3cad2', '#d8dde2', '#a7b0b9', '#7d858e', '#e3e6ea', '#c3cad2', '#9aa3ad', '#b6bec6', '#6f777f', '#d0d5da'], spots: ['#b9312a', '#2c55c9', '#d6a531', '#2e9e5b'] },
          pet: { base: '#9fb8c6', bits: ['#e6f6ff', '#cfe8f7', '#b8d4e3', '#ffffff', '#dceaf2', '#8fb0c2', '#e6f6ff', '#cfe8f7', '#aac3d1', '#c4dae6'], spots: ['#3c8f5c', '#2c55c9', '#e5484d', '#ffffff'] },
          paper: { base: '#a88762', bits: ['#efe7da', '#c9a273', '#8a6a44', '#e6d8c2', '#d9c6a8', '#b8946a', '#efe7da', '#ffffff', '#c2a27c', '#9c7b55'], spots: ['#f08a24', '#2e9e5b', '#2c55c9', '#d63a26'] },
        }[kind];
        g.fillStyle = look.base;
        g.fillRect(0, 0, 512, 512);
        for (let k = 0; k < 1400; k += 1) {
          const x = r() * 512;
          const y = r() * 512;
          const w = 14 + r() * 40;
          const h = 5 + r() * 14;
          g.save();
          g.translate(x, y);
          g.rotate((r() - 0.5) * 2.4);
          g.fillStyle = r() < 0.07 ? look.spots[Math.floor(r() * look.spots.length)] : look.bits[Math.floor(r() * look.bits.length)];
          g.beginPath();
          g.moveTo(-w / 2, -h / 2);
          g.lineTo(w / 2 - r() * 4, -h / 2 + r() * 3);
          g.lineTo(w / 2, h / 2);
          g.lineTo(-w / 2 + r() * 4, h / 2 - r() * 2);
          g.fill();
          g.fillStyle = 'rgba(0,0,0,0.22)';
          g.fillRect(-w / 2, h / 2 - 1, w, 1.2);
          g.restore();
        }
      }),
    [kind],
  );
}

/**
 * A pressed bale at real size (about 1 m on each side) on a wooden pallet: the baler's block of cans,
 * PET or paper packs with four steel wires round it; `stack` puts a second one on top.
 */
function Bale({ at, kind, yaw = 0, stack = false }: { at: Xy; kind: BaleKind; yaw?: number; stack?: boolean }) {
  const tex = useBaleTexture(kind);
  const P = 165;
  const S: [number, number, number] = [1000, 1050, 900];
  const one = (z: number) => (
    <group position={[0, 0, m(z)]}>
      <RBox at={[0, 0, S[2] / 2]} size={S} radius={30}>
        <meshStandardMaterial map={tex} roughness={0.75} metalness={kind === 'cans' ? 0.35 : 0} />
      </RBox>
      {[-360, -120, 120, 360].map((dx) => (
        <RBox key={dx} at={[dx, 0, S[2] / 2]} size={[10, S[1] + 10, S[2] + 10]} radius={4} shadow={false}>
          <Steel />
        </RBox>
      ))}
    </group>
  );
  return (
    <group position={[m(at[0]), m(at[1]), 0]} rotation={[0, 0, yaw]}>
      <Model group="energy" name="pallet" />
      {one(P)}
      {stack && one(P + S[2] + 5)}
      <Blob at={[0, 0]} w={1150} d={1150} k={0.3} />
    </group>
  );
}

/** A 240 L wheelie bin at real size for one kind (its lid's hinge and wheels at +y before the turn), its label on the front. */
function WheelieBin({ at, yaw = 0, color, label }: { at: Xy; yaw?: number; color: string; label: string }) {
  const W = 580;
  const D = 730;
  const H = 1000;
  return (
    <group position={[m(at[0]), m(at[1]), 0]} rotation={[0, 0, yaw]}>
      {/* the body, a little narrower at the foot */}
      <RBox at={[0, -15, 80 + (H - 80) / 2]} size={[W, D - 30, H - 80]} radius={30}>
        <meshStandardMaterial color={color} roughness={0.55} />
      </RBox>
      <RBox at={[0, 0, 40]} size={[W - 80, D - 120, 80]} radius={20}>
        <meshStandardMaterial color={color} roughness={0.6} />
      </RBox>
      {/* the lid and the handle bar behind it */}
      <RBox at={[0, -10, H + 20]} size={[W + 30, D + 10, 40]} radius={14}>
        <meshStandardMaterial color="#2b3038" roughness={0.5} />
      </RBox>
      <RBox at={[0, D / 2 + 30, H - 30]} size={[W - 120, 40, 40]} radius={16}>
        <meshStandardMaterial color="#2b3038" roughness={0.5} />
      </RBox>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[m(s * (W / 2 - 20)), m(D / 2 - 40), m(100)]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[m(100), m(100), m(50), 24]} />
          <meshStandardMaterial color="#1d2025" roughness={0.8} />
        </mesh>
      ))}
      <Sign at={[0, -D / 2 - 1, 700]} w={380} h={170} lines={[label]} fg="#ffffff" bg={color} />
      <Blob at={[0, 0]} w={W} d={D} k={0.3} />
    </group>
  );
}

/** What rides the line: a crushed can (the Kenney model), a flattened clear or coloured PET bottle, a paper pack. */
type LineItem = 'can' | 'clear' | 'color' | 'pack';
const LINE_ITEMS: readonly LineItem[] = ['can', 'clear', 'pack', 'can', 'color', 'clear', 'can', 'pack', 'clear', 'can', 'color', 'pack', 'can', 'clear'];

function LinePiece({ kind, k }: { kind: LineItem; k: number }) {
  if (kind === 'can') return <Model group="energy" name="can" yaw={k * 1.3} />;
  if (kind === 'pack')
    return (
      <RBox at={[0, 0, 8]} size={[90, 170, 16]} radius={3} rot={k * 0.7}>
        <meshStandardMaterial color={k % 2 ? '#f4efe6' : '#f08a24'} roughness={0.8} />
      </RBox>
    );
  return (
    <group rotation={[0, 0, k * 0.9]}>
      <RBox at={[0, 0, 18]} size={[85, 230, 36]} radius={14} shadow={kind !== 'clear'}>
        {kind === 'clear' ? <meshPhysicalMaterial color="#e6f6ff" transparent opacity={0.5} roughness={0.08} clearcoat={1} /> : <meshPhysicalMaterial color="#3c8f5c" transparent opacity={0.85} roughness={0.15} clearcoat={0.8} />}
      </RBox>
      <mesh position={[0, m(122), m(18)]} rotation={[0, 0, 0]}>
        <cylinderGeometry args={[m(16), m(16), m(20), 16]} />
        <meshStandardMaterial color={kind === 'clear' ? '#2c55c9' : '#f4efe6'} roughness={0.5} />
      </mesh>
    </group>
  );
}

/**
 * The hall's sorting line at real size along y (centre x, from y0 to y1, belt top `top` mm): a 600 mm
 * rubber belt running towards −y between steel skirts, on legs with cross braces, its drive at the
 * out-feed end, an in-feed hopper — and crushed cans, flattened bottles and paper packs riding it.
 */
function SortingLine({ x, y0, y1, top = ENERGY_BENCH_MM, speed = 160 }: { x: number; y0: number; y1: number; top?: number; speed?: number }) {
  const W = 600;
  const len = y1 - y0;
  const yc = (y0 + y1) / 2;
  const tex = useMemo(() => {
    const t = beltTex([1, len / 1200]).clone();
    t.needsUpdate = true;
    return t;
  }, [len]);
  useEffect(() => () => tex.dispose(), [tex]);
  const refs = useRef<(Group | null)[]>([]);
  const gap = (len - 400) / LINE_ITEMS.length;
  const clock = useAmbientClock();
  useFrame((_, dt) => {
    const t = clock.tick(dt);
    if (t === null) return;
    scroll(tex, (t * speed) / 1200);
    refs.current.forEach((r, i) => {
      if (!r) return;
      const d = (t * speed + i * gap) % (LINE_ITEMS.length * gap);
      r.position.set(m(x + ((i * 137) % 300) - 150), m(y1 - 300 - d), m(top + 1));
    });
  });
  const frame = <meshStandardMaterial color="#3b6f8f" roughness={0.45} metalness={0.4} />;
  const legs = Array.from({ length: Math.floor(len / 1500) + 1 }, (_, k) => y0 + 200 + (k * (len - 400)) / Math.floor(len / 1500));
  return (
    <group>
      {/* the belt over its bed, the drums at the ends */}
      <RBox at={[x, yc, top - 30]} size={[W, len, 60]} radius={20}>
        <meshStandardMaterial color="#25292f" roughness={0.9} />
      </RBox>
      <mesh position={[m(x), m(yc), m(top + 0.5)]} receiveShadow>
        <planeGeometry args={[m(W - 10), m(len - 60)]} />
        <meshStandardMaterial map={tex} roughness={0.85} />
      </mesh>
      {/* the side frames and the skirts that keep the pieces on the belt */}
      {[-1, 1].map((s) => (
        <group key={s}>
          <RBox at={[x + s * (W / 2 + 40), yc, top - 60]} size={[60, len + 40, 160]} radius={6}>
            {frame}
          </RBox>
          <RBox at={[x + s * (W / 2 + 15), yc, top + 70]} size={[10, len - 200, 140]} radius={3}>
            <Steel />
          </RBox>
        </group>
      ))}
      {legs.map((y) => (
        <group key={y}>
          {[-1, 1].map((s) => (
            <RBox key={s} at={[x + s * (W / 2 + 40), y, (top - 140) / 2]} size={[60, 60, top - 140]} radius={4}>
              {frame}
            </RBox>
          ))}
          <RBox at={[x, y, 220]} size={[W + 80, 40, 40]} radius={4}>
            {frame}
          </RBox>
        </group>
      ))}
      {/* the drive at the out-feed end: a gear motor and its guard */}
      <group position={[m(x + W / 2 + 140), m(y0 + 150), m(top - 80)]}>
        <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[m(90), m(90), m(220), 28]} />
          <meshStandardMaterial color="#2f4fb8" roughness={0.4} />
        </mesh>
        <RBox at={[-90, 0, 0]} size={[120, 220, 220]} radius={10}>
          <meshStandardMaterial color="#596270" roughness={0.5} metalness={0.4} />
        </RBox>
      </group>
      {/* the in-feed hopper at the far end */}
      <group position={[m(x), m(y1 - 200), m(top + 140)]}>
        {[-1, 1].map((s) => (
          <RBox key={s} at={[s * 420, 0, 260]} size={[30, 900, 520]} radius={6} rot={0}>
            {frame}
          </RBox>
        ))}
        <RBox at={[0, 450, 260]} size={[870, 30, 520]} radius={6}>
          {frame}
        </RBox>
      </group>
      {LINE_ITEMS.map((kind, i) => (
        <group
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
        >
          <LinePiece kind={kind} k={i} />
        </group>
      ))}
      <Blob at={[x, yc]} w={W + 200} d={len} k={0.25} />
    </group>
  );
}

/** A bulk bag (a woven 1 m³ sack with its four lifting loops) full of crushed cans, on the floor. */
function BulkBag({ at }: { at: Xy }) {
  const cans = useMemo(() => Array.from({ length: 26 }, (_, k) => [Math.sin(k * 12.9898) * 360, Math.sin(k * 78.233 + 1) * 360, (k * 7) % 3] as const), []);
  return (
    <group position={[m(at[0]), m(at[1]), 0]}>
      <RBox at={[0, 0, 450]} size={[900, 900, 900]} radius={80}>
        <meshStandardMaterial color="#eae6dc" roughness={0.95} />
      </RBox>
      {[-1, 1].flatMap((sx) =>
        [-1, 1].map((sy) => (
          <RBox key={`${sx}${sy}`} at={[sx * 400, sy * 400, 960]} size={[50, 50, 160]} radius={20}>
            <meshStandardMaterial color="#2c55c9" roughness={0.8} />
          </RBox>
        )),
      )}
      <RBox at={[0, 0, 885]} size={[860, 860, 40]} radius={20}>
        <meshStandardMaterial color="#aeb6bf" roughness={0.5} metalness={0.5} />
      </RBox>
      {cans.map(([x, y, z], k) => (
        <Model key={k} group="energy" name="can" at={[x, y]} z={905 + z * 6} yaw={k} />
      ))}
      <Blob at={[0, 0]} w={950} d={950} k={0.3} />
    </group>
  );
}

/**
 * The sorting hall round the cell's bench, at real size on the floor ENERGY_BENCH_MM below the bench top:
 * the main sorting line behind with its arm and a worker in hi-vis, wheelie bins for each kind, pressed
 * bales on pallets, a bulk bag of crushed cans, crates, the line's screen
 * and the hall's sign.
 */
export function EnergyAround() {
  return (
    <group position={[0, 0, m(FLOOR_Z)]}>
      <Hall band="#0b8a7a" wall="#e4e9e6" x={-2700} y={2700} h={3000} />
      <SortingLine x={-1400} y0={-2600} y1={2300} />
      {/* The line's sorting arm on its stand beside the belt, the line's signal tower and screen. */}
      <WorkingArm
        at={[-730, 900]}
        yaw={Math.PI}
        table={[400, 300, ENERGY_BENCH_MM]}
        job={{
          pick: [150, -95, 25],
          place: [150, 95, 25],
          period: 7,
          block: '#c3cad2',
        }}
        phase={0.8}
      />
      <group position={[0, 0, m(ENERGY_BENCH_MM)]}>
        <SignalTower at={[-1040, -2300]} h={420} />
      </group>
      <Monitor at={[-1000, 1700]} z={1500} yaw={-0.4} w={620} kind="plot" accent="#0b8a7a" title="재활용률 · 처리량 (개/분)" stand={false} />
      <RBox at={[-1000, 1700, 750]} size={[60, 60, 1500]} radius={6}>
        <meshStandardMaterial color="#59616b" roughness={0.5} metalness={0.4} />
      </RBox>
      {/* A worker at the line, on its far side. */}
      <Model group="people" name="workerMan" at={[-2150, 800]} yaw={Math.PI / 2 - 0.3} pose="Idle" />
      {/* Walkway tape along the line. */}
      <Tape a={[-850, -2600]} b={[-850, 2300]} w={60} color="#f2c230" />
      {/* Wheelie bins for each kind beside the bench. */}
      <WheelieBin at={[-600, -1250]} yaw={0.15} color="#8d99a6" label="캔" />
      <WheelieBin at={[-600, -1900]} yaw={0.1} color="#38bdf8" label="투명 PET" />
      <WheelieBin at={[-600, -2550]} yaw={0.05} color="#2e9e5b" label="유색 PET" />
      <WheelieBin at={[100, -2550]} color="#f08a24" label="종이팩" />
      {/* Pressed bales on pallets, waiting for the truck. */}
      <Bale at={[-500, 2120]} kind="cans" />
      <Bale at={[650, 2120]} kind="pet" stack />
      <Bale at={[1800, 2120]} kind="paper" yaw={0.05} />
      {/* A bulk bag of crushed cans and crates by the back wall, behind the line. */}
      <BulkBag at={[-2150, -1150]} />
      <Model group="energy" name="pallet" at={[-2100, 50]} />
      {[0, 1, 2].map((k) => (
        <Model key={k} group="energy" name="crate" at={[-2230, -80]} z={165 + k * 254} yaw={0.02 * k} />
      ))}
      {[0, 1].map((k) => (
        <Model key={k} group="energy" name="crate" at={[-1950, 200]} z={165 + k * 254} yaw={Math.PI / 2} />
      ))}
      <Model group="energy" name="tote" at={[-1950, -130]} z={165} yaw={0.1} />
      <Model group="energy" name="handTruck" at={[-2250, 2250]} yaw={Math.PI / 2 + 0.3} />
      <Model group="energy" name="wetSign" at={[-700, 300]} yaw={0.9} />
      {/* The hall's sign on the back wall, 1.6 m wide (drawn at a quarter and scaled up: its texture stays small). */}
      <group position={[m(-2650), 0, m(2250)]} scale={4}>
        <Sign at={[0, 0, 0]} yaw={Math.PI / 2} w={400} h={115} lines={['자원순환센터 · 선별동', '캔 · PET · 종이팩', '비우고 · 헹구고 · 분리해요']} fg="#ffffff" bg="#0b8a7a" />
      </group>
    </group>
  );
}
