/**
 * Dev bench (?lab): every weapon's moves, every fighter state and every hero's Rift Art, animated side by side with the
 * real pose code, so animation work can be judged frame by frame.
 *
 *   ?lab                 all weapons; each state animated, each Art under the hero that owns it
 *   ?lab&w=<weaponId>    one weapon
 *   ?lab&hero=<heroId>   one hero: its class weapon, every state, and its Rift Art as a strip of frames
 *   ?lab&t=12            freeze every animated cell at tick 12
 *   ?lab&strip=1         every move as a strip of frames across its ticks (the hit box shows on the active frames)
 */
// @ts-expect-error - plain JS vendor module
import { posed } from '../vendor/pixelfx/core/index.js';
import { Act, ARTS, ArtId, CLASSES, FIGHTER, HEROES, heroOf, heroWeapon, MOVE_AIR, MOVE_ART, MOVE_CHARGED, MOVE_PLUNGE, moveOf, SKILLS, WEAPONS } from '@bladerift/shared';
import type { HeroDef } from '@bladerift/shared';
import { fighterLut, HERO_SCALE, paintHero } from '../render/pixel';
import { poseFor } from '../render/poses';
import type { ViewFighter } from '../net/NetGame';

type View = Record<string, unknown> & { actTf: number };

interface Cell {
  label: string;
  /** Short timing note for Arts and moves (when the effect spawns). */
  note: string;
  weapon: number;
  act: number;
  move: number;
  len: number;
  hero: number;
  base: Record<string, unknown>;
  /** Overrides for one tick (a cell can leave the ground, land, and so on). */
  at?: (t: number) => Partial<View>;
  /** Seconds since touchdown at this tick (the landing squash). */
  land?: (t: number) => number;
  colours: [number, number];
}

const W = 110;
const H = 110; // (headroom for raised lances and swords)
/** Art pixel rows: the feet sit this far above the bottom edge. */
const GROUND = H - 14;
/** Canvas pixels per lab pixel: heroes (?lab&hero=N) render at the game's double detail. */
let K = 1;
const DEFAULT_COLOURS: [number, number] = [0xc8343c, 0xf53cd1];
const ART_NOTE: Record<number, string> = {
  [ArtId.RadiantCleave]: 'wave t=18',
  [ArtId.HailOfArrows]: 'volley t=12',
  [ArtId.ThunderCall]: 'strikes t=10 (+26)',
  [ArtId.ChainsOfGenesis]: 'chains t=8 (+22)',
  [ArtId.VaultOfAges]: 'relics t=10-40',
  [ArtId.PhantomHand]: 'hand t=12',
  [ArtId.Stampede]: 'steed t=14',
  [ArtId.NightHunt]: 'leap t=6, lands',
  [ArtId.BloodFrenzy]: 'roar t=12',
  [ArtId.FlashStep]: 'blink t=8, cuts 14-44',
  [ArtId.Bulwark]: 'barrier 120',
  [ArtId.GrimFog]: 'fog at the end',
  [ArtId.RewrittenFate]: 'heal at the end',
  [ArtId.PiercingFang]: 'lunge',
};

const q = new URL(location.href).searchParams;
const only = q.has('w') ? Number(q.get('w')) : -1;
const heroOnly = q.has('hero') ? Number(q.get('hero')) : -1;
const freeze = q.has('t') ? Number(q.get('t')) : -1;
const strip = q.has('strip') || heroOnly >= 0;

/** The cells of one weapon's states. */
function stateCells(w: number, hero: number, colours: [number, number]): Cell[] {
  const def = WEAPONS[w];
  const out: Cell[] = [];
  const add = (label: string, act: number, move: number, len: number, base: Record<string, unknown> = {}, at?: Cell['at'], note = '') => {
    out.push({ label: `${def.short}: ${label}`, note, weapon: w, act, move, len, hero, base: { ground: true, vx: 0, vy: 0, ...base }, at, colours });
  };
  add('idle', Act.Free, 0, 60);
  add('run', Act.Free, 0, 60, { vx: 230 });
  add('skid', Act.Free, 0, 30, { vx: -230 });
  add('landing', Act.Free, 0, 12, {});
  out[out.length - 1].land = (t) => t / 60;
  add('crouch', Act.Free, 0, 60, { crouch: true });
  add('jump', Act.Free, 0, 30, { ground: false, vy: -300 });
  add('fall', Act.Free, 0, 30, { ground: false, vy: 300 });
  add('fast fall', Act.Free, 0, 30, { ground: false, vy: 700, fast: true });
  add('wall slide', Act.Free, 0, 30, { ground: false, vy: 160, slide: true });
  add('air dash', Act.Roll, 0, FIGHTER.rollTicks, { ground: false, vx: 400, rollAir: true });
  add('roll', Act.Roll, 0, FIGHTER.rollTicks, { vx: 300 });
  def.combo.forEach((m, i) => add(`combo ${i + 1}`, Act.Attack, i, m.startup + m.active + m.recovery));
  add('air', Act.Attack, MOVE_AIR, def.air.startup + def.air.active + def.air.recovery, { ground: false });
  if (def.plunge) add('plunge', Act.Attack, MOVE_PLUNGE, 60, { ground: false, vy: 500 });
  if (def.charged) {
    add('charge', Act.Charge, 0, 50, { charge: 40 });
    const c = def.charged;
    add('charged', Act.Attack, MOVE_CHARGED, c.startup + c.active + c.recovery);
  }
  if (def.block) add('block', Act.Block, 0, 40);
  add('stun', Act.Stun, 0, 30);
  add('heal', Act.Heal, 0, FIGHTER.healTicks);
  add('skill', Act.Skill, 0, SKILLS[0].startup + SKILLS[0].recovery);
  add('ledge', Act.Ledge, 0, 60, { ground: false });
  add('climb', Act.Climb, 0, 14);
  add('KO', Act.KO, 0, 30);
  add('win', Act.Win, 0, 30);
  return out;
}

