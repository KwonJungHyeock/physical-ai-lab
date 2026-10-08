'use client';

/**
 * The lab's right panel: what the current step needs, and nothing that scrolls — 상황 (the story
 * and what the run measured), 원인 찾기 (the numbers to look at and one question), 값 고치기 (the
 * editors with live engine readouts: FK for ①, IK for ②, the time plan for ③), 다시 실행 · 비교
 * (before and after with measured numbers, ③'s timelines), 해결 확인 (the automatic checklist) and
 * 원리 정리 (one or two lines and the theory PDF).
 */

import { useDeferredValue, useMemo, type ReactNode } from 'react';

import { PROBLEMS, STEPS, type StepId } from '@/engine/education/lab/chapter';
import type { Mm } from '@/engine/education/lab/cell';
import {
  GRIP_TOL_MM,
  P1_DEFAULT,
  P1_RANGE,
  P1_TARGET,
  P2_APPROACH_RANGE,
  P2_BOXES,
  P2_S3_RANGE,
  P3_DEFAULT,
  P3_RANGE,
  P3_SENSOR_Y,
  outcomes,
  p1Live,
  p1Miss,
  p2DefaultValues,
  p2Plan,
  p2Readings,
  p3Offsets,
  p3Timing,
  verdict,
  type MoveType,
  type P1Values,
  type P2Values,
  type P2Plan,
  type P3Values,
  type ProblemId,
} from '@/engine/education/lab/problems';
import type { LabRun } from '@/engine/education/lab/run';
import type { ChainSegment } from '@/engine/robot/kinematics';
import { jointMax, jointMin } from '@/engine/robot/limits';

import Timeline from './Timeline';
import css from './lab.module.css';

/** A problem's runs: with the starting values, the student's latest, and the one before it (the ghost). */
export interface Runs {
  before: LabRun | null;
  latest: LabRun | null;
  previous: LabRun | null;
}

interface Props {
  chain: readonly ChainSegment[];
  prob: ProblemId;
  step: StepId;
  reached: number;
  solved: boolean;
  runs: Runs;
  busy: boolean;
  playing: boolean;
  playT: number;
  answer: number | null;
  onAnswer(i: number): void;
  v1: P1Values;
  v2: P2Values;
  v3: P3Values;
  onV1(v: P1Values): void;
  onV2(v: P2Values): void;
  onV3(v: P3Values): void;
  onFocusRow(k: number): void;
  /** ②: the IK plan for the values being edited (LabView works it out once for the 3D view and this panel). */
  plan2: P2Plan[] | null;
  onStep(s: StepId): void;
  onRun(): void;
  onReplay(): void;
  onNext(): void;
}

const f1 = (v: number) => (Math.abs(v) < 0.05 ? '0.0' : v.toFixed(1));

export default function LabPanel(props: Props) {
  const { prob, step, onStep, busy } = props;
  const text = PROBLEMS[prob - 1];
  const at = STEPS.findIndex((s) => s.id === step);
  const prev = STEPS[at - 1]?.id;
  let body: ReactNode = null;
  let action: ReactNode = null;
  switch (step) {
    case 'situation':
      body = <Situation {...props} />;
      action = (
        <button type="button" className={css.primary} onClick={() => onStep('cause')} disabled={!props.runs.before || props.playing}>
          원인 찾기 →
        </button>
      );
      break;
    case 'cause':
      body = <Cause {...props} />;
      action = (
        <button type="button" className={css.primary} onClick={() => onStep('fix')} disabled={props.answer !== text.answer}>
          값 고치기 →
        </button>
      );
      break;
    case 'fix':
      body = <Fix {...props} />;
      action = (
        <button type="button" className={css.primary} onClick={props.onRun} disabled={busy}>
          {busy ? '계산하는 중…' : '▶ 다시 실행'}
        </button>
      );
      break;
    case 'compare':
      body = <Compare {...props} />;
      action = (
        <button type="button" className={css.primary} onClick={() => onStep('verify')} disabled={!props.runs.latest}>
          해결 확인 →
        </button>
      );
      break;
    case 'verify': {
      const pass = !!props.runs.latest && verdict(prob, props.runs.latest).pass;
      body = <Verify {...props} />;
      action = pass ? (
        <button type="button" className={css.primary} onClick={() => onStep('principle')}>
          원리 정리 →
        </button>
      ) : (
        <button type="button" className={css.primary} onClick={() => onStep('fix')}>
          ← 값 다시 고치기
        </button>
      );
      break;
    }
    case 'principle':
      body = <Principle {...props} />;
      action =
        prob < 3 ? (
          <button type="button" className={css.primary} onClick={props.onNext}>
            다음 문제 {PROBLEMS[prob].mark} →
          </button>
        ) : null;
      break;
  }
  return (
    <aside className={css.panel} aria-label={`${text.mark} ${text.title} · ${STEPS[at].label}`}>
      <header className={css.head}>
        <span className={css.mark}>{text.mark}</span>
        <div>
          <b>{text.title}</b>
          <small>
            {at + 1} / 6 · {STEPS[at].label}
          </small>
        </div>
        {props.solved && <span className={css.solved}>✓ 해결</span>}
      </header>
      <div className={css.body}>{body}</div>
      <footer className={css.foot}>
        <button type="button" className={css.ghost} onClick={() => prev && onStep(prev)} disabled={!prev}>
          ← 이전
        </button>
        {action}
      </footer>
    </aside>
  );
}

