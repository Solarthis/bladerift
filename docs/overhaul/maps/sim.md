Read-only map of `packages/shared/src/` (all paths relative to it). Nothing was edited. I did not read `arena.ts`, `look.ts`, `heroes.ts` beyond the parts cited, or `math.ts`.

**Input bits and wire (input.ts:1-10, protocol.ts:104-121)**
- `Btn`: Jump 1, A 2, B 4, Skill 8, Roll 16, Heal 32, Special 64. Every bit in the 7-bit mask is used.
- The wire is one byte. `encodeInputs` writes `buttons & 0xff` (protocol.ts:108), but `decodeInputs` masks `& 0x7f` (protocol.ts:119), so bit 128 is stripped. A new button needs that mask widened and a `PROTOCOL_VERSION` bump (constants.ts:2, currently 11).
- Presses are edges: `press = btn & ~s.prevBtn` (fighter.ts:653-654), buffered by `bufferPresses` (fighter.ts:234-242). `Buf` is a const enum with values 0-7 (fighter.ts:69-78), so 8 is free.
- A same-tick A+B chord is fragile: A overwrites B in `bufferPresses` (fighter.ts:239-240).

**1. Throws**
- Melee hits go through `checkMelee` (world.ts:552-583), which checks overlap, invulnerability and `lastHitSeq`. Add a grounded-only check here.
- `applyHit` (world.ts:601-730) bypasses guard when `!h.breaksGuard` (world.ts:639). A throw Move with `breaksGuard` (weapons.ts:72) already beats block.
- Moves are resolved by `moveOf` (fighter.ts:274-284). Add a move code (MOVE_* run 10-17, fighter.ts:37-50; 18 is free).
- Throw-break needs a new defender state. The `Act` enum is 0-14 (fighter.ts:14-34). The `switch` `default:` at fighter.ts:1001 runs Free logic, so an unhandled new Act silently behaves as Free. New `FighterState` fields need `newFighterState` (fighter.ts:176-185), `STATE_KEYS` (fighter.ts:168-174) and snapshot encoding (protocol.ts:223, 294).
- Hitstop: `hitstopFor` (fighter.ts:192-197).

**2. EX special (50-99% gauge)**
- Gauge constants: `RIFT` max 1000, passive, perDealt 0.3, perTaken 0.2 (classes.ts:151-159). Fills: passive fighter.ts:679, hits `gainRift` (world.ts:596-599), parry +6% (world.ts:645).
- `startArt` (fighter.ts:500-530) returns false when `s.rift < RIFT.max`, then sets `s.rift = 0`. This is the gate and cost to change.
- Callers: `tryBuffered` Special (fighter.ts:374-378; the buffer survives a failed attempt), Stun/FlashStep (fighter.ts:693), Attack cancel (fighter.ts:941, not during MOVE_ART).
- The EX flag has to reach `stepArts` (world.ts:994-1098, reads only `artIdOf`) and damage in `applyHit` (world.ts:637, 680). Art hits skip combo scaling via `!art`.
- Bot: `bot.ts:246` presses Special only at `rift >= RIFT.max`; this needs a 50% branch.

**3. Training flag**
- Refill after a combo ends: combo state is the defender's `comboHits` (world.ts:150; set at world.ts:665, 679, 721, 726). There is no combo-end event. The end is `comboHits > 0 && act !== Act.Stun`, so the check belongs in `World.step` (world.ts:323-352).
- Health and flask refill: `FIGHTER.flasks` (constants.ts:76), `C.hp` (classes.ts).
- Infinite gauge: `startArt` zeroes it at fighter.ts:502. Either restore there or clamp in `step`. `resetRound` carries rift across rounds (world.ts:310-315).
- Storage: `MatchSettings` has only `arenaId`, `wins`, `roundTime` (world.ts:15-21); `DEFAULT_SETTINGS` at world.ts:23.

**4. K.O. launch and lying down**
- `knockOut` (world.ts:732-744): hp 0, `act = Act.KO`, `vy = min(vy, -260)`, `ground = 0`, then `endRound`. Callers: world.ts:675 (block), 728 (hit), 1162 (burn). vx from the killing blow is kept (world.ts:709).
- `endRound` (world.ts:1204-1227) sets phase `ko`, locks everyone for `ROUND.koTicks` (150), and gives the winner `Act.Win`. `stepRound` is at world.ts:1169-1202.
- The KO body is locked (fighter.ts:650). The KO/Win `case` only decelerates (fighter.ts:997-1000). `collide` still runs (fighter.ts:1056), so it lands standing with `act = KO`. No lying state exists.
- Options: add a flag or new Act, or reuse `Act.Down` (fighter.ts:717-724; invulnerable, with `downTicks` in constants.ts:97). Reusing Down means changing these `Act.KO` checks: world.ts 290, 387, 557, 620, 834, 856, 1029, 1070, 1083, 1119, 1138, 1156, 1193, 1219; fighter.ts 587, 650, 997; bot.ts:261. `bot.ts:567` treats `Act.Down` as safe to drink.

**5. Practice/arcade: bot hero and difficulty**
- Difficulty: `Room.botLevel` (room.ts:102), set by lobby op `botLevel` (room.ts:362-363; protocol.ts:369). It is passed to `new BotBrain` at room.ts:424. The brain's `level` is readonly (bot.ts:233), so a change applies only at the next `startMatch`.
- Tuning: `TUNE` (bot.ts:61-74), read at bot.ts:322; easy-only gates at bot.ts:262 and 714.
- Hero: not selectable. The bot seed is `Math.random` (room.ts:422). `botLoadout(seed)` (bot.ts:128-133) picks `rng.int(HERO_COUNT)`, with `HERO_COUNT` 14 (heroes.ts:56). `sanitizeLoadout({ hero })` is at heroes.ts:156-167. Adding a hero parameter needs a new room field, a lobby op (protocol.ts:363-375), and the broadcast in `LobbyStateMsg` (protocol.ts:348-358; room.ts:538-539).
- Settings path: `MatchSettings` (world.ts:15-23) to `Room.settings` (room.ts:99) to the lobby `settings` op, which validates only arenaId, wins and roundTime (room.ts:355-359) to `new World({...this.settings})` (room.ts:412) to the constructor, which reads arenaId and roundTime (world.ts:252-255). `wins` is read at world.ts:1185 and 1233. `MatchStartMsg` (protocol.ts:360) goes out at room.ts:246 and 430.
- Practice is the in-browser Room: constants.ts:6, world.ts:3, `WelcomeMsg.local` (protocol.ts:359). `maxRewind` is set from room options at room.ts:413.
- Client: `Btn` mapping in `Controls.ts:93-99`, gamepad at 119-125, art button at 179. No client code calls `new World(` directly.

**Risks**
- New buttons need the mask change and a version bump together.
- Any new `Act` falls into Free via the `default` case.
- Changing `Act.KO` touches about 20 sites across shared and bot.