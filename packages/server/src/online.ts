// Bladerift online server: many rooms in one process, each joined with a short code. Players open the game at
// https://games.matsolutions.gy/bladerift/, create a match (POST /api/rooms -> code + host key) or join one by code,
// and play over a WebSocket at /ws?room=CODE. Runs on any Node 20+ host that gives it a port (PORT env), e.g.
// Hostinger's Node.js apps, behind their HTTPS proxy. No static files: the game itself is served by the website.
//   node online.mjs [--port=8080]
// This is a public internet server: nothing a client sends may crash the process, and every per-client resource
// (rooms, sockets, requests) is capped per address.
import { randomBytes, randomInt } from 'node:crypto';
import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocket, WebSocketServer } from 'ws';
import { PROTOCOL_VERSION, Room } from '@bladerift/shared';

const args = new Map<string, string>();
for (const a of process.argv.slice(2)) {
  const [k, v] = a.replace(/^--/, '').split('=');
  args.set(k, v ?? 'true');
}
const PORT = Number(args.get('port') ?? process.env.PORT ?? 8080);
const STARTED = Date.now();

// A bug must cost one request or one room, never every match on the server.
process.on('uncaughtException', (e) => console.error('uncaught', e));
process.on('unhandledRejection', (e) => console.error('unhandled rejection', e));

/**
 * Pages allowed to use this server: the website (Bladerift lives under /bladerift/, same origin), plus local
 * development and BLADERIFT_ORIGINS (comma-separated). (Origin only stops other websites from using the server
 * through their visitors' browsers; scripts can send any Origin, so abuse limits are per address.)
 */
const ALLOWED_ORIGINS = new Set(['https://games.matsolutions.gy', ...(process.env.BLADERIFT_ORIGINS ?? '').split(',').filter(Boolean)]);
const originOk = (origin: string | undefined) => {
  if (!origin) return true; // non-browser clients (load tests)
  if (ALLOWED_ORIGINS.has(origin)) return true;
  try {
    const h = new URL(origin).hostname;
    return h === 'localhost' || h === '127.0.0.1';
  } catch {
    return false;
  }
};

/** Codes: 4 characters with no look-alikes (0/O, 1/I/L), easy to read out loud. */
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const MAX_ROOMS = 40;
/** Live rooms one address may have created (phones on one carrier can share an address, so not 1). */
const ROOMS_PER_ADDR = 3;
/** Open sockets per address (a household or a carrier NAT holds several players). */
const SOCKETS_PER_ADDR = 24;
/** An empty room closes after this long (players who drop keep their seat for 20 s inside the room itself). */
const EMPTY_CLOSE_MS = 3 * 60_000;
/** A room nobody ever joined closes sooner. */
const UNUSED_CLOSE_MS = 90_000;
/** Even a busy room ends after this long, so rooms cannot be held forever. */
const MAX_ROOM_MS = 4 * 3600_000;
/** Internet players need a longer lag-compensation window than LAN (0.3 s): ping (~0.3 s from Guyana) + render delay
 * and input jitter cushion (~0.25 s). Longer windows let a lagging attacker's hit land on a dodge already made. */
const ONLINE_REWIND_SEC = 0.55;

interface OnlineRoom {
  code: string;
  room: Room;
  createdAt: number;
  emptySince: number;
  joined: boolean;
  owner: string;
  sockets: Set<WebSocket>;
}
const rooms = new Map<string, OnlineRoom>();
const socketsByAddr = new Map<string, number>();

function newCode() {
  for (let n = 0; n < 50; n++) {
    let c = '';
    for (let i = 0; i < 4; i++) c += CODE_CHARS[randomInt(CODE_CHARS.length)];
    if (!rooms.has(c)) return c;
  }
  return null;
}

/**
 * Client address. Hostinger's proxy connects from loopback and sets X-Real-IP to the real address, overwriting any
 * the client sent (checked on the live server; X-Forwarded-For keeps client-supplied entries, so it is not used).
 * Without a local proxy in front (a VPS), headers are ignored and the socket address counts.
 */
