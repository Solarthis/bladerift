# Lore pass: hero kit changes

Version 1, 2026-10-31. Written by the lore director for the gameplay programmer. The owner asked for every hero to be lore accurate:
the weapon, the way the hero fights, the special, the dodge, the Rift Art and the look must match the legendary or historical figure
the hero is named after. The designs stay our own (no franchise designs, names or attack names).

Art status (sprites, portraits, icons) is tracked in section 5. This document covers what the code must change.

## 1. Summary

| # | Hero | Verdict | Weapon (moveset used) | Art regenerated |
| --- | --- | --- | --- | --- |
| 0 | Richard Lionheart | Correct, no change | Longsword (Sword) | No |
| 1 | Alcides (Heracles) | Look and energy fixed | Greatbow with Hydra-venom arrows (Bow) | Yes: Nemean lion pelt, venom-green energy |
| 2 | Gilgamesh | Weapon wrong, fixed | **New weapon: the Gate** (portals fire gold and silver treasures) | Yes: no bow anywhere |
| 3 | Cú Chulainn | Look fixed, special renamed | The Gáe Bulg, barbed sea-bone spear (Lance) | Yes: Celtic cloak, torc, barbed spear, hound motif |
| 4 | Enkidu | Weapon wrong, fixed | Living gold chains that lock into a chain-spear (Lance) | Yes (portrait kept) |
| 5 | François Prelati | Correct, no change | Conjurer's staff (Staff) | No |
| 6 | Alexandre Dumas | Correct, no change | Giant quill and book (Staff) | No |
| 7 | Hassan | Correct, no change | Twin knives (Daggers) | No |
| 8 | Hashashin | Correct, no change | Twin knives (Daggers) | No |
| 9 | Humbaba | Weapon and look wrong, fixed | Lion claws (Hammer timings, claw look) | Yes: beast guardian, no machinery |
| 10 | Jack the Ripper | Weapon and look wrong, fixed | Long surgical knives (Daggers) | Yes: top hat, Inverness coat |
| 11 | Alexander | Weapon and look wrong, fixed | Kopis sword (Sword) + Bucephalus | Yes: Macedonian king |
| 12 | Pale Rider | Rift Art fixed | War scythe (Scythe) | Art sheet only: Death's pale horse |
| 13 | Brynhildr | Look fixed | Tower shield (Shield) | Yes: Valkyrie (winged circlet, braid, swan wings, ring of fire) |

## 2. Code changes (in order)

### 2.1 Per-hero weapon (shared)

Today the weapon comes from the class (`SIGNATURE[cls]` in `heroes.ts`, `CLASSES[].signature`). Three heroes now fight with a different
moveset from their class's signature, so the weapon must come from the hero.

- `heroes.ts`: add `weapon: WeaponId` to `HeroDef` and set it on every hero:
  0 Sword, 1 Bow, 2 **Gate**, 3 Lance, 4 Lance, 5 Staff, 6 Staff, 7 Daggers, 8 Daggers, 9 Hammer, 10 **Daggers**, 11 **Sword**, 12 Scythe,
  13 Shield.
