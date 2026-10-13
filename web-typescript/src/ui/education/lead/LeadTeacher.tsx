'use client';

/**
 * The teacher's screen of a led lesson (로봇 실습 7 "선생님과 함께"). Two parts side by side:
 *  - the stage: what the projector shows the class, large (the step's headline, one line, a picture of
 *    the class's answers or the live 3D, and 지금 할 일);
 *  - the rail: the teacher's own notes (what to say, what to ask, the answer to expect), the class at a
 *    glance (done · still at it · asking for help, the groups' robots) and the controls (open the next
 *    step, show the answer, let the robots move, stop every robot).
 * On an extended display the rail stays on the laptop; when the projector mirrors the laptop the rail
 * can be hidden ([진행 칸 숨기기]) and the steps moved with a clicker (→ / PageDown, ← / PageUp).
 */

import { useEffect, useMemo, useState } from 'react';

import { ROBOT_WORD, groupsReady, loadRoster, browserStore, summarize, type Lead } from '@/engine/account';
import { HAND_PHOTO, answerIndex, answerOptions, lessonMinutes, nextLesson, type LeadLesson, type LeadStep } from '@/engine/education/lead';

import { Lines } from '../lesson/Rich';
import type { LeadKit } from './kit';
import { Card, Flow, HandPhoto, RED_BLOCK, RedBoard, Tally } from './pieces';
import type { HostState, LeadSession } from './useLead';
import css from './lead.module.css';

interface Props {
  lesson: LeadLesson;
  lead: Lead;
  host: HostState;
  sess: LeadSession;
  kit: LeadKit;
  /** Where the live 3D view goes (a ref callback). */
  slot(el: HTMLElement | null): void;
  onEnd(): void;
}

const mmss = (ms: number) => `${Math.max(0, Math.floor(ms / 60000))}분`;

