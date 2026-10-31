# MUGEN feel reference: "Anime World Tournament" (youtu.be/pDDXy6ZAoCA)

What the owner wants Bladerift to feel like, measured from the video and compared with the code as of commit `b18daab`.
The video was stepped in the browser (seeking the `<video>` element, 1080p stream, 60 fps upload). Reference frames are
contact sheets in `docs/feel/frames/`. Each tile is stamped with its video time in seconds. The sheets are
pane-resolution captures (644x708), so use them for timing and staging, not for pixel detail.

Measurement caveat: the upload is 60 fps, but many neighbouring frames are identical, so the capture is effectively
about 30 unique frames per second. Timings below are good to about +/- 1 video frame (17 ms) when stepped per frame,
and to +/- 33 ms otherwise. "Frames" means 60 Hz frames, which are the same as Bladerift sim ticks.
The video is a commentary edit (a hooded streamer cut-in, plus one editor freeze-zoom at 817-820 s). Those were ignored.

---

## 1. What the video shows

The video is an IKEMEN/MUGEN tournament mode, played CPU vs CPU, with anime crossover characters: Yuji/Sukuna,
Madara with Susanoo, Ichigo, Lucario, Arcueid, Gohan/Trunks and others. It has six matches on painted anime stages
(cave, ice castle, snow forest, rocky forest, waterfall, red wasteland). The sprites are crisp HD pixel art: they
look like classic 2D sprites drawn at 2-3x, with outlines, against detailed painted backgrounds. **A standing fighter
is about 16-20% of screen height** (about 170-215 px at 1080p; see `43-hud-combo-counter-1062-1068.jpg`), and the
stage is about 2-3 screens wide. The pace is very aggressive. Within 1-2 s of FIGHT a rushdown or projectile is
already connecting, and combos run 20-150 hits. About half of the screen time is supers.

## 2. Movement feel

| Action | Observed | Numbers |
|---|---|---|
| Ground dash / rush-in | Snaps across the screen with 3-4 cyan **after-images**. Dust puffs mark the start and the stop. | ~45% of screen width in ~0.20 s (12 frames). A ghost spawns every ~2 frames and fades in ~0.15 s (`34-dash-afterimage-1059_8-1060_27.jpg`). |
| Camera during the dash | **Does not move**. The fighters stay inside the camera dead zone. | 0 px of background shift over 0.7 s while a fighter crossed half the screen (measured by background cross-correlation). |
| Jump / super-jump | Fast rise, long hang at the apex, then a float or hover. Air normals come out at the apex. | Rises ~1.2-1.5 body heights in ~0.2 s, then hangs 0.5 s or more (`1177-1180 s`). Low confidence: the CPUs rarely jump. |
| Turnaround | Instant. The sprite flips on the frame the opponent crosses over, with no turn animation. | 0 frames. |
| Landing | 1 crouch drawing, 2-4 frames. Dust on heavy landings. | ~50 ms. |
| Knockdown -> wake-up | Falls flat, a small bounce, lies down, then gets up and is immediately ready. | Down for ~0.15-0.3 s with the CPU's quick rise (`35-flurry-knockdown-1065_9-1067.jpg`). |

The motion reads as smooth because **every state change is instant** and every move ends in a pose that is held, not
because there are many drawings. A typical action has 3-6 drawings, each held 2-4 frames. The big strike pose is held
6-10 frames.

## 3. Attacks

### Anatomy of a normal (measured)

- **Yuji high kick** (`32-kick-anim-1066_9-1067_37-step33ms.jpg`): chamber drawing 2 frames, then the fully extended
  kick **held 8-10 frames (133-167 ms)**, then 1-2 return drawings over ~4 frames, then stance. About 16 frames in total.
- **Ichigo sword slash** (`33-ichigo-slash-arc-451_0-451_47-step33ms.jpg`): blade raised (2 frames), coiled low and
  **held 6-8 frames**, then the strike pose (2-4 frames). On the strike frame a **separate crescent arc effect** spawns.
  It is about 2x the character's height, with a white-hot core, an orange rim and additive blending. It fades in over 2
  frames and keeps travelling while the character holds the follow-through for 12 frames or more.
  **The weapon trail is an effect sprite layered over the body, not painted into the body frame.**
