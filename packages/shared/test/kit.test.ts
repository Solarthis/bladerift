// The kit: every hero fights with one signature weapon. A is the light combo, B the heavy attack on the ground and the
// plunge in the air (the sprite roster draws each hero with its own weapon only).
import { describe, expect, it } from 'vitest';
import { ROUND, World } from '../src/index';
import { Act, Btn, CRESCENT, FIGHTER, getArena, heavyOf, InputCmd, Loadout, MOVE_CHARGED, MOVE_CRESCENT, MOVE_PLUNGE, moveOf, newFighterState, sanitizeLoadout, SkillId, stepFighter, SUN_CRESCENT, WEAPONS, WeaponId } from '../src/index';

const c = (buttons = 0, moveX = 0): InputCmd => ({ seq: 0, moveX, moveY: 0, buttons, viewTick: 0 });
const arena = getArena(0);

function fighter(hero: number) {
  const load: Loadout = sanitizeLoadout({ hero, skill: SkillId.LionsRoar });
  const s = newFighterState(400, arena.floor, 1, load.cls);
  return { s, load, step: (cmd: InputCmd) => stepFighter(s, cmd, arena, load) };
}

describe('kit: A light, B heavy', () => {
  it('B on the ground is the heavy attack: the combo finisher, slower, stronger and guard-breaking', () => {
    const { s, step } = fighter(11); // Alexander: the kopis (a sword)
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

describe('Gilgamesh: the Gate of Treasures', () => {
  const cmd = (moveX = 0, buttons = 0): InputCmd => ({ seq: 0, moveX, moveY: 0, buttons, viewTick: 0 });
  function duel() {
    const w = new World({ arenaId: 'bridge', wins: 2, roundTime: 90 });
    const g = w.addFighter(1, 0, 'G', sanitizeLoadout({ hero: 2 }));
    const o = w.addFighter(2, 1, 'O', sanitizeLoadout({ hero: 0 }));
    w.start();
    for (let i = 0; i < ROUND.introTicks + 1; i++) w.step();
    g.s.x = 400;
    o.s.x = 900;
    g.s.face = 1;
    o.s.face = -1;
    const run = (n: number, a: (i: number) => InputCmd) => {
      for (let i = 0; i < n; i++) {
        g.inputs.push({ ...a(i), seq: g.lastSeq + 1 });
        o.inputs.push({ ...cmd(), seq: o.lastSeq + 1 });
        w.step();
      }
    };
    const blades = () => w.projectiles.filter((p) => p.owner === 1 && p.kind === 'relic');
    return { w, g, run, blades };
  }

  it('fights with the Gate, not a bow', () => {
    expect(sanitizeLoadout({ hero: 2 }).weapons).toEqual([WeaponId.Gate, WeaponId.Gate]);
    expect(WEAPONS[WeaponId.Gate].combo.every((m) => m.gate)).toBe(true);
  });

  it('a light attack opens one portal behind him and fires a blade at the opponent', () => {
    const { run, blades } = duel();
    run(30, (i) => cmd(0, i === 0 ? Btn.A : 0));
    const b = blades();
    expect(b.length).toBe(1);
    expect(b[0].vx).toBeGreaterThan(0);
  });

  it('holding B opens more gates: a full hold fires nine blades', () => {
    const { run, blades, g } = duel();
    const max = WEAPONS[WeaponId.Gate].charged!.max!;
    let most = 0;
    run(max + 50, (i) => {
      most = Math.max(most, blades().length);
      return cmd(0, i < max + 4 ? Btn.B : 0);
    });
    expect(most).toBe(9);
    expect(g.s.act).not.toBe(Act.Attack);
  });

  it("Richard's B is the Sun Crescent: a golden slash that flies to mid range, then the plain cleave while it recharges", () => {
    const w = new World({ arenaId: 'bridge', wins: 2, roundTime: 90 });
    const fa = w.addFighter(1, 0, 'A', sanitizeLoadout({ hero: 0 }));
    const fb = w.addFighter(2, 1, 'B', sanitizeLoadout({ hero: 11 }));
    w.start();
    for (let i = 0; i < ROUND.introTicks + 1; i++) w.step();
    fa.s.x = 400;
    fb.s.x = 650; // out of sword reach, inside the crescent's
    fa.s.face = 1;
    fb.s.face = -1;
    let seq = 1;
    const tick = (btn = 0) => {
      fa.inputs.push({ seq: seq++, moveX: 0, moveY: 0, buttons: btn, viewTick: w.tick });
      w.step();
      const ev = [...w.events];
      w.events.length = 0;
      return ev;
    };
    tick(Btn.B);
    expect(fa.s.move).toBe(MOVE_CRESCENT);
    const hp0 = fb.s.hp;
    let shot = false;
    let flew = 0;
    for (let i = 0; i < 60; i++) {
      const ev = tick();
      if (ev.some((e) => e.t === 'shoot' && e.p === 1)) shot = true;
      if (w.projectiles.some((p) => p.owner === 1 && p.kind === 'wave')) flew++;
    }
    expect(shot).toBe(true);
    expect(flew).toBeGreaterThan(5);
    expect(fb.s.hp).toBeLessThan(hp0);
    // recharging: B is the guard-breaking cleave
    expect(fa.s.reload).toBe(1);
    for (let i = 0; i < 30; i++) tick();
    tick(Btn.B);
    for (let i = 0; i < 3 && fa.s.act !== Act.Attack; i++) tick();
    expect(fa.s.move).toBe(MOVE_CHARGED);
    // about two seconds after the throw it is ready again
    for (let i = 0; i < FIGHTER.crescentHeat; i++) tick();
    expect(fa.s.reload).toBe(0);
    tick(Btn.B);
    for (let i = 0; i < 3 && fa.s.act !== Act.Attack; i++) tick();
    expect(fa.s.move).toBe(MOVE_CRESCENT);
  });

  it('the crescent is a mid-range shot: it fades before it crosses the arena', () => {
    const range = (CRESCENT.speed * CRESCENT.life) / 60;
    expect(range).toBeGreaterThan(250);
    expect(range).toBeLessThan(450);
    expect(moveOf(WeaponId.Sword, MOVE_CRESCENT)).toBe(SUN_CRESCENT);
  });
});
