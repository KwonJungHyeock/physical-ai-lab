'use client';

/**
 * 자료실: what is taken away from the program, as a shared folder — the folder tree on the left, the
 * open folder's files (tiles or a list) in the middle, the chosen file's preview and download on the
 * right. The folders (archiveTree.ts): the PC programs, the textbooks and question sheets (PDF), the
 * guides and the acceptance-check sheet.
 */

import { useEffect, useReducer, useState, type KeyboardEvent, type ReactNode } from 'react';

import { buildTree, fileCount, folderPath, formatSize, TYPE_LABEL, type ArcFile, type ArcFolder, type ArchiveItem, type FileType } from './archiveTree';
import css from './pages.module.css';

export type { ArchiveItem } from './archiveTree';
/** The open folder's key ('' the top, 'docs/1' …). */
export type ArchiveSection = string;

const VIEW_KEY = 'robot-console-archive-view';
const TYPE_COLOR: Record<FileType, string> = { pdf: '#e5484d', gif: '#7a5cf5', html: '#3454d1', app: '#1fae66', zip: '#f59a1b', exe: '#475467' };

/** Sizes read from the site (HEAD), kept for the session. */
const SIZES = new Map<string, number | null>();
function useSizes(urls: string[]) {
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const key = urls.join('\n');
  useEffect(() => {
    let live = true;
    const todo = key.split('\n').filter((u) => u && !SIZES.has(u));
    if (!todo.length) return;
    todo.forEach((u) => SIZES.set(u, null));
    void Promise.all(
      todo.map(async (u) => {
        try {
          const r = await fetch(u, { method: 'HEAD' });
          const n = Number(r.headers.get('content-length'));
          if (r.ok && n > 0) SIZES.set(u, n);
        } catch {
          /* unknown */
        }
      }),
    ).then(() => live && bump());
    return () => {
      live = false;
    };
  }, [key]);
  return (u?: string) => (u ? (SIZES.get(u) ?? undefined) : undefined);
}

function FolderGlyph({ size = 44, open }: { size?: number; open?: boolean }) {
  return (
    <svg className={css.glyph} width={size} height={(size * 40) / 48} viewBox="0 0 48 40" aria-hidden="true">
      <path d="M3 7.5A3.5 3.5 0 0 1 6.5 4h11.2a3 3 0 0 1 2.1.9L23 8h18.5A3.5 3.5 0 0 1 45 11.5V33a3.5 3.5 0 0 1-3.5 3.5h-35A3.5 3.5 0 0 1 3 33z" fill="#7aa2ff" />
      <path
        d={
          open
            ? 'M5.5 15.5A3.5 3.5 0 0 1 9 12.5h35.5a2.5 2.5 0 0 1 2.4 3.2l-4.6 17.5a3.5 3.5 0 0 1-3.4 2.8H6.5A3.5 3.5 0 0 1 3 32.5z'
            : 'M3 14.5A3.5 3.5 0 0 1 6.5 11h35a3.5 3.5 0 0 1 3.5 3.5V33a3.5 3.5 0 0 1-3.5 3.5h-35A3.5 3.5 0 0 1 3 33z'
        }
        fill="#a9c3ff"
      />
      <path d="M3 14.5A3.5 3.5 0 0 1 6.5 11h35a3.5 3.5 0 0 1 3.5 3.5v1H3z" fill="#fff" opacity={open ? 0 : 0.35} />
    </svg>
  );
}

function FileGlyph({ type, size = 40 }: { type: FileType; size?: number }) {
  const label = type === 'app' ? 'APP' : type.toUpperCase();
  return (
    <svg className={css.glyph} width={size} height={(size * 48) / 40} viewBox="0 0 40 48" aria-hidden="true">
      <path d="M8 2.5h17.5L35.5 12.5V43a2.5 2.5 0 0 1-2.5 2.5H8A2.5 2.5 0 0 1 5.5 43V5A2.5 2.5 0 0 1 8 2.5z" fill="#fff" stroke="#d0d5dd" />
      <path d="M25.5 2.5v7.5a2.5 2.5 0 0 0 2.5 2.5h7.5" fill="#f2f4f7" stroke="#d0d5dd" strokeLinejoin="round" />
      <path d="M11 20h17M11 24.5h13" stroke="#e4e7ec" strokeWidth="2" strokeLinecap="round" />
      <rect x="1.5" y="28.5" width={label.length > 3 ? 31 : 26} height="12" rx="3" fill={TYPE_COLOR[type]} />
      <text x={label.length > 3 ? 17 : 14.5} y="37.4" fontSize="8" fontWeight="800" fill="#fff" textAnchor="middle" fontFamily="inherit">
        {label}
      </text>
    </svg>
  );
}

