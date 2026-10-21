'use client';

/**
 * 공정 짜기 (BEGIN–END): the process as a list of rows, the way a teaching pendant shows a
 * program. [＋ MOVE J] / [＋ MOVE L] add a row with the arm's pose as its point; a picked row can
 * take the pose again ([좌표 저장]), send the arm there ([가 보기]), run alone ([이 줄 실행]),
 * move up or down or go. Smooth / Tick, the speed, presets and the project file (.pal) sit around
 * the list; the run bar under it is the console's.
 */

import { useRef, useState, type ReactNode } from 'react';

import type { PointMm } from '@/engine/robot/tool';
import { SPEEDS } from '@/engine/simulator/program';
import { PRESETS, PROCESS_EXT, pointNames, processFromFile, processToFile, type Blend, type Process, type ProcRow } from '@/engine/simulator/process';

import css from './process.module.css';

interface Props {
  process: Process;
  onProcess(p: Process): void;
  /** The arm's joint angles now (the simulated arm, or the real one in robot mode). */
  pose(): number[];
  tipOf(angles: readonly number[]): PointMm | null;
  busy: boolean;
  /** The effector can grip (그리퍼 rows make sense). */
  canGrip: boolean;
  /** Row lit while running (1-based line), -1 none. */
  runningLine: number;
  errorLines: number[];
  onGo(joints: number[], what: string): void;
  onRunRow(index: number): void;
  onNote(kind: 'info' | 'err', msg: string): void;
  runBar: ReactNode;
}

const BLEND: { id: Blend; name: string; title: string }[] = [
  { id: 'tick', name: 'Tick', title: 'Tick: 점마다 멈췄다가 다음 줄로 (정지점)' },
  { id: 'smooth', name: 'Smooth', title: 'Smooth: 이어진 MOVE 줄의 점을 멈추지 않고 둥글게 지나가요 (블렌딩)' },
];

