/**
 * Fighter poses for the PixelFX rig: idle, run, jump, roll, stun, heal, block, charge, skill, KO and every weapon move.
 * The attack tracks are PixelFX's own acted moves (wind-up, a snap to the strike, follow-through, recovery), re-timed
 * onto Bladerift's startup / active / recovery ticks so what you see is exactly when the hit can land.
 */
import { lookMove } from './fxmap';
import { Act, ArtId, FIGHTER, heroOf, heroWeapon, lookWeapon, MOVE_AIR, MOVE_ART, MOVE_CHARGED, MOVE_PLUNGE, moveOf, SKILLS, TICK_RATE, WEAPONS, WeaponId } from '@bladerift/shared';
// @ts-expect-error - plain JS vendor module
import { lerpPose } from '../vendor/pixelfx/core/act.js';

/**
 * Pose on a track of keys [t, pose, how], like PixelFX's poseAt, but limbs step at STEP_FPS instead of 12: smoother
 * motion at the hero rig's double detail, still in held steps (each step is one cached frame). "snap" keys stay instant.
 */
const STEP_FPS = 20;
const EASES: Record<string, (u: number) => number> = { out: (u) => 1 - (1 - u) * (1 - u), in: (u) => u * u, line: (u) => u };
function poseAt(track: Key[], t: number): Pose {
  if (t <= track[0][0]) return track[0][1];
  for (let i = 0; i < track.length - 1; i++) {
    const [t0, a] = track[i];
    const [t1, b, how] = track[i + 1];
    if (t >= t1) continue;
    if (how === 'snap') return a;
    const e = EASES[how ?? ''] ?? ((u: number) => u * u * (3 - 2 * u));
    const stepped = t0 + Math.floor((t - t0) * STEP_FPS + 1e-6) / STEP_FPS;
    return lerpPose(a, b, e((stepped - t0) / (t1 - t0))) as Pose;
  }
  return track[track.length - 1][1];
}
/** Quantise a continuous wobble to n held steps (fewer distinct frames to render and cache). */
const q = (v: number, step: number) => Math.round(v / step) * step;
import type { ViewFighter } from '../net/NetGame';
import type { Pose } from './pixel';

const READY = { crouch: 3, fx: 11, fy: -21, bx: 9, by: -21, ffx: 7, fbx: -7 };

type Key = [number, Pose, string?];

/** What each weapon looks like in the hands (the rig's weapon names). */
const HOLD: Record<number, Pose> = {
  [WeaponId.Sword]: { weapon: 'sword', fx: 12, fy: -21, sa: -0.85 },
  // the idle holds: scythe two-handed angled back over the shoulder, lance couched forward, daggers reverse-gripped low and crouched, hammer on the shoulder
  [WeaponId.Scythe]: { weapon: 'scythe', two: true, sa: -2.0, fx: 9, fy: -30, bx: 6, by: -20 },
  [WeaponId.Lance]: { weapon: 'spear', two: true, sa: 0.05, crouch: 5, lean: 4, fx: 22, fy: -18, bx: 10, by: -20 },
  [WeaponId.Daggers]: { weapon: 'dagger', offWeapon: 'dagger', sa: 0.7, sb: 0.9, crouch: 5, lean: 2, fx: 10, fy: -20, bx: 8, by: -20 },
  [WeaponId.Hammer]: { weapon: 'hammer', two: true, sa: -2.55, fx: 8, fy: -25, bx: 4, by: -22 },
  [WeaponId.Bow]: { weapon: 'bow', sa: -0.4, fx: 12, fy: -20, bx: 6, by: -17 },
  [WeaponId.Shield]: { offWeapon: 'shield', sb: 0, bx: 10, by: -24, fx: 6, fy: -18 },
  [WeaponId.Staff]: { weapon: 'staff', sa: -1.45, fx: 11, fy: -21, bx: 7, by: -16 },
  // the Gate: empty-handed, a king's open palm (the treasures fly from the portals behind him)
  [WeaponId.Gate]: { sa: -0.6, fx: 12, fy: -24, bx: 6, by: -18 },
};

const hold = (w: number): Pose => ({ ...READY, ...(HOLD[w] ?? {}) });

