/**
 * The arena on screen, staged like the owner's reference clip: a painted back wall a little behind the fight, a stone floor
 * that runs from the foot of that wall toward the viewer in true perspective (the fighters stand on it), the walls and
 * platforms of the ArenaDef, and the lamps painted on the wall turned into lights (render/lighting.ts).
 *
 * The floor is a stack of thin strips of a seamless top-down texture: each strip is scaled and scrolled for its depth
 * (farther strips smaller and slower), redrawn under the camera every frame, so the flagstone joints converge on the view
 * centre and slide past at their own speeds as the camera moves.
 */
import Phaser from 'phaser';
import type { ArenaDef } from '@bladerift/shared';
import LIGHTS from './arenaLights.json';
import type { LightStamp, StaticLight } from './lighting';
import type { BuildStageFx, StageFx } from './stageFx/types';
import { build as buildHallFx } from './stageFx/hall';
import { build as buildBridgeFx } from './stageFx/bridge';
import { build as buildEmbersFx } from './stageFx/embers';
import { build as buildCryptFx } from './stageFx/crypt';
import { build as buildGroveFx } from './stageFx/grove';
import { prefs } from '../ui/prefs';

/** Each theme's animated stage elements (render/stageFx), built after the wall, floor and lights. */
const STAGE_FX: Record<string, BuildStageFx> = {
  hall: buildHallFx,
  bridge: buildBridgeFx,
  embers: buildEmbersFx,
  crypt: buildCryptFx,
  grove: buildGroveFx,
};

/**
 * Shafts of light through the wall's windows, falling across the room onto the floor (the reference clip's strongest
 * picture): `u`, `v` the window's centre on the wall picture, `w` its width (share of the picture), `dx` how far the patch
 * lands from under the window (world units, + right), `p0`..`p1` the patch's depth on the floor (1 = the fighters' line),
 * `k` its light (the shaft carries less), `haze` how much the air in it glows.
 */
type Beam = { u: number; v: number; w: number; dx: number; p0: number; p1: number; color: number; k: number; haze: number };
const BEAMS: Record<string, Beam[]> = {
  hall: [
    { u: 0.5, v: 0.36, w: 0.1, dx: 160, p0: 0.78, p1: 1.1, color: 0xdce2ff, k: 0.75, haze: 0.2 },
  ],
  bridge: [
    { u: 0.48, v: 0.52, w: 0.12, dx: -150, p0: 0.78, p1: 1.06, color: 0xb8c8ff, k: 0.55, haze: 0.13 },
  ],
  embers: [
    { u: 0.66, v: 0.44, w: 0.1, dx: 150, p0: 0.78, p1: 1.08, color: 0xff8a48, k: 0.7, haze: 0.18 },
  ],
  crypt: [{ u: 0.5, v: 0.02, w: 0.12, dx: 130, p0: 0.8, p1: 1.08, color: 0xa8ffe6, k: 0.6, haze: 0.15 }],
  grove: [
    { u: 0.3, v: 0.06, w: 0.1, dx: 160, p0: 0.78, p1: 1.08, color: 0xd8ccff, k: 0.65, haze: 0.16 },
  ],
};

/** Per theme: the ambient light level (the light map's base colour) and the floor's colour grade. */
const LOOK: Record<string, { ambient: number; far: number; near: number; lamp: number }> = {
  hall: { ambient: 0x58505f, far: 0x7a7280, near: 0xc4b8ac, lamp: 0.9 },
  bridge: { ambient: 0x68728e, far: 0x6a7490, near: 0xb0bacc, lamp: 0.85 },
  embers: { ambient: 0x745658, far: 0x7a5650, near: 0xc49484, lamp: 0.9 },
  crypt: { ambient: 0x627670, far: 0x5c6c66, near: 0xa0b0a8, lamp: 0.9 },
  grove: { ambient: 0x726c88, far: 0x686480, near: 0xaca6b4, lamp: 0.85 },
};

