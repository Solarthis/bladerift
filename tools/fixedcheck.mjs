// Touch sticks regression check (Playwright, phone emulation, offline practice with no bots): fixed sticks and the
// default floating sticks. Drives synthetic touch pointers and reads the stick state, the player and the magazine.
// Usage: node tools/fixedcheck.mjs [--url=http://localhost:5173/] [--headed]   (screenshots: .cache/shots/fixed/)
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const arg = Object.fromEntries(process.argv.slice(2).map((x) => x.replace(/^--/, '').split('=')));
const base = arg.url ?? 'http://localhost:5173/';
mkdirSync('.cache/shots/fixed', { recursive: true });
const browser = await chromium.launch({ headless: !arg.headed, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const results = [];
const check = (name, pass, info) => results.push({ name, pass: !!pass, info });

async function open(controls) {
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(base);
  await page.evaluate((c) => localStorage.setItem('skyfire.controls', JSON.stringify({ v: 3, ...c })), controls);
  await page.goto(`${base}?autoplay=1&map=canyon&bots=0`);
  // (wait for the match itself: a fixed pause was too short on a cold cache right after a deploy)
  await page.waitForFunction(() => window.skyfire?.phaser?.scene.getScene('game')?.game_?.self?.alive && document.querySelector('.stick-ghost-left'), null, { timeout: 45000 });
  await page.waitForTimeout(1500);
  const centre = (sel) =>
    page.evaluate((sel) => {
      const r = document.querySelector(sel).getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, r: r.width / 2 };
    }, sel);
  const ptr = (type, id, x, y) =>
    page.evaluate(([type, id, x, y]) => {
      const target = type === 'pointerdown' ? document.elementFromPoint(x, y) ?? document.querySelector('.touch-layer') : document.querySelector('.touch-layer');
      target.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', clientX: x, clientY: y, bubbles: true, isPrimary: id === 1 }));
    }, [type, id, x, y]);
  const state = () =>
    page.evaluate(() => {
      const g = window.skyfire.phaser.scene.getScene('game').game_;
      const L = document.querySelector('.stick-left');
      const R = document.querySelector('.stick-right');
      const pos = (el) => {
        const r = el.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      };
      const c = window.skyfire.controls;
      return {
        stickX: c?.left?.x ?? NaN,
        px: g.pred.x,
        mag: Number(document.querySelector('.mag')?.textContent ?? 'NaN'),
        nades: g.self?.grenades ?? NaN,
        leftLive: L.classList.contains('live'),
        rightLive: R.classList.contains('live'),
        left: pos(L),
        right: pos(R),
        knob: pos(L.querySelector('.stick-knob')),
      };
    });
  return { ctx, page, errors, centre, ptr, state };
}

// ---------------------------------------------------------------- fixed sticks
{
  const { ctx, page, errors, centre, ptr, state } = await open({ fixedSticks: true });
  const tag = 'fixed';
  const mv = await centre('.stick-ghost-left');
  const am = await centre('.stick-ghost-right');
  await page.screenshot({ path: '.cache/shots/fixed/fixed-idle.png' });

  let s0 = await state();
  await ptr('pointerdown', 1, 330, 120);
  await ptr('pointermove', 1, 410, 120);
  await page.waitForTimeout(400);
  let s1 = await state();
  check(`${tag}: a touch far from the sticks does nothing`, !s1.leftLive && !s1.rightLive && Math.abs(s1.px - s0.px) < 2, s1);
  await ptr('pointerup', 1, 410, 120);

  const g0 = { x: mv.x + mv.r * 0.6, y: mv.y - mv.r * 0.3 };
  await ptr('pointerdown', 2, g0.x, g0.y);
  for (let i = 1; i <= 6; i++) await ptr('pointermove', 2, g0.x + (mv.r * 2.5 * i) / 6, mv.y);
  await page.waitForTimeout(500);
  s1 = await state();
  check(`${tag}: grabbing near the move stick takes it`, s1.leftLive, {});
  check(`${tag}: the move stick base stays at its spot while dragging past the edge`, Math.hypot(s1.left.x - mv.x, s1.left.y - mv.y) < 3, { base: s1.left, rest: mv });
  check(`${tag}: the knob stops at the edge`, Math.abs(Math.hypot(s1.knob.x - mv.x, s1.knob.y - mv.y) - mv.r) < 4, { knob: s1.knob, r: mv.r });
  check(`${tag}: holding the stick right gives full right tilt`, s1.stickX > 0.95, { stickX: s1.stickX });
  await page.screenshot({ path: '.cache/shots/fixed/fixed-drag.png' });
  // a resize while holding: the held base follows the stick's new spot
  await page.setViewportSize({ width: 932, height: 430 });
  await page.waitForTimeout(400);
  const mv2 = await centre('.stick-ghost-left');
  s1 = await state();
  check(`${tag}: a held stick follows its spot when the screen resizes`, Math.hypot(s1.left.x - mv2.x, s1.left.y - mv2.y) < 3, { base: s1.left, rest: mv2 });
  await ptr('pointerup', 2, g0.x, g0.y);
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForTimeout(1500);

  const fire = async (name, expect, moves) => {
    await page.waitForTimeout(1600); // any reload finishes
    const b = await state();
    await ptr('pointerdown', 3, moves[0][0], moves[0][1]);
    for (const [x, y, wait] of moves.slice(1)) {
      await ptr('pointermove', 3, x, y);
      if (wait) await page.waitForTimeout(wait);
    }
    await page.waitForTimeout(700);
    const a = await state();
    await ptr('pointerup', 3, am.x, am.y);
    const shots = b.mag - a.mag;
    check(`${tag}: ${name}`, expect ? shots >= 2 : shots === 0, { shots, base: a.right, rest: am });
    return a;
  };
  const a1 = await fire('grabbing the aim stick and pushing past the ring fires', true, [[am.x, am.y], ...[1, 2, 3, 4, 5].map((i) => [am.x - (am.r * 1.6 * i) / 5, am.y - 4])]);
  check(`${tag}: the aim stick base stays at its spot`, Math.hypot(a1.right.x - am.x, a1.right.y - am.y) < 3, { base: a1.right, rest: am });
  await fire('a thumb landing past the fire ring does not fire', false, [[am.x - am.r * 0.9, am.y], [am.x - am.r * 0.92, am.y + 2]]);
  await fire('...but easing inside the ring and pushing out again fires', true, [[am.x - am.r * 0.9, am.y], [am.x - am.r * 0.4, am.y, 120], [am.x - am.r * 0.95, am.y]]);
  await fire('a thumb landing just outside the stick (within reach) does not fire', false, [[am.x, am.y + am.r * 1.2], [am.x + 3, am.y + am.r * 1.22]]);
  s1 = await state();
  check(`${tag}: releasing frees both sticks`, !s1.leftLive && !s1.rightLive, {});
  if (errors.length) check(`${tag}: no page errors`, false, errors.slice(0, 3));
  await ctx.close();
}

// ---------------------------------------------------------------- fixed, big sticks: the stick disc beats overlapping buttons
{
  const { ctx, page, errors, centre, ptr, state } = await open({ fixedSticks: true, stickScale: 1.4 });
  const tag = 'fixed 140%';
  const am = await centre('.stick-ghost-right');
  const gb = await centre('.tbtn-grenade');
  const d = Math.hypot(gb.x - am.x, gb.y - am.y);
  const p = { x: am.x + ((gb.x - am.x) / d) * am.r * 0.8, y: am.y + ((gb.y - am.y) / d) * am.r * 0.8 };
  const onButton = await page.evaluate(([x, y]) => !!document.elementFromPoint(x, y)?.closest('.tbtn-grenade'), [p.x, p.y]);
  const s0 = await state();
  await ptr('pointerdown', 4, p.x, p.y);
  await page.waitForTimeout(300);
  const s1 = await state();
  await ptr('pointerup', 4, p.x, p.y);
  check(`${tag}: a touch on the aim stick's disc under the grenade button takes the stick (overlap: ${onButton})`, s1.rightLive && s1.nades === s0.nades, { onButton, nades: [s0.nades, s1.nades] });
  await page.screenshot({ path: '.cache/shots/fixed/fixed-140.png' });
  if (errors.length) check(`${tag}: no page errors`, false, errors.slice(0, 3));
  await ctx.close();
}

// ---------------------------------------------------------------- floating sticks (default): unchanged
{
  const { ctx, page, errors, centre, ptr, state } = await open({ fixedSticks: false });
  const tag = 'floating';
  const mv = await centre('.stick-ghost-left');
  const am = await centre('.stick-ghost-right');
  await ptr('pointerdown', 1, 330, 120);
  await ptr('pointermove', 1, 410, 120);
  await page.waitForTimeout(400);
  let s1 = await state();
  check(`${tag}: a touch anywhere on the left makes a stick there`, s1.leftLive && Math.abs(s1.left.y - 120) < 60, { left: s1.left });
  await ptr('pointerup', 1, 410, 120);
  await page.waitForTimeout(300);
  const g0 = { x: mv.x + mv.r * 0.6, y: mv.y - mv.r * 0.3 };
  await ptr('pointerdown', 2, g0.x, g0.y);
  for (let i = 1; i <= 6; i++) await ptr('pointermove', 2, g0.x + (mv.r * 2.5 * i) / 6, mv.y);
  await page.waitForTimeout(500);
  s1 = await state();
  check(`${tag}: the base follows the thumb past the edge`, s1.left.x > g0.x + mv.r * 0.5, { base: s1.left, start: g0 });
  check(`${tag}: holding the stick right gives full right tilt`, s1.stickX > 0.95, { stickX: s1.stickX });
  await ptr('pointerup', 2, g0.x, g0.y);
  await page.waitForTimeout(1800);
  const b = await state();
  await ptr('pointerdown', 3, am.x, am.y);
  for (let i = 1; i <= 5; i++) await ptr('pointermove', 3, am.x - (am.r * 1.6 * i) / 5, am.y - 4);
  await page.waitForTimeout(700);
  const a = await state();
  await ptr('pointerup', 3, am.x, am.y);
  check(`${tag}: pushing the aim stick past the ring fires`, b.mag - a.mag >= 2, { before: b.mag, after: a.mag });
  if (errors.length) check(`${tag}: no page errors`, false, errors.slice(0, 3));
  await ctx.close();
}

for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}  ${r.pass ? '' : JSON.stringify(r.info)}`);
console.log(`${results.filter((r) => r.pass).length}/${results.length} passed`);
await browser.close();
process.exit(results.every((r) => r.pass) ? 0 : 1);
