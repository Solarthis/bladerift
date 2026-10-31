import { describe, expect, it } from 'vitest';
import {
  Act, Btn, classOf, DODGES, dodgeOf, FIGHTER, FLASH, FoeView, FighterState, getArena, HEROES, HERO_COUNT, InputCmd, isFlashStepper,
  heroClass, newFighterState, sanitizeLoadout, stepFighter, WEAPONS,
} from '../src/index';

/**
 * Every hero's dodge (the Roll button; weapons.ts DODGES, read through dodgeOf). No numbers are written here: distances,
 * durations and invulnerability come from the table. Tests marked `it.fails` are known sim bugs (the comment names the
 * cause): they pass while the bug is present and start failing once it is fixed - then drop the `.fails`.
 */
const arena = getArena('bridge');
const FLOOR = arena.floor;
const AIR = FLOOR - 300;

type Stick = { x?: number; y?: number };
const cmd = (seq: number, s: Stick = {}, buttons = 0): InputCmd => ({ seq, moveX: s.x ?? 0, moveY: s.y ?? 0, buttons, viewTick: 0 });

interface Run {
  s: FighterState;
  /** Tick (1 = the press tick) when the dodge left the Roll state, or -1 if it never did within the cap. */
  endT: number;
  cdAtEnd: number;
  x0: number;
  y0: number;
  /** Where the hero was when the dodge ended. */
  endX: number;
  endY: number;
  /** Ticks in a row from the press with invulnerability on (the whole run, not only the dodge). */
  invulRun: number;
  /** Every tick the Roll state was active had invulnerability on. */
  invulAll: boolean;
  /** Highest height above the start while the dodge ran (positive = up). */
  peakUp: number;
}

/**
 * A fighter of `hero` at x 300 facing right, grounded (the floor) or in the air. Roll is pressed on tick 1 with the `press`
 * stick, and the `hold` stick is kept for the rest. Runs `cap` ticks, and records where and when the dodge ended.
 */
function runDodge(
  hero: number,
  o: { ground?: boolean; x?: number; y?: number; press?: Stick; hold?: Stick; foe?: FoeView; cap?: number } = {},
): Run {
  const load = sanitizeLoadout({ hero });
  const ground = o.ground ?? true;
  const s = newFighterState(o.x ?? 300, o.y ?? (ground ? FLOOR : AIR), 1, load.cls);
  s.ground = ground ? 1 : 0;
  s.rollCd = 0;
  s.jumps = 0;
  const x0 = s.x;
  const y0 = s.y;
  stepFighter(s, cmd(1, o.press ?? {}, Btn.Roll), arena, load, o.foe);
  let invulRun = s.invuln > 0 ? 1 : 0;
  let stillInvul = invulRun === 1;
  let invulAll = true;
  let peakUp = 0;
  let endT = -1;
  let cdAtEnd = -1;
  let endX = NaN;
  let endY = NaN;
  for (let t = 2; t <= (o.cap ?? 90); t++) {
    stepFighter(s, cmd(t, o.hold ?? {}), arena, load, o.foe);
    if (s.act === Act.Roll) {
      if (s.invuln <= 0) invulAll = false;
      peakUp = Math.max(peakUp, y0 - s.y);
    }
    if (stillInvul && s.invuln > 0) invulRun++;
    else stillInvul = false;
    if (endT < 0 && s.act !== Act.Roll) {
      endT = t;
      cdAtEnd = s.rollCd;
      endX = s.x;
      endY = s.y;
    }
  }
  if (endT < 0) {
    endX = s.x;
    endY = s.y;
  }
  return { s, endT, cdAtEnd, x0, y0, endX, endY, invulRun, invulAll, peakUp };
}

const heroesOf = (kind: string) => HEROES.filter((h) => DODGES[h.id].kind === kind);
/** `v` is within [lo, hi] times `target`: a step or dash may overshoot its table value a little. */
const about = (v: number, target: number, lo = 0.85, hi = 1.3) => v >= lo * target && v <= hi * target;

/**
 * KNOWN BUG (fighter.ts, the step case): `vx = dist / (ticks * DT)` is applied on the press tick too, and the speed decays
 * only after `ticks`, so a step travels (ticks + 1 + 0.5) / ticks of its distance. Measured: Mirage (3 ticks, 150) goes
 * ~226, Flash Step (4 ticks, 150) ~207. Steps whose table predicts more than 25% over are marked `it.fails` (the tolerance below is 30%).
 */
