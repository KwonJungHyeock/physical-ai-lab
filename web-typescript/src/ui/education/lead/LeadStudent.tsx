'use client';

/**
 * A student's screen in a led lesson. It shows the step the teacher has opened (the student may look back
 * at earlier ones, never ahead), one task in large words, the work for it (a pick, a photo to tap, the 3D
 * steps, the real robot), and a footer with "done" and [도움이 필요해요]. Everything it does goes to the
 * teacher's rail as the student's mark. The real robot: only the group's robot PC has the buttons, and they
 * stay locked until the teacher allows it; the teacher's [모든 로봇 정지] stops it at once.
 */

import { useEffect, useRef, useState } from 'react';

import { ROBOT_WORD, type Lead, type RobotState } from '@/engine/account';
import { HAND_PHOTO, RED_RIGHT, answerRight, pickAnswer, type LeadLesson } from '@/engine/education/lead';

import { announceRobotStop } from '../../simulator/connect/robotStop';
import type { LeadKit } from './kit';
import { Card, Choices, Flow, HandPhoto, RED_BLOCK, RedBoard } from './pieces';
import type { StudentLead } from './useLead';
import css from './lead.module.css';

interface Props {
  lesson: LeadLesson;
  lead: Lead;
  sl: StudentLead;
  /** The student's 번호. */
  no: number | null;
  kit: LeadKit;
  /** Where the live 3D view goes (a ref callback). */
  slot(el: HTMLElement | null): void;
}

