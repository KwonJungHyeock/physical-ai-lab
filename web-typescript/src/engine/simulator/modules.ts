/**
 * 실습 모듈: the seven acceptance checks of the proposal ("검수항목 7종"), each
 * a module the class opens with one click, plus the other practices of the
 * chosen level and environment. A module opens in the chosen level when that
 * level has it; otherwise in the level (and environment) that does — 검수 3
 * (영상 취득), for one, needs the AI Kit camera and is a block practice.
 *
 * Progress is kept in this browser (localStorage), per level and environment:
 * "sim" once the practice goal was reached in the simulator, "robot" once it
 * ran on the real robot (or its code was taken to the robot).
 */

import type { Theme } from './board';
import { LEVELS, practicesFor, type Level, type PracticeId } from './practices';

export interface CheckInfo {
  check: number;
  title: string;
  /** Wording of the proposal's check, short. */
  spec: string;
}

export const CHECKS: readonly CheckInfo[] = [
  { check: 1, title: '전 축 구동', spec: '6축 관절 전체 구동' },
  { check: 2, title: '반복 위치제어', spec: '같은 위치 반복 도달' },
  { check: 3, title: '영상 취득', spec: 'RGB 영상 취득 (카메라 2대)' },
  { check: 4, title: '비전-로봇 연계', spec: '인식한 물체를 로봇이 옮김' },
  { check: 5, title: '엔드이펙터 교체', spec: '엔드이펙터 2종 이상 교체 작동' },
  { check: 6, title: 'AI 샘플 로컬 실행', spec: '영상 처리 샘플을 로봇에서 실행' },
  { check: 7, title: 'ROS 2 · API 실행', spec: 'ROS 2 / 파이썬 API 로 실행' },
];

/**
 * How the console is used: 'learn' — classes, practices by topic, no check
 * numbers; 'check' — the one-time delivery demonstration of the seven checks.
 */
export type ConsoleMode = 'learn' | 'check';

/** Practice topics of the learning mode, in teaching order. */
export const CATEGORIES: readonly { id: string; name: string; ids: readonly PracticeId[] }[] = [
  { id: 'move', name: '기본 조작', ids: ['joints', 'repeat', 'teach'] },
  { id: 'pick', name: '집기 · 옮기기', ids: ['place', 'tools'] },
  { id: 'vision', name: '카메라 · 비전', ids: ['image', 'vision', 'ai'] },
  { id: 'tool', name: '도구 활용', ids: ['pen', 'press'] },
  { id: 'code', name: 'API · ROS 2', ids: ['api', 'topic', 'timer', 'rosrun'] },
  { id: 'free', name: '자유 실습', ids: ['free'] },
  // The ▶ 데모 program opened in 블록 코딩 (not a task of the lists).
  { id: 'demo', name: '데모', ids: ['demo'] },
];

/** Topic name of a practice (learning mode). */
export function categoryOf(id: PracticeId): string {
  return CATEGORIES.find((c) => c.ids.includes(id))?.name ?? '실습';
}

export interface Where {
  level: Level;
  theme: Theme;
  id: PracticeId;
}

/** Levels (in either environment) that have this check. */
export function levelsWithCheck(check: number): { level: Level; themes: Theme[] }[] {
  return LEVELS.flatMap(({ id: level }) => {
    const themes = (['kit', 'arm'] as Theme[]).filter((t) => practicesFor(level, t).some((p) => p.check === check));
    return themes.length ? [{ level, themes }] : [];
  });
}

/** Where a check module opens from the current level and environment. */
export function openCheck(check: number, level: Level, theme: Theme): Where | null {
  const find = (lv: Level, th: Theme) => practicesFor(lv, th).find((p) => p.check === check);
  const order: [Level, Theme][] = [
    [level, theme],
    ...LEVELS.map((l): [Level, Theme] => [l.id, theme]),
    [level, 'kit'],
    ...LEVELS.map((l): [Level, Theme] => [l.id, 'kit']),
  ];
  for (const [lv, th] of order) {
    const p = find(lv, th);
    if (p) return { level: lv, theme: th, id: p.id };
  }
  return null;
}

/* --- progress ----------------------------------------------------------------- */

export interface Mark {
  sim?: number;
  robot?: number;
}
export type Progress = Record<string, Mark>;

const KEY = 'robot-console-progress-v1';

export const markKey = (w: Where) => `${w.level}/${w.theme}/${w.id}`;

export function loadProgress(): Progress {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '{}') as unknown;
    return v && typeof v === 'object' ? (v as Progress) : {};
  } catch {
    return {};
  }
}

export function saveProgress(p: Progress): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* storage blocked: progress lasts until the page closes */
  }
}

/** Best state of a check across levels and environments: 2 robot, 1 simulator, 0 not yet. */
export function checkState(p: Progress, check: number): 0 | 1 | 2 {
  let best: 0 | 1 | 2 = 0;
  for (const { level, themes } of levelsWithCheck(check)) {
    for (const theme of themes) {
      const id = practicesFor(level, theme).find((x) => x.check === check)!.id;
      const m = p[markKey({ level, theme, id })];
      if (m?.robot) return 2;
      if (m?.sim) best = 1;
    }
  }
  return best;
}
