'use client';

/**
 * 실습 셀 on the 3D view: the step ladder (one condition more each step), the mission card with its
 * checks as they stand now, a 고장's cause with [점검 · 복구], the signal lamp strip (the cell's inputs
 * and outputs, cycle time, parts stacked) — or, in 자유 실습, the equipment panel to run the line by hand.
 *
 * The cell's state is read from the world a few times a second; its alerts are handed to the page's
 * notices as they happen.
 */

import { useEffect, useState, type RefObject } from 'react';

import { CELL_BY_ID, cellLayout, gridPlace, type CellId } from '@/engine/simulator/cell/cells';
import type { CellAlert } from '@/engine/simulator/cell/faults';
import { setOut } from '@/engine/simulator/cell/line';
import { missionById, missionsOf } from '@/engine/simulator/cell/missions';
import { CAFE_BOARD, type NarratePlace } from '@/engine/simulator/cell/narrate';
import { LIFE_STOPS } from '@/engine/simulator/lifeFields';
import { questShort, type QuestPhase } from '@/engine/simulator/cell/quests';
import { cellChecks } from '@/engine/simulator/cell/run';
import type { WorldState } from '@/engine/simulator/sim';

import Icon from '../Icon';
import FieldTicks from '../tasks/FieldTicks';
import css from './cellHud.module.css';

/** The ladder's bands: robot only, the line on 자동 운전, the signals by hand. */
const BAND: Record<string, { name: string; note: string }> = {
  basic: { name: '기초', note: '로봇만' },
  applied: { name: '응용', note: '장비 자동 운전' },
  challenge: { name: '도전', note: '신호 직접' },
};
const bandOf = (n: number) => (n <= 5 ? 'basic' : n <= 9 ? 'applied' : 'challenge');

interface Snap {
  inputs: [string, boolean][];
  outputs: [string, boolean][];
  auto: boolean;
  cycle: number | null;
  stacked: number;
  /** C's record: parts passed on and ejected (null on other lines). */
  record: { passed: number; ejected: number } | null;
  /** D's record: cycles finished and cut short (null on cells without a machine). */
  made: { done: number; cut: number } | null;
  /** E's record: housings with all their pins, pins caught (null on cells without insertion). */
  built: { done: number; jams: number } | null;
  /** C: a part waits at the station for 보내기 or 밀어내기. */
  held: boolean;
  fault: CellAlert | null;
  halt: CellAlert | null;
  checks: { label: string; ok: boolean; detail?: string }[] | null;
  /** 단계 안내: the moments seen so far in this run. */
  observed: Record<string, number>;
  /** 로봇 카페: the equipment a signal was just about (신호 관제판 lights it). */
  said: NarratePlace | null;
  /** 로봇 카페: drinks handed over. */
  served: number;
}

