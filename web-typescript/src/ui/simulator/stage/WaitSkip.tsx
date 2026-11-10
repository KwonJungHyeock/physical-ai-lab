'use client';

/**
 * 기다림 빨리 감기 (입문 카페): while a machine pours for long (the coffee's 28 s a shot), the cell
 * goes on fast and this chip says so — what is being waited for, how long it really takes, and a key
 * to watch it in real time instead (this browser remembers).
 */

import css from './waitSkip.module.css';

export default function WaitSkip({ what, seconds, off, onToggle }: { what: string; seconds: number; off: boolean; onToggle(): void }) {
  return (
    <div className={css.chip} role="status" data-off={off || undefined}>
      <span className={css.icon} aria-hidden="true">
        {off ? '▶' : '⏩'}
      </span>
      <span className={css.text}>
        <b>{off ? `${what} 기다리는 중` : `${what} 기다리는 동안 빨리 감기`}</b>
        <small>실제로는 {seconds}초 걸려요</small>
      </span>
      <button type="button" onClick={onToggle}>
        {off ? '빨리 감기' : '실제 시간으로'}
      </button>
    </div>
  );
}
