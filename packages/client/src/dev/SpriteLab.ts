/**
 * Dev bench for sprite fighters (?sprites&hero=N): every state the game can put a fighter in, played live at game speed
 * through the same pose picker the match uses (render/spriteAnim.ts: the frame plus the lunge, hit-stop shake, landing
 * squash, knockdown tilt and bounce), so timing, anchoring (feet planted, no sliding) and missing frames can be judged as a
 * player would see them. &zoom=K scales the cells (default 2), &slow=K slows time down, &only=a,b keeps the cells whose
 * label contains one of the words, &tick=N freezes the bench at tick N (screenshots).
 */
import { Act, ARTS, artIdOf, CLASSES, FIGHTER, heroOf, heroWeapon, MOVE_AIR, MOVE_ART, MOVE_CHARGED, MOVE_PLUNGE, moveOf, SKILLS, TICK_RATE } from '@bladerift/shared';
import type { ViewFighter } from '../net/NetGame';
import { spritePoseFor, type SpriteAtlasMeta } from '../render/spriteAnim';
import { SPRITE_IDS } from '../render/spriteFighter';

type CellState = Partial<ViewFighter> & { runPhase?: number; land?: number; dy?: number; introT?: number; hurt?: 0 | 1 | 2 };
interface Cell {
  label: string;
  /** Length of one loop in ticks. */
  ticks: number;
  /** State at tick t of the loop. */
  at(t: number): CellState;
}

/** Height (world-ish px) of a hop that leaves the ground at tick a and lands at tick b, at tick t. */
const arc = (t: number, a: number, b: number, h: number) => (t <= a || t >= b ? 0 : -h * 4 * ((t - a) / (b - a)) * (1 - (t - a) / (b - a)));

