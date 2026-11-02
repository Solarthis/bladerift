import {
  ArenaDef, copyState, FighterState, GameEvent, getArena, InputCmd, Loadout, MatchSettings, NetFighter, NetProjectile, NetTrap, Phase,
  Act, bodySolid, bodyYields, FoeView, SNAPSHOT_INTERVAL, Snapshot, stepFighter, TICK_RATE, ArtId, artIdOf, bodyBox, ClassId, currentMove, FIGHTER, hitstopFor, isActive,
  isFrozen, isThrowable, meleeConnect, meleeCrit, moveBox, moveDamage, MOVE_ART,
} from '@bladerift/shared';

/**
 * Render delay for the opponent, in ticks: one snapshot interval plus the 95th-percentile arrival lateness of the
 * last ~3 s plus a margin (adaptive, as in Skyfire Squad).
 */
const INTERP_START = 6;
const INTERP_MIN = 2.5;
const INTERP_MAX = 10;
const INTERP_MAX_ONLINE = 16;
const INTERP_MARGIN = 1.2;
const JITTER_WINDOW = 90;
const JITTER_EVERY = 15;
const INTERP_GROW = 15;
const INTERP_SHRINK = 3;
const EVENT_STALE = 60;
const MAX_EVENTS = 1500;
const MAX_PENDING = 120;

/** A fighter as drawn: interpolated (opponent) or predicted (you). */
export interface ViewFighter {
  id: number;
  seat: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  face: number;
  ground: boolean;
  act: number;
  actT: number;
  slot: number;
  move: number;
  hp: number;
  charge: number;
  invuln: boolean;
  burning: boolean;
  slowed: boolean;
  rooted: boolean;
  flask: number;
  skillCd: number;
  rollCd: number;
  blockT: number;
  /** Ranged heat and overheat (see FighterState heat / reload). */
  heat: number;
  reload: boolean;
  weapons: [number, number];
  skill: number;
  crouch: boolean;
  slide: boolean;
  rollAir: boolean;
  fast: boolean;
  frenzy: boolean;
  buff: boolean;
  veil: boolean;
  rift: number;
  cls: number;
  hero: number;
  /** Hit-stop / superpause ticks left (frozen: actTf does not advance) and the knockdown fall (see NetFighter). */
  hitstop: number;
  pause: number;
  fall: boolean;
  /** Fractional action time for smooth pose stepping (ticks). */
  actTf: number;
  self: boolean;
  /** Your own fighter's attack counter (new moves start effects at once); -1 for the opponent. */
  moveSeq: number;
}

export interface QueuedEvent {
  tick: number;
  e: GameEvent;
}

/**
 * Client-side match state: predicts your own fighter (the same deterministic step the server runs), reconciles with
 * authoritative snapshots, and interpolates the opponent a little in the past.
 */
export class NetGame {
  readonly arena: ArenaDef;
  pred: FighterState | null = null;
  private prev: { x: number; y: number } = { x: 0, y: 0 };
  renderAlpha = 1;
  private pending: InputCmd[] = [];
  /** The opponent as the newest snapshot has it: a Rift Art of yours can move you toward or behind them (World.stepArts). */
  private foe: FoeView | undefined = undefined;
  /** The opponent's horizontal speed in the latest snapshot (units/s): the push boxes are predicted against where the
   * opponent will be when the server runs each pending command, not where the snapshot (a trip old) shows it. */
  private foeVx = 0;
  private seq = 0;
  private snaps: Snapshot[] = [];
  private tickOffset = NaN;
  interp = INTERP_START;
  private interpTarget = INTERP_START;
  private late = new Float32Array(JITTER_WINDOW);
  private lateSorted = new Float32Array(JITTER_WINDOW);
  private lateN = 0;
  private easedAt = 0;
  private readonly interpMax: number;
  latest: Snapshot | null = null;
  corr = { x: 0, y: 0 };
  readonly events: QueuedEvent[] = [];
  phase: Phase = 'intro';
  phaseLeft = 0;
  round = 1;
  wins: [number, number] = [0, 0];
  timeLeft = 0;
  mispredicts = 0;
  lastSnapAt = 0;
  /** Your loadout (prediction needs it; it comes in the roster). */
  load: Loadout | null = null;
  /** Ticks your predicted fighter has run (new attacks start on these, for effects). */
  predTick = 0;
  /** A hit of your own the client predicted (its hit-stop, confirm and pogo are re-applied when pending commands are
   * replayed, until the server has run that command and answers for itself). */
  private predHit: { seq: number; moveSeq: number; hs: number } | null = null;
  /** moveSeq of your last move already judged (hit or not): a move connects at most once. */
  private judgedSeq = -1;

