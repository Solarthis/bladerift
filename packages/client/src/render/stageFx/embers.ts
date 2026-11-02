/**
 * Embers (the burning castle keep, the arena "embers"): the back wall's broken windows and the lanterns on it glow and
 * shimmer, flame tongues lick up out of the windows and the lanterns' sills, a smoke bank rolls along the top of the wall out
 * of the gap in the stonework, and in the air behind the fighters embers rise off the fire, ash drifts down and now and then a
 * burst of sparks breaks off a window or a lantern.
 * Everything is procedural: small pixel textures made once, pooled sprites whose state lives in typed arrays, a fixed-seed
 * LCG for every random choice, and no allocation per frame.
 */
import Phaser from 'phaser';
import type { BuildStageFx, StageCtx, StageFx } from './types';

/**
 * The wall picture's features, in picture units: `u` across (0 at the left), `v` down (0 at the top); `w` and `h` are
 * the window's size as shares of the picture, `k` its glow.
 */
const WINDOWS = [
  { u: 0.12, v: 0.32, w: 0.056, h: 0.34, k: 0.9 }, // the broken window at the left edge
  { u: 0.69, v: 0.42, w: 0.13, h: 0.32, k: 1 }, // the arch window, the biggest fire
  { u: 0.595, v: 0.17, w: 0.05, h: 0.1, k: 0.8 }, // the gap in the top of the wall, where the smoke comes out
  { u: 0.855, v: 0.3, w: 0.05, h: 0.11, k: 0.7 }, // the hole on the right
];
/** The two lanterns on the wall (their flames). */
const LAMPS = [
  { u: 0.474, v: 0.33 },
  { u: 0.874, v: 0.39 },
];
/** Fire along the top of the wall, above the battlements (u across). */
const TOP_FIRE = [0.2, 0.55, 0.85];
/** The wall picture is laid in copies COPY_MIN..COPY_MAX (as render/arena.ts lays them). */
const COPY_MIN = -5;
const COPY_MAX = 5;
/** Sprite budgets at full quality; 'low' uses a third. */
const EMBER_N = 96;
const ASH_N = 80;
const SPARK_N = 48;
const SMOKE_N = 20;
/** Spawns per second at full quality. */
const EMBER_RATE = 20;
const ASH_RATE = 5;
const SMOKE_RATE = 1.2;
const EMBER_TINTS = [0xff7a2a, 0xffb050, 0xff5a1a, 0xffd890];
/** Bayer 4x4 threshold matrix: an ordered dither, so the soft glows and the smoke step like pixel art. */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

/** Fixed-seed LCG: a float in [0, 1). The module never calls Math.random, so an arena looks the same each time. */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** A string hash (FNV-1a) for the seed. */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Smooth 0..1 step (clamped), for soft edges. */
const smoothstep = (e: number): number => (e <= 0 ? 0 : e >= 1 ? 1 : e * e * (3 - 2 * e));

/** Ordered dither: quantises `v` (0..1) to four steps, choosing the step by the 4x4 threshold at pixel (x, y). */
function dither(v: number, x: number, y: number): number {
  const q = Math.min(0.999, Math.max(0, v)) * 4;
  const f = Math.floor(q);
  return (f + (q - f > (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16 ? 1 : 0)) / 4;
}

/** Paints a white pixel texture once (alpha from `alpha(x, y)`); the colour comes from a tint at use. */
function paint(scene: Phaser.Scene, key: string, w: number, h: number, alpha: (x: number, y: number) => number): void {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, w, h);
  if (!tex) return;
  const c = tex.getContext();
  const img = c.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      img.data[o] = 255;
      img.data[o + 1] = 255;
      img.data[o + 2] = 255;
      img.data[o + 3] = Math.round(255 * Math.min(1, Math.max(0, alpha(x, y))));
    }
  }
  c.putImageData(img, 0, 0);
  tex.refresh();
}

