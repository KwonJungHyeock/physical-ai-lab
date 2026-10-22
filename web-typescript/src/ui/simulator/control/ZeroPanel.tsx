'use client';

/**
 * Zero calibration of the real robot, two ways.
 *
 * 6축 맞추기 (the one way taught in class, with the fewest things to go wrong), one step at a time:
 * 준비 (tools off) → 0° 자세 (the arm goes nearly straight up by itself) → 관절 (J1 → J6: release only
 * that joint, line up its two marks by hand, lock it; the rest of the arm stays locked, so nothing
 * flops and one hand is enough) → 저장 (all six at once) → 확인 (home and back to 0°). The zero is
 * stored in the servos themselves (no offsets kept by the console), as the official procedure.
 *
 * 한 관절 다듬기 — to correct one joint later: from the 0° pose the robot turns the joint in 0.5° / 2°
 * steps until its two marks meet, then that joint is saved.
 *
 * Saving is pymycobot set_servo_calibration (the servo is released for a moment first, then locked
 * again). The 3D view rings the joint being set. Only short labels here: the steps are in the manual.
 */

import { useState } from 'react';

import Icon from '../Icon';
import { useLive, type Live } from '../liveStore';
import css from '../console.module.css';

const JOINT_NAME = ['베이스', '어깨', '팔꿈치', '손목 꺾기', '손목 돌리기', '끝 원판'];
const STEPS = ['준비', '0° 자세', '관절', '저장', '확인'];
const JOINTS = [1, 2, 3, 4, 5, 6];

type Method = 'all' | 'one';

interface Props {
  /** Live robot state (read here, so the rest of the console does not redraw 10 times a second). */
  live: Live;
  busy: boolean;
  onFocusJoint(joint: number | null): void;
  onPose(which: 'home' | 'zero'): Promise<void> | void;
  onJointServo(joint: number, off: boolean): Promise<boolean>;
  /** Turn one joint of the real arm by a small angle. */
  onNudge(joint: number, deltaDeg: number): Promise<boolean>;
  onCalibrate(joints: number[]): Promise<boolean>;
  onClose(): void;
}

