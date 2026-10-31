/**
 * Fighter classes (Saber, Archer, Lancer, Caster, Assassin, Berserker, Shielder): how a fighter moves and how hard it
 * hits, its signature weapon (always in slot A) and its Rift Art - a class special charged on the Rift gauge. The class
 * lives in the fighter's state (`cls`), so the client predicts class movement exactly like everything else.
 */
import { WeaponId } from './weapons';

export const enum ClassId {
  Saber = 0,
  Archer = 1,
  Lancer = 2,
  Caster = 3,
  Assassin = 4,
  Berserker = 5,
  Shielder = 6,
  Rider = 7,
}
export const CLASS_COUNT = 8;

export const enum ArtId {
  RadiantCleave = 0,
  HailOfArrows = 1,
  PiercingFang = 2,
  ThunderCall = 3,
  FlashStep = 4,
  BloodFrenzy = 5,
  Bulwark = 6,
  VaultOfAges = 7,
  ChainsOfGenesis = 8,
  RewrittenFate = 9,
  PhantomHand = 10,
  GrimFog = 11,
  Stampede = 12,
  NightHunt = 13,
}

export interface ArtDef {
  id: ArtId;
  name: string;
  blurb: string;
  /** Ticks of the art's own action (the fighter is busy; the art plays out). */
  ticks: number;
}

export interface ClassDef {
  id: ClassId;
  name: string;
  /** One-line identity for the menus. */
  title: string;
  blurb: string;
  signature: WeaponId;
  art: ArtId;
  /** Max health. */
  hp: number;
  /** Damage dealt multiplier. */
  dmg: number;
  /** Run, roll and dash speed multiplier. */
  speed: number;
  /** Extra jumps in the air (1 = double jump). */
  airJumps: number;
  /** Air dashes per airtime. */
  dashes: number;
  /** Roll cooldown multiplier. */
  rollCd: number;
  /** Attack recovery multiplier (lower = faster follow-ups). */
  recovery: number;
  /** Crit multiplier for hits from behind (every hit from behind for the assassin, else backCrit weapons only). */
  backstab: number;
  /** Damage taken through a block multiplier. */
  chip: number;
  /** Skill cooldown multiplier. */
  skillCd: number;
  /** Arrow speed multiplier. */
  arrowSpeed: number;
  /** Stat bars for the menus, 1-5. */
  bars: { power: number; speed: number; health: number; reach: number };
}

export const ARTS: ArtDef[] = [
  { id: ArtId.RadiantCleave, name: 'Radiant Cleave', blurb: 'Gathers sunlight into the blade and hurls a crescent wave across the arena.', ticks: 40 },
  { id: ArtId.HailOfArrows, name: 'Serpent Rain', blurb: 'Looses a volley skyward that rains down around the opponent.', ticks: 30 },
  { id: ArtId.PiercingFang, name: 'Abyss Fang', blurb: 'An unstoppable lunge across the arena that ignores guards.', ticks: 44 },
  { id: ArtId.ThunderCall, name: 'Starfall', blurb: 'Calls three falling stars down on the opponent\'s position.', ticks: 36 },
  { id: ArtId.FlashStep, name: 'Flash Step', blurb: 'Untouchable: vanish, reappear behind the opponent and unleash a six-cut flurry. Use it as a counter mid-attack.', ticks: 54 },
  { id: ArtId.BloodFrenzy, name: 'Blood Frenzy', blurb: 'Six seconds of rage: hits cannot stagger you, you hit harder and recover faster.', ticks: 24 },
  { id: ArtId.Bulwark, name: 'Bulwark', blurb: 'Two seconds untouchable behind a barrier that reflects projectiles and shoves attackers back.', ticks: 120 },
  { id: ArtId.VaultOfAges, name: 'Vault of Ages', blurb: 'Rift portals open behind him and fire a storm of legendary weapons.', ticks: 50 },
  { id: ArtId.ChainsOfGenesis, name: 'Chains of Genesis', blurb: 'Living chains burst from the ground under the opponent and bind them fast.', ticks: 30 },
  { id: ArtId.RewrittenFate, name: 'Rewritten Fate', blurb: 'Rewrites the chapter: heals over a quarter of health and empowers every blow for eight seconds.', ticks: 30 },
  { id: ArtId.PhantomHand, name: 'Phantom Hand', blurb: 'A spectral claw races along the ground, snatches the opponent even out of a roll or a jump, and crushes them, feeding its master.', ticks: 28 },
  { id: ArtId.GrimFog, name: 'Grim Fog', blurb: 'Vanishes into fog: unseen by the opponent for six seconds, and the first blow from the fog lands as a devastating crit.', ticks: 20 },
  { id: ArtId.Stampede, name: 'Stampede', blurb: 'A burning warhorse thunders across the arena, trampling and setting the opponent alight.', ticks: 36 },
  { id: ArtId.NightHunt, name: 'Night Hunt', blurb: 'Leaps onto the opponent with the shadow hound and slams down with it.', ticks: 50 },
];

