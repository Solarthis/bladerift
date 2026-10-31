import Phaser from 'phaser';
import {
  Act, ARENAS, ArtId, FIGHTER, GameEvent, heroOf, MOVE_PLUNGE, moveOf, NetProjectile, NetStrike, NetTrap, TICK_RATE, WEAPONS, WeaponId,
} from '@bladerift/shared';
import type { NetGame, ViewFighter } from '../net/NetGame';
import type { Session } from '../net/Session';
import type { InputSource } from '../input/Controls';
import { bakeFrames, FighterCanvas, fighterLut, FxModule, FxSprite, paintLive, PIX, Pose, prewarmEffects } from '../render/pixel';
import { poseFor } from '../render/poses';
import { warmFighter } from '../render/warm';
import { heroSpritesReady, loadHeroSprites, spritesPending, SpriteFighterView } from '../render/spriteFighter';
import { FX, PAL, swingFx } from '../render/fxmap';
import { sfx } from '../audio/Sfx';
import { prefs } from '../ui/prefs';
import { buildArena } from '../render/arena';
import { colorOf, accentOf } from '../ui/colors';

/** A fighter controlled on this device: its connection and its input. */
export interface LocalPlayer {
  session: Session;
  input: InputSource;
}

export interface GameSceneData {
  players: LocalPlayer[];
  /** The session the HUD and spectating view follow. */
  primary: Session;
}

/** A small pixel-art canvas texture painted per pixel from a shape function (0 = transparent). */
class PixelTex {
  readonly tex: Phaser.Textures.CanvasTexture;
  private readonly img: ImageData;
  private readonly buf: Uint32Array;
  constructor(private readonly scene: Phaser.Scene, readonly key: string, readonly w: number, readonly h: number) {
    if (scene.textures.exists(key)) scene.textures.remove(key);
    this.tex = scene.textures.createCanvas(key, w, h)!;
    this.tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
    this.img = this.tex.context.createImageData(w, h);
    this.buf = new Uint32Array(this.img.data.buffer);
  }
  paint(px: (x: number, y: number) => number) {
    const { w, h, buf } = this;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) buf[y * w + x] = px(x + 0.5, y + 0.5);
    this.tex.context.putImageData(this.img, 0, 0);
    this.tex.refresh();
  }
  destroy() {
    if (this.scene.textures.exists(this.key)) this.scene.textures.remove(this.key);
  }
}

const abgr = (r: number, g: number, b: number, a = 255) => (((a & 255) << 24) | ((b & 255) << 16) | ((g & 255) << 8) | (r & 255)) >>> 0;
const rgbOf = (hex: string, a = 255) => {
  const n = parseInt(hex.slice(1), 16);
  return abgr(n >> 16, (n >> 8) & 255, n & 255, a);
};

type Cap = [number, number, number, number, number]; // capsule: ax, ay, bx, by, radius
type Ell = [number, number, number, number]; // ellipse: cx, cy, rx, ry

function segD(x: number, y: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(x - ax - dx * t, y - ay - dy * t);
}

function inside(x: number, y: number, caps: Cap[], els: Ell[], grow: number): boolean {
  for (const [ax, ay, bx, by, r] of caps) if (segD(x, y, ax, ay, bx, by) <= r + grow) return true;
  for (const [cx, cy, rx, ry] of els) if (Math.hypot((x - cx) / (rx + grow), (y - cy) / (ry + grow)) <= 1) return true;
  return false;
}

/** 0 outside the silhouette, 1 on its rim band, 2 inside it. */
function silhouette(x: number, y: number, caps: Cap[], els: Ell[], rim = 1.1): number {
  if (!inside(x, y, caps, els, 0)) return 0;
  return inside(x, y, caps, els, -rim) ? 2 : 1;
}

/** A burning warhorse at full gallop, facing right: black body, fire along the tail, the mane and the rim. */
function paintHorse(tex: PixelTex, t: number) {
  const p = t * 15;
  const leg = (hx: number, hy: number, ph: number): Cap[] => {
    const a = 0.75 * Math.sin(ph);
    const kx = hx + Math.sin(a) * 6.5;
    const ky = hy + Math.cos(a) * 6.5;
    const b = a - 0.55 * Math.max(0, Math.cos(ph));
    return [[hx, hy, kx, ky, 1.5], [kx, ky, kx + Math.sin(b) * 6, ky + Math.cos(b) * 6, 1.1]];
  };
  const caps: Cap[] = [
    ...leg(27, 19, p), ...leg(29, 18, p + 2.2), ...leg(13, 19, p + 3.4), ...leg(11, 18, p + 1.1),
    [29, 13, 34, 6, 3.6], [34, 6, 38, 6, 2.6], [38, 7, 44, 9, 1.9], [34, 2, 33, -0.5, 0.9],
  ];
  const els: Ell[] = [[19, 14, 12, 6.2], [38.5, 6.2, 4.4, 2.8]];
  const flick = (x: number) => Math.sin(t * 40 + x * 2.3) * 0.5 + 0.5;
  tex.paint((x, y) => {
    if (x < 10) {
      const cy = 14 + Math.sin(x * 0.7 - t * 22) * 1.8;
      const w = 0.9 + (10 - x) * 0.42 * (0.75 + 0.25 * flick(x));
      const d = Math.abs(y - cy);
      if (d < w) {
        const h = 1 - d / w;
        return h > 0.7 ? rgbOf('#ffe27a') : h > 0.35 ? rgbOf('#ff8a2a') : rgbOf('#c8301a');
      }
    }
    if (x > 27 && x < 36) {
      const top = 10.5 - (x - 27) * 0.85 - flick(x) * 2.2;
      if (y < top && y > top - 2.8) return rgbOf(flick(x + 1) > 0.5 ? '#ffae35' : '#ff6a20');
    }
    const s = silhouette(x, y, caps, els);
    if (s === 0) return 0;
    if (s === 1) return flick(x) > 0.3 ? rgbOf('#ff7a2a') : rgbOf('#9a2a12');
    if (x > 39 && x < 40.5 && Math.abs(y - 4.8) < 0.8) return rgbOf('#ffe27a');
    return rgbOf('#120a0c');
  });
}

/** A giant shadow hound, facing right. pose 0 leaps with legs out, 1 is tucked in the air, 2 lands and splays. */
function paintHound(tex: PixelTex, pose: number, t: number) {
  const ang = pose === 0 ? [1.0, 0.85, -1.0, -0.8] : pose === 1 ? [0.35, 0.2, -0.4, -0.2] : [0.55, 0.75, -0.55, -0.7];
  const hips: [number, number][] = [[36, 25], [40, 24], [15, 25], [11, 24]];
  const caps: Cap[] = [];
  hips.forEach(([hx, hy], i) => {
    const a = ang[i];
    const kx = hx + Math.sin(a) * 9;
    const ky = hy + Math.cos(a) * 9;
    const b = pose === 1 ? a - 1.1 : a * 0.5 - 0.1;
    caps.push([hx, hy, kx, ky, 2.2], [kx, ky, kx + Math.sin(b) * 8, ky + Math.cos(b) * 8, 1.7]);
  });
  caps.push([14, 21, 35, 20, 6.4], [42, 14, 42, 14, 4.8], [44, 16, 51, 18, 2.5], [39, 9, 38, 2, 1.2], [42, 9, 44, 3, 1.2], [14, 20, 5, 15, 1.8], [5, 15, 1, 9, 1.2]);
  const els: Ell[] = [[35, 19, 6.8, 6.4]];
  tex.paint((x, y) => {
    if (Math.hypot(x - 44.5, y - 13.5) < 0.9 || Math.hypot(x - 47.5, y - 13.5) < 0.9) return rgbOf('#f0c8ff');
    const s = silhouette(x, y, caps, els, 1.2);
    if (s === 0) return inside(x, y, caps, els, 2.2) && Math.sin(x * 0.9 + t * 9 + y * 0.6) > 0.6 ? rgbOf('#5a2aa8', 70) : 0;
    return s === 1 ? rgbOf('#7a3ad0') : rgbOf('#07050d');
  });
}

/** A spectral claw reaching right; s is how far the fingers splay (0 closed, 1 open). */
function paintHand(tex: PixelTex, s: number) {
  const tips: [number, number][] = [[22, 2 - s * 2], [23.5, 6 - s], [22.5, 10.5], [19.5, 14.5 + s * 1.5]];
  const caps: Cap[] = [[3, 10, 0, 10.5, 2.4], [8, 14, 3, 18, 1.4]];
  tips.forEach(([tx, ty], i) => {
    const bx = 13;
    const by = 6 + i * 2.7;
    const mx = (bx + tx) / 2;
    const my = (by + ty) / 2 + 1.2;
    caps.push([bx, by, mx, my, 1.5], [mx, my, tx, ty, 1.1]);
  });
  const els: Ell[] = [[10.5, 10, 6.2, 5.2]];
  tex.paint((x, y) => {
    for (const [tx, ty] of tips) if (Math.hypot(x - tx, y - ty) < 1.6) return rgbOf('#f2e8ff');
    const sl = silhouette(x, y, caps, els, 1);
    if (sl === 0) return 0;
    return sl === 1 ? rgbOf('#9a7aff') : rgbOf('#1c1236', 235);
  });
}

/** Rectangle corners, rotated by ang, centred on (cx, cy). */
function rectPts(cx: number, cy: number, w: number, h: number, ang: number) {
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  return [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]].map(([x, y]) => new Phaser.Math.Vector2(cx + x * c - y * s, cy + x * s + y * c));
}

