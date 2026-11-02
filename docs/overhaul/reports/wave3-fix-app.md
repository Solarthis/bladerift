All findings in the app group are handled. Typecheck and tests pass, and the scripted runs show each fix working.

**Files changed:** `packages/client/src/ui/App.ts`, `ui/training.ts`, `ui/training.css`, `ui/modes.css`, `packages/client/src/styles.css`. `modes.ts` is unchanged; the ladder fix is in `modes.css`.

**Per finding:**
- **SFX double master volume (App.ts:314): fixed.** `applyVolumes` now sets `samples.setVolume(p.sfxVol)`. `qa-audio2.mjs` T3a passes: samples 0.8 x master 0.5 = 0.4 at the output (was 0.2). The synth scale in Sfx.ts:289 now resolves to 1 at the default.
- **PERFECT drawn twice (App.ts:951): fixed.** The App-side PERFECT and DRAW `announceResult` calls are removed. The stat counter still runs. `ko-ko-m844-016.jpg` shows one PERFECT, the canvas one from `koSequence`.
- **DOM PERFECT over ROUND WINNER banner: fixed** by the same removal.
- **Time-out draw "DRAW" vs "TIME OVER": fixed.** App no longer says DRAW; `koSequence` keeps TIME OVER.
- **HUD stays hidden through the next intro: fixed.** The HUD fades on the K.O. and returns when the sim phase becomes `intro`. In `qa-ko-run.mjs ko desk`, FADED holds through `ph=ko` and clears at `ph=intro`. Nuance: the ME WINS banner is still on screen for a moment as the HUD returns.
- **Touch controls stay on during K.O. (phones): fixed.** `.touch.faded` in styles.css hides and disables them with the HUD. Phone frames 005 and 016 show no touch controls during the K.O.; they return at 030.
- **In-match menu does not pause the local match: fixed.** Local rooms (practice, same-device, arcade, survival, training) have their tick wrapped and skipped while the leave card or move list is open. Online rooms are not wrapped. `qa-flows-modes.mjs d`: `world.tick` 272 -> 272 in 1.5 s with the dialog open, and all checks pass. I did not run the mobile flow.
- **Ladder opens scrolled past Quit: fixed (partial).** `.md-hdr` is now sticky. Quit is at [280,22,364,66] on 1280x720 and [62,12,146,56] on 844x390. The centring on the current rung is unchanged, so the boss rung still starts off-screen.
- **Training readout keeps old numbers after Reset: fixed.** `Training.reset()` zeroes the counters and `restartTraining` calls it. The probe reads LAST 0 / COMBO 0 / HITS 0 / BEST 0 after Reset.
- **TRAINING tab covers the right name plate and life bar (training.css 143/156, integrate-app): fixed.** The tab and its menu now sit in a top-centre column under the damage strip. Tab rects: [592,150,688,180] at 1280x720, [386,89,458,111] at 844x390, [298,86,369,107] at 667x375, [912,197,1008,227] at 1920x1080. None overlap the plates or the touch cluster.
- **Unowned camera.ts findings (three): skipped.** The file is not in my group and I did not touch it.

**Partial or out of scope:** the canvas PERFECT still sits under the K.O. word in `koSequence`. That is GameScene's code, not in my files.

**Verification:** `npx tsc -p packages/client --noEmit` and `npx tsc -p packages/shared --noEmit` are clean. `npx vitest run` passes 19 files and 467 tests.

**Screenshots and probes:**
- `C:/Users/vascu/AppData/Local/Temp/claude/C--/3e5d6721-b735-4f36-b275-bbd396a973d7/scratchpad/qa/ko-ko-m844-016.jpg`
- `C:/Users/vascu/AppData/Local/Temp/claude/C--/3e5d6721-b735-4f36-b275-bbd396a973d7/scratchpad/qa/train-probe-1280x720.png`
- `C:/Users/vascu/AppData/Local/Temp/claude/C--/3e5d6721-b735-4f36-b275-bbd396a973d7/scratchpad/qa/ladder-probe-1280x720.png`
- Probe scripts: `C:/Users/vascu/Projects/bladerift/.cache/gate/fix-train-probe.mjs` and `fix-ladder-probe.mjs`