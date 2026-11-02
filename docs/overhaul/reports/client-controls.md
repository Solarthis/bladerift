Controls.ts now honours `keys`, `touchScale`, `touchOpacity` and `leftHanded`, with a live `refreshControls()`. `npx tsc -p packages/client --noEmit` reports nothing for `input/Controls.ts`. The only error is `ui/modes.ts(8,46)` (`./stats` missing), which is another agent's file. I did not run the game in a browser, so the touch feel is unverified.

**File changed:** `C:\Users\vascu\Projects\bladerift\packages\client\src\input\Controls.ts` (only file edited)

**Prefs (read defensively, defaults in brackets):**
- `keys`: object keyed by solo action (`left, right, down, jump, a, b, skill, roll, heal, special`). Each value is a `KeyboardEvent.code` string or string array (max 4, malformed entries dropped). A remapped action uses only its new keys. Other actions keep the defaults.
- `touchScale` [1], clamped 0.6–1.6.
- `touchOpacity` [0.9], clamped 0.2–1.
- `leftHanded` [false], true only when `=== true`.
- Note: `prefs()` in `ui/prefs.ts` currently copies only its named fields, so these four must be added there or they never reach `controlPrefs()`.

**Throw and launcher on touch:** a button press (or a press held) opens a 160 ms chord window. Inside it:
- Down threshold drops from 0.6 to 0.3, so down (moveY=1) registers with the tap.
- Stick start threshold drops from 0.34 to 0.2.
- Any push past the dead zone reads at least moveX 0.6, which the sim's turn and throw thresholds (0.5) accept.
- Btn semantics and gamepad code are unchanged.
- Trade-off: a Light tap while the stick drifts down past 0.3 now becomes a launcher. Tune `CHORD_*` at the top of the touch section if that is too eager.

**Layout:** `--tb` is set inline on `.touch` (so `--step` follows), the stick uses `scale`, and left-handed mirrors the zone, cluster and hint with inline styles. Button opacity is inline with exceptions for the pressed, glowing-Art and empty-flask states. The root gets class `lefty` for stylesheet hooks.

**Exports added:** `ControlPrefs`, `controlPrefs()`, `KeyOverrides`, `KeyMap` (now exported), `keyBindings(scheme)`, `keyLabels(scheme)`, `codeLabel(code)`, `refreshControls()`, `touchLeftHanded()`. `TouchSource` gained `refresh()`, and `KeyboardSource` reloads the remap in its constructor.

**Unfinished:**
- `hud.css` `.touch-hint::after` (right: 22px) still points right when left-handed. Needs `.touch.lefty .touch-hint::after { right: auto; left: 22px; }` from the CSS owner.
- `KEY_LABEL` is static, so the how-to screen needs the App change below to show remapped keys.

## INTEGRATION

1. **App.ts, import:** add `refreshControls` and `keyLabels` to the existing import from `'../input/Controls'`.
2. **App.ts, Settings handler:** after each `setPref` for `keys`, `touchScale`, `touchOpacity` or `leftHanded`, call `refreshControls()` with no arguments. It is safe at any time.
3. **App.ts, `renderHowto()`:** replace `const k = KEY_LABEL;` with `const k = { ...KEY_LABEL, solo: keyLabels('solo' as KeyScheme) };`. The how-to paragraph "joystick on the left, buttons on the right" should also flip when `controlPrefs().leftHanded` is true.
4. **App.ts, match start (around line 810):** no change. `KeyboardSource` and `TouchSource` read the prefs when constructed.
5. **GameScene.ts, `touchInsets()`:** import `touchLeftHanded` from `'../input/Controls'`. Replace the two `this.insets.*` assignments (keep the existing `cluster` and `stick` rect reads and `k`) with:
```ts
const lefty = touchLeftHanded();
const clusterIn = cluster && cluster.width > 0 ? (lefty ? Math.max(0, cluster.right) : Math.max(0, css - cluster.left)) * k * 0.7 : 0;
const stickIn = stick && stick.width > 0 && clusterIn ? (lefty ? Math.max(0, css - stick.left) : Math.max(0, stick.right)) * k * 0.45 : 0;
this.insets.left = lefty ? clusterIn : stickIn;
this.insets.right = lefty ? stickIn : clusterIn;
```
6. **styles or hud.css (not my files):** add `.touch.lefty .touch-hint::after { right: auto; left: 22px; }`.