/**
 * The title screen's face-off: two heroes from the roster stand on either side of the menu, breathing in their stance
 * and now and then throwing a combo or their Rift Art at each other, drawn from the same sprite atlases the match uses.
 * Every few bouts a new pair steps in. Stops by itself when its canvases leave the page.
 */
import { HERO_COUNT } from '@bladerift/shared';
import type { SpriteAtlasMeta } from '../render/spriteAnim';
import { SPRITE_IDS } from '../render/spriteFighter';

type Atlas = { meta: SpriteAtlasMeta; img: HTMLImageElement };
const cache = new Map<number, Promise<Atlas | null>>();
const V = `?v=${encodeURIComponent(String(import.meta.env.VITE_RELEASE ?? 'dev'))}`;

function atlas(hero: number): Promise<Atlas | null> {
  let p = cache.get(hero);
  if (!p) {
    p = (async () => {
      try {
        const r = await fetch(`assets/characters/${SPRITE_IDS[hero]}/atlas.json${V}`);
        if (!r.ok || !r.headers.get('content-type')?.includes('json')) return null;
        const meta = (await r.json()) as SpriteAtlasMeta;
        const img = new Image();
        img.src = `assets/characters/${SPRITE_IDS[hero]}/atlas.png${V}`;
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

const MOVES = ['combo0', 'combo1', 'combo2', 'heavy', 'art', 'taunt'];

interface Side {
  cv: HTMLCanvasElement;
  g: CanvasRenderingContext2D;
  a: Atlas | null;
  anim: string;
  start: number;
  /** 0..1: fades in a new hero. */
  fade: number;
}

export function startTitleShowcase(left: HTMLCanvasElement, right: HTMLCanvasElement) {
  const sides: Side[] = [left, right].map((cv) => ({ cv, g: cv.getContext('2d')!, a: null, anim: 'idle', start: 0, fade: 0 }));
  let pair: [number, number] = [0, 9];
  let bouts = 0;
  let nextMove = performance.now() + 2200;
  let turn = 0;

  const pick = async () => {
    const a = Math.floor(Math.random() * HERO_COUNT);
    let b = Math.floor(Math.random() * (HERO_COUNT - 1));
    if (b >= a) b++;
    pair = [a, b];
    const [x, y] = await Promise.all([atlas(a), atlas(b)]);
    sides[0].a = x;
    sides[1].a = y;
    for (const s of sides) {
      s.anim = 'idle';
      s.start = performance.now();
      s.fade = 0;
    }
  };

  const size = () => {
    const dpr = Math.min(2, devicePixelRatio || 1);
    for (const s of sides) {
      const w = Math.round((s.cv.clientWidth || 200) * dpr);
      const h = Math.round((s.cv.clientHeight || 300) * dpr);
      if (s.cv.width !== w || s.cv.height !== h) {
        s.cv.width = w;
        s.cv.height = h;
      }
    }
  };

  const draw = (s: Side, now: number, mirror: boolean) => {
    const { g, cv, a } = s;
    g.clearRect(0, 0, cv.width, cv.height);
    if (!a) return;
    const A = a.meta.anims;
    let def = A[s.anim] ?? A.idle;
    const fps = def.fps ?? (def.attack ? 9 : 7);
    let i = Math.floor(((now - s.start) / 1000) * fps);
    if (s.anim !== 'idle' && i >= def.frames.length + 2) {
      s.anim = 'idle';
      s.start = now;
      def = A.idle;
      i = 0;
    }
    const name = s.anim === 'idle' ? def.frames[i % def.frames.length] : def.frames[Math.min(i, def.frames.length - 1)];
    const f = a.meta.frames[name];
    if (!f) return;
    // every hero at the roster's shared scale: a hulking beast stands taller than a slight assassin
    const k = (cv.height * 0.62) / (a.meta.base ?? a.meta.native);
    s.fade = Math.min(1, s.fade + 0.04);
    g.save();
    g.globalAlpha = s.fade;
    g.imageSmoothingEnabled = true;
    if (mirror) {
      g.translate(cv.width, 0);
      g.scale(-1, 1);
    }
    // feet on the bottom, the body a third of the way in from the outer edge (weapons reach toward the centre)
    const x = cv.width * 0.34 - f.ax * k;
    const y = cv.height * 0.97 - f.ay * k;
    g.drawImage(a.img, f.x, f.y, f.w, f.h, x, y, f.w * k, f.h * k);
    g.restore();
  };

  const tick = (now: number) => {
    if (!left.isConnected) return;
    size();
    if (now > nextMove && sides.every((s) => s.a)) {
      // one side attacks, the other answers a beat later now and then
      const s = sides[turn % 2];
      const move = MOVES[Math.floor(Math.random() * MOVES.length)];
      if (s.a!.meta.anims[move]) {
        s.anim = move;
        s.start = now;
      }
      turn++;
      bouts++;
      nextMove = now + 1600 + Math.random() * 1400;
      if (bouts % 7 === 0) {
        nextMove = now + 2600;
        for (const x of sides) x.fade = Math.min(x.fade, 1);
        setTimeout(() => void pick(), 1200);
      }
    }
    draw(sides[0], now, false);
    draw(sides[1], now, true);
    requestAnimationFrame(tick);
  };
  void pick().then(() => requestAnimationFrame(tick));
  return pair;
}
