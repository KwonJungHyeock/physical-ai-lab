'use client';

/**
 * 교육 홈 · 로봇 시티: the course as one island city (engine/education/park.ts). One screen: a slim
 * bar (the nine places, 전체 차시, the teacher's 모든 현장 열기), the city in 3D (world/WorldScene),
 * and a card on the right — the city at a glance, or the picked place: its social problem, the robots
 * of that field, its three problems (each with the 학문 it teaches, a link into that 학문's 차시) and
 * the way in. The 로봇 아카데미 is open from the start; the rest open once its 1학문 is finished.
 */

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';

import { CATEGORIES, TOPIC_BY_ID, type TopicId } from '@/engine/education/catalog';
import { SITES, SITE_BY_ID, THEMES, centerTopics, currentSite, siteScore, siteStates, type LabId, type ParkProgress, type SiteId, type SiteState } from '@/engine/education/park';
import { topicsOf, type CategoryId } from '@/engine/education/catalog';

import css from './park.module.css';
import type { SiteView } from './world/WorldScene';

const WorldScene = dynamic(() => import('./world/WorldScene'), { ssr: false });

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
  progress: ParkProgress;
  hidden?: boolean;
  /** Open a 차시 (the 교육센터's lessons). */
  onTopic(id: TopicId): void;
  /** Open a site's problem-solving lab. */
  onLab(lab: LabId): void;
  /** The whole course: every 단원 and 차시. */
  onCourse(): void;
  /** 대단원 마무리 평가 (opens once the first six theme labs are done, or with 모든 현장 열기). */
  onFinal(): void;
  /** The 디지털 트윈 관제센터. */
  onData(): void;
  /** Pick a place from outside (a lesson's 이 원리를 쓰는 현장); `n` changes on every request. */
  pick?: { id: SiteId; n: number } | null;
}

/** The labs the 종합 점검 draws on (the first six; 에너지·자원순환 came later). */
const FINAL_LABS = THEMES.filter((s) => s.lab !== 'energy');

const tagOf = (content: (typeof SITES)[number]['content']) => (content === 'lessons' ? '이론' : content === 'data' ? '데이터' : '테마');

export default function ParkView({ progress, hidden, onTopic, onLab, onCourse, onFinal, onData, pick }: Props) {
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

  // eslint-disable-next-line react-hooks/set-state-in-effect -- a pick from outside opens that place's card
  useEffect(() => void (pick && setSelected(pick.id)), [pick]);

  const states = useMemo(() => siteStates(progress, allOpen), [progress, allOpen]);
  const next = useMemo(() => currentSite(progress), [progress]);
  const views = useMemo(() => {
    const out = {} as Record<SiteId, SiteView>;
    SITES.forEach((s) => {
      const st = states[s.id];
      const sc = siteScore(s.id, progress);
      const line = st === 'done' ? '완료' : st === 'locked' ? '아카데미 1학문 후 열림' : sc && sc.done > 0 ? `${s.kind} · ${sc.done}/${sc.of}` : s.kind;
      out[s.id] = { state: st, next: s.id === next && st === 'open', tag: tagOf(s.content), line };
    });
    return out;
  }, [states, progress, next]);
  const nDone = SITES.filter((s) => states[s.id] === 'done').length;
  const nAll = SITES.filter((s) => s.content !== 'data').length;
  const finalOpen = allOpen || FINAL_LABS.every((s) => states[s.id] === 'done');
  const select = useCallback((id: SiteId | null) => setSelected(id), []);

  return (
    <div className={css.park} hidden={hidden}>
      <header className={css.bar}>
        <b className={css.title}>
          로봇 시티
          <small>이론은 아카데미에서, 현장의 문제는 각 구역에서 풀어요</small>
        </b>
        <ol className={css.route} aria-label="도시의 구역">
          {SITES.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                data-st={states[s.id]}
                aria-current={selected === s.id || undefined}
                style={{ '--c': s.color } as CSSProperties}
                onClick={() => select(s.id)}
                title={`${s.name} · ${s.kind}`}
              >
                <i>{states[s.id] === 'done' ? '✓' : tagOf(s.content).slice(0, 1)}</i>
                <span>{s.name}</span>
              </button>
            </li>
          ))}
        </ol>
        <div className={css.tools}>
          <button type="button" className={css.line} onClick={onCourse} title="8단원 28차시 이론 수업 목록">
            전체 차시
          </button>
          <label className={css.teacher} title="교사용: 아카데미 1학문을 마치지 않아도 모든 구역을 열어요">
            <input type="checkbox" checked={allOpen} onChange={(e) => setAllOpen(e.target.checked)} />
            모든 현장 열기
          </label>
        </div>
      </header>
      <section className={css.stage} aria-label="로봇 시티 3D 지도">
        {seen && <WorldScene onReady={onReady} views={views} selected={selected} onSelect={select} paused={!!hidden} cardPx={CARD_PX} />}
        {!ready && (
          <p className={css.loading} role="status">
            로봇 시티를 불러오는 중…
          </p>
        )}
        <aside className={css.card} style={{ width: CARD_PX }} aria-label={selected ? `${SITE_BY_ID.get(selected)!.name} 안내` : '로봇 시티 안내'}>
          {selected ? (
            <SiteCard id={selected} progress={progress} state={states[selected]} onTopic={onTopic} onLab={onLab} onData={onData} onClose={() => select(null)} />
          ) : (
            <Overview states={states} nDone={nDone} nAll={nAll} next={next} onGo={select} finalOpen={finalOpen} onFinal={onFinal} />
          )}
        </aside>
      </section>
    </div>
  );
}

