# Lumi Sorrelle, the Illusionist (hero 5, Caster)

Production document for the sprite overhaul. The character entry that drives generation is `art/characters/h05-lumi/character.json`. Portrait: `art/characters/h05-lumi/references/portrait.jpg`.

## Identity and personality

Lumi is a playful, sly illusionist. She enjoys the gap between what the opponent sees and what is real, and she smiles while she does it. The portrait gives her a calm, knowing look and a light, slightly mischievous mouth. She is small and quick, not frail in attitude: she teases, twirls her staff and keeps her distance. Her Rift Art is Starfall, three falling stars called down on the opponent's position.

## Role in the roster

Caster, the mage class: arcane bolts from the staff at range, a charged orb as the heavy, skills recharge twice as fast, and she is fragile if caught (`packages/shared/src/classes.ts`, Caster: HP 1000, reach 4, speed 3). Her signature weapon is the staff (`WeaponId.Staff`). She is a True-slot fighter (`packages/shared/src/heroes.ts`), and she shares the caster role with Quill, so her silhouette and magic must read completely differently from his.

## Current design assessment

The in-game pixel model (`packages/client/src/render/models/h05-lumi.ts`) gets right: the pastel-pink bob with a fringe and a stray curl that bounces, the violet eyes, the crimson high-collared coat with a white blouse and pink bow, the gold clasp, the pink sigils on both palms and the pink star crystal.

It gets wrong or leaves out:
- The weapon is a slim wand. The new spec is a longer staff with a star crown, so it reads as the same weapon class as Quill's staff and as the Staff of the other casters.
- The coat has a short front and a long hem behind. The model suggests this with `coatTails` only, so the long, flared hem and its swing are not designed in.
- The magic is pink. The brief makes it violet starlight with pink sparkles, so violet becomes the primary colour and pink becomes the accent.
- The bob must stay short, neat and bright, so it never reads as Quill's mane, with an open face around the violet eyes.

The portrait gets right: the pink wavy hair, the crimson coat with gold filigree, the violet eyes, the glowing palms and the circle of starlight. It is a painting of a mage with ribbons of magic, so the animation must carry the same sense of light without copying the painting.

## Visual references

Describe, do not copy. These are the kinds of art studied, and what is taken from each:
- Premium 2D fighting-game sprites (Guilty Gear XX, BlazBlue, Melty Blood style): crisp dark lines, three to four cel tones per material, bright specular on metal, strong motion in cloth and hair. Taken: the cel-shaded coat, the crisp gold trim and the sense of weight in the flared hem.
- The approved Lionheart sheet (`art/characters/h00-leon/references/approved-sheet.png`): the benchmark for rendering, proportion, cape motion and weapon trails. Taken: the trail language (a bright arc kept inside the cell) and the scale rule (same standing height in every frame).
- Anime mage illustration: pastel hair with a dark crimson palette and light magic against it. Taken: the way violet light sits on crimson velvet without muddying it.

## Silhouette notes

- A short, bright bob at the head, with a stray curl on top, so the head reads as one clear shape against the crimson.
- A long crimson coat that flares into a hem behind, with a narrow waist in front. The hem is the largest shape of the body in motion.
- A tall, thin staff held low at the hip, with a star crown above the shoulder line. The staff is the vertical of the silhouette, the coat its diagonal.
- Violet light marks the magic. It must never be the same value as the coat: the coat is dark, the light is pale and bright.

## Palette

| Name | Hex | Use |
| --- | --- | --- |
| Blood-red velvet | `#9e1f33` | Coat body |
| Maroon lining | `#3a1a26` | Coat lining, dark belt |
| Bubblegum pink | `#f7b4de` | Hair, pink sparkles |
| Rose shadow | `#c23c9a` | Hair shadow, pink accents |
| Violet starlight | `#b98cff` | Eyes, magic trails, star crown core |
| Deep violet glass | `#6a3fb8` | Star crown body, orb |
| Tarnished gold | `#b8862a` | Braid, buckles, clasp |
| Ivory | `#f4ecf8` | Staff shaft, white blouse |
| Plum-black | `#2c1a26` | Skirt, boots |

## Costume and armour spec

