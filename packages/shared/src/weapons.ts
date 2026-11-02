/**
 * Weapons and skills. Every attack is a Move: wind-up (startup), a window that can hit (active) and recovery, all in
 * 60 Hz ticks. Hit boxes are relative to the attacker's feet, x forward (mirrored with facing), y up (negative).
 */
export const enum WeaponId {
  Sword = 0,
  Scythe = 1,
  Lance = 2,
  Daggers = 3,
  Hammer = 4,
  Bow = 5,
  Shield = 6,
  /** Caster's arcane staff: bolts at range, a charged orb. */
  Staff = 7,
  /** Gilgamesh's Gate of Treasures: no weapon in hand - golden portals open behind him and fire treasured blades. */
  Gate = 8,
  /** Alexander's kopis: quick forward chops, four to a string, the last a flaming cut that launches. */
  Kopis = 9,
  /** Hashashin's twin blades: a five-cut flurry at arm's length that ends in a spin. */
  TwinBlades = 10,
  /** Jack the Ripper's surgical knives: long, precise thrusts that crit at the tip and from behind. */
  Knives = 11,
  /** Enkidu's living chains: the longest lashes in the game, the third whips the target off its feet. */
  Chains = 12,
  /** Dumas' quill: quick golden-ink bolts, the third slows the target while the story catches up. */
  Quill = 13,
  // ---- the second-stance weapons (the STANCE button switches to them: heroes.ts STANCE_WEAPON); never in a loadout
  /** Richard's Danish war-axe: heavy chops and an overhead that bites the ground. */
  WarAxe = 14,
  /** Alcides' olive-wood club: wide brutal swings and a guard-crushing ground slam. */
  Club = 15,
  /** Gilgamesh's Kingsblade, drawn from a portal: one-handed swordplay, held to charge a golden lunge. */
  Kingsblade = 16,
  /** Cu Chulainn's barbed darts: thrown at range, held to hurl a great javelin. */
  Darts = 17,
  /** Enkidu's clay arms: quick jabs and blades, an uppercut hammer that pops the target up. */
  ClayArms = 18,
  /** Prelati's demon hand: a summoned claw that strikes far in front of her and drags the target in. */
  DemonHand = 19,
  /** Dumas' rapier: long fencing thrusts that crit at the point, held to charge a running lunge. */
  Rapier = 20,
  /** Hassan's shamshir: wide curved cuts, the third a full spin that hits both sides. */
  Shamshir = 21,
  /** Hashashin's rope dart: whip-fast lashes at mid range, the third hooks the target back to her. */
  RopeDart = 22,
  /** Humbaba's fire breath: short gouts of flame that set the target burning. */
  FireBreath = 23,
  /** Jack's sword-cane: cane jabs, a hook that pulls, and the hidden blade's draw cut. */
  SwordCane = 24,
  /** Alexander's sarissa: the longest pokes in the game, held to charge a phalanx lunge. */
  Sarissa = 25,
  /** The Pale Rider's shadow: a colossal shadow strikes far in front of her; its bite slows. */
  Shadow = 26,
  /** Brynhildr's Valkyrie spear: thrusts past the shield, held to hurl the spear. */
  ValkyrieSpear = 27,
}
/** The loadout weapons (WeaponId below this); the stance weapons after them are heroes' second stances, never a loadout's. */
export const WEAPON_COUNT = 14;

/** Every hero's own signature special (the Skill button): skill N belongs to hero N (heroes.ts). */
export const enum SkillId {
  LionsRoar = 0,
  NineLives = 1,
  GateShot = 2,
  RuneLeap = 3,
  ChainLash = 4,
  PhantomStars = 5,
  InkBlot = 6,
  ShadowDirk = 7,
  FanOfKnives = 8,
  TerrorRoar = 9,
  ScalpelRain = 10,
  BucephalusCharge = 11,
  PlagueHound = 12,
  ShieldRebound = 13,
}
export const SKILL_COUNT = 14;

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Move {
  startup: number;
  active: number;
  recovery: number;
  dmg: number;
  box: Box;
  /** Knockback away from the attacker (x) and upward (y), units per second. */
  kbX: number;
  kbY: number;
  /** Hit-stun ticks on the defender. */
  stun: number;
  /** Forward speed during startup and active (a step into the swing). */
  step?: number;
  /** Pull the defender toward the attacker's front instead of pushing away. */
  pull?: boolean;
  /** Cannot be blocked (or parried). */
  breaksGuard?: boolean;
  /** Hits in the outer part of the box crit (x1.4). */
  tipCrit?: boolean;
  /** Hits from behind the defender crit (x1.5). */
  backCrit?: boolean;
  /** Pops the one it hits up to float in hit-stun without a knockdown (the launcher). */
  launcher?: boolean;
  /** Falls fast while active and ends on landing (air only). */
  plunge?: boolean;
  /** Dashes forward at this speed while active (lance lunge). */
  dash?: number;
  /** Fires a projectile on the first active tick instead of using the box. */
  arrow?: boolean;
  /** The projectile is an arcane bolt (staff) or, charged, an exploding orb, instead of an arrow. */
  arcane?: boolean;
  /** Treasured blades fired from portals behind the hero (the Gate): `blades` of them (the charged move: 2 up to 9). The
   * move's dmg is the whole volley's, shared among the blades; only the last carries the full knockback and stun. */
  gate?: boolean;
  blades?: number;
  /** A golden crescent of light flung forward from the swing (Richard's heavy): a mid-range projectile on a cooldown. */
  crescent?: boolean;
  /** Screen shake strength for the client (0..1). */
  shake?: number;
  /** A shot that slows what it hits for this many ticks (the quill's ink). */
  slow?: number;
  /** A throw (THROW): no box; it grabs a grounded opponent in front and in reach (World.checkThrow). */
  grab?: boolean;
  /** A swing that sets what it hits burning for this many ticks (Humbaba's fire breath). (`slow` slows it, swing or shot.) */
  burn?: number;
}

export interface WeaponDef {
  id: WeaponId;
  name: string;
  short: string;
  /** Combo: consecutive presses chain these in order. */
  combo: Move[];
  air: Move;
  plunge?: Move;
  /** Hold-to-charge attack (lance lunge, bow draw): charge ticks [min, max], damage scales from dmg to dmgMax. */
  charged?: Move & { min: number; max: number; dmgMax: number };
  /** Hold to block (shield): a tap does `combo[0]`. */
  block?: boolean;
  /** The weapon whose look a hero's own weapon borrows where it has none of its own yet (client: poses, effects, icons). */
  base?: WeaponId;
  /** Arrow speed / gravity (bow). */
  arrowSpeed?: number;
  /** Handle length drawn behind the grip (client) and reach summary for the menus. */
  blurb: string;
}

