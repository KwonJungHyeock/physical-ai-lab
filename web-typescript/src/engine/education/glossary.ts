/**
 * Robotics terms used on the 교육 tab, each with a plain one-line meaning.
 * Definitions follow ISO 8373:2021 (Robotics — Vocabulary) where it defines the
 * term, reworded in everyday Korean; `more` adds one line for the printed
 * glossary. In lesson text a term is written [[용어]] (or [[보이는 말|용어]]).
 *
 * The 새 용어 of each curriculum file (content-markdown/*.md) are added on top
 * and win over a term here with the same name. The curriculum may name a term a
 * little differently ("공구 중심점(TCP)", "회전행렬"): `findTerm` ignores spaces
 * and a bracketed part, and `alias` lists other names for the same thing.
 */

import { NEW_TERM_DATA } from './curriculum.gen';

export interface Term {
  ko: string;
  en: string;
  /** One plain line, shown in the bubble. */
  short: string;
  /** A second line for the printed glossary (optional). */
  more?: string;
  category: GlossaryGroup;
  /** Other names the curriculum uses for the same term. */
  alias?: readonly string[];
  /** The 학문 that introduced it (curriculum 새 용어). */
  subject?: string;
}

export type GlossaryGroup = '구조' | '좌표' | '기구학' | '궤적' | '힘·제어' | '충돌·경로' | '물리' | '감지·학습';

const T = (ko: string, en: string, category: GlossaryGroup, short: string, more?: string, alias?: string[]): Term => ({ ko, en, category, short, more, alias });

