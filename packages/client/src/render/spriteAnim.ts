/**
 * Sprite fighters: which animation frame a fighter shows. The game state (act, move, action time, velocity, flags) picks
 * an animation from the character's atlas (tools/sprites/process.py writes the atlas and its animation table), and the
 * frame inside it follows the move's own timing: startup = anticipation, the first active ticks = the strike, then the
 * extension and the recovery. Time-driven animations (idle, run, KO, victory) play at their own frame rates.
 */
import { Act, ARTS, artIdOf, FIGHTER, MOVE_AIR, MOVE_ART, MOVE_CHARGED, MOVE_PLUNGE, moveOf, SKILLS } from '@bladerift/shared';
import type { ViewFighter } from '../net/NetGame';

export interface SpriteFrame {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Anchor (torso centre on the ground line) inside the frame, in atlas pixels. */
  ax: number;
  ay: number;
}

export interface SpriteAnimDef {
  frames: string[];
  fps?: number;
  loop?: boolean;
  attack?: boolean;
  air?: boolean;
}

export interface SpriteAtlasMeta {
  id: string;
  hero: number;
  /** This character's standing height in atlas pixels (heroes differ: a hulking beast stands taller than a slight assassin). */
  native: number;
  /** The roster's reference standing height: every atlas shares one pixels-per-world-unit scale (see spriteFighter.ts). */
  base?: number;
  size: [number, number];
  frames: Record<string, SpriteFrame>;
  anims: Record<string, SpriteAnimDef>;
  missing: string[];
}

export interface SpriteCtx {
  /** Scene clock (s). */
  time: number;
  /** Run cycle phase (radians, one stride per 2 pi). */
  runPhase: number;
  /** Seconds since the last touchdown. */
  land: number;
  /** Seconds since the fighter left the ground. */
  air?: number;
  /** Seconds into the round intro (undefined outside it): the entrance plays, then holds its last frame (the stance). */
  introT?: number;
}

/** Frame index within an attack-timed animation of 4 frames: anticipation, strike, extension, recovery. */
function attackFrame(startup: number, active: number, recovery: number, t: number, n: number) {
  if (n <= 1) return 0;
  if (t < startup) return 0;
  const a = t - startup;
  if (a < Math.max(1, Math.ceil(active * 0.6))) return Math.min(1, n - 1);
  if (a < active + recovery * 0.45) return Math.min(2, n - 1);
  return n - 1;
}

const clampIdx = (i: number, n: number) => Math.max(0, Math.min(n - 1, Math.floor(i)));

