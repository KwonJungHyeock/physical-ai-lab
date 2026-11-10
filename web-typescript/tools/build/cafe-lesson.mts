/**
 * 로봇 카페 강의 계획서 · 지도안, 교안 (교사용) and 교안 (학생용), A4 PDFs, from the 수업 설계 the app reads
 * (src/engine/simulator/cell/lessons.ts): the pages are fixed, so the page the app shows ('교안 6–7쪽')
 * is the page the teacher holds.
 *
 *   교안: 1 표지 · 2 수업 안내 (차시 구성 4 · 6 · 8, 한 차시 흐름) · 3 앱 화면과 교사 열쇠 ·
 *         4–19 퀘스트마다 두 쪽 (설명 쪽: 목표 · 개념 · 화면 · 발문 / 수행 쪽: 할 일 · 통과 조건 · 시간 ·
 *         막힐 때 · 확인 문제) · 20 확인 문제 정답 · 21 평가 기준 · 22 반 결과 정리
 *   교안 (학생용): 1 표지 (번호 · 이름 · 차시 구성) · 2–9 퀘스트마다 한 쪽 · 10 정리와 자기 점검
 *   계획서 · 지도안: 1 표지 · 2–3 강의 계획서 (개요 · 차시별 계획 · 평가 · 6 · 8차시 배치) · 4–7 차시별
 *         교수 · 학습 지도안 (4차시 구성, 50분: 도입 · 전개 · 정리)
 * The app shows little text (doing, not reading): what each quest means, the O · X answers and the
 * blocks' signs are here.
 *
 * Pictures: manuals/course/img/cafe/ (tools/build/guide-shots/cafe-lesson.mjs). After printing, every
 * page is checked: content that runs past its page → exit 1.
 *   npx tsx tools/build/cafe-lesson.mts
 */
