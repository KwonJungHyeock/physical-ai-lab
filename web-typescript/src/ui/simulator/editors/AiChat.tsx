'use client';

/**
 * AI 에게 시키기, the work panel's AI screen: a conversation with a model in Ollama on this PC (through
 * the desktop program, engine/simulator/localAi.ts) while the 3D view stays clear beside it.
 *
 * The AI decides what each sentence asks for (speak.ts answerMode):
 *  - 바로 하기 (do): its lines run at once in the simulator from the scene as it is now, and the result
 *    (finished, or stopped where and why, joints that came near a limit) comes back into the conversation;
 *  - 블록 짜기 (blocks): a whole program, put into the block editor when the student says so;
 *  - 대답 (talk): an answer in words, with moves to try if a change would help.
 * Every answer goes through the block checks first; one that fails them is sent back once by itself.
 * The scene (coordinates, joints, what the tool holds) and the last turns go with every question, so
 * "조금 더 왼쪽", "왜 멈췄어?", "J3 에 무리가 가는데?" make sense. Nothing reaches a real robot from here.
 */

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';

import type { LlmMode } from '@/engine/account/client';
import type { ArmSpec } from '@/engine/robot/arms';
import type { Theme } from '@/engine/simulator/board';
import type { EffectorId } from '@/engine/simulator/effectors';
import { localAiAsk, localAiStatus, pickModel, type LocalAiStatus } from '@/engine/simulator/localAi';
import type { Problem } from '@/engine/simulator/program';
import { answerMode, answerProgram, historyText, problemsText, speakContext, speakExamples, type TalkTurn } from '@/engine/simulator/speak';

import css from './aichat.module.css';

/** How a run the AI asked for went (Console aiRun). */
export interface AiRunResult {
  ok: boolean;
  stopped: boolean;
  /** One sentence: "끝까지 움직였어요 (4.2초)" or "3번째 줄에서 멈췄어요: …". */
  text: string;
  /** Joints that came near a limit or worked hard. */
  notes: string[];
}

export type ChatTurn = (TalkTurn & { kind: 'ai'; id: number; code: string; errors: Problem[]; state?: 'running' | 'done' | 'failed'; result?: AiRunResult; inserted?: boolean }) | { kind: 'note'; id: number; text: string };

interface Props {
  status: LocalAiStatus;
  onStatus(s: LocalAiStatus): void;
  turns: ChatTurn[];
  onTurns(update: (t: ChatTurn[]) => ChatTurn[]): void;
  code: string;
  arm: ArmSpec;
  effector: EffectorId;
  cameraFlange: boolean;
  theme: Theme;
  poses: Record<string, readonly number[]>;
  /** The scene now, in the arm's coordinates (speak.ts sceneText). */
  scene(): string;
  busy: boolean;
  /** The line of the AI's program running now (-1: none). */
  runLine: number;
  /** Run these lines in the simulator from where everything is now. */
  onRun(code: string): Promise<AiRunResult>;
  onStop(): void;
  /** Put this program into the block editor (the panel goes to 코딩). */
  onInsert(code: string): void;
}

const MODEL_KEY = 'ai-model';
const gb = (b: number) => `${(b / 1e9).toFixed(1)} GB`;
const MODE_TAG: Record<LlmMode, string> = { do: '바로 하기', blocks: '블록 짜기', talk: '대답' };
let nextId = 1;

function Spark({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path d="M12 2.5l2.1 6.3 6.4 2.2-6.4 2.2L12 19.5l-2.1-6.3L3.5 11l6.4-2.2z" fill="currentColor" />
      <path d="M19 15.5l.9 2.6 2.6.9-2.6.9L19 22.5l-.9-2.6-2.6-.9 2.6-.9z" fill="currentColor" opacity=".75" />
    </svg>
  );
}

/** The run, as the AI hears it back. */
const runText = (r: AiRunResult) => [r.text, ...r.notes].join('; ');

