/**
 * One printable 자료실 document (server-rendered, no client code): a 학문's
 * theory, its OX or four-choice sheet, the whole question book, or the
 * glossary. Question sheets end with the answers and explanations.
 */

import { Fragment, type CSSProperties } from 'react';

import { CATEGORIES, TOPIC_BY_ID, lessonNo, nextTopicOf, subjectOfTerm, topicsOf, type Category, type Topic } from '@/engine/education/catalog';
import { GLOSSARY, findTerm } from '@/engine/education/glossary';
import { KIND_LABEL, type Material } from '@/engine/education/materials';
import { QUESTIONS_BY_CATEGORY, type Question } from '@/engine/education/questions';
import { partOf } from '@/engine/education/roadmap';
import { glossFirst, splitRich, type Sym } from '@/engine/education/symbols';

import { FIGURES } from '../fig';

import { TopicArt } from '../lesson/TopicArt';
import css from './print.module.css';

const LEVEL = { 1: '기본', 2: '응용', 3: '대학' } as const;
const NUM = ['①', '②', '③', '④'];
/** Printed width of a choice in Hangul-character units (Latin letters and digits are about half as wide). */
const printWidth = (s: string) => [...s.replace(/`/g, '')].reduce((w, c) => w + (c.charCodeAt(0) > 0x2000 ? 1 : 0.55), 0);
/** Choices per line in a sheet column (about 80 mm): very short ones four to a line, short ones two, the rest one each. */
const choiceCols = (choices: readonly string[]) => {
  const w = Math.max(...choices.map(printWidth));
  return w <= 4 ? 4 : w <= 10 ? 2 : 1;
};

/**
 * Lesson text for paper: terms bold, symbols set like a textbook (the first one
 * of a section carries its name above it), on-screen names as keys.
 */
function Text({ text, syms = [] }: { text: string; syms?: readonly Sym[] }) {
  return (
    <>
      {splitRich(text).map((p, i) => {
        if ('term' in p) return <strong key={i}>{p.shown}</strong>;
        if ('ui' in p)
          return (
            <kbd key={i} className={css.key}>
              {p.ui}
            </kbd>
          );
        if ('sym' in p) {
          const d = syms.find((x) => x.sym === p.sym);
          return p.gloss && d ? (
            <ruby key={i} className={css.sym}>
              {p.sym}
              <rt>{d.name}</rt>
            </ruby>
          ) : (
            <span key={i} className={css.sym}>
              {p.sym}
            </span>
          );
        }
        return <Fragment key={i}>{p.text}</Fragment>;
      })}
    </>
  );
}

/** The topic's symbols as a table (기호 · 읽기 · 뜻 · 단위). */
function SymTable({ syms }: { syms: readonly Sym[] }) {
  if (!syms.length) return null;
  return (
    <table className={css.symTable}>
      <caption>Σ 이 주제의 기호</caption>
      <thead>
        <tr>
          <th>기호</th>
          <th>읽기</th>
          <th>뜻</th>
          <th>단위</th>
        </tr>
      </thead>
      <tbody>
        {syms.map((s) => (
          <tr key={s.sym}>
            <td className={css.sym}>{s.sym}</td>
            <td>{s.read}</td>
            <td>
              <b>{s.name}</b>
              {s.meaning && <>: {s.meaning}</>}
            </td>
            <td>{s.unit}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Head({ material, sub }: { material: Material; sub?: string }) {
  return (
    <header className={css.head}>
      <small>피지컬 AI 로봇 교육 · myCobot 280 · {KIND_LABEL[material.kind]}</small>
      <h1>{material.title}</h1>
      {sub && <p>{sub}</p>}
    </header>
  );
}

export default function MaterialDoc({ material }: { material: Material }) {
  const cat = material.cat ? CATEGORIES.find((c) => c.id === material.cat)! : null;
  return (
    <main className={css.doc} data-kind={material.kind}>
      {material.kind === 'theory' && cat && <Theory material={material} cat={cat} />}
      {(material.kind === 'ox' || material.kind === 'mc') && cat && (
        <Sheet material={material} groups={[{ cat, questions: QUESTIONS_BY_CATEGORY[cat.id].filter((q) => q.kind === material.kind) }]} />
      )}
      {material.kind === 'all' && (
        <Sheet
          material={material}
          groups={CATEGORIES.flatMap((c) => [
            { cat: c, questions: QUESTIONS_BY_CATEGORY[c.id].filter((q) => q.kind === 'ox'), label: 'OX' },
            { cat: c, questions: QUESTIONS_BY_CATEGORY[c.id].filter((q) => q.kind === 'mc'), label: '객관식' },
          ])}
        />
      )}
      {material.kind === 'glossary' && <Glossary material={material} />}
    </main>
  );
}

/* Theory ------------------------------------------------------------------ */

function Theory({ material, cat }: { material: Material; cat: Category }) {
  const topics = topicsOf(cat.id);
  const part = partOf(cat.id);
  return (
    <>
      <section className={css.cover} style={{ '--track': part.color } as CSSProperties}>
        <small>피지컬 AI 로봇 교육 · myCobot 280 · {KIND_LABEL[material.kind]} · 대단원 {part.no} {part.title}</small>
        <div className={css.coverTitle}>
          <span>{cat.id}</span>
          <div>
            <h1>{cat.title}</h1>
            <p>{cat.en}</p>
          </div>
        </div>
        <div className={css.coverGoal}>
          <b>이 단원을 마치면</b>
          {cat.goal}
        </div>
        {cat.prereq.length > 0 && (
          <p className={css.coverPre}>
            <b>먼저 배울 것</b> {cat.prereq.map((p) => `${p} ${CATEGORIES.find((c) => c.id === p)?.title}`).join(' · ')}
          </p>
        )}
        <ol className={css.toc}>
          {topics.map((t) => (
            <li key={t.id}>
              <b>{lessonNo(t.id)}차시</b>
              <span>
                {t.id} {t.title}
                <small>
                  <Text text={t.question} />
                </small>
              </span>
            </li>
          ))}
        </ol>
        <div className={css.howto}>
          <b>이 교재 쓰는 법: 한 주제가 한 차시(50분)</b>
          <ol>
            <li>
              <b>도입</b> 학습 목표를 읽고, <b>생각 열기</b> 질문에 내 생각을 적어 본 뒤 그림을 봐요.
            </li>
            <li>
              <b>개념</b> 정의 · 원리 · 자세히를 읽어요. 처음 보는 기호는 위에 작은 이름이 있고, 주제마다 <b>기호 표</b>가 있어요. 대학 과정은 수식까지.
            </li>
            <li>
              <b>탐구 활동 1 → 2 → 3</b> 시뮬레이터 [교육] 탭에서 같은 동작을 한 가지만 바꿔 세 번 해요. 하기 전에 <b>예상</b>을 적고, 해 본 뒤 <b>기록표</b>를 채우고
              <b>왜 그럴까</b>를 읽어요. <kbd className={css.key}>실행</kbd> 처럼 네모 친 말은 화면의 버튼 이름이에요.
            </li>
            <li>
              <b>정리 · 평가</b> 세 결과를 비교해 <b>기억할 것</b>과 <b>현장에서는</b>을 확인하고, 문항지로 평가해요.
            </li>
          </ol>
        </div>
        {cat.refs.length > 0 && (
          <footer className={css.sources}>
            <b>참고 자료</b> {cat.refs.join(' · ')}
          </footer>
        )}
      </section>
      {topics.map((t, i) => (
        <TopicTheory key={t.id} t={t} n={i + 1} of={topics.length} color={part.color} />
      ))}
    </>
  );
}

function TopicTheory({ t, n, of, color }: { t: Topic; n: number; of: number; color: string }) {
  const syms = t.symbols;
  const def = FIGURES[t.id];
  const legend = (def?.symbols ?? []).map((s) => syms.find((x) => x.sym === s)).filter((s) => !!s);
  const [q, definition, ...rest] = glossFirst([t.question, t.definition, ...t.objectives, ...t.principle]);
  const goals = rest.slice(0, t.objectives.length);
  const principle = rest.slice(t.objectives.length);
  const theory = glossFirst(t.theory);
  // Per activity: 목표 · 예상 · 할 일 · 볼 것 · 왜, then 비교 · 기억할 것 · 현장에서는.
  const lab = glossFirst([...t.steps.flatMap((s) => [s.goal, s.predict, s.doIt, s.observe, s.why]), t.compare, t.takeaway, t.field]);
  const next = nextTopicOf(t.id);
  const values = t.compareValues.split(/,\s*(?![^(]*\))/).map((v) => v.trim()).filter(Boolean);
  return (
    <section className={css.topic} style={{ '--track': color } as CSSProperties}>
      <header className={css.topicHead}>
        <span>{lessonNo(t.id)}차시</span>
        <div>
          <h2>
            {t.id} {t.title}
          </h2>
          <small>
            {t.en} · 단원 안 {n} / {of}차시 · 50분 (도입 5 · 개념 10 · 활동 8 × 3 · 정리 6 · 평가 5)
          </small>
        </div>
      </header>
      {goals.length > 0 && (
        <div className={css.box} data-kind="goal">
          <b>학습 목표</b>
          <ol>
            {goals.map((g) => (
              <li key={g}>
                <Text text={g} syms={syms} />
              </li>
            ))}
          </ol>
        </div>
      )}
      <p className={css.q}>
        <b>Q</b>
        <span>
          <small>생각 열기</small>
          <Text text={q} syms={syms} />
        </span>
      </p>
      <div className={css.opening}>
        <div>
          <b>함께 생각해 보기</b>
          <ul>
            {t.card.introAsk.map((a) => (
              <li key={a}>
                <Text text={a} syms={syms} />
              </li>
            ))}
          </ul>
        </div>
        <div>
          <b>해 볼 것</b>
          <ul className={css.checks}>
            {t.card.introDo.map((a) => (
              <li key={a}>
                <Text text={a} syms={syms} />
              </li>
            ))}
          </ul>
        </div>
      </div>
      <p className={css.write}>내 생각:</p>
      <figure className={css.figure}>
        <TopicArt id={t.id} className={css.fig} />
        <figcaption>
          <b>그림 {t.id}</b> {def?.caption ?? t.title}
          {legend.length > 0 && (
            <span className={css.legend}>
              {legend.map((s) => (
                <span key={s.sym}>
                  <i className={css.sym}>{s.sym}</i> {s.name}
                </span>
              ))}
            </span>
          )}
        </figcaption>
      </figure>
      <div className={css.box}>
        <b>정의</b>
        <p>
          <Text text={definition} syms={syms} />
        </p>
      </div>
      <div className={css.box} data-kind="principle">
        <b>원리</b>
        <ol>
          {principle.map((p) => (
            <li key={p}>
              <Text text={p} syms={syms} />
            </li>
          ))}
        </ol>
      </div>
      <SymTable syms={syms} />

      <h3 className={css.sec}>개념 자세히</h3>
      {theory.map((p) => (
        <p key={p} className={css.para}>
          <Text text={p} syms={syms} />
        </p>
      ))}
      {t.formula.length > 0 && (
        <div className={css.formula}>
          <b>대학 · 수식</b>
          {t.formula.map((f) => (
            <code key={f}>{f}</code>
          ))}
        </div>
      )}

      <section className={css.lab}>
        <h3 className={css.sec}>
          탐구 활동 <small>시뮬레이터 [교육] 탭 · {t.id} · 같은 동작을 한 가지만 바꿔 세 번</small>
        </h3>
        <div className={css.labSteps}>
          {t.steps.map((s, i) => {
            const [goal, predict, doIt, observe, why] = lab.slice(i * 5, i * 5 + 5);
            return (
              <div key={s.key} className={css.labStep}>
                <header>
                  <span>{s.n}</span>
                  <b>
                    활동 {s.n} · {s.title}
                  </b>
                  <em className={css.change}>
                    {s.change.value.includes(' → ') ? '바꾸는 것' : '처음 조건'} · {s.change.what}: {s.change.value}
                  </em>
                </header>
                <dl>
                  {goal && (
                    <>
                      <dt>목표</dt>
                      <dd>
                        <Text text={goal} syms={syms} />
                      </dd>
                    </>
                  )}
                  {predict && (
                    <>
                      <dt>예상</dt>
                      <dd>
                        <Text text={predict} syms={syms} />
                        <span className={css.choices}>
                          {s.choices.options.map((o, k) => (
                            <span key={o}>
                              ☐ {k + 1}. {o}
                            </span>
                          ))}
                        </span>
                      </dd>
                    </>
                  )}
                  <dt>할 일</dt>
                  <dd>
                    <Text text={doIt} syms={syms} />
                  </dd>
                  <dt>볼 것</dt>
                  <dd>
                    <Text text={observe} syms={syms} />
                  </dd>
                  {why && (
                    <>
                      <dt>왜</dt>
                      <dd>
                        <Text text={why} syms={syms} />
                      </dd>
                    </>
                  )}
                  <dt>핵심</dt>
                  <dd className={css.point}>
                    <Text text={s.point} syms={syms} />
                  </dd>
                </dl>
              </div>
            );
          })}
        </div>
        <table className={css.record}>
          <caption>✎ 기록표: 화면의 결과를 적어요</caption>
          <thead>
            <tr>
              <th>활동</th>
              {(values.length ? values : ['결과']).map((v) => (
                <th key={v}>{v}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {t.steps.map((s) => (
              <tr key={s.key}>
                <th>
                  활동 {s.n} <small>{s.title}</small>
                </th>
                {(values.length ? values : ['결과']).map((v) => (
                  <td key={v} />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <div className={css.box} data-kind="compare">
          <b>정리: 세 활동 비교하기</b>
          <p>
            <Text text={lab[15]} syms={syms} />
          </p>
          <p className={css.write}>알게 된 것:</p>
        </div>
        <div className={css.box} data-kind="compare">
          <b>정리 질문</b>
          <p>
            <Text text={t.card.wrapAsk} syms={syms} />
          </p>
          <p className={css.write}>내 답:</p>
        </div>
        <div className={css.box} data-kind="key">
          <b>기억할 것</b>
          <p>
            <Text text={lab[16]} syms={syms} />
          </p>
        </div>
        {lab[17] && (
          <div className={css.box} data-kind="field">
            <b>현장에서는</b>
            <p>
              <Text text={lab[17]} syms={syms} />
            </p>
          </div>
        )}
        <div className={css.teacher}>
          <b>교사용 답</b>
          <span>
            예상 정답:{' '}
            {t.steps.map((s) => `활동 ${s.n}: ${s.choices.answer + 1}. ${s.choices.options[s.choices.answer]}`).join(' · ')}
          </span>
          <span>
            정리 질문: <Text text={t.card.wrapAnswer} syms={syms} />
          </span>
          <span>
            개념 확인 질문: <Text text={t.card.conceptAsk} syms={syms} />
          </span>
        </div>
        {next && (
          <p className={css.nextLesson}>
            <b>다음 차시 · {lessonNo(next.id)}차시</b> {next.id} {next.title}: <Text text={next.question} />
          </p>
        )}
      </section>

      <dl className={css.terms}>
        {t.terms.map((k) => {
          const g = findTerm(k);
          return g ? (
            <Fragment key={k}>
              <dt>
                {g.ko} <small>{g.en}</small>
              </dt>
              <dd>{g.short}</dd>
            </Fragment>
          ) : null;
        })}
      </dl>
    </section>
  );
}

/* Question sheets ----------------------------------------------------------- */

interface Group {
  cat: Category;
  questions: Question[];
  label?: string;
}

function Sheet({ material, groups }: { material: Material; groups: Group[] }) {
  // Number the questions through the whole document.
  let n = 0;
  const numbered = groups.map((g) => ({ ...g, items: g.questions.map((q) => ({ q, no: ++n })) }));
  const total = n;
  const how =
    material.kind === 'ox'
      ? '맞으면 O, 틀리면 X 에 ○ 표 하세요.'
      : material.kind === 'mc'
        ? '알맞은 것을 하나 골라 번호에 ○ 표 하세요.'
        : 'OX 는 O 또는 X, 객관식은 알맞은 번호 하나에 ○ 표 하세요.';
  return (
    <>
      <header className={css.examHead}>
        <div>
          <small>피지컬 AI 로봇 교육 · myCobot 280 · {KIND_LABEL[material.kind]}</small>
          <h1>{material.title}</h1>
          <p>
            {total}문항 · {how} 수준 표시: 기본 · 응용 · 대학. 정답과 해설은 맨 뒤에 있어요.
          </p>
        </div>
        <table className={css.student}>
          <tbody>
            <tr>
              <th>학년 · 반</th>
              <th>번호</th>
              <th>이름</th>
              <th>점수</th>
            </tr>
            <tr>
              <td />
              <td />
              <td />
              <td>
                <small>/ {total}</small>
              </td>
            </tr>
          </tbody>
        </table>
      </header>
      {numbered.map((g) => (
        <section key={`${g.cat.id}${g.label ?? ''}`} className={css.qGroup}>
          <h2 className={css.qCat}>
            <span>{g.cat.id}</span> {g.cat.title}
            {g.label && <small>{g.label}</small>}
          </h2>
          <div className={css.examCols}>
            {topicsOf(g.cat.id).map((t) => {
              const items = g.items.filter((x) => x.q.topic === t.id);
              if (!items.length) return null;
              return (
                <Fragment key={t.id}>
                  <h3 className={css.qTopic}>
                    {t.id} {t.title}
                    {t.symbols.length > 0 && (
                      <small className={css.qSyms}>
                        {t.symbols.map((s) => (
                          <span key={s.sym}>
                            <i className={css.sym}>{s.sym}</i> {s.name}
                          </span>
                        ))}
                      </small>
                    )}
                  </h3>
                  {items.map(({ q, no }) => (
                    <div key={q.id} className={css.item} data-kind={q.kind}>
                      <p className={css.stem}>
                        <b className={css.qn}>{no}.</b>
                        <span>
                          <Text text={q.q} /> <span className={css.lv}>{LEVEL[q.level]}</span>
                        </span>
                        {q.kind === 'ox' && (
                          <span className={css.ox} aria-label="O 또는 X">
                            <i>O</i>
                            <i>X</i>
                          </span>
                        )}
                      </p>
                      {q.kind === 'mc' && (
                        <ol className={css.choices} data-cols={choiceCols(q.choices)}>
                          {q.choices.map((c, i) => (
                            <li key={i}>
                              <b>{NUM[i]}</b>
                              <span>
                                <Text text={c} />
                              </span>
                            </li>
                          ))}
                        </ol>
                      )}
                    </div>
                  ))}
                </Fragment>
              );
            })}
          </div>
        </section>
      ))}
      <section className={css.answers}>
        <h2>정답과 해설</h2>
        <ol className={css.ans}>
          {numbered.flatMap((g) =>
            g.items.map(({ q, no }) => (
              <li key={q.id}>
                <b className={css.qn}>{no}.</b>
                <b className={css.ansKey}>{q.kind === 'ox' ? (q.answer ? 'O' : 'X') : NUM[q.answer]}</b>
                <span>
                  <span className={css.ansTopic}>{TOPIC_BY_ID.get(q.topic)?.id}</span> <Text text={q.why} />
                </span>
              </li>
            )),
          )}
        </ol>
      </section>
    </>
  );
}

/* Glossary ------------------------------------------------------------------- */

/** Terms under the 학문 that first uses them, then the rest. */
function Glossary({ material }: { material: Material }) {
  const groups = [
    ...CATEGORIES.map((c) => ({ key: c.id, title: `${c.id} ${c.title}`, terms: GLOSSARY.filter((t) => subjectOfTerm(t.ko) === c.id) })),
    { key: 'etc', title: '그 밖의 용어', terms: GLOSSARY.filter((t) => subjectOfTerm(t.ko) === null) },
  ].filter((g) => g.terms.length);
  return (
    <>
      <Head material={material} sub="뜻은 국제 표준 ISO 8373:2021(로봇 용어)을 따라 쉬운 말로 풀었어요. 단원마다 처음 나오는 곳에 모았어요." />
      {groups.map((g) => (
        <section key={g.key} className={css.gloss}>
          <h2>{g.title}</h2>
          <div className={css.glossCols}>
            {g.terms.map((t) => (
              <dl key={t.ko} className={css.term}>
                <dt>
                  {t.ko} <small>{t.en}</small>
                </dt>
                <dd>
                  {t.short}
                  {t.more && <span>{t.more}</span>}
                </dd>
              </dl>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}
