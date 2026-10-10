'use client';

/**
 * 스마트팜: round the sorting cell (robot frame, mm; see ../Around.tsx). The cell stands on the packing
 * room's sorting table; the greenhouse — its tomato rows, the harvest AGV, the glass walls and roof — is
 * at real size on the floor FARM_TABLE_MM below.
 */

import { useGLTF } from '@react-three/drei';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { Color, Matrix4, type InstancedMesh, type MeshStandardMaterial } from 'three';

import { RBox } from '../../../../simulator/stage/sceneKit';
import { Steel, m } from '../../CellKit';
import type { SiteLook } from '../Ground';
import { Blob } from '../Ground';
import { Hall } from '../Hall';
import Model from '../Model';
import { Fan, Monitor, RouteAgv, Sway, WorkingArm } from '../Props';

/** The sorting table the arm stands on: its top above the greenhouse floor, mm. */
export const FARM_TABLE_MM = 800;

export const FARM_LOOK: SiteLook = { sky: '#dfe9e4', floor: 'greenhouse', groundZ: -FARM_TABLE_MM, fog: [2.8, 9] };

type Xy = readonly [number, number];

/** The greenhouse's extent on the floor (its two glass back walls, the open sides towards the view) and gutter height, mm. */
const HOUSE = { x0: -3000, x1: 3000, y0: -2400, y1: 3900, gutter: 4000, ridge: 4700 } as const;
/** The tomato rows (along x): their y, and where they start and end. */
const ROWS = [1700, 2500, 3300] as const;
const ROW_X0 = -2700;
const ROW_X1 = 1000;

/* --- 스마트팜 ------------------------------------------------------------------------------ */

/**
 * The tomato plant's fruit came out of the pack almost brown (its red is very dark, linear 0.13): ripe
 * truss-tomato red instead, on the pack's shared material (every plant uses it).
 */
function useRipeFruit() {
  const { materials } = useGLTF('/models/farm.glb');
  useEffect(() => ripen(materials.Red as MeshStandardMaterial | undefined), [materials]);
}

function ripen(red: MeshStandardMaterial | undefined) {
  if (!red) return;
  red.color.set('#c42a1c');
  red.roughness = 0.35;
}

/**
 * Cherry tomatoes heaped in a crate (or a box), `w` × `d` mm round `at`, their tops near `z`: a few
 * hundred small fruit in one draw, ripe red with a few orange ones.
 */
export function CherryFill({ at, z, w, d, seed = 1 }: { at: Xy; z: number; w: number; d: number; seed?: number }) {
  const ref = useRef<InstancedMesh>(null);
  const fruit = useMemo(() => {
    // a fixed scatter: the same heap every time
    const r = (k: number) => {
      const v = Math.sin(k * 12.9898 + seed * 78.233) * 43758.5453;
      return v - Math.floor(v);
    };
    const out: { p: [number, number, number]; c: string }[] = [];
    for (let i = 0; i < Math.floor(w / 26); i += 1)
      for (let j = 0; j < Math.floor(d / 26); j += 1) {
        const k = (i * 61 + j) * 4;
        const x = -w / 2 + 13 + i * 26 + (r(k) - 0.5) * 8;
        const y = -d / 2 + 13 + j * 26 + (r(k + 1) - 0.5) * 8;
        const c = r(k + 3);
        out.push({ p: [x, y, -6 - r(k + 2) * 10], c: c < 0.12 ? '#e5641f' : c < 0.5 ? '#c8281c' : '#d8331f' });
      }
    return out;
  }, [w, d, seed]);
  useLayoutEffect(() => {
    const o = ref.current;
    if (!o) return;
    const mx = new Matrix4();
    const c = new Color();
    fruit.forEach((f, i) => {
      o.setMatrixAt(i, mx.makeTranslation(m(f.p[0]), m(f.p[1]), m(f.p[2])));
      o.setColorAt(i, c.set(f.c));
    });
    o.instanceMatrix.needsUpdate = true;
    if (o.instanceColor) o.instanceColor.needsUpdate = true;
  }, [fruit]);
  return (
    <group position={[m(at[0]), m(at[1]), m(z)]}>
      <instancedMesh ref={ref} args={[undefined, undefined, fruit.length]} castShadow receiveShadow>
        <sphereGeometry args={[m(14), 12, 9]} />
        <meshPhysicalMaterial roughness={0.3} clearcoat={0.8} />
      </instancedMesh>
      {/* the fruit underneath, as one dark red layer */}
      <RBox at={[0, 0, -18]} size={[w, d, 10]} radius={4} shadow={false}>
        <meshStandardMaterial color="#7a1610" roughness={0.6} />
      </RBox>
    </group>
  );
}

/**
 * One tomato row along x at `y`, at real size: a white growing gutter on legs with rockwool slabs in it,
 * heating pipes under it, tall tomato plants (1.7 m, stirring a little in the fans' air) trained up
 * strings to the crop wire under the roof.
 */
