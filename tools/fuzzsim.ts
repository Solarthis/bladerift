// Headless bug hunt: bot-vs-bot matches over every hero pairing and arena, watching each tick for states a player would
// call a bug. Run from the repo root: npx tsx tools/fuzzsim.ts [--seeds=1] [--easy]
//   stuck      a fighter in one non-idle action for too long (a ledge hang, a stun, a charge or an Art that never ends)
//   frozen     hit-stop / superpause that keeps counting past its cap
//   bounds     outside the arena walls, below the floor, or with a NaN position
//   wall       standing inside a solid block
//   still      neither fighter moved or swung for a long stretch while the round is live (both bots idle)
//   projectiles  a runaway projectile count
import { ARENAS, solidAt } from '../packages/shared/src/arena';
import { BotBrain } from '../packages/shared/src/bot';
import { ROUND, TICK_RATE } from '../packages/shared/src/constants';
import { Act } from '../packages/shared/src/fighter';
import { HEROES, sanitizeLoadout } from '../packages/shared/src/heroes';
import { World } from '../packages/shared/src/world';

const flags = new Map<string, string>();
for (const a of process.argv.slice(2)) {
  const m = /^--([\w-]+)(?:=(.*))?$/.exec(a);
  if (m) flags.set(m[1], m[2] ?? 'true');
}
const SEEDS = Number(flags.get('seeds') ?? 1);
const LEVEL = flags.has('easy') ? 'easy' : 'hard';
const ACT_NAMES = ['Free', 'Attack', 'Charge', 'Roll', 'Stun', 'Heal', 'Block', 'Skill', 'KO', 'Win', 'Ledge', 'Climb', 'Art', 'Down', 'GetUp'];
/** Longest believable stretch per action (ticks). */
const ACT_MAX: Record<number, number> = { [Act.Attack]: 150, [Act.Charge]: 240, [Act.Roll]: 90, [Act.Stun]: 240, [Act.Heal]: 90, [Act.Block]: 600, [Act.Skill]: 120, [Act.Ledge]: 300, [Act.Climb]: 60, [Act.Art]: 400, [Act.Down]: 60, [Act.GetUp]: 30 };

const found = new Map<string, { n: number; first: string }>();
const report = (kind: string, where: string) => {
  const f = found.get(kind);
  if (f) f.n++;
  else found.set(kind, { n: 1, first: where });
};

let matches = 0;
const t0 = Date.now();
for (let a = 0; a < HEROES.length; a++) {
  for (let b = 0; b < HEROES.length; b++) {
    if (a === b) continue;
    for (const arena of ARENAS) {
      for (let k = 0; k < SEEDS; k++) {
        const seed = 1 + a * 131 + b * 17 + k * 7919 + arena.id.length;
        const world = new World({ arenaId: arena.id, wins: ROUND.defaultWins, roundTime: ROUND.defaultTime });
        const fa = world.addFighter(1, 0, 'A', sanitizeLoadout({ hero: a }), true);
        const fb = world.addFighter(2, 1, 'B', sanitizeLoadout({ hero: b }), true);
        const ba = new BotBrain(1, seed, LEVEL);
        const bb = new BotBrain(2, seed + 1, LEVEL);
        world.start();
        const since = [0, 0];
        const lastAct = [-1, -1];
        const lastSeq = [-1, -1];
        const lastStun = [0, 0];
        let quiet = 0;
        const tag = () => `${HEROES[a].name} vs ${HEROES[b].name} on ${arena.id}, tick ${world.tick}`;
        while (world.phase !== 'over' && world.tick < 600 * TICK_RATE) {
          fa.inputs.push(ba.think(world));
          fb.inputs.push(bb.think(world));
          try {
            world.step();
          } catch (e) {
            report('crash: ' + (e as Error).message, tag());
            break;
          }
          const A = world.arena;
          let active = false;
          for (const f of [fa, fb]) {
            const s = f.s;
            const i = f.seat;
            // (a new move, a fresh hit or a freeze is not "stuck")
            if (s.act !== lastAct[i] || s.moveSeq !== lastSeq[i] || s.stun > lastStun[i]) since[i] = 0;
            else if (!s.pause && !s.hitstop) since[i]++;
            lastAct[i] = s.act;
            lastSeq[i] = s.moveSeq;
            lastStun[i] = s.stun;
            if (world.phase === 'fight') {
              const max = ACT_MAX[s.act];
              if (max && since[i] === max) report(`stuck in ${ACT_NAMES[s.act]} (${HEROES[f.load.hero ?? 0].name})`, tag());
              if (s.hitstop > 40 || s.pause > 60) report('frozen', tag());
              if (!Number.isFinite(s.x) || !Number.isFinite(s.y)) report('NaN position', tag());
              else if (s.x < 0 || s.x > A.w || s.y > A.floor + 1 || s.y < -400) report(`bounds (${HEROES[f.load.hero ?? 0].name} ${ACT_NAMES[s.act]} x${Math.round(s.x)} y${Math.round(s.y)})`, tag());
              else if (solidAt(A, s.x, s.y - 20) && s.act !== Act.Climb && s.act !== Act.Ledge) report(`inside a wall (${HEROES[f.load.hero ?? 0].name} ${ACT_NAMES[s.act]})`, tag());
              if (s.act !== Act.Free || Math.abs(s.vx) > 30) active = true;
            }
          }
          if (world.phase === 'fight') {
            quiet = active ? 0 : quiet + 1;
            if (quiet === 6 * TICK_RATE) report('both idle 6 s', tag());
            if (world.projectiles.length > 80) report('projectiles > 80', tag());
          }
          world.events.length = 0;
        }
        if (world.phase !== 'over') report('match never ended (10 min)', tag());
        matches++;
      }
    }
  }
}
console.log(`${matches} matches, ${((Date.now() - t0) / 1000).toFixed(1)} s, bots ${LEVEL}`);
if (!found.size) console.log('nothing found');
for (const [k, v] of [...found].sort((x, y) => y[1].n - x[1].n)) console.log(`${String(v.n).padStart(5)}  ${k}\n       first: ${v.first}`);
