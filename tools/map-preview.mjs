// Renders every map (or --only=<id>) from packages/shared/src/maps/*.ts to .cache/maps/<id>.png
// so level designers can SEE layouts. Colours: solid=brown, platform=orange, spawn=green dot,
// pickups=lettered markers, decor=small grey dots. Also prints reachability warnings.
// Usage: node tools/map-preview.mjs [--only=jungle]
import { Resvg } from '@resvg/resvg-js';
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'packages/shared/src/maps');
const out = join(root, '.cache/maps');
mkdirSync(out, { recursive: true });
const only = process.argv.find((a) => a.startsWith('--only='))?.split('=')[1];
const T = 10;
const COL = { A: '#9bd35a', M: '#5ac8d3', G: '#d39b5a', N: '#b07cff', R: '#ff6a5a', B: '#7a8f4a', H: '#ffffff' };

for (const f of readdirSync(dir).filter((f) => f.endsWith('.ts') && f !== 'index.ts')) {
  const src = readFileSync(join(dir, f), 'utf8');
  const id = src.match(/id:\s*'([^']+)'/)?.[1];
  if (only && id !== only) continue;
  const rows = [...src.matchAll(/^\s*'([^']*)',?\s*$/gm)].map((m) => m[1].replaceAll('\\\\', '\\')).filter((r) => r.length > 20);
  const H = rows.length;
  const W = Math.max(...rows.map((r) => r.length));
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W * T}" height="${H * T}"><rect width="100%" height="100%" fill="#8ccfee"/>`;
  const warnings = [];
  const at = (x, y) => rows[y]?.[x] ?? '#';
  rows.forEach((r, y) => {
    for (let x = 0; x < W; x++) {
      const c = r[x] ?? '.';
      if (c === '#') svg += `<rect x="${x * T}" y="${y * T}" width="${T}" height="${T}" fill="#6b4a2b"/>`;
      else if (c === '/') svg += `<polygon points="${x * T},${y * T + T} ${x * T + T},${y * T} ${x * T + T},${y * T + T}" fill="#8a6238"/>`;
      else if (c === '\\') svg += `<polygon points="${x * T},${y * T} ${x * T + T},${y * T + T} ${x * T},${y * T + T}" fill="#8a6238"/>`;
      else if (c === '=') svg += `<rect x="${x * T}" y="${y * T}" width="${T}" height="${T * 0.4}" fill="#f0a040"/>`;
      else if (c === 'P') {
        svg += `<circle cx="${x * T + T / 2}" cy="${y * T + T / 2}" r="${T * 0.45}" fill="#1fbf4a" stroke="#000"/>`;
        if (!'#='.includes(at(x, y + 1))) warnings.push(`spawn at ${x},${y} is floating`);
        if (at(x, y - 1) === '#') warnings.push(`spawn at ${x},${y} has a ceiling directly above (player is 2 tiles tall)`);
      } else if (COL[c]) {
        svg += `<rect x="${x * T + 1}" y="${y * T + 1}" width="${T - 2}" height="${T - 2}" fill="${COL[c]}" stroke="#000"/><text x="${x * T + T / 2}" y="${y * T + T - 2}" font-size="8" text-anchor="middle" font-family="sans-serif">${c}</text>`;
      } else if (c >= 'a' && c <= 'z') svg += `<circle cx="${x * T + T / 2}" cy="${y * T + T / 2}" r="2" fill="#444"/>`;
    }
  });
  // 1-tile gaps are useless for a 22x44 player: flag horizontal tunnels shorter than 2 tiles of headroom.
  for (let y = 1; y < H - 1; y++)
    for (let x = 1; x < W - 1; x++)
      if (at(x, y) !== '#' && at(x, y) !== '=' && at(x, y - 1) === '#' && at(x, y + 1) === '#') warnings.push(`1-tile-high gap at ${x},${y} (players cannot fit)`);
  svg += `</svg>`;
  const png = new Resvg(svg, { font: { loadSystemFonts: true } }).render().asPng();
  writeFileSync(join(out, `${id}.png`), png);
  console.log(`${id}: ${W}x${H} tiles -> .cache/maps/${id}.png`);
  for (const w of warnings.slice(0, 30)) console.log('  ! ' + w);
}
