#### client-anim.md
INTEGRATION

- No new imports or calls are required in `GameScene.ts`. The `SpriteFighterView` constructor and `draw()` signatures are unchanged.
- `GameScene.ts:977-983` already passes `introT` during the intro, and `world.ts:284` runs `resetRound` at construction, so round 1 of every match gets the intro.
- Optional, more robust: `introAt` starts only when the sprite exists, so a late atlas load can cut the entrance short. To use the sim's own clock instead, pass
  `introT: g.phase === 'intro' ? (ROUND.introTicks - g.phaseLeft) / 60 : undefined`
  with `ROUND` imported from `@bladerift/shared`. I did not confirm that `ROUND` is exported from the package index.
- Throws: the sim should set `Act.Attack` with `move = 18` (`MOVE_THROW`). No client call is needed. When the shared export lands, the local `const MOVE_THROW = 18` in `spriteAnim.ts` can become an import.
- Other modules may now import `STAND_WORLD` and `BODY_CENTRE` from `render/spriteAnim.ts`.

#### client-camera.md
INTEGRATION (for the lead, in GameScene.ts)

1. Import: `import { FightCamera } from './camera';`
2. Field: `private fightCam: FightCamera | null = null;`
3. Create it in `init()` right after `this.arenaW = arena.w;` and `this.floor = arena.floor;` (around lines 607-608): `this.fightCam = new FightCamera({ arenaW: this.arenaW, floor: this.floor });`
4. Wherever `camInit` is set back to false for a new match (grep `camInit`), also call `this.fightCam?.reset();`.
5. In `updateCamera(list, dt)`: keep `const pad = this.touchInsets(vw);`, then replace the block from `let minX = this.arenaW / 2;` through `this.camX = this.camFc + off;` (about lines 3087 to 3131) with:
   ```ts
   const frame = this.fightCam!.update({
     dt, viewW: vw, viewH: vh, padLeft: pad.left, padRight: pad.right,
     touch: pad.right > 0, fighters: alive.map((q) => ({ x: q.x, y: q.y })),
   });
   this.camZoom = frame.zoom;
   this.camX = frame.x;
   this.camY = frame.y;
   ```
   Delete the now-unused `camFc`, `zoomInWait`, `wantH`, `off` and `dz` code. Keep the shot blend (`let z = this.camZoom` onward), the wall clamp, the shake offset and `setZoom`/`centerOn` unchanged.
