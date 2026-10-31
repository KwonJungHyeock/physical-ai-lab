'use client';

/**
 * [?] 도움말 in the top bar: what is where on the screen, the order a class works in, the keys,
 * and the way to the manual (PDF) and to the first-run steps again. Short on purpose: one look,
 * then back to the robot.
 */

import { useEffect, useRef } from 'react';

import Icon from '../Icon';
import css from './helpSheet.module.css';

const PARTS: [string, string][] = [
  ['위 막대', '교육 · 시뮬레이터 · 라이브러리 · 자료실, 지금 과제와 목표, 로봇 연결'],
  ['가운데 3D', '끌어서 돌리고 휠(태블릿은 두 손가락)로 확대 · 왼쪽 아래에 관절 각도'],
  ['왼쪽 모니터', '관절 각도 · 손끝 위치 · 그래프 · 모터 부하 (끄고 켤 수 있어요)'],
  ['작업 패널', '제어 → 블록 코딩(초급) → Python(중급) → ROS 2(고급)'],
  ['아래 실습 환경', '장면 바꾸기 · ▶ 데모 보기 · 매트 · 물리 · 물건 놓기'],
];

const STEPS = [
  '[제어]로 팔을 직접 움직여 관절을 익혀요.',
  '위의 과제 이름을 눌러 [라이브러리]에서 과제를 골라요.',
  '예제 프로그램을 고치고 [시뮬레이션]으로 확인해요. 만든 프로그램은 저절로 저장돼요.',
  '목표를 이루면 [코드 받기] 또는 로봇에 연결해 같은 프로그램을 실제 로봇에서 실행해요.',
];

const KEYS: [string, string][] = [
  ['Esc', '정지 (실행 중에는 스페이스도)'],
  ['Ctrl + Enter', '시뮬레이션 실행'],
  ['+  −', '3D 화면 확대 · 축소'],
  ['↑ ↓  ← →', '제어: 관절 고르기 · 돌리기'],
  ['↑ ↓ ← → · Shift · Space', '좌표 조그: 손끝 앞뒤 · 좌우 · 위 · 아래'],
  ['Ctrl + Z / Y', '블록 코딩: 되돌리기 · 다시 하기'],
  ['Delete', '고른 물건 지우기'],
];

export default function HelpSheet({ onClose, onGuide }: { onClose(): void; onGuide(): void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog ref={ref} className={css.sheet} onClose={onClose} onMouseDown={(e) => e.target === e.currentTarget && onClose()} aria-label="도움말">
      <div className={css.inner}>
        <header className={css.head}>
          <span className={css.mark}>
            <Icon name="help" size={22} />
          </span>
          <div>
            <h2>도움말</h2>
            <p>로봇 학습 시뮬레이터 (myCobot 280 RDK X5)</p>
          </div>
          <button type="button" className={css.close} onClick={onClose} aria-label="닫기">
            ×
          </button>
        </header>

        <section>
          <h3>화면</h3>
          <dl className={css.parts}>
            {PARTS.map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section>
          <h3>이렇게 해요</h3>
          <ol className={css.steps}>
            {STEPS.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        </section>

        <section>
          <h3>키보드</h3>
          <dl className={css.keys}>
            {KEYS.map(([k, v]) => (
              <div key={k}>
                <dt>
                  <kbd>{k}</kbd>
                </dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </section>

        <footer className={css.foot}>
          <button
            type="button"
            onClick={() => {
              onGuide();
              onClose();
            }}
          >
            처음 시작 안내 다시 보기
          </button>
          <a href="/guides/basic-student.pdf" target="_blank" rel="noreferrer">
            <Icon name="book" size={16} /> 기초 사용 매뉴얼 (PDF)
          </a>
        </footer>
      </div>
    </dialog>
  );
}
