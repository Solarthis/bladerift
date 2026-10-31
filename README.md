# Bladerift

One-on-one medieval duels in your browser. Bladerift is a 2D sword-fighting game built as an installable PWA (Phaser 4 + TypeScript), so it runs on phones, tablets and desktops without an app store.

## Modes

- **Online, by room code:** choose **Play online**, create a duel and share its code, or join one by entering a friend's code. Matches run on a small Node server (`packages/server/src/online.ts`) over WebSocket.
- **Two players, one device:** two fighters play on the same device at once, each with their own key set (see Controls) or a gamepad.
- **Practice vs bot:** fight a bot at easy, normal or hard difficulty. Works offline, with no server.
- **LAN host:** one machine on your Wi-Fi runs the server, and other devices join by scanning a QR code or typing the address shown in the terminal.

## Controls

Attack buttons are Weapon A and Weapon B (two weapons per fighter).

| Action | Solo (one keyboard) | Player 1 | Player 2 |
|---|---|---|---|
| Move | A / D or ← / → | A / D | ← / → |
| Down | S or ↓ | S | ↓ |
| Jump | W, ↑ or Space | W | ↑ |
| Weapon A | J or Z | F | , or Num 1 |
| Weapon B | K or X | G | . or Num 2 |
| Skill | L or C | H | / or Num 3 |
| Roll | Shift or I | Left Shift | Right Shift or Num 0 |
| Heal | H or Q | R | ' or Num + |

**Touch:** a floating joystick on the left, and a thumb cluster of six buttons on the right (two weapons, skill, jump, roll, heal).
**Gamepads** are supported as well.

## Running it

Requirements: Node.js 20 or newer.

```bash
npm install          # install all workspaces
npm run dev          # Vite dev server for the client, http://localhost:5173
npx vitest run       # run the test suite
npm run typecheck    # type-check shared, server and client
```

To host a LAN match on a PC, build the client first and then start the server:

```bash
npm run build        # client (packages/client/dist) and server bundle
npm run server       # LAN host on port 7350, with a QR code for players to scan
```

Other scripts:

- `npm run art`: regenerate the sprite atlases from the SVG art sources.
- `node tools/build-icons.mjs`: rasterize `packages/client/art-src/icon.svg` into the PWA and home-screen icons in `packages/client/public/icons`.
- `npm run build:online` (in `packages/server`): bundle the online room server.

## Project layout

```
packages/
  shared/    Deterministic duel core: fighters, weapons, input, room rules, bot,
             arena and the wire protocol. Runs identically on the server, in the
             client for prediction, and in the browser for practice mode.
             Tests live in packages/shared/test.
  client/    Vite + Phaser 4 PWA: src/ (game, input, net, render, ui, audio),
             src/vendor/pixelfx (vendored effects), art-src/icon.svg (app icon
             source), public/icons (generated icons), public/licenses (third-party notices).
  server/    src/main.ts: the LAN host (static client files, WebSocket, QR code).
             src/online.ts: the online server (room codes, WebSocket matches).
tools/       Build helpers (build-art.mjs, build-icons.mjs) and checks.
```

## Credits

- Pixel art effects and animated fighter rig: PixelFX by Patch and Hugo Duprez (MIT), vendored in `packages/client/src/vendor/pixelfx`.
- Weapon, item and arena art generated with Codex image generation for this project.
- Phaser (MIT), qrcode (MIT), and the Lilita One and Nunito fonts (SIL Open Font License 1.1).

Third-party licenses are listed in `packages/client/public/licenses/LICENSES.txt`.
