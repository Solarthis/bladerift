import { describe, expect, it } from 'vitest';
import { Act, Btn, FIGHTER, getArena, InputCmd, isAirMove, moveOf, MOVE_AIR, newFighterState, sanitizeLoadout, stepFighter } from '../src/index';

const c = (buttons = 0, moveX = 0, moveY = 0): InputCmd => ({ seq: 0, moveX, moveY, buttons, viewTick: 0 });
const ARENA = getArena('training');

/** Steps a fighter through a button timeline; returns how many moves it started (moveSeq bumps). */
function play(hero: number, ticks: number, btn: (t: number) => number, setup?: (s: ReturnType<typeof newFighterState>) => void) {
  const load = sanitizeLoadout({ hero });
  const s = newFighterState(ARENA.w / 2, ARENA.floor, 1, load);
  setup?.(s);
  let starts = 0;
  let seq = s.moveSeq;
  for (let t = 0; t < ticks; t++) {
    stepFighter(s, c(btn(t)), ARENA, load);
    if (s.moveSeq !== seq) starts++;
    seq = s.moveSeq;
  }
  return { s, starts, load };
}

describe('attack presses are never lost', () => {
  it('a tap early in a slow whiffed swing becomes the next swing (it waits for the chain point)', () => {
    // Humbaba's swings are the slowest; the second tap lands long before the chain point
    for (const tapAt of [5, 8, 12, 16]) {
      const { starts } = play(9, 120, (t) => (t < 3 || (t >= tapAt && t < tapAt + 3) ? Btn.A : 0));
      expect(starts, `second tap at ${tapAt}`).toBe(2);
    }
  });

  it('a tap during a dodge swings once the dodge is over', () => {
    // Cú Chulainn's dodge is the longest (a leap)
    const { starts } = play(3, 120, (t) => (t < 2 ? Btn.Roll : t >= 3 && t < 6 ? Btn.A : 0));
    expect(starts).toBe(1);
  });

  it('a busy press is kept for FIGHTER.bufferBusy, a free one for FIGHTER.buffer', () => {
    const busy = play(9, 6, (t) => (t < 3 || t === 4 ? Btn.A : 0)).s;
    expect(busy.act).toBe(Act.Attack);
    expect(busy.bufT).toBe(FIGHTER.bufferBusy - 1);
    expect(FIGHTER.bufferBusy).toBeGreaterThan(FIGHTER.buffer);
  });

  it('an air swing still winding up when it lands becomes the ground swing (not cut to nothing)', () => {
    // a fighter a few units above the floor, falling: the air swing it starts lands before its hit window
    const { s, load } = play(0, 4, (t) => (t < 2 ? Btn.A : 0), (f) => {
      f.ground = 0;
      f.y = ARENA.floor - 1;
      f.vy = 300;
    });
    expect(s.ground).toBe(1);
    expect(s.act).toBe(Act.Attack);
    expect(isAirMove(s.move)).toBe(false);
    expect(moveOf(load.weapons[s.slot], s.move)).toBeTruthy();
  });

  it('an air swing that lands in its hit window finishes the hit, then ends (no floating recovery on the floor)', () => {
    const load = sanitizeLoadout({ hero: 0 });
    /** An air swing, stepped `k` ticks into the move, then landed. */
    const landAt = (k: number) => {
      const s = newFighterState(ARENA.w / 2, ARENA.floor - 300, 1, load);
      s.ground = 0;
      stepFighter(s, c(Btn.A), ARENA, load);
      while (s.actT < k) stepFighter(s, c(), ARENA, load);
      s.y = ARENA.floor - 0.5;
      s.vy = 400;
      stepFighter(s, c(), ARENA, load);
      return s;
    };
    const m = moveOf(load.weapons[0], MOVE_AIR)!;
    const end = m.startup + m.active;
    // in the hit window: still swinging on the floor, until the window closes
    const mid = landAt(m.startup);
    expect(mid.ground).toBe(1);
    expect(mid.act).toBe(Act.Attack);
    expect(isAirMove(mid.move)).toBe(true);
    while (mid.act === Act.Attack && mid.actT < end + 5) stepFighter(mid, c(), ARENA, load);
    expect(mid.act).toBe(Act.Free);
    // past it: the landing ends the swing at once
    const late = landAt(end + 1);
    expect(late.ground).toBe(1);
    expect(late.act).toBe(Act.Free);
  });
});
