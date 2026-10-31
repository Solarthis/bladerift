# Skyfire Squad — Art Direction

The bar: this should read like a polished, independently developed commercial 2D multiplayer game, not a browser demo. Every asset must sit comfortably next to every other asset.

## Style pillars

1. **Modern hand-drawn cartoon.** Think contemporary indie titles with bold ink lines: confident, slightly chunky shapes, playful exaggeration, readable silhouettes. Not pixel art, not flat corporate vector, not realistic.
2. **Ink line.** A dark plum-black outline (`#1b1420`) on every foreground object. Use 2.5 world units for characters and props and 3 for terrain edges. Interior detail lines are thinner (1–1.5) and can be a darker shade of the local colour. Line ends are round, joins round.
3. **Cel shading.** Each surface gets a base colour, one shadow tone (about 18% darker and slightly hue-shifted toward purple/blue), and a small crisp highlight (lighter and warmer). Light comes from the **top left**. No soft airbrushed gradients on foreground objects. Gradients are allowed only in skies and distant atmosphere.
4. **Readability first.** Gameplay layers (terrain you collide with, players, pickups, projectiles) are high contrast and saturated. Background layers are progressively desaturated and lighter toward the horizon (aerial perspective), with no ink lines beyond the mid layer. Players must pop against every map.
5. **Proportions.** The soldier is a compact, slightly chibi trooper: big helmet/head (~35% of height), sturdy torso, short limbs, oversized boots, a chunky jetpack. Weapons are slightly oversized for readability but consistent with each other in scale (pistol < SMG < AR ≈ shotgun < sniper ≈ rocket launcher).

## Palette anchors

| Use | Colours |
|---|---|
| Ink | `#1b1420` |
| Skin tones (variety allowed) | `#f2c49b`, `#d9a072`, `#a8693f`, `#6e4429` |
| Gunmetal | base `#4a5160`, shadow `#343a47`, highlight `#7d8799` |
| Military olive | base `#6f7f45`, shadow `#55623a`, highlight `#94a35f` |
| Wood | base `#9a6a3f`, shadow `#74492c`, highlight `#c08b55` |
| Jungle | leaf `#3f9a4a` / `#2d7339` / `#6cc25a`, earth `#7a5233` / `#5c3b26` |
| Industrial | steel `#5d6675` / `#434a57` / `#8a95a6`, hazard `#f2b632` + ink stripes, rust `#a5552f` |
| Canyon | sandstone `#d98b4f` / `#b8683a` / `#f2b77a`, deep rock `#8c4a2f`, sky `#f7c98b` → `#7ec3e0` |
| Muzzle / fire | `#fff6c9`, `#ffd25e`, `#ff8a1f`, `#e2401f` |
| Team red / blue | `#e0483e` / `#2f7de1` |

Player colour is applied as a **tint on dedicated white/greyscale layers** (armour plates, helmet band, jetpack stripe) so the ink and shading underneath stay intact. In free-for-all, a player's colour comes from the 12-colour `PLAYER_COLORS` palette in `src/render/types.ts`.

## Technical rules

- Author SVGs in **world units** (1 unit = 1 world pixel; tile = 32×32; the soldier's collision box is 22×44 with feet at y=0, and the visual soldier should be about 30 wide × 50 tall including the helmet).
- `tools/build-art.mjs` rasterizes at 2× into atlases. Display sprites with `setScale(0.5)` (`ART_SCALE_INV`).
- Use `data-pivot="x y"` on the root `<svg>` for rotation and attachment points (for example the shoulder of an arm, or the grip of a gun).
- Keep SVGs clean: paths, groups, solid fills, `stroke-linejoin="round"`. Avoid filters (blur/drop-shadow), masks and embedded bitmaps: resvg handles them, but they are slow, blurry and off-style. Only skies may use `<linearGradient>`.
- No text in art (localization and crispness).
- **Performance:** a match can have 20 soldiers on screen on a mid-range phone. Prefer a few sprites per soldier (about 10 parts maximum) and tilemap/batched terrain over thousands of objects. Large static terrain is drawn once into a RenderTexture or uses tile sprites.
- Every asset must be original. No traced or copied third-party art.

## Motion

- Animate procedurally with easing. No stiff linear motion.
- Idle: a subtle breathing bob, 1.5–2 units at about 0.8 Hz.
- Run: legs swing with alternating phase, plus a torso bob and a forward lean.
- Air: legs tuck. When jetting, legs dangle and the flame flickers.
- Aim: the front arm and weapon rotate about the shoulder pivot, the head tilts up to ±25° toward the aim, and the whole body flips horizontally to face the aim direction.
- Shot: the weapon kicks back along the barrel with fast return (recoil per weapon), plus a muzzle flash sprite for 2–3 frames.
- Hurt: a white flash (tint fill) for 60 ms plus a small squash.
- Death: a ragdoll-ish tumble. Pieces fly with gravity and spin, then fade after about 1.2 s.
