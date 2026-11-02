// The BLOCK button: held, a guard; pressed just before a hit, a perfect block that parries ANY attack (guard-breakers,
// unblockables, shots, Rift Arts, from behind, in the air), with a tight window and no mashing. tools/parrysim.ts audits
// every attack of every hero; these pin the rules.
import { describe, expect, it } from 'vitest';
import {
  Act, Btn, decodeInputs, encodeInputs, FIGHTER, GameEvent, InputCmd, isParrying, PARRY, RIFT, ROUND, sanitizeLoadout, World,
} from '../src/index';

const cmd = (buttons = 0, moveX = 0, moveY = 0): InputCmd => ({ seq: 0, moveX, moveY, buttons, viewTick: 0 });
type Plan = (t: number) => InputCmd;

interface Result {
  w: World;
  hpLost: number;
  /** ticks a blow reached the defender: hit, blocked or parried */
  hits: number[];
  blocks: number[];
  parries: number[];
  attackerStunned: boolean;
}

/**
 * Attacker hero `atk` against Lionheart (or `def`), `gap` apart, the attacker facing the defender. The attacker plays
 * `ap`, the defender `dp`; `prep` runs once before the first tick.
 */
function duel(atk: number, gap: number, ap: Plan, dp: Plan, opts: { def?: number; ticks?: number; prep?: (w: World) => void } = {}): Result {
  const w = new World({ arenaId: 'training', wins: 2, roundTime: 90 });
  const a = w.addFighter(1, 0, 'A', sanitizeLoadout({ hero: atk }), true);
  const d = w.addFighter(2, 1, 'D', sanitizeLoadout({ hero: opts.def ?? 0 }), true);
  w.start();
  for (let i = 0; i < ROUND.introTicks + 1; i++) w.step();
  const mid = w.arena.w / 2;
  a.s.x = mid - gap / 2;
  d.s.x = mid + gap / 2;
  a.s.face = 1;
  d.s.face = -1;
  a.s.hp = d.s.hp = 1e5;
  opts.prep?.(w);
  const r: Result = { w, hpLost: 0, hits: [], blocks: [], parries: [], attackerStunned: false };
  for (let t = 0; t < (opts.ticks ?? 120); t++) {
    a.inputs.push({ ...ap(t), seq: a.lastSeq + 1 });
    d.inputs.push({ ...dp(t), seq: d.lastSeq + 1 });
    w.events = [];
    const hp = d.s.hp;
    w.step();
    r.hpLost += hp - d.s.hp;
    for (const e of w.events as GameEvent[]) {
      if (e.t === 'hit' && e.v === d.id) r.hits.push(t);
      if (e.t === 'block' && e.v === d.id) r.blocks.push(t);
      if (e.t === 'parry' && e.a === d.id) r.parries.push(t);
    }
    if (a.s.act === Act.Stun) r.attackerStunned = true;
  }
  return r;
}

const tap = (at: number, btn: number, n = 2): Plan => (t) => cmd(t >= at && t < at + n ? btn : 0);
const idle: Plan = () => cmd();
/** The tick the attack's first blow lands on an idle defender. */
const firstBlow = (atk: number, gap: number, ap: Plan, opts?: Parameters<typeof duel>[4]) => {
  const r = duel(atk, gap, ap, idle, opts);
  return Math.min(...r.hits, ...r.blocks);
};

