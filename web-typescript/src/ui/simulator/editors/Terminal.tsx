'use client';

/**
 * The Python tab's terminal (the robot's Linux board, as students will meet it): an Ubuntu-like shell
 * over a set of files (engine/simulator/terminal/shell.ts), nano over the screen for editing, and
 * python3 handed to the console, which runs the file and prints what happens. Above the screen a card
 * of the commands to try; it folds away to give the terminal the room.
 */

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';

import { complete, prompt, runCommand, shortPath, writeFile, type ShellState, type TermLine } from '@/engine/simulator/terminal/shell';

import css from './terminal.module.css';

const FOLD_KEY = 'robot-console-term-fold';
const fileName = (p: string) => p.slice(p.lastIndexOf('/') + 1);

/** How a python3 run ended. */
export type PyEnd = 'pass' | 'fail' | 'error' | 'stopped';

export interface TermCardApi {
  copy(cmd: string): void;
  copied: string | null;
}

interface Props {
  shell: ShellState;
  busy: boolean;
  greet: string;
  card(api: TermCardApi): ReactNode;
  /** A file written (nano's save, cp, the reset): the owner keeps it. */
  onSaved(): void;
  onPython(path: string, text: string, print: (l: TermLine) => void): Promise<PyEnd | null>;
  /** After a python3 run, with how it ended. */
  onRan?(path: string, text: string, end: PyEnd): void;
  onStop(): void;
}

