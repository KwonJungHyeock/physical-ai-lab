// Build the web app as static files and put them next to the on-robot server:
//   npm run build:robot   ->   ../robot-python/server/static/
// The robot has no Node.js; robot-python/server/server.py serves these files.
import { execSync } from 'node:child_process';
import { cpSync, existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const web = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const target = join(web, '..', 'robot-python', 'server', 'static');

execSync('node tools/build/copy-pyodide.mjs', { cwd: web, stdio: 'inherit' });
execSync('node tools/build/gen-sw.mjs', { cwd: web, stdio: 'inherit' });
execSync('npx next build', { cwd: web, stdio: 'inherit', env: { ...process.env, ROBOT_EXPORT: '1' } });
// With distDir set (next.config.ts), the static export lands in that folder.
const out = join(web, '.next-robot');
if (!existsSync(join(out, 'console.html'))) throw new Error('static export did not produce .next-robot/console.html');
rmSync(target, { recursive: true, force: true });
cpSync(out, target, {
  recursive: true,
  // Build caches are not part of the site.
  filter: (src) => !/[\\/](cache|server|types|diagnostics)([\\/]|$)/.test(src.slice(out.length)),
});
console.log(`\nrobot console files -> ${target}`);
