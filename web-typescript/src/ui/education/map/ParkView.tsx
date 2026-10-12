'use client';

/**
 * 교육 홈 · 로봇 시티: the course as one island city (engine/education/park.ts). One screen: a bar
 * with the 로드맵 (the nine places in learning order: number, done / 지금 여기 / locked), 로봇 실습 7,
 * 전체 차시, 마무리 평가 and the teacher's 모든 현장 열기; the city in 3D (world/WorldScene) with a
 * column of 기술 키워드 buttons over it (인공지능, 데이터 사이언스, …), and one card on the right.
 *
 * Every way of picking a place (the place on the map, its pin, its 키워드, its 로드맵 stop) opens the
 * same thing: that place's card, with the camera on it. There is no second "overview" card: until a
 * place is picked the card is the place to go next (지금 여기), so each piece of content has one way in.
 * The card holds the place's social problem, its robots, its 차시 or three problems (each with the 차시 to
 * learn first) and the way in. Theory and practice take turns (park.ts nextStep): the row to do next
 * is marked 다음 할 일, and the card's main button opens it.
 */

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';

import { CATEGORIES, TOPIC_BY_ID, type TopicId } from '@/engine/education/catalog';
import {
  SITES,
  SITE_BY_ID,
  THEMES,
  centerTopics,
  currentSite,
  currentUnit,
  nextStep,
  problemMissing,
  siteScore,
  siteStates,
  unitTopics,
  type LabId,
  type NextStep,
  type ParkProgress,
  type ProblemNo,
  type SiteId,
} from '@/engine/education/park';

import Icon from '../../simulator/Icon';
import MyResult from './MyResult';
import css from './park.module.css';
import type { SiteView } from './world/WorldScene';

const WorldScene = dynamic(() => import('./world/WorldScene'), { ssr: false });

/** The card's width (px): the camera keeps the park in the space left of it. */
const CARD_PX = 380;

const unitName = (id: string) => CATEGORIES.find((c) => c.id === id)?.title ?? '';
const topicName = (t: TopicId) => `${t} ${TOPIC_BY_ID.get(t)?.title ?? ''}`;
/** "1-2 · 1-3 차시를 배우면 열려요". */
const needLine = (ts: readonly TopicId[]) => `${ts.join(' · ')} 차시를 배우면 열려요`;

declare global {
  interface Window {
    /** Pick a site on the map, or none (guide pictures, tools/check). */
    __parkSelect?: (id: SiteId | null) => void;
  }
}

interface Props {
  progress: ParkProgress;
  /** 모든 현장 열기 (the teacher's switch): every site and problem open. */
  allOpen: boolean;
  /** The switch changed; none for a student in class mode (the switch is hidden). */
  onAllOpen?(on: boolean): void;
  hidden?: boolean;
  /** Open a 차시 (the 교육센터's lessons). */
  onTopic(id: TopicId): void;
  /** Open a site's problem-solving lab (at a problem). */
  onLab(lab: LabId, prob?: ProblemNo): void;
  /** The whole course: every 단원 and 차시. */
  onCourse(): void;
  /** 대단원 마무리 평가 (opens once all seven theme labs are done, or with 모든 현장 열기). */
  onFinal(): void;
  /** The 디지털 트윈 관제센터. */
  onData(): void;
  /** 로봇 실습 7: the seven acceptance checks as easy practices (the first thing a beginner does). */
  onPractice?(): void;
  /** Pick a place from outside (a lesson's 이 원리를 쓰는 현장); `n` changes on every request. */
  pick?: { id: SiteId; n: number } | null;
}

const tagOf = (content: (typeof SITES)[number]['content']) => (content === 'lessons' ? '이론' : content === 'data' ? '데이터' : '테마');

