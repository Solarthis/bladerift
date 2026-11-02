/**
 * The authoritative duel: two fighter seats, rounds, hits (with bounded lag compensation), projectiles, traps and
 * status effects. Runs on the server and, for practice / same-device play, inside the browser.
 */
import { ArenaDef, getArena, solidAt, surfaceBelow } from './arena';
import { DT, FIGHTER, PARRY, PHYS, ROUND, THROW, TICK_RATE } from './constants';
import {
  Act, bodySolid, bodyYields, castingEx, copyState, currentMove, exDamage, FighterState, FoeView, hitstopFor, isActive, isBlocking, isCrouchGuard, isAirMove, isParrying, isFrozen, isThrowable, meleeConnect, meleeCrit, moveDamage, MOVE_AIR3, MOVE_ART, MOVE_CHARGED, newFighterState, stepFighter,
} from './fighter';
import { Btn, emptyInput, InputCmd } from './input';
import { ArtId, ClassId, classOf, RIFT } from './classes';
import { artIdOf, heroClass } from './heroes';
import { Box, gatePortal, Loadout, Move, SKILL_FX, SKILLS, WEAPONS, WeaponId } from './weapons';

export interface MatchSettings {
  arenaId: string;
  /** Round wins needed (1..3). */
  wins: number;
  /** Round length in seconds. */
  roundTime: number;
  /** Training: a fighter's health and flasks refill TRAINING.refillTicks after the combo against it ends, the round clock
   * does not run and nobody can be K.O.'d (health floors at 1). */
  training?: boolean;
  /** The Rift gauge stays full: every Rift Art is ready, but the EX special never is (a full gauge starts the Art, and EX
   * needs a gauge below full). */
  infiniteRift?: boolean;
  /** The practice bot's hero (-1 or unset: a random one). */
  botHero?: number;
  /** Survival: each match starts with the health the previous one ended with (see startHp). */
  carryHp?: boolean;
  /** Health to start the match with, per seat (used when carryHp is on; a negative value, or a missing one, is full health,
   * and 0 starts at 1 health). The room fills it in when a match ends. */
  startHp?: number[];
}

/** Training refill: ticks after a combo against a fighter ends before its health and flasks are restored (1 s). */
export const TRAINING = { refillTicks: TICK_RATE } as const;
/** The K.O. launch: the beaten fighter's push away from the attacker (at least vx) and its upward kick (vy, units/s). */
export const KO_LAUNCH = { vx: 260, vy: -340 } as const;

export const DEFAULT_SETTINGS: MatchSettings = { arenaId: 'hall', wins: ROUND.defaultWins, roundTime: ROUND.defaultTime };

export type Phase = 'intro' | 'fight' | 'ko' | 'over';
export const PHASES: Phase[] = ['intro', 'fight', 'ko', 'over'];

export type ProjKind = 'arrow' | 'bomb' | 'frost' | 'arcane' | 'orb' | 'wave' | 'relic' | 'hand' | 'steed';
export const PROJ_KINDS: ProjKind[] = ['arrow', 'bomb', 'frost', 'arcane', 'orb', 'wave', 'relic', 'hand', 'steed'];

/** Caster's Thunder Call: a strike aimed at the opponent shortly before it lands (the marker is shown meanwhile). */
/** What a 'parry' event was: a perfect block (the first of a chain, or one caught in its riposte), a Shield parry, a swing
 * cutting a shot out of the air, or Bulwark turning a swing back. */
export const PARRY_KIND = { perfect: 0, chained: 1, shield: 2, cut: 3, bulwark: 4 } as const;

export interface Strike {
  id: number;
  owner: number;
  x: number;
  y: number;
  at: number;
  aimed: boolean;
  /** 0 star / lightning (Starfall), 1 binding chains (Chains of Genesis). */
  kind: number;
}

export interface Projectile {
  id: number;
  kind: ProjKind;
  owner: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  dmg: number;
  kb: number;
  stun: number;
  life: number;
  /** Heavy (charged) arrow. */
  heavy: boolean;
  /** Ticks before it appears (a volley's staggered arrows). */
  wait?: number;
  /** Ignores guards. */
  unblockable?: boolean;
  /** Tramples through: hits once, keeps going. */
  pierce?: boolean;
  burn?: number;
  /** A hero special's projectile: the skill id + 1 (0 = none); the client draws the hero's own effect. */
  skin?: number;
  slow?: number;
  root?: number;
  /** Gravity (units/s^2) instead of the kind's default. */
  gravity?: number;
  kbY?: number;
  /** Turns back toward its thrower at this life left (a thrown shield). */
  boomerang?: number;
  /** Fired by a Rift Art: its hits land as Art hits (Art hit-stop, no combo scaling). Weapon and skill projectiles that
   * share a kind with an Art's (the Gate's blades and Gate Shot are relics, Chain Lash a hand) are ordinary hits. */
  art?: boolean;
  /** Cast as the EX special (fighter.ts startEx): the client tints it. */
  ex?: boolean;
}

export interface Trap {
  id: number;
  owner: number;
  x: number;
  y: number;
  armAt: number;
  until: number;
}

export type GameEvent =
  /** v was hit by a for amt; w = weapon id (or 100 + skill / 200 burn); crit; x,y = impact point; n = the hit's number in
   * v's current combo (1 = a fresh hit, 0 = burning); hs = the hit-stop it set on v (ticks; the attacker of a melee hit
   * freezes the same, 0 = none). */
  | { t: 'hit'; a: number; v: number; amt: number; w: number; crit: boolean; x: number; y: number; n: number; hs: number }
  /** v blocked a's hit (chip amt); hs = the hit-stop on both (melee) or v (projectiles). */
  | { t: 'block'; a: number; v: number; amt: number; x: number; y: number; hs: number }
  /** a parried (v: the staggered attacker, 255 none); k: PARRY_KIND */
  | { t: 'parry'; a: number; v: number; x: number; y: number; k: number }
  | { t: 'swing'; p: number; w: number; m: number }
  | { t: 'shoot'; p: number; kind: number }
  | { t: 'boom'; x: number; y: number }
  | { t: 'trap'; v: number; x: number; y: number }
  | { t: 'roll'; p: number }
  | { t: 'heal'; p: number }
  | { t: 'blink'; p: number; x0: number; x1: number; y: number }
  | { t: 'ko'; v: number; a: number }
  /** Round over: winner seat (255 = draw); why 0 KO / 1 time. */
  | { t: 'round'; winner: number; why: number }
  | { t: 'fight'; round: number }
  | { t: 'match'; winner: number }
  /** p started its Rift Art (classes.ts ArtId); pause = the superpause that starts now (ticks, FIGHTER.superpause): both
   * fighters, projectiles, strikes and the clock are frozen, and the Art plays out after it. */
  | { t: 'art'; p: number; art: number; pause: number }
  /** A Starfall bolt or Chains of Genesis landed. */
  | { t: 'strike'; x: number; y: number; kind: number }
  /** p started its hero special as the EX special (fighter.ts startEx; skill = the hero's SkillId): tint the cast. */
  | { t: 'ex'; p: number; skill: number }
  /** a's throw grabbed v (v is held THROW.hold ticks before it is thrown; the impact is an ordinary 'hit'). */
  | { t: 'throw'; a: number; v: number }
  /** v broke a's throw in the tech window: both are pushed apart, no damage. */
  | { t: 'tech'; a: number; v: number };

export interface Fighter {
  id: number;
  seat: number;
  name: string;
  bot: boolean;
  s: FighterState;
  load: Loadout;
  /** Where this fighter stood when the tick began (the opponent pushes against this, so the push never depends on which
   * fighter the server happened to step first; the client predicts against the same snapshot state). */
  start?: FoeView;
  // input queue (see runCommands)
  inputs: InputCmd[];
  lastSeq: number;
  lastCmd: InputCmd;
  starved: number;
  deepTicks: number;
  cushion: number;
  lateAt: number;
  credit: number;
  owed: number;
  carry: number;
  lagTicks: number;
  prevViewTick: number;
  // rewind history
  histTick: Int32Array;
  histX: Float32Array;
  histY: Float32Array;
  histFlags: Uint8Array;
  histBlockT: Uint16Array;
  histFace: Int8Array;
  /** moveSeq of the opponent's move that last hit this fighter. */
  lastHitSeq: number;
  /** A dash special has landed its hit (once per use). */
  skillHit: boolean;
  /** x before this tick's step (Flash Step's blink trail). */
  blinkFrom: number;
  /** Hits of the combo this fighter is taking (0 = not in one). */
  comboHits: number;
  /** Training: ticks left before the refill for the combo that ended (-1 = no combo has ended since its last hit). */
  refillT: number;
  /** Frozen this tick (hit-stop or superpause at the start of the tick): it cannot land hits or run Art effects. */
  held: boolean;
  // stats
  dealt: number;
  roundDealt: number;
  hits: number;
  roundsWon: number;
}

const HIST = 64;
const MAX_QUEUE = 12;
const CUSHION_START = 0;
const CUSHION_MIN = 0;
const CUSHION_MAX = 3;
const CUSHION_DECAY_TICKS = 120;
const BUILD_EVERY = 6;
const DRAIN_ABOVE = 2;
const DEEP_TICKS = 30;
const NOMINAL_LAG = 8;
const STALE_TICKS = 30;
/** Default lag-compensation limit (LAN); online rooms raise it (World.maxRewind). */
export const MAX_REWIND = Math.round(0.3 * TICK_RATE);

