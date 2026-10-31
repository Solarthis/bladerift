// Headless bot-vs-bot hero balance sim. Run from the repo root: npx tsx tools/duelsim.ts
// Every pairing of heroes plays on every arena in both seat orders, with hard bots. A hero fixes its class (stats and
// signature weapon in slot A) and its Rift Art; the second weapon and the skill are varied by seed so no single
// secondary decides a hero's result.
// Flags (all optional):
//   --seeds=4          seeded matches per hero pairing, arena and seat order
//   --cap=480          max seconds per match before it is abandoned
//   --only=0,3,Leon    restrict the heroes (ids or name prefixes; pairings among them only)
//   --quiet            skip the matchup matrix and the arena breakdown
import { ARENAS } from '../packages/shared/src/arena';
import { BotBrain } from '../packages/shared/src/bot';
import { ARTS, CLASSES } from '../packages/shared/src/classes';
import { ROUND, TICK_RATE } from '../packages/shared/src/constants';
import { HEROES, sanitizeLoadout } from '../packages/shared/src/heroes';
import { SkillId, WeaponId } from '../packages/shared/src/weapons';
import { World } from '../packages/shared/src/world';

const flags = new Map<string, string>();
for (const a of process.argv.slice(2)) {
  const m = /^--([\w-]+)(?:=(.*))?$/.exec(a);
  if (m) flags.set(m[1], m[2] ?? 'true');
}

const SEEDS = Math.max(1, Number(flags.get('seeds') ?? 4));
const CAP_TICKS = Math.round(Number(flags.get('cap') ?? 480) * TICK_RATE);

/** Second weapons a hero may carry (slot B); the loadout never repeats the signature weapon. */
const SECONDARIES = [WeaponId.Bow, WeaponId.Shield, WeaponId.Daggers, WeaponId.Lance, WeaponId.Scythe, WeaponId.Sword, WeaponId.Hammer];

function heroByName(name: string): number {
  const t = name.trim().toLowerCase();
  if (/^\d+$/.test(t)) return Number(t);
  const h = HEROES.find((x) => x.name.toLowerCase().startsWith(t));
  if (!h) throw new Error(`unknown hero "${name}"`);
  return h.id;
}
const HEROES_SEL: number[] = flags.get('only') ? flags.get('only')!.split(',').map(heroByName) : HEROES.map((h) => h.id);

/** A seeded loadout for hero `h`: the second weapon and skill come from the seed. */
function loadoutFor(h: number, seed: number) {
  const second = SECONDARIES[seed % SECONDARIES.length];
  const skill = (Math.floor(seed / SECONDARIES.length) % 4) as SkillId;
  return sanitizeLoadout({ weapons: [0, second], skill, hero: h });
}

const short = (h: number) => HEROES[h].name.split(' ').pop()!;
const artName = (h: number) => ARTS[HEROES[h].art].name;
const clsName = (h: number) => CLASSES[HEROES[h].cls].name;

interface Tally {
  w: number;
  n: number;
}

interface Row {
  matches: number;
  matchWins: number;
  rounds: number;
  roundWins: number;
  secs: number;
  timeouts: number;
  hits: number;
  hitDmg: number;
  swings: number;
  arts: number;
  /** Damage landed within ART_WINDOW ticks after an Art was started (a generous proxy for the Art's own damage). */
  artDmg: number;
  arena: Record<string, Tally>;
}
const ART_WINDOW = 90;

const newRow = (): Row => ({ matches: 0, matchWins: 0, rounds: 0, roundWins: 0, secs: 0, timeouts: 0, hits: 0, hitDmg: 0, swings: 0, arts: 0, artDmg: 0, arena: {} });
const rows = new Map<number, Row>(HEROES.map((h) => [h.id, newRow()]));
const mat = new Map<string, Tally>();
const tally = (m: Map<string, Tally>, k: string) => {
  let t = m.get(k);
  if (!t) m.set(k, (t = { w: 0, n: 0 }));
  return t;
};

let matchCount = 0;
let unfinished = 0;
/** Matches that threw inside World.step, with the error: dropped from the statistics. */
const crashes: string[] = [];

