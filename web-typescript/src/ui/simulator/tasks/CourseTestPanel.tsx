'use client';

/**
 * A 수행평가 (장별 가이드라인 v1; 수정 지시서 v4 파트 1: 중간 · 마무리): the O · X 5문항 by number (the
 * questions are in the 교안), graded once on [확인] (the first answers kept), then the mission — one line,
 * no number badges. A mission done in the scene starts from [미션 시작] (the card steps aside); one more
 * try is allowed after a miss ([다시 하기]), and the 기록 says how it went (한 번에 · 다시 해서 · 통과 못 함).
 * Once it is over, its 상 · 중 · 하 (임시, platform.ts levelOf: a pass on the second try is a pass).
 * A course that has the mission only (4차시): no O · X and no 상 · 중 · 하 — the mission and whether it passed.
 * Its words: the 문구 파일's testPanel (courseText.ts panelText).
 */

import { useState } from 'react';

import { MISSION_TRIES, gradeOX, missionEnd, missionWay, type ChapterTest, type OX, type TestResult } from '@/engine/simulator/cell/courseTests';
import { buttonName, panelText, testText } from '@/engine/simulator/cell/courseText';
import { levelOf } from '@/engine/simulator/cell/platform';

import PlayText from '../PlayText';
import { AssetSlot } from '../stage/CourseMarks';
import css from './courseStep.module.css';

interface Props {
  test: ChapterTest;
  /** Its number and name as the 위치 줄 has them ('3-5', '중간 수행평가'), and '범위 1~3장'. */
  number: string;
  name: string;
  range: string;
  /** The course has its O · X (8차시); not: the mission only (4차시). */
  ox: boolean;
  /** The mission only: the 절 it is judged by ('5-3'). */
  judgedBy?: string;
  result?: TestResult;
  onGraded(chosen: OX[], right: number): void;
  /** [다음 단계 →] (none: the course's end is elsewhere). */
  onNext?: () => void;
  /** A mission done in the scene: start it. */
  onMission?: () => void;
  /** 5장: the card mission judged from 5-5 (실물, the teacher's check) or 5-4 (시뮬레이션); the mission only: from `judgedBy`. */
  onCard?: () => void;
}

export default function CourseTestPanel({ test, number, name, range, ox, judgedBy, result, onGraded, onNext, onMission, onCard }: Props) {
  const [chosen, setChosen] = useState<(OX | null)[]>(() => (result?.chosen?.length === 5 ? result.chosen : [null, null, null, null, null]));
  const graded = !ox || result?.right != null;
  const all = chosen.every((c) => c !== null);
  const level = () => panelText('level', { level: levelOf({ chapter: test.chapter, right: result?.right ?? 0, of: 5, mission: !!result?.mission }).level });
  const only = !ox && judgedBy ? testText(test.chapter).missionOnly?.replace('{sub}', judgedBy) : undefined;
  return (
    <div className={css.scrim} role="dialog" aria-label={name}>
      <div className={css.test}>
        {/* Its number (its chapter's last) beside its name (수정 지시서 v3 파트 8-2), and the chapters it covers. */}
        <h2>
          {number} {name}
          {range && <small>{range}</small>}
        </h2>
        {ox ? (
          <>
            <p>{panelText('read')}</p>
            <ol className={css.ox}>
              {test.answers.map((ans, i) => (
                <li key={i}>
                  <b>{panelText('item', { n: i + 1 })}</b>
                  {(['O', 'X'] as const).map((v) => (
                    <button key={v} type="button" aria-pressed={chosen[i] === v} disabled={graded} onClick={() => setChosen((c) => c.map((x, k) => (k === i ? v : x)))}>
                      {v}
                    </button>
                  ))}
                  <em data-ok={(graded && chosen[i] === ans) || undefined} data-no={(graded && chosen[i] !== ans) || undefined}>
                    {graded ? panelText(chosen[i] === ans ? 'right' : 'wrong') : ''}
                  </em>
                </li>
              ))}
            </ol>
          </>
        ) : (
          <p>{panelText('missionOnly')}</p>
        )}
        {!graded ? (
          <div className={css.row}>
            <output>{all ? '' : panelText('picked', { n: chosen.filter((c) => c !== null).length })}</output>
            <button type="button" className={css.key} data-lit={all || undefined} disabled={!all} onClick={() => onGraded(chosen as OX[], gradeOX(test, chosen))}>
              {panelText('confirm')}
            </button>
          </div>
        ) : (
          <>
            {ox && (
              <div className={css.row} style={{ marginBottom: 18 }}>
                <output>{panelText('score', { n: result?.right ?? 0 })}</output>
              </div>
            )}
            <p className={css.soon}>
              {panelText('mission')}: <PlayText text={only ?? test.mission.text} size={15} />
            </p>
            {test.mission.card && (
              <div className={css.row} style={{ marginBottom: 18 }}>
                {result?.mission ? (
                  <output>
                    {panelText('cardPassed', { by: panelText(result.missionBy === 'real' ? 'byReal' : 'bySim') })}
                    {ox && ` · ${level()}`}
                  </output>
                ) : (
                  <>
                    <output>
                      {only
                        ? result?.mission === false
                          ? panelText('cardNotYetOnly', { fail: test.mission.failText ?? '', sub: judgedBy ?? '' })
                          : panelText('cardHintOnly', { sub: judgedBy ?? '' })
                        : result?.mission === false
                          ? panelText('cardNotYet', { fail: test.mission.failText ?? '' })
                          : panelText('cardHint')}
                    </output>
                    <button type="button" className={css.key} data-lit onClick={onCard}>
                      {panelText('cardCheck')}
                    </button>
                  </>
                )}
              </div>
            )}
            {test.mission.ready && (test.mission.steps || test.mission.pose || test.mission.star) && (
              <div className={css.row} style={{ marginBottom: 18 }}>
                {result?.mission == null ? (
                  <>
                    <output>{panelText('sceneHint')}</output>
                    <button type="button" className={css.key} data-lit onClick={onMission}>
                      {panelText('missionStart')}
                    </button>
                  </>
                ) : !missionEnd(result) ? (
                  <>
                    <output>{panelText('again', { fail: test.mission.failText ?? panelText('againPlain'), n: MISSION_TRIES - (result.missionTries ?? 1) })}</output>
                    <button type="button" className={css.key} data-lit onClick={onMission}>
                      {panelText('retry')}
                    </button>
                  </>
                ) : (
                  <output>
                    {panelText('missionEnd', { way: missionWay(result) ?? '' })}
                    {ox && ` · ${level()}`}
                  </output>
                )}
              </div>
            )}
            {!test.mission.ready && (
              <>
                <div className={css.photos}>
                  {Array.from({ length: 6 }, (_, k) => (
                    <AssetSlot key={k} slot={{ id: `test${test.chapter}-photo${k + 1}`, label: `사진 ${k + 1}`, at: [0, 0, 0], w: 220, h: 140 }} />
                  ))}
                </div>
                <p className={css.soon}>{panelText('photosSoon')}</p>
              </>
            )}
            {onNext && (
              <div className={css.row}>
                <output />
                <button type="button" className={css.key} data-lit onClick={onNext}>
                  {buttonName('next')}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
