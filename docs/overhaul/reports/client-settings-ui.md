Settings UI is built and tested at phone width. `tsc -p packages/client --noEmit` is clean (an earlier error in `modes.ts` from another agent cleared on the last run).

**Files**
- `packages/client/src/ui/prefs.ts` (modified)
- `packages/client/src/ui/settingsScreen.ts` (new)
- `packages/client/src/ui/settings.css` (new, imported by settingsScreen.ts itself)

**Prefs**
- New keys with defaults: `musicVol` 0.6, `sfxVol` 0.8, `voiceVol` 0.9, `quality` 'high', `qualityHint` false, `touchScale` 1 (clamped 0.8-1.3), `touchOpacity` 0.85 (clamped 0.3-1), `leftHanded` false, `keys` {}.
- Existing keys are unchanged: `volume` stays the master slider, plus `shake`, `haptics`, `faceMove`, `highRefresh`, `fullscreen`, `damageNumbers`.
- Storage key is still `bladerift.prefs`, now with `v: 2`. A blob without `v` is v1 and keeps every value it had. Junk values are replaced by defaults on load, and key overrides are sanitized (known actions only, up to 3 codes each, `[A-Za-z0-9]{1,24}`).
- Verified: a v1 blob with `volume` 0.5, `shake` 0.3 and `haptics` false loaded with those values kept. Invalid key codes were dropped.
- Added exports: `KeyAction`, `KEY_ACTIONS`, `Quality`, `applyPrefsToDocument()`, `withKeyOverrides(base)`, `reportRenderScale(scale)`.
- Behaviour change: the old "Sound" slider is now "Master volume", and effective effects volume is master × sfxVol. A player at the defaults hears effects at 0.64 instead of 0.8.

**Settings screen**
- Four tabs. Audio: master, music, effects, voice. Video: graphics quality (High/Low, with a suggestion note), screen shake, high refresh, fullscreen in matches, damage numbers. Controls: keyboard remap for the solo scheme (click an action, press a key, Esc cancels, a key used by another action swaps with it, blocked keys such as Tab and F5 are refused, reset to defaults), then touch size, opacity, left-handed, face-where-I-run, and a live preview. Game: vibration, version, and the update button when `onUpdate` is given.
- Verified in the dev server at 375px wide: no horizontal scroll, four equal tabs. Remap, swap, Esc, blocked key, slider and checkbox changes, touch CSS variables, the quality hint, and storage all behaved as intended.
- Not verified: visual look (the pane was not displayed, so no screenshot), real touch devices, and in-game effects of the new prefs. The screen mounts into a `#ui`-style positioned box and replaces its content.

**Gaps for the owner**
- `reportRenderScale` does not repaint an open settings screen. It is only meant to be called during play, when the screen is not mounted.
- `highRefresh` is not read anywhere in the client yet. I found no reads of it in the files I checked.

INTEGRATION

1. Boot, once before the first touch screen (main.ts or App constructor):
   `import { applyPrefsToDocument } from './ui/prefs';` then `applyPrefsToDocument();`

2. Settings screen (App.ts). Replace the `case 'settings'` body at l.242-250 with a host element, and delete the `if (this.screen === 'settings')` block at l.481-490:
   `case 'settings': return '<div class="screen settings-host"></div>';`
   In `bind()`, mount into it and keep the handle (destroy the previous one first):
   ```ts
   import { mountSettings } from './settingsScreen';
   import { applyPrefsToDocument, prefs } from './prefs';   // prefs already imported
   import { CURRENT_RELEASE } from '../update';             // already imported
   // in bind(), when this.screen === 'settings':
   const host = root.querySelector<HTMLElement>('.settings-host')!;
   this.settingsUi?.destroy();
   this.settingsUi = mountSettings(host, {
     version: CURRENT_RELEASE,
     onChange: (p) => {
       sfx.volume = p.volume;                 // existing line; keep if sfx still reads it
       // music.setVolume(p.volume * p.musicVol); samples.setVolume(p.volume * p.sfxVol); announcer.setVolume(p.volume * p.voiceVol);
       // pacer.full = p.highRefresh;  governor.reset();   // if the game owns the pacer
     },
     onBack: () => this.show('title'),        // check what act('back') targets today
     onUpdate: () => this.act('update', host.querySelector('.update-btn') as HTMLElement),
   });
   ```
   Add `private settingsUi: { destroy(): void } | null = null;` to App, and call `this.settingsUi?.destroy(); this.settingsUi = null;` in `show()` before leaving the settings screen.
   Use `.settings-host` as the host because `.screen` gives an absolutely positioned full-size box. The `Screen` type already includes 'settings'.

3. Audio. Music, Samples and Announcer need these effective levels, derived from the prefs above (`musicVol`, `sfxVol`, `voiceVol` times `volume`), applied at boot and in `onChange`.

4. Quality. In game/pacing.ts usage, pass the governor's step-down to the pref hook:
   `new ResolutionGovernor((s) => { reportRenderScale(s); /* existing apply */ })`
   and import `reportRenderScale` from `./ui/prefs`. When `prefs().quality === 'low'`, start the governor at its middle step (`level = 2`, scale 1.5). Optionally reduce background and particle work when `document.documentElement.dataset.quality === 'low'`.

5. Touch layout (hud.css, owned by another module). Use the CSS variables the screen already sets on the root:
   - `.touch` buttons: `--tb: calc(clamp(56px, calc(var(--u) * 16.5), 74px) * var(--touch-scale, 1));` and `opacity: var(--touch-opacity, 0.85)` on `.tbuttons` and `.stick-zone` visuals.
   - Left-handed: `html[data-left-handed='true'] .stick-zone { left: auto; right: 0; }` and move `.tbuttons` to the left edge. GameScene reads both rects live, so it follows.

6. Keyboard remap (Controls.ts). `import { withKeyOverrides, KeyAction } from '../ui/prefs';`
   - In `KeyboardSource.read()`, when `scheme === 'solo'`, use `const m = withKeyOverrides(KEYMAPS.solo)` instead of `KEYMAPS[this.scheme]`.
   - `GAME_KEYS` is built once at module load, so an overridden code (e.g. KeyI) is not in it. Make the keydown suppression check also accept codes from `withKeyOverrides(KEYMAPS.solo)`, or rebuild the set when the prefs change.
   - Optional: `KEY_LABEL.solo` for the how-to screen can use `codeLabel` exported from `./ui/settingsScreen`.

7. Nothing else needs importing. settingsScreen.ts imports its own CSS, and it uses the global `.update-btn.inline` class from roster.css.