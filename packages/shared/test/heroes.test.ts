import { describe, expect, it } from 'vitest';
import {
  Act, ARENAS, ARTS, ArtId, artIdOf, BotBrain, Btn, CLASSES, ClassId, decodeSnapshot, DT, encodeSnapshot, encodeSnapshotBody, Fighter, GameEvent,
  HERO_COUNT, HEROES, InputCmd, MOVE_ART, PROJ_KINDS, Projectile, RIFT, ROUND, sanitizeLoadout, SkillId, solidAt, World, WeaponId, FIGHTER,
} from '../src/index';
import { heroWeapon } from '../src/heroes';

/** Every Rift Art starts with the superpause: its timeline runs after it. */
const SP = FIGHTER.superpause;

/** Hero id by display name (the roster is fixed, so names are stable handles). */
const hero = (name: string) => HEROES.find((h) => h.name === name)!.id;
const LEON = hero('Richard Lionheart');
const AURELION = hero('Gilgamesh');
const VERDAN = hero('Enkidu');
const QUILL = hero('Alexandre Dumas');
const HOLLOWMASK = hero('Hassan');
const MR_GRAY = hero('Jack the Ripper');
const IGNIS = hero('Alexander');
const THORNMAW = hero('Pale Rider');

/** A loadout for a hero: slot A is its signature weapon, slot B the given second weapon (Shield by default: blockable). */
const loadOf = (h: number, second: WeaponId = WeaponId.Shield) => sanitizeLoadout({ weapons: [0, second], skill: SkillId.LionsRoar, hero: h });

/** A live duel on the bridge: fighter A (seat 0, hero a) at x 600 facing right, fighter B (seat 1, hero b) `gap` in front. A's gauge is full. */
function duel(a: number, b: number, gap = 60) {
  const w = new World({ arenaId: 'bridge', wins: 2, roundTime: 90 });
  const fa = w.addFighter(1, 0, 'A', loadOf(a));
  const fb = w.addFighter(2, 1, 'B', loadOf(b));
  w.start();
  for (let i = 0; i < ROUND.introTicks + 1; i++) w.step();
  fa.s.x = 600;
  fb.s.x = 600 + gap;
  fa.s.face = 1;
  fb.s.face = -1;
  fa.s.rift = RIFT.max;
  return { w, fa, fb };
}

interface Pad {
  x?: number;
  btn?: number;
}

/** Input sequence numbers: they only need to grow, across every world in the file. */
let seqA = 0;
let seqB = 0;

/**
 * Plays `n` ticks. Each side's pad is read per tick (tick numbers start at 1). Events are collected into `log` (the
 * world's own list is cleared each tick, as the room does). `seen` runs after every tick.
 */
function play(
  w: World,
  n: number,
  a: (i: number) => Pad = () => ({}),
  b: (i: number) => Pad = () => ({}),
  log: GameEvent[] = [],
  seen?: (w: World) => void,
) {
  const fa = w.fighters.get(1)!;
  const fb = w.fighters.get(2)!;
  for (let i = 1; i <= n; i++) {
    const pa = a(i);
    const pb = b(i);
    fa.inputs.push({ seq: ++seqA, moveX: pa.x ?? 0, moveY: 0, buttons: pa.btn ?? 0, viewTick: 0 });
    fb.inputs.push({ seq: ++seqB, moveX: pb.x ?? 0, moveY: 0, buttons: pb.btn ?? 0, viewTick: 0 });
    w.step();
    log.push(...w.events);
    w.events = [];
    seen?.(w);
  }
  return log;
}

type HitEvent = Extract<GameEvent, { t: 'hit' }>;
const hitsBy = (log: GameEvent[], a: number, v: number): HitEvent[] =>
  log.filter((e): e is HitEvent => e.t === 'hit' && e.a === a && e.v === v);
const special = () => ({ btn: Btn.Special });
const nothing = () => ({});

