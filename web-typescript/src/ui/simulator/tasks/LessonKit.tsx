'use client';

/**
 * 교실 수업형 (입문 트랙 · 로봇 카페): the screens a class runs on, read from one source
 * (engine/simulator/cell/lessons.ts) so the app and the 교안 keep the same order and page numbers.
 *
 *  - LessonPlate: under the quest, the 차시 open now — 오늘 배울 것 (✓ as quests pass), its 교안 pages,
 *    the 확인 문제 and the 학습 기록;
 *  - LessonCheck: the 차시's three 확인 문제 (객관식, graded at once, the first answer kept);
 *  - RecordPanel: the 학습 기록 (LMS): 번호 · 이름, per 차시 quests · tries · minutes · 확인 · 3단계 기준,
 *    the 기록지 to print (PDF) and the file to hand in;
 *  - TeacherKey (⚙ 설정): the plan (4 · 6 · 8 차시), the 차시 open now, every quest open, the class link,
 *    the projector screen, the class's files into one table (and a CSV), this computer's record cleared;
 *  - Projector: the 차시 on the classroom screen — goals, quests and pages, the link, the answers.
 */

import { useMemo, useState } from 'react';

import { missionById } from '@/engine/simulator/cell/missions';
import { LESSON_QUEST, PLAN_SIZES, RUBRIC, SITES, SITE_NAME, checksOf, guidePagesOf, lessonsOf, type Lesson, type SiteId } from '@/engine/simulator/cell/lessons';
import { classCsv, classLink, lessonCount, mergeRecords, minutesOf, parseRecord, recordFile, summaryOf, type LessonRecord, type TeacherSet } from '@/engine/simulator/cell/lessonRecord';

import css from './lessonKit.module.css';

const MARK = ['①', '②', '③', '④'];
const pages = (a: number, b: number) => (a === b ? `교안 ${a}쪽` : `교안 ${a}–${b}쪽`);
export const questPages = (id: string) => {
  const q = LESSON_QUEST[id];
  return q ? pages(q.pages[0], q.pages[1]) : undefined;
};
/** A place's name, short (카페 · 캘리그라피 · 보드게임). */
const short = (site: SiteId) => SITE_NAME[site].replace(/^로봇 | 로봇$/g, '');
const questName = (id: string) => {
  const m = missionById(id);
  return m ? `퀘스트 ${m.n} ${m.title.replace(/^[^:]+:\s*/, '')}` : id;
};

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/* --- 차시 판 ------------------------------------------------------------------------------ */

export function LessonPlate({ lesson, total, rec, onCheck, onRecord }: { lesson: Lesson; total: number; rec: LessonRecord; onCheck(): void; onRecord(): void }) {
  const done = lesson.quests.filter((q) => rec.quests[q]?.passed).length;
  const asks = checksOf(rec.plan, lesson.n, lesson.site);
  const got = asks.filter((a) => rec.checks[a.key]);
  const right = got.filter((a) => rec.checks[a.key].ok).length;
  const ready = done === lesson.quests.length;
  return (
    <section className={css.plate} aria-label={`${lesson.n}차시 오늘 배울 것`}>
      <header>
        <em>LESSON</em>
        <b>
          {lesson.n}차시
          <small>
            {' '}
            / {total} · {short(lesson.site)}
          </small>
        </b>
        <span className={css.page}>{pages(lesson.pages[0], lesson.pages[1])}</span>
      </header>
      {/* What the 차시 teaches is the 교안's (its pages above); the quests' progress is the quest track's, above. */}
      <div className={css.row}>
        <button
          type="button"
          className={css.key}
          data-on={ready && got.length < asks.length ? '' : undefined}
          // Open at any time (the teacher says when, in the 정리): before every quest is passed, asked once.
          onClick={() => {
            if (!ready && !got.length && !window.confirm(`이 차시 퀘스트를 ${done}/${lesson.quests.length}개 통과했어요. 그래도 확인 문제를 풀까요?`)) return;
            onCheck();
          }}
          title="차시 확인 문제 3개 (수행평가)"
        >
          {got.length === asks.length ? `확인 문제 ${right}/${asks.length} 맞힘` : got.length ? `확인 문제 이어 풀기 (${got.length}/${asks.length})` : '확인 문제 풀기 (3문제)'}
        </button>
        <button type="button" className={css.ghost} onClick={onRecord}>
          학습 기록
        </button>
      </div>
    </section>
  );
}

