/**
 * One fighter's deterministic step: movement (run, jump, double jump, coyote time, wall slide and wall jump, ledge grab
 * and climb, air dash, fast fall, crouch, drop-through) and the action state machine (attacks, charge, block, roll,
 * heal, skills). It depends only on (state, command, arena, loadout), so the client predicts its own fighter exactly;
 * hits, projectiles, burning and rounds are the World's job (server-authoritative).
 */
import { ArenaDef, surfaceBelow } from './arena';
import { DT, FIGHTER, PHYS } from './constants';
import { Btn, InputCmd } from './input';
import { Loadout, Move, SKILL_FX, SKILLS, SkillId, WEAPONS } from './weapons';
import { ArtId, ARTS, classOf, ClassDef, RIFT } from './classes';
import { artIdOf } from './heroes';

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
  /** Hanging from a top edge (ledgeX, ledgeY); jump climbs, down or away lets go. */
  Ledge = 10,
  Climb = 11,
  /** Performing the class's Rift Art (classes.ts); the World plays out its effects. */
  Art = 12,
}

/** Move index codes beyond the combo steps. */
export const MOVE_AIR = 10;
export const MOVE_PLUNGE = 11;
export const MOVE_CHARGED = 12;
/** Lancer's Piercing Fang: an attack move, so it uses the normal hit system. */
export const MOVE_ART = 13;

/** Piercing Fang: an unstoppable, guard-breaking lunge across the arena. */
export const ART_FANG: Move = {
  startup: 10, active: 24, recovery: 14, dmg: 185, box: { x: 2, y: -50, w: 72, h: 30 }, kbX: 460, kbY: 220, stun: 46, dash: 900, breaksGuard: true, shake: 0.9,
};

const enum Buf {
  None = 0,
  A = 1,
  B = 2,
  Skill = 3,
  Roll = 4,
  Heal = 5,
  Jump = 6,
  Special = 7,
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
  /** Side of a wall touching the body this tick (-1 left, 1 right, 0 none) and whether it is sliding down it. */
  wall: number;
  slide: number;
  /** Ticks a wall jump is still allowed off `wallSide`, and ticks steering back toward that wall is ignored. */
  wallT: number;
  wallSide: number;
  wlock: number;
  /** The air dash has been used this airtime; the current roll is an air dash. */
  dash: number;
  rollAir: number;
  /** Fast falling; crouching; ticks of coyote time left. */
  fast: number;
  crouch: number;
  coyote: number;
  /** The edge being hung from or climbed (x, top y), and the re-grab cooldown. */
  ledgeX: number;
  ledgeY: number;
  ledgeCd: number;
  /** Ticks a landed hit can still be cancelled into a jump (set by the World). */
  confirm: number;
  /** Rift gauge (0..RIFT.max): full = the class's Rift Art is ready. */
  rift: number;
  /** Berserker's Blood Frenzy ticks left (no stagger, harder hits, faster recovery). */
  frenzy: number;
  /** Rewritten Fate: empowered blows ticks left. */
  buff: number;
  /** Grim Fog: unseen by the opponent ticks left (the first blow from it crits and ends it). */
  veil: number;
}

/** Every state field, in wire order (protocol.ts sends the whole state to its owner for prediction). */
export const STATE_KEYS: (keyof FighterState)[] = [
  'x', 'y', 'vx', 'vy', 'face', 'ground', 'jumps', 'drop', 'act', 'actT', 'slot', 'move', 'combo', 'comboWin', 'buf', 'bufT',
  'charge', 'rollCd', 'skillCd', 'invuln', 'stun', 'slowT', 'rootT', 'burnT', 'flask', 'hp', 'prevBtn', 'moveSeq', 'blockT',
  'lock', 'jumpHeld', 'spawn', 'wall', 'slide', 'wallT', 'wallSide', 'wlock', 'dash', 'rollAir', 'fast', 'crouch', 'coyote',
  'ledgeX', 'ledgeY', 'ledgeCd', 'confirm', 'rift', 'frenzy', 'buff', 'veil',
];

