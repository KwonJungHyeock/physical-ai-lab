/**
 * 실습 셀 missions: each cell has a ladder of steps, easy to hard, every step adding one condition
 * to the one before (한 칸 → 한 자리, then 옆에 놓기, then 쌓기 …), as a training cell's exercises
 * and the 자동화설비기능사 practical build up. Beside the ladder, 자유 실습: the same cell with
 * every part and the line running, no checks — the student controls it however they like.
 *
 * A mission says how the cell starts (setup) and what is checked (checks, read off the world as it
 * is now and the run's record). Distances and heights the student reads are shop millimetres.
 */

import type { DeskObject } from '../desk';
import { CELLS, fromShop, gridPlace, magazineParts, makePart, type CellId, type CellLayout } from './cells';
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
}

export type CellEvent =
  | { t: number; type: 'pick'; place: string; part: string | null; sensors: Record<string, boolean> }
  | { t: number; type: 'place'; place: string; part: string | null }
  | { t: number; type: 'feed' };

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

const B = ladder('vision', 'B', [
  ['카메라로 색 읽기', '카메라 판정 결과로 놓을 곳 정하기', '판 위 부품 하나의 색을 카메라로 읽어 맞는 함에 넣어요.'],
  ['세 가지 색', '판정을 여러 번', '빨강 · 파랑 · 노랑 부품 3개를 각각 맞는 함에 넣어요.'],
  ['위치도 카메라로', '카메라 좌표 → 로봇 좌표', '아무 데나 놓인 부품을 카메라가 찾은 위치로 집어요.'],
  ['크기 기준', '판정 기준값을 직접 정하기', '지름 기준을 정해 큰 것과 작은 것을 나눠요.'],
  ['색 · 크기 두 조건', '규칙표 (조건 두 개)', '색과 크기 규칙표대로 함 1 · 2 · 3에 나눠요.'],
  ['벨트 위에서 찍기', '끝 센서 → 촬영 → 집기', '벨트가 실어 오는 부품을 멈춘 뒤 찍고 분류해요.'],
  ['모르는 것은 불량 슈트', '판정 확신도 기준', '확신도가 낮은 부품은 불량 슈트로 보내요.'],
  ['모양 학습', '사진 등록으로 분류기 만들기', '원 · 사각 · 육각 사진을 등록해 섞인 부품을 나눠요.'],
  ['연속 12개 · 시간 안에', '사이클 타임 목표', '섞인 부품 12개를 놓치지 않고 시간 안에 분류해요.'],
]);

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

/** 자유 실습: the cell with a full magazine, parts on the source plate, the line on 자동 운전. */
export function freeSetup(): MissionSetup {
  return { parts: (l) => [...(l.line.magazine ? magazineParts(l, 9) : []), ...onSourcePlate(9)(l)], auto: true, refill: 99 };
}

/** The checks, now. */
export function judge(m: CellMission, j: Judge): { label: string; ok: boolean; detail?: string }[] {
  return (m.checks ?? []).map((c) => ({ label: c.label, ...c.judge(j) }));
}

export const cellOfLetter = (letter: string) => CELLS.find((c) => c.letter === letter)?.id ?? null;
