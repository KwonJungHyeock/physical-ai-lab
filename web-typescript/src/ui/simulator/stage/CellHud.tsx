"use client";

/**
 * 실습 셀 on the 3D view: the step ladder (one condition more each step), the mission card with its
 * checks as they stand now, a 고장's cause with [점검 · 복구], the signal lamp strip (the cell's inputs
 * and outputs, cycle time, parts stacked) — or, in 자유 실습, the equipment panel to run the line by hand.
 *
 * The cell's state is read from the world a few times a second; its alerts are handed to the page's
 * notices as they happen.
 */

import { useEffect, useState, type RefObject } from "react";

import {
  CELL_BY_ID,
  cellLayout,
  gridPlace,
  type CellId,
} from "@/engine/simulator/cell/cells";
import type { CellAlert } from "@/engine/simulator/cell/faults";
import { setOut } from "@/engine/simulator/cell/line";
import { missionById, missionsOf } from "@/engine/simulator/cell/missions";
import { cellChecks } from "@/engine/simulator/cell/run";
import type { WorldState } from "@/engine/simulator/sim";

import css from "./cellHud.module.css";

/** The ladder's bands: robot only, the line on 자동 운전, the signals by hand. */
const BAND: Record<string, { name: string; note: string }> = {
  basic: { name: "기초", note: "로봇만" },
  applied: { name: "응용", note: "장비 자동 운전" },
  challenge: { name: "도전", note: "신호 직접" },
};
const bandOf = (n: number) =>
  n <= 5 ? "basic" : n <= 9 ? "applied" : "challenge";

interface Snap {
  inputs: [string, boolean][];
  outputs: [string, boolean][];
  auto: boolean;
  cycle: number | null;
  stacked: number;
  fault: CellAlert | null;
  halt: CellAlert | null;
  checks: { label: string; ok: boolean; detail?: string }[] | null;
}

function snapOf(w: WorldState | null): Snap | null {
  const run = w?.cell;
  if (!w || !run) return null;
  const l = run.layout;
  const pallet = l.grids["적재 판"];
  let stacked = 0;
  if (pallet)
    for (let k = 0; k < pallet.rows * pallet.cols * pallet.layers; k += 1) {
      const p = gridPlace(pallet, k);
      if (
        w.objects.some(
          (o) =>
            o.id !== w.carry?.id &&
            Math.hypot(o.x - p.x, o.y - p.y) < 8 &&
            Math.abs(o.z - p.z) < 6,
        )
      )
        stacked += 1;
    }
  const end = run.endT ?? run.line.t;
  return {
    inputs: l.inputs.map((n) => [n, !!run.line.in[n]]),
    outputs: l.outputs.map((n) => [n, !!run.line.out[n]]),
    auto: run.line.auto,
    cycle: run.startT === null ? null : end - run.startT,
    stacked,
    fault: run.health.fault,
    halt: run.halt,
    checks: cellChecks(w)?.items ?? null,
  };
}

export interface CellHudProps {
  world: RefObject<WorldState | null>;
  cell: CellId;
  /** The ladder step open, or null for 자유 실습. */
  mission: string | null;
  /** Steps passed (by id). */
  passed: Readonly<Record<string, boolean>>;
  /** Every step open (a teacher's account). */
  allOpen: boolean;
  busy: boolean;
  /** The last finished run of this step: passed or not. */
  result: boolean | null;
  onMission(id: string | null): void;
  onRepair(): void;
  /** A teacher puts the step's example program into the editor. */
  onExample?: () => void;
  onAlert(a: CellAlert): void;
  /** 자유 실습: a fresh cell (parts back, the line stopped). */
  onReset(): void;
}

