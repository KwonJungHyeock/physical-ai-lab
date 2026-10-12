'use client';

/**
 * 스마트팩토리: the conveyor cell's work bench and the factory floor round it, at real size (robot
 * frame, mm; see ../Around.tsx). The arm and the cell's small belt stand on a steel work bench whose
 * top is the robot frame's z = 0; the floor is FACTORY_BENCH_MM below.
 */

import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import type { Group } from 'three';

import { RBox, belt as beltTex } from '../../../../simulator/stage/sceneKit';
import { BeltConveyor, CardBox, scroll, type BeltGeometry } from '../../ConveyorCell';
import { Tape, m, useHazard, useTextTexture } from '../../CellKit';
import { useAmbientClock } from '../ambient';
import type { SiteLook } from '../Ground';
import { Blob } from '../Ground';
import { Hall } from '../Hall';
import { Surround } from '../Surround';
import Model from '../Model';
import { Monitor, RouteAgv, WorkingArm } from '../Props';

type Xy = readonly [number, number];

/** The cell's work bench: its top (the robot frame's z = 0) above the factory floor, mm. */
export const FACTORY_BENCH_MM = 800;

export const FACTORY_LOOK: SiteLook = { sky: '#c3ccd6', floor: 'epoxy', groundZ: -FACTORY_BENCH_MM, fog: [3, 8] };

/** The next station (another arm on its bench): where it stands and its turn. */
const NEXT: Xy = [-1350, -150];
const NEXT_YAW = -0.15;

/** The factory's machine paint (frames, stands) and the line's colour. */
const FRAME = '#56677a';
const LINE_BLUE = '#2f5be7';

/**
 * A welded steel work table standing on the floor (z = 0 of its group): a steel top plate `h` up,
 * square-tube legs `inset` in from the top's edge on levelling feet, an apron under the top, a lower
 * shelf; `children` stand on the lower shelf (its top at 170).
 */
function SteelTable({ x0, x1, y0, y1, h, inset = 45, color = FRAME, children }: { x0: number; x1: number; y0: number; y1: number; h: number; inset?: number; color?: string; children?: ReactNode }) {
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const w = x1 - x0;
  const d = y1 - y0;
  const t = 25;
  const paint = <meshStandardMaterial color={color} roughness={0.45} metalness={0.35} />;
  const legs = [-1, 1].flatMap((sx) => [-1, 1].map((sy) => [cx + sx * (w / 2 - inset), cy + sy * (d / 2 - inset)] as const));
  const iw = w - 2 * inset;
  const id = d - 2 * inset;
  return (
    <group>
      <RBox at={[cx, cy, h - t / 2]} size={[w, d, t]} radius={3}>
        <meshStandardMaterial color="#a9b1b8" roughness={0.38} metalness={0.6} />
      </RBox>
      {legs.map(([x, y]) => (
        <group key={`${x},${y}`}>
          <RBox at={[x, y, (h - t + 40) / 2]} size={[50, 50, h - t - 40]} radius={3}>
            {paint}
          </RBox>
          {/* levelling foot: a threaded stem and a rubber pad */}
          <mesh position={[m(x), m(y), m(28)]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[m(8), m(8), m(30), 12]} />
            <meshStandardMaterial color="#c9cfd6" metalness={0.8} roughness={0.3} />
          </mesh>
          <mesh position={[m(x), m(y), m(7)]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[m(30), m(34), m(14), 20]} />
            <meshStandardMaterial color="#25292e" roughness={0.8} />
          </mesh>
        </group>
      ))}
      {/* the apron under the top and the rails of the lower shelf, on all four sides */}
      {[h - t - 40, 140].map((z) => (
        <group key={z}>
          {[-1, 1].map((s) => (
            <group key={s}>
              <RBox at={[cx, cy + s * (id / 2), z]} size={[iw, 40, 60]} radius={2}>
                {paint}
              </RBox>
              <RBox at={[cx + s * (iw / 2), cy, z]} size={[40, id, 60]} radius={2}>
                {paint}
              </RBox>
            </group>
          ))}
        </group>
      ))}
      <RBox at={[cx, cy, 168]} size={[iw - 20, id - 20, 4]} radius={1}>
        <meshStandardMaterial color="#8e979f" roughness={0.5} metalness={0.5} />
      </RBox>
      <group position={[0, 0, m(170)]}>{children}</group>
      <Blob at={[cx, cy]} w={w} d={d} k={0.3} />
    </group>
  );
}

