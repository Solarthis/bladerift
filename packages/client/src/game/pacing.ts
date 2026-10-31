/**
 * Frame pacing and adaptive resolution for phones.
 *
 * Pacing: high-refresh screens (Galaxy S2x Ultra, iPhone Pro: 120 Hz) fire requestAnimationFrame every 8.3 ms. Running
 * the whole game that often doubles the work and any frame over budget shows as judder; Phaser's own fps limiter makes
 * it worse there (it accumulates time and alternates 2- and 3-tick frames, ~48 fps). The pacer learns the display
 * interval from the RAF timestamps and runs the game step on whole display frames near 60 fps: every
 * frame at 60 / 90 Hz (halving 90 Hz would judder at 45), every 2nd at 120 / 144 Hz. "High refresh rate" in Settings
 * runs every frame.
 *
 * Resolution: the canvas renders at the device pixel ratio capped at 2. If a device keeps missing frames, the governor
 * steps the render scale down (never below 1.25) - GPU fill rate is what slow phones run out of in a 2D game with
 * full-screen parallax layers. It only steps down, at most every few seconds, so it never oscillates, and the lower
 * scale holds for the session (the device does not get faster); changing the frame-rate setting resets it.
 */

const TARGET = 1000 / 60;
/** Render-scale steps (canvas px per CSS px), from the cap down. */
const SCALES = [2, 1.75, 1.5, 1.25];

export class FramePacer {
  /** Estimated display refresh interval (ms), from the shortest recent RAF gaps. */
  vsync = TARGET;
  /** Run the game on every display frame (Settings: high refresh rate). */
  full = false;
  /** Main-thread time of each game step (ms), ring buffer - read by perf tooling and the governor. */
  readonly work = new Float32Array(240);
  /** Interval between game steps that ran (ms), ring buffer. */
  readonly gaps = new Float32Array(240);
  steps = 0;
  /** Called after every game step with the gap since the previous one (ms). */
  onStep: ((gap: number) => void) | null = null;
  private lastRun = -1;
  private prevTick = -1;
  private readonly deltas = new Float32Array(48);
  private di = 0;

  /** Wrap Phaser's RAF callback (see install()). */
  wrap(cb: (time: number) => void) {
    return (time: number) => this.tick(time, cb);
  }

  tick(time: number, cb: (time: number) => void) {
    if (this.prevTick >= 0) {
      const d = time - this.prevTick;
      // ignore pauses (background tabs) and impossible gaps; a 30 Hz low-power cap still counts (d < 50)
      if (d > 3 && d < 50) {
        this.deltas[this.di++ % this.deltas.length] = d;
        let m = Infinity;
        const n = Math.min(this.di, this.deltas.length);
        for (let i = 0; i < n; i++) if (this.deltas[i] < m) m = this.deltas[i];
        this.vsync = m;
      }
    }
    this.prevTick = time;
    // run every n-th display frame, n = how many whole display frames fit in a 60 fps frame (1 at 60 / 90 Hz, 2 at
    // 120 / 144 Hz, 4 at 240 Hz); half a display frame of tolerance absorbs vsync timestamp wobble
    const n = this.full ? 1 : Math.max(1, Math.floor(TARGET / this.vsync + 0.1));
    if (this.lastRun >= 0 && time - this.lastRun < (n - 0.5) * this.vsync) return;
    const i = this.steps++ % this.work.length;
    this.gaps[i] = this.lastRun >= 0 ? time - this.lastRun : TARGET;
    this.lastRun = time;
    const t0 = performance.now();
    cb(time);
    this.work[i] = performance.now() - t0;
    this.onStep?.(this.gaps[i]);
  }

  /** Summary of the last `n` steps (perf tooling). */
  stats(n = 240) {
    n = Math.min(n, this.steps, this.work.length);
    const w: number[] = [];
    const g: number[] = [];
    for (let k = 0; k < n; k++) {
      const i = (this.steps - 1 - k + this.work.length) % this.work.length;
      w.push(this.work[i]);
      g.push(this.gaps[i]);
    }
    const q = (a: number[], p: number) => {
      const s = [...a].sort((x, y) => x - y);
      return s[Math.min(s.length - 1, Math.floor(s.length * p))] ?? 0;
    };
    const hitch = g.filter((x) => x > TARGET * 1.5 + 1).length;
    return { vsync: +this.vsync.toFixed(2), steps: n, work50: +q(w, 0.5).toFixed(2), work95: +q(w, 0.95).toFixed(2), work99: +q(w, 0.99).toFixed(2), gap95: +q(g, 0.95).toFixed(1), hitches: hitch };
  }
}

/** Phaser's RAF driver: re-armed with a fresh callback whenever the game wakes, so wrap both. */
interface Raf {
  callback: (time: number) => void;
  start(cb: (time: number) => void, forceSetTimeOut: boolean, delay: number): void;
}

export function installPacer(loop: { raf: Raf }, pacer: FramePacer) {
  const raf = loop.raf;
  const start = raf.start.bind(raf);
  raf.start = (cb, forceSetTimeOut, delay) => start(pacer.wrap(cb), forceSetTimeOut, delay);
  raf.callback = pacer.wrap(raf.callback);
}

/**
 * Steps the render scale down when frames keep missing their slot. Feed it every game step; it calls `apply` with the
 * new scale cap (canvas px per CSS px).
 */
export class ResolutionGovernor {
  level = 0;
  private window = 0;
  private slow = 0;
  private hold = 0;
  constructor(private apply: (scale: number) => void) {}

  get scale() {
    return SCALES[this.level];
  }

  /** gap: ms since the previous game step; vsync: display interval. */
  step(gap: number, vsync: number, dt: number) {
    if (this.hold > 0) {
      this.hold -= dt;
      return;
    }
    // a step that came more than half a target frame late (counting the display cadence) is a missed slot
    const late = gap > Math.max(TARGET, vsync) * 1.5 + 1;
    this.window += dt;
    if (late) this.slow++;
    if (this.window < 3) return;
    const frames = this.window * 60;
    const missRate = this.slow / Math.max(1, frames);
    this.window = 0;
    this.slow = 0;
    if (missRate > 0.12 && this.level < SCALES.length - 1) {
      this.level++;
      this.apply(this.scale);
      this.hold = 4; // let the new size settle before judging again
    }
  }

  /** Settings change (frame rate): start from full resolution again. */
  reset() {
    if (this.level === 0) return;
    this.level = 0;
    this.apply(this.scale);
  }
}
