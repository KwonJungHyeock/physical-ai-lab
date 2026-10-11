'use client';

/**
 * 해결 · 원리 › 대학 · 더 깊이: the problem's Python task (engine/education/lab/pyTasks.ts). The
 * student writes the function in a small editor and presses [실행·채점]: the code runs in the
 * simulator's Python worker (engine/python/client.ts gradePython — the same sandbox and time
 * limit), the function is called with each case, and the table shows what it returned against what
 * the simulator expects. Errors come back in plain words with the line and the traceback's last
 * line. The code is kept per task on this computer (localStorage).
 */

import { useEffect, useRef, useState } from 'react';

import { RUN_TIMEOUT_MS, gradePython, warmPython } from '@/engine/python/client';
import type { GradeRaw } from '@/engine/python/grade';
import { checkCall, fmtValue, pyTask, type CaseVerdict } from '@/engine/education/lab/pyTasks';
import type { SiteProblem } from '@/engine/education/lab/siteText';
import type { LabId } from '@/engine/education/park';

import css from './pytask.module.css';

const keyOf = (lab: LabId, prob: SiteProblem) => `learn-pytask-${lab}-${prob}`;

const readCode = (lab: LabId, prob: SiteProblem): string | null => {
  try {
    return localStorage.getItem(keyOf(lab, prob));
  } catch {
    return null;
  }
};

const writeCode = (lab: LabId, prob: SiteProblem, code: string | null) => {
  try {
    if (code === null) localStorage.removeItem(keyOf(lab, prob));
    else localStorage.setItem(keyOf(lab, prob), code);
  } catch {
    /* private mode: the code just is not kept */
  }
};

type Outcome = { raw: GradeRaw; verdicts: CaseVerdict[] } | { failed: string };

export default function PyTask({ lab, prob }: { lab: LabId; prob: SiteProblem }) {
  const task = pyTask(lab, prob);
  const [code, setCode] = useState(task.starter);
  const [phase, setPhase] = useState<'idle' | 'loading' | 'running'>('idle');
  const [out, setOut] = useState<Outcome | null>(null);
  const gutter = useRef<HTMLDivElement>(null);
  /** The run whose result may still show (a newer run, or another task, makes it stale). */
  const runId = useRef(0);
  /** Esc then Tab leaves the editor (Tab alone indents). */
  const escaped = useRef(false);

  // The kept code, read after hydration (the page is a static export); another task starts fresh.
  useEffect(() => {
    runId.current += 1;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCode(readCode(lab, prob) ?? pyTask(lab, prob).starter);
    setOut(null);
    setPhase('idle');
  }, [lab, prob]);

  const edit = (next: string) => {
    setCode(next);
    writeCode(lab, prob, next === task.starter ? null : next);
  };

  const run = async () => {
    if (phase !== 'idle') return;
    const id = ++runId.current;
    setPhase('loading');
    try {
      await warmPython();
      if (id !== runId.current) return;
      setPhase('running');
      const raw = await gradePython(code, task.fn, task.cases.map((c) => c.args));
      if (id !== runId.current) return;
      setOut({ raw, verdicts: raw.error || raw.missing ? [] : task.cases.map((c, i) => checkCall(c, raw.calls[i] ?? {})) });
    } catch (e) {
      if (id !== runId.current) return;
      const msg = e instanceof Error ? e.message : String(e);
      setOut({ failed: /pyodide|fetch|import/i.test(msg) ? `파이썬을 불러오지 못했어요. 페이지를 새로 고친 뒤 다시 해 보세요. (${msg})` : msg });
    } finally {
      if (id === runId.current) setPhase('idle');
    }
  };

  const reset = () => {
    if (code !== task.starter && !window.confirm('지금 코드를 지우고 처음 코드로 돌아갈까요?')) return;
    edit(task.starter);
    setOut(null);
  };

  const lines = code.split('\n').length;
  const passed = out && 'raw' in out ? out.verdicts.filter((v) => v.ok).length : 0;

  return (
    <div className={css.box}>
      <div className={css.head}>
        <small>Python 과제 · 자동 채점</small>
        <b>{task.title}</b>
      </div>
      {task.statement.map((l) => (
        <div key={l} className={css.line}>
          {l}
        </div>
      ))}

      <div className={css.editor}>
        <div className={css.gutter} ref={gutter} aria-hidden="true">
          {Array.from({ length: lines }, (_, i) => (
            <span key={i} className={out && 'raw' in out && out.raw.error?.line === i + 1 ? css.errLine : undefined}>
              {i + 1}
            </span>
          ))}
        </div>
        <textarea
          className={css.code}
          value={code}
          rows={Math.min(18, Math.max(8, lines + 1))}
          spellCheck={false}
          wrap="off"
          autoCapitalize="off"
          autoCorrect="off"
          aria-label={`${task.fn} 함수 코드 (Tab은 들여쓰기, Esc 다음 Tab은 빠져나가기, Ctrl+Enter는 실행·채점)`}
          onFocus={() => void warmPython().catch(() => undefined)}
          onChange={(e) => edit(e.target.value)}
          onScroll={(e) => {
            if (gutter.current) gutter.current.scrollTop = e.currentTarget.scrollTop;
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              escaped.current = true;
              return;
            }
            const wasEscaped = escaped.current;
            escaped.current = false;
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              void run();
              return;
            }
            if (e.key !== 'Tab' || e.shiftKey || wasEscaped) return;
            e.preventDefault();
            const el = e.currentTarget;
            const { selectionStart: a, selectionEnd: b, value } = el;
            edit(value.slice(0, a) + '    ' + value.slice(b));
            requestAnimationFrame(() => {
              el.selectionStart = el.selectionEnd = a + 4;
            });
          }}
        />
      </div>

      <div className={css.bar}>
        <button type="button" className={css.run} onClick={() => void run()} disabled={phase !== 'idle'}>
          {phase === 'loading' ? '파이썬 준비 중…' : phase === 'running' ? '채점 중…' : '실행·채점'}
        </button>
        <button type="button" className={css.reset} onClick={reset} disabled={phase !== 'idle'}>
          처음 코드로
        </button>
        <span className={css.note}>{phase === 'loading' ? '처음 한 번은 몇 초 걸려요' : `케이스 ${task.cases.length}개 · ${RUN_TIMEOUT_MS / 1000}초 제한`}</span>
      </div>

      {out && 'failed' in out && <div className={css.err}>{out.failed}</div>}
      {out && 'raw' in out && <Result task={task} raw={out.raw} verdicts={out.verdicts} passed={passed} />}
    </div>
  );
}

