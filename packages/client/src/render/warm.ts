/**
 * Frame cache warming: a hero's frames render once (heroRig caches every pose per model), so before and during the
 * round intro we render every pose a fighter can show - idle, the run cycle, air phases, every move of both weapons at
 * every held step, the Art, rolls, hits - in small slices that never take more than a few milliseconds of a frame.
 * After that, gameplay animation costs almost nothing, even on phones.
 */
import { Act, ARTS, FIGHTER, heroOf, MOVE_AIR, MOVE_ART, MOVE_CHARGED, MOVE_PLUNGE, moveOf, SKILLS, WEAPONS } from '@bladerift/shared';
// @ts-expect-error - plain JS module
import { renderHero } from './heroRig.js';
import { modelOf } from './models/index';
import { poseFor } from './poses';
import type { ViewFighter } from '../net/NetGame';

interface Job {
  hero: number;
  poses: Record<string, unknown>[];
  i: number;
}

const queue: Job[] = [];
const done = new Set<string>();
let running = false;

/** Every pose a fighter with this hero and loadout can show (deduplicated by the rig's cache anyway). */
function posesFor(hero: number, weapons: [number, number], skill: number) {
  const out: Record<string, unknown>[] = [];
  const h = heroOf(hero);
  const view = (o: Partial<ViewFighter>) =>
    ({ act: Act.Free, actTf: 0, ground: true, vx: 0, vy: 0, weapons, slot: 0, move: 0, charge: 0, skill, face: 1, hero, cls: h.cls, ...o }) as ViewFighter;
  const push = (v: ViewFighter, ctx = { time: 0, runPhase: 0 }) => out.push(poseFor(v, ctx));
  for (const slot of [0, 1]) {
    const w = weapons[slot];
    const def = WEAPONS[w];
    if (!def) continue;
    // standing, running (16 frames per stride), air phases, skid, landing
    push(view({ slot }));
    push(view({ slot }), { time: 1.3, runPhase: 0 });
    for (let f = 0; f < 16; f++) push(view({ slot, vx: 230 }), { time: 0, runPhase: (f / 16) * Math.PI * 2 });
    for (const vy of [-300, 0, 300]) push(view({ slot, ground: false, vy }));
    // every move at every tick (held steps dedupe in the cache)
    const moves = [...def.combo.map((_, i) => i), MOVE_AIR, ...(def.plunge ? [MOVE_PLUNGE] : []), ...(def.charged ? [MOVE_CHARGED] : [])];
    for (const move of moves) {
      const m = moveOf(w, move);
      if (!m) continue;
      const len = m.startup + m.active + m.recovery;
      for (let t = 0; t <= len; t++) push(view({ slot, act: Act.Attack, move, actTf: t, ground: move !== MOVE_AIR && move !== MOVE_PLUNGE }));
    }
    for (let t = 0; t <= FIGHTER.rollTicks; t += 2) push(view({ slot, act: Act.Roll, actTf: t }));
    push(view({ slot, act: Act.Stun }));
  }
  if (h.art !== undefined) {
    const ticks = ARTS[h.art]?.ticks ?? 40;
    for (let t = 0; t <= ticks; t++) push(view({ act: Act.Art, actTf: t }));
    for (let t = 0; t <= 48; t++) push(view({ act: Act.Attack, move: MOVE_ART, actTf: t }));
  }
  const sk = SKILLS[skill];
  if (sk) for (let t = 0; t <= sk.startup + sk.recovery; t += 2) push(view({ act: Act.Skill, actTf: t }));
  for (const act of [Act.KO, Act.Win, Act.Heal, Act.Ledge, Act.Block]) push(view({ act, actTf: 10 }));
  return out.map((p) => {
    const { x: _x, y: _y, ...rest } = p as Record<string, unknown>;
    void _x;
    void _y;
    return rest;
  });
}

/** Queue a fighter's frames for background rendering (no-op when already warmed). */
export function warmFighter(hero: number, weapons: [number, number], skill: number) {
  const key = `${hero}|${weapons}|${skill}`;
  if (done.has(key)) return;
  done.add(key);
  queue.push({ hero, poses: posesFor(hero, weapons, skill), i: 0 });
  if (!running) pump();
}

function pump() {
  running = true;
  const slice = () => {
    const t0 = performance.now();
    while (queue.length && performance.now() - t0 < 6) {
      const job = queue[0];
      const model = modelOf(job.hero);
      renderHero(job.poses[job.i++], model);
      if (job.i >= job.poses.length) queue.shift();
    }
    if (queue.length) setTimeout(slice, 8);
    else running = false;
  };
  setTimeout(slice, 0);
}
