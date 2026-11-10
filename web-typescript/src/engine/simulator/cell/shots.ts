/**
 * 카메라 연출 for the 생활 로봇 places (입문 트랙): where the view goes, robot frame mm (z up).
 *
 *  - TOUR: opening a place, a short look round — the place as a whole, where the customer is, the
 *    equipment the robot works with, the robot — one line each (SiteTour.tsx).
 *  - STATIONS: while a program runs, the view goes to the station the tool is working at, closer and
 *    from the usual direction (Console reads the tool tip, nearest station).
 *
 * No React: the stage's lookAt takes these as they are.
 */

import type { CellId } from './cells';
import { CAFE_AT } from './cells';
import { CARD_HOME, CARD_MM } from './draw';
import { BOARD } from './board';
import { STONE_TRAY } from './cells';

export type V3 = readonly [number, number, number];

export interface Shot {
  eye: V3;
  target: V3;
}

export interface TourShot extends Shot {
  /** "SCENE 01" tag's name and the one line said there. */
  name: string;
  line: string;
}

export interface Station extends Shot {
  name: string;
  /** Where the tool works there (x, y, mm); the nearest within `r` is the one. */
  at: readonly [number, number];
  r: number;
}

/**
 * A station seen from the place's usual direction (the home view's: front right, above), closer: the
 * picture keeps its bearings as it moves from station to station, and a cup behind the arm shows
 * through it (the x-ray in DeskObjects).
 */
function near(name: string, x: number, y: number, z = 40, off: V3 = [175, -510, 630], r = 70): Station {
  return { name, at: [x, y], r, eye: [x + off[0], y + off[1], z + off[2]], target: [x, y, z] };
}

const A = CAFE_AT;
/**
 * 로봇 카페: from behind the arm, a little to the customer's side (−y), and high — looking down on the
 * machine (grown 1.3 ×) so the arm's links, coming in from the left, do not fill the front of the picture.
 */
const CAFE_OFF: V3 = [-190, -130, 780];
const CARD_MID: [number, number] = [CARD_HOME.x + CARD_MM.w / 2, CARD_HOME.y + CARD_MM.h / 2];
const BOARD_MID: [number, number] = [BOARD.x0 + ((BOARD.n - 1) * BOARD.pitch) / 2, BOARD.y0 + ((BOARD.n - 1) * BOARD.pitch) / 2];
const TRAY_MID: [number, number] = [STONE_TRAY.x + STONE_TRAY.pitch, STONE_TRAY.y + 2 * STONE_TRAY.pitch];

export const TOUR: Partial<Record<CellId, TourShot[]>> = {
  // The café has no tour: it opens on its 1단계 (주문 한 잔 따라가기, narrate.ts · narrateShot).
  draw: [
    { name: '로봇 캘리그라피', line: '행사장 부스예요. 로봇이 손님의 메시지 카드에 글씨를 써 줘요.', eye: [980, -1150, 720], target: [100, 0, 0] },
    { name: '카드와 매트', line: '손님이 카드를 매트에 놓아요. 매트 눈금이 로봇 좌표(mm)예요.', eye: [330, -270, 230], target: [210, 0, 0] },
    { name: '펜 홀더', line: '로봇이 펜 홀더로 한 획씩 써요.', eye: [170, -360, 330], target: [40, 0, 150] },
    { name: '완성 램프', line: '다 쓰면 완성 램프가 켜지고 손님이 카드를 가져가요.', eye: [460, -330, 210], target: [312, -140, 30] },
  ],
  board: [
    { name: '보드게임 로봇', line: '보드게임 카페예요. 로봇이 사람과 번갈아 오목을 둬요.', eye: [980, -1150, 720], target: [110, 0, 0] },
    { name: '오목판', line: '9 × 9 판, 줄 사이 16 mm. 가장자리 눈금이 로봇 좌표(mm)예요.', eye: [BOARD_MID[0] + 60, BOARD_MID[1] - 300, 300], target: [BOARD_MID[0], BOARD_MID[1], 0] },
    { name: '흰 돌 상자', line: '로봇은 흡착 펌프로 흰 돌을 하나씩 집어요.', eye: [TRAY_MID[0] + 160, TRAY_MID[1] - 260, 260], target: [TRAY_MID[0], TRAY_MID[1], 0] },
    { name: '차례 램프', line: '사람이 두고 손을 빼면 초록 램프: 이제 로봇 차례예요.', eye: [470, -360, 210], target: [300, -128, 20] },
  ],
};

export const STATIONS: Partial<Record<CellId, Station[]>> = {
  // The café from above and in front, steeply: over the booth's lit header, not through it.
  cafe: [near('컵 디스펜서', A.cup.x, A.cup.y, 40, CAFE_OFF), near('제빙기', A.ice.x, A.ice.y, 40, CAFE_OFF), near('커피 머신', A.coffee.x, A.coffee.y, 40, CAFE_OFF), near('정수기', A.water.x, A.water.y, 40, CAFE_OFF), near('픽업대', 98, -176, 30, CAFE_OFF)],
  // From the customer's side (−y) and above: the arm comes in from the left, the pen tip and the
  // text in sight and the right way up (from behind the arm, its links hid the card).
  draw: [{ name: '카드', at: CARD_MID, r: 110, eye: [CARD_MID[0] + 20, CARD_MID[1] - 300, 360], target: [CARD_MID[0], CARD_MID[1], 0] }],
  board: [
    // From the person's side (−y), above: the whole board, the arm coming in from the far side.
    { name: '오목판', at: BOARD_MID, r: 95, eye: [BOARD_MID[0] + 20, BOARD_MID[1] - 320, 420], target: [BOARD_MID[0], BOARD_MID[1], 0] },
    { name: '흰 돌 상자', at: TRAY_MID, r: 60, eye: [TRAY_MID[0] - 240, TRAY_MID[1], 330], target: [TRAY_MID[0], TRAY_MID[1], 0] },
  ],
};

/** The station the tool tip is working at now (nearest within its reach, low enough), or null. */
export function stationAt(cell: CellId, tip: { x: number; y: number; z: number }): Station | null {
  let best: Station | null = null;
  let bd = Infinity;
  for (const s of STATIONS[cell] ?? []) {
    const d = Math.hypot(tip.x - s.at[0], tip.y - s.at[1]);
    if (d < s.r && d < bd && tip.z < 160) {
      best = s;
      bd = d;
    }
  }
  return best;
}

/** 주문 한 잔 따라가기: where the view looks when a line is said at a place (narrate.ts) — its station, or the kiosk. */
export function narrateShot(place: string): Shot {
  // The kiosk: wide, the customer ordering and the booth they order from.
  if (place === '키오스크') return { eye: [820, -760, 620], target: [240, -150, 80] };
  return STATIONS.cafe?.find((s) => s.name === place) ?? { eye: [560, -560, 460], target: [120, -20, 110] };
}
