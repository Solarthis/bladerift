/**
 * The gothic throne hall's stage elements, laid on the wall picture the way render/arena.ts lays it out (the copies, the
 * lamp positions from render/arenaLights.json "hall"): candle flames on the sconces and the chandelier with a soft halo
 * under each sconce, the odd smoke wisp and ember rising from a candle, the chandelier catching the light now and then,
 * and dust specks falling down the centre window's shaft.
 *
 * Procedural only: small canvas textures made once, fixed pools (nothing is allocated per frame), a seeded LCG for every
 * random choice. The wall-fixed items scroll with the wall (FAR) at depths -19.66 .. -19.6, under the floor strips (-19);
 * the dust is air at 7.5, behind the fighters, with the window shafts (7.4). Low quality keeps a third of the particles
 * and drops the halos.
 */
import Phaser from 'phaser';
import type { BuildStageFx, StageCtx, StageFx } from './types';
import LIGHTS from '../arenaLights.json';

type Img = Phaser.GameObjects.Image;

/** The wall picture's copies, as render/arena.ts lays them out (its COPIES). */
const COPIES = [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5];
/** The copies whose window throws a shaft (the even ones, as in render/arena.ts). */
const SHAFT_COPIES = [-4, -2, 0, 2, 4];
/**
 * The centre window's shaft. Mirrors BEAMS.hall in render/arena.ts (window centre on the picture, its width as a share of
 * the picture, how far the patch lands from under the window, and the patch's depth on the floor: 1 = the fighters' line).
 */
const SHAFT = { u: 0.5, v: 0.36, w: 0.1, dx: 160, p0: 0.78, p1: 1.1 };
/** Halo radii (world units): under a sconce, and around the chandelier. */
const R_SCONCE = 9;
const R_CHANDELIER = 18;
/** A chandelier glint: how long one flash lasts (s) and its size (world units). */
const GLINT_T = 0.55;
const GLINT_S = 4;

interface Lamp {
  u: number;
  v: number;
  size: number;
  c: string;
}
/** The hall's lamp positions: the same ones the arena lights are made from. */
const HALL = (LIGHTS as Record<string, Lamp[]>).hall ?? [];

interface Flame {
  img: Img;
  x: number;
  y: number;
  sx: number;
  sy: number;
  ph: number;
}
interface Halo {
  img: Img;
  x: number;
  y: number;
  s: number;
  a: number;
  ph: number;
}
interface Glint {
  img: Img;
  left: number;
  on: boolean;
}
interface Puff {
  img: Img;
  on: boolean;
  age: number;
  life: number;
  x0: number;
  y0: number;
  ph: number;
  sp: number;
  s0: number;
  s1: number;
  peak: number;
}
interface Ember {
  img: Img;
  on: boolean;
  age: number;
  life: number;
  x0: number;
  y0: number;
  ph: number;
  vy: number;
}
interface Mote {
  img: Img;
  shaft: number;
  s: number;
  ds: number;
  lat: number;
  ph: number;
}
interface Candle {
  x: number;
  y: number;
}

const smooth = (e: number) => (e <= 0 ? 0 : e >= 1 ? 1 : e * e * (3 - 2 * e));

/** Paints a white texture whose alpha is `alpha(u, v)` (u across, v down, both 0..1); sprites are tinted where used. */
function paint(scene: Phaser.Scene, key: string, w: number, h: number, alpha: (u: number, v: number) => number): void {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, w, h);
  if (!tex) return;
  const img = tex.context.createImageData(w, h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = Math.round(255 * Math.min(1, Math.max(0, alpha((x + 0.5) / w, (y + 0.5) / h))));
    }
  tex.context.putImageData(img, 0, 0);
  tex.refresh();
}

