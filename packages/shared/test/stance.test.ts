// The STANCE button: every hero carries a second weapon with a moveset of its own (heroes.ts STANCE_WEAPON). These pin the
// change itself (timing, cancels, air), which weapon each button uses in each stance, the stance weapons' own effects,
// the wire format, and that the bots use it.
import { describe, expect, it } from 'vitest';
import {
  Act, BotBrain, Btn, decodeInputs, decodeSnapshot, encodeInputs, encodeSnapshot, encodeSnapshotBody, GameEvent, HEROES, InputCmd, MOVE_CHARGED,
  newFighterState, ROUND, sanitizeLoadout, slotFor, STANCE, STANCE_LOOKS, STANCE_WEAPON, stanceWeapon, stepFighter, weaponAt, WEAPONS, WeaponId,
  WEAPON_COUNT, World, ARENAS,
} from '../src/index';

const cmd = (buttons = 0, moveX = 0, moveY = 0): InputCmd => ({ seq: 0, moveX, moveY, buttons, viewTick: 0 });
const arena = ARENAS.find((a) => a.id === 'training') ?? ARENAS[0];

/** A lone fighter on the floor of the training arena, stepped with `plan` for `ticks`; returns the state and the acts seen. */
function solo(hero: number, plan: (t: number) => InputCmd, ticks: number, air = false) {
  const load = sanitizeLoadout({ hero });
  const s = newFighterState(arena.w / 2, air ? arena.floor - 160 : arena.floor, 1, load);
  if (air) s.ground = 0;
  const acts: number[] = [];
  const stances: number[] = [];
  for (let t = 0; t < ticks; t++) {
    stepFighter(s, plan(t), arena, load);
    acts.push(s.act);
    stances.push(s.stance);
  }
  return { s, acts, stances, load };
}

function duel(atk: number, gap: number, ap: (t: number) => InputCmd, ticks = 120, stance = 0) {
  const w = new World({ arenaId: 'training', wins: 2, roundTime: 90 });
  const a = w.addFighter(1, 0, 'A', sanitizeLoadout({ hero: atk }), true);
  const d = w.addFighter(2, 1, 'D', sanitizeLoadout({ hero: 0 }), true);
  w.start();
  for (let i = 0; i < ROUND.introTicks + 1; i++) w.step();
  const mid = w.arena.w / 2;
  a.s.x = mid - gap / 2;
  d.s.x = mid + gap / 2;
  a.s.face = 1;
  d.s.face = -1;
  a.s.hp = d.s.hp = 1e5;
  a.s.stance = stance;
  const hits: { t: number; w: number }[] = [];
  let maxBurn = 0;
  let maxSlow = 0;
  for (let t = 0; t < ticks; t++) {
    a.inputs.push({ ...ap(t), seq: a.lastSeq + 1 });
    d.inputs.push({ ...cmd(), seq: d.lastSeq + 1 });
    w.events = [];
    w.step();
    for (const e of w.events as GameEvent[]) if (e.t === 'hit' && e.v === d.id) hits.push({ t, w: e.w });
    maxBurn = Math.max(maxBurn, d.s.burnT);
    maxSlow = Math.max(maxSlow, d.s.slowT);
  }
  return { w, a, d, hits, maxBurn, maxSlow };
}

describe('stance weapons', () => {
  it('every hero has its own stance weapon, after the loadout weapons, with a look, a combo and an air move', () => {
    expect(STANCE_WEAPON.length).toBe(HEROES.length);
    expect(STANCE_LOOKS.length).toBe(HEROES.length);
    expect(new Set(STANCE_WEAPON).size).toBe(HEROES.length);
    for (const [hero, w] of STANCE_WEAPON.entries()) {
      expect(w).toBeGreaterThanOrEqual(WEAPON_COUNT);
      const def = WEAPONS[w];
      expect(def.id).toBe(w);
      expect(def.combo.length).toBeGreaterThanOrEqual(3);
      expect(def.air).toBeTruthy();
      // a thrown charged move needs a projectile speed
      if (def.charged?.arrow || def.combo[0].arrow) expect(def.arrowSpeed).toBeGreaterThan(0);
      // and never in a loadout: the hero's kit stays its first weapon
      const load = sanitizeLoadout({ hero, weapons: [w, w] });
      expect(load.weapons[0]).toBeLessThan(WEAPON_COUNT);
    }
    expect(stanceWeapon(2)).toBe(WeaponId.Kingsblade);
  });

  it('weaponAt: slots 0 and 1 are the loadout weapon, 2 and 3 the stance weapon; slotFor maps the buttons by stance', () => {
    const load = sanitizeLoadout({ hero: 2 });
    expect(weaponAt(load, 0)).toBe(WeaponId.Gate);
    expect(weaponAt(load, 1)).toBe(WeaponId.Gate);
    expect(weaponAt(load, 2)).toBe(WeaponId.Kingsblade);
    expect(weaponAt(load, 3)).toBe(WeaponId.Kingsblade);
    expect([slotFor(0, 0), slotFor(1, 0), slotFor(0, 1), slotFor(1, 1)]).toEqual([0, 1, 2, 3]);
  });
});

