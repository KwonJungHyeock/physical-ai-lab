'use client';

/**
 * The bar over a lesson: ← 지도, the 차시's name, and its seven steps (도입 · 개념 · 활동 1–3 ·
 * 정리 · 평가) as a line that fills up to the current step, which pulses. A ✓ means done, not
 * visited: an activity once its result is in, the 평가 once every 확인 문제 is right. "지금" names the step in words.
 */

import type { CSSProperties } from 'react';

import { categoryOf, lessonNo, type StepKey, type Topic } from '@/engine/education/catalog';
import { LEVEL_VIEW, partOf, type StudyLevel } from '@/engine/education/roadmap';

import { ACT_NAME, PAGES, PAGE_LABEL, isActivity, type PageId } from './LessonCards';
import type { ResultRow } from '../topics/types';
import css from './lesson.module.css';

interface Props {
  topic: Topic;
  page: PageId;
  onPage(p: PageId): void;
  results: Partial<Record<StepKey, ResultRow>>;
  /** The 평가 is passed. */
  passed: boolean;
  level: StudyLevel;
  onBack(): void;
}

export default function LessonBar({ topic, page, onPage, results, passed, level, onBack }: Props) {
  const at = PAGES.indexOf(page);
  const cat = categoryOf(topic.id);
  return (
    <header className={css.bar}>
      <div className={css.barHead}>
        <button type="button" className={css.back} onClick={onBack}>
          ← 지도
        </button>
        <span className={css.ttl}>
          <small title={`대단원 ${partOf(cat.id).no} ${partOf(cat.id).title}`}>
            대단원 {partOf(cat.id).no} · {cat.id}단원 · {lessonNo(topic.id)}차시 · {LEVEL_VIEW[level].minutes}분
          </small>
          <b>
            {topic.id} {topic.title}
          </b>
        </span>
      </div>
      <nav className={css.prog} aria-label="수업 순서" style={{ '--fill': `${(at / (PAGES.length - 1)) * 100}%` } as CSSProperties}>
        <span className={css.ln} aria-hidden="true">
          <i />
        </span>
        {PAGES.map((p, i) => {
          // ✓ means done: an activity once its result is in, the 평가 once passed, a reading step once passed by.
          const done = isActivity(p) ? !!results[p] : p === 'check' ? passed : i < at;
          return (
            <button key={p} type="button" className={css.ps} data-st={i === at ? 'now' : done ? 'done' : undefined} data-act={isActivity(p) || undefined} aria-current={i === at ? 'step' : undefined} onClick={() => onPage(p)}>
              <span className={css.nd}>{done && i !== at ? '✓' : i + 1}</span>
              <span>{PAGE_LABEL[p]}</span>
            </button>
          );
        })}
      </nav>
      <p className={css.now} aria-live="polite">
        지금
        <b>
          {PAGE_LABEL[page]}
          {isActivity(page) ? ` · ${ACT_NAME[page]}` : ''}
        </b>
      </p>
    </header>
  );
}