/** The floor or a block top below (one-way platforms ignored). */
function solidBelow(arena: ArenaDef, x: number, y: number) {
  let best = arena.floor;
  for (const b of arena.blocks) if (x >= b.x && x <= b.x + b.w && b.y >= y - 0.5 && b.y < best) best = b.y;
  return best;
}

/** How deep a platform's stone is drawn under its top surface (the client's platform strip: ~55 world units). */
export const PLATFORM_DEPTH = 46;
/** Does the path from (x0, y0) to (x1, y1) meet a platform's stone (its top surface down to PLATFORM_DEPTH)? */
export function throughPlatform(arena: ArenaDef, x0: number, y0: number, x1: number, y1: number) {
  const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 6));
  for (let i = 1; i <= n; i++) {
    const x = x0 + ((x1 - x0) * i) / n;
    const y = y0 + ((y1 - y0) * i) / n;
    for (const p of arena.platforms) if (x > p.x && x < p.x + p.w && y > p.y - 2 && y < p.y + PLATFORM_DEPTH) return true;
  }
  return false;
}

/** 'shoot' event kinds from SKILL_EVENT up are hero specials (kind - SKILL_EVENT = the skill id); hits from a special
 * carry SKILL_WEAPON as their weapon. */
export const SKILL_EVENT = 32;
export const SKILL_WEAPON = 100;
/** The 'shoot' kind of the Sun Crescent (Richard's heavy). */
export const SHOOT_CRESCENT = 10;
/** The Sun Crescent in flight: spawned `ahead` of the swordsman, flies at `speed` for `life` ticks (about a third of an
 * arena: mid range), runs along floors, a guard blocks it and a parry sends it back. */
export const CRESCENT = { ahead: 12, speed: 780, life: 26 } as const;
const overlap = (a: Box, b: Box) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

/** Damage scale of the n-th hit of a combo (FIGHTER.comboScaleStep / comboScaleMin). */
export const comboScale = (n: number) => Math.max(FIGHTER.comboScaleMin, 1 - FIGHTER.comboScaleStep * Math.max(0, n - 1));

export function bodyBox(x: number, y: number, crouch = false): Box {
  const h = crouch ? FIGHTER.crouchH : FIGHTER.h;
  return { x: x - FIGHTER.w / 2, y: y - h, w: FIGHTER.w, h };
}

/** The world-space hit box of a move for a fighter at (x, y) facing `face`. */
export function moveBox(m: Move, x: number, y: number, face: number): Box {
  const bx = face > 0 ? x + m.box.x : x - m.box.x - m.box.w;
  return { x: bx, y: y + m.box.y, w: m.box.w, h: m.box.h };
}

/** Vault of Ages: where each of the 11 portals opens around the opponent (degrees; 0 = right, -90 = above), on the ground
 * and in the air (where they also open below). */
const VAULT_GROUND = [-90, -150, -30, 180, 0, -120, -60, -170, -10, -105, -75];
const VAULT_AIR = [-90, 90, 180, 0, -135, 135, -45, 45, -160, 160, -90];

export class World {
  tick = 0;
  readonly arena: ArenaDef;
  readonly fighters = new Map<number, Fighter>();
  /** Fighter id in seat 0 and seat 1 (-1 = empty). */
  readonly seats: [number, number] = [-1, -1];
  phase: Phase = 'intro';
  phaseEnd = 0;
  round = 1;
  wins: [number, number] = [0, 0];
  timeLeft: number;
  projectiles: Projectile[] = [];
  strikes: Strike[] = [];
  traps: Trap[] = [];
  events: GameEvent[] = [];
  winner = -1;
  maxRewind = MAX_REWIND;
  /** Superpause ticks left: projectiles, strikes, traps, burning and the round clock are frozen (the fighters carry
   * their own `pause`). */
  pause = 0;
  private nextId = 1;
  /** Fighters whose Rift Art started this tick (their opponent is put in the superpause after every fighter moved). */
  private casting: Fighter[] = [];
  /** The hit-stop the last applyHit set (0: none, e.g. a parry). */
  private lastStop = 0;
  /** The last applyHit was parried (a perfect block, or a Shield parry): a shot flies back or is turned aside, a swing stops short. */
  private lastParry = false;
  /** The last parry came in the riposte of an earlier one (a volley): a shot is turned aside, not sent back. */
  private lastParryChained = false;

  constructor(readonly settings: MatchSettings) {
    this.arena = getArena(settings.arenaId);
    this.timeLeft = settings.roundTime;
  }

  /** Seat a fighter (seat 0 = left spawn). */
  addFighter(id: number, seat: number, name: string, load: Loadout, bot = false): Fighter {
    const sx = this.arena.spawns[seat] ?? this.arena.w / 2;
    const f: Fighter = {
      id, seat, name, bot, load,
      s: newFighterState(sx, this.arena.floor, seat === 0 ? 1 : -1, load),
      inputs: [], lastSeq: 0, lastCmd: emptyInput(), starved: STALE_TICKS + 1, deepTicks: 0, cushion: CUSHION_START, lateAt: 0, credit: 0,
      owed: 0, carry: 0, lagTicks: -1, prevViewTick: 0,
      histTick: new Int32Array(HIST).fill(-1), histX: new Float32Array(HIST), histY: new Float32Array(HIST), histFlags: new Uint8Array(HIST),
      histBlockT: new Uint16Array(HIST), histFace: new Int8Array(HIST),
      lastHitSeq: -1, skillHit: false, comboHits: 0, refillT: -1, held: false, dealt: 0, roundDealt: 0, hits: 0, roundsWon: 0, blinkFrom: 0,
    };
    if (this.settings.infiniteRift) f.s.rift = RIFT.max;
    f.s.lock = Math.max(0, this.phaseEnd - this.tick);
    this.fighters.set(id, f);
    this.seats[seat] = id;
    return f;
  }

  removeFighter(id: number) {
    const f = this.fighters.get(id);
    if (!f) return;
    this.fighters.delete(id);
    if (this.seats[f.seat] === id) this.seats[f.seat] = -1;
  }

  /** Begin the first round (call once both seats are filled, or for a solo warm-up). With carryHp, each seat starts the
   * match at its startHp (clamped to 1..its class's health; a negative value means full health). A carried 0 (a fighter
   * that ended at 0) starts at 1, not at full. */
  start() {
    this.resetRound();
    if (this.settings.carryHp && this.settings.startHp) {
      for (const f of this.fighters.values()) {
        const hp = this.settings.startHp[f.seat];
        if (typeof hp === 'number' && hp >= 0) f.s.hp = Math.min(heroClass(f.load).hp, Math.max(1, Math.round(hp)));
      }
    }
  }

  /** The opponent as a Rift Art sees them (no view when they are down). */
  foeView(f: Fighter): FoeView | undefined {
    const o = this.opponent(f);
    if (!o || o.s.act === Act.KO) return undefined;
    return o.start ?? { x: o.s.x, y: o.s.y, face: o.s.face, solid: bodySolid(o.s), yields: bodyYields(o.s), throwable: isThrowable(o.s) };
  }

  opponent(f: Fighter): Fighter | undefined {
    const id = this.seats[f.seat ^ 1];
    return id < 0 ? undefined : this.fighters.get(id);
  }

  private resetRound() {
    this.phase = 'intro';
    this.phaseEnd = this.tick + ROUND.introTicks;
    this.timeLeft = this.settings.roundTime;
    this.projectiles = [];
    this.traps = [];
    this.strikes = [];
    this.pause = 0;
    for (const f of this.fighters.values()) {
      const seq = f.s.moveSeq;
      const prevBtn = f.s.prevBtn;
      // the Rift gauge carries over between rounds
      const rift = f.s.rift;
      f.s = newFighterState(this.arena.spawns[f.seat], this.arena.floor, f.seat === 0 ? 1 : -1, f.load);
      f.s.moveSeq = seq;
      f.s.prevBtn = prevBtn;
      f.s.rift = rift;
      f.s.lock = ROUND.introTicks;
      f.lastHitSeq = -1;
      f.comboHits = 0;
      f.refillT = -1;
      f.roundDealt = 0;
    }
  }

  step() {
    this.tick++;
    if (this.phase === 'intro' && this.tick >= this.phaseEnd) {
      this.phase = 'fight';
      this.events.push({ t: 'fight', round: this.round });
    }
    // a superpause started last tick or earlier freezes the world this tick
    const paused = this.pause > 0;
    if (paused) this.pause--;
    for (const f of this.fighters.values()) {
      f.held = isFrozen(f.s);
      f.start = { x: f.s.x, y: f.s.y, face: f.s.face, solid: bodySolid(f.s), yields: bodyYields(f.s), throwable: isThrowable(f.s) };
    }
    for (const f of this.fighters.values()) this.runCommands(f);
    for (const f of this.fighters.values()) f.start = undefined;
    this.startSuperpause();
    if (this.phase === 'over') return;
    for (const f of this.fighters.values()) this.spawnFrom(f);
    for (const f of this.fighters.values()) this.checkMelee(f);
    for (const f of this.fighters.values()) this.checkSkillDash(f);
    this.stepThrows();
    this.stepArts(paused);
    if (paused) {
      for (const t of this.traps) (t.armAt++, t.until++);
    } else {
      this.stepProjectiles();
      this.stepTraps();
      this.stepStatus();
    }
    this.stepTraining(paused);
    this.stepRound(paused);
  }

  /** A Rift Art started this tick: its caster froze itself (stepFighter); freeze the opponent and the world as long. */
  /** A projectile turned around by a parry (or Bulwark): it flies back at its owner and is now `by`'s. */
  private reflect(p: Projectile, by: Fighter) {
    p.owner = by.id;
    p.vx = -p.vx * 1.1;
    p.vy = -Math.abs(p.vy) * 0.5;
    p.life = Math.max(p.life, 60);
    p.wait = 0;
  }

