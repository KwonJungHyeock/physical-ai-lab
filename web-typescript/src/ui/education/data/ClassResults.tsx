'use client';

/**
 * 반 결과 (the 관제센터's teacher tab): the files the students exported (map → 선생님께 내 결과 내기,
 * engine/education/classReport.ts) chosen or dropped here, many at once, read in this browser only —
 * nothing is uploaded. One row per student (the newest file of each), sortable by any column; a student
 * stuck on a problem or leaning on hints is marked; a row opens to the 21 problems; CSV for Excel.
 * A file that is not a report is listed with the reason, the rest still load.
 */

import { useMemo, useRef, useState, type DragEvent } from 'react';

import { MANY_HINTS, MAX_FILE_CHARS, PROBLEMS_OF, STUCK_RUNS, REPORT_LABS, THEORY_OF, classCsv, mergeReports, rowOf, parseReport, stampOf, type StudentReport, type StudentRow } from '@/engine/education/classReport';
import { SITES } from '@/engine/education/park';

import css from './data.module.css';

/** What has been loaded (kept by the 관제센터 while it is open; gone when the page closes). */
export interface ClassLoad {
  reports: StudentReport[];
  errors: { file: string; reason: string }[];
}
export const NO_CLASS: ClassLoad = { reports: [], errors: [] };

/** Files read in one go (a class or two). */
const MAX_FILES = 200;

type SortKey = 'no' | 'name' | 'theory' | 'solved' | 'stars' | 'hints' | 'runs' | 'final' | 'robot' | 'exportedAt' | 'flags';
const COLS: readonly { key: SortKey; name: string; num?: boolean; title?: string }[] = [
  { key: 'no', name: '번호' },
  { key: 'name', name: '이름' },
  { key: 'theory', name: `이론 /${THEORY_OF}`, num: true, title: '마친 이론 차시' },
  { key: 'solved', name: `현장 /${PROBLEMS_OF}`, num: true, title: '해결한 현장 문제' },
  { key: 'stars', name: '별', num: true, title: '해결한 문제의 별 합 (그 컴퓨터에 남은 것만)' },
  { key: 'hints', name: '힌트', num: true, title: '현장 문제에서 본 힌트 합 (그 컴퓨터에 남은 것만)' },
  { key: 'runs', name: '다시 가동', num: true, title: '현장 실습에서 [▶ 다시 가동]한 횟수' },
  { key: 'final', name: '마무리 평가', num: true },
  { key: 'robot', name: '실물', num: true, title: '실제 로봇에서 실행한 횟수' },
  { key: 'exportedAt', name: '내보낸 때', num: true },
  { key: 'flags', name: '살펴볼 점' },
];

const noOf = (r: StudentRow) => (/^\d+$/.test(r.no) ? Number(r.no) : Infinity);
function sortValue(r: StudentRow, k: SortKey): number | string {
  switch (k) {
    case 'no':
      return noOf(r);
    case 'name':
      return r.name;
    case 'final':
      return r.finalScore ?? -1;
    case 'stars':
    case 'hints':
      return r[k] ?? -1;
    case 'flags':
      return r.flags.length;
    default:
      return r[k];
  }
}

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000); // an iPad asks before saving: the link must outlive the question
}

const SHORT = new Map(SITES.filter((s) => s.lab).map((s) => [s.lab!, s]));

