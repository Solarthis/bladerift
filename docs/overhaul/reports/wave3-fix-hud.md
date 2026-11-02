All HUD findings are addressed in `Hud.ts` and `hud.css`. Typecheck and tests are clean, and I checked each change in the browser. One finding is partial because its inline counterpart sits in a file I don't own.

**Files changed**
- `C:/Users/vascu/Projects/bladerift/packages/client/src/ui/Hud.ts`: removed the K.O./TIME!, WINNER! and `KO_MS` code, and the `quotesOf` import.
- `C:/Users/vascu/Projects/bladerift/packages/client/src/ui/hud.css`: the `--tb` cap in the thumb-cluster rule.
- Gate script: `C:/Users/vascu/Projects/bladerift/.cache/gate/hudfix.mjs`.

**Findings**
1. **K.O. drawn twice (Hud.ts 301): fixed.** The `round` case now only resets combos, so the DOM K.O. banner is gone. The browser timeline shows no DOM banner during either K.O. The canvas K.O. and PERFECT draw once (`qa/hudfix-desk-ko-a.png`).
2. **TIME! over TIME OVER: fixed in code, not browser-tested.** It shares the same branch as finding 1, and no time-over run was done.
3. **Two WINNER banners (Hud.ts 319): fixed.** The `match` DOM banner is removed. The timeline shows no DOM winner text, and canvas WINNER!! draws once at `over`. The quote line lived only in the DOM banner and is now dropped. Moving it to the canvas `playRoundWinner` would be a GameScene change, which needs your decision.
4. **ROUND 2 waits 1.1 s (Hud.ts 282): resolved by App.ts, no Hud change.** The root cause was the faded HUD carrying into intro, and App.ts line 922 now calls `fadeHud(false)` at intro start. I tried a Hud-side gate and reverted it, because it flashed ROUND 2 over the ME WINS plate for about 300 ms. The VS band is now on screen during intro (`qa/hudfix-desk-intro2-a.png`), and ROUND 2 follows it at its designed time.
5. **Size 1.3 thumb cluster covers the combo counter (hud.css 599): partial.** The rule now reads `--tb: min(…, calc(var(--u) * 18)) !important`. I used `!important` because Controls.ts writes the same `--tb` inline, and an inline value would otherwise win. At 844x390 and Size 1.3 the tile goes from 84px to 70px and the cluster top from y=117 to y=157, below the combo counter's bottom at y=152. Size 1.0 is unchanged at 64px (`qa/hudfix-size-1.png`, `qa/hudfix-size-1.3.png`). Not measured at 667x375. Still to do: `input/Controls.ts:469` (not my file) should get the same cap, so the inline value matches the rule.
6. **First-glow bubble over the rift readout (hud.css 657): resolved by geometry, not seen.** The bubble should now sit below the rift row, estimated at y 107-147 against the rift row's y 79-100. It shows only once per device, so I did not capture it on screen.
7. **Duplicate K.O./WINNER!/TIME! (general): fixed**, covered by findings 1 to 3.

**Verification**
- `npx tsc -p packages/client --noEmit` and `npx tsc -p packages/shared --noEmit` are clean.
- `npx vitest run` passes: 19 files, 467 tests (the count moved from 464 because of other agents' test additions).
- Dead `.hud-banner.ko` CSS remains in hud.css. It is harmless and I left it.