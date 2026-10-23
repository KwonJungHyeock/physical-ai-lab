'use client';

/**
 * The status under the four lights (StatusLights): the same four — 시뮬레이션 · 로봇 연결 · 실행 중 ·
 * 오류, in their order and colours, from the same values — each with a line of what it means now (the
 * error's reason when it is lit); with a real robot connected, its servos; then the robot's own keys
 * (connection check, hand guiding, zero calibration). The joint angles are in the jog list and the
 * tool tip on the 3D view, so they are not repeated here.
 */

import Icon from '../Icon';
import { useLive, type Live } from '../liveStore';
import { ITEMS, type Lights } from './StatusLights';
import css from '../console.module.css';

interface Props {
  robotMode: boolean;
  /** Live angles and robot state (the real arm's on the robot, the simulated arm's otherwise). */
  live: Live;
  /** The four lights, as the row above shows them. */
  lights: Lights;
  /** Why the 오류 light is on: the stop or notice on screen, or the robot connection. */
  reason: string;
  busy: boolean;
  onWiggle(): void;
  onServos(): void;
  onZero(): void;
}

export function calibratedText(c: Record<string, number> | undefined): string {
  const entries = Object.entries(c ?? {});
  if (!entries.length) return '영점 맞춘 기록 없음';
  const last = Math.max(...entries.map(([, t]) => t));
  const d = new Date(last * 1000);
  const when = `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const joints = entries.filter(([, t]) => last - t < 600).map(([j]) => `J${j}`).join('·');
  return `마지막 영점 ${when} (${joints})`;
}

export default function RobotStatus({ robotMode, live: store, lights, reason, busy, onWiggle, onServos, onZero }: Props) {
  const robot = useLive(store, (v) => v.robot);
  const live = robotMode && !!robot?.connected && robot.age !== null && robot.age < 2;
  const text: Record<keyof Lights, string> = {
    sim: lights.sim ? '켜짐 (화면 속 로봇으로 해요)' : '꺼짐 (실제 로봇과 함께 움직여요)',
    robot: lights.robot ? `${robot?.demo ? '데모 ' : ''}로봇 ${robot?.robotId ?? ''} 연결됨` : '안 됨 ([로봇 연결] 로 붙일 수 있어요)',
    running: lights.running ? '움직이는 중' : '쉬는 중',
    error: lights.error ? reason : '없음',
  };
  return (
    <div className={css.robotStatus}>
      <ul className={css.statusRows} role="status">
        {ITEMS.map((it) => (
          <li key={it.key} className={css.statusRow} data-on={lights[it.key] || undefined} data-tone={it.tone}>
            <i />
            <b>{it.name}</b>
            <span>{text[it.key]}</span>
          </li>
        ))}
        {lights.robot && (
          <li className={css.statusRow} data-on data-tone={robot?.released ? 'warn' : 'servo'}>
            <i />
            <b>서보</b>
            <span>{robot?.released ? '풀림 (손으로 움직일 수 있어요)' : '켜짐 (팔이 자세를 지켜요)'}</span>
          </li>
        )}
      </ul>

      {robotMode && (
        <>
          <div className={`${css.robotBtns} ${css.robotBtnsBig}`}>
            <button type="button" className={css.jogWide} disabled={busy || !live || !!robot?.released} onClick={onWiggle} title="로봇 몸통(J1)이 10° 돌았다가 돌아와요">
              <Icon name="link" size={16} />
              <span>연결 확인</span>
            </button>
            <button type="button" className={css.jogWide} disabled={busy || !live} onClick={onServos}>
              <Icon name="hand" size={16} />
              <span>{robot?.released ? '서보 고정' : '손으로 움직이기'}</span>
            </button>
            <button type="button" className={css.jogWide} disabled={busy || !live} onClick={onZero}>
              <Icon name="zero" size={16} />
              <span>영점 맞추기</span>
            </button>
          </div>
          <p className={css.robotCal}>{calibratedText(robot?.calibrated)}</p>
        </>
      )}
    </div>
  );
}
