'use client';

/**
 * 바이오·헬스케어: round the sample cell (robot frame, mm; see ../Around.tsx).
 */

import { RBox, Turned, vessel } from '../../../../simulator/stage/sceneKit';
import { Sign, Tape, m } from '../../CellKit';
import type { SiteLook } from '../Ground';
import { Blob } from '../Ground';
import { Hall } from '../Hall';
import Model from '../Model';
import { Leds, Monitor, RouteAgv, Steam, Turn, WorkingArm } from '../Props';

type Xy = readonly [number, number];

/** 바이오 실험실: the lab bench the arm stands on, its top above the floor, mm. */
export const BIO_BENCH_MM = 900;

export const BIO_LOOK: SiteLook = { sky: '#dfe6ec', floor: 'vinyl', groundZ: -BIO_BENCH_MM, fog: [3.2, 8.5] };

/* --- 바이오 실험실 ------------------------------------------------------------------------- */

/** The lab counters' modules (MilkAndBanana, fitted to this height), their worktop on top, mm. */
const COUNTER_MM = 870;
const TOP_MM = 30;
/** A counter module at that height: its width (along its front) and depth, mm. */
const MODULE = { w: 775, d: 960 } as const;

/**
 * A run of lab counters along y with their fronts to +x (back at `x`, from `y0`, `n` modules; `sink`
 * is the module with the sink, which keeps its own top): grey-blue cabinets, a white worktop over
 * the rest, wall cabinets above when `wall`.
 */
function CounterRun({ x, y0, n, sink = -1, wall = false }: { x: number; y0: number; n: number; sink?: number; wall?: boolean }) {
  const cx = x + MODULE.d / 2;
  const ys = Array.from({ length: n }, (_, i) => y0 + MODULE.w * (i + 0.5));
  return (
    <group>
      {ys.map((y, i) => (
        <group key={y}>
          <Model group="bio" name={i === sink ? 'counterSink' : i % 2 ? 'counterShelves' : 'counter'} at={[cx, y]} yaw={Math.PI / 2} scale={COUNTER_MM / 696} color="#8e9cad" />
          {i !== sink && (
            <RBox at={[cx + 10, y, COUNTER_MM + TOP_MM / 2]} size={[MODULE.d + 20, MODULE.w, TOP_MM]} radius={3}>
              <meshStandardMaterial color="#eef1f3" roughness={0.4} />
            </RBox>
          )}
          {wall && <Model group="bio" name={i % 2 ? 'wallShelf' : 'wallCabinet'} at={[x + 200, y]} z={1450} yaw={Math.PI / 2} scale={1.25} color="#c3ccd6" />}
        </group>
      ))}
      <Blob at={[cx, y0 + (MODULE.w * n) / 2]} w={MODULE.d} d={MODULE.w * n} k={0.25} />
    </group>
  );
}

/** A CO₂ incubator at real size (on the floor or stacked): a white cabinet, the glass inner door, its display and status LEDs. */
function Incubator({ at, z = 0, label }: { at: Xy; z?: number; label: string }) {
  const [x, y] = at;
  const W = 680;
  const D = 700;
  const H = 820;
  return (
    <group position={[0, 0, m(z)]}>
      <RBox at={[x, y, H / 2]} size={[D, W, H]} radius={12}>
        <meshStandardMaterial color="#f4f6f8" roughness={0.4} />
      </RBox>
      <RBox at={[x + D / 2 + 1, y - 30, H / 2 - 20]} size={[4, W - 140, H - 180]} radius={2} shadow={false}>
        <meshPhysicalMaterial color="#cfe7ff" transparent opacity={0.5} roughness={0.05} clearcoat={1} />
      </RBox>
      <RBox at={[x + D / 2 + 6, y + W / 2 - 45, H / 2 - 20]} size={[14, 22, 260]} radius={6}>
        <meshStandardMaterial color="#8d969f" metalness={0.6} roughness={0.35} />
      </RBox>
      <Leds at={[x + D / 2 + 2, y - 220]} z={H - 60} cols={3} rows={2} pitch={14} />
      <Sign at={[x + D / 2 + 2.5, y + 40, H - 55]} yaw={Math.PI / 2} w={260} h={50} lines={[label]} fg="#e6ebf2" bg="#141a22" />
    </group>
  );
}

