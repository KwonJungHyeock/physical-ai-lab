'use client';

/**
 * One notification card at the top of the 3D view's left column, over the monitor (which moves down
 * while it shows): the newest message — a guide, a run result, a warning. Guides and results hide
 * by themselves after a few seconds; warnings stay longer and errors stay until closed. [기록]
 * opens every message so far under the card.
 */

import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import Icon from '../Icon';
import css from '../console.module.css';

export type LogKind = 'info' | 'sim' | 'ok' | 'warn' | 'err';
export interface LogEntry {
  id: number;
  kind: LogKind;
  msg: string;
  fix?: string;
}

export const TAGS: Record<LogKind, string> = { info: '안내', sim: '시뮬', ok: '성공', warn: '주의', err: '오류' };

/** How long a message stays on the card, ms (an error stays until closed). */
const SHOW_MS: Record<LogKind, number> = { info: 6000, sim: 5000, ok: 6000, warn: 10000, err: Infinity };

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

/** `beside`: 실습 셀's column holds the left edge, so the card sits to its right. */
export default function Notices({ entries, beside = false }: { entries: LogEntry[]; beside?: boolean }) {
  const last = entries[entries.length - 1];
  /** The id of the message the card shows; null when it has hidden or been closed. */
  const [shown, setShown] = useState<number | null>(last?.id ?? null);
  const [history, setHistory] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  // A new message comes onto the card, then hides after its time.
  const lastId = last?.id ?? null;
  const lastKind = last?.kind;
  useEffect(() => {
    if (lastId === null || !lastKind) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the card follows the newest message
    setShown(lastId);
    const ms = SHOW_MS[lastKind];
    if (!Number.isFinite(ms)) return;
    const t = window.setTimeout(() => setShown((s) => (s === lastId ? null : s)), ms);
    return () => window.clearTimeout(t);
  }, [lastId, lastKind]);

  const open = shown !== null && shown === lastId;
  // The monitor under the card moves down by the card's height while it shows (and back up after).
  useLayoutEffect(() => {
    const el = box.current;
    const parent = el?.parentElement;
    if (!el || !parent) return;
    if (!open) {
      parent.style.removeProperty('--hud-top');
      return;
    }
    const set = () => parent.style.setProperty('--hud-top', `${12 + el.offsetHeight + 8}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => {
      ro.disconnect();
      parent.style.removeProperty('--hud-top');
    };
  }, [open]);

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
  return (
    <div className={css.notices} ref={box} data-panel="log" data-idle={!open || undefined} data-beside={beside || undefined}>
      {open && last ? (
        <div className={css.notice} data-kind={last.kind} role={last.kind === 'err' ? 'alert' : 'status'}>
          <span className={`${css.tag} ${css[`tag_${last.kind}`]}`}>{TAGS[last.kind]}</span>
          <p>
            {last.msg}
            {last.fix && <small>{last.fix}</small>}
          </p>
          <button type="button" className={css.noticeClose} aria-label="알림 닫기" title="닫기" onClick={() => setShown(null)}>
            ×
          </button>
          <span className={css.noticeFoot}>{logButton}</span>
        </div>
      ) : (
        logButton
      )}
      {history && (
        <div className={css.noticeHistory}>
          <LogList entries={entries} />
        </div>
      )}
    </div>
  );
}
