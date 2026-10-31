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
// @ts-expect-error -
import * as portal from '../vendor/pixelfx/fx/arcane/portal.js';
// @ts-expect-error -
import * as starFall from '../vendor/pixelfx/fx/arcane/star-fall.js';
// @ts-expect-error -
import * as graspingHands from '../vendor/pixelfx/fx/shadow/grasping-hands.js';
// @ts-expect-error -
import * as shadowTendrils from '../vendor/pixelfx/fx/shadow/shadow-tendrils.js';
// @ts-expect-error -
import * as darkExplosion from '../vendor/pixelfx/fx/shadow/dark-explosion.js';
// @ts-expect-error -
import * as flamethrower from '../vendor/pixelfx/fx/fire/flamethrower.js';
// @ts-expect-error -
import * as fireRing from '../vendor/pixelfx/fx/fire/fire-ring.js';
// @ts-expect-error -
import * as blessing from '../vendor/pixelfx/fx/holy/blessing.js';
// @ts-expect-error -
import * as sunburst from '../vendor/pixelfx/fx/holy/sunburst.js';
// @ts-expect-error -
import * as earthSpike from '../vendor/pixelfx/fx/nature/earth-spike.js';
// @ts-expect-error -
import * as forceField from '../vendor/pixelfx/fx/scifi/force-field.js';
// @ts-expect-error -
import * as runeCircle from '../vendor/pixelfx/fx/arcane/rune-circle.js';
// @ts-expect-error -
import * as splash from '../vendor/pixelfx/fx/water/splash.js';

export const FX = {
  swordSlash, doubleSlash, spinSlash, scytheReap, thrust, spearSweep, claw, daggerFlurry, hammerSmash, heavyCleave, hitSpark, critHit, bluntHit,
  parry, shieldBlock, groundSlam, heavyLanding, smallExplosion, iceShatter, iceLance, blinkIn, blinkOut, heal, poof, arrow, fireball, burning,
  slowed, stunned, damageNumber, critNumber, pow, lightningStrike, chargeUp, arcaneOrb, divineShield, rage, energyDisc, spellCharge, circleCast,
  smite, portal, starFall, graspingHands, shadowTendrils, darkExplosion, flamethrower, fireRing, blessing, sunburst, earthSpike, forceField,
  runeCircle, splash,
} as Record<string, FxModule>;

