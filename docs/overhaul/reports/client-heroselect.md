Both files are written, `tsc -p packages/client --noEmit` is clean (the earlier `modes.ts` error is gone), and the layout is checked at the four sizes plus a portrait phone.

**Files (new, only these two touched)**
- `C:/Users/vascu/Projects/bladerift/packages/client/src/ui/heroSelect.ts`
- `C:/Users/vascu/Projects/bladerift/packages/client/src/ui/heroSelect.css` (imported by the module itself, so no `main.ts` change is needed)

**Exports**
- `mountHeroSelect(root, opts): { destroy(): void }`
- `interface HeroSelectOpts { hero; color; name; onHero; onColor; onName; onDone; onCursor? }`

**What it shows (same data as `App.renderFighter`)**
- Left: the cursor hero's portrait (`assets/art/h-NN.jpg`), a live sprite via `animatePreview`, a class tag, and a name plate in Lilita One, italic and skewed. Below it, the 12 player-colour swatches.
- Centre: 14 square face tiles in 8 class groups, four per row. Solo groups (Saber and Shielder) are centred in their cell with no holes. True/False/Extra tags. Both the cursor tile and the picked tile glow in the player colour (`--pc`).
- Right: class name and title, lore, Power/Speed/Health/Reach bars, traits, class blurb, then Special, Dodge, Rift Art and Signature weapon, plus the weapon note.
- Header: back, title, name field (16 chars), Done.

**Behaviour**
- Hover moves the cursor and calls `onCursor`. Leaving the grid returns the cursor to the picked hero, without a sound.
- Click picks (`onHero`).
- Arrow keys or the gamepad d-pad move the cursor. Left and right follow reading order; up and down take the nearest column in the next row.
- Space or gamepad A picks. Enter picks and finishes.
- Escape, gamepad B or Start calls `onDone`.
- Keys are ignored while the name field has focus, where Enter and Escape blur it.
- The module keeps its own state. `destroy()` removes the key listener, the gamepad loop and the DOM.

**Verified**
- `tsc -p packages/client --noEmit`: clean.
- Dev server, checked with DOM measurements:
  - 1280x720: no overflow, tiles 69 px.
  - 1920x1080: no overflow, tiles 90 px.
  - 844x390: no overflow, tiles 40 px.
  - 667x375: no overflow, tiles 30 px (the smallest size).
  - 390x844 portrait: no horizontal overflow. The stack scrolls vertically (about 1200 px), as the safety net.
- Keyboard logic was exercised by dispatching key events: arrows moved the cursor, `onCursor` fired, Space picked, Enter finished, and destroy removed the DOM.
- The sprite preview renders (canvas visible, about 112x311 px at 1280x720).

**Not verified**
- Real mouse hover and click, gamepad input, and touch on a device.
- The final screenshot at 1280x720 was cropped by the pane, so the visual check at that size is by measurement only.

**Unfinished or caveats**
- On screens 480 px high or less, lore, class blurb and the weapon note are hidden to fit. That drops some text the fighter screen shows.
- Tiles are 30 to 40 px on phone landscape, close to the fighter screen's existing short-screen size.
- The module plays no sounds. `onCursor` is the hook; the lead should play `uiMove` there and `uiSelect` in `onHero`.
- Escape and gamepad B both call `onDone`. If the app also has a global back handler, it could fire twice.
- I started the Browser pane's preview server (`preview-local_5f8c72bf-...`) and did not stop it.

INTEGRATION
- Import: `import { mountHeroSelect } from './heroSelect';` in `packages/client/src/ui/App.ts`. No `main.ts` change; the CSS comes in through the module.
- Host: in `render('fighter')`, replace `renderFighter()` with `<div class="screen screen-fighter" id="hsel-host"></div>`. Keep `.screen` so it gets the screen shell, or use any positioned element that fills the viewport. The module makes the root positioned if it is static.
- Field: `private heroSel?: { destroy(): void };`
- Mount: at the end of `bind()` when `this.screen === 'fighter'`:
  ```ts
  this.heroSel?.destroy();
  const p = this.profiles[this.editing];
  this.heroSel = mountHeroSelect(this.ui.querySelector<HTMLElement>('#hsel-host')!, {
    hero: p.load.hero, color: p.color, name: p.name,
    onHero: (id) => { p.load = sanitizeLoadout({ ...p.load, hero: id }); sfx.play('uiSelect'); saveProfile(this.editing, p); },
    onColor: (i) => { p.color = i; sfx.play('uiClick'); saveProfile(this.editing, p); },
    onName: (s) => { p.name = s; saveProfile(this.editing, p); },
    onDone: () => { this.heroSel?.destroy(); this.heroSel = undefined; this.act('back', this.ui.querySelector<HTMLElement>('[data-act="back"]')!); },
    onCursor: () => sfx.play('uiMove'),
  });
  ```
  Use the real `sfx` names from `audio/Sfx.ts` if they differ.
- Teardown: call `this.heroSel?.destroy(); this.heroSel = undefined;` at the top of `show()`, before the re-render, and on any screen change. Otherwise the key and gamepad listeners stay live.
- The module keeps its own state, so re-mounting on every change is not needed. The `profiles` objects are updated in the callbacks.
- `renderFighter`, `bindFighter` and the `hs-*` rules in `roster.css` can be removed once this is wired in. The module does not depend on them.