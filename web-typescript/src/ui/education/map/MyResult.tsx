'use client';

/**
 * 내 결과 내보내기 (the map's overview card): the student types a name (and 번호) and downloads what
 * this computer holds as one file (engine/education/classReport.ts), to hand to the teacher, who loads
 * the class's files in the 관제센터's 반 결과. Folded by default; the name is kept in this browser.
 */

import { useEffect, useState } from 'react';

import { MAX_NAME, MAX_NO, PROBLEMS_OF, STUDENT_NAME_KEY, STUDENT_NO_KEY, THEORY_OF, buildReport, reportFileName, reportText } from '@/engine/education/classReport';

import css from './park.module.css';

const readKey = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const writeKey = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* private window: typed again next time */
  }
};

function downloadJson(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** `theory` · `solved`: this computer's progress, for the line under the button. */
export default function MyResult({ theory, solved }: { theory: number; solved: number }) {
  const [name, setName] = useState('');
  const [no, setNo] = useState('');
  const [sent, setSent] = useState<string | null>(null);
  // The name kept on this computer, read after hydration (the page is a static export).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setName(readKey(STUDENT_NAME_KEY) ?? '');
    setNo(readKey(STUDENT_NO_KEY) ?? '');
  }, []);

  const exportMine = () => {
    const r = buildReport(readKey);
    downloadJson(reportFileName(r), reportText(r));
    setSent(reportFileName(r));
  };

  return (
    <details className={css.mine}>
      <summary>📤 선생님께 내 결과 내기</summary>
      <p>이름을 적고 파일로 내보내요. 그 파일을 선생님께 내면 반 전체 결과로 모여요.</p>
      <div className={css.mineFields}>
        <label>
          이름
          <input
            value={name}
            maxLength={MAX_NAME}
            placeholder="예: 김민준"
            autoComplete="off"
            onChange={(e) => {
              setName(e.target.value);
              setSent(null);
              writeKey(STUDENT_NAME_KEY, e.target.value);
            }}
          />
        </label>
        <label>
          번호
          <input
            value={no}
            maxLength={MAX_NO}
            inputMode="numeric"
            placeholder="선택"
            autoComplete="off"
            onChange={(e) => {
              setNo(e.target.value);
              setSent(null);
              writeKey(STUDENT_NO_KEY, e.target.value);
            }}
          />
        </label>
      </div>
      <button type="button" className={css.mineBtn} disabled={!name.trim()} onClick={exportMine}>
        내 결과 내보내기
      </button>
      <small>
        {sent ? (
          <>
            ✓ <b>{sent}</b> 파일을 내려받았어요. 선생님께 내요.
          </>
        ) : name.trim() ? (
          `이 컴퓨터의 기록: 이론 ${theory}/${THEORY_OF}차시 · 현장 문제 ${solved}/${PROBLEMS_OF}개 · 실습 기록 · 마무리 평가`
        ) : (
          '이름을 먼저 적어요.'
        )}
      </small>
    </details>
  );
}
