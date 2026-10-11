'use client';

/**
 * The caption bar of a ▶ 데모 (engine/simulator/demos.ts), at the bottom of the 3D view in place of the 실습 환경
 * dock: the step (n / 4), what the arm does now in one bold line and one short line, a dot per step,
 * [블록으로 보기] (the same motion as a block program) and [■ 그만] — [닫기] once it has finished.
 */

import type { Demo } from '@/engine/simulator/demos';

import css from '../console.module.css';

interface Props {
  demo: Demo;
  step: number;
  /** Still playing (else it finished or was stopped). */
  playing: boolean;
  onBlocks(): void;
  onStop(): void;
}

export default function DemoCaption({ demo, step, playing, onBlocks, onStop }: Props) {
  const s = demo.steps[step];
  return (
    <div className={css.demoBar} data-panel="demo" role="region" aria-label="데모">
      <span className={css.demoBadge}>
        {step + 1} / {demo.steps.length}
      </span>
      <div className={css.demoText} aria-live="polite">
        <b>{s.title}</b>
        <small>{s.note}</small>
      </div>
      <span className={css.demoDots} aria-hidden="true">
        {demo.steps.map((_, k) => (
          <i key={k} data-done={k < step || (!playing && k === step) || undefined} data-now={(playing && k === step) || undefined} />
        ))}
      </span>
      <button type="button" className={css.demoBlocks} onClick={onBlocks} title="이 움직임을 블록 프로그램으로 열어요. 그대로 돌리거나 바꿔 봐요">
        블록으로 보기
      </button>
      <button type="button" className={css.demoStop} onClick={onStop} title={playing ? '데모를 멈춰요' : '자막을 닫아요'}>
        {playing ? '■ 그만' : '닫기'}
      </button>
    </div>
  );
}