6. The existing touch floor clamp (`y = Math.min(y, this.floor + ...)`) does not bind with the new camera at typical touch sizes (its bound is about floor + 26 vs the camera's floor − 48). No change needed.
7. Units: `vw`/`vh` are `this.scale.width`/`height` (game pixels) and `pad.left`/`pad.right` from `touchInsets` are already in game pixels, so they match. The `zoomShot`/`zoomTo` punches multiply on top of `camZoom`, so they keep working.

#### client-controls.md
INTEGRATION

1. **App.ts, import:** add `refreshControls` and `keyLabels` to the existing import from `'../input/Controls'`.
2. **App.ts, Settings handler:** after each `setPref` for `keys`, `touchScale`, `touchOpacity` or `leftHanded`, call `refreshControls()` with no arguments. It is safe at any time.
3. **App.ts, `renderHowto()`:** replace `const k = KEY_LABEL;` with `const k = { ...KEY_LABEL, solo: keyLabels('solo' as KeyScheme) };`. The how-to paragraph "joystick on the left, buttons on the right" should also flip when `controlPrefs().leftHanded` is true.
4. **App.ts, match start (around line 810):** no change. `KeyboardSource` and `TouchSource` read the prefs when constructed.
5. **GameScene.ts, `touchInsets()`:** import `touchLeftHanded` from `'../input/Controls'`. Replace the two `this.insets.*` assignments (keep the existing `cluster` and `stick` rect reads and `k`) with:
```ts
const lefty = touchLeftHanded();
const clusterIn = cluster && cluster.width > 0 ? (lefty ? Math.max(0, cluster.right) : Math.max(0, css - cluster.left)) * k * 0.7 : 0;
const stickIn = stick && stick.width > 0 && clusterIn ? (lefty ? Math.max(0, css - stick.left) : Math.max(0, stick.right)) * k * 0.45 : 0;
this.insets.left = lefty ? clusterIn : stickIn;
this.insets.right = lefty ? stickIn : clusterIn;
```
6. **styles or hud.css (not my files):** add `.touch.lefty .touch-hint::after { right: auto; left: 22px; }`.

#### client-heroselect.md
INTEGRATION
- Import: `import { mountHeroSelect } from './heroSelect';` in `packages/client/src/ui/App.ts`. No `main.ts` change; the CSS comes in through the module.
- Host: in `render('fighter')`, replace `renderFighter()` with `<div class="screen screen-fighter" id="hsel-host"></div>`. Keep `.screen` so it gets the screen shell, or use any positioned element that fills the viewport. The module makes the root positioned if it is static.
- Field: `private heroSel?: { destroy(): void };`
- Mount: at the end of `bind()` when `this.screen === 'fighter'`:
  ```ts
  this.heroSel?.destroy();
  const p = this.profiles[this.editing];
  this.heroSel = mountHeroSelect(this.ui.querySelector<HTMLElement>('#hsel-host')!, {
    hero: p.load.hero, color: p.color, name: p.name,
    onHero: (id) => { p.load = sanitizeLoadout({ ...p.load, hero: id }); sfx.play('uiSelect'); saveProfile(this.editing, p); },
    onColor: (i) => { p.color = i; sfx.play('uiClick'); saveProfile(this.editing, p); },
    onName: (s) => { p.name = s; saveProfile(this.editing, p); },
    onDone: () => { this.heroSel?.destroy(); this.heroSel = undefined; this.act('back', this.ui.querySelector<HTMLElement>('[data-act="back"]')!); },
    onCursor: () => sfx.play('uiMove'),
  });
  ```
  Use the real `sfx` names from `audio/Sfx.ts` if they differ.
- Teardown: call `this.heroSel?.destroy(); this.heroSel = undefined;` at the top of `show()`, before the re-render, and on any screen change. Otherwise the key and gamepad listeners stay live.
- The module keeps its own state, so re-mounting on every change is not needed. The `profiles` objects are updated in the callbacks.
- `renderFighter`, `bindFighter` and the `hs-*` rules in `roster.css` can be removed once this is wired in. The module does not depend on them.

#### client-hud.md
INTEGRATION

No new imports. `Hud` is constructed exactly as before.

1. Training readout, in `App.ts` next to `this.hud.update(...)` (about line 830), or wherever training state is known:
   `this.hud?.setTrainingInfo(training ? { damage: totalDamage, combo: liveCombo, maxCombo: bestCombo } : null);`
   The Hud does not compute these values itself. The caller must supply them. The Hud's internal `combo` counter is private.
2. Supers: `this.hud?.setHidden(true)` when a super or Art starts and `this.hud?.setHidden(false)` when it ends. `cinematic.ts` already adds `.cinematic` to `.hud`, which hides the panels. Call `setHidden` only if the super path is not covered by that.
3. K.O. slow-mo: in the `scene.onEvent` wrapper (`App.ts:823`), on a `round` event call `this.hud?.setHidden(true)`. Call `this.hud?.setHidden(false)` on the next `fight` or `intro`. The K.O. banner stays visible during the hide.
4. Result words: `this.hud?.announceResult('PERFECT', '#ffd84a')`, `this.hud?.announceResult('TIME OVER', '#ff9a2a')`, `this.hud?.announceResult('DRAW')`. The text is passed as given, so uppercase it yourself if needed.

Files changed (all absolute):
- C:/Users/vascu/Projects/bladerift/packages/client/src/ui/Hud.ts
- C:/Users/vascu/Projects/bladerift/packages/client/src/ui/hud.css
- C:/Users/vascu/Projects/bladerift/packages/client/src/ui/hudbars.css

#### client-ko.md
INTEGRATION (for the lead; GameScene.ts is not edited)
1. Imports, after the `./cinematic` import at GameScene.ts:18:
   `import { playKoSequence, playRoundWinner, destroyKoSequence, type KoHandle } from './koSequence';`
2. `case 'ko'` (GameScene.ts:2070-2090): keep `this.slowT = 0`, `sfx`, `shake`, and sparks. Replace the `koCinematic` call and the `this.flash(...)` fallback with:
   `this.koHandle = playKoSequence(this, { x: v?.x ?? 0, y: (v?.y ?? 0) - 30, perfect: false, timeOver: false, draw: false, artFinish: <true only if the attacker was mid-Art, then koCinematic does its white-out>, winnerName: '', winnerColor: 0xffffff, onSlowmo: () => { this.slowT = 0; } });`
   Set `perfect`, `timeOver`, `draw`, `winnerName`, `winnerColor` from the attacker's view (`find(e.a)`) and the `'round'` event, as in the note above. Keep the call in `'ko'` if the `'round'` case cannot be used.
3. Round result: after the K.O. handle resolves, play the banner: `this.koHandle.done.then(() => playRoundWinner(this, { name: w.name, color: w.accent, finalWin: false }))`. For the match, call `playRoundWinner(this, { ..., finalWin: true })` from `case 'match'` (GameScene.ts:2097).
4. Cleanup: optionally `destroyKoSequence(this)` in the scene's shutdown path. Sequences already self-destroy on SHUTDOWN.
5. Optional: to honour `(scale, ms)`, add `slowScale`/`slowLen` fields and use them in `stepSlowmo` (GameScene.ts:1690-1702).

#### client-modes.md
INTEGRATION

Imports in `packages/client/src/ui/App.ts`:
```ts
import { ArcadeRun, SurvivalRun, renderLadder, renderRunOver, renderSurvival, arcadeSummary, survivalSummary } from './modes';
```
`modes.ts` imports `./modes.css` itself, so `main.ts` needs no change.

Exports and arguments:
- `new ArcadeRun(playerHero: number, difficulty: 'easy'|'normal'|'hard', seed: number)`. Methods: `current(): { stage, total, heroId, botLevel, arenaId, boss }`, `recordResult(win: boolean)`, `done()`, `cleared()`, `canContinue()`, `continueRun()`, `failed()`, `quit()`, getter `continues` (starts at 3), `ladder: Opponent[]`.
- `new SurvivalRun(playerHero: number, seed: number)`. Methods: `current(): { heroId, botLevel, arenaId, boss: false, fight, wins, startHp }`, `recordResult(win: boolean, hpLeft?: number)` (hpLeft is a 0..1 fraction, default 0), `done()`, `quit()`. Fields: `wins`, `startHp`.
- `renderLadder(root: HTMLElement, run: ArcadeRun, onFight: (stage: ArcadeStage) => void, onQuit: () => void)`. Quit calls `run.quit()` before `onQuit`. The fight button calls `run.continueRun()` when the run is lost with continues left, then `onFight(run.current())`.
- `renderSurvival(root, run: SurvivalRun, onFight: (fight: SurvivalFight) => void, onQuit)`. Shows streak, health going in, and the next opponent. Quit calls `run.quit()`.
- `renderRunOver(root, { title: string; stats: string[]; retryLabel?: string; note?: string; tone?: 'win'|'lose' }, onRetry: () => void, onMenu: () => void)`.
- `arcadeSummary(run): string[]` and `survivalSummary(run): string[]` for the `stats` lines.

Where:
- Title screen (`App.ts` ~l.220, next to the `practice` button): add two buttons, for example `data-act="arcade"` and `data-act="survival"`, and handle them in `act` (~l.575).
- Hero for the run: the player's profile hero (`profiles[0]`'s loadout `hero`).
- Each screen goes into `#ui`, through a new `Screen` value (for example `'modes'` in the `Screen` type and `show()`), or by passing `this.ui`.

