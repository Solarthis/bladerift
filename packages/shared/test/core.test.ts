import { describe, expect, it } from 'vitest';
import {
  Act, BotBrain, Btn, decodeSnapshot, emptyInput, encodeSnapshot, encodeSnapshotBody, FIGHTER, FoeView, InputCmd, newFighterState, ROUND, SkillId,
  stepFighter, getArena, World, WeaponId, WEAPONS, copyState, Loadout, CLASSES, sanitizeLoadout, stanceWeapon,
} from '../src/index';

const MAXHP = CLASSES[0].hp;
/** Richard's loadout as the sim sees it: his sword, and a shield in slot B so the block tests can raise it. Skill = his own special. */
const LOAD: Loadout = { weapons: [WeaponId.Sword, WeaponId.Shield], skill: SkillId.LionsRoar, cls: 0, hero: 0 };

function cmd(seq: number, moveX = 0, buttons = 0, moveY = 0): InputCmd {
  return { seq, moveX, moveY, buttons, viewTick: 0 };
}

/** A two-fighter world past its intro, fighters `gap` apart in the middle. */
function duel(a: Loadout = LOAD, b: Loadout = LOAD, gap = 40) {
  const w = new World({ arenaId: 'bridge', wins: 2, roundTime: 90 });
  const fa = w.addFighter(1, 0, 'A', a);
  const fb = w.addFighter(2, 1, 'B', b);
  w.start();
  for (let i = 0; i < ROUND.introTicks + 1; i++) w.step();
  expect(w.phase).toBe('fight');
  fa.s.x = 600;
  fb.s.x = 600 + gap;
  fa.s.face = 1;
  fb.s.face = -1;
  return { w, fa, fb };
}

/** Feed both fighters per-tick commands for n ticks. */
function run(w: World, n: number, a: (i: number) => InputCmd, b: (i: number) => InputCmd = (i) => cmd(i)) {
  const fa = w.fighters.get(1)!;
  const fb = w.fighters.get(2)!;
  for (let i = 0; i < n; i++) {
    fa.inputs.push(a(fa.lastSeq + 1));
    fb.inputs.push(b(fb.lastSeq + 1));
    w.step();
  }
}

describe('fighter movement', () => {
  it('runs, jumps, double-jumps and lands on the floor', () => {
    const arena = getArena('bridge');
    const s = newFighterState(300, arena.floor, 1);
    for (let i = 0; i < 30; i++) stepFighter(s, cmd(i, 1), arena, LOAD);
    expect(s.x).toBeGreaterThan(400);
    stepFighter(s, cmd(31, 0, Btn.Jump), arena, LOAD);
    expect(s.vy).toBeLessThan(0);
    for (let i = 0; i < 8; i++) stepFighter(s, cmd(32 + i, 0, Btn.Jump), arena, LOAD);
    stepFighter(s, cmd(40, 0, 0), arena, LOAD);
    stepFighter(s, cmd(41, 0, Btn.Jump), arena, LOAD);
    expect(s.jumps).toBe(0);
    for (let i = 0; i < 120; i++) stepFighter(s, cmd(42 + i), arena, LOAD);
    expect(s.ground).toBe(1);
    expect(s.y).toBe(arena.floor);
  });

  it('lands on a one-way platform and drops through it', () => {
    const arena = getArena('bridge');
    const p = arena.platforms[0];
    const s = newFighterState(p.x + 50, p.y - 60, 1);
    s.ground = 0;
    for (let i = 0; i < 40; i++) stepFighter(s, cmd(i), arena, LOAD);
    expect(s.y).toBe(p.y);
    stepFighter(s, cmd(50, 0, Btn.Jump, 1), arena, LOAD);
    for (let i = 0; i < 60; i++) stepFighter(s, cmd(51 + i), arena, LOAD);
    expect(s.y).toBe(arena.floor);
  });

  it('is deterministic: replaying the same commands gives the same state (client prediction)', () => {
    const arena = getArena('grove');
    // an Assassin: its Flash Step (a dodge that is also a cancel) and the air charges, plus attacks and its special
    const load = sanitizeLoadout({ hero: 7 });
    const foe: FoeView = { x: 700, y: arena.floor, face: -1 };
    const a = newFighterState(400, arena.floor, 1, load.cls);
    const cmds: InputCmd[] = [];
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    // buttons: Jump, A, B, Skill, Roll, Heal (one bit each), now and then
    for (let i = 0; i < 900; i++) cmds.push(cmd(i, rnd() * 2 - 1, rnd() < 0.2 ? 1 << Math.floor(rnd() * 6) : 0, rnd() < 0.1 ? (rnd() < 0.5 ? 1 : -1) : 0));
    const b = copyState(a);
    // the new state must actually be exercised: count the dodges, the specials and the attacks on the first replay
    let dodges = 0;
    let airDodges = 0;
    let specials = 0;
    let attacks = 0;
    for (const c of cmds) {
      const before = a.act;
      stepFighter(a, c, arena, load, foe);
      if (a.act === Act.Roll && a.rollAir === 2 && before !== Act.Roll) {
        dodges++;
        if (!a.ground || a.vy < 0) airDodges++;
      }
      if (a.act === Act.Skill && before !== Act.Skill) specials++;
      if (a.act === Act.Attack && before !== Act.Attack) attacks++;
    }
    for (const c of cmds) stepFighter(b, c, arena, load, foe);
    expect(dodges, 'dodges in the run').toBeGreaterThan(0);
    expect(airDodges, 'air dodges in the run').toBeGreaterThan(0);
    expect(specials, 'specials in the run').toBeGreaterThan(0);
    expect(attacks, 'attacks in the run').toBeGreaterThan(0);
    expect(b).toEqual(a);
  });
});