const b = (x: number, y: number, w: number, h: number): Box => ({ x, y, w, h });

export const WEAPONS: WeaponDef[] = [
  {
    id: WeaponId.Sword,
    name: 'Longsword',
    short: 'Sword',
    blurb: 'Balanced three-hit combo. The third swing launches.',
    combo: [
      { startup: 5, active: 5, recovery: 11, dmg: 90, box: b(4, -52, 60, 46), kbX: 170, kbY: 60, stun: 22, step: 90 },
      { startup: 5, active: 5, recovery: 11, dmg: 95, box: b(4, -52, 60, 46), kbX: 180, kbY: 60, stun: 22, step: 90 },
      { startup: 10, active: 6, recovery: 22, dmg: 132, box: b(2, -66, 52, 64), kbX: 170, kbY: 520, stun: 34, step: 120, shake: 0.4 },
    ],
    air: { startup: 6, active: 8, recovery: 12, dmg: 80, box: b(-6, -56, 56, 54), kbX: 170, kbY: 140, stun: 22 },
    plunge: { startup: 9, active: 40, recovery: 16, dmg: 126, box: b(-18, -24, 46, 38), kbX: 230, kbY: 320, stun: 30, plunge: true, shake: 0.5 },
  },
  {
    id: WeaponId.Scythe,
    name: 'Reaper Scythe',
    short: 'Scythe',
    blurb: 'Huge, slow sweeps. Tip hits crit; the third swing hooks the enemy in.',
    combo: [
      { startup: 11, active: 7, recovery: 16, dmg: 90, box: b(-12, -66, 80, 62), kbX: 210, kbY: 90, stun: 24, step: 60, tipCrit: true },
      { startup: 11, active: 7, recovery: 16, dmg: 95, box: b(-12, -66, 80, 62), kbX: 210, kbY: 90, stun: 24, step: 60, tipCrit: true },
      { startup: 16, active: 8, recovery: 26, dmg: 140, box: b(-22, -60, 90, 60), kbX: 300, kbY: 140, stun: 42, step: 40, pull: true, tipCrit: true, shake: 0.45 },
    ],
    air: { startup: 9, active: 10, recovery: 14, dmg: 85, box: b(-44, -74, 116, 86), kbX: 190, kbY: 160, stun: 24 },
    plunge: { startup: 10, active: 40, recovery: 18, dmg: 120, box: b(-30, -26, 70, 40), kbX: 220, kbY: 300, stun: 30, plunge: true, shake: 0.5 },
  },
  {
    id: WeaponId.Lance,
    name: 'Knight Lance',
    short: 'Lance',
    blurb: 'Longest reach. Hold to charge a lunge across the arena.',
    combo: [
      { startup: 7, active: 5, recovery: 14, dmg: 80, box: b(12, -44, 78, 18), kbX: 230, kbY: 40, stun: 22, step: 60 },
      { startup: 7, active: 5, recovery: 14, dmg: 85, box: b(12, -44, 78, 18), kbX: 230, kbY: 40, stun: 22, step: 60 },
      { startup: 12, active: 6, recovery: 22, dmg: 110, box: b(12, -48, 88, 22), kbX: 340, kbY: 140, stun: 30, step: 160, shake: 0.35 },
    ],
    air: { startup: 7, active: 8, recovery: 14, dmg: 80, box: b(8, -40, 74, 20), kbX: 220, kbY: 80, stun: 22 },
    charged: {
      startup: 4, active: 18, recovery: 22, dmg: 110, dmgMax: 200, box: b(4, -46, 66, 24), kbX: 420, kbY: 160, stun: 38,
      dash: 640, min: 14, max: 50, shake: 0.6,
    },
  },
  {
    id: WeaponId.Daggers,
    name: 'Twin Daggers',
    short: 'Daggers',
    blurb: 'Blindingly fast four-hit flurry. Hits from behind crit.',
    combo: [
      { startup: 4, active: 3, recovery: 8, dmg: 40, box: b(4, -48, 34, 36), kbX: 90, kbY: 30, stun: 15, step: 80, backCrit: true },
      { startup: 4, active: 3, recovery: 8, dmg: 40, box: b(4, -48, 34, 36), kbX: 90, kbY: 30, stun: 15, step: 80, backCrit: true },
      { startup: 4, active: 3, recovery: 8, dmg: 42, box: b(4, -48, 34, 36), kbX: 90, kbY: 30, stun: 15, step: 80, backCrit: true },
      { startup: 6, active: 4, recovery: 16, dmg: 62, box: b(2, -50, 38, 40), kbX: 240, kbY: 120, stun: 24, step: 120, backCrit: true },
    ],
    air: { startup: 4, active: 6, recovery: 8, dmg: 45, box: b(-8, -52, 44, 46), kbX: 110, kbY: 90, stun: 16, backCrit: true },
    plunge: { startup: 6, active: 40, recovery: 12, dmg: 80, box: b(-12, -24, 30, 34), kbX: 160, kbY: 240, stun: 24, plunge: true, backCrit: true },
  },
  {
    id: WeaponId.Hammer,
    name: 'War Hammer',
    short: 'Hammer',
    blurb: 'Crushing and slow. The third blow slams the ground and breaks guards.',
    combo: [
      { startup: 18, active: 6, recovery: 24, dmg: 135, box: b(2, -72, 58, 72), kbX: 290, kbY: 110, stun: 36, step: 50, shake: 0.45 },
      { startup: 18, active: 6, recovery: 24, dmg: 145, box: b(2, -72, 58, 72), kbX: 290, kbY: 110, stun: 36, step: 50, shake: 0.45 },
      { startup: 26, active: 6, recovery: 34, dmg: 200, box: b(-56, -34, 176, 34), kbX: 220, kbY: 440, stun: 46, breaksGuard: true, shake: 0.9 },
    ],
    air: { startup: 12, active: 8, recovery: 18, dmg: 126, box: b(-12, -62, 64, 70), kbX: 230, kbY: 120, stun: 30, shake: 0.4 },
    plunge: { startup: 12, active: 40, recovery: 24, dmg: 170, box: b(-40, -28, 100, 40), kbX: 260, kbY: 380, stun: 40, plunge: true, breaksGuard: true, shake: 0.9 },
  },
  {
    id: WeaponId.Bow,
    name: 'Hunter Bow',
    short: 'Bow',
    blurb: 'Arrows from range. Hold to draw a heavy, fast shot.',
    combo: [{ startup: 8, active: 1, recovery: 18, dmg: 60, box: b(0, 0, 0, 0), kbX: 140, kbY: 40, stun: 8, arrow: true }],
    air: { startup: 7, active: 1, recovery: 16, dmg: 55, box: b(0, 0, 0, 0), kbX: 140, kbY: 40, stun: 8, arrow: true },
    charged: { startup: 2, active: 1, recovery: 16, dmg: 70, dmgMax: 150, box: b(0, 0, 0, 0), kbX: 260, kbY: 80, stun: 30, arrow: true, min: 12, max: 60 },
    arrowSpeed: 880,
  },
  {
    id: WeaponId.Shield,
    name: 'Tower Shield',
    short: 'Shield',
    blurb: 'Hold to block. Block at the last moment to parry; tap to bash.',
    // a jab with the rim that holds them close, then the full-body shove that throws them off
    combo: [
      { startup: 5, active: 4, recovery: 12, dmg: 40, box: b(2, -52, 36, 48), kbX: 110, kbY: 20, stun: 24, step: 110 },
      { startup: 7, active: 5, recovery: 18, dmg: 62, box: b(2, -54, 40, 52), kbX: 320, kbY: 90, stun: 36, step: 150, shake: 0.3 },
    ],
    air: { startup: 5, active: 6, recovery: 12, dmg: 45, box: b(2, -52, 32, 48), kbX: 260, kbY: 80, stun: 30 },
    block: true,
  },
  {
    id: WeaponId.Staff,
    name: 'Arcane Staff',
    short: 'Staff',
    blurb: 'Quick arcane bolts at range; hold to conjure an orb that bursts on impact.',
    combo: [
      { startup: 7, active: 1, recovery: 17, dmg: 48, box: b(0, 0, 0, 0), kbX: 120, kbY: 40, stun: 8, arrow: true, arcane: true },
      { startup: 7, active: 1, recovery: 17, dmg: 50, box: b(0, 0, 0, 0), kbX: 120, kbY: 40, stun: 8, arrow: true, arcane: true },
      { startup: 9, active: 1, recovery: 26, dmg: 66, box: b(0, 0, 0, 0), kbX: 220, kbY: 120, stun: 16, arrow: true, arcane: true },
    ],
    air: { startup: 6, active: 1, recovery: 17, dmg: 44, box: b(0, 0, 0, 0), kbX: 120, kbY: 60, stun: 8, arrow: true, arcane: true },
    charged: { startup: 3, active: 1, recovery: 20, dmg: 90, dmgMax: 170, box: b(0, 0, 0, 0), kbX: 280, kbY: 220, stun: 32, arrow: true, arcane: true, min: 14, max: 60 },
    arrowSpeed: 640,
  },
  {
    id: WeaponId.Gate,
    name: 'Gate of Treasures',
    short: 'Gate',
    blurb: 'Golden portals open behind him and fire treasured blades. Hold to open more gates: up to nine blades at once.',
    combo: [
      { startup: 7, active: 1, recovery: 18, dmg: 42, box: b(0, 0, 0, 0), kbX: 130, kbY: 40, stun: 9, arrow: true, gate: true, blades: 1 },
      { startup: 8, active: 1, recovery: 22, dmg: 58, box: b(0, 0, 0, 0), kbX: 150, kbY: 60, stun: 9, arrow: true, gate: true, blades: 2 },
    ],
    air: { startup: 6, active: 1, recovery: 18, dmg: 36, box: b(0, 0, 0, 0), kbX: 130, kbY: 40, stun: 8, arrow: true, gate: true, blades: 1 },
    // the whole volley's damage, shared among its blades: the count grows with the hold (2 at the threshold, 9 at full)
    charged: { startup: 3, active: 1, recovery: 20, dmg: 70, dmgMax: 170, box: b(0, 0, 0, 0), kbX: 200, kbY: 90, stun: 18, arrow: true, gate: true, min: 10, max: 60 },
    arrowSpeed: 1050,
  },
  {
    id: WeaponId.Kopis,
    name: 'Kopis',
    short: 'Kopis',
    blurb: 'Quick forward chops, four to a string; the last is a flaming cut that launches.',
    base: WeaponId.Sword,
    combo: [
      { startup: 4, active: 4, recovery: 9, dmg: 64, box: b(4, -50, 56, 44), kbX: 140, kbY: 50, stun: 18, step: 110 },
      { startup: 4, active: 4, recovery: 9, dmg: 66, box: b(4, -50, 56, 44), kbX: 140, kbY: 50, stun: 18, step: 110 },
      { startup: 5, active: 4, recovery: 11, dmg: 70, box: b(2, -64, 50, 62), kbX: 110, kbY: 250, stun: 24, step: 90 },
      { startup: 9, active: 5, recovery: 20, dmg: 112, box: b(0, -60, 66, 58), kbX: 330, kbY: 190, stun: 32, step: 150, shake: 0.45 },
    ],
    air: { startup: 5, active: 7, recovery: 11, dmg: 72, box: b(-2, -56, 56, 52), kbX: 170, kbY: 140, stun: 22 },
    plunge: { startup: 8, active: 40, recovery: 15, dmg: 118, box: b(-18, -24, 46, 38), kbX: 230, kbY: 320, stun: 30, plunge: true, shake: 0.5 },
  },
  {
    id: WeaponId.TwinBlades,
    name: 'Twin Blades',
    short: 'Blades',
    blurb: "A five-cut flurry at arm's length that ends in a spin. Hits from behind crit.",
    base: WeaponId.Daggers,
    combo: [
      { startup: 3, active: 3, recovery: 7, dmg: 32, box: b(4, -48, 32, 36), kbX: 70, kbY: 20, stun: 14, step: 90, backCrit: true },
      { startup: 3, active: 3, recovery: 7, dmg: 32, box: b(4, -48, 32, 36), kbX: 70, kbY: 20, stun: 14, step: 90, backCrit: true },
      { startup: 3, active: 3, recovery: 7, dmg: 33, box: b(4, -48, 32, 36), kbX: 70, kbY: 20, stun: 14, step: 90, backCrit: true },
      { startup: 3, active: 3, recovery: 7, dmg: 34, box: b(4, -48, 32, 36), kbX: 70, kbY: 20, stun: 14, step: 90, backCrit: true },
      { startup: 5, active: 6, recovery: 16, dmg: 56, box: b(-16, -52, 54, 44), kbX: 230, kbY: 160, stun: 24, step: 60, backCrit: true },
    ],
    air: { startup: 4, active: 8, recovery: 8, dmg: 40, box: b(-12, -52, 44, 48), kbX: 110, kbY: 90, stun: 16, backCrit: true },
    plunge: { startup: 6, active: 40, recovery: 12, dmg: 78, box: b(-12, -24, 30, 34), kbX: 160, kbY: 240, stun: 24, plunge: true, backCrit: true },
  },
  {
    id: WeaponId.Knives,
    name: 'Surgical Knives',
    short: 'Knives',
    blurb: 'Long, precise thrusts. The point crits, and so does a cut from behind.',
    base: WeaponId.Daggers,
    combo: [
      { startup: 6, active: 3, recovery: 11, dmg: 60, box: b(6, -46, 66, 20), kbX: 120, kbY: 30, stun: 18, step: 120, tipCrit: true, backCrit: true },
      { startup: 6, active: 4, recovery: 11, dmg: 62, box: b(2, -56, 60, 40), kbX: 130, kbY: 40, stun: 18, step: 100, backCrit: true },
      { startup: 10, active: 5, recovery: 18, dmg: 90, box: b(0, -58, 70, 50), kbX: 260, kbY: 120, stun: 28, step: 130, tipCrit: true, backCrit: true, shake: 0.35 },
    ],
    air: { startup: 5, active: 6, recovery: 10, dmg: 50, box: b(-6, -52, 60, 46), kbX: 120, kbY: 90, stun: 18, backCrit: true },
    plunge: { startup: 6, active: 40, recovery: 12, dmg: 82, box: b(-12, -24, 30, 34), kbX: 160, kbY: 240, stun: 24, plunge: true, backCrit: true },
  },
  {
    id: WeaponId.Chains,
    name: 'Living Chains',
    short: 'Chains',
    blurb: 'The longest reach in the game: the chains hold a target at a distance, the third lash whips it into the air. Hold to lock them into a spear and lunge.',
    base: WeaponId.Lance,
    combo: [
      // (the hit reaches as far as the chain is drawn: render/fxmap.ts chain arcs)
      { startup: 8, active: 4, recovery: 15, dmg: 56, box: b(16, -46, 118, 20), kbX: 80, kbY: 20, stun: 22, step: 20 },
      { startup: 8, active: 4, recovery: 15, dmg: 58, box: b(12, -72, 120, 34), kbX: 80, kbY: 60, stun: 22, step: 20 },
      { startup: 12, active: 6, recovery: 24, dmg: 80, box: b(16, -52, 130, 28), kbX: 190, kbY: 280, stun: 30, shake: 0.35 },
    ],
    air: { startup: 7, active: 8, recovery: 14, dmg: 62, box: b(4, -40, 124, 30), kbX: 180, kbY: 80, stun: 22 },
    charged: {
      startup: 4, active: 18, recovery: 22, dmg: 105, dmgMax: 190, box: b(4, -46, 66, 24), kbX: 420, kbY: 160, stun: 38,
      dash: 640, min: 14, max: 50, shake: 0.6,
    },
  },
  {
    id: WeaponId.Quill,
    name: 'Quill and Book',
    short: 'Quill',
    blurb: 'Quick golden-ink bolts; the third slows the target. Hold to write an ink orb that bursts.',
    base: WeaponId.Staff,
    combo: [
      { startup: 6, active: 1, recovery: 15, dmg: 42, box: b(0, 0, 0, 0), kbX: 110, kbY: 40, stun: 8, arrow: true, arcane: true },
      { startup: 6, active: 1, recovery: 15, dmg: 44, box: b(0, 0, 0, 0), kbX: 110, kbY: 40, stun: 8, arrow: true, arcane: true },
      { startup: 8, active: 1, recovery: 24, dmg: 54, box: b(0, 0, 0, 0), kbX: 180, kbY: 100, stun: 14, arrow: true, arcane: true, slow: 75 },
    ],
    air: { startup: 6, active: 1, recovery: 16, dmg: 40, box: b(0, 0, 0, 0), kbX: 110, kbY: 60, stun: 8, arrow: true, arcane: true },
    charged: { startup: 3, active: 1, recovery: 20, dmg: 85, dmgMax: 160, box: b(0, 0, 0, 0), kbX: 280, kbY: 220, stun: 32, arrow: true, arcane: true, min: 14, max: 60 },
    arrowSpeed: 800,
  },  // ------------------------------------------------------------ second-stance weapons (the STANCE button)
  {
    id: WeaponId.WarAxe,
    name: 'Jaffa War-Axe',
    short: 'Axe',
    blurb: 'Heavy two-handed chops; the third bites into the ground. Slower than the sword, every blow hits harder.',
    base: WeaponId.Hammer,
    combo: [
      { startup: 7, active: 5, recovery: 14, dmg: 112, box: b(2, -62, 64, 58), kbX: 210, kbY: 80, stun: 26, step: 70, shake: 0.3 },
      { startup: 7, active: 5, recovery: 14, dmg: 116, box: b(2, -62, 64, 58), kbX: 210, kbY: 90, stun: 26, step: 70, shake: 0.3 },
      { startup: 13, active: 6, recovery: 24, dmg: 158, box: b(-4, -76, 72, 76), kbX: 250, kbY: 320, stun: 36, step: 90, shake: 0.6 },
    ],
    air: { startup: 8, active: 8, recovery: 14, dmg: 98, box: b(-8, -62, 62, 62), kbX: 200, kbY: 160, stun: 26, shake: 0.3 },
    plunge: { startup: 10, active: 40, recovery: 18, dmg: 148, box: b(-30, -26, 72, 40), kbX: 240, kbY: 340, stun: 34, plunge: true, shake: 0.7 },
  },
  {
    id: WeaponId.Club,
    name: 'Olive-Wood Club',
    short: 'Club',
    blurb: 'Wide, brutal swings; the third slams the ground and breaks guards.',
    base: WeaponId.Hammer,
    combo: [
      { startup: 7, active: 6, recovery: 13, dmg: 118, box: b(-4, -68, 70, 64), kbX: 260, kbY: 90, stun: 26, step: 60, shake: 0.35 },
      { startup: 7, active: 6, recovery: 13, dmg: 122, box: b(-4, -68, 70, 64), kbX: 260, kbY: 90, stun: 26, step: 60, shake: 0.35 },
      { startup: 15, active: 7, recovery: 25, dmg: 180, box: b(-34, -40, 136, 40), kbX: 220, kbY: 420, stun: 42, breaksGuard: true, shake: 0.85 },
    ],
    air: { startup: 10, active: 8, recovery: 16, dmg: 102, box: b(-12, -66, 66, 72), kbX: 230, kbY: 140, stun: 28, shake: 0.35 },
    plunge: { startup: 12, active: 40, recovery: 22, dmg: 156, box: b(-40, -28, 100, 40), kbX: 250, kbY: 360, stun: 38, plunge: true, shake: 0.85 },
  },
  {
    id: WeaponId.Kingsblade,
    name: 'Kingsblade',
    short: 'Kingsblade',
    blurb: 'Drawn from a portal and swung one-handed: quick, clean cuts; the tip of the third crits. Hold to charge a golden lunge.',
    base: WeaponId.Sword,
    combo: [
      { startup: 5, active: 4, recovery: 10, dmg: 84, box: b(4, -56, 62, 48), kbX: 160, kbY: 50, stun: 21, step: 100 },
      { startup: 5, active: 4, recovery: 11, dmg: 88, box: b(4, -60, 64, 52), kbX: 170, kbY: 60, stun: 21, step: 100 },
      { startup: 10, active: 6, recovery: 20, dmg: 138, box: b(0, -62, 76, 58), kbX: 320, kbY: 200, stun: 32, step: 150, tipCrit: true, shake: 0.45 },
    ],
    air: { startup: 5, active: 8, recovery: 11, dmg: 74, box: b(-6, -58, 60, 56), kbX: 170, kbY: 140, stun: 22 },
    plunge: { startup: 9, active: 40, recovery: 16, dmg: 116, box: b(-18, -24, 46, 38), kbX: 230, kbY: 320, stun: 30, plunge: true, shake: 0.5 },
    charged: {
      startup: 4, active: 16, recovery: 22, dmg: 100, dmgMax: 185, box: b(4, -52, 70, 30), kbX: 400, kbY: 170, stun: 36,
      dash: 700, min: 12, max: 48, shake: 0.6,
    },
  },
  {
    id: WeaponId.Darts,
    name: 'Barbed Darts',
    short: 'Darts',
    blurb: 'Barbed darts thrown from range. Hold to hurl a great javelin.',
    base: WeaponId.Bow,
    combo: [
      { startup: 6, active: 1, recovery: 14, dmg: 50, box: b(0, 0, 0, 0), kbX: 130, kbY: 40, stun: 9, arrow: true },
      { startup: 6, active: 1, recovery: 14, dmg: 52, box: b(0, 0, 0, 0), kbX: 130, kbY: 40, stun: 9, arrow: true },
      { startup: 9, active: 1, recovery: 22, dmg: 68, box: b(0, 0, 0, 0), kbX: 220, kbY: 100, stun: 16, arrow: true },
    ],
    air: { startup: 6, active: 1, recovery: 14, dmg: 46, box: b(0, 0, 0, 0), kbX: 130, kbY: 40, stun: 9, arrow: true },
    charged: { startup: 2, active: 1, recovery: 18, dmg: 78, dmgMax: 155, box: b(0, 0, 0, 0), kbX: 280, kbY: 90, stun: 30, arrow: true, min: 12, max: 50 },
    arrowSpeed: 980,
  },
  {
    id: WeaponId.ClayArms,
    name: 'Clay Arms',
    short: 'Clay',
    blurb: 'Its arms become the weapons: a quick jab, a blade, and a hammer uppercut that pops the target up.',
    base: WeaponId.Daggers,
    combo: [
      { startup: 4, active: 3, recovery: 9, dmg: 50, box: b(4, -54, 42, 32), kbX: 100, kbY: 30, stun: 16, step: 90 },
      { startup: 5, active: 4, recovery: 10, dmg: 62, box: b(2, -62, 58, 50), kbX: 140, kbY: 50, stun: 19, step: 90 },
      { startup: 9, active: 5, recovery: 18, dmg: 104, box: b(0, -74, 62, 74), kbX: 110, kbY: 470, stun: 30, step: 80, shake: 0.5 },
    ],
    air: { startup: 4, active: 7, recovery: 9, dmg: 58, box: b(-8, -56, 54, 54), kbX: 140, kbY: 120, stun: 19 },
    plunge: { startup: 7, active: 40, recovery: 14, dmg: 108, box: b(-24, -26, 56, 40), kbX: 220, kbY: 320, stun: 30, plunge: true, shake: 0.6 },
  },
  {
    id: WeaponId.DemonHand,
    name: "Demon's Hand",
    short: 'Demon',
    blurb: 'A demon arm reaches out of a magic circle and strikes far in front of her; the third claw drags the target in.',
    base: WeaponId.Scythe,
    combo: [
      // (the claw strikes ahead of her: the box starts well in front, so it is weak up close)
      { startup: 8, active: 5, recovery: 14, dmg: 70, box: b(28, -82, 72, 72), kbX: 140, kbY: 60, stun: 22, step: 20 },
      { startup: 8, active: 5, recovery: 14, dmg: 74, box: b(28, -62, 78, 58), kbX: 150, kbY: 60, stun: 22, step: 20 },
      { startup: 13, active: 7, recovery: 22, dmg: 108, box: b(20, -72, 96, 72), kbX: 260, kbY: 140, stun: 32, pull: true, shake: 0.45 },
    ],
    air: { startup: 7, active: 8, recovery: 13, dmg: 66, box: b(10, -70, 74, 74), kbX: 150, kbY: 140, stun: 22 },
  },
  {
    id: WeaponId.Rapier,
    name: "Musketeer's Rapier",
    short: 'Rapier',
    blurb: 'Long fencing thrusts that crit at the point. Hold to charge a running lunge.',
    base: WeaponId.Lance,
    combo: [
      { startup: 6, active: 3, recovery: 11, dmg: 50, box: b(10, -52, 72, 18), kbX: 120, kbY: 30, stun: 19, step: 120, tipCrit: true },
      { startup: 6, active: 3, recovery: 11, dmg: 52, box: b(10, -58, 72, 22), kbX: 120, kbY: 40, stun: 19, step: 120, tipCrit: true },
      { startup: 9, active: 5, recovery: 18, dmg: 82, box: b(8, -54, 84, 22), kbX: 280, kbY: 120, stun: 28, step: 200, tipCrit: true, shake: 0.35 },
    ],
    air: { startup: 5, active: 6, recovery: 10, dmg: 56, box: b(4, -48, 70, 24), kbX: 140, kbY: 100, stun: 19, tipCrit: true },
    charged: {
      startup: 3, active: 14, recovery: 20, dmg: 82, dmgMax: 155, box: b(4, -52, 74, 22), kbX: 380, kbY: 140, stun: 34,
      dash: 760, min: 12, max: 44, tipCrit: true, shake: 0.55,
    },
  },
  {
    id: WeaponId.Shamshir,
    name: 'Shamshir',
    short: 'Shamshir',
    blurb: 'Wide curved cuts; the third is a full spin that cuts both sides. Hits from behind crit.',
    base: WeaponId.Sword,
    combo: [
      { startup: 5, active: 4, recovery: 11, dmg: 55, box: b(2, -58, 62, 52), kbX: 140, kbY: 50, stun: 20, step: 90, backCrit: true },
      { startup: 5, active: 4, recovery: 11, dmg: 57, box: b(2, -50, 62, 46), kbX: 140, kbY: 50, stun: 20, step: 90, backCrit: true },
      { startup: 9, active: 7, recovery: 18, dmg: 84, box: b(-44, -60, 112, 56), kbX: 240, kbY: 150, stun: 28, step: 60, backCrit: true, shake: 0.4 },
    ],
    air: { startup: 5, active: 8, recovery: 10, dmg: 55, box: b(-14, -58, 64, 58), kbX: 140, kbY: 110, stun: 20, backCrit: true },
    plunge: { startup: 7, active: 40, recovery: 13, dmg: 98, box: b(-20, -24, 48, 36), kbX: 180, kbY: 260, stun: 26, plunge: true, backCrit: true },
  },
  {
    id: WeaponId.RopeDart,
    name: 'Rope Dart',
    short: 'Rope Dart',
    blurb: 'A dart on a cord lashed out at mid range; the third hooks the target back to her. Hits from behind crit.',
    base: WeaponId.Daggers,
    combo: [
      { startup: 7, active: 3, recovery: 14, dmg: 36, box: b(20, -52, 90, 18), kbX: 90, kbY: 20, stun: 17, step: 30, backCrit: true },
      { startup: 7, active: 3, recovery: 14, dmg: 38, box: b(16, -72, 94, 40), kbX: 90, kbY: 40, stun: 17, step: 30, backCrit: true },
      { startup: 10, active: 5, recovery: 19, dmg: 56, box: b(20, -54, 104, 26), kbX: 200, kbY: 60, stun: 28, pull: true, backCrit: true },
    ],
    air: { startup: 7, active: 7, recovery: 12, dmg: 40, box: b(-30, -72, 120, 72), kbX: 110, kbY: 100, stun: 17, backCrit: true },
  },
  {
    id: WeaponId.FireBreath,
    name: 'Cedar Fire',
    short: 'Fire',
    blurb: 'Gouts of fire breath that set the target burning; the third is a roaring cone of flame.',
    base: WeaponId.Hammer,
    combo: [
      { startup: 9, active: 6, recovery: 18, dmg: 52, box: b(14, -68, 76, 36), kbX: 120, kbY: 40, stun: 20, burn: 30 },
      { startup: 9, active: 6, recovery: 18, dmg: 54, box: b(14, -50, 76, 40), kbX: 120, kbY: 40, stun: 20, burn: 30 },
      { startup: 16, active: 10, recovery: 26, dmg: 86, box: b(10, -76, 110, 54), kbX: 220, kbY: 140, stun: 30, burn: 90, shake: 0.5 },
    ],
    air: { startup: 9, active: 8, recovery: 15, dmg: 50, box: b(10, -52, 76, 56), kbX: 140, kbY: 120, stun: 22, burn: 30 },
  },
  {
    id: WeaponId.SwordCane,
    name: 'Sword-Cane',
    short: 'Cane',
    blurb: 'A jab of the cane, a hook that pulls, then the hidden blade: a draw cut that crits at the tip and from behind.',
    base: WeaponId.Knives,
    combo: [
      { startup: 5, active: 3, recovery: 10, dmg: 56, box: b(8, -48, 64, 20), kbX: 120, kbY: 30, stun: 18, step: 90 },
      { startup: 6, active: 4, recovery: 11, dmg: 60, box: b(6, -42, 66, 40), kbX: 150, kbY: 40, stun: 20, step: 70, pull: true },
      { startup: 8, active: 4, recovery: 18, dmg: 98, box: b(4, -60, 76, 50), kbX: 280, kbY: 130, stun: 28, step: 160, tipCrit: true, backCrit: true, shake: 0.4 },
    ],
    air: { startup: 5, active: 6, recovery: 10, dmg: 54, box: b(-6, -54, 64, 48), kbX: 130, kbY: 100, stun: 19, backCrit: true },
    plunge: { startup: 6, active: 40, recovery: 12, dmg: 84, box: b(-12, -24, 30, 34), kbX: 160, kbY: 240, stun: 24, plunge: true, backCrit: true },
  },
  {
    id: WeaponId.Sarissa,
    name: 'Sarissa',
    short: 'Sarissa',
    blurb: 'The long Macedonian pike: the longest pokes in the game, the tip crits. Hold to charge a phalanx lunge.',
    base: WeaponId.Lance,
    combo: [
      { startup: 9, active: 5, recovery: 17, dmg: 64, box: b(20, -48, 96, 18), kbX: 230, kbY: 40, stun: 22, step: 40, tipCrit: true },
      { startup: 9, active: 5, recovery: 17, dmg: 68, box: b(20, -54, 96, 20), kbX: 230, kbY: 40, stun: 22, step: 40, tipCrit: true },
      { startup: 14, active: 6, recovery: 26, dmg: 96, box: b(16, -62, 112, 34), kbX: 340, kbY: 170, stun: 30, step: 140, tipCrit: true, shake: 0.4 },
    ],
    air: { startup: 8, active: 8, recovery: 14, dmg: 74, box: b(8, -42, 96, 22), kbX: 220, kbY: 90, stun: 22 },
    charged: {
      startup: 4, active: 18, recovery: 22, dmg: 96, dmgMax: 170, box: b(8, -50, 90, 24), kbX: 430, kbY: 170, stun: 38,
      dash: 660, min: 14, max: 50, shake: 0.6,
    },
  },
  {
    id: WeaponId.Shadow,
    name: 'Shadow of Death',
    short: 'Shadow',
    blurb: 'Her colossal shadow strikes far in front of her; the third, its bite, slows the target.',
    base: WeaponId.Scythe,
    combo: [
      { startup: 9, active: 6, recovery: 15, dmg: 80, box: b(34, -92, 80, 92), kbX: 170, kbY: 80, stun: 23 },
      { startup: 9, active: 6, recovery: 15, dmg: 84, box: b(34, -92, 80, 92), kbX: 170, kbY: 80, stun: 23 },
      { startup: 15, active: 8, recovery: 26, dmg: 118, box: b(30, -72, 108, 72), kbX: 260, kbY: 240, stun: 34, slow: 90, shake: 0.55 },
    ],
    air: { startup: 9, active: 9, recovery: 14, dmg: 72, box: b(10, -32, 90, 72), kbX: 180, kbY: 140, stun: 23 },
  },
  {
    id: WeaponId.ValkyrieSpear,
    name: 'Valkyrie Spear',
    short: 'Spear',
    blurb: 'Thrusts past the rim of the shield. Hold to hurl the spear.',
    base: WeaponId.Lance,
    combo: [
      { startup: 7, active: 4, recovery: 13, dmg: 64, box: b(14, -50, 88, 20), kbX: 200, kbY: 40, stun: 21, step: 60 },
      { startup: 7, active: 4, recovery: 13, dmg: 68, box: b(14, -56, 88, 22), kbX: 200, kbY: 40, stun: 21, step: 60 },
      { startup: 12, active: 6, recovery: 22, dmg: 102, box: b(10, -64, 92, 40), kbX: 300, kbY: 200, stun: 30, step: 120, shake: 0.4 },
    ],
    air: { startup: 7, active: 8, recovery: 13, dmg: 62, box: b(4, -42, 84, 24), kbX: 200, kbY: 90, stun: 21 },
    charged: { startup: 3, active: 1, recovery: 20, dmg: 88, dmgMax: 175, box: b(0, 0, 0, 0), kbX: 300, kbY: 120, stun: 32, arrow: true, min: 14, max: 54 },
    arrowSpeed: 1100,
  },
];

