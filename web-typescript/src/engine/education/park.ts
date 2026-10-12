/**
 * 교육 홈 · 로봇 시티: the course as one island city (the map: ui/education/map/world). Nine places:
 *  - 로봇 아카데미 (가운데, 'center'): the 8학문 28차시 theory course;
 *  - seven theme districts, each a real field where robots work, with a social problem and three
 *    problems the student fixes in its lab: 스마트팩토리 (lab/problems.ts), 물류 허브 (lab/pallet.ts),
 *    바이오·헬스케어 (lab/bio.ts), 스마트팜 (lab/farm.ts), 스마트시티 (lab/cafe.ts), 피지컬 AI 연구소
 *    (lab/ai.ts), 에너지·자원순환 (lab/energy.ts);
 *  - 디지털 트윈 관제센터 ('data'): data science over every lab run (runLog.ts) and the sim ↔ robot twin.
 * Theory and practice take turns: each problem names the 차시 a beginner learns first (`needs`); a
 * theme opens when its problem 1 can be followed, its other problems as their 차시 are learnt, and the
 * next step (nextStep) sends the student to a problem as soon as it opens, else to the next 차시
 * (a teacher can open everything). The practice robot is the myCobot 280 RDK X5 (what the school has);
 * each district also names the robots that work in that field (`crew`) — arms, mobile manipulators,
 * AGVs — which the map shows and which get their own problems as they come.
 * Each problem also names the 단원 whose principle it teaches (`units`, the links to the theory).
 */

import { TOPICS, lessonNo, topicsOf, type CategoryId, type TopicId } from './catalog';

export type SiteId = 'center' | 'factory' | 'logistics' | 'lab' | 'farm' | 'cafe' | 'ai' | 'energy' | 'data';
/** The problem-solving labs (one per site that has one). */
export type LabId = 'factory' | 'logistics' | 'bio' | 'farm' | 'cafe' | 'ai' | 'energy';

export interface SiteProblem {
  title: string;
  /** Its screen is built (a lab site's problems can come one at a time). */
  ready?: boolean;
  /** What gets changed to fix it, in a few words. */
  fix: string;
  /** The 단원 whose principle it teaches (the links to the theory). */
  units: readonly CategoryId[];
  /** The 차시 a beginner learns first — the problem opens once they are done (its site opens with problem 1's). */
  needs: readonly TopicId[];
}

export interface Site {
  id: SiteId;
  name: string;
  /** A short name for the top bar. */
  short: string;
  /** The industry, in a word or two. */
  kind: string;
  /** The technology the place stands for, as a keyword button on the map (인공지능, 데이터 사이언스, …). */
  keyword: string;
  /** Icon name (ui/simulator/Icon) of that keyword. */
  icon: string;
  /** The robot the student works with here. */
  robot: string;
  desc: string;
  /** The social problem the field faces, one line (themes and the data centre). */
  issue?: string;
  /** The robots that work in this field (shown on the map and the card), the practice robot first. */
  crew: readonly string[];
  color: string;
  /** What the place holds: 'lessons' (the theory course), 'lab' (a problem-solving lab, `lab`), 'data' (the data centre), or null (준비 중). */
  content: 'lessons' | 'lab' | 'data' | null;
  lab?: LabId;
  problems: readonly SiteProblem[];
}

