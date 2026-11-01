// The MUGEN feel pass in the simulation (docs/feel/mugen-reference.md, group G): hit-stop, the Rift Art superpause,
// long combos with damage scaling, chain on hit, and knockdowns.
import { describe, expect, it } from 'vitest';
import {
  Act, ArtId, ARTS, Btn, CLASSES, ClassId, comboScale, copyState, decodeSnapshot, encodeSnapshot, encodeSnapshotBody, FIGHTER, FighterState, GameEvent,
  getArena, heroClass, HEROES, hitstopFor, HITSTOP, InputCmd, Loadout, newFighterState, RIFT, ROUND, sanitizeLoadout, stepFighter, World, WeaponId, WEAPONS,
} from '../src/index';

/** Richard: the longsword in both hands (a three-hit combo whose third swing launches). */
const LEON: Loadout = sanitizeLoadout({ hero: 0 });
const SWORD = WEAPONS[WeaponId.Sword];
const heroFor = (cls: ClassId) => HEROES.find((h) => h.cls === cls && h.art === CLASSES[cls].art)!.id;

type HitEvent = Extract<GameEvent, { t: 'hit' }>;

function duel(a: Loadout = LEON, b: Loadout = LEON, gap = 40) {
  const w = new World({ arenaId: 'bridge', wins: 2, roundTime: 90 });
  const fa = w.addFighter(1, 0, 'A', a);
  const fb = w.addFighter(2, 1, 'B', b);
  w.start();
  for (let i = 0; i < ROUND.introTicks + 1; i++) w.step();
  fa.s.x = 600;
  fb.s.x = 600 + gap;
  fa.s.face = 1;
  fb.s.face = -1;
  return { w, fa, fb };
}

const cmd = (seq: number, moveX = 0, buttons = 0): InputCmd => ({ seq, moveX, moveY: 0, buttons, viewTick: 0 });

/** One world tick with these pads; returns the tick's events. */
function tick(w: World, a: { x?: number; btn?: number } = {}, b: { x?: number; btn?: number } = {}) {
  const fa = w.fighters.get(1)!;
  const fb = w.fighters.get(2)!;
  fa.inputs.push(cmd(fa.lastSeq + 1, a.x ?? 0, a.btn ?? 0));
  fb.inputs.push(cmd(fb.lastSeq + 1, b.x ?? 0, b.btn ?? 0));
  w.step();
  const ev = w.events;
  w.events = [];
  return ev;
}

/** Steps until a hit by `a` lands (at most n ticks); returns its event. */
function untilHit(w: World, a: number, n: number, pad: (i: number) => { x?: number; btn?: number } = () => ({})) {
  for (let i = 1; i <= n; i++) {
    const hit = tick(w, pad(i)).find((e): e is HitEvent => e.t === 'hit' && e.a === a);
    if (hit) return hit;
  }
  return undefined;
}

/** The World's hit entry point (private): a hit with these numbers from a onto d. */
type HitSpec = { dmg: number; kbX: number; kbY: number; stun: number; crit: boolean; w: number; x: number; y: number; front: boolean };
const applyHit = (w: World, a: unknown, d: unknown, h: HitSpec) => (w as unknown as { applyHit(a: unknown, d: unknown, h: HitSpec): boolean }).applyHit(a, d, h);

