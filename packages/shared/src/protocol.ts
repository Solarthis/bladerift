import { POS_SCALE, PROTOCOL_VERSION } from './constants';
import { FighterState, STATE_KEYS } from './fighter';
import { InputCmd } from './input';
import type { PlayerLook } from './look';
import { Loadout } from './weapons';
import { GameEvent, MatchSettings, Phase, PHASES, PROJ_KINDS, ProjKind, World } from './world';

/**
 * Message type ids. Client->server < 100, server->client >= 100.
 * High-frequency messages (input, snapshot, ping) are compact binary; rare ones carry JSON.
 */
export const enum Msg {
  Hello = 1,
  Input = 2,
  Ping = 3,
  Lobby = 4,
  Chat = 5,
  Welcome = 101,
  LobbyState = 102,
  MatchStart = 103,
  Snapshot = 104,
  Pong = 105,
  MatchEnd = 107,
  Notice = 108,
  Roster = 109,
  ChatMsg = 110,
}

export { PROTOCOL_VERSION };

// ---------------------------------------------------------------- byte io

export class Writer {
  buf: ArrayBuffer;
  view: DataView;
  o = 0;
  constructor(size = 1024) {
    this.buf = new ArrayBuffer(size);
    this.view = new DataView(this.buf);
  }
  private need(n: number) {
    if (this.o + n <= this.buf.byteLength) return;
    const nb = new ArrayBuffer(Math.max(this.buf.byteLength * 2, this.o + n));
    new Uint8Array(nb).set(new Uint8Array(this.buf, 0, this.o));
    this.buf = nb;
    this.view = new DataView(nb);
  }
  u8(v: number) { this.need(1); this.view.setUint8(this.o, v); this.o += 1; return this; }
  i8(v: number) { this.need(1); this.view.setInt8(this.o, v); this.o += 1; return this; }
  u16(v: number) { this.need(2); this.view.setUint16(this.o, v, true); this.o += 2; return this; }
  i16(v: number) { this.need(2); this.view.setInt16(this.o, v, true); this.o += 2; return this; }
  u32(v: number) { this.need(4); this.view.setUint32(this.o, v >>> 0, true); this.o += 4; return this; }
  f32(v: number) { this.need(4); this.view.setFloat32(this.o, v, true); this.o += 4; return this; }
  f64(v: number) { this.need(8); this.view.setFloat64(this.o, v, true); this.o += 8; return this; }
  bytes(b: Uint8Array) { this.need(b.length); new Uint8Array(this.buf, this.o, b.length).set(b); this.o += b.length; return this; }
  finish() { return new Uint8Array(this.buf, 0, this.o); }
}

export class Reader {
  view: DataView;
  o = 0;
  constructor(data: ArrayBuffer | Uint8Array) {
    this.view = data instanceof Uint8Array ? new DataView(data.buffer, data.byteOffset, data.byteLength) : new DataView(data);
  }
  get remaining() { return this.view.byteLength - this.o; }
  private check(n: number) { if (this.o + n > this.view.byteLength) throw new RangeError('truncated message'); }
  u8() { this.check(1); return this.view.getUint8(this.o++); }
  i8() { this.check(1); return this.view.getInt8(this.o++); }
  u16() { this.check(2); const v = this.view.getUint16(this.o, true); this.o += 2; return v; }
  i16() { this.check(2); const v = this.view.getInt16(this.o, true); this.o += 2; return v; }
  u32() { this.check(4); const v = this.view.getUint32(this.o, true); this.o += 4; return v; }
  f32() { this.check(4); const v = this.view.getFloat32(this.o, true); this.o += 4; return v; }
  f64() { this.check(8); const v = this.view.getFloat64(this.o, true); this.o += 8; return v; }
}

const encX = (x: number) => Math.max(0, Math.min(65535, Math.round((x + 512) * POS_SCALE)));
const encY = (y: number) => Math.max(0, Math.min(65535, Math.round((y + 1024) * POS_SCALE)));
const decX = (v: number) => v / POS_SCALE - 512;
const decY = (v: number) => v / POS_SCALE - 1024;
const i16c = (v: number) => Math.max(-32768, Math.min(32767, Math.round(v)));

// ---------------------------------------------------------------- JSON frames

const te = new TextEncoder();
const td = new TextDecoder();

export function encodeJson(type: Msg, payload: unknown): Uint8Array {
  const body = te.encode(JSON.stringify(payload));
  const out = new Uint8Array(body.length + 1);
  out[0] = type;
  out.set(body, 1);
  return out;
}

