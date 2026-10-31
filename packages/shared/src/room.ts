import { BotBrain, BotDifficulty, botLoadout } from './bot';
import { MAX_PLAYERS, PROTOCOL_VERSION, SNAPSHOT_INTERVAL, TICK_RATE } from './constants';
import { ARENAS } from './arena';
import {
  decodeInputs, decodeJson, decodePing, encodeJson, encodePing, encodeSnapshot, encodeSnapshotBody, HelloMsg, LobbyCmd,
  LobbyStateMsg, MatchEndMsg, Msg, msgType, RosterEntry, ScoreRow,
} from './protocol';
import { DEFAULT_SETTINGS, MatchSettings, World } from './world';
import { botLook, PlayerLook, sanitizeColor, sanitizeLook } from './look';
import { Loadout } from './weapons';
import { DEFAULT_LOADOUT, sanitizeLoadout } from './heroes';

/** Minimal socket surface the room needs; implemented by `ws` on the server and by an in-memory pair offline. */
export interface RoomSocket {
  send(data: Uint8Array): void;
  close(code?: number, reason?: string): void;
  readonly readyState: number;
  readonly bufferedAmount: number;
}

export interface SocketHandlers {
  message(data: Uint8Array): void;
  close(): void;
}

function randomToken(bytes = 12) {
  const a = new Uint8Array(bytes);
  globalThis.crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
}

interface Client {
  id: number;
  ws: RoomSocket | null;
  name: string;
  color: number;
  look?: PlayerLook;
  load: Loadout;
  /** 0 / 1 fighter seat, -1 spectator. */
  seat: number;
  host: boolean;
  resume: string;
  ping: number;
  inputBudget: number;
  msgBudget: number;
  strikes: number;
  disconnectedAt: number;
  addr: string;
  viewTick: number;
  snapAt: number;
  viewBase: number;
}

interface Bot {
  id: number;
  name: string;
  color: number;
  look: PlayerLook;
  load: Loadout;
  seat: number;
  brain: BotBrain;
}

const BOT_NAMES = ['Grimsby', 'Vex', 'Moira', 'Thorne', 'Ashka', 'Brannock', 'Sable', 'Wick'];
const RESULTS_SECONDS = 15;
const RECONNECT_GRACE_MS = 20_000;
const MAX_FRAME = 4096;
const MAX_PENDING = 32;
const MAX_INPUTS_PER_SEC = 130;
const MSG_RATE = 15;
const MSG_BURST = 40;
const MAX_BUFFERED = 2 * 1024 * 1024;
const SNAPSHOT_BACKLOG = 24 * 1024;
const STALE_VIEW = 36;
const PROBE_EVERY = 15;
const VIEW_BASE_RISE = 0.05;
const KICK_BAN_MS = 10 * 60_000;

export interface RoomOptions {
  /** Lag compensation limit in seconds (internet players need more than LAN's 0.3 s). */
  maxRewindSec?: number;
  /** When the host leaves for good, the longest-connected player becomes host. */
  handOffHost?: boolean;
  /** Snapshot every N ticks (1 for rooms running in the browser itself). */
  snapshotInterval?: number;
}

export interface RoomStats {
  tickMs: number[];
  lateMs: number[];
  bytesOut: number;
  msgsIn: number;
}

export class Room {
  phase: 'lobby' | 'playing' | 'results' = 'lobby';
  settings: MatchSettings = { ...DEFAULT_SETTINGS };
  /** Fill an empty seat with a bot when the match starts. */
  botOn = false;
  botLevel: BotDifficulty = 'normal';
  world: World | null = null;
  readonly clients = new Map<number, Client>();
  bot: Bot | null = null;
  private resultsUntil = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private sweeper: ReturnType<typeof setInterval> | null = null;
  private nextTickAt = 0;
  readonly stats: RoomStats = { tickMs: [], lateMs: [], bytesOut: 0, msgsIn: 0 };
  private pending = 0;
  private readonly banned = new Map<string, number>();
  private lastLobbyJson = '';
  private lastSnapTick = 0;
  private joinOrder = 0;

