/**
 * The roadmap around the 8 학문 (content-markdown/reference/roadmap-v3.txt): the three 대단원
 * they are grouped in (as a textbook groups its chapters), the fields of robotics this course
 * leaves for later (drawn grey), the products a school may own and what each lets a student
 * practise, and the "what next" recommendation.
 *
 * Product coverage is a draft (초안) until the product line is fixed. The line-up is Elephant
 * Robotics' robots (eduino.kr sells myCobot 280 · 320, myAGV 2023 and the AI Kit; the rest are on
 * the maker's own shop) plus the other kits schools already have.
 */

import { CATEGORIES, TOPICS, topicsOf, type Category, type CategoryId, type TopicId } from './catalog';

export type PartId = 'I' | 'II' | 'III';

/** A 대단원: 단원 (학문) grouped as a textbook groups its chapters. */
export interface Part {
  id: PartId;
  /** The Roman numeral the textbook uses: Ⅰ Ⅱ Ⅲ. */
  no: string;
  title: string;
  subjects: readonly CategoryId[];
  /** Its colour on the roadmap, the 대단원 panel and the print materials, and a pale one behind it. */
  color: string;
  soft: string;
  /** What a student can do once it is done (마치면 할 수 있어요). */
  goal: string;
}

/** The three 대단원: 구조와 움직임 (1–3), 힘과 제어 (4–5), 지능형 로봇 (6–8). */
export const PARTS: readonly Part[] = [
  { id: 'I', no: 'Ⅰ', title: '로봇의 구조와 움직임', subjects: ['1', '2', '3'], color: '#2f5be7', soft: '#eaf0ff', goal: '관절과 좌표로 손끝 위치를 계산하고, 부드러운 경로로 보낼 수 있다' },
  { id: 'II', no: 'Ⅱ', title: '로봇의 힘과 제어', subjects: ['4', '5'], color: '#d9622b', soft: '#fff1e8', goal: '무게를 버틸 힘을 계산하고, 피드백으로 오차를 줄여 정확히 세울 수 있다' },
  { id: 'III', no: 'Ⅲ', title: '지능형 로봇', subjects: ['6', '7', '8'], color: '#12935f', soft: '#e6f6ee', goal: '카메라로 보고, 충돌 없이 계획하고, 시연으로 배워 스스로 집고 놓을 수 있다' },
];

export const partOf = (id: CategoryId) => PARTS.find((p) => p.subjects.includes(id))!;

/** What a 단원 is about in a few words — under its name on the 단원 card. */
export const UNIT_WHAT: Record<CategoryId, string> = {
  '1': '관절 · 좌표 · 자세 · 작업 공간',
  '2': '관절 각도 ↔ 손끝 위치',
  '3': '속도와 부드러운 경로',
  '4': '무게와 힘(토크)',
  '5': '피드백으로 오차 줄이기',
  '6': '충돌 없이 집고 놓기',
  '7': '카메라로 물체 찾기',
  '8': '시연으로 배우고 스스로 하기',
};

export type StopIcon = 'arm' | 'target' | 'curve' | 'weight' | 'gauge' | 'route' | 'eye' | 'spark';

/** The roadmap's stations: a short name, two words under it, and the icon (roadmap/Roadmap.tsx). */
export const UNIT_STOP: Record<CategoryId, { name: string; sub: string; icon: StopIcon }> = {
  '1': { name: '기초 로봇공학', sub: '몸과 좌표', icon: 'arm' },
  '2': { name: '기구학·역기구학', sub: '각도 ↔ 위치', icon: 'target' },
  '3': { name: '미분기구학', sub: '속도 · 경로', icon: 'curve' },
  '4': { name: '로봇 동역학', sub: '무게 · 토크', icon: 'weight' },
  '5': { name: '로봇 제어공학', sub: '피드백', icon: 'gauge' },
  '6': { name: '동작 계획', sub: '피해 가기', icon: 'route' },
  '7': { name: '로봇 비전 · 인식', sub: '보고 찾기', icon: 'eye' },
  '8': { name: '로봇 학습', sub: '보고 배우기', icon: 'spark' },
};

