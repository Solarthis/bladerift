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
// @ts-expect-error -
import * as lightningStrike from '../vendor/pixelfx/fx/lightning/lightning-strike.js';
// @ts-expect-error -
import * as chargeUp from '../vendor/pixelfx/fx/lightning/charge-up.js';
// @ts-expect-error -
import * as arcaneOrb from '../vendor/pixelfx/fx/arcane/arcane-orb.js';
// @ts-expect-error -
import * as divineShield from '../vendor/pixelfx/fx/holy/divine-shield.js';
// @ts-expect-error -
import * as rage from '../vendor/pixelfx/fx/status/rage.js';
// @ts-expect-error -
import * as energyDisc from '../vendor/pixelfx/fx/projectiles/energy-disc.js';
// @ts-expect-error -
import * as spellCharge from '../vendor/pixelfx/fx/arcane/spell-charge.js';
// @ts-expect-error -
import * as circleCast from '../vendor/pixelfx/fx/arcane/magic-circle-cast.js';
// @ts-expect-error -
import * as smite from '../vendor/pixelfx/fx/holy/smite.js';

export const FX = {
  swordSlash, doubleSlash, spinSlash, scytheReap, thrust, spearSweep, claw, daggerFlurry, hammerSmash, heavyCleave, hitSpark, critHit, bluntHit,
  parry, shieldBlock, groundSlam, heavyLanding, smallExplosion, iceShatter, iceLance, blinkIn, blinkOut, heal, poof, arrow, fireball, burning,
  slowed, stunned, damageNumber, critNumber, pow, lightningStrike, chargeUp, arcaneOrb, divineShield, rage, energyDisc, spellCharge, circleCast,
  smite,
} as Record<string, FxModule>;

/** Palettes that recolour PixelFX effects for the Arts (dark to bright). */
export const PAL = {
  gold: ['#2a1606', '#5a3410', '#9a6418', '#d8a030', '#f5d060', '#fff0a8', '#ffffff'],
  violet: ['#140a26', '#2e1660', '#5a2aa8', '#8a5ae0', '#c09cff', '#ece0ff', '#ffffff'],
  crimson: ['#1a0408', '#4a0a12', '#8c1420', '#d42a2e', '#ff6a4a', '#ffc0a0', '#ffffff'],
  cyan: ['#04141a', '#0a3a4a', '#147a90', '#2ac0d8', '#7ae8f5', '#d0fbff', '#ffffff'],
};

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
    case WeaponId.Staff:
      return null; // the bolt itself is the effect
    default:
      return null;
  }
}
