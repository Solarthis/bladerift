import { MAT, model, ramp, SKIN, PART, BONE, pauldrons, hairLong, cape, eyes } from './kit';
import type { ExtrasApi } from './kit';
// @ts-expect-error - plain JS module
import { registerWeapon, STEEL } from '../heroRig.js';

/**
 * Aurelion, the Gilded Sovereign (Archer). From the portrait (assets/art/h-02.jpg): an arrogant golden-haired king,
 * long slicked-back hair, heavy half-lidded crimson eyes, gleaming ornate gold armour with sharp pauldrons, a high
 * gilded collar and a crimson lining. Chin up, chest out. Carries an ornate golden bow.
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

// The ornate golden bow: a 38 px recurve with a gilded belly, sun finials on the tips and a pale golden cord.
const TIP = -1.5, BELLY = 2.5, SPAN = 19;
registerWeapon('aurelion-goldbow', {
  across: true,
  draw(T: Along, q: { pull?: boolean; nocked?: boolean }, off: P3) {
    for (let u = -1; u <= 1.001; u += 0.02) {
      const a = Math.abs(u), k = u * SPAN, i = TIP + (BELLY - TIP) * (1 - u * u), w = 0.7 + 0.9 * (1 - a);
      for (let d = -w; d <= w + 0.01; d += 0.4) {
        const c = d < -w * 0.5 ? STEEL.goldD : STEEL.gold;
        T(i + d, k, c);
        if (Math.abs(d) < 0.5) T(i + d, k, STEEL.hi, 0.8);
      }
    }
    // the gilded grip, with a bright glint at its heart
    for (let k = -2.2; k <= 2.21; k += 0.4) for (let i = BELLY - 1; i <= BELLY + 1.01; i += 0.4) T(i, k, STEEL.goldD);
    T(BELLY, 0, STEEL.hi);
    // sun finials on the tips
    for (const s of [-1, 1]) for (let d = -1.2; d <= 1.21; d += 0.4) for (let e = -1.2; e <= 1.21; e += 0.4) T(TIP + d, s * SPAN + e, Math.abs(e) > 0.8 ? STEEL.goldD : STEEL.hi);
    // the cord, from each tip to the nock (or to the hand when drawn)
    const mid: P3 = q.pull ? coordsOf(T, off) : [TIP, 0, 0];
    run(T, [TIP, -SPAN, 0], mid, STEEL.hi);
    run(T, [TIP, SPAN, 0], mid, STEEL.hi);
    if (q.nocked) {
      run(T, mid, [13, 0, 0], STEEL.goldD);
      for (let i = 9; i <= 13; i += 0.4) for (let k = -(13 - i) * 0.45; k <= (13 - i) * 0.45; k += 0.4) T(i, k, STEEL.hi);
    }
  },
});

export default model({
  id: 'h02-aurelion',
  size: 1.06,
  shape: { chest: [1.1, 1.06, 1.1], shoulder: 1.22, upper: 1.08, fore: 1.02, thigh: 1.04, head: [1.0, 1.02, 1.0] },
  palettes: [
    ['#fff3b0', '#f0c048', '#b07a22', '#5e3c12'], // 0 shell: gilded armour
    ramp(0x3a2a20),              // 1 core: dark undersuit and joints
    null,                        // 2 steel: the weapons' own colours
    SKIN.fair,                   // 3 skin
    ramp(0x7a1a22),              // 4 clothA: crimson lining
    ramp(0x3a1418),              // 5 clothB: dark crimson leg wraps
    ramp(0xf8e090, 0.4, 0.25, 0.5), // 6 hair: golden
    ['#fff8c0', '#ffd860', '#c08a2a', '#6a4618'], // 7 gold: ornaments and gauntlets
    ['#ff3a3a', '#ff4040', '#ff3a3a', '#ff3a3a'], // 8 glow: crimson eyes
    ramp(0x2a1a14),              // 9 dark
    ramp(0xc02030),              // 10 accent: crimson cape and collar
    BONE,                        // 11 bone
    ramp(0xeed8a0),              // 12 fur: golden trim
  ],
  mats: {
    chest: MAT.shell, shoulder: MAT.shell, upper: MAT.shell, fore: MAT.shell, thigh: MAT.shell, shin: MAT.shell,
    waist: MAT.gold, pelvis: MAT.gold, hand: MAT.gold, foot: MAT.gold, neck: MAT.skin, head: MAT.skin, face: MAT.skin,
  },
  glow: [MAT.glow],
  weapons: { bow: 'aurelion-goldbow' },
  stance(p) {
    // chin up, chest out: a regal lean back and a lifted head
    return { ...p, lean: Number(p.lean ?? 0) - 1.5, hy: Number(p.hy ?? 0) - 0.6 };
  },
  extras(api: ExtrasApi) {
    // golden hair, slicked back and falling long behind him
    hairLong(api, MAT.hair, 8, 2.3);

    // sharp gilded pauldrons, each with a spike
    pauldrons(api, MAT.gold, 1.2, MAT.gold);

    // a high gilded gorget behind the neck, with two collar spikes rising past the head
    api.sweep(api.at('neck', [-1.2, 0.4, -2.4]), api.at('neck', [-1.2, 0.4, 2.4]), 1.7, 1.7, MAT.gold, PART.acc);
    for (const z of [-1.3, 1.3]) api.sweep(api.at('neck', [-2, 1, z]), api.at('neck', [-4, 5.8, z * 0.6]), 1.0, 0.25, MAT.gold, PART.acc);

    // the crimson cape streaming from the shoulders
    cape(api, MAT.accent, 13, 2.8);

    // heavy half-lidded eyes: a lid over the crimson glow
    api.ellipsoid(api.at('head', [2.8, 0.95, 1.0]), api.B.head.R, [1.1, 0.42, 1.4], MAT.skin, PART.acc);
    eyes(api, MAT.glow, 0.4);
  },
});
