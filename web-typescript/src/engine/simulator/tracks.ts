/**
 * 트랙: the simulator sold in three parts (docs: 시뮬레이터 상품 라인업), each the same console with
 * only its menus, coding languages and 현장 open. /console is the full package (no track).
 *   ① 생활 로봇 (입문, /track/life): blocks only — order and places, results you can see.
 *   ② 식품 · 물류 현장 (중급, /track/food): blocks → Python, sensors and the camera.
 *   ③ 스마트 팩토리 · 협동로봇 (고급, /track/factory): Python · ROS 2, lines and people.
 * No React here: Console reads it.
 */

import type { Level } from './practices';
import type { CellId } from './cell/cells';
import { DEFAULT_PLAN } from './cell/courses';

export type TrackId = 'life' | 'food' | 'factory';

export interface Track {
  id: TrackId;
  /** ① 생활 로봇 */
  name: string;
  /** 입문 · 중급 · 고급 */
  grade: string;
  /** The badge colour in the top bar. */
  color: string;
  /** Coding languages open (the first one is where it starts). */
  levels: readonly Level[];
  /** Menu bar items open (Console's work and view item ids). */
  menu: readonly string[];
  /** Top bar screens open (교육 · 시뮬레이터 · 라이브러리 · 자료실 ids). */
  screens: readonly string[];
  /** The 현장 it opens on: a 실습 셀 and its first step. */
  start?: { cell: string; mission: string };
  /** The 현장 (실습 셀) it sells, in the 환경 menu; all when left out. */
  cells?: readonly CellId[];
  /** Its own intro (the product's cover): title, lines, and the pictures that take turns (public/). */
  intro?: TrackIntro;
}

export interface TrackIntro {
  title: [string, string];
  ko: string;
  lead: [string, string];
  scenes: { img: string; tag: string; line: string }[];
}

export const TRACKS: Record<TrackId, Track> = {
  life: {
    id: 'life',
    name: '① 생활 로봇',
    grade: '입문',
    color: '#0f6b4c',
    levels: ['basic'],
    // 테마학습 (실생활 협동로봇 · 튜토리얼) instead of 공정 · 환경 · 손 (Console's lifeGroups).
    menu: ['jog', 'parts', 'pose', 'theme', 'code', 'objects', 'monitor'],
    screens: ['sim'],
    // 1단계 12차시 (course.ts, 보고 #49): 로봇 글씨 쓰기 현장만. 카페 · 보드게임은 입문에서 숨김(코드는 그대로).
    start: { cell: 'draw', mission: 'G1' },
    cells: ['draw'],
    // Pictures: made with Figma AI (image generation) for this cover — no real brand or person in them.
    intro: {
      title: ['Life Cobot', 'Simulator'],
      ko: 'myCobot 280 협동로봇 1단계',
      lead: ['관절 · 좌표 조작부터 로봇 글씨 쓰기까지,', `${DEFAULT_PLAN.lessons.length}차시 동안 시뮬레이션으로 익히고 실물로 써 봐요.`],
      // One picture of every place the track teaches (the three booths side by side).
      scenes: [{ img: '/brand/life/sites.webp', tag: 'LIFE COBOT SITES', line: '로봇 카페 · 글씨 쓰기 부스 · 보드게임 카페' }],
    },
  },
  food: {
    id: 'food',
    name: '② 식품 · 물류 현장',
    grade: '중급',
    color: '#1d4ed8',
    levels: ['basic', 'python'],
    menu: ['jog', 'parts', 'pose', 'process', 'code', 'env', 'objects', 'camera', 'monitor'],
    screens: ['sim'],
  },
  factory: {
    id: 'factory',
    name: '③ 스마트 팩토리 · 협동로봇',
    grade: '고급',
    color: '#18201d',
    levels: ['python', 'ros'],
    menu: ['jog', 'parts', 'pose', 'process', 'code', 'env', 'objects', 'camera', 'monitor'],
    screens: ['sim'],
  },
};

/** The level to open: the one asked for when the track has it, else the track's first. */
export function trackLevel(track: Track | null, wanted: Level): Level {
  return !track || track.levels.includes(wanted) ? wanted : track.levels[0];
}