describe('hit-stop', () => {
  it('sizes the freeze from the hit: light, medium, heavy, crit, Art, blocked', () => {
    expect(hitstopFor(40, false, false, false)).toBe(6);
    expect(hitstopFor(80, false, false, false)).toBe(8);
    expect(hitstopFor(95, false, false, false)).toBe(9);
    expect(hitstopFor(160, false, false, false)).toBe(HITSTOP.max);
    expect(hitstopFor(400, false, false, false)).toBe(HITSTOP.max);
    expect(hitstopFor(40, true, false, false)).toBe(12);
    expect(hitstopFor(160, true, false, false)).toBe(HITSTOP.crit);
    expect(hitstopFor(30, false, true, false)).toBe(HITSTOP.art);
    expect(hitstopFor(160, true, true, true)).toBe(HITSTOP.block);
  });

  it('a landed swing freezes attacker and defender exactly; the knockback starts after the freeze', () => {
    const { w, fa, fb } = duel();
    const hit = untilHit(w, 1, 30, (i) => ({ btn: i === 1 ? Btn.A : 0 }));
    expect(hit).toBeDefined();
    const hs = hitstopFor(SWORD.combo[0].dmg, false, false, false);
    expect(hit!.hs).toBe(hs);
    expect(hit!.n).toBe(1);
    expect(fa.s.hitstop).toBe(hs);
    expect(fb.s.hitstop).toBe(hs);
    expect(fb.s.act).toBe(Act.Stun);
    expect(fb.s.vx).toBeGreaterThan(0); // the knockback is set (away from A), and held
    const a0 = copyState(fa.s);
    const b0 = copyState(fb.s);
    for (let k = 0; k < hs; k++) {
      tick(w, { x: 1 }, { x: -1 }); // (pushing the stick changes nothing while frozen)
      for (const key of ['x', 'y', 'vx', 'vy', 'actT', 'stun', 'act', 'invuln'] as const) {
        expect(fa.s[key], `attacker ${key} on frozen tick ${k + 1}`).toBe(a0[key]);
        expect(fb.s[key], `defender ${key} on frozen tick ${k + 1}`).toBe(b0[key]);
      }
    }
    expect(fa.s.hitstop).toBe(0);
    expect(fb.s.hitstop).toBe(0);
    tick(w);
    // now the blow plays out: the defender slides away and the attacker's swing goes on
    expect(fb.s.x).toBeGreaterThan(b0.x);
    expect(fa.s.actT).toBe(a0.actT + 1);
    expect(fb.s.stun).toBe(b0.stun - 1);
  });

  it('a press made during the freeze is kept (the buffer waits too) and chains on hit when it ends', () => {
    const { w, fa } = duel();
    const hit = untilHit(w, 1, 30, (i) => ({ btn: i === 1 ? Btn.A : 0 }));
    expect(hit).toBeDefined();
    const hs = fa.s.hitstop;
    expect(hs).toBeGreaterThan(FIGHTER.buffer - 4);
    // a single tap on the first frozen tick, then nothing
    tick(w, { btn: Btn.A });
    for (let k = 0; k < hs + 12 && fa.s.move === 0; k++) tick(w);
    expect(fa.s.act).toBe(Act.Attack);
    expect(fa.s.move).toBe(1);
  });

  it('a blocked swing freezes both for the short block hit-stop', () => {
    const { w, fa, fb } = duel(LEON, sanitizeLoadout({ hero: 13 }));
    let block: Extract<GameEvent, { t: 'block' }> | undefined;
    // B (a shield) raises its guard early and holds it: a block, not a parry
    for (let i = 1; i <= 40 && !block; i++) {
      block = tick(w, { btn: i === 20 ? Btn.A : 0 }, { btn: Btn.A }).find((e): e is Extract<GameEvent, { t: 'block' }> => e.t === 'block');
    }
    expect(block).toBeDefined();
    expect(block!.hs).toBe(HITSTOP.block);
    expect(fa.s.hitstop).toBe(HITSTOP.block);
    expect(fb.s.hitstop).toBe(HITSTOP.block);
  });

  it('a projectile freezes only the defender', () => {
    const { w, fa, fb } = duel(LEON, LEON, 300);
    w.projectiles.push({ id: 900, kind: 'arrow', owner: fb.id, x: 660, y: w.arena.floor - 30, vx: -600, vy: 0, dmg: 60, kb: 120, stun: 20, life: 60, heavy: false });
    const hit = untilHit(w, fb.id, 20);
    expect(hit).toBeDefined();
    expect(fa.s.hitstop).toBe(hitstopFor(60, false, false, false));
    expect(fb.s.hitstop).toBe(0);
  });
});

