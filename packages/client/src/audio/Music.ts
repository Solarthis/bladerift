/**
 * Background music. Each track streams from the manifest through an HTMLAudioElement, routed by a
 * MediaElementAudioSourceNode into the shared AudioContext, so it fades and ducks like the rest of the mix.
 *
 * Two element slots make the crossfade: the incoming track starts only once it can play, then the outgoing one fades
 * out. A missing manifest or file is a silent no-op (whatever is playing keeps playing). Music pauses while the tab is
 * hidden and resumes when it is shown again. Nothing runs per frame.
 */
import { getAudioContext } from './Samples';
import { prefs } from '../ui/prefs';

/** A `music` entry of `public/assets/audio/manifest.json`. */
export interface MusicEntry {
  /** Relative to the audio folder, e.g. `music/title.mp3`. */
  file: string;
  /** Loudness trim applied on top of the music volume. */
  gain: number;
  /** Loop the track (the element's own loop, so no gap is added by us). */
  loop: boolean;
}

/** A `voice` entry of the manifest. */
export interface VoiceEntry {
  file: string;
  gain: number;
}

/** The shape of `public/assets/audio/manifest.json` (see docs/overhaul/BRIEF.md). */
export interface AudioManifest {
  music?: Record<string, MusicEntry>;
  voice?: Record<string, VoiceEntry>;
  sfx?: Record<string, { file: string; gain: number }[]>;
}

/** Default crossfade length, in seconds. */
const FADE = 0.8;
/** Music volume when the `musicVol` pref is absent. */
const DEFAULT_MUSIC = 0.6;
/** Seconds a duck takes to return to full level. */
const DUCK_RELEASE = 0.3;
/** A 44-byte WAV with no samples. Playing it inside a gesture unlocks the element for later tracks (iOS). */
const SILENT = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAABErAAABAAgAZGF0YQAAAAA=';

let manifestP: Promise<AudioManifest | null> | null = null;

/** URL of a file in the audio pack. Manifest paths are relative to the audio folder. */
export function audioUrl(file: string): string {
  return `${import.meta.env.BASE_URL}assets/audio/${file}`;
}

/**
 * Fetches the audio manifest once and caches the result. Resolves to null when it is missing or unreadable, which
 * turns every music and voice call into a silent no-op.
 */
export function loadAudioManifest(): Promise<AudioManifest | null> {
  manifestP ??= fetch(audioUrl('manifest.json'))
    .then((r) => (r.ok ? (r.json() as Promise<AudioManifest>) : null))
    .catch(() => null);
  return manifestP;
}

/** Clamps to 0..1. Non-finite values count as 0. */
export function unit(v: number): number {
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0;
}

/**
 * Reads a 0..1 volume from a prefs key. `ui/prefs.ts` only keeps the keys it declares, so until `musicVol` and
 * `voiceVol` are added there, this returns the fallback.
 */
export function readVolumePref(key: string, fallback: number): number {
  const raw = (prefs() as unknown as Record<string, unknown>)[key];
  return typeof raw === 'number' && Number.isFinite(raw) ? unit(raw) : fallback;
}

/** One of the two audio elements. Each element is wired to the graph once, and reused for every track. */
interface Slot {
  el: HTMLAudioElement;
  /** Gain that fades the track in and out. */
  gain: GainNode;
  /** Track loaded (or loading) in this slot, null when idle. */
  id: string | null;
  /** Bumped on every load, so events from an older load do nothing. */
  token: number;
  /** Loading, not yet audible. */
  pending: boolean;
  /** Paused because the tab is hidden: play again when it is shown. */
  resume: boolean;
  /** Unlocked by a gesture while idle (see SILENT). */
  primed: boolean;
  /** Timer that pauses the slot once its fade-out has finished. */
  timer: number;
  /** Removes the listeners of the current load. */
  off: () => void;
}

