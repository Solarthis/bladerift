/**
 * Direct play (WebRTC): two players near each other (the same town, the same Wi-Fi) are far closer to each other than
 * to the online server, so an online match first tries a direct link between the two devices. The host's page runs
 * the match itself (the same Room the server runs) and the guest talks to it over two data channels: `fast`
 * (unordered, a couple of retransmits: snapshots, inputs, pings) and `rel` (reliable, ordered: lobby, match start and
 * end, chat, kicks). The handshake goes through a tiny signalling script on the game site (public/p2p.php). When no
 * direct path exists (strict carrier NATs), the guest falls back to the online server as before.
 */
import { Msg, Room, RoomSocket } from '@bladerift/shared';
import type { Transport } from './transport';

const ICE: RTCIceServer[] = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }, { urls: 'stun:stun.cloudflare.com:3478' }];
/** The control frame the host sends before it closes the link on purpose: [CLOSE, code lo, code hi, ...reason]. */
const CLOSE = 255;
const FAST = new Set<number>([Msg.Snapshot, Msg.Input, Msg.Ping, Msg.Pong]);
const SIGNAL = 'p2p.php';

async function signal<T>(body: Record<string, unknown>): Promise<T> {
  const r = await fetch(SIGNAL, { method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`signal ${r.status}`);
  return (await r.json()) as T;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const randomId = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => (b % 36).toString(36)).join('') + Date.now().toString(36).slice(-4);

/** The local description once every candidate is in (no trickle: one offer, one answer), or after `ms`. */
async function gathered(pc: RTCPeerConnection, ms = 2500): Promise<RTCSessionDescriptionInit> {
  if (pc.iceGatheringState !== 'complete') {
    await new Promise<void>((done) => {
      const t = setTimeout(done, ms);
      pc.addEventListener('icegatheringstatechange', () => {
        if (pc.iceGatheringState === 'complete') {
          clearTimeout(t);
          done();
        }
      });
    });
  }
  const d = pc.localDescription!;
  return { type: d.type, sdp: d.sdp };
}

/** Both channels open, or null after `ms`. */
function opened(fast: RTCDataChannel, rel: RTCDataChannel, ms: number): Promise<boolean> {
  return new Promise((done) => {
    const t = setTimeout(() => done(false), ms);
    const check = () => {
      if (fast.readyState === 'open' && rel.readyState === 'open') {
        clearTimeout(t);
        done(true);
      }
    };
    fast.addEventListener('open', check);
    rel.addEventListener('open', check);
    check();
  });
}

export interface DirectLink {
  pc: RTCPeerConnection;
  fast: RTCDataChannel;
  rel: RTCDataChannel;
  /** (host side) what the guest sent before the room took the link (its Hello): replayed by attachGuest. */
  early?: Uint8Array[];
}

const supported = () => typeof RTCPeerConnection === 'function' && typeof crypto?.getRandomValues === 'function';

// ---------------------------------------------------------------- guest

/**
 * Try to reach the host of `code` directly (about 6 s at most). Resolves the open link, or null (no WebRTC, the host
 * is not listening, or no path between the two networks).
 */
export async function dialHost(code: string, budgetMs = 6500): Promise<DirectLink | null> {
  if (!supported()) return null;
  const t0 = performance.now();
  const pc = new RTCPeerConnection({ iceServers: ICE });
  const fast = pc.createDataChannel('fast', { ordered: false, maxRetransmits: 2 });
  const rel = pc.createDataChannel('rel', { ordered: true });
  fast.binaryType = rel.binaryType = 'arraybuffer';
  const fail = () => {
    pc.close();
    return null;
  };
  try {
    await pc.setLocalDescription(await pc.createOffer());
    const offer = await gathered(pc);
    const gid = randomId();
    await signal({ op: 'offer', code, gid, sdp: offer.sdp });
    // the host polls about every second; its answer then needs its own candidate gathering
    let answer = '';
    while (!answer && performance.now() - t0 < budgetMs - 1500) {
      await sleep(400);
      const r = await signal<{ sdp?: string }>({ op: 'poll-answer', code, gid });
      answer = r.sdp ?? '';
    }
    if (!answer) return fail();
    await pc.setRemoteDescription({ type: 'answer', sdp: answer });
    const ok = await opened(fast, rel, Math.max(1500, budgetMs - (performance.now() - t0)));
    return ok ? { pc, fast, rel } : fail();
  } catch {
    return fail();
  }
}

/** The guest's side of a direct link: the Session's transport. */
export class RtcTransport implements Transport {
  readonly kind = 'rtc';
  onMessage: (data: Uint8Array) => void = () => {};
  onClose: (code: number, reason: string) => void = () => {};
  onOpen: () => void = () => {};
  private lastTick = -1;
  private prevInputs: Uint8Array | null = null;
  private closed = false;

  constructor(private link: DirectLink) {
    const { pc, fast, rel } = link;
    const recv = (e: MessageEvent) => {
      const d = new Uint8Array(e.data as ArrayBuffer);
      if (d[0] === CLOSE) {
        const code = d[1] | (d[2] << 8);
        return this.end(code, new TextDecoder().decode(d.subarray(3)));
      }
      // (the fast channel is unordered: a snapshot older than one already shown is dropped)
      if (d[0] === Msg.Snapshot && d.length >= 5) {
        const tick = d[1] | (d[2] << 8) | (d[3] << 16) | (d[4] << 24);
        if (tick <= this.lastTick) return;
        this.lastTick = tick;
      }
      this.onMessage(d);
    };
    fast.onmessage = recv;
    rel.onmessage = recv;
    const lost = () => this.end(1006, 'The direct link to the host was lost.');
    rel.onclose = lost;
    pc.addEventListener('connectionstatechange', () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') lost();
    });
    queueMicrotask(() => this.onOpen());
  }

  send(data: Uint8Array) {
    if (this.closed) return;
    if (data[0] === Msg.Input) {
      // inputs ride the lossy channel: each packet repeats the one before (the host drops seqs it already has)
      const prev = this.prevInputs;
      this.prevInputs = data;
      if (prev && prev[1] + data[1] <= 8) {
        const both = new Uint8Array(2 + prev.length - 2 + data.length - 2);
        both[0] = Msg.Input;
        both[1] = prev[1] + data[1];
        both.set(prev.subarray(2), 2);
        both.set(data.subarray(2), prev.length);
        data = both;
      }
    }
    const ch = FAST.has(data[0]) ? this.link.fast : this.link.rel;
    if (ch.readyState === 'open') ch.send(data as Uint8Array<ArrayBuffer>);
  }

  close() {
    this.closed = true;
    try {
      this.link.pc.close();
    } catch {
      /* already gone */
    }
  }

  private end(code: number, reason: string) {
    if (this.closed) return;
    this.close();
    this.onClose(code, reason);
  }
}

