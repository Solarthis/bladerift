import { customRGB, isCustom } from '@bladerift/shared';

/** Armour colours (player `color` presets). */
export const COLORS: { name: string; rgb: number }[] = [
  { name: 'Crimson', rgb: 0xc8343c },
  { name: 'Royal', rgb: 0x3a63c8 },
  { name: 'Emerald', rgb: 0x2f9a5a },
  { name: 'Gold', rgb: 0xd8a830 },
  { name: 'Violet', rgb: 0x7a4ac8 },
  { name: 'Ember', rgb: 0xe0662a },
  { name: 'Teal', rgb: 0x2a9aa0 },
  { name: 'Rose', rgb: 0xd8507e },
  { name: 'Slate', rgb: 0x6a7a90 },
  { name: 'Moss', rgb: 0x7aa03a },
  { name: 'Ivory', rgb: 0xd8d0bc },
  { name: 'Onyx', rgb: 0x3a3646 },
];

/** Chest mark colours (look.accent presets). */
export const ACCENTS: { name: string; rgb: number }[] = [
  { name: 'Magenta', rgb: 0xf53cd1 },
  { name: 'Cyan', rgb: 0x3ce0f5 },
  { name: 'Lime', rgb: 0x9cf53c },
  { name: 'Sun', rgb: 0xffd84a },
  { name: 'Blood', rgb: 0xff3a3a },
  { name: 'Snow', rgb: 0xffffff },
  { name: 'Azure', rgb: 0x4a8cff },
  { name: 'Flame', rgb: 0xff8a2a },
];

export const colorOf = (v: number) => (isCustom(v) ? customRGB(v) : COLORS[((v % COLORS.length) + COLORS.length) % COLORS.length].rgb);
export const accentOf = (v: number) => (isCustom(v) ? customRGB(v) : ACCENTS[((v % ACCENTS.length) + ACCENTS.length) % ACCENTS.length].rgb);
export const css = (rgb: number) => '#' + rgb.toString(16).padStart(6, '0');