export function decodeJson<T = unknown>(data: Uint8Array): T {
  if (data.length > 64 * 1024) throw new RangeError('json frame too large');
  return JSON.parse(td.decode(data.subarray(1))) as T;
}

export const msgType = (data: Uint8Array) => (data.length ? data[0] : -1);

// ---------------------------------------------------------------- input

export function encodeInputs(cmds: InputCmd[]): Uint8Array {
  const w = new Writer(2 + cmds.length * 11);
  w.u8(Msg.Input).u8(cmds.length);
  for (const c of cmds) {
    w.u32(c.seq).i8(Math.round(Math.max(-1, Math.min(1, c.moveX)) * 127)).i8(Math.round(Math.max(-1, Math.min(1, c.moveY)) * 127)).u8(c.buttons & 0xff).u32(c.viewTick);
  }
  return w.finish();
}

export function decodeInputs(data: Uint8Array): InputCmd[] {
  const r = new Reader(data);
  r.u8();
  const n = r.u8();
  if (n > 8) throw new RangeError('too many inputs');
  const out: InputCmd[] = [];
  for (let i = 0; i < n; i++) out.push({ seq: r.u32(), moveX: r.i8() / 127, moveY: r.i8() / 127, buttons: r.u8() & 0x3f, viewTick: r.u32() });
  return out;
}

export function encodePing(t: number, type: Msg.Ping | Msg.Pong = Msg.Ping) {
  return new Writer(9).u8(type).f64(t).finish();
}
export function decodePing(data: Uint8Array) {
  const r = new Reader(data);
  r.u8();
  return r.f64();
}

// ---------------------------------------------------------------- snapshot

/** What everyone sees of a fighter (the opponent is drawn from this, interpolated). */
export interface NetFighter {
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
}

export interface NetProjectile { id: number; kind: ProjKind; x: number; y: number; vx: number; vy: number; heavy: boolean }
export interface NetTrap { id: number; owner: number; x: number; y: number; armed: boolean }

export interface Snapshot {
  tick: number;
  ack: number;
  selfId: number;
  /** The recipient's own fighter, every field (prediction). */
  self: FighterState | null;
  phase: Phase;
  /** Ticks until the phase ends (intro countdown / KO pause). */
  phaseLeft: number;
  round: number;
  wins: [number, number];
  timeLeft: number;
  fighters: NetFighter[];
  projectiles: NetProjectile[];
  traps: NetTrap[];
  events: GameEvent[];
}

const EV = { hit: 1, block: 2, parry: 3, swing: 4, shoot: 5, boom: 6, trap: 7, roll: 8, heal: 9, blink: 10, ko: 11, round: 12, fight: 13, match: 14 } as const;

