'use client';

/**
 * A chapter's 수행평가 (장별 가이드라인 v1): the O · X 5문항 by number (the questions are in the 교안),
 * graded once on [확인] (the first answers kept), then the mission — one line, no number badges. A
 * mission whose pictures are not in yet shows its asset slots and 준비 중; the O · X still count.
 */

import { useState } from 'react';

import { gradeOX, type ChapterTest, type OX, type TestResult } from '@/engine/simulator/cell/courseTests';

import { AssetSlot } from '../stage/CourseMarks';
import css from './courseStep.module.css';

interface Props {
  test: ChapterTest;
  result?: TestResult;
  onGraded(chosen: OX[], right: number): void;
  /** [다음 단계 →] (none: the course's end is elsewhere). */
  onNext?: () => void;
}

export default function CourseTestPanel({ test, result, onGraded, onNext }: Props) {
  const [chosen, setChosen] = useState<(OX | null)[]>(() => result?.chosen ?? [null, null, null, null, null]);
  const graded = result?.right != null;
  const all = chosen.every((c) => c !== null);
  return (
    <div className={css.scrim} role="dialog" aria-label={`${test.chapter}장 수행평가`}>
      <div className={css.test}>
        <h2>{test.chapter}장 수행평가</h2>
        <p>교안의 문제를 읽고 번호마다 O 또는 X를 눌러요.</p>
        <ol className={css.ox}>
          {test.answers.map((ans, i) => (
            <li key={i}>
              <b>{i + 1}번</b>
              {(['O', 'X'] as const).map((v) => (
                <button key={v} type="button" aria-pressed={chosen[i] === v} disabled={graded} onClick={() => setChosen((c) => c.map((x, k) => (k === i ? v : x)))}>
                  {v}
                </button>
              ))}
              <em data-ok={(graded && chosen[i] === ans) || undefined} data-no={(graded && chosen[i] !== ans) || undefined}>
                {graded ? (chosen[i] === ans ? '맞음' : '틀림') : ''}
              </em>
            </li>
          ))}
        </ol>
        {!graded ? (
          <div className={css.row}>
            <output>{all ? '' : `${chosen.filter((c) => c !== null).length} / 5 골랐어요`}</output>
            <button type="button" className={css.key} data-lit={all || undefined} disabled={!all} onClick={() => onGraded(chosen as OX[], gradeOX(test, chosen))}>
              확인
            </button>
          </div>
        ) : (
          <>
            <div className={css.row} style={{ marginBottom: 18 }}>
              <output>O · X 5문항 중 {result?.right}개 맞혔어요</output>
            </div>
            <p className={css.soon}>미션: {test.mission.text}</p>
            {!test.mission.ready && (
              <>
                <div className={css.photos}>
                  {Array.from({ length: 6 }, (_, k) => (
                    <AssetSlot key={k} slot={{ id: `test${test.chapter}-photo${k + 1}`, label: `사진 ${k + 1}`, at: [0, 0, 0], w: 220, h: 140 }} />
                  ))}
                </div>
                <p className={css.soon}>미션 사진은 준비 중이에요. 준비되면 이 자리에서 고를 수 있어요.</p>
              </>
            )}
            {onNext && (
              <div className={css.row}>
                <output />
                <button type="button" className={css.key} data-lit onClick={onNext}>
                  다음 단계 →
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
