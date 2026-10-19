'use client';

/**
 * One class in 학급 관리: its code and the address students open, then four tabs —
 *  - 실시간 현황: every student's place now and flags (막힘 · 쉬는 중 · 오프라인 · 잠김), polled every 4 s
 *    from the class's event feed (engine/account/live.ts) and the server's /live (PIN locks, heartbeats);
 *  - 학생 · PIN: issue students (the cards print at once), reset a PIN, remove a student;
 *  - 차시 열기: all lessons, or the 차시 picked (by 단원);
 *  - 이름표: the 번호 ↔ 이름 list, kept in this browser only.
 * The class's tools: export (CSV for Excel), log every student out, archive, and (archived) delete.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';

import {
  applyStatements,
  browserStore,
  clearRoster,
  createLiveState,
  flagCounts,
  joinLink,
  liveRows,
  loadRoster,
  loginCards,
  markSeen,
  parseRosterText,
  rosterCsv,
  saveRoster,
  withNames,
  type ClassInfo,
  type ClassServerClient,
  type LiveFlag,
  type LiveRow,
  type LoginCard,
  type Roster,
} from '@/engine/account';
import { CATEGORIES, TOPICS } from '@/engine/education/catalog';
import { UNITS, realBrief, unitOfLesson } from '@/engine/education/practice7';

import LoginCards from './LoginCards';
import { FLAG_TEXT, ago, clock, placeText } from './labels';
import css from './account.module.css';

type Tab = 'live' | 'students' | 'lessons' | 'names';

const TABS: { id: Tab; name: string }[] = [
  { id: 'live', name: '실시간 현황' },
  { id: 'students', name: '학생 · PIN' },
  { id: 'lessons', name: '차시 열기' },
  { id: 'names', name: '이름표' },
];

/** A file to the downloads folder. */
function saveFile(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 60000); // an iPad asks before saving: the link must outlive the question
}

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
};

interface Props {
  cls: ClassInfo;
  client: ClassServerClient;
  /** The class server as this page reaches it. */
  server: string;
  /** Its LAN addresses (what students open), when known. */
  addresses: readonly string[];
  onChanged(c: ClassInfo): void;
  onDeleted(): void;
  onError(e: unknown): void;
}