describe('superpause', () => {
  it('a Rift Art freezes both fighters, projectiles, strikes, traps and the clock; the Art plays out after it', () => {
    // Radiant Cleave (the saber's wave at Art tick 18) against a fighter holding right with a projectile in flight
    const a = sanitizeLoadout({ hero: heroFor(ClassId.Saber) });
    const { w, fa, fb } = duel(a, LEON, 300);
    fa.s.rift = RIFT.max;
    w.projectiles.push({ id: 901, kind: 'arrow', owner: fb.id, x: 200, y: 400, vx: 300, vy: 0, dmg: 10, kb: 0, stun: 5, life: 200, heavy: false });
    w.strikes.push({ id: 902, owner: fb.id, x: 100, y: w.arena.floor, at: w.tick + 30, aimed: true, kind: 0 });
    w.traps.push({ id: 903, owner: fb.id, x: 100, y: w.arena.floor, armAt: w.tick + 10, until: w.tick + 100 });
    const ev = tick(w, { btn: Btn.Special }, { x: 1 });
    const art = ev.find((e) => e.t === 'art');
    expect(art).toMatchObject({ t: 'art', p: fa.id, art: ArtId.RadiantCleave, pause: FIGHTER.superpause });
    expect(fa.s.act).toBe(Act.Art);
    expect(fa.s.pause).toBe(FIGHTER.superpause);
    expect(fb.s.pause).toBe(FIGHTER.superpause);
    expect(w.pause).toBe(FIGHTER.superpause);
    const p0 = { ...w.projectiles[0] };
    const strikeLeft = w.strikes[0].at - w.tick;
    const trapLeft = w.traps[0].armAt - w.tick;
    const clock = w.timeLeft;
    const bx = fb.s.x;
    let pressedAt = -1;
    for (let k = 1; k <= FIGHTER.superpause; k++) {
      // the opponent holds right and taps an attack: nothing happens until the pause is over
      tick(w, {}, { x: 1, btn: k === 30 ? Btn.A : 0 });
      if (k === 30) pressedAt = k;
      expect(fa.s.actT, `caster frozen at pause tick ${k}`).toBe(0);
      expect(fb.s.x).toBe(bx);
      expect(fb.s.act).toBe(Act.Free);
      expect(w.projectiles[0].x).toBe(p0.x);
      expect(w.strikes[0].at - w.tick).toBe(strikeLeft);
      expect(w.traps[0].armAt - w.tick).toBe(trapLeft);
      expect(w.timeLeft).toBe(clock);
    }
    expect(pressedAt).toBe(30);
    expect(fa.s.pause).toBe(0);
    expect(fb.s.pause).toBe(0);
    tick(w, {}, { x: 1 });
    // the Art's timeline starts now, the projectile flies on, and the buffered press goes off
    expect(fa.s.actT).toBe(1);
    expect(w.projectiles[0].x).toBeGreaterThan(p0.x);
    expect(fb.s.act).toBe(Act.Attack);
    // the wave comes out at Art tick 18 (not 18 ticks after the cast)
    let shotAt = -1;
    for (let k = 2; k <= 30 && shotAt < 0; k++) if (tick(w).some((e) => e.t === 'shoot' && e.p === fa.id)) shotAt = k;
    expect(shotAt).toBe(18);
  });

  it("the Art's invulnerability is counted after the pause", () => {
    const a = sanitizeLoadout({ hero: heroFor(ClassId.Assassin) });
    const { w, fa } = duel(a, LEON, 160);
    fa.s.rift = RIFT.max;
    tick(w, { btn: Btn.Special });
    expect(fa.s.act).toBe(Act.Art);
    const inv = fa.s.invuln;
    expect(inv).toBeGreaterThanOrEqual(ARTS[ArtId.FlashStep].ticks);
    for (let k = 0; k < FIGHTER.superpause; k++) tick(w);
    expect(fa.s.invuln).toBe(inv);
  });

  it("the caster's own superpause is predicted: stepFighter alone freezes it", () => {
    const arena = getArena('bridge');
    const load = sanitizeLoadout({ hero: heroFor(ClassId.Saber) });
    const s = newFighterState(400, arena.floor, 1, load.cls);
    s.rift = RIFT.max;
    stepFighter(s, cmd(1, 0, Btn.Special), arena, load);
    expect(s.act).toBe(Act.Art);
    expect(s.pause).toBe(FIGHTER.superpause);
    for (let k = 0; k < FIGHTER.superpause; k++) stepFighter(s, cmd(2 + k, 1), arena, load);
    expect(s.actT).toBe(0);
    expect(s.x).toBe(400);
    stepFighter(s, cmd(99), arena, load);
    expect(s.actT).toBe(1);
  });
});

