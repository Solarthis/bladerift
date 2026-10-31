/**
 * Which PixelFX effect plays for each move, impact and skill, with its palette and playback rate. The effect's time 0
 * is lined up with the move's first hitting tick (PixelFX: "t = 0 is the effect's first frame" = the strike).
 */
import { MOVE_AIR, MOVE_CHARGED, MOVE_PLUNGE, WeaponId } from '@bladerift/shared';
import type { FxModule } from './pixel';
// @ts-expect-error - plain JS vendor modules
import * as swordSlash from '../vendor/pixelfx/fx/melee/sword-slash.js';
// @ts-expect-error -
import * as doubleSlash from '../vendor/pixelfx/fx/melee/double-slash.js';
// @ts-expect-error -
import * as spinSlash from '../vendor/pixelfx/fx/melee/spin-slash.js';
// @ts-expect-error -
import * as scytheReap from '../vendor/pixelfx/fx/melee/scythe-reap.js';
// @ts-expect-error -
import * as thrust from '../vendor/pixelfx/fx/melee/thrust.js';
// @ts-expect-error -
import * as spearSweep from '../vendor/pixelfx/fx/melee/spear-sweep.js';
// @ts-expect-error -
import * as claw from '../vendor/pixelfx/fx/melee/claw-swipe.js';
// @ts-expect-error -
import * as daggerFlurry from '../vendor/pixelfx/fx/melee/dagger-flurry.js';
// @ts-expect-error -
import * as hammerSmash from '../vendor/pixelfx/fx/melee/hammer-smash.js';
// @ts-expect-error -
import * as heavyCleave from '../vendor/pixelfx/fx/melee/heavy-cleave.js';
// @ts-expect-error -
import * as hitSpark from '../vendor/pixelfx/fx/impacts/hit-spark.js';
// @ts-expect-error -
import * as critHit from '../vendor/pixelfx/fx/impacts/crit-hit.js';
// @ts-expect-error -
import * as bluntHit from '../vendor/pixelfx/fx/impacts/blunt-hit.js';
// @ts-expect-error -
import * as parry from '../vendor/pixelfx/fx/impacts/parry.js';
// @ts-expect-error -
import * as shieldBlock from '../vendor/pixelfx/fx/impacts/shield-block.js';
// @ts-expect-error -
import * as groundSlam from '../vendor/pixelfx/fx/impacts/ground-slam.js';
// @ts-expect-error -
import * as heavyLanding from '../vendor/pixelfx/fx/impacts/heavy-landing.js';
// @ts-expect-error -
import * as smallExplosion from '../vendor/pixelfx/fx/explosions/small-explosion.js';
// @ts-expect-error -
import * as iceShatter from '../vendor/pixelfx/fx/ice/ice-shatter.js';
// @ts-expect-error -
import * as iceLance from '../vendor/pixelfx/fx/ice/ice-lance.js';
// @ts-expect-error -
import * as blinkIn from '../vendor/pixelfx/fx/arcane/blink-in.js';
// @ts-expect-error -
import * as blinkOut from '../vendor/pixelfx/fx/arcane/blink-out.js';
// @ts-expect-error -
import * as heal from '../vendor/pixelfx/fx/holy/heal.js';
// @ts-expect-error -
import * as poof from '../vendor/pixelfx/fx/spawn/poof.js';
// @ts-expect-error -
import * as arrow from '../vendor/pixelfx/fx/projectiles/arrow.js';
// @ts-expect-error -
import * as fireball from '../vendor/pixelfx/fx/fire/fireball.js';
// @ts-expect-error -
import * as burning from '../vendor/pixelfx/fx/status/burning.js';
// @ts-expect-error -
import * as slowed from '../vendor/pixelfx/fx/status/slowed.js';
// @ts-expect-error -
import * as stunned from '../vendor/pixelfx/fx/status/stunned.js';
// @ts-expect-error -
import * as damageNumber from '../vendor/pixelfx/fx/ui/damage-number.js';
// @ts-expect-error -
import * as critNumber from '../vendor/pixelfx/fx/ui/crit-number.js';
// @ts-expect-error -
import * as pow from '../vendor/pixelfx/fx/explosions/cartoon-pow.js';

export const FX = {
  swordSlash, doubleSlash, spinSlash, scytheReap, thrust, spearSweep, claw, daggerFlurry, hammerSmash, heavyCleave, hitSpark, critHit, bluntHit,
  parry, shieldBlock, groundSlam, heavyLanding, smallExplosion, iceShatter, iceLance, blinkIn, blinkOut, heal, poof, arrow, fireball, burning,
  slowed, stunned, damageNumber, critNumber, pow,
} as Record<string, FxModule>;

export interface SwingFx {
  mod: FxModule;
  /** Effect seconds per real second. */
  rate: number;
  opts?: Record<string, unknown>;
  /** Hit-stop on contact (s) and screen shake strength 0..1, from the effect's acting data. */
  stop: number;
}

const SCYTHE_DARK = undefined;

/** The swing effect for a move (null = none). */
export function swingFx(weapon: number, move: number): SwingFx | null {
  const s = (mod: FxModule, rate = 1.4, opts?: Record<string, unknown>): SwingFx => ({ mod, rate, opts, stop: mod.act?.hits?.[0]?.stop ?? 0.1 });
  switch (weapon) {
    case WeaponId.Sword:
      if (move === MOVE_PLUNGE) return null;
      if (move === MOVE_AIR || move === 2) return s(FX.spinSlash, 1.5);
      return s(move === 1 ? FX.doubleSlash : FX.swordSlash, 1.5);
    case WeaponId.Scythe:
      if (move === MOVE_PLUNGE) return null;
      return s(FX.scytheReap, move === 2 ? 1.6 : 1.9, SCYTHE_DARK);
    case WeaponId.Lance:
      if (move === MOVE_CHARGED || move === 2) return s(FX.spearSweep, move === MOVE_CHARGED ? 1.2 : 1.6);
      return s(FX.thrust, 1.6);
    case WeaponId.Daggers:
      if (move === MOVE_PLUNGE) return null;
      return move === 3 ? s(FX.daggerFlurry, 1.8) : s(FX.claw, 2);
    case WeaponId.Hammer:
      if (move === 2 || move === MOVE_PLUNGE) return null; // the slam plays ground-slam on impact
      return s(FX.heavyCleave, 1.8);
    default:
      return null;
  }
}
