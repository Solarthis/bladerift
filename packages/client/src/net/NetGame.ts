import {
  ArenaDef, copyState, FighterState, GameEvent, getArena, InputCmd, Loadout, MatchSettings, NetFighter, NetProjectile, NetTrap, Phase,
  SNAPSHOT_INTERVAL, Snapshot, stepFighter, TICK_RATE,
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
  weapons: [number, number];
  skill: number;
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
    if (!this.pred) {
      this.pred = copyState(s.self);
      for (const c of this.pending) stepFighter(this.pred, c, this.arena, this.load);
      this.prev = { x: this.pred.x, y: this.pred.y };
      return;
    }
    const oldX = this.pred.x + this.corr.x;
    const oldY = this.pred.y + this.corr.y;
    const stepX = this.pred.x - this.prev.x;
    const stepY = this.pred.y - this.prev.y;
    const before = this.pred;
    const next = copyState(s.self);
    for (const c of this.pending) stepFighter(next, c, this.arena, this.load);
    // keep the visual attack timeline when the reconciled state is the same move (no re-triggered effects)
    this.pred = next;
    void before;
    this.prev = { x: next.x - stepX, y: next.y - stepY };
    const ex = oldX - next.x;
    const ey = oldY - next.y;
    const err = Math.hypot(ex, ey);
    if (err > 120) this.corr.x = this.corr.y = 0;
    else {
      this.corr.x = ex;
      this.corr.y = ey;
    }
    if (err > 2) this.mispredicts++;
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
      stepFighter(this.pred, cmd, this.arena, this.load);
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
        o.actTf = this.pred.actT + al;
        o.self = true;
      } else {
        Object.assign(o, fb as NetFighter);
        const jump = Math.abs(fa.x - fb.x) > 140 || Math.abs(fa.y - fb.y) > 140;
        const lt = jump ? 1 : t;
        o.x = fa.x + (fb.x - fa.x) * lt + (fb.vx * extra) / TICK_RATE;
        o.y = fa.y + (fb.y - fa.y) * lt + (fb.ground ? 0 : (fb.vy * extra) / TICK_RATE);
        // action time runs on between snapshots (the action itself switches at the later snapshot)
        const sameAct = fa.act === fb.act && fa.move === fb.move && fb.actT >= fa.actT;
        o.actTf = sameAct ? fa.actT + (fb.actT - fa.actT) * t + extra : fb.actT + Math.max(0, rt - b.tick);
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
    o.moveSeq = s.moveSeq;
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

/** Events shown at once (your own actions and hits on you), not at the opponent's delayed time. */
function aboutMe(e: GameEvent, me: number) {
  switch (e.t) {
    case 'hit': case 'block': return e.v === me || e.a === me;
    case 'parry': return e.a === me || e.v === me;
    case 'swing': case 'shoot': case 'roll': case 'heal': case 'blink': return e.p === me;
    case 'trap': return e.v === me;
    case 'ko': return e.v === me || e.a === me;
    case 'round': case 'fight': case 'match': return true;
    default: return false;
  }
}
