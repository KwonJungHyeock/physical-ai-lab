'use client';

/**
 * The 교육 tab's home, one page read from top to bottom: a hero band (the course's goal, [이어서
 * 수업하기], [장비 선택하기], the progress ring and the 8-2 goal picture), the roadmap figure
 * (roadmap/Roadmap), then the 8 단원 as cards in the three 대단원 (Ⅰ 구조와 움직임 1–3 · Ⅱ 힘과
 * 제어 4–5 · Ⅲ 지능형 로봇 6–8), each card with its 3D picture and its 차시 marked 실물 · 일부 ·
 * 시뮬레이터 for the school's equipment (roadmap/Gear). A card opens the 단원 on the right (its
 * 차시 with their figures, the equipment it uses, the PDFs) and only [n-m 수업 시작] leaves for
 * the lesson.
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react';

import { CATEGORIES, TOPIC_BY_ID, TOPICS, topicsOf, type CategoryId, type TopicId } from '@/engine/education/catalog';
import { MATERIALS } from '@/engine/education/materials';
import { figureStill, unitPicture } from '@/engine/education/media';
import {
  CAPABILITY,
  DEFAULT_OWNED,
  GOAL,
  LEVEL_VIEW,
  PARTS,
  PRODUCTS,
  UNIT_WHAT,
  partOf,
  realProducts,
  subjectComplete,
  subjectDone,
  topicCover,
  type Done,
  type ProductId,
  type StudyLevel,
  type TopicCover,
} from '@/engine/education/roadmap';
import { noWrongIds, questionById, questionLabel, recordAnswer, subscribeWrong, wrongIds } from '@/engine/education/wrong';
import type { Question } from '@/engine/education/questions';

import { PAGE_LABEL, type PageId, type ResumeSpot } from '../lesson/LessonCards';
import { QuestionItem, answerOf } from '../lesson/QuickCheck';
import { Rich } from '../lesson/Rich';
import GearModal, { Counts, HOW_NAME, coverCounts } from './Gear';
import Roadmap from './Roadmap';
import css from './course.module.css';

const FLOW = ['도입', '개념', '활동 1', '활동 2', '활동 3', '정리', '평가'];

interface Props {
  hidden?: boolean;
  done: Done;
  owned: readonly ProductId[];
  onOwned(p: readonly ProductId[]): void;
  level: StudyLevel;
  onLevel(l: StudyLevel): void;
  resume: ResumeSpot | null;
  /** Start a lesson (leaves the home). */
  onStart(t: TopicId, page?: PageId): void;
  /** Back to the 로봇 산업단지 (the 교육 home). */
  onLab(): void;
}

const sameSet = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x) => b.includes(x));
const hwOf = (owned: readonly ProductId[]) => PRODUCTS.filter((p) => p.id !== 'sim' && owned.includes(p.id));

