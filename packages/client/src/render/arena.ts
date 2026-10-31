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
  // the walls: dark stone pillars beyond the edges
  for (const x of [0, W]) {
    const r = scene.add.rectangle(x, a.floor - 1000, 400, 1600, 0x0a0710, 0.92).setOrigin(x === 0 ? 1 : 0, 0).setDepth(-1);
    void r;
    scene.add.rectangle(x, a.floor - 1000, 6, 1000, 0x3a2f4a, 0.8).setOrigin(0.5, 0).setDepth(-1);
  }
  // platforms
  for (const p of a.platforms) {
    scene.add.tileSprite(p.x + p.w / 2, p.y - 2, p.w / k, ph, `p-${theme}`).setOrigin(0.5, 0).setScale(k).setDepth(-2);
  }
  // solid blocks: carved stone pillars, a capstone strip on top, lit edges you can see to wall-jump off
  const STONE: Record<string, [number, number, number]> = {
    bridge: [0x2a3046, 0x3c4562, 0x161a28],
    embers: [0x3a2430, 0x5a3440, 0x1c1018],
    crypt: [0x1c3434, 0x2c4a48, 0x0e1c1c],
    grove: [0x2a3a30, 0x3c5040, 0x141e18],
  };
  const [mid, lit, dark] = STONE[theme] ?? STONE.bridge;
  for (const b of a.blocks) {
    const g = scene.add.graphics().setDepth(-2);
    g.fillStyle(mid, 1).fillRect(b.x, b.y, b.w, b.h);
    // masonry courses
    g.lineStyle(1, dark, 0.9);
    for (let yy = b.y + 18; yy < b.y + b.h; yy += 18) g.lineBetween(b.x, yy, b.x + b.w, yy);
    for (let yy = b.y, row = 0; yy < b.y + b.h; yy += 18, row++)
      for (let xx = b.x + (row % 2 ? 14 : 28); xx < b.x + b.w; xx += 28) g.lineBetween(xx, yy, xx, Math.min(yy + 18, b.y + b.h));
    g.fillStyle(lit, 1).fillRect(b.x, b.y, 3, b.h);
    g.fillStyle(dark, 1).fillRect(b.x + b.w - 3, b.y, 3, b.h);
    g.lineStyle(2, 0x0b0814, 1).strokeRect(b.x, b.y, b.w, b.h);
    scene.add.tileSprite(b.x + b.w / 2, b.y - 3, (b.w + 10) / k, ph, `p-${theme}`).setOrigin(0.5, 0).setScale(k, 0.25).setDepth(-1);
  }
  // ambient: soft vignette
  const vg = scene.add.graphics().setScrollFactor(0).setDepth(40);
  vg.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0.0, 0.0, 0.35, 0.35);
  vg.fillRect(0, scene.scale.height * 0.75, scene.scale.width, scene.scale.height * 0.25);
}
