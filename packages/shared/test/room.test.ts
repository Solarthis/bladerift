import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Room, RoomOptions, RoomSocket, SocketHandlers } from '../src/room';
import {
  decodeJson, decodePing, decodeSnapshot, encodeInputs, encodeJson, encodePing, HelloMsg, LobbyCmd, LobbyStateMsg, MatchEndMsg,
  Msg, msgType, RosterEntry, WelcomeMsg,
} from '../src/protocol';
import { MAX_PLAYERS, PROTOCOL_VERSION, TICK_RATE } from '../src/constants';
import { SkillId, WeaponId } from '../src/weapons';
import { DEFAULT_LOADOUT } from '../src/heroes';
import type { InputCmd } from '../src/input';

const KEY = 'host-key';
const KICK_BAN_MS = 10 * 60_000;
const GRACE_MS = 20_000;

/** In-memory socket: records what the room sends and how it was closed. */
class FakeSocket implements RoomSocket {
  readonly sent: Uint8Array[] = [];
  closed: { code?: number; reason?: string } | null = null;
  readonly bufferedAmount = 0;
  get readyState() {
    return this.closed ? 3 : 1;
  }
  send(data: Uint8Array) {
    this.sent.push(data);
  }
  close(code?: number, reason?: string) {
    if (!this.closed) this.closed = { code, reason };
  }
  frames(type: Msg): Uint8Array[] {
    return this.sent.filter((d) => msgType(d) === type);
  }
  json<T>(type: Msg): T[] {
    return this.frames(type).map((d) => decodeJson<T>(d));
  }
}

interface Conn {
  sock: FakeSocket;
  h: SocketHandlers;
  /** From the Welcome message; -1 when the room never welcomed this socket. */
  id: number;
  resume: string;
  host: boolean;
  addr: string;
}

interface Notice { kind: string; text: string }

function makeRoom(opts?: RoomOptions, hostKey = KEY) {
  return new Room(hostKey, 'Test Room', false, opts);
}

/** A socket that has not said hello yet. */
function raw(room: Room, addr: string) {
  const sock = new FakeSocket();
  const h = room.attach(sock, addr);
  return { sock, h, addr };
}

/** Attach and send a hello. The address defaults to one unique to the name. */
function connect(room: Room, name: string, extra: Partial<HelloMsg> & { addr?: string } = {}): Conn {
  const { addr = `addr:${name}`, ...rest } = extra;
  const { sock, h } = raw(room, addr);
  h.message(encodeJson(Msg.Hello, { v: PROTOCOL_VERSION, name, color: 0, ...rest }));
  const welcome = sock.json<WelcomeMsg>(Msg.Welcome)[0];
  return { sock, h, id: welcome?.id ?? -1, resume: welcome?.resume ?? '', host: welcome?.host ?? false, addr };
}

function lobby(c: { h: SocketHandlers }, cmd: LobbyCmd) {
  c.h.message(encodeJson(Msg.Lobby, cmd));
}

/** Network drop: the socket goes away and the room hears about it. */
function drop(c: Conn) {
  c.sock.close(1006, 'gone');
  c.h.close();
}

function rosterOf(room: Room, id: number): RosterEntry | undefined {
  return room.roster().find((r) => r.id === id);
}

function seatOf(room: Room, id: number) {
  return rosterOf(room, id)?.seat;
}

/** Two keyed-host players, the host (seat 0) and a human in seat 1, match started. */
function duel(room = makeRoom()) {
  const a = connect(room, 'Ann', { hostKey: KEY });
  const b = connect(room, 'Ben');
  lobby(a, { op: 'start' });
  expect(room.phase).toBe('playing');
  return { room, a, b };
}

/** Host with the bot on, playing alone against the bot, tuned for a short match. */
function botMatch(opts?: RoomOptions) {
  const room = makeRoom(opts);
  const a = connect(room, 'Ann', { hostKey: KEY });
  lobby(a, { op: 'settings', settings: { wins: 1, roundTime: 30 } });
  lobby(a, { op: 'bot', on: true });
  lobby(a, { op: 'start' });
  expect(room.phase).toBe('playing');
  return { room, a };
}

function tickUntil(room: Room, done: () => boolean, max: number) {
  for (let i = 0; i < max && !done(); i++) room.tick();
  return done();
}

function inputs(seqs: number[]): Uint8Array {
  return encodeInputs(seqs.map((seq): InputCmd => ({ seq, moveX: 0, moveY: 0, buttons: 0, viewTick: 0 })));
}

