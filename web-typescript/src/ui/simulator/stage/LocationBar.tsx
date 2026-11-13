'use client';

/**
 * 위치 줄 (입문 트랙, 학생 화면 맨 위): where the student is, big enough to read from the back of the
 * classroom. 입문 과정 (수정 지시서 v4 파트 2): from the left — [목록] (it opens the list screen), the 절's
 * number, its name, its 차시 as a tag; no 교안 쪽 (the 교안 is on the platform, 절 by 절). The kinds
 * (장면 보기 | 실습 하기) are a group of their own at the top bar's right (LocKindsSwitch), shown only
 * for a 절 that has a 장면 보기.
 * Before that (kept: `onList` not given): "N차시 · 3-3 · 교안 N쪽" as one key that opens the 차시 · 절
 * list under it, the kinds beside it (피드백 v3 파트 4).
 */

import { useEffect, useRef, useState } from 'react';

import { MODE_NAME, barTitle, pagesText, type SubMode } from '@/engine/simulator/cell/course';
import { commonLine } from '@/engine/simulator/cell/courseText';

import Icon from '../Icon';
import css from './locationBar.module.css';

export interface LocStep {
  id: string;
  /** '3-3': the 교안's 장 · 절 number. */
  label: string;
  title: string;
  /** null: no 교안 쪽 yet — left out of the line. */
  pages: readonly [number, number] | null;
  state: 'done' | 'now' | 'todo';
  /** Not in the app yet (만드는 중): listed, not opened. */
  soon?: boolean;
  /** Its word in place of the state (a 수행평가: '준비 중'). */
  tag?: string;
}

export interface LocLesson {
  n: number;
  steps: LocStep[];
  /** The 차시's 확인 문제: answered / asked (none: no row). */
  checks?: { got: number; of: number };
}

/** The 절's kinds: the one open now, those it has a button for (만드는 중: shown, not pressed), switching. */
export interface LocKinds {
  now: SubMode;
  has: { mode: SubMode; open: boolean }[];
  onMode(m: SubMode): void;
  /** 장면 보기: play it again. */
  onReplay?: () => void;
  busy?: boolean;
}

/** 장면 보기 | 실습 하기: the kind open now and the other one — only for a 절 that has a 장면 보기 (수정 지시서 v4 파트 2-4). */
export function LocKindsSwitch({ kinds }: { kinds: LocKinds }) {
  if (!kinds.has.some((k) => k.mode === 'scene')) return null;
  return (
    <span className={css.kinds} data-top role="group" aria-label="장면 보기 · 실습 하기">
      {kinds.has.map((k) => (
        <button key={k.mode} type="button" data-on={k.mode === kinds.now || undefined} disabled={!k.open || kinds.busy} onClick={() => k.mode !== kinds.now && kinds.onMode(k.mode)}>
          {MODE_NAME[k.mode]}
        </button>
      ))}
    </span>
  );
}

export default function LocationBar({
  lesson,
  step,
  lessons,
  onGo,
  onChecks,
  kinds,
  note,
  onList,
}: {
  lesson: number;
  step: LocStep;
  lessons: LocLesson[];
  onGo(id: string): void;
  onChecks?(n: number): void;
  kinds?: LocKinds;
  note?: string | null;
  /** 입문 과정: [목록] opens the list screen (no list under the line, no 교안 쪽, the kinds at the top bar's right). */
  onList?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('pointerdown', away);
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('pointerdown', away);
      window.removeEventListener('keydown', esc);
    };
  }, [open]);
  // Opened, the list starts at the one open now (a long course: 12차시).
  const drop = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open) drop.current?.querySelector('[data-state="now"]')?.scrollIntoView({ block: 'center' });
  }, [open]);
  if (onList)
    return (
      <div className={css.loc} data-flat>
        <button type="button" className={css.list} onClick={onList} title="목록: 장과 절을 골라요">
          <Icon name="list" size={18} />
          {commonLine('list')}
        </button>
        {/* The 장 · 절 number biggest and brightest, the name up to its colon (the whole name: the list and the printed sheet), the 차시 as a tag. */}
        <b>{step.label}</b>
        <span title={step.title}>{barTitle(step.label, step.title)}</span>
        {lesson > 0 && <small>{lesson}차시</small>}
        {note && <output className={css.note}>{note}</output>}
      </div>
    );
  return (
    <div className={css.loc} ref={root}>
      <button type="button" className={css.bar} aria-expanded={open} aria-haspopup="true" onClick={() => setOpen((o) => !o)} title="차시 · 단계 목록: 눌러서 원하는 단계로 가요">
        {/* The 장 · 절 number biggest and brightest; the 차시 and the 교안 pages beside it as one piece. */}
        <b>{step.label}</b>
        {/* The name up to its colon (the whole name: the list and the printed sheet). */}
        <span title={step.title}>{barTitle(step.label, step.title)}</span>
        {(lesson > 0 || step.pages) && <small>{[lesson ? `${lesson}차시` : '', pagesText(step.pages)].filter(Boolean).join(' · ')}</small>}
        <i aria-hidden="true" data-open={open || undefined}>
          목록 <Icon name="chevron" size={14} />
        </i>
      </button>
      {kinds && kinds.has.length > 0 && (
        <span className={css.kinds} role="group" aria-label="장면 보기 · 실습 하기">
          {kinds.has.map((k) => (
            <button key={k.mode} type="button" data-on={k.mode === kinds.now || undefined} disabled={!k.open || kinds.busy} onClick={() => k.mode !== kinds.now && kinds.onMode(k.mode)}>
              {MODE_NAME[k.mode]}
            </button>
          ))}
        </span>
      )}
      {kinds?.onReplay && (
        <button type="button" className={css.replay} disabled={kinds.busy} onClick={kinds.onReplay}>
          <Icon name="play" size={16} />
          다시 보기
        </button>
      )}
      {note && <output className={css.note}>{note}</output>}
      {open && (
        <div className={css.drop} ref={drop} role="menu" aria-label="차시 · 단계 목록">
          {lessons.map((l) => (
            <section key={l.n}>
              <h4>{l.n}차시</h4>
              {l.steps.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  role="menuitem"
                  className={css.row}
                  data-state={s.state}
                  disabled={s.soon}
                  onClick={() => {
                    setOpen(false);
                    if (s.state !== 'now') onGo(s.id);
                  }}
                >
                  <em>{s.tag ?? (s.soon ? '' : s.state === 'done' ? '✓ 완료' : s.state === 'now' ? '지금' : '미완료')}</em>
                  <span>
                    {s.label} {s.title}
                  </span>
                  {s.pages && <small>{pagesText(s.pages)}</small>}
                </button>
              ))}
              {l.checks && onChecks && (
                <button
                  type="button"
                  role="menuitem"
                  className={css.row}
                  data-state={l.checks.got >= l.checks.of ? 'done' : 'todo'}
                  onClick={() => {
                    setOpen(false);
                    onChecks(l.n);
                  }}
                >
                  <em>{l.checks.got >= l.checks.of ? '✓ 완료' : '미완료'}</em>
                  <span>
                    {l.n}차시 확인 문제 {l.checks.of}문항
                  </span>
                  <small>
                    {l.checks.got} / {l.checks.of}
                  </small>
                </button>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
