'use client';

/**
 * 입문 과정 QA (동결 뒤 고침 v6 파트 5-3 · 5-5), only under ?qa=1: a small box in the screen's bottom-left corner —
 * how long the first screen took (from opening the address to the robot drawn in the 3D view), the 3D view's frames
 * per second (the view draws every frame, so the page's frame rate is the 3D view's), and [QA 기록 처음부터],
 * which empties the QA record only (qaMode.ts).
 */

import { useEffect, useRef, useState } from 'react';

import { resetQaRecord } from './qaMode';

const box: React.CSSProperties = {
  position: 'fixed',
  left: 12,
  bottom: 12,
  zIndex: 90,
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '8px 12px',
  borderRadius: 8,
  background: 'rgba(20, 23, 28, 0.92)',
  color: '#f6f7f9',
  font: '600 14px/1.3 system-ui, sans-serif',
  fontVariantNumeric: 'tabular-nums',
  boxShadow: '0 0 0 1px rgba(255, 255, 255, 0.18)',
};
const key: React.CSSProperties = { height: 32, padding: '0 12px', border: 0, borderRadius: 8, background: 'rgba(255, 255, 255, 0.16)', color: '#f6f7f9', font: 'inherit', cursor: 'pointer' };

export default function QaPanel({ ready }: { ready: boolean }) {
  // The first screen: the time since the address was opened when the robot is first drawn (ms → s).
  const [first, setFirst] = useState<number | null>(null);
  const [fps, setFps] = useState<number | null>(null);
  const seen = useRef(false);
  useEffect(() => {
    if (!ready || seen.current) return;
    seen.current = true;
    const id = requestAnimationFrame(() => setFirst(performance.now()));
    return () => cancelAnimationFrame(id);
  }, [ready]);
  useEffect(() => {
    let raf = 0;
    let n = 0;
    let t0 = performance.now();
    const tick = (t: number) => {
      n++;
      if (t - t0 >= 1000) {
        setFps(Math.round((n * 1000) / (t - t0)));
        n = 0;
        t0 = t;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <div style={box} data-qa role="status" aria-label="QA 측정">
      <b style={{ color: '#f0a23b' }}>QA</b>
      <span>첫 화면 {first == null ? '…' : `${(first / 1000).toFixed(1)}초`}</span>
      <span>3D {fps == null ? '…' : `${fps} fps`}</span>
      <button
        type="button"
        style={key}
        onClick={() => {
          if (window.confirm('QA 기록을 지우고 처음부터 시작할까요? (실제 학습 기록은 그대로예요)')) resetQaRecord();
        }}
      >
        QA 기록 처음부터
      </button>
    </div>
  );
}