const stepOvershoots = (id: number) => {
  const D = DODGES[id];
  return (D.ticks + 1.5) / D.ticks > 1.25;
};
const stepIt = (_id: number) => it;

describe('dodges: the table', () => {
  it('there is one dodge per hero, read through dodgeOf', () => {
    expect(DODGES).toHaveLength(HERO_COUNT);
    for (const h of HEROES) expect(dodgeOf({ hero: h.id })).toBe(DODGES[h.id]);
  });

  it("the cancelable dodges are the Assassins' Flash Steps, and only they are Flash Steps", () => {
    for (const h of HEROES) {
      const isAssassin = h.cls === 4;
      expect(isFlashStepper(sanitizeLoadout({ hero: h.id })), h.name).toBe(isAssassin);
      expect(!!DODGES[h.id].cancel, h.name).toBe(isAssassin);
    }
    for (const id of [7, 8]) expect(DODGES[id]).toMatchObject({ kind: 'step', behind: true, cancel: true });
  });

  it('every dodge has a known kind, a length and an invulnerability window', () => {
    for (const d of DODGES) {
      expect(['step', 'dash', 'leap', 'phase']).toContain(d.kind);
      expect(d.ticks).toBeGreaterThan(0);
      expect(d.invuln).toBeGreaterThan(0);
    }
  });
});

describe('dodges: step (a near-instant step along the stick)', () => {
  const stepHeroes = heroesOf('step');

  for (const h of stepHeroes) {
    const dist = DODGES[h.id].dist ?? 0;
    stepIt(h.id)(`${h.name}: in the air, steps about its distance left and right along the stick`, () => {
      const right = runDodge(h.id, { ground: false, press: { x: 1 } });
      const left = runDodge(h.id, { ground: false, press: { x: -1 } });
      expect(about(right.endX - right.x0, dist), `right ${right.endX - right.x0}`).toBe(true);
      expect(about(left.x0 - left.endX, dist), `left ${left.x0 - left.endX}`).toBe(true);
    });

    stepIt(h.id)(`${h.name}: with no stick, steps forward, the way it faces`, () => {
      const r = runDodge(h.id, { ground: false });
      expect(about(r.endX - r.x0, dist)).toBe(true);
      expect(r.s.face).toBe(1);
    });
  }

  // KNOWN BUG (fighter.ts, Free-state default branch, `if (s.act === Act.Roll && s.rollAir) { gravity = false; s.vy = 0; }`):
  // the press tick zeroes the vertical velocity of every air-flagged dodge, so a step up or down the stick never happens.
  for (const h of stepHeroes.filter((x) => !DODGES[x.id].horizontal)) {
    it(`${h.name}: in the air, steps up and down the stick `, () => {
      const dist = DODGES[h.id].dist ?? 0;
      const up = runDodge(h.id, { ground: false, press: { y: -1 } });
      expect(up.y0 - up.endY, 'up').toBeGreaterThan(0.85 * dist);
      const down = runDodge(h.id, { ground: false, press: { y: 1 } });
      expect(down.endY - down.y0, 'down').toBeGreaterThan(0.85 * dist);
    });
  }

  const horizontalHero = HEROES.find((x) => DODGES[x.id].horizontal)!;
  it('a horizontal step (Turn of the Page) ignores the vertical stick', () => {
    for (const press of [{ y: -1 }, { y: 1 }, { x: 1, y: -1 }]) {
      const r = runDodge(horizontalHero.id, { ground: false, press });
      expect(Math.abs(r.endY - r.y0), JSON.stringify(press)).toBeLessThan(1);
    }
  });

  stepIt(horizontalHero.id)('a horizontal step (Turn of the Page) moves about its distance along x', () => {
    const r = runDodge(horizontalHero.id, { ground: false, press: { x: 1 } });
    expect(about(r.endX - r.x0, DODGES[horizontalHero.id].dist ?? 0)).toBe(true);
  });

  // KNOWN BUG (fighter.ts, end of stepFighter: `if (s.ground) { ... if (s.rollAir && s.act === Act.Roll && s.actT > 2) ...`):
  // a grounded dodge keeps rollAir = 2, so it is cut after 3 ticks on the ground (it should last ticks + FLASH.settle), and
  // the cooldown is never set.
  for (const h of stepHeroes) {
    it(`${h.name}: on the ground, the step lasts its ticks and settle `, () => {
      const r = runDodge(h.id, { ground: true, press: { x: 1 } });
      expect(r.endT).toBeGreaterThanOrEqual(DODGES[h.id].ticks + FLASH.settle);
    });
  }
});

