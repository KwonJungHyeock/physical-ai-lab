'use client';

/** The login in a dialog over any screen (the top bar's 로그인, the gear menu, "다시 로그인"). */

import { useEffect } from 'react';

import { useAccount, type LoginAsk } from './AccountProvider';
import LoginPanel from './LoginPanel';
import css from './account.module.css';

export default function LoginDialog({ ask }: { ask: LoginAsk }) {
  const a = useAccount();
  const { closeLogin } = a;
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && closeLogin();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [closeLogin]);
  const relogin = ask.reason === 'relogin';
  return (
    <div className={`${css.scope} ${css.backdrop}`} onMouseDown={(e) => e.target === e.currentTarget && closeLogin()}>
      <section className={css.dialog} role="dialog" aria-modal="true" aria-labelledby="class-login-title">
        <header className={css.dialogHead}>
          <div>
            <h2 id="class-login-title">{relogin ? '다시 로그인' : a.status?.needsSetup ? '학급 서버 처음 설정' : '학급 로그인'}</h2>
            <p>{relogin ? '수업은 그대로 이어서 할 수 있어요.' : '교실 학급 서버에 들어가요. 기록은 선생님 PC 에 저장돼요.'}</p>
          </div>
          <button type="button" className={css.close} onClick={closeLogin} aria-label="닫기">
            ×
          </button>
        </header>
        <LoginPanel
          ask={ask}
          onDone={(s) => {
            closeLogin();
            if (s.role !== 'student' && !relogin) a.openDashboard();
          }}
        />
      </section>
    </div>
  );
}
