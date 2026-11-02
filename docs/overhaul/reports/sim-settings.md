Sim step "settings" is done. Everything is in `packages/shared`, and the full suite passes: 19 files and 464 tests across all packages, including 29 new ones. All three typechecks (shared, server, client) are clean.

## Changed files
- `packages/shared/src/world.ts`
  - `MatchSettings` gains optional `training`, `infiniteRift`, `botHero`, `carryHp` and `startHp`.
  - New exports `TRAINING` (refillTicks 60) and `KO_LAUNCH` (vx 260, vy -340).
  - `Fighter.refillT` is a new field.
  - `addFighter` and `stepTraining` keep the Rift gauge full under `infiniteRift`.
  - `stepTraining` refills health and flasks 60 ticks after a combo ends. A new hit in stun cancels the countdown, and the refill closes the combo.
  - `start()` applies `startHp` under `carryHp`, clamped to 1..class hp (0 or less means full).
  - `stepRound` does not run the clock in training.
  - `knockOut` floors health at 1 in training. Otherwise it throws the body away from the attacker, at least 260 vx and -340 vy.
- `packages/shared/src/bot.ts`
  - `BotDifficulty` is now `easy | normal | hard | cpu | dummy-stand | dummy-guard | dummy-jump`, plus `BOT_LEVELS` and `isDummyLevel`.
  - `cpu` uses the normal tuning.
  - `think()` returns early for dummies: no input, crouch every tick, or a jump every 90 ticks.
- `packages/shared/src/room.ts`
  - The `settings` op validates the new fields.
  - The `botLevel` op accepts `BOT_LEVELS`.
  - `startMatch` uses `sanitizeLoadout({ hero: botHero })` when set.
  - At match end under `carryHp`, `settings.startHp` is set to each human's health. The bot seat gets -1.
- `packages/shared/src/protocol.ts`: `botLevel` types widened to `BotDifficulty`. This is an additive type change, so `PROTOCOL_VERSION` stays at 12.
- `packages/shared/test/training.test.ts`: new, 29 tests covering the round clock, floor at 1, refill timing and cancel, infinite Rift, K.O. launch both sides, startHp clamping, room lobby validation, the survival carry, the dummies, and `cpu` matching `normal`.

## Decisions to know about
- `infiniteRift` works on its own, not only in training.
- The brief did not define `cpu`, so it is the regular normal AI.
- Training never ends a round by time, so the client needs an explicit leave path (`toLobby`).
- `toLobby` keeps the carried health. Turning `carryHp` off clears it.
- The K.O. launch also applies to burn KOs. With no attacker, the body is thrown away from its facing.
- Not verified in a browser. These are sim and room tests only. Nothing is committed.

INTEGRATION
- Imports from `@bladerift/shared` (all from the index re-exports): `BOT_LEVELS`, `isDummyLevel`, `TRAINING`, `KO_LAUNCH`, and the widened `BotDifficulty` type. The `MatchSettings` fields are optional, so nothing else changes at call sites.
- Host lobby commands (lobby phase only):
  - `{ op: 'settings', settings: { training?: boolean, infiniteRift?: boolean, botHero?: number (-1 = random), carryHp?: boolean } }`
  - `{ op: 'botLevel', level: 'easy' | 'normal' | 'hard' | 'cpu' | 'dummy-stand' | 'dummy-guard' | 'dummy-jump' }`
  - `{ op: 'bot', on: true }` to fill the empty seat with the bot.
- Where: App.ts:404 (lobby level buttons) only lists `easy`, `normal` and `hard`. Add the dummy levels there. App.ts:522 casts `level` and is unaffected.
- Survival: nothing to send. Read `LobbyStateMsg.settings.startHp` after a match to show carried health.
- Client HUD in training: the clock stays at `roundTime`, nobody reaches K.O., and the match never ends by time.
- K.O. pose: the beaten fighter has `act === Act.KO` and `ground > 0` once it lands. It is airborne for about 0.4 s after the K.O.