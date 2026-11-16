// 교안용 캡처 · 가독성 점검 1장 (1-1 · 1-2 · 1-3): node walk1.cjs <1-1|1-1f|1-1s|1-2|1-3|1-3f|all>  →  cap/1장/<절>/*.png + cap/log-<키>.json
const L = require('./lib.cjs');
const only = (process.argv[2] || 'all').split(',');
const want = (k) => only.includes('all') || only.includes(k);
const U = (no, mode) => '/track/life?no=' + no + (mode ? '&mode=' + mode : '');
const D = (s) => '1장/' + s;
const waitStep = async (p, n, ms = 120000) => {
  const t = Date.now();
  while (Date.now() - t < ms) {
    const np = await L.nowParts(p).catch(() => null);
    if (np && np.n === String(n)) return true;
    await p.waitForTimeout(150);
  }
  console.log('  (단계', n, '을 못 봄)');
  return false;
};

(async () => {
  const b = await L.launch();
  const sec = async (k, fn, opts) => {
    if (!want(k)) return;
    console.log('==', k);
    const ctx = await L.context(b, opts);
    try {
      await fn(ctx);
    } catch (e) {
      console.log(' FAIL', k, e.message.slice(0, 200));
    }
    await ctx.close();
    L.saveLog(only.join('_'));
  };

  // 1-1: ① ▶ 시뮬레이션 ② 쓰는 동안 손 다가가기 ③ 멈춘 것을 보고 손 치우기. 손(손 자리 상자)이 보이는 화면은 찍지 않는다.
  await sec(
    '1-1',
    async (ctx) => {
      const p = await L.open(ctx, U('1-1', 'practice'));
      const d = D('1-1');
      await L.shot(p, d, '1-1_1_전', { settle: true, noHand: true });
      await L.click(p, '[data-step="run"]');
      await L.shot(p, d, '1-1_1_후', { wait: 1500, noHand: true });
      await L.shot(p, d, '1-1_2_전', { wait: 300, noHand: true });
      await L.click(p, '[data-step="hand-in"]');
      await L.shot(p, d, '1-1_2_후', { wait: 1600, noHand: true });
      await waitStep(p, 3);
      await L.shot(p, d, '1-1_3_전', { wait: 1600, noHand: true });
      await L.click(p, '[data-step="hand-out"]');
      await L.shot(p, d, '1-1_실패_3_이어서씀', { wait: 1600, noHand: true });
      await L.shot(p, d, '1-1_3_후', { settle: true, wait: 2500, noHand: true });
    },
    { rate: '1' },
  );
  // 1-1 실패: 손을 다가가지 않고 끝까지(noHand) · 손으로 멈춘 뒤 치우고 [정지](notWritten)
  await sec(
    '1-1f',
    async (ctx) => {
      const d = D('1-1');
      const p = await L.open(ctx, U('1-1', 'practice'));
      await L.click(p, '[data-step="run"]');
      await L.shot(p, d, '1-1_실패_1_손안다가감', { settle: true, wait: 2000, noHand: true });
      await p.close();
      const q = await L.open(ctx, U('1-1', 'practice'));
      await L.click(q, '[data-step="run"]');
      await q.waitForTimeout(4000);
      await L.click(q, '[data-step="hand-in"]');
      await waitStep(q, 3);
      await q.waitForTimeout(800);
      await L.click(q, '[data-step="hand-out"]');
      await q.waitForTimeout(1200);
      await L.click(q, '[data-step="stop"]');
      await L.shot(q, d, '1-1_실패_1_다못씀', { settle: true, wait: 2500, noHand: true });
      await q.close();
    },
    { rate: '1' },
  );
  // 1-1 장면 보기: 느리게(×1) 돌려 장면 한가운데에서
  await sec(
    '1-1s',
    async (ctx) => {
      const p = await L.open(ctx, U('1-1', 'scene'));
      for (let i = 0; i < 30; i++) {
        if ((await L.busy(p)) && !(await L.handShown(p))) break;
        await p.waitForTimeout(500);
      }
      await p.waitForTimeout(40000);
      await L.shot(p, D('1-1'), '1-1_장면', { wait: 300, noHand: true });
    },
    { rate: '1' },
  );
  // 1-2: 일곱 곳을 차례로. 실패 문장은 문구 파일에 없음 — 순서와 다른 곳을 누르면 그 이름이 잠깐 빨갛게(문장 없음): 참고로 한 장
  await sec('1-2', async (ctx) => {
    const p = await L.open(ctx, U('1-2'));
    const d = D('1-2');
    const names = ['베이스(J1)', '어깨(J2)', '팔꿈치(J3)', '손목 꺾기(J4)', '손목 돌리기(J5)', '손끝 돌리기(J6)', '손끝'];
    await L.click(p, 'button[aria-label="팔꿈치(J3)"]');
    await L.shot(p, d, '1-2_실패_1_다른곳', { wait: 350 });
    await p.waitForTimeout(1800);
    for (let i = 0; i < 7; i++) {
      await L.shot(p, d, `1-2_${i + 1}_전`, { settle: true });
      await L.click(p, `button[aria-label="${names[i]}"]`);
      await L.shot(p, d, `1-2_${i + 1}_후`, { wait: 1800 });
    }
  });
  // 1-3: ① 작업 범위 보기 ② ▶ 시뮬레이션 ③ 움직이는 동안 [정지]; 작업범위 한 장 더
  await sec(
    '1-3',
    async (ctx) => {
      const p = await L.open(ctx, U('1-3'));
      const d = D('1-3');
      await L.shot(p, d, '1-3_1_전', { settle: true });
      await L.click(p, '[data-step="range"]');
      await L.shot(p, d, '1-3_1_후', { wait: 1600 });
      await L.shot(p, d, '1-3_작업범위', { wait: 1500 });
      await L.shot(p, d, '1-3_2_전', { settle: true, wait: 300 });
      // (1920 × 1080 한 장을 찍는 데 20초쯤 걸려 그동안 움직임이 끝난다: ②후를 찍고, 끝난 뒤 ▶를 다시 눌러 ③전을 찍고 바로 [정지])
      await L.click(p, '[data-step="run"]');
      await L.shot(p, d, '1-3_2_후', { wait: 700 });
      await L.idle(p);
      await p.waitForTimeout(1500);
      console.log('  (②후 뒤 움직임이 끝남 · 줄:', JSON.stringify(await L.nowParts(p)), ')');
      await L.click(p, '[data-step="run"]');
      await L.shot(p, d, '1-3_3_전', { wait: 700 });
      console.log('  ③전을 찍은 뒤 아직 움직이는 중', await L.busy(p));
      await L.click(p, '[data-step="stop"]');
      await L.shot(p, d, '1-3_3_후', { settle: true, wait: 2500 });
    },
    { rate: '1' },
  );
  // 1-3 실패: 정지를 누르지 않고 끝까지
  await sec('1-3f', async (ctx) => {
    const p = await L.open(ctx, U('1-3'));
    const d = D('1-3');
    await L.click(p, '[data-step="range"]');
    await p.waitForTimeout(900);
    await L.click(p, '[data-step="run"]');
    await L.shot(p, d, '1-3_실패_3', { settle: true, wait: 2000 });
  });
  console.log('errors', L.errs.length ? [...new Set(L.errs)] : 'none');
  await b.close();
})();
