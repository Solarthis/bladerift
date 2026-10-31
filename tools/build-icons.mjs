// Rasterize packages/client/art-src/icon.svg into the PWA / home-screen icons.
// Usage: node tools/build-icons.mjs
import { Resvg } from '@resvg/resvg-js';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(root, 'packages/client/art-src/icon.svg'), 'utf8');
const outDir = join(root, 'packages/client/public/icons');
mkdirSync(outDir, { recursive: true });

/** "any" purpose icons get rounded corners with an ink rim; maskable / apple stay full-bleed. */
function rounded(svg) {
  const clip = '<clipPath id="round"><rect width="512" height="512" rx="112"/></clipPath>';
  return svg
    .replace('<defs>', `<defs>${clip}`)
    .replace('<g id="art">', '<g clip-path="url(#round)"><g id="art">')
    .replace(/<\/svg>\s*$/, '</g><rect x="6" y="6" width="500" height="500" rx="106" fill="none" stroke="#1b1420" stroke-width="12"/></svg>');
}

const jobs = [
  { file: 'icon-192.png', size: 192, svg: rounded(src) },
  { file: 'icon-512.png', size: 512, svg: rounded(src) },
  { file: 'icon-maskable-512.png', size: 512, svg: src },
  { file: 'icon-maskable-192.png', size: 192, svg: src },
  { file: 'apple-touch-icon.png', size: 180, svg: src },
];
for (const j of jobs) {
  const png = new Resvg(j.svg, { fitTo: { mode: 'width', value: j.size }, background: 'rgba(0,0,0,0)' }).render().asPng();
  writeFileSync(join(outDir, j.file), png);
  console.log('wrote', j.file, png.length, 'bytes');
}
