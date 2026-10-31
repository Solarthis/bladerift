# Gorvax, the Chimera Engine (h09, Berserker)

Character file: `art/characters/h09-gorvax/character.json`. Portrait: `art/characters/h09-gorvax/references/portrait.jpg`. Master design (to be generated): `art/characters/h09-gorvax/references/design.png`.

## Identity and personality

Iron, beast and fury stitched into one engine that only knows how to go forward. Gorvax is a chimera: a lion's mane and muzzle, a goat's horns, a serpent's segmented tail, all bolted into riveted iron plating. He does not think in tactics. He grinds forward, takes the hit, and answers it with a hammer the size of his chest. Mood is grim and steady, with flashes of raw roar when Blood Frenzy takes hold.

## Role in the roster

True champion of the Berserker class (slot True), signature weapon the War Hammer (`WeaponId.Hammer`), Rift Art Blood Frenzy (`ArtId.BloodFrenzy`): six seconds in which hits cannot stagger him, he hits harder and recovers faster. Heavy, slow and punishing; the most armoured silhouette on the roster. Counterpart is Mr. Gray (Berserker, False slot), who shares the hammer moveset with a very different body.

## Current design assessment

Old in-game pixel model (`packages/client/src/render/models/h09-gorvax.ts`), read from code, not from a render:

- Gets right: the mane of dark cables with a brass ring on each, the tawny muzzle with fangs, the two red eyes under an iron brow, the shoulder plates with brass rivets, the steam idea, the engine hammer with a glowing red core and a brass band.
- Misses: no horns and no serpent tail are built, although `heroes.ts` lists the `horns` costume. Without them the goat and serpent halves of the chimera are missing. The muzzle is small for the head, so the beast reads more as a plated robot than as a chimera.
- Keep: the mane, the red eyes, the hammer head design. Add: horns, the segmented tail, a larger jaw.

## Visual references

Studied for kind, not copied:

- Heavy armoured brawlers from high-detail anime fighting games: oversized shoulder masses, chunky plate, a low hunched stance that still reads as fast.
- The approved Lionheart sheet (`art/characters/h00-leon/references/approved-sheet.png`) for rendering: cel shading with three to four tones, crisp dark outlines, bright specular highlights on metal, and motion trails kept inside each cell.
- The portrait for the mane, the red-lit lion head with steam, and the riveted plate-over-flesh look.

## Silhouette

At 150 px tall he should read as a wide, low, top-heavy triangle: the shoulder mass and mane at the top, the horns cutting up from the crown, the hammer head as a large block out in front, the serpent tail trailing low behind. He is the widest and lowest body on the roster. Gray is the tallest and thinnest. The two must never read alike.

## Palette

| Name | Hex | Use |
|---|---|---|
| Riveted iron | `#6a6a72` | main armour plates |
| Iron shadow | `#424a5c` | plate shadow and the far side of the hammer block |
| Iron highlight | `#e4e8ee` | specular on plates and the hammer striking face |
| Joint black | `#2a2426` | joints, core, mane base |
| Tawny fur | `#6e5040` | lion muzzle and ruff |
| Tarnished brass | `#c0943e` | mane rings, rivets, hammer collars and band |
| Ember red | `#ff2a2a` | eyes, hammer core, rage glow |
| Dark trim red | `#9a2a1e` | serpent tail links, armour trim |
| Ivory fang | `#d8d0c0` | fangs and horn tips |
| Worn leather | `#3a2622` | harness, belt and straps |

Effects: red-orange embers `#ff3a2a`, steam in pale grey `#d8d0c0` at low opacity.

## Costume and armour spec

- Chest and shoulders: scuffed dark iron-grey plates with brass rivets. Stacked pauldrons, the top plate overlapping the one below.
- Upper arms and forearms: iron plates over dark leather sleeves.
- Harness: black leather straps crossing the chest and a belt with a brass buckle.
- Legs: brass-trimmed iron greaves over black leather, black boots with thick soles.
- Serpent tail: segmented iron links, each edged dull red, trailing from the base of the spine.
- Mane: black riveted cables from the back of the skull to the shoulders, each with a tarnished brass ring.

## Face, head and hair spec

