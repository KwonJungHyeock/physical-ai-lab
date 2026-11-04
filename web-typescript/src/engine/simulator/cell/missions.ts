/**
 * 실습 셀 missions: each cell has a ladder of steps, easy to hard, every step adding one condition
 * to the one before (한 칸 → 한 자리, then 옆에 놓기, then 쌓기 …), as a training cell's exercises
 * and the 자동화설비기능사 practical build up. Beside the ladder, 자유 실습: the same cell with
 * every part and the line running, no checks — the student controls it however they like.
 *
 * A mission says how the cell starts (setup) and what is checked (checks, read off the world as it
 * is now and the run's record). Distances and heights the student reads are shop millimetres.
 */

import { makeObject, type DeskObject } from '../desk';
import { COLOR_HEX, type ColorName } from '../board';
import { CELLS, C_AT, PART_HEIGHT, STONE_TRAY, fromShop, gridPlace, magazineParts, makePart, type CellId, type CellLayout } from './cells';
import { REJECT, outlineOf, type Outline, type VisionState } from './vision';
import type { CellAlert } from './faults';
import type { LineState } from './line';
import { ICED_AMERICANO, drinkVerdict, orderName, type CafeOrder, type CafeState } from './cafe';
import { LESS_ICE_EXTRA_SHOT, RECIPE_ANSWER, recipeCode } from './cafeRecipe';
import { G3_CARD, LIFT_MM, cardsOf, inkVerdict, readInk, type DrawState, type Phrase, type Strokes } from './draw';
import { G_ANSWER, drawCode, type DrawRecipe } from './drawRecipe';
import { ON_POINT_MM, robotStones, stoneAt, type BoardState, type Pt } from './board';
import { H_ANSWER, boardCode, type BoardRecipe } from './boardRecipe';

export interface MissionSetup {
  /** The parts the cell starts with. */
  parts(l: CellLayout): DeskObject[];
  /** 자동 운전 (cell.feed() works); off, the program drives the outputs itself. */
  auto: boolean;
  /** Parts the operator puts back into an empty magazine. */
  refill?: number;
  /** Start with the belt running (a part already on its way). */
  beltOn?: boolean;
  /** Parts waiting at the dispenser (B), in the order they drop. */
  queue?(l: CellLayout): DeskObject[];
  /** The equipment's state at the start (D4: the machine already at work). */
  line?(s: LineState): void;
  /** F: drinks ordered (the café's queue); G: cards to write. */
  orders?: number;
  /** F: what each drink is (the order screen's recipe; default a tall iced americano). */
  order?: CafeOrder;
  /** G: where the customers put their cards down (the corner; default CARD_HOME). */
  card?: { x: number; y: number };
}

/** What a check needs: the parts where they are, the run's record. */
export interface Judge {
  parts: readonly DeskObject[];
  l: CellLayout;
  line: LineState;
  alerts: readonly CellAlert[];
  events: readonly CellEvent[];
  /** Seconds from the first motion to now (or to the end of the run). */
  elapsed: number;
  /** B's camera: what it was taught (for the 모양 학습 step). */
  vision?: VisionState;
  /** F: the café (cups served, spills, the door). */
  cafe?: CafeState;
  /** G: the booth's cards, and the pen's ink on the one on the mat now. */
  draw?: DrawState;
  trail?: Strokes;
  /** H: the board, its stones and the game. */
  board?: BoardState;
}

export type CellEvent =
  | { t: number; type: 'pick'; place: string; part: string | null; sensors: Record<string, boolean> }
  | { t: number; type: 'place'; place: string; part: string | null }
  | { t: number; type: 'feed' }
  | { t: number; type: 'look'; part: string | null }
  | { t: number; type: 'sort'; part: string; to: string }
  /** C: a part at the station sent on or ejected, with what the inspection sensors held then. */
  | { t: number; type: 'send' | 'eject'; part: string | null; reads: Record<string, boolean> }
  /** E: a pin pressed into a hole of the housing in the jig (0-based), in or caught, and the tool's error then (shop mm). */
  | { t: number; type: 'insert'; hole: number; part: string | null; ok: boolean; err: number };

export interface CheckResult {
  ok: boolean;
  /** What was found (shown under the item). */
  detail?: string;
}

export interface Check {
  label: string;
  judge(j: Judge): CheckResult;
}

export interface CellMission {
  id: string;
  cell: CellId;
  n: number;
  title: string;
  /** The one condition this step adds to the one before. */
  adds: string;
  /** The goal, one sentence. */
  goal: string;
  /** How to think about it (shown on asking). */
  hint: string;
  setup?: MissionSetup;
  checks?: Check[];
  /** A program that solves it (the reference the tests run; the teacher's answer). */
  solution?: string;
  /** Seconds the run may take (the 도전 steps), or none. */
  timeS?: number;
}

/* --- checks ---------------------------------------------------------------- */

/** How far off a place a part may stand, shop mm (simulator: ÷ 5). */
export const PLACE_TOL_MM = 10;
const TOL = fromShop(PLACE_TOL_MM);

const tilt = (o: DeskObject) => (o.q ? (Math.acos(Math.min(1, Math.abs(1 - 2 * (o.q[0] * o.q[0] + o.q[1] * o.q[1])))) * 180) / Math.PI : 0);
const good = (o: DeskObject) => !o.damaged && tilt(o) < 12;

/** The part standing on (x, y) at surface z (its bottom there), or null. */
function partAt(j: Judge, x: number, y: number, z: number): DeskObject | null {
  let best: DeskObject | null = null;
  let bd = Infinity;
  for (const o of j.parts) {
    if (Math.abs(o.z - z) > TOL + 1) continue;
    const d = Math.hypot(o.x - x, o.y - y);
    if (d < bd) {
      bd = d;
      best = o;
    }
  }
  return best && bd <= TOL ? best : null;
}

const shopOff = (o: DeskObject, x: number, y: number) => Math.round(Math.hypot(o.x - x, o.y - y) * 5);

/** A part on the pallet's place k (0-based), shop-size offsets from 기준 자리 in the label. */
function onPallet(k: number, label?: string): Check {
  return {
    label: label ?? `적재 판 ${k + 1}번 자리에 부품`,
    judge: (j) => {
      const g = j.l.grids['적재 판'];
      const p = gridPlace(g, k);
      const o = partAt(j, p.x, p.y, p.z);
      if (!o) return { ok: false, detail: '아직 없어요' };
      if (!good(o)) return { ok: false, detail: o.damaged ? '깨진 부품이에요' : '넘어져 있어요' };
      return { ok: true, detail: `어긋남 ${shopOff(o, p.x, p.y)} mm` };
    },
  };
}

function palletCount(n: number): Check {
  return {
    label: `적재 판에 부품 ${n}개`,
    judge: (j) => {
      const g = j.l.grids['적재 판'];
      let c = 0;
      for (let k = 0; k < g.rows * g.cols * g.layers; k += 1) {
        const p = gridPlace(g, k);
        const o = partAt(j, p.x, p.y, p.z);
        if (o && good(o)) c += 1;
      }
      return { ok: c >= n, detail: `${c} / ${n}개` };
    },
  };
}

const safe: Check = {
  label: '충돌 · 고장 · 파손 없이',
  judge: (j) => {
    const bad = j.alerts.find((a) => a.level === 'stop' || a.level === 'fault' || a.kind === 'damage');
    const broken = j.parts.filter((o) => o.damaged).length;
    if (bad) return { ok: false, detail: bad.title };
    if (broken) return { ok: false, detail: `깨진 부품 ${broken}개` };
    return { ok: true };
  },
};

const waitedForSensor: Check = {
  label: '끝 센서가 켜진 뒤에 집었어요',
  judge: (j) => {
    const picks = j.events.filter((e): e is Extract<CellEvent, { type: 'pick' }> => e.type === 'pick' && e.place === '끝 위치');
    if (!picks.length) return { ok: false, detail: '끝 위치에서 집지 않았어요' };
    const early = picks.filter((e) => !e.sensors['끝 센서'] || !e.part);
    return early.length ? { ok: false, detail: `센서보다 먼저 ${early.length}번` } : { ok: true, detail: `${picks.length}번 모두` };
  },
};

function timeWithin(sec: number): Check {
  return {
    label: `${sec}초 안에`,
    judge: (j) => ({ ok: j.elapsed > 0 && j.elapsed <= sec, detail: j.elapsed > 0 ? `${j.elapsed.toFixed(1)}초` : '아직 시작하지 않았어요' }),
  };
}

const onSourcePlate = (n: number) => (l: CellLayout) => Array.from({ length: n }, (_, k) => {
  const p = gridPlace(l.grids['소재 판'], k);
  return makePart(p.x, p.y, p.z);
});

/* --- A: 공급 · 적재 ------------------------------------------------------------- */

const HEAD = 'from edu import robot, cell\n\nrobot.home()\n';

