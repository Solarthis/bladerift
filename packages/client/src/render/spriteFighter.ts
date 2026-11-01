/**
 * Sprite fighters: a hero drawn from its generated animation atlas (assets/characters/<id>/atlas.png + atlas.json, made by
 * tools/sprites/process.py) instead of the procedural pixel rig. The atlas loads on demand when a match needs the hero; until it
 * is there (or for a hero without one) the game keeps drawing the rig.
 */
import Phaser from 'phaser';
import { Act, FIGHTER } from '@bladerift/shared';
import type { ViewFighter } from '../net/NetGame';
import { hurtLevel, spritePoseFor, type SpriteAtlasMeta, type SpriteCtx, type SpritePose } from './spriteAnim';
import { heroEnergy } from './fxmap';

/** How long the motion smear of a swing lingers (seconds). */
const SMEAR_LIFE = 0.11;

/** Atlas folder per hero id (the same names as the art sources in art/characters/). */
export const SPRITE_IDS = [
  'h00-leon', 'h01-kharon', 'h02-aurelion', 'h03-nyx', 'h04-verdan', 'h05-lumi', 'h06-quill',
  'h07-hollowmask', 'h08-sable', 'h09-gorvax', 'h10-gray', 'h11-ignis', 'h12-thornmaw', 'h13-aegis',
];

/** World units from the feet to the crown of a reference-height standing sprite (the body box is FIGHTER.h; hair and
 * helmets sit above it). Taller or smaller heroes keep the same pixels-per-unit, so their size differences show. */
const STAND_WORLD = FIGHTER.h * 1.12;

const metas = new Map<number, SpriteAtlasMeta | null>();
const pending = new Map<number, Promise<SpriteAtlasMeta | null>>();

const texKey = (hero: number) => `hero-sprites-${hero}`;
/** The release stamp versions the atlas URLs, so a cached atlas.json is never paired with another release's atlas.png. */
const V = `?v=${encodeURIComponent(String(import.meta.env.VITE_RELEASE ?? 'dev'))}`;

/** The hero's atlas, loading it into the scene's texture manager the first time (null: the hero has no sprites yet). */
export function loadHeroSprites(scene: Phaser.Scene, hero: number): Promise<SpriteAtlasMeta | null> {
  if (metas.has(hero) && (metas.get(hero) === null || scene.textures.exists(texKey(hero)))) return Promise.resolve(metas.get(hero)!);
  const busy = pending.get(hero);
  if (busy) return busy;
  const id = SPRITE_IDS[hero];
  const p = (async () => {
    if (!id) return null;
    try {
      const r = await fetch(`assets/characters/${id}/atlas.json${V}`);
      if (!r.ok || !r.headers.get('content-type')?.includes('json')) return null;
      const meta = (await r.json()) as SpriteAtlasMeta;
      await new Promise<void>((resolve, reject) => {
        const key = texKey(hero);
        if (scene.textures.exists(key)) return resolve();
        scene.load.image(key, `assets/characters/${id}/atlas.png${V}`);
        // listen for THIS file's error only (an unrelated loader error must not use the listener up)
        const onError = (f: { key: string }) => {
          if (f.key !== key) return;
          scene.load.off('loaderror', onError);
          reject(new Error('atlas'));
        };
        scene.load.on('loaderror', onError);
        scene.load.once(`filecomplete-image-${key}`, () => {
          scene.load.off('loaderror', onError);
          resolve();
        });
        scene.load.start();
      });
      const tex = scene.textures.get(texKey(hero));
      for (const [name, f] of Object.entries(meta.frames)) if (!tex.has(name)) tex.add(name, 0, f.x, f.y, f.w, f.h);
      // painted sprites shown at fractional camera zoom: smooth sampling keeps them steady (nearest would shimmer)
      tex.setFilter(Phaser.Textures.FilterMode.LINEAR);
      return meta;
    } catch {
      return null;
    }
  })();
  pending.set(hero, p);
  p.then((m) => {
    metas.set(hero, m);
    pending.delete(hero);
  });
  return p;
}

