'use client';

/**
 * 입문 과정 6장 마무리 (장별 가이드라인 v1): after the last 수행평가, three pages with no 3D scene —
 * 6-1 결과 확인, 6-2 수업 후기, 6-3 학습 기록 한 장. The 후기 stays in this browser; the name and the
 * class are typed on 6-3 only, go into the one sheet saved, and are kept nowhere else.
 */

import { useState } from 'react';

import { pagesText, subById } from '@/engine/simulator/cell/course';
import type { Pt } from '@/engine/simulator/cell/courseDraw';
import { buttonName } from '@/engine/simulator/cell/courseText';

import css from './courseEnd.module.css';

export interface ChapterResult {
  chapter: number;
  /** O · X right of 5 (null: not taken). */
  right: number | null;
  /** The mission: 통과 · 아직 · 안 함 · 준비 중 (and how, for 5장). */
  mission: string;
  /** 상 · 중 · 하 (임시), when the 수행평가 has its mission. */
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
  /** 8차시: each chapter's results; 4차시: each 차시's mission. */
  chapters?: readonly ChapterResult[];
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

/** The one sheet (printed: one A4 page): the course, who, the results, the 후기, the card, the copyright line. */
export function sheetHtml(p: Props, who: { name: string; cls: string; day: string }): string {
  const rows = p.chapters
    ? p.chapters.map((c) => `<tr><td>${c.chapter}장</td><td>${c.right == null ? '-' : `${c.right} / 5`}</td><td>${esc(c.mission)}</td><td>${c.level ?? '-'}</td></tr>`).join('')
    : (p.missions ?? []).map((m) => `<tr><td>${m.n}차시</td><td colspan="2">${esc(`${m.id} ${m.title}`)}</td><td>${m.passed ? '통과' : '아직'}</td></tr>`).join('');
  const head = p.chapters ? '<tr><th>장</th><th>O · X</th><th>미션</th><th>상 · 중 · 하 (임시)</th></tr>' : '<tr><th>차시</th><th colspan="2">미션</th><th>결과</th></tr>';
  const r = p.review;
  const line = (k: string, v: string) => (v.trim() ? `<p><b>${k}</b> ${esc(v.trim())}</p>` : '');
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>학습 기록 한 장</title><style>
@page{size:A4;margin:14mm}body{font-family:'Noto Sans KR','Malgun Gothic',sans-serif;color:#111;font-size:13px;word-break:keep-all;margin:0}
h1{font-size:19px;margin:0 0 6px}.who{display:flex;flex-wrap:wrap;gap:18px;border-bottom:2px solid #111;padding-bottom:6px;margin-bottom:12px}
table{width:calc(100% - 1px);border-collapse:collapse;margin:6px 0 10px}th,td{border:1px solid #999;padding:6px;text-align:left}th{background:#eee}
h2{font-size:15px;margin:14px 0 4px}p{margin:3px 0}.tot{font-weight:700}.copy{margin-top:22px;padding-top:6px;border-top:1px solid #999;font-size:11px;color:#333}</style></head><body>
<h1>${esc(p.title)}</h1>
<div class="who"><span>구성 <b>${esc(p.plan)}</b></span><span>이름 <b>${esc(who.name) || '__________'}</b></span><span>반 <b>${esc(who.cls) || '______'}</b></span><span>날짜 <b>${esc(who.day)}</b></span></div>
<h2>장별 결과</h2><table>${head}${rows}</table>
<p class="tot">끝낸 절 ${p.done.got} / ${p.done.of} (선택 절 빼고)</p>
<h2>수업 후기</h2>
<p><b>별점</b> ${'★'.repeat(r.stars)}${'☆'.repeat(5 - r.stars)}</p>
${line('가장 재미있던 활동', p.subs.find((s) => s.id === r.best) ? `${r.best} ${p.subs.find((s) => s.id === r.best)!.title}` : '')}
${line('어려웠던 점과 해결한 방법', r.hard)}${p.real ? line('실물과 시뮬레이션의 차이', r.real) : ''}${line('더 해 보고 싶은 것', r.more)}
${p.card ? `<h2>내가 쓴 글자 카드 (5-4)</h2>${p.card.length ? cardSvg(p.card, 360) : '<p>아직 없어요</p>'}` : ''}
<p class="copy">${esc(p.copyright)}</p></body></html>`;
}

function Results(p: Props) {
  return (
    <>
      {p.chapters ? (
        <table className={css.table}>
          <thead>
            <tr>
              <th>장</th>
              <th>O · X</th>
              <th>미션</th>
              <th>상 · 중 · 하 (임시)</th>
            </tr>
          </thead>
          <tbody>
            {p.chapters.map((c) => (
              <tr key={c.chapter}>
                <td>{c.chapter}장</td>
                <td>{c.right == null ? '-' : `${c.right} / 5`}</td>
                <td>{c.mission}</td>
                <td>{c.level ?? '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <table className={css.table}>
          <thead>
            <tr>
              <th>차시</th>
              <th>미션</th>
              <th>결과</th>
            </tr>
          </thead>
          <tbody>
            {(p.missions ?? []).map((m) => (
              <tr key={m.id}>
                <td>{m.n}차시</td>
                <td>
                  {m.id} {m.title}
                </td>
                <td>{m.passed ? '통과' : '아직'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className={css.total}>
        끝낸 절{' '}
        <b>
          {p.done.got} / {p.done.of}
        </b>{' '}
        <small>(선택 절 빼고)</small>
      </p>
    </>
  );
}

export default function CourseEnd(p: Props) {
  const [page, setPage] = useState(0);
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
          {need ?? '안 써도 돼요'} · {r[k].length} / {REVIEW_MAX}자
        </small>
      </span>
      <input value={r[k]} maxLength={REVIEW_MAX} onChange={(e) => set({ [k]: e.target.value })} aria-label={label} />
    </label>
  );
  return (
    <div className={css.page} role="dialog" aria-label="6장 마무리">
      <div className={css.sheet}>
        <nav className={css.steps} aria-label="6장">
          {PAGES.map((x, i) => (
            <span key={x.id} data-on={i === page || undefined} data-done={i < page || undefined}>
              {x.id} {x.title}
              {subById(x.id)?.pages && <small> · {pagesText(subById(x.id)!.pages)}</small>}
            </span>
          ))}
          <button type="button" className={css.close} onClick={p.onClose} aria-label="닫기">
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
            <p className={css.lead}>① · ②는 꼭 골라요. 쓴 글은 이 컴퓨터의 브라우저에만 남아요.</p>
            <div className={css.field}>
              <span>
                ① 별점 <small>꼭 골라요</small>
              </span>
              <div className={css.stars} role="radiogroup" aria-label="별점">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} type="button" role="radio" aria-checked={r.stars === n} aria-label={`별 ${n}개`} data-on={n <= r.stars || undefined} onClick={() => set({ stars: n })}>
                    {n <= r.stars ? '★' : '☆'}
                  </button>
                ))}
              </div>
            </div>
            <label className={css.field}>
              <span>
                ② 가장 재미있던 활동 <small>꼭 골라요</small>
              </span>
              <select value={r.best} onChange={(e) => set({ best: e.target.value })} aria-label="가장 재미있던 활동">
                <option value="">절을 골라요</option>
                {p.subs.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.id} {s.title}
                  </option>
                ))}
              </select>
            </label>
            {text('hard', '③ 어려웠던 점과 해결한 방법')}
            {p.real && text('real', '④ 실물과 시뮬레이션의 차이', '5-5를 했다면')}
            {text('more', '⑤ 더 해 보고 싶은 것')}
          </section>
        )}
        {page === 2 && (
          <section>
            <h2>
              {PAGES[2].id} {PAGES[2].title}
            </h2>
            <p className={css.lead}>이름 · 반은 이 한 장에만 들어가요. 어디에도 남기거나 보내지 않아요.</p>
            <div className={css.who}>
              <label>
                이름 <input value={name} maxLength={20} onChange={(e) => setName(e.target.value)} aria-label="이름" />
              </label>
              <label>
                반 <input value={cls} maxLength={12} onChange={(e) => setCls(e.target.value)} aria-label="반" />
              </label>
              <label>
                날짜 <input value={day} maxLength={20} onChange={(e) => setDay(e.target.value)} aria-label="날짜" />
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
                    후기 {'★'.repeat(r.stars)}
                    {'☆'.repeat(5 - r.stars)}
                    <br />
                    가장 재미있던 활동 · {p.subs.find((s) => s.id === r.best)?.title ?? '-'}
                  </p>
                  {p.card && <div className={css.card} dangerouslySetInnerHTML={{ __html: p.card.length ? cardSvg(p.card, 280) : '<p>5-4 글자 카드 아직 없음</p>' }} />}
                </div>
              </div>
              <p className={css.copy}>{p.copyright}</p>
            </div>
          </section>
        )}
        <footer className={css.foot}>
          {page > 0 && (
            <button type="button" className={css.ghost} onClick={() => setPage(page - 1)}>
              ← 앞으로
            </button>
          )}
          <span>{page === 1 && !reviewed ? '① 별점과 ② 활동을 골라야 다음으로 가요' : page === 2 ? (p.saved ? '인쇄 창을 열었어요' : '인쇄 창에서 PDF로 저장을 고를 수 있어요') : ''}</span>
          {page < 2 ? (
            <button type="button" className={css.key} data-step="end-next" disabled={page === 1 && !reviewed} onClick={() => setPage(page + 1)}>
              {buttonName('next')}
            </button>
          ) : (
            <button type="button" className={css.key} data-step="end-save" onClick={save}>
              인쇄 · PDF로 저장
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
