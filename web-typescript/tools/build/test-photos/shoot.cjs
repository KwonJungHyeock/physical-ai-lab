// 로봇 6종을 같은 조건으로 렌더: node shoot.cjs '<이름:yaw:zup[:el:az],...>' <출력 폴더> (el · az 기본 18° · 35°)
const { chromium } = require('playwright');
const fs = require('fs');
const list = process.argv[2].split(',').map((x) => x.split(':'));
const out = process.argv[3];
fs.mkdirSync(out, { recursive: true });
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 1100, height: 700 } });
  p.on('pageerror', (e) => console.log('ERR', e.message));
  for (const [m, yaw, zup, el, az] of list) {
    await p.goto(`http://localhost:3199/index.html?m=${m}&yaw=${yaw || 0}&zup=${zup ?? 1}${el ? `&el=${el}` : ''}${az ? `&az=${az}` : ''}`);
    await p.waitForFunction(() => window.png, null, { timeout: 240000 });
    const { png, info } = await p.evaluate(() => ({ png: window.png, info: window.info }));
    fs.writeFileSync(`${out}/${m}${el ? `-el${el}-az${az}` : ''}.png`, Buffer.from(png.split(',')[1], 'base64'));
    console.log(m, JSON.stringify(info));
  }
  await b.close();
})();
