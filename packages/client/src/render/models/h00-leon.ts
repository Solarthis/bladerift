import { MAT, model, ramp, SKIN, GOLD, BONE, PART, hairShort, pauldrons, cape, eyes } from './kit';
// @ts-expect-error - plain JS module (the Bladerift fork of the PixelFX rig)
import { registerWeapon, STEEL } from '../heroRig.js';
// @ts-expect-error - plain JS vendor module
import { hex } from '../../vendor/pixelfx/core/color.js';

/**
 * Leon Valcrest, the Lionheart King (Saber). From the portrait (assets/art/h-00.jpg): short wild golden-blond hair with a
 * crimson streak across the brow, red eyes, ivory-and-gold plate with a lion emblem on the breast, a crimson cape with an
 * ermine collar, and his own gold-hilted longsword with a crimson grip.
 */

const pack = (c: string) => (hex(c) as number) >>> 0;
const LH = { crimson: pack('#b8242e'), crimsonD: pack('#6a1018'), gold: pack('#ffd84a'), goldD: pack('#b8862a'), goldL: pack('#fff4b8') };

type Tfn = (i: number, k: number, colour: number, lift?: number) => void;

/** The Lionheart: a longsword, gold quillons and pommel, a crimson-wrapped grip and a blade with a gold fuller. */
registerWeapon('lionheart', {
  two: -4.4,
  draw(T: Tfn, q: { two?: unknown }) {
    const end = q.two ? -6.5 : -2.6;
    // pommel: a gold disc, then the grip
    for (let i = end - 0.9; i <= end - 0.1; i += 0.4) for (let k = -1.5; k <= 1.51; k += 0.4) T(i, k, k > 0.5 ? LH.goldD : LH.gold);
    for (let i = end; i <= 2.2; i += 0.4) for (let k = -0.95; k <= 0.96; k += 0.4) T(i, k, k > 0.1 ? LH.crimsonD : LH.crimson);
    for (const i of [end + 0.6, 1.4]) for (let k = -1.1; k <= 1.11; k += 0.4) T(i, k, LH.gold);
    // quillons: a long gold bar, its ends dropping
    for (let k = -5.2; k <= 5.21; k += 0.4) {
      const tip = Math.abs(k) > 4.4;
      for (let i = tip ? 1.8 : 2.2; i <= 3.2; i += 0.4) T(i, k, Math.abs(k) > 3.6 ? LH.goldD : LH.gold);
    }
    // the blade: a long, slightly tapering edge with a gold fuller down the middle
    const from = 3.4, length = 25, w = 2.3;
    for (let i = from; i <= from + length + 0.01; i += 0.4) {
      const r = i - from, wd = r > length - 5 ? Math.max(0, ((length - r) / 5) * w) : w;
      for (let k = -wd; k <= wd + 0.01; k += 0.4) T(i, k, k < -w * 0.4 ? STEEL.hi : k > w * 0.4 ? STEEL.d : STEEL.a);
    }
    for (let i = from + 1.5; i <= from + length - 5; i += 0.4) T(i, 0, LH.goldL);
  },
});

export default model({
  id: 'h00-leon',
  size: 1.04,
  shape: { chest: [1.1, 1.05, 1.1], shoulder: 1.1, upper: 1.04, fore: 1.02, thigh: 1.04 },
  palettes: [
    ramp(0xeeeae0, 0.3, 0.25, 0.5), // shell: ivory plate
    ramp(0x2c2638), // core: dark leather and joints
    null, // steel: the weapons' own colours
    SKIN.fair,
    ramp(0xb42a32, 0.3, 0.3, 0.55), // clothA: crimson tassets and thighs
    ramp(0x3a2a24), // clothB: dark leather boots
    ramp(0xf4cc4a, 0.35, 0.25, 0.5), // hair: golden blond
    GOLD, // gold: trim, gauntlets, the lion
    ['#ff6a50', '#ff3a2a', '#d01a1a', '#8a0a0a'], // glow: red eyes
    ramp(0x1c1620), // dark
    ramp(0xc8242e, 0.3, 0.3, 0.55), // accent: the cape and the brow streak
    BONE, // bone
    BONE, // fur: the ermine collar
  ],
  mats: { pelvis: MAT.shell, waist: MAT.core, chest: MAT.shell, shoulder: MAT.shell, upper: MAT.shell, elbow: MAT.core, fore: MAT.shell, hand: MAT.gold, thigh: MAT.clothA, knee: MAT.gold, shin: MAT.shell, foot: MAT.clothB },
  glow: [MAT.glow],
  weapons: { sword: 'lionheart' },
  // a proud carriage: chest up and out, chin lifted; the same on the ground, nothing changed in the air
  stance(p) {
    if (p.y !== undefined && Number(p.y) < -0.5) return p;
    return { ...p, lean: Number(p.lean ?? 0) - 1, hy: Number(p.hy ?? 0) - 0.5 };
  },
  extras(api) {
    cape(api, MAT.accent, 15, 3.4);
    // the ermine collar, round the neck and over the shoulders
    for (let z = -2.6; z <= 2.61; z += 1.3) api.sphere(api.at('neck', [-0.6, -1.2, z]), 1.3, MAT.fur, PART.cloth);
    pauldrons(api, MAT.shell, 1.1);
    hairShort(api, MAT.hair, 1.04);
    // a few wild tufts swept back, kept low so the head reads as hair, not a crown
    for (const a of [0.2, 0.9, 1.6]) api.sweep(api.at('head', [0.5, 2.6, 0]), api.at('head', [-1.8 - a, 2.4 + a * 0.8, 0.4 * (a - 0.9)]), 0.9, 0.3, MAT.hair, PART.hair);
    // the crimson streak: a short slash across the forehead, clear of the eyes (it reads as a band over them at game size)
    api.sweep(api.at('head', [1.2, 3.0, 2.6]), api.at('head', [-0.4, 2.8, 2.5]), 0.42, 0.32, MAT.accent, PART.hair);
    // the lion emblem on the breast
    api.ellipsoid(api.at('chest', [0.8, 0.8, 4.6]), api.B.chest.R, [1.9, 2.2, 0.6], MAT.gold, PART.acc);
    eyes(api, MAT.glow, 0.48);
  },
});
