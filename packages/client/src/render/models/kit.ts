/**
 * The model kit: hero models for the hero rig (render/heroRig.js) and reusable 3D pieces for their extras.
 *
 * A model = palettes per MATERIAL index (4 tones each, lit -> deepest), which body part uses which material, part
 * shape multipliers, bone overrides, an overall size, weapon remaps, and extras(api) that adds 3D pieces (spheres,
 * capsules, ellipsoids) through the same depth buffer as the body - so hair, hoods and capes occlude, shade and get
 * outlined exactly like the body does.
 *
 * Space: rig pixels (the stock figure is 38 px tall), x forward, y UP, z toward the viewer; frames from api.B (pelvis,
 * waist, chest, neck, head, upperN/F, foreN/F, thighN/F, shinN/F, footN/F) are already turned with the figure, so
 * api.at('head', [x, y, z]) is a point in head space (head radii ~[3, 3.3, 2.8], face offset +0.85 forward).
 * Pose extras: api.q is the pose (q.cloth = sway -1..1 from speed, q.air = airborne).
 */
// @ts-expect-error - plain JS module
import { PART as RIG_PART } from '../heroRig.js';

export type Vec = [number, number, number];
export type Ramp = (string | number)[];

/** Material indices (palette slots). 2 is the weapons' own colours: never use it for a body part. */
export const MAT = {
  shell: 0, core: 1, steel: 2, skin: 3, clothA: 4, clothB: 5, hair: 6, gold: 7, glow: 8, dark: 9, accent: 10, bone: 11, fur: 12,
} as const;

export interface ExtrasApi {
  S: unknown;
  B: Record<string, { t: Vec; R: number[] }>;
  q: Record<string, unknown>;
  PART: Record<string, number>;
  at(frame: string, v: Vec): Vec;
  add(a: Vec, b: Vec): Vec;
  sub(a: Vec, b: Vec): Vec;
  mul(a: Vec, s: number): Vec;
  unit(a: Vec): Vec;
  mv(R: number[], v: Vec): Vec;
  joints: Record<'handN' | 'handF' | 'elbowN' | 'elbowF' | 'kneeN' | 'kneeF' | 'ankleN' | 'ankleF' | 'shoulderN' | 'shoulderF' | 'hipN' | 'hipF', Vec>;
  sphere(c: Vec, r: number, mat: number, part?: number): void;
  sweep(a: Vec, b: Vec, ra: number, rb: number, mat: number, part?: number, bulge?: number): void;
  ellipsoid(c: Vec, R: number[], r: Vec, mat: number, part?: number): void;
}

export interface HeroModel {
  id: string;
  /** Palettes by material index (see MAT); each 4 tones lit -> deepest, hex strings. */
  palettes: (Ramp | null)[];
  /** Material per body part: pelvis waist chest neck head face shoulder upper elbow fore hand thigh knee shin foot. */
  mats?: Record<string, number>;
  /** Radius multipliers per body part (a number, or [x, y, z] for the ellipsoid parts pelvis/chest/head/face). */
  shape?: Record<string, number | Vec>;
  /** Bone length overrides (rig pixels): pelvis spine1 spine2 shoulderUp shoulderOut neckUp headUp hipDown hipOut thigh shin upper fore. */
  bones?: Record<string, number>;
  /** Overall size (1 = stock height; 0.85 small .. 1.18 giant). */
  size?: number;
  /** Materials drawn unshaded (glowing eyes, runes). */
  glow?: number[];
  ink?: string;
  seam?: string;
  /** The small chest mark (null = none). */
  mark?: string | null;
  /** Weapon remaps: the rig weapon name a pose asks for -> this hero's own weapon (registered with registerWeapon). */
  weapons?: Record<string, string>;
  extras?(api: ExtrasApi): void;
  /** The hero's carriage: adjust any pose (e.g. add crouch / lean, widen the feet) before it is solved. Keep it cheap. */
  stance?(pose: Record<string, unknown>): Record<string, unknown>;
}

export const PART = RIG_PART as Record<string, number>;