export const SITES: readonly Site[] = [
  {
    id: 'center',
    name: '로봇 아카데미',
    short: '아카데미',
    kind: '로봇공학 이론',
    keyword: '로봇공학',
    icon: 'school',
    robot: 'myCobot 280',
    desc: '로봇공학 28차시를 배우는 곳이에요. 몸 · 움직임 · 제어 · 인식을 배워요. 차시를 배우면 도시의 현장이 열려요.',
    crew: ['myCobot 280'],
    color: '#2f5be7',
    content: 'lessons',
    problems: [], // the 1단원 차시 (centerTopics)
  },
  {
    id: 'factory',
    name: '스마트팩토리',
    short: '팩토리',
    kind: '제조 AI · 공정',
    keyword: '제조 AI',
    icon: 'factory',
    robot: 'myCobot 280 + 컨베이어',
    desc: '상자를 집어 옮기는 라인이에요. 고장 난 공정을 값을 바꿔 고쳐요.',
    issue: '일할 사람은 줄어요. 손으로 하는 반복 작업은 불량이 나요.',
    crew: ['myCobot 280', '컨베이어 · 비전 검사', '모바일 매니퓰레이터 (부품 공급)', 'myAGV (공정 간 운반)'],
    color: '#2f6fe7',
    content: 'lab',
    lab: 'factory',
    problems: [
      { title: '옆을 집는다', fix: '관절 각도로 손끝 맞추기', units: ['2'], needs: ['2-1'], ready: true },
      { title: '자리가 매번 바뀐다', fix: '좌표 지정 · 닿을 수 없는 자리', units: ['2', '1'], needs: ['1-4', '2-2'], ready: true },
      { title: '움직이는 상자를 놓친다', fix: '출발 시점 · 속도', units: ['3'], needs: ['2-3', '3-2'], ready: true },
    ],
  },
  {
    id: 'logistics',
    name: '물류 허브',
    short: '물류',
    kind: '물류 · 팔레타이징',
    keyword: '물류 자동화',
    icon: 'box',
    robot: 'myCobot 280 + 흡착 펌프',
    desc: '오는 상자를 팔레트에 차곡차곡 쌓아요. 이 일을 팔레타이징이라고 해요.',
    issue: '택배는 계속 늘어요. 무거운 상자를 들다 다치는 사람이 많아요.',
    crew: ['myCobot 280 + 흡착', 'myPalletizer (4축 적재)', 'myAGV (팔레트 운반)', '항만 크레인'],
    color: '#e0662b',
    content: 'lab',
    lab: 'logistics',
    problems: [
      { title: '쌓다가 무너진다', fix: '층마다 놓는 높이 · 여유', units: ['2', '6'], needs: ['2-2'], ready: true },
      { title: '빨리 하니 미끄러진다', fix: '속도 · 가속도와 흡착력', units: ['3', '4'], needs: ['3-2', '4-2'], ready: true },
      { title: '팔레트 자리가 바뀐다', fix: '기준점 다시 잡기 · 좌표 보정', units: ['1', '2'], needs: ['1-2', '2-1'], ready: true },
    ],
  },
  {
    id: 'lab',
    name: '바이오·헬스케어',
    short: '바이오',
    kind: '실험 자동화 · 의료',
    keyword: '바이오 · 의료',
    icon: 'flask',
    robot: 'myCobot 280 + 어댑티브 그리퍼',
    desc: '시료가 든 시험관을 옮겨요. 쏟지 않고, 부딪히지 않고, 정확히요.',
    issue: '감염 위험이 있는 시료를 사람이 다뤄요. 반복 실험에서 작은 오차가 쌓여요.',
    crew: ['myCobot 280 + 그리퍼', '실험실 협동로봇', '배송 로봇 (검체 운반)'],
    color: '#d23c6a',
    content: 'lab',
    lab: 'bio',
    problems: [
      { title: '시험관이 기울어 쏟아진다', fix: '자세(rx · ry · rz) 유지', units: ['1', '2'], needs: ['1-2', '1-3'], ready: true },
      { title: '먼 칸일수록 어긋난다', fix: '영점 오차와 캘리브레이션', units: ['5'], needs: ['5-5'], ready: true },
      { title: '돌아가는 길에 부딪힌다', fix: '경유점 · 충돌 검사', units: ['6', '1'], needs: ['6-1', '6-2'], ready: true },
    ],
  },
  {
    id: 'farm',
    name: '스마트팜',
    short: '스마트팜',
    kind: '수확 · 선별 자동화',
    keyword: '스마트 농업',
    icon: 'leaf',
    robot: 'myCobot 280 + 카메라 · 어댑티브 그리퍼',
    desc: '카메라로 익은 방울토마토만 찾아요. 터뜨리지 않고 포장해요.',
    issue: '농촌은 일손이 모자라요. 수확 시기를 놓치면 작물이 버려져요.',
    crew: ['myCobot 280 + 카메라', '수확용 모바일 매니퓰레이터', '자율 트랙터'],
    color: '#3f9b3a',
    content: 'lab',
    lab: 'farm',
    problems: [
      { title: '덜 익은 것도 딴다', fix: '색으로 찾기 · 문턱값', units: ['7'], needs: ['7-2'], ready: true },
      { title: '카메라와 손끝이 안 맞는다', fix: '픽셀 → mm · 카메라 보정', units: ['7', '2'], needs: ['7-1'], ready: true },
      { title: '물러서 터진다', fix: '잡는 힘 · 안전 여유', units: ['4', '5'], needs: ['4-3', '5-4'], ready: true },
    ],
  },
  {
    id: 'cafe',
    name: '스마트시티',
    short: '시티',
    kind: '서비스 로봇 · 돌봄',
    keyword: '서비스 로봇',
    icon: 'cup',
    robot: 'myCobot 280 + 어댑티브 그리퍼 · myAGV 위 280 (모바일 매니퓰레이터)',
    desc: '카페에서는 음료를 흘리지 않고 건네요. 손님 손 앞에서는 멈춰요. 돌봄 센터에서는 어르신께 물병을 건네요.',
    issue: '돌봄 · 서비스 일손이 모자라요. 사람 곁의 로봇은 안전해야 해요.',
    crew: ['myCobot 280 (서빙)', '배달 로봇', '돌봄 보조 모바일 매니퓰레이터'],
    color: '#e39a1c',
    content: 'lab',
    lab: 'cafe',
    problems: [
      { title: '커피가 넘친다', fix: '가속도 · 궤적 프로파일', units: ['3'], needs: ['3-2'], ready: true },
      { title: '손과 가까워진다', fix: '보호 거리 · 속도 제한', units: ['5'], needs: ['5-4'], ready: true },
      { title: '물병이 무거워졌다 (돌봄)', fix: '관성과 가속 토크', units: ['4'], needs: ['4-2'], ready: true },
    ],
  },
  {
    id: 'ai',
    name: '피지컬 AI 연구소',
    short: 'AI 연구소',
    kind: 'AI 인식 · 학습',
    keyword: '인공지능',
    icon: 'brain',
    robot: 'myCobot 280 + AI 키트 (카메라 · 흡착)',
    desc: '보고 판단해서 스스로 집어 놓아요. 배운 것을 모두 써요.',
    issue: '로봇이 처음 보는 물건도 다뤄야 해요. 스스로 보고 판단해야 해요.',
    crew: ['myCobot 280 + AI 키트', 'mechArm (시연 학습)', '모바일 매니퓰레이터', '드론'],
    color: '#7a4fe0',
    content: 'lab',
    lab: 'ai',
    problems: [
      { title: '색이 섞여 있다', fix: '겹치는 색 범위 · 판별 순서', units: ['7'], needs: ['7-2'], ready: true },
      { title: '시연을 보고 따라 하기', fix: '궤적 재생과 정책', units: ['8'], needs: ['8-1'], ready: true },
      { title: '처음 보는 물건', fix: '파이프라인 · 높이와 시차', units: ['6', '7', '8'], needs: ['6-3', '7-1', '8-2'], ready: true },
    ],
  },
  {
    id: 'energy',
    name: '에너지·자원순환',
    short: '자원순환',
    kind: '재활용 선별 · 탄소',
    keyword: '자원순환',
    icon: 'recycle',
    robot: 'myCobot 280 + AI 키트 (카메라 · 흡착)',
    desc: '섞여 온 재활용품을 카메라로 알아봐요. 재질별 분류함에 빠르게 나눠요.',
    issue: '분리배출이 잘못돼 재활용이 잘 안 돼요. 선별 작업은 위험하고 느려요.',
    crew: ['myCobot 280 + AI 키트', '선별 로봇 라인', '수거 트럭 · 풍력 · 태양광'],
    color: '#0b8a7a',
    content: 'lab',
    lab: 'energy',
    problems: [
      { title: '투명 PET가 안 보인다', fix: '밝기 범위 · 배경과의 여유', units: ['7'], needs: ['7-2'], ready: true },
      { title: '빨리 하면 떨어진다', fix: '종류마다 속도 · 분당 처리량', units: ['3', '4'], needs: ['3-2', '4-3'], ready: true },
      { title: '겹쳐 놓인 쓰레기', fix: '온전히 보이는 것부터 · 집는 순서', units: ['6', '7'], needs: ['6-4', '7-2'], ready: true },
    ],
  },
  {
    id: 'data',
    name: '디지털 트윈 관제센터',
    short: '관제센터',
    kind: '데이터 사이언스',
    keyword: '데이터 사이언스',
    icon: 'chart',
    robot: '모든 현장의 기록',
    desc: '모든 현장의 실습 기록이 모여요. 그래프로 비교하고 병목을 찾아요. 시뮬과 실제 로봇도 견줘요.',
    issue: '현장 데이터는 쌓여요. 읽고 고치는 데 쓸 사람이 모자라요.',
    crew: ['디지털 트윈', '현장 센서 · 로봇 기록'],
    color: '#0fa3b8',
    content: 'data',
    problems: [],
  },
];