/** A grey steel control box with a door, its handle and a warning sticker (on the cell bench's lower shelf). */
function ControlBox({ at, size }: { at: Xy; size: readonly [number, number, number] }) {
  const [sx, sy, sz] = size;
  const [x, y] = at;
  return (
    <group>
      <RBox at={[x, y, sz / 2]} size={[sx, sy, sz]} radius={6}>
        <meshStandardMaterial color="#d5d9dd" roughness={0.5} metalness={0.2} />
      </RBox>
      <RBox at={[x + sx / 2 + 2, y, sz / 2]} size={[4, sy - 30, sz - 30]} radius={3}>
        <meshStandardMaterial color="#cdd2d7" roughness={0.45} metalness={0.2} />
      </RBox>
      <RBox at={[x + sx / 2 + 8, y - sy / 2 + 50, sz / 2]} size={[10, 14, 70]} radius={3}>
        <meshStandardMaterial color="#2b3038" roughness={0.5} />
      </RBox>
      <mesh position={[m(x + sx / 2 + 4.5), m(y + 30), m(sz - 70)]} rotation={[Math.PI / 2, Math.PI / 2, 0]}>
        <circleGeometry args={[m(28), 3]} />
        <meshStandardMaterial color="#f2c230" roughness={0.5} />
      </mesh>
    </group>
  );
}

/** An emergency stop on the bench's edge: a yellow box with a red mushroom button. */
function EStop({ at }: { at: Xy }) {
  const [x, y] = at;
  return (
    <group>
      <RBox at={[x, y, 24]} size={[56, 56, 48]} radius={5}>
        <meshStandardMaterial color="#f2c230" roughness={0.45} />
      </RBox>
      <mesh position={[m(x), m(y), m(53)]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[m(11), m(13), m(10), 20]} />
        <meshStandardMaterial color="#2b3038" roughness={0.5} />
      </mesh>
      <mesh position={[m(x), m(y), m(63)]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[m(19), m(19), m(11), 24]} />
        <meshStandardMaterial color="#d92d20" roughness={0.35} />
      </mesh>
    </group>
  );
}

/** A wooden pallet (1200 × 1000) on the floor with `layers` of cartons on it. */
function PalletLoad({ at, yaw = 0, layers = 2, color = '#c8925a' }: { at: Xy; yaw?: number; layers?: number; color?: string }) {
  const wood = <meshStandardMaterial color="#b88b58" roughness={0.85} />;
  const box: [number, number, number] = [390, 320, 280];
  return (
    <group position={[m(at[0]), m(at[1]), 0]} rotation={[0, 0, yaw]}>
      {[-1, 0, 1].map((k) => (
        <RBox key={`b${k}`} at={[0, k * 440, 50]} size={[1200, 100, 100]} radius={4}>
          {wood}
        </RBox>
      ))}
      {[-4, -2, 0, 2, 4].map((k) => (
        <RBox key={`t${k}`} at={[k * 130, 0, 122]} size={[100, 1000, 22]} radius={3}>
          {wood}
        </RBox>
      ))}
      {Array.from({ length: layers }, (_, l) =>
        [-1, 0, 1].flatMap((i) =>
          [-1, 1].map((j) => (
            <group key={`${l}${i}${j}`} position={[m(i * (box[0] + 6)), m(j * (box[1] / 2 + 3) * 1.4), m(133 + box[2] / 2 + l * (box[2] + 2))]}>
              <CardBox size={box} color={color} />
            </group>
          )),
        ),
      )}
      <Blob at={[0, 0]} w={1200} d={1000} k={0.3} />
    </group>
  );
}

/**
 * The main line behind the cell, at real size: a 560 mm belt 850 mm up on steel stands, guide rails
 * both sides, cartons riding from the in-feed end (local +y) to the out-feed end; placed by `at`, `yaw`.
 */