describe('roster', () => {
  it('has fourteen heroes with ids matching their index, one Rift Art each, and every class is covered', () => {
    expect(HERO_COUNT).toBe(14);
    expect(HEROES).toHaveLength(14);
    HEROES.forEach((h, i) => {
      expect(h.id).toBe(i);
      expect(CLASSES[h.cls].id).toBe(h.cls);
      expect(ARTS[h.art].id).toBe(h.art);
    });
    expect(new Set(HEROES.map((h) => h.art)).size).toBe(14);
    expect(new Set(HEROES.map((h) => h.cls))).toEqual(new Set(CLASSES.map((c) => c.id)));
  });

  it('every hero loadout sanitises to its class, its signature weapon in slot A and its own Art', () => {
    const junk: unknown[][] = [[], [WeaponId.Hammer, WeaponId.Hammer], [WeaponId.Sword, WeaponId.Bow], [99, -1], [WeaponId.Lance, WeaponId.Lance]];
    for (const h of HEROES) {
      for (const weapons of junk) {
        const l = sanitizeLoadout({ hero: h.id, weapons, skill: SkillId.ShadowDirk });
        expect(l.hero).toBe(h.id);
        expect(l.cls).toBe(h.cls);
        expect(l.weapons[0]).toBe(heroWeapon(h.id));
        expect(l.weapons[1]).toBe(l.weapons[0]);
        // the special is the hero's own (skill N belongs to hero N), whatever was sent
        expect(l.skill).toBe(h.id);
        expect(artIdOf(l)).toBe(h.art);
      }
    }
  });

  it('the class signatures are the expected weapons', () => {
    expect(CLASSES.map((c) => c.signature)).toEqual([
      WeaponId.Sword, WeaponId.Bow, WeaponId.Lance, WeaponId.Staff, WeaponId.Daggers, WeaponId.Hammer, WeaponId.Shield, WeaponId.Scythe,
    ]);
  });

  it("the kit is the hero's weapon in both slots and its own special, whatever the player sent", () => {
    const l = sanitizeLoadout({ hero: LEON, weapons: [WeaponId.Hammer, WeaponId.Lance], skill: SkillId.NineLives });
    expect(l.weapons).toEqual([WeaponId.Sword, WeaponId.Sword]);
    expect(l.skill).toBe(LEON);
  });

  it('falls back safely for bad hero ids and for legacy class-only loadouts', () => {
    for (const bad of [-1, 14, 1.5, 'x', null]) {
      // no usable hero: the class decides (its first hero)
      expect(sanitizeLoadout({ hero: bad, cls: 7 }).hero).toBe(IGNIS);
    }
    expect(sanitizeLoadout({ hero: 99, cls: 5 }).hero).toBe(hero('Humbaba'));
    expect(sanitizeLoadout({ cls: 99 }).hero).toBe(LEON);
    expect(sanitizeLoadout(undefined).hero).toBe(LEON);
    expect(sanitizeLoadout({ hero: 'x', cls: 'x', weapons: 'nope', skill: 99 })).toMatchObject({ hero: LEON, cls: ClassId.Saber, skill: LEON });
  });
});