export function newFighterState(x: number, y: number, face: number, cls = 0): FighterState {
  return {
    x, y, vx: 0, vy: 0, face, ground: 1, jumps: classOf(cls).airJumps, drop: 0, act: Act.Free, actT: 0, slot: 0, move: 0, combo: 0,
    comboWin: 0, buf: 0, bufT: 0, charge: 0, rollCd: 0, skillCd: 0, invuln: 0, stun: 0, slowT: 0, rootT: 0, burnT: 0,
    flask: FIGHTER.flasks, hp: classOf(cls).hp, prevBtn: 0, moveSeq: 0, blockT: 0, lock: 0, jumpHeld: 0, spawn: 0,
    wall: 0, slide: 0, wallT: 0, wallSide: 0, wlock: 0, dash: 0, rollAir: 0, fast: 0, crouch: 0, coyote: 0, ledgeX: 0, ledgeY: 0,
    ledgeCd: 0, confirm: 0, rift: 0, frenzy: 0, buff: 0, veil: 0,
  };
}

export const copyState = (s: FighterState): FighterState => ({ ...s });

/** Body height now (crouching ducks under high swings). */
export const bodyH = (s: { crouch: number }) => (s.crouch ? FIGHTER.crouchH : FIGHTER.h);

/** The move a fighter is performing (null when not attacking). */
export function currentMove(s: FighterState, load: Loadout): Move | null {
  if (s.act !== Act.Attack) return null;
  return moveOf(load.weapons[s.slot], s.move);
}

const heavies = new Map<number, Move>();
/** The heavy attack (the B button: every fighter fights with one signature weapon): a weapon's charged move, or else its combo
 * finisher made slower and stronger, guard-breaking. */
export function heavyOf(weapon: number): Move | null {
  const w = WEAPONS[weapon];
  if (!w) return null;
  if (w.charged) return w.charged;
  let h = heavies.get(weapon);
  if (!h) {
    const last = w.combo[w.combo.length - 1];
    h = {
      ...last, startup: last.startup + 6, recovery: last.recovery + 6, dmg: Math.round(last.dmg * 1.4), kbX: Math.round(last.kbX * 1.25),
      kbY: last.kbY + 60, stun: last.stun + 8, breaksGuard: true, shake: Math.max(last.shake ?? 0, 0.6),
    };
    heavies.set(weapon, h);
  }
  return h;
}

