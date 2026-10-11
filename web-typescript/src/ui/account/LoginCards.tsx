'use client';

/**
 * The login cards right after students were issued (or one PIN reset): 학급 코드 · 번호 · PIN, the
 * name only from the teacher's list on this PC, and the address students open. The PINs are shown
 * now only — the server keeps their hashes — so the sheet says so and asks before closing.
 * Printed with the browser's print (globals.css prints only this sheet while it is open).
 */

import { useState } from 'react';
import { createPortal } from 'react-dom';

import type { LoginCard } from '@/engine/account';

import css from './account.module.css';

export default function LoginCards({ cards, title, onClose }: { cards: readonly LoginCard[]; title: string; onClose(): void }) {
  const [sure, setSure] = useState(false);
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className={`class-cards ${css.scope} ${css.cardsBack}`}>
      <section className={css.cardsSheet} role="dialog" aria-modal="true" aria-labelledby="cards-title">
        <header className={css.cardsBar}>
          <div>
            <h2 id="cards-title">{title}</h2>
            <p className={css.warn}>
              <b>PIN 은 지금만 볼 수 있어요.</b> 창을 닫으면 다시 볼 수 없어요. 지금 인쇄하거나 적어 두세요. 잊어버린 PIN 은 [PIN 다시 발급]으로 새로 만들어요.
            </p>
          </div>
          <div className={css.formBtns}>
            <button type="button" className={css.primaryBtn} onClick={() => window.print()}>
              인쇄하기
            </button>
            <button type="button" className={sure ? css.dangerBtn : css.ghostBtn} onClick={() => (sure ? onClose() : setSure(true))}>
              {sure ? '정말 닫기 (PIN 다시 못 봄)' : '다 적었어요 · 닫기'}
            </button>
          </div>
        </header>
        <div className={css.cardGrid}>
          {cards.map((c) => (
            <article key={c.no} className={css.loginCard}>
              <header>
                <span>로봇 시티 학급 로그인</span>
                <b>{c.className}</b>
              </header>
              <dl>
                <div>
                  <dt>학급 코드</dt>
                  <dd className={css.mono}>{c.classCode}</dd>
                </div>
                <div>
                  <dt>번호</dt>
                  <dd>
                    {c.no}
                    {c.name && <small>{c.name}</small>}
                  </dd>
                </div>
                <div>
                  <dt>PIN</dt>
                  <dd className={css.mono}>{c.pin}</dd>
                </div>
              </dl>
              {c.link && (
                <p className={css.cardLink}>
                  접속 주소 <span>{c.link}</span>
                </p>
              )}
              <footer>PIN 은 나만 알아요. 다른 친구에게 보여 주지 않아요.</footer>
            </article>
          ))}
        </div>
      </section>
    </div>,
    document.body,
  );
}
