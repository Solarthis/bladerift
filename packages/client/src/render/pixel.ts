/**
 * Bridge from PixelFX (vendor/pixelfx, MIT, code-drawn pixel art) to Phaser: fighters are posed on PixelFX's 3D
 * skeleton and drawn into small canvases (re-drawn only when the pose changes - poses step at 12 fps), recoloured per
 * player; effects run live and are composited into canvas textures. One pixel art pixel = PIX world units.
 */
import Phaser from 'phaser';
// @ts-expect-error - plain JS vendor module
import { posed, createFx, createFrame, clearFrame, composite, hex } from '../vendor/pixelfx/core/index.js';
// @ts-expect-error - plain JS vendor module
import { WEAPONS as RIG_WEAPONS } from '../vendor/pixelfx/core/rig.js';
// @ts-expect-error - plain JS vendor module
import { DUMMY_PAL } from '../vendor/pixelfx/core/actor.js';

/** World units per art pixel (the 38 px figure stands ~52 units tall, the gameplay body height). */
export const PIX = 1.38;

export type Pose = Record<string, unknown>;

// ------------------------------------------------------------------ a shield for the rig (PixelFX has none)

const pack = (c: string) => (hex(c) as number) >>> 0;
const SH = { rim: pack('#c9d2de'), rimD: pack('#7c8698'), face: pack('#1f6f78'), faceL: pack('#2f9aa2'), faceD: pack('#144a52'), boss: pack('#ffd84a'), bossD: pack('#b8862a') };
if (!RIG_WEAPONS.shield) {
  RIG_WEAPONS.shield = {
    across: true,
    draw(T: (i: number, k: number, c: number, lift?: number) => void) {
      // a kite shield seen from the front: i = out from the fist (its thickness), k = up/down its height
      for (let k = -13; k <= 11; k += 0.4) {
        const half = k < -9 ? 5.5 - (-9 - k) * 0.9 : k > 4 ? 5.5 * (1 - (k - 4) / 8) : 5.5;
        for (let i = -1; i <= 2.2; i += 0.4) {
          for (let w = -half; w <= half + 0.01; w += 0.4) {
            const edge = Math.abs(w) > half - 1 || k < -12.2 || k > 10.2;
            const boss = Math.hypot(w, k + 2) < 1.8;
            const c = edge ? (w < 0 ? SH.rim : SH.rimD) : boss ? (w < 0 ? SH.boss : SH.bossD) : w < -half * 0.4 ? SH.faceL : w > half * 0.5 ? SH.faceD : SH.face;
            T(i + 2, k, c, w);
          }
        }
      }
    },
  };
}

// ------------------------------------------------------------------ fighter colours

/** The dummy's tones, remapped to a player's colour (steel and wood stay as they are). */
export function fighterLut(base: number, accent: number): Map<number, number> {
  const lut = new Map<number, number>();
  const toAbgr = (rgb: number) => (0xff000000 | ((rgb & 255) << 16) | (rgb & 0xff00) | ((rgb >> 16) & 255)) >>> 0;
  const mix = (a: number, b: number, t: number) => {
    const r = ((a >> 16) & 255) * (1 - t) + ((b >> 16) & 255) * t;
    const g = ((a >> 8) & 255) * (1 - t) + ((b >> 8) & 255) * t;
    const bl = (a & 255) * (1 - t) + (b & 255) * t;
    return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(bl);
  };
  const W = 0xffffff;
  const K = 0x0b0a14;
  const P = DUMMY_PAL as Record<string, string>;
  const set = (key: string, rgb: number) => lut.set(pack(P[key]), toAbgr(rgb));
  set('A', mix(base, W, 0.45));
  set('B', mix(base, W, 0.12));
  set('C', mix(base, K, 0.22));
  set('D', mix(base, K, 0.48));
  // the joints / under-suit: a dark, slightly warm leather
  set('E', 0x6a5a52);
  set('F', 0x4a3e3a);
  set('G', 0x302826);
  set('J', mix(base, K, 0.7));
  set('m', accent);
  return lut;
}

// ------------------------------------------------------------------ fighter sprite

const FW = 240;
const FH = 180;
const FOX = 120;
const FOY = 140;

/** One fighter's canvas texture, re-drawn when its pose changes. */
export class FighterCanvas {
  readonly key: string;
  readonly tex: Phaser.Textures.CanvasTexture;
  private img: ImageData;
  private buf: Uint32Array;
  private lastKey = '';
  constructor(scene: Phaser.Scene, key: string, public lut: Map<number, number>) {
    this.key = key;
    if (scene.textures.exists(key)) scene.textures.remove(key);
    this.tex = scene.textures.createCanvas(key, FW, FH)!;
    this.tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
    this.img = this.tex.context.createImageData(FW, FH);
    this.buf = new Uint32Array(this.img.data.buffer);
  }
  static readonly originX = FOX / FW;
  static readonly originY = FOY / FH;

