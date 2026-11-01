// Smoke test for the built online server (packages/server/dist/online.mjs). Starts it on a free local port, creates
// a room over HTTP, joins over WebSocket with a Hello, and checks the Welcome and LobbyState replies. It also checks
// that a wrong protocol version is refused and an unknown code is a 404. Exit code 0 = PASS.
//   npm run build:online -w @bladerift/server && node tools/servercheck.mjs
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

// Mirrors packages/shared/src/protocol.ts (Msg is a const enum, so it is not importable at runtime) and constants.ts.
const MSG_HELLO = 1;
const MSG_WELCOME = 101;
const MSG_LOBBY_STATE = 102;
const PROTOCOL_VERSION = 4;

const here = dirname(fileURLToPath(import.meta.url));
const SERVER = join(here, '..', 'packages', 'server', 'dist', 'online.mjs');

const results = [];
function check(name, ok, detail = '') {
  results.push(ok);
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${detail && !ok ? ` (${detail})` : ''}`);
}

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

async function waitFor(fn, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      const v = await fn();
      if (v) return v;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  return null;
}

function encodeHello(hello) {
  const body = new TextEncoder().encode(JSON.stringify(hello));
  const out = new Uint8Array(body.length + 1);
  out[0] = MSG_HELLO;
  out.set(body, 1);
  return out;
}

/**
 * Opens a socket, sends a Hello and collects the first message of each wanted type. wantTypes null means "wait
 * until the server closes the socket" (for refusals, which send a notice and then close).
 */
function joinRoom(base, code, hello, wantTypes, ms = 5000) {
  return new Promise((resolve) => {
    const got = new Map();
    const ws = new WebSocket(`${base.replace(/^http/, 'ws')}/ws?room=${code}`);
    let closed = null;
    const finish = () => {
      clearTimeout(timer);
      resolve({ got, closed, ws });
    };
    const timer = setTimeout(finish, ms);
    ws.on('error', () => {});
    ws.on('close', (code, reason) => {
      closed = { code, reason: String(reason) };
      finish();
    });
    ws.on('message', (raw) => {
      const b = Buffer.from(raw);
      const type = b[0];
      if (!got.has(type)) got.set(type, JSON.parse(b.subarray(1).toString('utf8')));
      if (wantTypes && wantTypes.every((t) => got.has(t))) finish();
    });
    ws.on('open', () => ws.send(encodeHello(hello)));
  });
}

async function main() {
  if (!existsSync(SERVER)) {
    console.log(`FAIL: ${SERVER} not found. Run: npm run build:online -w @bladerift/server`);
    return false;
  }
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, [SERVER, `--port=${port}`], { stdio: ['ignore', 'pipe', 'pipe'] });
  const log = [];
  child.stdout.on('data', (d) => log.push(String(d)));
  child.stderr.on('data', (d) => log.push(String(d)));
  const exited = new Promise((r) => child.on('exit', r));
  console.log(`servercheck: ${SERVER} on ${base}`);
  try {
    const health = await waitFor(async () => {
      const r = await fetch(`${base}/api/health`);
      return r.ok ? r.json() : null;
    }, 10_000);
    check('server answers /api/health', !!health);
    check('health reports game bladerift and protocol v' + PROTOCOL_VERSION, health?.game === 'bladerift' && health?.v === PROTOCOL_VERSION, JSON.stringify(health));

    const created = await fetch(`${base}/api/rooms`, { method: 'POST' });
    const room = created.ok ? await created.json() : {};
    check('POST /api/rooms creates a room', created.status === 200 && /^[A-Z2-9]{4}$/.test(room.code ?? '') && typeof room.hostKey === 'string', `status ${created.status}`);

    const info = await fetch(`${base}/api/rooms/${room.code}`).then((r) => r.json()).catch(() => ({}));
    check('GET /api/rooms/:code shows the empty lobby', info.phase === 'lobby' && info.players === 0, JSON.stringify(info));

    const missing = await fetch(`${base}/api/rooms/ZZZZ`);
    check('unknown room code is a 404', missing.status === 404, `status ${missing.status}`);

    const joined = await joinRoom(base, room.code, { v: PROTOCOL_VERSION, name: 'Smoke', color: 0 }, [MSG_WELCOME, MSG_LOBBY_STATE]);
    const welcome = joined.got.get(MSG_WELCOME);
    const lobby = joined.got.get(MSG_LOBBY_STATE);
    check('receives Welcome', !!welcome, 'no Welcome message');
    check('Welcome gives an id, the protocol version and host rights', typeof welcome?.id === 'number' && welcome?.v === PROTOCOL_VERSION && welcome?.host === true, JSON.stringify(welcome));
    check('receives LobbyState', !!lobby, 'no LobbyState message');
    check('LobbyState is the lobby with our player on the roster', lobby?.phase === 'lobby' && Array.isArray(lobby?.roster) && lobby.roster.length === 1, JSON.stringify(lobby));

    const after = await fetch(`${base}/api/rooms/${room.code}`).then((r) => r.json()).catch(() => ({}));
    check('room counts the joined player', after.players === 1, JSON.stringify(after));

    // A client on another protocol version gets a notice and is closed with code 4005 (see Room.onHello).
    const old = await joinRoom(base, room.code, { v: PROTOCOL_VERSION + 1, name: 'Old', color: 0 }, null);
    check('wrong protocol version is refused (close 4005)', old.closed?.code === 4005, JSON.stringify(old.closed));

    joined.ws.close();
  } catch (e) {
    check('no exception', false, String(e?.stack ?? e));
  } finally {
    child.kill();
    await Promise.race([exited, new Promise((r) => setTimeout(r, 3000))]);
  }
  if (results.includes(false)) console.log('--- server output ---\n' + log.join('').trimEnd());
  return !results.includes(false);
}

const ok = await main();
console.log(ok ? 'PASS' : 'FAIL');
process.exit(ok ? 0 : 1);
