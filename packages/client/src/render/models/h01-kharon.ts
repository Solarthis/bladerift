import { MAT, model, ramp, SKIN, PART, BONE, hairLong, chainLinks, eyes } from './kit';
import type { ExtrasApi, Vec } from './kit';
// @ts-expect-error - plain JS module
import { registerWeapon, STEEL } from '../heroRig.js';

/**
 * Kharon, the Chainbound (Archer). From the portrait (assets/art/h-01.jpg): a towering scarred giant, long matted black
 * hair, a black beard, amber eyes under a heavy brow, bare scarred torso bound in rusted chains, a ragged red cloth
 * over one shoulder, and a huge black great-bow. Hulking and slightly hunched.
 */

type Along = ((i: number, k: number, c: number, lift?: number) => void) & { at(i: number, k: number): number[] };
type P3 = [number, number, number];

const dot = (a: P3, b: P3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: P3, b: P3): P3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const minus = (a: P3, b: P3): P3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

/** A world point in the weapon's own (along, across, lift) coordinates, from its frame. */
function coordsOf(T: Along, P: P3): P3 {
  const H = T.at(0, 0) as P3, A = minus(T.at(1, 0) as P3, H), S = minus(T.at(0, 1) as P3, H), N = cross(A, S);
  const d = minus(P, H), det = dot(A, cross(S, N));
  return [dot(d, cross(S, N)) / det, dot(d, cross(N, A)) / det, dot(d, cross(A, S)) / det];
}

/** A straight run in weapon space, one dot per 0.4 px. */
function run(T: Along, a: P3, b: P3, c: number) {
  const n = Math.max(2, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / 0.4));
  for (let s = 0; s <= n; s++) {
    const t = s / n;
    T(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, c, a[2] + (b[2] - a[2]) * t);
  }
}

// The great black bow: a 44 px recurve (tip to tip) with a broad black belly, rust-bound tips and a taut cord.
const TIP = -1.5, BELLY = 3.5, SPAN = 22;
registerWeapon('kharon-greatbow', {
  across: true,
  draw(T: Along, q: { pull?: boolean; nocked?: boolean }, off: P3) {
    for (let u = -1; u <= 1.001; u += 0.02) {
      const a = Math.abs(u), k = u * SPAN, i = TIP + (BELLY - TIP) * (1 - u * u), w = 0.8 + 1.2 * (1 - a);
      for (let d = -w; d <= w + 0.01; d += 0.4) {
        const c = a > 0.84 ? STEEL.grip : d > w * 0.4 ? STEEL.dark : STEEL.darkD;
        T(i + d, k, c);
        if (Math.abs(d) < 0.5) T(i + d, k, c, 0.8);
      }
    }
    // the grip: a wrapped leather riser at the belly
    for (let k = -2.4; k <= 2.41; k += 0.4) for (let i = BELLY - 1.2; i <= BELLY + 1.21; i += 0.4) T(i, k, STEEL.gripD);
    // rust bands on the tips
    for (const s of [-1, 1]) for (let d = -1.2; d <= 1.21; d += 0.4) for (let e = -1.2; e <= 1.21; e += 0.4) T(TIP + d, s * SPAN + e, STEEL.grip);
    // the cord, from each tip to the nock (or to the hand when drawn)
    const mid: P3 = q.pull ? coordsOf(T, off) : [TIP, 0, 0];
    run(T, [TIP, -SPAN, 0], mid, STEEL.b);
    run(T, [TIP, SPAN, 0], mid, STEEL.b);
    if (q.nocked) {
      run(T, mid, [13, 0, 0], STEEL.wood);
      for (let i = 9; i <= 13; i += 0.4) for (let k = -(13 - i) * 0.45; k <= (13 - i) * 0.45; k += 0.4) T(i, k, STEEL.hi);
    }
  },
});

