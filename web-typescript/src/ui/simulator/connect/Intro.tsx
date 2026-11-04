'use client';

/**
 * The start of the program (Metal Mission HUD): a film of the simulated myCobot at work rolls on the
 * right of a dark metal ground — the six joints, then the 공정 cells A–E (public/brand/intro/roll.mp4,
 * recorded from this program; it loops seamlessly) — with the scene's name in the top-right corner.
 * On the left: the title, one line, and, once the 3D view is ready, [CONNECT] (the 로봇 연결 window)
 * and [SIMULATOR] (시뮬레이터로 시작); the intro steps aside on either. The hairline along the foot
 * follows the real loading (robot description, the model files, then the 3D scene), easing on between
 * the steps. A click skips the sequence (the bar still waits for the 3D view). Without `gate` (the
 * robot's own console) it steps aside by itself. Right after the program reloaded itself to connect to
 * a robot or to leave it (skipIntroOnce), it does not play again: it covers the loading only.
 *
 * The root keeps `splash` in its class and `data-done` when gone: the screenshot tools wait on those.
 */

import { useProgress } from '@react-three/drei';
import { useEffect, useRef, useState } from 'react';

import type { TrackIntro } from '@/engine/simulator/tracks';

import css from './intro.module.css';

/** The release number shown as VERSION v1.<n>: one up with each release (the release branch README). */
export const RELEASE = 14;

/** The film's scenes: when each one's name comes up (s into the film, halfway through its fade in). */
const SCENES = [
  { at: 0, tag: 'JOINT MOTION', line: '전 축 구동 · 관절 6개' },
  { at: 3.5, tag: 'FEED · PALLETIZE', line: '공급 · 적재 셀' },
  { at: 7.5, tag: 'VISION SORTING', line: '비전 분류 셀' },
  { at: 11.5, tag: 'INSPECTION', line: '검사 · 불량 배출 셀' },
  { at: 13.67, tag: 'MACHINE TENDING', line: '머신 텐딩 셀 · CNC 선반' },
  { at: 17.67, tag: 'ASSEMBLY', line: '조립 · 삽입 셀' },
];
/** The film fades back into its first scene at the end: its name comes back here, s. */
const BACK_TO_FIRST = 20.33;
/** How long the sequence plays before the intro may step aside, ms. */
const SEQUENCE_MS = 3200;

const SKIP_KEY = 'intro-skip-once';
/** Call before the program reloads itself (connecting to a robot, leaving it): the next start does not play the intro. */
export function skipIntroOnce() {
  try {
    sessionStorage.setItem(SKIP_KEY, '1');
  } catch {
    /* storage blocked: the intro plays */
  }
}

/** Whether this page load comes from such a reload: read (and cleared) once, the answer kept for the page. */
let skipThisLoad: boolean | null = null;
function introSkipped() {
  if (skipThisLoad !== null) return skipThisLoad;
  skipThisLoad = false;
  try {
    skipThisLoad = sessionStorage.getItem(SKIP_KEY) === '1';
    sessionStorage.removeItem(SKIP_KEY);
  } catch {
    /* storage blocked: the intro plays */
  }
  return skipThisLoad;
}

const sceneAt = (t: number) => (t >= BACK_TO_FIRST ? 0 : SCENES.reduce((n, s, i) => (t >= s.at ? i : n), 0));

interface Props {
  /** 0..1: how far the robot and the 3D view have loaded (its steps; the bar eases on between them). */
  progress: number;
  /** The console is ready to use (or will not get readier: a load error, a slow 3D view). */
  ready: boolean;
  /** A short line under the bar. */
  note: string;
  /** The last frame's choice; the intro stays until one is made. `onRoadmap`: a 트랙's [ROADMAP] (테마학습) instead of [CONNECT]. */
  gate?: { onConnect(): void; onStart(): void; onRoadmap?: () => void };
  /** A 트랙's own cover (tracks.ts): its title and lines, its pictures taking turns instead of the film. */
  brand?: TrackIntro;
}

/** How long each of a cover's pictures stays, ms. */
const PICTURE_MS = 4500;

