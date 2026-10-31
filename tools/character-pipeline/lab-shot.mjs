// Rig Lab still: node tools/character-pipeline/lab-shot.mjs <out.png> [query] [--w=1000 --h=300 --dpr=1 --steps=40]
// e.g. node tools/character-pipeline/lab-shot.mjs .cache/lab/run.png "state=run&zoom=2" --steps=17
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const args = process.argv.slice(2);
const opt = Object.fromEntries(args.filter((a) => a.startsWith('--')).map((a) => a.slice(2).split('=')));
const [out, q = ''] = args.filter((a) => !a.startsWith('--'));
mkdirSync(dirname(out), { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: Number(opt.w ?? 1000), height: Number(opt.h ?? 300) }, deviceScaleFactor: Number(opt.dpr ?? 1) });
await page.goto(`${opt.url ?? 'http://localhost:5173/'}?riglab&row&${q}`);
await page.waitForFunction(() => window.riglab?.step, null, { timeout: 20000 });
await page.waitForTimeout(800);
await page.evaluate((n) => { for (let i = 0; i < n; i++) window.riglab.step(1 / 60); }, Number(opt.steps ?? 40));
await page.waitForTimeout(150);
await page.screenshot({ path: out });
await browser.close();
console.log('saved', out);
