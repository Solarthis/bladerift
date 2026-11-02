Created `packages/client/src/render/stageFx/grove.ts`. It exports `build: BuildStageFx`. `npx tsc -p packages/client --noEmit` reports no errors anywhere, so the file is clean. I did not run the game, so the look is unverified in a browser.

**What it does**
- **Lanterns:** glow overlays on the three arenaLights.json grove spots plus one small far lantern the list leaves out (u 0.762, v 0.457, read from the picture). Each sways and flickers. The painted lantern itself cannot move, so only its light sways, about 1.6 world units. Halos are high quality only.
- **Fireflies:** 36 pooled additive sprites wandering a band of air above the floor, blinking on their own rhythms.
- **Falling leaves:** 24 pixel-leaf sprites, falling, drifting on a shared wind, spinning and turning over. They respawn at the top of the view, or re-enter from the far side out of sight.
- **Spores:** 12 pooled glowing motes, spawned every 1.8-4 s, rising and fading.
- **Mist:** wall mist fixed to the wall at its foot, and ground mist at the fighters' line under the fighters.
- **Quality low:** every particle count is cut to a third, and no halos.
- **Determinism:** seeded LCG only, no Math.random. Objects are pooled, and update allocates nothing per frame.

**Depths and scroll:** air effects at 7.25-7.35, behind the fighters. Ground mist at -18.6. Wall items at -19.6 to -19.75. Wall items use `setScrollFactor(FAR, 1)`; the rest use 1.

**INTEGRATION**
- Import, in `render/arena.ts`: `import { build as buildGrove } from './stageFx/grove';`
- After the wall, floor and lights are built (the arena's `lights` / `tw` / `wallBase` / `wallTop` / `FAR` variables already exist there), for `a.theme === 'grove'` only:
  `const stageFx = a.theme === 'grove' ? buildGrove({ scene, theme: a.theme, W, floor: a.floor, wallBase, wallTop, FAR, tw, quality }) : null;`
  `quality` is `'high' | 'low'` from the Settings graphics pref. I did not find that pref in the code, so please pass it from wherever the app reads it.
- In `ArenaView.update()`, after the camera moves: `stageFx?.update(dt, scene.cameras.main);`. `dt` is in seconds. The arena computes its own `dt` internally and it can be passed on.
- `ArenaView` needs a `destroy()` method that calls `stageFx?.destroy()`. Today it has none.
- Depth 7.25-7.35 needs the fighters above it. The brief says fighters are at 8, so this holds.

**Notes**
- `destroy()` removes every sprite it made. The four canvas textures (`grove-glow`, `grove-leaf`, `grove-mist`) stay in the texture cache, so a rebuilt arena reuses them.
- The module imports `../arenaLights.json` the same way arena.ts does.