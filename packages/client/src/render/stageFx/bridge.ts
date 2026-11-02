/**
 * The moonlit bridge at night, as seen from its back wall (stage FX for the 'bridge' arena): clouds drifting across the
 * moon, a faint moon halo, the parapet lanterns flickering, distant lights in the town and behind the arches twinkling,
 * sea mist rolling low along the far floor, and the odd bat far off in the sky. All procedural: a few canvas textures made
 * once, pooled images, and a seeded LCG for every choice (no Math.random, no per-frame allocation). It stays faint and sits
 * behind the fighters; 'low' quality keeps about a third of the particles.
 */
import type Phaser from 'phaser';
import LIGHTS from '../arenaLights.json';
import type { BuildStageFx, StageCtx, StageFx } from './types';

/** The moon on the wall picture: its centre, as shares of the picture's width and height (from the top). */
const MOON = { u: 0.766, v: 0.07 };
/** Distant lights in the town and behind the arches, as shares of the wall picture (read off the picture). */
const DISTANT: [number, number][] = [
  [0.125, 0.128], [0.919, 0.119], [0.89, 0.167], [0.757, 0.182], [0.783, 0.181], [0.102, 0.213], [0.81, 0.25],
  [0.777, 0.248], [0.899, 0.558], [0.809, 0.543], [0.902, 0.6], [0.755, 0.521], [0.487, 0.55], [0.213, 0.545],
  [0.604, 0.499], [0.72, 0.526], [0.842, 0.531], [0.5, 0.57],
];
/** Tints for the twinkles: warm lamp light, and a few cool moonlit ones. */
const TWINKLE_TINT = [0xffd27a, 0xffb35c, 0xfff0d0, 0xbfd4ff];
const GLOW = 'bf-glow';
const MIST = 'bf-mist';
const CLOUD_KEYS = ['bf-cloud-0', 'bf-cloud-1', 'bf-cloud-2'];
/** Bat silhouettes, wings up and wings down. */
const BAT_KEYS = ['bf-bat-up', 'bf-bat-down'];

/** A seeded linear congruential generator: each call returns a number in [0, 1). */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** One soft white blob (a circle of radius r, squashed by sx and sy) with peak alpha a, painted on a canvas texture. */
function blob(g: CanvasRenderingContext2D, x: number, y: number, r: number, sx: number, sy: number, a: number): void {
  g.save();
  g.translate(x, y);
  g.scale(sx, sy);
  const grd = g.createRadialGradient(0, 0, 0, 0, 0, r);
  grd.addColorStop(0, `rgba(255,255,255,${a})`);
  grd.addColorStop(0.5, `rgba(255,255,255,${a * 0.5})`);
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(-r, -r, r * 2, r * 2);
  g.restore();
}

/** Make the procedural textures once (white, tinted per use); later builds reuse them. */
function makeTextures(scene: Phaser.Scene): void {
  const paint = (key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): void => {
    if (scene.textures.exists(key)) return;
    const tex = scene.textures.createCanvas(key, w, h);
    if (!tex) return;
    draw(tex.context);
    tex.refresh();
  };
  // a soft round glow: lanterns, twinkles, the moon halo
  paint(GLOW, 64, 64, (g) => blob(g, 32, 32, 32, 1, 1, 1));
  // cloud banks: a row of puffs, three variants
  for (let v = 0; v < CLOUD_KEYS.length; v++) {
    const r = lcg(0x1d2c + v * 7919);
    paint(CLOUD_KEYS[v], 256, 64, (g) => {
      for (let i = 0; i < 8; i++) {
        blob(g, 56 + i * 18 + r() * 8, 32 + (r() - 0.5) * 12, 26 + r() * 16, 1, 0.5 + r() * 0.2, 0.55 + r() * 0.25);
      }
    });
  }
  // sea mist: long, flat, pale
  const mr = lcg(0x5ea1);
  paint(MIST, 256, 64, (g) => {
    for (let i = 0; i < 8; i++) {
      blob(g, 48 + i * 22 + mr() * 10, 32 + (mr() - 0.5) * 8, 40 + mr() * 14, 1, 0.3 + mr() * 0.1, 0.5 + mr() * 0.2);
    }
  });
  // a bat in silhouette: 32 x 16, wings up or down
  const bat = (up: boolean) => (g: CanvasRenderingContext2D) => {
    const tip = up ? 1 : 13;
    g.fillStyle = '#000';
    g.beginPath();
    g.moveTo(15, 9);
    g.quadraticCurveTo(9, 6, 1, tip);
    g.quadraticCurveTo(5, 11, 8, 12);
    g.quadraticCurveTo(12, 12, 15, 11);
    g.closePath();
    g.fill();
    g.beginPath();
    g.moveTo(17, 9);
    g.quadraticCurveTo(23, 6, 31, tip);
    g.quadraticCurveTo(27, 11, 24, 12);
    g.quadraticCurveTo(20, 12, 17, 11);
    g.closePath();
    g.fill();
    g.beginPath();
    g.ellipse(16, 9.5, 1.8, 3, 0, 0, Math.PI * 2);
    g.fill();
  };
  paint(BAT_KEYS[0], 32, 16, bat(true));
  paint(BAT_KEYS[1], 32, 16, bat(false));
}

