// Perfect-block audit: can every attack in the game be parried, and only when the BLOCK press is timed? Run from the repo
// root:  npx tsx tools/parrysim.ts [--hero=N] [--verbose]
// For each hero (the attacker) and each of its attacks it plays the attack once against an idle defender to find the
// ticks its blows land, then replays it with the defender tapping BLOCK k ticks before each blow:
//   k = 0 .. PARRY.window-1   must parry every blow (no damage at all, no root, no burn)
//   k = PARRY.window + 3      (too early) must NOT parry the first blow
// Attacks: the light string (three presses), the heavy (held), the launcher, the air string, the plunge, the special,
// the Rift Art, and the throw (a throw beats a perfect block by design: it must get through); then the normals again
// in the second stance (the hero's stance weapon).
import { Btn, type InputCmd } from '../packages/shared/src/input';
import { FIGHTER, PARRY, ROUND } from '../packages/shared/src/constants';
import { RIFT } from '../packages/shared/src/classes';
import { HEROES, sanitizeLoadout } from '../packages/shared/src/heroes';
import { World, type Fighter } from '../packages/shared/src/world';

const flags = new Map<string, string>();
for (const a of process.argv.slice(2)) {
  const m = /^--([\w-]+)(?:=(.*))?$/.exec(a);
  if (m) flags.set(m[1], m[2] ?? 'true');
}
const ONLY = flags.has('hero') ? Number(flags.get('hero')) : -1;
const VERBOSE = flags.has('verbose');
const LEN = 280;
/** Idle ticks before the attack starts (so a press can come before an early blow). */
const LEAD = 12;

interface Attack {
  name: string;
  dist: number;
  /** the attacker's command at tick t */
  plan: (t: number) => { b: number; x?: number; y?: number };
  /** set up before the first tick (the attacker in the air, a full Rift gauge...) */
  prep?: (a: Fighter, d: Fighter, w: World) => void;
  /** must get through a perfect block */
  beatsParry?: boolean;
}

const tap = (t: number, at: number, btn: number, n = 3) => (t >= at && t < at + n ? btn : 0);
const ATTACKS: Attack[] = [
  { name: 'light x3', dist: 60, plan: (t) => ({ b: tap(t, 0, Btn.A) | tap(t, 18, Btn.A) | tap(t, 36, Btn.A) }) },
  { name: 'heavy', dist: 60, plan: (t) => ({ b: t < 30 ? Btn.B : 0 }) },
  { name: 'launcher', dist: 60, plan: (t) => ({ b: tap(t, 0, Btn.A), y: t < 3 ? 1 : 0 }) },
  {
    name: 'air x3', dist: 40, plan: (t) => ({ b: tap(t, 0, Btn.A) | tap(t, 14, Btn.A) | tap(t, 28, Btn.A) }),
    prep: (a, _d, w) => { a.s.ground = 0; a.s.y = w.arena.floor - 70; a.s.vy = -200; },
  },
  {
    name: 'plunge', dist: 24, plan: (t) => ({ b: tap(t, 0, Btn.B), y: t < 3 ? 1 : 0 }),
    prep: (a, _d, w) => { a.s.ground = 0; a.s.y = w.arena.floor - 170; a.s.vy = 0; },
  },
  { name: 'special', dist: 120, plan: (t) => ({ b: tap(t, 0, Btn.Skill) }) },
  { name: 'special close', dist: 50, plan: (t) => ({ b: tap(t, 0, Btn.Skill) }) },
  { name: 'rift art', dist: 110, plan: (t) => ({ b: tap(t, 0, Btn.Special) }), prep: (a) => { a.s.rift = RIFT.max; } },
  { name: 'rift art close', dist: 50, plan: (t) => ({ b: tap(t, 0, Btn.Special) }), prep: (a) => { a.s.rift = RIFT.max; } },
  { name: 'throw', dist: 24, plan: (t) => ({ b: tap(t, 0, Btn.B), x: t < 3 ? 1 : 0 }), beatsParry: true },
];
// the second stance (STANCE): the same attacks with the hero's stance weapon in hand
for (const atk of ATTACKS.slice()) {
  if (/special|rift|throw/.test(atk.name)) continue;
  ATTACKS.push({
    ...atk,
    name: `stance ${atk.name}`,
    dist: atk.name === 'heavy' ? 90 : atk.dist,
    prep: (a, d, w) => {
      a.s.stance = 1;
      atk.prep?.(a, d, w);
    },
  });
}

const cmd = (seq: number, buttons = 0, moveX = 0, moveY = 0): InputCmd => ({ seq, moveX, moveY, buttons, viewTick: 0 });

interface Run {
  /** ticks a blow reached the defender (hit, block or parry), and damage, roots, burns and parries taken */
  blows: number[];
  dmg: number;
  status: number;
  parries: number;
  hits: number;
  /** ticks of blows that were not parried (hit or blocked) */
  unparried: number[];
}

