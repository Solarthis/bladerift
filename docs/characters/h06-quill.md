# Quill, the Storyteller (hero 6, Caster)

Production document for the sprite overhaul. The character entry that drives generation is `art/characters/h06-quill/character.json`. Portrait: `art/characters/h06-quill/references/portrait.jpg`.

## Identity and personality

Quill is a big, warm, jovial storyteller. He is relaxed and generous with a grin, and he loves an audience. He writes the chapter as he goes, so he never lets a hero die in the wrong chapter, least of all himself. The portrait shows a broad, confident smile and a warm, relaxed manner, with a book open in one hand and a quill in the other.

## Role in the roster

Caster, the mage class: arcane bolts from the staff at range, a charged orb as the heavy, skills recharge twice as fast, and he is fragile if caught (`packages/shared/src/classes.ts`, Caster). His signature weapon is the staff (`WeaponId.Staff`). He is a False-slot fighter (`packages/shared/src/heroes.ts`). His Rift Art is Rewritten Fate: it heals over a quarter of health and empowers every blow for eight seconds. Quill shares the caster role with Lumi, so his silhouette and magic must read completely differently from hers.

## Current design assessment

The in-game pixel model (`packages/client/src/render/models/h06-quill.ts`) gets right: the wild orange curls set back off the face, the ginger beard, the white shirt with rolled sleeves under a brown waistcoat, the watch chain, the charcoal slacks, the quill staff with a feather vane, and the open book glowing gold in the far hand.

It gets wrong or leaves out:
- The model's book is a plain cover with a gold glow. The new spec adds brass corners and a darker oxblood-leather cover, so the book reads as a real object in the hand.
- The waistcoat has two front panels and no sash. The portrait shows a dark waistcoat with a gold chain. The new spec keeps the chain and drops the sash so the upper body reads cleanly.
- The model's quill is a pale shaft with a feather vane. The new spec adds a dark ink-black nib and brass bands, and keeps the feather crown clearly readable above the head in every pose.
- The motion is relaxed and leaning back. The combat sheets need a clearer weight shift forward for the strikes.

The portrait gets right: the ginger curls, the warm grin, the gold-lit book and the golden swirls of light. It is a warm, glowing painting, so the animation must keep the warmth in the colour and the energy, not the painted detail.

## Visual references

Describe, do not copy. These are the kinds of art studied, and what is taken from each:
- Premium 2D fighting-game sprites (Guilty Gear XX, BlazBlue, Melty Blood style): crisp dark lines, cel shading, cloth and hair that follow the motion. Taken: the flying curls and the loose shirt in motion.
- The approved Lionheart sheet (`art/characters/h00-leon/references/approved-sheet.png`): the benchmark for rendering and trails. Taken: the arc trail kept inside the cell, and the one-scale rule.
- Illustrated storyteller and scholar art: a warm, lamplit palette with glowing pages and a book in hand. Taken: the golden light on the pages and the warm tone of the whole costume.

## Silhouette notes

- A broad, round head with a wild mane of curls: the widest part of the top of the silhouette, and clearly different from Lumi's bob.
- A broad torso in a white shirt and brown waistcoat, a wide body against Lumi's narrow coat.
- A tall, pale quill staff with a cream feather crown above the head line.
- The open book at the left hip, a flat rectangle that breaks the outline of the body. Golden light sits on the pages.

## Palette

| Name | Hex | Use |
| --- | --- | --- |
| Ginger-orange | `#f07a2a` | Hair, beard |
| Linen white | `#f6eedb` | Shirt, quill vane |
| Waistcoat brown | `#6a3f22` | Waistcoat |
| Oxblood leather | `#8a2a1a` | Book cover |
| Brass | `#b8862a` | Buttons, book corners, watch chain |
| Pale gold | `#ffd860` | Glowing pages, golden ink |
| Amber glow | `#ffb347` | Ink trails, halo |
| Charcoal | `#2e2a36` | Slacks |
| Ink-black | `#2a1a14` | Nib, boots, eyes |
| Shadow brown | `#4a2a16` | Waistcoat shadow, boot shadow |

## Costume and armour spec