describe('dodges: behind the opponent', () => {
  // The behind dodges (the two Flash Steps and Shadow Sink): with no stick and the opponent close, the hero lands behind them.
  const behindHeroes = heroesOf('step').filter((h) => DODGES[h.id].behind);
  const foeAt = (x: number): FoeView => ({ x, y: AIR, face: 1 });

  for (const h of behindHeroes) {
    // KNOWN OVERSHOOT (see stepOvershoots): the Hashashin's step is short enough that it lands in front of the opponent
    // (measured: opponent at 600, lands at ~606).
    const check = it;
    check(`${h.name}: with no stick, lands behind the opponent, facing them`, () => {
      const foe = foeAt(600);
      const r = runDodge(h.id, { ground: false, x: 500, y: AIR, foe });
      const tx = foe.x - foe.face * 30;
      expect(r.endX, 'behind').toBeLessThan(foe.x);
      expect(Math.abs(r.endX - tx), `near ${tx}`).toBeLessThan(40);
      expect(r.s.face).toBe(1);
    });
  }

  for (const h of behindHeroes) {
    stepIt(h.id)(`${h.name}: with the opponent out of range, it is a plain step`, () => {
      const foe = foeAt(1100);
      const r = runDodge(h.id, { ground: false, x: 300, y: AIR, foe });
      expect(about(r.endX - r.x0, DODGES[h.id].dist ?? 0)).toBe(true);
    });
  }
});

describe('dodges: dash (a burst along the ground)', () => {
  for (const h of heroesOf('dash')) {
    const D = DODGES[h.id];
    const expected = ((D.vx ?? 0) * D.ticks) / 60;

    it(`${h.name}: in the air, the burst carries the hero about its speed for its ticks`, () => {
      const r = runDodge(h.id, { ground: false, press: { x: 1 } });
      const moved = r.endX - r.x0;
      expect(moved, 'moved').toBeGreaterThan(0.6 * expected);
      expect(moved, 'moved').toBeLessThan(1.6 * expected);
      expect(r.s.face).toBe(1);
    });

    // KNOWN BUG: the same cut as the grounded step (fighter.ts ~789): it lasts 3-4 ticks on the ground, not its length.
    it(`${h.name}: on the ground, the burst lasts its length `, () => {
      const r = runDodge(h.id, { ground: true, press: { x: 1 } });
      expect(r.endT).toBeGreaterThanOrEqual(D.ticks);
    });
  }
});

describe('dodges: leap (a jump-dodge)', () => {
  for (const h of heroesOf('leap')) {
    if (!DODGES[h.id].back) continue;
    it(`${h.name}: a back-vault with no stick goes away from the opponent`, () => {
      const r = runDodge(h.id, { ground: false });
      expect(r.x0 - r.endX, 'away').toBeGreaterThan(20);
    });
  }

  for (const h of heroesOf('leap')) {
    // KNOWN BUG (fighter.ts, the same press-tick zeroing of vy as the steps): the launch is lost, so a grounded leap never
    // leaves the ground.
    it(`${h.name}: on the ground, the leap leaves the ground and comes back down `, () => {
      const r = runDodge(h.id, { ground: true, press: { x: 1 } });
      expect(r.peakUp, 'height').toBeGreaterThan(20);
      expect(r.s.ground).toBe(1);
    });
  }
});

describe('dodges: phase (untouchable, drifting with the stick)', () => {
  for (const h of heroesOf('phase')) {
    const D = DODGES[h.id];
    it(`${h.name}: in the air, untouchable for its whole length and drifting with the stick`, () => {
      const right = runDodge(h.id, { ground: false, press: { x: 1 }, hold: { x: 1 }, cap: D.ticks + 2 });
      expect(right.invulAll, 'invulnerable throughout').toBe(true);
      // drift: the stick speed is the phase speed (ramping up); at least a quarter of the full run
      expect(right.endX - right.x0, 'drift right').toBeGreaterThan(0.25 * (D.vx ?? 0) * (D.ticks / 60));
      const left = runDodge(h.id, { ground: false, press: { x: -1 }, hold: { x: -1 }, cap: D.ticks + 2 });
      expect(left.endX - left.x0, 'drift left').toBeLessThan(0);
    });

    // KNOWN BUG: the same cut as the grounded step (fighter.ts ~789).
    it(`${h.name}: on the ground, the phase lasts its whole length `, () => {
      const r = runDodge(h.id, { ground: true, press: { x: 1 }, hold: { x: 1 }, cap: D.ticks + 2 });
      expect(r.endT).toBeGreaterThan(D.ticks);
    });
  }
});

