# Hollowmask (h07), the Grasping Shade

Assassin, Phantom Hand, slot True. Signature weapon: Twin Daggers (`packages/shared/src/weapons.ts`).
Lore line (heroes.ts): "Behind the bone mask there is only the hand - and the hand always finds you."

## Identity and personality

A silent, patient predator. Hollowmask does not posture; he stalks, waits for the opening, and is behind you before the
read is finished. The bone mask gives him no expression, so all of his character has to come through posture, the way the
cloak moves, and the way the spectral claw reacts. He is hunched and unhurried in stance, quick and economical in attack,
and theatrical only in the Art, where the claw takes over.

## Role in the roster

The fastest, lowest-health assassin. Triple jump, two air dashes, quick rolls, and the biggest backstab multiplier
(1.9). His Art, Phantom Hand, is a ground-skimming claw that seizes and crushes, so his silhouette needs a long, pale
reaching shape that no other hero has. Sable (h08) shares the class and the twin-knife weapon, so the two must be
separated by silhouette and by movement, not by weapon: Hollowmask is low, hunched, reverse-grip, and claw-led; Sable is
upright, lithe, forward-grip, and cyan-trailed.

## Current design assessment

Source: `packages/client/src/render/models/h07-hollowmask.ts` (the code comments, the shape and palette setup) and the
portrait `art/characters/h07-hollowmask/references/portrait.jpg`. The in-game pixel model was not rendered for this
review; the notes below come from its code and the portrait.

What the old model gets right:
- The bone-white skull with dark sockets and a teal glow inside them, a cowl over the crown, and a long ragged cloak.
- The hunched, gliding carriage (the lean and crouch offsets in `stance()`).
- A separate pale spectral claw, and mint-teal as the single accent colour.

What it gets wrong or leaves weak:
- The skull is built from flat plates over a dark cowl, so at 150 px tall the face can read as a generic grey head.
  The crack that defines the mask and the teal socket glow need to be readable silhouette and colour, not only detail.
- The claw is a separate "claw" weapon, so the Phantom Hand reads as a prop rather than a hand. Here the left hand IS
  the claw, and it holds the left knife, which keeps grip consistent.
- The rags at the hem are short tapered strips. The cloak should be one long, ragged mass that makes a dark wedge
  behind the body in motion.

## Visual references (described, not copied)

- Premium anime fighting-game sprite art at the level the brief names (BlazBlue, Guilty Gear XX, Melty Blood). Taken:
  crisp dark outlines rather than thick cartoon lines, three to four cel tones per material, a cool rim light, and
  energy effects built from layered arcs with a bright core.
- The approved Lionheart sheet (`art/characters/h00-leon/references/approved-sheet.png`). Taken: the rendering weight,
  the cape and cloth drag on motion frames, and trails that are clean arcs with a white core, not smears.
- Classic masked-assassin silhouette logic (a hood, a long cloth mass, a tiny bright weapon). Taken only as shape
  principles: a dark, hooded, asymmetric outline that stays readable as a single shape.

## Silhouette notes

- Head: a pale, smooth skull shape at the top of a dark cowl. The skull is the lightest mass on the figure.
- Torso and shoulders: rolled forward and narrow, so the body forms a hunched "C" when seen from the side.
- Cloak: one long dark mass from the shoulders to the knees, with ragged tails that trail behind.
- Hands: the right hand is human with a short bone knife; the left hand is a translucent mint-white claw with a knife.
- Overall: a pale head and a dark body with a mint accent. No other roster silhouette should have a bone-white face
  under a black hood.

## Palette

| Name | Hex | Use |
| --- | --- | --- |
| Bone white | #e8e4da | skull mask, knives, buckle highlights |
| Cowl black | #15151b | cowl, cloak core, shadow areas |
| Charcoal armour | #2a2a30 | bodysuit, base of costume (matches armor 0x2a2a30) |
| Pewter trim | #5c5c68 | straps, bracer edges |
| Tattered grey-tan | #6e6456 | cloak hems and worn edges |
| Spectral mint | #7affd0 | Phantom Hand glow and trails (matches accent 0x7affd0) |
| Deep mint | #3fae92 | trail shadows and claw depth |
| Spectral core | #eafff8 | white-hot centre of claw and trail |