export const CLASSES: ClassDef[] = [
  {
    id: ClassId.Saber, name: 'Saber', title: 'The knight of the blade', signature: WeaponId.Sword, art: ArtId.RadiantCleave,
    blurb: 'The balanced swordmaster. Sturdy, steady, dangerous at every range with Radiant Cleave.',
    hp: 1050, dmg: 1.12, speed: 1, airJumps: 1, dashes: 1, rollCd: 1, recovery: 0.95, backstab: 1.5, chip: 0.8, skillCd: 1, arrowSpeed: 1,
    bars: { power: 4, speed: 3, health: 4, reach: 3 },
  },
  {
    id: ClassId.Archer, name: 'Archer', title: 'Death from afar', signature: WeaponId.Bow, art: ArtId.HailOfArrows,
    blurb: 'Light on its feet, arrows fly faster and further. Keep your distance and make them come to you.',
    hp: 1020, dmg: 1.0, speed: 1.12, airJumps: 1, dashes: 1, rollCd: 0.8, recovery: 0.95, backstab: 1.5, chip: 1, skillCd: 0.9, arrowSpeed: 1.3,
    bars: { power: 3, speed: 4, health: 2, reach: 5 },
  },
  {
    id: ClassId.Lancer, name: 'Lancer', title: 'The hound of the spear', signature: WeaponId.Lance, art: ArtId.PiercingFang,
    blurb: 'Fast and long-reaching. Pokes from outside your range and closes the gap in a heartbeat.',
    hp: 880, dmg: 1, speed: 1.1, airJumps: 1, dashes: 1, rollCd: 0.85, recovery: 0.9, backstab: 1.5, chip: 1, skillCd: 1, arrowSpeed: 1,
    bars: { power: 3, speed: 4, health: 3, reach: 5 },
  },
  {
    id: ClassId.Caster, name: 'Caster', title: 'Weaver of the rift', signature: WeaponId.Staff, art: ArtId.ThunderCall,
    blurb: 'A mage: arcane bolts from the staff, skills recharge twice as fast. Frail if caught.',
    hp: 1000, dmg: 0.85, speed: 1, airJumps: 1, dashes: 1, rollCd: 1, recovery: 1, backstab: 1.5, chip: 1.1, skillCd: 0.5, arrowSpeed: 1,
    bars: { power: 4, speed: 3, health: 2, reach: 4 },
  },
  {
    id: ClassId.Assassin, name: 'Assassin', title: 'Gone before the blade lands', signature: WeaponId.Daggers, art: ArtId.FlashStep,
    blurb: 'Blindingly swift: triple jump, two air dashes, quick rolls and recoveries, brutal backstabs. Hits lighter and breaks easily.',
    hp: 920, dmg: 0.92, speed: 1.3, airJumps: 2, dashes: 2, rollCd: 0.5, recovery: 0.75, backstab: 1.9, chip: 1.2, skillCd: 0.9, arrowSpeed: 1,
    bars: { power: 2, speed: 5, health: 1, reach: 1 },
  },
  {
    id: ClassId.Berserker, name: 'Berserker', title: 'Every wound a reason', signature: WeaponId.Hammer, art: ArtId.BloodFrenzy,
    blurb: 'Slow and brutal: hits 20% harder, 40% harder below a third of health. Heavy rolls.',
    hp: 1050, dmg: 1.15, speed: 0.88, airJumps: 1, dashes: 1, rollCd: 1.35, recovery: 1.1, backstab: 1.5, chip: 1, skillCd: 1.1, arrowSpeed: 1,
    bars: { power: 5, speed: 2, health: 5, reach: 2 },
  },
  {
    id: ClassId.Shielder, name: 'Shielder', title: 'The wall that walks', signature: WeaponId.Shield, art: ArtId.Bulwark,
    blurb: 'The guardian: huge health, wider parry timing, chip damage halved. Bulwark turns the tables.',
    hp: 1250, dmg: 0.9, speed: 0.92, airJumps: 1, dashes: 1, rollCd: 1.1, recovery: 1, backstab: 1.5, chip: 0.5, skillCd: 1, arrowSpeed: 1,
    bars: { power: 2, speed: 2, health: 5, reach: 2 },
  },
  {
    id: ClassId.Rider, name: 'Rider', title: 'Master of the charge', signature: WeaponId.Scythe, art: ArtId.Stampede,
    blurb: 'Fast and far-reaching: rides the arena, sweeps wide with a war scythe and tramples with a summoned mount.',
    hp: 980, dmg: 0.93, speed: 1.2, airJumps: 1, dashes: 2, rollCd: 0.8, recovery: 0.95, backstab: 1.5, chip: 1, skillCd: 1, arrowSpeed: 1,
    bars: { power: 3, speed: 4, health: 3, reach: 4 },
  },
];

/** Rift gauge: fills to RIFT_MAX over RIFT_PASSIVE ticks on its own, faster by dealing and taking damage. */
export const RIFT = {
  max: 1000,
  /** Points per tick on its own (full in ~40 s). */
  passive: 1000 / (40 * 60),
  /** Points per point of damage dealt / taken. */
  perDealt: 0.9,
  perTaken: 0.6,
} as const;

export const classOf = (c: number): ClassDef => CLASSES[c] ?? CLASSES[0];
export const artOf = (c: number): ArtDef => ARTS[classOf(c).art];
export const isClass = (v: unknown): v is ClassId => Number.isInteger(v) && (v as number) >= 0 && (v as number) < CLASS_COUNT;
export const sanitizeClass = (v: unknown): ClassId => (isClass(v) ? v : ClassId.Saber);
