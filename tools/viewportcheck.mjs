// Viewport regression check: the visible app area must follow the window both ways (shrink AND grow back), in the
// game and on the title screen, even when iOS sends no event, and in the iPhone home-screen app; the title's build
// line must never sit on the menu. Runs before every deploy (deploy/deploy-hostinger.sh).
// The full-screen layers are sized from --app-h (src/ui/viewport.ts); a measurement that read a box it also sizes
// could only ever shrink - a keyboard, rotation or app-resume transient then cropped the bottom permanently.
// Usage: node tools/viewportcheck.mjs [--url=http://localhost:5173/]   (needs the dev server: npm run dev)
import { chromium } from 'playwright';

const url = (process.argv.find((a) => a.startsWith('--url=')) ?? '--url=http://localhost:5173/').slice(6);
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
await page.goto(url + '?autoplay=1&map=jungle&bots=3');
await page.waitForTimeout(3500);
const read = () =>
  page.evaluate(() => ({
    appH: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--app-h')),
    canvasH: document.querySelector('#game canvas')?.getBoundingClientRect().height ?? 0,
    gameH: document.querySelector('#game')?.getBoundingClientRect().height ?? 0,
  }));
const steps = [
  [844, 390, 'start (landscape phone)'],
  [844, 200, 'shrunk (keyboard / toolbar transient)'],
  [844, 390, 'grown back'],
  [390, 844, 'rotated to portrait'],
  [844, 390, 'rotated back to landscape'],
];
let fail = 0;
for (const [w, h, label] of steps) {
  await page.setViewportSize({ width: w, height: h });
  await page.waitForTimeout(1300);
  const r = await read();
  const ok = Math.abs(r.appH - h) <= 1 && Math.abs(r.canvasH - h) <= 1 && Math.abs(r.gameH - h) <= 1;
  if (!ok) fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label} ${w}x${h}: --app-h ${r.appH}, #game ${r.gameH}, canvas ${r.canvasH}`);
}

// ---- title screen, with iOS's habits: no event at all, and the home-screen app's stale viewports
const check = (ok, label) => {
  if (!ok) fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
};
const appH = (p) => p.evaluate(() => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--app-h')));
const uiH = (p) => p.evaluate(() => document.querySelector('#ui').getBoundingClientRect().height);
// make the visual viewport report a height WITHOUT firing any event (what iOS does after the keyboard closes)
const fakeVV = (p, h) => p.evaluate((h) => {
  if (h == null) delete window.visualViewport.height;
  else Object.defineProperty(window.visualViewport, 'height', { get: () => h, configurable: true });
}, h);

{
  const t = await (await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true })).newPage();
  await t.goto(url);
  await t.waitForSelector('.screen.title');
  await t.waitForTimeout(800);
  check(Math.abs((await uiH(t)) - 390) <= 1, `title fills the window (${await uiH(t)} of 390)`);
  await fakeVV(t, 250);
  await t.waitForTimeout(1600);
  check(Math.abs((await appH(t)) - 250) <= 1, `a silent visual-viewport shrink is picked up (--app-h ${await appH(t)}, want 250)`);
  await fakeVV(t, null);
  await t.waitForTimeout(1600);
  check(Math.abs((await appH(t)) - 390) <= 1, `...and the silent grow-back too, no dark band (--app-h ${await appH(t)}, want 390)`);
  // the build line never sits on the menu, at any phone or desktop size
  for (const [w, h] of [[667, 375], [844, 390], [932, 430], [1024, 768], [1280, 720], [390, 844]]) {
    await t.setViewportSize({ width: w, height: h });
    await t.waitForTimeout(700);
    const hit = await t.evaluate(() => {
      const c = document.querySelector('.credit')?.getBoundingClientRect();
      if (!c || !c.width) return 'hidden';
      for (const el of document.querySelectorAll('.title-menu .btn, .profile-card')) {
        const r = el.getBoundingClientRect();
        if (c.left < r.right && c.right > r.left && c.top < r.bottom && c.bottom > r.top) return el.textContent.trim().slice(0, 20);
      }
      return '';
    });
    check(!hit || hit === 'hidden', `${w}x${h}: build line clear of the menu${hit && hit !== 'hidden' ? ` (overlaps "${hit}")` : ''}`);
  }
}

{
  // iPhone home-screen app (852x393 screen): stale viewports in both directions must not change the app's size
  const ctx = await browser.newContext({
    viewport: { width: 852, height: 393 }, screen: { width: 393, height: 852 }, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
  });
  await ctx.addInitScript(() => Object.defineProperty(navigator, 'standalone', { get: () => true }));
  const t = await ctx.newPage();
  await t.goto(url);
  await t.waitForSelector('.screen.title');
  await fakeVV(t, 300);
  await t.waitForTimeout(1600);
  check(Math.abs((await appH(t)) - 393) <= 1, `iPhone app: a stale short viewport leaves no band (--app-h ${await appH(t)}, want 393)`);
  await fakeVV(t, 480);
  await t.waitForTimeout(1600);
  check(Math.abs((await appH(t)) - 393) <= 1, `iPhone app: a stale tall viewport cuts nothing off (--app-h ${await appH(t)}, want 393)`);
  await t.focus('#name');
  await fakeVV(t, 200);
  await t.waitForTimeout(1600);
  check(Math.abs((await appH(t)) - 200) <= 1, `iPhone app: while typing, the keyboard's smaller area is used (--app-h ${await appH(t)}, want 200)`);
  await fakeVV(t, null);
  await t.evaluate(() => document.activeElement.blur());
  await t.waitForTimeout(1600);
  check(Math.abs((await appH(t)) - 393) <= 1, `iPhone app: keyboard closed, full screen again (--app-h ${await appH(t)}, want 393)`);
}

await browser.close();
console.log(fail ? `${fail} check(s) failed` : 'all viewport checks passed');
process.exit(fail ? 1 : 0);
