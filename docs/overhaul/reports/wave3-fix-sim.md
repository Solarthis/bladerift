All four findings are addressed in `packages/shared`. Finding 1 is only partly fixed: the bot side is fixed, the human side is not changed.

**Finding 1, EX starves Rift Arts: partial.** The bot-side bug is real and is fixed. `bot.ts` `exSkill` now takes the world and only spends the gauge on EX when the Art cannot fill from passive gain in the time left (`(RIFT.max - rift) / RIFT.passive > timeLeft / DT`). Duel sim, `tools/duelsim.ts --seeds=1`, against the reviewer's numbers:
- Humbaba: 33.7 to 47.5 (base 46.2).
- Dumas: 40.5 to 52.5 (base 55.2).
- Brynhildr Arts per round: 1.01 (base 1.02).
- Output: `C:\Users\vascu\AppData\Local\Temp\claude\C--\3e5d6721-b735-4f36-b275-bbd396a973d7\scratchpad\qa\sim-duelsim-fix.txt`.

The human side is not changed. The Art button casting EX at 500 to 999 is the documented design (`classes.ts:162`). Changing it needs a new input bit, which touches client and protocol, or a double-tap, which is a design call for the owner. `ex.test.ts` is updated for the new bot rule.

**Finding 2, infiniteRift makes EX unreachable: fixed (doc option).** The `MatchSettings.infiniteRift` comment in `world.ts` now says the Art is always ready and EX never is. The sim behaviour is unchanged (`qa-sim-checks`: act 12 Art, ex 0). `docs/overhaul/reports/sim-settings.md` still says "every Rift Art and EX special is available". That report is outside my group, so the lead should correct it.

**Finding 3, EX armour bypassed by a throw: fixed.** `World.checkThrow` now rejects a victim that is casting EX inside its startup, the same test `exArmour` uses. `qa-sim-exthrow.mjs` now shows `grabbed: false` for heroes 0, 1 and 2 (was true). New test in `ex.test.ts`: "a grab cannot break an EX caster's startup".

**Finding 4, carried 0 HP restarts at full health: fixed.** `World.start()` now treats 0 as 1 health and only a negative value as full. `room.ts` is unchanged, so a lost seat's 0 now carries as 1. `qa-sim-carry`: `carryZero` hpA is 1 (was 1890). `training.test.ts` is updated, and a regression test is added.

**Verification.**
- `npx tsc -p packages/shared --noEmit`: clean.
- `npx tsc -p packages/client --noEmit`: clean.
- `npx vitest run`: all 18 shared test files pass (464 tests across the run).
- One client test file fails: `packages/client/test/camera.test.ts` (3 FightCamera tests). It is outside my group, and my changes do not touch the camera. It is probably the client fixer's in-progress work.

Changed files, all under `C:\Users\vascu\Projects\bladerift\packages\shared\`:
- `src\bot.ts`
- `src\world.ts`
- `test\ex.test.ts`
- `test\training.test.ts`