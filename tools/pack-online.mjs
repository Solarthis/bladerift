// Package the online server for a Node.js host (Hostinger Node.js apps, any VPS): builds packages/server/dist/online.mjs
// (one self-contained file) and zips it with a minimal package.json whose start script runs it.
// Usage: node tools/pack-online.mjs [--out=../skyfire-online.zip]
import { execSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync, copyFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const a = Object.fromEntries(process.argv.slice(2).map((x) => x.replace(/^--/, '').split('=')));
const out = resolve(a.out ?? '../skyfire-online.zip');
execSync('npm run build:online -w @bladerift/server', { stdio: 'inherit' });
const dir = resolve('.cache/online-pack');
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });
copyFileSync('packages/server/dist/online.mjs', `${dir}/online.mjs`);
writeFileSync(
  `${dir}/package.json`,
  JSON.stringify({ name: 'skyfire-online', version: '1.0.0', private: true, type: 'module', main: 'online.mjs', scripts: { start: 'node online.mjs' }, engines: { node: '>=20' } }, null, 2) + '\n',
);
rmSync(out, { force: true });
// bsdtar (Windows 10+, macOS) writes a zip when the name ends in .zip
// (on Windows use the system tar: a Git Bash tar earlier on PATH cannot write zips)
const tar = process.platform === 'win32' ? `"${join(process.env.SystemRoot ?? 'C:/Windows', 'System32', 'tar.exe')}"` : 'tar';
execSync(`${tar} -a -c -f "${out}" online.mjs package.json`, { cwd: dir, stdio: 'inherit' });
console.log(`packed ${out}`);
