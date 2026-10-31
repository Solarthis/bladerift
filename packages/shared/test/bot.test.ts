import { describe, expect, it } from 'vitest';
import { Act, BotBrain, BotDifficulty, botLoadout, Btn, Fighter, InputCmd, Loadout, SkillId, World, WeaponId } from '../src/index';
import { sanitizeLoadout } from '../src/heroes';

const ARENAS = ['bridge', 'embers', 'crypt', 'grove'];
/** Upper bound on a match in ticks: three 60 s rounds plus intros and KO pauses fit well inside it. */
const CAP = 60 * 60 * 8;
const DEFAULT: Loadout = { weapons: [WeaponId.Sword, WeaponId.Shield], skill: SkillId.LionsRoar };

interface Side {
  level: BotDifficulty;
  seed: number;
  load: Loadout;
}

/**
 * Plays one bot-vs-bot match to its end (or the cap). `watch` sees every decision of seat A, before the tick is
 * stepped, so it can read the fighter's state the decision was made from.
 */
function playMatch(arenaId: string, a: Side, b: Side, watch?: (f: Fighter, cmd: InputCmd, w: World) => void, roundTime = 60) {
  const w = new World({ arenaId, wins: 2, roundTime });
  const fa = w.addFighter(1, 0, 'A', a.load, true);
  const fb = w.addFighter(2, 1, 'B', b.load, true);
  const ba = new BotBrain(1, a.seed, a.level);
  const bb = new BotBrain(2, b.seed, b.level);
  w.start();
  let ticks = 0;
  while (w.phase !== 'over' && ticks < CAP) {
    const ca = ba.think(w);
    const cb = bb.think(w);
    watch?.(fa, ca, w);
    fa.inputs.push(ca);
    fb.inputs.push(cb);
    w.step();
    ticks++;
  }
  return { w, ticks, fa, fb };
}

/** Loadouts that between them put every kind of special in play: a shot, a dash, an aura and a second shot. */
// real hero kits (the hero fixes weapon, special and dodge): a swordsman, an archer, a lancer, an assassin
const LOADOUTS: Loadout[] = [0, 1, 3, 7].map((hero) => sanitizeLoadout({ hero }));

const ALL_BUTTONS = [Btn.Jump, Btn.A, Btn.B, Btn.Skill, Btn.Roll, Btn.Heal];

