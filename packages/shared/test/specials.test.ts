import { describe, expect, it } from 'vitest';
import {
  Act, Btn, CLASSES, classOf, FIGHTER, GameEvent, getArena, HEROES, Loadout, ROUND, SKILLS, SkillDef, sanitizeLoadout, SkillId, World, WeaponId,
} from '../src/index';

/**
 * Every hero's signature special (weapons.ts SKILLS; skill N belongs to hero N). Each hero casts it at an opponent placed in
 * range (the distance comes from the table: a fraction of the shot's reach, the aura's radius, or the dash's length), and the
 * effects are checked against the table. Tests marked `it.fails` are known sim bugs (the comment names the cause): they pass
 * while the bug is present and start failing once it is fixed - then drop the `.fails`.
 */

/** The defender: a plain sword and shield (the shield is only raised when a test holds it). */
const DEFENDER: Loadout = { weapons: [WeaponId.Sword, WeaponId.Shield], skill: SkillId.LionsRoar, cls: 0, hero: 0 };
const BTN_GUARD = Btn.B;

/** A two-fighter world past its intro: A (the caster, its own kit) at x 300 facing right, B `gap` in front. */
function setup(hero: number, gap: number, b: Loadout = DEFENDER) {
  const w = new World({ arenaId: 'bridge', wins: 2, roundTime: 90 });
  const fa = w.addFighter(1, 0, 'A', sanitizeLoadout({ hero }));
  const fb = w.addFighter(2, 1, 'B', b);
  w.start();
  for (let i = 0; i < ROUND.introTicks + 1; i++) w.step();
  fa.s.x = 300;
  fb.s.x = 300 + gap;
  fa.s.face = 1;
  fb.s.face = -1;
  return { w, fa, fb };
}

/**
 * Presses Skill on the first tick and holds `bBtn` on the defender, for `n` ticks. `seen` runs after every tick. Returns the
 * events of the whole cast (the world's list is cleared each tick, as the room does).
 */
function cast(w: World, n: number, bBtn = 0, seen?: (w: World, tick: number) => void): GameEvent[] {
  const fa = w.fighters.get(1)!;
  const fb = w.fighters.get(2)!;
  const log: GameEvent[] = [];
  for (let i = 0; i < n; i++) {
    fa.inputs.push({ seq: fa.lastSeq + 1, moveX: 0, moveY: 0, buttons: i === 0 ? Btn.Skill : 0, viewTick: 0 });
    fb.inputs.push({ seq: fb.lastSeq + 1, moveX: 0, moveY: 0, buttons: bBtn, viewTick: 0 });
    w.step();
    log.push(...w.events);
    w.events = [];
    seen?.(w, i);
  }
  return log;
}

type HitEvent = Extract<GameEvent, { t: 'hit' }>;
/** A direct hit from A on B (burn ticks carry weapon 200 and are not direct). */
const directHits = (log: GameEvent[]) => log.filter((e): e is HitEvent => e.t === 'hit' && e.a === 1 && e.v === 2 && e.w !== 200);
const burnTicks = (log: GameEvent[]) => log.filter((e): e is HitEvent => e.t === 'hit' && e.a === 1 && e.v === 2 && e.w === 200);
const guardEvents = (log: GameEvent[]) => log.filter((e) => e.t === 'block' || e.t === 'parry');

/** The reach of a shot (distance it flies in its life) and of a dash (the distance it carries the hero). */
const shotReach = (sk: SkillDef) => ((sk.speed ?? 0) * (sk.life ?? 60)) / 60;
const dashLength = (sk: SkillDef) => ((sk.vx ?? 0) * (sk.active ?? 0)) / 60;

/** The distance an opponent is placed at for a special to land: inside an aura, a fraction of a shot's or dash's reach. */
function rangeFor(sk: SkillDef): number {
  if (sk.kind === 'aura') return 0.5 * (sk.radius ?? 90);
  if (sk.kind === 'dash') return 0.25 * dashLength(sk);
  return 0.3 * shotReach(sk);
}

