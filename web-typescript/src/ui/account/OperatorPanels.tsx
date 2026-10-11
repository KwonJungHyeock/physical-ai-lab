'use client';

/**
 * The operator's pages in 학급 관리: 교사 계정 (make, turn off / on, set a new password) and
 * 클라우드 동기화 (off until an https address and the school's key are set; the key is never shown
 * again, only its last 4 characters). What goes to the cloud is pseudonymised by the class server.
 */

import { useCallback, useEffect, useState, type FormEvent } from 'react';

import type { ClassServerClient, SyncView, UserInfo } from '@/engine/account';

import { clock } from './labels';
import css from './account.module.css';

const day = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
};

export function TeachersPanel({ client, me, onError }: { client: ClassServerClient; me: string; onError(e: unknown): void }) {
  const [users, setUsers] = useState<UserInfo[] | null>(null);
  const [name, setName] = useState('');
  const [pw, setPw] = useState('');
  const [role, setRole] = useState<'teacher' | 'operator'>('teacher');
  const [newPw, setNewPw] = useState<{ id: string; pw: string } | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      setUsers((await client.users()).users);
    } catch (e) {
      onError(e);
    }
  }, [client, onError]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a fetch; its answer sets the state
    void load();
  }, [load]);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const u = await client.createTeacher(name.trim(), pw, role);
      setName('');
      setPw('');
      setNote(`${u.username} 계정을 만들었어요. 아이디와 비밀번호를 선생님께 전해 주세요.`);
      void load();
    } catch (x) {
      setPw('');
      onError(x);
    }
  };
  const update = async (id: string, change: { password?: string; disabled?: boolean }, done: string) => {
    try {
      await client.updateTeacher(id, change);
      setNote(done);
      void load();
    } catch (x) {
      onError(x);
    }
  };

  return (
    <section className={css.panel} aria-label="교사 계정">
      <header className={css.panelHead}>
        <div className={css.panelTitle}>
          <h2>교사 계정</h2>
          <p>선생님마다 계정을 만들어 드려요. 선생님은 자기 학급만 보고, 운영자는 모든 학급을 봐요.</p>
        </div>
      </header>
      {note && (
        <p className={css.ok} role="status">
          {note}
        </p>
      )}
      <form className={css.inlineForm} onSubmit={create} autoComplete="off">
        <label className={css.field}>
          <span>아이디</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="예: kim.teacher" spellCheck={false} />
        </label>
        <label className={css.field}>
          <span>
            비밀번호 <small>8자 이상</small>
          </span>
          <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" />
        </label>
        <label className={css.field}>
          <span>역할</span>
          <select value={role} onChange={(e) => setRole(e.target.value as 'teacher' | 'operator')}>
            <option value="teacher">교사</option>
            <option value="operator">운영자</option>
          </select>
        </label>
        <button type="submit" className={css.primaryBtn} disabled={name.trim().length < 3 || pw.length < 8}>
          계정 만들기
        </button>
      </form>
      {!users ? (
        <p className={css.emptyLine}>불러오는 중…</p>
      ) : (
        <table className={css.table}>
          <thead>
            <tr>
              <th>아이디</th>
              <th>역할</th>
              <th>상태</th>
              <th>만든 날</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} data-off={u.disabled || undefined}>
                <td>
                  <b>{u.username}</b>
                  {u.id === me && <small className={css.muted}> (나)</small>}
                </td>
                <td>{u.role === 'operator' ? '운영자' : '교사'}</td>
                <td>{u.disabled ? '꺼짐' : '사용 중'}</td>
                <td>{day(u.createdAt)}</td>
                <td className={css.rowBtns}>
                  {newPw?.id === u.id ? (
                    <>
                      <input
                        type="password"
                        value={newPw.pw}
                        onChange={(e) => setNewPw({ id: u.id, pw: e.target.value })}
                        placeholder="새 비밀번호 (8자 이상)"
                        autoComplete="new-password"
                        aria-label={`${u.username} 새 비밀번호`}
                        autoFocus
                      />
                      <button type="button" className={css.smallBtn} onClick={() => setNewPw(null)}>
                        취소
                      </button>
                      <button
                        type="button"
                        className={css.smallBtn}
                        disabled={newPw.pw.length < 8}
                        onClick={() => {
                          const p = newPw.pw;
                          setNewPw(null);
                          void update(u.id, { password: p }, `${u.username} 의 비밀번호를 바꿨어요.`);
                        }}
                      >
                        바꾸기
                      </button>
                    </>
                  ) : (
                    <>
                      <button type="button" className={css.smallBtn} onClick={() => setNewPw({ id: u.id, pw: '' })}>
                        비밀번호 바꾸기
                      </button>
                      {u.id !== me && (
                        <button type="button" className={css.smallBtn} onClick={() => void update(u.id, { disabled: !u.disabled }, u.disabled ? `${u.username} 계정을 다시 켰어요.` : `${u.username} 계정을 껐어요.`)}>
                          {u.disabled ? '다시 켜기' : '끄기'}
                        </button>
                      )}
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

const INTERVALS = [
  { s: 300, name: '5분마다' },
  { s: 900, name: '15분마다' },
  { s: 3600, name: '1시간마다' },
];

export function SyncPanel({ client, onError }: { client: ClassServerClient; onError(e: unknown): void }) {
  const [view, setView] = useState<SyncView | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [url, setUrl] = useState('');
  const [key, setKey] = useState('');
  const [interval, setIntervalSec] = useState(300);
  const [note, setNote] = useState<string | null>(null);
  const show = useCallback((v: SyncView) => {
    setView(v);
    setEnabled(v.config.enabled);
    setUrl(v.config.url);
    setIntervalSec(v.config.intervalSec || 300);
  }, []);
  useEffect(() => {
    client.sync().then(show, onError);
  }, [client, show, onError]);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    try {
      show(await client.setSync({ enabled, url: url.trim(), intervalSec: interval, ...(key.trim() ? { apiKey: key.trim() } : {}) }));
      setKey('');
      setNote(enabled ? '저장했어요. 곧 첫 동기화를 해요.' : '저장했어요. 동기화는 꺼져 있어요.');
    } catch (x) {
      onError(x);
    }
  };
  const st = view?.status;
  return (
    <section className={css.panel} aria-label="클라우드 동기화">
      <header className={css.panelHead}>
        <div className={css.panelTitle}>
          <h2>클라우드 동기화</h2>
          <p>켜면 학습 기록을 가명으로 바꿔 회사 클라우드로 보내요. 이름 · 번호 · 학급 이름 · 서술형 답은 보내지 않아요. 처음에는 꺼져 있어요.</p>
        </div>
      </header>
      {note && (
        <p className={css.ok} role="status">
          {note}
        </p>
      )}
      {!view ? (
        <p className={css.emptyLine}>불러오는 중…</p>
      ) : (
        <>
          <form className={css.syncForm} onSubmit={save} autoComplete="off">
            <label className={css.switchRow}>
              <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
              <span>
                <b>동기화 {enabled ? '켜짐' : '꺼짐'}</b>
                <small>끄면 이 학급 서버의 기록은 교실 밖으로 나가지 않아요.</small>
              </span>
            </label>
            <label className={css.field}>
              <span>
                클라우드 주소 <small>https:// 로 시작</small>
              </span>
              <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://sync.example.co.kr" spellCheck={false} inputMode="url" />
            </label>
            <label className={css.field}>
              <span>
                API 키 <small>{view.config.apiKey ? `저장된 키 ${view.config.apiKey} · 바꿀 때만 넣어요` : '학교마다 받은 키 (16자 이상)'}</small>
              </span>
              <input type="password" value={key} onChange={(e) => setKey(e.target.value)} autoComplete="new-password" placeholder={view.config.apiKey ? '그대로 두면 저장된 키를 써요' : ''} />
            </label>
            <label className={css.field}>
              <span>보내는 간격</span>
              <select value={interval} onChange={(e) => setIntervalSec(Number(e.target.value))}>
                {INTERVALS.map((i) => (
                  <option key={i.s} value={i.s}>
                    {i.name}
                  </option>
                ))}
              </select>
            </label>
            <div className={css.formBtns}>
              <button
                type="button"
                className={css.ghostBtn}
                disabled={!view.config.enabled}
                onClick={() =>
                  void client.syncNow().then((v) => {
                    show(v);
                    setNote('지금 보내기를 시작했어요.');
                  }, onError)
                }
              >
                지금 보내기
              </button>
              <button type="submit" className={css.primaryBtn}>
                저장
              </button>
            </div>
          </form>
          {st && (
            <dl className={css.syncStatus}>
              <div>
                <dt>마지막 성공</dt>
                <dd>{st.lastOkAt ? `${day(st.lastOkAt)} ${clock(st.lastOkAt)}` : '아직 없음'}</dd>
              </div>
              <div>
                <dt>보낸 기록</dt>
                <dd>{st.sent}개</dd>
              </div>
              <div>
                <dt>보낼 기록</dt>
                <dd>
                  {st.pendingEvents}개{st.pendingDeletes ? ` · 삭제 요청 ${st.pendingDeletes}건` : ''}
                </dd>
              </div>
              {st.lastError && (
                <div data-bad>
                  <dt>마지막 오류</dt>
                  <dd>
                    {st.lastError}
                    {st.lastErrorAt ? ` (${clock(st.lastErrorAt)})` : ''}
                  </dd>
                </div>
              )}
            </dl>
          )}
        </>
      )}
    </section>
  );
}