- Lion-like skull: broad, with a tawny muzzle of short fur, a wide mouth opened into a snarl.
- Fangs: long ivory fangs, upper and lower.
- Eyes: two glowing red lamps set deep under a dark iron brow plate.
- Horns: two curved dark goat horns sweeping back from the crown, ivory tips.
- Steam: thin pale steam from the jaw and plate seams.
- Hair: none; the cables of the mane replace it.

## Weapon sheet spec: the engine-hammer

- Shaft: dark iron piston, about as long as his body from hip to head, with two brass collars.
- Head: a squat iron block about as big as his chest, a glowing red core in its striking face, a riveted brass band around the middle.
- Grip: always both hands. Right hand low near the butt of the shaft, left hand above it, the head held out in front. The same grip in every frame; the left hand joins only on the heavy and overhead strikes.
- Scale: the hammer head is the largest single shape on screen during a strike. Keep the shaft line steady so the grip is always visible.

## Combat personality

- Stance: low and forward-leaning, weight on the front foot, hammer ready in both hands.
- Footwork: heavy and deliberate. Short steps, a planted stance between swings. Run is a lumbering, low charge.
- Speed: slow to start, slow to recover, and every hit lands like a collision.
- Weight: the animation should feel like it has mass. Anticipation is big and readable. Recovery is a settle, not a snap.
- Rage: when Blood Frenzy is active the cables glow, the steam pours, and the movement tightens into faster recoveries.

## Animation notes per standard sheet

- **idle** (8 frames): stance and footwork. Mane cables and jaw steam drift with the breath. Hammer head steady. Guard frame: hammer across the body, chin down.
- **run** (8 frames): lumbering strides, body low and leaning forward, hammer carried low in both hands near the ground. Mane and tail bounce with each step.
- **air** (8 frames): jump take-off crouched and heavy. Rising with the hammer back. Falling with the mane streaming up. Wall slide braced on the shoulder.
- **dash** (8 frames): dodge roll is a tight ball, a heavy roll. Ground dash is a low bull charge, hammer tucked at the side.
- **atk-a** (override, 6 frames): two heavy overhead smashes. Combo 1 is a crushing overhead blow, combo 2 a wide horizontal sweep at waist height.
- **atk-b** (override, 6 frames): combo finisher is a stepping overhead slam into the ground with a shockwave of cracked earth. Aerial smash is a sweeping mid-air blow forward and down.
- **atk-c** (override, 6 frames): plunge is a headfirst dive with the hammer pointing down, impact a ground-crushing crouch. Heavy attack is an upward swing rising from low to high, the strongest trail on the roster.
- **hurt** (8 frames): heavy hits snap the head back and bend the body. Launched is a wide flying arc. Get-up is slow and deliberate: one knee, then up into the guard.
- **art** (6 frames): Blood Frenzy storyboard below.
- **misc** (8 frames): skill throw, taunt and victory.
- **ko** (8 frames): intro and defeat (see below).

## Overrides made in character.json

- `atk-a`, `atk-b`, `atk-c` rewritten for the hammer: the standard frames describe sword slashes and diagonal cuts, which do not fit a hammer. Frame order and meaning are kept (combo 1 and combo 2 in atk-a; finisher and aerial in atk-b; plunge and heavy in atk-c), frame count and grid are unchanged.

## Rift Art storyboard: Blood Frenzy

1. Anticipation: he roars, the mane cables glow red-hot, steam bursts from every plate seam.
2. Anticipation: a crimson rage aura erupts around him, eyes blazing, hammer raised.
3. Execution: he slams the hammer down and a huge red shockwave of rage bursts outward, kept inside the cell.
4. Execution: full frenzy, hammer high, crimson embers swirling around him, kept inside the cell.
5. Recovery: the aura fades into steam.
6. Recovery: he stands tall with the hammer on his shoulder, still faintly glowing.

## Intro and defeat

- Intro: lumbers in with the hammer lowered, raises it onto his shoulder and roars, swings it round in a flourish and slams the butt into the ground, settles into a low stance.
- Defeat: staggers from the final blow, drops to one knee with the hammer slipping, collapses forward, lies motionless with the cables spread out.