Flow:
1. Arcade start: `const run = new ArcadeRun(hero, diff, (Math.random() * 1e9) | 0)`, then `renderLadder(ui, run, fight, quit)`.
2. `fight(stage)`: start a match the way `startLocal('practice')` does (l.608). Set the arena from `stage.arenaId`, set `room.botOn = true`, `room.botLevel = stage.botLevel`, and force the bot hero to `stage.heroId` (needs the `botHero` change in `room.ts`).
3. On match end (`App.wire` l.772-780, `MatchEndMsg`), let `win` be "player's seat won the match". Arcade: `run.recordResult(win)`. Then if `run.done()` render `renderRunOver(ui, { title: run.cleared() ? 'Ladder cleared' : 'Defeated', stats: arcadeSummary(run), tone: run.cleared() ? 'win' : 'lose', retryLabel: 'New run' }, newRun, menu)`. Otherwise call `renderLadder` again. If `run.canContinue()` (not done), use `retryLabel: \`Continue (${run.continues} left)\``.
4. Survival: `run.recordResult(win, playerHpFraction)`, with the player's health fraction at the end of the fight read from the world. Then if `run.done()` show `renderRunOver` with `survivalSummary(run)`, else `renderSurvival(ui, run, fight, quit)`. Set the next fight's `startHp` into the match settings (needs the shared change above).
5. Quit paths: the `onQuit` callback should go back to the title screen (`show('title')`).

