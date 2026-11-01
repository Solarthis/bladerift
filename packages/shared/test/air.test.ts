// The air string: light presses in the air chain two quick swings and a finisher; the first swings of an airtime check
// the fall, a fighter juggled by one floats down with it, and the finisher knocks them down.
import { describe, expect, it } from 'vitest';
import {
  Act, airString, Btn, FIGHTER, getArena, InputCmd, isAirMove, Loadout, MOVE_AIR, MOVE_AIR2, MOVE_AIR3, MOVE_LAUNCH, moveOf, newFighterState, sanitizeLoadout,
  ROUND, SkillId, stepFighter, WEAPONS, World,
} from '../src/index';

const c = (buttons = 0, moveX = 0): InputCmd => ({ seq: 0, moveX, moveY: 0, buttons, viewTick: 0 });
const arena = getArena(0);

function fighter(hero: number) {
  const load: Loadout = sanitizeLoadout({ hero, skill: SkillId.LionsRoar });
  const s = newFighterState(400, arena.floor, 1, load.cls);
  return { s, load, step: (cmd: InputCmd) => stepFighter(s, cmd, arena, load) };
}

/** High in the air (a double jump off a ledge, say), starting to fall. */
function airborne(f: ReturnType<typeof fighter>) {
  f.s.y = arena.floor - 260;
  f.s.ground = 0;
  f.s.vy = 10;
  f.step(c());
  expect(f.s.ground).toBe(0);
}

/** Press A once and play the swing out up to its chain point. */
function swing(f: ReturnType<typeof fighter>) {
  const seq = f.s.moveSeq;
  f.step(c(Btn.A));
  for (let i = 0; i < 12 && f.s.moveSeq === seq; i++) f.step(c());
  const move = f.s.move;
  const m = moveOf(f.load.weapons[0], move)!;
  for (let i = 0; i < m.startup + m.active + 2 && f.s.act === Act.Attack && !f.s.ground; i++) f.step(c());
  return move;
}

