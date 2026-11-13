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
  /**
   * 입문 과정의 표지 (수정 지시서 v4 파트 5): the course's name in Korean (no English title), its tags
   * (입문 과정 · N차시 · 시뮬레이션 + 실물: the 차시 and the last one from the 구성), one line of what comes in
   * what order, and the picture — an asset slot (/course/assets/<art>.png; until its file comes: the first of `scenes`).
   */
  cover?: {
    name: [string, string];
    sub: string;
    kind: string;
    /** With the real robot's 절 (5-5) in the 구성, and without it. */
    modes: { real: string; sim: string };
    /** The second line where the 구성 has 5-4 (내 글자), and where it does not. */
    lead: [string, string];
    leadPlain: string;
    flow: string[];
    art: string;
  };
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
      cover: {
        name: ['myCobot 280', '협동로봇 1단계'],
        sub: '기초 조작과 로봇 글씨 쓰기',
        kind: '입문 과정',
        modes: { real: '시뮬레이션 + 실물', sim: '시뮬레이션' },
        lead: ['관절과 좌표로 로봇팔을 움직이고,', '마지막에는 내 글자를 카드에 써 봅니다'],
        leadPlain: '마지막에는 카드에 글씨를 써 봅니다',
        flow: ['관절 조작', '좌표 이동', '도형 그리기', '글씨 쓰기'],
        art: 'intro-life-1',
      },
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
