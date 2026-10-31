# Nyx - the Hollow Tide (hero 3, Lancer, Rift Art: Abyss Fang)

## Identity and personality

A calm, distant young man who seems to belong to the sea more than to the arena. He speaks little and watches
everything. The jellyfish spirits around him are the drowned, and he carries them without fuss; they drift about
him, never attack on their own, and their glow is the only warmth in his palette. His spear is "the tide coming in":
patient, long, and then suddenly everywhere.

## Role in the roster

Lancer (`ClassId.Lancer`): fast, long-reaching, the one who pokes from outside your range and closes the gap in a
heartbeat (class speed 1.1, reach 5, backstab 1.5). Nyx sits in the **True** slot. His Rift Art, Abyss Fang, is an
unstoppable lunge across the arena that ignores guards, so his kit is about spacing: stab from outside, then commit.

## Current design assessment

Source: `packages/client/src/render/models/h03-nyx.ts` (in-game pixel model) and `art/characters/h03-nyx/references/portrait.jpg`.

What works and should be kept:
- The concept reads at small size: pale face, black coat, cyan glow in the eyes, two cyan bells beside the body.
- The palette is cold and coherent (navy shell, silver ornaments, cyan glow) and does not compete with the arena.
- The spear is correctly a long, cold, blue-bladed lance, not a sword.

Wrong or weak, to fix in the sprite design:
- The coat is a single dark shell with a collar, so it has little structure: no layered tails, no fold rhythm, and no
  visible silver knot embroidery that the portrait shows.
- The hair is a dark block with a few strands; the portrait's wavy, wind-swept hair with a blue sheen is lost.
- The jellyfish read as two small lamps. They need translucent bells with visible tentacle trails that move with the
  coat.
- The spear head is a plain blade. The sea theme (barbed, wave-curled crest, sea-glass steel, teal fuller) is missing.

## Visual references

Studied by genre trait rather than by copying any single image:
- **BlazBlue-style fighters:** long, flowing coats and hair that make a silhouette from motion alone, with bold clean
  shapes. Take the coat tails and the hair as big moving masses.
- **Guilty Gear-style fighters:** hard-edged cel shadows and angular, sharp highlights on metal. Take the hard light
  split on the silver embroidery and the blade.
- **Melty Blood-style fighters:** clean, fine dark lines and bright, thin weapon trails. Take the thin cyan trail
  streaks and the fine linework on the coat seams.
- **Lionheart approved sheet (house style):** the rendering, proportions, cape motion and blue-white trail language.
  This is the primary benchmark.

Nothing here is copied: Nyx's silhouette is a tall, narrow youth in a split-tail coat with a spear and spirits, and
must never be read as an existing franchise character.

## Silhouette notes

- Tall and narrow. The shoulders are slim, and the coat falls to the knees.
- The coat splits into two long tails at the back: the strongest silhouette element. They must lift and trail in
  every motion.
- The spear is about one and a half times his height. The blade leads the silhouette at the top, and the butt is low.
- The two jellyfish spirits sit away from the body: one high behind the shoulder, one low behind the hip. They are
  part of the silhouette and must not overlap the head or the spear.
- At 150 px tall, the read is: pale head, black coat with two tails, a long blue-white spear.

## Palette (named, hex)

| Name | Hex | Used for |
| --- | --- | --- |
| Midnight slate | `#1c2233` | Coat, main shell (shadow `#10141f`) |
| Abyss black | `#0c0e16` | Deepest folds, boots, under-collar |
| Charcoal tunic | `#232838` | Sleeveless tunic, trousers |
| Tarnished silver | `#a8b4d0` | Coat embroidery, buckles, chain (highlight `#e6ecff`) |
| Pale porcelain | `#e8dcd4` | Skin (cool, pale, no warmth) |
| Night hair | `#1a1a28` | Black hair with blue sheen `#2c3a58` |
| Tide cyan | `#7ae8f5` | Eye glow, jellyfish bells, energy (bright `#9ff4ff`) |
| Sea-slate haft | `#2e3a4e` | Spear shaft, teal inlay `#3aa8c0` |
| Sea-glass steel | `#cfeff5` | Spear blade, glowing teal fuller `#5ccbe0` |

## Costume and armour spec

- **Coat:** long, high-collared midnight-slate coat to the knees. Open front, with a dark charcoal tunic
  underneath. Two long tails at the back, which trail when moving.
- **Embroidery:** tarnished silver chain-like knot patterns along the collar, cuffs and the front panel. Three to four
  tones per silver piece: highlight on the top edges, shadow underneath.
