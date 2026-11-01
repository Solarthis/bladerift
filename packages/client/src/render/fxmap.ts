/**
 * Which PixelFX effect plays for each move, impact and skill, with its palette and playback rate. The effect's time 0
 * is lined up with the move's first hitting tick (PixelFX: "t = 0 is the effect's first frame" = the strike).
 */
import { lookWeapon, MOVE_AIR, MOVE_AIR2, MOVE_AIR3, MOVE_CHARGED, MOVE_LAUNCH, MOVE_CRESCENT, MOVE_PLUNGE, WEAPONS, WeaponId } from '@bladerift/shared';

/** The look of a move: the launcher and the air string's second swing draw like the combo's second, its finisher like the combo's last
 * (or the air slash for a two-hit combo). */
export function lookMove(weapon: number, move: number) {
  if (move === MOVE_AIR2 || move === MOVE_LAUNCH) return 1;
  if (move === MOVE_AIR3) return (WEAPONS[weapon]?.combo.length ?? 0) >= 3 ? 2 : MOVE_AIR;
  return move;
}
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
  // the crit burst on a wider canvas, for a word (PARRY!) rather than a number: the stock canvas fits about four letters
  critWord: { ...critNumber, meta: { ...critNumber.meta, size: [232, 120], origin: [116, 60] } },
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
  move = lookMove(weapon, move);
  const s = (mod: FxModule, rate = 1.4, opts?: Record<string, unknown>): SwingFx => ({ mod, rate, opts, stop: mod.act?.hits?.[0]?.stop ?? 0.1 });
  switch (lookWeapon(weapon)) {
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
      return s(FX.claw, 1.7); // Humbaba's claws: raking cuts
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
  /** The second cut of a combo and the finisher (or heavy) are drawn in their own colours: a string of hits reads as
   * gold, then crimson, then emerald, each blow its own flash (the owner's reference clip). */
  alt?: number;
  fin?: number;
}
export const HERO_ENERGY: HeroEnergy[] = [
  { arc: 0xffd86a, rim: 0xd8901a, spark: 0xfff2b0, alt: 0xff4a32, fin: 0x5aff7a }, // 0 Richard: sun gold, crimson, emerald
  { arc: 0x9cff3a, rim: 0x2a7a1a, spark: 0xe0ff8a, alt: 0xffb02a, fin: 0xff3a3a }, // 1 Alcides: Hydra venom, amber, blood
  { arc: 0xffd060, rim: 0xd88a10, spark: 0xfff0a0, alt: 0xff3a3a, fin: 0xfff4d0 }, // 2 Gilgamesh: molten gold, royal red, white gold
  { arc: 0x5af0e0, rim: 0x108a9a, spark: 0xd0fbff, alt: 0xff3a5a, fin: 0x3a8aff }, // 3 Cu Chulainn: sea teal, the red spear, deep blue
  { arc: 0xffd84a, rim: 0x2aa86a, spark: 0x9affc0, alt: 0x3aff9a, fin: 0x9affff }, // 4 Enkidu: gold chains, jade, sky
  { arc: 0xc08aff, rim: 0x6a2ad0, spark: 0xffc0f0, alt: 0xff6ad0, fin: 0x6affe8 }, // 5 Prelati: violet, pink, spectral teal
  { arc: 0xffb848, rim: 0xb86a10, spark: 0xfff0c0, alt: 0x4ad0ff, fin: 0xff5a3a }, // 6 Dumas: gold ink, blue ink, red ink
  { arc: 0x6affc8, rim: 0x109a70, spark: 0xe0fff4, alt: 0xb06aff, fin: 0xf0fff8 }, // 7 Hassan: mint, violet, bone white
  { arc: 0x3ce0f5, rim: 0x1a6ad0, spark: 0xd8fbff, alt: 0xc050ff, fin: 0xf0fcff }, // 8 Hashashin: cyan, violet, white
  { arc: 0xff3a2a, rim: 0x9a0a14, spark: 0xffae35, alt: 0xff9a1a, fin: 0xffe060 }, // 9 Humbaba: crimson, fire, white flame
  { arc: 0xd0dcf0, rim: 0x6a7490, spark: 0xff4a5a, alt: 0xff3a4a, fin: 0x8a4aff }, // 10 Jack: steel, blood, fog violet
  { arc: 0xff8a1a, rim: 0xd8300a, spark: 0xffe27a, alt: 0xffd84a, fin: 0xff3a1a }, // 11 Alexander: flame, gold, red fire
  { arc: 0xa86aff, rim: 0x5a1ab0, spark: 0xd8b8ff, alt: 0x7aff8a, fin: 0xff4aa0 }, // 12 Pale Rider: violet, plague green, rose
  { arc: 0x8af0f8, rim: 0x1a8a90, spark: 0xffd84a, alt: 0xffd84a, fin: 0xf4fcff }, // 13 Brynhildr: teal-white, gold, white
];
export const heroEnergy = (hero: number): HeroEnergy => HERO_ENERGY[hero] ?? HERO_ENERGY[0];

