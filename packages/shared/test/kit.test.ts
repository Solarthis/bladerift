// The kit: every hero fights with one signature weapon. A is the light combo, B the heavy attack on the ground and the
// plunge in the air (the sprite roster draws each hero with its own weapon only).
import { describe, expect, it } from 'vitest';
import { Act, Btn, getArena, heavyOf, InputCmd, Loadout, MOVE_CHARGED, MOVE_PLUNGE, moveOf, newFighterState, sanitizeLoadout, SkillId, stepFighter, WEAPONS, WeaponId } from '../src/index';

const c = (buttons = 0, moveX = 0): InputCmd => ({ seq: 0, moveX, moveY: 0, buttons, viewTick: 0 });
const arena = getArena(0);

function fighter(hero: number) {
  const load: Loadout = sanitizeLoadout({ hero, skill: SkillId.LionsRoar });
  const s = newFighterState(400, arena.floor, 1, load.cls);
  return { s, load, step: (cmd: InputCmd) => stepFighter(s, cmd, arena, load) };
}

describe('kit: A light, B heavy', () => {
  it('B on the ground is the heavy attack: the combo finisher, slower, stronger and guard-breaking', () => {
    const { s, step } = fighter(0); // Leon: sword
    step(c(Btn.B));
    for (let i = 0; i < 3 && s.act !== Act.Attack; i++) step(c());
    expect(s.act).toBe(Act.Attack);
    expect(s.move).toBe(MOVE_CHARGED);
    const fin = WEAPONS[WeaponId.Sword].combo.at(-1)!;
    const h = heavyOf(WeaponId.Sword)!;
    expect(moveOf(WeaponId.Sword, MOVE_CHARGED)).toBe(h);
    expect(h.dmg).toBeGreaterThan(fin.dmg);
    expect(h.startup).toBeGreaterThan(fin.startup);
    expect(h.breaksGuard).toBe(true);
  });

  it('B in the air is the plunge', () => {
    const { s, step } = fighter(0);
    step(c(Btn.Jump));
    for (let i = 0; i < 8; i++) step(c());
    expect(s.ground).toBe(0);
    step(c(Btn.B));
    for (let i = 0; i < 3 && s.act !== Act.Attack; i++) step(c());
    expect(s.move).toBe(MOVE_PLUNGE);
  });

  it('a charged weapon charges its power shot on B: held it fires the charged move, a tap the light shot', () => {
    const { s, step } = fighter(1); // Kharon: bow
    step(c(Btn.B));
    expect(s.act).toBe(Act.Charge);
    for (let i = 0; i < 40; i++) step(c(Btn.B));
    step(c());
    expect(s.act).toBe(Act.Attack);
    expect(s.move).toBe(MOVE_CHARGED);
  });

  it('the shield fighter blocks on A and bashes on B', () => {
    const { s, step } = fighter(13); // Aegis: shield
    step(c(Btn.A));
    expect(s.act).toBe(Act.Block);
    step(c());
    for (let i = 0; i < 40; i++) step(c());
    step(c(Btn.B));
    for (let i = 0; i < 3 && s.act !== Act.Attack; i++) step(c());
    expect(s.act).toBe(Act.Attack);
    expect(s.move).toBe(MOVE_CHARGED);
  });
});
