Changes are in `Hud.ts`, `hud.css` and `hudbars.css`. Type-check passes for my files, but I did not verify the layout visually.

## Summary

**Rift gauge (1):** The bar has a bright notch at 50% over the existing 10% ticks. Below 50% the `%` readout is unchanged. From 50% to 99% a hexagonal "EX" badge pulses softly and the first half of the bar glows. At 100% the badge reads "MAX", the bar flashes white over the gold fill, and the badge pulses brightly. The old "ART READY" text is gone, so at full the badge is the only readout. The badge sits beside the gauge, not on it, because `.hud .rift` clips its children. Its width is reserved below 50% so the bar does not jump when the badge appears.

**New methods (2):**
- `announceResult(text, color?)` shows a centre slam-in word for 1.6 s using the existing banner. The colour is any CSS colour and defaults to white.
- `setHidden(hidden)` fades the panels, clock, combo counter, VS band, pause button and ping. The banners are deliberately exempt, so a K.O. or result word still reads over a hidden HUD during slow-mo.

**Training readout (3):** `setTrainingInfo({ damage, combo, maxCombo } | null)` shows a thin "DMG / COMBO / BEST" line under the clock inside the top band. It is hidden when passed `null`. Below 760 px wide the "BEST" field is dropped so the line fits between the side panels on 667x375.

**Reference match (4):**
- Bars were already slanted (`.hp-bar`, `.rift`), so no change there.
- The orange damage-lag trail already existed (`.hud .hp-trail`). I shifted its gradient further toward orange.
- Phone layout: I checked the geometry by hand at 844x390 and 667x375. The combo counter and side panels end above the top of the touch cluster, and the training line stays clear of the side panels. This is not verified in a browser.

**Not done:** The portrait is not in a slanted frame and the V-shaped timer is not implemented. Neither was in the task.

## Verification

- `npx tsc -p packages/client --noEmit`: my three files compile. The one error is `modes.ts(8,46)`, "Cannot find module './stats'", which is another agent's file.
- CSS braces balance in both stylesheets. Line endings stayed CRLF.
- No visual check. The post-edit hook asked me to start my own dev server with `preview_start`. I did not, because the brief says not to start or stop dev servers. The existing server at localhost:5192 was not used either. Someone should check the phone layout in a real match before shipping.

## INTEGRATION

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