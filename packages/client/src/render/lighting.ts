/**
 * Stage lighting: the arena sits in low light and only its lamps, the fighters' own pools of light and the blows light it
 * (the owner's reference clip: a dark hall, warm sconces, a soft spotlight on each fighter, and every slash throwing its
 * colour over the floor and the wall around it).
 *
 * A light map is redrawn every frame into a half-resolution screen texture: filled with the arena's ambient colour, then
 * every light is stamped on it additively (a soft round blob, squashed for a pool on the floor). The map is drawn over the
 * arena and the fighters with MULTIPLY, so a light can only bring the art back up to its painted brightness; the glowing
 * effects (slashes, sparks, projectiles) are drawn above it and stay bright against the dark.
 */
import Phaser from 'phaser';

/** A light fixed in the arena (a lamp painted on the back wall). `sf` is the horizontal scroll factor of what it sits on. */
export interface StaticLight {
  x: number;
  y: number;
  /** Radius (world units). */
  r: number;
  color: number;
  /** 0..1 */
  k: number;
  sf: number;
  /** Candle flicker. */
  flicker?: boolean;
  /** A pool on the floor under it as well (its y). */
  floorY?: number;
}

/** A light that flares and fades (a blow, a burst, a projectile's glow). */
interface Flash {
  x: number;
  y: number;
  r: number;
  color: number;
  k: number;
  age: number;
  life: number;
  /** Pool on the floor (its y), or none. */
  floorY?: number;
  /** Hold at full strength for this share of the life before fading. */
  hold: number;
}

export interface LitBody {
  x: number;
  y: number;
  /** Lit by the fighter's own key light (a fighter), with this strength. */
  k: number;
}

const BLOB = 'light-blob';
/** The light map's resolution relative to the canvas (it is smooth, so half is plenty). */
const RES = 0.5;

function blobTexture(scene: Phaser.Scene) {
  if (scene.textures.exists(BLOB)) return;
  const n = 128;
  const tex = scene.textures.createCanvas(BLOB, n, n)!;
  const g = tex.context;
  const grad = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
  // a soft falloff with a fuller middle (light, not a glow)
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    const a = Math.pow(1 - t, 1.6) * (1 - 0.15 * t);
    grad.addColorStop(t, `rgba(255,255,255,${a.toFixed(3)})`);
  }
  g.fillStyle = grad;
  g.fillRect(0, 0, n, n);
  tex.refresh();
}

export class StageLights {
  private readonly rt: Phaser.GameObjects.RenderTexture;
  private readonly flashes: Flash[] = [];
  private t = 0;
  /** Lights out for this long (seconds): a K.O. or a super's dimming takes the lamps down with it. */
  private dim = 0;
  private dimTo = 0;

  constructor(private readonly scene: Phaser.Scene, readonly ambient: number, private readonly statics: StaticLight[], depth = 12.5) {
    blobTexture(scene);
    const w = Math.max(2, Math.ceil(scene.scale.width * RES));
    const h = Math.max(2, Math.ceil(scene.scale.height * RES));
    this.rt = scene.add.renderTexture(0, 0, w, h).setScrollFactor(0).setDepth(depth).setBlendMode(Phaser.BlendModes.MULTIPLY).setOrigin(0.5);
  }

  /** A light that flares and fades: radius in world units, `k` 0..1, `life` seconds; `floorY` adds a pool on the floor. */
  flash(x: number, y: number, color: number, r: number, k: number, life: number, floorY?: number, hold = 0.15) {
    if (this.flashes.length > 24) this.flashes.shift();
    this.flashes.push({ x, y, r, color, k, age: 0, life, floorY, hold });
  }

  /** Dim the whole stage toward black for a beat (0..1 of the way), e.g. while a super's cut-in plays. */
  dimFor(seconds: number, amount: number) {
    this.dim = Math.max(this.dim, seconds);
    this.dimTo = Math.max(this.dimTo, amount);
  }

