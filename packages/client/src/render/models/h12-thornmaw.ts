import { MAT, model, ramp, SKIN, cape, hairShort, scarf, eyes, chainLinks } from './kit';
// @ts-expect-error - plain JS module
import { registerWeapon } from '../heroRig.js';

/**
 * Thornmaw, the Black Hound (Rider, war scythe). From the portrait (assets/art/h-12.jpg): a quiet girl with short brown
 * hair, a dark cloak with a red scarf and chains across the front, and a colossal shadow wolf-hound looming behind her
 * with glowing purple eyes. The hound is built in her chest frame, so it follows her in every pose and stays at her back.
 * Stance: small and calm, head bowed a touch.
 */

/** A 0xRRGGBB colour as the rig's weapon colour (0xAABBGGRR). */
const abgr = (c: number): number => (0xff000000 | ((c & 255) << 16) | (c & 0xff00) | ((c >> 16) & 255)) >>> 0;

type Plot = ((i: number, k: number, colour: number, lift?: number) => void) & { at(i: number, k: number): number[] };

// the dark scythe: a black-violet shaft, a blade of smoke-dark steel with a thorned edge that glows violet
registerWeapon('thorn-scythe', {
  draw(T: Plot) {
    for (let i = -16; i <= 31; i += 0.4) for (let k = -0.5; k <= 0.51; k += 0.4) T(i, k, abgr(k > 0.1 ? 0x0c0a12 : 0x2a2238));
    for (let j = 0; j <= 28; j += 0.4) {
      const u = j / 28;
      // thorns: every so often the edge bites out a little further
      const w = (3.2 * (1 - u) + 0.3) * (Math.sin(j * 2.1) > 0.55 ? 1.3 : 1);
      const b = 31.5 - u * u * 12;
      for (let k = -w; k <= w + 0.01; k += 0.4) {
        const c = k < -w * 0.5 ? 0xb07aff : k > w * 0.3 ? 0x1c1826 : 0x3a3050;
        T(b + k, j + 0.8, abgr(c));
      }
    }
  },
});

export default model({
  id: 'h12-thornmaw',
  size: 0.88,
  shape: { chest: [0.86, 0.92, 0.84], upper: 0.84, fore: 0.84, thigh: 0.88, shin: 0.9 },
  palettes: [
    ramp(0x3a3040, 0.2, 0.28, 0.5), // 0 shell: the dark cloak
    ramp(0x1a1420), // 1 core: belt, knee guards
    null, // 2 steel: reserved for weapons
    SKIN.fair, // 3 skin
    ramp(0x2a2630), // 4 clothA: dark undergarments and breeches
    ramp(0x2a1e18, 0.25, 0.28, 0.5), // 5 clothB: boots
    ramp(0x6a4a30, 0.3, 0.25, 0.5), // 6 hair: short brown
    ramp(0xa07a40, 0.3, 0.26, 0.5), // 7 gold: the bronze chains
    ['#b07aff', '#b07aff', '#b07aff', '#b07aff'], // 8 glow: the hound's eyes
    ramp(0x120e14), // 9 dark: her eyes
    ramp(0x9a2a2a), // 10 accent: the red scarf
    ramp(0xd8d0c0), // 11 bone
    ramp(0x1a1424, 0.18, 0.3, 0.5), // 12 fur: the hound, shadow-dark with a violet sheen at the lit edge
  ],
  mats: { upper: MAT.shell, fore: MAT.shell, hand: MAT.skin, thigh: MAT.clothA, shin: MAT.clothB, foot: MAT.clothB, knee: MAT.core, waist: MAT.core, pelvis: MAT.clothA },
  glow: [MAT.glow],
  weapons: { scythe: 'thorn-scythe' },
  stance(p) {
    // small and calm: the head bows a little, the shoulders settle
    return { ...p, hy: Number(p.hy ?? 0) + 0.4, lean: Number(p.lean ?? 0) - 1 };
  },
  extras(api) {
    // the hound: a colossal shadow behind her, built from her chest frame so it always stays at her back
    const s = Number(api.q.cloth ?? 0);
    const lift = api.q.air ? -0.6 : 0;
    const hf = (x: number, y: number, z: number) => api.at('chest', [x - s * 1.2, y + lift, z]);
    // its shoulders and back, its great head, its snout over her shoulder
    api.ellipsoid(hf(-8, 0, -4.5), api.B.chest.R, [6, 6.2, 4.6], MAT.fur, api.PART.beast);
    api.ellipsoid(hf(-6.2, 6.6, -4), api.B.chest.R, [4.6, 4.2, 4.2], MAT.fur, api.PART.beast);
    api.ellipsoid(hf(-8.6, 11.8, -3.6), api.B.chest.R, [6.4, 5.4, 5], MAT.fur, api.PART.beast);
    api.sweep(hf(-4.4, 10.4, -3.2), hf(1, 8.4, -2.2), 2.9, 1.9, MAT.fur, api.PART.beast);
    api.sweep(hf(-4.6, 8, -3), hf(-0.6, 6.8, -2.2), 1.3, 1.1, MAT.dark, api.PART.beast);
    // the ears, and a ruff of fur down the neck and back
    api.sweep(hf(-10, 15.4, -4.6), hf(-11.4, 20.4, -5.4), 1.8, 0.45, MAT.fur, api.PART.beast);
    api.sweep(hf(-7.6, 15.6, -2.6), hf(-7.6, 20.4, -3.4), 1.6, 0.4, MAT.fur, api.PART.beast);
    api.sphere(hf(-12.4, 10.8, -4.2), 2.4, MAT.fur, api.PART.beast);
    api.sphere(hf(-11.6, 6, -4.4), 2.2, MAT.fur, api.PART.beast);
    api.sphere(hf(-12, 2.2, -4.6), 1.9, MAT.fur, api.PART.beast);
    // the glowing purple eye, and a second, dimmer one further back
    api.sphere(hf(-4.4, 12.6, -0.6), 0.74, MAT.glow, api.PART.glow);
    api.sphere(hf(-7.4, 12.6, -2.6), 0.5, MAT.glow, api.PART.glow);

    // her: short brown hair with a stray tuft, a dark cloak, a red scarf, the bronze chains
    hairShort(api, MAT.hair, 1.04);
    api.sphere(api.at('head', [1.9, 2.5, 0.8]), 0.9, MAT.hair, api.PART.hair);
    cape(api, MAT.shell, 12, 2.9);
    scarf(api, MAT.accent);
    chainLinks(api, api.at('chest', [2.4, 3.6, 3.4]), api.at('pelvis', [0.6, -1.4, 2.8]), MAT.gold, 5, 0.45);
    eyes(api, MAT.dark, 0.36);
  },
});
