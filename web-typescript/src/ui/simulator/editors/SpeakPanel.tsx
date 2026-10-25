'use client';

/**
 * 말로 만들기, above the blocks: the student says what the robot should do, the class server's AI
 * answers with block lines, shown as a preview with the block checks' verdict. Nothing moves until the
 * student presses [블록에 넣기] — and then only the program in the editor changes; the run is the
 * student's, through 시뮬레이션 first as always. Needs a class login (the key is on the teacher's PC).
 */

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';

import { ClassApiError, type LlmStatus } from '@/engine/account';
import type { ArmSpec } from '@/engine/robot/arms';
import type { Theme } from '@/engine/simulator/board';
import type { EffectorId } from '@/engine/simulator/effectors';
import type { Problem } from '@/engine/simulator/program';
import { answerProgram, problemsText, speakContext, speakExamples } from '@/engine/simulator/speak';

import { useAccount } from '../../account/AccountProvider';
import css from './speak.module.css';

interface Props {
  code: string;
  onCode(code: string): void;
  arm: ArmSpec;
  effector: EffectorId;
  cameraFlange: boolean;
  theme: Theme;
  poses: Record<string, readonly number[]>;
  busy: boolean;
}

type Turn = { who: 'me'; text: string } | { who: 'ai'; id: string; text: string; ok: boolean; code: string; lines: string[]; errors: Problem[]; asked: string; inserted?: boolean } | { who: 'note'; text: string };

const OPEN_KEY = 'speak-open';