interface Glow {
  o: Phaser.GameObjects.Image;
  ph: number;
  base: number;
}
interface Dot {
  o: Phaser.GameObjects.Image;
  life: number;
  freq: number;
  ph: number;
  peak: number;
}
/** A soft band drifting along (clouds, mist): its centre, width and drift. */
interface Drift {
  o: Phaser.GameObjects.Image;
  w: number;
  x: number;
  y: number;
  speed: number;
  ph: number;
  base: number;
}
interface Bat {
  o: Phaser.GameObjects.Image;
  on: boolean;
  x: number;
  y: number;
  vx: number;
  ph: number;
  flap: number;
  up: boolean;
}

/** The moonlit bridge's night, laid over the wall picture and the floor (see the file comment). */
export const build: BuildStageFx = (ctx: StageCtx): StageFx => {
  const { scene, W, tw, wallBase, wallTop, FAR, floor } = ctx;
  makeTextures(scene);
  const low = ctx.quality === 'low';
  /** How many of a high-quality pool are kept: a third on 'low'. */
  const count = (high: number) => (low ? Math.max(1, Math.round(high / 3)) : high);
  const rnd = lcg(0x2b7f1);
  // the wall picture is WALL_H world units tall, from wallTop (its top) to wallBase + 2 (its foot), as in render/arena.ts
  const wallH = wallBase + 2 - wallTop;
  // the span the wall copies cover
  const X0 = W / 2 - 5.5 * tw;
  const X1 = W / 2 + 5.5 * tw;
  /** World x of a point u (share of the picture's width) on copy k: the same mirrored layout as render/arena.ts. */
  const picX = (u: number, k: number) => W / 2 + k * tw + ((k % 2 === 0 ? u : 1 - u) - 0.5) * tw;
  /** World y of a point v (share of the picture's height, from the top). */
  const picY = (v: number) => wallTop + v * wallH;
  // the copies of the wall that reach the arena
  const copies: number[] = [];
  for (let k = -5; k <= 5; k++) {
    const c = W / 2 + k * tw;
    if (c + tw / 2 > -tw && c - tw / 2 < W + tw) copies.push(k);
  }
  // the four big parapet lanterns, from the same light list the arena uses
  const lanterns = ((LIGHTS as Record<string, { u: number; v: number; size: number }[]>).bridge ?? []).filter(
    (b) => b.size >= 0.012,
  );

  const all: Phaser.GameObjects.Image[] = [];
  const add = (x: number, y: number, key: string, depth: number, scroll: number): Phaser.GameObjects.Image => {
    const o = scene.add.image(x, y, key).setDepth(depth).setScrollFactor(scroll, 1);
    all.push(o);
    return o;
  };

  // ---- the moon's halo on every copy of the wall (the moon itself is painted in the picture)
  for (const k of copies) {
    add(picX(MOON.u, k), picY(MOON.v), GLOW, -19.84, FAR).setScale(1.4).setTint(0xcfdcff).setAlpha(0.2).setBlendMode('ADD');
  }

  // ---- the parapet lanterns: a warm glow that flickers (on 'low' only the copies near the middle)
  const glows: Glow[] = [];
  for (const k of copies) {
    if (low && Math.abs(k) > 1) continue;
    for (const b of lanterns) {
      const o = add(picX(b.u, k), picY(b.v), GLOW, -19.7, FAR).setScale(0.7).setTint(0xffb866).setBlendMode('ADD');
      glows.push({ o, ph: rnd() * 6.28, base: 0.3 + rnd() * 0.12 });
    }
  }

  // ---- distant lights in the town and behind the arches: each dot picks a new spot when its twinkle runs out
  const place = (d: Dot): void => {
    const p = DISTANT[Math.floor(rnd() * DISTANT.length)];
    const k = copies[Math.floor(rnd() * copies.length)];
    d.o.setPosition(picX(p[0], k), picY(p[1])).setTint(TWINKLE_TINT[Math.floor(rnd() * TWINKLE_TINT.length)]);
    d.life = 5 + rnd() * 9;
    d.freq = 1.2 + rnd() * 2.6;
    d.ph = rnd() * 6.28;
    d.peak = 0.45 + rnd() * 0.4;
  };
  const dots: Dot[] = [];
  for (let i = 0; i < count(36); i++) {
    const o = add(0, 0, GLOW, -19.72, FAR).setScale(0.1).setBlendMode('ADD').setAlpha(0);
    const d: Dot = { o, life: 0, freq: 1, ph: 0, peak: 0.5 };
    place(d);
    d.life *= rnd(); // stagger the respawns
    dots.push(d);
  }

  // ---- clouds drifting across the moon area at the top of the wall
  const clouds: Drift[] = [];
  for (let i = 0; i < count(7); i++) {
    const w = 200 + rnd() * 150;
    const h = 26 + rnd() * 16;
    const x = X0 + rnd() * (X1 - X0);
    const y = picY(0.05 + rnd() * 0.2);
    const o = add(x, y, CLOUD_KEYS[i % CLOUD_KEYS.length], -19.82, FAR).setScale(w / 256, h / 64).setTint(0xb4c4e6);
    clouds.push({ o, w, x, y, speed: 1.2 + rnd() * 2.4, ph: rnd() * 6.28, base: 0.2 + rnd() * 0.12 });
  }

  // ---- sea mist rolling low along the far floor, behind the fighters
  const mists: Drift[] = [];
  for (let i = 0; i < count(6); i++) {
    const w = 300 + rnd() * 200;
    const h = 22 + rnd() * 16;
    const x = -100 + rnd() * (W + 200);
    const y = floor - 46 + rnd() * 60;
    const o = add(x, y, MIST, -18.5, 1).setScale(w / 256, h / 64).setTint(0x9fb6d8);
    mists.push({ o, w, x, y, speed: 4 + rnd() * 8, ph: rnd() * 6.28, base: 0.1 + rnd() * 0.06 });
  }

  // ---- bats, now and then, far off across the sky above the wall
  const bats: Bat[] = [];
  for (let i = 0; i < count(3); i++) {
    const o = add(0, 0, BAT_KEYS[0], -19.78, FAR).setScale(0.2).setTint(0x1c2640).setAlpha(0);
    bats.push({ o, on: false, x: 0, y: 0, vx: 0, ph: 0, flap: 0, up: true });
  }
  let batClock = 8 + rnd() * 10;
  let t = 0;
  let dead = false;

  return {
    update(dt: number): void {
      if (dead) return;
      const h = Math.min(Math.max(dt, 0), 0.1);
      t += h;

      for (const c of clouds) {
        c.x += c.speed * h;
        if (c.x - c.w / 2 > X1) c.x = X0 - c.w / 2;
        c.o.setPosition(c.x, c.y).setAlpha(c.base * (0.85 + 0.15 * Math.sin(t * 0.25 + c.ph)));
      }

      for (const m of mists) {
        m.x += m.speed * h;
        if (m.x - m.w / 2 > W + 120) m.x = -120 - m.w / 2;
        m.o
          .setPosition(m.x, m.y + Math.sin(t * 0.21 + m.ph) * 4)
          .setAlpha(m.base * (0.8 + 0.2 * Math.sin(t * 0.13 + m.ph * 2)));
      }

      for (const g of glows) {
        // three slow sines, one quicker: a lantern guttering rather than pulsing
        const n = Math.sin(t * 9.1 + g.ph) * 0.5 + Math.sin(t * 23.7 + g.ph * 1.7) * 0.3 + Math.sin(t * 4.3 + g.ph * 0.6) * 0.2;
        g.o.setAlpha(g.base * (0.85 + 0.15 * n));
      }

      for (const d of dots) {
        d.life -= h;
        if (d.life <= 0) place(d);
        const s = Math.sin(t * d.freq + d.ph);
        // a narrow sparkle: dark most of the time, bright for a moment
        d.o.setAlpha(s > 0 ? d.peak * s * s * s * s : 0);
      }

      batClock -= h;
      if (batClock <= 0) {
        batClock = (low ? 2.2 : 1) * (8 + rnd() * 12);
        for (const b of bats) {
          if (b.on) continue;
          const dir = rnd() < 0.5 ? 1 : -1;
          b.on = true;
          b.x = dir > 0 ? X0 - 30 : X1 + 30;
          b.y = picY(0.1 + rnd() * 0.2);
          b.vx = dir * (16 + rnd() * 12);
          b.ph = rnd() * 6.28;
          b.flap = 0;
          break;
        }
      }
      for (const b of bats) {
        if (!b.on) continue;
        b.x += b.vx * h;
        if ((b.vx > 0 && b.x > X1 + 40) || (b.vx < 0 && b.x < X0 - 40)) {
          b.on = false;
          b.o.setAlpha(0);
          continue;
        }
        b.flap -= h;
        if (b.flap <= 0) {
          b.flap = 0.14 + rnd() * 0.06;
          b.up = !b.up;
          b.o.setTexture(b.up ? BAT_KEYS[0] : BAT_KEYS[1]);
        }
        b.o.setPosition(b.x, b.y + Math.sin(t * 1.3 + b.ph) * 2.5).setAlpha(0.55);
      }
    },
    destroy(): void {
      dead = true;
      for (const o of all) o.destroy();
      all.length = 0;
    },
  };
};
