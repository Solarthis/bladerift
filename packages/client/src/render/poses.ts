/**
 * Fighter poses for the PixelFX rig: idle, run, jump, roll, stun, heal, block, charge, skill, KO and every weapon move.
 * The attack tracks are PixelFX's own acted moves (wind-up, a snap to the strike, follow-through, recovery), re-timed
 * onto Bladerift's startup / active / recovery ticks so what you see is exactly when the hit can land.
 */
import { Act, ArtId, classOf, FIGHTER, MOVE_AIR, MOVE_ART, MOVE_CHARGED, MOVE_PLUNGE, moveOf, SKILLS, TICK_RATE, WEAPONS, WeaponId } from '@bladerift/shared';
// @ts-expect-error - plain JS vendor module
import { poseAt } from '../vendor/pixelfx/core/act.js';
import type { ViewFighter } from '../net/NetGame';
import type { Pose } from './pixel';

const READY = { crouch: 3, fx: 11, fy: -21, bx: 9, by: -21, ffx: 7, fbx: -7 };

type Key = [number, Pose, string?];

/** What each weapon looks like in the hands (the rig's weapon names). */
const HOLD: Record<number, Pose> = {
  [WeaponId.Sword]: { weapon: 'sword', fx: 12, fy: -21, sa: -0.85 },
  [WeaponId.Scythe]: { weapon: 'scythe', sa: -1.5, fx: 11, fy: -22, bx: 7, by: -16 },
  [WeaponId.Lance]: { weapon: 'spear', sa: -1.42, fx: 11, fy: -21, bx: 7, by: -16 },
  [WeaponId.Daggers]: { weapon: 'dagger', offWeapon: 'dagger', sa: -0.5, sb: -0.9, fx: 12, fy: -24, bx: 9, by: -24 },
  [WeaponId.Hammer]: { weapon: 'hammer', two: true, sa: 0.62, fx: 11, fy: -21 },
  [WeaponId.Bow]: { weapon: 'bow', sa: -0.4, fx: 12, fy: -20, bx: 6, by: -17 },
  [WeaponId.Shield]: { offWeapon: 'shield', sb: 0, bx: 10, by: -24, fx: 6, fy: -18 },
  [WeaponId.Staff]: { weapon: 'staff', sa: -1.45, fx: 11, fy: -21, bx: 7, by: -16 },
};

const hold = (w: number): Pose => ({ ...READY, ...(HOLD[w] ?? {}) });

// ---------------------------------------------------------------- attack tracks (t = 0: first hitting tick)

function swordSlash(w: number): Key[] {
  const G = { ...hold(w), weapon: 'sword', fx: 12, fy: -21, sa: -0.85 };
  const WIND = { ...G, crouch: 4, lean: -4, fx: -7, fy: -35, sa: -2.65, bx: 9, by: -25, armsFront: true, ffx: 9, fbx: -8 };
  const CUT = { ...G, crouch: 2, lean: 3, fx: 16, fy: -37, sa: -1.45, bx: -7, by: -24, ffx: 11, fbx: -10, ghost: 1 };
  const DOWN = { ...G, crouch: 5, lean: 5, fx: 20, fy: -21, sa: 0.62, bx: -9, by: -24, ffx: 13, fbx: -10, toeB: true };
  return [[-0.3, WIND], [-0.08, { ...WIND, crouch: 5, lean: -5 }], [0, CUT, 'snap'], [0.06, DOWN, 'snap'], [0.3, { ...DOWN, crouch: 6 }], [0.58, { ...G, crouch: 3, fx: 15, fy: -21, sa: 0.1, bx: -5, by: -21, ffx: 9, fbx: -7 }]];
}

function swordRising(w: number): Key[] {
  // the second stroke comes back up from low (double slash's return)
  const G = { ...hold(w), weapon: 'sword' };
  const LOW = { ...G, crouch: 6, lean: 6, fx: 22, fy: -20, sa: 0.62, bx: -8, by: -24, ffx: 13, fbx: -10, toeB: true };
  return [[-0.12, { ...LOW, fx: 20, fy: -17, sa: 0.85 }], [0, { ...LOW, crouch: 3, fx: 22, fy: -28, sa: 0.1, by: -18, ghost: 1 }, 'snap'], [0.04, { ...LOW, crouch: 1, fx: 19, fy: -37, sa: -0.95, by: -18, ffx: 13, fby: -6 }, 'snap'], [0.33, { ...LOW, crouch: 3, lean: 3, fx: 18, fy: -36, sa: -1.05, by: -19, ffx: 12 }], [0.75, G]];
}

