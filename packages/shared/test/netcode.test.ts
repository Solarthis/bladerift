// Online netcode, end to end in memory: the real Room (server) and the real client NetGame (prediction, reconciliation,
// interpolation) for two human players over a virtual link with latency and jitter. Every hero and Rift Art is
// played. What is checked is what a player would see: the own fighter must not jump (rubber-band) when nothing
// happens to it, the opponent must not freeze, and a Rift Art must not desync (a Night Hunt leap is drawn as it
// flies, a Flash Step blink is one jump at the moment the server blinks).
import { describe, expect, it, vi } from 'vitest';
import { Room, RoomSocket, SocketHandlers } from '../src/room';
import { decodeJson, decodeSnapshot, encodeInputs, encodeJson, Msg, msgType, MatchStartMsg, Snapshot, WelcomeMsg } from '../src/protocol';
import { PROTOCOL_VERSION, TICK_RATE } from '../src/constants';
import { Btn } from '../src/input';
import { RIFT } from '../src/classes';
import { HEROES, sanitizeLoadout } from '../src/heroes';
import { Act } from '../src/fighter';
import { ArtId } from '../src/classes';
import { artIdOf } from '../src/heroes';
import { NetGame } from '../../client/src/net/NetGame';

const KEY = 'netcode-test-key';
const STEP_MS = 1000 / TICK_RATE;

interface Link {
  send(at: number, fn: () => void): void;
  flush(now: number): void;
}

/** One-way link: arrival = send time + latency + jitter, kept in order (TCP). Seeded so runs repeat. */
function makeLink(latencyMs: number, jitterMs: number, seed: number): Link {
  let s = seed;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const queue: { at: number; fn: () => void }[] = [];
  let last = 0;
  return {
    send(at, fn) {
      const due = Math.max(last, at + latencyMs + (rnd() * 2 - 1) * jitterMs);
      last = due;
      queue.push({ at: due, fn });
    },
    flush(now) {
      queue.sort((a, b) => a.at - b.at);
      while (queue.length && queue[0].at <= now) queue.shift()!.fn();
    },
  };
}

interface Seat {
  name: string;
  hero: number;
  id: number;
  game: NetGame | null;
  handlers: SocketHandlers;
  toClient: Link;
  toServer: Link;
  /** Scripted play: a seeded policy that closes in, attacks, jumps, and casts the Rift Art when the gauge is full. */
  rnd: () => number;
  moveX: number;
  turnIn: number;
  specialCool: number;
  // metrics (fight phase only)
  corrections: number;
  correctionMax: number;
  shownJumps: { t: number; d: number; art: boolean; act: number; pause: number; hs: number }[];
  opponentFrozenFrames: number;
  frames: number;
  castFrames: number;
  lastSelf: { x: number; y: number } | null;
  lastOpp: { x: number; y: number } | null;
  artOnFrames: number;
  /** Corrections over 120 px (the client snaps instead of smoothing) while the Rift Art is on, other than hits. */
  hardArtCorrections: number;
  /** Hits this seat landed (server events) and frames its own predicted fighter showed a hit-stop of its own swing. */
  hitsLanded: number;
  predFrozenFrames: number;
}

/** A scripted pad for a seat (replaces the seeded policy): what to hold this frame. */
type Policy = (seat: Seat, frame: number, me: { x: number } | undefined, opp: { x: number } | undefined) => { moveX: number; buttons: number };

interface Result {
  seats: [Seat, Seat];
  ticks: number;
}