/** Depth of the floor seen from the camera: the foot of the back wall is FAR of the way to the fighters' line. */
const FAR = 0.66;
/** World units between the fighters' line and the foot of the wall (on screen): a deep floor, the wall well back. */
const BACK = 64;
/** Floor drawn this far below the fighters' line (it runs off the bottom of the view). */
const FRONT = 320;
/** Floor texture: world units per texel at the fighters' line, and how much the floor is foreshortened. */
const TEXEL = 0.2;
const SQUASH = 0.42;
const ROWS = 44;
/** The back wall's height (world units) and the mirrored copies laid side by side. */
const WALL_H = 120;
const COPIES = [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5];

export interface ArenaView {
  /** The lamps on the back wall. */
  lights: StaticLight[];
  /** The window shafts and their floor patches, laid on the light map (refreshed by update()). */
  shapes: LightStamp[];
  ambient: number;
  /** Lay the floor strips under the camera and run the stage FX (call once per frame, after the camera moved). */
  update(): void;
  /** Destroys the stage FX and the arena's own extra objects. Runs by itself on the scene's shutdown; safe to call twice. */
  destroy(): void;
}

export function buildArena(scene: Phaser.Scene, a: ArenaDef): ArenaView {
  const theme = a.theme;
  const look = LOOK[theme] ?? LOOK.hall;
  // Settings > Graphics, read once: 'low' drops the air glows (shafts, haze) and the dust motes; the light map stays
  const low = prefs().quality === 'low';
  const W = a.w;
  const D = BACK / (1 - FAR);
  const horizon = a.floor - D;
  const wallBase = a.floor - BACK;

  // ---- the back wall: the painting, mirrored copies either side (the joins meet seamlessly), at the floor's far parallax
  const wallKey = scene.textures.exists(`wall-${theme}`) ? `wall-${theme}` : `bg-${theme}`;
  const src = scene.textures.get(wallKey).getSourceImage() as HTMLImageElement;
  // small and far back, so the whole wall shows above the fighters (windows, banners, lamps) like a room, not a backdrop
  const ws = WALL_H / src.height;
  const wallTop = wallBase + 2 - WALL_H;
  const tw = src.width * ws;
  for (const k of COPIES) {
    scene.add
      .image(W / 2 + k * tw, wallBase + 2, wallKey)
      .setOrigin(0.5, 1)
      .setScale(ws)
      .setFlipX(k % 2 !== 0)
      .setScrollFactor(FAR, 1)
      .setDepth(-20);
  }
  // above the wall (seen when the fight climbs to the high ledges): a second storey of the same wall sinking into the dark
  // vault, or for the bridge the night sky going on up
  const sky = theme === 'bridge';
  const vaultC = sky ? 0x0b1124 : 0x07060a;
  if (!sky) {
    for (const k of COPIES) {
      scene.add
        .image(W / 2 + k * tw, wallTop + 3, wallKey)
        .setOrigin(0.5, 1)
        .setScale(ws)
        .setFlipX(k % 2 === 0)
        .setFlipY(true)
        .setTint(0x7a7480)
        .setScrollFactor(FAR, 1)
        .setDepth(-20);
    }
  }
  const vault = scene.add.graphics().setScrollFactor(FAR, 1).setDepth(-19.95);
  const vx0 = W / 2 - 6 * tw;
  const vx1 = W / 2 + 6 * tw;
  const fade = sky ? WALL_H * 0.25 : WALL_H * 1.1;
  const fadeTop = sky ? wallTop + WALL_H * 0.1 - fade : wallTop - fade;
  vault.fillStyle(vaultC, 1).fillRect(vx0, fadeTop - 3000, vx1 - vx0, 3000);
  vault.fillGradientStyle(vaultC, vaultC, vaultC, vaultC, 1, 1, sky ? 0 : 0.15, sky ? 0 : 0.15);
  vault.fillRect(vx0, fadeTop - 1, vx1 - vx0, fade + 1);

  // ---- the floor: strips from the foot of the wall to below the view, each at its own depth
  const fKey = scene.textures.exists(`floor-${theme}`) ? `floor-${theme}` : `p-${theme}`;
  const ftex = scene.textures.get(fKey);
  ftex.setFilter(Phaser.Textures.FilterMode.LINEAR);
  const Kv = D / (SQUASH * TEXEL);
  const C = Kv * 8;
  const pNear = 1 + FRONT / D;
  type Strip = { s: Phaser.GameObjects.TileSprite; p: number };
  const strips: Strip[] = [];
  // even steps in depth (1/p): fine strips far away where the texture changes fastest
  const z0 = 1 / FAR;
  const z1 = 1 / pNear;
  for (let i = 0; i < ROWS; i++) {
    const pa = 1 / (z0 + ((z1 - z0) * i) / ROWS);
    const pb = 1 / (z0 + ((z1 - z0) * (i + 1)) / ROWS);
    const ya = horizon + D * pa;
    const yb = horizon + D * pb;
    const h = yb - ya;
    const pm = (pa + pb) / 2;
    const s = scene.add.tileSprite(W / 2, ya, 400, Math.max(1, h + 0.6), fKey).setOrigin(0.5, 0).setDepth(-19);
    // the texture's rows between this strip's two depths (texels), squeezed into its height
    const v0 = C - Kv / pa;
    const v1 = C - Kv / pb;
    s.setTileScale(TEXEL * pm, h / (v1 - v0));
    s.tilePositionY = v0;
    // a colour grade by depth: the far floor sinks into the wall's shadow, the near edge darkens off the bottom
    const far = Phaser.Math.Clamp((pm - FAR) / (1 - FAR), 0, 1);
    const near = Phaser.Math.Clamp((pm - 1.25) / (pNear - 1.25), 0, 1);
    s.setTint(lerpColor(lerpColor(look.far, look.near, far), 0x2a2630, near * 0.85));
    strips.push({ s, p: pm });
  }
  // a dark seam where the floor meets the wall (contact shadow)
  const seam = scene.add.graphics().setDepth(-18.9);
  seam.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0.55, 0.55, 0, 0);
  seam.fillRect(-1200, wallBase, W + 2400, 16);
  seam.fillStyle(0x000000, 0.5).fillRect(-1200, wallBase - 1, W + 2400, 2);

  // ---- stone: the side walls and the solid blocks
  const STONE: Record<string, [number, number, number]> = {
    hall: [0x4a4248, 0x6a6068, 0x231e24],
    bridge: [0x2a3046, 0x3c4562, 0x161a28],
    embers: [0x3a2430, 0x5a3440, 0x1c1018],
    crypt: [0x1c3434, 0x2c4a48, 0x0e1c1c],
    grove: [0x2a3a30, 0x3c5040, 0x141e18],
  };
  const [mid, lit, dark] = STONE[theme] ?? STONE.hall;
  /** A carved stone mass with masonry courses, baked once into a texture; `litLeft` / `litRight` say which faces catch the light. */
  const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;
  const stone = (x: number, y: number, w: number, h: number, litLeft: boolean, litRight: boolean, depth: number) => {
    const key = `stone-${theme}-${w}x${h}-${litLeft ? 1 : 0}${litRight ? 1 : 0}`;
    if (!scene.textures.exists(key)) {
      const tex = scene.textures.createCanvas(key, w, h)!;
      const g = tex.context;
      g.fillStyle = hex(mid);
      g.fillRect(0, 0, w, h);
      g.fillStyle = hex(dark);
      for (let yy = 18; yy < h; yy += 18) g.fillRect(0, yy, w, 1);
      for (let yy = 0, row = 0; yy < h; yy += 18, row++)
        for (let xx = row % 2 ? 14 : 28; xx < w; xx += 28) g.fillRect(xx, yy, 1, Math.min(18, h - yy));
      g.fillStyle = hex(litLeft ? lit : dark);
      g.fillRect(0, 0, 3, h);
      g.fillStyle = hex(litRight ? lit : dark);
      g.fillRect(w - 3, 0, 3, h);
      g.strokeStyle = '#0b0814';
      g.lineWidth = 2;
      g.strokeRect(1, 1, w - 2, h - 2);
      tex.refresh();
    }
    return scene.add.image(x, y, key).setOrigin(0, 0).setDepth(depth);
  };
  // the arena's side walls: tall masonry beyond the edges, standing on the floor, the inner face lit
  for (const left of [true, false]) stone(left ? -400 : W, a.floor - 1400, 400, 1400, !left, left, -1);
  // platforms: the theme's ledge strip
  const pKey = scene.textures.exists(`p-${theme}`) ? `p-${theme}` : 'p-embers';
  const k = 0.5;
  for (const p of a.platforms) scene.add.tileSprite(p.x + p.w / 2, p.y - 2, p.w / k, (scene.textures.get(pKey).getSourceImage() as HTMLImageElement).height, pKey).setOrigin(0.5, 0).setScale(k).setDepth(-2);
  // solid blocks: carved stone pillars with a capstone strip
  const ph = (scene.textures.get(pKey).getSourceImage() as HTMLImageElement).height;
  const pillar = scene.textures.exists(`pillar-${theme}`) ? `pillar-${theme}` : null;
  for (const b of a.blocks) {
    // a theme with its own painted pillar draws tall blocks with it
    if (pillar && b.h > b.w * 2.5) {
      scene.add.image(b.x, b.y, pillar).setOrigin(0, 0).setDisplaySize(b.w, b.h).setDepth(-2);
      continue;
    }
    stone(b.x, b.y, b.w, b.h, true, false, -2);
    scene.add.tileSprite(b.x + b.w / 2, b.y - 3, (b.w + 10) / k, ph, pKey).setOrigin(0.5, 0).setScale(k, 0.25).setDepth(-1);
  }

  // ---- the lamps painted on the wall, as lights (one per lamp: blobs of the same lamp merge)
  const lights: StaticLight[] = [];
  const found = ((LIGHTS as Record<string, { u: number; v: number; size: number; c: string }[]>)[theme] ?? []).slice();
  for (const k2 of COPIES) {
    for (const b of found) {
      const u = k2 % 2 === 0 ? b.u : 1 - b.u;
      const x = W / 2 + k2 * tw + (u - 0.5) * tw;
      const y = wallBase + 2 - (1 - b.v) * src.height * ws;
      const size = b.size * tw;
      const near = lights.find((l) => Math.abs(l.x - x) < 46 && Math.abs(l.y - y) < 46);
      if (near) {
        near.r = Math.max(near.r, 120 + size * 5);
        near.k = Math.min(1, near.k + 0.08);
        continue;
      }
      lights.push({ x, y, r: 120 + size * 5, color: parseInt(b.c.slice(1), 16), k: look.lamp, sf: FAR, flicker: true, floorY: wallBase + 6 });
    }
  }

  // ---- light shafts: each window throws a slanting shaft across the room and a patch of light on the floor. Both light
  // the scene (stamped on the light map, so a fighter walking through one is lit) and glow in the air (soft additive images)
  shaftTextures(scene);
  type Shaft = { b: Beam; xw: number; yw: number; F: number; air: Phaser.GameObjects.Image | null; pool: Phaser.GameObjects.Image | null; sShaft: LightStamp; sPool: LightStamp; sWin: LightStamp; ph: number };
  const shafts: Shaft[] = [];
  const shapes: LightStamp[] = [];
  const mk = (key: string, color: number): LightStamp => ({ key, x: 0, y: 0, sx: 1, sy: 1, rot: 0, ox: 0.5, oy: 0.5, color, k: 0, on: false });
  for (const kc of COPIES) {
    // (every other bay only, each a little different, so the shafts do not march in a row)
    if (kc % 2 !== 0) continue;
    const vary = 0.75 + 0.25 * Math.abs(Math.sin(kc * 2.3 + 1));
    for (const b0 of BEAMS[theme] ?? []) {
      const b = { ...b0, k: b0.k * vary, haze: b0.haze * vary };
      const u = kc % 2 === 0 ? b.u : 1 - b.u;
      const xw = W / 2 + kc * tw + (u - 0.5) * tw;
      const yw = wallBase + 2 - (1 - b.v) * WALL_H;
      // the floor point under the window (at the wall's foot the floor and the wall share a parallax), then the throw
      const F = W / 2 + (xw - W / 2) / FAR + b.dx;
      // (low quality: no air glow images; the light-map stamps below still carry the shaft)
      const air = low ? null : scene.add.image(0, 0, SHAFT).setOrigin(0.5, 0).setBlendMode(Phaser.BlendModes.ADD).setTint(b.color).setDepth(7.4).setVisible(false);
      const pool = low ? null : scene.add.image(0, 0, POOL).setOrigin(0.5).setBlendMode(Phaser.BlendModes.ADD).setTint(b.color).setDepth(-18.8).setVisible(false);
      const sh: Shaft = { b, xw, yw, F, air, pool, sShaft: mk(SHAFT, b.color), sPool: mk(POOL, b.color), sWin: mk('light-blob', b.color), ph: xw * 0.013 };
      sh.sShaft.oy = 0;
      shafts.push(sh);
      shapes.push(sh.sWin, sh.sShaft, sh.sPool);
    }
  }
  // ---- the stage's own animated elements (render/stageFx/<theme>.ts), over the painted room, after the wall, floor and lights
  const buildFx = STAGE_FX[theme];
  const stageFx: StageFx | null = buildFx ? buildFx({ scene, theme, W, floor: a.floor, wallBase, wallTop, FAR, tw, quality: low ? 'low' : 'high' }) : null;
  // ---- drifting dust (additive, over the light map so it reads as light in the dark); none on low quality
  const beamG = scene.add.graphics().setDepth(13).setBlendMode(Phaser.BlendModes.ADD);
  const motes: { x: number; y: number; vx: number; vy: number; ph: number }[] = low
    ? []
    : Array.from({ length: 46 }, (_, i) => ({ x: (i * 977) % W, y: a.floor - ((i * 431) % 300), vx: 2 + (i % 5), vy: -1 - (i % 3), ph: i * 1.7 }));
  let t = 0;
  let last = performance.now();
  let dead = false;

  const view: ArenaView = {
    lights,
    shapes,
    ambient: look.ambient,
    destroy() {
      if (dead) return;
      dead = true;
      stageFx?.destroy();
      beamG.destroy();
      for (const sh of shafts) {
        sh.air?.destroy();
        sh.pool?.destroy();
      }
    },
    update() {
      if (dead) return;
      const cam = scene.cameras.main;
      const z = cam.zoom || 1;
      const cx = cam.midPoint.x;
      const hw = scene.scale.width / z / 2 + 40;
      const now = performance.now();
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      t += dt;
      stageFx?.update(dt, cam);
      beamG.clear();
      // projections to the screen: a point on the wall, a point on the floor at depth p, a world y
      const Wv = scene.scale.width;
      const Hv = scene.scale.height;
      const sx0 = cam.scrollX;
      const sy0 = cam.scrollY;
      const wallX = (x: number) => Wv / 2 + z * (x - FAR * sx0 - Wv / 2);
      const floorX = (F: number, p: number) => Wv / 2 + z * p * (F - sx0 - Wv / 2);
      const scrY = (y: number) => Hv / 2 + z * (y - sy0 - Hv / 2);
      // (and back: the world point a screen pixel shows on the fighters' layer)
      const worldX = (X: number) => sx0 + Wv / 2 + (X - Wv / 2) / z;
      const worldY = (Y: number) => sy0 + Hv / 2 + (Y - Hv / 2) / z;
      for (const sh of shafts) {
        const b = sh.b;
        const ax = wallX(sh.xw);
        const ay = scrY(sh.yw);
        const pm = (b.p0 + b.p1) / 2;
        const bx = floorX(sh.F, pm);
        const ya = horizon + D * b.p0;
        const yb = horizon + D * b.p1;
        const by = scrY((ya + yb) / 2);
        const on = Math.max(ax, bx) > -300 && Math.min(ax, bx) < Wv + 300;
        sh.air?.setVisible(on);
        sh.pool?.setVisible(on);
        sh.sShaft.on = sh.sPool.on = sh.sWin.on = on;
        if (!on) continue;
        const pulse = 0.9 + 0.1 * Math.sin(t * 0.6 + sh.ph);
        const winW = z * b.w * tw;
        const poolW = z * pm * b.w * tw * 4.6;
        const poolH = z * (yb - ya);
        const len = Math.hypot(bx - ax, by - ay);
        const rot = Math.atan2(-(bx - ax), by - ay);
        // the patch on the floor (its slant follows the shaft)
        const flip = bx < ax ? -1 : 1;
        const sp = sh.sPool;
        sp.x = bx;
        sp.y = by;
        sp.sx = (poolW / POOL_W) * flip;
        sp.sy = poolH / POOL_H;
        sp.k = b.k * pulse;
        const ss = sh.sShaft;
        ss.x = ax;
        ss.y = ay;
        ss.sx = poolW / SHAFT_W;
        ss.sy = len / SHAFT_H;
        ss.rot = rot;
        ss.k = b.k * 0.38 * pulse;
        const sw = sh.sWin;
        sw.x = ax;
        sw.y = ay;
        sw.sx = (winW * 2.6) / 128;
        sw.sy = (winW * 3.4) / 128;
        sw.k = 0.55 * pulse;
        // and the same in the air, soft and faint
        sh.air?.setPosition(worldX(ax), worldY(ay)).setRotation(rot).setScale(poolW / z / SHAFT_W, len / z / SHAFT_H).setAlpha(b.haze * pulse);
        sh.pool?.setPosition(worldX(bx), worldY(by)).setScale((poolW / z / POOL_W) * flip, poolH / z / POOL_H).setAlpha(b.haze * 0.9 * pulse);
      }
      // dust motes drifting through the air, twinkling
      for (const m of motes) {
        m.x += m.vx * dt;
        m.y += m.vy * dt + Math.sin(t + m.ph) * 3 * dt;
        if (m.y < a.floor - 320) m.y = a.floor - 10;
        if (m.x > W + 100) m.x = -100;
        if (Math.abs(m.x - cx) > hw) continue;
        const tw2 = 0.5 + 0.5 * Math.sin(t * 2.3 + m.ph * 3);
        beamG.fillStyle(0xfff0d0, 0.22 * tw2).fillRect(m.x, m.y, 1.4, 1.4);
      }
      for (const st of strips) {
        // wide enough for the view at this depth; scrolled so the texture slides at the strip's own speed
        st.s.x = cx;
        // (setSize, not width: the tile sprite only redraws its full span after a resize through it)
        if (Math.abs(st.s.width - hw * 2) > 1) st.s.setSize(hw * 2, st.s.height);
        st.s.tilePositionX = (cx - hw / st.p) / TEXEL;
      }
    },
  };
  // the arena goes with its scene (the GameScene's teardown also calls destroy(); the second call does nothing)
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => view.destroy());
  return view;
}

