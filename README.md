# Bladerift

One-on-one 2D duels in your browser. Fourteen heroes from legend and history (Gilgamesh, Richard Lionheart, Cú Chulainn,
Jack the Ripper, Alexander and more), each with its own weapon, second-stance weapon, special, dodge and Rift Art,
drawn as hand-animated fighting-game sprites. Bladerift is an installable PWA (Phaser 4 + TypeScript): it runs on
phones, tablets and desktops without an app store.

**Play it:** https://games.matsolutions.gy/bladerift/

## Modes

- **Online by room code:** create a duel, share the code, or join a friend's. Matches run on a small Node server
  (`packages/server/src/online.ts`) over WebSocket, with client-side prediction and lag compensation.
- **Two players, one device:** each player has a key set (below) or a gamepad.
- **Practice, arcade ladder, survival and training** against bots (easy, normal, hard, and training dummies). All offline.
- **LAN host:** one machine on your Wi-Fi runs the server; other devices join by QR code.

## Fighting

- **Light** strings a combo; **Heavy** is the heavy strike (held: a charged move for some weapons; in the air, a plunge).
  ↓ + Light launches, → + Heavy up close throws.
- **Block:** hold to guard. Press it just before a hit lands for a **perfect block** that parries any attack.
- **Stance:** switch to the hero's second weapon and its own moveset (Gilgamesh draws the Kingsblade from a portal,
  Cú Chulainn throws barbed darts, Dumas fences with a rapier...).
- **Skill**, **Dodge** and the **Rift Art** (when the gauge is full; at half the gauge, the EX special).

| Action | Solo (one keyboard) | Player 1 | Player 2 |
|---|---|---|---|
| Move / down | A D S or arrows | A D S | ← → ↓ |
| Jump | W, ↑ or Space | W | ↑ |
| Light / Heavy | J / K (or Z / X) | F / G | , / . (Num 1 / 2) |
| Skill | L or C | H | / or Num 3 |
| Dodge | Shift or I | Left Shift | Right Shift or Num 0 |
| Heal | H or Q | R | ' or Num + |
| Block | O or F | Y | ; or Num 5 |
| Stance | R or B | E | L or Num 6 |
| Rift Art | U, V or E | T | \ , Num 4 or Enter |

Solo keys can be remapped in Settings. **Touch:** a floating joystick and a 3×3 cluster of square tiles (left-handed
layout in Settings). **Gamepads:** X / Y attacks, A jump, B dodge, RB skill, LB heal, LT block, RT Rift Art, right-stick
click stance.

## Running it

Node.js 20 or newer.

```bash
npm install          # all workspaces
npm run dev          # client dev server
npx vitest run       # test suite
npm run typecheck    # shared, server and client
npm run build        # client (packages/client/dist) and server bundles
npm run server       # LAN host on port 7350, with a QR code for players to scan
```

The online server needs `VITE_ONLINE_URL` at build time (`packages/client/.env.production`); without it the Play
online button stays hidden. See `docs/online-server.md`.

## Checks

| Tool | What it proves |
|---|---|
| `npx vitest run` | the rules: fighters, weapons, stances, parries, netcode, protocol |
| `npx tsx tools/duelsim.ts` | bot-vs-bot balance over every hero pairing and arena (target 40-60 % round wins) |
| `npx tsx tools/parrysim.ts` | every attack of every hero can be parried, and only when timed |
| `npx tsx tools/presssim.ts [--stance]` | no attack press is ever lost |
| `npx tsx tools/fuzzsim.ts` | bug hunt: stuck states, bounds, runaway projectiles |
| `node tools/touchcheck.mjs` | touch tiles and the joystick on a phone viewport (dev server) |
| `node tools/viewportcheck.mjs` | phone and desktop layouts, iPhone home-screen app (gates every deploy) |

## Project layout

```
packages/
  shared/   Deterministic duel core: fighters, heroes, weapons, bots, world, wire protocol (tests in test/)
  client/   Vite + Phaser 4 PWA: game, input, net, render (sprite atlases), ui, audio; vendored PixelFX
  server/   LAN host (main.ts) and online room server (online.ts)
art/        Sprite production: character bibles, generated sheets, the animation library
tools/      Sprite and icon pipelines (Codex image generation + slicing), audio build, sims and checks
deploy/     Static deploy script for the live site (needs the maintainer's SSH alias; no keys in the repo)
docs/       Design notes, deploy and online server guides, licensing
.claude/    Claude Code project files (dev-server launch config, the impartial-critic review skill)
```

## Licence

- **Code:** MIT (`LICENSE`).
- **Original art** (hero sprites, portraits, icons, arenas): CC BY 4.0 (`ASSETS-LICENSE.md`).
- **Third-party:** PixelFX (MIT), the recorded audio pack (CC0 and CC BY 4.0) and fonts (SIL OFL 1.1), credited in
  `docs/LICENSES.md` and in the game under Settings > About.

The heroes take legendary and historical names and archetypes only; their designs are original to this project.

Built with [Claude Code](https://claude.com/claude-code).