export default model({
  id: 'h01-kharon',
  size: 1.16,
  shape: { chest: [1.2, 1.14, 1.18], shoulder: 1.3, upper: 1.3, fore: 1.24, hand: 1.2, neck: 1.15, thigh: 1.2, shin: 1.12, head: [1.04, 1.06, 1.02] },
  palettes: [
    ramp(0x4a3020),              // 0 shell: leather straps
    ramp(0x2a201c),              // 1 core: undersuit and joints
    null,                        // 2 steel: the weapons' own colours
    ramp(0xa06c4e, 0.3, 0.25, 0.5), // 3 skin: weathered tan
    ramp(0x2a2024),              // 4 clothA: black-brown loincloth and trousers
    ramp(0x3a2a20),              // 5 clothB: boots and straps
    ramp(0x2a2530, 0.3, 0.25, 0.45), // 6 hair: matted black
    ['#b88a5a', '#8a5a34', '#5a3620', '#2a1a10'], // 7 gold: rusted chains
    ['#ffb840', '#ffb040', '#e08a20', '#8a4a10'], // 8 glow: amber eyes
    ramp(0x120e14),              // 9 dark: brow and scars
    ramp(0xa3202a, 0.3, 0.3, 0.5), // 10 accent: the ragged red cloth
    BONE,                        // 11 bone
    ramp(0x3a2c24),              // 12 fur
  ],
  mats: {
    chest: MAT.skin, upper: MAT.skin, fore: MAT.skin, shoulder: MAT.skin, hand: MAT.skin, neck: MAT.skin, waist: MAT.skin,
    pelvis: MAT.clothA, thigh: MAT.clothA, shin: MAT.clothA, foot: MAT.clothB,
  },
  glow: [MAT.glow],
  weapons: { bow: 'kharon-greatbow' },
  stance(p) {
    // hunched: the great shoulders forward, the weight low and heavy
    return { ...p, lean: Number(p.lean ?? 0) + 2, crouch: Number(p.crouch ?? 0) + 1 };
  },
  extras(api: ExtrasApi) {
    // long matted hair down the back, with two heavy clumps
    hairLong(api, MAT.hair, 12, 2.9);
    api.sweep(api.at('head', [-1.2, 2.2, 1.8]), api.at('chest', [-3.6, 0, 2.4]), 1.5, 1.1, MAT.hair, PART.hair);
    api.sweep(api.at('head', [-1.2, 2.2, -1.8]), api.at('chest', [-3.6, 0, -2.4]), 1.5, 1.1, MAT.hair, PART.hair);

    // a heavy brow over the amber eyes, and a short black beard on the jaw (the cheeks and eyes stay visible)
    api.ellipsoid(api.at('head', [2.3, 1.3, 0.6]), api.B.head.R, [1.1, 0.5, 2.3], MAT.dark, PART.acc);
    api.ellipsoid(api.at('head', [0.9, -1.9, 0]), api.B.head.R, [2.0, 1.3, 2.1], MAT.hair, PART.hair);

    // the scars: raised dark weals across the chest
    const scar = (a: Vec, b: Vec) => api.sweep(api.at('chest', a), api.at('chest', b), 0.3, 0.22, MAT.dark, PART.acc2);
    scar([-1.6, 2.2, 5.2], [-0.4, 1.4, 5.5]);
    scar([0.6, -0.6, 5.3], [1.8, -1.4, 5.1]);
    scar([-2.2, -1.2, 4.6], [-1.4, -2.6, 4.8]);

    // rusted chains: slung diagonally across the chest and wrapped round the arms
    chainLinks(api, api.at('chest', [1.5, 3, 4]), api.at('pelvis', [1, 1, -3]), MAT.gold, 7, 0.7);
    chainLinks(api, api.joints.elbowN, api.joints.handN, MAT.gold, 5, 0.6);

    // the ragged red cloth: a sash over one shoulder that streams and tears down the back
    const s = Number(api.q.cloth ?? 0);
    api.sweep(api.at('chest', [1.4, 3.6, 4.4]), api.at('pelvis', [0, 0.5, 3.6]), 1.1, 0.9, MAT.accent, PART.cloth);
    for (const z of [-2.4, -0.2, 2.0]) {
      api.sweep(api.at('chest', [-3, 2, z]), api.at('pelvis', [-4 - s * 3, -4 - Math.abs(z) * 0.5, z * 0.6]), 1.1, 0.6, MAT.accent, PART.cloth);
    }

    eyes(api, MAT.glow, 0.42);
  },
});
