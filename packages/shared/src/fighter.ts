/**
 * One fighter's deterministic step: movement and the action state machine (attacks, charge, block, roll, heal,
 * skills). It depends only on (state, command, arena, loadout), so the client predicts its own fighter exactly; hits,
 * projectiles, burning and rounds are the World's job (server-authoritative).
 */
import { ArenaDef } from './arena';
import { DT, FIGHTER, PHYS } from './constants';
import { Btn, InputCmd } from './input';
import { Loadout, Move, SKILL_FX, SKILLS, SkillId, WEAPONS } from './weapons';

export const enum Act {
  Free = 0,
  Attack = 1,
  Charge = 2,
  Roll = 3,
  Stun = 4,
  Heal = 5,
  Block = 6,
  Skill = 7,
  KO = 8,
  Win = 9,
}

/** Move index codes beyond the combo steps. */
export const MOVE_AIR = 10;
export const MOVE_PLUNGE = 11;
export const MOVE_CHARGED = 12;

const enum Buf {
  None = 0,
  A = 1,
  B = 2,
  Skill = 3,
  Roll = 4,
  Heal = 5,
  Jump = 6,
}

export interface FighterState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  face: number;
  ground: number;
  jumps: number;
  /** Ticks left falling through platforms. */
  drop: number;
  act: number;
  actT: number;
  /** Weapon slot (0/1) of the current attack / charge / block. */
  slot: number;
  /** Current move: combo step, MOVE_AIR, MOVE_PLUNGE or MOVE_CHARGED. */
  move: number;
  /** Next combo step and the ticks left to chain it. */
  combo: number;
  comboWin: number;
  buf: number;
  bufT: number;
  /** Charge ticks held (charge), kept for the released charged move. */
  charge: number;
  rollCd: number;
  skillCd: number;
  invuln: number;
  stun: number;
  slowT: number;
  rootT: number;
  burnT: number;
  flask: number;
  hp: number;
  prevBtn: number;
  /** Increments with every new attack: a move hits a defender at most once. */
  moveSeq: number;
  /** Ticks the guard has been up (parry window = the first few). */
  blockT: number;
  /** Frozen (round intro / KO): inputs are ignored while > 0. */
  lock: number;
  jumpHeld: number;
  /** Set on the tick a skill or arrow should spawn (the World reads and clears it). */
  spawn: number;
}

/** Every state field, in wire order (protocol.ts sends the whole state to its owner for prediction). */
export const STATE_KEYS: (keyof FighterState)[] = [
  'x', 'y', 'vx', 'vy', 'face', 'ground', 'jumps', 'drop', 'act', 'actT', 'slot', 'move', 'combo', 'comboWin', 'buf', 'bufT',
  'charge', 'rollCd', 'skillCd', 'invuln', 'stun', 'slowT', 'rootT', 'burnT', 'flask', 'hp', 'prevBtn', 'moveSeq', 'blockT',
  'lock', 'jumpHeld', 'spawn',
];

export function newFighterState(x: number, y: number, face: number): FighterState {
  return {
    x, y, vx: 0, vy: 0, face, ground: 1, jumps: PHYS.airJumps, drop: 0, act: Act.Free, actT: 0, slot: 0, move: 0, combo: 0,
    comboWin: 0, buf: 0, bufT: 0, charge: 0, rollCd: 0, skillCd: 0, invuln: 0, stun: 0, slowT: 0, rootT: 0, burnT: 0,
    flask: FIGHTER.flasks, hp: FIGHTER.maxHp, prevBtn: 0, moveSeq: 0, blockT: 0, lock: 0, jumpHeld: 0, spawn: 0,
  };
}

export const copyState = (s: FighterState): FighterState => ({ ...s });

/** The move a fighter is performing (null when not attacking). */
export function currentMove(s: FighterState, load: Loadout): Move | null {
  if (s.act !== Act.Attack) return null;
  return moveOf(load.weapons[s.slot], s.move);
}

export function moveOf(weapon: number, move: number): Move | null {
  const w = WEAPONS[weapon];
  if (!w) return null;
  if (move === MOVE_AIR) return w.air;
  if (move === MOVE_PLUNGE) return w.plunge ?? w.air;
  if (move === MOVE_CHARGED) return w.charged ?? w.combo[0];
  return w.combo[move] ?? w.combo[0];
}

/** Is the move in its hitting window this tick? (Plunges hit until they land.) */
export function isActive(s: FighterState, m: Move) {
  return s.actT >= m.startup && s.actT < m.startup + m.active;
}