  constructor(
    readonly hostKey: string,
    readonly serverName: string,
    readonly openHost = false,
    readonly opts: RoomOptions = {},
  ) {}

  private get floatingHost() {
    return this.openHost || !!this.opts.handOffHost;
  }

  // ------------------------------------------------------------ connections

  attach(ws: RoomSocket, addr: string): SocketHandlers {
    let client: Client | null = null;
    let greeted = false;
    if (++this.pending > MAX_PENDING) {
      this.pending--;
      ws.close(4009, 'busy');
      return { message: () => {}, close: () => {} };
    }
    const settle = () => {
      if (!greeted) {
        greeted = true;
        this.pending--;
      }
    };
    const helloTimer = setTimeout(() => ws.close(4000, 'hello timeout'), 5000);
    return {
      message: (data) => {
        if (data.length > MAX_FRAME) return ws.close(4002, 'frame too large');
        this.stats.msgsIn++;
        try {
          if (!client) {
            if (greeted) return;
            if (msgType(data) !== Msg.Hello) return ws.close(4003, 'expected hello');
            clearTimeout(helloTimer);
            settle();
            client = this.onHello(ws, decodeJson<HelloMsg>(data), addr);
            return;
          }
          this.onMessage(client, data);
        } catch {
          if (client && ++client.strikes > 20) ws.close(4004, 'protocol errors');
          else if (!client) ws.close(4004, 'bad hello');
        }
      },
      close: () => {
        clearTimeout(helloTimer);
        settle();
        // a client already removed (kicked, or forfeited and dropped) has nothing left to disconnect
        if (client && client.ws === ws && this.clients.get(client.id) === client) this.onDisconnect(client);
      },
    };
  }

  private onHello(ws: RoomSocket, hello: HelloMsg, addr: string): Client | null {
    if (hello.v !== PROTOCOL_VERSION) {
      ws.send(encodeJson(Msg.Notice, { kind: 'error', text: 'Version mismatch. Refresh the game to update.' }));
      ws.close(4005, 'version');
      return null;
    }
    if (hello.resume) {
      for (const c of this.clients.values()) {
        if (c.resume === hello.resume && !c.ws) {
          c.ws = ws;
          c.disconnectedAt = 0;
          c.addr = addr;
          c.resume = randomToken();
          if (c.host && !this.floatingHost && hello.hostKey !== this.hostKey) c.host = false;
          const f = this.world?.fighters.get(c.id);
          if (f) this.world!.resetInputs(f);
          c.viewTick = 0;
          c.viewBase = -1;
          this.welcome(c);
          this.broadcastLobby();
          return c;
        }
      }
    }
    const until = this.banned.get(addr);
    if (until && until > Date.now()) {
      ws.close(4007, 'kicked');
      return null;
    }
    const keyed = !!hello.hostKey && hello.hostKey === this.hostKey;
    const hostPresent = [...this.clients.values()].some((x) => x.host);
    const cap = keyed || hostPresent || this.floatingHost ? MAX_PLAYERS : MAX_PLAYERS - 1;
    if (this.clients.size >= cap) {
      ws.send(encodeJson(Msg.Notice, { kind: 'error', text: `This match is full (${MAX_PLAYERS} people).` }));
      ws.close(4006, 'full');
      return null;
    }
    const id = this.allocId();
    const isHost = keyed || (this.floatingHost && !hostPresent);
    if (isHost) for (const c of this.clients.values()) c.host = false;
    const c: Client = {
      id, ws, name: sanitizeName(hello.name), color: sanitizeColor(hello.color), look: sanitizeLook(hello.look), load: sanitizeLoadout(hello.load ?? DEFAULT_LOADOUT),
      seat: -1, host: isHost, resume: randomToken(), ping: 0, inputBudget: 0, msgBudget: MSG_BURST, strikes: 0, disconnectedAt: 0, viewTick: 0, snapAt: 0,
      viewBase: -1, addr,
    };
    (c as Client & { order?: number }).order = this.joinOrder++;
    this.clients.set(id, c);
    if (this.phase === 'lobby') this.autoSeat(c);
    this.welcome(c);
    this.broadcastLobby();
    return c;
  }