/** An Art's camera-flash colour. */
const ART_FLASH: Record<number, number> = {
  [ArtId.RadiantCleave]: 0xffe08a,
  [ArtId.HailOfArrows]: 0xb8ff90,
  [ArtId.PiercingFang]: 0x9af0ff,
  [ArtId.ThunderCall]: 0xd8b8ff,
  [ArtId.FlashStep]: 0x9af0ff,
  [ArtId.BloodFrenzy]: 0xff4a4a,
  [ArtId.Bulwark]: 0xffe08a,
  [ArtId.VaultOfAges]: 0xffe08a,
  [ArtId.ChainsOfGenesis]: 0xffd060,
  [ArtId.RewrittenFate]: 0xfff0c0,
  [ArtId.PhantomHand]: 0xa080ff,
  [ArtId.GrimFog]: 0xa8b4d0,
  [ArtId.Stampede]: 0xff9a4a,
  [ArtId.NightHunt]: 0xb080ff,
};

/** Relic weapons of Vault of Ages: the BootScene's art, plus the ones this scene loads. */
const WEAPON_SPRITES = ['w-sword', 'w-scythe', 'w-lance', 'w-hammer', 'w-dagger'];

const STEP_MS = 1000 / TICK_RATE;
/** Live effect sprites above which optional ambient effects are skipped (phones). */
const MAX_FX = 70;
/** Live square particles. */
const MAX_PARTS = 150;

interface FighterView {
  id: number;
  /** The hero the view was built with (a changed hero rebuilds it). */
  hero: number;
  canvas: FighterCanvas;
  /** The image on screen: the sprite fighter's once its atlas is loaded, else the rig canvas's. */
  img: Phaser.GameObjects.Image;
  rigImg: Phaser.GameObjects.Image;
  /** The hero drawn from its generated animation atlas (render/spriteFighter.ts), when it has one. */
  sprite: SpriteFighterView | null;
  /** Scene clock when the view was made (a loading atlas hides the rig for a moment). */
  createdAt?: number;
  tag: Phaser.GameObjects.Text;
  ghosts: { img: Phaser.GameObjects.Image; tex: Phaser.Textures.CanvasTexture; life: number }[];
  ghostI: number;
  ghostAt: number;
  /** Pose time held during a hit-stop. */
  frozenT: number;
  freezeUntil: number;
  flashUntil: number;
  lastSeq: number;
  runPhase: number;
  lastX: number;
  wasGround: boolean;
  /** Clock time of the last touchdown (the landing squash). */
  landAt: number;
  /** Clock time the fighter last left the ground (a sprite's jump take-off frame). */
  airAt: number;
  status: Partial<Record<StatusKind, FxSprite>>;
  stunnedUntil: number;
  koT: number;
  color: number;
  shown: ViewFighter | null;
  /** Vector drawings behind the fighter (tendrils) and in front (chains). */
  gfxB: Phaser.GameObjects.Graphics;
  gfx: Phaser.GameObjects.Graphics;
  /** Abyss Fang's trail: where the fighter was, recently. */
  hist: { x: number; y: number; t: number }[];
  /** Night Hunt's shadow hound, while the Art plays. */
  hound: { tex: PixelTex; img: Phaser.GameObjects.Image; step: number } | null;
  veilOn: boolean;
}

type StatusKind = 'burning' | 'slowed' | 'stunned' | 'rage' | 'divineShield' | 'spellCharge' | 'portal' | 'blessing';

interface Scheduled {
  at: number;
  fn: () => void;
}

/** A vector drawing that lives for `life` seconds (rings, chains, pages, fog). */
interface Vec {
  age: number;
  life: number;
  back: boolean;
  draw: (g: Phaser.GameObjects.Graphics, p: number) => void;
}

/** A square particle: ember, spark, mote. `g` is gravity in units/s^2. */
interface Part {
  x: number;
  y: number;
  vx: number;
  vy: number;
  g: number;
  life: number;
  max: number;
  c: number;
  s: number;
}

interface ProjView {
  kind: string;
  x: number;
  y: number;
  face: number;
  age: number;
  /** The fighter nearest the projectile when it appeared (its owner, in a duel). */
  spawnNear: number;
  img?: Phaser.GameObjects.Image;
  fx?: FxSprite;
  gfx?: Phaser.GameObjects.Graphics;
  tex?: PixelTex;
  paintedAt?: number;
  /** The Phantom Hand's reach toward an airborne fighter (world units). */
  lift?: number;
}

/** Scale both layers of a PixelFX effect. */
function scaleFx(f: FxSprite, s: number) {
  f.back.setScale(PIX * s);
  f.front.setScale(PIX * s);
}

export class GameScene extends Phaser.Scene {
  private players: LocalPlayer[] = [];
  private primary!: Session;
  private acc = 0;
  private views = new Map<number, FighterView>();
  private fx: FxSprite[] = [];
  private projViews = new Map<number, ProjView>();
  private trapViews = new Map<number, Phaser.GameObjects.Image>();
  private strikeViews = new Map<number, Phaser.GameObjects.Graphics>();
  private scheduled: Scheduled[] = [];
  private vecs: Vec[] = [];
  private parts: Part[] = [];
  private vecB!: Phaser.GameObjects.Graphics;
  private vecF!: Phaser.GameObjects.Graphics;
  private partG!: Phaser.GameObjects.Graphics;
  private lastList: ViewFighter[] = [];
  private shakeT = 0;
  private shakeAmp = 0;
  /** Zoom punch of the last Art (decays in a fraction of a second). */
  private punch = 0;
  private clock = 0;
  private arenaW = 1280;
  private floor = 600;
  /** The arena's world-space Graphics and their bounds, hidden while off-camera (see cullArena). */
  private arenaCull: { g: Phaser.GameObjects.Graphics; x0: number; y0: number; x1: number; y1: number }[] = [];
  private camX = 640;
  private camY = 400;
  private camZoom = 1;
  /** Banner / round callbacks for the HUD (set by App). */
  onEvent: ((e: GameEvent) => void) | null = null;

  constructor() {
    super('game');
  }

  init(data: GameSceneData) {
    this.players = data.players;
    this.primary = data.primary;
    this.acc = 0;
    this.views.clear();
    this.fx = [];
    this.projViews.clear();
    this.trapViews.clear();
    this.strikeViews.clear();
    this.scheduled = [];
    this.vecs = [];
    this.parts = [];
    this.lastList = [];
    this.punch = 0;
  }

  preload() {
    // the relic weapons of Vault of Ages (BootScene loads the rest)
    for (const k of WEAPON_SPRITES) if (!this.textures.exists(k)) this.load.image(k, `assets/art/${k}.png`);
  }

  private get game0(): NetGame | null {
    return this.primary.game;
  }

  create() {
    const g = this.game0;
    const arena = g?.arena ?? ARENAS[0];
    this.arenaW = arena.w;
    this.floor = arena.floor;
    this.cameras.main.setBackgroundColor('#0d0a14');
    const before = new Set<Phaser.GameObjects.GameObject>(this.children.list);
    buildArena(this, this.game0!.arena);
    this.arenaCull = arenaCullables(this, before);
    // the hits and swings of every weapon, baked in the background from the start of the match
    prewarmEffects(this, [
      [FX.hitSpark, {}], [FX.critHit, {}], [FX.bluntHit, {}], [FX.parry, {}], [FX.shieldBlock, {}], [FX.heavyLanding, {}], [FX.heal, {}], [FX.poof, {}],
      [FX.swordSlash, {}], [FX.doubleSlash, {}], [FX.spinSlash, {}], [FX.scytheReap, {}], [FX.thrust, {}], [FX.spearSweep, {}], [FX.claw, { palette: PAL.cyan }],
      [FX.daggerFlurry, {}], [FX.heavyCleave, {}],
    ]);
    this.camX = arena.w / 2;
    this.camY = arena.floor - 200;
    this.vecB = this.add.graphics().setDepth(9);
    this.vecF = this.add.graphics().setDepth(16);
    this.partG = this.add.graphics().setDepth(17).setBlendMode(Phaser.BlendModes.ADD);
    this.events.once('shutdown', () => this.teardown());
  }

  // ------------------------------------------------------------------ loop

  override update(_time: number, deltaMs: number) {
    const dt = Math.min(0.1, deltaMs / 1000);
    this.clock += dt;
    // fixed-step input
    this.acc += Math.min(deltaMs, 250);
    let n = 0;
    while (this.acc >= STEP_MS && n < 5) {
      this.acc -= STEP_MS;
      n++;
      for (const p of this.players) {
        const g = p.session.game;
        if (!g) continue;
        const i = p.input.read();
        p.session.sendInput(g.tick(i.moveX, i.moveY, i.buttons));
      }
    }
    if (this.acc >= STEP_MS) {
      const skip = Math.floor(this.acc / STEP_MS);
      for (const p of this.players) p.session.game?.skipTicks(skip);
      this.acc -= skip * STEP_MS;
    }
    for (const p of this.players) {
      p.session.flushInputs();
      if (p.session.game) p.session.game.renderAlpha = this.acc / STEP_MS;
    }
    const g = this.game0;
    if (!g) return;
    const now = performance.now();

    // fighters: the primary game's view, with each local player's own predicted fighter
    const list = g.fighters(now);
    const mine = new Map<number, ViewFighter>();
    for (const p of this.players) {
      const pg = p.session.game;
      if (!pg || pg === g) continue;
      for (const f of pg.fighters(now)) if (f.self) mine.set(f.id, f);
    }
    for (let i = 0; i < list.length; i++) {
      const m = mine.get(list[i].id);
      if (m) list[i] = m;
    }
    this.lastList = list;
    const seen = new Set<number>();
    for (const v of list) {
      seen.add(v.id);
      this.drawFighter(v, now, dt, list);
    }
    for (const [id, fv] of this.views) if (!seen.has(id)) this.removeView(id, fv);

    // events (the primary's; same-device sessions get identical ones)
    for (const e of g.drainEvents(now)) this.onGameEvent(e, list);
    // other local sessions: drain so their queues stay short
    for (const p of this.players) if (p.session.game && p.session.game !== g) p.session.game.drainEvents(now);

    this.drawProjectiles(g.projectiles(now), list, dt);
    this.drawTraps(g.traps());
    this.drawStrikes(g.latest?.strikes ?? []);
    // scheduled visuals (effects lined up with strikes)
    for (let i = this.scheduled.length - 1; i >= 0; i--) {
      if (now >= this.scheduled[i].at) {
        const s = this.scheduled[i];
        this.scheduled.splice(i, 1);
        s.fn();
      }
    }
    for (let i = this.fx.length - 1; i >= 0; i--) {
      this.fx[i].update(dt);
      if (this.fx[i].dead) this.fx.splice(i, 1);
    }
    paintLive(6);
    this.drawVecs(dt);
    this.drawParts(dt);
    this.updateCamera(list, dt);
    this.cullArena();
    bakeFrames(3);
  }