  constructor(
    readonly settings: MatchSettings,
    public selfId: number,
    readonly online = false,
    /** Rooms in this page (practice, same device) send every tick. */
    readonly local = false,
  ) {
    this.interpMax = online ? INTERP_MAX_ONLINE : INTERP_MAX;
    this.arena = getArena(settings.arenaId);
    if (local) this.interp = this.interpTarget = 1.5;
  }

  // ---------------------------------------------------------------- clock

  estServerTick(now = performance.now()) {
    return Number.isNaN(this.tickOffset) ? 0 : (now * TICK_RATE) / 1000 + this.tickOffset;
  }

  renderTick(now = performance.now()) {
    this.easeDelay(now);
    return this.estServerTick(now) - this.interp;
  }

  private easeDelay(now: number) {
    const dt = (now - this.easedAt) / 1000;
    if (dt <= 0) return;
    this.easedAt = now;
    if (dt > 0.25) return;
    const d = this.interpTarget - this.interp;
    if (d) this.interp += d > 0 ? Math.min(d, INTERP_GROW * dt) : Math.max(d, -INTERP_SHRINK * dt);
  }

  get bufferMs() {
    return (this.interp * 1000) / TICK_RATE;
  }

  viewTick(now = performance.now()) {
    const newest = this.snaps.length ? this.snaps[this.snaps.length - 1].tick : 0;
    return Math.max(0, Math.round(Math.min(this.renderTick(now), newest + 6)));
  }

  // ---------------------------------------------------------------- snapshots

  onSnapshot(s: Snapshot, now = performance.now()) {
    const gap = this.lastSnapAt ? now - this.lastSnapAt : 0;
    this.lastSnapAt = now;
    const sample = s.tick - (now * TICK_RATE) / 1000;
    if (Number.isNaN(this.tickOffset) || Math.abs(sample - this.tickOffset) > 30) this.tickOffset = sample;
    else if (sample > this.tickOffset) this.tickOffset += (sample - this.tickOffset) * 0.2;
    else this.tickOffset += (sample - this.tickOffset) * 0.02;
    this.adaptDelay(sample, gap);

    this.latest = s;
    this.snaps.push(s);
    const other = s.fighters.find((f) => f.id !== this.selfId && f.id !== s.selfId);
    this.foe = other && other.act !== Act.KO ? { x: other.x, y: other.y, face: other.face, solid: bodySolid(other), yields: bodyYields(other), throwable: throwableOf(other) } : undefined;
    this.foeVx = other ? other.vx : 0;
    while (this.snaps.length > 40) this.snaps.shift();
    this.phase = s.phase;
    this.phaseLeft = s.phaseLeft;
    this.round = s.round;
    this.wins = s.wins;
    this.timeLeft = s.timeLeft;
    if (this.events.length > MAX_EVENTS) this.events.splice(0, this.events.length - MAX_EVENTS);
    for (const e of s.events) this.events.push({ tick: s.tick, e });

    if (!s.self || !this.load) {
      this.pred = s.self ? copyState(s.self) : null;
      return;
    }
    this.pending = this.pending.filter((c) => c.seq > s.ack);
    // the server has run the command of a predicted hit: from here on its state says whether it landed
    if (this.predHit && this.predHit.seq <= s.ack) this.predHit = null;
    // (or it already landed that move's hit, a tick earlier than the client saw it: not twice)
    const ph = this.predHit;
    if (ph && s.self && s.self.moveSeq === ph.moveSeq && s.self.act === Act.Attack && s.self.confirm > 0) this.predHit = null;
    if (!this.pred) {
      this.pred = copyState(s.self);
      this.replay(this.pred);
      this.prev = { x: this.pred.x, y: this.pred.y };
      return;
    }
    const oldX = this.pred.x + this.corr.x;
    const oldY = this.pred.y + this.corr.y;
    const stepX = this.pred.x - this.prev.x;
    const stepY = this.pred.y - this.prev.y;
    const before = this.pred;
    const next = copyState(s.self);
    this.replay(next);
    // a hit the server landed for you that the client did not foresee: that move has connected
    if (s.self.act === Act.Attack && s.self.confirm > 0 && next.moveSeq === s.self.moveSeq) this.judgedSeq = s.self.moveSeq;
    // keep the visual attack timeline when the reconciled state is the same move (no re-triggered effects)
    this.pred = next;
    void before;
    this.prev = { x: next.x - stepX, y: next.y - stepY };
    const ex = oldX - next.x;
    const ey = oldY - next.y;
    const err = Math.hypot(ex, ey);
    // a hit you could not predict (knockback at high ping) glides over a few frames like the blow itself; any other big
    // error (a respawn, a teleport) snaps
    if (err > (next.act === Act.Stun ? 280 : 120)) this.corr.x = this.corr.y = 0;
    else {
      this.corr.x = ex;
      this.corr.y = ey;
    }
    if (err > 2) this.mispredicts++;
  }

