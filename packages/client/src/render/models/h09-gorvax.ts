// @ts-expect-error - plain JS module
import { registerWeapon } from '../heroRig.js';
// @ts-expect-error - plain JS module
import { hex } from '../../vendor/pixelfx/core/color.js';
import { MAT, model, ramp, PART } from './kit';
import type { ExtrasApi, Vec } from './kit';

/**
 * Gorvax, the Chimera Engine (Berserker). A hulking, hunched beast-engine: riveted iron plates over flesh, a lion mane of
 * dark cables with brass rings, a tawny muzzle with fangs, two red eyes under an iron brow, steam venting from the jaw.
 * Swings an iron engine-hammer.
 */

const C = (h: string): number => (hex(h) as number) >>> 0;
type Along = (i: number, k: number, colour: number, lift?: number) => void;
type Face = 'near' | 'far' | 'end' | 'rear' | 'side';

/** A solid block along a weapon's handle: i from the fist, k across, lift (the handle's normal) +-h. Paints its surface. */
function box(T: Along, i0: number, i1: number, k0: number, k1: number, h: number, paint: (face: Face, i: number, k: number) => number) {
  const ni = Math.round((i1 - i0) / 0.4), nk = Math.round((k1 - k0) / 0.4), nl = Math.round((2 * h) / 0.4);
  for (let a = 0; a <= ni; a++)
    for (let b = 0; b <= nk; b++)
      for (let c = 0; c <= nl; c++) {
        if (a > 0 && a < ni && b > 0 && b < nk && c > 0 && c < nl) continue;
        const i = i0 + a * 0.4, k = k0 + b * 0.4;
        // lift -h is the face toward the viewer (the weapon's normal points away from the viewer, see along())
        const face: Face = c === 0 ? 'near' : c === nl ? 'far' : a === ni ? 'end' : a === 0 ? 'rear' : 'side';
        T(i, k, paint(face, i, k), -h + c * 0.4);
      }
}

const IRON = { hi: C('#e4e8ee'), a: C('#9aa2b2'), b: C('#6c7486'), d: C('#424a5c'), dd: C('#262a36') };
const BRASS = { hi: C('#ffe08a'), a: C('#c8903a'), d: C('#6a4418') };
const HOT = C('#ff3a2a');

// the engine-hammer: a piston shaft with brass collars, a squat iron block with a glowing core and riveted brass band
registerWeapon('engine-hammer', {
  two: -7,
  draw(T: Along) {
    box(T, -9, 16, -0.9, 0.9, 0.9, (f) => (f === 'near' ? IRON.b : f === 'far' ? IRON.dd : IRON.d));
    box(T, -6.4, -4.8, -1.6, 1.6, 1.6, (f) => (f === 'near' ? BRASS.a : BRASS.d));
    box(T, 3.2, 4.8, -1.6, 1.6, 1.6, (f) => (f === 'near' ? BRASS.a : BRASS.d));
    box(T, 16, 26.4, -8, 8, 4, (f, i, k) => {
      if (f === 'near') {
        if (Math.abs(k) < 2.4 && i > 18.8 && i < 23.6) return HOT; // the core
        if (i > 20.4 && i < 21.6) return BRASS.a; // the band
        const ri = Math.round(i * 10), rk = Math.round(k * 10);
        if (ri % 32 === 0 && rk % 32 === 0) return BRASS.hi; // rivets
        return IRON.b;
      }
      if (f === 'end') return IRON.hi; // the striking face
      if (f === 'far') return IRON.d;
      return IRON.dd;
    });
  },
});

