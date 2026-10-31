// Generator for the `fx` atlas (combat effects). Writes one SVG per frame next to this file.
//   node packages/client/art/fx/gen-fx.mjs && node tools/build-art.mjs --only=fx --preview
//
// Style: ART_DIRECTION.md. Solid effects (fireballs, smoke, splats, debris, casings, impact stars, markers)
// are cel-shaded with an ink or dark-tone outline and light from the top left. Pure light (glows, tracers,
// beams, flares) uses soft radial/linear falloff because it is emitted light, not a shaded surface;
// those frames are white so the renderer can tint them per weapon/team and draw them additively.
// Greyscale frames (smoke, puffs, debris, ring, star) are multiplied by a tint at runtime.
import { writeFileSync, readdirSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = dirname(fileURLToPath(import.meta.url));
const INK = '#1b1420';
const f = (n) => +n.toFixed(2);

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const out = {};
function svg(name, w, h, body, pivot = [w / 2, h / 2], defs = '') {
  out[name] = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" data-pivot="${f(pivot[0])} ${f(pivot[1])}">${defs ? `<defs>${defs}</defs>` : ''}
  <g transform="translate(${f(pivot[0])} ${f(pivot[1])})" stroke-linejoin="round" stroke-linecap="round">
${body}
  </g>
</svg>
`;
}

/** Star polygon with `n` points, alternating outer radius (jittered) and inner radius. */
function starPath(n, ro, ri, seed, jit = 0.25, rot = -Math.PI / 2) {
  const r = rng(seed);
  const pts = [];
  for (let i = 0; i < n * 2; i++) {
    const outer = i % 2 === 0;
    const a = rot + (i / (n * 2)) * Math.PI * 2 + (r() - 0.5) * (outer ? jit * 0.5 : jit * 0.3);
    const rr = outer ? ro * (1 - jit + r() * jit) : ri * (0.9 + r() * 0.2);
    pts.push(`${f(Math.cos(a) * rr)} ${f(Math.sin(a) * rr)}`);
  }
  return `M${pts.join(' L')} Z`;
}

/** Scale a path's numbers (used to derive nested cel layers from one silhouette). */
function scalePath(d, s, ox = 0, oy = 0) {
  let i = 0;
  return d.replace(/-?\d+(\.\d+)?/g, (m) => {
    const v = parseFloat(m);
    const r = i++ % 2 === 0 ? v * s + ox : v * s + oy;
    return String(f(r));
  });
}

/** Lumpy cloud made of circles: [{x, y, r}] spanning roughly radius R. */
function lumps(seed, n, R) {
  const r = rng(seed);
  const c = [{ x: 0, y: 0, r: R * 0.6 }];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + (r() - 0.5) * 0.7;
    const d = R * (0.42 + r() * 0.16);
    c.push({ x: Math.cos(a) * d, y: Math.sin(a) * d, r: R * (0.34 + r() * 0.16) });
  }
  return c;
}
function circles(cs, fill, s = 1, ox = 0, oy = 0, grow = 0, keep = () => true, extra = '') {
  return cs
    .filter(keep)
    .map((c) => `<circle cx="${f(c.x * s + ox)}" cy="${f(c.y * s + oy)}" r="${f(Math.max(0.3, c.r * s + grow))}" fill="${fill}"${extra}/>`)
    .join('');
}

// ---------------------------------------------------------------------------------------------- light
// glow: soft round light (additive, tintable)
svg('glow', 64, 64, `    <circle r="31" fill="url(#g)"/>`, [32, 32],
  `<radialGradient id="g"><stop offset="0" stop-color="#fff" stop-opacity="1"/><stop offset="0.18" stop-color="#fff" stop-opacity="0.85"/><stop offset="0.45" stop-color="#fff" stop-opacity="0.32"/><stop offset="0.75" stop-color="#fff" stop-opacity="0.08"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>`);

// shadow: soft contact shadow ellipse (normal blend)
svg('shadow', 40, 12, `    <ellipse rx="19.5" ry="5.6" fill="url(#s)"/>`, [20, 6],
  `<radialGradient id="s"><stop offset="0" stop-color="${INK}" stop-opacity="0.85"/><stop offset="0.55" stop-color="${INK}" stop-opacity="0.6"/><stop offset="1" stop-color="${INK}" stop-opacity="0"/></radialGradient>`);

// streak: tracer bolt, bright head at the pivot (right), tail fading left. Width 8, length 64.
svg('streak', 64, 8, `    <path d="M-64 0 L-14 -2.9 Q0 -3.2 0 0 Q0 3.2 -14 2.9 Z" fill="url(#t1)"/>
    <path d="M-60 0 L-12 -1.3 Q-1 -1.5 -1 0 Q-1 1.5 -12 1.3 Z" fill="url(#t2)"/>`, [64, 4],
  `<linearGradient id="t1" x1="-64" y1="0" x2="0" y2="0" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.6" stop-color="#fff" stop-opacity="0.35"/><stop offset="1" stop-color="#fff" stop-opacity="0.7"/></linearGradient>
   <linearGradient id="t2" x1="-60" y1="0" x2="0" y2="0" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.45" stop-color="#fff" stop-opacity="0.8"/><stop offset="1" stop-color="#fff" stop-opacity="1"/></linearGradient>`);

// beam: uniform light line, pivot at the left end; stretched between two points (sniper beam / trail)
svg('beam', 64, 8, `    <rect x="0" y="-4" width="64" height="8" fill="url(#b)"/>`, [0, 4],
  `<linearGradient id="b" x1="0" y1="-4" x2="0" y2="4" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.3" stop-color="#fff" stop-opacity="0.45"/><stop offset="0.5" stop-color="#fff" stop-opacity="1"/><stop offset="0.7" stop-color="#fff" stop-opacity="0.45"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>`);

// flare: horizontal lens streak for strong muzzle flashes
svg('flare', 64, 16, `    <ellipse rx="31" ry="7.5" fill="url(#fl)"/><ellipse rx="22" ry="1.6" fill="#fff"/>`, [32, 8],
  `<radialGradient id="fl"><stop offset="0" stop-color="#fff" stop-opacity="0.9"/><stop offset="0.35" stop-color="#fff" stop-opacity="0.35"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>`);

// spark: hot sliver, head at pivot (right). Tinted warm and drawn additively, stretched with speed.
svg('spark', 16, 4, `    <path d="M-16 0 L-4 -1.5 Q0 -1.6 0 0 Q0 1.6 -4 1.5 Z" fill="#fff" fill-opacity="0.55"/>
    <path d="M-13 0 L-3 -0.8 Q-0.6 -0.8 -0.6 0 Q-0.6 0.8 -3 0.8 Z" fill="#fff"/>`, [16, 2]);

// ring: shockwave / spawn ring (white, tintable)
svg('ring', 128, 128, `    <circle r="58" fill="none" stroke="#fff" stroke-opacity="0.25" stroke-width="10"/>
    <circle r="60" fill="none" stroke="#fff" stroke-opacity="0.6" stroke-width="5"/>
    <circle r="61" fill="none" stroke="#fff" stroke-width="2.4"/>`, [64, 64]);

// star4: four-point twinkle (pickup sparkle, spawn glints, headshot sparkles)
svg('star4', 24, 24, `    <path d="M0 -11 Q1.6 -1.6 11 0 Q1.6 1.6 0 11 Q-1.6 1.6 -11 0 Q-1.6 -1.6 0 -11 Z" fill="#fff" fill-opacity="0.55"/>
    <path d="M0 -8 Q1 -1 8 0 Q1 1 0 8 Q-1 1 -8 0 Q-1 -1 0 -8 Z" fill="#fff"/>
    <circle r="2.4" fill="#fff"/>`, [12, 12]);

// ---------------------------------------------------------------------------------------------- impact stars
{
  const d = starPath(8, 14, 6.2, 11, 0.32);
  svg('pow', 32, 32, `    <path d="${d}" fill="#fff6c9" stroke="${INK}" stroke-width="1.8"/>
    <path d="${scalePath(d, 0.62, -0.8, -0.8)}" fill="#ffffff"/>
    <path d="${scalePath(d, 0.3, -0.6, -0.6)}" fill="#ffd25e"/>`, [16, 16]);
}
{
  const d = starPath(10, 18.5, 8.6, 23, 0.26);
  svg('pow_gold', 40, 40, `    <path d="${d}" fill="#f29a1f" stroke="${INK}" stroke-width="2"/>
    <path d="${scalePath(d, 0.86, -0.9, -0.9)}" fill="#ffd23f"/>
    <path d="${scalePath(d, 0.5, -1.4, -1.4)}" fill="#fff1a8"/>
    <path d="${scalePath(d, 0.22, -1, -1)}" fill="#ffffff"/>`, [20, 20]);
}
{
  // burst: the frame-one explosion flash (no ink: it is light), irregular 12 spikes
  const d = starPath(12, 46, 22, 5, 0.38);
  svg('burst', 96, 96, `    <path d="${d}" fill="#ff8a1f"/>
    <path d="${scalePath(d, 0.8, -1.5, -1.5)}" fill="#ffd25e"/>
    <path d="${scalePath(d, 0.55, -2, -2)}" fill="#fff6c9"/>
    <circle cx="-2" cy="-2" r="11" fill="#ffffff"/>`, [48, 48]);
}

// ---------------------------------------------------------------------------------------------- fireball flipbook
{
  const R = 29;
  const base = lumps(7, 7, R);
  // [outline, outer, mid, inner, core] colours + scales per frame; later frames darken into smoke.
  const frames = [
    { s: 0.72, layers: [['#c2361b', 1], ['#ff8a1f', 0.93], ['#ffd25e', 0.8], ['#fff6c9', 0.62], ['#ffffff', 0.34]] },
    { s: 0.9, layers: [['#a52a18', 1], ['#e2401f', 0.94], ['#ff8a1f', 0.8], ['#ffd25e', 0.58], ['#fff6c9', 0.3]] },
    { s: 1, layers: [['#6e2a22', 1], ['#c8361e', 0.94], ['#ff6a1f', 0.76], ['#ffb43e', 0.48], ['#ffe9a0', 0.2]], smoke: 0.25 },
    { s: 1.04, layers: [['#3e2a2c', 1], ['#7a3a2c', 0.94], ['#b8401f', 0.66], ['#f2782a', 0.36], ['#ffc65a', 0.14]], smoke: 0.55 },
    { s: 1.08, layers: [['#2e2428', 1], ['#5a4646', 0.94], ['#6e5150', 0.62], ['#8c4a32', 0.26], ['#d0602a', 0.1]], smoke: 1, holes: true },
  ];
  frames.forEach((fr, i) => {
    let body = '';
    const cs = base.map((c) => ({ ...c }));
    if (fr.smoke) {
      // dark smoke billows rising behind the top of the fireball
      const sm = lumps(31 + i, 4, R * 0.5);
      const k = fr.s * (0.55 + fr.smoke * 0.45);
      const oy = -R * (0.45 + fr.smoke * 0.15) * fr.s;
      body += circles(sm, '#2a2024', k, R * 0.12, oy, 1.4);
      body += circles(sm, '#4a3c40', k, R * 0.12, oy);
      body += circles(sm, '#625256', k * 0.55, R * 0.12 - 2, oy - 2, 0, (c, j) => j % 2 === 0);
    }
    const keep = fr.holes ? (_c, j) => j % 3 !== 1 : () => true;
    fr.layers.forEach(([col, s], k) => {
      const off = -k * 1.6 * fr.s; // shift inner (lit) layers toward the top left
      const grow = k === 0 ? 1.4 : 0;
      body += circles(cs, col, fr.s * s, off, off, grow, keep);
    });
    svg(`fire_${i}`, 64, 64, `    ${body}`, [32, 32]);
  });
}

// ---------------------------------------------------------------------------------------------- smoke / puffs (greyscale, tinted)
function cloud(name, size, seed, n) {
  const R = size * 0.42;
  const cs = lumps(seed, n, R);
  const body =
    circles(cs, '#8d8598', 1, 0, 0, 1.1) + // soft dark rim (multiplied by the tint)
    circles(cs, '#c3bbcc', 1) + // cool shadow side
    circles(cs, '#ece8f0', 0.84, -R * 0.1, -R * 0.12) + // base
    circles(cs, '#ffffff', 0.4, -R * 0.3, -R * 0.32, 0, (c, j) => j % 2 === 0); // top-left highlight
  svg(name, size, size, `    ${body}`, [size / 2, size / 2]);
}
cloud('smoke_0', 48, 101, 6);
cloud('smoke_1', 48, 202, 7);
cloud('smoke_2', 48, 303, 5);
cloud('puff_0', 20, 404, 5);
cloud('puff_1', 20, 505, 4);

// ---------------------------------------------------------------------------------------------- debris (greyscale + ink, tinted per theme)
function chunk(name, seed, n, R, w, h) {
  const r = rng(seed);
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + (r() - 0.5) * 0.5;
    const rr = R * (0.7 + r() * 0.35);
    pts.push([Math.cos(a) * rr, Math.sin(a) * rr * 0.85]);
  }
  const d = 'M' + pts.map((p) => `${f(p[0])} ${f(p[1])}`).join(' L') + ' Z';
  svg(name, w, h, `    <path d="${d}" fill="#8f8799" stroke="${INK}" stroke-width="1.4"/>
    <path d="${scalePath(d, 0.72, -R * 0.14, -R * 0.16)}" fill="#cdc6d2"/>
    <path d="${scalePath(d, 0.3, -R * 0.32, -R * 0.34)}" fill="#f4f1f6"/>`);
}
chunk('debris_0', 3, 6, 4.4, 12, 12);
chunk('debris_1', 9, 5, 3.4, 10, 10);
chunk('debris_2', 17, 7, 5.6, 14, 14);
chunk('debris_3', 29, 4, 2.6, 8, 8);

// ---------------------------------------------------------------------------------------------- hit splats (stylised, cartoon)
function splat(name, seed) {
  const r = rng(seed);
  // central blob + tapered spikes + a couple of detached droplets (cartoon "splash", not gore)
  let ink = '';
  let fill = '';
  const n = 6 + Math.floor(r() * 2);
  const drops = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + (r() - 0.5) * 0.6;
    const L = 7.5 + r() * 5;
    const w = 1.9 + r() * 1;
    const ca = Math.cos(a), sa = Math.sin(a), px = -sa, py = ca;
    const d = `M${f(px * w * 1.7)} ${f(py * w * 1.7)} Q${f(ca * L * 0.55 + px * w * 0.8)} ${f(sa * L * 0.55 + py * w * 0.8)} ${f(ca * L)} ${f(sa * L)} Q${f(ca * L * 0.55 - px * w * 0.8)} ${f(sa * L * 0.55 - py * w * 0.8)} ${f(-px * w * 1.7)} ${f(-py * w * 1.7)} Z`;
    ink += `<path d="${d}" fill="${INK}" stroke="${INK}" stroke-width="2.2"/>`;
    fill += `<path d="${d}" fill="#d8344a"/>`;
    if (i % 3 === 0) drops.push([ca * (L + 3.2), sa * (L + 3.2), 1.1 + r() * 0.6]);
  }
  const blob = lumps(seed + 1, 5, 6);
  ink += circles(blob, INK, 1, 0, 0, 1.1);
  fill += circles(blob, '#d8344a', 1);
  for (const [x, y, rr] of drops) {
    ink += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(rr + 1)}" fill="${INK}"/>`;
    fill += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(rr)}" fill="#d8344a"/>`;
  }
  const shade = circles(blob, '#a8213c', 0.72, 1.3, 1.5) + circles(blob, '#e04456', 0.6, -0.8, -0.8) +
    `<circle cx="-2.6" cy="-2.8" r="1.6" fill="#ff8c98"/><circle cx="-0.6" cy="-3.9" r="0.7" fill="#ffd0d4"/>`;
  svg(name, 32, 32, `    ${ink}${fill}${shade}`, [16, 16]);
}
splat('splat_0', 41);
splat('splat_1', 77);
// splat_decal: flattened cartoon splash lying on a floor (no ink: it is a stain on the surface)
{
  const r = rng(91);
  let body = '';
  const blob = [{ x: 0, y: 0, r: 5.4 }, { x: -6, y: 0.6, r: 3.6 }, { x: 6.4, y: 0.2, r: 3.8 }, { x: -11, y: 1, r: 1.8 }, { x: 12, y: 0.8, r: 2 }];
  const drops = [];
  for (let i = 0; i < 6; i++) drops.push({ x: (r() - 0.5) * 34, y: (r() - 0.5) * 4, r: 0.7 + r() * 1.1 });
  const sq = (cs, col, k = 1, ox = 0, oy = 0) => cs.map((c) => `<ellipse cx="${f(c.x * k + ox)}" cy="${f(c.y * 0.42 * k + oy)}" rx="${f(c.r * k)}" ry="${f(c.r * 0.42 * k)}" fill="${col}"/>`).join('');
  body += sq(blob, '#7e1a2e', 1.08) + sq(drops, '#7e1a2e', 1.15);
  body += sq(blob, '#c42a40') + sq(drops, '#c42a40');
  body += sq(blob.slice(0, 3), '#e04456', 0.62, -1.2, -0.5);
  body += `<ellipse cx="-2.4" cy="-0.9" rx="1.6" ry="0.6" fill="#ff8c98"/>`;
  svg('splat_decal', 40, 12, `    ${body}`, [20, 6]);
}
svg('drop', 10, 6, `    <path d="M-7.5 0 Q-3 -2.4 0 -2.2 Q2.2 -2 2.2 0 Q2.2 2 0 2.2 Q-3 2.4 -7.5 0 Z" fill="#d8344a" stroke="${INK}" stroke-width="0.9"/>
    <circle cx="-0.2" cy="-0.8" r="0.8" fill="#ff8c98"/>`, [7.5, 3]);

