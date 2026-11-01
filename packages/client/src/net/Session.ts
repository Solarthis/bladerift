import {
  decodeJson, decodePing, decodeSnapshot, encodeInputs, encodeJson, encodePing, InputCmd, Loadout, LobbyCmd, LobbyStateMsg,
  MatchEndMsg, MatchStartMsg, Msg, msgType, PlayerLook, PROTOCOL_VERSION, Room, RosterEntry, WelcomeMsg,
} from '@bladerift/shared';
import { NetGame } from './NetGame';
import { LocalTransport, Transport, WsTransport } from './transport';
import { DirectLink, RtcTransport } from './p2p';

type Listener<T> = (v: T) => void;

class Emitter<E extends Record<string, unknown>> {
  private l: { [K in keyof E]?: Listener<E[K]>[] } = {};
  on<K extends keyof E>(k: K, f: Listener<E[K]>) {
    (this.l[k] ??= []).push(f);
    return () => {
      this.l[k] = this.l[k]!.filter((x) => x !== f);
    };
  }
  emit<K extends keyof E>(k: K, v: E[K]) {
    for (const f of this.l[k] ?? []) f(v);
  }
}

export interface SessionEvents extends Record<string, unknown> {
  status: 'connecting' | 'connected' | 'reconnecting' | 'closed';
  lobby: LobbyStateMsg;
  match: NetGame;
  end: MatchEndMsg;
  notice: { kind: string; text: string };
  chat: { id: number; text: string };
}

export interface Profile {
  name: string;
  color: number;
  look?: PlayerLook;
  load: Loadout;
}

export type Target = { kind: 'local'; room: Room; owns: boolean } | { kind: 'ws'; url: string } | { kind: 'rtc'; link: DirectLink };

/** One connection to a game host (online / LAN WebSocket, or a room in this page). */
export class Session extends Emitter<SessionEvents> {
  transport: Transport | null = null;
  selfId = -1;
  isHost = false;
  lobby: LobbyStateMsg | null = null;
  roster = new Map<number, RosterEntry>();
  game: NetGame | null = null;
  rtt = 0;
  private resume = '';
  private pingTimer = 0;
  private closedByUser = false;
  private retries = 0;
  private lastMsgAt = 0;
  private batch: InputCmd[] = [];

  constructor(
    readonly target: Target,
    public profile: Profile,
    private hostKey?: string,
    private matchExists?: () => Promise<boolean | null>,
  ) {
    super();
  }

  get local() {
    return this.target.kind === 'local';
  }

  connect() {
    this.closedByUser = false;
    this.emit('status', this.retries ? 'reconnecting' : 'connecting');
    const tg = this.target;
    const t = tg.kind === 'local' ? new LocalTransport(tg.room, tg.owns) : tg.kind === 'rtc' ? new RtcTransport(tg.link) : new WsTransport(tg.url);
    if (this.target.kind === 'local') this.hostKey = 'local';
    this.transport = t;
    t.onOpen = () => {
      this.retries = 0;
      const p = this.profile;
      t.send(encodeJson(Msg.Hello, { v: PROTOCOL_VERSION, name: p.name, color: p.color, look: p.look, load: p.load, hostKey: this.hostKey, resume: this.resume }));
      this.emit('status', 'connected');
      clearInterval(this.pingTimer);
      this.lastMsgAt = performance.now();
      this.pingTimer = window.setInterval(() => {
        if (t instanceof WsTransport && performance.now() - this.lastMsgAt > 6000) return t.drop();
        t.send(encodePing(performance.now()));
      }, 1000);
    };
    t.onMessage = (d) => {
      this.lastMsgAt = performance.now();
      this.onMessage(d);
    };
    t.onClose = (code, reason) => {
      clearInterval(this.pingTimer);
      if (this.closedByUser) return;
      if (code === 4005) window.dispatchEvent(new Event('bladerift:version-mismatch'));
      if (code >= 4000 && code !== 4000) {
        this.emit('notice', { kind: 'error', text: closeText(code, reason) });
        this.emit('status', 'closed');
        return;
      }
      if (this.target.kind === 'ws' && this.retries < 8) {
        this.retries++;
        this.emit('status', 'reconnecting');
        const retry = () => setTimeout(() => !this.closedByUser && this.connect(), Math.min(4000, 400 * this.retries));
        if (this.retries === 2 && this.matchExists)
          void this.matchExists().then((ok) => {
            if (this.closedByUser) return;
            if (ok !== false) return retry();
            this.emit('notice', { kind: 'error', text: 'That match has ended (the host closed it or the online server restarted).' });
            this.emit('status', 'closed');
          });
        else retry();
      } else this.emit('status', 'closed');
    };
  }