export default function SpeakPanel({ code, onCode, arm, effector, cameraFlange, theme, poses, busy }: Props) {
  const account = useAccount();
  const client = account.client();
  const student = account.session?.role === 'student';
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<LlmStatus | null>(null);
  const [offline, setOffline] = useState(false);
  const [text, setText] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [waiting, setWaiting] = useState(false);
  /** The program before the last [블록에 넣기], for [되돌리기]. */
  const [before, setBefore] = useState<string | null>(null);
  const list = useRef<HTMLOListElement>(null);

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- read after hydration
      setOpen(localStorage.getItem(OPEN_KEY) === '1');
    } catch {
      /* private window */
    }
  }, []);
  const toggle = () => {
    setOpen((v) => {
      try {
        localStorage.setItem(OPEN_KEY, v ? '0' : '1');
      } catch {
        /* this session only */
      }
      return !v;
    });
  };

  const refresh = useCallback(() => {
    if (!client) return;
    client.llmStatus().then(
      (s) => {
        setStatus(s);
        setOffline(false);
      },
      (e) => setOffline(e instanceof ClassApiError && e.status === 0),
    );
  }, [client]);
  useEffect(() => {
    if (open) refresh();
  }, [open, refresh]);
  useEffect(() => {
    list.current?.lastElementChild?.scrollIntoView({ block: 'nearest' });
  }, [turns, waiting]);

  const ask = async (words: string, errors?: string) => {
    if (!client || !words.trim() || waiting) return;
    setWaiting(true);
    if (!errors) setTurns((t) => [...t, { who: 'me', text: words.trim() }]);
    try {
      const ctx = speakContext({ arm, effector, theme, poseNames: Object.keys(poses), program: code, errors });
      const a = await client.llmAsk(words.trim(), ctx);
      const lines = a.lines ?? [];
      const prog = a.ok ? answerProgram(lines, { theme, effector, cameraFlange, poses }) : { code: '', errors: [] };
      setTurns((t) => [...t, { who: 'ai', id: a.id, text: a.explain, ok: a.ok, code: prog.code, lines, errors: prog.errors, asked: words.trim() }]);
      setStatus((s) => (s ? { ...s, remaining: a.remaining } : s));
      setText('');
    } catch (e) {
      const msg = e instanceof ClassApiError ? e.message : '답을 받지 못했어요.';
      if (e instanceof ClassApiError && e.status === 0) setOffline(true);
      if (e instanceof ClassApiError && e.code === 'off') refresh();
      setTurns((t) => [...t, { who: 'note', text: msg }]);
    } finally {
      setWaiting(false);
    }
  };

  const send = (e: FormEvent) => {
    e.preventDefault();
    void ask(text);
  };

  const insert = (t: Extract<Turn, { who: 'ai' }>) => {
    setBefore(code);
    onCode(t.code);
    setTurns((all) => all.map((x) => (x === t ? { ...t, inserted: true } : x)));
    if (student) client?.llmInserted(t.id).catch(() => undefined);
  };

  const available = !!client && !offline && !!status?.available;
  const why = !account.session ? '학급 서버에 로그인하면 쓸 수 있어요.' : offline ? '지금은 쓸 수 없어요. 학급 서버(선생님 PC)에 연결되지 않았어요.' : status && !status.available ? (status.reason ?? '선생님이 말로 만들기를 켜지 않았어요.') : null;

  return (
    <section className={css.speak} data-open={open || undefined} aria-label="말로 만들기">
      <button type="button" className={css.head} aria-expanded={open} onClick={toggle}>
        <span className={css.dot} data-on={available || undefined} aria-hidden="true" />
        <b>말로 만들기</b>
        <small>{open ? (available && status ? `오늘 ${status.remaining}번 남음` : 'AI 가 블록을 만들어 줘요') : '로봇에게 시킬 일을 말로 적으면 블록을 만들어 줘요'}</small>
        <span className={css.chev} aria-hidden="true">
          {open ? '▲' : '▼'}
        </span>
      </button>
      {open && (
        <div className={css.body}>
          {why ? (
            <p className={css.off}>
              {why}
              {!account.session && (
                <button type="button" className={css.link} onClick={() => account.openLogin({ reason: 'menu' })}>
                  학급 로그인
                </button>
              )}
            </p>
          ) : (
            <>
              {turns.length === 0 && (
                <div className={css.hello}>
                  <p>로봇이 할 일을 적어 보세요. AI 가 만든 블록을 보고 [블록에 넣기] 를 눌러요. 로봇은 [시뮬레이션] 을 통과한 뒤에만 움직여요.</p>
                  <div className={css.chips}>
                    {speakExamples(effector, theme).map((ex) => (
                      <button key={ex} type="button" onClick={() => setText(ex)}>
                        {ex}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <ol className={css.turns} ref={list}>
                {turns.map((t, i) =>
                  t.who === 'me' ? (
                    <li key={i} className={css.me}>
                      {t.text}
                    </li>
                  ) : t.who === 'note' ? (
                    <li key={i} className={css.note} role="status">
                      {t.text}
                    </li>
                  ) : (
                    <li key={i} className={css.ai} data-ok={t.ok || undefined}>
                      <p>{t.text}</p>
                      {t.ok && t.lines.length > 0 && (
                        <>
                          <ol className={css.preview} aria-label="만든 블록">
                            {t.code.split('\n').map((l, k) =>
                              k < 2 || !l.trim() ? null : (
                                <li key={k} data-bad={t.errors.some((p) => p.line === k + 1) || undefined}>
                                  <code>{l}</code>
                                </li>
                              ),
                            )}
                          </ol>
                          {t.errors.length > 0 && (
                            <p className={css.bad}>
                              블록 검사에서 {t.errors.length}곳이 걸렸어요: {t.errors[0].msg}
                            </p>
                          )}
                          <div className={css.btns}>
                            {t.inserted ? (
                              <span className={css.done}>넣었어요 · 아래 [시뮬레이션] 으로 확인해요</span>
                            ) : (
                              <button type="button" className={css.primary} disabled={busy || t.errors.length > 0} onClick={() => insert(t)}>
                                블록에 넣기
                              </button>
                            )}
                            {t.errors.length > 0 && (
                              <button type="button" disabled={waiting} onClick={() => void ask(t.asked, problemsText(t.code, t.errors))}>
                                다시 만들기
                              </button>
                            )}
                          </div>
                        </>
                      )}
                    </li>
                  ),
                )}
                {waiting && (
                  <li className={css.ai} aria-busy="true">
                    <p className={css.thinking}>블록을 만들고 있어요…{status?.local ? ' 선생님 PC 의 AI 라 조금 걸릴 수 있어요.' : ''}</p>
                  </li>
                )}
              </ol>
              {before !== null && (
                <button
                  type="button"
                  className={css.undo}
                  disabled={busy}
                  onClick={() => {
                    onCode(before);
                    setBefore(null);
                  }}
                >
                  ↶ 넣기 전 블록으로 되돌리기
                </button>
              )}
              <form className={css.input} onSubmit={send}>
                <input value={text} onChange={(e) => setText(e.target.value.slice(0, 200))} placeholder="예: 빨간 블록 집어서 1번 자리에 놔" aria-label="로봇에게 시킬 일" disabled={waiting} />
                <button type="submit" className={css.primary} disabled={waiting || !text.trim() || status?.remaining === 0}>
                  보내기
                </button>
              </form>
            </>
          )}
        </div>
      )}
    </section>
  );
}