  /**
   * An ordinary projectile meeting an enemy's melee swing (from a tick before its hit window until a few ticks after) is
   * cut out of the air. Rift Art projectiles, unblockable and piercing ones push through.
   */
  private deflected(p: Projectile, px: number, py: number): boolean {
    if (p.art || p.unblockable || p.pierce || p.kind === 'wave' || p.kind === 'steed' || p.kind === 'hand' || (p.wait ?? 0) > 0) return false;
    for (const f of this.fighters.values()) {
      if (f.id === p.owner || f.s.act !== Act.Attack) continue;
      const m = currentMove(f.s, f.load);
      if (!m || m.arrow || m.arcane || m.gate || m.grab) continue;
      if (f.s.actT < m.startup - 1 || f.s.actT >= m.startup + m.active + FIGHTER.deflectLate) continue;
      const mb = moveBox(m, f.s.x, f.s.y, f.s.face);
      const pb = { x: Math.min(px, p.x) - 6, y: Math.min(py, p.y) - 8, w: Math.abs(p.x - px) + 12, h: Math.abs(p.y - py) + 16 };
      if (!overlap(mb, pb)) continue;
      this.events.push({ t: 'parry', a: f.id, v: 255, x: p.x, y: p.y, k: PARRY_KIND.cut }); // (v 255: a shot, nobody staggered)
      return true;
    }
    return false;
  }

  private startSuperpause() {
    for (const f of this.casting) {
      const o = this.opponent(f);
      if (o && o.s.act !== Act.KO) o.s.pause = Math.max(o.s.pause, FIGHTER.superpause);
      this.pause = Math.max(this.pause, FIGHTER.superpause);
    }
    this.casting.length = 0;
  }

  // ------------------------------------------------------------ input queue (ported from Skyfire Squad)

  /**
   * Move a fighter by its next command. Every command moves the fighter once and once only, as the client predicted.
   * A small adaptive cushion absorbs arrival jitter; when the queue runs dry the last input is held (a guess that
   * snapshots acknowledge, ack = lastSeq + owed) so nobody freezes, and late commands are then used up without moving
   * again. Presses inside dropped or merged commands are carried forward so none is lost.
   */
  private runCommands(f: Fighter) {
    const q = f.inputs;
    const top = f.lastSeq + f.owed;
    let repaid = false;
    let prev = f.lastCmd.buttons;
    while (q.length && q[0].seq <= top) {
      const c = q.shift()!;
      // (its movement was guessed; a press in it still happens, on this tick)
      f.carry |= c.buttons & ~prev;
      prev = c.buttons;
      f.starved = 0;
      repaid = true;
      this.useCommand(f, c);
    }
    f.owed = q.length ? 0 : top - f.lastSeq;
    if (!f.bot && this.tick - f.lateAt > CUSHION_DECAY_TICKS && f.cushion > CUSHION_MIN) {
      f.cushion--;
      f.lateAt = this.tick;
    }
    let cmd: InputCmd;
    if (q.length) {
      f.starved = 0;
      while (q.length > MAX_QUEUE) {
        const stale = q.shift()!;
        q[0] = { ...q[0], buttons: q[0].buttons | stale.buttons };
      }
      if (!f.bot && q.length < f.cushion && this.tick % BUILD_EVERY === 0) return this.holdStill(f);
      if (q.length > Math.max(f.cushion, DRAIN_ABOVE) + 1) {
        if (++f.deepTicks >= DEEP_TICKS) {
          f.deepTicks = 0;
          const extra = q.shift()!;
          if (f.credit > 0) {
            f.credit--;
            this.useCommand(f, extra);
            this.moveFighter(f, extra);
          } else q[0] = { ...q[0], buttons: q[0].buttons | extra.buttons };
        }
      } else f.deepTicks = 0;
      cmd = q.shift()!;
      this.useCommand(f, cmd);
    } else if (repaid) {
      return this.holdStill(f);
    } else {
      f.starved++;
      if (f.starved > STALE_TICKS || f.bot) cmd = { ...f.lastCmd, moveX: f.starved > STALE_TICKS ? 0 : f.lastCmd.moveX, moveY: 0, buttons: f.starved > STALE_TICKS ? 0 : f.lastCmd.buttons };
      else {
        cmd = { ...f.lastCmd };
        f.owed++;
        if (f.starved === 1) f.cushion = Math.min(CUSHION_MAX, f.cushion + 1);
        f.lateAt = this.tick;
      }
    }
    if (f.carry) {
      // a press that arrived late: OR it in, but make sure it reads as a fresh press this tick
      f.s.prevBtn &= ~f.carry;
      cmd = { ...cmd, buttons: cmd.buttons | f.carry };
      f.carry = 0;
    }
    this.moveFighter(f, cmd);
  }

  private holdStill(f: Fighter) {
    f.credit = Math.min(CUSHION_MAX * 4, f.credit + 1);
    this.recordHistory(f);
  }

  private useCommand(f: Fighter, cmd: InputCmd) {
    f.lastCmd = cmd;
    if (cmd.seq > f.lastSeq) f.lastSeq = cmd.seq;
    this.observeViewTick(f, cmd.viewTick);
  }

  /** Reset per-connection input state (new connection or resume): the client restarts its sequence at 0. */
  resetInputs(f: Fighter) {
    f.inputs.length = 0;
    f.lastSeq = 0;
    f.lastCmd = emptyInput();
    f.starved = STALE_TICKS + 1;
    f.deepTicks = 0;
    f.cushion = CUSHION_START;
    f.lateAt = this.tick;
    f.credit = 0;
    f.owed = 0;
    f.carry = 0;
    f.lagTicks = -1;
  }

  private moveFighter(f: Fighter, cmd: InputCmd) {
    const s = f.s;
    const before = s.act;
    // (a frozen step changes nothing: no new action, no events)
    const frozen = isFrozen(s);
    f.blinkFrom = s.x;
    stepFighter(s, cmd, this.arena, f.load, this.foeView(f));
    if (!frozen) {
      if (s.act === Act.Roll && before !== Act.Roll) this.events.push({ t: 'roll', p: f.id });
      if (s.act === Act.Heal && before !== Act.Heal) this.events.push({ t: 'heal', p: f.id });
      let art = false;
      if (s.act === Act.Attack && s.actT === 0) {
        if (s.move === MOVE_ART) art = true;
        else this.events.push({ t: 'swing', p: f.id, w: f.load.weapons[s.slot], m: s.move });
      }
      if (s.act === Act.Art && s.actT === 0 && before !== Act.Art) art = true;
      if (castingEx(s) && before !== Act.Skill) this.events.push({ t: 'ex', p: f.id, skill: f.load.skill });
      if (art) {
        this.events.push({ t: 'art', p: f.id, art: artIdOf(f.load), pause: FIGHTER.superpause });
        this.casting.push(f);
      }
    }
    this.recordHistory(f);
  }

  private recordHistory(f: Fighter) {
    const h = this.tick % HIST;
    f.histTick[h] = this.tick;
    f.histX[h] = f.s.x;
    f.histY[h] = f.s.y;
    f.histFlags[h] = (f.s.invuln > 0 ? 1 : 0) | (isBlocking(f.s) ? 2 : 0) | (f.s.crouch ? 4 : 0) | (isParrying(f.s) ? 8 : 0);
    f.histBlockT[h] = Math.min(65535, f.s.blockT);
    f.histFace[h] = f.s.face;
  }

  observeViewTick(f: Fighter, claimed: number) {
    if (f.bot) return;
    const sample = Math.max(0, Math.min(this.maxRewind, this.tick - claimed));
    if (f.lagTicks < 0) f.lagTicks = NOMINAL_LAG;
    f.lagTicks += sample > f.lagTicks ? Math.min(0.25, sample - f.lagTicks) : (sample - f.lagTicks) * 0.2;
  }

  private validViewTick(f: Fighter, claimed: number) {
    if (f.bot || !claimed) return this.tick;
    const allowed = Math.min(this.maxRewind, Math.ceil(Math.max(0, f.lagTicks)) + 3);
    let vt = Math.max(this.tick - allowed, Math.min(this.tick, claimed));
    if (vt < f.prevViewTick) vt = Math.min(this.tick, f.prevViewTick);
    f.prevViewTick = vt;
    return vt;
  }

  /** The defender as the attacker saw it at `tick` (position, invulnerability, guard, perfect block). */
  private seenAt(d: Fighter, tick: number) {
    if (tick < this.tick) {
      const i = ((tick % HIST) + HIST) % HIST;
      if (d.histTick[i] === tick) {
        const fl = d.histFlags[i];
        return {
          x: d.histX[i], y: d.histY[i], invuln: !!(fl & 1), blocking: !!(fl & 2), crouch: !!(fl & 4), parry: !!(fl & 8), blockT: d.histBlockT[i], face: d.histFace[i],
        };
      }
    }
    return { x: d.s.x, y: d.s.y, invuln: d.s.invuln > 0, blocking: isBlocking(d.s), crouch: !!d.s.crouch, parry: isParrying(d.s), blockT: d.s.blockT, face: d.s.face };
  }

  // ------------------------------------------------------------ combat

