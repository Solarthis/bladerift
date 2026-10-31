# Aegis Marrow, the Warden (h13-aegis)

Hero 13, class Shielder, Rift Art Bulwark, slot Extra. Source of truth for the data: `packages/shared/src/heroes.ts` (hero 13), `classes.ts` (Shielder, Bulwark), `weapons.ts` (Shield), `fighter.ts` and `world.ts` (block, parry, Bulwark rules). Art brief: `art/characters/h13-aegis/character.json`.

## Identity and personality

A stoic young knight. She has never taken a step back, and the wall she carries makes sure of it (hero lore). She is calm and unreadable, not cold: the face is composed, the eyes steady, the mouth closed. Her gestures are economical: a single tap on the shield rim for a taunt, a plant of the shield for victory. She does not show off. Her signature is endurance: she takes the hit on the shield and answers with a short, heavy bash.

## Role in the roster

The only Shielder and the only fighter who uses a tower shield. Her silhouette is unique by construction: no other class has a shield, so a tall flat slab in front of the body reads as her at any size. She is the roster's defensive anchor: the largest health pool of any class (`hp` 1250; the Saber and the Berserker are next at 1050), chip damage halved (`chip` 0.5), and a parry window 1.6 times the normal (16 ticks instead of 10). She is slow to move (`speed` 0.92) and slow to recover a roll (`rollCd` 1.1).

## Current design assessment

Source: `packages/client/src/render/models/h13-aegis.ts` (read from code, not checked visually in-game) and `art/characters/h13-aegis/references/portrait.jpg`.

What the old pixel model gets right:
- The palette matches the portrait: teal shell armour, dark steel joints, silver hair, teal eye glow, gold star and rim on the shield.
- The steel gorget, the teal pauldrons and the teal cloak from the shoulders are present.
- The `stance` function makes her planted: crouch and lean are raised slightly, so the body reads low and immovable.
- The silver short hair (`hairShort`) and teal glowing eyes match the portrait.

What it gets wrong or leaves weak:
- The shield is a flat plane drawn "across the hand" with a fixed star. It reads as a board held in front of the fist, not as a tower shield strapped to the forearm, with the body behind it. Its size and the rim thickness are not tied to the body.
- There is no guard pose. The guard is the signature of this character and the game's block state, and the rig only nudges the stance.
- The cloak uses the generic cape helper. It does not match the short, torn deep-teal cloak in the portrait.
- The shield has no back detail (straps, grip, boss). From the front view it is a single flat plate.

Conclusion: keep the palette and the teal-and-gold identity. The sprite pipeline replaces the pixel model's look, so the sprite sheets must fix the shield's silhouette and the guard pose.

## Visual references (described, not copied)

- **Tower-shield fighters in premium 2D fighting games.** Take the rule that the shield is the first readable shape: one large flat face, one emblem, the body hidden behind it in guard. Do not copy any specific character's shield design.
- **Guard as the signature pose.** Premium sprite sets give their defensive stance the most drawing care, since it is the pose a player sees most. We take that: the standing guard (idle frame 5) is the most iconic frame in her set.
- **Light gathering into an emblem.** Special moves in this genre often gather light into a central sigil before releasing it. We take the pattern for Bulwark: the light gathers into the star, then erupts as a barrier.
- **The Lionheart approved sheet** (`art/characters/h00-leon/references/approved-sheet.png`). It sets line weight, the three to four tone cel shading, the crisp metal highlights and the painted trail style. This is the house style, not a design reference for her costume.

## Silhouette notes

- A tall vertical slab at the front (the shield) is the dominant shape. Its top edge sits near eye level in guard and its point near the knee.
- The cloak is a short triangle falling from the shoulders behind her, so the back edge of the silhouette stays compact.
- The body is square and upright. Her head is small against the shield, which gives the silhouette its wall-like read.
- At 150 px tall, the shield must still read as a single flat shape with a bright gold star, and the cloak must not merge into the shield.

## Palette (named, with hex)

