// Diagrams for the guides, drawn as HTML and saved as PNG (things a screenshot cannot show:
// the parts of the robot, the ways to connect it, the Windows first-run warning, the classroom network,
// the USB stick, the 50-minute lesson).
//   node tools/build/guide-shots/diagrams.mjs [name ...]   → ../manuals/basic/img/d-*.png, ../manuals/course/img/d-*.png
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { launch } from './lib.mjs';

const web = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..', '..');
const BASIC = path.join(web, '..', 'manuals', 'basic', 'img');
const TEA = path.join(web, '..', 'manuals', 'course', 'img');
const only = new Set(process.argv.slice(2));

const font = (w, f) => `@font-face{font-family:P;font-weight:${w};src:url(data:font/woff2;base64,${readFileSync(path.join(web, 'src/app/fonts', f)).toString('base64')}) format('woff2')}`;
const FONTS = [font(400, 'Pretendard-Regular.subset.woff2'), font(500, 'Pretendard-Medium.subset.woff2'), font(600, 'Pretendard-SemiBold.subset.woff2'), font(700, 'Pretendard-Bold.subset.woff2')].join('\n');

/** A picture from public/ as a data URL (the diagram page is set from a string, with no server). */
const pub = (f) => `data:image/png;base64,${readFileSync(path.join(web, 'public', f)).toString('base64')}`;

const CSS = `${FONTS}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:P,sans-serif;color:#1d2433;background:#fff;word-break:keep-all;-webkit-font-smoothing:antialiased}
.wrap{padding:28px 32px;display:inline-block}
.row{display:flex;align-items:center;gap:18px}
.col{display:flex;flex-direction:column;gap:12px}
.card{border:1.5px solid #dfe3ec;border-radius:16px;background:#fff;padding:18px 20px}
.soft{background:#f5f7fb}
.num{width:34px;height:34px;border-radius:50%;background:#2f54d6;color:#fff;font-weight:700;font-size:17px;display:grid;place-items:center;flex:none}
.arrow{color:#9aa3b5;font-size:30px;font-weight:700;flex:none}
.t{font-size:19px;font-weight:700}
.s{font-size:15px;color:#5b6475;line-height:1.5}
.k{display:inline-block;border:1.5px solid #c9d1e3;border-bottom-width:3px;border-radius:8px;padding:3px 10px;font-weight:600;font-size:15px;background:#fff}
.blue{color:#2f54d6}.orange{color:#e8590c}.green{color:#17914a}.red{color:#d9363e}
.tag{display:inline-block;font-size:13px;font-weight:700;padding:3px 9px;border-radius:999px;background:#eef2ff;color:#2f54d6}
`;