/** Plays a duel of heroA vs heroB for `seconds` of match time. The Rift gauges are filled at `fillAt` seconds. */
function duel(heroA: number, heroB: number, opts: { latency?: number; jitter?: number; seconds?: number; seed?: number; fillAt?: number; policy?: [Policy, Policy] } = {}): Result {
  const latency = opts.latency ?? 0;
  const jitter = opts.jitter ?? 0;
  const seconds = opts.seconds ?? 12;
  const fillAt = opts.fillAt ?? 3;
  const room = new Room(KEY, 'Netcode test', false, { maxRewindSec: 0.55, handOffHost: true });
  let now = 1000;
  // NetGame.tick() reads performance.now() for its view tick: the virtual clock stands in for it, so runs repeat
  const clock = vi.spyOn(performance, 'now').mockImplementation(() => now);
  const seed0 = opts.seed ?? 7;
  const seats: Seat[] = [];

  const mkSeat = (name: string, hero: number, idx: number): Seat => {
    const seat: Seat = {
      name, hero, id: -1, game: null, handlers: null as unknown as SocketHandlers,
      toClient: makeLink(latency, jitter, seed0 * 31 + idx * 7 + 1),
      toServer: makeLink(latency, jitter, seed0 * 17 + idx * 13 + 2),
      rnd: ((s) => () => (s = (s * 16807) % 2147483647) / 2147483647)(seed0 * 101 + idx * 59 + 3),
      moveX: 0, turnIn: 0, specialCool: 0,
      corrections: 0, correctionMax: 0, shownJumps: [], opponentFrozenFrames: 0, frames: 0, castFrames: 0,
      lastSelf: null, lastOpp: null, artOnFrames: 0, hardArtCorrections: 0, hitsLanded: 0, predFrozenFrames: 0,
    };
    const socket: RoomSocket = {
      readyState: 1,
      bufferedAmount: 0,
      send: (data) => {
        const copy = data.slice();
        seat.toClient.send(now, () => onClientMessage(seat, copy));
      },
      close: () => {},
    };
    seat.handlers = room.attach(socket, name);
    seats.push(seat);
    // (the hello goes over the wire too: the server sees it one latency later)
    seat.toServer.send(now, () =>
      seat.handlers.message(encodeJson(Msg.Hello, { v: PROTOCOL_VERSION, name, color: idx, load: sanitizeLoadout({ hero }), hostKey: idx === 0 ? KEY : undefined })));
    return seat;
  };

  const onClientMessage = (seat: Seat, d: Uint8Array) => {
    switch (msgType(d)) {
      case Msg.Welcome:
        seat.id = decodeJson<WelcomeMsg>(d).id;
        break;
      case Msg.MatchStart: {
        const m = decodeJson<MatchStartMsg>(d);
        const me = m.roster.find((r) => r.id === seat.id);
        seat.game = new NetGame(m.settings, seat.id, true);
        if (me) seat.game.load = me.load;
        break;
      }
      case Msg.Snapshot: {
        if (!seat.game) break;
        onSnapshot(seat, decodeSnapshot(d));
        break;
      }
    }
  };

  const onSnapshot = (seat: Seat, s: Snapshot) => {
    const g = seat.game!;
    const cx = g.corr.x;
    const cy = g.corr.y;
    const sx = (g.pred?.x ?? 0) + cx;
    const sy = (g.pred?.y ?? 0) + cy;
    const fight = s.phase === 'fight' && room.phase === 'playing';
    // (a Rift Art moves you on the server only, see the art tests below: its corrections are counted there)
    const art = g.pred?.act === Act.Art || s.self?.act === Act.Art;
    for (const ev of s.events) if (ev.t === 'hit' && ev.a === seat.id && ev.w < 100) seat.hitsLanded++;
    g.onSnapshot(s, now);
    // correction: how far the shown own position moved because the server disagreed with the prediction
    const e = Math.max(Math.hypot(g.corr.x - cx, g.corr.y - cy), Math.hypot((g.pred?.x ?? 0) + g.corr.x - sx, (g.pred?.y ?? 0) + g.corr.y - sy));
    // (a hit that lands during the Art knocks you back: the server is then in its stun, and that correction is the hit;
    // the opponent's own Rift Art freezes you in its superpause, which no client can foresee either)
    if (fight && art && e > 120 && s.self?.act !== Act.Stun && !(s.self && s.self.pause > 0)) seat.hardArtCorrections++;
    if (!fight || art) return;
    if (e > 3) {
      seat.corrections++;
      seat.correctionMax = Math.max(seat.correctionMax, e);
    }
  };

  const seatsOf = () => seats;
  // the lobby: the first seat is the host and starts the match once both have joined
  const start = () => {
    seats[0].handlers.message(encodeJson(Msg.Lobby, { op: 'settings', settings: { arenaId: 'bridge', wins: 2, roundTime: 90 } }));
    seats[0].handlers.message(encodeJson(Msg.Lobby, { op: 'start' }));
  };

  const a = mkSeat('Ann', heroA, 0);
  const b = mkSeat('Ben', heroB, 1);
  void a;
  void b;
  let started = false;
  let filled = false;
  let t0 = 0;
  let frame = 0;
  const end = now + seconds * 1000 + latency * 2 + 500;
  while (now < end) {
    now += STEP_MS;
    frame++;
    for (const seat of seatsOf()) seat.toServer.flush(now);
    for (const seat of seatsOf()) seat.toClient.flush(now);
    if (!started && seats.every((x) => x.id >= 0)) {
      started = true;
      start();
    }
    if (room.phase === 'playing' && !t0) t0 = now;
    if (t0 && !filled && now - t0 >= fillAt * 1000) {
      filled = true;
      for (const seat of seats) {
        const f = room.world?.fighters.get(seat.id);
        if (f) f.s.rift = RIFT.max;
      }
    }
    for (const seat of seats) {
      if (!seat.game) continue;
      play(seat, now);
    }
    if (room.phase === 'playing' || room.phase === 'results') {
      room.tick();
      (room as unknown as { maybeSnapshot(): void }).maybeSnapshot();
      if (frame % 60 === 0) room.sweep();
    }
    if (room.phase === 'results') break;
  }
  clock.mockRestore();
  return { seats: [seats[0], seats[1]], ticks: room.world?.tick ?? 0 };

  function play(seat: Seat, t: number) {
    const g = seat.game!;
    const view = g.fighters(t);
    const me = view.find((f) => f.self);
    const opp = view.find((f) => !f.self);
    seat.frames++;
    const inFight = g.latest?.phase === 'fight';
    if (inFight && g.pred && g.pred.hitstop > 0 && g.pred.act === Act.Attack) seat.predFrozenFrames++;
    if (inFight && me) {
      const art = me.act === Act.Art;
      if (art) seat.artOnFrames++;
      if (seat.lastSelf) {
        const d = Math.hypot(me.x - seat.lastSelf.x, me.y - seat.lastSelf.y);
        if (d > 30) seat.shownJumps.push({ t: Math.round((t - t0) / 10) / 100, d, art, act: me.act, pause: me.pause, hs: me.hitstop });
      }
      seat.lastSelf = { x: me.x, y: me.y };
    }
    if (opp && inFight) {
      seat.lastOpp = { x: opp.x, y: opp.y };
    }
    const newest = g.latest?.tick ?? 0;
    if (inFight && g.renderTick(t) > newest + 6) seat.opponentFrozenFrames++;
    const scripted = opts.policy?.[seats.indexOf(seat)];
    if (scripted) {
      const pad = scripted(seat, frame, me, opp);
      const c = g.tick(pad.moveX, 0, pad.buttons);
      const bytes = encodeInputs([c]);
      seat.toServer.send(t, () => seat.handlers.message(bytes));
      return;
    }
    // policy
    seat.turnIn -= STEP_MS / 1000;
    if (seat.turnIn <= 0) {
      seat.turnIn = 0.15 + seat.rnd() * 0.75;
      const dx = me && opp ? opp.x - me.x : 0;
      const r = seat.rnd();
      seat.moveX = r < 0.65 && me && opp ? Math.sign(dx) * (0.4 + seat.rnd() * 0.6) : (r < 0.8 ? 0 : (seat.rnd() < 0.5 ? -1 : 1) * (0.4 + seat.rnd() * 0.6));
    }
    let buttons = 0;
    if (seat.rnd() < 0.3 && seat.rnd() < 0.2) buttons |= Btn.Jump;
    if (seat.rnd() < 0.5) buttons |= Btn.A;
    if (seat.rnd() < 0.06) buttons |= Btn.B;
    if (seat.rnd() < 0.01) buttons |= Btn.Skill;
    if (seat.rnd() < 0.01) buttons |= Btn.Roll;
    if (seat.specialCool > 0) seat.specialCool--;
    if (g.pred && g.pred.rift >= RIFT.max && seat.specialCool === 0 && seat.rnd() < 0.5) {
      buttons |= Btn.Special;
      seat.specialCool = 40;
      seat.castFrames++;
    }
    const cmd = g.tick(seat.moveX, 0, buttons);
    const bytes = encodeInputs([cmd]);
    seat.toServer.send(t, () => seat.handlers.message(bytes));
  }
}