export default function Intro({ progress, ready, note, gate, brand }: Props) {
  const [played, setPlayed] = useState(false);
  const [entered, setEntered] = useState(false);
  // Right after a reload of its own (to a robot or back): no sequence and no choice, the loading only.
  const [quiet, setQuiet] = useState(false);
  useEffect(() => {
    const again = introSkipped();
    const quick = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const t = window.setTimeout(
      () => {
        setQuiet(again);
        setPlayed(true);
      },
      again ? 0 : quick ? 600 : SEQUENCE_MS,
    );
    return () => window.clearTimeout(t);
  }, []);
  // The scene's name follows the film (its time updates, a few a second; the film plays on its own).
  const film = useRef<HTMLVideoElement>(null);
  const [scene, setScene] = useState(0);
  // A cover's pictures take turns (the film's scenes, for a 트랙).
  const pictures = brand?.scenes.length ?? 0;
  useEffect(() => {
    if (!pictures) return;
    const id = window.setInterval(() => setScene((s) => (s + 1) % pictures), PICTURE_MS);
    return () => window.clearInterval(id);
  }, [pictures]);
  const scenes = brand?.scenes ?? SCENES;
  const final = ready && played;
  const done = final && (!gate || entered || quiet);
  // Paused once gone (it is still in the page, under the console).
  useEffect(() => {
    if (done) film.current?.pause();
  }, [done]);

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
  // After a reload of its own with the choice still open (back from a robot): straight into the simulator.
  useEffect(() => {
    if (!quiet || !final || !gate || entered) return;
    const t = window.setTimeout(() => enter(gate.onStart), 0);
    return () => window.clearTimeout(t);
  });
  const now = scenes[scene] ?? scenes[0];
  const choose = gate && final && !quiet;
  return (
    <div
      className={css.splash}
      data-done={done || undefined}
      data-quiet={quiet || undefined}
      data-skipped={played || undefined}
      data-final={(choose && !entered) || undefined}
      aria-hidden={done}
      role={choose ? 'dialog' : 'status'}
      aria-label="Physical AI 로봇 학습 프로그램"
      onClick={() => setPlayed(true)}
    >
      {brand ? (
        brand.scenes.map((s, i) => (
          // eslint-disable-next-line @next/next/no-img-element -- the cover's pictures, also in the static export
          <img key={s.img} className={`${css.film} ${css.picture}`} data-on={i === scene || undefined} src={s.img} alt="" aria-hidden="true" />
        ))
      ) : (
        <video ref={film} className={css.film} src="/brand/intro/roll.mp4" poster="/brand/intro/roll.jpg" autoPlay muted loop playsInline preload="auto" aria-hidden="true" onTimeUpdate={(e) => setScene(sceneAt(e.currentTarget.currentTime))} />
      )}
      <div className={css.vignette} />

      <header className={css.top}>
        <span className={css.mark}>
          {/* eslint-disable-next-line @next/next/no-img-element -- the simulator's mark, also in the static export */}
          <img src="/brand/sim-mark-white.svg" alt="" width={272} height={228} />
          <i />
          {/* eslint-disable-next-line @next/next/no-img-element -- the company's logo, also in the static export */}
          <img src="/brand/robodyne-name-white.png" alt="ROBODYNE SYSTEMS" width={615} height={174} />
        </span>
        <span className={css.version}>
          <small>VERSION</small>
          <b>v1.{RELEASE}</b>
        </span>
      </header>

      <figure key={scene} className={css.caption} aria-hidden="true">
        <small>
          SCENE {String(scene + 1).padStart(2, '0')} / {String(scenes.length).padStart(2, '0')}
        </small>
        <b>{now.tag}</b>
        <span>{now.line}</span>
        <ol>
          {scenes.map((s, i) => (
            <li key={s.tag} data-on={i === scene || undefined} />
          ))}
        </ol>
      </figure>

      <div className={css.hero}>
        <h1>
          {brand?.title[0] ?? 'Physical AI'}
          <br />
          {brand?.title[1] ?? 'Simulator'}
        </h1>
        <p className={css.ko}>{brand?.ko ?? '로봇 학습 시뮬레이터'}</p>
        <p className={css.lead}>
          {brand?.lead[0] ?? '조그 · 공정 · 코딩 · AI 를 연습하고,'}
          <br />
          {brand?.lead[1] ?? '같은 프로그램을 실제 로봇에서 돌려요.'}
        </p>
        {choose ? (
          <div className={css.actions}>
            <button
              type="button"
              className={css.connect}
              aria-label={gate.onRoadmap ? '학습 로드맵' : '연결하기'}
              autoFocus
              disabled={entered}
              onClick={(e) => {
                e.stopPropagation();
                // The roadmap opens over the intro (it stays behind, to come back to).
                if (gate.onRoadmap) gate.onRoadmap();
                else enter(gate.onConnect);
              }}
            >
              {gate.onRoadmap ? (
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M4 6h11M4 12h8M4 18h11" />
                  <circle cx="18" cy="12" r="2.5" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
                  <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
                </svg>
              )}
              <span>
                <b>{gate.onRoadmap ? 'ROADMAP' : 'CONNECT'}</b>
                <small>{gate.onRoadmap ? '테마학습 · 단계별로' : '로봇 연결하기'}</small>
              </span>
              <svg className={css.chev} viewBox="0 0 24 24" aria-hidden="true">
                <path d="M9 6l6 6-6 6" />
              </svg>
            </button>
            <button
              type="button"
              className={css.start}
              aria-label="시뮬레이터로 시작"
              disabled={entered}
              onClick={(e) => {
                e.stopPropagation();
                enter(gate.onStart);
              }}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" />
                <path d="M12 12l8-4.5M12 12v9M12 12L4 7.5" />
              </svg>
              <span>
                <b>SIMULATOR</b>
                <small>{gate.onRoadmap ? '현장 둘러보고 시작' : '시뮬레이터로 시작'}</small>
              </span>
              <svg className={css.chev} viewBox="0 0 24 24" aria-hidden="true">
                <path d="M9 6l6 6-6 6" />
              </svg>
            </button>
          </div>
        ) : (
          <small className={css.hint}>{!played ? '클릭하면 건너뛰어요' : ''}</small>
        )}
      </div>

      <footer className={css.foot}>
        <div className={css.load} role="progressbar" aria-label="불러오기" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(target * 100)}>
          <i ref={bar} />
        </div>
        <span className={css.row}>
          <small className={css.note}>{choose ? (gate.onRoadmap ? '처음이면 ROADMAP 에서 튜토리얼부터, 바로 해 보려면 SIMULATOR' : '로봇과 같은 Wi-Fi 라면 CONNECT, 로봇 없이 연습하려면 SIMULATOR') : note}</small>
          <span className={css.status} data-ready={ready || undefined}>
            <i />
            {ready ? 'SYSTEM READY' : 'LOADING'}
            <small>{ready ? '시스템 준비됨' : '불러오는 중'}</small>
          </span>
        </span>
      </footer>
    </div>
  );
}
