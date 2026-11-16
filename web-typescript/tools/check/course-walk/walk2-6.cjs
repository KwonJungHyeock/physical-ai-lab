// 교안용 캡처 · 가독성 점검 2장 ~ 6장: node walk2-6.cjs <키,키,...>  →  cap/<N>장/<절>/*.png + cap/log-<키>.json
// 키: 2-2 2-3 2-3f | 3-1 3-2 3-3 3-4 3-4f 3-5 | 4-1 4-2 4-2s 4-3 4-3f 4-3s 4-4 4-4f | 5-1 5-1s 5-2 5-2s 5-3 5-3s 5-4f 5-456 | 6
const L = require('./lib.cjs');
const fs = require('fs');
const only = (process.argv[2] || '').split(',');
const want = (k) => only.includes(k);
const U = (no, mode) => '/track/life?no=' + no + (mode ? '&mode=' + mode : '');
const D = (s) => s[0] + '장/' + s;
const S = __dirname + '/';
const K = ['베이스(J1)', '어깨(J2)', '팔꿈치(J3)', '손목 꺾기(J4)', '손목 돌리기(J5)', '손끝 돌리기(J6)'];
const POSE = '[data-pose][title$="움직여요"]';
const now = async (p) => {
  const np = await L.nowParts(p).catch(() => null);
  return np ? `${np.n}${np.text}` : '';
};
const say = async (p, tag) => {
  const np = await L.nowParts(p).catch(() => null);
  console.log(`  now@${tag} | ` + (np ? `[${np.steps || '-'}] ${np.state} ${np.n} ${np.text} ${np.meter}` : '(없음)'));
  return np;
};

