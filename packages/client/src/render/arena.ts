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
import type { StaticLight } from './lighting';

/** Per theme: the ambient light level (the light map's base colour) and the floor's colour grade. */
type Beam = { u: number; v0: number; v1: number; w: number; slant: number; color: number; k: number };
/** Shafts of light through the wall's windows (wall-picture coordinates), and the dust that drifts in them. */
const BEAMS: Record<string, Beam[]> = {
  hall: [
    { u: 0.154, v0: 0.12, v1: 0.55, w: 0.05, slant: 150, color: 0x9ab8ff, k: 0.055 },
    { u: 0.5, v0: 0.18, v1: 0.55, w: 0.05, slant: 150, color: 0x9ab8ff, k: 0.055 },
    { u: 0.846, v0: 0.12, v1: 0.55, w: 0.05, slant: 150, color: 0x9ab8ff, k: 0.055 },
  ],
  bridge: [
    { u: 0.86, v0: 0.05, v1: 0.6, w: 0.07, slant: -120, color: 0xb8ccff, k: 0.05 },
    { u: 0.4, v0: 0.05, v1: 0.6, w: 0.07, slant: -120, color: 0xb8ccff, k: 0.045 },
  ],
  embers: [
    { u: 0.12, v0: 0.2, v1: 0.5, w: 0.05, slant: 110, color: 0xff7a3a, k: 0.06 },
    { u: 0.67, v0: 0.25, v1: 0.55, w: 0.06, slant: 110, color: 0xff7a3a, k: 0.06 },
  ],
  crypt: [{ u: 0.5, v0: 0.0, v1: 0.3, w: 0.08, slant: 60, color: 0x8affd8, k: 0.04 }],
  grove: [
    { u: 0.3, v0: 0.0, v1: 0.5, w: 0.06, slant: 140, color: 0xc8b8ff, k: 0.055 },
    { u: 0.72, v0: 0.0, v1: 0.5, w: 0.05, slant: 140, color: 0xc8b8ff, k: 0.05 },
  ],
};

const LOOK: Record<string, { ambient: number; far: number; near: number; lamp: number }> = {
  hall: { ambient: 0x706878, far: 0x7a7280, near: 0xc4b8ac, lamp: 0.9 },
  bridge: { ambient: 0x68728e, far: 0x6a7490, near: 0xb0bacc, lamp: 0.85 },
  embers: { ambient: 0x745658, far: 0x7a5650, near: 0xc49484, lamp: 0.9 },
  crypt: { ambient: 0x627670, far: 0x5c6c66, near: 0xa0b0a8, lamp: 0.9 },
  grove: { ambient: 0x726c88, far: 0x686480, near: 0xaca6b4, lamp: 0.85 },
};

/** Depth of the floor seen from the camera: the foot of the back wall is FAR of the way to the fighters' line. */
const FAR = 0.72;
/** World units between the fighters' line and the foot of the wall (on screen). */
const BACK = 58;
/** Floor drawn this far below the fighters' line (it runs off the bottom of the view). */
const FRONT = 320;
/** Floor texture: world units per texel at the fighters' line, and how much the floor is foreshortened. */
const TEXEL = 0.2;
const SQUASH = 0.42;
const ROWS = 44;
/** The back wall's height (world units) and the mirrored copies laid side by side. */
const WALL_H = 300;
const COPIES = [-2, -1, 0, 1, 2];

export interface ArenaView {
  /** The lamps on the back wall. */
  lights: StaticLight[];
  ambient: number;
  /** Lay the floor strips under the camera (call once per frame, after the camera moved). */
  update(): void;
}

export function buildArena(scene: Phaser.Scene, a: ArenaDef): ArenaView {
  const theme = a.theme;
  const look = LOOK[theme] ?? LOOK.hall;
  const W = a.w;
  const D = BACK / (1 - FAR);
  const horizon = a.floor - D;
  const wallBase = a.floor - BACK;

  // ---- the back wall: the painting, mirrored copies either side (the joins meet seamlessly), at the floor's far parallax
  const wallKey = scene.textures.exists(`wall-${theme}`) ? `wall-${theme}` : `bg-${theme}`;
  const src = scene.textures.get(wallKey).getSourceImage() as HTMLImageElement;
  // scaled so its lamps and windows sit just above the fighters' heads (the camera sees ~250-300 units of height)
  const ws = WALL_H / src.height;
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

  // ---- light shafts and drifting dust (additive, over the light map so they read as light in the dark)
  const beamG = scene.add.graphics().setDepth(13).setBlendMode(Phaser.BlendModes.ADD);
  const beams = BEAMS[theme] ?? [];
  const motes = Array.from({ length: 46 }, (_, i) => ({ x: (i * 977) % W, y: a.floor - ((i * 431) % 300), vx: 2 + (i % 5), vy: -1 - (i % 3), ph: i * 1.7 }));
  let t = 0;
  let last = performance.now();

  return {
    lights,
    ambient: look.ambient,
    update() {
      const cam = scene.cameras.main;
      const z = cam.zoom || 1;
      const cx = cam.midPoint.x;
      const hw = scene.scale.width / z / 2 + 40;
      const now = performance.now();
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      t += dt;
      beamG.clear();
      // (a point on the far wall, as the world x it shows at on the near layer)
      const onWall = (x: number) => x + (1 - FAR) * cam.scrollX;
      for (const k3 of COPIES) {
        for (const b of beams) {
          const u = k3 % 2 === 0 ? b.u : 1 - b.u;
          const x = onWall(W / 2 + k3 * tw + (u - 0.5) * tw);
          if (Math.abs(x - cx) > hw + 400) continue;
          const yTop = wallBase + 2 - (1 - b.v1) * src.height * ws;
          const half = b.w * tw * 0.5;
          const sl = k3 % 2 === 0 ? b.slant : -b.slant;
          const yBot = a.floor + 26;
          const pulse = b.k * (0.85 + 0.15 * Math.sin(t * 0.7 + u * 9));
          // a shaft widening down to the floor, brightest at the window
          beamG.fillGradientStyle(b.color, b.color, b.color, b.color, pulse, pulse, pulse * 0.25, pulse * 0.25);
          beamG.fillTriangle(x - half, yTop, x + half, yTop, x - half * 2.2 + sl, yBot);
          beamG.fillGradientStyle(b.color, b.color, b.color, b.color, pulse, pulse * 0.25, pulse * 0.25, pulse * 0.25);
          beamG.fillTriangle(x + half, yTop, x + half * 2.2 + sl, yBot, x - half * 2.2 + sl, yBot);
          // and where it lands, a pale patch on the floor
          beamG.fillStyle(b.color, pulse * 0.55).fillEllipse(x + sl, yBot - 4, half * 5.5, 20);
        }
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
}

function lerpColor(a: number, b: number, t: number) {
  const ch = (s: number) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t) << s;
  return ch(16) | ch(8) | ch(0);
}
