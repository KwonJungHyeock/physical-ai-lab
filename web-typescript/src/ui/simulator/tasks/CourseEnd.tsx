'use client';

/**
 * 입문 과정 6장 마무리 (장별 가이드라인 v1): after the last 수행평가, three pages with no 3D scene —
 * 6-1 결과 확인, 6-2 수업 후기, 6-3 학습 기록 한 장. The 후기 stays in this browser; the name and the
 * class are typed on 6-3 only, go into the one sheet saved, and are kept nowhere else.
 * The results (수정 지시서 v4 파트 1-7): the course's 수행평가 — 8차시: 중간 · 마무리, each with its O · X,
 * its mission and 상 · 중 · 하; 4차시: each 차시's mission, then 마무리 with whether its mission passed.
 * Its words: the 문구 파일's end (courseText.ts endText). No 교안 쪽 (수정 지시서 v4 파트 2-1).
 */

import { useState } from 'react';

import { subById } from '@/engine/simulator/cell/course';
import type { Pt } from '@/engine/simulator/cell/courseDraw';
import { buttonName, endText } from '@/engine/simulator/cell/courseText';

import css from './courseEnd.module.css';

export interface TestRow {
  /** '3-5' and '중간 수행평가'; its 차시 in the course. */
  id: string;
  name: string;
  lesson: number;
  /** O · X right of 5 (null: not taken, or the course has the mission only). */
  right: number | null;
  /** The mission: 통과 · 아직 · 안 함 (and how, for 마무리). */
  mission: string;
  /** 상 · 중 · 하 (임시), once the 수행평가 is over (a course with O · X). */
  level: string | null;
}

export interface Review {
  stars: number;
  best: string;
  hard: string;
  real: string;
  more: string;
}
export const REVIEW_START: Review = { stars: 0, best: '', hard: '', real: '', more: '' };
export const REVIEW_MAX = 100;

interface Props {
  title: string;
  /** '8차시' · '4차시'. */
  plan: string;
  /** The course's 수행평가 (8차시: two, with their O · X; 4차시: 마무리, its mission only). */
  tests: readonly TestRow[];
  /** The 수행평가 have their O · X (8차시). */
  ox: boolean;
  /** 4차시: each 차시's mission. */
  missions?: readonly { n: number; id: string; title: string; passed: boolean }[];
  done: { got: number; of: number };
  /** The 절 to pick the most fun from. */
  subs: readonly { id: string; title: string }[];
  /** 5-5 run on the real robot (④ is asked only then). */
  real: boolean;
  /** 5-4's card (card mm); null: 5-4 is not in this course (4차시). */
  card: readonly (readonly Pt[])[] | null;
  copyright: string;
  review: Review;
  onReview(r: Review): void;
  saved: boolean;
  onSaved(): void;
  onClose(): void;
  /** The page to open at (0 · 1 · 2: 6-1 · 6-2 · 6-3; the list opens one of them). */
  start?: number;
}

// 6장's three pages: their names from the table (mycobot-280-1.json), as every 절's.
const PAGES = (['6-1', '6-2', '6-3'] as const).map((id) => ({ id, title: subById(id)?.title ?? id }));

const esc = (t: string) => t.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch] ?? ch);

/** 5-4's card as a picture (SVG, card mm: 120 × 80, y up). */
function cardSvg(card: readonly (readonly Pt[])[], w = 240): string {
  const k = w / 120;
  const lines = card
    .map((s) => `<polyline fill="none" stroke="#141a33" stroke-width="${(0.9 * k).toFixed(2)}" stroke-linecap="round" stroke-linejoin="round" points="${s.map(([u, v]) => `${(u * k).toFixed(1)},${((80 - v) * k).toFixed(1)}`).join(' ')}"/>`)
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${80 * k}" viewBox="0 0 ${w} ${80 * k}"><rect x="0.5" y="0.5" width="${w - 1}" height="${80 * k - 1}" fill="#fbfaf6" stroke="#555"/>${lines}</svg>`;
}

