/**
 * 교육 홈 · 로봇 산업단지: the course as a walk through one industrial park. Seven sites in a fixed
 * order, each a scene with three problems to fix; a site opens when the one before it is finished
 * (a teacher can open them all). What makes a site finished:
 *  - 로봇 교육센터: the 1단원 차시 (the existing lessons — the basics before any site);
 *  - 스마트 공장: the three conveyor problems of the lab (lab/problems.ts);
 *  - 물류 센터: the three palletizing problems (lab/pallet.ts);
 *  - 바이오 실험실: the three tube-moving problems (lab/bio.ts);
 *  - 스마트팜: the three tomato-sorting problems (lab/farm.ts);
 *  - 서비스 카페: the three serving problems (lab/cafe.ts);
 *  - AI 연구소: the three AI-kit problems (lab/ai.ts) — the last site.
 * Everything is done with the myCobot 280 RDK X5 (the product the school has); other products get
 * their own problems when they come.
 * Each problem names the 단원 whose principle it teaches (the theory is in that 단원's PDF).
 */

import { topicsOf, type CategoryId, type TopicId } from './catalog';

export type SiteId = 'center' | 'factory' | 'logistics' | 'lab' | 'farm' | 'cafe' | 'ai';
/** The problem-solving labs (one per site that has one). */
export type LabId = 'factory' | 'logistics' | 'bio' | 'farm' | 'cafe' | 'ai';

export interface SiteProblem {
  title: string;
  /** Its screen is built (a lab site's problems can come one at a time). */
  ready?: boolean;
  /** What gets changed to fix it, in a few words. */
  fix: string;
  /** The 단원 whose principle it teaches. */
  units: readonly CategoryId[];
}

export interface Site {
  id: SiteId;
  name: string;
  /** The industry, in a word or two. */
  kind: string;
  robot: string;
  desc: string;
  color: string;
  /** What the site's problems are, once it has screens: 'lessons' (1단원 차시), 'lab' (a problem-solving lab, `lab`), or null (준비 중). */
  content: 'lessons' | 'lab' | null;
  lab?: LabId;
  problems: readonly SiteProblem[];
}