export default model({
  id: 'h09-gorvax',
  size: 1.12,
  shape: {
    chest: [1.3, 1.2, 1.35], pelvis: [1.2, 1, 1.1], waist: 1.25, shoulder: 1.5, upper: 1.45, fore: 1.4, hand: 1.5,
    thigh: 1.3, knee: 1.25, shin: 1.25, foot: 1.3, head: [1.12, 1, 1.08], face: [1.2, 1, 1.12], neck: 1.5, elbow: 1.3,
  },
  bones: { neckUp: 2.6, headUp: 2.8, shoulderUp: 2.0, shoulderOut: 6.2, thigh: 8.2, shin: 7.9 },
  palettes: [
    ramp(0x6a6a72), // 0 shell: riveted iron plates
    ramp(0x2a2426), // 1 core: dark joints
    null, // 2 steel: the weapons' own colours
    ramp(0x7a4a3c), // 3 skin: beast flesh
    ramp(0x3a2622), // 4 clothA: leather straps
    ramp(0x1a1618), // 5 clothB: boots
    ramp(0x2e2a30, 0.35, 0.3, 0.55), // 6 hair: the cables of the mane
    ramp(0xc0943e, 0.3, 0.3, 0.55), // 7 gold: brass
    ['#ff3a2a', '#ff3a2a', '#ff3a2a', '#ff3a2a'], // 8 glow: the eyes
    ramp(0x120e10), // 9 dark: the mouth
    ramp(0x9a2a1e), // 10 accent: red trim
    ramp(0xd8d0c0), // 11 bone: fangs and steam
    ramp(0x6e5040, 0.25, 0.3, 0.55), // 12 fur: tawny lion fur, in shadow
  ],
  mats: {
    head: MAT.shell, face: MAT.fur, neck: MAT.core, chest: MAT.shell, shoulder: MAT.shell, upper: MAT.shell, fore: MAT.shell,
    hand: MAT.dark, thigh: MAT.fur, shin: MAT.clothB, foot: MAT.clothB, pelvis: MAT.clothA,
  },
  glow: [MAT.glow],
  weapons: { hammer: 'engine-hammer' },
  // the carriage: a heavy forward hunch, the weight low
  stance(p) {
    return { ...p, lean: Number(p.lean ?? 0) + 2.5, crouch: Number(p.crouch ?? 0) + 1.2 };
  },
  extras(api: ExtrasApi) {
    const s = Number(api.q.cloth ?? 0);
    const air = api.q.air ? 1 : 0;

    // the mane: cables from the back of the skull streaming down over the shoulders, a brass ring on each
    const cables: [Vec, number][] = [
      [[-0.8, 3.3, 2.0], 1.0], [[-2.4, 2.6, 2.2], 0.6], [[-3.0, 1.0, 1.6], 0.2],
      [[-0.8, 3.3, -2.0], -1.0], [[-2.4, 2.6, -2.2], -0.6], [[-3.0, 1.0, -1.6], -0.2],
    ];
    cables.forEach(([h0, z], j) => {
      const a = api.at('head', h0);
      const m = api.at('chest', [-5.0 - s * 1.0, 1.4 - j * 0.2, z * 0.9]);
      const e = api.at('chest', [-6.4 - s * 2.4 - air * 1.2, -3.2 - (j % 3) * 0.8, z * 0.7]);
      api.sweep(a, m, 1.0, 0.85, MAT.hair, PART.hair);
      api.sweep(m, e, 0.85, 0.7, MAT.hair, PART.hair);
      api.sphere(m, 0.5, MAT.gold, PART.acc2);
    });

    // the muzzle: tawny fur, a dark gape, a fang, and the steam vented from the jaw
    api.sweep(api.at('head', [1.6, -0.2, 0]), api.at('head', [4.4, -1.6, 0]), 2.0, 1.5, MAT.fur, PART.beast);
    api.ellipsoid(api.at('head', [2.6, -2.6, 0]), api.B.head.R, [2.2, 0.55, 1.9], MAT.dark, PART.acc2);
    api.sweep(api.at('head', [3.4, -1.2, 0.9]), api.at('head', [3.8, -3.1, 0.9]), 0.42, 0.1, MAT.bone, PART.acc);
    api.sweep(api.at('head', [2.8, -3.2, -0.5]), api.at('head', [3.1, -1.9, -0.5]), 0.35, 0.1, MAT.bone, PART.acc);

    // the eyes: two red lamps under an iron brow
    api.ellipsoid(api.at('head', [2.1, 1.9, 0]), api.B.head.R, [2.2, 0.7, 2.7], MAT.shell, PART.acc);
    api.sphere(api.at('head', [2.9, 0.1, 1.2]), 0.5, MAT.glow, PART.glow);

    // the shoulders: stacked iron plates with brass rivets
    for (const j of [api.joints.shoulderN, api.joints.shoulderF]) {
      api.ellipsoid(api.add(j, [0, 0.8, 0]), api.B.chest.R, [3.2, 2.3, 3.0], MAT.shell, PART.acc);
      api.ellipsoid(api.add(j, [-1.1, -0.9, 0]), api.B.chest.R, [2.6, 1.7, 2.8], MAT.core, PART.acc2);
      api.sphere(api.add(j, [1.6, 1.4, 1.9]), 0.42, MAT.gold, PART.acc2);
      api.sphere(api.add(j, [0.2, 2.3, 1.2]), 0.42, MAT.gold, PART.acc2);
    }

    // the chest: brass rivets along the iron front
    for (const y of [-1.2, 0.6, 2.4]) api.sphere(api.at('chest', [4.0, y, 2.3]), 0.42, MAT.gold, PART.acc2);
  },
});
