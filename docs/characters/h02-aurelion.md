# Aurelion, the Gilded Sovereign (h02-aurelion)

## Identity and personality

A king who owns every treasure ever forged and lends them to his foes, point first. Arrogant, poised and amused by his own power: chin up, half-smile, heavy-lidded crimson eyes that look down on the opponent. He does not hurry. Everything he does is a display, and he expects to be watched.

## Role in the roster

Hero 2, Archer class, Rift Art **Vault of Ages** (`ArtId.VaultOfAges`, 50 ticks): rift portals open behind him and fire a storm of legendary weapons. Signature weapon: the Hunter Bow (`WeaponId.Bow`), here as an ornate golden bow. Class stats: hp 1020, dmg 1.12, speed 1.12, reach 5, power 3. He is the precise, regal archer: lighter than Kharon in frame and more controlled, a striker who keeps his distance and lets the treasure do the work.

## Current design assessment

Old in-game model (`packages/client/src/render/models/h02-aurelion.ts`):
- **Right:** long golden hair slicked straight back; ornate gilded pauldrons with spikes; a high gilded gorget with collar spikes; half-lidded eyes that glow crimson; a golden bow with sun finials; the chin-up, regal lean.
- **Wrong:** the crimson cape streaming from the shoulders makes him read as a second Lionheart (golden hair, gold armour, a long red cape). This is the biggest risk on the roster and must be fixed. The armour is a single ivory-and-gold shell, so the plate lacks the layered detail of the benchmark. The bow reads as a flat shape and does not show the portal motif.

Portrait (`art/characters/h02-aurelion/references/portrait.jpg`):
- **Right:** golden hair, long and straight; crimson eyes; ornate gold plate with a crimson lining; chin lifted; golden oval rift frames with castle spires behind him.
- **Keep:** the slicked-back golden hair, the crimson eyes, the gilded plate and the oval golden rift frames. These are his identity.
- **Change:** the portrait's crimson lining is kept as an inner edge of a black mantle, not as a long crimson cape, so he stays distinct from Lionheart.

## Visual references

Describing what is studied and what is taken; nothing is copied.
- **Lionheart approved sheet (house style):** the rendering standard: three to four tone cel shading, bright metal highlights and cloth that follows motion. Taken as the baseline.
- **Guilty Gear XX-style sprite work:** sharp, regal silhouettes and poses that hold their line. Taken for the held, arrogant poses.
- **BlazBlue-style layered detail:** many separate gold pieces read as an ornate whole. Taken for the gilded gorget, pauldrons and skirt of lames.
- **Melty Blood-style crisp combo frames:** clean, readable attack frames at small size. Taken for the clean draw-and-release shots.

## Silhouette notes

- Tall and straight, the opposite of Kharon's hunch: the chin and the chest lead.
- Sharp gold pauldrons and the high gorget with its two spikes form a crown-like top edge.
- The bow is extended forward at chest height, slimmer than a greatbow, with sun finials on the tips.
- The black mantle hangs behind him and flares with its crimson lining; this is the only red in the silhouette.
- The long golden hair falls straight to the waist with no fringe.

## Palette

| Name | Hex | Use |
|---|---|---|
| Gilt gold | `#e8b84a` | Plate, gorget, pauldrons (shadow `#8a6218`, highlight `#fff0b0`) |
| Ivory-cream | `#f4ead0` | Enamel panels (shadow `#b89a52`) |
| Plum black | `#2a1a24` | Undersuit, trousers, mantle outside |
| Crimson silk | `#9a1a2a` | Mantle lining, centre plate enamel (highlight `#d02a3a`) |
| Pale gold hair | `#f2d890` | Hair (shadow `#b89a52`) |
| Fair skin | `#f2d2b0` | Skin (shadow `#c89878`) |
| Crimson eye | `#d02a3a` | Eyes, glow |
| Rift gold | `#ffd24a` | Energy, portals, trails (white-hot core `#fff6c9`) |

Leon uses silver, navy, ivory and a crimson cape. Aurelion's plate is gold on plum-black, with crimson only inside the mantle.

## Costume and armour spec

