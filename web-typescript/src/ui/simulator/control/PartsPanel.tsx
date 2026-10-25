'use client';

/**
 * 도구 · 액세서리: the tool on the end (a large card for the one fitted, picture cards to change it),
 * then the two accessories — the camera flange and the base (G 베이스) the robot stands on.
 * The pictures are the simulator's own 3D models (tools/build/part-thumbs.mjs).
 */

import { EFFECTORS, type EffectorId } from '@/engine/simulator/effectors';

import css from '../console.module.css';

/** "도구 없음" first: taking the tool off is as common a choice as fitting one. */
const ORDER = [...EFFECTORS.filter((e) => e.kind === 'none'), ...EFFECTORS.filter((e) => e.kind !== 'none')];

/** What each kind of tool does, in a few words. */
const KIND: Record<string, string> = {
  grip: '집어서 옮기기',
  suction: '빨아들여 옮기기',
  pen: '그림 그리기',
  press: '버튼 누르기',
  hold: '휴대폰 거치',
  none: '끝 플랜지만 (도구를 뺀 상태)',
};

const pic = (id: string) => `/robot/parts/${id}.png`;

interface Props {
  effector: EffectorId;
  cameraFlange: boolean;
  busy: boolean;
  onTool(effector: EffectorId, cameraFlange: boolean): void;
  /** Tools the open arm can carry, and whether a camera flange is modelled for it. */
  tools?: readonly EffectorId[];
  flangeAvailable?: boolean;
  /** The G base fits this arm (Elephant Robotics' arms; not OMX-F). */
  mountAvailable?: boolean;
  /** The robot on a base (G base): its height above the table, mm. */
  mount: { on: boolean; mm: number };
  onMount(mount: { on: boolean; mm: number }): void;
}

const MOUNT_MIN = 5;
const MOUNT_MAX = 300;

export default function PartsPanel({ effector, cameraFlange, busy, onTool, mount, onMount, tools, flangeAvailable = true, mountAvailable = true }: Props) {
  const list = ORDER.filter((e) => !tools || tools.includes(e.id));
  const now = list.find((e) => e.id === effector) ?? ORDER[0];
  const height = (mm: number) => onMount({ ...mount, mm: Math.max(MOUNT_MIN, Math.min(MOUNT_MAX, Math.round(mm))) });
  return (
    <section className={css.parts} aria-label="도구 · 액세서리">
      <div className={css.toolHero}>
        {/* eslint-disable-next-line @next/next/no-img-element -- fixed pictures, also in the static export */}
        <img src={pic(now.id)} alt="" />
        <span>
          <small>지금 달린 도구</small>
          <b>{now.name}</b>
          <em>
            {KIND[now.kind] ?? ''}
            {now.official && now.kind !== 'none' ? ' · 공식 구성품' : ''}
          </em>
        </span>
      </div>

      <h4 className={css.partsHead}>도구 바꾸기</h4>
      <div className={css.toolCards} role="group" aria-label="엔드이펙터">
        {list.map((e) => (
          <button
            key={e.id}
            type="button"
            className={css.toolCard}
            aria-pressed={effector === e.id}
            disabled={busy}
            title={e.kind === 'none' ? '도구를 달지 않은 상태 (끝 플랜지만)' : `${e.name}: ${KIND[e.kind] ?? ''}${e.official ? ' (공식 구성품)' : ''}`}
            onClick={() => onTool(e.id, cameraFlange)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- fixed pictures, also in the static export */}
            <img src={pic(e.id)} alt="" />
            <span>{e.name}</span>
          </button>
        ))}
      </div>

      <h4 className={css.partsHead}>액세서리</h4>
      <div className={css.accCards}>
        {flangeAvailable && (
          <label className={css.accCard} data-on={cameraFlange || undefined}>
            {/* eslint-disable-next-line @next/next/no-img-element -- fixed pictures, also in the static export */}
            <img src={pic('flange')} alt="" />
            <span className={css.accText}>
              <b>카메라 플랜지</b>
              <small>{cameraFlange ? '손 카메라를 쓸 수 있어요' : '손 카메라를 쓰려면 켜요'}</small>
            </span>
            <input type="checkbox" role="switch" checked={cameraFlange} disabled={busy} onChange={(e) => onTool(effector, e.target.checked)} aria-label="카메라 플랜지 달기" />
          </label>
        )}
        {mountAvailable && (
          <div className={css.accCard} data-on={mount.on || undefined}>
            {/* eslint-disable-next-line @next/next/no-img-element -- fixed pictures, also in the static export */}
            <img src={pic('gbase')} alt="" />
            <span className={css.accText}>
              <b>받침대 (G 베이스)</b>
              <small>{mount.on ? '책상에서 로봇 바닥까지' : '로봇이 책상 바로 위에 있어요'}</small>
            </span>
            <input type="checkbox" role="switch" checked={mount.on} disabled={busy} onChange={(e) => onMount({ ...mount, on: e.target.checked })} aria-label="받침대 (G 베이스) 달기" />
            {mount.on && (
              <span className={css.stepper} role="group" aria-label="받침대 높이">
                <button type="button" disabled={busy || mount.mm <= MOUNT_MIN} onClick={() => height(mount.mm - 5)} aria-label="5mm 낮게">
                  −
                </button>
                <input
                  type="number"
                  min={MOUNT_MIN}
                  max={MOUNT_MAX}
                  step={1}
                  value={mount.mm}
                  disabled={busy}
                  aria-label="받침대 높이 (mm)"
                  onChange={(e) => {
                    const mm = Math.round(Number(e.target.value));
                    if (mm >= MOUNT_MIN && mm <= MOUNT_MAX) onMount({ ...mount, mm });
                  }}
                />
                <i>mm</i>
                <button type="button" disabled={busy || mount.mm >= MOUNT_MAX} onClick={() => height(mount.mm + 5)} aria-label="5mm 높게">
                  +
                </button>
              </span>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