const A: CellMission[] = [
  {
    id: 'A1',
    cell: 'feed',
    n: 1,
    title: '한 칸 → 한 자리',
    adds: '부품 하나를 집어 정한 자리에 놓기',
    goal: '소재 판 1번 칸의 부품을 적재 판의 기준 자리에 놓아요.',
    hint: '집기(robot.pick)와 놓기(robot.place) 두 줄이면 돼요. 그리퍼가 열린 채로 내려가 닫고, 올라와서 옮겨요.',
    setup: { parts: onSourcePlate(1), auto: true },
    checks: [onPallet(0, '기준 자리에 부품'), safe],
    solution: `${HEAD}robot.pick("소재 1")\nrobot.place("기준 자리")\nrobot.home()\n`,
  },
  {
    id: 'A2',
    cell: 'feed',
    n: 2,
    title: '옆에 나란히',
    adds: '놓인 부품 옆에, 간격을 계산해 놓기',
    goal: '소재 1 → 기준 자리, 소재 2 → 그 옆(y 방향)에 부품끼리 25 mm 띄워 놓아요.',
    hint: '부품 지름은 125 mm예요. 옆자리까지 거리 = 지름 + 띄울 간격. robot.place("기준 자리", y=…) 의 y에 그 값을 넣어요.',
    setup: { parts: onSourcePlate(2), auto: true },
    checks: [onPallet(0, '기준 자리에 첫 부품'), onPallet(1, '옆(y 150 mm)에 둘째 부품'), safe],
    solution: `${HEAD}robot.pick("소재 1")\nrobot.place("기준 자리")\nrobot.pick("소재 2")\nrobot.place("기준 자리", y=150)\nrobot.home()\n`,
  },
  {
    id: 'A3',
    cell: 'feed',
    n: 3,
    title: '차곡차곡 쌓기',
    adds: '아래 부품 높이만큼 올려 놓기',
    goal: '부품 두 개를 기준 자리에 2단으로 쌓아요.',
    hint: '부품 높이는 100 mm예요. 둘째 부품은 z=100 만큼 위에 놓아야 아래 부품에 부딪히지 않아요.',
    setup: { parts: onSourcePlate(2), auto: true },
    checks: [onPallet(0, '아래 부품이 기준 자리에'), onPallet(9, '위 부품이 그 위에 바르게'), safe],
    solution: `${HEAD}robot.pick("소재 1")\nrobot.place("기준 자리")\nrobot.pick("소재 2")\nrobot.place("기준 자리", z=100)\nrobot.home()\n`,
  },
  {
    id: 'A4',
    cell: 'feed',
    n: 4,
    title: '한 줄 3개',
    adds: '같은 간격으로 되풀이하기',
    goal: '소재 1~3을 기준 자리부터 y 방향으로 150 mm 간격, 한 줄로 놓아요.',
    hint: '놓는 자리만 150 mm씩 늘어나요. 0, 150, 300.',
    setup: { parts: onSourcePlate(3), auto: true },
    checks: [onPallet(0), onPallet(1), onPallet(2), safe],
    solution: `${HEAD}robot.pick("소재 1")\nrobot.place("기준 자리")\nrobot.pick("소재 2")\nrobot.place("기준 자리", y=150)\nrobot.pick("소재 3")\nrobot.place("기준 자리", y=300)\nrobot.home()\n`,
  },
  {
    id: 'A5',
    cell: 'feed',
    n: 5,
    title: '3×3 팔레트',
    adds: '줄과 칸 두 방향 + "다음 칸" 패턴',
    goal: '소재 9개를 적재 판에 3×3으로 채워요.',
    hint: '현장 로봇은 팔레트 패턴(줄 · 칸 · 간격)을 정해 두고 "다음 칸"으로 하나씩 넘어가요. 소재 판도 같은 패턴이에요.',
    setup: { parts: onSourcePlate(9), auto: true },
    checks: [palletCount(9), safe],
    solution: `${HEAD}for _ in range(9):\n    robot.pick("소재 판 다음 칸")\n    robot.place("적재 판 다음 칸")\nrobot.home()\n`,
  },
  {
    id: 'A6',
    cell: 'feed',
    n: 6,
    title: '센서 기다리기',
    adds: '컨베이어 끝 센서가 켜진 뒤에 집기',
    goal: '벨트가 실어 오는 부품을 끝 센서가 켜진 뒤 집어 기준 자리에 놓아요.',
    hint: '부품보다 먼저 가서 집으면 빈손이에요. cell.wait("끝 센서")로 신호를 기다려요.',
    setup: { parts: (l) => [makePart(225, -300, l.line.belt!.topZ)], auto: true, beltOn: true },
    checks: [waitedForSensor, onPallet(0, '기준 자리에 부품'), safe],
    solution: `${HEAD}cell.wait("끝 센서")\nrobot.pick("끝 위치")\nrobot.place("기준 자리")\nrobot.home()\n`,
  },
  {
    id: 'A7',
    cell: 'feed',
    n: 7,
    title: '공급 요청 한 번',
    adds: '실린더 공급부터 한 사이클',
    goal: 'cell.feed()로 매거진의 부품 하나를 받아 기준 자리에 놓아요.',
    hint: '공급 요청 → 끝 센서 기다리기 → 집기 → 놓기. 장비는 자동으로 실린더를 밀고 벨트를 돌려요.',
    setup: { parts: (l) => magazineParts(l, 9), auto: true },
    checks: [waitedForSensor, onPallet(0, '기준 자리에 부품'), safe],
    solution: `${HEAD}cell.feed()\ncell.wait("끝 센서")\nrobot.pick("끝 위치")\nrobot.place("기준 자리")\nrobot.home()\n`,
  },
  {
    id: 'A8',
    cell: 'feed',
    n: 8,
    title: '연속 9개',
    adds: '공급 → 집기 → 적재를 되풀이',
    goal: '매거진 부품 9개를 차례로 받아 적재 판 3×3을 채워요.',
    hint: '한 사이클을 9번 되풀이하고, 놓는 자리는 "적재 판 다음 칸".',
    setup: { parts: (l) => magazineParts(l, 9), auto: true },
    checks: [palletCount(9), waitedForSensor, safe],
    solution: `${HEAD}for _ in range(9):\n    cell.feed()\n    cell.wait("끝 센서")\n    robot.pick("끝 위치")\n    robot.place("적재 판 다음 칸")\nrobot.home()\n`,
  },
  {
    id: 'A9',
    cell: 'feed',
    n: 9,
    title: '2단 18개 · 시간 안에',
    adds: '사이클 타임 목표',
    goal: '부품 18개를 적재 판에 2단으로 쌓아요. 목표 시간 안에 끝내요.',
    hint: '기다리는 시간을 줄여요: 부품이 오는 동안 로봇이 끝 위치 위에서 미리 기다리고, 공급은 집자마자 바로 요청해요.',
    setup: { parts: (l) => magazineParts(l, 9), auto: true, refill: 9 },
    timeS: 300,
    checks: [palletCount(18), timeWithin(300), safe],
    // The next part is asked for while this one is carried (the 18th asks for none).
    solution:
      `${HEAD}robot.set_speed(50)\ncell.feed()\nfor _ in range(17):\n    cell.wait("끝 센서")\n    robot.pick("끝 위치")\n    cell.feed()\n    robot.place("적재 판 다음 칸")\n` +
      'cell.wait("끝 센서")\nrobot.pick("끝 위치")\nrobot.place("적재 판 다음 칸")\nrobot.home()\n',
  },
  {
    id: 'A10',
    cell: 'feed',
    n: 10,
    title: '장비 직접 제어',
    adds: '자동 운전 없이 실린더 · 컨베이어 신호를 직접',
    goal: '자동 운전을 끈 채, 신호를 직접 켜고 꺼서 부품 3개를 공급하고 기준 자리부터 한 줄로 놓아요.',
    hint: '실린더 켜기 → 전진 끝 기다리기 → 끄기 → 후진 끝 기다리기 → 컨베이어 켜기 → 끝 센서 기다리기 → 컨베이어 끄기. 자동화설비기능사의 동작 순서와 같아요.',
    setup: { parts: (l) => magazineParts(l, 9), auto: false },
    checks: [
      onPallet(0),
      onPallet(1),
      onPallet(2),
      {
        label: '전진 끝을 확인하고 되돌렸어요',
        judge: (j) => {
          const log = j.line.log;
          const offs = log.filter((e) => e.name === '공급 실린더' && !e.on);
          const bad = offs.filter((off) => {
            const lastOn = [...log].reverse().find((e) => e.t <= off.t && e.name === '실린더 전진 끝');
            return !lastOn || !lastOn.on;
          });
          if (!offs.length) return { ok: false, detail: '실린더를 쓰지 않았어요' };
          return bad.length ? { ok: false, detail: `끝까지 가기 전에 ${bad.length}번` } : { ok: true, detail: `${offs.length}번 모두` };
        },
      },
      {
        label: '끝 센서가 켜지면 컨베이어를 껐어요',
        judge: (j) => {
          const slip = j.alerts.some((a) => a.kind === 'jam');
          return slip ? { ok: false, detail: '벨트가 부품 밑에서 미끄러졌어요' } : { ok: true };
        },
      },
      safe,
    ],
    solution:
      `${HEAD}for _ in range(3):\n` +
      '    cell.set("공급 실린더", True)\n    cell.wait("실린더 전진 끝")\n    cell.set("공급 실린더", False)\n    cell.wait("실린더 후진 끝")\n' +
      '    cell.set("컨베이어", True)\n    cell.wait("끝 센서")\n    cell.set("컨베이어", False)\n' +
      '    robot.pick("끝 위치")\n    robot.place("적재 판 다음 칸")\nrobot.home()\n',
  },
];

/* --- B ~ E: the ladders (cells still to build) ---------------------------------- */

/* --- B: 비전 분류 ------------------------------------------------------------- */

const HEAD_B = 'from edu import robot, camera, cell\n\nrobot.home()\n';
/** The colour rule every colour step starts from: 빨강 → 함 1, 파랑 → 함 2, 노랑 → 함 3. */
const COLOR_RULES = 'cell.rule("빨강", "함 1")\ncell.rule("파랑", "함 2")\ncell.rule("노랑", "함 3")\n';
const BIN_OF_COLOR: Record<string, string> = { 빨강: '함 1', 파랑: '함 2', 노랑: '함 3' };
/** A worn part whose colour the camera can hardly tell (it should go down the chute). */
const FADED = '#a8786a';
const BIG = 25;
const SMALL = 18;

type Spec = { color: string; d?: number; outline?: Outline };
/** A part as B's dispenser or belt has it: a colour, a size across, an outline. */
function bPart(x: number, y: number, z: number, sp: Spec): DeskObject {
  const color = COLOR_HEX[sp.color as ColorName] ?? sp.color;
  const d = sp.d ?? BIG;
  if (sp.outline === '사각') return makeObject('block', { x, y, z }, { size: [d - 3, d - 3, PART_HEIGHT], color, massG: 20 });
  return makePart(x, y, z, { size: [d, d, PART_HEIGHT], color, ...(sp.outline === '육각' ? { sides: 6 } : {}) });
}
const queueOf = (specs: Spec[]) => () => specs.map((sp) => bPart(0, 0, 0, sp));
const onBeltAt = (list: [number, number, Spec][]) => (l: CellLayout) => list.map(([x, y, sp]) => bPart(x, y, l.line.belt!.topZ, sp));

/** Where a part lies now: in which bin, down the chute, or nowhere yet. */
function whereIs(j: Judge, o: DeskObject): string | null {
  for (const [name, p] of Object.entries(j.l.places)) {
    if (name.startsWith('함 ') && Math.abs(o.x - p.x) < 28 && Math.abs(o.y - p.y) < 28 && o.z < p.z - 4) return name;
  }
  const c = j.l.places[REJECT];
  if (c && Math.abs(o.x - c.x) < 24 && Math.abs(o.y - c.y) < 24 && o.z < c.z - 2) return REJECT;
  return null;
}

/** All `n` parts where they belong (`want` says where, by what the part really is). */
function sortedRight(label: string, n: number, want: (o: DeskObject) => string): Check {
  return {
    label,
    judge: (j) => {
      const parts = j.parts.filter((o) => o.kind === 'puck' || o.kind === 'block');
      let ok = 0;
      let wrong = '';
      for (const o of parts) {
        const at = whereIs(j, o);
        if (at === want(o)) ok += 1;
        else if (at && !wrong) wrong = `${want(o)}에 갈 부품이 ${at}에 있어요`;
      }
      return ok >= n ? { ok: true, detail: `${ok} / ${n}개` } : { ok: false, detail: wrong || `${ok} / ${n}개` };
    },
  };
}

const hexName = (o: DeskObject) => Object.entries(COLOR_HEX).find(([, h]) => h.toLowerCase() === o.color.toLowerCase())?.[0] ?? '?';
const byColor = (o: DeskObject) => BIN_OF_COLOR[hexName(o)] ?? REJECT;