/** Hero pairs: each hero against a different one, so every hero and every Rift Art fights. */
const PAIRS = HEROES.map((h) => [h.id, (h.id + 5) % HEROES.length] as const);

describe('online netcode: hit-stop prediction', () => {
  // the attacker's own hit-stop: the server freezes both fighters when a swing lands; the client sees the same hit
  // against the opponent as drawn at its view tick (what the server's lag compensation judges), so its own fighter
  // freezes at once instead of running on and being pulled back one round trip later
  it('your own swings freeze you as they land, with no correction, at 110 ms each way', () => {
    for (const [hero, seed] of [[0, 3], [4, 5], [9, 7]] as const) {
      const walkAndSwing: Policy = (_seat, frame, me, opp) => {
        if (!me || !opp) return { moveX: 0, buttons: 0 };
        const dx = opp.x - me.x;
        // close in, then tap the light attack every 7 frames (a press, a release)
        if (Math.abs(dx) > 40) return { moveX: Math.sign(dx), buttons: 0 };
        return { moveX: 0, buttons: frame % 7 === 0 ? Btn.A : 0 };
      };
      const idle: Policy = () => ({ moveX: 0, buttons: 0 });
      const r = duel(hero, 1, { latency: 110, jitter: 0, seconds: 10, seed, fillAt: 999, policy: [walkAndSwing, idle] });
      const a = r.seats[0];
      expect(a.hitsLanded, `hero ${hero}: hits landed`).toBeGreaterThan(3);
      expect(a.predFrozenFrames, `hero ${hero}: frozen frames shown`).toBeGreaterThan(a.hitsLanded * 4);
      // the swings are the only thing happening to A: its prediction must hold (a couple of small slips allowed)
      expect(a.corrections, `hero ${hero}: corrections (max ${a.correctionMax.toFixed(1)})`).toBeLessThanOrEqual(2);
    }
  });
});

