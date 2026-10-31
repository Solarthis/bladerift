// Art pipeline: rasterizes hand-authored SVG sources into Phaser atlases.
//
//   packages/client/art/<atlas>/*.svg        -> public/assets/gen/<atlas>.png + <atlas>.json (Phaser JSON hash)
//   packages/client/art/<name>-images/*.svg  -> public/assets/gen/<name>/<file>.png (one image each; big backgrounds)
//
// SVGs are authored in WORLD UNITS (1 unit = 1 world pixel; a tile is 32x32, a soldier ~48 tall).
// Everything is rendered at SCALE (2x) so it stays crisp on high-DPI phones; renderers display at 1/SCALE.
// Frame names are the file name without extension. An optional `data-pivot="x y"` attribute on the root
// <svg> (in world units) is exported as the frame pivot.
//
// Usage: node tools/build-art.mjs [--only=<atlas>] [--preview]
import { Resvg } from '@resvg/resvg-js';
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync, statSync, unlinkSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ART = join(root, 'packages/client/art');
const OUT = join(root, 'packages/client/public/assets/gen');
const SCALE = 2;
const PAD = 4; // room for mipmap levels (render.mipmapFilter): neighbours never bleed into a frame
const MAX = 4096;
const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? true]));

function parseSvg(file) {
  const src = readFileSync(file, 'utf8');
  const open = src.match(/<svg\b[^>]*>/s)?.[0];
  if (!open) throw new Error(`${file}: no <svg> root`);
  const attr = (n) => open.match(new RegExp(`\\s${n}="([^"]+)"`))?.[1];
  let w = parseFloat(attr('width') ?? 'NaN');
  let h = parseFloat(attr('height') ?? 'NaN');
  const vb = attr('viewBox')?.split(/[\s,]+/).map(Number);
  if ((!w || !h) && vb) [w, h] = [vb[2], vb[3]];
  if (!w || !h) throw new Error(`${file}: needs width/height or viewBox`);
  const pivot = attr('data-pivot')?.split(/\s+/).map(Number);
  return { src, w, h, vb: vb ?? [0, 0, w, h], pivot };
}

function render(svg, scale) {
  const r = new Resvg(svg, { fitTo: { mode: 'zoom', value: scale }, font: { loadSystemFonts: false }, shapeRendering: 2, imageRendering: 0 });
  return r.render().asPng();
}

/** Simple shelf packer, sorted by height. */
function pack(items) {
  items.sort((a, b) => b.ph - a.ph || b.pw - a.pw);
  let width = 256;
  const total = items.reduce((s, i) => s + (i.pw + PAD) * (i.ph + PAD), 0);
  while (width * width < total * 1.15 && width < MAX) width *= 2;
  for (;;) {
    let x = PAD, y = PAD, rowH = 0, ok = true;
    for (const it of items) {
      if (it.pw + PAD * 2 > width) { ok = false; break; }
      if (x + it.pw + PAD > width) { x = PAD; y += rowH + PAD; rowH = 0; }
      it.x = x; it.y = y;
      x += it.pw + PAD;
      rowH = Math.max(rowH, it.ph);
    }
    const height = y + rowH + PAD;
    if (ok && height <= MAX) return { width, height: 2 ** Math.ceil(Math.log2(height)) };
    if (width >= MAX) throw new Error('atlas overflow: split the folder');
    width *= 2;
  }
}

function buildAtlas(name, dir) {
  const files = readdirSync(dir).filter((f) => f.endsWith('.svg')).sort();
  if (!files.length) return;
  const items = files.map((f) => {
    const s = parseSvg(join(dir, f));
    return { name: basename(f, '.svg'), ...s, pw: Math.ceil(s.w * SCALE), ph: Math.ceil(s.h * SCALE) };
  });
  const { width, height } = pack(items);
  // Compose every frame into one SVG and rasterize once.
  const body = items
    .map((it) => {
      const inner = it.src.replace(/<\?xml[^>]*>/, '').replace(/<!DOCTYPE[^>]*>/, '');
      const nested = inner.replace(/<svg\b([^>]*)>/s, (m, a) => {
        const cleaned = a.replace(/\s(x|y|width|height|viewBox|preserveAspectRatio)="[^"]*"/g, '');
        return `<svg${cleaned} x="${it.x}" y="${it.y}" width="${it.pw}" height="${it.ph}" viewBox="${it.vb.join(' ')}" preserveAspectRatio="none">`;
      });
      return nested;
    })
    .join('\n');
  const sheet = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}">${body}</svg>`;
  const png = render(sheet, 1);
  const frames = {};
  for (const it of items) {
    frames[it.name] = {
      frame: { x: it.x, y: it.y, w: it.pw, h: it.ph },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: it.pw, h: it.ph },
      sourceSize: { w: it.pw, h: it.ph },
      ...(it.pivot ? { pivot: { x: it.pivot[0] / it.w, y: it.pivot[1] / it.h } } : {}),
    };
  }
  writeFileSync(join(OUT, `${name}.png`), png);
  writeFileSync(join(OUT, `${name}.json`), JSON.stringify({ frames, meta: { image: `${name}.png`, size: { w: width, h: height }, scale: String(SCALE), app: 'skyfire build-art' } }));
  console.log(`atlas ${name}: ${items.length} frames, ${width}x${height}, ${(png.length / 1024).toFixed(0)} KB`);
}