const looked = (n: number): Check => ({
  label: n > 1 ? `카메라로 ${n}번 찍었어요` : '카메라로 찍었어요',
  judge: (j) => {
    const c = j.events.filter((e) => e.type === 'look' && e.part).length;
    return { ok: c >= n, detail: `${c}번` };
  },
});

const pickedWhereSeen = (n: number): Check => ({
  label: '찍은 자리에서 집었어요',
  judge: (j) => {
    const c = j.events.filter((e) => e.type === 'pick' && e.place === '찍은 자리' && e.part).length;
    return { ok: c >= n, detail: c ? `${c}번` : '정한 자리에서만 집었어요' };
  },
});

const beltStopped = (sensor: string): Check => ({
  label: `${sensor} 센서가 켜지면 컨베이어를 껐어요`,
  judge: (j) => (j.alerts.some((a) => a.kind === 'jam') ? { ok: false, detail: '벨트가 부품 밑에서 미끄러졌어요' } : { ok: true }),
});
const beltStoppedAtSensor = beltStopped('끝');

const taught = (n: number): Check => ({
  label: `모양 사진을 ${n}가지 등록했어요`,
  judge: (j) => {
    const c = new Set((j.vision?.learned ?? []).map((l) => l.label)).size;
    return { ok: c >= n, detail: `${c}가지` };
  },
});

const B: CellMission[] = [
  {
    id: 'B1',
    cell: 'vision',
    n: 1,
    title: '카메라로 색 읽기',
    adds: '카메라 판정 결과로 놓을 곳 정하기',
    goal: '벨트 끝의 부품 하나를 카메라로 찍고, 규칙표(빨강 → 함 1, 파랑 → 함 2, 노랑 → 함 3)대로 넣어요.',
    hint: 'part = camera.look() 으로 찍으면 part 에 색 · 지름 · 위치가 들어가요. cell.rule 세 줄로 규칙표를 만들고, 집은 뒤 robot.place_by_rule(part) 로 놓아요.',
    setup: { parts: onBeltAt([[225, 7.5, { color: '빨강' }]]), auto: true },
    checks: [looked(1), sortedRight('색에 맞는 함에 넣었어요', 1, byColor), safe],
    solution: `${HEAD_B}${COLOR_RULES}part = camera.look()\nrobot.pick("끝 위치")\nrobot.place_by_rule(part)\nrobot.home()\n`,
  },
  {
    id: 'B2',
    cell: 'vision',
    n: 2,
    title: '세 가지 색',
    adds: '공급 → 찍기 → 분류를 여러 번',
    goal: '투입기에서 오는 부품 3개(색이 모두 달라요)를 하나씩 찍어 맞는 함에 넣어요.',
    hint: 'cell.feed() 로 한 개 공급하고 cell.wait("끝 센서") 로 기다린 뒤 찍어요. 이 묶음을 3번 반복해요.',
    setup: { parts: () => [], auto: true, queue: queueOf([{ color: '파랑' }, { color: '빨강' }, { color: '노랑' }]) },
    checks: [looked(3), sortedRight('3개 모두 색에 맞는 함에', 3, byColor), safe],
    solution: `${HEAD_B}${COLOR_RULES}for _ in range(3):\n    cell.feed()\n    cell.wait("끝 센서")\n    part = camera.look()\n    robot.pick("끝 위치")\n    robot.place_by_rule(part)\nrobot.home()\n`,
  },
  {
    id: 'B3',
    cell: 'vision',
    n: 3,
    title: '위치도 카메라로',
    adds: '카메라가 찾은 위치로 집기',
    goal: '벨트 위 아무 데나 놓인 부품 2개를 카메라가 찾은 자리에서 집어 분류해요.',
    hint: '부품이 끝 위치에 있지 않아요. robot.pick("끝 위치") 대신 robot.pick(part) 를 쓰면 카메라가 본 자리로 가요.',
    setup: { parts: onBeltAt([[214, -62, { color: '노랑' }], [237, -24, { color: '빨강' }]]), auto: true },
    checks: [pickedWhereSeen(2), sortedRight('2개 모두 색에 맞는 함에', 2, byColor), safe],
    solution: `${HEAD_B}${COLOR_RULES}for _ in range(2):\n    part = camera.look()\n    robot.pick(part)\n    robot.place_by_rule(part)\nrobot.home()\n`,
  },
  {
    id: 'B4',
    cell: 'vision',
    n: 4,
    title: '크기 기준',
    adds: '판정 기준값을 직접 정하기',
    goal: '지름 125 mm(큰)와 90 mm(작은) 부품이 섞여 와요. 지름 기준을 정해 큰 것은 함 1, 작은 것은 함 2에 넣어요.',
    hint: 'cell.limit("지름", 기준) 의 기준보다 크거나 같으면 "큰"이에요. 두 크기 사이 값을 골라요. 규칙은 cell.rule("큰", "함 1") 처럼 써요.',
    setup: { parts: () => [], auto: true, queue: queueOf([{ color: '파랑', d: BIG }, { color: '노랑', d: SMALL }, { color: '빨강', d: SMALL }, { color: '초록', d: BIG }]) },
    checks: [sortedRight('큰 것은 함 1, 작은 것은 함 2', 4, (o) => (o.size[0] >= 22 ? '함 1' : '함 2')), safe],
    solution: `${HEAD_B}cell.limit("지름", 110)\ncell.rule("큰", "함 1")\ncell.rule("작은", "함 2")\nfor _ in range(4):\n    cell.feed()\n    cell.wait("끝 센서")\n    part = camera.look()\n    robot.pick("끝 위치")\n    robot.place_by_rule(part)\nrobot.home()\n`,
  },
  {
    id: 'B5',
    cell: 'vision',
    n: 5,
    title: '색 · 크기 두 조건',
    adds: '규칙표 (조건 두 개, 위에서부터)',
    goal: '빨강이면서 큰 것 → 함 1, 빨강이면서 작은 것 → 함 2, 나머지 모두 → 함 3 으로 나눠요.',
    hint: '규칙은 위에서부터 맞는 첫 줄을 따라요. 조건을 둘 쓰면 둘 다 맞아야 해요. 조건 없이 cell.rule("함 3") 이라고 쓰면 "나머지 모두"예요.',
    setup: { parts: () => [], auto: true, queue: queueOf([{ color: '빨강', d: SMALL }, { color: '파랑', d: BIG }, { color: '빨강', d: BIG }, { color: '노랑', d: SMALL }]) },
    checks: [sortedRight('규칙표대로 함 1 · 2 · 3에', 4, (o) => (hexName(o) === '빨강' ? (o.size[0] >= 22 ? '함 1' : '함 2') : '함 3')), safe],
    solution: `${HEAD_B}cell.limit("지름", 110)\ncell.rule("빨강", "큰", "함 1")\ncell.rule("빨강", "작은", "함 2")\ncell.rule("함 3")\nfor _ in range(4):\n    cell.feed()\n    cell.wait("끝 센서")\n    part = camera.look()\n    robot.pick("끝 위치")\n    robot.place_by_rule(part)\nrobot.home()\n`,
  },
  {
    id: 'B6',
    cell: 'vision',
    n: 6,
    title: '벨트 위에서 찍기',
    adds: '투입 · 컨베이어 · 끝 센서를 직접 (자동 운전 꺼짐)',
    goal: '투입 → 컨베이어 운전 → 끝 센서가 켜지면 정지 → 찍기 → 분류를 3개에 해요.',
    hint: 'cell.set("투입", True) 다음에 False 로 되돌려야 다음 부품을 또 넣을 수 있어요. 끝 센서가 켜지면 바로 컨베이어를 꺼요.',
    setup: { parts: () => [], auto: false, queue: queueOf([{ color: '노랑' }, { color: '빨강' }, { color: '파랑' }]) },
    checks: [beltStoppedAtSensor, sortedRight('3개 모두 색에 맞는 함에', 3, byColor), safe],
    solution: `${HEAD_B}${COLOR_RULES}for _ in range(3):\n    cell.set("투입", True)\n    cell.set("투입", False)\n    cell.set("컨베이어", True)\n    cell.wait("끝 센서")\n    cell.set("컨베이어", False)\n    part = camera.look()\n    robot.pick("끝 위치")\n    robot.place_by_rule(part)\nrobot.home()\n`,
  },
  {
    id: 'B7',
    cell: 'vision',
    n: 7,
    title: '모르는 것은 불량 슈트',
    adds: '판정 확신도 기준',
    goal: '색이 바랜 부품이 하나 섞여 있어요. 카메라가 확실하지 않은 부품은 불량 슈트로 보내고, 나머지는 색대로 넣어요.',
    hint: '찍은 결과의 확신도를 보세요(카메라 창). cell.limit("확신도", 기준) 보다 낮으면 규칙표보다 먼저 불량 슈트로 가요.',
    setup: { parts: () => [], auto: true, queue: queueOf([{ color: '빨강' }, { color: FADED }, { color: '파랑' }, { color: '노랑' }]) },
    checks: [sortedRight('바랜 부품은 불량 슈트, 나머지는 색대로', 4, byColor), safe],
    solution: `${HEAD_B}cell.limit("확신도", 80)\n${COLOR_RULES}for _ in range(4):\n    cell.feed()\n    cell.wait("끝 센서")\n    part = camera.look()\n    robot.pick("끝 위치")\n    robot.place_by_rule(part)\nrobot.home()\n`,
  },
  {
    id: 'B8',
    cell: 'vision',
    n: 8,
    title: '모양 학습',
    adds: '사진 등록으로 분류기 만들기',
    goal: '처음 3개(원 · 사각 · 육각)를 사진으로 등록하고 함 1 · 2 · 3에 넣은 뒤, 섞여 오는 3개를 모양대로 나눠요.',
    hint: '부품이 카메라 아래에 있을 때 camera.learn("원") 처럼 이름을 붙여 등록해요. 등록하지 않은 모양은 "모양 모름"이라 불량 슈트로 가요.',
    setup: { parts: () => [], auto: true, queue: queueOf([{ color: '파랑', outline: '원' }, { color: '파랑', outline: '사각' }, { color: '파랑', outline: '육각' }, { color: '파랑', outline: '육각' }, { color: '파랑', outline: '원' }, { color: '파랑', outline: '사각' }]) },
    checks: [taught(3), sortedRight('모양대로 원 → 함 1, 사각 → 함 2, 육각 → 함 3', 6, (o) => ({ 원: '함 1', 사각: '함 2', 육각: '함 3' })[outlineOf(o)]), safe],
    solution:
      `${HEAD_B}cell.rule("원", "함 1")\ncell.rule("사각", "함 2")\ncell.rule("육각", "함 3")\n` +
      ['원', '사각', '육각'].map((o, k) => `cell.feed()\ncell.wait("끝 센서")\ncamera.learn("${o}")\nrobot.pick("끝 위치")\nrobot.place("함 ${k + 1}")\n`).join('') +
      'for _ in range(3):\n    cell.feed()\n    cell.wait("끝 센서")\n    part = camera.look()\n    robot.pick("끝 위치")\n    robot.place_by_rule(part)\nrobot.home()\n',
  },
  {
    id: 'B9',
    cell: 'vision',
    n: 9,
    title: '연속 12개 · 시간 안에',
    adds: '사이클 타임 목표',
    goal: '섞여 오는 12개(바랜 부품 2개 포함)를 하나도 틀리지 않고 240초 안에 분류해요.',
    hint: '속도를 올리고(robot.set_speed), 반복 안에는 꼭 필요한 줄만 두세요. 기준값과 규칙표는 반복 밖에서 한 번만 정해요.',
    setup: {
      parts: () => [],
      auto: true,
      queue: queueOf(['빨강', '파랑', '노랑', FADED, '노랑', '빨강', '파랑', '파랑', FADED, '빨강', '노랑', '빨강'].map((color) => ({ color }))),
    },
    checks: [sortedRight('12개 모두 맞는 곳에', 12, byColor), timeWithin(240), safe],
    timeS: 240,
    solution: `${HEAD_B}robot.set_speed(50)\ncell.limit("확신도", 80)\n${COLOR_RULES}for _ in range(12):\n    cell.feed()\n    cell.wait("끝 센서")\n    part = camera.look()\n    robot.pick("끝 위치")\n    robot.place_by_rule(part)\nrobot.home()\n`,
  },
];

