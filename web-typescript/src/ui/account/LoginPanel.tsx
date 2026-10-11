'use client';

/**
 * The class login, used by the login dialog and by the 교육 tab's login page:
 *  - 학생: 학급 코드 + 번호 + PIN (big fields, numbers on a number pad);
 *  - 선생님: 아이디 + 비밀번호 (teachers and the operator);
 *  - 처음 설정: on a fresh class server, from the server PC itself, the operator account is made here.
 * The class server is found by itself (the page's own server, a join link, the address used before);
 * when it is not, the teacher PC's address is typed once. PINs and passwords live only in the fields
 * and are cleared after each try.
 */

import { useEffect, useId, useState, type FormEvent } from 'react';

import { ClassServerClient, normalizeServerAddress, validPin, type Session } from '@/engine/account';

import { useAccount, useAccountSync, type LoginAsk } from './AccountProvider';
import { errorText } from './labels';
import css from './account.module.css';

type Tab = 'student' | 'teacher';

/** host:port of a base URL, for the line under the form. */
const hostOf = (base: string) => base.replace(/^https?:\/\//, '');

export default function LoginPanel({ ask, onDone }: { ask?: LoginAsk; onDone(s: Session): void }) {
  const a = useAccount();
  const sync = useAccountSync();
  const id = useId();
  const sess = a.session;
  const [tab, setTab] = useState<Tab>(ask?.tab ?? (sess && sess.role !== 'student' ? 'teacher' : a.preferTeacher ? 'teacher' : 'student'));
  const [code, setCode] = useState(() => (sess?.role === 'student' ? sess.student.classCode : (a.joinCode ?? '')));
  const [no, setNo] = useState(() => (sess?.role === 'student' ? String(sess.student.no) : ''));
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [user, setUser] = useState(() => (sess && sess.role !== 'student' ? sess.user.username : ''));
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [addr, setAddr] = useState('');
  const [editAddr, setEditAddr] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Opened in free mode: look for the server where it was found before.
  const { serverState, findServer } = a;
  useEffect(() => {
    if (serverState === 'idle') void findServer();
  }, [serverState, findServer]);

  const server = a.server;
  const askAddress = editAddr || (serverState === 'none' && !server);
  const setupNeeded = !!a.status?.needsSetup && !askAddress;

  const connect = async (e?: FormEvent) => {
    e?.preventDefault();
    const base = normalizeServerAddress(addr);
    if (!base) {
      setErr('주소 형식이 맞지 않아요. 선생님 화면에 보이는 주소를 넣어 주세요 (예: 192.168.0.10).');
      return;
    }
    setBusy(true);
    setErr(null);
    const found = await a.findServer(base);
    setBusy(false);
    if (found) {
      setEditAddr(false);
      setAddr('');
    } else setErr('그 주소에서 학급 서버를 찾지 못했어요. 주소가 맞는지, 선생님 PC 와 같은 와이파이인지 확인해 주세요.');
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!server) return;
    const c = new ClassServerClient(server);
    setErr(null);
    let s: Session;
    try {
      if (setupNeeded) {
        if (pw.length < 8) return setErr('비밀번호는 8자 이상으로 정해 주세요.');
        if (pw !== pw2) return setErr('두 비밀번호가 달라요. 다시 넣어 주세요.');
        setBusy(true);
        s = await c.setup(user.trim(), pw);
      } else if (tab === 'student') {
        const n = Number(no);
        if (!/^[A-Za-z0-9]{4,10}$/.test(code.trim())) return setErr('학급 코드를 카드에 적힌 대로 넣어 주세요 (영문 · 숫자 6자).');
        if (!Number.isInteger(n) || n < 1 || n > 99) return setErr('번호는 1부터 99 사이 숫자예요.');
        if (!validPin(pin)) return setErr('PIN 은 숫자 4개예요.');
        setBusy(true);
        s = await c.loginStudent(code, n, pin);
      } else {
        if (!user.trim() || !pw) return setErr('아이디와 비밀번호를 넣어 주세요.');
        setBusy(true);
        s = await c.loginTeacher(user.trim(), pw);
      }
    } catch (x) {
      setErr(errorText(x, tab === 'student' && !setupNeeded ? 'student' : 'teacher'));
      setPin('');
      setPw('');
      setPw2('');
      setBusy(false);
      return;
    }
    setPin('');
    setPw('');
    setPw2('');
    setBusy(false);
    a.signedIn(s);
    onDone(s);
  };

  const serverLine = (
    <div className={css.serverLine} data-state={askAddress ? 'ask' : serverState}>
      {serverState === 'checking' ? (
        <span>학급 서버를 찾는 중…</span>
      ) : server && !askAddress ? (
        <>
          <span>
            <i aria-hidden="true" />
            학급 서버 연결됨 · <b>{hostOf(server)}</b>
          </span>
          <button type="button" className={css.linkBtn} onClick={() => setEditAddr(true)}>
            주소 바꾸기
          </button>
        </>
      ) : null}
    </div>
  );

  if (askAddress) {
    return (
      <form className={css.form} onSubmit={connect}>
        <p className={css.formLead}>
          <b>학급 서버 주소를 넣어 주세요.</b> 선생님 PC 의 학급 서버 창(또는 선생님 화면)에 보이는 주소예요.
        </p>
        <label className={css.field}>
          <span>학급 서버 주소</span>
          <input className={css.big} value={addr} onChange={(e) => setAddr(e.target.value)} placeholder="예: 192.168.0.10" autoComplete="off" spellCheck={false} autoFocus inputMode="url" />
        </label>
        {err && (
          <p className={css.error} role="alert">
            {err}
          </p>
        )}
        <div className={css.formBtns}>
          {server && (
            <button type="button" className={css.ghostBtn} onClick={() => setEditAddr(false)}>
              취소
            </button>
          )}
          <button type="submit" className={css.primaryBtn} disabled={busy || !addr.trim()}>
            {busy ? '찾는 중…' : '연결하기'}
          </button>
        </div>
      </form>
    );
  }

  if (setupNeeded && !a.status?.setupHere) {
    return (
      <div className={css.form}>
        {serverLine}
        <p className={css.formLead}>
          <b>이 학급 서버는 아직 처음 설정을 하지 않았어요.</b> 학급 서버를 켠 선생님 PC 에서 먼저 관리자 계정을 만들어 주세요.
        </p>
      </div>
    );
  }

  return (
    <form className={css.form} onSubmit={submit} autoComplete="off">
      {ask?.reason === 'relogin' && (
        <p className={css.notice} role="status">
          로그인이 끝났어요. 다시 로그인하면{sync && sync.pending > 0 ? ` 이 PC 에 모아 둔 기록 ${sync.pending}개를` : ' 기록을'} 이어서 보내요.
        </p>
      )}
      {setupNeeded ? (
        <p className={css.formLead}>
          <b>처음 설정 — 관리자 계정 만들기.</b> 학급 서버를 처음 켰어요. 이 PC 에서 쓸 관리자(운영자) 아이디와 비밀번호를 정해 주세요. 교사 계정과 학급은 이 계정으로 만들어요.
        </p>
      ) : (
        <div className={css.tabs} role="tablist" aria-label="누가 로그인하나요">
          {(['student', 'teacher'] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => {
                setTab(t);
                setErr(null);
              }}
            >
              {t === 'student' ? '학생' : '선생님'}
            </button>
          ))}
        </div>
      )}

      {!setupNeeded && tab === 'student' ? (
        <>
          <label className={css.field}>
            <span>학급 코드</span>
            <input
              className={`${css.big} ${css.codeInput}`}
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10))}
              placeholder="K7M4QX"
              autoCapitalize="characters"
              spellCheck={false}
              aria-describedby={`${id}-card`}
              autoFocus={!code}
            />
          </label>
          <div className={css.fieldRow}>
            <label className={css.field}>
              <span>번호</span>
              <input className={css.big} value={no} onChange={(e) => setNo(e.target.value.replace(/\D/g, '').slice(0, 2))} inputMode="numeric" placeholder="예: 7" autoFocus={!!code && !no} />
            </label>
            <label className={css.field}>
              <span>
                PIN <small>숫자 4개</small>
              </span>
              <span className={css.pinBox}>
                <input
                  className={`${css.big} ${css.pinInput}`}
                  type={showPin ? 'text' : 'password'}
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="••••"
                  autoFocus={!!code && !!no}
                />
                <button type="button" className={css.peek} onClick={() => setShowPin((v) => !v)} aria-pressed={showPin} title={showPin ? 'PIN 가리기' : 'PIN 보이기'}>
                  {showPin ? '가리기' : '보기'}
                </button>
              </span>
            </label>
          </div>
          <p className={css.hintLine} id={`${id}-card`}>
            선생님께 받은 로그인 카드에 적힌 그대로 넣어요. PIN 을 잊었으면 선생님께 새로 받아요.
          </p>
        </>
      ) : (
        <>
          <label className={css.field}>
            <span>아이디</span>
            <input className={css.big} value={user} onChange={(e) => setUser(e.target.value)} autoComplete="username" spellCheck={false} autoFocus={!user} />
          </label>
          <label className={css.field}>
            <span>비밀번호{setupNeeded && <small>8자 이상</small>}</span>
            <input className={css.big} type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete={setupNeeded ? 'new-password' : 'current-password'} autoFocus={!!user} />
          </label>
          {setupNeeded && (
            <label className={css.field}>
              <span>비밀번호 한 번 더</span>
              <input className={css.big} type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" />
            </label>
          )}
        </>
      )}

      {err && (
        <p className={css.error} role="alert">
          {err}
        </p>
      )}
      <button type="submit" className={`${css.primaryBtn} ${css.wide}`} disabled={busy || !server}>
        {busy ? '확인하는 중…' : setupNeeded ? '관리자 계정 만들기' : '로그인'}
      </button>
      {serverLine}
    </form>
  );
}
