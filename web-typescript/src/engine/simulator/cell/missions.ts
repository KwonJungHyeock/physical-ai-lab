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
import { CELLS, PART_HEIGHT, fromShop, gridPlace, magazineParts, makePart, type CellId, type CellLayout } from './cells';
import { REJECT, outlineOf, type Outline, type VisionState } from './vision';
import type { CellAlert } from './faults';
import type { LineState } from './line';

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
}

export type CellEvent =
  | { t: number; type: 'pick'; place: string; part: string | null; sensors: Record<string, boolean> }
  | { t: number; type: 'place'; place: string; part: string | null }
  | { t: number; type: 'feed' }
  | { t: number; type: 'look'; part: string | null }
  | { t: number; type: 'sort'; part: string; to: string };

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

const ladder = (cell: CellId, letter: string, rows: [string, string, string][]): CellMission[] =>
  rows.map(([title, adds, goal], k) => ({ id: `${letter}${k + 1}`, cell, n: k + 1, title, adds, goal, hint: '' }));

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

const beltStoppedAtSensor: Check = {
  label: '끝 센서가 켜지면 컨베이어를 껐어요',
  judge: (j) => (j.alerts.some((a) => a.kind === 'jam') ? { ok: false, detail: '벨트가 부품 밑에서 미끄러졌어요' } : { ok: true }),
};

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

const C = ladder('inspect', 'C', [
  ['스토퍼에서 집기', '스토퍼가 세운 부품 집기', '스토퍼에 멈춘 부품을 집어 트레이에 놓아요.'],
  ['높이 검사', '센서 값으로 양품만', '높이 센서 값이 정상인 부품만 트레이에 놓아요.'],
  ['불량은 밀어내기', '배출 실린더 신호', '불량 부품은 배출 실린더로 불량함에 밀어내요.'],
  ['금속 / 비금속', '유도형 센서로 재질 나누기', '금속과 비금속 부품을 트레이 두 곳에 나눠 담아요.'],
  ['3번 연속 불량이면 정지', '경광등 · 라인 정지 조건', '불량이 3개 연이어 나오면 라인을 멈추고 빨간 불을 켜요.'],
  ['연속 12개 · 불량률', '기록 남기기', '12개를 검사하고 불량률을 기록해요.'],
]);

const D = ladder('tend', 'D', [
  ['척에 넣기', '문 열림 확인 뒤 넣기', '소재 하나를 열린 선반의 척에 넣어요.'],
  ['척 잠김 뒤 손 빼기', '척 신호 기다리기', '척이 잠긴 신호를 받은 뒤 그리퍼를 열고 빠져나와요.'],
  ['가공 시작 · 끝', '문 닫기 → 가공 → 끝 신호', '문을 닫고 가공을 시작해, 끝나면 꺼내 완성품 트레이에 놓아요.'],
  ['같은 번호 칸에', '소재 칸 ↔ 완성품 칸 맞추기', '꺼낸 완성품을 소재와 같은 번호 칸에 놓아요.'],
  ['인터록', '가공 중 들어가지 않기', '가공 중에는 기다렸다가, 끝 신호 뒤에만 들어가요.'],
  ['6개 연속 · 미리 집기', '가공하는 동안 다음 소재 준비', '가공하는 동안 다음 소재를 미리 집어 사이클을 줄여요.'],
]);

const E = ladder('assembly', 'E', [
  ['핀 하나 꽂기', '위에서 수직으로 넣기', '핀 하나를 구멍(여유 2 mm)에 수직으로 꽂아요.'],
  ['클램프 뒤에 꽂기', '클램프 닫힘 신호', '클램프가 하우징을 잡은 뒤에 꽂아요.'],
  ['구멍 4개', '순서대로 되풀이', '구멍 4개를 차례로 채워요.'],
  ['여유 0.5 mm', '느린 접근 · 정밀 위치', '여유가 0.5 mm인 구멍에 걸리지 않게 꽂아요.'],
  ['걸리면 다시', '걸림 감지 → 들었다 다시', '걸림을 느끼면 들어 올렸다가 다시 꽂아요.'],
  ['하우징 연속', '컨베이어로 오는 하우징마다', '들어오는 하우징마다 핀 4개를 꽂아 내보내요.'],
]);

export const MISSIONS: readonly CellMission[] = [...A, ...B, ...C, ...D, ...E];

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
      return [-410, -360, -200, -120].map((y, k) => P(225, y, top, k === 2 ? { size: [25, 25, 12], color: '#9aa3ab' } : {}));
    case 'tend': {
      const g = l.grids['소재 트레이'];
      return Array.from({ length: 9 }, (_, k) => {
        const p = gridPlace(g, k);
        return P(p.x, p.y, p.z, { size: [18, 18, 20], color: '#b9c0c8', massG: 30 });
      });
    }
    case 'assembly': {
      const nest = l.places['핀 집는 자리'];
      const housing = (y: number) => makeObject('box', { x: 200, y, z: top }, { size: [30, 30, 16], color: '#3d4650', massG: 30 });
      return [housing(300), housing(250), housing(200), P(nest.x, nest.y, nest.z, { size: [8, 8, 22], color: '#d4d9de', massG: 5 }), ...[-200, -186, -172, -158].map((y) => P(130, y, nest.z, { size: [8, 8, 22], color: '#d4d9de', massG: 5 }))];
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
    queue: (l) => (l.line.dispenser ? ['빨강', '파랑', '노랑', FADED, '빨강', '노랑'].map((color, k) => bPart(0, 0, 0, { color, d: k % 2 ? SMALL : BIG, outline: (['원', '사각', '육각'] as const)[k % 3] })) : []),
  };
}

/** The checks, now. */
export function judge(m: CellMission, j: Judge): { label: string; ok: boolean; detail?: string }[] {
  return (m.checks ?? []).map((c) => ({ label: c.label, ...c.judge(j) }));
}

export const cellOfLetter = (letter: string) => CELLS.find((c) => c.letter === letter)?.id ?? null;