  private checkMelee(a: Fighter) {
    if (a.held) return;
    const m = currentMove(a.s, a.load);
    if (!m || m.arrow || !isActive(a.s, m)) return;
    const d = this.opponent(a);
    if (!d || d.s.act === Act.KO || d.lastHitSeq === a.s.moveSeq) return;
    if (m.grab) {
      this.checkThrow(a, d);
      return;
    }
    const seen = this.seenAt(d, this.validViewTick(a, a.lastCmd.viewTick));
    const box = moveBox(m, a.s.x, a.s.y, a.s.face);
    if (!overlap(box, bodyBox(seen.x, seen.y, seen.crouch)) || seen.invuln) return;
    d.lastHitSeq = a.s.moveSeq;
    // from behind: backstab weapons crit, and the assassin crits with anything; the tip of a tipCrit weapon crits
    const mc = meleeCrit(a.s, a.load, m, seen.x, seen.face);
    const base = moveDamage(a.s, a.load, m);
    let dmg = base;
    const C = classOf(a.load.cls);
    if (mc.backstab || mc.tip) dmg = Math.round(dmg * (mc.backstab ? C.backstab : 1.4));
    // out of the Grim Fog: the first blow that lands crits and reveals (a blocked swing keeps the fog)
    const veiled = a.s.veil > 0;
    if (veiled) dmg = Math.round(dmg * 3.5);
    const ix = (Math.max(box.x, seen.x - FIGHTER.w / 2) + Math.min(box.x + box.w, seen.x + FIGHTER.w / 2)) / 2;
    const iy = Math.max(box.y, seen.y - FIGHTER.h) + Math.min(box.h, FIGHTER.h) / 2;
    const landed = this.applyHit(a, d, {
      dmg, hsDmg: base, art: a.s.move === MOVE_ART, kbX: m.kbX, kbY: m.kbY, stun: m.stun, pull: !!m.pull, breaksGuard: !!m.breaksGuard, crit: mc.crit,
      w: a.load.weapons[a.s.slot], x: ix, y: iy, front: mc.front, guard: seen,
      juggle: (isAirMove(a.s.move) && a.s.move !== MOVE_AIR3) || !!m.launcher,
      lift: !!m.launcher,
    });
    if (veiled && landed) a.s.veil = 0;
    // the attacker freezes with the defender (melee hit-stop), a lunge brakes, a landed hit can be cancelled into a jump
    // or chained at once, and a plunge pogos (shared with the client's prediction); a parried swing only staggers
    if (!this.lastParry) meleeConnect(a.s, a.load, m, this.lastStop);
  }

  /**
   * A throw's grab (THROW): the thrower's move connects on a grounded, throwable opponent in front of it, in reach and level.
   * Guards do not stop it. The victim is held (frozen, invulnerable) for THROW.hold ticks and the thrower is in Act.Throw.
   */
  private checkThrow(a: Fighter, d: Fighter) {
    const seen = this.seenAt(d, this.validViewTick(a, a.lastCmd.viewTick));
    const dx = seen.x - a.s.x;
    // an EX caster's startup is armoured (exArmour in hit): a grab cannot break it either
    const exStartup = castingEx(d.s) && d.s.actT <= (SKILLS[d.load.skill]?.startup ?? 0);
    if (!a.s.ground || seen.invuln || !isThrowable(d.s) || exStartup) return;
    if (dx * a.s.face <= 0 || Math.abs(dx) > THROW.range || Math.abs(seen.y - a.s.y) >= FIGHTER.h) return;
    d.lastHitSeq = a.s.moveSeq;
    d.comboHits = 0;
    d.s.act = Act.Held;
    d.s.actT = 0;
    d.s.vx = 0;
    d.s.vy = 0;
    d.s.crouch = 0;
    d.s.blockT = 0;
    d.s.charge = 0;
    d.s.face = a.s.x < d.s.x ? -1 : 1;
    d.s.invuln = Math.max(d.s.invuln, THROW.hold + 1);
    a.s.act = Act.Throw;
    a.s.actT = 0;
    a.s.vx = 0;
    this.events.push({ t: 'throw', a: a.id, v: d.id });
  }

  /**
   * The throws in progress (after every fighter moved): a victim whose thrower lost the hold (hit, KO) is let go; a victim
   * that broke out in the tech window (stepFighter: Act.Stun) pushes the thrower back; at THROW.hold the throw lands.
   */
  private stepThrows() {
    for (const f of this.fighters.values()) {
      if (f.s.act !== Act.Held) continue;
      const a = this.opponent(f);
      if (!a || a.s.act !== Act.Throw) {
        f.s.act = Act.Free;
        f.s.actT = 0;
      }
    }
    for (const a of this.fighters.values()) {
      if (a.s.act !== Act.Throw) continue;
      const d = this.opponent(a);
      if (!d) continue;
      if (d.s.act === Act.Held) {
        if (a.s.actT === THROW.hold) this.landThrow(a, d);
      } else if (d.s.act === Act.Stun && a.s.actT <= THROW.hold) this.techThrow(a, d);
    }
  }

  /** The throw lands: the held victim takes it as a hit that knocks them down, away from the thrower (THROW). */
  private landThrow(a: Fighter, d: Fighter) {
    d.s.invuln = 0;
    this.applyHit(a, d, {
      dmg: THROW.dmg, kbX: THROW.kbX, kbY: THROW.kbY, stun: THROW.stun, crit: false, w: a.load.weapons[a.s.slot],
      x: (a.s.x + d.s.x) / 2, y: d.s.y - FIGHTER.h / 2, front: true, breaksGuard: true,
    });
    // (the thrower recovers from here: stepFighter's Act.Throw ends THROW.after ticks on)
    a.s.actT = THROW.hold + 1;
  }

  /** The victim broke the hold in the tech window (stepFighter pushed them apart): the thrower is pushed back too. */
  private techThrow(a: Fighter, d: Fighter) {
    const dir = d.s.x >= a.s.x ? 1 : -1;
    a.s.act = Act.Stun;
    a.s.actT = 0;
    a.s.stun = THROW.techStun;
    a.s.fall = 0;
    a.s.charge = 0;
    a.s.vx = -dir * THROW.techKb;
    this.events.push({ t: 'tech', a: a.id, v: d.id });
  }

  /** The attacker's damage scale: class (and hero tune), the berserker's low-health rage, Blood Frenzy. */
  private dmgScale(a: Fighter) {
    const C = heroClass(a.load);
    let k = C.dmg;
    if (C.id === ClassId.Berserker && a.s.hp < C.hp / 3) k *= 1.4 / 1.2;
    if (a.s.frenzy > 0) k *= 1.25;
    if (a.s.buff > 0) k *= 1.35;
    return k;
  }

  /** Damage dealt and taken fill both fighters' Rift gauges. */
  private gainRift(a: Fighter | undefined, d: Fighter, amt: number) {
    if (a && a.s.act !== Act.Art) a.s.rift = Math.min(RIFT.max, a.s.rift + amt * RIFT.perDealt);
    if (d.s.act !== Act.Art) d.s.rift = Math.min(RIFT.max, d.s.rift + amt * RIFT.perTaken);
  }

  /**
   * A blow the defender parried with a perfect block (PARRY): no damage. The parrier freezes, turns to the blow and its
   * window opens again (the riposte); a swing or body blow staggers its attacker (a Rift Art caught this way ends there).
   * The projectile loop reads lastParry to send a shot back or turn it aside.
   */
  private parried(a: Fighter | undefined, d: Fighter, melee: boolean, art: boolean, dirX: number, x: number, y: number) {
    const ds = d.s;
    this.lastParry = true;
    const stagger = melee && !!a && a.s.act !== Act.KO;
    // (a blow caught in the riposte of an earlier parry: the same volley or string; only the first parry of a chain pays)
    const chained = ds.act === Act.Guard && ds.charge === 1;
    this.lastParryChained = chained;
    this.events.push({ t: 'parry', a: d.id, v: stagger ? a!.id : 255, x, y, k: chained ? PARRY_KIND.chained : PARRY_KIND.perfect });
    if (ds.act !== Act.Art && !chained) ds.rift = Math.min(RIFT.max, ds.rift + RIFT.max * (art ? PARRY.artRift : PARRY.rift));
    d.comboHits = 0;
    // (judged on the perfect block as the attacker saw it: the riposte only if the guard is still up now)
    if (ds.act === Act.Guard) {
      ds.actT = 0;
      ds.charge = 1;
      ds.parryCd = 0;
      ds.face = dirX > 0 ? -1 : 1;
      ds.vx = dirX * 60;
      ds.hitstop = Math.max(ds.hitstop, PARRY.freeze);
    }
    if (!stagger) return;
    const s = a!.s;
    s.act = Act.Stun;
    s.actT = 0;
    s.stun = PARRY.stun;
    s.fall = 0;
    s.float = 0;
    s.charge = 0;
    s.confirm = 0;
    s.invuln = 0;
    s.vx = -dirX * 120;
    s.hitstop = Math.max(s.hitstop, PARRY.freeze);
  }