  /** The opponent as the server will see it `k` ticks after the latest snapshot (moving on at its snapshot speed, at
   * most a quarter second ahead). */
  private foeAhead(k: number): FoeView | undefined {
    const f = this.foe;
    if (!f || !this.foeVx || this.local) return f;
    const x = f.x + (this.foeVx * Math.min(k, TICK_RATE / 4)) / TICK_RATE;
    return { ...f, x: Math.max(0, Math.min(this.arena.w, x)) };
  }

  /** Step the pending commands over a state from the server, with your predicted hit (if the server has not run it). */
  private replay(st: FighterState) {
    const ph = this.predHit;
    let k = 0;
    for (const c of this.pending) {
      const frozen = isFrozen(st);
      stepFighter(st, c, this.arena, this.load!, this.foeAhead(++k));
      if (ph && c.seq === ph.seq && !frozen && st.moveSeq === ph.moveSeq) {
        const m = currentMove(st, this.load!);
        if (m) meleeConnect(st, this.load!, m, ph.hs);
      }
    }
  }

  /**
   * Did the step just taken land your swing? The server judges a melee hit against the opponent as you saw it at the
   * command's view tick (lag compensation), so the client can tell the same from the interpolated opponent: on a hit
   * (or a block) your fighter freezes in hit-stop at once, as the server's will, instead of being pulled back later.
   */
  private predictConnect(cmd: InputCmd) {
    const s = this.pred!;
    const load = this.load!;
    if (this.phase !== 'fight') return;
    const m = currentMove(s, load);
    if (!m || m.arrow || !isActive(s, m) || s.moveSeq === this.judgedSeq) return;
    const o = this.opponentAt(cmd.viewTick);
    if (!o || o.act === Act.KO || o.invuln) return;
    if (!overlaps(moveBox(m, s.x, s.y, s.face), bodyBox(o.x, o.y, o.crouch))) return;
    this.judgedSeq = s.moveSeq;
    // a Bulwark or a parry turns the swing back: the server decides those
    if (o.act === Act.Art && artIdOf({ hero: o.hero, cls: o.cls }) === ArtId.Bulwark) return;
    const mc = meleeCrit(s, load, m, o.x, o.face);
    let blocked = false;
    if (o.act === Act.Block && mc.front && !m.breaksGuard) {
      if (o.blockT <= FIGHTER.parryWindow * (o.cls === ClassId.Shielder ? 1.6 : 1)) return;
      blocked = true;
    }
    const hs = hitstopFor(moveDamage(s, load, m), mc.crit, s.move === MOVE_ART, blocked);
    // (out of the Grim Fog, the first blow that lands reveals)
    if (!blocked) s.veil = 0;
    meleeConnect(s, load, m, hs);
    this.predHit = { seq: cmd.seq, moveSeq: s.moveSeq, hs };
  }

  /** The opponent as drawn at a tick (interpolated between snapshots), or undefined. */
  private opponentAt(tick: number): NetFighter | undefined {
    if (!this.snaps.length) return undefined;
    const { a, b, t } = this.bracket(tick);
    const fb = b.fighters.find((f) => f.id !== this.selfId);
    if (!fb) return undefined;
    const fa = a.fighters.find((f) => f.id === fb.id) ?? fb;
    const lt = Math.abs(fa.x - fb.x) > 140 || Math.abs(fa.y - fb.y) > 140 ? 1 : t;
    const near = t < 0.5 ? fa : fb;
    return { ...near, x: fa.x + (fb.x - fa.x) * lt, y: fa.y + (fb.y - fa.y) * lt };
  }

