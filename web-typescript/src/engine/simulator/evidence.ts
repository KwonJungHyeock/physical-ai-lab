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
  /** Done on a demo robot server (server.py --demo: a pretend arm): practice, not proof. */
  demo?: boolean;
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

let demoRobot = false;
/** The robot server now connected is a demo (pretend arm): robot lines written from now on say so. */
export function setDemoRobot(on: boolean): void {
  demoRobot = on;
}

/** Add one line to the record (the console's checks and 로봇 실습 7 both write here). */
export function addEvidence(check: number, text: string, robot: boolean): void {
  saveEvidence([...loadEvidence(), { check, at: new Date().toISOString(), text, robot, ...(robot && demoRobot ? { demo: true } : {}) }]);
}

/** A line that counts as shown on a real robot (not the simulator, not a demo server). */
export const onRealRobot = (e: Evidence) => e.robot && !e.demo;

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const time = (iso: string) => {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/**
 * What a check needs on the real robot before the sheet marks it ✓ (from the robot's lines):
 * null when it is all there, else what is still missing, in words. A check shown only in part
 * (one camera, one tool, blocks found but not moved) is marked ◐ with what is missing.
 */
export function realMissing(check: number, robotLines: readonly string[]): string | null {
  if (!robotLines.length) return '실제 로봇 기록 없음';
  const any = (re: RegExp) => robotLines.some((t) => re.test(t));
  switch (check) {
    case 3:
      return any(/카메라 2대/) || (any(/키트 카메라/) && any(/손 카메라/)) ? null : '실제 카메라 2대 사진 (키트 카메라 · 손 카메라)';
    case 4:
      return any(/실행 완료|옮김/) ? null : '찾은 블록을 실제로 집어 옮기기';
    case 5:
      return any(/그리퍼/) && any(/펌프/) ? null : !any(/그리퍼/) ? '그리퍼 열기 · 닫기' : '흡착 펌프로 바꿔 끼운 뒤 켜기 · 끄기';
    default:
      return null;
  }
}

/** The result sheet: a self-contained HTML page (print it to PDF from the browser). */
export function reportHtml(opts: { robot: string; model: string; evidence: readonly Evidence[]; prep: readonly PrepItem[] | null; prepAt: string | null }): string {
  const now = new Date();
  const rows = CHECKS.map((c) => {
    const list = opts.evidence.filter((e) => e.check === c.check);
    const real = list.some(onRealRobot);
    const demo = list.some((e) => e.robot && e.demo);
    const sim = list.some((e) => !e.robot);
    const missing = realMissing(
      c.check,
      list.filter(onRealRobot).map((e) => e.text),
    );
    const state = real
      ? missing
        ? `<b class="sim">◐ 실제 로봇 일부</b><small class="miss">남은 것: ${esc(missing)}</small>`
        : '<b class="ok">✓ 실제 로봇</b>'
      : demo
        ? '<b class="sim">◇ 데모 로봇(가짜 팔)만</b><small class="miss">실제 로봇으로 다시 해야 해요</small>'
        : sim
          ? '<b class="sim">△ 시뮬레이션만</b>'
          : '<b class="no">— 기록 없음</b>';
    const lines = list.length
      ? `<ul>${list
          .slice(-8)
          .map((e) => `<li><time>${time(e.at)}</time> ${e.robot ? (e.demo ? '<i class="s">데모</i>' : '<i>로봇</i>') : '<i class="s">시뮬</i>'} ${esc(e.text)}</li>`)
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
  const done = CHECKS.filter((c) => {
    const robotLines = opts.evidence.filter((e) => e.check === c.check && onRealRobot(e)).map((e) => e.text);
    return robotLines.length > 0 && realMissing(c.check, robotLines) === null;
  }).length;
  const demoNote = opts.evidence.some((e) => e.robot && e.demo)
    ? '<p class="warn">데모 로봇(가짜 팔, 연습용 서버)으로 한 기록은 연습이라 위의 수에 넣지 않았어요.</p>'
    : '';
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>검수 결과표 (${esc(opts.robot)})</title>
<style>
body{font-family:"Pretendard","Noto Sans KR",system-ui,sans-serif;color:#101828;background:#fff;margin:0;padding:32px;max-width:960px}
h1{font-size:22px;margin:0 0 4px}h2{font-size:16px;margin:28px 0 8px}h2 small,td small{display:block;font-weight:400;color:#667085;font-size:12px}
.meta{color:#475467;font-size:13px;margin:0 0 18px}.sum{font-size:15px;margin:0 0 12px}
table{width:100%;border-collapse:collapse;font-size:13px}td{border-top:1px solid #e4e7ec;padding:9px 8px;vertical-align:top}
td.n{width:28px;font-weight:800;font-size:16px;color:#3454d1}ul{margin:6px 0 0;padding-left:16px}li{margin:2px 0}
time{color:#667085;font-variant-numeric:tabular-nums}i{font-style:normal;font-size:11px;background:#e7f6ee;color:#16955a;border-radius:4px;padding:0 4px}
i.s{background:#eef1f7;color:#475467}.ok{color:#16955a}.sim{color:#b54708}.no{color:#b42318}.miss{display:block;color:#b54708}
.prep td:first-child{width:20px;font-weight:800}.warn{font-size:13px;color:#b54708;background:#fffaeb;border:1px solid #fedf89;border-radius:6px;padding:8px 10px;margin:0 0 12px}@media print{body{padding:0}}
</style></head><body>
<h1>검수 결과표 (myCobot 280 RDK X5)</h1>
<p class="meta">${esc(opts.robot)} · ${esc(opts.model)} · 만든 때 ${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')} · ROBODYNE SYSTEMS Physical AI 학습 프로그램</p>
<p class="sum">실제 로봇으로 확인한 검수 <b>${done} / ${CHECKS.length}</b></p>
${demoNote}
<table>${rows}</table>
${prep}
</body></html>`;
}