/** A 4-tone ramp from one base colour: lit, base, shade, deep. */
export function ramp(base: number, lit = 0.35, shade = 0.3, deep = 0.55): Ramp {
  const mix = (a: number, b: number, t: number) => {
    const r = ((a >> 16) & 255) * (1 - t) + ((b >> 16) & 255) * t;
    const g = ((a >> 8) & 255) * (1 - t) + ((b >> 8) & 255) * t;
    const bl = (a & 255) * (1 - t) + (b & 255) * t;
    return '#' + ((Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(bl)).toString(16).padStart(6, '0');
  };
  return [mix(base, 0xffffff, lit), mix(base, base, 0), mix(base, 0x0a0812, shade), mix(base, 0x0a0812, deep)];
}

/** Common palettes. */
export const SKIN = { fair: ramp(0xf2c8a8, 0.3, 0.22, 0.45), warm: ramp(0xd9a07a, 0.3, 0.25, 0.5), tan: ramp(0xb07850, 0.3, 0.25, 0.5), pale: ramp(0xe8dcd4, 0.3, 0.2, 0.42), ash: ramp(0xb8b0b8, 0.25, 0.25, 0.5) };
export const GOLD = ['#fff0a8', '#e9b64a', '#a8742a', '#5a3a14'];
export const STEEL_RAMP = ['#f0f4fa', '#a9b4c8', '#68748f', '#3a4258'];
export const LEATHER = ramp(0x5a3a28, 0.25, 0.3, 0.55);
export const BONE = ['#fffaf0', '#e0d6c4', '#a89c88', '#5a5248'];

/** Default material per body part: armour on the torso and limbs, undersuit at the joints, skin face. */
export const DEFAULT_MATS: Record<string, number> = {
  pelvis: MAT.clothA, waist: MAT.core, chest: MAT.shell, neck: MAT.skin, head: MAT.skin, face: MAT.skin,
  shoulder: MAT.shell, upper: MAT.clothA, elbow: MAT.core, fore: MAT.shell, hand: MAT.skin,
  thigh: MAT.clothA, knee: MAT.core, shin: MAT.clothB, foot: MAT.clothB,
};

// ---------------------------------------------------------------- pieces

const sway = (api: ExtrasApi) => Number(api.q.cloth ?? 0);

/** Glowing or plain eyes on the face (side view: the near eye; the far one peeks when turned). */
export function eyes(api: ExtrasApi, mat: number = MAT.dark, r = 0.42) {
  api.sphere(api.at('head', [2.85, 0.35, 1.1]), r, mat, PART.glow);
}

/** Close-cropped hair: a cap over the skull, leaving the face. */
export function hairShort(api: ExtrasApi, mat: number = MAT.hair, puff = 1) {
  // the cap sits back on the skull so the face and eyes stay clear from the side
  api.ellipsoid(api.at('head', [-1.1, 0.95, 0]), api.B.head.R, [3.05 * puff, 3 * puff, 3.05 * puff], mat, PART.hair);
  api.sphere(api.at('head', [1, 2.5, 0]), 1.35 * puff, mat, PART.hair); // fringe, above the brow
}

/** Long hair flowing down the back, swaying with movement. */
export function hairLong(api: ExtrasApi, mat: number = MAT.hair, length = 9, width = 2.3) {
  hairShort(api, mat);
  const s = sway(api);
  const a = api.at('head', [-2.2, 0.5, 0]);
  const b = api.add(api.at('chest', [-3.4, -2, 0]), [-s * 2.5, -length * 0.4, 0]);
  const c = api.add(b, [-1.2 - s * 2, -length * 0.5, 0]);
  api.sweep(a, b, width, width * 0.85, mat, PART.hair);
  api.sweep(b, c, width * 0.85, width * 0.4, mat, PART.hair);
}

/** Spiky hair: a cap with spikes thrown back and up. */
export function hairSpiky(api: ExtrasApi, mat: number = MAT.hair, n = 5, len = 2.6) {
  hairShort(api, mat, 1.03);
  for (let i = 0; i < n; i++) {
    const a = -0.9 + (i / (n - 1)) * 2.2;
    const base = api.at('head', [Math.cos(a + 1.6) * 2, 1.6 + Math.sin(a + 1.6) * 1.2, ((i % 2) - 0.5) * 1.6]);
    const tip = api.at('head', [Math.cos(a + 1.6) * (2 + len) - 0.8, 1.6 + Math.sin(a + 1.6) * (1.2 + len), ((i % 2) - 0.5) * 2]);
    api.sweep(base, tip, 1.1, 0.3, mat, PART.hair);
  }
}

/** Curly / voluminous hair: a cloud of balls round the skull. */
export function hairCurly(api: ExtrasApi, mat: number = MAT.hair, r = 1.5) {
  hairShort(api, mat, 1.02);
  const pts: Vec[] = [[-2.4, 1.6, 1.2], [-2.6, 0, -1], [-1, 3, 0.8], [0.6, 3.2, -0.8], [-2, 2.6, -1.4], [1.8, 2.6, 1], [-2.9, -0.8, 0.6]];
  for (const p of pts) api.sphere(api.at('head', p), r, mat, PART.hair);
}

/** A hood over the head (open at the face) falling onto the shoulders. */
export function hood(api: ExtrasApi, mat: number = MAT.clothA, trim?: number) {
  api.ellipsoid(api.at('head', [-0.7, 0.6, 0]), api.B.head.R, [3.7, 3.8, 3.5], mat, PART.cloth);
  api.sweep(api.at('head', [-2.2, -1, 0]), api.at('chest', [-2.6, 1.4, 0]), 2.6, 3, mat, PART.cloth);
  if (trim !== undefined) api.sweep(api.at('head', [1.4, 3, 0]), api.at('head', [2.3, -1.6, 0]), 0.5, 0.5, trim, PART.acc);
}

/** A crown: a gold band with points, a gem at the front. */
export function crown(api: ExtrasApi, mat: number = MAT.gold, gem: number = MAT.accent) {
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const p = api.at('head', [Math.cos(a) * 2.6 - 0.3, 2.9, Math.sin(a) * 2.4]);
    api.sphere(p, 0.75, mat, PART.acc);
    if (i % 2 === 0) api.sweep(p, api.add(p, api.mv(api.B.head.R, [0, 1.5, 0])), 0.5, 0.15, mat, PART.acc);
  }
  api.sphere(api.at('head', [2.4, 2.9, 0]), 0.55, gem, PART.glow);
}

