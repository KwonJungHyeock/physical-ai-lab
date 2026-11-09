'use client';

/**
 * Run bar at the foot of a coding tab, icons side by side: ▶ simulate, the
 * speed key (two triangles: each press fills one more — ×2, ×4 — and the
 * third press goes back to real time), the robot's own play button (opens
 * once the simulation passed) and ■ stop. Stop is also in the top bar and on
 * Esc.
 */

import { useState } from 'react';

import Icon from '../Icon';
import css from '../console.module.css';

interface Props {
  /** The program in the editor passed the simulator (the robot step is open). */
  passed: boolean;
  /** This task already ran on the real robot. */
  robotDone: boolean;
  robotMode: boolean;
  busy: boolean;
  /** The 3D model is loaded (simulation possible). */
  ready: boolean;
  /** A run on the robot is going: its step, e.g. "3/12". */
  realProgress: string | null;
  realDisabled: boolean;
  /** Why the robot button is closed, in a few words; null when open. */
  realBlocked: string | null;
  onSim(): void;
  /** Simulation speed 1, 2 or 4. */
  simRate: number;
  onSimRate(rate: number): void;
  onReal(): void;
  onStop(): void;
  /**
   * 입문 퀘스트: only ▶ and ■ in sight; the speed key, the robot's button and these go under ⋯
   * (자유 연습 …). The bar then sits in the panel right under the quest's controls (not at the
   * foot) and ■ shows only while something runs.
   */
  more?: { label: string; onClick(): void; disabled?: boolean }[];
}

const RATE_NAME: Record<number, string> = { 1: '보통', 2: '2배', 4: '4배' };

/** Two triangles, filled one per step of speed: none = real time, one = ×2, both = ×4. */
function Speed({ rate }: { rate: number }) {
  const lit = rate >= 4 ? 2 : rate >= 2 ? 1 : 0;
  return (
    <svg viewBox="0 0 28 18" width="30" height="20" aria-hidden="true">
      {[0, 1].map((k) => (
        <path
          key={k}
          d={`M${2 + k * 12} 2.5v13l11-6.5z`}
          fill={k < lit ? 'currentColor' : 'none'}
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
      ))}
    </svg>
  );
}

/** The robot drawn with a play mark: "run on the robot". */
function RobotPlay() {
  return (
    <span className={css.robotPlay} aria-hidden="true">
      <Icon name="robot" size={20} />
      <svg viewBox="0 0 10 10" width="11" height="11">
        <path d="M2.5 1.5v7l6-3.5z" fill="currentColor" />
      </svg>
    </span>
  );
}

export default function RunBar(p: Props) {
  const [open, setOpen] = useState(false);
  const realTitle = p.realBlocked
    ? p.realBlocked === '로봇 연결 필요'
      ? '로봇과 연결되면 열려요'
      : '먼저 ▶ 시뮬레이션에서 프로그램이 부딪힘 없이 끝나야 열려요 (안전 확인)'
    : p.robotMode
      ? '실제 로봇이 움직여요'
      : '로봇에서 실행할 파이썬 코드를 받아요';
  const rate = (
    <button
      type="button"
      className={css.runRate}
      data-rate={p.simRate}
      onClick={() => p.onSimRate(p.simRate === 1 ? 2 : p.simRate === 2 ? 4 : 1)}
      aria-label={`시뮬레이션 빠르기: ${RATE_NAME[p.simRate] ?? '보통'} (누르면 바뀜)`}
      title="시뮬레이션 빠르기. 한 번: 2배 (세모 하나), 두 번: 4배 (세모 둘), 세 번: 보통. 실제 로봇은 늘 제 속도"
    >
      <Speed rate={p.simRate} />
      <b className={css.runRateX}>×{p.simRate}</b>
    </button>
  );
  return (
    <div className={css.runDock} role="group" aria-label="실행" data-panel="run" data-quest={p.more ? '' : undefined}>
      <button
        type="button"
        className={css.runSim}
        data-done={p.passed || undefined}
        disabled={p.busy || !p.ready}
        onClick={p.onSim}
        aria-label="시뮬레이션"
        title="프로그램을 시뮬레이터에서 돌려 검사해요 (Ctrl+Enter)"
      >
        <Icon name="play" size={18} />
        <span>시뮬레이션</span>
        {p.passed && <i className={css.runOk} aria-label="통과">✓</i>}
      </button>
      {/* 입문 퀘스트: the speed beside ▶ (×1 · ×4), to be said aloud in class ("빠르게 눌러요"). */}
      {p.more && (
        <button
          type="button"
          className={css.runFast}
          aria-pressed={p.simRate > 1}
          onClick={() => p.onSimRate(p.simRate > 1 ? 1 : 4)}
          aria-label={p.simRate > 1 ? `빠르게 ×${p.simRate} (누르면 보통)` : '보통 빠르기 (누르면 ×4)'}
          title="시뮬레이션 빠르기: 보통 ×1 · 빠르게 ×4 (실제 로봇은 늘 제 속도)"
        >
          <Speed rate={p.simRate > 1 ? 4 : 1} />
          <b>×{p.simRate}</b>
        </button>
      )}
      {p.more && (
        <button type="button" className={css.runMore} aria-expanded={open} aria-label="더 보기" title="코드 받기 · 자유 연습" onClick={() => setOpen((o) => !o)}>
          <Icon name="dots" size={20} />
        </button>
      )}
      <span className={p.more ? css.runMenu : css.runInline} data-open={open || undefined} onClick={() => p.more && setOpen(false)}>
      {!p.more && rate}
      <button type="button" className={css.runReal} data-done={p.robotDone || undefined} disabled={p.realDisabled} onClick={p.onReal} aria-label={p.robotMode ? '로봇에서 실행' : '로봇용 코드 받기'} title={realTitle}>
        {p.realBlocked ? <Icon name="lock" size={16} /> : p.robotMode ? <RobotPlay /> : <Icon name="code" size={18} />}
        <span className={css.runRealText}>
          {p.robotMode ? '로봇 실행' : '코드 받기'}
          {p.realBlocked && <small>{p.realBlocked}</small>}
        </span>
        {p.realProgress && <kbd>{p.realProgress}</kbd>}
        {p.robotDone && !p.realBlocked && <i className={css.runOk} aria-label="했어요">✓</i>}
      </button>
      {p.more?.map((m) => (
        <button key={m.label} type="button" className={css.runMenuItem} disabled={m.disabled} onClick={m.onClick}>
          {m.label}
        </button>
      ))}
      </span>
      {/* 입문 퀘스트: ■ only while something runs (Esc still stops at any time). */}
      {(!p.more || p.busy) && (
        <button type="button" className={css.runStop} onClick={p.onStop} aria-label="정지" title="정지 (Esc · 스페이스)">
          <Icon name="stop" size={16} />
          <span>정지</span>
        </button>
      )}
    </div>
  );
}
