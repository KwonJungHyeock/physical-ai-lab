/**
 * The six joints named by what they do, so a beginner can tell the three wrist joints apart (the J
 * numbers stay beside the names, since programs use them), and a small side-view drawing of the arm
 * in which only what the joint moves is coloured.
 */

import { activeArm } from '@/engine/robot/arms';

export const JOINTS: readonly { name: string; what: string }[] = [
  { name: '베이스', what: '몸통 좌우 돌리기' },
  { name: '어깨', what: '팔 앞뒤로 숙이기' },
  { name: '팔꿈치', what: '팔 굽히기 · 펴기' },
  { name: '손목 꺾기', what: '손목 위아래' },
  { name: '손목 돌리기', what: '손목 좌우' },
  { name: '손끝 돌리기', what: '도구 돌리기' },
];

/** The open arm's joints: its own names (a 4-axis arm has four), or the six above. */
export const jointLabels = (): readonly { name: string; what: string }[] => activeArm().jointNames ?? JOINTS;

const ACCENT = '#2f5bea';
const IDLE = '#b3bac7';
/** Base, shoulder, elbow, wrist, tool tip of the drawing (44 × 44 box). */
const P: readonly (readonly [number, number])[] = [
  [10, 38],
  [10, 26],
  [24, 14],
  [33, 22],
  [33, 30],
];
/** Joint i moves the links from this one on (base = link 0, …, hand = link 3). */
const FIRST_MOVED = [0, 1, 2, 3, 3, 3];

export function JointGlyph({ joint, size = 26, active = true }: { joint: number; size?: number; active?: boolean }) {
  const lit = active ? FIRST_MOVED[joint] : 9;
  const pivot: readonly [number, number] = joint === 0 ? [10, 33] : joint === 4 ? [33, 25] : joint === 5 ? [33, 33] : P[joint];
  const spin = joint === 0 || joint === 4 || joint === 5;
  const [x, y] = pivot;
  const r = 6.5;
  const c = active ? ACCENT : '#98a2b3';
  return (
    <svg width={size} height={size} viewBox="0 0 44 44" aria-hidden="true">
      <line x1="3" y1="40" x2="41" y2="40" stroke="#cdd3de" strokeWidth="1.4" />
      <rect x="5" y="36" width="10" height="4" rx="1" fill="#cdd3de" />
      {P.slice(0, -1).map((a, k) => {
        const b = P[k + 1];
        return <line key={k} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={k >= lit ? ACCENT : IDLE} strokeWidth="3.2" strokeLinecap="round" />;
      })}
      {P.slice(1, 4).map(([px, py], k) => (
        <circle key={k} cx={px} cy={py} r="2.1" fill="#fff" stroke="#8d96a8" strokeWidth="1.1" />
      ))}
      {spin ? (
        <ellipse cx={x} cy={y} rx="6.5" ry="2.4" fill="none" stroke={c} strokeWidth="1.7" />
      ) : (
        <>
          <path d={`M${x - r} ${y} A${r} ${r} 0 0 1 ${x} ${y - r}`} fill="none" stroke={c} strokeWidth="1.7" />
          <path d={`M${x - 1.2} ${y - r - 2.4} L${x + 2} ${y - r} L${x - 1.2} ${y - r + 2.4}z`} fill={c} />
          <circle cx={x} cy={y} r="2.8" fill={c} />
        </>
      )}
    </svg>
  );
}

/** Turn arrows for the jog keys: counter-clockwise for −, clockwise for +. */
export function TurnIcon({ dir, size = 16 }: { dir: -1 | 1; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" style={dir > 0 ? { transform: 'scaleX(-1)' } : undefined}>
      <path d="M19 12a7 7 0 1 1-2.05-4.95" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" />
      <path d="M17 3v5h-5" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
