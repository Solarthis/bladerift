Both files are written. `tsc` is clean except for one expected error: `./stats` does not exist yet, so the import in `modes.ts` fails until the other agent's file lands.

## Report: client modes (Arcade ladder and Survival)

**Files (new, owned):**
- `C:\Users\vascu\Projects\bladerift\packages\client\src\ui\modes.ts`
- `C:\Users\vascu\Projects\bladerift\packages\client\src\ui\modes.css`

**Verified:** `npx tsc -p packages/client --noEmit` reports one error, `modes.ts(8,46): TS2307 Cannot find module './stats'`. That clears once `ui/stats.ts` exists with `recordArcade(heroId, cleared, stage)` and `recordSurvival(heroId, wins)`. The run logic was reviewed by reading the code, not executed. Visuals (phone and desktop) were not rendered or checked in a browser.

**Behaviour:**
- `ArcadeRun`: 7 stages, 6 distinct random heroes plus a boss (Gilgamesh 2, or Alexander 11 if the player is Gilgamesh). Bot levels are easy, easy, normal, normal, normal, hard, hard at normal difficulty. Easy shifts every rung one step down, hard one step up. Arenas rotate through the five in a seeded order. `stage` is 1-based. Three continues: a loss with continues left leaves the run `canContinue()`, and `continueRun()` retries the same stage. The result is saved once, when the run is done or quit.
- `SurvivalRun`: each win draws a new opponent (easy for the first two fights, normal for the next two, hard after). `startHp` is a fraction of full health (0..1). After a win it becomes `min(1, hpLeft + 0.25)`, where `hpLeft` is the player's health fraction at the end of the fight. The run ends on the first loss, and the streak is saved then or on `quit()`.
- Both runs are seeded (mulberry32), so the same seed gives the same ladder.
- Screens use the global `.screen` container, so they fit the existing layout. Phone widths get a compact tower, and the current stage scrolls into view.

**Shared-file changes this needs (not mine, not made):**
1. `packages/shared/src/world.ts` `MatchSettings` has no `startHp`. Survival needs one (absolute hp, or a fraction converted by the owner of `addFighter`/`fighter.ts`). `Fighter.hp` is set from the class `hp` in `newFighterState`.
2. `packages/shared/src/room.ts:424` picks the bot's hero with `botLoadout(seed)`. Arcade needs the opponent's hero forced, so `Room` needs a `botHero` override (or a loadout passed in) that is used there.

## INTEGRATION

Imports in `packages/client/src/ui/App.ts`:
```ts
import { ArcadeRun, SurvivalRun, renderLadder, renderRunOver, renderSurvival, arcadeSummary, survivalSummary } from './modes';
```
`modes.ts` imports `./modes.css` itself, so `main.ts` needs no change.

Exports and arguments:
- `new ArcadeRun(playerHero: number, difficulty: 'easy'|'normal'|'hard', seed: number)`. Methods: `current(): { stage, total, heroId, botLevel, arenaId, boss }`, `recordResult(win: boolean)`, `done()`, `cleared()`, `canContinue()`, `continueRun()`, `failed()`, `quit()`, getter `continues` (starts at 3), `ladder: Opponent[]`.
- `new SurvivalRun(playerHero: number, seed: number)`. Methods: `current(): { heroId, botLevel, arenaId, boss: false, fight, wins, startHp }`, `recordResult(win: boolean, hpLeft?: number)` (hpLeft is a 0..1 fraction, default 0), `done()`, `quit()`. Fields: `wins`, `startHp`.
- `renderLadder(root: HTMLElement, run: ArcadeRun, onFight: (stage: ArcadeStage) => void, onQuit: () => void)`. Quit calls `run.quit()` before `onQuit`. The fight button calls `run.continueRun()` when the run is lost with continues left, then `onFight(run.current())`.
- `renderSurvival(root, run: SurvivalRun, onFight: (fight: SurvivalFight) => void, onQuit)`. Shows streak, health going in, and the next opponent. Quit calls `run.quit()`.
- `renderRunOver(root, { title: string; stats: string[]; retryLabel?: string; note?: string; tone?: 'win'|'lose' }, onRetry: () => void, onMenu: () => void)`.
- `arcadeSummary(run): string[]` and `survivalSummary(run): string[]` for the `stats` lines.

Where:
- Title screen (`App.ts` ~l.220, next to the `practice` button): add two buttons, for example `data-act="arcade"` and `data-act="survival"`, and handle them in `act` (~l.575).
- Hero for the run: the player's profile hero (`profiles[0]`'s loadout `hero`).
- Each screen goes into `#ui`, through a new `Screen` value (for example `'modes'` in the `Screen` type and `show()`), or by passing `this.ui`.

Flow:
1. Arcade start: `const run = new ArcadeRun(hero, diff, (Math.random() * 1e9) | 0)`, then `renderLadder(ui, run, fight, quit)`.
2. `fight(stage)`: start a match the way `startLocal('practice')` does (l.608). Set the arena from `stage.arenaId`, set `room.botOn = true`, `room.botLevel = stage.botLevel`, and force the bot hero to `stage.heroId` (needs the `botHero` change in `room.ts`).
3. On match end (`App.wire` l.772-780, `MatchEndMsg`), let `win` be "player's seat won the match". Arcade: `run.recordResult(win)`. Then if `run.done()` render `renderRunOver(ui, { title: run.cleared() ? 'Ladder cleared' : 'Defeated', stats: arcadeSummary(run), tone: run.cleared() ? 'win' : 'lose', retryLabel: 'New run' }, newRun, menu)`. Otherwise call `renderLadder` again. If `run.canContinue()` (not done), use `retryLabel: \`Continue (${run.continues} left)\``.
4. Survival: `run.recordResult(win, playerHpFraction)`, with the player's health fraction at the end of the fight read from the world. Then if `run.done()` show `renderRunOver` with `survivalSummary(run)`, else `renderSurvival(ui, run, fight, quit)`. Set the next fight's `startHp` into the match settings (needs the shared change above).
5. Quit paths: the `onQuit` callback should go back to the title screen (`show('title')`).

Notes:
- `renderLadder` and `renderSurvival` replace `root.innerHTML` with a `.screen.modes-screen` element. Pass the same `#ui`-style root each time.
- The screens use the existing `.screen`, `button.big`, and `--gold`, `--panel`, `--line` tokens from `styles.css`. Hero portraits are `assets/art/h-NN.jpg` (same as the hero select).