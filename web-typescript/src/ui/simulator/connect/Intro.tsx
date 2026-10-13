'use client';

/**
 * The start of the program: the company mark draws itself, the name comes in, and a window under it
 * goes through the places robots work — the 로봇 시티 and its sites, pictures of the app's own 3D
 * scenes (tools/build/intro-scenes.mjs) — each with one line of what the robot does there. The bar
 * under them follows the real loading (robot description,
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

/** Where robots work: the pictures the window goes through, with what the robot does there. */
const SCENES = [
  { id: 'park', name: '로봇 시티', line: '아카데미에서 배우고, 현장마다 로봇으로 문제를 풀어요' },
  { id: 'factory', name: '스마트팩토리', line: '센서가 알린 상자를 컨베이어에서 집어 옮겨요' },
  { id: 'logistics', name: '물류 허브', line: '상자를 팔레트에 한 층씩 정확히 쌓아요' },
  { id: 'bio', name: '바이오·헬스케어', line: '시험관을 정해진 칸에 1 mm 안으로 꽂아요' },
  { id: 'farm', name: '스마트팜', line: '카메라로 익은 토마토를 찾아 따서 담아요' },
  { id: 'cafe', name: '스마트시티', line: '사람 곁에서 속도를 줄여 안전하게 음료를 건네요' },
  { id: 'ai', name: '피지컬 AI 연구소', line: '처음 보는 부품도 AI 로 알아보고 분류해요' },
];
/** How long each place shows, ms. */
const SCENE_MS = 2600;
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
  // The places, one after another (on until the intro steps aside: the last frame waits on them).
  const [scene, setScene] = useState(0);
  useEffect(() => {
    const quick = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const t = window.setInterval(() => setScene((n) => (n + 1) % SCENES.length), quick ? SCENE_MS * 2 : SCENE_MS);
    return () => window.clearInterval(t);
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
        <small>myCobot 280 RDK X5 · SIMULATOR · ROBOT CONSOLE · CURRICULUM</small>
      </div>
      <figure className={css.places} aria-label="로봇이 일하는 곳">
        <div className={css.window}>
          {SCENES.map((p, i) => (
            // eslint-disable-next-line @next/next/no-img-element -- fixed pictures, also in the static export
            <img key={p.id} src={`/brand/intro/scene-${p.id}.jpg`} alt={p.name} data-on={i === scene || undefined} draggable={false} />
          ))}
          <figcaption key={scene} className={css.caption}>
            <small>
              {String(scene + 1).padStart(2, '0')} / {String(SCENES.length).padStart(2, '0')}
            </small>
            <b>{SCENES[scene].name}</b>
            <span>{SCENES[scene].line}</span>
          </figcaption>
        </div>
        <ol className={css.dots} aria-hidden="true">
          {SCENES.map((p, i) => (
            <li key={p.id} data-on={i === scene || undefined} />
          ))}
        </ol>
      </figure>
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
