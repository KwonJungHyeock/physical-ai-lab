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
const CARD_MID: [number, number] = [CARD_HOME.x + CARD_MM.w / 2, CARD_HOME.y + CARD_MM.h / 2];

export const TOUR: Partial<Record<CellId, TourShot[]>> = {
  cafe: [
    { name: '로봇 카페', line: '쇼핑몰 안의 무인 카페 부스예요. 협동로봇 바리스타 한 대가 일해요.', eye: [760, -980, 560], target: [120, -20, 110] },
    { name: '주문', line: '손님이 키오스크에서 주문하면 로봇이 만들기 시작해요.', eye: [760, -140, 360], target: [372, -232, 120] },
    { name: '장비', line: '컵 디스펜서 → 제빙기 → 커피 머신 → 정수기 순서로 돌아요.', eye: [-280, -320, 640], target: [200, 40, 60] },
    { name: '픽업', line: '다 만든 음료는 픽업대로. 문이 열리면 손님이 가져가요.', eye: [470, -640, 380], target: [98, -180, 40] },
    { name: '로봇 팔', line: '로봇 팔은 6개 관절로 컵을 옮겨요.', eye: [560, -560, 460], target: [0, 0, 120] },
  ],
  draw: [
    { name: '로봇 캘리그라피', line: '행사장 부스예요. 로봇이 손님의 메시지 카드에 글씨를 써 줘요.', eye: [980, -1150, 720], target: [100, 0, 0] },
    { name: '카드와 매트', line: '손님이 카드를 매트에 놓아요. 매트 눈금이 로봇 좌표(mm)예요.', eye: [330, -270, 230], target: [210, 0, 0] },
    { name: '펜 홀더', line: '로봇이 펜 홀더로 한 획씩 써요.', eye: [170, -360, 330], target: [40, 0, 150] },
    { name: '완성 램프', line: '다 쓰면 완성 램프가 켜지고 손님이 카드를 가져가요.', eye: [460, -330, 210], target: [312, -140, 30] },
  ],
};

export const STATIONS: Partial<Record<CellId, Station[]>> = {
  cafe: [near('컵 디스펜서', A.cup.x, A.cup.y), near('제빙기', A.ice.x, A.ice.y), near('커피 머신', A.coffee.x, A.coffee.y), near('정수기', A.water.x, A.water.y), near('픽업대', 98, -176, 30)],
  draw: [{ name: '카드', at: CARD_MID, r: 110, eye: [CARD_MID[0] + 40, CARD_MID[1] - 330, 340], target: [CARD_MID[0], CARD_MID[1], 0] }],
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
