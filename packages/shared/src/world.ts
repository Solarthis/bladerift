/**
 * The authoritative duel: two fighter seats, rounds, hits (with bounded lag compensation), projectiles, traps and
 * status effects. Runs on the server and, for practice / same-device play, inside the browser.
 */
import { ArenaDef, getArena } from './arena';
import { DT, FIGHTER, ROUND, TICK_RATE } from './constants';
import {
  Act, copyState, currentMove, FighterState, isActive, isBlocking, moveDamage, MOVE_CHARGED, newFighterState, stepFighter, surfaceBelow,
} from './fighter';
import { Btn, emptyInput, InputCmd } from './input';
import { Box, Loadout, Move, SKILL_FX, SkillId, WEAPONS, WeaponId } from './weapons';

export interface MatchSettings {
  arenaId: string;
  /** Round wins needed (1..3). */
  wins: number;
  /** Round length in seconds. */
  roundTime: number;
}

export const DEFAULT_SETTINGS: MatchSettings = { arenaId: 'bridge', wins: ROUND.defaultWins, roundTime: ROUND.defaultTime };

export type Phase = 'intro' | 'fight' | 'ko' | 'over';
export const PHASES: Phase[] = ['intro', 'fight', 'ko', 'over'];

export type ProjKind = 'arrow' | 'bomb' | 'frost';
export const PROJ_KINDS: ProjKind[] = ['arrow', 'bomb', 'frost'];

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
  /** v was hit by a for amt; w = weapon id (or 100 + skill / 200 burn); crit; x,y = impact point. */
  | { t: 'hit'; a: number; v: number; amt: number; w: number; crit: boolean; x: number; y: number }
  | { t: 'block'; a: number; v: number; amt: number; x: number; y: number }
  | { t: 'parry'; a: number; v: number; x: number; y: number }
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
  | { t: 'match'; winner: number };

export interface Fighter {
  id: number;
  seat: number;
  name: string;
  bot: boolean;
  s: FighterState;
  load: Loadout;
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
  comboHits: number;
  comboAt: number;
  // stats
  dealt: number;
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

const overlap = (a: Box, b: Box) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

export function bodyBox(x: number, y: number): Box {
  return { x: x - FIGHTER.w / 2, y: y - FIGHTER.h, w: FIGHTER.w, h: FIGHTER.h };
}

/** The world-space hit box of a move for a fighter at (x, y) facing `face`. */
export function moveBox(m: Move, x: number, y: number, face: number): Box {
  const bx = face > 0 ? x + m.box.x : x - m.box.x - m.box.w;
  return { x: bx, y: y + m.box.y, w: m.box.w, h: m.box.h };
}

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
  traps: Trap[] = [];
  events: GameEvent[] = [];
  winner = -1;
  maxRewind = MAX_REWIND;
  private nextId = 1;

  constructor(readonly settings: MatchSettings) {
    this.arena = getArena(settings.arenaId);
    this.timeLeft = settings.roundTime;
  }

