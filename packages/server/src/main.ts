import { randomBytes } from 'node:crypto';
import { exec } from 'node:child_process';
import { existsSync, readFileSync, statSync, createReadStream } from 'node:fs';
import { createServer as createHttp, IncomingMessage, ServerResponse } from 'node:http';
import { createServer as createHttps } from 'node:https';
import { networkInterfaces, hostname } from 'node:os';
import { dirname, extname, isAbsolute, join, normalize, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';
import { WebSocketServer } from 'ws';
import { Room } from '@bladerift/shared';

const args = new Map<string, string>();
for (const a of process.argv.slice(2)) {
  const [k, v] = a.replace(/^--/, '').split('=');
  args.set(k, v ?? 'true');
}

const PORT = Number(args.get('port') ?? process.env.PORT ?? 7350);
const here = dirname(fileURLToPath(import.meta.url));
const STATIC = resolve(args.get('static') ?? process.env.SKYFIRE_STATIC ?? join(here, '../../client/dist'));
const CERT_DIR = resolve(args.get('certs') ?? join(here, '../../../certs'));
const NAME = (args.get('name') ?? `${hostname()}'s Arena`).slice(0, 32);
const HOST_KEY = args.get('hostkey') ?? randomBytes(9).toString('base64url');

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

const room = new Room(HOST_KEY, NAME, args.has('anyhost'));

/** LAN IPv4 addresses, Wi-Fi first; virtual adapters (VirtualBox host-only, VPN, WSL) last or dropped. */
function lanAddresses() {
  const out: { ip: string; rank: number }[] = [];
  for (const [name, list] of Object.entries(networkInterfaces())) {
    if (/virtual|vbox|vmware|hyper-v|vethernet|wsl|loopback|openvpn|tap|tun|bluetooth|zerotier|tailscale/i.test(name)) continue;
    for (const a of list ?? []) {
      if (a.family !== 'IPv4' || a.internal || a.address.startsWith('169.254.')) continue;
      let rank = /wi-?fi|wlan|wireless/i.test(name) ? 0 : /ethernet/i.test(name) ? 1 : 2;
      if (a.address.startsWith('192.168.56.')) rank = 9; // VirtualBox host-only default range
      out.push({ ip: a.address, rank });
    }
  }
  out.sort((a, b) => a.rank - b.rank);
  const real = out.filter((o) => o.rank < 9);
  return (real.length ? real : out).map((o) => o.ip);
}

function handle(req: IncomingMessage, res: ServerResponse) {
  try {
    serve(req, res);
  } catch {
    // Malformed URLs / paths must never take the host down.
    if (!res.headersSent) res.statusCode = 400;
    res.end();
  }
}

function serve(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? '/', 'http://x');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (url.pathname === '/api/info') {
    // The hosted PWA probes LAN hosts with this endpoint.
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Private-Network', 'true');
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify({ ...room.info(), lan: lanAddresses(), port: PORT }));
    return;
  }
  if (url.pathname === '/api/stats') {
    const t = [...room.stats.tickMs].sort((a, b) => a - b);
    const pct = (p: number) => (t.length ? t[Math.min(t.length - 1, Math.floor(t.length * p))] : 0);
    res.setHeader('Content-Type', 'application/json');
    const late = [...room.stats.lateMs].sort((a, b) => a - b);
    const lp = (q: number) => (late.length ? late[Math.min(late.length - 1, Math.floor(late.length * q))] : 0);
    res.end(JSON.stringify({ ...room.info(), tickP50: pct(0.5), tickP99: pct(0.99), tickMax: t[t.length - 1] ?? 0, lateP50: lp(0.5), lateP99: lp(0.99), lateMax: late[late.length - 1] ?? 0, bytesOut: room.stats.bytesOut, msgsIn: room.stats.msgsIn, rss: process.memoryUsage().rss }));
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.statusCode = 405;
    res.end();
    return;
  }
  let p = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
  let file = resolve(STATIC, p || 'index.html');
  // Containment by path relation (a string prefix check is fooled by drive-absolute paths like
  // /C:/sibling-dir on Windows and by sibling directories sharing a prefix).
  const rel = relative(STATIC, file);
  if (isAbsolute(p) || /^[a-zA-Z]:/.test(p) || rel.startsWith('..') || isAbsolute(rel)) {
    res.statusCode = 403;
    res.end();
    return;
  }
  if (!existsSync(file) || statSync(file).isDirectory()) {
    if (extname(p)) {
      res.statusCode = 404;
      res.end('not found');
      return;
    }
    file = join(STATIC, 'index.html');
    p = 'index.html';
  }
  if (!existsSync(file)) {
    res.statusCode = 503;
    res.setHeader('Content-Type', 'text/plain');
    res.end('Client build missing. Run "npm run build" first.');
    return;
  }
  res.setHeader('Content-Type', MIME[extname(file)] ?? 'application/octet-stream');
  // Only content-hashed bundles are immutable; generated art and everything else revalidates (ETag-less
  // static serving is cheap on a LAN).
  res.setHeader('Cache-Control', /-[A-Za-z0-9_-]{8}\.(js|css|woff2?)$/.test(p) ? 'public, max-age=31536000, immutable' : 'no-cache');
  const stream = createReadStream(file);
  stream.on('error', () => {
    if (!res.headersSent) res.statusCode = 500;
    res.end();
  });
  stream.pipe(res);
}

