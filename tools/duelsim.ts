// Headless bot-vs-bot weapon balance sim. Run from the repo root: npx tsx tools/duelsim.ts
// Flags (all optional):
//   --seeds=4        seeded matches per primary pairing, arena and seat order
//   --secondary=sword  fixed secondary weapon (Bow replaces it for a Sword primary, since a loadout cannot repeat)
//   --skill=bomb     fixed skill (bomb | frost | trap | blink)
//   --cap=480        max seconds per match before it is abandoned
//   --only=sword,lance  restrict the primaries (pairings among them only)
//   --quiet          skip the frame-data and reach tables
import { ARENAS } from '../packages/shared/src/arena';
import { BotBrain } from '../packages/shared/src/bot';
import { FIGHTER, ROUND, TICK_RATE } from '../packages/shared/src/constants';
import { Btn, InputCmd } from '../packages/shared/src/input';
import { Loadout, SkillId, WEAPONS, WeaponId } from '../packages/shared/src/weapons';
import { World } from '../packages/shared/src/world';

const flags = new Map<string, string>();
for (const a of process.argv.slice(2)) {
  const m = /^--([\w-]+)(?:=(.*))?$/.exec(a);
  if (m) flags.set(m[1], m[2] ?? 'true');
}

const SEEDS = Math.max(1, Number(flags.get('seeds') ?? 4));
const CAP_TICKS = Math.round(Number(flags.get('cap') ?? 480) * TICK_RATE);
const SKILL_BY_NAME: Record<string, SkillId> = { bomb: SkillId.Bomb, frost: SkillId.Frost, trap: SkillId.Trap, blink: SkillId.Blink };
const SKILL = SKILL_BY_NAME[flags.get('skill') ?? 'bomb'];

function weaponByName(name: string): WeaponId {
  const w = WEAPONS.find((x) => x.short.toLowerCase() === name.trim().toLowerCase());
  if (!w) throw new Error(`unknown weapon "${name}"`);
  return w.id;
}
const SECONDARY = weaponByName(flags.get('secondary') ?? 'sword');
const FALLBACK_SECONDARY = SECONDARY === WeaponId.Sword ? WeaponId.Bow : WeaponId.Sword;
const PRIMARIES: WeaponId[] = flags.get('only') ? flags.get('only')!.split(',').map(weaponByName) : WEAPONS.map((w) => w.id);
const secondaryFor = (p: WeaponId): WeaponId => (p === SECONDARY ? FALLBACK_SECONDARY : SECONDARY);

const name = (w: WeaponId) => WEAPONS[w].short;

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
  arena: Record<string, Tally>;
}

const newRow = (): Row => ({ matches: 0, matchWins: 0, rounds: 0, roundWins: 0, secs: 0, timeouts: 0, hits: 0, hitDmg: 0, swings: 0, arena: {} });
const rows = new Map<number, Row>(WEAPONS.map((w) => [w.id, newRow()]));
const mat = new Map<string, Tally>();
const tally = (m: Map<string, Tally>, k: string) => {
  let t = m.get(k);
  if (!t) m.set(k, (t = { w: 0, n: 0 }));
  return t;
};

let matchCount = 0;
let unfinished = 0;
let totalTicks = 0;

/** One bo2 bot match. Seat 0 (left, id 1) plays `pa`, seat 1 (right, id 2) plays `pb`. */
function playMatch(arenaId: string, pa: WeaponId, pb: WeaponId, seedA: number, seedB: number) {
  const prim: [WeaponId, WeaponId] = [pa, pb];
  const world = new World({ arenaId, wins: ROUND.defaultWins, roundTime: ROUND.defaultTime });
  const fa = world.addFighter(1, 0, 'A', { weapons: [pa, secondaryFor(pa)], skill: SKILL } as Loadout, true);
  const fb = world.addFighter(2, 1, 'B', { weapons: [pb, secondaryFor(pb)], skill: SKILL } as Loadout, true);
  const ba = new BotBrain(1, seedA, 'hard');
  const bb = new BotBrain(2, seedB, 'hard');
  world.start();
  let fightTick = 0;
  while (world.phase !== 'over' && world.tick < CAP_TICKS) {
    fa.inputs.push(ba.think(world));
    fb.inputs.push(bb.think(world));
    world.step();
    for (const e of world.events) {
      if (e.t === 'fight') fightTick = world.tick;
      else if (e.t === 'round') {
        const secs = (world.tick - fightTick) / TICK_RATE;
        for (const seat of [0, 1] as const) {
          const r = rows.get(prim[seat])!;
          r.rounds++;
          r.secs += secs;
          if (e.why === 1) r.timeouts++;
          const at = (r.arena[arenaId] ??= { w: 0, n: 0 });
          at.n++;
          if (e.winner === seat) at.w++;
        }
        if (e.winner === 0 || e.winner === 1) {
          rows.get(prim[e.winner])!.roundWins++;
          tally(mat, `${prim[e.winner]},${prim[1 - e.winner]}`).w++;
        }
        tally(mat, `${pa},${pb}`).n++;
        tally(mat, `${pb},${pa}`).n++;
      } else if (e.t === 'hit') {
        const seat = e.a === 1 ? 0 : e.a === 2 ? 1 : -1;
        if (seat >= 0 && e.w === prim[seat as 0 | 1]) {
          const r = rows.get(e.w)!;
          r.hits++;
          r.hitDmg += e.amt;
        }
      } else if (e.t === 'swing') {
        const seat = e.p === 1 ? 0 : e.p === 2 ? 1 : -1;
        if (seat >= 0 && e.w === prim[seat as 0 | 1]) rows.get(e.w)!.swings++;
      }
    }
    world.events.length = 0;
  }
  matchCount++;
  totalTicks += world.tick;
  if (world.phase !== 'over') unfinished++;
  rows.get(pa)!.matches++;
  rows.get(pb)!.matches++;
  if (world.phase === 'over') rows.get(prim[world.winner as 0 | 1])!.matchWins++;
}