Notes:
- `renderLadder` and `renderSurvival` replace `root.innerHTML` with a `.screen.modes-screen` element. Pass the same `#ui`-style root each time.
- The screens use the existing `.screen`, `button.big`, and `--gold`, `--panel`, `--line` tokens from `styles.css`. Hero portraits are `assets/art/h-NN.jpg` (same as the hero select).

#### client-movelist-ui.md
INTEGRATION**
- CSS: `moveList.ts` imports `./moveList.css` itself, so `main.ts` needs no change.
- Import (from `ui/App.ts` or the lead's module): `import { showMoveList } from './moveList';`
- Call, e.g. from a "Move list" button on hero select, the practice lobby, or a pause menu:
  `showMoveList(document.getElementById('ui')!, loadout.hero, () => { /* restore the screen or pause menu you came from */ });`
- `heroId` is the hero index 0..13 (`Loadout.hero`, the `HEROES` index). `root` should be `#ui`, not a `.screen`, so the panel survives screen changes. The overlay is `position: fixed`, `z-index: 60`.
- Do not call it when `body[data-screen='game']` would hide the panel. It is not a `.screen`, so it stays visible; just avoid calling it mid-round unless the game should pause.

**Unfinished or needs confirmation**
- The hero JSON files do not exist yet. Real data has not been rendered; the parser handles the schema in `movelists/README.md`.
- General controls, checked against `packages/shared/src/constants.ts` where possible: the launcher, air combo, EX (half gauge) and Rift Art (full gauge) texts follow the README; guard (hold down, crouch guard, chip) and parry (10-tick window, stun) and dodge (roll invuln) match the constants.
- Unverified: there is no throw code in `packages/shared` yet. The throw input `→+HEAVY (close)` comes from the README, but the throw-break input (also `→+HEAVY (close)`) and its wording are my assumption, not in any spec. Confirm both when the throw system lands; they are the `GENERAL_CONTROLS` entries "Throw break" and "Throw".

#### client-music-announcer.md
INTEGRATION

Imports:
```ts
import { music } from './audio/Music';
import { announcer } from './audio/Announcer';
```

Calls:
- **App.ts, next to `sfx.unlock()` on capture-phase pointerdown and keydown:** `music.unlock(); announcer.unlock();`
- **App.ts, volume init and on pref change (where `k === 'volume'` is handled):** `music.setVolume(p.musicVol); announcer.setVolume(p.voiceVol);`. Works only after `Prefs` gains `musicVol` (default 0.6) and `voiceVol` (default 0.9).
- **Title / menus:** `music.play('title')` on boot. `music.play('select')` on the hero select screen. `music.play('results')` and `music.play('victory')` on the end screens.
- **GameScene.ts match start, per arena:** `music.play('stage-hall' | 'stage-bridge' | 'stage-embers' | 'stage-crypt' | 'stage-grove')`.
- **Leaving a match:** `music.stop(0.6); announcer.stop();`
- **Round flow:** `announcer.say('round1')`, then `announcer.say('fight', { delay: 0.2 })`. Use `round2`, `round3`, `finalRound`, `ready`, `ko`, `perfect`, `timeOver`, `youWin`, `youLose`, `draw`, `winner`, `gameOver`, `newChallenger`, `continue` as the flow needs.
- **Big moments (optional):** `music.duck(0.35, 900)` on K.O. or a super. Announcer lines do not duck music automatically.

#### client-samples-sfx.md
INTEGRATION
1. `packages/client/src/ui/App.ts`: no change needed for unlock. `sfx.unlock()` already runs on pointerdown and keydown, and now also starts the shared context and the sample pack.
2. `packages/client/src/ui/App.ts` (settings input handler, near line 487): add `import { syncSampleVolume } from '../audio/Sfx';` and after `setPref(k, v as never);` add `if (k === 'sfxVol') syncSampleVolume();`. Widen the `k` union to include `'sfxVol'`. Requires `sfxVol` in `Prefs` (controls-prefs owner).
3. `packages/client/src/game/GameScene.ts` (optional, landing): where a fighter lands on the ground, call `sfx.play('land', { x: v.x, y: v.y })`.
4. `packages/client/src/game/GameScene.ts` (optional, footsteps): `import { samples } from '../audio/Samples';` then `samples.play('step', { pan: 0 })` or with a pan from the fighter position.
5. `packages/client/src/audio/Music.ts` and `Announcer.ts` already import `getAudioContext` from `./Samples`. Nothing further needed.

#### client-settings-ui.md
INTEGRATION

1. Boot, once before the first touch screen (main.ts or App constructor):
   `import { applyPrefsToDocument } from './ui/prefs';` then `applyPrefsToDocument();`

2. Settings screen (App.ts). Replace the `case 'settings'` body at l.242-250 with a host element, and delete the `if (this.screen === 'settings')` block at l.481-490:
   `case 'settings': return '<div class="screen settings-host"></div>';`
   In `bind()`, mount into it and keep the handle (destroy the previous one first):
   ```ts
   import { mountSettings } from './settingsScreen';
   import { applyPrefsToDocument, prefs } from './prefs';   // prefs already imported
   import { CURRENT_RELEASE } from '../update';             // already imported
   // in bind(), when this.screen === 'settings':
   const host = root.querySelector<HTMLElement>('.settings-host')!;
   this.settingsUi?.destroy();
   this.settingsUi = mountSettings(host, {
     version: CURRENT_RELEASE,
     onChange: (p) => {
       sfx.volume = p.volume;                 // existing line; keep if sfx still reads it
       // music.setVolume(p.volume * p.musicVol); samples.setVolume(p.volume * p.sfxVol); announcer.setVolume(p.volume * p.voiceVol);
       // pacer.full = p.highRefresh;  governor.reset();   // if the game owns the pacer
     },
     onBack: () => this.show('title'),        // check what act('back') targets today
     onUpdate: () => this.act('update', host.querySelector('.update-btn') as HTMLElement),
   });
   ```
   Add `private settingsUi: { destroy(): void } | null = null;` to App, and call `this.settingsUi?.destroy(); this.settingsUi = null;` in `show()` before leaving the settings screen.
   Use `.settings-host` as the host because `.screen` gives an absolutely positioned full-size box. The `Screen` type already includes 'settings'.

3. Audio. Music, Samples and Announcer need these effective levels, derived from the prefs above (`musicVol`, `sfxVol`, `voiceVol` times `volume`), applied at boot and in `onChange`.

4. Quality. In game/pacing.ts usage, pass the governor's step-down to the pref hook:
   `new ResolutionGovernor((s) => { reportRenderScale(s); /* existing apply */ })`
   and import `reportRenderScale` from `./ui/prefs`. When `prefs().quality === 'low'`, start the governor at its middle step (`level = 2`, scale 1.5). Optionally reduce background and particle work when `document.documentElement.dataset.quality === 'low'`.

5. Touch layout (hud.css, owned by another module). Use the CSS variables the screen already sets on the root:
   - `.touch` buttons: `--tb: calc(clamp(56px, calc(var(--u) * 16.5), 74px) * var(--touch-scale, 1));` and `opacity: var(--touch-opacity, 0.85)` on `.tbuttons` and `.stick-zone` visuals.
   - Left-handed: `html[data-left-handed='true'] .stick-zone { left: auto; right: 0; }` and move `.tbuttons` to the left edge. GameScene reads both rects live, so it follows.

6. Keyboard remap (Controls.ts). `import { withKeyOverrides, KeyAction } from '../ui/prefs';`
   - In `KeyboardSource.read()`, when `scheme === 'solo'`, use `const m = withKeyOverrides(KEYMAPS.solo)` instead of `KEYMAPS[this.scheme]`.
   - `GAME_KEYS` is built once at module load, so an overridden code (e.g. KeyI) is not in it. Make the keydown suppression check also accept codes from `withKeyOverrides(KEYMAPS.solo)`, or rebuild the set when the prefs change.
   - Optional: `KEY_LABEL.solo` for the how-to screen can use `codeLabel` exported from `./ui/settingsScreen`.

7. Nothing else needs importing. settingsScreen.ts imports its own CSS, and it uses the global `.update-btn.inline` class from roster.css.

#### client-stats.md
INTEGRATION (for the lead, for `App.ts`, `GameScene.ts` or wherever matches end):
- Imports: `import { recordMatch, renderStats } from './stats';` in `ui/App.ts`. `modes.ts` already imports `recordArcade` and `recordSurvival` from `./stats`, so that import now resolves.
- Match end (where `App.wire` stores `lastEnd`, around l.772-780, or in the `MatchEnd` handler): call once per finished duel for the local player, e.g. `recordMatch({ hero: myLoad.hero, foeHero: foeLoad.hero, won, roundsWon, roundsLost, perfects, bestCombo, seconds, mode })`. `mode` is `'online' | 'lan' | 'practice' | 'local'`. Use the local player's seat; in `local` mode record only the primary player. Verify the field names against `MatchEndMsg.rows`.
- Records screen: add a screen (for example `'stats'` in the `Screen` union and `render` switch) that calls `renderStats(this.ui, () => this.show('title'))`, or whatever the back target is. Add a button to reach it from the title or settings screen.
- No other calls are needed. Arcade and survival recording is already called from `modes.ts`.

#### client-training.md
INTEGRATION

1. Import the stylesheet in `packages/client/src/main.ts`, next to the other UI CSS imports (after `./ui/hudbars.css`):
   `import './ui/training.css';`
   Do not import the CSS from `training.ts`. The project loads all UI CSS from `main.ts`.

2. Import in `App.ts` (or wherever the practice match is set up):
   `import { mountTraining, type Training, type DummyMode } from './ui/training';`

3. Mount it when the practice match starts with `settings.training === true`, after the HUD is created, with the `#ui` element as the root:
   ```ts
   const training: Training = mountTraining(uiRoot, {
     onDummy: (mode: DummyMode) => { /* set the dummy behaviour in the sim/practice settings */ },
     onInfiniteRift: (on: boolean) => { /* set infinite Rift gauge for the player */ },
     onReset: () => { /* reset both fighters to their start positions */ },
     onMoveList: () => { /* open the move list (ui/movelists) */ },
   });
   ```
   `uiRoot` is the `#ui` element, the same parent the HUD mounts into.

4. Every sim tick (or every rendered frame if the sim is not stepped at 60 Hz), push the local player's input. Use the same `buttons`, `moveX`, `moveY` that go into `InputCmd`:
   `training.pushInput(cmd.buttons, cmd.moveX, cmd.moveY);`
   The frame counts assume one call per 60 Hz tick. If you call it per rendered frame at a different rate, the counts will be off.

5. On each landed hit by the local player on the dummy, call:
   `training.setHit({ damage, combo })`
   `damage` is that hit's damage. `combo` is the running hit count of the current combo, starting at 1 on the first hit. Pass the sim's combo count if it has one (`Hud.ts` reads `e.n`). If the count does not rise by one per hit, the combo damage will reset on every hit.

6. On leaving the match, call `training.destroy()`.

7. The HUD's `hud-menu` button sits at the bottom centre and does not clash with the training menu. The training tab sits at the top right, over the right fighter panel's portrait corner. If that overlap bothers you on phones, move `.tr-menu-wrap` lower in `training.css` or hide the right portrait in training mode.

#### client-vs.md
INTEGRATION (for the lead)**

1. In `packages/client/src/ui/App.ts`, add `import { showVsSplash } from './vsSplash';`.
2. In `startGameView` (around l.848), replace `this.vsSplash();` with a call that does not block the game start:
   ```ts
   void showVsSplash(this.ui, {
     p1: { heroId: mine.hero, playerName: s.roster.get(s.selfId)?.name ?? this.profiles[0].name, color: css(colorOf(<self profile colour>)) },
     p2: { heroId: theirs.hero, playerName: foe?.name ?? (this.mode === 'practice' ? 'Bot' : 'Opponent'), color: css(colorOf(<foe colour>)) },
     arenaName: ARENAS.find((a) => a.id === this.settings.arenaId)?.name ?? 'Arena',
     modeLabel: this.mode === 'practice' ? 'Practice' : this.mode === 'local' ? 'Two players' : undefined,
   });
   ```
   `mine` and `theirs` are the fighters already found in the current `vsSplash` method. The colour fields are the ones the lead must confirm on `ViewFighter` or the roster entries. `css` and `colorOf` come from `./colors`. If the fighter list is not ready, keep the existing wait loop.
3. Delete the old `private vsSplash(...)` method (l.855-883). Optionally delete the `.vs-splash` block in `roster.css` (l.387-402 and the keyframes `vs-from-left`, `vs-from-right`, `vs-pop`), though nothing else should use it.

#### sim-ex.md
INTEGRATION

1. **`packages/client/src/game/GameScene.ts`, `spawnProj` (about line 2119)**: tint when `p.ex` is true. `NetProjectile.ex` is a boolean on every projectile.
2. **`packages/client/src/game/GameScene.ts`, event switch (about line 1847)**: add `case 'ex':`. Play the EX cast flash and sound at `find(e.p)`. `e.skill` is the hero's SkillId. The event arrives at cast start, about `startup` ticks before the matching `shoot`.
3. **`packages/client/src/net/NetGame.ts`, `aboutMe()` (about line 496)**: add `'ex'` to the `case 'swing': case 'shoot': case 'roll': case 'heal': case 'blink': return e.p === me;` list, so your own EX shows at once and the opponent's is delayed with its position.
4. **`packages/shared/src/constants.ts`**: `PROTOCOL_VERSION` is 12. The snapshot changed (one more float in `STATE_KEYS`, projectile kind bit 64, event id 19), so bump it to 13. I did not touch `constants.ts`.
5. **HUD (optional)**: `EX_SPECIAL.cost` (500) is the EX threshold on the rift bar, if you want a marker there. No compile change is needed.

#### sim-settings.md
INTEGRATION
- Imports from `@bladerift/shared` (all from the index re-exports): `BOT_LEVELS`, `isDummyLevel`, `TRAINING`, `KO_LAUNCH`, and the widened `BotDifficulty` type. The `MatchSettings` fields are optional, so nothing else changes at call sites.
- Host lobby commands (lobby phase only):
  - `{ op: 'settings', settings: { training?: boolean, infiniteRift?: boolean, botHero?: number (-1 = random), carryHp?: boolean } }`
  - `{ op: 'botLevel', level: 'easy' | 'normal' | 'hard' | 'cpu' | 'dummy-stand' | 'dummy-guard' | 'dummy-jump' }`
  - `{ op: 'bot', on: true }` to fill the empty seat with the bot.
- Where: App.ts:404 (lobby level buttons) only lists `easy`, `normal` and `hard`. Add the dummy levels there. App.ts:522 casts `level` and is unaffected.
- Survival: nothing to send. Read `LobbyStateMsg.settings.startHp` after a match to show carried health.
- Client HUD in training: the clock stays at `roundTime`, nobody reaches K.O., and the match never ends by time.
- K.O. pose: the beaten fighter has `act === Act.KO` and `ground > 0` once it lands. It is airborne for about 0.4 s after the K.O.

#### sim-throws.md
INTEGRATION

- Import from `@bladerift/shared` (index re-exports fighter, constants and world): `Act` (values 15 and 16), `MOVE_THROW` (18), `THROW`, `isThrowable`, and the `throw` and `tech` GameEvent members.
- Client prediction: wherever the local fighter's `stepFighter` gets its `FoeView` (the foe as the client sees it), add `throwable: isThrowable(opponentState)`. Without it the local throw start never predicts, and the next snapshot corrects it.
- Sound and animation, in the event loop that handles `GameEvent`:
  - on `{t:'throw', a, v}`: `samples.play('throw')` plus a grab animation for the thrower (`Act.Throw`) and the held victim (`Act.Held`).
  - on `{t:'tech', a, v}`: a tech sound, e.g. `samples.play('parry')` (there is no `tech` sfx id in the contract).
  - on `{t:'hit'}` from a throw: the normal hit reaction and knockdown. `w` is the attacker's slot-1 weapon id.
- The thrower's move code 18 appears in `Act.Attack` during the startup and on a whiff, so the swing animation can key on `move === 18`.
- `Act.Throw` and `Act.Held` are unknown to the current sprite and animation maps, so they need a pose mapping (e.g. hold pose for both).
- `PROTOCOL_VERSION` is now 12. Client and server must ship together.

#### stages-bridge.md
INTEGRATION

- Import in render/arena.ts: `import { build as buildBridgeFx } from './stageFx/bridge';`
- Where: in `buildArena`, after the back wall copies, the floor strips and the lamp lights are laid out (so `wallBase`, `wallTop`, `tw` and `FAR` are known), and only when `theme === 'bridge'`. Keep a reference to the returned `StageFx`.
- Call: `const stageFx = buildBridgeFx({ scene, theme, W: a.w, floor: a.floor, wallBase, wallTop, FAR, tw, quality })`. Here `FAR` is the module constant `0.66`, `tw` is `src.width * ws`, and `quality` is `'high'` or `'low'` from the Settings graphics value.
- Per frame: `ArenaView.update()` has no `dt` today, so thread the scene's delta in seconds to the arena and call `stageFx.update(dt, scene.cameras.main)` after the camera has moved.
- Teardown: call `stageFx.destroy()` when the arena is torn down (scene shutdown or arena change). It destroys every image it created.
- Dependencies: the file imports `../arenaLights.json` (already in use by arena.ts) and the types from `./types`. It needs nothing else from the lead's files.

#### stages-crypt.md
INTEGRATION (for the lead; for render/arena.ts only)**
- Import: `import { build as buildCrypt } from './stageFx/crypt';`
- Call: `const fx = buildCrypt({ scene, theme: 'crypt', W, floor: a.floor, wallBase, wallTop, FAR, tw, quality });` Use the arena's own `W`, `a.floor`, `wallBase`, `wallTop` (= `wallBase + 2 - 120`), `FAR` (= 0.66) and `tw` (`src.width * ws`, about 180). `quality` is `'high' | 'low'` from Settings > Graphics.
- Where: after the back wall, the vault and the floor strips are built, in the same place the other stage FX modules are built. Only the `'crypt'` theme should call it.
- Per frame: `fx.update(dt, cam)` after the camera has moved. The extra `cam` argument is ignored, so passing it is harmless.
- Teardown: `fx.destroy()` when the arena is destroyed or the scene shuts down.

#### stages-embers.md
INTEGRATION** (for the lead; no edits made to the files you own)
- Imports, in `render/arena.ts`:
  `import { build as buildEmbers } from './stageFx/embers';`
  `import { prefs } from '../ui/prefs';`
- Call, in `buildArena`, after the wall copies, floor strips, stone and lamp lights are laid. `W` (= `a.w`), `a.floor`, `wallBase`, `wallTop`, `tw`, `FAR` and `theme` are already in scope:
  `const stageFx = theme === 'embers' ? buildEmbers({ scene, theme, W, floor: a.floor, wallBase, wallTop, FAR, tw, quality: prefs().quality }) : null;`
- Per frame, inside `ArenaView.update()`, right after `t += dt;` (the `dt` and `cam = scene.cameras.main` there are already defined):
  `stageFx?.update(dt, cam);`
- Teardown: `ArenaView` has no destroy hook today, so add one (e.g. `destroy() { stageFx?.destroy(); }`) and call it wherever the arena is torn down, or hook the scene's `shutdown` event.
- No texture or asset changes are needed; the wall key `wall-${theme}` is untouched.

#### stages-grove.md
INTEGRATION**
- Import, in `render/arena.ts`: `import { build as buildGrove } from './stageFx/grove';`
- After the wall, floor and lights are built (the arena's `lights` / `tw` / `wallBase` / `wallTop` / `FAR` variables already exist there), for `a.theme === 'grove'` only:
  `const stageFx = a.theme === 'grove' ? buildGrove({ scene, theme: a.theme, W, floor: a.floor, wallBase, wallTop, FAR, tw, quality }) : null;`
  `quality` is `'high' | 'low'` from the Settings graphics pref. I did not find that pref in the code, so please pass it from wherever the app reads it.
- In `ArenaView.update()`, after the camera moves: `stageFx?.update(dt, scene.cameras.main);`. `dt` is in seconds. The arena computes its own `dt` internally and it can be passed on.
- `ArenaView` needs a `destroy()` method that calls `stageFx?.destroy()`. Today it has none.
- Depth 7.25-7.35 needs the fighters above it. The brief says fighters are at 8, so this holds.

**Notes**
- `destroy()` removes every sprite it made. The four canvas textures (`grove-glow`, `grove-leaf`, `grove-mist`) stay in the texture cache, so a rebuilt arena reuses them.
- The module imports `../arenaLights.json` the same way arena.ts does.

#### stages-hall.md
INTEGRATION

In `render/arena.ts`, inside `buildArena`, for theme `'hall'` only (the module reads the hall lamp list whatever the theme, so guard it):

1. Add `import { build as buildHallFx } from './stageFx/hall';`
2. After the wall and floor are laid out (`wallBase`, `wallTop`, `tw` and `a.w` are in scope; `FAR` is the module const 0.66):
   `const stageFx = theme === 'hall' ? buildHallFx({ scene, theme, W: a.w, floor: a.floor, wallBase, wallTop, FAR, tw, quality }) : null;`
   `quality` is `'high' | 'low'`, from `prefs.quality` in `ui/prefs.ts`, or `'high'` if arena does not read prefs.
3. Where `view.update()` runs each frame, after the camera moved: `stageFx?.update(dt, scene.cameras.main);`, with `dt` in seconds (for example `scene.game.loop.delta / 1000`).
4. In the arena teardown or scene shutdown path: `stageFx?.destroy();`

No `ArenaView` change is needed. The module sets its own depths and scroll factors.