- Punch smears: a 1-2 frame motion streak (a red or white speed line) along the arm on the extension frame
  (`30-hitstop-spark...jpg`, 1063.87).

### Hit-stop, sparks and reactions (measured)

- **Hit-stop on a medium punch: 8 frames (133 ms).** Both bodies freeze exactly, with no position change.
  **The hit spark keeps animating during the freeze**: a small hot disc grows into a jagged red/orange starburst over
  about 5 spark drawings. The spark sits at the contact point and is about 0.5 body height across. The next hit of the
  string lands 2-3 frames after the freeze ends (`30-hitstop-spark-1063_85-1064_08-per-frame.jpg`).
- Flurries / multi-hit supers run at **~9-12 hits per second** (the counter went 18 -> 25 in 0.8 s at 288 s). Each hit
  gets its own spark, and the sparks overlap.
- Heavy and special hits add a **white directional streak** (a 1-2 frame line across the victim) and an **X-shaped
  white slash spark** (1066.78-1066.86).
- Reactions: the victim snaps to a hurt drawing on the first hitstop frame. Heavy hits launch, the victim bounces off
  the floor, and juggles continue. Knockback is fast (it reaches full speed instantly) with strong friction.
- Sparks and effects use **additive blending and strong colour per character**: Yuji red/black, Ichigo orange/white,
  Lucario cyan, Madara blue Susanoo.

### Combo rhythm and cancels

Normals chain on hit with almost no gap: stance never shows between links. Specials cancel out of normals, and supers
cancel out of specials. The whole thing reads as one continuous motion: hit (freeze 6-10 f) -> 2-4 f of motion -> hit.

## 4. Ultimates / supers: staging timelines

Four sequences were stepped. The pattern is the same in all of them:
**flash -> dim + freeze + cut-in (~0.8 s) -> strike -> on connect, a cinematic -> white-out finisher.**

### 4a. Yuji (cut-in style, the "short" super): `10-...` and `11-super-yuji-flash-209_0-209_7-step50ms.jpg`
| t (s) | Beat |
|---|---|
| 0.00 | Activation pose (1 drawing). |
| +0.05 | **Full-screen red wash, ~85% opaque** (1-2 frames). |
| +0.05 -> +0.30 | The wash fades into a **dimmed stage: ~80% black with a red tint**. The HUD dims. |
| +0.10 -> +0.30 | A **slanted parallelogram cut-in panel** (character bust, ~40% of screen width, right side, thin white border, skewed about 15°) fades and slides in. |
| +0.30 -> +1.05 | **Superpause**: both fighters frozen while the panel holds (~0.75 s). |
| +1.05 -> +1.30 | The panel slides out. The fight resumes with the background still dim. |
| +1.3 -> +3.0 | The multi-hit attack: huge red crescent slashes, a spark on every hit. The background returns at about +3 s. |

### 4b. Lucario "Aura Storm" (portrait + cinematic): `12-`, `13-`, `14-super-lucario-*.jpg`
| t (s) | Beat |
|---|---|
| 0.00 | Activation pose. |
| +0.05 | **The HUD disappears** (it stays hidden for the whole super). The screen is washed bright blue and a radial charge ring appears at the hands. |
| +0.10 -> +0.30 | A **huge character portrait** (~60% of screen height, left side) fades in **behind** the fighter sprite. The camera zooms to ~1.5x on the caster. |
| +0.3 -> +1.0 | Hold, fighters frozen. |
| +1.0 -> +1.9 | Dash strike (wind slashes along the ground). This is the **hit-confirm**. |
| +2.0 | On connect: **hard cut** to a replaced background (deep blue with diagonal speed lines). The fighters become tiny. |
| +2.0 -> +5.5 | The aura sphere grows (3 s). |
| +5.5 -> +11 | A beam fills the screen. The counter climbs to 149 hits. |
| +12 | Aftermath with flying debris and smoke. About 13 s in total. |