describe('new Rift Arts', () => {
  it('Vault of Ages (Aurelion): relic weapons fly from rift portals and hit at range', () => {
    const { w, fa, fb } = duel(AURELION, LEON, 420);
    const log: GameEvent[] = [];
    const kinds = new Set<string>();
    const hp0 = fb.s.hp;
    play(w, 1, special, nothing, log);
    play(w, 110, nothing, nothing, log, (w) => w.projectiles.forEach((p) => kinds.add(p.kind)));
    expect(kinds.has('relic')).toBe(true);
    // eleven relics: one every third tick of the ten-to-forty window
    expect(log.filter((e) => e.t === 'shoot' && e.p === fa.id && e.kind === 7)).toHaveLength(11);
    const hits = hitsBy(log, fa.id, fb.id).filter((e) => e.w === 106);
    expect(hits.length).toBeGreaterThanOrEqual(3);
    // at range: the fighters start 420 apart and the relics fly away from the archer
    for (const h of hits) expect(h.x).toBeGreaterThan(600 + 200);
    expect(hp0 - fb.s.hp).toBe(hits.reduce((n, h) => n + h.amt, 0));
  });

  it('Chains of Genesis (Verdan): living chains bind the opponent where it stands (rooted)', () => {
    const { w, fa, fb } = duel(VERDAN, LEON, 120);
    const log: GameEvent[] = [];
    const hp0 = fb.s.hp;
    play(w, 40 + SP, (i) => (i === 1 ? special() : nothing()), nothing, log);
    expect(log.find((e) => e.t === 'strike')).toMatchObject({ kind: 1 });
    expect(fb.s.rootT).toBeGreaterThan(60);
    const x0 = fb.s.x;
    // the opponent keeps trying to walk away while rooted: it does not move
    let rooted = true;
    play(w, 60, nothing, () => ({ x: 1 }), log, () => {
      if (fb.s.rootT <= 0) rooted = false;
    });
    expect(rooted).toBe(true);
    expect(Math.abs(fb.s.x - x0)).toBeLessThan(1);
    expect(hp0 - fb.s.hp).toBe(120);
    expect(hitsBy(log, fa.id, fb.id).some((e) => e.w === 107)).toBe(true);
  });

  it("Chains of Genesis: an opponent that steps out of the strike's footprint is not rooted", () => {
    const { w, fb } = duel(VERDAN, LEON, 120);
    const log: GameEvent[] = [];
    // the lock-on is taken when the chains are called; the opponent runs right for the whole window
    play(w, 60 + SP, (i) => (i === 1 ? special() : nothing()), () => ({ x: 1 }), log);
    expect(log.some((e) => e.t === 'strike')).toBe(true);
    expect(fb.s.rootT).toBe(0);
    expect(hitsBy(log, 1, fb.id).some((e) => e.w === 107)).toBe(false);
  });

  it('Rewritten Fate (Quill): heals 28% of max health, caps at max, and sets the buff', () => {
    const { w, fa } = duel(QUILL, LEON, 500);
    fa.s.hp = 400;
    play(w, 1, special);
    play(w, 60 + SP);
    const C = CLASSES[ClassId.Caster];
    expect(fa.s.hp).toBeCloseTo(400 + 0.28 * C.hp, 0);
    expect(fa.s.buff).toBeGreaterThan(340); // granted at cast: 420 minus the ticks since
    expect(fa.s.buff).toBeLessThanOrEqual(420);

    // a near-full fighter heals only up to its maximum
    const full = duel(QUILL, LEON, 500);
    full.fa.s.hp = C.hp - 10;
    play(full.w, 1, special);
    play(full.w, 60);
    expect(full.fa.s.hp).toBe(C.hp);
  });

  it('a buffed fighter deals about 30% more damage than an unbuffed one', () => {
    const firstHit = (buff: number) => {
      const { w, fa, fb } = duel(LEON, LEON, 40);
      fa.s.buff = buff;
      fa.s.rift = 0;
      const log = play(w, 1, () => ({ btn: Btn.A }), nothing);
      play(w, 40, nothing, nothing, log);
      const hit = hitsBy(log, fa.id, fb.id)[0];
      expect(hit, `first hit with buff ${buff}`).toBeDefined();
      return hit.amt;
    };
    const plain = firstHit(0);
    const buffed = firstHit(10000);
    expect(plain).toBeGreaterThan(0);
    expect(buffed / plain).toBeCloseTo(1.35, 1);
  });

  it('Phantom Hand (Hollowmask): runs along the floor, ignores a raised shield and holds the target stunned', () => {
    const { w, fa, fb } = duel(HOLLOWMASK, 13, 300);
    const log: GameEvent[] = [];
    const hp0 = fb.s.hp;
    const handY = new Set<number>();
    let stunned = 0;
    let blocking = false;
    // Aegis raises her tower shield (A) from the first tick and keeps it up
    play(w, 1, special, () => ({ btn: Btn.A }), log);
    play(w, 100 + SP, nothing, () => ({ btn: Btn.A }), log, (w) => {
      w.projectiles.forEach((p) => p.kind === 'hand' && handY.add(Math.round(p.y)));
      if (fb.s.act === Act.Block) blocking = true;
      if (fb.s.act === Act.Stun && fb.s.stun > 0) stunned++;
    });
    expect(blocking).toBe(true);
    const hits = hitsBy(log, fa.id, fb.id).filter((e) => e.w === 106);
    expect(hits).toHaveLength(1);
    expect(log.some((e) => e.t === 'block' || e.t === 'parry')).toBe(false);
    expect(hp0 - fb.s.hp).toBe(Math.round(260 * CLASSES[ClassId.Assassin].dmg));
    // the claw skims the ground: every frame it flew at the same height, a little above the floor
    expect([...handY]).toEqual([Math.round(w.arena.floor - 14)]);
    // held: stunned for most of the stun after the hit
    expect(stunned).toBeGreaterThan(30);
  });

  it('Grim Fog (Mr. Gray): the veil lasts six seconds', () => {
    const { w, fa } = duel(MR_GRAY, LEON, 60);
    play(w, 1, special);
    play(w, 30 + SP);
    expect(fa.s.act).not.toBe(Act.Art);
    expect(fa.s.veil).toBeGreaterThan(320);
    expect(fa.s.veil).toBeLessThanOrEqual(360);
  });

  it('Grim Fog: the veil multiplies the first melee hit by 3.5 and is spent on it', () => {
    const firstHit = (veil: number) => {
      const { w, fa, fb } = duel(MR_GRAY, LEON, 40);
      fa.s.veil = veil;
      fa.s.rift = 0;
      const log = play(w, 1, () => ({ btn: Btn.A }), nothing);
      play(w, 50, nothing, nothing, log);
      return { hit: hitsBy(log, fa.id, fb.id)[0], veilAfter: fa.s.veil };
    };
    const plain = firstHit(0);
    const veiled = firstHit(300);
    expect(plain.hit).toBeDefined();
    expect(veiled.hit).toBeDefined();
    expect(veiled.hit.crit).toBe(true);
    expect(plain.hit.crit).toBe(false);
    expect(veiled.hit.amt / plain.hit.amt).toBeCloseTo(3.5, 1);
    expect(veiled.veilAfter).toBe(0);
  });

  it('Grim Fog: projectiles do not spend the veil (only a melee blow does)', () => {
    const { w, fa, fb } = duel(MR_GRAY, LEON, 300);
    fa.s.veil = 300;
    w.projectiles.push({ id: 900, kind: 'arrow', owner: fb.id, x: 700, y: 560, vx: -600, vy: 0, dmg: 10, kb: 0, stun: 0, life: 200, heavy: false });
    play(w, 20);
    expect(fa.s.veil).toBeGreaterThan(200);
  });

  it('Stampede (Ignis): the steed tramples once, keeps running, sets a burn, and only a wall stops it', () => {
    const { w, fa, fb } = duel(IGNIS, LEON, 200);
    const log: GameEvent[] = [];
    let steedSeen = false;
    let removed = false;
    let last: Projectile | null = null;
    play(w, 1, special, nothing, log);
    play(w, 230, nothing, nothing, log, (w) => {
      const st = w.projectiles.find((p) => p.kind === 'steed');
      if (st) {
        steedSeen = true;
        last = { ...st };
      } else if (steedSeen && !removed) removed = true;
    });
    expect(steedSeen).toBe(true);
    const trample = hitsBy(log, fa.id, fb.id).filter((e) => e.w === 106);
    expect(trample).toHaveLength(1);
    expect(trample[0].amt).toBe(190); // 170 x Rider dmg 1.12 (classes.ts)
    // the burn: the trampled fighter keeps taking fire damage for a while
    const burns = hitsBy(log, fa.id, fb.id).filter((e) => e.w === 200);
    expect(burns.length).toBeGreaterThanOrEqual(5);
    // it ran on past the victim, and it ended against terrain (a wall or a pillar), not by running out of time
    expect(removed).toBe(true);
    const end = last as Projectile | null;
    expect(end).not.toBeNull();
    expect(end!.x).toBeGreaterThan(800);
    expect(end!.life).toBeGreaterThan(0);
    expect(solidAt(w.arena, end!.x + end!.vx * DT, end!.y)).toBe(true);
  });

  it('Night Hunt (Thornmaw): leaps onto the opponent and slams down for damage when it lands', () => {
    const { w, fa, fb } = duel(THORNMAW, LEON, 300);
    const log: GameEvent[] = [];
    const hp0 = fb.s.hp;
    play(w, 1, special, nothing, log);
    play(w, 110, nothing, nothing, log);
    const slams = hitsBy(log, fa.id, fb.id).filter((e) => e.w === 106);
    expect(slams).toHaveLength(1);
    expect(slams[0].amt).toBe(185); // 165 x Rider dmg 1.12 (classes.ts)
    expect(hp0 - fb.s.hp).toBe(185);
    // the slam lands on the opponent's spot (where it stood when the hound came down), not short or past it
    const boom = log.find((e) => e.t === 'boom') as { x: number } | undefined;
    expect(boom).toBeDefined();
    expect(Math.abs(boom!.x - (600 + 300))).toBeLessThan(85);
    expect(slams[0].y).toBeGreaterThan(0);
  });

  it('Bulwark keeps its invulnerable barrier (smoke)', () => {
    const { w, fa } = duel(hero('Brynhildr'), LEON, 300);
    play(w, 1, special);
    play(w, 20);
    expect(fa.s.invuln).toBeGreaterThan(50);
  });
});