describe('block and perfect block', () => {
  it('a held guard (no window) blocks a light hit from the front for chip damage, and the attacker is not staggered', () => {
    const blow = firstBlow(0, 60, tap(20, Btn.A));
    // BLOCK held from long before: its window closed well before the blow
    const r = duel(0, 60, tap(20, Btn.A), () => cmd(Btn.Block));
    expect(blow).toBeGreaterThan(20);
    expect(r.blocks.length).toBe(1);
    expect(r.parries.length).toBe(0);
    expect(r.hpLost).toBeGreaterThan(0);
    expect(r.hpLost).toBeLessThan(20);
    expect(r.attackerStunned).toBe(false);
  });

  it('a press up to PARRY.window - 1 ticks before the blow parries it; one press earlier only guards', () => {
    const atk = tap(20, Btn.A);
    const blow = firstBlow(0, 60, atk);
    for (let k = 0; k < PARRY.window; k++) {
      const r = duel(0, 60, atk, tap(blow - k, Btn.Block));
      expect(r.parries, `k=${k}`).toEqual([blow]);
      expect(r.hpLost, `k=${k}`).toBe(0);
      expect(r.attackerStunned).toBe(true);
    }
    const late = duel(0, 60, atk, tap(blow - PARRY.window, Btn.Block, 30));
    expect(late.parries.length).toBe(0);
    expect(late.blocks.length).toBe(1);
  });

  it('parries a guard-breaker (Humbaba’s heavy), which a held guard cannot stop', () => {
    const heavy: Plan = (t) => cmd(t >= 10 && t < 40 ? Btn.B : 0);
    const blow = firstBlow(9, 60, heavy);
    const held = duel(9, 60, heavy, () => cmd(Btn.Block));
    expect(held.hits.length).toBeGreaterThan(0);
    const r = duel(9, 60, heavy, tap(blow - 3, Btn.Block));
    expect(r.parries[0]).toBe(blow);
    expect(r.hpLost).toBe(0);
    expect(r.attackerStunned).toBe(true);
  });

  it('parries a swing from behind, turning to face it', () => {
    const atk = tap(20, Btn.A);
    const prep = (w: World) => {
      const d = [...w.fighters.values()].find((f) => f.seat === 1)!;
      d.s.face = 1; // its back to the attacker
    };
    const blow = firstBlow(0, 50, atk, { prep });
    const r = duel(0, 50, atk, tap(blow - 3, Btn.Block), { prep });
    expect(r.parries).toEqual([blow]);
    expect(r.hpLost).toBe(0);
    const d = [...r.w.fighters.values()].find((f) => f.seat === 1)!;
    expect(d.s.face).toBe(-1);
  });

  it('parries in the air', () => {
    const atk = tap(20, Btn.A);
    const prep = (w: World) => {
      const d = [...w.fighters.values()].find((f) => f.seat === 1)!;
      d.s.ground = 0;
      d.s.y = w.arena.floor - 30;
      d.s.vy = -420;
    };
    const blow = firstBlow(0, 50, atk, { prep });
    expect(Number.isFinite(blow)).toBe(true);
    const r = duel(0, 50, atk, tap(blow - 2, Btn.Block), { prep });
    expect(r.parries).toEqual([blow]);
    expect(r.hpLost).toBe(0);
  });

  it('parries an unblockable shot (Hassan’s Shadow Dirk): turned aside, no damage', () => {
    const atk = tap(10, Btn.Skill);
    const blow = firstBlow(7, 220, atk);
    const held = duel(7, 220, atk, () => cmd(Btn.Block));
    expect(held.hits.length).toBe(1);
    const r = duel(7, 220, atk, tap(blow - 3, Btn.Block));
    expect(r.parries).toEqual([blow]);
    expect(r.hpLost).toBe(0);
    expect(r.attackerStunned).toBe(false);
    expect(r.w.projectiles.length).toBe(0);
  });

  it('parries a Rift Art (Gáe Bulg): the caster is staggered, the lunge ends', () => {
    const prep = (w: World) => {
      [...w.fighters.values()].find((f) => f.seat === 0)!.s.rift = RIFT.max;
    };
    const atk = tap(5, Btn.Special);
    const blow = firstBlow(3, 200, atk, { prep, ticks: 160 });
    const r = duel(3, 200, atk, tap(blow - 4, Btn.Block), { prep, ticks: 160 });
    expect(r.parries[0]).toBe(blow);
    expect(r.hpLost).toBe(0);
    expect(r.attackerStunned).toBe(true);
  });

  it('no mashing: a press within PARRY.rearm ticks of the last opens no window', () => {
    const atk = tap(40, Btn.A);
    const blow = firstBlow(0, 60, atk);
    // a first press that catches nothing, then the timed one too soon after it
    const r = duel(0, 60, atk, (t) => cmd(t === blow - 12 || t === blow - 2 ? Btn.Block : 0));
    expect(PARRY.rearm).toBeGreaterThan(10);
    expect(r.parries.length).toBe(0);
    // with the first press far enough back, the timed press parries
    const ok = duel(0, 60, atk, (t) => cmd(t === blow - PARRY.rearm - 3 || t === blow - 2 ? Btn.Block : 0));
    expect(ok.parries).toEqual([blow]);
  });

  it('a parry re-arms at once: the next blow of a string can be parried with the next press', () => {
    // Lionheart's light string, its swings a moment apart; every blow is answered by a press 2 ticks before it
    const atk: Plan = (t) => cmd([10, 11, 28, 29, 46, 47].includes(t) ? Btn.A : 0);
    const r1 = duel(0, 60, atk, idle);
    const first = Math.min(...r1.hits);
    const r = duel(0, 60, atk, tap(first - 2, Btn.Block));
    expect(r.parries).toEqual([first]);
    // the staggered attacker's buffered swing comes out later: find it and parry that too
    const after = duel(0, 60, atk, tap(first - 2, Btn.Block), { ticks: 160 });
    const next = after.hits[0] ?? after.blocks[0];
    if (next !== undefined) {
      const both = duel(0, 60, atk, (t) => cmd(t === first - 2 || t === next - 2 ? Btn.Block : 0), { ticks: 160 });
      expect(both.parries).toEqual([first, next]);
      expect(both.hpLost).toBe(0);
    }
  });

  it('the riposte: right after a parry, an attack press cancels the guard and swings', () => {
    const atk = tap(20, Btn.A);
    const blow = firstBlow(0, 60, atk);
    const r = duel(0, 60, atk, (t) => cmd(t >= blow - 3 && t < blow - 1 ? Btn.Block : t >= blow + 2 && t < blow + 4 ? Btn.A : 0), { ticks: blow + 20 });
    expect(r.parries).toEqual([blow]);
    const d = [...r.w.fighters.values()].find((f) => f.seat === 1)!;
    const a = [...r.w.fighters.values()].find((f) => f.seat === 0)!;
    expect(d.dealt).toBeGreaterThan(0); // the punish landed on the staggered attacker
    expect(a.s.act).toBe(Act.Stun);
  });

  it('a throw beats a perfect block (a throw beats any guard)', () => {
    const atk: Plan = (t) => cmd(t >= 10 && t < 13 ? Btn.B : 0, t >= 10 && t < 13 ? 1 : 0);
    const r = duel(0, 24, atk, (t) => cmd(t >= 8 && t < 14 ? Btn.Block : 0), { ticks: 90 });
    expect(r.parries.length).toBe(0);
    expect(r.hpLost).toBeGreaterThan(0);
  });

  it('the press is buffered only FIGHTER.buffer ticks: a press during a long swing does not go off late', () => {
    const s = duel(9, 600, (t) => cmd(t < 3 ? Btn.A : t === 5 ? Btn.Block : 0), idle, { ticks: 8 }).w;
    const a = [...s.fighters.values()].find((f) => f.seat === 0)!;
    expect(a.s.act).toBe(Act.Attack);
    expect(a.s.bufT).toBeLessThanOrEqual(FIGHTER.buffer);
    expect(isParrying(a.s)).toBe(false);
  });

  it('a volley parried in one riposte pays the Rift gauge once, and only its first shot flies back', () => {
    // Gilgamesh's heavy, held: a fan of blades from the Gate; one press before the first, the riposte takes the rest
    const heavy: Plan = (t) => cmd(t >= 5 && t < 75 ? Btn.B : 0);
    const opts = { ticks: 160 };
    const base = duel(2, 200, heavy, idle, opts);
    const blows = [...base.hits, ...base.blocks].sort((x, y) => x - y);
    expect(blows.length).toBeGreaterThan(2);
    const quiet = duel(2, 200, () => cmd(), idle, opts);
    const r = duel(2, 200, heavy, tap(blows[0] - 2, Btn.Block), opts);
    expect(r.hpLost).toBe(0);
    expect(r.parries.length).toBeGreaterThan(2);
    const rift = (x: Result) => [...x.w.fighters.values()].find((f) => f.seat === 1)!.s.rift;
    // (passive fill is the same in both runs; the parries add one slice, not one per blade)
    expect(rift(r) - rift(quiet)).toBeLessThanOrEqual(RIFT.max * PARRY.rift + 1);
    const back = r.w.projectiles.filter((p) => p.owner === [...r.w.fighters.values()].find((f) => f.seat === 1)!.id);
    expect(back.length).toBeLessThanOrEqual(1);
  });

  it('a perfect block that parries nothing costs PARRY.whiffRift of the gauge', () => {
    const prep = (w: World) => {
      [...w.fighters.values()].find((f) => f.seat === 1)!.s.rift = RIFT.max / 2;
    };
    const quiet = duel(0, 300, idle, idle, { prep, ticks: 30 });
    const r = duel(0, 300, idle, tap(5, Btn.Block), { prep, ticks: 30 });
    const rift = (x: Result) => [...x.w.fighters.values()].find((f) => f.seat === 1)!.s.rift;
    expect(rift(quiet) - rift(r)).toBeCloseTo(RIFT.max * PARRY.whiffRift, 0);
  });

  it('online: a swing judged at a past view tick is parried if the perfect block was open then, or is open now', () => {
    // the attacker plays 9 ticks behind (lag compensation judges its swing against the defender 9 ticks ago)
    const LAG = 9;
    for (const mode of ['then', 'now'] as const) {
      const w = new World({ arenaId: 'training', wins: 2, roundTime: 90 });
      const a = w.addFighter(1, 0, 'A', sanitizeLoadout({ hero: 0 }));
      const d = w.addFighter(2, 1, 'D', sanitizeLoadout({ hero: 0 }));
      w.start();
      let seq = 0;
      const events: { t: number; e: GameEvent }[] = [];
      const step = (ab: number, db: number) => {
        seq++;
        a.inputs.push({ seq, moveX: 0, moveY: 0, buttons: ab, viewTick: Math.max(1, w.tick + 1 - LAG) });
        d.inputs.push({ seq, moveX: 0, moveY: 0, buttons: db, viewTick: w.tick + 1 });
        w.events = [];
        w.step();
        for (const e of w.events as GameEvent[]) events.push({ t: w.tick, e });
      };
      for (let i = 0; i < ROUND.introTicks + 1; i++) step(0, 0);
      const mid = w.arena.w / 2;
      a.s.x = mid - 30;
      d.s.x = mid + 30;
      a.s.face = 1;
      d.s.face = -1;
      for (let i = 0; i < 20; i++) step(0, 0);
      const hp = d.s.hp;
      // Lionheart's light lands 5 ticks after its press
      if (mode === 'then') {
        // the block opens at O and has closed by the blow at O + 12; the attacker's view (O + 3) still shows it open
        step(0, Btn.Block);
        for (let i = 0; i < 6; i++) step(0, 0);
        step(Btn.A, 0);
      } else {
        // the attacker's view shows an idle defender; the block opens 3 ticks before the blow lands
        step(Btn.A, 0);
        step(0, 0);
        step(0, Btn.Block);
      }
      for (let i = 0; i < 14; i++) step(0, 0);
      const parried = events.some(({ e }) => e.t === 'parry' && e.a === d.id);
      const hit = events.some(({ e }) => (e.t === 'hit' || e.t === 'block') && e.v === d.id);
      expect(parried && !hit, mode).toBe(true);
      expect(d.s.hp, mode).toBe(hp);
    }
  });

  it('the Block bit survives the wire', () => {
    const c = { seq: 7, moveX: 0, moveY: 0, buttons: Btn.Block | Btn.A, viewTick: 3 };
    expect(decodeInputs(encodeInputs([c]))[0].buttons).toBe(Btn.Block | Btn.A);
  });
});