/** A lab refrigerator at real size: a white cabinet with a glass door, bottles and racks on its lit shelves, the display. */
function LabFridge({ at }: { at: Xy }) {
  const [x, y] = at;
  const W = 700;
  const D = 720;
  const H = 1950;
  const shelves = [520, 900, 1280, 1620];
  return (
    <group>
      <RBox at={[x, y, H / 2]} size={[W, D, H]} radius={14}>
        <meshStandardMaterial color="#f2f4f6" roughness={0.4} />
      </RBox>
      {/* the lit inside, its shelves and what stands on them, behind the glass door (front: −y) */}
      <RBox at={[x, y - D / 2 + 30, 1050]} size={[W - 100, 20, 1500]} radius={2} shadow={false}>
        <meshStandardMaterial color="#e9f3ff" emissive="#dbeaff" emissiveIntensity={0.35} roughness={0.4} />
      </RBox>
      {shelves.map((z, i) => (
        <group key={z}>
          <RBox at={[x, y - D / 2 + 60, z]} size={[W - 110, 60, 8]} radius={1} shadow={false}>
            <meshStandardMaterial color="#c9d3dd" roughness={0.3} />
          </RBox>
          {[-220, -140, -60, 30, 120, 210].map((dx, k) => (
            <RBox key={dx} at={[x + dx, y - D / 2 + 60, z + 4 + (k % 3 === 2 ? 50 : 80)]} size={[55, 50, k % 3 === 2 ? 100 : 160]} radius={10} shadow={false}>
              <meshStandardMaterial color={['#7a3f12', '#f3f5f7', '#2f7de1', '#e5484d', '#f3f5f7', '#12935f'][(k + i) % 6]} roughness={0.4} />
            </RBox>
          ))}
        </group>
      ))}
      <RBox at={[x, y - D / 2 - 2, 1050]} size={[W - 60, 6, 1600]} radius={3} shadow={false}>
        <meshPhysicalMaterial color="#dceefe" transparent opacity={0.28} roughness={0.05} clearcoat={1} />
      </RBox>
      <RBox at={[x - W / 2 + 50, y - D / 2 - 18, 1050]} size={[22, 14, 700]} radius={6}>
        <meshStandardMaterial color="#8d969f" metalness={0.6} roughness={0.35} />
      </RBox>
      <Sign at={[x + 120, y - D / 2 - 1, 1880]} w={260} h={50} lines={['시료 보관 4 °C']} fg="#e6ebf2" bg="#141a22" />
      <Blob at={at} w={W} d={D} />
    </group>
  );
}

/** A stirrer plate (the pack's hot plate) with a flask of blue medium on it, its stir bar turning; `z` is the worktop. */
function Stirrer({ at, z }: { at: Xy; z: number }) {
  const [x, y] = at;
  return (
    <group>
      <Model group="bio" name="hotPlate" at={at} z={z} yaw={Math.PI / 2} w={300} color="#eef1f4" />
      <group position={[m(x), m(y), m(z + 140)]}>
        <Turned profile={vessel(70, 18, 200, 2, 3)}>
          <meshPhysicalMaterial color="#e8f4ff" transparent opacity={0.35} roughness={0.05} clearcoat={1} side={2} />
        </Turned>
        <Turned
          at={[0, 0, 2]}
          profile={[
            [0, 0],
            [66, 0],
            [60, 30],
            [42, 80],
            [0, 80],
          ]}
        >
          <meshStandardMaterial color="#3d7bd9" transparent opacity={0.7} roughness={0.2} />
        </Turned>
        <Turn at={[0, 0]} z={6} rps={2}>
          <mesh rotation={[0, Math.PI / 2, 0]}>
            <capsuleGeometry args={[m(5), m(30), 4, 8]} />
            <meshStandardMaterial color="#ffffff" roughness={0.3} />
          </mesh>
        </Turn>
      </group>
    </group>
  );
}

