# Thornmaw, the Black Hound (hero 12)

Production document for the sprite overhaul. Data: `packages/shared/src/heroes.ts` (id 12, Rider, Night Hunt, roster slot
False), `classes.ts` (Rider), `weapons.ts` (Reaper Scythe). Character data for the image pipeline:
`art/characters/h12-thornmaw/character.json`. Identity reference: `art/characters/h12-thornmaw/references/portrait.jpg`.

## Identity and personality

A quiet young woman who keeps her distance and says little. The lore line sets the contrast: "a quiet girl and the colossal
shadow that follows her. Only one of them is gentle." She is calm, watchful and not unkind, but the hound is what she
unleashes when she chooses to. Her expression is downcast and unsmiling, with a faint, unsettling half-smile in the taunt.

## Role in the roster

The second Rider: the same speed and reach as Ignis, but a narrow, precise fighter. Her scythe is the tight, quick
counterpart of his wide sweeps: she reaps low and fast, and her third-hit hook drags the opponent in. Her Rift Art (Night
Hunt) is the leap with the shadow hound, a two-body slam. The hound is her one companion, and it appears only in that Art.

## Current design assessment (in-game pixel model)

Source: `packages/client/src/render/models/h12-thornmaw.ts`.

Gets right:
- Short brown hair with a stray tuft, a dark cloak, the red scarf and the bronze chains: the portrait's costume reads clearly.
- The violet glow (eyes and the scythe's edge) ties her to the Night Hunt colour.
- The thorned blade: the edge bites out at intervals, which is the right idea for a thorn scythe.
- Size 0.88 with slimmer chest and limbs: the slight build is already there.

Gets wrong or weak:
- The hound is built into her chest frame and drawn in every pose, at her back, larger than she is. It competes with her
  silhouette at small size, hides her body reading and makes every attack look as if it has a second body. This is the
  biggest problem.
- The blade is narrow (half-width 3.2 units at the heel) and dark, so at 150 px it can vanish against the dark cloak.
- The cloak has no hem shape, so the lower body is a dark mass with little read.

Art direction response: the hound moves out of the standing poses and into the Night Hunt only. Her silhouette becomes a
narrow, tapering column with a ragged hem and a long thin blade with violet thorn glints. The hound is kept as a designed
inset for identity, so the Art sheet can draw it consistently. The owner should decide whether the in-game model keeps the
always-on hound or follows this change (the model is not edited here).

## Visual references

Describe, do not copy. The studied kinds of work:
- Dark, angular fighting-game characters with hard cel shading and deep shadow, and sharp weapon edges that catch light
  (take: the thorned blade as a serrated silhouette with a light-catching edge).
- Hooded and cloaked figures with a ragged, layered hem that moves on each step (take: the cloak's torn lower edge and its
  swing).
- Shadow and smoke as an effect layer, not a solid body (take: the hound and the Night Hunt smoke as translucent,
  dark-violet forms with a bright edge).
- The approved house sheet, Lionheart (`art/characters/h00-leon/references/approved-sheet.png`): rendering, line work,
  proportion and motion trails. The house style is the rule; the references only inform the choices.

## Silhouette notes

At 150 px:
- A narrow vertical column: short hair and a tight head, a tapering dark cloak to a ragged hem, the chains as thin lines
  across the chest.
- The scythe is a long, thin diagonal line, with violet glints along the thorns. It is tall, about her head and shoulders.
- Distinct from Ignis: she is narrow and cold, he is wide and warm. No hound appears in her standing or attacking poses, so
  nothing competes with the figure. The hound is seen only in the leap.

## Palette (named, hex)

| Name | Hex | Use |
| --- | --- | --- |
| Charcoal-violet cloak | #3A3040 | Cloak (shadow #1C1826, lit edge with a violet tint) |
| Plum-black coat | #1A1420 | High-collared coat, belt and knee guards |
| Violet glow | #B07AFF | Thorn glints, scythe edge, Night Hunt energy, the hound's eyes |
| Smoke-black steel | #0C0A12 | Blade core and haft shadow |
| Thorn-blade mid | #3A3050 | Blade body and the cloak's lit side |
| Short brown hair | #6A4A30 | Hair (lit #8A6A4A) |
| Scarf red | #9A2A2A | Wool scarf at the throat |
| Bronze chain | #A07A40 | Chains and buckles |
| Boot brown | #2A1E18 | Ankle boots, worn buckles |
| Hound shadow | #2A2238 | The Night Hunt hound body, with a violet sheen on its lit edge |
| Pale skin | #F2C8A8 | Face and hands |

## Costume and armour spec

- Cloak: long dark charcoal-violet hood and cloak over a plum-black high-collared coat. The cloak hem is ragged and reaches
  the calves; the hood rests back on her shoulders.
- Scarf: deep red wool, wound at the throat.
- Chains: heavy bronze chains with dark iron links, crossing the chest diagonally and looping at the hip.
- Under: black leather trousers, dark brown ankle boots with worn bronze buckles, black fingerless leather gloves.

## Face and hair spec

- Face: pale, calm and downcast, deep-set dark eyes with a faint violet tint, a small straight nose, a tight unsmiling mouth.
- Hair: short and tousled, brown, side-swept with one stray tuft over the ear, ending at the jaw. The head reads small and
  tight under the hood.

## Weapon sheet spec: Reaper Scythe, thorn form

- Haft: black, bramble-wrapped dark wood, studded with tiny thorns. About as tall as her head and shoulders.
- Blade: a narrow, sickle-thin crescent of smoke-black steel. The inner edge is serrated with thorn-like points that glow
  violet. It is thinner than Ignis's blade and reads as a curved line, not a broad plane.
- Grip: both hands. RIGHT hand low on the haft, LEFT hand high near the blade's neck. The blade always leads to the right.
- Trails and smoke: VIOLET-PURPLE arcs with dark drifting wisps. The thorns light up on the strike and fade on recovery.

## Combat personality

Stance: small and calm, head bowed a little, shoulders settled, weight light. She moves with quick, economical footwork and
keeps her body close to the scythe. She is not a heavy swinger: her attacks are fast, low reaps. The third-hit hook is a
long drag that pulls the opponent to her. Weight: light on the feet and quick on the swing; a precise fighter, not a big one.

## Animation notes per standard sheet

- idle: the scythe planted butt-first beside her right foot, the haft leaning on her left shoulder, the blade curving up
  over her head. Head bowed, the cloak swaying with the breath. No hound.
- run: scythe over the left shoulder with the blade trailing behind, light fast steps, cloak and chains swinging.
- air: the scythe pulled in close while rising; on the fall it drops point-first beside her. The cloak lifts with the fall.
- dash: ground dash with the scythe tucked under the arm, the blade trailing violet smoke; air dash with the body stretched
  and the scythe close.
- atk-a (combo 1 and 2, quick low and high reaps): a low horizontal reap at waist height, then a fast diagonal reap down
  from overhead. Each cut leaves a thin violet arc inside the cell.
- atk-b (combo finisher hook, aerial dive-slash): the hook is a long drag that sweeps back to her hip with a tight violet arc.
  The aerial is a dive-slash in front, body tucked round the haft.
- atk-c (plunge, heavy): the plunge drives the blade down with dark shards and violet dust. The heavy is a tight, fast
  low spin skimming the ground: a violet blur, not an upright spin.
- hurt: a sharp flinch with the scythe kept in hand; the knockdown lets the haft slide beside her.
- art (Night Hunt): see the storyboard.
- misc: taunt lifts the scythe one-handed and turns the blade once above her head, then a quiet half-smile. Victory: the
  scythe planted butt-first, both hands on the haft, the head bowed.
- ko: intro walks in slowly with the scythe dragging, lifts it to the shoulder, one quick flourish, then the stance.

## Rift Art storyboard: Night Hunt

The shadow hound is a large dark wolf-hound made of shadow and smoke, with violet glowing eyes and a violet sheen on its lit
edge. Its shoulder height is about her head height. It appears only in these six frames, at her side. The hound is also
drawn once as an identity inset on the design sheet.

1. Anticipation 1: Thornmaw is crouched low with the scythe planted. The hound's dark shape forms as smoke beside her, and
   violet motes rise.
2. Anticipation 2: at the peak she is coiled to leap, the hound fully formed at her side with its eyes lit, the scythe held
   back.
3. Execution 1: both launch. Thornmaw is mid-leap with the scythe raised, the hound bounding beside her toward the right,
   dark shadow trails behind them.
4. Execution 2: the slam. Hound and Thornmaw come down onto the opponent, the scythe driven point-first into the ground. A
   dark shockwave and violet cracks spread across the floor.
5. Recovery 1: the hound breaks into dark smoke. Thornmaw pulls the scythe out of the ground, violet shards floating.
6. Recovery 2: Thornmaw rises back into a calm stance, the hound's last violet eye fading to nothing.

Everything, hound included, stays inside its cell (512 by 512 at the standard sheet size).
