/**
 * Recorded sound effects from the audio pack (`assets/audio/`, built by `tools/audio/build.mjs`).
 *
 * This module also owns the one AudioContext the game uses: `getAudioContext()`. Music, the announcer, the
 * synthesized effects in Sfx.ts and these samples all share it, so there is one clock and one unlock path on mobile.
 *
 * The manifest lists each sfx id as one or more variants. `play()` picks one at random, applies the variant's manifest
 * gain, the sfx volume and a small random pitch wobble, then pans it. Buffers are decoded once, lazily, on the first
 * unlock or the first play. A missing pack (no manifest, or a 404) is not an error: `has()` stays false and the game
 * keeps its synthesized sounds.
 */

/** The pack's sfx ids, by friendly name. */
export const SAMPLE_NAMES = [
  'hitLight', 'hitHeavy', 'hitCrit', 'slash', 'whoosh', 'whooshHeavy', 'block', 'parry', 'throw', 'koThud', 'bodyFall',
  'land', 'step', 'uiMove', 'uiSelect', 'uiBack', 'uiStart', 'fire', 'wind',
] as const;

/** One of the pack's sfx ids. */
export type SampleName = (typeof SAMPLE_NAMES)[number];

/** Shorter names that also work with `play()`, e.g. `samples.play('hit')` plays `hitLight`. */
export const SAMPLE_ALIASES = {
  hit: 'hitLight',
  heavy: 'hitHeavy',
  crit: 'hitCrit',
  swing: 'whoosh',
  swingHeavy: 'whooshHeavy',
  ko: 'koThud',
  fall: 'bodyFall',
  select: 'uiSelect',
  move: 'uiMove',
  back: 'uiBack',
  start: 'uiStart',
} as const satisfies Record<string, SampleName>;

/** A friendly alias from `SAMPLE_ALIASES`. */
export type SampleAlias = keyof typeof SAMPLE_ALIASES;

/** Anything `play()` and `has()` accept: a sample name or an alias. */
export type SampleId = SampleName | SampleAlias;

export interface SamplePlayOpts {
  /** Extra gain on top of the variant's manifest gain and the sfx volume. Default 1. */
  gain?: number;
  /** Playback rate (pitch). Default: a random 0.94 to 1.06 wobble, so repeats never match exactly. */
  rate?: number;
  /** Stereo pan, -1 (left) to 1 (right). Default 0. */
  pan?: number;
}

/** The pack manifest's entry for one sfx variant (the `sfx` part of the contract in docs/overhaul/BRIEF.md). */
interface ManifestVariant {
  file: string;
  gain?: number;
}

interface Manifest {
  sfx?: Record<string, ManifestVariant[] | undefined>;
}

/** A decoded variant, ready to play. */
interface Decoded {
  buffer: AudioBuffer;
  gain: number;
}

/** A sample that is playing now: its source and the gain stage in front of the panner. */
interface Live {
  id: string;
  src: AudioBufferSourceNode;
  amp: GainNode;
}

/** Pack folder, relative to the page like the other assets. */
const AUDIO_DIR = 'assets/audio/';
/** Random playback-rate wobble when a caller gives no rate. */
const RATE_JITTER = 0.06;
/** The sfx channel's default (prefs `sfxVol`). Sfx.ts scales its synthesized layers by sfxVol / this. */
export const SFX_VOLUME_DEFAULT = 0.8;
const DEFAULT_VOLUME = SFX_VOLUME_DEFAULT;
/** Simultaneous plays of one sample id before the oldest is cut short. */
const PER_ID_CAP = 6;
/** Simultaneous samples in total. */
const MAX_SOURCES = 32;
/** After a failed manifest load, wait this long before trying again (a missing pack must not refetch on every tap). */
const RETRY_MS = 30_000;

let shared: AudioContext | null = null;
let sharedUnavailable = false;

/**
 * The one AudioContext for the whole game. Created on the first call, so call it from a user gesture (Sfx.unlock and
 * Samples.unlock do). Returns null where Web Audio is missing or refuses to start.
 */
