// 입문 과정 단계별 걷기 공통 (교안용 캡처 · 가독성 점검): WALK_W × WALK_H (기본 1920 × 1080), 8차시, 씨앗 없음(따로 말하지 않으면),
// 저작권 안내는 본 것으로. 개발 서버(WALK_BASE, 기본 http://localhost:3123)에 대고 돌린다. 결과는 WALK_OUT(기본 ./walk-out).
// 찍기 전: 포커스 풀기 · 마우스를 장면 왼쪽 아래 빈 곳으로 · (기다릴 때) [data-busy] 없을 때까지 + 1.5 초.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const ROOT = (process.env.WALK_OUT || path.join(process.cwd(), 'walk-out')).replace(/\/?$/, '/');
const W = Number(process.env.WALK_W || 1920),
  H = Number(process.env.WALK_H || 1080);
// WALK_SHOTS=0: no pictures (measuring only). WALK_MEASURE=1: each shot also measures the screen (measure.cjs) into measure-<W>x<H>-<script>.json.
const SHOTS = process.env.WALK_SHOTS !== '0';
const MEASURING = process.env.WALK_MEASURE === '1';
const { MEASURE } = require('./measure.cjs');
const MEASURED = [];
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const LOG = [];
const BASE = process.env.WALK_BASE || 'http://localhost:3123';

// WALK_GPU=1: the PC's graphics card (a PC with one — the cloud container has none and draws with swiftshader, ~20 s a 1920 shot).
// WALK_HEADED=1 with it: a visible window (some drivers give headless Chrome no GPU).
async function launch() {
  const gpu = process.env.WALK_GPU === '1';
  const b = await chromium.launch(
    gpu ? { headless: process.env.WALK_HEADED !== '1', args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=default'] } : { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
  );
  return b;
}
async function context(b, opts = {}) {
  const ctx = await b.newContext({ viewport: { width: W, height: H } });
  await ctx.addInitScript(
    ([day, o]) => {
      localStorage.setItem('robot-console-sim-rate', o.rate || '4');
      localStorage.setItem('life-copyright-day', day);
      if (o.seed && !sessionStorage.getItem('seeded')) {
        for (const [k, v] of Object.entries(o.seed)) localStorage.setItem(k, v);
        sessionStorage.setItem('seeded', '1');
      }
      if (window === window.top) {
        window.__nowLog = [];
        setInterval(() => {
          try {
            const s = [...document.querySelectorAll('[role="status"]')].find((x) => typeof x.className === 'string' && x.className.includes('nowBar'));
            if (s) {
              const t = s.textContent;
              const l = window.__nowLog;
              if (!l.length || l[l.length - 1].raw !== t) l.push({ t: Math.round(performance.now()), state: s.getAttribute('data-state') || '', raw: t });
            }
          } catch (e) {}
        }, 120);
      }
      const hide = () => {
        try {
          const st = document.createElement('style');
          st.textContent = 'nextjs-portal{display:none!important}';
          (document.head || document.documentElement).appendChild(st);
        } catch (e) {}
      };
      if (document.documentElement) hide();
      document.addEventListener('DOMContentLoaded', hide);
    },
    [today(), opts],
  );
  return ctx;
}
const errs = [];
async function ready(p) {
  let t = Date.now();
  while (Date.now() - t < 240000) {
    if (await p.evaluate(() => !!document.querySelector('[data-flat]') || !!document.querySelector('[role="dialog"]')).catch(() => false)) break;
    await p.waitForTimeout(400);
  }
  t = Date.now();
  while (Date.now() - t < 240000) {
    const gone = await p
      .evaluate(() => {
        const s = document.querySelector('[aria-label="Physical AI 로봇 학습 프로그램"]');
        return !s || s.hasAttribute('data-done') || getComputedStyle(s).display === 'none';
      })
      .catch(() => false);
    if (gone) break;
    await p.waitForTimeout(300);
  }
  await p.waitForTimeout(5000);
}
async function open(ctx, url) {
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errs.push(url + ': ' + e.message.slice(0, 160)));
  await p.goto(BASE + url, { timeout: 240000 });
  await ready(p);
  await rest(p);
  return p;
}
// 지금 할 일 줄을 조각으로
const nowParts = (p) =>
  p.evaluate(() => {
    const s = [...document.querySelectorAll('[role="status"]')].find((x) => typeof x.className === 'string' && x.className.includes('nowBar'));
    if (!s) return null;
    const q = (sel) => {
      const e = s.querySelector(sel);
      return e ? e.textContent.replace(/\s+/g, ' ').trim() : '';
    };
    const sp = [...s.querySelectorAll(':scope > span')];
    const st = sp.find((x) => /단계$/.test(x.getAttribute('aria-label') || ''));
    const mt = sp.find((x) => x !== st && x.querySelector('output'));
    return { n: q(':scope > i'), text: q(':scope > p'), meter: mt ? mt.querySelector('output').textContent.replace(/\s+/g, ' ').trim() : '', steps: st ? st.getAttribute('aria-label') : '', state: s.getAttribute('data-state') || '' };
  });
