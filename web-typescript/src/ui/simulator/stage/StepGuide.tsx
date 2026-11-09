'use client';

/**
 * 단계 안내 (입문 트랙) where each part is looked at, not in a column of text beside the scene
 * (engine/simulator/cell/guides.ts): in 퀘스트 모드 the 예측 is asked over the scene at the moment
 * the result splits (MomentAsk: the scene holds still); outside it, as a small card when ▶
 * 시뮬레이션 is pressed. The 관찰 moments are the scene's bubbles (CellScene); after the run, one
 * card — passed or not, the checks, the prediction against what happened, and the idea of the step.
 */

import { useEffect, useState } from 'react';

import { guideOf, type Ask } from '@/engine/simulator/cell/guides';
import { LESSON_QUEST } from '@/engine/simulator/cell/lessons';
import { missionById, missionsOf } from '@/engine/simulator/cell/missions';
import type { CellId } from '@/engine/simulator/cell/cells';

import css from './stepGuide.module.css';

const PREDICT_KEY = 'robot-console-life-predict';
export const MARK = ['①', '②', '③', '④'];

/** The option chosen per step (this browser; not graded). */
export function loadPredictions(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(PREDICT_KEY) ?? '{}') as Record<string, number>;
  } catch {
    return {};
  }
}
export function savePrediction(id: string, k: number): void {
  try {
    localStorage.setItem(PREDICT_KEY, JSON.stringify({ ...loadPredictions(), [id]: k }));
  } catch {
    /* private window */
  }
}