function paintTextures(scene: Phaser.Scene): void {
  // a candle flame: pointed at the top, round at the foot, brighter in the core
  paint(scene, 'hall-flame', 8, 16, (u, v) => {
    const hw = v < 0.6 ? 0.5 * Math.pow(v / 0.6, 0.6) : 0.5 * Math.sqrt(Math.max(0, 1 - ((v - 0.6) / 0.4) ** 2));
    if (hw <= 0) return 0;
    const d = Math.abs(u - 0.5) / hw;
    return smooth(1 - d) * (0.5 + 0.5 * (1 - d)) * (0.6 + 0.4 * v);
  });
  // a soft round glow (the halo under a sconce, the chandelier's light)
  paint(scene, 'hall-glow', 48, 48, (u, v) => smooth(1 - 2 * Math.hypot(u - 0.5, v - 0.5)) ** 1.5);
  // a smoke wisp: a faint blot, lobed a little so it does not read as a dot
  paint(scene, 'hall-wisp', 32, 32, (u, v) => {
    const r = 2 * Math.hypot(u - 0.5, v - 0.5);
    return smooth(1 - r) * (0.7 + 0.3 * Math.sin(Math.atan2(v - 0.5, u - 0.5) * 3 + 1.3));
  });
  // a speck of dust or an ember
  paint(scene, 'hall-speck', 4, 4, (u, v) => smooth(1 - 2.4 * Math.hypot(u - 0.5, v - 0.5)));
  // a chandelier glint: a bright core with thin four-point spikes
  paint(scene, 'hall-glint', 11, 11, (u, v) => {
    const dx = (u - 0.5) * 2;
    const dy = (v - 0.5) * 2;
    const r = Math.hypot(dx, dy);
    const core = smooth(1 - 2.2 * r);
    const spike =
      Math.max(0, 1 - Math.abs(dx)) * Math.max(0, 1 - Math.abs(dy) / 0.12) +
      Math.max(0, 1 - Math.abs(dy)) * Math.max(0, 1 - Math.abs(dx) / 0.12);
    return Math.min(1, core + 0.8 * spike * (1 - r));
  });
}

/** The first idle item of a pool, or undefined when all are busy. */
function idle<T extends { on: boolean }>(pool: T[]): T | undefined {
  for (const p of pool) if (!p.on) return p;
  return undefined;
}

