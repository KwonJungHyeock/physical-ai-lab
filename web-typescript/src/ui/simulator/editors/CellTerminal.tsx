'use client';

/**
 * 실습 셀's Python, the way it is done on the robot's Linux board: a terminal. Above it the step's
 * command card (go to the lab folder, read the program, change one value after a prediction, run it);
 * below, an Ubuntu-like terminal over the lab files (engine/simulator/terminal) with nano for the one
 * change and python3 to run the file on the cell (the console runs it and prints what happens).
 */

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';

import { missionById } from '@/engine/simulator/cell/missions';
import type { CellId } from '@/engine/simulator/cell/cells';
import { labAt, labChanged, labDir, labFiles, labOf, labPath, labsOf, labSource, lineOf, type Lab } from '@/engine/simulator/terminal/labs';
import { complete, newShell, prompt, resetFiles as resetShellFiles, runCommand, shortPath, writeFile, type ShellState, type TermLine } from '@/engine/simulator/terminal/shell';

import css from './terminal.module.css';

const FILES_KEY = 'robot-console-term-files';

/** How a python3 run ended (the card compares it with the prediction). */
export type PyEnd = 'pass' | 'fail' | 'error' | 'stopped';

interface Props {
  cell: CellId;
  mission: string | null;
  busy: boolean;
  /** Run a program file on the cell, printing as it goes. */
  onPython(path: string, text: string, print: (l: TermLine) => void): Promise<PyEnd | null>;
  onStop(): void;
  onOpenStep(mission: string): void;
}

/** The files as the student left them (only the changed and new ones are kept). */
function loadShell(): ShellState {
  const s = newShell();
  try {
    const kept = JSON.parse(localStorage.getItem(FILES_KEY) ?? '{}') as Record<string, string>;
    for (const [path, text] of Object.entries(kept)) writeFile(s, path, text);
  } catch {
    /* the lab files as they come */
  }
  return s;
}
function saveFiles(s: ShellState) {
  const base = labFiles();
  const changed = Object.fromEntries(Object.entries(s.files).filter(([p, t]) => base[p] !== t));
  try {
    localStorage.setItem(FILES_KEY, JSON.stringify(changed));
  } catch {
    /* this session only */
  }
}

const fileName = (p: string) => p.slice(p.lastIndexOf('/') + 1);

