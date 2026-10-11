'use client';

/** A 차시 the teacher has not opened yet (students in class mode): said plainly instead of opening it. */

import { useEffect, useState } from 'react';

import { TOPIC_BY_ID, type TopicId } from '@/engine/education/catalog';

import { useAccount } from './AccountProvider';
import css from './account.module.css';

export default function LessonLocked({ topic, onClose, onOpen }: { topic: TopicId; onClose(): void; onOpen(): void }) {
  const a = useAccount();
  const [busy, setBusy] = useState(false);
  const [still, setStill] = useState(false);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);
  const t = TOPIC_BY_ID.get(topic);
  const retry = async () => {
    setBusy(true);
    const open = await a.refreshClass();
    setBusy(false);
    if (open && (open.includes('*') || open.includes(topic))) onOpen();
    else setStill(true);
  };
  return (
    <div className={`${css.scope} ${css.backdrop}`} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <section className={`${css.dialog} ${css.lockBox}`} role="alertdialog" aria-modal="true" aria-labelledby="lesson-locked-title">
        <span className={css.lockIcon} aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <rect x="5" y="10.5" width="14" height="10" rx="2.5" />
            <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
          </svg>
        </span>
        <h2 id="lesson-locked-title">선생님이 아직 열지 않은 차시예요</h2>
        <p className={css.lockTopic}>{t ? `${t.id} ${t.title}` : topic}</p>
        <p>선생님이 이 차시를 열면 바로 들어갈 수 있어요. 지금 열린 차시나 현장 실습을 해 보세요.</p>
        {still && (
          <p className={css.notice} role="status">
            아직 닫혀 있어요. 조금 뒤에 다시 확인해 주세요.
          </p>
        )}
        <div className={css.formBtns}>
          <button type="button" className={css.ghostBtn} onClick={() => void retry()} disabled={busy}>
            {busy ? '확인하는 중…' : '열렸는지 다시 확인'}
          </button>
          <button type="button" className={css.primaryBtn} onClick={onClose} autoFocus>
            확인
          </button>
        </div>
      </section>
    </div>
  );
}
