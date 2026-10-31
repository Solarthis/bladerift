# Ignis, the Crimson Rider (hero 11)

Production document for the sprite overhaul. Data: `packages/shared/src/heroes.ts` (id 11, Rider, Stampede, roster slot True),
`classes.ts` (Rider: hp 980, speed 1.2, two dashes, reach 4), `weapons.ts` (Reaper Scythe). Character data for the image
pipeline: `art/characters/h11-ignis/character.json`. Identity reference: `art/characters/h11-ignis/references/portrait.jpg`.

## Identity and personality

A young rider who is always leaning toward the next fight. He is eager, a little reckless, and proud of the fire he carries
with him. The lore line ("the ground stays warm for a hundred years") sets the tone: he is heat and motion, not brooding.
His face is confident and quick: golden-amber eyes under a hard brow, a short jaw, a grin that is half challenge.

## Role in the roster

The fast, far-reaching Rider. The Rider class is built on speed, two dashes and reach: he crosses the arena and then pulls
the opponent in with the scythe's third hook. His Rift Art (Stampede) is the mounted charge: he rides a burning warhorse
through the opponent. Among the riders he is the warm, wide one. Ignis and Thornmaw share a class and a weapon, so their
silhouettes and scythes must never read as the same character.

## Current design assessment (in-game pixel model)

Source: `packages/client/src/render/models/h11-ignis.ts`.

Gets right:
- Navy riding coat with gold trim and epaulettes, bone collar lining, gold belt buckle.
- Flame-red hair spiked back off the brow, golden eyes under a dark brow.
- Crimson cape as an accent layer that streams behind him, and coat tails.
- The flame palette on the scythe: iron-red haft with gold bands, orange-and-yellow blade edge.

Gets wrong or weak:
- The scythe blade is a narrow strip (half-width 3.2 units at the heel, tapering to 0.3 at the tip over a 28-unit length).
  At 150 px tall it reads as a flame-tipped pole, not a broad reaping crescent. The hook that defines a scythe is lost.
- The cape is one plain sheet, with no flame-edged or split hem to carry the fire theme.
- The model is static: the flame is only colour, with no sense of heat moving through the silhouette.

Art direction response: the scythe becomes a wide forward-curving crescent of living flame, the cape gets a ragged burning
hem, and the silhouette becomes top-heavy (flame hair, broad shoulders, a crescent in front).

## Visual references

Describe, do not copy. The studied kinds of work:
- Sharp cel-shaded fighting-game anime with flame-like hair in wedge-shaped locks and strong dark line work (take: the
  hair as sharp flame wedges, with the highlight on each tuft).
- Flowing cape and cloth in long trailing arcs with a clear rim light (take: the cape's motion and the coat tails' lift).
- The approved house sheet, Lionheart (`art/characters/h00-leon/references/approved-sheet.png`): the rendering, the
  metal highlights, the cape motion and the weapon trails in bright, layered arcs. The house style is the rule; the
  references only inform the choices.

## Silhouette notes

At 150 px:
- A wide, warm triangle: flame-red hair spikes above, broad navy shoulders with gold epaulettes, the coat tails flaring
  below.
- The cape reads as a dark red edge on the back side.
- The scythe is a big bright orange-gold crescent held in front, the brightest shape in the figure.
- Must not read as Thornmaw: he is wide and warm, she is narrow and cold. No hound appears in his poses.

## Palette (named, hex)

| Name | Hex | Use |
| --- | --- | --- |
| Riding navy | #2C3F80 | Coat, main cloth (shadow side #1C2750) |
| Flame red | #FF4A1A | Hair |
| Crimson cape | #C8241A | Cape, with a dark-gold border |
| Gold trim | #E9B64A | Embroidery, epaulettes, buckle (highlight #FFF0A8, shadow #A8742A) |
| Bone lining | #E8DCC4 | High collar lining |
| Charcoal breeches | #1E2236 | Trousers, undersuit |
| Riding leather | #2A1A12 | Boots (edge gold), gauntlets brown #5A3018 with brass rivets |
| Iron-red haft | #6A2418 | Scythe shaft (shadow #3A1410), gold bands #E9B64A |
| Flame orange | #FF7A1A | Blade heart, weapon trails, sparks (yellow edge #FFE066) |
| Golden eye | #FFD84A | Eyes, the warhorse's glow |

## Costume and armour spec

