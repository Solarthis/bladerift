// Internet play probe: one headless player that runs the REAL client netcode (NetGame: prediction, reconciliation,
// adaptive render delay, view ticks) over a real WebSocket against an online server, in a bot match, and reports what
// a player would feel: snapshot gaps, ping, how often and how far its own fighter was corrected (rubber-banding),
// how long the opponent was frozen, and how the Rift Art of its hero behaved (corrections while the Art is on).
// Usage:
//   npx tsx tools/netprobe.ts --server=https://<online host> [--seconds=60] [--hero=0] [--seed=1] [--quiet]
//   (on a live server only when nobody is playing: it opens a real match)
//   npx tsx tools/netprobe.ts --server=http://localhost:8090 --hero=12     (a local online server behind tools/latproxy.ts)
// A correction is a change of more than 3 px between where the own fighter was shown and where the new snapshot puts
// it after prediction. A hard correction is more than 120 px (the client snaps instead of smoothing). Hits knock the
// own fighter back, and the client learns of them a trip later: those corrections are counted apart ("hitHard").
import WebSocket from 'ws';
import {
  Act, Btn, decodeJson, decodePing, decodeSnapshot, encodeInputs, encodeJson, encodePing, ARTS, artIdOf, HEROES, Loadout, Msg,
  msgType, PROTOCOL_VERSION, RIFT, sanitizeLoadout, TICK_RATE, MatchStartMsg, WelcomeMsg,
} from '../packages/shared/src/index';
import { NetGame } from '../packages/client/src/net/NetGame';

const a = Object.fromEntries(process.argv.slice(2).map((x) => x.replace(/^--/, '')).map((x) => (x.includes('=') ? [x.slice(0, x.indexOf('=')), x.slice(x.indexOf('=') + 1)] : [x, 'true'])));
if (!a.server) throw new Error('--server=<url> is required (it creates a match there)');
const SERVER = a.server.replace(/\/$/, '');
const SECONDS = Number(a.seconds ?? 60);
const HERO = Math.max(0, Math.min(HEROES.length - 1, Number(a.hero ?? 0)));
const quiet = a.quiet === 'true';
const load: Loadout = sanitizeLoadout({ hero: HERO });

const res = await fetch(`${SERVER}/api/rooms`, { method: 'POST' });
if (!res.ok) throw new Error(`create room: ${res.status} ${await res.text()}`);
const { code, hostKey } = (await res.json()) as { code: string; hostKey: string };
const ws = new WebSocket(`${SERVER.replace(/^http/, 'ws')}/ws?room=${code}`);
ws.binaryType = 'arraybuffer';

let game: NetGame | null = null;
let selfId = -1;
let startedAt = 0;
const rtts: number[] = [];
const gaps: number[] = [];
let lastSnap = 0;
let round = -1;
let frozenMs = 0;
let lastFrame = performance.now();

interface Tally {
  snaps: number; corr: number; corrMax: number; hard: number; hitHard: number; artCorr: number; artHard: number; frozen: number; maxGap: number;
}
const blank = (): Tally => ({ snaps: 0, corr: 0, corrMax: 0, hard: 0, hitHard: 0, artCorr: 0, artHard: 0, frozen: 0, maxGap: 0 });
const total = blank();
let sec = blank();
const artNames = new Map<string, number>();
const hardLog: string[] = [];

const hello = () => ws.send(encodeJson(Msg.Hello, { v: PROTOCOL_VERSION, name: `Probe${HERO}`, color: 3, hostKey, load }));

ws.on('open', () => {
  hello();
  setInterval(() => ws.readyState === 1 && ws.send(encodePing(performance.now())), 1000);
  setTimeout(() => {
    ws.send(encodeJson(Msg.Lobby, { op: 'bot', on: true }));
    ws.send(encodeJson(Msg.Lobby, { op: 'botLevel', level: 'normal' }));
    ws.send(encodeJson(Msg.Lobby, { op: 'settings', settings: { arenaId: 'bridge', wins: 2, roundTime: 120 } }));
    ws.send(encodeJson(Msg.Lobby, { op: 'start' }));
  }, 500);
});
ws.on('error', (e) => console.error('socket:', e.message));
ws.on('close', (c, r) => console.error('closed', c, String(r)));
ws.on('message', (raw: ArrayBuffer) => {
  const d = new Uint8Array(raw);
  switch (msgType(d)) {
    case Msg.Welcome:
      selfId = decodeJson<WelcomeMsg>(d).id;
      break;
    case Msg.MatchStart: {
      const m = decodeJson<MatchStartMsg>(d);
      game = new NetGame(m.settings, selfId, true);
      // (the client sets its own loadout from the roster, as Session does: prediction needs it)
      game.load = m.roster.find((r) => r.id === selfId)?.load ?? load;
      startedAt = performance.now();
      break;
    }
    case Msg.Pong:
      rtts.push(performance.now() - decodePing(d));
      break;
    case Msg.Snapshot: {
      if (!game) break;
      const now = performance.now();
      if (lastSnap) {
        gaps.push(now - lastSnap);
        sec.maxGap = Math.max(sec.maxGap, now - lastSnap);
      }
      lastSnap = now;
      const s = decodeSnapshot(d);
      const fight = s.phase === 'fight';
      const roundEdge = s.round !== round;
      round = s.round;
      // what was shown of the own fighter before this snapshot, to measure what the snapshot changed
      const cx = game.corr.x;
      const cy = game.corr.y;
      const sx = (game.pred?.x ?? 0) + cx;
      const sy = (game.pred?.y ?? 0) + cy;
      const preAct = game.pred?.act ?? -1;
      game.onSnapshot(s, now);
      sec.snaps++;
      total.snaps++;
      const art = preAct === Act.Art || s.self?.act === Act.Art;
      const e = Math.max(Math.hypot(game.corr.x - cx, game.corr.y - cy), Math.hypot((game.pred?.x ?? 0) + game.corr.x - sx, (game.pred?.y ?? 0) + game.corr.y - sy));
      if (fight && !roundEdge) {
        if (e > 3) {
          for (const t of [sec, total]) {
            t.corr++;
            t.corrMax = Math.max(t.corrMax, e);
          }
          if (art) for (const t of [sec, total]) t.artCorr++;
        }
        if (e > 120) {
          const hit = s.self?.act === Act.Stun;
          for (const t of [sec, total]) {
            if (hit) t.hitHard++;
            else t.hard++;
            if (art && !hit) t.artHard++;
          }
          if (hardLog.length < 12) hardLog.push(`t=${((now - startedAt) / 1000).toFixed(1)}s ${e.toFixed(0)}px pred=${preAct} srv=${s.self?.act} hit=${hit}`);
        }
      }
      if (art && game.latest) {
        const k = ARTS[artIdOf(load)].name;
        artNames.set(k, (artNames.get(k) ?? 0) + 1);
      }
      break;
    }
  }
});

