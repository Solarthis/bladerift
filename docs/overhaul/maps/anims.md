Read-only map. Nothing was edited.

**Animation names (identical on all 14 atlases, h00-leon through h13-aegis; `missing=[]` on all)**
- Atlas `native` ranges 162 (h05-lumi) to 210 (h09-gorvax); `base` is 176 everywhere.
- Names and frame counts, from `packages/client/public/assets/characters/h00-leon/atlas.json`:
  - Locomotion and state: idle(4, fps 6, loop), guard(1), crouch(1), skid(1), land(1), run(8, fps 12, loop), jumpStart, rise, apex, fall, fastFall, wallSlide, ledge, climb (all 1, air).
  - Dodge: roll(4), dash(1), airDash(1, air), heal(2).
  - Attacks: combo0/1/2(4), airAttack(4), plunge(4), heavy(4), art(6), skill(6).
  - Hurt and down: hitLight(2), hitHeavy(1), launched(1, air), knockFall(1, air), down(1), getUp(2).
  - Misc: throw(3), taunt(2, fps 3), victory(3, fps 4), ko(4, fps 6), intro(4, fps 4).
- Attack sheets are 4 frames in the atlas but 3 in `art/animations.json`. This is deliberate: `tools/sprites/process.py:38-49` widens 3-cell atk-* ranges to 4 cells when the sheet grid is 4 wide.
- `animations.json` also has `airFrames` (plunge) and `anchor: "hands"` (ledge). `process.py:365-368` reads both. `spriteAnim.ts` does not read either.

**How frames are chosen (`packages/client/src/render/spriteAnim.ts`)**
- Entry points: `spritePoseFor` 154-164 and `pickFrame` 166.
- `pick(name, idx, ...fallbacks)` 168-174 clamps the index. If nothing matches it returns `idle[0]`.
- `timed(name, seconds, loop, ...fb)` 175-180 computes `seconds*fps`. Looping animations wrap; non-looping ones hold their last frame.
- `bounce(ticks)` 182-189 is the knockdown floor bump: 10 ticks, 4 units high, squashed on contact.
- `attackPhase(startup, active, recovery, t, n, heavy)` 92-114 gives the attack frame index. It uses an anticipation coil, a strike hold of 8 ticks (10 if heavy, constants 68-69), then recovery, with an early return to stance at 110.
- `comboAnim` 85-90 picks combo0/1/2 by step.
- Attack (`Act.Attack`) 193-233: art uses lines 194-199; plunge 205-210; charge and crescent use 'heavy' (211).
- Other acts:
  - Charge 234-235, Block 236-237, Ledge 238-239, Climb 240-241, Roll 242-254.
  - Stun 255-268: hit level from `hurtLevel` (118-122) picks hitLight or hitHeavy.
  - Down 269-271, GetUp 272-275 (index = t/getUpTicks × frames).
  - Heal 276-277, Skill 278-301, Art 302-310.
- Default branch 327-353 (Free and others): intro at 328, air states 331-336, landing squash 339-344, skid 346, run 347-351, idle 352.

**Act.KO and Act.Win**
- KO, 311-322:
  - Airborne: time is capped at 1.99/fps, so only frames 0-1 show.
  - On touchdown (`ctx.land`): index is `min(elapsed, 1/fps + land)`, so frame 1 appears on contact and it collapses through 2-3 and holds ko:3. A floor bump runs via `bounce`.
  - Uses `timed('ko', ..., false, 'down', 'hitHeavy')`.
- Win, 323-326:
  - Airborne: fall frame 0 (apex/idle fallbacks).
  - On ground: `timed('victory', min(t/60, land), false, 'idle')`. Victory plays once from touchdown over 0.75 s, then holds misc:7.
- The `Act.KO` and `Act.Win` values come from `packages/shared/src/fighter.ts:14-35` (KO=8, Win=9, Down=13, GetUp=14).

**intro and victory usage**
- intro: only the default branch at `spriteAnim.ts:328` reads `ctx.introT`. `GameScene.ts:978-983` sets `introT` while `game0.phase === 'intro'` and leaves it undefined otherwise. The sim sets the phase at `world.ts:230, 300, 325-326`. So intro plays once per round as a 1 s entrance, then holds ko:7.
- victory: set by `Act.Win` at `world.ts:1220` (every round win, inside `endRound` at 1206-1220) and at `world.ts:1194` (match win). So it plays after every round, not only at match end. It is also in `ui/spritePreview.ts:11` and `dev/SpriteLab.ts:135`.
- Both are used in play, not only in previews.

**Other notes for later work**
- Intro frames share the ko sheet (ko:4-7). Victory shares misc with throw and taunt (misc:0-2, 3-4, 5-7).
- The rig fallback (non-sprite heroes) topples on KO at `GameScene.ts:989-995`. Sprite fighters skip it. The rig's own KO and Win poses are at `render/poses.ts:490-495`.
- `spriteFighter.ts:125-152` holds the hurt-strength memory (127-135) and the frozen clock (139-144). It passes `introT` through the spread at 145-151.
- `spriteAnim.ts:229` returns `idle[0]` (a static frame) on the early return to stance, not the timed idle breath.