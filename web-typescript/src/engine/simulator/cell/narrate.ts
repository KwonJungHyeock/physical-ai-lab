/**
 * 주문 한 잔 따라가기 (입문 트랙 · 로봇 카페 1단계 미리보기): what the café's signals say, as they
 * change, said at the equipment that sends or gets them — a bubble over the scene follows each one,
 * and the camera goes to its place.
 *
 * The line's own log (line.ts setIn / setOut) is the story: every change of a signal this table
 * knows is a line, in order; two at the same moment are said together. Console shows them one by one
 * and holds the scene on each (NARRATE_HOLD_MS) so it is read; the run keeps the one shown (CellRun.said).
 *
 * No React: Console.tsx paces the lines and moves the camera, CellScene.tsx shows the bubble,
 * CellHud.tsx lights the machine on the 신호 관제판, tests/simulator/cell-f-check.mts reads the lines.
 */

import { CAFE_AT } from './cells';
import type { CellRun } from './run';

/** The step narrated: the café's 미리보기. */
export const NARRATED = 'F1';

/** Where a line is said: the equipment's name (its station shot, its bubble's place). */
export type NarratePlace = '키오스크' | '컵 디스펜서' | '제빙기' | '커피 머신' | '정수기' | '픽업대';

export interface Narration {
  /** The log entry it came from (stable while it is shown). */
  key: string;
  place: NarratePlace;
  /** 'in': the equipment tells the robot; 'out': the robot tells the equipment. */
  dir: 'in' | 'out';
  signal: string;
  text: string;
}

const A = CAFE_AT;
/** Each place's bubble point (robot frame, mm), over the equipment. */
export const NARRATE_AT: Record<NarratePlace, [number, number, number]> = {
  키오스크: [372, -236, 150],
  '컵 디스펜서': [A.cup.x, A.cup.y + 40, 130],
  제빙기: [A.ice.x + 60, A.ice.y, 120],
  '커피 머신': [A.coffee.x + 60, A.coffee.y, 115],
  정수기: [A.water.x + 55, A.water.y, 110],
  픽업대: [98, -196, 90],
};

/** What each signal's change means, said at its place: [signal, on] → line. */
/** `after`: said only once that signal has changed before (the door shut as the cell opens is not news). */
const LINES: { signal: string; on: boolean; place: NarratePlace; text: string; after?: string }[] = [
  { signal: '주문 확인', on: true, place: '키오스크', text: '손님이 주문했어요' },
  { signal: '주문 1', on: true, place: '키오스크', text: '1번 메뉴 주문이에요' },
  { signal: '주문 2', on: true, place: '키오스크', text: '2번 메뉴 주문이에요' },
  { signal: '주문 3', on: true, place: '키오스크', text: '3번 메뉴 주문이에요' },
  { signal: '컵 내리기', on: true, place: '컵 디스펜서', text: '컵을 하나 내려 달라고 해요' },
  { signal: '컵 준비됨', on: true, place: '컵 디스펜서', text: '컵이 나왔어요 → 집으러 가요' },
  { signal: '제빙기 컵 감지', on: true, place: '제빙기', text: '컵이 제자리에 놓였어요' },
  { signal: '얼음', on: true, place: '제빙기', text: '얼음을 넣어 달라고 해요' },
  { signal: '얼음 끝', on: true, place: '제빙기', text: '얼음이 다 들어갔어요 → 컵을 옮겨요' },
  { signal: '머신 컵 감지', on: true, place: '커피 머신', text: '컵이 제자리에 놓였어요' },
  { signal: '추출 시작', on: true, place: '커피 머신', text: '커피를 내려 달라고 해요' },
  { signal: '추출 중', on: true, place: '커피 머신', text: '커피가 나오는 동안 로봇은 기다려요' },
  { signal: '추출 끝', on: true, place: '커피 머신', text: '다 나왔어요 → 이제 컵을 들어도 돼요' },
  { signal: '정수기 컵 감지', on: true, place: '정수기', text: '컵이 제자리에 놓였어요' },
  { signal: '물', on: true, place: '정수기', text: '물을 부어 달라고 해요' },
  { signal: '물 끝', on: true, place: '정수기', text: '물이 다 들어갔어요 → 컵을 옮겨요' },
  { signal: '온수', on: true, place: '정수기', text: '뜨거운 물을 부어 달라고 해요' },
  { signal: '온수 끝', on: true, place: '정수기', text: '뜨거운 물이 다 들어갔어요' },
  { signal: '픽업 문', on: true, place: '픽업대', text: '음료를 놓고 문을 열어요' },
  { signal: '문 열림', on: true, place: '픽업대', text: '문이 열렸어요 → 로봇 팔은 밖에서 기다려요' },
  { signal: '손 감지', on: true, place: '픽업대', text: '손님 손이 들어왔어요 · 팔은 움직이지 않아요' },
  { signal: '손 감지', on: false, place: '픽업대', text: '손님이 가져갔어요 → 문을 닫아요' },
  { signal: '문 닫힘', on: true, place: '픽업대', text: '문이 닫혔어요 · 한 잔 끝!', after: '픽업 문' },
];

