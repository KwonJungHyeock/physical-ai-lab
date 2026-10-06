/**
 * Letters that stand for a quantity (K, m, μ, Kp, θ₁ …). Most students do not
 * know them, so the writer marks every one in backticks — `Kp` — and lists it
 * under the topic's `- 기호:` with how it is read, what it means and its unit.
 * The app shows a marked letter as a symbol chip (press it for the meaning);
 * the first time a letter appears on a page its short name follows it in small
 * grey type, so the sentence reads without pressing anything.
 */

import type { SymbolData } from './curriculum-types';
import { findTerm, type Term } from './glossary';

export type Sym = SymbolData;

/**
 * A piece of lesson text: plain, a glossary term ([[shown|term]]), a symbol
 * (`X`, `X`* = show its name), or an on-screen button / slider name ([실행]).
 */
export type RichPart = { text: string } | { shown: string; term: Term } | { sym: string; gloss: boolean } | { ui: string };

const TOKEN = /(\[\[[^\]|]+(?:\|[^\]]+)?\]\]|`[^`]+`\*?|\[[^[\]]+\])/;

export function splitRich(text: string): RichPart[] {
  const out: RichPart[] = [];
  for (const piece of text.split(TOKEN)) {
    if (!piece) continue;
    let m: RegExpExecArray | null;
    if ((m = /^\[\[([^\]|]+)(?:\|([^\]]+))?\]\]$/.exec(piece))) {
      const term = findTerm((m[2] ?? m[1]).trim());
      out.push(term ? { shown: m[1], term } : { text: m[1] });
    } else if ((m = /^`([^`]+)`(\*)?$/.exec(piece))) out.push({ sym: m[1], gloss: !!m[2] });
    else if ((m = /^\[([^[\]]+)\]$/.exec(piece))) out.push({ ui: m[1] });
    else out.push({ text: piece });
  }
  return out;
}

/** The symbols marked in a text, in order (repeats kept). */
export const symbolsIn = (text: string) => [...text.matchAll(/`([^`]+)`/g)].map((m) => m[1]);

/**
 * One page's texts with the first appearance of each symbol marked to show its
 * name (`X`*). Pure: the same texts give the same marks on every render.
 */
export function glossFirst(texts: readonly string[]): string[] {
  const seen = new Set<string>();
  return texts.map((t) =>
    t.replace(/`([^`]+)`/g, (whole, s: string) => {
      if (seen.has(s)) return whole;
      seen.add(s);
      return `${whole}*`;
    }),
  );
}

/** The text without marks: `Kp` → Kp, [[게인|게인]] → 게인. */
export const plainRich = (text: string) =>
  splitRich(text)
    .map((p) => ('sym' in p ? p.sym : 'term' in p ? p.shown : 'ui' in p ? `[${p.ui}]` : p.text))
    .join('');