export const SITES: readonly Site[] = [
  {
    id: 'center',
    name: '로봇 교육센터',
    kind: '기초',
    robot: 'myCobot 280',
    desc: '로봇의 몸과 좌표부터 익히는 출발점이에요.',
    color: '#7c8db0',
    content: 'lessons',
    problems: [], // the 1단원 차시 (centerTopics)
  },
  {
    id: 'factory',
    name: '스마트 공장',
    kind: '제조',
    robot: 'myCobot 280 + 컨베이어',
    desc: '컨베이어로 오는 상자를 집어 옮기는 라인이에요. 고장 난 공정을 값을 바꿔 고쳐요.',
    color: '#2f5be7',
    content: 'lab',
    lab: 'factory',
    problems: [
      { title: '옆을 집는다', fix: '관절 각도로 손끝 맞추기', units: ['2'], ready: true },
      { title: '자리가 매번 바뀐다', fix: '좌표 지정 · 닿을 수 없는 자리', units: ['2', '1'], ready: true },
      { title: '움직이는 상자를 놓친다', fix: '출발 시점 · 속도', units: ['3'], ready: true },
    ],
  },
  {
    id: 'logistics',
    name: '물류 센터',
    kind: '물류',
    robot: 'myCobot 280 + 흡착 펌프',
    desc: '컨베이어로 오는 상자를 팔레트에 차곡차곡 쌓아요 (팔레타이징).',
    color: '#d9622b',
    content: 'lab',
    lab: 'logistics',
    problems: [
      { title: '쌓다가 무너진다', fix: '층마다 놓는 높이 · 여유', units: ['2', '6'], ready: true },
      { title: '빨리 하니 미끄러진다', fix: '속도 · 가속도와 흡착력', units: ['3', '4'], ready: true },
      { title: '팔레트 자리가 바뀐다', fix: '기준점 다시 잡기 · 좌표 보정', units: ['1', '2'], ready: true },
    ],
  },
  {
    id: 'lab',
    name: '바이오 실험실',
    kind: '의료 · 실험',
    robot: 'myCobot 280 + 어댑티브 그리퍼',
    desc: '시료가 든 시험관을 쏟지 않고, 정확히, 부딪히지 않게 옮겨요.',
    color: '#12935f',
    content: 'lab',
    lab: 'bio',
    problems: [
      { title: '시험관이 기울어 쏟아진다', fix: '자세(rx · ry · rz) 유지', units: ['1', '2'], ready: true },
      { title: '먼 칸일수록 어긋난다', fix: '영점 오차와 캘리브레이션', units: ['5'], ready: true },
      { title: '돌아가는 길에 부딪힌다', fix: '경유점 · 충돌 검사', units: ['6', '1'], ready: true },
    ],
  },
  {
    id: 'farm',
    name: '스마트팜 · 식품',
    kind: '농업 · 식품',
    robot: 'myCobot 280 + 카메라 · 어댑티브 그리퍼',
    desc: '카메라로 익은 방울토마토만 찾아, 터뜨리지 않고 포장해요.',
    color: '#3a9b3a',
    content: 'lab',
    lab: 'farm',
    problems: [
      { title: '덜 익은 것도 딴다', fix: '색으로 찾기 · 문턱값', units: ['7'], ready: true },
      { title: '카메라와 손끝이 안 맞는다', fix: '픽셀 → mm · 카메라 보정', units: ['7', '2'], ready: true },
      { title: '물러서 터진다', fix: '잡는 힘 · 안전 여유', units: ['4', '5'], ready: true },
    ],
  },
  {
    id: 'cafe',
    name: '서비스 카페',
    kind: '서비스',
    robot: 'myCobot 280 + 어댑티브 그리퍼',
    desc: '음료를 흘리지 않고, 손님 손 앞에서 멈춰, 무거운 병도 건네요.',
    color: '#b4530f',
    content: 'lab',
    lab: 'cafe',
    problems: [
      { title: '커피가 넘친다', fix: '가속도 · 궤적 프로파일', units: ['3'], ready: true },
      { title: '손과 가까워진다', fix: '보호 거리 · 속도 제한', units: ['5'], ready: true },
      { title: '컵 무게가 바뀐다', fix: '관성과 가속 토크', units: ['4'], ready: true },
    ],
  },
  {
    id: 'ai',
    name: 'AI 연구소',
    kind: '종합 미션',
    robot: 'myCobot 280 + AI 키트 (카메라 · 흡착)',
    desc: '보고 판단해서 스스로 집어 놓아요. 배운 것을 모두 써요.',
    color: '#7a3fd1',
    content: 'lab',
    lab: 'ai',
    problems: [
      { title: '색이 섞여 있다', fix: '겹치는 색 범위 · 판별 순서', units: ['7'], ready: true },
      { title: '시연을 보고 따라 하기', fix: '궤적 재생과 정책', units: ['8'], ready: true },
      { title: '처음 보는 물건', fix: '파이프라인 · 높이와 시차', units: ['6', '7', '8'], ready: true },
    ],
  },
];

export const SITE_BY_ID: ReadonlyMap<SiteId, Site> = new Map(SITES.map((s) => [s.id, s]));

/** The 차시 the 교육센터 asks for: 1단원 (기초). */
export const centerTopics = (): readonly TopicId[] => topicsOf('1').map((t) => t.id);

/** What has been done so far: finished 차시 and, per lab, its solved problems (1 · 2 · 3). */
export interface ParkProgress {
  done: Partial<Record<TopicId, boolean>>;
  solved: Partial<Record<LabId, Partial<Record<1 | 2 | 3, boolean>>>>;
}

/** How many of a site's problems are done, out of how many (null: 준비 중). */
export function siteScore(id: SiteId, p: ParkProgress): { done: number; of: number } | null {
  const s = SITE_BY_ID.get(id)!;
  if (s.content === 'lessons') {
    const t = centerTopics();
    return { done: t.filter((x) => p.done[x]).length, of: t.length };
  }
  if (s.content === 'lab') return { done: ([1, 2, 3] as const).filter((k) => p.solved[s.lab!]?.[k]).length, of: s.problems.length };
  return null;
}

export const siteFinished = (id: SiteId, p: ParkProgress) => {
  const sc = siteScore(id, p);
  return !!sc && sc.done === sc.of;
};

export type SiteState = 'done' | 'open' | 'locked';

/** Done, open (the one before is finished, or all are opened), or locked. */
export function siteStates(p: ParkProgress, allOpen = false): Record<SiteId, SiteState> {
  const out = {} as Record<SiteId, SiteState>;
  SITES.forEach((s, i) => {
    const prevDone = i === 0 || siteFinished(SITES[i - 1].id, p);
    out[s.id] = siteFinished(s.id, p) ? 'done' : prevDone || allOpen ? 'open' : 'locked';
  });
  return out;
}

/** The site to go to next: the first one open and not finished (the 교육센터 when nothing is done). */
export function currentSite(p: ParkProgress): SiteId {
  const st = siteStates(p);
  return SITES.find((s) => st[s.id] === 'open')?.id ?? SITES[SITES.length - 1].id;
}
