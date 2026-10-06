// Print the 자료실 documents (/materials/<id>) to public/materials/<id>.pdf.
// Needs the app running (npm run dev, or a static server of the build) and Playwright:
//   BASE=http://localhost:3000 node tools/build/materials.mjs [id ...]
import { execFileSync, execSync } from 'node:child_process';
import { mkdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const web = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const base = process.env.BASE ?? 'http://localhost:3000';
const outDir = path.join(web, 'public', 'materials');

async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch {
    const root = execSync('npm root -g').toString().trim();
    return createRequire(path.join(root, 'noop.js'))('playwright');
  }
}

const all = JSON.parse(
  execFileSync('npx', ['tsx', '-e', "import('./src/engine/education/materials.ts').then((m) => console.log(JSON.stringify((m.MATERIALS ?? m.default.MATERIALS).map((x) => x.id))))"], { cwd: web }).toString(),
);
const ids = process.argv.length > 2 ? process.argv.slice(2) : all;

const { chromium } = await loadPlaywright();
const exe = process.env.CHROMIUM ?? (statSync('/opt/pw-browsers/chromium', { throwIfNoEntry: false }) ? '/opt/pw-browsers/chromium' : undefined);
const browser = await chromium.launch(exe ? { executablePath: exe } : {});
const page = await browser.newPage();
mkdirSync(outDir, { recursive: true });
for (const id of ids) {
  const res = await page.goto(`${base}/materials/${id}`, { waitUntil: 'networkidle', timeout: 180000 });
  if (!res?.ok()) throw new Error(`${id}: HTTP ${res?.status()}`);
  await page.evaluate(() => document.fonts.ready);
  await page.emulateMedia({ media: 'print' });
  const file = path.join(outDir, `${id}.pdf`);
  await page.pdf({
    path: file,
    format: 'A4',
    printBackground: true,
    margin: { top: '13mm', bottom: '15mm', left: '14mm', right: '14mm' },
    displayHeaderFooter: true,
    headerTemplate: '<span></span>',
    footerTemplate: '<div style="width:100%;text-align:center;font-size:8px;color:#98a2b3"><span class="pageNumber"></span> / <span class="totalPages"></span></div>',
  });
  console.log(`${id}.pdf  ${(statSync(file).size / 1024).toFixed(0)} KB`);
}
await browser.close();
