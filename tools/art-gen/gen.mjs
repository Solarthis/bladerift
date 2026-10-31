// Bladerift art: generate source images with Codex's built-in image_gen (ChatGPT login, no API key).
//
// Usage: node tools/art-gen/gen.mjs <names...>   (names: see JOBS below; always name them - existing outputs are overwritten)
// Outputs go to tools/art-gen/source/<name>.png with a log beside them; prompts are recorded in source/manifest.json.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const SRC = join(here, 'source');
const CP_REF = join(root, 'tools', 'character-pipeline', 'references');
const CODEX = process.env.CODEX_BIN ?? 'C:/Users/vascu/RobloxPvP/tools/codex/bin/codex.exe';
mkdirSync(SRC, { recursive: true });

const ITEM_RULES = `Rules for the whole sheet:
- Strict orthographic SIDE VIEW. No perspective.
- Every item sits alone in its own grid cell, centred, with wide empty transparent space around it. Items never touch or overlap.
- Style: polished hand-painted 2D action-game art matching the attached reference's linework and shading: clean confident dark
  linework (not thick black outlines), crisp two- to three-tone cel shading, light from the top-left, subtle highlights.
- Fully transparent background. NO hands, NO people, NO glow, NO motion trails, NO drop shadows, NO halos, NO text, NO labels.
- Image size 1536x1024 (landscape).`;

const ARENA_RULES = `Rules:
- A 2D side-scrolling game BACKGROUND for a one-on-one duelling arena, painted in a rich, atmospheric, painterly
  pixel-art-inspired style with soft light shafts and depth haze (distant layers bluer and lighter).
- Wide landscape composition, image size 1536x1024. The horizon and main structures sit in the upper two thirds.
- The bottom fifth of the image must be a calm, dark, mostly flat band (the game draws its own floor over it).
- The centre must stay open and uncluttered so two small fighters remain readable in front of it.
- NO characters, NO creatures, NO people, NO text, NO user interface, NO frames or borders.`;

