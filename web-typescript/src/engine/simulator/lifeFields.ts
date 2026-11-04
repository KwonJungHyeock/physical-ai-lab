/**
 * 입문 트랙 ① 생활 로봇: what is taught where. The five 학습 분야 and the four stops of the course
 * (기초 조작, then the places cobots work in everyday life), shared by the 학습 로드맵 and the
 * 테마학습 panel so both say the same. 피지컬 AI is '기초' here: 입문 has no camera or AI decision,
 * only the robot reading its sensors and acting. No React.
 */

import type { CellId } from './cell/cells';

export type Field = 'control' | 'auto' | 'safety' | 'twin' | 'pai';

export const FIELDS: Record<Field, { name: string; short: string; en: string; what: string }> = {
  control: { name: '로봇 제어', short: '제어', en: 'CONTROL', what: '관절 · 좌표로 움직이고 자세 · 위치를 가르쳐요' },
  auto: { name: '자동화 순서', short: '자동화', en: 'AUTOMATION', what: '작업 순서를 짜고 장비 신호에 맞춰 움직여요' },
  safety: { name: '협동로봇 안전', short: '안전', en: 'SAFETY', what: '사람이 있을 때 멈추고 기다리는 규칙을 익혀요' },
  twin: { name: '디지털 트윈', short: '디지털 트윈', en: 'DIGITAL TWIN', what: '가상 현장에서 확인한 프로그램을 실제 로봇에 그대로 써요' },
  pai: { name: '피지컬 AI 기초', short: '피지컬 AI', en: 'PHYSICAL AI', what: '로봇이 센서로 상황을 읽고 판단해 몸으로 움직이는 원리' },
};

export const FIELD_KEYS = Object.keys(FIELDS) as Field[];

export interface LifeStop {
  key: string;
  /** The tracked tag (BASICS, SITE 01 …). */
  phase: string;
  title: string;
  img: string;
  does: string;
  /** The ideas in it, a few words each. */
  learns: string[];
  fields: Field[];
  /** The place it opens ('tutorial': the 튜토리얼; none: still to come). */
  opens?: CellId | 'tutorial';
  /** The order the robot works in, one line (the places). */
  flow?: string;
}

export const LIFE_STOPS: LifeStop[] = [
  {
    key: 'basics',
    phase: 'BASICS',
    title: '기초 조작',
    img: '/brand/life/basics.webp',
    does: '팔을 움직이고 자세를 저장하고 위치를 가르쳐요',
    learns: ['관절 · 좌표', '티칭', '공정'],
    fields: ['control', 'twin'],
    opens: 'tutorial',
  },
  {
    key: 'cafe',
    phase: 'SITE 01',
    title: '로봇 카페',
    img: '/brand/life/cafe.webp',
    does: '컵을 받아 얼음 · 샷 · 물을 넣고 손님에게 건네요',
    learns: ['작업 순서', '센서 신호', '인터록', '안전문'],
    fields: ['auto', 'safety', 'pai', 'twin'],
    opens: 'cafe',
    flow: '컵 → 얼음 → 샷 → 물 → 픽업',
  },
  {
    key: 'draw',
    phase: 'SITE 02',
    title: '로봇 캘리그라피',
    img: '/brand/life/draw.webp',
    does: '손님의 메시지 카드에 펜으로 글씨를 써 줘요',
    learns: ['접촉 보정', '좌표계', '직선 이동', '펜 들기'],
    fields: ['control', 'safety', 'twin'],
    opens: 'draw',
    flow: '카드 받기 → 글씨 쓰기 → 완성 알리기',
  },
  {
    key: 'board',
    phase: 'SITE 03',
    title: '보드게임 로봇',
    img: '/brand/life/boardgame.webp',
    does: '사람과 번갈아 오목을 둬요',
    learns: ['격자 좌표', '차례 기다리기', '손 감지'],
    fields: ['pai', 'safety', 'control'],
    flow: '사람과 오목 두기 · 격자 좌표 · 차례 기다리기',
  },
];

/** The fields a stop teaches, in the five's order, by their short names. */
export const fieldsLine = (s: LifeStop) =>
  FIELD_KEYS.filter((f) => s.fields.includes(f))
    .map((f) => FIELDS[f].short)
    .join(' · ');