/** A copy of the pose with some numeric offsets added (the anticipation and follow-through on top of a track). */
function nudge(p: Pose, d: Record<string, number>): Pose {
  const o: Pose = { ...p };
  for (const k of Object.keys(d)) o[k] = ((o[k] as number | undefined) ?? 0) + d[k];
  return o;
}

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
  // the blade swings round the front at waist height: back and up, through the box, low and forward (the body barely turns)
  const REST_ = { ...READY, weapon: 'scythe', sa: -1.5, fx: 11, fy: -22, bx: 7, by: -16 };
  const BACK = { ...REST_, two: true, crouch: 4, lean: -3, fx: -4, fy: -30, sa: -2.5, ffx: 9, fbx: -8 };
  const CUT = { ...REST_, two: true, crouch: 3, lean: 2, fx: 15, fy: -26, sa: -0.5, ffx: 10, fbx: -9, ghost: 1 };
  const LOW = { ...REST_, two: true, crouch: 6, lean: 5, fx: 18, fy: -18, sa: 0.5, ffx: 12, fbx: -10, toeB: true, ghost: 1 };
  return [[-0.26, BACK], [-0.06, { ...BACK, fx: -6, fy: -34, sa: -2.2 }], [0, { ...REST_, two: true, crouch: 3, lean: -3, fx: 4, fy: -40, sa: -1.6, ffx: 9, fbx: -8 }, 'snap'], [0.12, CUT, 'snap'], [0.22, { ...CUT, fx: 18, fy: -24, sa: -0.2, lean: 3 }], [0.34, LOW, 'snap'], [0.5, { ...LOW, crouch: 6, fx: 16, fy: -18, sa: 0.7, ghost: 0 }], [0.9, { ...REST_, two: true, crouch: 5, lean: 4, fx: 14, fy: -16, sa: 0.9, ffx: 11, fbx: -9 }], [1.25, { ...REST_, two: true, crouch: 4, lean: 2 }], [1.56, REST_]];
}

