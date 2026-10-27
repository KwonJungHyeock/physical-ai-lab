'use client';

/**
 * The situation board: one white card at the top centre of the 3D view (the panels hold controls
 * only). It shows what to do now (the tutorial's step, with [다음]) and, over it, the newest message
 * — a guide, a run result, a warning, an error. Guides and results hide by themselves after a few
 * seconds; warnings stay longer and errors stay until closed. [기록] opens every message so far.
 *
 * Where the user should press next blinks softly (a ring, nothing moves): the buttons a message
 * names in brackets ("먼저 [기본 자세]를 눌러 주세요"), or the guide's own target. A button inside a
 * closed panel is found by the menu button that opens it (`data-hint-for="매트 물리"`).
 */

import { useEffect, useRef, useState } from 'react';

import Icon from '../Icon';
import css from '../console.module.css';

export type LogKind = 'info' | 'sim' | 'ok' | 'warn' | 'err';
export interface LogEntry {
  id: number;
  kind: LogKind;
  msg: string;
  fix?: string;
}

/** What to do now: the open tutorial's step. */
export interface Guide {
  /** "1 / 4 · 그대로 실행" */
  head: string;
  text: string;
  onNext?: () => void;
  /** Names of the buttons to point at (as their labels read), e.g. ['시뮬레이션']. */
  hint?: readonly string[];
}

export const TAGS: Record<LogKind, string> = { info: '안내', sim: '시뮬', ok: '성공', warn: '주의', err: '오류' };

/** How long a message stays on the board, ms (an error stays until closed). */
const SHOW_MS: Record<LogKind, number> = { info: 6000, sim: 5000, ok: 6000, warn: 10000, err: Infinity };

/** The button names a message points at: what it puts in brackets ("[기본 자세]", "[매트] 를"). */
export function namedButtons(text: string): string[] {
  return [...text.matchAll(/\[([^\]]{1,16})\]/g)].map((m) => m[1].trim()).filter(Boolean);
}

const squash = (s: string | null | undefined) => (s ?? '').replace(/[\s▶▷·+]+/g, '');

/** The visible buttons (or the menu buttons that open them) whose label is one of `names`. */
function findTargets(names: readonly string[], skip: Element | null): HTMLElement[] {
  if (!names.length) return [];
  const want = names.map(squash).filter(Boolean);
  const seen = (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && !skip?.contains(el) && !el.closest('[aria-hidden="true"]');
  };
  const out: HTMLElement[] = [];
  for (const w of want) {
    // `data-hint-skip`: a label that only names a state (the 시뮬레이션 light), not a thing to press.
    const all = [...document.querySelectorAll<HTMLElement>('button, [role="button"], [role="tab"], label')].filter((el) => seen(el) && !el.hasAttribute('data-hint-skip'));
    // The button's own label first; a longer label only by a word ("시뮬레이션 ▶", not "기본 자세로 가기" for [기본 자세]).
    const exact = all.filter((el) => squash(el.textContent) === w || squash(el.getAttribute('aria-label')) === w || squash(el.getAttribute('title')) === w);
    const direct = exact.length ? exact : all.filter((el) => squash(el.textContent).startsWith(w) && squash(el.textContent).length <= w.length + 2);
    const found = direct.length ? direct : [...document.querySelectorAll<HTMLElement>('[data-hint-for]')].filter((el) => seen(el) && (el.dataset.hintFor ?? '').split(/\s*,\s*/).some((a) => squash(a) === w));
    for (const el of found.slice(0, 2)) if (!out.includes(el)) out.push(el);
  }
  return out.slice(0, 3);
}

