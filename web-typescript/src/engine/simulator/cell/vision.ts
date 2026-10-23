/**
 * 실습 셀 B's camera: it looks down at an area of the belt and reports the part nearest the end —
 * its colour, its diameter (shop mm), its outline and where it lies (robot frame) — with how sure it
 * is. The program then sorts by a rule table (규칙표: conditions → a bin), as a vision-guided
 * sorting cell's recipe does, with two set points (지름 기준: big or small; 확신도 기준: below it,
 * the reject chute), and an outline classifier taught with example pictures (camera.learn).
 *
 * The readings are fixed for a part (no randomness between runs): small measuring errors come
 * from the part's id, so a test sees the same numbers every time.
 */

import { COLORS } from '../board';
import type { DeskObject } from '../desk';
import { toShop } from './cells';

export type Outline = '원' | '사각' | '육각';
export const OUTLINES: readonly Outline[] = ['원', '사각', '육각'];
export const VISION_COLORS = ['빨강', '파랑', '노랑', '초록'] as const;
export const SIZE_WORDS = ['큰', '작은'] as const;
/** Every word a rule's condition may use. */
export const RULE_WORDS: readonly string[] = [...VISION_COLORS, ...SIZE_WORDS, ...OUTLINES];
export const LIMIT_NAMES = ['지름', '확신도'] as const;
export type LimitName = (typeof LIMIT_NAMES)[number];
/** Where a part goes when it is not sure enough or matches no rule. */
export const REJECT = '불량 슈트';

export interface Detection {
  /** The part's id (the world's object). */
  part: string;
  /** Where it lies (the middle of its footprint) and the belt's top under it, simulator mm. */
  x: number;
  y: number;
  z: number;
  color: string;
  /** Measured across, shop mm. */
  diameter: number;
  /** The outline as the classifier names it ('?' when it was never taught that outline). */
  outline: Outline | '?';
  /** How sure the reading is, 0 .. 100. */
  conf: number;
}

export interface Shot {
  t: number;
  /** Every part in view, and the one the camera reports (nearest the belt's end). */
  seen: Detection[];
  chosen: Detection | null;
}

export interface Rule {
  when: string[];
  to: string;
}

export interface VisionState {
  rules: Rule[];
  limits: Record<LimitName, number>;
  /** Pictures taught: the name given, and the outline the part really had. */
  learned: { label: Outline; truth: Outline }[];
  shot: Shot | null;
  /** What each program variable holds (part = camera.look()). */
  seen: Record<string, Detection>;
}

export const newVision = (): VisionState => ({ rules: [], limits: { 지름: 110, 확신도: 0 }, learned: [], shot: null, seen: {} });

/** A part's outline as it really is. */
export const outlineOf = (o: DeskObject): Outline => (o.kind === 'block' ? '사각' : o.sides === 6 ? '육각' : '원');

/** -1 .. 1 from a part's id: its fixed measuring error. */
function wobble(id: string, salt: number): number {
  let h = 2166136261 ^ salt;
  for (let k = 0; k < id.length; k += 1) h = Math.imul(h ^ id.charCodeAt(k), 16777619);
  return ((h >>> 0) % 2001) / 1000 - 1;
}

const rgb = (hex: string) => [1, 3, 5].map((k) => parseInt(hex.slice(k, k + 2), 16));

/** The palette colour a part looks like, and how close (0 .. 100). */
function colorOf(hex: string): { name: string; conf: number } {
  const c = rgb(hex);
  let best = { name: '?', d: Infinity };
  for (const p of COLORS) {
    if (!(VISION_COLORS as readonly string[]).includes(p.name)) continue;
    const q = rgb(p.hex);
    const d = Math.hypot(c[0] - q[0], c[1] - q[1], c[2] - q[2]);
    if (d < best.d) best = { name: p.name, d };
  }
  return { name: best.name, conf: Math.round(Math.max(15, Math.min(99, 99 - best.d * 0.6))) };
}

/** How sure the classifier is of an outline it was shown this many times. */
const outlineConf = (n: number) => (n <= 0 ? 0 : n === 1 ? 75 : n === 2 ? 88 : 95);

/** What the classifier calls a part of this outline, from the pictures it was taught. */
function classify(v: VisionState, truth: Outline): { outline: Outline | '?'; conf: number } {
  const votes = new Map<Outline, number>();
  for (const l of v.learned) if (l.truth === truth) votes.set(l.label, (votes.get(l.label) ?? 0) + 1);
  if (!votes.size) return { outline: '?', conf: 0 };
  const [label, n] = [...votes.entries()].sort((a, b) => b[1] - a[1])[0];
  return { outline: label, conf: outlineConf(n) };
}

const usesOutline = (v: VisionState) => v.rules.some((r) => r.when.some((w) => (OUTLINES as readonly string[]).includes(w)));

/** One picture of the area: the parts lying in it (not the one in the tool), the one nearest the end chosen. */
export function look(area: { min: [number, number]; max: [number, number] }, parts: readonly DeskObject[], carried: string | null, v: VisionState, t: number): Shot {
  const seen: Detection[] = [];
  for (const o of parts) {
    if (o.id === carried) continue;
    if (o.x < area.min[0] || o.x > area.max[0] || o.y < area.min[1] || o.y > area.max[1]) continue;
    const col = colorOf(o.color);
    // Part of it outside the picture: harder to read.
    const r = o.size[0] / 2;
    const edge = o.x - r < area.min[0] || o.x + r > area.max[0] || o.y - r < area.min[1] || o.y + r > area.max[1];
    const truth = outlineOf(o);
    const cls = classify(v, truth);
    let conf = col.conf - (edge ? 30 : 0) - (o.damaged ? 40 : 0);
    if (usesOutline(v)) conf = Math.min(conf, cls.conf);
    seen.push({
      part: o.id,
      x: o.x + wobble(o.id, 1) * 0.6,
      y: o.y + wobble(o.id, 2) * 0.6,
      z: o.z,
      color: col.name,
      diameter: Math.round(toShop(o.size[0]) + wobble(o.id, 3) * 2),
      outline: cls.outline,
      conf: Math.max(0, Math.round(conf)),
    });
  }
  const chosen = seen.length ? seen.reduce((a, b) => (b.y > a.y ? b : a)) : null;
  return { t, seen, chosen };
}

/** 큰 or 작은 by the 지름 기준. */
export const sizeWord = (v: VisionState, d: Detection) => (d.diameter >= v.limits.지름 ? '큰' : '작은');

/** Where a part goes: the first rule all of whose words fit it; the chute when not sure enough or nothing fits. */
export function decide(v: VisionState, d: Detection): { to: string; why: string } {
  if (d.conf < v.limits.확신도) return { to: REJECT, why: `확신도 ${d.conf}%가 기준 ${v.limits.확신도}%보다 낮아요` };
  const words = [d.color, sizeWord(v, d), d.outline];
  for (const r of v.rules) if (r.when.every((w) => words.includes(w))) return { to: r.to, why: r.when.length ? r.when.join(' · ') : '나머지 모두' };
  return { to: REJECT, why: '규칙표에 맞는 줄이 없어요' };
}

/** A reading in words: "빨강 · 지름 124 mm · 원 · 확신도 97%". */
export const describe = (v: VisionState, d: Detection) => `${d.color} · 지름 ${d.diameter} mm (${sizeWord(v, d)}) · ${d.outline === '?' ? '모양 모름' : d.outline} · 확신도 ${d.conf}%`;
