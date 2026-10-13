import type { ReactNode } from 'react';

import type { Unit } from '@/engine/education/practice7';

/**
 * What a unit of 로봇 실습 7 lends the lead screens: its 3D steps, its real-robot buttons and what they
 * brought back. The 3D view itself stays where the unit put it; a lead screen marks where it should
 * appear with its `slot` prop (a ref callback: the element the view is laid over), so it is never
 * mounted twice.
 */
export interface LeadKit {
  unit: Unit;
  /** Play a 따라 하기 step in 3D; resolves once it has played. */
  doStep(id: string): Promise<void>;
  busy: boolean;
  /** Steps the 3D view has played (ever, on this PC). */
  doneSteps: readonly string[];
  /** What the unit shows under its steps (arrivals, pictures, found blocks, code). */
  extra: ReactNode;
  real: {
    online: boolean;
    busy: boolean;
    msg: string;
    /** The unit's real-robot buttons; locked: shown, not pressable (the teacher has not allowed it yet). */
    controls(locked: boolean): ReactNode;
    /** Pictures a real run brought back. */
    media: ReactNode;
    stop(): void;
    /** When the last real run was recorded (ISO); null: never. */
    doneAt: string | null;
  };
}