/** Steel shelves (Poly Haven, 1.1 × 0.5 m, its shelves' tops below) stocked with a lab's supplies: lidded bins, glove boxes, bottles of buffer. */
const SHELF_TOPS = [130, 630, 1130, 1640] as const;
function StockedShelves({ at, seed = 0 }: { at: Xy; seed?: number }) {
  const [x, y] = at;
  const bins = ['#f3f5f7', '#2f7de1', '#f3f5f7', '#12935f'];
  return (
    <group>
      <Model group="bio" name="shelves" at={at} />
      {SHELF_TOPS.map((z, i) => {
        const k = (i + seed) % 4;
        return (
          <group key={z}>
            {k === 0 &&
              [-300, 0, 300].map((dx, j) => (
                <RBox key={dx} at={[x + dx, y, z + 120]} size={[270, 380, 240]} radius={14}>
                  <meshStandardMaterial color={bins[(j + i) % 4]} roughness={0.55} />
                </RBox>
              ))}
            {k === 1 &&
              [-380, -250, -120, 10].map((dx, j) => (
                <RBox key={dx} at={[x + dx, y - 60, z + 65]} size={[120, 240, 130]} radius={4}>
                  <meshStandardMaterial color={['#5aa0e6', '#b48ad6', '#5aa0e6', '#f3f5f7'][j]} roughness={0.6} />
                </RBox>
              ))}
            {k === 1 && [200, 330].map((dx) => <Model key={dx} group="bio" name="plasticBottle" at={[x + dx, y]} z={z} h={300} color="#f3f5f7" />)}
            {k === 2 && [-380, -240, -100, 40, 180, 320].map((dx, j) => <Model key={dx} group="bio" name={j % 3 === 2 ? 'flask' : 'reagentBottle'} at={[x + dx, y - 40]} z={z} h={j % 3 === 2 ? 200 : 190} color={j % 2 ? '#7a3f12' : '#dfe9ef'} />)}
            {k === 3 && (
              <>
                <RBox at={[x - 200, y, z + 150]} size={[500, 400, 300]} radius={6}>
                  <meshStandardMaterial color="#c9a77a" roughness={0.8} />
                </RBox>
                <RBox at={[x + 260, y, z + 100]} size={[360, 380, 200]} radius={14}>
                  <meshStandardMaterial color="#f3f5f7" roughness={0.55} />
                </RBox>
              </>
            )}
          </group>
        );
      })}
      <Blob at={at} w={1100} d={500} k={0.25} />
    </group>
  );
}

/** A yellow medical-waste pedal bin on the floor, its label. */
function WasteBin({ at }: { at: Xy }) {
  const [x, y] = at;
  return (
    <group>
      <mesh position={[m(x), m(y), m(300)]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[m(190), m(170), m(600), 32]} />
        <meshStandardMaterial color="#f2c230" roughness={0.5} />
      </mesh>
      <mesh position={[m(x), m(y), m(610)]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[m(198), m(198), m(24), 32]} />
        <meshStandardMaterial color="#e2a91a" roughness={0.5} />
      </mesh>
      <Sign at={[x + 182, y, 340]} yaw={Math.PI / 2} w={170} h={70} lines={['의료 폐기물', '생물 위해']} fg="#1d2025" bg="#ffffff" />
    </group>
  );
}

/**
 * The lab round the sample cell, at real size on the floor BIO_BENCH_MM below the bench top: the
 * counters along the back wall with the sink, wall cabinets, microscope, centrifuge, stirrer and the
 * absorbance screen and the next station's arm on the worktop; the incubators and the sample fridge
 * along the side wall with steel shelves of supplies; a sample AGV going up and down its lane.
 */
