// The guides in manuals/ → print-ready PDFs (A4), with a layout check of the printed pages.
//   node tools/build/guides.mjs [basic-teacher|basic-student|teacher ...]
//
// Source: Markdown with a few extra blocks (see manuals/README.md "배포용 PDF 만들기"):
//   front matter (title, subtitle, audience, version, cover), `# ` = chapter (new page), `## ` · `### `,
//   `![캡션](img/x.png)` = numbered figure (`{w=60}` after it = 60 % wide), `> 팁:` / `> 주의:` / `> 참고:` boxes,
//   `::: step 제목` … `:::` numbered step cards, `::: marks` numbered list matching the badges on a screenshot,
//   `::: cols` … `+++` … `:::` side by side, `::: newpage` = a page break, `[버튼 이름]` = a key cap, GFM tables, ``` code.
// Printing keeps a heading with what follows it, figures and cards whole, table rows whole, and Korean
// words unbroken. After printing it checks every page: a heading left at the bottom of a page, a page that
// is mostly empty, characters the font lacks. Problems → exit 1.
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { launch } from './guide-shots/lib.mjs';

const web = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const repo = path.dirname(web);
// pub: the copy for the console's 자료실 (pages/archiveTree.ts), served at /guides/<pub>.pdf.
const GUIDES = {
  'basic-teacher': { src: 'manuals/basic/teacher.md', out: 'manuals/basic/기초 사용 매뉴얼 (교사용).pdf', pub: 'basic-teacher' },
  'basic-student': { src: 'manuals/basic/student.md', out: 'manuals/basic/기초 사용 매뉴얼 (학생용).pdf', pub: 'basic-student' },
  teacher: { src: 'manuals/course/teacher-guide.md', out: 'manuals/course/교사용 교육 가이드라인.pdf', pub: 'teacher-guide' },
};
const publicCopy = (name) => path.join(web, 'public', 'guides', `${GUIDES[name].pub}.pdf`);
const pick = process.argv.slice(2);
// SENTENCES=1: also list every sentence that prints on more than one line.

// ---------- Markdown → HTML ----------
/** Printed width in Hangul-character units (Latin letters, digits and spaces are about half as wide). */
const printWidth = (s) => [...s].reduce((w, c) => w + (c.charCodeAt(0) > 0x2000 ? 1 : 0.55), 0);
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function inline(s) {
  const code = [];
  s = s.replace(/`([^`]+)`/g, (_, c) => `\u0000${code.push(c) - 1}\u0000`);
  s = esc(s);
  s = s.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  s = s.replace(/\[([^\]\n]{1,40})\]/g, '<kbd>$1</kbd>');
  s = s.replace(/①|②|③|④|⑤|⑥|⑦|⑧|⑨|⑩|⑪|⑫/g, (m) => `<i class="mk">${'①②③④⑤⑥⑦⑧⑨⑩⑪⑫'.indexOf(m) + 1}</i>`);
  s = s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${esc(code[i])}</code>`);
  return s;
}

/**
 * A paragraph or list item set one sentence per line (as the app's lesson panels are): a sentence ends at
 * . ? ! after a word, number, bracket or quote, and a space — never inside **bold** or `code`.
 */
