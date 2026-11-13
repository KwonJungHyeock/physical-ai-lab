'use client';

/**
 * 입문 과정 절의 조작판 (장별 가이드라인 v1): only the keys a 절 asks for, each marked with its
 * `data-step` (the '지금 할 일' rings the one to press now). 1-1: ▶ 시뮬레이션 · 손 다가가기 · 손 치우기.
 * 1-3: 작업 범위 보기 · ▶ 시뮬레이션 (정지 is the 정지 key below, as everywhere). 2-3: 기본 자세 · 일자로
 * 펴기 · 정지 only. 2-4: 도구 [달기 ›] · 보정 카드 (x · y locked, the pen's height) · ▶ 시뮬레이션. 2장
 * 수행평가: all of these, nothing lit.
 */

import type { CourseStepId } from '@/engine/simulator/cell/courseSteps';
import { failLine } from '@/engine/simulator/cell/courseText';

import Icon from '../Icon';
import { AssetSlot } from '../stage/CourseMarks';

import css from './courseStep.module.css';

/** 4장: one thing a run measured — a number (shown large, one decimal) with what it is, or a check line. */
export interface Measure {
  key: string;
  label: string;
  value?: number;
  unit?: string;
}

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
  /** 4-2: the '직선 이동으로 쓰기' switch (off: joint moves). */
  linear?: { on: boolean; locked?: boolean; onToggle(): void };
  /** 4-3 · 4장 미션: the vertex table (x · y, robot mm), joined in order and closed by the app. */
  vertices?: { rows: readonly { x: string; y: string }[]; max: number; onChange(rows: { x: string; y: string }[]): void };
  /** 4-4: the circle's centre and radius, and how many points. */
  circle?: { x: string; y: string; r: string; count: number; counts: readonly number[]; onChange(c: { x: string; y: string; r: string }): void; onCount(n: number): void };
  /** 4장: what the last runs measured. */
  results?: readonly Measure[];
  /** 5-4: the 획 그리기 판's key (open · close · 다시 그리기, always in this place) and its strokes' list (✕ one, or all). */
  board?: { open: boolean; ran: boolean; count: number; onToggle(): void; onRemove(i: number): void; onClear(): void };
  /** 5-5: the robot (connect), the speed sent with the program (%, over 30 locks [로봇 실행]), the teacher's check. */
  real?: { connected: boolean; onConnect(): void; speed: number; onSpeed(v: number): void; ran: boolean; checked: boolean; onTeacher(): void };
}

/** 판정 줄 (수정 지시서 v2 파트 B-1): what a run read, ✓ · ✗ a line each — 5-1 · 5-2 · 5-3 show it in the panel as 4-3 · 5-4 do. */
export function VerdictLines({ checks }: { checks: readonly { label: string; ok: boolean; detail?: string }[] }) {
  return (
    <ul className={css.results} aria-label="판정">
      {checks.map((c, i) => (
        <li key={i}>
          {c.ok ? '✓' : '✗'} {c.label}
          {c.detail ? ` · ${c.detail}` : ''}
        </li>
      ))}
    </ul>
  );
}

