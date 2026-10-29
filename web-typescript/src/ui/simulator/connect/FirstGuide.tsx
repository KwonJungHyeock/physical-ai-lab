'use client';

/**
 * The first time the simulator opens on this PC: three steps in a small card over the 3D view
 * (it never blocks anything — the panels work around it), then never again.
 */

import { useEffect, useState } from 'react';

import css from './firstGuide.module.css';

const GUIDE_KEY = 'console-guide-done';

/** Show the three steps again (도움말 → [처음 쓰는 방법 다시 보기]); the guide reads this on mounting. */
export function resetFirstGuide(): void {
  try {
    localStorage.removeItem(GUIDE_KEY);
  } catch {
    /* private window */
  }
}

const STEPS = (side: 'right' | 'left') => [
  { title: '직접 움직여 보기', text: `${side === 'left' ? '왼쪽' : '오른쪽'} [제어]에서 관절 버튼이나 앞 · 뒤 · 위 · 아래 버튼을 눌러 팔을 움직여 보세요. 화면은 끌어서 돌리고, 휠(태블릿은 두 손가락)로 확대해요.` },
  { title: '프로그램 만들기', text: '[블록 코딩](초급) · [Python](중급) · [ROS 2](고급) 탭에서 과제의 예제를 고쳐 보세요. 만든 프로그램은 저절로 저장돼요. 과제는 위의 과제 이름을 누르면 [라이브러리]에서 바꿔요.' },
  { title: '시뮬레이션 → 실제 로봇', text: '[시뮬레이션]으로 먼저 확인해요. 부딪힘 없이 통과하면 [로봇 연결] 뒤 같은 프로그램을 실제 로봇에서 실행해요. 왼쪽 [환경]에서 장면을 바꾸고, ▶ 데모로 로봇이 하는 일을 볼 수 있어요.' },
];

/** `side`: where the work panel is (it can be moved to the left). */
export default function FirstGuide({ side = 'right' }: { side?: 'right' | 'left' }) {
  const [step, setStep] = useState<number | null>(null);
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- read after hydration
      if (!localStorage.getItem(GUIDE_KEY)) setStep(0);
    } catch {
      /* private window: no guide */
    }
  }, []);
  if (step === null) return null;
  const done = () => {
    setStep(null);
    try {
      localStorage.setItem(GUIDE_KEY, '1');
    } catch {
      /* private window */
    }
  };
  const steps = STEPS(side);
  const s = steps[step];
  return (
    <section className={css.guide} aria-label="처음 쓰는 방법">
      <ol className={css.dots}>
        {steps.map((x, i) => (
          <li key={x.title} data-on={i === step || undefined} data-done={i < step || undefined}>
            <button type="button" onClick={() => setStep(i)} aria-label={`${i + 1}단계 ${x.title}`}>
              {i < step ? '✓' : i + 1}
            </button>
          </li>
        ))}
      </ol>
      <div className={css.body}>
        <small>처음 쓰는 방법 · {step + 1} / {steps.length}</small>
        <b>{s.title}</b>
        <p>{s.text}</p>
      </div>
      <div className={css.actions}>
        {step < steps.length - 1 ? (
          <>
            <button type="button" className={css.skip} onClick={done}>
              건너뛰기
            </button>
            <button type="button" className={css.next} onClick={() => setStep(step + 1)}>
              다음 →
            </button>
          </>
        ) : (
          <button type="button" className={css.next} onClick={done}>
            시작하기
          </button>
        )}
      </div>
    </section>
  );
}
