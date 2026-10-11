'use client';

/**
 * Who is logged in, beside 로봇 연결 in the top bar (class mode or logged in only): a student's 번호
 * and whether the records reached the class server ("기록 저장됨" / "연결 끊김 · 12개 기다리는 중"),
 * or the teacher's name. Its menu: 학급 관리 (teachers), 다시 로그인, 로그아웃.
 */

import { MenuChip } from '../simulator/TopBar';
import { useAccount, useAccountSync, type SyncState } from './AccountProvider';
import css from './account.module.css';

/** The student's records in a few calm words, and a colour for the dot. */
function syncWords(authLost: boolean, s: SyncState | null): { text: string; tone: 'ok' | 'wait' | 'off' | 'login' } {
  if (authLost || s?.authNeeded) return { text: s && s.pending > 0 ? `다시 로그인 필요 · ${s.pending}개 기다리는 중` : '다시 로그인 필요', tone: 'login' };
  if (!s) return { text: '기록 준비 중', tone: 'wait' };
  if (s.offline) return { text: s.pending > 0 ? `연결 끊김 · ${s.pending}개 기다리는 중` : '연결 끊김', tone: 'off' };
  if (s.pending > 0) return { text: `보내는 중 · ${s.pending}개`, tone: 'wait' };
  return { text: '기록 저장됨', tone: 'ok' };
}

export default function AccountChip() {
  const a = useAccount();
  const sync = useAccountSync();
  if (!a.classMode && !a.session) return null;
  const s = a.session;

  if (!s) {
    return (
      <button type="button" className={css.chipBtn} onClick={() => a.openLogin({})} title="학급 서버에 로그인해요 (학생 · 선생님)">
        <span className={css.avatar} data-role="none" aria-hidden="true">
          <svg viewBox="0 0 18 18">
            <circle cx="9" cy="6" r="2.8" />
            <path d="M3.6 15.4c.6-3 2.7-4.6 5.4-4.6s4.8 1.6 5.4 4.6" />
          </svg>
        </span>
        <span className={css.chipText}>
          <b>로그인</b>
          <small>학급 서버</small>
        </span>
      </button>
    );
  }

  const student = s.role === 'student' ? s : null;
  const w = student ? syncWords(a.authLost, sync) : null;
  const roleName = s.role === 'operator' ? '운영자' : s.role === 'teacher' ? '선생님' : '학생';
  const label = (
    <span className={css.chipInner}>
      <span className={css.avatar} data-role={s.role}>
        {student ? student.student.no : s.role !== 'student' ? s.user.username.slice(0, 1).toUpperCase() : ''}
        {w && <i className={css.dot} data-tone={w.tone} aria-hidden="true" />}
      </span>
      <span className={css.chipText}>
        <b>{student ? `${student.student.no}번 학생` : s.role !== 'student' ? s.user.username : ''}</b>
        <small>{w ? w.text : roleName}</small>
      </span>
    </span>
  );

  return (
    <MenuChip label={label} title={student ? `${student.class.name} ${student.student.no}번 · ${w?.text}` : `${roleName} 계정`}>
      {(close) => (
        <>
          <div className={`${css.scope} ${css.menuWho}`}>
            <b>{student ? `${student.class.name} · ${student.student.no}번` : `${s.role !== 'student' ? s.user.username : ''} (${roleName})`}</b>
            <small>
              {student ? `학급 코드 ${student.student.classCode} · ` : ''}학급 서버 {s.baseUrl.replace(/^https?:\/\//, '')}
            </small>
            {w && (
              <span className={css.menuSync} data-tone={w.tone}>
                <i aria-hidden="true" />
                {w.text}
              </span>
            )}
            {student && <small>이 PC 가 학급 서버와 끊겨도 수업은 계속돼요. 기록은 모아 두었다가 다시 연결되면 보내요.</small>}
          </div>
          {s.role !== 'student' && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                a.openDashboard();
                close();
              }}
            >
              <b>학급 관리</b>
              <small>학생 계정 · 로그인 카드 · 차시 열기 · 실시간 현황</small>
            </button>
          )}
          {a.authLost && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                a.openLogin({ reason: 'relogin', tab: student ? 'student' : 'teacher' });
                close();
              }}
            >
              <b>다시 로그인</b>
              <small>로그인이 끝났어요 — 기록을 이어서 보내요</small>
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              close();
              void a.logout();
            }}
          >
            <b>로그아웃</b>
            <small>{student ? '수업을 마치면 로그아웃해요 (같은 PC 를 다른 친구가 써요)' : '이 PC 에서 로그아웃해요'}</small>
          </button>
        </>
      )}
    </MenuChip>
  );
}
