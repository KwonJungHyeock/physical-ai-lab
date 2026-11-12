/**
 * 입문 과정 무대 (무대 콘셉트 지시서 v1): one 교실 실습대 for every 절 — the same desk under the arm,
 * a plain mid-tone background, the props a 절 needs on and the rest off. Between 절 only the camera
 * and the props change. No React.
 *
 * Tone 나안 따뜻한 교실 (confirmed). The bar for a tone: the arm's white body and its black base both
 * stand clear of the background and the desk (measured on the captures).
 */

export type StageTone = 'a' | 'b';

export interface StageLook {
  name: string;
  /** The background, plain (and the fog that fades the desk's far side into it). */
  bg: string;
  /** The desk top. */
  desk: string;
}

export const STAGE_TONES: Record<StageTone, StageLook> = {
  // 가안 중립 회색 (the 1단계 시안, not used).
  a: { name: '가안 중립 회색', bg: '#80858b', desk: '#a2a6ab' },
  // 나안 따뜻한 교실: mid warm grey behind, a light wood-coloured desk.
  b: { name: '나안 따뜻한 교실', bg: '#8b8176', desk: '#b38f66' },
};

/** The tone the course uses. */
export const COURSE_LOOK: StageLook = STAGE_TONES.b;

/**
 * The desk top, robot base frame, mm: 1200 × 600, the arm halfway across its depth (y, the
 * customer's side at −y). The 작업 범위 circle (280 mm round J1), the mats, the 완성 램프 (312) and the
 * cards waiting behind the mat (5-3) lie inside it. 900 wide (the first proposal) holds them too, but at
 * 1366 × 768 no view of the arm at 74 % (1-2) or of the whole circle (1-3) then keeps its sides off
 * the desk's edges: 1200 does (computed with deskView.ts, the same check the views use).
 */
export const COURSE_DESK = { x0: -500, x1: 700, y0: -300, y1: 300 } as const;

type P3 = readonly [number, number, number];

/**
 * A view of the stage: where it looks from (a direction from the target, robot frame) and what it
 * frames (mm) — or a fixed shot (eye and target, robot mm) where framing alone would not keep to the desk.
 */
export interface CourseView {
  dir: P3;
  area: { min: P3; max: P3 };
  shot?: { eye: P3; target: P3 };
}

/** A direction from the customer's side: `el` degrees up from the desk, turned `az` degrees towards +x. */
const from = (el: number, az: number): P3 => {
  const e = (el * Math.PI) / 180;
  const a = (az * Math.PI) / 180;
  return [Math.sin(a) * Math.cos(e), -Math.cos(a) * Math.cos(e), Math.sin(e)];
};

/**
 * The 절's home view (보고 #49 구도 A · C · D · E). Each looks from the customer's side or the front,
 * high enough that the desk top fills the bottom of the picture and the background shows above it:
 * no near edge of the desk, its legs or the space under it (the stage camera checks every view and
 * comes closer if it would show them: Stage.tsx deskSafe).
 */
export const COURSE_VIEWS: Record<string, CourseView> = {
  // A 실습대 전체: the arm, the mat, the card and the 완성 램프 from the customer's side (the card readable).
  A: { dir: from(40, 10), area: { min: [-60, -150, 0], max: [340, 170, 200] } },
  // 1-3: the whole 작업 범위 circle on the desk, from high over the customer's side.
  '1-3': { dir: from(64, 0), area: { min: [-280, -280, 0], max: [280, 280, 120] }, shot: { eye: [250, -500, 1350], target: [250, 0, 300] } },
  // B 책상 (2-1): the empty desk from above — the places for the robot, the mat and the card (the parts are in the right panel).
  '2-1': { dir: from(70, 0), area: { min: [-110, -110, 0], max: [310, 110, 40] } },
  // 2-3: the arm from its 2-3 pose up to 영점 (straight up) and back to the 기본 자세, all in view.
  '2-3': { dir: from(30, 10), area: { min: [-60, -120, 0], max: [200, 120, 460] } },
  // 3장 미션 (3-6): the arm and the see-through target pose above it, both whole.
  '3-6': { dir: from(30, 10), area: { min: [-60, -160, 0], max: [260, 160, 500] } },
  // C 로봇 근접 (3-4): the arm and the mat in front of it.
  C: { dir: from(30, 10), area: { min: [-60, -120, 0], max: [260, 120, 300] } },
  // D 매트 위에서 (4-1 · 4-3): the mat from above the customer's side.
  D: { dir: from(55, 0), area: { min: [40, -150, 0], max: [300, 150, 120] } },
  // E 펜 끝 근접 (5-2): the card and the pen.
  E: { dir: from(50, 5), area: { min: [100, -100, 0], max: [310, 80, 140] } },
  // 5-3: the card, the pen and the cards waiting behind the mat (a fixed shot: framed with the arm it would not keep to the desk).
  '5-3': { dir: from(50, 5), area: { min: [-20, -90, 0], max: [360, 180, 140] }, shot: { eye: [50, -600, 700], target: [250, -40, 100] } },
};

/**
 * 4장 (4-2 · 4-3 · 4-4 · 4장 미션), on the 글씨 부스: the mat from above the customer's side, the arm at its
 * left, the mat clear of the panel on the right (a fixed shot, robot mm: the booth keeps its own framing).
 */
export const MAT_VIEW = { eye: [190, -470, 560] as const, target: [255, -5, 70] as const };

/** The home view of a 절 (its own, else its scene kind's; the others fall back to A). */
export const courseViewOf = (sub: string, scene: string): CourseView => COURSE_VIEWS[sub] ?? COURSE_VIEWS[scene] ?? COURSE_VIEWS.A;

/**
 * 5-3: where the next customers' cards wait (robot mm, the card's bottom-left corner), the next one
 * first: in a row behind the mat (beside the mat or in front of it, no view of the 5-3 scene keeps
 * them, the arm and the mat in the picture and the picture on the desk).
 */
export const WAITING_CARDS: readonly { x: number; y: number }[] = [
  { x: 240, y: 100 },
  { x: 110, y: 100 },
  { x: -20, y: 100 },
];