/* --- 확인 문제 ---------------------------------------------------------------------------- */

/** `bare` (입문 트랙, 지시서 v1): the question is read in the PDF 수업자료; here only its number and ① ② ③ to answer. */
export function LessonCheck({ rec, site, n, onAnswer, onClose, bare }: { rec: LessonRecord; site: SiteId; n: number; onAnswer(key: string, chosen: number): void; onClose(): void; bare?: boolean }) {
  const asks = useMemo(() => checksOf(rec.plan, n, site), [rec.plan, n, site]);
  const first = asks.findIndex((a) => !rec.checks[a.key]);
  const [at, setAt] = useState(first < 0 ? asks.length : first);
  const a = asks[at];
  const mine = a ? rec.checks[a.key] : undefined;
  const right = asks.filter((x) => rec.checks[x.key]?.ok).length;
  return (
    <>
      <div className={css.scrim} aria-hidden="true" />
      <div className={css.modal} role="dialog" aria-modal="true" aria-label={`${n}차시 확인 문제`}>
        <header className={css.mHead}>
          <em>CHECK</em>
          <b>
            {short(site)} {n}차시 확인 문제
          </b>
          <span className={css.dots}>
            {asks.map((x, i) => (
              <i key={x.key} data-cur={i === at || undefined} data-ok={rec.checks[x.key]?.ok || undefined} data-no={(rec.checks[x.key] && !rec.checks[x.key].ok) || undefined} />
            ))}
          </span>
          <button type="button" className={css.x} onClick={onClose} aria-label="닫기">
            ×
          </button>
        </header>
        {a ? (
          <div className={css.ask}>
            <p className={css.q}>
              <span>{at + 1}.</span> {bare ? `교안의 ${at + 1}번 문제를 읽고 답을 골라요` : a.q}
            </p>
            <div className={css.opts} data-bare={bare || undefined}>
              {a.options.map((o, k) => (
                <button
                  key={o}
                  type="button"
                  disabled={!!mine}
                  data-pick={mine?.chosen === k || undefined}
                  data-right={mine && k === a.answer ? '' : undefined}
                  onClick={() => onAnswer(a.key, k)}
                  aria-label={bare ? `${k + 1}번` : undefined}
                >
                  <i>{MARK[k]}</i>
                  {!bare && o}
                </button>
              ))}
            </div>
            {mine && (
              <p className={css.why} data-ok={mine.ok || undefined}>
                <b>{mine.ok ? '맞았어요' : '아니에요'}</b> 정답 {MARK[a.answer]}
                {!bare && ` · ${a.why}`}
              </p>
            )}
            <div className={css.row}>
              <small>처음 고른 답이 학습 기록에 남아요 · {questName(a.key.split('.')[0])}</small>
              <button type="button" className={css.key} disabled={!mine} onClick={() => setAt(at + 1)}>
                {at + 1 < asks.length ? '다음 문제' : '결과 보기'}
              </button>
            </div>
          </div>
        ) : (
          <div className={css.ask}>
            <p className={css.score}>
              <b>
                {right} / {asks.length}
              </b>
              맞혔어요
            </p>
            <ol className={css.review}>
              {asks.map((x, i) => (
                <li key={x.key} data-ok={rec.checks[x.key]?.ok || undefined}>
                  <i>{rec.checks[x.key]?.ok ? '✓' : '✗'}</i>
                  {i + 1}. {bare ? `${i + 1}번 문제` : x.q}{' '}
                  <small>
                    정답 {MARK[x.answer]} {!bare && x.options[x.answer]}
                  </small>
                </li>
              ))}
            </ol>
            <div className={css.row}>
              <button type="button" className={css.ghost} onClick={() => setAt(0)}>
                처음부터 다시 보기
              </button>
              <button type="button" className={css.key} onClick={onClose}>
                닫기
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

/* --- 학습 기록 (LMS) ----------------------------------------------------------------------- */

function sheetHtml(rec: LessonRecord): string {
  const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);
  // Each place the student has begun (or the café, when nothing yet): its 차시, its totals.
  const begun = SITES.filter((site) => summaryOf(rec, rec.plan, site).lessons.some((l) => l.started));
  const sites = begun.length ? begun : (['cafe'] as SiteId[]);
  const parts = sites
    .map((site) => {
      const s = summaryOf(rec, rec.plan, site);
      const rows = s.lessons
        .map((l) => {
          const qs = l.quests
            .map((q) => {
              const r = rec.quests[q];
              const min = minutesOf(r);
              return `<div>${r?.passed ? '✓' : '·'} ${esc(questName(q))} <span>${r ? `시도 ${r.tries}${min ? ` · ${min}분` : ''}` : '안 함'}</span></div>`;
            })
            .join('');
          return `<tr><td>${l.n}차시</td><td>${qs}</td><td>${l.right} / ${l.asked}${l.checked ? '' : ' (덜 풂)'}</td><td>${l.level ?? (l.started ? '진행 중' : '-')}</td></tr>`;
        })
        .join('');
      const goals = s.lessons.map((l) => `<li><b>${l.n}차시</b> ${l.quests.map((q) => esc(LESSON_QUEST[q].learn)).join(' / ')}</li>`).join('');
      return `<h2>${SITE_NAME[site]}</h2>
<table><tr><th style="width:60px">차시</th><th>퀘스트 (통과 ✓ · 시도 · 걸린 시간)</th><th style="width:90px">확인 문제</th><th style="width:60px">기준</th></tr>${rows}</table>
<p class="tot">퀘스트 ${s.passed} / ${s.total} 통과 · 확인 문제 ${s.right} / ${s.asked} 맞힘 · 기준 ${s.level ?? '아직 없음'}</p>
<p class="goal">학습 목표</p><ul>${goals}</ul>`;
    })
    .join('');
  const rub = RUBRIC.map((r) => `<li><b>${r.level}</b> ${esc(r.text)}</li>`).join('');
  const day = new Date().toLocaleDateString('ko-KR');
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>생활 로봇 학습 기록지</title><style>
@page{size:A4;margin:14mm}body{font-family:'Noto Sans KR','Malgun Gothic',sans-serif;color:#111;font-size:12.5px;word-break:keep-all}
h1{font-size:20px;margin:0 0 4px}.who{display:flex;gap:18px;border-bottom:2px solid #111;padding-bottom:6px;margin-bottom:10px}
table{width:100%;border-collapse:collapse;margin:8px 0}th,td{border:1px solid #999;padding:6px;vertical-align:top;text-align:left}th{background:#eee}
td div{margin:2px 0}td span{color:#555;font-size:11px}h2{font-size:15px;margin:16px 0 4px}ul{margin:0;padding-left:18px}li{margin:2px 0}
.tot{font-size:13px;font-weight:700;margin:4px 0}.goal{font-weight:700;margin:6px 0 2px}.sign{margin-top:18px;display:flex;gap:40px}.sign span{border-bottom:1px solid #111;min-width:160px;display:inline-block}
.note{margin-top:10px;color:#555;font-size:11px}</style></head><body>
<h1>입문 ① 생활 로봇 학습 기록지</h1>
<div class="who"><span>번호 <b>${esc(rec.no) || '____'}</b></span><span>이름 <b>${esc(rec.name) || '__________'}</b></span><span>차시 구성 ${rec.plan}차시 (카페 기준)</span><span>${day}</span></div>
${parts}
<h2>평가 기준 (3단계)</h2><ul>${rub}</ul>
<h2>개념 한 문장 (직접 쓰기)</h2><p style="border-bottom:1px solid #999;height:26px"></p><p style="border-bottom:1px solid #999;height:26px"></p>
<div class="sign"><div>학생 확인 <span></span></div><div>교사 확인 <span></span></div></div>
<p class="note">이 기록은 시뮬레이션 결과예요. '시도'는 ▶ 시뮬레이션을 누른 횟수, '걸린 시간'은 퀘스트를 처음 연 때부터 통과까지예요.</p>
<script>window.onload=()=>setTimeout(()=>window.print(),300)</script></body></html>`;
}

/** The three places as tabs (학습 기록 · 반 결과). */
function SiteTabs({ site, onSite }: { site: SiteId; onSite(s: SiteId): void }) {
  return (
    <div className={css.seg} role="tablist">
      {SITES.map((x) => (
        <button key={x} type="button" role="tab" aria-selected={x === site} data-on={x === site || undefined} onClick={() => onSite(x)}>
          {SITE_NAME[x]}
        </button>
      ))}
    </div>
  );
}

export function RecordPanel({ rec, site: start, onWho, onClose }: { rec: LessonRecord; site: SiteId; onWho(name: string, no: string): void; onClose(): void }) {
  const [site, setSite] = useState<SiteId>(start);
  const s = summaryOf(rec, rec.plan, site);
  const [name, setName] = useState(rec.name);
  const [no, setNo] = useState(rec.no);
  const who = name.trim() && no.trim();
  const save = () => onWho(name.trim(), no.trim());
  return (
    <>
      <div className={css.scrim} aria-hidden="true" onClick={onClose} />
      <div className={css.modal} data-wide role="dialog" aria-modal="true" aria-label="학습 기록">
        <header className={css.mHead}>
          <em>RECORD</em>
          <b>학습 기록</b>
          <span className={css.page}>{rec.plan}차시 구성</span>
          <button type="button" className={css.x} onClick={onClose} aria-label="닫기">
            ×
          </button>
        </header>
        <div className={css.who}>
          <label>
            번호
            <input value={no} maxLength={8} inputMode="numeric" onChange={(e) => setNo(e.target.value)} onBlur={save} />
          </label>
          <label>
            이름
            <input value={name} maxLength={20} onChange={(e) => setName(e.target.value)} onBlur={save} />
          </label>
          {!who && <small>번호와 이름을 쓰면 기록지와 제출 파일에 들어가요</small>}
        </div>
        <SiteTabs site={site} onSite={setSite} />
        <div className={css.tableWrap}>
          <table className={css.table}>
            <thead>
              <tr>
                <th>차시</th>
                <th>퀘스트 · 시도 · 걸린 시간</th>
                <th>확인 문제</th>
                <th>기준</th>
              </tr>
            </thead>
            <tbody>
              {s.lessons.map((l) => (
                <tr key={l.n}>
                  <td>{l.n}차시</td>
                  <td>
                    {l.quests.map((q) => {
                      const r = rec.quests[q];
                      const min = minutesOf(r);
                      return (
                        <div key={q} className={css.qrow} data-done={r?.passed || undefined}>
                          <i>{r?.passed ? '✓' : '·'}</i>
                          {questName(q)}
                          <small>{r ? `시도 ${r.tries}${min ? ` · ${min}분` : ''}` : '아직'}</small>
                        </div>
                      );
                    })}
                  </td>
                  <td>
                    {l.right} / {l.asked}
                    {!l.checked && l.asked > 0 ? <small> 덜 풂</small> : null}
                  </td>
                  <td>
                    <span className={css.level} data-level={l.level ?? undefined}>
                      {l.level ?? (l.started ? '진행 중' : '-')}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className={css.total}>
          퀘스트{' '}
          <b>
            {s.passed} / {s.total}
          </b>{' '}
          통과 · 확인 문제{' '}
          <b>
            {s.right} / {s.asked}
          </b>{' '}
          맞힘 · 기준{' '}
          <span className={css.level} data-level={s.level ?? undefined}>
            {s.level ?? '확인 문제를 다 풀면 나와요'}
          </span>
        </p>
        <ul className={css.rubric}>
          {RUBRIC.map((r) => (
            <li key={r.level}>
              <span className={css.level} data-level={r.level}>
                {r.level}
              </span>
              {r.text}
            </li>
          ))}
        </ul>
        <div className={css.row}>
          <button
            type="button"
            className={css.ghost}
            onClick={() => {
              save();
              const w = window.open('', '_blank');
              if (!w) return;
              w.document.write(sheetHtml({ ...rec, name: name.trim(), no: no.trim() }));
              w.document.close();
            }}
          >
            기록지 인쇄 · PDF 저장
          </button>
          <button
            type="button"
            className={css.key}
            disabled={!who}
            title={who ? '선생님께 낼 파일을 받아요' : '번호와 이름을 먼저 써 주세요'}
            onClick={() => {
              save();
              const f = recordFile({ ...rec, name: name.trim(), no: no.trim() });
              download(f.name, f.text, 'application/json');
            }}
          >
            제출 파일 받기
          </button>
        </div>
        <small className={css.foot}>
          기록은 이 브라우저에 남아요. 수업이 끝나면 제출 파일을 선생님께 내요(USB · 학급 게시판 · 메일).{' '}
          <a href="/guides/cafe-student.pdf" target="_blank" rel="noreferrer">
            교안 (학생용) PDF
          </a>
        </small>
      </div>
    </>
  );
}

/* --- 교사 열쇠 ------------------------------------------------------------------------------- */

export function TeacherKey({ teacher, onTeacher, onClear, onProjector, onClose }: { teacher: TeacherSet; onTeacher(t: TeacherSet): void; onClear(): void; onProjector(): void; onClose(): void }) {
  const [files, setFiles] = useState<LessonRecord[]>([]);
  const [bad, setBad] = useState(0);
  const [copied, setCopied] = useState(false);
  const link = typeof window !== 'undefined' ? classLink(window.location.origin, { ...teacher, lesson: Math.max(1, teacher.lesson) }) : '';
  const load = async (list: FileList | null) => {
    if (!list) return;
    const got: LessonRecord[] = [];
    let miss = 0;
    for (const f of Array.from(list).slice(0, 80)) {
      const r = f.size < 64_000 ? parseRecord(await f.text()) : null;
      if (r) got.push(r);
      else miss += 1;
    }
    setFiles((was) => mergeRecords([...was, ...got]));
    setBad((b) => b + miss);
  };
  return (
    <>
      <div className={css.scrim} aria-hidden="true" onClick={onClose} />
      <div className={css.modal} data-wide role="dialog" aria-modal="true" aria-label="교사 열쇠">
        <header className={css.mHead}>
          <em>TEACHER</em>
          <b>교사 열쇠 · 수업 운영</b>
          <button type="button" className={css.x} onClick={onClose} aria-label="닫기">
            ×
          </button>
        </header>
        <div className={css.set}>
          <span>차시 구성</span>
          <div className={css.seg}>
            {PLAN_SIZES.map((n) => (
              <button key={n} type="button" data-on={teacher.plan === n || undefined} onClick={() => onTeacher({ ...teacher, plan: n, lesson: Math.min(teacher.lesson, lessonCount(teacher.site, n)) })}>
                {n}차시
              </button>
            ))}
          </div>
          <small className={css.foot}>
            카페 {lessonCount('cafe', teacher.plan)}차시 · 캘리그라피 {lessonCount('draw', teacher.plan)}차시 · 보드게임 {lessonCount('board', teacher.plan)}차시
          </small>
        </div>
        <div className={css.set}>
          <span>지금 현장</span>
          <SiteTabs site={teacher.site} onSite={(x) => onTeacher({ ...teacher, site: x, lesson: Math.min(teacher.lesson, lessonCount(x, teacher.plan)) })} />
        </div>
        <div className={css.set}>
          <span>지금 열 차시</span>
          <div className={css.seg}>
            <button type="button" data-on={teacher.lesson === 0 || undefined} onClick={() => onTeacher({ ...teacher, lesson: 0 })} title="통과하면 다음 퀘스트가 열려요 (혼자 하기)">
              순서대로
            </button>
            {Array.from({ length: lessonCount(teacher.site, teacher.plan) }, (_, i) => i + 1).map((n) => (
              <button key={n} type="button" data-on={teacher.lesson === n || undefined} onClick={() => onTeacher({ ...teacher, lesson: n })}>
                {n}
              </button>
            ))}
          </div>
        </div>
        <label className={css.check}>
          <input type="checkbox" checked={teacher.allOpen} onChange={(e) => onTeacher({ ...teacher, allOpen: e.target.checked })} />
          모든 퀘스트 열기 (시연 · 늦은 학생 따라잡기)
        </label>
        <div className={css.set}>
          <span>수업 링크</span>
          <code className={css.link}>{link}</code>
          <button
            type="button"
            className={css.ghost}
            onClick={() => {
              void navigator.clipboard?.writeText(link).then(() => setCopied(true));
            }}
          >
            {copied ? '복사했어요' : '복사'}
          </button>
        </div>
        <small className={css.foot}>학생이 이 링크로 열면 같은 차시 구성 · 현장 · 차시가 열려요. 앞 현장은 모두 열리고, 뒤 현장은 닫혀요. 이 PC의 설정은 이 PC에만 적용돼요.</small>
        <div className={css.set}>
          <span>수업 자료 (로봇 카페)</span>
          <a className={css.ghostLink} href="/guides/cafe-plan.pdf" target="_blank" rel="noreferrer">
            강의 계획서 · 지도안 PDF
          </a>
          <a className={css.ghostLink} href="/guides/cafe-teacher.pdf" target="_blank" rel="noreferrer">
            교안 (교사용) PDF
          </a>
          <a className={css.ghostLink} href="/guides/cafe-student.pdf" target="_blank" rel="noreferrer">
            교안 (학생용) PDF
          </a>
        </div>
        <div className={css.row}>
          <button type="button" className={css.key} onClick={onProjector}>
            수업 화면 띄우기 (프로젝터)
          </button>
          <button
            type="button"
            className={css.ghost}
            onClick={() => {
              if (window.confirm('이 PC의 학습 기록(퀘스트 통과 · 확인 문제 · 이름)을 모두 지울까요? 되돌릴 수 없어요.')) onClear();
            }}
          >
            이 PC 기록 지우기
          </button>
        </div>
        <h3 className={css.h3}>반 결과 모으기 (수행평가)</h3>
        <div className={css.row}>
          <label className={css.file}>
            학생 제출 파일 넣기
            <input type="file" accept=".json,application/json" multiple onChange={(e) => void load(e.target.files)} />
          </label>
          <button type="button" className={css.key} disabled={!files.length} onClick={() => download(`생활로봇-반결과-${teacher.plan}차시.csv`, classCsv(files, teacher.plan), 'text/csv')}>
            엑셀(CSV) 받기
          </button>
          {bad > 0 && <small>읽지 못한 파일 {bad}개</small>}
        </div>
        {files.length > 0 && (
          <div className={css.tableWrap}>
            <table className={css.table}>
              <thead>
                <tr>
                  <th>번호</th>
                  <th>이름</th>
                  {lessonsOf(teacher.plan, teacher.site).map((l) => (
                    <th key={l.n}>
                      {short(teacher.site)} {l.n}차시
                    </th>
                  ))}
                  <th>{short(teacher.site)} 기준</th>
                </tr>
              </thead>
              <tbody>
                {files.map((r) => {
                  const s = summaryOf(r, teacher.plan, teacher.site);
                  return (
                    <tr key={`${r.no}|${r.name}`}>
                      <td>{r.no}</td>
                      <td>{r.name}</td>
                      {s.lessons.map((l) => (
                        <td key={l.n}>
                          {l.passed}/{l.quests.length} · {l.right}/{l.asked}{' '}
                          <span className={css.level} data-level={l.level ?? undefined}>
                            {l.level ?? '-'}
                          </span>
                        </td>
                      ))}
                      <td>
                        <span className={css.level} data-level={s.level ?? undefined}>
                          {s.level ?? '-'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <small className={css.foot}>지금 현장의 칸: 퀘스트 통과 · 확인 문제 맞힘 · 기준(위 [지금 현장]에서 바꿔 봐요). 엑셀에는 세 현장이 모두 들어가요. 같은 학생의 파일이 둘이면 나중 것을 써요.</small>
          </div>
        )}
      </div>
    </>
  );
}

/* --- 프로젝터 화면 ----------------------------------------------------------------------------- */

/** One 차시 as the teacher leads it: 교안 (설명 · 확인) and app (수행) in turn. */
const FLOW: readonly (readonly [string, string, string])[] = [
  ['도입', '5분', '교안 차시 첫 쪽: 오늘 배울 것 읽기 · 발문'],
  ['설명', '10분', '교안 퀘스트 설명 쪽 + 이 화면'],
  ['수행', '20분', '앱 퀘스트 (화면의 교안 쪽 표시를 따라)'],
  ['확인', '5분', '앱 확인 문제 3개 (자동 채점)'],
  ['정리', '5분', '개념 한 문장 · 학습 기록 제출'],
];

export function Projector({ teacher, onLesson, onClose }: { teacher: TeacherSet; onLesson(n: number): void; onClose(): void }) {
  const ls = lessonsOf(teacher.plan, teacher.site);
  const n = Math.max(1, Math.min(teacher.lesson || 1, ls.length));
  const l = ls[n - 1];
  const asks = checksOf(teacher.plan, n, teacher.site);
  const gp = guidePagesOf(teacher.site);
  const [show, setShow] = useState(false);
  const link = typeof window !== 'undefined' ? classLink(window.location.origin, { ...teacher, lesson: n }) : '';
  return (
    <div className={css.projector} role="dialog" aria-modal="true" aria-label="수업 화면">
      <header>
        <em>LESSON</em>
        <b>
          {SITE_NAME[teacher.site]} {n}차시 <small>/ {ls.length}</small>
        </b>
        <span className={css.page}>{pages(l.pages[0], l.pages[1])}</span>
        <span className={css.grow} />
        <button type="button" className={css.ghost} disabled={n <= 1} onClick={() => onLesson(n - 1)}>
          ◀ 이전 차시
        </button>
        <button type="button" className={css.ghost} disabled={n >= ls.length} onClick={() => onLesson(n + 1)}>
          다음 차시 ▶
        </button>
        <button type="button" className={css.x} onClick={onClose} aria-label="닫기">
          ×
        </button>
      </header>
      <div className={css.pGrid}>
        <section>
          <h2>오늘 배울 것</h2>
          <ol>
            {l.goals.map((g, i) => (
              <li key={g}>
                <b>{i + 1}.</b> {g}
              </li>
            ))}
          </ol>
          <h2>수업 흐름 (45분)</h2>
          <ol className={css.pFlow}>
            {FLOW.map((f) => (
              <li key={f[0]}>
                <b>{f[0]}</b>
                <span>{f[1]}</span>
                <small>{f[2]}</small>
              </li>
            ))}
          </ol>
          <h2>오늘 할 퀘스트</h2>
          <ul className={css.pQuests}>
            {l.quests.map((q) => (
              <li key={q}>
                <b>{questName(q)}</b>
                <span className={css.page}>{questPages(q)}</span>
                <small>
                  개념: {LESSON_QUEST[q].concept.term} — {LESSON_QUEST[q].concept.def}
                </small>
              </li>
            ))}
          </ul>
        </section>
        <section>
          <h2>수업 링크</h2>
          <code className={css.bigLink}>{link}</code>
          <h2>
            확인 문제
            <button type="button" className={css.ghost} onClick={() => setShow((s) => !s)}>
              {show ? '정답 숨기기' : '정답 보기'}
            </button>
          </h2>
          <ol className={css.pChecks}>
            {asks.map((a, i) => (
              <li key={a.key}>
                <b>{i + 1}.</b> {a.q}
                <span>
                  {a.options.map((o, k) => (
                    <em key={o} data-right={show && k === a.answer ? '' : undefined}>
                      {MARK[k]} {o}
                    </em>
                  ))}
                </span>
                {show && <small>{a.why}</small>}
              </li>
            ))}
          </ol>
        </section>
      </div>
      <small className={css.foot}>
        {SITE_NAME[teacher.site]} 교안 {gp.answers}쪽: 확인 문제 정답 · {gp.rubric}쪽: 평가 기준 · {gp.results}쪽: 반 결과 정리
      </small>
    </div>
  );
}

/* --- 학습 기록 알약 (top bar) ------------------------------------------------------------------ */

export function RecordPill({ rec, site, lesson, total, onOpen, course }: { rec: LessonRecord; site: SiteId; lesson: number; total: number; onOpen(): void; course?: { lesson: number; done: number; of: number } }) {
  const s = summaryOf(rec, rec.plan, site);
  // 입문 12차시 (course.ts): the 차시 now and the 서브챕터 done.
  const sum = course ? `${course.lesson ? `${course.lesson}차시 / 12` : '12차시'} · 완료 ${course.done}/${course.of}` : null;
  const bar = course ? course.done / course.of : s.passed / s.total;
  return (
    <button type="button" className={css.recPill} onClick={onOpen} title="학습 기록 · 기록지 · 제출 파일">
      <span>
        <b>학습 기록{rec.name ? ` · ${rec.no ? `${rec.no}번 ` : ''}${rec.name}` : ''}</b>
        <small>{sum ?? `${short(site)} ${lesson ? `${lesson}차시 / ${total}` : `${total}차시`} · 퀘스트 ${s.passed}/${s.total} · 확인 ${s.right}/${s.asked}`}</small>
      </span>
      <span className={css.recBar} aria-hidden="true">
        <i style={{ width: `${bar * 100}%` }} />
      </span>
    </button>
  );
}
