// 입문 과정 소개 영상(파트 19) 원본 녹화: 컷 5개를 앱에서 그대로 조작하며 1920 × 1080 · 30 fps로 프레임 단위 녹화(가상 시간).
// 그래픽카드가 있는 PC에서: 서버(next start -p 3123)를 띄우고
//   WALK_GPU=1 WALK_HEADED=1 node tools/check/course-walk/video19.cjs <출력 폴더> [컷들: c1,c2,c3,c4,c5]
// ffmpeg-static이 설치돼 있으면(npm i --no-save ffmpeg-static) 컷마다 mp4(H.264, CRF 14)를, 없으면 JPEG 프레임 폴더를 만든다.
// VIDEO_STEP=15: 시험용 — 15프레임마다 한 장만(그래픽카드 없는 기계에서 흐름만 확인).
// 앱 코드는 바꾸지 않는다. 시뮬레이션 빠르기는 1배(편집에서 1~2배로).
process.env.WALK_W = '1920';
process.env.WALK_H = '1080';
const L = require('./lib.cjs');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const OUT = path.resolve(process.argv[2] || 'video19');
const only = new Set((process.argv[3] || 'c1,c2,c3,c4,c5').split(','));
const STEP = Number(process.env.VIDEO_STEP || 1);
const FPS = 30;
const DT = 1000 / FPS;
fs.mkdirSync(OUT, { recursive: true });
let ffmpegPath = null;
try {
  ffmpegPath = require('ffmpeg-static');
} catch {
  /* frames as JPEG files */
}

const U = (no, extra = '') => `/track/life?no=${no}${extra}`;
const K = ['베이스(J1)', '어깨(J2)', '팔꿈치(J3)', '손목 꺾기(J4)', '손목 돌리기(J5)', '손끝 돌리기(J6)'];

/** A recorder on one page: virtual time stands still between frames, each frame moves it on by 1/30 s. */
async function recorder(ctx, p, name) {
  const cdp = await ctx.newCDPSession(p);
  const advance = (ms) =>
    new Promise((res) => {
      cdp.once('Emulation.virtualTimeBudgetExpired', res);
      cdp.send('Emulation.setVirtualTimePolicy', { policy: 'advance', budget: ms });
    });
  await cdp.send('Emulation.setVirtualTimePolicy', { policy: 'pause' });
  let ff = null;
  const dir = path.join(OUT, name);
  if (ffmpegPath && STEP === 1) {
    ff = spawn(ffmpegPath, ['-y', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-', '-c:v', 'libx264', '-crf', '14', '-preset', 'slow', '-pix_fmt', 'yuv420p', path.join(OUT, `${name}.mp4`)], {
      stdio: ['pipe', 'ignore', 'inherit'],
    });
  } else fs.mkdirSync(dir, { recursive: true });
  let n = 0;
  const marks = [];
  const r = {
    /** Move the clock on by one frame (STEP frames when testing) and keep the picture. */
    async frame(before) {
      if (before) await before();
      await advance(DT * STEP);
      const buf = await p.screenshot({ type: 'jpeg', quality: 95, timeout: 240000 });
      if (ff) await new Promise((res) => (ff.stdin.write(buf) ? res() : ff.stdin.once('drain', res)));
      else fs.writeFileSync(path.join(dir, `f${String(n).padStart(5, '0')}.jpg`), buf);
      n++;
      if (n % 30 === 0) console.log(`  ${name} ${n}`);
    },
    async frames(k, before) {
      for (let i = 0; i < Math.ceil(k / STEP); i++) await r.frame(before);
    },
    /** Frames until `done()` is true (checked every frame), at most `max`. */
    async until(done, max, before) {
      for (let i = 0; i < Math.ceil(max / STEP); i++) {
        await r.frame(before);
        if (await done()) return true;
      }
      return false;
    },
    mark(label) {
      marks.push({ frame: n * STEP, label });
    },
    async done() {
      fs.writeFileSync(path.join(OUT, `${name}.json`), JSON.stringify({ fps: FPS, step: STEP, frames: n, marks }, null, 1));
      if (ff) {
        ff.stdin.end();
        await new Promise((res) => ff.on('close', res));
      }
      await cdp.send('Emulation.setVirtualTimePolicy', { policy: 'advance' }).catch(() => {});
      console.log(`  ${name}: ${n} frames`);
    },
  };
  return r;
}
const busy = (p) => p.evaluate(() => !!document.querySelector('[data-busy]'));
const center = async (p, sel) => {
  const b = await p.locator(sel).first().boundingBox();
  return b && [b.x + b.width / 2, b.y + b.height / 2];
};
/** A real mouse click (hover · press look), the clock moving a frame between down and up. */
const clickAt = async (r, p, sel) => {
  const c = await center(p, sel);
  if (!c) return console.log('  MISS', sel);
  await p.mouse.move(c[0], c[1], { steps: 4 });
  await r.frame();
  await p.mouse.down();
  await r.frame();
  await p.mouse.up();
};
const restMouse = (p) => p.mouse.move(5, 1075);

