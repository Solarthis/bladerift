/**
 * Small player preferences (Settings), stored per device. Read live by the game, so changes apply immediately where
 * possible.
 *
 * The saved blob carries a schema version (`v`). A blob without one is v1 (the first settings: master volume, shake,
 * vibration, faceMove, highRefresh, fullscreen, damageNumbers). Loading a v1 blob keeps every value it had; the keys
 * added since start at their defaults. Unknown or malformed values are replaced by defaults on load, so the rest of
 * the game can trust every field.
 */

/** Fighter actions that can be remapped on the keyboard (the solo scheme in input/Controls.ts). */
export type KeyAction = 'left' | 'right' | 'down' | 'jump' | 'a' | 'b' | 'skill' | 'roll' | 'heal' | 'special';
export const KEY_ACTIONS: readonly KeyAction[] = ['left', 'right', 'down', 'jump', 'a', 'b', 'skill', 'roll', 'heal', 'special'];

/** Graphics quality. 'low' trades the extra background and particle work for frame rate. */
export type Quality = 'high' | 'low';

export interface Prefs {
  /** Floating damage numbers on hits you deal. */
  damageNumbers: boolean;
  /** Screen shake strength 0..1 (explosions, hits, recoil). */
  shake: number;
  /** Phone vibration on bursts, hits and shield cracks. */
  haptics: boolean;
  /** When not aiming, your soldier turns to face the way you run (touch). */
  faceMove: boolean;
  /** Run the game on every display frame on 90-144 Hz screens (otherwise paced to ~60 fps: even, cooler, longer battery). */
  highRefresh: boolean;
  /** Go fullscreen (and lock landscape) on the first tap of a match where the browser allows it (Android). */
  fullscreen: boolean;
  /** Master volume 0..1. Multiplies every channel below. */
  volume: number;
  /** Music channel 0..1 (times master). */
  musicVol: number;
  /** Effects channel 0..1 (times master): hits, moves, footsteps, UI clicks. */
  sfxVol: number;
  /** Announcer and voice channel 0..1 (times master): round calls, KO, win lines. */
  voiceVol: number;
  /** Graphics quality (default high). 'low' caps the render scale at the governor's middle step and trims effects. */
  quality: Quality;
  /**
   * Set by reportRenderScale() when the frame governor dropped the render scale on this phone. Settings then offers
   * 'low'. It never changes `quality` by itself.
   */
  qualityHint: boolean;
  /** Touch controls size multiplier 0.8..1.3. */
  touchScale: number;
  /** Touch controls opacity 0.3..1. */
  touchOpacity: number;
  /** Touch controls mirrored: the stick and the button cluster swap sides. */
  leftHanded: boolean;
  /**
   * Keyboard overrides for the solo scheme. Per action, the first code is the primary key and the rest are kept
   * alternatives. An action without an entry keeps its default codes. Codes are KeyboardEvent.code values.
   */
  keys: Partial<Record<KeyAction, string[]>>;
}

/** Schema version written with the blob (see the header comment). */
const VERSION = 2;
const KEY = 'bladerift.prefs';
/** Render scale at or below which a phone counts as struggling (the governor's middle step). */
const LOW_SCALE = 1.5;
const MAX_CODES = 3;
const CODE = /^[A-Za-z0-9]{1,24}$/;

const DEFAULTS: Prefs = {
  damageNumbers: true,
  shake: 1,
  haptics: true,
  faceMove: true,
  highRefresh: false,
  fullscreen: true,
  volume: 0.8,
  musicVol: 0.6,
  sfxVol: 0.8,
  voiceVol: 0.9,
  quality: 'high',
  qualityHint: false,
  touchScale: 1,
  touchOpacity: 0.85,
  leftHanded: false,
  keys: {},
};

let cache: Prefs | null = null;

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/** A finite number from a stored value (numbers and numeric strings only), clamped; the default otherwise. */
function num(x: unknown, lo: number, hi: number, d: number): number {
  const n = typeof x === 'number' ? x : typeof x === 'string' && x.trim() !== '' ? Number(x) : NaN;
  return Number.isFinite(n) ? clamp(n, lo, hi) : d;
}

function bool(x: unknown, d: boolean): boolean {
  return typeof x === 'boolean' ? x : d;
}

/** Keyboard overrides: known actions only, string codes of plain letters and digits, up to three per action. */
function keysOf(x: unknown): Prefs['keys'] {
  const out: Prefs['keys'] = {};
  if (!x || typeof x !== 'object') return out;
  const src = x as Record<string, unknown>;
  for (const a of KEY_ACTIONS) {
    const v = src[a];
    if (!Array.isArray(v)) continue;
    const codes = [...new Set(v.filter((c): c is string => typeof c === 'string' && CODE.test(c)))].slice(0, MAX_CODES);
    if (codes.length) out[a] = codes;
  }
  return out;
}

