/**
 * Dev bench for sprite fighters (?sprites&hero=N): every state the game can put a fighter in, played live at game speed
 * through the same frame picker the match uses (render/spriteAnim.ts), so timing, anchoring (feet planted, no sliding) and
 * missing frames can be judged as a player would see them. &zoom=K scales the cells (default 2), &slow=K slows time down.
 */
import { Act, CLASSES, FIGHTER, heroOf, MOVE_AIR, MOVE_ART, MOVE_CHARGED, MOVE_PLUNGE, moveOf, TICK_RATE } from '@bladerift/shared';
import type { ViewFighter } from '../net/NetGame';
import { spriteFrameFor, type SpriteAtlasMeta } from '../render/spriteAnim';
import { SPRITE_IDS } from '../render/spriteFighter';

interface Cell {
  label: string;
  /** Length of one loop in ticks. */
  ticks: number;
  /** State at tick t of the loop. */
  at(t: number): Partial<ViewFighter> & { runPhase?: number; land?: number; dy?: number };
}

export async function startSpriteLab() {
  const u = new URL(location.href);
  const hero = Number(u.searchParams.get('hero') ?? 0);
  const zoom = Number(u.searchParams.get('zoom') ?? 2);
  const slow = Number(u.searchParams.get('slow') ?? 1);
  const id = SPRITE_IDS[hero];
  document.body.innerHTML = '';
  document.body.style.cssText = 'margin:0;background:#1d1828;color:#ddd;font:12px sans-serif;overflow:auto';
  const meta = (await (await fetch(`assets/characters/${id}/atlas.json`)).json()) as SpriteAtlasMeta;
  const img = new Image();
  img.src = `assets/characters/${id}/atlas.png`;
  await img.decode();

  const h = heroOf(hero);
  const w = CLASSES[h.cls].signature;
  const len = (move: number) => {
    const m = moveOf(w, move);
    return m ? m.startup + m.active + m.recovery + 12 : 40;
  };
  const atk = (move: number, ground = true): Cell => ({
    label: move === MOVE_AIR ? 'air attack' : move === MOVE_CHARGED ? 'heavy' : move === MOVE_ART ? 'art lunge' : `combo ${move + 1}`,
    ticks: len(move),
    at: (t) => ({ act: t < len(move) - 12 ? Act.Attack : Act.Free, move, actTf: t, ground }),
  });
  const cells: Cell[] = [
    { label: 'idle', ticks: 240, at: () => ({}) },
    { label: 'run', ticks: 120, at: (t) => ({ vx: 230, runPhase: (t / TICK_RATE) * (6 + 230 / 28) }) },
    { label: 'skid', ticks: 30, at: () => ({ vx: -200 }) },
    { label: 'crouch', ticks: 30, at: () => ({ crouch: true }) },
    { label: 'guard', ticks: 30, at: (t) => ({ act: Act.Block, actTf: t }) },
    { label: 'jump arc', ticks: 70, at: (t) => ({ ground: t < 4 || t > 62, vy: -520 + t * 16, dy: t < 4 || t > 62 ? 0 : -Math.max(0, 520 * ((t - 4) / 60) - 8 * ((t - 4) / 60) ** 2 * 60 * 1.1) * 0.15, land: t > 62 ? (t - 62) / 60 : 9 }) },
    { label: 'fast fall', ticks: 30, at: () => ({ ground: false, fast: true, vy: 600 }) },
    { label: 'wall slide', ticks: 30, at: () => ({ ground: false, slide: true, vy: 100 }) },
    { label: 'ledge / climb', ticks: 50, at: (t) => (t < 30 ? { act: Act.Ledge, ground: false, actTf: t } : { act: Act.Climb, actTf: t - 30 }) },
    { label: 'roll', ticks: FIGHTER.rollTicks + 10, at: (t) => (t < FIGHTER.rollTicks ? { act: Act.Roll, actTf: t } : {}) },
    { label: 'air dash', ticks: 30, at: (t) => ({ act: Act.Roll, rollAir: true, ground: false, actTf: t }) },
    atk(0), atk(1), atk(2), atk(MOVE_AIR, false), atk(MOVE_CHARGED),
    { label: 'plunge', ticks: 50, at: (t) => ({ act: t < 40 ? Act.Attack : Act.Free, move: MOVE_PLUNGE, actTf: t < 18 ? t : t, ground: t >= 18 }) },
    { label: 'charge (hold)', ticks: 40, at: (t) => ({ act: Act.Charge, actTf: t, charge: t }) },
    { label: 'hit (ground)', ticks: 40, at: (t) => ({ act: t < 30 ? Act.Stun : Act.Free, actTf: t }) },
    { label: 'launched', ticks: 50, at: (t) => ({ act: Act.Stun, ground: false, vy: -300 + t * 20, actTf: t }) },
    { label: 'heal', ticks: 40, at: (t) => ({ act: t < 30 ? Act.Heal : Act.Free, actTf: t }) },
    { label: 'skill throw', ticks: 40, at: (t) => ({ act: t < 26 ? Act.Skill : Act.Free, actTf: t }) },
    { label: 'Rift Art', ticks: 90, at: (t) => ({ act: t < 70 ? Act.Art : Act.Free, actTf: t }) },
    atk(MOVE_ART),
    { label: 'KO', ticks: 120, at: (t) => ({ act: Act.KO, actTf: t }) },
    { label: 'victory', ticks: 120, at: (t) => ({ act: Act.Win, actTf: t }) },
  ];

  const CW = Math.round(meta.native * 1.9);
  const CH = Math.round(meta.native * 1.6);
  const cols = Math.max(1, Math.floor((innerWidth - 20) / (CW * zoom)));
  const cv = document.createElement('canvas');
  cv.width = cols * CW * zoom;
  cv.height = Math.ceil(cells.length / cols) * CH * zoom;
  document.body.appendChild(cv);
  const g = cv.getContext('2d')!;
  g.imageSmoothingEnabled = true;
  const t0 = performance.now();
  const base: ViewFighter = {
    id: 0, seat: 0, x: 0, y: 0, vx: 0, vy: 0, face: 1, ground: true, act: Act.Free, actT: 0, slot: 0, move: 0, hp: 1000, charge: 0,
    invuln: false, burning: false, slowed: false, rooted: false, flask: 3, skillCd: 0, rollCd: 0, blockT: 0, weapons: [w, w], skill: 0,
    crouch: false, slide: false, rollAir: false, fast: false, frenzy: false, buff: false, veil: false, rift: 0, cls: h.cls, hero, actTf: 0,
    self: true, moveSeq: 0,
  };
  const frame = () => {
    const time = (performance.now() - t0) / 1000 / slow;
    const tick = Math.floor(time * TICK_RATE);
    g.fillStyle = '#1d1828';
    g.fillRect(0, 0, cv.width, cv.height);
    cells.forEach((c, i) => {
      const t = tick % c.ticks;
      const st = c.at(t);
      const v = { ...base, ...st } as ViewFighter;
      const name = spriteFrameFor(v, { time, runPhase: st.runPhase ?? 0, land: st.land ?? 9 }, meta);
      const f = meta.frames[name];
      const ox = (i % cols) * CW * zoom;
      const oy = Math.floor(i / cols) * CH * zoom;
      g.fillStyle = i % 2 ? '#2a2438' : '#262033';
      g.fillRect(ox, oy, CW * zoom, CH * zoom);
      const gy = oy + CH * zoom * 0.88;
      g.fillStyle = '#5a4a6e';
      g.fillRect(ox, gy, CW * zoom, 1);
      if (f) {
        const ax = ox + CW * zoom * 0.42;
        g.drawImage(img, f.x, f.y, f.w, f.h, ax - f.ax * zoom, gy + (st.dy ?? 0) * zoom - f.ay * zoom, f.w * zoom, f.h * zoom);
        g.fillStyle = '#ff4a6a';
        g.fillRect(ax - 1, gy - 1, 3, 3);
      }
      g.fillStyle = '#ddd';
      g.fillText(`${c.label}  [${name ?? 'missing'}]`, ox + 6, oy + 14);
    });
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
