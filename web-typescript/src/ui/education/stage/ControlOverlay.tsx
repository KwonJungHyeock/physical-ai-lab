'use client';

/**
 * The activity panel over the 3D view. In an activity it walks the class through one try
 * the 예상 → 관찰 → 설명 way:
 *   the three activities (1 그대로 해 보기 · 2 하나 바꿔 보기 · 3 한 번 더 바꾸기)
 *   바꾸는 것 — the one thing this try changes, big: what · from → to
 *   ① 예상  pick an answer before trying
 *   ② 해 보기  the topic's own buttons, sliders and graphs
 *   ③ 결과  the result in one line, its numbers as chips, and whether the guess was right
 *   ④ 왜?  the reason in one sentence (the long one behind 더 보기)
 * On 정리 it lists the three results; on the other steps it shrinks to a small card so the 3D
 * view shows whole. It folds away to a tab. The topic's controls stay mounted throughout
 * (switching steps must not reset what was tried).
 */

import { useEffect, useState, type ReactNode } from 'react';

import { STEP_NO, type StepKey, type Topic } from '@/engine/education/catalog';

import { ACT_NAME, PAGE_LABEL, isActivity, type PageId } from '../lesson/LessonCards';
import { Rich } from '../lesson/Rich';
import type { ResultRow } from '../topics/types';
import css from '../learn.module.css';

const KEYS: StepKey[] = ['A', 'B', 'C'];
const NEXT: Record<StepKey, PageId> = { A: 'B', B: 'C', C: 'cmp' };
const NOTES_KEY = 'learn-overlay-notes';

/** What the class does with the 3D view on the steps without controls. */
const MINI: Partial<Record<PageId, string>> = {
  intro: '3D 화면을 끌어 돌려 보며 로봇을 살펴보세요. 활동은 오른쪽 카드를 넘기면 시작돼요.',
  theory: '그림과 3D 화면을 번갈아 보며 개념을 짚어 보세요.',
  check: '3D 화면은 잠시 쉬어요. 오른쪽 문제를 풀고, 틀린 문제는 지도에서 다시 풀 수 있어요.',
};

interface Props {
  topic: Topic;
  page: PageId;
  onPage(p: PageId): void;
  results: Partial<Record<StepKey, ResultRow>>;
  children: ReactNode;
}

