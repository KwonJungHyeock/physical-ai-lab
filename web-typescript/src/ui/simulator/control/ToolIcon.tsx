/**
 * Line drawings of the end effectors (the flange at the top, the tool hanging
 * below), so a tool is recognised by its shape before its name is read.
 */

import type { EffectorId } from '@/engine/simulator/effectors';

const FLANGE = 'M14 6h20v5H14z';

const SHAPES: Record<EffectorId, string> = {
  // Adaptive gripper: body and two curved fingers.
  adaptive: `${FLANGE}M12 11h24v9H12zM16 20c-3 6-2 12 3 17M32 20c3 6 2 12-3 17M19 37l3-2M29 37l-3-2`,
  // Parallel gripper: body and two straight jaws.
  parallel: `${FLANGE}M11 11h26v8H11zM15 19v17h5V24M33 19v17h-5V24`,
  // Flexible gripper: three soft fingers.
  flexible: `${FLANGE}M13 11h22v7H13zM16 18c-2 7 0 13 4 18M24 18v19M32 18c2 7 0 13-4 18`,
  // Suction pump: body, nozzle and the cup.
  pump: `${FLANGE}M17 11h14v10H17zM22 21v7h4v-7M15 34c0-4 4-6 9-6s9 2 9 6z`,
  // Pen holder with a pen.
  pen: `${FLANGE}M15 11h18v8H15zM21 19h6v14l-3 6-3-6z`,
  // Phone holder: clamp holding a phone.
  phone: `${FLANGE}M20 11h8v6h-8zM12 17h24v4H12zM14 21h20v18H14zM22 35h4`,
  // Cylinder: a rod pressing a button.
  cylinder: `${FLANGE}M18 11h12v14H18zM22.5 25h3v8h-3zM16 38h16M19 38v-3h10v3`,
  // Nothing fitted: the bare flange, crossed out below.
  none: `${FLANGE}M18 22l12 12M30 22L18 34`,
};

export default function ToolIcon({ id, size = 34 }: { id: EffectorId; size?: number }) {
  return (
    <svg viewBox="0 0 48 42" width={size} height={(size * 42) / 48} aria-hidden="true" focusable="false">
      <path d={SHAPES[id]} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
