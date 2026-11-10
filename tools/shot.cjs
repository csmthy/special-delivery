// usage: node tools/shot.cjs out.png "query" [w h wait]
const { chromium } = require('playwright');
(async () => {
  const [out, query, w = 1280, h = 720, frames = 8] = process.argv.slice(2);
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: +w, height: +h } });
  const errs = [];
  p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.text()); });
  p.on('pageerror', (e) => errs.push('PAGEERR ' + e.message));
  await p.goto('http://localhost:5173/viewer.html?frames=' + frames + '&' + query);
  await p.waitForFunction((n) => (window.__frames || 0) >= n, +frames, { timeout: 120000 });
  await p.screenshot({ path: out, timeout: 180000 });
  console.log(await p.evaluate(() => window.__info || ''));
  if (errs.length) console.log(errs.slice(0, 10).join('\n'));
  await b.close();
})();
