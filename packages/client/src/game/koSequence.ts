/**
 * MUGEN-style K.O. and round-result staging (docs/feel/mugen-reference.md, section 6 "UI / feedback").
 *
 * GameScene calls these from its round events; every call returns at once and cleans up after itself.
 *
 *   // 'ko' event (replaces the old 'K.O.' banner and flash; cinematic.ts still does its own white-out for Art finishes):
 *   playKoSequence(this, {
 *     x: v.x, y: v.y - 30, perfect: false, timeOver: false, draw: false, artFinish: finishedByArt,
 *     winnerName: w.name, winnerColor: w.accent, onSlowmo: (s, ms) => this.requestSlowmo(s, ms),
 *   });
 *   // once the K.O. has played (about 2.4 s later), the round or match result:
 *   playRoundWinner(this, { name: w.name, color: w.accent, finalWin: false });
 *
 *   destroyKoSequence(this);   // on leaving the scene, or to cut every sequence of the scene short (no-op when idle)
 *
 * Timeline of playKoSequence (ms after the call):
 *     0-300    white flash at 80%, fading (skipped when artFinish: the Art's own white-out is already on screen)
 *     0        onSlowmo(0.25, 450): the sim's K.O. slow motion
 *     0-400    the huge red word slams in (scale 2.6 to 1 with a back-ease overshoot); a white light disc and a ring
 *              expand behind it (0-700); a second, smaller ring bursts from the victim (0-500)
 *     400-1650 holds
 *     260-560  "PERFECT" (gold) slams in under it, when perfect
 *     1650-2000 everything fades out, then the sequence ends (the round banner follows, ending by 3.4 s, before
 *              the next round's intro at ROUND.koTicks = 3.5 s)
 * Timeline of playRoundWinner: slides in 0-260, holds to 1150, slides out to the left by 1400.
 *
 * Everything is in screen space: each object is pinned to a screen point and counter-scaled by 1/zoom every frame, the
 * way render/lighting.ts and game/cinematic.ts do (Phaser scales scroll-factor-0 objects about the view centre).
 * Animation runs on the scene's own clock, one POST_UPDATE listener per sequence, removed when it ends.
 */
import Phaser from 'phaser';

// ------------------------------------------------------------------ public types

export interface KoSequenceOpts {
  /** World position of the finishing hit (the victim). A short impact ring starts there. */
  x: number;
  /** World position of the finishing hit (the victim). */
  y: number;
  /** The winner took no damage this round: "PERFECT" goes under the K.O. word. */
  perfect: boolean;
  /** The round ended on the clock: the word is "TIME OVER" (wins over the draw wording). */
  timeOver: boolean;
  /**
   * Both fighters went down together: the word is "DOUBLE K.O.". The sim never gets here in play: its K.O. always
   * names a winner, and a draw only comes from the clock (timeOver wins over it). Kept for a forced event only.
   */
  draw: boolean;
  /** An Art landed the finish: cinematic.ts already white-outs the screen, so the flash is skipped. */
  artFinish: boolean;
  /** The winner's display name. The K.O. sequence does not draw it (playRoundWinner does); kept for the call site. */
  winnerName: string;
  /** The winner's accent colour (0xRRGGBB): tints the rings. */
  winnerColor: number;
  /** Asks the sim for slow motion: called once, at the start, with (scale, ms). */
  onSlowmo?: (scale: number, ms: number) => void;
}

export interface RoundWinnerOpts {
  /** The winner's display name, shown upper-cased as "<NAME> WINS". */
  name: string;
  /** The winner's accent colour (0xRRGGBB): the stripe on the banner. */
  color: number;
  /** The match is over: the banner reads "WINNER!!" instead. */
  finalWin: boolean;
}

export interface KoHandle {
  /** The sequence is over and every object it made is gone. */
  done: Promise<void>;
  /** Ends the sequence now (idempotent). */
  cancel(): void;
}

// ------------------------------------------------------------------ tuning

const FONT = "'Lilita One', 'Nunito', sans-serif";
/** The face the page loads (styles.css --display); document.fonts.check tells whether it is ready. */
const FONT_CHECK = '400 64px "Lilita One"';

