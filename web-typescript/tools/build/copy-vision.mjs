// Copy MediaPipe's vision runtime (WebAssembly, npm package "@mediapipe/tasks-vision") into
// public/vision/, so 손 따라하기 recognises a hand from this site with no internet — beside the
// hand model kept there (hand_landmarker.task). Only the SIMD build: every browser the
// simulator runs in has it. Runs before dev and build.
import { copyFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const web = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const from = join(web, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm');
const to = join(web, 'public', 'vision');
const FILES = ['vision_wasm_internal.js', 'vision_wasm_internal.wasm'];

if (!existsSync(from)) throw new Error('node_modules/@mediapipe/tasks-vision is missing: run npm install');
mkdirSync(to, { recursive: true });
for (const f of FILES) {
  const src = join(from, f);
  const dst = join(to, f);
  if (existsSync(dst) && statSync(dst).size === statSync(src).size) continue;
  copyFileSync(src, dst);
}
console.log(`vision runtime -> ${to}`);