/** The weapon whose look (poses, swing effects, icon) stands in for a hero's own weapon that has none yet. */
export const lookWeapon = (w: number): WeaponId => WEAPONS[w]?.base ?? (w as WeaponId);

/**
 * A hero's special. How it works:
 *   shot  - projectiles (count fanned by spread rad, gravity for lobs, boomerang = flies back at half life)
 *   aura  - an instant burst around the hero (radius) at the end of the startup
 *   dash  - the hero lunges (vx, vy) and the body box hits once while active
 * Hit effects: dmg, kb (knockback x), kbY, stun; slow / root / burn ticks; unblockable; pierce.
 */
export interface SkillDef {
  id: SkillId;
  name: string;
  blurb: string;
  cooldown: number;
  startup: number;
  recovery: number;
  kind: 'shot' | 'aura' | 'dash';
  dmg: number;
  kb: number;
  kbY?: number;
  stun: number;
  slow?: number;
  root?: number;
  burn?: number;
  unblockable?: boolean;
  pierce?: boolean;
  // shot
  proj?: 'arrow' | 'arcane' | 'relic' | 'hand' | 'frost' | 'wave' | 'orb';
  count?: number;
  spread?: number;
  speed?: number;
  life?: number;
  gravity?: number;
  /** Launch height above the feet. */
  launchY?: number;
  boomerang?: boolean;
  // aura
  radius?: number;
  // dash
  vx?: number;
  vy?: number;
  active?: number;
}

