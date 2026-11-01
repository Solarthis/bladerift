import { Room } from '@bladerift/shared';

export interface Transport {
  send(data: Uint8Array): void;
  close(): void;
  onMessage: (data: Uint8Array) => void;
  onClose: (code: number, reason: string) => void;
  onOpen: () => void;
  readonly kind: 'ws' | 'local' | 'rtc';
}

export class WsTransport implements Transport {
  readonly kind = 'ws';
  private ws: WebSocket;
  onMessage: (data: Uint8Array) => void = () => {};
  onClose: (code: number, reason: string) => void = () => {};
  onOpen: () => void = () => {};

  constructor(url: string) {
    this.ws = new WebSocket(url);
    this.ws.binaryType = 'arraybuffer';
    this.ws.onopen = () => this.onOpen();
    this.ws.onmessage = (e) => this.onMessage(new Uint8Array(e.data as ArrayBuffer));
    this.ws.onclose = (e) => this.onClose(e.code, e.reason);
  }
  send(data: Uint8Array) {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(data);
  }
  close() {
    this.ws.onclose = null;
    this.ws.close();
  }
  /** Treat the socket as dead now (a phone that woke up on a connection the network dropped while it slept). */
  drop() {
    const cb = this.onClose;
    this.close();
    cb(1006, 'no answer');
  }
}

/**
 * Practice and same-device play: the real server Room runs inside the page and talks to each client through an
 * in-memory socket pair (the simulation is two fighters, far too cheap to need a worker). Several transports may
 * share one room (two players on one device).
 */
export class LocalTransport implements Transport {
  readonly kind = 'local';
  private handlers: ReturnType<Room['attach']>;
  private open = true;
  onMessage: (data: Uint8Array) => void = () => {};
  onClose: (code: number, reason: string) => void = () => {};
  onOpen: () => void = () => {};

  constructor(readonly room: Room, private readonly ownsRoom = true) {
    const self = this;
    this.handlers = this.room.attach(
      {
        send(data) {
          if (!self.open) return;
          const copy = data.slice();
          queueMicrotask(() => self.open && self.onMessage(copy));
        },
        close(code = 1000, reason = '') {
          self.open = false;
          self.onClose(code, reason);
        },
        get readyState() {
          return self.open ? 1 : 3;
        },
        bufferedAmount: 0,
      },
      'local',
    );
    if (ownsRoom) this.room.start();
    queueMicrotask(() => this.onOpen());
  }
  send(data: Uint8Array) {
    if (this.open) this.handlers.message(data.slice());
  }
  close() {
    this.open = false;
    this.handlers.close();
    if (this.ownsRoom) this.room.stop();
  }
}

/** A room in this page (practice / same device): every tick snapshotted, the first to join is host. */
export function localRoom(name = 'Practice') {
  const room = new Room('local', name, true, { snapshotInterval: 1 });
  // (dev builds: capture scripts reach the sim through window.__room)
  if (import.meta.env.DEV) (window as unknown as { __room: Room }).__room = room;
  return room;
}