export function getAudioContext(): AudioContext | null {
  if (shared || sharedUnavailable) return shared;
  const w = window as unknown as { webkitAudioContext?: typeof AudioContext };
  const Ctor: typeof AudioContext | undefined = window.AudioContext ?? w.webkitAudioContext;
  if (!Ctor) {
    sharedUnavailable = true;
    return null;
  }
  try {
    shared = new Ctor();
  } catch {
    sharedUnavailable = true;
  }
  return shared;
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

/** Maps a friendly alias to its pack id; other names pass through. */
function toId(name: SampleId): string {
  return (SAMPLE_ALIASES as Record<string, string>)[name] ?? name;
}

class Samples {
  private _volume = DEFAULT_VOLUME;
  /** Where samples are routed. Sfx points this at its mix, so the compressor and master volume apply. */
  private output: AudioNode | null = null;
  private decoded = new Map<string, Decoded[]>();
  private live: Live[] = [];
  private pending = false;
  private done = false;
  private retryAt = 0;

  /** Sample volume 0..1 (the sfx channel of the settings; prefs key `sfxVol`). */
  get volume(): number {
    return this._volume;
  }

  /** Sets the sample volume 0..1. Applies to samples started from now on. */
  setVolume(v: number): void {
    this._volume = clamp01(Number.isFinite(v) ? v : 0);
  }

  /** Routes samples into `node` (null = the speakers). Sfx calls this with its mix bus when it starts. */
  setOutput(node: AudioNode | null): void {
    this.output = node;
  }

  /** Starts (or retries) loading the pack. Call on every user gesture; it does nothing once the pack is decoded. */
  unlock(): void {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state !== 'running') void ctx.resume().catch(() => {});
    this.load();
  }

  /** True when the pack has decoded samples for this name (or alias). False until the pack has loaded. */
  has(name: SampleId): boolean {
    return (this.decoded.get(toId(name))?.length ?? 0) > 0;
  }

  /**
   * Plays one variant of a sample. Silent (no error) when the pack is missing, not yet decoded, or the volume is 0.
   * Nothing else in the game depends on this returning a voice: it is fire-and-forget.
   */
  play(name: SampleId, opts: SamplePlayOpts = {}): void {
    if (this._volume <= 0) return;
    const ctx = getAudioContext();
    if (!ctx) return;
    this.load();
    const id = toId(name);
    const list = this.decoded.get(id);
    if (!list || list.length === 0) return;

    const v = list[(Math.random() * list.length) | 0];
    const gain = clamp(opts.gain ?? 1, 0, 4) * v.gain * this._volume;
    if (gain < 0.0005) return;
    const rate = clamp(opts.rate ?? (1 + (Math.random() * 2 - 1) * RATE_JITTER), 0.25, 4);

    this.evict(id);
    const src = ctx.createBufferSource();
    src.buffer = v.buffer;
    src.playbackRate.value = rate;
    const amp = ctx.createGain();
    amp.gain.value = gain;
    const pan = ctx.createStereoPanner();
    pan.pan.value = clamp(opts.pan ?? 0, -1, 1);
    src.connect(amp);
    amp.connect(pan);
    pan.connect(this.output ?? ctx.destination);

    const live: Live = { id, src, amp };
    this.live.push(live);
    src.onended = () => {
      this.forget(live);
      src.disconnect();
      amp.disconnect();
      pan.disconnect();
    };
    src.start();
  }

  /** Fetches and decodes the manifest and every variant it lists. Retries are throttled (see RETRY_MS). */
  private load(): void {
    if (this.pending || this.done || Date.now() < this.retryAt) return;
    this.pending = true;
    this.fetchPack().then(
      () => {
        this.done = true;
      },
      () => {
        this.retryAt = Date.now() + RETRY_MS;
      },
    ).finally(() => {
      this.pending = false;
    });
  }

  private async fetchPack(): Promise<void> {
    const ctx = getAudioContext();
    if (!ctx) throw new Error('no audio context');
    const res = await fetch(`${AUDIO_DIR}manifest.json`);
    if (!res.ok) throw new Error(`manifest ${res.status}`);
    const manifest = (await res.json()) as Manifest;
    const groups = await Promise.all(
      Object.entries(manifest.sfx ?? {}).map(async ([id, variants]) => {
        const decoded = await Promise.all((variants ?? []).map((v) => this.decode(ctx, v)));
        return [id, decoded.filter((d): d is Decoded => d !== null)] as const;
      }),
    );
    for (const [id, list] of groups) if (list.length > 0) this.decoded.set(id, list);
  }

  private async decode(ctx: AudioContext, v: ManifestVariant): Promise<Decoded | null> {
    try {
      const res = await fetch(`${AUDIO_DIR}${v.file}`);
      if (!res.ok) return null;
      const buffer = await ctx.decodeAudioData(await res.arrayBuffer());
      return { buffer, gain: Number.isFinite(v.gain) ? (v.gain as number) : 1 };
    } catch {
      return null;
    }
  }

  /** Makes room for one more sample of `id`: cuts the oldest of that id past the per-id cap, then the oldest overall. */
  private evict(id: string): void {
    while (this.live.filter((l) => l.id === id).length >= PER_ID_CAP) {
      const old = this.live.find((l) => l.id === id);
      if (!old) break;
      this.stop(old);
    }
    while (this.live.length >= MAX_SOURCES) this.stop(this.live[0]);
  }

  /** Cuts a sample short over ~6 ms so stealing never clicks. */
  private stop(l: Live): void {
    this.forget(l);
    try {
      const now = l.amp.context.currentTime;
      l.amp.gain.cancelScheduledValues(now);
      l.amp.gain.setTargetAtTime(0, now, 0.006);
      l.src.stop(now + 0.04);
    } catch {
      // Already ended.
    }
  }

  private forget(l: Live): void {
    const i = this.live.indexOf(l);
    if (i >= 0) this.live.splice(i, 1);
  }
}

/** The game's recorded sound effects. Use `samples.play('throw')`, or `sfx.play(...)` for the synthesized set. */
export const samples = new Samples();
