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
import { useFrame } from '@react-three/fiber';
import { useRef, useState, type ReactNode, type RefObject } from 'react';

import { cellLayout, type CellId } from '@/engine/simulator/cell/cells';
import { guideOf } from '@/engine/simulator/cell/guides';
import { missionById } from '@/engine/simulator/cell/missions';
import { NARRATE_AT, NARRATED, type Narration } from '@/engine/simulator/cell/narrate';
import type { WorldState } from '@/engine/simulator/sim';

import { Feeder } from './cell/cellA';
import { VisionCell } from './cell/cellB';
import { InspectCell } from './cell/cellC';
import { TendCell } from './cell/cellD';
import { AssemblyCell } from './cell/cellE';
import { CafeCell } from './cell/cellF';
import { DrawCell } from './cell/cellG';
import { BoardCell } from './cell/cellH';
import GoalRing from './GoalRing';
import { Backdrop, Cabinet, Conveyor, Fence, Floor, MarkedPlate, Pedestal, StackGlow, Tagged, m } from './cell/kit';

type Tags = Record<string, { at: [number, number, number]; note: string }>;

/** Where each cell's control cabinet stands (behind the robot, clear of its equipment), mm. */
const CABINET: Record<CellId, { x: number; y: number }> = {
  feed: { x: -80, y: -300 },
  vision: { x: -80, y: -300 },
  inspect: { x: -80, y: -300 },
  tend: { x: -80, y: 170 },
  assembly: { x: -80, y: -300 },
  cafe: { x: -190, y: 210 },
  draw: { x: -190, y: 210 },
  board: { x: -190, y: 210 },
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
    '끝 센서': { at: [225, 15, 70], note: '빛이 끊기면 부품이 도착한 거예요' },
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
    '소재 트레이': { at: [130, 100, 45], note: '가공할 소재 · 번호 칸 1~9' },
    '완성품 트레이': { at: [130, -20, 45], note: '가공이 끝난 부품' },
    '대기 자리': { at: [80, -85, 45], note: '다음 소재를 문 앞에 미리 두는 곳' },
    '라이트 커튼': { at: [215, 40, 130], note: '사람이 들어오면 멈춰요' },
    ...cabinetTag('tend'),
  },
  assembly: {
    '진동 피더': { at: [85, -255, 110], note: '핀을 한 줄로 내보내요' },
    '핀 트랙': { at: [130, -165, 60], note: '집는 자리에 핀이 하나씩' },
    작업대: { at: [95, -205, 40], note: '피더와 트랙을 얹은 대' },
    '하우징 컨베이어': { at: [200, 220, 60], note: '하우징을 지그까지 실어 와요' },
    '클램프 지그': { at: [230, 40, 90], note: '하우징을 붙잡아 움직이지 않게 해요' },
    '완성 상자': { at: [200, -165, 50], note: '핀을 다 꽂은 하우징이 모여요' },
    ...cabinetTag('assembly'),
  },
  cafe: {
    '컵 디스펜서': { at: [95, 222, 175], note: '[컵 내리기] → 컵 준비됨' },
    제빙기: { at: [248, 116, 150], note: '[얼음] 3초 · 얼음 145 ml' },
    '커피 머신': { at: [278, 16, 150], note: '[추출 시작] 28초 · 2샷 60 ml · 컵 감지' },
    정수기: { at: [244, -85, 135], note: '[물] 4초 · 물 150 ml' },
    픽업대: { at: [98, -200, 120], note: '문이 열리면 손님이 가져가요 · 손 감지' },
    키오스크: { at: [372, -236, 160], note: '손님이 주문 · 결제 → 주문 번호' },
    셀프바: { at: [372, -150, 80], note: '뚜껑 · 빨대 · 냅킨' },
    ...cabinetTag('cafe'),
  },
  draw: {
    '커팅 매트': { at: [200, -90, 30], note: '눈금 = 로봇 좌표 x · y (mm) · 노란 표시가 늘 놓는 자리' },
    '메시지 카드': { at: [210, 0, 40], note: '120 × 80 mm · 왼쪽 아래 모서리가 기준점 · 카드 있음 센서' },
    '완성 램프': { at: [312, -140, 80], note: '켜지면 손님이 카드를 가져가요 · 손 감지' },
    '펜 꽂이': { at: [55, 135, 150], note: '여분 펜 · 펜 홀더에 끼워 써요' },
    '샘플 보드': { at: [-110, 150, 230], note: '로봇이 쓸 수 있는 글귀' },
  },
  board: {
    오목판: { at: [200, -40, 30], note: '9 × 9 · 줄 사이 16 mm · 가장자리 눈금 = 로봇 좌표 x · y (mm) · 판 센서' },
    '흰 돌 상자': { at: [136, 128, 40], note: '로봇의 흰 돌 15개 · 흡착 펌프로 집어요' },
    '검은 돌 통': { at: [200, -122, 50], note: '사람의 검은 돌' },
    '차례 램프': { at: [300, -128, 70], note: '초록 = 로봇 차례 · 사람 손이 판 위에 있으면 손 감지' },
  },
};

