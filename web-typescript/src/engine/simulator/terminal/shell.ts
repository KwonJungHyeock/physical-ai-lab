/**
 * The terminal's shell: a small Ubuntu-like shell over the lab files, enough to learn the everyday
 * commands of the robot's Linux board (cd · ls · pwd · cat · nano · python3 · cp · clear · history ·
 * help). It is not a real shell: what it cannot do it says, in the shell's own words and in Korean.
 * Editing (nano) and running (python3) are handed to the screen as actions.
 */

import { HOME, HOST, USER, labFiles } from './labs';

export type Tone = 'out' | 'dim' | 'err' | 'ok' | 'warn' | 'cmd' | 'info';
export interface TermLine {
  text: string;
  tone: Tone;
}

export interface ShellState {
  cwd: string;
  /** Every file by its full path (a folder is any prefix of one). */
  files: Record<string, string>;
  history: string[];
}

export type ShellAction = { kind: 'nano'; path: string; text: string } | { kind: 'python'; path: string; text: string } | { kind: 'clear' };

export interface ShellResult {
  lines: TermLine[];
  action?: ShellAction;
}

export const COMMANDS = ['cd', 'ls', 'pwd', 'cat', 'nano', 'python3', 'cp', 'clear', 'history', 'help', 'whoami', 'echo'] as const;

export function newShell(files: Record<string, string> = labFiles()): ShellState {
  return { cwd: HOME, files: { ...files }, history: [] };
}

/** The prompt's place: ~ for home. */
export const shortPath = (p: string) => (p === HOME ? '~' : p.startsWith(`${HOME}/`) ? `~${p.slice(HOME.length)}` : p);
export const prompt = (s: ShellState) => `${USER}@${HOST}:${shortPath(s.cwd)}$`;

/** A path typed in this folder, made whole (~, .., .). */
export function resolve(cwd: string, p: string): string {
  const raw = p.startsWith('~') ? HOME + p.slice(1) : p.startsWith('/') ? p : `${cwd}/${p}`;
  const out: string[] = [];
  for (const part of raw.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') out.pop();
    else out.push(part);
  }
  return `/${out.join('/')}`;
}

const isFile = (s: ShellState, p: string) => p in s.files;
const isDir = (s: ShellState, p: string) => p === '/' || Object.keys(s.files).some((f) => f.startsWith(`${p}/`)) || p === HOME;

/** What is directly in a folder: names, folders first-class (with a trailing /). */
export function list(s: ShellState, dir: string): { name: string; dir: boolean }[] {
  const pre = dir === '/' ? '/' : `${dir}/`;
  const seen = new Map<string, boolean>();
  for (const f of Object.keys(s.files)) {
    if (!f.startsWith(pre)) continue;
    const rest = f.slice(pre.length);
    const i = rest.indexOf('/');
    if (i < 0) seen.set(rest, false);
    else seen.set(rest.slice(0, i), true);
  }
  return [...seen].map(([name, d]) => ({ name, dir: d })).sort((a, b) => a.name.localeCompare(b.name));
}

const out = (text: string): TermLine => ({ text, tone: 'out' });
const err = (text: string): TermLine => ({ text, tone: 'err' });
const info = (text: string): TermLine => ({ text, tone: 'info' });

/** Split a command line into words (double or single quotes keep spaces). */
export function words(line: string): string[] {
  const w: string[] = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) w.push(m[1] ?? m[2] ?? m[3]);
  return w;
}

const HELP = [
  '이 터미널에서 쓰는 명령',
  '  pwd                 지금 있는 폴더',
  '  ls [폴더]           폴더 안 보기 (ls -l: 크기까지)',
  '  cd 폴더             폴더로 가기 (cd .. 위로, cd ~ 집으로)',
  '  cat 파일            파일 내용 보기',
  '  nano 파일           파일 고치기 (Ctrl+O 저장, Ctrl+X 나가기)',
  '  cp 원본 사본        파일 복사 (고치기 전에 사본을 두면 좋아요)',
  '  python3 파일.py     파이썬 프로그램 실행 (Ctrl+C 멈춤)',
  '  history · clear     지난 명령 · 화면 지우기',
  '  ↑ ↓ 지난 명령, Tab 이름 채우기',
];

