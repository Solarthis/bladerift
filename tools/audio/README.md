# Audio pack builder

`tools/audio/build.mjs` turns a JSON plan of source files into the client audio pack: MP3 files under
`music/`, `voice/` and `sfx/`, plus `manifest.json` in the contract shape from `docs/overhaul/BRIEF.md`.
It needs no ffmpeg. Sources are decoded by headless Chromium (`AudioContext.decodeAudioData` through
Playwright), and the MP3s are encoded with lamejs.

## Usage

```
node tools/audio/build.mjs [plan.json] [--out=<dir>]
```

- `plan.json` defaults to `tools/audio/plan.json`. Relative paths, in the plan and on the command line, are
  resolved against the repo root.
- `--out=<dir>` defaults to `packages/client/public/assets/audio`. Use a scratch directory for tests so
  nothing lands in `public/`.
- Chromium must be installed for Playwright (`npx playwright install chromium`, already present on this machine).

The run is two-phase. Every source is decoded and rendered in memory first, so a bad source leaves the output
folder untouched. Files and `manifest.json` are written only after all of them succeed. The build prints one
line per file with its size, duration and decoded peak, then a total.

## Plan format

```json
{
  "music": {
    "<id>": { "src": ".cache/assets/music/x.ogg", "gain": 1, "loop": true, "trimStart": 0, "maxSeconds": 180 }
  },
  "voice": {
    "<id>": { "src": ".cache/assets/voice/y.wav" }
  },
  "sfx": {
    "<id>": [ { "src": ".cache/assets/sfx/z.mp3" }, { "src": ".cache/assets/sfx/z2.mp3", "gain": 0.8 } ]
  }
}
```

| Field        | Kinds          | Default | Meaning                                                              |
|--------------|----------------|---------|----------------------------------------------------------------------|
| `src`        | all            | required | Source file (mp3, ogg, wav, anything Chromium decodes), or an array of files joined end to end in order. All parts must share a sample rate and channel count. |
| `gain`       | all            | `1`     | Written to the manifest. The client multiplies by it at playback.    |
| `loop`       | music          | `true`  | Written to the manifest.                                             |
| `trimStart`  | all            | `0`     | Seconds removed from the start, before silence trimming.             |
| `maxSeconds` | all            | none    | Cap on the output length, applied last.                              |

`sfx` ids take an array; each entry becomes `sfx/<id>-<index>.mp3`. Ids may contain letters, digits, `-` and
`_`. Unknown kinds, a non-array `sfx` value, a missing source or a bad field all fail before Chromium starts.

## Processing

For each entry:

1. **Decode** in Chromium at 48 kHz. The decoded Float32 channels are pulled back to Node in 1M-sample chunks.
2. **Resample** to 44.1 kHz with a linear resampler, when the decode rate differs.
3. **Trim `trimStart`**, then, for `voice` and `sfx` only, **trim leading and trailing silence** below -50 dBFS
   (any channel). Music is not silence-trimmed, so loops keep their material.
4. **Channel layout.** `music` is stereo: mono is duplicated, and more than two channels fold even and odd
   channels into L and R. `voice` and `sfx` are downmixed to mono by averaging.
   A `maxSeconds` cut on a non-looping entry (a one-shot such as `victory`) ends in a 0.75 s linear fade. A cut
   loop is not faded, because it wraps at the cut and a fade would dip at every loop point.
5. **Peak normalisation** to the target: music -3 dBFS, voice and sfx -1 dBFS. Music's `gain` is not baked into
   the audio. It goes in the manifest, so the effective peak at playback is -3 dBFS times `gain`. This avoids
   clipping for `gain` above 1 and keeps the gain adjustable without re-encoding.
6. **Encode** with lamejs: music 128 kbps stereo, voice and sfx 96 kbps mono, 44.1 kHz. A LAME gapless tag (an
   `Info` frame written by the build, see below) is put in front of the frames. It records the 576-sample encoder
   delay and the end padding, so decoders skip them.
7. **Peak check.** Lossy coding can move the decoded peak. Pure tones can move it by several dB, and an
   overshoot past full scale is clipped by the decoder. The MP3 is therefore decoded again in Chromium, and if
   the decoded peak misses the target by more than 0.2 dB, it is re-encoded with a corrected gain. This happens
   up to three times, and the attempt closest to the target is kept. The final decoded peak is printed.

## Output

- `music/<id>.mp3`, `voice/<id>.mp3`, `sfx/<id>-<n>.mp3`
- `manifest.json`, with `music` entries `{file, gain, loop}`, `voice` entries `{file, gain}` and `sfx` arrays of
  `{file, gain}`. Entries appear in plan order.

Existing `.mp3` files in the output subfolders that the new manifest does not reference are reported, not
deleted.

## Verifying

Test fixtures live in `.cache/audio-test/` (gitignored). `make-wavs.mjs` writes three short WAVs,
`plan.json` is a small plan that uses them, and `verify.mjs <dir>` decodes every MP3 under `<dir>` in Chromium
and prints its rate, channels, duration, peak and active range. Example:

```
node tools/audio/build.mjs .cache/audio-test/plan.json --out=.cache/audio-test/out
node .cache/audio-test/verify.mjs .cache/audio-test/out
```

## Known limitations

- lamejs writes no gapless header of its own. `build.mjs` adds one (the `Info` frame with the LAME tag): the
  frame's side info and data are zero, so it is silent, and the header holds the encoder delay (576) and the
  end padding. Decoders that read the tag (Chromium does) skip the delay and the padding, so the decoded length
  equals the source length. A decoder that ignores the tag will still hear about 25 ms of silence at each end.
- The resampler is linear, with no anti-alias filter. That is fine for game audio, but not for critical
  listening.
- lamejs 1.2.1's Node entry is broken (`Lame.js` uses `MPEGMode` without requiring it), so the build loads
  `lamejs/lame.min.js` in a `vm` context and takes the `lamejs` global it defines.
- lamejs is LGPL-3.0. It is a build-time devDependency only and is not shipped in the client bundle.
- The silence threshold is absolute (-50 dBFS). A quiet recording with a noise floor above that keeps its
  noise. Use `trimStart` or `maxSeconds` to cut those cases by hand.
