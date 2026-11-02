Wiring is done in `App.ts`, `main.ts`, `styles.css` and `roster.css`. Typecheck and vitest are clean, and the three gate scripts I wrote drove every menu and flow in the dev server with no page errors. One integration is deliberately not wired (the Hud training line), and a few things are not exercised; both are listed at the end.

**Files (all mine):**
- `C:/Users/vascu/Projects/bladerift/packages/client/src/ui/App.ts`
- `C:/Users/vascu/Projects/bladerift/packages/client/src/main.ts`
- `C:/Users/vascu/Projects/bladerift/packages/client/src/styles.css`
- `C:/Users/vascu/Projects/bladerift/packages/client/src/ui/roster.css` (removed the old hero select `hs-*` rules and the `.vs-splash` rules; kept `.update-btn`, lobby and bot-seat rules)
- Gate scripts: `C:/Users/vascu/Projects/bladerift/.cache/gate/integ-app.mjs`, `integ-flow.mjs`, `integ-portrait.mjs`

**What is wired**
- **main.ts:** `import './ui/training.css'`; `applyPrefsToDocument()` runs before `new App()`.
- **Title:** two tiers. Big row: Arcade (primary), Survival, Training. Versus row: Play online (when available), Practice vs bot, Two players (plus Join Wi-Fi duel when LAN). Small row: Fighter, Move list, Records, How to play, Settings.
- **Hero select:** `mountHeroSelect` into `.hsel-host`. Callbacks save the profile being edited; `destroy()` runs on every screen change. The old `renderFighter` and `bindFighter` are removed.
- **Settings:** `mountSettings` into `.settings-host`. On change: `music.setVolume(volume*musicVol)`, `samples.setVolume(volume*sfxVol)`, `announcer.setVolume(volume*voiceVol)`, `refreshControls()`, `applyPrefsToDocument()`. Volumes apply at boot and on every unlock, because `Sfx.unlock` resets the sample volume to `sfxVol` alone.
- **Audio:** `music.unlock()` and `announcer.unlock()` run on the same capture-phase gesture as `sfx.unlock()`. Tracks: title, menus, how-to, settings, records, online, modes → `title`; fighter and lobby → `select`; results → `results`; match end → `victory`. I do not start stage tracks; GameScene owns those.
- **VS card:** `showVsSplash`, non-blocking, called from `startGameView`. Mode labels: `Arcade 3/7` (with ` · Boss` on stage 7), `Survival · Fight N`, `Practice`, `Two players`. Skipped in training. The old method is removed.
- **Arcade:** difficulty pick, then `ArcadeRun` and `renderLadder`. Each stage is a private practice room with the stage's arena, bot level and bot hero, started without the lobby. After a match: `recordResult`, then the ladder or `renderRunOver`. Quit goes to title; leaving mid-run ends the run.
- **Survival:** `SurvivalRun` and `renderSurvival`. The run's health fraction is converted to absolute points (fraction × hero class HP) into `carryHp` and `startHp`. Health left is read back from the room's `settings.startHp` after each match. Loss shows the run-over card.
- **Training:** `startFight` with `training: true`, `dummy-stand`, infinite gauge off by default. `mountTraining` is mounted once and re-attached across restarts, so its menu keeps its choices.
  - The local input is tapped in the `InputSource` wrapper, so `pushInput` runs once per sim tick.
  - `setHit` fires on the player's hits with `e.n > 0`.
  - `onDummy` swaps `room.bot.brain` live, with no restart.
  - `onInfiniteRift` sets both `room.settings` and the running `world.settings`.
  - `onReset` restarts the match. `onMoveList` opens the player's move list.
  - Training never records.
- **Hud events:** `setHidden(true)` on a K.O. round, `setHidden(false)` on the next `fight`. `announceResult('PERFECT')` after the K.O. when the player won the round without taking damage; `DRAW` on a drawn round.
- **Records:** `renderStats` on the `records` screen. `recordMatch` at every match end for the local seat (not spectators, not training). Mode is `arcade`, `survival`, `practice`, `local`, `online` or `lan`. Perfects and best combo are counted locally.
- **Move list:** button in the lobby header; button on the title; a "Move list" option in the in-match leave dialog (there is no pause menu; the HUD menu opens this dialog); the training menu's own button.
- **How to play:** `keyLabels('solo')` for the keyboard column, and the phone line flips when left-handed.

**Deliberately not wired**
- `Hud.setTrainingInfo`. It draws a training line under the clock that collides with `training.ts`'s own top-centre damage panel (visible in `flow-07-training-hits.png`). I left the overlay's panel as the only readout. One line to restore if the lead prefers the HUD version.

**Verification**
- `npx tsc -p packages/client --noEmit` is clean; `--noUnusedLocals` is clean for App.ts.
- `npx vitest run`: 19 files, 464 tests pass.
- `integ-app.mjs` (desktop, and `mobile` at 844x390): every menu step runs, no page errors.
- `integ-flow.mjs`: 22 checks pass, no page errors. It ends matches with `world.forfeit`, so it covers arcade win, loss, continue and quit; survival carry and run over; practice results; records counting matches; training dummy change, infinite gauge, input column, hit counts, reset keeping the menu, and the move list.
- Screenshots in `C:/Users/vascu/AppData/Local/Temp/claude/C--/3e5d6721-b735-4f36-b275-bbd396a973d7/scratchpad/integ/`: `app-d-01-title.png` and `app-m-01-title.png` (1280x720 and 844x390 titles), `app-d-02-hero-select.png`, `app-d-03-settings.png`, `app-d-05-records.png`, `app-d-06-movelist.png`, `app-d-07-lobby.png`, `app-d-08-lobby-movelist.png`, `app-d-09-arcade-pick.png`, `app-d-10-ladder.png`, `app-d-11-arcade-vs.png`, `app-d-13-training.png`, `app-d-14-training-menu.png`, `app-d-16-survival.png`, `flow-01-ladder-stage2.png`, `flow-04-survival-over.png`, `flow-05-practice-results.png`, `flow-07-training-hits.png`.
- Console errors: none in any run.

**Not exercised**
- Online and LAN flows (no server here). Only the shared match-end hook changed for them.
- K.O., PERFECT and DRAW paths (forfeit ends matches without a `round` event).
- Audio itself, and the lobby "Change gear" return path.

**Issues in other modules (not mine)**
- `heroSelect` at 1280x720: the right detail column clips the last line of the signature weapon note.
- `training.css`: the TRAINING tab overlaps the right fighter's name plate and portrait corner.
- The game is landscape-only (portrait shows "Turn your device"), so portrait layout is not a target.