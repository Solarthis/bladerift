// Skyfire Squad character pipeline - step 4: animation previews from the in-game rig (Rig Lab).
//
// Usage: node tools/character-pipeline/capture.mjs [state ...] [--url=http://localhost:5173/] [--frames=36] [--fps=24]
//
// Opens ?riglab&row&state=<state> (all five outfits side by side, real HeroView + rig solver), steps the rig
// deterministically with window.riglab.step(1/fps), screenshots every frame and writes
// tools/character-pipeline/previews/<state>.gif and .webp (looping) via tools/character-pipeline/frames2anim.py.
import { chromium } from 'playwright';
import { mkdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, 'previews');
const args = process.argv.slice(2);
const opt = Object.fromEntries(args.filter((a) => a.startsWith('--')).map((a) => a.slice(2).split('=')));
const base = opt.url ?? 'http://localhost:5173/';
const N = Number(opt.frames ?? 36);
const FPS = Number(opt.fps ?? 24);
const states = args.filter((a) => !a.startsWith('--'));
const ALL = ['idle', 'run', 'backpedal', 'jump', 'hover', 'dash', 'fall', 'land', 'aimUp', 'shoot', 'reload', 'melee', 'hurt', 'dual', 'death'];
const list = states.length ? states : ALL;
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1000, height: 300 }, deviceScaleFactor: 1 });
for (const st of list) {
  const dir = join(OUT, `_frames_${st}`);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  await page.goto(`${base}?riglab&row&state=${st}&zoom=2.7`);
  await page.waitForFunction(() => (window).riglab?.ready === true, null, { timeout: 30000 });
  await page.evaluate(() => (window).riglab.step(0.5)); // settle cloth / transitions
  for (let i = 0; i < N; i++) {
    await page.evaluate((dt) => (window).riglab.step(dt), 1 / FPS);
    await page.waitForTimeout(20);
    await page.screenshot({ path: join(dir, `${String(i).padStart(3, '0')}.png`) });
  }
  execFileSync('python', [join(here, 'frames2anim.py'), dir, join(OUT, st), String(FPS)], { stdio: 'inherit' });
}
await browser.close();