function spinSlash(w: number, weapon = 'sword'): Key[] {
  const S = { ...hold(w), weapon };
  const WOUND = { ...S, crouch: 6, lean: -2, yaw: 1.1, fx: 13, fy: -20, sa: 0.3, bx: 6, by: -24, ffx: 8, fbx: -8 };
  const WIDE = { ...S, crouch: 5, lean: 3, fx: 21, fy: -21, sa: 0.05, bx: -9, by: -23, ffx: 11, fbx: -11 };
  return [[-0.2, WOUND], [-0.02, { ...WOUND, crouch: 7, yaw: 1.3 }], [0, { ...WIDE, sa: -0.1, ghost: 1 }, 'snap'], [0.05, { ...WIDE, yaw: -1.57, ghost: 1 }, 'snap'], [0.09, { ...WIDE, yaw: -3.14, ghost: 1 }, 'snap'], [0.13, { ...WIDE, yaw: -4.71, ghost: 1 }, 'snap'], [0.17, WIDE, 'snap'], [0.56, { ...WIDE, crouch: 4, lean: 2 }], [0.92, S]];
}

function scytheReap(): Key[] {
  const REST_ = { ...READY, weapon: 'scythe', sa: -1.5, fx: 11, fy: -22, bx: 7, by: -16 };
  const OUT_ = { ...REST_, two: true, crouch: 4, lean: 4, fx: 17, fy: -27, sa: -0.45, ffx: 11, fbx: -8 };
  const END = { ...REST_, two: true, yaw: 3.14, crouch: 6, lean: 4, fx: 15, fy: -24, sa: 0.3, ffx: 11, fbx: -10, toeB: true };
  return [[-0.26, OUT_], [0, { ...OUT_, crouch: 5 }], [0.06, { ...OUT_, yaw: 0.8, crouch: 5, lean: 3, fx: 16, fy: -23, sa: 0.1, ghost: 1 }], [0.16, { ...OUT_, yaw: 1.9, crouch: 6, lean: 3, fx: 15, fy: -23, sa: 0.2, ghost: 1 }], [0.28, END], [0.78, { ...END, crouch: 5 }], [1.16, { ...REST_, yaw: 1.4, crouch: 4 }], [1.56, REST_]];
}

function scytheHook(): Key[] {
  // the third reap: high overhead, dragged down and back towards him
  const REST_ = { ...READY, weapon: 'scythe', sa: -1.5, fx: 11, fy: -22, bx: 7, by: -16 };
  const HIGH = { ...REST_, two: true, crouch: 2, lean: -4, fx: 6, fy: -40, sa: -1.9, ffx: 10, fbx: -8 };
  const DRAG = { ...REST_, two: true, crouch: 7, lean: -3, fx: 2, fy: -20, sa: 0.9, ffx: 12, fbx: -10, ghost: 1 };
  return [[-0.3, HIGH], [-0.04, { ...HIGH, lean: -5 }], [0, { ...REST_, two: true, crouch: 4, lean: 6, fx: 20, fy: -30, sa: -0.4, ffx: 12, fbx: -9, ghost: 1 }, 'snap'], [0.08, DRAG, 'snap'], [0.5, { ...DRAG, crouch: 6 }], [0.9, REST_]];
}

function thrust(weapon: string, two: boolean): Key[] {
  const ST = { ...READY, weapon, two, fx: 12, fy: -21, sa: -0.3, bx: 7, by: -18 };
  const BACK = { ...ST, crouch: 5, lean: -3, fx: -3, fy: -19, sa: -0.05, bx: 8, by: -30, armsFront: !two, ffx: 10, fbx: -8 };
  const LUNGE = { ...ST, crouch: 6, lean: 6, fx: 23, fy: -20, sa: 0, bx: -8, by: -24, ffx: 15, fbx: -11, toeB: true };
  return [[-0.24, BACK], [-0.05, { ...BACK, crouch: 6, fx: -5 }], [0, { ...LUNGE, ghost: 1 }, 'snap'], [0.07, LUNGE, 'snap'], [0.3, { ...LUNGE, crouch: 5, lean: 5 }], [0.7, ST]];
}

