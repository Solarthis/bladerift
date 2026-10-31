import { MAT, model, ramp, SKIN, GOLD, hairSpiky, coatTails, cape, eyes, pauldrons } from './kit';
// @ts-expect-error - plain JS module
import { registerWeapon } from '../heroRig.js';

/**
 * Ignis, the Crimson Rider (Rider, war scythe). From the portrait (assets/art/h-11.jpg): a fiery young rider with spiky
 * flame-red hair swept back, golden eyes under a hard brow, a dark blue riding coat with gold trim and epaulettes, a
 * red cape, riding boots. His scythe has a flame-orange blade. Stance: forward-leaning, eager.
 */

/** A 0xRRGGBB colour as the rig's weapon colour (0xAABBGGRR). */
const abgr = (c: number): number => (0xff000000 | ((c & 255) << 16) | (c & 0xff00) | ((c >> 16) & 255)) >>> 0;

type Plot = ((i: number, k: number, colour: number, lift?: number) => void) & { at(i: number, k: number): number[] };

// the scythe: a dark iron-red shaft bound in gold, a blade of living flame (hot edge, orange heart, red trailing side)
registerWeapon('ignis-scythe', {
  draw(T: Plot) {
    for (let i = -16; i <= 31; i += 0.4) for (let k = -0.5; k <= 0.51; k += 0.4) T(i, k, abgr(k > 0.1 ? 0x3a1410 : 0x6a2418));
    for (let i = -6; i <= -4; i += 0.4) for (let k = -0.9; k <= 0.91; k += 0.4) T(i, k, abgr(0xe9b64a));
    for (let j = 0; j <= 28; j += 0.4) {
      const u = j / 28;
      // the flame edge: the blade's width breathes, so the outline licks like fire
      const w = (3.2 * (1 - u) + 0.3) * (1 + 0.22 * Math.sin(j * 1.25));
      const b = 31.5 - u * u * 12;
      for (let k = -w; k <= w + 0.01; k += 0.4) {
        const c = k > w * 0.35 ? 0xffe066 : k < -w * 0.45 ? 0xd8361a : 0xff7a1a;
        T(b + k, j + 0.8, abgr(c));
      }
    }
    // the spine of the blade: a bright seam down the middle of the cutting edge
    for (let j = 0; j <= 27; j += 0.4) {
      const u = j / 28, b = 31.5 - u * u * 12;
      T(b + 0.6, j + 0.8, abgr(0xfff6c0));
    }
  },
});

export default model({
  id: 'h11-ignis',
  palettes: [
    ramp(0x2c3f80, 0.26, 0.3, 0.55), // 0 shell: the navy riding coat
    ramp(0x1a1a2a), // 1 core: belt, knee guards
    null, // 2 steel: reserved for weapons
    SKIN.fair, // 3 skin
    ramp(0x1e2236), // 4 clothA: dark breeches
    ramp(0x2a1a12, 0.3, 0.28, 0.5), // 5 clothB: riding boots
    ramp(0xff4a1a, 0.34, 0.26, 0.52), // 6 hair: flame red
    GOLD, // 7 gold: trim, epaulettes, buckles
    ['#ffd84a', '#ffd84a', '#ffd84a', '#ffd84a'], // 8 glow: the golden eyes
    ramp(0x14141e), // 9 dark
    ramp(0xc8241a, 0.3, 0.28, 0.5), // 10 accent: the crimson cape
    ramp(0xe8dcc4), // 11 bone: the high collar's lining
    ramp(0x5a3018, 0.28, 0.28, 0.5), // 12 fur (leather): gauntlets
  ],
  mats: { waist: MAT.core, upper: MAT.shell, fore: MAT.shell, hand: MAT.fur, thigh: MAT.clothA, knee: MAT.core, shin: MAT.clothB, foot: MAT.clothB, pelvis: MAT.clothA },
  shape: { chest: [1.04, 1, 1.02], shoulder: 1.08, upper: 1.06, fore: 1.04, thigh: 1.02 },
  glow: [MAT.glow],
  weapons: { scythe: 'ignis-scythe' },
  stance(p) {
    // a dashing forward lean, chin up, eager to be off
    return { ...p, lean: Number(p.lean ?? 0) + 2, hy: Number(p.hy ?? 0) - 0.3 };
  },
  extras(api) {
    // the cape streams behind him, and the riding coat's tails
    cape(api, MAT.accent, 13, 2.8);
    coatTails(api, MAT.shell, 8);
    // gold trim: the coat's front edge, and the epaulettes on the shoulders
    api.sweep(api.at('chest', [1.8, 4.2, 4.3]), api.at('chest', [1.6, -2.6, 4.9]), 0.42, 0.42, MAT.gold, api.PART.acc);
    pauldrons(api, MAT.gold, 0.82);
    // a high collar with a bone lining, and a gold buckle at the belt
    api.sweep(api.at('neck', [-0.6, -1.4, 1.6]), api.at('neck', [0.8, -1.2, 2.4]), 1.1, 1.1, MAT.bone, api.PART.acc);
    api.sphere(api.at('waist', [1.2, 0.2, 3.3]), 0.7, MAT.gold, api.PART.acc2);
    // the flame-red hair, spiked back off the brow
    hairSpiky(api, MAT.hair, 7, 3.2);
    // a fringe over the brow
    // the golden eyes, under a hard dark brow
    api.sphere(api.at('head', [3.25, 0.5, 1.0]), 0.52, MAT.glow, api.PART.glow);
    api.sweep(api.at('head', [2.2, 1.9, 1.3]), api.at('head', [3.4, 1.7, 1.2]), 0.18, 0.16, MAT.dark, api.PART.acc2);
  },
});