/** The textures this stage uses (shared keys, prefixed so they do not clash with other stages). */
function makeTextures(scene: Phaser.Scene): void {
  // a flame tongue: pointed at the top, round at the foot (its base sits on the sill, so it grows up out of the window)
  paint(scene, 'embers-fx-tongue', 10, 24, (x, y) => {
    const v = (y + 0.5) / 24;
    const hw = v < 0.6 ? 0.5 * Math.pow(v / 0.6, 0.6) : 0.5 * Math.sqrt(Math.max(0, 1 - ((v - 0.6) / 0.4) ** 2));
    if (hw <= 0) return 0;
    const d = Math.abs((x + 0.5) / 10 - 0.5) / hw;
    return smoothstep(1 - d) * (0.5 + 0.5 * (1 - d)) * (0.6 + 0.4 * v);
  });
  // a soft glow, stepped into bands by the dither: a window's fire, a lantern's halo
  paint(scene, 'embers-fx-glow', 32, 32, (x, y) => {
    const d = Math.hypot(x - 15.5, y - 15.5) / 16;
    return dither(Math.max(0, 1 - d) ** 1.3, x, y);
  });
  // a plus of pixels: an ember
  paint(scene, 'embers-fx-px', 3, 3, (x, y) => (x === 1 && y === 1 ? 1 : x === 1 || y === 1 ? 0.55 : 0));
  // a streak, bright at the head (right), fading behind: a spark
  paint(scene, 'embers-fx-spark', 6, 2, (x) => Math.pow((x + 1) / 6, 1.6));
  // a three-pixel flake: ash
  paint(scene, 'embers-fx-ash', 3, 3, (x, y) => {
    if (x === 1 && y === 1) return 1;
    if (x === 0 && y === 2) return 0;
    if (x === 2 && y === 0) return 0.35;
    return 0.6;
  });
  // a dithered cloud of a few blobs: smoke (tinted dark at use)
  const tr = lcg(0x5eed);
  const blobs: number[][] = [];
  for (let b = 0; b < 6; b++) blobs.push([6 + tr() * 28, 5 + tr() * 14, 6 + tr() * 6]);
  paint(scene, 'embers-fx-smoke', 40, 24, (x, y) => {
    let v = 0;
    for (const [cx, cy, r] of blobs) v = Math.max(v, 1 - Math.hypot(x - cx, y - cy) / r);
    return dither(v * 0.9, x, y);
  });
}

/** A flame tongue fixed to the wall: its base point (world), its size (world units), its flicker phase and its brightness. */
interface Tongue {
  img: Phaser.GameObjects.Image;
  x: number;
  y: number;
  w: number;
  h: number;
  ph: number;
  a: number;
}

/**
 * A pool of sprites. Each slot's state lives in typed arrays: `take()` hands out a free slot, `step()` moves, fades and
 * retires the live ones. Nothing is allocated while it runs.
 */
class Pool {
  readonly img: Phaser.GameObjects.Image[] = [];
  /** Slot in use. */
  readonly live: Uint8Array;
  /** Base position (the sway is added on top of it when drawn), velocity, age, life. */
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly vx: Float32Array;
  readonly vy: Float32Array;
  readonly age: Float32Array;
  readonly life: Float32Array;
  /** Gravity (world units/s^2, + down), drag (per second), the alpha at full, the scale, its growth over the life. */
  readonly g: Float32Array;
  readonly drag: Float32Array;
  readonly a0: Float32Array;
  readonly sx: Float32Array;
  readonly sy: Float32Array;
  readonly grow: Float32Array;
  /** Sideways sway: amplitude (world units), frequency (rad/s), phase. */
  readonly sw: Float32Array;
  readonly swf: Float32Array;
  readonly swp: Float32Array;
  /** Turn the sprite to face its velocity (sparks). */
  readonly aim: Uint8Array;
  private cur = 0;

  constructor(
    scene: Phaser.Scene,
    readonly n: number,
    key: string,
    depth: number,
    sfx: number,
    sfy: number,
    additive: boolean,
  ) {
    for (let i = 0; i < n; i++) {
      const im = scene.add.image(0, 0, key).setDepth(depth).setScrollFactor(sfx, sfy).setVisible(false);
      if (additive) im.setBlendMode(Phaser.BlendModes.ADD);
      this.img.push(im);
    }
    this.live = new Uint8Array(n);
    this.aim = new Uint8Array(n);
    this.x = new Float32Array(n);
    this.y = new Float32Array(n);
    this.vx = new Float32Array(n);
    this.vy = new Float32Array(n);
    this.age = new Float32Array(n);
    this.life = new Float32Array(n);
    this.g = new Float32Array(n);
    this.drag = new Float32Array(n);
    this.a0 = new Float32Array(n);
    this.sx = new Float32Array(n);
    this.sy = new Float32Array(n);
    this.grow = new Float32Array(n);
    this.sw = new Float32Array(n);
    this.swf = new Float32Array(n);
    this.swp = new Float32Array(n);
  }

