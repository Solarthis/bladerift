Created `packages/client/src/game/koSequence.ts`. Nothing else was edited. `tsc -p packages/client --noEmit` reports no errors in this file. The two errors it does report are in other agents' files: `audio/Sfx.ts` (`syncSampleVolume`) and `ui/modes.ts` (`./stats`). I have not run it in the browser, so the timing and pinning are checked against the existing `lighting.ts` and `cinematic.ts` conventions only.

## Exports
- `playKoSequence(scene, opts: KoSequenceOpts): KoHandle`. `KoHandle = { done: Promise<void>; cancel(): void }`.
  - Opts exactly as specified. `x`/`y` are the victim's world position: a short impact ring starts there.
  - `winnerName` is accepted but not drawn here, since `playRoundWinner` draws the name.
  - `winnerColor` tints the rings.
  - Word priority: `timeOver` gives "TIME OVER", else `draw` gives "DOUBLE K.O.", else "K.O.".
  - `PERFECT` shows whenever `perfect` is true, including on draws and time-outs. Pass `perfect: false` there if that is not wanted.
- `playRoundWinner(scene, opts: RoundWinnerOpts): KoHandle`. Opts `{ name, color, finalWin }`. Shows "<NAME> WINS" or "WINNER!!". It slides in from the right over 0.26 s, holds to 1.15 s, and slides out to the left by 1.4 s. The banner is a slanted plate with a `color` stripe.
- `destroyKoSequence(scene?)`. Ends the sequences of that scene, or of every scene if omitted. No-op when idle, safe to repeat, and safe after shutdown.

## Timing and behaviour
- Flash: 80% white fading over 300 ms. Skipped when `artFinish` is true.
- `onSlowmo(0.25, 450)` is called once, synchronously.
- Word: slams from 2.6x to 1x with back-ease overshoot over 400 ms, holds to 2.0 s, fades by 2.35 s.
- Rings: a white disc and ring behind the word over 700 ms. A tinted ring bursts from the victim over 500 ms.
- PERFECT: slams in at 260 ms under the word, then fades with it.
- Font: `'Lilita One'`, the display face from `styles.css`. The text is redrawn once the face loads.
- Everything is pinned to screen space every frame using the `lighting.ts` convention (position `W/2 + (t - W/2)/zoom`, scale `1/zoom`). Words are fitted to 92% of the screen width.
- Each sequence runs on its own `POST_UPDATE` listener and destroys its objects when it ends or when the scene shuts down.
- Depths: rings 59, text 60, flash 60.5.
- No `Math.random`. Real time via `scene.time.now`.

## Problems to be aware of
- The `'ko'` event does not say whether the round ended on the clock or in a draw. The `'round'` event has `why` (0 = K.O., 1 = time over) and a `winner` that is 0 or 1 unless it is a draw. In the event order `'ko'` comes before `'round'` in the same batch. So the call site that knows `timeOver`/`draw` is the `'round'` case, and that case needs the victim position stored from `'ko'`.
- `koCinematic` already draws its own 320 ms flash and a light burst on `'ko'`. Calling both doubles them. Either call `koCinematic` only when there is an Art finish, or accept the overlap.
- `stepSlowmo` is fixed at 0.25x for 0.4 s. It ignores the `(scale, ms)` arguments, so the 450 ms is not honoured unless `stepSlowmo` is parametrised.

## INTEGRATION (for the lead; GameScene.ts is not edited)
1. Imports, after the `./cinematic` import at GameScene.ts:18:
   `import { playKoSequence, playRoundWinner, destroyKoSequence, type KoHandle } from './koSequence';`
2. `case 'ko'` (GameScene.ts:2070-2090): keep `this.slowT = 0`, `sfx`, `shake`, and sparks. Replace the `koCinematic` call and the `this.flash(...)` fallback with:
   `this.koHandle = playKoSequence(this, { x: v?.x ?? 0, y: (v?.y ?? 0) - 30, perfect: false, timeOver: false, draw: false, artFinish: <true only if the attacker was mid-Art, then koCinematic does its white-out>, winnerName: '', winnerColor: 0xffffff, onSlowmo: () => { this.slowT = 0; } });`
   Set `perfect`, `timeOver`, `draw`, `winnerName`, `winnerColor` from the attacker's view (`find(e.a)`) and the `'round'` event, as in the note above. Keep the call in `'ko'` if the `'round'` case cannot be used.
3. Round result: after the K.O. handle resolves, play the banner: `this.koHandle.done.then(() => playRoundWinner(this, { name: w.name, color: w.accent, finalWin: false }))`. For the match, call `playRoundWinner(this, { ..., finalWin: true })` from `case 'match'` (GameScene.ts:2097).
4. Cleanup: optionally `destroyKoSequence(this)` in the scene's shutdown path. Sequences already self-destroy on SHUTDOWN.
5. Optional: to honour `(scale, ms)`, add `slowScale`/`slowLen` fields and use them in `stepSlowmo` (GameScene.ts:1690-1702).