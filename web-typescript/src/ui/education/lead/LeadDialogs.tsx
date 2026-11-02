'use client';

/**
 * Starting a led lesson: the teacher picks the lesson (기초교육 1 · 2차시 or one unit); it runs on this PC,
 * shown to the class on the projector.
 */

import { useState } from 'react';

import { BASIC_PERIODS, LESSONS, LESSON_BY_ID, lessonMinutes } from '@/engine/education/lead';
import type { LeadSet } from '@/engine/education/leadState';
import { UNIT_BY_ID, type UnitId } from '@/engine/education/practice7';

import css from './lead.module.css';

export function LeadStart({ unit, onStart, onClose }: { unit: UnitId; onStart(first: LeadSet): void; onClose(): void }) {
  const [lesson, setLesson] = useState(LESSONS.find((l) => l.unit === unit)!.id);
  const start = () => onStart({ lesson, step: 0, gate: false, reveal: false, stop: 0 });

  return (
    <div className={css.dlgBack} role="dialog" aria-modal="true" aria-label="선생님과 함께 수업 시작">
      <div className={css.dlg}>
        <h2>선생님과 함께 수업</h2>
        <p className={css.note}>선생님 화면을 프로젝터로 보여 주며 단계를 하나씩 열어요. 실물 로봇은 선생님이 허락한 뒤에만 움직여요.</p>

        <h3>수업</h3>
        <div className={css.lessonPick}>
          {BASIC_PERIODS.map((p) => (
            <div key={p.name} className={css.period}>
              <small>{p.name}</small>
              {p.lessons.map((id) => {
                const l = LESSON_BY_ID.get(id)!;
                return (
                  <button key={id} type="button" aria-pressed={lesson === id} onClick={() => setLesson(id)}>
                    7-{l.unit}. {UNIT_BY_ID.get(l.unit)!.title}
                    <small>{lessonMinutes(l)}분</small>
                  </button>
                );
              })}
            </div>
          ))}
          <div className={css.period}>
            <small>검수 수업</small>
            {LESSONS.filter((l) => !BASIC_PERIODS.some((p) => p.lessons.includes(l.id))).map((l) => (
              <button key={l.id} type="button" aria-pressed={lesson === l.id} onClick={() => setLesson(l.id)}>
                7-{l.unit}. {UNIT_BY_ID.get(l.unit)!.title}
                <small>{lessonMinutes(l)}분</small>
              </button>
            ))}
          </div>
        </div>

        <div className={css.dlgFoot}>
          <button type="button" className={css.subBtn} onClick={onClose}>
            닫기
          </button>
          <button type="button" className={css.primary} onClick={start}>
            수업 시작 →
          </button>
        </div>
      </div>
    </div>
  );
}