/** What the robot can do once a 학문 is done — the line under its name in the 단원 preview. */
export const CAPABILITY: Record<CategoryId, string> = {
  '1': '로봇의 몸과 좌표를 읽는다',
  '2': '손끝을 원하는 곳에 보낸다',
  '3': '부드럽게 이어서 움직인다',
  '4': '무게를 버틸 힘을 안다',
  '5': '어긋나면 스스로 고친다',
  '6': '피해 가서 집고 쌓는다',
  '7': '카메라로 찾아낸다',
  '8': '보고 배워 해낸다',
};

/** The course's last lesson (8-2 캡스톤), on top of the 교육 home: what all 8 학문 add up to. */
export const GOAL = { topic: '8-2' as const, title: '보고, 판단하고, 스스로 집어 놓는 로봇까지', short: '보고 판단해 집어 놓기' };

/** A few words under each 학문's name on the roadmap (대학: the terms of the field). */
export const SUBJECT_TAG: Record<CategoryId, string> = {
  '1': 'DOF · Pose · Frame · Workspace',
  '2': 'FK · IK · MOVJ / MOVL',
  '3': 'Jacobian · S-curve · Blending',
  '4': '중력·관성 토크 · 마찰',
  '5': 'PID · 추종 · 힘 제한 · 보정',
  '6': '충돌 검사 · RRT · 집기 · 쌓기',
  '7': '카메라 보정 · HSV · 시각 서보',
  '8': '모방 학습 · Physical AI 캡스톤',
};

/** The same in everyday words (고등). */
export const SUBJECT_TAG_HS: Record<CategoryId, string> = {
  '1': '관절 수 · 위치와 방향 · 닿는 곳',
  '2': '각도 ↔ 손끝 위치 · 곧게 / 돌아서',
  '3': '손끝 속도 · 부드럽게 출발·정지',
  '4': '무게를 버티는 힘 · 모터 한계',
  '5': '목표를 보고 고치기 · 흔들림 줄이기',
  '6': '부딪히지 않는 길 · 집기 · 쌓기',
  '7': '카메라로 색·위치 찾기',
  '8': '보여 주면 따라 하기 · 스스로 해내기',
};

export type StudyLevel = 'hs' | 'uni';

/** How the roadmap differs for a high-school class and a university class. */
export interface LevelView {
  name: string;
  /** The course in one line, under the title. */
  title: string;
  lead: string;
  /** Minutes one topic takes in class. */
  minutes: number;
  /** 학문 that are optional (심화) at this level: shown, never required before the next one. */
  optional: readonly CategoryId[];
  /** Outside fields shown on the map at this level. */
  fields: readonly FieldId[];
  /** What the level shows inside a lesson. */
  includes: readonly string[];
}

export const LEVEL_VIEW: Record<StudyLevel, LevelView> = {
  hs: {
    name: '고등',
    title: '보고 움직이며 원리 잡기',
    lead: '수식 없이 3D 시뮬레이터로 해 보고, 결과를 내 말로 설명해요. 한 주제 = 50분 한 차시.',
    minutes: 50,
    // 4 동역학 is not optional: 5 제어 starts from it, and four site problems need 4-2 · 4-3.
    optional: [],
    fields: ['sensor', 'software', 'mobile', 'hri'],
    includes: ['그림 · 체험 활동', '확인 문제 (기초 · 응용)', '블록 코딩 · Python'],
  },
  uni: {
    name: '대학',
    title: '수식으로 설명하고 코드로 확인하기',
    lead: '수식 유도와 대학 문항까지, Python · ROS 2 로 구현해 시뮬레이터에서 검증해요. 한 주제 = 75분 강의 + 실습.',
    minutes: 75,
    optional: [],
    fields: ['sensor', 'software', 'mobile', 'estimation', 'hri'],
    includes: ['수식 페이지', '확인 문제 (심화 포함)', 'Python · ROS 2'],
  },
};

export type FieldId = 'sensor' | 'software' | 'mobile' | 'estimation' | 'hri';