  private applyHit(
    a: Fighter | undefined,
    d: Fighter,
    h: {
      dmg: number; kbX: number; kbY: number; stun: number; pull?: boolean; breaksGuard?: boolean; crit: boolean; w: number; x: number; y: number; front: boolean;
      /** The defender's guard and perfect block as the attacker saw them (lag compensation; default: as they are now). */
      guard?: { blocking: boolean; blockT: number; parry?: boolean };
      /** A swing or body blow (default): parried, its attacker staggers. False for shots, blasts, strikes and traps. */
      melee?: boolean;
      /** An air string's swing (not its finisher): the one it hits floats while juggled. */
      juggle?: boolean;
      /** A launcher: the launch never knocks down (the one it pops floats instead). */
      lift?: boolean;
      /** The damage the hit-stop is sized from (default dmg): the move's own, before crits and scaling. */
      hsDmg?: number;
      /** A Rift Art hit (when unset: any w in 104..199): Art hit-stop, no combo scaling, never trips the combo break. */
      art?: boolean;
    },
  ): boolean {
    const ds = d.s;
    this.lastStop = 0;
    this.lastParry = false;
    if (d.s.act === Act.KO) return false;
    const DC = heroClass(d.load);
    const dirX = a ? (a.s.x <= ds.x ? 1 : -1) : h.x <= ds.x ? 1 : -1;
    // Bulwark: nothing gets through; a swing into it staggers the attacker
    if (ds.act === Act.Art && artIdOf(d.load) === ArtId.Bulwark) {
      if (a && h.melee !== false) {
        a.s.act = Act.Stun;
        a.s.actT = 0;
        a.s.stun = 30;
        a.s.fall = 0;
        a.s.vx = -dirX * 260;
        this.events.push({ t: 'parry', a: d.id, v: a.id, x: h.x, y: h.y, k: PARRY_KIND.bulwark });
      }
      return false;
    }
    const art = h.art ?? (h.w >= 104 && h.w < 200);
    const hsDmg = h.hsDmg ?? h.dmg;
    // a perfect block (PARRY) parries any blow, from any side: guard-breakers, unblockables, blasts, strikes and Rift Arts too
    // (judged in the defender's favour: open as the attacker saw it, or open now)
    if (h.guard?.parry || isParrying(ds)) {
      this.parried(a, d, h.melee !== false, art, dirX, h.x, h.y);
      return false;
    }
    h = { ...h, dmg: a ? Math.round(h.dmg * this.dmgScale(a)) : h.dmg };
    const guard = h.guard ?? { blocking: isBlocking(ds), blockT: ds.blockT };
    if (guard.blocking && h.front && !h.breaksGuard) {
      const crouchGuard = isCrouchGuard(ds);
      const parryWin = FIGHTER.parryWindow * (DC.id === ClassId.Shielder ? 1.6 : 1);
      // (the Shield's fresh block parries what it can block; a crouch guard or a held BLOCK guard only blocks)
      if (ds.act === Act.Block && guard.blockT <= parryWin) {
        this.events.push({ t: 'parry', a: d.id, v: h.melee === false || !a ? 255 : a.id, x: h.x, y: h.y, k: PARRY_KIND.shield });
        // a parry is worth a slice of the Rift gauge
        if (d.s.act !== Act.Art) d.s.rift = Math.min(RIFT.max, d.s.rift + RIFT.max * 0.06);
        if (h.melee === false) {
          // a parried shot flies back at whoever fired it (the projectile loop turns it around)
          this.lastParry = true;
          return false;
        }
        if (a) {
          a.s.act = Act.Stun;
          a.s.actT = 0;
          a.s.stun = FIGHTER.parryStun;
          a.s.fall = 0;
          a.s.vx = -dirX * 120;
          a.s.charge = 0;
        }
        return false;
      }
      const chip = Math.max(1, Math.round(h.dmg * FIGHTER.chip * DC.chip * (crouchGuard ? FIGHTER.guardChip : 1)));
      const hs = hitstopFor(hsDmg, false, art, true);
      this.lastStop = hs;
      ds.hitstop = Math.max(ds.hitstop, hs);
      d.comboHits = 0;
      this.gainRift(a, d, chip);
      ds.hp -= chip;
      ds.vx = dirX * FIGHTER.blockPush;
      this.events.push({ t: 'block', a: a?.id ?? 255, v: d.id, amt: chip, x: h.x, y: h.y, hs });
      if (a) {
        a.dealt += chip;
        a.roundDealt += chip;
        if (Math.abs(a.s.x - ds.x) < 60) a.s.vx = -dirX * 90;
      }
      if (ds.hp <= 0) this.knockOut(d, a);
      return false;
    }
    // the combo: a hit on a defender still in hit-stun continues it (scaled down hit by hit, Arts land in full)
    const n = ds.act === Act.Stun && d.comboHits > 0 ? d.comboHits + 1 : 1;
    if (!art) h.dmg = Math.max(1, Math.round(h.dmg * comboScale(n)));
    ds.hp -= h.dmg;
    this.gainRift(a, d, h.dmg);
    if (a) {
      a.dealt += h.dmg;
      a.roundDealt += h.dmg;
      a.hits++;
    }
    // super armour: Blood Frenzy, Piercing Fang and an EX special through its startup take the damage but never flinch
    // (nor freeze: the attacker does)
    const exArmour = castingEx(ds) && ds.actT <= (SKILLS[d.load.skill]?.startup ?? 0);
    const armour = ds.frenzy > 0 || (ds.act === Act.Attack && ds.move === MOVE_ART) || exArmour;
    const hs = hitstopFor(hsDmg, h.crit, art, false);
    this.lastStop = hs;
    if (!armour) ds.hitstop = Math.max(ds.hitstop, hs);
    this.events.push({ t: 'hit', a: a?.id ?? 255, v: d.id, amt: h.dmg, w: h.w, crit: h.crit, x: h.x, y: h.y, n, hs: armour ? 0 : hs });
    if (h.stun > 0 && !armour) {
      // knocked off the feet: a launch that is heavy (or a finisher's, or an Art's), or any hit on a fighter already
      // falling, lands in a knockdown
      const launch = h.kbY > 150;
      const fall = !h.lift && (launch && (h.kbY >= FIGHTER.knockdownKbY || h.stun >= FIGHTER.knockdownStun || art)) || (!!ds.fall && !ds.ground);
      ds.act = Act.Stun;
      ds.actT = 0;
      ds.stun = h.stun;
      ds.fall = fall ? 1 : 0;
      ds.float = h.juggle && !fall ? h.stun + 8 : 0;
      ds.charge = 0;
      ds.blockT = 0;
      const push = h.pull && a ? -dirX : dirX;
      // a heavy hero is thrown less far, a light one further
      const wt = DC.weight ?? 1;
      ds.vx = push * h.kbX * wt * (h.juggle ? FIGHTER.juggleCarry : 1);
      if (h.pull && a) {
        // the hook lands them in front of the reaper, not behind
        const want = a.s.x + a.s.face * 34;
        ds.vx = (want - ds.x) * 6;
      }
      if (h.kbY > 0) {
        ds.vy = -h.kbY * (wt < 1 ? 0.5 + wt * 0.5 : wt);
        if (launch) ds.ground = 0;
      }
      ds.face = a ? (a.s.x < ds.x ? -1 : 1) : ds.face;
    }
    d.comboHits = ds.act === Act.Stun ? n : 0;
    // the anti-infinite: the comboBreak-th hit makes the defender untouchable for a moment (Rift Art hits never trip it:
    // the flurry is meant to land in full)
    if (!art && d.comboHits >= FIGHTER.comboBreak) {
      ds.invuln = Math.max(ds.invuln, FIGHTER.breakInvuln);
      d.comboHits = 0;
    }
    if (ds.hp <= 0) this.knockOut(d, a);
    return true;
  }

  /**
   * The beaten fighter is thrown back away from the attacker (at least KO_LAUNCH.vx, replacing the blow's push), so the body
   * flies, lands and lies there in Act.KO. In training nobody is K.O.'d: health floors at 1.
   */
  private knockOut(d: Fighter, a: Fighter | undefined) {
    if (this.phase !== 'fight' || this.settings.training) {
      d.s.hp = Math.max(1, d.s.hp);
      return;
    }
    d.s.hp = 0;
    d.s.act = Act.KO;
    d.s.actT = 0;
    const away = a && a.s.x !== d.s.x ? (d.s.x > a.s.x ? 1 : -1) : a ? -a.s.face : -d.s.face;
    d.s.vx = away * Math.max(KO_LAUNCH.vx, Math.abs(d.s.vx));
    d.s.vy = Math.min(d.s.vy, KO_LAUNCH.vy);
    d.s.ground = 0;
    this.events.push({ t: 'ko', v: d.id, a: a?.id ?? 255 });
    this.endRound(a ? a.seat : d.seat ^ 1, 0);
  }

  // ------------------------------------------------------------ skills and projectiles

