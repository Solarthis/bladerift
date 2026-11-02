import { describe, expect, it } from 'vitest';
import {
  Act, BOT_LEVELS, BotBrain, BotDifficulty, Btn, DT, FIGHTER, GameEvent, heroClass, isCrouchGuard, isDummyLevel, KO_LAUNCH, Loadout,
  MatchSettings, RIFT, ROUND, Room, RoomSocket, SocketHandlers, sanitizeLoadout, SkillId, TRAINING, World, WeaponId, HERO_COUNT,
  Msg, encodeJson, decodeJson, LobbyCmd, LobbyStateMsg, msgType, PROTOCOL_VERSION,
} from '../src/index';

/**
 * Training and survival settings (MatchSettings.training, infiniteRift, botHero, carryHp, startHp) and the training
 * dummies (BotDifficulty dummy-stand, dummy-guard, dummy-jump), plus the K.O. launch. Checked in the sim (World), through
 * the room's lobby ops (Room.attach), and in the bot's decisions (BotBrain.think).
 */

/** The defender: a plain sword and shield, no input unless a test gives it some. */
const DEFENDER: Loadout = { weapons: [WeaponId.Sword, WeaponId.Shield], skill: SkillId.LionsRoar, cls: 0, hero: 0 };

/** A live duel past its intro: A (hero 0) at x 300 facing right, B `gap` in front of it, facing A. */
function duel(settings: Partial<MatchSettings> = {}, gap = 40, hero = 0) {
  const w = new World({ arenaId: 'bridge', wins: 2, roundTime: 90, ...settings });
  const fa = w.addFighter(1, 0, 'A', sanitizeLoadout({ hero }));
  const fb = w.addFighter(2, 1, 'B', DEFENDER);
  w.start();
  for (let i = 0; i < ROUND.introTicks + 1; i++) w.step();
  fa.s.x = 300;
  fb.s.x = 300 + gap;
  fa.s.face = 1;
  fb.s.face = -1;
  return { w, fa, fb };
}

/** Runs n ticks with the given presses (A's and B's, per tick). Returns the events of the whole run and calls seen after each tick. */
function run(
  w: World, n: number, a: (i: number) => number = () => 0, b: (i: number) => number = () => 0,
  seen?: (i: number, events: GameEvent[]) => void,
): GameEvent[] {
  const fa = w.fighters.get(1)!;
  const fb = w.fighters.get(2)!;
  const log: GameEvent[] = [];
  for (let i = 0; i < n; i++) {
    fa.inputs.push({ seq: fa.lastSeq + 1, moveX: 0, moveY: 0, buttons: a(i), viewTick: 0 });
    fb.inputs.push({ seq: fb.lastSeq + 1, moveX: 0, moveY: 0, buttons: b(i), viewTick: 0 });
    w.step();
    const ev = w.events;
    w.events = [];
    log.push(...ev);
    seen?.(i, ev);
  }
  return log;
}

type HitEvent = Extract<GameEvent, { t: 'hit' }>;
const directHits = (log: GameEvent[]) => log.filter((e): e is HitEvent => e.t === 'hit' && e.a === 1 && e.v === 2 && e.w !== 200);

describe('training: the round clock and the K.O. floor', () => {
  it('the round clock does not run in training', () => {
    const { w } = duel({ training: true });
    run(w, 120);
    expect(w.timeLeft).toBe(90);
  });

  it('outside training the round clock runs down', () => {
    const { w } = duel({});
    const before = w.timeLeft;
    run(w, 120);
    expect(before - w.timeLeft).toBeCloseTo(120 * DT, 6);
  });

  it('in training a lethal hit leaves the defender standing at 1 health, never K.O.', () => {
    const { w, fb } = duel({ training: true });
    fb.s.hp = 1;
    let minHp = Infinity;
    let koAct = false;
    const log = run(w, 90, (i) => (i === 0 ? Btn.A : 0), () => 0, () => {
      minHp = Math.min(minHp, fb.s.hp);
      if (fb.s.act === Act.KO) koAct = true;
    });
    expect(directHits(log).length, 'the sword connected').toBeGreaterThan(0);
    expect(log.some((e) => e.t === 'ko')).toBe(false);
    expect(log.some((e) => e.t === 'round')).toBe(false);
    expect(w.phase).toBe('fight');
    expect(koAct).toBe(false);
    expect(minHp).toBeGreaterThanOrEqual(1);
  });

  it('outside training the same lethal hit is a K.O. and ends the round', () => {
    const { w, fb } = duel({});
    fb.s.hp = 1;
    const log = run(w, 30, (i) => (i === 0 ? Btn.A : 0));
    expect(directHits(log).length, 'the sword connected').toBeGreaterThan(0);
    expect(log.some((e) => e.t === 'ko' && e.v === 2)).toBe(true);
    expect(w.phase).toBe('ko');
    expect(fb.s.act).toBe(Act.KO);
  });
});