/** Run one command line. `s` is changed in place (folder, files, history). */
export function runCommand(s: ShellState, line: string): ShellResult {
  const text = line.trim();
  if (!text) return { lines: [] };
  s.history.push(text);
  const [cmd, ...args] = words(text);
  const flags = args.filter((a) => a.startsWith('-'));
  const plain = args.filter((a) => !a.startsWith('-'));
  switch (cmd) {
    case 'help':
      return { lines: HELP.map(info) };
    case 'pwd':
      return { lines: [out(s.cwd)] };
    case 'whoami':
      return { lines: [out(USER)] };
    case 'echo':
      return { lines: [out(args.join(' '))] };
    case 'clear':
      return { lines: [], action: { kind: 'clear' } };
    case 'history':
      return { lines: s.history.map((h, i) => out(`${String(i + 1).padStart(5)}  ${h}`)) };
    case 'cd': {
      const to = resolve(s.cwd, plain[0] ?? '~');
      if (isFile(s, to)) return { lines: [err(`bash: cd: ${plain[0]}: Not a directory`)] };
      if (!isDir(s, to)) return { lines: [err(`bash: cd: ${plain[0]}: No such file or directory`), info('  ls 로 이 폴더에 무엇이 있는지 먼저 보세요.')] };
      s.cwd = to;
      return { lines: [] };
    }
    case 'ls': {
      const target = resolve(s.cwd, plain[0] ?? '.');
      if (isFile(s, target)) return { lines: [out(plain[0])] };
      if (!isDir(s, target)) return { lines: [err(`ls: cannot access '${plain[0]}': No such file or directory`)] };
      const items = list(s, target);
      if (flags.some((f) => f.includes('l'))) {
        return {
          lines: items.map((it) => {
            const size = it.dir ? 4096 : new TextEncoder().encode(s.files[`${target === '/' ? '' : target}/${it.name}`]).length;
            return { text: `${it.dir ? 'drwxr-xr-x' : '-rw-r--r--'} 1 ${USER} ${USER} ${String(size).padStart(5)} Oct 24 09:00 ${it.name}`, tone: it.dir ? 'cmd' : 'out' } as TermLine;
          }),
        };
      }
      return { lines: items.length ? [out(items.map((it) => (it.dir ? `${it.name}/` : it.name)).join('  '))] : [] };
    }
    case 'cat': {
      if (!plain.length) return { lines: [info('cat 파일이름  — 예: cat README.txt')] };
      const lines: TermLine[] = [];
      for (const a of plain) {
        const p = resolve(s.cwd, a);
        if (isDir(s, p) && !isFile(s, p)) lines.push(err(`cat: ${a}: Is a directory`));
        else if (!isFile(s, p)) lines.push(err(`cat: ${a}: No such file or directory`));
        else lines.push(...s.files[p].split('\n').map(out));
      }
      return { lines };
    }
    case 'cp': {
      if (plain.length < 2) return { lines: [err('cp: missing destination file operand'), info('  cp 원본 사본  — 예: cp four_pins.py four_pins_backup.py')] };
      const from = resolve(s.cwd, plain[0]);
      if (!isFile(s, from)) return { lines: [err(`cp: cannot stat '${plain[0]}': No such file or directory`)] };
      let to = resolve(s.cwd, plain[1]);
      if (isDir(s, to) && !isFile(s, to)) to = `${to}/${from.slice(from.lastIndexOf('/') + 1)}`;
      s.files[to] = s.files[from];
      return { lines: [] };
    }
    case 'nano': {
      if (!plain.length) return { lines: [info('nano 파일이름  — 예: nano four_pins.py')] };
      const p = resolve(s.cwd, plain[0]);
      if (isDir(s, p) && !isFile(s, p)) return { lines: [err(`nano: ${plain[0]}: 폴더는 고칠 수 없어요.`)] };
      return { lines: [], action: { kind: 'nano', path: p, text: s.files[p] ?? '' } };
    }
    case 'python3': {
      if (!plain.length) return { lines: [info('이 터미널에서는 파이썬을 파일로 실행해요: python3 파일이름.py')] };
      const p = resolve(s.cwd, plain[0]);
      if (!isFile(s, p)) return { lines: [err(`python3: can't open file '${p}': [Errno 2] No such file or directory`), info('  ls 로 파일 이름을 확인하고, 그 파일이 있는 폴더에서 실행해요.')] };
      return { lines: [], action: { kind: 'python', path: p, text: s.files[p] } };
    }
    case 'python':
      return { lines: [err("Command 'python' not found, did you mean:"), out("  command 'python3' from deb python3")] };
    case 'sudo':
      return { lines: [info('이 실습에서는 sudo(관리자 권한)가 필요 없어요.')] };
    case 'exit':
      return { lines: [info('이 터미널은 닫지 않아요. 블록 코딩으로 가려면 위의 [블록] 탭을 눌러요.')] };
    default: {
      const near = COMMANDS.find((c) => c.startsWith(cmd.slice(0, 2)));
      return { lines: [err(`${cmd}: command not found`), ...(near ? [info(`  혹시 ${near} 인가요? 명령 목록은 help`)] : [info('  명령 목록은 help')])] };
    }
  }
}

/** Tab: the last word filled in (a command, or a name in its folder). */
export function complete(s: ShellState, line: string): string {
  const m = line.match(/^(.*?)(\S*)$/)!;
  const [head, last] = [m[1], m[2]];
  if (!head.trim()) {
    const hits = COMMANDS.filter((c) => c.startsWith(last));
    return hits.length === 1 ? `${hits[0]} ` : line;
  }
  const slash = last.lastIndexOf('/');
  const dirPart = slash >= 0 ? last.slice(0, slash + 1) : '';
  const base = slash >= 0 ? last.slice(slash + 1) : last;
  const dir = resolve(s.cwd, dirPart || '.');
  const hits = list(s, dir).filter((it) => it.name.startsWith(base));
  if (!hits.length) return line;
  if (hits.length === 1) return `${head}${dirPart}${hits[0].name}${hits[0].dir ? '/' : ' '}`;
  // The common start of the names.
  let common = hits[0].name;
  for (const h of hits) while (!h.name.startsWith(common)) common = common.slice(0, -1);
  return `${head}${dirPart}${common}`;
}

/** nano's save. */
export function writeFile(s: ShellState, path: string, text: string): void {
  s.files[path] = text;
}

/** The lab files as they came (the student's changes and new files gone). */
export function resetFiles(s: ShellState): void {
  s.files = labFiles();
}
