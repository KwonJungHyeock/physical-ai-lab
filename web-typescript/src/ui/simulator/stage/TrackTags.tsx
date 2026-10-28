'use client';

/**
 * Tracking tags on the arm: when a joint needs a look (a warning — load, limit near, touching — or
 * the joint being zero-calibrated), a corner bracket sits on it and a thin leader line runs to a
 * two-line label, as an instrument display marks what it tracks. The tag rides on the joint (it is
 * placed in the joint's own frame), so it follows the arm without redrawing the page.
 */

import { Html } from '@react-three/drei';
import { createPortal } from '@react-three/fiber';
import { Fragment } from 'react';
import type { Group } from 'three';

import css from './track.module.css';

export interface TrackTag {
  /** 1-based joint. */
  joint: number;
  /** 1 caution, 2 danger, 3 focus (zero calibration). */
  level: 1 | 2 | 3;
  title: string;
  detail: string;
}

/** At most this many tags at once, the most severe first: more would cover the arm. */
export const MAX_TAGS = 2;

export default function TrackTags({ tags, joints }: { tags: readonly TrackTag[]; joints: readonly { group: Group }[] }) {
  return (
    <>
      {tags.map((t) => {
        const g = joints[t.joint - 1]?.group;
        if (!g) return null;
        return (
          <Fragment key={t.joint}>
            {createPortal(
              <Html zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
                <div className={css.tag} data-level={t.level}>
                  <span className={css.bracket} />
                  <svg className={css.lead} width="64" height="44" viewBox="0 0 64 44" aria-hidden="true">
                    <polyline points="0,44 24,8 64,8" />
                  </svg>
                  <div className={css.label}>
                    <b>{t.title}</b>
                    <small>{t.detail}</small>
                  </div>
                </div>
              </Html>,
              g,
            )}
          </Fragment>
        );
      })}
    </>
  );
}
