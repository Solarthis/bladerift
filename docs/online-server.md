# Online play server

Online matches (title screen → **Play online**) run on a separate Node server, `packages/server/src/online.ts`.
The game is served by the website at https://games.matsolutions.gy/bladerift/; the client talks to the server
cross-origin (`POST /api/rooms`, `GET /api/rooms/:code`, WebSocket `/ws?room=CODE`).

| | |
|---|---|
| Server URL | Not deployed yet. Create a **new** Node.js web app in hPanel (see below); do not reuse Skyfire Squad's (`purple-armadillo-718213.hostingersite.com`), because redeploying that one ends its matches. |
| Hosting | hPanel → Websites → Web Apps (Node.js 20, entry file `online.mjs`, no build command) |
| Client setting | `packages/client/.env.production` → `VITE_ONLINE_URL` (baked into the build). It still holds Skyfire's address until the Bladerift server is deployed. |
| Health | `GET /api/health` → `{ok, game: "bladerift", v, rooms, players, uptime}` |

## Local check

`npm run build:online -w @bladerift/server && node tools/servercheck.mjs` starts the built bundle on a free port,
creates a room, joins it over WebSocket and checks the Welcome and LobbyState replies (plus a refused protocol
version and an unknown code). It prints PASS or FAIL.

## Deploying the server

1. `node tools/pack-online.mjs` → `../bladerift-online.zip` (one bundled `online.mjs` plus a `package.json`).
   Pass `--out=<path>` to write the zip elsewhere.
2. hPanel → Websites → the Bladerift web app → upload the zip (first time: create the Node.js web app with entry
   file `online.mjs`, then set `VITE_ONLINE_URL` in `packages/client/.env.production` to its address and rebuild the client).
3. Check `GET <server>/api/health` reports `"game": "bladerift"` and the protocol version (`v`) you expect.

A redeploy restarts the server and **ends every live match** (players are told the server restarted), so do it when
nobody is playing (`/api/health` shows `players`). Deploy the server **before** a client release that changes the
protocol version: the client refuses a server on another version.

The server reads these environment variables: `PORT` (set by the host), `BLADERIFT_ORIGINS` (extra allowed page
origins, comma-separated).

## Limits

Per address (`X-Real-IP` behind the Hostinger proxy, else the socket address): 6 new matches a minute, 3 open matches,
24 open sockets, 60 lookups a minute and 40 WebSocket upgrades per 10 s. The server holds at most 40 rooms.
Rooms close after 90 s if nobody joins, 3 min after the last player leaves, and after 4 h in any case.
Lag compensation is 0.55 s for online rooms (LAN host: default).

## Measuring lag

`npx tsx tools/netprobe.ts --server=<url>` plays one headless player with the real client netcode and reports what
it felt: snapshot gaps, ping, corrections of its own player (rubber-banding) and how long others froze. To see how a
change behaves over a bad connection without deploying, run the server locally
(`npx tsx packages/server/src/online.ts --port=8080`) behind `npx tsx tools/latproxy.ts --listen=8090 --target=8080`
(160 ms each way, jitter and stalls; see its header) and probe `http://localhost:8090`. The server allows 3 open
matches per address, so restart it between batches of probes.

## Testing against another server

`?online=https://host` on the game URL overrides the server for that tab only; `?online=default`
returns to the built-in one. Allowed page origins: games.matsolutions.gy, localhost, plus `BLADERIFT_ORIGINS`.

## Moving to a nicer address

Attach a domain such as `online.matsolutions.gy` to the web app in hPanel, then update `VITE_ONLINE_URL` and
redeploy the client. Old builds keep using the temporary domain until players update, so keep it attached.