export const SKILLS: SkillDef[] = [
  { id: SkillId.LionsRoar, name: "Lion's Roar", blurb: 'A royal war cry: a golden shockwave throws everyone close away.', cooldown: 420, startup: 9, recovery: 14,
    kind: 'aura', radius: 92, dmg: 70, kb: 420, kbY: 200, stun: 26 },
  { id: SkillId.NineLives, name: 'Nine Lives', blurb: "Three arrows dipped in the Hydra's venom, loosed at once in a fan.", cooldown: 360, startup: 10, recovery: 12,
    kind: 'shot', proj: 'arrow', count: 3, spread: 0.16, speed: 1100, life: 70, gravity: 160, dmg: 42, kb: 160, stun: 14 },
  { id: SkillId.GateShot, name: 'Gate Shot', blurb: 'A great golden gate opens behind him and launches one colossal treasured blade that pierces straight through.', cooldown: 380, startup: 8, recovery: 12,
    kind: 'shot', proj: 'relic', speed: 1150, life: 60, launchY: 32, dmg: 88, kb: 260, stun: 22, pierce: true },
  { id: SkillId.RuneLeap, name: 'Salmon Leap', blurb: 'The salmon leap his teacher Scáthach taught him: a soaring vault over the enemy, spear first.', cooldown: 360, startup: 5, recovery: 16,
    kind: 'dash', vx: 620, vy: -620, active: 22, dmg: 78, kb: 300, kbY: 220, stun: 26 },
  { id: SkillId.ChainLash, name: 'Chain Lash', blurb: 'A living chain lashes out and binds the target where it stands.', cooldown: 420, startup: 9, recovery: 14,
    kind: 'shot', proj: 'hand', speed: 1000, life: 26, launchY: 34, dmg: 48, kb: 0, stun: 20, root: 72 },
  { id: SkillId.PhantomStars, name: 'Phantom Stars', blurb: 'Three falling-star bolts that slow whatever they touch.', cooldown: 380, startup: 9, recovery: 13,
    kind: 'shot', proj: 'arcane', count: 3, spread: 0.22, speed: 760, life: 60, dmg: 34, kb: 90, stun: 12, slow: 120 },
  { id: SkillId.InkBlot, name: 'Ink Blot', blurb: 'A splash of golden ink: the target is slowed while the story catches up.', cooldown: 340, startup: 8, recovery: 12,
    kind: 'shot', proj: 'orb', speed: 620, life: 70, gravity: 700, dmg: 52, kb: 140, stun: 18, slow: 170 },
  { id: SkillId.ShadowDirk, name: 'Shadow Dirk', blurb: 'A blade thrown from the shadows: fast, and no guard stops it.', cooldown: 320, startup: 5, recovery: 10,
    kind: 'shot', proj: 'arrow', speed: 1500, life: 40, gravity: 0, dmg: 58, kb: 120, stun: 22, unblockable: true },
  { id: SkillId.FanOfKnives, name: 'Fan of Knives', blurb: 'Three knives flung in a spread, faster than the eye.', cooldown: 300, startup: 4, recovery: 10,
    kind: 'shot', proj: 'arrow', count: 3, spread: 0.2, speed: 1350, life: 34, gravity: 0, dmg: 30, kb: 80, stun: 12 },
  { id: SkillId.TerrorRoar, name: 'Terror Roar', blurb: 'Humbaba roars - a roar like the flood - and everyone near is frozen in fear.', cooldown: 480, startup: 12, recovery: 16,
    kind: 'aura', radius: 120, dmg: 30, kb: 60, stun: 36 },
  { id: SkillId.ScalpelRain, name: 'Scalpel Rain', blurb: 'Three scalpels arc through the fog; the wounds keep bleeding.', cooldown: 270, startup: 8, recovery: 12,
    kind: 'shot', proj: 'arrow', count: 3, spread: 0.18, speed: 760, life: 70, gravity: 900, launchY: 50, dmg: 42, kb: 90, stun: 12, burn: 150 },
  { id: SkillId.BucephalusCharge, name: 'Bucephalus Charge', blurb: 'A short, unstoppable charge on Bucephalus, his great black warhorse.', cooldown: 420, startup: 7, recovery: 14,
    kind: 'dash', vx: 980, vy: 0, active: 16, dmg: 82, kb: 440, kbY: 180, stun: 28 },
  { id: SkillId.PlagueHound, name: 'Plague Hound', blurb: 'A shadow hound races along the ground; its bite slows and sickens.', cooldown: 420, startup: 10, recovery: 14,
    kind: 'shot', proj: 'hand', speed: 760, life: 60, launchY: 14, dmg: 56, kb: 160, stun: 18, slow: 100, burn: 120 },
  { id: SkillId.ShieldRebound, name: 'Shield Rebound', blurb: 'The tower shield is hurled and comes spinning back.', cooldown: 360, startup: 9, recovery: 12,
    kind: 'shot', proj: 'wave', speed: 820, life: 52, launchY: 32, dmg: 60, kb: 260, stun: 22, boomerang: true },
];

