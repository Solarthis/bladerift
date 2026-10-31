import { DEFAULT_MATS, MAT, PART, GOLD, SKIN, coatTails, eyes, model, ramp } from './kit';
import type { ExtrasApi, Vec } from './kit';
// @ts-expect-error - plain JS vendor module (PixelFX colour helper)
import { hex } from '../../vendor/pixelfx/core/index.js';
// @ts-expect-error - plain JS module (the Bladerift fork of the PixelFX rig)
import { registerWeapon } from '../heroRig.js';

/**
 * Lumi Sorrelle, the Illusionist (Caster). Small and bouncy: a pastel-pink bob with a fringe and a stray curl, violet
 * eyes, a crimson academy coat over a white blouse with a pink bow, a plum skirt, pink arcane sigils on both palms and
 * a slim wand with a glowing pink star crystal (portrait: assets/art/h-05.jpg).
 */

const C = (s: string): number => (hex(s) as number) >>> 0;

// the wand: a slim ivory shaft with gold bands, and a four-point star crystal drawn flat in the weapon's plane
const WAND = { shaft: C('#f4ecf8'), shaftD: C('#b9a2c8'), gold: C('#ffd860'), hi: C('#fff6fd'), gem: C('#ff7ad0'), gemD: C('#c23c9a'), spark: C('#ffc2ec') };
registerWeapon('lumi-wand', {
  two: -10,
  draw(T: (i: number, k: number, c: number, lift?: number) => void) {
    for (let i = -12; i <= 30.01; i += 0.4) for (let k = -0.6; k <= 0.61; k += 0.4) T(i, k, k > 0.1 ? WAND.shaftD : WAND.shaft);
    for (const i of [-9, 25]) for (let k = -1.1; k <= 1.11; k += 0.4) T(i, k, WAND.gold);
    // the star: |u|^0.5 + |v|^0.5 <= 1 is a four-point astroid, centred at i = 35.5
    const cx = 35.5, a = 4.6, b = 3.4;
    for (let i = 30.4; i <= 40.6; i += 0.4) for (let k = -b; k <= b + 0.01; k += 0.4) {
      const u = Math.abs(i - cx) / a, v = Math.abs(k) / b;
      if (Math.sqrt(u) + Math.sqrt(v) > 1) continue;
      T(i, k, u + v < 0.4 ? WAND.hi : k < 0 ? WAND.gem : WAND.gemD);
    }
    T(42, 2.4, WAND.spark);
    T(40.5, -4.4, WAND.spark);
    T(29.4, 3.6, WAND.spark);
  },
});

/** Pastel bob: a cap and fringe, the bob curling under at the back, and a stray curl on top that bounces. */
function bob(api: ExtrasApi) {
  const s = Number(api.q.cloth ?? 0), air = api.q.air ? 1 : 0;
  // the cap sits back off the face (a full skull cap would hide the eyes from the side)
  api.ellipsoid(api.at('head', [-1.7, 1.3, 0]), api.B.head.R, [3.1, 3.1, 3.1], MAT.hair, PART.hair);
  // a short fringe swept across the brow, kept above the eye line
  api.sweep(api.at('head', [-0.2, 3.5, 0]), api.at('head', [1.9, 2.5, 0]), 1.15, 0.85, MAT.hair, PART.hair);
  const top = api.at('head', [-1.6, 0.6, 0]);
  const mid = api.add(api.at('head', [-3.0, -1.5, 0]), [-s * 1.2, 0, 0]);
  const end = api.add(api.at('head', [-2.8, -3.4, 0]), [-s * 2.2, air * 1.2, 0]);
  api.sweep(top, mid, 2.5, 2.3, MAT.hair, PART.hair);
  api.sweep(mid, end, 2.3, 1.8, MAT.hair, PART.hair);
  for (const z of [-1.3, 1.3]) api.sphere(api.add(end, [-0.6 - s, -0.4, z]), 1.0, MAT.hair, PART.hair);
  // the stray curl
  const c1 = api.at('head', [0.4, 4.6, 0]);
  api.sweep(api.at('head', [0.6, 3.0, 0]), c1, 0.7, 0.55, MAT.hair, PART.hair);
  api.sweep(c1, api.add(c1, [1.4 + s * 0.6, 0.6 + air * 0.4, 0]), 0.55, 0.3, MAT.hair, PART.hair);
}

