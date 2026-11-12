'use client';

/**
 * 입문 과정 절의 조작판 (장별 가이드라인 v1): only the keys a 절 asks for, each marked with its
 * `data-step` (the '지금 할 일' rings the one to press now). 1-1: ▶ 시뮬레이션 · 손 다가가기 · 손 치우기.
 * 1-3: 작업 범위 보기 · ▶ 시뮬레이션 (정지 is the 정지 key below, as everywhere). 2-3: 기본 자세 · 일자로
 * 펴기 · 정지 only. 2-4: 도구 [달기 ›] · 보정 카드 (x · y locked, the pen's height) · ▶ 시뮬레이션. 2장
 * 수행평가: all of these, nothing lit.
 */

import type { CourseStepId } from '@/engine/simulator/cell/courseSteps';

import Icon from '../Icon';
import { AssetSlot } from '../stage/CourseMarks';

import css from './courseStep.module.css';

interface Props {
  /** The 절 (none: a 수행평가 mission). */
  id?: CourseStepId;
  busy: boolean;
  /** ▶ 시뮬레이션 (none: no run in this 절). */
  onRun?: () => void;
  /** 2-4 · 2장: the tool row (none on: [달기 ›] puts the pen on). */
  tool?: { on: boolean; onAttach(): void };
  /** 2-4 · 2장: the 보정 card — the card's corner (shown, locked) and the pen's height above the paper, mm. */
  pen?: { x: number; y: number; z: number; onZ(z: number): void };
  /** 2-3 · 2장: back to the 기본 자세, straight up (영점), stop. */
  poses?: { onHome(): void; onZero(): void; onStop(): void };
  /** 2-1 ①: the box of parts (each one's picture an asset slot), pressed one by one to see its name. */
  kit?: { parts: readonly { name: string; id: string }[]; seen: readonly number[]; onSee(part: number): void };
  /** 3장 미션: the [확인] that judges the pose. */
  confirm?: { text: string; onConfirm(): void };
  /** 3-5: the moves timed so far, s. */
  times?: { slow?: number; fast?: number };
  /** 1-1. */
  hand?: { near: boolean; onIn(): void; onOut(): void };
  /** 1-3. */
  range?: { on: boolean; onToggle(): void };
}

export default function CourseStepPanel({ id, busy, onRun, hand, range, tool, pen, poses, kit, confirm, times }: Props) {
  return (
    <div className={css.panel} role="group" aria-label={id ? `${id} 조작` : '미션 조작'}>
      {kit && (
        <div className={css.kit} data-step="kit" role="group" aria-label="구성품 상자">
          <b>구성품 상자</b>
          <div>
            {kit.parts.map((p, i) => (
              <button key={p.id} type="button" data-seen={kit.seen.includes(i) || undefined} aria-label={kit.seen.includes(i) ? p.name : `구성품 ${i + 1}`} onClick={() => kit.onSee(i)}>
                <AssetSlot slot={{ id: p.id, label: p.name, at: [0, 0, 0], w: 132, h: 84 }} />
                <span>{kit.seen.includes(i) ? p.name : '?'}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {times && (
        <div className={css.times}>
          <b>이동에 걸린 시간</b>
          <span>
            속도 30% · <output>{times.slow != null ? `${times.slow}초` : '—'}</output>
          </span>
          <span>
            속도 100% · <output>{times.fast != null ? `${times.fast}초` : '—'}</output>
          </span>
        </div>
      )}
      {confirm && (
        <div className={css.confirm}>
          <span>{confirm.text}</span>
          <button type="button" className={css.run} disabled={busy} onClick={confirm.onConfirm}>
            확인
          </button>
        </div>
      )}
      {tool && (
        <div className={css.toolRow}>
          <span>
            도구 <b>{tool.on ? '펜' : '없음'}</b>
          </span>
          <button type="button" data-step="attach" disabled={busy || tool.on} onClick={tool.onAttach}>
            달기 ›
          </button>
        </div>
      )}
      {pen && (
        <div className={css.calib} data-step="pen">
          <b>보정</b>
          <label>
            x <output>{pen.x}</output>
          </label>
          <label>
            y <output>{pen.y}</output>
          </label>
          <label>
            펜
            <input type="number" step={0.5} min={-5} max={10} value={pen.z} disabled={busy} aria-label="펜 높이 (종이 위, mm)" onChange={(e) => e.target.value !== '' && pen.onZ(Number(e.target.value))} />
            mm
          </label>
          <small>x · y는 맞는 값으로 잠겨 있어요 · 펜: 점을 찍을 때 펜 끝 높이 (종이 위)</small>
        </div>
      )}
      {range && (
        <label className={css.switch} data-step="range">
          <input type="checkbox" checked={range.on} onChange={range.onToggle} />
          <i aria-hidden="true" />
          작업 범위 보기
        </label>
      )}
      {onRun && (
        <button type="button" className={css.run} data-step="run" disabled={busy} onClick={onRun}>
          ▶ 시뮬레이션
        </button>
      )}
      {poses && (
        <div className={css.poses}>
          <button type="button" data-step="home" disabled={busy} onClick={poses.onHome}>
            <Icon name="home" size={16} /> 기본 자세
          </button>
          <button type="button" data-step="zero" disabled={busy} onClick={poses.onZero}>
            <Icon name="zero" size={16} /> 일자로 펴기
          </button>
          <button type="button" className={css.stop} data-step="stop" onClick={poses.onStop}>
            <Icon name="stop" size={15} /> 정지 <kbd>Esc</kbd>
          </button>
        </div>
      )}
      {hand && (
        <div className={css.pair}>
          <button type="button" data-step="hand-in" data-on={hand.near || undefined} onClick={hand.onIn}>
            손 다가가기
          </button>
          <button type="button" data-step="hand-out" onClick={hand.onOut}>
            손 치우기
          </button>
        </div>
      )}
    </div>
  );
}
