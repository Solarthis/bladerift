/**
 * Sprite fighters: which animation frame a fighter shows. The game state (act, move, action time, velocity, flags) picks
 * an animation from the character's atlas (tools/sprites/process.py writes the atlas and its animation table), and the
 * frame inside it follows the move's own timing: startup = anticipation, the first active ticks = the strike, then the
 * extension and the recovery. Time-driven animations (idle, run, KO, victory) play at their own frame rates.
 */
import { lookMove } from './fxmap';
import { Act, ARTS, artIdOf, DODGES, FIGHTER, isAirMove, MOVE_AIR, MOVE_ART, MOVE_CHARGED, MOVE_CRESCENT, MOVE_PLUNGE, moveOf, SKILLS, WEAPONS } from '@bladerift/shared';
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
  /** Hit strength of the current hit-stun (hurtLevel; SpriteFighterView remembers it from the start of the stun).
   * Undefined: judged from what the snapshot shows now. */
  hurt?: 0 | 1 | 2;
  /** Wall clock for the hit-stop shake (s; defaults to `time`, which SpriteFighterView holds still while frozen). */
  shakeT?: number;
}

/**
 * MUGEN-style attack timing (docs/feel/mugen-reference.md, A5): a crisp anticipation over the startup, the strike (the
 * painted money frame with its weapon trail) on the first active tick, held for the whole hit window and at least
 * STRIKE_HOLD ticks (heavies longer) so the swing reads instead of flashing, then the recovery drawing, and for the last few
 * ticks an early return to the stance, so a string flows from pose to pose instead of ending limp.
 * Five-frame attacks (raise, coil, smear, strike, follow-through) are timed too: raise 2 ticks, coil the rest of the
 * startup, smear 2 ticks, then the strike hold.
 */
const STRIKE_HOLD = 8;
const STRIKE_HOLD_HEAVY = 10;
/** Forward offset (world units) of the body on the strike frame: a small lunge into the blow (visual only). */
const LUNGE = 3;
const LUNGE_HEAVY = 4.5;

interface AttackPhase {
  /** Frame index (ignored when `stance`). */
  idx: number;
  /** Back in the stance (the last ticks of the recovery). */
  stance: boolean;
  /** Lunge weight 0..1 (1 on the strike, easing back to 0 through the recovery drawing). */
  lunge: number;
}

/** The drawing set a combo step plays: the finisher is always combo2; a longer string alternates combo0 and combo1
 * before it, so a four- or five-cut flurry swings back and forth instead of repeating one drawing. */
function comboAnim(weapon: number, move: number) {
  const n = WEAPONS[weapon]?.combo.length ?? 3;
  if (n > 1 && move >= n - 1) return 'combo2';
  if (n > 3) return move % 2 ? 'combo1' : 'combo0';
  return `combo${Math.min(2, move)}`;
}

export function attackPhase(startup: number, active: number, recovery: number, t: number, n: number, heavy = false): AttackPhase {
  if (n <= 1 || t < startup) {
    const idx = n >= 5 && t >= Math.min(2, startup * 0.5) ? 1 : 0;
    return { idx, stance: false, lunge: 0 };
  }
  const a = t - startup;
  const after = active + recovery;
  // the strike holds the whole active window and at least STRIKE_HOLD ticks, leaving the recovery drawing 2 ticks
  let ret = Math.min(4, Math.round(recovery * 0.25));
  const hold = Math.max(active, Math.min(heavy ? STRIKE_HOLD_HEAVY : STRIKE_HOLD, after - ret - 2));
  if (after - hold - ret < 2) ret = Math.max(0, after - hold - 2);
  const stanceAt = after - ret;
  // the lunge snaps in on the strike, holds for half of it, then eases back out through the recovery drawing
  const lunge = a < hold * 0.5 ? 1 : Math.max(0, 1 - (a - hold * 0.5) / Math.max(1, stanceAt - hold * 0.5));
  if (a < hold) {
    if (n >= 5 && a < 2) return { idx: 2, stance: false, lunge: 0.6 };
    return { idx: n >= 5 ? 3 : 1, stance: false, lunge };
  }
  if (a >= stanceAt && ret > 0) return { idx: n - 1, stance: true, lunge: 0 };
  // four drawings: the follow-through, then the recovery; three (and five): the last drawing
  if (n === 4 && a < hold + (stanceAt - hold) * 0.5) return { idx: 2, stance: false, lunge };
  return { idx: n - 1, stance: false, lunge };
}

