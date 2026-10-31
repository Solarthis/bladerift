// Run sprite generation for several characters through ONE pool (a fixed number of image generations at a time).
// Usage: node tools/sprites/batch.mjs <id> [<id>...] [--jobs=6] [--design]
//   --design   generate only the characters' master design sheets (references/design.png) that are missing
//   default    every missing animation sheet of each character (characters without an approved design are skipped)
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const args = process.argv.slice(2);
const flags = Object.fromEntries(args.filter((a) => a.startsWith('--')).map((a) => a.slice(2).split('=')).map(([k, v]) => [k, v ?? 'true']));
const ids = args.filter((a) => !a.startsWith('--'));
const std = JSON.parse(readFileSync(join(root, 'art', 'sprite-standard.json'), 'utf8'));

const tasks = [];
for (const id of ids) {
  const dir = join(root, 'art', 'characters', id);
  const ch = JSON.parse(readFileSync(join(dir, 'character.json'), 'utf8'));
  if (flags.design) {
    if (!existsSync(join(dir, 'references', 'design.png'))) tasks.push([id, 'design']);
    continue;
  }
  const refsOk = (ch.refs ?? []).every((r) => existsSync(join(dir, r)));
  if (!refsOk) {
    console.log(`${id}: skipped (no approved design reference yet)`);
    continue;
  }
  for (const sheet of Object.keys({ ...std.sheets, ...(ch.sheets ?? {}) })) {
    if (!(ch.skip ?? []).includes(sheet) && !existsSync(join(dir, 'sheets', `${sheet}.png`))) tasks.push([id, sheet]);
  }
}
console.log(`${tasks.length} sheets queued`);
const run = ([id, sheet]) =>
  new Promise((resolve) => {
    const p = spawn(process.execPath, [join(here, 'gen.mjs'), id, sheet], { cwd: root, stdio: ['ignore', 'inherit', 'inherit'] });
    p.on('close', (code) => resolve(code === 0));
  });
const jobs = Math.max(1, Number(flags.jobs ?? 6));
let failed = 0;
await Promise.all(
  Array.from({ length: Math.min(jobs, tasks.length) }, async () => {
    while (tasks.length) if (!(await run(tasks.shift()))) failed++;
  }),
);
console.log(`batch done${failed ? `, ${failed} failed` : ''}`);
process.exitCode = failed ? 1 : 0;