/* --- C: 검사 · 불량 배출 ------------------------------------------------------- */

const HEAD_C = 'from edu import robot, cell\n\nrobot.home()\n';
/** A short part (12 high instead of 20): the height sensor reads it as 불량. */
const SHORT_H = 12;
const METAL = '#b4bcc6';
const PLASTIC = '#3f7fd6';

type CSpec = 'M' | 'P' | 'm' | 'p';
/** C's parts by letter: M / P a good metal / plastic part, m / p a short (불량) one. */
function cPart(k: CSpec): DeskObject {
  const metal = k === 'M' || k === 'm';
  const short = k === 'm' || k === 'p';
  return makePart(0, 0, 0, { size: [25, 25, short ? SHORT_H : PART_HEIGHT], color: metal ? METAL : PLASTIC, metal });
}
const cQueue = (specs: string) => () => [...specs].map((k) => cPart(k as CSpec));
const isShort = (o: DeskObject) => o.size[2] < PART_HEIGHT - 2;
const cParts = (j: Judge) => j.parts.filter((o) => o.kind === 'puck');

/** The parts in the reject bin (fallen into it, below its rim). */
const inRejectBin = (o: DeskObject) => o.x > 264 && o.x < 330 && Math.abs(o.y - C_AT.eject) < 33 && o.z < 10;

/** Good parts on a tray (counted on its marked places). */
function onTray(grid: string, n: number, label: string, want: (o: DeskObject) => boolean = () => true): Check {
  return {
    label,
    judge: (j) => {
      const g = j.l.grids[grid];
      let c = 0;
      let wrong = '';
      for (let k = 0; k < g.rows * g.cols * g.layers; k += 1) {
        const p = gridPlace(g, k);
        const o = partAt(j, p.x, p.y, p.z);
        if (!o) continue;
        if (!good(o)) wrong ||= o.damaged ? '깨진 부품이 있어요' : '넘어진 부품이 있어요';
        else if (isShort(o)) wrong ||= '낮은(불량) 부품이 들어 있어요';
        else if (!want(o)) wrong ||= o.metal ? '금속 부품이 들어 있어요' : '비금속 부품이 들어 있어요';
        else c += 1;
      }
      return wrong ? { ok: false, detail: wrong } : { ok: c >= n, detail: `${c} / ${n}개` };
    },
  };
}

function rejected(n: number): Check {
  return {
    label: n > 1 ? `불량 ${n}개를 불량함으로` : '불량을 불량함으로',
    judge: (j) => {
      const inBin = cParts(j).filter(inRejectBin);
      const goodOut = inBin.filter((o) => !isShort(o)).length;
      if (goodOut) return { ok: false, detail: `양품 ${goodOut}개를 버렸어요` };
      return { ok: inBin.length >= n, detail: `${inBin.length} / ${n}개` };
    },
  };
}

/** Nothing ran off the belt's end or fell to the floor. */
const nothingLost: Check = {
  label: '떨어진 부품 없이',
  judge: (j) => {
    const lost = cParts(j).filter((o) => o.z < -10 && !inRejectBin(o)).length;
    return lost ? { ok: false, detail: `${lost}개가 떨어졌어요` } : { ok: true };
  },
};

const C: CellMission[] = [
  {
    id: 'C1',
    cell: 'inspect',
    n: 1,
    title: '스토퍼에서 집기',
    adds: '검사 위치 → 스토퍼로 보내 집기',
    goal: '부품 하나를 투입해 스토퍼까지 보내고, 집어서 양품 트레이에 놓아요.',
    hint: 'cell.feed() 는 부품을 센서 아래로 지나 검사 위치에 세워요. cell.send() 로 스토퍼까지 보내면 부품 도착 신호가 켜져요. 그때 "스토퍼 앞"에서 집어요.',
    setup: { parts: () => [], auto: true, queue: cQueue('M') },
    checks: [onTray('양품 트레이', 1, '양품 트레이에 부품'), safe],
    solution: `${HEAD_C}cell.feed()\ncell.send()\nrobot.pick("스토퍼 앞")\nrobot.place("양품 트레이 다음 칸")\nrobot.home()\n`,
  },
  {
    id: 'C2',
    cell: 'inspect',
    n: 2,
    title: '불량 밀어내기',
    adds: '배출 실린더',
    goal: '낮은 부품(불량) 하나가 와요. 검사 위치에서 배출 실린더로 불량함에 밀어내요.',
    hint: '높이 센서 램프가 꺼져 있으면 불량이에요. cell.eject() 는 배출 실린더를 끝까지 밀었다가 되돌려요. 로봇은 움직이지 않아도 돼요.',
    setup: { parts: () => [], auto: true, queue: cQueue('m') },
    checks: [rejected(1), nothingLost, safe],
    solution: `${HEAD_C}cell.feed()\ncell.eject()\n`,
  },
  {
    id: 'C3',
    cell: 'inspect',
    n: 3,
    title: '높이 검사',
    adds: '만약 ~ 이면 / 아니면',
    goal: '부품 4개 가운데 하나가 낮아요. 높이가 정상이면 보내서 양품 트레이에, 아니면 밀어내요.',
    hint: 'if cell.is_on("높이 정상"): 아래에 정상일 때 할 일을, else: 아래에 아닐 때 할 일을 빈칸 4개 들여 써요. 반복 안에 조건이 들어가요.',
    setup: { parts: () => [], auto: true, queue: cQueue('MMmM') },
    checks: [onTray('양품 트레이', 3, '양품 3개를 트레이에'), rejected(1), safe],
    solution: `${HEAD_C}for _ in range(4):\n    cell.feed()\n    if cell.is_on("높이 정상"):\n        cell.send()\n        robot.pick("스토퍼 앞")\n        robot.place("양품 트레이 다음 칸")\n    else:\n        cell.eject()\nrobot.home()\n`,
  },
  {
    id: 'C4',
    cell: 'inspect',
    n: 4,
    title: '금속 / 비금속',
    adds: '조건 안의 조건',
    goal: '낮은 것은 밀어내고, 정상인 것 가운데 금속은 양품 트레이에, 비금속은 비금속 트레이에 놓아요.',
    hint: '금속 센서(유도형)는 금속만 느껴요. 집은 다음 if cell.is_on("금속"): 으로 놓을 곳을 골라요. 조건 블록 안에 조건 블록을 넣어요.',
    setup: { parts: () => [], auto: true, queue: cQueue('MPmPM') },
    checks: [onTray('양품 트레이', 2, '금속 2개를 양품 트레이에', (o) => !!o.metal), onTray('비금속 트레이', 2, '비금속 2개를 비금속 트레이에', (o) => !o.metal), rejected(1), safe],
    solution:
      `${HEAD_C}for _ in range(5):\n    cell.feed()\n    if not cell.is_on("높이 정상"):\n        cell.eject()\n    else:\n        cell.send()\n        robot.pick("스토퍼 앞")\n` +
      '        if cell.is_on("금속"):\n            robot.place("양품 트레이 다음 칸")\n        else:\n            robot.place("비금속 트레이 다음 칸")\nrobot.home()\n',
  },
  {
    id: 'C5',
    cell: 'inspect',
    n: 5,
    title: '직접 제어',
    adds: '자동 운전 꺼짐',
    goal: '자동 운전 없이 신호를 직접 켜고 꺼서 부품 3개를 검사해요. 정상은 트레이에, 낮은 것은 밀어내요.',
    hint: '스토퍼를 먼저 내려(cell.set("스토퍼", True)) 부품이 벨트 끝으로 떨어지지 않게 해요. 투입 → 컨베이어 켜기 → 검사 위치 기다리기 → 끄기 → 조건. 보낼 때는 다시 켜고 부품 도착을 기다려 꺼요.',
    setup: { parts: () => [], auto: false, queue: cQueue('MmM') },
    checks: [onTray('양품 트레이', 2, '양품 2개를 트레이에'), rejected(1), nothingLost, beltStopped('부품 도착'), safe],
    solution:
      `${HEAD_C}cell.set("스토퍼", True)\nfor _ in range(3):\n    cell.set("투입", True)\n    cell.set("투입", False)\n    cell.set("컨베이어", True)\n    cell.wait("검사 위치")\n    cell.set("컨베이어", False)\n` +
      '    if cell.is_on("높이 정상"):\n        cell.set("컨베이어", True)\n        cell.wait("부품 도착")\n        robot.wait(0.5)\n        cell.set("컨베이어", False)\n        robot.pick("스토퍼 앞")\n        robot.place("양품 트레이 다음 칸")\n' +
      '    else:\n        cell.set("배출 실린더", True)\n        cell.wait("배출 끝")\n        cell.set("배출 실린더", False)\nrobot.home()\n',
  },
  {
    id: 'C6',
    cell: 'inspect',
    n: 6,
    title: '3번 연속 불량이면 정지',
    adds: '세기 (숫자 상자)',
    goal: '불량이 3개 이어지면 경광등을 켜고 라인을 멈춰요. 양품이 오면 센 수를 다시 0 으로.',
    hint: 'bad = 0 으로 시작해 불량일 때 bad += 1, 양품일 때 bad = 0. if bad >= 3: 이면 cell.set("경광등", True) 다음 break 로 반복을 멈춰요.',
    setup: { parts: () => [], auto: true, queue: cQueue('MmMmmmMM') },
    checks: [
      {
        label: '불량 3개가 이어지자 경광등을 켰어요',
        judge: (j) => {
          const on = j.line.log.find((e) => e.name === '경광등' && e.on);
          if (!on) return { ok: false, detail: '경광등이 켜지지 않았어요' };
          const ejects = j.events.filter((e) => e.type === 'eject' && e.t <= on.t).length;
          return ejects === 4 ? { ok: true } : { ok: false, detail: ejects < 4 ? '연속이 아닌 불량까지 세었어요' : '너무 늦게 켰어요' };
        },
      },
      {
        label: '그 뒤로는 투입하지 않았어요',
        judge: (j) => ({ ok: j.line.queue.length === 2 && j.line.fed === 6, detail: `투입 ${j.line.fed}개` }),
      },
      onTray('양품 트레이', 2, '양품 2개를 트레이에'),
      safe,
    ],
    solution:
      `${HEAD_C}bad = 0\nfor _ in range(8):\n    cell.feed()\n    if cell.is_on("높이 정상"):\n        bad = 0\n        cell.send()\n        robot.pick("스토퍼 앞")\n        robot.place("양품 트레이 다음 칸")\n` +
      '    else:\n        bad += 1\n        cell.eject()\n        if bad >= 3:\n            cell.set("경광등", True)\n            break\nrobot.home()\n',
  },
  {
    id: 'C7',
    cell: 'inspect',
    n: 7,
    title: '연속 12개 · 시간 안에',
    adds: '사이클 타임',
    goal: '부품 12개를 240초 안에 검사해 나눠요. 불량률은 기록 카드에 나와요.',
    hint: '속도를 올리고(robot.set_speed), 불량은 로봇이 움직이지 않으니 바로 다음 부품을 투입해요. 반복 안에는 꼭 필요한 줄만 두세요.',
    setup: { parts: () => [], auto: true, queue: cQueue('MPMmPMPpMMPm') },
    timeS: 240,
    checks: [onTray('양품 트레이', 5, '금속 5개를 양품 트레이에', (o) => !!o.metal), onTray('비금속 트레이', 4, '비금속 4개를 비금속 트레이에', (o) => !o.metal), rejected(3), timeWithin(240), safe],
    solution:
      `${HEAD_C}robot.set_speed(50)\nfor _ in range(12):\n    cell.feed()\n    if not cell.is_on("높이 정상"):\n        cell.eject()\n    else:\n        cell.send()\n        robot.pick("스토퍼 앞")\n` +
      '        if cell.is_on("금속"):\n            robot.place("양품 트레이 다음 칸")\n        else:\n            robot.place("비금속 트레이 다음 칸")\nrobot.home()\n',
  },
];

