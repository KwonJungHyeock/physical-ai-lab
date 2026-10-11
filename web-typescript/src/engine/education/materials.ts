/**
 * The 자료실: printable PDFs built from the catalog, the question bank and the
 * glossary (tools/build/materials.mjs prints /materials/<id> to
 * public/materials/<id>.pdf). Sorted by 학문 so a teacher downloads only what
 * they want.
 */

import { CATEGORIES, topicsOf, type CategoryId } from './catalog';
import { GLOSSARY } from './glossary';
import { QUESTIONS, QUESTIONS_BY_CATEGORY } from './questions';

export type MaterialKind = 'theory' | 'ox' | 'mc' | 'all' | 'glossary';

export const KIND_LABEL: Record<MaterialKind, string> = {
  theory: '이론 자료',
  ox: 'OX 문항지',
  mc: '객관식 문항지',
  all: '전체 문항집',
  glossary: '용어 사전',
};

export interface Material {
  id: string;
  kind: MaterialKind;
  cat: CategoryId | null;
  title: string;
  /** One line: what is inside. */
  desc: string;
  /** Download path (public/). */
  file: string;
}

const M = (id: string, kind: MaterialKind, cat: CategoryId | null, title: string, desc: string): Material => ({ id, kind, cat, title, desc, file: `/materials/${id}.pdf` });

export const MATERIALS: readonly Material[] = [
  ...CATEGORIES.map((c) => M(`theory-${c.id}`, 'theory', c.id, `${c.id}. ${c.title} (이론)`, `주제 ${topicsOf(c.id).length}개: 정의·원리 그림·자세히·수식·실습 A/B/C`)),
  ...CATEGORIES.map((c) => {
    const n = QUESTIONS_BY_CATEGORY[c.id].filter((q) => q.kind === 'ox').length;
    return M(`ox-${c.id}`, 'ox', c.id, `${c.id}. ${c.title} (OX)`, `OX ${n}문항 · 정답과 해설은 끝에`);
  }),
  ...CATEGORIES.map((c) => {
    const n = QUESTIONS_BY_CATEGORY[c.id].filter((q) => q.kind === 'mc').length;
    return M(`mc-${c.id}`, 'mc', c.id, `${c.id}. ${c.title} (객관식)`, `4지 선다 ${n}문항 · 정답과 해설은 끝에`);
  }),
  M('questions-all', 'all', null, '전체 문항집', `모든 단원 OX·객관식 ${QUESTIONS.length}문항 · 정답과 해설은 끝에`),
  M('glossary', 'glossary', null, '로봇공학 용어 사전', `용어 ${GLOSSARY.length}개 · 영어 이름과 쉬운 설명`),
];

export const MATERIAL_BY_ID: ReadonlyMap<string, Material> = new Map(MATERIALS.map((m) => [m.id, m]));