### 4c. Arcueid (shatter + animated cut-in): `15-super-arcueid-shatter-cutin-407_6-411.jpg`
The stage goes black with radial crack lines (0.25 s). The **screen shatters into glass shards** (0.5 s). Then comes a
full-screen **animated** cut-in: a bust that pushes in to an extreme close-up of the eye over ~0.75 s. Then the attack
fires (green X slashes and chains), the opponent is trapped in an orb, and the camera zooms ~2x on the trap.

### 4d. Madara "Tengai Shinsei" (background takeover + white-out): `16-` and `17-super-madara-*.jpg`
| t (s) | Beat |
|---|---|
| 0.0 | A blue chakra pillar forms. The HUD is hidden. |
| +1.0 | White flash (~1 s, bright and slowly fading). |
| +2 -> +5 | **The background is replaced by a giant meteor** descending (3 s), with speed-line streaks at the sides. |
| +6.6 -> +7.3 | Impact: yellow light rays, lightning, a radial burst. |
| +7.3 -> +8.8 | **Full white-out, 1.5 s.** |
| +9 | Aftermath with a glow fade (0.5 s). |
| +10 -> +14 | Follow-up: a giant Susanoo slash, then a fire explosion. About 14 s in total. |

Other recurring super devices: a **white void background** with letterbox bars and a lone character (969-971 s); a
**dark speed-line void** (964-968 s); a **black screen with radial glass cracks** as a finisher (958 s); a **camera
zoom punch** during rush supers (see 5).

## 5. Camera

- **Default: fixed zoom, no breathing.** The camera scrolls horizontally only when a fighter nears the screen edge
  (MUGEN "tension"), and follows vertically only on high jumps. Inside the dead zone the camera is perfectly still. That
  stillness is a large part of why the sprite animation reads so crisply.
- **Zoom punch on super connect** (`20-` and `21-camera-zoom-*.jpg`): wide -> **~1.6x within 1 frame, ~2.0x by 5-6
  frames (80-100 ms, ease-out)**, held **~0.8 s** during the rush, then a **snap back to wide in 1-2 frames**. The
  background dims at the same moment.