/** The rest of robotics, outside this course (grey on the map) — a product can open some of it. */
export const FIELDS: readonly { id: FieldId; title: string; note: string }[] = [
  { id: 'sensor', title: '센서 · 액추에이터', note: '엔코더 · 모터 · 감속기 · F/T 센서' },
  { id: 'software', title: '로봇 소프트웨어', note: 'ROS 2 · 실시간 제어 · 임베디드' },
  { id: 'mobile', title: '이동 로봇 · SLAM', note: '위치 추정 · 지도 작성 · 내비게이션' },
  { id: 'estimation', title: '상태 추정', note: '칼만 필터 · 베이즈 추정 (대학원)' },
  { id: 'hri', title: 'HRI · 안전', note: 'ISO 10218 · 협동 로봇 · 힘 제한' },
];

export type ProductId =
  | 'arm'
  | 'arm320'
  | 'mecharm'
  | 'palletizer'
  | 'ultraarm'
  | 'pro630'
  | 'myarm'
  | 'mybuddy'
  | 'aikit'
  | 'agv'
  | 'solar'
  | 'rccar'
  | 'sim';

/** Product families, for grouping a long product list (variants of one line share a card). */
export type ProductFamily = 'arm6' | 'arm4' | 'learn' | 'mobile' | 'kit' | 'etc' | 'sim';

export const FAMILY_NAME: Record<ProductFamily, string> = {
  arm6: '6축 로봇팔',
  arm4: '4축 로봇팔',
  learn: '양팔 · 원격 조작',
  mobile: '이동 로봇',
  kit: 'AI · 확장 키트',
  etc: '기타 교구',
  sim: '소프트웨어',
};
/** 2 = every topic can be practised, 1 = some, 0 = none. */
export type Cover = 0 | 1 | 2;

export interface Product {
  id: ProductId;
  name: string;
  kind: string;
  /** Short name on a 학문 card. */
  chip: string;
  family: ProductFamily;
  /** Board versions sold under the same name (same curriculum). */
  variants?: readonly string[];
  /** Sold by eduino (에듀이노) — confirmed on its shop; shown first. */
  shop: boolean;
  /** Picture on the product shelf (a render of the official 3D model, public/robot/thumbs). */
  img?: string;
  cover: Record<CategoryId | FieldId, Cover>;
}

const cov = (subjects: Cover[], fields: Cover[]): Product['cover'] => ({
  '1': subjects[0],
  '2': subjects[1],
  '3': subjects[2],
  '4': subjects[3],
  '5': subjects[4],
  '6': subjects[5],
  '7': subjects[6],
  '8': subjects[7],
  sensor: fields[0],
  software: fields[1],
  mobile: fields[2],
  estimation: fields[3],
  hri: fields[4],
});

