/**
 * 저작권 안내 (입문 트랙, 피드백 v2 파트 1): shown once each time the content opens, before the
 * course is picked ([확인하고 시작]), and one line at the foot of the 학습 기록 PDF. The one place
 * to change the wording.
 */

export const COPYRIGHT_NOTICE = {
  kicker: '시작하기 전에',
  title: '이 콘텐츠는 저작권 보호를 받습니다',
  // (One sentence a line: no period at its end — 수정 지시서 v4 파트 6-9.)
  lines: ['수업과 기관 내부 교육에서만 사용할 수 있습니다', '허락 없이 복제, 배포, 판매하거나 화면을 녹화해 공유할 수 없습니다', '위반하면 저작권법에 따라 책임을 질 수 있습니다'],
  owner: '© (주)로보다인시스템 · 에듀이노',
  ok: '확인하고 시작',
} as const;

/** The 학습 기록 PDF's last line. */
export const COPYRIGHT_RECORD_LINE = '이 자료의 저작권은 (주)로보다인시스템에 있으며, 무단 복제와 배포를 금합니다';
