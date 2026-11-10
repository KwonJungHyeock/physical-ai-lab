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
 * 예측 · O · X at the moment (입문 퀘스트 모드), as an interactive video does it (EdPuzzle, H5P): the
 * scene stops where the result splits and a quiz comes up big in the middle of it — "잠깐! 퀴즈", how
 * many of the run's questions this is, the question, two or three big keys (O blue circle · X red
 * cross: colour and shape). A key answers it: the O · X shows right or not with why in a band at the
 * card's foot (as Duolingo's), a 예측 that it is noted (it is compared after the run); then 이어서 보기.
 * Keys: O · X or 1 – 3 answer, Enter goes on, Esc skips.
 */
export function MomentAsk({ ask, ox, n, onAnswer, onSkip }: { ask: Ask; ox?: string; n?: { at: number; of: number }; onAnswer(k: number): void; onSkip(): void }) {
  const [chosen, setChosen] = useState<number | null>(null);
  const isOx = ask.options.join('') === 'OX';
  const pick = (k: number) => {
    if (chosen === null) setChosen(k);
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onSkip();
      else if (chosen !== null && e.key === 'Enter') onAnswer(chosen);
      else if (chosen === null) {
        const k = isOx ? ['o', 'x'].indexOf(e.key.toLowerCase()) : Number(e.key) - 1;
        if (k >= 0 && k < ask.options.length) setChosen(k);
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [chosen, isOx, ask.options.length, onAnswer, onSkip]);
  const ok = chosen !== null && chosen === ask.answer;
  const state = chosen === null ? 'ask' : !ox ? 'noted' : ok ? 'ok' : 'no';
  return (
    <>
      <div className={css.qScrim} aria-hidden="true" />
      <div className={css.quiz} role="dialog" aria-modal="true" aria-label={ox ? 'O X 퀴즈' : '예측'}>
        <div className={css.qCard} data-state={state}>
          <header className={css.qTop}>
            <span className={css.qBadge}>
              <i aria-hidden="true" />
              잠깐! {ox ? '퀴즈' : '예측'}
            </span>
            {n && n.of > 1 && (
              <span className={css.qCount} aria-label={`${n.of}문제 중 ${n.at}번째`}>
                {Array.from({ length: n.of }, (_, k) => (
                  <i key={k} data-on={k < n.at || undefined} />
                ))}
                <b>
                  {n.at} / {n.of}
                </b>
              </span>
            )}
          </header>
          <p className={css.qSub}>장면을 멈췄어요 · 답하면 이어서 봐요</p>
          <h2 className={css.qQ}>{ask.q}</h2>
          <div className={css.qOpts} data-n={ask.options.length} data-ox={isOx || undefined}>
            {ask.options.map((o, k) => (
              <button
                key={o}
                type="button"
                disabled={chosen !== null}
                data-pick={chosen === k || undefined}
                data-right={(ox && chosen !== null && k === ask.answer) || undefined}
                onClick={() => pick(k)}
              >
                {isOx ? <span className={k === 0 ? css.oMark : css.xMark} aria-hidden="true" /> : <i>{MARK[k]}</i>}
                <span className={isOx ? css.srOnly : undefined}>{o}</span>
              </button>
            ))}
          </div>
          {chosen === null ? (
            <button type="button" className={css.qSkip} onClick={onSkip}>
              {ox ? '답하지 않고 계속' : '예측 없이 계속'}
            </button>
          ) : (
            <footer className={css.qFeed}>
              <span>
                <b>{!ox ? '예측했어요!' : ok ? '정답이에요!' : `아쉬워요 · 정답은 ${ask.options[ask.answer]}`}</b>
                <small>{!ox ? '맞았는지는 장면을 보며 확인해요.' : ask.why}</small>
              </span>
              <button type="button" autoFocus onClick={() => onAnswer(chosen)}>
                이어서 보기 ▶
              </button>
            </footer>
          )}
        </div>
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
