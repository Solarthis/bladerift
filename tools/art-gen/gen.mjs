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
const CP_REF = SRC; // style references are earlier outputs (the Skyfire references are gone)
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

const ICON_RULES = `Rules for the whole sheet:
- A uniform set of SQUARE game ability icons for a dark-fantasy duelling game, laid out as an exact 4 x 4 grid of equal square cells
  (image size 1024x1024, so every icon is 256x256 and fills its cell edge to edge).
- EVERY icon shares the same frame: a thin bevelled dark-iron square border with small gold corner studs, and a deep, richly
  shaded background inside it (each icon may tint its background to its theme). The subject is painted large, centred and
  readable at 48 px: bold silhouette, strong rim light, painterly hand-painted style matching the attached reference.
- NO text, NO letters, NO numbers, NO labels anywhere. Icons never bleed into each other; keep the grid perfectly aligned.`;

const PORTRAIT_RULES = `Rules for the whole sheet:
- A set of character PORTRAIT CARDS for an original dark-fantasy duelling game, laid out as an exact grid of 2 rows x 4 columns of equal
  portrait-shaped cells (image size 1536x1024, each card 384x512, filling its cell edge to edge).
- EVERY card shares the same frame: a thin bevelled dark-iron border with small gold corner studs, matching the attached reference's frame.
- Inside: a head-and-shoulders (bust) portrait, three-quarter view, dramatic rim light, a moody themed background colour per character,
  painterly hand-painted style with crisp pixel-art-inspired edges, strong readable silhouette and expression.
- These are ORIGINAL characters created for this game: they must NOT resemble any existing anime, manga, game or film character.
- NO text, NO names, NO letters anywhere.`;

