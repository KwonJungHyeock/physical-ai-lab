'use client';

/**
 * Starting and joining a led lesson:
 *  - LeadStart: the teacher picks the class (when logged in to a class server; otherwise the lesson runs
 *    on this PC alone, for the projector) and the lesson (기초교육 1 · 2차시 or one unit).
 *  - LeadInvite: a student's banner on the 교육 tab while the teacher leads a lesson, and LeadJoin, the
 *    dialog that asks for the 조 and whether this PC drives the group's robot.
 */

import { useEffect, useState } from 'react';

import { ClassApiError, LocalLead, serverLead, type ClassInfo, type ClassServerClient, type Lead, type LeadSet } from '@/engine/account';
import { BASIC_PERIODS, LESSONS, LESSON_BY_ID, lessonMinutes } from '@/engine/education/lead';
import { UNIT_BY_ID, type UnitId } from '@/engine/education/practice7';

import type { Joined, LeadSession } from './useLead';
import css from './lead.module.css';

export function LeadStart({ client, unit, onStart, onClose }: { client: ClassServerClient | null; unit: UnitId; onStart(sess: LeadSession, first: LeadSet): void; onClose(): void }) {
  const [classes, setClasses] = useState<ClassInfo[] | null>(client ? null : []);
  const [err, setErr] = useState('');
  const [cls, setCls] = useState<string>('');
  const [lesson, setLesson] = useState(LESSONS.find((l) => l.unit === unit)!.id);

  useEffect(() => {
    if (!client) return;
    let alive = true;
    client.classes().then(
      (r) => {
        if (!alive) return;
        const open = r.classes.filter((c) => !c.archived);
        setClasses(open);
        if (open.length) setCls(open[0].id);
      },
      (e) => {
        if (!alive) return;
        setClasses([]);
        setErr(e instanceof ClassApiError ? e.message : String(e));
      },
    );
    return () => {
      alive = false;
    };
  }, [client]);

  const start = () => {
    const c = classes?.find((x) => x.id === cls);
    const sess: LeadSession = c && client ? { host: serverLead(client, c.id), className: c.name, classId: c.id, total: c.students.length } : { host: new LocalLead(), className: null, classId: null, total: 0 };
    onStart(sess, { lesson, step: 0, gate: false, reveal: false, stop: 0 });
  };

  return (
    <div className={css.dlgBack} role="dialog" aria-modal="true" aria-label="선생님과 함께 수업 시작">
      <div className={css.dlg}>
        <h2>선생님과 함께 수업</h2>
        <p className={css.note}>선생님 화면(프로젝터)이 단계를 열면 학생 화면이 함께 넘어가요. 실물 로봇은 선생님이 허락한 뒤에만 움직여요.</p>

        <h3>학급</h3>
        {classes === null ? (
          <p className={css.note}>학급 목록을 읽는 중…</p>
        ) : (
          <div className={css.opts}>
            {classes.map((c) => (
              <label key={c.id} className={css.opt}>
                <input type="radio" name="lead-class" checked={cls === c.id} onChange={() => setCls(c.id)} />
                <span>
                  <b>{c.name}</b>
                  <small>
                    학급 코드 {c.code} · 학생 {c.students.length}명
                  </small>
                </span>
              </label>
            ))}
            <label className={css.opt}>
              <input type="radio" name="lead-class" checked={cls === ''} onChange={() => setCls('')} />
              <span>
                <b>이 PC 에서만 (프로젝터로 보여 주기)</b>
                <small>{client ? '학생 화면은 따라오지 않아요.' : '학급 서버에 로그인하지 않았어요. 학생 화면을 함께 넘기려면 먼저 교사로 로그인해요 (⚙ → 학급 로그인).'}</small>
              </span>
            </label>
          </div>
        )}
        {err && <p className={css.err}>{err}</p>}

        <h3>수업</h3>
        <div className={css.lessonPick}>
          {BASIC_PERIODS.map((p) => (
            <div key={p.name} className={css.period}>
              <small>{p.name}</small>
              {p.lessons.map((id) => {
                const l = LESSON_BY_ID.get(id)!;
                return (
                  <button key={id} type="button" aria-pressed={lesson === id} onClick={() => setLesson(id)}>
                    7-{l.unit}. {UNIT_BY_ID.get(l.unit)!.title}
                    <small>{lessonMinutes(l)}분</small>
                  </button>
                );
              })}
            </div>
          ))}
          <div className={css.period}>
            <small>검수 수업</small>
            {LESSONS.filter((l) => !BASIC_PERIODS.some((p) => p.lessons.includes(l.id))).map((l) => (
              <button key={l.id} type="button" aria-pressed={lesson === l.id} onClick={() => setLesson(l.id)}>
                7-{l.unit}. {UNIT_BY_ID.get(l.unit)!.title}
                <small>{lessonMinutes(l)}분</small>
              </button>
            ))}
          </div>
        </div>

        <div className={css.dlgFoot}>
          <button type="button" className={css.subBtn} onClick={onClose}>
            닫기
          </button>
          <button type="button" className={css.primary} disabled={classes === null} onClick={start}>
            수업 시작 →
          </button>
        </div>
      </div>
    </div>
  );
}

