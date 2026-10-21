// Screenshots of manuals/simulator/ (시뮬레이터 사용 매뉴얼). Needs `npm run dev`.
//   node tools/build/guide-shots/simulator.mjs [name ...]   → ../manuals/simulator/img/*.jpg|png
// The 3D view is software-drawn in a headless browser (about one frame a second), so every wait is long.
import path from 'node:path';

import { BASE, launch, save, settle } from './lib.mjs';

const web = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..', '..');
const OUT = path.join(web, '..', 'manuals', 'simulator', 'img');
const only = new Set(process.argv.slice(2));
const want = (n) => !only.size || only.has(n);
const out = (f) => path.join(OUT, f);

const { browser, page } = await launch();
page.setDefaultTimeout(90000);
// Cards that hide by themselves (a notice after 5–10 s, the result card after 15 s) stay while __hold is
// on: one screenshot of the slow 3D page takes longer than they show.
await page.addInitScript(() => {
  const st = window.setTimeout.bind(window);
  window.__hold = false;
  window.setTimeout = (fn, ms, ...a) => st(fn, window.__hold && ms >= 4000 && ms <= 20000 ? 3600000 : ms, ...a);
});
const hold = (on) => page.evaluate((v) => (window.__hold = v), on);

const btn = (name, exact = false) => page.getByRole('button', { name, exact });
const tab = (name) => page.getByRole('tab', { name });
const screenTab = (name) => page.locator('nav[aria-label="화면"]').getByRole('tab', { name });
// The menu bar down the left edge: every screen (조그 · 도구 · 자세 · 공정 · languages) and view window.
const rail = page.locator('nav[aria-label="메뉴"]');
const railBtn = (name) => rail.getByRole('button', { name: new RegExp(`^${name}`) });
/** The side panel's one screen (opened from the menu bar). */
const screen = () => page.locator('aside[aria-label="작업 패널"] [role=region]');
const openScreen = async (name) => {
  const b = railBtn(name);
  if ((await b.getAttribute('aria-pressed')) !== 'true') await b.click();
  await settle(page, 1200);
};
const visible = (loc) => loc.first().isVisible().catch(() => false);
const joint = ['베이스 (J1)', '어깨 (J2)', '팔꿈치 (J3)', '손목 1 (J4)', '손목 2 (J5)', '손목 3 (J6)'];
const setJoint = async (j, deg) => {
  const row = page.locator(`button[title^="${joint[j]}"]`);
  if (await visible(row)) await row.click();
  await page.waitForTimeout(700);
  await page.locator(`#j${j + 1}`).fill(String(deg));
  await page.waitForTimeout(900);
};

// 1 · 시작: 인트로 끝 → [연결하기] → 로봇 연결 → [시뮬레이션만] → 모델 고르기 → [시작]
await page.goto(`${BASE}/console`, { waitUntil: 'load', timeout: 240000 });
await btn('연결하기', true).waitFor({ timeout: 240000 });
await settle(page, 2500);
if (want('intro'))
  await save(page, out('01-intro.jpg'), {
    marks: [
      { at: btn('연결하기', true), n: 1, pos: 'l' },
      { at: btn('시뮬레이터로 시작'), n: 2, pos: 'r' },
    ],
  });
await btn('연결하기', true).click();
await page.waitForFunction(() => document.querySelector('[class*=splash][data-done]'), null, { timeout: 240000 }).catch(() => {});
await settle(page, 2500);
const dlg = page.locator('[role=dialog][aria-label="로봇 연결"] [class*=pickerBox]').first();
if (want('connect'))
  await save(page, out('03-connect.jpg'), {
    crop: dlg,
    pad: 24,
    marks: [
      { at: dlg.getByRole('tab', { name: '로봇 찾기' }), n: 1, pos: 'l' },
      { at: dlg.locator('input[aria-label="찾을 네트워크"]'), n: 2, pos: 'l' },
      { at: dlg.getByRole('button', { name: '로봇 찾기' }), n: 3, pos: 'r' },
      { at: dlg.getByRole('tab', { name: 'ID 로 연결' }), n: 4, pos: 'r' },
      { at: btn('시뮬레이션만 (로봇 없이)'), n: 5, pos: 'l' },
    ],
  });
