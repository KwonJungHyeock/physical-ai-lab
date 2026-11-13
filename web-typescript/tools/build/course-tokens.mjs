/**
 * 입문 과정 대응표 (수정 지시서 v2 파트 E · v3 파트 1) → CSS.
 *
 * The 대응표 is a table of "this value becomes that value": one font, three weights, seven sizes, three
 * text colours and five colours that mean something, two radii, a few gaps. This script reads every
 * CSS module of the simulator and, for each rule whose values the table changes, writes the same rule
 * again behind `:where([data-course])` with the new values — right after the rule itself, under a mark.
 * `data-course` is on <html> only while the 입문 과정 is open (Console.tsx), so the full version
 * (/console) never matches these rules and keeps its own values.
 *
 *   npm run gen:course-css         writes the blocks
 *   npm run gen:course-css -- --check   fails if a file's block is not what would be written
 *
 * The marked rules are generated: change the table below (or the rule above a mark), then run this again.
 * Values set by role (not by the table) are ordinary rules written by hand, e.g. `.app[data-course] .x`.
 * No dependency: the modules are plain CSS (rules, @media, @keyframes), parsed here.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src/ui/simulator');

/* --- the table ------------------------------------------------------------------------------- */

/** Seven sizes, px: 34 절 번호 · 28 측정 숫자 · 23 절 이름 · 문장 · 18 주 버튼 · 머리글 · 16 본문 · 버튼 · 14 라벨 · 13 작은 표시. */
const size = (px) => (px > 40 ? px : px >= 31 ? 34 : px >= 25.5 ? 28 : px >= 19.5 ? 23 : px >= 16.75 ? 18 : px >= 14.75 ? 16 : px >= 13.25 ? 14 : 13);
/** Three weights (the files the app has: 400 · 600 · 700). */
const weight = (w) => (w <= 450 ? 400 : w <= 650 ? 600 : 700);
/** Two radii: 8 (keys · boxes · small marks), 12 (plates · cards · the main key); round ends and hairlines stay. */
const radius = (r) => (r < 3 ? r : r <= 9.5 ? 8 : r <= 40 ? 12 : r);
/** Gaps and paddings: 4 · 8 · 12 · 16 · 24 (0 ~ 2 and anything over 28 stay). */
const space = (v) => (v <= 2 || v > 28 ? v : v <= 5 ? 4 : v <= 9 ? 8 : v <= 13 ? 12 : v <= 19 ? 16 : 24);

const TEXT = { light: '#f6f7f9', sub: '#c9ced5', dark: '#14171c', orange: '#f0a23b', green: '#86efac', red: '#ff8f86', blue: '#93c5fd' };
/** White laid over a dark plate: 8 % (a raised box), 16 % (chosen · pressed). Lines: 18 %, 45 %. */
const plate = (a) => (a <= 0 ? a : a <= 0.11 ? 0.08 : a <= 0.24 ? 0.16 : a);
const line = (a) => (a <= 0 ? a : a <= 0.24 ? 0.18 : a <= 0.7 ? 0.45 : a);

/** `100vh`, `50vw`, `100dvh` … */
const VIEWPORT = /-?\d*\.?\d+(?:d|s|l)?v(?:h|w|min|max)\b/;

/**
 * Spacing is brought to the table in the 입문 과정's own modules and in what its panel holds (동작 줄, 잠깐 퀴즈,
 * 획 판, 수업 도구). The 조작판 keeps its rows: six of them and the fixed row fit a 1280 × 720 window as tuned.
 */
const SPACED = new Set([
  'courseStep.module.css',
  'courseEnd.module.css',
  'courseMap.module.css',
  'nowBar.module.css',
  'locationBar.module.css',
  'courseMarks.module.css',
  'recipe.module.css',
  'stepGuide.module.css',
  'strokeBoard.module.css',
  'lessonKit.module.css',
]);
/** Rules that are paper (the printed sheet's preview) or the logo: left as they are. */
const KEEP = /\.preview\b|\.paper\b|lockup|\.product em|michroma/i;

/* --- colours --------------------------------------------------------------------------------- */