export default function ZeroPanel(p: Props) {
  const [method, setMethod] = useState<Method>('all');
  const [joint, setJoint] = useState(1);
  const [saved, setSaved] = useState<number[]>([]);
  const [working, setWorking] = useState(false);
  // 6축 맞추기: tools off, the arm sent to 0°, the joints lined up so far, the joint at hand.
  const [ready, setReady] = useState(false);
  const [posed, setPosed] = useState(false);
  const [lined, setLined] = useState<number[]>([]);
  const [turn, setTurn] = useState(1);
  const robot = useLive(p.live, (v) => v.robot);
  const off = p.busy || working || !robot?.connected;
  const angles = robot?.angles ?? null;
  const limp = robot?.limp ?? [];
  const anyLimp = limp.some(Boolean);
  const allLined = lined.length === 6;
  const step = !ready ? 0 : !posed ? 1 : !allLined ? 2 : saved.length < 6 ? 3 : 4;

  const act = async (fn: () => Promise<unknown> | unknown) => {
    setWorking(true);
    try {
      return await fn();
    } finally {
      setWorking(false);
    }
  };
  const pick = (m: Method) => {
    setMethod(m);
    p.onFocusJoint(m === 'one' ? joint : step === 2 ? turn : null);
  };
  const choose = (j: number) => {
    setJoint(j);
    p.onFocusJoint(j);
  };
  const toTurn = (j: number) => {
    setTurn(j);
    p.onFocusJoint(j);
  };
  /** The joint at hand is lined up (locked again, or already right): on to the next one. */
  const lineUp = async (j: number) => {
    if (limp[j - 1] && !(await act(() => p.onJointServo(j, false)))) return;
    const next = [...new Set([...lined, j])];
    setLined(next);
    const n = JOINTS.find((k) => !next.includes(k)) ?? null;
    if (n) setTurn(n);
    p.onFocusJoint(n);
  };
  const close = () => {
    p.onFocusJoint(null);
    p.onClose();
  };
  const reading = (j: number) => (angles ? `${angles[j - 1].toFixed(1)}°` : '—');

  return (
    <div className={css.zeroPanel}>
      <div className={css.zeroTabs} role="tablist" aria-label="영점 맞추는 방법">
        <button type="button" role="tab" aria-selected={method === 'all'} onClick={() => pick('all')}>
          <b>6축 맞추기</b>
        </button>
        <button type="button" role="tab" aria-selected={method === 'one'} onClick={() => pick('one')}>
          <b>한 관절 다듬기</b>
        </button>
      </div>

      {method === 'all' && (
        <div className={css.zeroFlow}>
          <ol className={css.zeroSteps}>
            {STEPS.map((n, i) => (
              <li key={n} data-state={i < step ? 'done' : i === step ? 'now' : undefined}>
                {n}
              </li>
            ))}
          </ol>

          {step === 0 && (
            <>
              <p className={css.zeroLead}>도구를 빼고 주변을 비워요</p>
              <button type="button" className={css.btnPrimary} onClick={() => setReady(true)}>
                <Icon name="check" size={14} /> 준비됐어요
              </button>
            </>
          )}

          {step === 1 && (
            <>
              <p className={css.zeroLead}>팔을 위로 곧게</p>
              <button
                type="button"
                className={css.btnPrimary}
                disabled={off || anyLimp}
                onClick={async () => {
                  await act(() => p.onPose('zero'));
                  setPosed(true);
                  p.onFocusJoint(turn);
                }}
              >
                <Icon name="zero" size={14} /> 0° 자세로
              </button>
            </>
          )}

          {step === 2 && (
            <>
              <div className={css.zeroPick} role="group" aria-label="관절">
                {JOINTS.map((j) => (
                  <button key={j} type="button" aria-pressed={turn === j} onClick={() => toTurn(j)}>
                    J{j}
                    {lined.includes(j) && <Icon name="check" size={11} />}
                  </button>
                ))}
              </div>
              <div className={css.zeroJoint}>
                <span className={css.zeroJointNo}>J{turn}</span>
                <span>
                  {JOINT_NAME[turn - 1]}
                  {limp[turn - 1] && <small>풀림</small>}
                </span>
                <b className={css.zeroNow}>{reading(turn)}</b>
              </div>
              <p className={css.zeroLead}>표시선 두 개를 일직선으로</p>
              <div className={css.zeroStepBtns}>
                {limp[turn - 1] ? (
                  <button type="button" className={css.btnPrimary} disabled={off} onClick={() => void lineUp(turn)}>
                    <Icon name="check" size={14} /> 고정 · 다음
                  </button>
                ) : (
                  <>
                    <button type="button" className={css.jogWide} disabled={off} onClick={() => void act(() => p.onJointServo(turn, true))}>
                      <Icon name="hand" size={14} /> J{turn} 풀기
                    </button>
                    <button type="button" className={css.jogWide} disabled={off} onClick={() => void lineUp(turn)}>
                      맞음 · 다음
                    </button>
                  </>
                )}
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <div className={css.zeroReadings}>
                {JOINTS.map((j) => (
                  <span key={j} className={angles && Math.abs(angles[j - 1]) > 20 ? css.zeroFar : undefined}>
                    <i>J{j}</i>
                    {reading(j)}
                  </span>
                ))}
              </div>
              {angles && angles.some((a) => Math.abs(a) > 20) && <p className={css.zeroWarn}>20° 넘게 다른 관절: 표시선 확인</p>}
              <button
                type="button"
                className={css.btnPrimary}
                disabled={off || anyLimp || !angles}
                onClick={async () => {
                  if (!window.confirm('6축 모두 지금 자리를 0° 로 저장할까요?')) return;
                  if (await act(() => p.onCalibrate(JOINTS))) setSaved(JOINTS);
                }}
              >
                <Icon name="zero" size={14} /> 6축 0° 저장
              </button>
            </>
          )}

          {step === 4 && (
            <>
              <p className={css.zeroLead}>저장했어요 · 표시선이 다시 맞는지 확인</p>
              <div className={css.zeroStepBtns}>
                <button type="button" className={css.jogWide} disabled={off || anyLimp} onClick={() => void act(() => p.onPose('home'))}>
                  <Icon name="home" size={14} /> 기본 자세
                </button>
                <button type="button" className={css.jogWide} disabled={off || anyLimp} onClick={() => void act(() => p.onPose('zero'))}>
                  <Icon name="zero" size={14} /> 0° 자세
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {method === 'one' && (
        <div className={css.zeroFlow}>
          <button type="button" className={css.jogWide} disabled={off || anyLimp} onClick={() => void act(() => p.onPose('zero'))}>
            <Icon name="zero" size={14} /> 0° 자세로
          </button>
          <div className={css.zeroPick} role="group" aria-label="관절">
            {JOINTS.map((j) => (
              <button key={j} type="button" aria-pressed={joint === j} onClick={() => choose(j)}>
                J{j}
                {saved.includes(j) && <Icon name="check" size={11} />}
              </button>
            ))}
          </div>
          <div className={css.zeroJoint}>
            <span className={css.zeroJointNo}>J{joint}</span>
            <span>
              {JOINT_NAME[joint - 1]}
              {limp[joint - 1] && <small>풀림</small>}
            </span>
            <b className={css.zeroNow}>{reading(joint)}</b>
          </div>
          <div className={css.nudgeRow}>
            {[-2, -0.5, 0.5, 2].map((d) => (
              <button key={d} type="button" className={css.jogWide} disabled={off || limp[joint - 1]} onClick={() => void act(() => p.onNudge(joint, d))}>
                {d > 0 ? `+${d}°` : `${d}°`}
              </button>
            ))}
          </div>
          <div className={css.zeroStepBtns}>
            <button type="button" className={css.jogWide} disabled={off} onClick={() => void act(() => p.onJointServo(joint, !limp[joint - 1]))}>
              <Icon name="hand" size={14} /> {limp[joint - 1] ? `J${joint} 고정` : `J${joint} 풀기`}
            </button>
            <button
              type="button"
              className={css.btnPrimary}
              disabled={off}
              onClick={async () => {
                if (!window.confirm(`J${joint} 의 지금 자리를 0° 로 저장할까요?`)) return;
                if (await act(() => p.onCalibrate([joint]))) setSaved((s) => [...new Set([...s, joint])]);
              }}
            >
              <Icon name="zero" size={14} /> J{joint} 0° 저장
            </button>
          </div>
        </div>
      )}

      <div className={css.zeroNav}>
        <button type="button" className={css.jogWide} onClick={close}>
          닫기
        </button>
      </div>
    </div>
  );
}
