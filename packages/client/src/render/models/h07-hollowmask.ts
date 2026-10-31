import { MAT, model, ramp, BONE } from './kit';
// @ts-expect-error - plain JS module
import { registerWeapon } from '../heroRig.js';
// @ts-expect-error - plain JS module
import { hex } from '../../vendor/pixelfx/core/color.js';

/**
 * Hollowmask, the Grasping Shade (Assassin, Phantom Hand). From the portrait (assets/art/h-07.jpg): a white skull
 * for a face with dark sockets that glow faintly teal, a tattered black cowl and a long ragged cloak, a pale spectral
 * claw, and a hunched, gliding carriage. Short bone-white curved knives (about 6.5 px) and the Art's claw as a spectral hand.
 */
const C = (s: string) => hex(s) >>> 0;
const KNIFE = { hi: C('#ffffff'), a: C('#e6e0d0'), d: C('#a89c88'), grip: C('#1c1c24'), gripD: C('#08080c') };
const SPECTRAL = { core: C('#eafff8'), edge: C('#8ff0d4'), deep: C('#3fae92') };

// the twin knives: a short, curved bone blade (about 6.5 px) on a dark grip
registerWeapon('bone-knife', {
  draw(T: (i: number, k: number, c: number, lift?: number) => void) {
    for (let i = -2.6; i <= 1.8; i += 0.4) for (let k = -0.7; k <= 0.71; k += 0.4) T(i, k, k > 0.1 ? KNIFE.gripD : KNIFE.grip);
    for (let k = -1.5; k <= 1.51; k += 0.4) T(2.2, k, KNIFE.d);
    for (let i = 2.6; i <= 9.2 + 0.01; i += 0.4) {
      const u = (i - 2.6) / 6.6, c = 1.3 * u * u, w = Math.max(0.25, 1.0 * (1 - u * 0.9));
      for (let k = c - w; k <= c + w + 0.01; k += 0.4) T(i, k, k < c - w * 0.3 ? KNIFE.hi : k > c + w * 0.3 ? KNIFE.d : KNIFE.a);
    }
  },
});

// the Phantom Hand's claw: three long spectral fingers that curl forward, pale with teal tips
registerWeapon('shade-claw', {
  draw(T: (i: number, k: number, c: number, lift?: number) => void) {
    for (const q0 of [-2.4, 0, 2.4])
      for (let i = 1.5; i <= 11.5; i += 0.4) {
        const u = (i - 1.5) / 10, k = q0 + u * u * 2.6;
        T(i, k, u > 0.6 ? SPECTRAL.edge : SPECTRAL.core);
        if (u < 0.7) T(i, k + 0.8, SPECTRAL.deep);
      }
  },
});

export default model({
  id: 'h07-hollowmask',
  size: 1,
  shape: { chest: [0.9, 0.98, 0.86], neck: 0.9, upper: 0.85, fore: 0.8, thigh: 0.9, shin: 0.86, pelvis: 0.92, head: [0.96, 1.05, 0.94] },
  bones: { fore: 8.4 },
  // bone-white skull, black cowl and cloak, a grey-white pewter trim, teal sockets
  palettes: [
    ramp(0x34343e, 0.25, 0.25, 0.5),
    ramp(0x1a1a20),
    null,
    BONE,
    ramp(0x2c2c36),
    ramp(0x1c1c24),
    ramp(0x0c0c10),
    ['#d8d8e0', '#9a9aa8', '#5c5c68', '#2a2a32'],
    ['#7affd0', '#7affd0', '#7affd0', '#7affd0'],
    ramp(0x06060a),
    ramp(0x2a2a34),
    BONE,
    ramp(0x2c2c36),
  ],
  mats: {
    pelvis: MAT.clothB, waist: MAT.core, chest: MAT.shell, neck: MAT.clothA,
    head: MAT.skin, face: MAT.skin,
    shoulder: MAT.shell, upper: MAT.shell, elbow: MAT.core, fore: MAT.shell, hand: MAT.fur,
    thigh: MAT.clothB, knee: MAT.core, shin: MAT.clothB, foot: MAT.clothB,
  },
  glow: [MAT.glow],
  weapons: { dagger: 'bone-knife', claw: 'shade-claw' },
  // hunched and gliding: the shoulders roll forward, the head drops a little; in the air he trails low
  stance(p: Record<string, unknown>) {
    const y = Number(p.y ?? 0);
    if (y < -0.5) return { ...p, lean: Number(p.lean ?? 0) + 1.5 };
    return { ...p, crouch: Number(p.crouch ?? 0) + 1.5, lean: Number(p.lean ?? 0) + 1, hy: Number(p.hy ?? 0) - 1 };
  },
  extras(api) {
    const P = api.PART;
    const s = Number(api.q.cloth ?? 0);
    const air = api.q.air ? 1 : 0;
    // the cowl: a dark hood over the crown and back, its brow left as the bone skull
    api.ellipsoid(api.at('head', [-1.0, 1.2, 0]), api.B.head.R, [3.5, 3.2, 3.3], MAT.clothA, P.cloth);
    // it falls onto the shoulders
    api.sweep(api.at('head', [-2.4, -0.8, 0]), api.at('chest', [-2.8, 1.4, 0]), 2.6, 3.0, MAT.clothA, P.cloth);
    // dark sockets with the teal glow in them, and the nasal hollow of the skull
    api.ellipsoid(api.at('head', [2.5, 0.6, 0.9]), api.B.head.R, [1.0, 1.1, 1.0], MAT.dark, P.acc);
    api.sphere(api.at('head', [2.95, 0.6, 1.25]), 0.5, MAT.glow, P.glow);
    api.ellipsoid(api.at('head', [2.7, -0.7, 0.1]), api.B.head.R, [0.5, 0.9, 0.7], MAT.dark, P.acc);
    // the long ragged cloak from the shoulders down the back, streaming with the sway
    for (const z of [-2.2, -0.7, 0.8, 2.2]) {
      const a = api.at('chest', [-2.4, 1.6, z * 0.9]);
      const b = api.at('pelvis', [-3.6 - s * 3 - air * 2, -4, z * 1.05]);
      api.sweep(a, b, 1.7, 1.2, MAT.clothA, P.cape);
    }
    // the rags at its hem, trailing further back
    for (const [z, L] of [[-1.5, 8], [0, 10], [1.5, 7]] as const) {
      const a = api.at('pelvis', [-3, -2, z]);
      const b = api.add(a, [-L * 0.6 - s * 4 - air * 2, -L, z * 0.2]);
      api.sweep(a, b, 1.0, 0.25, MAT.accent, P.cloth);
    }
  },
});