export default function ControlOverlay({ topic, page, onPage, results, children }: Props) {
  const [open, setOpen] = useState(true);
  /** The controls' side notes: folded by default so the panel stays short. */
  const [notes, setNotes] = useState(false);
  /** The guesses made in this lesson (index into the activity's 보기). */
  const [guess, setGuess] = useState<Partial<Record<StepKey, number>>>({});
  const [why, setWhy] = useState<0 | 1 | 2>(0);
  useEffect(() => {
    try {
      // Remembered per browser (read after hydration).
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (localStorage.getItem(NOTES_KEY) === '1') setNotes(true);
    } catch {
      /* private window */
    }
  }, []);
  // A new step starts with the reason folded.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setWhy(0), [page]);
  const toggleNotes = () => {
    setNotes((n) => {
      try {
        localStorage.setItem(NOTES_KEY, n ? '0' : '1');
      } catch {
        /* private window */
      }
      return !n;
    });
  };
  const act = isActivity(page) ? topic.steps.find((s) => s.key === page)! : null;
  const done = act ? results[act.key] : undefined;
  const nDone = KEYS.filter((k) => results[k]).length;
  const mode = act ? 'act' : page === 'cmp' ? 'cmp' : 'mini';
  const g = act ? guess[act.key] : undefined;
  const [from, to] = act && act.change.value.includes(' → ') ? act.change.value.split(' → ') : [null, act?.change.value ?? ''];
  return (
    <>
      {!open && (
        <button type="button" className={css.overlayTab} onClick={() => setOpen(true)} aria-label="실습 제어판 펼치기">
          {act ? `${PAGE_LABEL[act.key]} 패널` : '활동 패널'} ▸ <small>{nDone}/3</small>
        </button>
      )}
      <section className={css.overlay} aria-label="실습 제어판" hidden={!open} data-mode={mode} data-notes={notes || undefined}>
        {mode === 'mini' && (
          <div className={css.mini}>
            <b>{PAGE_LABEL[page]}</b>
            <p>{MINI[page]}</p>
            {page !== 'check' && (
              <button type="button" onClick={() => onPage('A')}>
                활동 1 {ACT_NAME.A} 바로 가기 →
              </button>
            )}
          </div>
        )}

        <header className={css.apHead} hidden={mode === 'mini'}>
          <b>{act ? PAGE_LABEL[act.key] : '정리'}</b>
          <span>{act ? ACT_NAME[act.key] : '세 활동 비교'}</span>
          <button type="button" className={css.overlayFold} onClick={() => setOpen(false)} aria-label="패널 접기" title="패널 접기 (3D 화면 넓게)">
            ◂
          </button>
        </header>
        <ol className={css.acts} aria-label="실습 순서" hidden={mode === 'mini'}>
          {KEYS.map((k) => {
            const s = topic.steps.find((x) => x.key === k)!;
            const ok = !!results[k];
            return (
              <li key={k}>
                <button type="button" aria-current={page === k || undefined} data-done={ok || undefined} onClick={() => onPage(k)} title={`${PAGE_LABEL[k]} · ${s.title}`}>
                  <b>
                    {ok ? '✓ ' : ''}
                    {STEP_NO[k]}
                  </b>
                  <small>{s.title}</small>
                </button>
              </li>
            );
          })}
        </ol>

        {act && (
          <div className={css.chg} data-first={!from || undefined}>
            <small>{from ? `바꾸는 것 · ${act.change.what}` : `처음 조건 · ${act.change.what}`}</small>
            <span>
              {from && (
                <>
                  <s>{from}</s>
                  <i aria-hidden="true">→</i>
                </>
              )}
              <b>{to}</b>
            </span>
          </div>
        )}

        <div className={css.overlayBody} hidden={mode === 'mini'}>
          {act && (
            <div className={css.pq} data-st={g === undefined ? 'now' : 'done'}>
              <em>1</em>
              <div>
                <b>
                  예상 · <Rich text={act.ask} />
                </b>
                <div className={css.opts} role="group" aria-label="예상 고르기">
                  {act.choices.options.map((o, i) => (
                    <button key={o} type="button" aria-pressed={g === i} onClick={() => setGuess((x) => ({ ...x, [act.key]: i }))}>
                      <i>{i + 1}</i>
                      {o}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
          {/* ② The topic's controls (hidden, still mounted, outside the activities). */}
          <div className={css.pq} data-st={act ? (done ? 'done' : g !== undefined ? 'now' : undefined) : undefined} hidden={!act}>
            <em>2</em>
            <div>
              <b>해 보기</b>
              {act && (
                <p className={css.doIt}>
                  <Rich text={act.doIt} />
                </p>
              )}
              <div className={css.guideControls}>{children}</div>
              <button type="button" className={css.notesBtn} aria-pressed={notes} onClick={toggleNotes} title={notes ? '조작 설명 접기' : '조작 설명 보기'}>
                ⓘ {notes ? '조작 설명 접기' : '조작 설명'}
              </button>
            </div>
          </div>

          {act ? (
            <>
              <div className={css.pq} data-st={done ? 'now' : 'off'}>
                <em>3</em>
                <div>
                  <b>결과</b>
                  <div className={css.resultBox} data-state={done ? 'done' : 'wait'}>
                    {done ? (
                      <>
                        <p className={css.verdict} data-ok={g === undefined ? undefined : g === act.choices.answer ? true : false}>
                          {g === undefined ? '정답' : g === act.choices.answer ? '✓ 예상이 맞았어요 —' : '✗ 예상과 달라요 · 정답'} {act.choices.answer + 1}번 {act.choices.options[act.choices.answer]}
                        </p>
                        <p className={css.point}>
                          <Rich text={act.point} />
                        </p>
                        <ul className={css.chips}>
                          {Object.entries(done).map(([k, v]) => (
                            <li key={k}>
                              <small>{k}</small>
                              <b>{v}</b>
                            </li>
                          ))}
                        </ul>
                      </>
                    ) : (
                      <p className={css.guideWait}>해 보면 결과가 여기에 나와요</p>
                    )}
                  </div>
                </div>
              </div>
              <div className={css.pq} data-st={done ? 'now' : 'off'}>
                <em>4</em>
                <div>
                  <button type="button" className={css.whyBtn} disabled={!done} aria-expanded={why > 0} onClick={() => setWhy(why ? 0 : 1)}>
                    왜 그럴까? {why ? '▴' : '▾'}
                  </button>
                  {done && why > 0 && (
                    <div className={css.whyText}>
                      <p>
                        <Rich text={why === 2 ? act.why : act.whyShort} />
                      </p>
                      {why === 1 && (
                        <button type="button" onClick={() => setWhy(2)}>
                          더 보기
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <button type="button" className={css.guideNext} data-ready={done ? true : undefined} onClick={() => onPage(NEXT[act.key])}>
                {NEXT[act.key] === 'cmp' ? '다음: 정리 →' : `다음: ${PAGE_LABEL[NEXT[act.key]]} ${ACT_NAME[NEXT[act.key] as StepKey]} →`}
              </button>
            </>
          ) : (
            mode === 'cmp' && (
              <div className={css.resultBox} data-state="done">
                <table className={css.guideTable}>
                  <tbody>
                    {KEYS.map((k) => {
                      const s = topic.steps.find((x) => x.key === k)!;
                      return (
                        <tr key={k} data-done={results[k] ? true : undefined}>
                          <th>
                            <button type="button" onClick={() => onPage(k)} title={PAGE_LABEL[k]}>
                              {STEP_NO[k]}
                            </button>
                          </th>
                          <td>
                            <small className={css.cmpWhat}>{s.change.value.split(' → ').pop()}</small>
                            {results[k] ? (
                              <ul className={css.chips} data-small>
                                {Object.entries(results[k]!).map(([n, v]) => (
                                  <li key={n}>
                                    <small>{n}</small>
                                    <b>{v}</b>
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <span className={css.guideWait}>아직 안 했어요</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <button type="button" className={css.guideNext} data-ready onClick={() => onPage('check')}>
                  평가 문제 풀기 →
                </button>
              </div>
            )
          )}
        </div>
      </section>
    </>
  );
}