describe('training: the refill after a combo', () => {
  it('a combo against a fighter refills its health and flasks TRAINING.refillTicks after it ends', () => {
    const { w, fb } = duel({ training: true });
    const full = heroClass(fb.load).hp;
    fb.s.hp = 300;
    fb.s.flask = 0;
    fb.comboHits = 2;
    fb.s.act = Act.Free;
    run(w, TRAINING.refillTicks - 1);
    expect(fb.s.hp, 'not yet').toBe(300);
    expect(fb.s.flask).toBe(0);
    run(w, 1);
    expect(fb.s.hp).toBe(full);
    expect(fb.s.flask).toBe(FIGHTER.flasks);
    expect(fb.comboHits, 'the combo is closed').toBe(0);
  });

  it('the refill is 1 s: TRAINING.refillTicks is 60 ticks at 60 Hz', () => {
    expect(TRAINING.refillTicks).toBe(60);
  });

  it('a new hit in hit-stun during the countdown cancels the refill', () => {
    const { w, fb } = duel({ training: true });
    fb.s.hp = 300;
    fb.comboHits = 2;
    fb.s.act = Act.Free;
    run(w, 30);
    fb.s.act = Act.Stun;
    fb.s.stun = 500;
    run(w, 40);
    expect(fb.s.hp).toBe(300);
    // the combo ends again: the countdown starts over from its full length
    fb.s.act = Act.Free;
    run(w, TRAINING.refillTicks - 1);
    expect(fb.s.hp).toBe(300);
    run(w, 1);
    expect(fb.s.hp).toBe(heroClass(fb.load).hp);
  });

  it('outside training a combo does not refill health', () => {
    const { w, fb } = duel({});
    fb.s.hp = 300;
    fb.comboHits = 2;
    fb.s.act = Act.Free;
    run(w, TRAINING.refillTicks * 2);
    expect(fb.s.hp).toBe(300);
  });

  it('a fighter in hit-stun is not refilled while its combo is still going', () => {
    const { w, fb } = duel({ training: true });
    fb.s.hp = 300;
    fb.comboHits = 2;
    fb.s.act = Act.Stun;
    fb.s.stun = 500;
    run(w, TRAINING.refillTicks * 2);
    expect(fb.s.hp).toBe(300);
  });
});

describe('infinite Rift gauge', () => {
  it('with infiniteRift the gauge is full from the start and after casting a Rift Art', () => {
    const { w, fa } = duel({ infiniteRift: true });
    expect(fa.s.rift).toBe(RIFT.max);
    fa.s.rift = 0;
    run(w, 1);
    expect(fa.s.rift).toBe(RIFT.max);
    const log = run(w, 2, (i) => (i === 0 ? Btn.Special : 0));
    expect(log.some((e) => e.t === 'art' || e.t === 'ex' || e.t === 'shoot'), 'the Art was cast').toBe(true);
    expect(fa.s.rift).toBe(RIFT.max);
  });

  it('without infiniteRift casting a Rift Art empties the gauge', () => {
    const { w, fa } = duel({});
    fa.s.rift = RIFT.max;
    const log = run(w, 2, (i) => (i === 0 ? Btn.Special : 0));
    expect(log.some((e) => e.t === 'art'), 'the Art was cast').toBe(true);
    expect(fa.s.rift).toBeLessThan(RIFT.max);
  });
});

