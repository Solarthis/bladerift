// Touch button regression check (dev server only: it reads window.__room).
//   node tools/touchcheck.mjs [--url=http://localhost:5192/] [--vp=m844|m667]
// 1. Every attack tile takes the taps on its whole face (no HUD element sits over it).
// 2. A thumb held on Light through a K.O. (the touch controls fade under it) is let go: after the next round's intro the
//    sim no longer reads Light as held, and one fresh tap starts an attack.
// 3. A held Heavy lets go when the app is hidden; a tap on the Block tile raises the guard with a perfect-block window.
// 4. A tap on the Stance tile switches to the hero's second weapon, and the tile then shows the first one.
// 5. The stick: a thumb pushing it moves the hero; when the thumb lifts and the browser loses the pointer release (iOS does
//    now and then), the stick still lets go; a second thumb on the stick takes it over and turns the hero round.
import { chromium } from 'playwright';

const arg = (k, d) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1] ?? d;
const url = arg('url', 'http://localhost:5192/');
const VPS = { m844: { width: 844, height: 390 }, m667: { width: 667, height: 375 } };
const vp = VPS[arg('vp', 'm844')];
const A = 1 << 1; // Btn.A (packages/shared: Jump 1, A 2, B 4, ...), checked below against the module

const b = await chromium.launch({ args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
await ctx.addInitScript(() => {
  localStorage.setItem('bladerift.profile', JSON.stringify({ name: 'Me', color: 0, load: { weapons: [0, 0], skill: 0, cls: 0, hero: 0 } }));
  localStorage.setItem('bladerift.hint.artHold.v1', '1');
  // check 5 swallows every pointer release before the page sees it (registered first, in the capture phase)
  window.__dropRelease = false;
  for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) addEventListener(t, (e) => window.__dropRelease && e.stopImmediatePropagation(), true);
});
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(String(e).slice(0, 300)));
const cdp = await ctx.newCDPSession(p);
const wait = (ms) => p.waitForTimeout(ms);
const fails = [];
const check = (ok, msg) => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${msg}`);
  if (!ok) fails.push(msg);
};

await p.goto(url);
await wait(2000);
await p.click('[data-act="practice"]');
await wait(600);
const card = await p.$('[data-arena="hall"]');
if (card) {
  await card.click();
  await wait(300);
}
await p.click('[data-act="start"]');
await p.waitForFunction(() => window.__room?.world?.phase === 'fight', null, { timeout: 30000 });
await wait(800);

// 1. hit testing over each tile's face
const cover = await p.evaluate(() => {
  const out = [];
  for (const el of document.querySelectorAll('.touch .tb')) {
    const r = el.getBoundingClientRect();
    let bad = 0;
    for (const fx of [0.15, 0.5, 0.85]) for (const fy of [0.15, 0.5, 0.85]) {
      const hit = document.elementFromPoint(r.left + r.width * fx, r.top + r.height * fy);
      if (!hit || !el.contains(hit)) bad++;
    }
    out.push({ id: el.dataset.b, bad, w: Math.round(r.width) });
  }
  return out;
});
for (const c of cover) check(c.bad === 0, `tile ${c.id} (${c.w}px) takes taps on its whole face${c.bad ? ` (${c.bad}/9 points covered)` : ''}`);

// 2. hold Light through a K.O.
const centre = async (sel) =>
  p.evaluate((s) => {
    const r = document.querySelector(s).getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, sel);
const touch = (type, pt, id = 1) =>
  cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: pt.x, y: pt.y, id, radiusX: 6, radiusY: 6, force: 1 }] });
const me = () =>
  p.evaluate(() => {
    const w = window.__room.world;
    const f = [...w.fighters.values()].find((x) => x.seat === 0);
    return { phase: w.phase, act: f.s.act, actT: f.s.actT, move: f.s.move, moveSeq: f.s.moveSeq, prevBtn: f.s.prevBtn, hp: f.s.hp };
  });
await p.evaluate(() => {
  const r = window.__room;
  const w = r.world;
  r.bot.brain.think = () => ({ seq: 0, moveX: 0, moveY: 0, buttons: 0, viewTick: 0 });
  const fs = [...w.fighters.values()];
  fs.find((f) => f.seat === 0).s.x = 600;
  fs.find((f) => f.seat === 1).s.x = 640;
  fs.find((f) => f.seat === 1).s.hp = 1;
});
const pa = await centre('.touch .tb-a');
let held = false;
for (let i = 0; i < 40 && !held; i++) {
  await touch('touchStart', pa);
  await wait(140);
  if ((await me()).phase !== 'fight') held = true;
  else {
    await touch('touchEnd', pa);
    await wait(120);
  }
}
check(held, 'a Light tap landed the K.O. with the thumb still down');
const faded = await p.evaluate(() => document.querySelector('.touch')?.classList.contains('faded'));
check(!!faded, 'the touch controls faded under the held thumb');
// keep the thumb down until the next round is live, then lift it
await p.waitForFunction(() => window.__room.world.phase === 'fight', null, { timeout: 20000 });
await wait(300);
await touch('touchEnd', pa);
await wait(200);
let s = await me();
check((s.prevBtn & A) === 0, `after the K.O. the sim no longer reads Light as held (prevBtn ${s.prevBtn})`);
const tileDown = await p.evaluate(() => document.querySelector('.touch .tb-a').classList.contains('down'));
check(!tileDown, 'the Light tile is not drawn pressed after the thumb lifted');
// one fresh tap starts an attack
await p.evaluate(() => {
  const w = window.__room.world;
  const fs = [...w.fighters.values()];
  fs.find((f) => f.seat === 0).s.x = 600;
  fs.find((f) => f.seat === 1).s.x = 640;
});
const before = await me();
await touch('touchStart', pa);
await wait(50);
await touch('touchEnd', pa);
let attacked = false;
for (let i = 0; i < 12 && !attacked; i++) {
  await wait(40);
  s = await me();
  attacked = s.moveSeq !== before.moveSeq;
}
check(attacked, `one fresh Light tap after the K.O. starts an attack (act ${before.act} -> ${s.act})`);
// and a held thumb on Heavy releases when the page is hidden
const pb = await centre('.touch .tb-b');
await touch('touchStart', pb, 2);
await wait(150);
await p.evaluate(() => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
  document.dispatchEvent(new Event('visibilitychange'));
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
});
await wait(150);
const bDown = await p.evaluate(() => document.querySelector('.touch .tb-b').classList.contains('down'));
check(!bDown, 'a held Heavy is let go when the app is hidden');
await touch('touchEnd', pb, 2);
// the Block tile raises the guard, with a perfect-block window (Act.Guard = 17, charge 0 or 1)
await wait(400);
const pg = await centre('.touch .tb-block');
let guarded = null;
await touch('touchStart', pg, 3);
for (let i = 0; i < 10 && !guarded; i++) {
  await wait(20);
  const g = await p.evaluate(() => {
    const f = [...window.__room.world.fighters.values()].find((x) => x.seat === 0);
    return f.s.act === 17 ? { charge: f.s.charge } : null;
  });
  if (g) guarded = g;
}
await touch('touchEnd', pg, 3);
check(!!guarded && guarded.charge !== 2, `a tap on the Block tile raises the guard with a perfect-block window (${JSON.stringify(guarded)})`);

// 4. the Stance tile
const self = () =>
  p.evaluate(() => {
    const f = [...window.__room.world.fighters.values()].find((x) => x.seat === 0);
    return { stance: f.s.stance, vx: f.s.vx, face: f.s.face, act: f.s.act, on: document.querySelector('.touch .stick-base').classList.contains('on') };
  });
await wait(500);
const ps = await centre('.touch .tb-stance');
const iconOf = () => p.evaluate(() => document.querySelector('.touch .tb-stance i').dataset.icon);
const icon0 = await iconOf();
await touch('touchStart', ps, 4);
await wait(50);
await touch('touchEnd', ps, 4);
let stanced = false;
for (let i = 0; i < 20 && !stanced; i++) {
  await wait(30);
  stanced = (await self()).stance === 1;
}
check(stanced, 'a tap on the Stance tile switches to the second weapon');
await wait(200);
const icon1 = await iconOf();
check(icon1 !== icon0 && /s-00|g-sword|lion/.test(icon0 + icon1), `the Stance tile shows the weapon it switches to (${icon0} -> ${icon1})`);

// 5. the stick, with every pointer release lost
const zoneAt = await p.evaluate(() => {
  const r = document.querySelector('.touch .stick-zone').getBoundingClientRect();
  return { x: r.left + r.width * 0.35, y: r.top + r.height * 0.6 };
});
const pt = (x, id) => ({ x, y: zoneAt.y, id, radiusX: 6, radiusY: 6, force: 1 });
const send = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });
await p.evaluate(() => {
  window.__dropRelease = true;
});
await send('touchStart', [pt(zoneAt.x, 6)]);
for (let k = 1; k <= 6; k++) {
  await send('touchMove', [pt(zoneAt.x + k * 12, 6)]);
  await wait(16);
}
await wait(250);
const pushed = await self();
check(pushed.on && pushed.face === 1, `the stick pushes the hero right (${JSON.stringify(pushed)})`);
await send('touchEnd', []);
await wait(300);
const let1 = await self();
check(!let1.on && Math.abs(let1.vx) < 30, `the stick lets go when the thumb lifts, though the pointer release was lost (${JSON.stringify(let1)})`);
// a thumb held on the stick, then a second one lands on it and pushes left: the second takes the stick over
await send('touchStart', [pt(zoneAt.x, 6)]);
await send('touchMove', [pt(zoneAt.x + 60, 6)]);
await wait(150);
await send('touchStart', [pt(zoneAt.x + 60, 6), pt(zoneAt.x + 20, 7)]);
for (let k = 1; k <= 6; k++) {
  await send('touchMove', [pt(zoneAt.x + 60, 6), pt(zoneAt.x + 20 - k * 12, 7)]);
  await wait(16);
}
await wait(300);
const turned = await self();
check(turned.face === -1 && turned.vx < -30, `a second thumb on the stick takes it over and turns the hero round (${JSON.stringify(turned)})`);
await send('touchEnd', []);
await wait(300);
const let2 = await self();
check(!let2.on && Math.abs(let2.vx) < 30, `both thumbs lifted: the stick is free (${JSON.stringify(let2)})`);
await p.evaluate(() => {
  window.__dropRelease = false;
});

check(errs.length === 0, `no page errors${errs.length ? ': ' + errs.join(' | ') : ''}`);
await b.close();
console.log(fails.length ? `${fails.length} FAILED` : 'ALL PASS');
process.exit(fails.length ? 1 : 0);
