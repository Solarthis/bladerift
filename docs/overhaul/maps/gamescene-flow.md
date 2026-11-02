**GameScene round-flow map (read-only, no files edited)**

**Phases (sim, authoritative)**
- `shared/src/world.ts:25` `Phase = 'intro' | 'fight' | 'ko' | 'over'`. Decoded client-side at `shared/src/protocol.ts:285`, held in `client/src/net/NetGame.ts:107-108`.
- `shared/src/constants.ts:145-150` `ROUND`: `introTicks 150`, `koTicks 150`, `defaultTime 120`, `defaultWins 2`.
- `world.ts:299-321` `resetRound()`: phase `intro`, `phaseEnd = tick + introTicks`, every fighter gets `s.lock = introTicks`.
- `world.ts:323-328` `step()`: intro to fight at `phaseEnd`, pushes `{t:'fight'}`.
- `world.ts:1169-1202` `stepRound()`: time-out at 1173-1181, `ko` to next round via `resetRound` (1197-1199), or `over` at 1186 with `{t:'match'}` (1191) and the winner set to `Act.Win` (1193-1195).
- `world.ts:1204-1227` `endRound(winner, why)`: phase `ko`, pushes `{t:'round'}` (1226), sets `Act.Win` on the winner (1219-1221).
- `world.ts:742` pushes `{t:'ko', v, a}` in the kill path, then calls `endRound` at 743.
- `world.ts:1230-1237` `forfeit()`.

**Client event handling (`client/src/game/GameScene.ts`)**
- `update()` at 637. Fighter list 669-680, `delayed()` at 680, `tagsUntil` set at 683 when `g.phase !== 'fight'`, events drained at 692 into `onGameEvent(e, shown)`, `updateCamera` at 719, stage lights 723-726.
- `onGameEvent` switch, lines 2070-2098:
  - `'ko'` (2070-2090): `FX.pow` at 2073 (scale 0.6), `sfx.play('death')` 2074, `shake(1)` 2075, `slowT = 0` 2078, camera push via `zoomShot` at 2080 (zoom capped at 1.7), `koCinematic(this, {x, y-30, attackerId: e.a, camera: push})` at 2081, fallback white flash 2082, 18 sparks 2083-2088.
  - `'fight'` (2091): `sfx.play('matchStart')`.
  - `'round'` (2094): `sfx.play('kill')`.
  - `'match'` (2097): `sfx.play('matchEnd')`.
  - `'art'` (2041): `playSuperCinematic`. `'hit'` (1867): `superConnect`.
  - Line 2101 `this.onEvent?.(e)` forwards to the HUD.
- Field `onEvent` at 563, wired by `ui/App.ts:823` to `hud.onEvent`.
- Other `sfx.play` calls: 23 in total, mostly 1025-2098. `sfx.setListener` at 3163. Dodge and skill sounds at 2383 and 2731.
- Note: these `sfx` names (`death`, `kill`, `matchStart`, `matchEnd`, `impact`, `hit`) are the synth names from `audio/Sfx.ts:13-16`, not the BRIEF manifest ids (`koThud`, `hitLight`, etc.).

**K.O. slow motion and display lag**
- Fields at 541-545: `slowT`, `timeScale`, `dispLag`, `hist`. `init()` resets them at 588-591.
- `stepSlowmo(rdt)` at 1690-1702: 0.25x for 0.4 s, ramp to 1x over 0.15 s. Called at 640 to set `dt`.
- `delayed(list, now)` at 1705-1716 replays fighters `dispLag` seconds back, interpolated.

**K.O. cinematic (`client/src/game/cinematic.ts`)**
- `koCinematic(scene, KoOpts)` at 561. Dedupe window 300 ms (`lastKoAt`, 568-572). White-out of 1300 ms if an Art cast is live for the attacker (`casts.get(attackerId).until`, 574-575), otherwise a 320 ms flash (576). It creates a DOM layer with `holdHud(true)` at 590.
- Exports and tuning are at lines 42-94 and 96-117 (`CineCamera`, `KoOpts`, `CineHandle`).

**Fighter drawing by act (`GameScene.ts`)**
- `drawFighter(v, now, dt, list)` starts around 937. `poseFor` at 944 (rig). Flash 945.
- Sprite path: `fv.sprite` created at 957. Intro entrance: `introAt` field 853-854, set at 978-979, passed as `introT` at 982.
- Rig KO topple at 988-995 (`setAngle(-face*85*easeOut(koT))`).
- Rig poses: `render/poses.ts:490` (KO), `495` (Win). Sprite poses: `render/spriteAnim.ts:311` (KO), `323` (Win).
- Name tags: field 558, drawn 870-873, positioned at 996.
- Stage lights treat KO bodies as `k 0.6` at 725.

**Camera**
- Fields 536-561: `shot`, `camFc`, `zoomInWait`, `camInit`, `camX/Y/Zoom`.
- `shake(amp)` 3028-3036, `shakeOffset` 3039-3046 (vertical only).
- `zoomTo` 3054, `zoomShot(target, inMs, holdMs, outMs)` 3059-3061, `punch` 3064-3067, `shotWeight` 3070-3079.
- `updateCamera(list, dt)` 3081-3164:
  - Framing and zoom 3098-3105.
  - Zoom-out fast, zoom-in after 0.5 s 3114-3122.
  - Horizontal dead zone 3124-3130.
  - Vertical 3131-3132.
  - Shot blend 3138-3152.
  - Clamp and shake 3155-3161.
  - Listener 3163.
- `touchInsets(vw)` 3168-3179 (re-measured each second).

**HUD and intro (`client/src/ui/Hud.ts`)**
- Constants: `KO_MS = 2000` (26), `INTRO_VS = 1.4` (28), `INTRO_ROUND = 0.5` (29), `TICK_RATE = 60` (31).
- `update` intro logic 244-262: `vsOn` only when `round > 1` (254), band card `.hud-vs` (117), `ROUND n` or `READY` via `showBanner` (258-260).
- `onEvent` 269-299: `FIGHT!` (273), `K.O.` or `TIME!` (277), `art` banner (282-289), `WINNER!` (290-296).
- The match-start VS splash is in the menus (`ui/App.ts:408` and `878`, per the Hud.ts:253 comment), not in the scene.
- No `Music.ts`, `Announcer.ts` or `Samples.ts` exist yet. `client/src/audio/` contains only `Sfx.ts`.

**Hook points**
1. **koSequence module**: replace or wrap the `'ko'` case at `GameScene.ts:2070-2090`. It needs `slowT` (542), `zoomShot` (3059) and `shake` (3028).
2. **VS splash and intro**: `update()` near 683, where `g.phase === 'intro'`. Or in `Hud.update` 250-261. There is no intro event, only `phaseLeft`.
3. **Music**: phase changes in `update()` 664-683, `App.ts:821` scene start, and the `'fight'`, `'round'`, `'match'` cases (2091-2098).
4. **Announcer**: the `onGameEvent` cases (2070-2098) and `Hud.onEvent` (269). The BRIEF voice ids map to `ko`, `fight`, `round1-3`, `finalRound`, `youWin`, `youLose`, `winner`.
5. **Camera module**: override `updateCamera` after the follow-cam compute (before 3138), or drive it through `zoomShot` (3059). Both feed `cam.centerOn` at 3161.
6. **Winner or KO pose**: `drawFighter` 937-1000, in the KO branch (988-995) and the `introT` block (976-983).