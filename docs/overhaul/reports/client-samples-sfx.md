Done. `Samples.ts` is new, `Sfx.ts` now uses the shared context and layers recorded samples under the synth. `tsc` is clean for both files. Nothing was run in a browser, and the pack's `manifest.json` does not exist yet, so the sample path is untested at runtime.

**Files**
- `C:\Users\vascu\Projects\bladerift\packages\client\src\audio\Samples.ts` (new, CRLF to match the checkout)
- `C:\Users\vascu\Projects\bladerift\packages\client\src\audio\Sfx.ts` (edited)

**What changed**
- `Samples.ts` exports `getAudioContext()` (one lazily created AudioContext for the game), `samples`, `SAMPLE_NAMES`, `SAMPLE_ALIASES` (e.g. `'hit'` maps to `hitLight`, `'throw'` is itself a name), the `SampleName`/`SampleId` types, `SFX_VOLUME_DEFAULT` (0.8).
- `samples.play(id, {gain, rate, pan})` picks a random variant, multiplies variant gain × opts.gain × sfx volume, uses a 0.94–1.06 rate wobble unless `rate` is given, pans, and caps 6 concurrent per id and 32 total.
- The manifest loads and decodes on unlock or first play. Failures are throttled to a retry every 30 s, and a missing pack is silent.
- `samples.has(id)` is false until decode completes.
- Samples route into Sfx's mix bus, so the compressor and master volume still apply.
- `Sfx.unlock()` takes the shared context instead of creating its own and calls `samples.setOutput(this.mix)`. All existing Sfx methods and exports are unchanged.
- `Sfx.play()` checks each event's recorded layer. The sample is positioned with the same distance curve as the synth, and a 30 ms burst guard applies. The synth stays at a set level under it, or is dropped.
- The synth also follows `sfxVol` relative to 0.8, so sfx at 0 mutes everything.
- New `SfxName` `'land'` with a soft synth thump. Nothing calls it yet.

**Layer map (sample, synth level kept under it)**
- hit: hitLight 0.35
- headshot: hitCrit 0.4
- impact: hitHeavy 0.35
- punch: hitLight 0.4
- hurt: hitHeavy 0.5
- slam: hitHeavy 0.4
- shieldHit: block 0.35
- dodgeShield: parry 0.4
- swing: whoosh 0.35
- crescent: whooshHeavy 0.4
- blink and jetStart: whoosh 0.5 and 0.6
- dodgeLion, Vault, Gate, Pole, Clay, Mirage, Page: whoosh 0.6
- dodgeBeast, Charge, Shadow: whooshHeavy 0.6
- dodgeFog and artFog: wind 0.5
- specInk: wind 0.5
- specEmber: fire 0.5
- specDirk and specScalpel: slash 0.5
- grenadeThrow: throw 0.4
- kill: koThud 0.4
- matchEnd: koThud 0.6
- death: bodyFall 0.5
- matchStart: uiStart 0.5
- uiClick: uiSelect 0 (sample only)
- uiHover: uiMove 0 (sample only)
- land: land 0 (sample only)

Jump has no SfxName, so there is no jump layer. Samples are not yet mapped to `step`, `fire` or `wind` beyond the entries above.

**Verification**
- `npx tsc -p packages/client --noEmit`: no errors in `audio/Samples.ts`, `audio/Sfx.ts`, `audio/Music.ts` or `audio/Announcer.ts`. The only error is `ui/modes.ts(8,46)`, which is another agent's file (`./stats` is missing).
- Not verified: decoding, playback, and the layering sound in a browser. `public/assets/audio/manifest.json` does not exist yet. The `.cache/assets/sfx-*` folders hold raw sources, not the built pack.

**Notes for the lead**
- `prefs.ts` has no `sfxVol` key yet. `syncSampleVolume()` reads it defensively and falls back to 0.8, so this works once the key lands.

INTEGRATION
1. `packages/client/src/ui/App.ts`: no change needed for unlock. `sfx.unlock()` already runs on pointerdown and keydown, and now also starts the shared context and the sample pack.
2. `packages/client/src/ui/App.ts` (settings input handler, near line 487): add `import { syncSampleVolume } from '../audio/Sfx';` and after `setPref(k, v as never);` add `if (k === 'sfxVol') syncSampleVolume();`. Widen the `k` union to include `'sfxVol'`. Requires `sfxVol` in `Prefs` (controls-prefs owner).
3. `packages/client/src/game/GameScene.ts` (optional, landing): where a fighter lands on the ground, call `sfx.play('land', { x: v.x, y: v.y })`.
4. `packages/client/src/game/GameScene.ts` (optional, footsteps): `import { samples } from '../audio/Samples';` then `samples.play('step', { pan: 0 })` or with a pan from the fighter position.
5. `packages/client/src/audio/Music.ts` and `Announcer.ts` already import `getAudioContext` from `./Samples`. Nothing further needed.