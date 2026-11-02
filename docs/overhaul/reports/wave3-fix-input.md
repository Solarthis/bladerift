Both findings are fixed in `packages/client/src/input/Controls.ts` (the only file I edited).

**1. Loose stick chord stays on for the whole hold (major): fixed.**
- Verified: `chord()` returned `this.pressed.size > 0 || ...`, so a held button kept the 160 ms loose thresholds open indefinitely.
- Change: `chord()` now returns only `performance.now() < this.chordUntil`. The doc comments at lines ~336 and ~510 now say a press opens the window and a held button does not keep it open.
- Evidence: a new run of `.cache/gate/qa-touch-fixcheck.mjs` (a copy of `qa-touch.mjs` with the Vite socket stubbed) at 844x390, default and lefty:
  - Light held, thumb 0.24 right: intents `[[0,0,2]]` (was `[[0.6,0,2]]`). PASS.
  - Heavy held 0.7 s, thumb 0.35 down: intents `[[0,0,4]]` (was `[0,1,4]`). PASS.
  - Launcher (down + Light), partial-down chord, throw (forward + Heavy), partial-forward throw chord, out-of-reach throw, air attack, and air string all still PASS. No page errors.
  - Caveat: the fighter's x moved 420 to 432 during the held-Light case, down from 440 before. Intents show moveX 0 for the whole hold, so the stick is not walking the fighter. The 12 px is most likely the Light attack's own step, but I did not isolate that.

**2. Art hint says hold, but a tap fires it (minor): fixed.**
- Verified: `packages/shared/src/fighter.ts:266` buffers `Btn.Special` on press, so a tap is enough.
- Change: the hint copy at line 382 is now "Tap the art tile when it glows".
- Evidence: a new screenshot at `C:/Users/vascu/AppData/Local/Temp/claude/C--/3e5d6721-b735-4f36-b275-bbd396a973d7/scratchpad/qa/touch-art-ready-844x390-default.png` (Read it) shows the bubble reading "Tap the art tile when it glows". The gesture-9 check (tap fires the full Art) still PASSES.

**Checks**
- `npx tsc -p packages/client --noEmit`: no errors.
- `npx tsc -p packages/shared --noEmit`: no errors.
- `npx vitest run`: 19 files, 464 tests passed.

**Notes for the lead**
- `.cache/gate/qa-touch.mjs` as written fails partway through its gesture run. The cause is that Vite's shared dev server reloads the page mid-run, which another chat's edits seem to trigger. My copy `.cache/gate/qa-touch-fixcheck.mjs` stubs the HMR socket and runs clean. `.cache/gate/qa-touch-diag.mjs` is the timeline probe I used to find this.
- I did not start a preview server. The post-edit hook suggested one, but the task says not to start or stop servers, so I used the existing 5192 server.
- `docs/overhaul/maps/controls-prefs.md` still mentions the old `artHold` hint key. I did not touch it because it is outside my file group.