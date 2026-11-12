/**
 * 입문 과정 무대 (무대 콘셉트 지시서 v1, 1단계 시안): one 교실 실습대 for every 절 — the same desk
 * under the arm, a plain mid-tone background, the props a 절 needs on and the rest off. Two tones
 * to choose from; until one is confirmed the stage is only a draft, opened from the address
 * (?sub=1-1&stage=a · b) on the 절 listed in DRAFT_SUBS. No React.
 *
 * The bar for a tone: the arm's white body and its black base both stand clear of the background
 * and the desk (measured on the captures, not assumed).
 */

export type StageTone = 'a' | 'b';

export interface StageLook {
  name: string;
  /** The background, plain (and the fog that fades the desk's legs into it). */
  bg: string;
  /** The desk top. */
  desk: string;
}

export const STAGE_TONES: Record<StageTone, StageLook> = {
  // 가안 중립 회색: mid grey behind, a light neutral desk.
  a: { name: '가안 중립 회색', bg: '#80858b', desk: '#a2a6ab' },
  // 나안 따뜻한 교실: mid warm grey behind, a light wood-coloured desk.
  b: { name: '나안 따뜻한 교실', bg: '#8b8176', desk: '#b38f66' },
};

/** The 절 the draft is shown on (1단계: 1-1 in view A, 1-2 in view C). */
export const DRAFT_SUBS: readonly string[] = ['1-1', '1-2'];

export const isStageTone = (s: string | null | undefined): s is StageTone => s === 'a' || s === 'b';
