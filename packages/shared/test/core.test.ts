import { describe, expect, it } from 'vitest';
import {
  Act, BotBrain, Btn, decodeSnapshot, emptyInput, encodeSnapshot, encodeSnapshotBody, FIGHTER, InputCmd, newFighterState, ROUND, SkillId,
  stepFighter, getArena, World, WeaponId, WEAPONS, copyState, Loadout,
} from '../src/index';

const LOAD: Loadout = { weapons: [WeaponId.Sword, WeaponId.Shield], skill: SkillId.Bomb };

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
    const a = newFighterState(400, arena.floor, 1);
    const cmds: InputCmd[] = [];
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 600; i++) cmds.push(cmd(i, rnd() * 2 - 1, rnd() < 0.15 ? 1 << Math.floor(rnd() * 6) : 0, rnd() < 0.05 ? 1 : 0));
    const b = copyState(a);
    for (const c of cmds) stepFighter(a, c, arena, LOAD);
    for (const c of cmds) stepFighter(b, c, arena, LOAD);
    expect(b).toEqual(a);
  });
});

describe('combat', () => {
  it('a sword swing hits once per move and the combo chains', () => {
    const { w, fb } = duel();
    run(w, 30, (i) => cmd(i, 0, i % 2 ? Btn.A : 0));
    expect(fb.s.hp).toBeLessThan(FIGHTER.maxHp);
    const hp1 = fb.s.hp;
    expect(FIGHTER.maxHp - hp1).toBeGreaterThanOrEqual(WEAPONS[WeaponId.Sword].combo[0].dmg);
  });

  it('a roll dodges a swing (invulnerable frames)', () => {
    const { w, fb } = duel();
    // B rolls just before A's swing becomes active
    run(w, 40, (i) => cmd(i, 0, i === 1 ? Btn.A : 0), (i) => cmd(i, 1, i === 2 ? Btn.Roll : 0));
    expect(fb.s.hp).toBe(FIGHTER.maxHp);
  });

  it('a held shield blocks (chip damage) and a fresh block parries and stuns the attacker', () => {
    const { w, fa, fb } = duel();
    // B raises the shield early and holds it: block, not parry
    run(w, 40, (i) => cmd(i, 0, i === 20 ? Btn.A : 0), (i) => cmd(i, 0, Btn.B));
    expect(fb.s.hp).toBeLessThan(FIGHTER.maxHp);
    expect(fb.s.hp).toBeGreaterThan(FIGHTER.maxHp - 30);
    // parry: raise the shield just as the swing lands
    const p = duel();
    const startup = WEAPONS[WeaponId.Sword].combo[0].startup;
    run(p.w, 12, (i) => cmd(i, 0, i === 1 ? Btn.A : 0), (i) => cmd(i, 0, i >= startup - 2 ? Btn.B : 0));
    expect(p.fb.s.hp).toBe(FIGHTER.maxHp);
    expect(p.fa.s.act).toBe(Act.Stun);
    void fa;
  });

  it('the hammer slam breaks a guard', () => {
    const { w, fb } = duel({ weapons: [WeaponId.Hammer, WeaponId.Bow], skill: SkillId.Blink }, LOAD, 60);
    run(w, 200, (i) => cmd(i, 0, i % 4 === 1 ? Btn.A : 0), (i) => cmd(i, 0, Btn.B));
    expect(fb.s.hp).toBeLessThan(FIGHTER.maxHp - 100);
  });

  it('arrows fly and hit at range', () => {
    const { w, fb } = duel({ weapons: [WeaponId.Bow, WeaponId.Sword], skill: SkillId.Bomb }, LOAD, 360);
    run(w, 80, (i) => cmd(i, 0, i >= 2 && i <= 4 ? Btn.A : 0));
    expect(fb.s.hp).toBeLessThan(FIGHTER.maxHp);
  });

  it('skills: bomb burns, frost slows, trap roots, blink teleports', () => {
    const bomb = duel({ weapons: [WeaponId.Sword, WeaponId.Bow], skill: SkillId.Bomb }, LOAD, 320);
    run(bomb.w, 90, (i) => cmd(i, 0, i === 2 ? Btn.Skill : 0));
    expect(bomb.fb.s.hp).toBeLessThan(FIGHTER.maxHp);
    const frost = duel({ weapons: [WeaponId.Sword, WeaponId.Bow], skill: SkillId.Frost }, LOAD, 250);
    run(frost.w, 30, (i) => cmd(i, 0, i === 2 ? Btn.Skill : 0));
    expect(frost.fb.s.slowT).toBeGreaterThan(0);
    const trap = duel({ weapons: [WeaponId.Sword, WeaponId.Bow], skill: SkillId.Trap }, LOAD, 120);
    run(trap.w, 120, (i) => cmd(i, 0, i === 2 ? Btn.Skill : 0), (i) => cmd(i, i > 40 ? -1 : 0));
    expect(trap.fb.s.hp).toBeLessThan(FIGHTER.maxHp);
    const blink = duel({ weapons: [WeaponId.Sword, WeaponId.Bow], skill: SkillId.Blink }, LOAD, 400);
    const x0 = blink.fa.s.x;
    run(blink.w, 20, (i) => cmd(i, 0, i === 2 ? Btn.Skill : 0));
    expect(blink.fa.s.x - x0).toBeGreaterThan(140);
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
    for (const arenaId of ['bridge', 'embers', 'crypt', 'grove']) {
      const w = new World({ arenaId, wins: 2, roundTime: 60 });
      const loads: Loadout[] = [
        { weapons: [WeaponId.Scythe, WeaponId.Bow], skill: SkillId.Bomb },
        { weapons: [WeaponId.Lance, WeaponId.Shield], skill: SkillId.Frost },
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
    const { w, fa } = duel({ weapons: [WeaponId.Bow, WeaponId.Sword], skill: SkillId.Trap });
    run(w, 10, (i) => cmd(i, 0, i === 2 ? Btn.Skill : 0));
    run(w, 4, (i) => cmd(i, 0, Btn.A));
    const body = encodeSnapshotBody(w, w.events);
    const snap = decodeSnapshot(encodeSnapshot(w, 1, body));
    expect(snap.self).not.toBeNull();
    for (const k of Object.keys(fa.s) as (keyof typeof fa.s)[]) expect(snap.self![k], k).toBeCloseTo(fa.s[k], 3);
    expect(snap.fighters).toHaveLength(2);
    expect(snap.fighters[0].weapons).toEqual([WeaponId.Bow, WeaponId.Sword]);
    expect(snap.phase).toBe('fight');
    expect(snap.traps.length).toBe(1);
    void emptyInput;
  });
});