| Name | Hex | Use |
| --- | --- | --- |
| Teal Plate | `#2f8f96` | Breastplate, pauldrons, vambraces (base) |
| Deep Teal Shadow | `#1d5c64` | Shadow side of the armour, the cloak |
| Abyss Teal | `#124a52` | Shield face shadow, undersuit |
| Polished Steel | `#c8d2e0` | Ridge highlights, gorget edge, pale trim |
| Dark Steel Joint | `#3a4456` | Belt, joints, shield boss, arm-guard |
| Silver Hair | `#e2e6ee` (shadow `#9aa6b8`) | Hair lights and shadows |
| Brass Gold | `#f0c85a` (star `#ffd84a`, shadow `#a8782a`) | Shield rim, star, edge trim |
| Teal Glow | `#6ff5e6` (white-hot core `#e8fffb`) | Eyes, Art energy, bash trails |
| Fair Skin | `#f2d0b4` (shadow `#c99a7e`) | Face, hands |

## Costume and armour spec

- **Breastplate:** deep teal with polished steel ridges running down the centre and along the ribs. A high steel gorget at the throat, with a thin pale-steel edge.
- **Pauldrons:** teal, with a raised steel rim. Layered: a small upper plate over a larger lower one.
- **Arms:** teal-and-steel vambraces. The left vambrace is the arm-guard that the shield strap runs over. The right vambrace is plain steel with a teal band.
- **Legs:** teal-and-steel greaves and sabatons. Dark steel knee joints and belt.
- **Undersuit:** dark teal, showing between the plates at the waist, the neck and the inner thighs.
- **Cloak:** short, deep teal, falling from the shoulders down the back. Lined in pale steel. The hem is torn into two or three points.
- **Trim:** thin brass-gold on the pauldron edges, the gorget edge, and the belt buckle. Keep it thin: the gold belongs to the shield.

## Face and hair spec

- **Face:** fair skin, a straight jaw, straight silver-grey brows, a composed mouth. No smile in any frame except the victory frame, where the expression stays calm.
- **Eyes:** steel-grey irises with a soft teal glow in the lower half. The glow is the only colour on the face.
- **Hair:** silver-white, short, swept back and tousled. One longer lock falls over the left temple. The back is short, close to the nape. The hair must stay silver in every frame; no tinting.

## Weapon sheet spec: the Tower Shield

- **Shape:** a tall tower shield with a flat face. The top edge is square, the lower edge tapers to a point. Height about three-quarters of her standing height, width about 40 percent of her height.
- **Face:** deep teal with a lighter teal band inside the rim. One large brass-gold eight-pointed star at the centre. The star is the shield's emblem and the brightest point on it.
- **Rim:** a bright gold border, thick enough to read at 150 px.
- **Boss:** a dark steel dome at the centre behind the star's point.
- **Back:** dark steel. Two steel straps (one at the top, one at the middle) and a steel grip behind the boss. The forearm strap runs over the left vambrace.
- **Grip and hand:** she holds it with her **left** forearm strapped into the arm-guard and her left fist on the grip behind the boss. The face always faces the opponent (screen right). Her right hand is an empty steel gauntlet. It joins on the upper rim for heavy charges (atk-c heavy) and braces on the back edge in the standing guard.
- **Consistency rule:** the shield is always on her left arm, and its face is always toward the opponent (screen right when she faces right). Every sheet must match.

## Combat personality

- **Stance:** planted, low, and square. Her weight sits on both feet. She turns her shoulder to the opponent behind the shield edge.
- **Footwork:** deliberate. Walking is slow. She runs with the shield held out in front, rim low, so the run reads as a wall advancing.
- **Speed:** slow to move (`speed` 0.92), slow to recover a roll (`rollCd` 1.1), one air jump, one dash.
- **Weight:** heavy hits and big knockback. The tap bash is short (startup 5, active 5, recovery 16 ticks, damage 50, knockback 300, stun 40) and steps her forward 140 units. The air bash is similar (startup 5, active 6, recovery 12, damage 45).
- **Guard:** holding block puts her in the standing guard. A tap (block released within 10 ticks) fires the bash. A longer hold blocks: chip damage is 7.5 percent of the hit (15 percent for most classes). A hit that lands early in the guard parries and stuns the attacker for 54 ticks; the early window is 16 ticks for her (10 for other classes).
- **Bulwark:** 120 ticks (two seconds) of invulnerability. Projectiles are sent back at their owner. A melee attacker who swings into the barrier is stunned for 30 ticks and pushed back.

## Animation notes per standard sheet

These notes assume the 4x2 and 3x2 grids in `art/sprite-standard.json`. Her overrides keep the same grids and frame counts. See `docs/art/sprite-standard.md` for the rules.