describe('K.O. launch', () => {
  /** Runs a lethal hit from A (x 300, facing right) on B (`gap` in front) and returns B's state right after the K.O. tick. */
  function koFrame(gap: number, mirror = false) {
    const { w, fa, fb } = duel({}, gap);
    if (mirror) {
      fa.s.x = 500;
      fa.s.face = -1;
      fb.s.x = 500 - gap;
      fb.s.face = 1;
    }
    fb.s.hp = 1;
    let frame: { vx: number; vy: number; x: number } | null = null;
    const log = run(w, 30, (i) => (i === 0 ? Btn.A : 0), () => 0, (_i, ev) => {
      if (!frame && ev.some((e) => e.t === 'ko')) frame = { vx: fb.s.vx, vy: fb.s.vy, x: fb.s.x };
    });
    return { w, fa, fb, frame, log };
  }

  it('the beaten fighter is thrown away from the attacker at least KO_LAUNCH.vx, kicked up at KO_LAUNCH.vy', () => {
    const { frame } = koFrame(40);
    expect(frame).not.toBeNull();
    expect(frame!.vx).toBeGreaterThanOrEqual(KO_LAUNCH.vx);
    expect(frame!.vy).toBeLessThanOrEqual(KO_LAUNCH.vy);
  });

  it('mirrored: an attacker on the right throws the body to the left', () => {
    const { frame } = koFrame(40, true);
    expect(frame).not.toBeNull();
    expect(frame!.vx).toBeLessThanOrEqual(-KO_LAUNCH.vx);
  });

  it('the body flies, lands and lies there in Act.KO on the ground, further from the attacker', () => {
    const { w, fb, frame } = koFrame(40);
    expect(frame).not.toBeNull();
    let landed = false;
    for (let i = 0; i < 240 && !landed; i++) {
      w.step();
      w.events = [];
      if (fb.s.ground > 0 && fb.s.vy === 0) landed = true;
    }
    expect(landed, 'it lands').toBe(true);
    expect(fb.s.act).toBe(Act.KO);
    expect(fb.s.x - frame!.x).toBeGreaterThan(40);
    // the slide on the floor dies out, and it stays down while the round is over
    run(w, 20);
    const x = fb.s.x;
    run(w, 40);
    expect(fb.s.act).toBe(Act.KO);
    expect(fb.s.vx).toBe(0);
    expect(Math.abs(fb.s.x - x)).toBeLessThan(1);
  });
});

describe('survival: the health carried between matches', () => {
  it('each seat starts the match at its startHp (clamped to its class; a negative value is full health)', () => {
    const w = new World({ arenaId: 'bridge', wins: 2, roundTime: 90, carryHp: true, startHp: [700, -1] });
    const fa = w.addFighter(1, 0, 'A', sanitizeLoadout({ hero: 0 }));
    const fb = w.addFighter(2, 1, 'B', DEFENDER);
    w.start();
    expect(fa.s.hp).toBe(700);
    expect(fb.s.hp).toBe(heroClass(fb.load).hp);
  });

  it('a carried 0 health (a fighter who ended at 0) starts the next match at 1, not at full', () => {
    const w = new World({ arenaId: 'bridge', wins: 2, roundTime: 90, carryHp: true, startHp: [0, 1] });
    const fa = w.addFighter(1, 0, 'A', sanitizeLoadout({ hero: 0 }));
    const fb = w.addFighter(2, 1, 'B', DEFENDER);
    w.start();
    expect(fa.s.hp).toBe(1);
    expect(fb.s.hp).toBe(1);
  });

  it('a startHp above the class maximum is clamped to it, and the fighter starts full', () => {
    const w = new World({ arenaId: 'bridge', wins: 2, roundTime: 90, carryHp: true, startHp: [99_999, -4] });
    const fa = w.addFighter(1, 0, 'A', sanitizeLoadout({ hero: 0 }));
    const fb = w.addFighter(2, 1, 'B', DEFENDER);
    w.start();
    expect(fa.s.hp).toBe(heroClass(fa.load).hp);
    expect(fb.s.hp).toBe(heroClass(fb.load).hp);
  });

  it('without carryHp the startHp is ignored', () => {
    const w = new World({ arenaId: 'bridge', wins: 2, roundTime: 90, startHp: [700, 700] });
    const fa = w.addFighter(1, 0, 'A', sanitizeLoadout({ hero: 0 }));
    w.start();
    expect(fa.s.hp).toBe(heroClass(fa.load).hp);
  });
});

// ------------------------------------------------------------ the room: lobby ops and the bot

/** In-memory socket: records what the room sends. */
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
  json<T>(type: Msg): T[] {
    return this.sent.filter((d) => msgType(d) === type).map((d) => decodeJson<T>(d));
  }
}

const KEY = 'host-key';

/** A keyed host, connected and welcomed. */
function host(room: Room) {
  const sock = new FakeSocket();
  const h: SocketHandlers = room.attach(sock, 'addr:host');
  h.message(encodeJson(Msg.Hello, { v: PROTOCOL_VERSION, name: 'Ann', color: 0, hostKey: KEY }));
  return {
    sock,
    cmd: (c: LobbyCmd) => h.message(encodeJson(Msg.Lobby, c)),
  };
}