describe('combat', () => {
  it('a sword swing hits once per move and the combo chains', () => {
    const { w, fb } = duel();
    run(w, 30, (i) => cmd(i, 0, i % 2 ? Btn.A : 0));
    expect(fb.s.hp).toBeLessThan(MAXHP);
    const hp1 = fb.s.hp;
    expect(MAXHP - hp1).toBeGreaterThanOrEqual(WEAPONS[WeaponId.Sword].combo[0].dmg);
  });

  it('a roll dodges a swing (invulnerable frames)', () => {
    const { w, fb } = duel();
    // B rolls just before A's swing becomes active
    run(w, 40, (i) => cmd(i, 0, i === 1 ? Btn.A : 0), (i) => cmd(i, 1, i === 2 ? Btn.Roll : 0));
    expect(fb.s.hp).toBe(MAXHP);
  });

  it('a held shield blocks (chip damage) and a fresh block parries and stuns the attacker', () => {
    const { w, fa, fb } = duel();
    // B raises the shield early and holds it: block, not parry
    run(w, 40, (i) => cmd(i, 0, i === 20 ? Btn.A : 0), (i) => cmd(i, 0, Btn.B));
    expect(fb.s.hp).toBeLessThan(MAXHP);
    expect(fb.s.hp).toBeGreaterThan(MAXHP - 30);
    // parry: raise the shield just as the swing lands
    const p = duel();
    const startup = WEAPONS[WeaponId.Sword].combo[0].startup;
    run(p.w, 12, (i) => cmd(i, 0, i === 1 ? Btn.A : 0), (i) => cmd(i, 0, i >= startup - 2 ? Btn.B : 0));
    expect(p.fb.s.hp).toBe(MAXHP);
    expect(p.fa.s.act).toBe(Act.Stun);
    void fa;
  });

  it('the hammer slam breaks a guard', () => {
    const { w, fb } = duel({ weapons: [WeaponId.Hammer, WeaponId.Bow], skill: SkillId.LionsRoar, cls: 0, hero: 0 }, LOAD, 60);
    run(w, 200, (i) => cmd(i, 0, i % 4 === 1 ? Btn.A : 0), (i) => cmd(i, 0, Btn.B));
    expect(fb.s.hp).toBeLessThan(MAXHP - 100);
  });

  it('arrows fly and hit at range', () => {
    const { w, fb } = duel({ weapons: [WeaponId.Bow, WeaponId.Sword], skill: SkillId.NineLives, cls: 0, hero: 0 }, LOAD, 360);
    run(w, 80, (i) => cmd(i, 0, i >= 2 && i <= 4 ? Btn.A : 0));
    expect(fb.s.hp).toBeLessThan(MAXHP);
  });

  it('specials: a shot hits at range, and a slow and a root land from their own heroes', () => {
    // (every special is covered one by one in specials.test.ts; these three stand for the kinds of effect)
    const shot = duel(sanitizeLoadout({ hero: 1 }), LOAD, 250);
    run(shot.w, 40, (i) => cmd(i, 0, i === 2 ? Btn.Skill : 0));
    expect(shot.fb.s.hp, 'Nine Lives').toBeLessThan(MAXHP);

    const slow = duel(sanitizeLoadout({ hero: 5 }), LOAD, 200);
    run(slow.w, 30, (i) => cmd(i, 0, i === 2 ? Btn.Skill : 0));
    expect(slow.fb.s.slowT, 'Phantom Stars').toBeGreaterThan(0);

    const root = duel(sanitizeLoadout({ hero: 4 }), LOAD, 200);
    run(root.w, 30, (i) => cmd(i, 0, i === 2 ? Btn.Skill : 0));
    expect(root.fb.s.rootT, 'Chain Lash').toBeGreaterThan(0);
  });

  it('the heal flask heals once per round', () => {
    const { w, fa } = duel(LOAD, LOAD, 500);
    fa.s.hp = 400;
    run(w, 60, (i) => cmd(i, 0, i === 2 || i === 30 ? Btn.Heal : 0));
    expect(fa.s.hp).toBeCloseTo(400 + FIGHTER.healAmount, 0);
    expect(fa.s.flask).toBe(0);
  });
});