  /** Draw a pose (skipped when identical to the last one). `flash` 0..1 whitens the figure (hit flash). */
  draw(pose: Pose, flash = 0, tint = 0) {
    const key = JSON.stringify(pose) + '|' + Math.round(flash * 4) + '|' + tint;
    if (key === this.lastKey) return;
    this.lastKey = key;
    const r = posed(pose) as { n: number; xs: Int16Array; ys: Int16Array; color: Uint32Array; ink: Uint8Array };
    const b = this.buf;
    b.fill(0);
    const lut = this.lut;
    for (let i = 0; i < r.n; i++) {
      const x = r.xs[i] + FOX;
      const y = r.ys[i] + FOY;
      if (x < 0 || y < 0 || x >= FW || y >= FH) continue;
      let c = r.color[i];
      c = lut.get(c) ?? c;
      if (flash > 0 && !r.ink[i]) c = mixAbgr(c, 0xffffffff, flash);
      if (tint && !r.ink[i]) c = mixAbgr(c, tint, 0.45);
      b[y * FW + x] = c;
    }
    this.tex.context.putImageData(this.img, 0, 0);
    this.tex.refresh();
  }
}

function mixAbgr(a: number, b: number, t: number) {
  const r = (a & 255) * (1 - t) + (b & 255) * t;
  const g = ((a >>> 8) & 255) * (1 - t) + ((b >>> 8) & 255) * t;
  const bl = ((a >>> 16) & 255) * (1 - t) + ((b >>> 16) & 255) * t;
  return (0xff000000 | (Math.round(bl) << 16) | (Math.round(g) << 8) | Math.round(r)) >>> 0;
}

// ------------------------------------------------------------------ effects

export interface FxModule {
  meta: { size: [number, number]; origin: [number, number]; duration: number; loop: boolean; fps?: number; options?: Record<string, unknown> };
  act?: { hits?: { t: number; stop?: number; shake?: number }[] };
}

interface FxInstance {
  update(dt: number): void;
  draw(frame: unknown, layer?: 'back' | 'front'): void;
  stop(): void;
  done(): boolean;
  t: number;
}

let fxSerial = 0;

/**
 * A live PixelFX effect in the world: two canvas textures (behind and in front of the fighters), composited at the
 * effect's own frame rate. Placed at a world point, mirrored for facing.
 */
export class FxSprite {
  readonly back: Phaser.GameObjects.Image;
  readonly front: Phaser.GameObjects.Image;
  private fx: FxInstance;
  private frameB: ReturnType<typeof createFrame>;
  private frameF: ReturnType<typeof createFrame>;
  private texB: Phaser.Textures.CanvasTexture;
  private texF: Phaser.Textures.CanvasTexture;
  private imgB: ImageData;
  private imgF: ImageData;
  private acc = 0;
  private readonly step: number;
  /** Seconds of effect time per real second. */
  rate = 1;
  /** Frozen (hit-stop) while > 0. */
  freeze = 0;
  dead = false;
  private age = 0;

  constructor(
    private scene: Phaser.Scene,
    mod: FxModule,
    x: number,
    y: number,
    flip: boolean,
    opts: Record<string, unknown> = {},
    depthBack = 5,
    depthFront = 15,
    private maxAge = 6,
  ) {
    const [w, h] = mod.meta.size;
    const [ox, oy] = mod.meta.origin;
    this.fx = createFx(mod, { ...opts, x: ox, y: oy, flip: false }) as FxInstance;
    this.frameB = createFrame(w, h);
    this.frameF = createFrame(w, h);
    const id = ++fxSerial;
    this.texB = scene.textures.createCanvas(`fxb${id}`, w, h)!;
    this.texF = scene.textures.createCanvas(`fxf${id}`, w, h)!;
    for (const t of [this.texB, this.texF]) t.setFilter(Phaser.Textures.FilterMode.NEAREST);
    this.imgB = this.texB.context.createImageData(w, h);
    this.imgF = this.texF.context.createImageData(w, h);
    const mk = (tex: Phaser.Textures.CanvasTexture, depth: number) =>
      scene.add.image(x, y, tex.key).setOrigin(ox / w, oy / h).setScale(PIX).setFlipX(flip).setDepth(depth);
    this.back = mk(this.texB, depthBack);
    this.front = mk(this.texF, depthFront);
    this.step = 1 / (mod.meta.fps ?? 30);
    this.render();
  }

  setPosition(x: number, y: number) {
    this.back.setPosition(x, y);
    this.front.setPosition(x, y);
  }

  update(dt: number) {
    if (this.dead) return;
    this.age += dt;
    if (this.freeze > 0) {
      this.freeze -= dt;
      return;
    }
    this.acc += dt * this.rate;
    if (this.acc < this.step) return;
    const adv = Math.min(this.acc, 0.2);
    this.acc = 0;
    this.fx.update(adv);
    if (this.fx.done() || this.age > this.maxAge) return this.destroy();
    this.render();
  }

  stop() {
    this.fx.stop();
  }

  private render() {
    clearFrame(this.frameB);
    clearFrame(this.frameF);
    this.fx.draw(this.frameB, 'back');
    this.fx.draw(this.frameF, 'front');
    composite(this.frameB, this.imgB.data, null);
    composite(this.frameF, this.imgF.data, null);
    this.texB.context.putImageData(this.imgB, 0, 0);
    this.texF.context.putImageData(this.imgF, 0, 0);
    this.texB.refresh();
    this.texF.refresh();
  }

  destroy() {
    if (this.dead) return;
    this.dead = true;
    this.back.destroy();
    this.front.destroy();
    this.scene.textures.remove(this.texB);
    this.scene.textures.remove(this.texF);
  }
}
