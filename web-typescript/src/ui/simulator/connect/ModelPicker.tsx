'use client';

/**
 * Which robot: one card per product line, all the same size — a large picture of the product, its
 * name and one line about it, the board (or product) chosen in a fixed form (a segmented control for
 * two or three short choices, a list for more) and one [시작] button. Models still being built are in
 * the form but cannot be chosen.
 */

import { useState } from 'react';

import { MODELS, type RobotModel, type RobotModelId } from '@/engine/robot/catalog';

import css from '../console.module.css';

const STATUS: Record<RobotModel['status'], string> = {
  ready: '사용 가능',
  next: '다음 순서',
  planned: '준비 중',
};

/** One card per product line: its picture (a render of the official 3D model) and one line about it. */
const LINES: { line: string; img: string; text: string; title?: string }[] = [
  { line: 'myCobot 280', img: '/robot/thumbs/mycobot280-rdkx5.png', text: '6축 협동 로봇팔 · 가반 250g · 반경 280mm' },
  { line: 'myCobot 320', img: '/robot/thumbs/mycobot320.png', text: '6축 · 가반 1kg · 반경 350mm — 더 크고 힘센 팔' },
  { line: 'mechArm 270', img: '/robot/thumbs/mecharm270.png', text: '6축 · 중심 대칭형 산업용 구조 · 반경 270mm' },
  { line: '4축 로봇팔', img: '/robot/thumbs/mypalletizer260.png', text: '평행 링크로 손끝이 늘 아래를 보는 4축 팔 (myPalletizer 260 · ultraArm P340)' },
  { line: '이동 로봇', img: '/robot/thumbs/myagv.png', text: '조이스틱 · 키보드 주행, 앞 카메라, 라이다, 직진 보정', title: 'myAGV' },
];

function LineCard({ line, models, current, onPick }: { line: (typeof LINES)[number]; models: RobotModel[]; current: RobotModelId | null; onPick(id: RobotModelId): void }) {
  const ready = models.filter((m) => m.status === 'ready');
  const [sel, setSel] = useState<RobotModelId>(models.find((m) => m.id === current)?.id ?? ready[0]?.id ?? models[0].id);
  const chosen = models.find((m) => m.id === sel) ?? models[0];
  // A line with several products (4축 로봇팔): each choice says which one.
  const several = new Set(models.map((m) => m.name)).size > 1;
  const label = (m: RobotModel) => (several ? `${m.name}${m.board ? ` · ${m.board}` : ''}` : m.board);
  const segmented = models.length <= 3 && models.every((m) => label(m).length <= 13);
  const agv = chosen.kind === 'agv';
  return (
    <li className={css.lineCard} data-ready={ready.length > 0 || undefined} data-current={models.some((m) => m.id === current) || undefined}>
      <span className={css.lineImg}>
        {/* eslint-disable-next-line @next/next/no-img-element -- static render, also in the robot's static export */}
        <img src={line.img} alt="" width={240} height={192} />
      </span>
      <span className={css.lineText}>
        <b>
          {line.title ?? line.line}
          {chosen.link !== 'sim' && chosen.kind === 'arm' && <em>실물 연결</em>}
        </b>
        <small>{line.text}</small>
      </span>
      <span className={css.lineBoards}>
        <small>{agv ? '모델' : several ? '제품 · 보드' : '보드'}</small>
        {models.length === 1 ? (
          <span className={css.lineOne}>{label(chosen)}</span>
        ) : segmented ? (
          <span className={css.lineSeg} role="radiogroup" aria-label={`${line.line} 보드`}>
            {models.map((m) => (
              <button key={m.id} type="button" role="radio" aria-checked={m.id === sel} disabled={m.status !== 'ready'} title={m.summary} onClick={() => setSel(m.id)}>
                {label(m)}
              </button>
            ))}
          </span>
        ) : (
          <select className={css.lineSelect} value={sel} aria-label={`${line.line} ${several ? '제품 · 보드' : '보드'}`} onChange={(e) => setSel(e.target.value as RobotModelId)}>
            {models.map((m) => (
              <option key={m.id} value={m.id} disabled={m.status !== 'ready'}>
                {label(m)}
                {m.status !== 'ready' ? ` (${STATUS[m.status]})` : m.link !== 'sim' && m.kind === 'arm' ? ' — 실물 연결' : ''}
              </option>
            ))}
          </select>
        )}
      </span>
      <button type="button" className={css.lineStart} disabled={chosen.status !== 'ready'} aria-current={current === chosen.id ? 'true' : undefined} aria-label={`${chosen.name} ${chosen.board} 시작`} title={chosen.summary} onClick={() => onPick(chosen.id)}>
        {agv ? '주행 시작' : current === chosen.id ? '이 모델로 계속' : '시작'}
        <span aria-hidden="true">→</span>
      </button>
    </li>
  );
}

export default function ModelPicker({ current, onPick, onClose }: { current: RobotModelId | null; onPick(id: RobotModelId): void; onClose?(): void }) {
  const lines = (
    <ul className={css.lineGrid}>
      {LINES.map((l) => (
        <LineCard key={l.line} line={l} models={MODELS.filter((m) => m.line === l.line)} current={current} onPick={onPick} />
      ))}
    </ul>
  );
  return (
    <div className={css.picker} role="dialog" aria-modal="true" aria-label="로봇 모델 고르기">
      <div className={`${css.pickerBox} ${css.modelBox}`}>
        <header className={css.pickerHead}>
          {/* eslint-disable-next-line @next/next/no-img-element -- fixed logo, also in the robot's static export */}
          <img src="/brand/robodyne-logo-ink.png" alt="ROBODYNE SYSTEMS" width={116} height={31} />
          <div>
            <h1>로봇 모델을 골라 주세요</h1>
            <p>제품의 보드를 고르고 [시작] 을 누르면 그 로봇팔의 3D 모델 · 관절 범위 · 실습이 열려요. 윗줄 설정의 [로봇 모델 바꾸기] 로 언제든 바꿀 수 있어요.</p>
          </div>
          {onClose && (
            <button type="button" className={css.pickerClose} onClick={onClose} aria-label="닫기">
              ×
            </button>
          )}
        </header>
        {lines}
      </div>
    </div>
  );
}