const JOBS = {
  weapons: {
    ref: 'weapons-style-v2.png',
    prompt: `The attached image is a STYLE reference only (linework and shading). Generate a game-ready sheet of EIGHT original medieval-fantasy
weapons for a 2D duelling game, laid out as a grid of exactly 2 rows x 4 columns. Every weapon is perfectly HORIZONTAL with its handle /
grip on the LEFT and the business end pointing RIGHT, as if lying flat on a table seen from directly above its side:
Row 1: (1) a large war SCYTHE: long dark ash-wood shaft with leather wraps, a huge curved steel blade at the RIGHT end curving downward,
       a small bronze collar; (2) a knight's LANCE / long spear: long slim shaft with a bronze rondel hand guard near the left third and a
       long leaf-shaped steel spearhead at the right; (3) a LONGSWORD: leather-wrapped grip and round pommel at the left, a plain steel
       crossguard, a long straight double-edged blade with a fuller pointing right; (4) a WAR HAMMER: a long iron-banded wooden haft with
       a heavy square steel hammer head at the right end, head oriented vertically (striking faces up and down).
Row 2: (5) one curved DAGGER: short leather grip, small guard, curved blade pointing right; (6) a recurve longBOW drawn as seen from the
       side with the bow standing VERTICALLY (limbs up and down, string on the LEFT side, grip in the middle); (7) a TOWER SHIELD seen from
       the FRONT: a tall rounded-top kite shield standing vertically, steel rim, painted deep teal field with a simple bronze star boss; (8) a single ARROW, horizontal, fletching on the left, steel head pointing right.
Colour: weathered steel, dark wood, brown leather, small bronze accents; the blades are bright enough to read against dark backgrounds.

${ITEM_RULES}`,
  },
  skills: {
    ref: 'weapons-style-v2.png',
    prompt: `The attached image is a STYLE reference only (linework and shading). Generate a game-ready sheet of EIGHT original fantasy items for
a 2D duelling game, laid out as a grid of exactly 2 rows x 4 columns:
Row 1: (1) a round black-iron FIRE BOMB with a short lit fuse and a small brass cap, (2) a FROST SHARD: a sharp elongated ice crystal
       bolt lying horizontally, point RIGHT, pale cyan and white, (3) a SNARE TRAP: an open iron bear-trap seen from the side, jaws open,
       lying flat, (4) a BLINK RUNE: a flat round violet runestone with a glowing-looking (painted, not actual glow) arcane symbol.
Row 2: (5) a small glass HEALTH FLASK with a cork, filled with bright red liquid, (6) a small pile of ORANGE EMBERS / a flame flick
       for a burn effect (painted, no glow), (7) a closed SNARE TRAP (jaws snapped shut), (8) a cracked ICE CHUNK.

${ITEM_RULES}`,
  },
  bridge: {
    prompt: `${ARENA_RULES}
Scene: a ruined stone ARCH BRIDGE high above a misty harbour at night, a huge pale full moon low behind it, silhouettes of tall sailing
ship masts and ropes in the haze, distant city spires, cool blue and violet palette with warm moonlight glow.`,
  },
  embers: {
    prompt: `${ARENA_RULES}
Scene: the battlements of a BURNING CASTLE at sunset: crumbling towers and broken walls in silhouette, a blazing orange and pink sky,
drifting smoke columns, dead twisted trees, warm orange, magenta and deep purple palette.`,
  },
  crypt: {
    prompt: `${ARENA_RULES}
Scene: a vast underground CRYPT hall: gothic arches, hanging chains and iron cages, green-teal ghostly light pouring from openings,
moss on old stone, deep teal and emerald palette with small warm candle accents.`,
  },
  grove: {
    prompt: `${ARENA_RULES}
Scene: an ancient misty FOREST GROVE at dawn: tall pale tree trunks fading into fog, hanging vines and chains, ruined wooden
watchtowers, soft cyan light shafts through the canopy, teal, mint and pale gold palette.`,
  },
  platforms: {
    ref: 'weapons-style-v2.png',
    prompt: `The attached image is a STYLE reference only. Generate a sheet of FOUR horizontal game PLATFORM strips for a 2D side-view duelling
game, stacked as 4 rows, each strip spanning nearly the full width (about 1400 px wide, 160 px tall), seen exactly from the side, with
a flat walkable top edge and a seamless repeating pattern so the strip can be tiled horizontally:
Row 1: weathered blue-grey moonlit STONE bridge deck with a carved balustrade lip; Row 2: charred castle STONE with glowing-orange cracks
(painted, no glow) and broken bricks; Row 3: mossy green-teal crypt STONE blocks with hanging moss; Row 4: dark WOODEN planks on beams
with iron brackets and a few leaves.
Fully transparent background around the strips, NO text, NO labels, NO characters, image size 1536x1024.`,
  },
};

function run(name) {
  return new Promise((resolve) => {
    const job = JOBS[name];
    const out = join(SRC, `${name}.png`);
    const instr = `Use your built-in image_gen tool (not any CLI) to generate exactly ONE image as described below, then copy the generated PNG to
${out.replace(/\//g, '\\')}
and print the source path and the final path. Do not create or modify any other files.

${job.prompt}`;
    const t0 = Date.now();
    const imgs = job.ref ? ['-i', join(CP_REF, job.ref)] : [];
    const p = spawn(CODEX, ['exec', '--skip-git-repo-check', '-m', 'gpt-6.1-sol', ...imgs, '--', instr], { cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let buf = '';
    p.stdout.on('data', (d) => (buf += d));
    p.stderr.on('data', (d) => (buf += d));
    p.on('close', (code) => {
      writeFileSync(join(SRC, `${name}.log`), buf);
      const ok = code === 0 && existsSync(out);
      console.log(`${name}: ${ok ? 'OK' : 'FAILED'} (${Math.round((Date.now() - t0) / 1000)} s)`);
      resolve({ name, ok, prompt: job.prompt, ref: job.ref ?? null, seconds: Math.round((Date.now() - t0) / 1000), at: new Date().toISOString() });
    });
  });
}

const wanted = process.argv.slice(2);
if (!wanted.length || wanted.some((n) => !JOBS[n])) {
  console.error(`Name the jobs: ${Object.keys(JOBS).join(' ')}`);
  process.exit(1);
}
const results = await Promise.all(wanted.map(run));
const mf = join(SRC, 'manifest.json');
const manifest = existsSync(mf) ? JSON.parse(readFileSync(mf, 'utf8')) : { tool: 'codex exec + built-in image_gen', images: [] };
manifest.images.push(...results);
writeFileSync(mf, JSON.stringify(manifest, null, 2));