function MainLine({ at, yaw = 0, len = 4000, speed = 220, gap = 1100 }: { at: Xy; yaw?: number; len?: number; speed?: number; gap?: number }) {
  const B: BeltGeometry = { x: 0, width: 560, top: 850, yIn: len / 2, yOut: -len / 2 };
  const tex = useMemo(() => {
    const t = beltTex([4, len / 160]).clone();
    t.needsUpdate = true;
    return t;
  }, [len]);
  useEffect(() => () => tex.dispose(), [tex]);
  const refs = useRef<(Group | null)[]>([]);
  const n = Math.max(1, Math.floor(len / gap));
  const box: [number, number, number] = [400, 320, 260];
  const clock = useAmbientClock(1.7);
  useFrame((_, dt) => {
    const t = clock.tick(dt);
    if (t === null) return;
    scroll(tex, (t * speed) / 160);
    refs.current.forEach((r, i) => {
      if (!r) return;
      const d = (t * speed + i * gap) % (n * gap);
      r.visible = d < len - box[1];
      r.position.set(0, m(B.yIn - box[1] / 2 - d), m(B.top + box[2] / 2));
    });
  });
  const stands = Array.from({ length: Math.floor(len / 1200) + 1 }, (_, i) => -len / 2 + 150 + (i * (len - 300)) / Math.floor(len / 1200));
  const paint = <meshStandardMaterial color={FRAME} roughness={0.45} metalness={0.35} />;
  const half = B.width / 2 + 30;
  return (
    <group position={[m(at[0]), m(at[1]), 0]} rotation={[0, 0, yaw]}>
      <BeltConveyor tex={tex} belt={B} />
      {/* The line's steel stands: two posts, a beam under the belt and one low down, feet. */}
      {stands.map((y) => (
        <group key={y}>
          {[-1, 1].map((s) => (
            <group key={s}>
              <RBox at={[s * half, y, (B.top - 40) / 2 + 10]} size={[50, 50, B.top - 60]} radius={3}>
                {paint}
              </RBox>
              <RBox at={[s * half, y, 6]} size={[90, 90, 12]} radius={3}>
                <meshStandardMaterial color="#25292e" roughness={0.8} />
              </RBox>
            </group>
          ))}
          {[B.top - 60, 220].map((z) => (
            <RBox key={z} at={[0, y, z]} size={[2 * half, 40, 50]} radius={2}>
              {paint}
            </RBox>
          ))}
        </group>
      ))}
      {/* The side frames (a heavier channel than the cell's small conveyor) and the guide rails over the belt. */}
      {[-1, 1].map((s) => (
        <group key={s}>
          <RBox at={[s * (B.width / 2 + 22), 0, B.top - 30]} size={[30, len + 60, 90]} radius={3}>
            {paint}
          </RBox>
          <RBox at={[s * (B.width / 2 - 10), 0, B.top + 110]} size={[16, len, 30]} radius={4}>
            <meshStandardMaterial color="#d6dbe0" metalness={0.7} roughness={0.35} />
          </RBox>
          {Array.from({ length: Math.floor(len / 800) }, (_, i) => -len / 2 + 400 + i * 800).map((y) => (
            <RBox key={y} at={[s * (B.width / 2 + 10), y, B.top + 50]} size={[12, 20, 150]} radius={2}>
              <meshStandardMaterial color="#aeb6bf" metalness={0.7} roughness={0.35} />
            </RBox>
          ))}
        </group>
      ))}
      {/* The drive: a gear motor under the in-feed end. */}
      <group position={[m(half + 80), m(len / 2 - 200), m(B.top - 120)]}>
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[m(75), m(75), m(220), 24]} />
          <meshStandardMaterial color={LINE_BLUE} roughness={0.4} metalness={0.2} />
        </mesh>
        <RBox at={[-110, 0, 0]} size={[120, 180, 180]} radius={10}>
          <meshStandardMaterial color="#3a4350" roughness={0.5} />
        </RBox>
      </group>
      {Array.from({ length: n }, (_, i) => (
        <group
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
        >
          <CardBox size={box} color={['#c8925a', '#b9824d', '#d2a06a'][i % 3]} />
        </group>
      ))}
      <Blob at={[0, 0]} w={B.width + 200} d={len + 200} k={0.25} />
    </group>
  );
}

/** A board on two legs (a notice board, the line's production board): `lines` of text, facing `yaw` (0: −y). */
function NoticeBoard({ at, yaw = 0, w = 1000, h = 700, lines, fg = '#1d2025', bg = '#ffffff' }: { at: Xy; yaw?: number; w?: number; h?: number; lines: readonly string[]; fg?: string; bg?: string }) {
  const tex = useTextTexture(lines, w, h, fg, bg, 1);
  const z = 1350;
  return (
    <group position={[m(at[0]), m(at[1]), 0]} rotation={[0, 0, yaw]}>
      {[-1, 1].map((s) => (
        <group key={s}>
          <RBox at={[s * (w / 2 + 20), 0, (z + h / 2) / 2]} size={[36, 36, z + h / 2]} radius={4}>
            <meshStandardMaterial color="#aeb6bf" metalness={0.7} roughness={0.35} />
          </RBox>
          <RBox at={[s * (w / 2 + 20), 0, 12]} size={[60, 500, 24]} radius={4}>
            <meshStandardMaterial color="#3a4350" roughness={0.6} />
          </RBox>
        </group>
      ))}
      <RBox at={[0, 8, z]} size={[w + 40, 20, h + 40]} radius={6}>
        <meshStandardMaterial color="#d6dbe0" metalness={0.5} roughness={0.4} />
      </RBox>
      <mesh position={[0, m(-2.5), m(z)]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[m(w), m(h)]} />
        <meshStandardMaterial map={tex} roughness={0.6} />
      </mesh>
    </group>
  );
}