const BASE: readonly Term[] = [
  // 구조
  T('로봇', 'robot', '구조', '프로그램대로 움직이는 기계 장치로, 어느 정도 스스로 판단해 옮기기·집기·자리 잡기를 하는 것.', 'ISO 8373: 어느 정도의 자율성을 가지고 이동·조작·위치 결정을 하도록 프로그램된 구동 장치.'),
  T('로봇팔', 'manipulator', '구조', '관절로 이어진 팔로 물체를 잡고 옮기는 로봇. 이 로봇(myCobot 280)은 관절 6개짜리 로봇팔.', undefined, ['매니퓰레이터']),
  T('관절', 'joint', '구조', '두 부분을 이어 주며 돌거나(회전) 미끄러지는(직선) 곳. 이 로봇의 관절은 모두 회전 관절.', '관절 번호는 바닥부터 J1, J2, … J6.'),
  T('링크', 'link', '구조', '관절과 관절 사이의 단단한 뼈대 부분.'),
  T('회전 관절', 'revolute joint', '구조', '문의 경첩처럼 한 축을 중심으로 도는 관절. myCobot 280 의 관절 6개가 모두 회전 관절.'),
  T('직선 관절', 'prismatic joint', '구조', '서랍처럼 한 축을 따라 미끄러지는 관절.'),
  T('여유 자유도', 'redundancy', '구조', '작업에 필요한 것보다 남는 자유도. 같은 손끝 자세를 여러 팔 모양으로 만들 수 있다.', '7축 팔이 6자유도 작업을 하면 여유 자유도 1.'),
  T('자유도', 'degrees of freedom, DOF', '구조', '로봇이 따로따로 움직일 수 있는 방향의 수. 이 로봇은 관절이 6개라 자유도 6.', '물체의 위치(3)와 방향(3)을 모두 정하려면 자유도 6 이 필요하다.'),
  T('엔드 이펙터', 'end effector', '구조', '팔 끝에 다는 도구. 그리퍼, 흡착 펌프, 펜 등이 있다.'),
  T('플랜지', 'flange', '구조', '팔 맨 끝, 도구를 볼트로 붙이는 둥근 면.'),
  T('공구 중심점', 'tool centre point, TCP', '구조', '도구에서 실제로 일하는 점(그리퍼 끝, 흡착컵 끝). 로봇은 이 점을 목표로 움직인다.', 'myCobot 280 그리퍼는 플랜지에서 58 mm.', ['도구 끝점', 'TCP']),
  T('서보 모터', 'servo motor', '구조', '명령한 각도로 스스로 돌아가 멈추는 모터. 안에서 각도를 재며 계속 고친다(피드백).'),
  // 좌표
  T('좌표계', 'coordinate frame', '좌표', '위치를 숫자로 말하려고 정한 원점과 x·y·z 세 방향.'),
  T('기준 좌표계', 'base frame', '좌표', '로봇 받침 바닥 가운데를 원점으로 한 좌표계. 이 로봇의 좌표는 모두 여기서 잰다.'),
  T('위치', 'position', '좌표', '어디에 있는가를 x, y, z 세 숫자(mm)로 나타낸 것.'),
  T('자세', 'orientation', '좌표', '어느 쪽을 향하고 있는가. 세 각도(롤·피치·요)로 나타낸다.', '위치 3개 + 자세 3개 = 포즈(pose).'),
  T('포즈', 'pose', '좌표', '위치와 자세를 함께 이르는 말.'),
  T('회전 행렬', 'rotation matrix', '좌표', '방향이 얼마나 돌아갔는지를 담은 3×3 숫자 표.', 'RᵀR = I, det R = 1. 짐벌락이 없다.'),
  T('롤·피치·요', 'roll, pitch, yaw', '좌표', '자세를 적는 세 각: 롤 = 손끝 축 둘레로 비틀기, 피치 = 앞뒤로 숙이기, 요 = 좌우로 돌리기.', '적용 순서를 함께 정해야 한다 (이 로봇: 요 → 피치 → 롤, R = Rz·Ry·Rx).', ['롤', '피치', '요']),
  T('오일러각', 'Euler angles', '좌표', '세 축 둘레로 차례로 돈 각도 세 개로 자세를 적는 방법. 롤·피치·요도 그 하나.', '순서가 다르면 같은 세 각도 다른 자세가 된다.'),
  T('쿼터니언', 'quaternion', '좌표', '숫자 네 개(w, x, y, z)로 자세를 적는 방법. 짐벌락이 없어 계산에 쓴다.', 'w² + x² + y² + z² = 1.'),
  T('변환 행렬', 'homogeneous transformation', '좌표', '회전과 이동을 한 번에 담은 4×4 숫자 표. 곱하면 좌표계를 차례로 옮겨 갈 수 있다.'),
  // 기구학
  T('순기구학', 'forward kinematics', '기구학', '관절 각도를 알 때 손끝의 위치·자세를 계산하는 것. 답은 하나.', '바닥에서 손끝까지 관절마다의 변환 행렬을 차례로 곱한다.'),
  T('역기구학', 'inverse kinematics', '기구학', '손끝을 둘 위치·자세가 주어졌을 때 관절 각도를 찾는 것. 답이 여러 개이거나 없을 수 있다.'),
  T('작업 반경', 'reach', '구조', '팔을 다 뻗었을 때 손끝이 닿는 가장 먼 거리. myCobot 280 은 280 mm.'),
  T('작업 공간', 'workspace', '기구학', '도구 끝이 닿을 수 있는 모든 곳.'),
  T('관절 한계', 'joint limit', '기구학', '관절이 돌 수 있는 가장 작은·큰 각도. 이 로봇의 J1 은 −168°~168°.'),
  T('관절 공간', 'joint space', '기구학', '관절 각도 6개로 나타낸 세계. "관절 공간 직선" = 각도들을 똑같은 비율로 바꾸는 움직임.'),
  T('작업 공간 좌표', 'Cartesian space', '기구학', 'x·y·z 로 나타낸 세계(직교 공간). "직선 이동" = 손끝이 실제로 곧게 가는 움직임.'),
  T('자코비안', 'Jacobian', '기구학', '관절을 조금씩 돌릴 때 손끝이 어느 쪽으로 얼마나 움직이는지를 담은 표. 손끝 속도 = 자코비안 × 관절 속도.'),
  T('특이점', 'singularity', '기구학', '팔을 쭉 펴는 등, 어떤 방향으로는 더 움직일 수 없게 되는 자세. 그 근처에서는 관절이 매우 빨리 돌아야 한다.'),
  T('조작성', 'manipulability', '기구학', '그 자세에서 손끝이 여러 방향으로 얼마나 쉽게 움직이는지. 타원체로 그리면 둥글수록 좋다.'),
  // 궤적
  T('경로', 'path', '궤적', '지나가는 길의 모양(어디를 지나는가). 시간은 들어 있지 않다.'),
  T('궤적', 'trajectory', '궤적', '경로 + 시간. 언제 어디에 있는지까지 정한 움직임.'),
  T('보간', 'interpolation', '궤적', '두 점 사이를 중간값으로 촘촘히 채우는 것.'),
  T('속도', 'velocity', '궤적', '위치가 1초에 얼마나 바뀌는가.'),
  T('가속도', 'acceleration', '궤적', '속도가 1초에 얼마나 바뀌는가. 출발·정지 때 크다.'),
  T('저크', 'jerk', '궤적', '가속도가 1초에 얼마나 바뀌는가. 크면 "덜컥" 하고 흔들린다.'),
  T('속도 프로파일', 'velocity profile', '궤적', '움직이는 동안 속도가 시간에 따라 어떻게 바뀌는지 그린 모양.'),
  T('사다리꼴 프로파일', 'trapezoidal profile', '궤적', '일정하게 빨라지고 → 같은 속도로 가다가 → 일정하게 느려지는 움직임. 속도 그래프가 사다리꼴.'),
  T('S자 프로파일', 'S-curve profile', '궤적', '가속도까지 부드럽게 바꾸는 움직임. 사다리꼴보다 조금 느리지만 덜 흔들린다.'),
  T('경유점', 'via point', '궤적', '목표까지 가는 도중에 지나가도록 정한 점.'),
  T('동기화', 'synchronization', '궤적', '여러 관절이 같은 순간에 출발해 같은 순간에 도착하게 맞추는 것.'),
  // 힘·제어
  T('토크', 'torque', '힘·제어', '돌리는 힘. 힘 × 회전축까지의 거리(N·m).'),
  T('중력 토크', 'gravity torque', '힘·제어', '팔과 물건의 무게 때문에 관절이 버텨야 하는 토크. 팔을 뻗을수록 커진다.'),
  T('관성', 'inertia', '힘·제어', '움직임을 바꾸기 싫어하는 성질. 무겁고 멀리 있을수록 크다.'),
  T('동역학', 'dynamics', '힘·제어', '힘·토크와 움직임(가속도) 사이의 관계를 다루는 것.'),
  T('가반하중', 'payload', '힘·제어', '로봇이 들 수 있는 최대 무게. 이 로봇은 250 g.'),
  T('개루프 제어', 'open-loop control', '힘·제어', '결과를 보지 않고 정해진 명령만 보내는 제어.'),
  T('피드백 제어', 'feedback (closed-loop) control', '힘·제어', '결과를 재서 목표와의 차이(오차)를 보고 명령을 계속 고치는 제어.'),
  T('오차', 'error', '힘·제어', '목표와 지금 값의 차이.'),
  T('P 제어', 'proportional control', '힘·제어', '오차에 비례해서 힘을 내는 제어. 오차가 크면 세게, 작으면 약하게.'),
  T('PID 제어', 'PID control', '힘·제어', '오차(P) + 쌓인 오차(I) + 오차가 바뀌는 빠르기(D)를 함께 보는 제어. 가장 널리 쓰인다.'),
  T('오버슈트', 'overshoot', '힘·제어', '목표를 지나쳤다가 되돌아오는 것.'),
  T('정상상태 오차', 'steady-state error', '힘·제어', '충분히 기다려도 남아 있는 오차.'),
  // 충돌·경로
  T('충돌 검사', 'collision checking', '충돌·경로', '로봇 모양이 책상·물체·자기 몸과 겹치는지 계산으로 확인하는 것.'),
  T('안전 여유', 'safety margin', '충돌·경로', '닿기 직전이 아니라 앞에서 멈추거나 약하게 누르도록 남겨 두는 여유. 거리나 힘(몸이 견디는 한계 − 누르는 힘)으로 잰다.'),
  T('경로 계획', 'path planning', '충돌·경로', '부딪히지 않고 목표까지 가는 길을 찾는 것.'),
  T('RRT', 'rapidly-exploring random tree', '충돌·경로', '무작위 자세 쪽으로 나뭇가지를 뻗어 가며 길을 찾는 방법. 충돌하는 가지는 버린다.'),
  // 물리
  T('물리 엔진', 'physics engine', '물리', '질량·중력·마찰·충돌을 계산해 물체가 실제처럼 움직이게 하는 프로그램. 여기서는 Rapier.'),
  T('강체', 'rigid body', '물리', '모양이 변하지 않는 물체. 블록·로봇 링크를 강체로 계산한다.'),
  T('질량', 'mass', '물리', '물체에 들어 있는 양. 무거울수록 움직이기도 멈추기도 어렵다.'),
  T('마찰', 'friction', '물리', '맞닿은 두 면이 미끄러지지 않으려는 힘.'),
  T('흡착', 'suction', '물리', '공기를 빨아들여 물체를 붙잡는 방식. 흡착 펌프와 흡착컵.'),
  // 감지·학습
  T('피지컬 AI', 'physical AI', '감지·학습', '보고(감지) → 판단하고 → 실제로 움직이는(행동) 인공지능. 로봇이 대표적.'),
  T('픽셀', 'pixel', '감지·학습', '사진을 이루는 작은 점. 사진 속 위치는 (가로 칸, 세로 칸)으로 말한다.'),
  T('카메라 보정', 'camera calibration', '감지·학습', '사진의 픽셀 위치와 실제 위치(mm)의 관계를 재서 맞추는 것.'),
  T('손-눈 보정', 'hand-eye calibration', '감지·학습', '로봇 손에 단 카메라가 손끝에서 어디에, 어느 방향으로 붙어 있는지 재는 것.'),
  T('마커', 'fiducial marker (ArUco)', '감지·학습', '카메라가 위치를 쉽게 찾도록 만든 흑백 무늬 표.'),
  T('임계값', 'threshold', '감지·학습', '"이 값보다 크면 빨강" 처럼 나누는 기준 값.'),
  T('시각 서보', 'visual servoing', '감지·학습', '카메라로 보면서 목표와의 차이를 줄이도록 계속 움직이는 제어.'),
  T('모방 학습', 'imitation learning', '감지·학습', '사람이 보여 준 동작(시연)을 보고 따라 하도록 배우는 방법.'),
  T('시연', 'demonstration', '감지·학습', '사람이 직접 로봇을 움직여 보여 주는 동작 기록.'),
  T('일반화', 'generalization', '감지·학습', '배운 적 없는 새 상황(다른 위치 등)에서도 잘하는 것.'),
  T('영점', 'zero position (calibration)', '감지·학습', '각 관절의 0° 기준. 어긋나면 모든 위치가 조금씩 틀어진다.'),
  T('반복 정밀도', 'repeatability', '감지·학습', '같은 곳으로 여러 번 보냈을 때 도착점이 얼마나 모이는지.'),
];