const SLOWMO_SCALE = 0.25;
const SLOWMO_MS = 450;
const FLASH_MS = 300;
const FLASH_ALPHA = 0.8;
const SLAM_MS = 400;
const SLAM_FROM = 2.6;
const HOLD_END_MS = 1650;
const FADE_MS = 350;
const KO_TOTAL_MS = HOLD_END_MS + FADE_MS;
const RING_MS = 700;
const IMPACT_MS = 500;
const PERFECT_AT_MS = 260;
const PERFECT_SLAM_MS = 300;

const BANNER_IN_MS = 260;
const BANNER_HOLD_END_MS = 1150;
const BANNER_OUT_MS = 250;
const BANNER_TOTAL_MS = BANNER_HOLD_END_MS + BANNER_OUT_MS;
const BANNER_SLIDE = 0.7;

/** Depths: above the fighters and the HUD canvas layers, the ring behind the word, the flash over everything. */
const DEPTH_RING = 59;
const DEPTH_TEXT = 60;
const DEPTH_FLASH = 60.5;

const RED = 0xff3b2e;
const SHADOW = '#0a0410';
const GOLD = 0xffd24a;
const GOLD_CSS = '#ffd24a';
const GOLD_EDGE = '#3d2200';
const BANNER_BODY = 0x0b0712;
const BANNER_EDGE = 0xe9b64a;
const BANNER_TEXT = '#fff6dc';
const BANNER_EDGE_CSS = '#14080f';

// ------------------------------------------------------------------ small helpers

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const easeOut = (p: number) => 1 - Math.pow(1 - p, 3);
const easeIn = (p: number) => p * p * p;
/** Back-ease out: overshoots past 1 by about 10% and settles. */
function easeBack(p: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2);
}
/** Mixes two 0xRRGGBB colours. */
function mix(a: number, b: number, k: number): number {
  const ch = (s: number) => Math.round(((a >> s) & 255) * (1 - k) + ((b >> s) & 255) * k);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}
const hex = (rgb: number) => '#' + (rgb & 0xffffff).toString(16).padStart(6, '0');

/** The subset of a game object this module moves and cleans up. */
interface Pinned {
  setPosition(x: number, y?: number): unknown;
  setScale(x: number, y?: number): unknown;
  setAlpha(v: number): unknown;
  destroy(): void;
}

// ------------------------------------------------------------------ the run registry

interface Run {
  scene: Phaser.Scene;
  objs: Pinned[];
  texts: Phaser.GameObjects.Text[];
  alive: boolean;
  resolve: () => void;
  tick: () => void;
  onShutdown: () => void;
}

/** Every sequence still playing, across scenes. */
const runs = new Set<Run>();

/** Puts an object at a screen point (tx, ty) with the given scale, whatever the camera zoom is. */
function pin(o: Pinned, cam: Phaser.Cameras.Scene2D.Camera, W: number, H: number, tx: number, ty: number, s: number) {
  const z = cam.zoom || 1;
  o.setPosition(W / 2 + (tx - W / 2) / z, H / 2 + (ty - H / 2) / z);
  o.setScale(s / z);
}

/**
 * Runs `step(t)` (t in ms since the start) every frame until `durMs`, then destroys `objs` and resolves. The first step
 * runs at once so nothing shows at the wrong place for a frame. `texts` get the real face once it has loaded.
 */
function start(
  scene: Phaser.Scene,
  durMs: number,
  objs: Pinned[],
  texts: Phaser.GameObjects.Text[],
  step: (t: number) => void,
): KoHandle {
  let resolveFn: () => void = () => {};
  const done = new Promise<void>((r) => (resolveFn = r));
  const run: Run = { scene, objs, texts, alive: true, resolve: resolveFn, tick: () => {}, onShutdown: () => {} };
  const t0 = scene.time.now;
  run.tick = () => {
    if (!run.alive) return;
    const t = scene.time.now - t0;
    if (t >= durMs) {
      finish(run);
      return;
    }
    step(t);
  };
  run.onShutdown = () => finish(run);
  runs.add(run);
  scene.events.on(Phaser.Scenes.Events.POST_UPDATE, run.tick);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, run.onShutdown);
  // a text drawn before the face loaded falls back to a system font, so redraw it once the face is in
  if (texts.length && typeof document !== 'undefined' && document.fonts && !document.fonts.check(FONT_CHECK)) {
    document.fonts
      .load(FONT_CHECK)
      .then(() => {
        if (!run.alive) return;
        for (const t of run.texts) if (t.active) t.setFontFamily(FONT);
      })
      .catch(() => {});
  }
  run.tick();
  return {
    done,
    cancel: () => finish(run),
  };
}