export function CellTerminal(p: Props) {
  // One shell for the terminal's life: its folder, files and history change in place.
  const [s] = useState(loadShell);
  const [lines, setLines] = useState<TermLine[]>(() => [
    { text: 'Ubuntu 22.04 LTS (RDK X5) · 실습 셀 터미널', tone: 'dim' },
    { text: '명령 목록은 help. 위 카드의 명령을 [복사] 해서 붙여 넣어도 돼요.', tone: 'dim' },
  ]);
  const [input, setInput] = useState('');
  const [hist, setHist] = useState(-1);
  const [nano, setNano] = useState<{ path: string; text: string; saved: string; ask: boolean } | null>(null);
  const [guess, setGuess] = useState<Record<string, number>>({});
  const [last, setLast] = useState<{ lab: string; changed: boolean; end: PyEnd } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [, redraw] = useState(0);
  const screen = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const area = useRef<HTMLTextAreaElement>(null);

  const lab = labOf(p.mission);
  const print = (l: TermLine) => setLines((ls) => [...ls.slice(-400), l]);

  useEffect(() => {
    screen.current?.scrollTo({ top: screen.current.scrollHeight });
  }, [lines]);
  useEffect(() => {
    if (nano) area.current?.focus();
    else field.current?.focus({ preventScroll: true });
  }, [nano]);

  const exec = async (line: string) => {
    print({ text: `${prompt(s)} ${line}`, tone: 'cmd' });
    setInput('');
    setHist(-1);
    const r = runCommand(s, line);
    r.lines.forEach(print);
    saveFiles(s);
    redraw((n) => n + 1);
    const a = r.action;
    if (!a) return;
    if (a.kind === 'clear') return setLines([]);
    if (a.kind === 'nano') return setNano({ path: a.path, text: a.text, saved: a.text, ask: false });
    // python3: the console runs it on the cell.
    const at = labAt(a.path);
    const end = await p.onPython(a.path, a.text, print);
    if (at && end && end !== 'stopped') setLast({ lab: at.id, changed: a.text === labChanged(at), end });
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

  const nanoSave = () => {
    if (!nano) return;
    writeFile(s, nano.path, nano.text);
    saveFiles(s);
    print({ text: `[ ${fileName(nano.path)} 에 ${nano.text.split('\n').length}줄을 저장했어요 ]`, tone: 'ok' });
    setNano({ ...nano, saved: nano.text, ask: false });
  };
  const nanoKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!nano) return;
    if (nano.ask) {
      e.preventDefault();
      if (e.key === 'y' || e.key === 'Y') {
        writeFile(s, nano.path, nano.text);
        saveFiles(s);
        print({ text: `[ ${fileName(nano.path)} 에 저장했어요 ]`, tone: 'ok' });
        setNano(null);
      } else if (e.key === 'n' || e.key === 'N') setNano(null);
      else if (e.key === 'Escape' || (e.ctrlKey && e.key === 'c')) setNano({ ...nano, ask: false });
      return;
    }
    if (e.ctrlKey && (e.key === 'o' || e.key === 'O' || e.key === 's' || e.key === 'S')) {
      e.preventDefault();
      nanoSave();
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
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(cmd).then(done, () => setInput(cmd));
    else setInput(cmd);
    field.current?.focus({ preventScroll: true });
  };

  const resetFiles = () => {
    if (!window.confirm('실습 파일을 모두 처음 상태로 되돌릴까요? 고친 내용과 새로 만든 파일이 지워져요.')) return;
    resetShellFiles(s);
    saveFiles(s);
    print({ text: '[ 실습 파일을 처음 상태로 되돌렸어요 ]', tone: 'ok' });
    redraw((n) => n + 1);
  };

  return (
    <div className={css.term}>
      {lab ? <LabCard lab={lab} s={s} guess={guess[lab.id]} onGuess={(k) => setGuess((g) => ({ ...g, [lab.id]: k }))} last={last?.lab === lab.id ? last : null} copied={copied} onCopy={copy} onReset={resetFiles} /> : <NoLab cell={p.cell} mission={p.mission} onOpenStep={p.onOpenStep} />}
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
              고친 내용을 저장할까요? <button onClick={() => nanoKey({ key: 'y', ctrlKey: false, preventDefault() {} } as KeyboardEvent<HTMLTextAreaElement>)}>Y 예</button>
              <button onClick={() => setNano(null)}>N 아니요</button>
              <button onClick={() => setNano({ ...nano, ask: false })}>취소</button>
            </div>
          ) : (
            <div className={css.nanoKeys}>
              <button type="button" onClick={nanoSave}>
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

const END_TEXT: Record<PyEnd, string> = { pass: '통과', fail: '실행은 끝났지만 목표를 못 채움', error: '도중에 멈춤', stopped: '멈춤' };

function LabCard({ lab, s, guess, onGuess, last, copied, onCopy, onReset }: { lab: Lab; s: ShellState; guess?: number; onGuess(k: number): void; last: { changed: boolean; end: PyEnd } | null; copied: string | null; onCopy(c: string): void; onReset(): void }) {
  const dir = shortPath(labDir(lab));
  const src = labSource(lab);
  const at = lineOf(src, lab.change.from);
  const now = s.files[labPath(lab)] ?? '';
  const changedNow = now.includes(lab.change.to) && !now.includes(lab.change.from);
  const steps: { cmd: string; what: string; key?: boolean }[] = [
    { cmd: `cd ${dir}`, what: '실습 폴더로 가요' },
    { cmd: `cat ${lab.file}`, what: '프로그램을 읽어요' },
    { cmd: `python3 ${lab.file}`, what: '그대로 실행해 통과를 확인해요' },
    { cmd: `nano ${lab.file}`, what: `${at}번째 줄의 ${lab.change.from} 을 ${lab.change.to} 로 고쳐요`, key: true },
    { cmd: `python3 ${lab.file}`, what: '바꾼 값으로 다시 실행해요' },
  ];
  return (
    <section className={css.card} aria-label="터미널 실습 카드">
      <header>
        <b>
          {lab.mission} {missionById(lab.mission)?.title} · 터미널 실습
        </b>
        <button type="button" className={css.reset} onClick={onReset} title="실습 파일을 처음 상태로">
          파일 처음대로
        </button>
      </header>
      <ol className={css.cmds}>
        {steps.map((st, i) => (
          <li key={i} data-key={st.key || undefined} data-done={(i === 3 && changedNow) || undefined}>
            <code>{st.cmd}</code>
            <button type="button" onClick={() => onCopy(st.cmd)}>
              {copied === st.cmd ? '복사됨' : '복사'}
            </button>
            <small>{st.what}</small>
            {i === 3 && (
              <div className={css.predict}>
                <b>예상 먼저:</b> {lab.predict.q}
                <span>
                  {lab.predict.options.map((o, k) => (
                    <button key={k} type="button" data-on={guess === k || undefined} onClick={() => onGuess(k)}>
                      {o}
                    </button>
                  ))}
                </span>
              </div>
            )}
          </li>
        ))}
      </ol>
      <details className={css.read}>
        <summary>읽을 곳 3줄</summary>
        <ul>
          {lab.read.map((r) => (
            <li key={r.find}>
              <code>
                {lineOf(src, r.find)}줄 {r.find}
              </code>
              {r.note}
            </li>
          ))}
        </ul>
      </details>
      {last && last.changed && (
        <div className={css.verdict} data-right={guess === lab.predict.answer || undefined}>
          <b>결과: {END_TEXT[last.end]}</b> · 실제로는 「{lab.predict.options[lab.predict.answer]}」
          {guess !== undefined && <> · 내 예상 「{lab.predict.options[guess]}」 {guess === lab.predict.answer ? '맞았어요' : '달랐어요'}</>}
          <p>{lab.predict.why}</p>
        </div>
      )}
      {last && !last.changed && <div className={css.verdict}>그대로 실행: {END_TEXT[last.end]}. 이제 4번으로 값을 하나 바꿔 봐요.</div>}
    </section>
  );
}

function NoLab({ cell, mission, onOpenStep }: { cell: CellId; mission: string | null; onOpenStep(m: string): void }) {
  const list = labsOf(cell);
  return (
    <section className={css.card} aria-label="터미널 실습 카드">
      <header>
        <b>{mission ? `${mission} 단계에는 터미널 실습이 없어요` : '자유 실습'}</b>
      </header>
      <p className={css.note}>이 셀의 터미널 실습은 아래 단계에 있어요. 다른 폴더도 cd ~/cell 로 둘러볼 수 있어요.</p>
      <div className={css.go}>
        {list.map((l) => (
          <button key={l.id} type="button" onClick={() => onOpenStep(l.mission)}>
            {l.mission} {missionById(l.mission)?.title} →
          </button>
        ))}
      </div>
    </section>
  );
}
