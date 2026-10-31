import { SkillId, WeaponId } from '@bladerift/shared';

const W: Record<number, string> = {
  [WeaponId.Sword]: 'w-sword',
  [WeaponId.Scythe]: 'w-scythe',
  [WeaponId.Lance]: 'w-lance',
  [WeaponId.Daggers]: 'w-dagger',
  [WeaponId.Hammer]: 'w-hammer',
  [WeaponId.Bow]: 'w-bow',
  [WeaponId.Shield]: 'w-shield',
};
const S: Record<number, string> = {
  [SkillId.Bomb]: 's-bomb',
  [SkillId.Frost]: 's-frost',
  [SkillId.Trap]: 's-trap',
  [SkillId.Blink]: 's-blink',
};

export const weaponIcon = (w: number) => `assets/art/${W[w] ?? 'w-sword'}.png`;
export const skillIcon = (s: number) => `assets/art/${S[s] ?? 's-bomb'}.png`;