function sentences(s) {
  const parts = s.split(/(?<=(?:[가-힣A-Za-z0-9)\]’”"'%°●◐○][.?!]|\*\*\.)(?:\*\*)?)\s+(?=\S)/);
  const out = [];
  for (const p of parts) {
    const open = (t) => ((t.match(/\*\*/g) ?? []).length % 2) + ((t.match(/`/g) ?? []).length % 2);
    if (out.length && open(out[out.length - 1])) out[out.length - 1] += ` ${p}`;
    else out.push(p);
  }
  return out;
}
const bySentence = (s) => {
  const ss = sentences(s);
  return ss.length < 2 ? inline(s) : ss.map((x) => `<span class="ln">${inline(x)}</span>`).join('');
};

function parseFront(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n/);
  const meta = {};
  if (!m) return [meta, text];
  for (const line of m[1].split('\n')) {
    const k = line.match(/^(\w+):\s*(.*)$/);
    if (k) meta[k[1]] = k[2];
  }
  return [meta, text.slice(m[0].length)];
}

function blocks(lines, ctx) {
  const out = [];
  let i = 0;
  const para = [];
  const flush = () => {
    if (para.length) out.push({ t: 'p', html: `<p>${bySentence(para.join(' '))}</p>` });
    para.length = 0;
  };
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      flush();
      i++;
      continue;
    }
    let m;
    if ((m = line.match(/^(#{1,3}) (.+)$/))) {
      flush();
      const lv = m[1].length;
      const text = m[2].trim();
      const id = `h${ctx.hid++}`;
      if (ctx.keep) ctx.breakHeads.push(text.replace(/\*\*|`|\[|\]/g, '').replace(/\s+/g, ''));
      if (lv === 1) {
        ctx.chapter++;
        ctx.section = 0;
        ctx.toc.push({ lv, text, id });
        out.push({ t: 'h', lv, html: `<h1 id="${id}"><span class="chno">${String(ctx.chapter).padStart(2, '0')}</span>${inline(text)}</h1>`, text });
      } else if (lv === 2) {
        ctx.section++;
        ctx.toc.push({ lv, text, id });
        out.push({ t: 'h', lv, html: `<h2 id="${id}"><span class="secno">${ctx.chapter}.${ctx.section}</span>${inline(text)}</h2>`, text: `${ctx.chapter}.${ctx.section} ${text}` });
      } else out.push({ t: 'h', lv, html: `<h3 id="${id}">${inline(text)}</h3>`, text });
      i++;
      continue;
    }
    if ((m = line.match(/^!\[(.*)\]\(([^)\s]+)\)(\{w=(\d+)\})?\s*$/))) {
      flush();
      const n = ++ctx.fig;
      const src = path.resolve(ctx.dir, m[2]);
      if (!existsSync(src)) ctx.problems.push(`그림 파일 없음: ${m[2]}`);
      const w = m[4] ? `style="width:${m[4]}%"` : '';
      // A picture right after `::: newpage` has its page to itself: never made smaller to fill the page before.
      const grp = ctx.nested || ctx.keep ? '' : ` data-grp="g${ctx.groups.push({ text: m[1] }) - 1}"`;
      ctx.keep = false;
      out.push({ t: 'fig', html: `<figure data-fig="${n}"${grp}><img src="file://${src}" ${w}/>${m[1] ? `<figcaption><b>그림 ${n}</b> ${inline(m[1])}</figcaption>` : ''}</figure>` });
      i++;
      continue;
    }
    if (line.startsWith('```')) {
      flush();
      const body = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) body.push(lines[i++]);
      i++;
      out.push({ t: 'code', html: `<pre>${esc(body.join('\n'))}</pre>` });
      continue;
    }
    // `::: newpage` on its own line: the next block starts a new page (a big screen picture kept whole).
    if (/^:::\s*newpage\s*$/.test(line)) {
      flush();
      out.push({ t: 'p', html: '<div class="newpage"></div>' });
      ctx.keep = true;
      i++;
      continue;
    }
    if ((m = line.match(/^::: ?(\w+)\s*(.*)$/))) {
      flush();
      const kind = m[1];
      const arg = m[2];
      const body = [];
      let depth = 1;
      i++;
      while (i < lines.length) {
        if (/^:::\s*\w/.test(lines[i])) depth++;
        else if (/^:::\s*$/.test(lines[i]) && --depth === 0) break;
        body.push(lines[i++]);
      }
      i++;
      const inner = (ls) => {
        const was = ctx.nested;
        ctx.nested = true;
        const html = render(blocks(ls, ctx));
        ctx.nested = was;
        return html;
      };
      if (kind === 'step') {
        const n = ++ctx.step;
        out.push({ t: 'card', html: `<div class="step"><div class="stepno">${n}</div><div class="stepbody"><div class="steptitle">${inline(arg)}</div>${inner(body)}</div></div>` });
      } else if (kind === 'marks') {
        const items = body.filter((l) => /^\d+\.\s/.test(l)).map((l) => l.match(/^(\d+)\.\s+(.*)$/));
        // "**name** — what it does": the name on a line of its own, then one line per sentence.
        const item = (t) => {
          const k = t.indexOf(' — ');
          const desc = k > 0 ? t.slice(k + 3) : t;
          return `${k > 0 ? `<span class="ln mname">${inline(t.slice(0, k))}</span>` : ''}${sentences(desc).map((x) => `<span class="ln">${inline(x)}</span>`).join('')}`;
        };
        out.push({ t: 'card', html: `<ol class="marks">${items.map(([, n, t]) => `<li><i class="mk">${n}</i><span>${item(t)}</span></li>`).join('')}</ol>` });
      } else if (kind === 'cols') {
        const parts = [];
        let cur = [];
        for (const l of body) {
          if (l.trim() === '+++') {
            parts.push(cur);
            cur = [];
          } else cur.push(l);
        }
        parts.push(cur);
        const kept = ctx.keep;
        ctx.keep = false;
        const grp = ctx.nested || kept ? '' : ` data-grp="g${ctx.groups.push({ text: body.join(' ') }) - 1}"`;
        out.push({ t: 'card', html: `<div class="cols cols${parts.length}"${grp}>${parts.map((p) => `<div>${inner(p)}</div>`).join('')}</div>` });
      } else if (kind === 'box') {
        out.push({ t: 'card', html: `<div class="box"><div class="boxtitle">${inline(arg)}</div>${inner(body)}</div>` });
      } else ctx.problems.push(`모르는 블록: ::: ${kind}`);
      continue;
    }
    if ((m = line.match(/^> (팁|주의|참고|안전):\s*(.*)$/))) {
      flush();
      const kind = { 팁: 'tip', 주의: 'warn', 참고: 'note', 안전: 'warn' }[m[1]];
      const body = [m[2]];
      i++;
      while (i < lines.length && lines[i].startsWith('> ')) body.push(lines[i++].slice(2));
      out.push({ t: 'card', html: `<div class="call ${kind}"><b class="calltag">${m[1]}</b><div>${render(blocks(body, ctx))}</div></div>` });
      continue;
    }
    if (/^\|.*\|\s*$/.test(line)) {
      flush();
      const rows = [];
      while (i < lines.length && /^\|.*\|\s*$/.test(lines[i])) rows.push(lines[i++]);
      const cells = (r) => r.trim().slice(1, -1).split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|'));
      const head = cells(rows[0]);
      const body = rows.slice(2).map(cells);
      // A short cell ("활동 1", "Ctrl + Enter", "10분") stays on one line.
      // A cell listing ① … ② … ③ … puts each item on its own line, never broken inside.
      const cell = (tag, c) => {
        const items = c.split(/(?=[①②③④⑤⑥⑦⑧⑨])/).map((x) => x.trim()).filter(Boolean);
        if (items.length > 1) return `<${tag}>${items.map((x) => `<span class="li">${inline(x)}</span>`).join('')}</${tag}>`;
        return `<${tag}${printWidth(c.replace(/\*\*|`|\[|\]/g, '')) <= 7 ? ' class="nw"' : ''}>${inline(c)}</${tag}>`;
      };
      out.push({ t: 'table', html: `<table><thead><tr>${head.map((h) => cell('th', h)).join('')}</tr></thead><tbody>${body.map((r) => `<tr>${r.map((c) => cell('td', c)).join('')}</tr>`).join('')}</tbody></table>` });
      continue;
    }
    if (/^(\s*)([-*]|\d+\.) /.test(line)) {
      flush();
      const items = [];
      const ordered = /^\s*\d+\./.test(line);
      while (i < lines.length && (/^(\s*)([-*]|\d+\.) /.test(lines[i]) || (/^\s{2,}\S/.test(lines[i]) && items.length))) {
        const l = lines[i++];
        const mm = l.match(/^(\s*)([-*]|\d+\.) (.*)$/);
        if (mm && mm[1].length === 0) items.push({ text: mm[3], sub: [] });
        else if (mm) items[items.length - 1].sub.push(mm[3]);
        else items[items.length - 1].text += ` ${l.trim()}`;
      }
      const tag = ordered ? 'ol' : 'ul';
      out.push({ t: 'list', html: `<${tag}>${items.map((it) => `<li>${bySentence(it.text)}${it.sub.length ? `<ul>${it.sub.map((s) => `<li>${bySentence(s)}</li>`).join('')}</ul>` : ''}</li>`).join('')}</${tag}>` });
      continue;
    }
    para.push(line.trim());
    i++;
  }
  flush();
  return out;
}

/** A heading is printed together with the block after it (never alone at the bottom of a page). */
function render(list) {
  let html = '';
  for (let i = 0; i < list.length; i++) {
    const b = list[i];
    if (b.t === 'h') {
      const next = list[i + 1];
      // A heading followed by a long table or list keeps at least the start of it.
      // A long table or list may start under its heading and run on (the heading never ends a page:
      // h2/h3 have break-after: avoid); everything else moves with its heading as one piece.
      const long = next && (next.t === 'table' || next.t === 'list') && (next.html.match(/<tr>|<li>/g) ?? []).length > 4;
      if (next && next.t !== 'h' && !long) {
        html += `<div class="keep">${b.html}${next.html}</div>`;
        i++;
        continue;
      }
    }
    html += b.html;
  }
  return html;
}

// ---------- page design ----------
const fontFace = (w, f) => `@font-face{font-family:Pretendard;font-weight:${w};src:url(file://${path.join(web, 'src/app/fonts', f)}) format('woff2')}`;
function css(meta) {
  return `
${fontFace(400, 'Pretendard-Regular.subset.woff2')}
${fontFace(500, 'Pretendard-Medium.subset.woff2')}
${fontFace(600, 'Pretendard-SemiBold.subset.woff2')}
${fontFace(700, 'Pretendard-Bold.subset.woff2')}
@font-face{font-family:Sym;src:url(file:///usr/share/fonts/truetype/dejavu/DejaVuSans.ttf);unicode-range:U+2190-21FF,U+2500-27BF,U+2900-29FF}
:root{--ink:#1b2130;--muted:#5d6678;--line:#dfe3ec;--soft:#f5f7fb;--accent:#2f54d6;--accent-soft:#eef2ff;--mark:#F2542D;--green:#17914a;--orange:#e8590c}
@page{size:A4;margin:18mm 17mm 20mm 17mm;
  @bottom-left{content:"${meta.title.replace(/"/g, '')}";font:500 8pt Pretendard;color:#8a93a6}
  @bottom-right{content:counter(page) " / " counter(pages);font:600 8pt Pretendard;color:#8a93a6}}
@page cover{margin:0;@bottom-left{content:none}@bottom-right{content:none}}
@page toc{@bottom-left{content:none}}
*{box-sizing:border-box}
html{font-family:Pretendard,Sym,sans-serif;font-size:10.2pt;line-height:1.72;color:var(--ink);-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{margin:0}
p,li,td,th,figcaption,.steptitle{word-break:keep-all;overflow-wrap:break-word;line-break:strict;text-wrap:pretty;orphans:3;widows:3}
h1,h2,h3{text-wrap:balance;word-break:keep-all;break-after:avoid}
p{margin:0 0 7pt}
.ln{display:block}
b{font-weight:700}
a{color:var(--accent);text-decoration:none}
code{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:.9em;background:var(--soft);border:1px solid var(--line);border-radius:4px;padding:0 3px;white-space:nowrap}
pre{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:8.6pt;line-height:1.6;background:#f7f8fb;border:1px solid var(--line);border-left:3px solid var(--accent);border-radius:6px;padding:8pt 10pt;white-space:pre-wrap;break-inside:avoid;margin:4pt 0 9pt}
kbd{font-family:Pretendard,Sym;font-weight:600;font-size:.88em;white-space:nowrap;border:1px solid #c5cddd;border-bottom-width:2px;border-radius:5px;background:#fff;padding:0 5px;margin:0 1px;color:#26304a}
.mk{font-style:normal;display:inline-grid;place-items:center;width:15pt;height:15pt;border-radius:50%;background:var(--mark);color:#fff;font-weight:700;font-size:8.2pt;line-height:1;vertical-align:1pt;margin:0 1pt}
/* cover */
.cover{page:cover;height:297mm;position:relative;display:flex;flex-direction:column;padding:26mm 22mm 20mm;background:linear-gradient(160deg,#0f1b3d 0%,#1d3a8f 58%,#2f54d6 100%);color:#fff;break-after:page;overflow:hidden}
.cover .brand{display:flex;align-items:center;gap:10pt;font-weight:700;font-size:12pt;letter-spacing:.02em}
.cover .brand img{height:26pt;background:#fff;border-radius:8pt;padding:4pt 6pt}
.cover .kicker{margin-top:30mm;font-size:11pt;font-weight:600;letter-spacing:.18em;color:#9fb6ff}
.cover h1.ct{font-size:34pt;line-height:1.25;margin:8pt 0 10pt;font-weight:700;word-break:keep-all}
.cover .sub{font-size:13pt;line-height:1.6;color:#d8e0ff;max-width:150mm;word-break:keep-all}
.cover .hero{margin-top:auto;border-radius:10pt;overflow:hidden;box-shadow:0 10pt 30pt rgba(0,0,0,.35);border:1.5pt solid rgba(255,255,255,.25)}
.cover .hero img{display:block;width:100%}
.cover .meta{display:flex;gap:14pt;margin-top:12mm;font-size:9.5pt;color:#c4d0ff}
.cover .meta span{border:1px solid rgba(255,255,255,.3);border-radius:999px;padding:3pt 10pt}
/* contents */
.toc{page:toc;break-after:page}
.toc h1.tt{font-size:22pt;margin:0 0 4pt}
.toc .lead{color:var(--muted);margin-bottom:14pt}
.toc ol{list-style:none;margin:0;padding:0;columns:2;column-gap:12mm}
.toc li{break-inside:avoid}
.toc li.c1{break-after:avoid}
.toc .c1{display:flex;align-items:baseline;gap:8pt;font-weight:700;font-size:11pt;margin-top:8pt;padding-top:6pt;border-top:1px solid var(--line)}
.toc .c1 .n{color:var(--accent);width:22pt}
.toc .c2{display:flex;align-items:baseline;gap:6pt;font-size:9pt;line-height:1.55;color:#3b4457;padding-left:30pt;margin-top:1pt}
.toc .fill{flex:1;border-bottom:1px dotted #b9c1d2;transform:translateY(-3pt)}
.toc .pg{font-variant-numeric:tabular-nums;color:var(--muted);min-width:16pt;text-align:right}
/* headings */
.newpage{break-before:page;height:0;margin:0}
h1{break-before:auto;font-size:21pt;line-height:1.3;margin:26pt 0 12pt;padding-bottom:10pt;border-bottom:2.5pt solid var(--accent);display:flex;align-items:baseline;gap:12pt}
h1 .chno{font-size:30pt;color:var(--accent);font-weight:700;letter-spacing:-.02em}
h2{font-size:14pt;line-height:1.4;margin:16pt 0 7pt;display:flex;align-items:baseline;gap:8pt}
h2 .secno{color:var(--accent);font-size:11.5pt;font-weight:700;min-width:22pt}
h3{font-size:11.2pt;margin:12pt 0 5pt;color:#26304a;padding-left:8pt;border-left:3pt solid var(--accent)}
.keep{break-inside:avoid}
main>.keep:first-child h1{margin-top:0}
/* figures */
figure{margin:6pt 0 11pt;break-inside:avoid;text-align:center}
figure img{max-width:100%;max-height:150mm;border:1px solid var(--line);border-radius:6pt;box-shadow:0 1.5pt 5pt rgba(20,30,60,.08)}
figcaption{font-size:8.8pt;color:var(--muted);margin-top:4pt;text-align:center}
figcaption b{color:var(--ink);margin-right:3pt}
/* lists, tables */
ul,ol{margin:2pt 0 8pt;padding-left:15pt}
li{margin:2pt 0}
li::marker{color:var(--accent)}
table{width:100%;border-collapse:collapse;margin:4pt 0 11pt;font-size:9.2pt;line-height:1.55}
thead{display:table-header-group}
tr{break-inside:avoid}
th{background:#eef1f8;text-align:left;font-weight:700;padding:5pt 7pt;border-bottom:1.5pt solid #c9d1e3}
td.nw,th.nw{white-space:nowrap}
td .li{display:block;white-space:nowrap}
td{padding:5pt 7pt;border-bottom:1px solid var(--line);vertical-align:top}
tbody tr:nth-child(even) td{background:#fafbfd}
/* cards */
.step{display:flex;gap:10pt;break-inside:avoid;border:1px solid var(--line);border-radius:9pt;padding:10pt 12pt;margin:0 0 9pt;background:#fff}
.stepno{flex:none;width:22pt;height:22pt;border-radius:50%;background:var(--accent);color:#fff;font-weight:700;display:grid;place-items:center;font-size:11pt}
.stepbody{flex:1;min-width:0}
.steptitle{font-weight:700;font-size:11pt;margin:1pt 0 4pt}
.stepbody figure{margin-bottom:2pt}
.stepbody p:last-child{margin-bottom:0}
.marks{list-style:none;padding:0;margin:0 0 11pt;display:grid;grid-template-columns:1fr 1fr;gap:4pt 14pt;break-inside:avoid}
.marks li{display:flex;gap:6pt;align-items:flex-start;margin:0;font-size:9.4pt;line-height:1.5}
.marks .mk{flex:none;margin-top:1pt}
.marks .mname{font-weight:600}
td .mk{background:var(--accent-soft);color:var(--accent);box-shadow:inset 0 0 0 0.6pt #b9c6f5;font-size:7.6pt;width:13pt;height:13pt}
.cols{display:grid;gap:12pt;break-inside:avoid;margin-bottom:6pt;align-items:start}
.cols2{grid-template-columns:1fr 1fr}.cols3{grid-template-columns:1fr 1fr 1fr}
.cols figure{margin-top:0}
.cols .marks{grid-template-columns:1fr}
.box{border:1px solid var(--line);background:var(--soft);border-radius:9pt;padding:10pt 12pt;margin:0 0 10pt;break-inside:avoid}
.boxtitle{font-weight:700;margin-bottom:4pt}
.call{display:flex;gap:9pt;border-radius:8pt;padding:8pt 11pt;margin:2pt 0 10pt;break-inside:avoid;font-size:9.6pt}
.call>div{flex:1}.call p:last-child,.call ul:last-child{margin-bottom:0}
.calltag{flex:none;font-size:8.6pt;border-radius:999px;padding:1pt 8pt;height:max-content;margin-top:1pt}
.tip{background:#effaf3;border:1px solid #bfe6cd}.tip .calltag{background:var(--green);color:#fff}
.note{background:var(--accent-soft);border:1px solid #cdd7fb}.note .calltag{background:var(--accent);color:#fff}
.warn{background:#fff4e6;border:1px solid #ffd3a8}.warn .calltag{background:var(--orange);color:#fff}
`;
}

function page(meta, toc, bodyHtml, pages = {}, extraCss = '') {
  const tocHtml = toc
    .map((t) =>
      t.lv === 1
        ? `<li class="c1"><span class="n">${String(toc.filter((x) => x.lv === 1).indexOf(t) + 1).padStart(2, '0')}</span><span>${inline(t.text)}</span><span class="fill"></span><span class="pg">${pages[t.id] ?? ''}</span></li>`
        : `<li class="c2"><span>${inline(t.text)}</span><span class="fill"></span><span class="pg">${pages[t.id] ?? ''}</span></li>`,
    )
    .join('');
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${esc(meta.title)}</title><style>${css(meta)}${extraCss}</style></head><body>
<section class="cover">
  <div class="brand"><img src="file://${path.join(web, 'public/brand/eduino-logo.png')}"/>Physical AI 학습 프로그램</div>
  <div class="kicker">${esc(meta.kicker ?? 'MANUAL')}</div>
  <h1 class="ct">${esc(meta.title)}</h1>
  <div class="sub">${inline(meta.subtitle ?? '')}</div>
  ${meta.cover ? `<div class="hero"><img src="file://${path.resolve(meta.dir, meta.cover)}"/></div>` : ''}
  <div class="meta">${[meta.audience, meta.version].filter(Boolean).map((x) => `<span>${esc(x)}</span>`).join('')}</div>
</section>
<section class="toc"><h1 class="tt" style="break-before:auto;border:none;display:block">차례</h1><div class="lead">${inline(meta.toclead ?? '')}</div><ol>${tocHtml}</ol></section>
<main>${bodyHtml}</main></body></html>`;
}

// ---------- check the printed pages ----------
function pdfPages(file) {
  const info = execFileSync('pdfinfo', [file]).toString();
  return Number(info.match(/Pages:\s+(\d+)/)[1]);
}
function pageText(file, n) {
  return execFileSync('pdftotext', ['-f', String(n), '-l', String(n), '-layout', file, '-']).toString();
}
/** How far down the page the content goes (0..1), from a small render. */
function fillOf(file, n, tmp) {
  execFileSync('pdftoppm', ['-r', '30', '-gray', '-f', String(n), '-l', String(n), '-singlefile', file, tmp]);
  const pgm = readFileSync(`${tmp}.pgm`);
  // P5\n<w> <h>\n255\n<data>
  const header = pgm.toString('latin1', 0, 40).split(/\s+/);
  const w = Number(header[1]);
  const h = Number(header[2]);
  const off = pgm.length - w * h;
  let last = 0;
  // ignore the footer band (bottom 9 %)
  for (let y = 0; y < Math.floor(h * 0.91); y++) {
    for (let x = 0; x < w; x++) {
      if (pgm[off + y * w + x] < 235) {
        last = y;
        break;
      }
    }
  }
  return last / h;
}

async function build(name) {
  const g = GUIDES[name];
  const srcFile = path.join(repo, g.src);
  const dir = path.dirname(srcFile);
  const [meta, body] = parseFront(readFileSync(srcFile, 'utf8'));
  meta.dir = dir;
  const ctx = { dir, chapter: 0, section: 0, fig: 0, step: 0, hid: 0, toc: [], problems: [], groups: [], nested: false, keep: false, breakHeads: [] };
  // Steps count from 1 again in every section.
  const lines = body.split('\n');
  const list = [];
  let chunk = [];
  const flushChunk = () => {
    if (chunk.length) list.push(...blocks(chunk, ctx));
    chunk = [];
  };
  for (const l of lines) {
    if (/^#{1,3} /.test(l)) {
      flushChunk();
      ctx.step = 0;
    }
    chunk.push(l);
    if (/^#{1,3} /.test(l)) {
      list.push(...blocks(chunk, ctx));
      chunk = [];
    }
  }
  flushChunk();
  const bodyHtml = render(list);

  const tmpDir = path.join(web, '.next', 'guides');
  mkdirSync(tmpDir, { recursive: true });
  const htmlFile = path.join(tmpDir, `${name}.html`);
  const outFile = path.join(repo, g.out);
  const { browser, page: pg } = await launch({ width: 1200, height: 1600 });
  // Pictures that would leave a gap: block id → how many mm to take off its pictures' height.
  const cut = {};
  const fitCss = () =>
    Object.entries(cut)
      .flatMap(([g, c]) => measured[g].imgs.map((im) => `figure[data-fig="${im.fig}"] img{max-height:${(im.h - c).toFixed(1)}mm;width:auto!important}`))
      .join('');
  let measured = {};
  const print = async (pages) => {
    writeFileSync(htmlFile, page(meta, ctx.toc, bodyHtml, pages, fitCss()));
    await pg.goto(`file://${htmlFile}`, { waitUntil: 'load' });
    await pg.evaluate(() => document.fonts.ready);
    await pg.pdf({ path: outFile, format: 'A4', printBackground: true, preferCSSPageSize: true, timeout: 300000 });
  };
  const where = () => {
    const n = pdfPages(outFile);
    const texts = [...Array(n).keys()].map((i) => pageText(outFile, i + 1).replace(/\s+/g, ' '));
    const pages = {};
    for (const t of ctx.toc) {
      const plain = t.text.replace(/\*\*|`|\[|\]/g, '').replace(/\s+/g, ' ').trim();
      const probe = plain.slice(0, 18);
      const at = texts.findIndex((s, i) => i > 1 && s.includes(probe));
      if (at >= 0) pages[t.id] = at + 1;
    }
    return [pages, n];
  };
  // Each block's printed height and its pictures' heights (mm), measured with the page set to the print width.
  await print({});
  measured = await pg.evaluate(() => {
    document.querySelector('main').style.width = '176mm';
    const mm = (px) => px / (96 / 25.4);
    const out = {};
    for (const el of document.querySelectorAll('[data-grp]')) {
      out[el.dataset.grp] = {
        h: mm(el.getBoundingClientRect().height),
        imgs: [...el.querySelectorAll('figure[data-fig] img')].map((i) => ({ fig: i.closest('figure').dataset.fig, h: mm(i.getBoundingClientRect().height) })),
      };
    }
    return out;
  });
  // One sentence per line: the sentences (and one-sentence paragraphs · list items) that print on 2+ lines.
  const wraps = await pg.evaluate(() => {
    const out = [];
    let n = 0;
    const units = [...document.querySelectorAll('main .ln, main p, main li')].filter((el) => !el.querySelector('.ln, p, li') && !el.closest('table, .toc, .cover, figure'));
    for (const el of units) {
      const t = el.textContent.replace(/\s+/g, ' ').trim();
      if (t.length < 4) continue;
      n++;
      const r = document.createRange();
      r.selectNodeContents(el);
      const rows = [];
      for (const b of r.getClientRects()) if (b.width > 1 && !rows.some((y) => Math.abs(y - b.bottom) < 8)) rows.push(b.bottom);
      if (rows.length > 1) out.push([rows.length, t]);
    }
    return { n, out };
  });
  const headLv = new Map(list.filter((b) => b.t === 'h').map((b) => [b.text.replace(/\*\*|`|\[|\]/g, '').replace(/\s+/g, ''), b.lv]));
  const squash = (t) => t.replace(/\*\*|`|\[|\]|!\[|\]\([^)]*\)|\{w=\d+\}/g, '').replace(/\s+/g, '');
  /**
   * A page that ends early because the next block (a picture, or pictures beside text) did not fit:
   * make that block's pictures smaller by just enough to fit the space left — never below 55 % of their
   * size or 40 mm — so the reading runs on without a gap. Done again until nothing changes.
   */
  const fitFigures = () => {
    const n = pdfPages(outFile);
    let changed = false;
    for (let p = 3; p < n; p++) {
      const fill = fillOf(outFile, p, path.join(tmpDir, `${name}-f`));
      if (fill > 0.82) continue;
      const lines = pageText(outFile, p + 1).split('\n').map((l) => l.trim()).filter(Boolean);
      // Headings that came along with the block (chapter ≈ 24 mm, section ≈ 13 mm, sub-section ≈ 9 mm).
      let extra = 0;
      let i = 0;
      for (; i < lines.length; i++) {
        const lv = [...headLv].find(([h]) => h.length > 3 && lines[i].replace(/\s+/g, '').endsWith(h.slice(-14)))?.[1];
        if (!lv) break;
        extra += lv === 1 ? 24 : lv === 2 ? 13 : 9;
      }
      const first = (lines[i] ?? '').replace(/\s+/g, '');
      if (first.length < 4) continue;
      // A page that starts with a caption: that figure's own block. Otherwise the block whose text starts the page.
      const cap = first.match(/^그림(\d+)/);
      const probe = first.slice(0, 12);
      const g = cap
        ? Number((Object.entries(measured).find(([, m]) => m.imgs.some((im) => im.fig === cap[1])) ?? ['g-1'])[0].slice(1))
        : ctx.groups.findIndex((x) => squash(x.text).includes(probe));
      if (process.env.FIT_DEBUG) console.log(`  p.${p} fill ${Math.round(fill * 100)}% → p.${p + 1} "${first.slice(0, 24)}" extra ${extra} group ${g}${g >= 0 ? ` h ${Math.round(measured[`g${g}`]?.h)} imgs ${measured[`g${g}`]?.imgs.map((x) => Math.round(x.h)).join('/')}` : ''}`);
      if (g < 0 || !measured[`g${g}`]) continue;
      const key = `g${g}`;
      const m = measured[key];
      const room = (0.925 - fill) * 297 - 5 - extra;
      const need = m.h - room + 2;
      const c = Math.max(cut[key] ?? 0, need);
      if (need <= 0 || !m.imgs.length) continue;
      if (m.imgs.every((im) => im.h - c >= Math.max(40, im.h * 0.55)) && c !== cut[key]) {
        cut[key] = c;
        changed = true;
      }
    }
    return changed;
  };
  for (let round = 0; round < 5 && fitFigures(); round++) await print({});
  // Pass with page numbers in the contents, then once more as the contents may shift nothing but numbers.
  let [pages] = where();
  await print(pages);
  let n;
  [pages, n] = where();
  await print(pages);
  if (Object.keys(cut).length) console.log(`  빈 곳 없애려 줄인 그림 묶음 ${Object.keys(cut).length}개: ${Object.entries(cut).map(([, c]) => `${Math.round(c)}mm`).join(', ')}`);
  await browser.close();

  // Checks.
  const problems = [...ctx.problems];
  const heads = [];
  for (const b of list) if (b.t === 'h') heads.push(b.text.replace(/\*\*|`/g, '').replace(/\[|\]/g, '').trim());
  const tmp = path.join(tmpDir, `${name}-p`);
  const sparse = [];
  for (let p = 3; p <= n; p++) {
    const raw = pageText(outFile, p);
    const ls = raw.split('\n').map((l) => l.trim()).filter(Boolean);
    const body = ls.filter((l) => !/^\d+ \/ \d+$/.test(l) && !l.endsWith(`${n}`) && !l.startsWith(meta.title));
    const lastLines = body.slice(-2).join(' ');
    const tail = lastLines.replace(/\s+/g, '');
    for (const h of heads) {
      const hh = h.replace(/\s+/g, '');
      if (hh.length > 3 && tail.endsWith(hh) && body.length > 3) problems.push(`p.${p}: 제목이 쪽 맨 아래에 홀로 — "${h}"`);
    }
    const fill = fillOf(outFile, p, tmp);
    // A page that ends early is fine when the next page starts after a `::: newpage`.
    const next = p < n ? pageText(outFile, p + 1).replace(/\s+/g, '').slice(0, 60) : '';
    if (fill < 0.62 && p < n && !ctx.breakHeads.some((h) => h.length > 3 && next.includes(h))) sparse.push(`p.${p}: 쪽의 ${Math.round(fill * 100)}% 만 채움`);
  }
  problems.push(...sparse);
  // Characters the font does not have.
  const used = new Set(readFileSync(htmlFile, 'utf8').replace(/<style>[\s\S]*?<\/style>/, '').replace(/<[^>]+>/g, ''));
  const cmap = JSON.parse(execFileSync('python3', ['-c', `import json,sys;from fontTools.ttLib import TTFont;print(json.dumps(sorted(TTFont(sys.argv[1]).getBestCmap().keys())))`, path.join(web, 'src/app/fonts/Pretendard-Regular.subset.woff2')]).toString());
  const have = new Set(cmap);
  const sym = JSON.parse(execFileSync('python3', ['-c', `import json;from fontTools.ttLib import TTFont;print(json.dumps(sorted(TTFont('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf').getBestCmap().keys())))`]).toString());
  for (const c of sym) if ((c >= 0x2190 && c <= 0x21ff) || (c >= 0x2500 && c <= 0x27bf) || (c >= 0x2900 && c <= 0x29ff)) have.add(c);
  const missing = [...used].filter((c) => c.codePointAt(0) > 0x20 && !have.has(c.codePointAt(0)) && !/[\u0000-\u001f]/.test(c));
  if (missing.length) problems.push(`글꼴에 없는 글자: ${missing.join(' ')}`);
  mkdirSync(path.dirname(publicCopy(name)), { recursive: true });
  copyFileSync(outFile, publicCopy(name));
  // The 자료실 preview: the cover, 240 px wide.
  const thumb = path.join(web, 'public', 'guides', 'thumbs', GUIDES[name].pub);
  mkdirSync(path.dirname(thumb), { recursive: true });
  execFileSync('pdftoppm', ['-jpeg', '-jpegopt', 'quality=82', '-f', '1', '-l', '1', '-scale-to-x', '240', '-scale-to-y', '-1', '-singlefile', outFile, thumb]);
  console.log(`${path.basename(outFile)}: ${n}쪽, 그림 ${ctx.fig}${problems.length ? `, 문제 ${problems.length}` : ', 문제 없음'}`);
  console.log(`  문장 ${wraps.n}개 중 두 줄 넘는 문장 ${wraps.out.length}개${process.env.SENTENCES ? '' : ' (SENTENCES=1 로 목록)'}`);
  if (process.env.SENTENCES) for (const [k, t] of wraps.out) console.log(`    ${k}줄  ${t}`);
  for (const p of problems) console.log(`  ${p}`);
  return problems.length;
}

let bad = 0;
for (const name of pick.length ? pick : Object.keys(GUIDES)) bad += await build(name);
process.exit(bad ? 1 : 0);