describe('the Rift gauge', () => {
  it('an Art cannot start without a full gauge, for any hero; a full gauge starts it', () => {
    for (const h of HEROES) {
      const { w, fa } = duel(h.id, LEON, 260);
      const log: GameEvent[] = [];
      // (well short of full: the passive gauge would reach it within a few ticks, and a press buffers for a few more)
      fa.s.rift = RIFT.max - 200;
      let started = false;
      play(w, 8, special, nothing, log, () => {
        if (fa.s.act === Act.Art || fa.s.move === MOVE_ART) started = true;
      });
      expect(started, h.name).toBe(false);
      expect(log.some((e) => e.t === 'art'), h.name).toBe(false);
    }
    const { w, fa } = duel(QUILL, LEON, 260);
    fa.s.rift = RIFT.max;
    play(w, 1, special);
    expect(fa.s.act === Act.Art || fa.s.move === MOVE_ART).toBe(true);
    expect(fa.s.rift).toBeLessThan(RIFT.max);
  });

  it("every one of the fourteen heroes' Arts fires with a full gauge and plays out without throwing", () => {
    for (const h of HEROES) {
      const { w, fa } = duel(h.id, LEON, 260);
      const log: GameEvent[] = [];
      play(w, 1, special, nothing, log);
      play(w, 130 + SP, (i) => (i % 25 === 0 ? { btn: Btn.A } : nothing()), nothing, log);
      expect(log.some((e) => e.t === 'art' && e.p === fa.id && e.art === h.art), `${h.name} starts ${ARTS[h.art].name}`).toBe(true);
      expect(fa.s.act, h.name).not.toBe(Act.Art);
    }
  });

  it('the gauge is kept between rounds', () => {
    const { w, fa, fb } = duel(LEON, LEON, 40);
    fa.s.rift = 700;
    fb.s.hp = 1;
    const log: GameEvent[] = [];
    play(w, 1, () => ({ btn: Btn.A }), nothing, log);
    play(w, 20, nothing, nothing, log);
    expect(w.phase).toBe('ko');
    const atKo = fa.s.rift;
    expect(atKo).toBeGreaterThanOrEqual(700);
    // the KO pause, then round two
    let guard = 0;
    while (!(w.phase === 'intro' && w.round === 2) && guard++ < 1000) play(w, 1);
    expect(w.round).toBe(2);
    expect(fa.s.rift).toBe(atKo);
  });
});

