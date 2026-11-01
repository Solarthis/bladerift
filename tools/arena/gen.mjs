// Arena art with Codex's built-in image_gen (ChatGPT login, no API key): a back wall per arena (the floor is drawn in
// perspective by the game, render/arena.ts) and a seamless top-down floor texture per arena.
//
// Usage: node tools/arena/gen.mjs [names...] [--jobs=3] [--force]
// Outputs: art/arenas/<name>.png (+ .log). Install with tools/arena/install.py.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const CODEX = process.env.CODEX_BIN ?? 'C:/Users/vascu/RobloxPvP/tools/codex/bin/codex.exe';
const MODEL = process.env.CODEX_MODEL ?? 'gpt-6.1-sol';
const out = join(root, 'art', 'arenas');
mkdirSync(out, { recursive: true });

const STYLE = `Style: premium high-detail 2D pixel art for a side-view action game (crisp hand-placed pixels, about 3-4 screen pixels
per art pixel, rich dithering, painterly pixel shading), dark and atmospheric: low-key lighting, deep shadows, warm pools of light
from the light sources only. Muted, desaturated stone and wood colours; the light sources glow warm. No characters, no people, no
creatures, no text, no UI, no watermark, no border, no frame.`;

const WALL = `Composition: a straight-on side view of a BACK WALL, landscape 3:2, filling the whole image edge to edge. The bottom
7% of the image is the foot of the wall (a plinth or skirting course of stone) running the full width, ending in a perfectly
straight horizontal line at the very bottom edge: the floor itself is NOT in the image (the game draws the floor). Keep the lower
half of the wall quieter and darker (fighters stand in front of it); put the detail and light sources in the upper and middle
parts. Leave no bright spot larger than a lantern.`;

const FLOOR = `Composition: a perfectly SEAMLESS TILEABLE texture, square, seen straight from above (orthographic top-down, no
perspective), tiling both horizontally and vertically with no visible seam. Evenly lit: no vignette, no gradient, no spotlight,
no shadows from outside objects; the texture will be shaded by the game's own lighting. Mid-dark values overall.`;

const JOBS = {
  'wall-hall': `${WALL}
Subject: the inside of a grand dark medieval castle throne hall. Rough dark stone-block wall with square stone pilasters every
fifth of the width; between them, alternating: tall narrow gothic stained-glass windows (cold blue and teal glass, faint), long
crimson banners with a small gold crown emblem hanging from iron rods, framed oil paintings (a mountain landscape, a battle
scene), and iron wall sconces with warm candle flames lighting the stone around them. An iron candle chandelier hangs near the
top. A few cobwebs and cracked stones. ${STYLE}`,
  'wall-bridge': `${WALL}
Subject: a moonlit stone parapet of a castle bridge at night: the far side is a low crenellated stone parapet wall with arched
openings through which a misty night harbour, distant towers with lit windows and a big pale moon are visible; iron lanterns
with warm flames on posts along the parapet; cold blue moonlight, warm lantern pools. ${STYLE}`,
  'wall-embers': `${WALL}
Subject: the inner wall of a burning castle keep: scorched stone blocks, broken arrow slits glowing orange from fires beyond,
hanging chains, a torn black-and-red banner, iron braziers with flames, embers drifting, smoke in the upper half, a red-orange
glow from below the top edge. ${STYLE}`,
  'wall-crypt': `${WALL}
Subject: an ancient underground crypt wall: carved burial niches with skulls and urns, a stone sarcophagus relief, cracked
carved pillars, roots pushing through, moss, cold teal-green candle light from a few candles in the niches, deep blackness
between. ${STYLE}`,
  'wall-grove': `${WALL}
Subject: the edge of a misty ancient forest clearing at dusk seen as a wall of huge dark tree trunks with twisted roots and a low
mossy ruined stone wall along the bottom, hanging vines, a few glowing lanterns hung on branches and faint fireflies, cold mist
between the trunks, last pale-violet light through the canopy. ${STYLE}`,
  'floor-hall': `${FLOOR}
Subject: large rectangular worn grey-brown castle flagstones in staggered rows (about 3 stones across the tile), dark mortar
joints, chips, cracks and subtle wear. ${STYLE}`,
  'floor-bridge': `${FLOOR}
Subject: worn wet blue-grey cobblestone and flagstone bridge deck, rounded stones in staggered rows, dark joints, small puddles
reflecting nothing (flat). ${STYLE}`,
  'floor-embers': `${FLOOR}
Subject: scorched dark red-brown castle flagstones with soot, ash and a few hairline cracks, in staggered rows. ${STYLE}`,
  'floor-crypt': `${FLOOR}
Subject: ancient cracked grey-green crypt floor slabs with moss in the joints and faint carved runes on a few slabs, in staggered
rows. ${STYLE}`,
  'floor-grove': `${FLOOR}
Subject: a mossy forest floor path of sunken old flat stones among dark earth, moss, fallen leaves and small roots. ${STYLE}`,
};