/* --- pieces ------------------------------------------------------------------ */

function RunState({ run, playing, busy, onReplay }: { run: LabRun | null; playing: boolean; busy: boolean; onReplay(): void }) {
  return (
    <div className={css.runState}>
      <span data-live={playing || undefined}>{busy || !run ? '계산하는 중…' : playing ? '공정을 돌려 보는 중…' : `끝 · ${run.durationS.toFixed(1)} s 동안`}</span>
      <button type="button" className={css.small} onClick={onReplay} disabled={!run || busy}>
        ↻ 다시 보기
      </button>
    </div>
  );
}

function Headline({ prob, run }: { prob: ProblemId; run: LabRun }) {
  const v = verdict(prob, run);
  return (
    <p className={css.headline} data-ok={v.pass || undefined}>
      {v.pass ? '✓ ' : '✗ '}
      {v.headline}
    </p>
  );
}

/** ②③: what happened to each box. */
function BoxList({ run, offsets }: { run: LabRun; offsets?: (number | null)[] }) {
  return (
    <ul className={css.boxes}>
      {outcomes(run).map((o, k) => (
        <li key={o.name} data-ok={o.ok || undefined}>
          <b>{o.name}</b>
          <span>{o.text}</span>
          {offsets && offsets[k] !== null && <small>{offsets[k]! > 0 ? `${offsets[k]!.toFixed(0)} mm 일찍` : `${(-offsets[k]!).toFixed(0)} mm 늦게`}</small>}
        </li>
      ))}
    </ul>
  );
}

function Situation({ prob, runs, playing, busy, onReplay }: Props) {
  const text = PROBLEMS[prob - 1];
  const run = runs.before;
  const done = !!run && !playing;
  return (
    <>
      <p className={css.story}>{text.story}</p>
      <RunState run={run} playing={playing} busy={busy} onReplay={onReplay} />
      {done && run && (
        <div className={css.card}>
          <Headline prob={prob} run={run} />
          {prob === 1 && <P1Numbers run={run} />}
          {prob === 2 && <BoxList run={run} />}
          {prob === 3 && <BoxList run={run} offsets={p3Offsets(run)} />}
        </div>
      )}
      {done && run && <EventLog run={run} />}
    </>
  );
}

