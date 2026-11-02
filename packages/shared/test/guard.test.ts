// The guard every hero has (hold down on the ground, or hold BLOCK), the perfect block (BLOCK pressed just before the
// hit: a parry) and the swing that cuts projectiles out of the air. parry.test.ts covers the perfect block in depth.
import { describe, expect, it } from 'vitest';
import { Act, Btn, InputCmd, PARRY, ROUND, sanitizeLoadout, World } from '../src/index';

const cmd = (moveX = 0, moveY = 0, buttons = 0): InputCmd => ({ seq: 0, moveX, moveY, buttons, viewTick: 0 });

/** Lionheart (A) and a second hero (B), `gap` apart, facing each other. */
function duel(b: number, gap: number) {
  const w = new World({ arenaId: 'bridge', wins: 2, roundTime: 90 });
  const fa = w.addFighter(1, 0, 'A', sanitizeLoadout({ hero: 0 }));
  const fb = w.addFighter(2, 1, 'B', sanitizeLoadout({ hero: b }));
  w.start();
  for (let i = 0; i < ROUND.introTicks + 1; i++) w.step();
  fa.s.x = 600;
  fb.s.x = 600 + gap;
  fa.s.face = 1;
  fb.s.face = -1;
  const run = (n: number, ca: (i: number) => InputCmd, cb: (i: number) => InputCmd = () => cmd()) => {
    for (let i = 0; i < n; i++) {
      fa.inputs.push({ ...ca(i), seq: fa.lastSeq + 1 });
      fb.inputs.push({ ...cb(i), seq: fb.lastSeq + 1 });
      w.step();
    }
  };
  return { w, fa, fb, run };
}

describe('guard and parry', () => {
  it('holding down guards: a staff bolt from the front only chips', () => {
    const { fa, run } = duel(6, 320);
    const hp0 = fa.s.hp;
    // A guards from the start (an old guard: no parry); B fires a light bolt a moment later
    run(70, () => cmd(0, 1), (i) => cmd(0, 0, i === 20 ? Btn.A : 0));
    expect(fa.s.hp).toBeLessThan(hp0);
    expect(hp0 - fa.s.hp).toBeLessThan(20);
    expect(fa.s.act).not.toBe(Act.Stun);
  });

  it('a perfect block just before a bolt lands parries it back at the caster', () => {
    const { fa, fb, run, w } = duel(6, 320);
    const hpA = fa.s.hp;
    const hpB = fb.s.hp;
    // A presses BLOCK a few ticks before the bolt arrives: scan for the bolt's distance each tick
    let parried = false;
    for (let i = 0; i < 90; i++) {
      const bolt = w.projectiles.find((p) => p.owner === fb.id);
      const close = !!bolt && Math.abs(bolt.x - fa.s.x) < 70;
      run(1, () => cmd(0, 0, close ? Btn.Block : 0), () => cmd(0, 0, i === 10 ? Btn.A : 0));
      if (w.projectiles.some((p) => p.owner === fa.id)) parried = true;
    }
    expect(parried).toBe(true);
    expect(fa.s.hp).toBe(hpA);
    expect(fb.s.hp).toBeLessThan(hpB);
  });

  it('a perfect block just before a melee hit staggers the attacker', () => {
    const { fa, fb, run } = duel(0, 50);
    const startup = 5;
    run(12, (i) => cmd(0, 0, i >= startup - 3 ? Btn.Block : 0), (i) => cmd(0, 0, i === 0 ? Btn.A : 0));
    expect(fb.s.act).toBe(Act.Stun);
    expect(fb.s.stun).toBeGreaterThan(PARRY.stun - 15);
    expect(fa.s.act).not.toBe(Act.Stun);
  });

  it('a crouch guard raised just before a melee hit only blocks it (parrying is for the BLOCK button)', () => {
    const { fa, fb, run } = duel(0, 50);
    const hp0 = fa.s.hp;
    run(12, (i) => cmd(0, i >= 2 ? 1 : 0), (i) => cmd(0, 0, i === 0 ? Btn.A : 0));
    expect(fb.s.act).not.toBe(Act.Stun);
    expect(fa.s.hp).toBeLessThan(hp0);
    expect(fa.s.act).not.toBe(Act.Stun);
  });

  it('a melee swing cuts an arrow out of the air', () => {
    const { fa, fb, run, w } = duel(1, 360);
    const hp0 = fa.s.hp;
    let swung = false;
    for (let i = 0; i < 90; i++) {
      const arrow = w.projectiles.find((p) => p.owner === fb.id);
      const swing = !swung && !!arrow && Math.abs(arrow.x - fa.s.x) < 150;
      if (swing) swung = true;
      run(1, () => cmd(0, 0, swing ? Btn.A : 0), () => cmd(0, 0, i === 5 ? Btn.A : 0));
    }
    expect(swung).toBe(true);
    expect(fa.s.hp).toBe(hp0);
    expect(w.projectiles.filter((p) => p.owner === fb.id).length).toBe(0);
  });
});