## Costume and armour spec

- Bodysuit: charcoal-black, close-fitting, with no bright surfaces except trim.
- Straps and bracers: dark slate-grey leather, buckled at the forearms and thighs; no metal shine except small pewter edges.
- Belt: black, plain, with no ornament.
- Cloak: near-black, long to the knees, torn into ragged tails with grey-tan worn hems. It streams behind on every move.
- Cowl: black, covering the crown and falling to the shoulders with torn edges. It frames the mask and never hides it.

## Face and hair spec

- Mask: smooth bone-white skull; broad brow, flat cheekbones, long narrow jaw. No mouth, no nose line, no skin.
- Eyes: two deep black sockets with a faint teal glow at the back. The glow is the only light on the face.
- Crack: one hairline crack from the left socket to the jaw. Keep it constant across frames.
- Hair: none visible. The cowl is the hair line.

## Weapon sheet spec

- Twin knives: short, slim, slightly curved bone-white blades, each no longer than the hand from wrist to fingertip.
  Black wrapped grips, no crossguard.
- Right hand: human, holds the right knife. Usually reverse-grip, blade along the forearm.
- Left hand: spectral claw, translucent with mint-white fingers, closed around the left knife's grip.
- Trails: mint-teal arcs with a white core. Stabs leave a short line; slashes leave an arc; the heavy leaves a wide arc.
- Grip consistency: the knife is always in the hand that is drawn in the sheet. The claw never drops the knife.

## Combat personality

Low, hunched, and quiet. Footwork is light and steady: he stays in a crouch between attacks, rises only to strike, and
recovers low. His attacks come from below and from behind: lunges, stabs, and reverse-grip slashes. In the air he tucks
and dives. His weight is forward and his cloak drags behind, so every move seems to pull the cloak after him.

## Animation notes per standard sheet

- **idle** (stance, footwork): hunched stance, both knives reverse-grip in front of the body. The claw curls slowly,
  the head tilts between breaths, the cloak sways. No upright posture at any point.
- **run** (overridden): long, low stride with the torso pitched far forward and the head tipped down. Knives tucked at
  the hips. The cloak streams behind as one long mass.
- **air** (jump, fall): knives drawn in reverse-grip, the claw trailing below, the cloak billowing upward.
- **dash** (dodge, dash, heal): the ground dash is a flat glide with the cloak streaming back and the claw stretched
  forward. The heal is the potion flask, drunk head-tipped like the rest of the roster, but the flask hand is the
  human right hand.
- **atk-a** (overridden, combo 1 and 2): reverse-grip stab with the right knife, then a short reverse slash across the
  body with the claw's knife. Compact and fast.
- **atk-b** (overridden, finisher and aerial): a lunging double stab as the finisher; a sweeping downward double slash
  in the air.
- **atk-c** (overridden, plunge and heavy): a head-first dive with both knives pointed down; the heavy is a wide
  overhead sweep led by the spectral claw.
- **hurt** (flinch, knockdown, getting up): the head snaps back, the cowl whips, the claw flickers. The knives stay in
  hand through the fall.
- **art** (Phantom Hand, see storyboard): the claw grows and races along the ground, then closes.
- **misc** (skill throw, taunt, victory): the throw is a single bone knife flicked overhand. The taunt is the beckoning
  claw. The victory is upright, with the claw slowly opening.
- **ko** (defeat, intro): intro walks in slowly and hunched, lifts the claw to the mask, flicks the knives in a
  flourish. Defeat: the crack widens, one knee, then forward.

## Rift Art storyboard: Phantom Hand (40 ticks)

1. Anticipation 1: he lowers to a crouch and the spectral left claw grows long and pale, reaching toward the ground.
2. Anticipation 2: the claw is at full reach, fingers spread, mint light pooled in its palm.
3. Execution 1: the claw races along the ground toward the right edge of the cell, mint trail behind it.
4. Execution 2: the claw closes into a crushing grip, mint motes and light burst from the fingers. The claw stays inside the cell.
5. Recovery 1: the claw loosens and begins to dissolve into drifting mint motes.
6. Recovery 2: he rises back to the hunched stance, the last motes fading.
