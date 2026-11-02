Changes are in `packages/client/src/render/spriteAnim.ts` and `packages/client/src/render/spriteFighter.ts`. `tsc -p packages/client --noEmit` reports one error outside my files: `packages/client/src/ui/modes.ts(8,46)` cannot find `./stats`.

**What changed**

1. **K.O.** (`spriteAnim.ts`, `Act.KO`)
   - Airborne: rising shows `launched` (falls back to `hitHeavy`), falling shows `knockFall` (falls back to `launched`, then `hitHeavy`). The body tips back using the same formula as the existing knock-off tilt.
   - Grounded: `down` plays from the moment of touchdown and holds its last frame for the rest of the K.O. There is a small bounce on contact. A defeat on the ground counts from the K.O. start.
   - Fallback when a hero has no `down`: `hitHeavy` tips to `KO_TIP = -80` degrees over about 0.12 s, and the lift that puts it on the floor comes from the frame box (`floorDy`). This path never fires for the 14 current atlases, since all have `down`.
   - The old `ko:0-3` collapse frames are no longer used by the K.O.
2. **Win** (`Act.Win`): `victory` plays once from touchdown and holds its last frame (`misc:7`). It falls back to `idle`.
3. **Intro**: no code change. It already plays `intro` then holds `ko:7`, then goes to idle when the phase ends.
4. **Throw** (`Act.Attack` with move 18): the grab (`heavy` frame 0) holds through the startup, with a small coil. The toss (`heavy` frame 1) holds through the active window, then recovery (`heavy` frames 2-3), then the stance. `MOVE_THROW` is a local `const = 18` because the shared export does not exist yet. Timings come from `moveOf()`, or default to 8/6/16 ticks when no move is defined.
5. **EX**: no change.
6. `STAND_WORLD` moved from `spriteFighter.ts` to `spriteAnim.ts` and is exported with `BODY_CENTRE` (0.42). The pivot in `preRender` now uses `BODY_CENTRE`. The `FIGHTER` import in `spriteFighter.ts` is gone.

**Checks**

- Ran scratch scripts with `tsx` against `h00-leon`'s atlas. The outputs were: KO grounded shows `hurt:5` and holds; airborne shows `hurt:4`/`hurt:3` with a tilt; Win shows `misc:5` through `misc:7`; intro shows `ko:6` then `ko:7` held; throw shows `atk-c:4`, then `atk-c:5`, then idle. The no-`down` fallback gives `hurt:2` at -80 degrees with a lift. The scripts live in the scratchpad, not the repo.
- Foot anchors are unchanged. Nothing was committed.

**Not verified or unfinished**

- The sim has no throw yet. The victim uses the existing Stun frames (`hitLight`, `hitHeavy`, `launched`, `knockFall`), chosen by hit-stop, knockback and `fall`. A throw with zero hit-stop shows `hitLight`. The sim should give throw victims hit-stop or `fall` if they should look thrown.
- K.O. timing uses the scene clock (`ctx.land`), which the K.O. slow-motion slows. This is a minor timing drift.
- A `mkdir -p "$TMPDIR/animcheck"` ran while `TMPDIR` may have been unset, which could have created an empty `/animcheck` at the filesystem root. My attempt to remove it was blocked by the safety check. Please delete it if it is there.

## INTEGRATION

- No new imports or calls are required in `GameScene.ts`. The `SpriteFighterView` constructor and `draw()` signatures are unchanged.
- `GameScene.ts:977-983` already passes `introT` during the intro, and `world.ts:284` runs `resetRound` at construction, so round 1 of every match gets the intro.
- Optional, more robust: `introAt` starts only when the sprite exists, so a late atlas load can cut the entrance short. To use the sim's own clock instead, pass
  `introT: g.phase === 'intro' ? (ROUND.introTicks - g.phaseLeft) / 60 : undefined`
  with `ROUND` imported from `@bladerift/shared`. I did not confirm that `ROUND` is exported from the package index.
- Throws: the sim should set `Act.Attack` with `move = 18` (`MOVE_THROW`). No client call is needed. When the shared export lands, the local `const MOVE_THROW = 18` in `spriteAnim.ts` can become an import.
- Other modules may now import `STAND_WORLD` and `BODY_CENTRE` from `render/spriteAnim.ts`.