/** Damage of the current move (a charged move scales with the charge held). */
export function moveDamage(s: FighterState, load: Loadout, m: Move) {
  const c = WEAPONS[load.weapons[s.slot]]?.charged;
  if (s.move === MOVE_CHARGED && c) {
    const k = Math.max(0, Math.min(1, (s.charge - c.min) / Math.max(1, c.max - c.min)));
    return Math.round(c.dmg + (c.dmgMax - c.dmg) * k);
  }
  return m.dmg;
}

/** The surface a fighter at x would land on at or below y (the floor if no platform). */
export function surfaceBelow(arena: ArenaDef, x: number, y: number) {
  let best = arena.floor;
  for (const p of arena.platforms) if (x >= p.x && x <= p.x + p.w && p.y >= y - 0.5 && p.y < best) best = p.y;
  return best;
}

const approach = (v: number, t: number, step: number) => (v < t ? Math.min(v + step, t) : Math.max(v - step, t));

function startAttack(s: FighterState, slot: number, move: number) {
  s.act = Act.Attack;
  s.actT = 0;
  s.slot = slot;
  s.move = move;
  s.moveSeq = (s.moveSeq + 1) % 65536;
  s.spawn = 0;
}

/** Try to start the buffered action; returns true if it started (the buffer is consumed). */
function tryBuffered(s: FighterState, cmd: InputCmd, arena: ArenaDef, load: Loadout): boolean {
  const b = s.buf;
  if (!b) return false;
  if (b === Buf.A || b === Buf.B) {
    const slot = b === Buf.A ? 0 : 1;
    const w = WEAPONS[load.weapons[slot]];
    if (!w) return false;
    if (w.block) {
      if (!s.ground) startAttack(s, slot, MOVE_AIR);
      else {
        s.act = Act.Block;
        s.actT = 0;
        s.blockT = 0;
        s.slot = slot;
      }
    } else if (w.charged && (s.ground || w.arrowSpeed)) {
      s.act = Act.Charge;
      s.actT = 0;
      s.charge = 0;
      s.slot = slot;
    } else if (!s.ground) {
      startAttack(s, slot, cmd.moveY > 0.5 && w.plunge ? MOVE_PLUNGE : MOVE_AIR);
    } else {
      const step = s.comboWin > 0 && s.slot === slot ? s.combo : 0;
      startAttack(s, slot, step);
      s.combo = (step + 1) % w.combo.length;
    }
  } else if (b === Buf.Skill) {
    if (s.skillCd > 0) return false;
    const sk = SKILLS[load.skill];
    s.act = Act.Skill;
    s.actT = 0;
    s.skillCd = sk.cooldown;
    s.spawn = 0;
  } else if (b === Buf.Roll) {
    if (s.rollCd > 0) return false;
    if (Math.abs(cmd.moveX) > 0.3) s.face = cmd.moveX > 0 ? 1 : -1;
    s.act = Act.Roll;
    s.actT = 0;
    s.invuln = Math.max(s.invuln, FIGHTER.rollInvuln);
  } else if (b === Buf.Heal) {
    if (s.flask <= 0 || !s.ground || s.hp >= FIGHTER.maxHp) return false;
    s.flask--;
    s.act = Act.Heal;
    s.actT = 0;
  } else if (b === Buf.Jump) {
    if (!jump(s, cmd, arena)) return false;
  }
  s.buf = 0;
  s.bufT = 0;
  return true;
}

function jump(s: FighterState, cmd: InputCmd, arena: ArenaDef): boolean {
  if (s.rootT > 0) return false;
  if (s.ground && cmd.moveY > 0.5 && s.y < arena.floor - 0.5) {
    s.drop = PHYS.dropThroughTicks;
    s.ground = 0;
    return true;
  }
  if (s.ground) {
    s.vy = -PHYS.jumpSpeed;
    s.ground = 0;
    s.jumpHeld = 1;
    return true;
  }
  if (s.jumps > 0) {
    s.vy = -PHYS.airJumpSpeed;
    s.jumps--;
    s.jumpHeld = 1;
    return true;
  }
  return false;
}

