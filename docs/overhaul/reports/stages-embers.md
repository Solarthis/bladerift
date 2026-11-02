Created `packages/client/src/render/stageFx/embers.ts` (new file, only file touched). `npx tsc -p packages/client --noEmit` exits 0 with no errors. I have not run it in the browser, so the look is unverified.

**What it does (export `build: BuildStageFx`)**
- Wall-fixed (`setScrollFactor(FAR, 1)`, depth -19.75 to -19.65): fire glows in the four broken windows, halos on the two lanterns, fire along the top, and a dark smoke bank rolling right along the top of the wall from the gap in the stonework. Glows flicker, breathe and shimmer sideways.
- Air layer (scroll 1, depth 7.3, behind fighters): embers rising from below the view (about 25% come out of window mouths), ash falling with sway, and a burst of sparks every 3.5 to 8 s from a lantern or window sill.
- Procedural only: small dithered pixel textures painted once with `createCanvas` (keys `embers-fx-*`, guarded by `textures.exists`). Pooled sprites with typed-array state, a fixed-seed LCG (no `Math.random`), no per-frame allocation.
- `quality: 'low'` runs the ember, ash, spark and smoke pools and spawn rates at a third. Glow sprites are not particles, so they stay the same count on low.
- `destroy()` removes every display object and is idempotent. `dt` is clamped to 0.05 s.

**Layout decisions**
- Wall points use the arena's own mapping: `x = W/2 + k*tw + (u' - 0.5)*tw` over copies -5..5, odd copies mirrored, `y = wallTop + v*H`, with `H = wallBase + 2 - wallTop` (120). Feature positions (u, v) were read off `wall-embers.jpg` by eye. The lantern positions match the `embers` lights in `arenaLights.json`.
- Air-layer effects spawn at `wall point + (1 - FAR) * cam.scrollX`. That puts them on the same screen spot as the wall, matching the parallax formulas in arena.ts (`wallX`, `floorX`).

**INTEGRATION** (for the lead; no edits made to the files you own)
- Imports, in `render/arena.ts`:
  `import { build as buildEmbers } from './stageFx/embers';`
  `import { prefs } from '../ui/prefs';`
- Call, in `buildArena`, after the wall copies, floor strips, stone and lamp lights are laid. `W` (= `a.w`), `a.floor`, `wallBase`, `wallTop`, `tw`, `FAR` and `theme` are already in scope:
  `const stageFx = theme === 'embers' ? buildEmbers({ scene, theme, W, floor: a.floor, wallBase, wallTop, FAR, tw, quality: prefs().quality }) : null;`
- Per frame, inside `ArenaView.update()`, right after `t += dt;` (the `dt` and `cam = scene.cameras.main` there are already defined):
  `stageFx?.update(dt, cam);`
- Teardown: `ArenaView` has no destroy hook today, so add one (e.g. `destroy() { stageFx?.destroy(); }`) and call it wherever the arena is torn down, or hook the scene's `shutdown` event.
- No texture or asset changes are needed; the wall key `wall-${theme}` is untouched.