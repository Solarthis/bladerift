# Bladerift: notes for Claude Code

A 1v1 browser fighting game. npm workspaces: `packages/shared` (deterministic sim, run by server, client prediction and
offline play), `packages/client` (Phaser 4 PWA), `packages/server` (LAN host and online rooms).

## Rules of the codebase

- The sim is deterministic and shared: anything in `packages/shared/src` must give the same result on server and
  client. Fighter state that changes gameplay belongs in `FighterState` and `STATE_KEYS` (fighter.ts).
- Any change to the wire format or to sim rules that a client predicts bumps `PROTOCOL_VERSION` (constants.ts), and the
  online server must be redeployed with the client.
- Heroes (heroes.ts): a fixed kit per hero (weapon in slots 0/1, stance weapon in slots 2/3 via `weaponAt`), special
  (skill N = hero N), dodge, Rift Art. Use `weaponAt(load, slot)`, never `load.weapons[slot]`.
- Hero art is sprite atlases built from generated sheets: `art/characters/<id>/character.json` -> `tools/sprites/gen.mjs`
  (Codex image generation) -> `python tools/sprites/process.py <id>`. Animations are listed in `art/animations.json`;
  the client picks frames in `packages/client/src/render/spriteAnim.ts`.
- Designs stay original: legendary or historical names and archetypes, no copied franchise designs or ability names.
- Asset licences: CC0, CC BY, MIT and OFL only, credited in `docs/LICENSES.md`.

## Before calling a change done

```bash
npx vitest run
npx tsc -p packages/shared --noEmit && npx tsc -p packages/client --noEmit && npx tsc -p packages/server --noEmit
npx tsx tools/parrysim.ts       # 0 failing
npx tsx tools/presssim.ts       # 0 lost presses
npx tsx tools/fuzzsim.ts        # nothing found
npx tsx tools/duelsim.ts        # every hero 40-60 % round wins
node tools/touchcheck.mjs --url=<dev server>   # touch tiles and joystick
node tools/viewportcheck.mjs --url=<dev server> # layout gate
```

The `impartial-critic` skill (`.claude/skills/`) briefs an independent reviewer for a finished round of work.

## Deploy

`bash deploy/deploy-hostinger.sh` (static client; backs up first; `--rollback` restores). It needs the maintainer's SSH
alias and is not runnable from a fork. Never commit keys, tokens or `.env` files with secrets: the only env value in
the repo is the public online-server URL.