/** 예측, as ▶ 시뮬레이션 is pressed: the question and its options; a tap answers it and runs. */
export function PredictCard({ mission, onAnswer, onSkip }: { mission: string; onAnswer(k: number): void; onSkip(): void }) {
  const g = guideOf(mission);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onSkip();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onSkip]);
  const pr = g?.predict;
  if (!pr) return null;
  return (
    <div className={css.predict} role="dialog" aria-label="예측">
      <header>
        <em>PREDICT</em>
        <b>먼저 예측해 봐요</b>
        <button type="button" className={css.x} onClick={onSkip} aria-label="예측 없이 실행">
          건너뛰기
        </button>
      </header>
      <p>{pr.q}</p>
      <div className={css.opts}>
        {pr.options.map((o, k) => (
          <button key={o} type="button" onClick={() => onAnswer(k)}>
            <i>{MARK[k]}</i>
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * 예측 at the moment (입문 퀘스트 모드): the scene has stopped where the result splits; the question
 * and two or three big keys over the scene. A tap answers it and the run goes on from there, so the
 * answer is seen at once (예측 → 관찰). Not graded.
 */
export function MomentAsk({ ask, ox, onAnswer, onSkip }: { ask: Ask; ox?: string; onAnswer(k: number): void; onSkip(): void }) {
  // O · X (미리보기): the answer and why first, then on; a 예측 goes on at once (it is compared after the run).
  const [chosen, setChosen] = useState<number | null>(null);
  // O · X is a modal: the held scene dims behind it.
  const scrim = ox ? <div className={css.scrim} aria-hidden="true" /> : null;
  if (ox && chosen !== null)
    return (
      <>
      {scrim}
      <div className={css.moment} role="dialog" aria-label="예측" data-ok={chosen === ask.answer || undefined}>
        <header>
          <span className={css.pause} aria-hidden="true" />
          <em>{chosen === ask.answer ? '맞았어요' : '다시 볼까요'}</em>
        </header>
        <p>정답 {ask.options[ask.answer]}</p>
        <button type="button" className={css.goOn} onClick={() => onAnswer(chosen)}>
          이어서 보기 ▶
        </button>
      </div>
      </>
    );
  return (
    <>
    {scrim}
    <div className={css.moment} role="dialog" aria-modal={!!ox || undefined} aria-label={ox ? 'O X 퀴즈' : '예측'}>
      <header>
        <span className={css.pause} aria-hidden="true" />
        <em>{ox ?? '장면 멈춤 · 예측'}</em>
      </header>
      <p>{ask.q}</p>
      <div className={css.big} data-n={ask.options.length} data-ox={ask.options.join('') === 'OX' || undefined}>
        {ask.options.map((o, k) => (
          <button key={o} type="button" onClick={() => (ox ? setChosen(k) : onAnswer(k))}>
            <i>{MARK[k]}</i>
            {o}
          </button>
        ))}
      </div>
      <small>
        <button type="button" onClick={onSkip}>
          {ox ? '답하지 않고 계속' : '예측 없이 계속'}
        </button>
      </small>
    </div>
    </>
  );
}

interface ResultProps {
  cell: CellId;
  mission: string;
  passed: boolean;
  /** The step's checks as they ended. */
  checks: { label: string; ok: boolean; detail?: string }[];
  /** The option chosen before the run (undefined: skipped). */
  chosen: number | undefined;
  onNext?: () => void;
  onClose(): void;
  /** In the side panel (퀘스트 모드), not over the scene. */
  inPanel?: boolean;
  /** 퀘스트 모드: in the middle of the scene, the scene dimmed behind it (the side panel keeps to 제어 · 실습). */
  modal?: boolean;
}

/** After the run: passed or not, the checks, the prediction against what happened, the idea. */
export function StepResult(p: ResultProps) {
  const m = missionById(p.mission);
  const g = guideOf(p.mission);
  // 교실 수업형 (로봇 카페): the idea from the 수업 설계 (lessons.ts) where the step's guide has none.
  const concept = g?.concept ?? LESSON_QUEST[p.mission]?.concept;
  const page = LESSON_QUEST[p.mission]?.pages;
  if (!m) return null;
  const steps = missionsOf(p.cell);
  const next = p.passed ? steps[m.n] : undefined;
  const card = (
    <div className={css.result} data-ok={p.passed || undefined} data-panel={p.inPanel || undefined} role="status">
      <header>
        <span className={css.medal} aria-hidden="true">
          {p.passed ? '✓' : '!'}
        </span>
        <span>
          <b>{p.passed ? `퀘스트 ${m.n} 통과!` : `퀘스트 ${m.n} 아직이에요`}</b>
          <small>{m.title}</small>
        </span>
        <button type="button" className={css.x} onClick={p.onClose} aria-label="닫기">
          ×
        </button>
      </header>
      {/* In the side panel the quest card above has the checklist. */}
      {!p.inPanel && (
        <ul className={css.checks}>
          {p.checks.map((c) => (
            <li key={c.label} data-ok={c.ok || undefined}>
              <i aria-hidden="true">{c.ok ? '✓' : '✗'}</i>
              <span>{c.label}</span>
              {c.detail && <em>{c.detail}</em>}
            </li>
          ))}
        </ul>
      )}
      {g?.predict && p.chosen !== undefined && (
        <p className={css.compare} data-ok={p.chosen === g.predict.answer || undefined}>
          <em>PREDICT</em>내 예측 {MARK[p.chosen]} → 실제 {MARK[g.predict.answer]} {g.predict.options[g.predict.answer]}
        </p>
      )}
      {concept && (
        <div className={css.concept}>
          <em>CONCEPT</em>
          <b>{concept.term}</b>
          {/* 입문: what it means and where it is used are the 교안's (the app is for doing it). */}
          {page && <small>교안 {page[0]}–{page[1]}쪽</small>}
        </div>
      )}
      {next && p.onNext && (
        <button type="button" className={css.next} onClick={p.onNext}>
          다음 퀘스트 ({next.n}) →
        </button>
      )}
    </div>
  );
  if (!p.modal) return card;
  return (
    <>
      <div className={css.resultModal} role="dialog" aria-label="퀘스트 결과">
        {card}
      </div>
    </>
  );
}