function buildImages(name, dir) {
  const outDir = join(OUT, name);
  mkdirSync(outDir, { recursive: true });
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.svg'))) {
    const s = parseSvg(join(dir, f));
    const scale = Number(s.src.match(/data-scale="([\d.]+)"/)?.[1] ?? SCALE);
    const png = render(s.src, scale);
    writeFileSync(join(outDir, basename(f, '.svg') + '.png'), png);
    console.log(`image ${name}/${basename(f, '.svg')}: ${(png.length / 1024).toFixed(0)} KB`);
  }
}

mkdirSync(OUT, { recursive: true });
const manifest = { atlases: [], images: {} };
for (const entry of readdirSync(ART)) {
  const dir = join(ART, entry);
  if (!statSync(dir).isDirectory()) continue;
  if (args.only && entry !== args.only && entry !== args.only + '-images') {
    if (entry.endsWith('-images')) manifest.images[entry.replace(/-images$/, '')] = readdirSync(dir).filter((f) => f.endsWith('.svg')).map((f) => basename(f, '.svg'));
    else if (existsSync(join(OUT, entry + '.json'))) manifest.atlases.push(entry);
    continue;
  }
  if (entry.endsWith('-images')) {
    const n = entry.replace(/-images$/, '');
    buildImages(n, dir);
    manifest.images[n] = readdirSync(dir).filter((f) => f.endsWith('.svg')).map((f) => basename(f, '.svg'));
  } else {
    buildAtlas(entry, dir);
    manifest.atlases.push(entry);
  }
}
// Content-hashed copies of every generated file: URLs change whenever art changes, so no browser,
// service worker or CDN can ever pair new frame data with a stale (or transformed) image.
manifest.hashed = {};
const HASHED = /\.[0-9a-f]{10}\.(png|json)$/;
const files = [];
for (const f of readdirSync(OUT)) {
  const full = join(OUT, f);
  if (statSync(full).isDirectory()) for (const g of readdirSync(full)) files.push(`${f}/${g}`);
  else files.push(f);
}
const keep = new Set(['manifest.json']);
for (const rel of files) {
  if (rel === 'manifest.json' || HASHED.test(rel) || !/\.(png|json)$/.test(rel)) continue;
  const buf = readFileSync(join(OUT, rel));
  const h = createHash('sha256').update(buf).digest('hex').slice(0, 10);
  const hashedRel = rel.replace(/\.(png|json)$/, `.${h}.$1`);
  writeFileSync(join(OUT, hashedRel), buf);
  manifest.hashed[rel] = hashedRel;
  keep.add(hashedRel);
}
for (const rel of files) if (HASHED.test(rel) && !keep.has(rel)) unlinkSync(join(OUT, rel));
writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1));
console.log('manifest:', JSON.stringify(manifest));

// --preview renders each SVG standalone at 4x into .cache/art-preview for visual inspection.
if (args.preview) {
  const pv = join(root, '.cache/art-preview');
  mkdirSync(pv, { recursive: true });
  for (const entry of readdirSync(ART)) {
    const dir = join(ART, entry);
    if (!statSync(dir).isDirectory() || (args.only && !entry.startsWith(args.only))) continue;
    for (const f of readdirSync(dir).filter((f) => f.endsWith('.svg'))) {
      const s = parseSvg(join(dir, f));
      writeFileSync(join(pv, `${entry}__${basename(f, '.svg')}.png`), render(s.src, entry.endsWith('-images') ? 1 : 4));
    }
  }
  console.log('previews in', pv);
}