/** The Gate Shot's blade is launched above a standing body (launchY is past the body's height): see the known bug below. */
const GATE = SkillId.GateShot;

describe('specials: every hero casts its own special at an opponent in range', () => {
  for (const h of HEROES) {
    const sk = SKILLS[h.id];
    const cls = classOf(h.cls);
    // KNOWN BUG (world.ts, Gate Shot): the blade is launched at launchY 62 (fighter.ts / weapons.ts), above the body
    // height (FIGHTER.h 52), so it passes over any standing opponent: no hit at any range (repro: opponent at 0.3 * reach).
    const check = it;
    check(`${h.name}: ${sk.name} (${sk.kind}) lands a direct hit for its damage`, () => {
      const { w, fb } = setup(h.id, rangeFor(sk));
      const hpBefore = fb.s.hp;
      const log = cast(w, 150);
      const hits = directHits(log);
      expect(hits.length, 'direct hits').toBeGreaterThan(0);
      // the attacker's class damage multiplier applies to the table's damage; nothing else changes it here
      expect(hits[0].amt).toBe(Math.round(sk.dmg * cls.dmg));
      expect(hpBefore - fb.s.hp).toBeGreaterThan(0);
    });
  }

  for (const h of HEROES) {
    const sk = SKILLS[h.id];
    it(`${h.name}: the special costs its cooldown (${sk.cooldown} x the class multiplier)`, () => {
      const { w, fa } = setup(h.id, rangeFor(sk));
      // (the press tick: the cooldown starts when the special is cast)
      cast(w, 1);
      expect(fa.s.skillCd).toBe(Math.round(sk.cooldown * classOf(h.cls).skillCd));
    });
  }
});