- **Under layers:** charcoal sleeveless tunic, black trousers, black knee-high boots with silver buckles.
- **Belt and chain:** a thin silver chain at the belt, hanging to the hip. A small pendant at the end.
- **Jellyfish:** two translucent cyan bells with long tentacles (3 per spirit), glowing at the bell's edge. They
  are not solid objects; render them as light.

No colour on the coat beyond slate, silver and cyan. No red, no gold.

## Face and hair spec

- **Face:** fine-boned, narrow, sharp cheekbones, long jaw, a calm and distant expression with a slight frown.
- **Eyes:** pale ice-blue with a cyan glow, under heavy black brows. The glow is the only bright spot on the face.
- **Hair:** black, thick and wavy, swept back off the forehead, falling to the shoulders. A few loose strands fall
  across the brow. Faint blue sheen on the top of the hair and in the wave troughs.

## Weapon sheet spec: the sea-spear

- **Length:** about one and a half times his height. Long enough to read as a lance from the first frame.
- **Haft:** dark slate-grey shaft (`#2e3a4e`) with a thin teal inlay line running its length, lit on the top edge.
- **Blade:** long leaf-shaped blade of pale sea-glass steel, with a glowing teal fuller (the groove) down its centre.
- **Crest:** a barbed, wave-curled crest at the base of the blade: two swept barbs, sea-glass coloured.
- **Grip:** the RIGHT hand holds the butt end of the shaft, the left hand grips ahead of the centre of balance for
  thrusts. The grip never swaps hands between frames.
- **Trail colour:** cyan-teal arcs with pale white-blue motes.

## Combat personality

Quiet and deliberate in stance, then fast and direct in attack. He keeps the spear in front of him, uses spacing,
and steps in only to commit. He moves with a light, gliding walk and a long, low run. Heavy in the lunge, light in
recovery. Stance is a slight back lean (the house "calm" carriage).

## Animation notes per standard sheet

- **idle:** a long spear held upright beside the body, blade tilted forward. Breathing is slow. Coat tails and the
  jellyfish drift with each breath. The shoulders barely move.
- **run:** the spear carried upright at the side with its butt low and blade forward above the head. Long, light
  strides; the coat tails stream behind and lag the body by a beat.
- **air:** spear held level, blade forward. Jump take-off is a low crouch with the spear pulled back; apex has the coat
  tails flaring out; the fast fall streams the tails upward.
- **dash (ground):** a low run with the spear couched under the arm, blade forward. Air dash: body stretched forward
  along the spear, tails snapping behind.
- **atk-a (override, thrusts):** combo thrust 1 is a straight two-handed jab at chest height. Combo thrust 2 is a
  low rising thrust, from knee to shoulder height. No diagonal cuts: a lancer's combo is thrusts and sweeps.
- **atk-b (override):** combo finisher is a full body lunge with the spear straight ahead and a big cyan trail. The
  aerial attack is a diving thrust forward and slightly down, not a sweeping slash.
- **atk-c (override):** plunge drives the spear point-first into the ground at impact. The heavy attack is a
  charged lunge: couched under the arm, glow building on the blade, a full straight thrust.
- **hurt:** the standard set. Recoil and the spear arm snapping back. The tails swing forward on the knockdown.
- **art (Rift Art, Abyss Fang):** see the storyboard below.
- **misc:** skill throw flicks a small glowing jellyfish spirit. Taunt turns the spear once in a loop, then a cold
  half-smile. Victory plants the spear point-down beside him.
- **ko:** intro walks in with the spear upright, one flourish, then the low stance. Defeat is the standard
  stagger-to-collapse, the spear slipping from the hand last.

## Rift Art storyboard: Abyss Fang

Six frames, kept inside each cell.

1. **Anticipation 1:** he draws the spear back low under the arm; the jellyfish spirits pull in toward the blade and a
   faint cyan aura starts.
2. **Anticipation 2:** the instant before release. The spear is at its furthest pull-back, the glow at its peak, the
   tails pulled taut behind.
3. **Execution 1:** a fast straight lunge, the spear fully extended, the blade leaving a long cyan wave of sea light.
4. **Execution 2:** the lunge at full force. The wave is widest, the jellyfish stream behind it with their tentacles
   trailing, and the tails fly out.
5. **Recovery 1:** the spear pulled back, the light and the spirits fading into motes.
6. **Recovery 2:** back in the ready stance, the coat settling, the spirits drifting back to their places.
