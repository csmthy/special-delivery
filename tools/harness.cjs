const { chromium } = require('playwright');
exports.open = async function open(query = 'dev&manual', w = 960, h = 540, url = process.env.SDURL || 'http://localhost:5173/') {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const mobile = process.env.SDMOBILE === '1';
  const ctx = await b.newContext({ viewport: { width: w, height: h }, ...(mobile ? { isMobile: true, hasTouch: true, deviceScaleFactor: 1 } : {}) });
  const p = await ctx.newPage();
  const logs = [];
  p.on('console', (m) => { if (['error', 'warning'].includes(m.type())) logs.push(`[${m.type()}] ${m.text()}`); });
  p.on('pageerror', (e) => logs.push('PAGEERROR ' + e.message + '\n' + e.stack));
  p.on('requestfailed', (r) => logs.push('REQFAIL ' + r.url()));
  await p.goto(url + (query ? '?' + query : ''));
  await p.waitForFunction(() => window.__sdReady && window.__sd && window.__sd.game.simTime > 0.5, null, { timeout: 120000 });
  const api = {
    b, ctx, p, logs,
    st: () => p.evaluate(() => window.__sd ? window.__sd.state() : null),
    key: async (k, ms = 120) => { await p.keyboard.down(k); await p.waitForTimeout(ms); await p.keyboard.up(k); await p.waitForTimeout(250); },
    shot: async (f) => { await p.evaluate(() => window.__sd.render()); await p.screenshot({ path: f, timeout: 120000 }); },
    wait: (ms) => p.waitForTimeout(ms),
    until: async (fn, arg, timeout = 120000) => p.waitForFunction(fn, arg, { timeout, polling: 250 }),
    close: () => b.close(),
  };
  return api;
};
