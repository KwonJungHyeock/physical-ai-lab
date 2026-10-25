'use client';

/**
 * AI 버튼 over the 3D view: the student says what the arm should do, a model in Ollama on this PC
 * (through the desktop program, engine/simulator/localAi.ts) answers with block lines, the block
 * checks look at them, and [▶ 해 보기] puts them into the block editor and runs them in the
 * simulator. Nothing reaches a real robot from here: that stays the run bar's [로봇 실행], after a
 * passed simulation, as for any program. Console shows the button only where the blocks can do the
 * job (the arm's own desk or the AI kit, block level, not 공정 짜기 or a cell).
 */

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';

import type { ArmSpec } from '@/engine/robot/arms';
import type { Theme } from '@/engine/simulator/board';
import type { EffectorId } from '@/engine/simulator/effectors';
import { localAiAsk, localAiStatus, pickModel, type LocalAiStatus } from '@/engine/simulator/localAi';
import type { Problem } from '@/engine/simulator/program';
import { answerProgram, problemsText, speakContext, speakExamples } from '@/engine/simulator/speak';

import css from './ai.module.css';

interface Props {
  status: LocalAiStatus;
  onStatus(s: LocalAiStatus): void;
  code: string;
  arm: ArmSpec;
  effector: EffectorId;
  cameraFlange: boolean;
  theme: Theme;
  poses: Record<string, readonly number[]>;
  busy: boolean;
  /** The replay bar is showing: sit above it. */
  lifted: boolean;
  /** Put this program into the block editor and run it in the simulator. */
  onTry(code: string): void;
  /** Only put it into the block editor. */
  onInsert(code: string): void;
}

interface Answer {
  asked: string;
  ok: boolean;
  explain: string;
  code: string;
  errors: Problem[];
  /** What the student did with it. */
  used?: 'tried' | 'inserted';
}

const MODEL_KEY = 'ai-model';
const gb = (b: number) => `${(b / 1e9).toFixed(1)} GB`;

function Spark() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path d="M12 2.5l2.1 6.3 6.4 2.2-6.4 2.2L12 19.5l-2.1-6.3L3.5 11l6.4-2.2z" fill="currentColor" />
      <path d="M19 15.5l.9 2.6 2.6.9-2.6.9L19 22.5l-.9-2.6-2.6-.9 2.6-.9z" fill="currentColor" opacity=".75" />
    </svg>
  );
}