function spearSweep(): Key[] {
  const REST_ = { ...READY, weapon: 'spear', sa: -1.42, fx: 11, fy: -21, bx: 7, by: -16 };
  const COCK = { ...REST_, two: true, yaw: 2.5, crouch: 6, lean: 2, fx: 15, fy: -17, sa: 0.05, ffx: 9, fbx: -8 };
  const OUT_ = { ...REST_, two: true, crouch: 6, lean: 6, fx: 20, fy: -15, sa: 0.04, ffx: 12, fbx: -10, toeB: true };
  return [[-0.34, { ...REST_, two: true, crouch: 4, fx: 14, fy: -22, sa: -0.7 }], [-0.14, COCK], [-0.02, { ...COCK, crouch: 7, yaw: 2.7 }], [0.045, { ...OUT_, yaw: 1.3, ghost: 1 }, 'snap'], [0.09, { ...OUT_, ghost: 1 }, 'snap'], [0.14, OUT_, 'snap'], [0.62, { ...OUT_, crouch: 5, lean: 5 }], [1.12, { ...REST_, two: true, crouch: 4, sa: -0.7, fx: 14, fy: -22 }]];
}

function lanceLunge(): Key[] {
  const ST = { ...READY, weapon: 'spear', two: true, fx: 14, fy: -21, sa: 0, bx: 7, by: -18 };
  const LUNGE = { ...ST, crouch: 7, lean: 7, fx: 23, fy: -21, sa: 0, ffx: 16, fbx: -12, toeB: true, ghost: 1 };
  return [[-0.1, { ...ST, crouch: 6, lean: -2, fx: 6 }], [0, LUNGE, 'snap'], [0.3, LUNGE], [0.42, { ...LUNGE, crouch: 5, lean: 4, ghost: 0 }], [0.8, ST]];
}

const dBase = { ...READY, weapon: 'dagger', offWeapon: 'dagger', sa: -0.5, sb: -0.9, crouch: 4, lean: 3, ffx: 11, fbx: -9, fx: 12, fy: -24, bx: 9, by: -24 };
const near = (fx: number, fy: number, sa: number, o: Pose = {}) => ({ ...dBase, fx, fy, sa, bx: 4, by: -24, sb: -1, ...o });
const far = (bx: number, by: number, sb: number, o: Pose = {}) => ({ ...dBase, bx, by, sb, fx: 1, fy: -23, sa: -1, ...o });

function daggerStab(i: number): Key[] {
  const stab = i % 2 === 0 ? near(20, -31 + (i === 2 ? -5 : 0), -0.5, { ghost: 1 }) : far(21, -23, 0.5, { ghost: 1 });
  return [[-0.06, { ...dBase, lean: -2, crouch: 5, fx: 2, fy: -22, sa: -1.2, bx: 2, by: -26, sb: -1.5 }], [0, stab, 'snap'], [0.05, { ...stab, ghost: 0 }, 'snap'], [0.2, dBase]];
}

function daggerFinish(): Key[] {
  return [[-0.08, { ...dBase, lean: -3, crouch: 5, fx: -1, fy: -33, sa: -2.5, bx: 2, by: -23, sb: -1.2 }], [-0.02, { ...dBase, lean: 2, crouch: 4, fx: 16, fy: -34, sa: -1, bx: -7, by: -24, sb: -2.4, ghost: 1 }, 'snap'], [0.03, { ...dBase, lean: 6, crouch: 6, fx: 22, fy: -23, sa: 0.15, bx: -9, by: -24, sb: -2.6, ffx: 13, fbx: -10, toeB: true }, 'snap'], [0.28, { ...dBase, lean: 5, crouch: 5, fx: 21, fy: -22, sa: 0.2, bx: -8, by: -24, sb: -2.6 }], [0.6, dBase]];
}