  private spawnFrom(f: Fighter) {
    const s = f.s;
    if (!s.spawn) return;
    s.spawn = 0;
    if (s.act === Act.Attack) {
      const m = currentMove(s, f.load);
      const w = WEAPONS[f.load.weapons[s.slot]];
      if (m?.crescent) {
        // the Sun Crescent: the cleave's arc flies on, low and level, for a mid-range distance (CRESCENT)
        this.projectiles.push({
          id: this.nextId++ % 65536, kind: 'wave', owner: f.id, x: s.x + s.face * CRESCENT.ahead, y: s.y - 30, vx: s.face * CRESCENT.speed, vy: 0,
          dmg: moveDamage(s, f.load, m), kb: m.kbX, kbY: m.kbY, stun: m.stun, life: CRESCENT.life, heavy: false,
        });
        this.events.push({ t: 'shoot', p: f.id, kind: SHOOT_CRESCENT });
        return;
      }
      if (!m || !m.arrow || !w.arrowSpeed) return;
      const heavy = s.move === MOVE_CHARGED;
      const C = heroClass(f.load);
      if (m.gate) {
        // the Gate of Treasures: portals open behind and above the hero and fire blades at the opponent, staggered;
        // held, more gates open (2 blades at the threshold, up to 9 at a full hold)
        const c = w.charged;
        const k = heavy && c ? Math.max(0, Math.min(1, (s.charge - c.min) / Math.max(1, c.max - c.min))) : 0;
        const n = heavy ? 2 + Math.round(7 * k) : m.blades ?? 1;
        const o = this.opponent(f);
        const per = Math.round(moveDamage(s, f.load, m) / n);
        for (let i = 0; i < n; i++) {
          const last = i === n - 1;
          const [px, py] = gatePortal(i, s.x, s.y, s.face);
          const tx = o ? o.s.x : s.x + s.face * 400;
          const ty = o ? o.s.y - 26 : s.y - 26;
          const d = Math.hypot(tx - px, ty - py) || 1;
          const sp = w.arrowSpeed * (heavy ? 1.15 : 1);
          this.projectiles.push({
            id: this.nextId++ % 65536, kind: 'relic', owner: f.id, x: px, y: py, vx: ((tx - px) / d) * sp, vy: ((ty - py) / d) * sp,
            dmg: per, kb: last ? m.kbX : 40, kbY: last ? m.kbY : 0, stun: last ? m.stun : 8, life: Math.round(0.9 * TICK_RATE), heavy: heavy && last, gravity: 0, wait: i * 3,
          });
        }
        this.events.push({ t: 'shoot', p: f.id, kind: 7 });
        return;
      }
      if (m.arcane) {
        // the staff: a quick bolt, or held, a slow orb that bursts
        this.projectiles.push({
          id: this.nextId++ % 65536, kind: heavy ? 'orb' : 'arcane', owner: f.id, x: s.x + s.face * 20, y: s.y - 38, vx: s.face * (heavy ? 380 : w.arrowSpeed), vy: 0,
          dmg: moveDamage(s, f.load, m), kb: m.kbX, stun: m.stun, life: Math.round((heavy ? 2 : 0.85) * TICK_RATE), heavy, slow: m.slow,
        });
        this.events.push({ t: 'shoot', p: f.id, kind: heavy ? 5 : 4 });
        return;
      }
      const speed = w.arrowSpeed * (heavy ? 1.3 : 1) * C.arrowSpeed;
      this.projectiles.push({
        id: this.nextId++ % 65536, kind: 'arrow', owner: f.id, x: s.x + s.face * 18, y: s.y - 40, vx: s.face * speed, vy: heavy ? -20 : -60,
        dmg: moveDamage(s, f.load, m), kb: m.kbX, stun: m.stun, life: Math.round(1.6 * C.arrowSpeed * TICK_RATE), heavy,
      });
      this.events.push({ t: 'shoot', p: f.id, kind: 0 });
      return;
    }
    if (s.act !== Act.Skill) return;
    this.useSkill(f);
  }

  /** A hero's signature special goes off (the end of its startup). */
  private useSkill(f: Fighter) {
    const s = f.s;
    const sk = SKILLS[f.load.skill];
    if (!sk) return;
    this.events.push({ t: 'shoot', p: f.id, kind: SKILL_EVENT + sk.id });
    // (an EX cast: its hits deal the EX multiple of the table's damage, and its shots are tinted)
    const ex = castingEx(s);
    if (sk.kind === 'shot') {
      const n = sk.count ?? 1;
      const speed = sk.speed ?? 900;
      for (let i = 0; i < n; i++) {
        // fanned around straight ahead (a little upward for lobs)
        const a = (i - (n - 1) / 2) * (sk.spread ?? 0) - (sk.gravity ? 0.18 : 0);
        this.projectiles.push({
          id: this.nextId++ % 65536, kind: sk.proj ?? 'arrow', owner: f.id, x: s.x + s.face * 20, y: s.y - (sk.launchY ?? 40),
          vx: s.face * speed * Math.cos(a), vy: speed * Math.sin(a), dmg: exDamage(s, sk.dmg), kb: sk.kb, kbY: sk.kbY, stun: sk.stun,
          life: sk.life ?? 60, heavy: false, skin: sk.id + 1, slow: sk.slow, root: sk.root, burn: sk.burn, pierce: sk.pierce,
          unblockable: sk.unblockable, gravity: sk.gravity, boomerang: sk.boomerang ? Math.round((sk.life ?? 60) / 2) : undefined,
          ex,
        });
      }
    } else if (sk.kind === 'aura') {
      // a burst around the hero: everyone close is hit and thrown away from them
      const R = sk.radius ?? 90;
      for (const o of this.fighters.values()) {
        if (o.id === f.id || o.s.act === Act.KO || o.s.invuln > 0) continue;
        const dx = o.s.x - s.x;
        const dy = o.s.y - s.y;
        if (dx * dx + dy * dy > R * R) continue;
        const landed = this.applyHit(f, o, {
          dmg: exDamage(s, sk.dmg), kbX: sk.kb, kbY: sk.kbY ?? 120, stun: sk.stun, crit: false, w: SKILL_WEAPON, x: o.s.x, y: o.s.y - FIGHTER.h / 2,
          front: true, melee: false, breaksGuard: true,
        });
        if (landed && sk.slow) o.s.slowT = Math.max(o.s.slowT, sk.slow);
      }
    } else {
      f.skillHit = false;
    }
  }

  /** A dash special's body hits the opponent once while it is active. */
  private checkSkillDash(f: Fighter) {
    const s = f.s;
    if (s.act !== Act.Skill || f.skillHit || f.held) return;
    const sk = SKILLS[f.load.skill];
    if (!sk || sk.kind !== 'dash' || s.actT < sk.startup || s.actT >= sk.startup + (sk.active ?? 0)) return;
    const o = this.opponent(f);
    if (!o || o.s.act === Act.KO || o.s.invuln > 0) return;
    const hb = bodyBox(s.x + s.face * 14, s.y);
    hb.w += 18;
    if (!overlap(hb, bodyBox(o.s.x, o.s.y, !!o.s.crouch))) return;
    f.skillHit = true;
    const front = (o.s.face > 0) !== (s.x > o.s.x);
    this.applyHit(f, o, {
      dmg: exDamage(s, sk.dmg), kbX: sk.kb, kbY: sk.kbY ?? 160, stun: sk.stun, crit: true, w: SKILL_WEAPON, x: o.s.x, y: o.s.y - FIGHTER.h / 2,
      front, melee: true, breaksGuard: !!sk.unblockable,
    });
  }

  private stepProjectiles() {
    const A = this.arena;
    const out: Projectile[] = [];
    for (const p of this.projectiles) {
      if (p.wait && p.wait > 0) {
        p.wait--;
        out.push(p);
        continue;
      }
      const g = p.gravity ?? (p.kind === 'bomb' ? SKILL_FX.bomb.gravity : p.kind === 'arrow' ? (p.heavy ? 120 : 330) : 0);
      // a thrown shield turns back once, halfway through its flight
      if (p.boomerang && p.life === p.boomerang) {
        p.vx = -p.vx;
        p.boomerang = 0;
      }
      p.vy += g * DT;
      const px = p.x;
      const py = p.y;
      p.x += p.vx * DT;
      p.y += p.vy * DT;
      p.life--;
      let dead = p.life <= 0;
      // a melee swing cuts it out of the air
      if (!dead && this.deflected(p, px, py)) dead = true;
      // hit a fighter (not its owner)
      for (const f of this.fighters.values()) {
        const bulwark = f.s.act === Act.Art && artIdOf(f.load) === ArtId.Bulwark;
        // the Phantom Hand grasps: a dodge roll does not slip past it (only a real barrier or an Art's invulnerability does)
        const grasp = p.kind === 'hand' && f.s.act === Act.Roll;
        if (dead || f.id === p.owner || f.s.act === Act.KO || (f.s.invuln > 0 && !bulwark && !grasp)) continue;
        // (a crouch guard catches shots on the guard rather than ducking them)
        const bb = bodyBox(f.s.x, f.s.y, !!f.s.crouch && !isCrouchGuard(f.s));
        if (p.dmg <= 0 && p.kind === 'steed') continue;
        const r = p.kind === 'wave' || p.kind === 'steed' ? 32 : p.kind === 'orb' ? 9 : p.kind === 'hand' ? 22 : 4;
        // the hand reaches up as it passes: a fighter jumping over it is snatched out of the air
        const reach = p.kind === 'hand' ? 90 : 0;
        const pb = { x: Math.min(px, p.x) - 4, y: Math.min(py, p.y) - r - reach, w: Math.abs(p.x - px) + 8, h: Math.abs(p.y - py) + r * 2 + reach };
        if (!overlap(bb, pb)) continue;
        const owner = this.fighters.get(p.owner);
        // Bulwark sends projectiles back at whoever threw them
        if (bulwark) {
          p.owner = f.id;
          p.vx = -p.vx * 1.1;
          p.vy = -Math.abs(p.vy); // back along its own arc
          p.life = Math.max(p.life, 60);
          this.events.push({ t: 'block', a: owner?.id ?? 255, v: f.id, amt: 0, x: p.x, y: p.y, hs: 0 });
          continue;
        }
        if (p.kind === 'bomb' || p.kind === 'orb') {
          this.explode(p, owner);
        } else {
          const front = (p.vx < 0) === (f.s.face > 0);
          const guardOk = isBlocking(f.s) && front;
          // (the Sun Crescent, a wave that is not the Art's, cuts like the sword it came from)
          const w = p.kind === 'arrow' ? WeaponId.Bow : p.kind === 'arcane' ? WeaponId.Staff : p.kind === 'wave' && !p.art ? WeaponId.Sword : p.kind === 'wave' || p.kind === 'relic' || p.kind === 'hand' || p.kind === 'steed' ? 106 : 101;
          const kbY = p.kbY ?? (p.kind === 'wave' || p.kind === 'steed' ? 280 : p.kind === 'hand' ? 0 : p.heavy ? 160 : 40);
          const landed = this.applyHit(owner, f, { dmg: p.dmg, kbX: p.kb, kbY, stun: p.stun, crit: p.heavy, w, x: p.x, y: p.y, front, melee: false, breaksGuard: !!p.unblockable, art: !!p.art });
          if (this.lastParry) {
            // parried: a shot a guard could stop flies back the way it came, now the parrier's; anything else is turned aside
            if (!p.art && !p.pierce && !p.unblockable && !this.lastParryChained) {
              this.reflect(p, f);
              continue;
            }
            dead = true;
            continue;
          }
          // the Phantom Hand crushes the heart it grasps and feeds its master
          if (landed && p.kind === 'hand' && !p.skin && owner && owner.s.act !== Act.KO) owner.s.hp = Math.min(heroClass(owner.load).hp, owner.s.hp + Math.round(p.dmg * 0.5));
          if (p.burn && (landed || p.kind === 'steed')) f.s.burnT = Math.max(f.s.burnT, p.burn);
          if (p.pierce) {
            // trampled once: keeps running, harmless now
            p.dmg = 0;
            p.pierce = false;
            p.owner = f.id;
            continue;
          }
          if (p.kind === 'frost' && !guardOk) f.s.slowT = SKILL_FX.frost.slowTicks;
          if (landed && p.slow) f.s.slowT = Math.max(f.s.slowT, p.slow);
          if (landed && p.root) f.s.rootT = Math.max(f.s.rootT, p.root);
        }
        dead = true;
      }
      // (Vault of Ages relics fly out of portals anywhere, through floors and walls)
      if (!dead && !(p.kind === 'relic' && p.art)) {
        // bombs and orbs land on ledges; arrows, bolts and waves fly through one-way platforms
        const lands = p.kind === 'bomb' || p.kind === 'orb';
        const floorHit = p.y >= (lands ? surfaceBelow(A, p.x, py) : solidBelow(A, p.x, py)) && p.vy >= 0;
        const wallHit = solidAt(A, p.x, p.y) && p.y < A.floor;
        // the bridges and ledges are solid stone to a thrown blade, an arrow or a bolt (fighters jump up through them; shots
        // do not pass through them from either side; a Rift Art's rain and swarm still come down through everything)
        const thin = !p.art && (p.kind === 'relic' || p.kind === 'arrow' || p.kind === 'arcane' || p.kind === 'frost');
        if (thin && throughPlatform(A, px, py, p.x, p.y)) dead = true;
        else if (floorHit || wallHit || p.y > A.floor) {
          if (p.kind === 'bomb' || p.kind === 'orb') {
            p.y = Math.min(p.y, surfaceBelow(A, p.x, py));
            this.explode(p, this.fighters.get(p.owner));
          }
          // the light wave, the hand and the steed run along the floor; only walls stop them
          if ((p.kind === 'wave' || p.kind === 'hand' || p.kind === 'steed') && !wallHit) {
            p.y = Math.min(p.y, solidBelow(A, p.x, py) - (p.kind === 'hand' ? 14 : 30));
            p.vy = 0;
            out.push(p);
            continue;
          }
          dead = true;
        }
      }
      if (!dead) out.push(p);
    }
    this.projectiles = out;
  }

