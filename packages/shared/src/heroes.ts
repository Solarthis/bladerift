/**
 * The roster: fourteen original heroes, a True and a False champion for each class (plus a Warden). A hero fixes the
 * class (stats, signature weapon) and the Rift Art; colours and costume pieces are cosmetic (client). The loadout's
 * second weapon and skill stay the player's choice.
 */
import { ArtId, ClassId } from './classes';
import { isWeapon, Loadout, SkillId, WeaponId } from './weapons';

export interface HeroDef {
  id: number;
  name: string;
  epithet: string;
  /** Which champion of the class: the True one, the False one, or an extra. */
  slot: 'True' | 'False' | 'Extra';
  cls: ClassId;
  art: ArtId;
  /** Armour and accent colours (0xRRGGBB) and costume pieces drawn over the pixel rig (client: render/costumes.ts). */
  armor: number;
  accent: number;
  costume: string[];
  /** Index into the portrait sheets (portraits-1: 0-7, portraits-2: 8-13). */
  portrait: number;
  lore: string;
}

export const HEROES: HeroDef[] = [
  { id: 0, name: 'Richard Lionheart', epithet: 'the Crusader King', slot: 'True', cls: ClassId.Saber, art: ArtId.RadiantCleave, armor: 0xe8e2d0, accent: 0xd8a030, costume: ['hairGold', 'crown', 'cape'], portrait: 0,
    lore: 'A crusader king who charged into every battle first. His blade still remembers the sun.' },
  { id: 1, name: 'Alcides', epithet: 'the Fallen Hero', slot: 'True', cls: ClassId.Archer, art: ArtId.HailOfArrows, armor: 0x5a3a30, accent: 0xffa040, costume: ['hairBlackLong', 'chains', 'scarfRed'], portrait: 1,
    lore: 'A giant hunter bound in the chains of his own curse. Every arrow he looses is a debt repaid.' },
  { id: 2, name: 'Gilgamesh', epithet: 'King of Uruk', slot: 'False', cls: ClassId.Archer, art: ArtId.VaultOfAges, armor: 0xe0b030, accent: 0xff3a3a, costume: ['hairGold', 'pauldrons'], portrait: 2,
    lore: 'He owns every treasure ever forged and lends them to his foes - point first.' },
  { id: 3, name: 'Cú Chulainn', epithet: 'Hound of Ulster', slot: 'True', cls: ClassId.Lancer, art: ArtId.PiercingFang, armor: 0x2a3048, accent: 0x7ae8f5, costume: ['hairBlack', 'coat'], portrait: 3,
    lore: 'Drowned spirits drift around him like jellyfish. His spear is the tide coming in.' },
  { id: 4, name: 'Enkidu', epithet: 'the Clay-Born', slot: 'False', cls: ClassId.Lancer, art: ArtId.ChainsOfGenesis, armor: 0xd8e0d0, accent: 0xffd84a, costume: ['hairGreenLong', 'chains'], portrait: 4,
    lore: 'Shaped from the first clay, it fights with living chains that remember how to bind gods.' },
  { id: 5, name: 'François Prelati', epithet: 'the Illusionist', slot: 'True', cls: ClassId.Caster, art: ArtId.ThunderCall, armor: 0xb03040, accent: 0xf5a0e0, costume: ['hairPink', 'coat'], portrait: 5,
    lore: 'Nothing you see near her is quite real. The falling stars, unfortunately, are.' },
  { id: 6, name: 'Alexandre Dumas', epithet: 'the Storyteller', slot: 'False', cls: ClassId.Caster, art: ArtId.RewrittenFate, armor: 0xe8e0d0, accent: 0xff8a2a, costume: ['hairOrange', 'book'], portrait: 6,
    lore: 'A writer who never lets a hero die in the wrong chapter - least of all himself.' },
  { id: 7, name: 'Hassan', epithet: 'Old Man of the Mountain', slot: 'True', cls: ClassId.Assassin, art: ArtId.PhantomHand, armor: 0x2a2a30, accent: 0x7affd0, costume: ['skullMask', 'hood'], portrait: 7,
    lore: 'Behind the bone mask there is only the hand - and the hand always finds you.' },
  { id: 8, name: 'Hashashin', epithet: 'the Nameless Blade', slot: 'False', cls: ClassId.Assassin, art: ArtId.FlashStep, armor: 0x2e2a5a, accent: 0x3ce0f5, costume: ['hood', 'maskCloth'], portrait: 8,
    lore: 'You never see her coming. You see her leaving, and then the cuts arrive.' },
  { id: 9, name: 'Humbaba', epithet: 'Guardian of the Cedar Forest', slot: 'True', cls: ClassId.Berserker, art: ArtId.BloodFrenzy, armor: 0x6a6a72, accent: 0xff2a2a, costume: ['mane', 'horns', 'eyesRed'], portrait: 9,
    lore: 'Iron, beast and fury stitched into one engine that only knows how to go forward.' },
  { id: 10, name: 'Jack the Ripper', epithet: 'the Faceless', slot: 'False', cls: ClassId.Berserker, art: ArtId.GrimFog, armor: 0x4a5060, accent: 0xc8d0e0, costume: ['cap', 'coat'], portrait: 10,
    lore: 'A polite stranger in a grey coat. Then the fog rolls in and nobody remembers his face.' },
  { id: 11, name: 'Alexander', epithet: 'the Conqueror', slot: 'True', cls: ClassId.Rider, art: ArtId.Stampede, armor: 0x2a3a6a, accent: 0xff5a1a, costume: ['hairRed', 'cape'], portrait: 11,
    lore: 'Where his burning steed has galloped, the ground stays warm for a hundred years.' },
  { id: 12, name: 'Pale Rider', epithet: 'the Shadow of Death', slot: 'False', cls: ClassId.Rider, art: ArtId.NightHunt, armor: 0x5a4a3a, accent: 0xb07aff, costume: ['hairBrown', 'scarfRed'], portrait: 12,
    lore: 'A quiet girl and the colossal shadow that follows her. Only one of them is gentle.' },
  { id: 13, name: 'Brynhildr', epithet: 'the Shield-Maiden', slot: 'Extra', cls: ClassId.Shielder, art: ArtId.Bulwark, armor: 0x2a8a90, accent: 0xd8e0f0, costume: ['hairSilver'], portrait: 13,
    lore: 'She has never taken a step back. The wall she carries makes sure of it.' },
];
export const HERO_COUNT = HEROES.length;

