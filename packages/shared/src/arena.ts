/** Duel arenas: a floor, two side walls and a few one-way platforms (world units, y grows downward). */
export type ArenaTheme = 'bridge' | 'embers' | 'crypt' | 'grove';

export interface Platform {
  /** Left edge, top surface, width. */
  x: number;
  y: number;
  w: number;
}

export interface ArenaDef {
  id: string;
  name: string;
  theme: ArenaTheme;
  /** Inner width (walls at 0 and w) and floor height (the floor's top surface). */
  w: number;
  floor: number;
  platforms: Platform[];
  /** Spawn x for seat 0 (left) and seat 1 (right). */
  spawns: [number, number];
  description: string;
}

export const ARENAS: ArenaDef[] = [
  {
    id: 'bridge',
    name: 'Moonlit Bridge',
    theme: 'bridge',
    w: 1280,
    floor: 600,
    platforms: [
      { x: 170, y: 470, w: 230 },
      { x: 880, y: 470, w: 230 },
      { x: 520, y: 360, w: 240 },
    ],
    spawns: [330, 950],
    description: 'Open deck under the moon. Two side ledges and a high centre perch.',
  },
  {
    id: 'embers',
    name: 'Ember Keep',
    theme: 'embers',
    w: 1180,
    floor: 600,
    platforms: [
      { x: 110, y: 480, w: 200 },
      { x: 870, y: 480, w: 200 },
      { x: 390, y: 400, w: 400 },
      { x: 520, y: 290, w: 140 },
    ],
    spawns: [300, 880],
    description: 'Burning battlements. A long middle wall and a lookout to fight over.',
  },
  {
    id: 'crypt',
    name: 'Sunken Crypt',
    theme: 'crypt',
    w: 1040,
    floor: 600,
    platforms: [
      { x: 90, y: 440, w: 260 },
      { x: 690, y: 440, w: 260 },
    ],
    spawns: [300, 740],
    description: 'Tight and close. Little room to run - every roll counts.',
  },
  {
    id: 'grove',
    name: 'Mistwood Grove',
    theme: 'grove',
    w: 1400,
    floor: 600,
    platforms: [
      { x: 140, y: 490, w: 180 },
      { x: 1080, y: 490, w: 180 },
      { x: 380, y: 390, w: 200 },
      { x: 820, y: 390, w: 200 },
      { x: 600, y: 280, w: 200 },
    ],
    spawns: [380, 1020],
    description: 'Wide and tall. Rangers and lancers love the space.',
  },
];

export function getArena(id: string): ArenaDef {
  return ARENAS.find((a) => a.id === id) ?? ARENAS[0];
}
