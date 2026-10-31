// Bladerift fighter sprites: generate animation SHEETS for one character with Codex's built-in image_gen (ChatGPT login,
// no API key). Each sheet is an exact grid of frames that tools/sprites/process.py slices into the runtime atlas.
//
// Usage: node tools/sprites/gen.mjs <character-id> [sheet names...] [--jobs=3] [--retry]
//   character-id: a folder in art/characters/ with a character.json (see docs/art/sprite-standard.md)
//   no sheet names = every sheet of the character that has no image yet (--all regenerates every sheet)
// Outputs: art/characters/<id>/sheets/<sheet>.png (+ .log), and a record of every call in art/characters/<id>/sheets/manifest.json.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const CODEX = process.env.CODEX_BIN ?? 'C:/Users/vascu/RobloxPvP/tools/codex/bin/codex.exe';
const MODEL = process.env.CODEX_MODEL ?? 'gpt-6.1-sol';

const args = process.argv.slice(2);
const flags = Object.fromEntries(args.filter((a) => a.startsWith('--')).map((a) => a.slice(2).split('=')).map(([k, v]) => [k, v ?? 'true']));
const [id, ...names] = args.filter((a) => !a.startsWith('--'));
if (!id) {
  console.error('Usage: node tools/sprites/gen.mjs <character-id> [sheets...] [--jobs=3] [--all]');
  process.exit(1);
}
const dir = join(root, 'art', 'characters', id);
const ch = JSON.parse(readFileSync(join(dir, 'character.json'), 'utf8'));
const std = JSON.parse(readFileSync(join(root, 'art', 'sprite-standard.json'), 'utf8'));
const out = join(dir, 'sheets');
mkdirSync(out, { recursive: true });

/** The master design sheet (references/design.png): the character drawn in the approved house style, to be reviewed and
 * then attached to every animation sheet as the identity reference. */
function designPrompt() {
  return `Create ONE 2D fighting-game CHARACTER REFERENCE SHEET of ${ch.name} (${ch.epithet}), an ORIGINAL character for an original
indie fighting game. It must NOT resemble any existing anime, manga, game or film character.

The FIRST attached image is the approved HOUSE STYLE (another character of this game): copy its rendering exactly - the same
premium high-detail anime fighting-game sprite style, line work, cel shading, metal highlights, proportions, scale and the
same kind of sheet layout - but draw ${ch.name}, NOT the character shown there.${(ch.designRefs ?? []).length > 1 ? ` The SECOND attached image is ${ch.name}'s portrait:
match the face, hair, colours and costume from it.` : ' Follow the character description below exactly (it is a new design).'}

THE CHARACTER:
${ch.bible}

ART STYLE: ${std.style}

SHEET CONTENT (transparent background, image ${std.width}x${std.height}, no text, no labels, no grid lines, every figure separate):
${ch.design ?? `- top row: full-body neutral stance facing right; a combat stance; a walking pose; a running pose; a jump; a close-up of the weapon
- middle rows: six attack and special poses with the character's weapon trails and energy colours
- bottom row: guard, hit reaction, knocked down, a victory pose, the signature special move with its effect`}
Every figure faces RIGHT (three-quarter side view like the house style), the same scale (standing height about 240 px), feet on
the same ground line within each row.`;
}

