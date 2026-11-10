/**
 * myCobot 280 협동로봇 1단계: 기초 조작과 로봇 글씨 쓰기 — the 입문 트랙's course (보고 #48 · #49).
 * One source for the app and the 교안: 6 장, 29 서브챕터, 12차시, and the student's 교안 pages
 * (one book, 80 pages). A 서브챕터 is one scene in the app and two pages in the 교안 (its number,
 * '3-2', is the 교안's 장 · 절 number); the 위치 줄, the 서브챕터 list and the 학습 기록 read this.
 *
 * `run` is what the 서브챕터 opens: a 실습 셀 quest (글씨 쓰기 G1 …), a 기초 조작 tutorial
 * (lifeTutorials.ts), or nothing yet (만드는 중: shown in the list, not opened). No React.
 */

/** The six kinds of scene, all on one stage (보고 #49): the camera and the props change. */
export type SceneKind = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
export const SCENE_NAME: Record<SceneKind, string> = {
  A: '실습대 전체',
  B: '책상과 구성품',
  C: '로봇 근접 (관절)',
  D: '매트 위에서 (궤적)',
  E: '펜 끝 · 카드 근접',
  F: '사진 · 기록 화면',
};

export type SubRun = { kind: 'quest'; id: string } | { kind: 'tutorial'; id: string };

export interface CourseSub {
  /** '3-2': the 교안's 장 · 절 number. */
  id: string;
  title: string;
  /** Its 차시 (1 – 12). */
  lesson: number;
  /** Its 교안 pages (student's book). */
  pages: readonly [number, number];
  scene: SceneKind;
  /** The chapter's 수행평가 (O · X 5 + 미션). */
  test?: boolean;
  run?: SubRun;
}

export interface CourseChapter {
  n: number;
  title: string;
  subs: CourseSub[];
}

const q = (id: string): SubRun => ({ kind: 'quest', id });
const t = (id: string): SubRun => ({ kind: 'tutorial', id });

export const COURSE_NAME = 'myCobot 280 협동로봇 1단계: 기초 조작과 로봇 글씨 쓰기';
export const COURSE_LESSONS = 12;

