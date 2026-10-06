/**
 * Values that change many times a second — the arm's joint angles (simulated
 * or read from the robot) and the robot's latest state. They live outside
 * React state so a change redraws only the readouts that show them (status,
 * jog panel, zero tool), not the whole console with its editor and 3D view.
 */

import { useSyncExternalStore } from 'react';

import type { RobotState } from '@/engine/simulator/robotLink';

export interface LiveValues {
  /** Joint angles shown by the controls: the simulated arm, or the real one in robot mode. */
  angles: readonly number[];
  /** The robot's latest state (robot mode), refreshed on every poll. */
  robot: RobotState | null;
}

export interface Live {
  get(): LiveValues;
  getAngles(): number[];
  setAngles(angles: readonly number[]): void;
  setRobot(robot: RobotState | null): void;
  subscribe(listener: () => void): () => void;
}

export function createLive(angles: readonly number[]): Live {
  let values: LiveValues = { angles: angles.slice(), robot: null };
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((l) => l());
  return {
    get: () => values,
    getAngles: () => values.angles.slice(),
    setAngles(a) {
      const same = a.length === values.angles.length && a.every((v, i) => Math.abs(v - values.angles[i]) < 0.005);
      if (same) return;
      values = { ...values, angles: a.slice() };
      emit();
    },
    setRobot(robot) {
      values = { ...values, robot };
      emit();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** Read one live value in a component; it re-renders only when that value changes. */
export function useLive<T>(live: Live, select: (v: LiveValues) => T): T {
  return useSyncExternalStore(
    live.subscribe,
    () => select(live.get()),
    () => select(live.get()),
  );
}