function snapOf(w: WorldState | null): Snap | null {
  const run = w?.cell;
  if (!w || !run) return null;
  const l = run.layout;
  const pallet = l.grids['적재 판'];
  let stacked = 0;
  if (pallet)
    for (let k = 0; k < pallet.rows * pallet.cols * pallet.layers; k += 1) {
      const p = gridPlace(pallet, k);
      if (w.objects.some((o) => o.id !== w.carry?.id && Math.hypot(o.x - p.x, o.y - p.y) < 8 && Math.abs(o.z - p.z) < 6)) stacked += 1;
    }
  const end = run.endT ?? run.line.t;
  return {
    inputs: l.inputs.map((n) => [n, !!run.line.in[n]]),
    outputs: l.outputs.map((n) => [n, !!run.line.out[n]]),
    auto: run.line.auto,
    cycle: run.startT === null ? null : end - run.startT,
    stacked,
    record: l.line.inspect ? { passed: run.line.passed, ejected: run.line.ejected } : null,
    made: l.line.cycle ? { done: run.line.machined, cut: run.line.cut } : null,
    built: l.line.insert ? { done: w.objects.filter((o) => (o.pins?.length ?? 0) >= l.line.insert!.holes.length).length, jams: run.events.filter((e) => e.type === 'insert' && !e.ok).length } : null,
    held: run.line.phase === 'held' && !run.line.ask,
    fault: run.health.fault,
    halt: run.halt,
    checks: cellChecks(w)?.items ?? null,
    observed: { ...run.observed },
    said: run.said?.place ?? null,
    served: run.cafe?.served.length ?? 0,
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
  /** 입문 트랙: the step tabs only, the lamps folded (the rest: StepGuide.tsx). */
  guides?: boolean;
  /** 입문 퀘스트 모드: the quest card's phase, the checklist as the last run ended (null: not run yet), what to do now, the places' list. */
  quest?: QuestInfo;
  /** 퀘스트 모드: the quest card stands in the side panel, not here. */
  questOut?: boolean;
}

/** 입문 퀘스트 모드: the quest card's phase, the checklist as the last run ended (null: not run yet), what to do now, the places' list. */
export interface QuestInfo {
  phase: QuestPhase;
  checks: { label: string; ok: boolean; detail?: string }[] | null;
  now: string;
  onList(): void;
  /** 예측 (O · X) open over the scene now. */
  asking?: boolean;
  /** 해 보기 by hand: what goes on now (the machine pouring) — the gauge on 관찰, these words the goal. */
  watching?: string;
  /** 교실 수업형: the quest's pages in the 교안 ('교안 6–7쪽'), by its name. */
  page?: string;
  /** 교실 수업형: open by the teacher's 차시 (lessonRecord.ts questOpen); null = in turn (a pass opens the next). */
  isOpen?: (id: string) => boolean | null;
}

interface QuestCardProps {
  cell: CellId;
  mission: string | null;
  passed: Record<string, boolean>;
  allOpen: boolean;
  busy: boolean;
  onMission(id: string | null): void;
  quest?: QuestInfo;
  /** At the top of the side panel (퀘스트 모드). */
  inPanel?: boolean;
}

/**
 * 입문: the quest card — the place and its quests on a line, then the quest open now: its checklist
 * (✓ · ✗ and what was off, as the last run ended) and the one thing to do now. In 퀘스트 모드 it is
 * the top of the side panel, over the cards it points at and the run button (시뮬레이션 챕터 공통
 * 양식 v2: 미션 · 지금 할 일 at the top of the right rail); the scene stays clear.
 */
export function QuestCard(p: QuestCardProps) {
  const [hint, setHint] = useState(false);
  const steps = missionsOf(p.cell);
  const m = p.mission ? missionById(p.mission) : null;
  const stop = LIFE_STOPS.find((s) => s.opens === p.cell);
  const built = CELL_BY_ID[p.cell].built;
  const open = (i: number) => built && (p.allOpen || i === 0 || !!p.passed[steps[i - 1].id]);
  if (p.inPanel) return <PanelQuest {...p} />;
  return (
        <nav className={css.stepper} data-panel={p.inPanel || undefined} aria-label="퀘스트">
          <header>
            <em>{stop?.phase ?? 'QUEST'}</em>
            <b>{CELL_BY_ID[p.cell].name}</b>
            {stop && <FieldTicks className={css.stepTicks} on={(f) => stop.fields.includes(f)} />}
            <span>
              {steps.filter((s) => p.passed[s.id]).length}/{steps.length}
            </span>
            {p.inPanel && p.quest && (
              <button type="button" className={css.qListHead} onClick={p.quest.onList} disabled={p.busy}>
                목록
              </button>
            )}
          </header>
          <ol>
            {steps.map((s, i) => (
              <li key={s.id} data-cur={s.id === p.mission || undefined} data-done={p.passed[s.id] || undefined} data-locked={!open(i) || undefined}>
                <button type="button" disabled={p.busy || !open(i)} onClick={() => p.onMission(s.id)} title={open(i) ? `퀘스트 ${s.n} ${s.title}` : '앞 퀘스트를 통과하면 열려요'} aria-pressed={s.id === p.mission} aria-label={`퀘스트 ${s.n} ${s.title}`}>
                  {p.passed[s.id] ? '✓' : s.n}
                </button>
              </li>
            ))}
            <li className={css.freeStep} data-cur={p.mission === null || undefined}>
              <button type="button" disabled={p.busy} onClick={() => p.onMission(null)} aria-pressed={p.mission === null} title="채점 없이 메뉴를 모두 써서 자유롭게 움직여 봐요">
                자유 연습
              </button>
            </li>
          </ol>
          {m ? (
            <>
              <p className={css.qTitle}>
                <i>
                  QUEST {m.n}
                  {m.stage ? ` · ${m.stage}` : ''}
                  {p.inPanel && <span className={css.sheet}>학습지 p.{m.n}</span>}
                </i>
                {m.title}
              </p>
              {/* In the side panel no checklist: the result (✓ · ✗) comes over the scene (StepResult modal). */}
              {!p.inPanel && <ul className={css.qChecks}>
                {(m.checks ?? []).map((c, k) => {
                  const r = p.quest?.checks?.[k];
                  return (
                    <li key={c.label} data-ok={r?.ok || undefined} data-bad={(r && !r.ok) || undefined}>
                      <i aria-hidden="true">{r ? (r.ok ? '✓' : '✗') : ''}</i>
                      <span>{c.label}</span>
                      {r && !r.ok && r.detail && <em>{r.detail}</em>}
                    </li>
                  );
                })}
              </ul>}
              {p.quest && (
                <div className={css.qNow} data-phase={p.quest.phase}>
                  <em>지금 할 일</em>
                  <p>{p.quest.now}</p>
                  {p.quest.phase === 'do' && (
                    <button type="button" className={css.qHint} aria-expanded={hint} onClick={() => setHint((h) => !h)}>
                      {hint ? '힌트 접기' : '힌트 보기'}
                    </button>
                  )}
                  {hint && p.quest.phase === 'do' && <small className={css.qHintText}>{m.hint}</small>}
                </div>
              )}
            </>
          ) : (
            <p className={css.qTitle}>
              <i>FREE</i>
              자유 연습 · 채점 없이 메뉴를 모두 써 봐요
            </p>
          )}
          {p.quest && !p.inPanel && (
            <button type="button" className={css.qList} onClick={p.quest.onList} disabled={p.busy}>
              현장 · 퀘스트 목록
            </button>
          )}
        </nav>
  );
}



/** The four moves of every quest, as the lesson plan names them (manuals/course/life-track-teacher.md). */
const PHASES = ['할 일', '예측', '관찰', '개념'] as const;

/**
 * 입문 퀘스트 모드, the top of the side panel, as a game's quest tracker in the console's metal
 * language (a plate, tracked tags, grooves, white for what is lit): the quest's number and name, the
 * place's quests as nodes on a track, the four moves as a segment gauge, and the goal in a few words
 * in a groove (the full sentence and the hint behind ?). What the quest changes stands right under it.
 */
function PanelQuest(p: QuestCardProps) {
  const [hint, setHint] = useState(false);
  const steps = missionsOf(p.cell);
  const m = p.mission ? missionById(p.mission) : null;
  const built = CELL_BY_ID[p.cell].built;
  const q = p.quest;
  const open = (i: number) => built && (q?.isOpen?.(steps[i].id) ?? (p.allOpen || i === 0 || !!p.passed[steps[i - 1].id]));
  const lockWhy = q?.isOpen ? '선생님이 이 차시를 열면 열려요' : '앞 퀘스트를 통과하면 열려요';
  const now = !q ? -1 : q.asking ? 1 : q.watching ? 2 : q.phase === 'do' ? 0 : q.phase === 'run' ? 2 : 3;
  const two = (n: number) => String(n).padStart(2, '0');
  return (
    <nav className={css.qPanel} aria-label="퀘스트">
      <header className={css.qHead}>
        <em>QUEST</em>
        <b className={css.qNum}>
          {m ? two(m.n) : '--'}
          <small>/{two(steps.length)}</small>
        </b>
        <span className={css.qName}>{m ? m.title.replace(/^[^:]+:\s*/, '') : '자유 연습'}</span>
        {q?.page && <span className={css.qPage}>{q.page}</span>}
        {q && (
          <button type="button" className={css.qListKey} onClick={q.onList} disabled={p.busy} aria-label="현장 · 퀘스트 목록" title="현장 · 퀘스트 목록">
            <Icon name="grid" size={14} />
          </button>
        )}
      </header>
      <ol className={css.qTrack}>
        {steps.map((s, i) => (
          <li key={s.id} data-cur={s.id === p.mission || undefined} data-done={p.passed[s.id] || undefined} data-lock={!open(i) || undefined}>
            <button type="button" disabled={p.busy || !open(i)} onClick={() => p.onMission(s.id)} title={open(i) ? `퀘스트 ${s.n} ${s.title}` : lockWhy} aria-pressed={s.id === p.mission} aria-label={`퀘스트 ${s.n} ${s.title}`}>
              {p.passed[s.id] && s.id !== p.mission ? '✓' : s.n}
            </button>
          </li>
        ))}
      </ol>
      {m && q && (
        <>
          <ol className={css.qGauge} aria-label="단계">
            {PHASES.map((ph, k) => (
              <li key={ph} data-on={k === now || undefined} data-done={k < now || undefined}>
                <i />
                {ph}
              </li>
            ))}
          </ol>
          <div className={css.qGoal} data-phase={q.watching ? 'run' : q.phase}>
            <i aria-hidden="true" />
            <p>{q.watching ?? questShort(q.phase, m.id, q.phase === 'result' ? !!q.checks?.every((c) => c.ok) : null)}</p>
            <button type="button" aria-expanded={hint} aria-label={hint ? '자세한 설명 접기' : '자세한 설명 · 힌트'} onClick={() => setHint((h) => !h)}>
              ?
            </button>
            {hint && (
              <small>
                {q.now}
                {q.phase === 'do' && (
                  <>
                    <br />
                    <b>힌트</b> {m.hint}
                  </>
                )}
              </small>
            )}
          </div>
        </>
      )}
    </nav>
  );
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
  // 입문 트랙: the step tabs only (the goal, the prediction, the result and the idea are where they are
  // looked at — the notice board, the run button, the scene; StepGuide.tsx); the signal lamps folded.
  const compact = !!p.guides;
  const [lampsOpen, setLampsOpen] = useState(false);
  // A cell whose ladder is still to come: its steps stay shut, its equipment is run by hand.
  const built = CELL_BY_ID[p.cell].built;
  const layout = cellLayout(p.cell);
  const keys = (name: string): [string, string] => layout.keys?.[name] ?? (name.includes('실린더') ? ['전진', '후진'] : ['운전', '정지']);
  const open = (i: number) => built && (p.allOpen || i === 0 || !!p.passed[steps[i - 1].id]);
  const run = () => p.world.current?.cell ?? null;
  const out = (name: string, on: boolean) => {
    const r = run();
    if (r) setOut(r.line, name, on);
  };
  const ask = (what: 'send' | 'eject') => {
    const r = run();
    if (r && r.line.phase === 'held') r.line.ask = what;
  };

  return (
    <div className={css.hud} data-strip={p.questOut || undefined} aria-label="실습 셀">
      {/* 입문: the quest card (자유 연습 here; a quest's own card stands at the top of the side panel). */}
      {compact && !p.questOut && <QuestCard cell={p.cell} mission={p.mission} passed={p.passed} allOpen={p.allOpen} busy={p.busy} onMission={p.onMission} quest={p.quest} />}
      {/* Step ladder. */}
      {!compact && <nav className={css.ladder} aria-label="단계">
        <b className={css.cellName}>
          {CELL_BY_ID[p.cell].letter} {CELL_BY_ID[p.cell].name.replace(' 셀', '')}
          {!built && <small className={css.soon}>단계 준비 중</small>}
        </b>
        {steps.map((s, i) => (
          <span key={s.id} className={css.tileWrap}>
            {i > 0 && bandOf(s.n) !== bandOf(steps[i - 1].n) && <i className={css.sep} />}
            <button
              type="button"
              className={css.tile}
              data-cur={s.id === p.mission || undefined}
              data-done={p.passed[s.id] || undefined}
              disabled={p.busy || !open(i)}
              onClick={() => p.onMission(s.id)}
              title={open(i) ? `${s.id} ${s.title}: ${s.adds}` : built ? '앞 단계를 통과하면 열려요' : `${s.id} ${s.title}: 준비 중이에요`}
              aria-pressed={s.id === p.mission}
            >
              {s.id}
              {!open(i) && <small aria-label="잠김">🔒</small>}
            </button>
          </span>
        ))}
        <i className={css.sep} />
        <button type="button" className={css.tile} data-cur={p.mission === null || undefined} data-free disabled={p.busy} onClick={() => p.onMission(null)} aria-pressed={p.mission === null} title="채점 없이 셀을 자유롭게 움직여 봐요">
          자유
        </button>
      </nav>}

      {/* A 고장: what broke and how to fix it, and the repair. */}
      {snap?.fault && (
        <section className={css.fault} role="alert">
          <b>고장 · {snap.fault.title}</b>
          <p>{snap.fault.msg}</p>
          {snap.fault.fix && <p className={css.fix}>고칠 점: {snap.fault.fix}</p>}
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

      {m && compact ? null : m ? (
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
                  <i aria-hidden="true">{c.ok ? '✓' : '·'}</i>
                  <span>{c.label}</span>
                  {c.detail && <em>{c.detail}</em>}
                </li>
              ))}
            </ul>
          )}
          {p.result !== null && !p.busy && (
            <p className={css.result} data-ok={p.result || undefined}>
              {p.result ? `통과! ${steps[m.n] ? `다음 단계 ${steps[m.n].id}가 열렸어요.` : '이 셀의 마지막 단계예요.'}` : '아직이에요. ✓가 안 된 항목을 고쳐 다시 실행해 보세요.'}
            </p>
          )}
          <div className={css.row}>
            {m.hint && (
              <button type="button" className={css.link} onClick={() => setHint((h) => !h)}>
                {hint ? '힌트 접기' : '힌트 보기'}
              </button>
            )}
            {p.onExample && (
              <button type="button" className={css.link} disabled={p.busy} onClick={p.onExample}>
                예시 프로그램 (선생님)
              </button>
            )}
          </div>
          {hint && m.hint && <p className={css.hint}>{m.hint}</p>}
        </section>
      ) : (
        <section className={css.card}>
          <header>
            <b>{built ? '자유 실습' : '장비 미리 보기'}</b>
            <span>채점 없음</span>
          </header>
          <p className={css.goal}>{built ? '조그 · 블록 · Python으로 로봇을 움직이고, 아래 조작판으로 장비를 직접 켜고 꺼 봐요. 알림 규칙은 같아요.' : '단계 실습은 준비 중이에요. 아래 조작판으로 장비를 움직여 보고, 조그 · 블록으로 로봇을 데려가 봐요.'}</p>
          {(layout.line.pusher || layout.line.dispenser) && (
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
                    r.line.phase = 'idle';
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
                {layout.line.inspect ? '1개 투입' : '1개 공급'}
              </button>
              {layout.line.inspect && (
                <>
                  {/* C: the part held at the station goes on to the stopper, or into the reject bin. */}
                  <button type="button" className={css.key} disabled={p.busy || !!snap?.fault || !snap?.held} onClick={() => ask('send')}>
                    보내기
                  </button>
                  <button type="button" className={css.key} disabled={p.busy || !!snap?.fault || !snap?.held} onClick={() => ask('eject')}>
                    밀어내기
                  </button>
                </>
              )}
            </div>
          ) : (
            <>
              {(snap?.outputs ?? []).map(([name, on]) => (
                <div key={name} className={css.ctl}>
                  <span>{name}</span>
                  <button type="button" className={css.key} data-on={on || undefined} disabled={p.busy || !!snap?.fault} onClick={() => out(name, true)}>
                    {keys(name)[0]}
                  </button>
                  <button type="button" className={css.key} data-on={!on || undefined} disabled={p.busy || !!snap?.fault} onClick={() => out(name, false)}>
                    {keys(name)[1]}
                  </button>
                </div>
              ))}
            </>
          )}
          <div className={css.ctl}>
            <span>셀</span>
            <button type="button" className={css.key} disabled={p.busy} onClick={p.onReset}>
              처음 상태로
            </button>
          </div>
        </section>
      )}

      {compact && snap && !(p.cell === 'cafe' && m?.mode && m.mode !== 'make') && (
        <button type="button" className={css.lampsToggle} aria-expanded={lampsOpen} onClick={() => setLampsOpen((o) => !o)}>
          <em>SIGNAL</em> 신호 {lampsOpen ? '접기' : '보기'}
          <span aria-hidden="true">
            {snap.inputs.filter(([, on]) => on).length + snap.outputs.filter(([, on]) => on).length} 켜짐
          </span>
        </button>
      )}
      {/* 로봇 카페 (입문): the signals by equipment, as a control room would show them. */}
      {/* 입문 카페: 보기 shows the one place the narrated signal is at; 해 보기 none (its panel has the
          machine's own lamps); 만들기 and on, the whole board behind SIGNAL. */}
      {snap && compact && p.cell === 'cafe' && (m?.mode === 'watch' ? !!snap.said && <CafeBoard snap={snap} only={snap.said} /> : (!m?.mode || m.mode === 'make') && lampsOpen && <CafeBoard snap={snap} />)}
      {/* Signal lamps, cycle time, parts stacked. */}
      {snap && (!compact || lampsOpen) && !(compact && p.cell === 'cafe') && (
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
              <span key={n} className={css.lamp} data-out data-on={on || undefined}>
                <i />
                {n}
              </span>
            ))}
          </span>
          <span className={css.kpis}>
            <span className={css.kpi}>
              <small>사이클</small>
              {snap.cycle === null ? '-' : `${snap.cycle.toFixed(1)} s`}
            </span>
            {snap.record ? (
              <>
                <span className={css.kpi}>
                  <small>양품</small>
                  {snap.record.passed}
                </span>
                <span className={css.kpi}>
                  <small>불량</small>
                  {snap.record.ejected}
                </span>
                <span className={css.kpi}>
                  <small>불량률</small>
                  {snap.record.passed + snap.record.ejected ? `${Math.round((100 * snap.record.ejected) / (snap.record.passed + snap.record.ejected))}%` : '-'}
                </span>
              </>
            ) : snap.built ? (
              <>
                <span className={css.kpi}>
                  <small>조립 완료</small>
                  {snap.built.done}
                </span>
                <span className={css.kpi}>
                  <small>걸림</small>
                  {snap.built.jams}
                </span>
              </>
            ) : snap.made ? (
              <>
                <span className={css.kpi}>
                  <small>가공 완료</small>
                  {snap.made.done}
                </span>
                <span className={css.kpi}>
                  <small>가공 중단</small>
                  {snap.made.cut}
                </span>
              </>
            ) : (
              <span className={css.kpi}>
                <small>적재</small>
                {snap.stacked}
              </span>
            )}
          </span>
        </footer>
      )}
    </div>
  );
}

