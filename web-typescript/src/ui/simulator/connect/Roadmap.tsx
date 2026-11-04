'use client';

/**
 * 학습 로드맵 (입문 트랙 ① 생활 로봇): what this simulator teaches, at a glance, from the intro's
 * [ROADMAP]. Four stops on one path, left to right — 기초 조작, then the places where cobots work in
 * everyday life — each a picture, what is done there, the robot ideas it teaches (chips), and how
 * far along this browser is. A lit node and a line join them (the glowing-checkpoint timelines of
 * course apps); a stop still to come is shown, dimmed. Pressing a stop opens it in the simulator.
 */

import { useEffect, type CSSProperties } from 'react';

import type { CellId } from '@/engine/simulator/cell/cells';
import { missionsOf } from '@/engine/simulator/cell/missions';
import { LIFE_TUTORIALS } from '@/engine/simulator/lifeTutorials';

import css from './roadmap.module.css';

export type RoadmapPick = { kind: 'tutorial' } | { kind: 'site'; cell: CellId };

/**
 * 학습 카테고리: the five fields the stops teach, each a colour (the stops' badges carry them). 피지컬 AI
 * is '기초' here: 입문 has no camera or AI decision, only the robot reading its sensors and acting.
 */
type Cat = 'control' | 'auto' | 'safety' | 'twin' | 'pai';
const CATS: Record<Cat, { name: string; en: string; color: string; what: string }> = {
  control: { name: '로봇 제어', en: 'CONTROL', color: '#e4eaf2', what: '관절 · 좌표로 움직이고 자세 · 위치를 가르쳐요' },
  auto: { name: '자동화 순서', en: 'AUTOMATION', color: '#60a5fa', what: '작업 순서를 짜고 장비 신호에 맞춰 움직여요' },
  safety: { name: '협동로봇 안전', en: 'SAFETY', color: '#fb923c', what: '사람이 있을 때 멈추고 기다리는 규칙을 익혀요' },
  twin: { name: '디지털 트윈', en: 'DIGITAL TWIN', color: '#34d399', what: '가상 현장에서 확인한 프로그램을 실제 로봇에 그대로 써요' },
  pai: { name: '피지컬 AI 기초', en: 'PHYSICAL AI', color: '#c084fc', what: '로봇이 센서로 상황을 읽고 판단해 몸으로 움직이는 원리' },
};

interface Stop {
  cats: Cat[];
  key: string;
  phase: string;
  title: string;
  img: string;
  does: string;
  learns: string[];
  pick?: RoadmapPick;
  /** Steps in it, for the count and the progress. */
  steps: string[];
}

const STOPS: Stop[] = [
  {
    key: 'basics',
    phase: 'BASICS',
    title: '기초 조작',
    img: '/brand/life/basics.webp',
    does: '팔을 움직이고 자세를 저장하고 위치를 가르쳐요',
    learns: ['관절 · 좌표', '티칭', '공정'],
    cats: ['control', 'twin'],
    pick: { kind: 'tutorial' },
    steps: LIFE_TUTORIALS.map((t) => t.id),
  },
  {
    key: 'cafe',
    phase: 'SITE 01',
    title: '로봇 카페',
    img: '/brand/life/cafe.webp',
    does: '컵을 받아 얼음 · 샷 · 물을 넣고 손님에게 건네요',
    learns: ['작업 순서', '센서 신호', '인터록', '안전문'],
    cats: ['auto', 'safety', 'pai', 'twin'],
    pick: { kind: 'site', cell: 'cafe' },
    steps: missionsOf('cafe').map((m) => m.id),
  },
  {
    key: 'draw',
    phase: 'SITE 02',
    title: '로봇 캘리그라피',
    img: '/brand/life/draw.webp',
    does: '손님의 메시지 카드에 펜으로 글씨를 써 줘요',
    learns: ['접촉 보정', '좌표계', '직선 이동', '펜 들기'],
    cats: ['control', 'safety', 'twin'],
    pick: { kind: 'site', cell: 'draw' },
    steps: missionsOf('draw').map((m) => m.id),
  },
  { key: 'board', phase: 'SITE 03', title: '보드게임 로봇', img: '/brand/life/boardgame.webp', does: '사람과 번갈아 오목을 둬요', learns: ['격자 좌표', '차례 기다리기', '손 감지'], cats: ['pai', 'safety', 'control'], steps: [] },
];