describe('room: training and survival settings through the lobby', () => {
  it('the settings op takes the training flags, the bot hero, carryHp and startHp', () => {
    const room = new Room(KEY, 'Test Room');
    const a = host(room);
    a.cmd({ op: 'settings', settings: { training: true, infiniteRift: true, botHero: 5, carryHp: true, startHp: [700, 1200] } });
    expect(room.settings.training).toBe(true);
    expect(room.settings.infiniteRift).toBe(true);
    expect(room.settings.botHero).toBe(5);
    expect(room.settings.carryHp).toBe(true);
    expect(room.settings.startHp).toEqual([700, 1200]);
    const state = a.sock.json<LobbyStateMsg>(Msg.LobbyState).at(-1)!;
    expect(state.settings.training).toBe(true);
    expect(state.settings.botHero).toBe(5);
  });

  it('bad values are ignored or clamped: a non-boolean is dropped, the bot hero is clamped, startHp keeps two seats', () => {
    const room = new Room(KEY, 'Test Room');
    const a = host(room);
    a.cmd({ op: 'settings', settings: { training: 'yes' as unknown as boolean, botHero: 999, carryHp: true, startHp: [5, -3, 9] } });
    expect(room.settings.training).toBeUndefined();
    expect(room.settings.botHero).toBe(HERO_COUNT - 1);
    expect(room.settings.startHp).toEqual([5, 0]);
    a.cmd({ op: 'settings', settings: { botHero: -7 } });
    expect(room.settings.botHero).toBe(-1);
  });

  it('turning carryHp off forgets the carried health', () => {
    const room = new Room(KEY, 'Test Room');
    const a = host(room);
    a.cmd({ op: 'settings', settings: { carryHp: true, startHp: [300, 300] } });
    a.cmd({ op: 'settings', settings: { carryHp: false } });
    expect(room.settings.carryHp).toBe(false);
    expect(room.settings.startHp).toBeUndefined();
  });

  it('the bot levels: every training and CPU level is accepted, anything else is refused', () => {
    const room = new Room(KEY, 'Test Room');
    const a = host(room);
    for (const level of BOT_LEVELS) {
      a.cmd({ op: 'botLevel', level });
      expect(room.botLevel).toBe(level);
    }
    expect(BOT_LEVELS).toEqual(expect.arrayContaining(['dummy-stand', 'dummy-guard', 'dummy-jump', 'cpu']));
    a.cmd({ op: 'botLevel', level: 'ultra' as BotDifficulty });
    expect(room.botLevel).toBe('dummy-jump');
  });

  it('a training match runs with the chosen bot hero and the flags on the World', () => {
    const room = new Room(KEY, 'Test Room');
    const a = host(room);
    a.cmd({ op: 'settings', settings: { training: true, botHero: 5, wins: 1 } });
    a.cmd({ op: 'bot', on: true });
    a.cmd({ op: 'botLevel', level: 'dummy-guard' });
    a.cmd({ op: 'start' });
    expect(room.phase).toBe('playing');
    expect(room.bot).not.toBeNull();
    expect(room.bot!.load.hero).toBe(5);
    expect(room.world!.settings.training).toBe(true);
    expect(room.bot!.brain.level).toBe('dummy-guard');
  });

  it('the survival carry: the human seat keeps its health into the next match, the bot seat starts full', () => {
    const room = new Room(KEY, 'Test Room');
    const a = host(room);
    a.cmd({ op: 'settings', settings: { carryHp: true, wins: 1, roundTime: 60 } });
    a.cmd({ op: 'bot', on: true });
    a.cmd({ op: 'start' });
    const w = room.world!;
    const human = w.fighters.get(w.seats[0])!;
    human.s.hp = 700;
    // the bot's seat leaves: the human wins the match
    w.forfeit(1);
    room.tick();
    expect(room.phase).toBe('results');
    expect(room.settings.startHp).toEqual([700, -1]);
    // back to the lobby and a new match: the human starts at 700
    a.cmd({ op: 'toLobby' });
    a.cmd({ op: 'start' });
    expect(room.phase).toBe('playing');
    const w2 = room.world!;
    const human2 = w2.fighters.get(w2.seats[0])!;
    expect(human2.s.hp).toBe(700);
    expect(w2.fighters.get(w2.seats[1])!.s.hp).toBe(heroClass(w2.fighters.get(w2.seats[1])!.load).hp);
  });
});

