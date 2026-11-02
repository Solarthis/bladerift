Sfx.ts map (read-only, nothing edited). File is 1802 lines.

**Exports**
- `type SfxName` 13-32: about 89 ids (weapons, UI, flags, Rift Arts, dodges, specials).
- `DODGE_SOUNDS` 35-38, indexed by hero id (heroes 7 and 8 both map to `blink`). `SKILL_SOUNDS` 41-44, indexed by SkillId.
- `class Sfx` 164. `export const sfx = new Sfx()` 1800. DEV-only `globalThis.__sfx` 1801.
- Not exported: `ART_SOUNDS` 47-50, used by `playArt` 383-385 (falls back to `artRadiant`).
- `PlayOpts {x?, y?, volume?, pitch?}` 52-57.
- Public methods: `volume` get/set 189-199; `unlock()` 202-219; `setListener(x,y)` 222-225; `play(name, opts)` 227-234; `playArt(art, opts)` 383; `setJet(intensity)` 388-393.

**Synthesis**
- `synth()` 288-380 is a switch over every SfxName, with no default. Each `sXxx(o)` calls `spawn(name, o, durSec, reverbSend)` (560), then layers `tone()` 715-762 (oscillator, exponential pitch ramp, optional WaveShaper drive) and `noise()` 765-825 (looped white or pink buffer through a biquad, random read offset at 814). Example: `sPistol` 831-839.
- Drive curve: tanh, amount 3.2, lines 80-90.
- Reverb: one ConvolverNode with a synthetic 1.7 s impulse (`makeImpulse` 459-472), fed by per-voice sends (619-625). Return gain 0.55 (423).
- Baking: `BAKED` list 136-139 (19 names), 3 variants each, 2.6 s OfflineAudioContext renders, silence trimmed (148-162). `bakeAll` 253-286 swaps `this.ctx` to the offline context. `playBaked` 237-250 picks a random variant and applies pitch jitter (`BAKE_JITTER` 142). Until baked, the live synth runs.
- Positional: `FULL_DISTANCE` 300 and `SILENT_DISTANCE` 1600 (144-145). Attenuation `(1-far)^1.6`, pan `dx/900`, lowpass `18000*0.085^far` (584-590). Centred sounds skip the lowpass and panner (615-617).

**Voices and limits**
- `spawn` 560-643. Same name and same position type within 30 ms is dropped (591-598). Per-name caps `VOICE_CAPS` 93-126. `DEFAULT_VOICE_CAP` 6 (127). `MAX_VOICES` 32 (128).
- `enforceLimits` 654-665. `steal` 668-682 fades out over 15 ms. `cull` 645. `disposeVoice` 684. Auto-dispose timer at 641.

**AudioContext and unlock**
- `unlock()` 202-219: `window.AudioContext ?? webkitAudioContext` (204-205), `new Ctor()` (208), then `initGraph` (212), `installResumeHandlers` (213, pointerdown/touchstart/keydown at 545-554), `bakeAll` (214).
- App.ts:103-104 call `sfx.unlock()` on capture-phase pointerdown and keydown.
- `play()` 227-234 returns silently when there is no context, volume is 0, or baking is active. It resumes a suspended context (230). There is no visibilitychange handler.
- Graph 399-433: mix (404) → DynamicsCompressor (407-412) → master (414) → destination (430).

**Volume**
- Default `_volume = 0.8` (165). Applied to the master gain (415) and live via `setTargetAtTime` (193-198). Setter clamps to 0..1 (194).
- Set at App.ts:105 (`sfx.volume = prefs().volume`) and App.ts:487 (on pref change, `k === 'volume'`).
- No `sfxVol` key exists in client src. `ui/prefs.ts` has no SFX channel.

**Call sites (all of packages/client/src)**
- App.ts: 16 import; 103-104 unlock; 105 volume init; 475 and 510 `play('uiClick')`; 487 volume update.
- GameScene.ts: 13 import; 3163 `setListener(me.x, me.y)` every frame.
- GameScene.ts play sites: 1025 impact; 1215 swing (pitch by weapon); 1232 explosion; 1895 hit or impact; 1921 and 1938 shieldHit; 1950 shieldBreak; 1973 specGate; 1979 crescent; 1989 `names[e.kind]` (array 1987: arrow, grenadeThrow, frost, trapSet, arcane, orb); 2001 slam; 2009 impact; 2018 pickupHealth; 2024 railgun (inside the `blink` event, 2021-2024); 2060 chains; 2065 starfall; 2074 death; 2092 matchStart; 2095 kill; 2098 matchEnd.
- `playArt`: GameScene.ts:2036, using `e.art`.
- Table-driven: `DODGE_SOUNDS` at 2383, `SKILL_SOUNDS` at 2731.

**Findings for the overhaul**
- About 25 SfxName members have synth code but no call site: pistol, smg, rifle, shotgun, sniper, rocket, reload, dryFire, pickupWeapon, pickupGrenade, headshot, hurt, jetStart, spawn, uiHover, countdown, punch, grenadeBounce, launcher, pickupShield, flagTake, flagCap, flagReturn, flagDrop, zoneClose. They look like leftovers from the Skyfire shooter scaffold (guns, CTF, zone).
- `setJet` (388) has no caller, so the jet loop never runs.
- The `blink` event plays `railgun` (GameScene.ts:2024), not the dedicated `blink` sound.
- The BRIEF sample ids (hitLight, hitHeavy, hitCrit, slash, whoosh, block, parry, koThud, uiMove, uiSelect, uiBack, and others) do not match SfxName ids.
- Music.ts, Announcer.ts and Samples.ts do not exist yet. `audio/` contains only Sfx.ts.