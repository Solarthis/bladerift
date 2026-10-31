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
}
export const WEAPON_COUNT = 9;

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
  /** Falls fast while active and ends on landing (air only). */
  plunge?: boolean;
  /** Dashes forward at this speed while active (lance lunge). */
  dash?: number;
  /** Fires a projectile on the first active tick instead of using the box. */
  arrow?: boolean;
  /** The projectile is an arcane bolt (staff) or, charged, an exploding orb, instead of an arrow. */
  arcane?: boolean;
  /** Treasured blades fired from portals behind the hero (the Gate): `blades` of them (the charged move: 2 up to 9). */
  gate?: boolean;
  blades?: number;
  /** Screen shake strength for the client (0..1). */
  shake?: number;
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
      { startup: 6, active: 5, recovery: 11, dmg: 76, box: b(4, -52, 60, 46), kbX: 170, kbY: 60, stun: 22, step: 90 },
      { startup: 6, active: 5, recovery: 11, dmg: 80, box: b(4, -52, 60, 46), kbX: 180, kbY: 60, stun: 22, step: 90 },
      { startup: 12, active: 6, recovery: 22, dmg: 115, box: b(2, -66, 52, 64), kbX: 170, kbY: 520, stun: 34, step: 120, shake: 0.4 },
    ],
    air: { startup: 6, active: 8, recovery: 12, dmg: 70, box: b(-6, -56, 56, 54), kbX: 170, kbY: 140, stun: 22 },
    plunge: { startup: 9, active: 40, recovery: 16, dmg: 110, box: b(-18, -24, 46, 38), kbX: 230, kbY: 320, stun: 30, plunge: true, shake: 0.5 },
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
      { startup: 9, active: 5, recovery: 14, dmg: 80, box: b(12, -44, 78, 18), kbX: 230, kbY: 40, stun: 22, step: 60 },
      { startup: 9, active: 5, recovery: 14, dmg: 85, box: b(12, -44, 78, 18), kbX: 230, kbY: 40, stun: 22, step: 60 },
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
      { startup: 18, active: 6, recovery: 24, dmg: 150, box: b(2, -72, 58, 72), kbX: 290, kbY: 110, stun: 36, step: 50, shake: 0.45 },
      { startup: 18, active: 6, recovery: 24, dmg: 160, box: b(2, -72, 58, 72), kbX: 290, kbY: 110, stun: 36, step: 50, shake: 0.45 },
      { startup: 26, active: 6, recovery: 34, dmg: 220, box: b(-56, -34, 176, 34), kbX: 220, kbY: 440, stun: 46, breaksGuard: true, shake: 0.9 },
    ],
    air: { startup: 12, active: 8, recovery: 18, dmg: 140, box: b(-12, -62, 64, 70), kbX: 230, kbY: 120, stun: 30, shake: 0.4 },
    plunge: { startup: 12, active: 40, recovery: 24, dmg: 190, box: b(-40, -28, 100, 40), kbX: 260, kbY: 380, stun: 40, plunge: true, breaksGuard: true, shake: 0.9 },
  },
  {
    id: WeaponId.Bow,
    name: 'Hunter Bow',
    short: 'Bow',
    blurb: 'Arrows from range. Hold to draw a heavy, fast shot.',
    combo: [{ startup: 8, active: 1, recovery: 14, dmg: 60, box: b(0, 0, 0, 0), kbX: 140, kbY: 40, stun: 16, arrow: true }],
    air: { startup: 7, active: 1, recovery: 12, dmg: 55, box: b(0, 0, 0, 0), kbX: 140, kbY: 40, stun: 16, arrow: true },
    charged: { startup: 2, active: 1, recovery: 16, dmg: 70, dmgMax: 150, box: b(0, 0, 0, 0), kbX: 260, kbY: 80, stun: 30, arrow: true, min: 12, max: 60 },
    arrowSpeed: 880,
  },
  {
    id: WeaponId.Shield,
    name: 'Tower Shield',
    short: 'Shield',
    blurb: 'Hold to block. Block at the last moment to parry; tap to bash.',
    combo: [{ startup: 5, active: 5, recovery: 16, dmg: 50, box: b(2, -52, 32, 48), kbX: 300, kbY: 60, stun: 40, step: 140, shake: 0.3 }],
    air: { startup: 5, active: 6, recovery: 12, dmg: 45, box: b(2, -52, 32, 48), kbX: 260, kbY: 80, stun: 30 },
    block: true,
  },
  {
    id: WeaponId.Staff,
    name: 'Arcane Staff',
    short: 'Staff',
    blurb: 'Quick arcane bolts at range; hold to conjure an orb that bursts on impact.',
    combo: [
      { startup: 7, active: 1, recovery: 12, dmg: 48, box: b(0, 0, 0, 0), kbX: 120, kbY: 40, stun: 14, arrow: true, arcane: true },
      { startup: 7, active: 1, recovery: 12, dmg: 50, box: b(0, 0, 0, 0), kbX: 120, kbY: 40, stun: 14, arrow: true, arcane: true },
      { startup: 9, active: 1, recovery: 20, dmg: 66, box: b(0, 0, 0, 0), kbX: 220, kbY: 120, stun: 24, arrow: true, arcane: true },
    ],
    air: { startup: 6, active: 1, recovery: 12, dmg: 44, box: b(0, 0, 0, 0), kbX: 120, kbY: 60, stun: 14, arrow: true, arcane: true },
    charged: { startup: 3, active: 1, recovery: 20, dmg: 90, dmgMax: 170, box: b(0, 0, 0, 0), kbX: 280, kbY: 220, stun: 32, arrow: true, arcane: true, min: 14, max: 60 },
    arrowSpeed: 640,
  },
  {
    id: WeaponId.Gate,
    name: 'Gate of Treasures',
    short: 'Gate',
    blurb: 'Golden portals open behind him and fire treasured blades. Hold to open more gates: up to nine blades at once.',
    combo: [
      { startup: 7, active: 1, recovery: 12, dmg: 46, box: b(0, 0, 0, 0), kbX: 130, kbY: 40, stun: 15, arrow: true, gate: true, blades: 1 },
      { startup: 8, active: 1, recovery: 16, dmg: 32, box: b(0, 0, 0, 0), kbX: 150, kbY: 60, stun: 15, arrow: true, gate: true, blades: 2 },
    ],
    air: { startup: 6, active: 1, recovery: 12, dmg: 40, box: b(0, 0, 0, 0), kbX: 130, kbY: 40, stun: 14, arrow: true, gate: true, blades: 1 },
    // per blade: the count grows with the hold (2 at the threshold, 9 at full)
    charged: { startup: 3, active: 1, recovery: 20, dmg: 24, dmgMax: 26, box: b(0, 0, 0, 0), kbX: 200, kbY: 90, stun: 18, arrow: true, gate: true, min: 10, max: 60 },
    arrowSpeed: 1050,
  },
];

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
  { id: SkillId.NineLives, name: 'Nine Lives', blurb: 'Three ember arrows loosed at once in a fan.', cooldown: 360, startup: 10, recovery: 12,
    kind: 'shot', proj: 'arrow', count: 3, spread: 0.16, speed: 1100, life: 70, gravity: 160, dmg: 42, kb: 160, stun: 14 },
  { id: SkillId.GateShot, name: 'Gate Shot', blurb: 'A golden gate opens and fires one treasured blade straight through.', cooldown: 380, startup: 8, recovery: 12,
    kind: 'shot', proj: 'relic', speed: 1150, life: 60, launchY: 32, dmg: 88, kb: 260, stun: 22, pierce: true },
  { id: SkillId.RuneLeap, name: 'Rune Leap', blurb: 'A rune-fired leap over the enemy, spear first.', cooldown: 360, startup: 5, recovery: 16,
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
  { id: SkillId.TerrorRoar, name: 'Terror Roar', blurb: 'The chimera roars: everyone near is frozen in fear.', cooldown: 480, startup: 12, recovery: 16,
    kind: 'aura', radius: 120, dmg: 30, kb: 60, stun: 54 },
  { id: SkillId.ScalpelRain, name: 'Scalpel Rain', blurb: 'Three scalpels arc through the fog; the wounds keep bleeding.', cooldown: 360, startup: 8, recovery: 12,
    kind: 'shot', proj: 'arrow', count: 3, spread: 0.18, speed: 760, life: 70, gravity: 900, launchY: 50, dmg: 32, kb: 90, stun: 12, burn: 150 },
  { id: SkillId.BucephalusCharge, name: 'Bucephalus Charge', blurb: 'A short, unstoppable charge on the great warhorse.', cooldown: 420, startup: 7, recovery: 14,
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
  { name: 'Beast Bound', blurb: 'A low, heavy pounce that carries the chimera clear.', kind: 'leap', vx: 640, vy: -380, ticks: 26, invuln: 9 },
  { name: 'Fog Form', blurb: 'He becomes the fog: nothing can touch him while it drifts.', kind: 'phase', vx: 260, ticks: 20, invuln: 20 },
  { name: 'Cavalry Dash', blurb: "A burst of the conqueror's charge.", kind: 'dash', vx: 900, ticks: 10, invuln: 8 },
  { name: 'Shadow Sink', blurb: 'She sinks into her shadow and rises behind you.', kind: 'step', dist: 140, ticks: 8, behind: true, invuln: 12 },
  { name: 'Shield Slide', blurb: 'Slides forward low behind the tower shield.', kind: 'dash', vx: 640, ticks: 12, invuln: 12 },
];
export const dodgeOf = (load: { hero?: number }) => DODGES[load.hero ?? 0] ?? DODGES[0];

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
