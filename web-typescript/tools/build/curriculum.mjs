/**
 * content-markdown/*.md → src/engine/education/curriculum.gen.ts (npm run gen:curriculum).
 * The md files are the source the content team edits; the generated module is
 * committed so the app builds without them.
 */

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { readCurriculum, renderModule } from './curriculum-md.mjs';

const web = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const subjects = readCurriculum(join(web, '..', 'content-markdown'));
writeFileSync(join(web, 'src', 'engine', 'education', 'curriculum.gen.ts'), renderModule(subjects));
const topics = subjects.flatMap((s) => s.topics);
const questions = topics.flatMap((t) => t.questions);
console.log(`curriculum: 학문 ${subjects.length}, 주제 ${topics.length}, 문항 ${questions.length}, 새 용어 ${subjects.flatMap((s) => s.newTerms).length}`);