/** What happened, in order, with the time it happened (the run's own log, the notable lines). */
function EventLog({ run }: { run: LabRun }) {
  const lines = run.events.filter((e) => e.kind === 'grip' || e.kind === 'miss' || e.kind === 'unreachable' || e.kind === 'hit' || e.kind === 'start').slice(0, 6);
  return (
    <div className={css.card}>
      <p className={css.cap}>공정 기록</p>
      <ol className={css.log}>
        {lines.map((e, i) => (
          <li key={i} data-kind={e.kind}>
            <time>{e.t.toFixed(1)} s</time>
            <span>{e.text}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function P1Numbers({ run }: { run: LabRun }) {
  const e = run.events.find((x) => x.kind === 'miss' || x.kind === 'grip');
  if (!e?.at || !e.to) return null;
  return (
    <table className={css.table}>
      <thead>
        <tr>
          <th />
          <th>x</th>
          <th>y</th>
          <th>z (mm)</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <th>흡착 컵</th>
          {e.at.map((v, i) => (
            <td key={i}>{v.toFixed(1)}</td>
          ))}
        </tr>
        <tr>
          <th>상자 가운데</th>
          {e.to.map((v, i) => (
            <td key={i}>{v.toFixed(1)}</td>
          ))}
        </tr>
        <tr className={css.diff}>
          <th>빗나간 거리</th>
          <td colSpan={3}>{e.mm!.toFixed(1)} mm</td>
        </tr>
      </tbody>
    </table>
  );
}

function Cause(props: Props) {
  const { prob, answer, onAnswer } = props;
  const text = PROBLEMS[prob - 1];
  return (
    <>
      <p className={css.look}>
        <b>볼 곳</b> {text.look}
      </p>
      {prob === 1 && <Cause1 {...props} />}
      {prob === 2 && <Cause2 {...props} />}
      {prob === 3 && <Cause3 {...props} />}
      <div className={css.quiz}>
        <p>{text.question}</p>
        <div role="radiogroup" aria-label={text.question}>
          {text.choices.map((c, i) => (
            <button key={c} type="button" role="radio" aria-checked={answer === i} data-pick={answer === i ? (i === text.answer ? 'ok' : 'no') : undefined} onClick={() => onAnswer(i)}>
              {c}
            </button>
          ))}
        </div>
        {answer !== null && <p className={css.why}>{answer === text.answer ? text.why : '다시 생각해 보세요. 위의 숫자가 힌트예요.'}</p>}
      </div>
    </>
  );
}

function Cause1({ chain }: Props) {
  const live = p1Live(chain, P1_DEFAULT);
  return (
    <div className={css.card}>
      <p className={css.cap}>
        지시서 각도 J1 {P1_DEFAULT.j1}° · J2 {P1_DEFAULT.j2}° · J3 {P1_DEFAULT.j3}° → 순기구학으로 계산한 손끝
      </p>
      <XyzTable
        rows={[
          ['손끝 (계산)', live.tip],
          ['상자 가운데', live.target],
        ]}
        delta={live.delta}
        dist={live.missMm}
      />
    </div>
  );
}

function XyzTable({ rows, delta, dist }: { rows: [string, Mm][]; delta: Mm; dist: number }) {
  return (
    <table className={css.table}>
      <thead>
        <tr>
          <th />
          <th>x</th>
          <th>y</th>
          <th>z (mm)</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([name, p]) => (
          <tr key={name}>
            <th>{name}</th>
            {p.map((v, i) => (
              <td key={i}>{v.toFixed(1)}</td>
            ))}
          </tr>
        ))}
        <tr className={css.diff}>
          <th>차이</th>
          {delta.map((v, i) => (
            <td key={i} data-big={Math.abs(v) > GRIP_TOL_MM || undefined}>
              {v > 0 ? '+' : ''}
              {f1(v)}
            </td>
          ))}
        </tr>
        <tr className={css.diff}>
          <th>거리</th>
          <td colSpan={3} data-big={dist > GRIP_TOL_MM || undefined} data-ok={dist <= GRIP_TOL_MM || undefined}>
            {dist.toFixed(1)} mm {dist <= GRIP_TOL_MM ? '· 3 mm 안 ✓' : '· 3 mm 안이어야 집혀요'}
          </td>
        </tr>
      </tbody>
    </table>
  );
}

function Cause2({ chain }: Props) {
  const plan = useMemo(() => p2Plan(chain, { ...p2DefaultValues(chain), mode: 'coords' }), [chain]);
  return (
    <div className={css.card}>
      <p className={css.cap}>멈춘 자리 (센서가 알려 줌) · 로봇 몸통(J1 축)에서의 거리</p>
      <table className={css.table}>
        <tbody>
          {plan.map((p, k) => (
            <tr key={k}>
              <th>{P2_BOXES[k].name}</th>
              <td>({p.target.map((v) => v.toFixed(0)).join(', ')})</td>
              <td data-big={!p.q || undefined}>{p.radiusMm.toFixed(0)} mm</td>
              <td data-big={!p.q || undefined} data-ok={!!p.q || undefined}>
                {p.q ? '닿아요' : '닿지 않아요'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className={css.cap}>각도 하나는 손끝 자리 하나예요. 문제 1의 각도는 상자 A 자리에만 맞아요.</p>
    </div>
  );
}

function Cause3({ chain }: Props) {
  const t = useMemo(() => p3Timing(chain, P3_DEFAULT), [chain]);
  return (
    <div className={css.card}>
      <p className={css.cap}>센서가 상자를 본 때부터 (벨트 {P3_DEFAULT.belt} mm/s)</p>
      <TimePlan t={t} v={P3_DEFAULT} />
    </div>
  );
}

function TimePlan({ t, v }: { t: ReturnType<typeof p3Timing>; v: P3Values }) {
  if (!t.ok) return <p className={css.bad}>대기 자리에 손이 닿지 않아요. 대기 위치를 바꿔 보세요.</p>;
  const arrive = v.delayMs / 1000 + t.downS;
  const span = Math.max(arrive, t.boxS) * 1.15;
  const off = t.offS;
  const verdictText =
    Math.abs(off) * v.belt <= 10 ? '딱 맞아요 ✓' : off > 0 ? `${off.toFixed(2)} s 늦어요 (상자가 ${(off * v.belt).toFixed(0)} mm 지나감)` : `${(-off).toFixed(2)} s 일러요 (상자에 부딪혀요)`;
  return (
    <div className={css.plan}>
      <div className={css.lane}>
        <span>상자가 대기 지점에</span>
        <div className={css.track}>
          <i style={{ left: `${(t.boxS / span) * 100}%` }} data-kind="box" />
        </div>
        <b>{t.boxS.toFixed(2)} s</b>
      </div>
      <div className={css.lane}>
        <span>팔 도착 = 지연 + 내려가기</span>
        <div className={css.track}>
          <em style={{ width: `${(v.delayMs / 1000 / span) * 100}%` }} data-kind="wait" />
          <em style={{ left: `${(v.delayMs / 1000 / span) * 100}%`, width: `${(t.downS / span) * 100}%` }} data-kind="down" />
          <i style={{ left: `${(arrive / span) * 100}%` }} data-kind="arm" />
        </div>
        <b>
          {(v.delayMs / 1000).toFixed(2)} + {t.downS.toFixed(2)}
        </b>
      </div>
      <p className={css.planLine} data-ok={Math.abs(off) * v.belt <= 10 || undefined}>
        → {verdictText}
      </p>
      <p className={css.planLine} data-ok={t.cycleS <= t.gapS || undefined}>
        한 번 옮기고 돌아오기 {t.cycleS.toFixed(1)} s · 상자 간격 {t.gapS.toFixed(1)} s {t.cycleS <= t.gapS ? '→ 다음 상자 전에 돌아와요 ✓' : '→ 다음 상자를 놓쳐요'}
      </p>
    </div>
  );
}

/* --- 값 고치기 ------------------------------------------------------------------ */

function Slider({
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  onChange(v: number): void;
  disabled?: boolean;
}) {
  const set = (s: string) => {
    const n = Number(s);
    if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, n)));
  };
  return (
    <label className={css.slider}>
      <span>{label}</span>
      <input type="range" aria-label={label} min={min} max={max} step={step} value={value} disabled={disabled} onChange={(e) => set(e.target.value)} />
      <input type="number" aria-label={`${label} 값`} min={min} max={max} step={step} value={value} disabled={disabled} onChange={(e) => set(e.target.value)} />
      <em>{unit}</em>
    </label>
  );
}

function Fix(props: Props) {
  const text = PROBLEMS[props.prob - 1];
  return (
    <>
      <p className={css.look}>
        <b>힌트</b> {text.hint}
      </p>
      {props.prob === 1 && <Fix1 {...props} />}
      {props.prob === 2 && <Fix2 {...props} />}
      {props.prob === 3 && <Fix3 {...props} />}
    </>
  );
}

function Fix1({ chain, v1, onV1 }: Props) {
  const live = p1Live(chain, v1);
  const j = (k: keyof P1Values, label: string) => (
    <Slider label={label} value={v1[k]} min={P1_RANGE[k][0]} max={P1_RANGE[k][1]} step={0.1} unit="°" onChange={(x) => onV1({ ...v1, [k]: Math.round(x * 10) / 10 })} />
  );
  return (
    <>
      <div className={css.card}>
        {j('j1', 'J1')}
        {j('j2', 'J2')}
        {j('j3', 'J3')}
        <p className={css.cap} data-bad={!live.j4Ok || undefined}>
          자동 · J4 {live.q[3].toFixed(1)}° · J5 0° · J6 {live.q[5].toFixed(1)}°{!live.j4Ok ? ` — J4가 범위(${jointMin()[3]}° ~ ${jointMax()[3]}°)를 넘어요` : ' (컵이 늘 아래를 봐요)'}
        </p>
        <div className={css.rowBtns}>
          <button type="button" className={css.small} onClick={() => onV1(P1_DEFAULT)}>
            처음 값
          </button>
        </div>
      </div>
      <div className={css.card}>
        <p className={css.cap}>순기구학 · 이 각도면 손끝은 여기예요</p>
        <XyzTable
          rows={[
            ['손끝 (계산)', live.tip],
            ['상자 가운데', P1_TARGET],
          ]}
          delta={live.delta}
          dist={live.missMm}
        />
      </div>
    </>
  );
}

function Fix2({ chain, v2, onV2, onFocusRow, plan2 }: Props) {
  const plan = plan2 ?? [];
  const readings = p2Readings(v2.s3);
  const setTarget = (k: number, i: number, val: number) => {
    const targets = v2.targets.slice();
    const t = (targets[k] ?? readings[k]).slice() as Mm;
    t[i] = val;
    targets[k] = t;
    onV2({ ...v2, targets });
  };
  return (
    <>
      <div className={css.seg} role="radiogroup" aria-label="지정 방식">
        {(['angles', 'coords'] as const).map((m) => (
          <button key={m} type="button" role="radio" aria-checked={v2.mode === m} onClick={() => onV2({ ...v2, mode: m })}>
            {m === 'angles' ? '각도로 지정' : '좌표로 지정'}
          </button>
        ))}
      </div>
      {v2.mode === 'angles' ? (
        <div className={css.card}>
          <p className={css.cap}>모든 상자에 같은 각도 (문제 1에서 맞춘 값)</p>
          <p className={css.mono}>
            J1 {v2.pose.j1}° · J2 {v2.pose.j2}° · J3 {v2.pose.j3}°
          </p>
          <p className={css.cap}>각도 하나는 손끝 자리 하나뿐이에요. 상자 B · C에 맞추려면 각도 6개를 더 찾아야 해요. 좌표로 지정해 보세요.</p>
        </div>
      ) : (
        <div className={css.card}>
          <p className={css.cap}>목표 좌표 (mm) → 역기구학이 계산한 관절 각도</p>
          {plan.map((p, k) => {
            const t = v2.targets[k] ?? readings[k];
            return (
              <div key={k} className={css.target} data-bad={!p.q || !p.approachQ || undefined} onFocus={() => onFocusRow(k)} onPointerDown={() => onFocusRow(k)}>
                <div className={css.targetHead}>
                  <b>{P2_BOXES[k].name}</b>
                  {(['x', 'y', 'z'] as const).map((a, i) => (
                    <label key={a}>
                      {a}
                      <input
                        type="number"
                        aria-label={`${P2_BOXES[k].name} ${a}`}
                        step={1}
                        value={Math.round(t[i] * 10) / 10}
                        onChange={(e) => Number.isFinite(Number(e.target.value)) && setTarget(k, i, Number(e.target.value))}
                      />
                    </label>
                  ))}
                  {v2.targets[k] && (
                    <button
                      type="button"
                      className={css.tiny}
                      title="센서가 알려 준 자리로"
                      aria-label={`${P2_BOXES[k].name} 센서 값으로`}
                      onClick={() => onV2({ ...v2, targets: v2.targets.map((x, j) => (j === k ? null : x)) })}
                    >
                      ↺
                    </button>
                  )}
                </div>
                <p className={css.mono}>
                  {p.q
                    ? p.approachQ
                      ? p.q.map((a, i) => `J${i + 1} ${f1(a)}`).join(' · ')
                      : `접근 자리 (z ${(t[2] + v2.approach).toFixed(0)})에 닿을 수 없음 · 축에서 ${p.radiusMm.toFixed(0)} mm`
                    : `닿을 수 없음 · 축에서 ${p.radiusMm.toFixed(0)} mm`}
                </p>
              </div>
            );
          })}
        </div>
      )}
      <div className={css.card}>
        <Slider label="센서 3 위치 y" value={v2.s3} min={P2_S3_RANGE[0]} max={P2_S3_RANGE[1]} step={5} unit="mm" onChange={(s3) => onV2({ ...v2, s3 })} />
        <Slider label="접근 높이" value={v2.approach} min={P2_APPROACH_RANGE[0]} max={P2_APPROACH_RANGE[1]} step={5} unit="mm" onChange={(approach) => onV2({ ...v2, approach })} />
        <div className={css.rowBtns}>
          <button type="button" className={css.small} onClick={() => onV2(p2DefaultValues(chain))}>
            처음 값
          </button>
        </div>
      </div>
    </>
  );
}

function Fix3({ chain, v3, onV3 }: Props) {
  const deferred = useDeferredValue(v3);
  const t = useMemo(() => p3Timing(chain, deferred), [chain, deferred]);
  const set = (k: keyof P3Values) => (x: number) => onV3({ ...v3, [k]: x });
  return (
    <>
      <div className={css.card}>
        <Slider label="벨트 속도" value={v3.belt} min={P3_RANGE.belt[0]} max={P3_RANGE.belt[1]} step={10} unit="mm/s" onChange={set('belt')} />
        <Slider label="대기 위치 y" value={v3.waitY} min={P3_RANGE.waitY[0]} max={P3_RANGE.waitY[1]} step={5} unit="mm" onChange={set('waitY')} />
        <Slider label="출발 지연" value={v3.delayMs} min={P3_RANGE.delayMs[0]} max={P3_RANGE.delayMs[1]} step={10} unit="ms" onChange={set('delayMs')} />
        <Slider label="팔 속도" value={v3.speed} min={P3_RANGE.speed[0]} max={P3_RANGE.speed[1]} step={5} unit="%" onChange={set('speed')} />
        <div className={css.seg} role="radiogroup" aria-label="이동 방식">
          {(['joint', 'linear'] as MoveType[]).map((m) => (
            <button key={m} type="button" role="radio" aria-checked={v3.move === m} onClick={() => onV3({ ...v3, move: m })}>
              {m === 'joint' ? '관절 이동' : '직선 이동'}
            </button>
          ))}
        </div>
        <p className={css.cap}>
          센서는 y {P3_SENSOR_Y} mm. 센서가 상자를 보고 지연만큼 기다렸다가 내려가요.
          <button type="button" className={css.tiny} onClick={() => onV3(P3_DEFAULT)}>
            처음 값
          </button>
        </p>
      </div>
      <div className={css.card}>
        <p className={css.cap}>시간 계획 (엔진이 계산한 궤적 시간)</p>
        <TimePlan t={t} v={v3} />
      </div>
    </>
  );
}

/* --- 비교 · 확인 · 정리 -------------------------------------------------------- */

function Compare(props: Props) {
  const { prob, runs, playing, busy, onReplay, playT } = props;
  const { before, latest } = runs;
  if (!before || !latest) return <p className={css.story}>값을 고친 뒤 [다시 실행]을 누르면 여기서 비교해요.</p>;
  return (
    <>
      <RunState run={latest} playing={playing} busy={busy} onReplay={onReplay} />
      {prob === 1 && <Compare1 before={before} latest={latest} />}
      {prob === 2 && <CompareTable before={before} latest={latest} />}
      {prob === 3 && (
        <>
          <Timeline run={before} title="처음 · 상자와 흡착 컵의 위치 (벨트 방향)" waitY={P3_DEFAULT.waitY} sensorY={P3_SENSOR_Y} maxT={Math.max(before.durationS, latest.durationS)} />
          <Timeline run={latest} title="지금" waitY={props.v3.waitY} sensorY={P3_SENSOR_Y} cursor={playing ? playT : null} maxT={Math.max(before.durationS, latest.durationS)} />
          <CompareTable before={before} latest={latest} timing />
        </>
      )}
      {!playing && <Headline prob={prob} run={latest} />}
    </>
  );
}

/** ②③: each box before and after, in one small table (③ adds how early or late the cup came down). */
function CompareTable({ before, latest, timing }: { before: LabRun; latest: LabRun; timing?: boolean }) {
  const cols = [before, latest].map((run) => ({ out: outcomes(run), off: timing ? p3Offsets(run) : null }));
  const when = (o: number | null | undefined) => (o === null || o === undefined ? '' : Math.abs(o) < 0.5 ? ' · 딱 맞음' : o > 0 ? ` · ${o.toFixed(0)} mm 일찍` : ` · ${(-o).toFixed(0)} mm 늦게`);
  return (
    <table className={`${css.table} ${css.cmp}`}>
      <thead>
        <tr>
          <th />
          <th>처음</th>
          <th>지금</th>
        </tr>
      </thead>
      <tbody>
        {cols[0].out.map((o, k) => (
          <tr key={o.name}>
            <th>{o.name}</th>
            {cols.map((c, i) => (
              <td key={i} data-ok={c.out[k].ok || undefined} data-big={!c.out[k].ok || undefined}>
                {c.out[k].ok ? '✓ ' : '✗ '}
                {c.out[k].text}
                {when(c.off?.[k])}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Compare1({ before, latest }: { before: LabRun; latest: LabRun }) {
  const a = p1Miss(before);
  const b = p1Miss(latest);
  const top = Math.max(a ?? 0, b ?? 0, 10);
  const bar = (label: string, d: number | null, run: LabRun) => (
    <div className={css.barRow}>
      <span>{label}</span>
      <div className={css.barTrack}>
        <i style={{ width: `${((d ?? 0) / top) * 100}%` }} data-ok={(d ?? 99) <= GRIP_TOL_MM || undefined} />
        <s style={{ left: `${(GRIP_TOL_MM / top) * 100}%` }} title="3 mm" />
      </div>
      <b>{d === null ? (run.failure ? '부딪힘' : '—') : `${d.toFixed(1)} mm`}</b>
    </div>
  );
  return (
    <>
      <div className={css.card}>
        <p className={css.cap}>흡착 컵 ↔ 상자 가운데 (세로선이 3 mm)</p>
        {bar('처음', a, before)}
        {bar('지금', b, latest)}
      </div>
      <AnglesTable before={before} latest={latest} />
    </>
  );
}

/** ①: the angles each run went down with, and where they put the cup (the run's own numbers). */
function AnglesTable({ before, latest }: { before: LabRun; latest: LabRun }) {
  const at = (run: LabRun) => {
    const e = run.events.find((x) => x.kind === 'grip' || x.kind === 'miss');
    return e ? { q: run.frames[Math.min(run.frames.length - 1, Math.round(e.t / 0.02))].q, tip: e.at! } : null;
  };
  const cols = [at(before), at(latest)];
  const rows: [string, (c: NonNullable<ReturnType<typeof at>>) => string][] = [
    ['J1', (c) => `${f1(c.q[0])}°`],
    ['J2', (c) => `${f1(c.q[1])}°`],
    ['J3', (c) => `${f1(c.q[2])}°`],
    ['손끝 x · y · z', (c) => c.tip.map((v) => v.toFixed(1)).join(', ')],
  ];
  return (
    <table className={`${css.table} ${css.cmp}`}>
      <thead>
        <tr>
          <th />
          <th>처음</th>
          <th>지금</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([name, fmt]) => (
          <tr key={name}>
            <th>{name}</th>
            {cols.map((c, i) => (
              <td key={i}>{c ? fmt(c) : '—'}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Verify({ prob, runs }: Props) {
  const run = runs.latest;
  if (!run) return <p className={css.story}>먼저 값을 고쳐 다시 실행해 보세요.</p>;
  const v = verdict(prob, run);
  return (
    <>
      <p className={css.banner} data-ok={v.pass || undefined}>
        {v.pass ? '해결했어요!' : '아직이에요. 값을 다시 고쳐 보세요.'}
      </p>
      <ul className={css.checks}>
        {v.checks.map((c) => (
          <li key={c.label} data-ok={c.ok || undefined}>
            <i>{c.ok ? '✓' : '✗'}</i>
            <span>{c.label}</span>
            <b>{c.value}</b>
          </li>
        ))}
      </ul>
    </>
  );
}

function Principle({ prob }: Props) {
  const text = PROBLEMS[prob - 1];
  return (
    <>
      <div className={css.principle}>
        {text.principle.map((l) => (
          <p key={l}>{l}</p>
        ))}
      </div>
      <div className={css.pdfs}>
        <p className={css.cap}>이론 자료 (PDF)</p>
        {text.pdf.map((p) => (
          <a key={p.href} href={p.href} target="_blank" rel="noopener">
            <span>PDF</span> {p.label}
          </a>
        ))}
      </div>
      {prob === 3 && <p className={css.cap}>세 문제를 다 풀었어요. 왼쪽 위 [← 교육 홈]으로 돌아갈 수 있어요.</p>}
    </>
  );
}
