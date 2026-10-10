'use client';

/**
 * 스마트시티: round the café bar (①②) and the resident's room (③) (robot frame, mm; see ../Around.tsx).
 */

import { RBox } from '../../../../simulator/stage/sceneKit';
import { m } from '../../CellKit';
import Model from '../Model';
import { Hall } from '../Hall';
import { CAFE_COUNTER_MM, CARE_ARM_Z, Monitor, RouteAgv, Steam, WorkingArm } from '../Props';

type Xy = readonly [number, number];

/* --- 서비스 카페 --------------------------------------------------------------------------- */

/** A small café table with two chairs and a cup on it, steaming. */
/** A café table with two chairs and a steaming cup on it, at real size on the floor (z = 0 of its group). */
function CafeTable({ at, phase = 0, yaw = 0 }: { at: Xy; phase?: number; yaw?: number }) {
  const [x, y] = at;
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return (
    <group>
      <Model group="cafe" name="table" at={at} yaw={yaw} />
      {[-1, 1].map((k) => (
        <Model key={k} group="cafe" name="chair" at={[x + k * 640 * c, y + k * 640 * s]} yaw={yaw + (k > 0 ? -Math.PI / 2 : Math.PI / 2)} />
      ))}
      <group position={[m(x + 120), m(y - 60), m(754)]}>
        <mesh position={[0, 0, m(45)]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[m(40), m(30), m(90), 20]} />
          <meshStandardMaterial color="#fbfaf7" roughness={0.5} />
        </mesh>
        <mesh position={[0, 0, m(82)]}>
          <circleGeometry args={[m(36), 20]} />
          <meshStandardMaterial color="#4a2511" roughness={0.3} />
        </mesh>
      </group>
      <Steam at={[x + 120, y - 60]} z={850} n={5} r={14} rise={160} phase={phase} />
    </group>
  );
}

/**
 * The café round the robot bar, at real size on the floor CAFE_COUNTER_MM below the counter top:
 * tables with steaming cups, a serving robot doing its round, the back bar with the second robot,
 * the order screen, a plant and the menu board.
 */
export function CafeAround() {
  return (
    <group position={[0, 0, m(-CAFE_COUNTER_MM)]}>
      <Hall band="#b4530f" wall="#efe6da" x={-2600} y={2600} h={3000} />
      <CafeTable at={[-1700, 900]} />
      <CafeTable at={[-1700, -600]} phase={1.3} />
      <CafeTable at={[-200, 1900]} phase={2.6} yaw={Math.PI / 2} />
      <RouteAgv
        route={[
          [-900, 300],
          [-900, 1500],
          [-1200, 1500],
          [-1200, 300],
        ]}
        speed={160}
        led="#f0a14a"
        cargo={
          <group>
            <mesh position={[0, 0, m(40)]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[m(8), m(8), m(80), 10]} />
              <meshStandardMaterial color="#e9e2d6" roughness={0.5} />
            </mesh>
            <mesh position={[0, 0, m(84)]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[m(110), m(110), m(8), 32]} />
              <meshStandardMaterial color="#efe6da" roughness={0.5} />
            </mesh>
            {[-40, 40].map((dx) => (
              <mesh key={dx} position={[m(dx), 0, m(102)]} rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[m(16), m(12), m(28), 20]} />
                <meshStandardMaterial color="#fbfaf7" roughness={0.5} />
              </mesh>
            ))}
          </group>
        }
      />
      {/* The back bar: a long counter, the second robot moving cups to the lids station, the order screen. */}
      <RBox at={[-560, 300, 450]} size={[600, 1400, 900]} radius={6}>
        <meshStandardMaterial color="#5c3b23" roughness={0.6} />
      </RBox>
      <RBox at={[-560, 300, 905]} size={[620, 1420, 10]} radius={3}>
        <meshStandardMaterial color="#efe6da" roughness={0.4} />
      </RBox>
      <WorkingArm
        at={[-420, 900]}
        yaw={Math.PI}
        job={{
          pick: [150, -95, 40],
          place: [150, 95, 40],
          period: 10,
          item: 'cup',
        }}
        phase={2}
        table={[380, 260, 910]}
      />
      <Monitor at={[-640, 80]} z={910} yaw={-0.25} w={300} kind="orders" accent="#f0a14a" title="주문 현황" />
      <Steam at={[-560, 420]} z={930} n={4} r={10} rise={90} phase={0.7} />
      <Model group="cafe" name="plant" at={[1100, -1300]} />
      <Model group="cafe" name="chalkboard" at={[-1100, -1500]} yaw={-0.4} />
    </group>
  );
}

/* --- 스마트시티 돌봄 (카페 ③) ------------------------------------------------------------------ */

/**
 * A care bed at real size (along x, head at −x, turned by `yaw` about its centre): a frame on four castors, a mattress with its back
 * section raised, side rails, head and foot boards, a folded blanket and a pillow; `z` is the floor, mm.
 */