const rgbOf = (v) => {
  const s = v.trim().toLowerCase();
  let m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(s);
  if (m) {
    const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1];
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), a: 1 };
  }
  m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/.exec(s);
  if (!m) return null;
  const a = m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
  return { r: +m[1], g: +m[2], b: +m[3], a };
};
const hsl = ({ r, g, b }) => {
  r /= 255;
  g /= 255;
  b /= 255;
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const l = (mx + mn) / 2;
  const d = mx - mn;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d) {
    h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s, l };
};
/** A text colour as the table has it (null: not one of the table's — left). Opaque colours only. */
const textColour = (v) => {
  const c = rgbOf(v);
  if (!c || c.a < 0.99) return null;
  const { h, s, l } = hsl(c);
  if (s < 0.45 || l > 0.93 || l < 0.1) return l > 0.86 ? TEXT.light : l > 0.42 ? TEXT.sub : l < 0.22 ? TEXT.dark : null;
  if (l > 0.8 && (h < 20 || h > 340)) return TEXT.light;
  if (h >= 18 && h < 62) return TEXT.orange;
  if (h >= 80 && h < 175) return l < 0.2 ? TEXT.dark : TEXT.green;
  if (h >= 195 && h < 255) return TEXT.blue;
  if (h < 18 || h > 335) return l < 0.45 ? null : TEXT.red;
  return null;
};
const same = (a, b) => {
  const x = rgbOf(a);
  const y = rgbOf(b);
  return !!x && !!y && x.r === y.r && x.g === y.g && x.b === y.b && Math.abs(x.a - y.a) < 0.005;
};
/** `rgba(255, 255, 255, a)` only (white over a dark plate): its alpha moved by `f`. */
const whiteAlpha = (v, f) => {
  const c = rgbOf(v);
  if (!c || c.r !== 255 || c.g !== 255 || c.b !== 255 || c.a >= 0.99) return null;
  const a = f(c.a);
  return Math.abs(a - c.a) < 0.005 ? null : `rgba(255, 255, 255, ${a})`;
};

/* --- a small CSS reader ---------------------------------------------------------------------- */

/** Blocks of `css`: rules `{ sel, body }` and at-rules `{ at, kids }` (comments dropped, strings kept). */
function parse(css) {
  let i = 0;
  const skip = () => {
    for (;;) {
      while (i < css.length && /\s/.test(css[i])) i++;
      if (css.startsWith('/*', i)) i = css.indexOf('*/', i) + 2;
      else return;
    }
  };
  const until = (stop) => {
    let out = '';
    for (; i < css.length; i++) {
      const ch = css[i];
      if (css.startsWith('/*', i)) {
        i = css.indexOf('*/', i) + 1;
        continue;
      }
      if (ch === '"' || ch === "'") {
        const j = css.indexOf(ch, i + 1);
        out += css.slice(i, j + 1);
        i = j;
        continue;
      }
      if (stop.includes(ch)) return out;
      out += ch;
    }
    return out;
  };
  const block = () => {
    const nodes = [];
    for (;;) {
      skip();
      if (i >= css.length || css[i] === '}') return nodes;
      const head = until('{;}').trim();
      if (css[i] === ';') {
        i++;
        continue;
      }
      if (css[i] !== '{') return nodes;
      i++;
      if (head.startsWith('@') && !/^@(font-face|page)/.test(head)) {
        const kids = /^@(keyframes|-webkit-keyframes)/.test(head) ? (skipBody(), null) : block();
        if (kids) nodes.push({ at: head, kids, end: i + 1 });
      } else {
        const start = i;
        skipBody(true);
        nodes.push({ sel: head, body: css.slice(start, i - 1), end: i });
        continue;
      }
      if (css[i] === '}') i++;
    }
  };
  /** Past the matching `}` (a rule's body: `own` — the cursor ends after it). */
  const skipBody = (own) => {
    let depth = 1;
    for (; i < css.length; i++) {
      if (css.startsWith('/*', i)) {
        i = css.indexOf('*/', i) + 1;
        continue;
      }
      if (css[i] === '{') depth++;
      if (css[i] === '}' && --depth === 0) {
        if (own) i++;
        return;
      }
    }
  };
  return block();
}
/** `prop: value` pairs of a rule's body (comments out; `;` inside brackets or strings kept). */
function decls(body) {
  const out = [];
  let depth = 0;
  let cur = '';
  const clean = body.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const ch of clean + ';') {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ';' && depth === 0) {
      const k = cur.indexOf(':');
      if (k > 0) out.push([cur.slice(0, k).trim().toLowerCase(), cur.slice(k + 1).trim()]);
      cur = '';
    } else cur += ch;
  }
  return out;
}

/* --- one rule → what the table changes in it --------------------------------------------------- */

const px = (v) => (/^-?[\d.]+px$/.test(v) ? parseFloat(v) : null);
const num = (n) => String(Math.round(n * 100) / 100);