(async () => {
  const b = await L.launch();
  const ctx1 = (o = {}) => L.context(b, { rate: '1', ...o });

  // ① 5-3 장면 보기: 카드에 '사랑해'를 쓰는 동안, 화면 UI 없이 카드 가까이에서
  if (only.has('c1')) {
    const ctx = await ctx1();
    const p = await L.open(ctx, U('5-3', '&mode=scene&render=1'));
    await p.waitForTimeout(2500);
    await p.addStyleTag({ content: '*:not(canvas){visibility:hidden !important} canvas{visibility:visible !important}' });
    await restMouse(p);
    const r = await recorder(ctx, p, 'c1');
    // close-up on the card (robot mm): front-right, above, the pen and the card filling the picture
    // (the pen's path lines — white Line2 — hidden: only the ink on the card)
    const look = () =>
      p.evaluate(() => {
        const R = window.__render;
        if (!R) return;
        R.look([330, -250, 260], [205, -5, 20]);
        R.scene.traverse((o) => {
          if (o.type === 'Line2' && o.material?.color?.getHexString?.() === 'ffffff') o.visible = false;
        });
      });
    // the whole scene (the writing is chosen in the edit), at most 70 s
    r.mark('start');
    let seenBusy = false;
    await r.until(
      async () => {
        const bz = await busy(p);
        if (bz) seenBusy = true;
        return seenBusy && !bz;
      },
      70 * FPS,
      look,
    );
    r.mark('end');
    await r.frames(45, look);
    await r.done();
    await ctx.close();
  }

  // ② 3-1: 베이스(J1) +5° 세 번 (조작판이 보이게)
  if (only.has('c2')) {
    const ctx = await ctx1();
    const p = await L.open(ctx, U('3-1', '&mode=practice'));
    await L.idle(p);
    await p.waitForTimeout(2500);
    await restMouse(p);
    const r = await recorder(ctx, p, 'c2');
    await r.frames(20);
    for (let k = 0; k < 3; k++) {
      r.mark(`click ${k + 1}`);
      await clickAt(r, p, `[aria-label="${K[0]} +5°"]`);
      await r.frames(40);
    }
    await restMouse(p);
    await r.frames(30);
    await r.done();
    await ctx.close();
  }

  // ③ 4-1: 좌표 패드로 손끝을 고리 1 → 2로 (지금 할 일 줄이 말하는 버튼을 차례로)
  if (only.has('c3')) {
    const ctx = await ctx1();
    const p = await L.open(ctx, U('4-1', '&mode=practice'));
    await L.idle(p);
    await p.waitForTimeout(2000);
    for (let i = 0; i < 10; i++) {
      const np = await L.nowParts(p);
      if (np && /좌표 버튼/.test(np.text)) {
        await p.evaluate(() => document.querySelector('[title^="좌표: 손끝"]')?.click());
        await p.waitForTimeout(800);
      } else break;
    }
    await restMouse(p);
    const r = await recorder(ctx, p, 'c3');
    await r.frames(15);
    let ring = '';
    for (let k = 0; k < 120; k++) {
      const np = await L.nowParts(p);
      const tx = np ? np.text : '';
      const rg = (tx.match(/고리 (\d)/) || [])[1] || (np && np.state === 'ok' ? '4' : ring);
      if (rg !== ring) r.mark(`ring ${rg}`);
      ring = rg;
      if (rg === '3' || rg === '4') break;
      const m = tx.match(/\(([XYZ][+−])\)/);
      if (!m) {
        await r.frames(6);
        continue;
      }
      await clickAt(r, p, `aside [aria-label$="(${m[1]})"]`);
      await r.until(async () => !(await busy(p)), 8 * FPS);
      await r.frames(2);
    }
    await restMouse(p);
    await r.frames(30);
    await r.done();
    await ctx.close();
  }

  // ④ 4-2: 관절 이동(흰 곡선)을 한 번 끝낸 뒤 직선 이동(파란 직선)을 녹화 — 두 궤적선이 함께
  if (only.has('c4')) {
    const ctx = await ctx1();
    const p = await L.open(ctx, U('4-2', '&mode=practice'));
    await L.idle(p);
    await p.waitForTimeout(1500);
    await L.click(p, '[aria-label="표시 옵션"]');
    await p.waitForTimeout(500);
    await p.evaluate(() => {
      const l = [...document.querySelectorAll('label')].find((x) => (x.querySelector('b') || x).textContent.trim() === '궤적선');
      const i = l && l.querySelector('input');
      if (i && !i.checked) i.click();
    });
    await p.waitForTimeout(500);
    if (await p.evaluate(() => !!document.querySelector('[role="group"][aria-label="3D 표시"]'))) await L.click(p, '[aria-label="표시 옵션"]');
    await L.click(p, '[data-step="run"]');
    if (await L.waitQ(p, 60)) {
      await L.answer(p, 1);
      await L.goOn(p);
    }
    await L.idle(p);
    await p.waitForTimeout(1500);
    await L.click(p, '[data-step="linear"] input');
    await p.waitForTimeout(800);
    await restMouse(p);
    const r = await recorder(ctx, p, 'c4');
    await r.frames(15);
    r.mark('run');
    await clickAt(r, p, '[data-step="run"]');
    await restMouse(p);
    let seen = false;
    await r.until(async () => {
      if (await p.evaluate(() => !!document.querySelector('[aria-label="예측"],[aria-label="O X 퀴즈"]'))) {
        await p.evaluate(() => {
          const d = document.querySelector('[aria-label="예측"],[aria-label="O X 퀴즈"]');
          d && [...d.querySelectorAll('button')][1]?.click();
        });
        await p.evaluate(() => [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === '이어서 보기')?.click());
      }
      const bz = await busy(p);
      if (bz) seen = true;
      return seen && !bz;
    }, 20 * FPS);
    r.mark('end');
    await r.frames(60);
    await r.done();
    await ctx.close();
  }

  // ⑤ 5-4: 획 그리기 판에 '가'(ㄱ · ㅏ 세 획)를 그리고, 판을 닫고 ▶ — 로봇이 따라 쓰는 것까지
  if (only.has('c5')) {
    const ctx = await ctx1();
    const p = await L.open(ctx, U('5-4', '&mode=practice'));
    await L.idle(p);
    await p.waitForTimeout(1500);
    if (!(await p.evaluate(() => !!document.querySelector('[data-board]')))) {
      await L.click(p, '[data-step="board"]');
      await p.waitForTimeout(900);
    }
    await restMouse(p);
    const r = await recorder(ctx, p, 'c5');
    await r.frames(10);
    const svg = await p.locator('[data-board] svg').boundingBox();
    const S = svg.width / 120;
    const pt = (u, v) => [svg.x + u * S, svg.y + (80 - v) * S];
    const strokes = [
      [
        [22, 58],
        [52, 58],
        [52, 24],
      ],
      [
        [72, 64],
        [72, 18],
      ],
      [
        [72, 42],
        [90, 42],
      ],
    ];
    r.mark('draw');
    for (const s of strokes) {
      const [x, y] = pt(...s[0]);
      await p.mouse.move(x, y, { steps: 3 });
      await r.frame();
      await p.mouse.down();
      // 10 frames a segment: the line grows on the board as a hand would draw it
      for (let k = 1; k < s.length; k++) {
        const [ax, ay] = pt(...s[k - 1]);
        const [bx, by] = pt(...s[k]);
        for (let i = 1; i <= 10; i++) {
          await p.mouse.move(ax + ((bx - ax) * i) / 10, ay + ((by - ay) * i) / 10);
          await r.frame();
        }
      }
      await p.mouse.up();
      await r.frames(6);
    }
    await r.frames(20);
    r.mark('close board');
    await clickAt(r, p, '[data-step="board"]');
    await r.frames(20);
    r.mark('run');
    await clickAt(r, p, '[data-step="run"]');
    await restMouse(p);
    let seen = false;
    await r.until(async () => {
      const bz = await busy(p);
      if (bz) seen = true;
      return seen && !bz;
    }, 60 * FPS);
    r.mark('end');
    await r.frames(60);
    await r.done();
    await ctx.close();
  }
  console.log('errors', L.errs.length ? [...new Set(L.errs)].slice(0, 5) : 'none');
  await b.close();
})();