// ---------------------------------------------------------------- host

/**
 * The host listens for a guest who dials its code: answers the offer, and once the link is open hands it over (the
 * caller then runs the match in this page). Stops on `stop()` or once a guest is connected.
 */
export class HostListener {
  private stopped = false;
  private busy = false;

  constructor(
    private code: string,
    private onGuest: (link: DirectLink) => void,
  ) {
    if (supported()) void this.loop();
  }

  stop() {
    this.stopped = true;
  }

  private async loop() {
    while (!this.stopped) {
      try {
        const r = await signal<{ gid?: string; sdp?: string }>({ op: 'poll-offer', code: this.code });
        if (r.gid && r.sdp && !this.stopped) await this.answer(r.gid, r.sdp);
      } catch {
        /* the signalling script is not reachable: keep trying slowly */
      }
      await sleep(this.busy ? 200 : 1000);
    }
  }

  private async answer(gid: string, sdp: string) {
    this.busy = true;
    const pc = new RTCPeerConnection({ iceServers: ICE });
    const chans: Record<string, RTCDataChannel> = {};
    const early: Uint8Array[] = [];
    const ready = new Promise<boolean>((done) => {
      const t = setTimeout(() => done(false), 7000);
      pc.ondatachannel = (e) => {
        e.channel.binaryType = 'arraybuffer';
        chans[e.channel.label] = e.channel;
        // (the guest says Hello the moment its side is open, before this page has its room ready)
        e.channel.onmessage = (m) => early.length < 32 && early.push(new Uint8Array(m.data as ArrayBuffer));
        e.channel.onopen = () => {
          if (chans.fast?.readyState === 'open' && chans.rel?.readyState === 'open') {
            clearTimeout(t);
            done(true);
          }
        };
      };
    });
    try {
      await pc.setRemoteDescription({ type: 'offer', sdp });
      await pc.setLocalDescription(await pc.createAnswer());
      const ans = await gathered(pc);
      await signal({ op: 'answer', code: this.code, gid, sdp: ans.sdp });
      if ((await ready) && !this.stopped) {
        this.stopped = true;
        this.onGuest({ pc, fast: chans.fast, rel: chans.rel, early });
        return;
      }
    } catch {
      /* this guest could not be reached: listen on */
    }
    pc.close();
    this.busy = false;
  }
}

/** Seat a guest's direct link in a room running in this page (the host's side of RtcTransport). */
export function attachGuest(room: Room, link: DirectLink) {
  const { pc, fast, rel } = link;
  let open = true;
  const sock: RoomSocket = {
    send(data) {
      if (!open) return;
      const ch = FAST.has(data[0]) ? fast : rel;
      if (ch.readyState === 'open') ch.send(data.slice() as Uint8Array<ArrayBuffer>);
    },
    close(code = 1000, reason = '') {
      if (!open) return;
      open = false;
      const r = new TextEncoder().encode(reason.slice(0, 120));
      const frame = new Uint8Array(3 + r.length);
      frame[0] = CLOSE;
      frame[1] = code & 0xff;
      frame[2] = code >> 8;
      frame.set(r, 3);
      try {
        if (rel.readyState === 'open') rel.send(frame);
      } catch {
        /* closing anyway */
      }
      setTimeout(() => pc.close(), 300);
    },
    get readyState() {
      return open ? 1 : 3;
    },
    get bufferedAmount() {
      return rel.bufferedAmount + fast.bufferedAmount;
    },
  };
  const h = room.attach(sock, 'direct');
  const recv = (e: MessageEvent) => open && h.message(new Uint8Array(e.data as ArrayBuffer));
  fast.onmessage = recv;
  rel.onmessage = recv;
  for (const d of link.early ?? []) h.message(d);
  link.early = [];
  const gone = () => {
    if (!open) return;
    open = false;
    h.close();
  };
  rel.onclose = gone;
  pc.addEventListener('connectionstatechange', () => {
    if (pc.connectionState === 'failed' || pc.connectionState === 'closed') gone();
  });
}

/** A room for a direct match in the host's page: snapshots every tick, lag compensation for the guest's trip. */
export function directRoom(code: string) {
  const room = new Room('local', `Direct match ${code}`, false, { snapshotInterval: 1, maxRewindSec: 0.35, maxInputsPerSec: 300 });
  if (import.meta.env.DEV) (window as unknown as { __room: Room }).__room = room;
  return room;
}
