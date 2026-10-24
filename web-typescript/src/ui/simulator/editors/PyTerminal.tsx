'use client';

/**
 * 로봇팔 Python in a terminal: the program in the code mode is the file ~/robot/my_robot.py here —
 * read it, change it with nano, run it with python3 (the same run as the code mode's [시뮬레이션]).
 */

import { useEffect, useState } from 'react';

import { HOME } from '@/engine/simulator/terminal/labs';
import { newShell, writeFile, type TermLine } from '@/engine/simulator/terminal/shell';

import { CmdList, Terminal, type PyEnd } from './Terminal';
import css from './terminal.module.css';

export const PY_FILE = `${HOME}/robot/my_robot.py`;

interface Props {
  code: string;
  onCode(code: string): void;
  busy: boolean;
  title: string;
  onPython(path: string, text: string, print: (l: TermLine) => void): Promise<PyEnd | null>;
  onStop(): void;
}

export function PyTerminal(p: Props) {
  const [s] = useState(() =>
    newShell({
      [PY_FILE]: p.code,
      [`${HOME}/robot/README.txt`]: '로봇팔 파이썬 실습\n\n  my_robot.py   지금 [코드] 에서 보는 그 프로그램이에요.\n  python3 my_robot.py 로 실행해요.\n',
    }),
  );
  // The code mode and this file are one program: a change there shows here.
  useEffect(() => {
    if (s.files[PY_FILE] !== p.code) writeFile(s, PY_FILE, p.code);
  }, [p.code, s]);
  return (
    <Terminal
      shell={s}
      busy={p.busy}
      greet="로봇팔 터미널 · 명령 목록은 help. [코드] 에서 고친 내용과 같은 파일이에요."
      onSaved={() => {
        if (s.files[PY_FILE] !== p.code) p.onCode(s.files[PY_FILE]);
      }}
      onPython={p.onPython}
      onStop={p.onStop}
      card={(api) => (
        <section className={css.card} aria-label="터미널 실습 카드">
          <header>
            <b>{p.title} · 터미널로 실행</b>
          </header>
          <CmdList
            api={api}
            steps={[
              { cmd: 'cd ~/robot', what: '프로그램 폴더로 가요' },
              { cmd: 'cat my_robot.py', what: '프로그램을 읽어요' },
              { cmd: 'nano my_robot.py', what: '각도 · 속도 같은 값 하나를 바꿔요 (Ctrl+O 저장, Ctrl+X 나가기)', key: true },
              { cmd: 'python3 my_robot.py', what: '실행해요. 3D 로봇이 움직이고 print 는 여기에 찍혀요' },
            ]}
          />
        </section>
      )}
    />
  );
}