const busy = (p) => p.evaluate(() => !!document.querySelector('[data-busy]'));
async function idle(p, ms = 180000) {
  const t = Date.now();
  await p.waitForTimeout(700);
  while (Date.now() - t < ms) {
    if (!(await busy(p))) break;
    await p.waitForTimeout(300);
  }
}
// 포커스 풀고 마우스를 장면 왼쪽 아래 빈 곳으로
async function rest(p) {
  await p.evaluate(() => {
    const a = document.activeElement;
    a && a.blur && a.blur();
  });
  const r = await p.evaluate(() => {
    const v = document.querySelector('[data-viewport]');
    if (!v) return null;
    const b = v.getBoundingClientRect();
    return { x: b.left + 30, y: b.bottom - 30 };
  });
  await p.mouse.move(r ? r.x : 30, r ? r.y : H - 30);
}
// 화면에 보이는 손(또는 그 자리 상자)이 있는지
const handShown = (p) =>
  p.evaluate(() =>
    [...document.querySelectorAll('body *')].some((e) => {
      const own = [...e.childNodes]
        .filter((n) => n.nodeType === 3)
        .map((n) => n.textContent)
        .join('');
      if (!/다가오는 손|hand\.png/.test(own)) return false;
      const r = e.getBoundingClientRect();
      if (r.width < 1 || r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) return false;
      return !e.checkVisibility || e.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
    }),
  );
const badgeShown = (p) => p.evaluate(() => [...document.querySelectorAll('i')].some((e) => typeof e.className === 'string' && e.className.includes('badge') && e.getBoundingClientRect().width > 0));
// 찍기. o.settle: [data-busy] 끝까지 기다림. o.wait: 그 뒤 기다림(기본 1600). o.noHand: 손이 보이면 찍지 않음
async function shot(p, dir, name, o = {}) {
  if (o.settle) await idle(p);
  await rest(p);
  await p.waitForTimeout(o.wait ?? 1600);
  await rest(p);
  const np = await nowParts(p).catch(() => null);
  const hand = await handShown(p).catch(() => false);
  const badge = await badgeShown(p).catch(() => false);
  const rec = { file: `${dir}/${name}.png`, now: np, hand, badge, busy: await busy(p).catch(() => false) };
  // Measured whether or not the picture is kept (a hand step is a screen the student sees too).
  if (MEASURING) {
    const m = await p.evaluate(MEASURE).catch((e) => ({ issues: [{ kind: 'error', name: 'measure', at: [], detail: String(e).slice(0, 120) }], roles: {} }));
    MEASURED.push({ screen: `${dir}/${name}`, ...m });
    fs.mkdirSync(ROOT, { recursive: true });
    fs.writeFileSync(ROOT + `measure-${W}x${H}-${path.basename(process.argv[1], '.cjs')}.json`, JSON.stringify(MEASURED, null, 1));
  }
  if (o.noHand && hand) {
    rec.skipped = '손(또는 손 자리 상자)이 화면에 보임';
    LOG.push(rec);
    console.log('  SKIP', name, '| 손이 보임 |', np ? `[${np.steps}] ${np.state} ${np.n} ${np.text}` : '');
    return false;
  }
  fs.mkdirSync(ROOT + dir, { recursive: true });
  if (SHOTS) await p.screenshot({ path: ROOT + dir + '/' + name + '.png', timeout: 120000 });
  LOG.push(rec);
  console.log('  shot', name, '|', np ? `[${np.steps || '-'}] ${np.state} ${np.n} ${np.text} ${np.meter}` : '(지금 할 일 줄 없음)', '| 배지', badge, '| 손', hand, rec.busy ? '| 움직이는 중' : '');
  return true;
}
const click = (p, sel) =>
  p
    .evaluate((s) => {
      const e = [...document.querySelectorAll(s)].find((x) => x.getBoundingClientRect().width > 0 && !x.disabled);
      if (e) {
        e.click();
        return true;
      }
      return false;
    }, sel)
    .then((ok) => {
      if (!ok) console.log('  MISS', sel);
      return ok;
    });