describe('combos', () => {
  it('scales damage hit by hit: 100%, -7% per hit, down to 40%', () => {
    expect(comboScale(1)).toBe(1);
    expect(comboScale(2)).toBeCloseTo(0.93, 6);
    expect(comboScale(5)).toBeCloseTo(0.72, 6);
    expect(comboScale(10)).toBeCloseTo(0.4, 6);
    expect(comboScale(30)).toBeCloseTo(0.4, 6);
  });

  it('the sword string is one combo: each hit is numbered and scaled, chained on hit', () => {
    const { w, fa, fb } = duel();
    const hits: HitEvent[] = [];
    for (let i = 1; i <= 120 && hits.length < 3; i++) {
      hits.push(...tick(w, { btn: i % 2 ? Btn.A : 0 }).filter((e): e is HitEvent => e.t === 'hit' && e.a === fa.id));
    }
    expect(hits.map((h) => h.n)).toEqual([1, 2, 3]);
    const C = heroClass(LEON); // (the class with the hero's own tune)
    hits.forEach((h, k) => expect(h.amt, `hit ${k + 1}`).toBe(Math.max(1, Math.round(Math.round(SWORD.combo[k].dmg * C.dmg) * comboScale(k + 1)))));
    expect(fb.comboHits).toBe(3);
  });

  it('a long combo runs to comboBreak hits, then the anti-infinite makes the defender untouchable', () => {
    const { w, fa, fb } = duel();
    const C = heroClass(LEON); // (the class with the hero's own tune)
    const events: HitEvent[] = [];
    for (let n = 1; n <= FIGHTER.comboBreak; n++) {
      applyHit(w, fa, fb, { dmg: 50, kbX: 0, kbY: 0, stun: 30, crit: false, w: WeaponId.Sword, x: 620, y: 570, front: true });
      events.push(...(w.events.filter((e) => e.t === 'hit') as HitEvent[]));
      w.events = [];
      if (n < FIGHTER.comboBreak) {
        expect(fb.s.invuln, `no break at hit ${n}`).toBe(0);
        expect(fb.comboHits).toBe(n);
      }
    }
    // real strings, but not so long that the player on the receiving end watches for seconds (owner: "a hot mess")
    expect(FIGHTER.comboBreak).toBeGreaterThanOrEqual(8);
    expect(events.map((e) => e.n)).toEqual(Array.from({ length: FIGHTER.comboBreak }, (_, i) => i + 1));
    events.forEach((e, i) => expect(e.amt).toBe(Math.round(Math.round(50 * C.dmg) * comboScale(i + 1))));
    expect(events[events.length - 1].amt).toBe(Math.round(Math.round(50 * C.dmg) * FIGHTER.comboScaleMin));
    expect(fb.s.invuln).toBe(FIGHTER.breakInvuln);
    expect(fb.comboHits).toBe(0);
  });

  it('a hit on a fighter that has recovered starts a new combo; Rift Art hits land in full and never trip the break', () => {
    const { w, fa, fb } = duel();
    const C = heroClass(LEON); // (the class with the hero's own tune)
    for (let n = 1; n < FIGHTER.comboBreak; n++) applyHit(w, fa, fb, { dmg: 50, kbX: 0, kbY: 0, stun: 30, crit: false, w: WeaponId.Sword, x: 620, y: 570, front: true });
    w.events = [];
    // an Art hit (weapon 104..199) as the comboBreak-th: counted, full damage, no break
    applyHit(w, fa, fb, { dmg: 50, kbX: 0, kbY: 0, stun: 30, crit: false, w: 104, x: 620, y: 570, front: true });
    const art = w.events.find((e) => e.t === 'hit') as HitEvent;
    expect(art.n).toBe(FIGHTER.comboBreak);
    expect(art.amt).toBe(Math.round(50 * C.dmg));
    expect(art.hs).toBe(HITSTOP.art);
    expect(fb.s.invuln).toBe(0);
    // recovered: the next hit is a fresh one
    fb.s.act = Act.Free;
    w.events = [];
    applyHit(w, fa, fb, { dmg: 50, kbX: 0, kbY: 0, stun: 30, crit: false, w: WeaponId.Sword, x: 620, y: 570, front: true });
    expect((w.events.find((e) => e.t === 'hit') as HitEvent).n).toBe(1);
  });

  it('chain on hit: a connected swing takes the next press as soon as its hit window ends (a whiff waits)', () => {
    const arena = getArena('bridge');
    const chainTick = (connect: boolean) => {
      const s = newFighterState(400, arena.floor, 1, LEON.cls);
      const m = SWORD.combo[0];
      stepFighter(s, cmd(1, 0, Btn.A), arena, LEON);
      for (let t = 1; t < 40; t++) {
        // the World sets confirm when the swing lands (first active tick)
        if (connect && s.act === Act.Attack && s.actT === m.startup) s.confirm = 16;
        stepFighter(s, cmd(t + 1, 0, t === m.startup ? Btn.A : 0), arena, LEON);
        if (s.move === 1) return t;
      }
      return -1;
    };
    const m = SWORD.combo[0];
    const hit = chainTick(true);
    const whiff = chainTick(false);
    expect(hit).toBeGreaterThan(0);
    expect(whiff).toBeGreaterThan(hit);
    expect(hit).toBe(m.startup + m.active);
  });
});

