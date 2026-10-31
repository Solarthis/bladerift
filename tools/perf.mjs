// Client performance probe for Bladerift: a practice duel against the bot (it runs in the browser, no server needed),
// with frame-time statistics from the running match. While it measures, a fighter holds forward and attacks, so the
// frames come from a real fight (hits, effects, the HUD), not an idle screen.
// Usage: node tools/perf.mjs [--url=http://localhost:5173/] [--device=s24|mid|iphone] [--mobile] [--throttle=4]
//        [--seconds=20] [--headed] [--profile] [--allocs]
//   --device=s24     Galaxy S24 Ultra-like: Android Chrome UA, 832x384 CSS px at DPR 3.75, touch, CPU throttle 2
//   --device=mid     mid-range Android: 800x360 at DPR 2.5, CPU throttle 4
//   --device=iphone  iPhone 15-like on the WebKit engine: 852x393 at DPR 3 (no CPU throttling or heap stats in WebKit)
//   --mobile         844x390 at DPR 2 with touch, no throttle (default: 1280x720 desktop)
// Reports browser frame gaps (hitches = frames that missed their 60 fps slot), long tasks, the game's own loop fps,
// JS allocation rate and GC count (Chromium), and the render scale actually used.
// Serve the build for numbers that matter (the dev server is unminified): see docs/deploy.md.
import { chromium, webkit } from 'playwright';

