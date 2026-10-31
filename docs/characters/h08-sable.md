# Sable (h08), the Veiled Blade

Assassin, Flash Step, slot False. Signature weapon: Twin Daggers (`packages/shared/src/weapons.ts`).
Lore line (heroes.ts): "You never see her coming. You see her leaving, and then the cuts arrive."

## Identity and personality

Calm, precise, and a little theatrical. Sable is a blade dancer: she moves like the cuts are music, and she leaves
after-images so the opponent is always chasing her last position. Her veil hides her mouth, so her emotion comes through
the eyes, the hood, and the posture. She is confident rather than cruel.

## Role in the roster

The second assassin, sharing Hollowmask's class (triple jump, two air dashes, quick rolls, backstab multiplier 1.9) and
weapon. Her Art, Flash Step, is a blink-behind and six-cut flurry, so her signature is the cyan after-image. She is the
more open, upright, and elegant of the two; Hollowmask is the low, hunched predator.

## Current design assessment

Source: `packages/client/src/render/models/h08-sable.ts` (code comments, shape, palette) and the portrait
`art/characters/h08-sable/references/portrait.jpg`. The pixel model was not rendered for this review; the notes come
from its code and the portrait.

What the old model gets right:
- The indigo hood with a gold-trimmed front edge, the dark veil over the lower face, and sharp eyes with a cyan glint.
- Gold belt and gold-trimmed armour, and a scarf tail behind the body.
- The slim knives (about 6 px, not the long daggers) and a low, coiled crouch.

What it gets wrong or leaves weak:
- The portrait's blades have a visible gold cross-guard and a long, curved look. The brief asks for slim and short, so
  the guard should stay small and the blade should stay short, but the blade should keep a clear curve so it reads as a
  knife and not a stick.
- The model has no after-image system, so the defining cyan ghosts are missing from the stance. The sheets must show them.
- The hood and veil are dark indigo on dark armour, which can merge at small sizes. The gold trim is the separation and
  must stay bright along the hood edge and the belt.

## Visual references (described, not copied)

- Premium anime fighting-game sprite art at the level the brief names (BlazBlue, Guilty Gear XX, Melty Blood). Taken:
  crisp outlines, cel shading with three to four tones, a cool rim light, and energy built from layered arcs.
- The approved Lionheart sheet (`art/characters/h00-leon/references/approved-sheet.png`). Taken: cloth drag on motion
  frames, and the clean white-core arc trails.
- Blade-dancer and motion-echo effects in general (afterimages and clean arcs). Taken only as a principle: a moving
  silhouette leaves a few lighter copies that fade, not a smear.

## Silhouette notes

- Head: a hood, a veil under sharp eyes, and a straight black strand at the temple. The gold edge outlines the face.
- Torso: upright and slim with a narrow waist and a gold belt.
- Cloth: a long indigo hood and an indigo scarf tail that streams behind on every move.
- Hands: two slim knives in forward grip, blades angled out, so her outline is wider at the hands than Hollowmask's.
- Overall: an upright, open silhouette with a gold edge and cyan after-images. Hollowmask is low and closed; Sable is
  tall, open, and glowing.

## Palette

| Name | Hex | Use |
| --- | --- | --- |
| Indigo cloth | #2e2a5a | hood, scarf, leggings (matches armor 0x2e2a5a) |
| Deep indigo | #201e44 | hood shadow and cloak lining |
| Near-black lacquer | #121220 | bodice, bracers, boots |
| Gold trim | #d4a94a | hood edge, belt, cuffs, knife guards |
| Cyan glow | #3ce0f5 | Flash Step after-images and arc trails (matches accent 0x3ce0f5) |
| Cyan core | #e8fbff | white-hot centre of trails and after-images |
| Warm skin | #d9a88a | face and exposed skin |
| Veil black | #0c0c14 | cloth veil and eye shadows |
| Dark steel | #b8c4d0 | knife blades, highlighted edges |

## Costume and armour spec