export const SITE_BY_ID: ReadonlyMap<SiteId, Site> = new Map(SITES.map((s) => [s.id, s]));

/** The places the theme labs count in (everything but the academy and the data centre). */
export const THEMES: readonly Site[] = SITES.filter((s) => s.content === 'lab');

/** The 로봇 아카데미's 차시: the whole theory course, in order. */
export const centerTopics = (): readonly TopicId[] => TOPICS.map((t) => t.id);

/** What has been done so far: finished 차시 and, per lab, its solved problems (1 · 2 · 3). */
export interface ParkProgress {
  done: Partial<Record<TopicId, boolean>>;
  solved: Partial<Record<LabId, Partial<Record<1 | 2 | 3, boolean>>>>;
}

export type ProblemNo = 1 | 2 | 3;
const NOS: readonly ProblemNo[] = [1, 2, 3];

/** The 차시 the academy is on: the 단원 of the first one not done (all done: the last 단원). */
export function currentUnit(p: ParkProgress): CategoryId {
  const t = TOPICS.find((x) => !p.done[x.id]) ?? TOPICS[TOPICS.length - 1];
  return t.cat as CategoryId;
}
export const unitTopics = (p: ParkProgress): readonly TopicId[] => topicsOf(currentUnit(p)).map((t) => t.id);