export default function ClassResults({ load, setLoad }: { load: ClassLoad; setLoad(fn: (l: ClassLoad) => ClassLoad): void }) {
  const [sort, setSort] = useState<{ key: SortKey; up: boolean }>({ key: 'no', up: true });
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const merged = useMemo(() => mergeReports(load.reports), [load.reports]);
  const rows = useMemo(() => {
    const list = merged.map((r) => ({ r, row: rowOf(r), key: `${r.name}\u0000${r.no}` }));
    const dir = sort.up ? 1 : -1;
    return list.sort((a, b) => {
      const x = sortValue(a.row, sort.key);
      const y = sortValue(b.row, sort.key);
      const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'ko');
      return c * dir || a.row.name.localeCompare(b.row.name, 'ko');
    });
  }, [merged, sort]);
  const flagged = rows.filter((x) => x.row.flags.length).length;
  const dupes = load.reports.length - merged.length;

  const readFiles = async (files: readonly File[]) => {
    setBusy(true);
    const reports: StudentReport[] = [];
    const errors: ClassLoad['errors'] = [];
    for (const [i, f] of files.entries()) {
      if (i >= MAX_FILES) {
        errors.push({ file: `${files.length - MAX_FILES}개 더`, reason: `한 번에 ${MAX_FILES}개까지 읽어요` });
        break;
      }
      // A report is a few KB; a big file is not read at all (Korean text is up to 3 bytes a character).
      if (f.size > MAX_FILE_CHARS * 3) {
        errors.push({ file: f.name, reason: '파일이 너무 커요 (결과 파일이 아닌 것 같아요)' });
        continue;
      }
      let text: string;
      try {
        text = await f.text();
      } catch {
        errors.push({ file: f.name, reason: '파일을 읽을 수 없어요' });
        continue;
      }
      const p = parseReport(text);
      if (p.ok) reports.push(p.report);
      else errors.push({ file: f.name, reason: p.reason });
    }
    setLoad((l) => ({ reports: [...l.reports, ...reports], errors: [...l.errors, ...errors] }));
    setBusy(false);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    void readFiles([...e.dataTransfer.files]);
  };
  const saveCsv = () => {
    const d = new Date();
    const day = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    download(`반결과-${day}.csv`, classCsv(load.reports));
  };
  const sortBy = (key: SortKey) => setSort((s) => ({ key, up: s.key === key ? !s.up : key === 'no' || key === 'name' }));

  return (
    <>
      <div
        className={css.drop}
        data-over={over || undefined}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
      >
        <div>
          <h2>반 결과 모으기</h2>
          <p className={css.lead}>
            학생들이 낸 <b>결과 파일(.json)</b>을 여러 개 한꺼번에 고르거나 이곳에 끌어다 놓아요. 학생은 교육 첫 화면(로봇 시티 지도) 오른쪽 카드 아래{' '}
            <b>선생님께 내 결과 내기</b>에서 파일을 만들어요.
          </p>
          <p className={css.small}>파일은 이 컴퓨터의 브라우저에서만 읽고 어디에도 보내지 않아요. 화면을 닫으면 목록도 사라지니, 필요하면 CSV로 저장해요.</p>
        </div>
        <div className={css.dropTools}>
          <button type="button" className={css.primary} onClick={() => input.current?.click()} disabled={busy}>
            {busy ? '읽는 중…' : '결과 파일 고르기'}
          </button>
          <input
            ref={input}
            type="file"
            accept=".json,application/json"
            multiple
            hidden
            onChange={(e) => {
              const fs = [...(e.target.files ?? [])];
              e.target.value = '';
              void readFiles(fs);
            }}
          />
          <button type="button" className={css.tool} onClick={saveCsv} disabled={!merged.length} title="엑셀에서 바로 열리는 CSV">
            CSV로 저장
          </button>
          <button type="button" className={css.tool} onClick={() => setLoad(() => NO_CLASS)} disabled={!load.reports.length && !load.errors.length}>
            목록 비우기
          </button>
        </div>
      </div>

      {load.errors.length > 0 && (
        <article className={css.card}>
          <h2>
            읽지 못한 파일 <small>{load.errors.length}개 (나머지는 그대로 모았어요)</small>
          </h2>
          <ul className={css.badFiles}>
            {load.errors.map((e, i) => (
              <li key={i}>
                <b>{e.file}</b> {e.reason}
              </li>
            ))}
          </ul>
        </article>
      )}

      {merged.length > 0 ? (
        <article className={css.card}>
          <h2>
            학생 {merged.length}명{' '}
            <small>
              {flagged ? `살펴볼 학생 ${flagged}명` : '모두 순조로워요'}
              {dupes > 0 && ` · 같은 학생의 파일 ${dupes}개는 가장 최근 것만 썼어요`}
            </small>
          </h2>
          <p className={css.lead}>제목을 누르면 그 기준으로 정렬해요. 줄을 누르면 그 학생의 현장 문제 21개를 보여요.</p>
          <div className={css.tableWrap}>
            <table className={`${css.runs} ${css.klass}`}>
              <thead>
                <tr>
                  {COLS.map((c) => (
                    <th key={c.key} title={c.title} aria-sort={sort.key === c.key ? (sort.up ? 'ascending' : 'descending') : undefined}>
                      <button type="button" onClick={() => sortBy(c.key)}>
                        {c.name}
                        {sort.key === c.key && <i aria-hidden>{sort.up ? '▲' : '▼'}</i>}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(({ r, row, key }) => (
                  <ClassRow key={key} r={r} row={row} open={open === key} onToggle={() => setOpen((o) => (o === key ? null : key))} />
                ))}
              </tbody>
            </table>
          </div>
          <p className={css.small}>
            <b>살펴볼 점</b>: 한 문제를 {STUCK_RUNS}번 이상 실행했는데 아직 성공이 없거나, 힌트를 {MANY_HINTS}번 이상 봤거나, 마무리 평가를 마치고 60점이 안 된 학생이에요. 별 · 힌트는
            학생 컴퓨터에 남은 경우에만 보여요(—).
          </p>
        </article>
      ) : (
        <p className={css.cardNote}>아직 모은 파일이 없어요. 학생들의 결과 파일을 골라 주세요.</p>
      )}
    </>
  );
}

function ClassRow({ r, row, open, onToggle }: { r: StudentReport; row: StudentRow; open: boolean; onToggle(): void }) {
  const dash = (v: number | null) => (v === null ? '—' : v);
  return (
    <>
      <tr className={css.klassRow} data-flag={row.flags.length > 0 || undefined} onClick={onToggle}>
        <td className={css.num}>{row.no || '—'}</td>
        <td>
          <button type="button" className={css.who} aria-expanded={open} onClick={(e) => (e.stopPropagation(), onToggle())}>
            {row.name}
          </button>{' '}
          <small className={css.muted}>{row.level}</small>
        </td>
        <td className={css.num}>{row.theory}</td>
        <td className={css.num}>{row.solved}</td>
        <td className={css.num}>{dash(row.stars)}</td>
        <td className={css.num}>{dash(row.hints)}</td>
        <td className={css.num}>{row.runs}</td>
        <td className={css.num}>{row.finalScore === null ? '—' : `${row.finalScore}점 (${row.finalGrade})`}</td>
        <td className={css.num}>{row.robot}</td>
        <td className={css.num}>{stampOf(row.exportedAt).slice(5)}</td>
        <td className={css.flagCell}>{row.flags.length ? row.flags.map((f) => <span key={f}>⚠ {f}</span>) : <span className={css.muted}>—</span>}</td>
      </tr>
      {open && (
        <tr className={css.klassMore}>
          <td colSpan={COLS.length}>
            <div className={css.probGrid}>
              {REPORT_LABS.map((lab) => {
                const s = SHORT.get(lab)!;
                return (
                  <div key={lab}>
                    <b style={{ color: s.color }}>{s.short}</b>
                    {r.problems
                      .filter((p) => p.lab === lab)
                      .map((p) => (
                        <span
                          key={p.problem}
                          data-st={p.solved ? 'done' : p.runs ? 'try' : undefined}
                          title={`${s.name} ${p.problem}. ${s.problems[p.problem - 1]?.title ?? ''}: ${p.solved ? '해결' : p.runs ? '진행 중' : '아직'} · 실행 ${p.runs}번 (성공 ${p.passes})${p.hints !== null ? ` · 힌트 ${p.hints}` : ''}${p.stars !== null ? ` · 별 ${p.stars}` : ''}`}
                        >
                          {p.problem}
                          <small>{p.solved ? `✓${p.stars !== null ? ` ${'★'.repeat(p.stars)}` : ''}` : p.runs ? `${p.runs}회` : ''}</small>
                        </span>
                      ))}
                  </div>
                );
              })}
            </div>
            {r.final && (
              <p className={css.small}>
                마무리 평가: {r.final.done}/{r.final.of}문항 마침 · {r.final.score}점 ({r.final.grade}) · 힌트 {r.final.hints}번
              </p>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
