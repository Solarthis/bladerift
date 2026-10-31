# Verdan - the Clay-Born (hero 4, Lancer, Rift Art: Chains of Genesis)

## Identity and personality

Shaped from the first clay and not yet sure what it is to be a person. Verdan is androgynous, gentle and unhurried,
with a knowing calm that can look like amusement. The golden chains are alive: they remember how to bind, and
Verdan lets them do most of the talking. Verdan is not cruel; the chains simply hold what they reach.

## Role in the roster

Lancer (`ClassId.Lancer`), slot **False** (the second roster Lancer after Nyx). Same class rules as Nyx: fast,
long-reaching, pokes from outside range and closes the gap (class speed 1.1, reach 5). Verdan's Rift Art, Chains of
Genesis, is a control tool: living chains burst from the ground under the opponent and bind them fast. The lance
sets up the binding, the chains finish it.

## Current design assessment

Source: `packages/client/src/render/models/h04-verdan.ts` (in-game pixel model) and `art/characters/h04-verdan/references/portrait.jpg`.

What works and should be kept:
- The colour story is right: ivory robe, long sage-green hair, gold chains. The gold reads clearly against the pale
  robe, and the green hair is unmistakable.
- The chain is conceptually right: the old model wraps a chain around the lance and a chain line trails from the
  hand, which is the seed of the "living chains" idea.
- The silhouette is calm and upright, which suits a clay-born being.

Wrong or weak, to fix in the sprite design:
- The robe is a flat white shape, with little structure at the sleeves, sash and hem; it reads as a sheet.
- The hair is a long mass with a braid; it needs a stronger shape and movement, so it does not look like generic
  long hair.
- The chains are a few rings and a line. They must read as living, looping gold links that coil around the arm and
  drift off the free hand.
- The lance is a generic gold spear. The clay theme (celadon glazed clay, fine cracks, a moulded shaft) is missing.
- Androgyny is weak. The face and build must stay neutral: soft oval face, fine jaw, slim neck and shoulders, no
  strong masculine or feminine cues.

## Visual references

Studied by genre trait rather than by copying any single image:
- **BlazBlue-style fighters:** long, flowing hair and cloth that make a silhouette from motion alone. Take the hair
  braid and the robe sleeves as big moving masses.
- **Guilty Gear-style fighters:** hard cel shadows and sharp highlights on metal. Take the hard light on the gold
  chains and the leaf blade.
- **Melty Blood-style fighters:** clean fine lines and bright thin trails. Take the thin gold trail streaks and the
  fine chain links.
- **Lionheart approved sheet (house style):** rendering, proportions, cape motion and the gold-light trail language.
  This is the primary benchmark.

Nothing here is copied: Verdan's silhouette is a slim, androgynous figure in a robe and sash, with very long green hair
and living gold chains, and must never be read as an existing franchise character.

## Silhouette notes

- Tall and slender, with a calm, upright posture.
- The very long sage-green hair falls past the waist in a single braid over one shoulder. It is the second biggest
  silhouette element and must move with every action.
- The ivory robe is wide at the sleeves and falls to the shins; the long sash hangs at the waist.
- The lance is about one and a half times his height. The gold leaf blade is the top of the silhouette.
- The chains extend the silhouette: they coil the forearms and trail from the free arm. They are part of the
  outline, not just decoration.
- At 150 px tall, the read is: pale face, pale green hair, an ivory robe, a gold lance, and gold chains.

## Palette (named, hex)

| Name | Hex | Used for |
| --- | --- | --- |
| Ivory robe | `#ece6d2` | Robe and undertunic (shadow `#c9c0a4`) |
| Gold chain | `#ffd84a` | Chains, sash, blade (deep gold `#a8742a`, bright `#fff3b0`) |
| Moss green | `#4f5f3e` | Hem, trousers, sandal straps (dark `#2a3a30`) |
| Sage hair | `#a9e3b8` | Long hair (highlight `#d7f7e0`, shadow `#5e9c78`) |
| Clay porcelain | `#e8e0cc` | Skin, cool-cream with a faint green cast |
| Celadon clay | `#bcd8c4` | Lance shaft (crack lines `#6f8f7c`) |
| Jade glint | `#8ff5b8` | Blade vein, energy glints, eye glow |
| Gold-green eye | `#b8d86a` | Iris (the eye reads gold-green, calm) |

## Costume and armour spec

- **Robe:** long ivory robe with a high collar and wide sleeves tied at the wrists. Gold embroidery at the collar,
  sleeve edges and hem; a moss-green hem band.