describe('specials: shots', () => {
  const shotHeroes = HEROES.filter((h) => SKILLS[h.id].kind === 'shot');
  for (const h of shotHeroes) {
    const sk = SKILLS[h.id];
    it(`${h.name}: ${sk.name} fires ${sk.count ?? 1} projectile(s) that carry the hero's skin`, () => {
      const { w } = setup(h.id, rangeFor(sk));
      // the first volley: the projectiles present on the tick they appear
      let volley: number[] | null = null;
      cast(w, 60, 0, (world) => {
        if (volley === null && world.projectiles.length) volley = world.projectiles.filter((p) => p.owner === 1).map((p) => p.skin ?? -1);
      });
      expect(volley, 'a projectile was fired').not.toBeNull();
      expect(volley!.length).toBe(sk.count ?? 1);
      for (const skin of volley!) expect(skin).toBe(sk.id + 1);
    });
  }

  // KNOWN BUG (world.ts, projectile hit: `if (p.burn) f.s.burnT = ...` runs before the landed check): a blocked Scalpel Rain
  // still sets the burn (slow and root need a landed hit, burn does not). Repro: defender holds the shield, shots are blocked
  // ('block' events), yet the defender's burn timer is set.
  it('Scalpel Rain: a blocked volley does not burn ', () => {
    const sk = SKILLS[SkillId.ScalpelRain];
    const { w, fb } = setup(SkillId.ScalpelRain, rangeFor(sk));
    let maxBurn = 0;
    const log = cast(w, 90, BTN_GUARD, () => {
      maxBurn = Math.max(maxBurn, fb.s.burnT);
    });
    expect(guardEvents(log).length, 'the volley was blocked').toBeGreaterThan(0);
    expect(maxBurn).toBe(0);
  });

  it('Phantom Stars: a hit slows the target for the table\'s ticks', () => {
    const sk = SKILLS[SkillId.PhantomStars];
    const { w, fb } = setup(SkillId.PhantomStars, rangeFor(sk));
    let maxSlow = 0;
    cast(w, 90, 0, () => {
      maxSlow = Math.max(maxSlow, fb.s.slowT);
    });
    expect(maxSlow).toBe(sk.slow);
  });

  // KNOWN BUG (world.ts explode(): the orb's blast applies damage, burn and stun, but not p.slow): the Ink Blot's slow never
  // lands, while the table gives it a slow.
  it('Ink Blot: a splash slows the target for the table\'s ticks  ignores p.slow, world.ts)', () => {
    const sk = SKILLS[SkillId.InkBlot];
    const { w, fb } = setup(SkillId.InkBlot, rangeFor(sk));
    let maxSlow = 0;
    const log = cast(w, 90, 0, () => {
      maxSlow = Math.max(maxSlow, fb.s.slowT);
    });
    expect(directHits(log).length, 'splash hit').toBeGreaterThan(0);
    expect(maxSlow).toBe(sk.slow);
  });

  it('Chain Lash: a hit roots the target for the table\'s ticks', () => {
    const sk = SKILLS[SkillId.ChainLash];
    const { w, fb } = setup(SkillId.ChainLash, rangeFor(sk));
    let maxRoot = 0;
    const log = cast(w, 90, 0, () => {
      maxRoot = Math.max(maxRoot, fb.s.rootT);
    });
    expect(directHits(log).length).toBeGreaterThan(0);
    expect(maxRoot).toBe(sk.root);
  });

  it('Plague Hound: the bite slows and sickens (burn ticks follow the hit)', () => {
    const sk = SKILLS[SkillId.PlagueHound];
    const { w, fb } = setup(SkillId.PlagueHound, rangeFor(sk));
    let maxSlow = 0;
    let maxBurn = 0;
    const log = cast(w, 150, 0, () => {
      maxSlow = Math.max(maxSlow, fb.s.slowT);
      maxBurn = Math.max(maxBurn, fb.s.burnT);
    });
    expect(maxSlow).toBe(sk.slow);
    expect(maxBurn).toBeGreaterThanOrEqual((sk.burn ?? 0) - 1);
    expect(burnTicks(log).length).toBeGreaterThan(0);
  });

  it('Scalpel Rain: a hit sets the burn for the table\'s ticks and the burn hurts over time', () => {
    const sk = SKILLS[SkillId.ScalpelRain];
    const { w, fb } = setup(SkillId.ScalpelRain, rangeFor(sk));
    let maxBurn = 0;
    const log = cast(w, 150, 0, () => {
      maxBurn = Math.max(maxBurn, fb.s.burnT);
    });
    expect(maxBurn).toBeGreaterThanOrEqual((sk.burn ?? 0) - 1);
    expect(burnTicks(log).length).toBeGreaterThan(0);
  });

  it('Shield Rebound: the shield turns back once and comes home (it does not hit a far opponent on the way)', () => {
    const sk = SKILLS[SkillId.ShieldRebound];
    const { w } = setup(SkillId.ShieldRebound, 600);
    let outVx = 0;
    let turned = false;
    let maxX = -Infinity;
    let minXAfterTurn = Infinity;
    const log = cast(w, 120, 0, (world) => {
      const p = world.projectiles.find((q) => q.skin === SkillId.ShieldRebound + 1);
      if (!p) return;
      if (!outVx) outVx = p.vx;
      if (Math.sign(p.vx) !== Math.sign(outVx)) turned = true;
      if (!turned) maxX = Math.max(maxX, p.x);
      else minXAfterTurn = Math.min(minXAfterTurn, p.x);
    });
    expect(directHits(log), 'far opponent is not hit').toHaveLength(0);
    expect(turned, 'turned back').toBe(true);
    // it flew out to about its reach and came back toward the thrower
    // (it turns at half its life, so it flies back about as far as it flew out)
    const outbound = ((sk.speed ?? 0) * ((sk.life ?? 60) / 2)) / 60;
    expect(maxX - minXAfterTurn, 'came back').toBeGreaterThan(0.8 * outbound);
  });

  it('Shadow Dirk: no guard stops it (unblockable), while the same shot is blocked by a raised shield', () => {
    const sk = SKILLS[SkillId.ShadowDirk];
    const dirk = setup(SkillId.ShadowDirk, rangeFor(sk));
    const dirkLog = cast(dirk.w, 90, BTN_GUARD);
    expect(guardEvents(dirkLog), 'no guard event').toHaveLength(0);
    expect(directHits(dirkLog).length).toBeGreaterThan(0);
    expect(directHits(dirkLog)[0].amt).toBe(Math.round(sk.dmg * classOf(HEROES[SkillId.ShadowDirk].cls).dmg));

    // control: a shot that can be blocked is blocked by the same raised shield
    const arrows = setup(SkillId.NineLives, rangeFor(SKILLS[SkillId.NineLives]));
    const arrowLog = cast(arrows.w, 90, BTN_GUARD);
    expect(guardEvents(arrowLog).length, 'control: blocked').toBeGreaterThan(0);
    expect(directHits(arrowLog), 'control: no direct hit').toHaveLength(0);
  });

  it('Gate Shot: the blade pierces: it hits once and flies on past the opponent', () => {
    const sk = SKILLS[GATE];
    const { w, fb } = setup(GATE, rangeFor(sk));
    let maxX = -Infinity;
    let alive = 0;
    const log = cast(w, 90, 0, (world) => {
      const p = world.projectiles.find((q) => q.skin === GATE + 1);
      if (p) {
        alive++;
        maxX = Math.max(maxX, p.x);
      }
    });
    expect(directHits(log)).toHaveLength(1);
    expect(alive, 'the blade kept flying').toBeGreaterThan(0);
    expect(maxX, 'past the opponent').toBeGreaterThan(fb.s.x + 60);
  });
});