/** Body shared by every recipient of a given tick. */
export function encodeSnapshotBody(world: World, events: GameEvent[]): Uint8Array {
  const w = new Writer(1024);
  w.u8(PHASES.indexOf(world.phase)).u16(Math.max(0, Math.min(65535, world.phaseEnd - world.tick))).u8(world.round).u8(world.wins[0]).u8(world.wins[1]);
  w.u16(Math.min(65535, Math.ceil(world.timeLeft * 10)));
  w.u8(world.fighters.size);
  for (const f of world.fighters.values()) {
    const s = f.s;
    const fl = (s.face > 0 ? 1 : 0) | (s.ground ? 2 : 0) | (s.invuln > 0 ? 4 : 0) | (s.burnT > 0 ? 8 : 0) | (s.slowT > 0 ? 16 : 0) | (s.rootT > 0 ? 32 : 0) | (s.slot ? 64 : 0);
    w.u8(f.id).u8(f.seat).u16(encX(s.x)).u16(encY(s.y)).i16(i16c(s.vx)).i16(i16c(s.vy)).u8(fl).u8(s.act).u8(Math.min(255, s.actT)).u8(s.move);
    w.u16(Math.max(0, Math.ceil(s.hp))).u8(Math.min(255, s.charge)).u8(s.flask).u16(Math.min(65535, s.skillCd)).u8(Math.min(255, s.rollCd)).u8(Math.min(255, s.blockT));
    w.u8((f.load.weapons[0] << 4) | f.load.weapons[1]).u8(f.load.skill);
  }
  w.u8(Math.min(255, world.projectiles.length));
  for (const p of world.projectiles.slice(0, 255)) {
    w.u16(p.id).u8(PROJ_KINDS.indexOf(p.kind) | (p.heavy ? 128 : 0)).u16(encX(p.x)).u16(encY(p.y)).i16(i16c(p.vx)).i16(i16c(p.vy));
  }
  w.u8(Math.min(255, world.traps.length));
  for (const t of world.traps.slice(0, 255)) w.u16(t.id).u8(t.owner).u16(encX(t.x)).u16(encY(t.y)).u8(world.tick >= t.armAt ? 1 : 0);
  const evs = events.slice(0, 255);
  w.u8(evs.length);
  for (const e of evs) {
    w.u8(EV[e.t]);
    switch (e.t) {
      case 'hit': w.u8(e.a).u8(e.v).u16(Math.min(65535, Math.max(0, Math.round(e.amt)))).u8(e.w).u8(e.crit ? 1 : 0).u16(encX(e.x)).u16(encY(e.y)); break;
      case 'block': w.u8(e.a).u8(e.v).u16(Math.min(65535, Math.max(0, e.amt))).u16(encX(e.x)).u16(encY(e.y)); break;
      case 'parry': w.u8(e.a).u8(e.v).u16(encX(e.x)).u16(encY(e.y)); break;
      case 'swing': w.u8(e.p).u8(e.w).u8(e.m); break;
      case 'shoot': w.u8(e.p).u8(e.kind); break;
      case 'boom': w.u16(encX(e.x)).u16(encY(e.y)); break;
      case 'trap': w.u8(e.v).u16(encX(e.x)).u16(encY(e.y)); break;
      case 'roll': case 'heal': w.u8(e.p); break;
      case 'blink': w.u8(e.p).u16(encX(e.x0)).u16(encX(e.x1)).u16(encY(e.y)); break;
      case 'ko': w.u8(e.v).u8(e.a); break;
      case 'round': w.u8(e.winner).u8(e.why); break;
      case 'fight': w.u8(e.round); break;
      case 'match': w.u8(e.winner); break;
    }
  }
  return w.finish();
}

export function encodeSnapshot(world: World, selfId: number, body: Uint8Array): Uint8Array {
  const f = world.fighters.get(selfId);
  const w = new Writer(body.length + 16 + STATE_KEYS.length * 4);
  // (guessed commands count as acknowledged: the state already includes a step for each - World.runCommands)
  w.u8(Msg.Snapshot).u32(world.tick).u32(f ? f.lastSeq + f.owed : 0).u8(f ? f.id : 255);
  if (f) {
    w.u8(1);
    for (const k of STATE_KEYS) w.f32(f.s[k]);
  } else w.u8(0);
  w.bytes(body);
  return w.finish();
}

