// Internet play probe: one headless player that runs the REAL client netcode (NetGame: prediction, reconciliation,
// adaptive render delay, view ticks) against a server, hosting a match with bots, and reports what a player would
// feel: snapshot gaps, ping, how often and how far its own player was corrected by more than 3 px (rubber-banding), and how long the
// other players were frozen (render clock past the newest snapshot).
// Usage:
//   npx tsx tools/netprobe.ts --server=https://purple-armadillo-718213.hostingersite.com [--seconds=60] [--bots=4] [--seed=1]
//   (on the live server only when nobody is playing: it opens a real match)
//   npx tsx tools/netprobe.ts --server=http://localhost:8080          (a local online.ts, e.g. behind tools/latproxy.ts)
import WebSocket from 'ws';
import {
  Btn, decodeJson, decodePing, decodeSnapshot, encodeInputs, encodeJson, encodePing, Msg, msgType, PROTOCOL_VERSION, TICK_RATE,
} from '../packages/shared/src/index';
import { NetGame } from '../packages/client/src/net/NetGame';

const a = Object.fromEntries(process.argv.slice(2).map((x) => x.replace(/^--/, '')).map((x) => (x.includes('=') ? [x.slice(0, x.indexOf('=')), x.slice(x.indexOf('=') + 1)] : [x, 'true'])));
if (!a.server) throw new Error('--server=<url> is required (it creates a match there)');
const SERVER = a.server.replace(/\/$/, '');
const SECONDS = Number(a.seconds ?? 60);
const BOTS = Number(a.bots ?? 4);
const quiet = a.quiet === 'true';

const res = await fetch(`${SERVER}/api/rooms`, { method: 'POST' });
if (!res.ok) throw new Error(`create room: ${res.status} ${await res.text()}`);
const { code, hostKey } = (await res.json()) as { code: string; hostKey: string };
const ws = new WebSocket(`${SERVER.replace(/^http/, 'ws')}/ws?room=${code}`);
ws.binaryType = 'arraybuffer';

let game: NetGame | null = null;
let selfId = -1;
const rtts: number[] = [];
const gaps: number[] = [];
let lastSnap = 0;
let corrections = 0;
let corrSum = 0;
let corrMax = 0;
let frozenMs = 0;
let startedAt = 0;
let sec = { snaps: 0, maxGap: 0, corr: 0, corrMax: 0, frozen: 0 };

ws.on('open', () => {
  ws.send(encodeJson(Msg.Hello, { v: PROTOCOL_VERSION, name: 'Probe', color: 3, hostKey }));
  setInterval(() => ws.readyState === 1 && ws.send(encodePing(performance.now())), 1000);
  setTimeout(() => {
    ws.send(encodeJson(Msg.Lobby, { op: 'bots', count: BOTS }));
    ws.send(encodeJson(Msg.Lobby, { op: 'settings', settings: { mapId: 'jungle', mode: 'ffa', timeLimit: Math.max(60, SECONDS + 30), killLimit: 0 } }));
    ws.send(encodeJson(Msg.Lobby, { op: 'start' }));
  }, 500);
});
ws.on('error', (e) => console.error('socket:', e.message));
ws.on('close', (c, r) => console.error('closed', c, String(r)));
ws.on('message', (raw: ArrayBuffer) => {
  const d = new Uint8Array(raw);
  switch (msgType(d)) {
    case Msg.Welcome: selfId = decodeJson<{ id: number }>(d).id; break;
    case Msg.MatchStart: {
      const m = decodeJson<{ settings: never }>(d);
      game = new NetGame(m.settings, selfId, true);
      startedAt = performance.now();
      break;
    }
    case Msg.Pong: rtts.push(performance.now() - decodePing(d)); break;
    case Msg.Snapshot: {
      if (!game) break;
      const now = performance.now();
      if (lastSnap) {
        gaps.push(now - lastSnap);
        sec.maxGap = Math.max(sec.maxGap, now - lastSnap);
      }
      lastSnap = now;
      sec.snaps++;
      // a correction is a new jump between where we showed ourselves and where the server says we are (what is left
      // of an earlier one, still being smoothed away, is not counted again)
      const cx = game.corr.x;
      const cy = game.corr.y;
      const sx = game.pred.x + cx;
      const sy = game.pred.y + cy;
      const wasAlive = game.self?.alive ?? false;
      game.onSnapshot(decodeSnapshot(d), now);
      // (a jump over 140 px is snapped, not smoothed: then the shown position itself moved)
      const snapped = wasAlive && game.self?.alive ? Math.hypot(game.pred.x + game.corr.x - sx, game.pred.y + game.corr.y - sy) : 0;
      const e = Math.max(Math.hypot(game.corr.x - cx, game.corr.y - cy), snapped);
      if (e > 3) {
        corrections++;
        corrSum += e;
        corrMax = Math.max(corrMax, e);
        sec.corr++;
        sec.corrMax = Math.max(sec.corrMax, e);
      }
      break;
    }
  }
});

