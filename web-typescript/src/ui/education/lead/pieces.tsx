'use client';

/** Pieces both lead screens draw: unit 4's hand-camera photo and table board, a tally of the class's picks. */

import type { CSSProperties, ReactNode } from 'react';

import { HAND_PHOTO, RED_CANDIDATES, RED_RIGHT } from '@/engine/education/lead';
import type { ColorName } from '@/engine/simulator/board';

import css from './lead.module.css';

export type PhotoBlock = (typeof HAND_PHOTO.blocks)[number];
const RED = HAND_PHOTO.blocks.find((b) => b.color === '빨강')!;

/** The hand camera's photo with marks on the blocks given; `onTap` gets the block nearest a tap (or null). */
export function HandPhoto({ marks, label = '로봇 손 카메라 사진', hint, onTap, pixel }: { marks: readonly PhotoBlock[]; label?: string; hint?: string; onTap?(b: PhotoBlock | null): void; pixel?: boolean }) {
  const tap = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!onTap) return;
    const r = e.currentTarget.getBoundingClientRect();
    const u = ((e.clientX - r.left) / r.width) * HAND_PHOTO.w;
    const v = ((e.clientY - r.top) / r.height) * HAND_PHOTO.h;
    // A block is about 60 px across in the photo: a tap within 55 px of its centre finds it.
    const near = HAND_PHOTO.blocks.map((b) => ({ b, d: Math.hypot(b.u - u, b.v - v) })).sort((a, b) => a.d - b.d)[0];
    onTap(near.d < 55 ? near.b : null);
  };
  return (
    <div className={css.photo} data-tap={onTap ? true : undefined} onClick={tap}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={HAND_PHOTO.src} alt="손 카메라가 찍은 작업판 사진" draggable={false} />
      <span className={css.photoTag}>{label}</span>
      {marks.map((b) => (
        <span key={b.color} className={css.mark} style={{ left: `${(b.u / HAND_PHOTO.w) * 100}%`, top: `${(b.v / HAND_PHOTO.h) * 100}%`, '--c': b.hex } as CSSProperties}>
          <b>
            {b.color}
            {pixel && ` (${b.u}, ${b.v}) 픽셀`}
          </b>
        </span>
      ))}
      {hint && <span className={css.tapHint}>{hint}</span>}
    </div>
  );
}

export const RED_BLOCK = RED;

/** The work board from above (x forward = up, y to the robot's left = left) with the points A · B · C. */
export function RedBoard({ pick, reveal, onPick }: { pick: string | null; reveal: boolean; onPick?(k: string): void }) {
  const W = 520;
  const H = 400;
  const px = (y: number) => W / 2 - y * 1.7;
  const py = (x: number) => H - 40 - x * 1.7;
  return (
    <div className={css.board}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label="작업판을 위에서 본 그림">
        {[0, 50, 100, 150, 200].map((x) => (
          <g key={`x${x}`}>
            <line x1={20} x2={W - 20} y1={py(x)} y2={py(x)} stroke="#e4e7ec" />
            <text x={W - 16} y={py(x) + 5} fontSize={13} fill="#98a2b3" textAnchor="end">
              x {x}
            </text>
          </g>
        ))}
        {[-100, -50, 0, 50, 100].map((y) => (
          <g key={`y${y}`}>
            <line y1={20} y2={H - 30} x1={px(y)} x2={px(y)} stroke="#e4e7ec" />
            <text y={H - 10} x={px(y)} fontSize={13} fill="#98a2b3" textAnchor="middle">
              y {y}
            </text>
          </g>
        ))}
        <rect x={px(0) - 26} y={py(0) - 8} width={52} height={34} rx={10} fill="#101828" />
        <text x={px(0)} y={py(0) + 14} fontSize={13} fill="#fff" textAnchor="middle" fontWeight={700}>
          로봇
        </text>
        {RED_CANDIDATES.map((c) => {
          const on = pick === c.key;
          const right = reveal && c.key === RED_RIGHT;
          return (
            <g key={c.key} data-cand={c.key} style={{ cursor: onPick ? 'pointer' : undefined }} onClick={() => onPick?.(c.key)}>
              <circle cx={px(c.y)} cy={py(c.x)} r={24} fill={right ? '#12a150' : on ? '#3454d1' : '#fff'} stroke={right ? '#12a150' : '#3454d1'} strokeWidth={3} />
              <text x={px(c.y)} y={py(c.x) + 7} fontSize={21} fontWeight={800} textAnchor="middle" fill={on || right ? '#fff' : '#3454d1'}>
                {c.key}
              </text>
              {right && (
                <text x={px(c.y)} y={py(c.x) + 46} fontSize={17} fontWeight={800} fill="#12a150" textAnchor="middle">
                  ({c.x}, {c.y}) mm
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/** How the class picked: one bar per option, the right one green once shown. */
export function Tally({ options, counts, right, big }: { options: readonly string[]; counts: readonly number[]; right?: number | null; big?: boolean }) {
  const total = counts.reduce((a, b) => a + b, 0);
  return (
    <div className={css.tally} data-big={big || undefined}>
      {options.map((o, i) => (
        <div key={i} className={css.tRow} data-right={right === i || undefined}>
          <span>
            <i>{'ABCDE'[i]}</i>
            {o}
          </span>
          <div className={css.tBar}>
            <i style={{ width: `${total ? (counts[i] / total) * 100 : 0}%` }} />
          </div>
          <b>{counts[i]}명</b>
        </div>
      ))}
    </div>
  );
}

/** The wrap-up's order as numbered cards. */
export function Flow({ flow }: { flow: readonly (readonly [string, string])[] }) {
  return (
    <div className={css.flow} style={{ '--n': flow.length } as CSSProperties}>
      {flow.map(([b, s], i) => (
        <div key={i}>
          <i>{i + 1}</i>
          <b>{b}</b>
          <span>{s}</span>
        </div>
      ))}
    </div>
  );
}

export function Choices({ options, picked, right, onPick, ox }: { options: readonly string[]; picked: number; right: number | null; onPick(i: number): void; ox?: boolean }) {
  return (
    <div className={css.choices} data-ox={ox || undefined}>
      {options.map((o, i) => (
        <button
          key={i}
          type="button"
          className={css.choice}
          aria-pressed={picked === i}
          data-right={(right !== null && right === i) || undefined}
          data-wrong={(right !== null && picked === i && right !== i) || undefined}
          onClick={() => onPick(i)}
        >
          {!ox && <i>{'ABCDE'[i]}</i>}
          {o}
        </button>
      ))}
    </div>
  );
}

export function Card({ title, tone, children }: { title?: string; tone?: 'ok' | 'bad' | 'robot'; children: ReactNode }) {
  return (
    <div className={css.card} data-tone={tone}>
      {title && <h4>{title}</h4>}
      {children}
    </div>
  );
}

export const blockHex = (c: ColorName | string) => HAND_PHOTO.blocks.find((b) => b.color === c)?.hex ?? '#667085';