if (want('connect-id')) {
  await dlg.getByRole('tab', { name: 'ID 로 연결' }).click();
  await settle(page, 1000);
  await save(page, out('36-connect-id.jpg'), { crop: dlg, pad: 24 });
  await dlg.getByRole('tab', { name: '로봇 찾기' }).click();
}
await btn('시뮬레이션만 (로봇 없이)').click();
await settle(page, 2500);
// The model picker shows only when other models can be chosen (MODEL_CHOICE); the app is the 280 RDK X5.
const picker = page.locator('[role=dialog][aria-label="로봇 모델 고르기"] [class*=pickerBox]').first();
if (await visible(picker)) {
  const start280 = picker.locator('button[aria-label$="시작"]').first();
  if (want('model'))
    await save(page, out('02-model.jpg'), {
      crop: picker,
      pad: 24,
      marks: [
        { at: picker.locator('[class*=lineBoards]').first(), n: 1, pos: 'l' },
        { at: start280, n: 2, pos: 'l' },
        { at: picker.locator('li').filter({ hasText: 'myAGV' }), n: 3, pos: 'tr' },
      ],
    });
  await start280.click();
}
await settle(page, 12000);

// 2 · 화면 둘러보기
const top = page.locator('header[data-panel=topbar]');
if (want('overview'))
  await save(page, out('04-overview.jpg'), {
    marks: [
      { at: page.locator('nav[aria-label="화면"]'), n: 1, pos: 'bl' },
      { at: page.locator('button[aria-label*="과제:"]'), n: 2, pos: 'bl' },
      { at: top.locator('[class*="__goal"]').first(), n: 3, pos: 'br' },
      { at: page.locator('[class*=connPill]'), n: 4, pos: 'bl' },
      { at: page.locator('button[title="설정"]'), n: 5, pos: 'bl' },
      // Without a robot the top bar has no stop: the work panel's ■ 정지 (and Esc) stops the simulator.
      { at: page.locator('aside[aria-label="작업 패널"] [class*=poseStop]'), n: 6, pos: 'tl' },
      { at: page.locator('[aria-label="관절 각도와 손끝 위치"]'), n: 7, pos: 'tr' },
      { at: page.locator('[data-panel=log]'), n: 8, pos: 'r' },
      { at: { x: 640, y: 360, w: 0, h: 0 }, n: 9, box: false },
      { at: page.locator('[data-panel=viewtools]'), n: 10, pos: 'l' },
      { at: rail, n: 11, pos: 'r' },
      { at: page.locator('aside[aria-label="작업 패널"]'), n: 12, pos: 'bl' },
    ],
  });
if (want('topbar')) await save(page, out('05-topbar.png'), { crop: top, pad: 6 });
if (want('tabs')) await save(page, out('00-tabs.png'), { crop: rail, pad: 8 });
if (want('panel-head'))
  await save(page, out('07-panel-head.png'), {
    crop: page.locator('[class*=sideHeader]'),
    marks: [
      { at: page.locator('[class*=sideModel]'), n: 1, pos: 'tl' },
      { at: page.locator('[class*=lightsBtn]'), n: 2, pos: 'tl' },
      { at: page.locator('button[aria-label="작업 패널 접기"]'), n: 3, pos: 'tr' },
    ],
  });
if (want('settings')) {
  await page.locator('button[title="설정"]').click();
  await settle(page, 1200);
  await save(page, out('06-settings.png'), { crop: [page.locator('button[title="설정"]'), page.locator('[class*=menuPop]')], pad: 12 });
  await page.keyboard.press('Escape');
  await settle(page, 600);
}

// 3 · 3D 화면 도구 · 모니터
const tools = page.locator('[data-panel=viewtools]');
if (want('viewtools'))
  await save(page, out('10-viewtools.png'), {
    crop: tools,
    pad: 34,
    marks: [
      { at: page.locator('[class*=viewCube]'), n: 1, pos: 'l' },
      ...['처음 시점', '전체 맞춤', '확대', '축소', /^끌면/, /투영/, '표시 옵션', '화면 저장'].map((name, i) => ({ at: tools.getByRole('button', { name }), n: i + 2, pos: 'l', box: false })),
    ],
  });