export default function AiButton({ status, onStatus, code, arm, effector, cameraFlange, theme, poses, busy, lifted, onTry, onInsert }: Props) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [model, setModel] = useState('');
  const [waiting, setWaiting] = useState(false);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  /** The program before the AI's went in, for [되돌리기]. */
  const [before, setBefore] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(MODEL_KEY);
    } catch {
      /* private window */
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- follows the models Ollama has now
    setModel(pickModel(status.models, saved));
  }, [status.models]);

  const recheck = useCallback(async () => {
    setChecking(true);
    onStatus(await localAiStatus());
    setChecking(false);
  }, [onStatus]);

  const toggle = () => {
    setOpen((v) => !v);
    if (!open) {
      if (!status.ok) void recheck();
      window.setTimeout(() => input.current?.focus(), 60);
    }
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const choose = (m: string) => {
    setModel(m);
    try {
      localStorage.setItem(MODEL_KEY, m);
    } catch {
      /* this session only */
    }
  };

  const ask = async (words: string, errors?: string) => {
    const said = words.trim();
    if (!said || waiting || !model) return;
    setWaiting(true);
    setNote(null);
    try {
      const ctx = speakContext({ arm, effector, theme, poseNames: Object.keys(poses), program: code, errors });
      const a = await localAiAsk(said, model, ctx);
      const prog = a.ok ? answerProgram(a.lines ?? [], { theme, effector, cameraFlange, poses }) : { code: '', errors: [] };
      setAnswer({ asked: said, ok: a.ok, explain: a.explain, code: prog.code, errors: prog.errors });
      setText('');
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'AI 에게 답을 받지 못했어요.');
    } finally {
      setWaiting(false);
    }
  };

  const send = (e: FormEvent) => {
    e.preventDefault();
    void ask(text);
  };

  const use = (how: 'tried' | 'inserted') => {
    if (!answer) return;
    setBefore(code);
    if (how === 'tried') {
      onTry(answer.code);
      // Out of the way while the arm moves; the button brings the answer (and 되돌리기) back.
      setOpen(false);
    } else onInsert(answer.code);
    setAnswer({ ...answer, used: how });
  };

  const ready = status.ok && !!model;
  const now = status.models.find((m) => m.name === model);
  const lines = answer?.code.split('\n') ?? [];

  return (
    <div className={css.wrap} data-lift={lifted || undefined} data-open={open || undefined}>
      {open && (
        <section className={css.panel} aria-label="AI 에게 시키기">
          <header className={css.head}>
            <span className={css.badge}>
              <Spark />
            </span>
            <b>AI 에게 시키기</b>
            {status.ok && status.models.length > 0 ? (
              <select className={css.model} value={model} onChange={(e) => choose(e.target.value)} disabled={waiting} aria-label="AI 모델" title="이 PC 의 Ollama 에 있는 모델">
                {status.models.map((m) => (
                  <option key={m.name} value={m.name}>
                    {m.name}
                    {m.params ? ` · ${m.params}` : ''} · {gb(m.size)}
                  </option>
                ))}
              </select>
            ) : (
              <small className={css.where}>이 PC 의 AI</small>
            )}
            <button type="button" className={css.x} onClick={() => setOpen(false)} aria-label="닫기">
              ×
            </button>
          </header>

          {!status.ok ? (
            <div className={css.setup}>
              <p>
                <b>{status.error ?? 'Ollama 가 켜져 있지 않아요.'}</b>
              </p>
              <ol>
                <li>이 PC 에 Ollama 가 없으면 ollama.com 에서 내려받아 설치해요.</li>
                <li>
                  명령창에서 <code>ollama pull qwen3:8b</code> 로 모델을 받아요.
                </li>
                <li>Ollama 를 켜고 아래 [다시 찾기] 를 눌러요.</li>
              </ol>
              <button type="button" className={css.ghost} disabled={checking} onClick={() => void recheck()}>
                {checking ? '찾는 중…' : '다시 찾기'}
              </button>
            </div>
          ) : status.models.length === 0 ? (
            <div className={css.setup}>
              <p>
                <b>Ollama 는 켜져 있지만 받아 둔 모델이 없어요.</b>
              </p>
              <p>
                명령창에서 <code>ollama pull qwen3:8b</code> 로 받은 뒤 [다시 찾기] 를 눌러요.
              </p>
              <button type="button" className={css.ghost} disabled={checking} onClick={() => void recheck()}>
                {checking ? '찾는 중…' : '다시 찾기'}
              </button>
            </div>
          ) : (
            <>
              {!answer && !waiting && (
                <div className={css.hello}>
                  <p>로봇이 할 일을 말로 적어 보세요. AI 가 블록을 만들고, [▶ 해 보기] 를 누르면 시뮬레이션으로 움직여요.</p>
                  <div className={css.chips}>
                    {speakExamples(effector, theme).map((ex) => (
                      <button key={ex} type="button" onClick={() => setText(ex)}>
                        {ex}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {waiting && (
                <div className={css.thinking} aria-busy="true">
                  <span className={css.dots} aria-hidden="true">
                    <i />
                    <i />
                    <i />
                  </span>
                  블록을 만들고 있어요… 이 PC 의 AI 라 조금 걸릴 수 있어요.
                </div>
              )}
              {answer && !waiting && (
                <div className={css.answer} data-ok={answer.ok || undefined}>
                  <p className={css.said}>“{answer.asked}”</p>
                  <p>{answer.explain}</p>
                  {answer.ok && (
                    <>
                      <ol className={css.lines} aria-label="만든 블록">
                        {lines.map((l, k) =>
                          k < 2 || !l.trim() ? null : (
                            <li key={k} data-bad={answer.errors.some((p) => p.line === k + 1) || undefined}>
                              <code>{l}</code>
                            </li>
                          ),
                        )}
                      </ol>
                      {answer.errors.length > 0 && (
                        <p className={css.bad}>
                          블록 검사에서 {answer.errors.length}곳이 걸렸어요: {answer.errors[0].msg}
                        </p>
                      )}
                      <div className={css.btns}>
                        {answer.used ? (
                          <span className={css.done}>{answer.used === 'tried' ? '블록에 넣고 시뮬레이션을 돌렸어요' : '블록에 넣었어요'}</span>
                        ) : (
                          <>
                            <button type="button" className={css.primary} disabled={busy || answer.errors.length > 0} onClick={() => use('tried')}>
                              ▶ 해 보기
                            </button>
                            <button type="button" className={css.ghost} disabled={busy || answer.errors.length > 0} onClick={() => use('inserted')}>
                              블록만 넣기
                            </button>
                          </>
                        )}
                        {answer.errors.length > 0 && (
                          <button type="button" className={css.ghost} onClick={() => void ask(answer.asked, problemsText(answer.code, answer.errors))}>
                            다시 만들기
                          </button>
                        )}
                        {before !== null && answer.used && (
                          <button
                            type="button"
                            className={css.link}
                            disabled={busy}
                            onClick={() => {
                              onInsert(before);
                              setBefore(null);
                              setAnswer({ ...answer, used: undefined });
                            }}
                          >
                            ↶ 되돌리기
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}
              {note && (
                <p className={css.note} role="status">
                  {note}
                </p>
              )}
              <form className={css.input} onSubmit={send}>
                <input ref={input} value={text} onChange={(e) => setText(e.target.value.slice(0, 200))} placeholder="예: 빨간 블록 집어서 1번 자리에 놔" aria-label="로봇에게 시킬 일" disabled={waiting} />
                <button type="submit" className={css.primary} disabled={waiting || !text.trim() || !ready}>
                  보내기
                </button>
              </form>
            </>
          )}
        </section>
      )}
      <button type="button" className={css.fab} data-on={ready || undefined} data-busy={waiting || undefined} aria-expanded={open} onClick={toggle} title="AI 에게 말로 시키기 (이 PC 의 AI)">
        <span className={css.badge}>
          <Spark />
        </span>
        <span className={css.label}>
          <b>AI 에게 시키기</b>
          <small>{waiting ? '만드는 중…' : status.ok ? (now ? now.name : '모델 없음') : 'AI 꺼짐'}</small>
        </span>
      </button>
    </div>
  );
}
