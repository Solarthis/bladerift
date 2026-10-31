// Viewport regression check for Bladerift. The visible app area must follow the window both ways (shrink AND grow
// back), on the title screen, in a match, and in the iPhone home-screen app, even when iOS sends no event. In a match
// the HUD and the thumb cluster fill the same area, never overlap each other, stay inside the safe area (notch, home
// indicator) and the Art tile shows the hero's own Art icon. The title's build line never sits on the menu.
// Runs before every deploy (deploy/deploy-hostinger.sh) against the built preview.
// The full-screen layers are sized from --app-h (src/ui/viewport.ts); a measurement that read a box it also sizes
// could only ever shrink - a keyboard, rotation or app-resume transient then cropped the bottom permanently.
// Usage: node tools/viewportcheck.mjs [--url=http://localhost:5173/]   (needs the dev server: npm run dev)
import { chromium } from 'playwright';

const url = (process.argv.find((a) => a.startsWith('--url=')) ?? '--url=http://localhost:5173/').slice(6);
const browser = await chromium.launch();
let fail = 0;
let results = [];
const check = (ok, label) => results.push([!!ok, label]);
const flush = () => {
  for (const [ok, label] of results) {
    if (!ok) fail++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  }
  results = [];
};
/** A block that hits a page reload (the dev server reloads when a source file changes) is run once more. */
async function block(name, fn) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    results = [];
    try {
      await fn();
      flush();
      return;
    } catch (e) {
      const msg = String(e?.message ?? e).split('\n')[0];
      if (attempt === 2 || !/destroyed|closed|navigat/i.test(msg)) {
        results = [];
        check(false, `${name} did not complete: ${msg}`);
        flush();
        return;
      }
    }
  }
}

const appH = (p) => p.evaluate(() => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--app-h')));
const rect = (p, sel) =>
  p.evaluate((sel) => {
    const e = document.querySelector(sel);
    if (!e) return null;
    const b = e.getBoundingClientRect();
    return { l: b.left, t: b.top, r: b.right, b: b.bottom, w: b.width, h: b.height };
  }, sel);
const rects = (p, sel) =>
  p.evaluate((sel) => [...document.querySelectorAll(sel)].map((e) => {
    const b = e.getBoundingClientRect();
    return { l: b.left, t: b.top, r: b.right, b: b.bottom, w: b.width, h: b.height };
  }), sel);
// make the visual viewport report a height WITHOUT firing any event (what iOS does after the keyboard closes)
const fakeVV = (p, h) =>
  p.evaluate((h) => {
    if (h == null) delete window.visualViewport.height;
    else Object.defineProperty(window.visualViewport, 'height', { get: () => h, configurable: true });
  }, h);
const overlap = (a, b) => a.l < b.r - 0.5 && a.r > b.l + 0.5 && a.t < b.b - 0.5 && a.b > b.t + 0.5;
const inside = (a, w, h, pad = 0.5) => a.l >= -pad && a.t >= -pad && a.r <= w + pad && a.b <= h + pad;

async function startPractice(p) {
  await p.waitForSelector('.screen-title');
  await p.click('[data-act="practice"]');
  await p.click('[data-act="start"]', { timeout: 10000 });
  await p.waitForFunction(() => document.body.dataset.screen === 'game', null, { timeout: 15000 });
  await p.waitForTimeout(3500); // the VS card clears
}
const phone = (browser, w, h, extra = {}) =>
  browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, ...extra });

// ---- in a match, landscape phone: the canvas and every layer follow the window
await block('match resize', async () => {
  const ctx = await phone(browser, 844, 390);
  const p = await ctx.newPage();
  await p.goto(url);
  await startPractice(p);
  const fill = async () => ({
    appH: await appH(p),
    game: (await rect(p, '#game'))?.h ?? 0,
    canvas: (await rect(p, '#game canvas'))?.h ?? 0,
    hud: (await rect(p, '.hud'))?.h ?? 0,
    touch: (await rect(p, '.touch'))?.h ?? 0,
  });
  const steps = [
    [844, 390, 'start (landscape phone)'],
    [844, 200, 'shrunk (keyboard / toolbar transient)'],
    [844, 390, 'grown back'],
    [390, 844, 'rotated to portrait'],
    [844, 390, 'rotated back to landscape'],
  ];
  for (const [w, h, label] of steps) {
    await p.setViewportSize({ width: w, height: h });
    await p.waitForTimeout(1300);
    const r = await fill();
    const ok = [r.appH, r.game, r.canvas, r.hud, r.touch].every((v) => Math.abs(v - h) <= 1);
    check(ok, `match, ${label} ${w}x${h}: --app-h ${r.appH}, #game ${r.game}, canvas ${r.canvas}, HUD ${r.hud}, touch ${r.touch}`);
  }
  // a silent shrink and grow in the match (no resize event): the game must follow both
  await fakeVV(p, 250);
  await p.waitForTimeout(1600);
  let r = await fill();
  check([r.appH, r.canvas, r.hud].every((v) => Math.abs(v - 250) <= 1), `match, a silent visual-viewport shrink is picked up (--app-h ${r.appH}, canvas ${r.canvas}, want 250)`);
  await fakeVV(p, null);
  await p.waitForTimeout(1600);
  r = await fill();
  check([r.appH, r.canvas, r.hud].every((v) => Math.abs(v - 390) <= 1), `match, ...and the silent grow-back leaves no band (--app-h ${r.appH}, canvas ${r.canvas}, want 390)`);
  await ctx.close();
});