/** A cape from the shoulders to the calves, streaming back with speed. */
export function cape(api: ExtrasApi, mat: number = MAT.accent, length = 15, width = 3.4) {
  const s = sway(api);
  const air = api.q.air ? 1 : 0;
  for (let z = -width; z <= width + 0.01; z += 1.1) {
    const a = api.at('chest', [-2.6, 2.6, z * 0.7]);
    const b = api.add(api.at('pelvis', [-4 - s * 3 - air * 2, -2, z]), [0, 0, 0]);
    const c = api.add(b, [-1.5 - s * 4 - air * 3, -length * 0.6 + air * 3, z * 0.15]);
    api.sweep(a, b, 1, 1.1, mat, PART.cape);
    api.sweep(b, c, 1.1, 0.9, mat, PART.cape);
  }
}

/** Coat or tabard tails from the waist to the knees. */
export function coatTails(api: ExtrasApi, mat: number = MAT.clothA, length = 9) {
  const s = sway(api);
  for (const z of [-2.2, -0.8, 0.8, 2.2]) {
    const a = api.at('pelvis', [-1.4, 0.6, z]);
    const b = api.add(api.at('pelvis', [-2.6 - s * 2.5, -length, z * 1.1]), [0, 0, 0]);
    api.sweep(a, b, 1.4, 1, mat, PART.cloth);
  }
}

/** A long robe skirt from the waist to the ankles (covers the legs' top). */
export function robe(api: ExtrasApi, mat: number = MAT.clothA, flare = 1) {
  const s = sway(api);
  for (const z of [-2.6, -1.2, 0, 1.2, 2.6]) {
    const a = api.at('pelvis', [0, 0.4, z * 0.8]);
    const b = api.at('pelvis', [-s * 2 + (z === 0 ? 1 : 0), -14, z * 1.15 * flare]);
    api.sweep(a, b, 2.2, 1.8 * flare, mat, PART.cloth);
  }
}

/** Shoulder plates. */
export function pauldrons(api: ExtrasApi, mat: number = MAT.shell, size = 1, spike?: number) {
  for (const j of [api.joints.shoulderN, api.joints.shoulderF]) {
    api.ellipsoid(api.add(j, [0, 0.8, 0]), api.B.chest.R, [2.8 * size, 2.1 * size, 2.8 * size], mat, PART.acc);
    if (spike !== undefined) api.sweep(api.add(j, [0, 1.8, 0]), api.add(j, [-0.6, 4.2 * size, 0]), 0.9, 0.15, spike, PART.acc);
  }
}