/** A colour darkened to `k` of its brightness. */
export const shadeColor = (c: number, k: number) => (Math.round(((c >> 16) & 255) * k) << 16) | (Math.round(((c >> 8) & 255) * k) << 8) | Math.round((c & 255) * k);
/** A colour mixed toward white by `k`. */
export const whiten = (c: number, k: number) => {
  const m = (v: number) => Math.round(v + (255 - v) * k);
  return (m((c >> 16) & 255) << 16) | (m((c >> 8) & 255) << 8) | m(c & 255);
};
const stepCache = new Map<number, HeroEnergy>();
/** The colours of one blow: combo step 0 the hero's own, step 1 its second colour, the finisher / heavy / plunge its third. */
export function energyForMove(hero: number, move: number, comboLen = 3): HeroEnergy {
  const e = heroEnergy(hero);
  const fin = move < 10 && move === comboLen - 1 && comboLen >= 2;
  const col = fin || move === MOVE_AIR3 || move === MOVE_LAUNCH ? e.fin : (move >= 1 && move < 10) || move === MOVE_AIR2 ? e.alt : move === MOVE_CHARGED || move === MOVE_PLUNGE || move === MOVE_CRESCENT ? e.fin : undefined;
  if (col === undefined) return e;
  const key = hero * 64 + move;
  let c = stepCache.get(key);
  if (!c) stepCache.set(key, (c = { arc: col, rim: shadeColor(col, 0.55), spark: whiten(col, 0.6) }));
  return c;
}

/**
 * A procedural swing arc for a sprite fighter (layered over the painted frames with additive blending). Angles are in
 * degrees for a fighter facing right, screen space (0 = forward, -90 = up, 90 = down); the sweep goes a0 -> a1.
 *   slash  - a crescent swept round (cx, cy) at radius r, `w` thick at its widest, squashed vertically by `sy`
 *   thrust - a tapered spear streak from x = r0 to x = r, at height cy
 * Sizes are world units (a standing fighter is ~58 tall). `dur` is the sweep time, `life` the whole effect's.
 */
