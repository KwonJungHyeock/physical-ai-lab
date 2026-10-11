/**
 * The lesson 3D view's tone (교육 이론 차시; the site labs have their own rooms): 'light' (the
 * default — a bright studio in the tone of the 로봇 시티 map and the white panels), 'studio' (the
 * simulator's dark slate; the lesson pictures are rendered in it) and 'mat' (a bright room with the
 * robot on a workbench cutting mat). localStorage 'learn-tone' picks another.
 */

import { SCENE } from '../../simulator/stage/sceneHelpers';

export type LearnTone = 'studio' | 'light' | 'mat';

export interface ToneColors {
  sky: string;
  desk: string;
  spot: string;
  cell: string;
  section: string;
  /** A bright tone's backdrop: the sky from the top down to the horizon, where the desk fades into it. */
  top?: string;
  horizon?: string;
}

export const TONES: Record<LearnTone, ToneColors> = {
  studio: SCENE,
  light: { sky: '#e6edf5', desk: '#e3e9f1', spot: '#fdfeff', cell: '#d3dbe6', section: '#aebbcc', top: '#f7f9fc', horizon: '#dde6f0' },
  mat: { sky: '#f1eee8', desk: '#e4dac8', spot: '#f3ede2', cell: '#78aea5', section: '#e4f2ef', top: '#f8f6f2', horizon: '#ece6dc' },
};

/** 'mat': the cutting mat under the robot, m (x along the arm's front, y across) and its colour. */
export const MAT = { w: 0.6, d: 0.44, x: 0.16, color: '#2f6f66' };

export const TONE_KEY = 'learn-tone';

export function readTone(): LearnTone {
  try {
    const v = typeof localStorage === 'undefined' ? null : localStorage.getItem(TONE_KEY);
    return v === 'studio' || v === 'mat' ? v : 'light';
  } catch {
    return 'light';
  }
}