  /** Seat a fighter (seat 0 = left spawn). */
  addFighter(id: number, seat: number, name: string, load: Loadout, bot = false): Fighter {
    const sx = this.arena.spawns[seat] ?? this.arena.w / 2;
    const f: Fighter = {
      id, seat, name, bot, load,
      s: newFighterState(sx, this.arena.floor, seat === 0 ? 1 : -1),
      inputs: [], lastSeq: 0, lastCmd: emptyInput(), starved: STALE_TICKS + 1, deepTicks: 0, cushion: CUSHION_START, lateAt: 0, credit: 0,
      owed: 0, carry: 0, lagTicks: -1, prevViewTick: 0,
      histTick: new Int32Array(HIST).fill(-1), histX: new Float32Array(HIST), histY: new Float32Array(HIST), histFlags: new Uint8Array(HIST),
      histBlockT: new Uint16Array(HIST), histFace: new Int8Array(HIST),
      lastHitSeq: -1, comboHits: 0, comboAt: -999, dealt: 0, hits: 0, roundsWon: 0,
    };
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

  /** Begin the first round (call once both seats are filled, or for a solo warm-up). */
  start() {
    this.resetRound();
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
    for (const f of this.fighters.values()) {
      const seq = f.s.moveSeq;
      const prevBtn = f.s.prevBtn;
      f.s = newFighterState(this.arena.spawns[f.seat], this.arena.floor, f.seat === 0 ? 1 : -1);
      f.s.moveSeq = seq;
      f.s.prevBtn = prevBtn;
      f.s.lock = ROUND.introTicks;
      f.lastHitSeq = -1;
      f.comboHits = 0;
    }
  }

  step() {
    this.tick++;
    if (this.phase === 'intro' && this.tick >= this.phaseEnd) {
      this.phase = 'fight';
      this.events.push({ t: 'fight', round: this.round });
    }
    for (const f of this.fighters.values()) this.runCommands(f);
    if (this.phase === 'over') return;
    for (const f of this.fighters.values()) this.spawnFrom(f);
    for (const f of this.fighters.values()) this.checkMelee(f);
    this.stepProjectiles();
    this.stepTraps();
    this.stepStatus();
    this.stepRound();
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
    const hpBefore = s.hp;
    stepFighter(s, cmd, this.arena, f.load);
    if (s.act === Act.Roll && before !== Act.Roll) this.events.push({ t: 'roll', p: f.id });
    if (s.act === Act.Heal && before !== Act.Heal) this.events.push({ t: 'heal', p: f.id });
    if (s.act === Act.Attack && s.actT === 0) this.events.push({ t: 'swing', p: f.id, w: f.load.weapons[s.slot], m: s.move });
    void hpBefore;
    this.recordHistory(f);
  }

  private recordHistory(f: Fighter) {
    const h = this.tick % HIST;
    f.histTick[h] = this.tick;
    f.histX[h] = f.s.x;
    f.histY[h] = f.s.y;
    f.histFlags[h] = (f.s.invuln > 0 ? 1 : 0) | (isBlocking(f.s) ? 2 : 0);
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

  /** The defender as the attacker saw it at `tick` (position, invulnerability, guard). */
  private seenAt(d: Fighter, tick: number) {
    if (tick < this.tick) {
      const i = ((tick % HIST) + HIST) % HIST;
      if (d.histTick[i] === tick) {
        const fl = d.histFlags[i];
        return { x: d.histX[i], y: d.histY[i], invuln: !!(fl & 1), blocking: !!(fl & 2), blockT: d.histBlockT[i], face: d.histFace[i] };
      }
    }
    return { x: d.s.x, y: d.s.y, invuln: d.s.invuln > 0, blocking: isBlocking(d.s), blockT: d.s.blockT, face: d.s.face };
  }

  // ------------------------------------------------------------ combat

  private checkMelee(a: Fighter) {
    const m = currentMove(a.s, a.load);
    if (!m || m.arrow || !isActive(a.s, m)) return;
    const d = this.opponent(a);
    if (!d || d.s.act === Act.KO || d.lastHitSeq === a.s.moveSeq) return;
    const seen = this.seenAt(d, this.validViewTick(a, a.lastCmd.viewTick));
    const box = moveBox(m, a.s.x, a.s.y, a.s.face);
    if (!overlap(box, bodyBox(seen.x, seen.y)) || seen.invuln) return;
    d.lastHitSeq = a.s.moveSeq;
    let crit = false;
    const front = (a.s.x - seen.x) * seen.face > 0;
    let dmg = moveDamage(a.s, a.load, m);
    if (m.backCrit && !front) crit = true;
    if (m.tipCrit) {
      const reach = m.box.x + m.box.w;
      if (Math.abs(seen.x - a.s.x) > reach * 0.68) crit = true;
    }
    if (crit) dmg = Math.round(dmg * (m.backCrit ? 1.5 : 1.4));
    const ix = (Math.max(box.x, seen.x - FIGHTER.w / 2) + Math.min(box.x + box.w, seen.x + FIGHTER.w / 2)) / 2;
    const iy = Math.max(box.y, seen.y - FIGHTER.h) + Math.min(box.h, FIGHTER.h) / 2;
    this.applyHit(a, d, { dmg, kbX: m.kbX, kbY: m.kbY, stun: m.stun, pull: !!m.pull, breaksGuard: !!m.breaksGuard, crit, w: a.load.weapons[a.s.slot], x: ix, y: iy, front, guard: seen });
    // a lunge stops on impact
    if (a.s.move === MOVE_CHARGED && m.dash) a.s.vx *= 0.2;
  }

  private applyHit(
    a: Fighter | undefined,
    d: Fighter,
    h: { dmg: number; kbX: number; kbY: number; stun: number; pull?: boolean; breaksGuard?: boolean; crit: boolean; w: number; x: number; y: number; front: boolean; guard?: { blocking: boolean; blockT: number } },
  ) {
    const ds = d.s;
    if (d.s.act === Act.KO) return;
    const guard = h.guard ?? { blocking: isBlocking(ds), blockT: ds.blockT };
    const dirX = a ? (a.s.x <= ds.x ? 1 : -1) : h.x <= ds.x ? 1 : -1;
    if (guard.blocking && h.front && !h.breaksGuard) {
      if (guard.blockT <= FIGHTER.parryWindow && a) {
        a.s.act = Act.Stun;
        a.s.actT = 0;
        a.s.stun = FIGHTER.parryStun;
        a.s.vx = -dirX * 120;
        a.s.charge = 0;
        this.events.push({ t: 'parry', a: d.id, v: a.id, x: h.x, y: h.y });
        return;
      }
      const chip = Math.max(1, Math.round(h.dmg * FIGHTER.chip));
      ds.hp -= chip;
      ds.vx = dirX * FIGHTER.blockPush;
      this.events.push({ t: 'block', a: a?.id ?? 255, v: d.id, amt: chip, x: h.x, y: h.y });
      if (a) {
        a.dealt += chip;
        if (Math.abs(a.s.x - ds.x) < 60) a.s.vx = -dirX * 90;
      }
      if (ds.hp <= 0) this.knockOut(d, a);
      return;
    }
    ds.hp -= h.dmg;
    if (a) {
      a.dealt += h.dmg;
      a.hits++;
    }
    this.events.push({ t: 'hit', a: a?.id ?? 255, v: d.id, amt: h.dmg, w: h.w, crit: h.crit, x: h.x, y: h.y });
    if (h.stun > 0) {
      ds.act = Act.Stun;
      ds.actT = 0;
      ds.stun = h.stun;
      ds.charge = 0;
      ds.blockT = 0;
      const push = h.pull && a ? -dirX : dirX;
      ds.vx = push * h.kbX;
      if (h.pull && a) {
        // the hook lands them in front of the reaper, not behind
        const want = a.s.x + a.s.face * 34;
        ds.vx = (want - ds.x) * 6;
      }
      if (h.kbY > 0) {
        ds.vy = -h.kbY;
        if (h.kbY > 150) ds.ground = 0;
      }
      ds.face = a ? (a.s.x < ds.x ? -1 : 1) : ds.face;
    }
    if (this.tick - d.comboAt < FIGHTER.comboWindow) d.comboHits++;
    else d.comboHits = 1;
    d.comboAt = this.tick;
    if (d.comboHits >= FIGHTER.comboBreak) {
      ds.invuln = Math.max(ds.invuln, FIGHTER.breakInvuln);
      d.comboHits = 0;
    }
    if (ds.hp <= 0) this.knockOut(d, a);
  }

  private knockOut(d: Fighter, a: Fighter | undefined) {
    if (this.phase !== 'fight') {
      d.s.hp = Math.max(1, d.s.hp);
      return;
    }
    d.s.hp = 0;
    d.s.act = Act.KO;
    d.s.actT = 0;
    d.s.vy = Math.min(d.s.vy, -260);
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
      if (!m || !m.arrow || !w.arrowSpeed) return;
      const heavy = s.move === MOVE_CHARGED;
      const speed = w.arrowSpeed * (heavy ? 1.3 : 1);
      this.projectiles.push({
        id: this.nextId++ % 65536, kind: 'arrow', owner: f.id, x: s.x + s.face * 18, y: s.y - 40, vx: s.face * speed, vy: heavy ? -20 : -60,
        dmg: moveDamage(s, f.load, m), kb: m.kbX, stun: m.stun, life: Math.round(1.6 * TICK_RATE), heavy,
      });
      this.events.push({ t: 'shoot', p: f.id, kind: 0 });
      return;
    }
    if (s.act !== Act.Skill) return;
    switch (f.load.skill) {
      case SkillId.Bomb: {
        const B = SKILL_FX.bomb;
        this.projectiles.push({ id: this.nextId++ % 65536, kind: 'bomb', owner: f.id, x: s.x + s.face * 14, y: s.y - 44, vx: s.face * B.speedX + s.vx * 0.3, vy: B.speedY, dmg: B.dmg, kb: 260, stun: 26, life: 3 * TICK_RATE, heavy: false });
        this.events.push({ t: 'shoot', p: f.id, kind: 1 });
        break;
      }
      case SkillId.Frost: {
        const F = SKILL_FX.frost;
        this.projectiles.push({ id: this.nextId++ % 65536, kind: 'frost', owner: f.id, x: s.x + s.face * 18, y: s.y - 38, vx: s.face * F.speed, vy: 0, dmg: F.dmg, kb: 120, stun: F.stun, life: Math.round(1.3 * TICK_RATE), heavy: false });
        this.events.push({ t: 'shoot', p: f.id, kind: 2 });
        break;
      }
      case SkillId.Trap: {
        const T = SKILL_FX.trap;
        for (let i = this.traps.length - 1; i >= 0; i--) if (this.traps[i].owner === f.id) this.traps.splice(i, 1);
        const tx = Math.max(20, Math.min(this.arena.w - 20, s.x + s.face * 26));
        this.traps.push({ id: this.nextId++ % 65536, owner: f.id, x: tx, y: surfaceBelow(this.arena, tx, s.y), armAt: this.tick + T.arm, until: this.tick + T.life });
        this.events.push({ t: 'shoot', p: f.id, kind: 3 });
        break;
      }
      case SkillId.Blink: {
        const x1 = s.x;
        this.events.push({ t: 'blink', p: f.id, x0: x1 - s.face * SKILL_FX.blink.dist, x1, y: s.y });
        break;
      }
    }
  }

  private stepProjectiles() {
    const A = this.arena;
    const out: Projectile[] = [];
    for (const p of this.projectiles) {
      const g = p.kind === 'bomb' ? SKILL_FX.bomb.gravity : p.kind === 'arrow' ? (p.heavy ? 120 : 330) : 0;
      p.vy += g * DT;
      const px = p.x;
      const py = p.y;
      p.x += p.vx * DT;
      p.y += p.vy * DT;
      p.life--;
      let dead = p.life <= 0;
      // hit a fighter (not its owner)
      for (const f of this.fighters.values()) {
        if (dead || f.id === p.owner || f.s.act === Act.KO || f.s.invuln > 0) continue;
        const bb = bodyBox(f.s.x, f.s.y);
        const pb = { x: Math.min(px, p.x) - 4, y: Math.min(py, p.y) - 4, w: Math.abs(p.x - px) + 8, h: Math.abs(p.y - py) + 8 };
        if (!overlap(bb, pb)) continue;
        const owner = this.fighters.get(p.owner);
        if (p.kind === 'bomb') {
          this.explode(p, owner);
        } else {
          const front = (p.vx < 0) === (f.s.face > 0);
          const guardOk = isBlocking(f.s) && front;
          this.applyHit(owner, f, { dmg: p.dmg, kbX: p.kb, kbY: p.heavy ? 160 : 40, stun: p.stun, crit: p.heavy, w: p.kind === 'arrow' ? WeaponId.Bow : 101, x: p.x, y: p.y, front });
          if (p.kind === 'frost' && !guardOk) f.s.slowT = SKILL_FX.frost.slowTicks;
        }
        dead = true;
      }
      if (!dead) {
        const floorHit = p.y >= surfaceBelow(A, p.x, py) && p.vy >= 0;
        const wallHit = p.x < 0 || p.x > A.w;
        if (floorHit || wallHit || p.y > A.floor) {
          if (p.kind === 'bomb') {
            p.y = Math.min(p.y, surfaceBelow(A, p.x, py));
            this.explode(p, this.fighters.get(p.owner));
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
    this.events.push({ t: 'boom', x: p.x, y: p.y });
    for (const f of this.fighters.values()) {
      if (f.id === p.owner || f.s.act === Act.KO || f.s.invuln > 0) continue;
      const dx = f.s.x - p.x;
      const dy = f.s.y - FIGHTER.h / 2 - p.y;
      if (dx * dx + dy * dy > (B.radius + 14) ** 2) continue;
      this.applyHit(owner, f, { dmg: B.dmg, kbX: 240, kbY: 260, stun: 26, crit: false, w: 100, x: f.s.x, y: f.s.y - FIGHTER.h / 2, front: false });
      f.s.burnT = Math.max(f.s.burnT, B.burnTicks);
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
          f.s.rootT = T.root;
          this.applyHit(this.fighters.get(t.owner), f, { dmg: T.dmg, kbX: 0, kbY: 0, stun: 12, crit: false, w: 102, x: t.x, y: t.y - 10, front: false });
          f.s.vx = 0;
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
        if (owner) owner.dealt += amt;
        this.events.push({ t: 'hit', a: owner?.id ?? 255, v: f.id, amt, w: 200, crit: false, x: f.s.x, y: f.s.y - FIGHTER.h * 0.6 });
        if (f.s.hp <= 0) this.knockOut(f, owner);
      }
    }
  }

  // ------------------------------------------------------------ rounds

  private stepRound() {
    if (this.phase === 'fight') {
      // a solo warm-up (one seat empty) has no clock
      if (this.seats[0] >= 0 && this.seats[1] >= 0) this.timeLeft = Math.max(0, this.timeLeft - DT);
      if (this.timeLeft <= 0) {
        const a = this.fighters.get(this.seats[0]);
        const b = this.fighters.get(this.seats[1]);
        const ha = a ? a.s.hp : 0;
        const hb = b ? b.s.hp : 0;
        this.endRound(ha === hb ? 255 : ha > hb ? 0 : 1, 1);
      }
    } else if (this.phase === 'ko' && this.tick >= this.phaseEnd) {
      const best = Math.max(this.wins[0], this.wins[1]);
      if (best >= this.settings.wins) {
        this.phase = 'over';
        this.winner = this.wins[0] > this.wins[1] ? 0 : 1;
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
    if (winner === 0 || winner === 1) {
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