- Finisher zoom: the camera pushes to a 2-3x close-up on the final hit before the K.O. (`44-finisher-zoom-1185_5-1189.jpg`).
- **Shake** (measured from the background offset at 1063.0-1063.33 s): **vertical only** (0 px horizontal), peak
  **~2.5% of screen height** (~27 px at 1080p, ~6 px at MUGEN's native 240p), a bouncing **~10-12 Hz** oscillation,
  **~20 frames (0.33 s)**, decaying.

## 6. UI / feedback

- **Combo counter** (`43-hud-combo-counter-1062-1068.jpg`): a **huge italic numeral, ~9% of screen height**, with an
  orange-to-yellow gradient, a thick black outline and "HITS!" beside it. It sits on the attacker's side, 25-35% down
  the screen. It pops on every hit, counts from 2 hits, and lingers ~1.5 s after the combo ends.
- Life bars: slanted bars with a cyan-to-yellow gradient and an **orange damage-lag trail**. The portrait sits in a
  slanted frame with the name text. There is a V-shaped central timer, and a hexagonal **"LEVEL" badge** for super
  stocks with a thin orange power bar under the life bar.
- The **HUD hides or dims during supers**.
- Round start (`42-round-start-ready-fight-449-456.jpg`): the comic text "READYYY" (~0.5 s) slams in, the HUD slides
  in, "FIGHHHT!!" slams in (~0.6 s), and action starts immediately.
- **K.O.** (`40-ko-flash-text-608_2-609_6.jpg`): the final hit, then a **white flash ~80% (1-2 frames) fading over 0.3
  s**. **Slow motion (~0.25x)** for ~0.4 s. A huge red "K.O." **scales in with overshoot over ~0.4 s**, with an
  expanding radial white light ring behind it. It holds ~2 s. Then "WINNER!!!", the winner's pose, and a VS card for the
  next battle (`41-ko-winner-vs-603-617.jpg`).

---

## 7. Gap analysis vs Bladerift today

| Area | Bladerift now (file) | Video | Gap |
|---|---|---|---|
| Attack drawings | 3 frames per attack. Anticipation is 1 frame for the whole startup, the strike holds `max(active, 7)` ticks, then 1 recovery frame (`render/spriteAnim.ts` `attackFrame`, `art/animations.json`). | 4-6 drawings: raise, coil (held), strike/smear, strike hold 8-10 f, follow-through, return. | Medium. Timing can improve now; more drawings need art (E). |
| Weapon trails | Sprite fighters get **no swing FX**; only rig fighters do (`GameScene.startSwing`, comment "a sprite fighter's frames carry their own painted weapon trails"). | Big separate additive arc sprites, 1.5-2x body size. | **Large, cheap fix.** |
| Hit-stop | Client-only: the pose freezes per fighter for `min(0.16, 0.05 + amt/1600)` s (`GameScene` 'hit'), but the **sim keeps moving positions**, so the knockback slides during the "freeze". FX with `rate > 1.1` are frozen, **including the hit spark**. | 8 f (133 ms) for a medium hit. Bodies frozen in place, spark animating. | **Large.** Positions must freeze too, and the spark must keep playing. |
| Shake | Random X and Y jitter, `amp*7*pref` world units, 0.22 s, `*0.86` per frame, so it depends on frame rate (`GameScene.shake/updateCamera`). | Vertical only, damped ~11 Hz bounce, ~2.5% of view height, 0.33 s. | Medium. |
| Super start | `flash(color, 0.2, 150)`, `punch 0.035` (decays `e^-16t`, invisible), caster-only freeze of 110 ms, a 1.1 s name banner (`GameScene` 'art', `Hud.ts`). Art ticks are 20-120 (`shared/classes.ts`). | 85% wash, an 0.8 s superpause for both fighters, background dimmed ~80%, a cut-in portrait, HUD hidden, a 1.5-2x zoom. | **Largest gap.** There is no cinematic system. |
| Camera | Zoom and position eased continuously, `k = 1 - exp(-6dt)`. The view holds 330-520 world units of height, so a 58-unit standing sprite is **11-17.6% of screen height** (`updateCamera`). | Fixed zoom, still inside a dead zone, sprites 16-20% of height. | Medium. Sprites are too small and the camera "breathes". |
| Combo counter | A small `N HIT COMBO` chip in the HP status row, 16-30 px, from 3 hits (`ui/Hud.ts`, `ui/hud.css .hp-combo`). | A huge numeral at ~9% of view height, mid-screen on the attacker's side. | Medium. |
| Combo length | `FIGHTER.comboBreak = 5`: the 5th hit grants 45 ticks of invulnerability (`shared/constants.ts`). Chains open only at `end + 35%` of recovery (`fighter.ts`). | 20-150 hits, cancel on hit. | **Design decision**: keep the breaker for PvP fairness, but make hits *feel* continuous (faster chain on hit, see G). |
| K.O. | The 'K.O.' banner for 1.6 s, `shake(0.8)`, FX.pow. | Flash, slow motion, a slam-in with a radial ring, a long hold, WINNER. | Medium. |
| Knockdown | `down` and `getUp` frames exist in `animations.json` but **are never chosen** in `spriteAnim.ts`. | Knockdown, bounce, lying down, wake-up. | Small. Art exists. |
| Dash after-images | Ghost pool exists (`GameScene` ghosts, `ghostAt`); used for Flash Step and some dodges. | Every dash and rush. | Small. |

---

## 8. Prioritised changes, grouped for parallel work

Each group owns its files. Where two groups meet, the contract is named, so they can be built in parallel.
**P1 = biggest feel win per effort.**

### G. Simulation (owns `packages/shared/src/fighter.ts`, `world.ts`, `constants.ts`, `protocol.ts`): do this first, it unblocks B and C
1. **P1: sim hit-stop.** On a landed hit, set `hitstop` ticks on both attacker and victim: light 7, medium 9,
   heavy/finisher 12, crit 14 (or `6 + dmg/25`, clamped 6-14). While `hitstop > 0` the fighter does not step `actT`,
   velocity or position. Apply the knockback when it ends. Send it in the snapshot so the client can read
   `v.hitstop > 0`. This replaces the client-only `freezeUntil` illusion and kills the knockback slide.
2. **P1: superpause.** On `startArt`, put the world into a `superpause` of 45 ticks (0.75 s). Neither fighter nor any
   projectile steps, except the caster's Art timer, which starts after the pause. Emit the existing 'art' event with
   `pause: 45`. The Art's `invuln` is counted after the pause.
3. P2: **Chain on hit.** If the previous move connected (`s.confirm > 0`), allow the chain at `end` instead of
   `end + 35% recovery`. Keep the current timing on whiff. Optionally scale the `comboBreak` threshold up (5 -> 8) and add
   damage scaling instead (design call for the owner).
4. P3: knockdown state: a launched victim that lands goes to `down` for ~20 ticks, then `getUp` (8 ticks, invulnerable).
   This adds a field the animation group reads (A4).

### A. Animation timing (owns `packages/client/src/render/spriteAnim.ts`, `spriteFighter.ts`, `art/animations.json`)
5. **P1: MUGEN-style frame holds** in `attackFrame`. Anticipation shows frame 0. The strike frame appears on the first
   active tick and holds `max(active, 8)` ticks (raise `STRIKE_HOLD` 7 -> 8-9 for heavies). Recovery shows frame 2 for
   the first 60% of recovery, then **returns early to `guard`/`idle:0` for the last 3-4 ticks**, so the move ends in a
   stance instead of a limp end. With 5-frame attacks (after E1) the timing is: raise 2 f, coil = the rest of startup,
   smear 2 f, strike hold, follow-through, return.
6. **P1: victim jitter in hitstop.** In `SpriteFighterView.draw`, while `v.hitstop > 0` (or the client freeze until G
   lands), offset the defender's image by ±2-3 world px horizontally, alternating every 2 frames. Draw the attacker
   still. Also add a forward **lunge offset** of +3 px on the strike frame for the attacker.
7. P2: hurt selection: `hitHeavy` for kb ≥ 300 or `stun ≥ 30`; `hitLight:0` for the first 50% of stun, `hitLight:1`
   after. Use `down`/`getUp` (already in the atlas) for the G4 knockdown state. Hold `land` 3-5 frames (currently 0.1 s).
8. P3: tie the `run` frame rate to speed (8-frame cycle at ~14 fps at full speed). The idle stays at 6 fps.

### B. Combat feedback (owns the `GameScene.ts` 'hit' / 'block' / 'parry' / 'ko' event cases, `addFx`, `shake()`, `render/fxmap.ts`)
9. **P1: swing arcs for sprite fighters.** In `startSwing`, remove the `!fv.sprite` guard. Instead spawn the swing FX
   with ADD blending at 0.8-1.0x scale and the hero's accent palette, timed to the first active tick. That is the
   single cheapest "anime" win.
10. **P1: hit sparks that play through hitstop.** The current `for (const f of this.fx) if (f.rate > 1.1) f.freeze`
    freezes the spark too. Exempt the hit spark just spawned, and freeze only swing arcs. Layer the impact: an additive
    core flash (1 drawing, 2 frames, ~0.6 body height), then the starburst spark (FX.hitSpark / bluntHit), then
    3-6 particles. On heavies and crits add a 2-frame white directional streak through the victim and an X slash spark.
11. **P1: the shake rewrite** (keep the `shake(amp)` signature for other callers): vertical only,
    `y = A * e^(-t/0.12) * sin(2π * 11 * t)`, `A = amp * 0.025 * viewHeightWorld`, duration 0.2-0.35 s. Time-based, not
    per-frame `*0.86`. Light hit `amp` 0.3, heavy 0.6, super hit 1.0.
12. P2: **K.O. sequence** on 'ko': white wash 0.8 -> 0 over 300 ms, a client **display slow-down to 0.25x for 0.5 s**
    (render the snapshot interpolation at a quarter of the rate; the sim's `koTicks` 150 already gives the time), a
    `zoomTo` close-up on the victim (D), and a long ring of particles.
13. P2: after-images on every ground dash and air dash: spawn `ghostAt` every 2 frames with the hero's trail colour,
    0.15 s life (the ghost pool exists).

### C. Super / Rift Art cinematic (new `packages/client/src/game/cinematic.ts`, plus a 5-line hook in the GameScene 'art' case; reads `assets/art/h-XX.jpg`)
14. **P1: the cinematic timeline**, driven by the 'art' event (`pause` from G2; until then, play the visual-only version
    with the caster freeze lengthened to 750 ms):
    - 0-50 ms: a full-screen wash in the hero's accent colour, alpha 0.85, at depth 300 (the existing `flash`).
    - 50-300 ms: the wash fades into a **background dim layer**. Depth between the arena (≤ -1) and the fighters (8):
      black at alpha 0.78 with a 15% accent tint. It holds until the Art's last active tick, then fades over 300 ms.
    - 100-250 ms: the **cut-in panel** (screen space, scrollFactor 0) slides in from the caster's side: a parallelogram
      skewed 15°, ~40% of view width x 55% of view height, a 3 px white border, the hero portrait masked inside, and
      diagonal speed lines scrolling behind the portrait. It holds until 800 ms, then slides out over 200 ms.
    - 0-100 ms: `zoomTo(caster, 1.5x)`; release to 1.0 over 250 ms when the pause ends (D16).
    - Hide the HUD for the duration through a `cinematic` class on the HUD root (F19 adds the CSS).
    - The Art name moves into the cut-in panel (bottom edge, hero accent) instead of the centre banner.
15. P2: **on-connect beat** for the big hitting Arts (Radiant Cleave, Vault of Ages, Stampede, Night Hunt, Abyss Fang,
    Flash Step): on the first 'hit' with an Art id, run `zoomTo(victim, 1.8x, in 80 ms, hold 700 ms, out 2 frames)`,
    swap the dim layer for a procedural **speed-line background** (diagonal additive streaks scrolling at 1500 px/s),
    and put a spark on every hit. If the Art's hit is the round-ending K.O., use a 1.0-1.5 s **white-out** and fade back
    to the K.O. sequence (B12).

### D. Camera (owns `GameScene.updateCamera` and the camera fields)
16. **P1: `zoomTo(x, y, zoom, inMs, holdMs, outMs)` API** that overrides the follow camera, with ease-out in and an
    optional snap out. It replaces `punch` (keep `punch` as a thin wrapper). C and B call it.
17. **P1: sprite size and stillness.** Change `wantH` from `clamp(vh*0.62, 330, 520)` to `clamp(vh*0.62, 290, 360)`, so
    a standing sprite is ~16-20% of view height. Check that arena platforms still fit. Add a **horizontal dead zone**:
    only recenter when a fighter is outside the middle 60% of the view, then follow at `k = 1 - exp(-10dt)`. **Zoom
    out** quickly (k 8) when the fighters separate, and **zoom in** slowly (k 2) and only after 0.5 s of steady distance,
    so the frame stops breathing during exchanges.
18. P2: apply the B11 shake as a camera offset after the clamp (it currently goes into `centerOn`). Keep it at zero on
    `prefs().shake = 0`.

### F. UI feedback (owns `packages/client/src/ui/Hud.ts`, `ui/hud.css`)
19. **P1: the big combo counter.** A new element per side, positioned mid-screen on the attacker's side
    (top 28%, inset 6% from the edge). Numeral `font-size: 9vh`, italic, `skewX(-8deg)`, a gradient fill
    `#fff3a0 -> #ff9a1a -> #e04a10`, a 4 px black stroke, and a "HITS!" suffix at 45% size. On each hit: scale
    1.45 -> 1 over 90 ms. Show from **2** hits. Hold 1.5 s after the last hit, then slide out and fade over 250 ms. Keep the
    small chip or remove it. Also add `.hud.cinematic { opacity: 0; transition: opacity 80ms }` for C14.
20. P2: **comic banners.** READY / FIGHT!! / K.O. / WINNER!!! slam in at `scale(2.2) rotate(-6deg)` -> 1 over 120 ms
    with a 1.1 overshoot, plus a radial white ring (a CSS radial-gradient pseudo-element scaling 0.3 -> 2 and fading over
    400 ms). Give the K.O. banner red letters with a white outline, and hold it 2 s.
21. P3: the damage-lag trail: hold 0.4 s, then drain over 0.35 s. When the rift meter fills, pulse the LEVEL/Art badge and
    flash the bar white for 2 frames.

### E. New art needed (sprite generation; owns `art/sprite-standard.json`, `art/characters/*`, `assets/`)
22. **P2: 5-frame attacks.** Extend the `atk-a`, `atk-b` and `atk-c` sheets from 3 to 5 drawings per move:
    raise, coil, **smear** (the motion-blurred limb or weapon, a 1-2 frame in-between), strike, follow-through. That is
    a 5x2 grid per sheet, about 6 more frames per sheet. `animations.json` then lists 5 frames, and A5 already handles
    `n >= 4`. Paint the strike cells *without* the huge baked trail once B9 draws the arcs, or with a smaller trail.
23. P2: **cut-in busts**: one transparent PNG per hero (3/4 view, shouting or intense, about 1024x1024, the hero's
    accent rim light). The existing `assets/art/h-XX.jpg` portraits work as a stopgap inside a masked panel.
24. P3: hurt additions: `hitLight2` (stagger back), `airSpin` (juggled, tumbling) and `bounce` (hits the floor).
    `down` and `getUp` already exist.
25. P3: super FX sheets, if the procedural versions are not enough: a large crescent arc, a radial burst, a glass
    shatter, a beam column, and a speed-line background tile. PixelFX already covers sparks and bursts.

### Suggested order
G1 + G2 -> A5, A6, B9, B10, B11, D16, D17, F19 in parallel -> C14 -> the rest.
Without G, B10, B11, A5, D16, D17, F19 and the visual-only C14 can ship now. Hit-stop will then still "slide" until G1
lands.

---

## Reference frames (`docs/feel/frames/`)

| File | What to look at |
|---|---|
| `00-key-frames.jpg` | One frame per key idea: cut-in, zoom punch, portrait super, cinematic background, hit spark, K.O., meteor takeover, slash arc. |
| `10-super-yuji-cutin-208_5-212.jpg`, `11-super-yuji-flash-209_0-209_7-step50ms.jpg` | The red wash, then the dim, the slanted cut-in panel and the superpause (50 ms steps). |
| `12-super-lucario-start-495-498_5.jpg`, `13-super-lucario-flash-495_0-495_47-step33ms.jpg`, `14-super-lucario-cinematic-494-508.jpg` | HUD hidden, blue wash, giant portrait behind the sprite, zoom, hit-confirm cinematic. |
| `15-super-arcueid-shatter-cutin-407_6-411.jpg` | Glass-shatter transition and an animated eye cut-in. |
| `16-super-madara-meteor-1145-1159.jpg`, `17-super-madara-whiteout-1151_6-1155.jpg`, `18-super-void-backgrounds-958-972.jpg` | Background takeover, a 1.5 s white-out, void backgrounds. |
| `20-camera-zoom-punch-288_2-289_6.jpg`, `21-camera-zoom-in-288_2-288_43-per-frame.jpg` | Zoom to 2x in about 5 frames, held 0.8 s, then a snap back. |
| `30-hitstop-spark-1063_85-1064_08-per-frame.jpg` | **8-frame hitstop with the spark animating** (per-frame). |
| `31-hit-then-flurry-1063_6-1065.jpg`, `35-flurry-knockdown-1065_9-1067.jpg` | Flurry rhythm, layered bursts, X spark, knockdown. |
| `32-kick-anim-1066_9-1067_37-step33ms.jpg`, `33-ichigo-slash-arc-451_0-451_47-step33ms.jpg` | Normal-attack drawings and holds; the separate slash-arc effect. |
| `34-dash-afterimage-1059_8-1060_27.jpg` | Dash after-images and dust. |
| `40-ko-flash-text-608_2-609_6.jpg`, `41-ko-winner-vs-603-617.jpg`, `42-round-start-ready-fight-449-456.jpg` | K.O. flash, slow motion and slam-in; WINNER; READY/FIGHT. |
| `43-hud-combo-counter-1062-1068.jpg` | HUD layout, combo counter scale, sprite-to-screen ratio. |
| `44-finisher-zoom-1185_5-1189.jpg` | Finisher close-up zoom before the K.O. |
| `01-survey-170-240.jpg` | A 10 s survey sample (style overview). |
