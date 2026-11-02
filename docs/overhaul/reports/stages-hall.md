Created `packages/client/src/render/stageFx/hall.ts` (new file, no other files touched). It exports `build: BuildStageFx`. `npx tsc -p packages/client --noEmit` exits 0 with no errors. I did not run it in a browser, so there is no visual check or frame-time measurement yet.

**What it draws** (procedural only: five small canvas textures `hall-flame`, `hall-glow`, `hall-wisp`, `hall-speck`, `hall-glint`, created once behind `textures.exists`)
- **Candle flames:** one additive flame per lamp in `arenaLights.json` "hall" on each wall copy, tinted by the lamp colour, flickering on summed sines with per-flame phases. Wall-fixed (scroll FAR), depth -19.6.
- **Halos:** one additive glow per sconce and one for the chandelier, depth -19.62. None on low quality.
- **Chandelier glints:** 3 pooled four-point flashes at random spots on the chandelier (1 on low), wall-fixed, depth -19.61.
- **Candle smoke:** pooled faint grey wisps rising off sconces, normal blend, peak alpha 0.12 to 0.18, wall-fixed, depth -19.66.
- **Embers:** rare pooled sparks lifting from sconce tips, wall-fixed, depth -19.6.
- **Dust:** pooled specks falling down the centre window's shaft on copies -4, -2, 0, 2, 4. Air at depth 7.5, scroll 1. Positions use the same projection as `arena.update()`.
- **Banners:** not animated. The brief's alternative (wisps and dust) is used instead.

Low quality keeps a third of the flames, smoke, embers, glints and dust. `update(dt, cam)` clamps dt to 0.1 and allocates nothing per frame: pools, typed arrays, a seeded LCG, no `Math.random`. `destroy()` destroys every owned image; the canvas textures stay in the texture manager under their `hall-` keys.

**Concerns**
- `SHAFT` and `COPIES` in hall.ts copy `BEAMS.hall` and `COPIES` from `arena.ts`. If those change, update hall.ts too, or export them from arena.ts.
- The wall-fixed flames sit at depth -19.6, below the light map at 12.5. If the light map multiplies, the flames will dim in dark areas. Check this visually.
- Flames sit around floor-125 world y, inside the fighters' band. They are kept small and faint (flame alpha about 0.4 to 0.8, halos 0.07 to 0.12).

INTEGRATION

In `render/arena.ts`, inside `buildArena`, for theme `'hall'` only (the module reads the hall lamp list whatever the theme, so guard it):

1. Add `import { build as buildHallFx } from './stageFx/hall';`
2. After the wall and floor are laid out (`wallBase`, `wallTop`, `tw` and `a.w` are in scope; `FAR` is the module const 0.66):
   `const stageFx = theme === 'hall' ? buildHallFx({ scene, theme, W: a.w, floor: a.floor, wallBase, wallTop, FAR, tw, quality }) : null;`
   `quality` is `'high' | 'low'`, from `prefs.quality` in `ui/prefs.ts`, or `'high'` if arena does not read prefs.
3. Where `view.update()` runs each frame, after the camera moved: `stageFx?.update(dt, scene.cameras.main);`, with `dt` in seconds (for example `scene.game.loop.delta / 1000`).
4. In the arena teardown or scene shutdown path: `stageFx?.destroy();`

No `ArenaView` change is needed. The module sets its own depths and scroll factors.