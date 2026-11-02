/**
 * Frame cache warming: a hero's frames render once (heroRig caches every pose per model), so before and during the
 * round intro we render every pose a fighter can show - idle, the run cycle, air phases, every move of both weapons at
 * every held step, the Art, rolls, hits - in small slices that never take more than a few milliseconds of a frame.
 * After that, gameplay animation costs almost nothing, even on phones.
 */
import { Act, ARTS, FIGHTER, heroOf, MOVE_AIR, MOVE_AIR2, MOVE_AIR3, MOVE_LAUNCH, MOVE_ART, MOVE_CHARGED, MOVE_PLUNGE, moveOf, SKILLS, WEAPONS } from '@bladerift/shared';
// @ts-expect-error - plain JS module
import { renderHero } from './heroRig.js';
import { modelOf } from './models/index';
import { AIR_VY, poseFor, type PoseCtx } from './poses';
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
function posesFor(hero: number, weapons: readonly number[], skill: number) {
  const out: Record<string, unknown>[] = [];
  const h = heroOf(hero);
  const view = (o: Partial<ViewFighter>) =>
    ({ act: Act.Free, actTf: 0, ground: true, vx: 0, vy: 0, weapons, slot: 0, move: 0, charge: 0, skill, face: 1, hero, cls: h.cls, ...o }) as ViewFighter;
  const push = (v: ViewFighter, ctx: PoseCtx = { time: 0, runPhase: 0 }) => out.push(poseFor(v, ctx));
  for (const slot of [0, 1]) {
    const w = weapons[slot];
    const def = WEAPONS[w];
    if (!def) continue;
    // standing, running (16 frames per stride), air phases, skid, landing
    // idle breathing (every breath level over the ~2.6 s cycle), then the run cycle (16 frames per stride)
    for (let i = 0; i <= 6; i++) push(view({ slot }), { time: i * 0.4, runPhase: 0 });
    for (let f = 0; f < 16; f++) push(view({ slot, vx: 230 }), { time: 0, runPhase: (f / 16) * Math.PI * 2 });
    // airborne: every vertical-speed level of the rise-apex-fall blend, and the wall slide's two grip beats
    for (const vy of AIR_VY) push(view({ slot, ground: false, vy }));
    for (const time of [0, 0.25]) push(view({ slot, ground: false, vy: 160, slide: true }), { time, runPhase: 0 });
    // touchdown squash, one pose per held step of the 0.2 s spring-back
    for (const land of [0, 0.05, 0.1, 0.15]) push(view({ slot }), { time: 0, runPhase: 0, land });
    // skid when reversing, crouch with the weapon lowered
    push(view({ slot, vx: -230 }));
    push(view({ slot, crouch: true }));
    // the charge (the staff's and lance's flicker only shows above 30 charge), climb, hit-stun recoil at each held step and wobble phase, the KO fall
    for (const charge of [0, 40]) push(view({ slot, act: Act.Charge, charge }));
    for (let t = 0; t <= 14; t++) push(view({ slot, act: Act.Climb, actTf: t }));
    for (let t = 0; t <= 30; t += 3) for (const time of [0, 0.03, 0.06, 0.09, 0.12]) push(view({ slot, act: Act.Stun, actTf: t }), { time, runPhase: 0 });
    for (let t = 0; t <= 24; t += 2) push(view({ slot, act: Act.KO, actTf: t }));
    // every move at every tick (held steps dedupe in the cache)
    const moves = [...def.combo.map((_, i) => i), MOVE_AIR, MOVE_AIR2, MOVE_AIR3, ...(def.combo[0].arrow ? [] : [MOVE_LAUNCH]), ...(def.plunge ? [MOVE_PLUNGE] : []), ...(def.charged ? [MOVE_CHARGED] : [])];
    for (const move of moves) {
      const m = moveOf(w, move);
      if (!m) continue;
      const len = m.startup + m.active + m.recovery;
      for (let t = 0; t <= len; t++) push(view({ slot, act: Act.Attack, move, actTf: t, ground: move < MOVE_AIR || move === MOVE_CHARGED || move === MOVE_LAUNCH }));
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
  // the heal sip, the ledge sway (a quantised wobble over its period), the win and the block
  for (let t = 0; t <= 16; t += 2) push(view({ act: Act.Heal, actTf: t }));
  for (let i = 0; i <= 10; i++) push(view({ act: Act.Ledge, actTf: 10 }), { time: i * 0.1, runPhase: 0 });
  for (const act of [Act.Win, Act.Block, Act.Guard]) push(view({ act, actTf: 10 }));
  return out.map((p) => {
    const { x: _x, y: _y, ...rest } = p as Record<string, unknown>;
    void _x;
    void _y;
    return rest;
  });
}

/** Queue a fighter's frames for background rendering (no-op when already warmed). */
export function warmFighter(hero: number, weapons: readonly number[], skill: number) {
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