export function Terminal(p: Props) {
  const s = p.shell;
  const [lines, setLines] = useState<TermLine[]>(() => [
    { text: 'Ubuntu 22.04 LTS (RDK X5)', tone: 'dim' },
    { text: p.greet, tone: 'dim' },
  ]);
  const [input, setInput] = useState('');
  const [hist, setHist] = useState(-1);
  const [nano, setNano] = useState<{ path: string; text: string; saved: string; ask: boolean } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [folded, setFolded] = useState(() => {
    try {
      return localStorage.getItem(FOLD_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [, redraw] = useState(0);
  const screen = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const area = useRef<HTMLTextAreaElement>(null);

  const print = (l: TermLine) => setLines((ls) => [...ls.slice(-400), l]);

  useEffect(() => {
    screen.current?.scrollTo({ top: screen.current.scrollHeight });
  }, [lines]);
  useEffect(() => {
    if (nano) area.current?.focus();
    else field.current?.focus({ preventScroll: true });
  }, [nano]);

  const fold = (v: boolean) => {
    setFolded(v);
    try {
      localStorage.setItem(FOLD_KEY, v ? '1' : '0');
    } catch {
      /* this session only */
    }
  };

  const exec = async (line: string) => {
    print({ text: `${prompt(s)} ${line}`, tone: 'cmd' });
    setInput('');
    setHist(-1);
    const r = runCommand(s, line);
    r.lines.forEach(print);
    p.onSaved();
    redraw((n) => n + 1);
    const a = r.action;
    if (!a) return;
    if (a.kind === 'clear') return setLines([]);
    if (a.kind === 'nano') return setNano({ path: a.path, text: a.text, saved: a.text, ask: false });
    const end = await p.onPython(a.path, a.text, print);
    if (end) p.onRan?.(a.path, a.text, end);
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.ctrlKey && (e.key === 'c' || e.key === 'C')) {
      if (p.busy) {
        e.preventDefault();
        print({ text: '^C', tone: 'warn' });
        p.onStop();
      } else if (!field.current || field.current.selectionStart === field.current.selectionEnd) {
        e.preventDefault();
        print({ text: `${prompt(s)} ${input}^C`, tone: 'cmd' });
        setInput('');
      }
      return;
    }
    if (p.busy) return;
    if (e.ctrlKey && (e.key === 'l' || e.key === 'L')) {
      e.preventDefault();
      setLines([]);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      void exec(input);
    } else if (e.key === 'Tab') {
      e.preventDefault();
      setInput(complete(s, input));
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const h = s.history;
      if (!h.length) return;
      const k = e.key === 'ArrowUp' ? (hist < 0 ? h.length - 1 : Math.max(0, hist - 1)) : hist < 0 ? -1 : hist + 1;
      if (k < 0 || k >= h.length) {
        setHist(-1);
        setInput('');
      } else {
        setHist(k);
        setInput(h[k]);
      }
    }
  };

  const save = (n: { path: string; text: string }, close: boolean) => {
    writeFile(s, n.path, n.text);
    p.onSaved();
    print({ text: `[ ${fileName(n.path)} 에 ${n.text.split('\n').length}줄을 저장했어요 ]`, tone: 'ok' });
    setNano(close ? null : { path: n.path, text: n.text, saved: n.text, ask: false });
  };
  const nanoKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!nano) return;
    if (nano.ask) {
      e.preventDefault();
      if (e.key === 'y' || e.key === 'Y') save(nano, true);
      else if (e.key === 'n' || e.key === 'N') setNano(null);
      else if (e.key === 'Escape' || (e.ctrlKey && e.key === 'c')) setNano({ ...nano, ask: false });
      return;
    }
    if (e.ctrlKey && (e.key === 'o' || e.key === 'O' || e.key === 's' || e.key === 'S')) {
      e.preventDefault();
      save(nano, false);
    } else if (e.ctrlKey && (e.key === 'x' || e.key === 'X')) {
      e.preventDefault();
      if (nano.text === nano.saved) setNano(null);
      else setNano({ ...nano, ask: true });
    }
  };

  const copy = (cmd: string) => {
    const done = () => {
      setCopied(cmd);
      window.setTimeout(() => setCopied((c) => (c === cmd ? null : c)), 1600);
    };
    // Where the clipboard is not allowed, the command goes straight into the prompt.
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(cmd).then(done, () => setInput(cmd));
    else setInput(cmd);
    setFocusAsk((n) => n + 1);
  };
  // After a [복사] the prompt takes the keys (a ref may not be touched from the card's render).
  const [focusAsk, setFocusAsk] = useState(0);
  useEffect(() => {
    if (focusAsk) field.current?.focus({ preventScroll: true });
  }, [focusAsk]);

  return (
    <div className={css.term}>
      {folded ? (
        <button type="button" className={css.unfold} onClick={() => fold(false)}>
          ▾ 실습 카드 펼치기
        </button>
      ) : (
        <div className={css.cardWrap}>
          <button type="button" className={css.foldBtn} onClick={() => fold(true)} title="카드를 접어 터미널을 넓게">
            ▴ 접기
          </button>
          {p.card({ copy, copied })}
        </div>
      )}
      <div className={css.screen} ref={screen} onClick={() => !nano && field.current?.focus({ preventScroll: true })} role="log" aria-label="터미널">
        {lines.map((l, i) => (
          <div key={i} className={css[l.tone]}>
            {l.text || ' '}
          </div>
        ))}
        {!p.busy && (
          <label className={css.inputLine}>
            <span className={css.prompt}>{prompt(s)}</span>
            <input ref={field} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={onKey} spellCheck={false} autoComplete="off" autoCapitalize="off" aria-label="명령 입력" />
          </label>
        )}
        {p.busy && (
          <div className={css.running}>
            실행 중… <kbd>Ctrl</kbd>+<kbd>C</kbd> 멈춤
            <input ref={field} className={css.ghost} onKeyDown={onKey} aria-label="실행 중 (Ctrl+C 로 멈춤)" readOnly />
            <button type="button" onClick={p.onStop}>
              ■ 멈춤
            </button>
          </div>
        )}
      </div>
      {nano && (
        <div className={css.nano} role="dialog" aria-label={`nano ${fileName(nano.path)}`}>
          <div className={css.nanoHead}>
            <span>GNU nano 6.2</span>
            <b>{shortPath(nano.path)}</b>
            <span>{nano.text !== nano.saved ? '고침' : ''}</span>
          </div>
          <textarea ref={area} value={nano.text} onChange={(e) => setNano({ ...nano, text: e.target.value })} onKeyDown={nanoKey} spellCheck={false} />
          {nano.ask ? (
            <div className={css.nanoAsk}>
              고친 내용을 저장할까요?
              <button type="button" onClick={() => save(nano, true)}>
                Y 예
              </button>
              <button type="button" onClick={() => setNano(null)}>
                N 아니요
              </button>
              <button type="button" onClick={() => setNano({ ...nano, ask: false })}>
                취소
              </button>
            </div>
          ) : (
            <div className={css.nanoKeys}>
              <button type="button" onClick={() => save(nano, false)}>
                <kbd>^O</kbd> 저장
              </button>
              <button type="button" onClick={() => (nano.text === nano.saved ? setNano(null) : setNano({ ...nano, ask: true }))}>
                <kbd>^X</kbd> 나가기
              </button>
              <span>(^ = Ctrl 키)</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** The Python tab's two ways: write the code, or run it from a terminal. */
export function ModeSeg({ mode, busy, onMode }: { mode: 'code' | 'term'; busy: boolean; onMode(m: 'code' | 'term'): void }) {
  return (
    <div className={css.modeSeg} role="tablist" aria-label="파이썬 작업 방식">
      {(
        [
          ['code', '코드'],
          ['term', '터미널'],
        ] as const
      ).map(([m, name]) => (
        <button key={m} type="button" role="tab" aria-selected={mode === m} disabled={busy && mode !== m} onClick={() => onMode(m)}>
          {name}
        </button>
      ))}
    </div>
  );
}

/** A card's numbered commands, each with its [복사]. */
export function CmdList({ api, steps, extra }: { api: TermCardApi; steps: { cmd: string; what: string; key?: boolean; done?: boolean }[]; extra?: Record<number, ReactNode> }) {
  return (
    <ol className={css.cmds}>
      {steps.map((st, i) => (
        <li key={i} data-key={st.key || undefined} data-done={st.done || undefined}>
          <code>{st.cmd}</code>
          <button type="button" onClick={() => api.copy(st.cmd)}>
            {api.copied === st.cmd ? '복사됨' : '복사'}
          </button>
          <small>{st.what}</small>
          {extra?.[i]}
        </li>
      ))}
    </ol>
  );
}