export default function CellHud(p: CellHudProps) {
  const [snap, setSnap] = useState<Snap | null>(() => snapOf(p.world.current));
  const [hint, setHint] = useState(false);
  const { world, onAlert } = p;
  useEffect(() => {
    const id = window.setInterval(() => {
      const run = world.current?.cell;
      if (run?.fresh.length) run.fresh.splice(0).forEach(onAlert);
      setSnap(snapOf(world.current));
    }, 250);
    return () => window.clearInterval(id);
  }, [world, onAlert]);

  const steps = missionsOf(p.cell);
  const m = p.mission ? missionById(p.mission) : null;
  // A cell whose ladder is still to come: its steps stay shut, its equipment is run by hand.
  const built = CELL_BY_ID[p.cell].built;
  const layout = cellLayout(p.cell);
  const keys = (name: string): [string, string] =>
    layout.keys?.[name] ??
    (name.includes("실린더") ? ["전진", "후진"] : ["운전", "정지"]);
  const open = (i: number) =>
    built && (p.allOpen || i === 0 || !!p.passed[steps[i - 1].id]);
  const run = () => p.world.current?.cell ?? null;
  const out = (name: string, on: boolean) => {
    const r = run();
    if (r) setOut(r.line, name, on);
  };

  return (
    <div className={css.hud} aria-label="실습 셀">
      {/* Step ladder. */}
      <nav className={css.ladder} aria-label="단계">
        <b className={css.cellName}>
          {CELL_BY_ID[p.cell].letter}{" "}
          {CELL_BY_ID[p.cell].name.replace(" 셀", "")}
          {!built && <small className={css.soon}>단계 준비 중</small>}
        </b>
        {steps.map((s, i) => (
          <span key={s.id} className={css.tileWrap}>
            {i > 0 && bandOf(s.n) !== bandOf(steps[i - 1].n) && (
              <i className={css.sep} />
            )}
            <button
              type="button"
              className={css.tile}
              data-cur={s.id === p.mission || undefined}
              data-done={p.passed[s.id] || undefined}
              disabled={p.busy || !open(i)}
              onClick={() => p.onMission(s.id)}
              title={
                open(i)
                  ? `${s.id} ${s.title}: ${s.adds}`
                  : built
                    ? "앞 단계를 통과하면 열려요"
                    : `${s.id} ${s.title}: 준비 중이에요`
              }
              aria-pressed={s.id === p.mission}
            >
              {s.id}
              {!open(i) && <small aria-label="잠김">🔒</small>}
            </button>
          </span>
        ))}
        <i className={css.sep} />
        <button
          type="button"
          className={css.tile}
          data-cur={p.mission === null || undefined}
          data-free
          disabled={p.busy}
          onClick={() => p.onMission(null)}
          aria-pressed={p.mission === null}
          title="채점 없이 셀을 자유롭게 움직여 봐요"
        >
          자유
        </button>
      </nav>

      {/* A 고장: what broke and how to fix it, and the repair. */}
      {snap?.fault && (
        <section className={css.fault} role="alert">
          <b>고장 · {snap.fault.title}</b>
          <p>{snap.fault.msg}</p>
          {snap.fault.fix && (
            <p className={css.fix}>고칠 점: {snap.fault.fix}</p>
          )}
          <button type="button" className={css.repair} onClick={p.onRepair}>
            점검 · 복구
          </button>
        </section>
      )}
      {!snap?.fault && snap?.halt && !p.busy && (
        <section className={css.stop}>
          <b>정지 · {snap.halt.title}</b>
          <p>{snap.halt.fix ?? snap.halt.msg}</p>
          <small>프로그램을 고쳐 다시 실행하면 풀려요.</small>
        </section>
      )}

      {m ? (
        <section className={css.card}>
          <header>
            <b>
              {m.id} {m.title}
            </b>
            <span>
              {BAND[bandOf(m.n)].name} · {m.n}/{steps.length}
            </span>
          </header>
          <p className={css.adds}>+ 이번에 더해진 조건: {m.adds}</p>
          <p className={css.goal}>{m.goal}</p>
          {snap?.checks && (
            <ul className={css.checks}>
              {snap.checks.map((c) => (
                <li key={c.label} data-ok={c.ok || undefined}>
                  <i aria-hidden="true">{c.ok ? "✓" : "·"}</i>
                  <span>{c.label}</span>
                  {c.detail && <em>{c.detail}</em>}
                </li>
              ))}
            </ul>
          )}
          {p.result !== null && !p.busy && (
            <p className={css.result} data-ok={p.result || undefined}>
              {p.result
                ? `통과! ${steps[m.n] ? `다음 단계 ${steps[m.n].id}가 열렸어요.` : "이 셀의 마지막 단계예요."}`
                : "아직이에요. ✓가 안 된 항목을 고쳐 다시 실행해 보세요."}
            </p>
          )}
          <div className={css.row}>
            {m.hint && (
              <button
                type="button"
                className={css.link}
                onClick={() => setHint((h) => !h)}
              >
                {hint ? "힌트 접기" : "힌트 보기"}
              </button>
            )}
            {p.onExample && (
              <button
                type="button"
                className={css.link}
                disabled={p.busy}
                onClick={p.onExample}
              >
                예시 프로그램 (선생님)
              </button>
            )}
          </div>
          {hint && m.hint && <p className={css.hint}>{m.hint}</p>}
        </section>
      ) : (
        <section className={css.card}>
          <header>
            <b>{built ? "자유 실습" : "장비 미리 보기"}</b>
            <span>채점 없음</span>
          </header>
          <p className={css.goal}>
            {built
              ? "조그 · 블록 · Python으로 로봇을 움직이고, 아래 조작판으로 장비를 직접 켜고 꺼 봐요. 알림 규칙은 같아요."
              : "단계 실습은 준비 중이에요. 아래 조작판으로 장비를 움직여 보고, 조그 · 블록으로 로봇을 데려가 봐요."}
          </p>
          {layout.line.pusher && (
            <div className={css.seg} role="group" aria-label="운전">
              <button
                type="button"
                aria-pressed={!!snap?.auto}
                disabled={p.busy}
                onClick={() => {
                  const r = run();
                  if (r) r.line.auto = true;
                }}
              >
                자동 운전
              </button>
              <button
                type="button"
                aria-pressed={!snap?.auto}
                disabled={p.busy}
                onClick={() => {
                  const r = run();
                  if (r) {
                    r.line.auto = false;
                    r.line.phase = "idle";
                  }
                }}
              >
                직접 조작
              </button>
            </div>
          )}
          {snap?.auto ? (
            <div className={css.ctl}>
              <span>공급 요청</span>
              <button
                type="button"
                className={css.key}
                data-go
                disabled={p.busy || !!snap?.fault}
                onClick={() => {
                  const r = run();
                  if (r) r.line.requests += 1;
                }}
              >
                1개 공급
              </button>
            </div>
          ) : (
            <>
              {(snap?.outputs ?? []).map(([name, on]) => (
                <div key={name} className={css.ctl}>
                  <span>{name}</span>
                  <button
                    type="button"
                    className={css.key}
                    data-on={on || undefined}
                    disabled={p.busy || !!snap?.fault}
                    onClick={() => out(name, true)}
                  >
                    {keys(name)[0]}
                  </button>
                  <button
                    type="button"
                    className={css.key}
                    data-on={!on || undefined}
                    disabled={p.busy || !!snap?.fault}
                    onClick={() => out(name, false)}
                  >
                    {keys(name)[1]}
                  </button>
                </div>
              ))}
            </>
          )}
          <div className={css.ctl}>
            <span>셀</span>
            <button
              type="button"
              className={css.key}
              disabled={p.busy}
              onClick={p.onReset}
            >
              처음 상태로
            </button>
          </div>
        </section>
      )}

      {/* Signal lamps, cycle time, parts stacked. */}
      {snap && (
        <footer className={css.lamps} aria-label="신호">
          <span className={css.grp}>
            <b>입력</b>
            {snap.inputs.map(([n, on]) => (
              <span key={n} className={css.lamp} data-on={on || undefined}>
                <i />
                {n}
              </span>
            ))}
          </span>
          <span className={css.grp}>
            <b>출력</b>
            {snap.outputs.map(([n, on]) => (
              <span
                key={n}
                className={css.lamp}
                data-out
                data-on={on || undefined}
              >
                <i />
                {n}
              </span>
            ))}
          </span>
          <span className={css.kpi}>
            <small>사이클</small>
            {snap.cycle === null ? "-" : `${snap.cycle.toFixed(1)} s`}
          </span>
          <span className={css.kpi}>
            <small>적재</small>
            {snap.stacked}
          </span>
        </footer>
      )}
    </div>
  );
}