export default function ClassPanel({ cls, client, server, addresses, onChanged, onDeleted, onError }: Props) {
  const [tab, setTab] = useState<Tab>(cls.students.length ? 'live' : 'students');
  const [roster, setRoster] = useState<Roster>({});
  useEffect(() => {
    // The teacher's names for this class (this browser only; read after hydration).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRoster(loadRoster(browserStore(), cls.id));
  }, [cls.id]);
  const [cards, setCards] = useState<{ title: string; cards: LoginCard[] } | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<'logout' | 'archive' | 'delete' | null>(null);
  const [typed, setTyped] = useState('');

  // The address students open: the LAN address when the teacher is on the server PC itself.
  const loopback = /^https?:\/\/(127\.|localhost|\[::1\])/.test(server);
  const link = !loopback ? joinLink(server, cls.code) : addresses.length ? joinLink(addresses[0], cls.code) : null;

  const run = async (f: () => Promise<string | void>) => {
    try {
      const m = await f();
      if (m) setNote(m);
    } catch (e) {
      onError(e);
    }
  };
  useEffect(() => {
    if (!note) return;
    const id = window.setTimeout(() => setNote(null), 6000);
    return () => window.clearTimeout(id);
  }, [note]);

  const exportCsv = () =>
    run(async () => {
      saveFile(`class-${cls.code}-${today()}.csv`, await client.exportClass(cls.id, 'csv'), 'text/csv;charset=utf-8');
      return '기록을 CSV 파일로 받았어요 (엑셀에서 열려요). 이름은 들어가지 않아요. 번호로 봐요.';
    });

  return (
    <section className={css.panel} aria-label={`${cls.name} 학급`}>
      <header className={css.panelHead}>
        <div className={css.panelTitle}>
          <h2>
            {cls.name}
            {cls.archived && <em className={css.badge}>보관됨</em>}
          </h2>
          <p>
            학급 코드 <b className={`${css.mono} ${css.code}`}>{cls.code}</b> · 학생 {cls.students.length}명
          </p>
          {link ? (
            <p className={css.joinLine}>
              학생 접속 주소 <span className={css.mono}>{link}</span>
              <button
                type="button"
                className={css.linkBtn}
                onClick={() =>
                  void navigator.clipboard?.writeText(link).then(
                    () => setNote('접속 주소를 복사했어요.'),
                    () => setNote('복사하지 못했어요. 주소를 직접 적어 주세요.'),
                  )
                }
              >
                복사
              </button>
            </p>
          ) : (
            <p className={css.joinLine}>학생 접속 주소: 이 PC 가 네트워크에 연결돼 있지 않아요. 와이파이에 연결한 뒤 학급 서버 창에 보이는 주소를 학생들에게 알려 주세요.</p>
          )}
        </div>
        <div className={css.panelTools}>
          <button type="button" className={css.ghostBtn} onClick={() => void exportCsv()} title="이 학급의 학습 기록 전부 (번호 · 시각 · 한 일 · 결과)">
            기록 내보내기 (CSV)
          </button>
          {!cls.archived && (
            <button type="button" className={css.ghostBtn} onClick={() => setConfirm('logout')} title="수업이 끝나면 공용 PC 의 학생 로그인을 모두 끝내요">
              학생 모두 로그아웃
            </button>
          )}
          {!cls.archived && (
            <button type="button" className={css.ghostBtn} onClick={() => setConfirm('archive')} title="학년이 끝나면: 기록은 남기고 로그인만 막아요">
              학급 보관
            </button>
          )}
          {cls.archived && (
            <>
              <button
                type="button"
                className={css.ghostBtn}
                onClick={() =>
                  void run(async () => {
                    onChanged(await client.setArchived(cls.id, false));
                    return '보관을 풀었어요.';
                  })
                }
              >
                보관 풀기
              </button>
              <button type="button" className={css.dangerGhost} onClick={() => setConfirm('delete')}>
                학급 삭제…
              </button>
            </>
          )}
        </div>
      </header>

      {confirm && (
        <div className={css.confirm} role="alertdialog" aria-label="확인">
          {confirm === 'logout' && <p>이 학급 학생들의 로그인을 모두 끝낼까요? 학생 PC 의 기록은 다음에 로그인하면 이어서 보내요.</p>}
          {confirm === 'archive' && <p>학급을 보관할까요? 기록은 그대로 볼 수 있고 내보낼 수 있어요. 학생들은 더 이상 로그인할 수 없어요.</p>}
          {confirm === 'delete' && (
            <p>
              학년말 삭제: 이 학급과 학생 기록이 <b>모두 지워지고 되돌릴 수 없어요</b> (클라우드 동기화를 켰다면 클라우드에도 삭제 요청이 가요). 지우려면 학급 코드{' '}
              <b className={css.mono}>{cls.code}</b> 를 그대로 적어요.
              <input className={css.mono} value={typed} onChange={(e) => setTyped(e.target.value.toUpperCase())} aria-label="학급 코드 확인" autoFocus />
            </p>
          )}
          <span className={css.formBtns}>
            <button
              type="button"
              className={css.ghostBtn}
              onClick={() => {
                setConfirm(null);
                setTyped('');
              }}
            >
              취소
            </button>
            <button
              type="button"
              className={confirm === 'delete' ? css.dangerBtn : css.primaryBtn}
              disabled={confirm === 'delete' && typed !== cls.code}
              onClick={() => {
                const what = confirm;
                setConfirm(null);
                setTyped('');
                void run(async () => {
                  if (what === 'logout') return `학생 ${(await client.logoutAll(cls.id)).ended}명의 로그인을 끝냈어요.`;
                  if (what === 'archive') {
                    onChanged(await client.setArchived(cls.id, true));
                    return '학급을 보관했어요.';
                  }
                  await client.deleteClass(cls.id, cls.code);
                  clearRoster(browserStore(), cls.id);
                  onDeleted();
                });
              }}
            >
              {confirm === 'logout' ? '모두 로그아웃' : confirm === 'archive' ? '보관하기' : '영구 삭제'}
            </button>
          </span>
        </div>
      )}
      {note && (
        <p className={css.ok} role="status">
          {note}
        </p>
      )}

      <div className={css.panelTabs} role="tablist" aria-label="학급 관리 화면">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}>
            {t.name}
          </button>
        ))}
      </div>

      {tab === 'live' && (
        <LiveGrid
          cls={cls}
          client={client}
          roster={roster}
          onError={onError}
          onReset={(no) =>
            void run(async () => {
              const r = await client.resetPin(cls.id, no);
              setCards({ title: `${cls.name} · ${no}번 새 PIN`, cards: loginCards(cls, [r], roster, link) });
            })
          }
        />
      )}
      {tab === 'students' && (
        <StudentsTab
          cls={cls}
          roster={roster}
          onIssue={(n) =>
            run(async () => {
              const r = await client.issueStudents(cls.id, n);
              onChanged(await client.classInfo(cls.id));
              setCards({ title: `${cls.name} · 학생 ${r.issued.length}명 로그인 카드`, cards: loginCards(cls, r.issued, roster, link) });
            })
          }
          onReset={(no) =>
            run(async () => {
              const r = await client.resetPin(cls.id, no);
              setCards({ title: `${cls.name} · ${no}번 새 PIN`, cards: loginCards(cls, [r], roster, link) });
            })
          }
          onRemove={(no) =>
            run(async () => {
              await client.removeStudent(cls.id, no);
              onChanged(await client.classInfo(cls.id));
              return `${no}번 학생과 그 기록을 지웠어요.`;
            })
          }
        />
      )}
      {tab === 'lessons' && (
        <LessonsTab
          key={cls.openLessons.join(',')}
          open={cls.openLessons}
          disabled={cls.archived}
          onSave={(open) =>
            run(async () => {
              onChanged(await client.setOpenLessons(cls.id, open));
              return '저장했어요. 학생 화면에는 15초 안에 반영돼요.';
            })
          }
        />
      )}
      {tab === 'names' && (
        <NamesTab
          key={cls.id}
          cls={cls}
          roster={roster}
          onSave={(r) => {
            saveRoster(browserStore(), cls.id, r);
            setRoster(r);
            setNote('이름표를 이 PC 에 저장했어요.');
          }}
          onClear={() => {
            clearRoster(browserStore(), cls.id);
            setRoster({});
            setNote('이 PC 에서 이름표를 지웠어요.');
          }}
        />
      )}

      {cards && <LoginCards title={cards.title} cards={cards.cards} onClose={() => setCards(null)} />}
    </section>
  );
}

