/** Wire protocol version. Bump on any incompatible change to protocol.ts. */
export const PROTOCOL_VERSION = 4;

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
  maxHp: 1800,
  /** Roll: duration, invulnerable part, speed, cooldown after it ends (ticks / units per second). */
  rollTicks: 22,
  rollInvuln: 16,
  rollSpeed: 400,
  rollCooldown: 40,
  /** Health flask: one per round, drunk over healTicks, heals healAmount (a hit while drinking spends it). */
  healTicks: 48,
  healAmount: 540,
  flasks: 1,
  /** A hit that lands while the defender is still in hit-stun (Act.Stun) continues the combo; any other hit starts a new
   * one. The comboBreak-th hit of a combo grants breakInvuln ticks of invulnerability (the anti-infinite safeguard; Rift
   * Art hits count toward the combo but never trip it). */
  comboBreak: 15,
  breakInvuln: 45,
  /** Combo damage scaling: hit n of a combo deals max(comboScaleMin, 1 - comboScaleStep * (n - 1)) of its damage
   * (100%, 94%, 88% ... down to 40% from the 11th hit). Rift Art hits land in full. */
  comboScaleStep: 0.06,
  comboScaleMin: 0.4,
  /** Knockdown: a hit that launches the defender (kbY > 150) with kbY >= knockdownKbY, stun >= knockdownStun, or from a
   * Rift Art sets `fall`: the defender stays in hit-stun until it lands, then lies in Act.Down for downTicks and rises in
   * Act.GetUp for getUpTicks, invulnerable all along and for wakeInvuln ticks after it is up. */
  knockdownKbY: 240,
  knockdownStun: 34,
  downTicks: 32,
  getUpTicks: 12,
  wakeInvuln: 6,
  /** Superpause: when a Rift Art starts, both fighters (and projectiles, strikes, traps, burning, the clock) freeze this
   * many ticks; the caster's Art timeline (and its invulnerability) starts after it. */
  superpause: 45,
  /** A block this young parries; a parried attacker is stunned for parryStun ticks. */
  parryWindow: 10,
  parryStun: 54,
  /** The crouch guard (every hero: hold down on the ground): a parried attacker is stunned this long; damage through
   * the guard is chip x guardChip (the Shield's block stays the better guard). */
  guardParryStun: 40,
  guardChip: 1.6,
  /** A melee swing cuts enemy projectiles out of the air from a tick before its hit window to `deflectLate` ticks after. */
  deflectLate: 4,
  /** Ranged heat (ticks of cooling): a shot adds heatShot (a charged shot heatCharged); reaching heatMax overheats the
   * weapon, which fires again once it has cooled to heatReady. About five quick shots in a row, then 1.5 s to cool. */
  heatShot: 45,
  heatCharged: 80,
  heatMax: 120,
  heatReady: 30,
  /** Damage taken through a block, and the blocker's slide back. */
  chip: 0.15,
  blockPush: 170,
  blockSpeed: 70,
  /** Inputs pressed slightly early are remembered this long (ticks). */
  buffer: 10,
} as const;

/**
 * Hit-stop (hit pause): on a landed hit both fighters freeze (position, velocity, action and status timers held; the
 * knockback starts when it ends) for hitstopFor(dmg, crit, art, blocked) ticks:
 * blocked `block`; a Rift Art hit `art`; otherwise round(base + dmg / perDmg) clamped to [min, max] (dmg = the move's own
 * damage before class and combo scaling: light ~6, medium ~8-9, heavy 12), and a crit max(max, that + 2) up to `crit`.
 * Projectile, skill, trap and Art-effect hits freeze only the defender.
 */
export const HITSTOP = {
  block: 4,
  art: 14,
  base: 4,
  perDmg: 20,
  min: 6,
  max: 12,
  crit: 14,
} as const;

export const ROUND = {
  introTicks: 150,
  koTicks: 150,
  defaultTime: 120,
  defaultWins: 2,
} as const;