const JOBS = {
  'portraits-1': {
    ref: 'icons-gear.png',
    prompt: `${PORTRAIT_RULES}
Row 1: (1) LEON VALCREST, the Lionheart King: a young crusader king, short wild golden-blond hair with one crimson streak, fierce red eyes,
       ornate white-and-gold plate armour with a lion emblem, a red cape; warm sunset background.
       (2) KHARON, the Chainbound: a towering, scarred giant archer with long matted black hair, a heavy jaw, glowing amber eyes, bound in rusted
       chains and a ragged red cloth; a huge black bow over his shoulder; dark ember background.
       (3) AURELION, the Gilded Sovereign: an arrogant golden-haired king with slicked-back hair and crimson eyes, gleaming gold armour with sharp
       pauldrons, swirling golden rift portals behind him; radiant gold background.
       (4) NYX, the Hollow Tide: a pale, dark-haired young man in a long black coat, cold blue eyes, translucent ghostly jellyfish-like spirits drifting
       around him; deep night-blue background.
Row 2: (5) VERDAN, the Clay-Born: an androgynous, serene figure with very long flowing mint-green hair and green eyes, simple pale robes,
       living golden chains coiling around one raised hand; soft green background.
       (6) LUMI SORRELLE, the Illusionist: a playful young woman sorcerer with pastel-pink bob hair, violet eyes, a crimson academy coat, glowing
       arcane sigils floating over her palms; magenta background.
       (7) QUILL, the Storyteller: a broad, cheerful man with wild orange hair and a short beard, a loose white shirt and waistcoat, a quill pen and an open
       glowing book; warm orange background.
       (8) HOLLOWMASK: a shadowy assassin wearing a white skull mask, a tattered black hood and cloak, one elongated spectral clawed arm;
       sickly teal background.`,
  },
  'portraits-2': {
    ref: 'icons-gear.png',
    prompt: `${PORTRAIT_RULES}
Row 1: (1) SABLE, the Veiled Blade: a lithe female assassin in a dark indigo hood with a cloth mask over her lower face, sharp dark eyes, twin curved
       daggers crossed in front of her; deep indigo background with a cyan slash of light.
       (2) GORVAX, the Chimera Engine: a monstrous hulking chimera of iron plates and beast flesh, a lion-like mane of cables, two glowing red eyes, a
       steam-vented jaw; burning red background.
       (3) MR. GRAY, the Faceless: a tall, composed gentleman in a dark grey police-style greatcoat and cap, a calm half-smile, the edges of his face
       dissolving into grey fog, a black baton on his shoulder; foggy grey-blue background.
       (4) IGNIS, the Crimson Rider: a fiery young rider with spiky crimson hair and golden eyes, a dark blue riding coat with gold trim, a flaming
       spectral warhorse head behind him; blazing orange-red background.
Row 2: (5) THORNMAW, the Black Hound: a quiet girl with short brown hair and a scarf, riding with a colossal shadow wolf-hound whose glowing
       eyes loom behind her; dusky purple background.
       (6) AEGIS MARROW, the Warden: a stoic young woman knight with silver short hair, teal eyes, heavy teal-and-steel armour, a towering tower
       shield; cool teal background.
       (7) an empty dark card with only a faint golden rift crack (spare). (8) an empty dark card with only a faint golden rift crack (spare).`,
  },
  'title-key': {
    ref: '../../../art/characters/h00-leon/references/approved-sheet.png',
    prompt: `A WIDE 16:9 TITLE SCREEN BACKGROUND for BLADERIFT, an original premium anime 2D fighting game, image size 1536x864.
A colossal glowing violet-and-gold RIFT tears the night sky open above a ruined moonlit stone bridge and a gothic castle skyline;
crackling rift light, drifting embers and petals, layered depth haze. Far in the distance, small heroic silhouettes stand on the
bridge facing each other. Painted in the attached sheet's high-detail anime fighting-game style.
Composition: the CENTRE third stays darker and calm (a logo and menu are drawn over it), the rift and the brightest light sit in the
upper middle, the left and right thirds frame it. NO characters in the foreground, NO text, NO logo, NO user interface.`,
  },
  'icons-arts2': {
    ref: 'icons-abilities.png',
    prompt: `${ICON_RULES.replace('exact 4 x 4 grid', 'exact 4 x 2 grid').replace('1024x1024, so every icon is 256x256', '1024x512, so every icon is 256x256')}
Match the attached sheet's frame and style exactly.
Row 1: (1) VAULT OF AGES: a golden rift portal with many legendary weapons (swords, spears) bursting out point-first; (2) CHAINS OF GENESIS: living
       golden chains erupting from cracked earth and coiling upward; (3) REWRITTEN FATE: an open glowing book with a quill pen writing in golden
       light; (4) PHANTOM HAND: a pale spectral skeletal claw reaching out of teal mist.
Row 2: (5) GRIM FOG: a gentleman's silhouette in a peaked cap dissolving into grey fog; (6) STAMPEDE: a burning warhorse charging, mane of fire;
       (7) NIGHT HUNT: a colossal shadow wolf-hound leaping with glowing purple eyes; (8) a plain golden rift crack on violet (spare).`,
  },
  'icons-abilities': {
    ref: 'skills.png',
    prompt: `${ICON_RULES}
Row 1: (1) JUMP: a figure's boots springing upward off stone with a white upward motion arc; (2) ROLL / DASH: a cloaked figure tucked in a
       fast forward roll with speed streaks; (3) HEAL: a corked glass flask of glowing red potion; (4) RIFT ART (generic special): a jagged
       golden crack of light tearing open a dark violet sky.
Row 2: (5) RADIANT CLEAVE: a longsword unleashing a huge crescent wave of golden light; (6) HAIL OF ARROWS: a dense volley of glowing arrows
       raining down from a stormy sky; (7) PIERCING FANG: a lance tip bursting forward through a red spiral of force; (8) THUNDER CALL: a forked
       violet-white lightning bolt striking down from dark clouds.
Row 3: (9) FLASH STEP: a shadowy assassin silhouette splitting into fading after-images with a cyan slash behind them; (10) BLOOD FRENZY:
       a roaring crimson aura with a cracked war hammer; (11) BULWARK: a glowing teal tower shield radiating a hexagonal barrier;
       (12) FIRE BOMB: a black iron bomb with a lit fuse and flames.
Row 4: (13) FROST SHARD: a sharp ice crystal bolt with frost mist; (14) SNARE TRAP: an iron bear trap snapping shut; (15) BLINK: a violet
       arcane rune circle with a figure vanishing into sparks; (16) CROSSED SWORDS (generic attack) with a spark at the crossing.`,
  },
  'icons-specials': {
    ref: 'icons-abilities.png',
    prompt: `${ICON_RULES}
Match the attached sheet's frame and style exactly. Each of the first 14 cells is the signature SPECIAL MOVE of one hero, in hero order
(hero 0 first, left to right, top row first; cell 15 and 16 are spare):
Row 1: (1) LION'S ROAR: a royal war cry as a golden LION-HEAD shockwave, concentric gold rings bursting outward from an open lion's mouth;
       (2) NINE LIVES: three ember-tipped arrows loosed at once in a fan of orange fire; (3) GATE SHOT: a golden gate swinging open, one
       ornate treasure blade flying straight out of it; (4) RUNE LEAP: a violet rune circle with a spear diving point first in a leap arc.
Row 2: (5) CHAIN LASH: a living golden chain lashing out like a whip, its tip coiled to bind; (6) PHANTOM STARS: three falling-star bolts of
       pale pink and violet arcane light streaking down with trails; (7) INK BLOT: a splash of golden ink bursting across a dark page beside a quill
       nib; (8) SHADOW DIRK: one black dagger hurled out of shadowy smoke, a cold teal edge.
Row 3: (9) FAN OF KNIVES: three steel knives flung in a spread arc, cyan glints on each blade; (10) TERROR ROAR: a monstrous chimera's open
       jaws roaring, crimson ripple waves of fear; (11) SCALPEL RAIN: three surgical scalpels arcing down through grey fog, a few drops of red;
       (12) BUCEPHALUS CHARGE: a great black warhorse rearing and charging with a steel lance levelled at the front.
Row 4: (13) PLAGUE HOUND: a shadow hound racing low along the ground, sickly green-violet plague mist trailing behind it; (14) SHIELD
       REBOUND: a teal tower shield spinning in a wide arc with curved return arrows around it; (15) a plain golden rift crack on violet (spare);
       (16) a plain empty dark card with a gold rim (spare).`,
  },
  'icons-dodges': {
    ref: 'icons-abilities.png',
    prompt: `${ICON_RULES}
Match the attached sheet's frame and style exactly. Each of the first 14 cells is the signature DODGE of one hero, in hero order
(hero 0 first, left to right, top row first; cells 15 and 16 are spare):
Row 1: (1) LION'S STEP: a low armoured knight bursting forward in a fast low step, gold dust streaks behind; (2) HUNTER'S VAULT: a giant
       archer in a back-flip vault over dark ground, a bow in one hand and an orange speed arc; (3) GATE STEP: a figure stepping through a
       golden gate portal, a second gate glowing beyond it; (4) POLE VAULT: a figure vaulting high over a long spear planted in the ground,
       a pale blue arc of motion.
Row 2: (5) CLAY SHIFT: a green-clay figure melting into the earth and gliding through it, mint-green and earth-brown glints; (6) MIRAGE: a
       pale robed figure splitting into shimmering pink illusion copies, one already fading; (7) TURN OF THE PAGE: a writer's silhouette
       dissolving into turning pages of an open book with golden ink lines; (8) FLASH STEP: a hooded assassin splitting into fading cyan
       after-images with a blade flash.
Row 3: (9) BEAST BOUND: a heavy armoured beast-engine pouncing forward low, iron plates and sparks; (10) FOG FORM: a grey-coated gentleman
       dissolving into grey fog, the edges of his body drifting away; (11) CAVALRY DASH: a rider low over the saddle with a red cape streaming
       behind, a sudden burst of speed lines; (12) SHADOW SINK: a figure sinking into a dark shadow puddle, a faint pale outline above it.
Row 4: (13) SHIELD SLIDE: a teal tower shield sliding low across the ground, sparks flying off its rim; (14) a plain golden rift crack on violet
       (spare); (15) a plain empty dark card with a gold rim (spare); (16) a plain golden rift crack on violet (spare).`,
  },
  'icons-gear': {
    ref: 'skills.png',
    prompt: `${ICON_RULES}
Row 1 (weapons, each shown diagonally from bottom-left to top-right): (1) a LONGSWORD; (2) a curved REAPER SCYTHE; (3) a knight's LANCE;
       (4) TWIN DAGGERS crossed.
Row 2: (5) a heavy WAR HAMMER; (6) a recurve HUNTER BOW with a nocked arrow; (7) a teal kite TOWER SHIELD; (8) an ARCANE STAFF of dark wood
       topped with a glowing violet crystal.
Row 3 (class crests: an heraldic emblem on a small shield shape inside the frame): (9) SABER crest: a sword and crown in gold on royal blue;
       (10) ARCHER crest: a bow and arrow in silver on forest green; (11) LANCER crest: a spear and wolf head on crimson; (12) CASTER crest: an open
       grimoire and a star on deep violet.
Row 4: (13) ASSASSIN crest: a dagger and a crescent moon on black; (14) BERSERKER crest: a hammer and a roaring skull on dark red;
       (15) SHIELDER crest: a tower shield and laurel on teal; (16) a plain gold-rimmed empty crest (spare).`,
  },
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

// Super cut-in busts (MUGEN-style slanted panel during a super flash): one job per hero, cut-NN = hero index.
// Reference = the hero's own approved design (character.json refs[0]) plus its portrait card; description = its bible.
// Post-processing (keying, crop, 640 px) is tools/art-gen/cutin.py.
const CUT_HEROES = [
  { id: 'h00-leon', expr: 'a regal battle roar, sword raised high, lion-like defiance', glow: 'blue-white sword light with gold sparks' },
  { id: 'h01-kharon', expr: 'a grim, pained snarl of hunter fury, the curse chains flaring', glow: 'amber-orange fire-arrow light' },
  { id: 'h02-aurelion', expr: 'a cold, superior smirk with blazing crimson eyes and the chin lifted', glow: 'gold light with crimson sparks', weapon: 'He has NO bow anywhere. Behind his shoulders two or three glowing golden rift PORTALS open, and gold and silver swords thrust out of them with their blade tips toward the viewer; one open hand is raised in an imperious gesture of command.' },
  { id: 'h03-nyx', expr: 'a fierce, wild battle cry with glowing ice-blue eyes', glow: 'icy cyan spectral light and pale ghostly jellyfish spirits' },
  { id: 'h04-verdan', expr: 'a serene, unsettling calm with a faint knowing smile and narrowed gold-green eyes', glow: 'gold and jade-green chain light', weapon: 'Living GOLDEN CHAINS coil around the bust and one raised hand. There is NO lance and no spear.' },
  { id: 'h05-lumi', expr: 'a sly, playful grin with a fierce sparkle in the violet eyes', glow: 'soft pink and violet arcane light and floating sigils' },
  { id: 'h06-quill', expr: 'a booming laugh, a wide roguish grin, eyes bright with mischief and power', glow: 'orange ink-and-ember light, golden ink lines' },
  { id: 'h07-hollowmask', expr: 'a cold, eerie stillness: the bone skull mask, teal light blazing inside the eye sockets', glow: 'mint-teal spectral light' },
  { id: 'h08-sable', expr: 'an intense focused stare, the veil taut, a cyan blade flash across the face', glow: 'cyan shadow light and a slash of cyan light' },
  { id: 'h09-gorvax', expr: 'a monstrous roaring snarl, fangs bared, steam venting from the jaw', glow: 'blood-red rage light and red steam', weapon: 'Beast CLAWS and FANGS only: no hammer, no weapon in hand. Clawed hands may be shown at the bottom edge.' },
  { id: 'h10-gray', expr: 'a polite, chilling half-smile with grey fog pouring off the face', glow: 'pale silver mist light', weapon: 'He holds SURGICAL KNIVES / SCALPELS, glinting steel, in his gloved hands. There is NO baton and no cudgel. Fog surrounds him.' },
  { id: 'h11-ignis', expr: 'an exhilarated fierce battle cry, a fiery grin, eyes burning amber', glow: 'fiery orange-red light and flames', weapon: 'Alexander carries a short Greek SWORD (a kopis) with a curved blade, and wears a flowing CRIMSON cloak. There is NO scythe.' },
  { id: 'h12-thornmaw', expr: 'a quiet, grim, unsmiling stare with the lips set, violet eyes glowing', glow: 'violet spectral light and shadow wolf-hound glow' },
  { id: 'h13-aegis', expr: 'a stoic, unbreakable clenched-jaw resolve, teal eyes glowing', glow: 'pale silver and teal shield light' },
];

function cutPrompt(i, ch) {
  const h = CUT_HEROES[i];
  return `ONE CUT-IN BUST for the 2D anime fighting game BLADERIFT: the super-move cut-in of ${ch.name} (${ch.epithet}), an ORIGINAL character
(it must NOT resemble any existing anime, manga, game or film character).

REFERENCES: the FIRST attached image is ${ch.name}'s approved character design. Match the face, hair, colours, armour and costume EXACTLY:
it is the same character. The SECOND attached image is the same character's portrait card: use it to confirm the face and hair.

THE CHARACTER:
${ch.bible}

SHOT: portrait orientation, image 1024x1536. A head-and-shoulders, chest-up BUST, cropped at the bottom edge just below the chest.
The head sits in the upper third and is large (the face about a quarter of the image height). The bust faces RIGHT: head and shoulders
turned in three-quarter profile toward the right edge, the gaze sharp toward the right. The shoulders may run off the left and right edges.
EXPRESSION: an intense super-move expression: ${h.expr}. Eyes focused and blazing, brows hard down, hair and cloth whipped back by the
wind of the energy.
ENERGY: the hero's energy glow streams around the bust: ${h.glow}. Bright rim light on one side, sparks and speed streaks, painted (not
blurred), strong and clearly readable.${h.weapon ? `\nWEAPON AND PROPS (overrides the bible and the references where they differ): ${h.weapon}` : ''}
STYLE: the same premium high-detail anime fighting-game art as the approved design: crisp clean linework, cel shading, metal highlights,
dramatic lighting, sharp focus, rich colour.
BACKGROUND: a flat, seamless, solid pure #FF00FF magenta backdrop filling the entire image: no gradient, no vignette, no haze, no floor,
no shadow, no text. It is keyed out to transparency afterwards, so the figure, its armour and its glow must contain no #FF00FF magenta.
NO text, NO letters, NO border, NO frame, NO logo.`;
}

CUT_HEROES.forEach((h, i) => {
  const ch = JSON.parse(readFileSync(join(root, 'art', 'characters', h.id, 'character.json'), 'utf8'));
  JOBS[`cut-${String(i).padStart(2, '0')}`] = {
    ref: [`../../../art/characters/${h.id}/${ch.refs[0]}`, `../../../art/characters/${h.id}/references/portrait.jpg`],
    prompt: cutPrompt(i, ch),
  };
});

function run(name) {
  return new Promise((resolve) => {
    const job = JOBS[name];
    const out = join(SRC, `${name}.png`);
    const instr = `Use your built-in image_gen tool (not any CLI) to generate exactly ONE image as described below, then copy the generated PNG to
${out.replace(/\//g, '\\')}
and print the source path and the final path. Do not create or modify any other files.

${job.prompt}`;
    const t0 = Date.now();
    const refs = job.ref ? [job.ref].flat() : [];
    const imgs = refs.flatMap((r) => ['-i', join(CP_REF, r)]);
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