export const build: BuildStageFx = (ctx: StageCtx): StageFx => {
  const { scene, W, FAR, wallBase, wallTop, tw } = ctx;
  const low = ctx.quality === 'low';
  /** Low quality: a third of the particles. */
  const third = (n: number) => (low ? Math.max(1, Math.round(n / 3)) : n);
  paintTextures(scene);

  // seeded LCG: the same layout and timing every run
  let seed = 0x6a09e667;
  const rnd = (): number => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  // the wall picture spans wallTop..wallBase+2; a point of it (copy k, u across, v down) sits here in world units
  const H = wallBase + 2 - wallTop;
  const yOf = (v: number) => wallBase + 2 - (1 - v) * H;
  const xOf = (k: number, u: number) => W / 2 + k * tw + ((k % 2 === 0 ? u : 1 - u) - 0.5) * tw;
  // the floor's depth as render/arena.ts has it: the wall's foot sits FAR of the way to the fighters' line
  const D = (ctx.floor - wallBase) / (1 - FAR);
  const horizon = ctx.floor - D;

  // the camera, read once per frame (kept in numbers, so the helpers below allocate nothing)
  const view = { z: 1, sx0: 0, sy0: 0, Wv: 1, Hv: 1 };
  /** Screen x of a point on the wall (scroll factor FAR), projected as render/arena.ts does. */
  const wallSX = (x: number) => view.Wv / 2 + view.z * (x - FAR * view.sx0 - view.Wv / 2);
  const onWall = (x: number) => {
    const s = wallSX(x);
    return s > -60 && s < view.Wv + 60;
  };
  const scrY = (y: number) => view.Hv / 2 + view.z * (y - view.sy0 - view.Hv / 2);
  /** Screen x of the floor point at depth p under world x F (as render/arena.ts). */
  const floorSX = (F: number, p: number) => view.Wv / 2 + view.z * p * (F - view.sx0 - view.Wv / 2);
  /** A screen pixel as a world point, for air objects (scroll factor 1). */
  const worldX = (sx: number) => view.sx0 + view.Wv / 2 + (sx - view.Wv / 2) / view.z;
  const worldY = (sy: number) => view.sy0 + view.Hv / 2 + (sy - view.Hv / 2) / view.z;

  const owned: Img[] = [];
  const make = (key: string, x: number, y: number, depth: number, add: boolean, tint: number, wall: boolean): Img => {
    const img = scene.add.image(x, y, key).setDepth(depth).setTint(tint).setVisible(false);
    if (add) img.setBlendMode(Phaser.BlendModes.ADD);
    if (wall) img.setScrollFactor(FAR, 1);
    owned.push(img);
    return img;
  };

  // ---- candle flames: one per lamp on each copy (low quality keeps every third); the sconces' tips feed the smoke
  const flames: Flame[] = [];
  const candles: Candle[] = [];
  let n = 0;
  for (const k of COPIES)
    for (const L of HALL) {
      const i = n++;
      if (low && i % 3 !== 0) continue;
      const x = xOf(k, L.u);
      const y = yOf(L.v);
      const fw = Math.max(1.6, L.size * tw * 1.4);
      const fh = fw * 2;
      const img = make('hall-flame', x, y, -19.6, true, parseInt(L.c.slice(1), 16), true).setOrigin(0.5, 0.7);
      flames.push({ img, x, y, sx: fw / 8, sy: fh / 16, ph: rnd() * 6.283 });
      if (L.v >= 0.2) candles.push({ x, y: y - 0.7 * fh });
    }

  // ---- the lamps grouped: each sconce's candles as one halo, the chandelier as one (its middle)
  const groups: { u: number; v: number; n: number; c: number; chand: boolean }[] = [];
  for (const L of HALL) {
    const chand = L.v < 0.2;
    const g = groups.find(
      (q) => q.chand === chand && (chand || (Math.abs(q.u - L.u) < 0.04 && Math.abs(q.v - L.v) < 0.05)),
    );
    if (g) {
      g.u = (g.u * g.n + L.u) / (g.n + 1);
      g.v = (g.v * g.n + L.v) / (g.n + 1);
      g.n++;
    } else groups.push({ u: L.u, v: L.v, n: 1, c: parseInt(L.c.slice(1), 16), chand });
  }
  const halos: Halo[] = [];
  if (!low)
    for (const k of COPIES)
      for (const g of groups) {
        const R = g.chand ? R_CHANDELIER : R_SCONCE;
        const x = xOf(k, g.u);
        const y = yOf(g.v);
        const img = make('hall-glow', x, y, -19.62, true, g.c, true);
        halos.push({ img, x, y, s: (2 * R) / 48, a: g.chand ? 0.07 : 0.12, ph: rnd() * 6.283 });
      }

  // ---- the chandelier's glints: a few at a time, each flashing now and then on a spot of the chandelier
  const glints: Glint[] = Array.from({ length: third(3) }, () => ({
    img: make('hall-glint', 0, 0, -19.61, true, 0xfff3d6, true).setScale(0),
    left: 0.5 + rnd() * 4,
    on: false,
  }));

  // ---- candle smoke: faint grey wisps drifting up off a sconce
  const puffs: Puff[] = Array.from({ length: third(10) }, () => ({
    img: make('hall-wisp', 0, 0, -19.66, false, 0xcfc7d8, true),
    on: false,
    age: 0,
    life: 1,
    x0: 0,
    y0: 0,
    ph: 0,
    sp: 0,
    s0: 2,
    s1: 7,
    peak: 0.14,
  }));

  // ---- embers: the odd spark lifting off a sconce's flame
  const embers: Ember[] = Array.from({ length: third(6) }, () => ({
    img: make('hall-speck', 0, 0, -19.6, true, 0xff8a3a, true),
    on: false,
    age: 0,
    life: 1,
    x0: 0,
    y0: 0,
    ph: 0,
    vy: 0,
  }));

  // ---- dust falling down the centre window's shaft (air, scroll 1, so it sits in the room's light)
  const respawn = (m: Mote, s: number) => {
    m.shaft = Math.floor(rnd() * SHAFT_COPIES.length);
    m.s = s;
    m.ds = 0.03 + rnd() * 0.05;
    m.lat = rnd() * 2 - 1;
    m.ph = rnd() * 6.283;
  };
  const motes: Mote[] = Array.from({ length: third(40) }, () => {
    const img = make('hall-speck', 0, 0, 7.5, true, 0xfff0d0, false).setScale(0.3);
    const m: Mote = { img, shaft: 0, s: 0, ds: 0, lat: 0, ph: 0 };
    respawn(m, rnd());
    return m;
  });
  // each shaft's window x (world), and the floor point it lands on (world x), as render/arena.ts places them
  const nS = SHAFT_COPIES.length;
  const shXw = SHAFT_COPIES.map((k) => xOf(k, SHAFT.u));
  const shF = shXw.map((xw) => W / 2 + (xw - W / 2) / FAR + SHAFT.dx);
  const shAx = new Float64Array(nS);
  const shBx = new Float64Array(nS);
  const shW = new Float64Array(nS);
  const PM = (SHAFT.p0 + SHAFT.p1) / 2;
  const sYw = yOf(SHAFT.v);
  const floorYShaft = horizon + D * PM;

  // timers and the pick of a candle in view
  let puffTimer = 1 + rnd() * 2;
  let emberTimer = 2 + rnd() * 3;
  let t = 0;
  let dead = false;
  const pickCandle = (): Candle | undefined => {
    if (candles.length === 0) return undefined;
    for (let tries = 0; tries < 4; tries++) {
      const c = candles[Math.floor(rnd() * candles.length)];
      if (c && onWall(c.x)) return c;
    }
    return undefined;
  };

  return {
    update(dt: number, cam: Phaser.Cameras.Scene2D.Camera): void {
      if (dead) return;
      const h = Math.min(0.1, Math.max(0, dt));
      t += h;
      view.z = cam.zoom || 1;
      view.sx0 = cam.scrollX;
      view.sy0 = cam.scrollY;
      view.Wv = scene.scale.width;
      view.Hv = scene.scale.height;

      // candle flames: each flickers on its own phases, with a little sway
      for (const f of flames) {
        const on = onWall(f.x);
        if (f.img.visible !== on) f.img.setVisible(on);
        if (!on) continue;
        const a = 0.5 * Math.sin(t * 11 + f.ph) + 0.3 * Math.sin(t * 17.3 + f.ph * 1.9) + 0.2 * Math.sin(t * 5.7 + f.ph * 0.7);
        f.img.setPosition(f.x + 0.15 * Math.sin(t * 6.1 + f.ph), f.y);
        f.img.setScale(f.sx * (1 + 0.1 * a), f.sy * (1 + 0.16 * a));
        f.img.setAlpha(0.6 + 0.2 * a);
      }

      // the halos under the sconces and the chandelier breathe with the flames
      for (const hl of halos) {
        const on = onWall(hl.x);
        if (hl.img.visible !== on) hl.img.setVisible(on);
        if (!on) continue;
        const a = 0.6 * Math.sin(t * 6 + hl.ph) + 0.4 * Math.sin(t * 13.1 + hl.ph * 2);
        hl.img.setAlpha(hl.a * (1 + 0.25 * a));
        hl.img.setScale(hl.s * (1 + 0.04 * a));
      }

      // chandelier glints: a quick four-point flash, then quiet for a while
      for (const g of glints) {
        g.left -= h;
        if (g.left > 0) {
          if (g.on) {
            const p = 1 - g.left / GLINT_T;
            const e = Math.sin(Math.PI * p);
            g.img.setScale((GLINT_S * e) / 11);
            g.img.setAlpha(e);
            g.img.setRotation(p * 0.6);
          }
          continue;
        }
        if (g.on) {
          g.on = false;
          g.img.setVisible(false);
          g.left = 1.5 + rnd() * 4;
          continue;
        }
        // time to flash: a spot on the chandelier in a copy near the middle (or try again soon)
        const k = Math.round((rnd() * 2 - 1) * 3);
        const x = xOf(k, 0.5 + (rnd() - 0.5) * 0.12);
        if (!onWall(x)) {
          g.left = 0.5 + rnd();
          continue;
        }
        g.img.setPosition(x, yOf(0.07 + (rnd() - 0.5) * 0.05)).setVisible(true);
        g.on = true;
        g.left = GLINT_T;
      }

      // candle smoke: a new wisp now and then from a sconce in view, rising, widening and fading
      puffTimer -= h;
      if (puffTimer <= 0) {
        puffTimer = (low ? 3 : 1.4) + rnd() * (low ? 3 : 2.2);
        const c = pickCandle();
        const q = idle(puffs);
        if (c && q) {
          q.on = true;
          q.age = 0;
          q.life = 3.5 + rnd() * 2;
          q.x0 = c.x + (rnd() - 0.5);
          q.y0 = c.y - 1;
          q.ph = rnd() * 6.283;
          q.sp = 5 + rnd() * 4;
          q.s0 = 2 + rnd();
          q.s1 = 6 + rnd() * 3;
          q.peak = 0.12 + rnd() * 0.06;
          q.img.setPosition(q.x0, q.y0).setVisible(true);
        }
      }
      for (const q of puffs) {
        if (!q.on) continue;
        q.age += h;
        if (q.age >= q.life) {
          q.on = false;
          q.img.setVisible(false);
          continue;
        }
        const p = q.age / q.life;
        q.img.setPosition(q.x0 + Math.sin(q.age * 0.9 + q.ph) * (1 + 2 * p), q.y0 - q.sp * q.age);
        q.img.setScale((q.s0 + (q.s1 - q.s0) * p) / 32);
        q.img.setAlpha(q.peak * Math.sin(Math.PI * p));
      }

      // embers: a rare spark from a sconce's flame, lifting and dying out
      emberTimer -= h;
      if (emberTimer <= 0) {
        emberTimer = (low ? 6 : 2.5) + rnd() * (low ? 6 : 3.5);
        const c = pickCandle();
        const e = idle(embers);
        if (c && e) {
          e.on = true;
          e.age = 0;
          e.life = 1.2 + rnd() * 0.8;
          e.x0 = c.x;
          e.y0 = c.y;
          e.ph = rnd() * 6.283;
          e.vy = 6 + rnd() * 6;
          e.img.setPosition(c.x, c.y).setVisible(true);
        }
      }
      for (const e of embers) {
        if (!e.on) continue;
        e.age += h;
        if (e.age >= e.life) {
          e.on = false;
          e.img.setVisible(false);
          continue;
        }
        const p = e.age / e.life;
        e.img.setPosition(e.x0 + Math.sin(e.age * 5 + e.ph) * (0.6 + p), e.y0 - e.vy * e.age);
        e.img.setScale(0.35 * (1 - 0.5 * p));
        e.img.setAlpha(0.9 * (1 - p));
      }

      // the window shafts on screen (as render/arena.ts projects them this frame)
      const ay = scrY(sYw);
      const by = scrY(floorYShaft);
      for (let j = 0; j < nS; j++) {
        shAx[j] = wallSX(shXw[j]);
        shBx[j] = floorSX(shF[j], PM);
        shW[j] = view.z * SHAFT.w * tw * 0.5;
      }
      // dust specks falling down a shaft, from the window to the floor patch, a little side to side
      for (const m of motes) {
        m.s += m.ds * h;
        if (m.s >= 1) respawn(m, 0);
        const j = m.shaft;
        const ax = shAx[j];
        const bx = shBx[j];
        const sx = ax + (bx - ax) * m.s + m.lat * shW[j] * (0.4 + 1.2 * m.s) + Math.sin(t * 0.8 + m.ph) * 2;
        const sy = ay + (by - ay) * m.s;
        const on = sx > -20 && sx < view.Wv + 20 && sy > -20 && sy < view.Hv + 20;
        if (m.img.visible !== on) m.img.setVisible(on);
        if (!on) continue;
        m.img.setPosition(worldX(sx), worldY(sy));
        m.img.setAlpha(0.5 * Math.sin(Math.PI * m.s) * (0.6 + 0.4 * Math.sin(t * 2.1 + m.ph * 3)));
      }
    },

    destroy(): void {
      dead = true;
      for (const img of owned) img.destroy();
      owned.length = 0;
    },
  };
};
