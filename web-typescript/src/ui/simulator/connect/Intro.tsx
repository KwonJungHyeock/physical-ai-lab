'use client';

/**
 * The start of the program: the company mark draws itself, the name comes in, the robots the program
 * teaches rise onto a lit floor, and the bar under them follows the real loading (robot description,
 * the model files, then the 3D scene), easing on between the steps so it never stands still. When both
 * the sequence has played and the 3D view is ready, the last frame offers [연결하기] (the 로봇 연결
 * window) and 시뮬레이터로 시작; the intro steps aside on either. A click skips the sequence (the bar
 * still waits for the 3D view). Without `gate` (the robot's own console) it steps aside by itself.
 *
 * The root keeps `splash` in its class and `data-done` when gone: the screenshot tools wait on those.
 */

import { useProgress } from '@react-three/drei';
import { useEffect, useRef, useState } from 'react';

import css from './intro.module.css';

const ROBOTS = [
  { src: '/brand/intro/mypalletizer260-pi.png', name: 'myPalletizer 260' },
  { src: '/brand/intro/mecharm270-pi.png', name: 'mechArm 270' },
  { src: '/brand/intro/mycobot280-rdkx5.png', name: 'myCobot 280', hero: true },
  { src: '/brand/intro/mycobot320-pi.png', name: 'myCobot 320' },
  { src: '/brand/intro/myagv.png', name: 'myAGV' },
];
/** How long the sequence plays before the intro may step aside, ms. */
const SEQUENCE_MS = 3600;

interface Props {
  /** 0..1: how far the robot and the 3D view have loaded (its steps; the bar eases on between them). */
  progress: number;
  /** The console is ready to use (or will not get readier: a load error, a slow 3D view). */
  ready: boolean;
  /** A short line under the bar. */
  note: string;
  /** The last frame's choice; the intro stays until one is made. */
  gate?: { onConnect(): void; onStart(): void };
}

export default function Intro({ progress, ready, note, gate }: Props) {
  const [played, setPlayed] = useState(false);
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    const quick = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const t = window.setTimeout(() => setPlayed(true), quick ? 600 : SEQUENCE_MS);
    return () => window.clearTimeout(t);
  }, []);
  const final = ready && played;
  const done = final && (!gate || entered);

  // The model files (three's loading manager) fill the stretch between "description read" and "3D ready".
  const files = useProgress((s) => (s.total ? s.loaded / s.total : 0));
  const target = ready ? 1 : Math.max(progress, Math.min(0.9, 0.3 + files * 0.42));
  const bar = useRef<HTMLElement>(null);
  // Each step sends the bar on a long ease-out toward a little past it (never to the end before the
  // 3D view is ready), so it keeps moving between steps. A CSS transition, not a script: it goes on
  // while the page is busy building the 3D view. Before the script runs, a CSS animation does the same.
  useEffect(() => {
    const el = bar.current;
    if (!el) return;
    if (el.style.animation !== 'none') {
      // Take over from the CSS animation where it is now.
      const now = getComputedStyle(el).transform;
      el.style.animation = 'none';
      if (now && now !== 'none') el.style.transform = now;
      void el.offsetWidth;
    }
    el.style.transition = ready ? 'transform 0.7s cubic-bezier(0.22, 1, 0.36, 1)' : 'transform 16s cubic-bezier(0.08, 0.75, 0.2, 1)';
    el.style.transform = `scaleX(${ready ? 1 : Math.min(0.96, target + 0.24).toFixed(3)})`;
  }, [target, ready]);

  const enter = (go: () => void) => {
    setEntered(true);
    go();
  };
  return (
    <div
      className={css.splash}
      data-done={done || undefined}
      data-skipped={played || undefined}
      data-final={(final && gate && !entered) || undefined}
      aria-hidden={done}
      role={final && gate ? 'dialog' : 'status'}
      aria-label="Physical AI 로봇 학습 프로그램"
      onClick={() => setPlayed(true)}
    >
      <div className={css.floor} />
      <div className={css.scan} />
      <div className={css.glow} />
      <div className={css.brand}>
        <span className={css.mark} />
        <span className={css.word} />
      </div>
      <div className={css.title}>
        <b>
          Physical AI <span>로봇 학습 프로그램</span>
        </b>
        <small>SIMULATOR · ROBOT CONSOLE · CURRICULUM</small>
      </div>
      <div className={css.robots}>
        {ROBOTS.map((r, i) => (
          // eslint-disable-next-line @next/next/no-img-element -- fixed pictures, also in the static export
          <img key={r.src} src={r.src} alt={r.name} className={r.hero ? css.hero : undefined} style={{ animationDelay: `${1.5 + i * 0.13}s` }} draggable={false} />
        ))}
      </div>
      <div className={css.reflect} />
      <div className={css.load} role="progressbar" aria-label="불러오기" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(target * 100)}>
        <span className={css.bar}>
          <i ref={bar} />
        </span>
        <small>{note}</small>
      </div>
      {gate && final && (
        <div className={css.actions}>
          <button
            type="button"
            className={css.connect}
            autoFocus
            disabled={entered}
            onClick={(e) => {
              e.stopPropagation();
              enter(gate.onConnect);
            }}
          >
            연결하기
          </button>
          <button
            type="button"
            className={css.start}
            disabled={entered}
            onClick={(e) => {
              e.stopPropagation();
              enter(gate.onStart);
            }}
          >
            시뮬레이터로 시작
            <span aria-hidden="true">→</span>
          </button>
          <small>로봇과 같은 Wi-Fi 라면 [연결하기], 로봇 없이 연습하려면 시뮬레이터로 시작해요.</small>
        </div>
      )}
      {!played && <span className={css.skip}>클릭하면 건너뛰어요</span>}
    </div>
  );
}