/** A hero's Rift Art: its own cell (Piercing Fang is the lance's lunge, an attack move). */
function artCell(h: HeroDef): Cell {
  const w = heroWeapon(h.id);
  const colours: [number, number] = [h.armor, h.accent];
  const base = { ground: true, vx: 0, vy: 0, hero: h.id, cls: h.cls };
  const name = ARTS[h.art].name;
  if (h.art === ArtId.PiercingFang) {
    const m = moveOf(w, MOVE_ART)!;
    return { label: `${h.name}: ${name}`, note: ART_NOTE[h.art], weapon: w, act: Act.Attack, move: MOVE_ART, len: m.startup + m.active + m.recovery, hero: h.id, base, colours };
  }
  let at: Cell['at'];
  let len = ARTS[h.art].ticks;
  if (h.art === ArtId.NightHunt) {
    // the leap at tick 6 is airborne until it lands; the world then jumps the art clock to 36 (the slam)
    at = (t) => (t < 6 ? { ground: true } : t < 30 ? { ground: false, vy: t < 18 ? -600 : 600 } : { ground: true, vy: 0, actTf: 36 + (t - 30) });
    len = 44;
  }
  return { label: `${h.name}: ${name}`, note: ART_NOTE[h.art] ?? '', weapon: w, act: Act.Art, move: 0, len, hero: h.id, base: { ...base, art: h.art }, at, colours };
}

