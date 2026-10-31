# Bladerift fighter sprite standard

Version 1, 2026-10-31. Applies to every fighter, h00 to h13. Machine-readable parts: `art/sprite-standard.json` (sheets, frame text, grid, style) and `art/animations.json` (animation to frame map). Where this document and those files disagree, the files win and this document must be updated.

## 0. Status

- At the time of writing, `h00-leon` is the only character with a complete sheet set, QA data and an atlas (`packages/client/public/assets/characters/h00-leon/`). `h09-gorvax` and `h10-gray` have 9 of 11 sheets generated and no atlas. The other characters have a character file and references only.
- The renderer is wired. `packages/client/src/render/spriteFighter.ts` (`SpriteFighterView`) draws a hero from its atlas once the atlas has loaded, and `GameScene.ts` uses it in place of the procedural rig when it is there. The state-to-frame rules are in `spriteAnim.ts` (section 7). Procedural effects still run on top of sprite fighters (section 8, finding 8).
- The approved style benchmark is the Lionheart reference sheet, `art/characters/h00-leon/references/approved-sheet.png`.

## 1. Sources of truth

| Topic | File |
| --- | --- |
| Sheet list, frame text, grid, standing height, ground line, body position, style string, native height | `art/sprite-standard.json` |
| Animation to frame map, playback rate, air flags | `art/animations.json` |
| Per-character bible, design, sheet overrides, sheet notes, colour count | `art/characters/<id>/character.json` (example: `h00-leon`) |
| Prompt assembly and master design sheet | `tools/sprites/gen.mjs` |
| Slicing, registration, scaling, palette, atlas, QA, previews | `tools/sprites/process.py` |
| State to animation and frame | `packages/client/src/render/spriteAnim.ts` |
| Body box, timings, block and parry rules | `packages/shared/src/fighter.ts`, `constants.ts`, `world.ts` |
| Moves per weapon, class stats, Rift Arts | `packages/shared/src/weapons.ts`, `classes.ts`, `heroes.ts` |
| Character production documents | `docs/characters/<id>.md` |

## 2. House style

Every sheet is rendered in one house style, given in `style` in `art/sprite-standard.json`. In short:

- Premium, high-detail anime 2D fighting-game sprite art, the look of a carefully hand-pixelled character rendered at high resolution. Not vector, not blurred, not chibi, not photorealistic.
- Crisp, deliberate dark outlines, not thick black cartoon lines. The outline is the darkest tone of the surface it bounds, never pure black.
- Cel shading with three to four tones per material. Metal gets one bright specular highlight. A cool rim light separates the figure from the background.
- An expressive face with a clear eye, anatomically correct hands with readable fingers, fluid hair and cloth that follows the motion.
- The reference for all of this is the Lionheart approved sheet. The brief convention is that every character's `designRefs` includes it, so the image model matches it, not any other sheet.
- Figures are drawn with the same proportions and rendering level on every sheet of a character. A new sheet is never a new style.

## 3. Canvas, grid and cells

- Every sheet is a single PNG, 1536 by 1024 px, with a fully transparent background. No floor, shadow, scenery, text, numbers or grid lines.
- Two grid layouts:
  - 4 columns by 2 rows, cells 384 by 512 px: idle, run, air, dash, hurt, misc, ko (8 frames each).
  - 3 columns by 2 rows, cells 512 by 512 px: atk-a, atk-b, atk-c, art (6 frames each).
- Frames fill cells in reading order (left to right, top row first). Cells beyond the frame count stay empty.
- Each character therefore has 80 frames in 11 sheets: 7 sheets of 8, 4 sheets of 6.
- Nothing may cross into a neighbouring cell. Keep an 8 px clear margin at every cell edge. Weapons, cloaks, hair and effects are shortened or angled to fit.
- The feet rest on one invisible ground line 6 percent of the cell height above the bottom edge (about 31 px). Airborne frames are drawn at the same place in the cell; the game moves the character.
- The torso centre sits at 36 percent of the cell width (about 138 px on 4x2 cells, 184 px on 3x2 cells), so the weapon has room in front.
- The Lionheart reference is a looser multi-row pose sheet (figures fill most of their rows, with a weapon turnaround at the right edge). It is a style reference, not a slicing sheet.

## 4. Proportion and scale

