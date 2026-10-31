// Headless bot benchmark: npx tsx tools/botsim.ts [--map=jungle] [--seconds=60] [--bots=20] [--mode=tdm] [--seed=7]
import { performance } from 'node:perf_hooks';
import { BotBrain, buildNavGraph, GameMode, getMap, MAPS, PLAYER, TICK_RATE, World } from '../packages/shared/src/index';

interface Args {
  maps: string[];
  seconds: number;
  bots: number;
  mode: GameMode;
  seed: number;
}

function parseArgs(argv: string[]): Args {
  const out: Args = { maps: MAPS.map((m) => m.id), seconds: 60, bots: 20, mode: 'tdm', seed: 7 };
  for (const a of argv.slice(2)) {
    const [k, v] = a.split('=');
    if (k === '--map' && v) out.maps = [v];
    else if (k === '--seconds' && v) out.seconds = Math.max(1, Number(v));
    else if (k === '--bots' && v) out.bots = Math.max(2, Math.min(20, Number(v)));
    else if (k === '--mode' && v) out.mode = v === 'ffa' ? 'ffa' : 'tdm';
    else if (k === '--seed' && v) out.seed = Number(v) || 7;
  }
  return out;
}

interface BotTrace {
  x: number;
  y: number;
  streak: number;
  stallTicks: number;
}

interface Result {
  map: string;
  kills: number;
  killsPer45: number;
  stallPct: number;
  airPct: number;
  firstEncounter: number;
  thinkMean: number;
  thinkP99: number;
  ticks: number;
}

function pctl(values: number[], p: number) {
  if (!values.length) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
}

function run(mapId: string, args: Args): Result {
  const map = getMap(mapId);
  const world = new World(map, { mode: args.mode, mapId, timeLimit: args.seconds, killLimit: 0 }, args.seed);
  const brains: BotBrain[] = [];
  for (let i = 0; i < args.bots; i++) {
    world.addPlayer(i, `bot${i}`, { bot: true });
    brains.push(new BotBrain(i, (i % 5) / 4));
  }

  const traces = new Map<number, BotTrace>();
  for (let i = 0; i < args.bots; i++) traces.set(i, { x: -9999, y: -9999, streak: 0, stallTicks: 0 });
  let aliveTicks = 0;
  let airTicks = 0;
  let kills = 0;
  let firstEncounter = -1;
  const thinkMs: number[] = [];
  const totalTicks = Math.round(args.seconds * TICK_RATE);

  for (let t = 0; t < totalTicks; t++) {
    for (const b of brains) {
      const p = world.players.get(b.id)!;
      if (!p.alive) continue;
      const t0 = performance.now();
      const cmd = b.think(world);
      thinkMs.push(performance.now() - t0);
      p.inputs.push(cmd);
    }
    world.step();

    // Encounter: first tick any pair of living enemies can see each other in range.
    if (firstEncounter < 0) {
      outer: for (const a of world.players.values()) {
        if (!a.alive) continue;
        for (const b of world.players.values()) {
          if (!b.alive || b.id <= a.id || !world.isEnemy(a, b)) continue;
          const d = Math.hypot(a.m.x - b.m.x, a.m.y - b.m.y);
          if (d < 1200 && map.lineOfSight(a.m.x, a.m.y - PLAYER.h / 2, b.m.x, b.m.y - PLAYER.h / 2)) {
            firstEncounter = t / TICK_RATE;
            break outer;
          }
        }
      }
    }

    for (const e of world.events) if (e.t === 'kill') kills++;
    world.events.length = 0;

    for (const p of world.players.values()) {
      if (!p.alive) continue;
      const tr = traces.get(p.id)!;
      aliveTicks++;
      if (!p.m.onGround) airTicks++;
      const moved = Math.hypot(p.m.x - tr.x, p.m.y - tr.y);
      tr.x = p.m.x;
      tr.y = p.m.y;
      if (moved < 0.5) {
        tr.streak++;
        if (tr.streak === 3 * TICK_RATE) tr.stallTicks += tr.streak;
        else if (tr.streak > 3 * TICK_RATE) tr.stallTicks++;
      } else {
        tr.streak = 0;
      }
    }
  }

  const scale = 45 / args.seconds;
  return {
    map: mapId,
    kills,
    killsPer45: kills * scale,
    stallPct: aliveTicks ? (100 * [...traces.values()].reduce((s, t) => s + t.stallTicks, 0)) / aliveTicks : 0,
    airPct: aliveTicks ? (100 * airTicks) / aliveTicks : 0,
    firstEncounter,
    thinkMean: thinkMs.reduce((a, b) => a + b, 0) / Math.max(1, thinkMs.length),
    thinkP99: pctl(thinkMs, 0.99),
    ticks: totalTicks,
  };
}

function fmt(r: Result) {
  return `${r.map.padEnd(10)} ${r.kills.toString().padStart(4)} kills (${r.killsPer45.toFixed(0).padStart(3)}/45s)  stall ${r.stallPct.toFixed(2).padStart(5)}%  air ${r.airPct.toFixed(1).padStart(5)}%  first ${r.firstEncounter.toFixed(1).padStart(5)}s  think ${r.thinkMean.toFixed(3)}ms p99 ${r.thinkP99.toFixed(3)}ms`;
}

/** Nav graph summary: warm build time (best of 3), nodes and edge counts by kind. */
function navLine(mapId: string) {
  const map = getMap(mapId);
  let best = Infinity;
  let g = buildNavGraph(map);
  for (let i = 0; i < 3; i++) {
    const t0 = performance.now();
    g = buildNavGraph(map);
    best = Math.min(best, performance.now() - t0);
  }
  const kinds: Record<string, number> = {};
  for (const n of g.nodes) for (const e of n.edges) kinds[e.kind] = (kinds[e.kind] ?? 0) + 1;
  const edges = Object.entries(kinds).map(([k, v]) => `${k} ${v}`).join(', ');
  return `${mapId.padEnd(10)} nav: warm build ${best.toFixed(1)}ms, ${g.nodes.length} nodes, ${g.stats.steps} sim steps, edges: ${edges}`;
}

const args = parseArgs(process.argv);
console.log(`bots=${args.bots} mode=${args.mode} seconds=${args.seconds} seed=${args.seed}`);
for (const id of args.maps) console.log(navLine(id));
for (const id of args.maps) console.log(fmt(run(id, args)));
