/** The arena on screen: the painted backdrop (parallax), floor, walls and platforms for one ArenaDef. */
import Phaser from 'phaser';
import type { ArenaDef } from '@bladerift/shared';

export function buildArena(scene: Phaser.Scene, a: ArenaDef) {
  const theme = a.theme;
  const W = a.w;
  // painted backdrop: its dark bottom band sits on the floor line; parallax at half speed
  const bg = scene.add.image(W / 2, a.floor + 40, `bg-${theme}`).setOrigin(0.5, 0.8).setDepth(-20).setScrollFactor(0.55, 0.7);
  const s = Math.max((W + 700) / bg.width, 900 / (bg.height * 0.8));
  bg.setScale(s);
  // a second, darker copy further out fills the edges on very wide screens
  // floor
  const ptex = scene.textures.get(`p-${theme}`).getSourceImage() as HTMLImageElement;
  const ph = ptex.height;
  const k = 0.5;
  scene.add.tileSprite(W / 2, a.floor, W + 1600, ph, `p-${theme}`).setOrigin(0.5, 0).setTileScale(1, 1).setScale(k, k).setDepth(-2);
  scene.add.tileSprite(W / 2, a.floor, (W + 1600) / k, ph, `p-${theme}`).setOrigin(0.5, 0).setScale(k).setDepth(-2);
  scene.add.rectangle(W / 2, a.floor + ph * k - 2, W + 3200, 800, 0x07050b).setOrigin(0.5, 0).setDepth(-3);
  // stone: the theme's masonry for the walls and the solid blocks
  const STONE: Record<string, [number, number, number]> = {
    bridge: [0x2a3046, 0x3c4562, 0x161a28],
    embers: [0x3a2430, 0x5a3440, 0x1c1018],
    crypt: [0x1c3434, 0x2c4a48, 0x0e1c1c],
    grove: [0x2a3a30, 0x3c5040, 0x141e18],
  };
  const [mid, lit, dark] = STONE[theme] ?? STONE.bridge;
  /** A carved stone mass with masonry courses; `litLeft` / `litRight` say which faces catch the light. */
  const stone = (x: number, y: number, w: number, h: number, litLeft: boolean, litRight: boolean, depth: number) => {
    const g = scene.add.graphics().setDepth(depth);
    g.fillStyle(mid, 1).fillRect(x, y, w, h);
    g.lineStyle(1, dark, 0.9);
    for (let yy = y + 18; yy < y + h; yy += 18) g.lineBetween(x, yy, x + w, yy);
    for (let yy = y, row = 0; yy < y + h; yy += 18, row++)
      for (let xx = x + (row % 2 ? 14 : 28); xx < x + w; xx += 28) g.lineBetween(xx, yy, xx, Math.min(yy + 18, y + h));
    g.fillStyle(litLeft ? lit : dark, 1).fillRect(x, y, 3, h);
    g.fillStyle(litRight ? lit : dark, 1).fillRect(x + w - 3, y, 3, h);
    g.lineStyle(2, 0x0b0814, 1).strokeRect(x, y, w, h);
    return g;
  };
  // the walls: tall masonry beyond the edges, the inner face lit (you wall-jump off it), shading off into the dark
  for (const left of [true, false]) {
    const x = left ? -400 : W;
    stone(x, a.floor - 1400, 400, 1400, !left, left, -1);
    const shade = scene.add.graphics().setDepth(-1);
    shade.fillGradientStyle(0x07050b, 0x07050b, 0x07050b, 0x07050b, left ? 0.85 : 0, left ? 0 : 0.85, left ? 0.85 : 0, left ? 0 : 0.85);
    shade.fillRect(x, a.floor - 1400, 400, 1400);
  }
  // platforms
  for (const p of a.platforms) {
    scene.add.tileSprite(p.x + p.w / 2, p.y - 2, p.w / k, ph, `p-${theme}`).setOrigin(0.5, 0).setScale(k).setDepth(-2);
  }
  // solid blocks: carved stone pillars, a capstone strip on top, lit edges you can see to wall-jump off
  for (const b of a.blocks) {
    stone(b.x, b.y, b.w, b.h, true, false, -2);
    scene.add.tileSprite(b.x + b.w / 2, b.y - 3, (b.w + 10) / k, ph, `p-${theme}`).setOrigin(0.5, 0).setScale(k, 0.25).setDepth(-1);
  }
  // ambient: soft vignette
  const vg = scene.add.graphics().setScrollFactor(0).setDepth(40);
  vg.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0.0, 0.0, 0.35, 0.35);
  vg.fillRect(0, scene.scale.height * 0.75, scene.scale.width, scene.scale.height * 0.25);
}