  private adaptDelay(sample: number, gap: number) {
    const late = Math.max(0, this.tickOffset - sample);
    const interval = this.local ? 1 : SNAPSHOT_INTERVAL;
    const ignore = this.interpMax - interval - INTERP_MARGIN;
    if (gap > 0 && gap < 500 && late <= ignore) {
      this.late[this.lateN % JITTER_WINDOW] = late;
      this.lateN++;
      if (this.lateN >= JITTER_EVERY && this.lateN % JITTER_EVERY === 0) {
        const n = Math.min(this.lateN, JITTER_WINDOW);
        const v = this.lateSorted.subarray(0, n);
        v.set(this.late.subarray(0, n));
        v.sort();
        const p95 = v[Math.min(n - 1, Math.floor(n * 0.95))];
        const min = this.local ? 1 : INTERP_MIN;
        this.interpTarget = Math.min(this.interpMax, Math.max(min, interval + p95 + INTERP_MARGIN));
      }
    }
  }

  // ---------------------------------------------------------------- local tick

  skipTicks(n: number) {
    this.seq += Math.max(0, Math.min(3600, Math.floor(n)));
  }

  /** Run one fixed tick of local input; returns the command to send. */
  tick(moveX: number, moveY: number, buttons: number): InputCmd {
    const q = (v: number) => Math.round(Math.max(-1, Math.min(1, v)) * 127) / 127;
    const cmd: InputCmd = { seq: ++this.seq, moveX: q(moveX), moveY: q(moveY), buttons, viewTick: this.viewTick() };
    if (this.pred && this.load) {
      this.prev = { x: this.pred.x, y: this.pred.y };
      const frozen = isFrozen(this.pred);
      stepFighter(this.pred, cmd, this.arena, this.load, this.foeAhead(this.pending.length + 1));
      if (!frozen) this.predictConnect(cmd);
      this.predTick++;
    }
    this.pending.push(cmd);
    if (this.pending.length > MAX_PENDING) this.pending.shift();
    const k = Math.exp((-1 / TICK_RATE) * 14);
    this.corr.x *= k;
    this.corr.y *= k;
    return cmd;
  }

  // ---------------------------------------------------------------- interpolation

  private bracket(rt: number) {
    const snaps = this.snaps;
    let a = snaps[0];
    let b = snaps[snaps.length - 1];
    for (let i = snaps.length - 1; i > 0; i--) {
      if (snaps[i - 1].tick <= rt) {
        a = snaps[i - 1];
        b = snaps[i];
        break;
      }
    }
    if (rt >= b.tick) a = b;
    const span = b.tick - a.tick;
    const t = span > 0 ? Math.max(0, Math.min(1, (rt - a.tick) / span)) : 0;
    return { a, b, t };
  }

  private pool = new Map<number, ViewFighter>();

  /** Every fighter at render time: you predicted, the opponent interpolated. Objects are reused per id. */
  fighters(now = performance.now()): ViewFighter[] {
    const out: ViewFighter[] = [];
    if (!this.snaps.length) return out;
    const rt = this.renderTick(now);
    const { a, b, t } = this.bracket(rt);
    const extra = rt > b.tick ? Math.min(6, rt - b.tick) : 0;
    for (const fb of b.fighters) {
      const fa = a.fighters.find((f) => f.id === fb.id) ?? fb;
      let o = this.pool.get(fb.id);
      if (!o) {
        o = { ...fb, actTf: fb.actT, self: false, moveSeq: -1 };
        this.pool.set(fb.id, o);
      }
      if (fb.id === this.selfId && this.pred) {
        this.fromState(o, fb, this.pred);
        const al = this.renderAlpha;
        o.x = this.prev.x + (this.pred.x - this.prev.x) * al + this.corr.x;
        o.y = this.prev.y + (this.pred.y - this.prev.y) * al + this.corr.y;
        // (frozen: the pose holds)
        o.actTf = this.pred.actT + (isFrozen(this.pred) ? 0 : al);
        o.self = true;
      } else {
        Object.assign(o, fb as NetFighter);
        const jump = Math.abs(fa.x - fb.x) > 140 || Math.abs(fa.y - fb.y) > 140;
        const lt = jump ? 1 : t;
        // (a frozen fighter keeps its knockback velocity for later: do not run it on past the newest snapshot)
        const ex = fb.hitstop > 0 || fb.pause > 0 ? 0 : extra;
        o.x = fa.x + (fb.x - fa.x) * lt + (fb.vx * ex) / TICK_RATE;
        o.y = fa.y + (fb.y - fa.y) * lt + (fb.ground ? 0 : (fb.vy * ex) / TICK_RATE);
        // action time runs on between snapshots (the action itself switches at the later snapshot)
        const sameAct = fa.act === fb.act && fa.move === fb.move && fb.actT >= fa.actT;
        o.actTf = sameAct ? fa.actT + (fb.actT - fa.actT) * t + ex : fb.actT + Math.max(0, rt - b.tick);
        o.act = sameAct || t > 0.5 || a === b ? fb.act : fa.act;
        if (o.act === fa.act && !sameAct && t <= 0.5 && a !== b) {
          o.move = fa.move;
          o.slot = fa.slot;
          o.actTf = fa.actT + (rt - a.tick);
        }
        o.self = false;
        o.moveSeq = -1;
      }
      out.push(o);
    }
    return out;
  }