/** Each cell's painted work area on the floor, mm. */
const ZONE: Record<CellId, { x0: number; x1: number; y0: number; y1: number }> = {
  feed: { x0: -170, x1: 520, y0: -450, y1: 240 },
  vision: { x0: -170, x1: 330, y0: -470, y1: 250 },
  inspect: { x0: -170, x1: 360, y0: -480, y1: 230 },
  tend: { x0: -170, x1: 280, y0: -400, y1: 230 },
  assembly: { x0: -170, x1: 310, y0: -340, y1: 350 },
  cafe: { x0: -250, x1: 360, y0: -300, y1: 300 },
  draw: { x0: -250, x1: 360, y0: -300, y1: 300 },
  board: { x0: -250, x1: 360, y0: -300, y1: 300 },
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
  // 입문 현장 (카페 · 캘리그라피 · 보드게임): from behind the arm, high (the worker's view over its shoulder): up the picture is the
  // arm's front (X+), left its left (Y+), so the 제어 keys go the way the picture does, and the machines
  // read left to right in the drink's order (컵 → 얼음 → 커피 → 물 → 픽업).
  cafe: { min: [-60, -230, -20], max: [320, 250, 160], home: [-0.48, 1, 0] },
  draw: { min: [-60, -150, -10], max: [330, 170, 230], home: [-0.28, 1, 0] },
  board: { min: [-60, -150, -10], max: [320, 180, 230], home: [-0.28, 1, 0] },
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
  cafe: CafeCell,
  draw: DrawCell,
  board: BoardCell,
};

/** How long a 관찰 bubble stays after its moment, cell seconds. */
const CALLOUT_S = 5;

/** 단계 안내's 관찰 bubbles: each moment of the step, at its place, for a few seconds after it happens (입문 트랙). */
function Callouts({ world }: { world: RefObject<WorldState | null> }) {
  const [shown, setShown] = useState<string[]>([]);
  const key = useRef('');
  useFrame(() => {
    const run = world.current?.cell;
    const g = run?.mission === NARRATED ? null : guideOf(run?.mission ?? null);
    const ids = run && g ? g.observe.filter((o) => run.observed[o.id] !== undefined && run.line.t - run.observed[o.id] < CALLOUT_S).map((o) => o.id) : [];
    const k = `${run?.mission}:${ids.join(',')}`;
    if (k === key.current) return;
    key.current = k;
    setShown(ids);
  });
  const g = guideOf(world.current?.cell?.mission ?? null);
  if (!g) return null;
  return (
    <>
      {g.observe
        .filter((o) => shown.includes(o.id))
        .map((o) => (
          <Html key={o.id} position={[m(o.at[0]), m(o.at[1]), m(o.at[2])]} center zIndexRange={[22, 0]} style={{ pointerEvents: 'none' }}>
            <div data-callout style={{ position: 'relative', background: '#c2410c', color: '#fff', borderRadius: 9, padding: '6px 11px 6px 9px', font: '700 12.5px Pretendard, sans-serif', whiteSpace: 'nowrap', boxShadow: '0 6px 16px rgba(0,0,0,0.3)', transform: 'translateY(-24px)' }}>
              <span style={{ fontSize: 10.5, fontWeight: 800, opacity: 0.85, marginRight: 6 }}>관찰</span>
              {o.text}
              <i style={{ position: 'absolute', left: '50%', bottom: -6, marginLeft: -6, width: 0, height: 0, borderLeft: '6px solid transparent', borderRight: '6px solid transparent', borderTop: '6px solid #c2410c' }} />
            </div>
          </Html>
        ))}
    </>
  );
}