(async () => {
  const b = await L.launch();
  const sec = async (k, fn, opts) => {
    if (!want(k)) return;
    console.log('==', k, new Date().toTimeString().slice(0, 8));
    const ctx = await L.context(b, opts);
    try {
      await fn(ctx);
    } catch (e) {
      console.log(' FAIL', k, e.message.slice(0, 300));
    }
    await ctx.close();
    L.saveLog(k);
  };

  // ===== 2장 =====
  await sec('2-2', async (ctx) => {
    const p = await L.open(ctx, U('2-2'));
    const d = D('2-2');
    await L.shot(p, d, '2-2_1_전', { settle: true });
    await L.click(p, '[data-step="zero"]');
    await L.shot(p, d, '2-2_1_후', { settle: true });
    await L.shot(p, d, '2-2_2_전', { settle: true, wait: 300 });
    await L.click(p, '[data-step="home"]');
    await L.shot(p, d, '2-2_2_후', { settle: true, wait: 2000 });
  });
  await sec('2-3', async (ctx) => {
    const p = await L.open(ctx, U('2-3'));
    const d = D('2-3');
    await L.shot(p, d, '2-3_1_전', { settle: true });
    await L.click(p, '[data-step="attach"]');
    await L.shot(p, d, '2-3_1_후', { settle: true });
    await L.shot(p, d, '2-3_2_전', { settle: true, wait: 300 });
    await L.fill(p, '[data-step="pen"] input', 0);
    await L.shot(p, d, '2-3_2_후', { settle: true });
    await L.shot(p, d, '2-3_3_전', { settle: true, wait: 300 });
    await L.click(p, '[data-step="run"]');
    await L.shot(p, d, '2-3_3_후', { settle: true, wait: 2000 });
  });
  // 2-3 실패: 펜을 달기 전 ▶(attachFirst) → 단 뒤 펜 칸 전 ▶(penFirst) → 펜 칸 3(tooHigh) → 펜 칸 −2(tooLow)
  await sec('2-3f', async (ctx) => {
    const p = await L.open(ctx, U('2-3'));
    const d = D('2-3');
    await L.click(p, '[data-step="run"]');
    await L.fail(p, d, '2-3', '펜먼저', { expect: /먼저 달기/ });
    await L.click(p, '[data-step="attach"]');
    await p.waitForTimeout(800);
    await L.click(p, '[data-step="run"]');
    await L.fail(p, d, '2-3', '펜칸먼저', { expect: /펜 칸을 고쳐요/ });
    await L.fill(p, '[data-step="pen"] input', 3);
    await L.click(p, '[data-step="run"]');
    await L.fail(p, d, '2-3', '높음', { expect: /떠 있어요/ });
    await L.fill(p, '[data-step="pen"] input', -2);
    await L.click(p, '[data-step="run"]');
    await L.fail(p, d, '2-3', '낮음', { expect: /너무 눌렀어요/ });
  });

  // ===== 3장 =====
  await sec('3-1', async (ctx) => {
    const p = await L.open(ctx, U('3-1'));
    const d = D('3-1');
    for (let j = 0; j < 6; j++) {
      await L.shot(p, d, `3-1_${j + 1}_전`, { settle: true });
      await L.press(p, `${K[j]} +5°`);
      await L.press(p, `${K[j]} +5°`);
      await L.shot(p, d, `3-1_${j + 1}_후`, { settle: true });
    }
  });
  await sec('3-2', async (ctx) => {
    const p = await L.open(ctx, U('3-2'));
    const d = D('3-2');
    await L.shot(p, d, '3-2_1_전', { settle: true });
    for (let i = 0; i < 9; i++) await L.press(p, `${K[0]} +5°`);
    await L.shot(p, d, '3-2_1_후', { settle: true });
    await L.shot(p, d, '3-2_2_전', { settle: true, wait: 300 });
    for (let i = 0; i < 6; i++) await L.press(p, `${K[1]} −5°`);
    await L.shot(p, d, '3-2_2_후', { settle: true, wait: 2500 });
    await L.shot(p, d, '3-2_3_전', { settle: true, wait: 300 });
    for (let i = 0; i < 14; i++) {
      if (/다 했어요/.test(await now(p))) break;
      await L.press(p, `${K[2]} +5°`);
      await p.waitForTimeout(300);
    }
    await L.shot(p, d, '3-2_3_후', { settle: true });
  });
  await sec('3-3', async (ctx) => {
    const p = await L.open(ctx, U('3-3'));
    const d = D('3-3');
    await L.shot(p, d, '3-3_1_전', { settle: true });
    for (let i = 0; i < 4; i++) await L.press(p, `${K[1]} +5°`);
    await L.shot(p, d, '3-3_1_후', { settle: true });
    await L.shot(p, d, '3-3_2_전', { settle: true, wait: 300 });
    await L.cl(p, '지금 자세 저장하기');
    await L.shot(p, d, '3-3_2_후', { settle: true });
    await L.shot(p, d, '3-3_3_전', { settle: true, wait: 300 });
    await L.click(p, '[title="관찰 자세 (공식 AI 키트)"]');
    await L.idle(p);
    await p.waitForTimeout(800);
    await say(p, '3-3 기본 자세 뒤');
    await L.click(p, POSE);
    await L.shot(p, d, '3-3_3_후', { settle: true, wait: 2000 });
  });
  // 3-4: ① 속도 30% ② [이 자세로] ③ 100% + [기본 자세] ④ [이 자세로] + 움직이는 동안 [정지]. 실패: ① 속도 전 [기본 자세] · ③ 30%에서 조그 · ④ 정지 없이 끝까지
  const stopWhileMoving = (p) =>
    p.evaluate(
      (sel) =>
        new Promise((res) => {
          const e = [...document.querySelectorAll(sel)].find((x) => x.getBoundingClientRect().width > 0 && !x.disabled);
          e && e.click();
          const t0 = performance.now();
          const tick = () => {
            const st = document.querySelector('[data-step="stop"]');
            if (document.querySelector('[data-busy]') && st)
              setTimeout(() => {
                st.click();
                res(Math.round(performance.now() - t0));
              }, 120);
            else if (performance.now() - t0 > 3000) res(-1);
            else setTimeout(tick, 15);
          };
          tick();
        }),
      POSE,
    );
  await sec('3-4', async (ctx) => {
    const p = await L.open(ctx, U('3-4'));
    const d = D('3-4');
    await L.shot(p, d, '3-4_1_전', { settle: true });
    await L.click(p, '[data-step="pose-home"]');
    await L.fail(p, d, '3-4', '기본자세먼저', { expect: /30% 이하로/ });
    await L.range(p, '[aria-label="속도 조절"]', 30);
    await L.shot(p, d, '3-4_1_후', { settle: true });
    await L.shot(p, d, '3-4_2_전', { settle: true, wait: 300 });
    await L.click(p, POSE);
    await L.shot(p, d, '3-4_2_후', { settle: true });
    await L.shot(p, d, '3-4_3_전', { settle: true, wait: 300 });
    await L.press(p, `${K[0]} +5°`);
    await L.fail(p, d, '3-4', '속도그대로', { expect: /100%로 올리고/ });
    await L.range(p, '[aria-label="속도 조절"]', 100);
    await p.waitForTimeout(600);
    await L.click(p, '[data-step="pose-home"]');
    await L.shot(p, d, '3-4_3_후', { settle: true });
    await L.shot(p, d, '3-4_4_전', { settle: true, wait: 300 });
    await L.click(p, POSE);
    await L.fail(p, d, '3-4', '늦음', { expect: /다 움직인 뒤였어요/ });
    await L.click(p, '[data-step="pose-home"]');
    await L.idle(p);
    await p.waitForTimeout(800);
    console.log('  3-4 ④ [이 자세로] → [정지]까지 ms', await stopWhileMoving(p));
    await L.shot(p, d, '3-4_4_후', { settle: true, wait: 2500 });
  });
  // 3-4 ②의 slowFirst: 30%로 ①을 넘긴 뒤 50%로 올려 [이 자세로]
  await sec('3-4f', async (ctx) => {
    const p = await L.open(ctx, U('3-4'));
    const d = D('3-4');
    await L.range(p, '[aria-label="속도 조절"]', 30);
    await p.waitForTimeout(800);
    await L.range(p, '[aria-label="속도 조절"]', 50);
    await p.waitForTimeout(600);
    await L.click(p, POSE);
    await L.fail(p, d, '3-4', '', { expect: /30% 이하로/ });
  });
  // 3-5 중간 수행평가: O · X 창 → X O X O X [확인] → [미션 시작] → 조그로 반투명 로봇 자세 → [확인]
  await sec('3-5', async (ctx) => {
    const p = await L.open(ctx, U('3-5'));
    const d = D('3-5');
    const DL = '[role="dialog"][aria-label="중간 수행평가"]';
    await L.shot(p, d, '3-5_OX', { settle: true });
    for (const [i, a] of ['X', 'O', 'X', 'O', 'X'].entries())
      await p.evaluate(
        ([s, i, a]) => {
          const li = document.querySelectorAll(`${s} li`)[i];
          [...li.querySelectorAll('button')].find((b) => b.textContent === a).click();
        },
        [DL, i, a],
      );
    await p.evaluate((s) => {
      const e = [...document.querySelectorAll(`${s} button`)].find((x) => x.textContent.trim() === '확인');
      e && e.click();
    }, DL);
    await p.waitForTimeout(1200);
    await L.cl(p, '미션 시작');
    await L.shot(p, d, '3-5_미션시작', { settle: true, wait: 3000 });
    for (const [j, s, n] of [
      [0, 1, 6],
      [1, -1, 3],
      [2, 1, 6],
      [3, 1, 4],
      [5, -1, 2],
    ])
      for (let i = 0; i < n; i++) await L.press(p, `${K[j]} ${s > 0 ? '+' : '−'}5°`);
    await p.waitForTimeout(800);
    await p.evaluate(() => {
      const e = [...document.querySelectorAll('[role="status"] button')].find((x) => x.textContent.trim() === '확인' && x.getBoundingClientRect().width > 0);
      e && e.click();
    });
    await L.shot(p, d, '3-5_미션통과', { settle: true, wait: 2500 });
  });

  // ===== 4장 =====
  await sec('4-1', async (ctx) => {
    const p = await L.open(ctx, U('4-1'));
    const d = D('4-1');
    let ring = '0';
    await L.shot(p, d, '4-1_1_전', { settle: true });
    for (let i = 0; i < 260; i++) {
      const np = await L.nowParts(p);
      const tx = np ? np.text : '';
      const r = (tx.match(/고리 (\d)/) || [])[1] || (np && np.state === 'ok' ? '4' : ring);
      if (r !== ring && ring !== '0') {
        await L.shot(p, d, `4-1_${ring}_후`, { settle: true });
        if (r !== '4') await L.shot(p, d, `4-1_${r}_전`, { settle: true, wait: 300 });
      }
      ring = r;
      if (r === '4') break;
      const m = tx.match(/\(([XYZ][+−])\)/);
      if (!m) {
        if (/좌표 버튼/.test(tx)) {
          await p.evaluate(() => {
            const e = document.querySelector('[title^="좌표: 손끝"]');
            e && e.click();
          });
          await p.waitForTimeout(800);
        } else await p.waitForTimeout(400);
        continue;
      }
      await p.locator(`aside [aria-label$="(${m[1]})"]`).first().focus({ timeout: 3000 });
      await p.keyboard.press('Enter');
      await p.waitForTimeout(150);
      {
        const t1 = Date.now();
        while (Date.now() - t1 < 8000 && (await L.busy(p))) await p.waitForTimeout(80);
      }
      await p.waitForTimeout(120);
    }
  });
  const pathOn = async (p, on) => {
    await L.click(p, '[aria-label="표시 옵션"]');
    await p.waitForTimeout(500);
    const r = await p.evaluate((on) => {
      const l = [...document.querySelectorAll('label')].find((x) => (x.querySelector('b') || x).textContent.trim() === '궤적선');
      const i = l && l.querySelector('input');
      if (i && i.checked !== on) i.click();
      return !!i;
    }, on);
    await p.waitForTimeout(600);
    return r;
  };
  const closeMenu = async (p) => {
    if (await p.evaluate(() => !!document.querySelector('[role="group"][aria-label="3D 표시"]'))) await L.click(p, '[aria-label="표시 옵션"]');
    await p.waitForTimeout(400);
  };
  await sec('4-2', async (ctx) => {
    const p = await L.open(ctx, U('4-2'));
    const d = D('4-2');
    await L.shot(p, d, '4-2_1_전', { settle: true });
    await L.click(p, '[data-step="run"]');
    await L.fail(p, d, '4-2', '궤적선먼저', { expect: /궤적선/ });
    await pathOn(p, true);
    await L.shot(p, d, '4-2_1_후', { wait: 1600 });
    await closeMenu(p);
    await L.shot(p, d, '4-2_2_전', { settle: true });
    await L.click(p, '[data-step="run"]');
    if (await L.waitQ(p)) {
      await L.shot(p, d, '4-2_2_퀴즈', { wait: 800 });
      await L.answer(p, 1);
      await L.goOn(p);
    }
    await p.waitForTimeout(1500);
    await L.click(p, '[data-step="stop"]');
    await L.fail(p, d, '4-2', '멈춤', { expect: /끝까지 가지 못했어요/ });
    await L.click(p, '[data-step="run"]');
    if (await L.waitQ(p, 20)) {
      await L.answer(p, 1);
      await L.goOn(p);
    }
    await L.shot(p, d, '4-2_2_후', { settle: true, wait: 2000 });
    await L.shot(p, d, '4-2_3_전', { settle: true, wait: 300 });
    await L.click(p, '[data-step="linear"] input');
    await L.shot(p, d, '4-2_3_후', { settle: true });
    await L.shot(p, d, '4-2_4_전', { settle: true, wait: 300 });
    await pathOn(p, false);
    await closeMenu(p);
    await L.click(p, '[data-step="run"]');
    await L.fail(p, d, '4-2', '궤적선꺼짐', { expect: /켜 둬요/ });
    await pathOn(p, true);
    await closeMenu(p);
    await L.click(p, '[data-step="run"]');
    await L.shot(p, d, '4-2_4_후', { settle: true, wait: 2000 });
  });
  const sceneShot = (sid, t) => async (ctx) => {
    const p = await L.open(ctx, U(sid, 'scene'));
    for (let i = 0; i < 40; i++) {
      if (await L.busy(p)) break;
      await p.waitForTimeout(500);
    }
    await p.waitForTimeout(t);
    await L.shot(p, D(sid), `${sid}_장면`, { wait: 300 });
  };
  await sec('4-2s', sceneShot('4-2', 15000), { rate: '1' });
  await sec('4-3', async (ctx) => {
    const p = await L.open(ctx, U('4-3'));
    const d = D('4-3');
    await L.shot(p, d, '4-3_1_전', { settle: true });
    await L.fillRows(p, [
      [160, -50],
      [240, -50],
      [200, 20],
    ]);
    await L.shot(p, d, '4-3_1_후', { settle: true });
    await L.shot(p, d, '4-3_2_전', { settle: true, wait: 300 });
    await L.click(p, '[data-step="run"]');
    await L.shot(p, d, '4-3_2_후', { settle: true, wait: 2000 });
    await L.shot(p, d, '4-3_3_전', { settle: true, wait: 300 });
    await L.fillRows(p, [
      [226, 16],
      [226, -40],
      [170, -40],
      [170, 16],
    ]);
    await L.shot(p, d, '4-3_3_후', { settle: true });
    await L.shot(p, d, '4-3_4_전', { settle: true, wait: 300 });
    await L.click(p, '[data-step="run"]');
    await L.shot(p, d, '4-3_4_후', { settle: true, wait: 2000 });
  });
  await sec('4-3f', async (ctx) => {
    const p = await L.open(ctx, U('4-3'));
    const d = D('4-3');
    await L.fillRows(p, [
      [160, -50],
      [240, -50],
    ]);
    await L.click(p, '[data-step="run"]');
    await L.fail(p, d, '4-3', '점부족', { expect: /3개 이상/ });
    await L.fillRows(p, [
      [160, -50],
      [240, ''],
      [200, 20],
    ]);
    await p.fill('[aria-label="2번 점 y"]', '');
    await L.rest(p);
    await L.click(p, '[data-step="run"]');
    await L.fail(p, d, '4-3', '빈칸', { expect: /모두 넣어요/ });
    await L.fillRows(p, [
      [160, -50],
      [400, -50],
      [200, 20],
    ]);
    await L.click(p, '[data-step="run"]');
    await L.fail(p, d, '4-3', '매트밖', { expect: /매트 밖/ });
    await L.fillRows(p, [
      [160, -50],
      [240, -50],
      [240, 20],
    ]);
    await L.click(p, '[data-step="run"]');
    await L.fail(p, d, '4-3', '모양다름', { expect: /꼭짓점과 달라요/ });
    await L.fillRows(p, [
      [160, -50],
      [240, -50],
      [200, 20],
    ]);
    await L.click(p, '[data-step="run"]');
    await p.waitForTimeout(1500);
    await L.click(p, '[data-step="stop"]');
    await L.fail(p, d, '4-3', '멈춤', { expect: /끝까지 가지 못했어요/ });
  });
  await sec('4-3s', sceneShot('4-3', 15000), { rate: '1' });
  await sec('4-4', async (ctx) => {
    const p = await L.open(ctx, U('4-4'));
    const d = D('4-4');
    await L.shot(p, d, '4-4_1_전', { settle: true });
    await p.fill('[aria-label="원 중심 x"]', '200');
    await p.fill('[aria-label="원 중심 y"]', '-10');
    await p.fill('[aria-label="원 반지름"]', '30');
    await L.rest(p);
    await L.shot(p, d, '4-4_1_후', { settle: true });
    await L.shot(p, d, '4-4_2_전', { settle: true, wait: 300 });
    await L.click(p, '[data-step="run"]');
    await L.shot(p, d, '4-4_2_후', { settle: true, wait: 2000 });
    await L.shot(p, d, '4-4_3_전', { settle: true, wait: 300 });
    await L.cl(p, '24개');
    await L.shot(p, d, '4-4_3_후', { settle: true });
    await L.shot(p, d, '4-4_4_전', { settle: true, wait: 300 });
    await L.click(p, '[data-step="run"]');
    await L.shot(p, d, '4-4_4_후', { settle: true, wait: 2000 });
  });
  await sec('4-4f', async (ctx) => {
    const p = await L.open(ctx, U('4-4'));
    const d = D('4-4');
    await L.click(p, '[data-step="run"]');
    await L.fail(p, d, '4-4', '빈칸', { expect: /모두 넣어요/ });
    await p.fill('[aria-label="원 중심 x"]', '290');
    await p.fill('[aria-label="원 중심 y"]', '-10');
    await p.fill('[aria-label="원 반지름"]', '30');
    await L.rest(p);
    await L.click(p, '[data-step="run"]');
    await L.fail(p, d, '4-4', '매트밖', { expect: /매트 밖으로/ });
    await p.fill('[aria-label="원 중심 x"]', '200');
    await L.rest(p);
    await L.cl(p, '24개');
    await L.click(p, '[data-step="run"]');
    await L.fail(p, d, '4-4', '개수먼저', { expect: /8로 두고/ });
    await L.cl(p, '8개');
    await L.click(p, '[data-step="run"]');
    await L.idle(p);
    await p.waitForTimeout(800);
    await say(p, '4-4 8개 통과 뒤');
    await L.cl(p, '24개');
    await p.waitForTimeout(500);
    await p.fill('[aria-label="원 반지름"]', '31');
    await L.rest(p);
    await L.click(p, '[data-step="run"]');
    await L.fail(p, d, '4-4', '원다름', { expect: /반지름이 달라요/ });
    await p.fill('[aria-label="원 반지름"]', '30');
    await L.rest(p);
    await L.cl(p, '8개');
    await L.click(p, '[data-step="run"]');
    await L.fail(p, d, '4-4', '개수바꾸기', { expect: /24로 바꿔요/ });
    await L.cl(p, '24개');
    await L.click(p, '[data-step="run"]');
    await p.waitForTimeout(1500);
    await L.click(p, '[data-step="stop"]');
    await L.fail(p, d, '4-4', '멈춤', { expect: /끝까지 가지 못했어요/ });
  });

  await sec('4-4g', async (ctx) => {
    const p = await L.open(ctx, U('4-4'));
    const d = D('4-4');
    await p.fill('[aria-label="원 중심 x"]', '200');
    await p.fill('[aria-label="원 중심 y"]', '-10');
    await p.fill('[aria-label="원 반지름"]', '30');
    await L.rest(p);
    await L.click(p, '[data-step="run"]');
    await L.idle(p);
    await p.waitForTimeout(800);
    await L.cl(p, '24개');
    await p.waitForTimeout(600);
    await say(p, '4-4 ④ 앞');
    await L.cl(p, '8개');
    await p.waitForTimeout(400);
    await L.click(p, '[data-step="run"]');
    await L.fail(p, d, '4-4', '개수바꾸기', { expect: /24로 바꿔요/ });
    await L.cl(p, '24개');
    await p.fill('[aria-label="원 반지름"]', '40');
    await L.rest(p);
    await L.click(p, '[data-step="run"]');
    await L.fail(p, d, '4-4', '원다름', { expect: /반지름이 달라요/ });
    await p.fill('[aria-label="원 반지름"]', '30');
    await L.rest(p);
    await L.click(p, '[data-step="run"]');
    await p.waitForTimeout(1500);
    await L.click(p, '[data-step="stop"]');
    await L.fail(p, d, '4-4', '멈춤', { expect: /끝까지 가지 못했어요/ });
  });
  // 실행이 끝날 때까지(지금 할 일 줄이 ok · no): 그 사이 잠깐 퀴즈가 뜨면 답하고 이어서 보기
  const finish = async (p, k) => {
    const t = Date.now();
    while (Date.now() - t < 20 * 60000) {
      if (await p.evaluate(() => !!document.querySelector('[aria-label="예측"],[aria-label="O X 퀴즈"]'))) {
        console.log('  (퀴즈가 또 뜸: 답함)');
        await L.answer(p, k);
        await L.goOn(p);
      }
      const np = await L.nowParts(p).catch(() => null);
      if (np && (np.state === 'ok' || np.state === 'no') && !(await L.busy(p))) return true;
      await p.waitForTimeout(1000);
    }
    console.log('  (끝나지 않음)');
    return false;
  };
  // ===== 5장 =====
  await sec('5-1', async (ctx) => {
    const p = await L.open(ctx, U('5-1'));
    const d = D('5-1');
    await L.shot(p, d, '5-1_1_전', { settle: true });
    await L.click(p, 'button[aria-label="시뮬레이션"]');
    if (await L.waitQ(p)) {
      await L.shot(p, d, '5-1_1_퀴즈', { wait: 800 });
      await L.answer(p, 1);
      await L.goOn(p);
    }
    await finish(p, 1);
    await L.shot(p, d, '5-1_1_후', { settle: true, wait: 4000 });
  });
  await sec('5-1s', sceneShot('5-1', 20000), { rate: '1' });
  await sec('5-2', async (ctx) => {
    const p = await L.open(ctx, U('5-2'));
    const d = D('5-2');
    await L.shot(p, d, '5-2_1_전', { settle: true });
    await p.fill('aside [aria-label="x"]', '140');
    await p.fill('aside [aria-label="y"]', '-60');
    await L.rest(p);
    await L.shot(p, d, '5-2_1_후', { settle: true });
    await L.shot(p, d, '5-2_2_전', { settle: true, wait: 300 });
    await L.fill(p, 'aside [aria-label="펜"]', 0);
    await L.shot(p, d, '5-2_2_후', { settle: true });
    await L.shot(p, d, '5-2_3_전', { settle: true, wait: 300 });
    await L.click(p, 'button[aria-label="시뮬레이션"]');
    if (await L.waitQ(p)) {
      await L.shot(p, d, '5-2_3_퀴즈', { wait: 800 });
      await L.answer(p, 1);
      await L.goOn(p);
    }
    await finish(p, 1);
    await L.shot(p, d, '5-2_3_후', { settle: true, wait: 4000 });
  });
  await sec('5-2s', sceneShot('5-2', 20000), { rate: '1' });
  await sec('5-3', async (ctx) => {
    const p = await L.open(ctx, U('5-3'));
    const d = D('5-3');
    await L.shot(p, d, '5-3_1_전', { settle: true });
    await L.click(p, '[aria-label="한 명 늘리기"]');
    await L.shot(p, d, '5-3_1_후', { settle: true });
    await L.shot(p, d, '5-3_2_전', { settle: true, wait: 300 });
    console.log(
      '  5-3 획 사이 펜 들기',
      await p.evaluate(() => {
        const l = [...document.querySelectorAll('aside label')].find((x) => x.textContent.includes('획 사이 펜 들기') && x.getBoundingClientRect().width > 0);
        const i = l && l.querySelector('input');
        if (i && !i.checked) i.click();
        return !!i;
      }),
    );
    await L.shot(p, d, '5-3_2_후', { settle: true });
    await L.shot(p, d, '5-3_3_전', { settle: true, wait: 300 });
    await L.click(p, 'button[aria-label="시뮬레이션"]');
    if (await L.waitQ(p)) {
      await L.shot(p, d, '5-3_3_퀴즈', { wait: 800 });
      await L.answer(p, 0);
      await L.goOn(p);
    }
    await finish(p, 0);
    await L.shot(p, d, '5-3_3_후', { settle: true, wait: 4000 });
  });
  await sec('5-3s', sceneShot('5-3', 20000), { rate: '1' });
  // 5-4 실패 (따로): 한 획만(twoStrokes) · 점선 밖 획(outStroke)
  const openBoard = async (p) => {
    if (!(await p.evaluate(() => !!document.querySelector('[data-board]')))) {
      await L.click(p, '[data-step="board"]');
      await p.waitForTimeout(900);
    }
  };
  await sec('5-4f', async (ctx) => {
    const p = await L.open(ctx, U('5-4'));
    const d = D('5-4');
    await openBoard(p);
    await L.drag(p, [
      [20, 55],
      [50, 55],
      [50, 25],
    ]);
    await L.click(p, '[data-step="run"]');
    await L.fail(p, d, '5-4', '한획', { expect: /2개 이상/ });
    await openBoard(p);
    await L.drag(p, [
      [65, 60],
      [65, 20],
      [95, 20],
    ]);
    await L.drag(p, [
      [80, 45],
      [118, 45],
    ]);
    await L.click(p, '[data-step="board"]');
    await p.waitForTimeout(900);
    await L.click(p, '[data-step="run"]');
    await L.fail(p, d, '5-4', '점선밖', { expect: /점선 밖으로/ });
  });
  // 5-4 → 5-5 → 5-6: 한 브라우저(같은 기록)에서. 5-6의 미션은 5-4를 통과해야 통과
  await sec('5-456', async (ctx) => {
    const p = await L.open(ctx, U('5-4'));
    const d = D('5-4');
    await L.shot(p, d, '5-4_1_전', { settle: true });
    await openBoard(p);
    await L.drag(p, [
      [20, 55],
      [50, 55],
      [50, 25],
    ]);
    await L.drag(p, [
      [65, 60],
      [65, 20],
      [95, 20],
    ]);
    await L.shot(p, d, '5-4_1_후', { wait: 1600 });
    await L.shot(p, d, '5-4_2_전', { wait: 300 });
    await L.click(p, '[data-step="board"]');
    await L.shot(p, d, '5-4_2_후', { settle: true, wait: 2000 });
    await L.shot(p, d, '5-4_3_전', { settle: true, wait: 300 });
    await L.click(p, '[data-step="run"]');
    await L.shot(p, d, '5-4_3_후', { settle: true, wait: 2500 });
    await p.close();
    // 5-5: 로봇 없이 가는 데까지
    const q = await L.open(ctx, U('5-5'));
    const d5 = D('5-5');
    await L.range(q, '[aria-label="실물 속도"]', 50);
    await q.waitForTimeout(500);
    await L.shot(q, d5, '5-5_1_전', { settle: true });
    await L.click(q, '[data-step="connect"]');
    await L.shot(q, d5, '5-5_연결창', { wait: 1800 });
    await q.evaluate(() => {
      const dd = [...document.querySelectorAll('[role="dialog"]')].find((x) => x.textContent.includes('ROBOT LINK') || /연결/.test(x.getAttribute('aria-label') || ''));
      const bb = dd && [...dd.querySelectorAll('button')].find((x) => x.textContent.trim() === '×' || /닫기/.test(x.getAttribute('aria-label') || ''));
      bb && bb.click();
    });
    await q.waitForTimeout(1200);
    await L.range(q, '[aria-label="실물 속도"]', 60);
    await L.shot(q, d5, '5-5_실패_1_속도', { settle: true });
    await L.range(q, '[aria-label="실물 속도"]', 30);
    await L.shot(q, d5, '5-5_잠긴까닭_시뮬레이션전', { settle: true });
    await L.click(q, 'button[aria-label="시뮬레이션"]');
    await L.idle(q, 240000);
    console.log(
      '  5-5 ▶ 뒤 둘째 버튼',
      await q.evaluate(() =>
        [...document.querySelectorAll('aside button')]
          .filter((b) => b.getBoundingClientRect().width > 0 && /코드 받기|로봇 실행/.test(b.textContent))
          .map((b) => b.textContent.replace(/\s+/g, ' ').trim() + (b.disabled ? ' (잠김)' : ' (열림)'))
          .join(' / '),
      ),
    );
    await L.shot(q, d5, '5-5_시뮬레이션뒤', { settle: true, wait: 2000 });
    await q.close();
    // 5-6
    const r = await L.open(ctx, U('5-6'));
    const d6 = D('5-6');
    const DL = '[role="dialog"][aria-label="마무리 수행평가"]';
    await L.shot(r, d6, '5-6_OX', { settle: true });
    for (const [i, a] of ['O', 'X', 'X', 'O', 'X'].entries())
      await r.evaluate(
        ([s, i, a]) => {
          const li = document.querySelectorAll(`${s} li`)[i];
          [...li.querySelectorAll('button')].find((b) => b.textContent === a).click();
        },
        [DL, i, a],
      );
    await r.evaluate((s) => {
      const e = [...document.querySelectorAll(`${s} button`)].find((x) => x.textContent.trim() === '확인');
      e && e.click();
    }, DL);
    await L.shot(r, d6, '5-6_미션시작', { wait: 1800 });
    await L.cl(r, '카드 확인');
    await L.shot(r, d6, '5-6_미션통과', { wait: 1800 });
  });
  // ===== 6장 (다 마친 기록 seed_v4_done.json) =====
  await sec(
    '6',
    async (ctx) => {
      const p = await L.open(ctx, U('5-6'));
      const next = () =>
        p.evaluate(() => {
          const dd = document.querySelector('[aria-label="6장 마무리"]');
          const e = [...(dd || document).querySelectorAll('button')].find((x) => x.textContent.trim().startsWith('다음으로') && x.getBoundingClientRect().width > 0 && !x.disabled);
          e && e.click();
          return !!e;
        });
      await next();
      await p.waitForTimeout(2500);
      await L.shot(p, '6장/6-1', '6-1', { wait: 1600 });
      await next();
      await L.shot(p, '6장/6-2', '6-2', { wait: 1600 });
      await p.click('[aria-label="별 4개"]');
      await p.selectOption('[aria-label="가장 재미있던 활동"]', { value: '5-4' }).catch(async () => p.selectOption('[aria-label="가장 재미있던 활동"]', { index: 3 }));
      await L.shot(p, '6장/6-2', '6-2_고른뒤', { wait: 1600 });
      await next();
      await p.waitForTimeout(600);
      await p.fill('[aria-label="이름"]', '홍길동');
      await p.fill('[aria-label="반"]', '3반');
      await L.shot(p, '6장/6-3', '6-3', { wait: 1600 });
    },
    { seed: JSON.parse(fs.readFileSync(S + 'seeds/done8.json', 'utf8')) },
  );
  console.log('errors', L.errs.length ? [...new Set(L.errs)] : 'none');
  await b.close();
})();
