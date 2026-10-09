'use client';

/**
 * 교육 홈 · 로봇 산업단지: the course as an industrial park to walk through (engine/education/park.ts).
 * One screen: a slim bar (the seven sites as a route, 전체 차시, the teacher's 모든 현장 열기), the park
 * in 3D (ParkScene), and a card on the right — the park at a glance, or the picked site with its
 * three problems and the way in. A site opens when the one before it is finished.
 */

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';

import { CATEGORIES, TOPIC_BY_ID, type TopicId } from '@/engine/education/catalog';
import { josa } from '@/engine/education/lab/run';
import { SITES, SITE_BY_ID, centerTopics, currentSite, siteScore, siteStates, type LabId, type ParkProgress, type SiteId } from '@/engine/education/park';
import type { ChainSegment } from '@/engine/robot/kinematics';
import type { UrdfRobot } from '@/engine/robot/urdf';

import type { SiteView } from './ParkScene';
import css from './park.module.css';

const ParkScene = dynamic(() => import('./ParkScene'), { ssr: false });

const ALL_OPEN_KEY = 'park-all-open';
/** The card's width (px): the camera keeps the park in the space left of it. */
const CARD_PX = 380;

const unitName = (id: string) => CATEGORIES.find((c) => c.id === id)?.title ?? '';

declare global {
  interface Window {
    /** Pick a site on the map, or none (guide pictures, tools/check). */
    __parkSelect?: (id: SiteId | null) => void;
  }
}

interface Props {
  robot: UrdfRobot;
  chain: readonly ChainSegment[];
  progress: ParkProgress;
  hidden?: boolean;
  /** Open a 차시 (the 교육센터's lessons). */
  onTopic(id: TopicId): void;
  /** Open a site's problem-solving lab. */
  onLab(lab: LabId): void;
  /** The whole course: every 단원 and 차시. */
  onCourse(): void;
  /** 대단원 마무리 평가 (opens once the six lab sites are done, or with 모든 현장 열기). */
  onFinal(): void;
}

