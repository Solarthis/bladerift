Files: `C:\Users\vascu\Projects\bladerift\packages\client\src\ui\moveList.ts` and `C:\Users\vascu\Projects\bladerift\packages\client\src\ui\moveList.css` (both new, the only files I touched).

**Exports (moveList.ts)**
- `showMoveList(root: HTMLElement, heroId: number, onClose: () => void): void`
- `GENERAL_CONTROLS: GeneralControl[]` (the universal-system rows; shown at the end of every panel)
- `inputHtml(input: string): string` (notation to button-glyph HTML, reusable elsewhere)
- Types: `MoveList`, `MoveEntry`, `ComboEntry`, `GeneralControl`

**Behaviour**
- Hero name, weapon and style line in the header. Sections: Normals (normal, heavy, launcher), Specials (special, dodge), Air (air, plunge), Throws (throw), EX and Rift Art (ex, art), Combos. Empty sections are hidden. Unknown kinds fall under Normals with a kind tag.
- Each row: name, damage (array shown as `90 / 95 / 132 dmg`), notes, and the input as glyphs. LIGHT, HEAVY and SPECIAL are round buttons; JUMP, DODGE and ART are pills; arrows are boxed glyphs; `+` and `,` are spacing; `(close)`, `(air)`, `(hold)` are tags. The glyph container carries the text as its `aria-label`.
- Closes on Esc (capture phase, so the key does not reach game handlers), on the Close button, or on a click/tap outside the panel (a drag that starts inside does not close it). `onClose` runs once for those closes. Calling it again while a panel is open replaces the old one without calling its `onClose`.
- Focus moves to Close on open and returns to the previous element on close. Tab stays on Close.
- Phones: full-height sheet with a 16px gutter and safe-area insets. The list body is the only scroll area (`pan-y`, `overscroll-behavior: contain`) because body has `touch-action: none`.
- Missing hero file: the panel shows "No move list for this hero yet." plus General controls, and the name falls back to `heroOf(heroId).name`.
- The glob is `import.meta.glob('./movelists/h*.json', { eager: true })`, so README.md is ignored and absent files are harmless.

**Verification**
- `npx tsc -p packages/client --noEmit`: no errors in my files. The one current error is `ui/modes.ts(8,46)`, `./stats` not found, which belongs to another agent.
- No `h*.json` exists yet, so I tested with a sample list in a scratch copy (`...\scratchpad\ml\`). Sections, kind tags, damage forms, escaping, and glyphs rendered as intended.
- Live check against the running dev server at localhost:5192 (imported `/src/ui/moveList.ts` in the browser): the overlay mounts and falls back correctly for hero 3. Esc, Close, outside click, drag-inside, and replace-while-open all behave as specified. The phone-width view (375px) has no horizontal scroll and the gutter is correct. The Browser pane is still open on localhost:5192, with the viewport reset to desktop.

**INTEGRATION**
- CSS: `moveList.ts` imports `./moveList.css` itself, so `main.ts` needs no change.
- Import (from `ui/App.ts` or the lead's module): `import { showMoveList } from './moveList';`
- Call, e.g. from a "Move list" button on hero select, the practice lobby, or a pause menu:
  `showMoveList(document.getElementById('ui')!, loadout.hero, () => { /* restore the screen or pause menu you came from */ });`
- `heroId` is the hero index 0..13 (`Loadout.hero`, the `HEROES` index). `root` should be `#ui`, not a `.screen`, so the panel survives screen changes. The overlay is `position: fixed`, `z-index: 60`.
- Do not call it when `body[data-screen='game']` would hide the panel. It is not a `.screen`, so it stays visible; just avoid calling it mid-round unless the game should pause.

**Unfinished or needs confirmation**
- The hero JSON files do not exist yet. Real data has not been rendered; the parser handles the schema in `movelists/README.md`.
- General controls, checked against `packages/shared/src/constants.ts` where possible: the launcher, air combo, EX (half gauge) and Rift Art (full gauge) texts follow the README; guard (hold down, crouch guard, chip) and parry (10-tick window, stun) and dodge (roll invuln) match the constants.
- Unverified: there is no throw code in `packages/shared` yet. The throw input `→+HEAVY (close)` comes from the README, but the throw-break input (also `→+HEAVY (close)`) and its wording are my assumption, not in any spec. Confirm both when the throw system lands; they are the `GENERAL_CONTROLS` entries "Throw break" and "Throw".