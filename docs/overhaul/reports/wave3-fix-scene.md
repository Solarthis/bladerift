All nine findings were checked against the code. Five are fixed, one is partly fixed, one is blocked on a file outside this group, one is documented rather than changed, and one is skipped. `tsc` for client and shared is clean, and `vitest` passes 19 files / 467 tests.

**Files changed:** `C:/Users/vascu/Projects/bladerift/packages/client/src/net/NetGame.ts`, `.../src/game/GameScene.ts`, `.../src/game/koSequence.ts`, `.../src/game/camera.ts`, `.../test/camera.test.ts`

**Probes added:** `C:/Users/vascu/Projects/bladerift/.cache/gate/qa-scene-fix.mjs` and `.cache/gate/qa-scene-perfect.mjs`

**Per finding**

1. **Own throw and tech delayed (NetGame.ts) - fixed.** `throw` and `tech` now go through the `parry` case in `aboutMe`. Checked by code and typecheck only, not played online.
2. **READY and gameOver voices never played - partly fixed.** `announceRound` now says `ready` with a 1.9 s delay, so it lands before the Hud's READY card (measured at intro +2.05 s) and before FIGHT (intro +2.5 s). `gameOver` is not added: GameScene has no run-over path, and the run-over card is in `App.ts` (`renderRunOver`), outside this group.
3. **PERFECT on a clock win - fixed.** `timeOver` is computed first and `perfect = !timeOver && ...`. The clock-end probe shows TIME OVER with no PERFECT. A K.O. control with an unhurt winner still shows PERFECT.
4. **ROUND 2 banner over ME WINS - blocked, not fixed.** The timing is worse than the finding says. ME WINS runs from K.O. +2.35 s to +3.75 s. The intro starts at K.O. +2.5 s (`ROUND.koTicks` = 150 in `shared/src/constants.ts:170`), and the Hud shows its ROUND 2 banner and VS card from intro start. Both sit on screen together for about 1.2 s (`scratchpad/qa/scene-ko-2600ms.png`). The scene can't clear this alone. Options for the lead: raise `koTicks` to about 230 (shared, changes pacing), or have the Hud hold its intro banners until the round result ends (Hud owner).
5. **K.O. slow motion on a clock end - fixed.** `onSlowmo` is undefined when `timeOver`. During the clock-end probe, `timeScale` stayed at 1, and a K.O. still drops to 0.25.
6. **DOUBLE K.O. unreachable - documented, branch kept.** The sim's `knockOut` always names a winner (`world.ts` ~866). A draw only comes from the clock, where `timeOver` shows TIME OVER first. The branch is kept and its comment now says it is for forced events only.
7. **Banner plate rebuilt every frame - fixed.** The plate is redrawn only when its width changes, and moved otherwise. Its width can still change once the font loads, which is why the cache is keyed on width. The ME WINS plate renders correctly in `scene-ko-2600ms.png`.
8. **Per-frame camera allocations - fixed.** GameScene reuses a `camFeet` array. `FightCamera.update()` returns its own frame object, documented as rewritten each call. The camera tests copy frames where they keep them.
9. **Fight-start frame stalls - skipped.** The reviewer's own note says the cause is not isolated and not tied to a file. No trace was recorded in this run, and no stage FX was changed.

**Gotcha for others:** the dev app imports `Announcer.ts` with a `?t=` query. A hook that does `import('/src/audio/Announcer.ts')` therefore patches a different instance and logs nothing. Hook the URL found in `performance.getEntriesByType('resource')` instead. The probes above do this.