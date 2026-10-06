// Copy the Pyodide runtime (CPython compiled to WebAssembly, npm package "pyodide")
// into public/pyodide/, so the Python levels load it from this site — from the
// robot in the classroom, with no internet. Runs before dev and build.
import { copyFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const web = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const from = join(web, 'node_modules', 'pyodide');
const to = join(web, 'public', 'pyodide');
const FILES = ['pyodide.mjs', 'pyodide.asm.mjs', 'pyodide.asm.wasm', 'python_stdlib.zip', 'pyodide-lock.json'];

if (!existsSync(from)) throw new Error('node_modules/pyodide is missing: run npm install');
mkdirSync(to, { recursive: true });
for (const f of FILES) {
  const src = join(from, f);
  const dst = join(to, f);
  if (existsSync(dst) && statSync(dst).size === statSync(src).size) continue;
  copyFileSync(src, dst);
}
console.log(`pyodide runtime -> ${to}`);