// 60 Hz client loop, with input that changes often like thumbs on a phone: the stick moves to a new place every
// 0.15-0.9 s, the attack button is held most of the time, jumps and rift-art casts are pressed now and then. Seeded.
let seed = Number(a.seed ?? 1);
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
let moveX = 0;
let jet = false;
let fire = true;
let nextChange = 0;
let phase = 0;
let next = performance.now();
let specialCool = 0;
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
    let buttons = (jet ? Btn.Jump : 0) | (fire ? Btn.A : 0);
    if (specialCool > 0) specialCool--;
    if (game.pred && game.pred.rift >= RIFT.max && specialCool === 0 && rnd() < 0.3) {
      buttons |= Btn.Special;
      specialCool = 45;
    }
    const cmd = game.tick(moveX, 0, buttons);
    ws.send(encodeInputs([cmd]));
    // the opponent frozen: the render clock is past the newest snapshot plus the extrapolation allowance
    const newest = game.latest?.tick ?? 0;
    if (game.renderTick(now) > newest + 6) {
      frozenMs += now - lastFrame;
      sec.frozen += now - lastFrame;
      total.frozen += now - lastFrame;
    }
  }
  lastFrame = now;
  next += 1000 / TICK_RATE;
  setTimeout(loop, Math.max(0, next - performance.now()));
};
loop();

const pct = (v: number[], p: number) => {
  const s = [...v].sort((x, y) => x - y);
  return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * p))] : 0;
};
const timer = setInterval(() => {
  if (!game) return;
  const t = Math.round((performance.now() - startedAt) / 1000);
  if (!quiet)
    console.log(`t=${t}s snaps=${sec.snaps} maxGap=${sec.maxGap.toFixed(0)}ms corr=${sec.corr} (max ${sec.corrMax.toFixed(0)}px, art ${sec.artCorr}) hard=${sec.hard} hitHard=${sec.hitHard} frozen=${sec.frozen.toFixed(0)}ms delay=${game.bufferMs.toFixed(0)}ms ping=${(rtts[rtts.length - 1] ?? 0).toFixed(0)}ms`);
  sec = blank();
}, 1000);

setTimeout(() => {
  clearInterval(timer);
  const g = gaps.slice(30);
  const elapsed = Math.max(1, performance.now() - startedAt);
  const report = {
    server: SERVER, room: code, hero: HEROES[HERO].name, art: ARTS[artIdOf(load)].name, seconds: SECONDS, arts: Object.fromEntries(artNames),
    snapshotsPerSec: +(total.snaps / (elapsed / 1000)).toFixed(1),
    snapshotGapMs: { p50: +pct(g, 0.5).toFixed(1), p95: +pct(g, 0.95).toFixed(1), p99: +pct(g, 0.99).toFixed(1), max: +pct(g, 1).toFixed(1), over150: g.filter((x) => x > 150).length },
    pingMs: { p50: +pct(rtts.slice(2), 0.5).toFixed(0), p95: +pct(rtts.slice(2), 0.95).toFixed(0), max: +pct(rtts.slice(2), 1).toFixed(0) },
    corrections: total.corr,
    correctionMaxPx: +total.corrMax.toFixed(1),
    hardCorrectionsNoHit: total.hard,
    hardCorrectionsFromHits: total.hitHard,
    artCorrections: total.artCorr,
    artHardNoHit: total.artHard,
    hardLog,
    opponentFrozenPct: +((frozenMs / elapsed) * 100).toFixed(2),
    renderDelayMs: +(game?.bufferMs ?? 0).toFixed(0),
  };
  console.log(JSON.stringify(report, null, 2));
  ws.send(encodeJson(Msg.Lobby, { op: 'toLobby' }));
  setTimeout(() => process.exit(0), 300);
}, (SECONDS + 3) * 1000);
