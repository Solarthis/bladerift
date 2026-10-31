// Network load test: N headless WebSocket clients join a running server, the first one (with the host
// key) starts a match, and all of them send combat-like inputs (moving, jetting, constant firing with
// sweeping aim) at 60 Hz in 2-tick batches, exactly like the real client.
// Usage: npx tsx tools/loadtest.ts --url=ws://localhost:7351/ws --key=TEST --clients=20 --seconds=60 [--map=jungle] [--bots=0]
// Online server: create a match first (POST /api/rooms) and pass --url=wss://host/ws?room=CODE --key=<hostKey>.
import WebSocket from 'ws';
import {
  Btn, decodeJson, decodeSnapshot, encodeInputs, encodeJson, encodePing, decodePing, InputCmd, Msg, msgType, PROTOCOL_VERSION,
} from '../packages/shared/src/index';

// (split at the first '=' only: an online --url carries ?room=CODE)
const a = Object.fromEntries(process.argv.slice(2).map((x) => x.replace(/^--/, '')).map((x) => (x.includes('=') ? [x.slice(0, x.indexOf('=')), x.slice(x.indexOf('=') + 1)] : [x, 'true'])));
const URL_ = a.url ?? 'ws://localhost:7351/ws';
const N = Number(a.clients ?? 20);
const SECONDS = Number(a.seconds ?? 60);
const KEY = a.key ?? 'TEST';

interface Stat { dmg: number; shots: number; snaps: number; bytes: number; rtts: number[]; gaps: number[]; last: number; alive: number; deaths: number; kills: number; }
const stats: Stat[] = [];
let started = false;

function client(i: number) {
  const st: Stat = { dmg: 0, shots: 0, snaps: 0, bytes: 0, rtts: [], gaps: [], last: 0, alive: 0, deaths: 0, kills: 0 };
  stats.push(st);
  // the host allows 12 connections per address per 10 s (anti-flood): on one machine, spread the clients over
  // loopback addresses so each looks like its own device, as phones on the Wi-Fi do
  // (Windows and Linux answer on all of 127.0.0.0/8; macOS only has 127.0.0.1 unless aliases are added)
  const local = /^wss?:\/\/(localhost|127\.0\.0\.1)[:/]/.test(URL_) && process.platform !== 'darwin';
  const ws = new WebSocket(URL_.replace('localhost', '127.0.0.1'), local ? { localAddress: `127.0.0.${2 + i}` } : {});
  ws.on('error', (e) => console.error(`client ${i}: ${e.message}`));
  ws.binaryType = 'arraybuffer';
  let seq = 0, selfId = -1, inMatch = false, tick = 0, phase = Math.random() * 6;
  let batch: InputCmd[] = [];
  ws.on('open', () => {
    ws.send(encodeJson(Msg.Hello, { v: PROTOCOL_VERSION, name: `Load${i}`, color: i % 12, hostKey: i === 0 ? KEY : undefined }));
    setInterval(() => ws.readyState === 1 && ws.send(encodePing(performance.now())), 1000);
  });
  ws.on('message', (raw: ArrayBuffer) => {
    const d = new Uint8Array(raw);
    st.bytes += d.length;
    switch (msgType(d)) {
      case Msg.Welcome: selfId = decodeJson<{ id: number }>(d).id; break;
      case Msg.MatchStart: inMatch = true; break;
      case Msg.Pong: st.rtts.push(performance.now() - decodePing(d)); break;
      case Msg.Snapshot: {
        const s = decodeSnapshot(d);
        const now = performance.now();
        if (st.last) st.gaps.push(now - st.last);
        st.last = now;
        st.snaps++;
        tick = s.tick;
        if (i === 0) for (const e of s.events) { if (e.t === 'dmg') st.dmg++; if (e.t === 'shot') st.shots++; }
        for (const e of s.events) if (e.t === 'kill') { if (e.v === selfId) st.deaths++; if (e.k === selfId && e.v !== selfId) st.kills++; }
        break;
      }
    }
  });
  // 60 Hz input loop
  let next = performance.now();
  const loop = () => {
    if (ws.readyState > 1) return;
    if (inMatch && ws.readyState === 1) {
      phase += 1 / 60;
      const moveX = Math.sin(phase * 0.7 + i) > 0 ? 1 : -1;
      let buttons = Btn.Fire;
      if (Math.sin(phase * 1.3 + i * 2) > 0.2) buttons |= Btn.Jet;
      if (Math.random() < 0.004) buttons |= Btn.Grenade;
      if (Math.random() < 0.01) buttons |= Btn.Pickup;
      batch.push({ seq: ++seq, moveX, buttons, aim: Math.sin(phase * 0.9 + i) * Math.PI, viewTick: Math.max(0, tick - 6) });
      if (batch.length >= 2) { ws.send(encodeInputs(batch)); batch = []; }
    }
    next += 1000 / 60;
    setTimeout(loop, Math.max(0, next - performance.now()));
  };
  loop();
  return ws;
}