const prefetched = new Set<number>();
/** Warm the HTTP cache with a hero's atlas (the lobby calls this for the seated heroes, so the match starts with sprites). */
export function prefetchHeroSprites(hero: number) {
  const id = SPRITE_IDS[hero];
  if (!id || prefetched.has(hero)) return;
  prefetched.add(hero);
  for (const f of ['atlas.json', 'atlas.png']) fetch(`assets/characters/${id}/${f}${V}`).catch(() => prefetched.delete(hero));
}

/** The hero's atlas is still on its way (the scene hides the rig meanwhile). */
export const spritesPending = (hero: number) => pending.has(hero);

/** Already loaded (sync), for the render loop. */
export const heroSpritesReady = (hero: number) => metas.get(hero) ?? null;

/** One fighter on screen drawn from its atlas. */
export class SpriteFighterView {
  readonly img: Phaser.GameObjects.Image;
  private frame = '';
  private readonly scale: number;
  /** A colour wash for the second fighter of a mirror match (0 = none), like a fighting game's alternate palette. */
  altTint = 0;
  /** The hit strength of the current hit-stun, judged at its start (the hit-stop the blow froze it for, the knockback). */
  private hurt: 0 | 1 | 2 = 0;
  private hurtStop = 0;
  private hurtKb = 0;
  private lastAct = -1;
  private lastT = 0;
  /** Time the fighter spent frozen (hit-stop, superpause): its time-driven loops (idle, run) hold still meanwhile. */
  private lagT = 0;
  private lagRun = 0;
  private lastTime = Number.NaN;
  private lastRun = 0;
  /** The knockdown tilt (degrees, clockwise), applied just before rendering (the scene resets the angle each frame). */
  private rot = 0;
  private rotPending = false;
  /**
   * The motion smear: when a swing snaps from its wind-up to its strike, the wind-up drawing lingers for a few frames
   * behind the body, stretched along the swing and washed in the hero's energy colour (additive), so the cut reads as
   * one fast motion instead of two pictures.
   */
  private readonly smear: Phaser.GameObjects.Image;
  private smearAt = -1;
  private smearFrom = '';
  private smearX = 0;
  private smearY = 0;
  private smearFace = 1;
  private readonly energy: number;

  constructor(scene: Phaser.Scene, readonly hero: number, readonly meta: SpriteAtlasMeta, depth = 10) {
    this.scale = STAND_WORLD / (meta.base ?? meta.native);
    const first = meta.anims.idle?.frames[0] ?? Object.keys(meta.frames)[0];
    this.smear = scene.add.image(0, 0, texKey(hero), first).setScale(this.scale).setDepth(depth - 0.01).setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
    this.img = scene.add.image(0, 0, texKey(hero), first).setScale(this.scale).setDepth(depth);
    this.energy = heroEnergy(hero).arc;
    this.apply(first, 1);
    scene.events.on(Phaser.Scenes.Events.PRE_RENDER, this.preRender, this);
  }

  /** The frame for this fighter right now. */
  frameFor(v: ViewFighter, ctx: SpriteCtx) {
    return this.poseFor(v, ctx).frame;
  }

  /** The pose (frame and offsets), with this view's memory: the hit strength of the stun and the frozen clock. */
  private poseFor(v: ViewFighter, ctx: SpriteCtx): SpritePose {
    // the hit strength: a new stun (or a new hit of the combo: the action time starts over) is judged afresh
    if (v.act === Act.Stun) {
      if (this.lastAct !== Act.Stun || v.actTf < this.lastT - 0.01) {
        this.hurtStop = 0;
        this.hurtKb = 0;
      }
      this.hurtStop = Math.max(this.hurtStop, v.hitstop);
      if (v.actTf < 3) this.hurtKb = Math.max(this.hurtKb, Math.abs(v.vx));
      this.hurt = hurtLevel(this.hurtStop, this.hurtKb, v.fall);
    }
    this.lastAct = v.act;
    this.lastT = v.actTf;
    // frozen: the idle breath and the run cycle stop with the body
    if (!Number.isNaN(this.lastTime) && (v.hitstop > 0 || v.pause > 0)) {
      this.lagT += Math.max(0, ctx.time - this.lastTime);
      this.lagRun += ctx.runPhase - this.lastRun;
    }
    this.lastTime = ctx.time;
    this.lastRun = ctx.runPhase;
    return spritePoseFor(v, {
      ...ctx,
      time: ctx.time - this.lagT,
      runPhase: ctx.runPhase - this.lagRun,
      shakeT: ctx.shakeT ?? ctx.time,
      hurt: ctx.hurt ?? (v.act === Act.Stun ? this.hurt : undefined),
    }, this.meta);
  }

