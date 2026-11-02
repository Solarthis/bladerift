Audio pipeline is built and tested end to end. It needs no ffmpeg, and the test output went to `.cache/audio-test/out`, not `public/`.

**Files changed (mine only)**
- `tools/audio/build.mjs` (new): the pipeline. Usage is `node tools/audio/build.mjs [plan.json] [--out=<dir>]`. The plan defaults to `tools/audio/plan.json` and the output defaults to `packages/client/public/assets/audio`.
- `tools/audio/README.md` (new): usage, plan format, processing steps, output, verification and limitations.
- `package.json`: added `"lamejs": "^1.2.1"` to devDependencies only. `package-lock.json` also changed because of the install. `npm audit` reports 0 vulnerabilities.

**What it does**
- Decodes each source in headless Chromium at 48 kHz. Float32 data comes back to Node in 1M-sample chunks.
- Linear resample to 44.1 kHz, then trim `trimStart`. Voice and sfx also get silence trimmed at -50 dBFS.
- Downmix: music to stereo, voice and sfx to mono.
- Peak-normalise: music to -3 dBFS, voice and sfx to -1 dBFS.
- Encode with lamejs: music 128 kbps stereo, voice and sfx 96 kbps mono.
- Writes `music/`, `voice/`, `sfx/` and `manifest.json` in the contract shape, prints sizes, and writes nothing until every source has rendered.

**Choices I made that the lead should know about**
- Music `gain` is not baked into the audio. It goes in the manifest, so the effective peak at playback is -3 dBFS times `gain`. The client must multiply by `gain`.
- lamejs 1.2.1's Node entry is broken (`Lame.js` uses `MPEGMode` without requiring it). The build loads `lamejs/lame.min.js` in a `vm` context instead.
- Lossy coding moves the decoded peak, and pure tones can overshoot enough to clip in the decoder. After encoding, the build decodes the MP3 again and re-encodes with a corrected gain, up to three times, keeping the attempt closest to target. Without this, a pure 1 kHz test tone came out at 0.00 dBFS.
- Stale `.mp3` files in the output folders are reported, not deleted.

**Verification**
- Test fixtures: `.cache/audio-test/` holds `make-wavs.mjs`, a 0.5 s 44.1 kHz sine `tone.wav`, `tone-stereo-22k.wav`, `padded.wav`, `plan.json`, and `verify.mjs`.
- Test run output: all five files decode in Chromium. Decoded peaks are -2.96, -3.43, -1.00, -0.94 and -1.00 dBFS, against targets of -3 and -1. Silence trimming is correct, and `maxSeconds` and `trimStart` both work.
- Error paths: unknown kind, a non-array `sfx`, a bad id, a missing source, `--out=` with no value, and an unknown flag all fail before Chromium starts.
- Not run: the default output into `packages/client/public/`, since there is no real plan yet. `tools/audio/plan.json` is not mine to create.

**Limitations and open items**
- No gapless header. Each MP3 decodes about 25 to 40 ms longer than its source, so seamless music loops will show a short gap.
- The resampler is linear with no anti-alias filter.
- lamejs is LGPL-3.0. It is build-time only and not shipped, but the brief's licence policy names only CC0, CC-BY, MIT and OFL, so the lead should confirm it is acceptable as a devDependency.