/** Words painted on the floor (an aisle's name), reading from `rot` (rad, about z). */
function FloorWords({ at, w, h, rot = 0, lines, fg = '#ffffff', bg = '#2f8f5b' }: { at: Xy; w: number; h: number; rot?: number; lines: readonly string[]; fg?: string; bg?: string }) {
  const tex = useTextTexture(lines, w, h, fg, bg, 1);
  return (
    <mesh position={[m(at[0]), m(at[1]), m(0.8)]} rotation={[0, 0, rot]} receiveShadow>
      <planeGeometry args={[m(w), m(h)]} />
      <meshStandardMaterial map={tex} roughness={0.6} />
    </mesh>
  );
}

/** A floor marking: a closed rectangle of tape (x0 … x1, y0 … y1), mm. */
function TapeBox({ x0, x1, y0, y1, w = 60, color, hazard }: { x0: number; x1: number; y0: number; y1: number; w?: number; color?: string; hazard?: ReturnType<typeof useHazard> }) {
  return (
    <group>
      <Tape a={[x0, y0]} b={[x1, y0]} w={w} color={color} hazard={hazard} />
      <Tape a={[x0, y1]} b={[x1, y1]} w={w} color={color} hazard={hazard} />
      <Tape a={[x0, y0]} b={[x0, y1]} w={w} color={color} hazard={hazard} />
      <Tape a={[x1, y0]} b={[x1, y1]} w={w} color={color} hazard={hazard} />
    </group>
  );
}

/* Shelf levels of the packed models (their boards' tops above the floor), mm. */
const SHELF_LEVELS = [130, 640, 1150, 1650];
const RACK_LEVELS = [430, 920, 1410];

/** A steel shelving unit (Poly Haven) facing `yaw` with crates, totes and cartons on its boards. */
function PartsShelf({ at, yaw = 0, kind = 'shelf' }: { at: Xy; yaw?: number; kind?: 'shelf' | 'rack' }) {
  const lv = kind === 'shelf' ? SHELF_LEVELS : RACK_LEVELS;
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  // A point `u` along the shelf's width (its local x), on the board's middle.
  const p = (u: number): Xy => [at[0] + u * c, at[1] + u * s];
  return (
    <group>
      <Model group="factory" name={kind} at={at} yaw={yaw} />
      <Model group="factory" name="crate" at={p(-250)} z={lv[0]} yaw={yaw} />
      <Model group="factory" name="crate" at={p(250)} z={lv[0]} yaw={yaw} />
      <Model group="factory" name="tote" at={p(-220)} z={lv[1]} yaw={yaw + Math.PI / 2} scale={0.8} />
      <Model group="factory" name="crate" at={p(250)} z={lv[1]} yaw={yaw} />
      <Model group="factory" name="crate" at={p(250)} z={lv[1] + 254} yaw={yaw} />
      <group position={[m(p(-200)[0]), m(p(-200)[1]), m(lv[2] + 150)]} rotation={[0, 0, yaw]}>
        <CardBox size={[380, 300, 300]} color="#c8925a" />
      </group>
      <group position={[m(p(210)[0]), m(p(210)[1]), m(lv[2] + 110)]} rotation={[0, 0, yaw]}>
        <CardBox size={[340, 300, 220]} color="#b9824d" />
      </group>
      <Blob at={at} w={1100} d={500} k={0.3} rot={yaw} />
    </group>
  );
}

/**
 * The cell's steel work bench (its top is the robot frame's z = 0) and the factory floor round it,
 * FACTORY_BENCH_MM below: the cell's safety marking, the next station (another arm on its own bench),
 * the main line behind with cartons riding by, parts shelving with crates and totes, finished goods on
 * pallets, the line's production board and notice board, two workers, the AGV aisle. The bench, its
 * control box, e-stop, signal tower and safety tape are the cell itself and always drawn; the rest only
 * with 현장 주변 on.
 */
