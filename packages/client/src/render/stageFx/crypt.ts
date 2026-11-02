/**
 * The crypt's stage FX (render/stageFx): a damp underground room. Green-teal mist creeps along the floor, water drips
 * from the vault and each drop splashes in a small ring on the stones, the candles in the niches of the wall picture
 * flicker (placed from arenaLights.json on every mirrored copy of the wall, each throwing a pool of light on the floor below),
 * green fungus specks on the stones glow and die down, one or two spiders lower on their threads, and a few faint wisps drift
 * through the air behind the fighters.
 *
 * Procedural only: the sprites are painted once onto canvas textures, every object is pooled, the randomness is a seeded
 * LCG and nothing allocates per frame. Everything stays low in contrast so it never competes with the fighters; 'low'
 * quality keeps a third of the particles.
 */
import Phaser from 'phaser';
import type { BuildStageFx, StageCtx, StageFx } from './types';
import LIGHTS from '../arenaLights.json';

const K_MIST = 'fx-crypt-mist';
const K_GLOW = 'fx-crypt-glow';
const K_DROP = 'fx-crypt-drop';
const K_RING = 'fx-crypt-ring';
const K_FLAME = 'fx-crypt-flame';
const K_SPIDER = 'fx-crypt-spider';
const K_THREAD = 'fx-crypt-thread';

/** The wall picture's mirrored copies, as render/arena.ts lays them out (odd copies are flipped, so their lamps mirror too). */
const COPIES = [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5];

/** Gravity for the drips (world units per second squared). */
const G = 420;

interface Drop {
  img: Phaser.GameObjects.Image;
  x: number;
  y: number;
  vy: number;
  land: number;
  wait: number;
}
interface Ring {
  img: Phaser.GameObjects.Image;
  age: number;
  life: number;
}
interface Puff {
  img: Phaser.GameObjects.Image;
  x: number;
  y: number;
  vx: number;
  age: number;
  life: number;
  a: number;
  s: number;
}
interface Wisp {
  img: Phaser.GameObjects.Image;
  cx: number;
  cy: number;
  vx: number;
  ph: number;
  sp: number;
  amp: number;
  a: number;
  w: number;
}
interface Candle {
  glow: Phaser.GameObjects.Image;
  core: Phaser.GameObjects.Image;
  /** The light the candle throws on the floor at the wall's foot below it. */
  pool: Phaser.GameObjects.Image;
  ph: number;
  gs: number;
  cs: number;
}
/** A fungus speck on the wall that glows and dies down (wall-fixed): its phase, rate and peak. */
interface Speck {
  img: Phaser.GameObjects.Image;
  ph: number;
  rate: number;
  peak: number;
}
/** A spider dangling on a thread across the wall: its column, the thread's top and the lowest point, and its swing. */
interface Spider {
  body: Phaser.GameObjects.Image;
  thread: Phaser.GameObjects.Image;
  x: number;
  top: number;
  bottom: number;
  ph: number;
  per: number;
}