describe('protocol round-trip', () => {
  it('carries hero, class, buff, veil, frenzy, rift, strikes, every projectile kind and the art events', () => {
    const w = new World({ arenaId: 'bridge', wins: 2, roundTime: 90 });
    const fa = w.addFighter(1, 0, 'A', loadOf(MR_GRAY));
    const fb = w.addFighter(2, 1, 'B', loadOf(QUILL));
    w.start();
    for (let i = 0; i < ROUND.introTicks + 2; i++) w.step();
    fa.s.veil = 123;
    fa.s.frenzy = 40;
    fa.s.rift = 678.9;
    fb.s.buff = 300;
    fb.s.rift = 1000;
    PROJ_KINDS.forEach((kind, k) => {
      w.projectiles.push({ id: 100 + k, kind, owner: 1, x: 100 + k * 50, y: 400, vx: 300, vy: -20, dmg: 1, kb: 0, stun: 0, life: 50, heavy: k % 2 === 0 });
    });
    w.strikes.push({ id: 7, owner: 2, x: 500, y: 600, at: w.tick + 20, aimed: true, kind: 0 });
    w.strikes.push({ id: 8, owner: 1, x: 700, y: 600, at: w.tick + 40, aimed: true, kind: 1 });
    const events: GameEvent[] = [
      { t: 'strike', x: 300, y: 600, kind: 1 },
      { t: 'art', p: 2, art: ArtId.RewrittenFate, pause: SP },
      { t: 'shoot', p: 1, kind: 6 },
    ];
    const snap = decodeSnapshot(encodeSnapshot(w, 1, encodeSnapshotBody(w, events)));

    expect(snap.selfId).toBe(1);
    const a = snap.fighters.find((f) => f.id === 1)!;
    const b = snap.fighters.find((f) => f.id === 2)!;
    expect(a.hero).toBe(MR_GRAY);
    expect(a.cls).toBe(ClassId.Berserker);
    expect(a.veil).toBe(true);
    expect(a.frenzy).toBe(true);
    expect(a.buff).toBe(false);
    expect(a.rift).toBe(678);
    expect(b.hero).toBe(QUILL);
    expect(b.cls).toBe(ClassId.Caster);
    expect(b.buff).toBe(true);
    expect(b.veil).toBe(false);
    expect(b.rift).toBe(1000);
    expect(b.weapons).toEqual([WeaponId.Staff, WeaponId.Staff]);

    // the recipient's own fighter is sent whole
    expect(snap.self).not.toBeNull();
    expect(snap.self!.veil).toBe(123);
    expect(snap.self!.frenzy).toBe(40);
    expect(snap.self!.rift).toBeCloseTo(678.9, 0);

    expect(snap.projectiles.map((p) => p.kind)).toEqual(PROJ_KINDS);
    expect(snap.projectiles.map((p) => p.heavy)).toEqual(PROJ_KINDS.map((_, k) => k % 2 === 0));

    expect(snap.strikes).toHaveLength(2);
    expect(snap.strikes.map((s) => s.kind)).toEqual([0, 1]);
    expect(snap.strikes.map((s) => s.left)).toEqual([20, 40]);

    expect(snap.events).toContainEqual({ t: 'strike', x: 300, y: 600, kind: 1 });
    expect(snap.events).toContainEqual({ t: 'art', p: 2, art: ArtId.RewrittenFate, pause: SP });
    expect(snap.events).toContainEqual({ t: 'shoot', p: 1, kind: 6 });
  });
});

