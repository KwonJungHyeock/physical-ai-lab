'use client';

/** The lab's one slim bar: ← 교육 홈, the chapter, problems ①②③ (✓ when solved), the six steps as dots. */

import { CHAPTER, PROBLEMS, STEPS, type StepId } from '@/engine/education/lab/chapter';
import type { ProblemId } from '@/engine/education/lab/problems';

import css from './lab.module.css';

interface Props {
  prob: ProblemId;
  step: StepId;
  /** The furthest step reached in this problem (index): steps up to it can be opened. */
  reached: number;
  solved: Record<ProblemId, boolean>;
  onProblem(p: ProblemId): void;
  onStep(s: StepId): void;
  onBack(): void;
}

export default function LabBar({ prob, step, reached, solved, onProblem, onStep, onBack }: Props) {
  const at = STEPS.findIndex((s) => s.id === step);
  return (
    <header className={css.bar}>
      <button type="button" className={css.back} onClick={onBack}>
        ← 교육 홈
      </button>
      <b className={css.chapter}>
        {CHAPTER.title}
        <small>{CHAPTER.badge}</small>
      </b>
      <nav className={css.probs} aria-label="문제">
        {PROBLEMS.map((p) => (
          <button key={p.id} type="button" aria-current={p.id === prob || undefined} data-solved={solved[p.id] || undefined} onClick={() => onProblem(p.id)} title={`${p.mark} ${p.title}`}>
            <span className={css.num}>{p.mark}</span>
            <span className={css.probName}>{p.title}</span>
            {solved[p.id] && <i aria-label="해결">✓</i>}
          </button>
        ))}
      </nav>
      <nav className={css.steps} aria-label="단계">
        {STEPS.map((s, i) => (
          <button
            key={s.id}
            type="button"
            data-st={i === at ? 'now' : i < at ? 'done' : i <= reached ? 'open' : undefined}
            aria-current={i === at ? 'step' : undefined}
            disabled={i > reached}
            onClick={() => onStep(s.id)}
          >
            <i>{i < at ? '✓' : i + 1}</i>
            <span>{s.label}</span>
          </button>
        ))}
      </nav>
    </header>
  );
}