const PROP = `Style: premium high-detail 2D pixel art for a side-view action game (crisp pixels, painterly pixel shading), lit
softly from above, muted desaturated colours matching a dark candlelit castle hall. Fully TRANSPARENT background (alpha), the object
only, centred, nothing else in the image: no floor, no shadow on the ground, no text, no watermark.`;
Object.assign(JOBS, {
  'ledge-hall': `A long straight horizontal castle gallery ledge seen exactly from the side (orthographic): a thick slab of dark
grey carved stone with a crimson runner with gold trim lying along its top edge, a carved stone moulding and small corbels under
it. Wide landscape: the ledge spans the FULL width of the image edge to edge (the left and right ends are cut straight so it can
be repeated side by side) and is only about one sixth of the image's height, vertically centred. ${PROP}`,
  'pillar-hall': `One tall square carved stone castle pillar seen straight from the front (orthographic): a moulded base, a
plain dark grey stone shaft built of large blocks with a carved gold-trimmed crimson banner bracket and an unlit iron ring halfway
up, and a carved capital at the top. Portrait: the pillar fills the image's full height from top edge to bottom edge and about a
quarter of its width, centred. ${PROP}`,
});

const args = process.argv.slice(2);
const flags = Object.fromEntries(args.filter((a) => a.startsWith('--')).map((a) => a.slice(2).split('=')).map(([k, v]) => [k, v ?? 'true']));
let names = args.filter((a) => !a.startsWith('--'));
if (!names.length) names = Object.keys(JOBS);
names = names.filter((n) => flags.force || !existsSync(join(out, `${n}.png`)));
const jobs = Number(flags.jobs ?? 3);

function run(name) {
  return new Promise((resolve) => {
    const file = join(out, `${name}.png`);
    const instr = `Use your built-in image_gen tool (not any CLI or script) to generate exactly ONE image as described below${name.startsWith('ledge') || name.startsWith('pillar') ? ', with a transparent background' : ''}, then copy
the generated PNG to
${file.replace(/\//g, '\\')}
and print the source path and the final path. Do not create or modify any other files.

${JOBS[name]}`;
    const t0 = Date.now();
    const p = spawn(CODEX, ['exec', '--skip-git-repo-check', '-m', MODEL, '--', instr], { cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let buf = '';
    p.stdout.on('data', (d) => (buf += d));
    p.stderr.on('data', (d) => (buf += d));
    p.on('close', (code) => {
      writeFileSync(join(out, `${name}.log`), buf);
      const ok = code === 0 && existsSync(file);
      console.log(`${name}: ${ok ? 'OK' : 'FAILED'} (${Math.round((Date.now() - t0) / 1000)} s)`);
      resolve(ok);
    });
  });
}

const queue = [...names];
await Promise.all(Array.from({ length: Math.min(jobs, queue.length) }, async () => {
  while (queue.length) await run(queue.shift());
}));
console.log('ALL DONE');