const a = Object.fromEntries(process.argv.slice(2).map((x) => x.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? true]));
const DEVICES = {
  s24: { viewport: { width: 832, height: 384 }, deviceScaleFactor: 3.75, isMobile: true, hasTouch: true, throttle: 2,
    userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36' },
  mid: { viewport: { width: 800, height: 360 }, deviceScaleFactor: 2.5, isMobile: true, hasTouch: true, throttle: 4,
    userAgent: 'Mozilla/5.0 (Linux; Android 13; SM-A546B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36' },
  iphone: { viewport: { width: 852, height: 393 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, engine: 'webkit',
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' },
};
const dev = a.device ? DEVICES[a.device] : null;
if (a.device && !dev) throw new Error('unknown device ' + a.device);
const url = typeof a.url === 'string' ? a.url : 'http://localhost:5173/';
const engine = dev?.engine === 'webkit' ? webkit : chromium;
const browser = await engine.launch(engine === chromium ? { headless: !a.headed, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] } : { headless: !a.headed });
const ctxOpts = dev
  ? { viewport: dev.viewport, deviceScaleFactor: dev.deviceScaleFactor, isMobile: engine === chromium ? dev.isMobile : undefined, hasTouch: dev.hasTouch, userAgent: dev.userAgent }
  : a.mobile ? { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 720 } };
const ctx = await browser.newContext(ctxOpts);
const page = await ctx.newPage();
const cdp = engine === chromium ? await ctx.newCDPSession(page) : null;

// a practice duel: the title's practice button, then Fight! in the lobby
await page.goto(url);
await page.waitForSelector('.screen-title', { timeout: 20000 });
await page.click('[data-act="practice"]');
await page.click('[data-act="start"]', { timeout: 10000 });
await page.waitForFunction(() => document.body.dataset.screen === 'game', null, { timeout: 15000 });
await page.waitForTimeout(4000); // the VS card clears and the fighters settle

const throttle = Number(a.throttle ?? dev?.throttle ?? 1);
if (cdp && throttle > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
const renderer = await page.evaluate(() => {
  const gl = document.createElement('canvas').getContext('webgl');
  const d = gl?.getExtension('WEBGL_debug_renderer_info');
  return d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : 'unknown';
});
if (a.profile && cdp) await cdp.send('Profiler.enable'), await cdp.send('Profiler.setSamplingInterval', { interval: 200 }), await cdp.send('Profiler.start');
if (a.allocs && cdp) await cdp.send('HeapProfiler.enable'), await cdp.send('HeapProfiler.startSampling', { samplingInterval: 8192, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });

const secs = Number(a.seconds ?? 20);
// the measurement runs in the page; meanwhile a fighter walks forward and attacks, like a player would
const measuring = page.evaluate(async (secs) => {
  const gaps = [];
  let longTasks = 0;
  let longMax = 0;
  try {
    new PerformanceObserver((l) => { for (const e of l.getEntries()) { longTasks++; longMax = Math.max(longMax, e.duration); } }).observe({ type: 'longtask', buffered: false });
  } catch { /* WebKit: no long task API */ }
  const mem = () => performance.memory?.usedJSHeapSize ?? 0;
  let heapPrev = mem();
  let alloc = 0;
  let gcs = 0;
  let last = performance.now();
  const t0 = last;
  const big = [];
  await new Promise((done) => {
    const end = last + secs * 1000;
    const f = (t) => {
      gaps.push(t - last);
      if (t - last > 26) big.push([Math.round(t - t0), Math.round(t - last)]);
      last = t;
      const h = mem();
      if (h >= heapPrev) alloc += h - heapPrev;
      else if (heapPrev - h > 512 * 1024) gcs++;
      heapPrev = h;
      if (t < end) requestAnimationFrame(f);
      else done();
    };
    requestAnimationFrame(f);
  });
  const s = [...gaps].sort((x, y) => x - y);
  const p = (q) => s[Math.min(s.length - 1, Math.floor(s.length * q))];
  const app = window.bladerift;
  const cv = document.querySelector('#game canvas');
  const sim = app?.sessions?.[0]?.game;
  return {
    frames: gaps.length,
    fps: +(1000 / (gaps.reduce((x, v) => x + v, 0) / gaps.length)).toFixed(1),
    p50: +p(0.5).toFixed(1), p95: +p(0.95).toFixed(1), p99: +p(0.99).toFixed(1), max: +s[s.length - 1].toFixed(1),
    hitches: gaps.filter((g) => g > 26).length, longTasks, longMax: +longMax.toFixed(0),
    allocMBs: performance.memory ? +(alloc / 1048576 / secs).toFixed(2) : null,
    gcs: performance.memory ? gcs : null,
    heapMB: performance.memory ? Math.round(mem() / 1048576) : null,
    renderScale: cv ? +(cv.width / cv.clientWidth).toFixed(2) : null,
    phaserFps: app?.game?.loop?.actualFps != null ? +app.game.loop.actualFps.toFixed(1) : null,
    fighters: sim ? sim.fighters(performance.now()).length : null,
    bigGaps: big.slice(0, 16),
  };
}, secs);
// the fight: hold forward, attack with both weapons and the skill, and jump now and then
const KEYS = ['KeyJ', 'KeyJ', 'KeyK', 'KeyL', 'KeyW', 'KeyJ'];
await page.keyboard.down('KeyD');
let pressed = 0;
const fightUntil = Date.now() + secs * 1000 + 500;
while (Date.now() < fightUntil) {
  await page.keyboard.press(KEYS[pressed++ % KEYS.length]).catch(() => {});
  await page.waitForTimeout(220);
  if (pressed % 9 === 0) await page.keyboard.up('KeyD').catch(() => {}), await page.keyboard.down('KeyA').catch(() => {});
  if (pressed % 9 === 4) await page.keyboard.up('KeyA').catch(() => {}), await page.keyboard.down('KeyD').catch(() => {});
}
await page.keyboard.up('KeyD').catch(() => {});
await page.keyboard.up('KeyA').catch(() => {});
const stats = await measuring;

if (a.profile && cdp) {
  const { profile } = await cdp.send('Profiler.stop');
  const self = new Map();
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const counts = new Map();
  for (const s of profile.samples) counts.set(s, (counts.get(s) ?? 0) + 1);
  let total = 0;
  for (const [id, c] of counts) {
    const n = byId.get(id);
    const key = `${n.callFrame.functionName || '(anon)'} ${n.callFrame.url.split('/').pop()}:${n.callFrame.lineNumber}`;
    self.set(key, (self.get(key) ?? 0) + c);
    total += c;
  }
  console.log('TOP SELF TIME:');
  for (const [k, c] of [...self.entries()].sort((x, y) => y[1] - x[1]).slice(0, 25)) console.log(((c / total) * 100).toFixed(1).padStart(5) + '%  ' + k);
}
if (a.allocs && cdp) {
  const { profile } = await cdp.send('HeapProfiler.stopSampling');
  const sites = new Map();
  let total = 0;
  const walk = (n, stack) => {
    const f = n.callFrame;
    const here = `${f.functionName || '(anon)'} ${f.url.split('/').pop()}:${f.lineNumber}:${f.columnNumber}`;
    const st = [here, ...stack].slice(0, 3);
    if (n.selfSize) {
      const k = st.join('  <  ');
      sites.set(k, (sites.get(k) ?? 0) + n.selfSize);
      total += n.selfSize;
    }
    for (const c of n.children) walk(c, st);
  };
  walk(profile.head, []);
  console.log(`TOP ALLOCATION SITES (sampled, ${(total / 1048576).toFixed(1)} MB):`);
  for (const [k, v] of [...sites.entries()].sort((x, y) => y[1] - x[1]).slice(0, 30)) console.log(((v / total) * 100).toFixed(1).padStart(5) + '%  ' + k);
}
console.log(JSON.stringify({ url, device: a.device ?? (a.mobile ? 'mobile' : 'desktop'), throttle, renderer, ...stats }));
await browser.close();
