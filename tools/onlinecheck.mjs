// Online play check: one browser creates an online match, a second joins it with the invite link, the host starts
// it and both must be in the same game. Also checks a wrong code gets a clear message.
// Usage: node tools/onlinecheck.mjs [--game=http://localhost:5173/] [--online=http://localhost:8080] [--headed]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const a = Object.fromEntries(process.argv.slice(2).map((x) => x.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? 'true']));
const game = a.game ?? 'http://localhost:5173/';
const online = a.online ?? 'http://localhost:8080';
mkdirSync('.cache/shots', { recursive: true });
const browser = await chromium.launch({ headless: !a.headed, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const results = [];
const check = (name, pass, info) => results.push({ name, pass: !!pass, info });
const mk = async () => {
  const p = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  p.errors = [];
  p.on('pageerror', (e) => p.errors.push(String(e)));
  return p;
};
const sep = game.includes('?') ? '&' : '?';

const host = await mk();
await host.goto(`${game}${sep}online=${encodeURIComponent(online)}`);
await host.waitForSelector('[data-act="online"]', { timeout: 20000 });
await host.click('[data-act="online"]');
await host.click('[data-act="onlineCreate"]');
await host.waitForSelector('.room-code', { timeout: 20000 });
const code = (await host.textContent('.room-code')).trim();
check('creating a match shows a 4-character code', /^[A-Z0-9]{4}$/.test(code), { code });
await host.screenshot({ path: '.cache/shots/online-lobby.png' });

// a friend opens the invite link
const friend = await mk();
await friend.goto(`${game}${sep}online=${encodeURIComponent(online)}&room=${code}`);
// a first-time player picks a callsign before joining; the code is already filled in and the link leaves the address bar
await friend.waitForSelector('#online-name', { timeout: 20000 });
check('a first-time invitee is asked for a callsign, code filled in', (await friend.inputValue('#room-code')) === code, { url: friend.url() });
check('the invite code leaves the address bar', !friend.url().includes('room='), { url: friend.url() });
await friend.fill('#online-name', 'Friend');
await friend.click('[data-act="onlineJoin"]');
await friend.waitForFunction(() => window.skyfire?.session?.lobby?.roster?.length >= 2, null, { timeout: 20000 });
const roster = await host.evaluate(() => window.skyfire.session.lobby.roster.map((r) => r.name));
check('the friend joins the lobby through the invite link', roster.length >= 2, { roster });

// a wrong code
const stranger = await mk();
await stranger.goto(`${game}${sep}online=${encodeURIComponent(online)}`);
await stranger.click('[data-act="online"]');
await stranger.fill('#room-code', 'ZZZZ');
await stranger.click('[data-act="onlineJoin"]');
await stranger.waitForTimeout(1500);
const err = await stranger.textContent('#online-err');
check('a wrong code gets a clear message', /no match/i.test(err ?? ''), { err });

// host starts: both in the same game
await host.evaluate(() => {
  window.skyfire.session.lobbyCmd({ op: 'bots', count: 2 });
  window.skyfire.session.lobbyCmd({ op: 'start' });
});
await Promise.all([host, friend].map((p) => p.waitForFunction(() => window.skyfire?.phaser?.scene.getScene('game')?.game_?.latest, null, { timeout: 30000 })));
await friend.waitForTimeout(4000);
const seen = await friend.evaluate(() => {
  const g = window.skyfire.phaser.scene.getScene('game').game_;
  return { players: g.latest.players.length, ping: Math.round(window.skyfire.session.rtt), buffer: Math.round(g.bufferMs) };
});
check('both are in the same match (2 players + 2 bots)', seen.players === 4, seen);
check('the friend plays under the callsign they picked', roster.includes('Friend'), { roster });
await friend.screenshot({ path: '.cache/shots/online-game.png' });
for (const p of [host, friend, stranger]) if (p.errors.length) check('no page errors', false, p.errors.slice(0, 3));

for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}  ${JSON.stringify(r.info ?? {})}`);
console.log(`${results.filter((r) => r.pass).length}/${results.length} passed`);
await browser.close();
process.exit(results.every((r) => r.pass) ? 0 : 1);