export default function LeadTeacher({ lesson, lead, host, sess, kit, slot, onEnd }: Props) {
  const step = lesson.steps[Math.min(lead.step, lesson.steps.length - 1)];
  const act = step.act;
  const sum = useMemo(() => summarize(lead, host.marks, sess.total), [lead, host.marks, sess.total]);
  const roster = useMemo(() => (sess.classId ? loadRoster(browserStore(), sess.classId) : {}), [sess.classId]);
  const [railHidden, setRailHidden] = useState(false);
  const [showExpect, setShowExpect] = useState<number | null>(null);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(t);
  }, []);

  const go = (to: number) => {
    if (to < 0 || to >= lesson.steps.length) return;
    host.set({ step: to, gate: false, reveal: false });
  };
  const next = nextLesson(lesson.id);
  const last = lead.step >= lesson.steps.length - 1;
  const stopAll = () => {
    host.set({ stop: lead.stop + 1, gate: false });
    kit.real.stop();
  };

  // A clicker (presentation remote) sends → / PageDown and ← / PageUp.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown') go(lead.step + 1);
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') go(lead.step - 1);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const total = lessonMinutes(lesson);
  const passed = now - lead.at;
  const counts = (options: readonly string[]) => options.map((_, i) => [...sum.answers].filter(([a]) => answerIndex(act, a) === i).reduce((s, [, n]) => s + n, 0));
  const hasAnswer = act.kind === 'quiz' || act.kind === 'wrap' || act.kind === 'pick' || act.kind === 'tap';
  const name = (no: number) => (roster[no] ? `${no} ${roster[no]}` : `${no}번`);

  return (
    <div className={css.teacher} data-rail={railHidden ? 'hidden' : undefined}>
      <header className={css.tHead}>
        <span className={css.with}>
          <i />
          선생님과 함께
        </span>
        <div className={css.unitName}>
          {lesson.unit}. {kit.unit.title}
          <small>
            로봇 실습 7 · {lesson.period}
            {sess.className ? ` · ${sess.className}` : ' · 이 PC 만 (학생 화면 연결 없음)'}
          </small>
        </div>
        <span className={css.sp} />
        <span className={css.pill}>
          지금 <b>{step.name}</b> · <b>{step.min}분</b>
        </span>
        <span className={css.pill}>
          수업 <b>{mmss(passed)}</b> 지남 · 계획 <b>{total}분</b>
        </span>
        <button type="button" className={css.ghost} onClick={() => setRailHidden((v) => !v)} title="화면 복제로 프로젝터에 나갈 때 진행 칸을 숨겨요">
          {railHidden ? '진행 칸 보이기' : '진행 칸 숨기기'}
        </button>
        <button type="button" className={css.stopAll} onClick={stopAll}>
          ■ 모든 로봇 정지
        </button>
      </header>

      <nav className={css.steps} aria-label="수업 단계">
        {lesson.steps.map((s, i) => (
          <button key={i} type="button" className={css.stepPill} data-state={i < lead.step ? 'done' : i === lead.step ? 'now' : 'next'} onClick={() => go(i)} aria-current={i === lead.step ? 'step' : undefined}>
            <i>{i < lead.step ? '✓' : i + 1}</i>
            <span>
              <b>{s.name}</b>
              <small>{s.min}분</small>
            </span>
          </button>
        ))}
      </nav>

      <div className={css.tBody}>
        <section className={css.stage} aria-label="프로젝터 화면">
          <span className={css.stageTag}>▣ 프로젝터에 나가는 화면</span>
          <div className={css.stageCard}>
            <div className={css.kick}>
              {lead.step + 1} · {step.name}
            </div>
            <h2>{step.title}</h2>
            <p className={css.say}>{step.say}</p>
            <div className={css.vis}>
              <StageVis step={step} lead={lead} kit={kit} slot={slot} counts={counts} shared={sess.host.shared} groups={sum.groups} done={sum.done} />
            </div>
            <div className={css.doNow}>
              <em>지금 할 일</em>
              {step.doNow}
            </div>
          </div>
        </section>

        {!railHidden && (
          <aside className={css.rail} aria-label="진행 칸 (선생님만)">
            <div className={css.railHead}>
              <b>진행 칸</b>
              <span className={css.lock}>확장 화면이면 프로젝터에 안 나가요</span>
            </div>
            <div className={css.railBody}>
              <section className={css.rsec}>
                <h3>이렇게 말해요</h3>
                {step.script.map((s, i) => (
                  <p key={i}>
                    <Lines text={s} />
                  </p>
                ))}
              </section>
              <section className={css.rsec}>
                <h3>물어보기</h3>
                <p>{step.ask}</p>
                {showExpect === lead.step ? (
                  <div className={css.expect}>{step.expect}</div>
                ) : (
                  <button type="button" className={css.subBtn} onClick={() => setShowExpect(lead.step)}>
                    예상 답 보기 (여기에만)
                  </button>
                )}
                {hasAnswer && (
                  <button type="button" className={css.revealBtn} aria-pressed={lead.reveal} onClick={() => host.set({ reveal: !lead.reveal })}>
                    {lead.reveal ? '✓ 모든 화면에 정답이 보여요 · 숨기기' : '모든 화면에 정답 보이기'}
                  </button>
                )}
              </section>
              {sess.host.shared ? (
                <section className={css.rsec}>
                  <h3>
                    반 현황 · {sum.joined} / {sum.total}명 들어옴
                  </h3>
                  <div className={css.meter}>
                    <b>{sum.done}</b>
                    <span>명 다 했어요</span>
                  </div>
                  <div className={css.bar}>
                    <i style={{ width: `${sum.joined ? (sum.done / sum.joined) * 100 : 0}%`, background: '#3ccf7b' }} />
                    <i style={{ width: `${sum.joined ? (sum.doing / sum.joined) * 100 : 0}%`, background: '#4f6ef7' }} />
                    <i style={{ width: `${sum.joined ? (sum.help.length / sum.joined) * 100 : 0}%`, background: '#f04438' }} />
                  </div>
                  <div className={css.legend}>
                    <span style={{ '--c': '#3ccf7b' } as React.CSSProperties}>다 함 {sum.done}</span>
                    <span style={{ '--c': '#4f6ef7' } as React.CSSProperties}>하는 중 {sum.doing}</span>
                    <span style={{ '--c': '#f04438' } as React.CSSProperties}>도움 요청 {sum.help.length}</span>
                  </div>
                  {sum.help.length > 0 && (
                    <div className={css.chips}>
                      {sum.help.map((n) => (
                        <span key={n} className={css.chip}>
                          {name(n)} ✋
                        </span>
                      ))}
                    </div>
                  )}
                  {sum.joined === 0 && <p className={css.note}>학생이 교육 탭에서 [함께하기] 를 누르면 여기에 나와요.</p>}
                </section>
              ) : (
                <section className={css.rsec}>
                  <h3>학생 화면</h3>
                  <p className={css.note}>학급 서버 없이 이 PC 에서만 진행해요. 학생 화면을 함께 넘기려면 학급 서버로 로그인한 뒤 수업을 시작해요.</p>
                </section>
              )}
              {act.kind === 'real' && sess.host.shared && (
                <section className={css.rsec}>
                  <h3>조별 로봇</h3>
                  {sum.groups.length ? (
                    <div className={css.groups}>
                      {sum.groups.map((g) => (
                        <div key={g.group} className={css.grp} data-s={g.robot || 'none'}>
                          <b>{g.group}조</b>
                          {g.robotNo === null ? '로봇 담당 없음' : ROBOT_WORD[g.robot]}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className={css.note}>조를 고른 학생이 아직 없어요.</p>
                  )}
                </section>
              )}
              {host.error && <p className={css.err}>학급 서버에 연결할 수 없어요. 다시 시도하는 중… ({host.error})</p>}
            </div>
            <div className={css.railFoot}>
              {act.kind === 'real' && (
                <button type="button" className={css.gateBtn} aria-pressed={lead.gate} onClick={() => host.set({ gate: !lead.gate })}>
                  {lead.gate ? '✓ 로봇 움직이기 허용됨 · 다시 잠그기' : sess.host.shared && !groupsReady(sum) ? '모든 조 로봇 움직여도 돼요 (아직 준비 중인 조 있음)' : '모든 조 로봇 움직여도 돼요'}
                </button>
              )}
              <div className={css.subRow}>
                <button type="button" className={css.subBtn} disabled={lead.step === 0} onClick={() => go(lead.step - 1)}>
                  ← 앞 단계
                </button>
                {confirmEnd ? (
                  <button type="button" className={css.endBtn} onClick={onEnd}>
                    정말 끝낼까요? 끝내기
                  </button>
                ) : (
                  <button type="button" className={css.subBtn} onClick={() => setConfirmEnd(true)}>
                    수업 끝내기
                  </button>
                )}
              </div>
              {!last ? (
                <button type="button" className={css.nextBtn} onClick={() => go(lead.step + 1)}>
                  <span>
                    <small>다음 단계 열기 · 학생 화면이 함께 넘어가요</small>
                    {lead.step + 2}. {lesson.steps[lead.step + 1].name}
                  </span>
                  <span>→</span>
                </button>
              ) : next ? (
                <button type="button" className={css.nextBtn} onClick={() => host.set({ lesson: next.id, step: 0, gate: false, reveal: false })}>
                  <span>
                    <small>다음 수업 · 학생 화면이 함께 넘어가요</small>
                    7-{next.unit}. {next.period}
                  </span>
                  <span>→</span>
                </button>
              ) : (
                <button type="button" className={css.nextBtn} onClick={onEnd}>
                  <span>
                    <small>마지막 단계예요</small>
                    수업 끝내기
                  </span>
                  <span>■</span>
                </button>
              )}
            </div>
          </aside>
        )}
        {railHidden && (
          <div className={css.railMini}>
            <button type="button" onClick={() => go(lead.step - 1)} disabled={lead.step === 0} aria-label="앞 단계">
              ←
            </button>
            <button type="button" onClick={() => go(lead.step + 1)} disabled={last} aria-label="다음 단계">
              →
            </button>
            {act.kind === 'real' && (
              <button type="button" aria-pressed={lead.gate} onClick={() => host.set({ gate: !lead.gate })}>
                {lead.gate ? '허용됨' : '로봇 허용'}
              </button>
            )}
            {hasAnswer && (
              <button type="button" aria-pressed={lead.reveal} onClick={() => host.set({ reveal: !lead.reveal })}>
                정답
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** The middle of the projector card: what the class should look at on this step. */
function StageVis({
  step,
  lead,
  kit,
  slot,
  counts,
  shared,
  groups,
  done,
}: {
  step: LeadStep;
  lead: Lead;
  kit: LeadKit;
  slot(el: HTMLElement | null): void;
  counts(options: readonly string[]): number[];
  shared: boolean;
  groups: ReturnType<typeof summarize>['groups'];
  done: number;
}) {
  const act = step.act;
  if (act.kind === 'vote' || act.kind === 'quiz')
    return (
      <div className={css.visCol}>
        <Tally options={act.options} counts={counts(act.options)} right={act.kind === 'quiz' && lead.reveal ? act.answer : null} big />
        {act.kind === 'quiz' && lead.reveal && <p className={css.why}>{act.why}</p>}
        {!shared && <p className={css.note}>학생들이 손을 들어 고르게 해요.</p>}
      </div>
    );
  if (act.kind === 'sim')
    return (
      <div className={css.visRow}>
        <div className={css.slot} ref={slot} />
        <div className={css.visSide}>
          <div className={css.demo}>
            <small>선생님이 먼저 보여 주기</small>
            {act.steps.map((id) => {
              const s = kit.unit.steps.find((x) => x.id === id)!;
              return (
                <button key={id} type="button" className={css.demoBtn} disabled={kit.busy} data-done={kit.doneSteps.includes(id) || undefined} onClick={() => void kit.doStep(id)}>
                  <b>{s.label}</b>
                  <small>{s.hint}</small>
                </button>
              );
            })}
          </div>
          <div className={css.extra}>{kit.extra}</div>
        </div>
      </div>
    );
  if (act.kind === 'tap')
    return (
      <div className={css.visRow}>
        <HandPhoto marks={lead.reveal ? HAND_PHOTO.blocks : []} />
        <div className={css.visSide}>
          <Card title="4개 모두 찾은 학생">
            <div className={css.count}>
              {done}
              <small>명</small>
            </div>
          </Card>
          {lead.reveal && <p className={css.why}>로봇도 사진 속 색으로 블록을 찾아요.</p>}
        </div>
      </div>
    );
  if (act.kind === 'pick')
    return (
      <div className={css.visRow}>
        <div className={css.visNarrow}>
          <HandPhoto marks={[RED_BLOCK]} pixel label="사진 속 자리" />
        </div>
        <div className={css.arrow}>→</div>
        <div className={css.visCol}>
          <RedBoard pick={null} reveal={lead.reveal} />
          {shared && <Tally options={answerOptions(act)} counts={counts(answerOptions(act))} right={lead.reveal ? 1 : null} />}
        </div>
      </div>
    );
  if (act.kind === 'real') {
    if (!shared)
      return (
        <div className={css.visRow}>
          <div className={css.slot} ref={slot} />
          <div className={css.visSide}>
            <div className={css.realBox}>{kit.real.controls(!lead.gate)}</div>
            {!lead.gate && <p className={css.note}>[로봇 허용] 을 누르면 실물 버튼이 열려요.</p>}
            {kit.real.msg && <p className={css.realMsg}>{kit.real.msg}</p>}
            {kit.real.media}
          </div>
        </div>
      );
    return (
      <div className={css.visCol}>
        <div className={css.groupGrid}>
          {groups.map((g) => (
            <div key={g.group} className={css.gCard} data-s={g.robot || 'none'}>
              <b>{g.group}조</b>
              <strong>{g.robotNo === null ? '로봇 담당 없음' : ROBOT_WORD[g.robot]}</strong>
              {g.result && <small>{g.result}</small>}
            </div>
          ))}
          {!groups.length && <p className={css.note}>조를 고른 학생이 아직 없어요.</p>}
        </div>
        <div className={css.predict}>
          <small>모둠원 예상: {act.predict.q}</small>
          <Tally options={act.predict.options} counts={counts(act.predict.options)} />
        </div>
      </div>
    );
  }
  return (
    <div className={css.visCol}>
      <Flow flow={act.flow} />
      <div className={css.predict}>
        <small>확인 문제: {act.quiz.q}</small>
        <Tally options={act.quiz.options} counts={counts(act.quiz.options)} right={lead.reveal ? act.quiz.answer : null} />
        {lead.reveal && <p className={css.why}>{act.quiz.why}</p>}
      </div>
    </div>
  );
}