- **Sash:** a long ivory sash wound twice at the waist, ending in gold tassels at the hip.
- **Under layers:** ivory undertunic; dark moss-olive trousers.
- **Chains:** living gold chain links coil around both forearms and both upper arms, three to four loops each.
  Loose links trail from the free arm and drift like thread. The chains are rendered as separate bright links with
  dark underside, never a solid band.
- **Lance chain:** a spiral of gold chain links wound along the celadon shaft, and loose chain coils at the butt.

No red. No blue. Gold and jade only as accents on ivory and green.

## Face and hair spec

- **Face:** soft oval, fine jaw, a small straight nose, a gentle mouth, and a calm, knowing look. Androgynous: no
  heavy brow, no hard jaw, no strong neck.
- **Eyes:** gold-green iris (`#b8d86a`), calm, a slightly heavy lid. A thin jade highlight.
- **Hair:** very long, pale sage-green, past the waist. A single loose braid over the near shoulder, with the rest
  falling free behind. Soft highlights in the crown and at the braid ends.
- **Skin:** pale fired-porcelain, a faint green-cream cast, matte, with no blush.

## Weapon sheet spec: the chain lance

- **Length:** about one and a half times his height.
- **Shaft:** pale celadon glazed clay (`#bcd8c4`) with fine crack lines (`#6f8f7c`), lit on the top edge.
- **Chain wrap:** a spiral of gold chain links along the shaft, one link every few pixels, lit on top, dark below.
- **Butt:** loose gold chain coils hang from the butt end.
- **Blade:** a leaf-shaped gold spearhead with a jade vein down the centre and a ring of gold chain at the socket.
- **Grip:** the RIGHT hand holds the lance at mid-shaft; the LEFT hand holds the shaft below the blade for thrusts.
  The grip never swaps hands between frames.
- **Trail colour:** gold light with jade glints; the chains glow gold.

## Combat personality

Upright and poised, almost courtly, in stance. Verdan moves with a slow, measured walk and a long, flowing run, the
robe and braid lagging behind. The lance is used for long, precise thrusts. In the attack Verdan is calm: stance
first, then a sudden thrust, then the chains taking over. Heavy in the lunge, light and unhurried in recovery.

## Animation notes per standard sheet

- **idle:** lance held upright in the right hand, blade tilted forward. Breathing is slow; the loose chains drift
  from the free arm and the long hair moves with each breath.
- **run:** lance carried upright at the side with the butt low. Loose chains swing from the free arm; the robe,
  sash and braid flow behind.
- **air:** lance held level, blade forward. Take-off is a crouch with the lance pulled back; apex has the robe and
  sleeves billowing; the fast fall streams the hair and chains upward.
- **dash (ground):** a low, fast burst with the lance couched forward; gold chains trail behind like streamers.
  Air dash: body stretched along the lance, robe snapping behind.
- **atk-a (override, thrusts):** combo thrust 1 is a fast two-handed jab at chest height with a short gold streak.
  Combo thrust 2 is a low rising thrust with a bright gold arc, chains flaring.
- **atk-b (override):** combo finisher is a full lunge with the lance straight ahead and a large gold trail; the
  aerial thrust is a diving thrust forward and slightly down, with the robe and chains streaming.
- **atk-c (override):** plunge drives the lance point-first into the ground at impact, with a burst of gold light.
  The heavy attack is a charged lunge: couched under the arm, chains wound tight, a glow building along the blade,
  then one long straight thrust.
- **hurt:** the standard set. Recoil snaps the hair and chains forward; the knockdown lets the braid fall across the
  face.
- **art (Rift Art, Chains of Genesis):** see the storyboard below.
- **misc:** skill throw flicks a loose gold chain link. Taunt loops the lance once, then a calm, faintly amused smile.
  Victory rests the lance point-down with both hands on the shaft; chains loop around him in a slow gold glow.
- **ko:** intro walks in with the lance lowered and the chains loose, raises the lance upright, a slow flourish that
  unwinds a length of chain, then calm stance. Defeat is the standard collapse, the chains slack around him.

## Rift Art storyboard: Chains of Genesis

Six frames, kept inside each cell.

1. **Anticipation 1:** he plants the lance point-down in front of him and raises his free hand; gold chains begin to
   spin up around his body.
2. **Anticipation 2:** the instant before release. The chains are wound taut around him, the jade glints at their
   peak, the hand open toward the opponent.
3. **Execution 1:** living gold chains burst up out of the ground in front of him and whip toward the opponent.
4. **Execution 2:** the chains bind the opponent in glowing gold links with jade light at the centre; the robe and
   braid stream in the rush.
5. **Recovery 1:** the chains sink back into the ground; the lance is drawn up.
6. **Recovery 2:** back in the upright stance, the robe settling, the hair falling back into place.
