/**
 * One picture per task (24 × 24 line drawings, currentColor), so a task card
 * says what it is about before its title is read.
 */

import type { PracticeId } from '@/engine/simulator/practices';

const PATHS: Record<string, string> = {
  // an arm with a turn arrow: move every joint
  joints:
    'M4 21h9M6 21v-2.5h5V21M8.5 18.5V12l5.5-4.5M8.5 12m-1.7 0a1.7 1.7 0 1 0 3.4 0a1.7 1.7 0 1 0-3.4 0M14 7.5m-1.5 0a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0M16.5 3.3a6 6 0 0 1 4 5.2M20.5 8.5l.6-2.7M20.5 8.5l-2.7-.8',
  // a target reached again and again
  repeat: 'M11 13m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0M11 13m-7.5 0a7.5 7.5 0 1 0 15 0a7.5 7.5 0 1 0-15 0M11 13l9-9M20 4h-3.5M20 4v3.5',
  // a hand: drag teaching
  teach:
    'M8 13V6.5a1.5 1.5 0 0 1 3 0V12M11 11V5a1.5 1.5 0 0 1 3 0v6M14 11V6.5a1.5 1.5 0 0 1 3 0V14a6 6 0 0 1-6 6h-1a5 5 0 0 1-4.3-2.4L4 14.5a1.5 1.5 0 0 1 2.5-1.6L8 15',
  // a block carried over into a box
  place: 'M3 13h6v6H3zM14 15h7v5h-7zM6 10C6.5 5 15 3.5 18 11.5M18 11.5l-3-.4M18 11.5l.9-2.9',
  // a gripper and the swap arrows
  tools: 'M4 4h7M7.5 4v4M4 8h7M4 8v5l1.8 2.5M11 8v5l-1.8 2.5M14.5 8h6.5l-2.2-2.2M21 16h-6.5l2.2 2.2',
  // a camera
  image: 'M3.5 8h3l2-2.5h7L17.5 8h3v11h-17zM12 10.5a3.2 3.2 0 1 0 0 6.4a3.2 3.2 0 1 0 0-6.4',
  // an eye on a block
  vision: 'M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12zM9.8 9.8h4.4v4.4H9.8z',
  // a chip with AI on it
  ai: 'M6.5 6.5h11v11h-11zM9 15l1.6-6 1.6 6M9.5 13.3h2.3M14.8 9v6M9 3v3.5M15 3v3.5M9 17.5V21M15 17.5V21M3 9h3.5M3 15h3.5M17.5 9H21M17.5 15H21',
  // a pen drawing a line
  pen: 'M5 19l1-4L16.5 4.5a2.1 2.1 0 0 1 3 3L9 18zM14.5 6.5l3 3M3 21h18',
  // a cylinder pressing a block
  press: 'M8.5 2.5h7v6h-7zM12 8.5v5M9.5 11l2.5 2.5 2.5-2.5M5 16h14v5H5z',
  // code
  api: 'M8 7l-5 5 5 5M16 7l5 5-5 5M14 4.5l-4 15',
  // nodes and topics
  topic: 'M5 12m-2.2 0a2.2 2.2 0 1 0 4.4 0a2.2 2.2 0 1 0-4.4 0M19 5.5m-2.2 0a2.2 2.2 0 1 0 4.4 0a2.2 2.2 0 1 0-4.4 0M19 18.5m-2.2 0a2.2 2.2 0 1 0 4.4 0a2.2 2.2 0 1 0-4.4 0M7 11l9.9-4.5M7 13l9.9 4.5',
  // a clock
  timer: 'M12 13.5m-7.5 0a7.5 7.5 0 1 0 15 0a7.5 7.5 0 1 0-15 0M12 13.5V9.5M12 13.5l2.8 2M9.5 2.5h5M12 2.5v3.5',
  // a terminal
  rosrun: 'M3 4.5h18v15H3zM7 10l3 2.2L7 14.4M12.5 15h4.5',
  // a play button: the 실습 환경 demo
  demo: 'M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0-18 0M10 8.5v7l6-3.5z',
  // sparkles: free practice
  free: 'M11 3l1.9 5.4L18.3 10.3l-5.4 1.9L11 17.6l-1.9-5.4L3.7 10.3l5.4-1.9zM18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z',
};

/** The acceptance checks drawn like the task each one is. */
export const CHECK_ICON: Record<number, string> = { 1: 'joints', 2: 'repeat', 3: 'image', 4: 'vision', 5: 'tools', 6: 'ai', 7: 'api' };

export default function TaskIcon({ id, size = 24, className }: { id: PracticeId | string; size?: number; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false">
      <path d={PATHS[id] ?? PATHS.free} fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