export const heroOf = (h: number): HeroDef => HEROES[h] ?? HEROES[0];
/** The Rift Art a loadout fights with (its hero's). */
export const artIdOf = (load: { hero?: number; cls: number }) => heroOf(load.hero ?? 0).art;

/** Signature weapon per class (ClassId order). */
/** Heroes whose weapon is their own rather than their class's (Gilgamesh fights with the Gate, not a bow). */
const HERO_WEAPON: Partial<Record<number, WeaponId>> = { 2: WeaponId.Gate };
const SIGNATURE: WeaponId[] = [WeaponId.Sword, WeaponId.Bow, WeaponId.Lance, WeaponId.Staff, WeaponId.Daggers, WeaponId.Hammer, WeaponId.Shield, WeaponId.Scythe];
/** The weapon a hero fights with: its own (Gilgamesh's Gate) or its class's signature weapon. */
export const heroWeapon = (hero: number) => HERO_WEAPON[hero] ?? SIGNATURE[HEROES[hero]?.cls ?? 0];

export const DEFAULT_LOADOUT: Loadout = { weapons: [WeaponId.Sword, WeaponId.Sword], skill: 0, cls: ClassId.Saber, hero: 0 };

/** Validate an untrusted loadout: the hero fixes the class and the kit (the signature weapon in both slots: A light, B heavy). */
export function sanitizeLoadout(v: unknown): Loadout {
  const o = (v && typeof v === 'object' ? v : {}) as { weapons?: unknown[]; skill?: unknown; hero?: unknown; cls?: unknown };
  let hero = Number.isInteger(o.hero) && (o.hero as number) >= 0 && (o.hero as number) < HERO_COUNT ? (o.hero as number) : -1;
  // older clients sent a class only: its first hero
  if (hero < 0) {
    const cls = Number.isInteger(o.cls) ? (o.cls as number) : 0;
    hero = Math.max(0, HEROES.findIndex((h) => h.cls === cls));
  }
  const cls = HEROES[hero].cls;
  const w0 = HERO_WEAPON[hero] ?? SIGNATURE[cls];
  // the kit: the hero's own weapon and its own signature special (skill N belongs to hero N)
  return { weapons: [w0, w0], skill: hero as SkillId, cls, hero };
}
