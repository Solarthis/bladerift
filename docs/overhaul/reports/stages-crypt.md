Created `C:\Users\vascu\Projects/bladerift/packages/client/src/render/stageFx/crypt.ts` (C:/Users/vascu/Projects/bladerift/packages/client/src/render/stageFx/crypt.ts). `npx tsc -p packages/client --noEmit` exits 0 across the whole client project. I did not run the game in a browser, so the look and performance are unverified.

**What it does**
- **Candles:** flame glow and core sprites at the five crypt lamps from `arenaLights.json`, mirrored per wall copy the same way `arena.ts` places lamps (odd copies use `1 - u`). I checked the positions against `wall-crypt.jpg`: they sit on the candle flames in the niches. The flicker is layered sines plus LCG noise. These are fixed to the wall (`setScrollFactor(FAR, 1)`).
- **Drips:** pooled drops fall from the top of the wall with gravity, stretch as they speed up, and land on the floor. Each landing spawns a pooled splash ring.
- **Mist:** pooled flat teal puffs creep along the floor band around `floor`, fading in and out.
- **Wisps:** a few faint pale blobs drift in a slow figure-of-eight in the air above the floor, behind the fighters.
- **Textures:** all sprites are canvas textures painted once, keyed `fx-crypt-*`, and guarded with `textures.exists`.
- **Quality:** `'low'` uses a third of the drops, rings, puffs and wisps. Candles are not reduced.
- **Allocation:** no allocations in `update`. The LCG is seeded (`0x6c2a91d3`), and `Math.random` is not used.
- **destroy():** destroys every object the build made. It does not touch the shared textures.

**Depths**
- Candle glow and core: -19.8 and -19.75 (on the wall).
- Splash rings: -18.7 (floor decals).
- Drops: 7.2 (air).
- Mist and wisps: 7.3 (air behind the fighters).

**INTEGRATION (for the lead; for render/arena.ts only)**
- Import: `import { build as buildCrypt } from './stageFx/crypt';`
- Call: `const fx = buildCrypt({ scene, theme: 'crypt', W, floor: a.floor, wallBase, wallTop, FAR, tw, quality });` Use the arena's own `W`, `a.floor`, `wallBase`, `wallTop` (= `wallBase + 2 - 120`), `FAR` (= 0.66) and `tw` (`src.width * ws`, about 180). `quality` is `'high' | 'low'` from Settings > Graphics.
- Where: after the back wall, the vault and the floor strips are built, in the same place the other stage FX modules are built. Only the `'crypt'` theme should call it.
- Per frame: `fx.update(dt, cam)` after the camera has moved. The extra `cam` argument is ignored, so passing it is harmless.
- Teardown: `fx.destroy()` when the arena is destroyed or the scene shuts down.