describe('knockdown', () => {
  it('a heavy launch lands in a knockdown: lying invulnerable, a get-up, then a few more untouchable ticks', () => {
    const { w, fa, fb } = duel();
    applyHit(w, fa, fb, { dmg: 60, kbX: 200, kbY: 420, stun: 20, crit: false, w: WeaponId.Sword, x: 620, y: 570, front: true });
    expect(fb.s.act).toBe(Act.Stun);
    expect(fb.s.fall).toBe(1);
    expect(fb.s.ground).toBe(0);
    // airborne longer than its stun: still in hit-stun (no recovery in the air) until it lands
    let t = 0;
    while (fb.s.act === Act.Stun && t++ < 200) {
      tick(w);
      if (fb.s.act === Act.Stun && !fb.s.ground) expect(fb.s.stun).toBeGreaterThan(0);
    }
    expect(t).toBeGreaterThan(20 + hitstopFor(60, false, false, false));
    expect(fb.s.act).toBe(Act.Down);
    expect(fb.s.ground).toBe(1);
    expect(fb.s.fall).toBe(0);
    expect(fb.s.invuln).toBeGreaterThanOrEqual(FIGHTER.downTicks + FIGHTER.getUpTicks);
    // a swing at the downed fighter whiffs
    fa.s.x = fb.s.x - 30;
    fa.s.face = 1;
    const hp = fb.s.hp;
    let downFor = 1;
    let tapped = false;
    while (fb.s.act === Act.Down && downFor < 100) {
      tick(w, { btn: !tapped ? Btn.A : 0 });
      tapped = true;
      if (fb.s.act === Act.Down) downFor++;
    }
    expect(fb.s.hp).toBe(hp);
    expect(downFor).toBe(FIGHTER.downTicks);
    expect(fb.s.act).toBe(Act.GetUp);
    let upFor = 1;
    while (fb.s.act === Act.GetUp && upFor < 100) {
      tick(w);
      if (fb.s.act === Act.GetUp) upFor++;
    }
    expect(upFor).toBe(FIGHTER.getUpTicks);
    expect(fb.s.act).toBe(Act.Free);
    expect(fb.s.invuln).toBeGreaterThan(0);
    expect(fb.s.invuln).toBeLessThanOrEqual(FIGHTER.wakeInvuln);
  });

  it('a light pop-up recovers in the air as before; a juggle hit on a falling fighter keeps the knockdown', () => {
    const { w, fa, fb } = duel();
    applyHit(w, fa, fb, { dmg: 40, kbX: 100, kbY: 180, stun: 14, crit: false, w: WeaponId.Sword, x: 620, y: 570, front: true });
    expect(fb.s.fall).toBe(0);
    let sawDown = false;
    for (let i = 0; i < 90; i++) {
      tick(w);
      if (fb.s.act === Act.Down) sawDown = true;
    }
    expect(sawDown).toBe(false);
    expect(fb.s.act).toBe(Act.Free);

    const j = duel();
    applyHit(j.w, j.fa, j.fb, { dmg: 60, kbX: 150, kbY: 500, stun: 30, crit: false, w: WeaponId.Sword, x: 620, y: 570, front: true });
    for (let i = 0; i < 20; i++) tick(j.w);
    expect(j.fb.s.ground).toBe(0);
    // a light juggle hit (no launch of its own) on the falling fighter
    applyHit(j.w, j.fa, j.fb, { dmg: 30, kbX: 60, kbY: 60, stun: 12, crit: false, w: WeaponId.Sword, x: 620, y: 500, front: true });
    expect(j.fb.s.fall).toBe(1);
    expect((j.w.events.filter((e) => e.t === 'hit').pop() as HitEvent).n).toBe(2);
    let down = false;
    for (let i = 0; i < 120 && !down; i++) {
      tick(j.w);
      down = j.fb.s.act === Act.Down;
    }
    expect(down).toBe(true);
  });

  it("the sword's launcher (the third swing) knocks down", () => {
    const { w, fa, fb } = duel();
    let down = false;
    for (let i = 1; i <= 200 && !down; i++) {
      tick(w, { btn: i % 2 ? Btn.A : 0 });
      down = fb.s.act === Act.Down;
    }
    expect(down).toBe(true);
    void fa;
  });
});

