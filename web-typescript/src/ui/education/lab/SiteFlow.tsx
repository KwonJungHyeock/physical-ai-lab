'use client';

/**
 * 산업단지 현장 실습의 패널 부품: what every site lab (스마트 공장, 물류 센터, …) shows the same way
 * in its six steps (engine/education/lab/siteText.ts) — the head, the foreman's line and the goals
 * (작업 지시), the questions to ask (가동), measuring one value at a time, the cause with a reply to
 * each answer and the explanation to complete (원인 찾기), the calculation that opens the operator
 * panel, a prediction and hints (값 고치기), why a prediction missed (비교), the principle card,
 * check questions, the university card and the real robot (해결), and the record sheet to print.
 * Each lab keeps its own 3D cell, runs and operator panel; the per-problem state they share is
 * FlowState.
 */

import { useMemo, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import type { StudyLevel } from '@/engine/education/roadmap';
import type { CheckQ, SiteProblem, SiteText } from '@/engine/education/lab/siteText';

import css from './lab.module.css';
import lg from './site.module.css';

export const NUM = ['①', '②', '③', '④'];
export const PROBS: readonly SiteProblem[] = [1, 2, 3];

/** A number as shown (the minus sign printed, not a hyphen). */
export const fmt = (v: number, d = 0) => v.toFixed(d).replace('-', '−');
/** A typed number (accepts the minus sign as printed, and a comma for the point). */
export const num = (s: string): number | null => {
  const x = parseFloat(s.trim().replace(/[−–]/g, '-').replace(',', '.'));
  return Number.isFinite(x) ? x : null;
};
export const near = (s: string, answer: number, tol: number) => {
  const x = num(s);
  return x !== null && Math.abs(x - answer) <= tol;
};

/** One 다시 가동, for the student's record: when, the values in words, how it went. */
export interface Attempt {
  time: string;
  values: string;
  pass: boolean;
  note: string;
}

/** What a student has done on one problem, the same on every site. */
export interface FlowState {
  /** 원인 찾기: how many of the measurements have been taken, the cause picked, the wrong ones tried before it, the explanation's gaps. */
  meas: number;
  pick: number | null;
  tried: number[];
  blanks: (number | null)[];
  /** 값 고치기: the numbers typed, and whether they have been checked. */
  calc: string[];
  calcChecked: boolean;
  pred: number | null;
  hints: number;
  tries: number;
  /** Why the prediction missed (the reason picked). */
  missed: number | null;
  /** 확인 문제: what was answered, and which have been checked. */
  answers: string[];
  shown: boolean[];
  log: Attempt[];
  /** The furthest step reached (0 – 5). */
  reached: number;
}

export const freshFlow = (T: SiteText): FlowState => ({
  meas: 0,
  pick: null,
  tried: [],
  blanks: T.blanks.answer.map(() => null),
  calc: T.calc.fields.map(() => ''),
  calcChecked: false,
  pred: null,
  hints: 0,
  tries: 0,
  missed: null,
  answers: T.checks.map(() => ''),
  shown: T.checks.map(() => false),
  log: [],
  reached: 0,
});

/** The state after a step has been reached through a guide or check shortcut: everything before it answered. */
export function answeredUpTo(T: SiteText, x: FlowState, step: number, measures: number, solve: boolean): Partial<FlowState> {
  const CAUSE = 2;
  const FIX = 3;
  return {
    reached: Math.max(x.reached, step),
    meas: step >= CAUSE ? measures : x.meas,
    pick: step > CAUSE ? T.choices.findIndex((c) => c.ok) : x.pick,
    blanks: step > CAUSE ? [...T.blanks.answer] : x.blanks,
    calc: step >= FIX && solve ? T.calc.fields.map((f) => String(f.answer)) : x.calc,
    calcChecked: (step >= FIX && solve) || x.calcChecked,
    pred: x.pred ?? 0,
    tries: solve ? x.tries + 1 : x.tries,
  };
}

export type FlowPatch = (ch: Partial<FlowState> | ((x: FlowState) => Partial<FlowState>)) => void;

export const blanksOk = (T: SiteText, b: readonly (number | null)[]) => T.blanks.answer.every((a, i) => b[i] === a);
export const calcOk = (T: SiteText, c: readonly string[]) => T.calc.fields.every((f, i) => near(c[i] ?? '', f.answer, f.tol));
export const causeFound = (T: SiteText, st: FlowState) => st.pick !== null && !!T.choices[st.pick]?.ok;

/* --- small pieces ------------------------------------------------------------------ */

export function Head({ eyebrow, title, solved }: { eyebrow: string; title: string; solved?: boolean }) {
  return (
    <div className={css.head}>
      <div>
        <small style={{ color: 'var(--site)' } as CSSProperties}>{eyebrow}</small>
        <b>{title}</b>
      </div>
      {solved && <span className={css.solved}>✓ 해결</span>}
    </div>
  );
}

export const SiteBtn = ({ children, ...p }: { children: ReactNode; disabled?: boolean; title?: string; onClick(): void }) => (
  <button type="button" className={`${css.primary} ${lg.siteBtn}`} {...p}>
    {children}
  </button>
);

export const bodyClass = `${css.body} ${lg.scroll}`;

/** 작업 지시: the person in charge says … */
export function Boss({ name, line }: { name: string; line: string }) {
  return (
    <p className={lg.boss}>
      <b>{name}</b> {line}
    </p>
  );
}

export function Goals({ goals }: { goals: readonly string[] }) {
  return (
    <details className={lg.goals}>
      <summary>이번 문제에서 배울 것</summary>
      <ol>
        {goals.map((g) => (
          <li key={g}>{g}</li>
        ))}
      </ol>
    </details>
  );
}

/** 가동 · 문제: the questions to ask right after the run. */
export function Ask({ ask }: { ask: readonly string[] }) {
  return (
    <ul className={lg.ask}>
      {ask.map((q) => (
        <li key={q}>{q}</li>
      ))}
    </ul>
  );
}

/* --- 원인 찾기 --------------------------------------------------------------------------- */

/** A measurement: what, its value, and whether it is the bad one. */
export interface MeasureRow {
  label: string;
  value: string;
  bad?: boolean;
}

/** The measurements, taken one at a time (each 재기 shows the next value; the lab draws it in 3D). */
export function Measure({ rows, meas, onMeasure }: { rows: readonly MeasureRow[]; meas: number; onMeasure(): void }) {
  return (
    <div className={lg.measureBox}>
      <dl className={lg.measure}>
        {rows.map((r, i) => (
          <div key={r.label} data-on={i < meas || undefined}>
            <dt>{r.label}</dt>
            <dd data-c={i < meas && r.bad ? 'bad' : undefined}>{i < meas ? r.value : '?'}</dd>
          </div>
        ))}
      </dl>
      {meas < rows.length && (
        <button type="button" className={lg.measureBtn} onClick={onMeasure}>
          📏 재기 — {rows[meas].label}
        </button>
      )}
    </div>
  );
}

/** The cause: once everything is measured, pick one (a reply to each), then complete the explanation. */
export function Cause({ T, st, all, patch }: { T: SiteText; st: FlowState; all: boolean; patch: FlowPatch }) {
  if (!all) return null;
  const right = causeFound(T, st);
  return (
    <>
      <b className={lg.q}>{T.question}</b>
      <div className={lg.choices}>
        {T.choices.map((c, i) => (
          <button
            key={i}
            type="button"
            data-r={st.pick === i ? (c.ok ? 'ok' : 'no') : st.tried.includes(i) ? 'tried' : undefined}
            disabled={right}
            onClick={() => patch((x) => ({ pick: i, tried: c.ok || x.tried.includes(i) ? x.tried : [...x.tried, i] }))}
          >
            {NUM[i]} {c.t}
          </button>
        ))}
      </div>
      {st.pick !== null && (
        <p className={lg.note} data-r={right ? 'ok' : 'no'}>
          <b>{right ? '맞아요.' : '다시 생각해 보세요.'}</b> {T.choices[st.pick].fb.replace(/^맞아요\.\s*/, '')}
        </p>
      )}
      {right && <Blanks T={T} value={st.blanks} on={(blanks) => patch({ blanks })} />}
    </>
  );
}

/** What the 원인 찾기 foot says is still to do ('' when done). */
export function causeTodo(T: SiteText, st: FlowState, rows: number): string {
  if (st.meas < rows) return `측정 ${st.meas} / ${rows}`;
  if (!causeFound(T, st)) return '원인을 골라 보세요';
  return blanksOk(T, st.blanks) ? '' : '설명의 빈칸을 채워요';
}

/** The explanation to complete: the text with a choice in each gap. */
function Blanks({ T, value, on }: { T: SiteText; value: readonly (number | null)[]; on(v: (number | null)[]): void }) {
  const B = T.blanks;
  const parts = B.text.split(/([①②③④])/);
  return (
    <div className={lg.blanks}>
      <b>설명을 완성해 보세요</b>
      <p>
        {parts.map((t, k) => {
          const g = NUM.indexOf(t);
          if (g < 0) return <span key={k}>{t}</span>;
          const v = value[g];
          return (
            <select
              key={k}
              aria-label={`빈칸 ${t}`}
              value={v ?? ''}
              data-r={v === null ? undefined : v === B.answer[g] ? 'ok' : 'no'}
              onChange={(e) => on(value.map((x, i) => (i === g ? (e.target.value === '' ? null : +e.target.value) : x)))}
            >
              <option value="">{t} 고르기</option>
              {B.options[g].map((o, i) => (
                <option key={o} value={i}>
                  {o}
                </option>
              ))}
            </select>
          );
        })}
      </p>
    </div>
  );
}

/* --- 값 고치기 --------------------------------------------------------------------------- */

/** The numbers to work out before the operator panel opens. */
export function Calc({ T, st, patch }: { T: SiteText; st: FlowState; patch: FlowPatch }) {
  const C = T.calc;
  const ok = st.calcChecked && calcOk(T, st.calc);
  return (
    <div className={lg.calc} data-ok={ok || undefined}>
      <b>계산해 보세요</b>
      <p>{C.prompt}</p>
      {C.fields.map((f, i) => {
        const r = st.calcChecked && st.calc[i] !== '' ? near(st.calc[i], f.answer, f.tol) : null;
        return (
          <label key={f.label} data-r={r === null ? undefined : r ? 'ok' : 'no'}>
            <span>{f.label} =</span>
            <input
              inputMode="decimal"
              value={st.calc[i]}
              disabled={ok}
              onChange={(e) => patch((x) => ({ calc: x.calc.map((c, j) => (j === i ? e.target.value : c)), calcChecked: false }))}
            />
            <em>{f.unit}</em>
            {r !== null && <i>{r ? '✓' : '✗'}</i>}
          </label>
        );
      })}
      {!ok && (
        <button type="button" className={css.small} disabled={st.calc.some((c) => c.trim() === '')} onClick={() => patch({ calcChecked: true })}>
          확인
        </button>
      )}
      {st.calcChecked && !ok && <small className={lg.calcNo}>✗ 표시된 칸을 다시 계산해 보세요.</small>}
    </div>
  );
}

/** A prediction before running, and hints in three levels. */
export function PredictHints({ T, st, patch }: { T: SiteText; st: FlowState; patch: FlowPatch }) {
  return (
    <>
      <div className={lg.predict}>
        <b>가동 전에 예상해 보세요</b>
        <div>
          {T.predictions.map((t, i) => (
            <button key={i} type="button" aria-pressed={st.pred === i} onClick={() => patch({ pred: i })}>
              {t}
            </button>
          ))}
        </div>
      </div>
      <div className={lg.hints}>
        <button type="button" onClick={() => patch((x) => ({ hints: Math.min(3, x.hints + 1) }))} disabled={st.hints >= 3}>
          힌트 보기 ({st.hints}/3)
        </button>
        {T.hints.slice(0, st.hints).map((h) => (
          <p key={h.k} className={lg.hint}>
            <em>{h.k}</em>
            {h.t}
          </p>
        ))}
      </div>
    </>
  );
}

/* --- 다시 가동 · 비교 ---------------------------------------------------------------------- */

/** Whether the prediction came true (`hit`: the index of the prediction the run bears out), and why it may have missed. */
export function PredictionCheck({ T, st, hit, patch }: { T: SiteText; st: FlowState; hit: number | null; patch: FlowPatch }) {
  if (hit === null || st.pred === null) return null;
  const ok = st.pred === hit;
  return (
    <>
      <p className={lg.note} data-r={ok ? 'ok' : undefined}>
        <b>{ok ? '예상 적중!' : '예상과 달랐어요.'}</b> 내 예상: “{T.predictions[st.pred]}”. {ok ? '결과를 미리 맞혔어요.' : '왜 달랐을까요? 가장 가까운 생각을 골라 보세요.'}
      </p>
      {!ok && (
        <>
          <div className={lg.choices}>
            {T.missed.map((c, i) => (
              <button key={i} type="button" data-r={st.missed === i ? 'pick' : undefined} onClick={() => patch({ missed: i })}>
                {c.t}
              </button>
            ))}
          </div>
          {st.missed !== null && <p className={lg.note}>{T.missed[st.missed].fb}</p>}
        </>
      )}
    </>
  );
}

/* --- 해결 · 원리 -------------------------------------------------------------------------- */

/** Stars, the principle card (with the lab's figure), the check questions, the university card, the real robot. */
export function Done({ T, st, level, fig, patch }: { T: SiteText; st: FlowState; level: StudyLevel; fig: ReactNode; patch: FlowPatch }) {
  const stars = 3 - (st.hints >= 2 ? 1 : 0) - (st.tries > 2 ? 1 : 0);
  return (
    <>
      <div className={lg.stars}>
        {'★'.repeat(stars)}
        {'☆'.repeat(3 - stars)}
        <small>
          다시 가동 {st.tries}번 · 힌트 {st.hints}번
        </small>
      </div>
      <div className={lg.principle}>
        <small>원리 카드 · {T.principle.unit}</small>
        <b>{T.principle.title}</b>
        {fig}
        <p className={lg.formula}>{T.principle.formula}</p>
        {T.principle.lines.map((l) => (
          <p key={l}>{l}</p>
        ))}
        <div className={lg.pdfLinks}>
          {T.pdf.map((d) => (
            <a key={d.href} href={d.href} target="_blank" rel="noreferrer">
              PDF · {d.label}
            </a>
          ))}
        </div>
      </div>
      <Checks T={T} st={st} patch={patch} />
      {level === 'uni' && (
        <div className={lg.uni}>
          <small>대학 · 더 깊이</small>
          <b>{T.uni.title}</b>
          {T.uni.lines.map((l) => (
            <p key={l}>{l}</p>
          ))}
          {T.uni.code && <pre>{T.uni.code}</pre>}
        </div>
      )}
      <div className={lg.real}>
        <b>실제 로봇으로</b>
        <p>{T.real}</p>
        <p className={lg.safety}>
          <b>안전</b> {T.safety}
        </p>
      </div>
    </>
  );
}

/** The arrowhead the principle figures use (url(#siteArrow)). */
export function ArrowDef() {
  return (
    <defs>
      <marker id="siteArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M0,0 L10,5 L0,10 z" fill="currentColor" />
      </marker>
    </defs>
  );
}

/** Three check questions: a number, a choice (both marked), and one to write (the model answer after). */
function Checks({ T, st, patch }: { T: SiteText; st: FlowState; patch: FlowPatch }) {
  const set = (i: number, a: string, show = false) => patch((x) => ({ answers: x.answers.map((v, j) => (j === i ? a : v)), shown: x.shown.map((v, j) => (j === i ? show || (v && x.answers[i] === a) : v)) }));
  const show = (i: number) => patch((x) => ({ shown: x.shown.map((v, j) => (j === i ? true : v)) }));
  return (
    <div className={lg.checks}>
      <b>확인 문제</b>
      {T.checks.map((q, i) => {
        const a = st.answers[i];
        const res = st.shown[i] ? checkResult(q, a) : null;
        return (
          <div key={q.q} className={lg.check} data-r={res === null ? undefined : res ? 'ok' : 'no'}>
            <p>
              <b>{i + 1}.</b> {q.q}
            </p>
            {q.kind === 'num' && (
              <div className={lg.checkRow}>
                <input inputMode="decimal" value={a} aria-label={`${i + 1}번 답`} onChange={(e) => set(i, e.target.value)} />
                <em>{q.unit}</em>
                <button type="button" className={css.tiny} disabled={a.trim() === ''} onClick={() => show(i)}>
                  확인
                </button>
              </div>
            )}
            {q.kind === 'mc' && (
              <div className={lg.checkMc}>
                {q.choices!.map((c, k) => (
                  <button key={c} type="button" aria-pressed={a === String(k)} onClick={() => set(i, String(k), true)}>
                    {NUM[k]} {c}
                  </button>
                ))}
              </div>
            )}
            {q.kind === 'open' && (
              <>
                <textarea rows={2} value={a} aria-label={`${i + 1}번 답`} placeholder="내 생각을 적어 보세요" onChange={(e) => set(i, e.target.value)} />
                {!st.shown[i] && (
                  <button type="button" className={css.tiny} disabled={a.trim() === ''} onClick={() => show(i)}>
                    모범 답 보기
                  </button>
                )}
              </>
            )}
            {st.shown[i] && (
              <small>
                {res === null ? '모범 답 · ' : res ? '✓ 맞아요 · ' : '✗ 다시 보세요 · '}
                {q.explain}
              </small>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** A check question's answer: right, wrong, or null for one written in words. */
function checkResult(q: CheckQ, a: string): boolean | null {
  if (q.kind === 'num') return near(a, q.answer!, q.tol ?? 0.5);
  if (q.kind === 'mc') return a === String(q.answer);
  return null;
}

/* --- 실습 기록: everything the student did, on one page to print ----------------------------- */

export function RecordSheet({
  site,
  tone,
  texts,
  st,
  solved,
  level,
  onClose,
}: {
  /** The site and its work, as the sheet's header names them. */
  site: string;
  /** The site's colour class (site.module.css .site / .factory). */
  tone: string;
  texts: Record<SiteProblem, SiteText>;
  st: Record<SiteProblem, FlowState>;
  solved: Record<SiteProblem, boolean>;
  level: StudyLevel;
  onClose(): void;
}) {
  const date = useMemo(() => new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' }), []);
  return createPortal(
    <div className={`${lg.recordBack} ${tone} logi-record`} role="dialog" aria-modal="true" aria-label="실습 기록">
      <div className={lg.record}>
        <header className={lg.recordHead}>
          <div>
            <small>산업단지 · {site} · myCobot 280</small>
            <b>실습 기록지</b>
          </div>
          <div className={lg.recordWho}>
            <span>날짜 {date}</span>
            <span>과정 {level === 'uni' ? '대학' : '고등'}</span>
            <span>학번 · 이름 ____________________</span>
          </div>
        </header>
        {PROBS.map((p) => {
          const T = texts[p];
          const s = st[p];
          const right = T.choices.findIndex((c) => c.ok);
          const firstPick = s.tried[0] ?? (s.pick === right ? right : null);
          return (
            <section key={p} className={lg.recordProb}>
              <h3>
                문제 {p} · {T.title} <small>{solved[p] ? '✓ 해결' : s.reached > 0 ? '진행 중' : '아직'}</small>
              </h3>
              <dl>
                <dt>처음 고른 원인</dt>
                <dd>{firstPick === null ? '—' : `${NUM[firstPick]} ${T.choices[firstPick].t}${firstPick === right ? ' (정답)' : ''}`}</dd>
                <dt>원인 고르기</dt>
                <dd>{s.pick === right ? `${s.tried.length + 1}번 만에 찾음` : '—'}</dd>
                <dt>계산</dt>
                <dd>{s.calcChecked ? T.calc.fields.map((f, i) => `${f.label} = ${s.calc[i] || '—'} ${f.unit}`).join(' / ') : '—'}</dd>
                <dt>예상</dt>
                <dd>
                  {s.pred === null ? '—' : T.predictions[s.pred]}
                  {s.missed !== null && ` → 다른 이유: ${T.missed[s.missed].t}`}
                </dd>
                <dt>힌트</dt>
                <dd>{s.hints}번</dd>
              </dl>
              {s.log.length > 0 && (
                <table>
                  <thead>
                    <tr>
                      <th>다시 가동</th>
                      <th>넣은 값</th>
                      <th>결과</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.log.map((a, i) => (
                      <tr key={i}>
                        <td>
                          {i + 1} · {a.time}
                        </td>
                        <td>{a.values}</td>
                        <td>{a.note}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <ol className={lg.recordChecks}>
                {T.checks.map((q, i) => {
                  const a = s.answers[i];
                  const r = s.shown[i] ? checkResult(q, a) : null;
                  const shownA = q.kind === 'mc' && a !== '' ? `${NUM[+a]} ${q.choices![+a]}` : a;
                  return (
                    <li key={q.q}>
                      {q.q}
                      <span>
                        {shownA ? `답: ${shownA}${q.kind === 'num' ? ` ${q.unit}` : ''}` : '답: ____________'}
                        {r !== null && (r ? ' ✓' : ' ✗')}
                      </span>
                    </li>
                  );
                })}
              </ol>
            </section>
          );
        })}
        <footer className={lg.recordFoot}>
          <span>오늘 알게 된 것 한 줄: ______________________________________________</span>
          <span>선생님 확인 ________</span>
        </footer>
        <div className={lg.recordBtns}>
          <button type="button" className={css.ghost} onClick={onClose}>
            닫기
          </button>
          <button type="button" className={`${css.primary} ${lg.siteBtn}`} onClick={() => window.print()}>
            인쇄 · PDF로 저장
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
