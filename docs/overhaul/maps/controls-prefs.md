**Technical map (read-only; no files edited)**

**Controls.ts** (`packages/client/src/input/Controls.ts`)
- `Intent` 8-12 (`moveX`, `moveY`, `buttons`). `KeyScheme = 'solo'|'p1'|'p2'` 14. `KeyMap` interface 16-27 (fields: left, right, down, jump, a, b, skill, roll, heal, special; each a `string[]` of `KeyboardEvent.code`).
- `export KEYMAPS: Record<KeyScheme, KeyMap>` 29-44: solo 30-34 (A/D/S/W + arrows, J/K/L/Shift/H/U, Space jump), p1 35-38 (WASD, F/G/H/ShiftLeft/R/T), p2 39-43 (arrows, Comma/Period/Slash/ShiftRight/Quote/Backslash, Numpad 0-4, Enter).
- `export KEY_LABEL` 47-51: display strings for the how-to screen, same shape.
- `GAME_KEYS` 54: union of all bound codes, used to suppress page scroll and button clicks.
- Global listeners, bound once via `bindKeys()` 58-77: keydown/keyup fill a `held` Set; keydown calls `preventDefault` and blurs a focused button when `body.dataset.screen === 'game'`; window blur clears `held`.
- `InputSource` 81-84 (`read(): Intent`, `destroy()`). `KeyboardSource(scheme)` 86-103 maps held codes to `Btn.*` bits at 93-99.
- `GamepadSource(index)` 105-129: Standard mapping. Deadzones 0.25 (x) and 0.4 (y). D-pad 13-15. Jump 0/12, A 2, B 3, Special 6/7, Skill 5, Roll 1, Heal 4.
- `MergedSource(sources[])` 132-149: OR of buttons, max-magnitude X.

**Touch** (same file)
- `TouchButtonState` 153-168: `aIcon, bIcon, skillIcon, artIcon, skillCd, rollCd, reload, crescent, flask, rift`.
- `BUTTONS` 172-180: `{id, bit, label, cls}`. Ids and classes: `a`/`tb-a` (Light caption), `b`/`tb-b` (Heavy caption), `skill`/`tb-skill`, `jump`/`tb-jump`, `roll`/`tb-roll`, `heal`/`tb-heal`, `art`/`tb-art` (bit `Btn.Special`).
- Stick constants 202-207: `STICK_R=46`, `STICK_ON=0.34`, `STICK_OFF=0.24`, `STICK_FULL=0.8`.
- `export class TouchSource(parent)` 210-382. The constructor 226-297 builds the DOM: `.touch` > `.stick-zone` > `.stick-base` (with `.sd-u/d/l/r`, `.stick-arrow`, `.stick-knob`), `.tbuttons` containing `.tb.tb-<id>[data-b]` (each with `i`, `span`, `em`), and `.touch-hint`. The stick is floating: the base is placed at the pointerdown point (242-250).
- Tap accumulation: `tapped` bits 283, cleared on `read()` 330-339. Stick dead zone with hysteresis 335-337.
- `show(s: TouchButtonState)` 342-376: icons via inline `background-image`; jump/roll/heal use fixed `assets/art/i-jump.jpg`, `i-roll.jpg`, `i-heal.jpg` (354-356). `--cd` sweeps: skill←skillCd, roll←rollCd, a←reload, b←max(reload, crescent) (357-361). Art `--fill`, `.ready`, and the READY/% label (363-370). Heal count in `em` and `.empty` (373-375).
- Art hint: `HINT_KEY='bladerift.hint.artHold.v1'` 183; `hintSeen`/`markHintSeen` 185-200 (localStorage, guarded); `maybeHint` 322-328.
- `isTouchDevice()` 384.
- Layout is not in the TS. CSS is authoritative: `styles.css` 917-931 (`.stick-zone` left 0, top 22%, width 46%; `.stick-base` 124px, fixed); `ui/hud.css` 561-586 (`.touch` vars `--tb = clamp(56px, var(--u)*16.5, 74px)`, `--tg: 8px`, `--step`; `.tbuttons` bottom-right 3x3 grid; per-tile offsets 574-580). `GameScene.ts:3171-3172` reads the `.tbuttons` and `.stick-base` rects. `App.ts:812-813` creates `TouchSource`, `App.ts:831-834` calls `show()`.

**prefs.ts** (`packages/client/src/ui/prefs.ts`)
- `Prefs` interface 5-20: `damageNumbers`, `shake` (0..1), `haptics`, `faceMove`, `highRefresh`, `fullscreen`, `volume` (0..1).
- `KEY='bladerift.prefs'` 22; `DEFAULTS` 23 (true, 1, true, true, false, true, 0.8); module `cache` 24.
- `export prefs(): Prefs` 26-45: lazily parses one JSON blob from localStorage (try/catch), coerces booleans, clamps `shake` and `volume`, caches.
- `export setPref<K>(k, v)` 47-55: updates cache and writes the whole object back.
- `export canFullscreen()` 58; `export enterFullscreen()` 64-72 (gated on `fullscreen` pref and coarse pointer; requestFullscreen then landscape lock); `export buzz(pattern)` 75-85 (gated on `haptics` and user activation).
- **Gap:** the BRIEF contract requires `musicVol`, `sfxVol` and `voiceVol` (defaults 0.6 / 0.8 / 0.9). None exist in `Prefs` or `DEFAULTS`. Unknown keys are also dropped on the next `setPref` write, since only named fields are kept.

**pacing.ts** (`packages/client/src/game/pacing.ts`)
- `TARGET = 1000/60` 17; `SCALES = [2, 1.75, 1.5, 1.25]` 19.
- `export class FramePacer` 21-86: `vsync` 23 (estimated from min of last 48 RAF deltas, 44-54); `full` 25 (high-refresh flag); ring buffers `work`/`gaps` (Float32Array 240) 27-29; `steps` 30; `onStep` 32; `wrap(cb)` 39; `tick(time, cb)` 43-67 (cadence `n = full ? 1 : floor(TARGET/vsync + 0.1)` at 58, skip test at 59); `stats(n)` 70-85.
- `export installPacer(loop, pacer)` 94-99: monkey-patches `loop.raf.start` and `loop.raf.callback`.
- `export class ResolutionGovernor(apply)` 105-144: `level` 106, `scale` getter 112-114, `step(gap, vsync, dt)` 117-136 (late if gap > max(TARGET, vsync)*1.5+1; 3 s window at 126; step down if missRate > 0.12 at 131; hold 4 at 134), `reset()` 139-143.
- Ambiguity: `dt` units are undocumented. The 3 s window and `hold=4` imply seconds, so the caller must pass seconds.