describe('room: seating and connections', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('seats the first two joiners in fighter seats 0 and 1 and the third watches', () => {
    const room = makeRoom();
    const a = connect(room, 'Ann');
    const b = connect(room, 'Ben');
    const c = connect(room, 'Cy');
    expect(seatOf(room, a.id)).toBe(0);
    expect(seatOf(room, b.id)).toBe(1);
    expect(seatOf(room, c.id)).toBe(-1);
  });

  it('only a keyed client is the host', () => {
    const room = makeRoom();
    const guest = connect(room, 'Guest');
    const host = connect(room, 'Host', { hostKey: KEY });
    expect(guest.host).toBe(false);
    expect(host.host).toBe(true);
    expect(room.lobbyState().hostId).toBe(host.id);
  });

  it('welcome carries the player id, protocol version, resume token and tick rate', () => {
    const room = makeRoom();
    const a = connect(room, 'Ann');
    const welcome = a.sock.json<WelcomeMsg>(Msg.Welcome)[0];
    expect(welcome).toEqual({ id: a.id, v: PROTOCOL_VERSION, host: false, resume: a.resume, tickRate: TICK_RATE });
    expect(a.resume).toMatch(/^[0-9a-f]{24}$/);
    expect(a.sock.json<LobbyStateMsg>(Msg.LobbyState)[0].maxPlayers).toBe(MAX_PLAYERS);
  });

  it('a version mismatch gets an error notice and is closed with 4005 without a welcome', () => {
    const room = makeRoom();
    const { sock, h } = raw(room, 'old');
    h.message(encodeJson(Msg.Hello, { v: PROTOCOL_VERSION + 1, name: 'Old', color: 0 }));
    expect(sock.closed?.code).toBe(4005);
    expect(sock.json<Notice>(Msg.Notice)[0].text).toMatch(/Version mismatch/);
    expect(sock.frames(Msg.Welcome)).toHaveLength(0);
    expect(room.clients.size).toBe(0);
  });

  it('the first frame must be a hello, otherwise the socket is closed with 4003', () => {
    const room = makeRoom();
    const { sock, h } = raw(room, 'eager');
    h.message(encodePing(1));
    expect(sock.closed?.code).toBe(4003);
    expect(room.clients.size).toBe(0);
  });

  it('a hello that is not valid JSON closes the socket with 4004', () => {
    const room = makeRoom();
    const { sock, h } = raw(room, 'junk');
    h.message(new Uint8Array([Msg.Hello, 0x7b]));
    expect(sock.closed?.code).toBe(4004);
    expect(room.clients.size).toBe(0);
  });

  it('frames over 4 KB are refused before anything else is read', () => {
    const room = makeRoom();
    const { sock, h } = raw(room, 'big');
    h.message(new Uint8Array(4097));
    expect(sock.closed?.code).toBe(4002);
  });

  it('a silent socket is closed after the 5 s hello timeout and its slot is released', () => {
    const room = makeRoom();
    const { sock, h } = raw(room, 'quiet');
    vi.advanceTimersByTime(4_999);
    expect(sock.closed).toBeNull();
    vi.advanceTimersByTime(1);
    expect(sock.closed?.code).toBe(4000);
    h.close();
  });

  it('pending (not yet greeted) sockets are capped at 32; a slot frees when one closes', () => {
    const room = makeRoom();
    const quiet = Array.from({ length: 32 }, (_, i) => raw(room, `q${i}`));
    const extra = raw(room, 'extra');
    expect(extra.sock.closed?.code).toBe(4009);
    quiet[0].sock.close(1000, 'bye');
    quiet[0].h.close();
    const next = raw(room, 'next');
    expect(next.sock.closed).toBeNull();
  });

  it('a room holds MAX_PLAYERS people; the next one is told it is full and closed with 4006', () => {
    const room = makeRoom();
    connect(room, 'Host', { hostKey: KEY });
    for (let i = 1; i < MAX_PLAYERS; i++) connect(room, `P${i}`);
    expect(room.clients.size).toBe(MAX_PLAYERS);
    const late = connect(room, 'Late');
    expect(late.id).toBe(-1);
    expect(late.sock.closed?.code).toBe(4006);
    expect(late.sock.json<Notice>(Msg.Notice)[0].text).toMatch(/full/);
  });

  it('without a host the last seat is kept free for the host', () => {
    const room = makeRoom();
    for (let i = 0; i < MAX_PLAYERS - 1; i++) connect(room, `P${i}`);
    const eighth = connect(room, 'Eighth');
    expect(eighth.sock.closed?.code).toBe(4006);
    const host = connect(room, 'Host', { hostKey: KEY });
    expect(host.id).toBeGreaterThanOrEqual(0);
    expect(host.host).toBe(true);
  });

  it('with handOffHost the longest-connected player becomes host when the host leaves', () => {
    const room = makeRoom({ handOffHost: true });
    const host = connect(room, 'Host');
    const guest = connect(room, 'Guest');
    expect(host.host).toBe(true);
    drop(host);
    expect(rosterOf(room, guest.id)?.host).toBe(true);
    expect(guest.sock.json<Notice>(Msg.Notice).at(-1)?.text).toMatch(/you are the host/);
  });

  it('a lobby disconnect frees the client at once and a waiting spectator takes the seat', () => {
    const room = makeRoom();
    const a = connect(room, 'Ann');
    const b = connect(room, 'Ben');
    const c = connect(room, 'Cy');
    drop(b);
    expect(rosterOf(room, b.id)).toBeUndefined();
    expect(seatOf(room, c.id)).toBe(1);
    expect(seatOf(room, a.id)).toBe(0);
  });

  it('a joiner during a match watches', () => {
    const { room } = duel();
    const late = connect(room, 'Late');
    expect(seatOf(room, late.id)).toBe(-1);
  });

  it('the seat command takes a free seat, refuses a taken one and lets a player step out', () => {
    const room = makeRoom();
    const a = connect(room, 'Ann', { hostKey: KEY });
    connect(room, 'Ben');
    const c = connect(room, 'Cy');
    expect(seatOf(room, c.id)).toBe(-1);
    lobby(c, { op: 'seat', seat: 1 });
    expect(seatOf(room, c.id)).toBe(-1);
    lobby(a, { op: 'seat', seat: -1 });
    expect(seatOf(room, a.id)).toBe(-1);
    lobby(c, { op: 'seat', seat: 0 });
    expect(seatOf(room, c.id)).toBe(0);
    lobby(c, { op: 'seat', seat: 7 });
    expect(seatOf(room, c.id)).toBe(0);
  });

  it('a seat command is ignored once the match is running', () => {
    const { room, b } = duel();
    lobby(b, { op: 'seat', seat: -1 });
    expect(seatOf(room, b.id)).toBe(1);
  });

  it('a reconnect with the resume token keeps the seat, rotates the token and resends the match', () => {
    const { room, b } = duel();
    drop(b);
    expect(seatOf(room, b.id)).toBe(1);
    const again = connect(room, 'Ben', { resume: b.resume });
    expect(again.id).toBe(b.id);
    expect(again.resume).not.toBe(b.resume);
    expect(seatOf(room, b.id)).toBe(1);
    expect(again.sock.json(Msg.MatchStart)).toHaveLength(1);
  });

  it('a stale resume token joins as a new player', () => {
    const { room, b } = duel();
    drop(b);
    const stranger = connect(room, 'Ben', { resume: 'not-a-token' });
    expect(stranger.id).not.toBe(b.id);
    expect(seatOf(room, stranger.id)).toBe(-1);
  });

  it('a loadout sent in the hello is sanitised', () => {
    const room = makeRoom();
    const a = connect(room, 'Ann', { load: { weapons: [WeaponId.Sword, WeaponId.Sword], skill: 99 } as never });
    expect(rosterOf(room, a.id)?.load.weapons[0]).toBe(rosterOf(room, a.id)?.load.weapons[1]);
    expect(rosterOf(room, a.id)?.load.skill).toBe(DEFAULT_LOADOUT.skill);
  });
});

