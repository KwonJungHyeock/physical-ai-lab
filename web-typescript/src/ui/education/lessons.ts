/** What the 교육 tab's topic panels are given (topics/types.ts adds the step and results). */

import type { ChainSegment } from '@/engine/robot/kinematics';
import type { RobotAction } from '@/engine/simulator/sim';
import type { PostResult } from '@/engine/simulator/robotLink';
import type { WorkspaceProfile } from '@/engine/physics/workspace';

import type { LearnScene } from './stage/LearnStage';

/** The real arm, when the console runs on the robot. */
export interface RealArm {
  online: boolean;
  /** Measured angles (null when not reading). */
  angles: number[] | null;
  move(angles: number[], speed: number): Promise<PostResult>;
  run(actions: RobotAction[]): Promise<PostResult>;
}

export type Mm = [number, number, number];

export interface UnitProps {
  chain: readonly ChainSegment[];
  /** Replace what the 3D view shows. */
  show(scene: LearnScene): void;
  /** Receive clicks on the table (null: none). */
  onPick(fn: ((mm: Mm) => void) | null): void;
  real: RealArm;
  workspace: WorkspaceProfile | null;
  /** Where the arm points at J1 = 0, degrees about z. */
  frontDeg: number;
  /** Mission progress, kept per browser. */
  missions: Record<string, boolean>;
  complete(key: string): void;
}

export const HOME_POSE = [0.61, 45.87, -92.37, -41.3, 2.02, 9.58];
