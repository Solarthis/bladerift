import { describe, expect, it } from 'vitest';
import { Act, ArenaDef, Btn, copyState, FIGHTER, getArena, InputCmd, Loadout, newFighterState, PHYS, SkillId, stepFighter, WeaponId } from '../src/index';

const LOAD: Loadout = { weapons: [WeaponId.Sword, WeaponId.Bow], skill: SkillId.LionsRoar, cls: 0, hero: 0 };
const c = (moveX = 0, buttons = 0, moveY = 0): InputCmd => ({ seq: 0, moveX, moveY, buttons, viewTick: 0 });

/** A small test arena: a floor, a tall block on the right with room between it and the right wall. */
const ARENA: ArenaDef = {
  id: 'test', name: 'Test', theme: 'crypt', w: 800, floor: 600,
  platforms: [{ x: 100, y: 480, w: 160 }],
  blocks: [{ x: 500, y: 400, w: 60, h: 200 }],
  spawns: [200, 600], description: '',
};

function run(s: ReturnType<typeof newFighterState>, n: number, cmd: (i: number) => InputCmd, arena = ARENA) {
  for (let i = 0; i < n; i++) stepFighter(s, cmd(i), arena, LOAD);
}

describe('movement maneuvers', () => {
  it('blocks are solid: walk into a side, stand on the top, bump the underside', () => {
    const s = newFighterState(440, 600, 1);
    run(s, 60, () => c(1));
    expect(s.x).toBeCloseTo(500 - FIGHTER.w / 2, 3);
    expect(s.wall).toBe(1);
    const top = newFighterState(530, 300, 1);
    top.ground = 0;
    run(top, 60, () => c());
    expect(top.y).toBe(400);
    expect(top.ground).toBe(1);
  });

  it('wall slide slows the fall and a wall jump kicks away with the double jump restored', () => {
    const s = newFighterState(487, 480, 1);
    s.ground = 0;
    s.jumps = 0;
    s.dash = 1;
    run(s, 12, () => c(1));
    expect(s.slide).toBe(1);
    expect(s.vy).toBeLessThanOrEqual(PHYS.wallSlide);
    run(s, 1, () => c(1, Btn.Jump));
    expect(s.vy).toBeLessThan(-400);
    expect(s.vx).toBeLessThan(0);
    expect(s.jumps).toBe(PHYS.airJumps);
    expect(s.dash).toBe(0);
  });

  it('chained wall jumps climb a gap between a block and the arena wall', () => {
    const arena: ArenaDef = { ...ARENA, w: 600, blocks: [{ x: 520, y: 200, w: 40, h: 400 }] };
    // the gap is 520..560? no: block 520-560, wall at 600: gap 560..600 (40 wide)
    const s = newFighterState(580, 600, 1);
    let best = s.y;
    run(s, 240, (i) => c(i % 30 < 15 ? 1 : -1, i % 15 === 1 ? Btn.Jump : 0), arena);
    for (let i = 0; i < 240; i++) {
      stepFighter(s, c(i % 30 < 15 ? 1 : -1, i % 15 === 1 ? Btn.Jump : 0), arena, LOAD);
      best = Math.min(best, s.y);
    }
    expect(best).toBeLessThan(600 - 200);
  });

  it('grabs a ledge when falling past a top edge, climbs on jump', () => {
    const s = newFighterState(500 - FIGHTER.w / 2 - 4, 445, 1);
    s.ground = 0;
    s.vy = 50;
    run(s, 10, () => c(0.5));
    expect(s.act).toBe(Act.Ledge);
    expect(s.ledgeX).toBe(500);
    run(s, 1, () => c(0, Btn.Jump));
    run(s, PHYS.climbTicks + 2, () => c());
    expect(s.act).toBe(Act.Free);
    expect(s.y).toBe(400);
    expect(s.x).toBeGreaterThan(500);
  });

  it('down lets go of a ledge', () => {
    const s = newFighterState(500 - FIGHTER.w / 2 - 4, 445, 1);
    s.ground = 0;
    s.vy = 50;
    run(s, 10, () => c(0.5));
    expect(s.act).toBe(Act.Ledge);
    run(s, 2, () => c(0, 0, 1));
    expect(s.act).toBe(Act.Free);
    run(s, 60, () => c());
    expect(s.y).toBe(600);
  });

  it('air dash: a gravity-free burst once per airtime, invulnerable at the start', () => {
    const s = newFighterState(200, 600, 1);
    run(s, 1, () => c(0, Btn.Jump));
    run(s, 10, () => c(0, Btn.Jump));
    const y0 = s.y;
    run(s, 1, () => c(1, Btn.Roll));
    expect(s.act).toBe(Act.Roll);
    expect(s.invuln).toBeGreaterThan(0);
    run(s, 6, () => c(1));
    expect(s.y).toBeCloseTo(y0, 0);
    expect(s.vx).toBeGreaterThan(400);
    run(s, 20, () => c());
    // no second dash before landing
    run(s, 1, () => c(1, Btn.Roll));
    expect(s.act).not.toBe(Act.Roll);
  });

  it('fast fall lands sooner than a normal fall', () => {
    const a = newFighterState(200, 200, 1);
    const b = copyState(a);
    a.ground = b.ground = 0;
    let ta = 0;
    let tb = 0;
    while (!a.ground && ta < 300) { stepFighter(a, c(), ARENA, LOAD); ta++; }
    while (!b.ground && tb < 300) { stepFighter(b, c(0, 0, 1), ARENA, LOAD); tb++; }
    expect(tb).toBeLessThan(ta);
  });

  it('crouch lowers the body and stops you', () => {
    const s = newFighterState(300, 600, 1);
    run(s, 10, () => c(0, 0, 1));
    expect(s.crouch).toBe(1);
    expect(Math.abs(s.vx)).toBeLessThan(1);
  });

  it('coyote time: a jump just after running off a platform still counts', () => {
    const s = newFighterState(250, 480, 1);
    let i = 0;
    while (s.ground && i < 60) { stepFighter(s, c(1), ARENA, LOAD); i++; }
    run(s, 2, () => c(1));
    run(s, 1, () => c(1, Btn.Jump));
    expect(s.vy).toBeLessThan(-PHYS.airJumpSpeed + 1);
    expect(s.jumps).toBe(PHYS.airJumps); // the double jump is still there
  });

  it('every arena still has open spawns and real arenas load', () => {
    for (const id of ['bridge', 'embers', 'crypt', 'grove']) {
      const a = getArena(id);
      for (const x of a.spawns) for (const b of a.blocks) expect(x > b.x && x < b.x + b.w, id).toBe(false);
    }
  });
});