/** How many of a site's problems are done, out of how many (null: 준비 중). The academy counts all 28 차시. */
export function siteScore(id: SiteId, p: ParkProgress): { done: number; of: number } | null {
  const s = SITE_BY_ID.get(id)!;
  if (s.content === 'lessons') {
    const t = centerTopics();
    return { done: t.filter((x) => p.done[x]).length, of: t.length };
  }
  if (s.content === 'lab') return { done: NOS.filter((k) => p.solved[s.lab!]?.[k]).length, of: s.problems.length };
  return null;
}

export const siteFinished = (id: SiteId, p: ParkProgress) => {
  const sc = siteScore(id, p);
  return !!sc && sc.done === sc.of;
};

export type SiteState = 'done' | 'open' | 'locked';

/** The 차시 still to learn before a site's problem `k` opens (none: open). */
export function problemMissing(site: Site, k: ProblemNo, p: ParkProgress): readonly TopicId[] {
  return (site.problems[k - 1]?.needs ?? []).filter((t) => !p.done[t]);
}

/**
 * Done, open, or locked. The academy is always open. A theme opens when its problem 1 can be followed
 * (the 차시 it needs are done) — its problems 2 and 3 each open on their own 차시 in the lab; the data
 * centre opens with the first theme. A teacher can open everything.
 */