function lerpColor(a: number, b: number, t: number) {
  const ch = (s: number) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t) << s;
  return ch(16) | ch(8) | ch(0);
}

const SHAFT = 'light-shaft';
const POOL = 'light-pool';
const SHAFT_W = 64;
const SHAFT_H = 256;
const POOL_W = 160;
const POOL_H = 64;

/** Soft-edged white shapes for the shafts: a beam widening as it falls and fading toward the floor, and the slanted patch it lands as. */
function shaftTextures(scene: Phaser.Scene) {
  if (scene.textures.exists(SHAFT)) return;
  const smooth = (e: number) => (e <= 0 ? 0 : e >= 1 ? 1 : e * e * (3 - 2 * e));
  const paint = (key: string, w: number, h: number, alpha: (x: number, y: number) => number) => {
    const tex = scene.textures.createCanvas(key, w, h)!;
    const img = tex.context.createImageData(w, h);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
        img.data[i + 3] = Math.round(255 * alpha((x + 0.5) / w, (y + 0.5) / h));
      }
    tex.context.putImageData(img, 0, 0);
    tex.refresh();
  };
  // the beam: a third as wide at the window as at the floor, soft sides, bright high up and thinning as it falls
  paint(SHAFT, SHAFT_W, SHAFT_H, (x, y) => {
    const half = 0.5 * (0.32 + 0.68 * y);
    const side = smooth((half - Math.abs(x - 0.5)) / (half * 0.55));
    return side * smooth(y / 0.06) * (1 - 0.7 * y) * smooth((1 - y) / 0.12);
  });
  // the patch: a long parallelogram whose near edge lies further from the window than its far edge (the rays that land
  // nearer the viewer have travelled further), feathered all round, brightest in its middle
  paint(POOL, POOL_W, POOL_H, (x, y) => {
    const lean = (y - 0.5) * 0.5;
    const ex = smooth((0.3 - Math.abs(x - 0.5 - lean)) / 0.12);
    const ey = smooth((0.5 - Math.abs(y - 0.5)) / 0.28);
    return ex * ey;
  });
}