export function FactoryAround() {
  const hazard = useHazard();
  return (
    <group position={[0, 0, m(-FACTORY_BENCH_MM)]}>
      <Surround>
        <Hall band={LINE_BLUE} x={-2900} y={3100} h={3200} />
      </Surround>
      {/* The cell's bench: a steel table under the arm and its belt, the control box and a tote below. */}
      <SteelTable x0={-300} x1={520} y0={-420} y1={580} h={FACTORY_BENCH_MM}>
        <ControlBox at={[-40, 280]} size={[420, 380, 420]} />
        <Model group="factory" name="tote" at={[-130, -160]} yaw={Math.PI / 2} scale={0.85} />
      </SteelTable>
      <group position={[0, 0, m(FACTORY_BENCH_MM)]}>
        <EStop at={[480, 535]} />
        <Model group="factory" name="signalTower" at={[-255, -380]} h={320} />
      </group>
      {/* The robot cell's floor marking: hazard tape round the bench. */}
      <TapeBox x0={-650} x1={900} y0={-780} y1={940} w={70} hazard={hazard} />
      <Surround>
        {/* The next station: another arm on its own bench moving parts between two fixtures. */}
        <group position={[m(NEXT[0]), m(NEXT[1]), 0]} rotation={[0, 0, NEXT_YAW]}>
          <SteelTable x0={70 - 315} x1={70 + 315} y0={-240} y1={240} h={FACTORY_BENCH_MM - 18} inset={31}>
            <Model group="factory" name="crate" at={[70, 0]} />
          </SteelTable>
        </group>
        <WorkingArm
          at={NEXT}
          yaw={NEXT_YAW}
          job={{
            pick: [150, -95, 25],
            place: [150, 95, 25],
            period: 9,
            block: '#d9622b',
          }}
          phase={2.5}
          table={[600, 450, FACTORY_BENCH_MM]}
        />
        <group position={[0, 0, m(FACTORY_BENCH_MM)]}>
          <Model group="factory" name="signalTower" at={[NEXT[0] - 230, NEXT[1] + 150]} h={320} />
        </group>
        {/* The main line behind: a real belt with cartons riding by, two workers beyond it, its production board in front. */}
        <MainLine at={[200, 2100]} yaw={-Math.PI / 2} len={4600} />
        <Model group="people" name="workerWoman" at={[-700, 2700]} yaw={0.4} pose="Idle" />
        <Model group="people" name="workerMan" at={[-2050, 2650]} yaw={-0.5} pose="Idle" />
        <group position={[m(-300), m(1720), 0]}>
          <RBox at={[0, 0, 600]} size={[60, 60, 1200]} radius={4}>
            <meshStandardMaterial color="#aeb6bf" metalness={0.7} roughness={0.35} />
          </RBox>
          <RBox at={[0, 0, 12]} size={[360, 360, 24]} radius={4}>
            <meshStandardMaterial color="#3a4350" roughness={0.6} />
          </RBox>
        </group>
        <Monitor at={[-270, 1700]} z={1080} stand={false} yaw={-0.97} w={560} kind="line" accent={LINE_BLUE} title="2라인 · 생산 현황" />
        {/* The aisle between the cells and the line: its lines, its name on the floor, the AGV going up and down it. */}
        <Tape a={[-2100, 1150]} b={[2400, 1150]} w={80} color="#f2c230" />
        <Tape a={[-2100, 1600]} b={[2400, 1600]} w={80} color="#f2c230" />
        <FloorWords at={[700, 1375]} w={900} h={220} lines={['보행자 · AGV 통로']} />
        <RouteAgv
          route={[
            [-1900, 1280],
            [1900, 1280],
            [1900, 1470],
            [-1900, 1470],
          ]}
          speed={260}
          cargo={
            <RBox at={[0, 0, 30]} size={[200, 150, 60]} radius={4}>
              <meshStandardMaterial color={LINE_BLUE} roughness={0.5} />
            </RBox>
          }
        />
        {/* Parts shelving along the back wall, the notice board, a hand truck and finished goods on a pallet. */}
        <PartsShelf at={[-2500, 350]} yaw={Math.PI / 2} />
        <PartsShelf at={[-2500, -850]} yaw={Math.PI / 2} kind="rack" />
        <NoticeBoard at={[-2650, 1250]} yaw={1.25} w={800} h={560} lines={['2라인 · 부품 분류 셀', '안전 수칙', '로봇 작업 중 안전선 안 출입 금지', '비상 시 비상 정지 버튼', '안전모 · 안전화 착용']} />
        <Model group="factory" name="handTruck" at={[-1900, 1000]} yaw={2.2} />
        <PalletLoad at={[-2000, -1700]} yaw={Math.PI / 2} />
      </Surround>
    </group>
  );
}