/* --- D: 머신 텐딩 ------------------------------------------------------------ */

/** D6's time, s: the reference program with the next blank brought ahead, with some room (measured). */
const D6_TIME = 185;

const HEAD_D = 'from edu import robot, cell\n\nrobot.home()\n';
const RAW = '#9aa3ad';
/** A blank on the raw-part tray's place k (0-based). */
const blanks = (n: number) => (l: CellLayout) => Array.from({ length: n }, (_, k) => {
  const p = gridPlace(l.grids['소재 트레이'], k);
  return makePart(p.x, p.y, p.z, { size: [18, 18, 20], color: RAW, massG: 30 });
});
/** One full machining cycle with the door, the chuck and the start signal, from loading to unloading. */
const OPEN = 'cell.set("문", True)\ncell.wait("문 열림")\n';
const SHUT = 'cell.set("문", False)\ncell.wait("문 닫힘")\n';
const LOCK = 'cell.set("척", True)\ncell.wait("척 잠김")\n';
const FREE = 'cell.set("척", False)\ncell.wait("척 풀림")\n';
const RUN = 'cell.set("가공 시작", True)\ncell.wait("가공 끝")\ncell.set("가공 시작", False)\n';
const ind = (code: string) => code.replace(/^(?=.)/gm, '    ');

/** A workpiece in the chuck now. */
const chuckPart = (j: Judge) => {
  const c = j.l.places['척'];
  return partAt(j, c.x, c.y, c.z);
};

/** Machined parts on the finished-part tray (on its places 1..n, or anywhere on it). */
function finished(n: number, label: string, places?: number[]): Check {
  return {
    label,
    judge: (j) => {
      const g = j.l.grids['완성품 트레이'];
      let c = 0;
      let wrong = '';
      for (let k = 0; k < g.rows * g.cols; k += 1) {
        if (places && !places.includes(k + 1)) continue;
        const p = gridPlace(g, k);
        const o = partAt(j, p.x, p.y, p.z);
        if (!o) continue;
        if (o.damaged) wrong ||= '가공 중단으로 불량이 된 부품이 있어요';
        else if (!o.machined) wrong ||= '가공하지 않은 소재가 있어요';
        else if (good(o)) c += 1;
      }
      return wrong ? { ok: false, detail: wrong } : { ok: c >= n, detail: `${c} / ${n}개` };
    },
  };
}

/** D6: the next blank taken while the machine was cutting and put on the waiting stand, n times. */
const stagedWhileBusy = (n: number): Check => ({
  label: '가공하는 동안 다음 소재를 대기 자리에',
  judge: (j) => {
    let c = 0;
    let busy = false;
    for (const e of j.events) {
      if (e.type === 'pick') busy = !!e.sensors['가공 중'];
      else if (e.type === 'place' && e.place === '대기 자리' && busy) c += 1;
    }
    return { ok: c >= n, detail: `${c} / ${n}번` };
  },
});

const neverCut: Check = {
  label: '가공 중에 문을 열지 않았어요',
  judge: (j) => (j.line.cut ? { ok: false, detail: `가공 중단 ${j.line.cut}번` } : { ok: true }),
};

const D: CellMission[] = [
  {
    id: 'D1',
    cell: 'tend',
    n: 1,
    title: '문 열고 넣기',
    adds: '문 열림 확인',
    goal: '기계 문을 열고, 열림 신호를 기다린 뒤 소재 1을 척에 넣어요.',
    hint: '문은 cell.set("문", True) 로 열려요. 끝까지 열리는 데 시간이 걸리니 cell.wait("문 열림") 으로 기다린 뒤 들어가요. 닫힌 문으로 들어가면 부딪혀요.',
    setup: { parts: blanks(1), auto: false },
    checks: [
      {
        label: '척 위에 소재',
        judge: (j) => {
          const o = chuckPart(j);
          return o ? (good(o) ? { ok: true } : { ok: false, detail: '넘어져 있어요' }) : { ok: false, detail: '아직 없어요' };
        },
      },
      safe,
    ],
    solution: `${HEAD_D}${OPEN}robot.pick("소재 1")\nrobot.place("척")\nrobot.home()\n`,
  },
  {
    id: 'D2',
    cell: 'tend',
    n: 2,
    title: '가공 한 번',
    adds: '문 닫힘 · 척 잠김 조건',
    goal: '소재를 넣고 나와서 문을 닫고 척을 잠근 뒤, 가공을 시작해 끝날 때까지 기다려요.',
    hint: '기계는 문 닫힘 · 척 잠김이 모두 켜져야 가공을 시작해요. 가공 시작을 켜고 cell.wait("가공 끝") 으로 기다린 뒤 가공 시작을 꺼요.',
    setup: { parts: blanks(1), auto: false },
    checks: [
      {
        label: '척 위의 부품을 가공했어요',
        judge: (j) => {
          const o = chuckPart(j);
          return !o ? { ok: false, detail: '척에 부품이 없어요' } : o.damaged ? { ok: false, detail: '가공 중단으로 불량' } : { ok: !!o.machined, detail: o.machined ? undefined : '아직 소재 그대로예요' };
        },
      },
      safe,
    ],
    solution: `${HEAD_D}${OPEN}robot.pick("소재 1")\nrobot.place("척")\nrobot.home()\n${SHUT}${LOCK}${RUN}`,
  },
  {
    id: 'D3',
    cell: 'tend',
    n: 3,
    title: '꺼내기까지',
    adds: '척 풀기 · 꺼내기',
    goal: '한 사이클을 끝까지 해요. 가공이 끝나면 척을 풀고 문을 열어 완성품을 꺼내 완성품 트레이 1번에 놓아요.',
    hint: '잠긴 척에서는 부품이 빠지지 않아요. cell.set("척", False) 후 척 풀림을 기다리고, 문을 연 다음 robot.pick("척") 으로 꺼내요.',
    setup: { parts: blanks(1), auto: false },
    checks: [finished(1, '완성품 트레이 1번에 가공된 부품', [1]), safe],
    solution: `${HEAD_D}${OPEN}robot.pick("소재 1")\nrobot.place("척")\nrobot.home()\n${SHUT}${LOCK}${RUN}${FREE}${OPEN}robot.pick("척")\nrobot.place("완성품 1")\nrobot.home()\n${SHUT}`,
  },
  {
    id: 'D4',
    cell: 'tend',
    n: 4,
    title: '인터록',
    adds: '가공 중이면 기다리기 (조건)',
    goal: '시작할 때 기계가 이미 가공 중이에요. 끝날 때까지 기다렸다가 꺼내 완성품 1번에 놓고, 소재 1을 가공해 완성품 2번에 놓아요.',
    hint: 'if cell.is_on("가공 중"): 아래에 cell.wait("가공 끝") 을 넣어요. 가공 중에 문을 열면 기계가 멈추고 그 부품은 불량이 돼요.',
    setup: {
      parts: (l) => {
        const c = l.places['척'];
        return [makePart(c.x, c.y, c.z, { size: [18, 18, 20], color: RAW, massG: 30 }), ...blanks(1)(l)];
      },
      auto: false,
      line: (s) => {
        s.out['척'] = true;
        s.act['척'] = 1;
        s.out['가공 시작'] = true;
        s.cycleT = 2;
      },
    },
    checks: [neverCut, finished(2, '완성품 1 · 2번에 가공된 부품', [1, 2]), safe],
    solution:
      `${HEAD_D}if cell.is_on("가공 중"):\n    cell.wait("가공 끝")\ncell.set("가공 시작", False)\n${FREE}${OPEN}robot.pick("척")\nrobot.place("완성품 1")\n` +
      `robot.pick("소재 1")\nrobot.place("척")\nrobot.home()\n${SHUT}${LOCK}${RUN}${FREE}${OPEN}robot.pick("척")\nrobot.place("완성품 2")\nrobot.home()\n${SHUT}`,
  },
  {
    id: 'D5',
    cell: 'tend',
    n: 5,
    title: '3개 연속',
    adds: '반복 + 같은 번호 칸',
    goal: '소재 1~3을 차례로 가공해 완성품 1~3번에 놓아요.',
    hint: '한 사이클을 반복 안에 넣고, 집는 곳은 "소재 트레이 다음 칸", 놓는 곳은 "완성품 트레이 다음 칸" 으로 해요. 두 트레이의 칸 번호가 함께 늘어요.',
    setup: { parts: blanks(3), auto: false },
    checks: [finished(3, '완성품 1~3번에 가공된 부품', [1, 2, 3]), neverCut, safe],
    solution: `${HEAD_D}for _ in range(3):\n${ind(`${OPEN}robot.pick("소재 트레이 다음 칸")\nrobot.place("척")\nrobot.home()\n${SHUT}${LOCK}${RUN}${FREE}${OPEN}robot.pick("척")\nrobot.place("완성품 트레이 다음 칸")\nrobot.home()\n${SHUT}`)}`,
  },
  {
    id: 'D6',
    cell: 'tend',
    n: 6,
    title: '기다리는 동안 미리',
    adds: '가공 중에 다음 소재 준비 · 시간 목표',
    goal: '소재 4개를 가공해 완성품 1~4번에 놓아요. 가공하는 동안 다음 소재를 문 앞 대기 자리에 갖다 두어 목표 시간 안에 끝내요.',
    hint: '기계가 가공하는 12초 동안 로봇은 쉬고 있어요. 그동안 다음 소재를 "대기 자리" 에 옮겨 두면, 꺼낸 뒤 가까운 대기 자리에서 바로 집어 넣을 수 있어요. 문을 닫아 두는 것도 잊지 마세요.',
    setup: { parts: blanks(4), auto: false },
    timeS: D6_TIME,
    checks: [finished(4, '완성품 1~4번에 가공된 부품', [1, 2, 3, 4]), stagedWhileBusy(3), neverCut, timeWithin(D6_TIME), safe],
    solution:
      `${HEAD_D}robot.set_speed(50)\n${OPEN}robot.pick("소재 트레이 다음 칸")\nrobot.place("척")\n${SHUT}${LOCK}cell.set("가공 시작", True)\n` +
      `for _ in range(3):\n${ind(`robot.pick("소재 트레이 다음 칸")\nrobot.place("대기 자리")\ncell.wait("가공 끝")\ncell.set("가공 시작", False)\n${FREE}${OPEN}robot.pick("척")\nrobot.place("완성품 트레이 다음 칸")\nrobot.pick("대기 자리")\nrobot.place("척")\n${SHUT}${LOCK}cell.set("가공 시작", True)\n`)}` +
      `cell.wait("가공 끝")\ncell.set("가공 시작", False)\n${FREE}${OPEN}robot.pick("척")\nrobot.place("완성품 트레이 다음 칸")\nrobot.home()\n${SHUT}`,
  },
];

