// Client performance probe: a real network client (no local simulation) joins the bundled LAN server as
// host, fills the match with bots, and records frame-time stats from the running game.
// Usage: node tools/perf.mjs [--device=s24|iphone|mid] [--classic] [--mobile] [--throttle=4] [--bots=19] [--map=jungle]
//        [--seconds=20] [--headed] [--profile]
// (serves packages/client/dist: run `npm run build` first)
//   --device=s24     Galaxy S24 Ultra-like: Android Chrome UA, 832x384 CSS px at DPR 3.75, touch, CPU throttle 2
//   --device=mid     mid-range Android: 800x360 at DPR 2.5, CPU throttle 4
//   --device=iphone  iPhone 15-like on the WebKit engine: 852x393 at DPR 3 (no CPU throttling or heap stats in WebKit)
// Reports browser frame gaps (hitches = frames that missed their 60 fps slot), the game's paced steps (main-thread work
// per step), JS allocation rate and GC count (Chromium), long tasks, and the render scale actually used.
import { chromium, webkit } from 'playwright';
import { spawn } from 'node:child_process';
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
const port = 7360;
const srv = spawn(process.execPath, ['packages/server/dist/server.mjs', `--port=${port}`, '--static=packages/client/dist', '--hostkey=PERF', '--quiet'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 1500));
const engine = dev?.engine === 'webkit' ? webkit : chromium;
const browser = await engine.launch(engine === chromium ? { headless: !a.headed, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] } : { headless: !a.headed });
const ctxOpts = dev
  ? { viewport: dev.viewport, deviceScaleFactor: dev.deviceScaleFactor, isMobile: engine === chromium ? dev.isMobile : undefined, hasTouch: dev.hasTouch, userAgent: dev.userAgent }
  : a.mobile ? { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 720 } };
const ctx = await browser.newContext(ctxOpts);
const page = await ctx.newPage();
const cdp = engine === chromium ? await ctx.newCDPSession(page) : null;
await page.goto((a.url ? `${a.url}?host=PERF` : `http://localhost:${port}/?host=PERF`) + (a.classic ? '&classic=1' : ''));
await page.waitForFunction(() => window.skyfire?.session?.lobby, null, { timeout: 20000 });
await page.evaluate(({ bots, map }) => {
  const s = window.skyfire.session;
  s.lobbyCmd({ op: 'settings', settings: { mapId: map, timeLimit: 300 } });
  s.lobbyCmd({ op: 'bots', count: bots });
  s.lobbyCmd({ op: 'start' });
}, { bots: Number(a.bots ?? 19), map: a.map ?? 'jungle' });
await page.waitForTimeout(4000);
const throttle = Number(a.throttle ?? dev?.throttle ?? 1);
if (cdp && throttle > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
const renderer = await page.evaluate(() => { const gl = document.createElement('canvas').getContext('webgl'); const d = gl?.getExtension('WEBGL_debug_renderer_info'); return d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : 'unknown'; });
if (a.profile && cdp) await cdp.send('Profiler.enable'), await cdp.send('Profiler.setSamplingInterval', { interval: 200 }), await cdp.send('Profiler.start');
// --allocs: sample heap allocations by call site (what feeds the garbage collector every frame)
if (a.allocs && cdp) await cdp.send('HeapProfiler.enable'), await cdp.send('HeapProfiler.startSampling', { samplingInterval: 8192, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
const stats = await page.evaluate(async (secs) => {
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
  const app = window.skyfire;
  const cv = document.querySelector('#game canvas');
  return {
    frames: gaps.length, fps: +(1000 / (gaps.reduce((x, v) => x + v, 0) / gaps.length)).toFixed(1), p50: +p(0.5).toFixed(1), p95: +p(0.95).toFixed(1), p99: +p(0.99).toFixed(1),
    max: +s[s.length - 1].toFixed(1), hitches: gaps.filter((g) => g > 26).length, longTasks, longMax: +longMax.toFixed(0),
    allocMBs: performance.memory ? +(alloc / 1048576 / secs).toFixed(2) : null, gcs: performance.memory ? gcs : null, heapMB: performance.memory ? Math.round(mem() / 1048576) : null,
    renderScale: cv ? +(cv.width / cv.clientWidth).toFixed(2) : null, pacer: app?.pacer?.stats?.() ?? null, bigGaps: big.slice(0, 16),
    players: app?.session?.game?.latest?.players.length, rtt: +(app?.session?.rtt ?? 0).toFixed(1),
  };
}, Number(a.seconds ?? 20));
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
console.log(JSON.stringify({ device: a.device ?? (a.mobile ? 'mobile' : 'desktop'), throttle, renderer, ...stats }));
await browser.close();
srv.kill();