export const PRODUCTS: readonly Product[] = [
  { id: 'arm', name: 'myCobot 280', kind: '6축 로봇팔', chip: '팔', family: 'arm6', variants: ['RDK X5', 'Pi', 'M5', 'Jetson Nano', 'Arduino'], shop: true, img: '/robot/thumbs/mycobot280-rdkx5.png', cover: cov([2, 2, 1, 1, 1, 2, 1, 1], [1, 1, 0, 0, 1]) },
  { id: 'aikit', name: 'AI 키트', kind: '카메라·흡착·블록', chip: 'AI키트', family: 'kit', shop: true, img: '/robot/thumbs/aikit.png', cover: cov([0, 0, 0, 0, 0, 2, 2, 2], [0, 0, 0, 0, 0]) },
  { id: 'agv', name: 'myAGV 2023', kind: '이동 로봇', chip: 'AGV', family: 'mobile', variants: ['Pi', 'Jetson Nano'], shop: true, img: '/robot/thumbs/myagv.png', cover: cov([1, 0, 1, 1, 1, 1, 1, 0], [1, 2, 2, 1, 0]) },
  { id: 'arm320', name: 'myCobot 320', kind: '6축 · 가반 1kg', chip: '320', family: 'arm6', variants: ['Pi', 'M5'], shop: true, img: '/robot/thumbs/mycobot320.png', cover: cov([2, 2, 1, 1, 1, 2, 1, 1], [1, 1, 0, 0, 1]) },
  { id: 'solar', name: '솔라 트래커', kind: '2축 추적', chip: '트래커', family: 'etc', shop: true, cover: cov([1, 1, 0, 0, 2, 0, 0, 0], [2, 0, 0, 1, 0]) },
  { id: 'rccar', name: '메탈 RC카', kind: '구동·조향', chip: 'RC카', family: 'etc', shop: true, cover: cov([1, 0, 0, 1, 1, 0, 0, 0], [2, 0, 1, 0, 0]) },
  { id: 'mecharm', name: 'mechArm 270', kind: '6축 · 중심 대칭형', chip: '메카암', family: 'arm6', variants: ['Pi', 'M5'], shop: false, img: '/robot/thumbs/mecharm270.png', cover: cov([2, 2, 2, 1, 1, 2, 1, 0], [1, 1, 0, 0, 0]) },
  { id: 'pro630', name: 'myCobot Pro 630', kind: '산업형 6축 · 2kg', chip: 'Pro', family: 'arm6', variants: ['Pro 630', 'Pro 450'], shop: false, img: '/robot/thumbs/mycobot-pro630.png', cover: cov([2, 2, 1, 1, 1, 2, 1, 1], [1, 2, 0, 0, 2]) },
  { id: 'palletizer', name: 'myPalletizer 260', kind: '4축 팔레타이저', chip: '팔레타이저', family: 'arm4', variants: ['Pi', 'M5'], shop: false, img: '/robot/thumbs/mypalletizer260.png', cover: cov([2, 2, 1, 0, 1, 1, 1, 0], [1, 1, 0, 0, 0]) },
  { id: 'ultraarm', name: 'ultraArm P340', kind: '4축 · 고정밀', chip: '울트라암', family: 'arm4', shop: false, img: '/robot/thumbs/ultraarm-p340.png', cover: cov([2, 2, 1, 0, 1, 1, 1, 0], [1, 1, 0, 0, 0]) },
  { id: 'myarm', name: 'myArm M&C', kind: '원격 조작 · 데이터 수집', chip: 'myArm', family: 'learn', variants: ['M750', 'C650'], shop: false, img: '/robot/thumbs/myarm-m750.png', cover: cov([2, 2, 1, 1, 1, 1, 0, 2], [1, 2, 0, 0, 1]) },
  { id: 'mybuddy', name: 'myBuddy 280', kind: '양팔 로봇', chip: '양팔', family: 'learn', shop: false, img: '/robot/thumbs/mybuddy.png', cover: cov([2, 2, 1, 0, 1, 1, 1, 1], [0, 1, 0, 0, 1]) },
  { id: 'sim', name: 'PC 시뮬레이터', kind: '소프트웨어', chip: '시뮬', family: 'sim', shop: true, cover: cov([2, 2, 2, 2, 2, 2, 2, 2], [0, 2, 0, 0, 1]) },
];

export const DEFAULT_OWNED: readonly ProductId[] = ['arm', 'sim'];

/** The best coverage any owned product gives. */
export const coverWith = (owned: readonly ProductId[], key: CategoryId | FieldId): Cover =>
  PRODUCTS.filter((p) => owned.includes(p.id)).reduce<Cover>((m, p) => (p.cover[key] > m ? p.cover[key] : m), 0);

/** Owned products that give real (non-simulated) practice in this 학문. */
export const realProducts = (owned: readonly ProductId[], key: CategoryId | FieldId) =>
  PRODUCTS.filter((p) => p.id !== 'sim' && owned.includes(p.id) && p.cover[key] > 0);