/** Hit strength of a hit-stun, 0 light / 1 medium / 2 heavy: from the hit-stop the hit froze the victim for (the sim
 * scales it with the blow's damage: light ~6, medium 8-9, heavy 10-14), the knockback speed and a knockdown (`fall`). */
export function hurtLevel(hitstop: number, kb: number, fall: boolean): 0 | 1 | 2 {
  if (fall || hitstop >= 10 || kb >= 300) return 2;
  if (hitstop >= 8 || kb >= 200) return 1;
  return 0;
}

/** A frame and the small visual offsets drawn with it (world units, `dx` toward where the fighter faces; `rot` degrees
 * about the body centre, positive pitching forward and negative falling back, mirrored with the facing; `sx`/`sy` a squash
 * about the feet). */
export interface SpritePose {
  frame: string;
  dx: number;
  dy: number;
  sx: number;
  sy: number;
  rot: number;
}

const clampIdx = (i: number, n: number) => Math.max(0, Math.min(n - 1, Math.floor(i)));

/** The landing squash lasts this long (s); the landing drawing shows for LAND_HOLD (s): 1 crouch drawing, ~4 frames. */
const LAND_SQUASH = 0.12;
const LAND_HOLD = 0.075;
/** Victim jitter during hit-stop (world units, by hit strength); a blocker shakes less. */
const JITTER = [2, 2.5, 3];
const JITTER_BLOCK = 1.5;
/** A knockdown's floor bounce: ticks and height (world units). */
const BOUNCE_T = 10;
const BOUNCE_H = 4;

/** The animation and frame for a fighter right now; falls back through simpler animations if the atlas lacks one. */
export function spriteFrameFor(v: ViewFighter, ctx: SpriteCtx, meta: SpriteAtlasMeta): string {
  return spritePoseFor(v, ctx, meta).frame;
}

/** The frame and its visual offsets (lunge, hit-stop jitter, squash, knockdown tilt and bounce) for a fighter right now. */
export function spritePoseFor(v: ViewFighter, ctx: SpriteCtx, meta: SpriteAtlasMeta): SpritePose {
  const pose: SpritePose = { frame: '', dx: 0, dy: 0, sx: 1, sy: 1, rot: 0 };
  pose.frame = pickFrame(v, ctx, meta, pose);
  // hit-stop: the victim's body shakes in place, alternating every 2 frames (the attacker holds still); a superpause
  // freezes everyone without the shake
  if (v.hitstop > 0 && v.pause <= 0 && (v.act === Act.Stun || v.act === Act.Block)) {
    const amp = v.act === Act.Block ? JITTER_BLOCK : JITTER[ctx.hurt ?? hurtLevel(v.hitstop, Math.abs(v.vx), v.fall)];
    pose.dx += (Math.floor((ctx.shakeT ?? ctx.time) * 30) % 2 ? 1 : -1) * amp;
  }
  return pose;
}