// 60 Hz client loop with realistic input that changes often, like thumbs on a phone: the stick moves to a new place
// every 0.15-0.9 s, the jetpack is pressed and released, fire is held most of the time, the aim sweeps. Seeded, so
// two runs (old and new code) play the same inputs.
let seed = Number(a.seed ?? 1);
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
let moveX = 0;
let jet = false;
let fire = true;
let nextChange = 0;
let phase = 0;
let next = performance.now();
let lastFrame = performance.now();
const loop = () => {
  if (ws.readyState > 1) return;
  const now = performance.now();
  if (game && ws.readyState === 1) {
    phase += 1 / TICK_RATE;
    if (phase >= nextChange) {
      nextChange = phase + 0.15 + rnd() * 0.75;
      const r = rnd();
      moveX = r < 0.15 ? 0 : r < 0.55 ? -(0.4 + rnd() * 0.6) : 0.4 + rnd() * 0.6;
      jet = rnd() < 0.5;
      fire = rnd() < 0.7;
    }
    const buttons = (jet ? Btn.Jet : 0) | (fire ? Btn.Fire : 0);
    const cmd = game.tick(moveX, buttons, Math.sin(phase * 0.6) * Math.PI);
    ws.send(encodeInputs([cmd]));
    // other players frozen: the render clock is past the newest snapshot plus the extrapolation allowance
    const newest = game.latest?.tick ?? 0;
    if (game.renderTick(now) > newest + 6) {
      frozenMs += now - lastFrame;
      sec.frozen += now - lastFrame;
    }
  }
  lastFrame = now;
  next += 1000 / TICK_RATE;
  setTimeout(loop, Math.max(0, next - performance.now()));
};
loop();

const pct = (v: number[], p: number) => { const s = [...v].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * p))] : 0; };
const timer = setInterval(() => {
  if (!game) return;
  const t = Math.round((performance.now() - startedAt) / 1000);
  if (!quiet)
    console.log(`t=${t}s snaps=${sec.snaps} maxGap=${sec.maxGap.toFixed(0)}ms corrections=${sec.corr} (max ${sec.corrMax.toFixed(0)}px) frozen=${sec.frozen.toFixed(0)}ms delay=${game.bufferMs.toFixed(0)}ms ping=${(rtts[rtts.length - 1] ?? 0).toFixed(0)}ms`);
  sec = { snaps: 0, maxGap: 0, corr: 0, corrMax: 0, frozen: 0 };
}, 1000);

setTimeout(() => {
  clearInterval(timer);
  const g = gaps.slice(30);
  const mins = (performance.now() - startedAt) / 60000;
  const report = {
    server: SERVER, room: code, seconds: SECONDS, bots: BOTS,
    snapshotsPerSec: +(gaps.length / ((performance.now() - startedAt) / 1000)).toFixed(1),
    snapshotGapMs: { p50: +pct(g, 0.5).toFixed(1), p95: +pct(g, 0.95).toFixed(1), p99: +pct(g, 0.99).toFixed(1), max: +pct(g, 1).toFixed(1), over150: g.filter((x) => x > 150).length },
    pingMs: { p50: +pct(rtts.slice(2), 0.5).toFixed(0), p95: +pct(rtts.slice(2), 0.95).toFixed(0), max: +pct(rtts.slice(2), 1).toFixed(0) },
    correctionsPerMin: +(corrections / mins).toFixed(1),
    correctionPx: { mean: +(corrections ? corrSum / corrections : 0).toFixed(1), max: +corrMax.toFixed(1) },
    othersFrozenPct: +((frozenMs / (performance.now() - startedAt)) * 100).toFixed(2),
    renderDelayMs: +(game?.bufferMs ?? 0).toFixed(0),
  };
  console.log(JSON.stringify(report, null, 2));
  ws.send(encodeJson(Msg.Lobby, { op: 'toLobby' }));
  setTimeout(() => process.exit(0), 300);
}, (SECONDS + 3) * 1000);
