import { MAT, model, ramp, SKIN, hairShort, eyes, coatTails, PART } from './kit';
import type { ExtrasApi, Vec } from './kit';
// @ts-expect-error - plain JS module
import { registerWeapon } from '../heroRig.js';
// @ts-expect-error - plain JS module
import { hex } from '../../vendor/pixelfx/core/color.js';

type Draw = (i: number, k: number, colour: number, lift?: number) => void;
const C = (s: string): number => hex(s) >>> 0;

// The tide-spear: a dark ash haft threaded with cold blue light, and a long cold blue blade.
const HAFT = C('#3a4256');
const HAFT_D = C('#222838');
const VEIN = C('#9ff4ff');
const BLADE_HI = C('#ecfcff');
const BLADE_A = C('#a8ecf8');
const BLADE_B = C('#5cc4e0');
const BLADE_D = C('#2a7f9e');
registerWeapon('tide-spear', {
  two: -12,
  draw(T: Draw) {
    for (let i = -18; i <= 36.01; i += 0.4) for (let k = -0.5; k <= 0.51; k += 0.4) T(i, k, k > 0.1 ? HAFT_D : HAFT);
    for (const i of [-8, 2, 12, 22]) for (let k = -0.4; k <= 0.41; k += 0.4) T(i, k, VEIN, 0.5);
    for (let i = 36; i <= 47.01; i += 0.4) {
      const r = i - 36, wd = r > 6 ? Math.max(0, ((11 - r) / 5) * 2) : 2;
      for (let k = -wd; k <= wd + 0.01; k += 0.4) T(i, k, k < -0.8 ? BLADE_HI : k > 0.8 ? BLADE_D : k < 0 ? BLADE_A : BLADE_B);
    }
    for (let k = -2.4; k <= 2.4; k += 0.4) T(36, k, BLADE_D);
  },
});

/** A pale figure in a long black coat, cold blue eyes, two jellyfish spirits drifting near him. */
export default model({
  id: 'h03-nyx',
  palettes: [
    ramp(0x1a1e2c, 0.22, 0.2, 0.5), // 0 shell: the long coat
    ramp(0x0e1018), // 1 core: waist, elbows, knees
    null, // 2 weapons
    SKIN.pale, // 3 skin
    ramp(0x232838), // 4 clothA: trousers
    ramp(0x0c0d14), // 5 clothB: boots
    ramp(0x1a1a28, 0.3, 0.2, 0.5), // 6 hair: black, a faint blue sheen
    ['#e6ecff', '#a8b4d0', '#6a7490', '#2c3248'], // 7 gold: pale silver ornaments on the coat
    ['#9ff4ff', '#7ae8f5', '#5ccbe0', '#3aa8c0'], // 8 glow: the cold blue eyes and jellyfish bells
    ramp(0x06060a), // 9 dark
    ramp(0x3ac0d8, 0.3, 0.25, 0.5), // 10 accent: jellyfish tentacles
  ],
  mats: { pelvis: MAT.shell, upper: MAT.shell },
  weapons: { spear: 'tide-spear' },
  shape: { chest: [0.95, 1, 0.92], upper: 0.92, fore: 0.92, thigh: 0.94 },
  glow: [MAT.glow],
  stance(pose) {
    // a calm, loose carriage: a touch of lean back when he is not doing anything with his body
    return Number(pose.lean ?? 0) === 0 ? { ...pose, lean: -1 } : pose;
  },
  extras(api: ExtrasApi) {
    coatTails(api, MAT.shell, 12);
    // the back of the long coat, down to the hips
    api.sweep(api.at('chest', [-2.8, -1, 0]), api.at('pelvis', [-3.6, -4, 0]), 3, 2.6, MAT.shell, PART.cloth);
    // a high standing collar
    api.sweep(api.at('neck', [-0.4, -0.4, 0]), api.at('neck', [-0.5, 3.4, 0]), 2.2, 2.1, MAT.shell, PART.cloth);
    // a fine silver chain down the coat front, with a pendant
    api.sweep(api.at('chest', [3.6, 3, 2.8]), api.at('chest', [3.9, -2, 2.8]), 0.25, 0.25, MAT.gold, PART.acc);
    api.sphere(api.at('chest', [3.9, -2.6, 2.8]), 0.45, MAT.gold, PART.acc);
    // dark messy hair, with a few strands thrown back
    hairShort(api, MAT.hair, 1.1);
    api.sweep(api.at('head', [-1.2, 2.6, 0.6]), api.at('head', [-4.6, 1.2, 1.4]), 1.1, 0.4, MAT.hair, PART.hair);
    api.sweep(api.at('head', [-1.6, 2.4, -1.2]), api.at('head', [-4.8, 0.6, -2.2]), 1, 0.4, MAT.hair, PART.hair);
    eyes(api, MAT.glow, 0.4);
    // two small jellyfish spirits, one high behind him and one low behind the coat
    jelly(api, api.at('head', [-7, 5, -5]), 1, 1);
    jelly(api, api.at('chest', [-8, -4, 6]), 0.8, -1);
  },
});

/** A translucent-looking jellyfish: a glowing bell and three trailing tentacles that sway with the movement. */
function jelly(api: ExtrasApi, c: Vec, size: number, phase: number) {
  const s = Number(api.q.cloth ?? 0);
  api.ellipsoid(c, api.B.head.R, [1.9 * size, 1.25 * size, 1.9 * size], MAT.glow, PART.glow);
  for (const z of [-1.1, 0, 1.1]) {
    const a = api.add(c, [-0.4 * size, -1 * size, z * size]);
    const b = api.add(a, [-1.6 * size - s * 1.4 * phase, -3.6 * size, z * 0.6 * size]);
    api.sweep(a, b, 0.35 * size, 0.12, MAT.accent, PART.acc2);
  }
}