function Overview({ states, nDone, nAll, next, onGo, finalOpen, onFinal }: { states: Record<SiteId, SiteState>; nDone: number; nAll: number; next: SiteId; onGo(id: SiteId): void; finalOpen: boolean; onFinal(): void }) {
  const n = SITE_BY_ID.get(next)!;
  const counted = SITES.filter((s) => s.content !== 'data');
  return (
    <div className={css.over}>
      <h2>로봇이 일하는 도시에서 배워요</h2>
      <p>
        가운데 <b>로봇 아카데미</b>에서 로봇공학 8학문 28차시를 배우고, 둘레의 <b>현장</b>에서 사회 문제를 로봇으로 풀어요. <b>관제센터</b>에서는 모든 현장의 실습
        기록을 데이터로 분석해요.
      </p>
      <div className={css.meter} role="progressbar" aria-label="완료한 구역" aria-valuenow={nDone} aria-valuemin={0} aria-valuemax={nAll}>
        <b>
          {nDone} / {nAll}
        </b>
        <span>구역 완료</span>
        <div>
          {counted.map((s) => (
            <i key={s.id} data-on={states[s.id] === 'done' || undefined} style={{ '--c': s.color } as CSSProperties} title={s.name} />
          ))}
        </div>
      </div>
      {nDone < nAll && (
        <button type="button" className={css.go} style={{ '--c': n.color } as CSSProperties} onClick={() => onGo(next)}>
          <small>다음으로 갈 곳</small>
          <b>{n.name}</b>
          <span>→</span>
        </button>
      )}
      <button type="button" className={css.go} style={{ '--c': SITE_BY_ID.get('data')!.color } as CSSProperties} onClick={() => onGo('data')}>
        <small>실습 기록 분석 · 디지털 트윈</small>
        <b>관제센터</b>
        <span>→</span>
      </button>
      <button type="button" className={css.go} data-final disabled={!finalOpen} style={{ '--c': '#1d2939' } as CSSProperties} onClick={onFinal} title={finalOpen ? '여섯 현장의 문제를 새 숫자로 다시 풀어요' : '현장 6곳을 모두 마치면 열려요'}>
        <small>{finalOpen ? '현장 종합 점검' : '🔒 현장 6곳(공장·물류·바이오·팜·시티·AI)을 마치면 열려요'}</small>
        <b>대단원 마무리 평가</b>
        <span>→</span>
      </button>
      <ul className={css.legend}>
        <li>
          <i data-k="done">✓</i> 완료
        </li>
        <li>
          <i data-k="open">●</i> 들어갈 수 있음
        </li>
        <li>
          <i data-k="locked">🔒</i> 아카데미 1학문을 마치면 열려요
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
  onData(): void;
  onClose(): void;
}

/** A 학문's first 차시: where a problem's 학문 tag leads. */
const unitStart = (u: CategoryId) => topicsOf(u)[0]?.id;

function SiteCard({ id, progress, state, onTopic, onLab, onData, onClose }: CardProps) {
  const s = SITE_BY_ID.get(id)!;
  const sc = siteScore(id, progress);
  const locked = state === 'locked';
  const rows =
    s.content === 'lessons'
      ? centerTopics().map((t) => ({ key: t, title: `${t} ${TOPIC_BY_ID.get(t)!.title}`, fix: TOPIC_BY_ID.get(t)!.question, units: [] as CategoryId[], done: !!progress.done[t], open: () => onTopic(t) }))
      : s.problems.map((p, k) => ({
          key: String(k),
          fix: p.fix,
          units: p.units as CategoryId[],
          title: `${k + 1}. ${p.title}${s.content === 'lab' && !p.ready ? ' · 준비 중' : ''}`,
          done: s.content === 'lab' && !!progress.solved[s.lab!]?.[(k + 1) as 1 | 2 | 3],
          open: s.content === 'lab' && p.ready ? () => onLab(s.lab!) : null,
        }));
  const firstTodo = s.content === 'lessons' ? (centerTopics().find((t) => !progress.done[t]) ?? centerTopics()[0]) : null;
  const started = !!sc && sc.done > 0;
  return (
    <div className={css.site} style={{ '--c': locked ? '#8a94a6' : s.color } as CSSProperties} data-state={state}>
      <header>
        <span className={css.kind}>
          {tagOf(s.content)} · {s.kind}
        </span>
        <button type="button" className={css.x} onClick={onClose} aria-label="닫기">
          ×
        </button>
      </header>
      <h2>{s.name}</h2>
      <p className={css.desc}>{s.desc}</p>
      {s.issue && (
        <p className={css.issue}>
          <b>사회 문제</b>
          {s.issue}
        </p>
      )}
      <div className={css.crew} aria-label="이 현장의 로봇">
        {s.crew.map((c, i) => (
          <span key={c} data-main={i === 0 || undefined} title={i === 0 ? '실습에 쓰는 로봇' : '이 분야에서 함께 일하는 로봇'}>
            {c}
          </span>
        ))}
      </div>
      <div className={css.status}>
        {locked ? (
          <>🔒 로봇 아카데미 1학문(기초 로봇공학)을 마치면 열려요</>
        ) : s.content === 'data' ? (
          <>모든 현장의 실습 기록이 여기로 모여요</>
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
      {s.content !== 'data' && <h3>{s.content === 'lessons' ? '기초 수업 (1학문)' : '이 현장의 문제 — 학문을 누르면 그 이론 차시로 가요'}</h3>}
      {s.content === 'data' ? (
        <ul className={css.dataList}>
          <li>현장별 성공률 · 작업 시간 비교, 병목 찾기</li>
          <li>바꾼 값과 결과의 관계 — 산점도와 회귀선</li>
          <li>시뮬레이션 ↔ 실제 로봇 오차 (디지털 트윈)</li>
        </ul>
      ) : (
        <ol className={css.probs}>
          {rows.map((r) => (
            <li key={r.key} data-done={r.done || undefined}>
              <button type="button" disabled={locked || !r.open} onClick={r.open ?? undefined}>
                <b>
                  {r.done && <i aria-label="완료">✓</i>}
                  {r.title}
                </b>
                {r.fix && <span>{r.fix}</span>}
              </button>
              {r.units.length > 0 && (
                <span className={css.tags}>
                  {r.units.map((u) => (
                    <button key={u} type="button" onClick={() => unitStart(u) && onTopic(unitStart(u)!)} title={`${u}학문 ${unitName(u)} — 이론 차시 열기`}>
                      {u}학문 {unitName(u)} →
                    </button>
                  ))}
                </span>
              )}
            </li>
          ))}
        </ol>
      )}
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
        ) : s.content === 'data' ? (
          <button type="button" className={css.primary} onClick={onData}>
            관제센터 들어가기 →
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