/** A 후기 question's name without its circled number ('③ 어려웠던 점…' → '어려웠던 점…'): the printed sheet's. */
const unnumbered = (t: string) => t.replace(/^[①-⑳]\s*/, '');

/** The one sheet (printed: one A4 page): the course, who, the results, the 후기, the card, the copyright line. */
export function sheetHtml(p: Props, who: { name: string; cls: string; day: string }): string {
  const td = (v: string, span = 1) => `<td${span > 1 ? ` colspan="${span}"` : ''}>${esc(v)}</td>`;
  const none = endText('none');
  const rows = p.ox
    ? p.tests.map((t) => `<tr>${td(`${t.id} ${t.name}`)}${td(t.right == null ? none : `${t.right} / 5`)}${td(t.mission)}${td(t.level ?? none)}</tr>`).join('')
    : [
        ...(p.missions ?? []).map((m) => `<tr>${td(endText('lessonN', { n: m.n }))}${td(`${m.id} ${m.title}`, 2)}${td(endText(m.passed ? 'passed' : 'notYet'))}</tr>`),
        ...p.tests.map((t) => `<tr>${td(endText('lessonN', { n: t.lesson }))}${td(`${t.id} ${endText('missionOnly', { name: t.name })}`, 2)}${td(t.mission)}</tr>`),
      ].join('');
  const th = (v: string, span = 1) => `<th${span > 1 ? ` colspan="${span}"` : ''}>${esc(v)}</th>`;
  const head = p.ox ? `<tr>${th(endText('testCol'))}${th(endText('oxCol'))}${th(endText('missionCol'))}${th(endText('levelCol'))}</tr>` : `<tr>${th(endText('lessonCol'))}${th(endText('missionCol'), 2)}${th(endText('resultCol'))}</tr>`;
  const r = p.review;
  const line = (k: string, v: string) => (v.trim() ? `<p><b>${k}</b> ${esc(v.trim())}</p>` : '');
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${esc(endText('sheetTitle'))}</title><style>
@page{size:A4;margin:14mm}body{font-family:'Noto Sans KR','Malgun Gothic',sans-serif;color:#111;font-size:13px;word-break:keep-all;margin:0}
h1{font-size:19px;margin:0 0 6px}.who{display:flex;flex-wrap:wrap;gap:18px;border-bottom:2px solid #111;padding-bottom:6px;margin-bottom:12px}
table{width:calc(100% - 1px);border-collapse:collapse;margin:6px 0 10px}th,td{border:1px solid #999;padding:6px;text-align:left}th{background:#eee}
h2{font-size:15px;margin:14px 0 4px}p{margin:3px 0}.tot{font-weight:700}.copy{margin-top:22px;padding-top:6px;border-top:1px solid #999;font-size:11px;color:#333}</style></head><body>
<h1>${esc(p.title)}</h1>
<div class="who"><span>${esc(endText('plan'))} <b>${esc(p.plan)}</b></span><span>${esc(endText('who'))} <b>${esc(who.name) || '__________'}</b></span><span>${esc(endText('class'))} <b>${esc(who.cls) || '______'}</b></span><span>${esc(endText('day'))} <b>${esc(who.day)}</b></span></div>
<h2>${esc(endText(p.ox ? 'sheetResults' : 'sheetMissions'))}</h2><table>${head}${rows}</table>
<p class="tot">${esc(endText('total'))} ${p.done.got} / ${p.done.of} ${esc(endText('totalNote'))}</p>
<h2>${esc(endText('sheetReview'))}</h2>
<p><b>${esc(endText('starsName'))}</b> ${'★'.repeat(r.stars)}${'☆'.repeat(5 - r.stars)}</p>
${line(endText('bestName'), p.subs.find((s) => s.id === r.best) ? `${r.best} ${p.subs.find((s) => s.id === r.best)!.title}` : '')}
${line(unnumbered(endText('hard')), r.hard)}${p.real ? line(unnumbered(endText('realDiff')), r.real) : ''}${line(unnumbered(endText('more')), r.more)}
${p.card ? `<h2>${esc(endText('sheetCard'))}</h2>${p.card.length ? cardSvg(p.card, 360) : `<p>${esc(endText('sheetCardNone'))}</p>`}` : ''}
<p class="copy">${esc(p.copyright)}</p></body></html>`;
}

function Results(p: Props) {
  const none = endText('none');
  return (
    <>
      {p.ox ? (
        <table className={css.table}>
          <thead>
            <tr>
              <th>{endText('testCol')}</th>
              <th>{endText('oxCol')}</th>
              <th>{endText('missionCol')}</th>
              <th>{endText('levelCol')}</th>
            </tr>
          </thead>
          <tbody>
            {p.tests.map((t) => (
              <tr key={t.id}>
                <td>
                  {t.id} {t.name}
                </td>
                <td>{t.right == null ? none : `${t.right} / 5`}</td>
                <td>{t.mission}</td>
                <td>{t.level ?? none}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <table className={css.table}>
          <thead>
            <tr>
              <th>{endText('lessonCol')}</th>
              <th>{endText('missionCol')}</th>
              <th>{endText('resultCol')}</th>
            </tr>
          </thead>
          <tbody>
            {(p.missions ?? []).map((m) => (
              <tr key={m.id}>
                <td>{endText('lessonN', { n: m.n })}</td>
                <td>
                  {m.id} {m.title}
                </td>
                <td>{endText(m.passed ? 'passed' : 'notYet')}</td>
              </tr>
            ))}
            {/* 4차시: 마무리 수행평가, its mission only — whether it passed (no 상 · 중 · 하). */}
            {p.tests.map((t) => (
              <tr key={t.id}>
                <td>{endText('lessonN', { n: t.lesson })}</td>
                <td>
                  {t.id} {endText('missionOnly', { name: t.name })}
                </td>
                <td>{t.mission}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className={css.total}>
        {endText('total')}{' '}
        <b>
          {p.done.got} / {p.done.of}
        </b>{' '}
        <small>{endText('totalNote')}</small>
      </p>
    </>
  );
}

export default function CourseEnd(p: Props) {
  const [page, setPage] = useState(p.start ?? 0);
  const [name, setName] = useState('');
  const [cls, setCls] = useState('');
  const [day, setDay] = useState(() => new Date().toLocaleDateString('ko-KR'));
  const r = p.review;
  const set = (x: Partial<Review>) => p.onReview({ ...r, ...x });
  const reviewed = r.stars > 0 && !!r.best;
  // The browser's print window over the one sheet (its own page in a hidden frame): print it, or 'PDF로 저장'.
  const save = () => {
    document.querySelectorAll('iframe[data-sheet]').forEach((f) => f.remove());
    const f = document.createElement('iframe');
    f.dataset.sheet = '';
    f.setAttribute('aria-hidden', 'true');
    f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
    f.srcdoc = sheetHtml(p, { name: name.trim(), cls: cls.trim(), day: day.trim() });
    f.onload = () => {
      const w = f.contentWindow;
      if (!w) return;
      w.addEventListener('afterprint', () => window.setTimeout(() => f.remove(), 0));
      w.focus();
      w.print();
      p.onSaved();
    };
    document.body.appendChild(f);
  };
  const text = (k: 'hard' | 'real' | 'more', label: string, need?: string) => (
    <label className={css.field}>
      <span>
        {label}{' '}
        <small>
          {need ?? endText('optional')} · {endText('count', { n: r[k].length, max: REVIEW_MAX })}
        </small>
      </span>
      <input value={r[k]} maxLength={REVIEW_MAX} onChange={(e) => set({ [k]: e.target.value })} aria-label={label} />
    </label>
  );
  return (
    <div className={css.page} role="dialog" aria-label={endText('window')}>
      <div className={css.sheet}>
        <nav className={css.steps} aria-label="6장">
          {PAGES.map((x, i) => (
            <span key={x.id} data-on={i === page || undefined} data-done={i < page || undefined}>
              {x.id} {x.title}
            </span>
          ))}
          <button type="button" className={css.close} onClick={p.onClose} aria-label={endText('close')}>
            ×
          </button>
        </nav>
        {page === 0 && (
          <section>
            <h2>
              {PAGES[0].id} {PAGES[0].title}
            </h2>
            <p className={css.lead}>
              {p.title} · {p.plan}
            </p>
            <Results {...p} />
          </section>
        )}
        {page === 1 && (
          <section>
            <h2>
              {PAGES[1].id} {PAGES[1].title}
            </h2>
            <p className={css.lead}>{endText('reviewLead')}</p>
            <div className={css.field}>
              <span>
                {endText('stars')} <small>{endText('must')}</small>
              </span>
              <div className={css.stars} role="radiogroup" aria-label={endText('starsName')}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} type="button" role="radio" aria-checked={r.stars === n} aria-label={endText('starN', { n })} data-on={n <= r.stars || undefined} onClick={() => set({ stars: n })}>
                    {n <= r.stars ? '★' : '☆'}
                  </button>
                ))}
              </div>
            </div>
            <label className={css.field}>
              <span>
                {endText('best')} <small>{endText('must')}</small>
              </span>
              <select value={r.best} onChange={(e) => set({ best: e.target.value })} aria-label={endText('bestName')}>
                <option value="">{endText('bestPick')}</option>
                {p.subs.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.id} {s.title}
                  </option>
                ))}
              </select>
            </label>
            {text('hard', endText('hard'))}
            {p.real && text('real', endText('realDiff'), endText('realNeed'))}
            {text('more', endText('more'))}
          </section>
        )}
        {page === 2 && (
          <section>
            <h2>
              {PAGES[2].id} {PAGES[2].title}
            </h2>
            <p className={css.lead}>{endText('sheetLead')}</p>
            <div className={css.who}>
              <label>
                {endText('who')} <input value={name} maxLength={20} onChange={(e) => setName(e.target.value)} aria-label={endText('who')} />
              </label>
              <label>
                {endText('class')} <input value={cls} maxLength={12} onChange={(e) => setCls(e.target.value)} aria-label={endText('class')} />
              </label>
              <label>
                {endText('day')} <input value={day} maxLength={20} onChange={(e) => setDay(e.target.value)} aria-label={endText('day')} />
              </label>
            </div>
            <div className={css.preview}>
              <b>{p.title}</b> · {p.plan}
              <div className={css.cols}>
                <div>
                  <Results {...p} />
                </div>
                <div>
                  <p>
                    {endText('review')} {'★'.repeat(r.stars)}
                    {'☆'.repeat(5 - r.stars)}
                    <br />
                    {endText('bestName')} · {p.subs.find((s) => s.id === r.best)?.title ?? endText('none')}
                  </p>
                  {p.card && <div className={css.card} dangerouslySetInnerHTML={{ __html: p.card.length ? cardSvg(p.card, 280) : `<p>${esc(endText('cardNone'))}</p>` }} />}
                </div>
              </div>
              <p className={css.copy}>{p.copyright}</p>
            </div>
          </section>
        )}
        <footer className={css.foot}>
          {page > 0 && (
            <button type="button" className={css.ghost} onClick={() => setPage(page - 1)}>
              {endText('back')}
            </button>
          )}
          <span>{page === 1 && !reviewed ? endText('needReview') : page === 2 ? endText(p.saved ? 'printed' : 'printHint') : ''}</span>
          {page < 2 ? (
            <button type="button" className={css.key} data-step="end-next" disabled={page === 1 && !reviewed} onClick={() => setPage(page + 1)}>
              {buttonName('next')}
            </button>
          ) : (
            <button type="button" className={css.key} data-step="end-save" onClick={save}>
              {endText('save')}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
