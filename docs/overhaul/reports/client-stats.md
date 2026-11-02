Files created: `C:\Users\vascu\Projects/bladerift/packages/client/src/ui/stats.ts` and `C:\Users\vascu\Projects\bladerift\packages\client\src\ui\stats.css`. No other files were edited.

**What was done**
- `stats.ts` exports `recordMatch(r: MatchResult)`, `recordArcade(heroId, cleared, stage)`, `recordSurvival(heroId, wins)`, `getStats()` (returns a copy), `renderStats(root, onBack)`, plus the types `MatchResult`, `StatsData`, `HeroRecord`, `Matchup`, `ArcadeRecord`, and the constants `STATS_KEY` (`'bladerift.stats'`) and `STATS_VERSION` (1).
- Storage: one versioned JSON blob. A stored version other than 1 is discarded. Every stored number is rebuilt through a non-negative guard, so damaged data can't produce NaN. All localStorage reads and writes are in try/catch, and an in-memory cache keeps the numbers for the visit if storage is blocked.
- Per hero: wins, losses, rounds won and lost, perfects, best combo, time played. Also a head-to-head map (`foeHero`), per-mode match counts, current and best win streak, arcade best stage and full clears, and survival best wins.
- Records screen: a totals panel (10 tiles, mode line), then one row per hero with the `assets/art/h-NN.jpg` portrait, record, win-rate bar, three arcade stars with best stage, survival best, rounds, perfects, combo and time. Played heroes sort first. Unplayed heroes are dimmed. A "most losses to" line shows when there is a loss.
- Layout: stacked cards below 760px, one aligned grid with a header line at 760px and up. Rows use `.rs-*` class names.

**Verified**
- `npx tsc -p packages/client --noEmit` exits 0 after all edits.
- A Node smoke test (esbuild bundle, scratch dir) covered recording, streak (win, loss, win gives current 1 and best 2), arcade clamping, survival max, the copy-isolation of `getStats`, and `renderStats` HTML output. Test data stayed in scratch.
- In the built-in browser against the running dev server: desktop grid columns line up with their headers (checked by DOM geometry). At 375px there is no horizontal scroll (scrollWidth equals clientWidth). The screenshot tool timed out, so the visual check is geometry only. The seeded test key was removed from localStorage and the viewport was reset.

**Not verified**
- Nothing is wired yet. I did not check the real `MatchEnd` payload fields for the local player's hero, foe, rounds, perfects, combo and seconds. The lead must map those.
- Draws count as losses (`won` is boolean).

INTEGRATION (for the lead, for `App.ts`, `GameScene.ts` or wherever matches end):
- Imports: `import { recordMatch, renderStats } from './stats';` in `ui/App.ts`. `modes.ts` already imports `recordArcade` and `recordSurvival` from `./stats`, so that import now resolves.
- Match end (where `App.wire` stores `lastEnd`, around l.772-780, or in the `MatchEnd` handler): call once per finished duel for the local player, e.g. `recordMatch({ hero: myLoad.hero, foeHero: foeLoad.hero, won, roundsWon, roundsLost, perfects, bestCombo, seconds, mode })`. `mode` is `'online' | 'lan' | 'practice' | 'local'`. Use the local player's seat; in `local` mode record only the primary player. Verify the field names against `MatchEndMsg.rows`.
- Records screen: add a screen (for example `'stats'` in the `Screen` union and `render` switch) that calls `renderStats(this.ui, () => this.show('title'))`, or whatever the back target is. Add a button to reach it from the title or settings screen.
- No other calls are needed. Arcade and survival recording is already called from `modes.ts`.