/** A seeded linear congruential generator (no Math.random): each call returns the next value in [0, 1). */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Paint the crypt's sprites once (shared by every build, so each is guarded by textures.exists): soft blobs, a drip, a ring, a flame. */
function paintTextures(scene: Phaser.Scene): void {
  const blob = (key: string, stops: [number, number][]) => {
    if (scene.textures.exists(key)) return;
    const tex = scene.textures.createCanvas(key, 128, 128)!;
    const g = tex.context;
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    for (const [at, a] of stops) grad.addColorStop(at, `rgba(255,255,255,${a})`);
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    tex.refresh();
  };
  blob(K_MIST, [
    [0, 0.85],
    [0.45, 0.4],
    [1, 0],
  ]);
  blob(K_GLOW, [
    [0, 1],
    [0.2, 0.5],
    [0.6, 0.12],
    [1, 0],
  ]);
  if (!scene.textures.exists(K_DROP)) {
    const tex = scene.textures.createCanvas(K_DROP, 4, 8)!;
    const g = tex.context;
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.ellipse(2, 5.5, 1.8, 2.5, 0, 0, Math.PI * 2);
    g.fill();
    g.fillRect(1.2, 0, 1.6, 4);
    tex.refresh();
  }
  if (!scene.textures.exists(K_RING)) {
    const tex = scene.textures.createCanvas(K_RING, 64, 32)!;
    const g = tex.context;
    g.strokeStyle = '#ffffff';
    g.lineWidth = 2.5;
    g.beginPath();
    g.ellipse(32, 16, 27, 12, 0, 0, Math.PI * 2);
    g.stroke();
    tex.refresh();
  }
  if (!scene.textures.exists(K_THREAD)) {
    const tex = scene.textures.createCanvas(K_THREAD, 2, 2)!;
    tex.context.fillStyle = '#ffffff';
    tex.context.fillRect(0, 0, 2, 2);
    tex.refresh();
  }
  if (!scene.textures.exists(K_SPIDER)) {
    // a spider seen from above: an abdomen, a head, and four pairs of jointed legs
    const tex = scene.textures.createCanvas(K_SPIDER, 16, 14)!;
    const g = tex.context;
    g.fillStyle = '#ffffff';
    g.strokeStyle = '#ffffff';
    g.lineWidth = 1;
    g.beginPath();
    g.ellipse(8, 9, 2.8, 3, 0, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.ellipse(8, 4.5, 1.9, 1.7, 0, 0, Math.PI * 2);
    g.fill();
    for (const s of [-1, 1])
      for (let j = 0; j < 4; j++) {
        const y = 7 + j * 1.2;
        g.beginPath();
        g.moveTo(8 + s * 2, y);
        g.lineTo(8 + s * 5, y - 2 + j * 0.4);
        g.lineTo(8 + s * 7.5, y + 1.5);
        g.stroke();
      }
    tex.refresh();
  }
  if (!scene.textures.exists(K_FLAME)) {
    const tex = scene.textures.createCanvas(K_FLAME, 12, 24)!;
    const g = tex.context;
    const grad = g.createLinearGradient(0, 0, 0, 24);
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(0.55, 'rgba(255,255,255,0.8)');
    grad.addColorStop(1, 'rgba(255,255,255,1)');
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(6, 0);
    g.quadraticCurveTo(12, 11, 9, 19);
    g.quadraticCurveTo(6, 24, 3, 19);
    g.quadraticCurveTo(0, 11, 6, 0);
    g.fill();
    tex.refresh();
  }
}

/** Build the crypt's animated stage elements for one arena (layout and depths as described in types.ts). */
export const build: BuildStageFx = (ctx: StageCtx): StageFx => {
  const { scene, W, floor, wallBase, wallTop, FAR, tw, quality } = ctx;
  paintTextures(scene);
  const rnd = lcg(0x6c2a91d3);
  /** The wall picture's height (world units): the lamps' v runs from wallTop to wallBase + 2, as in render/arena.ts. */
  const H = wallBase + 2 - wallTop;
  /** Every object this build made, destroyed together. */
  const made: Phaser.GameObjects.Image[] = [];
  /** A pooled sprite (visible unless the caller hides it). */
  const sprite = (key: string, depth: number): Phaser.GameObjects.Image => {
    const o = scene.add.image(0, 0, key).setDepth(depth);
    made.push(o);
    return o;
  };
  /** The pool size: a third of the particles on 'low'. */
  const count = (hi: number) => (quality === 'low' ? Math.max(1, Math.round(hi / 3)) : hi);
  let t = 0;
  let dead = false;

  // ---- the candles: the crypt lamps of the wall picture, on every copy of it (they stay fixed to the wall)
  const candles: Candle[] = [];
  const lamps = (LIGHTS as Record<string, { u: number; v: number; size: number; c: string }[]>).crypt ?? [];
  for (const k of COPIES) {
    for (const b of lamps) {
      const u = k % 2 === 0 ? b.u : 1 - b.u;
      const x = W / 2 + k * tw + (u - 0.5) * tw;
      if (x < -tw || x > W + tw) continue;
      const y = wallTop + b.v * H;
      const color = Number.parseInt(b.c.slice(1), 16);
      const glow = sprite(K_GLOW, -19.8)
        .setPosition(x, y)
        .setScrollFactor(FAR, 1)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setTint(color);
      const core = sprite(K_FLAME, -19.75)
        .setPosition(x, y - H * 0.012)
        .setScrollFactor(FAR, 1)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setTint(0xfff0c4);
      const pool = sprite(K_GLOW, -18.7)
        .setPosition(x, wallBase + 12)
        .setScrollFactor(FAR, 1)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setTint(color)
        .setScale(0.8, 0.22);
      candles.push({ glow, core, pool, ph: rnd() * 6.283, gs: (H * 0.4) / 128, cs: (H * 0.024) / 24 });
    }
  }

  // ---- fungus on the wall: green specks that glow, brighten and die down, each on its own rhythm (wall-fixed)
  const specks: Speck[] = [];
  for (let i = 0; i < count(30); i++) {
    const k = COPIES[Math.floor(rnd() * COPIES.length)];
    const u = rnd();
    const x = W / 2 + k * tw + ((k % 2 === 0 ? u : 1 - u) - 0.5) * tw;
    const y = wallTop + H * (0.4 + rnd() * 0.5);
    const img = sprite(K_GLOW, -19.66).setPosition(x, y).setScrollFactor(FAR, 1).setBlendMode(Phaser.BlendModes.ADD).setTint(0x7dffb0).setScale(0.04 + rnd() * 0.03).setAlpha(0);
    specks.push({ img, ph: rnd() * 6.283, rate: 0.6 + rnd() * 1.4, peak: 0.45 + rnd() * 0.4 });
  }

  // ---- spiders: one or two hang on a thread across the wall, lowering and climbing back up now and then
  const spiders: Spider[] = [];
  for (const k of [-2, 1]) {
    if (quality === 'low' && k !== 1) continue;
    const x = W / 2 + k * tw + (rnd() - 0.5) * tw * 0.3;
    const top = wallTop - 2;
    const thread = sprite(K_THREAD, -19.6).setPosition(x, top).setOrigin(0.5, 0).setTint(0xd8e0d4).setAlpha(0.35).setScrollFactor(FAR, 1);
    const body = sprite(K_SPIDER, -19.62).setScale(0.75).setTint(0x9aa59c).setScrollFactor(FAR, 1);
    spiders.push({ body, thread, x, top, bottom: wallBase - 8, ph: rnd() * 6.283, per: 9 + rnd() * 6 });
  }

  // ---- drips: fall from the wall's top to a landing on the floor, then splash; each drip slot waits before its next drop
  const drops: Drop[] = [];
  for (let i = 0; i < count(30); i++) {
    const img = sprite(K_DROP, 7.2).setScale(0.3).setTint(0xa8f2e0).setAlpha(0.8).setVisible(false);
    drops.push({ img, x: 0, y: 0, vy: 0, land: 0, wait: 0.2 + rnd() * 3 });
  }

  // ---- splash rings on the floor (a pool used round-robin)
  const rings: Ring[] = [];
  for (let i = 0; i < count(14); i++) {
    rings.push({ img: sprite(K_RING, -18.7).setTint(0x9ff5e2).setVisible(false), age: 0, life: 0 });
  }
  let ringNext = 0;
  const splash = (x: number, y: number) => {
    const r = rings[ringNext];
    ringNext = (ringNext + 1) % rings.length;
    r.age = 0;
    r.life = 0.55 + rnd() * 0.35;
    r.img.setPosition(x, y).setVisible(true);
  };

  // ---- mist creeping along the floor: soft, flat puffs drifting slowly, fading in and out
  const puffNew = (p: Puff, initial: boolean) => {
    p.x = rnd() * (W + 320) - 160;
    p.y = floor - 6 + (rnd() * 2 - 1) * 22;
    p.vx = (rnd() * 2 - 1) * 9;
    p.life = 8 + rnd() * 7;
    p.age = initial ? rnd() * p.life : 0;
    p.a = 0.16 + rnd() * 0.1;
    p.s = (tw * (0.9 + rnd() * 0.7)) / 128;
  };
  const puffs: Puff[] = [];
  for (let i = 0; i < count(20); i++) {
    const p: Puff = { img: sprite(K_MIST, 7.3).setTint(0x4f9e8e), x: 0, y: 0, vx: 0, age: 0, life: 1, a: 0, s: 1 };
    puffNew(p, true);
    puffs.push(p);
  }

  // ---- faint wisps: pale ghostly blobs drifting through the air behind the fighters
  const wisps: Wisp[] = [];
  for (let i = 0; i < count(7); i++) {
    wisps.push({
      img: sprite(K_GLOW, 7.3).setTint(0xb8f5e6).setBlendMode(Phaser.BlendModes.ADD),
      cx: rnd() * W,
      cy: floor - 40 - rnd() * 110,
      vx: (rnd() < 0.5 ? -1 : 1) * (4 + rnd() * 8),
      ph: rnd() * 6.283,
      sp: 0.3 + rnd() * 0.35,
      amp: 12 + rnd() * 20,
      a: 0.12 + rnd() * 0.08,
      w: H * (0.35 + rnd() * 0.25),
    });
  }

  return {
    update(dt: number): void {
      if (dead) return;
      const step = Math.min(Math.max(dt, 0), 0.1);
      t += step;

      // candles: a layered flicker, each flame out of step with the others
      for (const c of candles) {
        const f = 0.7 + 0.2 * Math.sin(t * 6.3 + c.ph) + 0.12 * Math.sin(t * 13.1 + c.ph * 2.3) + 0.1 * (rnd() - 0.5);
        c.glow.setAlpha(0.55 * f).setScale(c.gs * (0.92 + 0.16 * f));
        c.core.setAlpha(0.85 * f).setScale(c.cs * (0.9 + 0.2 * f), c.cs * (0.9 + 0.3 * f));
        c.pool.setAlpha(0.3 * f);
      }

      // fungus: each speck swells, shines and goes dark again
      for (const s of specks) {
        const p = Math.sin(t * s.rate + s.ph);
        s.img.setAlpha(p > 0 ? s.peak * p * p * p : 0);
      }

      // spiders: each lowers on its thread to its lowest point, then climbs back, swaying a little
      for (const sp of spiders) {
        const k = 0.5 - 0.5 * Math.cos((t / sp.per) * Math.PI * 2 + sp.ph);
        const y = sp.top + (sp.bottom - sp.top) * k;
        sp.body.setPosition(sp.x + 1.2 * Math.sin(t * 1.7 + sp.ph), y).setRotation(0.08 * Math.sin(t * 2.4 + sp.ph));
        sp.thread.setScale(0.5, Math.max(1, y - sp.top) / 2);
      }

      // drips: fall with gravity, stretch as they speed up, splash on landing, then wait for the next drop
      for (const d of drops) {
        if (d.wait > 0) {
          d.wait -= step;
          if (d.wait <= 0) {
            d.x = rnd() * W;
            d.y = wallTop + rnd() * H * 0.15;
            d.vy = 0;
            d.land = wallBase + 16 + rnd() * (floor + 6 - wallBase - 16);
            d.img.setPosition(d.x, d.y).setVisible(true);
          }
          continue;
        }
        d.vy += G * step;
        d.y += d.vy * step;
        if (d.y >= d.land) {
          splash(d.x, d.land);
          d.img.setVisible(false);
          d.wait = 0.6 + rnd() * 3;
        } else {
          d.img.setPosition(d.x, d.y).setScale(0.3, 0.3 + Math.min(d.vy, 600) * 0.0012);
        }
      }

      // splash rings: open out and fade
      for (const r of rings) {
        if (r.age >= r.life) {
          r.img.setVisible(false);
          continue;
        }
        r.age += step;
        const p = Math.min(1, r.age / r.life);
        const s = (H * (0.08 + 0.14 * p)) / 64;
        r.img.setScale(s, s * 0.55).setAlpha(0.45 * (1 - p));
      }

      // mist: each puff fades in, drifts and fades out, then starts again somewhere along the floor
      for (const p of puffs) {
        p.age += step;
        if (p.age >= p.life) puffNew(p, false);
        p.x += p.vx * step;
        if (p.x < -160) p.x += W + 320;
        else if (p.x > W + 160) p.x -= W + 320;
        const k = p.age / p.life;
        const grow = 1 + 0.12 * k;
        p.img.setPosition(p.x, p.y).setAlpha(p.a * Math.sin(Math.PI * k)).setScale(p.s * grow, p.s * 0.42 * grow);
      }

      // wisps: a slow figure-of-eight through the air, breathing in and out
      for (const w of wisps) {
        w.cx += w.vx * step;
        if (w.cx < -120) w.cx += W + 240;
        else if (w.cx > W + 120) w.cx -= W + 240;
        const x = w.cx + Math.sin(t * w.sp + w.ph) * w.amp;
        const y = w.cy + Math.cos(t * w.sp * 0.7 + w.ph * 1.3) * w.amp * 0.3;
        const a = w.a * (0.55 + 0.45 * Math.sin(t * 0.8 + w.ph * 2));
        w.img.setPosition(x, y).setAlpha(a).setScale(w.w / 128, (w.w * 1.25) / 128);
      }
    },
    destroy(): void {
      dead = true;
      for (const o of made) o.destroy();
      made.length = 0;
    },
  };
};