export async function startSpriteLab() {
  const u = new URL(location.href);
  const hero = Number(u.searchParams.get('hero') ?? 0);
  const zoom = Number(u.searchParams.get('zoom') ?? 2);
  const slow = Number(u.searchParams.get('slow') ?? 1);
  const only = (u.searchParams.get('only') ?? '').split(',').filter(Boolean);
  const fixed = u.searchParams.get('tick');
  const id = SPRITE_IDS[hero];
  document.body.innerHTML = '';
  document.body.style.cssText = 'margin:0;background:#1d1828;color:#ddd;font:12px sans-serif;overflow:auto';
  const res = await fetch(`assets/characters/${id}/atlas.json`);
  if (!res.ok || !res.headers.get('content-type')?.includes('json')) {
    document.body.textContent = `${id ?? 'hero ' + hero}: no sprite atlas yet (generate its sheets, then run tools/sprites/process.py).`;
    return;
  }
  const meta = (await res.json()) as SpriteAtlasMeta;
  const img = new Image();
  img.src = `assets/characters/${id}/atlas.png`;
  await img.decode();

  const h = heroOf(hero);
  const w = heroWeapon(h.id);
  const len = (move: number) => {
    const m = moveOf(w, move);
    return m ? m.startup + m.active + m.recovery + 12 : 40;
  };
  const atk = (move: number, ground = true): Cell => ({
    label: move === MOVE_AIR ? 'air attack' : move === MOVE_CHARGED ? 'heavy' : move === MOVE_ART ? 'art lunge' : `combo ${move + 1}`,
    ticks: len(move),
    at: (t) => ({ act: t < len(move) - 12 ? Act.Attack : Act.Free, move, actTf: t, ground }),
  });
  // a string that connects: each move's hit freezes the attacker for its hit-stop, and the next move chains at the end
  // of the active window (chain on hit), so stance never shows between links
  const string = (): Cell => {
    const seq: CellState[] = [];
    for (let k = 0; k < 3; k++) {
      const m = moveOf(w, k);
      if (!m) break;
      const hs = Math.max(6, Math.min(12, Math.round(4 + m.dmg / 20)));
      const last = k === 2 || !moveOf(w, k + 1);
      for (let t = 0; t < m.startup; t++) seq.push({ act: Act.Attack, move: k, actTf: t });
      for (let i = 0; i < hs; i++) seq.push({ act: Act.Attack, move: k, actTf: m.startup, hitstop: hs - i });
      const end = last ? m.active + m.recovery : m.active;
      for (let t = 0; t < end; t++) seq.push({ act: Act.Attack, move: k, actTf: m.startup + t });
      if (last) break;
    }
    for (let i = 0; i < 20; i++) seq.push({});
    return { label: 'string 1-2-3 (on hit)', ticks: seq.length, at: (t) => seq[t] };
  };
  // a blow landing: hit-stop (the victim shakes in place, frozen at action time 0), then the stun plays out
  const hit = (label: string, hurt: 0 | 1 | 2, hs: number, stun: number): Cell => ({
    label,
    ticks: hs + stun + 20,
    at: (t) => (t < hs ? { act: Act.Stun, actTf: 0, hitstop: hs - t, hurt } : t < hs + stun ? { act: Act.Stun, actTf: t - hs, hurt } : {}),
  });
  // launched into a knockdown: hit-stop, the flight (fall set), the floor (Act.Down, a bounce), the get-up
  const KD_HS = 12;
  const KD_AIR = 40;
  const kdDown = KD_HS + KD_AIR;
  const kdUp = kdDown + FIGHTER.downTicks;
  const kdEnd = kdUp + FIGHTER.getUpTicks;
  const knockdown: Cell = {
    label: 'knockdown > down > get up',
    ticks: kdEnd + 24,
    at: (t) => {
      if (t < KD_HS) return { act: Act.Stun, actTf: 0, hitstop: KD_HS - t, fall: true, hurt: 2 };
      if (t < kdDown) {
        const a = t - KD_HS;
        return { act: Act.Stun, actTf: a, fall: true, ground: false, vy: -520 + (1040 * a) / KD_AIR, dy: arc(a, 0, KD_AIR, 46), hurt: 2 };
      }
      if (t < kdUp) return { act: Act.Down, actTf: t - kdDown };
      if (t < kdEnd) return { act: Act.GetUp, actTf: t - kdUp };
      return {};
    },
  };
  const skill = hero; // every hero brings its own special (SkillId = hero id)
  const sk = SKILLS[skill] ?? SKILLS[0];
  const skLen = sk.startup + (sk.kind === 'dash' ? sk.active ?? 0 : 0) + sk.recovery;
  const artTicks = ARTS[artIdOf({ cls: h.cls, hero })]?.ticks ?? 40;
  const PAUSE = FIGHTER.superpause;
  const all: Cell[] = [
    { label: 'intro', ticks: 150, at: (t) => ({ introT: t / TICK_RATE }) },
    { label: 'idle', ticks: 240, at: () => ({}) },
    { label: 'run', ticks: 120, at: (t) => ({ vx: 230, runPhase: (t / TICK_RATE) * (6 + 230 / 28) }) },
    { label: 'skid', ticks: 30, at: () => ({ vx: -200 }) },
    { label: 'crouch', ticks: 30, at: () => ({ crouch: true }) },
    { label: 'guard (blocked: shake)', ticks: 40, at: (t) => ({ act: Act.Block, actTf: t, hitstop: t >= 10 && t < 14 ? 14 - t : 0 }) },
    { label: 'jump arc + land squash', ticks: 80, at: (t) => ({ ground: t < 4 || t > 62, vy: -520 + t * 16, dy: arc(t, 4, 62, 60), land: t > 62 ? (t - 62) / 60 : 9 }) },
    { label: 'fast fall', ticks: 30, at: () => ({ ground: false, fast: true, vy: 600 }) },
    { label: 'wall slide', ticks: 30, at: () => ({ ground: false, slide: true, vy: 100 }) },
    { label: 'ledge / climb', ticks: 50, at: (t) => (t < 30 ? { act: Act.Ledge, ground: false, actTf: t } : { act: Act.Climb, actTf: t - 30 }) },
    { label: 'dodge', ticks: FIGHTER.rollTicks + 10, at: (t) => (t < FIGHTER.rollTicks ? { act: Act.Roll, actTf: t } : {}) },
    { label: 'air dash', ticks: 30, at: (t) => ({ act: Act.Roll, rollAir: true, ground: false, actTf: t }) },
    atk(0), atk(1), atk(2), string(), atk(MOVE_AIR, false), atk(MOVE_CHARGED),
    { label: 'plunge', ticks: 50, at: (t) => ({ act: t < 40 ? Act.Attack : Act.Free, move: MOVE_PLUNGE, actTf: t, ground: t >= 18 }) },
    { label: 'charge (hold)', ticks: 40, at: (t) => ({ act: Act.Charge, actTf: t, charge: t }) },
    hit('hit light', 0, 6, 16),
    hit('hit medium', 1, 8, 24),
    hit('hit heavy', 2, 12, 36),
    knockdown,
    { label: 'air hit (juggle)', ticks: 50, at: (t) => ({ act: Act.Stun, ground: false, vy: -300 + t * 20, actTf: t, hurt: 1 }) },
    { label: 'heal', ticks: 40, at: (t) => ({ act: t < 30 ? Act.Heal : Act.Free, actTf: t }) },
    { label: `skill: ${sk.name}`, ticks: skLen + 16, at: (t) => ({ act: t < skLen ? Act.Skill : Act.Free, actTf: t, skill }) },
    {
      label: 'Rift Art (superpause holds)',
      ticks: PAUSE + artTicks + 20,
      at: (t) => (t < PAUSE ? { act: Act.Art, actTf: 0, pause: PAUSE - t } : t < PAUSE + artTicks ? { act: Act.Art, actTf: t - PAUSE } : {}),
    },
    atk(MOVE_ART),
    { label: 'KO (popped up, lands)', ticks: 150, at: (t) => ({ act: Act.KO, actTf: t, ground: t >= 18, dy: arc(t, 0, 18, 22), land: t >= 18 ? (t - 18) / 60 : -1 }) },
    { label: 'victory', ticks: 120, at: (t) => ({ act: Act.Win, actTf: t }) },
  ];
  const cells = all.filter((c) => !only.length || only.some((o) => c.label.includes(o)));

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
    id: 0, seat: 0, x: 0, y: 0, vx: 0, vy: 0, face: 1, ground: true, act: Act.Free, actT: 0, slot: 0, stance: 0, move: 0, hp: 1000, charge: 0,
    invuln: false, burning: false, slowed: false, rooted: false, flask: 3, skillCd: 0, rollCd: 0, blockT: 0, heat: 0, reload: false, weapons: [w, w], skill: 0,
    crouch: false, slide: false, rollAir: false, fast: false, frenzy: false, buff: false, veil: false, rift: 0, cls: h.cls, hero, actTf: 0,
    self: true, moveSeq: 0, hitstop: 0, pause: 0, fall: false,
  };
  // the sprite's world units per atlas pixel, so the pose offsets (world units) draw at the game's proportions
  const k = (meta.base ?? meta.native) / (FIGHTER.h * 1.12);
  const frame = () => {
    const time = fixed !== null ? Number(fixed) / TICK_RATE : (performance.now() - t0) / 1000 / slow;
    const tick = Math.floor(time * TICK_RATE);
    g.fillStyle = '#1d1828';
    g.fillRect(0, 0, cv.width, cv.height);
    cells.forEach((c, i) => {
      const t = tick % c.ticks;
      const st = c.at(t);
      const v = { ...base, ...st } as ViewFighter;
      const pose = spritePoseFor(v, { time, runPhase: st.runPhase ?? 0, land: st.land ?? 9, introT: st.introT, hurt: st.hurt }, meta);
      const name = pose.frame;
      const f = meta.frames[name];
      const ox = (i % cols) * CW * zoom;
      const oy = Math.floor(i / cols) * CH * zoom;
      g.fillStyle = i % 2 ? '#2a2438' : '#262033';
      g.fillRect(ox, oy, CW * zoom, CH * zoom);
      const gy = oy + CH * zoom * 0.88;
      g.fillStyle = '#5a4a6e';
      g.fillRect(ox, gy, CW * zoom, 1);
      const ax = ox + CW * zoom * 0.42;
      if (f) {
        g.save();
        // the anchor, the pose offsets, the tilt about the body centre, the squash about the feet
        g.translate(ax + pose.dx * k * zoom, gy + ((st.dy ?? 0) + pose.dy * k) * zoom);
        if (pose.rot) {
          const p = meta.native * 0.42 * zoom;
          g.translate(0, -p);
          g.rotate((pose.rot * Math.PI) / 180);
          g.translate(0, p);
        }
        g.scale(pose.sx, pose.sy);
        g.drawImage(img, f.x, f.y, f.w, f.h, -f.ax * zoom, -f.ay * zoom, f.w * zoom, f.h * zoom);
        g.restore();
      }
      g.fillStyle = '#ff4a6a';
      g.fillRect(ax - 1, gy - 1, 3, 3);
      g.fillStyle = '#ddd';
      const tag = v.hitstop > 0 ? ' HIT-STOP' : v.pause > 0 ? ' SUPERPAUSE' : '';
      g.fillText(`${c.label}  [${name ?? 'missing'}]${tag}`, ox + 6, oy + 14);
    });
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