/** 주문 한 잔 따라가기 (로봇 카페 1단계): the line said now (CellRun.said, paced by Console), over the equipment it is about (narrate.ts). */
function Narrate({ world }: { world: RefObject<WorldState | null> }) {
  const [n, setN] = useState<Narration | null>(null);
  const key = useRef('');
  useFrame(() => {
    const run = world.current?.cell;
    const now = run && run.mission === NARRATED ? (run.said ?? null) : null;
    const k = now?.key ?? '';
    if (k === key.current) return;
    key.current = k;
    setN(now);
  });
  if (!n) return null;
  const at = NARRATE_AT[n.place];
  const tell = n.dir === 'in';
  return (
    <Html key={n.key} position={[m(at[0]), m(at[1]), m(at[2])]} center zIndexRange={[23, 0]} style={{ pointerEvents: 'none' }}>
      <div data-narrate style={{ position: 'relative', transform: 'translateY(-50%)', background: 'rgba(22,24,27,0.94)', color: '#f1f4f7', borderRadius: 12, padding: '9px 13px 10px', font: '600 14px Pretendard, sans-serif', whiteSpace: 'nowrap', boxShadow: '0 0 0 1px rgba(255,255,255,0.16), 0 8px 22px rgba(0,0,0,0.45)' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 7, font: '600 12px Pretendard, sans-serif', color: '#aab1b9', marginBottom: 4 }}>
          <i style={{ width: 8, height: 8, borderRadius: 4, background: tell ? '#34d399' : '#f1f4f7', boxShadow: `0 0 8px ${tell ? '#34d399' : '#ffffff'}` }} />
          {n.place} {tell ? '→ 로봇' : '← 로봇'}
          <b style={{ color: tell ? '#34d399' : '#fff', fontWeight: 700 }}>[{n.signal}]</b>
        </span>
        {n.text}
        <i style={{ position: 'absolute', left: '50%', bottom: -7, marginLeft: -7, width: 0, height: 0, borderLeft: '7px solid transparent', borderRight: '7px solid transparent', borderTop: '7px solid rgba(22,24,27,0.94)' }} />
      </div>
    </Html>
  );
}

/** A 해 보기 step's target for the tool tip (missions.ts `target`): a glowing ring and a tag. */
function TargetRing({ world }: { world: RefObject<WorldState | null> }) {
  const [at, setAt] = useState<[number, number, number] | null>(null);
  const key = useRef('');
  useFrame(() => {
    const id = world.current?.cell?.mission ?? '';
    if (id === key.current) return;
    key.current = id;
    setAt((id && missionById(id)?.target) || null);
  });
  if (!at) return null;
  return <GoalRing at={at} label="여기로 · 고리 안" />;
}

export default function CellScene({ world, cell, tags = [], callouts = false }: { world: RefObject<WorldState | null>; cell: CellId; tags?: readonly string[]; callouts?: boolean }) {
  const [hover, setHover] = useState<string | null>(null);
  const T = TAGS[cell];
  const shown = [...new Set([...tags, ...(hover ? [hover] : [])])].filter((n) => T[n]);
  const Equipment = EQUIPMENT[cell];
  // The 생활 로봇 places (a café, an event booth) have their own floor and no cell fence or cabinet.
  const shop = cell === 'cafe' || cell === 'draw' || cell === 'board';
  return (
    <group>
      <Backdrop />
      {!shop && <Floor box={ZONE[cell]} />}
      {!shop && <Fence />}
      {!shop && <Pedestal />}
      <Equipment world={world} onHover={setHover} />
      {!shop && (
        <>
          <Tagged name="제어함" onHover={setHover}>
            <Cabinet world={world} cell={cell} at={CABINET[cell]} />
          </Tagged>
          <StackGlow world={world} at={CABINET[cell]} />
        </>
      )}
      {callouts && <Callouts world={world} />}
      {callouts && cell === 'cafe' && <Narrate world={world} />}
      {callouts && <TargetRing world={world} />}
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