function TomatoRow({ x0, x1, y, seed = 0 }: { x0: number; x1: number; y: number; seed?: number }) {
  const plants = Array.from({ length: Math.floor((x1 - x0) / 520) + 1 }, (_, k) => x0 + k * 520);
  const len = x1 - x0 + 300;
  const cx = (x0 + x1) / 2;
  const gz = 520;
  return (
    <group>
      {/* the gutter on its legs, the slabs in it, the two heating pipes below */}
      <RBox at={[cx, y, gz - 60]} size={[len, 260, 120]} radius={6}>
        <meshStandardMaterial color="#f2f4f1" roughness={0.5} />
      </RBox>
      <RBox at={[cx, y, gz + 4]} size={[len - 40, 200, 16]} radius={4}>
        <meshStandardMaterial color="#e9e4d8" roughness={0.9} />
      </RBox>
      {Array.from({ length: Math.floor(len / 1500) + 1 }, (_, k) => x0 - 150 + 40 + k * 1500).map((lx) => (
        <RBox key={lx} at={[lx, y, (gz - 120) / 2]} size={[40, 40, gz - 120]} radius={4}>
          <meshStandardMaterial color="#c9cfd6" metalness={0.5} roughness={0.4} />
        </RBox>
      ))}
      {[-170, 170].map((dy) => (
        <mesh key={dy} position={[m(cx), m(y + dy), m(110)]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[m(26), m(26), m(len), 14]} />
          <Steel />
        </mesh>
      ))}
      {plants.map((px, k) => (
        <group key={px}>
          <Sway at={[px, y]} deg={1.5} rate={0.55 + ((k * 13 + seed) % 5) * 0.06} phase={k * 1.3 + seed}>
            <Model group="farm" name="tomatoPlant" at={[0, 0]} z={gz + 10} yaw={k * 2.1 + seed} />
          </Sway>
          {/* its string up to the crop wire */}
          <mesh position={[m(px), m(y), m((gz + 1700 + HOUSE.gutter - 300) / 2)]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[m(2), m(2), m(HOUSE.gutter - 300 - gz - 1700), 4]} />
            <meshStandardMaterial color="#efe9da" roughness={0.9} />
          </mesh>
        </group>
      ))}
      <mesh position={[m(cx), m(y), m(HOUSE.gutter - 300)]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[m(4), m(4), m(len), 6]} />
        <Steel />
      </mesh>
      <Blob at={[cx, y]} w={len + 100} d={700} k={0.25} />
    </group>
  );
}

/**
 * The greenhouse's glass roof at real height (a Venlo roof: two glass slopes per bay, ridges along y),
 * its gutters on columns and the trusses across; nothing here casts the sun's shadow.
 */
function GlassRoof() {
  const { x0, x1, y0, y1, gutter, ridge } = HOUSE;
  const depth = y1 - y0;
  const cy = (y0 + y1) / 2;
  const half = 1100;
  const slope = Math.atan2(ridge - gutter, half);
  const pane = Math.hypot(half, ridge - gutter);
  const valleys = Array.from({ length: Math.round((x1 - x0) / (2 * half)) + 1 }, (_, k) => x0 + k * 2 * half);
  const white = <meshStandardMaterial color="#f3f5f4" roughness={0.5} metalness={0.3} />;
  return (
    <group>
      {valleys.slice(0, -1).map((vx) => (
        <group key={vx}>
          {[1, -1].map((s) => (
            <mesh key={s} position={[m(vx + half + (-s * half) / 2), m(cy), m((gutter + ridge) / 2)]} rotation={[Math.PI / 2, s * slope, 0]}>
              <planeGeometry args={[m(pane), m(depth)]} />
              <meshPhysicalMaterial color="#e8f3ea" transparent opacity={0.16} roughness={0.05} side={2} depthWrite={false} />
            </mesh>
          ))}
          <RBox at={[vx + half, cy, ridge]} size={[50, depth, 40]} radius={4} shadow={false}>
            {white}
          </RBox>
        </group>
      ))}
      {valleys.map((vx, k) => (
        <group key={vx}>
          <RBox at={[vx, cy, gutter - 40]} size={[180, depth, 80]} radius={6} shadow={false}>
            {white}
          </RBox>
          {/* columns on every other gutter, at the walls (none in the rows or the paths round the table) */}
          {k % 2 === 0 &&
            [y0, y1].map((cyy) => (
              <RBox key={cyy} at={[vx, cyy, gutter / 2]} size={[90, 90, gutter]} radius={4} shadow={false}>
                {white}
              </RBox>
            ))}
        </group>
      ))}
      {[y0, y0 + 3000, y1].map((ty) => (
        <RBox key={ty} at={[(x0 + x1) / 2, ty, gutter - 120]} size={[x1 - x0, 50, 160]} radius={4} shadow={false}>
          {white}
        </RBox>
      ))}
    </group>
  );
}

