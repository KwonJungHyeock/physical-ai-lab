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
import type { CheckQ, SiteProblem, SiteStepId, SiteText } from '@/engine/education/lab/siteText';

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

/** The cause: pick one (a reply to each; once the right one is found the others close). */
function ChoicePick({ T, st, patch }: { T: SiteText; st: FlowState; patch: FlowPatch }) {
  const right = causeFound(T, st);
  return (
    <>
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
    </>
  );
}

/** The explanation to complete: the text with a choice in each gap. */
function Blanks({ T, value, on }: { T: SiteText; value: readonly (number | null)[]; on(v: (number | null)[]): void }) {
  const B = T.blanks;
  const parts = B.text.split(/([①②③④])/);
  return (
    <div className={lg.blanks}>
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
function Calc({ T, st, patch }: { T: SiteText; st: FlowState; patch: FlowPatch }) {
  const C = T.calc;
  const ok = st.calcChecked && calcOk(T, st.calc);
  return (
    <div className={lg.calc} data-ok={ok || undefined}>
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

/** A prediction before running. */
function Predict({ T, st, patch }: { T: SiteText; st: FlowState; patch: FlowPatch }) {
  return (
    <div className={lg.predict}>
      <div>
        {T.predictions.map((t, i) => (
          <button key={i} type="button" aria-pressed={st.pred === i} onClick={() => patch({ pred: i })}>
            {t}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Hints in three levels (each one costs a little on the stars). */
function Hints({ T, st, patch }: { T: SiteText; st: FlowState; patch: FlowPatch }) {
  return (
    <div className={lg.hints}>
      <button type="button" onClick={() => patch((x) => ({ hints: Math.min(3, x.hints + 1) }))} disabled={st.hints >= 3}>
        💡 막히면 힌트 보기 ({st.hints}/3)
      </button>
      {T.hints.slice(0, st.hints).map((h) => (
        <p key={h.k} className={lg.hint}>
          <em>{h.k}</em>
          {h.t}
        </p>
      ))}
    </div>
  );
}

/* --- 다시 가동 · 비교 ---------------------------------------------------------------------- */

/** Whether the prediction came true (`hit`: the index of the prediction the run bears out), and why it may have missed. */
function PredictionCheck({ T, st, hit, patch }: { T: SiteText; st: FlowState; hit: number | null; patch: FlowPatch }) {
  if (hit === null || st.pred === null) return null;
  const ok = st.pred === hit;
  return (
    <>
      <p className={lg.note} data-r={ok ? 'ok' : undefined}>
        <b>{ok ? '예상 적중!' : '예상과 달랐어요.'}</b> 내 예상: “{T.predictions[st.pred]}”. {ok ? '결과를 미리 맞혔어요.' : '왜 달랐을까요? 가장 가까운 생각을 아래에서 골라 보세요.'}
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

/** The principle card, with the lab's figure and the theory PDFs. */
function PrincipleCard({ T, fig }: { T: SiteText; fig: ReactNode }) {
  return (
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
  );
}

/* --- the panel: every step as a short manual ------------------------------------------- */

type SecState = 'now' | 'done' | 'todo' | 'info';

/** A numbered part of a step: what to do (title), whose turn it is, and — while it waits — why. */
function Sec({ n, title, state, wait, children }: { n: number; title: string; state: SecState; wait?: string; children?: ReactNode }) {
  return (
    <section className={lg.sec} data-s={state}>
      <header>
        <i>{state === 'done' ? '✓' : n}</i>
        <b>{title}</b>
        {state === 'now' && <em>지금 할 일</em>}
      </header>
      {state === 'todo' ? wait && <p className={lg.secWait}>{wait}</p> : children}
    </section>
  );
}

/** The step's parts in one line, so a first-timer sees the whole way before starting. */
function Roadmap({ parts }: { parts: readonly { title: string; state: SecState }[] }) {
  return (
    <ol className={lg.roadmap} aria-label="이 단계에서 할 일">
      {parts.map((p, i) => (
        <li key={p.title} data-s={p.state}>
          <i>{p.state === 'done' ? '✓' : i + 1}</i>
          {p.title}
        </li>
      ))}
    </ol>
  );
}

/** What each step is for, in one sentence. */
const STEP_GUIDE: Record<SiteStepId, string> = {
  brief: '오늘 현장에서 할 일을 읽고, 지금 프로그램 그대로 라인을 한 번 돌려 봐요.',
  run: '무엇이 잘못됐는지 직접 봐요. 문제가 생기는 순간은 느리게, 가까이 보여 줘요.',
  cause: '추측하지 말고 먼저 재요. 잰 값으로 원인을 고르고, 왜 그런지 말로 정리해요.',
  fix: '숫자를 먼저 계산하고, 그 값을 조작반에 넣어요. 가동하기 전에 결과를 예상해요.',
  compare: '고치기 전과 후를 숫자로 비교하고, 내 예상이 맞았는지 확인해요.',
  done: '무엇을 배웠는지 원리로 정리하고, 확인 문제로 스스로 점검해요.',
};

/** What a lab puts into the shared steps: its own cards, operator panel and runs. */
export interface SitePanelProps {
  T: SiteText;
  st: FlowState & { step: SiteStepId };
  /** The person in charge at this site (김 주임, 박 반장 …). */
  boss: string;
  level: StudyLevel;
  solved: boolean;
  busy: boolean;
  /** 작업 지시: the work order's standards (a <dl> card) and the program as the line has it. */
  order: ReactNode;
  program: string;
  /** 가동 · 문제: the run's headline, what it did, and its log. */
  runTitle: string;
  runResult: ReactNode;
  playing: boolean;
  /** 원인 찾기: the measurements, and anything shown with them (a graph). */
  rows: readonly MeasureRow[];
  measureExtra?: ReactNode;
  /** 값 고치기: the operator panel. */
  fixTitle: string;
  hmi: ReactNode;
  /** 다시 가동 · 비교: before and after, which prediction the run bears out, whether it passed (and if not, why). */
  compare: ReactNode;
  hit: number | null;
  pass: boolean;
  notYet?: string | null;
  /** 해결 · 원리: the principle figure, and the next button's words. */
  fig: ReactNode;
  nextLabel: string;
  patch: FlowPatch;
  onRunBefore(): void;
  onRunFix(): void;
  onStep(s: SiteStepId): void;
  onRecord(): void;
  onNext(): void;
}

export function SitePanel(p: SitePanelProps) {
  const { T, st, busy } = p;
  const guide = <p className={lg.guide}>{STEP_GUIDE[st.step]}</p>;
  switch (st.step) {
    case 'brief': {
      const parts = [
        { title: '상황 읽기', state: 'info' as const },
        { title: '작업 기준 확인', state: 'info' as const },
        { title: '라인 가동', state: 'now' as const },
      ];
      return (
        <>
          <Head eyebrow={`${T.day} · 작업 지시서 ${T.order}`} title={T.orderTitle} solved={p.solved} />
          <div className={bodyClass}>
            {guide}
            <Roadmap parts={parts} />
            <Sec n={1} title="상황 읽기" state="info">
              <p className={css.story}>{T.brief}</p>
              <Boss name={p.boss} line={T.boss} />
              <Goals goals={T.goals} />
            </Sec>
            <Sec n={2} title="작업 기준 확인" state="info">
              {p.order}
              <p className={lg.note}>
                <b>지금 작업 프로그램</b> · {p.program}
              </p>
            </Sec>
            <Sec n={3} title="라인 가동" state="now">
              <p className={lg.secText}>
                아래 <b>[▶ 라인 가동]</b>을 눌러요. 값은 아직 바꾸지 않아요 — 무엇이 문제인지는 다음 단계에서 찾아요.
              </p>
            </Sec>
          </div>
          <div className={css.foot}>
            <span />
            <SiteBtn disabled={busy} onClick={p.onRunBefore}>
              {busy ? '계산 중…' : '▶ 라인 가동'}
            </SiteBtn>
          </div>
        </>
      );
    }
    case 'run': {
      const seen = !p.playing;
      const parts = [
        { title: '문제 장면 보기', state: seen ? ('done' as const) : ('now' as const) },
        { title: '생각해 보기', state: seen ? ('now' as const) : ('todo' as const) },
        { title: '결과 · 기록 확인', state: seen ? ('now' as const) : ('todo' as const) },
      ];
      return (
        <>
          <Head eyebrow="가동 결과" title={p.runTitle} solved={p.solved} />
          <div className={bodyClass}>
            {guide}
            <Roadmap parts={parts} />
            <Sec n={1} title="문제 장면 보기" state={parts[0].state}>
              <p className={css.story}>{T.happened}</p>
              <p className={lg.secText}>3D 화면에서 다시 보려면 오른쪽 위 <b>[▶ 재생]</b>. 끌면 돌려 보고, 휠로 확대돼요.</p>
            </Sec>
            <Sec n={2} title="생각해 보기" state={parts[1].state} wait="장면이 끝나면 열려요.">
              <Ask ask={T.ask} />
            </Sec>
            <Sec n={3} title="결과 · 기록 확인" state={parts[2].state} wait="장면이 끝나면 열려요.">
              {p.runResult}
            </Sec>
          </div>
          <div className={css.foot}>
            <span className={lg.footNote}>{p.playing ? '공정을 돌려 보는 중…' : '다 봤으면 다음으로'}</span>
            <SiteBtn onClick={() => p.onStep('cause')}>원인 찾으러 가기 →</SiteBtn>
          </div>
        </>
      );
    }
    case 'cause': {
      const n = p.rows.length;
      const measured = st.meas >= n;
      const found = causeFound(T, st);
      const explained = found && blanksOk(T, st.blanks);
      const state = (done: boolean, open: boolean): SecState => (done ? 'done' : open ? 'now' : 'todo');
      const parts = [
        { title: `재기 (${Math.min(st.meas, n)}/${n})`, state: state(measured, true) },
        { title: '원인 고르기', state: state(found, measured) },
        { title: '설명 완성', state: state(explained, found) },
      ];
      return (
        <>
          <Head eyebrow="원인 찾기" title={T.question} solved={p.solved} />
          <div className={bodyClass}>
            {guide}
            <Roadmap parts={parts} />
            <Sec n={1} title={parts[0].title} state={parts[0].state}>
              <p className={lg.secText}>{T.look}</p>
              <Measure rows={p.rows} meas={st.meas} onMeasure={() => p.patch((x) => ({ meas: Math.min(n, x.meas + 1) }))} />
              {p.measureExtra}
            </Sec>
            <Sec n={2} title="원인 고르기" state={parts[1].state} wait={`위에서 ${n}가지를 모두 재면 열려요.`}>
              <p className={lg.secText}>
                <b>{T.question}</b> 잰 값을 보고 골라요. 틀려도 괜찮아요 — 고를 때마다 이유를 알려 줘요.
              </p>
              <ChoicePick T={T} st={st} patch={p.patch} />
            </Sec>
            <Sec n={3} title="설명 완성" state={parts[2].state} wait="원인을 맞히면 열려요.">
              <p className={lg.secText}>빈칸마다 알맞은 말을 골라 설명을 완성해요.</p>
              <Blanks T={T} value={st.blanks} on={(blanks) => p.patch({ blanks })} />
            </Sec>
          </div>
          <div className={css.foot}>
            <span className={lg.footNote}>{!explained ? '①②③을 마치면 다음으로' : '다 됐어요'}</span>
            <SiteBtn disabled={!explained} onClick={() => p.onStep('fix')}>
              값 고치러 가기 →
            </SiteBtn>
          </div>
        </>
      );
    }
    case 'fix': {
      const ok = st.calcChecked && calcOk(T, st.calc);
      const parts = [
        { title: '계산하기', state: ok ? ('done' as const) : ('now' as const) },
        { title: '조작반에서 값 바꾸기', state: ok ? ('now' as const) : ('todo' as const) },
        { title: '결과 예상하기', state: !ok ? ('todo' as const) : st.pred !== null ? ('done' as const) : ('now' as const) },
      ];
      return (
        <>
          <Head eyebrow="값 고치기" title={p.fixTitle} solved={p.solved} />
          <div className={bodyClass}>
            {guide}
            <Roadmap parts={parts} />
            <Sec n={1} title="계산하기" state={parts[0].state}>
              <Calc T={T} st={st} patch={p.patch} />
            </Sec>
            <Sec n={2} title="조작반에서 값 바꾸기" state={parts[1].state} wait="계산이 맞으면 조작반이 열려요.">
              <p className={lg.secText}>{T.calc.after}</p>
              {p.hmi}
              <Hints T={T} st={st} patch={p.patch} />
            </Sec>
            <Sec n={3} title="결과 예상하기" state={parts[2].state} wait="조작반이 열리면 함께 열려요.">
              <p className={lg.secText}>가동하기 전에, 이 값이면 어떻게 될지 하나 골라요.</p>
              <Predict T={T} st={st} patch={p.patch} />
            </Sec>
          </div>
          <div className={css.foot}>
            <span className={lg.footNote}>{!ok ? '① 계산부터' : st.pred === null ? '③ 예상을 고르면 가동할 수 있어요' : '준비됐어요'}</span>
            <SiteBtn disabled={busy || !ok || st.pred === null} onClick={p.onRunFix}>
              {busy ? '계산 중…' : '▶ 다시 가동'}
            </SiteBtn>
          </div>
        </>
      );
    }
    case 'compare': {
      const hitOk = p.hit !== null && st.pred === p.hit;
      const reflected = hitOk || st.missed !== null;
      const parts = [
        { title: '전과 후 비교', state: p.playing ? ('now' as const) : ('done' as const) },
        { title: '내 예상 확인', state: p.playing ? ('todo' as const) : reflected ? ('done' as const) : ('now' as const) },
        { title: p.pass ? '해결 확인' : '다시 고치기', state: p.playing ? ('todo' as const) : ('now' as const) },
      ];
      return (
        <>
          <Head eyebrow="다시 가동 · 비교" title={p.pass ? '기준을 모두 넘었어요' : '아직 기준에 못 미쳐요'} solved={p.solved} />
          <div className={bodyClass}>
            {guide}
            <Roadmap parts={parts} />
            <Sec n={1} title="전과 후 비교" state={parts[0].state}>
              {p.compare}
            </Sec>
            <Sec n={2} title="내 예상 확인" state={parts[1].state} wait="가동이 끝나면 열려요.">
              <PredictionCheck T={T} st={st} hit={p.hit} patch={p.patch} />
            </Sec>
            <Sec n={3} title={parts[2].title} state={parts[2].state} wait="가동이 끝나면 열려요.">
              {p.pass ? (
                <p className={lg.secText}>
                  모든 기준을 넘었어요. 아래 <b>[해결 확인 →]</b>으로 원리를 정리해요.
                </p>
              ) : (
                <p className={`${lg.note} ${lg.siteNote}`}>
                  {p.notYet ?? '기준에 못 미친 항목이 있어요.'} 아래 <b>[← 값 다시 고치기]</b>로 돌아가요.
                </p>
              )}
            </Sec>
          </div>
          <div className={css.foot}>
            <button type="button" className={css.ghost} onClick={() => p.onStep('fix')}>
              ← 값 다시 고치기
            </button>
            <SiteBtn disabled={!p.pass} onClick={() => p.onStep('done')}>
              해결 확인 →
            </SiteBtn>
          </div>
        </>
      );
    }
    case 'done': {
      const answered = st.shown.filter(Boolean).length;
      const stars = 3 - (st.hints >= 2 ? 1 : 0) - (st.tries > 2 ? 1 : 0);
      const parts = [
        { title: '원리 정리', state: 'done' as const },
        { title: `확인 문제 (${answered}/${T.checks.length})`, state: answered >= T.checks.length ? ('done' as const) : ('now' as const) },
        { title: '실제 로봇으로', state: 'info' as const },
        { title: '기록지 내기', state: 'info' as const },
      ];
      return (
        <>
          <Head eyebrow="해결 · 원리" title={`${T.title} — 해결했어요`} solved={p.solved} />
          <div className={bodyClass}>
            <div className={lg.stars}>
              {'★'.repeat(stars)}
              {'☆'.repeat(3 - stars)}
              <small>
                다시 가동 {st.tries}번 · 힌트 {st.hints}번
              </small>
            </div>
            {guide}
            <Roadmap parts={parts} />
            <Sec n={1} title="원리 정리" state="info">
              <PrincipleCard T={T} fig={p.fig} />
            </Sec>
            <Sec n={2} title={parts[1].title} state={parts[1].state}>
              <Checks T={T} st={st} patch={p.patch} />
            </Sec>
            {p.level === 'uni' && (
              <Sec n={2} title="대학 · 더 깊이" state="info">
                <div className={lg.uni}>
                  <b>{T.uni.title}</b>
                  {T.uni.lines.map((l) => (
                    <p key={l}>{l}</p>
                  ))}
                  {T.uni.code && <pre>{T.uni.code}</pre>}
                </div>
              </Sec>
            )}
            <Sec n={3} title="실제 로봇으로" state="info">
              <div className={lg.real}>
                <p>{T.real}</p>
                <p className={lg.safety}>
                  <b>안전</b> {T.safety}
                </p>
              </div>
            </Sec>
            <Sec n={4} title="기록지 내기" state="info">
              <p className={lg.secText}>
                아래 <b>[실습 기록 · 인쇄]</b>로 이 현장에서 한 일을 한 장으로 인쇄하거나 PDF로 저장해요.
              </p>
            </Sec>
          </div>
          <div className={css.foot}>
            <button type="button" className={css.ghost} onClick={p.onRecord}>
              실습 기록 · 인쇄
            </button>
            <SiteBtn onClick={p.onNext}>{p.nextLabel}</SiteBtn>
          </div>
        </>
      );
    }
  }
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