function saveLog(tag) {
  fs.mkdirSync(ROOT, { recursive: true });
  fs.writeFileSync(ROOT + `log-${tag}.json`, JSON.stringify({ shots: LOG, errs }, null, 1));
}
module.exports = { launch, context, open, shot, click, idle, rest, nowParts, busy, handShown, saveLog, LOG, errs, ROOT, MEASURED, W, H };

// ---- 2장 이후에 더한 도우미 ----
// 조그 키: 누르고 있는 동안 움직이므로 포커스 + Enter (element.click()은 움직이지 않음)
async function press(p, label) {
  const loc = p.locator(`[aria-label="${label}"]`).first();
  await loc.focus({ timeout: 8000 });
  await p.keyboard.press('Enter');
  const t = Date.now();
  await p.waitForTimeout(250);
  while (Date.now() - t < 15000 && (await busy(p))) await p.waitForTimeout(100);
  await p.waitForTimeout(200);
}
const range = async (p, sel, v) => {
  await p.waitForSelector(sel, { timeout: 20000 });
  return rangeSet(p, sel, v);
};
const rangeSet = (p, sel, v) =>
  p.evaluate(
    ([sel, v]) => {
      const e = document.querySelector(sel);
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      set.call(e, String(v));
      e.dispatchEvent(new Event('input', { bubbles: true }));
      e.dispatchEvent(new Event('change', { bubbles: true }));
    },
    [sel, v],
  );
const cl = (p, txt, scope = 'button') =>
  p
    .evaluate(
      ([t, sc]) => {
        const e = [...document.querySelectorAll(sc)].find((x) => x.getBoundingClientRect().width > 0 && !x.disabled && x.textContent.trim().startsWith(t));
        if (e) {
          e.click();
          return true;
        }
        return false;
      },
      [txt, scope],
    )
    .then((ok) => {
      if (!ok) console.log('  MISS text', txt);
      return ok;
    });
async function fill(p, sel, v) {
  await p.fill(sel, String(v));
  await p.waitForTimeout(300);
  await rest(p);
}
async function waitQ(p, n = 150) {
  for (let i = 0; i < n; i++) {
    await p.waitForTimeout(300);
    if (await p.evaluate(() => !!document.querySelector('[aria-label="예측"],[aria-label="O X 퀴즈"]'))) return true;
  }
  return false;
}
async function answer(p, k) {
  await p.evaluate((k) => {
    const d = document.querySelector('[aria-label="예측"],[aria-label="O X 퀴즈"]');
    const bs = d ? [...d.querySelectorAll('button')] : [];
    bs[k] && bs[k].click();
  }, k);
  await p.waitForTimeout(700);
}
const goOn = (p) => cl(p, '이어서 보기');
// 실패 화면: 이름의 단계 번호는 그때 지금 할 일 줄의 번호
async function fail(p, dir, sid, desc, o = {}) {
  if (o.settle !== false) await idle(p);
  await p.waitForTimeout(400);
  const np = await nowParts(p).catch(() => null);
  const n = np && /^\d+$/.test(np.n) ? np.n : o.n || 'x';
  const name = `${sid}_실패_${n}` + (desc ? '_' + desc : '');
  if (o.expect && !(np && o.expect.test(np.text))) console.log('  !! 기대한 실패 문장이 아님', name, '|', np ? np.text : '');
  return shot(p, dir, name, { wait: o.wait ?? 1600 });
}
// 5-4 획 그리기 판에 긋기 (카드 mm 좌표 120 × 80, y 위로)
async function drag(p, pts) {
  const svg = await p.locator('[data-board] svg').boundingBox();
  const S = svg.width / 120;
  const pt = (u, v) => [svg.x + u * S, svg.y + (80 - v) * S];
  const [x, y] = pt(...pts[0]);
  await p.mouse.move(x, y);
  await p.mouse.down();
  for (const q of pts.slice(1)) {
    const [a, c] = pt(...q);
    await p.mouse.move(a, c, { steps: 12 });
  }
  await p.mouse.up();
  await p.waitForTimeout(400);
}
async function fillRows(p, pts) {
  for (let i = 0; i < pts.length; i++) {
    const n = await p.locator('[aria-label$="번 점 x"]').count();
    if (n <= i) await cl(p, '+ 점 더하기');
    if (pts[i][0] !== '') await p.fill(`[aria-label="${i + 1}번 점 x"]`, String(pts[i][0]));
    if (pts[i][1] !== '') await p.fill(`[aria-label="${i + 1}번 점 y"]`, String(pts[i][1]));
  }
  await p.waitForTimeout(500);
  await rest(p);
}
module.exports = Object.assign(module.exports, { press, range, cl, fill, waitQ, answer, goOn, fail, drag, fillRows });
