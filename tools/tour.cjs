// usage: node tools/tour.cjs outprefix "name:px,py,pz,tx,ty,tz[:fov]" ...  (viewer on :5173, no pets)
const { chromium } = require('playwright');
(async () => {
  const [prefix, ...views] = process.argv.slice(2);
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 960, height: 600 } });
  const errs = [];
  p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  p.on('pageerror', (e) => errs.push('PAGEERR ' + e.message));
  await p.goto('http://localhost:5173/viewer.html?frames=1&only=none&' + (process.env.VQ || ''));
  await p.waitForFunction(() => (window.__frames || 0) >= 1, null, { timeout: 120000 });
  for (const v of views) {
    const [name, c, fov] = v.split(':');
    await p.evaluate(([c, fov]) => window.__view(c.split(',').map(Number), fov ? +fov : 55), [c, fov]);
    await p.screenshot({ path: `${prefix}_${name}.png`, timeout: 120000 });
  }
  if (errs.length) console.log(errs.slice(0, 10).join('\n'));
  await b.close();
})();