- **idle (override, 8 frames):** a planted stance behind the shield. Frames 1-4 are the breath loop; the shield settles on its point. Frame 5 is the standing guard: the shield raised across the whole body, top edge just above her eyes, her eyes peeking over the rim. Frame 6 is the crouch guard. Frames 7-8 are skid and landing.
- **run (override, 8 frames):** the shield carried in front of the left shoulder, rim low, tilted forward. The stride stays long and heavy, with a slight bob.
- **air (notes):** the shield stays on the left arm in every air pose. The rise and fall hold it in front; the dive tilts it point-down; the wall slide braces its rim on the wall.
- **dash (notes):** the roll hunches the shield over her back like a shell. The ground dash holds it low and forward with sparks off the rim. The heal keeps the shield braced against her side while the right hand drinks.
- **atk-a (override):** combo strike 1 is a short, hard shield punch from the guard (`combo0` in the game, the one bash the Shield has). Combo strike 2 is a diagonal chop. Both start from the standing guard so the release of the block flows into the bash.
- **atk-b (override):** combo finisher is a full-body shield charge with the shield leading low. Aerial attack is a mid-air shield slam forward and down.
- **atk-c (override):** plunge is a shield-first dive, impact is a low crouch with the point driven into the ground, recovery returns to the guard. Heavy is the shield charge: coiled, the star glowing, then a full-power thrust with a shockwave arc.
- **hurt (notes):** the shield never leaves her left forearm. Light hits brace it across her face. Heavy hits push her back on her heels with the shield flared. Knockdown lies her on her back with the shield still strapped on.
- **art (notes, Bulwark):** see the storyboard below.
- **misc (notes):** taunt is a tap of the rim with the right gauntlet and a stoic stare. Victory plants the shield point-down with the star facing the viewer. Skill throw uses the free right hand.
- **ko (notes):** intro walks in with the shield's point dragging, plants it upright, and takes the guard. Defeat: the shield slips from her forearm, she drops to one knee, then falls forward with the shield beside her.

## Rift Art storyboard: Bulwark (6 frames, `art` sheet)

Timing (`spriteAnim.ts`, 6-frame art): anticipation is the first 35 percent of the Art's 120 ticks (frame 1 for ticks 0 to 21, frame 2 for 21 to 42), execution the next 40 percent (frame 3 for 42 to 66, frame 4 for 66 to 90), recovery the last 25 percent (frame 5 for 90 to 105, frame 6 for 105 to 120). The barrier is up for the whole 120 ticks, so recovery shows the barrier thinning, not gone.

1. **Anticipation 1:** she drives the shield's point into the ground. Teal light gathers along the rim; the star begins to light.
2. **Anticipation 2:** the shield is raised in front of her face, the star at full light, the glow at its peak.
3. **Execution 1:** a dome of teal-and-gold light erupts from the shield's face and wraps the front of her body. Solid stepped bands, gold rune rings, a hard bright rim.
4. **Execution 2:** the barrier at full strength. A sharp gold-white spark where a blow would land. The shield is braced, her body square.
5. **Recovery 1:** the barrier is still up and steady, thinning at the edges. The shield is held high.
6. **Recovery 2:** the barrier breaks into light motes and the shield lowers back toward the guard.

Rules for this sheet: opaque, hard-edged light shapes only (the pipeline hardens alpha at 50 percent, so soft glows will be cut); the barrier stays inside the cell with an 8 px margin.

## Open points for the team

- **Moveset mismatch.** `weapons.ts` gives the Shield one combo step (a bash), an air bash and a hold-to-block. It has no plunge and no charge. The brief's frames for combo strike 2, combo finisher, plunge and heavy are authored to the design intent (bash 2, shield charge, plunge), so they will not play until `weapons.ts` gains those moves. Until then, the game plays `combo0` (atk-a frames 1-3) and the air bash (atk-b frames 4-6) for her attacks.
- **Art mapping.** The 6-frame Art uses a 35/40/25 split with two frames per phase (`spriteAnim.ts`), which matches the storyboard above. Note that the sprite renderer also runs the procedural Bulwark `divineShield` bubble and swing effects on top of the painted art until they are suppressed (see `docs/art/sprite-standard.md`, section 10).
- **Reference order.** `refs` points at `references/design.png`, the master sheet. It does not exist yet and must be generated and approved before the animation sheets are made.