describe('rounds and matches', () => {
  it('bots finish a best-of-3 match on every arena', () => {
    for (const arenaId of ['hall', 'bridge', 'embers', 'crypt', 'grove']) {
      const w = new World({ arenaId, wins: 2, roundTime: 60 });
      const loads: Loadout[] = [
        { weapons: [WeaponId.Scythe, WeaponId.Bow], skill: SkillId.InkBlot, cls: 0, hero: 0 },
        { weapons: [WeaponId.Lance, WeaponId.Shield], skill: SkillId.PhantomStars, cls: 0, hero: 0 },
      ];
      w.addFighter(1, 0, 'A', loads[0], true);
      w.addFighter(2, 1, 'B', loads[1], true);
      const bots = [new BotBrain(1, 11, 'hard'), new BotBrain(2, 22, 'hard')];
      w.start();
      let ticks = 0;
      while (w.phase !== 'over' && ticks < 60 * 60 * 8) {
        w.fighters.get(1)!.inputs.push(bots[0].think(w));
        w.fighters.get(2)!.inputs.push(bots[1].think(w));
        w.step();
        ticks++;
      }
      expect(w.phase, arenaId).toBe('over');
      expect(Math.max(...w.wins)).toBe(2);
      // the fight produced real hits, not only time-outs
      expect([...w.fighters.values()].some((f) => f.hits > 5), arenaId).toBe(true);
    }
  });

  it('time-out awards the round to the healthier fighter', () => {
    const w = new World({ arenaId: 'crypt', wins: 1, roundTime: 2 });
    const a = w.addFighter(1, 0, 'A', LOAD);
    w.addFighter(2, 1, 'B', LOAD);
    w.start();
    a.s.hp = 999;
    for (let i = 0; i < ROUND.introTicks + 3 * 60 + ROUND.koTicks + 5; i++) w.step();
    expect(w.phase).toBe('over');
    expect(w.winner).toBe(1);
  });
});

describe('protocol', () => {
  it('round-trips a snapshot with the full self state', () => {
    // a Chain Lash in flight (a projectile with its hero's skin), then the self state of a dodge (its roll flags)
    const { w, fa } = duel(sanitizeLoadout({ hero: 4 }), LOAD, 300);
    run(w, 10, (i) => cmd(i, 0, i === 2 ? Btn.Skill : 0));
    run(w, 4, (i) => cmd(i, 0, Btn.A));
    const body = encodeSnapshotBody(w, w.events);
    const snap = decodeSnapshot(encodeSnapshot(w, 1, body));
    expect(snap.self).not.toBeNull();
    for (const k of Object.keys(fa.s) as (keyof typeof fa.s)[]) expect(snap.self![k], k).toBeCloseTo(fa.s[k], 3);
    expect(snap.fighters).toHaveLength(2);
    expect(snap.fighters[0].weapons).toEqual([...sanitizeLoadout({ hero: 4 }).weapons, stanceWeapon(4), stanceWeapon(4)]);
    expect(snap.fighters[0].skill).toBe(SkillId.ChainLash);
    expect(snap.phase).toBe('fight');
    expect(snap.projectiles.length).toBeGreaterThan(0);
    expect(snap.projectiles.every((p) => p.skin === SkillId.ChainLash + 1)).toBe(true);
    void emptyInput;
  });

  it('round-trips a dodge in progress: the roll flags of the self state and the other fighter', () => {
    // Hassan's Flash Step in the air (a step with the air-dash flag), then a snapshot mid-dodge
    const { w, fa } = duel(sanitizeLoadout({ hero: 7 }), LOAD, 300);
    fa.s.ground = 0;
    fa.s.y = w.arena.floor - 200;
    run(w, 1, (i) => cmd(i, 1, Btn.Roll));
    expect(fa.s.act).toBe(Act.Roll);
    expect(fa.s.rollAir).toBe(2);
    const snap = decodeSnapshot(encodeSnapshot(w, 1, encodeSnapshotBody(w, w.events)));
    expect(snap.self!.rollAir).toBe(2);
    expect(snap.self!.act).toBe(Act.Roll);
    expect(snap.fighters[0].rollAir).toBe(true);
    expect(snap.fighters[0].cls).toBe(sanitizeLoadout({ hero: 7 }).cls);
    expect(snap.fighters[0].hero).toBe(7);
  });
});