// ------------------------------------------------------------ the training dummies

/** A duel where A is driven by `brain` (the dummy) and B does nothing. */
function dummyDuel(level: BotDifficulty, seed = 7) {
  const w = new World({ arenaId: 'bridge', wins: 2, roundTime: 90, training: true });
  const fa = w.addFighter(1, 0, 'A', sanitizeLoadout({ hero: 0 }), true);
  w.addFighter(2, 1, 'B', DEFENDER);
  const brain = new BotBrain(1, seed, level);
  w.start();
  for (let i = 0; i < ROUND.introTicks + 1; i++) w.step();
  fa.s.x = 300;
  return { w, fa, brain };
}

describe('training dummies', () => {
  it('the dummy levels are the dummy-* names and nothing else', () => {
    expect(isDummyLevel('dummy-stand')).toBe(true);
    expect(isDummyLevel('dummy-guard')).toBe(true);
    expect(isDummyLevel('dummy-jump')).toBe(true);
    expect(isDummyLevel('cpu')).toBe(false);
    expect(isDummyLevel('normal')).toBe(false);
  });

  it('dummy-stand sends no input at all and simply stands', () => {
    const { w, fa, brain } = dummyDuel('dummy-stand');
    const x = fa.s.x;
    let idle = true;
    for (let i = 0; i < 300; i++) {
      const cmd = brain.think(w);
      if (cmd.moveX !== 0 || cmd.moveY !== 0 || cmd.buttons !== 0) idle = false;
      fa.inputs.push(cmd);
      w.step();
    }
    expect(idle).toBe(true);
    expect(fa.s.act).toBe(Act.Free);
    expect(fa.s.x).toBeCloseTo(x, 6);
    expect(fa.s.crouch).toBe(0);
  });

  it('dummy-guard holds the crouch guard all the time', () => {
    const { w, fa, brain } = dummyDuel('dummy-guard');
    let guarded = 0;
    for (let i = 0; i < 120; i++) {
      const cmd = brain.think(w);
      expect(cmd.moveY).toBe(1);
      fa.inputs.push(cmd);
      w.step();
      if (i > 10 && isCrouchGuard(fa.s)) guarded++;
    }
    expect(guarded, 'crouching on the ground most of the time').toBeGreaterThan(100);
  });

  it('dummy-jump jumps again and again', () => {
    const { w, fa, brain } = dummyDuel('dummy-jump');
    let presses = 0;
    let airborne = false;
    for (let i = 0; i < 400; i++) {
      const cmd = brain.think(w);
      if (cmd.buttons & Btn.Jump) presses++;
      fa.inputs.push(cmd);
      w.step();
      if (fa.s.ground === 0) airborne = true;
    }
    expect(presses).toBeGreaterThanOrEqual(3);
    expect(airborne, 'it actually left the ground').toBe(true);
  });

  it('cpu plays exactly like the regular normal AI with the same seed', () => {
    const playOut = (level: BotDifficulty) => {
      const w = new World({ arenaId: 'bridge', wins: 2, roundTime: 60 });
      const fa = w.addFighter(1, 0, 'A', sanitizeLoadout({ hero: 3 }), true);
      const fb = w.addFighter(2, 1, 'B', DEFENDER, true);
      const ba = new BotBrain(1, 99, level);
      const bb = new BotBrain(2, 5, 'normal');
      w.start();
      const seen: string[] = [];
      for (let i = 0; i < 600 && w.phase !== 'over'; i++) {
        const ca = ba.think(w);
        seen.push(`${ca.moveX},${ca.moveY},${ca.buttons}`);
        fa.inputs.push(ca);
        fb.inputs.push(bb.think(w));
        w.step();
      }
      return seen.join(';');
    };
    expect(playOut('cpu')).toBe(playOut('normal'));
  });
});

describe('the dummy bot never touches the round clock or K.O.s in training', () => {
  it('a dummy-guard fighter in a training world survives a long stretch without a K.O.', () => {
    const { w, brain, fa } = dummyDuel('dummy-guard');
    let ko = false;
    for (let i = 0; i < 300; i++) {
      fa.inputs.push(brain.think(w));
      w.step();
      if (w.events.some((e) => e.t === 'ko')) ko = true;
      w.events = [];
    }
    expect(ko).toBe(false);
    expect(w.timeLeft).toBe(90);
  });
});
