Throws are implemented in the shared sim. `npx vitest run` passes (17 files, 352 tests, including 6 new in `throw.test.ts`). `tsc` is clean for shared, client and server.

## Changed files

- `packages/shared/src/constants.ts`: new `THROW` tuning block (range 38, startup 5, hold 12, tech window 8, dmg 140, kbX 320, kbY 240, stun 40, thrower recovery after 14, whiff recovery 24, tech push 260 / stun 20). `PROTOCOL_VERSION` 11 to 12, because the event wire format changed.
- `packages/shared/src/weapons.ts`: `Move.grab?: boolean`.
- `packages/shared/src/fighter.ts`:
  - `Act.Throw = 15` (thrower) and `Act.Held = 16` (victim).
  - `MOVE_THROW = 18` and `THROW_MOVE`, returned by `moveOf`.
  - `throwOpen()`: the heavy (B, same weapon in both hands) on the ground, with the stick toward a throwable opponent in reach and level, starts the throw. Otherwise B behaves as before.
  - `Held` case: a press of A or B within the tech window breaks the hold and pushes the victim away.
  - `Throw` case: holds the thrower until the World lands the throw, then recovers.
  - `isThrowable(s)`: grounded, not invulnerable, not frenzied, not mid-Art, and in Free, Attack, Block, Charge, Heal or Skill.
  - `FoeView.throwable` (optional). `bodySolid` is false for Held and Throw.
- `packages/shared/src/world.ts`:
  - Events `{t:'throw', a, v}` and `{t:'tech', a, v}`.
  - `checkThrow` (grab), `stepThrows` (tech, landing, release of an orphaned victim), `landThrow`, `techThrow`.
  - `checkMelee` routes grab moves to `checkThrow`. `deflected` ignores grab moves.
  - `f.start` and `foeView` carry `throwable`.
- `packages/shared/src/protocol.ts`: `EV.throw = 17`, `EV.tech = 18`, encoded and decoded as `u8 a, u8 v`.
- `packages/shared/src/bot.ts`:
  - `attack()` throws at a blocking or crouch-guarding opponent in reach, with a heavy kit.
  - A grabbed bot presses A in the tech window with chance `TUNE.dodge`.
- `packages/shared/test/throw.test.ts` (new): throw beats crouch guard and shield block with a knockdown; tech breaks it with no damage and both pushed apart (A and B); a late press does not break it; no grab on an airborne fighter; heavy still comes out out of reach and without the stick toward the opponent.

## Timeline

Grab at tick G (`throw` event). Tech window G+1 to G+8. Throw lands at G+12 as an ordinary `hit` with knockdown. The thrower recovers until G+26.

## Deviations and notes

- The 140 base damage still goes through the attacker's class damage scale (`dmgScale`), like every other hit.
- Start and connect checks use the victim state at tick start for `throwable`, and lag-compensated position for the connect.
- A held victim is invulnerable, so projectiles cannot break the hold. A hit that does break it (anything else that sets Stun) releases the victim with no tech event.
- Bot-vs-bot smoke run (60 matches, scratchpad script): 3 throws, 3 teches, 0 stuck holds, 0 exceptions. Bots rarely throw, so the sample is small.
- Nothing in `packages/client` was edited.

## INTEGRATION

- Import from `@bladerift/shared` (index re-exports fighter, constants and world): `Act` (values 15 and 16), `MOVE_THROW` (18), `THROW`, `isThrowable`, and the `throw` and `tech` GameEvent members.
- Client prediction: wherever the local fighter's `stepFighter` gets its `FoeView` (the foe as the client sees it), add `throwable: isThrowable(opponentState)`. Without it the local throw start never predicts, and the next snapshot corrects it.
- Sound and animation, in the event loop that handles `GameEvent`:
  - on `{t:'throw', a, v}`: `samples.play('throw')` plus a grab animation for the thrower (`Act.Throw`) and the held victim (`Act.Held`).
  - on `{t:'tech', a, v}`: a tech sound, e.g. `samples.play('parry')` (there is no `tech` sfx id in the contract).
  - on `{t:'hit'}` from a throw: the normal hit reaction and knockdown. `w` is the attacker's slot-1 weapon id.
- The thrower's move code 18 appears in `Act.Attack` during the startup and on a whiff, so the swing animation can key on `move === 18`.
- `Act.Throw` and `Act.Held` are unknown to the current sprite and animation maps, so they need a pose mapping (e.g. hold pose for both).
- `PROTOCOL_VERSION` is now 12. Client and server must ship together.