function Result({ task, raw, verdicts, passed }: { task: ReturnType<typeof pyTask>; raw: GradeRaw; verdicts: CaseVerdict[]; passed: number }) {
  return (
    <>
      {raw.error && (
        <div className={css.err}>
          <b>{raw.error.line ? `${raw.error.line}번째 줄에서 멈췄어요.` : '코드를 실행하다 멈췄어요.'}</b> {raw.error.hint ?? '오류 내용을 보고 고쳐 보세요.'}
          <code>{raw.error.last}</code>
        </div>
      )}
      {raw.missing && (
        <div className={css.err}>
          <b>{task.fn} 함수를 찾지 못했어요.</b> 처음 코드의 <code className={css.inline}>def {task.fn}(…)</code> 이름은 그대로 두세요.
        </div>
      )}
      {verdicts.length > 0 && (
        <>
          <div className={passed === verdicts.length ? css.allOk : css.sum}>{passed === verdicts.length ? `✓ 케이스 ${verdicts.length}개를 모두 통과했어요.` : `케이스 ${verdicts.length}개 중 ${passed}개 통과`}</div>
          <table className={css.table}>
            <thead>
              <tr>
                <th aria-label="결과" />
                <th>상황 · 호출</th>
                <th>내 값</th>
                <th>기대값</th>
              </tr>
            </thead>
            <tbody>
              {task.cases.map((c, i) => {
                const v = verdicts[i];
                return (
                  <tr key={c.note} className={v.ok ? css.ok : css.bad}>
                    <td className={css.mark}>{v.ok ? '✓' : '✗'}</td>
                    <td>
                      {c.note}
                      <code className={css.call}>
                        {task.fn}({c.args.map((a) => fmtValue(a)).join(', ')})
                      </code>
                      {v.why && <span className={css.why}>{v.why}</span>}
                    </td>
                    <td className={css.val}>{v.got}</td>
                    <td className={css.val}>
                      {/* Only the lab's own situation shows its answer (the one the screen already worked out); the
                          changed-number cases stay hidden until passed, so the function has to be right, not the numbers copied. */}
                      {i === 0 || v.ok ? (
                        <>
                          {fmtValue(c.expected)}
                          {typeof c.expected === 'number' || Array.isArray(c.expected) ? <small> ±{c.tol}</small> : null}
                        </>
                      ) : (
                        <small>숨김 (식이 맞으면 맞아요)</small>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}
      {raw.output && (
        <details className={css.output}>
          <summary>print 출력</summary>
          <code>{raw.output}</code>
        </details>
      )}
    </>
  );
}