/**
 * Every hero's own dodge (the Roll button; dodge N belongs to hero N). Kinds:
 *   step  - a near-instant step of `dist` along the stick (8 directions; `horizontal` = left/right only) over `ticks`;
 *           `behind`: with no direction and the opponent close, it lands behind them
 *   dash  - a fast burst along the ground (or the air) at `vx` for `ticks`
 *   leap  - a jump-dodge: `vx` (forward along the stick, or `back` = away from where the hero faces) and `vy`
 *   phase - the hero dissolves for `ticks`, drifting at `vx` with the stick, untouchable
 * All are invulnerable for `invuln` ticks; `cancel` = usable out of an attack. Air use costs an air-dash charge.
 */
export interface DodgeDef {
  name: string;
  blurb: string;
  kind: 'step' | 'dash' | 'leap' | 'phase';
  invuln: number;
  ticks: number;
  dist?: number;
  vx?: number;
  vy?: number;
  behind?: boolean;
  horizontal?: boolean;
  back?: boolean;
  cancel?: boolean;
}

export const DODGES: DodgeDef[] = [
  { name: "Lion's Step", blurb: 'A low, guarded burst step - the king never truly retreats.', kind: 'dash', vx: 720, ticks: 9, invuln: 9 },
  { name: "Hunter's Vault", blurb: 'A back-flip vault that opens the range for the bow.', kind: 'leap', vx: 430, vy: -560, back: true, ticks: 30, invuln: 11 },
  { name: 'Gate Step', blurb: 'He steps into a golden gate and out of another.', kind: 'step', dist: 140, ticks: 6, invuln: 10 },
  { name: 'Pole Vault', blurb: 'Vaults clean over the enemy on his spear.', kind: 'leap', vx: 520, vy: -700, ticks: 34, invuln: 11 },
  { name: 'Clay Shift', blurb: 'Melts into the earth and glides through it.', kind: 'dash', vx: 520, ticks: 15, invuln: 15 },
  { name: 'Mirage', blurb: 'An illusion takes the blow; she is already elsewhere.', kind: 'step', dist: 150, ticks: 3, invuln: 10 },
  { name: 'Turn of the Page', blurb: 'The page turns and he is a few lines further on.', kind: 'step', dist: 125, ticks: 5, horizontal: true, invuln: 9 },
  { name: 'Flash Step', blurb: 'There and gone in a step - behind you, if you are close.', kind: 'step', dist: 150, ticks: 4, behind: true, cancel: true, invuln: 9 },
  { name: 'Flash Step', blurb: 'Faster than the eye: any direction, out of any attack, behind you.', kind: 'step', dist: 170, ticks: 3, behind: true, cancel: true, invuln: 9 },
  { name: 'Beast Bound', blurb: 'A low, heavy pounce that carries the guardian clear.', kind: 'leap', vx: 640, vy: -380, ticks: 26, invuln: 9 },
  { name: 'Fog Form', blurb: 'He becomes the fog: nothing can touch him while it drifts.', kind: 'phase', vx: 260, ticks: 20, invuln: 20 },
  { name: 'Cavalry Dash', blurb: "A burst of the Companions' charge.", kind: 'dash', vx: 900, ticks: 10, invuln: 8 },
  { name: 'Shadow Sink', blurb: 'She sinks into her shadow and rises behind you.', kind: 'step', dist: 140, ticks: 8, behind: true, invuln: 12 },
  { name: 'Shield Slide', blurb: 'Slides forward low behind the tower shield.', kind: 'dash', vx: 640, ticks: 12, invuln: 12 },
];
export const dodgeOf = (load: { hero?: number }) => DODGES[load.hero ?? 0] ?? DODGES[0];

