/** Wire protocol version. Bump on any incompatible change to protocol.ts. */
export const PROTOCOL_VERSION = 1;

export const TICK_RATE = 60;
export const DT = 1 / TICK_RATE;
/** Server sends a snapshot every N ticks (60 / 2 = 30 Hz). Local rooms (same device, practice) send every tick. */
export const SNAPSHOT_INTERVAL = 2;
/** Two fighters plus spectators. */
export const MAX_PLAYERS = 8;

/** Fixed-point scale for positions on the wire (quarter-pixel). */
export const POS_SCALE = 4;

export const PHYS = {
  gravity: 1700,
  maxFall: 820,
  runSpeed: 235,
  groundAccel: 2600,
  groundDecel: 3000,
  airAccel: 1700,
  airDecel: 700,
  jumpSpeed: 600,
  airJumpSpeed: 520,
  airJumps: 1,
  /** Releasing jump early cuts the rise (variable jump height). */
  jumpCut: 0.5,
  dropThroughTicks: 14,
  /** Hit-stun knockback friction on the ground (per second). */
  stunFriction: 1400,
  /** Status effects. */
  slowFactor: 0.55,
  /** A jump still counts this many ticks after running off an edge. */
  coyote: 6,
  /** Wall slide: fall speed cap; wall jump: kick away and up; ticks steering back toward the wall is ignored. */
  wallSlide: 150,
  wallJumpX: 340,
  wallJumpY: 600,
  wallLock: 10,
  /** A wall jump is still allowed this long after letting go of the wall. */
  wallCoyote: 7,
  /** Air dash (roll in the air, once per airtime): speed, ticks without gravity, invulnerable ticks, total. */
  dashSpeed: 470,
  dashFloat: 12,
  dashInvuln: 9,
  dashTicks: 15,
  /** Fast fall (down in the air): gravity multiplier and the faster terminal speed. */
  fastFallGravity: 1.8,
  fastFallMax: 1150,
  /** A plunge that hits bounces the attacker back up (pogo). */
  pogo: 560,
  /** Ledge: grab window around a top edge, climb time, and a re-grab cooldown after letting go. */
  ledgeReach: 12,
  climbTicks: 14,
  ledgeCooldown: 16,
  /** A hit that lands can be cancelled into a jump for this many ticks (air combos). */
  confirmTicks: 16,
} as const;

export const FIGHTER = {
  w: 22,
  /** Body box height (feet to top of head); matches the hero rig. */
  h: 52,
  /** Body height while crouching (ducks under high swings). */
  crouchH: 34,
  /** Shoulder height above the feet (the rig root). */
  shoulder: 38,
  maxHp: 1000,
  /** Roll: duration, invulnerable part, speed, cooldown after it ends (ticks / units per second). */
  rollTicks: 22,
  rollInvuln: 16,
  rollSpeed: 400,
  rollCooldown: 40,
  /** Health flask: one per round, drunk over healTicks, heals healAmount (a hit while drinking spends it). */
  healTicks: 48,
  healAmount: 300,
  flasks: 1,
  /** Hits within this many ticks count as one combo; the comboBreak-th hit grants breakInvuln ticks of invulnerability. */
  comboWindow: 72,
  comboBreak: 5,
  breakInvuln: 45,
  /** A block this young parries; a parried attacker is stunned for parryStun ticks. */
  parryWindow: 10,
  parryStun: 54,
  /** Damage taken through a block, and the blocker's slide back. */
  chip: 0.15,
  blockPush: 170,
  blockSpeed: 70,
  /** Inputs pressed slightly early are remembered this long (ticks). */
  buffer: 10,
} as const;

export const ROUND = {
  introTicks: 150,
  koTicks: 150,
  defaultTime: 90,
  defaultWins: 2,
} as const;
