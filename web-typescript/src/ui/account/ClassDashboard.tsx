'use client';

/**
 * 학급 관리 (teachers and the operator): a full page under the top bar.
 *  - Left: the classes (own classes; the operator sees every class), a new class, the archived ones;
 *    for the operator also 교사 계정 and 클라우드 동기화.
 *  - Right: the class picked (ClassPanel) — live grid, students and PINs, lessons open, names.
 * Every call goes to the class server with the teacher's login; a refused login (401) asks to log
 * in again. No student name ever leaves this PC (the names are in the teacher's browser: roster.ts).
 */

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';

import { ClassApiError, ClassServerClient, type ClassInfo } from '@/engine/account';

import { useAccount } from './AccountProvider';
import ClassPanel from './ClassPanel';
import { SyncPanel, TeachersPanel } from './OperatorPanels';
import { errorText } from './labels';
import css from './account.module.css';

type Pane = { kind: 'class'; id: string } | { kind: 'teachers' } | { kind: 'sync' } | { kind: 'none' };

export default function ClassDashboard({ onClose }: { onClose(): void }) {
  const a = useAccount();
  const s = a.session;
  const client = useMemo(() => (s && s.role !== 'student' ? ClassServerClient.forSession(s) : null), [s]);
  const [classes, setClasses] = useState<ClassInfo[] | null>(null);
  const [pane, setPane] = useState<Pane>({ kind: 'none' });
  const [name, setName] = useState('');
  const [adding, setAdding] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const { loginLost } = a;
  const fail = useCallback(
    (e: unknown) => {
      if (e instanceof ClassApiError && e.status === 401) loginLost();
      setErr(errorText(e));
    },
    [loginLost],
  );

  const load = useCallback(async () => {
    if (!client) return;
    try {
      const r = await client.classes();
      setClasses(r.classes);
      setErr(null);
      setPane((p) => (p.kind === 'none' && r.classes.some((c) => !c.archived) ? { kind: 'class', id: r.classes.find((c) => !c.archived)!.id } : p));
    } catch (e) {
      fail(e);
    }
  }, [client, fail]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a fetch; its answer sets the state
    void load();
  }, [load]);

  // Esc goes back to the lessons (unless a dialog of its own is open).
  useEffect(() => {
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('.class-cards') && !a.login) onClose();
    };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose, a.login]);

  if (!s || s.role === 'student' || !client) return null;
  const operator = s.role === 'operator';

  const create = async (e: FormEvent) => {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    try {
      const c = await client.createClass(n);
      setName('');
      setAdding(false);
      setClasses((l) => [...(l ?? []), c]);
      setPane({ kind: 'class', id: c.id });
      setErr(null);
    } catch (x) {
      fail(x);
    }
  };

  const active = (classes ?? []).filter((c) => !c.archived);
  const archived = (classes ?? []).filter((c) => c.archived);
  const picked = pane.kind === 'class' ? (classes ?? []).find((c) => c.id === pane.id) : undefined;

  const classBtn = (c: ClassInfo) => (
    <li key={c.id}>
      <button type="button" className={css.classBtn} aria-current={picked?.id === c.id || undefined} onClick={() => setPane({ kind: 'class', id: c.id })}>
        <b>{c.name}</b>
        <small>
          <span className={css.mono}>{c.code}</span> · 학생 {c.students.length}명{c.archived ? ' · 보관됨' : ''}
        </small>
      </button>
    </li>
  );

  return (
    <div className={`${css.scope} ${css.dash}`} role="region" aria-label="학급 관리">
      <nav className={css.dashNav} aria-label="학급">
        <div className={css.dashWho}>
          <span className={css.kicker}>학급 관리</span>
          <b>
            {s.user.username} <small>{operator ? '운영자' : '선생님'}</small>
          </b>
        </div>
        <h3>{operator ? '모든 학급' : '내 학급'}</h3>
        {classes === null ? (
          <p className={css.muted}>불러오는 중…</p>
        ) : active.length === 0 ? (
          <p className={css.muted}>아직 학급이 없어요. 아래에서 첫 학급을 만들어요.</p>
        ) : (
          <ul className={css.classList}>{active.map(classBtn)}</ul>
        )}
        {adding ? (
          <form className={css.newClass} onSubmit={create}>
            <input value={name} onChange={(e) => setName(e.target.value.slice(0, 40))} placeholder="예: 2학년 3반" autoFocus aria-label="새 학급 이름" />
            <small>학급 이름표만 적어요 (학생 이름은 적지 않아요).</small>
            <span className={css.formBtns}>
              <button type="button" className={css.ghostBtn} onClick={() => setAdding(false)}>
                취소
              </button>
              <button type="submit" className={css.primaryBtn} disabled={!name.trim()}>
                만들기
              </button>
            </span>
          </form>
        ) : (
          <button type="button" className={css.addBtn} onClick={() => setAdding(true)}>
            + 새 학급 만들기
          </button>
        )}
        {archived.length > 0 && (
          <>
            <button type="button" className={css.foldBtn} aria-expanded={showArchived} onClick={() => setShowArchived((v) => !v)}>
              보관한 학급 {archived.length}개 {showArchived ? '▲' : '▼'}
            </button>
            {showArchived && <ul className={css.classList}>{archived.map(classBtn)}</ul>}
          </>
        )}
        {operator && (
          <>
            <h3>운영자</h3>
            <button type="button" className={css.navBtn} aria-current={pane.kind === 'teachers' || undefined} onClick={() => setPane({ kind: 'teachers' })}>
              교사 계정
            </button>
            <button type="button" className={css.navBtn} aria-current={pane.kind === 'sync' || undefined} onClick={() => setPane({ kind: 'sync' })}>
              클라우드 동기화
            </button>
          </>
        )}
        <button type="button" className={css.backBtn} onClick={onClose}>
          ← 수업 화면으로
        </button>
      </nav>

      <main className={css.dashMain}>
        {err && (
          <p className={css.error} role="alert">
            {err}
            <button type="button" className={css.linkBtn} onClick={() => setErr(null)}>
              닫기
            </button>
          </p>
        )}
        {picked ? (
          <ClassPanel
            key={picked.id}
            cls={picked}
            client={client}
            server={s.baseUrl}
            addresses={a.status?.addresses ?? []}
            onChanged={(c) => setClasses((l) => (l ?? []).map((x) => (x.id === c.id ? c : x)))}
            onDeleted={() => {
              setPane({ kind: 'none' });
              void load();
            }}
            onError={fail}
          />
        ) : pane.kind === 'teachers' ? (
          <TeachersPanel client={client} me={s.user.id} onError={fail} />
        ) : pane.kind === 'sync' ? (
          <SyncPanel client={client} onError={fail} />
        ) : (
          <div className={css.emptyPane}>
            <h2>학급을 골라요</h2>
            <p>왼쪽에서 학급을 고르거나 새 학급을 만들어요. 학급마다 학생 로그인 카드를 뽑고, 수업 중에는 학생들이 어디까지 했는지 실시간으로 봐요.</p>
          </div>
        )}
      </main>
    </div>
  );
}