  private apply(name: string, face: number) {
    const f = this.meta.frames[name];
    if (!f) return;
    if (name !== this.frame) {
      this.img.setFrame(name);
      this.frame = name;
    }
    // the anchor (feet centre) sits on the fighter's position; flipping mirrors the anchor too
    const ox = f.ax / f.w;
    this.img.setFlipX(face < 0).setOrigin(face < 0 ? 1 - ox : ox, f.ay / f.h);
  }

  /** Place and pose: `flash` 0..1 whitens (a hit), `tint` an ARGB colour wash (0 = none). */
  draw(v: ViewFighter, x: number, y: number, ctx: SpriteCtx, flash: number, tint: number) {
    const pose = this.poseFor(v, ctx);
    const name = pose.frame;
    // a swing reaching its strike drawing (the lunge snaps in): the drawing it leaves becomes the smear
    if (v.act === Act.Attack && name !== this.frame && this.frame && pose.dx > 1 && !this.meta.anims.idle?.frames.includes(this.frame)) {
      this.smearAt = ctx.time;
      this.smearFrom = this.frame;
      this.smearX = x;
      this.smearY = y;
      this.smearFace = v.face < 0 ? -1 : 1;
    }
    this.drawSmear(ctx.time);
    // the wall-slide frame is drawn with the wall behind; the game faces a sliding fighter toward the wall
    const wallFrame = this.meta.anims.wallSlide?.frames.includes(name);
    this.apply(name, wallFrame ? -v.face : v.face);
    const face = v.face < 0 ? -1 : 1;
    // the lunge (toward where the fighter faces), the hit-stop shake, a bounce; a squash about the feet
    this.img.setPosition(x + pose.dx * face, y + pose.dy);
    this.img.setScale(this.scale * pose.sx, this.scale * pose.sy);
    this.rot = pose.rot * face;
    this.rotPending = true;
    if (flash > 0.5) {
      // a hit: the figure flashes white (fill); the weaker invulnerability flicker is an alpha blink (GameScene)
      this.img.tintMode = Phaser.TintModes.FILL;
      this.img.setTint(0xffffff);
    } else {
      this.img.tintMode = Phaser.TintModes.MULTIPLY;
      const t = tint || this.altTint;
      if (t) this.img.setTint(t & 0xffffff);
      else this.img.clearTint();
    }
  }

  private drawSmear(now: number) {
    const k = (now - this.smearAt) / SMEAR_LIFE;
    if (this.smearAt < 0 || k >= 1 || k < 0 || !this.meta.frames[this.smearFrom]) {
      this.smear.setVisible(false);
      return;
    }
    const f = this.meta.frames[this.smearFrom];
    const face = this.smearFace;
    const ox = f.ax / f.w;
    // it trails back along the cut and thins out as it fades
    this.smear
      .setVisible(true)
      .setFrame(this.smearFrom)
      .setFlipX(face < 0)
      .setOrigin(face < 0 ? 1 - ox : ox, f.ay / f.h)
      .setPosition(this.smearX - face * (3 + 9 * k), this.smearY)
      .setScale(this.scale * (1.08 + 0.1 * k), this.scale * (1 - 0.04 * k))
      .setTint(this.energy)
      .setAlpha(0.55 * (1 - k) * (1 - k));
  }

  /** The knockdown tilt turns the figure about its body centre (not the feet anchor): set last thing before the render. */
  private preRender() {
    if (!this.rotPending) return;
    this.rotPending = false;
    const r = Phaser.Math.DegToRad(this.rot);
    this.img.setRotation(r);
    if (!r) return;
    const p = this.meta.native * 0.42 * this.scale;
    this.img.x -= p * Math.sin(r);
    this.img.y += p * (Math.cos(r) - 1);
  }

  /** Current frame name (for after-images). */
  get current() {
    return this.frame;
  }

  get textureKey() {
    return texKey(this.hero);
  }

  get worldScale() {
    return this.scale;
  }

  destroy() {
    this.img.scene?.events.off(Phaser.Scenes.Events.PRE_RENDER, this.preRender, this);
    this.smear.destroy();
    this.img.destroy();
  }
}
