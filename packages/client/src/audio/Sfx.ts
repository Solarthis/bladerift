/**
 * Fully procedural sound system built on the Web Audio API.
 *
 * Every effect is synthesized at runtime from oscillators, cached noise buffers,
 * biquad filter sweeps, soft saturation and a single shared convolution reverb.
 * No audio files or third-party libraries are required.
 *
 * Positional sounds pass world coordinates and are attenuated/panned relative to
 * the listener (set every frame by the game scene). Non-positional sounds (UI,
 * local player feedback) are played dry in the centre of the stereo field.
 */

export type SfxName =
  | 'pistol' | 'smg' | 'rifle' | 'shotgun' | 'sniper' | 'rocket' | 'explosion' | 'grenadeThrow' | 'grenadeBounce'
  | 'reload' | 'dryFire' | 'pickupWeapon' | 'pickupHealth' | 'pickupGrenade' | 'hit' | 'headshot' | 'hurt' | 'death'
  | 'kill' | 'jetStart' | 'spawn' | 'uiClick' | 'uiHover' | 'matchStart' | 'matchEnd' | 'countdown' | 'impact'
  | 'swing' | 'punch' | 'railgun' | 'launcher' | 'shieldHit' | 'shieldBreak' | 'pickupShield'
  | 'flagTake' | 'flagCap' | 'flagReturn' | 'flagDrop' | 'zoneClose';

interface PlayOpts {
  x?: number;
  y?: number;
  volume?: number;
  pitch?: number;
}

/** A single in-flight sound: its output bus, scheduled sources and cleanup handle. */
interface Voice {
  name: SfxName;
  t: number;
  pitch: number;
  end: number;
  bus: GainNode;
  nodes: AudioNode[];
  sources: AudioScheduledSourceNode[];
  dead: boolean;
  disposed: boolean;
  /** Placed in the world (someone else's sound); false = your own, played centred. */
  pos: boolean;
}

type AudioContextCtor = typeof AudioContext;

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

/** Soft tanh saturation curve shared by every "weighted" sound; generated once. */
function makeDriveCurve(amount: number): Float32Array<ArrayBuffer> {
  const n = 1024;
  const curve = new Float32Array(n);
  const norm = Math.tanh(amount);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * amount) / norm;
  }
  return curve;
}
const DRIVE_CURVE = makeDriveCurve(3.2);

/** Per-name concurrency caps keep busy firefights from turning into mush. */
const VOICE_CAPS: Partial<Record<SfxName, number>> = {
  pistol: 6,
  smg: 6,
  rifle: 5,
  shotgun: 4,
  sniper: 3,
  rocket: 4,
  explosion: 5,
  grenadeThrow: 4,
  grenadeBounce: 5,
  impact: 6,
  swing: 4,
  punch: 5,
  hit: 8,
  headshot: 6,
  hurt: 4,
  death: 4,
  kill: 4,
  reload: 4,
  dryFire: 5,
  pickupWeapon: 3,
  pickupHealth: 3,
  pickupGrenade: 3,
  spawn: 4,
  jetStart: 3,
  uiClick: 4,
  uiHover: 3,
  matchStart: 2,
  matchEnd: 2,
  countdown: 3,
};
const DEFAULT_VOICE_CAP = 6;
const MAX_VOICES = 32;

/**
 * Frequent gameplay sounds rendered once (offline, after audio unlock) into buffers: playing one is then a buffer
 * source + gain (+ lowpass / panner / reverb send) instead of a fresh synth graph of 8-20 oscillators, filters and
 * oversampled waveshapers - in 20-player fights that was over a thousand node creations a second on the main thread,
 * and the audio thread ran every layer live. Three noise variants each; until baked, sounds play live.
 */
const BAKED: readonly SfxName[] = [
  'pistol', 'smg', 'rifle', 'shotgun', 'sniper', 'rocket', 'explosion', 'grenadeBounce', 'hit', 'headshot', 'impact',
  'punch', 'swing', 'shieldHit', 'railgun', 'launcher', 'hurt', 'dryFire', 'grenadeThrow',
];
const BAKE_VARIANTS = 3;
/** Small per-play pitch wobble on baked sounds so repeats never sound identical. */
const BAKE_JITTER: Partial<Record<SfxName, number>> = { smg: 0.06, pistol: 0.03, rifle: 0.025, hit: 0.04, impact: 0.05 };

const FULL_DISTANCE = 300;
const SILENT_DISTANCE = 1600;

/** Cut the silent tail of a baked render (renders are a fixed 2.6 s). */
function trimSilence(buf: AudioBuffer, ctx: AudioContext): AudioBuffer {
  let end = 0;
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = d.length - 1; i > end; i--)
      if (Math.abs(d[i]) > 2e-4) {
        end = i;
        break;
      }
  }
  const len = Math.min(buf.length, end + Math.ceil(buf.sampleRate * 0.03));
  const out = ctx.createBuffer(buf.numberOfChannels, Math.max(1, len), buf.sampleRate);
  for (let ch = 0; ch < buf.numberOfChannels; ch++) out.copyToChannel(buf.getChannelData(ch).subarray(0, len), ch);
  return out;
}

export class Sfx {
  private _volume = 0.8;
  private listener = { x: 0, y: 0 };

  private ctx: AudioContext | null = null;
  private mix: GainNode | null = null;
  private master: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private reverbIn: GainNode | null = null;

  private white: AudioBuffer | null = null;
  private pink: AudioBuffer | null = null;

  private voices: Voice[] = [];
  /** Baked sounds (see BAKED): buffers plus the reverb send amount the live voice used. */
  private baked = new Map<SfxName, { bufs: AudioBuffer[]; reverb: number }>();
  /** While baking: the offline context the synth builds into, and what spawn() reported. */
  private baking: { ctx: OfflineAudioContext; reverb: number } | null = null;

  private jetLevel = 0;
  private jetGain: GainNode | null = null;
  private jetRumble: GainNode | null = null;
  private jetFilter: BiquadFilterNode | null = null;

  /** Master volume 0..1. Applies live to anything already playing. */
  get volume(): number {
    return this._volume;
  }