interface Graph {
  ctx: AudioContext;
  /** Music volume (`musicVol`). */
  level: GainNode;
  /** Duck multiplier, 1 when not ducked. */
  duck: GainNode;
  slots: Slot[];
  /** The audible track, null when silent. */
  live: Slot | null;
}

let graphRef: Graph | null = null;
let volume: number | null = null;
/** The track the game last asked for (null: silence). */
let want: string | null = null;

/** Builds the audio graph on first use, once an AudioContext exists. */
function getGraph(): Graph | null {
  if (graphRef) return graphRef;
  const ctx = getAudioContext();
  if (!ctx) return null;
  volume ??= readVolumePref('musicVol', DEFAULT_MUSIC);
  const level = ctx.createGain();
  level.gain.value = volume;
  level.connect(ctx.destination);
  const duck = ctx.createGain();
  duck.connect(level);
  graphRef = { ctx, level, duck, slots: [makeSlot(ctx, duck), makeSlot(ctx, duck)], live: null };
  document.addEventListener('visibilitychange', onVisibility);
  return graphRef;
}

function makeSlot(ctx: AudioContext, out: AudioNode): Slot {
  const el = new Audio();
  el.preload = 'auto';
  const gain = ctx.createGain();
  gain.gain.value = 0;
  ctx.createMediaElementSource(el).connect(gain).connect(out);
  return { el, gain, id: null, token: 0, pending: false, resume: false, primed: false, timer: 0, off: () => undefined };
}

/** Starts an element. Browsers refuse before the first user gesture: unlock() calls this again then. */
function start(el: HTMLAudioElement) {
  void el.play().catch(() => undefined);
}

/** Ramps a parameter to `to` over `sec` seconds, from `from` when given, else from its current value. */
function glide(p: AudioParam, to: number, now: number, sec: number, from?: number) {
  p.cancelScheduledValues(now);
  p.setValueAtTime(from ?? p.value, now);
  p.linearRampToValueAtTime(to, now + Math.max(0.01, sec));
}

/** Fades a slot to silence, then pauses it. */
function fadeOut(gr: Graph, s: Slot, sec: number) {
  glide(s.gain.gain, 0, gr.ctx.currentTime, sec);
  clearTimeout(s.timer);
  s.timer = window.setTimeout(() => halt(s), sec * 1000 + 60);
}

/** Pauses a slot at once and forgets its track. */
function halt(s: Slot) {
  s.off();
  s.token++;
  clearTimeout(s.timer);
  s.el.pause();
  s.id = null;
  s.pending = false;
  s.resume = false;
}

function onVisibility() {
  const gr = graphRef;
  if (!gr) return;
  for (const s of gr.slots) {
    if (document.hidden) {
      if (!s.el.paused) {
        s.el.pause();
        s.resume = true;
      }
    } else if (s.resume) {
      s.resume = false;
      if (s.id) start(s.el);
    }
  }
}

/** Makes `id` the wanted track (null: silence). The audible track fades out as the new one starts. */
function request(id: string | null, sec: number) {
  want = id;
  const gr = getGraph();
  if (!gr) return; // no AudioContext yet: unlock() asks again
  if (id === null) {
    for (const s of gr.slots) if (s.pending) halt(s);
    if (gr.live) {
      const old = gr.live;
      gr.live = null;
      fadeOut(gr, old, sec);
    }
    return;
  }
  void loadAudioManifest().then((m) => {
    if (want !== id) return; // superseded or stopped meanwhile
    if (gr.live?.id === id) return; // already audible
    const e = m?.music?.[id];
    if (!e || typeof e.file !== 'string') return; // not in the pack: keep what plays
    load(gr, id, e, sec);
  });
}

