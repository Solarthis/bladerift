# Bladerift overhaul: shared brief for every sub-agent

The owner wants Bladerift (a 1v1 side-view pixel fighting PWA: Phaser 4 client, deterministic 60 Hz shared sim, Node
server) to reach the standard of the MUGEN/IKEMEN tournament videos and the castle-hall reference clip they gave us.
Read `docs/feel/mugen-reference.md` for the measured reference (timings, staging, HUD, K.O., camera).

## The gaps this overhaul closes
1. No music, no announcer, synthesized-only sound effects.
2. Weak K.O. and round flow: the loser stays standing, no slow-mo finish, no winner pose or round-win banner, a cheesy
   "POW!" word.
3. Fighters too small, especially on phones (reference: a standing fighter is 16-20% of screen height).
4. Thin intro: no full-screen VS splash, no walk-in / intro poses.
5. Shallow move sets: no throws, no meter levels / EX moves, no move list, no training mode.
6. Hero select reads like a settings form (reference: big portraits both sides, face grid, animated preview).
7. Few modes: add an arcade ladder, survival, training, win stats.
8. Static stages: add animated stage elements per arena.
9. Bare settings: volumes per channel, graphics quality, keyboard remap, touch layout.

## Rules (all agents)
- Repo: `C:\Users\vascu\Projects\bladerift`. Edit ONLY the files your task says you own. Read anything.
- Never commit, push, deploy, or touch hosting. Never run `git checkout`/`git stash`/`git reset`.
- Other agents edit other files at the same time: when you run `npx tsc -p packages/client --noEmit` (or shared /
  server), only fix errors in YOUR files; ignore errors elsewhere.
- Do not start or stop dev servers. A Vite dev server is already running at http://localhost:5192/.
- Match the surrounding code style: TypeScript, 2-space indent, single quotes, comment density like the file you edit,
  JSDoc on exports. The sim (`packages/shared`) must stay deterministic (no Math.random, no Date, integer ticks).
- Assets: only CC0, CC-BY 3.0/4.0, MIT or OFL. No NC, no ND, no SA, no "royalty-free" without a clear licence, no
  ripped game audio. Record every asset's source URL, author and licence.
- Downloads go to `.cache/assets/<category>/` first (never straight into `public/`). Use a browser User-Agent with
  curl (some sites 403 the default one): `curl -L -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"`.
- Your final message is read by the lead engineer, not the owner: report exactly what you changed (files, exports),
  what you verified, and what is unfinished. Be factual; no praise.

## Contracts between modules (build exactly these names)
Audio (client):
- `public/assets/audio/manifest.json` (written by `tools/audio/build.mjs`):
  `{ "music": { [id]: { "file": "music/<id>.mp3", "gain": number, "loop": boolean } },
     "voice": { [id]: { "file": "voice/<id>.mp3", "gain": number } },
     "sfx":   { [id]: [ { "file": "sfx/<id>-<n>.mp3", "gain": number } ] } }`
  Music ids: `title`, `select`, `victory`, `results`, `stage-hall`, `stage-bridge`, `stage-embers`, `stage-crypt`,
  `stage-grove`. Voice ids: `round1`, `round2`, `round3`, `finalRound`, `fight`, `ready`, `ko`, `perfect`, `timeOver`,
  `youWin`, `youLose`, `draw`, `gameOver`, `newChallenger`, `continue`, `winner` (any that the voice pack lacks are
  simply absent). Sfx ids: `hitLight`, `hitHeavy`, `hitCrit`, `slash`, `whoosh`, `whooshHeavy`, `block`, `parry`,
  `throw`, `koThud`, `bodyFall`, `land`, `step`, `uiMove`, `uiSelect`, `uiBack`, `uiStart`, `fire`, `wind`.
- `packages/client/src/audio/Music.ts`: `export const music` with `play(id, opts?: { fade?: number })`,
  `stop(fade?)`, `duck(amount: number, ms: number)`, `setVolume(v)`, `unlock()`.
- `packages/client/src/audio/Announcer.ts`: `export const announcer` with `say(id, opts?: { delay?: number })`,
  `setVolume(v)`, `unlock()`.
- `packages/client/src/audio/Samples.ts`: `export const samples` with `play(id, opts?: { gain?: number; rate?: number;
  pan?: number })`, `has(id)`, `setVolume(v)`, `unlock()`. All three load the manifest lazily and share one
  AudioContext exported from Samples.ts as `getAudioContext()`.
- Volumes come from `ui/prefs.ts` keys `musicVol`, `sfxVol`, `voiceVol` (0..1; defaults 0.6 / 0.8 / 0.9).

Presentation (client): see each task for its module's exported API.
