// Attack press audit: does every tap of an attack button do something? Run from the repo root:
//   npx tsx tools/presssim.ts [--hero=N] [--tap=1] [--stance] [--verbose]
// For each hero and situation it replays a timeline, adds ONE tap of Light (or Heavy) at every tick offset, and checks
// that the tap starts a move (a new swing, a charge or a guard) before the hero has been idle for a while. A tap that
// changes nothing is a "lost" press: the player pressed attack and nothing happened.
//   chain    a tap during a whiffed swing (ground), waiting for the string's next swing
//   hit      a tap during a swing that connected
//   air      a tap at any point of a jump (rising, apex, falling, landing)
//   airchain a tap during an air swing
//   roll     a tap during the dodge
//   stun     a tap while recovering from a hit
// It also flags swings cut short (the move ends before its full length with no hit taken, no chain and no walk-out).
import { ROUND } from '../packages/shared/src/constants';
import { Act, moveOf, MOVE_PLUNGE } from '../packages/shared/src/fighter';
import { heroClass, HEROES, sanitizeLoadout } from '../packages/shared/src/heroes';
import { Btn, type InputCmd } from '../packages/shared/src/input';
import { World } from '../packages/shared/src/world';

const flags = new Map<string, string>();
for (const a of process.argv.slice(2)) {
  const m = /^--([\w-]+)(?:=(.*))?$/.exec(a);
  if (m) flags.set(m[1], m[2] ?? 'true');
}
const TAP = Number(flags.get('tap') ?? 3); // touch taps last a few ticks
const VERBOSE = flags.has('verbose');
const ONLY = flags.has('hero') ? Number(flags.get('hero')) : -1;
/** --stance: the same audit with the hero's second-stance weapon in hand (STANCE). */
const STANCE_ON = flags.has('stance');
/** A tap must start something within this many ticks of the hero being free to act again. */
const GRACE = 6;

type Plan = (t: number) => { b: number; x?: number; y?: number };
const cmd = (seq: number, buttons = 0, moveX = 0, moveY = 0): InputCmd => ({ seq, moveX, moveY, buttons, viewTick: 0 });

interface Scenario {
  name: string;
  dist: number;
  /** ticks to replay before the tap window opens */
  lead: number;
  /** tap offsets to try (after lead) */
  span: number;
  plan: Plan;
  foeHitsBack?: boolean;
  /** the scenario's own attack press [from, to): a tap next to it merges with it, so those offsets are skipped */
  own?: [number, number];
}

const SCENARIOS: Scenario[] = [
  { name: 'chain', dist: 600, lead: 0, span: 60, plan: (t) => ({ b: t < TAP ? Btn.A : 0 }), own: [0, TAP] },
  { name: 'hit', dist: 70, lead: 0, span: 50, plan: (t) => ({ b: t < TAP ? Btn.A : 0 }), own: [0, TAP] },
  { name: 'air', dist: 600, lead: 0, span: 70, plan: (t) => ({ b: t < 8 ? Btn.Jump : 0 }) },
  { name: 'airchain', dist: 600, lead: 0, span: 50, plan: (t) => ({ b: t < 8 ? Btn.Jump : t >= 14 && t < 14 + TAP ? Btn.A : 0 }), own: [14, 14 + TAP] },
  { name: 'roll', dist: 600, lead: 0, span: 40, plan: (t) => ({ b: t < 2 ? Btn.Roll : 0 }) },
  { name: 'stun', dist: 70, lead: 0, span: 50, plan: () => ({ b: 0 }), foeHitsBack: true },
];

function setup(h: number, dist: number) {
  const world = new World({ arenaId: 'training', wins: ROUND.defaultWins, roundTime: ROUND.defaultTime });
  const a = world.addFighter(1, 0, 'A', sanitizeLoadout({ hero: h }), true);
  const b = world.addFighter(2, 1, 'B', sanitizeLoadout({ hero: 13 === h ? 0 : 13 }), true);
  world.start();
  let seq = 0;
  while (world.phase !== 'fight' && world.tick < 3000) {
    a.inputs.push(cmd(seq++));
    b.inputs.push(cmd(seq));
    world.step();
  }
  const mid = world.arena.w / 2;
  a.s.x = mid - dist / 2;
  b.s.x = mid + dist / 2;
  a.s.y = b.s.y = world.arena.floor;
  a.s.vx = a.s.vy = b.s.vx = b.s.vy = 0;
  a.s.face = 1;
  b.s.face = -1;
  b.s.hp = 1e6;
  if (STANCE_ON) a.s.stance = 1;
  return { world, a, b, seq: seq + 10 };
}

interface Trace {
  /** new moves (moveSeq bumps) and charge/guard starts, per tick */
  starts: number[];
  acts: number[];
  ground: number[];
  cut: string[];
}

