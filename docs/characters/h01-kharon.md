# Kharon, the Chainbound (h01-kharon)

## Identity and personality

A giant hunter bound by a curse he cannot cut. Every arrow he looses is a debt repaid, so he rarely shoots for sport and never wastes a shot. Grim, patient and heavy in presence, he does not boast; the chains on his chest say more than he does. The taunt is the proof: he snaps an arrow across his knee, a debt paid off in front of you.

## Role in the roster

Hero 1, Archer class, Rift Art **Serpent Rain** (`ArtId.HailOfArrows`, 30 ticks): a volley skyward that rains back down around the opponent. Signature weapon: the Hunter Bow (`WeaponId.Bow`). Class stats: hp 1020, dmg 1.12, speed 1.12, reach 5, power 3. He is the bruiser of the two archers: big, slow to turn, hard to push off the ground, dangerous at range.

## Current design assessment

Old in-game model (`packages/client/src/render/models/h01-kharon.ts`):
- **Right:** the hunched, towering giant read; long matted hair and beard; rust-bound chains across the chest and arms; the ragged red sash; the great black bow with rust-bound tips; amber glowing eyes; the scars as dark weals.
- **Wrong:** the body reads as a sturdy pixel mannequin rather than a massive, living figure; the bow is a flat dark shape with little sense of recurve or lacquer; the chains are small rings rather than a heavy chain with weight; the sash is a single red band, not a torn, streaming cloth; the overall result is not yet the premium, detailed look of the Lionheart benchmark.

Portrait (`art/characters/h01-kharon/references/portrait.jpg`):
- **Right:** scarred, bare, massive torso; matted black hair past the shoulders; black beard; amber eyes under a heavy brow; chains crossing the body; a red cloth over one shoulder; a black bow behind him against an ember-lit sky.
- **Keep:** the chains, the red sash, the amber eyes and the black bow. These are the identity.

## Visual references

Describing what is studied and what is taken; nothing is copied.
- **Lionheart approved sheet (house style):** cel shading in three to four tones, bright specular on metal, detailed cloth that streams with motion, and weapon trails that stay inside the cell. Taken as the rendering standard.
- **Guilty Gear XX-style sprite work:** heavy, confident silhouettes and exaggerated, weighty poses on the strike frames. Taken for the strike poses of the arrow shots and the power shot.
- **BlazBlue-style layered costume detail:** chains, straps and weathering read as separate materials. Taken for the chain and leather layering.
- **Melty Blood-style crisp combo frames:** each attack frame reads clearly at small size. Taken for the readability of the draw-release-recover shots.

## Silhouette notes

- Hunched, broad, top-heavy: the shoulders carry the silhouette forward, the head lower than a normal fighter's.
- The greatbow stands upright in front of him as a tall dark arc, nearly the height of his body. This is the single largest readable shape on screen.
- The chains are a diagonal line across the chest; the sash is a torn streamer out the back. Both must read against the dark bow.
- Long matted hair falls past the shoulders and breaks the outline at the back.

## Palette

| Name | Hex | Use |
|---|---|---|
| Weathered tan | `#a06c4e` | Skin (shadow `#6e4429`, highlight `#c08a66`) |
| Matted black | `#2a2530` | Hair, beard, brow (shadow `#15121a`) |
| Lacquer black | `#1e1a20` | Greatbow horn, arrows |
| Rust iron | `#8a5a34` | Chains, rust-bound tips (shadow `#5a3620`) |
| Dull bronze | `#b88a5a` | Chain links, fletching highlight |
| Blood red | `#a3202a` | Ragged sash (shadow `#6a1420`) |
| Leather brown | `#4a3020` | Straps, sash ties, quiver |
| Ember amber | `#ffa040` | Eyes, arrow trails, glow (core `#ffd08a`) |
| Ash grey | `#6b6470` | Smoke trails |

## Costume and armour spec