  /** Give a lobby newcomer a free fighter seat (else they watch). */
  private autoSeat(c: Client) {
    for (const seat of [0, 1]) {
      if (!this.seatTaken(seat)) {
        c.seat = seat;
        return;
      }
    }
    c.seat = -1;
  }

  private seatTaken(seat: number, except?: Client) {
    for (const c of this.clients.values()) if (c !== except && c.seat === seat) return true;
    return false;
  }

  private welcome(c: Client) {
    this.send(c, encodeJson(Msg.Welcome, { id: c.id, v: PROTOCOL_VERSION, host: c.host, resume: c.resume, tickRate: TICK_RATE }));
    this.send(c, encodeJson(Msg.LobbyState, this.lobbyState()));
    if (this.world && this.phase === 'playing')
      this.send(c, encodeJson(Msg.MatchStart, { settings: this.settings, tick: this.world.tick, roster: this.roster() }));
  }

  private onDisconnect(c: Client) {
    c.ws = null;
    if (this.phase === 'playing' && c.seat >= 0) c.disconnectedAt = Date.now();
    else this.dropClient(c);
    this.broadcastLobby();
  }

  private dropClient(c: Client) {
    this.clients.delete(c.id);
    // a fighter who is gone for good forfeits
    if (this.world && this.phase === 'playing' && c.seat >= 0 && this.world.phase !== 'over') {
      this.world.forfeit(c.seat);
    }
    if (c.host && this.floatingHost) {
      const next = [...this.clients.values()].find((x) => x.ws);
      if (next) {
        next.host = true;
        this.send(next, encodeJson(Msg.Notice, { kind: 'info', text: 'The host left - you are the host now.' }));
      }
    }
    // a spectator takes the empty seat in the lobby
    if (this.phase === 'lobby' && c.seat >= 0) {
      const waiting = [...this.clients.values()].find((x) => x.seat < 0);
      if (waiting) waiting.seat = c.seat;
    }
  }

  private allocId() {
    for (let i = 0; i < 250; i++) if (!this.clients.has(i) && this.bot?.id !== i) return i;
    throw new Error('no ids');
  }

  private onMessage(c: Client, data: Uint8Array) {
    const type = msgType(data);
    if (type !== Msg.Input) {
      if (c.msgBudget < 1) {
        if (++c.strikes > 200) c.ws?.close(4004, 'flood');
        return;
      }
      c.msgBudget--;
    }
    switch (type) {
      case Msg.Input: {
        if (!this.world) return;
        const f = this.world.fighters.get(c.id);
        if (!f) return;
        c.inputBudget += Math.max(1, data[1] ?? 1);
        if (c.inputBudget > MAX_INPUTS_PER_SEC) {
          if (c.inputBudget > MAX_INPUTS_PER_SEC * 3) c.ws?.close(4004, 'input flood');
          return;
        }
        for (const cmd of decodeInputs(data)) {
          if (cmd.seq <= f.lastSeq || (f.inputs.length && cmd.seq <= f.inputs[f.inputs.length - 1].seq)) continue;
          if (!Number.isFinite(cmd.moveX) || !Number.isFinite(cmd.moveY)) continue;
          if (cmd.viewTick > c.viewTick && cmd.viewTick <= this.world.tick) c.viewTick = cmd.viewTick;
          f.inputs.push(cmd);
        }
        break;
      }
      case Msg.Ping:
        this.send(c, encodePing(decodePing(data), Msg.Pong));
        break;
      case Msg.Lobby:
        this.onLobbyCmd(c, decodeJson<LobbyCmd>(data));
        break;
      case Msg.Chat: {
        const { text } = decodeJson<{ text: string }>(data);
        const clean = String(text ?? '').replace(/[\u0000-\u001f]/g, '').slice(0, 80).trim();
        if (clean) this.broadcast(encodeJson(Msg.ChatMsg, { id: c.id, text: clean }));
        break;
      }
      default:
        c.strikes++;
    }
  }

