'use client';

/**
 * 실습 셀's Python in a terminal: the step's lab (engine/simulator/terminal/labs.ts) — go to its folder,
 * read the program, predict, change one value with nano, run it with python3 — over the shared
 * terminal (Terminal.tsx). The files the student changed are kept in this browser.
 */

import { useState } from 'react';

import { missionById } from '@/engine/simulator/cell/missions';
import type { CellId } from '@/engine/simulator/cell/cells';
import { labAt, labChanged, labDir, labFiles, labOf, labPath, labsOf, labSource, lineOf, type Lab } from '@/engine/simulator/terminal/labs';
import { newShell, resetFiles, shortPath, writeFile, type ShellState, type TermLine } from '@/engine/simulator/terminal/shell';

import { CmdList, Terminal, type PyEnd, type TermCardApi } from './Terminal';
import css from './terminal.module.css';

export type { PyEnd } from './Terminal';

const FILES_KEY = 'robot-console-term-files';

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

interface Props {
  cell: CellId;
  mission: string | null;
  busy: boolean;
  onPython(path: string, text: string, print: (l: TermLine) => void): Promise<PyEnd | null>;
  onStop(): void;
  onOpenStep(mission: string): void;
}

export function CellTerminal(p: Props) {
  // One shell for the terminal's life: its folder, files and history change in place.
  const [s] = useState(loadShell);
  const [guess, setGuess] = useState<Record<string, number>>({});
  const [last, setLast] = useState<{ lab: string; changed: boolean; end: PyEnd } | null>(null);
  const [, redraw] = useState(0);
  const lab = labOf(p.mission);

  const reset = () => {
    if (!window.confirm('실습 파일을 모두 처음 상태로 되돌릴까요? 고친 내용과 새로 만든 파일이 지워져요.')) return;
    resetFiles(s);
    saveFiles(s);
    redraw((n) => n + 1);
  };

  return (
    <Terminal
      shell={s}
      busy={p.busy}
      greet="실습 셀 터미널 · 명령 목록은 help. 위 카드의 명령을 [복사] 해서 붙여 넣어도 돼요."
      onSaved={() => saveFiles(s)}
      onPython={p.onPython}
      onRan={(path, text, end) => {
        const at = labAt(path);
        if (at && end !== 'stopped') setLast({ lab: at.id, changed: text === labChanged(at), end });
      }}
      onStop={p.onStop}
      card={(api) =>
        lab ? (
          <LabCard api={api} lab={lab} s={s} guess={guess[lab.id]} onGuess={(k) => setGuess((g) => ({ ...g, [lab.id]: k }))} last={last?.lab === lab.id ? last : null} onReset={reset} />
        ) : (
          <NoLab cell={p.cell} mission={p.mission} onOpenStep={p.onOpenStep} />
        )
      }
    />
  );
}

const END_TEXT: Record<PyEnd, string> = { pass: '통과', fail: '실행은 끝났지만 목표를 못 채움', error: '도중에 멈춤', stopped: '멈춤' };

function LabCard({ api, lab, s, guess, onGuess, last, onReset }: { api: TermCardApi; lab: Lab; s: ShellState; guess?: number; onGuess(k: number): void; last: { changed: boolean; end: PyEnd } | null; onReset(): void }) {
  const dir = shortPath(labDir(lab));
  const src = labSource(lab);
  const at = lineOf(src, lab.change.from);
  const now = s.files[labPath(lab)] ?? '';
  const changedNow = now.includes(lab.change.to) && !now.includes(lab.change.from);
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
      <CmdList
        api={api}
        steps={[
          { cmd: `cd ${dir}`, what: '실습 폴더로 가요' },
          { cmd: `cat ${lab.file}`, what: '프로그램을 읽어요' },
          { cmd: `python3 ${lab.file}`, what: '그대로 실행해 통과를 확인해요' },
          { cmd: `nano ${lab.file}`, what: `${at}번째 줄의 ${lab.change.from} 을 ${lab.change.to} 로 고쳐요`, key: true, done: changedNow },
          { cmd: `python3 ${lab.file}`, what: '바꾼 값으로 다시 실행해요' },
        ]}
        extra={{
          3: (
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
          ),
        }}
      />
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
          {guess !== undefined && (
            <>
              {' '}
              · 내 예상 「{lab.predict.options[guess]}」 {guess === lab.predict.answer ? '맞았어요' : '달랐어요'}
            </>
          )}
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