- **Torso:** bare, muscular, scarred. Raised dark weals across the chest and arms.
- **Chains:** heavy rusted iron-brown links with dull bronze highlights; one run diagonal across the chest from the left shoulder to the right hip; wrapped round both forearms.
- **Sash:** a ragged blood-red cloth hung over one shoulder, streaming and torn at the hem in strips down the back.
- **Lower body:** black-brown leather loincloth and trousers; dark leather hip straps; black-brown boots with a worn look.
- **No armour plates.** The chains and leather are the protection.

## Face and hair spec

- Gaunt, weathered face; heavy black brow over deep-set glowing amber eyes; a short black beard.
- Hair: long, matted black, falling past the shoulder blades in heavy clumps, darker at the roots. No neat part.

## Weapon sheet spec

- **Weapon:** the Hunter Bow, drawn as a huge black greatbow.
- **Shape:** a recurve of black lacquered horn on a blackened iron riser; a thick dark sinew cord; rust-bound tips; the bow nearly the height of his body.
- **Hand and grip:** held upright in front of him in the **LEFT** hand at the wrapped grip (the leading hand). The **RIGHT** hand draws the cord back to the cheek. This never swaps.
- **Arrows:** black shafts with bronze-brown fletching, carried in a hip quiver.
- **Trails and effects:** ember amber streaks with ash-grey smoke and orange-red sparks.

## Combat personality

- **Stance:** hunched and wide, the weight low and centred; the bow upright in front like a shield he can also shoot from.
- **Footwork:** deceptively quick for his size, though heavy in impact. Long loping strides and a hard stop; chains clink on every step.
- **Speed:** the Archer speed bonus shows as quick draws and fast recoveries, not as a light, dancing run.
- **Weight:** every shot is a committed lunge into the release. The volley and the power shot look like a man throwing his whole frame into the string.

## Animation notes per standard sheet

- **idle:** bow upright in the left hand, right hand empty and relaxed; the chains and sash drift with the breath.
- **run:** heavy loping stride, bow tilting with each step, chains swinging on the chest, sash streaming behind.
- **air:** bow stays in the left hand; chains and sash fly upward in the rising and falling frames.
- **dash:** a low, fast forward burst with the bow held low and the chains flat against the chest.
- **skid:** braking hard with the bow swung back slightly, the sash flaring forward.
- **landing / crouch / guard:** the bow held across the body in guard; the crouch brings the bow low like a hunter in cover.
- **hurt:** a big, heavy flinch; the bow jerks back in the left hand; the chains snap outward.
- **knocked down / get up:** falls back heavily; he rises onto one knee using the bow as a support.
- **ko (intro):** walks in hunched and slow, bow dragged by its grip; raises the bow, draws and nocks one arrow, flourishes the bow, settles.
- **misc (victory):** plants the bow butt-first and lifts his head to the sky, chains and sash settling.

## Attack sheets (arrow shots)

- **atk-a, combo strikes 1 and 2:** two arrow shots. Strike 1: a draw, a sharp release with an ember streak, a recovery. Strike 2: a faster second draw and a shot forward and slightly downward.
- **atk-b, combo finisher and aerial:** the finisher is a full draw and a three-arrow fan volley with the body lunging into it; the aerial is a shot fired down and forward from the air.
- **atk-c, plunge and heavy:** the plunge is a downward shot, the arrow driven into the ground on impact with a burst of cinders; the heavy is a fully drawn power shot with a large ember comet.

## Rift Art storyboard: Serpent Rain

1. **Anticipation 1:** he draws the greatbow up toward the sky, cord at the cheek.
2. **Anticipation 2:** the instant before release, the arrowhead blazing ember-amber, power at its peak.
3. **Execution 3:** a volley of arrows loosed skyward, shafts curving back toward the centre of the cell.
4. **Execution 4:** a serpentine coil of ember arrows and smoke drops down around the target spot near the right of the cell.
5. **Recovery 5:** the bow lowered, the embers fading to ash.
6. **Recovery 6:** back to stance, the bow upright in the left hand.

All effects stay inside each cell.
