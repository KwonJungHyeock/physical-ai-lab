'use client';

/**
 * 에너지·자원순환: round the sorting cell (robot frame, mm; see ../Around.tsx).
 */

import { RBox } from '../../../../simulator/stage/sceneKit';
import { Sign, Steel, Tape } from '../../CellKit';
import type { SiteLook } from '../Ground';
import { Blob } from '../Ground';
import { Hall } from '../Hall';
import { Monitor, RunningBelt, SignalTower, WorkingArm } from '../Props';

type Xy = readonly [number, number];

export const ENERGY_LOOK: SiteLook = { sky: '#d5e0da', floor: 'concrete' };

/* --- 에너지 · 자원순환 ------------------------------------------------------------------------ */

/** The sorting hall's look: a pale green-grey sky over a concrete floor. */

/** A pressed bale of one kind (cans, PET, paper): a block with its two steel straps. */
function Bale({ at, color, z = 0 }: { at: Xy; color: string; z?: number }) {
  return (
    <group>
      <RBox at={[at[0], at[1], z + 110]} size={[260, 220, 220]} radius={10}>
        <meshStandardMaterial color={color} roughness={0.85} />
      </RBox>
      {[-60, 60].map((dx) => (
        <RBox key={dx} at={[at[0] + dx, at[1], z + 110]} size={[8, 224, 224]} radius={2} shadow={false}>
          <Steel />
        </RBox>
      ))}
      {z === 0 && <Blob at={at} w={280} d={240} />}
    </group>
  );
}

/** The sorting hall round the cell: the main line's belt with a sorting arm at it, pressed bales of each kind, the line's screen and sign. */
export function EnergyAround() {
  return (
    <group>
      <Hall band="#0b8a7a" wall="#e4e9e6" />
      <RunningBelt at={[-80, 720]} yaw={Math.PI / 2} belt={{ x: 0, width: 110, top: 70, yIn: 420, yOut: -380 }} speed={45} gap={130} boxes={['#c3cad2', '#cfe8f7', '#3c8f5c', '#f08a24', '#b9824d']} />
      <WorkingArm
        at={[-300, 1080]}
        yaw={-Math.PI / 2}
        job={{
          pick: [150, -95, 25],
          place: [150, 95, 25],
          period: 7,
          block: '#c3cad2',
        }}
        phase={0.8}
      />
      <Bale at={[-900, 200]} color="#b9c1c9" />
      <Bale at={[-900, 200]} z={220} color="#aab3bc" />
      <Bale at={[-900, 480]} color="#cfe3ef" />
      <Bale at={[-1200, 200]} color="#b08a5a" />
      <Bale at={[-1200, 480]} color="#5f8f6b" />
      <Tape a={[-700, -100]} b={[-700, 1300]} w={10} color="#f2c230" />
      <SignalTower at={[-470, 480]} h={210} />
      <Monitor at={[-470, 300]} yaw={-0.6} w={170} kind="plot" accent="#0b8a7a" title="재활용률 · 처리량 (개/분)" />
      <Sign at={[-1050, 660, 300]} w={220} h={60} lines={['자원순환센터 · 선별동', '캔 · PET · 종이팩', '비우고 · 헹구고 · 분리해요']} fg="#ffffff" bg="#0b8a7a" />
    </group>
  );
}