describe('specials: auras', () => {
  for (const id of [SkillId.LionsRoar, SkillId.TerrorRoar]) {
    const sk = SKILLS[id];
    const h = HEROES[id];
    it(`${h.name}: ${sk.name} hits within its radius and not beyond it`, () => {
      const inside = setup(id, 0.5 * (sk.radius ?? 90));
      expect(directHits(cast(inside.w, 60)).length, 'inside').toBeGreaterThan(0);
      const outside = setup(id, 1.5 * (sk.radius ?? 90));
      const log = cast(outside.w, 60);
      expect(directHits(log), 'outside').toHaveLength(0);
      expect(outside.fb.s.hp).toBe(CLASSES[DEFENDER.cls].hp);
    });

    it(`${h.name}: ${sk.name} stuns the hit opponent for the table's ticks`, () => {
      const { w, fb } = setup(id, 0.5 * (sk.radius ?? 90));
      let stun = -1;
      let stunned = false;
      cast(w, 60, 0, () => {
        if (!stunned && fb.s.act === Act.Stun) {
          stunned = true;
          stun = fb.s.stun;
        }
      });
      expect(stunned, 'stunned').toBe(true);
      expect(stun).toBe(sk.stun);
    });
  }

  it("Lion's Roar throws the opponent up and away (the table's knockback)", () => {
    const sk = SKILLS[SkillId.LionsRoar];
    const { w, fb } = setup(SkillId.LionsRoar, 0.5 * (sk.radius ?? 90));
    let vy: number | null = null;
    let ground = 1;
    cast(w, 60, 0, () => {
      if (vy === null && fb.s.act === Act.Stun) {
        vy = fb.s.vy;
        ground = fb.s.ground;
      }
    });
    expect(vy).toBe(-(sk.kbY ?? 0));
    expect(ground).toBe(0);
  });
});

describe('specials: dashes', () => {
  for (const id of [SkillId.RuneLeap, SkillId.BucephalusCharge]) {
    const sk = SKILLS[id];
    const h = HEROES[id];
    it(`${h.name}: ${sk.name} carries the hero along its length and hits the opponent once`, () => {
      const { w, fa } = setup(id, rangeFor(sk));
      const x0 = fa.s.x;
      let maxX = fa.s.x;
      let airborne = false;
      const log = cast(w, 120, 0, () => {
        maxX = Math.max(maxX, fa.s.x);
        if (fa.s.ground === 0) airborne = true;
      });
      expect(directHits(log), 'one hit').toHaveLength(1);
      expect(maxX - x0, 'carried').toBeGreaterThan(0.5 * dashLength(sk));
      expect(airborne, 'leaps off the ground').toBe((sk.vy ?? 0) !== 0);
      expect(fa.s.ground, 'landed').toBe(1);
    });
  }
});

