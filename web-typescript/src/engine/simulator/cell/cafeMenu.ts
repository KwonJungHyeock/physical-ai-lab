/**
 * 나만의 카페 (입문 트랙 · 로봇 카페 3~5단계): the student's menus and the robot's motion for each.
 *
 *  - A menu (메뉴 만들기) is a drink: its name, hot or iced, shots, ice and water in ml — what the
 *    order screen sends (cafe.ts CafeOrder). Up to three are kept as 레시피 카드.
 *  - Its motion (동작 만들기) follows from it: the cup, then the stations the drink needs (ice, the
 *    coffee machine, cold or hot water) in that order, then handing over. What the student makes
 *    is the timing: how long the arm waits at each station before taking the cup away — until the
 *    station's 끝 signal, or a number of seconds (too short and the rest spills; longer than the pour,
 *    the cup is safe but the drink is slower) — and whether the drink goes out through the door.
 *  - The program (cafeProgram) registers the menus (cell.menu), then for each order: waits for one
 *    on the order screen, and makes the menu it asks for (the condition is the program's, not the
 *    student's: the robot takes the card the order points at).
 *
 * The program is the same `robot.*` / `cell.*` lines the 실습 셀 runs, so the checks, the timeline's
 * marks and the real robot stay one. `steps` tells which program lines each motion step made.
 *
 * No React: CafeMaker.tsx shows it, tests/simulator/cell-f-check.mts runs it.
 */

import { ICED_AMERICANO, ORDER_INPUTS, SHOT_ML, type CafeOrder } from './cafe';

/** How the arm waits at a station: until its 끝 signal, or a number of seconds. */
export type WaitMode = { k: 'signal' } | { k: 'sec'; s: number };

export interface MenuRecipe {
  menu: CafeOrder;
  /** The wait at each station the menu uses. */
  waits: { ice: WaitMode; shot: WaitMode; water: WaitMode };
  /** Hand the drink over through the pickup door (open, the customer takes it, close). */
  door: boolean;
}

export type StationKey = 'ice' | 'shot' | 'water';

/** The stations as the café has them (cells.ts cafeLayout). */
export const STATIONS: Record<StationKey | 'hot', { name: string; out: string; done: string; label: string; pourS: (ml: number) => number }> = {
  ice: { name: '제빙기', out: '얼음', done: '얼음 끝', label: '얼음', pourS: (ml) => (3 * ml) / 145 },
  shot: { name: '커피 머신', out: '추출 시작', done: '추출 끝', label: '샷', pourS: (ml) => (28 * ml) / 60 },
  water: { name: '정수기', out: '물', done: '물 끝', label: '물', pourS: (ml) => (4 * ml) / 150 },
  hot: { name: '온수', out: '온수', done: '온수 끝', label: '온수', pourS: (ml) => (5 * ml) / 150 },
};

/** One step of a menu's motion, as the timeline shows it: what, how long (estimated), the station's pour. */
export interface MotionStep {
  key: 'cup' | StationKey | 'serve';
  label: string;
  /** The arm's own time for the step, s (moves, a pick and a place: an estimate before a run). */
  armS: number;
  /** A station step: how long the station pours, and how long the arm waits there (signal: the pour). */
  pourS?: number;
  waitS?: number;
  wait?: WaitMode;
  code: string;
}

const ml = (r: MenuRecipe, k: StationKey) => (k === 'ice' ? r.menu.ice : k === 'shot' ? r.menu.shots * SHOT_ML : r.menu.water);
const used = (r: MenuRecipe): StationKey[] => (['ice', 'shot', 'water'] as const).filter((k) => ml(r, k) > 0);
const HAND_OVER = 'cell.set("픽업 문", True)\ncell.wait("문 열림")\ncell.wait("손 감지")\ncell.wait("손 감지", False)\ncell.set("픽업 문", False)\ncell.wait("문 닫힘")\n';

/** A short push (the station needs to see the start), or the wait the student set. */
function waitCode(w: WaitMode, done: string, out: string): string {
  if (w.k === 'signal') return `cell.wait("${done}")\ncell.set("${out}", False)\n`;
  // A wait is at most 10 s a line (robot.wait's limit): a longer one is several.
  let left = Math.max(0.2, Math.round(w.s * 10) / 10);
  let code = '';
  while (left > 0.05) {
    const s = Math.min(10, left);
    code += `robot.wait(${Math.round(s * 10) / 10})\n`;
    left = Math.round((left - s) * 10) / 10;
  }
  return `${code}cell.set("${out}", False)\n`;
}