/** Sigils: a ring of glowing motes round each palm. */
function sigil(api: ExtrasApi, c: Vec) {
  for (let n = 0; n < 4; n++) {
    const a = (n / 4) * Math.PI * 2 + Math.PI / 4;
    api.sphere([c[0] + Math.cos(a) * 1.5, c[1] + Math.sin(a) * 1.5, c[2]], 0.42, MAT.accent, PART.glow);
  }
  api.sphere(c, 0.5, MAT.accent, PART.glow);
}

export default model({
  id: 'h05-lumi',
  size: 0.92,
  shape: { head: [1.06, 1.06, 1.05], face: [1.06, 1.06, 1.05], chest: [0.9, 0.95, 0.88], upper: 0.88, fore: 0.86, thigh: 0.9, shin: 0.88 },
  palettes: [
    ramp(0xa82838, 0.3, 0.28, 0.55), // shell: crimson coat
    ramp(0x3a1a26), // core: dark belt and knees
    null, // steel: the weapons' own colours
    SKIN.fair, // skin
    ramp(0x2c1a26), // clothA: plum-black skirt
    ramp(0x241a2a), // clothB: dark stockings
    ramp(0xf7b4de, 0.35, 0.22, 0.45), // hair: pastel pink
    GOLD, // gold: clasp, wand bands
    ['#b98cff', '#b98cff', '#b98cff', '#b98cff'], // glow: violet eyes
    ramp(0x140e18), // dark: boots
    ['#ff7ad0', '#ff7ad0', '#ff7ad0', '#ff7ad0'], // accent: pink sigils, bow (unshaded)
    ramp(0xfbf6fa, 0.3, 0.2, 0.45), // bone: white blouse
    ramp(0xe0d0e0),
  ],
  // (model() replaces `mats` rather than merging it, so the defaults are spread in here)
  mats: { ...DEFAULT_MATS, pelvis: MAT.clothA, thigh: MAT.clothA, shin: MAT.clothB, knee: MAT.core, waist: MAT.core, foot: MAT.dark },
  glow: [MAT.glow, MAT.accent],
  weapons: { staff: 'lumi-wand' },
  extras(api) {
    bob(api);
    // violet eyes: large and unshaded so they read at gameplay size
    api.sphere(api.at('head', [2.7, 0.4, 1.15]), 0.6, MAT.glow, PART.glow);
    // the white blouse, the crimson bow and the gold clasp at the coat's front
    api.ellipsoid(api.at('chest', [2.9, -0.4, 0]), api.B.chest.R, [1.5, 3.0, 1.9], MAT.bone, PART.acc2);
    for (const z of [-1, 1]) api.ellipsoid(api.at('neck', [1.3, -1.6, z * 1.1]), api.B.neck.R, [0.8, 1.1, 1.1], MAT.accent, PART.acc);
    api.sphere(api.at('neck', [1.5, -1.6, 0]), 0.55, MAT.accent, PART.acc);
    api.sphere(api.at('chest', [3.6, -1.6, 0]), 0.5, MAT.gold, PART.acc2);
    // the high coat collar
    api.sweep(api.at('neck', [-0.4, 0.4, -1.6]), api.at('neck', [-0.4, 0.4, 1.6]), 1.5, 1.5, MAT.shell, PART.acc);
    coatTails(api, MAT.shell, 8);
    sigil(api, api.joints.handN);
    sigil(api, api.joints.handF);
  },
  // a small, bouncy carriage: a little forward and bent at the knee
  stance(p) {
    return { ...p, lean: Number(p.lean ?? 0) + 1, crouch: Number(p.crouch ?? 0) + 1 };
  },
});