describe('dodges: invulnerability window', () => {
  for (const h of HEROES) {
    const D = DODGES[h.id];
    it(`${h.name}: invulnerable from the press for its window (${D.invuln} ticks)`, () => {
      const r = runDodge(h.id, { ground: false, press: { x: 1 } });
      if (D.kind === 'phase') {
        // (the phase keeps itself invulnerable for its whole length, which is at least the window)
        expect(r.invulRun).toBeGreaterThanOrEqual(D.invuln);
      } else {
        expect(r.invulRun).toBe(D.invuln);
      }
    });
  }
});

describe('dodges: ground cooldown and air charges', () => {
  // KNOWN BUG (the same cut as above): a grounded dodge that is cut short never sets rollCd, so the next dodge is accepted at once.
  for (const h of HEROES) {
    // (the class's roll cooldown, with the hero's tune: heroes.ts HERO_TUNE)
    const C = heroClass({ cls: h.cls, hero: h.id });
    it(`${h.name}: after a grounded dodge the cooldown is set `, () => {
      const r = runDodge(h.id, { ground: true, press: { x: 1 } });
      expect(r.endT).toBeGreaterThan(0);
      // (read as the dodge ends: the cooldown counts down from then on)
      expect(Math.abs(r.cdAtEnd - Math.round(FIGHTER.rollCooldown * C.rollCd))).toBeLessThanOrEqual(1);
    });
  }

  it('the cooldown gate: a dodge is refused while rollCd runs', () => {
    const load = sanitizeLoadout({ hero: 0 });
    const s = newFighterState(300, FLOOR, 1, load.cls);
    s.rollCd = FIGHTER.rollCooldown * 4;
    stepFighter(s, cmd(1, { x: 1 }, Btn.Roll), arena, load);
    expect(s.act).not.toBe(Act.Roll);
  });

  for (const h of HEROES) {
    it(`${h.name}: in one airtime, air use is limited to its ${classOf(h.cls).dashes} air dash charges`, () => {
      const C = classOf(h.cls);
      const load = sanitizeLoadout({ hero: h.id });
      const s = newFighterState(300, AIR, 1, load.cls);
      s.ground = 0;
      s.jumps = 0;
      let accepted = 0;
      for (let k = 0; k < C.dashes + 3; k++) {
        // keep the fighter in the air between presses, and let each dodge finish
        s.y = AIR;
        s.vy = 0;
        s.ground = 0;
        s.rollCd = 0;
        s.act = Act.Free;
        stepFighter(s, cmd(100 + k * 60, { x: 1 }, Btn.Roll), arena, load);
        if (s.act === Act.Roll) accepted++;
        for (let i = 0; i < 45 && s.act === Act.Roll; i++) {
          s.y = Math.min(s.y, AIR);
          stepFighter(s, cmd(101 + k * 60 + i), arena, load);
        }
      }
      expect(accepted).toBe(C.dashes);
    });
  }
});

describe('dodges: out of an attack', () => {
  // Only the Assassins' Flash Steps can be taken out of a swing, at any point. Every other dodge waits for the attack's
  // recovery. Heroes whose slot A is a charged weapon (bow, lance, staff: a charge, not a swing) or a block (shield) are not
  // checked here.
  const swingHeroes = HEROES.filter((h) => {
    const w = WEAPONS[sanitizeLoadout({ hero: h.id }).weapons[0]];
    return !w.charged && !w.block;
  });
  for (const h of swingHeroes) {
    it(`${h.name}: a dodge pressed in the startup ${DODGES[h.id].cancel ? 'cancels the swing' : 'waits for the recovery'}`, () => {
      const load = sanitizeLoadout({ hero: h.id });
      const s = newFighterState(300, FLOOR, 1, load.cls);
      s.rollCd = 0;
      stepFighter(s, cmd(1, {}, Btn.A), arena, load);
      expect(s.act).toBe(Act.Attack);
      stepFighter(s, cmd(2), arena, load);
      stepFighter(s, cmd(3, { x: 1 }, Btn.Roll), arena, load);
      expect(s.act).toBe(DODGES[h.id].cancel ? Act.Roll : Act.Attack);
    });
  }
});