  private onLobbyCmd(c: Client, cmd: LobbyCmd) {
    switch (cmd.op) {
      case 'rename':
        c.name = sanitizeName(cmd.name);
        c.color = sanitizeColor(cmd.color);
        if (cmd.look !== undefined) c.look = sanitizeLook(cmd.look);
        {
          const f = this.world?.fighters.get(c.id);
          if (f) f.name = c.name;
        }
        break;
      case 'loadout':
        c.load = sanitizeLoadout(cmd.load);
        // between rounds the new loadout applies from the next match
        break;
      case 'seat':
        if (this.phase !== 'lobby') break;
        if (cmd.seat === -1) c.seat = -1;
        else if ((cmd.seat === 0 || cmd.seat === 1) && !this.seatTaken(cmd.seat, c)) c.seat = cmd.seat;
        break;
      default:
        if (!c.host) return;
        if (cmd.op === 'settings' && this.phase === 'lobby') {
          const s = cmd.settings;
          if (typeof s.arenaId === 'string' && ARENAS.some((a) => a.id === s.arenaId)) this.settings.arenaId = s.arenaId;
          if (typeof s.wins === 'number') this.settings.wins = clampInt(s.wins, 1, 3);
          if (typeof s.roundTime === 'number') this.settings.roundTime = clampInt(s.roundTime, 30, 180);
        } else if (cmd.op === 'bot') {
          this.botOn = !!cmd.on;
        } else if (cmd.op === 'botLevel' && (cmd.level === 'easy' || cmd.level === 'normal' || cmd.level === 'hard')) {
          this.botLevel = cmd.level;
        } else if (cmd.op === 'start' && this.phase === 'lobby') {
          if (!this.startMatch()) this.send(c, encodeJson(Msg.Notice, { kind: 'info', text: 'Two fighters are needed: wait for an opponent or turn on the bot.' }));
        } else if (cmd.op === 'rematch' && this.phase === 'results') {
          this.phase = 'lobby';
          this.world = null;
          if (!this.startMatch()) this.endToLobby();
        } else if (cmd.op === 'kick') {
          const t = this.clients.get(cmd.id);
          if (t && t !== c) {
            t.ws?.close(4007, 'kicked');
            this.dropClient(t);
            if (this.banned.size > 256) this.banned.clear();
            this.banned.set(t.addr, Date.now() + KICK_BAN_MS);
          }
        } else if (cmd.op === 'toLobby') {
          this.endToLobby();
        }
    }
    this.broadcastLobby();
  }

  // ------------------------------------------------------------ match flow

