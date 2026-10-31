// Playwright screenshots of Bladerift: the title, and a practice duel against the bot after a few seconds.
// Usage: node tools/shot.mjs [--url=http://localhost:5191/] [--out=.cache/shots] [--mobile] [--seconds=6]
import { chromium, devices } from 'playwright';
import { mkdirSync } from 'node:fs';

const a = Object.fromEntries(process.argv.slice(2).map((x) => x.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? 'true']));
const url = a.url ?? 'http://localhost:5191/';
const out = a.out ?? '.cache/shots';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ headless: a.headed !== 'true', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
const ctx = a.mobile === 'true'
  ? await browser.newContext({ ...devices['iPhone 13'], viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true })
  : await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(url);
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/title.png` });
await page.click('[data-act="practice"]');
await page.waitForTimeout(800);
await page.screenshot({ path: `${out}/lobby.png` });
await page.click('[data-act="start"]');
const secs = Number(a.seconds ?? 6);
// hold right and mash the first weapon to get into the fight
await page.keyboard.down('KeyD');
for (let i = 0; i < secs * 4; i++) {
  await page.keyboard.press(i % 6 === 5 ? 'KeyK' : 'KeyJ');
  await page.waitForTimeout(250);
  if (i === 6) await page.keyboard.up('KeyD');
  if (i % 8 === 0) await page.screenshot({ path: `${out}/game-${i}.png` });
}
await page.screenshot({ path: `${out}/game-end.png` });
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no page errors');
await browser.close();