// ---- in a match, phone sizes: the HUD and the thumb cluster are laid out cleanly, inside the window and the safe area
const PHONE_SIZES = [
  [667, 375],
  [844, 390],
  [932, 430],
];
for (const [w, h] of PHONE_SIZES) {
  await block(`match layout ${w}x${h}`, async () => {
    const ctx = await phone(browser, w, h);
    const p = await ctx.newPage();
    await p.goto(url);
    await startPractice(p);
    const tiles = await rects(p, '.tb');
    check(tiles.length === 7, `${w}x${h}: seven touch tiles (found ${tiles.length})`);
    const sizes = new Set(tiles.map((t) => `${Math.round(t.w)}x${Math.round(t.h)}`));
    check(sizes.size === 1, `${w}x${h}: the touch tiles are one square size (${[...sizes].join(', ')})`);
    for (let i = 0; i < tiles.length; i++) {
      for (let j = i + 1; j < tiles.length; j++) {
        if (overlap(tiles[i], tiles[j])) check(false, `${w}x${h}: touch tiles ${i} and ${j} overlap`);
      }
    }
    check(tiles.every((t) => inside(t, w, h)), `${w}x${h}: every touch tile is inside the window`);
    const hud = [...(await rects(p, '.hp-side')), ...(await rects(p, '.hud-mid')), ...(await rects(p, '.hud-menu'))];
    const hudHit = tiles.some((t) => hud.some((b) => overlap(t, b)));
    check(!hudHit, `${w}x${h}: the touch tiles clear the HUD (portraits, HP, Rift, clock, pause)`);
    check(hud.every((b) => inside(b, w, h)), `${w}x${h}: every HUD panel is inside the window`);
    // the Art tile shows the hero's own Art icon: the same file the HUD's Rift Art shows
    const artBg = await p.evaluate(() => document.querySelector('.tb-art i')?.style.backgroundImage ?? '');
    const artSrc = await p.evaluate(() => document.querySelector('.rift-art img')?.getAttribute('src') ?? '');
    check(artSrc && artBg.includes(artSrc.split('/').pop()), `${w}x${h}: the Art tile shows the hero's own Art icon (${artSrc.split('/').pop()})`);
    await ctx.close();
  });
}

// ---- iPhone landscape notch: the HUD and the cluster stay inside the safe area on either side
const NOTCHES = [
  { name: 'notch left', insets: { top: 0, left: 59, right: 0, bottom: 21 } },
  { name: 'notch right', insets: { top: 0, left: 0, right: 59, bottom: 21 } },
  { name: 'notch both sides', insets: { top: 0, left: 47, right: 47, bottom: 21 } },
];
for (const n of NOTCHES) {
  await block(`safe area ${n.name}`, async () => {
    const ctx = await phone(browser, 844, 390);
    const p = await ctx.newPage();
    await p.goto(url);
    await startPractice(p);
    const cdp = await ctx.newCDPSession(p);
    await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: n.insets });
    await p.waitForTimeout(500);
    const { left: L, right: R, bottom: B } = n.insets;
    const tiles = await rects(p, '.tb');
    const sides = await rects(p, '.hp-side');
    const menu = await rect(p, '.hud-menu');
    check(tiles.every((t) => t.r <= 844 - R + 0.5 && t.b <= 390 - B + 0.5), `${n.name}: touch tiles stay inside the right and bottom insets`);
    check(tiles.every((t) => t.l >= L - 0.5), `${n.name}: touch tiles clear the left inset`);
    check(sides.every((s) => s.l >= L - 0.5 && s.r <= 844 - R + 0.5), `${n.name}: HUD panels stay inside the left and right insets`);
    check(menu && menu.b <= 390 - B + 0.5, `${n.name}: the pause button stays above the home indicator`);
    await ctx.close();
  });
}

// ---- desktop windows: the match fills the window and the HUD stays inside it
for (const [w, h] of [
  [1280, 720],
  [1920, 1080],
]) {
  await block(`desktop match ${w}x${h}`, async () => {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    const p = await ctx.newPage();
    await p.goto(url);
    await startPractice(p);
    const canvas = (await rect(p, '#game canvas'))?.h ?? 0;
    const hud = (await rect(p, '.hud'))?.h ?? 0;
    check(Math.abs(canvas - h) <= 1 && Math.abs(hud - h) <= 1, `desktop ${w}x${h}: canvas ${canvas} and HUD ${hud} fill the window`);
    const sides = await rects(p, '.hp-side');
    check(sides.length === 2 && sides.every((s) => inside(s, w, h)), `desktop ${w}x${h}: both HUD panels are inside the window`);
    check((await rects(p, '.tb')).length === 0, `desktop ${w}x${h}: no touch cluster on a mouse window`);
    await ctx.close();
  });
}