- Standing height, heel to crown, is `standFrac` times the cell height: 0.78 for 4x2 sheets (about 400 px) and 0.66 for 3x2 sheets (about 338 px). The 3x2 sheets are smaller on purpose so that the weapon and the effect have room.
- The character's native height is 176 px in the atlas (`nativeHeight` in `sprite-standard.json`, overridable per character). `process.py` measures the median standing height on the idle sheet and scales that to 176 px. Other sheets are scaled by the ratio of their `standFrac` values, so a 3x2 frame lands at the same body size as a 4x2 frame.
- The gameplay body box is 22 units wide and 52 units tall, feet to top of head (`FIGHTER.w`, `FIGHTER.h`), with a crouch height of 34 units (`crouchH`).
- The renderer draws the native standing height (176 px) at `FIGHTER.h x 1.12` world units, which is 58.2 units. The extra 12 percent is for hair and helmets above the body box (`STAND_WORLD` in `spriteFighter.ts`). The world scale of an atlas is therefore 58.2 / `native`. QA measures sprites in the atlas, so a standing frame should be 176 px tall; a helmet or a tall hairstyle may use up to the 12 percent above the box.
- Proportion: a heroic figure, roughly seven heads tall (a guide; check against the approved sheet), long legs, a broad chest. Give each class its build within that range. The Shielder is square and planted; the Assassin is lean. Build differences must read at 150 px tall.
- Weapons are sized against the body. Design targets: the tower shield about three-quarters of the body height, a longsword about the body height, a lance longer than the body.

## 5. Facing and anchors

- Every frame faces right, in the three-quarter side view of the approved sheet. The renderer mirrors the frame for fighters that face left (`setFlipX`, with the anchor mirrored too).
- Wall slide is drawn with the back and the left shoulder against a wall on the left. The renderer mirrors it for right walls, as it mirrors every frame for a left-facing fighter.
- Anchors: grounded frames register on the feet centre, on the ground line (`process.py`). Airborne frames register on the torso centre at their sheet's ground line, and are not snapped to the ground. The `air: true` animations and the plunge's airborne frame use this rule.

## 6. Sheets and frame meanings

Frame numbers in this document are 1-based. The code uses 0-based indices.

| Sheet | Grid, stand | Frames (1 to N) |
| --- | --- | --- |
| idle | 4x2, 0.78 | 1-4 combat loop (stance, breath in, top, breath out); 5 standing guard; 6 crouch guard; 7 skid; 8 landing |
| run | 4x2, 0.78 | 8-frame cycle: 1 right contact; 2 right down, lowest; 3 passing, left knee up; 4 left reaching, airborne; 5 left contact; 6 left down; 7 passing, right knee up; 8 right reaching, airborne |
| air | 4x2, 0.78 | 1 jump take-off (crouch spring); 2 rising; 3 apex; 4 falling; 5 fast fall; 6 wall slide (wall on the left); 7 ledge hang; 8 ledge climb |
| dash | 4x2, 0.78 | 1-4 dodge roll (drop, tuck, over the shoulder, out into a crouch); 5 ground dash; 6 air dash; 7 heal, pulling out a flask; 8 heal, drinking |
| hurt | 4x2, 0.78 | 1 light hit; 2 light recovery; 3 heavy hit; 4 launched; 5 knockdown fall; 6 knocked down; 7 getting up on one knee; 8 back on guard |
| misc | 4x2, 0.78 | 1-3 skill throw (reach, throw, follow-through); 4-5 taunt; 6-8 victory |
| ko | 4x2, 0.78 | 1-4 defeat (stagger, drop to knees, collapse, lying still); 5-8 intro (walk in, raise, flourish, settle) |
| atk-a | 3x2, 0.66 | 1-3 combo strike 1 (anticipation, strike, recovery); 4-6 combo strike 2 (anticipation, strike, recovery) |
| atk-b | 3x2, 0.66 | 1-3 combo finisher (wind-up, strike, follow-through); 4-6 aerial attack (anticipation, strike, recovery) |
| atk-c | 3x2, 0.66 | 1-3 plunge (dive, impact, recovery); 4-6 heavy (charge, strike, follow-through) |
| art | 3x2, 0.66 | 1-2 anticipation; 3-4 execution; 5-6 recovery |

Rules for the frame text:
- The text is a single pose or beat. Consecutive frames are one continuous motion: costume, weapon design and hair are identical, only the pose changes.
- Loop seams must match: idle frame 4 flows into frame 1, run frame 8 into frame 1.
- The frame order and count are fixed by the standard. A character may override a sheet's text, but must keep its grid, `standFrac` and frame count, and each frame must keep the meaning of the same position.
- Frames that describe a weapon say "weapon" generically. The character's bible names the weapon, and the sheet text must not contradict it.

## 7. Timing and move-phase mapping

