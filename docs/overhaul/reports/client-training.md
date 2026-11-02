The TRAINING overlay is built in `training.ts` and `training.css`. `tsc` shows no errors in my files. The one error left is `ui/modes.ts(8,46)`, which imports a missing `./stats`, so it belongs to another agent. I checked the layout at 844x390 in the built-in browser by mounting the overlay on the running dev server, with a scripted input and hit sequence.

Files I created (no other files edited):
- `C:/Users/vascu/Projects/bladerift/packages/client/src/ui/training.ts`
- `C:/Users/vascu/Projects/bladerift/packages/client/src/ui/training.css`

**Verified at 844x390 (measured in the page):**
- Input column is at x 6-80, y 156-305. The touch stick ring starts at about x 90, so the column does not overlap it, and it does not touch the bottom-right thumb cluster.
- Damage strip is at x 312-532, y 51-85, under the clock. It shows LAST 51, COMBO 130, HITS 3, BEST 3 for hits of 42, 37 and 51. The combo total is correct.
- Menu tab is at the top right. When open, the menu spans y 30-143, which stays above the top thumb-cluster row (about y 176).
- Not verified: the real HUD (fighter panels, combo counter, clock) and a real phone device. The test page had no HUD, so the layout is checked against measured HUD geometry, not against the live HUD.

**Design notes:**
- Inputs merge into run-length rows with frame counts, newest first. Neutral rows are dimmed. Glyphs: J Jump, A Light, B Heavy, S Skill, R Roll, H Heal, X Rift Art. Colours follow the touch art tiles.
- A combo continues while hits strictly increase and each hit lands within 1300 ms of the last (the same window as `Hud.ts` `COMBO_GAP_MS`). Otherwise combo damage resets. The panel dims after the window ends.
- The dummy buttons start at Stand. The infinite-gauge toggle starts off. Neither is sent to the sim at mount.

## INTEGRATION

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