/** Share of the 8 학문's topics the owned products cover with real hardware (part = half). */
export function coverShare(owned: readonly ProductId[]) {
  const hw = owned.filter((p) => p !== 'sim');
  let got = 0;
  let topics = 0;
  for (const c of CATEGORIES) {
    const n = topicsOf(c.id).length;
    const k = coverWith(hw, c.id);
    got += (n * k) / 2;
    if (k > 0) topics += n;
  }
  return { ratio: got / TOPICS.length, subjects: CATEGORIES.filter((c) => coverWith(hw, c.id) > 0).length, topics };
}

/** What adding a product would open that the owned ones do not cover fully. */
export function opensWith(owned: readonly ProductId[]) {
  return PRODUCTS.filter((p) => !owned.includes(p.id))
    .map((p) => ({
      product: p,
      opens: [...CATEGORIES.map((c) => ({ key: c.id as CategoryId | FieldId, title: c.title })), ...FIELDS.map((f) => ({ key: f.id as CategoryId | FieldId, title: f.title }))].filter(
        (r) => p.cover[r.key] === 2 && coverWith(owned, r.key) < 2,
      ),
    }))
    .filter((x) => x.opens.length);
}

/** How a topic is practised with the owned hardware: all of it, part of it, or in the simulator (''). */
export type TopicCover = 'full' | 'part' | '';

/**
 * The 차시 whose activities have a step on the real arm (a [실물 로봇으로] button or a run on it,
 * ui/education/topics): the rest are the simulator's — torque, profiles and feedback the arm's
 * position-controlled servos do not show.
 */
export const REAL_STEP: ReadonlySet<TopicId> = new Set<TopicId>(['2-2', '2-3', '3-4', '4-1', '5-5', '6-2', '6-4', '7-1', '8-2']);

/**
 * Per topic, with the owned hardware: '실물' (full) — the 차시 has a real-arm step and the hardware
 * covers its 학문 fully; '일부 실물' (part) — it has one but the 학문 is only partly covered, or it has
 * none but the 학문 is fully covered (the teacher shows the same poses on the arm); else the simulator.
 */
export function topicCover(owned: readonly ProductId[]): Record<TopicId, TopicCover> {
  const hw = owned.filter((p) => p !== 'sim');
  const out = {} as Record<TopicId, TopicCover>;
  for (const c of CATEGORIES) {
    const k = coverWith(hw, c.id);
    for (const t of topicsOf(c.id)) out[t.id] = REAL_STEP.has(t.id) ? (k === 2 ? 'full' : k === 1 ? 'part' : '') : k === 2 ? 'part' : '';
  }
  return out;
}

export type Done = Partial<Record<TopicId, boolean>>;

export const subjectDone = (c: CategoryId, done: Done) => topicsOf(c).filter((t) => done[t.id]).length;
export const subjectComplete = (c: CategoryId, done: Done) => subjectDone(c, done) === topicsOf(c).length;

/**
 * The next 학문 to study: the first one not finished whose prerequisites are
 * finished (or, if none is open yet, simply the first unfinished one). `optional`
 * 학문 (심화 at this level) are never suggested before the others and never block.
 */
export function nextSubject(done: Done, optional: readonly CategoryId[] = []): Category | null {
  const core = CATEGORIES.filter((c) => !optional.includes(c.id));
  const open = core.find((c) => !subjectComplete(c.id, done) && c.prereq.every((p) => optional.includes(p as CategoryId) || subjectComplete(p as CategoryId, done)));
  return open ?? core.find((c) => !subjectComplete(c.id, done)) ?? CATEGORIES.find((c) => !subjectComplete(c.id, done)) ?? null;
}

/** The first unfinished topic of a 학문 (or its first topic when all are done). */
export function nextTopic(c: CategoryId, done: Done): TopicId {
  const ts = topicsOf(c);
  return (ts.find((t) => !done[t.id]) ?? ts[0]).id;
}

/** The course for the owned products: every 학문 they let a student practise, in order. */
export function course(owned: readonly ProductId[]) {
  const hw = owned.filter((p) => p !== 'sim');
  return CATEGORIES.filter((c) => coverWith(hw, c.id) > 0).map((c) => ({
    subject: c,
    with: realProducts(hw, c.id),
    topics: topicsOf(c.id).length,
  }));
}