export function startPoseLab() {
  document.body.innerHTML = '';
  document.body.style.cssText = 'margin:0;background:#1a1424;color:#ddd;font:12px sans-serif;touch-action:auto';
  const cells: Cell[] = [];
  K = heroOnly >= 0 ? HERO_SCALE : 1;
  if (heroOnly >= 0) {
    const h = heroOf(heroOnly);
    const w = heroWeapon(h.id);
    const col: [number, number] = [h.armor, h.accent];
    cells.push(...stateCells(w, h.id, col).map((c) => ({ ...c, base: { ...c.base, cls: h.cls } })));
    cells.push(artCell(h));
  } else {
    for (let w = 0; w < WEAPONS.length; w++) {
      if (only >= 0 && w !== only) continue;
      cells.push(...stateCells(w, -1, DEFAULT_COLOURS));
      for (const h of HEROES) if (heroWeapon(h.id) === w) cells.push(artCell(h));
    }
  }

  const grid = document.createElement('div');
  grid.style.cssText = strip ? 'display:flex;flex-direction:column;gap:8px;padding:8px' : 'display:grid;grid-template-columns:repeat(auto-fill,180px);gap:6px;padding:8px';
  document.body.appendChild(grid);
  const Z = strip ? 1.5 : 1.6;
  const luts = new Map<string, Map<number, number>>();
  const lutFor = (c: [number, number]) => {
    const k = c.join(',');
    let l = luts.get(k);
    if (!l) luts.set(k, (l = fighterLut(c[0], c[1])));
    return l;
  };

  /** One pose drawn into a canvas at the tick; the hit box shows while the move can hit. */
  const draw = (c: Cell, cv: HTMLCanvasElement, tick: number, now: number) => {
    const ctx = cv.getContext('2d')!;
    const v = { act: c.act, actTf: Math.min(tick, c.len), move: c.move, charge: 40, skill: 0, face: 1, weapons: [c.weapon, c.weapon], slot: 0, ...c.base, ...(c.at?.(tick) ?? {}) } as unknown as ViewFighter & View;
    const pose = poseFor(v, { time: strip ? tick / 60 : now / 1000, runPhase: strip ? (tick / 60) * 10 : (now / 1000) * 10, land: c.land?.(tick) });
    const img = ctx.createImageData(W * K, H * K);
    const b = new Uint32Array(img.data.buffer);
    if (heroOnly >= 0) {
      // ?lab&hero=N: the hero through its model (render/models), at the game's double detail
      paintHero(b, W * K, H * K, 40 * K, GROUND * K, false, { ...pose, x: undefined, y: undefined }, heroOnly);
      for (let i = 0; i < b.length; i++) if (!b[i]) b[i] = 0xff382a44;
    } else {
      const r = posed({ ...pose, x: undefined, y: undefined }) as { n: number; xs: Int16Array; ys: Int16Array; color: Uint32Array };
      b.fill(0xff382a44);
      const lut = lutFor(c.colours);
      for (let i = 0; i < r.n; i++) {
        const x = r.xs[i] + 40;
        const y = r.ys[i] + GROUND;
        if (x >= 0 && y >= 0 && x < W && y < H) b[y * W + x] = lut.get(r.color[i]) ?? r.color[i];
      }
    }
    for (let x = 0; x < W * K; x++) b[GROUND * K * W * K + x] = 0xff5a4a6e;
    ctx.putImageData(img, 0, 0);
    ctx.save();
    ctx.scale(K, K);
    const m = c.act === Act.Attack ? moveOf(c.weapon, c.move) : null;
    const at = Math.min(tick, c.len);
    if (m && !m.arrow && at >= m.startup && at < m.startup + m.active && m.box.w > 0) {
      const bx = 40 + m.box.x / 1.38, by = GROUND + m.box.y / 1.38, bw = m.box.w / 1.38, bh = m.box.h / 1.38;
      ctx.fillStyle = 'rgba(255,64,96,0.18)';
      ctx.fillRect(bx, by, bw, bh);
      ctx.strokeStyle = '#ff4060';
      ctx.strokeRect(bx, by, bw, bh);
    }
    ctx.restore();
  };

  const sized = (cv: HTMLCanvasElement) => {
    cv.width = W * K;
    cv.height = H * K;
    cv.style.cssText = `width:${W * Z}px;height:${H * Z}px;image-rendering:pixelated;display:block`;
    return cv;
  };
  const live: { c: Cell; cv: HTMLCanvasElement; lab: HTMLElement }[] = [];
  for (const c of cells) {
    if (strip) {
      // a strip: the move's ticks as frames, the label above with its timing note
      const box = document.createElement('div');
      box.style.cssText = 'background:#2a2238;border-radius:6px;padding:4px';
      const lab = document.createElement('div');
      lab.textContent = `${c.label}${c.note ? '  (' + c.note + ')' : ''}  [${c.len} ticks]`;
      const frames = document.createElement('div');
      frames.style.cssText = 'display:flex;gap:4px;overflow-x:auto';
      const n = Math.max(6, Math.min(14, Math.round(c.len / 4) + 1));
      for (let i = 0; i < n; i++) {
        const tick = Math.round((i * c.len) / (n - 1));
        const cell = document.createElement('div');
        cell.style.cssText = 'flex:0 0 auto';
        const cv = sized(document.createElement('canvas'));
        const tl = document.createElement('div');
        tl.textContent = `t=${tick}`;
        tl.style.cssText = 'text-align:center;font-size:11px;color:#a9a0c0';
        cell.append(cv, tl);
        frames.appendChild(cell);
        draw(c, cv, tick, 0);
      }
      box.append(lab, frames);
      grid.appendChild(box);
      continue;
    }
    const box = document.createElement('div');
    box.style.cssText = 'background:#2a2238;border-radius:6px;padding:4px';
    const cv = sized(document.createElement('canvas'));
    const lab = document.createElement('div');
    box.append(cv, lab);
    grid.appendChild(box);
    live.push({ c, cv, lab });
  }

  const t0 = performance.now();
  const frame = () => {
    const now = performance.now();
    for (const it of live) {
      const tick = freeze >= 0 ? freeze : ((now - t0) / (1000 / 60)) % (it.c.len + 20);
      draw(it.c, it.cv, tick, now);
      const m = it.c.act === Act.Attack ? moveOf(it.c.weapon, it.c.move) : null;
      const note = it.c.note ? `  (${it.c.note})` : '';
      it.lab.textContent = `${it.c.label}  t=${Math.floor(tick)}${m ? `  [${m.startup}/${m.active}/${m.recovery}]` : ''}${note}`;
    }
    requestAnimationFrame(frame);
  };
  if (live.length) requestAnimationFrame(frame);
}
