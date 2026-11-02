Both modules are written and type-check clean. Runtime is unexercised: `public/assets/audio/manifest.json` does not exist yet, so everything is a silent no-op today.

**Files (new)**
- `C:\Users\vascu\Projects\bladerift\packages\client\src\audio\Music.ts`
- `C:\Users\vascu\Projects\bladerift\packages\client\src\audio\Announcer.ts`

**Verification**
- `npx tsc -p packages/client --noEmit`: no errors in `audio/`. The only error is `ui/modes.ts(8,46)` (missing `./stats`), which is not mine.
- Imports `getAudioContext` as a named export from `./Samples`, as Samples.ts exports it. It creates the context lazily and returns `null` when Web Audio is unavailable.

**What the code does**
- Music: two `HTMLAudioElement` slots, each wired via `MediaElementSource` into a duck gain, then a volume gain, then destination. A new track starts only on `canplay`, then crossfades (default 0.8 s). `loop` comes from the manifest. `duck(amount, ms)` holds, then returns over 300 ms. Pauses on `document.hidden` and resumes after. A missing id or file leaves the current track playing. A load error reverts the wanted track to the one still audible.
- Announcer: each voice file is fetched and decoded once and cached. Lines are scheduled back to back on the context clock, so they never overlap. `say(id, {delay})` honours the delay from call time. The queue is capped at 4 waiting lines. `stop()` is an extra beyond the contract, for leaving a match.
- `unlock()` on both is cheap to call on every gesture. Music also primes idle elements with a silent WAV, for iOS.

**Caveats**
- `ui/prefs.ts` has no `musicVol` or `voiceVol`. `prefs()` drops unknown keys, so `readVolumePref` returns the defaults (0.6 / 0.9) until the lead adds both to `Prefs`, `DEFAULTS` and the `prefs()` normalizer. I did not edit `prefs.ts`.
- The manifest promise is cached for the session, including a failed fetch. A transient network error silences audio until reload.
- iOS Safari is untested. Later tracks start after an async `canplay`, which may be refused without a gesture. `unlock()` retries the live track.
- Music `play()` also stores the wanted id before the manifest arrives, so an early `play()` is not lost.

## INTEGRATION

Imports:
```ts
import { music } from './audio/Music';
import { announcer } from './audio/Announcer';
```

Calls:
- **App.ts, next to `sfx.unlock()` on capture-phase pointerdown and keydown:** `music.unlock(); announcer.unlock();`
- **App.ts, volume init and on pref change (where `k === 'volume'` is handled):** `music.setVolume(p.musicVol); announcer.setVolume(p.voiceVol);`. Works only after `Prefs` gains `musicVol` (default 0.6) and `voiceVol` (default 0.9).
- **Title / menus:** `music.play('title')` on boot. `music.play('select')` on the hero select screen. `music.play('results')` and `music.play('victory')` on the end screens.
- **GameScene.ts match start, per arena:** `music.play('stage-hall' | 'stage-bridge' | 'stage-embers' | 'stage-crypt' | 'stage-grove')`.
- **Leaving a match:** `music.stop(0.6); announcer.stop();`
- **Round flow:** `announcer.say('round1')`, then `announcer.say('fight', { delay: 0.2 })`. Use `round2`, `round3`, `finalRound`, `ready`, `ko`, `perfect`, `timeOver`, `youWin`, `youLose`, `draw`, `winner`, `gameOver`, `newChallenger`, `continue` as the flow needs.
- **Big moments (optional):** `music.duck(0.35, 900)` on K.O. or a super. Announcer lines do not duck music automatically.