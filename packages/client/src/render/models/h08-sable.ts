import { MAT, model, ramp, SKIN, GOLD, scarf } from './kit';
// @ts-expect-error - plain JS module
import { registerWeapon, STEEL } from '../heroRig.js';

/**
 * Sable, the Veiled Blade (Assassin, Flash Step). From the portrait (assets/art/h-08.jpg): a lithe woman in a dark indigo
 * hood with a gold-trimmed edge, a dark cloth veil over the lower face, sharp dark eyes, fitted dark armour and a low,
 * coiled crouch. Twin slim knives of about 6 px, not the long daggers.
 */

// the twin knives: a slim, lightly curved blade (about 6.5 px) on a short black grip, a small gold guard at the fist
registerWeapon('sable-knife', {
  draw(T: (i: number, k: number, c: number, lift?: number) => void) {
    for (let i = -1.0; i <= 1.4; i += 0.4) for (let k = -0.6; k <= 0.61; k += 0.4) T(i, k, k > 0 ? STEEL.darkD : STEEL.dark);
    for (let k = -1.2; k <= 1.21; k += 0.4) T(1.6, k, STEEL.gold);
    for (let i = 2.0; i <= 8.4 + 0.01; i += 0.4) {
      const u = (i - 2.0) / 6.4, c = 0.9 * u * u, w = Math.max(0.22, 0.85 * (1 - u * 0.9));
      for (let k = c - w; k <= c + w + 0.01; k += 0.4) T(i, k, k < c - w * 0.3 ? STEEL.hi : k > c + w * 0.3 ? STEEL.d : STEEL.a);
    }
  },
});

export default model({
  id: 'h08-sable',
  size: 0.94,
  shape: { chest: [0.86, 0.95, 0.84], pelvis: 0.92, upper: 0.82, fore: 0.82, thigh: 0.86, shin: 0.88 },
  // indigo hood and sleeves, near-black fitted armour, warm skin, black hair, gold trim, dark veil
  palettes: [
    ramp(0x2a2858, 0.28, 0.28, 0.55),
    ramp(0x14142a),
    null,
    SKIN.warm,
    ramp(0x1e1e3a),
    ramp(0x121220),
    ramp(0x101018),
    GOLD,
    ['#3ce0f5', '#3ce0f5', '#3ce0f5', '#3ce0f5'],
    ramp(0x0a0a14),
    ramp(0x1c1c34),
    ramp(0xe8e0d0),
    ramp(0x1a1a28),
  ],
  mats: {
    pelvis: MAT.clothB, waist: MAT.core, chest: MAT.core, neck: MAT.clothB,
    head: MAT.skin, face: MAT.skin,
    shoulder: MAT.shell, upper: MAT.shell, elbow: MAT.core, fore: MAT.core, hand: MAT.dark,
    thigh: MAT.clothB, knee: MAT.core, shin: MAT.clothB, foot: MAT.clothB,
  },
  glow: [MAT.glow],
  weapons: { dagger: 'sable-knife' },
  // a low, coiled crouch on the ground (the knees sprung, the body forward); airborne she keeps her line
  stance(p: Record<string, unknown>) {
    const y = Number(p.y ?? 0);
    if (y < -0.5) return p;
    return { ...p, crouch: Number(p.crouch ?? 0) + 2, lean: Number(p.lean ?? 0) + 1 };
  },
  extras(api) {
    const P = api.PART;
    // the indigo hood: crown and back, its front edge drawn back from the brow
    api.ellipsoid(api.at('head', [-1.1, 1.2, 0]), api.B.head.R, [3.5, 3.4, 3.4], MAT.shell, P.cloth);
    // falling onto the shoulders
    api.sweep(api.at('head', [-2.4, -0.6, 0]), api.at('chest', [-2.6, 1.6, 0]), 2.5, 2.9, MAT.shell, P.cloth);
    // the gold-trimmed edge round the hood's front opening
    api.sweep(api.at('head', [1.9, 1.2, 1.8]), api.at('head', [2.4, 1.2, 0]), 0.42, 0.42, MAT.gold, P.acc);
    api.sweep(api.at('head', [2.4, 1.2, 0]), api.at('head', [1.9, 1.2, -1.8]), 0.42, 0.42, MAT.gold, P.acc);
    // a loose strand of black hair at the temple
    api.sweep(api.at('head', [0.8, 0.6, 3.1]), api.at('head', [-0.2, -2.8, 3.0]), 0.5, 0.3, MAT.hair, P.hair);
    // the dark cloth veil over the lower face, under the sharp eyes
    api.ellipsoid(api.at('head', [1.3, -2.1, 0]), api.B.head.R, [2.4, 1.3, 2.9], MAT.clothB, P.acc);
    // sharp eyes above the veil, with a cold cyan glint
    api.sphere(api.at('head', [2.8, 0.5, 1.2]), 0.44, MAT.dark, P.glow);
    api.sphere(api.at('head', [3.0, 0.7, 1.3]), 0.2, MAT.glow, P.glow);
    // the gold belt on the fitted armour
    api.ellipsoid(api.at('waist', [0, -0.6, 0]), api.B.waist.R, [3.6, 0.7, 3.2], MAT.gold, P.acc);
    // a scarf tail behind the veil, streaming with the sway
    scarf(api, MAT.clothA);
  },
});