describe('the stance change', () => {
  it('STANCE changes the weapon at STANCE.flip and ends at STANCE.ticks; pressed again it changes back', () => {
    const r = solo(2, (t) => cmd(t === 1 || t === 40 ? Btn.Stance : 0), 70);
    expect(r.acts[1]).toBe(Act.Swap);
    expect(r.stances[1 + STANCE.flip - 1]).toBe(0);
    expect(r.stances[1 + STANCE.flip]).toBe(1);
    expect(r.acts[1 + STANCE.ticks + 1]).toBe(Act.Free);
    expect(r.stances[39]).toBe(1);
    expect(r.stances[69]).toBe(0);
  });

  it('LIGHT and HEAVY use the stance weapon once it is in hand: slots 2 and 3', () => {
    // Gilgamesh: the Kingsblade's light swing, then (held) its charged lunge
    const r = solo(2, (t) => cmd(t === 1 ? Btn.Stance : t === 30 ? Btn.A : 0), 34);
    expect(r.s.act).toBe(Act.Attack);
    expect(r.s.slot).toBe(2);
    const h = solo(2, (t) => cmd(t === 1 ? Btn.Stance : t >= 30 && t < 60 ? Btn.B : 0), 62);
    expect([Act.Attack, Act.Charge]).toContain(h.s.act);
    expect(h.s.slot).toBe(3);
    expect(h.s.move).toBe(MOVE_CHARGED);
  });

  it('any action cancels the change after the flip, but not before it', () => {
    // pressed during the draw: the swing waits for the flip and comes out with the new weapon
    const r = solo(2, (t) => cmd(t === 1 ? Btn.Stance : t === 3 ? Btn.A : 0), 1 + STANCE.flip + 4);
    expect(r.acts[3]).toBe(Act.Swap);
    expect(r.s.act).toBe(Act.Attack);
    expect(r.s.slot).toBe(2);
    expect(r.acts.indexOf(Act.Attack)).toBeGreaterThan(1 + STANCE.flip - 1);
    expect(r.acts.indexOf(Act.Attack)).toBeLessThanOrEqual(1 + STANCE.flip + 2);
  });

  it('works in the air, and a press during an attack goes off when it ends', () => {
    const air = solo(6, (t) => cmd(t === 1 ? Btn.Stance : 0), 1 + STANCE.flip + 1, true);
    expect(air.s.stance).toBe(1);
    const busy = solo(0, (t) => cmd(t === 1 ? Btn.A : t === 4 ? Btn.Stance : 0), 60);
    expect(busy.acts).toContain(Act.Swap);
    expect(busy.s.stance).toBe(1);
  });
});

describe('stance weapons in a fight', () => {
  it("Gilgamesh's Kingsblade connects up close as a melee swing (the Gate's shots never reach that close in time)", () => {
    const r = duel(2, 50, (t) => cmd(t === 1 ? Btn.Stance : t === 30 ? Btn.A : 0), 60);
    expect(r.hits.length).toBe(1);
    expect(r.hits[0].w).toBe(WeaponId.Kingsblade);
  });

  it("Humbaba's fire breath sets the target burning; the Pale Rider's shadow bite slows it", () => {
    const fire = duel(9, 70, (t) => cmd(t === 2 ? Btn.A : 0), 60, 1);
    // (the burn's own ticks are hits too: count the breath's)
    expect(fire.hits.filter((h) => h.w === WeaponId.FireBreath).length).toBe(1);
    expect(fire.maxBurn).toBeGreaterThan(20);
    const shadow = duel(12, 90, (t) => cmd(t === 2 || t === 30 || t === 58 ? Btn.A : 0), 130, 1);
    expect(shadow.hits.filter((h) => h.w === WeaponId.Shadow).length).toBeGreaterThanOrEqual(3);
    expect(shadow.maxSlow).toBeGreaterThan(30);
  });

  it("Cu Chulainn's darts and Brynhildr's hurled spear are projectiles", () => {
    const darts = duel(3, 300, (t) => cmd(t === 2 ? Btn.A : 0), 60, 1);
    expect(darts.hits.length).toBe(1);
    const spear = duel(13, 320, (t) => cmd(t >= 2 && t < 50 ? Btn.B : 0), 100, 1);
    expect(spear.hits.length).toBe(1);
  });
});

describe('stance on the wire', () => {
  it('the STANCE bit survives the input encoding', () => {
    const back = decodeInputs(encodeInputs([{ seq: 7, moveX: 0, moveY: 0, buttons: Btn.Stance | Btn.Block | Btn.A, viewTick: 3 }]));
    expect(back[0].buttons).toBe(Btn.Stance | Btn.Block | Btn.A);
  });

  it('a snapshot carries the stance and an attack slot of 2 or 3, and each fighter weapon by slot', () => {
    const r = duel(2, 50, (t) => cmd(t === 1 ? Btn.Stance : t === 30 ? Btn.A : 0), 34);
    const body = encodeSnapshotBody(r.w, []);
    const snap = decodeSnapshot(encodeSnapshot(r.w, r.a.id, body));
    const f = snap.fighters.find((x) => x.id === r.a.id)!;
    expect(f.stance).toBe(1);
    expect(f.slot).toBe(2);
    expect(f.weapons[f.slot]).toBe(WeaponId.Kingsblade);
    expect(snap.self?.stance).toBe(1);
  });
});

describe('bots and the stance', () => {
  it('bots switch stance during a fight', () => {
    const w = new World({ arenaId: 'training', wins: 2, roundTime: 90 });
    const a = w.addFighter(1, 0, 'A', sanitizeLoadout({ hero: 2 }), true);
    const b = w.addFighter(2, 1, 'B', sanitizeLoadout({ hero: 3 }), true);
    const ba = new BotBrain(1, 11, 'hard');
    const bb = new BotBrain(2, 12, 'hard');
    w.start();
    let swaps = 0;
    for (let t = 0; t < 60 * 60 && w.phase !== 'end'; t++) {
      a.inputs.push(ba.think(w));
      b.inputs.push(bb.think(w));
      const before = [a.s.act, b.s.act];
      w.step();
      if (a.s.act === Act.Swap && before[0] !== Act.Swap) swaps++;
      if (b.s.act === Act.Swap && before[1] !== Act.Swap) swaps++;
    }
    expect(swaps).toBeGreaterThan(2);
  });
});