  private explode(p: Projectile, owner: Fighter | undefined) {
    const B = SKILL_FX.bomb;
    const orb = p.kind === 'orb';
    this.events.push({ t: 'boom', x: p.x, y: p.y });
    for (const f of this.fighters.values()) {
      if (f.id === p.owner || f.s.act === Act.KO || f.s.invuln > 0) continue;
      const dx = f.s.x - p.x;
      const dy = f.s.y - FIGHTER.h / 2 - p.y;
      const R = orb ? 62 : B.radius;
      if (dx * dx + dy * dy > (R + 14) ** 2) continue;
      const landed = this.applyHit(owner, f, { dmg: orb ? p.dmg : B.dmg, kbX: 240, kbY: 260, stun: orb ? p.stun : 26, crit: false, w: orb ? WeaponId.Staff : 100, x: f.s.x, y: f.s.y - FIGHTER.h / 2, front: false, melee: false });
      if (!orb && !this.lastParry) f.s.burnT = Math.max(f.s.burnT, B.burnTicks);
      if (landed && p.slow) f.s.slowT = Math.max(f.s.slowT, p.slow);
    }
  }

  // ------------------------------------------------------------ Rift Arts

  private stepArts(paused: boolean) {
    for (const f of this.fighters.values()) {
      const s = f.s;
      // (a frozen caster's timeline waits: the superpause before the Art, or a hit-stop during it)
      if (s.act !== Act.Art || f.held) continue;
      const C = heroClass(f.load);
      const o = this.opponent(f);
      const t = s.actT;
      switch (artIdOf(f.load)) {
        case ArtId.RadiantCleave:
          if (t === 18) {
            this.projectiles.push({ id: this.nextId++ % 65536, kind: 'wave', owner: f.id, x: s.x + s.face * 30, y: s.y - 30, vx: s.face * 720, vy: 0, dmg: 200, kb: 380, stun: 42, life: Math.round(1.4 * TICK_RATE), heavy: true, art: true });
            this.events.push({ t: 'shoot', p: f.id, kind: 6 });
          }
          break;
        case ArtId.HailOfArrows:
          if (t === 12) {
            const cx = o ? o.s.x : s.x + s.face * 200;
            const top = (o ? o.s.y : s.y) - 440;
            for (let i = 0; i < 11; i++) {
              const x = cx + (i - 5) * 9 + (((i * 37) % 7) - 3);
              this.projectiles.push({ id: this.nextId++ % 65536, kind: 'arrow', owner: f.id, x, y: top - (i % 3) * 30, vx: ((i % 2) * 2 - 1) * 16, vy: 980, dmg: 40, kb: 30, stun: 10, life: 90, heavy: false, wait: i * 3, art: true });
            }
            this.events.push({ t: 'shoot', p: f.id, kind: 0 });
          }
          break;
        case ArtId.ThunderCall:
          if (t === 10) for (let k = 0; k < 3; k++) this.strikes.push({ id: this.nextId++ % 65536, owner: f.id, x: o ? o.s.x : s.x, y: o ? o.s.y : s.y, at: this.tick + 26 + k * 24, aimed: false, kind: 0 });
          break;
        case ArtId.ChainsOfGenesis:
          if (t === 8) this.strikes.push({ id: this.nextId++ % 65536, owner: f.id, x: o ? o.s.x : s.x, y: o ? o.s.y : s.y, at: this.tick + 22, aimed: false, kind: 1 });
          break;
        case ArtId.VaultOfAges: {
          // the Gate opens all around the opponent: portals above, beside and (in the air) below fire relics inward, one
          // every 3 ticks, then a ring of heavy spears fires at once from every side
          if (!o || o.s.act === Act.KO) break;
          const air = !o.s.ground;
          const fire = (deg: number, r: number, sp: number, dmg: number, heavy: boolean) => {
            const tx = o.s.x;
            const ty = o.s.y - 26;
            const a = (deg * Math.PI) / 180;
            const px = tx + Math.cos(a) * r;
            const py = ty + Math.sin(a) * r;
            this.projectiles.push({
              id: this.nextId++ % 65536, kind: 'relic', owner: f.id, x: px, y: py, vx: -Math.cos(a) * sp, vy: -Math.sin(a) * sp,
              dmg, kb: heavy ? 300 : 20, kbY: heavy ? 320 : 0, stun: heavy ? 40 : 12, life: Math.round(((r * 2) / sp) * TICK_RATE), heavy, gravity: 0, art: true,
            });
          };
          if (t >= 8 && t <= 38 && (t - 8) % 3 === 0) {
            const k = (t - 8) / 3;
            fire((air ? VAULT_AIR : VAULT_GROUND)[k], 200, 900, 22, false);
            this.events.push({ t: 'shoot', p: f.id, kind: 7 });
          }
          if (t === 44) {
            for (let i = 0; i < 6; i++) fire((air ? 30 : -15) + i * (air ? 60 : -30), 230, 1000, 24, true);
            this.events.push({ t: 'shoot', p: f.id, kind: 7 });
          }
          break;
        }
        case ArtId.PhantomHand:
          if (t === 12) {
            this.projectiles.push({ id: this.nextId++ % 65536, kind: 'hand', owner: f.id, x: s.x + s.face * 24, y: s.y - 14, vx: s.face * 1050, vy: 0, dmg: 260, kb: 0, stun: 72, life: Math.round(0.8 * TICK_RATE), heavy: true, unblockable: true, art: true });
            this.events.push({ t: 'shoot', p: f.id, kind: 8 });
          }
          break;
        case ArtId.Stampede:
          if (t === 14) {
            this.projectiles.push({ id: this.nextId++ % 65536, kind: 'steed', owner: f.id, x: s.x - s.face * 80, y: s.y - 30, vx: s.face * 900, vy: 0, dmg: 170, kb: 420, stun: 40, life: Math.round(2 * TICK_RATE), heavy: true, pierce: true, burn: 150, unblockable: true, art: true });
            this.events.push({ t: 'shoot', p: f.id, kind: 9 });
          }
          break;
        case ArtId.NightHunt:
          // (the leap itself, at tick 6, is stepFighter's: the client predicts it too)
          if (t > 10 && s.ground && !s.charge) {
            s.charge = 1;
            this.events.push({ t: 'boom', x: s.x, y: s.y });
            if (o && o.s.act !== Act.KO && o.s.invuln <= 0 && Math.abs(o.s.x - s.x) < 85 && Math.abs(o.s.y - s.y) < 70) {
              this.applyHit(f, o, { dmg: 165, kbX: 300, kbY: 360, stun: 38, crit: false, w: 106, x: o.s.x, y: o.s.y - 26, front: false, breaksGuard: true });
            }
            s.actT = Math.max(s.actT, 36);
          }
          break;
        case ArtId.BloodFrenzy:
          // the roar knocks everyone close away
          if (t === 12 && o && o.s.act !== Act.KO && o.s.invuln <= 0 && Math.abs(o.s.x - s.x) < 110 && Math.abs(o.s.y - s.y) < 80) {
            this.applyHit(f, o, { dmg: 50, kbX: 380, kbY: 200, stun: 20, crit: false, w: 106, x: o.s.x, y: o.s.y - 26, front: false, breaksGuard: true, melee: false });
          }
          break;
        case ArtId.FlashStep: {
          if (!o || o.s.act === Act.KO) break;
          // (the blink and the flurry's steps behind the opponent are stepFighter's, so prediction runs them too)
          if (t === 8) this.events.push({ t: 'blink', p: f.id, x0: f.blinkFrom, x1: s.x, y: s.y });
          if (t >= 14 && t <= 44 && (t - 14) % 6 === 0) {
            const k = (t - 14) / 6;
            const last = k === 5;
            if (Math.abs(o.s.x - s.x) < 60 && Math.abs(o.s.y - s.y) < 60 && o.s.invuln <= 0) {
              const dmg = Math.round((last ? 32 : 15) * C.backstab);
              this.applyHit(f, o, { dmg, kbX: last ? 340 : 20, kbY: last ? 280 : 0, stun: last ? 36 : 14, crit: true, w: 104, x: o.s.x, y: o.s.y - 28, front: false, breaksGuard: true });
              if (!this.lastParry) s.confirm = PHYS.confirmTicks;
            }
          }
          break;
        }
      }
    }
    // Thunder Call: each strike locks on 20 ticks before it lands, then hits whoever stands under it (a superpause holds
    // them where they are in their countdown)
    if (paused) {
      for (const st of this.strikes) st.at++;
      return;
    }
    for (const st of [...this.strikes]) {
      if (!this.strikes.includes(st)) continue; // (a KO ended the round and cleared them)
      const owner = this.fighters.get(st.owner);
      const o = owner ? this.opponent(owner) : undefined;
      if (!st.aimed && this.tick >= st.at - 20) {
        st.aimed = true;
        if (o) {
          st.x = o.s.x;
          st.y = surfaceBelow(this.arena, o.s.x, o.s.y - 2);
        }
      }
      if (this.tick < st.at) continue;
      this.strikes.splice(this.strikes.indexOf(st), 1);
      this.events.push({ t: 'strike', x: st.x, y: st.y, kind: st.kind });
      if (o && o.s.act !== Act.KO && o.s.invuln <= 0 && Math.abs(o.s.x - st.x) < 36 && o.s.y > st.y - 130 && o.s.y <= st.y + 4) {
        if (st.kind === 1) {
          // the chains bind: rooted where they stand
          this.applyHit(owner, o, { dmg: 120, kbX: 0, kbY: 0, stun: 24, crit: false, w: 107, x: st.x, y: o.s.y - 30, front: false, melee: false, breaksGuard: true });
          if (!this.lastParry) {
            o.s.rootT = Math.max(o.s.rootT, 110);
            o.s.vx = 0;
          }
        } else {
          this.applyHit(owner, o, { dmg: 105, kbX: 80, kbY: 320, stun: 30, crit: false, w: 105, x: st.x, y: o.s.y - 30, front: false, melee: false, breaksGuard: true });
        }
      }
    }
  }