function hammerSmash(): Key[] {
  const REST_ = { ...READY, weapon: 'hammer', two: true, sa: 0.62, fx: 11, fy: -21, crouch: 3 };
  const TOP = { ...REST_, crouch: 0, lean: -3, fx: 3, fy: -41, sa: -2.1, ffx: 8, ffy: -8, fbx: -5, toeB: true };
  const SLAM = { ...REST_, crouch: 7, lean: 6, fx: 14, fy: -19, sa: 0.62, ffx: 11, fbx: -10 };
  return [[-0.44, { ...REST_, crouch: 5, lean: -1, fx: 16, fy: -28, sa: -0.9 }], [-0.2, TOP], [-0.06, { ...REST_, crouch: -1, lean: 2, fx: 13, fy: -41, sa: -1.2, ffx: 11, ffy: -8, ghost: 1 }, 'snap'], [-0.02, { ...REST_, crouch: 3, lean: 5, fx: 19, fy: -30, sa: -0.15, ffx: 13, ghost: 1 }, 'snap'], [0, SLAM, 'snap'], [0.47, { ...SLAM, crouch: 6, lean: 5 }], [0.87, { ...REST_, crouch: 5, lean: 2, fx: 14, fy: -24, sa: 0.3 }], [1.25, REST_]];
}

function hammerSwing(): Key[] {
  const REST_ = { ...READY, weapon: 'hammer', two: true, sa: 0.62, fx: 11, fy: -21, crouch: 3 };
  const BACK = { ...REST_, yaw: 0.9, crouch: 6, lean: -3, fx: 4, fy: -30, sa: -2.6, ffx: 9, fbx: -8 };
  const OUT_ = { ...REST_, crouch: 5, lean: 5, fx: 20, fy: -26, sa: -0.2, ffx: 12, fbx: -10, ghost: 1 };
  return [[-0.3, BACK], [-0.04, { ...BACK, crouch: 7 }], [0, OUT_, 'snap'], [0.06, { ...OUT_, fy: -18, sa: 0.5, ghost: 0 }, 'snap'], [0.4, { ...REST_, crouch: 5 }], [0.8, REST_]];
}

function bowShot(heavy: boolean): Key[] {
  const REST_ = { ...READY, weapon: 'bow', sa: -0.4, fx: 12, fy: -20, bx: 6, by: -17 };
  const AIM = { ...REST_, crouch: 3, lean: 1, fx: 18, fy: -28, sa: 0, bx: 10, by: -27, nocked: true, ffx: 11, fbx: -9 };
  const DRAWN = { ...AIM, crouch: 4, lean: -2, fx: 18, bx: -3, by: -29, pull: true };
  const LOOSED = { ...AIM, crouch: 3, lean: 2, fx: 19, fy: -28, bx: -9, by: -32, nocked: false, pull: false };
  return heavy ? [[-0.05, DRAWN], [0, LOOSED, 'snap'], [0.4, { ...LOOSED, bx: -6, by: -25 }], [0.7, REST_]] : [[-0.14, AIM], [-0.06, DRAWN], [0, LOOSED, 'snap'], [0.4, { ...LOOSED, bx: -6, by: -25 }], [0.7, REST_]];
}

function staffCast(heavy: boolean): Key[] {
  // the staff swung up and thrust out at the target, the free hand flung forward with it
  const REST_ = { ...READY, weapon: 'staff', sa: -1.45, fx: 11, fy: -21, bx: 7, by: -16 };
  const UP = { ...REST_, crouch: 2, lean: -3, fx: 6, fy: -34, sa: -2.2, bx: -4, by: -30 };
  const OUT_ = { ...REST_, crouch: 4, lean: 5, fx: 19, fy: -28, sa: -0.15, bx: 14, by: -30, armsFront: true, ffx: 11, fbx: -9, ghost: 1 };
  return heavy
    ? [[-0.1, { ...UP, fy: -40, sa: -1.6, bx: 4, by: -42 }], [0, OUT_, 'snap'], [0.4, { ...OUT_, ghost: 0 }], [0.75, REST_]]
    : [[-0.1, UP], [0, OUT_, 'snap'], [0.3, { ...OUT_, ghost: 0 }], [0.6, REST_]];
}

function shieldBash(): Key[] {
  const S = hold(WeaponId.Shield);
  return [[-0.08, { ...S, crouch: 5, lean: -3, bx: 2 }], [0, { ...S, crouch: 6, lean: 7, bx: 18, by: -26, ffx: 14, fbx: -11, ghost: 1 }, 'snap'], [0.1, { ...S, crouch: 5, lean: 5, bx: 17, by: -25, ffx: 13, fbx: -10 }], [0.4, S]];
}

