export const Btn = {
  Jump: 1,
  A: 2,
  B: 4,
  Skill: 8,
  Roll: 16,
  Heal: 32,
  /** Rift Art (class special, needs a full Rift gauge). */
  Special: 64,
  /** Block (every hero, PARRY): hold to guard; pressed just before a hit lands, a perfect block parries it. */
  Block: 128,
  /** Stance (every hero, heroes.ts STANCE_WEAPON): switch to the other weapon and its moveset. */
  Stance: 256,
} as const;

/** One tick of fighter intent. Analog axes are quantized to int8 on the wire. */
export interface InputCmd {
  seq: number;
  /** -1..1, horizontal intent. */
  moveX: number;
  /** -1..1, vertical intent (positive = down: drop through platforms, plunge attacks). */
  moveY: number;
  /** Bitmask of Btn (held state; presses are detected against the previous command). */
  buttons: number;
  /** Server tick the client was rendering the opponent at (lag compensation). */
  viewTick: number;
}

export const emptyInput = (seq = 0): InputCmd => ({ seq, moveX: 0, moveY: 0, buttons: 0, viewTick: 0 });
