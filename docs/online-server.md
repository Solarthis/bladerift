# Online play server

Online matches (title screen → **Play online**) run on a separate Node server, `packages/server/src/online.ts`.
The game itself stays at https://games.matsolutions.gy; the client talks to the server cross-origin
(`POST /api/rooms`, `GET /api/rooms/:code`, WebSocket `/ws?room=CODE`).

| | |
|---|---|
| Server URL | https://purple-armadillo-718213.hostingersite.com (Hostinger temporary domain, no DNS record of ours) |
| Hosting | hPanel → Websites → Web Apps (Node.js 20, entry file `online.mjs`, no build command) |
| Client setting | `packages/client/.env.production` → `VITE_ONLINE_URL` (baked into the build) |
| Health | `GET /api/health` → `{ok, game, v, rooms, players}` |

## Updating the server

1. `node tools/pack-online.mjs` → `../skyfire-online.zip` (one bundled `online.mjs` plus a `package.json`).
2. hPanel → Websites → the `purple-armadillo-718213.hostingersite.com` web app → redeploy with the new zip.
3. Check `/api/health` reports the new protocol version (`v`), then
   `node tools/onlinecheck.mjs --game=https://games.matsolutions.gy/ --online=default`.

A redeploy restarts the server and **ends every live match** (players are told the server restarted), so do it when
nobody is playing (`/api/health` shows `players`). Deploy the server **before** a client release that changes the
protocol version: the client refuses a server on another version.

## Measuring lag

`npx tsx tools/netprobe.ts --server=<url>` plays one headless player with the real client netcode and reports what
it felt: snapshot gaps, ping, corrections of its own player (rubber-banding) and how long others froze. To see how a
change behaves over a bad connection without deploying, run the server locally
(`npx tsx packages/server/src/online.ts --port=8080`) behind `npx tsx tools/latproxy.ts --listen=8090 --target=8080`
(160 ms each way, jitter and stalls; see its header) and probe `http://localhost:8090`. The server allows 3 open
matches per address, so restart it between batches of probes.

## Testing against another server

`?online=https://host` on the game URL overrides the server for that tab only; `?online=default`
returns to the built-in one. Allowed page origins: games.matsolutions.gy, localhost, plus `SKYFIRE_ORIGINS`
(comma-separated env var on the server).

## Moving to a nicer address

Attach a domain such as `online.matsolutions.gy` to the web app in hPanel, then update `VITE_ONLINE_URL` and
redeploy the client. Old builds keep using the temporary domain until players update, so keep it attached.