- Coat: heavy navy riding coat, high bone-white collar lining, GOLD-embroidered front trim, two gold epaulettes over
  rounded shoulder pads, long split coat tails to mid-thigh.
- Under the coat: charcoal breeches, a black leather belt with a round gold buckle.
- Footwear: tall dark-brown riding boots with gold edging.
- Hands: brown leather gauntlets with brass rivets.
- Cape: long crimson cape with a dark-gold border, from the shoulders; the hem is torn into flame-like points.

## Face and hair spec

- Face: a determined, confident face, short jaw, a faint grin when relaxed. Sharp golden-amber eyes under a hard dark brow.
- Hair: flame red, spiked and swept straight back off the brow in tall, sharp tufts that read as fire. Length to the nape
  at the back. Keep the wedge shape the same in every frame.

## Weapon sheet spec: Reaper Scythe, flame form

- Haft: dark iron-red, about 1.3 times his height, bound in gold bands at the grip and below the blade.
- Blade: a broad, forward-curving crescent of living flame. Bright yellow leading edge, orange heart, dark red trailing side.
  The blade is wide and open, not a narrow strip: the crescent is what says "scythe" at 150 px.
- Grip: both hands. RIGHT hand low near the butt, LEFT hand a third of the way up the haft. The blade always leads to the
  right. The grip does not change between sheets, except to let the rear hand slide on the haft during the hook.
- Trails and sparks: ORANGE-GOLD flame, bright yellow sparks at the edge.

## Combat personality

Stance: forward-leaning, chin up, eager to be off. Weight sits forward on the front foot, and the scythe is ready in front
of the body. Footwork is quick and bouncy, with a short stride and a forward lean on the run. Attacks are wide, committed
reaps: the scythe does the reach, so he uses his body to drive each sweep. The third-hit hook is a heavy pull. Weight: fast
on the move, weighty on the swing.

## Animation notes per standard sheet

- idle: scythe held across the body ready, both hands on the haft, flame edge flickering, cape and hair drifting. Breath is
  quick and eager, with shoulders lifted.
- run: the scythe carried low at his right side, blade trailing back and down with its flame. The cape streams back. Long
  forward lean and high knee drive.
- air: legs tucked, the scythe held back over the shoulder on the rise; on the fall the blade swings forward and down.
  Coat tails and cape lift up in the fast fall.
- dash: ground dash with the scythe level at the hip like a lance and a flame streak; air dash body stretched, cape snapping.
- atk-a (combo 1 and 2, wide reaping sweeps): a broad horizontal sweep, then a heavy diagonal reap from over the right
  shoulder. Each sweep leaves an orange-gold arc inside the cell.
- atk-b (combo finisher hook, aerial sweep): the hook swings the flame blade round in a tight fiery arc while the haft is
  pulled to the hip. The aerial is a sweeping slash in front of him.
- atk-c (plunge, heavy): the plunge drives the blade point-first into the ground with a burst of embers. The heavy is an
  upright full-body spin, a wide ring of fire round him.
- hurt: flinches with the scythe kept in both hands; the knockdown lets the scythe slide beside him.
- art (Stampede): see the storyboard.
- misc: taunt is a flourish round the wrist then a pointed blade and a cocky grin; victory is the blade planted up, both hands
  on the haft, a proud smile.
- ko: intro walks in with the scythe over the shoulder, a swing down in a flourish of flame, then the stance.

## Rift Art storyboard: Stampede

The burning warhorse is a dark-iron horse with glowing orange seams, flames pouring from its hooves, a flame mane and tail
streaming back. Seen from the side. It exists only in these six frames.

1. Anticipation 1: Ignis stands with one boot planted and the scythe drawn back low. Embers swirl at his feet. The faint
   flaming outline of a horse's head forms behind his shoulder.
2. Anticipation 2: at the peak, the full burning warhorse rears behind him. He is crouched forward with both hands on the
   haft, the scythe couched under his arm.
3. Execution 1: he is mounted, and the horse gallops right with a fire trail behind it across the cell.
4. Execution 2: the horse at full gallop, the scythe sweeping forward in a flaming arc. A burst of sparks at the right of the
   cell where the trample lands.
5. Recovery 1: the horse slows and breaks into embers. Ignis hauls the scythe back up, sparks drifting.
6. Recovery 2: Ignis back in stance, the scythe resting over his shoulder, a few embers falling.

Everything, horse included, stays inside its cell (512 by 512 at the standard sheet size).