- Hood: deep indigo with a gold-embroidered rim. It falls onto the shoulders, and the front edge frames the eyes.
- Bodice: sleeveless, near-black lacquer with thin gold trim at the neckline and armholes.
- Gauntlets: black, fingerless, with gold cuffs. Black wrapped bracers on the forearms.
- Leggings: indigo, fitted. Black slim tassets at the thighs.
- Belt: narrow, gold buckle, at the waist.
- Boots: black, calf-high.
- Scarf: indigo, a soft tail that streams behind the body and snaps on fast moves.

## Face and hair spec

- Skin: pale warm tone.
- Veil: black cloth over the nose and mouth to just below the eyes, with a thin gold stitch on the top edge.
- Eyes: sharp, narrow, dark, under straight black brows. A small cyan glint on each eye when she attacks.
- Hair: straight black, mostly under the hood, one loose strand at the temple.

## Weapon sheet spec

- Twin knives: short, slim, lightly curved dark-steel blades, each no longer than the hand from wrist to fingertip.
  Black wrapped grips, small gold crossguard.
- Right hand: holds the right knife in forward grip, blade angled out.
- Left hand: holds the left knife in forward grip, blade angled out.
- Trails: cyan arcs with a white core. Thrusts leave a short line; crossing slashes leave an arc; the leap leaves a wide arc.
- Grip consistency: the knife stays in the drawn hand; forward grip is the default, and she only reverses to strike from
  behind.

## Combat personality

Balanced and light. She stays on the balls of her feet, moves in short bursts, and blinks between positions. Her stance
is low and coiled, not hunched: the body is balanced and ready, the knives out. Attacks are crisp thrusts and crossing
cuts that flow into the next cut. She is most dangerous when she is not where she was a moment ago.

## Animation notes per standard sheet

- **idle** (stance, footwork): low coiled stance, both knives forward-grip at the hips, blades out. The veil and hood
  stay still, a faint cyan after-image shimmers at the stance's edge.
- **run** (overridden): light, stretched strides with a cyan after-image trailing behind. The scarf streams back.
- **air** (jump, fall): knives forward-grip, knees tucked, the scarf streaming upward, after-images on fast moves.
- **dash** (dodge, dash, heal): the ground dash is a flat blur with a cyan after-image and the scarf snapping back. The
  air dash is the same stretched line through the air. The heal is the potion flask, drunk with the head tipped back.
- **atk-a** (overridden, combo 1 and 2): forward thrust with the right knife, then a quick crossing slash with the left.
- **atk-b** (overridden, finisher and aerial): a leaping double cut as the finisher; a spinning mid-air slash.
- **atk-c** (overridden, plunge and heavy): a feet-first dive with both knives pointed down; the heavy is a whirling
  spin into a flurry of cuts.
- **hurt** (flinch, knockdown, getting up): the veil pulls down with a gasp, the hood is knocked back, the eyes squeeze.
  The knives stay in hand through the fall.
- **art** (Flash Step, see storyboard): the body splits into after-images, blinks, and cuts six times, then settles.
- **misc** (skill throw, taunt, victory): the throw is a single slim knife overhand. The taunt is a knife spun around the
  fingers. The victory is the knives crossed at the chest.
- **ko** (defeat, intro): intro walks in quiet and hooded, salutes with the knives, twirls them once with a cyan trail,
  then settles. Defeat: a stagger, one knee, the knife slips, collapse.

## Rift Art storyboard: Flash Step (54 ticks)

1. Anticipation 1: she sinks low and her figure splits into two cyan after-images.
2. Anticipation 2: the instant before the blink, her body at its lowest, the knives crossed at the hips.
3. Execution 1: the blink. She is a cyan streak across the cell, leaving three after-images behind her, knives crossed.
4. Execution 2: the six-cut flurry. Six cyan arc slashes wrap her body, the knives blur, the after-images trail.
5. Recovery 1: the flurry ends and she lands in a low crouch as the after-images dissolve.
6. Recovery 2: she rises back to the coiled stance, the scarf settling.
