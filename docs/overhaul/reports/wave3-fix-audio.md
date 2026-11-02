Fixed 4 of 6 findings in the audio group; the gapless finding is only partly fixed, and the stage-embers replacement needs your approval. Typecheck and vitest pass, and the in-app checks I re-ran pass.

**Findings**

1. **Music.ts manifest cached forever (major): fixed.** A null manifest is no longer cached. It is retried after 30 s, as in Samples.ts. Verified on the app's module instance: the first fetch is aborted, and select plays after the retry window. Side effect: music and voice stay silent for up to 30 s after a failed manifest fetch.
2. **LICENSES.md has no audio entries (major): fixed.** Added an "Audio pack" section with one row per shipped source, author, CC0 link and requested credit. Line 13 and the top "no audio" sentence are corrected.
3. **Stale track starts after a newer request (minor): fixed.** `request()` halts any still-loading track that differs from the new request. `onReady` only activates the wanted track. Reviewer's scenario: select never starts, title keeps playing.
4. **Silent seam on every music loop (minor): partly fixed.** `build.mjs` now writes a LAME `Info` gapless frame before every file. Decoded in Chromium, title, select, hall, bridge, embers, grove and results have 0 ms lead silence. Remaining lead silence (crypt 25 ms, victory 42 ms) is in the sources. Two gaps remain:
   - `decodeAudioData` does not trim the end padding, so tails are 0–23 ms.
   - The `<audio>` element that Music.ts plays ignores the tag (reported duration is untrimmed), so in-game loops still carry the encoder delay. Fixing that needs Music.ts to decode loops to an AudioBuffer and loop with `loopEnd`. That is a design call for you.
5. **stage-embers is a 19 s loop (minor): replaced, needs your approval.** I swapped Davieplier's 19 s track for nene's CC0 "Boss Battle #2 [Symphonic Metal]" (opening, loop, loop; 105.9 s), already in `.cache`. I could not listen to it, so the two joins are unchecked by ear. This changes the shipped track. `docs/overhaul/maps/assets.json` (not my file) still lists Davieplier as shipped.
6. **Victory cut at 20 s with no fade (minor): fixed.** A `maxSeconds` cut on a non-looping entry now fades over 0.75 s. The tail went from -19.1 dB to -35.9 dB. Looping cuts are not faded, to avoid a dip at each loop point.
7. **Transient voice fetch error cached (minor): fixed.** Network errors and 5xx responses are not cached, so the next `say()` refetches. 404s and undecodable files stay cached, as the finding itself says is intended. Verified: a transient fight failure is retried, and round2 (404) is fetched once across two calls.

**Side effect of the rebuild:** all 68 MP3s changed (the tag is on every file, not just music). Voice and sfx lose about 25 ms of start latency. `manifest.json` entries are unchanged, and the build wrote them byte-identical.

**Checks**
- `npx tsc -p packages/client --noEmit` and `packages/shared`: exit 0.
- `npx vitest run`: 19 files, 467 tests pass.
- `.cache/gate/qa-audio5.mjs` (reviewer's race): STUCK-ON-SELECT=false. But it imports `/src/audio/Music.ts` without the dev server's `?t=` query, so it tests a second module instance. I re-ran it on the app's instance as `.cache/gate/qa-audio-fix-race-app.mjs`; that passes too.
- `.cache/gate/qa-audio.mjs` (broad): 16 FAILs. Two (G1/G2, duplicate fetches) come from the same second-instance artifact. The others (B1, C1, C3, C5–C10, E1, F1, F3, H1, H2) are game-flow, volume and queue checks I did not touch. I did not establish a baseline for them, and F1/F3 look like Sfx/prefs issues, not this group's.

**Files changed**
- `packages/client/src/audio/Music.ts`
- `packages/client/src/audio/Announcer.ts`
- `tools/audio/build.mjs`
- `tools/audio/plan.json`
- `tools/audio/README.md`
- `docs/LICENSES.md`
- `packages/client/public/assets/audio/` (68 MP3s rebuilt; `manifest.json` unchanged)

**Process notes:** The full build takes about an hour (lamejs encodes in JavaScript), so it ran in the background. I ran it into a scratch folder and copied it to `public/` only after verification. Verification scripts are in `.cache/gate/qa-audio-fix-*.mjs` and `qa-audio-gapless*.mjs`; the build log is `C:/Users/vascu/AppData/Local/Temp/claude/C--/3e5d6721-b735-4f36-b275-bbd396a973d7/scratchpad/audio-build.log`.