// ------------------------------------------------------------ frame data and reach

const NEUTRAL: InputCmd = { seq: 0, moveX: 0, moveY: 0, buttons: 0, viewTick: 0 };

/** Does the first combo move of `w` connect with an idle defender `d` px away (attacker on the left, facing right)? */
function connects(w: WeaponId, d: number): boolean {
  const world = new World({ arenaId: 'bridge', wins: 2, roundTime: 90 });
  const fa = world.addFighter(1, 0, 'A', { weapons: [w, secondaryFor(w)], skill: SKILL }, true);
  const fb = world.addFighter(2, 1, 'B', { weapons: [WeaponId.Sword, WeaponId.Bow], skill: SKILL }, true);
  world.start();
  let seq = 0;
  for (let i = 0; i < ROUND.introTicks + 2; i++) {
    fa.inputs.push({ ...NEUTRAL, seq: ++seq });
    fb.inputs.push({ ...NEUTRAL, seq });
    world.step();
  }
  fa.s.x = 200;
  fb.s.x = 200 + d;
  fa.s.face = 1;
  fb.s.face = -1;
  world.events.length = 0;
  for (let i = 0; i < 150; i++) {
    fa.inputs.push({ ...NEUTRAL, seq: ++seq, buttons: i === 0 ? Btn.A : 0 });
    fb.inputs.push({ ...NEUTRAL, seq });
    world.step();
    const hit = world.events.some((e) => e.t === 'hit' && e.a === 1 && e.v === 2);
    world.events.length = 0;
    if (hit) return true;
  }
  return false;
}

/** Largest distance (px, centre to centre) at which the first combo move connects with a standing target. */
function firstHitReach(w: WeaponId): number {
  for (let d = 1000; d >= 4; d--) if (connects(w, d)) return d;
  return 0;
}

const fmtMove = (m: { startup: number; active: number; recovery: number }) =>
  `${m.startup}+${m.active}+${m.recovery}=${m.startup + m.active + m.recovery}`;

/** Chained-combo DPS if every hit lands: a combo step is followed by the next press at the chain point. */
function comboDps(w: WeaponId) {
  const combo = WEAPONS[w].combo;
  let dmg = 0;
  let ticks = 0;
  combo.forEach((m, i) => {
    dmg += m.dmg;
    ticks += i === combo.length - 1 ? m.startup + m.active + m.recovery : m.startup + m.active + Math.ceil(m.recovery * 0.35);
  });
  return dmg / (ticks / TICK_RATE);
}

// ------------------------------------------------------------ run

const pad = (s: string, n: number) => s.padEnd(n);
const lpad = (s: string, n: number) => s.padStart(n);
const pct = (w: number, n: number) => (n ? `${((100 * w) / n).toFixed(1)}` : '-');

const t0 = Date.now();
for (let x = 0; x < PRIMARIES.length; x++) {
  for (let y = x + 1; y < PRIMARIES.length; y++) {
    for (let ai = 0; ai < ARENAS.length; ai++) {
      for (let order = 0; order < 2; order++) {
        const pa = order === 0 ? PRIMARIES[x] : PRIMARIES[y];
        const pb = order === 0 ? PRIMARIES[y] : PRIMARIES[x];
        for (let k = 0; k < SEEDS; k++) {
          const base = (k + 1) * 1009 + ai * 97 + x * 31 + y * 7 + order * 3;
          playMatch(ARENAS[ai].id, pa, pb, base * 2 + 1, base * 2 + 2);
        }
      }
    }
  }
}
const simSecs = (Date.now() - t0) / 1000;

console.log(`\nDuel sim: ${matchCount} matches (${SEEDS} seeds x ${ARENAS.length} arenas x both seat orders), secondary ${name(SECONDARY)} (${name(FALLBACK_SECONDARY)} for a ${name(SECONDARY)} primary), skill ${flags.get('skill') ?? 'bomb'}`);
console.log(`Primaries: ${PRIMARIES.map(name).join(', ')}. Unfinished (capped) matches: ${unfinished}. Sim time ${simSecs.toFixed(1)} s.\n`);