- A loose white linen shirt with full sleeves rolled to the elbow, and an open collar.
- A dark brown leather waistcoat with brass buttons, two front panels, and a gold watch chain across the chest.
- Charcoal slacks tucked into tall brown leather boots with brass buckles.
- No sash, no belt ornament beyond a plain dark belt.
- Costume reads soft and warm: linen, leather and brass, with no hard plates.

## Face and hair spec

- Face: a broad roguish grin, laughing hazel eyes, a tanned face with freckles across the nose.
- Beard: a neat, short ginger beard along the jaw and a moustache.
- Hair: a wild mane of tight ginger-orange curls, voluminous and pushed back off the forehead, falling to the shoulders. A forelock of curls sits above the brow.

## Weapon sheet spec

- A giant quill pen used as a staff, about as tall as his head and shoulders.
- Shaft: pale ivory calamus with gold bands. Base: a dark ink-black nib.
- Crown: a huge cream feather vane with a dark spine, widest about a third of the way up, that spreads like a fan.
- Held in the RIGHT hand at mid-shaft, feather upright at rest. The left hand never holds the staff. The left hand holds the book.
- Left-hand book: a thick open book with an oxblood cover, brass corners and glowing gold pages. Closed in idle and run, open in the attacks and the aerial attack.
- Magic: golden ink and drifting illuminated pages. Trails are amber-gold with white-hot highlights. The charged orb is a sphere of golden ink-light with pages spiralling inside.

## Combat personality

- Stance: relaxed and grounded, a little back-leaning, knees easy. He never looks hurried.
- Footwork: a steady, unhurried walk, with a confident step forward into the strikes.
- Speed and weight: slower than Lumi, heavier on the strikes. The recovery after each strike is a relaxed return to stance.
- Attacks cast from the staff and the book: the combo is golden ink bolts from the nib, the heavy is a golden ink-light orb. He has a theatrical style: the strikes are big, wide and flowing.

## Animation notes per standard sheet

- idle: breathing with the curls bobbing a little. The book stays in the left hand at the hip. The quill stays upright in the right hand. Guard: the staff across the body and the book raised.
- run: a loping, relaxed stride. The book bounces at the left hip and the mane bobs with each stride.
- air: the curls fly upward in the fall and the shirt billows. The book stays clasped at the hip in the apex pose.
- dash: a low, forward burst with the quill tucked along the body and golden speed lines. Dodge roll: the shirt and curls wrap around him in a tight ball.
- atk-a: combo 1 is a sharp forward thrust of the quill with a golden bolt. Combo 2 is a two-handed overhead swing that flings a golden crescent forward and down.
- atk-b: combo finisher is a lunging strike with a huge golden burst. Aerial attack is a swinging mid-air sweep that scatters golden ink and feathers.
- atk-c: plunge drives the nib into the ground, with a burst of golden ink. Heavy attack spirals golden ink and pages into the feather crown to form a glowing orb, then releases it.
- hurt: a stumble back with the book pulled in to protect the chest. Knockdown: the curls spread out on the ground and the book slides clear.
- art (Rewritten Fate): see the storyboard.
- misc: a skill throw with the free hand, a taunt where he twirls the quill like a conductor's baton with a wink, and a victory pose with the open book raised overhead and pages fanning out.
- ko: the intro strolls in with the quill tapped on the ground, lifts it and sweeps the feather crown in a theatrical flourish that scatters gold ink droplets. Defeat: staggers, drops to the knees with the quill slipping, collapses forward, lies still.

## Rift Art storyboard (Rewritten Fate)

Six frames in the art sheet: anticipation 1-2, execution 3-4, recovery 5-6.

1. Anticipation: he opens the book in the left hand, golden pages lifting.
2. Anticipation: he draws a quick stroke in the air with the quill, a golden line hanging in the air.
3. Execution: golden ink and light spiral up around him.
4. Execution: a warm golden aura glows on his body as the wounds close, with pages and ink swirls kept inside the cell.
5. Recovery: the book closes with a soft glow, the quill lowered.
6. Recovery: back in stance, the pages settling around the book.

No legible letters or words anywhere on the sheet.