/** The prompt for one sheet: the shared rules, the character's bible, then the frame list in reading order. */
function promptFor(sheetName) {
  if (sheetName === 'design') return designPrompt();
  const sh = ch.sheets?.[sheetName] ?? std.sheets[sheetName];
  if (!sh) throw new Error(`no sheet ${sheetName}`);
  const [cols, rows] = sh.grid ?? std.grid;
  const cw = std.width / cols;
  const chh = std.height / rows;
  const frames = sh.frames.map((f, i) => `  ${i + 1}. ${f}`).join('\n');
  const extra = ch.sheetNotes?.[sheetName] ? `\nCharacter-specific notes for this sheet: ${ch.sheetNotes[sheetName]}` : '';
  return `Create ONE 2D fighting-game SPRITE SHEET image of ${ch.name} (${ch.epithet}) for an original indie fighting game.

THE CHARACTER (match the attached reference images EXACTLY - same face, hair, costume, colours, weapon, proportions):
${ch.bible}

ART STYLE: ${std.style}

LAYOUT (critical - a program slices this sheet):
- Image size ${std.width}x${std.height}, FULLY TRANSPARENT background (alpha), no background colour, no floor, no shadows, no scenery.
- An exact invisible grid of ${cols} columns x ${rows} rows of equal cells (${cw}x${chh} px each). NO grid lines, NO borders, NO text,
  NO numbers, NO labels anywhere.
- Exactly one full-body frame per cell, in reading order (left to right, top row first). ${sh.frames.length} frames in total${sh.frames.length < cols * rows ? `; the remaining cells stay EMPTY` : ''}.
- Every frame: the character FACES RIGHT in the same three-quarter side view as the reference; the SAME SCALE in every cell
  (standing height about ${Math.round(chh * (sh.standFrac ?? std.standFrac))} px from heel to crown, even if a pose is crouched or stretched); the feet rest on the same invisible ground line
  ${Math.round(chh * std.groundFrac)} px above the bottom edge of the cell (airborne frames are drawn at the SAME place in the cell -
  the game moves the character - just with the airborne pose); the torso stays about ${Math.round(cw * std.bodyX)} px from the cell's
  left edge so a weapon has room in front.
- Nothing (weapon, cape, hair, effects) may cross into a neighbouring cell: keep a clear margin of 8 px at every cell edge, shorten
  the weapon's foreshortening or angle it if needed.
- Consecutive frames are ANIMATION FRAMES of one continuous motion: keep the costume, armour plates, weapon design, hair shape and
  colours identical between frames; only the pose changes.

THIS SHEET: ${sh.title}
${frames}${extra}`;
}

function run(sheetName) {
  return new Promise((resolve) => {
    const design = sheetName === 'design';
    const file = design ? join(dir, 'references', 'design.png') : join(out, `${sheetName}.png`);
    const refs = ((design ? ch.designRefs : ch.refs) ?? []).map((r) => join(dir, r));
    const prompt = promptFor(sheetName);
    const instr = `Use your built-in image_gen tool (not any CLI or script) to generate exactly ONE image as described below, with a transparent
background, then copy the generated PNG to
${file.replace(/\//g, '\\')}
and print the source path and the final path. Do not create or modify any other files. The attached images are the character's
approved design reference: follow them exactly.

${prompt}`;
    const t0 = Date.now();
    const p = spawn(CODEX, ['exec', '--skip-git-repo-check', '-m', MODEL, ...refs.flatMap((r) => ['-i', r]), '--', instr], {
      cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let buf = '';
    p.stdout.on('data', (d) => (buf += d));
    p.stderr.on('data', (d) => (buf += d));
    p.on('close', (code) => {
      writeFileSync(design ? join(dir, 'references', 'design.log') : join(out, `${sheetName}.log`), buf);
      const ok = code === 0 && existsSync(file);
      const seconds = Math.round((Date.now() - t0) / 1000);
      console.log(`${id}/${sheetName}: ${ok ? 'OK' : 'FAILED'} (${seconds} s)`);
      resolve({ sheet: sheetName, ok, seconds, at: new Date().toISOString(), model: MODEL, refs: (design ? ch.designRefs : ch.refs) ?? [], prompt });
    });
  });
}

const all = ['design', ...Object.keys({ ...std.sheets, ...(ch.sheets ?? {}) })].filter((n) => !(ch.skip ?? []).includes(n));
const have = (n) => existsSync(n === 'design' ? join(dir, 'references', 'design.png') : join(out, `${n}.png`));
// the design sheet is only made when asked by name (or when the character has none and no approved reference)
const wanted = names.length ? names : all.filter((n) => n !== 'design' && (flags.all || !have(n)));
const bad = wanted.filter((n) => !all.includes(n));
if (bad.length) {
  console.error(`Unknown sheets: ${bad.join(' ')}. Known: ${all.join(' ')}`);
  process.exit(1);
}
if (flags.print) {
  for (const n of wanted) console.log(`----- ${n}\n${promptFor(n)}\n`);
  process.exit(0);
}
// a small pool: image generations run side by side, a few at a time
const jobs = Math.max(1, Number(flags.jobs ?? 3));
const queue = [...wanted];
const results = [];
await Promise.all(
  Array.from({ length: Math.min(jobs, queue.length) }, async () => {
    while (queue.length) results.push(await run(queue.shift()));
  }),
);
const mf = join(out, 'manifest.json');
const manifest = existsSync(mf) ? JSON.parse(readFileSync(mf, 'utf8')) : { tool: 'codex exec + built-in image_gen', calls: [] };
manifest.calls.push(...results);
writeFileSync(mf, JSON.stringify(manifest, null, 2));
const failed = results.filter((r) => !r.ok).map((r) => r.sheet);
if (failed.length) {
  console.log(`failed: ${failed.join(' ')}`);
  process.exitCode = 1;
}
