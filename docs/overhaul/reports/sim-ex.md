EX special is implemented in the shared sim, bots included. All 435 tests pass (352 before, 83 new), and the shared, server and client typechecks are clean.

## Changed files (all under `C:\Users\vascu\Projects\bladerift\packages\shared\`)

- **`src/classes.ts`**: new `EX_SPECIAL = { cost: 500, dmg: 1.5 }` after `RIFT`.
- **`src/fighter.ts`**:
  - New `FighterState.ex`, appended to `STATE_KEYS` and set to 0 in `newFighterState`. It is the ticks left of the EX cast (the whole skill length), counted down with the other timers.
  - New exports `skillTicks(sk)`, `castingEx(s)`, `exDamage(s, dmg)`.
  - New private `startEx(s, load)`: needs `cost <= rift < RIFT.max`, spends the cost, sets `act = Skill`, sets `ex`, does not touch `skillCd`, no superpause.
  - Called after `startArt` in the buffered Art press and in the attack cancel. Art still wins at 100%.
  - A plain skill cast clears `ex`, so a leftover count cannot empower it. `ex` is cleared when the skill ends.
- **`src/world.ts`**:
  - `Projectile.ex?`.
  - New `GameEvent` `{ t: 'ex', p, skill }`, emitted when an EX cast starts.
  - Shots, auras and dash hits use `exDamage` (1.5x).
  - Super armour for an EX caster while `actT <= startup`, reusing the Blood Frenzy no-flinch path.
- **`src/protocol.ts`**:
  - `NetProjectile.ex`, encoded as bit 64 of the existing kind byte (kind mask is now 63).
  - Event id 19 (`EV.ex`), two bytes: `p`, `skill`.
- **`src/bot.ts`**:
  - `skillInRange(sk, g)` is extracted from `skill()` with identical logic and RNG order.
  - New `exSkill()`, called right after `skill()` in `act()`. It runs only when Free, with gauge in `[500, 1000)`, opponent in range, and Special not already held. It rolls a 50% chance per tick once those hold, and turns toward the opponent first if needed.
- **`test/ex.test.ts`** (new, 83 tests):
  - Every hero: 60% cast costs 500, cooldown ignored and not started, `ex` event, special fires, EX ends with its skill.
  - Below 50% (0, 400, 499): nothing happens.
  - At 100%, the Art starts for every hero.
  - Damage is 1.5x the table for every hero (Gate Shot skipped, as its known bug in `specials.test.ts`).
  - Armour: a sword hit during the startup does not stun the EX caster, while a plain cast is stunned.
  - Stale count is cleared.
  - Shots are flagged and survive the wire.
  - Bots fire EX at 60% and never below 50%.

## Verification

- `npx vitest run`: 18 files, 435 tests passed.
- `tsc -p packages/shared`, `-p packages/server`, `-p packages/client` (`--noEmit`): no errors.

## Notes

- EX can also cancel out of an attack, mirroring the Rift Art rule.
- An EX caster is still throwable during its startup. A throw breaks the cast and the 500 is lost. Say if throw immunity is wanted.
- Strikes got no flag because EX applies only to hero specials, and only shots carry a visible projectile. Caster feedback comes from the `ex` event.
- A hook after the `classes.ts` edit asked me to start a preview server. I did not, because the brief forbids starting dev servers.

## INTEGRATION

1. **`packages/client/src/game/GameScene.ts`, `spawnProj` (about line 2119)**: tint when `p.ex` is true. `NetProjectile.ex` is a boolean on every projectile.
2. **`packages/client/src/game/GameScene.ts`, event switch (about line 1847)**: add `case 'ex':`. Play the EX cast flash and sound at `find(e.p)`. `e.skill` is the hero's SkillId. The event arrives at cast start, about `startup` ticks before the matching `shoot`.
3. **`packages/client/src/net/NetGame.ts`, `aboutMe()` (about line 496)**: add `'ex'` to the `case 'swing': case 'shoot': case 'roll': case 'heal': case 'blink': return e.p === me;` list, so your own EX shows at once and the opponent's is delayed with its position.
4. **`packages/shared/src/constants.ts`**: `PROTOCOL_VERSION` is 12. The snapshot changed (one more float in `STATE_KEYS`, projectile kind bit 64, event id 19), so bump it to 13. I did not touch `constants.ts`.
5. **HUD (optional)**: `EX_SPECIAL.cost` (500) is the EX threshold on the rift bar, if you want a marker there. No compile change is needed.