/** The curriculum's own new terms (from its md files) replace a base term of the same name; a term two 학문 both add is kept once (the first). */
const NEW: readonly Term[] = NEW_TERM_DATA.filter((n, i) => NEW_TERM_DATA.findIndex((m) => norm(m.ko) === norm(n.ko)) === i).map((n) => {
  const base = BASE.find((t) => norm(t.ko) === norm(n.ko));
  return { ko: n.ko, en: n.en, short: n.short, category: base?.category ?? '구조', alias: base?.alias, subject: n.subject };
});

export const GLOSSARY: readonly Term[] = [...BASE.filter((t) => !NEW.some((n) => norm(n.ko) === norm(t.ko))), ...NEW];

/** A name without spaces, a bracketed part and case: "공구 중심점(TCP)" → "공구중심점". */
function norm(name: string) {
  return name
    .replace(/\([^)]*\)/g, '')
    .replace(/\s+/g, '')
    .toLowerCase();
}

export const GLOSSARY_BY_KO: ReadonlyMap<string, Term> = new Map(GLOSSARY.map((t) => [t.ko, t]));
const BY_NORM: ReadonlyMap<string, Term> = new Map(GLOSSARY.flatMap((t) => [t.ko, ...(t.alias ?? [])].map((k) => [norm(k), t] as const)));

/** The glossary term a curriculum name means (exact, then ignoring spaces / brackets, then aliases). */
export function findTerm(name: string): Term | undefined {
  return GLOSSARY_BY_KO.get(name) ?? BY_NORM.get(norm(name));
}

/** Split lesson text on [[term]] / [[shown|term]] marks. */
export function splitTerms(text: string): ({ text: string } | { shown: string; term: Term })[] {
  const out: ({ text: string } | { shown: string; term: Term })[] = [];
  const re = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
  let last = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) out.push({ text: text.slice(last, m.index) });
    const key = (m[2] ?? m[1]).trim();
    const term = findTerm(key);
    out.push(term ? { shown: m[1], term } : { text: m[1] });
    last = re.lastIndex;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}

/** The plain text, marks removed. */
export const plain = (text: string) => splitTerms(text).map((p) => ('term' in p ? p.shown : p.text)).join('');