- Crimson high-collared coat in velvet, cropped at the waist in front, a long flared hem behind, lined in maroon. Tarnished gold braid on the cuffs and the front edge, a gold star clasp at the chest.
- A white ruffled blouse under the coat, with a crimson bow at the throat.
- Plum-black pleated skirt, dark stockings, black knee-high boots with gold buckles.
- Gold filigree cuffs at both wrists. Small violet sigils glow on both palms.
- No armour plates. Lumi wears cloth and velvet, and the costume reads as soft against the rigid staff.

## Face and hair spec

- Face: a sly, half-smile, calm and knowing. Large violet eyes, unshaded and bright enough to read at gameplay size. Pale porcelain skin, small nose, a defined jaw.
- Hair: a short pastel-pink bob, ending at the jaw with the ends curling under. A fringe swept across the brow, kept above the eye line. One stray curl bounces on top of the head. Rose shadows in the hair, bubblegum pink highlights.

## Weapon sheet spec

- A slender ivory staff, a little taller than her head. Gold bands at the grip and below the crown.
- Held in the RIGHT hand, low at the hip, at rest. The left hand joins the shaft only for heavy two-handed strikes (atk-a combo 2, atk-c heavy). The right hand is always the grip hand: it never moves to the top of the shaft by itself.
- The crown is a four-point star crystal of deep violet glass in a gold claw, with a bright pale-violet core. The crown leads every cast.
- Magic and trails: violet starlight with pink-white sparkles. The charged orb is a deep violet sphere with tiny stars inside.

## Combat personality

- Stance: a light, bouncy carriage, a little forward and bent at the knee. Weight on the balls of the feet, the staff held low.
- Footwork: quick short steps and hops. She keeps her distance and reads the opponent, then steps in only to cast.
- Speed and weight: fast on the ground, light in the air, and fragile. Her animations are short and crisp at the start, with a long, floating recovery.
- Attacks cast from the staff, never swung like a blade. Her combo is bolts from the crown. Her heavy is a charged orb, released with the whole body.

## Animation notes per standard sheet

- idle: breathing with the coat hem and the stray curl drifting. The staff stays upright in the right hand. Guard: staff across the body, chin down, the coat tight around the legs.
- run: quick, light strides. The long coat hem swings out behind on every stride. The staff is carried upright in the right hand.
- air: the coat flares and the bob streams upward in the fall. The staff is held back and up in the jump, and the crown is the highest point of the silhouette in the apex pose.
- dash: a low, almost horizontal dash with the staff tucked along the body and violet speed lines. Dodge roll: the coat wraps around her in a tight ball.
- atk-a: combo 1 is a sharp forward thrust with a violet bolt. Combo 2 is a two-handed overhead sweep that flings a violet crescent forward and down.
- atk-b: combo finisher is a lunging thrust with a large starbolt. Aerial attack is a spinning sweep in the air that scatters violet star shards.
- atk-c: plunge drives the staff crown into the ground, with a burst of violet starlight. Heavy attack charges a violet orb in the crown and releases it with a full-body follow-through.
- hurt: a sharp flinch, the staff pulled in to protect the chest. Knockdown: the coat spreads out and the staff rolls clear of the body.
- art (Starfall): see the storyboard.
- misc: a skill throw with the free hand (a small item, thrown forward), a taunt that twirls the staff with a wink, and a victory pose with the staff planted and a star burst orbiting her.
- ko: the intro walks in with the staff trailing, lifts it, spins it in a bright flourish with violet sparks, and settles into stance with the crown raised. Defeat: staggers, drops to the knees with the staff slipping, collapses forward, lies still with the coat fanned out.

## Rift Art storyboard (Starfall)

Six frames in the art sheet: anticipation 1-2, execution 3-4, recovery 5-6.

1. Anticipation: she raises the staff high over her head, violet light gathers in the crystal crown, pink sparkles rise.
2. Anticipation: the crown flares at its peak, three small star shards form above it.
3. Execution: three falling violet star shards streak diagonally down toward the right edge of the cell.
4. Execution: the stars burst into starlight where they land, all inside the cell.
5. Recovery: the staff lowered, the sparkles fade, the coat settles.
6. Recovery: back in stance, the staff upright, a last soft shimmer on the crown.

No letters or symbols on the sheet beyond stars, sparkles and sigils.