/**
 * 신호 관제판 (로봇 카페): one card per piece of equipment, in the order a drink goes — its picture,
 * what the robot sends it (출력, amber) and what it answers (입력, green); the one a signal was just
 * about is lit. The cycle time and the drinks handed over at the end.
 */
function CafeBoard({ snap, only }: { snap: Snap; only?: string }) {
  const ins = new Map(snap.inputs);
  const outs = new Map(snap.outputs);
  // 보기 (주문 한 잔 따라가기): only the equipment the signal is going to or coming from now.
  const shown = only ? CAFE_BOARD.filter((st) => st.place === only) : CAFE_BOARD;
  return (
    <section className={css.board} aria-label="신호 관제판" data-one={only ? '' : undefined}>
      <header>
        <b>{only ? '지금 신호' : '신호 관제판'}</b>
        <span className={css.legend}>
          <i data-out /> 로봇 → 장비 (출력)
        </span>
        <span className={css.legend}>
          <i /> 장비 → 로봇 (입력)
        </span>
        {!only && (
          <>
            <span className={css.boardKpi}>
              사이클 <b>{snap.cycle === null ? '-' : `${snap.cycle.toFixed(0)}초`}</b>
            </span>
            <span className={css.boardKpi}>
              완성 <b>{snap.served}잔</b>
            </span>
          </>
        )}
      </header>
      <ol>
        {shown.map((st) => {
          const lit = snap.said === st.place || st.outs.some((n) => outs.get(n));
          return (
            <li key={st.place} data-lit={lit || undefined}>
              <span className={css.stTop}>
                {/* eslint-disable-next-line @next/next/no-img-element -- a small picture of the 3D equipment, also in the static export */}
                <img src={st.img} alt="" width={40} height={40} />
                <b>{st.place}</b>
              </span>
              {st.outs.map((n) => (
                <span key={n} className={css.sig} data-out data-on={outs.get(n) || undefined}>
                  <i />
                  {n}
                </span>
              ))}
              {st.ins.map((n) => (
                <span key={n} className={css.sig} data-on={ins.get(n) || undefined}>
                  <i />
                  {n}
                </span>
              ))}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
