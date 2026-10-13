'use client';

/**
 * One stop for every part of the page that can move the real arm: the top bar's [로봇 정지] (and the
 * console's own stop) announce it; 실물 연동 on the 교육 screens and 로봇 실습 7 listen and end what
 * they are doing, so nothing sends the arm a new target right after it was stopped.
 */

import { useEffect, useRef } from 'react';

const EVENT = 'eduino-robot-stop';

export function announceRobotStop() {
  window.dispatchEvent(new Event(EVENT));
}

/** Calls `onStop` whenever the robot is stopped from anywhere on the page. */
export function useRobotStop(onStop: () => void) {
  const ref = useRef(onStop);
  useEffect(() => {
    ref.current = onStop;
  });
  useEffect(() => {
    const f = () => ref.current();
    window.addEventListener(EVENT, f);
    return () => window.removeEventListener(EVENT, f);
  }, []);
}
