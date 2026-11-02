Created `packages/client/src/render/stageFx/bridge.ts`. `npx tsc -p packages/client --noEmit` exits 0 with no output. I did not run it in the browser, so the alpha and scale values are untuned.

**Exports:** `export const build: BuildStageFx`. It returns a `StageFx` with `update(dt)` and `destroy()`. `update` clamps `dt` to 0.1 s and does not use the camera argument.

**What it draws (all procedural, no new assets):**
- Moon halo on each wall copy, at the moon position from a brightness scan of wall-bridge.jpg (u 0.766, v 0.07).
- Three cloud-bank textures (7 drifting on high, 2 on low) across the sky band above the battlements, tinted cool and fading in and out slowly.
- Four parapet lanterns: additive warm glows that flicker. Positions come from `arenaLights.json` "bridge" (the entries with size of at least 0.012), so they match the arena's lights.
- 36 twinkle dots on high (12 on low) placed on distant lights in the town and behind the arches, respawning at new spots when their twinkle ends.
- Sea mist: 6 on high (2 on low) at depth -18.5, between floor y-46 and floor+14, drifting across the arena with scroll factor 1.
- Bats: 3 pooled bats on high (1 on low), spawning every 8 to 20 s (about 2.2 times longer on low) across the sky above the wall, with a two-frame wing flap.

Depths: moon halo -19.84, clouds -19.82, bats -19.78, lantern glows -19.7, twinkles -19.72, mist -18.5. Wall-fixed items use `setScrollFactor(FAR, 1)`; mist uses scroll factor 1.

Randomness uses a seeded LCG. Textures are created once behind `textures.exists` guards. Update allocates nothing per frame except Phaser's own `setTexture` call on bat flaps. Twinkle positions were estimated from a PIL brightness scan of the picture, not checked by eye.

INTEGRATION

- Import in render/arena.ts: `import { build as buildBridgeFx } from './stageFx/bridge';`
- Where: in `buildArena`, after the back wall copies, the floor strips and the lamp lights are laid out (so `wallBase`, `wallTop`, `tw` and `FAR` are known), and only when `theme === 'bridge'`. Keep a reference to the returned `StageFx`.
- Call: `const stageFx = buildBridgeFx({ scene, theme, W: a.w, floor: a.floor, wallBase, wallTop, FAR, tw, quality })`. Here `FAR` is the module constant `0.66`, `tw` is `src.width * ws`, and `quality` is `'high'` or `'low'` from the Settings graphics value.
- Per frame: `ArenaView.update()` has no `dt` today, so thread the scene's delta in seconds to the arena and call `stageFx.update(dt, scene.cameras.main)` after the camera has moved.
- Teardown: call `stageFx.destroy()` when the arena is torn down (scene shutdown or arena change). It destroys every image it created.
- Dependencies: the file imports `../arenaLights.json` (already in use by arena.ts) and the types from `./types`. It needs nothing else from the lead's files.