export function siteStates(p: ParkProgress, allOpen = false): Record<SiteId, SiteState> {
  const out = {} as Record<SiteId, SiteState>;
  for (const s of SITES) {
    if (siteFinished(s.id, p)) out[s.id] = 'done';
    else if (s.content === 'lessons' || allOpen) out[s.id] = 'open';
    else if (s.content === 'lab') out[s.id] = problemMissing(s, 1, p).length === 0 ? 'open' : 'locked';
    else out[s.id] = THEMES.some((t) => problemMissing(t, 1, p).length === 0) ? 'open' : 'locked';
  }
  return out;
}

/** Per lab, its problems that are not open yet and the 차시 each still needs (a teacher's 모든 현장 열기: none). */
export function labLocks(p: ParkProgress, allOpen = false): Record<LabId, Partial<Record<ProblemNo, readonly TopicId[]>>> {
  const out = {} as Record<LabId, Partial<Record<ProblemNo, readonly TopicId[]>>>;
  for (const s of THEMES) {
    const locks: Partial<Record<ProblemNo, readonly TopicId[]>> = {};
    if (!allOpen) for (const k of NOS) if (!p.solved[s.lab!]?.[k] && problemMissing(s, k, p).length) locks[k] = problemMissing(s, k, p);
    out[s.lab!] = locks;
  }
  return out;
}

/** What to do next. */
export type NextStep = { kind: 'topic'; topic: TopicId } | { kind: 'lab'; site: SiteId; lab: LabId; prob: ProblemNo; uses: readonly TopicId[] } | { kind: 'data' };

/**
 * The course's next step, theory and practice in turn: as soon as a site problem can be followed (its
 * 차시 learnt, and the site's earlier problems solved — ① 안내형 → ② → ③ 열린 과제), use what was just
 * learnt there; otherwise the next 차시. Among open problems, the one whose 차시 came earliest first.
 */
export function nextStep(p: ParkProgress): NextStep {
  let best: { site: Site; k: ProblemNo; at: number } | null = null;
  for (const s of THEMES) {
    for (const k of NOS) {
      if (p.solved[s.lab!]?.[k]) continue;
      const prev = NOS.filter((j) => j < k).every((j) => p.solved[s.lab!]?.[j]);
      if (!prev || !s.problems[k - 1]?.ready || problemMissing(s, k, p).length) break;
      const at = Math.max(0, ...s.problems[k - 1].needs.map(lessonNo));
      if (!best || at < best.at) best = { site: s, k, at };
      break;
    }
  }
  if (best) return { kind: 'lab', site: best.site.id, lab: best.site.lab!, prob: best.k, uses: best.site.problems[best.k - 1].needs };
  const t = TOPICS.find((x) => !p.done[x.id]);
  return t ? { kind: 'topic', topic: t.id } : { kind: 'data' };
}

/** The place the next step is in (the map marks it). */
export function currentSite(p: ParkProgress): SiteId {
  const n = nextStep(p);
  return n.kind === 'topic' ? 'center' : n.kind === 'lab' ? n.site : 'data';
}

/** The site problems a 차시 is a step towards (it is among the 차시 they need), in site order. */
export function problemsUsing(topic: TopicId): readonly { site: Site; k: ProblemNo }[] {
  return THEMES.flatMap((s) => NOS.filter((k) => s.problems[k - 1]?.needs.includes(topic)).map((k) => ({ site: s, k })));
}