export default function Course({ hidden, done, owned, onOwned, level, onLevel, resume, onStart, onLab }: Props) {
  const cover = useMemo(() => topicCover(owned), [owned]);
  const nDone = TOPICS.filter((t) => done[t.id]).length;
  const [unit, setUnit] = useState<CategoryId | null>(null);
  const [picking, setPicking] = useState(false);
  /** Counts the [맞춤 커리큘럼 만들기] presses: the cards gather and the roadmap plays again. */
  const [made, setMade] = useState(0);
  const [toast, setToast] = useState(false);
  const home = useRef<HTMLElement>(null);
  const fit = useRef<HTMLDivElement>(null);

  // Where the class is: the lesson last open, else the first one not done.
  const here = resume?.topic ?? TOPICS.find((t) => !done[t.id])?.id ?? TOPICS[0].id;
  const hereCat = TOPIC_BY_ID.get(here)!.cat;
  const nowCat = !subjectComplete(hereCat, done) ? hereCat : (TOPICS.find((t) => !done[t.id])?.cat ?? null);
  const hereTopic = TOPIC_BY_ID.get(here)!;
  const gear = hwOf(owned);
  const showFit = made > 0 || !sameSet(owned, DEFAULT_OWNED);

  /** Go to a 단원's card and make it flash (a roadmap station was clicked). */
  const toCard = (c: CategoryId) => {
    const el = home.current?.querySelector<HTMLElement>(`[data-unit="${c}"]`);
    if (!el) return;
    el.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
    el.classList.remove(css.flash);
    void el.offsetWidth;
    el.classList.add(css.flash);
  };

  // [맞춤 커리큘럼 만들기]: the cards fly in from scattered spots to their places (FLIP), in turn,
  // the 단원 with no real practice last.
  useLayoutEffect(() => {
    if (!made || !home.current) return;
    const root = home.current;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const cards = [...root.querySelectorAll<HTMLElement>('[data-unit]')];
    const box = root.getBoundingClientRect();
    const view = Math.min(box.height, root.parentElement?.clientHeight ?? box.height);
    for (const el of cards) {
      const r = el.getBoundingClientRect();
      const tx = reduce ? 0 : box.left + box.width / 2 - (r.left + r.width / 2) + (Math.random() - 0.5) * 500;
      const ty = reduce ? 0 : box.top + Math.min(260, view / 2) - (r.top + r.height / 2) + (Math.random() - 0.5) * 200;
      el.style.transition = 'none';
      el.style.transform = `translate(${tx}px, ${ty}px) rotate(${reduce ? 0 : (Math.random() - 0.5) * 24}deg) scale(0.7)`;
      el.style.opacity = '0';
    }
    // Two frames later (the scattered spots drawn first), let them go.
    let raf = requestAnimationFrame(() => {
      raf = requestAnimationFrame(() => {
        cards.forEach((el, i) => {
          el.style.transition = '';
          el.classList.add(css.fly);
          el.style.transitionDelay = `${i * 70 + (el.dataset.dim ? 300 : 0)}ms`;
          el.style.transform = '';
          el.style.opacity = '';
        });
      });
    });
    const timer = window.setTimeout(() => {
      for (const el of cards) {
        el.classList.remove(css.fly);
        el.style.transitionDelay = '';
      }
    }, 2000);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(timer);
      for (const el of cards) {
        el.classList.remove(css.fly);
        el.style.cssText = '';
      }
    };
  }, [made]);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(false), 2200);
    return () => window.clearTimeout(id);
  }, [toast]);

  const make = (p: readonly ProductId[]) => {
    setPicking(false);
    onOwned(p);
    setMade((n) => n + 1);
    setToast(true);
    requestAnimationFrame(() => fit.current?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'nearest' }));
  };

  return (
    <div className={css.course} hidden={hidden}>
      <section className={css.home} ref={home} aria-label="교육 홈">
        <Hero
          {...{ level, onLevel, nDone }}
          gear={gear.map((p) => p.name)}
          resume={resume}
          here={hereTopic.id}
          onResume={() => onStart(here, resume?.topic === here ? resume.page : 'intro')}
          onGear={() => setPicking(true)}
          onGoal={() => setUnit('8')}
          onLab={onLab}
        />

        {showFit && (
          <div className={css.fitbar} ref={fit} aria-live="polite">
            <div className={css.devs}>
              {gear.length ? (
                gear.map((p) =>
                  p.img ? (
                    // eslint-disable-next-line @next/next/no-img-element -- a render of the official model, also in the static export
                    <img key={p.id} src={p.img} alt={p.name} title={p.name} />
                  ) : (
                    <span key={p.id} className={css.devMono} title={p.name}>
                      {p.chip}
                    </span>
                  ),
                )
              ) : (
                <span className={css.pill} data-how="sim">
                  PC 시뮬레이터
                </span>
              )}
            </div>
            <div>
              <div className={css.fitNums}>
                <b>맞춤 커리큘럼</b> · {TOPICS.length}차시 중 <Counts cover={cover} />
              </div>
              <Meter key={made} cover={cover} />
            </div>
            <button type="button" className={css.btnGhost} onClick={() => setPicking(true)}>
              장비 바꾸기
            </button>
          </div>
        )}

        <Roadmap done={done} cover={cover} now={nowCat} replay={made} onStop={toCard} />

        <div className={css.listHead}>
          <h2>단원 살펴보기</h2>
          <nav aria-label="대단원 바로 가기">
            {PARTS.map((p) => (
              <button
                key={p.id}
                type="button"
                style={{ '--band': p.color } as CSSProperties}
                onClick={() => home.current?.querySelector(`[data-part="${p.id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              >
                {p.no} {p.title.replace('로봇의 ', '')}
              </button>
            ))}
          </nav>
          <span className={css.legend}>
            <span>
              <i className={css.dot} data-how="full" />
              실물
            </span>
            <span>
              <i className={css.dot} data-how="part" />
              일부 실물
            </span>
            <span>
              <i className={css.dot} data-how="sim" />
              시뮬레이터
            </span>
          </span>
          <RetryChip onTopic={(t) => onStart(t, 'check')} />
        </div>

        {PARTS.map((p) => {
          const ids = p.subjects.flatMap((c) => topicsOf(c).map((t) => t.id));
          const pct = Math.round((ids.filter((t) => done[t]).length / ids.length) * 100);
          return (
            <section key={p.id} className={css.part} data-part={p.id} aria-label={`대단원 ${p.no} ${p.title}`} style={{ '--band': p.color, '--bandsoft': p.soft } as CSSProperties}>
              <aside className={css.partHead} data-no={p.no}>
                <span className={css.partNo}>대단원 {p.no}</span>
                <h3>{p.title}</h3>
                <p>
                  단원 {p.subjects.join(' · ')} · {ids.length}차시
                </p>
                <div className={css.partGoal}>
                  <small>마치면 할 수 있어요</small>
                  {p.goal}
                </div>
                <div className={css.bar} role="progressbar" aria-label={`대단원 ${p.no} 진도`} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                  <i style={{ width: `${pct}%` }} />
                </div>
                <span className={css.partMeta}>{pct}% 마침</span>
              </aside>
              <div className={css.units} style={{ '--n': p.subjects.length } as CSSProperties}>
                {p.subjects.map((c) => (
                  <UnitCard key={c} cat={c} {...{ done, cover, level, resume, onStart }} now={nowCat === c} onOpen={() => setUnit(c)} />
                ))}
              </div>
            </section>
          );
        })}
      </section>

      {picking && <GearModal owned={owned} onClose={() => setPicking(false)} onMake={make} />}
      <div className={css.toast} data-on={toast || undefined} role="status">
        {toast ? '맞춤 커리큘럼을 만들었어요' : ''}
      </div>
      {unit && <UnitDrawer cat={unit} {...{ done, owned, level, resume, onStart }} cover={cover} onClose={() => setUnit(null)} />}
    </div>
  );
}

/* ─────────────────────────────── 히어로 */

function Hero({
  level,
  onLevel,
  nDone,
  gear,
  resume,
  here,
  onResume,
  onGear,
  onGoal,
  onLab,
}: {
  level: StudyLevel;
  onLevel(l: StudyLevel): void;
  nDone: number;
  gear: string[];
  resume: ResumeSpot | null;
  here: TopicId;
  onResume(): void;
  onGear(): void;
  onGoal(): void;
  onLab(): void;
}) {
  const t = TOPIC_BY_ID.get(here)!;
  // The ring fills from empty once it is on screen.
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, []);
  const C = 2 * Math.PI * 50;
  return (
    <div className={css.hero}>
      <div className={css.heroText}>
        <span className={css.eyebrow}>
          로봇공학 교육과정 ·
          <select aria-label="수업 대상" title={LEVEL_VIEW[level].lead} value={level} onChange={(e) => onLevel(e.target.value as StudyLevel)}>
            <option value="hs">고등학교 · {LEVEL_VIEW.hs.minutes}분</option>
            <option value="uni">대학교 · {LEVEL_VIEW.uni.minutes}분</option>
          </select>
        </span>
        <h2>{GOAL.title}</h2>
        <p>
          대단원 {PARTS.length} · 단원 {CATEGORIES.length} · {TOPICS.length}차시 · 장비 {[...gear, 'PC 시뮬레이터'].join(' · ')}
        </p>
        <div className={css.heroActs}>
          <button type="button" className={css.btnWhite} onClick={onResume}>
            {resume ? '이어서 수업하기' : '처음 시작하기'} →
            <span>
              {t.id} {t.title}
              {resume?.topic === here ? ` · ${PAGE_LABEL[resume.page]}` : ''}
            </span>
          </button>
          <button type="button" className={css.btnLine} onClick={onGear}>
            장비 선택하기
          </button>
          <button type="button" className={css.btnLine} onClick={onLab} title="산업 현장을 골라 문제를 고치며 원리를 배워요">
            ← 로봇 시티
          </button>
        </div>
      </div>
      <div className={css.ring} role="img" aria-label={`전체 진도 ${nDone} / ${TOPICS.length}차시`}>
        <svg viewBox="0 0 120 120" aria-hidden="true">
          <circle cx="60" cy="60" r="50" fill="none" stroke="rgba(255,255,255,.18)" strokeWidth="10" />
          <circle
            className={css.arc}
            cx="60"
            cy="60"
            r="50"
            fill="none"
            stroke="#7ee2b8"
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={shown ? C * (1 - nDone / TOPICS.length) : C}
            transform="rotate(-90 60 60)"
          />
        </svg>
        <div>
          <b>{nDone}</b>
          <small>/ {TOPICS.length}차시</small>
        </div>
      </div>
      <button type="button" className={css.goalPic} onClick={onGoal} aria-label={`최종 목표 ${GOAL.topic} ${GOAL.short} — 8단원 자세히 보기`}>
        {/* eslint-disable-next-line @next/next/no-img-element -- the 3D view in the 8-2 capstone, also in the static export */}
        <img src={unitPicture('8')} alt="" />
        <span>
          <small>최종 목표 · {GOAL.topic}</small>
          {GOAL.short}
        </span>
      </button>
    </div>
  );
}

/** The summary bar's meter: 실물 then 일부 실물, filling from empty. */
function Meter({ cover }: { cover: Record<TopicId, TopicCover> }) {
  const n = coverCounts(cover);
  return (
    <div className={css.meter} aria-hidden="true">
      <i style={{ width: `${(n.real / TOPICS.length) * 100}%` }} />
      <i data-how="part" style={{ width: `${(n.part / TOPICS.length) * 100}%` }} />
    </div>
  );
}

/* ─────────────────────────────── 단원 카드 */

function UnitCard({
  cat,
  done,
  cover,
  level,
  resume,
  now,
  onStart,
  onOpen,
}: {
  cat: CategoryId;
  done: Done;
  cover: Record<TopicId, TopicCover>;
  level: StudyLevel;
  resume: ResumeSpot | null;
  now: boolean;
  onStart(t: TopicId, page?: PageId): void;
  onOpen(): void;
}) {
  const c = CATEGORIES.find((x) => x.id === cat)!;
  const ts = topicsOf(cat);
  const lv = LEVEL_VIEW[level];
  const complete = subjectComplete(cat, done);
  const nReal = ts.filter((t) => cover[t.id]).length;
  const dim = nReal === 0;
  // The 차시 to go on with: where the class stopped in this 단원, else its first one not done.
  const go = resume && TOPIC_BY_ID.get(resume.topic)?.cat === cat ? resume.topic : (ts.find((t) => !done[t.id]) ?? ts[0]).id;
  const goTopic = TOPIC_BY_ID.get(go)!;
  const st = complete ? 'done' : now ? 'now' : undefined;
  return (
    <article className={css.unit} data-unit={cat} data-st={st} data-dim={dim || undefined} onClick={onOpen}>
      <button
        type="button"
        className={css.unitPic}
        data-card={cat}
        aria-label={`${cat}단원 ${c.title} 자세히 보기`}
        onClick={(e) => {
          e.stopPropagation();
          onOpen();
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- the 3D view in the 단원's main activity, also in the static export */}
        <img src={unitPicture(cat)} alt="" loading="lazy" />
        <span className={css.unitNo}>단원 {cat}</span>
        {st && <span className={css.state}>{st === 'done' ? '마침' : '진행 중'}</span>}
        <span className={css.ov}>
          <b>{c.title}</b>
          <small>{UNIT_WHAT[cat]}</small>
        </span>
        <span className={css.hw} data-sim={dim || undefined}>
          {dim ? '시뮬레이터' : `실물 ${nReal}/${ts.length}`}
        </span>
      </button>
      <div className={css.unitBody}>
        <ol>
          {ts.map((t) => (
            <li key={t.id} data-st={done[t.id] ? 'done' : now && t.id === go ? 'now' : undefined}>
              <span className={css.k}>{t.id}</span>
              <span className={css.tt}>{t.title}</span>
              <i className={css.dot} data-how={cover[t.id] || 'sim'} title={HOW_NAME[cover[t.id]]} />
            </li>
          ))}
        </ol>
        {now && (
          <button
            type="button"
            className={`${css.btn} ${css.cta}`}
            onClick={(e) => {
              e.stopPropagation();
              onStart(go, resume?.topic === go ? resume.page : 'intro');
            }}
          >
            {go} {goTopic.title} {resume?.topic === go || done[ts[0].id] ? '이어서' : '시작'} →
          </button>
        )}
        <div className={css.unitFoot}>
          <span>
            {ts.length}차시 · {ts.length * lv.minutes}분
          </span>
          {lv.optional.includes(cat) && <span className={css.opt}>{lv.name} 심화</span>}
        </div>
      </div>
    </article>
  );
}

/* ─────────────────────────────── 단원 미리보기 (오른쪽 서랍) */

function UnitDrawer({
  cat,
  done,
  owned,
  level,
  cover,
  resume,
  onStart,
  onClose,
}: {
  cat: CategoryId;
  done: Done;
  owned: readonly ProductId[];
  level: StudyLevel;
  cover: Record<TopicId, TopicCover>;
  resume: ResumeSpot | null;
  onStart(t: TopicId, page?: PageId): void;
  onClose(): void;
}) {
  const c = CATEGORIES.find((x) => x.id === cat)!;
  const ts = topicsOf(cat);
  const lv = LEVEL_VIEW[level];
  const part = partOf(cat);
  const [pick, setPick] = useState<TopicId>(() => (resume && TOPIC_BY_ID.get(resume.topic)?.cat === cat ? resume.topic : (ts.find((t) => !done[t.id]) ?? ts[0]).id));
  useEffect(() => {
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);
  const used = realProducts(
    owned.filter((p) => p !== 'sim'),
    cat,
  );
  const mats = MATERIALS.filter((m) => m.cat === cat);
  const nReal = ts.filter((t) => cover[t.id]).length;
  const p = TOPIC_BY_ID.get(pick)!;
  return (
    <>
      <div className={css.scrim} onClick={onClose} />
      <aside className={css.drawer} aria-label={`${c.id}단원 미리보기`} style={{ '--tc': part.color } as CSSProperties}>
        <header className={css.dHead}>
          {/* eslint-disable-next-line @next/next/no-img-element -- the 3D view in the 단원's main activity, also in the static export */}
          <img src={unitPicture(cat)} alt="" />
          <div>
            <span className={css.dKicker}>
              대단원 {part.no} {part.title} · {c.id}단원
            </span>
            <h3>
              {c.id}. {c.title}
            </h3>
            <p>{CAPABILITY[cat]}</p>
          </div>
          <button type="button" className={css.x} onClick={onClose} aria-label="닫기">
            ×
          </button>
        </header>
        <div className={css.dBody}>
          <div className={css.facts}>
            <div>
              <b>{ts.length}</b>
              <small>차시</small>
            </div>
            <div>
              <b>{ts.length * lv.minutes}</b>
              <small>분</small>
            </div>
            <div>
              <b>
                {nReal}/{ts.length}
              </b>
              <small>실물</small>
            </div>
          </div>
          <div className={css.topics}>
            {ts.map((t) => (
              <button key={t.id} type="button" className={css.tp} aria-current={t.id === pick || undefined} onClick={() => setPick(t.id)}>
                {/* eslint-disable-next-line @next/next/no-img-element -- the topic's figure (still), also in the static export */}
                <img src={figureStill(t.id)} alt={`${t.id} 그림`} loading="lazy" />
                <span className={css.tpText}>
                  <span className={css.tpHead}>
                    <code>{t.id}</code>
                    <b>{t.title}</b>
                    {done[t.id] && <i className={css.tpDone}>✓</i>}
                    <em data-how={cover[t.id] || 'sim'}>{cover[t.id] === 'full' ? '실물' : cover[t.id] === 'part' ? '일부 실물' : '시뮬'}</em>
                  </span>
                  <span className={css.tpQ}>
                    <Rich text={t.question} inert />
                  </span>
                  {t.id === pick && (
                    <span className={css.flow}>
                      {FLOW.map((f, i) => (
                        <span key={f}>{i >= 2 && i <= 4 ? t.steps[i - 2].title : f}</span>
                      ))}
                    </span>
                  )}
                </span>
              </button>
            ))}
          </div>
          <div className={css.gear}>
            {c.prereq.length ? (
              c.prereq.map((q) => {
                const pc = CATEGORIES.find((x) => x.id === q)!;
                return (
                  <span key={q} className={css.tag} data-ok={subjectComplete(q, done) || undefined}>
                    먼저: {q}. {pc.title}
                    {subjectComplete(q, done) ? ' ✓' : ''}
                  </span>
                );
              })
            ) : (
              <span className={css.tag}>처음 시작하는 단원</span>
            )}
            {used.map((u) => (
              <span key={u.id} className={css.tag} data-real>
                {u.name}
              </span>
            ))}
            <span className={css.tag}>시뮬레이터</span>
          </div>
          {mats.length > 0 && (
            <div className={css.mats}>
              {mats.map((m) => (
                <a key={m.id} href={m.file} download={`${m.title}.pdf`}>
                  <span>{m.title.replace(/^\d+\. /, '')}</span>
                  <small>PDF ↓</small>
                </a>
              ))}
            </div>
          )}
        </div>
        <footer className={css.dFoot}>
          <small>
            {p.id} {p.title} · {lv.minutes}분{subjectDone(cat, done) ? ` · ${subjectDone(cat, done)}/${ts.length}차시 마침` : ''}
          </small>
          <button type="button" className={css.btn} onClick={() => onStart(pick, resume?.topic === pick ? resume.page : 'intro')}>
            {pick} 수업 시작 →
          </button>
        </footer>
      </aside>
    </>
  );
}

/* ─────────────────────────────── 틀린 문제 다시 풀기 */

function RetryChip({ onTopic }: { onTopic(t: TopicId): void }) {
  const ids = useSyncExternalStore(subscribeWrong, wrongIds, noWrongIds);
  const list = ids.map(questionById).filter((q): q is Question => !!q);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState<Question | null>(null);
  return (
    <span className={css.retryWrap}>
      <button type="button" className={css.chip} data-kind="retry" aria-expanded={open} onClick={() => setOpen((o) => !o)} title="틀린 문제 다시 풀기">
        ↻ 틀린 문제 {list.length > 0 && <em>{list.length}</em>}
      </button>
      {open && (
        <div className={css.retryPop} role="dialog" aria-label="틀린 문제 다시 풀기">
          <header>
            <b>틀린 문제 다시 풀기</b>
            <button type="button" className={css.x} onClick={() => setOpen(false)} aria-label="닫기">
              ×
            </button>
          </header>
          {list.length ? (
            <ul>
              {list.slice(0, 6).map((x) => (
                <li key={x.id}>
                  <button type="button" onClick={() => setQ(x)} title="다시 풀어 보기">
                    <span className={css.qId} data-kind={x.kind}>
                      {questionLabel(x)}
                    </span>
                    <span className={css.qText}>
                      <Rich text={x.q} inert />
                    </span>
                    <i aria-hidden="true">↻</i>
                  </button>
                </li>
              ))}
              {list.length > 6 && <li className={css.retryMore}>그 밖에 {list.length - 6}문제 — 위 문제를 맞히면 다음 문제가 올라와요.</li>}
            </ul>
          ) : (
            <p className={css.retryEmpty}>아직 틀린 문제가 없어요. 차시 끝 평가에서 틀린 문제가 여기에 모이고, 다시 맞히면 빠져요.</p>
          )}
        </div>
      )}
      {q && <RetryDialog q={q} onClose={() => setQ(null)} onTopic={onTopic} />}
    </span>
  );
}

function RetryDialog({ q, onClose, onTopic }: { q: Question; onClose(): void; onTopic(t: TopicId): void }) {
  const [picked, setPicked] = useState<number | undefined>(undefined);
  const topic = TOPIC_BY_ID.get(q.topic);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);
  const right = picked !== undefined && picked === answerOf(q);
  return (
    <div className={css.dialogBack} onClick={onClose}>
      <div className={css.dialog} role="dialog" aria-modal="true" aria-label={`${questionLabel(q)} 다시 풀기`} onClick={(e) => e.stopPropagation()}>
        <header>
          <span className={css.qId} data-kind={q.kind}>
            {questionLabel(q)}
          </span>
          <small>{topic ? `${topic.id} ${topic.title}` : q.topic}</small>
          <button type="button" className={css.x} onClick={onClose} aria-label="닫기">
            ×
          </button>
        </header>
        <div className={css.dialogQ}>
          <QuestionItem
            q={q}
            picked={picked}
            onPick={(v) => {
              setPicked(v);
              recordAnswer(q.id, v === answerOf(q));
            }}
          />
        </div>
        {picked !== undefined && (
          <p className={css.verdict} data-tone={right ? 'ok' : 'bad'}>
            {right ? '맞았어요! 틀린 문제 목록에서 뺐어요.' : '아직 아니에요. 해설을 읽고 이 차시를 다시 보면 좋아요.'}
          </p>
        )}
        <footer>
          {topic && (
            <button type="button" className={css.btnGhost} onClick={() => onTopic(topic.id)}>
              {topic.id} 평가 열기
            </button>
          )}
          {picked !== undefined && !right && (
            <button type="button" className={css.btnGhost} onClick={() => setPicked(undefined)}>
              다시 풀기
            </button>
          )}
          <button type="button" className={css.btn} onClick={onClose}>
            닫기
          </button>
        </footer>
      </div>
    </div>
  );
}