  private fromState(o: ViewFighter, nf: NetFighter, s: FighterState) {
    o.id = nf.id;
    o.seat = nf.seat;
    o.vx = s.vx;
    o.vy = s.vy;
    o.face = s.face;
    o.ground = !!s.ground;
    o.act = s.act;
    o.actT = s.actT;
    o.slot = s.slot;
    o.move = s.move;
    o.hp = s.hp;
    o.charge = s.charge;
    o.invuln = s.invuln > 0;
    o.burning = s.burnT > 0;
    o.slowed = s.slowT > 0;
    o.rooted = s.rootT > 0;
    o.flask = s.flask;
    o.skillCd = s.skillCd;
    o.rollCd = s.rollCd;
    o.blockT = s.blockT;
    o.heat = s.heat;
    o.reload = !!s.reload;
    o.moveSeq = s.moveSeq;
    o.crouch = !!s.crouch;
    o.slide = !!s.slide;
    o.rollAir = !!s.rollAir;
    o.fast = !!s.fast;
    o.frenzy = s.frenzy > 0;
    o.rift = s.rift;
    o.cls = nf.cls;
    o.hero = nf.hero;
    o.buff = s.buff > 0;
    o.veil = s.veil > 0;
    o.hitstop = s.hitstop;
    o.pause = s.pause;
    o.fall = !!s.fall;
    o.weapons = nf.weapons;
    o.skill = nf.skill;
  }

  projectiles(now = performance.now()): NetProjectile[] {
    if (!this.snaps.length) return [];
    const { a, b, t } = this.bracket(this.renderTick(now));
    const prev = new Map(a.projectiles.map((p) => [p.id, p]));
    const out: NetProjectile[] = [];
    for (const pb of b.projectiles) {
      const pa = prev.get(pb.id);
      if (!pa) {
        if (t > 0.5 || a === b) out.push(pb);
        continue;
      }
      out.push({ ...pb, x: pa.x + (pb.x - pa.x) * t, y: pa.y + (pb.y - pa.y) * t });
    }
    return out;
  }

  traps(): NetTrap[] {
    return this.latest?.traps ?? [];
  }

  /** Events whose time has come (the opponent's are delayed to line up with its interpolated position). */
  drainEvents(now = performance.now()): GameEvent[] {
    const rt = this.renderTick(now);
    const out: GameEvent[] = [];
    let i = 0;
    while (i < this.events.length) {
      const q = this.events[i];
      const mine = aboutMe(q.e, this.selfId);
      if (!mine && q.tick < rt - EVENT_STALE) {
        this.events.splice(i, 1);
        continue;
      }
      if (mine || q.tick <= rt + 1) {
        out.push(q.e);
        this.events.splice(i, 1);
      } else i++;
    }
    return out;
  }
}

/** Can a throw grab this opponent at the start of the tick (isThrowable on the snapshot's copy of it). */
const throwableOf = (f: NetFighter) =>
  isThrowable({ ground: f.ground ? 1 : 0, act: f.act, move: f.move, invuln: f.invuln ? 1 : 0, frenzy: f.frenzy ? 1 : 0 } as FighterState);

const overlaps = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

/** Events shown at once (your own actions and hits on you), not at the opponent's delayed time. */
function aboutMe(e: GameEvent, me: number) {
  switch (e.t) {
    case 'hit': case 'block': return e.v === me || e.a === me;
    case 'parry': case 'throw': case 'tech': return e.a === me || e.v === me;
    case 'swing': case 'shoot': case 'roll': case 'heal': case 'blink': case 'ex': return e.p === me;
    case 'trap': return e.v === me;
    case 'ko': return e.v === me || e.a === me;
    case 'round': case 'fight': case 'match': return true;
    default: return false;
  }
}