/** The animation and frame for a fighter right now; falls back through simpler animations if the atlas lacks one. */
export function spriteFrameFor(v: ViewFighter, ctx: SpriteCtx, meta: SpriteAtlasMeta): string {
  const A = meta.anims;
  const pick = (name: string, idx: number, ...fallbacks: string[]): string => {
    for (const n of [name, ...fallbacks]) {
      const a = A[n];
      if (a) return a.frames[clampIdx(n === name ? idx : 0, a.frames.length)];
    }
    return A.idle?.frames[0] ?? Object.keys(meta.frames)[0];
  };
  const timed = (name: string, seconds: number, loop: boolean, ...fb: string[]) => {
    const a = A[name];
    if (!a) return pick(name, 0, ...fb);
    const i = seconds * (a.fps ?? 8);
    return pick(name, loop ? Math.floor(i) % a.frames.length : i, ...fb);
  };
  const t = v.actTf;
  const w = v.weapons[v.slot];
  switch (v.act) {
    case Act.Attack: {
      if (v.move === MOVE_ART) {
        // Piercing Fang: the lunge is the Art's execution and recovery (frames 2-5 of 6)
        const n = A.art?.frames.length ?? 1;
        return pick('art', Math.min(n - 1, (n >= 6 ? 2 : 0) + attackFrame(10, 24, 14, t, 4)), 'heavy');
      }
      const m = moveOf(w, v.move);
      const name = v.move === MOVE_AIR ? 'airAttack' : v.move === MOVE_PLUNGE ? 'plunge' : v.move === MOVE_CHARGED ? 'heavy' : `combo${Math.min(2, v.move)}`;
      if (!m) return pick(name, 0, 'combo0');
      const n = A[name]?.frames.length ?? 4;
      if (v.move === MOVE_CHARGED) {
        // the charge itself showed the first frame: the release plays wind-up, strike, follow-through
        return pick(name, Math.max(1, attackFrame(m.startup, m.active, m.recovery, t, n)), 'combo2');
      }
      if (v.move === MOVE_PLUNGE) {
        // start in the air, the dive until it lands (the move holds its active frames while falling), then impact and recovery
        if (t < m.startup) return pick(name, 0, 'airAttack');
        if (!v.ground) return pick(name, 1, 'airAttack');
        return pick(name, t < m.startup + m.active + m.recovery * 0.5 ? 2 : 3, 'combo2');
      }
      return pick(name, attackFrame(m.startup, m.active, m.recovery, t, n), 'combo0');
    }
    case Act.Charge:
      return pick('heavy', 0, 'combo2');
    case Act.Block:
      return pick('guard', 0, 'idle');
    case Act.Ledge:
      return pick('ledge', 0, 'fall');
    case Act.Climb:
      return t < 10 ? pick('climb', 0, 'ledge') : pick('land', 0, 'idle');
    case Act.Roll:
      if (v.rollAir) return pick('airDash', 0, 'dash', 'roll');
      return pick('roll', (t / FIGHTER.rollTicks) * (A.roll?.frames.length ?? 4), 'dash');
    case Act.Stun:
      if (!v.ground) return v.vy < 0 ? pick('launched', 0, 'hitHeavy') : pick('knockFall', 0, 'launched', 'hitHeavy');
      if (t < 4) return pick('hitHeavy', 0, 'hitLight');
      return pick('hitLight', t < 14 ? 0 : 1, 'hitHeavy');
    case Act.Heal:
      return pick('heal', t < 7 ? 0 : 1, 'idle');
    case Act.Skill: {
      const sk = SKILLS[v.skill];
      const st = sk?.startup ?? 8;
      return pick('throw', t < st ? 0 : t < st + 6 ? 1 : 2, 'combo0');
    }
    case Act.Art: {
      const ticks = ARTS[artIdOf({ cls: v.cls, hero: v.hero })]?.ticks ?? 40;
      const n = A.art?.frames.length ?? 1;
      const u = Math.min(0.999, t / Math.max(1, ticks));
      // anticipation 0-35 %, execution 35-75 %, recovery after (6 frames: 2 / 2 / 2)
      const idx = n >= 6 ? (u < 0.35 ? (u / 0.35) * 2 : u < 0.75 ? 2 + ((u - 0.35) / 0.4) * 2 : 4 + ((u - 0.75) / 0.25) * 2) : u * n;
      return pick('art', idx, 'heavy');
    }
    case Act.KO:
      return timed('ko', t / 60, false, 'down', 'hitHeavy');
    case Act.Win:
      return timed('victory', t / 60, false, 'idle');
    default: {
      if (ctx.introT !== undefined && A.intro) return timed('intro', ctx.introT, false);
      if (v.slide) return pick('wallSlide', 0, 'fall');
      if (v.crouch) return pick('crouch', 0, 'idle');
      if (!v.ground && v.fast) return pick('fastFall', 0, 'fall');
      if (!v.ground) {
        if (ctx.air !== undefined && ctx.air < 0.07 && v.vy < 0) return pick('jumpStart', 0, 'rise');
        if (v.vy < -160) return pick('rise', 0, 'apex', 'fall');
        if (v.vy < 140) return pick('apex', 0, 'rise', 'fall');
        return pick('fall', 0, 'apex');
      }
      if (ctx.land >= 0 && ctx.land < 0.1) return pick('land', 0, 'crouch', 'idle');
      const speed = Math.abs(v.vx);
      if (speed > 90 && Math.sign(v.vx) !== Math.sign(v.face)) return pick('skid', 0, 'idle');
      if (speed > 25) {
        const n = A.run?.frames.length ?? 8;
        const ph = ((ctx.runPhase / (Math.PI * 2)) % 1 + 1) % 1;
        return pick('run', ph * n, 'idle');
      }
      return timed('idle', ctx.time, true);
    }
  }
}