function Svg({ d, size = 16 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}
const ICON = {
  up: 'M12 19V5M6 11l6-6 6 6',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  list: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  chevron: 'M9 6l6 6-6 6',
  download: 'M12 4v11M7 10.5l5 5 5-5M5 19.5h14',
  open: 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
};

type Entry = { kind: 'folder'; folder: ArcFolder } | { kind: 'file'; file: ArcFile };
const entryKey = (e: Entry) => (e.kind === 'folder' ? `d:${e.folder.key}` : `f:${e.file.key}`);

interface Props {
  section: ArchiveSection;
  onSection(s: ArchiveSection): void;
  /** The programs to take (PC launcher, install as an app). */
  programs: ArchiveItem[];
  /** The acceptance-check papers (the result sheet). */
  checks: ArchiveItem[];
}

export default function Archive({ section, onSection, programs, checks }: Props) {
  const root = buildTree(programs, checks);
  const trail = folderPath(root, section);
  const path = trail.length ? trail : [root];
  const folder = path[path.length - 1];
  const [view, setView] = useState<'grid' | 'list'>(() => {
    try {
      return typeof localStorage !== 'undefined' && localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'grid';
    } catch {
      return 'grid';
    }
  });
  const [picked, setPicked] = useState<string | null>(null);
  const [opened, setOpened] = useState<Set<string>>(() => new Set(['', ...path.map((f) => f.key)]));

  const entries: Entry[] = [...folder.folders.map((f): Entry => ({ kind: 'folder', folder: f })), ...folder.files.map((f): Entry => ({ kind: 'file', file: f }))];
  const chosen = entries.find((e) => entryKey(e) === picked) ?? null;
  const sizeOf = useSizes(folder.files.map((f) => f.href ?? f.sizeFrom ?? ''));

  const go = (key: string) => {
    onSection(key);
    setPicked(null);
    setOpened((o) => new Set([...o, ...folderPath(root, key).map((f) => f.key)]));
  };
  const chooseView = (v: 'grid' | 'list') => {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* this session only */
    }
  };
  const open = (e: Entry) => {
    if (e.kind === 'folder') return go(e.folder.key);
    const f = e.file;
    if (f.action) {
      if (!f.action.disabled) f.action.run();
    } else if (f.href) window.open(f.href, '_blank', 'noopener');
  };
  const onKey = (ev: KeyboardEvent) => {
    const i = entries.findIndex((e) => entryKey(e) === picked);
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[ev.key];
    if (step && entries.length) {
      ev.preventDefault();
      const next = entries[Math.max(0, Math.min(entries.length - 1, i < 0 ? 0 : i + step))];
      setPicked(entryKey(next));
      (ev.currentTarget.querySelector(`[data-entry="${CSS.escape(entryKey(next))}"]`) as HTMLElement | null)?.focus();
    } else if (ev.key === 'Enter' && chosen) {
      ev.preventDefault();
      open(chosen);
    } else if (ev.key === 'Backspace' && path.length > 1) {
      ev.preventDefault();
      go(path[path.length - 2].key);
    }
  };

  const tree = (f: ArcFolder, depth: number): ReactNode => {
    const isOpen = opened.has(f.key);
    return (
      <li key={f.key} role="treeitem" aria-expanded={f.folders.length ? isOpen : undefined} aria-selected={f.key === folder.key}>
        <span className={css.treeRow} style={{ paddingLeft: 6 + depth * 14 }}>
          {f.folders.length ? (
            <button
              type="button"
              className={css.treeToggle}
              data-open={isOpen || undefined}
              aria-label={isOpen ? `${f.name} 접기` : `${f.name} 펼치기`}
              onClick={() =>
                setOpened((o) => {
                  const n = new Set(o);
                  if (n.has(f.key)) n.delete(f.key);
                  else n.add(f.key);
                  return n;
                })
              }
            >
              <Svg d={ICON.chevron} size={12} />
            </button>
          ) : (
            <i className={css.treeToggle} />
          )}
          <button type="button" className={css.treeName} aria-current={f.key === folder.key ? 'page' : undefined} onClick={() => go(f.key)} title={f.note}>
            <FolderGlyph size={18} open={f.key === folder.key} />
            <span>{f.name}</span>
            <em>{fileCount(f)}</em>
          </button>
        </span>
        {isOpen && f.folders.length > 0 && <ul role="group">{f.folders.map((s) => tree(s, depth + 1))}</ul>}
      </li>
    );
  };

  const thumb = (e: Entry, big?: boolean) => {
    if (e.kind === 'folder') return <FolderGlyph size={big ? 96 : 76} />;
    const f = e.file;
    const src = f.thumb ?? (f.type === 'gif' ? f.href : undefined);
    if (!src) return <FileGlyph type={f.type} size={big ? 80 : 58} />;
    // eslint-disable-next-line @next/next/no-img-element -- fixed files of this site, also in the static export
    return <img src={src} alt="" loading="lazy" decoding="async" data-type={f.type} />;
  };
  const sizeText = (f: ArcFile) => formatSize(sizeOf(f.href ?? f.sizeFrom));
  const meta = (e: Entry) =>
    e.kind === 'folder' ? `항목 ${e.folder.folders.length + e.folder.files.length}개` : sizeOf(e.file.href ?? e.file.sizeFrom) !== undefined ? sizeText(e.file) : TYPE_LABEL[e.file.type];

  const shown = chosen ?? null;
  return (
    <div className={`${css.page} ${css.explorer}`}>
      <nav className={css.pageNav} aria-label="DOWNLOADS">
        <h5>DOWNLOADS</h5>
        <ul className={css.tree} role="tree" aria-label="폴더">
          {tree(root, 0)}
        </ul>
        <p className={css.pageHelp}>모두 이 프로그램 안에 들어 있어 인터넷 없이도 받을 수 있어요.</p>
      </nav>

      <section className={css.explorerMain} aria-label={folder.name}>
        <header className={css.toolbar}>
          <button type="button" className={css.toolBtn} disabled={path.length < 2} onClick={() => go(path[path.length - 2].key)} aria-label="위 폴더로" title="위 폴더로 (Backspace)">
            <Svg d={ICON.up} />
          </button>
          <nav className={css.crumbs} aria-label="경로">
            {path.map((f, i) => (
              <span key={f.key}>
                {i > 0 && <Svg d={ICON.chevron} size={12} />}
                <button type="button" aria-current={i === path.length - 1 ? 'page' : undefined} onClick={() => go(f.key)}>
                  {i === 0 && <FolderGlyph size={16} />}
                  {f.name}
                </button>
              </span>
            ))}
          </nav>
          <span className={css.viewSeg} role="group" aria-label="보기 방식">
            <button type="button" aria-pressed={view === 'grid'} onClick={() => chooseView('grid')} title="큰 아이콘">
              <Svg d={ICON.grid} />
            </button>
            <button type="button" aria-pressed={view === 'list'} onClick={() => chooseView('list')} title="자세히 (목록)">
              <Svg d={ICON.list} />
            </button>
          </span>
        </header>
        <p className={css.folderNote}>{folder.note}</p>

        <div
          className={css.files}
          data-view={view}
          role="listbox"
          aria-label={`${folder.name} 안의 항목`}
          tabIndex={entries.length ? undefined : 0}
          onKeyDown={onKey}
          onMouseDown={(e) => e.target === e.currentTarget && setPicked(null)}
        >
          {view === 'list' && (
            <div className={css.listHead} aria-hidden="true">
              <span>이름</span>
              <span>종류</span>
              <span>크기</span>
            </div>
          )}
          {entries.map((e) => {
            const k = entryKey(e);
            const name = e.kind === 'folder' ? e.folder.name : e.file.name;
            return (
              <button
                key={k}
                type="button"
                role="option"
                aria-selected={picked === k}
                className={css.entry}
                data-entry={k}
                data-kind={e.kind === 'folder' ? 'folder' : e.file.type}
                title={e.kind === 'folder' ? `${e.folder.note} (두 번 눌러 열기)` : e.file.note}
                onClick={() => setPicked(k)}
                onDoubleClick={() => open(e)}
              >
                {view === 'grid' ? (
                  <>
                    <span className={css.entryArt}>
                      {thumb(e)}
                      {e.kind === 'file' && (e.file.thumb || e.file.type === 'gif') && (
                        <i className={css.typeTag} style={{ background: TYPE_COLOR[e.file.type] }}>
                          {e.file.type.toUpperCase()}
                        </i>
                      )}
                    </span>
                    <b>{name}</b>
                    <small>{meta(e)}</small>
                  </>
                ) : (
                  <>
                    <span className={css.entryName}>
                      {e.kind === 'folder' ? <FolderGlyph size={22} /> : <FileGlyph type={e.file.type} size={18} />}
                      <b>{name}</b>
                    </span>
                    <small>{e.kind === 'folder' ? '폴더' : TYPE_LABEL[e.file.type]}</small>
                    <small>{e.kind === 'folder' ? `${fileCount(e.folder)}개` : sizeText(e.file)}</small>
                  </>
                )}
              </button>
            );
          })}
        </div>
        <footer className={css.statusBar}>
          <span>
            폴더 {folder.folders.length}개 · 파일 {folder.files.length}개
          </span>
          <span>{shown ? `선택: ${shown.kind === 'folder' ? shown.folder.name : shown.file.name}` : '두 번 눌러 열기 · 화살표로 고르기'}</span>
        </footer>
      </section>

      <aside className={css.preview} aria-label="미리 보기">
        {shown?.kind === 'file' ? (
          <>
            <div className={css.previewArt} data-type={shown.file.type} data-thumb={shown.file.thumb || shown.file.type === 'gif' ? true : undefined}>
              {thumb(shown, true)}
            </div>
            <h3>{shown.file.name}</h3>
            <p>{shown.file.note}</p>
            <dl className={css.facts}>
              <dt>종류</dt>
              <dd>{TYPE_LABEL[shown.file.type]}</dd>
              <dt>크기</dt>
              <dd>{sizeText(shown.file)}</dd>
              <dt>위치</dt>
              <dd>{path.map((f) => f.name).join(' › ')}</dd>
            </dl>
            <div className={css.previewActions}>
              {shown.file.action ? (
                <button type="button" className={css.primary} disabled={shown.file.action.disabled} onClick={shown.file.action.run}>
                  <Svg d={ICON.download} />
                  {shown.file.action.label}
                </button>
              ) : (
                <>
                  <a className={css.primary} href={shown.file.href} download={shown.file.download}>
                    <Svg d={ICON.download} />
                    내려받기
                  </a>
                  <a className={css.secondary} href={shown.file.href} target="_blank" rel="noopener">
                    <Svg d={ICON.open} />
                    열기
                  </a>
                </>
              )}
            </div>
          </>
        ) : (
          <>
            <div className={css.previewArt} data-type="folder">
              <FolderGlyph size={104} />
            </div>
            <h3>{shown?.kind === 'folder' ? shown.folder.name : folder.name}</h3>
            <p>{shown?.kind === 'folder' ? shown.folder.note : folder.note}</p>
            <dl className={css.facts}>
              <dt>폴더</dt>
              <dd>{(shown?.kind === 'folder' ? shown.folder : folder).folders.length}개</dd>
              <dt>파일</dt>
              <dd>모두 {fileCount(shown?.kind === 'folder' ? shown.folder : folder)}개</dd>
            </dl>
            {shown?.kind === 'folder' && (
              <div className={css.previewActions}>
                <button type="button" className={css.primary} onClick={() => go(shown.folder.key)}>
                  <FolderGlyph size={16} open />
                  열기
                </button>
              </div>
            )}
            {!shown && <p className={css.previewHint}>파일을 누르면 여기서 미리 보고 내려받아요.</p>}
          </>
        )}
      </aside>
    </div>
  );
}
