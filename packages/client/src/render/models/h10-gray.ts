// @ts-expect-error - plain JS module
import { registerWeapon } from '../heroRig.js';
// @ts-expect-error - plain JS module
import { hex } from '../../vendor/pixelfx/core/color.js';
import { MAT, model, ramp, PART } from './kit';
import type { ExtrasApi } from './kit';

/**
 * Mr. Gray, the Faceless (Berserker). A tall, composed gentleman in a dark grey greatcoat with a turned-up collar, brass
 * buttons and a peaked cap with a brass badge; a calm half-smile, and fog eating the edges of his face. Carries a long
 * black baton (his war hammer, remapped).
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

const BLACK = { hi: C('#363b48'), lo: C('#0c0d12'), grip: C('#1c1e24'), gripLo: C('#0a0b0e') };
const BRASS = { hi: C('#ffe08a'), a: C('#c8903a') };

// the baton: a long black club with a brass butt cap and a ridged grip
registerWeapon('baton', {
  two: -4,
  draw(T: Along) {
    box(T, -7.2, 15.6, -0.8, 0.8, 0.8, (f, i) => {
      if (f === 'near') return i < -5.4 ? BRASS.a : BLACK.hi;
      if (f === 'far') return BLACK.lo;
      if (f === 'rear') return BRASS.hi;
      return BLACK.lo;
    });
    box(T, -2.4, 1.2, -1.0, 1.0, 1.0, (f) => (f === 'near' ? BLACK.grip : BLACK.gripLo));
  },
});

export default model({
  id: 'h10-gray',
  size: 1.04,
  shape: { head: [1.02, 1, 1], face: [1, 1, 1.02], neck: 1.05, chest: [1.02, 1, 1.02] },
  bones: { neckUp: 4.6, headUp: 3.3, shoulderOut: 5.9, thigh: 9.0, shin: 8.6 },
  palettes: [
    ramp(0x4a5060, 0.25, 0.25, 0.5), // 0 shell: the greatcoat, dark grey
    ramp(0x1c1e24), // 1 core: belt and joints
    null, // 2 steel: the weapons' own colours
    ramp(0xc8c6cc, 0.25, 0.22, 0.45), // 3 skin: ashen, pale
    ramp(0x2c3038), // 4 clothA
    ramp(0x23262e), // 5 clothB: trousers, cape, cap crown
    ramp(0x3a3a42), // 6 hair
    ramp(0xc09a4a, 0.3, 0.3, 0.55), // 7 gold: brass buttons and badge
    ramp(0xdde4f0), // 8 glow: unused
    ramp(0x101216), // 9 dark: gloves, boots, band, visor, mouth
    ramp(0x7c8494, 0.3, 0.28, 0.5), // 10 accent: the grey fog
    ramp(0xe6e8ec), // 11 bone: shirt collar
    ramp(0x5a5e68), // 12 fur
  ],
  mats: {
    head: MAT.skin, face: MAT.skin, neck: MAT.skin, chest: MAT.shell, shoulder: MAT.shell, upper: MAT.shell, fore: MAT.shell,
    elbow: MAT.shell, hand: MAT.dark, pelvis: MAT.clothB, waist: MAT.core, thigh: MAT.clothB, knee: MAT.core, shin: MAT.clothB,
    foot: MAT.dark,
  },
  glow: [],
  weapons: { hammer: 'baton' },
  // relaxed and polite: a slight lean forward
  stance(p) {
    return { ...p, lean: Number(p.lean ?? 0) + 1.5 };
  },
  extras(api: ExtrasApi) {
    const s = Number(api.q.cloth ?? 0);
    const air = api.q.air ? 1 : 0;

    // the greatcoat: front and back panels from the waist, flaring down to the mid-calf
    for (const z of [-1.5, 0, 1.5]) {
      api.sweep(api.at('pelvis', [1.4, 1.0, z]), api.at('pelvis', [2.4, -11.0, z * 1.1]), 2.0, 1.7, MAT.shell, PART.cloth);
      api.sweep(api.at('pelvis', [-1.8, 1.0, z]), api.at('pelvis', [-3.4 - s * 2.4 - air, -12.5, z * 1.15]), 2.1, 1.8, MAT.shell, PART.cloth);
    }
    // a cape over the shoulders, its hem lifting with the walk
    for (const z of [-2.2, 0, 2.2]) api.sweep(api.at('chest', [-0.8, 3.4, z]), api.at('chest', [-4.4 - s * 1.5, -0.8, z * 1.1]), 1.2, 1.7, MAT.clothB, PART.cape);

    // the collar: turned up at the back of the neck, a white shirt at the throat
    api.ellipsoid(api.at('neck', [-0.9, 0.8, 0]), api.B.neck.R, [1.9, 2.5, 2.8], MAT.shell, PART.cloth);
    api.ellipsoid(api.at('neck', [1.2, 0, 0]), api.B.neck.R, [1.1, 1.3, 1.7], MAT.bone, PART.acc2);

    // brass buttons down the front, a buckle at the belt
    for (const y of [-1.8, 0.2, 2.2]) api.sphere(api.at('chest', [3.2, y, 2.0]), 0.42, MAT.gold, PART.acc);
    api.sphere(api.at('waist', [2.6, -0.6, 1.8]), 0.5, MAT.gold, PART.acc);

    // the peaked cap: a tall crown, a dark band, a visor, a brass badge
    api.ellipsoid(api.at('head', [-0.4, 2.7, 0]), api.B.head.R, [3.4, 2.1, 3.1], MAT.clothB, PART.acc);
    api.ellipsoid(api.at('head', [-0.2, 1.1, 0]), api.B.head.R, [3.35, 0.55, 3.15], MAT.dark, PART.acc2);
    api.ellipsoid(api.at('head', [2.6, 1.0, 0]), api.B.head.R, [1.9, 0.35, 2.7], MAT.dark, PART.acc2);
    api.sphere(api.at('head', [3.2, 2.2, 0]), 0.7, MAT.gold, PART.acc);

    // the face: calm eyes, a faint half-smile
    api.sphere(api.at('head', [2.85, 0.2, 1.1]), 0.4, MAT.dark, PART.glow);
    api.sweep(api.at('head', [2.2, -2.1, 0.9]), api.at('head', [2.8, -2.6, 0.9]), 0.22, 0.2, MAT.dark, PART.acc2);

    // the fog: it rolls over the back of his head and the jaw, softening the edges of the face
    api.ellipsoid(api.at('head', [-1.8, 0.4, 2.0]), api.B.head.R, [1.6, 2.2, 1.1], MAT.accent, PART.hair);
    api.ellipsoid(api.at('head', [0.8, -3.0, 1.4]), api.B.head.R, [1.4, 0.8, 1.2], MAT.accent, PART.hair);
    api.sphere(api.at('head', [-3.4, -1.8, -1.4]), 1.2, MAT.accent, PART.hair);
  },
});
