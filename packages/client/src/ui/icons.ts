import { heroOf, lookWeapon, stanceLookOf, STANCE_WEAPON, weaponLookOf, WeaponId } from '@bladerift/shared';

// Square framed icons (tools/art-gen: icons-gear / icons-abilities sheets, sliced by slice.py).
const W: Record<number, string> = {
  [WeaponId.Sword]: 'g-sword',
  [WeaponId.Scythe]: 'g-scythe',
  [WeaponId.Lance]: 'g-lance',
  [WeaponId.Daggers]: 'g-daggers',
  [WeaponId.Hammer]: 'g-hammer',
  [WeaponId.Bow]: 'g-bow',
  [WeaponId.Shield]: 'g-shield',
  [WeaponId.Staff]: 'g-staff',
  [WeaponId.Gate]: 'g-gate',
  // the stance weapons (s-00.jpg .. s-13.jpg, by hero id; icons-stances sheet)
  ...Object.fromEntries(STANCE_WEAPON.map((w, hero) => [w, `s-${String(hero).padStart(2, '0')}`])),
};
/** Each hero's special has its own painted icon (k-00.jpg .. k-13.jpg, by skill id = hero id); i-art until it exists. */
const S: Record<number, string> = Object.fromEntries(Array.from({ length: 14 }, (_, i) => [i, `k-${String(i).padStart(2, '0')}`]));
// every Rift Art, in ArtId order (icons-abilities + icons-arts2 sheets)
const ARTS = ['a-cleave', 'a-hail', 'a-fang', 'a-thunder', 'a-flash', 'a-frenzy', 'a-bulwark', 'a-vault', 'a-chains', 'a-fate', 'a-hand', 'a-fog', 'a-stampede', 'a-hunt'];
const CRESTS = ['c-saber', 'c-archer', 'c-lancer', 'c-caster', 'c-assassin', 'c-berserker', 'c-shielder'];

const art = (n: string) => `assets/art/${n}.jpg`;
export const weaponIcon = (w: number) => art(W[w] ?? W[lookWeapon(w)] ?? 'g-sword');
/** A hero's own weapon icon (Jack's surgical knives, Alexander's kopis, Enkidu's chains...). */
export const heroWeaponIcon = (hero: number) => art(weaponLookOf(hero).icon);
/** A hero's second-stance weapon icon (heroes.ts STANCE_LOOKS). */
export const stanceWeaponIcon = (hero: number) => art(stanceLookOf(hero).icon);
/** The icon of the weapon a hero has in hand in a stance (0 its first weapon, 1 its second). */
export const heroStanceIcon = (hero: number, stance: number) => (stance ? stanceWeaponIcon(hero) : heroWeaponIcon(hero));
export const skillIcon = (s: number) => art(S[s] ?? 'i-art');
/** Each hero's own dodge (d-00.jpg .. d-13.jpg, by hero id; icons-dodges sheet); the generic roll until it exists. */
export const dodgeIcon = (hero: number) => art(hero >= 0 && hero < 14 ? `d-${String(hero).padStart(2, '0')}` : 'i-roll');
/** A Rift Art's own icon (by ArtId). */
export const artIconOf = (id: number) => art(ARTS[id] ?? 'i-art');
/** The icon of a hero's signature Rift Art. */
export const heroArtIcon = (hero: number) => artIconOf(heroOf(hero).art);
export const crestIcon = (cls: number) => art(CRESTS[cls] ?? 'c-blank');
export const ICON = { jump: art('i-jump'), roll: art('i-roll'), heal: art('i-heal'), art: art('i-art'), attack: art('i-attack') };