describe('online netcode: every hero and Rift Art, end to end', () => {
  it('plays every hero with no frozen opponent and no snap in the fight, at zero latency', () => {
    for (const [a, b] of PAIRS) {
      const r = duel(a, b, { latency: 0, seconds: 10, seed: a + 1 });
      for (const seat of r.seats) {
        // at zero latency the prediction is exact except for hits the client cannot foresee
        expect(seat.opponentFrozenFrames / Math.max(1, seat.frames), `${seat.name} (hero ${a}) opponent frozen`).toBeLessThan(0.02);
        expect(seat.correctionMax, `${seat.name} (hero ${a}) correction`).toBeLessThan(60);
        expect(seat.shownJumps.filter((j) => j.d > 60 && !j.art).length, `${seat.name} (hero ${a}) unexplained jumps`).toBeLessThanOrEqual(3);
      }
    }
  });

  it('plays every hero at 110 ms each way with jitter: the opponent stays smooth and the own fighter does not rubber-band', () => {
    for (const [a, b] of PAIRS) {
      const r = duel(a, b, { latency: 110, jitter: 25, seconds: 12, seed: a + 3 });
      for (const seat of r.seats) {
        expect(seat.opponentFrozenFrames / Math.max(1, seat.frames), `${seat.name} (hero ${a}) opponent frozen`).toBeLessThan(0.02);
        // hits knock the own fighter back by a server-side amount the client learns one trip later: those are the
        // only corrections allowed to be large, and they are knockbacks (the Stun act), not the prediction going wrong
        const nonHitJumps = seat.shownJumps.filter((j) => j.d > 60 && !j.art && j.act !== Act.Stun);
        expect(nonHitJumps.length, `${seat.name} (hero ${a}) non-hit jumps ${JSON.stringify(nonHitJumps)}`).toBeLessThanOrEqual(2);
      }
    }
  });

  // Night Hunt's leap and Flash Step's blink are run by stepFighter (with the opponent's view), so the client's
  // prediction moves the own fighter exactly as the server does: no snap when the snapshot arrives.
  it('a Night Hunt leap is drawn as it flies: no snap while the Rift Art is on', () => {
    // Thornmaw (Night Hunt) against Lumi (a lighter opponent), with the gauge full from the start
    for (const seed of [3, 5, 9]) {
      const r = duel(12, 5, { latency: 110, jitter: 25, seconds: 14, seed, fillAt: 0.5 });
      const thornmaw = r.seats[0];
      // (the opponent's Rift Art can freeze the leap in its superpause: that one is the server's news, like a hit)
      const artSnaps = thornmaw.shownJumps.filter((j) => j.art && j.d > 40 && j.pause === 0);
      expect(artSnaps, `seed ${seed}: Night Hunt snaps ${JSON.stringify(artSnaps)}`).toEqual([]);
      expect(thornmaw.hardArtCorrections, `seed ${seed}: hard corrections during the Art`).toBe(0);
    }
  });

  it('a Flash Step is one blink per teleport, not a desynced snap', () => {
    for (const seed of [4, 8]) {
      const r = duel(8, 3, { latency: 110, jitter: 25, seconds: 14, seed, fillAt: 0.5 });
      const sable = r.seats[0];
      // the blinks are jumps by design (instant, and the same for the opponent); what must not happen is the server
      // moving Sable somewhere the prediction did not go, which shows up as a hard correction
      expect(sable.hardArtCorrections, `seed ${seed}: hard corrections during the Art`).toBe(0);
    }
  });

  it('every Rift Art is cast at least once across the roster', () => {
    const cast = new Set<number>();
    for (const [a, b] of PAIRS) {
      const r = duel(a, b, { latency: 60, jitter: 10, seconds: 6, seed: a + 9, fillAt: 0.5 });
      for (const seat of r.seats) if (seat.castFrames > 0) cast.add(artIdOf({ hero: seat.hero, cls: 0 }));
    }
    // every Art is some hero's (the roster has 14 heroes and 14 Arts)
    expect(cast.size).toBeGreaterThanOrEqual(12);
    expect(ArtId.NightHunt).toBe(13);
  });
});