/** Palettes that recolour PixelFX effects for the Arts (dark to bright). */
export const PAL = {
  gold: ['#2a1606', '#5a3410', '#9a6418', '#d8a030', '#f5d060', '#fff0a8', '#ffffff'],
  violet: ['#140a26', '#2e1660', '#5a2aa8', '#8a5ae0', '#c09cff', '#ece0ff', '#ffffff'],
  crimson: ['#1a0408', '#4a0a12', '#8c1420', '#d42a2e', '#ff6a4a', '#ffc0a0', '#ffffff'],
  cyan: ['#04141a', '#0a3a4a', '#147a90', '#2ac0d8', '#7ae8f5', '#d0fbff', '#ffffff'],
  /** Shadow hound, phantom hand, the Abyss: black-violet with a bright violet rim. */
  abyss: ['#07040e', '#130a22', '#241242', '#3d1e6e', '#5e32a8', '#8a5ae0', '#c09cff', '#ece0ff'],
  /** Serpent Rain: venom green. */
  serpent: ['#0d1a0c', '#173a14', '#265e18', '#3f8a1e', '#6cb82a', '#a8e04a', '#e0ff8a'],
  /** Rewritten Fate: ink and old gold. */
  ink: ['#080604', '#15110c', '#2a2016', '#4a3a26', '#7a6038', '#b8924a', '#e8c878', '#fff6d8'],
  goldGlow: ['#4a2a08', '#8a5414', '#c8902a', '#f0c050', '#fff0a0'],
  smoke: ['#0e0c12', '#1d1a22', '#2e2a35', '#433e4b', '#5c5664', '#7b7484', '#a39cab'],
  dust: ['#1c1610', '#33281c', '#4f3f2c', '#6e5a40', '#927a58', '#b89f78', '#dcc8a2'],
  fire: ['#1f0b10', '#4a1118', '#8c1d1c', '#cc3a1a', '#f2701f', '#ffae35', '#ffe27a', '#fff8d6'],
  /** Shadow Dirk's streak and the Flash Step: dark glass with a mint glow. */
  mint: ['#04140e', '#0c3a2a', '#1f7a5a', '#4fd6a8', '#7affd0', '#d8fff0', '#ffffff'],
  /** Shield Rebound and Shield Slide: teal steel. */
  teal: ['#031416', '#0a3a40', '#1d6a72', '#2a8a90', '#7ae8f5', '#d0fbff', '#ffffff'],
  /** Scalpel Rain: silver steel. */
  silver: ['#101216', '#2a2e36', '#4d5560', '#8a94a2', '#c4ccd8', '#eef3fa', '#ffffff'],
  /** Scalpel Rain's bleed and the Blood Frenzy-like wounds. */
  blood: ['#1a0206', '#3a0410', '#6e0c1a', '#a8122a', '#d42a3a', '#ff6a70'],
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

/**
 * Each hero's energy colours (from the character bibles, art/characters/<id>/character.json): `arc` is the swing arc's
 * body, `rim` its outer glow, `spark` the hit spark's hot rays. All are drawn with additive blending, so a white core
 * on top of them reads as white-hot.
 */
export interface HeroEnergy {
  arc: number;
  rim: number;
  spark: number;
}
export const HERO_ENERGY: HeroEnergy[] = [
  { arc: 0x8ccaff, rim: 0x2a6aff, spark: 0xffd84a }, // 0 Richard: blue-white arcs, gold sparks
  { arc: 0xffa040, rim: 0xc8401a, spark: 0xff6a2a }, // 1 Alcides: ember amber, orange-red sparks
  { arc: 0xffd060, rim: 0xd88a10, spark: 0xfff0a0 }, // 2 Gilgamesh: molten gold, white-hot core
  { arc: 0x5af0e0, rim: 0x108a9a, spark: 0xd0fbff }, // 3 Cu Chulainn: cyan-teal, pale motes
  { arc: 0xffd84a, rim: 0x2aa86a, spark: 0x9affc0 }, // 4 Enkidu: gold with jade glints
  { arc: 0xc08aff, rim: 0x6a2ad0, spark: 0xffc0f0 }, // 5 Prelati: violet starlight, pink-white
  { arc: 0xffb848, rim: 0xb86a10, spark: 0xfff0c0 }, // 6 Dumas: golden ink
  { arc: 0x6affc8, rim: 0x109a70, spark: 0xe0fff4 }, // 7 Hassan: mint-teal, white cores
  { arc: 0x3ce0f5, rim: 0x1a6ad0, spark: 0xd8fbff }, // 8 Hashashin: cyan #3ce0f5
  { arc: 0xff5a1a, rim: 0xb0101a, spark: 0xffae35 }, // 9 Humbaba: red-orange embers, crimson glow
  { arc: 0xd0dcf0, rim: 0x6a7490, spark: 0xff4a5a }, // 10 Jack: steel and fog, a red cut
  { arc: 0xff8a1a, rim: 0xd8300a, spark: 0xffe27a }, // 11 Alexander: orange-gold flame
  { arc: 0xa86aff, rim: 0x5a1ab0, spark: 0xd8b8ff }, // 12 Pale Rider: violet-purple
  { arc: 0x8af0f8, rim: 0x1a8a90, spark: 0xffd84a }, // 13 Brynhildr: teal-white, gold stars
];
export const heroEnergy = (hero: number): HeroEnergy => HERO_ENERGY[hero] ?? HERO_ENERGY[0];

/**
 * A procedural swing arc for a sprite fighter (layered over the painted frames with additive blending). Angles are in
 * degrees for a fighter facing right, screen space (0 = forward, -90 = up, 90 = down); the sweep goes a0 -> a1.
 *   slash  - a crescent swept round (cx, cy) at radius r, `w` thick at its widest, squashed vertically by `sy`
 *   thrust - a tapered spear streak from x = r0 to x = r, at height cy
 * Sizes are world units (a standing fighter is ~58 tall). `dur` is the sweep time, `life` the whole effect's.
 */
export interface ArcShape {
  kind: 'slash' | 'thrust';
  a0: number;
  a1: number;
  r: number;
  r0?: number;
  w: number;
  cx: number;
  cy: number;
  sy: number;
  dur: number;
  life: number;
  /** A second crossing arc (an X), mirrored vertically. */
  cross?: boolean;
  /** Heavy: a brighter rim and sparks flying off the arc's head. */
  heavy?: boolean;
}

/** The arc a sprite fighter's move draws (null = none: projectiles, plunges). */
export function arcFor(weapon: number, move: number): ArcShape | null {
  const S = (a0: number, a1: number, r: number, w: number, o: Partial<ArcShape> = {}): ArcShape => ({
    kind: 'slash', a0, a1, r, w, cx: 4, cy: 30, sy: 0.8, dur: 0.07, life: 0.24, ...o,
  });
  switch (weapon) {
    case WeaponId.Sword:
      if (move === MOVE_PLUNGE || move === MOVE_CHARGED) return null;
      if (move === MOVE_AIR) return S(-100, 250, 40, 10, { cx: 0, cy: 28, sy: 0.9, dur: 0.1, life: 0.26 });
      if (move === 1) return S(55, -115, 46, 11, { sy: 0.7 });
      if (move === 2) return S(-150, 60, 58, 15, { cy: 34, sy: 0.95, dur: 0.09, life: 0.32, heavy: true });
      return S(-125, 35, 46, 11, { sy: 0.7 });
    case WeaponId.Scythe:
      if (move === MOVE_PLUNGE || move === MOVE_CHARGED) return null;
      if (move === MOVE_AIR) return S(-90, 270, 64, 13, { cx: 2, cy: 30, sy: 0.85, dur: 0.12, life: 0.3, heavy: true });
      if (move === 1) return S(40, -150, 66, 14, { cx: 0, cy: 34, sy: 0.6, dur: 0.09, life: 0.3, heavy: true });
      if (move === 2) return S(-160, 120, 74, 17, { cx: 0, cy: 32, sy: 0.55, dur: 0.12, life: 0.36, heavy: true });
      return S(-150, 40, 66, 14, { cx: 0, cy: 34, sy: 0.6, dur: 0.09, life: 0.3, heavy: true });
    case WeaponId.Lance: {
      const T = (r: number, w: number, o: Partial<ArcShape> = {}): ArcShape => ({
        kind: 'thrust', a0: 0, a1: 0, r0: 6, r, w, cx: 0, cy: 36, sy: 1, dur: 0.05, life: 0.2, ...o,
      });
      if (move === MOVE_CHARGED) return T(96, 9, { life: 0.34, heavy: true });
      if (move === MOVE_AIR) return T(84, 6, { cy: 31 });
      if (move === 2) return S(-40, 40, 92, 12, { cx: -6, cy: 38, sy: 0.35, dur: 0.07, life: 0.28, heavy: true });
      return T(92, 7);
    }
    case WeaponId.Daggers:
      if (move === MOVE_PLUNGE || move === MOVE_CHARGED) return null;
      if (move === MOVE_AIR) return S(-80, 260, 34, 7, { cx: 0, cy: 28, dur: 0.08, life: 0.2 });
      if (move === 3) return S(-60, 50, 38, 9, { cy: 30, sy: 0.9, life: 0.26, cross: true, heavy: true });
      if (move === 1) return S(45, -55, 32, 7, { cy: 30, sy: 0.75, dur: 0.05, life: 0.17 });
      if (move === 2) return S(-20, 25, 36, 6, { cy: 27, sy: 0.4, dur: 0.05, life: 0.17 });
      return S(-55, 45, 32, 7, { cy: 31, sy: 0.75, dur: 0.05, life: 0.17 });
    case WeaponId.Hammer:
      if (move === MOVE_PLUNGE || move === MOVE_CHARGED) return null;
      if (move === MOVE_AIR) return S(-150, 70, 52, 15, { cy: 30, sy: 1, dur: 0.09, life: 0.3, heavy: true });
      if (move === 2) return S(-175, 60, 64, 19, { cx: 0, cy: 40, sy: 0.85, dur: 0.11, life: 0.38, heavy: true });
      return S(-150, 50, 58, 17, { cx: 2, cy: 38, sy: 0.95, dur: 0.1, life: 0.34, heavy: true });
    case WeaponId.Shield:
      return S(-55, 55, 30, 9, { cx: 6, cy: 28, sy: 1, dur: 0.05, life: 0.18 });
    default:
      return null;
  }
}
