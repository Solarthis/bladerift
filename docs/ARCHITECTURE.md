# Skyfire Squad — Architecture

## Packages

| Package | Role |
|---|---|
| `packages/shared` | Pure TypeScript game core. No DOM and no Node APIs. It contains the deterministic fixed-step movement (`movement.ts`), the authoritative world simulation (`world.ts`: weapons, hitscan with lag compensation, rockets/grenades, pickups, spawns, scoring), the binary protocol (`protocol.ts`), the match/lobby room (`room.ts`), the bot AI (`bot.ts`) and the maps. |
| `packages/server` | Node LAN host. It serves the built client over HTTP(S), exposes `/api/info` and `/api/stats`, and accepts WebSockets on `/ws`, which it attaches to a shared `Room`. |
| `packages/client` | Vite + Phaser 4 PWA. Networking (`net/`), input (`input/`), rendering (`render/`), the scene (`game/GameScene.ts`), the DOM HUD and menus (`ui/`) and procedural audio (`audio/`). |

The **same `Room` class** runs on the LAN server and inside the browser for offline practice (`LocalTransport`), so practice mode exercises the real network code path end to end.

## Simulation and netcode

- **60 Hz fixed tick** on server and client (`TICK_RATE`). Movement is a pure function of `(state, input, map)`, so the client predicts it exactly.
- **Inputs:** the client sends one `InputCmd` per tick, batched two per packet (about 30 packets/s, 12 bytes per command). The server queues inputs per player and consumes one per tick. When the queue is empty it repeats the last held intent for up to 20 ticks, then goes neutral, so a stalled or disconnected client stops moving and firing. When the queue exceeds 8 commands, stale ones are dropped, but their edge-triggered buttons (reload, swap, grenade, pick up, drop) are merged forward so a press is never lost.
- **Snapshots** are nominally 30 Hz. At most one is sent per server loop wakeup, because Windows timers have about 15.6 ms granularity. The shared body is encoded once per snapshot: player states, projectiles, a pickup bitmask, dropped weapons and an event list. Each recipient gets a small header with its own precise state and last processed input sequence number.
- **Reconciliation:** the client resets its predicted state to the authoritative self-state, then replays unacknowledged inputs. Any visual error is smoothed out exponentially (snapping instead above 140 units). This covers server-only changes such as knockback and explosions.
- **Interpolation:** remote players are drawn about 100 ms (6 ticks) behind the estimated server clock, between bracketing snapshots, with at most 100 ms of extrapolation.
- **Lag compensation:** each input carries the server tick the client was viewing. The server learns each client's render delay from its whole input stream. The estimate starts at the nominal 8 ticks, rises at most about 3 ticks per second, and falls quickly. A shot may only rewind to within that learned delay (+3 ticks, capped at 300 ms), never to an arbitrary claimed tick. Rewinds use a 64-tick position history and never hit a life that had not started yet. Hits are always decided on the server. Clients only draw predicted cosmetic tracers.
- **Authority:** the server owns movement validation, collisions, fuel, weapons, ammo, projectiles, hits, damage, health, respawns, pickups and scoring. Clients send intent only, as bitmask buttons, quantized axes and an aim angle.

## Measured so far (local host, synthetic clients; see `tools/loadtest.ts`)

20 WebSocket clients in continuous combat on the Legion Go:
- server tick p50 0.09 ms, p99 1.46 ms (the budget is 16.7 ms)
- snapshot gap p50 32 ms, p95 47 ms
- about 16 KB/s download per client, about 310 KB/s total upload from the host
- server memory 71 MB

These clients ran on the same machine, so this is **not** a Wi‑Fi or phone measurement.

## Networking decision: LAN-first serving

**Problem.** A page served over HTTPS (`https://games.matsolutions.gy`) cannot open an insecure `ws://192.168.x.x` socket, because browsers block it as mixed content. Chrome's Local Network Access restrictions add a permission gate on top. A *secure* `wss://` connection to a LAN device needs a publicly trusted certificate for a hostname that resolves to the host's LAN IP. That requires DNS records under the owner's control, such as a `lan.games.matsolutions.gy` record kept updated with the host's current IP plus a DNS-01 certificate. That is a DNS change, which needs explicit authorization. Requiring players to install a private root certificate is ruled out.

**Chosen arrangement (works today, no DNS changes, every browser):**
1. **The Legion Go serves the game itself.** `start-host.cmd` runs `packages/server`, which serves the same built client at `http://<host-ip>:7350` together with the WebSocket on the same origin. An insecure page can open an insecure same-origin WebSocket, so this works in iOS Safari, iPadOS Safari and Android Chrome with no certificates. Players scan the QR code shown by the host console or terminal.
2. **`https://games.matsolutions.gy` is the installable PWA and front door:** branding, how-to and install instructions, offline **practice vs bots** (runs entirely on the device), and **Join LAN match**, which takes the host's address (an `https://` address is preserved for TLS hosts) and *navigates* to the LAN host's own page. The installed PWA does not open a socket to the LAN directly. Any page that can reach `/api/info` on its own origin recognises itself as a host client, on any scheme or port.
3. **Failure messaging:** the client explains a lost host ("Is it still running on this Wi‑Fi?"). The host console warns when no Wi‑Fi address is found. `tools/firewall-allow.ps1` documents the one Windows Firewall rule (private profile only) in case the OS prompt was dismissed.

**Upgrade path (needs owner authorization):** add a `lan.games.matsolutions.gy` A record that the launcher updates to the host's IP through the Hostinger DNS API, obtain a certificate through DNS-01, and run the host with `--certs`. The server already serves HTTPS/WSS when `certs/cert.pem` and `certs/key.pem` exist. The installed PWA could then connect directly with `wss://`. This still needs real-device verification of Local Network Access prompts and DNS-rebinding protection on consumer routers.

Known LAN risks to verify on real devices: router client isolation (guest networks), a Windows network profile set to Public, and host IP changes between sessions (the QR code always reflects the current IP).