describe('bot vs bot', () => {
  for (const level of ['easy', 'normal', 'hard'] as BotDifficulty[]) {
    it(`${level} finishes a match on every arena`, () => {
      for (const arena of ARENAS) {
        const { w, ticks } = playMatch(arena, { level, seed: 11, load: botLoadout(11) }, { level, seed: 22, load: botLoadout(22) });
        expect(w.phase, `${level} on ${arena} after ${ticks} ticks`).toBe('over');
        expect(Math.max(...w.wins), `${level} on ${arena}`).toBe(2);
      }
    });
  }

  it('is deterministic for a given seed', () => {
    const run = () => {
      const { w, ticks, fa, fb } = playMatch('embers', { level: 'hard', seed: 5, load: botLoadout(5) }, { level: 'normal', seed: 6, load: botLoadout(6) });
      return [ticks, w.winner, w.wins.join(), fa.s.hp, fb.s.hp, fa.hits, fb.hits].join(',');
    };
    expect(run()).toBe(run());
  });

  it('hard beats easy in most seeded matches', () => {
    let hardWins = 0;
    for (let i = 0; i < 10; i++) {
      const hardSeat = i % 2; // alternate seats so neither side has a positional edge
      const hard: Side = { level: 'hard', seed: 100 + i, load: botLoadout(100 + i) };
      const easy: Side = { level: 'easy', seed: 200 + i, load: botLoadout(200 + i) };
      const { w } = playMatch(ARENAS[i % ARENAS.length], hardSeat === 0 ? hard : easy, hardSeat === 0 ? easy : hard);
      expect(w.phase).toBe('over');
      if (w.winner === hardSeat) hardWins++;
    }
    expect(hardWins).toBeGreaterThanOrEqual(7);
  });

  it('handles every weapon in either slot', () => {
    for (let wpn = 0; wpn < 7; wpn++) {
      for (const slot of [0, 1]) {
        const other = wpn === WeaponId.Sword ? WeaponId.Bow : WeaponId.Sword;
        const weapons: [WeaponId, WeaponId] = slot === 0 ? [wpn, other] : [other, wpn];
        const load: Loadout = { weapons, skill: (wpn % 4) as SkillId };
        const { w, fa, fb } = playMatch('bridge', { level: 'hard', seed: 40 + wpn * 2 + slot, load }, { level: 'normal', seed: 9, load: DEFAULT });
        const label = `weapon ${wpn} in slot ${slot}`;
        expect(w.phase, label).toBe('over');
        expect(fa.hits + fb.hits, label).toBeGreaterThan(0);
      }
    }
  });

  it('uses every one of its buttons over a match, for several loadouts', () => {
    // the buttons seen across three matches on each arena (12 per loadout) must cover all of them
    for (const load of LOADOUTS) {
      let used = 0;
      for (const arena of ARENAS) {
        for (const seed of [3, 5, 7]) {
          playMatch(arena, { level: 'hard', seed, load }, { level: 'hard', seed: seed + 1, load: DEFAULT }, (_f, c) => {
            used |= c.buttons;
          });
        }
      }
      for (const b of ALL_BUTTONS) expect(used & b, `loadout ${load.weapons.join('/')} button ${b}`).toBe(b);
    }
  });

  it('platforms: drops through to reach an opponent below, and jumps up to one above', () => {
    for (const [ownY, foeY, drops] of [[470, 600, true], [600, 470, false]] as const) {
      const w = new World({ arenaId: 'bridge', wins: 2, roundTime: 60 });
      const fa = w.addFighter(1, 0, 'A', DEFAULT, true);
      const fb = w.addFighter(2, 1, 'B', DEFAULT, true);
      const bot = new BotBrain(1, 5, 'hard');
      w.start();
      for (let i = 0; i < 160; i++) {
        fa.inputs.push(bot.think(w));
        fb.inputs.push({ seq: i + 1, moveX: 0, moveY: 0, buttons: 0, viewTick: 0 });
        w.step();
      }
      fa.s.x = 280;
      fa.s.y = ownY;
      fa.s.ground = 1;
      fa.s.vy = 0;
      fb.s.x = 300;
      fb.s.y = foeY;
      fb.s.ground = 1;
      let saw = false;
      let landed = false;
      for (let i = 0; i < 200; i++) {
        const c = bot.think(w);
        if (drops ? c.moveY > 0 && c.buttons & Btn.Jump : c.buttons & Btn.Jump) saw = true;
        if (drops && fa.s.y >= 600) landed = true;
        fa.inputs.push(c);
        fb.inputs.push({ seq: 1000 + i, moveX: 0, moveY: 0, buttons: 0, viewTick: 0 });
        w.step();
        if (!drops && fa.s.y < 600) landed = true;
      }
      expect(saw, drops ? 'drop-through press' : 'jump press').toBe(true);
      expect(landed, drops ? 'reached the floor' : 'left the floor').toBe(true);
    }
  });

  it('never sends the same press every tick: a button is only held while guarding or charging', () => {
    for (const load of LOADOUTS) {
      for (const level of ['normal', 'hard'] as BotDifficulty[]) {
        let prev = 0;
        let violations = 0;
        const run = [0, 0];
        let longest = 0;
        playMatch(
          ARENAS[1],
          { level, seed: 7, load },
          { level, seed: 8, load: DEFAULT },
          (f, c) => {
            const repeated = c.buttons & prev;
            const holding = f.s.act === Act.Block || f.s.act === Act.Charge;
            if (repeated && !holding) violations++;
            for (const [i, b] of [Btn.A, Btn.B].entries()) {
              run[i] = c.buttons & b ? run[i] + 1 : 0;
              longest = Math.max(longest, run[i]);
            }
            prev = c.buttons;
          },
        );
        expect(violations, `${level} ${load.weapons.join('/')} repeated presses`).toBe(0);
        expect(longest, `${level} ${load.weapons.join('/')} longest guard or charge`).toBeLessThanOrEqual(60);
      }
    }
  });

  it('never stands still doing nothing for long, and does not jitter left and right', () => {
    for (const level of ['easy', 'normal', 'hard'] as BotDifficulty[]) {
      let idle = 0;
      let longestIdle = 0;
      let flips = 0;
      let ticks = 0;
      let lastDir = 0;
      const r = playMatch(ARENAS[2], { level, seed: 17, load: botLoadout(17) }, { level, seed: 18, load: botLoadout(18) }, (f, c, w) => {
        // only ticks the bot is free to act in count: intros, KO pauses, stuns and hangs are not its choice
        if (w.phase !== 'fight' || f.s.act !== Act.Free) {
          idle = 0;
          lastDir = 0;
          return;
        }
        ticks++;
        idle = c.moveX === 0 && c.buttons === 0 ? idle + 1 : 0;
        longestIdle = Math.max(longestIdle, idle);
        if (c.moveX !== 0) {
          const d = Math.sign(c.moveX);
          if (lastDir !== 0 && d !== lastDir) flips++;
          lastDir = d;
        }
      });
      expect(r.w.phase).toBe('over');
      expect(longestIdle, `${level} longest idle stretch`).toBeLessThanOrEqual(60);
      expect(flips, `${level} direction flips over ${ticks} ticks`).toBeLessThan(ticks / 12);
    }
  });
});
