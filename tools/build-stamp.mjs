// Build fingerprint for the Windows launcher: hashes every input of the production build.
//   node tools/build-stamp.mjs check  -> exit 0 if the existing build matches the sources, 1 otherwise
//   node tools/build-stamp.mjs write  -> record the fingerprint after a successful build
//   node tools/build-stamp.mjs node   -> exit 0 if this Node.js satisfies Vite (^20.19 or >=22.12)
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const STAMP = join(root, 'packages/client/dist/.build-stamp');
const INPUTS = ['package-lock.json', 'packages/shared/src', 'packages/server/src', 'packages/client/src', 'packages/client/art', 'packages/client/public', 'packages/client/index.html', 'packages/client/vite.config.ts', 'tools/build-art.mjs'];

function walk(p, out) {
  const full = join(root, p);
  if (!existsSync(full)) return;
  if (statSync(full).isDirectory()) for (const f of readdirSync(full).sort()) walk(join(p, f), out);
  else out.push(p);
}
function fingerprint() {
  const files = [];
  for (const i of INPUTS) walk(i, files);
  const h = createHash('sha256');
  for (const f of files) h.update(f.split(sep).join('/')).update(readFileSync(join(root, f)));
  return h.digest('hex');
}

const cmd = process.argv[2];
if (cmd === 'node') {
  const [maj, min] = process.versions.node.split('.').map(Number);
  process.exit((maj === 20 && min >= 19) || (maj === 22 && min >= 12) || maj >= 23 ? 0 : 1);
}
if (cmd === 'write') {
  writeFileSync(STAMP, fingerprint());
  process.exit(0);
}
const ok = existsSync(STAMP) && existsSync(join(root, 'packages/server/dist/server.mjs')) && readFileSync(STAMP, 'utf8') === fingerprint();
process.exit(ok ? 0 : 1);