  /** A free slot, shown and reset to age 0 (the caller sets the rest), or -1 when every slot is busy. */
  take(): number {
    for (let j = 0; j < this.n; j++) {
      const i = (this.cur + j) % this.n;
      if (!this.live[i]) {
        this.cur = (i + 1) % this.n;
        this.live[i] = 1;
        this.age[i] = 0;
        this.img[i].setVisible(true);
        return i;
      }
    }
    return -1;
  }

  /** Moves, fades and retires every live sprite by `dt` seconds. */
  step(dt: number): void {
    for (let i = 0; i < this.n; i++) {
      if (!this.live[i]) continue;
      const im = this.img[i];
      const age = this.age[i] + dt;
      const life = this.life[i];
      if (age >= life) {
        this.live[i] = 0;
        im.setVisible(false);
        continue;
      }
      this.age[i] = age;
      const d = Math.exp(-this.drag[i] * dt);
      this.vx[i] *= d;
      this.vy[i] = this.vy[i] * d + this.g[i] * dt;
      this.x[i] += this.vx[i] * dt;
      this.y[i] += this.vy[i] * dt;
      const sway = this.sw[i] * Math.sin(age * this.swf[i] + this.swp[i]);
      const u = age / life;
      const fade = Math.min(1, age * 5) * Math.min(1, (life - age) * 2);
      const s = 1 + this.grow[i] * u;
      im.setPosition(this.x[i] + sway, this.y[i]);
      im.setAlpha(this.a0[i] * fade);
      im.setScale(this.sx[i] * s, this.sy[i] * s);
      if (this.aim[i]) im.setRotation(Math.atan2(this.vy[i], this.vx[i]));
    }
  }

  destroy(): void {
    for (const im of this.img) im.destroy();
    this.img.length = 0;
  }
}