function LogList({ entries }: { entries: LogEntry[] }) {
  const ref = useRef<HTMLUListElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [entries]);
  return (
    <ul className={css.log} ref={ref} aria-live="polite">
      {entries.map((e) => (
        <li key={e.id}>
          <span className={`${css.tag} ${css[`tag_${e.kind}`]}`}>{TAGS[e.kind]}</span>
          <span>
            {e.msg}
            {e.fix && <span className={css.fix}>{e.fix}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** `below`: a card already holds the top centre (the run's result), so the board sits under it. */
export default function Notices({ entries, guide, below = false }: { entries: LogEntry[]; guide?: Guide | null; below?: boolean }) {
  const last = entries[entries.length - 1];
  /** The id of the message the board shows; null when it has hidden or been closed. */
  const [shown, setShown] = useState<number | null>(last?.id ?? null);
  const [history, setHistory] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  // A new message comes onto the board, then hides after its time.
  const lastId = last?.id ?? null;
  const lastKind = last?.kind;
  useEffect(() => {
    if (lastId === null || !lastKind) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the board follows the newest message
    setShown(lastId);
    const ms = SHOW_MS[lastKind];
    if (!Number.isFinite(ms)) return;
    const t = window.setTimeout(() => setShown((s) => (s === lastId ? null : s)), ms);
    return () => window.clearTimeout(t);
  }, [lastId, lastKind]);

  const open = shown !== null && shown === lastId && !!last;

  // Where to press: the open message's brackets (a warning or an error names its way out), else the guide's.
  const pointAt = open && last && (last.kind === 'err' || last.kind === 'warn' || last.kind === 'info') ? namedButtons(`${last.fix ?? ''} ${last.msg}`) : [];
  const names = (pointAt.length ? pointAt : (guide?.hint ?? [])).join('|');
  useEffect(() => {
    if (!names) return;
    let marked: HTMLElement[] = [];
    const mark = () => {
      const next = findTargets(names.split('|'), box.current);
      for (const el of marked) if (!next.includes(el)) el.removeAttribute('data-hint');
      for (const el of next) el.setAttribute('data-hint', 'on');
      marked = next;
    };
    mark();
    // Panels open and close under it: look again now and then while the hint stands.
    const t = window.setInterval(mark, 700);
    return () => {
      window.clearInterval(t);
      for (const el of marked) el.removeAttribute('data-hint');
    };
  }, [names]);

  useEffect(() => {
    if (!history) return;
    const away = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setHistory(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setHistory(false);
    };
    window.addEventListener('pointerdown', away);
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('pointerdown', away);
      window.removeEventListener('keydown', esc);
    };
  }, [history]);

  const logButton = (
    <button type="button" className={css.noticeLog} aria-expanded={history} onClick={() => setHistory((h) => !h)} title={history ? '기록 접기' : '지금까지의 알림 모두 보기'}>
      <Icon name="log" size={13} />
      기록 {entries.length}
      <Icon name="chevron" size={12} className={history ? css.chevUp : undefined} />
    </button>
  );
  const idle = !open && !guide;
  return (
    <div className={css.notices} ref={box} data-panel="log" data-idle={idle || undefined} data-below={below || undefined}>
      {idle ? (
        logButton
      ) : (
        <div className={css.board} data-kind={open ? last.kind : 'guide'}>
          {open && last && (
            <div className={css.notice} data-kind={last.kind} role={last.kind === 'err' ? 'alert' : 'status'}>
              <span className={`${css.tag} ${css[`tag_${last.kind}`]}`}>{TAGS[last.kind]}</span>
              <p>
                {last.msg}
                {last.fix && <small>{last.fix}</small>}
              </p>
              <span className={css.noticeEnd}>
                {!guide && logButton}
                <button type="button" className={css.noticeClose} aria-label="알림 닫기" title="닫기" onClick={() => setShown(null)}>
                  ×
                </button>
              </span>
            </div>
          )}
          {guide && (
            <div className={css.guide} role="status">
              <span className={css.guideTag}>지금 할 일</span>
              <p>
                <b>{guide.head}</b>
                {guide.text}
              </p>
              <span className={css.noticeEnd}>
                {logButton}
                {guide.onNext && (
                  <button type="button" className={css.guideNext} onClick={guide.onNext}>
                    다음 ▶
                  </button>
                )}
              </span>
            </div>
          )}
        </div>
      )}
      {history && (
        <div className={css.noticeHistory}>
          <LogList entries={entries} />
        </div>
      )}
    </div>
  );
}
