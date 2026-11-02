All five findings are addressed, in `heroSelect.css` and `heroSelect.ts` only. Typecheck, shared typecheck and vitest all exit 0 (vitest: 19 files, 467 tests).

**Findings**

1. **Names break mid-word (minor): fixed.** `.hsel-tile .hsel-nm` now uses `overflow-wrap: normal` and `word-break: normal`, so names wrap at spaces only. Across all 14 heroes at all five sizes, no tile name overflows.

2. **Face tiles too small (major): fixed.** The root cause was the width-bound 4x2 grid with 220px group caps. Each class now stacks True over False, and `.hsel-tile` is sized from the panel with container units: the smaller of a column's width and the height the two rows allow. The 220px cap is gone. Measured tile sizes, before and after:

   | Size | Before | After |
   |---|---|---|
   | 1280x720 | 68px | 129px |
   | 1920x1080 | 90px | 187px |
   | 844x390 | 40px | 66px |
   | 667x375 | 30px | 62px |

   The faces fill the panel at 1920. At 844x390 and 667x375 the tiles are height-bound.

3. **Info column clips the signature note (minor): fixed, with a trade-off.** `.hsel-note` is hidden below 760px tall. Below 480px the four kit blurbs are hidden too, since they were one truncated line each, and the item padding is trimmed. Every hero now fits at every size; the largest overflow before this was 42px at 1280x720. The cost is that the signature-weapon note disappears below 760px, and the kit blurbs below 480px. The item names stay.

4. **Tile names crushed (minor): partial.** Below 480px tall, only the cursor's tile shows its name (about 8px at 844x390). The large name is on the portrait plate, as the finding suggested. At 1280x720 and 1920 every tile keeps its name.

5. **Tiles about 2x, one screen, info fits (no area): fixed.** At 1280x720 tiles are 129px (about 1.9x). Everything fits on one screen with no page scroll.

**Behaviour change in `heroSelect.ts`:** Up and Down now step from a class's True champion to its False one. Left and Right still follow reading order. I checked this with the keyboard in the dev server (Down from Saber goes to Gilgamesh, Down again goes to Humbaba). Real mouse and touch were not tested, and portrait only got a layout check (390x844 has no horizontal scroll, tiles are 76px).

**Evidence**
- Measurements, per hero: `C:/Users/vascu/Projects/bladerift/.cache/gate/fix-screens-hero.mjs`
- Screenshots (read and checked):
  - `C:/Users/vascu/AppData/Local/Temp/claude/C--/3e5d6721-b735-4f36-b275-bbd396a973d7/scratchpad/qa/fix-screens-1280x720-hero.png`
  - `C:/Users/vascu/AppData/Local/Temp/claude/C--/3e5d6721-b735-4f36-b275-bbd396a973d7/scratchpad/qa/fix-screens-1920x1080-hero.png`
  - `C:/Users/vascu/AppData/Local/Temp/claude/C--/3e5d6721-b735-4f36-b275-bbd396a973d7/scratchpad/qa/fix-screens-844x390-hero.png`
  - `C:/Users/vascu/AppData/Local/Temp/claude/C--/3e5d6721-b735-4f36-b275-bbd396a973d7/scratchpad/qa/fix-screens-667x375-hero.png`