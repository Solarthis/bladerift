/**
 * Cosmetic soldier customization ("look"). Colour (the player colour) stays in `color`; everything else lives here.
 * Values are small integer indices (presets / art options), cheap to send and trivially validated. Colour fields
 * (skin, accent, flame, hairCol, and the player `color`) may instead hold a free colour from the colour picker:
 * CUSTOM | 0xRRGGBB.
 */
export interface PlayerLook {
  /** Accent colour (lenses, pennant, radio light): preset index or CUSTOM | rgb. */
  accent: number;
  /** Skin colour: preset index or CUSTOM | rgb. */
  skin: number;
  /** Headwear: 0 helmet, 1 beret, 2 bandana, 3 cap, 4 headset, 5 none (hair), 6 beanie, 7 boonie hat. */
  head: number;
  /** Face: 0 goggles, 1 visor, 2 sunglasses, 3 mask, 4 none. */
  face: number;
  /** Back: 0 standard jetpack, 1 twin booster, 2 pennant, 3 radio. */
  back: number;
  /** Outfit: 0 combat armour, 1 suit & tie, 2 tracksuit, 3 ninja, 4 Hawaiian shirt. */
  outfit: number;
  /** Hairstyle: 0 the outfit's own, 1 crew cut, 2 swept back, 3 curly fade, 4 top knot, 5 rugged + beard. */
  hair: number;
  /** Thrusters: 0 jetpack, 1 boot thrusters (cosmetic: same fuel and thrust). */
  thrust: number;
  /** Thruster flame: 0 fire, 1 plasma, 2 toxic, 3 violet, or CUSTOM | rgb. */
  flame: number;
  /** Hair colour: 0 the art's natural colour, a preset index, or CUSTOM | rgb. */
  hairCol: number;
}

/** Number of presets / options per look field (valid indices are 0..n-1). */
export const LOOK_COUNTS: Readonly<Record<keyof PlayerLook, number>> = {
  accent: 8, skin: 8, head: 8, face: 5, back: 4, outfit: 5, hair: 6, thrust: 2, flame: 4, hairCol: 10,
};

export const DEFAULT_LOOK: Readonly<PlayerLook> = { accent: 0, skin: 0, head: 0, face: 0, back: 0, outfit: 0, hair: 0, thrust: 0, flame: 0, hairCol: 0 };

/** Player colour presets (`color` indices 0..PLAYER_COLOR_COUNT-1). */
export const PLAYER_COLOR_COUNT = 12;

/** A free colour from the colour picker: CUSTOM | 0xRRGGBB (preset indices stay below it). */
export const CUSTOM = 0x1000000;
export const isCustom = (v: number) => v >= CUSTOM && v <= (CUSTOM | 0xffffff);
export const customColor = (rgb: number) => CUSTOM | (rgb & 0xffffff);
export const customRGB = (v: number) => v & 0xffffff;
/** Look fields that may hold a free colour. */
export const COLOR_FIELDS: ReadonlySet<keyof PlayerLook> = new Set<keyof PlayerLook>(['skin', 'accent', 'flame', 'hairCol']);

const KEYS = Object.keys(LOOK_COUNTS) as (keyof PlayerLook)[];

const field = (v: unknown, n: number, color = false) => {
  const x = Math.trunc(Number(v));
  if (!Number.isFinite(x)) return 0;
  if (color && isCustom(x)) return x;
  return x >= 0 && x < n ? x : 0;
};

/** Brightest channel a free player colour must reach (0..255): near-black players vanished on dark maps and UI. */
export const MIN_PLAYER_BRIGHT = 100;

/**
 * Validate an untrusted player colour: a preset index or a free colour; anything else becomes a preset. Free colours
 * are lifted to MIN_PLAYER_BRIGHT (enforced here, in the room, so a modified client can't pick an invisible colour).
 */
export function sanitizeColor(v: unknown): number {
  const x = Math.trunc(Number(v));
  if (!Number.isFinite(x)) return 0;
  if (isCustom(x)) {
    const r = (x >> 16) & 255;
    const g = (x >> 8) & 255;
    const b = x & 255;
    const m = Math.max(r, g, b);
    if (m >= MIN_PLAYER_BRIGHT) return x;
    if (m === 0) return customColor((MIN_PLAYER_BRIGHT << 16) | (MIN_PLAYER_BRIGHT << 8) | MIN_PLAYER_BRIGHT);
    const k = MIN_PLAYER_BRIGHT / m;
    return customColor((Math.round(r * k) << 16) | (Math.round(g * k) << 8) | Math.round(b * k));
  }
  return ((x % PLAYER_COLOR_COUNT) + PLAYER_COLOR_COUNT) % PLAYER_COLOR_COUNT;
}

/**
 * Validate an untrusted look (from the network or localStorage): every field becomes an integer in range,
 * out-of-range / missing / non-numeric values fall back to 0. Returns undefined when no look was supplied.
 */
export function sanitizeLook(v: unknown): PlayerLook | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v !== 'object') return { ...DEFAULT_LOOK };
  const o = v as Record<string, unknown>;
  const out = { ...DEFAULT_LOOK };
  for (const k of KEYS) out[k] = field(o[k], LOOK_COUNTS[k], COLOR_FIELDS.has(k));
  return out;
}

/** Deterministic, varied look for a bot id (helmets and goggles stay the most common). */
export function botLook(id: number): PlayerLook {
  let h = Math.imul(id + 0x9e37, 0x85ebca6b) >>> 0;
  const next = (n: number) => {
    h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0;
    h = (h ^ (h >>> 13)) >>> 0;
    return h % n;
  };
  const head = next(10);
  const face = next(8);
  const outfit = next(9);
  return {
    accent: next(LOOK_COUNTS.accent),
    skin: next(LOOK_COUNTS.skin),
    head: head < 5 ? 0 : head - 4, // ~50% helmets
    face: face < 4 ? 0 : face - 3, // ~50% goggles
    back: next(LOOK_COUNTS.back),
    outfit: outfit < 5 ? 0 : outfit - 4, // ~55% armour
    hair: next(3) === 0 ? next(LOOK_COUNTS.hair) : 0,
    thrust: next(4) === 0 ? 1 : 0, // ~25% boot thrusters
    flame: next(3) === 0 ? next(LOOK_COUNTS.flame) : 0,
    hairCol: next(3) === 0 ? next(LOOK_COUNTS.hairCol) : 0, // natural hair for most
  };
}