function changes(sel, body, file) {
  if (KEEP.test(sel) || KEEP.test(body)) return [];
  const out = [];
  const put = (p, v) => out.push([p, v]);
  for (const [prop, raw] of decls(body)) {
    const important = /!important\s*$/.test(raw) ? ' !important' : '';
    const v = raw.replace(/\s*!important\s*$/, '');
    // A length of the window (vh · vw): the course's screen is shown larger on a wide window (zoom), so a
    // share of the window is that share of the screen as laid out — divided by the zoom.
    if (VIEWPORT.test(v) && !prop.startsWith('--')) {
      const whole = `${v.replace(new RegExp(VIEWPORT, 'g'), (m) => `calc(${m} / var(--course-zoom, 1))`)}${important}`;
      if (prop.length + whole.length <= 70) put(prop, whole);
      else {
        // Too long for one line (Prettier would break it, and the modules kept in its shape stay in it):
        // each share of the window gets a name of its own first.
        let k = 0;
        const short = v.replace(new RegExp(VIEWPORT, 'g'), (m) => {
          k++;
          put(`--cv${k}`, `calc(${m} / var(--course-zoom, 1))`);
          return `var(--cv${k})`;
        });
        put(prop, `${short}${important}`);
      }
      continue;
    }
    if (prop === 'font-size') {
      const n = px(v);
      if (n !== null && size(n) !== n) put(prop, `${size(n)}px${important}`);
    } else if (prop === 'font-weight') {
      const n = v === 'bold' ? 700 : v === 'normal' ? 400 : /^\d+$/.test(v) ? +v : null;
      if (n !== null && weight(n) !== n) put(prop, `${weight(n)}${important}`);
    } else if (prop === 'font-family') {
      if (/mono/i.test(v)) {
        put(prop, 'inherit');
        put('font-variant-numeric', 'tabular-nums');
      }
    } else if (prop === 'font') {
      // weight size[/line] family
      const m = /^(?:(italic|normal)\s+)?(?:(\d{3}|bold|normal)\s+)?([\d.]+)px(?:\s*\/\s*[\w.%]+)?\s+([\s\S]+)$/.exec(v.replace(/\s+/g, ' '));
      if (!m) continue;
      const w = m[2] === undefined ? null : m[2] === 'bold' ? 700 : m[2] === 'normal' ? 400 : +m[2];
      if (w !== null && weight(w) !== w) put('font-weight', String(weight(w)));
      if (size(+m[3]) !== +m[3]) put('font-size', `${size(+m[3])}px`);
      if (/mono/i.test(m[4])) {
        put('font-family', 'inherit');
        put('font-variant-numeric', 'tabular-nums');
      }
    } else if (prop === 'letter-spacing') {
      // No spreading of letters (한글 라벨); a tightening (negative) stays.
      if (!/^-|^0(?![.\d])|^normal$|var\(/.test(v) && parseFloat(v) > 0) put(prop, `0${important}`);
    } else if (prop === 'border-radius') {
      const n = px(v);
      if (n !== null && radius(n) !== n) put(prop, `${radius(n)}px${important}`);
    } else if (prop === 'color') {
      const t = textColour(v);
      if (t && !same(t, v)) put(prop, `${t}${important}`);
    } else if (prop === 'background' || prop === 'background-color') {
      const t = whiteAlpha(v, plate);
      if (t) put(prop, `${t}${important}`);
    } else if (prop === 'border-color') {
      const t = whiteAlpha(v, line);
      if (t) put(prop, `${t}${important}`);
    } else if (/^border(-top|-right|-bottom|-left)?$/.test(prop)) {
      const m = /(rgba?\([^)]*\))\s*$/.exec(v);
      const t = m && whiteAlpha(m[1], line);
      if (t) put(`${prop}-color`, t);
    } else if (SPACED.has(file) && (prop === 'gap' || prop === 'padding')) {
      const parts = v.split(/\s+/);
      if (parts.every((x) => px(x) !== null || x === '0')) {
        const next = parts.map((x) => (x === '0' ? '0' : `${num(space(px(x)))}px`));
        if (next.join(' ') !== parts.join(' ')) put(prop, `${next.join(' ')}${important}`);
      }
    }
  }
  return out;
}

/**
 * `sel` for the course: each of its selectors behind `:where([data-course])`. `:where` adds no weight, and
 * the rule is written right after the one it answers — so among all the rules of the file the order and
 * the weights stay exactly as they were, and only the values differ while the course is open.
 */
const under = (sel) =>
  sel
    .split(/,(?![^(]*\))/)
    .map((s) => s.trim())
    .filter((s) => s && !/^(:root|html|body)\b/.test(s))
    .map((s) => `:where([data-course]) ${s}`)
    .join(',\n');