  /**
   * The arena's masonry is drawn with thousands of stroked lines, and Phaser re-tessellates every Graphics command on
   * every frame, so off-screen stone (the side walls, mostly) is hidden while the camera cannot see it.
   */
  private cullArena() {
    const cam = this.cameras.main;
    const hw = cam.width / cam.zoom / 2 + 64;
    const hh = cam.height / cam.zoom / 2 + 64;
    const cx = cam.midPoint.x;
    const cy = cam.midPoint.y;
    for (const c of this.arenaCull) {
      const on = c.x1 >= cx - hw && c.x0 <= cx + hw && c.y1 >= cy - hh && c.y0 <= cy + hh;
      if (c.g.visible !== on) c.g.setVisible(on);
    }
  }

  // ------------------------------------------------------------------ helpers

  /** Run `fn` once, `ms` from now (on the same clock as the scheduled visuals). */
  private after(ms: number, fn: () => void) {
    this.scheduled.push({ at: performance.now() + ms, fn });
  }

  /** Room for another optional effect (the live sprite count is capped on phones). */
  private roomFor(): boolean {
    return this.fx.length < MAX_FX;
  }

  private addVec(life: number, draw: Vec['draw'], back = false) {
    this.vecs.push({ age: 0, life, back, draw });
  }

  /** An expanding ring on the floor (a perspective ellipse). */
  private ring(x: number, y: number, r0: number, r1: number, life: number, color: number, width = 3, back = false) {
    this.addVec(life, (g, p) => {
      const rr = r0 + (r1 - r0) * Phaser.Math.Easing.Cubic.Out(p);
      g.lineStyle(width * (1 - p * 0.6) + 0.5, color, 0.9 * (1 - p));
      g.strokeEllipse(x, y, rr * 2, rr * 0.6);
    }, back);
  }

  private spark(x: number, y: number, vx: number, vy: number, life: number, c: number, s = 2, g = 0) {
    if (this.parts.length < MAX_PARTS) this.parts.push({ x, y, vx, vy, g, life, max: life, c, s });
  }

  private drawVecs(dt: number) {
    this.vecB.clear();
    this.vecF.clear();
    for (let i = this.vecs.length - 1; i >= 0; i--) {
      const v = this.vecs[i];
      v.age += dt;
      if (v.age >= v.life) {
        this.vecs.splice(i, 1);
        continue;
      }
      v.draw(v.back ? this.vecB : this.vecF, v.age / v.life);
    }
  }