interface Props {
  /** Steps passed (by id) and tutorials finished (by id). */
  passed: Readonly<Record<string, boolean>>;
  tutorialsDone: Readonly<Record<string, boolean>>;
  onPick(p: RoadmapPick): void;
  onClose(): void;
}

export default function Roadmap({ passed, tutorialsDone, onPick, onClose }: Props) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);
  const doneOf = (s: Stop) => s.steps.filter((id) => (s.key === 'basics' ? tutorialsDone[id] : passed[id])).length;
  // The stop to do next: the first one not finished.
  const next = STOPS.findIndex((s) => s.pick && doneOf(s) < s.steps.length);
  const total = STOPS.reduce((n, s) => n + s.steps.length, 0);
  const done = STOPS.reduce((n, s) => n + doneOf(s), 0);
  return (
    <div className={css.roadmap} role="dialog" aria-label="학습 로드맵">
      <header className={css.head}>
        <span>
          <em>LEARNING ROADMAP</em>
          <h2>이 시뮬레이터로 배우는 것</h2>
          <p>생활 속 협동로봇 현장을 하나씩 돌며, 로봇이 일하는 원리를 직접 움직여 익혀요.</p>
        </span>
        <span className={css.total}>
          <b>
            {done}
            <small>/{total}</small>
          </b>
          <small>단계 완료</small>
        </span>
        <button type="button" className={css.close} onClick={onClose} aria-label="닫기">
          ×
        </button>
      </header>

      {/* What the whole course covers: five fields, each lit on the stops that teach it. */}
      <ul className={css.cats} aria-label="학습 카테고리">
        {(Object.keys(CATS) as Cat[]).map((k) => (
          <li key={k} style={{ '--c': CATS[k].color } as CSSProperties}>
            <em>{CATS[k].en}</em>
            <b>{CATS[k].name}</b>
            <small>{CATS[k].what}</small>
          </li>
        ))}
      </ul>

      <ol className={css.path}>
        {STOPS.map((s, i) => {
          const d = doneOf(s);
          const complete = s.steps.length > 0 && d >= s.steps.length;
          return (
            <li key={s.key} className={css.stop} data-next={i === next || undefined} data-done={complete || undefined} data-soon={!s.pick || undefined}>
              <span className={css.node} aria-hidden="true">
                <i>{complete ? '✓' : String(i + 1).padStart(2, '0')}</i>
              </span>
              <button type="button" className={css.card} disabled={!s.pick} onClick={() => s.pick && onPick(s.pick)}>
                <span className={css.pic}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- the roadmap's pictures, also in the static export */}
                  <img src={s.img} alt="" />
                  <em>{s.phase}</em>
                  <span className={css.catDots}>
                    {s.cats.map((c) => (
                      <i key={c} style={{ '--c': CATS[c].color } as CSSProperties}>
                        {CATS[c].name}
                      </i>
                    ))}
                  </span>
                  {i === next && <span className={css.badge}>여기부터</span>}
                  {!s.pick && (
                    <span className={css.badge} data-soon>
                      준비 중
                    </span>
                  )}
                </span>
                <span className={css.body}>
                  <b>{s.title}</b>
                  <small>{s.does}</small>
                  <span className={css.chips}>
                    {s.learns.map((l) => (
                      <i key={l}>{l}</i>
                    ))}
                  </span>
                  {s.steps.length > 0 && (
                    <span className={css.prog}>
                      <span className={css.bar}>
                        <span style={{ width: `${(100 * d) / s.steps.length}%` }} />
                      </span>
                      <small>
                        {d}/{s.steps.length} {s.key === 'basics' ? '튜토리얼' : '단계'}
                      </small>
                    </span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      <footer className={css.foot}>
        <small>코드는 쓰지 않아요 · 카드로 순서를 짜고 ▶ 시뮬레이션으로 확인해요 · 모든 단계는 예측 → 관찰 → 개념 순서예요</small>
      </footer>
    </div>
  );
}
