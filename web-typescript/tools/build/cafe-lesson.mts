/**
 * 로봇 카페 교안 (교사용) and 학습지 (학생용), A4 PDFs, from the 수업 설계 the app reads
 * (src/engine/simulator/cell/lessons.ts): the pages are fixed, so the page the app shows ('교안 6–7쪽')
 * is the page the teacher holds.
 *
 *   교안: 1 표지 · 2 수업 안내 (차시 구성 4 · 6 · 8, 한 차시 흐름) · 3 앱 화면과 교사 열쇠 ·
 *         4–19 퀘스트마다 두 쪽 (설명 쪽: 목표 · 개념 · 화면 · 발문 / 수행 쪽: 할 일 · 통과 조건 · 시간 ·
 *         막힐 때 · 확인 문제) · 20 확인 문제 정답 · 21 평가 기준 · 22 반 결과 정리
 *   학습지: 1 표지 (번호 · 이름 · 차시 구성) · 2–9 퀘스트마다 한 쪽 · 10 정리와 자기 점검
 *
 * Pictures: manuals/course/img/cafe/ (tools/build/guide-shots/cafe-lesson.mjs). After printing, every
 * page is checked: content that runs past its page → exit 1.
 *   npx tsx tools/build/cafe-lesson.mts
 */
import { execSync } from 'node:child_process';
import { copyFileSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import { GUIDE_PAGES, LESSON_QUEST, PLAN_SIZES, RUBRIC, lessonOfQuest, lessonsOf, type PlanSize } from '../../src/engine/simulator/cell/lessons';
import { missionById } from '../../src/engine/simulator/cell/missions';
import { QUESTS, QUEST_LEAD } from '../../src/engine/simulator/cell/quests';

const web = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const repo = path.dirname(web);
const img = (f: string) => `data:image/jpeg;base64,${readFileSync(path.join(repo, 'manuals', 'course', 'img', 'cafe', f)).toString('base64')}`;
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const IDS = ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8'];
const MARK = ['①', '②', '③', '④'];
const nameOf = (id: string) => missionById(id)!.title.replace(/^[^:]+:\s*/, '');

/** Run time of the reference answer at ×1, s (tests/simulator/cell-f-check.mts, measured 2026-11-09). */
const RUN_S: Record<string, string> = {
  F1: '약 1분 30초 (O · X 3번 멈춤 포함하면 약 2분)',
  F2: '약 1분 (▶▶ ×4면 약 15초)',
  F3: '손 조작 (학생에 따라 1~5분)',
  F4: '약 1분 25초 (×4면 약 20초)',
  F5: '약 1분 30초 (×4면 약 25초)',
  F6: '약 3분 (×4면 약 45초)',
  F7: '약 2분 45초 (×4면 약 40초)',
  F8: '약 14분 (처음부터 ×4로 열려서 약 3분 30초)',
};

/** Where students get stuck and what to say (from the class walk-through, review images 1 – 4). */
const STUCK: Record<string, string[]> = {
  F1: ['장면이 멈추고 O · X 창이 뜨면 하나를 골라야 이어져요. 모르면 [답하지 않고 계속].', '말풍선이 빨리 지나가면 ×1로 두고 다시 ▶.'],
  F2: ['[추출]은 한 번만 눌러요. [추출 끝]이 켜지면 저절로 통과해요.', '기다림이 길면 옆의 ▶▶ 빨리(×4).'],
  F3: ["X · Y(앞뒤 · 좌우)를 먼저 맞추고 높이(Z)는 마지막에. 고리 높이는 60 mm예요(아래 '높이' 숫자).", '가까워지면 STEP을 10 → 5 → 1 mm로 줄여요.'],
  F4: ['아무것도 안 바꾸고 ▶해도 통과해요. "내 메뉴"를 하나 바꿔 보게 하세요(샷 · 얼음 · 물).', "양의 합이 컵(355 ml)을 넘지 않게. 기다림은 [자세히]에서 '끝 신호까지'."],
  F5: ["'픽업 문으로 건네기' 체크 하나 → ▶. 문이 열린 동안 팔이 들어가면 안전 정지예요.", '손님 손이 감지되는 동안 로봇은 기다려요(멈춘 게 아니에요).'],
  F6: ['조작 없이 그대로 ▶. 시간이 걸리니 ×4로 보게 하세요.', '둘째 잔이 기다리는 까닭을 물어보세요(첫 잔이 픽업대에 있어서).'],
  F7: ["[+ 메뉴] → 생긴 '메뉴 2' 탭에서 이름 · 양을 바꿔요.", '▶가 패널 아래에 있으면 패널을 아래로 내려요.'],
  F8: ['처음부터 ×4로 열려요. 실패하면 ✗ 항목(몇 명 성공)을 보고 레시피 · 기다림을 고쳐 다시.', '오래 기다린 손님은 돌아가요. 한 잔 시간을 줄이는 게 열쇠예요.'],
};

const doHow = (id: string) => {
  const m = missionById(id)!;
  const steps = [`오른쪽 위 퀘스트 점에서 <b>${m.n}</b>을 눌러 열어요. 이름 옆 파란 표시가 <b>교안 ${LESSON_QUEST[id].pages[0]}–${LESSON_QUEST[id].pages[1]}쪽</b>이에요.`];
  steps.push(esc(QUESTS[id].todo));
  for (const l of QUEST_LEAD[id] ?? []) steps.push(`노란 말풍선: "${esc(l.say)}"`);
  if (m.mode === 'hand') steps.push('조건을 다 맞추면 저절로 통과해요.');
  else steps.push('통과하면 가운데에 통과 카드(개념 · 실제 현장)가 떠요. ✗가 있으면 그 항목을 고쳐 다시 ▶.');
  return steps;
};

const planCell = (id: string) => PLAN_SIZES.map((n) => `${n}차시 구성: ${lessonOfQuest(n, id)}차시`).join(' · ');

const CSS = `
@page{size:A4;margin:0}*{box-sizing:border-box}html,body{margin:0}
body{font-family:'Noto Sans CJK KR','Noto Sans KR','Malgun Gothic',sans-serif;color:#18201d;font-size:10.5pt;line-height:1.5;word-break:keep-all;overflow-wrap:anywhere}
.page{width:210mm;height:297mm;padding:14mm 15mm 16mm;position:relative;overflow:hidden;page-break-after:always;display:flex;flex-direction:column;gap:3.2mm}
.page:last-child{page-break-after:auto}
.top{display:flex;align-items:flex-end;gap:8px;border-bottom:2.2px solid #18201d;padding-bottom:2mm}
.top h1{font-size:17pt;margin:0;line-height:1.25}.top .tag{margin-left:auto;font-size:9pt;font-weight:700;color:#555;white-space:nowrap}
.pg{position:absolute;bottom:7mm;left:0;right:0;text-align:center;font-size:9pt;color:#666}
.pgtag{display:inline-block;background:#1d4ed8;color:#fff;font-weight:800;border-radius:4px;padding:1px 7px;font-size:9.5pt}
h2{font-size:12pt;margin:1mm 0 0;color:#18201d}h2 small{font-weight:500;color:#666;font-size:9pt;margin-left:6px}
.goal{border-left:4px solid #0f6b4c;padding:2mm 3mm;background:#eef6f2;font-weight:700}
.concept{border:2px solid #1d4ed8;border-radius:6px;padding:2.5mm 3.5mm}.concept b{color:#1d4ed8;font-size:11.5pt}.concept p{margin:1mm 0}.concept small{color:#444}
img.shot{width:100%;border:1px solid #999;border-radius:4px}
table{width:100%;border-collapse:collapse;font-size:9.6pt}th,td{border:1px solid #9aa;padding:1.4mm 2mm;vertical-align:top;text-align:left}th{background:#18201d;color:#fff}
ol,ul{margin:0;padding-left:5.5mm}li{margin:0.6mm 0}
.box{border:1.5px solid #18201d;border-radius:6px;padding:2.5mm 3.5mm}.box.o{border-color:#c2410c}.box.o h3{color:#c2410c}
.box h3{margin:0 0 1mm;font-size:10.5pt}
.two{display:grid;grid-template-columns:1fr 1fr;gap:4mm}
.q{margin:1.2mm 0}.q .opts{display:flex;flex-wrap:wrap;gap:1mm 5mm;margin-left:4mm;color:#333}.q .ans{color:#0f6b4c;font-weight:800}
.why{color:#555;font-size:9pt;margin-left:4mm}
.lines div{border-bottom:1px solid #999;height:8.5mm}
.who{display:flex;gap:10mm;font-size:11pt}.who span{border-bottom:1px solid #18201d;min-width:30mm;display:inline-block}
.cover{flex:1;display:flex;flex-direction:column;justify-content:center;gap:5mm}.cover h1{font-size:28pt;margin:0}.cover .sub{font-size:14pt;color:#0f6b4c;font-weight:800}
.flow{display:grid;grid-template-columns:repeat(5,1fr);gap:2mm}.flow div{border:1.5px solid #18201d;border-radius:5px;padding:2mm}.flow b{display:block}.flow .t{color:#1d4ed8}.flow .a{color:#0f6b4c}
.legend li b{display:inline-block;width:5.5mm;height:5.5mm;border-radius:50%;background:#F2542D;color:#fff;text-align:center;line-height:5.5mm;font-size:8.5pt;margin-right:1.5mm}
.chk li{list-style:none;margin-left:-5mm}.chk li::before{content:'☐ ';font-size:11pt}
.tight{font-size:8pt;line-height:1.35}.tight th,.tight td{padding:0.7mm 1.5mm}
.note{font-size:8.6pt;color:#666;border-top:1px dashed #9aa;padding-top:1.2mm;margin-top:auto}
`;

function page(body: string, n: number, total: string) {
  return `<section class="page">${body}<div class="pg">${total} · ${n}쪽</div></section>`;
}

function guideHtml(): string {
  const T = '로봇 카페 교안 (교사용)';
  const pages: string[] = [];
  // 1 표지
  pages.push(
    page(
      `<div class="cover">
<p class="sub">입문 ① 생활 로봇</p><h1>로봇 카페 교안</h1><p style="font-size:13pt;margin:0">교사용 · 4 · 6 · 8차시로 골라 쓰는 수업안</p>
<img class="shot" src="${img('F1.jpg')}" alt="로봇 카페 시뮬레이터">
<div class="box"><h3>이 교안과 앱은 같은 쪽 번호를 써요</h3>
<p style="margin:0">앱의 퀘스트 이름 옆 <span class="pgtag">교안 6–7쪽</span> 표시가 이 교안의 쪽이에요. 교사는 교안 쪽으로 설명 · 확인하고, 학생은 같은 쪽 번호의 퀘스트를 앱에서 수행해요. 확인 문제와 수행 기록은 앱의 <b>학습 기록</b>에 남고, 학생이 낸 파일을 교사가 모아 수행평가 표로 만들어요.</p></div>
<table><tr><th>대상</th><td>중 · 고등학생, 로봇 · 코딩 처음</td><th>준비</th><td>학생 1인 1대 노트북(크롬 · 엣지), 프로젝터, 학습지</td></tr>
<tr><th>주소</th><td colspan="3">/track/life (교사 열쇠의 <b>수업 링크</b>로 열면 같은 차시가 열려요)</td></tr></table>
<p class="note">모든 결과는 시뮬레이션 기준이에요. 실물 로봇은 쓰지 않아요.</p></div>`,
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
<h2>한 차시 흐름 (45분) <small>파란색 = 교안(교사) · 초록색 = 앱(학생)</small></h2>
<div class="flow"><div><b class="t">도입 5분</b>오늘 배울 것 읽기 · 발문 (설명 쪽)</div><div><b class="t">설명 10분</b>개념 · 화면 (설명 쪽 + 프로젝터)</div><div><b class="a">수행 20분</b>앱 퀘스트 (수행 쪽의 할 일)</div><div><b class="a">확인 5분</b>앱 확인 문제 3개 (자동 채점)</div><div><b class="t">정리 5분</b>개념 한 문장 · 학습 기록 제출</div></div>
<p class="note">시간은 예시예요(아직 수업에서 재지 않음). 첫 수업 뒤 조정하세요. 4차시 구성은 한 차시에 퀘스트 2개라 수행 시간이 빠듯해요: ▶ 옆 ×4를 쓰게 하세요.</p>`,
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
<li><b>3</b>▶ 시뮬레이션 · 빠르기 ×1/×4 · ⋯(자유 연습)</li><li><b>4</b>차시 판: 오늘 배울 것 · 확인 문제 · 학습 기록</li>
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
<img class="shot" src="${img(`${id}.jpg`)}" alt="퀘스트 ${m.n} 화면">
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
  const T = '로봇 카페 학습지 (학생용)';
  const pages: string[] = [];
  const who = '<div class="who">번호 <span></span> 이름 <span></span></div>';
  pages.push(
    page(
      `<div class="cover"><p class="sub">입문 ① 생활 로봇</p><h1>로봇 카페 학습지</h1>${who}
<table><tr><th>우리 반 차시 구성</th><td>☐ 4차시 ☐ 6차시 ☐ 8차시</td></tr></table>
<div class="box"><h3>이렇게 써요</h3><ol><li>앱의 퀘스트 이름 옆 <span class="pgtag">교안 n쪽</span>과 같은 퀘스트 쪽을 펴요.</li><li>앱에서 할 일을 하고 ☐에 ✓.</li><li>본 것을 적고, 확인 문제에 답해요(앱에서도 풀어요).</li><li>개념을 내 말로 한 문장 써요.</li></ol></div>
<h2>퀘스트 목록</h2><table><tr><th>퀘스트</th><th>학습지 쪽</th><th>교안 쪽</th></tr>${IDS.map((id, i) => `<tr><td>${i + 1}. ${esc(nameOf(id))}</td><td>${i + 2}</td><td>${LESSON_QUEST[id].pages[0]}–${LESSON_QUEST[id].pages[1]}</td></tr>`).join('')}</table>`,
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
<h2>앱에서 할 일</h2><ul class="chk"><li>퀘스트 점 <b>${m.n}</b>을 눌러 열기</li><li>${esc(QUESTS[id].todo)}</li><li>통과 카드에서 개념 읽기</li></ul>
<h2>관찰 기록 <small>무엇을 보았나요? 로봇은 무엇을 기다렸나요?</small></h2><div class="lines"><div></div><div></div><div></div></div>
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

const { chromium } = createRequire(path.join(execSync('npm root -g').toString().trim(), 'noop.js'))('playwright');
const browser = await chromium.launch();
const pg = await browser.newPage();
let bad = 0;
// pub: the copy the app links (⚙ 교사 열쇠), served at /guides/<pub>.pdf.
for (const [html, out, want, pub] of [
  [guideHtml(), 'manuals/course/로봇 카페 교안 (교사용).pdf', GUIDE_PAGES.results, 'cafe-teacher'],
  [sheetHtml(), 'manuals/course/로봇 카페 학습지 (학생용).pdf', 10, 'cafe-student'],
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