export default function ProcessPanel({ process: p, onProcess, pose, tipOf, busy, canGrip, runningLine, errorLines, onGo, onRunRow, onNote, runBar }: Props) {
  const [pick, setPick] = useState<number>(-1);
  const file = useRef<HTMLInputElement>(null);
  const names = pointNames(p.rows);
  const set = (rows: ProcRow[], picked = pick) => {
    onProcess({ ...p, rows });
    setPick(picked);
  };
  const add = (row: ProcRow) => {
    const at = pick >= 0 ? pick + 1 : p.rows.length;
    set([...p.rows.slice(0, at), row, ...p.rows.slice(at)], at);
  };
  const change = (i: number, row: ProcRow) => set(p.rows.map((r, k) => (k === i ? row : r)));
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= p.rows.length) return;
    const rows = p.rows.slice();
    [rows[i], rows[j]] = [rows[j], rows[i]];
    set(rows, j);
  };
  const remove = (i: number) => set(p.rows.filter((_, k) => k !== i), Math.min(i, p.rows.length - 2));

  const save = () => {
    const blob = new Blob([processToFile(p)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${p.name.replace(/[\\/:*?"<>|]/g, '_') || '공정'}${PROCESS_EXT}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    onNote('info', `프로젝트 파일로 저장했어요: ${a.download}`);
  };
  const load = async (f: File | undefined) => {
    if (!f) return;
    const r = processFromFile(await f.text());
    if ('error' in r) return onNote('err', `${f.name}: ${r.error}`);
    onProcess(r.process);
    setPick(-1);
    onNote('info', `불러왔어요: ${r.process.name} (${r.process.rows.length}줄)`);
  };
  const preset = (k: number) => {
    if (p.rows.length && !window.confirm(`지금 공정 대신 [${PRESETS[k].name}]을 불러올까요?`)) return;
    onProcess(structuredClone(PRESETS[k]) as Process);
    setPick(-1);
  };

  const xyz = (j: number[]) => {
    const t = tipOf(j);
    return t ? `x ${Math.round(t.x)} · y ${Math.round(t.y)} · z ${Math.round(t.z)}` : '';
  };

  return (
    <div className={css.wrap}>
      <div className={css.head}>
        <input className={css.name} value={p.name} maxLength={40} aria-label="공정 이름" disabled={busy} onChange={(e) => onProcess({ ...p, name: e.target.value })} />
        <div className={css.seg} role="radiogroup" aria-label="경로 방식">
          {BLEND.map((b) => (
            <button key={b.id} type="button" role="radio" aria-checked={p.blend === b.id} disabled={busy} title={b.title} onClick={() => onProcess({ ...p, blend: b.id })}>
              {b.name}
            </button>
          ))}
        </div>
        <select className={css.speed} value={p.speed} disabled={busy} aria-label="속도" onChange={(e) => onProcess({ ...p, speed: Number(e.target.value) })}>
          {SPEEDS.map(([n, v]) => (
            <option key={v} value={v}>
              {n}
            </option>
          ))}
          {!SPEEDS.some(([, v]) => v === p.speed) && <option value={p.speed}>속도 {p.speed}</option>}
        </select>
      </div>

      <div className={css.tools}>
        <button type="button" className={css.j} disabled={busy} onClick={() => add({ kind: 'move', mode: 'J', joints: pose() })} title="지금 팔 자세를 점으로 넣어요. 관절이 함께 돌아 곡선으로 가요">
          ＋ MOVE J
        </button>
        <button type="button" className={css.l} disabled={busy} onClick={() => add({ kind: 'move', mode: 'L', joints: pose() })} title="지금 팔 자세를 점으로 넣어요. 손끝이 직선으로 가요 (용접 · 끼우기)">
          ＋ MOVE L
        </button>
        {canGrip && (
          <button type="button" disabled={busy} onClick={() => add({ kind: 'grip', open: false })}>
            ＋ 그리퍼
          </button>
        )}
        <button type="button" disabled={busy} onClick={() => add({ kind: 'wait', sec: 1 })}>
          ＋ 대기
        </button>
      </div>

      <ol className={css.rows} aria-label="공정">
        <li className={css.edge}>BEGIN</li>
        {p.rows.map((r, i) => {
          const line = i + 1;
          const on = i === pick;
          return (
            <li key={i} className={css.row} data-pick={on || undefined} data-run={runningLine === line || undefined} data-err={errorLines.includes(line) || undefined}>
              <button type="button" className={css.rowMain} onClick={() => setPick(on ? -1 : i)} aria-pressed={on}>
                <i>{line}</i>
                {r.kind === 'move' ? (
                  <>
                    <span className={css.badge} data-mode={r.mode}>
                      MOVE {r.mode}
                    </span>
                    <b>{names[i]}</b>
                    <span className={css.xyz}>{r.joints ? xyz(r.joints) : '좌표 없음'}</span>
                  </>
                ) : r.kind === 'grip' ? (
                  <>
                    <span className={css.badge} data-mode="G">
                      그리퍼
                    </span>
                    <b>{r.open ? '열기' : '닫기'}</b>
                  </>
                ) : (
                  <>
                    <span className={css.badge}>대기</span>
                    <b>{r.sec}초</b>
                  </>
                )}
              </button>
              {on && (
                <div className={css.rowTools}>
                  {r.kind === 'move' && (
                    <>
                      <button type="button" className={css.save} disabled={busy} onClick={() => change(i, { ...r, joints: pose() })} title="지금 팔 자세를 이 점으로 저장해요">
                        좌표 저장
                      </button>
                      <button type="button" disabled={busy || !r.joints} onClick={() => r.joints && onGo(r.joints, names[i]!)} title="팔을 이 점으로 보내요 (J 이동)">
                        가 보기
                      </button>
                      <button type="button" disabled={busy} onClick={() => change(i, { ...r, mode: r.mode === 'J' ? 'L' : 'J' })} title="J(관절 · 곡선) ↔ L(직선)">
                        {r.mode === 'J' ? 'L' : 'J'}로 바꾸기
                      </button>
                    </>
                  )}
                  {r.kind === 'grip' && (
                    <button type="button" disabled={busy} onClick={() => change(i, { ...r, open: !r.open })}>
                      {r.open ? '닫기로' : '열기로'}
                    </button>
                  )}
                  {r.kind === 'wait' && (
                    <label className={css.sec}>
                      <input type="number" min={0.1} max={30} step={0.5} value={r.sec} disabled={busy} onChange={(e) => change(i, { ...r, sec: Number(e.target.value) })} />초
                    </label>
                  )}
                  <button type="button" disabled={busy} onClick={() => onRunRow(i)} title="이 줄만 시뮬레이션으로 실행해요 (한 줄씩)">
                    ▶ 이 줄
                  </button>
                  <span className={css.gap} />
                  <button type="button" disabled={busy || i === 0} onClick={() => move(i, -1)} aria-label="위로">
                    ↑
                  </button>
                  <button type="button" disabled={busy || i === p.rows.length - 1} onClick={() => move(i, 1)} aria-label="아래로">
                    ↓
                  </button>
                  <button type="button" className={css.del} disabled={busy} onClick={() => remove(i)} aria-label="줄 지우기">
                    ✕
                  </button>
                </div>
              )}
            </li>
          );
        })}
        {!p.rows.length && <li className={css.empty}>팔을 움직인 뒤 [＋ MOVE J]를 누르면 그 자세가 첫 점 P1 이 돼요.</li>}
        <li className={css.edge}>END</li>
      </ol>

      <div className={css.files}>
        <select value="" disabled={busy} aria-label="프리셋" onChange={(e) => e.target.value !== '' && preset(Number(e.target.value))}>
          <option value="">프리셋…</option>
          {PRESETS.map((x, k) => (
            <option key={x.name} value={k}>
              {x.name}
            </option>
          ))}
        </select>
        <button type="button" disabled={busy} onClick={() => file.current?.click()} title="프로젝트 파일(.pal) 불러오기">
          불러오기
        </button>
        <button type="button" disabled={busy || !p.rows.length} onClick={save} title="프로젝트 파일(.pal)로 저장">
          저장
        </button>
        <button
          type="button"
          disabled={busy || !p.rows.length}
          onClick={() => window.confirm('공정을 모두 지울까요?') && set([], -1)}
          title="새 공정"
        >
          새로
        </button>
        <input
          ref={file}
          type="file"
          accept={`${PROCESS_EXT},application/json`}
          hidden
          onChange={(e) => {
            void load(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </div>
      {runBar}
    </div>
  );
}