describe('bot vs bot with random heroes', () => {
  it('matches between random heroes finish, and the bots use their Arts', () => {
    // a fixed linear congruential sequence keeps the matches reproducible
    let seed = 20261031;
    const rnd = (n: number) => {
      seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
      return (seed >>> 8) % n;
    };
    const CAP = 60 * 60 * 8;
    let artStarts = 0;
    for (let m = 0; m < 8; m++) {
      const arena = ARENAS[rnd(ARENAS.length)].id;
      const la = sanitizeLoadout({ hero: rnd(HERO_COUNT), weapons: [0, rnd(8)], skill: rnd(4) });
      const lb = sanitizeLoadout({ hero: rnd(HERO_COUNT), weapons: [0, rnd(8)], skill: rnd(4) });
      const w = new World({ arenaId: arena, wins: 2, roundTime: 60 });
      const fa: Fighter = w.addFighter(1, 0, 'A', la, true);
      const fb: Fighter = w.addFighter(2, 1, 'B', lb, true);
      const ba = new BotBrain(1, 100 + m, 'normal');
      const bb = new BotBrain(2, 200 + m, 'normal');
      w.start();
      let ticks = 0;
      while (w.phase !== 'over' && ticks < CAP) {
        const ca: InputCmd = ba.think(w);
        const cb: InputCmd = bb.think(w);
        fa.inputs.push(ca);
        fb.inputs.push(cb);
        w.step();
        artStarts += w.events.filter((e) => e.t === 'art').length;
        w.events = [];
        ticks++;
      }
      expect(w.phase, `match ${m} (${HEROES[la.hero].name} vs ${HEROES[lb.hero].name} on ${arena}) after ${ticks} ticks`).toBe('over');
      expect(Math.max(...w.wins)).toBe(2);
    }
    expect(artStarts).toBeGreaterThan(0);
  });
});
