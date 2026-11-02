Camera brain and tests are done. `npx vitest run packages/client` passes (20 tests: 18 new, 2 existing). `tsc -p packages/client` reports no errors in `camera.ts`; its only error is `src/ui/modes.ts(8,46)`, a missing `./stats` module that isn't mine. The test file typechecks under a scratch tsconfig.

**Files (both new, nothing else edited)**
- `C:\Users/vascu\Projects\bladerift\packages\client\src\game\camera.ts`: exports `FightCamera`, `CAMERA` (all tuning constants), and the types `CameraInput`, `CameraFrame`, `FightCameraOpts`. Imports only `FIGHTER` from `@bladerift/shared`, no Phaser.
- `C:\Users\vascu\Projects\bladerift\packages\client\test\camera.test.ts`

**Deviations from the brief**
- `FIGHTER.h` is 52 in `constants.ts:62`, not ~58. Sizes are computed from 52: desktop zoom = viewH × 0.19 / 52, touch zoom = viewH × 0.24 / 52.
- Touch lift starts at about 98 units above the floor, not 110. With the floor at 72% the top of the view sits about 156 units above the floor, so the head clearance binds first. Desktop lifts at 110 as specified.
- The width fit overrides the size target when the usable width is narrow. Close framing needs `useW ≥ 190 × closeZoom`: about 342 px at viewH 390. Portrait phones with large pads will show fighters smaller than 24%. Landscape is fine (844 px wide gives about 600 px usable).
- "More above for jumps" is handled by the lift rule, not by the zoom. Zoom fits width only, as specified.
- Choices the brief did not fix: pan ease 8/s, lift ease 6/s, `dt` clamped to 0.25 s, and the zoom-in wait has no dead band. The zoom eases in whenever the wanted zoom is above the current one, after 0.6 s of wanting.

**Verified by tests**
- Desktop close fighters give 19% of view height, and the floor sits at 75%.
- Touch close fighters give 24%, and the floor sits at 72%.
- Parted fighters zoom out at 8/s and fit inside the 95-unit margins.
- Zoom-in holds for 0.6 s, then eases.
- The camera is perfectly still (exact equality) while both fighters stay in the middle half of the usable width.
- Walls clamp at 50 units past each end, and an arena narrower than the view is centred.
- The fighters sit at the centre of the usable width between the pads.
- A fighter within 110 of the floor does not move the camera. A high jump lifts it with the head kept on screen, including on touch.
- Output is deterministic. Empty fighter lists, dt 0 and a huge dt give finite values. `reset()` frames at once.

## INTEGRATION (for the lead, in GameScene.ts)

1. Import: `import { FightCamera } from './camera';`
2. Field: `private fightCam: FightCamera | null = null;`
3. Create it in `init()` right after `this.arenaW = arena.w;` and `this.floor = arena.floor;` (around lines 607-608): `this.fightCam = new FightCamera({ arenaW: this.arenaW, floor: this.floor });`
4. Wherever `camInit` is set back to false for a new match (grep `camInit`), also call `this.fightCam?.reset();`.
5. In `updateCamera(list, dt)`: keep `const pad = this.touchInsets(vw);`, then replace the block from `let minX = this.arenaW / 2;` through `this.camX = this.camFc + off;` (about lines 3087 to 3131) with:
   ```ts
   const frame = this.fightCam!.update({
     dt, viewW: vw, viewH: vh, padLeft: pad.left, padRight: pad.right,
     touch: pad.right > 0, fighters: alive.map((q) => ({ x: q.x, y: q.y })),
   });
   this.camZoom = frame.zoom;
   this.camX = frame.x;
   this.camY = frame.y;
   ```
   Delete the now-unused `camFc`, `zoomInWait`, `wantH`, `off` and `dz` code. Keep the shot blend (`let z = this.camZoom` onward), the wall clamp, the shake offset and `setZoom`/`centerOn` unchanged.
6. The existing touch floor clamp (`y = Math.min(y, this.floor + ...)`) does not bind with the new camera at typical touch sizes (its bound is about floor + 26 vs the camera's floor − 48). No change needed.
7. Units: `vw`/`vh` are `this.scale.width`/`height` (game pixels) and `pad.left`/`pad.right` from `touchInsets` are already in game pixels, so they match. The `zoomShot`/`zoomTo` punches multiply on top of `camZoom`, so they keep working.