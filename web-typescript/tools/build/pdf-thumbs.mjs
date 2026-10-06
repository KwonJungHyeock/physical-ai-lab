// First-page pictures of the PDFs in the console's 자료실 (pages/Archive.tsx), for its tiles and preview:
// public/materials/<id>.pdf and public/guides/<name>.pdf → <same folder>/thumbs/<name>.jpg, 240 px wide.
//   node tools/build/pdf-thumbs.mjs
// Run it after tools/build/materials.mjs or guides.mjs. Needs pdftoppm (poppler-utils).

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const web = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');

let made = 0;
for (const dir of ['materials', 'guides']) {
  const from = path.join(web, 'public', dir);
  if (!existsSync(from)) continue;
  const to = path.join(from, 'thumbs');
  mkdirSync(to, { recursive: true });
  for (const f of readdirSync(from).filter((f) => f.endsWith('.pdf'))) {
    const pdf = path.join(from, f);
    const jpg = path.join(to, f.replace(/\.pdf$/, '.jpg'));
    if (existsSync(jpg) && statSync(jpg).mtimeMs >= statSync(pdf).mtimeMs) continue;
    execFileSync('pdftoppm', ['-f', '1', '-l', '1', '-singlefile', '-scale-to-x', '240', '-scale-to-y', '-1', '-jpeg', '-jpegopt', 'quality=80', pdf, jpg.replace(/\.jpg$/, '')]);
    made++;
  }
}
console.log(`PDF thumbnails: ${made} made`);