function pickFrame(v: ViewFighter, ctx: SpriteCtx, meta: SpriteAtlasMeta, pose: SpritePose): string {
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
  // a knockdown (or K.O.) hitting the floor: a small bounce, squashed on the contact
  const bounce = (ticks: number) => {
    if (ticks >= BOUNCE_T) return;
    pose.dy = -BOUNCE_H * Math.sin((Math.PI * ticks) / BOUNCE_T);
    if (ticks < 3) {
      pose.sy = 0.9;
      pose.sx = 1.05;
    }
  };
  const t = v.actTf;
  const w = v.weapons[v.slot];
  switch (v.act) {
    case Act.Attack: {
      if (v.move === MOVE_ART) {
        // Piercing Fang: the lunge is the Art's execution and recovery (frames 2-5 of 6)
        const n = A.art?.frames.length ?? 1;
        const ph = attackPhase(10, 24, 14, t, 4, true);
        pose.dx = ph.lunge * LUNGE_HEAVY;
        return pick('art', Math.min(n - 1, (n >= 6 ? 2 : 0) + (ph.stance ? 3 : ph.idx)), 'heavy');
      }
      const m = moveOf(w, v.move);
      const name = v.move === MOVE_AIR ? 'airAttack' : isAirMove(v.move) ? comboAnim(w, lookMove(w, v.move) === MOVE_AIR ? 0 : lookMove(w, v.move)) : v.move === MOVE_PLUNGE ? 'plunge' : v.move === MOVE_CHARGED || v.move === MOVE_CRESCENT ? 'heavy' : comboAnim(w, v.move);
      if (!m) return pick(name, 0, 'combo0');
      const n = A[name]?.frames.length ?? 4;
      if (v.move === MOVE_PLUNGE) {
        // start in the air, the dive until it lands (the move holds its active frames while falling), then impact and recovery
        if (t < m.startup) return pick(name, 0, 'airAttack');
        if (!v.ground) return pick(name, 1, 'airAttack');
        return pick(name, t < m.startup + m.active + m.recovery * 0.5 ? 2 : 3, 'combo2');
      }
      const heavy = v.move === MOVE_CHARGED || v.move === MOVE_CRESCENT || m.stun >= 30;
      const ph = attackPhase(m.startup, m.active, m.recovery, t, n, heavy);
      pose.dx = ph.lunge * (heavy ? LUNGE_HEAVY : LUNGE);
      // the body sells the blow: it coils down and back through the wind-up, stretches forward on the first strike
      // frames, and settles (the drawings hold; only the squash, lean and lunge move between them)
      if (t < m.startup) {
        const k = Math.min(1, t / Math.max(1, m.startup));
        pose.sy = 1 - (heavy ? 0.06 : 0.035) * k;
        pose.sx = 1 + (heavy ? 0.04 : 0.025) * k;
        pose.dx -= (heavy ? 3 : 1.5) * k;
        pose.rot = -(heavy ? 3 : 1.5) * k;
      } else if (t < m.startup + 4) {
        const k = 1 - (t - m.startup) / 4;
        pose.sx = 1 + (heavy ? 0.07 : 0.045) * k;
        pose.sy = 1 - (heavy ? 0.04 : 0.025) * k;
        pose.rot = (heavy ? 4 : 2) * k;
      }
      // the early return to the stance (on the ground; in the air the recovery drawing holds)
      if (ph.stance && !isAirMove(v.move) && v.ground) return pick('idle', 0);
      // a charged release: the charge itself showed the first frame, so the release starts at the wind-up
      if (v.move === MOVE_CHARGED) return pick(name, Math.max(1, ph.idx), 'combo2');
      return pick(name, ph.idx, 'combo0');
    }
    case Act.Charge:
      return pick('heavy', 0, 'combo2');
    case Act.Block:
      return pick('guard', 0, 'idle');
    case Act.Ledge:
      return pick('ledge', 0, 'fall');
    case Act.Climb:
      return t < 10 ? pick('climb', 0, 'ledge') : pick('land', 0, 'idle');
    case Act.Roll: {
      // no roll any more: every hero's dodge (DODGES) has its own pose
      const D = DODGES[v.hero] ?? DODGES[0];
      if (D.kind === 'phase') return timed('idle', ctx.time, true);
      if (D.kind === 'leap') {
        if (v.ground) return pick('land', 0, 'idle');
        // the flair vaults (Hunter's Vault, Pole Vault) hold the attack's first frame in the air
        if (v.hero === 1 || v.hero === 3) return pick('airAttack', 0, 'apex');
        return v.vy < -160 ? pick('rise', 0, 'apex', 'fall') : v.vy < 140 ? pick('apex', 0, 'rise', 'fall') : pick('fall', 0, 'apex');
      }
      if (v.ground) return pick('dash', 0, 'roll');
      return pick('airDash', 0, 'dash', 'roll');
    }
    case Act.Stun: {
      const lvl = ctx.hurt ?? hurtLevel(v.hitstop, Math.abs(v.vx), v.fall);
      if (v.fall && !v.ground) {
        // knocked off the feet: thrown back while rising, tipping over onto the back as it comes down
        const rise = v.vy < 0;
        pose.rot = -(rise ? Math.min(18, 4 + t * 1.2) : Math.max(0, 14 - Math.max(0, v.vy) / 40));
        return rise ? pick('launched', 0, 'hitHeavy') : pick('knockFall', 0, 'launched', 'hitHeavy');
      }
      if (!v.ground) return v.vy < 0 && lvl > 0 ? pick('launched', 0, 'hitHeavy') : pick('hitHeavy', 0, 'hitLight');
      // the victim snaps to its hurt drawing on the first hit-stop frame: light flinch, medium jolt, heavy recoil held
      if (lvl === 2) return t < 18 ? pick('hitHeavy', 0, 'hitLight') : pick('hitLight', 1, 'hitHeavy');
      if (lvl === 1) return t < 4 ? pick('hitHeavy', 0, 'hitLight') : pick('hitLight', t < 12 ? 0 : 1, 'hitHeavy');
      return pick('hitLight', t < 8 ? 0 : 1, 'hitHeavy');
    }
    case Act.Down:
      bounce(t);
      return pick('down', 0, 'knockFall', 'hitHeavy');
    case Act.GetUp: {
      const n = A.getUp?.frames.length ?? 1;
      return pick('getUp', (t / Math.max(1, FIGHTER.getUpTicks)) * n, 'land', 'idle');
    }
    case Act.Heal:
      return pick('heal', t < 7 ? 0 : 1, 'idle');
    case Act.Skill: {
      const sk = SKILLS[v.skill] ?? SKILLS[0];
      const st = sk.startup;
      if (A.skill) {
        // the 6-frame special against the skill's own timing: anticipation (2 frames over the startup), execution (2: the
        // release on the spawn / lunge tick, held through a dash's active window or ~STRIKE_HOLD ticks), recovery (2, the
        // last a return to the stance). Hit-stop holds the frame (actTf stands still).
        const n = A.skill.frames.length;
        const dash = sk.kind === 'dash';
        const len = st + (dash ? sk.active ?? 0 : 0) + sk.recovery;
        const exec = dash ? Math.max(4, sk.active ?? 8) : Math.max(4, Math.min(STRIKE_HOLD, sk.recovery - 4));
        const rec = Math.max(1, len - st - exec);
        let idx: number;
        if (t < st) idx = (t / Math.max(1, st)) * 2;
        else if (t < st + exec) idx = t - st < exec * 0.4 ? 2 : 3;
        else idx = t - st - exec < rec * 0.6 ? 4 : 5;
        if (!dash && t >= st && t < st + exec) pose.dx = LUNGE * (1 - (t - st) / exec);
        return pick('skill', Math.min(n - 1, Math.floor(idx)), 'throw', 'combo0');
      }
      // fallbacks until the atlas has the special: a dash lunges, an aura roars, a shot throws
      if (sk.kind === 'dash') return pick('dash', 0, 'roll');
      if (sk.kind === 'aura') return pick('taunt', t < st ? 0 : 1, 'idle');
      return pick('throw', t < st ? 0 : t < st + 6 ? 1 : 2, 'combo0');
    }
    case Act.Art: {
      // the superpause holds the first frame (the caster's Art timer starts after it, so t stays 0)
      const ticks = ARTS[artIdOf({ cls: v.cls, hero: v.hero })]?.ticks ?? 40;
      const n = A.art?.frames.length ?? 1;
      const u = Math.min(0.999, t / Math.max(1, ticks));
      // anticipation 0-35 %, execution 35-75 %, recovery after (6 frames: 2 / 2 / 2)
      const idx = n >= 6 ? (u < 0.35 ? (u / 0.35) * 2 : u < 0.75 ? 2 + ((u - 0.35) / 0.4) * 2 : 4 + ((u - 0.75) / 0.25) * 2) : u * n;
      return pick('art', idx, 'heavy');
    }
    case Act.KO: {
      // the defeat plays through and holds its last drawing. The final blow pops the fighter up: in the air it staggers
      // (frames 0-1), then the collapse and the lying pose follow once it is down, with a bump on the floor.
      const fps = A.ko?.fps ?? 6;
      let s = t / 60;
      if (!v.ground) s = Math.min(s, 1.99 / fps);
      else if (ctx.land >= 0 && ctx.land < s) {
        s = Math.min(s, 1 / fps + ctx.land);
        bounce(ctx.land * 60);
      }
      return timed('ko', s, false, 'down', 'hitHeavy');
    }
    case Act.Win:
      // the winner lands first, then strikes the pose and holds it
      if (!v.ground) return pick('fall', 0, 'apex', 'idle');
      return timed('victory', ctx.land >= 0 ? Math.min(t / 60, ctx.land) : t / 60, false, 'idle');
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
      // landing: a quick squash about the feet and the crouch drawing for ~4 frames
      if (ctx.land >= 0 && ctx.land < LAND_SQUASH) {
        const k = 1 - ctx.land / LAND_SQUASH;
        pose.sx = 1 + 0.06 * k;
        pose.sy = 1 - 0.08 * k;
      }
      if (ctx.land >= 0 && ctx.land < LAND_HOLD) return pick('land', 0, 'crouch', 'idle');
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