function airSlash(w: number): Key[] {
  const H = hold(w);
  const OVER = { ...H, crouch: 0, lean: -3, fx: 2, fy: -40, sa: -2.2, bx: -4, by: -30, ffx: 6, ffy: -9, fbx: -4, fby: -5, two: !!H.two };
  const DOWN = { ...H, crouch: 2, lean: 5, fx: 18, fy: -18, sa: 0.9, bx: -6, by: -26, ffx: 7, ffy: -8, fbx: -5, fby: -4, ghost: 1, two: !!H.two };
  return [[-0.1, OVER], [0, DOWN, 'snap'], [0.25, { ...DOWN, ghost: 0 }]];
}

function plunge(w: number): Key[] {
  const H = hold(w);
  const DOWN = { ...H, turn: 0.8, crouch: 0, fx: 6, fy: -10, sa: 1.5, bx: 4, by: -36, ffx: 3, ffy: -6, fbx: -3, fby: -6, ghost: 1, two: !!H.two };
  const LAND = { ...H, crouch: 8, lean: 5, fx: 15, fy: -6, sa: 1.2, bx: -6, by: -23, ffx: 11, fbx: -10, two: !!H.two };
  return [[-0.12, { ...H, crouch: -1, fx: 4, fy: -42, sa: -1.6, ffx: 6, ffy: -8 }], [0, DOWN, 'snap'], [0.6, DOWN], [0.62, LAND, 'snap'], [0.9, LAND]];
}

/** The track for one weapon move. Cached. */
const TRACKS = new Map<string, Key[]>();
function trackFor(w: number, move: number): Key[] {
  const k = w + ':' + move;
  let t = TRACKS.get(k);
  if (t) return t;
  switch (w) {
    case WeaponId.Sword: t = move === MOVE_AIR ? airSlash(w) : move === MOVE_PLUNGE ? plunge(w) : move === 1 ? swordRising(w) : move === 2 ? spinSlash(w) : swordSlash(w); break;
    case WeaponId.Scythe: t = move === MOVE_AIR ? spinSlash(w, 'scythe') : move === MOVE_PLUNGE ? plunge(w) : move === 2 ? scytheHook() : scytheReap(); break;
    case WeaponId.Staff: t = staffCast(move === MOVE_CHARGED); break;
    case WeaponId.Lance: t = move === MOVE_CHARGED || move === MOVE_ART ? lanceLunge() : move === 2 ? spearSweep() : move === MOVE_AIR ? thrust('spear', true) : thrust('spear', true); break;
    case WeaponId.Daggers: t = move === 3 ? daggerFinish() : move === MOVE_PLUNGE ? plunge(w) : move === MOVE_AIR ? daggerStab(2) : daggerStab(move); break;
    case WeaponId.Hammer: t = move === 2 || move === MOVE_PLUNGE ? hammerSmash() : move === MOVE_AIR ? airSlash(w) : hammerSwing(); break;
    case WeaponId.Bow: t = bowShot(move === MOVE_CHARGED); break;
    case WeaponId.Shield: t = shieldBash(); break;
    default: t = swordSlash(WeaponId.Sword);
  }
  TRACKS.set(k, t);
  return t;
}

/**
 * Seconds into the PixelFX track for the move's tick: the wind-up (keys < 0) is squeezed into the move's startup, the
 * rest stretched over active + recovery. Returns the track time.
 */
function trackTime(track: Key[], startup: number, rest: number, actT: number) {
  const tmin = Math.min(track[0][0], -0.001);
  const tmax = Math.max(track[track.length - 1][0], 0.001);
  const tick = actT - startup;
  if (tick < 0) return (tick / Math.max(1, startup)) * -tmin;
  return Math.min(tmax, (tick / Math.max(1, rest)) * tmax);
}

// ---------------------------------------------------------------- locomotion

function runPose(base: Pose, phase: number, speed: number): Pose {
  const s = Math.sin(phase);
  const c = Math.cos(phase);
  const k = Math.min(1, speed / 200);
  return {
    ...base,
    crouch: 3 + Math.abs(c) * 2 * k,
    lean: 4 * k,
    ffx: 2 + s * 9 * k,
    ffy: -4 - Math.max(0, -c) * 5 * k,
    fbx: 2 - s * 9 * k,
    fby: -4 - Math.max(0, c) * 5 * k,
    bx: (base.bx as number ?? 9) - s * 3 * k,
  };
}