describe('room: lobby commands and host control', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('only the host can start: a non-host start is ignored', () => {
    const room = makeRoom();
    connect(room, 'Ann', { hostKey: KEY });
    const b = connect(room, 'Ben');
    lobby(b, { op: 'start' });
    expect(room.phase).toBe('lobby');
    expect(b.sock.frames(Msg.MatchStart)).toHaveLength(0);
  });

  it('start with one fighter and the bot off fails with a notice to the host', () => {
    const room = makeRoom();
    const a = connect(room, 'Ann', { hostKey: KEY });
    lobby(a, { op: 'start' });
    expect(room.phase).toBe('lobby');
    expect(room.world).toBeNull();
    const notice = a.sock.json<Notice>(Msg.Notice).at(-1);
    expect(notice?.kind).toBe('info');
    expect(notice?.text).toMatch(/Two fighters/);
  });

  it('a failed start leaves the lobby seats as they were', () => {
    const room = makeRoom();
    const a = connect(room, 'Ann', { hostKey: KEY });
    lobby(a, { op: 'seat', seat: -1 });
    lobby(a, { op: 'start' });
    expect(room.phase).toBe('lobby');
    expect(seatOf(room, a.id)).toBe(-1);
  });

  it('start with one fighter and the bot on puts a bot in the empty seat and broadcasts MatchStart', () => {
    const room = makeRoom();
    const a = connect(room, 'Ann', { hostKey: KEY });
    lobby(a, { op: 'bot', on: true });
    lobby(a, { op: 'start' });
    expect(room.phase).toBe('playing');
    expect(room.bot).not.toBeNull();
    expect(room.bot!.seat).toBe(1);
    expect(room.world!.fighters.get(room.bot!.id)?.bot).toBe(true);
    expect(room.world!.seats).toEqual([a.id, room.bot!.id]);
    const roster = rosterOf(room, room.bot!.id);
    expect(roster?.bot).toBe(true);
    expect(roster?.seat).toBe(1);
    const start = a.sock.json<{ roster: RosterEntry[] }>(Msg.MatchStart)[0];
    expect(start.roster.some((r) => r.bot)).toBe(true);
  });

  it('the bot takes whichever seat is empty', () => {
    const room = makeRoom({ handOffHost: true });
    const a = connect(room, 'Ann', { hostKey: KEY });
    const b = connect(room, 'Ben');
    drop(a);
    expect(seatOf(room, b.id)).toBe(1);
    expect(rosterOf(room, b.id)?.host).toBe(true);
    lobby(b, { op: 'bot', on: true });
    lobby(b, { op: 'start' });
    expect(room.phase).toBe('playing');
    expect(room.bot!.seat).toBe(0);
    expect(room.world!.seats).toEqual([room.bot!.id, b.id]);
  });

  it('a waiting spectator fills an empty seat before the bot does', () => {
    const room = makeRoom();
    const a = connect(room, 'Ann', { hostKey: KEY });
    const b = connect(room, 'Ben');
    lobby(b, { op: 'seat', seat: -1 });
    lobby(a, { op: 'bot', on: true });
    lobby(a, { op: 'start' });
    expect(room.phase).toBe('playing');
    expect(room.bot).toBeNull();
    expect(seatOf(room, b.id)).toBe(1);
  });

  it('spectators alone can start: with the bot on a lone spectator takes a seat and the bot the other', () => {
    const room = makeRoom();
    const a = connect(room, 'Ann', { hostKey: KEY });
    lobby(a, { op: 'seat', seat: -1 });
    lobby(a, { op: 'bot', on: true });
    lobby(a, { op: 'start' });
    expect(room.phase).toBe('playing');
    expect(seatOf(room, a.id)).toBe(0);
    expect(room.bot!.seat).toBe(1);
  });

  it('two spectators and no fighters start without the bot, each taking a seat', () => {
    const room = makeRoom();
    const a = connect(room, 'Ann', { hostKey: KEY });
    const b = connect(room, 'Ben');
    lobby(a, { op: 'seat', seat: -1 });
    lobby(b, { op: 'seat', seat: -1 });
    lobby(a, { op: 'start' });
    expect(room.phase).toBe('playing');
    expect(room.bot).toBeNull();
    expect([seatOf(room, a.id), seatOf(room, b.id)].sort()).toEqual([0, 1]);
  });

  it('a non-host cannot change settings', () => {
    const room = makeRoom();
    connect(room, 'Ann', { hostKey: KEY });
    const b = connect(room, 'Ben');
    lobby(b, { op: 'settings', settings: { arenaId: 'crypt', wins: 3, roundTime: 60 } });
    expect(room.settings).toEqual({ arenaId: 'bridge', wins: 2, roundTime: 120 });
  });

  it('settings: a known arena is applied and an unknown arena is ignored', () => {
    const room = makeRoom();
    const a = connect(room, 'Ann', { hostKey: KEY });
    lobby(a, { op: 'settings', settings: { arenaId: 'crypt' } });
    expect(room.settings.arenaId).toBe('crypt');
    lobby(a, { op: 'settings', settings: { arenaId: 'nowhere' } });
    expect(room.settings.arenaId).toBe('crypt');
    lobby(a, { op: 'settings', settings: { arenaId: 42 as never } });
    expect(room.settings.arenaId).toBe('crypt');
  });

  it('settings: wins are clamped to 1..3 and round time to 30..180', () => {
    const room = makeRoom();
    const a = connect(room, 'Ann', { hostKey: KEY });
    const cases: [number, number][] = [[5, 3], [0, 1], [-4, 1], [2.6, 3], [2, 2]];
    for (const [input, out] of cases) {
      lobby(a, { op: 'settings', settings: { wins: input } });
      expect(room.settings.wins).toBe(out);
    }
    const times: [number, number][] = [[10, 30], [999, 180], [60, 60], [45.4, 45]];
    for (const [input, out] of times) {
      lobby(a, { op: 'settings', settings: { roundTime: input } });
      expect(room.settings.roundTime).toBe(out);
    }
  });

  it('settings: non-numeric wins and round time are ignored', () => {
    const room = makeRoom();
    const a = connect(room, 'Ann', { hostKey: KEY });
    lobby(a, { op: 'settings', settings: { wins: '3' as never, roundTime: '60' as never } });
    expect(room.settings).toEqual({ arenaId: 'bridge', wins: 2, roundTime: 120 });
  });

  it('settings cannot change while a match is running', () => {
    const { room, a } = duel();
    lobby(a, { op: 'settings', settings: { arenaId: 'grove', wins: 1 } });
    expect(room.settings.arenaId).toBe('bridge');
    expect(room.settings.wins).toBe(2);
  });

  it('bot toggle and difficulty: an unknown level is ignored', () => {
    const room = makeRoom();
    const a = connect(room, 'Ann', { hostKey: KEY });
    lobby(a, { op: 'bot', on: true });
    expect(room.botOn).toBe(true);
    lobby(a, { op: 'botLevel', level: 'hard' });
    expect(room.botLevel).toBe('hard');
    lobby(a, { op: 'botLevel', level: 'legendary' as never });
    expect(room.botLevel).toBe('hard');
    lobby(a, { op: 'bot', on: false });
    expect(room.botOn).toBe(false);
  });

  it("a loadout's weapons become the hero's kit, and its special is the hero's own", () => {
    const room = makeRoom();
    const a = connect(room, 'Ann', { hostKey: KEY });
    lobby(a, { op: 'loadout', load: { weapons: [WeaponId.Sword, WeaponId.Sword], skill: SkillId.LionsRoar, cls: 0 } });
    expect(rosterOf(room, a.id)?.load.weapons[0]).toBe(WeaponId.Sword);
    expect(rosterOf(room, a.id)?.load.weapons[1]).toBe(WeaponId.Sword);
    // both slots are always the hero's signature weapon (hero 1, an Archer: the bow)
    lobby(a, { op: 'loadout', load: { weapons: [WeaponId.Sword, WeaponId.Sword], skill: 99 as never, hero: 1 } });
    expect(rosterOf(room, a.id)?.load.weapons).toEqual([WeaponId.Bow, WeaponId.Bow]);
    // hero 1's own special (skill N belongs to hero N), whatever the skill sent
    expect(rosterOf(room, a.id)?.load.skill).toBe(SkillId.NineLives);
  });

  it('a loadout chosen in the lobby is the one the fighter starts the match with', () => {
    const room = makeRoom();
    const a = connect(room, 'Ann', { hostKey: KEY });
    const b = connect(room, 'Ben');
    lobby(b, { op: 'loadout', load: { weapons: [WeaponId.Sword, WeaponId.Bow], skill: SkillId.LionsRoar } });
    lobby(a, { op: 'start' });
    expect(room.world!.fighters.get(b.id)?.load.weapons).toEqual([WeaponId.Sword, WeaponId.Sword]);
  });

  it('names are cleaned: symbols stripped, capped at 16 characters, empty becomes Duelist', () => {
    const room = makeRoom();
    const a = connect(room, 'Ann', { hostKey: KEY });
    lobby(a, { op: 'rename', name: '<<  ok!!>>', color: 0 });
    expect(rosterOf(room, a.id)?.name).toBe('ok');
    lobby(a, { op: 'rename', name: 'a'.repeat(30), color: 0 });
    expect(rosterOf(room, a.id)?.name).toBe('a'.repeat(16));
    lobby(a, { op: 'rename', name: '!!!', color: 0 });
    expect(rosterOf(room, a.id)?.name).toBe('Duelist');
  });

  it('the host can kick a player: the socket closes with 4007, the player is removed and a spectator takes the seat', () => {
    const room = makeRoom();
    const a = connect(room, 'Ann', { hostKey: KEY });
    const b = connect(room, 'Ben');
    const c = connect(room, 'Cy');
    lobby(a, { op: 'kick', id: b.id });
    expect(b.sock.closed?.code).toBe(4007);
    expect(rosterOf(room, b.id)).toBeUndefined();
    expect(seatOf(room, c.id)).toBe(1);
  });

  it('a non-host cannot kick anyone', () => {
    const room = makeRoom();
    const a = connect(room, 'Ann', { hostKey: KEY });
    const b = connect(room, 'Ben');
    lobby(b, { op: 'kick', id: a.id });
    expect(a.sock.closed).toBeNull();
    expect(rosterOf(room, a.id)).toBeDefined();
  });

  it('a kicked player whose socket close arrives later does not promote a second spectator', () => {
    const room = makeRoom();
    const a = connect(room, 'Ann', { hostKey: KEY });
    const b = connect(room, 'Ben');
    const c = connect(room, 'Cy');
    const d = connect(room, 'Dee');
    lobby(a, { op: 'kick', id: b.id });
    b.h.close();
    expect(seatOf(room, c.id)).toBe(1);
    expect(seatOf(room, d.id)).toBe(-1);
    expect(room.roster().filter((r) => r.seat === 1)).toHaveLength(1);
  });

  it('a kicked address is refused for ten minutes; other addresses are not affected', () => {
    const room = makeRoom();
    const a = connect(room, 'Ann', { hostKey: KEY });
    const b = connect(room, 'Ben');
    lobby(a, { op: 'kick', id: b.id });
    b.h.close();
    const again = connect(room, 'Ben', { addr: b.addr });
    expect(again.id).toBe(-1);
    expect(again.sock.closed?.code).toBe(4007);
    const other = connect(room, 'Bo', { addr: 'addr:other' });
    expect(other.id).toBeGreaterThanOrEqual(0);
    vi.advanceTimersByTime(KICK_BAN_MS + 1_000);
    const later = connect(room, 'Ben', { addr: b.addr });
    expect(later.id).toBeGreaterThanOrEqual(0);
  });

  it('toLobby sends a running match back to the lobby and removes the bot', () => {
    const room = makeRoom();
    const a = connect(room, 'Ann', { hostKey: KEY });
    lobby(a, { op: 'bot', on: true });
    lobby(a, { op: 'start' });
    expect(room.bot).not.toBeNull();
    lobby(a, { op: 'toLobby' });
    expect(room.phase).toBe('lobby');
    expect(room.world).toBeNull();
    expect(room.bot).toBeNull();
    expect(room.roster().some((r) => r.bot)).toBe(false);
  });

  it('the room sends a LobbyState to everyone when the lobby changes', () => {
    const room = makeRoom();
    const a = connect(room, 'Ann', { hostKey: KEY });
    const b = connect(room, 'Ben');
    const before = b.sock.json<LobbyStateMsg>(Msg.LobbyState).length;
    lobby(a, { op: 'settings', settings: { roundTime: 45 } });
    const after = b.sock.json<LobbyStateMsg>(Msg.LobbyState);
    expect(after.length).toBe(before + 1);
    expect(after.at(-1)?.settings.roundTime).toBe(45);
  });
});

