'use client';

/**
 * [장비 선택하기]: the school's equipment as picture cards (the PC 시뮬레이터 is always in), and
 * under them the 28 차시 as one cell each — 실물 · 일부 실물 · 시뮬레이터 — recoloured left to right
 * like a wave whenever a card is switched. [맞춤 커리큘럼 만들기] hands the choice back.
 */

import { useEffect, useMemo, useState, type CSSProperties } from 'react';

import { CATEGORIES, TOPICS, topicsOf, type TopicId } from '@/engine/education/catalog';
import { PRODUCTS, topicCover, type ProductId, type TopicCover } from '@/engine/education/roadmap';

import css from './course.module.css';

/** The 차시 counts for a set of products: 실물 · 일부 실물 · 시뮬레이터. */
export function coverCounts(cover: Record<TopicId, TopicCover>) {
  const v = TOPICS.map((t) => cover[t.id]);
  return { real: v.filter((x) => x === 'full').length, part: v.filter((x) => x === 'part').length, sim: v.filter((x) => !x).length };
}

export const HOW_NAME: Record<TopicCover, string> = { full: '실물', part: '일부 실물', '': '시뮬레이터' };

/** The 28 차시 in a row of cells, grouped by 단원. A cell that changes plays a small bump, in turn. */
export function Strip({ cover, label }: { cover: Record<TopicId, TopicCover>; label?: string }) {
  // How many times each cell changed: the bump alternates between two equal animations so it replays.
  const [bumps, setBumps] = useState<Partial<Record<TopicId, number>>>({});
  const [before, setBefore] = useState(cover);
  if (before !== cover) {
    setBefore(cover);
    const changed = TOPICS.filter((t) => before[t.id] !== cover[t.id]).map((t) => t.id);
    if (changed.length) setBumps((b) => ({ ...b, ...Object.fromEntries(changed.map((id) => [id, (b[id] ?? 0) + 1])) }));
  }
  let k = 0;
  return (
    <div className={css.strip} aria-label={label}>
      {CATEGORIES.map((c) => (
        <div key={c.id} className={css.stripGroup}>
          <div className={css.cells}>
            {topicsOf(c.id).map((t) => {
              const n = bumps[t.id];
              return (
                <span
                  key={t.id}
                  className={css.cell}
                  data-how={cover[t.id] || 'sim'}
                  data-bump={n ? (n % 2 ? 'a' : 'b') : undefined}
                  style={{ '--k': k++ } as CSSProperties}
                  title={`${t.id} ${t.title} · ${HOW_NAME[cover[t.id]]}`}
                />
              );
            })}
          </div>
          <small>{c.id}</small>
        </div>
      ))}
    </div>
  );
}

export function Counts({ cover, part = '일부' }: { cover: Record<TopicId, TopicCover>; part?: string }) {
  const n = coverCounts(cover);
  return (
    <span className={css.counts}>
      <span className={css.pill} data-how="full">
        실물 {n.real}
      </span>
      <span className={css.pill} data-how="part">
        {part} {n.part}
      </span>
      <span className={css.pill} data-how="sim">
        시뮬 {n.sim}
      </span>
    </span>
  );
}

/** The products on the shelf: those with a picture, and anything else already picked. */
const shelf = (owned: readonly ProductId[]) => PRODUCTS.filter((p) => p.id !== 'sim' && (p.img || owned.includes(p.id)));

export default function GearModal({ owned, onClose, onMake }: { owned: readonly ProductId[]; onClose(): void; onMake(p: readonly ProductId[]): void }) {
  const [picked, setPicked] = useState<readonly ProductId[]>(owned);
  const cover = useMemo(() => topicCover(picked), [picked]);
  const hw = picked.filter((p) => p !== 'sim');
  const toggle = (id: ProductId) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  useEffect(() => {
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);
  return (
    <div className={css.modalBack} onClick={onClose}>
      <div className={css.modal} role="dialog" aria-modal="true" aria-labelledby="gear-title" onClick={(e) => e.stopPropagation()}>
        <header>
          <div>
            <h3 id="gear-title">갖고 있는 장비를 고르세요</h3>
            <small>
              고른 장비로 할 수 있는 차시는 <b>실물</b>, 나머지는 <b>시뮬레이터</b>로 이어서 해요.
            </small>
          </div>
          <button type="button" className={css.x} onClick={onClose} aria-label="닫기">
            ×
          </button>
        </header>
        <div className={css.prods}>
          {shelf(owned).map((p) => (
            <button key={p.id} type="button" className={css.prod} aria-pressed={picked.includes(p.id)} onClick={() => toggle(p.id)} data-product={p.id}>
              <span className={css.prodPic}>
                {p.img ? (
                  // eslint-disable-next-line @next/next/no-img-element -- a render of the official model, also in the static export
                  <img src={p.img} alt="" loading="lazy" />
                ) : (
                  <span className={css.prodMono} aria-hidden="true">
                    {p.chip}
                  </span>
                )}
              </span>
              <b>{p.name}</b>
              <small>{p.kind}</small>
            </button>
          ))}
          <div className={css.prod} data-lock aria-pressed="true">
            <span className={css.prodPic} aria-hidden="true">
              <svg viewBox="0 0 48 48" width="52" height="52" fill="none" stroke="#5b6579" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <rect x="6" y="9" width="36" height="24" rx="3" />
                <path d="M18 39h12M24 33v6M14 26l7-7 5 4 8-8" />
              </svg>
            </span>
            <b>PC 시뮬레이터</b>
            <small>항상 포함</small>
          </div>
        </div>
        <div className={css.live} aria-live="polite">
          <div className={css.liveHead}>
            <b>미리 보기 · 고를 때마다 바뀌어요</b>
            <Counts cover={cover} />
          </div>
          <Strip cover={cover} label={`28차시: ${HOW_NAME.full} · ${HOW_NAME.part} · ${HOW_NAME['']}`} />
          <div className={css.keyline}>
            <span>
              <i data-how="full" />
              실물로 수업
            </span>
            <span>
              <i data-how="part" />
              일부 활동만 실물
            </span>
            <span>
              <i data-how="sim" />
              시뮬레이터로 수업
            </span>
          </div>
        </div>
        <footer>
          <small>{hw.length ? `${hw.length}개 골랐어요 · 나머지 차시는 시뮬레이터로` : '장비 없이 시뮬레이터로만 해도 돼요'}</small>
          <button type="button" className={css.btn} onClick={() => onMake([...hw, 'sim'])}>
            맞춤 커리큘럼 만들기 →
          </button>
        </footer>
      </div>
    </div>
  );
}
