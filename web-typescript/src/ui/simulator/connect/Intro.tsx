'use client';

/**
 * The start of the program: a full-window photograph of a robot at work — a robot arm, a mobile robot,
 * a humanoid, one after another (public/brand/intro/photo-*.jpg) — darkened on the left, where the
 * simulator's logo, one line of what the program is for and the three pictures as small cards come in.
 * The bar along the foot follows the real loading (robot description, the model files, then the 3D
 * scene), easing on between the steps so it never stands still. When both the sequence has played and
 * the 3D view is ready, [연결하기] (the 로봇 연결 window) and 시뮬레이터로 시작 appear under the cards;
 * the intro steps aside on either. A click skips the sequence (the bar still waits for the 3D view).
 * Without `gate` (the robot's own console) it steps aside by itself.
 *
 * The root keeps `splash` in its class and `data-done` when gone: the screenshot tools wait on those.
 */

import { useProgress } from '@react-three/drei';
import { useEffect, useRef, useState } from 'react';

import css from './intro.module.css';

/** The robots the pictures show, with what each does. */
const ROBOTS = [
  { id: 'arm', tag: 'ROBOT ARM', name: '로봇팔', line: '사람 곁에서 집고 · 옮기고 · 조립해요' },
  { id: 'amr', tag: 'MOBILE ROBOT', name: '이동형 로봇', line: '스스로 길을 찾아 물건을 나르고 집어요' },
  { id: 'humanoid', tag: 'HUMANOID', name: '휴머노이드', line: '사람처럼 두 손으로 상자를 들고 일해요' },
];
/** How long each picture shows, ms. */
const SCENE_MS = 3400;
/** How long the sequence plays before the intro may step aside, ms. */
const SEQUENCE_MS = 3200;

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
  // The pictures, one after another (on until the intro steps aside); a card picks one and the round goes on from it.
  const [scene, setScene] = useState(0);
  useEffect(() => {
    const quick = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const t = window.setTimeout(() => setScene((n) => (n + 1) % ROBOTS.length), quick ? SCENE_MS * 2 : SCENE_MS);
    return () => window.clearTimeout(t);
  }, [scene]);
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
  const now = ROBOTS[scene];
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
      <div className={css.photos} aria-hidden="true">
        {ROBOTS.map((r, i) => (
          // eslint-disable-next-line @next/next/no-img-element -- fixed pictures, also in the static export
          <img key={r.id} src={`/brand/intro/photo-${r.id}.jpg`} alt="" data-on={i === scene || undefined} draggable={false} />
        ))}
      </div>
      <div className={css.shade} />

      <div className={css.col}>
        {/* eslint-disable-next-line @next/next/no-img-element -- the simulator's logo, also in the static export */}
        <img className={css.logo} src="/brand/sim-logo-white.svg" alt="ROBODYNE SYSTEMS" width={464} height={228} />
        <h1 className={css.head}>
          배우는 로봇이
          <br />
          <span>현장에서 일하는</span> 로봇으로
        </h1>
        <p className={css.lead}>
          로봇팔 · 이동형 로봇 · 휴머노이드를 한곳에서 다루는 피지컬 AI 통합 시뮬레이터.
          <br />
          조그 · 공정 · 코딩 · AI 까지 연습하고, 같은 프로그램을 실제 로봇에서 돌려요.
        </p>
        <ol className={css.cards} aria-label="로봇이 일하는 모습">
          {ROBOTS.map((r, i) => (
            <li key={r.id}>
              <button
                type="button"
                data-on={i === scene || undefined}
                onClick={(e) => {
                  e.stopPropagation();
                  setScene(i);
                }}
                aria-label={`${r.name} 사진 보기`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- fixed pictures, also in the static export */}
                <img src={`/brand/intro/photo-${r.id}.jpg`} alt="" draggable={false} />
                <span>
                  <b>{r.name}</b>
                  <small>{r.tag}</small>
                </span>
                <i key={i === scene ? `on-${scene}` : 'off'} style={{ animationDuration: `${SCENE_MS}ms` }} />
              </button>
            </li>
          ))}
        </ol>
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
          </div>
        )}
      </div>

      <figure key={scene} className={css.caption}>
        <small>
          {String(scene + 1).padStart(2, '0')} · {now.tag}
        </small>
        <b>{now.name}</b>
        <span>{now.line}</span>
      </figure>

      <div className={css.foot}>
        <div className={css.load} role="progressbar" aria-label="불러오기" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(target * 100)}>
          <small>{note}</small>
          <span className={css.bar}>
            <i ref={bar} />
          </span>
        </div>
        <small className={css.hint}>{gate && final ? '로봇과 같은 Wi-Fi 라면 [연결하기], 로봇 없이 연습하려면 시뮬레이터로 시작해요.' : !played ? '클릭하면 건너뛰어요' : ''}</small>
      </div>
    </div>
  );
}