/** Shared textures are created once; a fixed seed keeps every choice the same from run to run. */
export const build: BuildStageFx = (ctx: StageCtx): StageFx => {
  const { scene, W, FAR, tw, wallTop } = ctx;
  const H = ctx.wallBase + 2 - wallTop; // the picture's height (world units)
  const q = ctx.quality === 'low' ? 1 / 3 : 1;
  const R = lcg(hash(ctx.theme) ^ 0x6e2b9);
  makeTextures(scene);

  /** A point on the wall picture (copy k, u across, v down) in world units; odd copies are mirrored, as arena.ts does. */
  const wx = (k: number, u: number): number => W / 2 + k * tw + ((k & 1 ? 1 - u : u) - 0.5) * tw;
  const wy = (v: number): number => wallTop + v * H;

  /** The view this frame: the world rectangle the camera shows (air layer), and the shift that puts a wall point at the same screen spot on the air layer. */
  const view = { x0: 0, x1: 0, y0: 0, y1: 0, shift: 0 };

  // ---- wall-fixed glows: each window's fire, each lantern's halo, the fire along the top (all copies)
  const per = WINDOWS.length + LAMPS.length + TOP_FIRE.length;
  const G = (COPY_MAX - COPY_MIN + 1) * per;
  const glowIm: Phaser.GameObjects.Image[] = [];
  const gx0 = new Float32Array(G);
  const gy0 = new Float32Array(G);
  const gsx = new Float32Array(G);
  const gsy = new Float32Array(G);
  const ga = new Float32Array(G);
  const gp = new Float32Array(G);
  let gi = 0;
  for (let k = COPY_MIN; k <= COPY_MAX; k++) {
    const specs: { u: number; v: number; wu: number; hu: number; a: number; c: number }[] = [];
    for (const w of WINDOWS) specs.push({ u: w.u, v: w.v, wu: w.w * tw * 2, hu: w.h * H * 1.3, a: 0.3 * w.k, c: 0xff6a24 });
    for (const l of LAMPS) specs.push({ u: l.u, v: l.v, wu: 16, hu: 16, a: 0.42, c: 0xffb050 });
    for (const u of TOP_FIRE) specs.push({ u, v: 0.03, wu: 0.34 * tw, hu: 26, a: 0.18, c: 0xff5a1e });
    for (const s of specs) {
      const im = scene.add
        .image(wx(k, s.u), wy(s.v), 'embers-fx-glow')
        .setDepth(-19.75)
        .setScrollFactor(FAR, 1)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setTint(s.c);
      glowIm.push(im);
      gx0[gi] = im.x;
      gy0[gi] = im.y;
      gsx[gi] = s.wu / 32;
      gsy[gi] = s.hu / 32;
      ga[gi] = s.a;
      gp[gi] = R() * 6.2832;
      gi++;
    }
  }

  // ---- the fire's light on the floor at the wall's foot, under each window and lantern (it flickers with the fire)
  const floorFire: { img: Phaser.GameObjects.Image; a: number; ph: number }[] = [];
  for (let k = COPY_MIN; k <= COPY_MAX; k++) {
    for (const w of WINDOWS) {
      const img = scene.add
        .image(wx(k, w.u), ctx.wallBase + 12, 'embers-fx-glow')
        .setDepth(-18.7)
        .setScrollFactor(FAR, 1)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setTint(0xff6a24)
        .setScale((w.w * tw * 2.4) / 32, 0.45);
      glowIm.push(img);
      floorFire.push({ img, a: 0.26 * w.k, ph: R() * 6.2832 });
    }
    for (const l of LAMPS) {
      const img = scene.add
        .image(wx(k, l.u), ctx.wallBase + 12, 'embers-fx-glow')
        .setDepth(-18.7)
        .setScrollFactor(FAR, 1)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setTint(0xffb050)
        .setScale(0.9, 0.35);
      glowIm.push(img);
      floorFire.push({ img, a: 0.3, ph: R() * 6.2832 });
    }
  }

  // ---- flame tongues: licking up out of each window's sill and each lantern, flaring on their own rhythm (wall-fixed)
  const tongues: Tongue[] = [];
  const tongueAt = (k: number, u: number, v: number, w: number, h: number, a: number): void => {
    const img = scene.add
      .image(wx(k, u), wy(v), 'embers-fx-tongue')
      .setOrigin(0.5, 1)
      .setDepth(-19.73)
      .setScrollFactor(FAR, 1)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(R() < 0.5 ? 0xff7a2a : 0xffb050);
    glowIm.push(img);
    tongues.push({ img, x: img.x, y: img.y, w: w / 10, h: h / 24, ph: R() * 6.2832, a });
  };
  for (let k = COPY_MIN; k <= COPY_MAX; k++) {
    for (const w of WINDOWS)
      for (let j = 0; j < (q < 1 ? 2 : 3); j++) tongueAt(k, w.u + (R() - 0.5) * w.w * 0.8, w.v + w.h / 2, 7 + R() * 4, H * w.h * (0.8 + 0.6 * R()), 0.32 * w.k);
    for (const l of LAMPS) tongueAt(k, l.u, l.v + 0.02, 4.5, 11 + R() * 4, 0.7);
  }

  // ---- wall-fixed smoke: rolls along the top of the wall out of the gap, and drifts over the rest of it
  const smoke = new Pool(scene, Math.round(SMOKE_N * q), 'embers-fx-smoke', -19.65, FAR, 1, false);
  // ---- air layer (behind the fighters, scroll 1): embers, ash, sparks
  const embers = new Pool(scene, Math.round(EMBER_N * q), 'embers-fx-px', 7.3, 1, 1, true);
  const ash = new Pool(scene, Math.round(ASH_N * q), 'embers-fx-ash', 7.3, 1, 1, false);
  const sparks = new Pool(scene, Math.round(SPARK_N * q), 'embers-fx-spark', 7.3, 1, 1, true);

  let t = 0;
  let emberAcc = 0;
  let ashAcc = 0;
  let smokeAcc = 0;
  let burstIn = 1 + R() * 3;
  let dead = false;

  const spawnSmoke = (): void => {
    const i = smoke.take();
    if (i < 0) return;
    const gap = R() < 0.6;
    const k = gap ? (R() < 0.5 ? 0 : 1) : Math.floor(R() * 9) - 4;
    smoke.x[i] = gap ? wx(k, 0.6 + (R() - 0.5) * 0.04) : wx(k, R());
    smoke.y[i] = gap ? wy(0.14 + R() * 0.04) : wy(0.02 + R() * 0.1);
    smoke.vx[i] = 6 + R() * 8; // rolling to the right along the top
    smoke.vy[i] = -(1 + R() * 2.5);
    smoke.g[i] = 0;
    smoke.drag[i] = 0.05;
    smoke.life[i] = 8 + R() * 5;
    smoke.a0[i] = 0.2 + R() * 0.14;
    const s = 2.2 + R() * 1.8;
    smoke.sx[i] = s;
    smoke.sy[i] = s * (0.8 + R() * 0.3);
    smoke.grow[i] = 0.6 + R() * 0.6;
    smoke.sw[i] = 2 + R() * 3;
    smoke.swf[i] = 0.3 + R() * 0.5;
    smoke.swp[i] = R() * 6.2832;
    smoke.aim[i] = 0;
    smoke.img[i].setTint(R() < 0.5 ? 0x3a322e : 0x2a2420);
  };

  const spawnEmber = (): void => {
    const i = embers.take();
    if (i < 0) return;
    if (R() < 0.25) {
      // from a window's mouth on the wall, carried up into the air
      const w = WINDOWS[Math.floor(R() * WINDOWS.length)];
      const k = Math.floor(R() * 9) - 4;
      embers.x[i] = wx(k, w.u + (R() - 0.5) * w.w) + view.shift;
      embers.y[i] = wy(w.v + w.h / 2);
      embers.vy[i] = -(10 + R() * 24);
      embers.life[i] = 2.5 + R() * 1.5;
    } else {
      // from below the fighters' line, rising past them
      embers.x[i] = view.x0 + R() * (view.x1 - view.x0);
      embers.y[i] = view.y1 + R() * 30;
      embers.vy[i] = -(26 + R() * 44);
      embers.life[i] = 3.5 + R() * 2.5;
    }
    embers.vx[i] = (R() - 0.5) * 16;
    embers.g[i] = -3; // buoyant: it slows as it cools
    embers.drag[i] = 0.5;
    embers.a0[i] = 0.35 + R() * 0.45;
    const s = 0.8 + R() * 0.6;
    embers.sx[i] = s;
    embers.sy[i] = s;
    embers.grow[i] = -0.5;
    embers.sw[i] = 3 + R() * 5;
    embers.swf[i] = 1.5 + R() * 2.5;
    embers.swp[i] = R() * 6.2832;
    embers.aim[i] = 0;
    embers.img[i].setTint(EMBER_TINTS[Math.floor(R() * EMBER_TINTS.length)]);
  };

  const spawnAsh = (): void => {
    const i = ash.take();
    if (i < 0) return;
    ash.x[i] = view.x0 + R() * (view.x1 - view.x0);
    ash.y[i] = view.y0 - 10 - R() * 30;
    ash.vx[i] = (R() - 0.5) * 4;
    ash.vy[i] = 14 + R() * 16; // falls
    ash.g[i] = 0;
    ash.drag[i] = 0.02;
    ash.life[i] = Math.min(14, (view.y1 + 40 - ash.y[i]) / ash.vy[i]);
    ash.a0[i] = 0.35 + R() * 0.4;
    const s = 0.8 + R() * 0.6;
    ash.sx[i] = s;
    ash.sy[i] = s;
    ash.grow[i] = 0;
    ash.sw[i] = 6 + R() * 10;
    ash.swf[i] = 0.8 + R() * 1.2;
    ash.swp[i] = R() * 6.2832;
    ash.aim[i] = 0;
    ash.img[i].setTint(R() < 0.5 ? 0x9a9088 : 0xb8aca0);
  };

  /** A burst of sparks from a lantern's flame or from a window's sill, flung up and falling back. */
  const burst = (): void => {
    const n = Math.max(2, Math.round(9 * q));
    let x: number;
    let y: number;
    const k = Math.floor(R() * 9) - 4;
    if (R() < 0.5) {
      const l = LAMPS[Math.floor(R() * LAMPS.length)];
      x = wx(k, l.u);
      y = wy(l.v);
    } else {
      const w = WINDOWS[Math.floor(R() * WINDOWS.length)];
      x = wx(k, w.u + (R() - 0.5) * w.w);
      y = wy(w.v + w.h / 2);
    }
    x += view.shift;
    for (let j = 0; j < n; j++) {
      const i = sparks.take();
      if (i < 0) break;
      const a = -Math.PI * (0.12 + 0.76 * R());
      const sp = 90 + R() * 150;
      sparks.x[i] = x;
      sparks.y[i] = y;
      sparks.vx[i] = Math.cos(a) * sp;
      sparks.vy[i] = Math.sin(a) * sp;
      sparks.g[i] = 420;
      sparks.drag[i] = 1.6;
      sparks.life[i] = 0.4 + R() * 0.5;
      sparks.a0[i] = 0.4 + R() * 0.3;
      sparks.sx[i] = 1 + R() * 1.1;
      sparks.sy[i] = 0.8;
      sparks.grow[i] = -0.5;
      sparks.sw[i] = 0;
      sparks.swf[i] = 0;
      sparks.swp[i] = 0;
      sparks.aim[i] = 1;
      sparks.img[i].setTint(R() < 0.5 ? 0xffd27a : 0xffa450);
    }
  };

  return {
    update(dt0: number, cam: Phaser.Cameras.Scene2D.Camera): void {
      if (dead) return;
      const dt = Math.min(dt0, 0.05);
      t += dt;

      // where the air layer is, this frame: the visible world rectangle (with a margin), and the wall's parallax shift
      view.shift = (1 - FAR) * cam.scrollX;
      const v = cam.worldView;
      if (v && v.width > 0) {
        view.x0 = v.x - 40;
        view.x1 = v.right + 40;
        view.y0 = v.y - 20;
        view.y1 = v.bottom + 20;
      } else {
        view.x0 = -40;
        view.x1 = W + 40;
        view.y0 = ctx.floor - 300;
        view.y1 = ctx.floor + 200;
      }

      // glows: the fire flickers, breathes, and the heat shimmers sideways
      for (let i = 0; i < G; i++) {
        const p = gp[i];
        const flick = 0.72 + 0.2 * Math.sin(t * 1.9 + p) + 0.12 * Math.sin(t * 4.7 + p * 2.3) + 0.08 * Math.sin(t * 11.3 + p * 0.7);
        const br = 1 + 0.06 * Math.sin(t * 1.1 + p * 1.3);
        const im = glowIm[i];
        im.setPosition(gx0[i] + 0.7 * Math.sin(t * 7.1 + p * 1.9), gy0[i]);
        im.setAlpha(ga[i] * flick);
        im.setScale(gsx[i] * br, gsy[i] * br);
      }

      // the light on the floor: swells and sinks with the fire above it
      for (const f of floorFire) {
        const s = Math.sin(t * 2.3 + f.ph) * 0.6 + Math.sin(t * 6.7 + f.ph * 1.3) * 0.4;
        f.img.setAlpha(f.a * (0.7 + 0.3 * s));
      }

      // flame tongues: each rises out of its sill and sways, flaring and sinking
      for (const z of tongues) {
        const s1 = Math.sin(t * 7.1 + z.ph) * 0.6 + Math.sin(t * 15.7 + z.ph * 1.7) * 0.4;
        const s2 = Math.sin(t * 5.3 + z.ph * 0.6);
        z.img.setPosition(z.x + 0.8 * s2, z.y).setScale(z.w * (1 + 0.15 * s2), z.h * (1 + 0.3 * s1)).setAlpha(z.a * (0.7 + 0.3 * s1));
      }

      // spawns
      smokeAcc += SMOKE_RATE * q * dt;
      while (smokeAcc >= 1) {
        smokeAcc -= 1;
        spawnSmoke();
      }
      emberAcc += EMBER_RATE * q * dt;
      while (emberAcc >= 1) {
        emberAcc -= 1;
        spawnEmber();
      }
      ashAcc += ASH_RATE * q * dt;
      while (ashAcc >= 1) {
        ashAcc -= 1;
        spawnAsh();
      }
      burstIn -= dt;
      if (burstIn <= 0) {
        burst();
        burstIn = 3.5 + R() * 4.5;
      }

      smoke.step(dt);
      embers.step(dt);
      ash.step(dt);
      sparks.step(dt);
    },
    destroy(): void {
      if (dead) return;
      dead = true;
      for (const im of glowIm) im.destroy();
      glowIm.length = 0;
      smoke.destroy();
      embers.destroy();
      ash.destroy();
      sparks.destroy();
    },
  };
};
