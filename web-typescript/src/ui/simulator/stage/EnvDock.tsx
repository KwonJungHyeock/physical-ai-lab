'use client';

/**
 * 실습 환경 dock at the bottom of the 3D view: the environments as small pictures (one click puts the
 * arm in that place; ▶ 데모 on each shows the arm doing that place's job), the practice mat and the
 * physics engine as switches, and [물건 놓기]. The full panel (환경 · 물건 · 물리) opens above it.
 */

import type { ReactNode } from 'react';

import { SCENES, type SceneId } from '@/engine/simulator/desk';

import css from '../console.module.css';

const THUMB: Partial<Record<SceneId, string>> = { lab: '/sim/scenes/lab.jpg', factory: '/sim/scenes/factory.jpg', logistics: '/sim/scenes/logistics.jpg', home: '/sim/scenes/home.jpg' };
/** Short names for the dock (the panel has the full ones). */
const SHORT: Record<SceneId, string> = { empty: '빈 화면', lab: 'AI 실험실', factory: '제조 라인', logistics: '물류', home: '서비스 · 생활', kit: 'AI 키트' };

/** ▶ 데모 on a 실습 환경's picture: the arm doing that place's job (off when this arm has no demo there). */
export function DemoPill({ name, ok, busy, onClick, className }: { name: string; ok: boolean; busy: boolean; onClick(): void; className: string }) {
  return (
    <button
      type="button"
      className={className}
      disabled={busy || !ok}
      onClick={onClick}
      aria-label={`${name} 데모 보기`}
      title={ok ? `${name}: 로봇팔이 하는 일을 4단계로 보여 줘요` : '이 로봇팔에 맞춘 데모는 아직 없어요'}
    >
      ▶ 데모
    </button>
  );
}

interface Props {
  scene: SceneId;
  kitAvailable: boolean;
  /** This arm has a ▶ 데모 for the place. */
  demoOk(id: SceneId): boolean;
  onDemo(id: SceneId): void;
  busy: boolean;
  /** The mat switch (on and fixed when the practice needs it); not shown in the AI kit. */
  mat: { on: boolean; locked: boolean } | null;
  physics: boolean | null;
  open: boolean;
  onScene(id: SceneId): void;
  onMat(on: boolean): void;
  onPhysics(on: boolean): void;
  /** Open the panel on a tab ('scene' from the label, 'objects' from [물건 놓기]); again to close. */
  onOpen(tab: 'scene' | 'objects'): void;
  /** The panel, when open. */
  children?: ReactNode;
}

export default function EnvDock({ scene, kitAvailable, demoOk, onDemo, busy, mat, physics, open, onScene, onMat, onPhysics, onOpen, children }: Props) {
  return (
    <div className={css.envDock} data-panel="envdock">
      {children}
      <button type="button" className={css.envLabel} aria-expanded={open} onClick={() => onOpen('scene')} title="실습 환경 자세히 — 환경 · 물건 · 물리">
        <b>실습 환경</b>
        <small>{open ? '닫기 ▾' : '자세히 ▴'}</small>
      </button>
      <span className={css.envList} role="group" aria-label="실습 환경 고르기">
        {SCENES.filter((s) => s.id !== 'kit' || kitAvailable).map((s) => (
          <span key={s.id} className={css.envItem}>
            <button type="button" className={css.envChip} aria-pressed={scene === s.id} disabled={busy} onClick={() => onScene(s.id)} title={`${s.name} — ${s.note}`}>
              <i data-scene={s.id} style={THUMB[s.id] ? { backgroundImage: `url(${THUMB[s.id]})` } : undefined}>
                {s.id === 'kit' && 'AI 키트'}
              </i>
              <span>{SHORT[s.id]}</span>
            </button>
            <DemoPill name={s.name} ok={demoOk(s.id)} busy={busy} onClick={() => onDemo(s.id)} className={css.envDemo} />
          </span>
        ))}
      </span>
      {(mat || physics !== null) && <span className={css.envSep} />}
      {mat && (
        <label className={css.envSwitch} title={mat.locked ? '이 실습은 매트와 블록을 써요' : '책상에 실습 매트와 블록 4개 놓기'}>
          <input type="checkbox" role="switch" checked={mat.on} disabled={busy || mat.locked} onChange={(e) => onMat(e.target.checked)} />
          <span>매트</span>
        </label>
      )}
      {physics !== null && (
        <label className={css.envSwitch} title="물리 엔진: 켜면 물건이 떨어지고 미끄러지고, 팔에 밀려요">
          <input type="checkbox" role="switch" checked={physics} disabled={busy} onChange={(e) => onPhysics(e.target.checked)} />
          <span>물리</span>
        </label>
      )}
      {scene !== 'kit' && (
        <button type="button" className={css.envAdd} disabled={busy} onClick={() => onOpen('objects')}>
          ＋ 물건 놓기
        </button>
      )}
    </div>
  );
}