function play(h: number, atk: Attack, presses: number[]): Run {
  const world = new World({ arenaId: 'training', wins: ROUND.defaultWins, roundTime: ROUND.defaultTime });
  const a = world.addFighter(1, 0, 'A', sanitizeLoadout({ hero: h }), true);
  const d = world.addFighter(2, 1, 'D', sanitizeLoadout({ hero: h === 0 ? 2 : 0 }), true);
  world.start();
  let seq = 0;
  while (world.phase !== 'fight' && world.tick < 3000) {
    a.inputs.push(cmd(++seq));
    d.inputs.push(cmd(seq));
    world.step();
  }
  const mid = world.arena.w / 2;
  a.s.x = mid - atk.dist / 2;
  d.s.x = mid + atk.dist / 2;
  a.s.y = d.s.y = world.arena.floor;
  a.s.vx = a.s.vy = d.s.vx = d.s.vy = 0;
  a.s.face = 1;
  d.s.face = -1;
  d.s.hp = 1e6;
  a.s.hp = 1e6;
  seq += 10;
  const run: Run = { blows: [], dmg: 0, status: 0, parries: 0, hits: 0, unparried: [] };
  for (let t = 0; t < LEN; t++) {
    if (t === LEAD) atk.prep?.(a, d, world);
    const p = t < LEAD ? { b: 0 } : atk.plan(t - LEAD);
    a.inputs.push(cmd(++seq, p.b, p.x ?? 0, p.y ?? 0));
    const block = presses.some((at) => t >= at && t < at + 2);
    d.inputs.push(cmd(seq, block ? Btn.Block : 0));
    world.events = [];
    const hp = d.s.hp;
    const root = d.s.rootT;
    const burn = d.s.burnT;
    world.step();
    for (const e of world.events) {
      if ((e.t === 'hit' || e.t === 'block') && e.v === d.id) {
        run.blows.push(t);
        if (!run.unparried.includes(t)) run.unparried.push(t);
      }
      if (e.t === 'hit' && e.v === d.id) run.hits++;
      if (e.t === 'parry' && e.a === d.id) {
        run.blows.push(t);
        run.parries++;
      }
    }
    // (burning ticks that started before the first parry are not a blow)
    if (hp > d.s.hp && !world.events.some((e) => (e.t === 'hit' || e.t === 'block') && e.v === d.id) && !run.unparried.includes(t)) run.unparried.push(t);
    run.dmg += Math.max(0, hp - d.s.hp);
    if (d.s.rootT > root + 1 || d.s.burnT > burn + 1) run.status++;
    if (world.phase !== 'fight') break;
  }
  return run;
}

let bad = 0;
let checked = 0;
const rows: string[] = [];
/**
 * The defender taps BLOCK k ticks before every blow that reaches it. A parry changes what follows (a staggered attacker
 * swings later), so it is found blow by blow: replay, take the first blow that was not parried, add a press k ticks before
 * it, replay again. A blow that still lands with its press in place is a failure.
 */
function parryAll(h: number, atk: Attack, k: number): { run: Run; presses: number[]; missed: number } {
  const presses: number[] = [];
  for (let i = 0; i < 40; i++) {
    const r = play(h, atk, presses);
    const first = r.unparried[0];
    if (first === undefined) return { run: r, presses, missed: -1 };
    const at = first - k;
    if (presses.includes(at)) return { run: r, presses, missed: first };
    presses.push(at);
    presses.sort((x, y) => x - y);
  }
  return { run: play(h, atk, presses), presses, missed: -2 };
}
for (let h = 0; h < HEROES.length; h++) {
  if (ONLY >= 0 && h !== ONLY) continue;
  for (const atk of ATTACKS) {
    const base = play(h, atk, []);
    const blows = [...new Set(base.blows)];
    if (!blows.length) {
      if (VERBOSE) rows.push(`${HEROES[h].name.padEnd(20)} ${atk.name.padEnd(15)} (never reaches: skipped)`);
      continue;
    }
    checked++;
    const fails: string[] = [];
    for (let k = 0; k < PARRY.window; k++) {
      if (atk.beatsParry) {
        const r = play(h, atk, [blows[0] - k]);
        if (r.dmg === 0) fails.push(`k${k}: parried a throw`);
        continue;
      }
      const { run: r, missed } = parryAll(h, atk, k);
      if (missed !== -1 || r.dmg > 0 || r.status > 0) fails.push(`k${k}:${r.dmg.toFixed(0)}dmg/${r.hits}hit${missed >= 0 ? `@${missed}` : ''}`);
    }
    // too early: the window has closed before the first blow
    const early = play(h, atk, [blows[0] - (PARRY.window + 3)]);
    if (!atk.beatsParry && early.parries > 0 && early.blows[0] === blows[0]) fails.push('too-early press still parried');
    if (fails.length) bad++;
    if (fails.length || VERBOSE)
      rows.push(`${HEROES[h].name.padEnd(20)} ${atk.name.padEnd(15)} blows at ${blows.slice(0, 6).join(',')}${blows.length > 6 ? '...' : ''}  ${fails.length ? 'FAIL ' + fails.join(' ') : 'ok'}`);
  }
}
console.log(rows.join('\n'));
console.log(`\n${checked} attacks checked, ${bad} failing (window ${PARRY.window} ticks, buffer ${FIGHTER.buffer})`);
process.exit(bad ? 1 : 0);