const certFile = join(CERT_DIR, 'cert.pem');
const keyFile = join(CERT_DIR, 'key.pem');
const tls = existsSync(certFile) && existsSync(keyFile);
const server = tls ? createHttps({ cert: readFileSync(certFile), key: readFileSync(keyFile) }, handle) : createHttp(handle);
/**
 * Only accept WebSockets from pages this host served (same host), local development, or the official
 * PWA origin. Blocks drive-by pages on other sites from joining or flooding the LAN host.
 */
const ALLOWED_ORIGINS = new Set(['https://games.matsolutions.gy']);
function originAllowed(origin: string | undefined, hostHeader: string | undefined) {
  if (!origin) return true; // non-browser clients (load tests)
  try {
    const o = new URL(origin);
    if (ALLOWED_ORIGINS.has(o.origin)) return true;
    if (hostHeader && o.host === hostHeader) return true;
    return o.hostname === 'localhost' || o.hostname === '127.0.0.1';
  } catch {
    return false;
  }
}
/** Upgrade rate limits: per address and globally, plus a cap on live sockets. */
const upgrades = new Map<string, number[]>();
const globalUpgrades: number[] = [];
const MAX_SOCKETS = 48;
function upgradeAllowed(addr: string) {
  const now = Date.now();
  const prune = (a: number[]) => {
    while (a.length && now - a[0] > 10_000) a.shift();
  };
  const mine = upgrades.get(addr) ?? [];
  prune(mine);
  prune(globalUpgrades);
  if (mine.length >= 12 || globalUpgrades.length >= 80 || wss.clients.size >= MAX_SOCKETS) return false;
  mine.push(now);
  globalUpgrades.push(now);
  upgrades.set(addr, mine);
  if (upgrades.size > 512) upgrades.clear();
  return true;
}
const wss = new WebSocketServer({
  server,
  path: '/ws',
  maxPayload: 8192,
  perMessageDeflate: false,
  verifyClient: (info: { origin: string; req: IncomingMessage }) =>
    originAllowed(info.origin, info.req.headers.host) && upgradeAllowed(info.req.socket.remoteAddress ?? '?'),
});
// Terminate sockets that stop answering protocol pings (half-open phones that slept on Wi-Fi).
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
wss.on('connection', (ws, req) => {
  alive.set(ws, true);
  ws.on('pong', () => alive.set(ws, true));
  (req.socket as { setNoDelay?: (b: boolean) => void }).setNoDelay?.(true);
  const h = room.attach(ws, req.socket.remoteAddress ?? '?');
  ws.on('message', (raw, isBinary) => {
    if (!isBinary) return ws.close(4001, 'binary only');
    const b = raw as Buffer;
    h.message(new Uint8Array(b.buffer, b.byteOffset, b.byteLength));
  });
  ws.on('close', () => h.close());
  ws.on('error', () => {});
});

server.listen(PORT, '0.0.0.0', async () => {
  room.start();
  const scheme = tls ? 'https' : 'http';
  const ips = lanAddresses();
  const join = ips.map((ip) => `${scheme}://${ip}:${PORT}`);
  console.log('\n  SKYFIRE SQUAD — LAN host');
  console.log(`  Arena: ${NAME}`);
  console.log(`  Host console (this device): ${scheme}://localhost:${PORT}/?host=${HOST_KEY}`);
  for (const u of join) console.log(`  Players join: ${u}`);
  if (join[0] && !args.has('quiet')) console.log('\n' + (await QRCode.toString(join[0], { type: 'terminal', small: true })));
  if (!existsSync(join_(STATIC, 'index.html'))) console.log('  ! Client build not found at ' + STATIC);
  if (!ips.length) console.log('  ! No Wi-Fi/LAN address found. Connect this device to the Wi-Fi network players will use.');
  if (args.has('open')) {
    const url = `${scheme}://localhost:${PORT}/?host=${HOST_KEY}`;
    const cmd = process.platform === 'win32' ? `start "" "${url}"` : process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`;
    exec(cmd);
  }
});

function join_(a: string, b: string) {
  return join(a, b);
}

process.on('SIGINT', () => {
  room.stop();
  process.exit(0);
});