/** One bo2 bot match. Seat 0 (left, id 1) plays hero `ha`, seat 1 (right, id 2) plays `hb`. */
function playMatch(arenaId: string, ha: number, hb: number, seedA: number, seedB: number) {
  const pick: [number, number] = [ha, hb];
  const world = new World({ arenaId, wins: ROUND.defaultWins, roundTime: ROUND.defaultTime });
  const fa = world.addFighter(1, 0, 'A', loadoutFor(ha, seedA), true);
  const fb = world.addFighter(2, 1, 'B', loadoutFor(hb, seedB), true);
  const ba = new BotBrain(1, seedA, 'hard');
  const bb = new BotBrain(2, seedB, 'hard');
  world.start();
  let fightTick = 0;
  const artUntil = [-1, -1];
  let aborted = false;
  while (world.phase !== 'over' && world.tick < CAP_TICKS) {
    fa.inputs.push(ba.think(world));
    fb.inputs.push(bb.think(world));
    try {
      world.step();
    } catch (err) {
      // a crash inside World.step (see the report): the match is dropped and counted
      aborted = true;
      crashes.push(`${short(ha)} vs ${short(hb)} on ${arenaId}: ${(err as Error).message}`);
      break;
    }
    for (const e of world.events) {
      if (e.t === 'fight') fightTick = world.tick;
      else if (e.t === 'round') {
        const secs = (world.tick - fightTick) / TICK_RATE;
        for (const seat of [0, 1] as const) {
          const r = rows.get(pick[seat])!;
          r.rounds++;
          r.secs += secs;
          if (e.why === 1) r.timeouts++;
          const at = (r.arena[arenaId] ??= { w: 0, n: 0 });
          at.n++;
          if (e.winner === seat) at.w++;
        }
        if (e.winner === 0 || e.winner === 1) {
          rows.get(pick[e.winner])!.roundWins++;
          tally(mat, `${pick[e.winner]},${pick[1 - e.winner]}`).w++;
        }
        tally(mat, `${ha},${hb}`).n++;
        tally(mat, `${hb},${ha}`).n++;
      } else if (e.t === 'hit') {
        const seat = e.a === 1 ? 0 : e.a === 2 ? 1 : -1;
        if (seat >= 0) {
          const r = rows.get(pick[seat as 0 | 1])!;
          r.hits++;
          r.hitDmg += e.amt;
          if (world.tick <= artUntil[seat]) r.artDmg += e.amt;
        }
      } else if (e.t === 'swing') {
        const seat = e.p === 1 ? 0 : e.p === 2 ? 1 : -1;
        if (seat >= 0) rows.get(pick[seat as 0 | 1])!.swings++;
      } else if (e.t === 'art') {
        const seat = e.p === 1 ? 0 : e.p === 2 ? 1 : -1;
        if (seat >= 0) {
          rows.get(pick[seat as 0 | 1])!.arts++;
          artUntil[seat] = world.tick + ART_WINDOW;
        }
      }
    }
    world.events.length = 0;
  }
  if (aborted) return;
  matchCount++;
  if (world.phase !== 'over') unfinished++;
  rows.get(ha)!.matches++;
  rows.get(hb)!.matches++;
  if (world.phase === 'over') rows.get(pick[world.winner as 0 | 1])!.matchWins++;
}

// ------------------------------------------------------------ run

const pad = (s: string, n: number) => s.padEnd(n);
const lpad = (s: string, n: number) => s.padStart(n);
const pct = (w: number, n: number) => (n ? `${((100 * w) / n).toFixed(1)}` : '-');

const t0 = Date.now();
for (let x = 0; x < HEROES_SEL.length; x++) {
  for (let y = x + 1; y < HEROES_SEL.length; y++) {
    for (let ai = 0; ai < ARENAS.length; ai++) {
      for (let order = 0; order < 2; order++) {
        const ha = order === 0 ? HEROES_SEL[x] : HEROES_SEL[y];
        const hb = order === 0 ? HEROES_SEL[y] : HEROES_SEL[x];
        for (let k = 0; k < SEEDS; k++) {
          const base = (k + 1) * 1009 + ai * 97 + x * 31 + y * 7 + order * 3;
          playMatch(ARENAS[ai].id, ha, hb, base * 2 + 1, base * 2 + 2);
        }
      }
    }
  }
}
const simSecs = (Date.now() - t0) / 1000;