Playback rates (`fps`) are used only by time-driven animations. Attack and Art animations are driven by the move's own timing. Game ticks run at 60 per second (`TICK_RATE`).

| Animation | Frames | Driver | Rate and rule |
| --- | --- | --- | --- |
| idle | idle 1-4 | time | 6 fps, loops (about 0.67 s per cycle) |
| guard | idle 5 | block state | held while blocking |
| crouch | idle 6 | crouched | held |
| skid | idle 7 | speed over 90 units and opposite to facing | held |
| land | idle 8 | 0.1 s after touchdown | held |
| run | run 1-8 | run phase | one stride per 2 pi, loops |
| rise, apex, fall, fastFall | air 2, 3, 4, 5 | vertical speed | rise below -160; apex from -160 up to 140; fall at 140 and above; fastFall when diving |
| wallSlide | air 6 | sliding on a wall | held |
| ledge, climb | air 7, 8 | ledge state | climb shows air 8 for 10 ticks, then the landing frame (idle 8) |
| roll | dash 1-4 | roll progress | 22 ticks across the four frames |
| airDash | dash 6 | air dash | held |
| dash (ground) | dash 5 | not selected | see section 8 |
| heal | dash 7, 8 | heal state | frame 7 for 7 ticks, then frame 8 |
| combo0, combo1 | atk-a 1-3, 4-6 | move step | attack timing below |
| combo2 | atk-b 1-3 | move step | attack timing below |
| airAttack | atk-b 4-6 | air attack | attack timing below |
| plunge | atk-c 1-3 | plunge | see section 8, finding 1 |
| heavy | atk-c 4-6 | charge, then release | charge is frame 4 while held; release uses attack timing from frame 5 |
| hitLight | hurt 1-2 | stun | hurt 1 from tick 4 to 13 of the stun, then hurt 2 (the first 4 ticks show hitHeavy) |
| hitHeavy | hurt 3 | stun | first 4 ticks of a grounded hit |
| launched, knockFall | hurt 4, 5 | airborne stun | rising hit or falling hit |
| down | hurt 6 | not selected | only as a fallback for KO |
| art | art 1-6 | Rift Art | see the art timing below |
| throw | misc 1-3 | skill | frame 1 until startup, 2 for 6 ticks, then 3 |
| victory | misc 6-8 | win state | 4 fps, holds on the last frame |
| ko | ko 1-4 | KO state | 6 fps, holds on the last frame (about 0.17 s per frame) |
| intro | ko 5-8 | intro | 4 fps, holds on the last frame (see section 8, finding 5) |

Attack timing (3-frame sheets, `attackFrame` in `spriteAnim.ts`), for a move with `startup`, `active` and `recovery` ticks:
1. From the start of the move until `startup`: frame 1 (anticipation).
2. The next `ceil(0.6 x active)` ticks: frame 2 (strike).
3. The rest of the move, including the recovery: frame 3 (recovery).

A 3-frame attack has no separate extension frame; the recovery frame covers the end of the active window and all of the recovery. Its strike frame must therefore carry the trail or impact, and its recovery frame must read as a follow-through.

Art timing: the Rift Art has its own tick count (`ARTS` in `classes.ts`). For a 6-frame art sheet the progress through the art (0 to 1) selects the frames in three phases: anticipation is the first 35 percent (frames 1 and 2), execution the next 40 percent (frames 3 and 4), recovery the last 25 percent (frames 5 and 6). Each frame in a phase gets half of that phase. For Bulwark (120 ticks) that is: frame 1 ticks 0 to 21, frame 2 ticks 21 to 42, frame 3 ticks 42 to 66, frame 4 ticks 66 to 90, frame 5 ticks 90 to 105, frame 6 ticks 105 to 120. Sheets with fewer than 6 frames fall back to an even split.

Block and the bash: holding the block button puts the fighter in the guard (idle 5). Releasing it within 10 ticks fires the first combo move from its anticipation frame. The anticipation frame of combo 1 must therefore match the guard pose, so the bash flows out of the block.

## 8. Findings in the current runtime mapping

These are problems found by reading `spriteAnim.ts` against `animations.json`, `fighter.ts` and `weapons.ts`. They are not fixed here (this round changes no code).

