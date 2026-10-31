/**
 * The hero select's live preview: the selected hero's sprite plays its stance, with a combo, the heavy strike and the
 * Rift Art now and then, drawn from the same atlas the match uses (assets/characters/<id>/atlas.*). Stops by itself when
 * its canvas leaves the page.
 */
import type { SpriteAtlasMeta } from '../render/spriteAnim';
import { SPRITE_IDS } from '../render/spriteFighter';

const cache = new Map<number, Promise<{ meta: SpriteAtlasMeta; img: HTMLImageElement } | null>>();

function atlas(hero: number) {
  let p = cache.get(hero);
  if (!p) {
    const id = SPRITE_IDS[hero];
    p = (async () => {
      try {
        const r = await fetch(`assets/characters/${id}/atlas.json`);
        if (!r.ok || !r.headers.get('content-type')?.includes('json')) return null;
        const meta = (await r.json()) as SpriteAtlasMeta;
        const img = new Image();
        img.src = `assets/characters/${id}/atlas.png`;
        await img.decode();
        return { meta, img };
      } catch {
        return null;
      }
    })();
    cache.set(hero, p);
  }
  return p;
}

/** The showcase: idle for a while, then one of the moves, back to idle. */
const SHOW = ['combo0', 'combo1', 'combo2', 'heavy', 'art', 'victory'];

export async function animatePreview(cv: HTMLCanvasElement, hero: number) {
  const a = await atlas(hero);
  if (!a || !cv.isConnected) {
    cv.hidden = true;
    return;
  }
  cv.hidden = false;
  const { meta, img } = a;
  const g = cv.getContext('2d')!;
  const dpr = Math.min(2, devicePixelRatio || 1);
  const W = cv.clientWidth || 160;
  const H = cv.clientHeight || 160;
  cv.width = Math.round(W * dpr);
  cv.height = Math.round(H * dpr);
  // fit the hero's own stance in the box, feet on the bottom
  const k = (cv.height * 0.7) / meta.native;
  let anim = 'idle';
  let start = performance.now();
  let show = 0;
  const tick = (now: number) => {
    if (!cv.isConnected) return;
    const def = meta.anims[anim] ?? meta.anims.idle;
    const fps = def.fps ?? (def.attack ? 10 : 8);
    let i = Math.floor(((now - start) / 1000) * fps);
    if (anim === 'idle' && i >= def.frames.length * 3) {
      anim = SHOW[show++ % SHOW.length];
      if (!meta.anims[anim]) anim = 'idle';
      start = now;
      i = 0;
    } else if (anim !== 'idle' && i >= def.frames.length + 2) {
      anim = 'idle';
      start = now;
      i = 0;
    }
    const frames = (meta.anims[anim] ?? def).frames;
    const name = frames[anim === 'idle' ? i % frames.length : Math.min(i, frames.length - 1)];
    const f = meta.frames[name];
    g.clearRect(0, 0, cv.width, cv.height);
    if (f) {
      g.imageSmoothingEnabled = true;
      const x = cv.width * 0.36 - f.ax * k;
      const y = cv.height * 0.96 - f.ay * k;
      g.drawImage(img, f.x, f.y, f.w, f.h, x, y, f.w * k, f.h * k);
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
