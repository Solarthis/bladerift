// Package the online server for a Node.js host (Hostinger Node.js apps, any VPS): builds packages/server/dist/online.mjs
// (one self-contained file) and zips it with a minimal package.json whose start script runs it.
// Usage: node tools/pack-online.mjs [--out=../bladerift-online.zip]
// Upload the zip as a Hostinger Node.js web app (entry file online.mjs, no build command). See docs/online-server.md.
import { execSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync, copyFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Paths below are relative to the repo root, whatever directory the script was started from.
process.chdir(resolve(dirname(fileURLToPath(import.meta.url)), '..'));
const a = Object.fromEntries(process.argv.slice(2).map((x) => x.replace(/^--/, '').split('=')));
const out = resolve(a.out ?? '../bladerift-online.zip');
execSync('npm run build:online -w @bladerift/server', { stdio: 'inherit' });
const dir = resolve('.cache/online-pack');
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });
copyFileSync('packages/server/dist/online.mjs', `${dir}/online.mjs`);
writeFileSync(
  `${dir}/package.json`,
  JSON.stringify({ name: 'bladerift-online', version: '0.1.0', private: true, type: 'module', main: 'online.mjs', scripts: { start: 'node online.mjs' }, engines: { node: '>=20' } }, null, 2) + '\n',
);
rmSync(out, { force: true });
// bsdtar (Windows 10+, macOS) writes a zip when the name ends in .zip
// (on Windows use the system tar: a Git Bash tar earlier on PATH cannot write zips)
const tar = process.platform === 'win32' ? `"${join(process.env.SystemRoot ?? 'C:/Windows', 'System32', 'tar.exe')}"` : 'tar';
execSync(`${tar} -a -c -f "${out}" online.mjs package.json`, { cwd: dir, stdio: 'inherit' });
console.log(`packed ${out}`);
