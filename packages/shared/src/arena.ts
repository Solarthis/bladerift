/** Duel arenas: a floor, two side walls and a few one-way platforms (world units, y grows downward). */
export type ArenaTheme = 'bridge' | 'embers' | 'crypt' | 'grove';

export interface Platform {
  /** Left edge, top surface, width. */
  x: number;
  y: number;
  w: number;
}

/** A solid block (pillar, wall chunk): stand on it, slide down its sides, wall-jump off them, hang from its top edges. */
export interface Block {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ArenaDef {
  id: string;
  name: string;
  theme: ArenaTheme;
  /** Inner width (walls at 0 and w) and floor height (the floor's top surface). */
  w: number;
  floor: number;
  platforms: Platform[];
  blocks: Block[];
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
    // two broken pillars to climb, wall-jump between and hang from
    blocks: [
      { x: 60, y: 330, w: 56, h: 270 },
      { x: 1164, y: 330, w: 56, h: 270 },
    ],
    spawns: [430, 850],
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
    // a battlement block in the middle of the yard: fight on it, around it, over it
    blocks: [{ x: 545, y: 530, w: 90, h: 70 }],
    spawns: [380, 800],
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
    // a tall tomb in the centre and a hanging slab above it: wall-jump lanes
    blocks: [
      { x: 486, y: 440, w: 68, h: 160 },
      { x: 430, y: 250, w: 180, h: 34 },
    ],
    spawns: [330, 710],
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
    // two old tree stumps to scale
    blocks: [
      { x: 250, y: 520, w: 80, h: 80 },
      { x: 1070, y: 520, w: 80, h: 80 },
    ],
    spawns: [490, 910],
    description: 'Wide and tall. Rangers and lancers love the space.',
  },
];

export function getArena(id: string): ArenaDef {
  return ARENAS.find((a) => a.id === id) ?? ARENAS[0];
}

/** The surface a body at x would land on at or below y: the floor, a platform or a block top. */
export function surfaceBelow(arena: ArenaDef, x: number, y: number) {
  let best = arena.floor;
  for (const p of arena.platforms) if (x >= p.x && x <= p.x + p.w && p.y >= y - 0.5 && p.y < best) best = p.y;
  for (const b of arena.blocks) if (x >= b.x && x <= b.x + b.w && b.y >= y - 0.5 && b.y < best) best = b.y;
  return best;
}

/** Is the point inside a block or outside the arena (projectiles stop there)? */
export function solidAt(arena: ArenaDef, x: number, y: number) {
  if (x < 0 || x > arena.w || y > arena.floor) return true;
  for (const b of arena.blocks) if (x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h) return true;
  return false;
}
