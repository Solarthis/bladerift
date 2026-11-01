import Phaser from 'phaser';
import {
  Act, ARENAS, ArtId, CRESCENT, DODGES, lookWeapon, DodgeDef, FIGHTER, GameEvent, gatePortal, heroOf, MOVE_PLUNGE, moveOf, NetProjectile, NetStrike, NetTrap, SHOOT_CRESCENT, SKILL_EVENT, SKILLS, SkillId, TICK_RATE, WEAPONS, WeaponId,
} from '@bladerift/shared';
import type { NetGame, ViewFighter } from '../net/NetGame';
import type { Session } from '../net/Session';
import type { InputSource } from '../input/Controls';
import { bakeFrames, FighterCanvas, fighterLut, FxModule, FxSprite, paintLive, PIX, Pose, prewarmEffects } from '../render/pixel';
import { poseFor } from '../render/poses';
import { warmFighter } from '../render/warm';
import { heroHasSprites, heroSpritesReady, loadHeroSprites, spritesPending, SpriteFighterView } from '../render/spriteFighter';
import { arcFor, ArcShape, energyForMove, FX, heroEnergy, HeroEnergy, PAL, shadeColor, swingFx, whiten } from '../render/fxmap';
import { DODGE_SOUNDS, sfx, SKILL_SOUNDS } from '../audio/Sfx';
import { prefs } from '../ui/prefs';
import { buildArena } from '../render/arena';
import { colorOf, accentOf } from '../ui/colors';
import { koCinematic, playSuperCinematic, superConnect } from './cinematic';

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

/** How a horse is coloured: Bucephalus aflame (black, fire) or Death's pale horse (bone-white, violet smoke). */
interface HorseLook {
  body: string;
  rim: [string, string];
  /** The tail and mane: hot, mid, dark. */
  flame: [string, string, string];
  eye: string;
}
const BUCEPHALUS: HorseLook = { body: '#120a0c', rim: ['#ff7a2a', '#9a2a12'], flame: ['#ffe27a', '#ff8a2a', '#c8301a'], eye: '#ffe27a' };
const PALE_HORSE: HorseLook = { body: '#d8d2e2', rim: ['#a070ff', '#4a2a88'], flame: ['#ece0ff', '#8a5ae0', '#3d1e6e'], eye: '#c09cff' };

/** A warhorse at full gallop, facing right: fire (or smoke) along the tail, the mane and the rim. */
function paintHorse(tex: PixelTex, t: number, look: HorseLook = BUCEPHALUS) {
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
        return rgbOf(h > 0.7 ? look.flame[0] : h > 0.35 ? look.flame[1] : look.flame[2]);
      }
    }
    if (x > 27 && x < 36) {
      const top = 10.5 - (x - 27) * 0.85 - flick(x) * 2.2;
      if (y < top && y > top - 2.8) return rgbOf(flick(x + 1) > 0.5 ? look.flame[0] : look.flame[1]);
    }
    const s = silhouette(x, y, caps, els);
    if (s === 0) return 0;
    if (s === 1) return rgbOf(flick(x) > 0.3 ? look.rim[0] : look.rim[1]);
    if (x > 39 && x < 40.5 && Math.abs(y - 4.8) < 0.8) return rgbOf(look.eye);
    return rgbOf(look.body);
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

/** Heroes whose dodge draws no generic after-images: Clay Shift, Mirage, the Flash Steps (their own), Fog Form, Shadow Sink. */
const NO_GHOST_DODGE = new Set([4, 5, 7, 8, 10, 12]);

/** The colour of each hero's dodge trail (by hero id). */
const TRAIL_COLOR = [0xffd84a, 0xffa040, 0xffd84a, 0x7ae8f5, 0xc8a878, 0x9a7aff, 0xfff0c0, 0x7affd0, 0x3ce0f5, 0xa8422a, 0xb8c4dc, 0xffa050, 0x8a5ae0, 0x7ae8f5];

/** A polyline that fades toward its oldest point: a streak or an arc. `dy` lifts it to the body's middle. */
function strokeTrail(g: Phaser.GameObjects.Graphics, pts: { x: number; y: number }[], color: number, a: number, w: number, dy = 0) {
  for (let i = 1; i < pts.length; i++) {
    const k = i / pts.length;
    g.lineStyle(w * k + 0.4, color, a * k);
    g.lineBetween(pts[i - 1].x, pts[i - 1].y + dy, pts[i].x, pts[i].y + dy);
  }
}

/** A dark-bladed knife (the Shadow Dirk, the Fan of Knives) pointing along `ang`. */
function drawKnife(g: Phaser.GameObjects.Graphics, x: number, y: number, ang: number, blade: number, edge: number) {
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  const P = (u: number, v: number) => new Phaser.Math.Vector2(x + u * c - v * s, y + u * s + v * c);
  g.fillStyle(0x1a1a22, 1);
  g.fillPoints([P(-8, -1.3), P(-4, -1.6), P(-4, 1.6), P(-8, 1.3)], true);
  g.fillStyle(blade, 1);
  g.fillPoints([P(-4, -2.4), P(4, -1.7), P(12, 0), P(4, 1.7), P(-4, 2.4)], true);
  const a = P(-4, -2.4);
  const b = P(12, 0);
  g.lineStyle(1, edge, 1);
  g.lineBetween(a.x, a.y, b.x, b.y);
}

/** A four-pointed violet star (Phantom Stars), turning as it flies. */
function drawStar(g: Phaser.GameObjects.Graphics, x: number, y: number, R: number, r: number, rot: number, color: number, core: number) {
  const pts: Phaser.Math.Vector2[] = [];
  for (let i = 0; i < 8; i++) {
    const a = rot + (i / 8) * Math.PI * 2;
    const rr = i % 2 ? r : R;
    pts.push(new Phaser.Math.Vector2(x + Math.cos(a) * rr, y + Math.sin(a) * rr));
  }
  g.fillStyle(0x8a5ae0, 0.25);
  g.fillCircle(x, y, R + 3);
  g.fillStyle(color, 1);
  g.fillPoints(pts, true);
  g.fillStyle(core, 1);
  g.fillCircle(x, y, 1.4);
}

/** A scalpel (Scalpel Rain): a dark handle and a silver blade, spun to `ang`. */
function drawScalpel(g: Phaser.GameObjects.Graphics, x: number, y: number, ang: number) {
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  const P = (u: number) => ({ x: x + u * c, y: y + u * s });
  const h0 = P(-4);
  const h1 = P(0);
  const t = P(7);
  g.lineStyle(3, 0x2a2a30, 1);
  g.lineBetween(h0.x, h0.y, h1.x, h1.y);
  g.lineStyle(2, 0xeef3fa, 1);
  g.lineBetween(h1.x, h1.y, t.x, t.y);
}

/** A blob of golden ink with a black core (Ink Blot): a wobbling rim and a highlight. */
function drawInk(g: Phaser.GameObjects.Graphics, x: number, y: number, t: number) {
  const pts: Phaser.Math.Vector2[] = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const r = 6 + Math.sin(a * 3 + t * 9) * 1.4 + Math.sin(a * 5 - t * 7) * 0.7;
    pts.push(new Phaser.Math.Vector2(x + Math.cos(a) * r, y + Math.sin(a) * r));
  }
  g.fillStyle(0xe8c878, 0.3);
  g.fillCircle(x, y, 10);
  g.fillStyle(0x15110c, 0.95);
  g.fillPoints(pts, true);
  g.lineStyle(1.5, 0xe8c878, 0.95);
  g.strokePoints(pts, true);
  g.fillStyle(0xfff6d8, 1);
  g.fillCircle(x - 2, y - 2, 1.2);
}

/** The tower shield (Shield Rebound), spinning about its vertical axis; `spin` is its angle. */
function drawShield(g: Phaser.GameObjects.Graphics, x: number, y: number, spin: number) {
  for (let k = 2; k >= 0; k--) {
    const c = Math.cos(spin - k * 0.5);
    const w = 10 * c;
    const pts = [[x - w, y - 13], [x + w, y - 13], [x + w, y + 2], [x, y + 13], [x - w, y + 2]].map(([a, b]) => new Phaser.Math.Vector2(a, b));
    g.fillStyle(c >= 0 ? 0x2a8a90 : 0x1c5a60, k === 0 ? 1 : 0.18);
    g.fillPoints(pts, true);
    if (k === 0) {
      g.lineStyle(1.6, 0x7ae8f5, 1);
      g.strokePoints(pts, true);
      g.lineStyle(1.4, 0xd0fbff, 0.9);
      g.lineBetween(x, y - 8, x, y + 7);
      g.lineBetween(x - 5 * c, y - 3, x + 5 * c, y - 3);
    }
  }
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
/** Gilgamesh's treasures (the Gate, Gate Shot, Vault of Ages): painted gold and silver, horizontal, point to the right. */
const RELIC_SPRITES = ['r-gold-sword', 'r-silver-sword', 'r-gold-spear', 'r-silver-axe', 'r-gold-halberd', 'r-silver-greatsword', 'r-gold-shortsword', 'r-silver-glaive'];

const STEP_MS = 1000 / TICK_RATE;
/** Live effect sprites above which optional ambient effects are skipped (phones). */
const MAX_FX = 70;
/** Live square particles. */
const MAX_PARTS = 150;
/** Live swing arcs and additive impact drawings (the hit sparks' layers). */
const MAX_ARCS = 10;
const MAX_ADDS = 48;
/** After-images per fighter (a dodge spawns one every two frames). */
const GHOSTS = 6;
/** Standing body height in world units (sizes the hit sparks). */
const BODY_H = 58;

/** A camera shot that takes over from the follow camera (zoomTo): a point or a fighter to frame, and how close. */
export interface ZoomShot {
  /** Frame this fighter (its body's middle) while the shot lasts... */
  id?: number;
  /** ...or this world point. With neither, the shot zooms on the follow camera's own centre. */
  x?: number;
  y?: number;
  /** Zoom multiplier over the follow camera's (1.5 = 50% closer). */
  zoom: number;
}

/** A swing arc drawn over a sprite fighter (additive), following its body while the move plays. */
interface Arc {
  owner: number;
  shape: ArcShape;
  face: number;
  x: number;
  y: number;
  age: number;
  c: HeroEnergy;
  /** Heavy arcs throw sparks off their head (spawn clock). */
  sparkAt: number;
  /** Fixes which pixel blocks drop out as the arc fades. */
  seed: number;
}

const easeOut3 = (p: number) => 1 - (1 - p) * (1 - p) * (1 - p);
/** The white of a dodge's swoosh (pixelCrescent tones). */
const SWOOSH: HeroEnergy = { arc: 0xeaf4ff, rim: 0x6a7aa0, spark: 0xffffff };
/** A colour darkened to `k` of its brightness (a spark's rim). */
const shade = (c: number, k: number) => (Math.round(((c >> 16) & 255) * k) << 16) | (Math.round(((c >> 8) & 255) * k) << 8) | Math.round((c & 255) * k);
/** How saturated a colour is (0 grey .. 1 pure). */
const saturation = (c: number) => {
  const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  return mx ? (mx - mn) / mx : 0;
};
/** A colour mixed toward white by `k` (a spark's hot middle). */
const mixWhite = (c: number, k: number) => {
  const m = (v: number) => Math.round(v + (255 - v) * k);
  return (m((c >> 16) & 255) << 16) | (m((c >> 8) & 255) << 8) | m(c & 255);
};

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
  /** Scene clock before which a failed atlas download is not asked for again. */
  retryAt?: number;
  /** The colour of this fighter's latest blow and when it was thrown (its victim flashes in it). */
  blowColor?: number;
  blowAt?: number;
  /** A hit's flash: white for its first frames, then a flat wash of the blow's colour through the freeze. */
  flashAt?: number;
  flashColor?: number;
  tag: Phaser.GameObjects.Text;
  ghosts: { img: Phaser.GameObjects.Image; tex: Phaser.Textures.CanvasTexture; life: number; max: number; a0: number }[];
  ghostI: number;
  ghostAt: number;
  /** Pose time held during a hit-stop. */
  frozenT: number;
  freezeUntil: number;
  /** In hit-stop this frame (the sim's per-fighter `hitstop` when the snapshot carries it, else the client freeze). */
  frozen: boolean;
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
  /** The dodge in progress (each hero's own), and a warhorse under a rider (Cavalry Dash, Bucephalus Charge). */
  dodge: Dodge | null;
  mount: Painted | null;
  /** Dodge trails and overlays, behind the body. */
  dgfx: Phaser.GameObjects.Graphics;
  /** The body's last drawn height (a dodge's sink). */
  lastY: number;
  runeAt: number;
  flameAt: number;
}

/** A painted little sprite (a warhorse) that follows a fighter. */
interface Painted {
  tex: PixelTex;
  img: Phaser.GameObjects.Image;
  step: number;
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
  /** Hero special (skill id + 1, NetProjectile.skin); 0 for the ordinary projectiles. */
  skin: number;
  /** Richard's Sun Crescent (a wave that is not the Art's): its additive layer (gfx is the body). */
  sun?: Phaser.GameObjects.Graphics;
  /** Where it has been, frame by frame (the trails). */
  hist: { x: number; y: number }[];
}