  /** Start a duel; false when a seat cannot be filled. */
  startMatch(): boolean {
    for (const c of this.clients.values()) {
      c.viewTick = c.snapAt = 0;
      c.viewBase = -1;
    }
    // drop seats held by people who left
    for (const c of [...this.clients.values()]) if (!c.ws) this.clients.delete(c.id);
    const fighters: (Client | null)[] = [null, null];
    for (const c of this.clients.values()) if (c.seat === 0 || c.seat === 1) fighters[c.seat] = c;
    // check before seating anyone: a refused start must not move a spectator into a seat
    const watchers = [...this.clients.values()].filter((x) => x.seat < 0);
    if (watchers.length === 0 && fighters.every((f) => !f)) return false;
    const open = fighters.filter((f) => !f).length;
    if (open > watchers.length && !this.botOn) return false;
    // an empty seat goes to a spectator first, then the bot
    for (const seat of [0, 1]) {
      if (fighters[seat]) continue;
      const watcher = watchers.shift();
      if (watcher) {
        watcher.seat = seat;
        fighters[seat] = watcher;
      }
    }
    this.lastSnapTick = 0;
    this.world = new World({ ...this.settings });
    if (this.opts.maxRewindSec) this.world.maxRewind = Math.min(60, Math.round(this.opts.maxRewindSec * TICK_RATE));
    this.bot = null;
    for (const seat of [0, 1]) {
      const c = fighters[seat];
      if (c) {
        const f = this.world.addFighter(c.id, seat, c.name, c.load);
        this.world.resetInputs(f);
      } else {
        const id = this.allocId();
        const seed = (Math.random() * 1e9) | 0;
        const name = BOT_NAMES[seed % BOT_NAMES.length];
        this.bot = { id, name, color: (seed >> 3) % 12, look: botLook(seed), load: botLoadout(seed), seat, brain: new BotBrain(id, seed, this.botLevel) };
        this.world.addFighter(id, seat, name, this.bot.load, true);
      }
    }
    this.world.start();
    this.phase = 'playing';
    this.broadcast(encodeJson(Msg.MatchStart, { settings: this.settings, tick: this.world.tick, roster: this.roster() }));
    this.broadcastLobby();
    return true;
  }

  private endToLobby() {
    this.phase = 'lobby';
    this.world = null;
    this.bot = null;
    for (const c of [...this.clients.values()]) if (!c.ws) this.dropClient(c);
    this.broadcastLobby();
  }

  start() {
    this.nextTickAt = performance.now();
    const loop = () => {
      const now = performance.now();
      let n = 0;
      const late = now - this.nextTickAt;
      try {
        while (now >= this.nextTickAt && n < 5) {
          this.nextTickAt += 1000 / TICK_RATE;
          n++;
          this.tick();
        }
        if (n) this.maybeSnapshot();
      } catch (e) {
        console.error(`room ${this.serverName}: tick failed`, e);
      }
      if (n) {
        this.stats.lateMs.push(Math.max(0, late));
        if (this.stats.lateMs.length > 3600) this.stats.lateMs.splice(0, 1800);
      }
      if (now - this.nextTickAt > 250) this.nextTickAt = now;
      this.timer = setTimeout(loop, Math.max(0, this.nextTickAt - performance.now() - 1));
    };
    loop();
    this.sweeper = setInterval(() => this.sweep(), 1000);
  }

  /** Once a second: refill rate budgets and drop fighters whose reconnect grace has run out. */
  sweep() {
    for (const c of this.clients.values()) {
      c.inputBudget = 0;
      c.msgBudget = Math.min(MSG_BURST, c.msgBudget + MSG_RATE);
    }
    const now = Date.now();
    for (const c of [...this.clients.values()])
      if (!c.ws && c.disconnectedAt && now - c.disconnectedAt > RECONNECT_GRACE_MS) {
        this.dropClient(c);
        this.broadcastLobby();
      }
  }

  stop() {
    if (this.timer) clearTimeout(this.timer);
    if (this.sweeper) clearInterval(this.sweeper);
  }

  /** One simulation tick (public for tests and the in-browser room). */
  tick() {
    const w = this.world;
    if (!w) return;
    const t0 = performance.now();
    if (this.bot) {
      const f = w.fighters.get(this.bot.id);
      if (f) f.inputs.push(this.bot.brain.think(w));
    }
    w.step();
    // the match ended in play (last round won) or by forfeit (a fighter left, see dropClient); both go to results here
    if (w.phase === 'over' && this.phase === 'playing') {
      this.phase = 'results';
      this.resultsUntil = w.tick + RESULTS_SECONDS * TICK_RATE;
      const winnerId = w.seats[w.winner] ?? -1;
      const msg: MatchEndMsg = { rows: this.scoreRows(), wins: [w.wins[0], w.wins[1]], winner: w.winner, winnerId, nextIn: RESULTS_SECONDS };
      this.broadcast(encodeJson(Msg.MatchEnd, msg));
      this.broadcastLobby();
    }
    if (this.phase === 'results') {
      // keep stepping (victory poses) until the results time is up
      if (w.tick >= this.resultsUntil) this.endToLobby();
    }
    const dt = performance.now() - t0;
    this.stats.tickMs.push(dt);
    if (this.stats.tickMs.length > 3600) this.stats.tickMs.splice(0, 1800);
  }