/* --- E: 조립 · 삽입 ------------------------------------------------------------- */

/** E4 · E6's targets, s: between the reference program's time and the slower ways (cell-e-check measures both). */
const E4_TIME = 180;
const E6_TIME = 260;

const HEAD_E = 'from edu import robot, cell\n\nrobot.home()\n';
const HOUSING = '#3d4650';
const PIN = '#d4d9de';
/** A housing on the belt at y (its holes empty), its holes' play `clearance` shop mm. */
const housing = (l: CellLayout, y: number, clearance?: number) =>
  makeObject('box', { x: l.places['하우징'].x, y, z: l.line.belt!.topZ }, { size: [30, 30, 16], color: HOUSING, massG: 30, pins: [], ...(clearance ? { clearance } : {}) });
/** One housing standing in the jig. */
const inJig = (clearance?: number) => (l: CellLayout) => [housing(l, l.places['하우징'].y, clearance)];
/** Pins waiting in the feeder's bowl, in order (those numbered in `rough`, 0-based, with a burr). */
const pinQueue = (n: number, rough: number[] = []) => () => Array.from({ length: n }, (_, k) => makePart(0, 0, 0, { size: [8, 8, 22], color: PIN, massG: 5, ...(rough.includes(k) ? { rough: true } : {}) }));
/** The equipment at the start: the stopper down in front of the jig, the clamp closed or open. */
const jigSet = (clamped: boolean) => (s: LineState) => {
  s.out['스토퍼'] = true;
  s.act['스토퍼'] = 1;
  if (clamped) {
    s.out['클램프'] = true;
    s.act['클램프'] = 1;
  }
};

/** The housing in the jig now. */
const jigHousing = (j: Judge) => {
  const p = j.l.places['하우징'];
  return j.parts.find((o) => o.pins && Math.hypot(o.x - p.x, o.y - p.y) < 12) ?? null;
};
/** The holes (1-based) filled in the housing in the jig. */
function pinsIn(holes: number[], label: string): Check {
  return {
    label,
    judge: (j) => {
      const h = jigHousing(j);
      if (!h) return { ok: false, detail: '지그에 하우징이 없어요' };
      const got = holes.filter((k) => h.pins!.includes(k - 1)).length;
      return { ok: got === holes.length, detail: `${got} / ${holes.length}개` };
    },
  };
}
const noJam: Check = {
  label: '핀 걸림 없이',
  judge: (j) => {
    const n = j.events.filter((e) => e.type === 'insert' && !e.ok).length;
    return n ? { ok: false, detail: `걸림 ${n}번` } : { ok: true };
  },
};
/** Housings with all their pins in the box at the belt's end. */
function assembled(n: number): Check {
  return {
    label: `핀 4개를 다 꽂은 하우징 ${n}개를 완성 상자에`,
    judge: (j) => {
      const box = j.parts.filter((o) => o.pins && o.x > 165 && o.x < 235 && o.y > -205 && o.y < -115 && o.z < 10);
      const full = box.filter((o) => o.pins!.length >= 4).length;
      const short = box.length - full;
      return short ? { ok: false, detail: `핀이 빠진 하우징 ${short}개` } : { ok: full >= n, detail: `${full} / ${n}개` };
    },
  };
}

const FEED = 'cell.set("피더", True)\n';
const CLAMP = 'cell.set("클램프", True)\ncell.wait("클램프 닫힘")\n';
const ONE = 'cell.wait("핀 있음")\nrobot.pick("핀 집는 자리")\n';
const indE = (code: string) => code.replace(/^(?=.)/gm, '    ');
const RETRY = 'robot.place("구멍 다음 칸")\nif cell.is_on("걸림"):\n    robot.place("구멍 다음 칸")\n';

const E: CellMission[] = [
  {
    id: 'E1',
    cell: 'assembly',
    n: 1,
    title: '핀 하나 꽂기',
    adds: '핀 있음 확인',
    goal: '피더를 켜고 핀 있음을 기다린 뒤, 지그에 고정된 하우징의 구멍 1에 핀을 꽂아요.',
    hint: '피더는 cell.set("피더", True) 로 켜요. 핀이 트랙을 따라 집는 자리까지 오는 데 4초쯤 걸려요. cell.wait("핀 있음") 으로 기다린 뒤 집어서 robot.place("구멍 1") 로 꽂아요.',
    setup: { parts: inJig(), auto: false, queue: pinQueue(4), line: jigSet(true) },
    checks: [pinsIn([1], '구멍 1에 핀'), safe],
    solution: `${HEAD_E}${FEED}${ONE}robot.place("구멍 1")\nrobot.home()\n`,
  },
  {
    id: 'E2',
    cell: 'assembly',
    n: 2,
    title: '클램프 뒤에 꽂기',
    adds: '클램프 닫힘 신호',
    goal: '클램프를 닫아 하우징을 붙잡고, 클램프 닫힘을 확인한 뒤 구멍 1에 꽂아요.',
    hint: '클램프가 열려 있으면 하우징이 벨트 위에서 조금씩 틀어져 있어서 핀이 구멍 가장자리에 걸려요. cell.set("클램프", True) 뒤 cell.wait("클램프 닫힘").',
    setup: { parts: inJig(), auto: false, queue: pinQueue(4), line: jigSet(false) },
    checks: [pinsIn([1], '구멍 1에 핀'), noJam, safe],
    solution: `${HEAD_E}${FEED}${CLAMP}${ONE}robot.place("구멍 1")\nrobot.home()\n`,
  },
  {
    id: 'E3',
    cell: 'assembly',
    n: 3,
    title: '구멍 4개',
    adds: '반복 + 구멍 다음 칸',
    goal: '구멍 1~4에 핀을 하나씩 차례로 꽂아요.',
    hint: '핀 하나를 꽂는 순서를 4번 반복 안에 넣어요. 놓는 곳은 "구멍 다음 칸": 비어 있는 다음 구멍이에요.',
    setup: { parts: inJig(), auto: false, queue: pinQueue(6), line: jigSet(false) },
    checks: [pinsIn([1, 2, 3, 4], '구멍 1~4에 핀'), noJam, safe],
    solution: `${HEAD_E}${FEED}${CLAMP}for _ in range(4):\n${indE(`${ONE}robot.place("구멍 다음 칸")\n`)}robot.home()\n`,
  },
  {
    id: 'E4',
    cell: 'assembly',
    n: 4,
    title: '여유 0.5 mm',
    adds: '꽂기 직전만 느리게 (속도)',
    goal: `여유가 0.5 mm인 정밀 하우징에 핀 4개를 걸리지 않게 꽂고, ${E4_TIME}초 안에 끝내요.`,
    hint: '손끝 오차는 속도에 비례해요 (속도 10 → 0.4 mm, 35 → 1.4 mm). 꽂기 바로 전에 robot.set_speed(10), 꽂은 뒤 다시 빠르게. 내내 느리면 시간이 모자라요.',
    setup: { parts: inJig(0.5), auto: false, queue: pinQueue(6), line: jigSet(false) },
    timeS: E4_TIME,
    checks: [pinsIn([1, 2, 3, 4], '구멍 1~4에 핀'), noJam, timeWithin(E4_TIME), safe],
    solution: `${HEAD_E}robot.set_speed(50)\n${FEED}${CLAMP}for _ in range(4):\n${indE(`${ONE}robot.set_speed(10)\nrobot.place("구멍 다음 칸")\nrobot.set_speed(50)\n`)}robot.home()\n`,
  },
  {
    id: 'E5',
    cell: 'assembly',
    n: 5,
    title: '걸리면 다시',
    adds: '걸림이면 다시 꽂기 (조건)',
    goal: '거스러미가 있는 핀이 섞여 와서 한 번 걸려요. 걸림이 켜지면 같은 구멍에 다시 꽂아 구멍 4개를 채워요.',
    hint: '걸린 핀은 손에 그대로 있어요. 꽂은 뒤 만약 cell.is_on("걸림") 이면 robot.place("구멍 다음 칸") 을 한 번 더 해요. 그냥 넘어가면 다음 집기에서 "이미 부품을 들고 있어요" 로 멈춰요.',
    setup: { parts: inJig(), auto: false, queue: pinQueue(6, [1]), line: jigSet(false) },
    checks: [pinsIn([1, 2, 3, 4], '구멍 1~4에 핀'), safe],
    solution: `${HEAD_E}${FEED}${CLAMP}for _ in range(4):\n${indE(`${ONE}${RETRY}`)}robot.home()\n`,
  },
  {
    id: 'E6',
    cell: 'assembly',
    n: 6,
    title: '하우징 연속',
    adds: '받기 · 내보내기 · 시간 목표',
    goal: `컨베이어로 오는 하우징 3개에 핀을 4개씩 꽂아 완성 상자로 내보내요. ${E6_TIME}초 안에.`,
    hint: '스토퍼를 내리고 컨베이어를 돌려 하우징 도착을 기다려요 → 컨베이어 끄고 클램프 → 핀 4개 → 클램프 풀고 스토퍼를 올려 컨베이어로 내보내요. 다 나가면(하우징 도착 꺼짐) 스토퍼를 다시 내려 다음 하우징을 받아요. 마지막 하우징이 상자에 들어갈 때까지 몇 초 기다리고 끝내요.',
    setup: { parts: (l) => [housing(l, 120), housing(l, 210), housing(l, 300)], auto: false, queue: pinQueue(14, [5]) },
    timeS: E6_TIME,
    checks: [assembled(3), timeWithin(E6_TIME), safe],
    solution:
      `${HEAD_E}${FEED}cell.set("스토퍼", True)\ncell.set("컨베이어", True)\nfor _ in range(3):\n` +
      indE(
        `cell.wait("하우징 도착")\nrobot.wait(0.5)\ncell.set("컨베이어", False)\n${CLAMP}for _ in range(4):\n${indE(`${ONE}${RETRY}`)}robot.home()\n` +
          `cell.set("클램프", False)\ncell.wait("클램프 열림")\ncell.set("스토퍼", False)\ncell.set("컨베이어", True)\ncell.wait("하우징 도착", False)\ncell.set("스토퍼", True)\n`,
      ) +
      'robot.wait(5)\n',
  },
];