/** The Gate's portals, in the order they open (back from the hero, up from the feet): a fan behind his shoulders. */
export const GATE_PORTALS: [number, number][] = [[22, 46], [40, 30], [34, 66], [58, 48], [54, 80], [74, 30], [72, 66], [18, 84], [88, 50]];
export const gatePortal = (i: number, x: number, y: number, face: number): [number, number] => {
  const [b, u] = GATE_PORTALS[i % GATE_PORTALS.length];
  return [x - face * b, y - u];
};

export const SKILL_FX = {
  bomb: { speedX: 460, speedY: -420, gravity: 1300, radius: 74, dmg: 80, burnTicks: 180, burnDps: 24 },
  frost: { speed: 820, dmg: 70, slowTicks: 150, stun: 18 },
  trap: { arm: 24, life: 720, dmg: 40, root: 78, w: 34 },
  blink: { dist: 160, invuln: 16 },
} as const;

export const isWeapon = (v: unknown): v is WeaponId => Number.isInteger(v) && (v as number) >= 0 && (v as number) < WEAPON_COUNT;
export const isSkill = (v: unknown): v is SkillId => Number.isInteger(v) && (v as number) >= 0 && (v as number) < SKILL_COUNT;

export interface Loadout {
  /** Slot A is always the hero's class signature weapon. */
  weapons: [WeaponId, WeaponId];
  skill: SkillId;
  /** Fighter class (classes.ts ClassId), derived from the hero. */
  cls: number;
  /** Hero (heroes.ts). */
  hero: number;
}