describe('room: match flow', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('a human idle against the bot plays out to results and everyone gets MatchEnd', () => {
    const { room, a } = botMatch();
    expect(tickUntil(room, () => room.phase === 'results', TICK_RATE * 400)).toBe(true);
    const ends = a.sock.json<MatchEndMsg>(Msg.MatchEnd);
    expect(ends).toHaveLength(1);
    expect(ends[0].winner).toBe(1);
    expect(ends[0].winnerId).toBe(room.bot!.id);
    expect(ends[0].wins).toEqual([0, 1]);
    expect(ends[0].nextIn).toBe(15);
    expect(ends[0].rows.map((r) => r.id).sort()).toEqual([a.id, room.bot!.id].sort());
  });

  it('results last 15 seconds and then the room returns to the lobby', () => {
    const { room } = botMatch();
    tickUntil(room, () => room.phase === 'results', TICK_RATE * 400);
    for (let i = 0; i < TICK_RATE * 15 - 1; i++) room.tick();
    expect(room.phase).toBe('results');
    room.tick();
    expect(room.phase).toBe('lobby');
    expect(room.world).toBeNull();
  });

  it('rematch from results starts a fresh world with the same players and the bot', () => {
    const { room, a } = botMatch();
    tickUntil(room, () => room.phase === 'results', TICK_RATE * 400);
    const old = room.world;
    lobby(a, { op: 'rematch' });
    expect(room.phase).toBe('playing');
    expect(room.world).not.toBe(old);
    expect(room.world!.wins).toEqual([0, 0]);
    expect(room.world!.fighters.has(room.bot!.id)).toBe(true);
    expect(a.sock.json(Msg.MatchStart)).toHaveLength(2);
  });

  it('only the host can rematch, and only from results', () => {
    const { room, a } = botMatch();
    const guest = connect(room, 'Guest');
    lobby(a, { op: 'rematch' });
    expect(room.phase).toBe('playing');
    tickUntil(room, () => room.phase === 'results', TICK_RATE * 400);
    lobby(guest, { op: 'rematch' });
    expect(room.phase).toBe('results');
    lobby(a, { op: 'rematch' });
    expect(room.phase).toBe('playing');
  });

  it('a rematch with one fighter and the bot off falls back to the lobby', () => {
    const { room, a, b } = duel();
    lobby(a, { op: 'kick', id: b.id });
    room.tick();
    expect(room.phase).toBe('results');
    lobby(a, { op: 'rematch' });
    expect(room.phase).toBe('lobby');
    expect(room.world).toBeNull();
  });

  it('a fighter who leaves for good forfeits: the other seat wins and everyone gets MatchEnd', () => {
    const { room, a, b } = duel();
    drop(b);
    vi.advanceTimersByTime(GRACE_MS + 1_000);
    room.sweep();
    expect(rosterOf(room, b.id)).toBeUndefined();
    expect(room.world!.phase).toBe('over');
    expect(room.world!.winner).toBe(0);
    room.tick();
    expect(room.phase).toBe('results');
    const ends = a.sock.json<MatchEndMsg>(Msg.MatchEnd);
    expect(ends).toHaveLength(1);
    expect(ends[0].winner).toBe(0);
    expect(ends[0].winnerId).toBe(a.id);
  });

  it('a fighter who is still inside the reconnect grace is kept and the match goes on', () => {
    const { room, a, b } = duel();
    drop(b);
    vi.advanceTimersByTime(GRACE_MS - 5_000);
    room.sweep();
    expect(seatOf(room, b.id)).toBe(1);
    expect(room.world!.phase).not.toBe('over');
    room.tick();
    expect(room.phase).toBe('playing');
    expect(a.sock.json(Msg.MatchEnd)).toHaveLength(0);
  });

  it('a fighter who comes back inside the grace keeps the match', () => {
    const { room, b } = duel();
    drop(b);
    vi.advanceTimersByTime(GRACE_MS - 1_000);
    const back = connect(room, 'Ben', { resume: b.resume });
    expect(back.id).toBe(b.id);
    vi.advanceTimersByTime(GRACE_MS);
    room.sweep();
    expect(room.world!.phase).not.toBe('over');
    expect(seatOf(room, b.id)).toBe(1);
  });

  it('a spectator who leaves mid-match is removed at once without forfeiting anything', () => {
    const { room, b } = duel();
    const spec = connect(room, 'Spec');
    drop(spec);
    expect(rosterOf(room, spec.id)).toBeUndefined();
    expect(room.world!.phase).not.toBe('over');
    expect(seatOf(room, b.id)).toBe(1);
  });

  it('the host kicking a fighter mid-match forfeits to the other seat', () => {
    const { room, a, b } = duel();
    lobby(a, { op: 'kick', id: b.id });
    room.tick();
    expect(room.phase).toBe('results');
    const ends = a.sock.json<MatchEndMsg>(Msg.MatchEnd);
    expect(ends).toHaveLength(1);
    expect(ends[0].winner).toBe(0);
  });

  it('the room tells recipients their own fighter in each snapshot, spectators get none', () => {
    const room = makeRoom({ snapshotInterval: 1 });
    const { a, b } = duel(room);
    const spec = connect(room, 'Spec');
    room.tick();
    room.tick();
    (room as unknown as { maybeSnapshot(): void }).maybeSnapshot();
    const snapB = decodeSnapshot(b.sock.frames(Msg.Snapshot).at(-1)!);
    expect(snapB.selfId).toBe(b.id);
    expect(snapB.self).not.toBeNull();
    expect(snapB.fighters.map((f) => f.id).sort()).toEqual([a.id, b.id].sort());
    const snapS = decodeSnapshot(spec.sock.frames(Msg.Snapshot).at(-1)!);
    expect(snapS.selfId).toBe(255);
    expect(snapS.self).toBeNull();
  });
});

