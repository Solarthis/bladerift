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
}
export const WEAPON_COUNT = 8;

export const enum SkillId {
  Bomb = 0,
  Frost = 1,
  Trap = 2,
  Blink = 3,
}
export const SKILL_COUNT = 4;

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
      { startup: 7, active: 5, recovery: 12, dmg: 70, box: b(4, -52, 48, 46), kbX: 170, kbY: 60, stun: 22, step: 90 },
      { startup: 7, active: 5, recovery: 12, dmg: 75, box: b(4, -52, 48, 46), kbX: 180, kbY: 60, stun: 22, step: 90 },
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
];

export interface SkillDef {
  id: SkillId;
  name: string;
  blurb: string;
  cooldown: number;
  startup: number;
  recovery: number;
}

export const SKILLS: SkillDef[] = [
  { id: SkillId.Bomb, name: 'Fire Bomb', blurb: 'Lobbed bomb. Explodes and sets the target burning.', cooldown: 420, startup: 10, recovery: 12 },
  { id: SkillId.Frost, name: 'Frost Shard', blurb: 'Fast ice bolt. Slows the target for 2.5 s.', cooldown: 360, startup: 9, recovery: 12 },
  { id: SkillId.Trap, name: 'Snare Trap', blurb: 'Set at your feet. Roots whoever steps in.', cooldown: 540, startup: 12, recovery: 10 },
  { id: SkillId.Blink, name: 'Blink', blurb: 'Teleport forward, untouchable for a moment.', cooldown: 300, startup: 4, recovery: 10 },
];

export const SKILL_FX = {
  bomb: { speedX: 460, speedY: -420, gravity: 1300, radius: 74, dmg: 80, burnTicks: 180, burnDps: 24 },
  frost: { speed: 820, dmg: 70, slowTicks: 150, stun: 18 },
  trap: { arm: 24, life: 720, dmg: 40, root: 78, w: 34 },
  blink: { dist: 160, invuln: 16 },
} as const;

export const isWeapon = (v: unknown): v is WeaponId => Number.isInteger(v) && (v as number) >= 0 && (v as number) < WEAPON_COUNT;
export const isSkill = (v: unknown): v is SkillId => Number.isInteger(v) && (v as number) >= 0 && (v as number) < SKILL_COUNT;

export interface Loadout {
  /** Slot A is always the class's signature weapon. */
  weapons: [WeaponId, WeaponId];
  skill: SkillId;
  /** Fighter class (classes.ts ClassId). */
  cls: number;
}

/** Signature weapon of each class (classes.ts keeps the full class table; repeated here to avoid an import cycle). */
const SIGNATURE: WeaponId[] = [WeaponId.Sword, WeaponId.Bow, WeaponId.Lance, WeaponId.Staff, WeaponId.Daggers, WeaponId.Hammer, WeaponId.Shield];

export const DEFAULT_LOADOUT: Loadout = { weapons: [WeaponId.Sword, WeaponId.Bow], skill: SkillId.Bomb, cls: 0 };

export function sanitizeLoadout(v: unknown): Loadout {
  const o = (v && typeof v === 'object' ? v : {}) as { weapons?: unknown[]; skill?: unknown; cls?: unknown };
  const cls = Number.isInteger(o.cls) && (o.cls as number) >= 0 && (o.cls as number) < SIGNATURE.length ? (o.cls as number) : 0;
  const w0 = SIGNATURE[cls];
  let w1 = isWeapon(o.weapons?.[1]) ? o.weapons![1] as WeaponId : DEFAULT_LOADOUT.weapons[1];
  if (w1 === w0) w1 = w0 === WeaponId.Bow ? WeaponId.Daggers : WeaponId.Bow;
  return { weapons: [w0, w1], skill: isSkill(o.skill) ? o.skill : DEFAULT_LOADOUT.skill, cls };
}