export default function ParkView({ robot, chain, progress, hidden, onTopic, onLab, onCourse, onFinal }: Props) {
  const [selected, setSelected] = useState<SiteId | null>(null);
  const [allOpen, setAllOpenRaw] = useState(false);
  /** The 3D park loads the first time the map is shown. */
  const [seen, setSeen] = useState(false);
  const [ready, setReady] = useState(false);
  const onReady = useCallback(() => setReady(true), []);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => void (!hidden && setSeen(true)), [hidden]);
  useEffect(() => {
    try {
      // Read after hydration (the page is a static export).
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAllOpenRaw(localStorage.getItem(ALL_OPEN_KEY) === '1');
    } catch {
      /* private window */
    }
  }, []);
  const setAllOpen = (on: boolean) => {
    setAllOpenRaw(on);
    try {
      localStorage.setItem(ALL_OPEN_KEY, on ? '1' : '0');
    } catch {
      /* private window: not remembered */
    }
  };
  useEffect(() => {
    window.__parkSelect = setSelected;
    return () => {
      delete window.__parkSelect;
    };
  }, []);

  const states = useMemo(() => siteStates(progress, allOpen), [progress, allOpen]);
  const next = useMemo(() => currentSite(progress), [progress]);
  const views = useMemo(() => {
    const out = {} as Record<SiteId, SiteView>;
    SITES.forEach((s, i) => {
      const st = states[s.id];
      const sc = siteScore(s.id, progress);
      const line =
        st === 'done'
          ? '완료'
          : st === 'locked'
            ? `${i}단계 완료 후 열림`
            : !sc
              ? `${s.kind} · 준비 중`
              : sc.done > 0
                ? `${s.kind} · ${sc.done}/${sc.of}`
                : s.kind;
      out[s.id] = { state: st, next: s.id === next && st === 'open', no: i + 1, line };
    });
    return out;
  }, [states, progress, next]);
  const nDone = SITES.filter((s) => states[s.id] === 'done').length;
  const finalOpen = allOpen || SITES.filter((s) => s.content === 'lab').every((s) => states[s.id] === 'done');
  const select = useCallback((id: SiteId | null) => setSelected(id), []);

  return (
    <div className={css.park} hidden={hidden}>
      <header className={css.bar}>
        <b className={css.title}>
          로봇 산업단지
          <small>현장을 골라 들어가 문제를 해결해요</small>
        </b>
        <ol className={css.route} aria-label="현장 순서">
          {SITES.map((s, i) => (
            <li key={s.id}>
              <button
                type="button"
                data-st={states[s.id]}
                aria-current={selected === s.id || undefined}
                style={{ '--c': s.color } as CSSProperties}
                onClick={() => select(s.id)}
                title={`${i + 1}. ${s.name}`}
              >
                <i>{states[s.id] === 'done' ? '✓' : i + 1}</i>
                <span>{s.name}</span>
              </button>
            </li>
          ))}
        </ol>
        <div className={css.tools}>
          <button type="button" className={css.line} onClick={onCourse} title="8단원 28차시 이론 수업 목록">
            전체 차시
          </button>
          <label className={css.teacher} title="교사용: 앞 현장을 마치지 않아도 모든 현장을 열어요">
            <input type="checkbox" checked={allOpen} onChange={(e) => setAllOpen(e.target.checked)} />
            모든 현장 열기
          </label>
        </div>
      </header>
      <section className={css.stage} aria-label="로봇 산업단지 3D 지도">
        {seen && <ParkScene robot={robot} chain={chain} onReady={onReady} views={views} selected={selected} onSelect={select} paused={!!hidden} cardPx={CARD_PX} />}
        {!ready && (
          <p className={css.loading} role="status">
            산업단지를 불러오는 중…
          </p>
        )}
        <aside className={css.card} style={{ width: CARD_PX }} aria-label={selected ? `${SITE_BY_ID.get(selected)!.name} 안내` : '산업단지 안내'}>
          {selected ? (
            <SiteCard id={selected} progress={progress} state={states[selected]} onTopic={onTopic} onLab={onLab} onClose={() => select(null)} />
          ) : (
            <Overview nDone={nDone} next={next} onGo={select} finalOpen={finalOpen} onFinal={onFinal} />
          )}
        </aside>
      </section>
    </div>
  );
}

function Overview({ nDone, next, onGo, finalOpen, onFinal }: { nDone: number; next: SiteId; onGo(id: SiteId): void; finalOpen: boolean; onFinal(): void }) {
  const n = SITE_BY_ID.get(next)!;
  return (
    <div className={css.over}>
      <h2>산업 현장에서 배우는 로봇</h2>
      <p>현장마다 로봇이 일하다 문제가 생겨요. 값을 바꿔 고치면서 원리를 익혀요. 이론은 단원별 PDF로 봐요.</p>
      <div className={css.meter} role="progressbar" aria-label="완료한 현장" aria-valuenow={nDone} aria-valuemin={0} aria-valuemax={SITES.length}>
        <b>
          {nDone} / {SITES.length}
        </b>
        <span>현장 완료</span>
        <div>
          {SITES.map((s, i) => (
            <i key={s.id} data-on={i < nDone || undefined} style={{ '--c': s.color } as CSSProperties} />
          ))}
        </div>
      </div>
      {nDone < SITES.length && (
        <button type="button" className={css.go} style={{ '--c': n.color } as CSSProperties} onClick={() => onGo(next)}>
          <small>다음 현장</small>
          <b>{n.name}</b>
          <span>→</span>
        </button>
      )}
      <button type="button" className={css.go} data-final disabled={!finalOpen} style={{ '--c': '#1d2939' } as CSSProperties} onClick={onFinal} title={finalOpen ? '여섯 현장의 문제를 새 숫자로 다시 풀어요' : '현장 6곳을 모두 마치면 열려요'}>
        <small>{finalOpen ? '산업단지 종합 점검' : '🔒 현장 6곳을 모두 마치면 열려요'}</small>
        <b>대단원 마무리 평가</b>
        <span>→</span>
      </button>
      <ul className={css.legend}>
        <li>
          <i data-k="done">✓</i> 완료한 현장
        </li>
        <li>
          <i data-k="open">●</i> 들어갈 수 있는 현장
        </li>
        <li>
          <i data-k="locked">🔒</i> 앞 현장을 마치면 열려요
        </li>
      </ul>
    </div>
  );
}