console.log(`\nHero duel sim: ${matchCount} matches (${SEEDS} seeds x ${ARENAS.length} arenas x both seat orders, hard bots), skill and second weapon varied by seed`);
console.log(`Heroes: ${HEROES_SEL.length}. Unfinished (capped) matches: ${unfinished}. Sim time ${simSecs.toFixed(1)} s.`);
if (crashes.length) console.log(`CRASHED matches (dropped, not counted): ${crashes.length}. First: ${crashes[0]}`);
console.log('');

let allRounds = 0;
let allTimeouts = 0;
let allSecs = 0;
let allHits = 0;
let allDmg = 0;
for (const h of HEROES_SEL) {
  const r = rows.get(h)!;
  allRounds += r.rounds;
  allTimeouts += r.timeouts;
  allSecs += r.secs;
  allHits += r.hits;
  allDmg += r.hitDmg;
}
// rounds were counted once per fighter, so halve the totals
allRounds /= 2;
allTimeouts /= 2;
console.log(`Overall: ${allRounds} rounds, avg round ${(allSecs / (2 * allRounds || 1)).toFixed(1)} s, time-outs ${pct(allTimeouts, allRounds)}%, damage per landed hit ${(allDmg / (allHits || 1)).toFixed(1)}\n`);

const header = ['Hero', 'Class', 'Art', 'Win% rd', 'Win% match', 'Rounds', 'Avg rd s', 'Timeout%', 'Dmg/hit', 'Hits/rd', 'Hit% swing', 'Arts/rd', 'Art dmg/u', 'HP', 'Speed'];
const widths = [13, 9, 16, 9, 11, 7, 9, 9, 8, 8, 11, 8, 10, 6, 6];
const line = (cells: string[]) => cells.map((c, i) => (i <= 2 ? pad(c, widths[i]) : lpad(c, widths[i]))).join(' ');
console.log(line(header));
console.log(line(header.map((h, i) => '-'.repeat(widths[i]))));
for (const h of HEROES_SEL) {
  const r = rows.get(h)!;
  const rd = r.rounds; // each round is counted once for each of its two heroes
  const C = CLASSES[HEROES[h].cls];
  console.log(line([
    short(h),
    clsName(h),
    artName(h),
    pct(r.roundWins, rd),
    pct(r.matchWins, r.matches),
    String(rd),
    (r.secs / (rd || 1)).toFixed(1),
    pct(r.timeouts, rd),
    r.hits ? (r.hitDmg / r.hits).toFixed(1) : '-',
    (r.hits / (rd || 1)).toFixed(2),
    pct(r.hits, r.swings),
    (r.arts / (rd || 1)).toFixed(2),
    r.arts ? (r.artDmg / r.arts).toFixed(1) : '-',
    String(C.hp),
    C.speed.toFixed(2),
  ]));
}
console.log('\nWin% rd = rounds won / rounds fought. Win% match = best-of-three matches won. Avg rd s = fight time per round. Arts/rd = Rift Arts started per round. Art dmg/u = damage landed within 3 s after an Art starts, per Art started (includes basic attacks in that window).\n');

if (!flags.has('quiet')) {
  // matchup matrix: round win% of the row hero against the column hero
  console.log('Round win% of row vs column (blank = not played)');
  const cw = 8;
  console.log(pad('', 14) + HEROES_SEL.map((c) => lpad(short(c), cw)).join(''));
  for (const i of HEROES_SEL) {
    const cells = HEROES_SEL.map((j) => {
      if (i === j) return lpad('-', cw);
      const t = mat.get(`${i},${j}`);
      return lpad(t && t.n ? pct(t.w, t.n) : '', cw);
    });
    console.log(pad(short(i), 14) + cells.join(''));
  }

  // arena breakdown: round win% per hero on each arena
  console.log('\nRound win% by arena');
  console.log(pad('Hero', 14) + ARENAS.map((a) => lpad(a.id, 9)).join(''));
  for (const h of HEROES_SEL) {
    const r = rows.get(h)!;
    console.log(pad(short(h), 14) + ARENAS.map((a) => {
      const t = r.arena[a.id];
      return lpad(t ? pct(t.w, t.n) : '-', 9);
    }).join(''));
  }
}