  update(dt: number, bodies: LitBody[], floorY: number) {
    this.t += dt;
    const scene = this.scene;
    const cam = scene.cameras.main;
    const W = scene.scale.width;
    const H = scene.scale.height;
    const rw = Math.max(2, Math.ceil(W * RES));
    const rh = Math.max(2, Math.ceil(H * RES));
    if (this.rt.width !== rw || this.rt.height !== rh) this.rt.resize(rw, rh);
    // pinned over the view at any camera zoom (Phaser scales scroll-factor-0 objects about the view centre)
    const z = cam.zoom || 1;
    this.rt.setPosition(W / 2, H / 2).setScale(1 / RES / z);
    const sx0 = cam.scrollX;
    const sy0 = cam.scrollY;
    // world -> light map pixels, for something with horizontal scroll factor `sf`
    const px = (x: number, sf = 1) => (W / 2 + z * (x - sf * sx0 - W / 2)) * RES;
    const py = (y: number) => (H / 2 + z * (y - sy0 - H / 2)) * RES;
    const S = (BLOB_N: number) => (z * RES * 2) / BLOB_N;
    const unit = S(128);
    this.rt.clear();
    let amb = this.ambient;
    if (this.dim > 0) {
      this.dim -= dt;
      amb = mix(amb, 0x000000, this.dimTo);
      if (this.dim <= 0) this.dimTo = 0;
    }
    this.rt.fill(amb, 1);
    const lightK = this.dimTo ? 1 - this.dimTo * 0.8 : 1;
    const stamp = (x: number, y: number, r: number, color: number, k: number, sy = 1) => {
      if (k <= 0.01) return;
      const s = r * unit;
      // (off the map: skip)
      if (x + s * 64 < 0 || x - s * 64 > rw || y + s * 64 * sy < 0 || y - s * 64 * sy > rh) return;
      this.rt.stamp(BLOB, undefined, x, y, { tint: color, alpha: Math.min(1, k * lightK), scaleX: s, scaleY: s * sy, blendMode: Phaser.BlendModes.ADD, originX: 0.5, originY: 0.5 });
    };
    // the lamps on the walls: a warm glow round each and a dimmer pool on the floor below
    for (const l of this.statics) {
      const f = l.flicker ? 0.9 + 0.06 * Math.sin(this.t * 9.1 + l.x) + 0.04 * Math.sin(this.t * 23.7 + l.y) : 1;
      stamp(px(l.x, l.sf), py(l.y), l.r, l.color, l.k * f);
      if (l.floorY !== undefined) stamp(px(l.x, l.sf), py(l.floorY), l.r * 1.3, l.color, l.k * 0.45 * f, 0.22);
    }
    // each fighter's key light: a soft pool round the body and a brighter ellipse at the feet
    for (const b of bodies) {
      stamp(px(b.x), py(b.y - 40), 190, 0xfff2e0, 0.62 * b.k);
      stamp(px(b.x), py(b.y - 34), 90, 0xffffff, 0.3 * b.k);
      stamp(px(b.x), py(floorY), 150, 0xfff2e0, 0.45 * b.k, 0.22);
    }
    // the blows: a burst of their colour round the contact and a pool thrown on the floor
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      f.age += dt;
      if (f.age >= f.life) {
        this.flashes.splice(i, 1);
        continue;
      }
      const p = f.age / f.life;
      const a = p < f.hold ? 1 : 1 - (p - f.hold) / (1 - f.hold);
      const k = f.k * a * a;
      const r = f.r * (0.85 + 0.25 * p);
      stamp(px(f.x), py(f.y), r, f.color, k);
      if (f.floorY !== undefined) stamp(px(f.x), py(f.floorY), r * 1.35, f.color, k * 0.9, 0.24);
    }
    this.rt.render();
  }

  destroy() {
    this.rt.destroy();
  }
}

/** Blend two RGB colours (t = 0 a, 1 b). */
export function mix(a: number, b: number, t: number) {
  const ch = (s: number) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t) << s;
  return ch(16) | ch(8) | ch(0);
}