import { execSync } from 'node:child_process';
import { copyFileSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import { STEP_GUIDES } from '../../src/engine/simulator/cell/guides';
import { GUIDE_PAGES, LESSON_QUEST, PLAN_SIZES, RUBRIC, checksOf, lessonOfQuest, lessonsOf } from '../../src/engine/simulator/cell/lessons';
import { missionById } from '../../src/engine/simulator/cell/missions';
import { QUESTS, QUEST_LEAD } from '../../src/engine/simulator/cell/quests';

const web = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const repo = path.dirname(web);
const img = (f: string) => `data:image/jpeg;base64,${readFileSync(path.join(repo, 'manuals', 'course', 'img', 'cafe', f)).toString('base64')}`;
const LOGO = `data:image/svg+xml;base64,${readFileSync(path.join(web, 'public', 'brand', 'sim-logo-ink.svg')).toString('base64')}`;
/** The cover: the brand logo, the title and a few chips; what the document is, in cards below. No picture. */
const cover = (kicker: string, title: string, sub: string, chips: string[], foot: string) =>
  `<div class="cover"><img class="logo" src="${LOGO}" alt="ROBODYNE SYSTEMS"><div class="hero"><span class="kicker">${kicker}</span><h1>${title}</h1><p class="sub">${sub}</p><div class="chips">${chips.map((c) => `<span>${c}</span>`).join('')}</div></div><div class="foot">${foot}</div></div>`;
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const IDS = ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8'];
const MARK = ['①', '②', '③', '④'];
const nameOf = (id: string) => missionById(id)!.title.replace(/^[^:]+:\s*/, '');

/** Run time of the reference answer at ×1 (quick.ts cell seconds, measured 2026-11-09). */
const RUN_S: Record<string, string> = {
  F1: '약 1분 30초 (O · X로 3번 멈춤, 약 2분)',
  F2: '약 30초 (▶▶ 빨리면 약 10초)',
  F3: '손 조작 (학생에 따라 1~5분)',
  F4: '약 1분 35초 (×4면 약 25초, ⚡ 결과 바로는 몇 초)',
  F5: '약 1분 30초 (×4면 약 25초)',
  F6: '약 3분 (×4면 약 45초)',
  F7: '약 2분 45초 (×4면 약 40초)',
  F8: '영업 하루 약 14분 (×4로 열려서 약 3분 30초, ⚡ 결과 바로는 몇 초)',
};

/** 진도 운영 (as VEX STEM Labs' pacing notes): a 차시 of the 4차시 구성 — what to show instead of having it done, and what a fast and a slow group do. */
const PACE: Record<number, { demo: string; fast: string; slow: string }> = {
  1: { demo: '퀘스트 1은 프로젝터로 함께 보고, O · X는 손을 들어 답하게 해도 돼요.', fast: '⋯ › 자유 연습에서 조그로 손끝을 제빙기 · 커피 머신 위에 맞춰 보기.', slow: '퀘스트 3은 STEP 10 → 5 → 1 mm 순서로. 짝과 둘이 한 화면으로 해도 돼요.' },
  2: { demo: "퀘스트 5의 '문으로 건네기'를 한 번 시범으로 돌려 보여 주세요.", fast: '내 메뉴를 하나 더 만들어 보기(따뜻한 메뉴 · 연한 메뉴).', slow: '실행은 ×4로, 결과만 볼 때는 ⚡ 결과 바로.' },
  3: { demo: '퀘스트 6을 ×4로 한 번 시범: 둘째 잔이 기다리는 순간을 함께 보기.', fast: '메뉴 3까지 만들어 조건 블록이 고르는 것 보기.', slow: '⚡ 결과 바로로 ✗ 항목부터 확인하고 고치기.' },
  4: { demo: '시작할 때 ⚡ 결과 바로로 하루 결과(몇 명 성공)를 먼저 보여 주고 목표를 정해요.', fast: '10명 모두 성공 · 한 잔 시간 줄이기에 도전.', slow: '⚡ 결과 바로로 여러 번 고쳐 보고, 마지막에 ×4로 한 번 보기.' },
};

/** Minutes of a 50-minute 차시 (4차시 구성) for each quest: 설명 (교안) and 수행 (앱). An estimate, not yet timed in class. */
const MIN: Record<string, [number, number]> = { F1: [4, 6], F2: [3, 5], F3: [4, 13], F4: [5, 13], F5: [5, 12], F6: [5, 12], F7: [5, 13], F8: [8, 27] };

/** Where students get stuck and what to say (from the class walk-through, review images 1 – 4). */
const STUCK: Record<string, string[]> = {
  F1: ['장면이 멈추고 O · X 창이 뜨면 하나를 골라야 이어져요. 모르면 [답하지 않고 계속].', '말풍선이 빨리 지나가면 ×1로 두고 다시 ▶.'],
  F2: ['[추출]은 한 번만 눌러요. [추출 끝]이 켜지면 저절로 통과해요.', '기다림이 길면 옆의 ▶▶ 빨리(×4).'],
  F3: ["X · Y(앞뒤 · 좌우)를 먼저 맞추고 높이(Z)는 마지막에. 고리 높이는 60 mm예요('고리까지' 세 숫자).", '가까워지면 STEP을 10 → 5 → 1 mm로 줄여요.'],
  F4: ['메뉴를 하나도 안 바꾸면 통과하지 않아요. 샷 · 얼음 · 물 · 이름 중 하나를 바꾸게 하세요.', '양의 합이 컵(355 ml)을 넘으면 넘쳐요. 컵 그림의 숫자를 보게 하세요.'],
  F5: ["건네기 블록의 '픽업 문으로 건네기' 체크 하나 → ▶. 문이 열린 동안 팔이 들어가면 안전 정지예요.", '손님 손이 감지되는 동안 로봇은 기다려요(멈춘 게 아니에요).'],
  F6: ['🔁 반복이 1번으로 시작해요. 주문 수(2)에 맞춰 + 를 눌러요.', '시간이 걸리니 ×4로 보게 하세요. 둘째 잔이 기다리는 까닭을 물어보세요.'],
  F7: ["[+ 메뉴] → 생긴 '메뉴 2' 탭에서 이름 · 양을 바꿔요. ❓ 조건 블록이 주문 번호로 메뉴를 골라요.", '▶가 패널 아래에 있으면 패널을 아래로 내려요.'],
  F8: ['처음부터 ×4로 열려요. 결과만 빨리 보려면 ⚡ 결과 바로(몇 초).', '실패하면 ✗ 항목(몇 명 성공)을 보고 메뉴 · 기다림을 고쳐 다시. 한 잔 시간을 줄이는 게 열쇠예요.'],
};

const doHow = (id: string) => {
  const m = missionById(id)!;
  const steps = [`오른쪽 위 퀘스트 점에서 <b>${m.n}</b>을 눌러 열어요. 이름 옆 파란 표시가 <b>교안 ${LESSON_QUEST[id].pages[0]}–${LESSON_QUEST[id].pages[1]}쪽</b>이에요.`];
  steps.push(esc(QUESTS[id].todo));
  for (const l of QUEST_LEAD[id] ?? []) steps.push(`노란 말풍선: "${esc(l.say)}"`);
  if (m.mode === 'hand') steps.push('조건을 다 맞추면 저절로 통과해요.');
  else steps.push('끝나면 장면 왼쪽 위에 결과 카드(✓ · ✗ 항목, 개념 이름 · 교안 쪽)가 떠요. ✗가 있으면 그 항목을 고쳐 다시 ▶.');
  return steps;
};

/** What the app shows without words (its signs, the O · X answers): said here, the app only does. */
const ox = (STEP_GUIDES.F1?.asks ?? []).map((a, k) => `O · X ${k + 1}: ${esc(a.q)} → <b>${esc(a.options[a.answer])}</b> (${esc(a.why)})`);
const SCREEN: Record<string, string[]> = {
  F1: ['장면이 멈추며 O · X가 3번 떠요. 앱은 정답만 보여 주니, 까닭은 교사가 말해 주세요.', ...ox],
  F2: ['머신 판의 동그라미 3개: [머신 컵 감지] (입력) · [추출 중] · [추출 끝] (출력 신호). 초록이 켜진 것.', '▶▶ 빨리: 붓는 동안만 4배 빠르게.'],
  F3: ["'고리까지' 세 숫자 = 손끝에서 고리까지 앞뒤(X) · 좌우(Y) · 높이(Z) mm. 모두 0 가까이면 통과.", 'COORD 좌표: 화살표 키가 손끝을 그 방향으로 STEP mm씩 옮겨요.'],
  F4: ['로봇 동작 블록: ⠿를 끌거나 ▲▼로 순서를 바꿔요. 컵 받기가 맨 앞, 건네기가 맨 뒤.', '🧲 끝 신호까지 = 장비가 [끝] 신호를 줄 때까지 기다림. 초로 바꾸면, 붓는 시간보다 짧을 때 쏟아져요.', '컵 그림의 숫자 = 지금 양 / 355 ml (넘치면 실패).'],
  F5: ['건네기 블록 안: 문 열기 · [문 열림] 기다리기 → 손님이 가져갈 때까지([손 감지] 켜졌다 꺼짐) → 문 닫기 · [문 닫힘] 기다리기.'],
  F6: ['🔁 반복 블록: 안의 블록을 그 번수만큼 되풀이해요. 오른쪽 표시 ✓ 주문 2잔 = 맞음.'],
  F7: ['❓ 조건 블록: 주문 번호(메뉴 1 · 2)를 보고 그 메뉴의 블록으로 만들어요. 메뉴가 2개일 때만 나와요.'],
  F8: ['⚡ 주문 이벤트: 주문이 들어올 때마다 만들어요. 영업 끝 신호가 오면 멈춰요.', '손님 머리 위: 번호 · 기분(😊 😐 😠, 만드는 중 ☕) · 인내심 막대. 픽업 위 주문판: 준비 중 / 완료 번호. 컵 위 주황 번호 = 그 손님의 컵.', '⚡ 결과 바로: 화면 없이 하루를 몇 초에 계산해 결과만 보여 줘요.'],
};

const planCell = (id: string) => PLAN_SIZES.map((n) => `${n}차시 구성: ${lessonOfQuest(n, id)}차시`).join(' · ');

/**
 * Material 3 inspired, quiet: tonal surfaces instead of black bars, 12 px rounded cards with a soft
 * shadow, light table heads, chips for tags and page marks. Primary blue for what to read, green for
 * goals and answers, red-orange only for '막힐 때'. The brand logo on the cover (no picture there).
 */
const CSS = `
@page{size:A4;margin:0}*{box-sizing:border-box}html,body{margin:0}
:root{--p:#0b57d0;--pc:#e8f0fe;--on:#1f1f1f;--sub:#5f6368;--line:#dadce0;--sv:#f1f4f9;--ok:#146c2e;--okc:#e6f4ea;--warn:#b3261e;--warnc:#fce8e6}
body{font-family:'Noto Sans CJK KR','Noto Sans KR','Malgun Gothic',sans-serif;color:var(--on);font-size:10.3pt;line-height:1.55;word-break:keep-all;overflow-wrap:anywhere}
.page{width:210mm;height:297mm;padding:15mm 16mm 17mm;position:relative;overflow:hidden;page-break-after:always;display:flex;flex-direction:column;gap:3.4mm}
.page:last-child{page-break-after:auto}
.top{display:flex;align-items:center;gap:8px;padding-bottom:2.4mm;border-bottom:1px solid var(--line)}
.top h1{font-size:17pt;font-weight:600;margin:0;line-height:1.25;letter-spacing:-0.2px}.top h1 small{font-weight:500}
.top .tag{margin-left:auto;font-size:8.6pt;font-weight:500;color:var(--sub);white-space:nowrap;border:1px solid var(--line);border-radius:8px;padding:1mm 2.6mm}
.pg{position:absolute;bottom:8mm;left:16mm;right:16mm;display:flex;justify-content:space-between;font-size:8.6pt;color:var(--sub);border-top:1px solid var(--line);padding-top:2mm}
.pgtag{display:inline-block;background:var(--pc);color:var(--p);font-weight:700;border-radius:8px;padding:0.4mm 2.4mm;font-size:9pt}
h2{font-size:12pt;font-weight:600;margin:1.5mm 0 0;color:var(--p)}h2 small{font-weight:400;color:var(--sub);font-size:8.8pt;margin-left:6px}
.goal{background:var(--okc);color:#0d3b1e;border-radius:12px;padding:2.6mm 4mm;font-weight:600}
.concept{background:var(--pc);border-radius:12px;padding:3mm 4mm}.concept b{color:var(--p);font-size:11.5pt;font-weight:600}.concept p{margin:1mm 0}.concept small{color:#3c4043}
img.shot{width:100%;border-radius:12px;box-shadow:0 1px 2px rgba(60,64,67,.3),0 1px 3px 1px rgba(60,64,67,.15)}
table{width:100%;border-collapse:separate;border-spacing:0;font-size:9.5pt;border:1px solid var(--line);border-radius:12px;overflow:hidden}
th,td{padding:1.6mm 2.4mm;vertical-align:top;text-align:left;border-bottom:1px solid var(--line)}
tr:last-child th,tr:last-child td{border-bottom:0}th+td,td+td,td+th,th+th{border-left:1px solid var(--line)}
th{background:var(--sv);color:var(--on);font-weight:600}
ol,ul{margin:0;padding-left:5.5mm}li{margin:0.6mm 0}
.box{border:1px solid var(--line);border-radius:12px;padding:3mm 4mm;background:#fff}
.box h3{margin:0 0 1.2mm;font-size:10.5pt;font-weight:600}
.box.o{background:var(--warnc);border-color:transparent}.box.o h3{color:var(--warn)}
.box.i{background:#f8fafd;border-color:#c2d4f6}.box.i h3{color:var(--p)}
.two{display:grid;grid-template-columns:1fr 1fr;gap:4mm}
.q{margin:1.2mm 0}.q .opts{display:flex;flex-wrap:wrap;gap:1mm 5mm;margin-left:4mm;color:#3c4043}.q .ans{color:var(--ok);font-weight:700}
.why{color:var(--sub);font-size:9pt;margin-left:4mm}
.lines div{border-bottom:1px solid var(--line);height:8.5mm}
.who{display:flex;gap:10mm;font-size:11pt}.who span{border-bottom:1px solid var(--on);min-width:32mm;display:inline-block}
.cover{flex:1;display:flex;flex-direction:column;gap:6mm}
.cover .logo{height:16mm;align-self:flex-start}
.cover .hero{margin-top:32mm;display:flex;flex-direction:column;gap:4mm}
.cover .kicker{font-size:11pt;font-weight:600;color:var(--p);letter-spacing:.3px}
.cover h1{font-size:34pt;font-weight:600;margin:0;line-height:1.18;letter-spacing:-0.8px}
.cover .sub{font-size:13pt;color:var(--sub);margin:0}
.chips{display:flex;flex-wrap:wrap;gap:2.5mm}.chips span{border:1px solid var(--line);border-radius:8px;padding:1.2mm 3.4mm;font-size:9.6pt;color:#3c4043}
.cover .foot{margin-top:auto;display:flex;flex-direction:column;gap:4mm}
.flow{display:grid;grid-template-columns:repeat(5,1fr);gap:2.4mm}.flow div{background:var(--sv);border-radius:12px;padding:2.4mm}.flow b{display:block;font-weight:600}.flow .t{color:var(--p)}.flow .a{color:var(--ok)}
.legend li b{display:inline-block;width:5.5mm;height:5.5mm;border-radius:50%;background:#F2542D;color:#fff;text-align:center;line-height:5.5mm;font-size:8.5pt;margin-right:1.5mm}
.chk li{list-style:none;margin-left:-5mm}.chk li::before{content:'☐ ';font-size:11pt}
.tight{font-size:8pt;line-height:1.38}.tight th,.tight td{padding:0.8mm 1.6mm}
.note{font-size:8.5pt;color:var(--sub);margin-top:auto}
`;

function page(body: string, n: number, total: string) {
  return `<section class="page">${body}<div class="pg"><span>${total}</span><span>${n}</span></div></section>`;
}

function guideHtml(): string {
  const T = '로봇 카페 교안 (교사용)';
  const pages: string[] = [];
  // 1 표지
  pages.push(
    page(
      cover(
        '입문 ① 생활 로봇 · 로봇 카페',
        '로봇 카페 교안',
        '교사용 · 고등학교 50분 · 4차시 기준 (6 · 8차시로도 골라 써요)',
        ['퀘스트 8개', '교안 22쪽', '앱과 같은 쪽 번호', '수행평가 자동 기록'],
        `<div class="box i"><h3>이 교안과 앱은 같은 쪽 번호를 써요</h3>
<p style="margin:0">앱의 퀘스트 이름 옆 <span class="pgtag">교안 6–7쪽</span> 표시가 이 교안의 쪽이에요. <b>설명은 교안이, 실습은 앱이 맡아요</b>: 앱에는 누르고 바꾸고 돌려 보는 것만 있고, 개념 · 까닭 · 화면 기호의 뜻은 이 교안에 있어요. 확인 문제와 수행 기록은 앱의 <b>학습 기록</b>에 남고, 학생이 낸 파일을 교사가 모아 수행평가 표로 만들어요.</p></div>
<table><tr><th>대상</th><td>고등학생, 로봇 · 코딩 처음 (50분 차시)</td><th>준비</th><td>학생 1인 1대 PC(크롬 · 엣지), 프로젝터, 교안 (학생용)</td></tr>
<tr><th>주소</th><td colspan="3">/track/life (교사 열쇠의 <b>수업 링크</b>로 열면 같은 차시가 열려요)</td></tr></table>
<p class="note" style="margin-top:0">모든 결과는 시뮬레이션 기준이에요. 실물 로봇은 쓰지 않아요.</p>`,
      ),
      1,
      T,
    ),
  );
  // 2 수업 안내
  // Rows = 차시, columns = the three plans: which quests (and pages) each 차시 takes.
  const plans = PLAN_SIZES.map((n) => lessonsOf(n));
  const planRows = [1, 2, 3, 4, 5, 6, 7, 8]
    .map(
      (k) =>
        `<tr><th>${k}차시</th>${plans.map((ls) => (ls[k - 1] ? `<td>퀘스트 ${ls[k - 1].quests.map((q) => q.slice(1)).join(' · ')} <span style="color:#555">(${ls[k - 1].pages[0]}–${ls[k - 1].pages[1]}쪽)</span></td>` : '<td style="background:#f2f2f2"></td>')).join('')}</tr>`,
    )
    .join('');
  const goals = IDS.map(
    (id) => `<tr><td>${missionById(id)!.n}. ${esc(nameOf(id))}</td><td>${esc(LESSON_QUEST[id].learn)}</td><td>${esc(LESSON_QUEST[id].concept.term)}</td><td>${LESSON_QUEST[id].pages[0]}–${LESSON_QUEST[id].pages[1]}</td></tr>`,
  ).join('');
  pages.push(
    page(
      `<div class="top"><h1>수업 안내</h1><span class="tag">${T}</span></div>
<h2>차시 구성 (교사 열쇠에서 고르기)</h2><table style="font-size:9pt"><tr><th style="width:12%"></th>${PLAN_SIZES.map((n) => `<th>${n}차시 구성</th>`).join('')}</tr>${planRows}</table>
<h2>퀘스트별 학습 목표 · 개념</h2><table class="tight"><tr><th style="width:30%">퀘스트</th><th>학습 목표</th><th style="width:18%">개념</th><th style="width:9%">쪽</th></tr>${goals}</table>
<h2>한 차시 흐름 (50분) <small>파란색 = 교안(교사) · 초록색 = 앱(학생)</small></h2>
<div class="flow"><div><b class="t">도입 5분</b>지난 개념 · 오늘 목표 · 발문 (설명 쪽)</div><div><b class="t">설명</b>퀘스트마다 개념 · 화면 기호 (설명 쪽 + 프로젝터)</div><div><b class="a">수행</b>앱 퀘스트 (수행 쪽의 할 일). 설명 + 수행 = 35분</div><div><b class="a">확인 5분</b>앱 확인 문제 3개 (자동 채점)</div><div><b class="t">정리 5분</b>개념 한 문장 · 학습 기록 제출</div></div>
<p class="note">퀘스트별 시간은 강의 계획서 · 지도안을 보세요(예시, 아직 수업에서 재지 않음). 4차시 구성은 짧은 퀘스트(1 · 2 · 3)를 묶고 운영(8)은 한 차시로 했어요. 기다림이 길면 ▶ 옆 ×4나 ⚡ 결과 바로를 쓰게 하세요.</p>`,
      2,
      T,
    ),
  );
  // 3 앱 화면 · 교사 열쇠
  pages.push(
    page(
      `<div class="top"><h1>앱 화면과 교사 열쇠</h1><span class="tag">${T}</span></div>
<img class="shot" src="${img('screen.jpg')}" alt="앱 화면">
<ol class="legend" style="list-style:none;padding:0;columns:2;column-gap:6mm">
<li><b>1</b>교안 쪽 표시: 지금 퀘스트가 교안 몇 쪽인지</li><li><b>2</b>퀘스트 점: 교사가 연 차시까지만 눌러져요</li>
<li><b>3</b>▶ 시뮬레이션 · ⚡ 결과 바로 · 빠르기 ×1/×4 · ⋯(자유 연습)</li><li><b>4</b>차시 판: 교안 쪽 · 확인 문제 · 학습 기록</li>
<li><b>5</b>학습 기록: 늘 위에 보여요 (LMS)</li><li><b>6</b>⚙ 설정 › 교사 열쇠 · 수업 운영</li></ol>
<div class="two"><div><img class="shot" src="${img('teacher.jpg')}" alt="교사 열쇠"></div>
<div class="box"><h3>수업 전 (교사 PC, 1분)</h3><ol><li>⚙ › <b>교사 열쇠</b>에서 차시 구성(4 · 6 · 8)을 골라요.</li><li><b>지금 열 차시</b>를 오늘 차시로 골라요.</li><li><b>수업 링크</b>를 복사해 학급 게시판 · 칠판에 올려요. 학생이 이 링크로 열면 같은 차시가 열려요.</li><li><b>수업 화면 띄우기</b>로 프로젝터에 오늘 목표 · 퀘스트 · 확인 문제를 띄워요.</li></ol>
<h3 style="margin-top:2mm">늦은 학생 · 시연</h3><p style="margin:0">'모든 퀘스트 열기'를 켜면 차시와 상관없이 열려요. 공용 노트북은 수업 시작 전에 '이 PC 기록 지우기'.</p></div></div>`,
      3,
      T,
    ),
  );
  // 4–19 퀘스트
  for (const id of IDS) {
    const m = missionById(id)!;
    const L = LESSON_QUEST[id];
    pages.push(
      page(
        `<div class="top"><h1>퀘스트 ${m.n} · ${esc(nameOf(id))} <small style="font-size:10pt;color:#555">설명</small></h1><span class="tag">${planCell(id)}</span></div>
<div class="goal">학습 목표 · ${esc(L.learn)}</div>
<div class="concept"><b>개념 · ${esc(L.concept.term)}</b><p>${esc(L.concept.def)}</p><small>실제 현장 · ${esc(L.concept.real)}</small></div>
<img class="shot" style="max-height:78mm;object-fit:cover;object-position:top" src="${img(`${id}.jpg`)}" alt="퀘스트 ${m.n} 화면">
<div class="box i"><h3>앱 화면에서 볼 것 <small style="font-weight:400;color:#5f6368">(앱에는 글로 없어요: 설명해 주세요)</small></h3><ul>${SCREEN[id].map((t) => `<li>${t}</li>`).join('')}</ul></div>
<div class="two"><div class="box"><h3>도입 발문</h3><ul><li>${esc(L.checks[0].q.replace(/[?.]$/, ''))}? (답은 수행 뒤에 확인)</li><li>${esc(m.adds)}: 무엇이 중요할까요?</li></ul></div>
<div class="box"><h3>설명할 것</h3><p style="margin:0">${esc(m.hint)}</p></div></div>
<p class="note">학생에게 줄 과제: ${esc(m.goal)}</p>`,
        L.pages[0],
        T,
      ),
    );
    const checks = L.checks
      .map(
        (c, k) =>
          `<div class="q"><b>${k + 1}. ${esc(c.q)}</b><div class="opts">${c.options.map((o, i) => `<span class="${i === c.answer ? 'ans' : ''}">${MARK[i]} ${esc(o)}</span>`).join('')}</div><div class="why">→ ${esc(c.why)}</div></div>`,
      )
      .join('');
    pages.push(
      page(
        `<div class="top"><h1>퀘스트 ${m.n} · ${esc(nameOf(id))} <small style="font-size:10pt;color:#555">수행 · 확인</small></h1><span class="tag">${planCell(id)}</span></div>
<h2>앱에서 할 일 <small>학생에게 이 순서로 안내해요</small></h2><ol>${doHow(id)
          .map((s) => `<li>${s}</li>`)
          .join('')}</ol>
<h2>통과 조건 <small>앱이 자동으로 확인해요</small></h2><ul>${(m.checks ?? []).map((c) => `<li>${esc(c.label)}</li>`).join('')}</ul>
<table><tr><th style="width:22%">걸리는 시간</th><td>${RUN_S[id]}</td></tr></table>
<div class="box o"><h3>막힐 때 이렇게 말해 주세요</h3><ul>${STUCK[id].map((s) => `<li>${esc(s)}</li>`).join('')}</ul></div>
<h2>확인 문제 <small>앱에서 차시 끝에 풀어요 · 초록색이 정답</small></h2>${checks}
<p class="note">확인 문제는 처음 고른 답이 학습 기록에 남아요. 차시에 따라 이 중 일부가 나와요(교안 ${GUIDE_PAGES.answers}쪽).</p>`,
        L.pages[1],
        T,
      ),
    );
  }
  // 20 정답
  const all = IDS.flatMap((id) => LESSON_QUEST[id].checks.map((c, k) => `<tr><td>${missionById(id)!.n}-${k + 1}</td><td>${esc(c.q)}</td><td><b>${MARK[c.answer]} ${esc(c.options[c.answer])}</b></td><td>${esc(c.why)}</td></tr>`)).join('');
  pages.push(
    page(
      `<div class="top"><h1>확인 문제 정답 (24문항)</h1><span class="tag">${T}</span></div>
<table class="tight"><tr><th style="width:7%">번호</th><th>문제</th><th style="width:22%">정답</th><th style="width:30%">까닭</th></tr>${all}</table>
<p class="note">한 차시의 확인 문제 3개는 그 차시 퀘스트의 문제에서 차례로 골라요(퀘스트 1개 차시는 그 퀘스트의 3문항, 2개 차시는 1-1 · 2-1 · 1-2 처럼).</p>`,
      GUIDE_PAGES.answers,
      T,
    ),
  );
  // 21 평가
  pages.push(
    page(
      `<div class="top"><h1>평가 기준 (수행평가)</h1><span class="tag">${T}</span></div>
<h2>앱이 자동으로 남기는 것</h2>
<table><tr><th style="width:26%">항목</th><th>어떻게</th></tr>
<tr><td>퀘스트 통과</td><td>통과 조건을 모두 맞추면 ✓. 퀘스트마다 시도 횟수(▶ 누른 수)와 걸린 시간(처음 연 때부터 통과까지)</td></tr>
<tr><td>확인 문제</td><td>차시마다 3문항 객관식, 처음 고른 답으로 자동 채점. 학생 파일을 열 때 다시 채점해요(파일을 고쳐도 점수가 바뀌지 않아요)</td></tr>
<tr><td>3단계 기준</td><td>차시의 확인 문제를 다 풀면 그 차시 기준이 정해져요</td></tr></table>
<h2>3단계 기준</h2><table>${RUBRIC.map((r) => `<tr><th style="width:14%">${r.level}</th><td>${esc(r.text)}</td></tr>`).join('')}</table>
<h2>교사가 더하는 것 (선택)</h2>
<div class="box"><ul><li><b>개념 한 문장</b>: 학습지 끝의 '개념 한 문장'을 읽고 맞음 · 고침으로 표시해요.</li><li><b>태도</b>: 막혔을 때 ✗ 항목을 보고 스스로 고쳤는지(시도 횟수가 근거가 돼요).</li></ul></div>
<p class="note">점수로 바꿀 때는 학교의 수행평가 기준에 맞게 정하세요(예: 잘함 · 보통 · 노력 = 3 · 2 · 1점). 위 기준은 앱 안에서 쓰는 이름이에요.</p>`,
      GUIDE_PAGES.rubric,
      T,
    ),
  );
  // 22 반 결과
  pages.push(
    page(
      `<div class="top"><h1>반 결과 정리</h1><span class="tag">${T}</span></div>
<div class="two"><img class="shot" src="${img('record.jpg')}" alt="학습 기록"><div class="box"><h3>학생 (수업 끝 2분)</h3><ol><li>위의 <b>학습 기록</b>을 눌러 번호 · 이름을 써요.</li><li><b>제출 파일 받기</b> → <i>번호-이름-로봇카페-학습기록.json</i></li><li>학급 게시판 · USB · 메일로 교사에게 내요.</li><li>(선택) <b>기록지 인쇄 · PDF 저장</b>으로 종이 기록지를 내요.</li></ol></div></div>
<div class="box"><h3>교사 (수업 뒤)</h3><ol><li>⚙ › 교사 열쇠 › <b>학생 제출 파일 넣기</b>: 여러 파일을 한 번에 골라요(같은 학생이 둘이면 나중 것).</li><li>표에서 차시마다 '퀘스트 통과 · 확인 문제 · 기준'을 봐요.</li><li><b>엑셀(CSV) 받기</b>: 번호 · 이름 · 차시별 통과 · 확인 · 기준 · 전체가 한 줄씩. 학교 성적 양식에 붙여 써요.</li></ol></div>
<h2>엑셀 열</h2><table><tr><th>번호</th><th>이름</th><th>n차시 통과</th><th>n차시 확인</th><th>n차시 기준</th><th>퀘스트 통과 (8)</th><th>확인 문제 맞힘</th><th>전체 기준</th></tr><tr><td>7</td><td>김하나</td><td>2/2</td><td>3/3</td><td>잘함</td><td>2</td><td>3/3</td><td>잘함</td></tr></table>
<p class="note">기록은 학생 브라우저에만 저장돼요(서버 없음). 학교망에서도 파일로 주고받으면 돼요.</p>`,
      GUIDE_PAGES.results,
      T,
    ),
  );
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${T}</title><style>${CSS}</style></head><body>${pages.join('')}</body></html>`;
}

function sheetHtml(): string {
  const T = '로봇 카페 교안 (학생용)';
  const pages: string[] = [];
  const who = '<div class="who">번호 <span></span> 이름 <span></span></div>';
  pages.push(
    page(
      cover(
        '입문 ① 생활 로봇 · 로봇 카페',
        '로봇 카페 교안',
        '학생용 · 개념은 이 교안에서, 실습은 앱에서',
        ['퀘스트 8개', '관찰 기록', '확인 문제', '개념 한 문장'],
        `${who}
<table><tr><th style="width:30%">우리 반 차시 구성</th><td>☐ 4차시 ☐ 6차시 ☐ 8차시</td></tr></table>
<div class="box i"><h3>이렇게 써요</h3><ol><li>앱의 퀘스트 이름 옆 <span class="pgtag">교안 n쪽</span>이 보이면, 이 교안에서 같은 퀘스트 쪽을 펴요.</li><li>앱에서 할 일을 하고 ☐에 ✓.</li><li>본 것을 적고, 확인 문제에 답해요(앱에서도 풀어요).</li><li>개념을 내 말로 한 문장 써요.</li></ol></div>
<table class="tight"><tr><th>퀘스트</th><th style="width:18%">이 교안 쪽</th><th style="width:30%">교사용 교안 쪽 (앱 표시)</th></tr>${IDS.map((id, i) => `<tr><td>${i + 1}. ${esc(nameOf(id))}</td><td>${i + 2}</td><td>${LESSON_QUEST[id].pages[0]}–${LESSON_QUEST[id].pages[1]}</td></tr>`).join('')}</table>`,
      ),
      1,
      T,
    ),
  );
  IDS.forEach((id, i) => {
    const m = missionById(id)!;
    const L = LESSON_QUEST[id];
    pages.push(
      page(
        `<div class="top"><h1>퀘스트 ${m.n} · ${esc(nameOf(id))}</h1><span class="tag"><span class="pgtag">교안 ${L.pages[0]}–${L.pages[1]}쪽</span></span></div>${who}
<div class="goal">오늘 배울 것 · ${esc(L.learn)}</div>
<div class="concept"><b>개념 · ${esc(L.concept.term)}</b><p>${esc(L.concept.def)}</p><small>실제 현장 · ${esc(L.concept.real)}</small></div>
<h2>앱에서 할 일</h2><ul class="chk"><li>퀘스트 점 <b>${m.n}</b>을 눌러 열기</li><li>${esc(QUESTS[id].todo)}</li><li>결과 카드에서 ✓ · ✗ 확인하기</li></ul>
<h2>관찰 기록 <small>무엇을 보았나요? 로봇은 무엇을 기다렸나요?</small></h2><div class="lines"><div></div><div></div></div>
<h2>확인 문제 <small>답에 ○</small></h2>${L.checks.map((c, k) => `<div class="q"><b>${k + 1}. ${esc(c.q)}</b><div class="opts">${c.options.map((o, j) => `<span>${MARK[j]} ${esc(o)}</span>`).join('')}</div></div>`).join('')}
<h2>개념 한 문장 <small>'${esc(L.concept.term)}'을 내 말로</small></h2><div class="lines"><div></div><div></div></div>
<table><tr><th style="width:25%">자기 점검</th><td>☐ 통과했어요 · 시도 ___번 · ☐ 확인 문제를 앱에서 풀었어요</td></tr></table>`,
        i + 2,
        T,
      ),
    );
  });
  pages.push(
    page(
      `<div class="top"><h1>정리와 자기 점검</h1><span class="tag">${T}</span></div>${who}
<h2>내 기록 <small>앱 › 학습 기록에서 옮겨 써요</small></h2>
<table><tr><th>차시</th><th>퀘스트 통과</th><th>확인 문제</th><th>기준</th></tr>${[1, 2, 3, 4, 5, 6, 7, 8].map((n) => `<tr><td>${n}차시</td><td></td><td>&nbsp;/ 3</td><td></td></tr>`).join('')}</table>
<h2>오늘 배운 로봇의 일 <small>카페 로봇은 무엇을 보고 다음 일을 할까요?</small></h2><div class="lines"><div></div><div></div><div></div></div>
<h2>더 알고 싶은 것</h2><div class="lines"><div></div><div></div></div>
<p class="note">수업이 끝나면 앱의 학습 기록에서 '제출 파일 받기'로 파일을 내요.</p>`,
      10,
      T,
    ),
  );
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${T}</title><style>${CSS}</style></head><body>${pages.join('')}</body></html>`;
}

function planHtml(): string {
  const T = '로봇 카페 강의 계획서 · 지도안';
  const pages: string[] = [];
  const four = lessonsOf(4);
  const page_ = (b: string, n: number) => page(b, n, T);
  pages.push(
    page_(
      cover(
        '입문 ① 생활 로봇 · 로봇 카페',
        '강의 계획서 ·<br>교수 · 학습 지도안',
        '고등학교 · 4차시 (차시당 50분) · 1인 1PC 시뮬레이션 실습',
        ['강의 계획서', '평가 계획', '차시별 지도안 4', '6 · 8차시 배치'],
        `<table><tr><th style="width:22%">함께 쓰는 자료</th><td>로봇 카페 교안 (교사용) 22쪽 · 교안 (학생용) 10쪽 · 앱 /track/life (앱의 '교안 n쪽' = 교사용 교안의 쪽)</td></tr>
<tr><th>역할 나누기</th><td>교안이 설명(개념 · 까닭 · 화면 기호)을, 앱이 실습(조작 · 실행 · 결과)을 맡아요. 앱에는 글이 적어요.</td></tr></table>
<p class="note" style="margin-top:0">시간 배분은 예시예요(아직 수업에서 재지 않음). 모든 결과는 시뮬레이션 기준이에요.</p>`,
      ),
      1,
    ),
  );
  const rows = four
    .map(
      (l) =>
        `<tr><th>${l.n}차시</th><td>${l.quests.map((q) => `${q.slice(1)}. ${esc(nameOf(q))}`).join('<br>')}</td><td>${l.quests.map((q) => esc(LESSON_QUEST[q].learn)).join('<br>')}</td><td>${l.quests.map((q) => esc(LESSON_QUEST[q].concept.term)).join('<br>')}</td><td>${l.pages[0]}–${l.pages[1]}</td><td>퀘스트 통과 ${l.quests.length} · 확인 문제 3</td></tr>`,
    )
    .join('');
  pages.push(
    page_(
      `<div class="top"><h1>강의 계획서</h1><span class="tag">${T}</span></div>
<table><tr><th style="width:18%">과정</th><td>입문 ① 생활 로봇 — 로봇 카페</td><th style="width:16%">대상</th><td>고등학생 (로봇 · 코딩 처음)</td></tr>
<tr><th>시간</th><td>4차시 × 50분 (6 · 8차시로 늘릴 수 있음)</td><th>형태</th><td>1인 1PC, 시뮬레이터 실습 + 교안</td></tr>
<tr><th>준비</th><td colspan="3">학생 PC(크롬 · 엣지 최신), 교사 PC + 프로젝터, 교안 (학생용) 인쇄, 수업 링크(⚙ 교사 열쇠)</td></tr></table>
<h2>과정 목표</h2><ol><li>협동로봇이 장비의 <b>신호(입력 · 출력)</b>를 보고 순서대로 일한다는 것을 설명한다.</li><li>메뉴(양)와 동작 블록(순서 · 기다림)을 바꿔 <b>원하는 결과</b>를 만든다.</li><li>안전문 · 반복 · 조건 · 이벤트로 <b>여러 손님을 받는 카페</b>를 운영하고 결과로 고친다.</li></ol>
<h2>차시별 계획 <small>4차시 구성</small></h2>
<table class="tight"><tr><th style="width:8%">차시</th><th style="width:22%">퀘스트</th><th>학습 목표</th><th style="width:17%">핵심 개념</th><th style="width:8%">교안</th><th style="width:15%">평가</th></tr>${rows}</table>
<p class="note">교안 쪽은 교사용 교안의 쪽이에요(앱의 퀘스트 이름 옆 표시와 같아요). 학생용 교안은 퀘스트 n이 n + 1쪽이에요.</p>`,
      2,
    ),
  );
  const planRows = [1, 2, 3, 4, 5, 6, 7, 8]
    .map((k) => `<tr><th>${k}차시</th>${PLAN_SIZES.map((n) => lessonsOf(n)[k - 1]).map((l) => (l ? `<td>퀘스트 ${l.quests.map((q) => q.slice(1)).join(' · ')}</td>` : '<td style="background:#f2f2f2"></td>')).join('')}</tr>`)
    .join('');
  pages.push(
    page_(
      `<div class="top"><h1>평가 계획 · 차시 운영</h1><span class="tag">${T}</span></div>
<h2>수행평가 <small>앱이 자동으로 기록 · 채점, 학생이 파일로 제출</small></h2>
<table><tr><th style="width:22%">요소</th><th>방법</th><th style="width:20%">근거</th></tr>
<tr><td>퀘스트 통과</td><td>통과 조건을 모두 맞추면 ✓ (시도 횟수 · 걸린 시간도 남아요)</td><td>학습 기록</td></tr>
<tr><td>확인 문제</td><td>차시마다 객관식 3문항, 처음 고른 답으로 채점</td><td>학습 기록</td></tr>
<tr><td>개념 한 문장</td><td>학생용 교안의 '개념 한 문장'을 읽고 맞음 · 고침</td><td>학생용 교안</td></tr>
<tr><td>태도 (관찰)</td><td>✗ 항목을 보고 스스로 고쳤는지</td><td>시도 횟수 · 관찰</td></tr></table>
<h2>3단계 기준 (차시 · 전체)</h2><table>${RUBRIC.map((r) => `<tr><th style="width:14%">${r.level}</th><td>${esc(r.text)}</td></tr>`).join('')}</table>
<h2>6 · 8차시로 늘릴 때 <small>⚙ 교사 열쇠에서 골라요</small></h2>
<table style="font-size:9pt"><tr><th style="width:12%"></th>${PLAN_SIZES.map((n) => `<th>${n}차시 구성</th>`).join('')}</tr>${planRows}</table>
<div class="box"><h3>매 차시 운영</h3><ol><li>수업 전: ⚙ › 교사 열쇠에서 차시 구성 · <b>지금 열 차시</b>를 고르고 <b>수업 링크</b>를 게시해요. 학생이 링크로 열면 인트로 없이 그 차시 첫 퀘스트가 열려요(저절로 시작하지 않고 ▶를 기다려요).</li><li>수업 중: <b>수업 화면 띄우기</b>로 프로젝터에 오늘 목표 · 퀘스트 · 확인 문제를 띄워요.</li><li>수업 끝: 학생이 학습 기록 › <b>제출 파일 받기</b> → 교사가 <b>학생 제출 파일 넣기</b> → <b>엑셀(CSV) 받기</b>.</li></ol></div>`,
      3,
    ),
  );
  // 4–7: one 지도안 per 차시 (4차시 구성).
  for (const l of four) {
    const qs = l.quests;
    const asks = checksOf(4, l.n);
    const dev = qs
      .map((q) => {
        const m = missionById(q)!;
        const L = LESSON_QUEST[q];
        const [ex, dn] = MIN[q];
        return `<tr><td rowspan="2">전개<br><small>퀘스트 ${m.n}</small></td><td>${ex}분</td><td><b>설명</b> (교안 ${L.pages[0]}쪽): 개념 '${esc(L.concept.term)}'과 앱 화면에서 볼 것을 프로젝터로 짚기.</td><td>개념을 듣고 학생용 교안 ${m.n + 1}쪽의 개념 칸을 읽는다.</td><td>교안 ${L.pages[0]}쪽 · 프로젝터</td></tr>
<tr><td>${dn}분</td><td><b>수행 안내</b> (교안 ${L.pages[1]}쪽): "${esc(QUESTS[q].short)}". 순회하며 막힌 학생에게 '막힐 때' 문장으로 돕기.</td><td>앱에서 퀘스트 ${m.n}을 열고 ${esc(QUESTS[q].todo)} 관찰을 교안에 적는다.</td><td>앱 · 걸리는 시간 ${esc(RUN_S[q].replace(/ \(.*$/, ''))}</td></tr>`;
      })
      .join('');
    pages.push(
      page_(
        `<div class="top"><h1>${l.n}차시 교수 · 학습 지도안</h1><span class="tag">${T} · 50분</span></div>
<table><tr><th style="width:16%">단원</th><td>로봇 카페 — ${qs.map((q) => esc(nameOf(q))).join(' · ')}</td><th style="width:12%">차시</th><td style="width:16%">${l.n} / 4</td></tr>
<tr><th>학습 목표</th><td colspan="3">${qs.map((q) => esc(LESSON_QUEST[q].learn)).join('<br>')}</td></tr>
<tr><th>자료</th><td colspan="3">교사용 교안 ${l.pages[0]}–${l.pages[1]}쪽 · 학생용 교안 ${qs.map((q) => Number(q.slice(1)) + 1).join(' · ')}쪽 · 앱 퀘스트 ${qs.map((q) => q.slice(1)).join(' · ')} · 프로젝터</td></tr></table>
<table class="tight"><tr><th style="width:11%">단계</th><th style="width:6%">시간</th><th>교수 활동 (교사)</th><th style="width:27%">학습 활동 (학생)</th><th style="width:16%">자료 · 유의점</th></tr>
<tr><td>도입</td><td>5분</td><td>${l.n > 1 ? '지난 차시 개념 한 줄 확인. ' : '로봇 카페 장면을 띄우고 "로봇은 무엇을 보고 다음 일을 할까?" 묻기. '}발문: ${esc(LESSON_QUEST[qs[0]].checks[0].q)} (답은 수행 뒤에). 오늘 학습 목표 제시.</td><td>발문에 생각을 말하고, 수업 링크로 앱을 연다.</td><td>수업 화면(프로젝터) · 수업 링크</td></tr>
${dev}
<tr><td rowspan="2">정리</td><td>5분</td><td>앱의 차시 판 › 확인 문제 3개 안내 (${asks.map((a) => a.key.replace('F', '').replace('.', '-')).join(' · ')}). 정답 · 까닭은 교사용 교안 ${GUIDE_PAGES.answers}쪽.</td><td>확인 문제를 풀고(자동 채점), 개념 한 문장을 쓴다.</td><td>앱 차시 판</td></tr>
<tr><td>5분</td><td>개념을 한 문장으로 정리. 학습 기록 제출 안내. ${l.n < 4 ? `다음 차시(퀘스트 ${four[l.n].quests.map((q) => q.slice(1)).join(' · ')}) 예고.` : '하루 운영 결과(몇 명 성공)를 반 전체와 비교.'}</td><td>학습 기록 › 제출 파일 받기 → 제출.</td><td>교사 열쇠 › 반 결과 모으기</td></tr></table>
<div class="box i"><h3>진도 운영</h3><ul><li><b>시범으로 바꿔도 돼요</b> · ${esc(PACE[l.n].demo)}</li><li><b>빨리 끝낸 학생</b> · ${esc(PACE[l.n].fast)}</li><li><b>느린 학생</b> · ${esc(PACE[l.n].slow)}</li></ul></div>
<div class="box o"><h3>평가 · 유의점</h3><ul><li>평가: 퀘스트 ${qs.map((q) => q.slice(1)).join(' · ')} 통과 · 확인 문제 3문항 · 개념 한 문장 (3단계 기준, 교사용 교안 ${GUIDE_PAGES.rubric}쪽).</li><li>${esc(STUCK[qs[qs.length - 1]][0])}</li><li>확인 문제는 퀘스트를 다 못 했어도 열려요(앱이 한 번 물어요). 정리 시간에 다 함께 풀게 하세요.</li></ul></div>`,
        3 + l.n,
      ),
    );
  }
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${T}</title><style>${CSS}</style></head><body>${pages.join('')}</body></html>`;
}

const { chromium } = createRequire(path.join(execSync('npm root -g').toString().trim(), 'noop.js'))('playwright');
const browser = await chromium.launch();
const pg = await browser.newPage();
let bad = 0;
// pub: the copy the app links (⚙ 교사 열쇠), served at /guides/<pub>.pdf.
for (const [html, out, want, pub] of [
  [guideHtml(), 'manuals/course/로봇 카페 교안 (교사용).pdf', GUIDE_PAGES.results, 'cafe-teacher'],
  [sheetHtml(), 'manuals/course/로봇 카페 교안 (학생용).pdf', 10, 'cafe-student'],
  [planHtml(), 'manuals/course/로봇 카페 강의 계획서 · 지도안.pdf', 7, 'cafe-plan'],
] as const) {
  await pg.setContent(html, { waitUntil: 'load' });
  // Every page holds its content: nothing past its bottom (above the page number).
  const over = await pg.evaluate(() =>
    [...document.querySelectorAll('section.page')].flatMap((p, i) => {
      const box = p.getBoundingClientRect();
      const last = [...p.children].filter((c) => !c.classList.contains('pg')).map((c) => c.getBoundingClientRect().bottom);
      const low = Math.max(...last);
      return low > box.bottom - 30 ? [`${i + 1}쪽 넘침 ${Math.round(low - box.bottom + 30)}px`] : [];
    }),
  );
  const n = await pg.evaluate(() => document.querySelectorAll('section.page').length);
  if (n !== want) over.push(`쪽 수 ${n} (기대 ${want})`);
  if (over.length) {
    bad += 1;
    console.error(`✗ ${out}: ${over.join(', ')}`);
  }
  await pg.pdf({ path: path.join(repo, out), format: 'A4', printBackground: true, preferCSSPageSize: true });
  copyFileSync(path.join(repo, out), path.join(web, 'public', 'guides', `${pub}.pdf`));
  console.log(`${over.length ? '✗' : 'ok'}   ${out} (${n}쪽)`);
}
await browser.close();
process.exit(bad ? 1 : 0);
