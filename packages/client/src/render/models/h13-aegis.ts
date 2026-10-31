import { MAT, model, ramp, SKIN, GOLD, PART, hairShort, pauldrons, cape, eyes } from './kit';
// @ts-expect-error - plain JS module (the Bladerift fork of the PixelFX rig)
import { registerWeapon } from '../heroRig.js';
// @ts-expect-error - plain JS vendor module
import { hex } from '../../vendor/pixelfx/core/color.js';

/**
 * Aegis Marrow, the Warden (Shielder). From the portrait (assets/art/h-13.jpg): a stoic young woman knight, silver short
 * hair, teal eyes, teal-and-steel armour with a teal cloak at the shoulders, and a towering teal tower shield with a gold
 * star and a gold rim. She stands planted, immovable.
 */

const pack = (c: string) => (hex(c) as number) >>> 0;
const SHD = { rim: pack('#f0c85a'), rimD: pack('#a8782a'), face: pack('#1f7a82'), faceL: pack('#2f9aa2'), faceD: pack('#124a52'), star: pack('#ffd84a'), starD: pack('#b8862a'), boss: pack('#fff4b8') };

type Tfn = (i: number, k: number, colour: number, lift?: number) => void;

/**
 * The Warden's tower shield: a tall teal face with a gold rim and a gold star, the top square, the bottom tapering to a
 * point. Drawn like the rig's own shield (across the hand: i = out from the fist, k = up the shield, lift = across it).
 */
registerWeapon('warden-tower', {
  across: true,
  draw(T: Tfn) {
    for (let k = -15; k <= 10.01; k += 0.4) {
      const half = k < -12 ? 8.2 - (-12 - k) * 0.25 : k <= 4 ? 8.2 : 8.2 * Math.max(0, (10 - k) / 8);
      if (half <= 0.2) continue;
      const kk = k + 3; // the star's centre sits up the face
      for (let i = -1; i <= 2.2; i += 0.4) {
        for (let w = -half; w <= half + 0.01; w += 0.4) {
          const edge = Math.abs(w) > half - 0.4 || k < -14.2;
          const onStar = (Math.abs(w) < 1.2 && Math.abs(kk) < 5.4) || (Math.abs(kk) < 1.2 && Math.abs(w) < 4.4) || (Math.abs(w) + Math.abs(kk) < 2.2);
          const boss = Math.hypot(w, kk) < 1.3;
          const c = k < -14.2 ? (w < 0 ? SHD.rim : SHD.rimD) : edge ? (w < 0 ? SHD.faceL : SHD.faceD) : boss ? SHD.boss : onStar ? (w < 0 ? SHD.star : SHD.starD) : w < -half * 0.4 ? SHD.faceL : w > half * 0.5 ? SHD.faceD : SHD.face;
          T(w * 0.6 + 4, k, c, i * 0.35); // the face toward the camera (3/4 view), not edge-on
        }
      }
    }
  },
});

export default model({
  id: 'h13-aegis',
  size: 1.02,
  shape: { chest: [1.12, 1.06, 1.12], shoulder: 1.14, upper: 1.06, fore: 1.04, thigh: 1.08, shin: 1.06 },
  palettes: [
    ramp(0x2f8f96, 0.3, 0.3, 0.55), // shell: teal armour
    ramp(0x3a4456, 0.25, 0.3, 0.55), // core: dark steel joints and belt
    null, // steel: the weapons' own colours
    SKIN.fair,
    ramp(0x1d5c64, 0.3, 0.3, 0.55), // clothA: the teal cloak
    ramp(0x8a96a8, 0.3, 0.25, 0.5), // clothB: steel greaves and gauntlets
    ramp(0xe2e6ee, 0.3, 0.2, 0.45), // hair: silver
    GOLD, // gold: the star and trim
    ['#6ff5e6', '#4fe0d0', '#20b0a8', '#0a6c70'], // glow: teal eyes
    ramp(0x142028), // dark
    ramp(0xd8e0f0, 0.3, 0.2, 0.45), // accent: pale steel trim
    ramp(0xe8e4d8), // bone
    ramp(0x6a7480), // fur
  ],
  mats: { pelvis: MAT.shell, waist: MAT.core, chest: MAT.shell, shoulder: MAT.shell, upper: MAT.shell, elbow: MAT.core, fore: MAT.shell, hand: MAT.clothB, thigh: MAT.shell, knee: MAT.core, shin: MAT.clothB, foot: MAT.core },
  glow: [MAT.glow],
  weapons: { shield: 'warden-tower' },
  // planted: the weight a little low and forward, the chest square; never changes the air poses
  stance(p) {
    if (p.y !== undefined && Number(p.y) < -0.5) return p;
    return { ...p, crouch: Number(p.crouch ?? 0) + 1, lean: Number(p.lean ?? 0) + 1 };
  },
  extras(api) {
    // the teal cloak falling from the shoulders
    cape(api, MAT.clothA, 9, 3);
    pauldrons(api, MAT.accent, 1.15);
    // the gorget, a steel collar at the throat
    api.ellipsoid(api.at('neck', [0, -0.6, 0]), api.B.neck.R, [2.1, 1.7, 2.1], MAT.core, PART.acc);
    hairShort(api, MAT.hair, 1.04);
    eyes(api, MAT.glow, 0.4);
  },
});
