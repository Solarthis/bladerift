/**
 * Small player preferences (Settings > Display / Controls), stored per device. Read live by the game, so changes
 * apply immediately where possible.
 */
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
  /** Master volume 0..1. */
  volume: number;
}

const KEY = 'bladerift.prefs';
const DEFAULTS: Prefs = { damageNumbers: true, shake: 1, haptics: true, faceMove: true, highRefresh: false, fullscreen: true, volume: 0.8 };
let cache: Prefs | null = null;

export function prefs(): Prefs {
  if (cache) return cache;
  let p: Partial<Prefs> = {};
  try {
    p = JSON.parse(localStorage.getItem(KEY) ?? '{}') ?? {};
  } catch {
    /* storage blocked or junk */
  }
  const shake = Number(p.shake);
  cache = {
    damageNumbers: p.damageNumbers !== false,
    shake: Number.isFinite(shake) ? Math.max(0, Math.min(1, shake)) : DEFAULTS.shake,
    haptics: p.haptics !== false,
    faceMove: p.faceMove !== false,
    highRefresh: p.highRefresh === true,
    fullscreen: p.fullscreen !== false,
    volume: Number.isFinite(Number(p.volume)) ? Math.max(0, Math.min(1, Number(p.volume))) : DEFAULTS.volume,
  };
  return cache;
}

export function setPref<K extends keyof Prefs>(k: K, v: Prefs[K]) {
  const p = { ...prefs(), [k]: v };
  cache = p;
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* storage blocked: applies for this session */
  }
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
