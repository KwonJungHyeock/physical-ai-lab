'use client';

/**
 * 단계 안내 (입문 트랙) where each part is looked at, not in a column of text beside the scene
 * (engine/simulator/cell/guides.ts): the 예측 question comes up as a small card the moment ▶
 * 시뮬레이션 is pressed (one tap answers it and the run starts); the 관찰 moments are the scene's
 * bubbles (CellScene); after the run, one card at the top centre — passed or not, the checks, the
 * prediction against what happened, and the idea of the step.
 */

import { useEffect } from 'react';

import { guideOf } from '@/engine/simulator/cell/guides';
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
  if (!g) return null;
  return (
    <div className={css.predict} role="dialog" aria-label="예측">
      <header>
        <em>PREDICT</em>
        <b>먼저 예측해 봐요</b>
        <button type="button" className={css.x} onClick={onSkip} aria-label="예측 없이 실행">
          건너뛰기
        </button>
      </header>
      <p>{g.predict.q}</p>
      <div className={css.opts}>
        {g.predict.options.map((o, k) => (
          <button key={o} type="button" onClick={() => onAnswer(k)}>
            <i>{MARK[k]}</i>
            {o}
          </button>
        ))}
      </div>
      <small>고르면 바로 시뮬레이션이 시작돼요 · 채점하지 않아요</small>
    </div>
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
}

/** After the run: passed or not, the checks, the prediction against what happened, the idea. */
export function StepResult(p: ResultProps) {
  const m = missionById(p.mission);
  const g = guideOf(p.mission);
  if (!m) return null;
  const steps = missionsOf(p.cell);
  const next = p.passed ? steps[m.n] : undefined;
  return (
    <div className={css.result} data-ok={p.passed || undefined} role="status">
      <header>
        <span className={css.medal} aria-hidden="true">
          {p.passed ? '✓' : '!'}
        </span>
        <span>
          <b>{p.passed ? `${m.n}단계 통과!` : `${m.n}단계 아직이에요`}</b>
          <small>{m.title}</small>
        </span>
        <button type="button" className={css.x} onClick={p.onClose} aria-label="닫기">
          ×
        </button>
      </header>
      <ul className={css.checks}>
        {p.checks.map((c) => (
          <li key={c.label} data-ok={c.ok || undefined}>
            <i aria-hidden="true">{c.ok ? '✓' : '✗'}</i>
            <span>{c.label}</span>
            {c.detail && <em>{c.detail}</em>}
          </li>
        ))}
      </ul>
      {g && p.chosen !== undefined && (
        <p className={css.compare} data-ok={p.chosen === g.predict.answer || undefined}>
          <em>PREDICT</em>내 예측 {MARK[p.chosen]} → 실제 {MARK[g.predict.answer]} {g.predict.options[g.predict.answer]}
        </p>
      )}
      {g && (
        <div className={css.concept}>
          <em>CONCEPT</em>
          <b>{g.concept.term}</b>
          <p>{g.concept.def}</p>
          <small>실제 현장 · {g.concept.real}</small>
        </div>
      )}
      {next && p.onNext && (
        <button type="button" className={css.next} onClick={p.onNext}>
          다음 단계 ({next.n}단계) →
        </button>
      )}
    </div>
  );
}
