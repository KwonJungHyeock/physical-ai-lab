'use client';

/**
 * A 실습 셀 drawn around the arm (engine/simulator/cell/cells.ts has its geometry and the solids the
 * arm and the physics know): an industrial cell at 1/5 of shop size — the robot on a pedestal over a
 * concrete floor, the equipment on aluminium-profile frames down to the floor (cell/kit.tsx), each
 * cell's own equipment in cell/cellA … cellE.tsx, the control cabinet and the guard fence in every one.
 *
 * What moves is read from the world every frame (the belt, pushers, doors, chucks, clamps, beams, lamps).
 */

import { Html } from '@react-three/drei';
import { useState, type ReactNode, type RefObject } from 'react';

import { cellLayout, type CellId } from '@/engine/simulator/cell/cells';
import type { WorldState } from '@/engine/simulator/sim';

import { Feeder } from './cell/cellA';
import { VisionCell } from './cell/cellB';
import { InspectCell } from './cell/cellC';
import { TendCell } from './cell/cellD';
import { AssemblyCell } from './cell/cellE';
import { Backdrop, Cabinet, Conveyor, Fence, Floor, MarkedPlate, Pedestal, StackGlow, Tagged, m } from './cell/kit';

type Tags = Record<string, { at: [number, number, number]; note: string }>;

/** Where each cell's control cabinet stands (behind the robot, clear of its equipment), mm. */
const CABINET: Record<CellId, { x: number; y: number }> = {
  feed: { x: -80, y: -300 },
  vision: { x: -80, y: -300 },
  inspect: { x: -80, y: -300 },
  tend: { x: -80, y: 170 },
  assembly: { x: -80, y: -300 },
};
const cabinetTag = (cell: CellId): Tags => ({ 제어함: { at: [CABINET[cell].x, CABINET[cell].y, 130], note: '경광등 · 신호 램프 · 비상 정지' } });

/** Where each piece of equipment's name tag floats (mm), cell by cell. */
const TAGS: Record<CellId, Tags> = {
  feed: {
    매거진: { at: [310, -370, 285], note: '부품을 쌓아 두는 통 · 있음 센서' },
    '공급 실린더': { at: [445, -370, 80], note: '맨 아래 부품을 벨트로 밀어요' },
    컨베이어: { at: [225, -200, 60], note: '부품을 끝까지 실어 날라요' },
    '끝 센서': { at: [225, 12, 70], note: '빛이 끊기면 부품이 도착한 거예요' },
    '소재 판': { at: [130, -140, 45], note: '번호 칸 1~9' },
    '적재 판': { at: [130, 130, 45], note: '빨간 칸이 기준 자리' },
    ...cabinetTag('feed'),
  },
  vision: {
    컨베이어: { at: [225, -260, 60], note: '부품을 끝까지 실어 날라요' },
    '위 카메라': { at: [225, -112, 300], note: '부품의 색 · 크기 · 모양 · 위치를 읽어요' },
    '끝 센서': { at: [225, 6, 70], note: '빛이 끊기면 부품이 도착한 거예요' },
    분류함: { at: [125, 135, 75], note: '판정대로 함 1 · 2 · 3에' },
    '불량 슈트': { at: [110, -160, 60], note: '판정이 확실하지 않은 부품은 여기로' },
    ...cabinetTag('vision'),
  },
  inspect: {
    컨베이어: { at: [225, -150, 60], note: '부품을 검사대 사이로 실어 날라요' },
    '높이 센서': { at: [225, -385, 90], note: '부품 높이가 맞는지 봐요' },
    '근접 센서': { at: [255, -320, 70], note: '금속 (주황) · 비금속 (파랑)을 가려요' },
    '배출 실린더': { at: [94, -250, 80], note: '불량을 벨트 밖으로 밀어 내요' },
    불량함: { at: [297, -250, 50], note: '밀려난 불량이 모여요' },
    스토퍼: { at: [225, -6, 100], note: '부품을 세워 로봇이 집게 해요' },
    '양품 트레이': { at: [130, 130, 45], note: '빨간 칸부터 채워요' },
    '비금속 트레이': { at: [130, -140, 45], note: '비금속 양품을 따로 담아요' },
    ...cabinetTag('inspect'),
  },
  tend: {
    'CNC 머신': { at: [65, -290, 250], note: '문이 닫히고 척이 잠겨야 가공해요' },
    문: { at: [65, -170, 175], note: '로봇이 드나드는 앞문 · 미닫이' },
    척: { at: [65, -230, 60], note: '소재를 물고 돌려요' },
    '소재 트레이': { at: [130, -20, 45], note: '가공할 소재 · 번호 칸 1~9' },
    '완성품 트레이': { at: [130, 100, 45], note: '가공이 끝난 부품' },
    '라이트 커튼': { at: [215, 40, 130], note: '사람이 들어오면 멈춰요' },
    ...cabinetTag('tend'),
  },
  assembly: {
    '진동 피더': { at: [85, -255, 110], note: '핀을 한 줄로 내보내요' },
    '핀 트랙': { at: [130, -165, 60], note: '집는 자리에 핀이 하나씩' },
    작업대: { at: [95, -205, 40], note: '피더와 트랙을 얹은 대' },
    '하우징 컨베이어': { at: [200, 220, 60], note: '하우징을 지그까지 실어 와요' },
    '클램프 지그': { at: [230, 40, 90], note: '하우징을 붙잡아 움직이지 않게 해요' },
    '완성 상자': { at: [200, -150, 50], note: '핀을 다 꽂은 하우징이 모여요' },
    ...cabinetTag('assembly'),
  },
};