if (want('display')) {
  await page.locator('button[aria-label="표시 옵션"]').click();
  await settle(page, 1200);
  await save(page, out('11-display.png'), { crop: [tools, page.locator('[aria-label="3D 표시"]')], pad: 10 });
  await page.keyboard.press('Escape');
  await settle(page, 600);
}
const hud = page.locator('[data-panel=hud]');
if (want('monitor') || want('self')) {
  await railBtn('모니터').click();
  await settle(page, 1500);
}
if (want('monitor'))
  await save(page, out('12-monitor.png'), {
    crop: [hud.locator('[aria-label="모니터에 보일 것"]'), hud.locator('section[aria-label="최근 5초 관절 각도"]')],
    pad: 30,
    marks: [
      { at: hud.locator('[aria-label="모니터에 보일 것"]'), n: 1, pos: 'tl' },
      { at: hud.locator('button[aria-label="모니터 닫기"]'), n: 2, pos: 'tr' },
      { at: hud.locator('section[aria-label="관절 각도"]'), n: 3, pos: 'tl' },
      { at: hud.locator('section[aria-label="손끝"]'), n: 4, pos: 'tl' },
      { at: hud.locator('section[aria-label="최근 5초 관절 각도"]'), n: 5, pos: 'tl' },
    ],
  });

// 4 · 수동 제어 (조그: 좌표가 먼저, 관절은 두 번째)
await openScreen('조그');
const jog = screen();
await jog.locator('[class*=frameSeg] button').nth(1).click();
await settle(page, 800);
if (want('jog'))
  await save(page, out('14-jog.png'), {
    crop: jog,
    pad: 44,
    marks: [
      { at: jog.locator('[class*=frameSeg]'), n: 1, pos: 'l' },
      { at: jog.locator('[class*=stepSeg]'), n: 2, pos: 'l' },
      { at: jog.locator('[class*=speedRow]'), n: 3, pos: 'l' },
      { at: jog.locator('[class*=jpSel]'), n: 4, pos: 'l' },
      { at: jog.locator('[class*=jpSel] [class*=jpValue]'), n: 5, pos: 'tr' },
      { at: jog.locator('button[class*=jpRow]').first(), n: 6, pos: 'l' },
    ],
  });
if (want('self')) {
  // A pose the arm cannot take: the wrist would fold into the forearm. The arm stays, the card says which joint.
  await hold(true);
  for (const [j, deg] of [[2, 150], [2, -150], [1, 100], [3, -145], [3, 145], [4, 155]]) await setJoint(j, deg);
  await settle(page, 1500);
  if (!(await page.locator('[data-panel=log] [data-kind=warn]').isVisible().catch(() => false))) console.log('  (주의: 자기 충돌 알림이 안 나왔어요)');
  await save(page, out('15-self.jpg'), {
    marks: [
      { at: page.locator('[data-panel=log] [class*=notice]').first(), n: 1, pos: 'r' },
      { at: hud.locator('section[aria-label="관절 각도"] h5'), n: 2, pos: 'r' },
      { at: jog.locator('[class*=jpSel]'), n: 3, pos: 'tl' },
    ],
  });
  await hold(false);
  await page.locator('button[aria-label="알림 닫기"]').click().catch(() => {});
  await page.locator('[class*=poseDock]').getByRole('button', { name: /기본 자세/ }).click();
  await settle(page, 8000);
  await page.locator('button[title^="베이스 (J1)"]').click();
  await settle(page, 800);
}
if (want('monitor') || want('self')) {
  await hud.locator('button[aria-label="모니터 닫기"]').click();
  await settle(page, 1000);
}
if (want('jog-xyz')) {
  await jog.locator('[class*=frameSeg] button').nth(0).click();
  await settle(page, 1500);
  await save(page, out('16-jog-xyz.png'), { crop: jog, pad: 10 });
  await jog.locator('[class*=frameSeg] button').nth(1).click();
  await settle(page, 800);
}
await openScreen('도구');
await page.locator('button[title^="흡착 펌프"]').first().click();
await settle(page, 4000);
if (want('tools')) {
  // The always-there buttons at the foot of the panel would cover the accessories: out of the way for this one.
  const off = await page.addStyleTag({ content: '[class*=poseDock]{display:none!important}' });
  const parts = screen();
  await parts.locator('section[aria-label="도구 · 액세서리"]').evaluate((e) => e.scrollIntoView({ block: 'end' }));
  await settle(page, 800);
  await save(page, out('17-tools.png'), { crop: [parts.locator('[class*=toolRow]'), parts.locator('section[aria-label="도구 · 액세서리"]')], pad: 10 });
  await off.evaluate((e) => e.remove());
}
await openScreen('자세');
await hold(true);
await btn(/지금 자세 저장하기/).click();
await settle(page, 1500);
if (want('poses')) await save(page, out('18-poses.png'), { crop: [screen(), page.locator('[class*=poseDock]')], pad: 10 });
if (want('notices')) {
  await page.locator('[class*=noticeLog]').first().click();
  await settle(page, 1500);
  await save(page, out('08-notices.png'), { crop: [page.locator('[data-panel=log]'), page.locator('[class*=noticeHistory]')], pad: 12 });
  await page.locator('[class*=noticeLog]').first().click();
}
await hold(false);
await page.locator('button[aria-label="알림 닫기"]').click().catch(() => {});
await openScreen('조그');
if (want('status')) {
  await page.locator('[class*=lightsBtn]').click();
  await settle(page, 1200);
  await save(page, out('19-status.png'), { crop: [page.locator('[class*=lightsBtn]'), page.locator('[class*=lightsPop]')], pad: 10 });
  await page.keyboard.press('Escape');
  await settle(page, 600);
}
if (want('collapsed')) {
  await page.locator('button[aria-label="작업 패널 접기"]').click();
  await settle(page, 5000);
  await save(page, out('09-collapsed.jpg'));
  await page.locator('button[aria-label="작업 패널 열기"]').click();
  await settle(page, 3000);
}

