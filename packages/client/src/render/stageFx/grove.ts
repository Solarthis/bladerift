/**
 * The grove at dusk: a wood of mossy trunks with lanterns hung in it and mist lying on the ground. The air holds fireflies
 * blinking and drifting, leaves twirling down past the fight, glowing spores rising now and then, and a crow crossing the
 * sky above the trees every so often. Mist lies along the floor and at the foot of the wall, and the lanterns' light sways.
 *
 * Everything is faint. The air effects sit behind the fighters (depth 7.25-7.35), the ground mist under them (-18.6), and
 * the lanterns and the wall mist on the wall (-19.6 .. -19.75). The wall items are fixed to the wall (FAR), the rest moves
 * with the world (scroll factor 1).
 *
 * Procedural only: four small canvas textures made once, pooled sprites, and a seeded LCG for every random choice. A lantern
 * on the wall is painted into the picture, so its sway is carried by its glow (the painted lantern itself stays put).
 * `quality: 'low'` keeps a third of the particles and no lantern halos.
 */
import Phaser from 'phaser';
import LIGHTS from '../arenaLights.json';
import type { BuildStageFx, StageCtx, StageFx } from './types';

/** A lantern spot on the wall picture: `u`, `v` share of the picture, `size` the glow's size, `c` its colour. */
type Spot = { u: number; v: number; size: number; c: string };
/** One small far lantern on the wall that the arena's light list leaves out. */
const EXTRA_SPOTS: Spot[] = [{ u: 0.762, v: 0.457, size: 0.004, c: '#ffa650' }];

const DEPTH_WALL_MIST = -19.6;
const DEPTH_LANTERN = -19.7;
const DEPTH_HALO = -19.75;
const DEPTH_GROUND_MIST = -18.6;
const DEPTH_LEAF = 7.25;
const DEPTH_SPORE = 7.32;
const DEPTH_FLY = 7.35;
/** Crows: in the sky above the trees (the wall picture's top), behind the lantern glows. */
const DEPTH_BIRD = -19.8;

const TEX = { glow: 'grove-glow', leaf: 'grove-leaf', mist: 'grove-mist' } as const;
/** The crow silhouettes: wings up, wings down. */
const BIRD = ['grove-bird-up', 'grove-bird-down'] as const;
const LEAF_TINTS = [0xc9a25a, 0x9aae5c, 0xb9703e, 0x7e9c6a, 0xd6b76a];

type Lamp = { x: number; y: number; ph: number; core: Phaser.GameObjects.Image; halo: Phaser.GameObjects.Image | null };
type Fly = { img: Phaser.GameObjects.Image; x: number; y: number; vx: number; vy: number; ph: number; rate: number; peak: number };
type Leaf = {
  img: Phaser.GameObjects.Image;
  x: number;
  y: number;
  fall: number;
  sway: number;
  swayRate: number;
  ph: number;
  rot: number;
  spin: number;
  twirl: number;
  sc: number;
};
type Spore = {
  img: Phaser.GameObjects.Image;
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  ph: number;
  peak: number;
  on: boolean;
};
type Puff = { img: Phaser.GameObjects.Image; x: number; y: number; vx: number; base: number; ph: number };
/** A crow crossing the sky above the trees: on or off, its position (world), speed and wing-beat. */
type Bird = { img: Phaser.GameObjects.Image; on: boolean; x: number; y: number; vx: number; ph: number; flap: number; up: boolean };