// ---------------------------------------------------------------------------------------------- casings
svg('casing', 8, 4, `    <rect x="-3.2" y="-1.3" width="6.4" height="2.6" rx="0.8" fill="#b07a22" stroke="${INK}" stroke-width="0.8"/>
    <rect x="-2.8" y="-1.1" width="5.4" height="1.2" rx="0.5" fill="#f2c14e"/>
    <rect x="-2.2" y="-0.95" width="2.6" height="0.55" rx="0.27" fill="#fff0b0"/>`, [4, 2]);
svg('shell', 10, 6, `    <rect x="-4.2" y="-1.9" width="8.4" height="3.8" rx="1" fill="#9e2a22" stroke="${INK}" stroke-width="0.9"/>
    <rect x="-3.8" y="-1.6" width="5.6" height="1.6" rx="0.6" fill="#e0483e"/>
    <rect x="1.6" y="-1.9" width="2.6" height="3.8" rx="0.6" fill="#c08a2a" stroke="${INK}" stroke-width="0.9"/>
    <rect x="1.9" y="-1.5" width="1.6" height="1.2" rx="0.4" fill="#f2c14e"/>`, [5, 3]);

// ---------------------------------------------------------------------------------------------- ground decal
{
  const r = rng(13);
  const ring = (rx, ry, jit) => {
    const pts = [];
    const n = 22;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const k = 1 - jit + r() * jit;
      pts.push(`${f(Math.cos(a) * rx * k)} ${f(Math.sin(a) * ry * k)}`);
    }
    return `M${pts.join(' L')} Z`;
  };
  svg('scorch', 80, 24, `    <path d="${ring(39, 11, 0.35)}" fill="#24181a" fill-opacity="0.35"/>
    <path d="${ring(28, 8, 0.3)}" fill="#1b1214" fill-opacity="0.45"/>
    <path d="${ring(15, 4.6, 0.25)}" fill="#120c0e" fill-opacity="0.55"/>`, [40, 12]);
}

