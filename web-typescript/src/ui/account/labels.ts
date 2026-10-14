/**
 * Words the account screens share: lesson and lab names for "지금 어디", how long ago, the flags of
 * the live grid, and the Korean for the class server's errors.
 */

import { ClassApiError, placeLabel, type LiveFlag, type Place } from '@/engine/account';
import { TOPICS } from '@/engine/education/catalog';
import { THEMES } from '@/engine/education/park';
import { UNITS, unitLesson } from '@/engine/education/practice7';

const LESSON_NAMES: Record<string, string> = Object.fromEntries([
  ...TOPICS.map((t) => [t.id, `${t.id} ${t.title}`]),
  ...UNITS.map((u) => [unitLesson(u.id), `로봇 실습 7-${u.id} ${u.title}`]),
]);
const LAB_NAMES: Record<string, string> = Object.fromEntries(THEMES.filter((s) => s.lab).map((s) => [s.lab!, s.name]));
const PAGE_NAMES: Record<string, string> = { intro: '도입', theory: '개념', A: '활동 1', B: '활동 2', C: '활동 3', cmp: '정리', check: '평가' };

/** Where a student is, in the teacher's words ("2-1 좌표 변환과 순기구학 · 활동 1", "스마트팩토리 문제 2"). */
export function placeText(place: Place | null): string {
  if (!place) return '아직 기록 없음';
  if (place.kind === 'lesson') {
    const l = LESSON_NAMES[place.lesson] ?? `차시 ${place.lesson}`;
    return place.page === undefined ? l : `${l} · ${PAGE_NAMES[place.page] ?? place.page}`;
  }
  if (place.kind === 'quiz' && place.quiz !== 'final') return `${LESSON_NAMES[place.quiz] ?? `차시 ${place.quiz}`} · 확인 문제`;
  if (place.kind === 'robot') return '실물 로봇';
  return placeLabel(place, { lab: LAB_NAMES, lesson: LESSON_NAMES });
}

/** "방금", "3분 전", "2시간 전". */
export function ago(ms: number | null, now: number): string {
  if (!ms) return '—';
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 45) return '방금';
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))}분 전`;
  if (s < 86400) return `${Math.round(s / 3600)}시간 전`;
  return `${Math.round(s / 86400)}일 전`;
}

/** A clock time, "14:05". */
export function clock(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export const FLAG_TEXT: Record<LiveFlag | 'active', string> = {
  active: '수업 중',
  stuck: '막힘',
  idle: '쉬는 중',
  offline: '오프라인',
  never: '아직 안 들어옴',
  locked: '잠김',
};

/** An error as one calm Korean sentence for the screen (never the token or the PIN). */
export function errorText(e: unknown, who: 'student' | 'teacher' = 'teacher'): string {
  if (e instanceof ClassApiError) {
    if (e.offline) return '학급 서버에 연결할 수 없어요. 선생님 PC 의 학급 서버가 켜져 있는지, 같은 와이파이인지 확인해 주세요.';
    if (e.code === 'wrong') return who === 'student' ? '학급 코드, 번호, PIN 이 맞지 않아요. 카드를 다시 확인해 주세요.' : '아이디나 비밀번호가 맞지 않아요.';
    if (e.code === 'locked') {
      const secs = e.retryAfter ?? 60;
      const until = clock(Date.now() + secs * 1000);
      const mins = Math.max(1, Math.ceil(secs / 60));
      return who === 'student'
        ? `여러 번 틀려서 잠시 잠겼어요. ${until}에 풀려요 (약 ${mins}분 뒤). 급하면 선생님께 PIN 을 다시 받아 주세요.`
        : `여러 번 틀려서 잠시 잠겼어요. ${until}에 풀려요 (약 ${mins}분 뒤).`;
    }
    if (e.code === 'login') return '로그인이 끝났어요. 다시 로그인해 주세요.';
    if (e.code === 'role') return '이 기능을 쓸 권한이 없어요.';
    if (e.code === 'archived') return '보관된 학급이에요. 보관을 풀어야 바꿀 수 있어요.';
    if (e.code === 'origin') return '이 주소에서는 학급 서버를 쓸 수 없어요. 선생님 화면에 보이는 주소로 열어 주세요.';
    return e.message;
  }
  return e instanceof Error ? e.message : String(e);
}
