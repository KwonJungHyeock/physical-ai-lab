// Screenshot of manuals/course/teacher-guide.md's 로봇 실습 7 — 선생님과 함께 수업: the teacher's
// projector screen (unit 4, step 3). One server, the static pages:
//   python3 -m http.server 3001 -d robot-python/server/static
//   BASE=http://localhost:3001 node tools/build/guide-shots/lead.mjs   → ../manuals/course/img/b-lead-teacher.jpg
import path from 'node:path';

import { BASE, launch, save, settle } from './lib.mjs';

const web = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..', '..');
const OUT = path.join(web, '..', 'manuals', 'course', 'img', 'b-lead-teacher.jpg');

const { browser, page } = await launch({ storage: { 'robot-console-model': 'mycobot280-rdkx5' } });
page.setDefaultTimeout(90000);
await page.goto(`${BASE}/console`, { waitUntil: 'load', timeout: 240000 });
await page.getByRole('button', { name: '시뮬레이터로 시작' }).click({ timeout: 240000 }).catch(() => {});
await settle(page, 4000);
await page.getByRole('tab', { name: '교육' }).click();
await settle(page, 3000);
await page.getByRole('button', { name: '로봇 실습 7', exact: true }).click();
await settle(page, 4000);
await page.getByRole('button', { name: '선생님과 함께 수업' }).click();
const dlg = page.getByRole('dialog', { name: '선생님과 함께 수업 시작' });
await dlg.getByRole('button', { name: /^7-4\./ }).click();
await dlg.getByRole('button', { name: /수업 시작/ }).click();
await settle(page, 3000);
// Step 3 (자리 바꾸기), with the answer shown on the projector.
await page.getByRole('button', { name: /^3\s*자리 바꾸기/ }).click();
await settle(page, 2500);
await page.getByRole('button', { name: '프로젝터에 정답 보이기' }).click();
await settle(page, 2500);
await save(page, OUT);
console.log('b-lead-teacher.jpg');
await browser.close();