/** Horns sweeping back from the temples. */
export function horns(api: ExtrasApi, mat: number = MAT.bone, len = 4) {
  for (const z of [-1.6, 1.6]) {
    const a = api.at('head', [0.4, 2.4, z]);
    const b = api.at('head', [-1.4, 2.4 + len * 0.6, z * 1.3]);
    const c = api.at('head', [-3.4, 2 + len * 0.8, z * 1.2]);
    api.sweep(a, b, 0.9, 0.6, mat, PART.acc);
    api.sweep(b, c, 0.6, 0.15, mat, PART.acc);
  }
}

/** A ragged mane of fur or cables round the head and down the back. */
export function mane(api: ExtrasApi, mat: number = MAT.fur, size = 1) {
  const pts: Vec[] = [[-2.8, 2.2, 0], [-3.4, 0.4, 1.4], [-3.4, 0.4, -1.4], [-2.4, 3.4, 1], [-2.4, 3.4, -1], [-3.6, -1.6, 0], [-1, 3.8, 0], [0.6, 3.5, 1.4], [0.6, 3.5, -1.4]];
  for (const p of pts) api.sphere(api.at('head', p), 1.8 * size, mat, PART.hair);
  api.sweep(api.at('head', [-3, -1, 0]), api.at('chest', [-3.2, -1, 0]), 2.6 * size, 2 * size, mat, PART.hair);
}

/** A mask over the face (skull / cloth): recolours the face front. */
export function faceMask(api: ExtrasApi, mat: number, lower = false) {
  if (lower) api.ellipsoid(api.at('head', [1.2, -1, 0]), api.B.head.R, [2.3, 1.7, 2.6], mat, PART.acc);
  else api.ellipsoid(api.at('head', [1, -0.3, 0]), api.B.head.R, [2.4, 2.9, 2.5], mat, PART.acc);
}

/** Chains wrapped round a limb segment (a few links) or slung across the chest. */
export function chainLinks(api: ExtrasApi, a: Vec, b: Vec, mat: number = MAT.gold, n = 5, r = 0.6) {
  for (let i = 0; i <= n; i++) api.sphere(api.add(a, api.mul(api.sub(b, a), i / n)), r, mat, PART.acc2);
}

/** A peaked cap. */
export function peakedCap(api: ExtrasApi, mat: number, band: number = MAT.dark) {
  api.ellipsoid(api.at('head', [-0.2, 2.2, 0]), api.B.head.R, [3.4, 1.5, 3.2], mat, PART.acc);
  api.ellipsoid(api.at('head', [-0.2, 1.3, 0]), api.B.head.R, [3.3, 0.6, 3.1], band, PART.acc2);
  api.ellipsoid(api.at('head', [2.6, 1.1, 0]), api.B.head.R, [1.6, 0.35, 2.4], band, PART.acc2);
}

/** A book held at the far hand. */
export function book(api: ExtrasApi, cover: number, pages: number = MAT.bone) {
  const h = api.joints.handF;
  api.ellipsoid(api.add(h, [1, 0.4, 0.6]), api.B.foreF.R, [2.6, 0.9, 2.2], cover, PART.acc);
  api.ellipsoid(api.add(h, [1, 0.9, 0.6]), api.B.foreF.R, [2.3, 0.4, 1.9], pages, PART.acc2);
}

/** A scarf at the neck with a tail streaming back. */
export function scarf(api: ExtrasApi, mat: number = MAT.accent) {
  const s = sway(api);
  api.sweep(api.at('neck', [-0.4, 0, -1.6]), api.at('neck', [0.6, 0, 1.6]), 1.5, 1.5, mat, PART.acc);
  const a = api.at('neck', [-1.6, 0, 0]);
  api.sweep(a, api.add(a, [-3 - s * 4, -3 + s, 0]), 1.2, 0.6, mat, PART.acc);
}

/** Build a model from a base: shallow-merged fields, extras run in order. */
export function model(m: HeroModel): HeroModel {
  // (mats merge over the defaults: a model only lists the parts it changes)
  return { mark: null, ink: '#0e0c14', ...m, mats: { ...DEFAULT_MATS, ...(m.mats ?? {}) } };
}