  set volume(value: number) {
    this._volume = clamp01(Number.isFinite(value) ? value : 0);
    if (this.ctx && this.master) {
      const now = this.ctx.currentTime;
      this.master.gain.setTargetAtTime(this._volume, now, 0.02);
    }
  }

  /** Lazily build the audio graph on the first user gesture (required by mobile browsers). */
  unlock(): void {
    if (!this.ctx) {
      const w = window as unknown as { webkitAudioContext?: AudioContextCtor };
      const Ctor: AudioContextCtor | undefined = window.AudioContext ?? w.webkitAudioContext;
      if (!Ctor) return;
      try {
        this.ctx = new Ctor();
      } catch {
        return;
      }
      this.initGraph(this.ctx);
      this.installResumeHandlers();
      void this.bakeAll();
    }
    const ctx = this.ctx;
    if (!ctx) return;
    if (ctx.state !== 'running') void ctx.resume().catch(() => {});
  }

  /** World position of the local listener; called every frame by the game scene. */
  setListener(x: number, y: number): void {
    this.listener.x = x;
    this.listener.y = y;
  }

  play(name: SfxName, opts: PlayOpts = {}): void {
    const ctx = this.ctx;
    if (!ctx || this._volume <= 0 || this.baking) return;
    if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
    const b = this.baked.get(name);
    if (b) return this.playBaked(name, b, opts);
    this.synth(name, opts);
  }

  /** Play a baked sound: one buffer source through the usual voice (position, caps, reverb send). */
  private playBaked(name: SfxName, b: { bufs: AudioBuffer[]; reverb: number }, opts: PlayOpts) {
    const buf = b.bufs[(Math.random() * b.bufs.length) | 0];
    const j = BAKE_JITTER[name] ?? 0;
    const rate = clamp((opts.pitch ?? 1) * (1 + (Math.random() * 2 - 1) * j), 0.25, 4);
    const v = this.spawn(name, opts, buf.duration / rate, b.reverb);
    if (!v) return;
    const src = this.ctx!.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    src.connect(v.bus);
    src.start(v.t);
    src.onended = () => src.disconnect();
    v.sources.push(src);
  }

  /** Render the BAKED sounds offline, one at a time (off the main thread: the audio rendering runs on its own). */
  private async bakeAll() {
    const live = this.ctx;
    if (!live || typeof OfflineAudioContext === 'undefined') return;
    const sr = live.sampleRate;
    for (const name of BAKED) {
      const bufs: AudioBuffer[] = [];
      let reverb = 0;
      for (let k = 0; k < BAKE_VARIANTS; k++) {
        let off: OfflineAudioContext;
        try {
          off = new OfflineAudioContext(2, Math.ceil(sr * 2.6), sr);
        } catch {
          return; // no offline rendering here: keep the live synth
        }
        // build the voice into the offline context (synth primitives read this.ctx)
        this.baking = { ctx: off, reverb: 0 };
        this.ctx = off as unknown as AudioContext;
        try {
          this.synth(name, {});
        } finally {
          reverb = this.baking.reverb;
          this.ctx = live;
          this.baking = null;
        }
        try {
          bufs.push(trimSilence(await off.startRendering(), live));
        } catch {
          return;
        }
      }
      this.baked.set(name, { bufs, reverb });
      await new Promise((r) => setTimeout(r, 30)); // spread the work out
    }
  }

  private synth(name: SfxName, opts: PlayOpts): void {
    switch (name) {
      case 'pistol': this.sPistol(opts); break;
      case 'smg': this.sSmg(opts); break;
      case 'rifle': this.sRifle(opts); break;
      case 'shotgun': this.sShotgun(opts); break;
      case 'sniper': this.sSniper(opts); break;
      case 'rocket': this.sRocket(opts); break;
      case 'explosion': this.sExplosion(opts); break;
      case 'grenadeThrow': this.sGrenadeThrow(opts); break;
      case 'swing': this.sSwing(opts); break;
      case 'punch': this.sPunch(opts); break;
      case 'grenadeBounce': this.sGrenadeBounce(opts); break;
      case 'reload': this.sReload(opts); break;
      case 'dryFire': this.sDryFire(opts); break;
      case 'pickupWeapon': this.sPickupWeapon(opts); break;
      case 'pickupHealth': this.sPickupHealth(opts); break;
      case 'pickupGrenade': this.sPickupGrenade(opts); break;
      case 'hit': this.sHit(opts); break;
      case 'headshot': this.sHeadshot(opts); break;
      case 'kill': this.sKill(opts); break;
      case 'hurt': this.sHurt(opts); break;
      case 'death': this.sDeath(opts); break;
      case 'jetStart': this.sJetStart(opts); break;
      case 'spawn': this.sSpawn(opts); break;
      case 'uiClick': this.sUiClick(opts); break;
      case 'uiHover': this.sUiHover(opts); break;
      case 'matchStart': this.sMatchStart(opts); break;
      case 'matchEnd': this.sMatchEnd(opts); break;
      case 'countdown': this.sCountdown(opts); break;
      case 'impact': this.sImpact(opts); break;
      case 'railgun': this.sRailgun(opts); break;
      case 'launcher': this.sLauncher(opts); break;
      case 'shieldHit': this.sShieldHit(opts); break;
      case 'shieldBreak': this.sShieldBreak(opts); break;
      case 'pickupShield': this.sPickupShield(opts); break;
      case 'flagTake': this.sFlagTake(opts); break;
      case 'flagCap': this.sFlagCap(opts); break;
      case 'flagReturn': this.sFlagReturn(opts); break;
      case 'flagDrop': this.sFlagDrop(opts); break;
      case 'zoneClose': this.sZoneClose(opts); break;
    }
  }

  /** Continuous jetpack loop for the local player; 0 = off. */
  setJet(intensity: number): void {
    const level = clamp01(intensity);
    if (level === this.jetLevel) return;
    this.jetLevel = level;
    this.applyJet(level, false);
  }

  // ---------------------------------------------------------------------------
  // Graph / buffers
  // ---------------------------------------------------------------------------