/* --- 실시간 현황 --------------------------------------------------------------------------------- */

type Filter = 'all' | 'active' | LiveFlag;
const FILTERS: Filter[] = ['all', 'active', 'stuck', 'idle', 'offline', 'never', 'locked'];

/** The row's state, worst first (what the card is coloured by). */
const toneOf = (r: LiveRow): string => (r.flags.includes('locked') ? 'locked' : r.flags.includes('stuck') ? 'stuck' : (r.flags.find((f) => f === 'never' || f === 'offline' || f === 'idle') ?? 'active'));

function LiveGrid({ cls, client, roster, onError, onReset }: { cls: ClassInfo; client: ClassServerClient; roster: Roster; onError(e: unknown): void; onReset(no: number): void }) {
  const [rows, setRows] = useState<LiveRow[] | null>(null);
  const [now, setNow] = useState(0);
  const [filter, setFilter] = useState<Filter>('all');
  const [lost, setLost] = useState(false);
  const errRef = useRef(onError);
  useEffect(() => {
    errRef.current = onError;
  });
  const nos = cls.students.join(',');
  useEffect(() => {
    let stop = false;
    let timer = 0;
    const state = createLiveState();
    const students = nos ? nos.split(',').map(Number) : [];
    const tick = async () => {
      try {
        // The feed after what is already applied (in pages of 5000).
        for (let i = 0; i < 50; i++) {
          const r = await client.events(cls.id, state.lastSeq);
          applyStatements(state, r.statements);
          if (r.statements.length < 5000) break;
        }
        const lv = await client.live(cls.id);
        for (const st of lv.students) if (st.lastSeen) markSeen(state, st.no, st.lastSeen);
        const locked = lv.students.filter((st) => st.flags.includes('locked')).map((st) => st.no);
        if (!stop) {
          setRows(liveRows(state, students, lv.now, {}, locked));
          setNow(lv.now);
          setLost(false);
        }
      } catch (e) {
        if (!stop) {
          setLost(true);
          errRef.current(e);
        }
      }
      if (!stop) timer = window.setTimeout(() => void tick(), 4000);
    };
    void tick();
    return () => {
      stop = true;
      window.clearTimeout(timer);
    };
  }, [client, cls.id, nos]);

  const named = useMemo(() => withNames(rows ?? [], roster), [rows, roster]);
  const counts = useMemo(() => flagCounts(rows ?? []), [rows]);
  if (!cls.students.length) return <p className={css.emptyLine}>아직 학생이 없어요. [학생 · PIN] 에서 학생 계정을 만들어요.</p>;
  if (!rows) return <p className={css.emptyLine}>현황을 불러오는 중…</p>;
  const shown = named.filter((r) => filter === 'all' || (filter === 'active' ? toneOf(r) === 'active' : r.flags.includes(filter)));
  return (
    <div className={css.live}>
      <div className={css.counts} role="group" aria-label="상태별로 보기">
        {FILTERS.map((f) => {
          const n = f === 'all' ? rows.length : counts[f];
          if (f !== 'all' && f !== 'active' && n === 0) return null;
          return (
            <button key={f} type="button" data-tone={f} aria-pressed={filter === f} onClick={() => setFilter(f)}>
              {f === 'all' ? '전체' : FLAG_TEXT[f]} <b>{n}</b>
            </button>
          );
        })}
        <span className={css.liveNote} data-lost={lost || undefined}>
          {lost ? '학급 서버와 연결이 끊겼어요 · 다시 시도하는 중' : '4초마다 새로 고쳐요'}
        </span>
      </div>
      {shown.length === 0 ? (
        <p className={css.emptyLine}>이 상태의 학생이 없어요.</p>
      ) : (
        <ul className={css.grid}>
          {shown.map((r) => {
            const tone = toneOf(r);
            return (
              <li key={r.no} className={css.stu} data-tone={tone}>
                <header>
                  <b className={css.stuNo}>{r.no}</b>
                  <span className={css.stuName}>{r.name ?? `${r.no}번`}</span>
                  <em className={css.flag} data-tone={tone}>
                    {FLAG_TEXT[tone as LiveFlag | 'active']}
                  </em>
                </header>
                <p className={css.place}>{r.flags.includes('never') ? '아직 로그인하지 않았어요' : placeText(r.place)}</p>
                <p className={css.meta}>
                  {r.lastActivity ? `마지막 활동 ${ago(r.lastActivity, now)}` : r.lastSeen ? `접속 ${ago(r.lastSeen, now)}` : '기록 없음'} · 마침 {r.completed} · 통과 {r.passed}
                  {r.hintsHere > 0 ? ` · 힌트 ${r.hintsHere}` : ''}
                </p>
                {r.robot[0] && (
                  <p className={css.realLine} data-demo={r.robot[0].demo || undefined} title={r.robot[0].text}>
                    실물 {robotBrief(r.robot[0])}
                    {r.robot[0].demo ? ' (데모)' : ''} · {ago(r.robot[0].at, now)}
                  </p>
                )}
                {r.stuckOn.slice(0, 2).map((x) => (
                  <p key={x.object} className={css.stuck}>
                    {placeText(x.place)}: {x.fails}번 실패
                  </p>
                ))}
                {r.flags.includes('locked') && (
                  <button type="button" className={css.smallBtn} onClick={() => onReset(r.no)}>
                    PIN 다시 발급 (잠금 풀기)
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <RealTable rows={named} />
    </div>
  );
}

type RobotEntry = LiveRow['robot'][number];

/** A real-robot result in a few words ("7-2 폭 0.8 mm"). */
function robotBrief(x: RobotEntry): string {
  const unit = x.place.kind === 'lesson' ? unitOfLesson(x.place.lesson) : null;
  return unit ? `7-${unit} ${realBrief(unit, x.values)}` : placeText(x.place);
}

/**
 * 로봇 실습 7 · 실물 결과: who did which acceptance check on the real robot and what it measured (the
 * values the student's screen sent). Shown once any student has one; a demo robot server's results
 * are marked, not counted as the real arm.
 */
function RealTable({ rows }: { rows: readonly (LiveRow & { name?: string | null })[] }) {
  const withReal = rows.filter((r) => r.robot.some((x) => x.place.kind === 'lesson' && unitOfLesson(x.place.lesson)));
  if (!withReal.length) return null;
  const cell = (r: LiveRow, unit: number) => r.robot.find((x) => x.place.kind === 'lesson' && unitOfLesson(x.place.lesson) === unit);
  const doneBy = (unit: number) => withReal.filter((r) => cell(r, unit) && !cell(r, unit)!.demo).length;
  return (
    <section className={css.real} aria-label="로봇 실습 7 실물 결과">
      <h3>
        로봇 실습 7 · 실물 결과 <small>학생 화면이 잰 값 · 마지막 한 번</small>
      </h3>
      <div className={css.realScroll}>
        <table className={css.table}>
          <thead>
            <tr>
              <th>번호</th>
              {UNITS.map((u) => (
                <th key={u.id} title={u.title}>
                  7-{u.id} {u.title}
                  <small>{doneBy(u.id)}명</small>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {withReal.map((r) => (
              <tr key={r.no}>
                <td className={css.num}>
                  {r.no}
                  {r.name ? <small> {r.name}</small> : null}
                </td>
                {UNITS.map((u) => {
                  const x = cell(r, u.id);
                  return (
                    <td key={u.id} className={css.realCell} data-demo={x?.demo || undefined} title={x ? `${clock(x.at)} · ${x.text}${x.demo ? ' (데모 로봇 서버: 연습)' : ''}` : undefined}>
                      {x ? (
                        <>
                          {realBrief(u.id, x.values)}
                          {x.demo && <em>데모</em>}
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* --- 학생 · PIN ---------------------------------------------------------------------------------- */

function StudentsTab({
  cls,
  roster,
  onIssue,
  onReset,
  onRemove,
}: {
  cls: ClassInfo;
  roster: Roster;
  onIssue(n: number): Promise<void>;
  onReset(no: number): Promise<void>;
  onRemove(no: number): Promise<void>;
}) {
  const [count, setCount] = useState('');
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<number | null>(null);
  const next = cls.students.length ? Math.max(...cls.students) + 1 : 1;
  const n = Number(count);
  const ok = Number.isInteger(n) && n >= 1 && n <= 60 && next + n - 1 <= 99;
  const issue = async (e: FormEvent) => {
    e.preventDefault();
    if (!ok) return;
    setBusy(true);
    await onIssue(n);
    setBusy(false);
    setCount('');
  };
  const sorted = [...cls.students].sort((a, b) => a - b);
  return (
    <div className={css.tabBody}>
      {!cls.archived && (
        <form className={css.issue} onSubmit={issue}>
          <label>
            <span>학생</span>
            <input value={count} onChange={(e) => setCount(e.target.value.replace(/\D/g, '').slice(0, 2))} inputMode="numeric" placeholder="25" aria-label="새로 만들 학생 수" />
            <span>명 새로 만들기</span>
          </label>
          <button type="submit" className={css.primaryBtn} disabled={!ok || busy}>
            {busy ? '만드는 중…' : '계정 만들고 카드 보기'}
          </button>
          <small>
            번호는 {next}번부터 이어서 매겨요 (한 번에 60명, 번호는 99번까지). PIN 은 만든 직후 한 번만 보여요. 카드를 바로 인쇄해요.
          </small>
        </form>
      )}
      {sorted.length === 0 ? (
        <p className={css.emptyLine}>아직 학생이 없어요.</p>
      ) : (
        <table className={css.table}>
          <thead>
            <tr>
              <th>번호</th>
              <th>이름 (이 PC)</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {sorted.map((no) => (
              <tr key={no}>
                <td className={css.num}>{no}</td>
                <td>{roster[no] ?? <span className={css.muted}>—</span>}</td>
                <td className={css.rowBtns}>
                  {removing === no ? (
                    <>
                      <span className={css.warnText}>기록도 모두 지워져요.</span>
                      <button type="button" className={css.smallBtn} onClick={() => setRemoving(null)}>
                        취소
                      </button>
                      <button
                        type="button"
                        className={css.smallDanger}
                        onClick={() => {
                          setRemoving(null);
                          void onRemove(no);
                        }}
                      >
                        삭제
                      </button>
                    </>
                  ) : (
                    <>
                      <button type="button" className={css.smallBtn} onClick={() => void onReset(no)} disabled={cls.archived}>
                        PIN 다시 발급
                      </button>
                      <button type="button" className={css.smallBtn} onClick={() => setRemoving(no)}>
                        삭제…
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/* --- 차시 열기 ----------------------------------------------------------------------------------- */

function LessonsTab({ open, disabled, onSave }: { open: readonly string[]; disabled: boolean; onSave(open: string[]): Promise<void> }) {
  const [all, setAll] = useState(open.includes('*'));
  const [picked, setPicked] = useState<Set<string>>(() => new Set(open.filter((x) => x !== '*')));
  const [busy, setBusy] = useState(false);
  const toggle = useCallback((ids: string[], on: boolean) => {
    setPicked((p) => {
      const next = new Set(p);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }, []);
  const save = async () => {
    setBusy(true);
    await onSave(all ? ['*'] : TOPICS.filter((t) => picked.has(t.id)).map((t) => t.id));
    setBusy(false);
  };
  const changed = all !== open.includes('*') || (!all && (picked.size !== open.length || open.some((x) => !picked.has(x))));
  return (
    <div className={css.tabBody}>
      <div className={css.choice} role="radiogroup" aria-label="열 차시">
        <label data-on={all || undefined}>
          <input type="radio" name="open-all" checked={all} onChange={() => setAll(true)} disabled={disabled} />
          <span>
            <b>모든 차시 열기</b>
            <small>학생이 28차시를 모두 열 수 있어요.</small>
          </span>
        </label>
        <label data-on={!all || undefined}>
          <input type="radio" name="open-all" checked={!all} onChange={() => setAll(false)} disabled={disabled} />
          <span>
            <b>고른 차시만 열기</b>
            <small>오늘 수업할 차시만 열어요. 닫힌 차시는 학생 화면에 &quot;선생님이 아직 열지 않은 차시&quot;로 보여요.</small>
          </span>
        </label>
      </div>
      {!all && (
        <div className={css.units}>
          {CATEGORIES.map((c) => {
            const ids = TOPICS.filter((t) => t.cat === c.id).map((t) => t.id);
            const n = ids.filter((id) => picked.has(id)).length;
            return (
              <fieldset key={c.id} className={css.unit} disabled={disabled}>
                <legend>
                  <label>
                    <input
                      type="checkbox"
                      checked={n === ids.length}
                      ref={(el) => {
                        if (el) el.indeterminate = n > 0 && n < ids.length;
                      }}
                      onChange={(e) => toggle(ids, e.target.checked)}
                    />
                    {c.id}단원 {c.title}
                    <small>
                      {n}/{ids.length}
                    </small>
                  </label>
                </legend>
                {TOPICS.filter((t) => t.cat === c.id).map((t) => (
                  <label key={t.id} className={css.topicPick} data-on={picked.has(t.id) || undefined}>
                    <input type="checkbox" checked={picked.has(t.id)} onChange={(e) => toggle([t.id], e.target.checked)} />
                    <b>{t.id}</b> {t.title}
                  </label>
                ))}
              </fieldset>
            );
          })}
        </div>
      )}
      <div className={css.saveRow}>
        <span className={css.muted}>{all ? '지금: 모든 차시' : `고른 차시 ${picked.size}개`}</span>
        <button type="button" className={css.primaryBtn} disabled={disabled || busy || !changed} onClick={() => void save()}>
          {busy ? '저장하는 중…' : '저장'}
        </button>
      </div>
    </div>
  );
}

/* --- 이름표 -------------------------------------------------------------------------------------- */

const rosterText = (r: Roster) =>
  Object.keys(r)
    .map(Number)
    .sort((a, b) => a - b)
    .map((no) => `${no},${r[no]}`)
    .join('\n');

function NamesTab({ cls, roster, onSave, onClear }: { cls: ClassInfo; roster: Roster; onSave(r: Roster): void; onClear(): void }) {
  const [text, setText] = useState(() => rosterText(roster));
  const [errors, setErrors] = useState<string[]>([]);
  const save = () => {
    const r = parseRosterText(text);
    setErrors(r.errors);
    onSave(r.roster);
    setText(rosterText(r.roster));
  };
  const count = Object.keys(roster).length;
  return (
    <div className={css.tabBody}>
      <p className={css.privacy}>
        <b>이름은 이 PC 에만 저장돼요.</b> 학급 서버와 클라우드에는 번호만 가요. 이 PC 의 학급 관리 화면과 로그인 카드에만 이름이 보여요.
      </p>
      <label className={css.field}>
        <span>
          한 줄에 한 명 · <code>번호,이름</code> (엑셀에서 두 칸을 복사해 붙여 넣어도 돼요)
        </span>
        <textarea className={css.namesBox} value={text} onChange={(e) => setText(e.target.value)} rows={12} placeholder={'1,김민준\n2,이서연\n3,박지호'} spellCheck={false} />
      </label>
      {errors.length > 0 && (
        <ul className={css.errorList} role="alert">
          {errors.slice(0, 8).map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      <div className={css.saveRow}>
        <span className={css.muted}>
          저장된 이름 {count}명{cls.students.length ? ` · 학생 ${cls.students.length}명` : ''}
        </span>
        <span className={css.formBtns}>
          {count > 0 && (
            <>
              <button type="button" className={css.ghostBtn} onClick={() => saveFile(`names-${cls.code}.csv`, rosterCsv(roster), 'text/csv;charset=utf-8')}>
                CSV 로 받기
              </button>
              <button type="button" className={css.ghostBtn} onClick={onClear}>
                이 PC 에서 지우기
              </button>
            </>
          )}
          <button type="button" className={css.primaryBtn} onClick={save}>
            이름표 저장
          </button>
        </span>
      </div>
    </div>
  );
}