export default function CourseStepPanel({ id, busy, onRun, hand, range, tool, pen, poses, kit, confirm, times, linear, vertices, circle, results, board, real }: Props) {
  return (
    <div className={css.panel} role="group" aria-label={id ? `${id} 조작` : '미션 조작'}>
      {kit && (
        <div className={css.kit} data-step="kit" role="group" aria-label="구성품 상자">
          <div>
            {kit.parts.map((p, i) => (
              <button key={p.id} type="button" data-seen={kit.seen.includes(i) || undefined} aria-label={kit.seen.includes(i) ? p.name : `구성품 ${i + 1}`} onClick={() => kit.onSee(i)}>
                <AssetSlot slot={{ id: p.id, label: p.name, at: [0, 0, 0], w: 132, h: 84 }} />
                <span>{kit.seen.includes(i) ? p.name : '\u00a0'}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {times && (
        <div className={css.times}>
          <b>이동에 걸린 시간</b>
          <span className={css.measure}>
            <span>속도 30%</span>
            <b>
              {times.slow != null ? (
                <>
                  {times.slow.toFixed(1)}
                  <small>초</small>
                </>
              ) : (
                '—'
              )}
            </b>
          </span>
          <span className={css.measure}>
            <span>속도 100%</span>
            <b>
              {times.fast != null ? (
                <>
                  {times.fast.toFixed(1)}
                  <small>초</small>
                </>
              ) : (
                '—'
              )}
            </b>
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
      {linear && (
        <label className={css.switch} data-step="linear">
          <input type="checkbox" checked={linear.on} disabled={busy || linear.locked} onChange={linear.onToggle} />
          <i aria-hidden="true" />
          직선 이동으로 쓰기 <small>{linear.on ? '켜짐 · 곧게' : '꺼짐 · 관절 이동'}</small>
        </label>
      )}
      {vertices && (
        <div className={css.table} data-step="vertices" role="group" aria-label="꼭짓점 표">
          <b>꼭짓점 표</b>
          <div className={css.tableHead} aria-hidden="true">
            <span>점</span>
            <span>x (mm)</span>
            <span>y (mm)</span>
          </div>
          {vertices.rows.map((r, i) => (
            <div key={i} className={css.tableRow}>
              <span>{i + 1}</span>
              <input type="number" step={1} value={r.x} disabled={busy} aria-label={`${i + 1}번 점 x`} onChange={(e) => vertices.onChange(vertices.rows.map((q, k) => (k === i ? { ...q, x: e.target.value } : q)))} />
              <input type="number" step={1} value={r.y} disabled={busy} aria-label={`${i + 1}번 점 y`} onChange={(e) => vertices.onChange(vertices.rows.map((q, k) => (k === i ? { ...q, y: e.target.value } : q)))} />
            </div>
          ))}
          <div className={css.tableKeys}>
            <button type="button" disabled={busy || vertices.rows.length >= vertices.max} onClick={() => vertices.onChange([...vertices.rows, { x: '', y: '' }])}>
              + 점 더하기
            </button>
            <button type="button" disabled={busy || vertices.rows.length <= 1} onClick={() => vertices.onChange(vertices.rows.slice(0, -1))}>
              − 마지막 점 빼기
            </button>
          </div>
          <small>마지막 점에서 첫 점으로 돌아가는 선은 앱이 이어요</small>
        </div>
      )}
      {circle && (
        <div className={css.table} role="group" aria-label="원">
          <b>원</b>
          <div className={css.circleRow} data-step="circle">
            <label>
              중심 x <input type="number" step={1} value={circle.x} disabled={busy} aria-label="원 중심 x" onChange={(e) => circle.onChange({ x: e.target.value, y: circle.y, r: circle.r })} />
            </label>
            <label>
              y <input type="number" step={1} value={circle.y} disabled={busy} aria-label="원 중심 y" onChange={(e) => circle.onChange({ x: circle.x, y: e.target.value, r: circle.r })} />
            </label>
            <label>
              반지름 <input type="number" step={1} min={1} value={circle.r} disabled={busy} aria-label="원 반지름" onChange={(e) => circle.onChange({ x: circle.x, y: circle.y, r: e.target.value })} />
            </label>
          </div>
          <div className={css.countRow} data-step="count" role="group" aria-label="점 개수">
            <span>점 개수</span>
            {circle.counts.map((n) => (
              <button key={n} type="button" aria-pressed={circle.count === n} disabled={busy} onClick={() => circle.onCount(n)}>
                {n}개
              </button>
            ))}
          </div>
        </div>
      )}
      {board && (
        <div className={css.table}>
          <button type="button" className={css.boardKey} data-step="board" data-open={board.open || undefined} disabled={busy} onClick={board.onToggle}>
            {board.open ? '판 닫기' : board.ran ? '다시 그리기' : '획 그리기 판 열기'}
          </button>
          <div className={css.strokes} data-step="strokes" role="group" aria-label="획 목록">
            {board.count === 0 && <small>아직 그린 획이 없어요</small>}
            {Array.from({ length: board.count }, (_, i) => (
              <button key={i} type="button" disabled={busy} onClick={() => board.onRemove(i)} aria-label={`${i + 1}번 획 지우기`}>
                {i + 1} <span aria-hidden="true">✕</span>
              </button>
            ))}
          </div>
          <button type="button" className={css.clearAll} disabled={busy || board.count === 0} onClick={board.onClear}>
            모두 지우기
          </button>
        </div>
      )}
      {real && (
        <div className={css.table}>
          <div className={css.realRow}>
            <span>
              로봇 <b>{real.connected ? '연결됨' : '연결 안 됨'}</b>
            </span>
            <button type="button" data-step="connect" disabled={busy} onClick={real.onConnect}>
              연결 창 열기
            </button>
          </div>
          <label className={css.realSpeed}>
            <span>
              실물 속도 <b>{real.speed}%</b>
              {real.speed > 30 && <em>{failLine('5-5', 'tooFast')}</em>}
            </span>
            <input type="range" min={10} max={100} step={5} value={real.speed} disabled={busy} aria-label="실물 속도" onChange={(e) => real.onSpeed(Number(e.target.value))} />
          </label>
          <div className={css.realRow}>
            <span>
              선생님 확인 <b>{real.checked ? '받았어요' : real.ran ? '받기 전' : '실물 실행 뒤'}</b>
            </span>
            <button type="button" data-step="teacher" disabled={busy || !real.ran || real.checked} onClick={real.onTeacher}>
              선생님 확인
            </button>
          </div>
        </div>
      )}
      {onRun && (
        <button type="button" className={css.run} data-step="run" disabled={busy} onClick={onRun}>
          <Icon name="play" size={18} />
          시뮬레이션
        </button>
      )}
      {results && results.length > 0 && (
        <ul className={css.results} aria-label="잰 값">
          {results.map((r) =>
            r.value == null ? (
              <li key={r.key}>{r.label}</li>
            ) : (
              <li key={r.key} className={css.measure}>
                <span>{r.label}</span>
                <b>
                  {r.value.toFixed(1)}
                  <small>{r.unit}</small>
                </b>
              </li>
            ),
          )}
        </ul>
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
