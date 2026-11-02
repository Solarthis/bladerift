/**
 * Announcer voice lines ("ROUND 1", "FIGHT!", "K.O."). Each `voice` file in the manifest is fetched and decoded once
 * into an AudioBuffer, then played through the shared AudioContext. Lines are scheduled back to back, so they never
 * overlap: say('round1') then say('fight') starts 'fight' when 'round1' ends. A missing manifest or file is a silent
 * no-op. Nothing runs per frame.
 */
import { getAudioContext } from './Samples';
import { audioUrl, loadAudioManifest, readVolumePref, unit } from './Music';

/** Voice volume when the `voiceVol` pref is absent. */
const DEFAULT_VOICE = 0.9;
/** Lines allowed to wait for their turn. Extra say() calls are dropped. */
const MAX_WAITING = 4;

interface Out {
  ctx: AudioContext;
  /** Voice volume (`voiceVol`). */
  bus: GainNode;
}

let out: Out | null = null;
let volume: number | null = null;
/** Decoded lines by id. A missing line caches null, so it is not fetched again. */
const cache = new Map<string, Promise<AudioBuffer | null>>();
/** Lines are handled one after another through this chain, so a slow decode never reorders them. */
let chain: Promise<void> = Promise.resolve();
/** Lines queued but not yet scheduled. */
let waiting = 0;
/** Context time at which the last scheduled line ends. */
let busyUntil = 0;
/** Bumped by stop(). Lines queued before it are dropped. */
let epoch = 0;
/** Lines currently sounding. */
const sounding = new Set<AudioBufferSourceNode>();
let warmed = false;

/** Builds the output on first use, once an AudioContext exists. */
function getOut(): Out | null {
  if (out) return out;
  const ctx = getAudioContext();
  if (!ctx) return null;
  volume ??= readVolumePref('voiceVol', DEFAULT_VOICE);
  const bus = ctx.createGain();
  bus.gain.value = volume;
  bus.connect(ctx.destination);
  out = { ctx, bus };
  return out;
}

/** Fetches and decodes one voice line, once. Resolves to null if the file is missing or undecodable. */
function decode(ctx: AudioContext, id: string, file: string): Promise<AudioBuffer | null> {
  let p = cache.get(id);
  if (!p) {
    p = fetch(audioUrl(file))
      .then((r) => (r.ok ? r.arrayBuffer() : null))
      .then((b) => (b ? ctx.decodeAudioData(b) : null))
      .catch(() => null);
    cache.set(id, p);
  }
  return p;
}

/** Schedules one line so it starts no earlier than `callAt`, and no earlier than the end of the line before it. */
async function line(gen: number, id: string, callAt: number): Promise<void> {
  try {
    const m = await loadAudioManifest();
    const e = m?.voice?.[id];
    const o = getOut();
    if (!e || typeof e.file !== 'string' || !o || gen !== epoch) return;
    const buf = await decode(o.ctx, id, e.file);
    if (!buf || gen !== epoch) return;
    const start = Math.max(callAt, busyUntil, o.ctx.currentTime);
    const src = o.ctx.createBufferSource();
    const gain = o.ctx.createGain();
    gain.gain.value = typeof e.gain === 'number' ? e.gain : 1;
    src.buffer = buf;
    src.connect(gain).connect(o.bus);
    src.onended = () => {
      sounding.delete(src);
      src.disconnect();
      gain.disconnect();
    };
    src.start(start);
    sounding.add(src);
    busyUntil = start + buf.duration;
  } finally {
    waiting--;
  }
}

/** The announcer: queued, non-overlapping voice lines. */
export const announcer = {
  /**
   * Plays a voice line after the lines already queued. Dropped when no AudioContext exists yet (before the first
   * gesture) or when too many lines are waiting.
   * @param id manifest voice id, e.g. `round1`, `fight`, `ko`
   * @param opts.delay seconds to wait from now before the line may start (default 0)
   */
  say(id: string, opts: { delay?: number } = {}): void {
    if (waiting >= MAX_WAITING) return;
    const o = getOut();
    if (!o) return;
    const callAt = o.ctx.currentTime + Math.max(0, opts.delay ?? 0);
    const gen = epoch;
    waiting++;
    chain = chain.then(() => line(gen, id, callAt)).catch(() => undefined);
  },

  /** Cuts the line that is sounding and drops the queue, e.g. when a match ends or is left. */
  stop(): void {
    epoch++;
    busyUntil = 0;
    for (const s of sounding) {
      try {
        s.stop();
      } catch {
        /* already ended */
      }
    }
    sounding.clear();
  },

  /**
   * Sets the voice volume 0..1 (the `voiceVol` pref). Takes effect at once.
   */
  setVolume(v: number): void {
    if (!Number.isFinite(v)) return;
    volume = unit(v);
    if (out) out.bus.gain.setTargetAtTime(volume, out.ctx.currentTime, 0.05);
  },

  /**
   * Call from a user gesture (pointerdown or keydown). Resumes the AudioContext, and once, decodes every voice line in
   * the background so the first say() plays at once. Cheap to call on every gesture.
   */
  unlock(): void {
    const o = getOut();
    if (!o) return;
    if (o.ctx.state !== 'running') void o.ctx.resume().catch(() => undefined);
    if (warmed) return;
    warmed = true;
    void loadAudioManifest().then((m) => {
      for (const [id, e] of Object.entries(m?.voice ?? {})) {
        if (typeof e?.file === 'string') void decode(o.ctx, id, e.file);
      }
    });
  },
};