  private drawParts(dt: number) {
    const g = this.partG;
    g.clear();
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.parts.splice(i, 1);
        continue;
      }
      p.vy += p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      g.fillStyle(p.c, Math.min(1, (p.life / p.max) * 1.6));
      g.fillRect(p.x - p.s / 2, p.y - p.s / 2, p.s, p.s);
    }
  }

  /** A full-screen colour wash that fades in a fraction of a second (the Art's flash). */
  private flash(color: number, alpha: number, ms: number) {
    const r = this.add.rectangle(0, 0, this.scale.width, this.scale.height, color, alpha).setOrigin(0).setScrollFactor(0).setDepth(300);
    this.tweens.add({ targets: r, alpha: 0, duration: ms, onComplete: () => r.destroy() });
  }

  /** Chain links from (x0, y0) to (x1, y1): rings that alternate their turn, dark rim under gold. */
  private chainLine(g: Phaser.GameObjects.Graphics, x0: number, y0: number, x1: number, y1: number, n: number, color: number, a: number) {
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const cx = x0 + (x1 - x0) * t;
      const cy = y0 + (y1 - y0) * t;
      const flat = i % 2 === 1;
      const w = flat ? 8 : 4.5;
      const h = flat ? 4.5 : 8;
      g.lineStyle(3, 0x1a1006, a * 0.8);
      g.strokeEllipse(cx, cy, w + 2, h + 2);
      g.lineStyle(1.8, color, a);
      g.strokeEllipse(cx, cy, w, h);
    }
  }

  /** A looping PixelFX effect that follows the fighter while `on` (one per kind). */
  private loopFx(fv: FighterView, kind: StatusKind, on: boolean, mod: FxModule, x: number, y: number, flip: boolean, opts: Record<string, unknown>, scale = 1) {
    const cur = fv.status[kind];
    if (on && (!cur || cur.dead)) {
      if (!this.roomFor()) return;
      const s = new FxSprite(this, mod, x, y, flip, opts, 8, 12, 30);
      scaleFx(s, scale);
      fv.status[kind] = s;
      this.fx.push(s);
    } else if (!on && cur && !cur.dead) {
      cur.stop();
    }
    const s = fv.status[kind];
    if (s && !s.dead) {
      s.setPosition(x, y);
      s.back.setFlipX(flip);
      s.front.setFlipX(flip);
    }
  }

  // ------------------------------------------------------------------ fighters

  /** Clock time the current round intro started (null outside an intro). */
  private introAt: number | null = null;

  private viewFor(v: ViewFighter): FighterView {
    let fv = this.views.get(v.id);
    // a fighter that changed hero (a rematch) gets a fresh view
    if (fv && fv.hero === v.hero) return fv;
    if (fv) this.removeView(v.id, fv);
    const r = this.primary.roster.get(v.id) ?? [...this.players].map((p) => p.session.roster.get(v.id)).find(Boolean);
    const color = colorOf(r?.color ?? v.seat * 5);
    const lut = fighterLut(color, accentOf(r?.look?.accent ?? 0));
    const canvas = new FighterCanvas(this, `fighter${v.id}`, lut, v.hero);
    // the hero's sprite atlas loads on demand; the rig draws the fighter until it is there (or if the hero has none)
    void loadHeroSprites(this, v.hero).then((meta) => {
      // no sprites for this hero: render the rig's whole move set into its frame cache in the background instead
      if (!meta) warmFighter(v.hero, v.weapons, v.skill);
    });
    const img = this.add.image(v.x, v.y, canvas.key).setOrigin(canvas.originX, canvas.originY).setScale(canvas.worldScale).setDepth(10);
    const tag = this.add
      .text(v.x, v.y - 70, r?.name ?? '', { fontFamily: 'Lilita One, sans-serif', fontSize: '12px', color: '#' + color.toString(16).padStart(6, '0'), stroke: '#0b0814', strokeThickness: 3 })
      .setOrigin(0.5, 1)
      .setDepth(30);
    fv = {
      id: v.id, hero: v.hero, canvas, img, rigImg: img, sprite: null, tag, ghosts: [], ghostI: 0, ghostAt: 0, frozenT: 0, freezeUntil: 0, flashUntil: 0, lastSeq: -1, runPhase: 0,
      lastX: v.x, wasGround: true, landAt: -10, airAt: -10, status: {}, stunnedUntil: 0, koT: 0, color, shown: null,
      gfxB: this.add.graphics().setDepth(9), gfx: this.add.graphics().setDepth(11), hist: [], hound: null, veilOn: false,
    };
    for (let i = 0; i < 4; i++) {
      const key = `ghost${v.id}_${i}`;
      if (this.textures.exists(key)) this.textures.remove(key);
      const tex = this.textures.createCanvas(key, canvas.tex.width, canvas.tex.height)!;
      tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
      const gimg = this.add.image(0, 0, key).setOrigin(canvas.originX, canvas.originY).setScale(canvas.worldScale).setDepth(9).setVisible(false).setTint(color);
      gimg.tintMode = Phaser.TintModes.FILL;
      fv.ghosts.push({ img: gimg, tex, life: 0 });
    }
    this.views.set(v.id, fv);
    return fv;
  }

  private removeView(id: number, fv: FighterView) {
    fv.rigImg.destroy();
    fv.sprite?.destroy();
    fv.tag.destroy();
    // the after-image and the figure canvases are textures: drop them with the view (no leak across matches)
    for (const gh of fv.ghosts) {
      gh.img.destroy();
      if (this.textures.exists(gh.tex.key)) this.textures.remove(gh.tex);
    }
    for (const s of Object.values(fv.status)) s?.destroy();
    fv.gfx.destroy();
    fv.gfxB.destroy();
    if (fv.hound) {
      fv.hound.img.destroy();
      fv.hound.tex.destroy();
    }
    if (this.textures.exists(fv.canvas.key)) this.textures.remove(fv.canvas.key);
    this.views.delete(id);
  }

  private drawFighter(v: ViewFighter, now: number, dt: number, list: ViewFighter[]) {
    const fv = this.viewFor(v);
    fv.shown = v;
    // swing effects for moves this device predicted (yours) start now; others come with their 'swing' events
    if (v.self && v.act === Act.Attack && v.moveSeq !== fv.lastSeq) this.startSwing(v.id, v.weapons[v.slot], v.move, v.actTf);
    if (v.self) fv.lastSeq = v.moveSeq;
    // hit-stop: the pose holds while frozen
    let t = v.actTf;
    if (now < fv.freezeUntil) t = fv.frozenT;
    else fv.frozenT = v.actTf;
    const speed = Math.abs(v.vx);
    if (v.ground && speed > 25) fv.runPhase += dt * (6 + speed / 28);
    if (v.ground && !fv.wasGround) fv.landAt = this.clock;
    if (!v.ground && fv.wasGround) fv.airAt = this.clock;
    const pose = poseFor({ ...v, actTf: t }, { time: this.clock, runPhase: fv.runPhase, land: this.clock - fv.landAt });
    const flash = now < fv.flashUntil ? 0.8 : v.invuln && v.act !== Act.Roll && Math.floor(this.clock * 12) % 2 ? 0.35 : 0;
    const tint = v.slowed ? 0xffffd2a8 : 0;
    // the sprite takes over from the rig as soon as the hero's atlas is in
    if (!fv.sprite) {
      const meta = heroSpritesReady(v.hero);
      if (meta) {
        fv.sprite = new SpriteFighterView(this, v.hero, meta, 10);
        // a mirror match: the second seat's fighter wears the alternate (cool) colours
        if (v.seat === 1 && list.some((o) => o.id !== v.id && o.hero === v.hero)) fv.sprite.altTint = 0xc8d4ff;
        fv.rigImg.setVisible(false);
        fv.img = fv.sprite.img;
      }
    }
    if (!fv.sprite) {
      const waiting = spritesPending(v.hero) && this.clock - (fv.createdAt ??= this.clock) < 2.5;
      fv.rigImg.setVisible(!waiting);
    }
    if (fv.sprite) {
      // the round intro: each fighter plays its entrance while the round is being announced
      const g = this.game0;
      if (g?.phase === 'intro') this.introAt ??= this.clock;
      else this.introAt = null;
      fv.sprite.draw({ ...v, actTf: t }, v.x, v.y, {
        time: this.clock, runPhase: fv.runPhase, land: this.clock - fv.landAt, air: this.clock - fv.airAt,
        introT: this.introAt === null ? undefined : this.clock - this.introAt,
      }, flash, tint);
    } else {
      fv.canvas.draw(stripXY(pose), flash, tint);
      fv.img.setPosition(v.x, v.y).setFlipX(v.face < 0);
    }
    // KO: the rig topples over backwards (sprite fighters have their own defeat animation)
    if (v.act === Act.KO && !fv.sprite) {
      fv.koT = Math.min(1, fv.koT + dt * 3);
      fv.img.setAngle(-v.face * 85 * Phaser.Math.Easing.Cubic.Out(fv.koT));
    } else {
      fv.koT = 0;
      fv.img.setAngle(0);
    }
    fv.tag.setPosition(v.x, v.y - (fv.sprite ? fv.sprite.meta.native * fv.sprite.worldScale + 6 : 62));
    // after-images
    if (pose.ghost && now - fv.ghostAt > 45) {
      fv.ghostAt = now;
      const gh = fv.ghosts[fv.ghostI++ % fv.ghosts.length];
      if (fv.sprite) {
        // a sprite's after-image is the same atlas frame, tinted flat
        const sp = fv.sprite.img;
        gh.img.setTexture(fv.sprite.textureKey, fv.sprite.current).setOrigin(sp.originX, sp.originY).setScale(fv.sprite.worldScale);
      } else {
        gh.tex.context.clearRect(0, 0, gh.tex.width, gh.tex.height);
        gh.tex.context.drawImage(fv.canvas.tex.getSourceImage() as HTMLCanvasElement, 0, 0);
        gh.tex.refresh();
      }
      gh.img.setPosition(v.x, v.y).setFlipX(v.face < 0).setVisible(true).setAlpha(0.5);
      gh.life = 0.22;
    }
    for (const gh of fv.ghosts) {
      if (gh.life <= 0) continue;
      gh.life -= dt;
      gh.img.setAlpha(Math.max(0, gh.life / 0.22) * 0.5);
      if (gh.life <= 0) gh.img.setVisible(false);
    }
    // plunge landing
    if (v.ground && !fv.wasGround && v.act === Act.Attack && v.move === MOVE_PLUNGE) {
      this.addFx(FX.heavyLanding, v.x, v.y, v.face < 0, 1.4);
      this.shake(0.5);
      sfx.play('impact', { x: v.x, y: v.y });
    }
    fv.wasGround = v.ground;
    // status loops follow the body
    this.statusLoop(fv, 'burning', v.burning, v);
    this.statusLoop(fv, 'slowed', v.slowed || v.rooted, v);
    this.statusLoop(fv, 'stunned', now < fv.stunnedUntil, v);
    // Rift Art auras, by the hero's Art (not the class: heroes share classes)
    const art = v.act === Act.Art ? heroOf(v.hero).art : -1;
    this.statusLoop(fv, 'rage', v.frenzy || art === ArtId.BloodFrenzy, v);
    this.statusLoop(fv, 'divineShield', art === ArtId.Bulwark, v);
    this.statusLoop(fv, 'spellCharge', (art === ArtId.RadiantCleave || art === ArtId.ThunderCall) && v.actTf < 20, v, art === ArtId.ThunderCall ? PAL.violet : PAL.gold);
    // Vault of Ages: the rift portal opens behind the caster while the relics fly
    this.loopFx(fv, 'portal', art === ArtId.VaultOfAges && v.actTf < 52, FX.portal, v.x - v.face * 34, v.y, v.face < 0, { palette: PAL.gold }, 0.6);
    // Rewritten Fate: a gold aura for the seven seconds of the buff
    this.loopFx(fv, 'blessing', v.buff, FX.blessing, v.x, v.y, false, { palette: PAL.gold }, 0.8);
    // Night Hunt: the shadow hound leaps with the caster
    this.houndFor(fv, v, art === ArtId.NightHunt && v.actTf < 44);
    // Abyss Fang: cyan tendrils trail the lunge
    if (art === ArtId.PiercingFang && v.actTf < 46) fv.hist.push({ x: v.x, y: v.y, t: now });
    while (fv.hist.length && now - fv.hist[0].t > 350) fv.hist.shift();
    this.drawTendrils(fv, v, now);
    // Chains of Genesis: the rooted fighter is bound in chains
    this.drawBinds(fv, v);
    // Grim Fog: unseen by the opponent. The veiled fighter is a faint shimmer on their screen; you still see yourself.
    let alpha = art === ArtId.FlashStep && v.actTf < 9 ? 0.15 : 1;
    if (v.veil) {
      alpha = v.self ? 0.45 : 0.1 + 0.04 * Math.sin(this.clock * 38 + v.id * 3);
      fv.img.setTint(0xa8bcd8);
      if (!v.self && Math.random() < 0.4 && this.parts.length < MAX_PARTS) {
        this.spark(v.x + (Math.random() * 2 - 1) * 24, v.y - 16 - Math.random() * 30, (Math.random() - 0.5) * 12, -4 - Math.random() * 6, 0.8, 0xb8c4dc, 2, 0);
      }
      fv.veilOn = true;
    } else {
      // (a sprite sets its own tint each frame: hit flash, slow)
      if (!fv.sprite) fv.img.clearTint();
      if (fv.veilOn) {
        // the veil lifts: the fog clears off the figure
        fv.veilOn = false;
        if (this.roomFor()) this.addFx(FX.poof, v.x, v.y, false, 1.2, { palette: PAL.smoke }, 14, 16, 0.9);
      }
    }
    if (fv.sprite && flash > 0 && flash <= 0.5) alpha *= 0.5;
    fv.img.setAlpha(alpha);
    fv.tag.setAlpha(v.veil && !v.self ? 0.2 : 1);
    fv.lastX = v.x;
  }

  private statusLoop(fv: FighterView, kind: StatusKind, on: boolean, v: ViewFighter, palette?: string[]) {
    const cur = fv.status[kind];
    if (on && (!cur || cur.dead)) {
      fv.status[kind] = new FxSprite(this, FX[kind], v.x, v.y, v.face < 0, palette ? { palette } : {}, 9, 12, 30);
    } else if (!on && cur && !cur.dead) {
      cur.stop();
    }
    const s = fv.status[kind];
    if (s && !s.dead) {
      s.setPosition(v.x, v.y);
      s.update(0);
      if (!this.fx.includes(s)) this.fx.push(s);
    }
  }

  /** Abyss Fang: four wavy cyan strands trailing the fighter's recent path. */
  private drawTendrils(fv: FighterView, v: ViewFighter, now: number) {
    const g = fv.gfxB;
    g.clear();
    const h = fv.hist;
    if (h.length < 2) return;
    const pts = [...h, { x: v.x, y: v.y, t: now }];
    for (let s = 0; s < 4; s++) {
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i];
        const b = pts[i + 1];
        const age = Math.min(1, (now - a.t) / 350);
        const amp = 6 + 12 * age;
        const off = (q: { x: number; y: number }, k: number) => ({ x: q.x - v.face * 4 * k, y: q.y - 18 + (s - 1.5) * 6 + Math.sin(now * 0.02 + s * 1.7 + k * 0.9) * amp });
        const p0 = off(a, i);
        const p1 = off(b, i + 1);
        g.lineStyle(2.2 - s * 0.3, 0x7ae8f5, (1 - age) * 0.75);
        g.lineBetween(p0.x, p0.y, p1.x, p1.y);
      }
    }
  }

  /** Chains of Genesis: the bind holds the fighter in place. */
  private drawBinds(fv: FighterView, v: ViewFighter) {
    const g = fv.gfx;
    g.clear();
    if (!v.rooted) return;
    const sway = Math.sin(this.clock * 9) * 1.5;
    for (const ax of [-16, -4, 8, 15]) {
      this.chainLine(g, v.x + ax, v.y + 1, v.x + ax * 0.4 + sway, v.y - 26, 6, 0xffd84a, 0.95);
    }
  }

  /** Night Hunt: the shadow hound, leaping behind the caster and landing in a slam. */
  private houndFor(fv: FighterView, v: ViewFighter, on: boolean) {
    if (!on) {
      if (fv.hound) {
        fv.hound.img.destroy();
        fv.hound.tex.destroy();
        fv.hound = null;
      }
      return;
    }
    if (!fv.hound) {
      if (!this.roomFor()) return;
      const tex = new PixelTex(this, `hound${v.id}`, 56, 44);
      const img = this.add.image(v.x, v.y, tex.key).setScale(2.1).setDepth(8).setAlpha(0.92);
      fv.hound = { tex, img, step: -1 };
    }
    const h = fv.hound;
    const t = v.actTf;
    const pose = t < 12 ? 0 : t < 30 ? 1 : 2;
    const step = Math.floor(this.clock * 15) * 3 + pose;
    if (step !== h.step) {
      h.step = step;
      paintHound(h.tex, pose, this.clock);
    }
    h.img.setPosition(v.x - v.face * 12, v.y - 46 + (pose === 2 ? 6 : 0)).setFlipX(v.face < 0);
  }

  /** Swing effect lined up with the move's first hitting tick (`actT` ticks already elapsed). */
  private startSwing(id: number, weapon: number, move: number, actT: number) {
    const m = moveOf(weapon, move);
    if (!m) return;
    const sw = swingFx(weapon, move);
    const delay = Math.max(0, (m.startup - actT) * STEP_MS);
    sfx.play(weapon === WeaponId.Hammer || weapon === WeaponId.Scythe ? 'swing' : 'swing', { pitch: weapon === WeaponId.Daggers ? 1.4 : weapon === WeaponId.Hammer ? 0.7 : 1 });
    const fire = () => {
      const fv = this.views.get(id);
      const v = fv?.shown;
      if (!fv || !v || v.act !== Act.Attack) return;
      // (a sprite fighter's frames carry their own painted weapon trails: no procedural trail on top)
      if (sw && !fv.sprite) this.addFx(sw.mod, v.x, v.y, v.face < 0, sw.rate, sw.opts);
      // the hammer's third blow and any hammer plunge crack the ground
      if (weapon === WeaponId.Hammer && move === 2) {
        this.addFx(FX.groundSlam, v.x + v.face * 40, v.y, v.face < 0, 1.8);
        this.shake(0.9);
        sfx.play('explosion', { x: v.x, y: v.y, volume: 0.6, pitch: 0.8 });
      }
    };
    if (delay <= 0) fire();
    else this.scheduled.push({ at: performance.now() + delay, fn: fire });
  }

  private addFx(mod: FxModule, x: number, y: number, flip: boolean, rate = 1, opts: Record<string, unknown> = {}, depthBack = 5, depthFront = 15, scale = 1) {
    const f = new FxSprite(this, mod, x, y, flip, opts, depthBack, depthFront);
    f.rate = rate;
    if (scale !== 1) scaleFx(f, scale);
    this.fx.push(f);
    return f;
  }

  // ------------------------------------------------------------------ Rift Art beats

  /** The one-off visuals of each Art, at the moment it starts. */
  private artStart(art: number, v: ViewFighter, list: ViewFighter[]) {
    const x = v.x;
    const y = v.y;
    const f = v.face;
    switch (art) {
      case ArtId.RadiantCleave:
        this.ring(x + f * 30, y - 30, 6, 46, 0.3, 0xffe08a, 3);
        if (this.roomFor()) {
          const sun = this.addFx(FX.sunburst, x + f * 26, y - 30, false, 1, { palette: PAL.gold }, 16, 26, 0.45);
          this.after(500, () => sun.stop());
        }
        break;
      case ArtId.HailOfArrows: {
        // the volley's mark on the opponent's floor
        const o = list.find((q) => q.id !== v.id);
        const tx = o ? o.x : x + f * 200;
        const ty = o ? o.y : y;
        this.addVec(0.6, (g, p) => {
          const r = 46 * (1 - p) + 10;
          const a = Math.min(1, p * 5) * (1 - p * 0.5);
          g.lineStyle(2, 0xb8ff90, 0.9 * a);
          g.strokeEllipse(tx, ty - 2, r * 2, r * 0.6);
          g.lineBetween(tx - 10, ty - 2, tx + 10, ty - 2);
          g.lineBetween(tx, ty - 8, tx, ty + 4);
        });
        if (this.roomFor()) this.addFx(FX.circleCast, x, y, f < 0, 1.8, { palette: PAL.gold });
        break;
      }
      case ArtId.PiercingFang:
        if (this.roomFor()) this.addFx(FX.shadowTendrils, x, y, f < 0, 1.3, { palette: PAL.cyan }, 8, 12, 0.7);
        if (this.roomFor()) this.addFx(FX.chargeUp, x, y, f < 0, 2.4, { palette: PAL.cyan });
        break;
      case ArtId.ThunderCall:
        this.addFx(FX.circleCast, x, y, f < 0, 1.6, { palette: PAL.violet });
        this.ring(x, y, 6, 40, 0.4, 0xd8b8ff, 2);
        break;
      case ArtId.ChainsOfGenesis:
        this.ring(x, y, 4, 36, 0.4, 0xffd84a, 2);
        break;
      case ArtId.FlashStep:
        this.ring(x, y - 26, 4, 40, 0.3, 0x9af0ff, 2);
        if (this.roomFor()) this.addFx(FX.claw, x, y - 24, f > 0, 2.2, { palette: PAL.cyan }, 16, 26, 1.2);
        break;
      case ArtId.BloodFrenzy:
        this.addFx(FX.pow, x, y - 34, false, 1.2, { palette: PAL.crimson }, 31, 32);
        // the roar, as its knock-back lands
        this.after(12 * STEP_MS, () => {
          this.ring(x, y, 12, 130, 0.5, 0xff4a4a, 5);
          this.ring(x, y, 6, 90, 0.35, 0xffb0a0, 2);
          if (this.roomFor()) this.addFx(FX.fireRing, x, y, false, 1.2, { palette: PAL.crimson }, 6, 8, 0.55);
        });
        break;
      case ArtId.Bulwark:
        this.ring(x, y - 20, 20, 74, 0.45, 0xffe08a, 4);
        this.ring(x, y - 20, 10, 48, 0.3, 0xffffff, 2, true);
        break;
      case ArtId.VaultOfAges:
        this.ring(x - f * 36, y - 28, 4, 50, 0.5, 0xffe08a, 3);
        for (let i = 0; i < 14; i++) {
          this.spark(x - f * 40, y - 26, -f * (60 + Math.random() * 120), (Math.random() - 0.5) * 120, 0.6, 0xffe08a, 2.5, 80);
        }
        break;
      case ArtId.RewrittenFate:
        this.pages(v.id, 0.9);
        if (this.roomFor()) this.addFx(FX.circleCast, x, y, false, 1, { palette: PAL.gold }, 6, 8, 0.6);
        if (this.roomFor()) this.addFx(FX.heal, x, y, false, 1, {}, 9, 16, 1);
        break;
      case ArtId.PhantomHand:
        if (this.roomFor()) this.addFx(FX.poof, x + f * 24, y - 14, f < 0, 1.3, { palette: PAL.abyss }, 14, 16, 0.6);
        break;
      case ArtId.GrimFog: {
        if (this.roomFor()) this.addFx(FX.poof, x, y, false, 1, { palette: PAL.smoke }, 14, 16, 1.4);
        const puffs = Array.from({ length: 7 }, () => ({ dx: (Math.random() * 2 - 1) * 36, dy: -Math.random() * 40, r: 12 + Math.random() * 12 }));
        this.addVec(0.9, (g, p) => {
          for (const q of puffs) {
            g.fillStyle(0x9aa8c0, 0.22 * (1 - p));
            g.fillCircle(x + q.dx * (0.6 + p), y + q.dy * (0.6 + p) * 0.5, q.r * (0.6 + p));
          }
        });
        break;
      }
      case ArtId.Stampede:
        if (this.roomFor()) this.addFx(FX.poof, x, y, f < 0, 1, { palette: PAL.dust }, 9, 12, 1.1);
        this.ring(x, y, 6, 60, 0.35, 0xff9a4a, 3, true);
        break;
      case ArtId.NightHunt:
        if (this.roomFor()) this.addFx(FX.darkExplosion, x, y, false, 1.1, { palette: PAL.abyss }, 16, 26, 0.3);
        break;
    }
  }

  /** Radiant-style papers of Rewritten Fate: ink and gold pages whirling round the caster as they fade. */
  private pages(id: number, life: number) {
    const seeds = Array.from({ length: 7 }, (_, i) => ({ a0: (i / 7) * Math.PI * 2, r: 18 + (i % 3) * 8, s: 0.8 + ((i * 37) % 5) / 10 }));
    this.addVec(life, (g, p) => {
      const sh = this.views.get(id)?.shown;
      if (!sh) return;
      for (const s of seeds) {
        const a = s.a0 + p * Math.PI * 5;
        const r = s.r * (1 - p * 0.4) + 6 * Math.sin(p * 3);
        const cx = sh.x + Math.cos(a) * r;
        const cy = sh.y - 26 + Math.sin(a) * r * 0.4 - p * 30;
        const ang = a * 2;
        const w = 6 * s.s;
        const h = 8 * s.s * (0.6 + 0.4 * Math.abs(Math.cos(ang)));
        const pts = rectPts(cx, cy, w, h, ang);
        g.fillStyle(p < 0.5 ? 0xfff6dc : 0xf0c860, 0.92 * (1 - p * 0.5));
        g.fillPoints(pts, true);
        g.lineStyle(1, 0x15110c, 0.9 * (1 - p));
        g.strokePoints(pts, true);
        g.lineBetween(cx - w * 0.3, cy - 1, cx + w * 0.3, cy - 1);
      }
    });
  }

  // ------------------------------------------------------------------ events

  private onGameEvent(e: GameEvent, list: ViewFighter[]) {
    const find = (id: number) => list.find((f) => f.id === id);
    const isLocal = (id: number) => this.players.some((p) => p.session.selfId === id);
    switch (e.t) {
      case 'swing': {
        if (isLocal(e.p)) break; // predicted already
        this.startSwing(e.p, e.w, e.m, 0);
        break;
      }
      case 'hit': {
        const a = find(e.a);
        const v = find(e.v);
        const burn = e.w === 200;
        const heavy = e.w === WeaponId.Hammer || e.amt >= 140;
        if (!burn) {
          const flip = a ? a.x > e.x : false;
          this.addFx(e.crit ? FX.critHit : heavy ? FX.bluntHit : FX.hitSpark, e.x, e.y + 14, flip, 1.3, {}, 16, 26);
          // Flash Step's cuts: a cyan slash on every strike of the flurry
          if (e.w === 104) {
            this.addFx(FX.claw, e.x, e.y + 26, flip, 2.4, { palette: PAL.cyan }, 16, 26);
            const sx = e.x;
            const sy = e.y;
            this.addVec(0.16, (g, p) => {
              g.lineStyle(3 * (1 - p) + 1, 0xd0fbff, 0.9 * (1 - p));
              g.lineBetween(sx - 16, sy - 14 + p * 6, sx + 16, sy - 22 + p * 6);
            });
          }
          const stop = Math.min(0.16, 0.05 + e.amt / 1600);
          for (const id of [e.a, e.v]) {
            const fv = this.views.get(id);
            if (fv) fv.freezeUntil = performance.now() + stop * 1000;
          }
          for (const f of this.fx) if (f.rate > 1.1) f.freeze = Math.max(f.freeze, stop);
          const wdef = WEAPONS[e.w];
          this.shake(Math.max(0.15, wdef ? Math.max(...wdef.combo.map((m) => m.shake ?? 0)) * 0.7 : 0.2, e.crit ? 0.5 : 0));
          sfx.play(heavy ? 'impact' : 'hit', { x: e.x, y: e.y, pitch: e.crit ? 1.2 : 1 });
          if (isLocal(e.v)) navigator.vibrate?.(e.amt > 120 ? 40 : 18);
        }
        const fv = this.views.get(e.v);
        if (fv && !burn) fv.flashUntil = performance.now() + 90;
        if (prefs().damageNumbers && v) {
          const pal = burn ? ['#1a0a04', '#4a1a06', '#8c3a08', '#d46a10', '#ff9a2a', '#ffc46a', '#ffe8b0', '#ffffff'] : undefined;
          const mod = e.crit ? FX.critNumber : FX.damageNumber;
          this.addFx(mod, v.x + (Math.random() * 16 - 8), v.y - FIGHTER.h - 6, false, 1.1, { text: e.crit ? `${e.amt}!` : `-${e.amt}`, ...(pal ? { palette: pal } : {}) }, 31, 32);
        }
        break;
      }
      case 'block': {
        const v = find(e.v);
        const a = find(e.a);
        if (v) this.addFx(FX.shieldBlock, v.x, v.y, a ? a.x < v.x : v.face < 0, 1.4);
        sfx.play('shieldHit', { x: e.x, y: e.y });
        this.shake(0.15);
        break;
      }
      case 'parry': {
        this.addFx(FX.parry, e.x, e.y + 20, false, 1.3, {}, 16, 26);
        sfx.play('shieldBreak', { x: e.x, y: e.y });
        const fv = this.views.get(e.v);
        if (fv) fv.stunnedUntil = performance.now() + (FIGHTER.parryStun / TICK_RATE) * 1000;
        for (const id of [e.a, e.v]) {
          const f = this.views.get(id);
          if (f) f.freezeUntil = performance.now() + 140;
        }
        this.shake(0.4);
        break;
      }
      case 'shoot': {
        // kinds: 0 arrow, 1 bomb, 2 frost, 3 trap, 4 arcane bolt, 5 orb; 6+ are Rift Art projectiles (the Art's own sound covers them)
        const names = ['arrow', 'grenadeThrow', 'frost', 'trapSet', 'arcane', 'orb'] as const;
        const name = names[e.kind];
        if (name) sfx.play(name, { volume: 0.8 });
        break;
      }
      case 'boom': {
        // Night Hunt lands: a heavy slam, a shadow shockwave and dark shards
        this.addFx(FX.groundSlam, e.x, e.y, false, 1.4, {}, 16, 26, 0.8);
        this.addFx(FX.darkExplosion, e.x, e.y, false, 1.2, { palette: PAL.abyss }, 16, 26, 0.4);
        this.ring(e.x, e.y, 14, 150, 0.45, 0xb080ff, 4);
        this.ring(e.x, e.y, 6, 90, 0.3, 0xe0d0ff, 2, true);
        for (let i = 0; i < 16; i++) {
          this.spark(e.x + (Math.random() - 0.5) * 30, e.y - 2, (Math.random() - 0.5) * 260, -Math.random() * 140, 0.6, 0x5a2aa8, 3, 300);
        }
        sfx.play('slam', { x: e.x, y: e.y });
        this.shake(0.9);
        this.punch = Math.max(this.punch, 0.03);
        break;
      }
      case 'trap': {
        const img = this.add.image(e.x, e.y, 's-trap-shut').setOrigin(0.5, 1).setScale(0.16).setDepth(11);
        this.tweens.add({ targets: img, alpha: 0, delay: 900, duration: 400, onComplete: () => img.destroy() });
        sfx.play('impact', { x: e.x, y: e.y, pitch: 1.4 });
        break;
      }
      case 'roll': {
        const v = find(e.p);
        if (v) this.addFx(FX.poof, v.x - v.face * 6, v.y, v.face > 0, 2.2, {}, 8, 8);
        sfx.play('jetStart', { volume: 0.4 });
        break;
      }
      case 'heal': {
        const v = find(e.p);
        if (v) this.addFx(FX.heal, v.x, v.y, false, 1.2, {}, 9, 16);
        sfx.play('pickupHealth');
        break;
      }
      case 'blink': {
        this.addFx(FX.blinkOut, e.x0, e.y, false, 1.6);
        this.addFx(FX.blinkIn, e.x1, e.y, false, 1.6);
        sfx.play('railgun', { pitch: 1.6, volume: 0.6 });
        const x0 = e.x0;
        const x1 = e.x1;
        const y = e.y - 26;
        this.addVec(0.32, (g, p) => {
          g.lineStyle(6 * (1 - p) + 1, 0x9af0ff, 0.7 * (1 - p));
          g.lineBetween(x0, y, x1, y);
        });
        break;
      }
      case 'art': {
        const v = find(e.p);
        sfx.playArt(e.art, { volume: 0.9 });
        this.shake(0.35);
        // the beat: a colour wash and a short zoom punch, well under a third of a second
        this.flash(ART_FLASH[e.art] ?? 0xffffff, 0.2, 150);
        this.punch = Math.max(this.punch, 0.035);
        if (v) {
          this.artStart(e.art, v, list);
          // every Art freezes the moment for a beat
          const fv = this.views.get(e.p);
          if (fv) fv.freezeUntil = performance.now() + 110;
        }
        break;
      }
      case 'strike': {
        if (e.kind === 1) {
          // Chains of Genesis: gold chains and a spike burst up out of the ground
          this.addFx(FX.earthSpike, e.x, e.y, false, 1.3, { palette: PAL.gold, glow: PAL.goldGlow }, 16, 26, 1.2);
          this.ring(e.x, e.y, 6, 60, 0.35, 0xffd84a, 3);
          this.addVec(0.7, (g, p) => {
            const rise = 72 * Phaser.Math.Easing.Cubic.Out(Math.min(1, p * 2.2)) * (1 - p * 0.5);
            this.chainLine(g, e.x, e.y, e.x + 4 * Math.sin(p * 9), e.y - rise, 7, 0xffd84a, 1 - p);
          });
          sfx.play('chains', { x: e.x, y: e.y, pitch: 0.8 });
        } else {
          // Starfall (Lumi): a star comes down onto the mark
          this.addFx(FX.starFall, e.x, e.y, false, 1.25, { palette: PAL.violet }, 16, 26, 0.7);
          this.ring(e.x, e.y, 8, 70, 0.4, 0xd8b8ff, 3);
          sfx.play('starfall', { x: e.x, y: e.y, pitch: 1.6, volume: 0.8 });
        }
        this.shake(0.55);
        break;
      }
      case 'ko': {
        const v = find(e.v);
        if (v) this.addFx(FX.pow, v.x, v.y - 30, false, 1, {}, 31, 32);
        sfx.play('death');
        this.shake(0.8);
        break;
      }
      case 'fight':
        sfx.play('matchStart');
        break;
      case 'round':
        sfx.play('kill');
        break;
      case 'match':
        sfx.play('matchEnd');
        break;
    }
    this.onEvent?.(e);
  }

  // ------------------------------------------------------------------ projectiles and traps

  private nearestFighter(x: number, y: number): number {
    let best = -1;
    let bd = Infinity;
    for (const f of this.lastList) {
      const d = Math.hypot(f.x - x, f.y - y);
      if (d < bd) {
        bd = d;
        best = f.id;
      }
    }
    return best;
  }

  private spawnProj(p: NetProjectile): ProjView {
    const face = p.vx < 0 ? -1 : 1;
    const pv: ProjView = { kind: p.kind, x: p.x, y: p.y, face, age: 0, spawnNear: this.nearestFighter(p.x, p.y) };
    if (p.kind === 'arrow') {
      // Serpent Rain's falling shafts are venom green; the bow's are as before
      const rain = Math.abs(p.vy) > 300;
      pv.fx = new FxSprite(this, FX.arrow, p.x, p.y, p.vx < 0, p.heavy ? { palette: ['#3a1a70', '#7f5ad8', '#e8e2ff', '#ffffff'] } : rain ? { palette: PAL.serpent } : {}, 14, 14, 10);
    } else if (p.kind === 'frost') {
      pv.fx = new FxSprite(this, FX.iceLance, p.x, p.y, p.vx < 0, {}, 14, 14, 10);
    } else if (p.kind === 'arcane') {
      pv.fx = new FxSprite(this, FX.energyDisc, p.x, p.y, p.vx < 0, { palette: PAL.violet }, 14, 14, 10);
    } else if (p.kind === 'orb') {
      pv.fx = new FxSprite(this, FX.arcaneOrb, p.x, p.y + 30, false, {}, 14, 14, 10);
    } else if (p.kind === 'wave') {
      // Radiant Cleave: the gold disc, with a bright crescent edge drawn over it
      pv.fx = new FxSprite(this, FX.energyDisc, p.x, p.y, p.vx < 0, { palette: PAL.gold }, 14, 14, 10);
      pv.fx.front.setScale(2.6, 3.4);
      pv.fx.back.setScale(2.6, 3.4);
      pv.gfx = this.add.graphics().setDepth(15);
    } else if (p.kind === 'relic') {
      // Vault of Ages: a real weapon, point-first, out of a golden portal
      pv.img = this.add.image(p.x, p.y, WEAPON_SPRITES[p.id % WEAPON_SPRITES.length]).setScale(0.28).setTint(0xffd870).setDepth(14);
      this.ring(p.x, p.y, 4, 26, 0.3, 0xffe08a, 2.5);
    } else if (p.kind === 'hand') {
      // Phantom Hand: a spectral claw racing along the floor
      pv.tex = new PixelTex(this, `hand${p.id}`, 26, 20);
      pv.img = this.add.image(p.x, p.y, pv.tex.key).setScale(1.5).setDepth(14).setAlpha(0.92);
      if (this.roomFor()) this.addFx(FX.poof, p.x, p.y, face < 0, 1.5, { palette: PAL.abyss }, 14, 16, 0.5);
    } else if (p.kind === 'steed') {
      // Stampede: a burning warhorse, the fire streaming back behind it
      pv.tex = new PixelTex(this, `steed${p.id}`, 46, 34);
      pv.img = this.add.image(p.x, p.y, pv.tex.key).setScale(1.5).setDepth(13);
      pv.fx = new FxSprite(this, FX.flamethrower, p.x - face * 20, p.y - 6, face > 0, { palette: PAL.fire }, 12, 13, 30);
      scaleFx(pv.fx, 0.45);
    } else {
      pv.img = this.add.image(p.x, p.y, 's-bomb').setScale(0.075).setDepth(14);
      pv.fx = new FxSprite(this, FX.fireball, p.x, p.y, p.vx > 0, { radius: 2 }, 13, 13, 10);
    }
    if (pv.fx) this.fx.push(pv.fx);
    return pv;
  }

  private updateProj(pv: ProjView, p: NetProjectile, dt: number, list: ViewFighter[]) {
    void list;
    pv.x = p.x;
    pv.y = p.y;
    pv.age += dt;
    pv.face = p.vx < 0 ? -1 : 1;
    const face = pv.face;
    if (p.kind === 'arrow' || p.kind === 'frost' || p.kind === 'arcane' || p.kind === 'orb' || p.kind === 'wave') {
      pv.fx?.setPosition(p.x, p.kind === 'orb' ? p.y + 30 : p.y);
      if (pv.fx && p.kind === 'arrow') {
        const ang = Math.atan2(p.vy, Math.abs(p.vx)) * (p.vx < 0 ? -1 : 1);
        pv.fx.front.setRotation(ang);
        pv.fx.back.setRotation(ang);
      }
      if (pv.gfx) {
        // the crescent: a bright gold edge that leads the disc
        const g = pv.gfx;
        g.clear();
        const R = 34;
        const pts: Phaser.Math.Vector2[] = [];
        for (let i = -10; i <= 10; i++) {
          const a = (i / 10) * 1.1;
          pts.push(new Phaser.Math.Vector2(p.x + Math.cos(a) * R * face, p.y + Math.sin(a) * R));
        }
        for (let i = 10; i >= -10; i--) {
          const a = (i / 10) * 1.0;
          pts.push(new Phaser.Math.Vector2(p.x + Math.cos(a) * (R - 9) * face - 6 * face, p.y + Math.sin(a) * (R - 8)));
        }
        g.fillStyle(0xffe08a, 0.85);
        g.fillPoints(pts, true);
        g.lineStyle(1.5, 0xfff6c8, 0.95);
        g.strokePoints(pts, true);
        for (let i = 0; i < 2; i++) this.spark(p.x - face * 10, p.y + (Math.random() - 0.5) * 24, -face * 40, (Math.random() - 0.5) * 60, 0.35, 0xfff0a8, 2, 0);
      }
      if (pv.img) pv.img.setPosition(p.x, p.y).setRotation(pv.img.rotation + 0.25 * Math.sign(p.vx));
      return;
    }
    if (p.kind === 'relic') {
      pv.img?.setPosition(p.x, p.y).setFlipX(face < 0).setRotation(Math.sin(pv.age * 22) * 0.06);
      if (Math.random() < 0.6) this.spark(p.x - face * 20 + (Math.random() - 0.5) * 8, p.y + (Math.random() - 0.5) * 8, -face * 10, 10 + Math.random() * 20, 0.35, 0xffe08a, 2, 0);
      return;
    }
    if (p.kind === 'hand') {
      if (pv.tex && pv.paintedAt !== Math.floor(pv.age * 30)) {
        pv.paintedAt = Math.floor(pv.age * 30);
        paintHand(pv.tex, 0.5 + 0.5 * Math.sin(pv.age * 16));
      }
      // the claw rises toward a fighter jumping over it (the hand reaches up to 90 units, see World)
      const prey = list.find((f) => f.id !== pv.spawnNear && !f.ground && Math.abs(f.x - p.x) < 70 && f.y < p.y);
      const lift = prey ? Math.min(90, p.y - (prey.y - 24)) : 0;
      pv.lift = (pv.lift ?? 0) + (lift - (pv.lift ?? 0)) * Math.min(1, dt * 18);
      pv.img?.setPosition(p.x, p.y - pv.lift).setFlipX(face < 0).setRotation(-face * Math.min(0.9, pv.lift / 100));
      this.spark(p.x - face * 12 + (Math.random() - 0.5) * 6, p.y - pv.lift + (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 30, -Math.random() * 30, 0.4, 0xa080ff, 2, 0);
      return;
    }
    if (p.kind === 'steed') {
      if (pv.tex && pv.paintedAt !== Math.floor(pv.age * 30)) {
        pv.paintedAt = Math.floor(pv.age * 30);
        paintHorse(pv.tex, pv.age);
      }
      pv.img?.setPosition(p.x, p.y - 4).setFlipX(face < 0);
      if (pv.fx) {
        pv.fx.setPosition(p.x - face * 20, p.y - 6);
        pv.fx.back.setFlipX(face > 0);
        pv.fx.front.setFlipX(face > 0);
      }
      if (Math.random() < 0.9) this.spark(p.x - face * 22 + (Math.random() - 0.5) * 8, p.y - 14 + (Math.random() - 0.5) * 10, -face * (20 + Math.random() * 30), -40 - Math.random() * 50, 0.6, 0xffae35, 2, 60);
      return;
    }
    // bomb
    pv.img?.setPosition(p.x, p.y).setRotation((pv.img?.rotation ?? 0) + 0.25 * Math.sign(p.vx));
    pv.fx?.setPosition(p.x, p.y);
  }

  private drawProjectiles(list: NetProjectile[], fighters: ViewFighter[], dt: number) {
    const seen = new Set<number>();
    for (const p of list) {
      seen.add(p.id);
      let pv = this.projViews.get(p.id);
      if (!pv) {
        pv = this.spawnProj(p);
        this.projViews.set(p.id, pv);
      }
      this.updateProj(pv, p, dt, fighters);
    }
    for (const [id, pv] of this.projViews) {
      if (seen.has(id)) continue;
      this.projViews.delete(id);
      this.endProj(id, pv);
    }
  }

  /** A projectile is gone: a hand that reached its target clamps on, the rest fade out. */
  private endProj(id: number, pv: ProjView) {
    if (pv.kind === 'hand') {
      const opp = this.lastList.find((f) => f.id !== pv.spawnNear);
      if (opp && Math.abs(opp.x - pv.x) < 64 && Math.abs(opp.y - pv.y) < 120 && this.roomFor()) {
        // the grab: black arms burst up out of the floor and drag the victim under
        const fx = this.addFx(FX.graspingHands, opp.x, opp.y, false, 1.1, { palette: PAL.abyss }, 16, 26, 0.95);
        this.after(1000, () => fx.stop());
        const x = opp.x;
        const y = opp.y;
        this.ring(x, y, 8, 50, 0.4, 0x8a5ae0, 3);
        this.shake(0.5);
      } else {
        this.addFx(FX.poof, pv.x, pv.y, false, 1.4, { palette: PAL.abyss }, 14, 16, 0.5);
      }
    } else if (pv.kind === 'relic') {
      for (let i = 0; i < 6; i++) this.spark(pv.x, pv.y, (Math.random() - 0.5) * 120, (Math.random() - 0.5) * 120, 0.4, 0xffe08a, 2.5, 60);
    }
    if (pv.kind === 'steed' || pv.kind === 'hand') pv.fx?.stop();
    else pv.fx?.destroy();
    pv.img?.destroy();
    pv.gfx?.destroy();
    pv.tex?.destroy();
    void id;
  }

  private drawTraps(list: NetTrap[]) {
    const seen = new Set<number>();
    for (const t of list) {
      seen.add(t.id);
      let img = this.trapViews.get(t.id);
      if (!img) {
        img = this.add.image(t.x, t.y + 2, 's-trap').setOrigin(0.5, 1).setScale(0.15).setDepth(8);
        this.trapViews.set(t.id, img);
      }
      img.setAlpha(t.armed ? 1 : 0.5);
    }
    for (const [id, img] of this.trapViews) if (!seen.has(id)) (img.destroy(), this.trapViews.delete(id));
  }

  /** Strike markers: Starfall's ring with a star falling onto it, Chains of Genesis' ring with chains coiling up. */
  private drawStrikes(list: NetStrike[]) {
    const seen = new Set<number>();
    for (const s of list) {
      seen.add(s.id);
      let g = this.strikeViews.get(s.id);
      if (!g) {
        g = this.add.graphics().setDepth(7);
        this.strikeViews.set(s.id, g);
      }
      const k = Math.max(0, Math.min(1, s.left / 20));
      const gold = s.kind === 1;
      g.clear();
      g.lineStyle(2, gold ? 0xffd84a : 0xc09cff, 0.5 + (1 - k) * 0.5);
      g.strokeEllipse(s.x, s.y - 2, 30 + 50 * k, 8 + 12 * k);
      g.fillStyle(gold ? 0xb8862a : 0x8a5ae0, 0.18 + (1 - k) * 0.3);
      g.fillEllipse(s.x, s.y - 2, 30, 8);
      if (gold) {
        this.chainLine(g, s.x, s.y, s.x, s.y - (6 + (1 - k) * 22), 4, 0xffd84a, 0.9);
      } else {
        // a star coming down: a bright head with a trail up the sky
        const hy = s.y - 4 - 230 * k;
        g.lineStyle(3, 0xe8d8ff, 0.5);
        g.lineBetween(s.x - 10 * k, hy - 46 * k - 6, s.x, hy);
        g.lineStyle(1, 0xffffff, 0.8);
        g.lineBetween(s.x - 6, hy, s.x + 6, hy);
        g.lineBetween(s.x, hy - 6, s.x, hy + 6);
        g.fillStyle(0xffffff, 0.95);
        g.fillCircle(s.x, hy, 2.5);
      }
    }
    for (const [id, g] of this.strikeViews) if (!seen.has(id)) (g.destroy(), this.strikeViews.delete(id));
  }

  // ------------------------------------------------------------------ camera

  private shake(amp: number, extra = 0) {
    const k = prefs().shake;
    this.shakeAmp = Math.max(this.shakeAmp, (amp + extra) * 7 * k);
    this.shakeT = 0.22;
  }

  private updateCamera(list: ViewFighter[], dt: number) {
    const cam = this.cameras.main;
    const vw = this.scale.width;
    const vh = this.scale.height;
    const alive = list.length ? list : [];
    let minX = this.arenaW / 2;
    let maxX = this.arenaW / 2;
    let minY = this.floor;
    let maxY = this.floor;
    if (alive.length) {
      minX = Math.min(...alive.map((f) => f.x));
      maxX = Math.max(...alive.map((f) => f.x));
      minY = Math.min(...alive.map((f) => f.y));
      maxY = Math.max(...alive.map((f) => f.y));
    }
    // on touch screens the fight is framed in the room the controls leave: between the stick (left) and the button
    // cluster (right), with the floor raised above the cluster's lower rows
    const pad = this.touchInsets(vw);
    const useW = vw - pad.left - pad.right;
    // how much world fits: about 340-520 units of height, zoomed out to keep both fighters in view
    const wantH = Phaser.Math.Clamp(vh * 0.62, 330, 520);
    let zoom = vh / wantH;
    zoom = Math.min(zoom, useW / (maxX - minX + 300), vh / (maxY - minY + 260));
    zoom = Math.max(zoom, vw / (this.arenaW + 240));
    const cx = (minX + maxX) / 2 + (pad.right - pad.left) / 2 / zoom;
    const cy = Math.min(this.floor - (vh / zoom) * (pad.right ? 0.24 : 0.36), (minY + maxY) / 2 - 40);
    const k = 1 - Math.exp(-dt * 6);
    this.camZoom += (zoom - this.camZoom) * k;
    this.camX += (cx - this.camX) * k;
    this.camY += (cy - this.camY) * k;
    const halfW = vw / this.camZoom / 2;
    const halfH = vh / this.camZoom / 2;
    const x = Phaser.Math.Clamp(this.camX, halfW - 120, this.arenaW + 120 - halfW);
    const y = Math.min(this.camY, this.floor + 70 - halfH);
    let sx = 0;
    let sy = 0;
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      sx = (Math.random() * 2 - 1) * this.shakeAmp;
      sy = (Math.random() * 2 - 1) * this.shakeAmp;
      this.shakeAmp *= 0.86;
    }
    // an Art's zoom punch: a quick push in that eases back
    this.punch *= Math.exp(-dt * 16);
    cam.setZoom(this.camZoom * (1 + this.punch));
    cam.centerOn(halfW * 2 > this.arenaW + 240 ? this.arenaW / 2 : x + sx, y + sy);
    const me = list.find((f) => f.self);
    if (me) sfx.setListener(me.x, me.y);
  }

  /** Screen space (px) the touch controls take on each side; re-measured once a second (they reflow on resize). */
  private insets = { left: 0, right: 0, at: -1 };
  private touchInsets(vw: number) {
    if (this.clock - this.insets.at > 1) {
      this.insets.at = this.clock;
      const cluster = document.querySelector('.touch .tbuttons')?.getBoundingClientRect();
      const stick = document.querySelector('.touch .stick-base')?.getBoundingClientRect();
      const css = window.innerWidth || vw;
      const k = vw / css; // game pixels per CSS pixel
      this.insets.right = cluster && cluster.width > 0 ? Math.max(0, css - cluster.left) * k * 0.85 : 0;
      this.insets.left = stick && stick.width > 0 && this.insets.right ? Math.max(0, stick.right) * k * 0.6 : 0;
    }
    return this.insets;
  }

  private teardown() {
    for (const [id, fv] of this.views) this.removeView(id, fv);
    for (const f of this.fx) f.destroy();
    this.fx = [];
    for (const [id, pv] of this.projViews) this.endProjQuiet(id, pv);
    this.projViews.clear();
    for (const t of this.trapViews.values()) t.destroy();
    this.trapViews.clear();
    for (const g of this.strikeViews.values()) g.destroy();
    this.strikeViews.clear();
    this.vecs = [];
    this.parts = [];
    this.scheduled = [];
    this.vecB?.destroy();
    this.vecF?.destroy();
    this.partG?.destroy();
  }

  private endProjQuiet(id: number, pv: ProjView) {
    void id;
    pv.fx?.destroy();
    pv.img?.destroy();
    pv.gfx?.destroy();
    pv.tex?.destroy();
  }
}