/** A student's banner while the teacher leads a lesson the student has not joined. */
export function LeadInvite({ lead, onJoin }: { lead: Lead; onJoin(): void }) {
  const l = LESSON_BY_ID.get(lead.lesson);
  return (
    <div className={css.invite} role="status">
      <i />
      <span>
        선생님이 수업을 시작했어요
        {l && (
          <small>
            로봇 실습 7 · {l.unit}. {UNIT_BY_ID.get(l.unit)!.title}
          </small>
        )}
      </span>
      <button type="button" className={css.primary} onClick={onJoin}>
        함께하기 →
      </button>
    </div>
  );
}

export function LeadEnded({ onClose }: { onClose(): void }) {
  return (
    <div className={css.invite} role="status" data-ended>
      <span>선생님이 수업을 끝냈어요. 이제 혼자 해 볼 수 있어요.</span>
      <button type="button" className={css.subBtn} onClick={onClose}>
        확인
      </button>
    </div>
  );
}

const LAST_KEY = 'lead-last-join';

function lastJoin(): Joined {
  try {
    const v = JSON.parse(localStorage.getItem(LAST_KEY) ?? 'null') as Joined | null;
    if (v && typeof v.group === 'number') return v;
  } catch {
    /* none */
  }
  return { group: 0, role: 'screen' };
}

export function LeadJoin({ robotOnline, onJoin, onClose }: { robotOnline: boolean; onJoin(j: Joined): Promise<string | null>; onClose(): void }) {
  const [j, setJ] = useState<Joined>(lastJoin);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const go = async () => {
    try {
      localStorage.setItem(LAST_KEY, JSON.stringify(j));
    } catch {
      /* not remembered */
    }
    setBusy(true);
    setErr((await onJoin(j)) ?? '');
    setBusy(false);
  };
  return (
    <div className={css.dlgBack} role="dialog" aria-modal="true" aria-label="수업에 함께하기">
      <div className={css.dlg} data-small>
        <h2>수업에 함께하기</h2>
        <h3>우리 조</h3>
        <div className={css.groupPick}>
          {Array.from({ length: 8 }, (_, i) => i + 1).map((g) => (
            <button key={g} type="button" aria-pressed={j.group === g} onClick={() => setJ({ ...j, group: g })}>
              {g}조
            </button>
          ))}
          <button type="button" aria-pressed={j.group === 0} onClick={() => setJ({ ...j, group: 0 })}>
            조 없음
          </button>
        </div>
        <h3>이 PC 는</h3>
        <div className={css.opts}>
          <label className={css.opt}>
            <input type="radio" name="lead-role" checked={j.role === 'robot'} onChange={() => setJ({ ...j, role: 'robot' })} />
            <span>
              <b>로봇 담당</b>
              <small>이 PC 로 우리 조 로봇을 움직여요 (조마다 한 명).</small>
            </span>
          </label>
          <label className={css.opt}>
            <input type="radio" name="lead-role" checked={j.role === 'screen'} onChange={() => setJ({ ...j, role: 'screen' })} />
            <span>
              <b>화면으로 따라오기</b>
              <small>실물은 로봇 담당이 움직이고, 나는 예상하고 지켜봐요.</small>
            </span>
          </label>
        </div>
        {err && <p className={css.joinErr}>{err}</p>}
        {j.role === 'robot' && !robotOnline && <p className={css.warn}>아직 로봇이 연결되지 않았어요. 위쪽 [로봇 연결] 로 우리 조 로봇을 연결해 두어요 (실물 단계 전까지).</p>}
        <div className={css.dlgFoot}>
          <button type="button" className={css.subBtn} onClick={onClose}>
            나중에
          </button>
          <button type="button" className={css.primary} disabled={busy} onClick={() => void go()}>
            함께하기 →
          </button>
        </div>
      </div>
    </div>
  );
}
