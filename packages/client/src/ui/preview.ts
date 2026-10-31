// A fighter drawn into a menu canvas: the same PixelFX rig, colours and weapon hold as in the game.
// @ts-expect-error - plain JS vendor module
import { posed } from '../vendor/pixelfx/core/index.js';
import { heroOf, heroWeapon } from '@bladerift/shared';
import { fighterLut, HERO_SCALE, paintHero } from '../render/pixel';
import { poseFor } from '../render/poses';
import { accentOf, colorOf } from './colors';
import type { ViewFighter } from '../net/NetGame';

const PW = 80 * HERO_SCALE;
const PH = 80 * HERO_SCALE;

/**
 * A hero with its costume, in the idle pose holding his own weapon, as PW x PH pixels with the feet at
 * (PW / 2, PH - 14). `flip` mirrors him.
 */
export function heroPreviewPixels(hero: number, flip: boolean): Uint32Array {
  const h = heroOf(hero);
  const weapon = heroWeapon(h.id);
  const v = { act: 0, actTf: 0, ground: true, vx: 0, vy: 0, weapons: [weapon, weapon], slot: 0, move: 0, charge: 0, skill: 0, face: 1 } as unknown as ViewFighter;
  const pose = poseFor(v, { time: 0, runPhase: 0 });
  const px = new Uint32Array(PW * PH);
  paintHero(px, PW, PH, PW / 2, PH - 14 * HERO_SCALE, flip, pose, hero);
  return px;
}

/** Draws a hero (see heroPreviewPixels) into a menu canvas, scaled up crisp. */
export function drawHeroPreview(cv: HTMLCanvasElement, hero: number, flip: boolean) {
  const ctx = cv.getContext('2d');
  if (!ctx) return;
  const img = new ImageData(PW, PH);
  new Uint32Array(img.data.buffer).set(heroPreviewPixels(hero, flip));
  const tmp = document.createElement('canvas');
  tmp.width = PW;
  tmp.height = PH;
  tmp.getContext('2d')!.putImageData(img, 0, 0);
  ctx.clearRect(0, 0, cv.width, cv.height);
  ctx.imageSmoothingEnabled = false;
  const s = Math.floor(Math.min(cv.width / PW, cv.height / PH) * 100) / 100;
  ctx.drawImage(tmp, (cv.width - PW * s) / 2, (cv.height - PH * s) / 2, PW * s, PH * s);
}

export function drawPreview(cv: HTMLCanvasElement, color: number, accent: number, weapon: number, flip: boolean) {
  const ctx = cv.getContext('2d');
  if (!ctx) return;
  const v = { act: 0, actTf: 0, ground: true, vx: 0, vy: 0, weapons: [weapon, weapon], slot: 0, move: 0, charge: 0, skill: 0, face: 1 } as unknown as ViewFighter;
  const pose = poseFor(v, { time: 0, runPhase: 0 });
  const r = posed(pose) as { n: number; xs: Int16Array; ys: Int16Array; color: Uint32Array };
  const lut = fighterLut(colorOf(color), accentOf(accent));
  // small art canvas, scaled up crisp
  const W = 80;
  const H = 80;
  const img = new ImageData(W, H);
  const b = new Uint32Array(img.data.buffer);
  for (let i = 0; i < r.n; i++) {
    let x = r.xs[i] + W / 2;
    const y = r.ys[i] + H - 14;
    if (flip) x = W - 1 - x;
    if (x < 0 || y < 0 || x >= W || y >= H) continue;
    b[y * W + x] = lut.get(r.color[i]) ?? r.color[i];
  }
  const tmp = document.createElement('canvas');
  tmp.width = W;
  tmp.height = H;
  tmp.getContext('2d')!.putImageData(img, 0, 0);
  ctx.clearRect(0, 0, cv.width, cv.height);
  ctx.imageSmoothingEnabled = false;
  const s = Math.floor(Math.min(cv.width / W, cv.height / H) * 100) / 100;
  ctx.drawImage(tmp, (cv.width - W * s) / 2, (cv.height - H * s) / 2, W * s, H * s);
}