export const COURSE: CourseChapter[] = [
  {
    n: 1,
    title: '협동로봇과 만나기',
    subs: [
      { id: '1-1', title: '협동로봇이란?', lesson: 1, pages: [2, 3], scene: 'A' },
      { id: '1-2', title: '로봇팔의 구조: 관절 · 좌표 · 도구', lesson: 1, pages: [4, 5], scene: 'C' },
      { id: '1-3', title: '안전하게 쓰기', lesson: 1, pages: [6, 7], scene: 'A' },
      { id: '1-4', title: '수행평가', lesson: 1, pages: [8, 9], scene: 'F', test: true },
    ],
  },
  {
    n: 2,
    title: '로봇 준비하기: 연결과 수업 세팅',
    subs: [
      { id: '2-1', title: '구성품과 작업대 놓기', lesson: 2, pages: [12, 13], scene: 'B' },
      { id: '2-2', title: 'PC에 시뮬레이터 설치 · 로봇 연결', lesson: 2, pages: [14, 15], scene: 'A' },
      { id: '2-3', title: '영점과 기본 자세 확인', lesson: 3, pages: [18, 19], scene: 'C' },
      { id: '2-4', title: '펜 끼우고 높이 맞추기', lesson: 3, pages: [20, 21], scene: 'E' },
      { id: '2-5', title: '수행평가', lesson: 3, pages: [22, 23], scene: 'A', test: true },
    ],
  },
  {
    n: 3,
    title: '기초 제어 ① 관절 제어',
    subs: [
      { id: '3-1', title: '관절 6개 알아보기', lesson: 4, pages: [26, 27], scene: 'C' },
      { id: '3-2', title: '관절 하나씩 움직이기: 각도와 방향', lesson: 4, pages: [28, 29], scene: 'C' },
      { id: '3-3', title: '움직일 수 있는 범위와 한계', lesson: 4, pages: [30, 31], scene: 'C' },
      { id: '3-4', title: '기본 · 영점 자세와 내 자세 저장', lesson: 5, pages: [34, 35], scene: 'C', run: t('pose') },
      { id: '3-5', title: '속도 조절과 멈추기', lesson: 5, pages: [36, 37], scene: 'C' },
      { id: '3-6', title: '수행평가', lesson: 5, pages: [38, 39], scene: 'C', test: true },
    ],
  },
  {
    n: 4,
    title: '기초 제어 ② 좌표와 궤적선 그리기',
    subs: [
      { id: '4-1', title: '좌표로 움직이기: X · Y · Z와 손끝', lesson: 6, pages: [42, 43], scene: 'D', run: t('taste') },
      { id: '4-2', title: '궤적선 켜고 선 긋기: 직선 이동 vs 관절 이동', lesson: 6, pages: [44, 45], scene: 'D' },
      { id: '4-3', title: '도형 그리기: 삼각형 · 사각형', lesson: 7, pages: [48, 49], scene: 'D', run: q('G3') },
      { id: '4-4', title: '곡선과 원 그리기', lesson: 7, pages: [50, 51], scene: 'D' },
      { id: '4-5', title: '수행평가', lesson: 8, pages: [54, 55], scene: 'D', test: true },
    ],
  },
  {
    n: 5,
    title: '로봇 글씨 쓰기: 시뮬레이션 → 실물',
    subs: [
      { id: '5-1', title: '글씨 쓰는 로봇의 한 사이클 보기', lesson: 9, pages: [58, 59], scene: 'A', run: q('G1') },
      { id: '5-2', title: '카드 위치 · 펜 높이 보정', lesson: 9, pages: [60, 61], scene: 'E', run: q('G2') },
      { id: '5-3', title: '획 나누기: 펜 들고 옮기기', lesson: 9, pages: [62, 63], scene: 'E', run: q('G4') },
      { id: '5-4', title: '내 글자 쓰기 (시뮬레이션)', lesson: 10, pages: [66, 67], scene: 'D' },
      { id: '5-5', title: '실물로 쓰기', lesson: 11, pages: [70, 71], scene: 'A' },
      { id: '5-6', title: '수행평가', lesson: 12, pages: [74, 75], scene: 'A', test: true },
    ],
  },
  {
    n: 6,
    title: '마무리: 학습 기록과 수업 후기',
    subs: [
      { id: '6-1', title: '챕터별 평가 결과 확인', lesson: 12, pages: [76, 76], scene: 'F' },
      { id: '6-2', title: '수업 후기 쓰기', lesson: 12, pages: [77, 78], scene: 'F' },
      { id: '6-3', title: '학습 기록 PDF로 저장하기', lesson: 12, pages: [79, 79], scene: 'F' },
    ],
  },
];

export const COURSE_SUBS: CourseSub[] = COURSE.flatMap((c) => c.subs);

export const subById = (id: string): CourseSub | undefined => COURSE_SUBS.find((s) => s.id === id);

/** The 서브챕터 a quest or a tutorial is (the first one it opens). */
export const subOfRun = (kind: SubRun['kind'], id: string): CourseSub | undefined => COURSE_SUBS.find((s) => s.run?.kind === kind && s.run.id === id);

/** The 차시 (1 – 12) and their 서브챕터, in course order. */
export function courseLessons(): { n: number; subs: CourseSub[] }[] {
  return Array.from({ length: COURSE_LESSONS }, (_, i) => ({ n: i + 1, subs: COURSE_SUBS.filter((s) => s.lesson === i + 1) }));
}

/** A chapter's title by a 서브챕터 id ('3-2' → 기초 제어 ① 관절 제어). */
export const chapterOf = (id: string): CourseChapter | undefined => COURSE.find((c) => c.subs.some((s) => s.id === id));

/** '교안 34~35쪽' (or '교안 76쪽'). */
export const pagesText = (p: readonly [number, number]) => (p[0] === p[1] ? `교안 ${p[0]}쪽` : `교안 ${p[0]}~${p[1]}쪽`);

/** The next 서브챕터 that opens in the app after this one (none: the course's end, or none built yet). */
export function nextRunnable(id: string): CourseSub | undefined {
  const k = COURSE_SUBS.findIndex((s) => s.id === id);
  return k < 0 ? undefined : COURSE_SUBS.slice(k + 1).find((s) => s.run);
}
