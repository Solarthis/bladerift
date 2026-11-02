Stage FX, quality and touch layout are wired into my five files. tsc is clean, vitest passes (19 files, 464 tests), and every arena renders at both viewports with no console or page errors.

**What I wired**

- **`render/arena.ts`**
  - Builds the theme's stage FX module (hall, bridge, embers, crypt, grove) after the shafts and lamps, from `prefs().quality`.
  - `ArenaView.update()` calls `stageFx.update(dt, cam)` after `t += dt`. The arena's own clamped dt is reused, so no signature change was needed.
  - `ArenaView.destroy()` is new and idempotent. It destroys the stage FX, the dust graphics and the shaft haze images.
  - The arena also registers `destroy()` on the scene's `shutdown`, so GameScene's existing teardown (which only nulls the reference) needs no change.
  - Quality 'low' skips the shaft and pool haze images and the dust motes. The light-map stamps stay.
- **`render/lighting.ts`**
  - Reads the quality pref once in the constructor.
  - On 'low', drops the vignette stamp and the floor-pool stamp under each lamp. That halves the lamp stamps; I did not alternate frames, which would flicker.
- **`ui/hud.css`**
  - `.touch --tb` multiplies by `var(--touch-scale, 1)`.
  - `.tb` opacity uses `var(--touch-opacity, 0.85)`.
  - `html[data-left-handed='true']` mirrors the stick zone and the button cluster.
  - `.touch.lefty .touch-hint::after { right: auto; left: 22px; }` is included, plus the matching hint position.
  - Controls.ts sets `.lefty` on the root and writes the same values inline, so both paths agree.
- **`vite.config.ts`**
  - Precache is unchanged; mp3 stays out.
  - `/assets/audio/manifest.json`: NetworkFirst, cache `bladerift-audio-manifest`. It is also precached by the json glob, so the precache serves it.
  - `/assets/audio/*.mp3`: CacheFirst, cache `bladerift-audio`, 120 entries, 60 days, range requests on.
  - A scratch build succeeded and `sw.js` contains both rules.
- **`game/BootScene.ts`**: unchanged. The stage FX are procedural.

**Deviations from the brief**

- `--touch-opacity` is not set on `.tbuttons` or `.stick-zone`. Controls already writes opacity inline on each tile and on the stick at rest, so a container value would multiply (0.85 × 0.85).
- `--touch-scale` is in the CSS rule, but Controls' inline `--tb` on the root wins, so the scale is applied once.
- The left-handed tile positions come from Controls' inline styles. The CSS mirrors only the containers and the hint.

**Verification**

- Screenshots are in `C:/Users/vascu/AppData/Local/Temp/claude/C--/3e5d6721-b735-4f36-b275-bbd396a973d7/scratchpad/integ/`:
  - Desktop 1280x720 and phone 844x390 for all five arenas, high quality: `fx-<arena>-<desk|phone>-hi-a.png` and `-b.png`.
  - Low quality: `fx-hall-desk-low-a.png` and `fx-embers-desk-low-a.png`.
  - Left-handed with touch scale 1.2 and opacity 0.6: `fx-embers-phone-hi-lefty-a.png`. The stick is on the right and the buttons on the left.
  - Teardown: `teardown-pause.png` and `teardown-embers-after-hall.png`. Leaving a hall match through the pause menu and starting embers was clean.
- Stage FX motion: a frame diff of the wall band, excluding the FIGHT banner, between two frames 700 ms apart changed 0.3 to 1.3 percent of pixels. That is motion, but a small signal. I did not inspect each stage element closely at this scale.
- Console and page errors: none in any run.
- Per-frame allocation: the only per-frame addition in my code is the `stageFx?.update` call. The dust array is built once, and the stage FX are built once.
- Scripts are in `.cache/gate/`: `integ-stage.mjs`, `integ-leave.mjs`, `integ-diff.mjs`.

**Left unwired (not my files)**

- `applyPrefsToDocument()` is not called at boot by main.ts or App.ts, so `--touch-scale`, `--touch-opacity`, `data-left-handed` and `data-quality` are unset until a pref changes. The touch layout still works because Controls reads prefs directly. The tests emulate the boot call.
- `GameScene` does not call `arenaView.destroy()`; the shutdown hook covers it.

**Note**

A PostToolUse hook note asked me to call preview_start for my own dev server. The brief says not to start or stop dev servers, so I ignored it and used localhost:5192. Some of my phone runs hit page reloads, which other agents' file edits and the app's update check triggered. The scripts retry after a reload.