1. **Plunge impact is never shown on the ground.** While airborne after startup, the code selects index 1, the impact frame. On the ground it selects index 2 (recovery), and index 3 is clamped to 2. The impact frame is shown mid-air and never on contact. Intended mapping: frame 1 while falling, frame 2 (impact) for the first few ticks after landing, frame 3 (recovery) after that.
2. **Piercing Fang (`MOVE_ART`) plays art frames 3 to 6 only, by design.** The code comment says the lunge is the Art's execution and recovery. A lancer's art sheet must therefore put the lunge in frames 3 to 6; its anticipation frames 1 and 2 are not used by that Art.
3. **Four animations are never selected.** `jumpStart` (air 1), `getUp` (hurt 7-8) and `taunt` (misc 4-5) have no branch, and the ground dash (dash 5) appears only as a fallback. `down` is used only as a KO fallback. Either add the state each one needs, or remove the frames from the sheets to save generation time. `taunt` needs a taunt action that does not exist in `packages/shared`.
4. **Resolved in the current code.** An earlier revision had an 8-frame art split that no standard sheet uses. The current split is for 6-frame sheets (section 7), which matches the standard.
5. **Intro is tied to the scene clock.** It uses `ctx.time % 99`, not the intro timer. The intro should start on the first tick of the round intro (`ROUND.introTicks`, 150 ticks, 2.5 s) and be driven by its own tick count.
6. **Some moves in a character's sheet are unreachable.** A weapon's combo list sets which combo frames are reachable. The Shield has one combo step and no plunge or charge (`weapons.ts`), so for Aegis atk-a 4-6, atk-b 1-3 and atk-c 1-6 cannot be seen in play until the weapon gains those moves. This is allowed, because the standard keeps the frame list fixed across characters, but QA must list unreachable frames instead of passing them silently.
7. **Scale is 1.12 times the body box, not 1.0.** `spriteFighter.ts` sizes the native 176 px standing height at 58.2 world units (section 4). This is deliberate, for hair and helmets, but a reader who expects 52 units will mis-measure. Keep it in mind when judging proportions in game.
8. **Painted and procedural effects both run.** `GameScene.startSwing` still fires the procedural swing (`swingFx`) for sprite fighters, and the `divineShield` status loop still runs while Bulwark is active (`GameScene.ts`, around line 699). A sprite fighter with a painted trail or barrier therefore shows two of each until one is suppressed (section 10).

## 9. Palette and outline rules

- `process.py` quantises every frame of a character to one shared palette of `colors` colours (default 96, overridable in `character.json`), found by k-means over the character's own pixels. Every frame of a character uses the same palette, so frames do not shimmer.
- Small accents can be absorbed by their neighbours in quantisation. A colour that covers under about 2 percent of a character's pixels (a gold star, a teal glow) must be checked on `art/characters/<id>/frames/*.png` after processing. If it disappears, make it larger or more saturated.
- Alpha is hardened at 50 percent (`process.py` sets alpha to 0 or 255). No semi-transparent pixel survives. Glows, haze and trails are therefore painted as opaque, stepped bands of 2 to 3 tones, not as soft gradients.
- Each material gets a cel ramp of three or four tones (shadow, base, light, highlight). Metal gets one hard specular highlight. Keep the hue of the shadow close to the base, shifted slightly toward cool.
- Outlines: a dark, hue-shifted edge, the same weight across the roster, never pure black.
- Hue families: each character has one dominant hue family (for example, Aegis is teal and steel with gold accents; Leon is navy, ivory and crimson with gold). Two characters must not share a dominant hue and a silhouette.

## 10. Effects rules

- Effects are painted inside the cell, with the same 8 px margin as everything else. `process.py` measures spill outside the cell; a frame whose spill exceeds 400 px is flagged.
- Effects are opaque and hard-edged (section 9). Impact bursts and shockwaves painted on a frame belong to that frame. Hit sparks and screen effects belong to the game.
- Energy colour comes from the character's bible: the trail and Art glow are one colour family, with a white-hot core and a second colour for sparks. The game's own Art flash colour (`ART_FLASH` in `GameScene.ts`) should sit in the same family. For Bulwark that flash is pale gold (`#ffe08a`); Aegis's painted light is teal with gold sparks, so the two agree.
- Procedural effects already exist, and they run on top of sprite fighters today (finding 8, section 8):
  - `packages/client/src/render/fxmap.ts` gives each weapon and move a procedural swing effect.
  - `GameScene.ts` runs a procedural `divineShield` status loop while Bulwark is active.
  - Art casts add rings and FX through `GameScene.ts`.
  Decision needed: pick one source per effect. Recommended: painted trails and the painted barrier are the look for atlas characters, and the matching procedural trail or bubble is suppressed for them (`startSwing` and the `divineShield` loop, both in `GameScene.ts`). Hit sparks stay procedural.

## 11. Pipeline