/** A dodge in progress: each hero's own (DODGES[hero]), from the Roll until it arrives. */
interface Dodge {
  hero: number;
  def: DodgeDef;
  x0: number;
  y0: number;
  /** Where the body was, frame by frame (the streak). */
  trail: { x: number; y: number }[];
  /** After-images spawned so far (the Flash Step makes up to four). */
  afterimages: number;
  lastGhost: number;
  lastPuff: number;
  ended: boolean;
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
  /** Recent hero specials going off (the caster of a special's projectile). */
  private casts: { skill: number; caster: number; t: number }[] = [];
  /** Spare Graphics for the specials' projectiles. */
  private gfxPool: Phaser.GameObjects.Graphics[] = [];
  private scheduled: Scheduled[] = [];
  private vecs: Vec[] = [];
  private parts: Part[] = [];
  private vecB!: Phaser.GameObjects.Graphics;
  private vecF!: Phaser.GameObjects.Graphics;
  private partG!: Phaser.GameObjects.Graphics;
  private lastList: ViewFighter[] = [];
  /** Swing arcs over sprite fighters, and the additive impact layers (sparks, flashes, streaks), on their own Graphics. */
  private arcs: Arc[] = [];
  private adds: Vec[] = [];
  /** The arcs' colour layers (normal blend: the hue survives over a bright stage) and their white-hot cores (additive). */
  private arcN!: Phaser.GameObjects.Graphics;
  private arcG!: Phaser.GameObjects.Graphics;
  private addG!: Phaser.GameObjects.Graphics;
  /** Scratch points for the arc polygons (reused every frame: no garbage). */
  private ptPool: { x: number; y: number }[] = Array.from({ length: 40 }, () => ({ x: 0, y: 0 }));
  private pts: { x: number; y: number }[] = [];
  /** Scratch for pixelCrescent: block -> tone (reused every frame). */
  private pixCells = new Map<number, number>();
  /** The rig's PixelFX swing effects (the only effects a hit-stop freezes; the hit sparks keep playing). */
  private swingFxs = new Set<FxSprite>();
  /** Screen shake: a vertical damped sine (peak as a fraction of the view height, seconds since it started, length). */
  private shakeA = 0;
  private shakeT = 0;
  private shakeDur = 0;
  /** The camera shot in progress (zoomTo), with its timing in seconds and the weight it started from. */
  private shot: { tgt: ZoomShot; t: number; inS: number; holdS: number; outS: number; w0: number } | null = null;
  /** The follow camera's horizontal frame centre (the dead zone keeps it still) and how long a closer zoom has been wanted. */
  private camFc = 640;
  private zoomInWait = 0;
  private camInit = false;
  /** K.O. slow motion: the visual time scale and the fighters' display lag behind real time (s). */
  private slowT = -1;
  private timeScale = 1;
  private dispLag = 0;
  private hist: { t: number; list: ViewFighter[] }[] = [];
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
    this.casts = [];
    this.arcs = [];
    this.adds = [];
    this.swingFxs.clear();
    this.shot = null;
    this.shakeA = 0;
    this.slowT = -1;
    this.timeScale = 1;
    this.dispLag = 0;
    this.hist = [];
    this.camInit = false;
  }

  preload() {
    // the relic weapons of Vault of Ages (BootScene loads the rest)
    for (const k of [...WEAPON_SPRITES, ...RELIC_SPRITES]) if (!this.textures.exists(k)) this.load.image(k, `assets/art/${k}.png`);
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
    this.camFc = arena.w / 2;
    this.camY = arena.floor - 200;
    this.vecB = this.add.graphics().setDepth(9);
    this.vecF = this.add.graphics().setDepth(16);
    this.partG = this.add.graphics().setDepth(17).setBlendMode(Phaser.BlendModes.ADD);
    this.arcN = this.add.graphics().setDepth(14.9);
    this.arcG = this.add.graphics().setDepth(15).setBlendMode(Phaser.BlendModes.ADD);
    this.addG = this.add.graphics().setDepth(27).setBlendMode(Phaser.BlendModes.ADD);
    this.events.once('shutdown', () => this.teardown());
    if (import.meta.env.DEV) (globalThis as unknown as { __gameScene: GameScene }).__gameScene = this; // (dev tooling: frame capture)
  }

  // ------------------------------------------------------------------ loop

  override update(_time: number, deltaMs: number) {
    const rdt = Math.min(0.1, deltaMs / 1000);
    // K.O. slow motion is visual only: the effects, particles and animation clock run slower (the sim does not)
    const dt = rdt * this.stepSlowmo(rdt);
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
    const shown = this.delayed(list, now);
    this.lastList = shown;
    const seen = new Set<number>();
    for (const v of shown) {
      seen.add(v.id);
      this.drawFighter(v, now, dt, shown);
    }
    for (const [id, fv] of this.views) if (!seen.has(id)) this.removeView(id, fv);

    // events (the primary's; same-device sessions get identical ones)
    for (const e of g.drainEvents(now)) this.onGameEvent(e, shown);
    // other local sessions: drain so their queues stay short
    for (const p of this.players) if (p.session.game && p.session.game !== g) p.session.game.drainEvents(now);

    this.drawProjectiles(g.projectiles(now), shown, dt);
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
      if (this.fx[i].dead) {
        this.swingFxs.delete(this.fx[i]);
        this.fx.splice(i, 1);
      }
    }
    paintLive(6);
    this.drawVecs(dt);
    this.drawArcs(dt, now);
    this.drawAdds(dt);
    this.drawParts(dt);
    this.updateCamera(shown, rdt);
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
    // the hero's sprite atlas (usually fetched already by the title screen, hero select or lobby); the rig draws a hero
    // that has none
    if (heroHasSprites(v.hero)) void loadHeroSprites(this, v.hero);
    else warmFighter(v.hero, v.weapons, v.skill);
    const img = this.add.image(v.x, v.y, canvas.key).setOrigin(canvas.originX, canvas.originY).setScale(canvas.worldScale).setDepth(10);
    const tag = this.add
      .text(v.x, v.y - 70, r?.name ?? '', { fontFamily: 'Lilita One, sans-serif', fontSize: '12px', color: '#' + color.toString(16).padStart(6, '0'), stroke: '#0b0814', strokeThickness: 3 })
      .setOrigin(0.5, 1)
      .setDepth(30);
    fv = {
      id: v.id, hero: v.hero, canvas, img, rigImg: img, sprite: null, tag, ghosts: [], ghostI: 0, ghostAt: 0, frozenT: 0, freezeUntil: 0, frozen: false, flashUntil: 0, lastSeq: -1, runPhase: 0,
      lastX: v.x, wasGround: true, landAt: -10, airAt: -10, status: {}, stunnedUntil: 0, koT: 0, color, shown: null,
      gfxB: this.add.graphics().setDepth(9), gfx: this.add.graphics().setDepth(11), hist: [], hound: null, veilOn: false,
      dodge: null, mount: null, dgfx: this.add.graphics().setDepth(8), lastY: v.y, runeAt: 0, flameAt: 0,
    };
    for (let i = 0; i < GHOSTS; i++) {
      const key = `ghost${v.id}_${i}`;
      if (this.textures.exists(key)) this.textures.remove(key);
      const tex = this.textures.createCanvas(key, canvas.tex.width, canvas.tex.height)!;
      tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
      // (additive: an after-image is a glow of the hero's trail colour, not a solid copy)
      const gimg = this.add.image(0, 0, key).setOrigin(canvas.originX, canvas.originY).setScale(canvas.worldScale).setDepth(9).setVisible(false).setTint(color).setBlendMode(Phaser.BlendModes.ADD);
      gimg.tintMode = Phaser.TintModes.FILL;
      fv.ghosts.push({ img: gimg, tex, life: 0, max: 0.22, a0: 0.5 });
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
    if (fv.mount) {
      fv.mount.img.destroy();
      fv.mount.tex.destroy();
    }
    fv.dgfx.destroy();
    if (this.textures.exists(fv.canvas.key)) this.textures.remove(fv.canvas.key);
    this.views.delete(id);
  }

  private drawFighter(v: ViewFighter, now: number, dt: number, list: ViewFighter[]) {
    const fv = this.viewFor(v);
    fv.shown = v;
    fv.dgfx.clear();
    // swing effects for moves this device predicted (yours) start now; others come with their 'swing' events
    // (not while the K.O. slow motion replays the recent past: those moves already started)
    if (this.dispLag <= 0) {
      if (v.self && v.act === Act.Attack && v.moveSeq !== fv.lastSeq) this.startSwing(v.id, v.weapons[v.slot], v.move, v.actTf);
      if (v.self) fv.lastSeq = v.moveSeq;
    }
    // hit-stop: the sim's own freeze when the snapshot carries it (the pose already holds), else the client's
    const simStop = hitstopOf(v);
    let t = v.actTf;
    if (simStop !== undefined) {
      fv.frozen = simStop > 0;
      fv.frozenT = v.actTf;
    } else {
      fv.frozen = now < fv.freezeUntil;
      if (fv.frozen) t = fv.frozenT;
      else fv.frozenT = v.actTf;
    }
    const speed = Math.abs(v.vx);
    if (v.ground && speed > 25) fv.runPhase += dt * (6 + speed / 28);
    if (v.ground && !fv.wasGround) fv.landAt = this.clock;
    if (!v.ground && fv.wasGround) fv.airAt = this.clock;
    const pose = poseFor({ ...v, actTf: t }, { time: this.clock, runPhase: fv.runPhase, land: this.clock - fv.landAt });
    const flash = now < fv.flashUntil ? 0.8 : v.invuln && v.act !== Act.Roll && Math.floor(this.clock * 12) % 2 ? 0.35 : 0;
    // (two frames of white, then the blow's colour)
    if (fv.sprite) fv.sprite.flashColor = now - (fv.flashAt ?? 0) < 34 || fv.flashColor === undefined ? 0xffffff : fv.flashColor;
    const tint = v.slowed ? 0xffffd2a8 : 0;
    // dodges (each hero's own, the Roll button): started by the Roll, followed while it runs; the special's flight too
    if (v.act === Act.Roll && !fv.dodge) this.startDodge(fv, v, now);
    if (fv.dodge) this.stepDodge(fv, v, now);
    this.specialDash(fv, v, now);
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
      // still downloading: keep the old rig hidden (it is a different-looking fighter) for as long as a slow phone needs;
      // a download that failed is asked for again (atlasStore paces the retries) and the rig stands in meanwhile
      const since = this.clock - (fv.createdAt ??= this.clock);
      const sprites = heroHasSprites(v.hero);
      if (sprites && !spritesPending(v.hero) && this.clock > (fv.retryAt ?? 0)) {
        fv.retryAt = this.clock + 2;
        void loadHeroSprites(this, v.hero);
      }
      fv.rigImg.setVisible(!sprites || (!spritesPending(v.hero) && since > 1) || since > 12);
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
      gh.max = 0.22;
      gh.a0 = 0.5;
    }
    for (const gh of fv.ghosts) {
      if (gh.life <= 0) continue;
      gh.life -= dt;
      gh.img.setAlpha(Math.max(0, gh.life / gh.max) * gh.a0);
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
    this.drawGatePortals(fv, v);
    this.drawGuard(fv, v);
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
    // a dodge's look (Shadow Sink sinks, Clay Shift melts, Fog Form drifts, Mirage shimmers)
    const look = this.dodgeLook(fv, v);
    alpha *= look.alpha;
    if (look.tint && !v.veil) fv.img.setTint(look.tint);
    fv.img.y += look.dy;
    fv.img.setAlpha(alpha);
    fv.tag.setAlpha(v.veil && !v.self ? 0.2 : 1);
    fv.lastX = v.x;
    fv.lastY = v.y;
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

  /** The crouch guard (every hero holds down to guard): a shimmering arc of the hero's energy in front of them. */
  private drawGuard(fv: FighterView, v: ViewFighter) {
    if (v.act !== Act.Free || !v.crouch || !v.ground) return;
    const c = heroEnergy(v.hero);
    const g = fv.gfxB;
    const cx = v.x + v.face * 10;
    const cy = v.y - 20;
    const a0 = v.face > 0 ? -1.15 : Math.PI - 1.15;
    const pulse = 0.55 + Math.sin(this.clock * 10) * 0.12;
    g.lineStyle(6, c.rim, pulse * 0.5).beginPath().arc(cx, cy, 26, a0, a0 + 2.3).strokePath();
    g.lineStyle(2.5, c.arc, pulse).beginPath().arc(cx, cy, 26, a0, a0 + 2.3).strokePath();
    g.lineStyle(1, 0xffffff, pulse * 0.8).beginPath().arc(cx, cy, 23, a0 + 0.3, a0 + 2.0).strokePath();
  }

  /**
   * The Gate charging: one golden portal opens behind Gilgamesh for each blade the held volley will fire (2 up to 9, the
   * same count and spots as World.spawnFrom), so the player sees the volley grow.
   */
  private drawGatePortals(fv: FighterView, v: ViewFighter) {
    const w = v.weapons[v.slot];
    const c = WEAPONS[w]?.charged;
    if (v.act !== Act.Charge || w !== WeaponId.Gate || !c) return;
    const k = Math.max(0, Math.min(1, (v.charge - c.min) / Math.max(1, c.max - c.min)));
    const n = v.charge < c.min ? 1 : 2 + Math.round(7 * k);
    const g = fv.gfxB;
    for (let i = 0; i < n; i++) {
      const [px, py] = gatePortal(i, v.x, v.y, v.face);
      const r = 9 + Math.sin(this.clock * 9 + i) * 1.2;
      g.fillStyle(0x2a1606, 0.55).fillEllipse(px, py, r * 1.1, r * 2.1);
      g.lineStyle(2.5, 0xffd060, 0.95).strokeEllipse(px, py, r * 1.1, r * 2.1);
      g.lineStyle(1, 0xfff4c0, 0.8).strokeEllipse(px, py, r * 0.6, r * 1.4);
    }
    if (k >= 1 && Math.random() < 0.5) this.spark(v.x - v.face * 40 + (Math.random() - 0.5) * 60, v.y - 70 + (Math.random() - 0.5) * 50, 0, -30, 0.4, 0xffe08a, 2, 0);
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

  /** Pale Horse (the NightHunt Art): Death's pale horse rises from her shadow, carries her onto the opponent and slams down. */
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
      const tex = new PixelTex(this, `palehorse${v.id}`, 46, 34);
      const img = this.add.image(v.x, v.y, tex.key).setScale(2.6).setDepth(8).setAlpha(0.94);
      fv.hound = { tex, img, step: -1 };
    }
    const h = fv.hound;
    const t = v.actTf;
    const pose = t < 12 ? 0 : t < 30 ? 1 : 2;
    const step = Math.floor(this.clock * 15) * 3 + pose;
    if (step !== h.step) {
      h.step = step;
      // the gallop on the leap, the legs still while it falls onto the target
      paintHorse(h.tex, pose === 1 ? Math.floor(this.clock * 4) / 4 : this.clock, PALE_HORSE);
    }
    h.img.setPosition(v.x - v.face * 6, v.y - 40 + (pose === 2 ? 6 : 0)).setFlipX(v.face < 0).setRotation(pose === 0 ? -v.face * 0.25 : pose === 1 ? v.face * 0.15 : 0);
  }

  /** Swing effect lined up with the move's first hitting tick (`actT` ticks already elapsed). */
  private startSwing(id: number, weapon: number, move: number, actT: number) {
    const m = moveOf(weapon, move);
    if (!m) return;
    const sw = swingFx(weapon, move);
    const delay = Math.max(0, (m.startup - actT) * STEP_MS);
    const lw = lookWeapon(weapon);
    sfx.play('swing', { pitch: lw === WeaponId.Daggers ? 1.4 : lw === WeaponId.Hammer ? 0.7 : weapon === WeaponId.Chains ? 0.85 : weapon === WeaponId.Kopis ? 1.15 : 1 });
    const fire = () => {
      const fv = this.views.get(id);
      const v = fv?.shown;
      if (!fv || !v || v.act !== Act.Attack) return;
      if (fv.sprite) {
        // a sprite fighter: a crisp additive arc in the hero's energy colour over the painted frame (thinner and brighter
        // than the painted trail, so the two read as one swing rather than doubling up)
        const sh = arcFor(weapon, move);
        if (sh) this.spawnArc(v, sh);
      } else if (sw) {
        this.swingFxs.add(this.addFx(sw.mod, v.x, v.y, v.face < 0, sw.rate, sw.opts));
      }
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

  // ------------------------------------------------------------------ combat feedback: arcs, sparks, slow motion

  /** A swing arc over a sprite fighter (the oldest gives way past the cap). */
  private spawnArc(v: ViewFighter, shape: ArcShape) {
    if (this.arcs.length >= MAX_ARCS) this.arcs.shift();
    const c = energyForMove(v.hero, v.move, WEAPONS[v.weapons[v.slot]]?.combo.length ?? 3);
    this.arcs.push({ owner: v.id, shape, face: v.face, x: v.x, y: v.y, age: 0, c, sparkAt: 0, seed: (Math.random() * 0x7fffffff) | 0 });
    // the blow's colour, remembered for its victim's flash and the light it throws on the floor
    const fv = this.views.get(v.id);
    if (fv) {
      fv.blowColor = c.arc;
      fv.blowAt = performance.now();
    }
  }

  /** The arcs: each sweeps, holds through its owner's hit-stop (the strike freezes with the bodies), then closes and fades. */
  private drawArcs(dt: number, now: number) {
    const g = this.arcG;
    g.clear();
    this.arcN.clear();
    for (let i = this.arcs.length - 1; i >= 0; i--) {
      const a = this.arcs[i];
      const fv = this.views.get(a.owner);
      const v = fv?.shown;
      if (!fv || !v) {
        this.arcs.splice(i, 1);
        continue;
      }
      if (!fv.frozen) a.age += dt;
      if (a.age >= a.shape.life) {
        this.arcs.splice(i, 1);
        continue;
      }
      // the arc rides the body through the swing's step (a hit or a dodge leaves it where it was)
      if (v.act === Act.Attack) {
        a.x = v.x;
        a.y = v.y;
      }
      this.paintArc(g, a, now);
    }
  }

  private paintArc(g: Phaser.GameObjects.Graphics, a: Arc, now: number) {
    const s = a.shape;
    const f = a.face;
    const p = Math.min(1, a.age / s.dur);
    // after the sweep the tail closes in on the head and everything thins and fades
    const q = Math.max(0, (a.age - s.dur) / Math.max(0.01, s.life - s.dur));
    const alpha = Math.min(1, a.age / 0.03 + 0.35) * (1 - q * q);
    const thin = 1 - q * 0.55;
    const cx = a.x + f * s.cx;
    const cy = a.y - s.cy;
    if (s.kind === 'chain') {
      // a lash of links: the head races out along a whip curve that straightens as it lands, then the chain falls slack
      const tip = s.r * easeOut3(p);
      const slack = 1 - p;
      const N = 14;
      let px = cx;
      let py = cy;
      for (let i = 1; i <= N; i++) {
        const u = i / N;
        const x = cx + f * tip * u;
        const y = cy + Math.sin(u * Math.PI * 2.2 + a.age * 30) * (6 + 10 * slack) * u * (1 - u * 0.4) + q * 14 * u * u;
        this.arcN.lineStyle(s.w * 1.7 * thin, a.c.rim, 0.45 * alpha).lineBetween(px, py, x, y);
        this.arcN.lineStyle(s.w * 0.8 * thin, a.c.arc, 0.9 * alpha).lineBetween(px, py, x, y);
        g.fillStyle(0xffffff, 0.7 * alpha).fillCircle(x, y, Math.max(1, s.w * 0.28));
        px = x;
        py = y;
      }
      // the spearhead on the end
      g.fillStyle(a.c.arc, alpha).fillTriangle(px, py - s.w * 0.8, px, py + s.w * 0.8, px + f * s.w * 2.4, py);
      if (s.heavy && p < 1 && now - a.sparkAt > 20) {
        a.sparkAt = now;
        this.spark(px, py, -f * (60 + Math.random() * 80), (Math.random() - 0.5) * 120, 0.3, a.c.arc, 2, 200);
      }
      return;
    }
    if (s.kind === 'rake') {
      // three claw cuts side by side, each a little shorter and fainter (a beast's raking hand)
      const head = s.a0 + (s.a1 - s.a0) * easeOut3(p);
      const tail = s.a0 + (head - s.a0) * Math.min(1, q * q * 0.95);
      for (let k = 0; k < 3; k++) {
        const r = s.r - k * s.w * 1.15;
        const al = alpha * (1 - k * 0.18);
        this.crescent(this.arcN, cx, cy, r + 2, s.sy, f, tail, head, s.w * 1.5 * thin, a.c.rim, 0.42 * al);
        this.crescent(this.arcN, cx, cy, r, s.sy, f, tail, head, s.w * 0.75 * thin, a.c.arc, 0.9 * al);
        this.crescent(g, cx, cy, r - 0.5, s.sy, f, tail, head, s.w * 0.3 * thin, 0xffffff, al);
      }
      return;
    }
    if (s.kind === 'thrust') {
      const r0 = s.r0 ?? 0;
      const tip = r0 + (s.r - r0) * easeOut3(p);
      const base = r0 + (tip - r0) * q * 0.85;
      const tx = cx + f * tip;
      const bx = cx + f * base;
      const streak = (gg: Phaser.GameObjects.Graphics, w: number, color: number, al: number) => {
        const mx = bx + (tx - bx) * 0.72;
        gg.fillStyle(color, al);
        gg.fillTriangle(bx, cy, mx, cy - w / 2, tx, cy);
        gg.fillTriangle(bx, cy, mx, cy + w / 2, tx, cy);
      };
      streak(this.arcN, s.w * 2 * thin, a.c.rim, 0.45 * alpha);
      streak(this.arcN, s.w * thin, a.c.arc, 0.85 * alpha);
      streak(g, s.w * 0.36 * thin, 0xffffff, alpha);
      // speed lines above and below the shaft
      g.lineStyle(1.2, a.c.arc, 0.55 * alpha);
      g.lineBetween(bx + f * 10, cy - s.w * 1.3, tx - f * 18, cy - s.w * 1.3);
      g.lineBetween(bx + f * 22, cy + s.w * 1.2, tx - f * 8, cy + s.w * 1.2);
      if (s.heavy && p < 1) g.fillStyle(0xffffff, alpha).fillCircle(tx, cy, s.w * 0.6);
      return;
    }
    const head = s.a0 + (s.a1 - s.a0) * easeOut3(p);
    const tail = s.a0 + (head - s.a0) * Math.min(1, q * q * 0.95);
    const layers = (mirror: number) => {
      const t0 = tail * mirror;
      const h0 = head * mirror;
      // a soft additive bloom behind, then the crescent itself drawn in solid pixel blocks: dark rim outside, the blow's
      // colour, a hot band and a white-hot inner edge (the owner's reference clip); it breaks into dashes as it fades
      this.crescent(g, cx, cy, s.r + 4, s.sy, f, t0, h0, s.w * 2.4 * thin, a.c.arc, (s.heavy ? 0.3 : 0.2) * alpha);
      this.pixelCrescent(this.arcN, cx, cy, s.r, s.sy, f, t0, h0, s.w * (s.heavy ? 1.75 : 1.55) * thin, a.c, alpha, q, a.seed);
    };
    layers(1);
    if (s.cross) layers(-1);
    // the head: a white-hot point while it sweeps, and sparks flung off it on the heavies
    if (p < 1) {
      const hr = (head * Math.PI) / 180;
      const hx = cx + f * Math.cos(hr) * s.r;
      const hy = cy + Math.sin(hr) * s.r * s.sy;
      g.fillStyle(0xffffff, 0.9 * alpha).fillCircle(hx, hy, s.w * 0.22);
      if (s.heavy && now - a.sparkAt > 16) {
        a.sparkAt = now;
        const dir = s.a1 > s.a0 ? 1 : -1;
        const tx = -Math.sin(hr) * dir * f;
        const ty = Math.cos(hr) * dir;
        for (let k = 0; k < 2; k++) {
          this.spark(hx, hy, tx * (120 + Math.random() * 160) + (Math.random() - 0.5) * 60, ty * (120 + Math.random() * 160) - 40, 0.3, k ? 0xffffff : a.c.arc, 2, 300);
        }
      }
    }
  }

  /**
   * A crescent swept round (cx, cy) from angle aT (tail) to aH (head), degrees for a right-facing swing (f mirrors it):
   * the outer edge on radius r, the inner edge `w` in at its widest, thickest just ahead of the middle, tapering to points.
   */
  private crescent(g: Phaser.GameObjects.Graphics, cx: number, cy: number, r: number, sy: number, f: number, aT: number, aH: number, w: number, color: number, alpha: number) {
    if (alpha <= 0.01 || w <= 0.2 || Math.abs(aH - aT) < 1) return;
    const N = 18;
    const P = this.pts;
    P.length = 0;
    for (let i = 0; i < 2 * N + 2; i++) P.push(this.ptPool[i]);
    for (let i = 0; i <= N; i++) {
      const u = i / N;
      const ang = ((aT + (aH - aT) * u) * Math.PI) / 180;
      const c = Math.cos(ang) * f;
      const sn = Math.sin(ang);
      const wd = w * Math.pow(Math.sin(Math.PI * (0.03 + u * 0.94)), 0.7) * (0.3 + 0.7 * u);
      const o = P[i];
      o.x = cx + c * r;
      o.y = cy + sn * r * sy;
      const n = P[2 * N + 1 - i];
      n.x = cx + c * (r - wd);
      n.y = cy + sn * (r - wd) * sy;
    }
    g.fillStyle(color, alpha);
    g.fillPoints(P as Phaser.Math.Vector2[], true);
  }

  /**
   * A crescent in solid pixel blocks (PIX world units square), like a hand-drawn sprite effect rather than a smooth vector
   * stroke: the band is cut into four tones by depth (dark rim on the outside, the blow's colour, a hot band, a white-hot
   * inner edge). `q` (0..1) is the fade: blocks drop out by a fixed hash, so the tail breaks into dashes and motes.
   */
  private pixelCrescent(g: Phaser.GameObjects.Graphics, cx: number, cy: number, r: number, sy: number, f: number, aT: number, aH: number, w: number, c: HeroEnergy, alpha: number, q: number, seed: number) {
    if (alpha <= 0.02 || w <= 0.5 || Math.abs(aH - aT) < 1) return;
    const PIX = 2;
    const cells = this.pixCells;
    cells.clear();
    const span = ((aH - aT) * Math.PI) / 180;
    const steps = Math.min(220, Math.ceil((Math.abs(span) * r) / (PIX * 0.55)));
    for (let i = 0; i <= steps; i++) {
      const u = i / steps;
      const ang = (aT * Math.PI) / 180 + span * u;
      const co = Math.cos(ang) * f;
      const sn = Math.sin(ang);
      // thickest just ahead of the middle, a point at both ends (the head is blunter than the tail)
      const wd = w * Math.pow(Math.sin(Math.PI * (0.03 + u * 0.94)), 0.7) * (0.3 + 0.7 * u);
      const n = Math.max(1, Math.ceil(wd / (PIX * 0.55)));
      for (let k = 0; k <= n; k++) {
        const d = (k / n) * wd;
        const ix = Math.floor((cx + co * (r - d)) / PIX);
        const iy = Math.floor((cy + sn * (r - d) * sy) / PIX);
        const depth = k / n;
        const tone = depth < 0.2 ? 0 : depth < 0.55 ? 1 : depth < 0.82 ? 2 : 3;
        // (block coordinates packed into one number: both are well inside +-4096 blocks)
        const key = (ix + 4096) * 8192 + (iy + 4096);
        const was = cells.get(key);
        if (was === undefined || tone > (was & 7)) cells.set(key, tone + (u < 0.5 ? 8 : 0));
      }
    }
    const tones = [shadeColor(c.rim, 0.7), c.arc, whiten(c.arc, 0.45), 0xffffff];
    for (let t = 0; t < 4; t++) {
      g.fillStyle(tones[t], alpha);
      for (const [key, v] of cells) {
        if ((v & 7) !== t) continue;
        const ix = Math.floor(key / 8192) - 4096;
        const iy = (key % 8192) - 4096;
        if (q > 0) {
          // the fade: a fixed per-block hash drops blocks out, sooner along the tail (the half nearer the start)
          const h = ((ix * 73856093) ^ (iy * 19349663) ^ seed) >>> 0;
          if ((h % 1000) / 1000 < q * (v & 8 ? 1.5 : 1.1)) continue;
        }
        g.fillRect(ix * PIX, iy * PIX, PIX, PIX);
      }
    }
  }

  /**
   * A pool of the blow's colour thrown on the floor under a hit (the reference clip lights the flagstones orange, red or
   * green round every strike): a flat ellipse on the ground line that flares and fades.
   */
  private floorLight(x: number, floorY: number, color: number, k: number, hold: number) {
    const life = Math.max(0.28, hold + 0.18);
    this.addAdd(life, (g, p) => {
      const a = p < 0.15 ? p / 0.15 : 1 - (p - 0.15) / 0.85;
      const rx = 92 * k * (0.85 + 0.3 * p);
      const ry = 16 * k * (0.85 + 0.3 * p);
      g.fillStyle(color, 0.16 * a).fillEllipse(x, floorY - 2, rx * 2.2, ry * 2.4);
      g.fillStyle(color, 0.28 * a).fillEllipse(x, floorY - 2, rx * 1.3, ry * 1.5);
      g.fillStyle(whiten(color, 0.5), 0.3 * a).fillEllipse(x, floorY - 2, rx * 0.6, ry * 0.7);
    });
  }

  /**
   * The Sun Crescent in flight: a tall crescent of gold light opening toward its target, grown out of the swing over its
   * first frames, with two fading after-images behind it and motes shed off the tail; it dims over its last frames.
   */
  private drawSunCrescent(pv: ProjView, p: NetProjectile) {
    const g = pv.gfx!;
    const add = pv.sun!;
    g.clear();
    add.clear();
    const f = pv.face;
    const life = CRESCENT.life / TICK_RATE;
    const grow = Math.min(1, 0.55 + pv.age / 0.08);
    const fade = pv.age < life - 0.1 ? 1 : Math.max(0, (life - pv.age) / 0.1);
    pv.hist.push({ x: p.x, y: p.y });
    if (pv.hist.length > 7) pv.hist.shift();
    const R = 38 * grow;
    const W = 15 * grow;
    const draw = (x: number, y: number, a: number, k: number) => {
      // (its centre sits behind the leading edge, so the crescent's points reach back past it)
      const cx = x - f * R * 0.55;
      this.crescent(g, cx, y, R + 3, 1, f, 78, -78, W * 1.7 * k, 0xd8901a, 0.45 * a);
      this.crescent(g, cx, y, R, 1, f, 74, -74, W * k, 0xffd86a, 0.9 * a);
      this.crescent(add, cx, y, R, 1, f, 74, -74, W * 0.65 * k, 0xffe8a0, 0.5 * a);
      this.crescent(add, cx, y, R - 0.5, 1, f, 70, -70, W * 0.32 * k, 0xffffff, a);
    };
    const h = pv.hist;
    // after-images: where it was 2 and 4 frames ago, thinner and fainter
    if (h.length > 5) draw(h[h.length - 6].x, h[h.length - 6].y, 0.22 * fade, 0.7);
    if (h.length > 3) draw(h[h.length - 4].x, h[h.length - 4].y, 0.4 * fade, 0.85);
    draw(p.x, p.y, fade, 1);
    // the leading edge's glint and motes shed off the tips
    add.fillStyle(0xffffff, 0.8 * fade).fillCircle(p.x - f * 2, p.y, 3.2 * grow);
    if (fade > 0.3 && Math.random() < 0.8) {
      const tip = Math.random() < 0.5 ? -1 : 1;
      this.spark(p.x - f * R * 0.75, p.y + tip * R * 0.8, -f * (30 + Math.random() * 60), tip * (20 + Math.random() * 40), 0.35, Math.random() < 0.3 ? 0xffffff : 0xffd86a, 2, 0);
    }
  }

  /** An additive drawing that lives `life` seconds (a spark's layers), drawn above the fighters and the effects. */
  private addAdd(life: number, draw: Vec['draw']) {
    if (this.adds.length >= MAX_ADDS) this.adds.shift();
    this.adds.push({ age: 0, life, back: false, draw });
  }

  private drawAdds(dt: number) {
    const g = this.addG;
    g.clear();
    for (let i = this.adds.length - 1; i >= 0; i--) {
      const v = this.adds[i];
      v.age += dt;
      if (v.age >= v.life) {
        this.adds.splice(i, 1);
        continue;
      }
      v.draw(g, v.age / v.life);
    }
  }

  /** A jagged star: rays of the given lengths (radius multipliers) round (x, y), filled. */
  private star(g: Phaser.GameObjects.Graphics, x: number, y: number, R: number, r: number, rot: number, lens: number[], color: number, alpha: number) {
    const n = lens.length;
    const P = this.pts;
    P.length = 0;
    for (let i = 0; i < 2 * n; i++) P.push(this.ptPool[i]);
    for (let i = 0; i < n; i++) {
      const a = rot + (i / n) * Math.PI * 2;
      const b = a + Math.PI / n;
      P[2 * i].x = x + Math.cos(a) * R * lens[i];
      P[2 * i].y = y + Math.sin(a) * R * lens[i];
      P[2 * i + 1].x = x + Math.cos(b) * r;
      P[2 * i + 1].y = y + Math.sin(b) * r;
    }
    g.fillStyle(color, alpha);
    g.fillPoints(P as Phaser.Math.Vector2[], true);
  }

  /** A tapered blade of light from (x0, y0) to (x1, y1), `w` wide just behind its middle (streaks, the X slash). */
  private sliver(g: Phaser.GameObjects.Graphics, x0: number, y0: number, x1: number, y1: number, w: number, color: number, alpha: number) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const L = Math.hypot(dx, dy) || 1;
    const nx = (-dy / L) * w * 0.5;
    const ny = (dx / L) * w * 0.5;
    const mx = x0 + dx * 0.45;
    const my = y0 + dy * 0.45;
    g.fillStyle(color, alpha);
    g.fillTriangle(x0, y0, mx + nx, my + ny, x1, y1);
    g.fillTriangle(x0, y0, mx - nx, my - ny, x1, y1);
  }

  /**
   * A layered hit spark at the contact point: a white core flash (two frames), a jagged starburst in the attacker's spark
   * colour, directional streaks along the blow, and particles. `str` scales it (light ~0.8, heavy ~1.5); heavies and crits
   * add a long white streak through the victim and an X slash. None of it freezes in hit-stop.
   */
  /**
   * The hit spark, drawn like a fighting game's (MUGEN reference, docs/feel/mugen-reference.md): an OPAQUE starburst in
   * the attacker's colour with a dark rim and a white-hot core, about half a body across (bigger for heavier blows),
   * that grows in two frames, holds through the whole hit-stop and breaks up as it ends. Its jagged rays are redrawn
   * every two frames like a hand-drawn spark's flipbook. A soft additive bloom sits behind it, speed lines fly out
   * along the blow, and heavies add the white streak through the victim, an X slash and a smoky burst of the
   * attacker's energy around the contact. `hold` is the freeze in seconds.
   */
  private impact(x: number, y: number, dir: number, str: number, c: HeroEnergy, heavy: boolean, crit: boolean, hold = 0.13) {
    const R = BODY_H * 0.36 * str;
    const big = heavy || crit;
    // saturated like a sprite spark: whichever of the hero's arc and spark colours is the more saturated is the body
    // (Jack's steel arc would make a grey spark; his red cut does not), a dark rim of it, a pale hot middle
    const body = saturation(c.arc) >= saturation(c.spark) ? c.arc : c.spark;
    const rim = shade(body === c.arc ? c.rim : c.spark, 0.45);
    const mid = body;
    const hot = mixWhite(body === c.arc ? c.spark : c.arc, 0.4);
    const life = Phaser.Math.Clamp(hold + 0.1, 0.18, 0.38);
    const n = crit ? 12 : big ? 10 : 8;
    const rot0 = dir > 0 ? -0.1 : Math.PI + 0.1;
    // five drawings of the spark: each its own jagged outline (the long ray always along the blow)
    const drawings = Array.from({ length: 5 }, (_, d) => ({
      rot: rot0 + (Math.random() - 0.5) * 0.35,
      lens: Array.from({ length: n }, (_, i) => (i === 0 ? 1.5 : 0.45 + Math.random() * 0.6) * (d === 4 ? 0.85 : 1)),
    }));
    // the bloom behind it
    this.addAdd(life * 0.8, (g, p) => {
      const a = 1 - p;
      g.fillStyle(mid, 0.18 * a).fillCircle(x, y, R * (1.1 + 0.3 * p));
      g.fillStyle(0xffffff, 0.3 * a * a).fillCircle(x, y, R * 0.4);
    });
    this.addVec(life, (g, p) => {
      const t = p * life;
      // a new drawing every two frames (33 ms), the last one held as it breaks up
      const d = Math.min(4, Math.floor(t / 0.033));
      const dr = drawings[d];
      const size = d === 0 ? 0.5 : d === 1 ? 0.88 : 1 + 0.06 * Math.sin(t * 40);
      const fade = p < 0.7 ? 1 : 1 - (p - 0.7) / 0.3;
      const thin = p < 0.7 ? 1 : 1 - (p - 0.7) / 0.6;
      this.star(g, x, y, R * 1.12 * size, R * 0.36 * size * thin + 1, dr.rot, dr.lens, rim, 0.95 * fade);
      this.star(g, x, y, R * 0.98 * size, R * 0.3 * size * thin + 0.8, dr.rot, dr.lens, mid, fade);
      this.star(g, x, y, R * 0.64 * size, R * 0.22 * size * thin + 0.5, dr.rot + 0.2, dr.lens, hot, fade);
      g.fillStyle(0xffffff, fade).fillCircle(x, y, R * 0.24 * size);
    });
    // speed lines out of the contact, along the blow
    const k = big ? 6 : 4;
    const streaks = Array.from({ length: k }, () => ({ a: (dir > 0 ? 0 : Math.PI) + (Math.random() - 0.5) * 0.9, L: R * (2 + Math.random() * 1.6), w: 2 + Math.random() * 2.5 }));
    this.addAdd(0.14, (g, p) => {
      for (const st of streaks) {
        const cs = Math.cos(st.a);
        const sn = Math.sin(st.a);
        const d0 = st.L * (0.2 + 0.6 * p);
        const d1 = st.L * (0.5 + 0.5 * easeOut3(p));
        this.sliver(g, x + cs * d0, y + sn * d0, x + cs * d1, y + sn * d1, st.w * (1 - p) + 0.6, 0xffffff, 0.95 * (1 - p));
      }
    });
    if (big) {
      // a long white line through the victim (two frames), and the X slash with a dark edge
      const tilt = (Math.random() - 0.5) * 0.3;
      this.addAdd(0.09, (g, p) => {
        const L = R * 3.8;
        this.sliver(g, x - dir * L, y - tilt * L, x + dir * L, y + tilt * L, 8 * (1 - p) + 1, 0xffffff, 1 - p);
      });
      this.addVec(0.22, (g, p) => {
        const L = R * 1.7 * easeOut3(Math.min(1, p * 3));
        const a = 1 - p * p;
        for (const sg of [1, -1]) {
          this.sliver(g, x - L, y - sg * L, x + L, y + sg * L, 11 * (1 - p * 0.6), rim, 0.9 * a);
          this.sliver(g, x - L, y - sg * L, x + L, y + sg * L, 7 * (1 - p * 0.6), mid, a);
          this.sliver(g, x - L, y - sg * L, x + L, y + sg * L, 2.5 * (1 - p * 0.6), 0xffffff, a);
        }
      });
      // the attacker's energy bursting round the contact: dark smoky blobs with a coloured edge, flung out and fading
      const blobs = Array.from({ length: 7 }, () => ({ a: Math.random() * Math.PI * 2, d: R * (0.5 + Math.random() * 0.9), r: R * (0.35 + Math.random() * 0.3) }));
      this.addVec(0.38, (g, p) => {
        const a = (1 - p) * (1 - p);
        const out = easeOut3(p);
        for (const b of blobs) {
          const bx = x + Math.cos(b.a) * b.d * (0.6 + out);
          const by = y + Math.sin(b.a) * b.d * (0.6 + out) * 0.8;
          const r = b.r * (0.7 + 0.6 * out);
          g.fillStyle(mid, 0.55 * a).fillCircle(bx, by, r * 1.18);
          g.fillStyle(rim, 0.85 * a).fillCircle(bx, by, r);
        }
      });
    }
    // particles, thrown along the blow
    const np = big ? 10 : 6;
    for (let i = 0; i < np; i++) {
      this.spark(x, y, dir * (90 + Math.random() * 280) + (Math.random() - 0.5) * 100, -40 - Math.random() * 220, 0.22 + Math.random() * 0.24, Math.random() < 0.5 ? mid : 0xffffff, 2 + Math.random() * 1.5, 520);
    }
  }

  /** A guarded blow: a steel-blue half-ring flash facing the attacker, a small white pop and sparks glancing back. */
  private blockSpark(x: number, y: number, dir: number) {
    const R = BODY_H * 0.3;
    // `dir` points from the attacker to the defender: the guard faces back along -dir
    const a0 = dir > 0 ? 180 : 0;
    const gx = x - dir * R * 0.2;
    this.addAdd(0.18, (g, p) => {
      const rr = R * (0.8 + 0.6 * easeOut3(p));
      const a = 1 - p;
      this.crescent(g, gx, y, rr, 1.25, 1, a0 - 75, a0 + 75, 6 * a + 1, 0x7ac8ff, 0.8 * a);
      this.crescent(g, gx, y, rr - 1, 1.25, 1, a0 - 60, a0 + 60, 2.5 * a + 0.5, 0xffffff, a);
    });
    this.addAdd(0.06, (g, p) => g.fillStyle(0xd8f0ff, 0.9 * (1 - p)).fillCircle(x, y, R * 0.5 * (0.8 + p)));
    for (let i = 0; i < 6; i++) this.spark(x, y, -dir * (60 + Math.random() * 160), -60 - Math.random() * 140, 0.28 + Math.random() * 0.15, Math.random() < 0.5 ? 0x9ad8ff : 0xffffff, 2, 600);
  }

  /** K.O. slow motion: 0.25x for 0.4 s, then back to 1x over 0.15 s. Returns this frame's visual time scale. */
  private stepSlowmo(rdt: number): number {
    if (this.slowT < 0) {
      this.timeScale = 1;
    } else {
      this.slowT += rdt;
      const t = this.slowT;
      this.timeScale = t < 0.4 ? 0.25 : t < 0.55 ? 0.25 + ((t - 0.4) / 0.15) * 0.75 : 1;
      if (t >= 0.55) this.slowT = -1;
    }
    // the fighters run behind real time while slowed, then slip back to it (a gentle 1.25x catch-up)
    this.dispLag = Math.max(0, this.dispLag + rdt * (1 - this.timeScale) - (this.timeScale >= 1 ? rdt * 0.25 : 0));
    return this.timeScale;
  }

  /** The fighters to draw: as they are, or (in the K.O. slow motion) as they were `dispLag` seconds ago, interpolated. */
  private delayed(list: ViewFighter[], now: number): ViewFighter[] {
    const h = this.hist;
    if (this.dispLag > 0 || this.slowT >= 0) h.push({ t: now, list: list.map((v) => ({ ...v })) });
    else if (h.length) h.length = 0;
    while (h.length > 2 && now - h[0].t > 1500) h.shift();
    if (this.dispLag <= 0 || h.length < 2) return list;
    const at = now - this.dispLag * 1000;
    let i = h.length - 1;
    while (i > 0 && h[i - 1].t > at) i--;
    const b = h[i];
    const a = h[Math.max(0, i - 1)];
    const k = b.t > a.t ? Phaser.Math.Clamp((at - a.t) / (b.t - a.t), 0, 1) : 1;
    return a.list.map((va) => {
      const vb = b.list.find((q) => q.id === va.id);
      if (!vb) return va;
      return { ...va, x: va.x + (vb.x - va.x) * k, y: va.y + (vb.y - va.y) * k, actTf: va.act === vb.act ? va.actTf + (vb.actTf - va.actTf) * k : va.actTf };
    });
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
          // the spark, in the attacker's energy colour, sized by the blow (drawn here, not a stock effect: the stock hit
          // effects' grey disc and ring washed the contact out)
          const dir = a ? (e.x >= a.x ? 1 : -1) : v ? -v.face : 1;
          const str = Phaser.Math.Clamp(0.6 + e.amt / 180, 0.75, 1.6) * (e.crit ? 1.25 : 1);
          const hsTicks = (e as { hs?: number }).hs;
          this.impact(e.x, e.y, dir, str, heroEnergy(a?.hero ?? 0), heavy, e.crit, typeof hsTicks === 'number' ? hsTicks / TICK_RATE : 0.13);
          // a big Art's first connect gets its beat (zoom, speed-line takeover); a no-op otherwise
          superConnect(this, { attackerId: e.a, x: e.x, y: e.y });
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
          // hit-stop: the sim freezes both bodies once its snapshot carries `hitstop`; until then the client holds the poses
          // (the event's `hs` is the sim's freeze in ticks, when the sim has hit-stop)
          const simStop = hitstopOf(v);
          const evHs = (e as { hs?: number }).hs;
          const stop = simStop !== undefined ? Math.max(simStop, hitstopOf(a) ?? 0) / TICK_RATE : typeof evHs === 'number' ? evHs / TICK_RATE : Math.min(0.16, 0.05 + e.amt / 1600);
          if (simStop === undefined) {
            for (const id of [e.a, e.v]) {
              const fv = this.views.get(id);
              if (fv) fv.freezeUntil = performance.now() + stop * 1000;
            }
          }
          // only the swing trails freeze with the bodies; the hit sparks keep playing through the stop
          for (const f of this.swingFxs) f.freeze = Math.max(f.freeze, stop);
          // shake by the blow: light ~0.3, medium ~0.45, heavy ~0.8 (peak ~2.4% of the view height), crits harder
          const wdef = WEAPONS[e.w];
          const wShake = wdef ? Math.max(...wdef.combo.map((m) => m.shake ?? 0)) : 0;
          this.shake(Phaser.Math.Clamp(0.2 + e.amt / 300 + wShake * 0.3, 0.25, 0.85), e.crit ? 0.2 : 0);
          sfx.play(heavy ? 'impact' : 'hit', { x: e.x, y: e.y, pitch: e.crit ? 1.2 : 1 });
          if (isLocal(e.v)) navigator.vibrate?.(e.amt > 120 ? 40 : 18);
        }
        const fv = this.views.get(e.v);
        if (fv && !burn) {
          // the victim flashes white, then turns the blow's colour for the rest of the freeze (the owner's reference clip:
          // the whole body goes flat orange, red or green with the slash that hit it)
          const av = this.views.get(e.a);
          const col = av?.blowColor !== undefined && performance.now() - (av.blowAt ?? 0) < 700 ? av.blowColor : heroEnergy(a?.hero ?? 0).arc;
          const hs = (e as { hs?: number }).hs;
          const hold = Phaser.Math.Clamp((typeof hs === 'number' ? hs / TICK_RATE : 0.1) * 1000, 70, 220);
          fv.flashAt = performance.now();
          fv.flashUntil = fv.flashAt + hold;
          fv.flashColor = col;
          if (v) this.floorLight(e.x, v.y, col, heavy || e.crit ? 1.35 : 1, hold / 1000);
        }
        // (no damage numbers: the owner had them removed; the health bars and the combo counter tell the story)
        break;
      }
      case 'block': {
        const v = find(e.v);
        const a = find(e.a);
        if (v) this.addFx(FX.shieldBlock, v.x, v.y, a ? a.x < v.x : v.face < 0, 1.4);
        this.blockSpark(e.x, e.y, a ? (e.x >= a.x ? 1 : -1) : v ? -v.face : 1);
        sfx.play('shieldHit', { x: e.x, y: e.y });
        this.shake(0.15);
        break;
      }
      case 'parry': {
        {
          // the word over the defender: PARRY! for a guard timed just right, CUT! for a shot cut down by a swing
          const d = find(e.a);
          if (d) this.addFx(FX.critWord, d.x, d.y - FIGHTER.h - 16, false, 1.1, { text: d.act === Act.Attack ? 'CUT!' : 'PARRY!', label: '' }, 31, 32, 0.45);
        }
        if (e.v === 255) {
          // a shot cut out of the air or parried back: a bright clang and sparks, nobody staggers
          this.addAdd(0.2, (g, p) => {
            g.lineStyle(3 * (1 - p) + 1, 0xffffff, 1 - p);
            g.strokeCircle(e.x, e.y, 6 + 26 * easeOut3(p));
          });
          for (let i = 0; i < 8; i++) this.spark(e.x, e.y, (Math.random() - 0.5) * 260, -60 - Math.random() * 160, 0.35, Math.random() < 0.5 ? 0xffffff : 0xbfe8ff, 2, 260);
          sfx.play('shieldHit', { x: e.x, y: e.y, pitch: 1.4 });
          const f = this.views.get(e.a);
          if (f) f.freezeUntil = performance.now() + 60;
          break;
        }
        this.addFx(FX.parry, e.x, e.y + 20, false, 1.3, {}, 16, 26);
        // a parry rings out: a white ring and a bright star at the guard
        this.addAdd(0.28, (g, p) => {
          g.lineStyle(5 * (1 - p) + 1, 0xffffff, 1 - p);
          g.strokeCircle(e.x, e.y, 8 + 46 * easeOut3(p));
        });
        this.impact(e.x, e.y, 1, 1.1, { arc: 0xffffff, rim: 0x7ac8ff, spark: 0xbfe8ff }, false, false);
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
        if (e.kind >= SKILL_EVENT) {
          // a hero's special goes off: its own cast effect and sound, at the caster
          const skill = e.kind - SKILL_EVENT;
          this.casts.push({ skill, caster: e.p, t: performance.now() });
          if (this.casts.length > 8) this.casts.shift();
          const c = find(e.p);
          if (c) this.skillCast(skill, c);
          break;
        }
        // kinds: 0 arrow, 1 bomb, 2 frost, 3 trap, 4 arcane bolt, 5 orb, 7 the Gate's volley;
        // 6 is a Rift Art projectile (the Art's own sound covers it)
        if (e.kind === 7) {
          sfx.play('specGate', { volume: 0.45 });
          break;
        }
        if (e.kind === SHOOT_CRESCENT) {
          // the Sun Crescent leaves the blade: a gold flare at the swing and a ring of light
          const c = find(e.p);
          sfx.play('crescent', c ? { x: c.x, y: c.y } : {});
          if (c) {
            this.ring(c.x + c.face * 22, c.y - 30, 6, 40, 0.22, 0xffd86a, 3);
            this.ring(c.x + c.face * 22, c.y - 30, 3, 22, 0.16, 0xffffff, 2, true);
            this.shake(0.25);
          }
          break;
        }
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
        this.punch(0.12);
        break;
      }
      case 'trap': {
        const img = this.add.image(e.x, e.y, 's-trap-shut').setOrigin(0.5, 1).setScale(0.16).setDepth(11);
        this.tweens.add({ targets: img, alpha: 0, delay: 900, duration: 400, onComplete: () => img.destroy() });
        sfx.play('impact', { x: e.x, y: e.y, pitch: 1.4 });
        break;
      }
      case 'roll':
        // each dodge starts from the fighter's own state (startDodge), whichever hero it is
        break;
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
        // the super staging (game/cinematic.ts): wash, dim, cut-in, the camera push on the caster; it fills the sim's
        // superpause (`pause` ticks) when the event carries it
        const pause = (e as { pause?: number }).pause;
        if (v) {
          playSuperCinematic(this, { casterId: e.p, heroId: v.hero, artId: e.art, x: v.x, y: v.y, pauseMs: typeof pause === 'number' ? (pause / TICK_RATE) * 1000 : undefined });
          this.artStart(e.art, v, list);
          // before the sim had a superpause, every Art froze the caster's pose for a beat
          const fv = this.views.get(e.p);
          if (fv && typeof pause !== 'number') fv.freezeUntil = performance.now() + 110;
        } else {
          this.flash(ART_FLASH[e.art] ?? 0xffffff, 0.2, 150);
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
        // (smaller than it used to be: the camera pushes in on it)
        if (v) this.addFx(FX.pow, v.x, v.y - 30, false, 1, {}, 31, 32, 0.6);
        sfx.play('death');
        this.shake(1);
        // the K.O.: a beat of slow motion (visual only, 0.25x for 0.4 s) and the camera pushes in on the loser, following
        // the body as it flies; the white flash (or an Art finish's white-out) and the light ring are cinematic.ts's
        this.slowT = 0;
        const loser = e.v;
        const push = { zoomTo: (_x: number, _y: number, z: number, inMs: number, holdMs: number) => this.zoomShot({ id: loser, zoom: Math.min(z, 1.7) }, inMs + 50, holdMs + 500, 450) };
        if (v) koCinematic(this, { x: v.x, y: v.y - 30, attackerId: e.a, camera: push });
        else this.flash(0xffffff, 0.8, 300);
        if (v) {
          for (let i = 0; i < 18; i++) {
            const ang = (i / 18) * Math.PI * 2;
            this.spark(v.x, v.y - 30, Math.cos(ang) * (160 + Math.random() * 120), Math.sin(ang) * (160 + Math.random() * 120), 0.7, i % 2 ? 0xffffff : 0xffe08a, 3, 0);
          }
        }
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
    const caster = this.castCaster(p);
    const pv: ProjView = { kind: p.kind, x: p.x, y: p.y, face, age: 0, spawnNear: caster >= 0 ? caster : this.nearestFighter(p.x, p.y), skin: p.skin, hist: [] };
    if (p.skin) {
      this.spawnSkin(pv, p);
    } else if (p.kind === 'arrow') {
      // Serpent Rain's falling shafts are venom green; the bow's are as before
      const rain = Math.abs(p.vy) > 300;
      pv.fx = new FxSprite(this, FX.arrow, p.x, p.y, p.vx < 0, p.heavy ? { palette: ['#3a1a70', '#7f5ad8', '#e8e2ff', '#ffffff'] } : rain ? { palette: PAL.serpent } : {}, 14, 14, 10);
    } else if (p.kind === 'frost') {
      pv.fx = new FxSprite(this, FX.iceLance, p.x, p.y, p.vx < 0, {}, 14, 14, 10);
    } else if (p.kind === 'arcane') {
      // Prelati's bolts are violet starlight; Dumas' quill writes in golden ink
      const ink = this.lastList.find((f) => f.id === pv.spawnNear)?.hero === 6;
      pv.fx = new FxSprite(this, FX.energyDisc, p.x, p.y, p.vx < 0, { palette: ink ? PAL.gold : PAL.violet }, 14, 14, 10);
    } else if (p.kind === 'orb') {
      pv.fx = new FxSprite(this, FX.arcaneOrb, p.x, p.y + 30, false, {}, 14, 14, 10);
    } else if (p.kind === 'wave' && !p.heavy) {
      // the Sun Crescent: a crescent of gold light, the body in normal blend under an additive white-hot edge
      pv.gfx = this.add.graphics().setDepth(14.9);
      pv.sun = this.add.graphics().setDepth(15).setBlendMode(Phaser.BlendModes.ADD);
    } else if (p.kind === 'wave') {
      // Radiant Cleave: the gold disc, with a bright crescent edge drawn over it
      pv.fx = new FxSprite(this, FX.energyDisc, p.x, p.y, p.vx < 0, { palette: PAL.gold }, 14, 14, 10);
      pv.fx.front.setScale(2.6, 3.4);
      pv.fx.back.setScale(2.6, 3.4);
      pv.gfx = this.add.graphics().setDepth(15);
    } else if (p.kind === 'relic') {
      // the Gate and Vault of Ages: a treasure, point-first, out of a golden portal
      pv.img = this.add.image(p.x, p.y, RELIC_SPRITES[p.id % RELIC_SPRITES.length]).setScale(p.heavy ? 0.3 : 0.22).setDepth(14);
      this.ring(p.x, p.y, 4, 26, 0.3, 0xffe08a, 2.5);
      this.ring(p.x, p.y, 2, 14, 0.5, 0xfff4c0, 1.5, true);
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
    if (p.skin) {
      this.updateSkin(pv, p);
      return;
    }
    if (pv.sun) {
      this.drawSunCrescent(pv, p);
      return;
    }
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
      // point-first along its flight (the Gate's blades are aimed at the opponent), with a faint quiver
      const aim = Math.atan2(p.vy, Math.abs(p.vx) || 1) * (p.vx < 0 ? -1 : 1);
      pv.img?.setPosition(p.x, p.y).setFlipX(p.vx < 0).setRotation(aim + Math.sin(pv.age * 22) * 0.04);
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
    if (pv.skin) {
      this.endSkin(pv);
      void id;
      return;
    }
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
    } else if (pv.sun) {
      // the crescent breaks up into gold motes where it ends (spent, or cut against a body or a guard)
      for (let i = 0; i < 10; i++) {
        const a = (Math.random() - 0.5) * 2.2;
        this.spark(pv.x + pv.face * Math.cos(a) * 26, pv.y + Math.sin(a) * 30, pv.face * (40 + Math.random() * 120), (Math.random() - 0.5) * 140, 0.45, i % 3 ? 0xffd86a : 0xffffff, 2, 80);
      }
      pv.sun.destroy();
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

  // ------------------------------------------------------------------ dodges and specials

  /** A ghost (an after-image) of the fighter at (x, y): its pose now, fading over `life` seconds from alpha `a0`. */
  private ghostAt(fv: FighterView, v: ViewFighter, x: number, y: number, life: number, a0: number, tint: number) {
    const gh = fv.ghosts[fv.ghostI++ % fv.ghosts.length];
    if (fv.sprite) {
      const sp = fv.sprite.img;
      gh.img.setTexture(fv.sprite.textureKey, fv.sprite.current).setOrigin(sp.originX, sp.originY).setScale(fv.sprite.worldScale);
    } else {
      gh.tex.context.clearRect(0, 0, gh.tex.width, gh.tex.height);
      gh.tex.context.drawImage(fv.canvas.tex.getSourceImage() as HTMLCanvasElement, 0, 0);
      gh.tex.refresh();
    }
    gh.img.setPosition(x, y).setFlipX(v.face < 0).setVisible(true).setAlpha(a0).setTint(tint);
    gh.life = life;
    gh.max = life;
    gh.a0 = a0;
  }

  /** A dodge begins (the Roll): the hero's own start visuals and sound. */
  private startDodge(fv: FighterView, v: ViewFighter, now: number) {
    const D = DODGES[v.hero] ?? DODGES[0];
    const d: Dodge = { hero: v.hero, def: D, x0: fv.lastX, y0: fv.lastY, trail: [], afterimages: 0, lastGhost: 0, lastPuff: now, ended: false };
    fv.dodge = d;
    sfx.play(DODGE_SOUNDS[v.hero] ?? 'dodgeLion', { x: v.x, y: v.y, pitch: v.hero === 8 ? 1.3 : 1 });
    const x = d.x0;
    const y = d.y0;
    const f = v.face;
    // every dodge leaves a white pixel swoosh where it pushed off (a hook round the feet and a streak behind), as in the
    // owner's reference clip
    const back = v.vx !== 0 ? -Math.sign(v.vx) : -f;
    this.addVec(0.3, (g, p) => {
      const a = 1 - p * p;
      this.pixelCrescent(g, x + back * 4, y - 13, 15, 0.85, -back, 40, 250, 6, SWOOSH, a, p * 0.9, 7);
      g.fillStyle(0xffffff, 0.85 * a);
      const L = 26 * (0.6 + p);
      for (let k = 0; k < 3; k++) g.fillRect(Math.min(x + back * 8, x + back * (8 + L - k * 8)), y - 4 - k * 6, Math.max(2, L - k * 8), 2);
    });
    switch (v.hero) {
      case 0: // Lion's Step: a gold kick
        this.ring(x, y, 4, 40, 0.35, 0xffd84a, 2.5);
        this.dust(x, y, f, PAL.gold, 1.1);
        break;
      case 1: // Hunter's Vault: the back-flip takes off
      case 9: // Beast Bound: the pounce takes off
        this.dust(x, y, f, PAL.dust, v.hero === 9 ? 1.4 : 1);
        break;
      case 2: // Gate Step: a gold gate opens where he stood
        if (this.roomFor()) this.addFx(FX.portal, x, y, false, 1, { palette: PAL.gold }, 8, 9, 0.5);
        this.ring(x, y - 20, 4, 36, 0.35, 0xffd84a, 2);
        break;
      case 3: // Pole Vault: the pole plants
        this.dust(x + f * 16, y, f, PAL.dust, 0.8);
        break;
      case 4: // Clay Shift: the earth takes the body
        this.dust(x, y, f, PAL.dust, 1.3);
        break;
      case 5: // Mirage: the decoy stays behind a moment, then shatters into stars
        this.ghostAt(fv, v, x, y, 0.42, 0.7, 0x9a7aff);
        this.after(420, () => this.starBurst(x, y - 22, 0x9a7aff));
        break;
      case 6: // Turn of the Page: golden pages
        this.pageBurst(x, y - 26);
        break;
      case 7: // Flash Step (the Assassins): a pop where it starts
      case 8:
        if (this.roomFor()) this.addFx(FX.blinkOut, x, y - 26, false, 2.2, {}, 16, 26, 0.5);
        this.ring(x, y - 26, 4, 40, 0.3, TRAIL_COLOR[v.hero], 2);
        break;
      case 10: // Fog Form: the body breaks into smoke
        if (this.roomFor()) this.addFx(FX.poof, x, y - 20, false, 1.2, { palette: PAL.smoke }, 14, 16, 1.1);
        break;
      case 11: // Cavalry Dash: dust, and the horse
        this.dust(x, y, f, PAL.dust, 1.2);
        break;
      case 12: // Shadow Sink: a dark pool opens under her
        this.puddle(x, y, 0.7);
        break;
      case 13: // Shield Slide
        this.ring(x, y - 20, 4, 30, 0.3, 0x7ae8f5, 2);
        break;
    }
  }

  /** A running dodge: its trail, and the hero's own effects while it travels. */
  private stepDodge(fv: FighterView, v: ViewFighter, now: number) {
    const d = fv.dodge!;
    const live = v.act === Act.Roll;
    if (live) {
      d.trail.push({ x: v.x, y: v.y });
      if (d.trail.length > 24) d.trail.shift();
      if (!d.ended) this.dodgeFrame(fv, d, v, now);
    }
    // a step arrives when its travel is over; the other dodges when the roll ends
    if (!d.ended && (!live || (d.def.kind === 'step' && v.actTf >= d.def.ticks))) this.endDodge(fv, d, v);
    if (!live) fv.dodge = null;
  }

  /** Each frame of a dodge that travels: the streak, and the hero's own effects. */
  private dodgeFrame(fv: FighterView, d: Dodge, v: ViewFighter, now: number) {
    const g = fv.dgfx;
    const f = v.face;
    const p = Math.min(1, v.actTf / Math.max(1, d.def.ticks));
    strokeTrail(g, d.trail, TRAIL_COLOR[d.hero], 0.9, d.def.kind === 'step' ? 4 : 3, -24);
    // after-images on every dash and dodge: a faint ghost in the hero's trail colour every two frames (the bodies that
    // hide or melt, and the Flash Steps with their own, are left out; a long vault only ghosts its take-off)
    if (!NO_GHOST_DODGE.has(d.hero) && now - d.lastGhost > 32 && (d.def.kind !== 'leap' || v.actTf < 14)) {
      d.lastGhost = now;
      this.ghostAt(fv, v, v.x, v.y, 0.15, 0.32, TRAIL_COLOR[d.hero]);
    }
    switch (d.hero) {
      case 0: // gold dust kicked up behind the burst
        if (now - d.lastPuff > 70) {
          d.lastPuff = now;
          this.dust(v.x - f * 10, v.y, f, PAL.gold, 0.9);
        }
        this.spark(v.x - f * 12, v.y - 3 + (Math.random() - 0.5) * 6, -f * (80 + Math.random() * 60), -Math.random() * 60, 0.35, 0xffd84a, 2, 240);
        break;
      case 2: // the gate's gold motes along the step
        this.spark(v.x, v.y - 24 + (Math.random() - 0.5) * 20, 0, -10, 0.4, 0xffe08a, 2, 0);
        break;
      case 3: // the pole, planted at take-off, swinging with the body
        if (p < 0.85) {
          g.lineStyle(2, 0xcfd8e0, 0.9);
          g.lineBetween(d.x0 + f * 16, d.y0, v.x, v.y - 44);
        }
        break;
      case 4: // Clay Shift: the crack in the earth, behind the sinking body
        if (now - d.lastPuff > 60) {
          d.lastPuff = now;
          this.dust(v.x, v.y, f, PAL.dust, 0.6);
        }
        g.lineStyle(2, 0x4f3f2c, 0.7);
        for (let i = 1; i < d.trail.length; i++) {
          const a = d.trail[i - 1];
          const b = d.trail[i];
          g.lineBetween(a.x, d.y0 + 1 + (i % 2) * 2, b.x, d.y0 + 1 + ((i + 1) % 2) * 2);
        }
        break;
      case 5: // Mirage: a violet shimmer about the figure
        if (this.parts.length < MAX_PARTS) this.spark(v.x + (Math.random() - 0.5) * 28, v.y - 8 - Math.random() * 30, 0, -10, 0.4, 0x9a7aff, 2, 0);
        break;
      case 6: // the pages' motes
        if (now - d.lastPuff > 90) {
          d.lastPuff = now;
          this.spark(v.x, v.y - 30, -f * 40, -30, 0.5, 0xfff0c0, 3, 0);
        }
        break;
      case 7: // Flash Step (the Assassins): up to four after-images along the step
      case 8:
        if (d.afterimages < 4 && now - d.lastGhost > 18) {
          d.lastGhost = now;
          d.afterimages++;
          this.ghostAt(fv, v, v.x, v.y, 0.26, 0.6, TRAIL_COLOR[d.hero]);
        }
        break;
      case 9: // Beast Bound: dust thrown up along the arc
        if (now - d.lastPuff > 90) {
          d.lastPuff = now;
          this.dust(v.x, v.y, f, PAL.dust, 0.7);
        }
        break;
      case 10: {
        // Fog Form: a grey cloud that drifts about the body
        g.fillStyle(0x9aa8c0, 0.16);
        for (let i = 0; i < 5; i++) {
          const a = now * 0.004 + i * 1.3;
          g.fillCircle(v.x + Math.cos(a) * 14, v.y - 22 + Math.sin(a * 1.3) * 10, 9 + (i % 2) * 4);
        }
        if (Math.random() < 0.6) this.spark(v.x + (Math.random() - 0.5) * 30, v.y - 10 - Math.random() * 30, 0, -4 - Math.random() * 6, 0.8, 0xb8c4dc, 2, 0);
        break;
      }
      case 11: // Cavalry Dash: dust, and a faint horse under the rider
        if (now - d.lastPuff > 80) {
          d.lastPuff = now;
          this.dust(v.x - f * 16, v.y, f, PAL.dust, 0.9);
        }
        this.horseFor(fv, v, true, 0.32);
        break;
      case 13: // Shield Slide: sparks skipping along the floor
        this.spark(v.x - f * 6, v.y - 1, -f * (60 + Math.random() * 90), -Math.random() * 30, 0.3, Math.random() < 0.5 ? 0x7ae8f5 : 0xeef3fa, 2, 260);
        break;
      default:
        break;
    }
  }

  /** The dodge arrives: its end visuals, and the streak it left fades. */
  private endDodge(fv: FighterView, d: Dodge, v: ViewFighter) {
    d.ended = true;
    const x = v.x;
    const y = v.y;
    const f = v.face;
    const c = TRAIL_COLOR[d.hero];
    const trail = d.trail.slice();
    if (trail.length > 1) this.addVec(0.32, (g, p) => strokeTrail(g, trail, c, 1 - p, 4, -24));
    switch (d.hero) {
      case 1:
      case 3: // the vaults land
        this.dust(x, y, f, PAL.dust, 1);
        break;
      case 2: // the gate at the arrival
        if (this.roomFor()) this.addFx(FX.portal, x, y, false, 1, { palette: PAL.gold }, 8, 9, 0.5);
        this.ring(x, y - 20, 4, 36, 0.35, 0xffd84a, 2);
        break;
      case 4:
        this.dust(x, y, f, PAL.dust, 1);
        break;
      case 6:
        this.pageBurst(x, y - 26);
        break;
      case 7: // Flash Step: a pop where it lands
      case 8:
        if (this.roomFor()) this.addFx(FX.blinkIn, x, y - 26, false, 2.2, {}, 16, 26, 0.5);
        this.ring(x, y - 26, 4, 40, 0.3, c, 2);
        for (let i = 0; i < 3; i++) this.spark(x, y - 26, (Math.random() - 0.5) * 120, (Math.random() - 0.5) * 120, 0.3, c, 2, 0);
        break;
      case 9: // Beast Bound lands hard
        this.dust(x, y, f, PAL.dust, 1.5);
        this.shake(0.4);
        break;
      case 10:
        if (this.roomFor()) this.addFx(FX.poof, x, y - 20, false, 1.2, { palette: PAL.smoke }, 14, 16, 1);
        break;
      case 11:
        this.horseFor(fv, v, false, 0);
        break;
      case 12: // Shadow Sink rises out of a pool
        this.puddle(x, y, 0.8);
        break;
      case 13:
        this.ring(x, y - 20, 4, 30, 0.3, 0x7ae8f5, 2);
        break;
      default:
        break;
    }
  }

  /** How the dodging body looks this frame: alpha, a vertical sink and a tint. */
  private dodgeLook(fv: FighterView, v: ViewFighter): { alpha: number; dy: number; tint: number } {
    const d = fv.dodge;
    if (!d || v.act !== Act.Roll) return { alpha: 1, dy: 0, tint: 0 };
    const p = Math.min(1, v.actTf / Math.max(1, d.def.ticks));
    switch (d.hero) {
      case 5: // Mirage: a violet illusion
        return { alpha: 0.5, dy: 0, tint: 0x9a7aff };
      case 10: // Fog Form: barely there
        return { alpha: 0.15 + 0.03 * Math.sin(this.clock * 30), dy: 0, tint: 0xb8c4dc };
      case 12: {
        // Shadow Sink: under the shadow by the middle of the step, rising at the other end
        const k = p < 0.35 ? p / 0.35 : p > 0.7 ? 1 - (p - 0.7) / 0.3 : 1;
        return { alpha: 1 - k * 0.95, dy: 34 * k, tint: 0 };
      }
      case 4: {
        // Clay Shift: melts into the ground, mostly hidden, and comes back out
        const k = Math.sin(Math.min(1, p) * Math.PI);
        return { alpha: 1 - k * 0.8, dy: 18 * k, tint: 0x9a7a50 };
      }
      default:
        return { alpha: 1, dy: 0, tint: 0 };
    }
  }

  /** A puff of dust (or gold, or smoke) on the ground: the dodges' and casts' footfalls. */
  private dust(x: number, y: number, face: number, palette: string[], scale: number) {
    if (this.roomFor()) this.addFx(FX.poof, x, y, face < 0, 1.3, { palette }, 8, 9, 0.45 * scale);
  }

  /** A dark pool on the floor that fades (Shadow Sink's way under the ground). */
  private puddle(x: number, y: number, life: number) {
    this.addVec(life, (g, p) => {
      const w = 46 * (0.4 + 0.6 * Math.min(1, p * 4));
      g.fillStyle(0x05030a, 0.85 * (1 - p));
      g.fillEllipse(x, y - 1, w, 9);
      g.lineStyle(1.5, 0x8a5ae0, 0.9 * (1 - p));
      g.strokeEllipse(x, y - 1, w, 9);
    });
  }

  /** Golden pages whirling out of a point, then fluttering down (Turn of the Page). */
  private pageBurst(x: number, y: number) {
    const seeds = Array.from({ length: 8 }, (_, i) => ({ a: (i / 8) * Math.PI * 2, s: 0.8 + ((i * 37) % 5) / 10 }));
    this.addVec(0.6, (g, p) => {
      for (const s of seeds) {
        const r = 10 + 46 * p;
        const cx = x + Math.cos(s.a + p * 4) * r;
        const cy = y + Math.sin(s.a + p * 4) * r * 0.5 + p * 26;
        const pts = rectPts(cx, cy, 7 * s.s, 9 * s.s, s.a + p * 6);
        g.fillStyle(p < 0.5 ? 0xfff6dc : 0xf0c860, 0.92 * (1 - p));
        g.fillPoints(pts, true);
        g.lineStyle(1, 0x15110c, 0.8 * (1 - p));
        g.strokePoints(pts, true);
      }
    });
  }

  /** Sparks bursting out of a point, and a ring: a special's or a mirage's shatter. */
  private starBurst(x: number, y: number, c: number) {
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      this.spark(x, y, Math.cos(a) * (60 + Math.random() * 60), Math.sin(a) * (60 + Math.random() * 60), 0.45, c, 3, 40);
    }
    this.ring(x, y, 3, 30, 0.3, c, 2);
  }

  /** A rune lit in the air behind Rune Leap (it rises and fades in half a second). */
  private rune(x: number, y: number, face: number) {
    const s = 0.9 + Math.random() * 0.4;
    this.addVec(0.5, (g, p) => {
      const oy = y - p * 12;
      g.lineStyle(2, 0x7ae8f5, 0.95 * (1 - p));
      const L: [number, number, number, number][] = [[-3, -5, 3, -5], [0, -5, 0, 5], [-3, 0, 3, -3], [-3, 3, 3, 3]];
      for (const [a, b, c, d] of L) g.lineBetween(x + face * a * s, oy + b * s, x + face * c * s, oy + d * s);
    });
  }

  /** A warhorse silhouette under a rider or a charge (`a` its alpha); off removes it. */
  private horseFor(fv: FighterView, v: ViewFighter, on: boolean, a: number) {
    if (!on) {
      if (fv.mount) {
        fv.mount.img.destroy();
        fv.mount.tex.destroy();
        fv.mount = null;
      }
      return;
    }
    if (!fv.mount) {
      if (!this.roomFor()) return;
      const tex = new PixelTex(this, `horse${v.id}`, 46, 34);
      fv.mount = { tex, img: this.add.image(v.x, v.y, tex.key).setScale(1.1).setDepth(8), step: -1 };
    }
    const m = fv.mount;
    const step = Math.floor(this.clock * 14);
    if (step !== m.step) {
      m.step = step;
      paintHorse(m.tex, this.clock);
    }
    m.img.setPosition(v.x - v.face * 18, v.y - 17).setFlipX(v.face < 0).setAlpha(a);
  }

  /** A dash special in flight: Rune Leap leaves runes in the air; Bucephalus Charge carries the warhorse with fire and dust. */
  private specialDash(fv: FighterView, v: ViewFighter, now: number) {
    if (v.act !== Act.Skill) {
      if (fv.mount && v.skill === SkillId.BucephalusCharge && v.act !== Act.Roll) this.horseFor(fv, v, false, 0);
      return;
    }
    const sk = SKILLS[v.skill];
    const on = !!sk && sk.kind === 'dash' && v.actTf >= sk.startup && v.actTf < sk.startup + (sk.active ?? 0);
    // a dash special leaves after-images too
    if (on && now - fv.ghostAt > 32) {
      fv.ghostAt = now;
      this.ghostAt(fv, v, v.x, v.y, 0.15, 0.32, TRAIL_COLOR[v.hero] ?? 0xffffff);
    }
    if (v.skill === SkillId.RuneLeap && on && now - fv.runeAt > 70) {
      fv.runeAt = now;
      this.rune(v.x - v.face * 8, v.y - 30, v.face);
    }
    if (v.skill === SkillId.BucephalusCharge) {
      this.horseFor(fv, v, on, 0.9);
      if (on && now - fv.flameAt > 90) {
        fv.flameAt = now;
        this.dust(v.x - v.face * 14, v.y, v.face, PAL.dust, 1);
        if (this.roomFor()) this.addFx(FX.flamethrower, v.x - v.face * 26, v.y - 8, v.face > 0, 1.6, { palette: PAL.fire }, 12, 13, 0.4);
      }
    }
  }

  /** A hero's special goes off (its 'shoot' event): the cast effect and sound at the caster. */
  private skillCast(skill: number, c: ViewFighter) {
    const x = c.x;
    const y = c.y;
    const f = c.face;
    sfx.play(SKILL_SOUNDS[skill] ?? 'specLion', { x, y, volume: 0.9 });
    switch (skill) {
      case SkillId.LionsRoar: // Richard's golden roar: a ring that throws everyone close away
        this.ring(x, y - 30, 10, 110, 0.5, 0xffd84a, 5);
        this.ring(x, y - 30, 6, 70, 0.35, 0xfff0a8, 2, true);
        if (this.roomFor()) {
          const sun = this.addFx(FX.sunburst, x, y - 30, false, 1, { palette: PAL.gold }, 16, 26, 0.5);
          this.after(500, () => sun.stop());
        }
        this.shake(0.6);
        break;
      case SkillId.TerrorRoar: // Humbaba's terror: a dark shockwave, and the screen shakes
        this.ring(x, y - 30, 10, 130, 0.5, 0xff2a2a, 5);
        this.ring(x, y - 30, 6, 100, 0.4, 0x8a5ae0, 3, true);
        if (this.roomFor()) this.addFx(FX.darkExplosion, x, y - 30, false, 1, { palette: PAL.abyss }, 16, 26, 0.5);
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * Math.PI * 2;
          this.spark(x, y - 30, Math.cos(a) * 140, Math.sin(a) * 60, 0.5, 0x5a2aa8, 3, 0);
        }
        this.shake(0.9);
        break;
      case SkillId.NineLives: // three Hydra-venom arrows loosed from the bow
        if (this.roomFor()) this.addFx(FX.poof, x + f * 22, y - 40, f < 0, 1.1, { palette: PAL.serpent }, 14, 16, 0.5);
        for (let i = 0; i < 8; i++) this.spark(x + f * 22, y - 40, f * (40 + Math.random() * 120), -Math.random() * 120, 0.45, Math.random() < 0.5 ? 0x9cff3a : 0x3a8a1a, 2, 120);
        break;
      case SkillId.GateShot: // a small gold portal opens for the blade
        if (this.roomFor()) {
          const por = this.addFx(FX.portal, x + f * 22, y - 40, f < 0, 1, { palette: PAL.gold }, 14, 16, 0.4);
          this.after(500, () => por.stop());
        }
        this.ring(x + f * 22, y - 40, 4, 30, 0.35, 0xffe08a, 2.5);
        break;
      case SkillId.RuneLeap: // runes ring the ground as he leaps
        this.ring(x, y, 6, 50, 0.4, 0x7ae8f5, 2.5);
        if (this.roomFor()) this.addFx(FX.runeCircle, x, y, false, 1.2, { palette: PAL.cyan }, 6, 8, 0.6);
        break;
      case SkillId.ChainLash: // gold rings snap out of the hand
        this.ring(x + f * 20, y - 34, 3, 26, 0.3, 0xffd84a, 2.5);
        break;
      case SkillId.PhantomStars:
        this.starBurst(x + f * 20, y - 36, 0xc09cff);
        break;
      case SkillId.InkBlot: // a splash of gold and black flung out
        if (this.roomFor()) this.addFx(FX.poof, x + f * 20, y - 34, f < 0, 1, { palette: PAL.ink }, 14, 16, 0.5);
        for (let i = 0; i < 6; i++) this.spark(x + f * 20, y - 34, f * (60 + Math.random() * 60), -40 - Math.random() * 60, 0.4, Math.random() < 0.5 ? 0xe8c878 : 0x2a2016, 2.5, 500);
        break;
      case SkillId.ShadowDirk: // a dark puff, mint sparks off the blade
        if (this.roomFor()) this.addFx(FX.poof, x + f * 18, y - 30, f < 0, 1, { palette: PAL.smoke }, 14, 16, 0.6);
        for (let i = 0; i < 6; i++) this.spark(x + f * 18, y - 30, f * (60 + Math.random() * 60), (Math.random() - 0.5) * 80, 0.3, 0x7affd0, 2, 0);
        break;
      case SkillId.FanOfKnives: // a cyan slash in front
        if (this.roomFor()) this.addFx(FX.claw, x + f * 24, y - 34, f < 0, 2, { palette: PAL.cyan }, 16, 26, 0.9);
        this.ring(x + f * 20, y - 34, 3, 26, 0.25, 0x3ce0f5, 2);
        break;
      case SkillId.ScalpelRain: // a fog of silver
        if (this.roomFor()) this.addFx(FX.poof, x, y - 40, f < 0, 1.2, { palette: PAL.silver }, 14, 16, 0.9);
        break;
      case SkillId.BucephalusCharge: // the charge starts in a cloud of dust
        this.dust(x, y, f, PAL.dust, 1.4);
        this.shake(0.3);
        break;
      case SkillId.PlagueHound: // the hound rises out of the shadows
        if (this.roomFor()) this.addFx(FX.poof, x + f * 20, y - 14, f < 0, 1.4, { palette: PAL.abyss }, 14, 16, 0.6);
        this.ring(x + f * 20, y - 6, 4, 34, 0.35, 0x6cb82a, 2.5);
        break;
      case SkillId.ShieldRebound: // a teal ring as the shield leaves the hand
        this.ring(x + f * 20, y - 30, 6, 50, 0.35, 0x7ae8f5, 3);
        for (let i = 0; i < 6; i++) this.spark(x + f * 20, y - 30, f * (40 + Math.random() * 60), (Math.random() - 0.5) * 60, 0.35, 0x7ae8f5, 2, 0);
        this.shake(0.2);
        break;
    }
  }

  /** The hero who threw the special whose projectile this is (the newest matching cast), or -1. */
  private castCaster(p: NetProjectile): number {
    const now = performance.now();
    for (let i = this.casts.length - 1; i >= 0; i--) {
      const c = this.casts[i];
      if (c.skill === p.skin - 1 && now - c.t < 1500) return c.caster;
    }
    return -1;
  }

  private takeGfx(): Phaser.GameObjects.Graphics {
    const g = this.gfxPool.pop() ?? this.add.graphics().setDepth(15);
    g.setVisible(true);
    return g;
  }

  private giveGfx(g: Phaser.GameObjects.Graphics) {
    g.clear();
    if (this.gfxPool.length < 12) {
      g.setVisible(false);
      this.gfxPool.push(g);
    } else g.destroy();
  }

  /** A hero special's projectile: its own look (its skin is the skill id + 1). */
  private spawnSkin(pv: ProjView, p: NetProjectile) {
    pv.gfx = this.takeGfx();
    switch (p.skin - 1) {
      case SkillId.NineLives: // Hydra-venom arrows: the venom-green arrow
        pv.fx = new FxSprite(this, FX.arrow, p.x, p.y, p.vx < 0, { palette: PAL.serpent }, 14, 14, 10);
        break;
      case SkillId.GateShot: // a golden blade out of a small gold portal ring
        pv.img = this.add.image(p.x, p.y, 'r-gold-sword').setScale(0.45).setDepth(14);
        this.ring(p.x, p.y, 4, 30, 0.35, 0xffe08a, 2.5);
        if (this.roomFor()) {
          const por = this.addFx(FX.portal, p.x, p.y, false, 1, { palette: PAL.gold }, 14, 16, 0.35);
          this.after(350, () => por.stop());
        }
        break;
      case SkillId.PlagueHound: // the shadow hound, smaller than Night Hunt's
        pv.tex = new PixelTex(this, `hound${p.id}`, 56, 44);
        pv.img = this.add.image(p.x, p.y, pv.tex.key).setScale(0.95).setOrigin(0.5, 0.76).setDepth(14);
        break;
      default: // the rest are drawn in updateSkin
        break;
    }
    if (pv.fx) this.fx.push(pv.fx);
  }

  /** Each frame of a hero special's projectile (pv.age is already up to date). */
  private updateSkin(pv: ProjView, p: NetProjectile) {
    const g = pv.gfx!;
    g.clear();
    const face = pv.face;
    const h = pv.hist;
    h.push({ x: p.x, y: p.y });
    if (h.length > 8) h.shift();
    const ang = Math.atan2(p.vy, p.vx);
    switch (p.skin - 1) {
      case SkillId.NineLives: {
        const a = Math.atan2(p.vy, Math.abs(p.vx)) * (p.vx < 0 ? -1 : 1);
        pv.fx?.setPosition(p.x, p.y);
        pv.fx?.front.setRotation(a);
        pv.fx?.back.setRotation(a);
        if (Math.random() < 0.8) this.spark(p.x - face * 8 + (Math.random() - 0.5) * 6, p.y + (Math.random() - 0.5) * 6, -face * (10 + Math.random() * 30), -20 - Math.random() * 40, 0.45, Math.random() < 0.5 ? 0x9cff3a : 0x3a8a1a, 2, -60);
        break;
      }
      case SkillId.GateShot: {
        pv.img?.setPosition(p.x, p.y).setFlipX(face < 0).setRotation(Math.sin(pv.age * 22) * 0.06);
        strokeTrail(g, h, 0xffd870, 0.85, 3);
        if (Math.random() < 0.6) this.spark(p.x - face * 18, p.y + (Math.random() - 0.5) * 8, -face * 10, 10 + Math.random() * 20, 0.35, 0xffe08a, 2, 0);
        break;
      }
      case SkillId.ChainLash: {
        // a gold chain from the thrower's hand to the head
        const c = this.views.get(pv.spawnNear)?.shown;
        const sx = c ? c.x + c.face * 20 : p.x - face * 40;
        const sy = c ? c.y - 34 : p.y;
        const dist = Math.hypot(p.x - sx, p.y - sy);
        this.chainLine(g, sx, sy, p.x, p.y, Math.max(3, Math.round(dist / 9)), 0xffd84a, 0.95);
        g.fillStyle(0xffd84a, 1);
        g.fillCircle(p.x, p.y, 2.5);
        g.lineStyle(2, 0xffd84a, 1);
        g.lineBetween(p.x, p.y, p.x + face * 5, p.y - 5);
        break;
      }
      case SkillId.PhantomStars: {
        drawStar(g, p.x, p.y, 7, 2.6, pv.age * 9, 0xc09cff, 0xffffff);
        strokeTrail(g, h, 0x8a5ae0, 0.85, 2);
        if (Math.random() < 0.7) this.spark(p.x + (Math.random() - 0.5) * 6, p.y + (Math.random() - 0.5) * 6, 0, 0, 0.35, 0xc09cff, 2, 0);
        break;
      }
      case SkillId.InkBlot: {
        drawInk(g, p.x, p.y, pv.age);
        if (Math.random() < 0.5) this.spark(p.x, p.y, (Math.random() - 0.5) * 30, -Math.random() * 20, 0.3, 0x2a2016, 2, 300);
        break;
      }
      case SkillId.ShadowDirk: {
        strokeTrail(g, h, 0x7affd0, 0.9, 3);
        drawKnife(g, p.x, p.y, ang, 0x1b1a24, 0x7affd0);
        break;
      }
      case SkillId.FanOfKnives: {
        strokeTrail(g, h, 0x3ce0f5, 0.9, 3);
        drawKnife(g, p.x, p.y, ang, 0xd0fbff, 0x3ce0f5);
        break;
      }
      case SkillId.ScalpelRain: {
        strokeTrail(g, h, 0xc4ccd8, 0.6, 1.2);
        drawScalpel(g, p.x, p.y, pv.age * 16 + p.id);
        break;
      }
      case SkillId.PlagueHound: {
        // the hound runs: its two poses alternate, and a shadow sits on the floor under it
        const step = Math.floor(pv.age * 12);
        if (pv.tex && pv.paintedAt !== step) {
          pv.paintedAt = step;
          paintHound(pv.tex, step % 2 ? 2 : 0, pv.age);
        }
        pv.img?.setPosition(p.x, p.y).setFlipX(face < 0);
        g.fillStyle(0x000000, 0.4);
        g.fillEllipse(p.x, p.y + 1, 22, 4);
        if (Math.random() < 0.7) this.spark(p.x - face * 18 + Math.random() * 6, p.y - 6 + Math.random() * 10, -face * (20 + Math.random() * 40), -Math.random() * 30, 0.5, Math.random() < 0.5 ? 0x6cb82a : 0x8a5ae0, 2, -40);
        break;
      }
      case SkillId.ShieldRebound: {
        drawShield(g, p.x, p.y, pv.age * 14);
        if (Math.random() < 0.6) this.spark(p.x + (Math.random() - 0.5) * 10, p.y + (Math.random() - 0.5) * 20, (Math.random() - 0.5) * 40, (Math.random() - 0.5) * 40, 0.3, 0x7ae8f5, 2, 0);
        break;
      }
      default:
        break;
    }
  }

  /** A hero special's projectile is gone: it bursts, sticks or bleeds where it ended. */
  private endSkin(pv: ProjView) {
    const x = pv.x;
    const y = pv.y;
    // the fighter it ended on (not its thrower), if any
    let hit: ViewFighter | undefined;
    for (const f of this.lastList) {
      if (f.id !== pv.spawnNear && Math.hypot(f.x - x, f.y - (y - 24)) < 60) {
        hit = f;
        break;
      }
    }
    switch (pv.skin - 1) {
      case SkillId.NineLives:
        for (let i = 0; i < 6; i++) this.spark(x, y, (Math.random() - 0.5) * 80, -Math.random() * 60, 0.45, Math.random() < 0.5 ? 0x9cff3a : 0x3a8a1a, 2, 120);
        break;
      case SkillId.GateShot:
        this.ring(x, y, 4, 30, 0.25, 0xffe08a, 2.5);
        for (let i = 0; i < 6; i++) this.spark(x, y, (Math.random() - 0.5) * 120, (Math.random() - 0.5) * 120, 0.4, 0xffe08a, 2.5, 60);
        break;
      case SkillId.ChainLash:
        if (hit) {
          const tx = hit.x;
          const ty = hit.y - 24;
          this.ring(tx, ty, 6, 40, 0.35, 0xffd84a, 2.5);
          this.addVec(0.3, (g, p) => this.chainLine(g, x, y, tx, ty, 8, 0xffd84a, 1 - p));
          this.shake(0.3);
        }
        break;
      case SkillId.PhantomStars:
        this.starBurst(x, y, 0xc09cff);
        break;
      case SkillId.InkBlot: {
        if (this.roomFor()) this.addFx(FX.splash, x, y, false, 1.4, { palette: PAL.ink }, 14, 16, 0.7);
        this.ring(x, y, 4, 34, 0.35, 0xe8c878, 2);
        for (let i = 0; i < 10; i++) this.spark(x, y, (Math.random() - 0.5) * 140, -Math.random() * 120, 0.5, Math.random() < 0.5 ? 0xe8c878 : 0x15110c, 3, 320);
        this.addVec(0.9, (g, p) => {
          g.fillStyle(0x15110c, 0.8 * (1 - p * 0.6));
          g.fillEllipse(x, y, 30 * (0.5 + 0.5 * Math.min(1, p * 3)), 6);
        });
        break;
      }
      case SkillId.ShadowDirk:
        if (this.roomFor()) this.addFx(FX.poof, x, y, false, 1.1, { palette: PAL.smoke }, 14, 16, 0.5);
        for (let i = 0; i < 5; i++) this.spark(x, y, (Math.random() - 0.5) * 100, (Math.random() - 0.5) * 100, 0.3, 0x7affd0, 2, 0);
        break;
      case SkillId.FanOfKnives:
        for (let i = 0; i < 4; i++) this.spark(x, y, (Math.random() - 0.5) * 100, (Math.random() - 0.5) * 100, 0.3, 0x3ce0f5, 2, 0);
        break;
      case SkillId.ScalpelRain:
        if (hit) {
          // the bleed: a red burst on the wound, and red drops running down
          const wx = hit.x + (Math.random() - 0.5) * 10;
          const wy = y - 24;
          if (this.roomFor()) this.addFx(FX.hitSpark, wx, wy, false, 1.2, { palette: PAL.blood }, 16, 26);
          for (let i = 0; i < 8; i++) this.spark(wx, wy, (Math.random() - 0.5) * 120, -Math.random() * 90, 0.4, 0xb0141c, 2, 300);
          this.addVec(0.7, (g, p) => {
            g.lineStyle(2, 0xa8122a, 0.9 * (1 - p));
            g.lineBetween(wx - 3, wy, wx - 3, wy + 20 * p);
            g.lineBetween(wx + 3, wy, wx + 3, wy + 14 * p);
          });
        } else {
          for (let i = 0; i < 3; i++) this.spark(x, y, (Math.random() - 0.5) * 80, (Math.random() - 0.5) * 80, 0.3, 0xc4ccd8, 1.5, 0);
        }
        break;
      case SkillId.PlagueHound:
        if (this.roomFor()) this.addFx(FX.poof, x, y, false, 1.4, { palette: PAL.serpent }, 14, 16, 0.5);
        break;
      case SkillId.ShieldRebound:
        this.ring(x, y, 4, 30, 0.3, 0x7ae8f5, 3);
        for (let i = 0; i < 6; i++) this.spark(x, y, (Math.random() - 0.5) * 120, (Math.random() - 0.5) * 120, 0.35, 0x7ae8f5, 2, 0);
        break;
      default:
        break;
    }
    pv.fx?.destroy();
    pv.img?.destroy();
    pv.tex?.destroy();
    if (pv.gfx) this.giveGfx(pv.gfx);
    pv.gfx = undefined;
  }

  // ------------------------------------------------------------------ camera

  /**
   * Screen shake: a vertical damped bounce, y = A e^(-t/0.12) sin(2 pi 11 t), measured off the reference (MUGEN shakes
   * vertically only). `amp` 0..1.2: light hit ~0.3, heavy ~0.8, a super or a K.O. 1; the peak is amp x 3% of the view
   * height, over 0.2-0.35 s. A weaker shake never cuts a stronger one short. Time-based, so frame-rate independent.
   */
  private shake(amp: number, extra = 0) {
    const a = Math.min(1.2, amp + extra) * prefs().shake;
    if (a <= 0) return;
    const left = this.shakeT < this.shakeDur ? this.shakeA * Math.exp(-this.shakeT / 0.12) : 0;
    if (a < left) return;
    this.shakeA = a;
    this.shakeT = 0;
    this.shakeDur = 0.2 + 0.15 * Math.min(1, a);
  }

  /** This frame's shake offset (world units, vertical), stepping the shake's clock. */
  private shakeOffset(dt: number, viewH: number): number {
    if (this.shakeT >= this.shakeDur) return 0;
    const t = this.shakeT;
    this.shakeT += dt;
    // (the last 50 ms ease to zero so the bounce never ends on a jump)
    const tail = Math.min(1, (this.shakeDur - t) / 0.05);
    return this.shakeA * 0.03 * viewH * Math.exp(-t / 0.12) * Math.sin(2 * Math.PI * 11 * t) * tail;
  }

  /**
   * A camera shot that takes over from the follow camera: zooms to `zoom` x the follow camera's zoom on the world point
   * (x, y) over `inMs` (ease-out), holds `holdMs`, then lets go over `outMs` (<= 20 snaps straight back). For super
   * connects, heavy finishers and the K.O. push (game/cinematic.ts calls it as its camera). A new shot starts from
   * wherever the current one is, so shots chain without a jump.
   */
  zoomTo(x: number, y: number, zoom: number, inMs = 90, holdMs = 700, outMs = 40) {
    this.zoomShot({ x, y, zoom }, inMs, holdMs, outMs);
  }

  /** zoomTo on a ZoomShot: a point, a fighter followed while the shot lasts (`id`), or the follow camera's own centre. */
  zoomShot(target: ZoomShot, inMs = 90, holdMs = 700, outMs = 40) {
    this.shot = { tgt: target, t: 0, inS: Math.max(0.001, inMs / 1000), holdS: Math.max(0, holdMs / 1000), outS: Math.max(0, outMs / 1000), w0: this.shotWeight() };
  }

  /** A short zoom punch on the follow camera's own centre (`amount` 0.1 = 10% closer); the old Art punch. */
  punch(amount: number) {
    if (this.shot && this.shotWeight() > 0.5) return; // a bigger shot is already framing
    this.zoomShot({ zoom: 1 + amount }, 50, 70, 220);
  }

  /** How far the current shot has taken over (0 = the follow camera, 1 = the shot). */
  private shotWeight(): number {
    const s = this.shot;
    if (!s) return 0;
    if (s.t < s.inS) return s.w0 + (1 - s.w0) * easeOut3(s.t / s.inS);
    const t = s.t - s.inS - s.holdS;
    if (t < 0) return 1;
    if (s.outS <= 0.02 || t >= s.outS) return 0;
    const p = t / s.outS;
    return 1 - p * p;
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
    // how much world fits: 220-275 units of height (a standing fighter is about a fifth to a quarter of the view),
    // zoomed out to keep both fighters in view
    const wantH = Phaser.Math.Clamp(vh * 0.5, 220, 275);
    let zoom = vh / wantH;
    zoom = Math.min(zoom, useW / (maxX - minX + 190), vh / (maxY - minY + 200));
    zoom = Math.max(zoom, vw / (this.arenaW + 240));
    if (!this.camInit) {
      // the first frame of a match frames the fighters at once
      this.camInit = true;
      this.camZoom = zoom;
      this.camFc = (minX + maxX) / 2;
    }
    // zoom out fast when the fighters part; zoom in slowly, and only once the closer framing has been wanted for half a
    // second, so the frame does not breathe with every step of an exchange
    if (zoom < this.camZoom) {
      this.zoomInWait = 0;
      this.camZoom += (zoom - this.camZoom) * (1 - Math.exp(-dt * 8));
    } else if (zoom > this.camZoom * 1.015) {
      this.zoomInWait += dt;
      if (this.zoomInWait > 0.5) this.camZoom += (zoom - this.camZoom) * (1 - Math.exp(-dt * 2));
    } else {
      this.zoomInWait = 0;
    }
    // horizontal dead zone: the frame stays still while both fighters are inside its middle 60%, and only then follows
    const off = (pad.right - pad.left) / 2 / this.camZoom; // the usable area's centre sits this far left of the camera's
    const dz = (useW / this.camZoom) * 0.3;
    let fc = this.camFc;
    if (maxX - minX > dz * 2) fc = (minX + maxX) / 2;
    else if (minX < fc - dz) fc = minX + dz;
    else if (maxX > fc + dz) fc = maxX - dz;
    this.camFc += (fc - this.camFc) * (1 - Math.exp(-dt * 10));
    const cy = Math.min(this.floor - (vh / this.camZoom) * (pad.right ? 0.24 : 0.36), (minY + maxY) / 2 - 40);
    this.camY += (cy - this.camY) * (1 - Math.exp(-dt * 6));
    this.camX = this.camFc + off;
    // a camera shot (zoomTo) blends in over the follow camera
    let z = this.camZoom;
    let x = this.camX;
    let y = this.camY;
    if (this.shot) {
      this.shot.t += dt;
      const w = this.shotWeight();
      const s = this.shot;
      if (s.t >= s.inS + s.holdS + (s.outS <= 0.02 ? 0 : s.outS)) this.shot = null;
      if (w > 0) {
        const zt = this.camZoom * s.tgt.zoom;
        const f = s.tgt.id !== undefined ? list.find((q) => q.id === s.tgt.id) : undefined;
        const tx = f ? f.x : s.tgt.x ?? this.camFc;
        const ty = f ? f.y - 34 : s.tgt.y ?? this.camY;
        z = this.camZoom + (zt - this.camZoom) * w;
        x = this.camX + (tx + (pad.right - pad.left) / 2 / zt - this.camX) * w;
        y = this.camY + (ty - this.camY) * w;
      }
    }
    const halfW = vw / z / 2;
    const halfH = vh / z / 2;
    x = Phaser.Math.Clamp(x, halfW - 120, this.arenaW + 120 - halfW);
    // (touch: a little more floor shows below the fighters, lifting them above the button cluster's lower rows)
    y = Math.min(y, this.floor + (pad.right ? 135 : 70) - halfH);
    // the shake is an offset after the clamp (vertical only)
    const sy = this.shakeOffset(dt, vh / z);
    cam.setZoom(z);
    cam.centerOn(halfW * 2 > this.arenaW + 240 ? this.arenaW / 2 : x, y + sy);
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
      this.insets.right = cluster && cluster.width > 0 ? Math.max(0, css - cluster.left) * k * 0.7 : 0;
      this.insets.left = stick && stick.width > 0 && this.insets.right ? Math.max(0, stick.right) * k * 0.45 : 0;
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
    this.arcN?.destroy();
    this.arcG?.destroy();
    this.addG?.destroy();
    for (const g of this.gfxPool) g.destroy();
    this.gfxPool = [];
  }

  private endProjQuiet(id: number, pv: ProjView) {
    void id;
    pv.fx?.destroy();
    pv.img?.destroy();
    pv.gfx?.destroy();
    pv.sun?.destroy();
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

/**
 * The sim's per-fighter freeze in ticks (hit-stop, or the superpause of a Rift Art), once the snapshot carries it;
 * undefined before that, and the client fakes the hit-stop.
 */
function hitstopOf(v: ViewFighter | null | undefined): number | undefined {
  const f = v as (ViewFighter & { hitstop?: number; pause?: number }) | null | undefined;
  if (typeof f?.hitstop !== 'number') return undefined;
  return Math.max(f.hitstop, f.pause ?? 0);
}
