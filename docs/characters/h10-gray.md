# Mr. Gray, the Faceless (h10, Berserker)

Character file: `art/characters/h10-gray/character.json`. Portrait: `art/characters/h10-gray/references/portrait.jpg`. Master design (to be generated): `art/characters/h10-gray/references/design.png`.

## Identity and personality

A polite stranger in a grey coat. Then the fog rolls in and nobody remembers his face. Mr. Gray is composed, courteous and unhurried: the gentleman who tips his cap before he hits you. Nothing about him is loud until the fog takes him, and then he is gone. His menace is manners.

## Role in the roster

False champion of the Berserker class (slot False), the same hammer moveset as Gorvax, signature weapon the War Hammer, remapped to a black baton. Rift Art Grim Fog (`ArtId.GrimFog`): he vanishes into fog for five seconds, unseen by the opponent, and the first blow out of the fog crits. He is the mobile, stealthy Berserker where Gorvax is the wall.

## Current design assessment

Old in-game pixel model (`packages/client/src/render/models/h10-gray.ts`), read from code, not from a render:

- Gets right: the dark greatcoat panels flaring to mid-calf, the cape over the shoulders, the turned-up collar, the brass buttons and buckle, the peaked cap with a brass badge, the long black baton with a brass butt cap, and the fog puffs trailing behind the head.
- Misses or off-brief: the model adds a dark moustache that the portrait does not show. Its face is a flat pale mask rather than a face dissolving into fog at the edges. The fog is a trail behind the head, not a body that fades.
- Keep: the coat, cap, baton and fog trail. Remove: the moustache. Change: the fog should eat the face's edges and the body should be able to thin into a cloud.

## Visual references

Studied for kind, not copied:

- Dark gothic-tailored gentleman designs: long greatcoats in charcoal with one ornament colour (brass), tall peaked headwear, a single decorative accent per garment.
- The approved Lionheart sheet (`art/characters/h00-leon/references/approved-sheet.png`) for rendering: crisp dark outlines, cel shading, metal highlights on the brass and the baton, weapon trails kept inside each cell.
- The portrait for the cap, the buttons, the watch chain, and the grey fog wrapping the figure.

## Silhouette

At 150 px tall he should read as a tall, narrow vertical: the cap peak at the top, a straight coat to mid-calf, the cape edge at the shoulders, the baton as one thin diagonal line. Nothing wide. Gorvax is the widest body on the roster; Gray must stay the tallest and slimmest, and his coat hem must always read as a flared vertical.

## Palette

| Name | Hex | Use |
|---|---|---|
| Greatcoat charcoal | `#343a48` | coat panels, cape |
| Coat shadow | `#1c1e24` | belt, coat folds, cap crown |
| Deep black | `#101216` | cap band, gloves, boots, visor |
| Tarnished brass | `#c09a4a` | buttons, badge, buckle, butt cap, watch chain |
| Pale skin | `#e6dcd2` | face and hands showing at the cuffs |
| Fog grey | `#b4bcc8` | fog, edges of the face, trail |
| Cool steel | `#c8d0e0` | baton highlights, cool glints |
| Shirt bone | `#e6e8ec` | shirt collar at the throat |
| Baton black | `#363b48` | baton body, lacquered |

Effects: silver-grey fog, pale grey-white `#dde4f0` cores, cool white glints.

## Costume and armour spec

- Greatcoat: long charcoal, to mid-calf, high turned-up collar, a double row of tarnished brass buttons down the front.
- Cape: a short cape over the shoulders, the same charcoal, lifting with motion.
- Waistcoat and belt: a black leather belt with a brass buckle; a thin brass watch chain across the waistcoat.
- Trousers and boots: dark charcoal trousers, polished black boots.
- Gloves: black leather, both hands.
- Shirt: a pale collar at the throat.

## Face, head and hair spec

- Face: pale, angular and smooth, half-shadowed under the cap peak. Calm narrow grey eyes, a faint polite half-smile. No moustache.
- Fog: the cheeks and jaw dissolve at their edges into drifting grey fog, the effect denser toward the back of the head.
- Cap: black peaked cap, dark charcoal crown, black band, a tarnished brass cog-and-star badge at the front.
- Hair: none visible; it is hidden under the cap.

## Weapon sheet spec: the baton-cudgel