/** Ends a run: stops its listeners and destroys what it made. Safe to call twice, or after the scene is gone. */
function finish(run: Run) {
  if (!run.alive) return;
  run.alive = false;
  runs.delete(run);
  try {
    run.scene.events.off(Phaser.Scenes.Events.POST_UPDATE, run.tick);
    run.scene.events.off(Phaser.Scenes.Events.SHUTDOWN, run.onShutdown);
  } catch {
    // the scene's event emitter is already gone
  }
  for (const o of run.objs) {
    try {
      o.destroy();
    } catch {
      // already destroyed with its scene
    }
  }
  run.resolve();
}

/** A big stroked display word, screen-anchored and hidden until its timeline shows it. */
function bigWord(
  scene: Phaser.Scene,
  word: string,
  size: number,
  fill: string,
  edge: string,
  edgeWidth: number,
): Phaser.GameObjects.Text {
  const t = scene.add.text(0, 0, word, {
    fontFamily: FONT,
    fontSize: `${size}px`,
    color: fill,
    stroke: edge,
    strokeThickness: edgeWidth,
    align: 'center',
  });
  t.setOrigin(0.5).setScrollFactor(0).setDepth(DEPTH_TEXT).setAlpha(0);
  t.setShadow(0, Math.round(size * 0.05), SHADOW, 0, false, true);
  return t;
}

// ------------------------------------------------------------------ K.O.

/**
 * The K.O. staging: a white flash, slow motion, the red word slamming in over a light ring, PERFECT under it when earned,
 * a hold, then a fade. Returns at once; `done` resolves when everything is gone.
 */