  private stepTraps() {
    const T = SKILL_FX.trap;
    this.traps = this.traps.filter((t) => {
      if (this.tick >= t.until) return false;
      if (this.tick < t.armAt) return true;
      for (const f of this.fighters.values()) {
        if (f.id === t.owner || f.s.act === Act.KO || !f.s.ground || f.s.invuln > 0) continue;
        if (Math.abs(f.s.x - t.x) < T.w / 2 + FIGHTER.w / 2 - 4 && Math.abs(f.s.y - t.y) < 4) {
          this.applyHit(this.fighters.get(t.owner), f, { dmg: T.dmg, kbX: 0, kbY: 0, stun: 12, crit: false, w: 102, x: t.x, y: t.y - 10, front: false, melee: false });
          if (!this.lastParry) {
            f.s.rootT = T.root;
            f.s.vx = 0;
          }
          this.events.push({ t: 'trap', v: f.id, x: t.x, y: t.y });
          return false;
        }
      }
      return true;
    });
  }

  private stepStatus() {
    const B = SKILL_FX.bomb;
    for (const f of this.fighters.values()) {
      if (f.s.burnT <= 0) continue;
      f.s.burnT--;
      if (f.s.burnT % 15 === 0 && f.s.act !== Act.KO) {
        const amt = Math.round(B.burnDps / 4);
        f.s.hp -= amt;
        const owner = this.opponent(f);
        if (owner) (owner.dealt += amt), (owner.roundDealt += amt);
        this.events.push({ t: 'hit', a: owner?.id ?? 255, v: f.id, amt, w: 200, crit: false, x: f.s.x, y: f.s.y - FIGHTER.h * 0.6, n: 0, hs: 0 });
        if (f.s.hp <= 0) this.knockOut(f, owner);
      }
    }
  }

  // ------------------------------------------------------------ rounds

  /**
   * Training and the infinite Rift gauge. A combo is over once its defender is out of hit-stun (comboHits stays set until
   * the next hit); TRAINING.refillTicks later that fighter's health and flasks are restored and the combo is closed. A new
   * hit in hit-stun in the meantime cancels the countdown. Frozen while the world is.
   */
  private stepTraining(paused: boolean) {
    for (const f of this.fighters.values()) {
      if (this.settings.infiniteRift) f.s.rift = RIFT.max;
      if (!this.settings.training || paused) continue;
      if (!(f.comboHits > 0 && f.s.act !== Act.Stun)) {
        f.refillT = -1;
        continue;
      }
      if (f.refillT < 0) f.refillT = TRAINING.refillTicks;
      if (--f.refillT > 0) continue;
      f.s.hp = heroClass(f.load).hp;
      f.s.flask = FIGHTER.flasks;
      f.comboHits = 0;
      f.refillT = -1;
    }
  }

  private stepRound(paused: boolean) {
    if (this.phase === 'fight') {
      // a solo warm-up (one seat empty) has no clock; a superpause stops it; training has no clock
      if (this.seats[0] >= 0 && this.seats[1] >= 0 && !paused && !this.settings.training) this.timeLeft = Math.max(0, this.timeLeft - DT);
      if (this.timeLeft <= 0) {
        const a = this.fighters.get(this.seats[0]);
        const b = this.fighters.get(this.seats[1]);
        const ha = a ? a.s.hp : 0;
        const hb = b ? b.s.hp : 0;
        // time-out: more health wins; equal health goes to whoever dealt more this round; a true tie is a draw
        let win = ha === hb ? 255 : ha > hb ? 0 : 1;
        if (win === 255 && a && b && a.roundDealt !== b.roundDealt) win = a.roundDealt > b.roundDealt ? 0 : 1;
        this.endRound(win, 1);
      }
    } else if (this.phase === 'ko' && this.tick >= this.phaseEnd) {
      const best = Math.max(this.wins[0], this.wins[1]);
      if (best >= this.settings.wins) {
        this.phase = 'over';
        // (both reaching it on a drawn round: total damage decides)
        const da = this.fighters.get(this.seats[0])?.dealt ?? 0;
        const db = this.fighters.get(this.seats[1])?.dealt ?? 0;
        this.winner = this.wins[0] !== this.wins[1] ? (this.wins[0] > this.wins[1] ? 0 : 1) : da >= db ? 0 : 1;
        this.events.push({ t: 'match', winner: this.winner });
        const w = this.fighters.get(this.seats[this.winner]);
        if (w && w.s.act !== Act.KO) {
          w.s.act = Act.Win;
          w.s.actT = 0;
        }
      } else {
        this.round++;
        this.resetRound();
      }
    }
  }

  private endRound(winner: number, why: number) {
    if (this.phase !== 'fight') return;
    this.phase = 'ko';
    this.phaseEnd = this.tick + ROUND.koTicks;
    if (winner !== 0 && winner !== 1) {
      // a draw scores for both (a match can never stall on endless draws)
      this.wins[0]++;
      this.wins[1]++;
    } else {
      this.wins[winner]++;
      const w = this.fighters.get(this.seats[winner]);
      if (w) w.roundsWon++;
    }
    for (const f of this.fighters.values()) {
      f.s.lock = ROUND.koTicks;
      if (f.seat === winner && f.s.act !== Act.KO) {
        f.s.act = Act.Win;
        f.s.actT = 0;
      }
    }
    this.projectiles = [];
    this.strikes = [];
    this.events.push({ t: 'round', winner: winner === 0 || winner === 1 ? winner : 255, why });
  }

  /** A fighter left for good: the other seat wins the match. */
  forfeit(seat: number) {
    if (this.phase === 'over') return;
    const other = seat ^ 1;
    this.wins[other] = Math.max(this.wins[other], this.settings.wins);
    this.phase = 'over';
    this.winner = other;
    this.events.push({ t: 'match', winner: other });
  }

  /** Copy of a fighter's state (tests / bots). */
  snapshotOf(id: number) {
    const f = this.fighters.get(id);
    return f ? copyState(f.s) : null;
  }
}

/** Buttons that count as "attack" for bots and tests. */
export const ATTACK_BUTTONS = Btn.A | Btn.B;
