/**
 * The lesson 3D view's tone (교육 이론 차시; the site labs have their own rooms). Trial looks for
 * choosing one: 'studio' (the simulator's dark slate, the default), 'light' (a bright studio in the
 * tone of the 로봇 시티 map) and 'mat' (a bright room with the robot on a workbench cutting mat).
 * Picked with localStorage 'learn-tone' for now.
 */

import { SCENE } from '../../simulator/stage/sceneHelpers';

export type LearnTone = 'studio' | 'light' | 'mat';

export interface ToneColors {
  sky: string;
  desk: string;
  spot: string;
  cell: string;
  section: string;
}

export const TONES: Record<LearnTone, ToneColors> = {
  studio: SCENE,
  light: { sky: '#e9eef4', desk: '#e4e9f0', spot: '#fbfcfe', cell: '#cfd7e2', section: '#a9b5c6' },
  mat: { sky: '#f1eee8', desk: '#e4dac8', spot: '#f3ede2', cell: '#78aea5', section: '#e4f2ef' },
};

/** 'mat': the cutting mat under the robot, m (x along the arm's front, y across) and its colour. */
export const MAT = { w: 0.6, d: 0.44, x: 0.16, color: '#2f6f66' };

export const TONE_KEY = 'learn-tone';

export function readTone(): LearnTone {
  try {
    const v = typeof localStorage === 'undefined' ? null : localStorage.getItem(TONE_KEY);
    return v === 'light' || v === 'mat' ? v : 'studio';
  } catch {
    return 'studio';
  }
}
