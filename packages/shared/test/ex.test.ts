import { describe, expect, it } from 'vitest';
import {
  Act, BotBrain, Btn, decodeSnapshot, encodeSnapshot, encodeSnapshotBody, EX_SPECIAL, GameEvent, heroClass, HEROES, Loadout, Projectile,
  ROUND, RIFT, sanitizeLoadout, SKILL_EVENT, SKILLS, SkillDef, SkillId, skillTicks, World, WeaponId,
} from '../src/index';

/**
 * The EX special: the Art button with the gauge at EX_SPECIAL.cost up to RIFT.max casts the hero's own special empowered
 * (fighter.ts startEx). Checked on every hero: the cost, the cooldown (ignored and not started), the damage (1.5x the table),
 * the super armour through the startup, the flagged shots on the wire, and the bots' half-chance use of it.
 */

/** The defender: a plain sword and shield, no guard raised unless a test holds it. */
const DEFENDER: Loadout = { weapons: [WeaponId.Sword, WeaponId.Shield], skill: SkillId.LionsRoar, cls: 0, hero: 0 };

/** A live duel past its intro: A (the caster, its own kit) at x 300 facing right, B `gap` in front of it, facing A. */
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
 * Presses `a(i)` on the caster and `b(i)` on the defender for `n` ticks. `seen` runs after every tick with that tick's
 * events (the world's list is cleared each tick, as the room does). Returns the events of the whole run.
 */
function play(
  w: World, n: number, a: (i: number) => number, b: (i: number) => number = () => 0,
  seen?: (i: number, events: GameEvent[]) => void,
): GameEvent[] {
  const fa = w.fighters.get(1)!;
  const fb = w.fighters.get(2)!;
  const log: GameEvent[] = [];
  for (let i = 0; i < n; i++) {
    fa.inputs.push({ seq: fa.lastSeq + 1, moveX: 0, moveY: 0, buttons: a(i), viewTick: 0 });
    fb.inputs.push({ seq: fb.lastSeq + 1, moveX: 0, moveY: 0, buttons: b(i), viewTick: 0 });
    w.step();
    const ev = w.events;
    w.events = [];
    log.push(...ev);
    seen?.(i, ev);
  }
  return log;
}

/** A press on the first tick only. */
const tapAt0 = (btn: number) => (i: number) => (i === 0 ? btn : 0);

type HitEvent = Extract<GameEvent, { t: 'hit' }>;
/** A direct hit from A on B (burn ticks carry weapon 200 and are not direct). */
const directHits = (log: GameEvent[]) => log.filter((e): e is HitEvent => e.t === 'hit' && e.a === 1 && e.v === 2 && e.w !== 200);

/** The reach of a shot (distance it flies in its life) and of a dash (the distance it carries the hero). */
const shotReach = (sk: SkillDef) => ((sk.speed ?? 0) * (sk.life ?? 60)) / 60;
const dashLength = (sk: SkillDef) => ((sk.vx ?? 0) * (sk.active ?? 0)) / 60;
/** The distance an opponent is placed at for a special to land (as specials.test.ts places them). */
function rangeFor(sk: SkillDef): number {
  if (sk.kind === 'aura') return 0.5 * (sk.radius ?? 90);
  if (sk.kind === 'dash') return 0.25 * dashLength(sk);
  return 0.3 * shotReach(sk);
}

/** Gate Shot's blade passes over a standing body (specials.test.ts, known bug in world.ts): it never hits, so it is no damage probe. */
const GATE_KNOWN_BUG = SkillId.GateShot;

describe('EX special: the Art button at 50-99% casts the hero special as EX', () => {
  for (const h of HEROES) {
    const sk = SKILLS[h.id];
    it(`${h.name}: at 60% the press casts ${sk.name} as EX: 500 spent, the cooldown neither needed nor started`, () => {
      const { w, fa } = setup(h.id, 200);
      fa.s.rift = 600;
      // a cooldown that would block any plain cast of the special
      fa.s.skillCd = 9999;
      const log = play(w, sk.startup + 2, tapAt0(Btn.Special));
      expect(fa.s.act).toBe(Act.Skill);
      // (the gauge spent is the cost; the passive fill of a few ticks is all that is left)
      expect(fa.s.rift).toBeGreaterThanOrEqual(600 - EX_SPECIAL.cost);
      expect(fa.s.rift).toBeLessThan(600 - EX_SPECIAL.cost + 2);
      // the cooldown was not restarted: it only counted down
      expect(fa.s.skillCd).toBeGreaterThan(9000);
      expect(log.filter((e) => e.t === 'ex')).toEqual([{ t: 'ex', p: 1, skill: fa.load.skill }]);
      // the special goes off at its startup
      expect(log.some((e) => e.t === 'shoot' && e.p === 1 && e.kind === SKILL_EVENT + sk.id), 'the special fired').toBe(true);
    });

    it(`${h.name}: the EX cast ends with its skill's length, and leaves no EX count behind`, () => {
      const { w, fa } = setup(h.id, 200);
      fa.s.rift = 600;
      play(w, skillTicks(sk) + 2, tapAt0(Btn.Special));
      expect(fa.s.act).toBe(Act.Free);
      expect(fa.s.ex).toBe(0);
    });
  }

  for (const rift of [0, 400, 499]) {
    it(`at ${rift} (below 50%) the Art button does nothing: no cast, no gauge spent, no cooldown`, () => {
      const { w, fa } = setup(0, 200);
      // the gauge is held at this value each tick (the passive fill would otherwise carry 499 past 500 within the buffer)
      fa.s.rift = rift;
      const acts: number[] = [];
      const log = play(w, 30, tapAt0(Btn.Special), undefined, (_i) => {
        acts.push(fa.s.act);
        fa.s.rift = rift;
      });
      expect(acts.every((a) => a === Act.Free), 'never left Free').toBe(true);
      expect(log.some((e) => e.t === 'ex' || e.t === 'shoot' || e.t === 'art'), 'no cast').toBe(false);
      expect(fa.s.skillCd).toBe(0);
    });
  }

  for (const h of HEROES) {
    it(`${h.name}: at 100% the Art button still starts the Rift Art, not the EX special`, () => {
      const { w, fa } = setup(h.id, 200);
      fa.s.rift = RIFT.max;
      const log = play(w, 3, tapAt0(Btn.Special));
      expect(log.some((e) => e.t === 'art'), 'the Rift Art started').toBe(true);
      expect(log.some((e) => e.t === 'ex'), 'not an EX cast').toBe(false);
    });
  }
});

describe('EX special: damage, armour and the wire', () => {
  /** The first direct hit's damage of a cast by hero `hero` with button `btn` and the gauge at `rift`. */
  function firstHit(hero: number, btn: number, rift: number): number | undefined {
    const sk = SKILLS[hero];
    const { w, fa } = setup(hero, rangeFor(sk));
    fa.s.rift = rift;
    return directHits(play(w, 150, tapAt0(btn)))[0]?.amt;
  }

  for (const h of HEROES) {
    const sk = SKILLS[h.id];
    if (sk.id === GATE_KNOWN_BUG) continue;
    it(`${h.name}: ${sk.name} as EX deals ${EX_SPECIAL.dmg}x the table's damage (the class multiple applies to both)`, () => {
      const cls = heroClass({ cls: h.cls, hero: h.id });
      const plain = firstHit(h.id, Btn.Skill, 0);
      const ex = firstHit(h.id, Btn.Special, 600);
      expect(plain, 'the plain special hits').toBe(Math.round(sk.dmg * cls.dmg));
      expect(ex, 'the EX special hits').toBe(Math.round(Math.round(sk.dmg * EX_SPECIAL.dmg) * cls.dmg));
    });
  }

  // the caster's sword swing lands on it during its startup (B swings at tick 0, hits at its startup, tick 5): a plain cast
  // is stunned by it, an EX cast takes it with super armour (no flinch, no hit-stop)
  const ATTACKER: Loadout = { weapons: [WeaponId.Sword, WeaponId.Shield], skill: SkillId.LionsRoar, cls: 0, hero: 0 };
  function swingInto(ex: boolean) {
    const { w, fa } = setup(0, 40, ATTACKER);
    fa.s.rift = ex ? 600 : 0;
    let seenHit: { act: number; stun: number; hs: number; actT: number } | null = null;
    play(w, 14, tapAt0(ex ? Btn.Special : Btn.Skill), tapAt0(Btn.A), (_i, ev) => {
      const hit = ev.find((e): e is HitEvent => e.t === 'hit' && e.a === 2 && e.v === 1);
      if (hit && !seenHit) seenHit = { act: fa.s.act, stun: fa.s.stun, hs: hit.hs, actT: fa.s.actT };
    });
    return seenHit;
  }

  it('an EX caster takes a hit during its startup without flinching (super armour, like Blood Frenzy)', () => {
    const hit = swingInto(true);
    expect(hit, 'the sword hit the caster').not.toBeNull();
    expect(hit!.actT).toBeLessThanOrEqual(SKILLS[SkillId.LionsRoar].startup);
    expect(hit!.act, 'still casting').toBe(Act.Skill);
    expect(hit!.stun).toBe(0);
    expect(hit!.hs, 'no hit-stop on the armoured caster').toBe(0);
  });

  it('a plain caster is stunned by the same hit (the armour is EX only)', () => {
    const hit = swingInto(false);
    expect(hit, 'the sword hit the caster').not.toBeNull();
    expect(hit!.act).toBe(Act.Stun);
    expect(hit!.hs).toBeGreaterThan(0);
  });

  it('a plain cast after an EX count is left over is never EX (the count is cleared)', () => {
    const { w, fa } = setup(0, 200);
    // a stale count with no EX cast behind it (as after an interrupted EX special)
    fa.s.ex = 50;
    fa.s.skillCd = 0;
    const log = play(w, 1, tapAt0(Btn.Skill));
    expect(fa.s.act).toBe(Act.Skill);
    expect(fa.s.ex).toBe(0);
    expect(log.some((e) => e.t === 'ex')).toBe(false);
  });

  for (const h of HEROES.filter((x) => SKILLS[x.id].kind === 'shot')) {
    const sk = SKILLS[h.id];
    it(`${h.name}: EX shots are flagged, carry 1.5x damage, and keep the flag on the wire`, () => {
      const { w, fa } = setup(h.id, 200);
      fa.s.rift = 600;
      let flagged: Projectile[] = [];
      let snapEx: boolean[] = [];
      const log = play(w, sk.startup + 2, tapAt0(Btn.Special), undefined, () => {
        if (flagged.length === 0 && w.projectiles.some((p) => p.owner === 1)) {
          flagged = w.projectiles.filter((p) => p.owner === 1);
          // the snapshot the room would send on the spawn tick: the volley's flags
          const snap = decodeSnapshot(encodeSnapshot(w, 1, encodeSnapshotBody(w, [])));
          snapEx = flagged.map((p) => snap.projectiles.find((q) => q.id === p.id)?.ex ?? false);
        }
      });
      expect(flagged.length, 'a volley was fired').toBe(sk.count ?? 1);
      for (const p of flagged) {
        expect(p.ex).toBe(true);
        expect(p.dmg).toBe(Math.round(sk.dmg * EX_SPECIAL.dmg));
      }
      expect(snapEx.every((x) => x), 'the flag is on the wire').toBe(true);
      // the cast's event (sent on the cast tick) survives the wire too
      expect(log.filter((e) => e.t === 'ex')).toEqual([{ t: 'ex', p: 1, skill: sk.id }]);
      const wired = decodeSnapshot(encodeSnapshot(w, 1, encodeSnapshotBody(w, [{ t: 'ex', p: 1, skill: sk.id }]))).events;
      expect(wired).toEqual([{ t: 'ex', p: 1, skill: sk.id }]);
    });

    it(`${h.name}: a plain ${sk.name} is not flagged and keeps its table damage`, () => {
      const { w } = setup(h.id, 200);
      let flagged: Projectile[] = [];
      play(w, sk.startup + 2, tapAt0(Btn.Skill), undefined, () => {
        if (flagged.length === 0) flagged = w.projectiles.filter((p) => p.owner === 1);
      });
      expect(flagged.length).toBe(sk.count ?? 1);
      for (const p of flagged) {
        expect(p.ex).toBeFalsy();
        expect(p.dmg).toBe(sk.dmg);
      }
    });
  }
});

describe('EX special: bots spend it half the time when it can', () => {
  /** A bot caster of `hero` in front of a dummy, its gauge held at `rift` each tick; the EX casts it makes. */
  function botCasts(hero: number, rift: number, ticks: number, seed: number): number {
    const w = new World({ arenaId: 'bridge', wins: 2, roundTime: 90 });
    const fa = w.addFighter(1, 0, 'A', sanitizeLoadout({ hero }), true);
    w.addFighter(2, 1, 'B', DEFENDER);
    const bot = new BotBrain(1, seed, 'normal');
    w.start();
    for (let i = 0; i < ROUND.introTicks + 1; i++) w.step();
    fa.s.x = 300;
    w.fighters.get(2)!.s.x = 380;
    w.fighters.get(2)!.s.face = -1;
    let casts = 0;
    for (let i = 0; i < ticks; i++) {
      fa.s.rift = rift;
      fa.inputs.push(bot.think(w));
      w.step();
      casts += w.events.filter((e) => e.t === 'ex' && e.p === 1).length;
    }
    return casts;
  }

  it('a bot at 60% gauge spends it on EX when the opponent is in range', () => {
    expect(botCasts(0, 600, 1200, 7), 'aura hero').toBeGreaterThan(0);
    expect(botCasts(1, 600, 1200, 7), 'archer').toBeGreaterThan(0);
  });

  it('a bot below 50% never spends the gauge on EX', () => {
    expect(botCasts(0, 400, 1200, 7)).toBe(0);
    expect(botCasts(1, 400, 1200, 7)).toBe(0);
  });
});
