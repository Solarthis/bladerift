// A player who leaves a duel on purpose (Main menu > Leave) forfeits it at once: the client sends {op:'leave'} before
// closing, and the room drops them instead of holding the seat for the reconnect grace (which is for dropped links).
import { describe, expect, it } from 'vitest';
import { Room } from '../src/room';
import { decodeJson, encodeJson, MatchEndMsg, Msg, msgType, PROTOCOL_VERSION } from '../src/protocol';
import { sanitizeLoadout } from '../src/heroes';

class FakeSocket {
  readonly sent: Uint8Array[] = [];
  readyState = 1;
  bufferedAmount = 0;
  send(data: Uint8Array) {
    this.sent.push(data);
  }
  close() {}
}

describe('leaving a duel', () => {
  it('a player who leaves forfeits at once: the other player wins the match', () => {
    const room = new Room('host-key', 'Leave test', false, { maxRewindSec: 0.55, handOffHost: true });
    const sa = new FakeSocket();
    const ha = room.attach(sa, 'a');
    ha.message(encodeJson(Msg.Hello, { v: PROTOCOL_VERSION, name: 'Ann', color: 0, load: sanitizeLoadout({ hero: 0 }), hostKey: 'host-key' }));
    const sb = new FakeSocket();
    const hb = room.attach(sb, 'b');
    hb.message(encodeJson(Msg.Hello, { v: PROTOCOL_VERSION, name: 'Ben', color: 1, load: sanitizeLoadout({ hero: 1 }) }));
    ha.message(encodeJson(Msg.Lobby, { op: 'start' }));
    expect(room.phase).toBe('playing');
    hb.message(encodeJson(Msg.Lobby, { op: 'leave' }));
    for (let i = 0; i < 3; i++) room.tick();
    expect(room.phase).toBe('results');
    const ends = sa.sent.filter((d) => msgType(d) === Msg.MatchEnd).map((d) => decodeJson<MatchEndMsg>(d));
    expect(ends[0]?.winnerId).toBe(0);
  });
});