/** The menu's motion: its steps in order, with their program lines and times (estimates). */
export function motionSteps(r: MenuRecipe): MotionStep[] {
  const steps: MotionStep[] = [{ key: 'cup', label: '컵 받기', armS: 4, code: 'cell.set("컵 내리기", True)\ncell.wait("컵 준비됨")\ncell.set("컵 내리기", False)\nrobot.pick("컵 나오는 곳")\n' }];
  for (const k of used(r)) {
    const st = k === 'water' && r.menu.hot ? STATIONS.hot : STATIONS[k];
    const amount = k === 'shot' ? r.menu.shots : ml(r, k);
    const pourS = st.pourS(ml(r, k));
    const w = r.waits[k];
    // Cold and hot water come from the same tap (the place is the water dispenser's).
    const place = k === 'water' ? '정수기' : st.name;
    const waitS = w.k === 'signal' ? pourS : Math.max(0.2, w.s);
    steps.push({
      key: k,
      label: st.label,
      armS: 3.5,
      pourS,
      waitS,
      wait: w,
      code: `robot.place("${place}")\ncell.amount("${st.name}", ${amount})\ncell.set("${st.out}", True)\n${waitCode(w, st.done, st.out)}robot.pick("${place}")\n`,
    });
  }
  steps.push({ key: 'serve', label: r.door ? '건네기 (문)' : '픽업대에 놓기', armS: r.door ? 9 : 4, code: `robot.place("픽업 1")\nrobot.home()\n${r.door ? HAND_OVER : ''}` });
  return steps;
}

/** One drink's time, s (estimate): the arm's steps and its waits. */
export const cycleS = (r: MenuRecipe) => motionSteps(r).reduce((t, s) => t + s.armS + (s.waitS ?? 0), 0);

/** What a wait does to the drink: fine, or the station still pours when the cup goes (it spills). */
export function waitVerdict(s: MotionStep): 'ok' | 'short' | 'long' {
  if (!s.wait || s.pourS === undefined || s.waitS === undefined) return 'ok';
  if (s.wait.k === 'signal') return 'ok';
  if (s.waitS < s.pourS - 0.05) return 'short';
  return s.waitS > s.pourS + 1.5 ? 'long' : 'ok';
}

const HEAD = 'from edu import robot, cell\n\nrobot.home()\n';
const indent = (s: string, n = 1) => s.replace(/^(?=.)/gm, '    '.repeat(n));
const count = (s: string) => s.split('\n').length - 1;

/**
 * The café's program: the menus registered, then `orders` times: wait for an order (or the day's
 * end), and make the menu it asks for. `lines[m][k]`: the program lines (1-based, inclusive) motion
 * step k of menu m made — the same for every order (the loop's body).
 */
export function cafeProgram(recipes: readonly MenuRecipe[], orders: number): { code: string; lines: [number, number][][] } {
  let code = HEAD;
  recipes.forEach((r, k) => {
    const m = r.menu;
    code += `cell.menu(${k + 1}, "${m.name.replace(/"/g, '')}", ${m.ice}, ${m.shots}, ${m.water}, ${m.hot ? 'True' : 'False'})\n`;
  });
  code += `for _ in range(${Math.max(1, orders)}):\n`;
  code += indent(`cell.wait("${ORDER_INPUTS.next}")\nif cell.is_on("${ORDER_INPUTS.closed}"):\n    break\n`);
  let line = count(code) + 1;
  const lines: [number, number][][] = [];
  recipes.forEach((r, k) => {
    code += indent(`if cell.is_on("${ORDER_INPUTS.menu(k + 1)}"):\n`);
    line += 1;
    const spans: [number, number][] = [];
    for (const s of motionSteps(r)) {
      const n = count(s.code);
      spans.push([line, line + n - 1]);
      line += n;
      code += indent(s.code, 2);
    }
    lines.push(spans);
  });
  return { code, lines };
}

/** A new menu card: an iced americano with every wait on its signal (the student's start). */
export const newRecipe = (menu: CafeOrder = ICED_AMERICANO, door = false): MenuRecipe => ({ menu: { ...menu }, waits: { ice: { k: 'signal' }, shot: { k: 'signal' }, water: { k: 'signal' } }, door });

/** Ready menus to start from (메뉴 만들기 › 예시). */
export const MENU_PRESETS: CafeOrder[] = [
  ICED_AMERICANO,
  { name: '에스프레소', ice: 0, shots: 2, water: 0 },
  { name: '따뜻한 아메리카노', ice: 0, shots: 2, water: 200, hot: true },
  { name: '연한 아이스 아메리카노', ice: 145, shots: 1, water: 180 },
];
