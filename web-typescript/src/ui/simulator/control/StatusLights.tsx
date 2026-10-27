'use client';

/**
 * The state light at the top of the work panel: the most pressing of 시뮬레이션 · 로봇 연결 · 실행 중 ·
 * 오류, one light with its name. A click opens the status under it: all four, each with a line of what
 * it means now, then the robot's servos and its own keys (RobotStatus).
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';

import css from '../console.module.css';

export interface Lights {
  sim: boolean;
  robot: boolean;
  running: boolean;
  error: boolean;
}

/** The four lights, in order (the status popover lists the same four). */
export const ITEMS: { key: keyof Lights; name: string; tone: string; title: string }[] = [
  { key: 'sim', name: '시뮬레이션', tone: 'sim', title: '로봇 없이 화면 속 로봇으로 해요' },
  { key: 'robot', name: '로봇 연결', tone: 'real', title: '실제 로봇과 연결돼 있어요' },
  { key: 'running', name: '실행 중', tone: 'run', title: '프로그램이나 움직임이 진행 중이에요' },
  { key: 'error', name: '오류', tone: 'err', title: '멈췄거나 연결을 확인해야 해요' },
];

export default function StatusLights({ lights, children }: { lights: Lights; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  // One light: the most pressing state (오류 › 실행 중 › 로봇 연결 › 시뮬레이션); the four are under it.
  const now = ITEMS.find((it) => it.key === 'error' && lights.error) ?? ITEMS.find((it) => it.key === 'running' && lights.running) ?? ITEMS.find((it) => it.key === 'robot' && lights.robot) ?? ITEMS[0];
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
    <div className={css.lights} ref={box}>
      <button type="button" className={css.lightsBtn} aria-expanded={open} data-hint-for="서보 고정, 손으로 움직이기, 연결 확인, 영점 맞추기" data-hint-skip="" onClick={() => setOpen((o) => !o)} title={`${now.title} · 누르면 로봇 상태 자세히`}>
        <span className={css.light} data-on data-tone={now.tone}>
          <i />
          {now.name}
        </span>
      </button>
      {open && (
        <div className={css.lightsPop} role="dialog" aria-label="로봇 상태">
          {children}
        </div>
      )}
    </div>
  );
}
