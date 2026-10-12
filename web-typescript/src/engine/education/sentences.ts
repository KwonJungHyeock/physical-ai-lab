/**
 * A text's sentences: one ends at . ? ! after a word, a number, a bracket, a quote or a gap
 * marker (①), and a space.
 * The panels set each sentence on its own line (ui/education/lesson/Rich.tsx), and the text check
 * (tools/check/text-fit.mts) measures each one against a line.
 */
export function sentencesOf(text: string): string[] {
  return text.split(/(?<=[가-힣A-Za-z0-9)\]’”"'`%°①-⑳][.?!])\s+(?=\S)/);
}