  private initGraph(ctx: AudioContext): void {
    this.white = this.makeNoiseBuffer(ctx, 2, false);
    this.pink = this.makeNoiseBuffer(ctx, 2, true);

    // Voices -> mix -> compressor -> master volume -> speakers.
    this.mix = ctx.createGain();
    this.mix.gain.value = 1;

    this.compressor = ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -16;
    this.compressor.knee.value = 22;
    this.compressor.ratio.value = 7;
    this.compressor.attack.value = 0.002;
    this.compressor.release.value = 0.16;

    this.master = ctx.createGain();
    this.master.gain.value = this._volume;

    // One shared convolution tail. Sends are per-voice so the dry signal stays crisp.
    this.reverbIn = ctx.createGain();
    this.reverbIn.gain.value = 1;
    const convolver = ctx.createConvolver();
    convolver.buffer = this.makeImpulse(ctx, 1.7);
    const reverbOut = ctx.createGain();
    reverbOut.gain.value = 0.55;

    this.mix.connect(this.compressor);
    this.reverbIn.connect(convolver);
    convolver.connect(reverbOut);
    reverbOut.connect(this.compressor);
    this.compressor.connect(this.master);
    this.master.connect(ctx.destination);

    this.initJet(ctx);
  }

  private makeNoiseBuffer(ctx: AudioContext, seconds: number, pink: boolean): AudioBuffer {
    const length = Math.max(1, Math.floor(ctx.sampleRate * seconds));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    if (!pink) {
      for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
      return buffer;
    }
    // Paul Kellet's economical pink-noise filter.
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < length; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    }
    return buffer;
  }

  private makeImpulse(ctx: AudioContext, seconds: number): AudioBuffer {
    const length = Math.max(1, Math.floor(ctx.sampleRate * seconds));
    const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buffer.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        const x = i / length;
        // A few sparse early reflections then an exponential diffuse tail.
        const early = i < ctx.sampleRate * 0.06 && Math.random() < 0.006 ? (Math.random() * 2 - 1) * 0.55 : 0;
        data[i] = ((Math.random() * 2 - 1) * 0.7 + early) * Math.pow(1 - x, 2.8);
      }
    }
    return buffer;
  }

  /** The jetpack loop is created once and gain-ramped; sources never restart mid-game. */
  private initJet(ctx: AudioContext): void {
    if (!this.mix || !this.white) return;
    const noise = ctx.createBufferSource();
    noise.buffer = this.white;
    noise.loop = true;

    const highpass = ctx.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.value = 110;

    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 900;
    lowpass.Q.value = 0.8;

    const gain = ctx.createGain();
    gain.gain.value = 0;
    noise.connect(highpass);
    highpass.connect(lowpass);
    lowpass.connect(gain);
    gain.connect(this.mix);
    noise.start();

    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 6.3;
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 190;
    lfo.connect(lfoDepth);
    lfoDepth.connect(lowpass.frequency);
    lfo.start();

    const rumble = ctx.createGain();
    rumble.gain.value = 0;
    const low = ctx.createOscillator();
    low.type = 'sine';
    low.frequency.value = 46;
    const low2 = ctx.createOscillator();
    low2.type = 'triangle';
    low2.frequency.value = 69;
    low.connect(rumble);
    low2.connect(rumble);
    rumble.connect(this.mix);
    low.start();
    low2.start();

    this.jetGain = gain;
    this.jetRumble = rumble;
    this.jetFilter = lowpass;
    this.applyJet(this.jetLevel, true);
  }

  private applyJet(level: number, immediate: boolean): void {
    const ctx = this.ctx;
    if (!ctx || !this.jetGain || !this.jetRumble || !this.jetFilter) return;
    const now = ctx.currentTime;
    const target = level * 0.17;
    const rumbleTarget = level * 0.12;
    const cutoff = 620 + level * 1750;
    if (immediate) {
      this.jetGain.gain.value = target;
      this.jetRumble.gain.value = rumbleTarget;
      this.jetFilter.frequency.value = cutoff;
    } else {
      this.jetGain.gain.setTargetAtTime(target, now, 0.09);
      this.jetRumble.gain.setTargetAtTime(rumbleTarget, now, 0.11);
      this.jetFilter.frequency.setTargetAtTime(cutoff, now, 0.12);
    }
  }

  private installResumeHandlers(): void {
    if (typeof document === 'undefined') return;
    const resume = () => {
      const ctx = this.ctx;
      if (ctx && ctx.state !== 'running') void ctx.resume().catch(() => {});
    };
    document.addEventListener('pointerdown', resume, { passive: true });
    document.addEventListener('touchstart', resume, { passive: true });
    document.addEventListener('keydown', resume);
  }

  // ---------------------------------------------------------------------------
  // Voice management
  // ---------------------------------------------------------------------------

  private spawn(name: SfxName, opts: PlayOpts, dur: number, reverb: number): Voice | null {
    const ctx = this.ctx;
    if (!ctx || !this.mix) return null;
    if (this.baking) {
      // baking: a dry voice straight into the offline destination (position and reverb are applied at play time)
      this.baking.reverb = reverb;
      const bus = ctx.createGain();
      bus.connect(ctx.destination);
      return { name, t: 0.002, pitch: 1, end: dur, bus, nodes: [], sources: [], dead: false, disposed: true, pos: false };
    }

    this.cull();

    const t = ctx.currentTime + 0.004;
    const level = clamp01(opts.volume ?? 1);
    const pitch = clamp(opts.pitch ?? 1, 0.25, 4);

    let atten = 1;
    let pan = 0;
    let cutoff = 20000;
    if (opts.x !== undefined && opts.y !== undefined) {
      const dx = opts.x - this.listener.x;
      const dy = opts.y - this.listener.y;
      const dist = Math.hypot(dx, dy);
      const far = clamp01((dist - FULL_DISTANCE) / (SILENT_DISTANCE - FULL_DISTANCE));
      if (far >= 1) return null;
      atten = Math.pow(1 - far, 1.6);
      if (atten < 0.015) return null;
      pan = clamp(dx / 900, -1, 1);
      cutoff = 18000 * Math.pow(0.085, far);
    }
    // the same sound starting again within 30 ms is not heard as a separate sound: skip it before building any nodes
    // (bursts - pellets, several hits in one frame - built whole graphs only to steal them). Your own sounds and
    // positional ones never block each other (a distant LMG must not mute your rifle).
    const pos = opts.x !== undefined && opts.y !== undefined;
    for (let i = this.voices.length - 1; i >= 0; i--) {
      const v = this.voices[i];
      if (v.name === name && v.pos === pos && !v.dead && t - v.t < 0.03) return null;
    }

    const bus = ctx.createGain();
    bus.gain.value = level * atten;

    const nodes: AudioNode[] = [];
    if (opts.x !== undefined && opts.y !== undefined) {
      const lowpass = ctx.createBiquadFilter();
      lowpass.type = 'lowpass';
      lowpass.frequency.value = cutoff;
      lowpass.Q.value = 0.4;
      const panner = ctx.createStereoPanner();
      panner.pan.value = pan;
      bus.connect(lowpass);
      lowpass.connect(panner);
      panner.connect(this.mix);
      nodes.push(lowpass, panner);
    } else {
      bus.connect(this.mix);
    }

    if (reverb > 0 && this.reverbIn) {
      const send = ctx.createGain();
      send.gain.value = reverb;
      bus.connect(send);
      send.connect(this.reverbIn);
      nodes.push(send);
    }

    const voice: Voice = {
      name,
      t,
      pitch,
      end: t + dur,
      bus,
      nodes,
      sources: [],
      dead: false,
      disposed: false,
      pos,
    };
    this.voices.push(voice);
    this.enforceLimits(name);
    setTimeout(() => this.disposeVoice(voice), (dur + 0.35) * 1000);
    return voice;
  }

  private cull(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    for (let i = this.voices.length - 1; i >= 0; i--) {
      if (this.voices[i].end <= now) this.voices.splice(i, 1);
    }
  }

  private enforceLimits(name: SfxName): void {
    const cap = VOICE_CAPS[name] ?? DEFAULT_VOICE_CAP;
    let same = 0;
    for (const v of this.voices) if (v.name === name) same++;
    while (same > cap) {
      const idx = this.voices.findIndex((v) => v.name === name);
      if (idx < 0) break;
      this.steal(this.voices[idx]);
      same--;
    }
    while (this.voices.length > MAX_VOICES) this.steal(this.voices[0]);
  }

  /** Fade a voice out over ~15ms so stealing never clicks, then free it shortly after. */
  private steal(voice: Voice): void {
    if (voice.dead) return;
    voice.dead = true;
    const ctx = this.ctx;
    if (ctx) {
      const now = ctx.currentTime;
      const gain = voice.bus.gain;
      gain.cancelScheduledValues(now);
      gain.setValueAtTime(Math.max(0.0001, gain.value), now);
      gain.exponentialRampToValueAtTime(0.0001, now + 0.015);
    }
    const idx = this.voices.indexOf(voice);
    if (idx >= 0) this.voices.splice(idx, 1);
    setTimeout(() => this.disposeVoice(voice), 40);
  }

  private disposeVoice(voice: Voice): void {
    if (voice.disposed) return;
    voice.disposed = true;
    for (const source of voice.sources) {
      try {
        source.stop();
      } catch {
        // Already stopped.
      }
    }
    try {
      voice.bus.disconnect();
    } catch {
      // Already disconnected.
    }
    for (const node of voice.nodes) {
      try {
        node.disconnect();
      } catch {
        // Already disconnected.
      }
    }
    const idx = this.voices.indexOf(voice);
    if (idx >= 0) this.voices.splice(idx, 1);
  }

  // ---------------------------------------------------------------------------
  // Synthesis primitives
  // ---------------------------------------------------------------------------

  /** Pitched oscillator with a fast attack and exponential decay. */
  private tone(
    v: Voice,
    t: number,
    dur: number,
    type: OscillatorType,
    f0: number,
    f1 = f0,
    peak = 0.4,
    attack = 0.002,
    drive = 0,
  ): OscillatorNode {
    const ctx = this.ctx!;
    const p = v.pitch;
    const osc = ctx.createOscillator();
    osc.type = type;
    const startFreq = Math.max(1, f0 * p);
    osc.frequency.setValueAtTime(startFreq, t);
    if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1 * p), t + dur);

    const gain = ctx.createGain();
    const amp = Math.max(0.0002, peak);
    const a = Math.min(Math.max(0.0005, attack), dur * 0.45);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(amp, t + a);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    let shaper: WaveShaperNode | null = null;
    osc.connect(gain);
    if (drive > 0) {
      shaper = ctx.createWaveShaper();
      shaper.curve = DRIVE_CURVE;
      shaper.oversample = '2x';
      gain.connect(shaper);
      shaper.connect(v.bus);
    } else {
      gain.connect(v.bus);
    }

    osc.start(t);
    osc.stop(t + dur + 0.03);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
      shaper?.disconnect();
    };
    v.sources.push(osc);
    return osc;
  }

  /** Filtered noise burst; `drive` adds saturation before the amplitude envelope. */
  private noise(
    v: Voice,
    t: number,
    dur: number,
    peak: number,
    f0: number,
    f1 = f0,
    type: BiquadFilterType = 'bandpass',
    attack = 0.001,
    q = 1,
    drive = 0,
    buffer?: AudioBuffer,
  ): AudioBufferSourceNode {
    const ctx = this.ctx!;
    const buf = (buffer ?? this.white)!;
    const p = v.pitch;

    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.Q.value = q;
    const startFreq = Math.max(20, f0 * p);
    filter.frequency.setValueAtTime(startFreq, t);
    if (f1 !== f0) filter.frequency.exponentialRampToValueAtTime(Math.max(20, f1 * p), t + dur);

    const gain = ctx.createGain();
    const amp = Math.max(0.0002, peak);
    const a = Math.min(Math.max(0.0005, attack), dur * 0.45);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(amp, t + a);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    src.connect(filter);
    let shaper: WaveShaperNode | null = null;
    let tail: AudioNode = filter;
    if (drive > 0) {
      shaper = ctx.createWaveShaper();
      shaper.curve = DRIVE_CURVE;
      shaper.oversample = '2x';
      filter.connect(shaper);
      tail = shaper;
    }
    tail.connect(gain);
    gain.connect(v.bus);

    // Random read offset decorrelates repeated bursts so they don't phase-comb.
    const offset = Math.random() * Math.max(0, buf.duration - 0.3);
    src.start(t, offset);
    src.stop(t + dur + 0.03);
    src.onended = () => {
      src.disconnect();
      filter.disconnect();
      gain.disconnect();
      shaper?.disconnect();
    };
    v.sources.push(src);
    return src;
  }

  // ---------------------------------------------------------------------------
  // Weapons
  // ---------------------------------------------------------------------------

  private sPistol(o: PlayOpts): void {
    const v = this.spawn('pistol', o, 0.4, 0.12);
    if (!v) return;
    const t = v.t;
    this.noise(v, t, 0.07, 0.85, 3200, 700, 'bandpass', 0.001, 0.9, 2.2);
    this.tone(v, t, 0.11, 'square', 540, 130, 0.28, 0.001, 2.4);
    this.tone(v, t, 0.17, 'sine', 180, 55, 0.55);
    this.noise(v, t, 0.018, 0.3, 8000, 6000, 'highpass', 0.001, 0.7, 1.2);
  }

  private sSmg(o: PlayOpts): void {
    const v = this.spawn('smg', o, 0.26, 0.06);
    if (!v) return;
    // Slight per-shot pitch drift keeps sustained bursts from sounding identical.
    v.pitch *= 0.94 + Math.random() * 0.12;
    const t = v.t;
    this.noise(v, t, 0.045, 0.55, 2800, 1600, 'bandpass', 0.001, 1.3, 1.4);
    this.tone(v, t, 0.05, 'square', 760, 300, 0.16, 0.001, 1.8);
    this.tone(v, t, 0.08, 'sine', 230, 100, 0.22);
  }

  private sRifle(o: PlayOpts): void {
    const v = this.spawn('rifle', o, 0.55, 0.12);
    if (!v) return;
    const t = v.t;
    this.noise(v, t, 0.12, 0.8, 1900, 420, 'bandpass', 0.001, 0.8, 2.6);
    this.tone(v, t, 0.2, 'square', 210, 55, 0.3, 0.001, 3);
    this.tone(v, t, 0.28, 'sine', 95, 40, 0.65, 0.002, 1.4);
    this.noise(v, t, 0.035, 0.45, 6000, 4200, 'highpass', 0.001, 0.7, 1.4);
  }

  private sShotgun(o: PlayOpts): void {
    const v = this.spawn('shotgun', o, 1.1, 0.24);
    if (!v) return;
    const t = v.t;
    this.noise(v, t, 0.9, 0.62, 2800, 240, 'lowpass', 0.002, 0.7, 2.8, this.pink!);
    this.noise(v, t, 0.09, 0.9, 1600, 700, 'bandpass', 0.001, 0.7, 2.4);
    this.tone(v, t, 0.45, 'sine', 120, 32, 0.8, 0.002, 1.8);
    this.tone(v, t, 0.18, 'triangle', 220, 70, 0.25, 0.001, 1.2);
  }

  private sSniper(o: PlayOpts): void {
    const v = this.spawn('sniper', o, 1.4, 0.5);
    if (!v) return;
    const t = v.t;
    this.noise(v, t, 0.03, 1, 5000, 3000, 'highpass', 0.0005, 0.7, 1.5);
    this.tone(v, t, 0.18, 'square', 420, 90, 0.3, 0.001, 3);
    this.tone(v, t, 0.3, 'sine', 140, 42, 0.7, 0.001, 1.5);
    // Discrete slap-back echoes across the arena, on top of the reverb send.
    this.noise(v, t + 0.11, 0.16, 0.2, 1800, 450, 'bandpass', 0.002, 0.9, 1.2);
    this.tone(v, t + 0.11, 0.2, 'sine', 120, 60, 0.16);
    this.noise(v, t + 0.26, 0.22, 0.12, 1200, 300, 'bandpass', 0.003, 0.8);
    this.noise(v, t + 0.48, 0.28, 0.06, 800, 220, 'lowpass', 0.01, 0.6);
  }

  private sRocket(o: PlayOpts): void {
    const v = this.spawn('rocket', o, 0.9, 0.15);
    if (!v) return;
    const t = v.t;
    this.noise(v, t, 0.7, 0.5, 400, 2600, 'bandpass', 0.05, 1.1, 1.2, this.pink!);
    this.noise(v, t, 0.12, 0.5, 3000, 1400, 'highpass', 0.003, 0.7, 1.4);
    this.tone(v, t, 0.55, 'sawtooth', 80, 210, 0.18, 0.06, 1.5);
    this.tone(v, t, 0.3, 'sine', 60, 120, 0.25, 0.03);
  }

  /** Railgun: an electric charge whine snapping into a sharp crack and a deep thump. */
  private sRailgun(o: PlayOpts): void {
    const v = this.spawn('railgun', o, 1.2, 0.45);
    if (!v) return;
    const t = v.t;
    this.tone(v, t, 0.09, 'sawtooth', 900, 2600, 0.12, 0.002, 2);
    this.noise(v, t + 0.02, 0.05, 0.9, 7000, 3500, 'highpass', 0.0005, 0.7, 1.6);
    this.tone(v, t + 0.02, 0.35, 'square', 1800, 160, 0.22, 0.001, 2.4);
    this.tone(v, t + 0.02, 0.5, 'sine', 110, 36, 0.8, 0.001, 1.4);
    this.noise(v, t + 0.14, 0.3, 0.12, 2600, 800, 'bandpass', 0.003, 0.8, 1.2);
  }

  /** Grenade launcher: a hollow pneumatic thunk. */
  private sLauncher(o: PlayOpts): void {
    const v = this.spawn('launcher', o, 0.6, 0.15);
    if (!v) return;
    const t = v.t;
    this.tone(v, t, 0.18, 'sine', 210, 70, 0.75, 0.002, 1.4);
    this.noise(v, t, 0.12, 0.5, 1100, 300, 'bandpass', 0.002, 0.8, 1.8, this.pink!);
    this.tone(v, t + 0.01, 0.08, 'triangle', 520, 300, 0.15, 0.001);
  }

  /** A hit soaked by an energy shield: a short glassy ping. */
  private sShieldHit(o: PlayOpts): void {
    const v = this.spawn('shieldHit', o, 0.3, 0.2);
    if (!v) return;
    v.pitch *= 0.95 + Math.random() * 0.1;
    const t = v.t;
    this.tone(v, t, 0.16, 'sine', 1900, 1500, 0.22, 0.001);
    this.tone(v, t, 0.1, 'triangle', 3100, 2800, 0.08, 0.001);
    this.noise(v, t, 0.03, 0.25, 6500, 5000, 'highpass', 0.0005, 0.7, 1.2);
  }

  /** A shield shattering: bright glass bursts tumbling down in pitch. */
  private sShieldBreak(o: PlayOpts): void {
    const v = this.spawn('shieldBreak', o, 0.9, 0.35);
    if (!v) return;
    const t = v.t;
    this.noise(v, t, 0.25, 0.7, 8000, 2500, 'highpass', 0.0005, 0.6, 1.8);
    for (let i = 0; i < 4; i++) this.tone(v, t + i * 0.035, 0.22, 'sine', 2400 - i * 380, 900 - i * 120, 0.18, 0.001);
    this.tone(v, t, 0.3, 'sine', 300, 90, 0.35, 0.002, 1.2);
  }

  private sPickupShield(o: PlayOpts): void {
    const v = this.spawn('pickupShield', o, 0.6, 0.3);
    if (!v) return;
    const t = v.t;
    this.tone(v, t, 0.4, 'sine', 520, 1560, 0.22, 0.01);
    this.tone(v, t + 0.05, 0.35, 'triangle', 780, 2080, 0.12, 0.01);
    this.noise(v, t, 0.3, 0.12, 5000, 9000, 'highpass', 0.02, 0.7);
  }

  // ---- Capture the Flag announcements (played centred: they concern everyone) ----

  /** A flag was taken: a bright two-tone alarm. */
  private sFlagTake(o: PlayOpts): void {
    const v = this.spawn('flagTake', o, 0.9, 0.3);
    if (!v) return;
    const t = v.t;
    for (let i = 0; i < 3; i++) {
      const at = t + i * 0.16;
      this.tone(v, at, 0.13, 'square', i % 2 ? 660 : 880, i % 2 ? 660 : 880, 0.09, 0.004);
      this.tone(v, at, 0.13, 'triangle', i % 2 ? 1320 : 1760, i % 2 ? 1320 : 1760, 0.05, 0.004);
    }
    this.noise(v, t, 0.08, 0.1, 4000, 2500, 'bandpass', 0.002, 1);
  }

  /** A capture: a rising major fanfare. */
  private sFlagCap(o: PlayOpts): void {
    const v = this.spawn('flagCap', o, 1.8, 0.45);
    if (!v) return;
    const t = v.t;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((f, i) => {
      this.tone(v, t + i * 0.09, 0.5 + (i === 3 ? 0.7 : 0), 'sawtooth', f, f, 0.1, 0.008, 1.4);
      this.tone(v, t + i * 0.09, 0.45 + (i === 3 ? 0.6 : 0), 'triangle', f * 2, f * 2, 0.04, 0.008);
    });
    this.tone(v, t, 1.3, 'sine', 130.81, 130.81, 0.22, 0.02);
    this.noise(v, t + 0.27, 0.6, 0.12, 9000, 5000, 'highpass', 0.01, 0.7);
  }

  /** A flag went home: a soft falling chime. */
  private sFlagReturn(o: PlayOpts): void {
    const v = this.spawn('flagReturn', o, 0.9, 0.4);
    if (!v) return;
    const t = v.t;
    this.tone(v, t, 0.5, 'sine', 1318.5, 1318.5, 0.14, 0.004);
    this.tone(v, t + 0.11, 0.6, 'sine', 987.77, 987.77, 0.14, 0.004);
    this.tone(v, t + 0.22, 0.7, 'triangle', 659.25, 659.25, 0.1, 0.006);
  }

  /** A carrier fell and dropped the flag: a dull thud and a low tone. */
  private sFlagDrop(o: PlayOpts): void {
    const v = this.spawn('flagDrop', o, 0.6, 0.25);
    if (!v) return;
    const t = v.t;
    this.tone(v, t, 0.3, 'sine', 180, 70, 0.4, 0.002, 1);
    this.tone(v, t + 0.04, 0.35, 'triangle', 392, 293.66, 0.08, 0.004);
    this.noise(v, t, 0.12, 0.3, 900, 300, 'lowpass', 0.002, 0.8);
  }

  /** The shrinking zone starts closing: a low two-sweep siren with a rumble. */
  private sZoneClose(o: PlayOpts): void {
    const v = this.spawn('zoneClose', o, 1.4, 0.4);
    if (!v) return;
    const t = v.t;
    for (let i = 0; i < 2; i++) {
      this.tone(v, t + i * 0.45, 0.42, 'sawtooth', 220, 440, 0.08, 0.02, 1.2);
      this.tone(v, t + i * 0.45, 0.42, 'sine', 110, 220, 0.12, 0.02);
    }
    this.noise(v, t, 1.0, 0.1, 400, 120, 'lowpass', 0.05, 0.8);
  }

  private sExplosion(o: PlayOpts): void {
    const v = this.spawn('explosion', o, 2.2, 0.35);
    if (!v) return;
    const t = v.t;
    this.tone(v, t, 0.9, 'sine', 92, 24, 0.95, 0.002, 1.2);
    this.noise(v, t, 0.85, 0.8, 3200, 180, 'lowpass', 0.003, 0.7, 3.2);
    this.noise(v, t, 0.38, 0.55, 900, 200, 'bandpass', 0.002, 0.6, 2.4, this.pink!);
    // Sparse crackle debris.
    for (let i = 0; i < 9; i++) {
      const d = 0.03 + Math.random() * 0.55;
      this.noise(
        v,
        t + d,
        0.02 + Math.random() * 0.04,
        0.1 + Math.random() * 0.18,
        1200 + Math.random() * 3600,
        700 + Math.random() * 800,
        'bandpass',
        0.001,
        2,
      );
    }
    // Long low rumble tail.
    this.noise(v, t + 0.1, 1.5, 0.32, 160, 45, 'lowpass', 0.08, 0.7, 0, this.pink!);
  }

  private sGrenadeThrow(o: PlayOpts): void {
    const v = this.spawn('grenadeThrow', o, 0.5, 0.1);
    if (!v) return;
    const t = v.t;
    this.noise(v, t, 0.35, 0.4, 450, 1900, 'bandpass', 0.035, 1.2, 0.6, this.pink!);
    this.tone(v, t, 0.3, 'sine', 90, 180, 0.09, 0.04);
  }

  /** Melee whoosh: a short airy sweep. */
  private sSwing(o: PlayOpts): void {
    const v = this.spawn('swing', o, 0.22, 0.08);
    if (!v) return;
    v.pitch *= 0.92 + Math.random() * 0.16;
    this.noise(v, v.t, 0.16, 0.45, 700, 2600, 'bandpass', 0.02, 2.2, 0.5, this.pink!);
  }

  /** Melee hit: a meaty low thump with a slap on top. */
  private sPunch(o: PlayOpts): void {
    const v = this.spawn('punch', o, 0.3, 0.06);
    if (!v) return;
    v.pitch *= 0.9 + Math.random() * 0.2;
    const t = v.t;
    this.tone(v, t, 0.16, 'sine', 160, 55, 0.7, 0.001, 1.4);
    this.noise(v, t, 0.05, 0.55, 2200, 900, 'bandpass', 0.001, 1.2, 1.4);
    this.tone(v, t, 0.04, 'square', 520, 240, 0.14, 0.001, 1.6);
  }

  private sGrenadeBounce(o: PlayOpts): void {
    const v = this.spawn('grenadeBounce', o, 0.25, 0.12);
    if (!v) return;
    v.pitch *= 0.95 + Math.random() * 0.1;
    const t = v.t;
    this.noise(v, t, 0.02, 0.25, 6200, 4200, 'bandpass', 0.0005, 3, 0.8);
    this.tone(v, t, 0.09, 'triangle', 2200, 1750, 0.24);
    this.tone(v, t, 0.06, 'square', 3400, 2600, 0.1);
    this.tone(v, t + 0.012, 0.12, 'sine', 3100, 2900, 0.12);
  }

  private sImpact(o: PlayOpts): void {
    const v = this.spawn('impact', o, 0.2, 0.05);
    if (!v) return;
    v.pitch *= 0.9 + Math.random() * 0.2;
    const t = v.t;
    this.noise(v, t, 0.03, 0.42, 3000, 1400, 'bandpass', 0.001, 1.6, 1.6);
    this.tone(v, t, 0.05, 'square', 900, 320, 0.1, 0.001, 1.5);
  }

  // ---------------------------------------------------------------------------
  // Player feedback / interactions
  // ---------------------------------------------------------------------------

  private sHit(o: PlayOpts): void {
    const v = this.spawn('hit', o, 0.28, 0.1);
    if (!v) return;
    v.pitch *= 0.95 + Math.random() * 0.1;
    const t = v.t;
    this.noise(v, t, 0.028, 0.5, 3200, 1200, 'bandpass', 0.001, 1.4, 1.6);
    this.tone(v, t, 0.12, 'sine', 300, 110, 0.4, 0.001, 1.2);
    this.tone(v, t, 0.05, 'square', 900, 400, 0.12, 0.001, 1.8);
  }

  private sHeadshot(o: PlayOpts): void {
    const v = this.spawn('headshot', o, 0.7, 0.24);
    if (!v) return;
    const t = v.t;
    this.noise(v, t, 0.03, 0.4, 6000, 4500, 'highpass', 0.0005, 0.7, 1.2);
    this.tone(v, t, 0.3, 'sine', 1700, 2450, 0.32, 0.001);
    this.tone(v, t, 0.22, 'sine', 2600, 2500, 0.18, 0.001);
    this.tone(v, t + 0.01, 0.5, 'sine', 1210, 1180, 0.1, 0.002);
  }

  private sKill(o: PlayOpts): void {
    const v = this.spawn('kill', o, 0.8, 0.3);
    if (!v) return;
    const t = v.t;
    const notes = [659.25, 880, 1318.5];
    for (let i = 0; i < notes.length; i++) {
      this.tone(v, t + i * 0.055, 0.28, 'triangle', notes[i], notes[i] * 1.004, 0.24, 0.003);
    }
    this.tone(v, t, 0.5, 'sine', 330, 660, 0.1, 0.01);
  }

  private sHurt(o: PlayOpts): void {
    const v = this.spawn('hurt', o, 0.45, 0.08);
    if (!v) return;
    const t = v.t;
    this.tone(v, t, 0.24, 'sine', 150, 45, 0.7, 0.002, 1.4);
    this.tone(v, t, 0.08, 'square', 120, 70, 0.14, 0.001, 1.2);
    this.noise(v, t, 0.14, 0.32, 700, 200, 'lowpass', 0.002, 0.7, 1.4, this.pink!);
  }

  private sDeath(o: PlayOpts): void {
    const v = this.spawn('death', o, 1.1, 0.2);
    if (!v) return;
    const t = v.t;
    this.tone(v, t, 0.8, 'sawtooth', 440, 110, 0.22, 0.005, 1.6);
    this.tone(v, t, 0.8, 'triangle', 220, 55, 0.3, 0.005);
    this.tone(v, t + 0.12, 0.4, 'sine', 80, 40, 0.35);
    this.noise(v, t, 0.55, 0.16, 900, 150, 'lowpass', 0.01, 0.7, 0.8, this.pink!);
  }

  private sDryFire(o: PlayOpts): void {
    const v = this.spawn('dryFire', o, 0.15, 0.05);
    if (!v) return;
    const t = v.t;
    this.noise(v, t, 0.012, 0.28, 4200, 3000, 'highpass', 0.0005, 0.7, 0.6);
    this.tone(v, t, 0.03, 'square', 1400, 300, 0.1, 0.0005);
    this.tone(v, t, 0.05, 'sine', 220, 120, 0.12);
  }

  private sReload(o: PlayOpts): void {
    const v = this.spawn('reload', o, 0.65, 0.08);
    if (!v) return;
    const t = v.t;
    const click = (at: number, tone: number) => {
      this.noise(v, at, 0.012, 0.3, 3600, 2600, 'highpass', 0.0005, 0.7, 0.6);
      this.tone(v, at, 0.035, 'square', tone, tone * 0.3, 0.1, 0.0005);
      this.tone(v, at, 0.06, 'sine', 240, 110, 0.12);
    };
    click(t, 820);
    click(t + 0.3, 680);
    // Magazine slide + metallic ring.
    this.noise(v, t + 0.34, 0.16, 0.18, 900, 2800, 'bandpass', 0.012, 1.4, 0.8);
    this.tone(v, t + 0.34, 0.1, 'triangle', 520, 740, 0.08, 0.004);
    this.tone(v, t + 0.35, 0.16, 'triangle', 1550, 1850, 0.05, 0.003);
  }

  private sPickupWeapon(o: PlayOpts): void {
    const v = this.spawn('pickupWeapon', o, 0.45, 0.2);
    if (!v) return;
    const t = v.t;
    this.noise(v, t, 0.14, 0.28, 2600, 1800, 'bandpass', 0.002, 4, 0.8);
    this.tone(v, t, 0.18, 'triangle', 1100, 1500, 0.2, 0.002);
    this.tone(v, t + 0.03, 0.2, 'triangle', 1650, 2200, 0.14, 0.002);
    this.noise(v, t + 0.05, 0.1, 0.18, 4400, 3200, 'bandpass', 0.002, 3);
  }

  private sPickupHealth(o: PlayOpts): void {
    const v = this.spawn('pickupHealth', o, 0.8, 0.4);
    if (!v) return;
    const t = v.t;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    for (let i = 0; i < notes.length; i++) {
      this.tone(v, t + i * 0.06, 0.28, 'triangle', notes[i], notes[i], 0.18, 0.005);
    }
    this.tone(v, t, 0.45, 'sine', 261.63, 523.25, 0.08, 0.05);
  }

  private sPickupGrenade(o: PlayOpts): void {
    const v = this.spawn('pickupGrenade', o, 0.45, 0.2);
    if (!v) return;
    const t = v.t;
    this.noise(v, t, 0.05, 0.28, 3200, 2400, 'bandpass', 0.001, 3, 0.8);
    this.tone(v, t, 0.12, 'triangle', 880, 1180, 0.2, 0.002);
    this.tone(v, t + 0.06, 0.2, 'triangle', 1320, 1760, 0.14, 0.002);
    this.tone(v, t, 0.16, 'sine', 220, 330, 0.14, 0.003);
  }

  private sSpawn(o: PlayOpts): void {
    const v = this.spawn('spawn', o, 1.1, 0.5);
    if (!v) return;
    const t = v.t;
    this.tone(v, t, 0.7, 'sine', 600, 1200, 0.1, 0.16);
    this.tone(v, t + 0.05, 0.6, 'sine', 900, 1500, 0.08, 0.18);
    this.tone(v, t, 0.8, 'triangle', 300, 600, 0.06, 0.22);
    this.noise(v, t, 0.45, 0.1, 1200, 4200, 'bandpass', 0.2, 1.5);
  }

  private sJetStart(o: PlayOpts): void {
    const v = this.spawn('jetStart', o, 0.5, 0.15);
    if (!v) return;
    const t = v.t;
    this.noise(v, t, 0.38, 0.38, 300, 1450, 'bandpass', 0.02, 0.8, 1.2, this.pink!);
    this.tone(v, t, 0.32, 'sine', 60, 115, 0.28, 0.03);
    this.tone(v, t + 0.02, 0.2, 'triangle', 130, 220, 0.1, 0.02);
  }

  private sUiClick(o: PlayOpts): void {
    const v = this.spawn('uiClick', o, 0.15, 0.05);
    if (!v) return;
    const t = v.t;
    this.tone(v, t, 0.05, 'triangle', 900, 600, 0.16, 0.001);
    this.noise(v, t, 0.02, 0.08, 3200, 2200, 'highpass', 0.001, 0.7);
  }

  private sUiHover(o: PlayOpts): void {
    const v = this.spawn('uiHover', o, 0.1, 0.03);
    if (!v) return;
    this.tone(v, v.t, 0.035, 'sine', 1400, 1200, 0.05, 0.001);
  }

  private sMatchStart(o: PlayOpts): void {
    const v = this.spawn('matchStart', o, 1.2, 0.35);
    if (!v) return;
    const t = v.t;
    const stab = (at: number, notes: number[], dur: number, peak: number) => {
      for (const f of notes) {
        this.tone(v, at, dur, 'sawtooth', f, f, peak, 0.01, 1.7);
        this.tone(v, at, dur * 0.9, 'triangle', f * 2, f * 2, peak * 0.25, 0.01);
      }
    };
    stab(t, [392, 523.25, 659.25], 0.3, 0.14);
    stab(t + 0.22, [523.25, 659.25, 783.99], 0.65, 0.13);
    this.tone(v, t, 0.85, 'sine', 196, 196, 0.22, 0.02);
    this.noise(v, t, 0.12, 0.12, 2400, 1200, 'bandpass', 0.002, 1);
  }

  private sMatchEnd(o: PlayOpts): void {
    const v = this.spawn('matchEnd', o, 2.4, 0.5);
    if (!v) return;
    const t = v.t;
    const chord = [261.63, 329.63, 392, 523.25];
    for (const f of chord) {
      this.tone(v, t, 1.7, 'triangle', f, f, 0.14, 0.06);
      this.tone(v, t, 1.5, 'sine', f * 0.5, f * 0.5, 0.1, 0.08);
    }
    this.tone(v, t + 0.18, 1.4, 'sine', 659.25, 659.25, 0.08, 0.1);
    this.tone(v, t + 0.32, 1.2, 'sine', 783.99, 783.99, 0.06, 0.1);
  }

  private sCountdown(o: PlayOpts): void {
    const v = this.spawn('countdown', o, 0.3, 0.1);
    if (!v) return;
    const t = v.t;
    this.tone(v, t, 0.14, 'square', 880, 880, 0.14, 0.002);
    this.tone(v, t, 0.14, 'sine', 1760, 1760, 0.07, 0.002);
    this.noise(v, t, 0.02, 0.08, 5000, 4000, 'highpass', 0.001, 0.7);
  }
}

export const sfx = new Sfx();
if (import.meta.env.DEV) (globalThis as unknown as { __sfx: Sfx }).__sfx = sfx; // (dev tooling)
