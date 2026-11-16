// 가독성 점검 결과 표: node report.cjs <out 폴더> [<비교할 out 폴더>]
// 화면(절)마다 기준에 못 미친 개수를 크기별로 센다. 폴더를 둘 주면 '전 → 후'로 나란히.
const fs = require('fs');
const path = require('path');
const KINDS = [
  ['text-size', '글자 14'],
  ['value-size', '숫자 16'],
  ['hit', '누르는 것 40'],
  ['input-text', '입력 글자 16'],
  ['contrast', '대비 4.5'],
  ['contrast-off', '꺼짐 대비 3'],
  ['overflow', '넘침'],
  ['clip', '잘림'],
  ['overlap', '겹침'],
  ['align', '가운데 2px'],
];
const groupOf = (screen) => {
  const parts = screen.split('/');
  return parts.length >= 3 ? parts[1] : parts[0];
};
function load(dir) {
  const out = {}; // size → group → kind → count
  const roles = {}; // size → role → Set
  for (const f of fs.readdirSync(dir).filter((x) => /^measure-\d+x\d+-.*\.json$/.test(x))) {
    const size = /measure-(\d+x\d+)/.exec(f)[1];
    out[size] ??= {};
    roles[size] ??= {};
    for (const s of JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))) {
      const g = groupOf(s.screen);
      const by = (out[size][g] ??= {});
      for (const i of s.issues) by[i.kind] = (by[i.kind] || 0) + 1;
      for (const [k, v] of Object.entries(s.roles || {})) if (v != null && v !== '') (roles[size][k] ??= new Map()).set(String(v), [...(roles[size][k].get(String(v)) || []), g]);
    }
  }
  return { out, roles };
}
const order = (g) => (g === '인트로' ? '0' : g === '목록' ? '9a' : g === '6장' || /^6-/.test(g) ? '8' : g);
const [a, b] = process.argv.slice(2).map(load);
const sizes = [...new Set(Object.keys(a.out))].sort((x, y) => Number(x.split('x')[0]) - Number(y.split('x')[0]));
const lines = [];
for (const size of sizes) {
  lines.push(`### ${size.replace('x', ' × ')}`, '');
  lines.push(`| 화면 | ${KINDS.map((k) => k[1]).join(' | ')} | 합 |`);
  lines.push(`|---|${KINDS.map(() => '---').join('|')}|---|`);
  const groups = [...new Set([...Object.keys(a.out[size] || {}), ...Object.keys(b?.out[size] || {})])].sort((x, y) => order(x).localeCompare(order(y), 'ko'));
  const tot = KINDS.map(() => [0, 0]);
  for (const g of groups) {
    const ca = a.out[size][g] || {};
    const cb = b ? b.out[size]?.[g] || {} : null;
    let sa = 0;
    let sb = 0;
    const cells = KINDS.map(([k], i) => {
      const x = ca[k] || 0;
      const y = cb ? cb[k] || 0 : 0;
      sa += x;
      sb += y;
      tot[i][0] += x;
      tot[i][1] += y;
      return cb ? (x || y ? `${x} → ${y}` : '0') : String(x);
    });
    lines.push(`| ${g} | ${cells.join(' | ')} | ${cb ? `${sa} → ${sb}` : sa} |`);
  }
  lines.push(`| **합** | ${tot.map(([x, y]) => (b ? `${x} → ${y}` : String(x))).join(' | ')} | ${b ? `${tot.reduce((s, t) => s + t[0], 0)} → ${tot.reduce((s, t) => s + t[1], 0)}` : tot.reduce((s, t) => s + t[0], 0)} |`, '');
  // The same role, the same size: the values seen and where.
  const r = (b || a).roles[size] || {};
  const words = { panelWidth: '패널 폭', panelPad: '패널 안 여백', groupGaps: '묶음 사이 간격', runHeight: '실행 줄 높이', emptyBelow: '패널 아래 빈 곳' };
  lines.push(
    `같은 역할 (${b ? '고친 뒤' : '지금'}): ` +
      Object.entries(words)
        .map(([k, w]) => `${w} ${r[k] ? [...r[k].keys()].join(' / ') : '—'}`)
        .join(' · '),
    '',
  );
}
console.log(lines.join('\n'));
