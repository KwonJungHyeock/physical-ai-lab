'use client';

/**
 * The 교육 tab in class mode before a login: a calm page with the login (학생 / 선생님), or the first-run
 * setup on a fresh class server. Free mode, or once logged in: the lessons themselves (children).
 * A student whose login ran out keeps practising (the top bar asks to log in again).
 */

import type { ReactNode } from 'react';

import { useAccount } from './AccountProvider';
import LoginPanel from './LoginPanel';
import css from './account.module.css';

export default function LearnGate({ hidden, children }: { hidden?: boolean; children: ReactNode }) {
  const a = useAccount();
  if (!a.classMode || a.session) return <>{children}</>;
  const setup = !!a.status?.needsSetup;
  return (
    <section className={`${css.scope} ${css.gate}`} hidden={hidden} aria-label="학급 로그인">
      <div className={css.gateIntro}>
        <span className={css.kicker}>로봇 시티 · 교실 수업</span>
        <h1>{setup ? '학급 서버를 처음 켰어요' : '로그인하고 수업을 시작해요'}</h1>
        {setup ? (
          <>
            <p>이 PC 가 교실의 학급 서버예요. 세 단계면 수업을 시작할 수 있어요.</p>
            <ol className={css.steps}>
              <li>
                <b>1</b>
                <span>
                  <strong>관리자 계정</strong> 오른쪽에서 아이디와 비밀번호를 정해요
                </span>
              </li>
              <li>
                <b>2</b>
                <span>
                  <strong>학급 만들기</strong> &quot;2학년 3반&quot;처럼 학급 이름표를 적어요
                </span>
              </li>
              <li>
                <b>3</b>
                <span>
                  <strong>로그인 카드</strong> 학생 수만큼 계정을 만들고 카드를 인쇄해요
                </span>
              </li>
            </ol>
            <p className={css.gateNote}>학생 이름은 학급 서버에 저장하지 않아요. 번호와 PIN 으로만 들어와요.</p>
          </>
        ) : (
          <>
            <p>선생님께 받은 로그인 카드를 준비해요.</p>
            <ol className={css.steps}>
              <li>
                <b>1</b>
                <span>
                  <strong>학급 코드</strong> 카드 맨 위의 영문 · 숫자 6자
                </span>
              </li>
              <li>
                <b>2</b>
                <span>
                  <strong>번호</strong> 내 번호
                </span>
              </li>
              <li>
                <b>3</b>
                <span>
                  <strong>PIN</strong> 숫자 4개 (다른 사람에게 보여 주지 않아요)
                </span>
              </li>
            </ol>
            <p className={css.gateNote}>시뮬레이터 · 라이브러리 탭은 로그인 없이도 쓸 수 있어요. 수업 기록은 로그인해야 선생님께 전해져요.</p>
          </>
        )}
      </div>
      <div className={css.gateCard}>
        <LoginPanel
          onDone={(s) => {
            if (s.role !== 'student') a.openDashboard();
          }}
        />
      </div>
    </section>
  );
}