/* --- F: 로봇 카페 ------------------------------------------------------------------ */
// Steps and their grounds: docs/reports/education/43-track-life-robot-cafe.md §5.

const cupAt = (j: Judge, place: string) => {
  const p = j.l.places[place];
  return partAt(j, p.x, p.y, p.z);
};

/** A cup standing at `place` with the order in it (and nothing spilled). */
function drinkOn(place: string, label: string): Check {
  return {
    label,
    judge: (j) => {
      const o = cupAt(j, place);
      if (!o) return { ok: false, detail: `${place}에 컵이 없어요` };
      const v = drinkVerdict(o.drink, j.cafe?.order);
      return { ok: v.ok, detail: v.why };
    },
  };
}

const noTrayPour: Check = {
  label: '컵 없이 붓거나 붓는 중에 컵을 빼지 않았어요',
  judge: (j) => {
    const n = j.cafe?.trayPours.length ?? 0;
    return n ? { ok: false, detail: `${j.cafe!.trayPours.join(', ')}에서 ${n}번 쏟아짐` } : { ok: true };
  },
};

const served = (n: number, o: CafeOrder = ICED_AMERICANO): Check => ({
  label: `손님에게 ${o.name} ${n}잔`,
  judge: (j) => {
    const s = j.cafe?.served ?? [];
    const good = s.filter((d) => d.ok).length;
    const bad = s.find((d) => !d.ok);
    return { ok: good >= n, detail: bad ? `${good} / ${n}잔 · ${bad.why}` : `${good} / ${n}잔` };
  },
});

const doorSafe: Check = {
  label: '문이 열린 픽업대에 팔이 들어가지 않았어요',
  judge: (j) => (j.cafe?.doorBreaches ? { ok: false, detail: `${j.cafe.doorBreaches}번` } : { ok: true }),
};

/** The step's reference program: its answer cards (cafeRecipe.ts), so the cards and the checks stay one. */
const cafeSolution = (id: string) => recipeCode(RECIPE_ANSWER[id]).code;

const F: CellMission[] = [
  {
    id: 'F1',
    cell: 'cafe',
    n: 1,
    title: '둘러보기: 아이스 아메리카노 한 잔',
    adds: '공정 5개로 한 잔이 만들어지는 걸 보기',
    goal: '주문 1잔: 공정 카드 5장(컵 → 얼음 → 샷 → 물 → 건네기)대로 만들어 손님에게 건네요. 로봇이 장비마다 무엇을 기다리는지 보세요.',
    hint: '실제 로봇 카페도 주문이 들어오면 컵 → 얼음 → 샷 → 물 → 픽업 순서로 돌아요. 카드를 펼치면 로봇이 그 공정에서 하는 동작이 보여요.',
    setup: { parts: () => [], auto: false, orders: 1, order: ICED_AMERICANO },
    checks: [served(1), noTrayPour, safe],
    solution: cafeSolution('F1'),
  },
  {
    id: 'F2',
    cell: 'cafe',
    n: 2,
    title: '신호 기다리기',
    adds: '샷 추출이 끝날 때까지 기다렸다가 컵 꺼내기',
    goal: '아이스 아메리카노 한 잔을 픽업 1에 놓아요. 커피 머신의 [추출 끝] 신호를 받고 나서 컵을 꺼내야 해요.',
    hint: "추출은 28초 걸려요. ③ 샷 카드를 펼치면 '[추출 끝]까지 기다리기'가 꺼져 있어요. 기다리지 않고 컵을 빼면 나머지 커피가 받침대로 쏟아져요.",
    setup: { parts: () => [], auto: false, orders: 1, order: ICED_AMERICANO },
    checks: [drinkOn('픽업 1', '픽업 1에 아이스 아메리카노'), noTrayPour, safe],
    solution: cafeSolution('F2'),
  },
  {
    id: 'F3',
    cell: 'cafe',
    n: 3,
    title: '주문이 바뀌었다: 얼음 적게 · 샷 추가',
    adds: '주문대로 양을 맞추고 빠진 공정 넣기',
    goal: `주문 '${orderName(LESS_ICE_EXTRA_SHOT)}': 얼음 100 ml · 샷 3개(90 ml) · 물 150 ml를 픽업 1에 놓아요.`,
    hint: '컵은 355 ml예요. 샷만 늘리고 얼음을 그대로 두면 넘쳐요. 빠진 ④ 물 카드는 [+ 카드]로 넣고 ▲로 ⑤ 건네기 앞에 옮겨요.',
    setup: { parts: () => [], auto: false, orders: 1, order: LESS_ICE_EXTRA_SHOT },
    checks: [drinkOn('픽업 1', `픽업 1에 ${orderName(LESS_ICE_EXTRA_SHOT)}`), noTrayPour, safe],
    solution: cafeSolution('F3'),
  },
  {
    id: 'F4',
    cell: 'cafe',
    n: 4,
    title: '안전하게 건네기 · 주문 2잔',
    adds: '픽업 문으로 건네고, 문이 열린 동안 팔은 밖에 · 2잔 반복',
    goal: '주문 2잔을 만들어 픽업 문으로 손님에게 건네요. 손님이 가져가면 문을 닫아요.',
    hint: "⑤ 건네기 카드를 펼쳐 '픽업 문 열기 → 손님이 가져갈 때까지 → 문 닫기'를 켜요. 놓기 → 팔 빼기 → 문 열기 순서라 문이 열린 동안 팔은 밖에 있어요. 실제 로봇 카페는 한 잔에 40초~1분이 걸려요.",
    setup: { parts: () => [], auto: false, orders: 2, order: ICED_AMERICANO },
    checks: [served(2), doorSafe, noTrayPour, safe],
    solution: cafeSolution('F4'),
  },
];

/* --- G: 로봇 캘리그라피 ------------------------------------------------------------- */
// Steps and their grounds: docs/reports/education/44-track-life-robot-calligraphy.md §5.

/** The cards so far with their ink (handed over first, then the one on the mat). */
const cardsNow = (j: Judge) => (j.draw ? cardsOf(j.draw, j.trail ?? []) : []);

/** The card on the mat (or the last one written) reads `phrase` well. */
function written(phrase: Phrase, label: string): Check {
  return {
    label,
    judge: (j) => {
      const c = cardsNow(j).at(-1);
      if (!c) return { ok: false, detail: '카드가 없어요' };
      const v = inkVerdict(readInk(c.ink, phrase, c.corner));
      return { ok: v.ok, detail: v.why };
    },
  };
}

/** The writing stands in the card's middle (within 3 mm). */
const centred: Check = {
  label: '글씨가 카드 가운데에 (3 mm 안)',
  judge: (j) => {
    const c = cardsNow(j).at(-1);
    if (!c) return { ok: false, detail: '카드가 없어요' };
    const r = readInk(c.ink, 'HELLO', c.corner);
    if (r.length < 3) return { ok: false, detail: '아무것도 안 써졌어요' };
    return r.offCentre <= 3 && r.outside <= 2 ? { ok: true, detail: `가운데에서 ${r.offCentre.toFixed(1)} mm` } : { ok: false, detail: r.outside > 2 ? `카드 밖으로 ${Math.round(r.outside)} mm` : `가운데에서 ${Math.round(r.offCentre)} mm 벗어났어요` };
  },
};

/** Every side straight: no ink more than 1 mm off the square's lines. */
const straight: Check = {
  label: '네 변이 곧아요 (선에서 1 mm 안)',
  judge: (j) => {
    const c = cardsNow(j).at(-1);
    if (!c) return { ok: false, detail: '카드가 없어요' };
    const r = readInk(c.ink, '네모', c.corner);
    if (r.length < 3) return { ok: false, detail: '아무것도 안 써졌어요' };
    return r.maxDev <= 1 ? { ok: true, detail: `가장 많이 휜 곳 ${r.maxDev.toFixed(1)} mm` } : { ok: false, detail: `변이 ${r.maxDev.toFixed(1)} mm 휘었어요` };
  },
};

/** `n` cards handed to the customers, each reading `phrase` well. */
function delivered(n: number, phrase: Phrase): Check {
  return {
    label: `손님 ${n}명에게 '${phrase}' 카드`,
    judge: (j) => {
      const done = j.draw?.done ?? [];
      const verdicts = done.map((c) => inkVerdict(readInk(c.ink, phrase, c.corner)));
      const good = verdicts.filter((v) => v.ok).length;
      const bad = verdicts.find((v) => !v.ok);
      return { ok: good >= n, detail: bad ? `${good} / ${n}장 · ${bad.why}` : `${good} / ${n}장` };
    },
  };
}

/** The usual cards (the one answer every step builds on). */
const gAnswer = (r: DrawRecipe) => drawCode(r).code;