  close() {
    this.closedByUser = true;
    clearInterval(this.pingTimer);
    // a player who leaves on purpose says so first: the server then gives up their seat at once (a dropped connection
    // keeps it for 20 s, so the other player would wait that long for a leaver). Older servers ignore the message.
    if (this.target.kind === 'ws') this.transport?.send(encodeJson(Msg.Lobby, { op: 'leave' }));
    this.transport?.close();
    this.transport = null;
  }

  sendInput(cmd: InputCmd) {
    this.batch.push(cmd);
    if (this.batch.length >= 2) this.flushInputs();
  }

  flushInputs() {
    if (!this.batch.length) return;
    this.transport?.send(encodeInputs(this.batch));
    this.batch = [];
  }

  lobbyCmd(cmd: LobbyCmd) {
    if (cmd.op === 'loadout') this.profile.load = cmd.load;
    this.transport?.send(encodeJson(Msg.Lobby, cmd));
  }

  chat(text: string) {
    this.transport?.send(encodeJson(Msg.Chat, { text }));
  }

  /** The roster entry in a fighter seat. */
  inSeat(seat: number) {
    for (const r of this.roster.values()) if (r.seat === seat) return r;
    return undefined;
  }

  private onMessage(d: Uint8Array) {
    switch (msgType(d)) {
      case Msg.Snapshot:
        if (this.game) this.game.onSnapshot(decodeSnapshot(d));
        break;
      case Msg.Pong: {
        const sample = performance.now() - decodePing(d);
        this.rtt = this.rtt ? this.rtt * 0.8 + sample * 0.2 : sample;
        break;
      }
      case Msg.Welcome: {
        const w = decodeJson<WelcomeMsg>(d);
        this.selfId = w.id;
        this.isHost = w.host;
        this.resume = w.resume;
        if (this.game) this.game.selfId = w.id;
        break;
      }
      case Msg.LobbyState: {
        const l = decodeJson<LobbyStateMsg>(d);
        this.lobby = l;
        this.isHost = l.hostId === this.selfId;
        this.setRoster(l.roster);
        if (l.phase === 'lobby' && this.game) this.game = null;
        this.emit('lobby', l);
        break;
      }
      case Msg.Roster:
        this.setRoster(decodeJson<RosterEntry[]>(d));
        break;
      case Msg.MatchStart: {
        const m = decodeJson<MatchStartMsg>(d);
        this.setRoster(m.roster);
        this.game = new NetGame(m.settings, this.selfId, !!this.matchExists || this.target.kind === 'rtc', this.local);
        this.game.load = this.roster.get(this.selfId)?.seat !== undefined && this.roster.get(this.selfId)!.seat >= 0 ? this.roster.get(this.selfId)!.load : null;
        this.emit('match', this.game);
        break;
      }
      case Msg.MatchEnd:
        this.emit('end', decodeJson<MatchEndMsg>(d));
        break;
      case Msg.Notice:
        this.emit('notice', decodeJson(d));
        break;
      case Msg.ChatMsg:
        this.emit('chat', decodeJson(d));
        break;
    }
  }

  private setRoster(r: RosterEntry[]) {
    this.roster = new Map(r.map((e) => [e.id, e]));
  }
}

function closeText(code: number, reason: string) {
  switch (code) {
    case 4005: return 'Your game version does not match the host. Refresh to update.';
    case 4006: return 'That match is full.';
    case 4007: return 'You were removed from the match by the host.';
    case 4010: return 'This online match has ended.';
    case 4011: return 'The online server restarted for an update. Start a new match in a minute.';
    default: return reason || 'Disconnected from host.';
  }
}