function run(h: number, sc: Scenario, tapAt: number, btn: number, len = 150): Trace {
  const { world, a, b, seq: seq0 } = setup(h, sc.dist);
  let seq = seq0;
  const tr: Trace = { starts: [], acts: [], ground: [], cut: [] };
  let lastSeq = a.s.moveSeq;
  let lastAct = a.s.act;
  let moveStart = 0;
  let curMove = -1;
  let stunSeen = 0;
  for (let t = 0; t < len; t++) {
    const p = sc.plan(t);
    let bt = p.b;
    if (tapAt >= 0 && t >= tapAt && t < tapAt + TAP) bt |= btn;
    a.inputs.push(cmd(seq++, bt, p.x ?? 0, p.y ?? 0));
    // the foe stands still, or (stun) swings once at the start so the hero is recovering from a hit
    b.inputs.push(cmd(seq, sc.foeHitsBack && t < 3 ? Btn.A : 0));
    const hpBefore = a.s.hp;
    world.step();
    const s = a.s;
    const hit = s.hp < hpBefore || s.act === Act.Stun;
    if (hit) stunSeen = t;
    // cut short: an attack that ends early with no new move and no hit
    let started = 0;
    if (s.moveSeq !== lastSeq) started = 1;
    if ((s.act === Act.Charge || s.act === Act.Block) && lastAct !== s.act) started = 1;
    // (a plunge skips to its recovery when it lands, so it is never "short")
    if (lastAct === Act.Attack && s.act !== Act.Attack && curMove >= 0 && curMove !== MOVE_PLUNGE && !hit && !started && s.moveSeq === lastSeq) {
      const m = moveOf(a.load.weapons[s.slot], curMove);
      if (m) {
        const ran = world.tick - moveStart;
        const rec = m.recovery * heroClass(a.load).recovery;
        const full = m.startup + m.active + rec * 0.7;
        if (ran < full - 2) tr.cut.push(`move ${curMove} ran ${ran}/${Math.round(m.startup + m.active + rec)} ticks (${s.ground ? 'ground' : 'air'}, now act ${s.act})`);
      }
    }
    if (s.moveSeq !== lastSeq) {
      moveStart = world.tick;
      curMove = s.move;
    }
    tr.starts.push(started);
    tr.acts.push(s.act);
    tr.ground.push(s.ground);
    lastSeq = s.moveSeq;
    lastAct = s.act;
  }
  void stunSeen;
  return tr;
}

const sum = (xs: number[], from: number, to: number) => xs.slice(from, to).reduce((x, y) => x + y, 0);

let lost = 0;
let slow = 0;
const cuts = new Map<string, string>();
const rows: string[] = [];
for (let h = 0; h < HEROES.length; h++) {
  if (ONLY >= 0 && h !== ONLY) continue;
  for (const sc of SCENARIOS) {
    for (const [bn, btn] of [['A', Btn.A], ['B', Btn.B]] as const) {
      const base = run(h, sc, -1, btn);
      for (const c of base.cut) cuts.set(`${HEROES[h].name} ${sc.name}: ${c}`, '');
      const bad: number[] = [];
      const late: string[] = [];
      for (let k = 0; k < sc.span; k++) {
        const t = sc.lead + k;
        if (sc.own && t >= sc.own[0] - TAP && t <= sc.own[1]) continue;
        const tr = run(h, sc, t, btn);
        for (const c of tr.cut) cuts.set(`${HEROES[h].name} ${sc.name} +${bn}@${t}: ${c}`, '');
        // the first tick from the tap on where the hero is free (not attacking, rolling, stunned...) in the BASE timeline
        let free = t;
        while (free < base.acts.length && base.acts[free] !== Act.Free) free++;
        const until = Math.min(tr.starts.length, free + GRACE + TAP);
        const extra = sum(tr.starts, t, until) - sum(base.starts, t, until);
        if (extra <= 0) {
          // did it start later than that? (a late start: the press was kept but felt dead)
          const later = sum(tr.starts, t, tr.starts.length) - sum(base.starts, t, base.starts.length);
          if (later > 0) late.push(String(t));
          else bad.push(t);
        }
      }
      if (bad.length || late.length) {
        lost += bad.length;
        slow += late.length;
        rows.push(`${HEROES[h].name.padEnd(20)} ${sc.name.padEnd(9)} ${bn}: lost at ${fmt(bad)}${late.length ? `  late at ${fmt(late.map(Number))}` : ''}`);
      }
    }
  }
}

function fmt(ts: number[]) {
  if (!ts.length) return '-';
  const out: string[] = [];
  let a = ts[0];
  let p = ts[0];
  for (const t of [...ts.slice(1), Infinity]) {
    if (t === p + 1) {
      p = t;
      continue;
    }
    out.push(a === p ? `${a}` : `${a}-${p}`);
    a = p = t;
  }
  return out.join(',');
}

console.log(rows.join('\n') || 'no lost presses');
console.log(`\nlost presses: ${lost}, late: ${slow} (tap ${TAP} ticks)`);
if (cuts.size) {
  console.log(`\nswings cut short: ${cuts.size}`);
  for (const k of [...cuts.keys()].slice(0, VERBOSE ? 400 : 25)) console.log('  ' + k);
}