  // ------------------------------------------------------------ messaging

  private scoreRows(): ScoreRow[] {
    if (!this.world) return [];
    return [...this.world.fighters.values()].map((f) => ({ id: f.id, seat: f.seat, rounds: f.roundsWon, dealt: Math.round(f.dealt), hits: f.hits }));
  }

  roster(): RosterEntry[] {
    const out: RosterEntry[] = [];
    for (const c of this.clients.values())
      out.push({ id: c.id, name: c.name, color: c.color, bot: false, host: c.host, ping: Math.round(c.ping), look: c.look, load: c.load, seat: c.seat });
    if (this.bot && this.world) {
      const b = this.bot;
      out.push({ id: b.id, name: b.name, color: b.color, bot: true, host: false, ping: 0, look: b.look, load: b.load, seat: b.seat });
    }
    return out;
  }

  lobbyState(): LobbyStateMsg {
    const host = [...this.clients.values()].find((c) => c.host);
    return {
      phase: this.phase, hostId: host ? host.id : -1, settings: this.settings, roster: this.roster(), maxPlayers: MAX_PLAYERS, bot: this.botOn,
      botLevel: this.botLevel, serverName: this.serverName,
    };
  }

  private maybeSnapshot() {
    const w = this.world;
    const every = this.opts.snapshotInterval ?? SNAPSHOT_INTERVAL;
    if (!w || w.tick - this.lastSnapTick < every) return;
    this.lastSnapTick = w.tick;
    const body = encodeSnapshotBody(w, w.events);
    w.events = [];
    for (const c of this.clients.values()) {
      if (!c.ws || c.ws.bufferedAmount > SNAPSHOT_BACKLOG) continue;
      if (c.viewTick > 0) {
        const age = w.tick - c.viewTick;
        c.viewBase = c.viewBase < 0 || age < c.viewBase ? age : c.viewBase + VIEW_BASE_RISE;
        if (age - c.viewBase > STALE_VIEW && w.tick - c.snapAt < PROBE_EVERY) continue;
      }
      c.snapAt = w.tick;
      this.send(c, encodeSnapshot(w, c.id, body));
    }
  }

  broadcastLobby() {
    const st = this.lobbyState();
    const json = JSON.stringify(st);
    if (json === this.lastLobbyJson) return;
    this.lastLobbyJson = json;
    for (const c of this.clients.values()) {
      if (!c.ws) continue;
      this.send(c, encodeJson(Msg.LobbyState, st));
    }
    this.broadcast(encodeJson(Msg.Roster, st.roster));
  }

  private broadcast(data: Uint8Array) {
    for (const c of this.clients.values()) this.send(c, data);
  }

  private send(c: Client, data: Uint8Array) {
    if (!c.ws || c.ws.readyState !== 1) return;
    if (c.ws.bufferedAmount > MAX_BUFFERED) {
      c.ws.close(4008, 'too slow');
      return;
    }
    this.stats.bytesOut += data.length;
    c.ws.send(data);
  }

  /** Record a client's measured ping (the server's pong handler cannot see it; the client reports nothing). */
  info() {
    return {
      name: this.serverName, v: PROTOCOL_VERSION, phase: this.phase, players: this.clients.size, max: MAX_PLAYERS, arena: this.settings.arenaId,
      fighters: [...this.clients.values()].filter((c) => c.seat >= 0).length,
    };
  }
}

function sanitizeName(n: unknown) {
  const s = String(n ?? '').replace(/[^\p{L}\p{N} _.\-]/gu, '').trim().slice(0, 16);
  return s || 'Duelist';
}

function clampInt(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, Math.round(Number(v) || 0)));
}