interface CardProps {
  id: SiteId;
  progress: ParkProgress;
  state: 'done' | 'open' | 'locked';
  onTopic(id: TopicId): void;
  onLab(lab: LabId): void;
  onClose(): void;
}

function SiteCard({ id, progress, state, onTopic, onLab, onClose }: CardProps) {
  const s = SITE_BY_ID.get(id)!;
  const i = SITES.findIndex((x) => x.id === id);
  const prev = i > 0 ? SITES[i - 1] : null;
  const sc = siteScore(id, progress);
  const locked = state === 'locked';
  const rows =
    s.content === 'lessons'
      ? centerTopics().map((t) => ({ key: t, title: `${t} ${TOPIC_BY_ID.get(t)!.title}`, fix: TOPIC_BY_ID.get(t)!.question, units: ['1'], done: !!progress.done[t], open: () => onTopic(t) }))
      : s.problems.map((p, k) => ({
          key: String(k),
          fix: p.fix,
          units: p.units,
          title: `${k + 1}. ${p.title}${s.content === 'lab' && !p.ready ? ' · 준비 중' : ''}`,
          done: s.content === 'lab' && !!progress.solved[s.lab!]?.[(k + 1) as 1 | 2 | 3],
          open: s.content === 'lab' && p.ready ? () => onLab(s.lab!) : null,
        }));
  const firstTodo = s.content === 'lessons' ? centerTopics().find((t) => !progress.done[t]) ?? centerTopics()[0] : null;
  const started = !!sc && sc.done > 0;
  return (
    <div className={css.site} style={{ '--c': locked ? '#8a94a6' : s.color } as CSSProperties} data-state={state}>
      <header>
        <span className={css.kind}>
          {i + 1} · {s.kind}
        </span>
        <button type="button" className={css.x} onClick={onClose} aria-label="닫기">
          ×
        </button>
      </header>
      <h2>{s.name}</h2>
      <p className={css.robot}>{s.robot}</p>
      <p className={css.desc}>{s.desc}</p>
      <div className={css.status}>
        {locked ? (
          <>🔒 {prev ? josa(prev.name, '을') : ''} 마치면 열려요</>
        ) : !sc ? (
          <>준비 중 — 이 현장의 문제는 곧 열려요</>
        ) : state === 'done' ? (
          <>✓ 완료 · {sc.of}개 모두 해결</>
        ) : (
          <>
            진행 {sc.done} / {sc.of}
          </>
        )}
      </div>
      <h3>{s.content === 'lessons' ? '기초 수업 (1단원)' : '이 현장의 문제'}</h3>
      <ol className={css.probs}>
        {rows.map((r) => (
          <li key={r.key} data-done={r.done || undefined}>
            <button type="button" disabled={locked || !r.open} onClick={r.open ?? undefined}>
              <b>
                {r.done && <i aria-label="완료">✓</i>}
                {r.title}
              </b>
              {r.fix && <span>{r.fix}</span>}
              <span className={css.tags}>
                {r.units.map((u) => (
                  <em key={u}>
                    {u}단원 {unitName(u)}
                  </em>
                ))}
              </span>
            </button>
          </li>
        ))}
      </ol>
      <div className={css.actions}>
        {locked ? (
          <button type="button" className={css.primary} disabled>
            🔒 잠겨 있어요
          </button>
        ) : s.content === 'lessons' ? (
          <button type="button" className={css.primary} onClick={() => onTopic(firstTodo!)}>
            {state === 'done' ? '기초 수업 다시 보기' : started ? '기초 수업 이어 하기' : '기초 수업 시작'} →
          </button>
        ) : s.content === 'lab' ? (
          <button type="button" className={css.primary} onClick={() => onLab(s.lab!)}>
            {state === 'done' ? '현장 다시 들어가기' : started ? '이어서 고치기' : '현장 들어가기'} →
          </button>
        ) : (
          <button type="button" className={css.primary} disabled>
            준비 중
          </button>
        )}
      </div>
    </div>
  );
}
