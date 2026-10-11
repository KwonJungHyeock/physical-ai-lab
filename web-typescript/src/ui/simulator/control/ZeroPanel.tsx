'use client';

/**
 * Zero calibration of the real robot, two ways.
 *
 * 한 번에 (일자 자세) — the quick way, for a first set-up: release every
 * servo, stand the arm straight up with both hands so all six pairs of zero
 * marks line up, lock the servos, and save all six joints at once.
 *
 * 관절별 정밀 — the precise way, to correct one joint: send the arm to its 0°
 * pose, and let the robot turn the joint in 0.5° / 2° steps until its two
 * marks meet exactly, then save that joint. No hand-holding needed; turning
 * by hand stays available for a joint that is far off.
 *
 * Saving is pymycobot set_servo_calibration (the servo is released for a
 * moment first, then locked again). The 3D view rings the joint being set.
 */

import { useState } from 'react';


import Icon from '../Icon';
import { useLive, type Live } from '../liveStore';
import css from '../console.module.css';

/** Where each joint's marks are, for someone standing in front of the robot. */
const JOINT_HINT = [
  '받침과 몸통 사이: 몸통 전체가 좌우로 도는 관절',
  '어깨: 팔 윗부분이 앞뒤로 기우는 관절',
  '팔꿈치: 팔 아랫부분이 앞뒤로 기우는 관절',
  '손목 첫 관절: 손목이 앞뒤로 기우는 관절',
  '손목 둘째 관절: 손목이 좌우로 도는 관절',
  '끝 원판(플랜지): 원판이 도는 관절',
];

type Method = 'all' | 'one';