export function playKoSequence(scene: Phaser.Scene, o: KoSequenceOpts): KoHandle {
  const W = scene.scale.width;
  const H = scene.scale.height;
  const cx = W / 2;
  const ky = H * 0.42;
  // (DOUBLE K.O. only for a forced draw that is not a clock end: unreachable from the sim, see KoSequenceOpts.draw)
  const word = o.timeOver ? 'TIME OVER' : o.draw ? 'DOUBLE K.O.' : 'K.O.';
  const size = Math.round(H * 0.3);
  const tint = mix(0xffffff, o.winnerColor, 0.35);

  o.onSlowmo?.(SLOWMO_SCALE, SLOWMO_MS);

  const objs: Pinned[] = [];
  const texts: Phaser.GameObjects.Text[] = [];

  // the full-screen flash, over everything (zoom-compensated: a rectangle larger than the view covers it at any zoom)
  let flash: Phaser.GameObjects.Rectangle | null = null;
  if (!o.artFinish) {
    const big = Math.max(W, H) * 2;
    flash = scene.add.rectangle(0, 0, big, big, 0xffffff).setScrollFactor(0).setDepth(DEPTH_FLASH).setAlpha(FLASH_ALPHA);
    objs.push(flash);
  }

  // the light disc and ring behind the word, and the burst from the victim
  const ringG = scene.add.graphics().setScrollFactor(0).setDepth(DEPTH_RING);
  const impactG = scene.add.graphics().setScrollFactor(0).setDepth(DEPTH_RING);
  objs.push(ringG, impactG);

  const koT = bigWord(scene, word, size, hex(RED), hex(0x3a0007), Math.round(size * 0.12));
  objs.push(koT);
  texts.push(koT);

  let perfT: Phaser.GameObjects.Text | null = null;
  if (o.perfect) {
    const psize = Math.round(H * 0.11);
    perfT = bigWord(scene, 'PERFECT', psize, GOLD_CSS, GOLD_EDGE, Math.round(psize * 0.14));
    objs.push(perfT);
    texts.push(perfT);
  }

  return start(scene, KO_TOTAL_MS, objs, texts, (t) => {
    const c = scene.cameras.main;
    const Wn = scene.scale.width;
    const Hn = scene.scale.height;
    const z = c.zoom || 1;
    const maxW = Wn * 0.92;

    // flash
    if (flash) {
      flash.setAlpha(t < FLASH_MS ? FLASH_ALPHA * (1 - t / FLASH_MS) : 0);
      pin(flash, c, Wn, Hn, Wn / 2, Hn / 2, 1);
    }

    // the word: slam in with overshoot, hold, fade and drift up a little
    const koFit = Math.min(1, maxW / Math.max(1, koT.width));
    let ks: number;
    let ka: number;
    if (t < SLAM_MS) {
      ks = lerp(SLAM_FROM, 1, easeBack(t / SLAM_MS));
      ka = clamp01(t / 60);
    } else if (t < HOLD_END_MS) {
      ks = 1;
      ka = 1;
    } else {
      const p = clamp01((t - HOLD_END_MS) / FADE_MS);
      ks = 1 + 0.05 * p;
      ka = 1 - p;
    }
    const koY = ky;
    pin(koT, c, Wn, Hn, cx, koY, koFit * ks);
    koT.setAlpha(ka);

    // PERFECT under it
    if (perfT) {
      const pFit = Math.min(1, maxW / Math.max(1, perfT.width));
      const p = clamp01((t - PERFECT_AT_MS) / PERFECT_SLAM_MS);
      const ps = lerp(2, 1, easeBack(p));
      const fade = t < HOLD_END_MS ? 1 : 1 - clamp01((t - HOLD_END_MS) / FADE_MS);
      const pa = t < PERFECT_AT_MS ? 0 : clamp01((t - PERFECT_AT_MS) / 60) * fade;
      const py = koY + (koT.height * koFit) * 0.5 + (perfT.height * pFit) * 0.5 - size * 0.04;
      pin(perfT, c, Wn, Hn, cx, py, pFit * ps);
      perfT.setAlpha(pa);
    }

    // the light disc and two rings expanding from behind the word
    ringG.clear();
    if (t < RING_MS) {
      const p = t / RING_MS;
      const e = easeOut(p);
      const R = Math.max(Wn, Hn) * 0.75;
      ringG.fillStyle(0xffffff, 0.55 * (1 - p));
      ringG.fillCircle(0, 0, lerp(size * 0.3, size * 1.1, e));
      ringG.lineStyle(lerp(26, 3, e), 0xffffff, 0.95 * (1 - p));
      ringG.strokeCircle(0, 0, lerp(size * 0.5, R, e));
    }
    if (t >= 80 && t < 80 + RING_MS) {
      const p = (t - 80) / RING_MS;
      const e = easeOut(p);
      ringG.lineStyle(lerp(10, 1, e), tint, 0.8 * (1 - p));
      ringG.strokeCircle(0, 0, lerp(size * 0.5, Math.max(Wn, Hn) * 0.5, e));
    }
    pin(ringG, c, Wn, Hn, cx, koY, 1);

    // the impact at the victim, in screen space (clamped to the view)
    const wv = c.worldView;
    const vx = Phaser.Math.Clamp((o.x - wv.x) * z, 0, Wn);
    const vy = Phaser.Math.Clamp((o.y - wv.y) * z, 0, Hn);
    impactG.clear();
    if (t < IMPACT_MS) {
      const p = t / IMPACT_MS;
      const e = easeOut(p);
      impactG.lineStyle(lerp(14, 2, e), tint, 0.9 * (1 - p));
      impactG.strokeCircle(0, 0, lerp(10, Math.max(Wn, Hn) * 0.22, e));
    }
    pin(impactG, c, Wn, Hn, vx, vy, 1);
  });
}

// ------------------------------------------------------------------ round result

/**
 * The round or match result: a slanted banner slides in from the right, holds, and slides out to the left (about 1.4 s).
 * Reads "<NAME> WINS", or "WINNER!!" when `finalWin`.
 */