/** A circulation (HAF) fan hanging from the truss, blowing along the rows (+x). */
function HangingFan({ at, phase = 0 }: { at: Xy; phase?: number }) {
  const z = 2900;
  return (
    <group>
      <mesh position={[m(at[0]), m(at[1]), m((z + HOUSE.gutter - 120) / 2)]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[m(8), m(8), m(HOUSE.gutter - 120 - z), 8]} />
        <Steel />
      </mesh>
      <mesh position={[m(at[0]), m(at[1]), m(z)]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[m(270), m(270), m(160), 28, 1, true]} />
        <meshStandardMaterial color="#d9dde2" roughness={0.5} side={2} />
      </mesh>
      <Fan at={at} z={z} r={240} rps={3 + phase * 0.2} />
    </group>
  );
}

/** A stack of harvest crates on the floor, the top one heaped with tomatoes. */
function CrateStack({ at, n, yaw = 0, full = true }: { at: Xy; n: number; yaw?: number; full?: boolean }) {
  return (
    <group>
      {Array.from({ length: n }, (_, k) => (
        <Model key={k} group="farm" name="crate" at={at} z={k * 236} yaw={yaw} />
      ))}
      {full && <CherryFill at={at} z={(n - 1) * 236 + 205} w={Math.abs(Math.sin(yaw)) > 0.5 ? 360 : 460} d={Math.abs(Math.sin(yaw)) > 0.5 ? 460 : 360} seed={n} />}
      <Blob at={at} w={560} d={460} k={0.3} />
    </group>
  );
}

/**
 * The greenhouse round the sorting table, at real size on its floor FARM_TABLE_MM below the table top:
 * the tomato rows behind the table, the harvest AGV going round the first row with a crate, crates of
 * today's harvest waiting by the table, a worker picking between the rows, the boxes packed for shipping on a
 * pallet, a second packing station, the climate screen, the fans, the glass walls and roof.
 */
export function FarmAround() {
  useRipeFruit();
  return (
    <group position={[0, 0, m(-FARM_TABLE_MM)]}>
      <Hall glass x={HOUSE.x0} y={HOUSE.y1} h={HOUSE.gutter} />
      <GlassRoof />
      {ROWS.map((y, k) => (
        <TomatoRow key={y} x0={ROW_X0} x1={ROW_X1} y={y} seed={k + 1} />
      ))}
      <RouteAgv
        route={[
          [150, 1150],
          [1300, 1150],
          [1300, 2010],
          [-2900, 2010],
          [-2900, 1150],
        ]}
        speed={150}
        cargo={<Model group="farm" name="crateTomatoes" at={[0, 0]} w={300} yaw={Math.PI / 2} />}
      />
      {/* Crates of today's harvest by the table's far end; a worker picking in the rows. */}
      <CrateStack at={[-1200, 230]} n={3} yaw={Math.PI / 2} />
      <CrateStack at={[-1200, -360]} n={2} yaw={Math.PI / 2} />
      <Model group="people" name="customer" at={[-1700, 2290]} yaw={-Math.PI / 2 + 0.5} pose="Idle" />
      {/* Boxes of packed punnets on a pallet, ready to ship. */}
      <group>
        <RBox at={[-1150, -1250, 72]} size={[1200, 800, 144]} radius={4}>
          <meshStandardMaterial color="#b98a55" roughness={0.8} />
        </RBox>
        {[-1, 1].flatMap((sx) =>
          [-1, 1].map((sy) => <Model key={`${sx}${sy}`} group="farm" name="box" at={[-1150 + sx * 280, -1250 + sy * 200]} z={144} yaw={sx * 0.03} />),
        )}
        <Model group="farm" name="box" at={[-1150 - 280, -1250 - 200]} z={144 + 342} yaw={0.05} />
        <Blob at={[-1150, -1250]} w={1300} d={900} k={0.3} />
      </group>
      {/* A second packing station further down the room, the same job on its own table. */}
      <WorkingArm
        at={[-2200, -300]}
        yaw={0}
        job={{
          pick: [150, -95, 26],
          place: [150, 95, 26],
          period: 9,
          item: 'ball',
          block: '#d8331f',
        }}
        phase={4}
        table={[700, 560, FARM_TABLE_MM]}
        tableAt={[150, 0]}
      />
      {/* The climate screen on its post by the rows. */}
      <group>
        <RBox at={[-1700, 420, 700]} size={[60, 60, 1400]} radius={4}>
          <meshStandardMaterial color="#c9cfd6" metalness={0.5} roughness={0.4} />
        </RBox>
        <Monitor at={[-1660, 420]} z={1450} yaw={-0.6} w={360} stand={false} kind="line" accent="#3a9b3a" title="1동 온도 24 °C · 습도 68 %" />
      </group>
      <HangingFan at={[-2000, 2100]} />
      <HangingFan at={[200, 2100]} phase={1} />
      <HangingFan at={[-900, 2900]} phase={2} />
    </group>
  );
}