export default function AiChat({ status, onStatus, turns, onTurns, code, arm, effector, cameraFlange, theme, poses, scene, busy, runLine, onRun, onStop, onInsert }: Props) {
  const [text, setText] = useState('');
  const [model, setModel] = useState('');
  const [waiting, setWaiting] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const list = useRef<HTMLOListElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(MODEL_KEY);
    } catch {
      /* private window */
    }
    // Follows the models Ollama has now.
    setModel(pickModel(status.models, saved));
  }, [status.models]);

  // The newest turn in view.
  useEffect(() => {
    const el = list.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns, waiting]);

  const recheck = useCallback(async () => {
    setChecking(true);
    onStatus(await localAiStatus());
    setChecking(false);
  }, [onStatus]);

  const choose = (m: string) => {
    setModel(m);
    try {
      localStorage.setItem(MODEL_KEY, m);
    } catch {
      /* this session only */
    }
  };

  const update = (id: number, patch: Partial<Extract<ChatTurn, { kind: 'ai' }>>) => onTurns((t) => t.map((x) => (x.kind === 'ai' && x.id === id ? { ...x, ...patch } : x)));

  const run = async (id: number, prog: string) => {
    update(id, { state: 'running', result: undefined });
    const r = await onRun(prog);
    update(id, { state: r.ok ? 'done' : 'failed', result: r, run: runText(r) });
  };

  const ask = async (words: string) => {
    const said = words.trim();
    if (!said || waiting || !model) return;
    setWaiting(said);
    setText('');
    const past = turns.filter((t): t is Extract<ChatTurn, { kind: 'ai' }> => t.kind === 'ai');
    const base = () => ({ ...speakContext({ arm, effector, theme, poseNames: Object.keys(poses), program: code }), scene: scene(), history: historyText(past) });
    const ctx = { theme, effector, cameraFlange, poses };
    try {
      let a = await localAiAsk(said, model, base());
      let prog = a.ok && a.lines?.length ? answerProgram(a.lines, ctx) : { code: '', errors: [] as Problem[] };
      // Lines the blocks do not take go back once, with what was wrong, before the student sees them.
      if (prog.errors.length) {
        const again = await localAiAsk(said, model, { ...base(), errors: problemsText(prog.code, prog.errors).slice(0, 590) });
        const prog2 = again.ok && again.lines?.length ? answerProgram(again.lines, ctx) : null;
        if (prog2 && prog2.errors.length <= prog.errors.length) {
          a = again;
          prog = prog2;
        }
      }
      const mode = answerMode(said, a);
      const id = nextId++;
      const lines = a.ok ? (a.lines ?? []) : [];
      onTurns((t) => [...t, { kind: 'ai', id, said, mode, ok: a.ok, explain: a.explain, lines, code: prog.code, errors: prog.errors }]);
      setWaiting(null);
      if (mode === 'do' && a.ok && prog.code && !prog.errors.length) await run(id, prog.code);
    } catch (e) {
      onTurns((t) => [...t, { kind: 'note', id: nextId++, text: e instanceof Error ? e.message : 'AI 에게 답을 받지 못했어요.' }]);
      setText(said);
      setWaiting(null);
    }
  };

  const send = (e?: FormEvent) => {
    e?.preventDefault();
    void ask(text);
  };

  const ready = status.ok && !!model;
  const last = [...turns].reverse().find((t): t is Extract<ChatTurn, { kind: 'ai' }> => t.kind === 'ai');
  // Next things to say, from how the last turn went.
  const chips = !last
    ? speakExamples(effector, theme)
    : last.state === 'failed'
      ? ['왜 멈췄어?', '고쳐서 다시 해 줘']
      : last.result?.notes.length
        ? ['무리 없이 다시 해 줘', '왜 그래?']
        : last.state === 'done'
          ? ['방금 한 걸 블록으로 짜 줘', '처음 자세로 돌아가']
          : [];

  if (!status.ok || status.models.length === 0) {
    return (
      <div className={css.chat}>
        <div className={css.setup}>
          <span className={css.badge}>
            <Spark size={20} />
          </span>
          <b>{!status.ok ? (status.error ?? 'Ollama 가 켜져 있지 않아요.') : 'Ollama 는 켜져 있지만 받아 둔 모델이 없어요.'}</b>
          <ol>
            {!status.ok && <li>이 PC 에 Ollama 가 없으면 ollama.com 에서 내려받아 설치해요.</li>}
            <li>
              명령창에서 <code>ollama pull qwen3:8b</code> 로 모델을 받아요.
            </li>
            <li>Ollama 를 켜고 아래 [다시 찾기] 를 눌러요.</li>
          </ol>
          <button type="button" className={css.ghost} disabled={checking} onClick={() => void recheck()}>
            {checking ? '찾는 중…' : '다시 찾기'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={css.chat}>
      <div className={css.bar}>
        <select className={css.model} value={model} onChange={(e) => choose(e.target.value)} disabled={!!waiting} aria-label="AI 모델" title="이 PC 의 Ollama 에 있는 모델">
          {status.models.map((m) => (
            <option key={m.name} value={m.name}>
              {m.name}
              {m.params ? ` · ${m.params}` : ''} · {gb(m.size)}
            </option>
          ))}
        </select>
        <button type="button" className={css.link} disabled={!turns.length || !!waiting || busy} onClick={() => onTurns(() => [])} title="대화를 지우고 새로 시작해요">
          새 대화
        </button>
      </div>

      <ol className={css.turns} ref={list} aria-live="polite">
        {turns.length === 0 && !waiting && (
          <li className={css.hello}>
            <span className={css.badge}>
              <Spark size={20} />
            </span>
            <p>
              로봇에게 하듯 말해 보세요. <b>“빨간 블록 집어”</b> 처럼 시키면 바로 움직이고, <b>“블록으로 짜 줘”</b> 하면 블록 프로그램을 만들어요. 움직인 결과를 보고 “조금 더 왼쪽”, “왜 멈췄어?” 처럼 이어서 말하면 돼요.
            </p>
            <small>여기서 시킨 일은 시뮬레이션에서만 움직여요. 실제 로봇은 블록을 넣고 [로봇 실행] 으로 돌려요.</small>
          </li>
        )}
        {turns.map((t) =>
          t.kind === 'note' ? (
            <li key={t.id} className={css.note} role="status">
              {t.text}
            </li>
          ) : (
            <li key={t.id} className={css.pair}>
              <p className={css.me}>{t.said}</p>
              <div className={css.ai} data-ok={t.ok || undefined} data-mode={t.mode}>
                <span className={css.tag}>
                  <Spark size={12} /> {t.ok ? MODE_TAG[t.mode ?? 'talk'] : '못 해요'}
                </span>
                <p>{t.explain}</p>
                {t.ok && t.code && (
                  <details className={css.lines} open={t.mode !== 'do' || t.errors.length > 0 || t.state === 'running'}>
                    <summary>블록 {t.code.split('\n').filter((l, k) => k >= 2 && l.trim()).length}줄</summary>
                    <ol>
                      {t.code.split('\n').map((l, k) =>
                        k < 2 || !l.trim() ? null : (
                          <li key={k} data-bad={t.errors.some((p) => p.line === k + 1) || undefined} data-now={(t.state === 'running' && runLine === k + 1) || undefined}>
                            <code>{l}</code>
                          </li>
                        ),
                      )}
                    </ol>
                  </details>
                )}
                {t.errors.length > 0 && <p className={css.bad}>블록 검사에서 걸렸어요: {t.errors[0].msg}</p>}
                {t.state === 'running' && (
                  <div className={css.run} data-state="running">
                    <span className={css.dots} aria-hidden="true">
                      <i />
                      <i />
                      <i />
                    </span>
                    시뮬레이션에서 움직이는 중…
                    <button type="button" className={css.stop} onClick={onStop}>
                      ■ 멈추기
                    </button>
                  </div>
                )}
                {t.result && (
                  <div className={css.run} data-state={!t.result.ok ? 'failed' : t.result.notes.length ? 'warn' : 'done'}>
                    <b>{t.result.ok && !t.result.notes.length ? '✓' : '!'}</b>
                    <span>
                      {t.result.text}
                      {t.result.notes.length > 0 && <em> · {t.result.notes.join(' · ')}</em>}
                    </span>
                  </div>
                )}
                {t.ok && t.code && !t.errors.length && t.state !== 'running' && (
                  <div className={css.btns}>
                    {t.mode !== 'do' && (
                      <button type="button" className={css.primary} disabled={busy || !!waiting} onClick={() => void run(t.id, t.code)}>
                        ▶ {t.mode === 'talk' ? '이렇게 해 보기' : '지금 해 보기'}
                      </button>
                    )}
                    {t.mode === 'do' && t.state && (
                      <button type="button" className={css.ghost} disabled={busy || !!waiting} onClick={() => void run(t.id, t.code)}>
                        ↻ 한 번 더
                      </button>
                    )}
                    {t.inserted ? (
                      <span className={css.done}>블록 편집기에 넣었어요</span>
                    ) : (
                      <button
                        type="button"
                        className={t.mode === 'blocks' ? css.primary : css.ghost}
                        disabled={busy}
                        onClick={() => {
                          update(t.id, { inserted: true });
                          onInsert(t.code);
                        }}
                      >
                        블록 편집기에 넣기
                      </button>
                    )}
                  </div>
                )}
              </div>
            </li>
          ),
        )}
        {waiting && (
          <li className={css.pair}>
            <p className={css.me}>{waiting}</p>
            <div className={css.thinking} aria-busy="true">
              <span className={css.dots} aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              생각하는 중… 이 PC 의 AI 라 조금 걸릴 수 있어요.
            </div>
          </li>
        )}
      </ol>

      <form className={css.input} onSubmit={send}>
        {chips.length > 0 && !waiting && (
          <div className={css.chips}>
            {chips.map((c) => (
              <button key={c} type="button" disabled={busy} onClick={() => void ask(c)}>
                {c}
              </button>
            ))}
          </div>
        )}
        <div className={css.box}>
          <textarea
            ref={input}
            rows={2}
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, 200))}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="예: 빨간 블록 집어서 로봇 앞에 놔"
            aria-label="로봇에게 시킬 일"
            disabled={!!waiting}
          />
          <button type="submit" className={css.send} disabled={!!waiting || busy || !text.trim() || !ready} aria-label="보내기" title="보내기 (Enter)">
            ↑
          </button>
        </div>
      </form>
    </div>
  );
}