export interface ArcShape {
  /** slash: a crescent swept round; thrust: a straight streak; chain: a lash of links whipping out to `r`; rake: three
   * parallel claw cuts (a slash drawn three times, each a little further in). */
  kind: 'slash' | 'thrust' | 'chain' | 'rake';
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
  move = lookMove(weapon, move);
  const S = (a0: number, a1: number, r: number, w: number, o: Partial<ArcShape> = {}): ArcShape => ({
    kind: 'slash', a0, a1, r, w, cx: 4, cy: 30, sy: 0.8, dur: 0.07, life: 0.24, ...o,
  });
  const T = (r: number, w: number, o: Partial<ArcShape> = {}): ArcShape => ({
    kind: 'thrust', a0: 0, a1: 0, r0: 6, r, w, cx: 0, cy: 36, sy: 1, dur: 0.05, life: 0.2, ...o,
  });
  switch (weapon) {
    // the heroes' own weapons
    case WeaponId.Kopis:
      // fast forward chops alternating down and up, a rising cut, then the flaming finisher
      if (move === MOVE_PLUNGE || move === MOVE_CHARGED) return null;
      if (move === MOVE_AIR) return S(-135, 90, 46, 11, { cx: 0, cy: 30, sy: 0.9, dur: 0.07, life: 0.24 });
      if (move === 0) return S(-115, 30, 46, 11, { sy: 0.62, dur: 0.045, life: 0.19 });
      if (move === 1) return S(45, -100, 46, 11, { sy: 0.62, dur: 0.045, life: 0.19 });
      if (move === 2) return S(140, -75, 54, 13, { cy: 36, sy: 1, dur: 0.07, life: 0.26 });
      return S(-160, 70, 62, 17, { cy: 34, sy: 0.95, dur: 0.08, life: 0.34, heavy: true });
    case WeaponId.TwinBlades:
      // a flurry of short alternating cuts, then a full spin
      if (move === MOVE_PLUNGE || move === MOVE_CHARGED) return null;
      if (move === MOVE_AIR) return S(-180, 180, 36, 8, { cx: 0, cy: 28, sy: 0.55, dur: 0.12, life: 0.26 });
      if (move === 4) return S(-180, 180, 42, 9, { cx: 0, cy: 30, sy: 0.45, dur: 0.12, life: 0.3, heavy: true, cross: true });
      return move % 2 ? S(55, -55, 32, 6, { cy: 31, sy: 0.75, dur: 0.04, life: 0.15 }) : S(-60, 45, 32, 6, { cy: 30, sy: 0.75, dur: 0.04, life: 0.15 });
    case WeaponId.Knives:
      // a long surgical thrust, a clean cross-cut, then an X
      if (move === MOVE_PLUNGE || move === MOVE_CHARGED) return null;
      if (move === MOVE_AIR) return S(-70, 60, 50, 6, { cx: 0, cy: 30, sy: 0.85, dur: 0.06, life: 0.2 });
      if (move === 0) return T(72, 4, { cy: 38, life: 0.18 });
      if (move === 1) return S(-55, 50, 54, 6, { cy: 34, sy: 0.85, dur: 0.05, life: 0.2 });
      return S(-60, 55, 60, 8, { cy: 34, sy: 0.9, dur: 0.06, life: 0.3, cross: true, heavy: true });
    case WeaponId.Chains:
      // living chains whipping out (low, high), then the yank
      if (move === MOVE_CHARGED) return T(96, 9, { life: 0.34, heavy: true });
      if (move === MOVE_PLUNGE) return null;
      // (each lash is drawn as long as its hit box reaches: weapons.ts Chains)
      if (move === MOVE_AIR) return { kind: 'chain', a0: 0, a1: 0, r: 128, w: 6, cx: 4, cy: 26, sy: 1, dur: 0.09, life: 0.3 };
      if (move === 1) return { kind: 'chain', a0: 0, a1: 0, r: 132, w: 6, cx: 6, cy: 56, sy: 1, dur: 0.1, life: 0.3 };
      if (move === 2) return { kind: 'chain', a0: 0, a1: 0, r: 146, w: 8, cx: 6, cy: 40, sy: 1, dur: 0.11, life: 0.4, heavy: true };
      return { kind: 'chain', a0: 0, a1: 0, r: 134, w: 6, cx: 6, cy: 38, sy: 1, dur: 0.1, life: 0.3 };
    case WeaponId.Quill:
    case WeaponId.Staff:
    case WeaponId.Bow:
    case WeaponId.Gate:
      return null;
    case WeaponId.Hammer:
      // Humbaba's claws: three parallel rakes (the third blow is the ground slam)
      if (move === MOVE_PLUNGE || move === MOVE_CHARGED) return null;
      if (move === 2) return { kind: 'rake', a0: -160, a1: 70, r: 64, w: 9, cx: 0, cy: 38, sy: 0.9, dur: 0.1, life: 0.36, heavy: true };
      if (move === MOVE_AIR) return { kind: 'rake', a0: -140, a1: 60, r: 50, w: 8, cx: 0, cy: 30, sy: 1, dur: 0.09, life: 0.3, heavy: true };
      return { kind: 'rake', a0: move === 1 ? 40 : -140, a1: move === 1 ? -120 : 40, r: 56, w: 8, cx: 2, cy: 38, sy: 0.95, dur: 0.08, life: 0.32, heavy: true };
    case WeaponId.Sword:
      if (move === MOVE_PLUNGE || move === MOVE_CHARGED) return null;
      if (move === MOVE_AIR) return S(-140, 95, 48, 12, { cx: 0, cy: 30, sy: 0.92, dur: 0.08, life: 0.26 });
      if (move === 1) return S(55, -115, 46, 11, { sy: 0.7 });
      if (move === 2) return S(-150, 60, 58, 15, { cy: 34, sy: 0.95, dur: 0.09, life: 0.32, heavy: true });
      // the Sun Crescent: a wide overhead cleave, the arc that flies off it (World: the crescent projectile)
      if (move === MOVE_CRESCENT) return S(-120, 75, 50, 15, { cy: 32, sy: 1, dur: 0.06, life: 0.22, heavy: true });
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
      if (move === MOVE_AIR) return S(-100, 95, 36, 7, { cx: 0, cy: 28, dur: 0.07, life: 0.2 });
      if (move === 3) return S(-60, 50, 38, 9, { cy: 30, sy: 0.9, life: 0.26, cross: true, heavy: true });
      if (move === 1) return S(45, -55, 32, 7, { cy: 30, sy: 0.75, dur: 0.05, life: 0.17 });
      if (move === 2) return S(-20, 25, 36, 6, { cy: 27, sy: 0.4, dur: 0.05, life: 0.17 });
      return S(-55, 45, 32, 7, { cy: 31, sy: 0.75, dur: 0.05, life: 0.17 });
    case WeaponId.Shield:
      return S(-55, 55, 30, 9, { cx: 6, cy: 28, sy: 1, dur: 0.05, life: 0.18 });
    default:
      return null;
  }
}