/** Brings any source object (a saved blob, or a Prefs with one field changed) to a valid Prefs. */
function normalize(src: unknown): Prefs {
  const p = (src && typeof src === 'object' ? src : {}) as Record<string, unknown>;
  return {
    damageNumbers: bool(p.damageNumbers, DEFAULTS.damageNumbers),
    shake: num(p.shake, 0, 1, DEFAULTS.shake),
    haptics: bool(p.haptics, DEFAULTS.haptics),
    faceMove: bool(p.faceMove, DEFAULTS.faceMove),
    highRefresh: bool(p.highRefresh, DEFAULTS.highRefresh),
    fullscreen: bool(p.fullscreen, DEFAULTS.fullscreen),
    volume: num(p.volume, 0, 1, DEFAULTS.volume),
    musicVol: num(p.musicVol, 0, 1, DEFAULTS.musicVol),
    sfxVol: num(p.sfxVol, 0, 1, DEFAULTS.sfxVol),
    voiceVol: num(p.voiceVol, 0, 1, DEFAULTS.voiceVol),
    quality: p.quality === 'low' ? 'low' : 'high',
    qualityHint: bool(p.qualityHint, DEFAULTS.qualityHint),
    touchScale: num(p.touchScale, 0.8, 1.3, DEFAULTS.touchScale),
    touchOpacity: num(p.touchOpacity, 0.3, 1, DEFAULTS.touchOpacity),
    leftHanded: bool(p.leftHanded, DEFAULTS.leftHanded),
    keys: keysOf(p.keys),
  };
}

/**
 * Upgrades a saved blob to the current schema before it is normalized. v1 -> v2 needs no rewrite: `volume` stays the
 * master slider, and the channel volumes, touch and quality keys are new and take their defaults.
 */
function migrate(raw: Record<string, unknown>): Record<string, unknown> {
  // a later schema adds one block here per version, reading `raw.v` (absent in v1); v1 needs none
  return raw;
}

export function prefs(): Prefs {
  if (cache) return cache;
  let raw: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    if (parsed && typeof parsed === 'object') raw = parsed as Record<string, unknown>;
  } catch {
    /* storage blocked or junk: defaults */
  }
  cache = normalize(migrate(raw));
  return cache;
}

export function setPref<K extends keyof Prefs>(k: K, v: Prefs[K]) {
  const p = normalize({ ...prefs(), [k]: v });
  cache = p;
  try {
    localStorage.setItem(KEY, JSON.stringify({ v: VERSION, ...p }));
  } catch {
    /* storage blocked: applies for this session */
  }
  applyPrefsToDocument();
}

/**
 * Reflects the touch and quality prefs on the document, for CSS: `--touch-scale` and `--touch-opacity` on the root, and
 * `data-left-handed` / `data-quality` attributes on <html>. Called at each change and once at boot (main.ts / App).
 */
export function applyPrefsToDocument() {
  if (typeof document === 'undefined') return;
  const p = prefs();
  const el = document.documentElement;
  el.style.setProperty('--touch-scale', String(p.touchScale));
  el.style.setProperty('--touch-opacity', String(p.touchOpacity));
  el.dataset.leftHanded = p.leftHanded ? 'true' : 'false';
  el.dataset.quality = p.quality;
}

/** The solo keyboard codes for every action with the player's overrides applied (defaults are not modified). */
export function withKeyOverrides(base: Record<KeyAction, string[]>): Record<KeyAction, string[]> {
  const o = prefs().keys;
  const out: Record<KeyAction, string[]> = { ...base };
  for (const a of KEY_ACTIONS) {
    const codes = o[a];
    if (codes) out[a] = [...codes];
  }
  return out;
}

/**
 * Frame governor hook (game/pacing.ts): call with the render scale after each step down. At or below the middle step
 * this phone could not hold frame rate at full size, so Settings suggests Low.
 */
export function reportRenderScale(scale: number) {
  const p = prefs();
  if (scale <= LOW_SCALE && !p.qualityHint && p.quality !== 'low') setPref('qualityHint', true);
}

/** Fullscreen is possible here (Android Chrome / desktop; iPhone Safari has no element fullscreen). */
export const canFullscreen = () => !!document.fullscreenEnabled && !!document.documentElement.requestFullscreen;

/**
 * On a touch device: enter fullscreen and lock landscape (needs a user gesture: called from the Practice / Join /
 * Start taps). The address bar no longer takes space and edge swipes stop pulling the page.
 */
export function enterFullscreen() {
  if (!prefs().fullscreen || !canFullscreen() || document.fullscreenElement || !matchMedia('(pointer: coarse)').matches) return;
  document.documentElement
    .requestFullscreen({ navigationUI: 'hide' })
    .then(() => (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.('landscape'))
    .catch(() => {
      /* refused (not a gesture, or not allowed): keep playing in the page */
    });
}

/** Vibrate if the player allows it (Android; iOS ignores vibrate). */
export function buzz(pattern: number | number[]) {
  if (!prefs().haptics) return;
  // browsers refuse (and log) vibration before the first tap
  const ua = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
  if (ua && !ua.hasBeenActive) return;
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* unsupported */
  }
}