/**
 * World bounds of a Graphics built only from fills, strokes and line styles (padded for line widths), read from its
 * command buffer: [opcode, arguments...] with Phaser's fixed arities. Null when it holds anything else, so unknown
 * content is never culled.
 */
function commandBounds(g: Phaser.GameObjects.Graphics): [number, number, number, number] | null {
  const b = g.commandBuffer as unknown[];
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  const pt = (x: number, y: number) => {
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  };
  let i = 0;
  while (i < b.length) {
    const op = b[i++] as number;
    switch (op) {
      case 1: // BEGIN_PATH
      case 2: // CLOSE_PATH
      case 8: // FILL_PATH
      case 9: // STROKE_PATH
      case 14: // SAVE
      case 15: // RESTORE
        break;
      case 3: {
        // FILL_RECT x, y, w, h
        const x = b[i] as number;
        const y = b[i + 1] as number;
        pt(x, y);
        pt(x + (b[i + 2] as number), y + (b[i + 3] as number));
        i += 4;
        break;
      }
      case 4: // LINE_TO x, y
      case 5: // MOVE_TO x, y
        pt(b[i] as number, b[i + 1] as number);
        i += 2;
        break;
      case 6: // LINE_STYLE width, colour, alpha
        i += 3;
        break;
      case 7: // FILL_STYLE colour, alpha
        i += 2;
        break;
      case 21: // GRADIENT_FILL_STYLE: four alphas, four colours
        i += 8;
        break;
      default:
        return null;
    }
  }
  if (x0 > x1) return null;
  const pad = 8;
  return [x0 - pad, y0 - pad, x1 + pad, y1 + pad];
}

/** The world-space Graphics a build step added to the scene (not screen-fixed ones), with their bounds. */
function arenaCullables(scene: Phaser.Scene, before: Set<Phaser.GameObjects.GameObject>) {
  const out: { g: Phaser.GameObjects.Graphics; x0: number; y0: number; x1: number; y1: number }[] = [];
  for (const o of scene.children.list) {
    if (before.has(o) || !(o instanceof Phaser.GameObjects.Graphics)) continue;
    if (o.scrollFactorX !== 1 || o.scrollFactorY !== 1) continue;
    const bb = commandBounds(o);
    if (bb) out.push({ g: o, x0: bb[0], y0: bb[1], x1: bb[2], y1: bb[3] });
  }
  return out;
}

/** The rig's own floor offsets are left to the simulation (it already moves the fighter). */
function stripXY(p: Pose): Pose {
  if (p.x === undefined && p.y === undefined) return p;
  const { x: _x, y: _y, ...rest } = p;
  void _x;
  void _y;
  return rest;
}