describe('determinism and the wire', () => {
  it('replaying commands over hit-stop and superpause gives the same state (client prediction)', () => {
    const arena = getArena('grove');
    const load = sanitizeLoadout({ hero: 7 });
    const a = newFighterState(400, arena.floor, 1, load.cls);
    const cmds: InputCmd[] = [];
    let seed = 11;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 900; i++) cmds.push(cmd(i, rnd() * 2 - 1, rnd() < 0.25 ? 1 << Math.floor(rnd() * 7) : 0));
    const b = copyState(a);
    // the World's freezes, at the same commands in both runs
    const external = (s: FighterState, i: number) => {
      if (i % 97 === 13) s.hitstop = 6 + (i % 9);
      if (i === 400) s.pause = FIGHTER.superpause;
      if (i % 150 === 0) s.rift = RIFT.max;
    };
    let frozen = 0;
    cmds.forEach((c, i) => {
      external(a, i);
      if (a.hitstop > 0 || a.pause > 0) frozen++;
      stepFighter(a, c, arena, load);
    });
    cmds.forEach((c, i) => {
      external(b, i);
      stepFighter(b, c, arena, load);
    });
    expect(frozen).toBeGreaterThan(80);
    expect(b).toEqual(a);
  });

  it('round-trips hitstop, pause, fall and the new event fields', () => {
    const { w, fa, fb } = duel();
    fa.s.hitstop = 9;
    fb.s.pause = 33;
    fb.s.fall = 1;
    fb.s.act = Act.Down;
    const events: GameEvent[] = [
      { t: 'hit', a: 1, v: 2, amt: 47, w: WeaponId.Sword, crit: false, x: 620, y: 570, n: 7, hs: 8 },
      { t: 'block', a: 2, v: 1, amt: 3, x: 610, y: 570, hs: 4 },
      { t: 'art', p: 1, art: ArtId.FlashStep, pause: FIGHTER.superpause },
    ];
    const snap = decodeSnapshot(encodeSnapshot(w, 1, encodeSnapshotBody(w, events)));
    expect(snap.self!.hitstop).toBe(9);
    expect(snap.self!.pause).toBe(0);
    expect(snap.self!.fall).toBe(0);
    const a = snap.fighters.find((f) => f.id === 1)!;
    const b = snap.fighters.find((f) => f.id === 2)!;
    expect(a.hitstop).toBe(9);
    expect(b.pause).toBe(33);
    expect(b.fall).toBe(true);
    expect(a.fall).toBe(false);
    expect(b.act).toBe(Act.Down);
    expect(snap.events[0]).toMatchObject({ t: 'hit', x: 620, y: 570, n: 7, hs: 8 });
    expect(snap.events[1]).toEqual({ t: 'block', a: 2, v: 1, amt: 3, x: 610, y: 570, hs: 4 });
    expect(snap.events[2]).toEqual({ t: 'art', p: 1, art: ArtId.FlashStep, pause: FIGHTER.superpause });
  });
});