const G: CellMission[] = [
  {
    id: 'G1',
    cell: 'draw',
    n: 1,
    title: "둘러보기: '사랑해' 카드 한 장",
    adds: '완성된 순서로 카드 한 장이 써지는 걸 보기',
    goal: "준비된 순서로 손님의 메시지 카드에 '사랑해'를 써서 건네요. 펜이 언제 내려가고 언제 들리는지 보세요.",
    hint: '실제 캘리그라피 부스도 카드 받기 → 쓰기 → 완성 알리기 순서예요. 펜은 획을 쓸 때만 종이에 닿고, 다음 획으로 갈 때는 들려요.',
    setup: { parts: () => [], auto: false, orders: 1 },
    checks: [delivered(1, '사랑해'), safe],
    solution: gAnswer(G_ANSWER.G1),
  },
  {
    id: 'G2',
    cell: 'draw',
    n: 2,
    title: '보정: 펜 높이 · 카드 위치',
    adds: '펜이 닿는 높이와 카드가 놓인 자리를 로봇에게 알려 주기',
    goal: "새 펜으로 갈았고, 카드도 다른 자리에 놓였어요. 펜 높이를 다시 맞추고 매트 눈금으로 카드 모서리 좌표를 넣어 'HELLO'를 카드 가운데에 써요.",
    hint: '펜 끝이 종이(0 mm)에 닿아야 선이 나와요. 로봇은 카드를 보지 못해서, 로봇 좌표(매트 눈금, mm)로 카드 왼쪽 아래 모서리를 알려 줘야 그 점을 기준으로 써요. 실제 부스도 설치할 때 이 두 가지부터 맞춰요.',
    setup: { parts: () => [], auto: false, orders: 1, card: { ...G3_CARD } },
    checks: [written('HELLO', "카드에 'HELLO'가 또렷하게"), centred, safe],
    solution: gAnswer(G_ANSWER.G2),
  },
  {
    id: 'G3',
    cell: 'draw',
    n: 3,
    title: '곧은 선: 직선 이동',
    adds: '관절 이동 대신 직선 이동으로 네모 그리기',
    goal: '카드에 한 변 56 mm 네모를 그려요. 네 변이 곧아야 해요(선에서 1 mm 안).',
    hint: '관절 이동은 모든 관절이 한꺼번에 돌아서 펜 끝이 휘어 가요. 직선 이동은 로봇이 길을 잘게 나눠 펜 끝이 곧게 가요. 공장의 실링 · 접착제 도포도 직선 이동을 써요.',
    setup: { parts: () => [], auto: false, orders: 1 },
    checks: [written('네모', '카드에 네모'), straight, safe],
    solution: gAnswer(G_ANSWER.G3),
  },
  {
    id: 'G4',
    cell: 'draw',
    n: 4,
    title: '펜 들기 · 손님 2명',
    adds: '획 사이에 펜을 들어 옮기고, 손님 2명에게 반복',
    goal: "줄 선 손님 2명에게 '사랑해' 카드를 한 장씩 써서 건네요. 획 사이에 줄이 그어지면 안 돼요.",
    hint: `펜을 내린 채로 다음 획의 시작점으로 가면 그 길도 선이 돼요. 획이 끝나면 펜을 ${LIFT_MM} mm 들고 옮겨요('빈 이동'). 손님이 카드를 놓거나 가져가는 동안 팔이 카드 위로 가면 멈춰요.`,
    setup: { parts: () => [], auto: false, orders: 2 },
    checks: [delivered(2, '사랑해'), safe],
    solution: gAnswer(G_ANSWER.G4),
  },
];

/* --- H: 보드게임 로봇 (입문 트랙 ① 생활 로봇) ---------------------------------------------- */

/** H: the robot's 15 white stones in their tray. */
function trayStones(): DeskObject[] {
  const T = STONE_TRAY;
  const out: DeskObject[] = [];
  for (let i = 0; i < T.rows; i += 1) for (let j = 0; j < T.cols; j += 1) out.push(stoneAt(2, T.x + i * T.pitch, T.y + j * T.pitch, T.top));
  return out;
}

function stoneOn(p: Pt): Check {
  return {
    label: `가로 ${p.c} · 세로 ${p.r} 교차점에 흰 돌`,
    judge: (j) => {
      const mine = j.board ? robotStones(j.board) : [];
      const k = mine.find((s) => s.p.c === p.c && s.p.r === p.r);
      if (k && k.off <= ON_POINT_MM) return { ok: true };
      if (k) return { ok: false, detail: `교차점에서 ${k.off.toFixed(1)} mm 벗어났어요` };
      const near = mine[0];
      return { ok: false, detail: near ? `가로 ${near.p.c} · 세로 ${near.p.r} 근처에 뒀어요 (${near.off.toFixed(1)} mm 벗어남)` : '판에 흰 돌이 없어요' };
    },
  };
}

const afterTurns = (n: number): Check => ({
  label: `사람 차례가 끝난 뒤에 흰 돌 ${n}개`,
  judge: (j) => {
    const mine = j.board ? robotStones(j.board).length : 0;
    if (j.board?.breaches) return { ok: false, detail: '사람이 두는 중에 팔이 판 위로 갔어요' };
    return mine >= n ? { ok: true } : { ok: false, detail: `${mine} / ${n}개` };
  },
});

const robotWins: Check = {
  label: '흰 돌 5개를 먼저 이었어요',
  judge: (j) => {
    const w = j.board?.winner;
    if (w === 2) return { ok: true, detail: `흰 돌 ${j.board ? robotStones(j.board).length : 0}개째에` };
    return { ok: false, detail: w === 1 ? '사람이 먼저 5개를 이었어요' : '아직 승부가 나지 않았어요' };
  },
};

const hAnswer = (r: BoardRecipe) => boardCode(r).code;
const hSetup: MissionSetup = { parts: trayStones, auto: false };

const H: CellMission[] = [
  {
    id: 'H1',
    cell: 'board',
    n: 1,
    title: '둘러보기: 흰 돌 한 수',
    adds: '완성된 순서로 로봇이 한 수 두는 걸 보기',
    goal: '사람이 먼저 가운데에 검은 돌을 두면, 로봇이 흰 돌을 집어 가로 5 · 세로 4에 둬요. 로봇이 언제 움직이기 시작하는지 보세요.',
    hint: '한 수는 차례 기다리기 → 돌 집기 → 칸으로 옮겨 내려놓기 → 기본 자세로 순서예요. 흡착 펌프는 돌 윗면에 닿아서 공기를 빨아들여 들어 올려요.',
    setup: hSetup,
    checks: [stoneOn({ c: 5, r: 4 }), safe],
    solution: hAnswer(H_ANSWER.H1),
  },
  {
    id: 'H2',
    cell: 'board',
    n: 2,
    title: '격자 좌표: 칸 간격',
    adds: '가로 · 세로 칸 번호를 로봇 좌표(mm)로 바꾸기',
    goal: '흰 돌을 가로 7 · 세로 6 교차점에 정확히 둬요(교차점에서 3 mm 안). 판 눈금으로 줄 사이 간격을 재서 맞춰요.',
    hint: '로봇은 칸 번호를 몰라요. x = 가로 1의 x + (가로 − 1) × 칸 간격으로 계산해서 움직여요. 간격이 1 mm만 틀려도 판 끝으로 갈수록 크게 벗어나요.',
    setup: hSetup,
    checks: [stoneOn({ c: 7, r: 6 }), safe],
    solution: hAnswer(H_ANSWER.H2),
  },
  {
    id: 'H3',
    cell: 'board',
    n: 3,
    title: '차례 기다리기',
    adds: '사람 차례가 끝난 뒤에만 판 위로 가기',
    goal: '흰 돌 2개를 가로 5 · 세로 4, 가로 6 · 세로 4에 둬요. 사람이 돌을 두는 동안 팔이 판 위로 오면 안 돼요.',
    hint: '[로봇 차례]는 사람이 돌을 두고 손을 뺀 뒤에 켜져요. 사람 손이 판 위에 있는 동안([손 감지]) 팔이 판 위로 오면 멈춰요. 수마다 차례를 기다려요.',
    setup: hSetup,
    checks: [stoneOn({ c: 5, r: 4 }), stoneOn({ c: 6, r: 4 }), afterTurns(2), safe],
    solution: hAnswer(H_ANSWER.H3),
  },
  {
    id: 'H4',
    cell: 'board',
    n: 4,
    title: '판단 규칙: 한 판 이기기',
    adds: '판 센서로 돌을 읽고 규칙으로 칸 고르기',
    goal: '한 판을 둬서 흰 돌 5개를 먼저 이어요. 정해진 칸 대신, 판을 읽고 규칙으로 칸을 골라야 해요.',
    hint: "규칙의 순서가 중요해요. ① 내가 5개를 만들 수 있으면 둔다(이기기) ② 사람이 5개를 만들 칸이 있으면 먼저 막는다(막기) ③ 아니면 내 돌을 가장 길게 잇는다(잇기). '빈 칸 차례대로'나 '잇기만'으로는 사람이 먼저 이겨요.",
    setup: hSetup,
    checks: [robotWins, safe],
    solution: hAnswer(H_ANSWER.H4),
  },
];

export const MISSIONS: readonly CellMission[] = [...A, ...B, ...C, ...D, ...E, ...F, ...G, ...H];

export const missionsOf = (cell: CellId) => MISSIONS.filter((m) => m.cell === cell);
export const missionById = (id: string) => MISSIONS.find((m) => m.id === id) ?? null;

/** 자유 실습's parts in cells B ~ E (their ladders are still to come): enough to see the equipment work. */
function sampleParts(l: CellLayout): DeskObject[] {
  const P = (x: number, y: number, z: number, over: Partial<DeskObject> = {}) => makePart(x, y, z, over);
  const top = l.line.belt?.topZ ?? 30;
  switch (l.id) {
    case 'vision':
      return [-380, -330, -280, -230, -180, -130].map((y, k) => bPart(225, y, top, { color: ['빨강', '파랑', '노랑'][k % 3], d: k === 4 ? SMALL : BIG }));
    case 'inspect':
      return [];
    case 'tend':
      return blanks(9)(l);
    case 'assembly': {
      const nest = l.places['핀 집는 자리'];
      return [housing(l, l.places['하우징'].y), housing(l, 300), housing(l, 255), P(nest.x, nest.y, nest.z, { size: [8, 8, 22], color: PIN, massG: 5 })];
    }
    default:
      return [];
  }
}

/** 자유 실습: the cell with a full magazine, parts on the source plate, the line on 자동 운전 (B ~ E: their sample parts). */
export function freeSetup(): MissionSetup {
  return {
    parts: (l) => (l.id === 'feed' ? [...(l.line.magazine ? magazineParts(l, 9) : []), ...onSourcePlate(9)(l)] : sampleParts(l)),
    auto: true,
    refill: 99,
    queue: (l) =>
      l.line.inspect
        ? cQueue('MPmMPpMMPmPM')()
        : l.line.insert
          ? pinQueue(40)()
          : l.line.dispenser
          ? ['빨강', '파랑', '노랑', FADED, '빨강', '노랑'].map((color, k) => bPart(0, 0, 0, { color, d: k % 2 ? SMALL : BIG, outline: (['원', '사각', '육각'] as const)[k % 3] }))
          : [],
  };
}

/** The checks, now. */
export function judge(m: CellMission, j: Judge): { label: string; ok: boolean; detail?: string }[] {
  return (m.checks ?? []).map((c) => ({ label: c.label, ...c.judge(j) }));
}

export const cellOfLetter = (letter: string) => CELLS.find((c) => c.letter === letter)?.id ?? null;
