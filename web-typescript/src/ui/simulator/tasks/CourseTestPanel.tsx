'use client';

/**
 * A chapter's 수행평가 (장별 가이드라인 v1): the O · X 5문항 by number (the questions are in the 교안),
 * graded once on [확인] (the first answers kept), then the mission — one line, no number badges. A
 * mission whose pictures are not in yet shows its asset slots and 준비 중; the O · X still count. A
 * mission done in the scene (2장 · 3장) starts from [미션 시작] (the card steps aside); one more try is
 * allowed after a miss ([다시 하기]), and the 기록 says how it went (한 번에 · 다시 해서 · 통과 못 함). Once
 * it is over, the chapter's 상 · 중 · 하 (임시, platform.ts levelOf: a pass on the second try is a pass).
 */

import { useState } from 'react';

import { COURSE } from '@/engine/simulator/cell/course';
import { MISSION_TRIES, gradeOX, missionWay, type ChapterTest, type OX, type TestResult } from '@/engine/simulator/cell/courseTests';
import { buttonName } from '@/engine/simulator/cell/courseText';
import { levelOf } from '@/engine/simulator/cell/platform';

import PlayText from '../PlayText';
import { AssetSlot } from '../stage/CourseMarks';
import css from './courseStep.module.css';

interface Props {
  test: ChapterTest;
  result?: TestResult;
  onGraded(chosen: OX[], right: number): void;
  /** [다음 단계 →] (none: the course's end is elsewhere). */
  onNext?: () => void;
  /** A mission done in the scene: start it. */
  onMission?: () => void;
  /** 5장: the card mission judged from 5-5 (실물, the teacher's check) or 5-4 (시뮬레이션). */
  onCard?: () => void;
}

export default function CourseTestPanel({ test, result, onGraded, onNext, onMission, onCard }: Props) {
  const [chosen, setChosen] = useState<(OX | null)[]>(() => result?.chosen ?? [null, null, null, null, null]);
  const graded = result?.right != null;
  const all = chosen.every((c) => c !== null);
  return (
    <div className={css.scrim} role="dialog" aria-label={`${test.chapter}장 수행평가`}>
      <div className={css.test}>
        {/* Its number (the chapter's last) beside its name (수정 지시서 v3 파트 8-2). */}
        <h2>
          {COURSE.find((c) => c.n === test.chapter)?.test} {test.chapter}장 수행평가
        </h2>
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
            <p className={css.soon}>
              미션: <PlayText text={test.mission.text} size={15} />
            </p>
            {test.mission.card && (
              <div className={css.row} style={{ marginBottom: 18 }}>
                {result?.mission ? (
                  <output>
                    미션 통과 ({result.missionBy === 'real' ? '실물' : '시뮬레이션'}) · 상 · 중 · 하 (임시): {levelOf({ chapter: test.chapter, right: result.right ?? 0, of: 5, mission: true }).level}
                  </output>
                ) : (
                  <>
                    <output>{result?.mission === false ? `미션 아직 · ${test.mission.failText} · 5-4를 통과하거나 5-5에서 확인을 받아요` : '5-5 실물 확인이나 5-4 통과로 판정해요'}</output>
                    <button type="button" className={css.key} data-lit onClick={onCard}>
                      카드 확인
                    </button>
                  </>
                )}
              </div>
            )}
            {test.mission.ready && (test.mission.steps || test.mission.pose || test.mission.star) && (
              <div className={css.row} style={{ marginBottom: 18 }}>
                {result?.mission == null ? (
                  <>
                    <output>장면에서 해요 · 끝나면 이 카드로 돌아와요</output>
                    <button type="button" className={css.key} data-lit onClick={onMission}>
                      미션 시작
                    </button>
                  </>
                ) : !missionWay(result) ? (
                  <>
                    <output>
                      미션 아직 · {test.mission.failText ?? '다시 해 봐요'} · 다시 하기 {MISSION_TRIES - (result.missionTries ?? 1)}번 남았어요
                    </output>
                    <button type="button" className={css.key} data-lit onClick={onMission}>
                      다시 하기
                    </button>
                  </>
                ) : (
                  <output>
                    미션 {missionWay(result)} · 상 · 중 · 하 (임시): {levelOf({ chapter: test.chapter, right: result.right ?? 0, of: 5, mission: !!result.mission }).level}
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
                <p className={css.soon}>미션 사진은 준비 중이에요. 준비되면 이 자리에서 고를 수 있어요.</p>
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