/** Advance one fighter by one tick. */
export function stepFighter(s: FighterState, cmdIn: InputCmd, arena: ArenaDef, load: Loadout) {
  const locked = s.lock > 0 || s.act === Act.KO || s.act === Act.Win;
  const cmd = locked ? { ...cmdIn, moveX: 0, moveY: 0, buttons: 0 } : cmdIn;
  const btn = cmd.buttons;
  const press = btn & ~s.prevBtn;
  s.prevBtn = btn;
  if (s.lock > 0) s.lock--;
  s.spawn = 0;

  for (const k of ['rollCd', 'skillCd', 'invuln', 'slowT', 'rootT', 'comboWin', 'drop'] as const) if (s[k] > 0) s[k]--;
  if (s.bufT > 0 && --s.bufT === 0) s.buf = 0;

  // newest press wins the buffer (attacks over movement presses pressed on the same tick)
  if (press & Btn.Jump) { s.buf = Buf.Jump; s.bufT = FIGHTER.buffer; }
  if (press & Btn.Heal) { s.buf = Buf.Heal; s.bufT = FIGHTER.buffer; }
  if (press & Btn.Roll) { s.buf = Buf.Roll; s.bufT = FIGHTER.buffer; }
  if (press & Btn.Skill) { s.buf = Buf.Skill; s.bufT = FIGHTER.buffer; }
  if (press & Btn.B) { s.buf = Buf.B; s.bufT = FIGHTER.buffer; }
  if (press & Btn.A) { s.buf = Buf.A; s.bufT = FIGHTER.buffer; }

  const speedK = s.slowT > 0 ? PHYS.slowFactor : 1;
  const ax = s.rootT > 0 ? 0 : cmd.moveX;
  let gravity = true;
  s.actT++;

  switch (s.act) {
    case Act.Stun: {
      if (s.ground) s.vx = approach(s.vx, 0, PHYS.stunFriction * DT);
      if (--s.stun <= 0) {
        s.stun = 0;
        s.act = Act.Free;
        s.actT = 0;
      }
      break;
    }
    case Act.Roll: {
      const k = s.actT > FIGHTER.rollTicks - 6 ? 0.55 : 1;
      s.vx = s.face * FIGHTER.rollSpeed * k * speedK;
      if (s.actT >= FIGHTER.rollTicks) {
        s.act = Act.Free;
        s.actT = 0;
        s.rollCd = FIGHTER.rollCooldown;
      }
      break;
    }
    case Act.Heal: {
      s.vx = approach(s.vx, 0, PHYS.groundDecel * DT);
      s.hp = Math.min(FIGHTER.maxHp, s.hp + FIGHTER.healAmount / FIGHTER.healTicks);
      if (s.actT >= FIGHTER.healTicks) {
        s.act = Act.Free;
        s.actT = 0;
      }
      break;
    }
    case Act.Skill: {
      const sk = SKILLS[load.skill];
      s.vx = approach(s.vx, 0, (s.ground ? PHYS.groundDecel : PHYS.airDecel) * DT);
      if (s.actT === sk.startup) {
        s.spawn = 1;
        if (load.skill === SkillId.Blink) {
          s.x = Math.max(FIGHTER.w / 2, Math.min(arena.w - FIGHTER.w / 2, s.x + s.face * SKILL_FX.blink.dist));
          s.invuln = Math.max(s.invuln, SKILL_FX.blink.invuln);
          s.vy = Math.min(s.vy, 0);
        }
      }
      if (s.actT >= sk.startup + sk.recovery) {
        s.act = Act.Free;
        s.actT = 0;
      }
      break;
    }
    case Act.Charge: {
      const w = WEAPONS[load.weapons[s.slot]];
      const c = w.charged!;
      const held = btn & (s.slot === 0 ? Btn.A : Btn.B);
      s.vx = approach(s.vx, ax * PHYS.runSpeed * 0.3 * speedK, PHYS.groundAccel * DT);
      if (Math.abs(ax) > 0.3) s.face = ax > 0 ? 1 : -1;
      if (held) s.charge = Math.min(c.max, s.charge + 1);
      else if (s.charge < c.min) {
        const step = s.comboWin > 0 ? s.combo : 0;
        startAttack(s, s.slot, s.ground ? step : MOVE_AIR);
        s.combo = (step + 1) % w.combo.length;
      } else startAttack(s, s.slot, MOVE_CHARGED);
      break;
    }
    case Act.Block: {
      const held = btn & (s.slot === 0 ? Btn.A : Btn.B);
      s.blockT++;
      s.vx = approach(s.vx, ax * FIGHTER.blockSpeed, PHYS.groundDecel * DT);
      if (!held) {
        if (s.blockT < FIGHTER.parryWindow) startAttack(s, s.slot, 0);
        else {
          s.act = Act.Free;
          s.actT = 0;
        }
        s.blockT = 0;
      }
      break;
    }
    case Act.Attack: {
      const m = moveOf(load.weapons[s.slot], s.move)!;
      const end = m.startup + m.active;
      if (m.plunge) {
        if (s.actT >= m.startup && s.actT < end) {
          gravity = false;
          s.vy = 940;
          s.vx = approach(s.vx, 0, PHYS.airDecel * DT);
          if (s.ground) s.actT = end; // landed: recovery
        } else if (s.actT < m.startup) {
          gravity = false;
          s.vy = Math.min(s.vy, 0) * 0.5;
        }
      } else if (m.dash && s.actT >= m.startup && s.actT < end) {
        s.vx = s.face * m.dash * speedK;
      } else if (m.step && s.actT < end && s.ground) {
        s.vx = s.face * m.step * speedK * (s.actT < m.startup ? 0.6 : 1);
      } else if (s.ground) s.vx = approach(s.vx, 0, PHYS.groundDecel * DT);
      else s.vx = approach(s.vx, ax * PHYS.runSpeed * speedK, PHYS.airAccel * 0.5 * DT);
      if (m.arrow && s.actT === m.startup) s.spawn = 1;
      // chain: the next press is honoured once the hit window has passed and a little recovery is done
      const total = end + m.recovery;
      const chainAt = end + Math.ceil(m.recovery * 0.35);
      if (s.actT >= chainAt && (s.buf === Buf.A || s.buf === Buf.B || s.buf === Buf.Roll || s.buf === Buf.Skill)) {
        s.act = Act.Free;
        s.actT = 0;
        s.comboWin = 18;
        tryBuffered(s, cmd, arena, load);
        break;
      }
      if (s.actT >= total) {
        s.act = Act.Free;
        s.actT = 0;
        s.comboWin = 18;
      }
      break;
    }
    case Act.KO:
    case Act.Win:
      if (s.ground) s.vx = approach(s.vx, 0, PHYS.groundDecel * DT);
      break;
    default: {
      // Free: run, jump, or start the buffered action
      if (tryBuffered(s, cmd, arena, load)) break;
      const target = ax * PHYS.runSpeed * speedK;
      const turning = target !== 0 && Math.sign(target) !== Math.sign(s.vx);
      const accel = s.ground ? (target === 0 ? PHYS.groundDecel : turning ? PHYS.groundDecel : PHYS.groundAccel) : target === 0 ? PHYS.airDecel : PHYS.airAccel;
      s.vx = approach(s.vx, target, accel * DT);
      if (Math.abs(ax) > 0.3) s.face = ax > 0 ? 1 : -1;
    }
  }

  // variable jump height
  if (s.jumpHeld && !(btn & Btn.Jump)) {
    if (s.vy < 0) s.vy *= PHYS.jumpCut;
    s.jumpHeld = 0;
  }
  if (s.vy >= 0) s.jumpHeld = 0;

  // integrate
  if (gravity) s.vy = Math.min(PHYS.maxFall, s.vy + PHYS.gravity * DT);
  const half = FIGHTER.w / 2;
  s.x += s.vx * DT;
  if (s.x < half) { s.x = half; if (s.act !== Act.Stun) s.vx = 0; else s.vx = -s.vx * 0.3; }
  if (s.x > arena.w - half) { s.x = arena.w - half; if (s.act !== Act.Stun) s.vx = 0; else s.vx = -s.vx * 0.3; }
  const prevY = s.y;
  s.y += s.vy * DT;
  const wasGround = s.ground;
  s.ground = 0;
  if (s.y >= arena.floor) {
    s.y = arena.floor;
    s.vy = 0;
    s.ground = 1;
  } else if (s.vy >= 0 && s.drop === 0) {
    for (const p of arena.platforms) {
      if (prevY <= p.y + 0.01 && s.y >= p.y && s.x >= p.x - half * 0.5 && s.x <= p.x + p.w + half * 0.5) {
        s.y = p.y;
        s.vy = 0;
        s.ground = 1;
        break;
      }
    }
  }
  if (s.y < -400) { s.y = -400; s.vy = Math.max(0, s.vy); }
  if (s.ground) {
    s.jumps = PHYS.airJumps;
    // landing out of an air attack ends it (no floating recovery on the floor)
    if (!wasGround && s.act === Act.Attack && s.move === MOVE_AIR) {
      s.act = Act.Free;
      s.actT = 0;
    }
  }
}

/** Is the fighter guarding this tick (for hits that arrive now)? */
export const isBlocking = (s: FighterState) => s.act === Act.Block;
