'use client';

/**
 * 처음 시작: the simulator's own way in for someone opening it the first time — three steps in the
 * 3D view's top-left corner (팔 움직여 보기 → 공정 따라하기 → 블록 코딩), each opening its screen,
 * each ticked when it is done (Console marks them), with how to turn and zoom the view while the mini
 * arm is not below it. Folded to a small chip it stays out of the way; what is done is kept on this PC.
 * 도움말 → [처음 시작 안내 다시 보기] unfolds it.
 */

import css from './stageHud.module.css';

export type StartStep = 'move' | 'process' | 'code';

export const START_STEPS: { id: StartStep; name: string; how: string }[] = [
  { id: 'move', name: '팔 움직여 보기', how: '[제어]에서 관절 버튼을 눌러 팔을 돌려 봐요' },
  { id: 'process', name: '공정 따라하기', how: '[공정]에서 실습을 골라 ▶ 시뮬레이션' },
  { id: 'code', name: '블록 코딩', how: '[코딩] 블록 예제를 ▶ 로 돌려 봐요' },
];

/** `tip`: room below the card (no mini arm there) for how to turn and zoom the view. */
export function StartGuide({ done, folded, tip, onOpen, onFold }: { done: readonly StartStep[]; folded: boolean; tip: boolean; onOpen(step: StartStep): void; onFold(folded: boolean): void }) {
  const count = START_STEPS.filter((s) => done.includes(s.id)).length;
  const next = START_STEPS.find((s) => !done.includes(s.id));
  if (folded)
    return (
      <button type="button" className={css.startChip} onClick={() => onFold(false)} title="처음 시작 안내 펼치기">
        처음 시작 <b>{count}/3</b>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M9 6l6 6-6 6" />
        </svg>
      </button>
    );
  return (
    <section className={css.start} aria-label="처음 시작" data-panel="start">
      <header>
        <b>처음 시작</b>
        <small>{next ? `3단계 · ${count}/3` : '다 했어요'}</small>
        <button type="button" onClick={() => onFold(true)} aria-label="처음 시작 안내 접기" title="접기">
          ×
        </button>
      </header>
      <ol>
        {START_STEPS.map((s, k) => {
          const ok = done.includes(s.id);
          const now = next?.id === s.id;
          return (
            <li key={s.id} data-done={ok || undefined} data-now={now || undefined}>
              <button type="button" onClick={() => onOpen(s.id)}>
                <i>{ok ? '✓' : k + 1}</i>
                <span>
                  <b>{s.name}</b>
                  <small>{s.how}</small>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      {next ? tip && <p>화면은 끌어서 돌리고 휠(태블릿은 두 손가락)로 확대해요. 시뮬레이션을 통과한 프로그램은 [로봇 연결] 뒤 실제 로봇에서 돌려요.</p> : <p>이제 [코딩]의 [과제 바꾸기]나 Python · ROS 2 로 더 해 보세요.</p>}
    </section>
  );
}
