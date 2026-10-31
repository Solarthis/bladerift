import { DEFAULT_MATS, MAT, PART, GOLD, SKIN, book, chainLinks, eyes, model, ramp } from './kit';
import type { ExtrasApi, Vec } from './kit';
// @ts-expect-error - plain JS vendor module (PixelFX colour helper)
import { hex } from '../../vendor/pixelfx/core/index.js';
// @ts-expect-error - plain JS module (the Bladerift fork of the PixelFX rig)
import { registerWeapon } from '../heroRig.js';

/**
 * Quill, the Storyteller (Caster). Big, jovial and relaxed: wild orange curls and a short beard, a loose white shirt
 * with rolled sleeves under a brown waistcoat, charcoal slacks, a staff that is a giant quill pen, and an open book
 * that glows gold in his far hand (portrait: assets/art/h-06.jpg).
 */

const C = (s: string): number => (hex(s) as number) >>> 0;

// the staff is a giant quill: a pale calamus with a gold binding and an ink-dark nib, and a feather vane on top
const QUILL = { shaft: C('#f2e4c4'), shaftD: C('#b89a64'), gold: C('#ffd860'), goldD: C('#b8862a'), ink: C('#2a1a14'), vane: C('#fffcf2'), vaneM: C('#efe6d0'), vaneD: C('#c9bda0'), rachis: C('#6a5238') };
registerWeapon('quill-staff', {
  two: -10,
  draw(T: (i: number, k: number, c: number, lift?: number) => void) {
    for (let i = -14; i <= 23.01; i += 0.4) for (let k = -0.8; k <= 0.81; k += 0.4) T(i, k, k > 0.1 ? QUILL.shaftD : QUILL.shaft);
    for (let i = 19.6; i <= 21.01; i += 0.4) for (let k = -1.4; k <= 1.41; k += 0.4) T(i, k, i > 20.4 && i < 20.8 ? QUILL.goldD : QUILL.gold);
    for (let i = 23; i <= 24.6; i += 0.4) for (let k = -1; k <= 1.01; k += 0.4) T(i, k, QUILL.ink);
    // the vane: a giant feather, widest about a third of the way up, with a dark rachis down its spine
    for (let i = 24.2; i <= 46.01; i += 0.4) {
      const u = (i - 24) / 22;
      const w = 0.3 + 4.4 * Math.pow(Math.max(0, Math.sin(Math.PI * Math.min(1, u))), 0.75);
      for (let k = -w; k <= w + 0.01; k += 0.4) {
        const c = Math.abs(k) < 0.45 ? QUILL.rachis : k < -w * 0.3 ? QUILL.vane : k > w * 0.3 ? QUILL.vaneD : QUILL.vaneM;
        T(i, k, c);
      }
    }
  },
});

/** Wild curls: a cap set back off the face, a forelock, and balls of curl round the skull and down the back. */
function curls(api: ExtrasApi) {
  api.ellipsoid(api.at('head', [-1.4, 1.0, 0]), api.B.head.R, [3.1, 3.2, 3.1], MAT.hair, PART.hair);
  api.sphere(api.at('head', [1.0, 2.6, 0]), 1.5, MAT.hair, PART.hair);
  const pts: Vec[] = [[-2.4, 1.8, 1.4], [-2.6, 0, -1.2], [-1.0, 3.4, 1.0], [0.4, 3.4, -1.0], [-2.0, 3.0, -1.6], [-3.0, -0.8, 0.6], [-0.4, 4.0, 0]];
  for (const p of pts) api.sphere(api.at('head', p), 1.5, MAT.hair, PART.hair);
}

/** The open book in the far hand: a crimson cover, pages that glow gold, and a little light spilling off them. */
function openBook(api: ExtrasApi) {
  book(api, MAT.accent, MAT.glow);
  const h = api.joints.handF;
  api.sphere(api.add(h, [3.4, 2.4, 0.6]), 0.5, MAT.glow, PART.glow);
  api.sphere(api.add(h, [-0.6, 2.2, 1.6]), 0.4, MAT.glow, PART.glow);
}

export default model({
  id: 'h06-quill',
  size: 1.1,
  shape: {
    head: [1.04, 1.04, 1.04], face: [1.04, 1.04, 1.04], chest: [1.12, 1.05, 1.18], pelvis: [1.12, 1.0, 1.12],
    waist: 1.15, neck: 1.08, upper: 1.1, fore: 1.08, thigh: 1.08, shin: 1.05,
  },
  palettes: [
    ramp(0xf0ece0, 0.3, 0.2, 0.45), // shell: white shirt and sleeves
    ramp(0x3a2418), // core: leather belt, knees
    null, // steel: the weapons' own colours
    SKIN.warm, // skin
    ramp(0x6a3f22), // clothA: brown waistcoat
    ramp(0x2e2a36), // clothB: charcoal slacks
    ramp(0xf07a2a, 0.3, 0.25, 0.5), // hair and beard: ginger
    GOLD, // gold: watch chain
    ['#ffd860', '#ffd860', '#ffd860', '#ffd860'], // glow: the book's pages and the light off them
    ramp(0x2a1a14), // dark: boots, eyes
    ramp(0x8a2a1a), // accent: the book's cover
    ramp(0xf6eedb), // bone
    ramp(0xe0d0e0),
  ],
  // (model() replaces `mats` rather than merging it, so the defaults are spread in here)
  mats: { ...DEFAULT_MATS, pelvis: MAT.clothB, thigh: MAT.clothB, shin: MAT.clothB, waist: MAT.core, knee: MAT.core, upper: MAT.shell, fore: MAT.skin, foot: MAT.dark },
  glow: [MAT.glow],
  weapons: { staff: 'quill-staff' },
  extras(api) {
    curls(api);
    // beard: short and full along the jaw
    api.ellipsoid(api.at('head', [1.3, -1.7, 0]), api.B.head.R, [2.0, 1.6, 2.3], MAT.hair, PART.hair);
    eyes(api, MAT.dark, 0.4);
    // the waistcoat's two front panels, with the loose white shirt showing between them
    for (const z of [-1.9, 1.9]) api.ellipsoid(api.at('chest', [2.4, -0.8, z]), api.B.chest.R, [1.7, 3.3, 1.5], MAT.clothA, PART.cloth);
    chainLinks(api, api.at('chest', [2.8, -2.4, 1.4]), api.at('chest', [3.0, -2.0, -1.2]), MAT.gold, 4, 0.45);
    openBook(api);
  },
  // relaxed and jovial: leaning back a touch, knees easy
  stance(p) {
    return { ...p, lean: Number(p.lean ?? 0) - 1, crouch: Number(p.crouch ?? 0) + 1 };
  },
});