export function decodeSnapshot(data: Uint8Array): Snapshot {
  const r = new Reader(data);
  r.u8();
  const tick = r.u32();
  const ack = r.u32();
  const selfId = r.u8();
  let self: FighterState | null = null;
  if (r.u8()) {
    const s = {} as FighterState;
    for (const k of STATE_KEYS) s[k] = r.f32();
    self = s;
  }
  const phase = PHASES[r.u8()] ?? 'fight';
  const phaseLeft = r.u16();
  const round = r.u8();
  const wins: [number, number] = [r.u8(), r.u8()];
  const timeLeft = r.u16() / 10;
  const nf = r.u8();
  const fighters: NetFighter[] = [];
  for (let i = 0; i < nf; i++) {
    const id = r.u8(), seat = r.u8(), x = decX(r.u16()), y = decY(r.u16()), vx = r.i16(), vy = r.i16(), fl = r.u8(), act = r.u8(), actT = r.u8(), move = r.u8();
    const hp = r.u16(), charge = r.u8(), flask = r.u8(), skillCd = r.u16(), rollCd = r.u8(), blockT = r.u8(), wp = r.u8(), skill = r.u8();
    fighters.push({
      id, seat, x, y, vx, vy, face: fl & 1 ? 1 : -1, ground: !!(fl & 2), invuln: !!(fl & 4), burning: !!(fl & 8), slowed: !!(fl & 16), rooted: !!(fl & 32),
      slot: fl & 64 ? 1 : 0, act, actT, move, hp, charge, flask, skillCd, rollCd, blockT, weapons: [wp >> 4, wp & 15], skill,
    });
  }
  const np = r.u8();
  const projectiles: NetProjectile[] = [];
  for (let i = 0; i < np; i++) {
    const id = r.u16(), k = r.u8();
    projectiles.push({ id, kind: PROJ_KINDS[k & 127] ?? 'arrow', heavy: !!(k & 128), x: decX(r.u16()), y: decY(r.u16()), vx: r.i16(), vy: r.i16() });
  }
  const nt = r.u8();
  const traps: NetTrap[] = [];
  for (let i = 0; i < nt; i++) traps.push({ id: r.u16(), owner: r.u8(), x: decX(r.u16()), y: decY(r.u16()), armed: r.u8() === 1 });
  const ne = r.u8();
  const events: GameEvent[] = [];
  for (let i = 0; i < ne; i++) {
    const t = r.u8();
    switch (t) {
      case EV.hit: events.push({ t: 'hit', a: r.u8(), v: r.u8(), amt: r.u16(), w: r.u8(), crit: r.u8() === 1, x: decX(r.u16()), y: decY(r.u16()) }); break;
      case EV.block: events.push({ t: 'block', a: r.u8(), v: r.u8(), amt: r.u16(), x: decX(r.u16()), y: decY(r.u16()) }); break;
      case EV.parry: events.push({ t: 'parry', a: r.u8(), v: r.u8(), x: decX(r.u16()), y: decY(r.u16()) }); break;
      case EV.swing: events.push({ t: 'swing', p: r.u8(), w: r.u8(), m: r.u8() }); break;
      case EV.shoot: events.push({ t: 'shoot', p: r.u8(), kind: r.u8() }); break;
      case EV.boom: events.push({ t: 'boom', x: decX(r.u16()), y: decY(r.u16()) }); break;
      case EV.trap: events.push({ t: 'trap', v: r.u8(), x: decX(r.u16()), y: decY(r.u16()) }); break;
      case EV.roll: events.push({ t: 'roll', p: r.u8() }); break;
      case EV.heal: events.push({ t: 'heal', p: r.u8() }); break;
      case EV.blink: events.push({ t: 'blink', p: r.u8(), x0: decX(r.u16()), x1: decX(r.u16()), y: decY(r.u16()) }); break;
      case EV.ko: events.push({ t: 'ko', v: r.u8(), a: r.u8() }); break;
      case EV.round: events.push({ t: 'round', winner: r.u8(), why: r.u8() }); break;
      case EV.fight: events.push({ t: 'fight', round: r.u8() }); break;
      case EV.match: events.push({ t: 'match', winner: r.u8() }); break;
      default: throw new RangeError('bad event ' + t);
    }
  }
  return { tick, ack, selfId, self, phase, phaseLeft, round, wins, timeLeft, fighters, projectiles, traps, events };
}

// ---------------------------------------------------------------- JSON payload shapes

export interface HelloMsg { v: number; name: string; color: number; hostKey?: string; resume?: string; look?: PlayerLook; load?: Loadout }
export interface RosterEntry {
  id: number; name: string; color: number; bot: boolean; host: boolean; ping: number; look?: PlayerLook; load: Loadout;
  /** Fighter seat (0 / 1) or -1 for a spectator. */
  seat: number;
}
export interface LobbyStateMsg {
  phase: 'lobby' | 'playing' | 'results';
  hostId: number;
  settings: MatchSettings;
  roster: RosterEntry[];
  maxPlayers: number;
  /** Fill an empty seat with a bot. */
  bot: boolean;
  botLevel: 'easy' | 'normal' | 'hard';
  serverName: string;
}
export interface WelcomeMsg { id: number; v: number; host: boolean; resume: string; tickRate: number; local?: boolean }
export interface MatchStartMsg { settings: MatchSettings; tick: number; roster: RosterEntry[] }
export interface ScoreRow { id: number; seat: number; rounds: number; dealt: number; hits: number }
export interface MatchEndMsg { rows: ScoreRow[]; wins: [number, number]; winner: number; winnerId: number; nextIn: number }
export type LobbyCmd =
  | { op: 'settings'; settings: Partial<MatchSettings> }
  | { op: 'start' }
  | { op: 'bot'; on: boolean }
  | { op: 'botLevel'; level: 'easy' | 'normal' | 'hard' }
  | { op: 'seat'; seat: number }
  | { op: 'kick'; id: number }
  | { op: 'rename'; name: string; color: number; look?: PlayerLook }
  | { op: 'loadout'; load: Loadout }
  | { op: 'toLobby' }
  | { op: 'rematch' };