- `sanitizeLoadout`: `const w0 = HEROES[hero].weapon;` (drop `SIGNATURE`).
- Add `weaponLook: { name: string; blurb: string; icon: string }` to `HeroDef` for the menus (the moveset stays the WeaponDef; the
  name, blurb and icon are the hero's):

| Hero | name | blurb | icon |
| --- | --- | --- | --- |
| 0 Richard | Lion-Hilt Longsword | Balanced three-hit combo. The third swing launches. | g-sword |
| 1 Alcides | Hydra Greatbow | Venom-tipped arrows from range. Hold to draw a heavy shot. | g-bow |
| 2 Gilgamesh | The Gate | Treasures fired from golden portals. Hold to open more gates: up to nine blades. | g-gate |
| 3 Cú Chulainn | Gáe Bulg | Barbed sea-bone spear: longest reach. Hold to charge a lunge. | g-lance |
| 4 Enkidu | Chains of Clay | Living chains lock into a spear: longest reach. Hold to charge a lunge. | g-chains |
| 5 Prelati | Conjurer's Staff | (Staff blurb) | g-staff |
| 6 Dumas | Quill and Book | Golden ink bolts at range; hold for an ink orb. | g-staff |
| 7 Hassan | Bone Knives | (Daggers blurb) | g-daggers |
| 8 Hashashin | Twin Blades | (Daggers blurb) | g-daggers |
| 9 Humbaba | Guardian's Claws | Crushing and slow. The third blow slams the ground and breaks guards. | g-claws |
| 10 Jack | Surgeon's Knives | Blindingly fast cuts. Hits from behind crit. | g-knives |
| 11 Alexander | Kopis | Fast chopping three-hit combo. The third cut launches. | g-kopis |
| 12 Pale Rider | Reaper Scythe | (Scythe blurb) | g-scythe |
| 13 Brynhildr | Valkyrie Shield | (Shield blurb) | g-shield |

- Client: `ui/icons.ts` add `heroWeaponIcon(hero) => art(heroOf(hero).weaponLook.icon)`; `App.ts` hero select (line ~244/295) shows
  `weaponLook` instead of `WEAPONS[C.signature]`; `ui/preview.ts`, `render/poses.ts` (line ~375), `dev/PoseLab.ts`, `dev/SpriteLab.ts`
  use `heroOf(h).weapon` instead of `classOf(h.cls).signature`. Keep `CLASSES[].signature` only as documentation or remove it.
- Class blurbs: Rider: "Fast and far-reaching: rides the arena and tramples with a summoned mount." (no scythe; Alexander uses a sword).
  Archer: "Light on its feet; shots fly faster and further. Keep your distance and make them come to you." (covers the Gate).
- Protocol: the loadout's weapon ids are sent on the wire. `WEAPON_COUNT` becomes 9; check `isWeapon` and any fixed-size encoding in
  `protocol.ts`; bump the protocol version if the loadout check rejects an unknown id.

### 2.2 New weapon: the Gate (Gilgamesh)

`WeaponId.Gate = 8`, `WEAPON_COUNT = 9`. Gilgamesh never holds a weapon: golden portals open behind and above him and fire treasures
(gold and silver swords, spears, axes, halberds) point-first. Holding the heavy button opens more portals: the volley grows from 2 to 9
blades.

Move flags: add `relic?: number` to `Move` (blades fired by this move). A move with `relic` fires `relic` projectiles of kind `'relic'`
instead of an arrow (in `World.spawnFrom`, next to the `arcane` branch).

```ts
{
  id: WeaponId.Gate, name: 'The Gate', short: 'Gate',
  blurb: 'Treasures fired from golden portals. Hold to open more gates: up to nine blades.',
  combo: [
    { startup: 8,  active: 1, recovery: 12, dmg: 52, box: b(0,0,0,0), kbX: 140, kbY: 40, stun: 16, arrow: true, relic: 1 },
    { startup: 8,  active: 1, recovery: 12, dmg: 54, box: b(0,0,0,0), kbX: 150, kbY: 40, stun: 16, arrow: true, relic: 1 },
    { startup: 10, active: 1, recovery: 20, dmg: 72, box: b(0,0,0,0), kbX: 220, kbY: 90, stun: 22, arrow: true, relic: 2 },
  ],
  air: { startup: 7, active: 1, recovery: 12, dmg: 50, box: b(0,0,0,0), kbX: 140, kbY: 60, stun: 16, arrow: true, relic: 1 },
  charged: { startup: 2, active: 1, recovery: 18, dmg: 70, dmgMax: 170, box: b(0,0,0,0), kbX: 260, kbY: 120, stun: 30,
             arrow: true, relic: 2, min: 12, max: 60 },
  arrowSpeed: 860,
}
```

Spawning rules (`spawnFrom`, deterministic, no randomness):
- `dmg` of a move is the TOTAL of the volley. Light/air: `count = m.relic`. Charged: `k = clamp((charge - min) / (max - min), 0, 1)`,
  `count = 2 + Math.floor(7 * k + 1e-6)` (2 at a tap-release past `min`, 9 at full charge); total damage is `moveDamage(...)` as now
  (70 to 170, class multipliers apply). Per blade: `dmg = Math.round(total / count)`.
- Blade i (0-based): `kind: 'relic'`, `wait: i * 3` (staggered like Serpent Rain), portal position behind/above him:
  `x = s.x - s.face * (8 + (i % 3) * 14)`, `y = s.y - 20 - ((i * 5) % 4) * 10` (between 20 and 50 units up: inside the body height, so
  a volley covers a standing and a crouching foe). Light combo blade 2 of combo[2] uses the same formula.
- Speed: `vx = s.face * w.arrowSpeed * C.arrowSpeed` (860 x 1.3 = 1118 for the Archer class), `vy = 0`; the air shot uses
  `vy = +0.3 * |vx|` (aimed down-forward). `gravity: 0`. `life: Math.round(0.9 * TICK_RATE)`.
- Knockback and stun: every blade but the last gets `kb: 40, kbY: 0, stun: 8`; the last blade of the volley gets the move's `kbX`,
  `kbY`, `stun` and `heavy: true` (drawn larger). Blades are blockable (normal chip) and do not pierce.
- Events: `this.events.push({ t: 'shoot', p: f.id, kind: 8 })` once per volley (kind 8 = gate: a metallic ring SFX, not the bow twang).
- The heavy button: the Gate behaves like the Bow (`w.charged && (s.ground || w.arrowSpeed)`), so it also charges in the air. No plunge.
- Bot (`bot.ts`): treat `Gate` like `Bow` (keep range, hold for a volley when the foe is far).

Client:
- `GameScene.ts` relic projectiles: use the new relic sprites instead of the tinted `WEAPON_SPRITES`:
  `const RELIC_SPRITES = ['r-gold-sword','r-silver-sword','r-gold-spear','r-silver-axe','r-gold-halberd','r-silver-greatsword','r-gold-shortsword','r-silver-glaive']`
  (`assets/art/*.png`, horizontal, point to the right, already in the repo), sprite `RELIC_SPRITES[p.id % 8]`, no tint (they are
  painted gold and silver), scale about 0.22 (0.32 when `p.heavy`), flipX by facing. A small gold ring (`this.ring(...)`) at the spawn
  point is the portal. Use the same sprites for Vault of Ages and Gate Shot.
- While Gilgamesh charges (`act` charge, weapon Gate), draw `count` small gold portal rings behind him in an arc (the count from the same
  formula), so the player sees the volley grow. Fire a ring + spark at each blade's portal when it leaves.
- `render/poses.ts` (procedural rig fallback): the Gate has no held weapon (`weapon: 'none'`), arm gestures only.
- `fxmap.ts`: no swing trail for the Gate.
- `ui/icons.ts`: `[WeaponId.Gate]: 'g-gate'`.

Balance intent: light DPS about the Bow's (52-54 per 21 ticks); the full volley (170 total) only lands in full if the foe stays in it.
Run `npx tsx tools/duelsim.ts --seeds=2 --quiet` and tune `dmgMax` (150-190) to keep Gilgamesh in 40-60 %.

### 2.3 Text changes (`heroes.ts` lore, `weapons.ts` SKILLS and DODGES, `classes.ts` ARTS)

Only the strings below change; mechanics stay the same unless stated.

**Alcides (1)**
- lore: "A giant hunter bound in the chains of his own curse, wrapped in the hide of the lion no blade could pierce. Every Hydra-tipped arrow he looses is a debt repaid."
- SKILLS[1] Nine Lives blurb: "Three arrows dipped in the Hydra's venom, loosed at once in a fan."
- ARTS HailOfArrows (Serpent Rain) blurb: "Looses a volley skyward that falls around the opponent like the Hydra's striking heads."
- Visuals: the arrows and the art trail are venom green (`ART_FLASH[HailOfArrows]` is already 0xb8ff90; make the skill's projectile skin and any bow trail for hero 1 acid green 0x9cff3a with black smoke instead of ember orange).

**Gilgamesh (2)**
- lore unchanged ("He owns every treasure ever forged and lends them to his foes - point first.").
- SKILLS[2] Gate Shot blurb: "A great golden gate opens behind him and launches one colossal treasured blade that pierces straight through." Client: draw the skill relic as `r-gold-sword` at scale ~0.45.
- DODGES[2] Gate Step: unchanged. ARTS VaultOfAges: unchanged.

**Cú Chulainn (3)**
- lore: "The Hound of Ulster. His barbed spear, carved from a sea-beast's bone, never misses - and the barbs open inside the wound."
- SKILLS[3]: rename `RuneLeap` to `SalmonLeap`: name "Salmon Leap", blurb "The hero's salmon leap Scáthach taught him: a soaring vault over the enemy, spear first." (mechanics unchanged; enum rename optional, the id stays 3).
- ARTS PiercingFang: name "Gáe Bulg", blurb "The barbed spear's unstoppable lunge across the arena: it ignores guards." (mechanics unchanged).
- Client effects: no jellyfish particles for hero 3; the Art's wave is a teal hound shape.

**Enkidu (4)**
- lore unchanged. DODGES[4] Clay Shift, SKILLS[4] Chain Lash, ARTS Chains of Genesis: unchanged.
- Client: `fxmap.ts` lance thrust trail for hero 4 is a gold chain streak (gold 0xffd060, jade 0x6ad0a0 sparks), not a spear trail. Procedural rig fallback: no held lance.

**Humbaba (9)**
- lore: "The guardian the gods set over the Cedar Forest: a lion's claws, a bull's horns, a serpent for a tail, fire on his breath and seven auras of terror."
- SKILLS[9] Terror Roar blurb: "Humbaba roars - a roar like the flood - and everyone near is frozen in fear."
- DODGES[9] Beast Bound blurb: "A low, heavy pounce that carries the guardian clear."
- ARTS BloodFrenzy: name "Seven Terrors", blurb "He dons his seven auras of terror: six seconds in which hits cannot stagger him, he hits harder and recovers faster." (mechanics unchanged).
- Hammer numbers unchanged (balance-tested). Client: `fxmap.ts` hammer trail for hero 9 becomes crimson four-line claw rakes; swing SFX pitch for claws can be a slash rather than a whoosh; the rig fallback has no hammer.

**Jack the Ripper (10)**
- weapon: Daggers (was Hammer via the Berserker signature). Class stays Berserker (rage multipliers, slow roll) - the madness of the Ripper; the knives give the speed.
- lore: "A polite gentleman in a top hat on a foggy Whitechapel night. Then the knives come out, and nobody remembers his face."
- SKILLS[10] Scalpel Rain, DODGES[10] Fog Form, ARTS GrimFog: unchanged (Grim Fog's crit-from-fog suits the knives' back-crits).
- Balance: Daggers x Berserker (dmg 1.15, +20 %/+40 % rage, speed 0.88) is untested: run the duelsim. Knobs if he falls outside 40-60 %: a hero-level `speedMul` (1.08) or Daggers `box.w` 34 -> 40 for him only (long surgical knives).
- Client: `fxmap.ts` daggers trail for hero 10 is a thin silver-white line with grey fog wisps.

**Alexander (11)**
- weapon: Sword (was Scythe via the Rider signature). Fights on foot: the sprite standard's body box (22 x 52) and cells cannot carry a permanent mount, so Bucephalus appears in the special and the Rift Art, as in his legend's great charges.
- lore: "The boy-king who tamed Bucephalus and rode to the edge of the world. Where they galloped, the ground stays warm for a hundred years."
- SKILLS[11] Bucephalus Charge blurb: "A short, unstoppable charge on Bucephalus, his great black warhorse."
- DODGES[11] Cavalry Dash blurb: "A burst of the Companions' charge."
- ARTS Stampede blurb: "Bucephalus, wreathed in flame, thunders across the arena, trampling and setting the opponent alight."
- Balance: Sword on the Rider (dmg 0.93, speed 1.2, 2 dashes) may be strong; duelsim, knob: hero `dmgMul` 0.9.
- Client: sword trail for hero 11 orange-gold flame (it was the scythe's).

**Pale Rider (12)**
- lore: "A quiet girl, and the colossal shadow that follows her as Hell followed Death. Only one of them is gentle."
- ARTS NightHunt: name "Pale Horse", blurb "Death's pale horse rises from her shadow: she rides it onto the opponent and slams down with it." (mechanics unchanged). Client: the Art's cast effect is the pale horse (violet smoke, bone-white), not the hound; the Plague Hound special keeps the hound.

**Brynhildr (13)**
- lore: "A Valkyrie who never takes a step back. The wall she carries makes sure of it; the ring of fire she once slept in rises around it."
- ARTS Bulwark blurb: "Two seconds untouchable inside a ring of fire that reflects projectiles and shoves attackers back." Client: the procedural barrier for hero 13 (if not suppressed for atlas fighters) becomes pale-gold flame around a teal core; `ART_FLASH[Bulwark]` 0xffe08a already fits.

## 3. Heroes that are already right (and why)

- **Richard Lionheart (0)**: the crusader king fought with the sword; Lion's Roar, Lion's Step and the lion-head crossguard carry his epithet, and Radiant Cleave fits a knight-king. His sheet is the approved house-style benchmark. (Optional later: the three gold lions of his royal arms on the tabard.)
- **François Prelati (5)**: the historical Prelati was a conjurer whose summonings for Gilles de Rais were illusion and fraud; the illusionist kit (Mirage dodge, Phantom Stars, Starfall) plays exactly that, with a conjurer's staff. Our take is a woman, an original-design choice.
- **Alexandre Dumas (6)**: the writer of swashbuckling romances fights with his quill and book; Ink Blot and Turn of the Page are writing, and Rewritten Fate (the author saves the hero in the right chapter) is the legend of the novelist.
- **Hassan (7)**: the Old Man of the Mountain sent his followers with daggers; twin knives, the Flash Step and Phantom Hand (the legend of the dagger left on a sleeping sultan's pillow: the hand that always finds you) fit. The bone mask is our original look.
- **Hashashin (8)**: the nameless fida'i of the Nizari order: twin knives, the hood, Fan of Knives and Flash Step fit.

## 4. New and replaced images (already installed)

`packages/client/public/assets/art/`:
- New weapon icons: `g-gate.jpg`, `g-chains.jpg`, `g-claws.jpg`, `g-knives.jpg`, `g-kopis.jpg` (160 x 160, icon frame).
- Replaced icons (old versions kept in `tools/art-gen/source/replaced-icons-2026-10-31/`): `k-11.jpg` (Bucephalus Charge: black warhorse, a
  sword, no lance), `k-01.jpg` (Nine Lives: venom arrows), `k-03.jpg` (Salmon Leap), `d-09.jpg` (Beast Bound: beast, no machinery),
  `a-frenzy.jpg` (Seven Terrors: no hammer), `a-fog.jpg` (Grim Fog: top hat), `a-hunt.jpg` (Pale Horse), `a-fang.jpg` (Gáe Bulg),
  `a-hail.jpg` (Serpent Rain: venom), `a-bulwark.jpg` (ring of fire, swan-wing shield).
- Relic sprites for the Gate, Gate Shot and Vault of Ages: `r-gold-sword.png`, `r-silver-sword.png`, `r-gold-spear.png`,
  `r-silver-axe.png`, `r-gold-halberd.png`, `r-silver-greatsword.png`, `r-gold-shortsword.png`, `r-silver-glaive.png` (transparent,
  horizontal, point right, up to 256 px wide). They must be preloaded where `WEAPON_SPRITES` is preloaded (`GameScene.preload`).
- Source sheets: `tools/art-gen/source/icons-lore.png`, `relics.png` (jobs `icons-lore`, `relics` in `tools/art-gen/gen.mjs`).
  `tools/art-gen/slice.py` does not know them yet; if it is re-run, add:
  `square_icons('icons-lore', ['g-gate','g-chains','g-claws','g-knives','g-kopis','k-11','a-frenzy','a-fog','a-hunt','a-fang','a-hail','k-01','k-03','d-09','a-bulwark'])`
  and a relic `grid('relics', 2, 4, [...the eight r-* names])` AFTER the older sheets (they overwrite the older icons).

Portraits (`h-NN.jpg`) and sprite atlases (`assets/characters/<id>/atlas.*`) are regenerated per hero; see the director's report for
which ones landed.

## 5. Sprite notes for the renderer

- The atlases keep the standard 12 sheets and frame meanings, so `spriteAnim.ts` needs no change.
- Gilgamesh's charge frame (atk-c 4) shows a fan of portals; the growing count is drawn by the client (section 2.2).
- Unreachable frames by moveset: Gate has no plunge (atk-c 1-3 unreachable, like the Bow); Daggers for Jack use atk-a and atk-b as before.
- Procedural swing trails still run on top of atlas fighters (sprite standard section 8, finding 8); with the new looks the default
  weapon trails would be wrong for heroes 1, 4, 9, 10, 11 (see the per-hero client notes above), so either suppress them for atlas
  fighters or recolour them per hero.

## 6. Art status (2026-10-31) and how to resume

Codex image_gen hit its ChatGPT usage cap at about 22:05 UTC on 2026-10-31 (`usage_limit_reached`, resets 2026-11-01 14:14 UTC).
Nothing is half-installed: no atlas or portrait was replaced for a hero whose sheet set is incomplete, so the game still shows the OLD
art for those heroes until they are finished.

| Hero | Design (references/design.png) | New sheets present | Still to generate | Atlas | Portrait |
| --- | --- | --- | --- | --- | --- |
| h02 Gilgamesh | approved | idle, air, dash | run (first try faced left, rejected), atk-a, atk-b, atk-c, hurt, art, skill, misc, ko | old | old (shows a bow) |
| h10 Jack | approved | idle, run, air, dash, atk-a, atk-b | atk-c, hurt, art, skill, misc, ko | old | old |
| h11 Alexander | approved | idle, run, air, dash, atk-a, atk-b | atk-c, hurt, art, skill, misc, ko | old | old |
| h09 Humbaba | approved | idle, run, air, dash, atk-a, atk-b | atk-c, hurt, art, skill, misc, ko | old | old |
| h04 Enkidu | approved | idle, run, dash, atk-a | air, atk-b, atk-c, hurt, art, skill, misc, ko | old | keep current |
| h01 Alcides | approved | none (old sheets still in sheets/) | all 12 | old | old |
| h03 Cú Chulainn | approved | none (old sheets still in sheets/) | all 12 | old | old |
| h13 Brynhildr | approved | none (old sheets still in sheets/) | all 12 | old | old |
| h12 Pale Rider | unchanged | art (pale horse) | - | rebuilt | keep |

Old sheets of the regenerated heroes are in `art/characters/<id>/sheets/old-2026-10-31/`, old designs in `references/old/`.
Image budget per window is about 70: the remaining work is about 50 sheets + 3 x 12 + 7 portraits, so plan two windows. Priority:
Gilgamesh, Jack, Alexander, Humbaba, Enkidu, then Alcides, Cú Chulainn, Brynhildr.

Resume (per hero, in priority order):
```
node tools/sprites/batch.mjs h02-aurelion h10-gray h11-ignis h09-gorvax h04-verdan --jobs=4   # only the missing sheets
# review every new sheet; a bad one: move it to sheets/old-2026-10-31/<sheet>-rejectN.png and run node tools/sprites/gen.mjs <id> <sheet>
python tools/sprites/process.py <id> --previews          # must report 37/37 animations
node tools/sprites/gen.mjs <id> portrait                  # not for h04 (portrait kept)
python tools/sprites/install_portrait.py <id> <NN>         # centre-crop to 3:4, 240x320 -> references/portrait.jpg + assets/art/h-NN.jpg
# tier 2 (h01-kharon, h03-nyx, h13-aegis): first move ALL sheets/*.png and *.log to sheets/old-2026-10-31/, then the same steps
```
The portrait install is what h-02 got in a288a89: centre crop of portrait-v2.png to 3:4, resize to 240 x 320, JPEG quality 86, written
to both `references/portrait.jpg` (old one kept as `references/old/portrait-v1.jpg`) and `packages/client/public/assets/art/h-NN.jpg`.