export function moveOf(weapon: number, move: number): Move | null {
  const w = WEAPONS[weapon];
  if (!w) return null;
  if (move === MOVE_AIR) return w.air;
  if (move === MOVE_PLUNGE) return w.plunge ?? w.air;
  if (move === MOVE_CHARGED) return heavyOf(weapon);
  if (move === MOVE_ART) return ART_FANG;
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

const approach = (v: number, t: number, step: number) => (v < t ? Math.min(v + step, t) : Math.max(v - step, t));

function startAttack(s: FighterState, slot: number, move: number) {
  s.act = Act.Attack;
  s.actT = 0;
  s.slot = slot;
  s.move = move;
  s.moveSeq = (s.moveSeq + 1) % 65536;
  s.spawn = 0;
  s.crouch = 0;
}

/** Try to start the buffered action; returns true if it started (the buffer is consumed). */
function tryBuffered(s: FighterState, cmd: InputCmd, arena: ArenaDef, load: Loadout): boolean {
  const b = s.buf;
  if (!b) return false;
  const C = classOf(load.cls);
  if (b === Buf.Special) {
    if (!startArt(s, C, artIdOf(load))) return false;
    s.buf = 0;
    s.bufT = 0;
    return true;
  }
  if (b === Buf.A || b === Buf.B) {
    const slot = b === Buf.A ? 0 : 1;
    const w = WEAPONS[load.weapons[slot]];
    if (!w) return false;
    // the heavy button: B with the same weapon in both hands (every hero's kit) is the heavy attack on the ground (a charged
    // weapon charges it: hold for the power move, a tap is the light move) and the plunge in the air
    const heavy = slot === 1 && load.weapons[1] === load.weapons[0];
    if (heavy && !s.ground) {
      startAttack(s, slot, w.plunge ? MOVE_PLUNGE : MOVE_AIR);
    } else if (heavy && !w.charged) {
      startAttack(s, slot, MOVE_CHARGED);
    } else if (w.block) {
      if (!s.ground) startAttack(s, slot, MOVE_AIR);
      else {
        s.act = Act.Block;
        s.actT = 0;
        s.blockT = 0;
        s.slot = slot;
        s.crouch = 0;
      }
    } else if (w.charged && (s.ground || w.arrowSpeed)) {
      s.act = Act.Charge;
      s.actT = 0;
      s.charge = 0;
      s.slot = slot;
      s.crouch = 0;
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
    s.skillCd = Math.round(sk.cooldown * C.skillCd);
    s.spawn = 0;
    s.crouch = 0;
  } else if (b === Buf.Roll) {
    // on the ground a roll (cooldown); in the air a dash, once per airtime
    if (s.ground ? s.rollCd > 0 : s.dash >= C.dashes) return false;
    if (Math.abs(cmd.moveX) > 0.3) s.face = cmd.moveX > 0 ? 1 : -1;
    s.act = Act.Roll;
    s.actT = 0;
    s.rollAir = s.ground ? 0 : 1;
    if (!s.ground) s.dash++;
    s.fast = 0;
    s.crouch = 0;
    s.invuln = Math.max(s.invuln, s.ground ? FIGHTER.rollInvuln : PHYS.dashInvuln);
  } else if (b === Buf.Heal) {
    if (s.flask <= 0 || !s.ground || s.hp >= C.hp) return false;
    s.flask--;
    s.act = Act.Heal;
    s.actT = 0;
    s.crouch = 0;
  } else if (b === Buf.Jump) {
    if (!jump(s, cmd, arena, C)) return false;
  }
  s.buf = 0;
  s.bufT = 0;
  return true;
}

/** Standing on a one-way platform (not the floor or a block), so down + jump drops through. */
function onPlatform(s: FighterState, arena: ArenaDef) {
  if (s.y >= arena.floor - 0.5) return false;
  for (const b of arena.blocks) if (Math.abs(s.y - b.y) < 0.5 && s.x > b.x - FIGHTER.w / 2 && s.x < b.x + b.w + FIGHTER.w / 2) return false;
  return true;
}

/** Start the class's Rift Art if the gauge is full. */
function startArt(s: FighterState, C: ClassDef, artId: ArtId): boolean {
  if (s.rift < RIFT.max) return false;
  s.rift = 0;
  s.crouch = 0;
  s.charge = 0;
  s.stun = 0;
  if (artId === ArtId.PiercingFang) {
    startAttack(s, 0, MOVE_ART);
    return true;
  }
  s.act = Act.Art;
  s.actT = 0;
  const art = ARTS[artId];
  if (artId === ArtId.FlashStep || artId === ArtId.Bulwark) s.invuln = Math.max(s.invuln, art.ticks);
  if (artId === ArtId.BloodFrenzy) s.invuln = Math.max(s.invuln, art.ticks);
  // these pay off the moment they are cast (a hit mid-cast must not cancel them)
  if (artId === ArtId.RewrittenFate) {
    s.hp = Math.min(C.hp, s.hp + C.hp * 0.28);
    s.buff = 480;
    s.invuln = Math.max(s.invuln, 30); // the page turns: untouchable while it is written
  }
  if (artId === ArtId.GrimFog) {
    s.veil = 300 + art.ticks;
    s.invuln = Math.max(s.invuln, art.ticks);
  }
  return true;
}

function jump(s: FighterState, cmd: InputCmd, arena: ArenaDef, C: ClassDef): boolean {
  if (s.rootT > 0) return false;
  if (s.ground && cmd.moveY > 0.5 && onPlatform(s, arena)) {
    s.drop = PHYS.dropThroughTicks;
    s.ground = 0;
    s.coyote = 0;
    s.crouch = 0;
    return true;
  }
  if (s.ground || s.coyote > 0) {
    s.vy = -PHYS.jumpSpeed;
    s.ground = 0;
    s.coyote = 0;
    s.jumpHeld = 1;
    s.crouch = 0;
    return true;
  }
  // off a wall: kick away and up; the double jump and the air dash come back
  if (s.wallT > 0 && s.wallSide) {
    s.vy = -PHYS.wallJumpY;
    s.vx = -s.wallSide * PHYS.wallJumpX;
    s.face = -s.wallSide;
    s.wlock = PHYS.wallLock;
    s.wallT = 0;
    s.jumps = C.airJumps;
    s.dash = 0;
    s.fast = 0;
    s.jumpHeld = 1;
    return true;
  }
  if (s.jumps > 0) {
    s.vy = -PHYS.airJumpSpeed;
    s.jumps--;
    s.fast = 0;
    s.jumpHeld = 1;
    return true;
  }
  return false;
}

/** Advance one fighter by one tick. */
/** The opponent as a Rift Art sees them this tick (undefined: none, or down). */
export interface FoeView {
  x: number;
  y: number;
  face: number;
}

/** Night Hunt's leap: the hound's pounce lands on the opponent's spot (0.45 s of flight). */
function nightHuntLaunch(s: FighterState, foe: FoeView | undefined) {
  const dx = (foe ? foe.x : s.x + s.face * 200) - s.x;
  // the horizontal speed covers the gap in 0.45 s, so the lift must give a 0.45 s airtime (vy = g * t / 2) to land on the spot
  s.vx = Math.max(-1250, Math.min(1250, dx / 0.45));
  s.vy = -PHYS.gravity * 0.225;
  s.ground = 0;
  s.face = dx >= 0 ? 1 : -1;
}

/** Flash Step's blink: behind the opponent at tick 8, and again each 6 ticks of the flurry while they stay close. */
function flashStepMove(s: FighterState, foe: FoeView, t: number, arena: ArenaDef) {
  const behind = () => {
    const half = FIGHTER.w / 2;
    let x = foe.x - foe.face * 26;
    if (x < half || x > arena.w - half) x = foe.x + foe.face * 26; // against a wall: the other side
    s.x = Math.max(half, Math.min(arena.w - half, x));
    s.y = foe.y;
    s.face = foe.x >= s.x ? 1 : -1;
  };
  if (t === 8) behind();
  if (t >= 14 && t <= 44 && (t - 14) % 6 === 0 && Math.abs(foe.x - s.x) < 90 && Math.abs(foe.y - s.y) < 90) behind();
}

export function stepFighter(s: FighterState, cmdIn: InputCmd, arena: ArenaDef, load: Loadout, foe?: FoeView) {
  const locked = s.lock > 0 || s.act === Act.KO || s.act === Act.Win;
  const cmd = locked ? { ...cmdIn, moveX: 0, moveY: 0, buttons: 0 } : cmdIn;
  const btn = cmd.buttons;
  const press = btn & ~s.prevBtn;
  s.prevBtn = btn;
  if (s.lock > 0) s.lock--;
  s.spawn = 0;

  for (const k of ['rollCd', 'skillCd', 'invuln', 'slowT', 'rootT', 'comboWin', 'drop', 'coyote', 'wallT', 'wlock', 'ledgeCd', 'confirm'] as const) if (s[k] > 0) s[k]--;
  if (s.bufT > 0 && --s.bufT === 0) s.buf = 0;

  // newest press wins the buffer (attacks over movement presses pressed on the same tick)
  if (press & Btn.Jump) { s.buf = Buf.Jump; s.bufT = FIGHTER.buffer; }
  if (press & Btn.Heal) { s.buf = Buf.Heal; s.bufT = FIGHTER.buffer; }
  if (press & Btn.Roll) { s.buf = Buf.Roll; s.bufT = FIGHTER.buffer; }
  if (press & Btn.Skill) { s.buf = Buf.Skill; s.bufT = FIGHTER.buffer; }
  if (press & Btn.B) { s.buf = Buf.B; s.bufT = FIGHTER.buffer; }
  if (press & Btn.A) { s.buf = Buf.A; s.bufT = FIGHTER.buffer; }
  if (press & Btn.Special) { s.buf = Buf.Special; s.bufT = FIGHTER.buffer; }
  const C = classOf(load.cls);
  const ART = artIdOf(load);
  if (s.frenzy > 0) s.frenzy--;
  if (s.buff > 0) s.buff--;
  if (s.veil > 0) s.veil--;
  // the Rift gauge fills on its own while the round is live (hits fill it faster: the World adds those)
  if (!locked && s.act !== Act.Art && s.rift < RIFT.max) s.rift = Math.min(RIFT.max, s.rift + RIFT.passive);

  // (in the Grim Fog he moves like the fog: a little faster, unseen)
  const speedK = (s.slowT > 0 ? PHYS.slowFactor : 1) * C.speed * (s.frenzy > 0 ? 1.15 : 1) * (s.veil > 0 ? 1.2 : 1);
  let ax = s.rootT > 0 ? 0 : cmd.moveX;
  // just after a wall jump, steering back into that wall is ignored (so the kick carries you away)
  if (s.wlock > 0 && Math.sign(ax) === s.wallSide) ax = 0;
  let gravity = true;
  s.slide = 0;
  s.actT++;

  switch (s.act) {
    case Act.Stun: {
      // the assassin's Flash Step breaks out of a combo
      if (s.buf === Buf.Special && ART === ArtId.FlashStep && startArt(s, C, ART)) {
        s.buf = 0;
        break;
      }
      if (s.ground) s.vx = approach(s.vx, 0, PHYS.stunFriction * DT);
      if (--s.stun <= 0) {
        s.stun = 0;
        s.act = Act.Free;
        s.actT = 0;
      }
      break;
    }
    case Act.Roll: {
      if (s.rollAir) {
        // air dash: a straight, gravity-free burst, then normal falling
        s.vx = s.face * PHYS.dashSpeed * speedK * (s.actT > PHYS.dashFloat ? 0.6 : 1);
        if (s.actT <= PHYS.dashFloat) {
          gravity = false;
          s.vy = 0;
        }
        if (s.actT >= PHYS.dashTicks) {
          s.act = Act.Free;
          s.actT = 0;
          s.rollAir = 0;
        }
        break;
      }
      const k = s.actT > FIGHTER.rollTicks - 6 ? 0.55 : 1;
      s.vx = s.face * FIGHTER.rollSpeed * k * speedK;
      if (s.actT >= FIGHTER.rollTicks) {
        s.act = Act.Free;
        s.actT = 0;
        s.rollCd = Math.round(FIGHTER.rollCooldown * C.rollCd);
      }
      break;
    }
    case Act.Ledge: {
      gravity = false;
      s.vx = 0;
      s.vy = 0;
      const side = s.face;
      if (s.buf === Buf.Jump) {
        s.buf = 0;
        s.act = Act.Climb;
        s.actT = 0;
      } else if (cmd.moveY > 0.5 || ax * side < -0.5) {
        // let go: drop, or push away from the wall
        s.act = Act.Free;
        s.actT = 0;
        s.ledgeCd = PHYS.ledgeCooldown;
      } else if (s.buf === Buf.A || s.buf === Buf.B || s.buf === Buf.Skill || s.buf === Buf.Roll) {
        // swing or dash straight off the ledge
        s.act = Act.Free;
        s.actT = 0;
        s.ledgeCd = PHYS.ledgeCooldown;
        s.ground = 0;
        tryBuffered(s, cmd, arena, load);
      }
      break;
    }
    case Act.Climb: {
      gravity = false;
      s.vx = 0;
      s.vy = 0;
      const half = FIGHTER.w / 2;
      const u = Math.min(1, s.actT / PHYS.climbTicks);
      // up first, then over the edge
      const y0 = s.ledgeY + 56;
      const x0 = s.ledgeX - s.face * half;
      const x1 = s.ledgeX + s.face * 14;
      s.y = y0 + (s.ledgeY - y0) * Math.min(1, u * 1.6);
      s.x = x0 + (x1 - x0) * Math.max(0, (u - 0.45) / 0.55);
      if (u >= 1) {
        s.x = x1;
        s.y = s.ledgeY;
        s.ground = 1;
        s.act = Act.Free;
        s.actT = 0;
      }
      break;
    }
    case Act.Heal: {
      s.vx = approach(s.vx, 0, PHYS.groundDecel * DT);
      s.hp = Math.min(C.hp, s.hp + FIGHTER.healAmount / FIGHTER.healTicks);
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
          s.x = blinkTarget(s, arena);
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
      // chain: the next press is honoured once the hit window has passed and a little recovery is done; a hit that
      // landed can also be cancelled into a jump (air combos)
      const rec = m.recovery * (s.move === MOVE_ART ? 1 : C.recovery * (s.frenzy > 0 ? 0.75 : 1));
      const total = end + Math.round(rec);
      const chainAt = end + Math.ceil(rec * 0.35);
      // any attack can be cancelled into the Rift Art
      if (s.buf === Buf.Special && s.move !== MOVE_ART && startArt(s, C, ART)) {
        s.buf = 0;
        break;
      }
      const jumpCancel = s.buf === Buf.Jump && s.confirm > 0 && s.actT >= end;
      if (jumpCancel || (s.actT >= chainAt && (s.buf === Buf.A || s.buf === Buf.B || s.buf === Buf.Roll || s.buf === Buf.Skill))) {
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
    case Act.Art: {
      const art = ARTS[ART];
      if (ART === ArtId.FlashStep) {
        // hold still in the air; the blink and the flurry's steps move the assassin behind the opponent (same on the
        // server and in the client's prediction, so no snap when the snapshot arrives)
        gravity = false;
        s.vx = 0;
        s.vy = 0;
        if (foe) flashStepMove(s, foe, s.actT, arena);
      } else if (ART === ArtId.Bulwark) {
        s.vx = approach(s.vx, ax * 60, PHYS.groundDecel * DT);
      } else if (ART === ArtId.NightHunt) {
        // the hound launches the leap at tick 6 and the pounce keeps its momentum
        if (s.actT === 6) nightHuntLaunch(s, foe);
        if (s.ground && s.actT > 10) s.vx = approach(s.vx, 0, PHYS.groundDecel * DT);
      } else s.vx = approach(s.vx, 0, (s.ground ? PHYS.groundDecel : PHYS.airDecel) * DT);
      if (s.actT >= art.ticks) {
        s.act = Act.Free;
        s.actT = 0;
        if (ART === ArtId.BloodFrenzy) s.frenzy = 360;
        s.charge = 0;
      }
      break;
    }
    case Act.KO:
    case Act.Win:
      if (s.ground) s.vx = approach(s.vx, 0, PHYS.groundDecel * DT);
      break;
    default: {
      // Free: run, jump, or start the buffered action
      if (tryBuffered(s, cmd, arena, load)) {
        // an air dash floats from its very first tick
        if (s.act === Act.Roll && s.rollAir) {
          gravity = false;
          s.vy = 0;
        }
        break;
      }
      s.crouch = s.ground && cmd.moveY > 0.5 && Math.abs(ax) < 0.35 ? 1 : 0;
      if (!s.ground) {
        // fast fall: hold down in the air
        if (cmd.moveY > 0.5 && s.vy > -200) s.fast = 1;
        // wall slide: pushing into a wall while falling
        if (s.wall && Math.sign(ax) === s.wall && s.vy > 0) {
          s.vy = Math.min(s.vy, PHYS.wallSlide);
          s.slide = 1;
          s.fast = 0;
          s.face = -s.wall;
        }
      }
      const target = s.crouch ? 0 : ax * PHYS.runSpeed * speedK;
      const turning = target !== 0 && Math.sign(target) !== Math.sign(s.vx);
      const accel = s.ground ? (target === 0 ? PHYS.groundDecel : turning ? PHYS.groundDecel : PHYS.groundAccel) : target === 0 ? PHYS.airDecel : PHYS.airAccel;
      s.vx = approach(s.vx, target, accel * DT);
      if (Math.abs(ax) > 0.3 && !s.slide) s.face = ax > 0 ? 1 : -1;
    }
  }

  // variable jump height
  if (s.jumpHeld && !(btn & Btn.Jump)) {
    if (s.vy < 0) s.vy *= PHYS.jumpCut;
    s.jumpHeld = 0;
  }
  if (s.vy >= 0) s.jumpHeld = 0;

  // integrate
  if (gravity) {
    const g = s.fast ? PHYS.gravity * PHYS.fastFallGravity : PHYS.gravity;
    s.vy = Math.min(s.fast ? PHYS.fastFallMax : PHYS.maxFall, s.vy + g * DT);
  }
  if (s.slide) s.vy = Math.min(s.vy, PHYS.wallSlide);
  if (s.act !== Act.Climb && s.act !== Act.Ledge) collide(s, arena);
  else s.wall = 0;
  if (s.act === Act.Ledge || s.act === Act.Climb) s.ground = s.act === Act.Climb ? s.ground : 0;
  if (s.ground) {
    s.coyote = PHYS.coyote;
    s.jumps = C.airJumps;
    s.dash = 0;
    s.fast = 0;
    if (s.rollAir && s.act === Act.Roll && s.actT > 2) {
      s.act = Act.Free;
      s.actT = 0;
      s.rollAir = 0;
    }
  }
  // a wall in the air keeps a wall jump available for a moment after leaving it
  if (s.wall && !s.ground) {
    s.wallT = PHYS.wallCoyote;
    s.wallSide = s.wall;
  }
  if (!s.ground) s.crouch = 0;
  grabLedge(s, cmd, arena, C);
}

/** Where a blink lands: up to its distance ahead, stopping short of a block in the way. */
function blinkTarget(s: FighterState, arena: ArenaDef) {
  const half = FIGHTER.w / 2;
  let x = Math.max(half, Math.min(arena.w - half, s.x + s.face * SKILL_FX.blink.dist));
  for (const b of arena.blocks) {
    if (!(s.y > b.y + 0.5 && s.y - FIGHTER.h < b.y + b.h)) continue;
    if (s.face > 0 && s.x < b.x && x + half > b.x) x = Math.min(x, b.x - half);
    if (s.face < 0 && s.x > b.x + b.w && x - half < b.x + b.w) x = Math.max(x, b.x + b.w + half);
  }
  return x;
}

/** Move by the velocity against the arena: side walls, block sides, floors, platform and block tops, block undersides. */
function collide(s: FighterState, arena: ArenaDef) {
  const half = FIGHTER.w / 2;
  const h = bodyH(s);
  const stunned = s.act === Act.Stun;
  const hitWall = (x: number, side: number) => {
    s.x = x;
    s.wall = side;
    // knocked into a wall: bounce off it a little
    if (stunned) s.vx = -s.vx * 0.3;
    else if (Math.sign(s.vx) === side) s.vx = 0;
  };
  s.wall = 0;
  const x0 = s.x;
  s.x += s.vx * DT;
  if (s.x <= half) hitWall(half, -1);
  else if (s.x >= arena.w - half) hitWall(arena.w - half, 1);
  for (const b of arena.blocks) {
    if (!(s.y > b.y + 0.5 && s.y - h < b.y + b.h)) continue;
    if (x0 + half <= b.x + 0.5 && s.x + half >= b.x) hitWall(b.x - half, 1);
    else if (x0 - half >= b.x + b.w - 0.5 && s.x - half <= b.x + b.w) hitWall(b.x + b.w + half, -1);
  }
  const prevY = s.y;
  let ny = s.y + s.vy * DT;
  const wasGround = s.ground;
  s.ground = 0;
  if (ny >= arena.floor) {
    ny = arena.floor;
    s.vy = 0;
    s.ground = 1;
  } else if (s.vy >= 0) {
    for (const b of arena.blocks) {
      if (prevY <= b.y + 0.01 && ny >= b.y && s.x > b.x - half + 2 && s.x < b.x + b.w + half - 2) {
        ny = b.y;
        s.vy = 0;
        s.ground = 1;
        break;
      }
    }
    if (!s.ground && s.drop === 0) {
      for (const p of arena.platforms) {
        if (prevY <= p.y + 0.01 && ny >= p.y && s.x >= p.x - half * 0.5 && s.x <= p.x + p.w + half * 0.5) {
          ny = p.y;
          s.vy = 0;
          s.ground = 1;
          break;
        }
      }
    }
  } else {
    // head against the underside of a block
    for (const b of arena.blocks) {
      if (prevY - h >= b.y + b.h - 0.01 && ny - h < b.y + b.h && s.x > b.x - half + 1 && s.x < b.x + b.w + half - 1) {
        ny = b.y + b.h + h;
        s.vy = 0;
      }
    }
  }
  if (ny < -400) {
    ny = -400;
    s.vy = Math.max(0, s.vy);
  }
  s.y = ny;
  if (s.ground && !wasGround && s.act === Act.Attack && s.move === MOVE_AIR) {
    // landing out of an air attack ends it (no floating recovery on the floor)
    s.act = Act.Free;
    s.actT = 0;
  }
}

/** Falling past a top edge (block or platform) within reach of the hands: catch it and hang. */
function grabLedge(s: FighterState, cmd: InputCmd, arena: ArenaDef, C: ClassDef) {
  if (s.act !== Act.Free || s.ground || s.vy < 0 || s.ledgeCd > 0 || cmd.moveY > 0.5) return;
  const half = FIGHTER.w / 2;
  const R = PHYS.ledgeReach;
  const head = s.y - FIGHTER.h;
  const tryEdge = (ex: number, top: number, side: number) => {
    // side +1: the edge is to the right of the fighter (the left end of the block / platform)
    if (head < top - 4 || head > top + 16) return false;
    const gap = side > 0 ? ex - (s.x + half) : s.x - half - ex;
    if (gap < -3 || gap > R) return false;
    if (cmd.moveX * side < -0.3) return false; // steering away
    if (s.face !== side && cmd.moveX * side <= 0.3) return false;
    // room to stand on top
    if (surfaceBelow(arena, ex + side * 14, top - 40) < top - 0.5) return false;
    s.act = Act.Ledge;
    s.actT = 0;
    s.ledgeX = ex;
    s.ledgeY = top;
    s.face = side;
    s.x = ex - side * half;
    s.y = top + 56;
    s.vx = 0;
    s.vy = 0;
    s.jumps = C.airJumps;
    s.dash = 0;
    s.fast = 0;
    return true;
  };
  for (const b of arena.blocks) if (tryEdge(b.x, b.y, 1) || tryEdge(b.x + b.w, b.y, -1)) return;
  for (const p of arena.platforms) if (tryEdge(p.x, p.y, 1) || tryEdge(p.x + p.w, p.y, -1)) return;
}

/** Is the fighter guarding this tick (for hits that arrive now)? */
export const isBlocking = (s: FighterState) => s.act === Act.Block;