// 5 · 왼쪽 메뉴 · 실습 환경 · 물건
if (want('leftrail'))
  await save(page, out('32-leftrail.png'), {
    crop: rail,
    pad: 30,
    marks: ['환경', '물건', '카메라', '모니터'].map((name, i) => ({ at: railBtn(name), n: i + 1, pos: 'r', box: false })),
  });
const desk = page.locator('section[aria-label="실습 환경"]');
if (want('envpanel') || want('objects')) {
  await railBtn('환경').click();
  await settle(page, 2500);
  if (want('envpanel')) await save(page, out('33-envpanel.jpg'), { crop: desk, pad: 10 });
  await desk.getByRole('tab', { name: /^물건/ }).click();
  await settle(page, 1000);
  for (const k of ['블록', '컵', '택배 상자']) {
    await desk.locator('[class*=obj]').filter({ hasText: new RegExp(`^${k}$`) }).first().click();
    await settle(page, 2500);
  }
  await settle(page, 5000);
  if (want('objects'))
    await save(page, out('34-objects.jpg'), {
      crop: desk,
      pad: 30,
      marks: [
        { at: desk.locator('[class*=lib]').first(), n: 1, pos: 'tl' },
        { at: desk.locator('[class*=list]').first(), n: 2, pos: 'tl' },
      ],
    });
  // The panel closed: the picked object in 3D, with its × above it.
  await desk.getByRole('button', { name: '닫기' }).click();
  await settle(page, 5000);
  const x = page.locator('[class*=objDelete]').first();
  const b = await x.boundingBox().catch(() => null);
  if (want('objects') && b) await save(page, out('34b-object-3d.jpg'), { crop: { x: b.x - 230, y: b.y - 70, w: 460 + b.width, h: 300 }, pad: 0, marks: [{ at: x, n: 1, pos: 'r' }] });
  else if (want('objects')) console.log('  (3D 의 × 가 안 보여요)');
  await railBtn('물건').click();
  await settle(page, 2000);
  await desk.getByRole('tab', { name: /^물건/ }).click();
  await desk.getByRole('button', { name: '모두 치우기' }).click().catch(() => {});
  await settle(page, 1500);
  await desk.getByRole('button', { name: '닫기' }).click();
  await settle(page, 2500);
}

// 6 · 블록 코딩
await railBtn('블록').click();
await settle(page, 3000);
const runBtn = () => page.locator('[data-panel=run]').getByRole('button', { name: '시뮬레이션', exact: true });
if (want('blocks'))
  await save(page, out('20-blocks.jpg'), {
    marks: [
      { at: page.locator('[data-panel=mission]'), n: 1, pos: 'tl' },
      { at: page.locator('[aria-label="블록 꾸러미"]'), n: 2, pos: 'tl' },
      { at: page.getByText('▶ 시뮬레이션을 누르면').first(), n: 3, pos: 'r' },
      { at: page.locator('[data-panel=run]'), n: 4, pos: 'tl' },
    ],
  });