const D = {
  // 받은 파일 → 압축 풀기 → 실행
  'basic/d-files': `
<div class="row">
  <div class="card col" style="width:300px;align-items:center;text-align:center">
    <svg width="74" height="84" viewBox="0 0 74 84"><rect x="6" y="4" width="62" height="76" rx="8" fill="#fde9b8" stroke="#d9a520" stroke-width="2"/><rect x="31" y="4" width="12" height="44" fill="#fff" stroke="#d9a520" stroke-width="2"/><path d="M31 14h12M31 24h12M31 34h12" stroke="#d9a520" stroke-width="2"/></svg>
    <div class="t">PhysicalAI-Simulator.zip</div><div class="s">받은 압축 파일</div>
  </div>
  <div class="col" style="align-items:center"><span class="num">1</span><span class="s">마우스 오른쪽 →<br><b>압축 풀기</b></span></div>
  <div class="card col soft" style="width:420px">
    <div class="row" style="gap:10px"><svg width="34" height="28" viewBox="0 0 34 28"><path d="M2 5a3 3 0 013-3h8l3 4h13a3 3 0 013 3v14a3 3 0 01-3 3H5a3 3 0 01-3-3z" fill="#ffd66b" stroke="#d9a520" stroke-width="1.6"/></svg><b style="font-size:18px">PhysicalAI-Simulator</b></div>
    <div class="row card" style="padding:10px 14px;border-color:#2f54d6;background:#eef2ff"><svg width="30" height="30" viewBox="0 0 30 30"><rect x="1" y="1" width="28" height="28" rx="7" fill="#e5484d"/><circle cx="11" cy="15" r="5" fill="none" stroke="#fff" stroke-width="3"/><circle cx="20" cy="15" r="5" fill="none" stroke="#fff" stroke-width="3"/></svg><div><div style="font-weight:700;font-size:16px">Physical AI 시뮬레이터.exe</div><div class="s" style="font-size:13px">프로그램 — 이것을 더블클릭</div></div></div>
    <div class="row card" style="padding:10px 14px"><svg width="30" height="30" viewBox="0 0 30 30"><rect x="5" y="2" width="20" height="26" rx="3" fill="#fff" stroke="#8a93a6" stroke-width="1.8"/><path d="M9 9h12M9 14h12M9 19h8" stroke="#8a93a6" stroke-width="1.8"/></svg><div><div style="font-weight:600;font-size:16px">읽어보세요.txt</div><div class="s" style="font-size:13px">짧은 안내</div></div></div>
  </div>
  <div class="col" style="align-items:center"><span class="num">2</span><span class="s"><b>더블클릭</b></span></div>
  <div class="card col" style="width:250px;align-items:center;text-align:center">
    <svg width="120" height="80" viewBox="0 0 120 80"><rect x="2" y="2" width="116" height="76" rx="8" fill="#f5f7fb" stroke="#c9d1e3" stroke-width="2"/><rect x="2" y="2" width="116" height="14" rx="7" fill="#dfe3ec"/><rect x="10" y="24" width="64" height="46" rx="5" fill="#e6ebf5"/><rect x="80" y="24" width="30" height="46" rx="5" fill="#2f54d6" opacity=".85"/><path d="M34 62v-18l8-8 8 6" stroke="#5b6475" stroke-width="3" fill="none" stroke-linecap="round"/></svg>
    <div class="t">시뮬레이터 창</div><div class="s">엣지(또는 크롬) 앱 창으로 열려요</div>
  </div>
</div>`,

  // Windows 첫 실행 안내 (모양을 단순하게 그린 설명 그림)
  'basic/d-smartscreen': `
<div class="row" style="align-items:stretch">
  <div class="card col" style="width:470px;background:#1f5fbf;color:#fff;border:none">
    <div style="font-size:22px;font-weight:700">Windows의 PC 보호</div>
    <div style="font-size:15px;opacity:.9;line-height:1.55">Microsoft Defender SmartScreen에서 인식할 수 없는 앱의 시작을 차단했습니다 …</div>
    <div style="font-size:15px;text-decoration:underline;font-weight:600;outline:3px solid #ffb84d;outline-offset:4px;border-radius:3px;width:max-content">추가 정보</div>
    <div style="flex:1"></div>
    <div class="row" style="justify-content:flex-end"><span style="border:1.5px solid #fff;padding:6px 26px;font-size:15px">실행 안 함</span></div>
  </div>
  <div class="col" style="align-items:center;justify-content:center"><span class="num">1</span><span class="s"><b>추가 정보</b><br>누르기</span><span class="arrow">→</span></div>
  <div class="card col" style="width:470px;background:#1f5fbf;color:#fff;border:none">
    <div style="font-size:22px;font-weight:700">Windows의 PC 보호</div>
    <div style="font-size:15px;opacity:.9;line-height:1.55">앱: Physical AI 시뮬레이터.exe<br>게시자: 알 수 없는 게시자</div>
    <div style="flex:1"></div>
    <div class="row" style="justify-content:flex-end;gap:10px"><span style="border:1.5px solid #fff;padding:6px 26px;font-size:15px;outline:3px solid #ffb84d;outline-offset:4px">실행</span><span style="border:1.5px solid #fff;padding:6px 26px;font-size:15px">실행 안 함</span></div>
  </div>
  <div class="col" style="align-items:center;justify-content:center"><span class="num">2</span><span class="s"><b>실행</b><br>누르기</span></div>
</div>
<p class="s" style="margin-top:14px">처음 한 번만 나와요. 회사 코드 서명 인증서가 없는 프로그램이라 Windows 가 묻는 것이고, 프로그램에는 문제가 없어요. (설명을 위해 단순하게 그린 그림)</p>`,

  // 교실 네트워크
  'course/d-network': `
<div class="row" style="gap:26px;align-items:center">
  <div class="col" style="gap:14px">
    ${['학생 PC 1', '학생 PC 2', '선생님 PC'].map((n) => `<div class="card row" style="gap:12px;padding:12px 16px"><svg width="44" height="34" viewBox="0 0 44 34"><rect x="2" y="2" width="40" height="24" rx="3" fill="#e6ebf5" stroke="#5b6475" stroke-width="2"/><path d="M14 32h16M22 26v6" stroke="#5b6475" stroke-width="2"/></svg><div><b>${n}</b><div class="s" style="font-size:13px">시뮬레이터 프로그램</div></div></div>`).join('')}
  </div>
  <div class="col" style="align-items:center;gap:6px"><svg width="120" height="40"><path d="M4 20h112" stroke="#2f54d6" stroke-width="3" stroke-dasharray="7 6"/></svg><span class="s blue" style="font-weight:700">같은 Wi-Fi</span></div>
  <div class="card col" style="align-items:center;text-align:center;width:220px;border-color:#2f54d6">
    <svg width="96" height="70" viewBox="0 0 96 70"><rect x="8" y="38" width="80" height="26" rx="6" fill="#eef2ff" stroke="#2f54d6" stroke-width="2.5"/><path d="M28 38V12M68 38V12" stroke="#2f54d6" stroke-width="2.5"/><path d="M36 20a17 17 0 0124 0M30 13a26 26 0 0136 0" stroke="#2f54d6" stroke-width="2.5" fill="none"/><circle cx="24" cy="51" r="3" fill="#17914a"/><circle cx="34" cy="51" r="3" fill="#17914a"/></svg>
    <div class="t">교실 공유기</div><div class="s">예: EDUINO-LAB<br>(2.4GHz 권장)</div>
  </div>
  <div class="col" style="align-items:center;gap:6px"><svg width="120" height="40"><path d="M4 20h112" stroke="#2f54d6" stroke-width="3" stroke-dasharray="7 6"/></svg><span class="s blue" style="font-weight:700">같은 Wi-Fi</span></div>
  <div class="col" style="gap:14px">
    ${['로봇 107', '로봇 108', '로봇 109'].map((n) => `<div class="card row" style="gap:12px;padding:12px 16px"><svg width="40" height="40" viewBox="0 0 40 40"><rect x="8" y="32" width="24" height="6" rx="2" fill="#5b6475"/><path d="M20 32V20l9-9 5 4" stroke="#5b6475" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/><circle cx="20" cy="20" r="3.5" fill="#2f54d6"/></svg><div><b>${n}</b><div class="s" style="font-size:13px">myCobot 280 RDK X5</div></div></div>`).join('')}
  </div>
</div>
<p class="s" style="margin-top:14px">로봇 이름의 숫자(로봇 ID)는 로봇 주소의 마지막 숫자예요. 로봇마다 ID 스티커를 붙여 두면 학생이 자기 로봇을 바로 찾아요.</p>`,

  // 구성품 — 공식 3D 모델로 그린 그림 (사진이 아님)
  'basic/d-parts': `
<div style="display:grid;grid-template-columns:repeat(3,330px);gap:16px">
${[
  ['robot/thumbs/mycobot280-rdkx5.png', '로봇팔', 'myCobot 280 RDK X5', '관절 6개. 받침(베이스) 안에 작은 컴퓨터 RDK X5 가 들어 있어요'],
  ['robot/parts/adaptive.png', '어댑티브 그리퍼', '도구 · 잡기', '두 손가락으로 블록을 잡아 옮겨요. 팔 끝에 끼우고 케이블을 꽂아요'],
  ['robot/parts/pump.png', '흡착 펌프', '도구 · 붙이기', '빨아들여 물건을 붙여요. 펌프 상자를 로봇 40핀에 이어요'],
  ['robot/parts/flange.png', '카메라 플랜지', '손 카메라', '팔 끝에 다는 카메라. 도구와 함께 끼워요'],
  ['robot/thumbs/aikit.png', 'AI 키트', '받침판 · 키트 카메라 · 분류함 · 블록', '위에서 보는 카메라와 블록 4색, 분류함 A~D'],
  ['robot/parts/gbase.png', '받침대 (G 베이스)', '선택', '로봇을 높여 놓을 때. 쓰면 프로그램에 높이를 알려 줘요'],
]
  .map(
    ([f, a, b, c]) => `<div class="card col" style="gap:8px;padding:14px 16px"><div style="background:#f5f7fb;border-radius:12px;height:170px;display:grid;place-items:center"><img src="${pub(f)}" style="max-height:160px;max-width:280px"></div><div class="t">${a}</div><div class="tag" style="width:max-content">${b}</div><div class="s">${c}</div></div>`,
  )
  .join('')}
</div>
<div class="row" style="gap:10px;margin-top:16px;flex-wrap:wrap">${['전원 어댑터', 'USB 메모리 (1 GB 이상)', '랜선 (유선으로 쓸 때)', 'PC 프로그램 PhysicalAI-Simulator.zip'].map((x) => `<span class="tag" style="background:#f5f7fb;color:#1d2433;font-size:15px;padding:6px 12px">${x}</span>`).join('')}</div>
<p class="s" style="margin-top:12px">그림은 Elephant Robotics 의 공식 3D 모델로 그렸어요(사진이 아님). 실제 색 · 모양은 조금 다를 수 있어요.</p>`,

  // 연결 방식 네 가지
  'basic/d-connect': `
<div style="display:grid;grid-template-columns:repeat(2,640px);gap:18px">
${(() => {
  const pc = (t = 'PC') => `<div class="col" style="align-items:center;gap:4px;width:92px"><svg width="54" height="42" viewBox="0 0 44 34"><rect x="2" y="2" width="40" height="24" rx="3" fill="#e6ebf5" stroke="#5b6475" stroke-width="2"/><path d="M14 32h16M22 26v6" stroke="#5b6475" stroke-width="2"/></svg><b style="font-size:14px">${t}</b></div>`;
  const robot = (t = '로봇') => `<div class="col" style="align-items:center;gap:4px;width:92px"><svg width="46" height="46" viewBox="0 0 40 40"><rect x="8" y="32" width="24" height="6" rx="2" fill="#5b6475"/><path d="M20 32V20l9-9 5 4" stroke="#5b6475" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/><circle cx="20" cy="20" r="3.5" fill="#2f54d6"/></svg><b style="font-size:14px">${t}</b></div>`;
  const router = `<div class="col" style="align-items:center;gap:4px;width:92px"><svg width="58" height="42" viewBox="0 0 96 70"><rect x="8" y="38" width="80" height="26" rx="6" fill="#eef2ff" stroke="#2f54d6" stroke-width="3"/><path d="M28 38V12M68 38V12" stroke="#2f54d6" stroke-width="3"/></svg><b style="font-size:14px">공유기</b></div>`;
  const air = (t) => `<div class="col" style="align-items:center;flex:1;gap:2px"><svg width="100%" height="14"><path d="M2 7H400" stroke="#2f54d6" stroke-width="3" stroke-dasharray="6 6"/></svg><span class="s blue" style="font-size:13px;font-weight:700">${t}</span></div>`;
  const wire = (t) => `<div class="col" style="align-items:center;flex:1;gap:2px"><svg width="100%" height="14"><path d="M2 7H400" stroke="#e8590c" stroke-width="5"/></svg><span class="s orange" style="font-size:13px;font-weight:700">${t}</span></div>`;
  return [
    ['1', '교실 Wi-Fi', '기본 · 로봇 여러 대', [pc(), air('Wi-Fi'), router, air('Wi-Fi'), robot()], '[교실 Wi-Fi] — Wi-Fi 이름 · 비밀번호', '같은 Wi-Fi → [연결하기]', '공유기가 줌'],
    ['2', '공유기 랜선', 'Wi-Fi 가 약하거나 막힌 교실', [pc(), air('Wi-Fi 또는 랜선'), router, wire('랜선'), robot()], '[유선만 (Wi-Fi 끔)] 또는 Wi-Fi 그대로', '같은 공유기 → [연결하기]', '공유기가 줌'],
    ['3', '유선 직결', '공유기 없음 · 1대 1', [pc(), wire('랜선 하나'), robot()], '[유선만 (Wi-Fi 끔)] 권장', '랜선 꽂고 약 30초 → [유선 직결]', '169.254.127.10 (늘 같음)'],
  ]
    .map(
      ([n, t, sub, parts, usb, p, ip], i) => `<div class="card col" style="gap:12px;${i === 0 ? 'border-color:#17914a;border-width:2px' : ''}">
  <div class="row" style="gap:10px"><span class="num"${i === 0 ? ' style="background:#17914a"' : ''}>${n}</span><span class="t">${t}</span><span class="s">${sub}</span></div>
  <div class="row" style="gap:6px;padding:6px 4px;background:#f5f7fb;border-radius:12px">${parts.join('')}</div>
  <div style="display:grid;grid-template-columns:118px 1fr;gap:4px 10px;font-size:15px"><b class="s" style="font-weight:700">USB 만들기</b><span>${usb}</span><b class="s" style="font-weight:700">PC 에서</b><span>${p}</span><b class="s" style="font-weight:700">로봇 주소</b><span>${ip}</span></div>
</div>`,
    )
    .join('') +
    `<div class="card col soft" style="gap:10px;justify-content:center"><div class="row" style="gap:10px"><span class="num" style="background:#9aa3b5">×</span><span class="t">로봇 핫스팟은 쓰지 않아요</span></div><div class="s" style="font-size:15px;line-height:1.6">핫스팟이 켜지면 로봇이 Wi-Fi 장치를 놓아주지 않아 교실 Wi-Fi 에 붙지 못해요. 그래서 설치할 때 꺼 두고, 다시 켜지 않아요. 공유기가 없으면 3 유선 직결로 연결해요.</div></div>`;
})()}
</div>`,

  // 학생 안전 약속 세 가지
  'basic/d-safety': `
<div class="row" style="gap:16px;align-items:stretch">
${[
  ['<svg width="70" height="70" viewBox="0 0 70 70"><circle cx="35" cy="35" r="31" fill="#fff4e6" stroke="#e8590c" stroke-width="3" stroke-dasharray="7 5"/><path d="M35 50V30l9-9 5 4" stroke="#5b6475" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/><rect x="24" y="50" width="22" height="6" rx="2" fill="#5b6475"/></svg>', '팔 둘레 50 cm 비우기', '움직이는 동안 손 · 얼굴 · 물건을 넣지 않아요'],
  ['<svg width="70" height="70" viewBox="0 0 70 70"><rect x="6" y="16" width="58" height="38" rx="9" fill="#fff" stroke="#c9d1e3" stroke-width="3"/><rect x="6" y="16" width="58" height="34" rx="9" fill="#fff" stroke="#1d2433" stroke-width="2.5"/><text x="35" y="40" text-anchor="middle" font-family="P" font-weight="700" font-size="17" fill="#1d2433">Esc</text></svg>', '이상하면 바로 멈추기', '키보드 Esc 또는 화면 위 빨간 [로봇 정지]'],
  ['<svg width="70" height="70" viewBox="0 0 70 70"><circle cx="35" cy="35" r="29" fill="#effaf3" stroke="#17914a" stroke-width="3"/><rect x="25" y="23" width="7" height="24" rx="2" fill="#17914a"/><rect x="38" y="23" width="7" height="24" rx="2" fill="#17914a"/></svg>', '도구는 멈춘 뒤에 바꾸기', '그리퍼 · 펌프는 로봇이 멈춰 있을 때만'],
]
  .map(([icon, a, b], i) => `<div class="card col" style="width:330px;align-items:center;text-align:center;gap:10px;padding:22px 18px">${icon}<div class="row" style="gap:8px"><span class="num">${i + 1}</span><span class="t">${a}</span></div><div class="s">${b}</div></div>`)
  .join('')}
</div>`,

  // USB 의 eduino 폴더와 wifi.txt 세 가지
  'basic/d-usb': `
<div class="row" style="align-items:flex-start;gap:20px">
  <div class="card col soft" style="width:430px">
    <div class="row" style="gap:10px"><svg width="34" height="28" viewBox="0 0 34 28"><rect x="3" y="6" width="26" height="16" rx="3" fill="#5b6475"/><rect x="27" y="10" width="5" height="8" fill="#9aa3b5"/></svg><b style="font-size:18px">USB 메모리 (맨 위)</b></div>
    <div style="padding-left:22px" class="col">
      <div class="row" style="gap:8px"><svg width="26" height="22" viewBox="0 0 34 28"><path d="M2 5a3 3 0 013-3h8l3 4h13a3 3 0 013 3v14a3 3 0 01-3 3H5a3 3 0 01-3-3z" fill="#ffd66b" stroke="#d9a520" stroke-width="1.6"/></svg><b>eduino</b></div>
      <div class="col" style="padding-left:26px;gap:7px;font-size:15px">
        <div class="row" style="gap:8px;background:#fff4e6;border-radius:8px;padding:4px 8px"><b class="orange">wifi.txt</b><span class="s">← 연결 방법</span></div>
        <div class="row" style="gap:8px;padding:0 8px"><b>설치하기</b><span class="s">← 새 로봇에서 처음 한 번</span></div>
        <div class="row" style="gap:8px;padding:0 8px"><b>result-로봇이름.txt</b><span class="s">← 로봇이 남긴 결과</span></div>
        <div style="padding:0 8px" class="s">install.py · robot_console.zip · 읽어보세요.txt …</div>
      </div>
    </div>
  </div>
  ${[
    ['교실 Wi-Fi', '와이파이=EDUINO-LAB\n비밀번호=12345678\n사용자=3조'],
    ['유선만 (Wi-Fi 끔)', '와이파이=끔\n비밀번호=\n사용자=3조'],
  ]
    .map(([t, txt]) => `<div class="card col" style="width:300px;border-color:#e8590c"><b class="orange">${t}</b><pre style="font:600 16px/1.8 ui-monospace,Menlo,monospace;background:#fbfbfd;border:1.5px solid #dfe3ec;border-radius:10px;padding:10px 14px;margin:0">${txt}</pre></div>`)
    .join('')}
</div>
<p class="s" style="margin-top:12px">보통은 프로그램의 [로봇 USB 만들기] 가 wifi.txt 를 대신 써 줘요. 손으로 고칠 때는 메모장으로 열어 = 뒤만 고치고 저장해요. 와이파이 이름은 대소문자 · 띄어쓰기까지 똑같이.</p>`,
  // 50분 수업 흐름
  'course/d-lesson-flow': `
<div class="row" style="gap:0;width:1300px;align-items:flex-start">
${[
  ['도입', 5, '#7048e8', '오늘의 질문 · 물어볼 것 · 그림'],
  ['개념', 10, '#2f54d6', '핵심 정의 · 원리 2~3줄 · 개념 확인 질문'],
  ['활동 1 · 2 · 3', 24, '#17914a', '8분씩, 한 가지만 바꿔 세 번 — 예상 → 해 보기 → 결과 → 왜'],
  ['정리', 6, '#e8590c', '세 활동 한눈에 · 정리 질문 · 현장에서는'],
  ['평가', 5, '#d9363e', '확인 문제 5 · 다음 차시'],
]
  .map(
    ([a, m, c, d]) => `<div class="col" style="flex:${m};gap:8px;padding:0 3px">
  <div style="background:${c};color:#fff;border-radius:12px;padding:14px 12px;text-align:center"><div style="font-size:19px;font-weight:700">${a}</div><div style="font-size:15px;opacity:.9">${m}분</div></div>
  <div class="s" style="text-align:center;font-size:14px;padding:0 4px">${d}</div></div>`,
  )
  .join('')}
</div>
<p class="s" style="margin-top:16px">한 차시 = 50분(대학교 75분). 수업 화면 위쪽 단계 막대(도입 · 개념 · 활동 1 · 2 · 3 · 정리 · 평가)가 이 순서 그대로예요.</p>`,

  // 탐구 활동 한 번의 흐름
  'course/d-activity-cycle': `
<div class="row" style="gap:12px">
${[
  ['① 예상', '하기 전에 보기 중 하나를 고른다', '#7048e8'],
  ['② 해 보기', '활동 패널의 버튼 · 막대 · [실행]', '#2f54d6'],
  ['③ 결과', '예상이 맞았는지 · 핵심 한 줄 · 잰 값', '#17914a'],
  ['④ 왜?', '한 문장 이유, 더 보기로 자세히', '#e8590c'],
]
  .map(
    ([a, b, c], i) => `${i ? '<span class="arrow">→</span>' : ''}<div class="card col" style="width:250px;border-left:6px solid ${c}"><div class="row" style="gap:10px"><span class="num" style="background:${c}">${i + 1}</span><span class="t">${a}</span></div><div class="s">${b}</div></div>`,
  )
  .join('')}
</div>
<p class="s" style="margin-top:12px">세 활동은 <b>같은 동작에서 한 가지만</b> 바꿉니다. 활동 패널 맨 위 <b>바꾸는 것</b> 상자가 그 한 가지를 보여 주고, 정리 단계의 결과 표에서 무엇이 달라졌는지 바로 보입니다.</p>`,

  // 교실 배치
  'course/d-classroom': `
<div class="row" style="align-items:flex-start;gap:26px">
  <div class="card col" style="width:760px;padding:22px">
    <div class="row" style="justify-content:space-between"><div class="card row" style="gap:10px;padding:10px 14px;border-color:#2f54d6"><b class="blue">스크린 · 프로젝터</b><span class="s">선생님 화면 (교육 탭 · 전체 화면)</span></div><div class="card" style="padding:10px 14px"><b>공유기</b></div></div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-top:8px">
      ${[1, 2, 3, 4, 5, 6].map((n) => `<div class="card col soft" style="padding:12px;gap:8px"><b>${n}조</b><div class="row" style="gap:8px"><span class="tag">PC</span><span class="tag">PC</span><span class="tag" style="background:#effaf3;color:#17914a">로봇 ${106 + n}</span></div><div class="s" style="font-size:13px">2~3명 · 로봇 1대</div></div>`).join('')}
    </div>
    <div class="row" style="gap:10px;margin-top:4px"><span class="tag" style="background:#fff4e6;color:#e8590c">선생님 책상</span><span class="s">선생님 PC · 예비 USB · 로봇 ID 목록</span></div>
  </div>
  <div class="card col" style="width:420px">
    <div class="t">배치 원칙</div>
    <div class="s">· 로봇이 없는 차시도 PC 시뮬레이터만으로 모두 됩니다.</div>
    <div class="s">· 로봇은 책상 가장자리에서 30 cm 이상 안쪽, 팔이 닿는 반경(약 28 cm) 안에 물건을 두지 않습니다.</div>
    <div class="s">· 조마다 로봇 ID 스티커를 붙이고, 칠판에 조 · 로봇 ID 표를 적어 둡니다.</div>
    <div class="s">· 공유기는 교실 전용 한 대 (학교망은 기기끼리 막혀 있는 경우가 많음).</div>
  </div>
</div>`,
};

const { browser, page } = await launch({ width: 1700, height: 900 });
for (const [name, body] of Object.entries(D)) {
  if (only.size && !only.has(name.split('/')[1])) continue;
  const [dir, file] = name.split('/');
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body><div class="wrap" id="d">${body}</div></body></html>`);
  await page.evaluate(() => document.fonts.ready);
  const out = path.join(dir === 'basic' ? BASIC : TEA, `${file}.png`);
  await page.locator('#d').screenshot({ path: out });
  console.log(`  ${path.basename(out)}`);
}
await browser.close();