export default function ParkView({ progress, allOpen, onAllOpen, hidden, onTopic, onLab, onCourse, onFinal, onData, onPractice, pick }: Props) {
  const [selected, setSelected] = useState<SiteId | null>(null);
  /** The 3D park loads the first time the map is shown. */
  const [seen, setSeen] = useState(false);
  const [ready, setReady] = useState(false);
  const onReady = useCallback(() => setReady(true), []);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => void (!hidden && setSeen(true)), [hidden]);
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
  const step = useMemo(() => nextStep(progress), [progress]);
  // The place on show: the one picked, else the place to go next.
  const shown: SiteId = selected ?? next;
  const views = useMemo(() => {
    const out = {} as Record<SiteId, SiteView>;
    SITES.forEach((s) => {
      const st = states[s.id];
      const sc = siteScore(s.id, progress);
      const first = s.content === 'lab' ? problemMissing(s, 1, progress) : [];
      const line = st === 'done' ? '완료' : st === 'locked' ? (first.length ? `${first.join('·')} 차시 후 열림` : '현장이 열리면 함께 열림') : sc && sc.done > 0 ? `${s.kind} · ${sc.done}/${sc.of}` : s.kind;
      out[s.id] = { state: st, next: s.id === next && st === 'open', tag: tagOf(s.content), line };
    });
    return out;
  }, [states, progress, next]);
  // The 종합 점검 draws one item from every theme lab.
  const finalOpen = allOpen || THEMES.every((s) => states[s.id] === 'done');
  const solved = THEMES.reduce((n, s) => n + (siteScore(s.id, progress)?.done ?? 0), 0);
  // A click on empty map (null) keeps the card: there is always one place on show.
  const select = useCallback((id: SiteId | null) => id && setSelected(id), []);

  return (
    <div className={css.park} hidden={hidden}>
      <header className={css.bar}>
        <b className={css.title}>
          로봇 시티
          <small>이론은 아카데미에서, 현장의 문제는 각 구역에서 풀어요</small>
        </b>
        <ol className={css.route} aria-label="로드맵: 배우는 순서">
          {SITES.map((s, i) => {
            const st = states[s.id];
            const here = s.id === next && st === 'open';
            return (
              <li key={s.id} data-st={st} data-here={here || undefined} style={{ '--c': s.color } as CSSProperties}>
                <button type="button" aria-current={shown === s.id || undefined} onClick={() => select(s.id)} title={`${i + 1}. ${s.name} · ${s.kind}`}>
                  <i>{st === 'done' ? '✓' : st === 'locked' ? <Icon name="lock" size={12} /> : i + 1}</i>
                  <span>
                    <b>{s.short}</b>
                    <small>{st === 'done' ? '완료' : here ? '지금 여기' : st === 'locked' ? '잠김' : '열림'}</small>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
        <div className={css.tools}>
          {onPractice && (
            <button type="button" className={css.p7} onClick={onPractice} title="검수 7가지를 쉬운 실습으로: 시뮬레이션 → 실물 로봇">
              로봇 실습 7
            </button>
          )}
          <button type="button" className={css.line} onClick={onCourse} title="8단원 28차시 이론 수업 목록">
            전체 차시
          </button>
          <button type="button" className={css.line} disabled={!finalOpen} onClick={onFinal} title={finalOpen ? '대단원 마무리 평가: 일곱 현장의 문제를 새 숫자로 다시 풀어요' : '현장 7곳(공장 · 물류 · 바이오 · 팜 · 시티 · AI · 자원순환)을 마치면 열려요'}>
            {finalOpen ? '마무리 평가' : '🔒 마무리 평가'}
          </button>
          {onAllOpen && (
            <label className={css.teacher} title="교사용: 먼저 배울 차시를 마치지 않아도 모든 현장과 문제를 열어요">
              <input type="checkbox" checked={allOpen} onChange={(e) => onAllOpen(e.target.checked)} />
              모든 현장 열기
            </label>
          )}
        </div>
      </header>
      <section className={css.stage} aria-label="로봇 시티 3D 지도">
        {seen && <WorldScene onReady={onReady} views={views} selected={shown} onSelect={select} paused={!!hidden} cardPx={CARD_PX} />}
        {!ready && (
          <p className={css.loading} role="status">
            로봇 시티를 불러오는 중…
          </p>
        )}
        <nav className={css.keys} aria-label="기술 키워드로 찾기">
          <span className={css.keysHead}>기술 키워드</span>
          {SITES.map((s) => (
            <button
              key={s.id}
              type="button"
              data-st={states[s.id]}
              aria-pressed={shown === s.id}
              style={{ '--c': s.color } as CSSProperties}
              onClick={() => select(s.id)}
              title={`${s.keyword} · ${s.name}${states[s.id] === 'locked' ? ' (잠김: 누르면 먼저 배울 차시가 보여요)' : ''}`}
            >
              <i>
                <Icon name={s.icon} size={18} />
              </i>
              <span>
                <b>{s.keyword}</b>
                <small>{s.name}</small>
              </span>
            </button>
          ))}
        </nav>
        <aside className={css.card} style={{ width: CARD_PX }} aria-label={`${SITE_BY_ID.get(shown)!.name} 안내`}>
          <SiteCard key={shown} id={shown} progress={progress} allOpen={allOpen} state={states[shown]} step={step} onTopic={onTopic} onLab={onLab} onData={onData} />
          <MyResult theory={siteScore('center', progress)!.done} solved={solved} />
        </aside>
      </section>
    </div>
  );
}

interface CardProps {
  id: SiteId;
  progress: ParkProgress;
  allOpen: boolean;
  state: 'done' | 'open' | 'locked';
  /** The course's next step: its row in this card is marked 다음 할 일. */
  step: NextStep;
  onTopic(id: TopicId): void;
  onLab(lab: LabId, prob?: ProblemNo): void;
  onData(): void;
}

function SiteCard({ id, progress, allOpen, state, step, onTopic, onLab, onData }: CardProps) {
  const s = SITE_BY_ID.get(id)!;
  const sc = siteScore(id, progress);
  const locked = state === 'locked';
  const unit = currentUnit(progress);
  const rows =
    s.content === 'lessons'
      ? unitTopics(progress).map((t) => ({ key: t, title: topicName(t), fix: TOPIC_BY_ID.get(t)!.question, needs: [] as readonly TopicId[], missing: [] as readonly TopicId[], done: !!progress.done[t], open: () => onTopic(t) }))
      : s.problems.map((p, k) => {
          const no = (k + 1) as ProblemNo;
          const missing = allOpen ? [] : problemMissing(s, no, progress);
          return {
            key: String(k),
            fix: missing.length ? `🔒 ${needLine(missing)}` : p.fix,
            needs: p.needs,
            missing,
            title: `${no}. ${p.title}${s.content === 'lab' && !p.ready ? ' · 준비 중' : ''}`,
            done: s.content === 'lab' && !!progress.solved[s.lab!]?.[no],
            open: s.content === 'lab' && p.ready && !missing.length ? () => onLab(s.lab!, no) : null,
          };
        });
  const firstTodo = s.content === 'lessons' ? (centerTopics().find((t) => !progress.done[t]) ?? centerTopics()[0]) : null;
  const firstNeeds = s.content === 'lab' ? problemMissing(s, 1, progress) : [];
  const started = !!sc && sc.done > 0;
  // 현장 들어가기 opens the first problem still to solve (the one the list and 다음 할 일 point at), so
  // entering from here, from a problem's row or from 다음 할 일 lands on the same screen.
  const entry = ((rows.findIndex((r) => r.open && !r.done) + 1 || 1) as ProblemNo);
  // The course's next step, when it is in this place: its row says so.
  const nextKey = step.kind === 'topic' && s.content === 'lessons' ? step.topic : step.kind === 'lab' && step.site === id ? String(step.prob - 1) : null;
  return (
    <div className={css.site} style={{ '--c': locked ? '#8a94a6' : s.color } as CSSProperties} data-state={state}>
      <header>
        <span className={css.kind}>
          {tagOf(s.content)} · {s.kind}
        </span>
      </header>
      {/* Everything above the action scrolls together; the action stays below it, never over the text. */}
      <div className={css.siteBody}>
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
          <>🔒 {firstNeeds.length ? `아카데미에서 ${needLine(firstNeeds)}` : '첫 현장이 열리면 함께 열려요'}</>
        ) : s.content === 'lessons' ? (
          <>
            28차시 중 {sc!.done}차시 완료 · 지금 {unit}단원 {unitName(unit)}
          </>
        ) : s.content === 'data' ? (
          <>모든 현장의 실습 기록이 여기로 모여요</>
        ) : !sc ? (
          <>준비 중이에요. 이 현장의 문제는 곧 열려요</>
        ) : state === 'done' ? (
          <>✓ 완료 · {sc.of}개 모두 해결</>
        ) : (
          <>
            진행 {sc.done} / {sc.of}
          </>
        )}
      </div>
      {s.content !== 'data' && <h3>{s.content === 'lessons' ? `${unit}단원 ${unitName(unit)}의 차시` : '이 현장의 문제 (차시를 누르면 그 이론으로 가요)'}</h3>}
      {s.content === 'data' ? (
        <ul className={css.dataList}>
          <li>현장별 성공률 · 작업 시간 비교, 병목 찾기</li>
          <li>바꾼 값과 결과의 관계: 산점도와 회귀선</li>
          <li>시뮬레이션 ↔ 실제 로봇 오차 (디지털 트윈)</li>
        </ul>
      ) : (
        <ol className={css.probs}>
          {rows.map((r) => (
            <li key={r.key} data-done={r.done || undefined} data-next={r.key === nextKey || undefined}>
              <button type="button" disabled={locked || !r.open} onClick={r.open ?? undefined}>
                {r.key === nextKey && <em className={css.nextTag}>다음 할 일</em>}
                <b>
                  {r.done && <i aria-label="완료">✓</i>}
                  {r.title}
                </b>
                {r.fix && <span>{r.fix}</span>}
              </button>
              {r.needs.length > 0 && (
                <span className={css.tags}>
                  {r.needs.map((t) => (
                    <button key={t} type="button" data-missing={r.missing.includes(t) || undefined} onClick={() => onTopic(t)} title={`${topicName(t)}: 이론 차시 열기`}>
                      {r.missing.includes(t) ? '먼저 ' : '배운 '}
                      {topicName(t)} →
                    </button>
                  ))}
                </span>
              )}
            </li>
          ))}
        </ol>
      )}
      </div>
      <div className={css.actions}>
        {locked ? (
          <button type="button" className={css.primary} disabled>
            🔒 잠겨 있어요
          </button>
        ) : s.content === 'lessons' ? (
          <button type="button" className={css.primary} onClick={() => onTopic(firstTodo!)}>
            {state === 'done' ? '수업 다시 보기' : started ? `이어 하기 · ${topicName(firstTodo!)}` : '첫 차시 시작'} →
          </button>
        ) : s.content === 'lab' ? (
          <button type="button" className={css.primary} onClick={() => onLab(s.lab!, entry)}>
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