- Shape: a long black lacquered baton, about as long as his forearm and upper arm together.
- Head: a heavy ridged black-steel head, the weight at the striking end.
- Butt: a brass cap at the far end.
- Grip: a black leather-wrapped grip low on the baton. The right hand always holds the grip. The left hand joins only on the heavy strikes, the same way Leon's left hand joins his sword.
- Scale: smaller than Gorvax's hammer in mass, but the same length of reach. The head is the only heavy part; the shaft is slim.

## Combat personality

- Stance: upright and composed, a slight forward lean, the baton held low at the right side. He is never hunched.
- Footwork: measured and precise. Unhurried walk, a long stride in run, quick clean steps out of a swing.
- Speed: his swings are slower to wind up than a sword but still crisp. Recovery is a controlled settle.
- Weight: the baton is heavy; the coat is light and swings. The contrast of a heavy head on a slim body is the feel.
- Fog: when Grim Fog is active the body thins, the outline softens, and the attacks come out of fog clouds.

## Animation notes per standard sheet

- **idle** (8 frames): stance and footwork. Coat and cape sway with each breath, fog drifts from the face edges and glove cuffs, baton steady in the right hand. Guard frame: baton across the body, chin down, the composed look held.
- **run** (8 frames): long, unhurried strides, upright, the long coat swinging wide behind him on each step, cape lifting. Baton carried low at the right side.
- **air** (8 frames): the coat and cape billow upward in every airborne frame. Jump take-off is a crisp, neat crouch. Falling and fast fall keep the coat streaming up. Wall slide braced one-handed on the left.
- **dash** (8 frames): dodge roll is a tidy roll, the coat wrapping around. Ground dash is a low, fast glide with faint fog behind. Air dash stretches forward with the coat snapping behind.
- **atk-a** (override, 6 frames): two heavy baton blows. Blow 1 is a crushing downward strike, blow 2 a wide, precise sideways sweep. Both are controlled, not frantic.
- **atk-b** (override, 6 frames): combo finisher is a stepping overhead slam into the ground with a shockwave of grey fog. Aerial blow is a sweeping mid-air strike with a silver fog arc.
- **atk-c** (override, 6 frames): plunge is a headfirst dive with the baton pointed straight down, the coat streaming up. Heavy attack is a full-power diagonal overhead blow with a huge grey-silver fog arc.
- **hurt** (8 frames): the cap is knocked askew on a heavy hit; the body bends back, the coat flaring. Launched: arms out, the coat trailing. Knocked down: the cap falls off the head onto the ground. Get-up is composed, one knee then straight up, cap straightened.
- **art** (6 frames): Grim Fog storyboard below.
- **misc** (8 frames): skill throw, taunt and victory (see below).
- **ko** (8 frames): intro and defeat (see below).

## Overrides made in character.json

- `atk-a`, `atk-b`, `atk-c` rewritten for the baton-hammer: the standard frames describe a sword's slashes and diagonal cuts. Frame order and meaning are kept, frame count and grid are unchanged.
- Sheet notes added for `idle`, `run` and `air` so the long coat and cape read through the motion.

## Rift Art storyboard: Grim Fog

1. Anticipation: he tips his cap and fog coils around his boots and coat, his outline softening.
2. Anticipation: his body dissolves at the edges into dense swirling grey fog, only the cap and baton still clear.
3. Execution: he has vanished into a thick grey-white fog cloud that bursts outward, a faint coat silhouette and a brass glint showing inside it.
4. Execution: the cloud at full spread, a blurred shape and a silver fog ring, kept inside the cell.
5. Recovery: the fog thins and he reforms, cap and baton visible.
6. Recovery: he stands upright again, straightening his coat as the fog disperses.

## Taunt, victory, skill throw, intro and defeat

- Skill throw: from inside his coat he takes a small black smoke canister and throws it forward underhand.
- Taunt: tips his cap with a polite half-smile, then taps the baton lightly against his gloved palm.
- Victory: sets the baton upright in front of him like a cane, straightens his cap, a calm and pleased look as fog curls around his boots.
- Intro: walks in at an unhurried pace with the baton lowered behind his back, raises it before his face in a courteous salute, flicks it in a neat flourish, settles into a composed stance with fog at his feet.
- Defeat: staggers from the final blow, the cap slipping, drops to his knees with the baton slipping from his hand, collapses forward, lies motionless with the cap beside him.
