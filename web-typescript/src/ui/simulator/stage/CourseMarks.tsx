'use client';

/**
 * 입문 과정 절 (장별 가이드라인 v1) in the 3D view:
 *  - 1-2: a press spot on each joint of the arm (and the tool tip), riding on the joint: the ones
 *    found keep their name tag; a wrong press shows that part's name a moment.
 *  - Asset slots placed in the scene (robot mm): the asset's picture when its file is in
 *    /course/assets/, else a dashed 준비 중 box with the slot's name — the visual itself (a hand, the
 *    작업 범위 circle …) is never drawn in code.
 */

import { Html } from '@react-three/drei';
import { createPortal } from '@react-three/fiber';
import { Fragment, useState } from 'react';
import type { Group } from 'three';

import { m } from './cell/kit';
import css from './courseMarks.module.css';

export interface CourseSlot {
  /** The asset's file name in /course/assets/ (without the extension; a .png is looked for). */
  id: string;
  /** What it is, on the placeholder. */
  label: string;
  /** Where, robot frame mm. */
  at: readonly [number, number, number];
  w: number;
  h: number;
}

export interface CoursePick {
  names: readonly string[];
  /** Parts found (0-based: 0..5 the joints, 6 the tool tip). */
  found: readonly number[];
  /** A part's name shown a moment (a wrong press). */
  flash: number | null;
  onPick(part: number): void;
}

export interface CourseStageMarks {
  pick?: CoursePick | null;
  slots?: readonly CourseSlot[];
}

/** 1-2: 베이스 (J1)'s spot sits down on the turning base, apart from 어깨 (J2) just above it (its frame, m). */
const J1_SPOT: [number, number, number] = [0, 0, -0.06];

export function AssetSlot({ slot }: { slot: CourseSlot }) {
  const [missing, setMissing] = useState(false);
  return (
    <div className={css.slot} style={{ width: slot.w, height: slot.h }} data-missing={missing || undefined}>
      {!missing && (
        // eslint-disable-next-line @next/next/no-img-element -- an asset slot: the team's picture, also in the static export
        <img src={`/course/assets/${slot.id}.png`} alt={slot.label} onError={() => setMissing(true)} />
      )}
      {missing && (
        <span>
          에셋 슬롯 · {slot.label}
          <small>{slot.id}.png 준비 중</small>
        </span>
      )}
    </div>
  );
}

export default function CourseMarks({ marks, joints, flange, tcpMm }: { marks: CourseStageMarks; joints: readonly { group: Group }[]; flange: Group; tcpMm: number }) {
  const pick = marks.pick;
  return (
    <>
      {marks.slots?.map((s) => (
        <group key={s.id} position={[m(s.at[0]), m(s.at[1]), m(s.at[2])]}>
          <Html center zIndexRange={[18, 0]} style={{ pointerEvents: 'none' }}>
            <AssetSlot slot={s} />
          </Html>
        </group>
      ))}
      {pick &&
        pick.names.map((name, i) => {
          const parent = i < 6 ? joints[i]?.group : flange;
          if (!parent) return null;
          const shown = pick.found.includes(i) || pick.flash === i;
          return (
            <Fragment key={i}>
              {createPortal(
                <group position={i === 0 ? J1_SPOT : i < 6 ? [0, 0, 0] : [0, 0, tcpMm / 1000]}>
                  <Html center zIndexRange={[22, 0]}>
                    <button type="button" className={css.spot} data-found={pick.found.includes(i) || undefined} aria-label={name} onClick={() => pick.onPick(i)}>
                      {shown && <b data-wrong={(!pick.found.includes(i) && pick.flash === i) || undefined}>{name}</b>}
                    </button>
                  </Html>
                </group>,
                parent,
              )}
            </Fragment>
          );
        })}
    </>
  );
}
