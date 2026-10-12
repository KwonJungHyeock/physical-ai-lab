'use client';

/**
 * 해결 · 원리 › 실제 로봇으로: the student runs the same values on the real arm and writes down what
 * happened — each check's measured value, whether it met the standard, the job time, pass or not.
 * Saved as a `source: 'robot'` run with the simulator run's values, so the 디지털 트윈 관제센터 pairs
 * the two (same lab, problem and values) and shows how far the real robot is from the simulator.
 *
 * The values come from the latest simulator run of this problem; without one there is nothing to
 * compare against, and the form says to run it first.
 */

import { useMemo, useState, useSyncExternalStore } from 'react';

import { RUN_LOG_KEY, loadRuns, logRun, type RunLab, type RunRecord } from '@/engine/education/runLog';
import type { SiteProblem } from '@/engine/education/lab/siteText';

import { Lines } from '../lesson/Rich';
import lg from './site.module.css';

function subscribe(on: () => void) {
  window.addEventListener(RUN_LOG_KEY, on);
  window.addEventListener('storage', on);
  return () => {
    window.removeEventListener(RUN_LOG_KEY, on);
    window.removeEventListener('storage', on);
  };
}

/** The raw log (a string, so React sees a change only when the log changes). */
function snapshot(): string {
  try {
    return localStorage.getItem(RUN_LOG_KEY) ?? '';
  } catch {
    return '';
  }
}

const clock = (t: number) => new Date(t).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });

export default function RobotRecord({ lab, problem }: { lab: RunLab; problem: SiteProblem }) {
  const raw = useSyncExternalStore(subscribe, snapshot, () => '');
  const { sim, robots } = useMemo(() => {
    const mine = raw ? loadRuns().filter((r) => r.lab === lab && r.problem === problem) : [];
    return { sim: mine.filter((r) => r.source === 'sim').at(-1) ?? null, robots: mine.filter((r) => r.source === 'robot').length };
  }, [raw, lab, problem]);
  return (
    <div className={lg.robotRec}>
      <b className={lg.robotRecHead}>실제 로봇 결과 적기</b>
      {sim ? (
        <Form key={sim.t} sim={sim} robots={robots} />
      ) : (
        <p>
          <Lines text="먼저 시뮬레이터에서 값을 고쳐 [다시 가동]해요. 그 값을 실제 로봇에서 똑같이 돌려요. 잰 결과를 여기에 적어요." />
        </p>
      )}
    </div>
  );
}

function Form({ sim, robots }: { sim: RunRecord; robots: number }) {
  const [vals, setVals] = useState(() => sim.checks.map(() => ''));
  const [oks, setOks] = useState(() => sim.checks.map((c) => c.ok));
  const [time, setTime] = useState('');
  const [pass, setPass] = useState<boolean | null>(null);
  const [saved, setSaved] = useState(false);
  const durationS = time.trim() === '' ? NaN : Number(time);
  const ready = pass !== null && (time.trim() === '' || (Number.isFinite(durationS) && durationS >= 0));
  const save = () => {
    logRun({
      lab: sim.lab,
      problem: sim.problem,
      pass: pass!,
      durationS,
      values: sim.values,
      checks: sim.checks.map((c, i) => ({ label: c.label, ok: oks[i], value: vals[i].trim() })),
      source: 'robot',
    });
    setSaved(true);
  };
  return (
    <>
      <p>
        짝지을 시뮬레이터 실행: <b>{clock(sim.t)}</b> · {sim.pass ? '통과' : '실패'}
        {Number.isFinite(sim.durationS) && ` · 작업 ${sim.durationS} s`}. 이 값 그대로 실제 로봇에서 돌리고, 잰 값을 적어요.
      </p>
      {sim.checks.length > 0 && (
        <table className={lg.robotRecTable}>
          <thead>
            <tr>
              <th>확인할 것</th>
              <th>시뮬레이터</th>
              <th>실제 로봇</th>
              <th>통과</th>
            </tr>
          </thead>
          <tbody>
            {sim.checks.map((c, i) => (
              <tr key={c.label}>
                <td>{c.label}</td>
                <td>{c.value}</td>
                <td>
                  <input
                    aria-label={`${c.label}: 실제 로봇에서 잰 값`}
                    value={vals[i]}
                    placeholder="잰 값"
                    onChange={(e) => {
                      setSaved(false);
                      setVals((v) => v.map((x, j) => (j === i ? e.target.value : x)));
                    }}
                  />
                </td>
                <td>
                  <input
                    type="checkbox"
                    aria-label={`${c.label}: 기준 통과`}
                    checked={oks[i]}
                    onChange={(e) => {
                      setSaved(false);
                      setOks((v) => v.map((x, j) => (j === i ? e.target.checked : x)));
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className={lg.robotRecRow}>
        <label>
          작업 시간
          <input inputMode="decimal" value={time} placeholder="초시계" onChange={(e) => {
              setSaved(false);
              setTime(e.target.value);
            }} />s
        </label>
        <span className={lg.robotRecPass} role="group" aria-label="실제 로봇 결과">
          <button type="button" data-on={pass === true || undefined} onClick={() => {
            setSaved(false);
            setPass(true);
          }}>
            통과
          </button>
          <button type="button" data-on={pass === false || undefined} data-bad onClick={() => {
            setSaved(false);
            setPass(false);
          }}>
            실패
          </button>
        </span>
        <button type="button" className={lg.robotRecSave} disabled={!ready || saved} onClick={save}>
          {saved ? '저장했어요' : '실제 로봇 기록 저장'}
        </button>
      </div>
      <small>
        {saved || robots > 0
          ? `이 문제의 실제 로봇 기록이 ${robots}개 있어요. 관제센터의 [디지털 트윈]에서 시뮬레이터와 비교해요.`
          : '저장하면 관제센터의 [디지털 트윈]에서 시뮬레이터 결과와 나란히 비교해요.'}
      </small>
    </>
  );
}