/** Each cell's painted work area on the floor, mm. */
const ZONE: Record<CellId, { x0: number; x1: number; y0: number; y1: number }> = {
  feed: { x0: -170, x1: 520, y0: -450, y1: 240 },
  vision: { x0: -170, x1: 330, y0: -470, y1: 250 },
  inspect: { x0: -170, x1: 360, y0: -480, y1: 230 },
  tend: { x0: -170, x1: 280, y0: -400, y1: 230 },
  assembly: { x0: -170, x1: 310, y0: -340, y1: 350 },
};

/**
 * What the camera frames in each cell (the stage's 'home' and 'fit' views), mm, and where the home
 * view looks from (a three.js direction: x the robot's front, y up, z the robot's right): from the
 * front right, the belt (or D's machine, at the robot's right with its door towards it) across the
 * picture.
 */
export const CELL_VIEW: Record<CellId, { min: readonly [number, number, number]; max: readonly [number, number, number]; home: readonly [number, number, number] }> = {
  feed: { min: [-60, -405, -30], max: [480, 180, 110], home: [1, 0.95, -0.55] },
  vision: { min: [-60, -420, -30], max: [300, 220, 250], home: [1, 0.95, -0.55] },
  inspect: { min: [-60, -450, -30], max: [340, 190, 90], home: [1, 0.95, -0.55] },
  tend: { min: [-80, -370, -30], max: [240, 180, 210], home: [1, 0.95, -0.55] },
  assembly: { min: [-60, -320, -30], max: [280, 340, 90], home: [1, 0.95, -0.55] },
};

function FeedCell({ world, onHover }: { world: RefObject<WorldState | null>; onHover: (n: string | null) => void }) {
  return (
    <>
      <Tagged name="컨베이어" onHover={onHover}>
        <Conveyor world={world} l={cellLayout('feed')} />
      </Tagged>
      <Feeder world={world} onHover={onHover} />
      <Tagged name="소재 판" onHover={onHover}>
        <MarkedPlate cell="feed" grid="소재 판" jig />
      </Tagged>
      <Tagged name="적재 판" onHover={onHover}>
        <MarkedPlate cell="feed" grid="적재 판" origin />
      </Tagged>
    </>
  );
}

const EQUIPMENT: Record<CellId, (p: { world: RefObject<WorldState | null>; onHover: (n: string | null) => void }) => ReactNode> = {
  feed: FeedCell,
  vision: VisionCell,
  inspect: InspectCell,
  tend: TendCell,
  assembly: AssemblyCell,
};

export default function CellScene({ world, cell, tags = [] }: { world: RefObject<WorldState | null>; cell: CellId; tags?: readonly string[] }) {
  const [hover, setHover] = useState<string | null>(null);
  const T = TAGS[cell];
  const shown = [...new Set([...tags, ...(hover ? [hover] : [])])].filter((n) => T[n]);
  const Equipment = EQUIPMENT[cell];
  return (
    <group>
      <Backdrop />
      <Floor box={ZONE[cell]} />
      <Fence />
      <Pedestal />
      <Equipment world={world} onHover={setHover} />
      <Tagged name="제어함" onHover={setHover}>
        <Cabinet world={world} cell={cell} at={CABINET[cell]} />
      </Tagged>
      <StackGlow world={world} at={CABINET[cell]} />
      {shown.map((n) => (
        <Html key={n} position={[m(T[n].at[0]), m(T[n].at[1]), m(T[n].at[2])]} center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
          <div data-celltag style={{ background: 'rgba(24,32,29,0.92)', color: '#fff', borderRadius: 7, padding: '4px 9px', font: '700 12.5px Pretendard, sans-serif', whiteSpace: 'nowrap', boxShadow: '0 2px 8px rgba(0,0,0,0.25)' }}>
            {n}
            <span style={{ display: 'block', fontWeight: 500, fontSize: 11, opacity: 0.8 }}>{T[n].note}</span>
          </div>
        </Html>
      ))}
    </group>
  );
}