const chip = () => page.locator('[class*=numChip]').first();
if (want('block-tools')) {
  const blk = chip().locator('xpath=ancestor::div[contains(@class,"block")][1]');
  const bb = await blk.boundingBox();
  await page.mouse.click(bb.x + bb.width - 8, bb.y + bb.height / 2);
  await settle(page, 1000);
  await save(page, out('21-block-tools.png'), { crop: blk, pad: 40 });
  await page.mouse.click(bb.x + bb.width - 8, bb.y + bb.height / 2);
  await settle(page, 600);
}
if (want('block-chip')) {
  await chip().click();
  await settle(page, 1200);
  await save(page, out('22-block-chip.png'), { crop: [page.locator('[class*=numPop]').first(), chip()], pad: 16 });
  await page.keyboard.press('Escape');
  await settle(page, 600);
}
if (want('run')) {
  await hold(true);
  await runBtn().click();
  await page.waitForTimeout(5000);
  await save(page, out('23-running.jpg'));
  await page.locator('[class*=resultCard]').waitFor({ timeout: 300000 }).catch(() => console.log('  (결과 카드가 안 나왔어요)'));
  await settle(page, 5000);
  // The replay bar takes its final place only once the page is drawn again: one throwaway picture first.
  await page.screenshot({ type: 'jpeg', quality: 10, timeout: 120000 });
  await save(page, out('24-result.jpg'), {
    marks: [
      { at: page.locator('[class*=resultCard]'), n: 1, pos: 'tl' },
      { at: page.locator('[aria-label="실행 다시 보기"]'), n: 2, pos: 'tl' },
      { at: top.locator('[class*="__goal"]').first(), n: 3, pos: 'bl' },
      { at: page.locator('[data-panel=run]'), n: 4, pos: 'tl' },
    ],
  });
  await save(page, out('25-runbar-done.png'), { crop: page.locator('[data-panel=run]'), pad: 10 });
  await page.getByRole('button', { name: '로봇용 코드 받기' }).click();
  await settle(page, 2000);
  await save(page, out('26-export.jpg'), { crop: page.locator('dialog[open]'), pad: 16 });
  await page.locator('dialog[open]').getByRole('button', { name: '닫기' }).click();
  await hold(false);
  await page.locator('[class*=resultClose]').click().catch(() => {});
  await settle(page, 1000);
}

// 7 · Python · ROS 2
if (want('python')) {
  await railBtn('Python').click();
  await settle(page, 3000);
  await save(page, out('27-python.jpg'), {
    marks: [
      { at: page.locator('[data-panel=mission]'), n: 1, pos: 'tl' },
      { at: page.locator('[class*=codeBox]').first(), n: 2, pos: 'tl' },
      { at: page.locator('[class*=termPanel]').first(), n: 3, pos: 'tl' },
      { at: page.locator('[data-panel=run]'), n: 4, pos: 'tl' },
    ],
  });
  await runBtn().click();
  await page.locator('[data-panel=run] [aria-label="통과"]').waitFor({ timeout: 300000 }).catch(() => console.log('  (Python 통과 표시가 안 나왔어요)'));
  await settle(page, 4000);
  await save(page, out('28-python-run.jpg'));
  await page.locator('[class*=resultClose]').click().catch(() => {});
}
if (want('ros')) {
  await railBtn('ROS 2').click();
  await settle(page, 3000);
  await runBtn().click();
  await page.locator('[data-panel=run] [aria-label="통과"]').waitFor({ timeout: 300000 }).catch(() => console.log('  (ROS 2 통과 표시가 안 나왔어요)'));
  await page.locator('[class*=resultClose]').click().catch(() => {});
  await tab('노드 · 토픽').click();
  await settle(page, 2000);
  await save(page, out('29-ros.jpg'), {
    marks: [
      { at: tab('노드 · 토픽'), n: 1, pos: 'tl' },
      { at: tab('토픽 메시지'), n: 2, pos: 'tr' },
    ],
  });
}
if (await visible(page.locator('button[aria-label="다시 보기 닫기"]'))) await page.locator('button[aria-label="다시 보기 닫기"]').click();
await railBtn('블록').click();
await settle(page, 1500);

