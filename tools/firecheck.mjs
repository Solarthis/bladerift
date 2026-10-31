// Touch fire regression check (Playwright, mobile emulation, offline practice with no bots).
// Usage: node tools/firecheck.mjs [--url=http://localhost:5173/]
// Drives synthetic touch pointers on the aim stick and counts shots via the HUD magazine.
import { chromium } from 'playwright';

const arg = Object.fromEntries(process.argv.slice(2).map((x) => x.replace(/^--/, '').split('=')));
const base = arg.url ?? 'http://localhost:5173/';
const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
await page.goto(base);
await page.evaluate(() => localStorage.removeItem('skyfire.controls'));
await page.goto(`${base}?autoplay=1&map=jungle&bots=0`);
await page.waitForTimeout(5500);

const mag = () => page.evaluate(() => Number(document.querySelector('.mag')?.textContent ?? 'NaN'));
const ptr = (type, id, x, y) =>
  page.evaluate(([type, id, x, y]) => {
    const layer = document.querySelector('.touch-layer');
    const target = type === 'pointerdown' ? layer : layer;
    target.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', clientX: x, clientY: y, bubbles: true, isPrimary: true }));
  }, [type, id, x, y]);
const touchAllUp = () =>
  page.evaluate(() => {
    const ev = new Event('touchend', { bubbles: true });
    Object.defineProperty(ev, 'touches', { value: [] });
    window.dispatchEvent(ev);
  });
const reload = () => page.evaluate(() => {});
const R = 48; // approx stick radius on this viewport (54 * 0.9)
const X = 640, Y = 230;
const results = [];
async function scenario(name, expectShots, fn) {
  await page.waitForTimeout(1600); // let any reload finish
  const before = await mag();
  await fn();
  await page.waitForTimeout(250);
  const after = await mag();
  const shots = before - after;
  const pass = expectShots ? shots >= 3 : shots === 0;
  results.push({ name, before, after, shots, pass });
}

await scenario('quick tap on the aim side', false, async () => {
  await ptr('pointerdown', 11, X, Y);
  await ptr('pointerup', 11, X, Y);
});
await scenario('aim inside the ring (55%)', false, async () => {
  await ptr('pointerdown', 12, X, Y);
  for (let i = 1; i <= 8; i++) await ptr('pointermove', 12, X + R * 0.55 * Math.cos(i / 3), Y + R * 0.55 * Math.sin(i / 3));
  await page.waitForTimeout(400);
  await ptr('pointerup', 12, X, Y);
});
await scenario('fast aiming flick through the ring and back (~30 ms)', false, async () => {
  await page.evaluate(([X, Y, R]) => new Promise((done) => {
    const layer = document.querySelector('.touch-layer');
    const ev = (type, x) => layer.dispatchEvent(new PointerEvent(type, { pointerId: 13, pointerType: 'touch', clientX: x, clientY: Y, bubbles: true, isPrimary: true }));
    ev('pointerdown', X);
    ev('pointermove', X + R * 0.95);
    setTimeout(() => { ev('pointermove', X + R * 0.35); setTimeout(() => { ev('pointerup', X); done(); }, 300); }, 30);
  }), [X, Y, R]);
});
await scenario('deliberate push past the ring (1 s hold keeps firing)', true, async () => {
  await ptr('pointerdown', 14, X, Y);
  await ptr('pointermove', 14, X + R * 0.95, Y);
  await page.waitForTimeout(1000);
  await ptr('pointerup', 14, X, Y);
});
await scenario('easing back inside the ring stops the burst', false, async () => {
  await ptr('pointerdown', 16, X, Y);
  await ptr('pointermove', 16, X + R * 0.95, Y);
  await page.waitForTimeout(400);
  await ptr('pointermove', 16, X + R * 0.58, Y);
  await page.waitForTimeout(200);
  const m0 = await mag();
  await page.waitForTimeout(900);
  const m1 = await mag();
  await ptr('pointerup', 16, X, Y);
  results.push({ name: '  (shots while held just inside the ring)', before: m0, after: m1, shots: m0 - m1, pass: m0 === m1 });
});
results.splice(results.length - 1, 1); // drop the outer row (it counts the deliberate setup shots)
await scenario('lost pointerup: firing stops when all fingers lift', false, async () => {
  await ptr('pointerdown', 15, X, Y);
  await ptr('pointermove', 15, X + R * 0.95, Y);
  await page.waitForTimeout(300);
  await touchAllUp(); // no pointerup delivered
  await page.waitForTimeout(1600);
  // measured window starts now
  const m0 = await mag();
  await page.waitForTimeout(700);
  const m1 = await mag();
  results.push({ name: '  (shots after all fingers lifted)', before: m0, after: m1, shots: m0 - m1, pass: m0 === m1 });
});
results.splice(results.length - 1, 1); // the outer lost-pointerup row measured setup shots; keep the inner one
void reload;
for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}: shots=${r.shots} (mag ${r.before} -> ${r.after})`);
await browser.close();
process.exit(results.every((r) => r.pass) ? 0 : 1);
