// Write public/sw.js, the service worker of the installable PC app: it keeps
// the console and everything it loads (3D models, Python runtime) on the PC,
// so the simulator runs with no internet. Runs before dev and build.
//
// Two caches: "assets" holds the big fixed files listed here (named by their
// sizes, so a new deploy keeps them unless they changed); "app" holds pages and
// the build's scripts (named by the build time, so every deploy refreshes them).
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const web = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const pub = join(web, 'public');
const DIRS = ['robot', 'draco', 'pyodide', 'icons', 'brand', 'materials', 'guides', 'education', 'library'];

const files = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (!/\.(md|txt)$|LICENSE/.test(name)) files.push(p);
  }
};
for (const d of DIRS) walk(join(pub, d));
files.sort();
const urls = files.map((f) => '/' + relative(pub, f).split('\\').join('/'));
const assetsId = createHash('sha1')
  .update(files.map((f, i) => `${urls[i]}:${statSync(f).size}`).join('\n'))
  .digest('hex')
  .slice(0, 10);
const build = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 10) || Date.now().toString(36);

const template = readFileSync(join(web, 'tools', 'build', 'sw.template.js'), 'utf8');
const out = template
  .replace('__ASSETS_ID__', assetsId)
  .replace('__BUILD_ID__', build)
  .replace('__ASSET_URLS__', JSON.stringify(urls, null, 2));
writeFileSync(join(pub, 'sw.js'), out);
console.log(`service worker -> public/sw.js (${urls.length} files kept offline, assets ${assetsId}, build ${build})`);