export function playRoundWinner(scene: Phaser.Scene, o: RoundWinnerOpts): KoHandle {
  const W = scene.scale.width;
  const H = scene.scale.height;
  const cy = H * 0.36;
  const word = o.finalWin ? 'WINNER!!' : `${(o.name || 'PLAYER').toUpperCase()} WINS`;
  const size = Math.round(H * 0.105);
  const pad = size * 0.5;
  const h = Math.round(size * 1.3);
  const sk = h * 0.32;
  const stripeH = Math.max(3, Math.round(h * 0.14));

  const plate = scene.add.graphics().setScrollFactor(0).setDepth(DEPTH_TEXT - 0.1);
  const t = bigWord(scene, word, size, BANNER_TEXT, BANNER_EDGE_CSS, Math.round(size * 0.12));
  t.setAlpha(1);
  /** The width the plate was last drawn at (-1: not yet). */
  let plateW = -1;

  return start(scene, BANNER_TOTAL_MS, [plate, t], [t], (time) => {
    const c = scene.cameras.main;
    const Wn = scene.scale.width;
    const Hn = scene.scale.height;
    const maxW = Wn * 0.86;

    // slide: in from the right, hold, out to the left
    let off: number;
    if (time < BANNER_IN_MS) {
      off = lerp(Wn * BANNER_SLIDE, 0, easeOut(time / BANNER_IN_MS));
    } else if (time < BANNER_HOLD_END_MS) {
      off = 0;
    } else {
      off = lerp(0, -Wn * BANNER_SLIDE, easeIn(clamp01((time - BANNER_HOLD_END_MS) / BANNER_OUT_MS)));
    }
    const tx = Wn / 2 + off;
    const fit = Math.min(1, maxW / Math.max(1, t.width));
    const tw = t.width * fit;
    const w = tw + pad * 2;

    // the plate, drawn in its own local px (pinned at scale 1). Its shape depends only on its width, which is fixed for the
    // banner's life (the text settles once the face loads), so it is drawn when the width changes and moved otherwise
    if (w !== plateW) {
      plateW = w;
      plate.clear();
      const xl = (y: number) => -w / 2 + sk * (1 - (2 * (y + h / 2)) / h);
      const xr = (y: number) => w / 2 + sk * (1 - (2 * (y + h / 2)) / h);
      plate.fillStyle(BANNER_BODY, 0.92);
      plate.fillPoints(
        [new Phaser.Math.Vector2(-w / 2 + sk, -h / 2), new Phaser.Math.Vector2(w / 2 + sk, -h / 2), new Phaser.Math.Vector2(w / 2 - sk, h / 2), new Phaser.Math.Vector2(-w / 2 - sk, h / 2)],
        true,
      );
      plate.lineStyle(3, BANNER_EDGE, 1);
      plate.strokePoints(
        [new Phaser.Math.Vector2(-w / 2 + sk, -h / 2), new Phaser.Math.Vector2(w / 2 + sk, -h / 2), new Phaser.Math.Vector2(w / 2 - sk, h / 2), new Phaser.Math.Vector2(-w / 2 - sk, h / 2)],
        true,
        true,
      );
      const yT = h / 2 - stripeH;
      plate.fillStyle(o.color, 1);
      plate.fillPoints(
        [new Phaser.Math.Vector2(xl(yT), yT), new Phaser.Math.Vector2(xr(yT), yT), new Phaser.Math.Vector2(xr(h / 2), h / 2), new Phaser.Math.Vector2(xl(h / 2), h / 2)],
        true,
      );
    }
    pin(plate, c, Wn, Hn, tx, cy, 1);

    pin(t, c, Wn, Hn, tx, cy, fit);
  });
}

// ------------------------------------------------------------------ cleanup

/**
 * Ends the K.O. and round-result sequences of `scene` (or of every scene when omitted) now and destroys their objects.
 * Safe to call when nothing is playing, twice, or after the scene has shut down.
 */
export function destroyKoSequence(scene?: Phaser.Scene): void {
  for (const run of [...runs]) {
    if (!scene || run.scene === scene) finish(run);
  }
}