/** 주문 한 잔 따라가기: how long each line holds the scene, so it is read before the next (ms; Console). */
export const NARRATE_HOLD_MS = 1500;

/**
 * Every line said so far in this run, in order (each log entry this table knows). Lines at the same
 * moment at the same place, the same way (주문 확인 · 주문 1) are one line, said together, the last
 * signal on top; what the robot sends and what the machine answers stay two.
 * Console shows them one by one, holding the scene on each (CellRun.said), so none is missed however
 * fast the signals come; the bubble and the camera follow `said`.
 */
export function narrationLines(run: CellRun): Narration[] {
  if (run.layout.id !== 'cafe') return [];
  const out: Narration[] = [];
  let lastT = -Infinity;
  run.line.log.forEach((e, k) => {
    const l = LINES.find((x) => x.signal === e.name && x.on === e.on);
    if (!l || (l.after && !run.line.log.slice(0, k).some((p) => p.name === l.after))) return;
    const prev = out[out.length - 1];
    const n: Narration = { key: `${k}`, place: l.place, dir: run.layout.inputs.includes(e.name) ? 'in' : 'out', signal: e.name, text: l.text };
    if (prev && prev.place === n.place && prev.dir === n.dir && e.t - lastT < 0.05) out[out.length - 1] = { ...n, text: `${prev.text} · ${l.text}` };
    else out.push(n);
    lastT = e.t;
  });
  return out;
}

/**
 * 신호 관제판 (입문 · 로봇 카페, CellHud's SIGNAL): the café's signals by the equipment they belong to,
 * in the order a drink goes — what the robot sends it (출력) and what it answers (입력).
 */
export const CAFE_BOARD: { place: NarratePlace; img: string; outs: string[]; ins: string[] }[] = [
  { place: '키오스크', img: '/sim/cafe/kiosk.webp', outs: [], ins: ['주문 확인', '주문 1', '주문 2', '주문 3', '영업 끝'] },
  { place: '컵 디스펜서', img: '/sim/cafe/cup.webp', outs: ['컵 내리기'], ins: ['컵 준비됨'] },
  { place: '제빙기', img: '/sim/cafe/ice.webp', outs: ['얼음'], ins: ['제빙기 컵 감지', '얼음 나오는 중', '얼음 끝'] },
  { place: '커피 머신', img: '/sim/cafe/coffee.webp', outs: ['추출 시작'], ins: ['머신 컵 감지', '추출 중', '추출 끝'] },
  { place: '정수기', img: '/sim/cafe/water.webp', outs: ['물', '온수'], ins: ['정수기 컵 감지', '물 나오는 중', '물 끝', '온수 나오는 중', '온수 끝'] },
  { place: '픽업대', img: '/sim/cafe/pickup.webp', outs: ['픽업 문'], ins: ['문 열림', '문 닫힘', '손 감지'] },
];