// Players from an earlier run keep their seats for the 20 s reconnect grace (as a phone that dropped off the Wi-Fi
// would): wait until the host is empty, or this run would find the room full.
const info = URL_.replace(/^ws/, 'http').replace(/\/ws$/, '/api/info');
for (let t = 0; t < 30; t++) {
  const n = await fetch(info).then((r) => r.json()).then((j) => j.players as number).catch(() => 0);
  if (!n) break;
  if (t === 0) console.error(`waiting for ${n} seat(s) from an earlier run to free up...`);
  await new Promise((r) => setTimeout(r, 1000));
}
const sockets: WebSocket[] = [];
for (let i = 0; i < N; i++) setTimeout(() => sockets.push(client(i)), i * 40);
// (over the internet the host's socket can take a second or more to open: start once it has)
const startWhenOpen = () => {
  const host = sockets[0];
  if (host?.readyState !== 1) return void setTimeout(startWhenOpen, 200);
  // (a match left running by an earlier run would ignore 'start': back to the lobby first)
  host.send(encodeJson(Msg.Lobby, { op: 'toLobby' }));
  host.send(encodeJson(Msg.Lobby, { op: 'bots', count: Number(a.bots ?? 0) }));
  host.send(encodeJson(Msg.Lobby, { op: 'settings', settings: { mapId: a.map ?? 'jungle', mode: a.mode ?? 'ffa', timeLimit: Math.max(60, SECONDS + 30), killLimit: 0 } }));
  host.send(encodeJson(Msg.Lobby, { op: 'start' }));
  started = true;
};
setTimeout(startWhenOpen, N * 40 + 800);

const pct = (v: number[], p: number) => { const s = [...v].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * p))] : 0; };
setTimeout(async () => {
  const httpUrl = URL_.replace(/^ws/, 'http').replace(/\/ws$/, '/api/stats');
  // (the online server has no /api/stats: its numbers are then left out)
  const server = await fetch(httpUrl).then((r) => r.json()).catch(() => ({}));
  const ms = (v: unknown) => (typeof v === 'number' ? +v.toFixed(3) : null);
  const allGaps = stats.flatMap((s) => s.gaps.slice(30));
  const allRtt = stats.flatMap((s) => s.rtts.slice(2));
  const totalBytes = stats.reduce((x, s) => x + s.bytes, 0);
  const report = {
    clients: N, bots: Number(a.bots ?? 0), seconds: SECONDS, started,
    snapshotsPerClientPerSec: +(stats.reduce((x, s) => x + s.snaps, 0) / N / SECONDS).toFixed(1),
    snapshotGapMs: { p50: +pct(allGaps, 0.5).toFixed(1), p95: +pct(allGaps, 0.95).toFixed(1), p99: +pct(allGaps, 0.99).toFixed(1), max: +pct(allGaps, 1).toFixed(1) },
    rttMs: { p50: +pct(allRtt, 0.5).toFixed(2), p95: +pct(allRtt, 0.95).toFixed(2), p99: +pct(allRtt, 0.99).toFixed(2) },
    downKBpsPerClient: +(totalBytes / N / SECONDS / 1024).toFixed(1),
    hostUpKBpsTotal: +(totalBytes / SECONDS / 1024).toFixed(1),
    kills: stats.reduce((x, s) => x + s.kills, 0), dmgEventsSeen: stats[0].dmg, shotEventsSeen: stats[0].shots, deaths: stats.reduce((x, s) => x + s.deaths, 0),
    serverTickMs: { p50: ms(server.tickP50), p99: ms(server.tickP99), max: ms(server.tickMax) },
    serverRssMB: typeof server.rss === 'number' ? Math.round(server.rss / 1048576) : null,
  };
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}, (SECONDS + 2) * 1000 + N * 40 + 800);