1. Write `art/characters/<id>/character.json`: `bible` (120 to 200 words), `design` (6 to 10 lines), `sheets` overrides only where the standard text does not fit the body or weapon (keeping the same grid, `standFrac` and frame count), `sheetNotes` for `art`, `misc`, `ko` and any sheet where the body or weapon needs a reminder.
2. Generate the master design: `node tools/sprites/gen.mjs <id> design`. Review `references/design.png` against the portrait and the Lionheart sheet, and set `refs` to it.
3. Generate the sheets: `node tools/sprites/gen.mjs <id>` (every sheet with no image yet), or name sheets, or `--all`. `--print` shows the prompt for a sheet without generating it. `node tools/sprites/batch.mjs <id> ... [--jobs=6] [--design]` runs several characters through one pool; `--design` makes only the missing master design sheets.
4. Process: `python tools/sprites/process.py <id> --previews`. Writes the atlas and `atlas.json`, cleaned frames, `qa.json` and the previews.
5. Check every frame with the QA checklist (section 12).
6. Only a character that passes is shipped as an atlas. Until its atlas is in `packages/client/public/assets/characters/<id>/`, the game keeps drawing that hero with the procedural rig.

`gen.mjs` assembles each prompt from the style, the bible, the layout rules (grid, margin, ground line, standing height), the sheet title, the frames, and the sheet notes (appended as character notes). A sheet note must never contradict its frame text.

## 12. Acceptance checklist for QA

Each item is a pass or fail. A character is not accepted until every item passes or has a recorded, approved exception.

**Character file**
- [ ] `character.json` parses. `id`, `hero`, `name` and `epithet` match `packages/shared/src/heroes.ts`.
- [ ] `refs` and `designRefs` point to files that exist.
- [ ] The bible is 120 to 200 words and names the weapon, its size, the hand that holds it, and the energy colour.
- [ ] `design` has 6 to 10 lines.
- [ ] Every sheet override keeps its grid, `standFrac` and frame count, and each frame keeps the meaning of its position (section 6).
- [ ] `sheetNotes` has `art`, `misc` and `ko`, plus any sheet where the weapon or body needs a reminder.

**Master design**
- [ ] Face, hair and costume match the portrait exactly (colours, silhouette, accessories).
- [ ] The rendering matches the Lionheart sheet: line weight, cel tones, metal highlights.
- [ ] The weapon's design, size and grip hand are the same in every pose shown.

**Each sheet**
- [ ] 1536 by 1024, transparent background, no text, labels or grid lines.
- [ ] Exact grid, frames in reading order, empty cells only after the last frame.
- [ ] Every frame faces right in the three-quarter view.
- [ ] Standing height is within 8 percent of the target for that sheet's `standFrac`.
- [ ] Feet rest on the ground line at 6 percent above the bottom (grounded frames only).
- [ ] No pixel of any frame falls within 8 px of a cell edge, and no frame's `spill` in `qa.json` exceeds 400.
- [ ] Costume, weapon and hair are identical across consecutive frames. Only the pose changes.
- [ ] Loop seams match: idle 4 to 1, run 8 to 1.

**Motion and phases**
- [ ] Attack frames read as anticipation, strike, recovery, and the strike frame carries the trail or impact.
- [ ] The combo 1 anticipation pose matches the guard pose (for shield and block characters).
- [ ] Art frames follow the three-part split: anticipation (1-2), execution (3-4), recovery (5-6), and the effect is kept inside its cell. Check the 35/40/25 timing in section 7 against the Art's tick count.
- [ ] Any frame that the current code cannot reach is recorded in the character's document as unreachable (section 8, finding 6).

**Palette and effects**
- [ ] Every frame uses the character's shared palette. The accent colours survive quantisation (check `frames/*.png`).
- [ ] No semi-transparent pixels in the atlas. Glows and trails are opaque stepped bands.
- [ ] The energy colour is the one in the bible, and the game's Art flash colour is in the same family.

**Atlas and game**
- [ ] `atlas.json` lists every animation in `art/animations.json` (`missing` is empty), or each missing one is listed with a reason.
- [ ] The contact sheet (`previews/contact.png`) reads as one character, and the idle and guard frames can be told apart at a glance.
- [ ] At 150 px tall, the silhouette is distinct from every other roster member placed side by side.

**Current data for reference**
- [ ] At the time of writing, the h00 `qa.json` has frames over the thresholds: `art:3` (spill 29094), `atk-b:1` (spill 19934) and `dash:4` (feetDrift -65). They need re-generation or a recorded exception before h00 is accepted for the renderer.