let allRounds = 0;
let allTimeouts = 0;
let allSecs = 0;
let allHits = 0;
let allDmg = 0;
for (const r of rows.values()) {
  allRounds += r.rounds;
  allTimeouts += r.timeouts;
}
// rounds were counted once per fighter, so halve the totals
allRounds /= 2;
allTimeouts /= 2;
for (const w of PRIMARIES) {
  const r = rows.get(w)!;
  allSecs += r.secs;
  allHits += r.hits;
  allDmg += r.hitDmg;
}
console.log(`Overall: ${allRounds} rounds, avg round ${(allSecs / (2 * allRounds || 1)).toFixed(1)} s, time-outs ${pct(allTimeouts, allRounds)}%, damage per landed hit ${(allDmg / (allHits || 1)).toFixed(1)}\n`);

const header = ['Weapon', 'Win% rd', 'Win% match', 'Rounds', 'Avg rd s', 'Timeout%', 'Dmg/hit', 'Hits/rd', 'Hit% swing', 'DPS emp', 'DPS combo'];
const widths = [10, 9, 11, 7, 9, 9, 8, 8, 11, 8, 10];
const line = (cells: string[]) => cells.map((c, i) => (i === 0 ? pad(c, widths[i]) : lpad(c, widths[i]))).join(' ');
console.log(line(header));
console.log(line(header.map((h, i) => '-'.repeat(widths[i]))));
for (const w of PRIMARIES) {
  const r = rows.get(w)!;
  const rd = r.rounds; // each round is counted once for each of its two weapons
  console.log(line([
    name(w),
    pct(r.roundWins, rd),
    pct(r.matchWins, r.matches),
    String(rd),
    (r.secs / (r.rounds || 1)).toFixed(1),
    pct(r.timeouts, r.rounds),
    r.hits ? (r.hitDmg / r.hits).toFixed(1) : '-',
    (r.hits / (rd || 1)).toFixed(2),
    pct(r.hits, r.swings),
    (r.hitDmg / (r.secs || 1)).toFixed(1),
    comboDps(w).toFixed(1),
  ]));
}
console.log('\nWin% rd = rounds won / rounds fought (per weapon). DPS emp = landed hit damage of the primary per second of fight time (blocked chip not counted). DPS combo = full-combo damage over the chained cadence, if every hit lands.\n');

// round-level matrix: row weapon's round win% against column weapon
console.log('Round win% of row vs column (blank = not played)');
const cw = 8;
console.log(pad('', 10) + PRIMARIES.map((c) => lpad(name(c), cw)).join(''));
for (const i of PRIMARIES) {
  const cells = PRIMARIES.map((j) => {
    if (i === j) return lpad('-', cw);
    const t = mat.get(`${i},${j}`);
    return lpad(t && t.n ? pct(t.w, t.n) : '', cw);
  });
  console.log(pad(name(i), 10) + cells.join(''));
}

// arena breakdown: round win% per weapon on each arena
console.log('\nRound win% by arena');
console.log(pad('Weapon', 10) + ARENAS.map((a) => lpad(a.id, 9)).join(''));
for (const w of PRIMARIES) {
  const r = rows.get(w)!;
  console.log(pad(name(w), 10) + ARENAS.map((a) => {
    const t = r.arena[a.id];
    return lpad(t ? pct(t.w, t.n) : '-', 9);
  }).join(''));
}

if (!flags.has('quiet')) {
  console.log('\nFrame data (ticks at 60 Hz: startup+active+recovery=total) and first-hit reach');
  const fh = ['Weapon', 'Combo 1', 'Combo 2', 'Combo 3', 'Combo 4', 'Air', 'Reach emp', 'Reach stat'];
  const fw = [10, 13, 13, 13, 13, 13, 11, 11];
  const fl = (cells: string[]) => cells.map((c, i) => (i === 0 ? pad(c, fw[i]) : lpad(c, fw[i]))).join(' ');
  console.log(fl(fh));
  console.log(fl(fh.map((h, i) => '-'.repeat(fw[i]))));
  for (const w of WEAPONS.map((x) => x.id)) {
    const def = WEAPONS[w];
    const steps = [0, 1, 2, 3].map((i) => (def.combo[i] ? fmtMove(def.combo[i]) : ''));
    const first = def.combo[0];
    const stat = first.arrow ? 'arrow' : String(Math.round(first.box.x + first.box.w + FIGHTER.w / 2));
    console.log(fl([name(w), ...steps, fmtMove(def.air), String(firstHitReach(w)), stat]));
  }
  console.log('\nReach emp: largest centre-to-centre distance (px) at which the first combo move hits a standing target (bridge arena, attacker steps included). Reach stat: static box edge + half body width (arrows excluded).');
}