/** Loads a track into the slot that is not audible, and activates it once the browser can play it. */
function load(gr: Graph, id: string, e: MusicEntry, sec: number) {
  const s = gr.slots.find((x) => x !== gr.live) ?? gr.slots[0];
  const el = s.el;
  s.off();
  clearTimeout(s.timer);
  const token = ++s.token;
  s.id = id;
  s.pending = true;
  s.resume = false;
  const level = typeof e.gain === 'number' ? e.gain : 1;
  const onReady = () => {
    s.off();
    if (s.token === token) activate(gr, s, level, sec);
  };
  const onError = () => {
    s.off();
    if (s.token !== token) return;
    s.pending = false;
    s.id = null;
    if (want === id) want = gr.live?.id ?? null;
  };
  s.off = () => {
    el.removeEventListener('canplay', onReady);
    el.removeEventListener('error', onError);
  };
  el.addEventListener('canplay', onReady);
  el.addEventListener('error', onError);
  el.loop = !!e.loop;
  el.src = audioUrl(e.file);
  el.load();
}

/** Fades the new track in and the old one out. */
function activate(gr: Graph, s: Slot, level: number, sec: number) {
  const now = gr.ctx.currentTime;
  const old = gr.live;
  gr.live = s;
  s.pending = false;
  glide(s.gain.gain, level, now, sec, 0);
  if (old && old !== s) fadeOut(gr, old, sec);
  if (document.hidden) s.resume = true;
  else start(s.el);
}

/** Music: streams the manifest's tracks with crossfades, ducking and a visibility pause. */
export const music = {
  /**
   * Plays a `music` track from the manifest, crossfading from the current one. Asking for the track that is already
   * playing does nothing. An id missing from the manifest is ignored, and the current track keeps playing.
   * @param id manifest music id, e.g. `stage-hall`
   * @param opts.fade crossfade length in seconds (default 0.8)
   */
  play(id: string, opts: { fade?: number } = {}): void {
    if (id === want) return;
    request(id, opts.fade ?? FADE);
  },

  /**
   * Fades the current track to silence and cancels a track that is still loading.
   * @param fade fade-out length in seconds (default 0.8)
   */
  stop(fade: number = FADE): void {
    request(null, fade);
  },

  /**
   * Dips the music to `amount` of its level for `ms`, then returns it to full over 0.3 s. Used under the announcer
   * and at big moments such as K.O.
   * @param amount target level 0..1
   * @param ms how long to hold the dip
   */
  duck(amount: number, ms: number): void {
    const gr = getGraph();
    if (!gr) return;
    const now = gr.ctx.currentTime;
    const low = unit(amount);
    const hold = Math.max(0, ms) / 1000;
    const at = now + 0.03;
    const p = gr.duck.gain;
    p.cancelScheduledValues(now);
    p.setValueAtTime(p.value, now);
    p.linearRampToValueAtTime(low, at);
    p.setValueAtTime(low, at + hold);
    p.linearRampToValueAtTime(1, at + hold + DUCK_RELEASE);
  },

  /**
   * Sets the music volume 0..1 (the `musicVol` pref). Takes effect at once, and survives until the next call.
   */
  setVolume(v: number): void {
    if (!Number.isFinite(v)) return;
    volume = unit(v);
    const gr = graphRef;
    if (gr) gr.level.gain.setTargetAtTime(volume, gr.ctx.currentTime, 0.05);
  },

  /**
   * Call from a user gesture (pointerdown or keydown). Resumes the AudioContext, restarts the audible track if the
   * browser had refused it, and starts the wanted track if it has not started yet. Cheap to call on every gesture.
   */
  unlock(): void {
    const gr = getGraph();
    if (!gr) return;
    if (gr.ctx.state !== 'running') void gr.ctx.resume().catch(() => undefined);
    for (const s of gr.slots) {
      if (!s.primed && !s.id) {
        s.primed = true;
        s.el.src = SILENT;
        start(s.el);
      }
    }
    if (gr.live) {
      if (gr.live.el.paused && !document.hidden) {
        gr.live.resume = false;
        start(gr.live.el);
      }
    } else if (want && !gr.slots.some((s) => s.pending)) {
      request(want, FADE);
    }
  },
};
