Both files are written and `tsc` shows no errors in them. I checked the splash in the running dev server at four viewport sizes and confirmed the skip path. Reduced-motion and the shake-off setting are not visually verified.

**Files (both new)**
- `C:\Users\vascu\Projects\bladerift\packages\client\src\ui\vsSplash.ts`
- `C:\Users\vascu\Projects\bladerift\packages\client\src\ui\vsSplash.css` (imported from the .ts)

**Exports**
- `showVsSplash(root: HTMLElement, data: VsSplashData): Promise<void>`
- Types `VsSide` and `VsSplashData` (`p1`, `p2`, `arenaName`, optional `modeLabel`).

**What it does**
- Appends the card to `root`. The card removes itself before the promise resolves.
- Timeline is 2.4 s. Portraits slam in from the edges with a slanted mask and a player-colour ring. Hero name and epithet sit under each portrait in heavy italic with the player colour. A giant gold "VS" slams in at 0.78 s with a flash and shake at 1.0 s. Arena and mode fade in at 1.3 s. The backdrop wipes right from 2.05 s.
- Skip: a pointerdown or keydown, ignoring key repeat, ends the card after 0.6 s.
- Reduced motion (`prefers-reduced-motion`): 1.2 s, fades only, no slam, shake or flash.
- The player's shake pref at 0 removes the shake only.
- Hero portraits use `assets/art/h-NN.jpg` (same as the hero select). Hero names and epithets come from `heroOf` in `@bladerift/shared`.
- Player names and the arena name are set with `textContent`, not HTML. Invalid colours fall back to gold.
- Class names are prefixed `vss-`, so they do not clash with the old `.vs-splash` block in `roster.css`.

**Verified**
- `npx tsc -p packages/client --noEmit`: no errors in my files. The remaining errors are in files I don't own: `audio/Sfx.ts` (`syncSampleVolume`) and `ui/modes.ts` (`./stats`).
- In-page at 1280x720, 844x390, 667x375 and 1920x1080, frozen at 1.5 s, all four fit without collisions. The 1920x1080 portraits were small at first, so I raised the cap from 440 px to 540 px.
- Skip: a key press at 300 ms is ignored. A pointer press at 700 ms resolves the promise at about 870 ms, with no leftover element.
- Not verified: reduced-motion output (the browser pane cannot emulate it), the shake-off setting, and a full-length run with real screenshots. The pane kept reloading, which I think is other agents' edits triggering Vite reloads.
- The browser pane viewport is back to desktop.

**INTEGRATION (for the lead)**

1. In `packages/client/src/ui/App.ts`, add `import { showVsSplash } from './vsSplash';`.
2. In `startGameView` (around l.848), replace `this.vsSplash();` with a call that does not block the game start:
   ```ts
   void showVsSplash(this.ui, {
     p1: { heroId: mine.hero, playerName: s.roster.get(s.selfId)?.name ?? this.profiles[0].name, color: css(colorOf(<self profile colour>)) },
     p2: { heroId: theirs.hero, playerName: foe?.name ?? (this.mode === 'practice' ? 'Bot' : 'Opponent'), color: css(colorOf(<foe colour>)) },
     arenaName: ARENAS.find((a) => a.id === this.settings.arenaId)?.name ?? 'Arena',
     modeLabel: this.mode === 'practice' ? 'Practice' : this.mode === 'local' ? 'Two players' : undefined,
   });
   ```
   `mine` and `theirs` are the fighters already found in the current `vsSplash` method. The colour fields are the ones the lead must confirm on `ViewFighter` or the roster entries. `css` and `colorOf` come from `./colors`. If the fighter list is not ready, keep the existing wait loop.
3. Delete the old `private vsSplash(...)` method (l.855-883). Optionally delete the `.vs-splash` block in `roster.css` (l.387-402 and the keyframes `vs-from-left`, `vs-from-right`, `vs-pop`), though nothing else should use it.