// Throws (THROW): the heavy with the stick toward a grounded opponent in reach grabs them; a guard does not stop the grab; a
// press of LIGHT or HEAVY in the first ticks of the hold breaks it (a tech); an airborne fighter cannot be grabbed; and the
// heavy still comes out from range or without the stick toward the opponent.
import { describe, expect, it } from 'vitest';
import { Act, Btn, GameEvent, InputCmd, MOVE_THROW, ROUND, sanitizeLoadout, THROW, World } from '../src/index';

const cmd = (moveX = 0, moveY = 0, buttons = 0): InputCmd => ({ seq: 0, moveX, moveY, buttons, viewTick: 0 });

/** Two hero-0 fighters on the bridge, `gap` apart, facing each other; `tick` steps once with each fighter's command and
 * keeps the events it made. */
function duel(gap: number) {
  const w = new World({ arenaId: 'bridge', wins: 2, roundTime: 90 });
  const fa = w.addFighter(1, 0, 'A', sanitizeLoadout({ hero: 0 }));
  const fb = w.addFighter(2, 1, 'B', sanitizeLoadout({ hero: 0 }));
  w.start();
  for (let i = 0; i < ROUND.introTicks + 1; i++) w.step();
  fa.s.x = 600;
  fb.s.x = 600 + gap;
  fa.s.face = 1;
  fb.s.face = -1;
  const evs: GameEvent[] = [];
  const tick = (ca: InputCmd, cb: InputCmd) => {
    fa.inputs.push({ ...ca, seq: fa.lastSeq + 1 });
    fb.inputs.push({ ...cb, seq: fb.lastSeq + 1 });
    w.step();
    evs.push(...w.events);
    w.events = [];
  };
  return { w, fa, fb, tick, evs };
}

describe('throws', () => {
  it.each([
    ['crouch guard', false, (): InputCmd => cmd(0, 1)],
    ['block', true, (): InputCmd => cmd(0, 0, Btn.A)],
  ])('a throw beats a %s and knocks the victim down', (_name, shield, guard) => {
    const { fa, fb, tick, evs } = duel(30);
    if (shield) {
      fb.s.act = Act.Block;
      fb.s.blockT = 5;
    }
    const hp0 = fb.s.hp;
    // A presses the heavy toward B (in reach, level, grounded): the grab lands on the active tick
    tick(cmd(1, 0, Btn.B), guard());
    let downX = -1;
    let heldSeen = false;
    for (let i = 0; i < 90; i++) {
      if (fb.s.act === Act.Held) heldSeen = true;
      tick(cmd(0), guard());
      if (fb.s.act === Act.Down && downX < 0) downX = fb.s.x;
    }
    expect(evs.some((e) => e.t === 'throw' && e.a === fa.id && e.v === fb.id)).toBe(true);
    expect(heldSeen).toBe(true);
    // the throw is a full hit (no guard chip): it does real damage and knocks B down
    const hit = evs.find((e) => e.t === 'hit' && e.v === fb.id);
    expect(hit && hit.t === 'hit' ? hit.amt : 0).toBeGreaterThan(100);
    expect(hp0 - fb.s.hp).toBeGreaterThan(100);
    // thrown away from the thrower, and down on the floor
    expect(downX).toBeGreaterThan(600 + 30);
    expect(fa.s.act).not.toBe(Act.Held);
  });

  it('a tech in the first ticks of the hold breaks the throw: no damage, both pushed apart', () => {
    for (const btn of [Btn.A, Btn.B]) {
      const { fa, fb, tick, evs } = duel(30);
      const hp0 = fb.s.hp;
      tick(cmd(1, 0, Btn.B), cmd(0, 1));
      let broke = false;
      for (let i = 0; i < 30 && !broke; i++) {
        if (fb.s.act === Act.Held) {
          // break out on the first tick of the hold (a fresh press)
          tick(cmd(0), cmd(0, 0, fb.s.actT === 0 ? btn : 0));
        } else tick(cmd(0), cmd(0, 1));
        broke = evs.some((e) => e.t === 'tech');
      }
      expect(broke).toBe(true);
      expect(evs.some((e) => e.t === 'throw')).toBe(true);
      expect(evs.some((e) => e.t === 'hit' && e.v === fb.id)).toBe(false);
      expect(fb.s.hp).toBe(hp0);
      expect(fa.s.act).toBe(Act.Stun);
      expect(fb.s.act).toBe(Act.Stun);
      expect(Math.abs(fb.s.x - fa.s.x)).toBeGreaterThan(30);
    }
  });

  it('a late press (after the tech window) does not break the throw', () => {
    const { fb, tick, evs } = duel(30);
    tick(cmd(1, 0, Btn.B), cmd(0, 1));
    // hold still for the tech window, then press well after it
    let pressed = false;
    for (let i = 0; i < 40; i++) {
      if (fb.s.act === Act.Held && fb.s.actT > THROW.tech + 2 && !pressed) {
        pressed = true;
        tick(cmd(0), cmd(0, 0, Btn.A));
      } else tick(cmd(0), cmd(0, fb.s.act === Act.Held ? 0 : 1));
    }
    expect(pressed).toBe(true);
    expect(evs.some((e) => e.t === 'tech')).toBe(false);
    expect(evs.some((e) => e.t === 'hit' && e.v === fb.id)).toBe(true);
  });

  it('no grab on an airborne fighter', () => {
    const { fa, fb, tick, evs } = duel(30);
    fb.s.ground = 0;
    fb.s.y = 520;
    fb.s.vy = -200;
    fb.s.jumps = 0;
    tick(cmd(1, 0, Btn.B), cmd(0));
    for (let i = 0; i < 30; i++) tick(cmd(0), cmd(0));
    expect(evs.some((e) => e.t === 'throw')).toBe(false);
    expect(fb.s.act).not.toBe(Act.Held);
    expect(fa.s.act).not.toBe(Act.Throw);
  });

  it('the heavy still comes out from range, and without the stick toward the opponent', () => {
    // out of reach: B with the stick toward them is the plain heavy
    const far = duel(150);
    far.tick(cmd(1, 0, Btn.B), cmd(0));
    expect(far.fa.s.act).toBe(Act.Attack);
    expect(far.fa.s.move).not.toBe(MOVE_THROW);
    for (let i = 0; i < 40; i++) far.tick(cmd(0), cmd(0));
    expect(far.evs.some((e) => e.t === 'throw')).toBe(false);

    // in reach but not holding toward them: the same heavy, no grab
    const near = duel(30);
    near.tick(cmd(0, 0, Btn.B), cmd(0));
    expect(near.fa.s.act).toBe(Act.Attack);
    expect(near.fa.s.move).not.toBe(MOVE_THROW);
    for (let i = 0; i < 40; i++) near.tick(cmd(0), cmd(0));
    expect(near.evs.some((e) => e.t === 'throw')).toBe(false);
  });
});