export interface PoseCtx {
  /** Seconds since the fighter started moving (run cycle), and the clock for idle breathing. */
  time: number;
  runPhase: number;
}

/** The PixelFX pose for a fighter this frame. */
export function poseFor(v: ViewFighter, ctx: PoseCtx): Pose {
  const w = v.weapons[v.slot] ?? WeaponId.Sword;
  const base = hold(w);
  const t = v.actTf;
  switch (v.act) {
    case Act.Attack: {
      const m = moveOf(w, v.move);
      if (!m) return base;
      const track = trackFor(w, v.move);
      const rest = m.plunge ? m.active + m.recovery : m.active + m.recovery;
      return poseAt(track, trackTime(track, m.startup, rest, t)) as Pose;
    }
    case Act.Charge: {
      if (w === WeaponId.Bow) {
        const AIM = { ...base, crouch: 4, lean: -2, fx: 18, fy: -28, sa: 0, bx: -3, by: -29, nocked: true, pull: true, ffx: 11, fbx: -9 };
        return t < 6 ? { ...AIM, bx: 10, by: -27, pull: false } : AIM;
      }
      // the lance pulled back, quivering as it charges
      const q = v.charge > 30 ? Math.sin(ctx.time * 60) * 0.6 : 0;
      return { ...base, weapon: 'spear', two: true, crouch: 6, lean: -3, fx: 2 + q, fy: -22, sa: 0, ffx: 10, fbx: -9 };
    }
    case Act.Block:
      return { ...hold(WeaponId.Shield), weapon: w === WeaponId.Shield ? undefined : HOLD[v.weapons[v.slot ^ 1]]?.weapon, crouch: 5, lean: 2, bx: 13, by: -26, sb: 0, ffx: 10, fbx: -8 };
    case Act.Ledge:
      // hanging by both hands from the edge above, legs dangling, a slight sway
      return { ...base, weapon: undefined, offWeapon: undefined, two: false, crouch: -2, lean: 2, hy: -2, fx: 6, fy: -41, bx: 2, by: -41, ffx: 2 + Math.sin(ctx.time * 3), ffy: -1, fbx: -3, fby: -2, toeF: true, toeB: true };
    case Act.Climb: {
      const u = Math.min(1, t / 14);
      return u < 0.5
        ? { ...base, weapon: undefined, offWeapon: undefined, two: false, crouch: 4, lean: 6, fx: 9, fy: -46, bx: 5, by: -46, ffx: 6, ffy: -14, fbx: -2, fby: -6 }
        : { ...base, crouch: 8, lean: 7, fx: 12, fy: -12, bx: 6, by: -12, ffx: 8, fby: -2, fbx: -6 };
    }
    case Act.Roll: {
      if (v.rollAir) {
        // air dash: stretched flat into the dash, legs trailing
        return { ...base, crouch: 2, lean: 9, fx: 17, fy: -27, bx: -10, by: -27, ffx: -6, ffy: -9, fbx: -12, fby: -11, toeF: true, toeB: true, ghost: 1 };
      }
      const u = Math.min(1, t / FIGHTER.rollTicks);
      // tucked and tumbling: the whole sprite is spun by the renderer, the body stays a ball
      return { ...base, crouch: 10, lean: 8, fx: 6, fy: -14, bx: 3, by: -14, ffx: 5, fbx: -3, ffy: -6, fby: -6, ghost: u < 0.7 ? 1 : 0 };
    }
    case Act.Stun:
      return { ...base, crouch: 4, lean: -6, hx: -2, hy: -2, fx: 4, fy: -20, bx: -4, by: -19, ffx: 5, fbx: -8, toeF: true };
    case Act.Heal: {
      const sip = Math.min(1, t / 14);
      return { ...base, crouch: 2, lean: -2, hy: -2 * sip, bx: 4 + sip * 2, by: -24 - sip * 9, ffx: 5, fbx: -6 };
    }
    case Act.Skill: {
      const sk = SKILLS[v.skill];
      const back = t < (sk?.startup ?? 8);
      return back
        ? { ...base, crouch: 5, lean: -4, bx: -9, by: -36, ffx: 9, fbx: -8 }
        : { ...base, crouch: 4, lean: 6, bx: 18, by: -28, ffx: 12, fbx: -10, ghost: 1 };
    }
    case Act.Art: {
      const art = classOf(v.cls).art;
      const sig = hold(classOf(v.cls).signature);
      switch (art) {
        case ArtId.RadiantCleave: {
          // the blade raised high gathering light, then brought down in one stroke
          const up = { ...sig, crouch: 2, lean: -4, fx: 4, fy: -46, sa: -1.6, bx: 2, by: -44, two: true, ffx: 9, fbx: -8 };
          const down = { ...sig, crouch: 7, lean: 7, fx: 22, fy: -18, sa: 0.5, bx: 18, by: -20, two: true, ffx: 14, fbx: -11, toeB: true, ghost: 1 };
          return t < 18 ? up : down;
        }
        case ArtId.HailOfArrows:
          return { ...sig, crouch: 3, lean: -6, fx: 14, fy: -40, sa: -1.1, bx: 2, by: -38, nocked: t < 12, pull: t < 12, ffx: 9, fbx: -8 };
        case ArtId.ThunderCall:
          return { ...sig, crouch: 1, lean: -4, hy: -2, fx: 6, fy: -48, sa: -1.55, bx: -6, by: -40, ffx: 8, fbx: -8 };
        case ArtId.FlashStep: {
          // the flurry: alternating stabs every few frames
          const k = Math.floor(Math.max(0, t - 12) / 3) % 4;
          const stabs = [
            { ...sig, crouch: 5, lean: 6, fx: 22, fy: -32, sa: -0.4, bx: 2, by: -24, sb: -1 },
            { ...sig, crouch: 5, lean: 5, fx: 2, fy: -24, sa: -1, bx: 21, by: -24, sb: 0.4 },
            { ...sig, crouch: 6, lean: 7, fx: 20, fy: -20, sa: 0.3, bx: 2, by: -26, sb: -1.2 },
            { ...sig, crouch: 4, lean: 4, fx: 4, fy: -36, sa: -2, bx: 20, by: -30, sb: -0.6 },
          ];
          return { ...stabs[k], ghost: 1 };
        }
        case ArtId.BloodFrenzy:
          // the roar: arms flung wide, head back
          return { ...sig, crouch: 4, lean: -6, hy: -3, fx: 2, fy: -40, bx: 16, by: -40, ffx: 11, fbx: -10 };
        case ArtId.Bulwark:
          return { ...sig, crouch: 7, lean: 4, bx: 15, by: -28, sb: 0, fx: 8, fy: -24, ffx: 12, fbx: -10 };
        default:
          return sig;
      }
    }
    case Act.KO:
      return { ...base, crouch: 8, lean: -8, hx: -3, hy: -3, fx: 2, fy: -10, bx: -6, by: -12, ffx: 9, fbx: -4 };
    case Act.Win:
      return { ...base, crouch: 0, lean: -2, hy: -2, fx: 9, fy: -42, sa: -1.7, two: false, ffx: 6, fbx: -6 };
    default: {
      if (v.slide) {
        // back to the wall, one hand and one foot dragging on it
        return { ...base, crouch: 3, lean: -3, fx: 10, fy: -26, bx: -10, by: -32, ffx: -7, ffy: -8, fbx: 2, fby: -3 };
      }
      if (v.crouch) return { ...base, crouch: 10, lean: 3, fy: (base.fy as number) + 8, by: (base.by as number) + 8, ffx: 8, fbx: -8 };
      if (!v.ground && v.fast) return { ...base, crouch: -2, lean: 0, fy: -40, by: -40, ffx: 2, ffy: -1, fbx: -2, fby: -1, ghost: 1 };
      if (!v.ground) {
        const rising = v.vy < -60;
        return rising
          ? { ...base, crouch: -1, lean: 2, ffx: 6, ffy: -9, fbx: -4, fby: -4, toeB: true }
          : { ...base, crouch: 0, lean: -1, ffx: 4, ffy: -5, fbx: -3, fby: -8 };
      }
      const speed = Math.abs(v.vx);
      if (speed > 25) return runPose(base, ctx.runPhase, speed);
      const breathe = Math.round(Math.sin(ctx.time * 2.4) * 0.6 + 0.4);
      return { ...base, crouch: (base.crouch as number) + breathe };
    }
  }
}

/** Does this move's track show after-images right now? (The renderer adds ghosts.) */
export const ghosting = (p: Pose) => !!p.ghost;

export const SECONDS_PER_TICK = 1 / TICK_RATE;
void WEAPONS;