export default function LeadStudent({ lesson, lead, sl, no, kit, slot }: Props) {
  const joined = sl.joined!;
  const robotPc = joined.role === 'robot';
  const open = Math.min(lead.step, lesson.steps.length - 1);
  // The step looked at: the one the teacher opened, unless the student went back since it was opened.
  const [view, setView] = useState<{ at: number; when: number }>({ at: open, when: open });
  const at = view.when === open ? Math.min(view.at, open) : open;
  const step = lesson.steps[at];
  const act = step.act;

  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [doneAt, setDoneAt] = useState<Record<number, boolean>>({});
  const [taps, setTaps] = useState<string[]>([]);
  const [pressed, setPressed] = useState<Record<number, string[]>>({});
  const [checks, setChecks] = useState<Record<number, number[]>>({});
  /** The last real result already there when the robot PC got ready (a new one = this lesson's run). */
  const [realBase, setRealBase] = useState<Record<number, string | null>>({});
  const [help, setHelp] = useState<{ step: number; on: boolean }>({ step: -1, on: false });
  const helpOn = help.step === open && help.on;

  const answer = (k: number) => answers[k] ?? '';
  const setAnswer = (k: number, a: string, done = true) => {
    setAnswers((x) => ({ ...x, [k]: a }));
    if (done) setDoneAt((x) => ({ ...x, [k]: true }));
  };

  /* --- the robot PC's state on the open step -------------------------------------------------- */
  const openAct = lesson.steps[open].act;
  const realStep = openAct.kind === 'real';
  const checksAll = realStep && (checks[open]?.length ?? 0) >= (openAct.kind === 'real' ? openAct.checks.length : 3);
  const ranHere = realStep && open in realBase && kit.real.doneAt !== realBase[open];
  const robot: RobotState = !realStep || !robotPc ? '' : kit.real.busy ? 'run' : ranHere ? 'done' : kit.real.msg.startsWith('멈췄어요') && checksAll ? 'fail' : checksAll ? 'ready' : 'prep';
  const doneOpen = realStep && robotPc ? ranHere : !!doneAt[open];

  // Tell the teacher's rail what this screen did on the open step.
  const { send } = sl;
  useEffect(() => {
    send({ lesson: lesson.id, step: open, done: doneOpen && !helpOn, help: helpOn, answer: answers[open] ?? '', robot, result: robot === 'run' || robot === 'done' || robot === 'fail' ? kit.real.msg : '' });
  }, [send, lesson.id, open, doneOpen, helpOn, answers, robot, kit.real.msg]);

  // The teacher's [모든 로봇 정지]: stop this PC's robot now (and 실물 연동, anything else moving it).
  const seenStop = useRef(lead.stop);
  useEffect(() => {
    if (lead.stop <= seenStop.current) return;
    seenStop.current = lead.stop;
    if (kit.real.online) kit.real.stop();
    announceRobotStop();
  }, [lead.stop, kit.real]);

  const reveal = lead.reveal && at === open;
  let task = step.task;
  let sub = step.sub;
  let work: React.ReactNode = null;

  if (act.kind === 'vote' || act.kind === 'quiz') {
    const picked = answer(at) === '' ? -1 : Number(answer(at));
    const right = act.kind === 'quiz' && reveal ? act.answer : null;
    work = (
      <div className={css.sCenter}>
        <Choices options={act.options} picked={picked} right={right} ox={act.options.length === 2 && act.options.every((o) => o.length <= 2)} onPick={(i) => setAnswer(at, pickAnswer(i))} />
        {act.kind === 'quiz' && reveal && picked >= 0 && (
          <Card tone={picked === act.answer ? 'ok' : 'bad'} title={picked === act.answer ? '맞아요!' : `답은 ${'ABCDE'[act.answer]} 예요.`}>
            <p className={css.note}>{act.why}</p>
          </Card>
        )}
        {picked >= 0 && !reveal && <p className={css.note}>{act.kind === 'quiz' ? '골랐어요. 선생님이 정답을 보여 줄 때까지 바꿀 수 있어요.' : '골랐어요. 선생님 화면에 모여요.'}</p>}
      </div>
    );
  } else if (act.kind === 'sim') {
    const mine = pressed[at] ?? [];
    work = (
      <>
        <div className={css.slot} ref={slot} />
        <div className={css.sSide}>
          {act.steps.map((id, i) => {
            const s = kit.unit.steps.find((x) => x.id === id)!;
            const did = mine.includes(id);
            const ready = i === 0 || mine.includes(act.steps[i - 1]) || kit.unit.id === 1;
            return (
              <button
                key={id}
                type="button"
                className={css.big}
                data-done={did || undefined}
                disabled={kit.busy || !ready}
                onClick={async () => {
                  await kit.doStep(id);
                  const after = [...new Set([...(pressed[at] ?? []), id])];
                  setPressed((p) => ({ ...p, [at]: after }));
                  if (act.steps.every((x) => after.includes(x))) setDoneAt((x) => ({ ...x, [at]: true }));
                }}
              >
                <i>{did ? '✓' : i + 1}</i>
                <span>
                  <b>{s.label}</b>
                  <small>{s.hint}</small>
                </span>
              </button>
            );
          })}
          <div className={css.extra}>{kit.extra}</div>
        </div>
      </>
    );
  } else if (act.kind === 'tap') {
    const found = HAND_PHOTO.blocks.filter((b) => taps.includes(b.color));
    work = (
      <>
        <HandPhoto
          marks={reveal ? HAND_PHOTO.blocks : found}
          label="손 카메라 사진"
          hint={found.length < 4 ? '블록을 눌러요' : undefined}
          onTap={(b) => {
            if (!b || taps.includes(b.color)) return;
            const next = [...taps, b.color];
            setTaps(next);
            setAnswer(at, String(next.length), next.length >= 4);
          }}
        />
        <div className={css.sSide}>
          <Card title="찾은 블록">
            <div className={css.count}>
              {found.length}
              <small> / 4</small>
            </div>
            <div className={css.chips}>
              {found.map((b) => (
                <span key={b.color} className={css.colorChip} style={{ '--c': b.hex } as React.CSSProperties}>
                  {b.color}
                </span>
              ))}
            </div>
          </Card>
          <p className={css.note}>로봇도 이렇게 사진 속 색으로 블록을 찾아요.</p>
        </div>
      </>
    );
  } else if (act.kind === 'pick') {
    const p = answer(at) || null;
    const right = answerRight(act, answer(at));
    work = (
      <>
        <div className={css.sNarrow}>
          <HandPhoto marks={[RED_BLOCK]} pixel label="사진 속 자리" />
        </div>
        <div className={css.arrow}>→</div>
        <div className={css.sCol}>
          <RedBoard pick={p} reveal={reveal} onPick={(k) => setAnswer(at, k)} />
          {p && reveal ? (
            <Card tone={right ? 'ok' : 'bad'} title={right ? '맞아요. (115, −75) mm' : `답은 ${RED_RIGHT} 예요.`}>
              <p className={css.note}>사진의 위쪽 = 로봇에서 먼 쪽, 사진의 오른쪽 = 로봇의 오른편이에요.</p>
            </Card>
          ) : (
            <p className={css.note}>{p ? '골랐어요. 선생님이 정답을 보여 줄 때까지 바꿀 수 있어요.' : 'A · B · C 가운데 하나를 눌러요.'}</p>
          )}
        </div>
      </>
    );
  } else if (act.kind === 'real') {
    if (robotPc) {
      const mine = checks[at] ?? [];
      const ready = mine.length >= act.checks.length;
      const locked = !(ready && lead.gate && at === open);
      task = '로봇 담당: 준비를 확인하고 실물로 해요.';
      sub = '선생님이 허락하면 버튼이 열려요. 이상하면 바로 [■ 멈추기].';
      work = (
        <>
          <div className={css.sCol}>
            {act.checks.map((c, i) => (
              <button
                key={i}
                type="button"
                className={css.check}
                aria-pressed={mine.includes(i)}
                onClick={() => {
                  const next = mine.includes(i) ? mine.filter((x) => x !== i) : [...mine, i];
                  setChecks((x) => ({ ...x, [at]: next }));
                  if (next.length >= act.checks.length && !(at in realBase)) setRealBase((x) => ({ ...x, [at]: kit.real.doneAt }));
                }}
              >
                <i>{mine.includes(i) ? '✓' : ''}</i>
                {c}
              </button>
            ))}
            <p className={css.note}>{!ready ? '세 가지를 모두 확인하면 "준비 끝" 이 선생님 화면에 보여요.' : lead.gate ? '움직이는 동안 화면 대신 실물 로봇을 봐요.' : '준비 끝 ✓ 선생님이 허락할 때까지 기다려요.'}</p>
            <div className={css.slot} ref={slot} />
          </div>
          <div className={css.sSide}>
            {ranHere ? (
              <Card tone="ok" title="우리 조 실물 결과">
                <p className={css.note}>{kit.real.msg}</p>
              </Card>
            ) : (
              <div className={css.realBox} data-locked={locked || undefined}>
                {locked && <div className={css.lockNote}>🔒 {ready ? '선생님 허락 기다리는 중' : '준비 3가지를 먼저 확인해요'}</div>}
                {kit.real.controls(locked)}
              </div>
            )}
            {!ranHere && kit.real.msg && <p className={css.realMsg}>{kit.real.msg}</p>}
            {kit.real.media}
          </div>
        </>
      );
    } else {
      const picked = answer(at) === '' ? -1 : Number(answer(at));
      const m = sl.mate;
      const mateHere = m && m.lesson === lesson.id && m.step === open;
      task = act.predict.q;
      sub = `실물 버튼은 우리 조 로봇 담당${m ? `(${m.no}번)` : ''}만 눌러요. 예상을 먼저 골라요.`;
      work = (
        <>
          <div className={css.sCenter}>
            <Choices options={act.predict.options} picked={picked} right={null} onPick={(i) => setAnswer(at, pickAnswer(i))} />
            <p className={css.note}>고른 뒤에는 화면 대신 로봇을 봐요.</p>
          </div>
          <div className={css.sSide}>
            <Card title="우리 조 로봇" tone={mateHere && m.robot === 'done' ? 'ok' : undefined}>
              <div className={css.count}>{m ? (mateHere ? ROBOT_WORD[m.robot || 'prep'] : '준비 중') : '로봇 담당 없음'}</div>
              {mateHere && m.result && <p className={css.note}>{m.result}</p>}
              {!m && <p className={css.note}>같은 조에서 한 명이 [로봇 담당] 으로 들어와야 해요.</p>}
            </Card>
          </div>
        </>
      );
    }
  } else {
    const picked = answer(at) === '' ? -1 : Number(answer(at));
    const right = reveal ? act.quiz.answer : null;
    task = `확인 문제: ${act.quiz.q}`;
    work = (
      <div className={css.sCenter}>
        <Flow flow={act.flow} />
        <Choices options={act.quiz.options} picked={picked} right={right} ox={act.quiz.options.length === 2 && act.quiz.options.every((o) => o.length <= 2)} onPick={(i) => setAnswer(at, pickAnswer(i))} />
        {reveal && picked >= 0 && (
          <Card tone={picked === act.quiz.answer ? 'ok' : 'bad'} title={picked === act.quiz.answer ? '맞아요!' : `답은 ${act.quiz.options[act.quiz.answer]} 예요.`}>
            <p className={css.note}>{act.quiz.why}</p>
          </Card>
        )}
      </div>
    );
  }

  const doneHere = at === open ? doneOpen : !!doneAt[at];
  return (
    <div className={css.student}>
      <header className={css.sHead}>
        <span className={css.with}>
          <i />
          선생님과 함께
        </span>
        <span className={css.unitName}>
          {lesson.unit}. {kit.unit.title}
        </span>
        <div className={css.dots} aria-label="단계">
          {lesson.steps.map((s, i) => (
            <button key={i} type="button" disabled={i > open} data-s={i === at ? 'now' : (i === open ? doneOpen : doneAt[i]) ? 'done' : 'todo'} title={s.name} onClick={() => setView({ at: i, when: open })}>
              {i !== at && (i === open ? doneOpen : doneAt[i]) ? '✓' : i + 1}
            </button>
          ))}
        </div>
        <span className={css.sp} />
        <div className={css.who}>
          {no !== null && <span>{no}번</span>}
          {joined.group > 0 && <span>{joined.group}조</span>}
          <span data-robot={robotPc || undefined}>{robotPc ? '로봇 담당' : '화면으로 따라오기'}</span>
        </div>
        <button type="button" className={css.ghost} onClick={sl.leave} title="혼자 하기로 돌아가요 (선생님 수업은 계속돼요)">
          나가기
        </button>
      </header>
      <main className={css.sMain}>
        <div className={css.sTask}>
          <div className={css.n}>{at + 1}</div>
          <div>
            <h2>{task}</h2>
            <p>{sub}</p>
          </div>
        </div>
        <div className={css.sWork}>{work}</div>
      </main>
      <footer className={css.sFoot}>
        <div className={css.state} data-s={doneHere ? 'done' : 'todo'}>
          <i>{doneHere ? '✓' : at + 1}</i>
          <span>
            {doneHere ? (at === open ? '다 했어요. 이제 선생님 화면을 봐요.' : '이 단계는 다 했어요.') : '하는 중'}
            <small>{at === open ? '다음 단계는 선생님이 열어요.' : `지금 반은 ${open + 1}단계예요. 위의 ${open + 1}번을 누르면 돌아가요.`}</small>
          </span>
        </div>
        <span className={css.sp} />
        <button type="button" className={css.helpBtn} aria-pressed={helpOn} onClick={() => setHelp({ step: open, on: !helpOn })}>
          {helpOn ? '✋ 도움 요청함 · 취소' : '✋ 도움이 필요해요'}
        </button>
      </footer>
    </div>
  );
}