/** Every rule of `nodes` (inside @media too, not @media print) with what the table changes in it. */
function answers(nodes, file, out = []) {
  for (const n of nodes) {
    if (n.at) {
      if (/^@media\s+print/.test(n.at)) continue;
      answers(n.kids, file, out);
      // A rule that depends on the window's size: on a wide window the course's screen is the 1366 px one shown
      // larger, so such a rule has to follow the size laid out, not the window's. The same rules again, behind
      // `html[data-vq~="k"]` — Console.tsx lists there the conditions (courseMedia.gen.ts) true for the size laid out.
      if (!/^@media\b/.test(n.at)) continue;
      const cond = n.at.replace(/^@media\s*/, '').trim();
      if (!SIZED.test(cond) || /pointer|hover|prefers|print|screen/.test(cond)) continue;
      let k = MEDIA.indexOf(cond);
      if (k < 0) k = MEDIA.push(cond) - 1;
      const copies = [];
      for (const r of n.kids) {
        if (r.at || /:where\(/.test(r.sel)) continue;
        const sel = r.sel
          .split(/,(?![^(]*\))/)
          .map((x) => x.trim())
          .filter((x) => x && !/^(:root|html|body)\b/.test(x))
          .map((x) => `:where(html[data-vq~='${k}']) ${x}`)
          .join(',\n');
        if (!sel) continue;
        const all = [...decls(r.body), ...changes(r.sel, r.body, file)];
        copies.push({ sel, ch: all });
      }
      if (copies.length) out.push({ end: n.end, copies });
      continue;
    }
    if (/:where\(\[data-course\]\)/.test(n.sel)) continue;
    const ch = changes(n.sel, n.body, file);
    const sel = under(n.sel);
    if (ch.length && sel) out.push({ end: n.end, sel, ch });
  }
  return out;
}

const MARK = '/* 대응표 */';
/** The file without the rules this script wrote (each: the mark, then one `:where(…)` rule). */
const strip = (css) => css.replace(/\n[ \t]*\/\* 대응표 \*\/\n[ \t]*:where\((?:\[data-course\]|html\[data-vq)[^{]*\{[^}]*\}/g, '');
/** Conditions on the window's width · height only, e.g. `(max-height: 820px)`. */
const SIZED = /(width|height)/;
/** The size conditions met in the modules, in the order met: a rule's copy names its condition by its place here. */
const MEDIA = [];

/* --- run ------------------------------------------------------------------------------------- */

const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.module.css')) files.push(p);
  }
})(ROOT);
files.sort();

const check = process.argv.includes('--check');
let stale = 0;
let total = 0;
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  const own = strip(src);
  const list = answers(parse(own), path.basename(f)).sort((a, b) => a.end - b.end);
  let next = '';
  let at = 0;
  const write = (pad, sel, ch) => `\n${pad}${MARK}\n${pad}${sel.replace(/\n/g, `\n${pad}`)} {\n${ch.map(([p, v]) => `${pad}  ${p}: ${v};\n`).join('')}${pad}}`;
  for (const r of list) {
    next += own.slice(at, r.end);
    at = r.end;
    if (r.copies) {
      for (const c of r.copies) next += write('', c.sel, c.ch);
      continue;
    }
    const lineStart = own.lastIndexOf('\n', own.lastIndexOf('{', r.end) - 1) + 1;
    const pad = /^[ \t]*/.exec(own.slice(lineStart))[0];
    next += write(pad, r.sel, r.ch);
    total += r.ch.length;
  }
  next += own.slice(at);
  if (next === src) continue;
  if (check) {
    stale++;
    console.error(`대응표와 다름: ${path.relative(process.cwd(), f)}`);
  } else fs.writeFileSync(f, next);
}
// The size conditions, for Console.tsx to tell which hold for the screen as laid out.
const gen = path.join(ROOT, 'courseMedia.gen.ts');
const genText = `/** Generated by tools/build/course-tokens.mjs (npm run gen:course-css): the window-size conditions of the simulator's CSS. */\nexport const COURSE_MEDIA: readonly string[] = [\n${MEDIA.map((q) => `  '${q}',\n`).join('')}];\n`;
if (!fs.existsSync(gen) || fs.readFileSync(gen, 'utf8') !== genText) {
  if (check) {
    stale++;
    console.error('대응표와 다름: courseMedia.gen.ts');
  } else fs.writeFileSync(gen, genText);
}
if (check && stale) {
  console.error('npm run gen:course-css 를 다시 돌려요.');
  process.exit(1);
}
console.log(`입문 과정 대응표: CSS 모듈 ${files.length}개 · 바뀌는 값 ${total}개${check ? ' — 최신' : ' — 씀'}`);
