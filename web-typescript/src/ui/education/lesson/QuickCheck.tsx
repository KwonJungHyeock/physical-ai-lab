'use client';

/**
 * A round of the topic's questions, graded on the spot (the same questions as
 * the printed sheets): three OX and two four-choice, a different set each
 * round. 고등 draws from 기본·응용, 대학 from every level.
 */

import { useMemo, useState, type ReactNode } from 'react';

import { events, lessonObject, quizObject } from '@/engine/account';
import type { TopicId } from '@/engine/education/catalog';
import { questionsOf, type Question } from '@/engine/education/questions';
import { recordAnswer } from '@/engine/education/wrong';

import type { StudyLevel } from '@/engine/education/roadmap';
import { useAccount } from '../../account/AccountProvider';
import { Rich } from './Rich';
import css from '../learn.module.css';

const LEVEL_NAME = { 1: '기본', 2: '응용', 3: '대학' } as const;
const CIRCLED = ['①', '②', '③', '④'];

/** The answer as a button index (OX: O = 0, X = 1). */
export const answerOf = (q: Question) => (q.kind === 'ox' ? (q.answer ? 0 : 1) : q.answer);

/**
 * One question: the level tag and text, the O X or ①–④ buttons, and once
 * `picked` is set the right answer and why. Used by the 평가 round and by the
 * learn home's 틀린 문제 다시 풀기.
 */
export function QuestionItem({ q, picked, onPick }: { q: Question; picked: number | undefined; onPick(v: number): void }) {
  const done = picked !== undefined;
  const ok = done && picked === answerOf(q);
  const labels: ReactNode[] =
    q.kind === 'ox'
      ? ['O', 'X']
      : q.choices.map((c, i) => (
          <>
            {CIRCLED[i]} <Rich text={c} inert />
          </>
        ));
  return (
    <>
      <p>
        <em className={css.quizLevel} data-level={q.level}>
          {LEVEL_NAME[q.level]}
        </em>{' '}
        <Rich text={q.q} />
      </p>
      <span className={q.kind === 'ox' ? css.oxBtns : css.mcBtns}>
        {labels.map((label, i) => (
          <button key={i} type="button" disabled={done} data-picked={done && picked === i ? true : undefined} data-answer={done && answerOf(q) === i ? true : undefined} onClick={() => onPick(i)}>
            {label}
          </button>
        ))}
      </span>
      {done && (
        <small className={css.quizWhy}>
          {ok ? '맞아요. ' : `정답은 ${q.kind === 'ox' ? (q.answer ? 'O' : 'X') : CIRCLED[q.answer]}. `}
          <Rich text={q.why} />
        </small>
      )}
    </>
  );
}

/** n items of `list` starting at window `round` (wrapping). */
const take = <T,>(list: readonly T[], n: number, round: number) => Array.from({ length: Math.min(n, list.length) }, (_, i) => list[(round * n + i) % list.length]);

export function QuickCheck({ topic, level = 'hs', onAllRight }: { topic: TopicId; level?: StudyLevel; onAllRight?: () => void }) {
  const [round, setRound] = useState(0);
  const items = useMemo(() => {
    const qs = questionsOf(topic).filter((q) => level === 'uni' || q.level <= 2);
    return [...take(qs.filter((q) => q.kind === 'ox'), 3, round), ...take(qs.filter((q) => q.kind === 'mc'), 2, round)];
  }, [topic, level, round]);
  const [picked, setPicked] = useState<Record<string, number>>({});
  const { track } = useAccount();
  if (!items.length) return <p className={css.note}>이 주제의 문항이 아직 없어요.</p>;
  const answered = items.filter((q) => q.id in picked).length;
  const right = items.filter((q) => picked[q.id] === answerOf(q)).length;
  const pick = (q: Question, v: number) => {
    if (q.id in picked) return;
    const next = { ...picked, [q.id]: v };
    recordAnswer(q.id, v === answerOf(q));
    setPicked(next);
    // Class mode (students): the answer (the choice's number), and the round's score once all are answered.
    track(() => events.answered(quizObject(topic, q.id), q.kind === 'ox' ? (v === 0 ? 'O' : 'X') : String(v + 1), v === answerOf(q)));
    if (items.every((x) => x.id in next)) {
      const right = items.filter((x) => next[x.id] === answerOf(x)).length;
      track(() => events.scored(lessonObject(topic, 'check'), right, items.length, right === items.length));
    }
    if (items.every((x) => x.id in next && next[x.id] === answerOf(x))) onAllRight?.();
  };
  return (
    <section className={css.card}>
      <h3>
        확인 문제 <small className={css.cardSub}>OX 3 · 객관식 2 · {level === 'uni' ? '대학 포함' : '고등'}</small>
      </h3>
      <ol className={css.quiz}>
        {items.map((q) => {
          const done = q.id in picked;
          const ok = done && picked[q.id] === answerOf(q);
          return (
            <li key={q.id} data-state={done ? (ok ? 'ok' : 'bad') : undefined}>
              <QuestionItem q={q} picked={picked[q.id]} onPick={(v) => pick(q, v)} />
            </li>
          );
        })}
      </ol>
      {answered === items.length && (
        <div className={css.btnRow}>
          <span className={css.note}>
            {right} / {items.length} 맞음
          </span>
          <button
            type="button"
            onClick={() => {
              setPicked({});
              setRound((r) => r + 1);
            }}
          >
            다른 문제
          </button>
        </div>
      )}
    </section>
  );
}
