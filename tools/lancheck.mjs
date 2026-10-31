// LAN capacity check: a real browser (phone emulation) joins a running LAN host through its Wi-Fi address while
// tools/loadtest.ts fills the rest of the match with headless players, then reports what that player experiences:
// render delay (adaptive buffer), ping, snapshot rate and gaps, frame times, players in the match. Screenshot saved.
// Usage: start a host (node packages/server/dist/server.mjs --port=7351 --hostkey=TEST --quiet), then
//        node tools/lancheck.mjs [--port=7351] [--players=15] [--seconds=30] [--headed]
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { networkInterfaces } from 'node:os';

const a = Object.fromEntries(process.argv.slice(2).map((x) => x.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? 'true']));
const port = Number(a.port ?? 7351);
const players = Number(a.players ?? 15);
const seconds = Number(a.seconds ?? 30);
const lanIp = Object.values(networkInterfaces()).flat().find((i) => i && i.family === 'IPv4' && !i.internal && !i.address.startsWith('169.254.') && !i.address.startsWith('192.168.56.'))?.address ?? '127.0.0.1';
mkdirSync('.cache/shots', { recursive: true });

// headless players (the first one holds the host key and starts the match)
const load = spawn(process.execPath, ['--import', 'tsx', 'tools/loadtest.ts', `--url=ws://localhost:${port}/ws`, '--key=TEST', `--clients=${players - 1}`, `--seconds=${seconds + 15}`], { stdio: ['ignore', 'pipe', 'inherit'] });
let loadOut = '';
load.stdout.on('data', (d) => (loadOut += d));

const browser = await chromium.launch({ headless: !a.headed, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(`http://${lanIp}:${port}/`);
await page.waitForSelector('[data-act="joinHost"]', { timeout: 15000 });
await page.click('[data-act="joinHost"]');
// in the match (the headless host starts it within a couple of seconds)
await page.waitForFunction(() => window.skyfire?.phaser?.scene.getScene('game')?.game_?.latest, null, { timeout: 30000 });
await page.waitForTimeout(seconds * 1000);
const r = await page.evaluate(() => {
  const sc = window.skyfire.phaser.scene.getScene('game');
  const g = sc.game_;
  const gaps = [...g.snapIntervals].sort((x, y) => x - y);
  const p = (q) => gaps[Math.min(gaps.length - 1, Math.floor(gaps.length * q))] ?? 0;
  return {
    playersInMatch: g.latest.players.length,
    bufferMs: Math.round(g.bufferMs),
    pingMs: Math.round(window.skyfire.session.rtt * 10) / 10,
    snapshotGapMs: { p50: Math.round(p(0.5)), p95: Math.round(p(0.95)), max: Math.round(p(1)) },
    frames: sc.frameStats(),
  };
});
await page.screenshot({ path: '.cache/shots/lancheck.png' });
console.log(JSON.stringify({ joinedVia: `http://${lanIp}:${port}`, ...r, pageErrors: errors.slice(0, 3) }, null, 2));
await browser.close();
await new Promise((res) => load.on('exit', res));
const m = loadOut.match(/\{[\s\S]*\}/);
if (m) {
  const s = JSON.parse(m[0]);
  console.log(JSON.stringify({ headlessPlayers: s.clients, snapshotsPerClientPerSec: s.snapshotsPerClientPerSec, downKBpsPerClient: s.downKBpsPerClient, hostUpKBpsTotal: s.hostUpKBpsTotal, serverTickMs: s.serverTickMs }, null, 2));
}