// ---- title screen, with iOS's habits: no event at all, and the build line never on the menu
await block('title', async () => {
  const ctx = await phone(browser, 844, 390);
  const t = await ctx.newPage();
  await t.goto(url);
  await t.waitForSelector('.screen-title');
  await t.waitForTimeout(800);
  const ui = await rect(t, '#ui');
  check(Math.abs(ui.h - 390) <= 1, `title fills the window (${Math.round(ui.h)} of 390)`);
  await fakeVV(t, 250);
  await t.waitForTimeout(1600);
  check(Math.abs((await appH(t)) - 250) <= 1, `title: a silent visual-viewport shrink is picked up (--app-h ${await appH(t)}, want 250)`);
  await fakeVV(t, null);
  await t.waitForTimeout(1600);
  check(Math.abs((await appH(t)) - 390) <= 1, `title: ...and the silent grow-back too, no dark band (--app-h ${await appH(t)}, want 390)`);
  for (const [w, h] of [
    [667, 375],
    [844, 390],
    [932, 430],
    [1024, 768],
    [1280, 720],
    [390, 844],
  ]) {
    await t.setViewportSize({ width: w, height: h });
    await t.waitForTimeout(700);
    const hit = await t.evaluate(() => {
      const c = document.querySelector('.credit')?.getBoundingClientRect();
      if (!c || !c.width) return 'hidden';
      for (const el of document.querySelectorAll('.menu button')) {
        const r = el.getBoundingClientRect();
        if (c.left < r.right && c.right > r.left && c.top < r.bottom && c.bottom > r.top) return el.textContent.trim().slice(0, 20);
      }
      return '';
    });
    check(!hit || hit === 'hidden', `title ${w}x${h}: build line clear of the menu${hit && hit !== 'hidden' ? ` (overlaps "${hit}")` : ''}`);
  }
  await ctx.close();
});

// ---- iPhone home-screen app (852x393 screen): stale viewports in both directions must not change the app's size
await block('iPhone home-screen app', async () => {
  const ctx = await browser.newContext({
    viewport: { width: 852, height: 393 }, screen: { width: 393, height: 852 }, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
  });
  await ctx.addInitScript(() => Object.defineProperty(navigator, 'standalone', { get: () => true }));
  const t = await ctx.newPage();
  await t.goto(url);
  await t.waitForSelector('.screen-title');
  await fakeVV(t, 300);
  await t.waitForTimeout(1600);
  check(Math.abs((await appH(t)) - 393) <= 1, `iPhone app, title: a stale short viewport leaves no band (--app-h ${await appH(t)}, want 393)`);
  await fakeVV(t, 480);
  await t.waitForTimeout(1600);
  check(Math.abs((await appH(t)) - 393) <= 1, `iPhone app, title: a stale tall viewport cuts nothing off (--app-h ${await appH(t)}, want 393)`);
  // typing: the keyboard's smaller area is used, and the full screen returns when it closes
  await t.click('[data-act="fighter"]');
  await t.waitForSelector('#fname');
  await t.evaluate(() => document.getElementById('fname').focus());
  await fakeVV(t, 200);
  await t.waitForTimeout(1600);
  check(Math.abs((await appH(t)) - 200) <= 1, `iPhone app, fighter: while typing, the keyboard's smaller area is used (--app-h ${await appH(t)}, want 200)`);
  await fakeVV(t, null);
  await t.evaluate(() => document.activeElement.blur());
  await t.waitForTimeout(1600);
  check(Math.abs((await appH(t)) - 393) <= 1, `iPhone app, fighter: keyboard closed, full screen again (--app-h ${await appH(t)}, want 393)`);
  // in a match: stale viewports in both directions leave the match at full size
  await t.click('[data-act="back"]');
  await t.waitForSelector('.screen-title');
  await t.click('[data-act="practice"]');
  await t.click('[data-act="start"]', { timeout: 10000 });
  await t.waitForFunction(() => document.body.dataset.screen === 'game', null, { timeout: 15000 });
  await t.waitForTimeout(3000);
  await fakeVV(t, 300);
  await t.waitForTimeout(1600);
  let canvas = (await rect(t, '#game canvas'))?.h ?? 0;
  check(Math.abs((await appH(t)) - 393) <= 1 && Math.abs(canvas - 393) <= 1, `iPhone app, match: a stale short viewport leaves no band (--app-h ${await appH(t)}, canvas ${canvas}, want 393)`);
  await fakeVV(t, 480);
  await t.waitForTimeout(1600);
  canvas = (await rect(t, '#game canvas'))?.h ?? 0;
  check(Math.abs((await appH(t)) - 393) <= 1 && Math.abs(canvas - 393) <= 1, `iPhone app, match: a stale tall viewport cuts nothing off (--app-h ${await appH(t)}, canvas ${canvas}, want 393)`);
  await fakeVV(t, null);
  await t.waitForTimeout(1000);
  await ctx.close();
});

await browser.close();
console.log(fail ? `${fail} check(s) failed` : 'all viewport checks passed');
process.exit(fail ? 1 : 0);