export function CareBed({ at, z = 0, yaw = 0, rails = 'both', blanket = '#9fc7b5' }: { at: Xy; z?: number; yaw?: number; rails?: 'both' | 'far'; blanket?: string }) {
  const x = 0;
  const y = 0;
  const L = 2000;
  const W = 920;
  const top = 520;
  const head = x - L / 2;
  const back = 650;
  const tilt = 0.5;
  const frame = <meshStandardMaterial color="#d6dbe0" metalness={0.55} roughness={0.35} />;
  const board = <meshStandardMaterial color="#c9b79c" roughness={0.55} />;
  return (
    <group position={[m(at[0]), m(at[1]), m(z)]} rotation={[0, 0, yaw]}>
      {[-1, 1].flatMap((sx) =>
        [-1, 1].map((sy) => (
          <group key={`${sx}${sy}`}>
            <RBox at={[x + sx * (L / 2 - 80), y + sy * (W / 2 - 70), (top - 180) / 2 + 60]} size={[40, 40, top - 180]} radius={4}>
              {frame}
            </RBox>
            <mesh position={[m(x + sx * (L / 2 - 80)), m(y + sy * (W / 2 - 70)), m(40)]}>
              <sphereGeometry args={[m(40), 16, 12]} />
              <meshStandardMaterial color="#3a3f46" roughness={0.6} />
            </mesh>
          </group>
        )),
      )}
      <RBox at={[x, y, top - 170]} size={[L - 80, W - 60, 60]} radius={8}>
        {frame}
      </RBox>
      {/* mattress: the flat part, and the back section raised */}
      <RBox at={[x + back / 2, y, top - 70]} size={[L - back - 60, W - 80, 140]} radius={30}>
        <meshStandardMaterial color="#f4f6f7" roughness={0.9} />
      </RBox>
      <group position={[m(head + back + 30), m(y), m(top - 140)]} rotation={[0, -tilt, 0]}>
        <RBox at={[-back / 2, 0, 70]} size={[back, W - 80, 140]} radius={30}>
          <meshStandardMaterial color="#f4f6f7" roughness={0.9} />
        </RBox>
        <RBox at={[-back + 140, 0, 175]} size={[200, W * 0.55, 80]} radius={30}>
          <meshStandardMaterial color="#ffffff" roughness={0.95} />
        </RBox>
      </group>
      <RBox at={[x + 420, y, top + 10]} size={[900, W - 60, 40]} radius={14}>
        <meshStandardMaterial color={blanket} roughness={0.95} />
      </RBox>
      <RBox at={[head + 20, y, top + 120]} size={[40, W, 520]} radius={10}>
        {board}
      </RBox>
      <RBox at={[x + L / 2 - 20, y, top - 10]} size={[40, W, 340]} radius={10}>
        {board}
      </RBox>
      {/* side rails along the upper half: both sides, or only the far one (+y) where someone sits on the near edge */}
      {(rails === 'both' ? [-1, 1] : [1]).map((sy) => (
        <group key={sy}>
          {[0, 1, 2].map((k) => (
            <RBox key={k} at={[head + 520, y + sy * (W / 2 + 10), top + 60 + k * 90]} size={[800, 22, 22]} radius={10}>
              {frame}
            </RBox>
          ))}
          {[-1, 1].map((e) => (
            <RBox key={e} at={[head + 520 + e * 380, y + sy * (W / 2 + 10), top + 100]} size={[22, 22, 220]} radius={10}>
              {frame}
            </RBox>
          ))}
        </group>
      ))}
    </group>
  );
}

/**
 * Round the resident's room (the floor CARE_ARM_Z below the arm, which stands on a myAGV and its lift column): the
 * room's walls, a second bed, the vital-signs screen, and the centre's delivery robot going up and
 * down the corridor with cups on its tray.
 */
export function CareAround() {
  const z = -CARE_ARM_Z;
  return (
    <group>
      <group position={[0, 0, m(z)]}>
        <Hall band="#3a8f6b" wall="#eef1ec" x={-2000} y={2000} />
        <RouteAgv
          route={[
            [-1300, -400],
            [-1300, 1500],
            [-1500, 1500],
            [-1500, -400],
          ]}
          speed={90}
          led="#3a8f6b"
          cargo={
            <group>
              <RBox at={[0, 0, 6]} size={[220, 160, 8]} radius={4}>
                <meshStandardMaterial color="#e6ebe4" roughness={0.6} />
              </RBox>
              {[-50, 0, 50].map((dx) => (
                <mesh key={dx} position={[m(dx), 0, m(26)]} rotation={[Math.PI / 2, 0, 0]}>
                  <cylinderGeometry args={[m(15), m(12), m(32), 18]} />
                  <meshStandardMaterial color="#fbfaf7" roughness={0.5} />
                </mesh>
              ))}
            </group>
          }
        />
      </group>
      <CareBed at={[-1700, 900]} z={z} blanket="#c9b3d9" />
      <RBox at={[-1600, -200, z / 2]} size={[400, 300, -z]} radius={4}>
        <meshStandardMaterial color="#c9b79c" roughness={0.6} />
      </RBox>
      <Monitor at={[-1600, -200]} yaw={0.9} w={260} kind="plot" accent="#3a8f6b" title="생체 신호" />
    </group>
  );
}
