import { heroOf, SkillId, WeaponId } from '@bladerift/shared';

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
};
const S: Record<number, string> = {
  [SkillId.Bomb]: 'k-bomb',
  [SkillId.Frost]: 'k-frost',
  [SkillId.Trap]: 'k-trap',
  [SkillId.Blink]: 'k-blink',
};
// every Rift Art, in ArtId order (icons-abilities + icons-arts2 sheets)
const ARTS = ['a-cleave', 'a-hail', 'a-fang', 'a-thunder', 'a-flash', 'a-frenzy', 'a-bulwark', 'a-vault', 'a-chains', 'a-fate', 'a-hand', 'a-fog', 'a-stampede', 'a-hunt'];
const CRESTS = ['c-saber', 'c-archer', 'c-lancer', 'c-caster', 'c-assassin', 'c-berserker', 'c-shielder'];

const art = (n: string) => `assets/art/${n}.jpg`;
export const weaponIcon = (w: number) => art(W[w] ?? 'g-sword');
export const skillIcon = (s: number) => art(S[s] ?? 'k-bomb');
/** A Rift Art's own icon (by ArtId). */
export const artIconOf = (id: number) => art(ARTS[id] ?? 'i-art');
/** The icon of a hero's signature Rift Art. */
export const heroArtIcon = (hero: number) => artIconOf(heroOf(hero).art);
export const crestIcon = (cls: number) => art(CRESTS[cls] ?? 'c-blank');
export const ICON = { jump: art('i-jump'), roll: art('i-roll'), heal: art('i-heal'), art: art('i-art'), attack: art('i-attack') };