interface Props {
  /** Live robot state (read here, so the rest of the console does not redraw 10 times a second). */
  live: Live;
  busy: boolean;
  onFocusJoint(joint: number | null): void;
  onPose(which: 'home' | 'zero'): Promise<void> | void;
  /** Every servo off (true) or on (false). */
  onServos(off: boolean): Promise<boolean>;
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
  const robot = useLive(p.live, (v) => v.robot);
  const off = p.busy || working || !robot?.connected;
  const angles = robot?.angles ?? null;
  const limp = robot?.limp ?? [];
  const anyLimp = limp.some(Boolean);

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
    p.onFocusJoint(m === 'one' ? joint : null);
  };
  const choose = (j: number) => {
    setJoint(j);
    p.onFocusJoint(j);
  };
  const close = () => {
    p.onFocusJoint(null);
    p.onClose();
  };

  return (
    <div className={css.zeroPanel}>
      <div className={css.zeroTabs} role="tablist" aria-label="영점 맞추는 방법">
        <button type="button" role="tab" aria-selected={method === 'all'} onClick={() => pick('all')}>
          <b>한 번에</b>
          <small>일자 자세로 6축</small>
        </button>
        <button type="button" role="tab" aria-selected={method === 'one'} onClick={() => pick('one')}>
          <b>관절별 정밀</b>
          <small>0.5° 씩 맞춤</small>
        </button>
      </div>

      {method === 'all' && (
        <ol className={css.zeroFlow}>
          <li>
            <p>
              팔을 한 손으로 받치고 서보를 모두 풀어요. <span className={css.zeroNote}>(로봇 전원을 끈 채 펴 두었다가 켜도 돼요. 그때는 이 단계를 건너뛰어요.)</span>
            </p>
            <button type="button" className={css.jogWide} disabled={off || limp.every(Boolean)} onClick={() => void act(() => p.onServos(true))}>
              <Icon name="hand" size={14} /> 모든 서보 풀기
            </button>
          </li>
          <li>
            <p>
              팔을 <b>위로 곧게</b> 세우고, 6개 관절마다 <b>두 표시선이 일직선</b>이 되게 맞춰요.
            </p>
          </li>
          <li>
            <p>맞춘 자세 그대로 서보를 고정해요. 팔이 그 자세로 멈춰요.</p>
            <button type="button" className={css.jogWide} disabled={off || !anyLimp} onClick={() => void act(() => p.onServos(false))}>
              서보 고정
            </button>
          </li>
          <li>
            <p>지금 읽은 각도가 “틀어진 만큼”이에요. 저장하면 모두 0° 가 돼요.</p>
            <div className={css.zeroReadings}>
              {Array.from({ length: 6 }, (_, i) => (
                <span key={i} className={angles && Math.abs(angles[i]) > 20 ? css.zeroFar : undefined}>
                  <i>J{i + 1}</i>
                  {angles ? `${angles[i].toFixed(1)}°` : '—'}
                </span>
              ))}
            </div>
            {angles && angles.some((a) => Math.abs(a) > 20) && (
              <p className={css.zeroWarn}>20° 넘게 차이 나는 관절이 있어요. 팔이 곧게 서 있고 표시선이 맞는지 다시 봐 주세요.</p>
            )}
            <button
              type="button"
              className={css.btnPrimary}
              disabled={off || anyLimp || !angles}
              onClick={async () => {
                if (!window.confirm('지금 자세를 6개 관절 모두의 0° 로 저장할까요?\n팔이 곧게 서 있고 표시선 6쌍이 모두 맞았을 때만 저장해 주세요.')) return;
                if (await act(() => p.onCalibrate([1, 2, 3, 4, 5, 6]))) setSaved([1, 2, 3, 4, 5, 6]);
              }}
            >
              <Icon name="zero" size={14} /> 6축 모두 0° 로 저장
            </button>
          </li>
          <li>
            <p>확인: 기본 자세로 보내 화면 속 팔과 같은 모양인지 봐요. 조금 다른 관절은 [관절별 정밀]로 다듬어요.</p>
            <button type="button" className={css.jogWide} disabled={off || anyLimp || !saved.length} onClick={() => void act(() => p.onPose('home'))}>
              <Icon name="home" size={14} /> 기본 자세로
            </button>
          </li>
        </ol>
      )}

      {method === 'one' && (
        <div className={css.zeroFlow}>
          <p>
            먼저 0° 자세(팔이 위로 곧게)로 보내고, 표시선이 어긋난 관절을 골라요.
          </p>
          <button type="button" className={css.jogWide} disabled={off || anyLimp} onClick={() => void act(() => p.onPose('zero'))}>
            <Icon name="zero" size={14} /> 0° 자세로 보내기
          </button>
          <div className={css.zeroPick} role="group" aria-label="관절">
            {[1, 2, 3, 4, 5, 6].map((j) => (
              <button key={j} type="button" aria-pressed={joint === j} onClick={() => choose(j)}>
                J{j}
                {saved.includes(j) && <Icon name="check" size={11} />}
              </button>
            ))}
          </div>
          <div className={css.zeroJoint}>
            <span className={css.zeroJointNo}>J{joint}</span>
            <span>
              {JOINT_HINT[joint - 1]}
              <small>
                지금 읽은 각도 <b>{angles ? `${angles[joint - 1].toFixed(1)}°` : '—'}</b>
                {limp[joint - 1] ? ' · 풀림' : ''}
              </small>
            </span>
          </div>
          <p className={css.zeroNote}>두 표시선이 딱 맞을 때까지 조금씩 돌려요.</p>
          <div className={css.nudgeRow}>
            {[-2, -0.5, 0.5, 2].map((d) => (
              <button key={d} type="button" className={css.jogWide} disabled={off || limp[joint - 1]} onClick={() => void act(() => p.onNudge(joint, d))}>
                {d > 0 ? `+${d}°` : `${d}°`}
              </button>
            ))}
          </div>
          <button
            type="button"
            className={css.btnPrimary}
            disabled={off}
            onClick={async () => {
              if (!window.confirm(`J${joint} 의 지금 위치를 0° 로 저장할까요?\n표시선이 맞았을 때만 저장해 주세요.`)) return;
              if (await act(() => p.onCalibrate([joint]))) setSaved((s) => [...new Set([...s, joint])]);
            }}
          >
            <Icon name="zero" size={14} /> J{joint} 여기를 0° 로 저장
          </button>
          <p className={css.zeroNote}>
            많이 틀어져 조금씩 돌리기 어렵다면{' '}
            <button type="button" className={css.linkBtn} disabled={off} onClick={() => void act(() => p.onJointServo(joint, !limp[joint - 1]))}>
              {limp[joint - 1] ? `J${joint} 다시 고정` : `J${joint} 만 풀어 손으로 돌리기`}
            </button>
          </p>
          <button type="button" className={css.jogWide} disabled={off || anyLimp || !saved.length} onClick={() => void act(() => p.onPose('home'))}>
            <Icon name="home" size={14} /> 기본 자세로 확인
          </button>
        </div>
      )}

      <div className={css.zeroNav}>
        <button type="button" className={css.btnPrimary} onClick={close}>
          <Icon name="check" size={14} /> 끝내기
        </button>
      </div>
    </div>
  );
}
