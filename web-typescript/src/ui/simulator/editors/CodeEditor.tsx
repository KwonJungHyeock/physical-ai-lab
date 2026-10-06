'use client';

/**
 * Python editor of the 중급·고급 levels, dressed like a desktop code editor:
 * a file tab, line numbers, Python syntax colours, the running and error
 * lines marked, and a status bar. Underneath it is a plain textarea (so
 * typing, selection, undo and IME input behave as the browser does), with
 * the coloured copy of the text drawn behind it.
 */

import { useRef, useState, type ReactNode } from 'react';

import css from '../console.module.css';

interface Props {
  code: string;
  onCode(code: string): void;
  runningLine: number;
  errorLines: number[];
  /** File name on the tab (main.py, my_node.py). */
  fileName: string;
  /** The program differs from the practice's example. */
  modified: boolean;
  /** Ctrl+Enter / ⌘+Enter. */
  onRun?(): void;
  label?: string;
  /** Right side of the status bar. */
  status?: ReactNode;
}

const KEYWORDS = new Set(
  'and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield'.split(' '),
);
const CONSTANTS = new Set(['True', 'False', 'None']);
const BUILTINS = new Set(
  'print range len list int float str abs max min round sum enumerate zip super dict set tuple sorted reversed isinstance type any all map filter open input bool'.split(' '),
);
const TOKEN =
  /("""[\s\S]*?(?:"""|$)|'''[\s\S]*?(?:'''|$))|([rbfuRBFU]{0,2}(?:"(?:\\.|[^"\\\n])*"?|'(?:\\.|[^'\\\n])*'?))|(#[^\n]*)|(\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b)|(@[A-Za-z_][\w.]*)|([A-Za-z_]\w*)/g;

/** Python source -> coloured spans (the same characters, so it lines up with the textarea). */
function highlight(code: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let prevWord = '';
  let k = 0;
  for (const m of code.matchAll(TOKEN)) {
    const at = m.index ?? 0;
    if (at > last) out.push(code.slice(last, at));
    const text = m[0];
    let cls: string | undefined;
    if (m[1] || m[2]) cls = css.tkString;
    else if (m[3]) cls = css.tkComment;
    else if (m[4]) cls = css.tkNumber;
    else if (m[5]) cls = css.tkDecorator;
    else if (m[6]) {
      if (KEYWORDS.has(text)) cls = css.tkKeyword;
      else if (CONSTANTS.has(text)) cls = css.tkConst;
      else if (text === 'self') cls = css.tkSelf;
      else if (prevWord === 'def' || prevWord === 'class') cls = css.tkDef;
      else if (BUILTINS.has(text)) cls = css.tkBuiltin;
      else if (code[at + text.length] === '(') cls = css.tkCall;
      prevWord = text;
    }
    out.push(cls ? <span key={k++} className={cls}>{text}</span> : text);
    last = at + text.length;
  }
  if (last < code.length) out.push(code.slice(last));
  return out;
}

const LINE_PX = 21;
const PAD_PX = 12;

export default function CodeEditor({ code, onCode, runningLine, errorLines, fileName, modified, onRun, label = '파이썬 코드', status }: Props) {
  const layer = useRef<HTMLDivElement>(null);
  const gutter = useRef<HTMLDivElement>(null);
  const [cursor, setCursor] = useState({ line: 1, col: 1 });
  const lines = code.split('\n').length;

  const track = (el: HTMLTextAreaElement) => {
    const before = el.value.slice(0, el.selectionStart);
    const line = before.split('\n').length;
    setCursor({ line, col: before.length - before.lastIndexOf('\n') });
  };

  return (
    <div className={css.ide}>
      <div className={css.fileTabs}>
        <span className={css.fileTab}>
          <span className={css.pyDot} aria-hidden="true" />
          {fileName}
          {modified && <i className={css.modDot} title="예제에서 바뀐 곳이 있어요" />}
        </span>
      </div>
      <div className={css.codeBox}>
        <div className={css.gutter} ref={gutter} aria-hidden="true">
          {Array.from({ length: lines }, (_, i) => (
            <span key={i} className={i + 1 === runningLine ? css.gRunning : errorLines.includes(i + 1) ? css.gErr : i + 1 === cursor.line ? css.gCursor : undefined}>
              {i + 1}
            </span>
          ))}
        </div>
        <div className={css.codeArea}>
          <div className={css.codeLayer} ref={layer} aria-hidden="true">
            <span className={css.lineMark} style={{ top: PAD_PX + (cursor.line - 1) * LINE_PX }} />
            {errorLines.map((l) => (
              <span key={`e${l}`} className={`${css.lineMark} ${css.lineErr}`} style={{ top: PAD_PX + (l - 1) * LINE_PX }} />
            ))}
            {runningLine > 0 && <span className={`${css.lineMark} ${css.lineRun}`} style={{ top: PAD_PX + (runningLine - 1) * LINE_PX }} />}
            <pre className={css.codeHi}>
              {highlight(code)}
              {'\n'}
            </pre>
          </div>
          <textarea
            className={css.code}
            spellCheck={false}
            wrap="off"
            autoCapitalize="off"
            autoCorrect="off"
            aria-label={label}
            value={code}
            onChange={(e) => {
              onCode(e.target.value);
              track(e.currentTarget);
            }}
            onSelect={(e) => track(e.currentTarget)}
            onScroll={(e) => {
              const { scrollTop, scrollLeft } = e.currentTarget;
              if (layer.current) layer.current.style.transform = `translate(${-scrollLeft}px, ${-scrollTop}px)`;
              if (gutter.current) gutter.current.scrollTop = scrollTop;
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                onRun?.();
                return;
              }
              if (e.key !== 'Tab') return;
              e.preventDefault();
              const el = e.currentTarget;
              const { selectionStart: a, selectionEnd: b, value } = el;
              const next = value.slice(0, a) + '    ' + value.slice(b);
              onCode(next);
              requestAnimationFrame(() => {
                el.selectionStart = el.selectionEnd = a + 4;
              });
            }}
          />
        </div>
      </div>
      <div className={css.statusBar}>
        <span>
          줄 {cursor.line}, 칸 {cursor.col}
        </span>
        <span>Python 3 · PC에서 실행</span>
        <span className={css.statusGrow} />
        {status}
        <span className={css.kbd}>Ctrl+Enter 시뮬레이션</span>
      </div>
    </div>
  );
}