/** A seeded LCG (no Math.random): the same grove every time. */
function lcg(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** `v` wrapped into [0, span). */
const wrap = (v: number, span: number) => ((v % span) + span) % span;

/** A crow in silhouette, wings up or down (16 x 8), painted once; tinted at use. */
function ensureBirdTextures(scene: Phaser.Scene) {
  const bird = (key: string, wings: number[][]) => {
    if (scene.textures.exists(key)) return;
    const tex = scene.textures.createCanvas(key, 16, 8)!;
    const c = tex.context;
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.moveTo(wings[0][0], wings[0][1]);
    for (const [x, y] of wings.slice(1)) c.lineTo(x, y);
    c.closePath();
    c.fill();
    c.beginPath();
    c.ellipse(8, 4.5, 1.6, 1.1, 0, 0, Math.PI * 2);
    c.fill();
    tex.refresh();
  };
  bird(BIRD[0], [[8, 4], [0, 0], [4, 4.5], [8, 5.5], [12, 4.5], [16, 0]]);
  bird(BIRD[1], [[8, 4], [0, 8], [4, 5], [8, 4.5], [12, 5], [16, 8]]);
}

/** The four textures, made once (the game keeps them across rounds). */
function ensureTextures(scene: Phaser.Scene) {
  if (!scene.textures.exists(TEX.glow)) {
    const tex = scene.textures.createCanvas(TEX.glow, 32, 32)!;
    const c = tex.context;
    const g = c.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.3, 'rgba(255,255,255,0.5)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 32, 32);
    tex.refresh();
  }
  if (!scene.textures.exists(TEX.leaf)) {
    // a pixel leaf pointing right, hard-edged like the sprites (tinted per leaf)
    const tex = scene.textures.createCanvas(TEX.leaf, 6, 4)!;
    const rows = ['..XXX.', '.XXXXX', 'XXXXX.', 'X.....'];
    tex.context.fillStyle = '#ffffff';
    rows.forEach((row, y) => {
      for (let x = 0; x < 6; x++) if (row[x] === 'X') tex.context.fillRect(x, y, 1, 1);
    });
    tex.refresh();
  }
  if (!scene.textures.exists(TEX.mist)) {
    // a soft horizontal blob of fog
    const w = 256;
    const h = 64;
    const tex = scene.textures.createCanvas(TEX.mist, w, h)!;
    const c = tex.context;
    c.translate(w / 2, h / 2);
    c.scale(1, h / w);
    const g = c.createRadialGradient(0, 0, 0, 0, 0, w / 2);
    g.addColorStop(0, 'rgba(255,255,255,0.9)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.4)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(-w / 2, -w / 2, w, w);
    tex.refresh();
  }
}

/** The grove stage: lanterns, fireflies, leaves, spores and mist (see the header). */
export const build: BuildStageFx = (ctx: StageCtx): StageFx => {
  const { scene, W, floor, wallBase, wallTop, FAR, tw, quality } = ctx;
  const low = quality === 'low';
  const third = (n: number) => (low ? Math.max(1, Math.round(n / 3)) : n);
  const rnd = lcg(0x2f6b9d1);
  const R = (a: number, b: number) => a + (b - a) * rnd();
  ensureTextures(scene);
  ensureBirdTextures(scene);

  // every object is made here and destroyed in destroy()
  const made: Phaser.GameObjects.Image[] = [];
  const sprite = (key: string, x: number, y: number): Phaser.GameObjects.Image => {
    const o = scene.add.image(x, y, key);
    made.push(o);
    return o;
  };

  // ---- the lanterns on the wall: the arena's light spots, copied across the wall the way arena.ts copies the picture
  const WALL_H = wallBase + 2 - wallTop;
  const spots = [...((LIGHTS as Record<string, Spot[]>).grove ?? []), ...EXTRA_SPOTS];
  const lamps: Lamp[] = [];
  for (let k = -5; k <= 5; k++) {
    for (const b of spots) {
      const u = k % 2 === 0 ? b.u : 1 - b.u;
      const x = W / 2 + k * tw + (u - 0.5) * tw;
      const y = wallBase + 2 - (1 - b.v) * WALL_H;
      const col = parseInt(b.c.slice(1), 16);
      const core = sprite(TEX.glow, x, y)
        .setScrollFactor(FAR, 1)
        .setDepth(DEPTH_LANTERN)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setTint(col)
        .setScale(0.26 + b.size * 6)
        .setAlpha(0.6);
      const halo = low
        ? null
        : sprite(TEX.glow, x, y)
            .setScrollFactor(FAR, 1)
            .setDepth(DEPTH_HALO)
            .setBlendMode(Phaser.BlendModes.ADD)
            .setTint(col)
            .setScale(1 + b.size * 40)
            .setAlpha(0.26);
      lamps.push({ x, y, ph: R(0, 6.28), core, halo });
    }
  }

  // ---- mist on the wall, at its foot (fixed to the wall, drifting slowly across the copies)
  const wallX0 = W / 2 - 5 * tw;
  const wallSpan = 10 * tw;
  const wallMist: Puff[] = [];
  for (let i = 0; i < third(4); i++) {
    const x = wallX0 + R(0, wallSpan);
    const y = wallBase - 6 + R(-4, 4);
    const o = sprite(TEX.mist, x, y)
      .setScrollFactor(FAR, 1)
      .setDepth(DEPTH_WALL_MIST)
      .setTint(0x8e88b0)
      .setScale(R(1.3, 1.7), R(0.5, 0.7))
      .setAlpha(0);
    wallMist.push({ img: o, x, y, vx: R(3, 6), base: R(0.12, 0.18), ph: R(0, 6.28) });
  }

  // ---- mist on the ground, at the fighters' line (world scale, under the fighters)
  const groundMist: Puff[] = [];
  for (let i = 0; i < third(6); i++) {
    const x = R(0, W);
    const y = floor + R(-8, 6);
    const o = sprite(TEX.mist, x, y)
      .setDepth(DEPTH_GROUND_MIST)
      .setTint(0xa39cc4)
      .setScale(R(1.3, 1.9), R(0.7, 1.0))
      .setAlpha(0);
    groundMist.push({ img: o, x, y, vx: R(4, 9) * (rnd() < 0.5 ? -1 : 1), base: R(0.12, 0.18), ph: R(0, 6.28) });
  }

  // ---- fireflies: drifting through the air behind the fighters, blinking on and off
  const flies: Fly[] = [];
  for (let i = 0; i < third(44); i++) {
    const x = R(0, W);
    const y = floor - R(40, 210);
    const o = sprite(TEX.glow, x, y)
      .setDepth(DEPTH_FLY)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(0xe8ff9e)
      .setScale(R(0.34, 0.48))
      .setAlpha(0);
    flies.push({ img: o, x, y, vx: R(-12, 12), vy: R(-6, 6), ph: R(0, 6.28), rate: R(1.4, 2.8), peak: R(0.8, 1) });
  }

  // ---- leaves: falling and twirling down past the fight, from the top of the view
  const leaves: Leaf[] = [];
  for (let i = 0; i < third(30); i++) {
    const o = sprite(TEX.leaf, 0, 0)
      .setDepth(DEPTH_LEAF)
      .setTint(LEAF_TINTS[i % LEAF_TINTS.length])
      .setAlpha(R(0.5, 0.85));
    leaves.push({
      img: o,
      x: R(0, W),
      y: floor - R(0, 300),
      fall: R(14, 24),
      sway: R(6, 12),
      swayRate: R(0.6, 1.2),
      ph: R(0, 6.28),
      rot: R(0, 6.28),
      spin: R(-2.2, 2.2),
      twirl: R(2.5, 4.5),
      sc: R(1.8, 2.6),
    });
  }

  // ---- crows: now and then one crosses the sky above the trees, wings beating (wall-fixed, FAR), a few at a time
  const birds: Bird[] = [];
  for (let i = 0; i < third(3); i++) {
    const o = sprite(BIRD[0], 0, 0).setDepth(DEPTH_BIRD).setTint(0x0c0a12).setScale(1.2).setVisible(false);
    birds.push({ img: o, on: false, x: 0, y: 0, vx: 0, ph: 0, flap: 0, up: true });
  }
  let birdClock = low ? 16 : 9;

  // ---- spores: glowing motes rising off the ground now and then (pooled; spawned on a timer)
  const spores: Spore[] = [];
  for (let i = 0; i < third(16); i++) {
    const o = sprite(TEX.glow, 0, 0)
      .setDepth(DEPTH_SPORE)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(0xb4ffd8)
      .setVisible(false);
    spores.push({ img: o, x: 0, y: 0, vx: 0, vy: 0, age: 0, life: 1, ph: 0, peak: 0.3, on: false });
  }
  const spawnSpore = (cx: number, hw: number) => {
    for (const s of spores) {
      if (s.on) continue;
      s.on = true;
      s.x = cx + R(-hw * 0.9, hw * 0.9);
      s.y = floor + R(-14, 4);
      s.vx = R(-3, 3);
      s.vy = -R(9, 16);
      s.age = 0;
      s.life = R(3.5, 6);
      s.ph = R(0, 6.28);
      s.peak = R(0.25, 0.4);
      s.img.setVisible(true);
      return;
    }
  };
  let spawnIn = R(1, 2.5);

  let t = 0;

  return {
    update(dt: number, cam: Phaser.Cameras.Scene2D.Camera) {
      const h = Math.min(0.1, dt);
      t += h;
      const z = cam.zoom || 1;
      const cx = cam.midPoint.x;
      const hw = scene.scale.width / z / 2 + 60;
      const left = cx - hw;
      const right = cx + hw;

      // the lanterns sway on a cord (the glow moves with the lamp) and flicker a little
      for (const L of lamps) {
        const ang = 0.1 * Math.sin(t * 0.9 + L.ph) + 0.02 * Math.sin(t * 2.3 + L.ph * 2);
        const dx = 16 * Math.sin(ang);
        const flick = 0.78 + 0.22 * Math.sin(t * 7.3 + L.ph * 5) + 0.06 * Math.sin(t * 17.1 + L.ph);
        L.core.setPosition(L.x + dx, L.y).setAlpha(0.6 * flick);
        if (L.halo) L.halo.setPosition(L.x + dx, L.y).setAlpha(0.26 * flick);
      }

      // the mist: slow drift, wrapped so it never runs out
      for (const p of wallMist) {
        p.x = wallX0 + wrap(p.x + p.vx * h - wallX0, wallSpan);
        p.img.setPosition(p.x, p.y).setAlpha(p.base * (0.7 + 0.3 * Math.sin(t * 0.3 + p.ph)));
      }
      const span = 2 * hw + 520;
      const gx0 = left - 260;
      for (const p of groundMist) {
        p.x = gx0 + wrap(p.x + p.vx * h - gx0, span);
        p.img.setPosition(p.x, p.y).setAlpha(p.base * (0.75 + 0.25 * Math.sin(t * 0.35 + p.ph)));
      }

      // the fireflies: wandering through a band of air above the floor, each blinking on its own rhythm
      for (const f of flies) {
        f.x += (f.vx + 7 * Math.sin(t * 0.45 + f.ph)) * h;
        f.y += (f.vy + 4 * Math.cos(t * 0.6 + f.ph * 1.3)) * h;
        if (f.y < floor - 230) {
          f.y = floor - 230;
          f.vy = Math.abs(f.vy);
        } else if (f.y > floor - 18) {
          f.y = floor - 18;
          f.vy = -Math.abs(f.vy);
        }
        if (f.x < left - 30) f.x = right + 20;
        else if (f.x > right + 30) f.x = left - 20;
        const s = Math.sin(t * f.rate + f.ph);
        const on = s > 0.5 ? (s - 0.5) * 2 : 0;
        f.img.setPosition(f.x, f.y).setAlpha(f.peak * (0.05 + 0.95 * on * on));
      }

      // the leaves: fall, drift on the wind, spin, and turn over (the width follows a cosine)
      const wind = 7 + 4 * Math.sin(t * 0.13);
      for (const lf of leaves) {
        lf.y += lf.fall * h;
        lf.x += (wind + lf.sway * Math.sin(t * lf.swayRate + lf.ph)) * h;
        lf.rot += lf.spin * h;
        if (lf.y > floor + 30) {
          // past the fighters' line: back to the top, somewhere across the view
          lf.y = floor - R(200, 260);
          lf.x = left + R(0, 2 * hw);
        } else if (lf.x < left - 40) {
          // off the left: re-enter from the right, out of sight
          lf.x = right + 30;
          lf.y = floor - R(0, 300);
        } else if (lf.x > right + 40) {
          lf.x = left - 30;
          lf.y = floor - R(0, 300);
        }
        lf.img.setPosition(lf.x, lf.y).setRotation(lf.rot).setScale(lf.sc * Math.cos(t * lf.twirl + lf.ph), lf.sc);
      }

      // the crows: a new one now and then from one side of the view, crossing the sky above the trees, wings beating
      birdClock -= h;
      if (birdClock <= 0) {
        birdClock = (low ? 16 : 9) + R(0, low ? 10 : 8);
        let b: Bird | undefined;
        for (const q of birds) if (!q.on) b = q;
        if (b) {
          const fromLeft = rnd() < 0.5;
          b.on = true;
          b.x = fromLeft ? left - 60 : right + 60;
          b.y = wallTop + WALL_H * R(0.3, 0.55);
          b.vx = (fromLeft ? 1 : -1) * R(150, 210);
          b.ph = R(0, 6.28);
          b.flap = 0;
          b.up = true;
        }
      }
      for (const b of birds) {
        if (!b.on) continue;
        b.x += b.vx * h;
        if ((b.vx > 0 && b.x > right + 80) || (b.vx < 0 && b.x < left - 80)) {
          b.on = false;
          b.img.setVisible(false);
          continue;
        }
        b.flap -= h;
        if (b.flap <= 0) {
          b.flap = R(0.16, 0.22);
          b.up = !b.up;
          b.img.setTexture(b.up ? BIRD[0] : BIRD[1]);
        }
        b.img
          .setVisible(true)
          .setPosition(b.x, b.y + Math.sin(t * 1.1 + b.ph) * 3)
          .setScale(b.vx > 0 ? 1.2 : -1.2, 1.2)
          .setAlpha(0.85);
      }

      // the spores: a new one now and then, rising, fading in and out
      spawnIn -= h;
      if (spawnIn <= 0) {
        spawnSpore(cx, hw);
        spawnIn = R(1.8, 4);
      }
      for (const s of spores) {
        if (!s.on) continue;
        s.age += h;
        if (s.age >= s.life) {
          s.on = false;
          s.img.setVisible(false);
          continue;
        }
        s.y += s.vy * h;
        s.x += (s.vx + 3 * Math.sin(t * 1.7 + s.ph)) * h;
        const k = s.age / s.life;
        s.img.setPosition(s.x, s.y).setAlpha(s.peak * Math.sin(Math.PI * k)).setScale(0.18 + 0.1 * k);
      }
    },
    destroy() {
      for (const o of made) o.destroy();
      made.length = 0;
      lamps.length = 0;
      wallMist.length = 0;
      groundMist.length = 0;
      flies.length = 0;
      leaves.length = 0;
      spores.length = 0;
    },
  };
};