export function BioAround() {
  const top = COUNTER_MM + TOP_MM;
  const backX = -2520;
  return (
    <group position={[0, 0, m(-BIO_BENCH_MM)]}>
      <Hall band="#2f9e6b" wall="#eef1f4" x={-2600} y={2600} h={3000} />
      <Sign at={[-2598, 0, 2500]} yaw={Math.PI / 2} w={1400} h={200} lines={['새움 바이오 분석실 · 시료 처리 구역']} fg="#ffffff" bg="#12935f" />
      {/* The back wall's counters: the next station's arm, microscope, centrifuge, sink, stirrer, the absorbance screen. */}
      <CounterRun x={backX} y0={-1550} n={4} sink={2} wall />
      <WorkingArm
        at={[-2170, -1160]}
        yaw={0}
        job={{
          pick: [150, -95, 25],
          place: [150, 95, 25],
          period: 10,
          block: '#e9edf3',
        }}
        phase={3}
        table={[480, 560, top + 9]}
        tableAt={[90, 0]}
      />
      <Model group="bio" name="microscope" at={[-2120, -640]} z={top} yaw={Math.PI / 2} />
      <Model group="bio" name="centrifuge" at={[-2080, -240]} z={top} yaw={Math.PI / 2} w={460} color="#f2f4f6" />
      {[-1, 1].map((k) => (
        <Model key={k} group="bio" name="reagentBottle" at={[-2330, 160 + k * 220]} z={top} h={200} color={k > 0 ? '#7a3f12' : '#dfe9ef'} />
      ))}
      <Model group="bio" name="tubeRack" at={[-2330, 1000]} z={top} w={250} color="#2f7de1" />
      <Stirrer at={[-2060, 980]} z={top} />
      <Steam at={[-2060, 980]} z={top + 330} n={4} r={10} rise={90} />
      <Monitor at={[-2300, 1330]} z={top + 240} yaw={0} w={420} kind="plot" accent="#2f9e6b" title="흡광도 · 시료 12" stand={false} />
      <RBox at={[-2310, 1330, top + 40]} size={[160, 200, 80]} radius={6}>
        <meshStandardMaterial color="#2b3038" roughness={0.5} />
      </RBox>
      {/* The side wall: two incubators stacked on their stand, the sample fridge, steel shelves of supplies. */}
      <group>
        <RBox at={[-2120, 2150, 150]} size={[720, 700, 300]} radius={6}>
          <meshStandardMaterial color="#9aa3ad" metalness={0.5} roughness={0.4} />
        </RBox>
        <Incubator at={[-2120, 2150]} z={300} label="37 °C · CO₂ 5 %" />
        <Incubator at={[-2120, 2150]} z={1130} label="37 °C · CO₂ 5 %" />
        <Blob at={[-2120, 2150]} w={720} d={700} />
      </group>
      <LabFridge at={[-1300, 2200]} />
      <StockedShelves at={[-250, 2300]} />
      <StockedShelves at={[950, 2300]} seed={2} />
      <Model group="bio" name="extinguisher" at={[350, 2560]} z={900} h={600} color="#d23a2e" />
      {/* lab coats on their wall hooks */}
      {[1550, 1900].map((x) => (
        <group key={x}>
          <RBox at={[x, 2590, 1560]} size={[30, 30, 30]} radius={6}>
            <meshStandardMaterial color="#8d969f" metalness={0.6} roughness={0.35} />
          </RBox>
          <Model group="bio" name="gown" at={[x, 2560]} z={300} h={1250} color="#f6f7f8" />
        </group>
      ))}
      <WasteBin at={[-700, -300]} />
      <Tape a={[-1500, 1050]} b={[900, 1050]} w={50} color="#2f9e6b" />
      <Tape a={[-1500, 1650]} b={[900, 1650]} w={50} color="#2f9e6b" />
      <RouteAgv
        route={[
          [-1350, 1220],
          [700, 1220],
          [700, 1480],
          [-1350, 1480],
        ]}
        speed={160}
        led="#38bdf8"
        cargo={
          <RBox at={[0, 0, 40]} size={[220, 170, 80]} radius={8}>
            <meshStandardMaterial color="#ffffff" roughness={0.4} />
          </RBox>
        }
      />
    </group>
  );
}