// ---------------------------------------------------------------------------------------------- player markers
// chevron: local-player marker (cream, ink outlined), points down at the soldier
svg('chevron', 18, 14, `    <path d="M-7.5 -5 L0 1.2 L7.5 -5 L7.5 0.4 L0 6.4 L-7.5 0.4 Z" fill="#fff1c9" stroke="${INK}" stroke-width="2"/>
    <path d="M-6.2 -2.6 L0 2.6 L6.2 -2.6" fill="none" stroke="#ffffff" stroke-width="0.9"/>`, [9, 7]);
// ally: team-coloured diamond (white, tinted)
svg('marker_ally', 12, 12, `    <path d="M0 -4.6 L4.6 0 L0 4.6 L-4.6 0 Z" fill="#ffffff" stroke="${INK}" stroke-width="1.6"/>
    <path d="M0 -2.6 L2 -0.6 L0 -0.2 L-2 -0.6 Z" fill="#ffffff"/>`, [6, 6]);
// enemy: downward tick (white, tinted with the enemy's team colour; the shape carries the relation)
svg('marker_enemy', 12, 10, `    <path d="M-4.2 -2.8 L4.2 -2.8 L0 3.2 Z" fill="#ffffff" stroke="${INK}" stroke-width="1.6"/>
    <path d="M-2.2 -1.6 L2.2 -1.6 L0 0.4 Z" fill="#ffffff"/>`, [6, 5]);

// ---------------------------------------------------------------------------------------------- write
for (const old of readdirSync(DIR)) if (old.endsWith('.svg')) unlinkSync(join(DIR, old));
for (const [name, src] of Object.entries(out)) writeFileSync(join(DIR, `${name}.svg`), src);
console.log(`fx: wrote ${Object.keys(out).length} frames`);