describe('air string', () => {
  it('chains MOVE_AIR, MOVE_AIR2, MOVE_AIR3 on repeated presses while falling, then starts over', () => {
    const f = fighter(0);
    airborne(f);
    expect(swing(f)).toBe(MOVE_AIR);
    expect(swing(f)).toBe(MOVE_AIR2);
    expect(swing(f)).toBe(MOVE_AIR3);
    expect(f.s.ground).toBe(0);
    expect(f.s.air).toBe(3);
  });

  it('the swings hold the fall to airFloat, and landing resets the count', () => {
    const f = fighter(0);
    airborne(f);
    for (let i = 0; i < 30 && f.s.vy <= FIGHTER.airFloat * 1.5; i++) f.step(c());
    expect(f.s.vy).toBeGreaterThan(FIGHTER.airFloat);
    expect(f.s.ground).toBe(0);
    f.step(c(Btn.A));
    for (let i = 0; i < 6; i++) {
      f.step(c());
      expect(f.s.vy).toBeLessThanOrEqual(FIGHTER.airFloat);
    }
    for (let i = 0; i < 400 && !f.s.ground; i++) f.step(c());
    expect(f.s.ground).toBe(1);
    expect(f.s.air).toBe(0);
    expect(isAirMove(f.s.move) ? f.s.act : Act.Free).not.toBe(Act.Attack);
  });

  it('every weapon builds a string: the finisher is stronger and knocks down', () => {
    for (const w of WEAPONS) {
      if (!w) continue;
      const [a1, a2, a3] = airString(w.id);
      expect(a1.kbY).toBeGreaterThanOrEqual(170);
      expect(a2.startup).toBeLessThanOrEqual(a1.startup);
      expect(a3.dmg).toBeGreaterThan(a1.dmg);
      expect(a3.kbY).toBeGreaterThanOrEqual(FIGHTER.knockdownKbY);
    }
  });

  it('in a duel, a juggled fighter floats while the string runs and the finisher lays them down', () => {
    const w = new World({ arenaId: 'bridge', wins: 2, roundTime: 90 });
    const load = sanitizeLoadout({ hero: 0, skill: SkillId.LionsRoar });
    const fa = w.addFighter(1, 0, 'A', load);
    const fb = w.addFighter(2, 1, 'B', load);
    w.start();
    for (let i = 0; i < ROUND.introTicks + 1; i++) w.step();
    const floor = w.arena.floor;
    Object.assign(fa.s, { x: 600, y: floor - 160, ground: 0, vy: 0, face: 1 });
    Object.assign(fb.s, { x: 640, y: floor - 160, ground: 0, vy: 0, face: -1 });
    let floated = false;
    let finisher = false;
    let downed = false;
    for (let i = 0; i < 160; i++) {
      // A mashes the light button (a press every other tick); B does nothing
      fa.inputs.push({ seq: fa.lastSeq + 1, moveX: 0, moveY: 0, buttons: i % 2 ? 0 : Btn.A, viewTick: 0 });
      fb.inputs.push({ seq: fb.lastSeq + 1, moveX: 0, moveY: 0, buttons: 0, viewTick: 0 });
      w.step();
      if (fb.s.act === Act.Stun && fb.s.float > 0 && !fb.s.ground) {
        floated = true;
        expect(fb.s.vy).toBeLessThanOrEqual(FIGHTER.airFloat);
      }
      if (fa.s.act === Act.Attack && fa.s.move === MOVE_AIR3) finisher = true;
      if (fb.s.act === Act.Down) downed = true;
    }
    expect(floated).toBe(true);
    expect(finisher).toBe(true);
    expect(downed).toBe(true);
  });

  it('down + light on the ground launches: the foe floats up without a knockdown, a jump chases, the air string lays them down', () => {
    const w = new World({ arenaId: 'bridge', wins: 2, roundTime: 90 });
    const load = sanitizeLoadout({ hero: 0, skill: SkillId.LionsRoar });
    const fa = w.addFighter(1, 0, 'A', load);
    const fb = w.addFighter(2, 1, 'B', load);
    w.start();
    for (let i = 0; i < ROUND.introTicks + 1; i++) w.step();
    Object.assign(fa.s, { x: 600, face: 1 });
    Object.assign(fb.s, { x: 645, face: -1 });
    const push = (buttons: number, moveY = 0) => {
      fa.inputs.push({ seq: fa.lastSeq + 1, moveX: 0, moveY, buttons, viewTick: 0 });
      fb.inputs.push({ seq: fb.lastSeq + 1, moveX: 0, moveY: 0, buttons: 0, viewTick: 0 });
      w.step();
    };
    push(Btn.A, 1);
    expect(fa.s.move).toBe(MOVE_LAUNCH);
    let popped = false;
    for (let i = 0; i < 30 && !popped; i++) {
      push(0, 1);
      if (fb.s.act === Act.Stun && !fb.s.ground) popped = true;
    }
    expect(popped).toBe(true);
    expect(fb.s.fall).toBe(0);
    // chase: press jump (the hit lets the launcher be cancelled into it), then mash light in the air
    // (a tap: the chase is a full jump all the same)
    for (let i = 0; i < 20 && fa.s.ground; i++) push(i % 2 ? 0 : Btn.Jump);
    expect(fa.s.ground).toBe(0);
    expect(fa.s.vy).toBeLessThan(-400);
    let airHit = false;
    let downed = false;
    const hp0 = fb.s.hp;
    for (let i = 0; i < 200; i++) {
      push(i % 2 ? 0 : Btn.A);
      if (!fb.s.ground && fb.s.act === Act.Stun && isAirMove(fa.s.move) && fb.s.hp < hp0) airHit = true;
      if (fb.s.act === Act.Down) {
        downed = true;
        break;
      }
    }
    expect(airHit).toBe(true);
    expect(downed).toBe(true);
  });
});