function scytheRise(): Key[] {
  // the second reap comes back up from low, sweeping the blade across the front
  const REST_ = { ...READY, weapon: 'scythe', sa: -1.5, fx: 11, fy: -22, bx: 7, by: -16 };
  const LOW = { ...REST_, two: true, crouch: 6, lean: 4, fx: 18, fy: -14, sa: 0.9, ffx: 12, fbx: -10, toeB: true };
  return [[-0.26, LOW], [-0.06, { ...LOW, fx: 16, sa: 0.7 }], [0, { ...LOW, crouch: 5, fx: 14, fy: -18, sa: 0.3 }, 'snap'], [0.12, { ...LOW, crouch: 4, lean: 2, fx: 16, fy: -24, sa: -0.2, ghost: 1 }, 'snap'], [0.24, { ...LOW, crouch: 3, lean: -1, fx: 14, fy: -30, sa: -0.8, ghost: 1 }], [0.4, { ...LOW, crouch: 2, lean: -3, fx: 10, fy: -36, sa: -1.4 }], [0.8, { ...REST_, two: true, crouch: 4, lean: 0, fx: 12, fy: -28, sa: -1.1 }], [1.56, REST_]];
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
function trackFor(wIn: number, mIn: number): Key[] {
  const move = lookMove(wIn, mIn);
  // (a hero's own weapon without rig poses of its own moves like the weapon it is based on)
  const w = lookWeapon(wIn);
  const k = w + ':' + move;
  let t = TRACKS.get(k);
  if (t) return t;
  switch (w) {
    case WeaponId.Sword: t = move === MOVE_AIR ? airSlash(w) : move === MOVE_PLUNGE ? plunge(w) : move === 1 ? swordRising(w) : move === 2 ? spinSlash(w) : swordSlash(w); break;
    case WeaponId.Scythe: t = move === MOVE_AIR ? spinSlash(w, 'scythe') : move === MOVE_PLUNGE ? plunge(w) : move === 2 ? scytheHook() : move === 1 ? scytheRise() : scytheReap(); break;
    case WeaponId.Staff: t = staffCast(move === MOVE_CHARGED); break;
    case WeaponId.Lance: t = move === MOVE_CHARGED || move === MOVE_ART ? lanceLunge() : move === 2 ? spearSweep() : move === MOVE_AIR ? thrust('spear', true) : thrust('spear', true); break;
    case WeaponId.Daggers: t = move === 3 ? daggerFinish() : move === MOVE_PLUNGE ? plunge(w) : move === MOVE_AIR ? daggerStab(2) : daggerStab(move); break;
    case WeaponId.Hammer: t = move === 2 || move === MOVE_PLUNGE ? hammerSmash() : move === MOVE_AIR ? airSlash(w) : hammerSwing(); break;
    case WeaponId.Bow: t = bowShot(move === MOVE_CHARGED); break;
    case WeaponId.Shield: t = shieldBash(); break;
    // the Gate: the staff's commanding gesture with nothing in the hand
    case WeaponId.Gate: t = staffCast(move === MOVE_CHARGED).map(([k, p, e]): Key => [k, { ...p, weapon: undefined }, e]); break;
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

/** The run cycle: the weight dips at each footfall, the legs stride and the lifted foot clears the ground, the arms swing against the legs. */
function runPose(base: Pose, phase: number, speed: number): Pose {
  // 16 held frames per stride (a classic sprite cycle: every frame renders once, then comes from the cache)
  const ph = q(phase, (Math.PI * 2) / 16);
  const s = Math.sin(ph);
  const c = Math.cos(ph);
  const k = q(Math.min(1, speed / 200), 0.25);
  const bx = base.bx as number;
  const fx = base.fx as number;
  return {
    ...base,
    crouch: (base.crouch as number) + 2.5 * k * s * s,
    lean: 5 * k,
    ffx: 2 + s * 10 * k,
    ffy: -4 - Math.max(0, c) * 6 * k,
    fbx: 2 - s * 10 * k,
    fby: -4 - Math.max(0, -c) * 6 * k,
    fx: fx - s * 3 * k,
    bx: bx + s * 3 * k,
    // the toe lifts at each push-off: the front foot on its reach, the back foot as it leaves the ground
    toeF: k > 0 && s > 0.5,
    toeB: k > 0 && s < -0.5,
  };
}

/**
 * Airborne: the body blends from the rise, through the apex, to the fall as the vertical speed goes from -300 to +300.
 * The vy is quantised to seven held levels (AIR_VY), so each jump phase flows into the next without a continuous pose.
 */
export const AIR_VY = [-300, -200, -100, 0, 100, 200, 300];
function airPose(base: Pose, vy: number): Pose {
  const level = Math.max(0, Math.min(6, Math.round((vy + 300) / 100)));
  const u = level / 6;
  const RISE = { ...base, crouch: -1, lean: 3, fx: 8, fy: -34, bx: 10, by: -34, ffx: 6, ffy: -10, fbx: -4, fby: -6, toeB: true };
  const APEX = { ...base, crouch: 2, lean: 1, fx: 12, fy: -28, bx: 6, by: -28, ffx: 7, ffy: -9, fbx: -3, fby: -8, toeF: true, toeB: true };
  const FALL = { ...base, crouch: 1, lean: -2, ffx: 9, ffy: -3, fbx: -5, fby: -2 };
  return (u < 0.5 ? lerpPose(RISE, APEX, u * 2) : lerpPose(APEX, FALL, (u - 0.5) * 2)) as Pose;
}

// ---------------------------------------------------------------- Rift Arts (the hero's art, on the class's weapon)

const ART_TRACKS = new Map<number, Key[]>();

/** One art's timeline in art ticks: the snap is the tick the art's effect spawns (world.ts stepArts). */
function artKeys(art: number, sig: number): Key[] {
  const H = hold(sig);
  switch (art) {
    case ArtId.RadiantCleave: {
      // the blade raised two-handed over him, gathering the sun; the cleave comes down at tick 18, the wave's spawn
      const UP = { ...H, two: true, crouch: 2, lean: -4, fx: 4, fy: -46, sa: -1.6, bx: 2, by: -44, ffx: 9, fbx: -8 };
      const GATHER = { ...UP, crouch: 1, lean: -6, fy: -48 };
      const DOWN = { ...H, two: true, crouch: 7, lean: 7, fx: 22, fy: -17, sa: 0.5, ffx: 14, fbx: -11, toeB: true, ghost: 1 };
      return [[0, H], [6, UP], [12, GATHER], [17, { ...GATHER, fy: -50 }], [18, DOWN, 'snap'], [24, { ...DOWN, crouch: 8, lean: 8, fx: 24, fy: -14, sa: 0.9, ghost: 0 }], [32, { ...H, two: true, crouch: 5, lean: 4, fx: 20, fy: -22, sa: 0.3, ffx: 12, fbx: -9 }], [40, H]];
    }
    case ArtId.HailOfArrows: {
      // the bow raised at the sky, drawn back, loosed straight up at tick 12 (the volley's spawn)
      const AIM = { ...H, crouch: 3, lean: -3, fx: 10, fy: -36, sa: 0, bx: 8, by: -34, nocked: true, ffx: 9, fbx: -8 };
      const DRAW = { ...AIM, crouch: 2, lean: -5, bx: -2, by: -36, pull: true };
      const LOOSE = { ...AIM, crouch: 1, lean: -6, fx: 12, fy: -40, bx: -6, by: -38, nocked: false, pull: false };
      return [[0, H], [5, AIM], [10, DRAW], [12, LOOSE, 'snap'], [18, { ...LOOSE, fx: 10, fy: -36, bx: -4, by: -34, lean: -4 }], [30, H]];
    }
    case ArtId.ThunderCall: {
      // the staff raised high, the far hand up to the sky, then the arm flung at the foe at tick 10; the stars fall for the rest of the art
      const UP = { ...H, crouch: 2, lean: -3, fx: 6, fy: -40, sa: -2.0, bx: -6, by: -46 };
      const POINT = { ...H, crouch: 3, lean: 5, fx: 24, fy: -30, sa: -0.2, bx: -2, by: -46, ffx: 12, fbx: -9 };
      return [[0, H], [7, UP], [10, POINT, 'snap'], [16, { ...POINT, fy: -32, lean: 6 }], [26, { ...POINT, crouch: 4 }], [32, { ...H, crouch: 2, fx: 14, fy: -30, sa: -0.9, bx: 4, by: -30 }], [36, H]];
    }
    case ArtId.ChainsOfGenesis: {
      // the lance planted upright, the far hand raised over the field, then driven down at the foe at tick 8; the grip tightens as the chains bind
      const PLANT = { ...H, weapon: 'spear', two: false, sa: -1.5, fx: 9, fy: -22, crouch: 2, bx: -2, by: -46 };
      const DRIVE = { ...PLANT, crouch: 4, lean: 4, bx: 24, by: -16, ffx: 11, fbx: -9 };
      return [[0, H], [6, PLANT], [8, DRIVE, 'snap'], [18, { ...DRIVE, bx: 18, by: -18 }], [26, { ...DRIVE, crouch: 3, bx: 10, by: -20 }], [30, { ...DRIVE, bx: 14, by: -18 }], [36, H]];
    }
    case ArtId.VaultOfAges: {
      // arms spread: the near hand forward and up, the far hand flung back towards the portals; the relics leave in turn as the hands flick
      const A = { ...H, crouch: 2, lean: -3, fx: 20, fy: -34, sa: 0.1, bx: -14, by: -34, hy: -1, ffx: 9, fbx: -8 };
      const B = { ...A, fx: 23, fy: -30, bx: -18, by: -30 };
      const keys: Key[] = [[0, H], [7, A]];
      for (let k = 0; k < 11; k++) keys.push([10 + 3 * k, k % 2 ? B : A, 'snap']);
      keys.push([42, A], [50, H]);
      return keys;
    }
    case ArtId.PhantomHand: {
      // the claw drawn back low by the hip, then thrust out along the ground at tick 12 (the hand's spawn)
      const CLAW = { ...READY, weapon: 'claw', sa: 0.05, fx: -6, fy: -10, bx: 6, by: -22, crouch: 5, lean: -2, ffx: 4, fbx: -6 };
      const COIL = { ...CLAW, fx: -10, fy: -8, crouch: 6 };
      const THRUST = { ...CLAW, crouch: 7, lean: 7, fx: 30, fy: -6, sa: 0, bx: -8, by: -26, ffx: 15, fbx: -11, toeB: true, ghost: 1 };
      return [[0, { ...READY, weapon: 'claw', sa: 0.05 }], [8, CLAW], [11, COIL], [12, THRUST, 'snap'], [16, { ...THRUST, fx: 26, ghost: 0 }], [26, { ...THRUST, fx: 28 }], [36, { ...CLAW, crouch: 4 }], [40, { ...READY, weapon: 'claw', sa: 0.05 }]];
    }
    case ArtId.Stampede: {
      // rearing with the scythe over the head, then the rider drives forward with it levelled like a lance at tick 14 (the steed's spawn)
      const RAISE = { ...H, two: true, crouch: 3, lean: -6, fx: 4, fy: -40, sa: -2.3, bx: -2, by: -40 };
      const CHARGE = { ...H, two: true, crouch: 6, lean: 8, fx: 27, fy: -26, sa: 0, bx: 20, by: -26, ffx: 14, fbx: -10, toeB: true };
      return [[0, H], [8, RAISE], [14, CHARGE, 'snap'], [20, { ...CHARGE, crouch: 5, lean: 7, ffx: 12 }], [26, { ...CHARGE, crouch: 7, lean: 8, fx: 28 }], [32, { ...CHARGE, crouch: 5 }], [36, H]];
    }
    case ArtId.BloodFrenzy: {
      // the hammer overhead, then the roar at tick 12 (the knockback): arms flung wide, head back, the hammer let go
      const RAISE = { ...H, two: true, crouch: 3, lean: -4, fx: 4, fy: -44, sa: -2.2 };
      const ROAR = { crouch: 4, lean: -7, hy: -4, fx: -12, fy: -40, bx: 22, by: -40, ffx: 10, fbx: -10, weapon: undefined, offWeapon: undefined, two: false };
      return [[0, H], [6, RAISE], [11, { ...RAISE, lean: -6 }], [12, ROAR, 'snap'], [16, { ...ROAR, fx: -14, fy: -44 }], [20, { ...ROAR, fx: -8, fy: -36, bx: 16 }], [24, H]];
    }
    case ArtId.Bulwark: {
      // the tower shield braced out in front for the whole barrier
      const SH = hold(WeaponId.Shield);
      const WALL = { ...SH, crouch: 7, lean: 5, fx: 20, fy: -26, bx: 22, by: -22, sb: 0, ffx: 13, fbx: -10 };
      return [[0, SH], [8, WALL], [16, { ...WALL, crouch: 6, lean: 6, fx: 21, fy: -27 }], [110, WALL], [120, SH]];
    }
    case ArtId.FlashStep: {
      // crouched and vanishing (ghosted), the blink at tick 8, then six cuts from 14 to 44, the last one a finisher
      const keys: Key[] = [[0, { ...dBase, crouch: 6, lean: -2, ghost: 1 }], [7, { ...dBase, crouch: 8, lean: -4, fx: -2, fy: -18, sa: -1.4, bx: -4, by: -18, ghost: 1 }], [8, { ...dBase, crouch: 4, fx: 2, fy: -26, ghost: 1 }, 'snap'], [12, { ...dBase, crouch: 4, ghost: 0 }]];
      for (let k = 0; k < 6; k++) {
        const t = 14 + k * 6;
        const cut = k === 5 ? { ...dBase, lean: 6, crouch: 6, fx: 22, fy: -23, sa: 0.15, bx: -9, by: -24, sb: -2.6, ffx: 13, fbx: -10, toeB: true } : k % 2 === 0 ? near(20, -30, -0.5, { ghost: 1 }) : far(21, -23, 0.5, { ghost: 1 });
        keys.push([t, cut, 'snap'], [t + 3, { ...cut, ghost: 0 }]);
      }
      keys.push([48, { ...dBase, lean: 4, crouch: 4, ghost: 1 }], [54, dBase]);
      return keys;
    }
    case ArtId.RewrittenFate: {
      // the book held flat in the far hand, the staff's tip writing the chapter in the air; the strokes quicken as the rewrite takes hold
      const Q = { ...H, fx: 12, fy: -30, bx: 14, by: -22, bz: 6, crouch: 3, lean: 2, ffx: 7, fbx: -6 };
      const WA = { ...Q, fx: 18, fy: -36, sa: -0.9 };
      const WB = { ...Q, fx: 23, fy: -30, sa: -0.3 };
      return [[0, H], [6, Q], [9, WA, 'snap'], [12, WB, 'snap'], [15, WA, 'snap'], [18, WB, 'snap'], [21, WA, 'snap'], [24, WB, 'snap'], [27, Q], [30, H]];
    }
    case ArtId.GrimFog: {
      // the hat tipped, the gentleman turns away, the coat swept out, and the fog takes him (ghosted, then gone)
      const POISE = { ...READY, weapon: undefined, offWeapon: undefined, two: false, crouch: 3, lean: -1 };
      const TIP = { ...POISE, fx: 2, fy: -38, bx: 8, by: -22, hy: 1 };
      const TURN = { ...POISE, yaw: 1.1, fx: 6, fy: -28, bx: 8, by: -24, lean: 0 };
      const SWEEP = { ...TURN, fx: -10, fy: -26, bx: -14, by: -24, lean: -4 };
      const SWEEP2 = { ...SWEEP, bx: -18, by: -20, lean: -6 };
      return [[0, POISE], [4, TIP], [8, TURN], [11, SWEEP, 'snap'], [15, SWEEP2], [18, { ...SWEEP2, ghost: 1 }], [20, { ...POISE, ghost: 1 }]];
    }
    case ArtId.NightHunt: {
      // the crouch (ticks 0-5); the leap and the fall are chosen by the fighter's state (artPose); the slam follows the landing
      const S = hold(sig);
      const CROUCH = { ...S, two: true, crouch: 9, lean: 3, fx: 0, fy: -18, sa: -0.8, bx: -6, by: -16, ffx: 12, fbx: -10 };
      return [[0, S], [4, CROUCH], [6, CROUCH]];
    }
    default:
      return [[0, H]];
  }
}

/** The Art pose at its tick. NightHunt leaves the ground: rising on the leap, falling, then the slam on landing. */
function artPose(v: ViewFighter, t: number): Pose {
  const h = heroOf(v.hero);
  const sig = heroWeapon(h.id);
  if (h.art === ArtId.NightHunt) {
    const S = hold(sig);
    if (!v.ground && t >= 6) {
      // rising on the leap, or falling onto the target with the scythe overhead
      return v.vy < 0
        ? { ...S, two: true, crouch: -2, lean: 9, fx: 20, fy: -48, sa: -1.0, ffx: -6, ffy: -10, fbx: -10, fby: -12 }
        : { ...S, two: true, crouch: -1, lean: -3, fx: 6, fy: -52, sa: -1.9, ffx: 10, ffy: -18, fbx: 4, fby: -12, toeB: true };
    }
    if (t >= 36) {
      // the slam: the scythe comes down and the body follows it, then rises out of the ground
      const SLAM = { ...S, two: true, crouch: 8, lean: 8, fx: 24, fy: -12, sa: 1.0, ffx: 14, fbx: -12, toeB: true };
      return poseAt([[36, SLAM], [40, { ...SLAM, crouch: 6, lean: 6 }], [46, { ...S, two: true, crouch: 4, lean: 2, fx: 14, fy: -24, sa: 0.4 }], [50, S]], t) as Pose;
    }
  }
  let track = ART_TRACKS.get(h.art * 16 + sig);
  if (!track) ART_TRACKS.set(h.art * 16 + sig, (track = artKeys(h.art, sig)));
  return poseAt(track, t) as Pose;
}

export interface PoseCtx {
  /** Seconds since the start, the clock for breathing, stun wobble and flicker. */
  time: number;
  /** The run cycle's phase (radians). */
  runPhase: number;
  /** Seconds since the fighter last landed (a short squash on touchdown), if known. */
  land?: number;
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
      const rest = m.active + m.recovery;
      const p = poseAt(track, trackTime(track, m.startup, rest, t)) as Pose;
      // anticipation: the body loads back over the last two startup ticks; follow-through: it overshoots the swing for three ticks after the active frames, then settles
      const pre = m.startup - t;
      const post = t - (m.startup + m.active);
      if (pre >= 1 && pre <= 2) return nudge(p, { lean: -2, crouch: 1 });
      if (post >= 0 && post < 3) return nudge(p, { lean: 3 - post });
      return p;
    }
    case Act.Charge: {
      if (w === WeaponId.Bow) {
        const AIM = { ...base, crouch: 4, lean: -2, fx: 18, fy: -28, sa: 0, bx: -3, by: -29, nocked: true, pull: true, ffx: 11, fbx: -9 };
        return t < 6 ? { ...AIM, bx: 10, by: -27, pull: false } : AIM;
      }
      if (w === WeaponId.Staff || w === WeaponId.Gate) {
        // the staff hauled up over the shoulder, the orb gathering at its head and flickering as it charges
        const qv = v.charge > 30 ? q(Math.sin(ctx.time * 40) * 0.8, 0.4) : 0;
        return { ...base, weapon: w === WeaponId.Gate ? undefined : base.weapon, crouch: 4, lean: -2, fx: 6, fy: -36 + qv, sa: -2.0, bx: -4, by: -34, ffx: 10, fbx: -9 };
      }
      // the lance pulled back, quivering as it charges
      const qv = v.charge > 30 ? q(Math.sin(ctx.time * 60) * 0.6, 0.3) : 0;
      return { ...base, weapon: 'spear', two: true, crouch: 6, lean: -3, fx: 2 + qv, fy: -22, sa: 0, ffx: 10, fbx: -9 };
    }
    case Act.Block:
      return { ...hold(WeaponId.Shield), weapon: w === WeaponId.Shield ? undefined : HOLD[v.weapons[v.slot ^ 1]]?.weapon, crouch: 5, lean: 2, bx: 13, by: -26, sb: 0, ffx: 10, fbx: -8 };
    case Act.Ledge:
      // hanging by both hands from the edge above, legs dangling, a slight sway
      return { ...base, weapon: undefined, offWeapon: undefined, two: false, crouch: -2, lean: 2, hy: -2, fx: 6, fy: -44, bx: 4, by: -44, ffx: 2 + q(Math.sin(ctx.time * 3), 0.5), ffy: -1, fbx: -3, fby: -2, toeF: true, toeB: true };
    case Act.Climb: {
      // pull up on the edge (the arms bend, the knee comes up), push up onto it, then stand
      return poseAt([
        [0, { ...base, weapon: undefined, offWeapon: undefined, two: false, crouch: -1, lean: 2, fx: 6, fy: -44, bx: 4, by: -44, ffx: 2, ffy: -4, fbx: -3, fby: -4 }],
        [5, { ...base, weapon: undefined, offWeapon: undefined, two: false, crouch: 6, lean: 8, fx: 12, fy: -32, bx: 8, by: -36, ffx: 8, ffy: -12, fbx: -2, fby: -4 }],
        [9, { ...base, weapon: undefined, offWeapon: undefined, two: false, crouch: 8, lean: 8, fx: 20, fy: -18, bx: 14, by: -18, ffx: 12, ffy: -4, fbx: -4, fby: -3 }],
        [14, base],
      ], t) as Pose;
    }
    case Act.Roll: {
      if (v.rollAir) {
        // air dash: the body flat and streamlined, the arms swept forward, the legs trailing
        return { ...base, crouch: -2, lean: 12, fx: 22, fy: -28, bx: 18, by: -26, ffx: -12, ffy: -6, fbx: -14, fby: -10, toeF: true, toeB: true, ghost: 1 };
      }
      const u = Math.min(1, t / FIGHTER.rollTicks);
      // three stages: the dive stretched out with the arms forward and after-images trailing, then the tuck (the knees drawn up, the arms wrapped round them, the sprite turning over it), then the uncurl
      if (u < 0.25) return { ...base, crouch: 6, lean: 12, fx: 16, fy: -18, bx: 14, by: -22, ffx: 10, ffy: -4, fbx: 0, fby: -6, ghost: 1 };
      if (u < 0.6) return { ...base, crouch: 12, lean: 10, fx: 4, fy: -10, bx: 2, by: -10, ffx: 4, ffy: -6, fbx: -2, fby: -6, ghost: 1 };
      return { ...base, crouch: 9, lean: 6, fx: 10, fy: -14, bx: 6, by: -14, ffx: 8, ffy: -6, fbx: -4, fby: -6 };
    }
    case Act.Stun: {
      // the hit: the head snaps back and the torso bends; over the stun (30 ticks) both recover in four held steps, the arms flailing as they go
      const kk = Math.round((1 - Math.min(1, t / 30)) * 3);
      const wob = q(Math.sin(ctx.time * 22), 0.5) * (kk / 3);
      return { ...base, crouch: 4 + Math.min(2, kk), lean: -2 - 2 * kk, hx: -Math.min(2, kk), hy: -Math.min(2, kk), fx: 4 + wob * 4, fy: -24 + wob * 4, bx: -4 - wob * 3, by: -22 - wob * 3, ffx: 5, fbx: -8, toeF: true };
    }
    case Act.Heal: {
      // the sip: four held steps as the flask rises to the mouth
      const sip = Math.round(Math.min(1, t / 14) * 4) / 4;
      return { ...base, crouch: 2, lean: -2, hy: -2 * sip, bx: 4 + sip * 2, by: -24 - sip * 9, ffx: 5, fbx: -6 };
    }
    case Act.Skill: {
      const sk = SKILLS[v.skill];
      const back = t < (sk?.startup ?? 8);
      return back
        ? { ...base, crouch: 5, lean: -4, bx: -9, by: -36, ffx: 9, fbx: -8 }
        : { ...base, crouch: 4, lean: 6, bx: 18, by: -28, ffx: 12, fbx: -10, ghost: 1 };
    }
    case Act.Art:
      return artPose(v, t);
    case Act.KO: {
      // the fall: the body topples back over five held steps (the sprite turns over the fall), the head going first
      const s = Math.round(Math.min(1, t / 20) * 4);
      return { ...base, crouch: 2 + s, lean: -2 - 2 * s, hx: -Math.min(3, s), hy: -Math.min(3, s), fx: 2, fy: -10, bx: -6 - s, by: -12, ffx: 9, fbx: -4 };
    }
    case Act.Win:
      return { ...base, crouch: 0, lean: -2, hy: -2, fx: 9, fy: -42, sa: -1.7, two: false, ffx: 6, fbx: -6 };
    default: {
      if (v.slide) {
        // against the wall: hands pressed on it in front, one foot braced on it, sliding down; the grip shifts on alternate beats
        const beat = Math.floor(ctx.time * 5) & 1;
        return { ...base, crouch: 2, lean: 8, fx: 24, fy: -30, bx: 18, by: -26, ffx: 12, ffy: beat ? -8 : -4, fbx: 4, fby: beat ? -4 : -9 };
      }
      if (v.crouch) return { ...base, crouch: 9, lean: 6, fx: 18, fy: -12, sa: 0.6, bx: 10, by: -14, ffx: 10, fbx: -9 };
      if (!v.ground && v.fast) {
        // the fast fall: head down, the arms reaching for the ground, the legs tucked up behind
        return { ...base, crouch: -4, lean: 12, fx: 22, fy: -8, bx: 14, by: -12, ffx: -8, ffy: -14, fbx: -12, fby: -18, ghost: 1 };
      }
      if (!v.ground) return airPose(base, v.vy);
      // touchdown: a squash on the first 0.2 s that springs back over four held steps
      if (ctx.land !== undefined && ctx.land < 0.2) {
        const k = 3 - Math.floor(Math.max(0, ctx.land) / 0.05);
        return { ...base, crouch: (base.crouch as number) + 2 * k, lean: 1 + k, ffx: 9 + k, fbx: -9 - k };
      }
      const speed = Math.abs(v.vx);
      // turning round at speed: a skid, leaning back against the slide
      if (speed > 90 && Math.sign(v.vx) !== Math.sign(v.face)) return { ...base, crouch: 5, lean: -9, ffx: 14, ffy: -3, fbx: -3, fx: (base.fx as number) - 5, bx: (base.bx as number) + 5 };
      if (speed > 25) return runPose(base, ctx.runPhase, speed);
      // idle breathing: three held levels over the ~2.6 s breath
      const breath = Math.round(Math.sin(ctx.time * 2.4) + 1);
      return { ...base, crouch: (base.crouch as number) + breath - 1 };
    }
  }
}

/** Does this move's track show after-images right now? (The renderer adds ghosts.) */
export const ghosting = (p: Pose) => !!p.ghost;

export const SECONDS_PER_TICK = 1 / TICK_RATE;
void WEAPONS;
