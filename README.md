# Skyfire Squad

Jetpack arena combat for up to 20 players on the same Wi‑Fi. It is an original 2D multiplayer shooter in the spirit of Mini Militia, built as an installable PWA for iPhone, iPad, Android and desktop. A Windows PC (the Lenovo Legion Go) hosts each match.

- **Play / install:** https://games.matsolutions.gy (offline practice vs bots, install as an app, join a LAN match)
- **Architecture and the LAN/HTTPS decision:** [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- **Art direction:** [docs/ART_DIRECTION.md](docs/ART_DIRECTION.md) · **Licensing:** [docs/LICENSES.md](docs/LICENSES.md) · **Reviews:** [docs/reviews/](docs/reviews/)

## Hosting a LAN match (Legion Go / any Windows PC)

1. Connect the PC to the Wi‑Fi network the players will use. That network must allow devices to see each other, so guest networks with "client isolation" will not work.
2. Double-click **`start-host.cmd`**. The first run installs and builds automatically; you need Node.js 20+ installed.
3. If Windows asks whether to allow network access, choose **Private networks**. If players still can't connect, run `tools/firewall-allow.ps1` once from an administrator PowerShell, and make sure the Wi‑Fi network profile is set to *Private*.
4. Your browser opens the **host console**. Pick the mode, map, time, kill limit and number of bots, then press **Start match** once everyone has joined.
5. Players scan the **QR code** shown in the lobby or terminal, or type the address shown there (for example `http://192.168.1.20:7350`).

Keep the terminal window open while hosting. The address can change between sessions, so always use the QR code or address shown at the time.

**Capacity and lag.** A match holds up to 20 players: for example 15 friends on phones plus 5 bots. With 15 players the host uses well under 1 ms of each 16.7 ms game step and sends about 15 KB/s to each phone (about 0.2 MB/s in total), so any home router copes. Each phone measures how evenly the updates arrive and keeps other players as close to real time as that allows: about 60–70 ms behind on a clean Wi‑Fi, more only when the network gets bumpy. For the smoothest games:
- Use the router's 5 GHz Wi‑Fi, and keep the host close to the router (or plug it in with Ethernet).
- Avoid guest networks and Wi‑Fi extenders between players and the host.
- Turn off battery saver / low-power mode on phones: it slows the Wi‑Fi radio down.

`tools/lancheck.mjs` checks the host side on one machine: a browser joins through the host's Wi‑Fi address while headless players fill the match, and it reports that player's delay, ping, update rate and frame times. (On one machine the traffic never touches the radio, so it shows what the host and the game can do, not how good a particular Wi‑Fi is.)

**On a Mac:** double-click **`start-host.command`** instead (or run `./start-host.command` in Terminal). It installs, builds and starts the host the same way, and keeps the Mac awake while it runs. When macOS asks whether `node` may accept incoming network connections, click **Allow**. The full setup, as a prompt for Claude Code on the Mac, is in [docs/macbook-host-prompt.md](docs/macbook-host-prompt.md).

## Joining as a player

- **Scan the host's QR code** with the phone camera, or open the address shown on the host.
- From the installed app or https://games.matsolutions.gy, tap **Join a LAN match** and enter the host address.
- You must be on the same Wi‑Fi as the host.

**Install the app:**
- iPhone/iPad (Safari): Share → *Add to Home Screen*
- Android (Chrome): ⋮ → *Install app*

**Controls:**
- **Touch:** the left stick moves; push it up for the jetpack and down to drop through platforms. The right stick aims; push it past the ring to fire. Buttons: grenade, swap, reload, pick up. The layout is customizable in Settings.
- **Keyboard and mouse:** A/D move, W/Space jetpack, S drop, mouse aim/fire, right-click or G for a grenade, Q swap, R reload, E pick up, Tab scores.
- **Controller (Legion Go):** left stick moves, A or LT jetpack, right stick aims, RT fires, LB grenade, RB swap, X reload, Y pick up.

## Developer setup

```bash
npm install
```

```bash
npm run art          # rasterize SVG art into atlases (also part of the client build)
```

```bash
npm run dev          # Vite client on :5173 (offline practice works without a server)
```

```bash
npx tsx watch packages/server/src/main.ts --anyhost   # dev LAN server on :7350 (first client becomes host)
```

```bash
npm test             # vitest: simulation, protocol, review regressions, bot navigation
```

```bash
npm run build        # production client (packages/client/dist) + bundled server (packages/server/dist/server.mjs)
```

### Tools

| Tool | Purpose |
|---|---|
| `tools/shot.mjs` | Headless screenshots, e.g. `node tools/shot.mjs --map=canyon --mobile` (needs `npm run dev`) |
| `tools/perf.mjs` | Client frame-time probe against the bundled server, e.g. `--mobile --throttle=4` |
| `tools/loadtest.ts` | 20 headless WebSocket clients in combat against a server, e.g. `npx tsx tools/loadtest.ts --url=ws://localhost:7351/ws --key=TEST` (on one machine each client gets its own loopback address, like separate phones) |
| `tools/lancheck.mjs` | 15-player LAN check: a phone-emulated browser joins through the host's Wi‑Fi address next to headless players; reports delay, ping, update gaps and frame times |
| `tools/firecheck.mjs` | Touch fire regression check on a phone viewport (`--url=` to run it against the live site) |
| `tools/fixedcheck.mjs` | Touch sticks regression check: fixed sticks (reach, landing never fires, button overlap, resize) and floating sticks |
| `tools/viewportcheck.mjs` | Phone viewport resize / rotation check for the game canvas |
| `tools/botsim.ts` | Headless bot matches with navigation metrics |
| `tools/map-preview.mjs` | Render map ASCII to PNG with layout warnings |
| `tools/maps/*.py` | Reproducible map generators |
| `packages/client/art/env-gen.mjs`, `art/fx/gen-fx.mjs` | Environment and effects art generators |
| `deploy/deploy-hostinger.sh` | Build, test, back up, upload and atomically swap the PWA on Hostinger (`--rollback` to revert) |

### Layout

- `packages/shared`: the deterministic simulation (movement, combat, protocol, room, bots, navigation, maps). It runs identically on the server, in the client for prediction, and in-browser for offline practice.
- `packages/server`: the Node LAN host (static files plus WebSocket).
- `packages/client`: the Phaser 4 PWA (`net/`, `game/`, `render/`, `ui/`, `input/`, `audio/`, `art/`).