- **Gorget:** a high gilded gorget rising behind the neck with two spikes past the head.
- **Pauldrons:** sharp, swept-back gold pauldrons ending in points.
- **Cuirass:** a fitted breastplate of ivory-cream enamel with gilt edges and a crimson enamel centre plate.
- **Gauntlets:** gold, with knuckle points.
- **Skirt and legs:** a skirt of gold lames over plum-black trousers; polished gold greaves with pointed toes.
- **Mantle:** a black velvet mantle from the shoulders, lined inside with crimson silk that flashes as it moves.
- **No tabard, no full cape.**

## Face and hair spec

- Fair, flawless face; sharp cheekbones; a faint disdainful half-smile.
- Eyes: heavy, half-lidded, crimson, glowing faintly.
- Hair: long, pale golden, slicked straight back from the brow with no fringe, smooth and silken, falling to the waist.

## Weapon sheet spec

- **Weapon:** an ornate golden recurve bow of gilded bronze, slimmer than a greatbow, about as tall as his head and shoulders.
- **Details:** sun-disc finials on both tips; a pale gold cord; a gilded grip with a bright glint.
- **Hand and grip:** extended forward in the **LEFT** hand at the wrapped grip. The **RIGHT** hand draws the cord to the cheek. This never swaps.
- **Arrows:** golden shafts, nocked from a glowing quiver at the hip.
- **Trails and effects:** molten gold light with a white-hot core; gold rift rings; gold sparks.

## Combat personality

- **Stance:** upright, chin lifted, the bow extended forward like a sceptre he can also fire.
- **Footwork:** a glide, not a run: short, measured steps with a regal, unhurried stride; quick precise sidesteps to keep distance.
- **Speed:** the Archer speed bonus shows as quick, precise draws and a clean recovery, not as a sprint.
- **Weight:** light and controlled. Each shot is placed, not thrown, and the attacks look like a king's command rather than a brute's swing.

## Animation notes per standard sheet

- **idle:** bow extended in the left hand, cord slack; the mantle billows in the breath; chin lifted throughout.
- **run:** a regal glide, bow carried extended, mantle streaming back and flashing its crimson lining.
- **air:** bow stays in the left hand; mantle flares upward with the crimson lining showing; gold sparks trail behind.
- **dash:** a low, fast glide forward with the mantle flattened behind and gold speed lines.
- **skid:** a braking stop with the bow swept back, the mantle flaring forward.
- **landing / crouch / guard:** the bow raised across the body in a regal guard; the crouch is composed, not cowering.
- **hurt:** a sharp recoil with the chin snapping up; the bow arm pulled in.
- **knocked down / get up:** falls back, the bow sliding from his hand; he rises on one knee, reaching for the bow.
- **ko (intro):** strides in chin-high while a golden rift ring snaps open behind him; a regal salute with the bow; draws a golden arrow in one motion; a flourish; settles.
- **misc (victory):** arms spread wide with the bow in one hand, a golden rift ring turning behind him, chin high.

## Attack sheets (golden arrow shots)

- **atk-a, combo strikes 1 and 2:** two precise golden arrow shots. Strike 1: a straight, fast release with a molten-gold trail. Strike 2: a measured diagonal shot with a gold arc.
- **atk-b, combo finisher and aerial:** the finisher is a full draw and a three-arrow golden volley fired in a fan; the aerial is a sweeping shot across the front of the body in mid-air.
- **atk-c, plunge and heavy:** the plunge is a golden arrow dropped down onto the ground in front, with a ring of gold light on impact; the heavy is a fully drawn golden power shot with a broad trail.

## Rift Art storyboard: Vault of Ages

1. **Anticipation 1:** he raises the bow; the first tall oval golden rift frame with a castle-spire silhouette appears at his back.
2. **Anticipation 2:** several golden portals blaze behind him; the bow drawn full; power at its peak.
3. **Execution 3:** legendary golden weapons (swords, spears, a halberd, a greatshield) burst from the portals toward the opponent's side.
4. **Execution 4:** a storm of golden weapons flies forward across the right side of the cell.
5. **Recovery 5:** the portals dim and close, gold sparks falling.
6. **Recovery 6:** back to stance, the bow in the left hand, the mantle settling.

All portals and weapons stay inside each cell.
