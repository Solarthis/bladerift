Wired both files. `tsc -p packages/client` reports no errors in GameScene.ts or NetGame.ts; its remaining errors are in App.ts, which is not mine. `npx vitest run` passes (19 files, 464 tests).

**Files:** `C:/Users/vascu/Projects/bladerift/packages/client/src/game/GameScene.ts`, `C:/Users/vascu/Projects/bladerift/packages/client/src/net/NetGame.ts`

**What I wired**
1. **Camera:** `FightCamera` from `game/camera.ts` is built in `create()` and reset in `init()`. `updateCamera` now takes zoom, x and y from it. Shots, shake and the wall clamp are unchanged. `camFc`, `zoomInWait` and `camInit` are removed.
2. **K.O.:** `FX.pow` is removed from the K.O. case. `'ko'` now does the sound, shake, sparks, victim zoom push, `requestSlowmo(0.25, 450)` and `music.duck(0.4, 1500)`, and stores the victim and whether an Art landed it. `'round'` calls `playKoSequence` with perfect, timeOver, draw and the winner's name and accent colour. Perfect comes from per-round damage tracked on `'hit'` events. For Art finishes it also calls `koCinematic` with `whiteout: true`. After the K.O. completes, `playRoundWinner` runs unless the match is over. `'match'` calls `playRoundWinner` with `finalWin: true`. Slow motion now uses `slowScale` and `slowLen`, with the default curve unchanged.
3. **Announcer:** the round intro line is said once when the phase first becomes `'intro'`. It is `round1`/`round2`/`round3`, or `finalRound` when both players are one win from the match. `'fight'` (delay 0.2) is said on the `'fight'` event. `'perfect'`, `'timeOver'` and `'draw'` are said on the round event. `'match'` says `'winner'` when there are two local players, otherwise `'youWin'` or `'youLose'`. I put these calls in the scene because the ROUND and FIGHT banners themselves are in `Hud.ts`, which I do not own.
4. **Stage music:** `music.play('stage-' + arena.theme)` runs in `create()`.
5. **Throws and EX:** `'throw'` plays `samples.play('throw')`, a small shake and a white flash on the victim. `'tech'` plays `samples.play('parry')` and a white burst at the midpoint. `'ex'` plays `whooshHeavy`, a gold ring and an "EX" word over the caster. In `spawnProj`, EX projectiles use gold palettes where the effect allows, and a gold tint and ring otherwise. In `drawFighter`, `Act.Throw` maps to the move-18 attack pose and `Act.Held` maps to the stun pose.
6. **NetGame.ts:** `'ex'` is added to `aboutMe()`. The local prediction's `FoeView` gets `throwable` from a helper that calls `isThrowable` on the snapshot's copy of the foe.
7. **Touch insets:** left-handed mode swaps the two insets, per the controls notes.
8. **Landing:** `sfx.play('land', { x, y, volume: 0.35 })` plays once per landing that follows an airborne spell.
9. **Teardown:** `destroyKoSequence`, `announcer.stop()`, and a guarded `arenaView.destroy?.()`. The arena view has no `destroy` yet, so the call is a no-op until it is added.

**Verified** (dev server, practice room, hall arena; `.cache/gate/integ-fight.mjs` and `.cache/gate/integ-banner.mjs`)
- Round 1 intro logs `music:stage-hall` and `voice:round1`.
- The first K.O. logs `perfect`, and `round2` is said at the next intro. The screen shows the K.O. word with PERFECT under it and the ring (`scratchpad/integ/gs-03-ko-word.png`).
- The round-winner banner is confirmed by a probe: "ME WINS" appears about 2.35 s after the K.O. starts and runs about 1.8 s. The screenshot `gs-05-round2-intro.png` missed it, as it was taken outside that window.
- The second K.O. logs `perfect`, and the match end logs `youWin`, `sfx:matchEnd` and a music change. The `'winner'` line is not verified.
- The camera frame is correct on desktop (`gs-02-fight-camera.png`) and on phone (`gs-m-02-fight-camera.png`). On the phone the zoom takes a second or two to ease in, as designed.
- Throw, tech and EX were fired as synthetic events through `__gameScene.onGameEvent`. The screenshot `gs-06-throw-tech-ex.png` shows the EX ring and word, the tech burst, and a gold-tinted arrow and arcane bolt. The `throw` flash is not clearly visible in that frame.
- The landing thump logs once per jump.
- No console or page errors on desktop or phone.

**Not verified or not wired**
- **HUD hide during K.O.:** not wired. `Hud.ts` and `App.ts` are not mine; App should call `hud.setHidden` on `'round'`.
- **Duplicate banners:** `App` still feeds `Hud.onEvent`, which fires its own K.O., TIME!, FIGHT! and WINNER! banners alongside the scene's words. App or Hud should retire the duplicates.
- **Music stop on leaving:** not in teardown. I left `music.stop(0.6)` to App, which plays results music, so teardown does not cut it.
- **Not exercised:** `finalRound`, `timeOver` and `draw` voices; the two-player `'winner'` line; real throws and EX from the sim; left-handed touch; online NetGame. The `throwable` and `'ex'` changes compile and are not exercised.