function addrOf(req: IncomingMessage) {
  const remote = req.socket.remoteAddress ?? '?';
  const viaProxy = remote === '127.0.0.1' || remote === '::1' || remote === '::ffff:127.0.0.1';
  const real = req.headers['x-real-ip'];
  return (viaProxy && typeof real === 'string' && real.trim()) || remote;
}

/** Sliding-window rate limits per address; old addresses are evicted one by one (never all at once). */
function limiter(max: number, windowMs: number) {
  const hits = new Map<string, number[]>();
  return (key: string) => {
    const now = Date.now();
    const list = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (list.length >= max) {
      hits.set(key, list);
      return false;
    }
    list.push(now);
    hits.delete(key); // re-insert: the map stays ordered by last use
    hits.set(key, list);
    while (hits.size > 4096) hits.delete(hits.keys().next().value!);
    return true;
  };
}
const createLimit = limiter(6, 60_000);
const lookupLimit = limiter(60, 60_000);
const upgradeLimit = limiter(40, 10_000);

function json(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function closeRoom(r: OnlineRoom, code: number, why: string) {
  for (const ws of r.sockets) ws.close(code, why);
  r.room.stop();
  rooms.delete(r.code);
}

function serve(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? '/', 'http://x');
  const origin = req.headers.origin;
  const addr = addrOf(req);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (origin && originOk(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }
  if (url.pathname === '/' || url.pathname === '/api/health') {
    const players = [...rooms.values()].reduce((n, r) => n + r.room.info().players, 0);
    json(res, 200, { ok: true, game: 'bladerift', v: PROTOCOL_VERSION, rooms: rooms.size, players, uptime: Math.round((Date.now() - STARTED) / 1000) });
    return;
  }
  if (url.pathname === '/api/rooms' && req.method === 'POST') {
    if (!originOk(origin)) return json(res, 403, { error: 'origin' });
    if (!createLimit(addr)) return json(res, 429, { error: 'Too many new matches - wait a minute.' });
    if ([...rooms.values()].filter((r) => r.owner === addr).length >= ROOMS_PER_ADDR)
      return json(res, 429, { error: 'You already have matches open - use one of those, or wait for them to close.' });
    if (rooms.size >= MAX_ROOMS) return json(res, 503, { error: 'The online server is full right now - try again soon.' });
    const code = newCode();
    if (!code) return json(res, 503, { error: 'The online server is busy - try again.' });
    const hostKey = randomBytes(12).toString('base64url');
    const room = new Room(hostKey, `Online match ${code}`, false, { maxRewindSec: ONLINE_REWIND_SEC, handOffHost: true });
    room.start();
    rooms.set(code, { code, room, createdAt: Date.now(), emptySince: Date.now(), joined: false, owner: addr, sockets: new Set() });
    console.log(`room ${code} created (${rooms.size} open)`);
    return json(res, 200, { code, hostKey, v: PROTOCOL_VERSION });
  }
  const m = url.pathname.match(/^\/api\/rooms\/([A-Za-z0-9]{4})$/);
  if (m && req.method === 'GET') {
    if (!lookupLimit(addr)) return json(res, 429, { error: 'Too many tries - wait a minute.' });
    const r = rooms.get(m[1].toUpperCase());
    if (!r) return json(res, 404, { error: 'No match with that code - check it, or ask the host for a new one.' });
    return json(res, 200, { code: r.code, ...r.room.info() });
  }
  json(res, 404, { error: 'not found' });
}

const server = createServer((req, res) => {
  try {
    serve(req, res);
  } catch {
    if (!res.headersSent) res.statusCode = 400;
    res.end();
  }
});
server.on('clientError', (_e, socket) => socket.destroy());

const wss = new WebSocketServer({ noServer: true, maxPayload: 8192, perMessageDeflate: false });

function upgrade(req: IncomingMessage, socket: Duplex, head: Buffer) {
  const reject = (code: number, msg: string) => {
    socket.write(`HTTP/1.1 ${code} ${msg}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
    socket.destroy();
  };
  const url = new URL(req.url ?? '/', 'http://x');
  const r = url.pathname === '/ws' ? rooms.get((url.searchParams.get('room') ?? '').toUpperCase()) : undefined;
  const addr = addrOf(req);
  if (!originOk(req.headers.origin)) return reject(403, 'Forbidden');
  if (!upgradeLimit(addr)) return reject(429, 'Too Many Requests');
  if ((socketsByAddr.get(addr) ?? 0) >= SOCKETS_PER_ADDR) return reject(429, 'Too Many Requests');
  if (!r) return reject(404, 'Not Found');
  wss.handleUpgrade(req, socket, head, (ws) => {
    socketsByAddr.set(addr, (socketsByAddr.get(addr) ?? 0) + 1);
    r.sockets.add(ws);
    alive.set(ws, true);
    ws.on('pong', () => alive.set(ws, true));
    (req.socket as { setNoDelay?: (b: boolean) => void }).setNoDelay?.(true);
    const h = r.room.attach(ws, addr);
    ws.on('message', (raw, isBinary) => {
      if (!isBinary) return ws.close(4001, 'binary only');
      const b = raw as Buffer;
      try {
        h.message(new Uint8Array(b.buffer, b.byteOffset, b.byteLength));
      } catch (e) {
        console.error(`room ${r.code}: bad message`, e);
        ws.close(4002, 'bad message');
      }
    });
    ws.on('close', () => {
      const n = (socketsByAddr.get(addr) ?? 1) - 1;
      if (n > 0) socketsByAddr.set(addr, n);
      else socketsByAddr.delete(addr);
      r.sockets.delete(ws);
      h.close();
    });
    ws.on('error', () => {});
  });
}

server.on('upgrade', (req, socket, head) => {
  socket.on('error', () => {});
  try {
    upgrade(req, socket, head);
  } catch {
    socket.destroy();
  }
});

// Half-open sockets (phones that slept) are dropped by protocol pings.
const alive = new WeakMap<object, boolean>();
setInterval(() => {
  for (const ws of wss.clients) {
    if (alive.get(ws) === false) {
      ws.terminate();
      continue;
    }
    alive.set(ws, false);
    ws.ping();
  }
}, 10_000);

// Close rooms that are empty for a while (and rooms created but never joined), and rooms past their lifetime.
setInterval(() => {
  const now = Date.now();
  for (const r of [...rooms.values()]) {
    if (now - r.createdAt > MAX_ROOM_MS) {
      closeRoom(r, 4010, 'match ended');
      continue;
    }
    // (a room counts as used once a player has said hello: a bare socket does not keep it alive longer)
    if (r.room.info().players > 0) {
      r.joined = true;
      r.emptySince = now;
      continue;
    }
    if (now - r.emptySince > (r.joined ? EMPTY_CLOSE_MS : UNUSED_CLOSE_MS)) closeRoom(r, 4010, 'match ended');
  }
}, 15_000);

// Standalone it listens on PORT. Mounted in the MAT games server (games-hub/server/online.mjs, one Node app for every
// game), the host routes this game's requests here instead and owns the port.
const mounted = (globalThis as { __MAT_MOUNTED?: boolean }).__MAT_MOUNTED === true;
if (!mounted) server.listen(PORT, () => console.log(`Bladerift online server on :${PORT} (protocol v${PROTOCOL_VERSION})`));
/** For the MAT games server: hand this game a request or a WebSocket upgrade (paths without the game's prefix). */
export const mount = {
  request: (req: IncomingMessage, res: ServerResponse) => server.emit('request', req, res),
  upgrade: (req: IncomingMessage, socket: Duplex, head: Buffer) => server.emit('upgrade', req, socket, head),
};
for (const sig of ['SIGINT', 'SIGTERM'] as const)
  process.on(sig, () => {
    // players see "the server restarted" instead of a silent drop and 15 s of retries
    for (const r of [...rooms.values()]) closeRoom(r, 4011, 'server restarting');
    setTimeout(() => process.exit(0), 300);
  });
