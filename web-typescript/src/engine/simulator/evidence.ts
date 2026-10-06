/**
 * 검수 결과 기록: what happened for each acceptance check, with the time and the measured values,
 * kept in this browser so a page reload during the demonstration loses nothing. It becomes the
 * one-page result sheet ([··· 설정] → [검수 결과표 저장]).
 */

import { CHECKS } from './modules';

export interface Evidence {
  check: number;
  /** ISO time. */
  at: string;
  text: string;
  /** Done on the real robot (true) or in the simulator (false). */
  robot: boolean;
}

/** One line of the robot's self-check (/api/selfcheck). */
export interface PrepItem {
  id: string;
  checks: number[];
  name: string;
  ok: boolean | null;
  detail: string;
}

const KEY = 'robot-console-check-evidence';
const MAX = 400;

export function loadEvidence(): Evidence[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]') as unknown;
    return Array.isArray(v) ? (v.filter((e) => e && typeof e.check === 'number' && typeof e.text === 'string') as Evidence[]) : [];
  } catch {
    return [];
  }
}

export function saveEvidence(list: readonly Evidence[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(-MAX)));
  } catch {
    /* this session only */
  }
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const time = (iso: string) => {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/** The result sheet: a self-contained HTML page (print it to PDF from the browser). */
export function reportHtml(opts: { robot: string; model: string; evidence: readonly Evidence[]; prep: readonly PrepItem[] | null; prepAt: string | null }): string {
  const now = new Date();
  const rows = CHECKS.map((c) => {
    const list = opts.evidence.filter((e) => e.check === c.check);
    const real = list.some((e) => e.robot);
    const sim = list.some((e) => !e.robot);
    const state = real ? '<b class="ok">✓ 실제 로봇</b>' : sim ? '<b class="sim">△ 시뮬레이션만</b>' : '<b class="no">— 기록 없음</b>';
    const lines = list.length
      ? `<ul>${list
          .slice(-8)
          .map((e) => `<li><time>${time(e.at)}</time> ${e.robot ? '<i>로봇</i>' : '<i class="s">시뮬</i>'} ${esc(e.text)}</li>`)
          .join('')}</ul>`
      : '';
    return `<tr><td class="n">${c.check}</td><td><b>${esc(c.title)}</b><small>${esc(c.spec)}</small></td><td>${state}${lines}</td></tr>`;
  }).join('');
  const prep = opts.prep
    ? `<h2>검수 준비 점검 <small>${opts.prepAt ? time(opts.prepAt) : ''}</small></h2><table class="prep">${opts.prep
        .map(
          (p) =>
            `<tr><td class="${p.ok === true ? 'ok' : p.ok === false ? 'no' : 'sim'}">${p.ok === true ? '✓' : p.ok === false ? '✗' : '?'}</td><td>${esc(p.name)}<small>검수 ${p.checks.join('·')}</small></td><td>${esc(p.detail)}</td></tr>`,
        )
        .join('')}</table>`
    : '';
  const done = CHECKS.filter((c) => opts.evidence.some((e) => e.check === c.check && e.robot)).length;
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>검수 결과표 — ${esc(opts.robot)}</title>
<style>
body{font-family:"Pretendard","Noto Sans KR",system-ui,sans-serif;color:#101828;background:#fff;margin:0;padding:32px;max-width:960px}
h1{font-size:22px;margin:0 0 4px}h2{font-size:16px;margin:28px 0 8px}h2 small,td small{display:block;font-weight:400;color:#667085;font-size:12px}
.meta{color:#475467;font-size:13px;margin:0 0 18px}.sum{font-size:15px;margin:0 0 12px}
table{width:100%;border-collapse:collapse;font-size:13px}td{border-top:1px solid #e4e7ec;padding:9px 8px;vertical-align:top}
td.n{width:28px;font-weight:800;font-size:16px;color:#3454d1}ul{margin:6px 0 0;padding-left:16px}li{margin:2px 0}
time{color:#667085;font-variant-numeric:tabular-nums}i{font-style:normal;font-size:11px;background:#e7f6ee;color:#16955a;border-radius:4px;padding:0 4px}
i.s{background:#eef1f7;color:#475467}.ok{color:#16955a}.sim{color:#b54708}.no{color:#b42318}
.prep td:first-child{width:20px;font-weight:800}@media print{body{padding:0}}
</style></head><body>
<h1>검수 결과표 — myCobot 280 RDK X5</h1>
<p class="meta">${esc(opts.robot)} · ${esc(opts.model)} · 만든 때 ${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')} · ROBODYNE SYSTEMS Physical AI 학습 프로그램</p>
<p class="sum">실제 로봇으로 확인한 검수 <b>${done} / ${CHECKS.length}</b></p>
<table>${rows}</table>
${prep}
</body></html>`;
}