// 8 · 라이브러리
if (want('tasks') || want('checks') || want('library')) {
  await page.locator('button[aria-label*="과제:"]').click();
  await settle(page, 5000);
  const nav = page.locator('nav[aria-label="LIBRARY"]');
  if (want('tasks'))
    await save(page, out('30-tasks.jpg'), {
      marks: [
        { at: nav.locator('button[aria-current=page]'), n: 1, pos: 'tr' },
        { at: page.locator('button[data-lib][aria-current=true]').first(), n: 2, pos: 'tl' },
        { at: page.locator('button[data-lib] [class*=cardTags]').nth(1), n: 3, pos: 'bl' },
      ],
    });
  // The checks show in the library only while the teacher's 검수 시연 is on (⚙ → 검수 시연 (교사용)).
  const checkMode = async (on) => {
    await page.locator('button[title="설정"]').click();
    await settle(page, 1000);
    await page.getByRole('menuitem', { name: on ? /검수 시연 \(교사용\)/ : /검수 시연 끝내기/ }).click();
    await settle(page, 4000);
  };
  if (want('checks')) {
    await checkMode(true);
    await screenTab('라이브러리').click();
    await settle(page, 4000);
    await nav.getByRole('button', { name: /검수 시연/ }).click();
    await settle(page, 4000);
    await save(page, out('31-checks.jpg'), {
      marks: [
        { at: page.locator('[class*=pageActions]'), n: 1, pos: 'bl' },
        { at: page.locator('button[data-lib^="check-"]').first(), n: 2, pos: 'tl' },
      ],
    });
    await checkMode(false);
    await screenTab('라이브러리').click();
    await settle(page, 4000);
  }
  await nav.getByRole('button', { name: /전체/ }).click();
  await settle(page, 5000);
  if (want('library'))
    await save(page, out('37-library.jpg'), {
      marks: [
        { at: nav, n: 1, pos: 'tr' },
        { at: page.locator('button[data-lib]').first(), n: 2, pos: 'tl' },
        { at: page.locator('[class*=groupMore]').first(), n: 3, pos: 'bl' },
      ],
    });
  await screenTab('시뮬레이터').click();
  await settle(page, 4000);
}

// 9 · AI 키트 환경 · 카메라
if (want('kit') || want('camera')) {
  await railBtn('환경').click();
  await settle(page, 1500);
  await desk.locator('button[aria-pressed]').filter({ hasText: 'AI 키트' }).first().click();
  await settle(page, 2000);
  await page.keyboard.press('Escape');
  await settle(page, 15000);
  if (want('kit'))
    await save(page, out('35-kit.jpg'), {
      marks: [
        { at: page.locator('button[title="카메라 화면과 영상 처리 크게 보기"]'), n: 1, pos: 'tr' },
        { at: tools.getByRole('button', { name: '카메라', exact: true }), n: 2, pos: 'l' },
      ],
    });
  if (want('camera')) {
    await tools.getByRole('button', { name: '카메라', exact: true }).click();
    await settle(page, 12000);
    await save(page, out('13-camera.jpg'), { crop: page.locator('[data-panel=camera]'), pad: 8 });
    await page.locator('button[aria-label="카메라 닫기"]').click();
    await settle(page, 1500);
  }
}

// 10 · 자료실
if (want('archive')) {
  await screenTab('자료실').click();
  await settle(page, 3000);
  await page.locator('[data-entry="d:docs"]').dblclick();
  await settle(page, 1500);
  await page.locator('[data-entry^="f:"]').first().click();
  await settle(page, 2500);
  await save(page, out('38-archive.jpg'), {
    marks: [
      { at: page.locator('[role=tree]'), n: 1, pos: 'tr' },
      { at: page.locator('nav[aria-label="경로"]'), n: 2, pos: 'bl' },
      { at: page.locator('[aria-label="보기 방식"]'), n: 3, pos: 'bl' },
      { at: page.locator('[data-entry^="f:"][aria-selected=true]'), n: 4, pos: 'tl' },
      { at: page.locator('aside[aria-label="미리 보기"] [class*=previewArt]'), n: 5, pos: 'tl' },
      { at: page.locator('aside[aria-label="미리 보기"] [class*=previewActions]'), n: 6, pos: 'bl' },
    ],
  });
}

// 11 · 교육: 첫 화면 = 로봇 시티 (로드맵 · 로봇 실습 7 · 전체 차시 · 3D 지도 · 기술 키워드)
if (want('learn')) {
  await screenTab('교육').click();
  await settle(page, 6000);
  await page.waitForFunction(() => !document.body.innerText.includes('로봇 시티를 불러오는 중'), null, { timeout: 240000 }).catch(() => {});
  await settle(page, 8000);
  await save(page, out('39-learn-map.jpg'), {
    marks: [
      { at: page.locator('ol[aria-label="로드맵: 배우는 순서"]'), n: 1, pos: 'bl' },
      { at: btn('로봇 실습 7', true), n: 2, pos: 'b' },
      { at: btn('전체 차시', true), n: 3, pos: 'b' },
      { at: page.locator('section[aria-label="로봇 시티 3D 지도"]'), n: 4, pos: 'tl' },
      { at: page.locator('nav[aria-label="기술 키워드로 찾기"]'), n: 5, pos: 'tr' },
    ],
  });
}

await browser.close();