describe('room: input, message flood protection and chat', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('input commands reach the fighter queue; stale and repeated sequence numbers are dropped', () => {
    const { room, b } = duel();
    b.h.message(inputs([1, 2, 3]));
    b.h.message(inputs([2, 3, 4]));
    expect(room.world!.fighters.get(b.id)!.inputs.map((c) => c.seq)).toEqual([1, 2, 3, 4]);
  });

  it('a spectator cannot feed inputs to anyone', () => {
    const { room, b } = duel();
    const spec = connect(room, 'Spec');
    spec.h.message(inputs([1, 2, 3]));
    expect(room.world!.fighters.get(b.id)!.inputs).toHaveLength(0);
    expect(room.world!.fighters.has(spec.id)).toBe(false);
  });

  it('input flood: frames past the per-second budget are dropped and a sustained flood closes with 4004', () => {
    const { room, b } = duel();
    const fighter = room.world!.fighters.get(b.id)!;
    let seq = 1;
    for (let i = 0; i < 20; i++) {
      b.h.message(inputs(Array.from({ length: 8 }, () => seq++)));
    }
    expect(fighter.inputs).toHaveLength(128);
    expect(b.sock.closed).toBeNull();
    for (let i = 0; i < 40 && !b.sock.closed; i++) {
      b.h.message(inputs(Array.from({ length: 8 }, () => seq++)));
    }
    expect(b.sock.closed?.code).toBe(4004);
    expect(fighter.inputs).toHaveLength(128);
  });

  it('the input budget refills after the one-second sweep', () => {
    const { room, b } = duel();
    const fighter = room.world!.fighters.get(b.id)!;
    let seq = 1;
    for (let i = 0; i < 20; i++) b.h.message(inputs(Array.from({ length: 8 }, () => seq++)));
    const before = fighter.inputs.length;
    room.sweep();
    b.h.message(inputs(Array.from({ length: 8 }, () => seq++)));
    expect(fighter.inputs.length).toBe(before + 8);
  });

  it('other messages are rate limited: a burst of 40 then one per refill (15 per second)', () => {
    const room = makeRoom();
    const a = connect(room, 'Ann', { hostKey: KEY });
    const listener = connect(room, 'Ben');
    const chats = (n: number) => {
      for (let i = 0; i < n; i++) a.h.message(encodeJson(Msg.Chat, { text: `m${i}` }));
      return listener.sock.json<{ text: string }>(Msg.ChatMsg).length;
    };
    expect(chats(60)).toBe(40);
    room.sweep();
    expect(chats(20)).toBe(55);
    expect(a.sock.closed).toBeNull();
  });

  it('a flood of non-input messages past 200 strikes closes the socket with 4004', () => {
    const room = makeRoom();
    const a = connect(room, 'Ann', { hostKey: KEY });
    for (let i = 0; i < 300 && !a.sock.closed; i++) a.h.message(encodePing(i));
    expect(a.sock.closed?.code).toBe(4004);
  });

  it('a ping is answered with a pong that echoes its timestamp', () => {
    const room = makeRoom();
    const a = connect(room, 'Ann', { hostKey: KEY });
    a.h.message(encodePing(12.5));
    const pong = a.sock.frames(Msg.Pong)[0];
    expect(pong).toBeDefined();
    expect(decodePing(pong)).toBe(12.5);
  });

  it('chat drops control characters, caps at 80 characters and ignores blank messages', () => {
    const room = makeRoom();
    const a = connect(room, 'Ann', { hostKey: KEY });
    const listener = connect(room, 'Ben');
    a.h.message(encodeJson(Msg.Chat, { text: `a\u0001b${'x'.repeat(100)}` }));
    a.h.message(encodeJson(Msg.Chat, { text: '   \u0002  ' }));
    const got = listener.sock.json<{ id: number; text: string }>(Msg.ChatMsg);
    expect(got).toHaveLength(1);
    expect(got[0].id).toBe(a.id);
    expect(got[0].text).toBe(`ab${'x'.repeat(78)}`);
    expect(got[0].text.length).toBe(80);
  });
});
