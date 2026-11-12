'use client';

/**
 * Top bar, always on screen: the product name, the four screens (교육 · 시뮬레이터 · 라이브러리 ·
 * 자료실), one line of what is open now (the task and its goal), and on the right the robot
 * connection, settings and — while a real robot is connected — Stop.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';

import Icon from './Icon';
import { isTouch } from './touch';
import css from './console.module.css';

/** The screens: the robotics course, the simulator, the library to open things from, the downloads. */
export type ConsoleView = 'learn' | 'sim' | 'library' | 'archive';

const SCREENS: { id: ConsoleView; name: string; icon: string; title: string }[] = [
  { id: 'learn', name: '교육', icon: 'book', title: '로봇공학 단원 · 수업' },
  { id: 'sim', name: '시뮬레이터', icon: 'cube', title: '실습 · 코딩 · 로봇 연결' },
  { id: 'library', name: '라이브러리', icon: 'gallery', title: '실습 과제 · 실습 환경 · 도구' },
  { id: 'archive', name: '자료실', icon: 'archive', title: '내려받기: 프로그램 · 교재 · 문항지 · 매뉴얼' },
];

interface Props {
  view: ConsoleView;
  onView(v: ConsoleView): void;
  busy: boolean;
  /** What is open now (the task chip in the simulator); nothing on the other screens. */
  context?: ReactNode;
  /** Settings menu items (`close` folds the menu). */
  settings(close: () => void): ReactNode;
  /** Connection button. */
  status: ReactNode;
  /** A real robot is connected: [■ 로봇 정지] shows on every screen (the simulator stops from its own panel and Esc). */
  robotStop: boolean;
  onStop(): void;
  /** [?] 도움말: the screen, the order of work, the keys, the manual. */
  onHelp(): void;
  /** A 트랙 page (engine/simulator/tracks.ts): its badge, and only its screens. */
  track?: { name: string; grade: string; color: string; screens: readonly string[]; course?: boolean };
}

/** A chip with a small menu under it; closes on a click outside or Esc. */
export function MenuChip({ label, title, className, children }: { label: ReactNode; title: string; className?: string; children: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('pointerdown', away);
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('pointerdown', away);
      window.removeEventListener('keydown', esc);
    };
  }, [open]);
  return (
    <div className={`${css.menuChip} ${className ?? ''}`} ref={box}>
      <button type="button" className={css.menuChipBtn} aria-expanded={open} aria-haspopup="true" title={title} onClick={() => setOpen((o) => !o)}>
        {label}
      </button>
      {open && (
        <div className={css.menuPop} role="menu">
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

type FsDoc = Document & { webkitFullscreenEnabled?: boolean; webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => void };
type FsEl = HTMLElement & { webkitRequestFullscreen?: () => void };

/**
 * 전체 화면 (tablets only): the browser's address bar and tabs out of the way, so the lesson has the
 * whole screen. Shown where the browser allows it (Android Chrome, iPad Safari).
 */
function FullscreenChip() {
  const [on, setOn] = useState<boolean | null>(null);
  useEffect(() => {
    const d = document as FsDoc;
    if (!isTouch() || !(d.fullscreenEnabled || d.webkitFullscreenEnabled)) return;
    const read = () => setOn(!!(d.fullscreenElement || d.webkitFullscreenElement));
    read();
    document.addEventListener('fullscreenchange', read);
    document.addEventListener('webkitfullscreenchange', read);
    return () => {
      document.removeEventListener('fullscreenchange', read);
      document.removeEventListener('webkitfullscreenchange', read);
    };
  }, []);
  if (on === null) return null;
  const toggle = () => {
    const d = document as FsDoc;
    const root = document.documentElement as FsEl;
    if (on) {
      if (d.exitFullscreen) void d.exitFullscreen().catch(() => {});
      else d.webkitExitFullscreen?.();
    } else if (root.requestFullscreen) void root.requestFullscreen().catch(() => {});
    else root.webkitRequestFullscreen?.();
  };
  return (
    <div className={`${css.menuChip} ${css.settingsChip}`}>
      <button type="button" className={css.menuChipBtn} onClick={toggle} aria-pressed={on} aria-label={on ? '전체 화면 끝내기' : '전체 화면'} title={on ? '전체 화면 끝내기' : '전체 화면: 주소창을 숨겨 화면을 넓게 써요'}>
        <Icon name={on ? 'shrink' : 'expand'} size={18} />
      </button>
    </div>
  );
}

export default function TopBar({ view, onView, busy, context, settings, status, robotStop, onStop, onHelp, track }: Props) {
  return (
    // data-course: the 입문 과정 (no text under 14 px in its top line).
    <header className={css.topBar} data-panel="topbar" data-course={track?.course || undefined}>
      <button type="button" className={css.lockup} onClick={() => onView('sim')} title="ROBODYNE SYSTEMS · Physical AI 로봇 학습 시뮬레이터 (시뮬레이터로)">
        {/* eslint-disable-next-line @next/next/no-img-element -- a small fixed logo, also in the static export for the robot */}
        <img src="/brand/sim-logo-white.svg" alt="ROBODYNE SYSTEMS" width={73} height={36} />
        <i aria-hidden="true" />
        <span className={css.product}>
          <em>PHYSICAL AI</em>
          <b>로봇 학습 시뮬레이터</b>
        </span>
      </button>

      {track && (
        <span className={css.trackBadge} style={{ background: track.color }} title={`${track.name} 트랙 (${track.grade})`}>
          {track.name} · {track.grade}
        </span>
      )}
      <nav className={css.screens} role="tablist" aria-label="화면" hidden={!!track && track.screens.length < 2}>
        {SCREENS.filter((s) => !track || track.screens.includes(s.id)).map((s) => (
          <button key={s.id} type="button" role="tab" aria-label={s.name} aria-selected={view === s.id} disabled={busy && view !== s.id} onClick={() => onView(s.id)} title={s.title}>
            <Icon name={s.icon} size={17} />
            <span>{s.name}</span>
          </button>
        ))}
      </nav>

      <div className={css.context}>{context}</div>

      <div className={css.topStatus}>
        {status}
        <FullscreenChip />
        <div className={`${css.menuChip} ${css.settingsChip}`}>
          <button type="button" className={css.menuChipBtn} onClick={onHelp} title="도움말: 화면 · 순서 · 단축키 · 매뉴얼" aria-label="도움말">
            <Icon name="help" size={18} />
          </button>
        </div>
        <MenuChip label={<Icon name="gear" size={18} />} title="설정" className={css.settingsChip}>
          {(close) => settings(close)}
        </MenuChip>
        {robotStop && (
          <button type="button" className={css.topStop} onClick={onStop} aria-label="로봇 정지 (Esc)" title="실제 로봇을 바로 멈춰요 (Esc · 스페이스)">
            <Icon name="stop" size={14} />
            <span>로봇 정지</span>
          </button>
        )}
      </div>
    </header>
  );
}
