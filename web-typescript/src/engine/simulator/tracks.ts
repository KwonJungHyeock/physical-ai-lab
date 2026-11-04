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
    start: { cell: 'cafe', mission: 'F1' },
    cells: ['cafe', 'draw', 'board'],
    // Pictures: made with Figma AI (image generation) for this cover — no real brand or person in them.
    intro: {
      title: ['Life Cobot', 'Simulator'],
      ko: '생활 협동로봇 시뮬레이터',
      lead: ['카페 · 행사장 · 보드게임 카페처럼 우리 곁에서 일하는 협동로봇을', '직접 움직이고 순서를 짜 보며 배워요.'],
      scenes: [
        { img: '/brand/life/cafe.webp', tag: 'ROBOT CAFE', line: '로봇 카페 · 바리스타 협동로봇' },
        { img: '/brand/life/draw.webp', tag: 'ROBOT CALLIGRAPHY', line: '행사장 캘리그라피 부스' },
        { img: '/brand/life/boardgame.webp', tag: 'BOARD GAME ROBOT', line: '보드게임 카페 · 오목 두는 로봇' },
        { img: '/brand/life/handover.webp', tag: 'COBOT', line: '사람 곁에서 함께 일하는 로봇' },
      ],
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
