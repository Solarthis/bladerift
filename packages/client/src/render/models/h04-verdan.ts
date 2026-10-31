import { MAT, model, ramp, SKIN, GOLD, hairLong, robe, eyes, PART } from './kit';
import type { ExtrasApi, Vec } from './kit';
// @ts-expect-error - plain JS module
import { registerWeapon } from '../heroRig.js';
// @ts-expect-error - plain JS module
import { hex } from '../../vendor/pixelfx/core/color.js';

type Draw = (i: number, k: number, colour: number, lift?: number) => void;
const C = (s: string): number => hex(s) >>> 0;

// The chain-lance: a pale jade shaft wound with gold chain rings, and a gold leaf-blade with a jade vein.
const JADE = C('#c8e8d2');
const JADE_D = C('#8ab8a0');
const JADE_VEIN = C('#8ff5b8');
const GOLD_HI = C('#fff3b0');
const GOLD_M = C('#ffd84a');
const GOLD_D = C('#e9b64a');
const GOLD_DD = C('#a8742a');
registerWeapon('chain-lance', {
  two: -12,
  draw(T: Draw) {
    for (let i = -18; i <= 36.01; i += 0.4) for (let k = -0.5; k <= 0.51; k += 0.4) T(i, k, k > 0.1 ? JADE_D : JADE);
    // the chain: a ring of links every 2 px, lit on top and dark underneath
    for (let i = -18; i <= 35.01; i += 2) for (let t = 0; t < 6.28; t += 0.8) {
      T(i, Math.cos(t) * 0.9, Math.sin(t) > 0 ? GOLD_M : GOLD_DD, Math.sin(t) * 0.9);
    }
    // the blade: a gold leaf with a jade vein
    for (let i = 36; i <= 47.01; i += 0.4) {
      const r = i - 36, wd = r > 6 ? Math.max(0, ((11 - r) / 5) * 2.2) : 2.2;
      for (let k = -wd; k <= wd + 0.01; k += 0.4) T(i, k, k < -1 ? GOLD_HI : k > 1 ? GOLD_DD : GOLD_D);
    }
    for (let i = 37; i <= 45; i += 0.4) T(i, 0, JADE_VEIN, 0.3);
    for (let k = -2.4; k <= 2.4; k += 0.4) T(36, k, GOLD_DD);
  },
});

/** A serene, upright figure in long pale robes, very long mint hair, green eyes, golden chains on a raised hand. */
export default model({
  id: 'h04-verdan',
  shape: { chest: [0.92, 1, 0.9], upper: 0.9, fore: 0.9, thigh: 0.92 },
  palettes: [
    ramp(0xe8e8d8, 0.3, 0.2, 0.45), // 0 shell: the white robe top
    ramp(0xc8c8b4), // 1 core: waist, elbows, knees
    null, // 2 weapons
    SKIN.pale, // 3 skin
    ramp(0xe0e2d0, 0.3, 0.2, 0.45), // 4 clothA: the robe
    ramp(0x8a8a74), // 5 clothB: feet
    ramp(0x7fd8a0, 0.35, 0.25, 0.5), // 6 hair: mint green
    GOLD, // 7 gold: the chains
    ['#8ff5b8', '#5ee39a', '#3fc27e', '#2a9060'], // 8 glow: green eyes
    ramp(0x2a3a30), // 9 dark
    ramp(0xffd84a), // 10 accent
  ],
  mats: { chest: MAT.clothA, upper: MAT.clothA, fore: MAT.clothA, shin: MAT.clothA },
  weapons: { spear: 'chain-lance' },
  glow: [MAT.glow],
  stance(pose) {
    // upright and poised: the chest a little forward, on the same carriage every pose
    return Number(pose.lean ?? 0) === 0 ? { ...pose, lean: 1 } : pose;
  },
  extras(api: ExtrasApi) {
    robe(api, MAT.clothA, 1.05);
    // a gold sash at the waist
    api.sweep(api.at('waist', [0, 0.5, -3.4]), api.at('waist', [0, 0.5, 3.4]), 0.9, 0.9, MAT.gold, PART.acc);
    // very long mint hair, and a braid falling over the near shoulder
    hairLong(api, MAT.hair, 20, 2.4);
    for (let i = 0; i < 6; i++) {
      api.sphere(api.at('chest', [2.4 - (i % 2) * 0.5, 2.6 - i * 1.9, 3.6]), i % 2 ? 0.95 : 1.15, MAT.hair, PART.hair);
    }
    // golden chains: wound round the raised far arm, and trailing from the hand
    chainLine(api, api.joints.elbowF, api.joints.handF, 6, MAT.gold);
    chainLine(api, api.joints.handF, api.add(api.joints.handF, [-5, -7, 0]), 4, MAT.gold);
    eyes(api, MAT.glow, 0.44);
  },
});

/** A chain of linked rings from a to b: a continuous run of short sweeps with a bead at each link (not loose dots). */
function chainLine(api: ExtrasApi, a: Vec, b: Vec, n: number, mat: number) {
  const at = (i: number): Vec => api.add(a, api.mul(api.sub(b, a), i / n));
  for (let i = 0; i < n; i++) api.sweep(at(i), at(i + 1), 0.5, 0.5, mat, PART.acc2);
  for (let i = 0; i <= n; i++) api.sphere(at(i), 0.62, mat, PART.acc2);
}
