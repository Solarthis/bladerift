// Build the client audio pack from a JSON plan, without ffmpeg.
// Each source is decoded by headless Chromium (AudioContext.decodeAudioData), then trimmed, normalised, resampled to
// 44.1 kHz, downmixed and encoded to MP3 with lamejs. Writes music/, voice/, sfx/ and manifest.json.
// Usage: node tools/audio/build.mjs [plan.json] [--out=<dir>]
//   plan defaults to tools/audio/plan.json; --out defaults to packages/client/public/assets/audio.
//   Relative paths are resolved against the repo root.
import { chromium } from 'playwright';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(import.meta.url);

const SAMPLE_RATE = 44100;
/** Rate Chromium decodes to. Node resamples from here to SAMPLE_RATE (linear). */
const DECODE_RATE = 48000;
/** Samples per page-to-Node transfer (4 MB of Float32 per chunk). */
const CHUNK = 1 << 20;
/** Leading and trailing silence below this level is trimmed from voice and sfx. */
const SILENCE_DB = -50;
/**
 * Peak targets in dBFS. Music's manifest gain is applied at playback, so the effective peak is PEAK_DB * gain.
 */
const PEAK_DB = { music: -3, voice: -1, sfx: -1 };
const BITRATE = { music: 128, voice: 96, sfx: 96 };
/** Encoder delay LAME adds at the start (samples). Decoders skip it, together with DECODER_DELAY, via the LAME tag. */
const LAME_DELAY = 576;
/** Decoder delay that decoders skip after the encoder delay (samples). */
const DECODER_DELAY = 529;
/** A `maxSeconds` cut on a one-shot ends in a linear fade of this length, not at full level. */
const FADE_OUT_SECONDS = 0.75;
/** MPEG-1 Layer III bitrates in kbps, by the header's 4-bit index. */
const MPEG1_L3_KBPS = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
const KINDS = ['music', 'voice', 'sfx'];
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
const DEFAULT_PLAN = 'tools/audio/plan.json';
const DEFAULT_OUT = 'packages/client/public/assets/audio';

/**
 * lamejs 1.2.x Node entry is broken (Lame.js uses MPEGMode without requiring it), but its browser bundle works.
 * Load the bundle in a vm context and take the global it defines.
 * @returns {{ Mp3Encoder: new (channels: number, rate: number, kbps: number) => any }}
 */
function loadLamejs() {
  const file = require.resolve('lamejs/lame.min.js');
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(readFileSync(file, 'utf8'), ctx, { filename: file });
  if (!ctx.lamejs || !ctx.lamejs.Mp3Encoder) throw new Error('lamejs bundle did not expose Mp3Encoder');
  return ctx.lamejs;
}
const lamejs = loadLamejs();

/**
 * Parse and validate the plan into a flat list of encode jobs, one per output file.
 * `src` is one path, or an array of paths that are joined end to end (in order) before rendering.
 * @param {string} planPath
 * @returns {Array<{kind: string, id: string, file: string, srcs: string[], gain: number, loop: boolean, trimStart: number, maxSeconds: number | null}>}
 */
function readPlan(planPath) {
  if (!existsSync(planPath)) throw new Error(`plan not found: ${planPath}`);
  const plan = JSON.parse(readFileSync(planPath, 'utf8'));
  for (const kind of Object.keys(plan)) {
    if (!KINDS.includes(kind)) throw new Error(`plan: unknown kind "${kind}" (expected music, voice or sfx)`);
  }
  const jobs = [];
  for (const kind of KINDS) {
    for (const [id, spec] of Object.entries(plan[kind] ?? {})) {
      if (!ID_RE.test(id)) throw new Error(`plan: bad id "${id}" (letters, digits, - and _ only)`);
      if (kind === 'sfx' && !Array.isArray(spec)) throw new Error(`plan: sfx "${id}" must be an array of entries`);
      const entries = kind === 'sfx' ? spec : [spec];
      entries.forEach((entry, n) => {
        const where = `plan: ${kind} "${id}"${kind === 'sfx' ? `[${n}]` : ''}`;
        const list = Array.isArray(entry?.src) ? entry.src : [entry?.src];
        if (list.length === 0 || list.some((s) => typeof s !== 'string')) {
          throw new Error(`${where}: src must be a path string or a non-empty array of path strings`);
        }
        const srcs = list.map((s) => resolve(root, s));
        for (const src of srcs) if (!existsSync(src)) throw new Error(`${where}: source not found: ${src}`);
        const gain = entry.gain ?? 1;
        const trimStart = entry.trimStart ?? 0;
        const maxSeconds = entry.maxSeconds ?? null;
        if (!(Number.isFinite(gain) && gain >= 0)) throw new Error(`${where}: gain must be a number >= 0`);
        if (!(Number.isFinite(trimStart) && trimStart >= 0)) throw new Error(`${where}: trimStart must be >= 0`);
        if (maxSeconds !== null && !(Number.isFinite(maxSeconds) && maxSeconds > 0)) {
          throw new Error(`${where}: maxSeconds must be > 0`);
        }
        const file = kind === 'sfx' ? `sfx/${id}-${n}.mp3` : `${kind}/${id}.mp3`;
        jobs.push({
          kind,
          id,
          file,
          srcs,
          gain,
          loop: kind === 'music' ? entry.loop ?? true : false,
          trimStart,
          maxSeconds,
        });
      });
    }
  }
  return jobs;
}

/**
 * Runs inside Chromium. Decodes base64 bytes with OfflineAudioContext and keeps the Float32 channels on the page,
 * so Node can pull them back in chunks. Also measures the decoded peak of an encoded MP3 at its own rate.
 * Passed to page.evaluate, so it must not reference Node scope.
 * @param {{ decodeRate: number, sampleRate: number }} rates
 */
function installDecoder(rates) {
  const unb64 = (b64) => {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  };
  window.__peak = async (b64) => {
    const buf = await new OfflineAudioContext(1, 1, rates.sampleRate).decodeAudioData(unb64(b64).buffer);
    let p = 0;
    for (let c = 0; c < buf.numberOfChannels; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < d.length; i++) {
        const a = Math.abs(d[i]);
        if (a > p) p = a;
      }
    }
    return p;
  };
  window.__decode = async (b64) => {
    const ctx = new OfflineAudioContext(1, 1, rates.decodeRate);
    const buf = await ctx.decodeAudioData(unb64(b64).buffer);
    const chans = [];
    for (let c = 0; c < buf.numberOfChannels; c++) chans.push(buf.getChannelData(c));
    window.__last = { chans, sampleRate: buf.sampleRate };
    return { sampleRate: buf.sampleRate, channels: buf.numberOfChannels, length: buf.length };
  };
  window.__chunk = (ch, start, count) => {
    const f = window.__last.chans[ch].subarray(start, start + count);
    const u8 = new Uint8Array(f.buffer, f.byteOffset, f.byteLength);
    let s = '';
    for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return btoa(s);
  };
}

/**
 * Decode one source file in the page and pull its channels back into Node.
 * @param {import('playwright').Page} page
 * @param {string} absPath
 * @returns {Promise<{ sampleRate: number, channels: Float32Array[] }>}
 */
async function decodeFile(page, absPath) {
  let info;
  try {
    info = await page.evaluate((b64) => window.__decode(b64), readFileSync(absPath).toString('base64'));
  } catch (e) {
    throw new Error(`cannot decode ${absPath}: ${e.message}`);
  }
  const channels = [];
  for (let c = 0; c < info.channels; c++) {
    const out = new Float32Array(info.length);
    for (let s = 0; s < info.length; s += CHUNK) {
      const count = Math.min(CHUNK, info.length - s);
      const b64 = await page.evaluate(([ch, start, n]) => window.__chunk(ch, start, n), [c, s, count]);
      const buf = Buffer.from(b64, 'base64');
      // Copy byte-wise: a Buffer's byteOffset is not guaranteed to be 4-byte aligned.
      new Uint8Array(out.buffer, s * 4, count * 4).set(buf);
    }
    channels.push(out);
  }
  await page.evaluate(() => {
    window.__last = null;
  });
  return { sampleRate: info.sampleRate, channels };
}

/**
 * Decode several source files and join them end to end. All parts must share a sample rate and channel count.
 * @param {import('playwright').Page} page
 * @param {string[]} paths
 * @returns {Promise<{ sampleRate: number, channels: Float32Array[] }>}
 */
async function decodeFiles(page, paths) {
  const parts = [];
  for (const p of paths) parts.push(await decodeFile(page, p));
  if (parts.length === 1) return parts[0];
  const first = parts[0];
  for (const [i, part] of parts.entries()) {
    if (part.sampleRate !== first.sampleRate || part.channels.length !== first.channels.length) {
      throw new Error(`${paths[i]}: sample rate or channel count differs from ${paths[0]}`);
    }
  }
  const channels = first.channels.map((_, c) => {
    const total = parts.reduce((n, p) => n + p.channels[c].length, 0);
    const out = new Float32Array(total);
    let at = 0;
    for (const p of parts) {
      out.set(p.channels[c], at);
      at += p.channels[c].length;
    }
    return out;
  });
  return { sampleRate: first.sampleRate, channels };
}

/**
 * Linear resample of one channel. No anti-alias filter; fine for 48 kHz to 44.1 kHz game audio.
 * @param {Float32Array} src
 * @param {number} from
 * @param {number} to
 * @returns {Float32Array}
 */
function resample(src, from, to) {
  const outLen = Math.round((src.length * to) / from);
  const out = new Float32Array(outLen);
  const ratio = from / to;
  const last = src.length - 1;
  for (let i = 0; i < outLen; i++) {
    const pos = i * ratio;
    const i0 = Math.min(Math.floor(pos), last);
    const i1 = Math.min(i0 + 1, last);
    const t = pos - i0;
    out[i] = src[i0] * (1 - t) + src[i1] * t;
  }
  return out;
}

/**
 * Find the first and last frame where any channel is above the threshold.
 * @param {Float32Array[]} chans
 * @param {number} threshold linear amplitude
 * @returns {[number, number] | null} [start, end) or null when everything is below threshold
 */
function activeBounds(chans, threshold) {
  const n = chans[0].length;
  let first = -1;
  for (let i = 0; i < n && first < 0; i++) {
    for (const c of chans) {
      if (Math.abs(c[i]) > threshold) {
        first = i;
        break;
      }
    }
  }
  if (first < 0) return null;
  let last = n - 1;
  for (; last > first; last--) {
    let hit = false;
    for (const c of chans) {
      if (Math.abs(c[last]) > threshold) {
        hit = true;
        break;
      }
    }
    if (hit) break;
  }
  return [first, last + 1];
}

/**
 * Average all channels into one.
 * @param {Float32Array[]} chans
 * @returns {Float32Array}
 */
function toMono(chans) {
  if (chans.length === 1) return chans[0];
  const n = chans[0].length;
  const out = new Float32Array(n);
  const k = 1 / chans.length;
  for (const c of chans) for (let i = 0; i < n; i++) out[i] += c[i] * k;
  return out;
}

/**
 * Bring any channel layout to stereo. Mono is duplicated; more than two channels fold even and odd channels.
 * @param {Float32Array[]} chans
 * @returns {Float32Array[]}
 */
function toStereo(chans) {
  if (chans.length === 2) return chans;
  const n = chans[0].length;
  const left = new Float32Array(n);
  const right = new Float32Array(n);
  if (chans.length === 1) {
    left.set(chans[0]);
    right.set(chans[0]);
    return [left, right];
  }
  const evens = chans.filter((_, i) => i % 2 === 0);
  const odds = chans.filter((_, i) => i % 2 === 1);
  for (const c of evens) for (let i = 0; i < n; i++) left[i] += c[i] / evens.length;
  for (const c of odds) for (let i = 0; i < n; i++) right[i] += c[i] / odds.length;
  return [left, right];
}

/**
 * @param {Float32Array[]} chans
 * @returns {number} largest absolute sample
 */
function peakOf(chans) {
  let p = 0;
  for (const c of chans) for (let i = 0; i < c.length; i++) {
    const a = Math.abs(c[i]);
    if (a > p) p = a;
  }
  return p;
}

/**
 * @param {Float32Array} src
 * @param {number} from
 * @param {number} to
 * @param {number} gain linear multiplier applied before quantising
 * @returns {Int16Array}
 */
function toInt16(src, from, to, gain) {
  const out = new Int16Array(to - from);
  for (let i = from; i < to; i++) {
    const v = Math.round(src[i] * gain * 32767);
    out[i - from] = v > 32767 ? 32767 : v < -32768 ? -32768 : v;
  }
  return out;
}

/**
 * lamejs reuses its output buffer, so copy the bytes out.
 * @param {Int8Array} a
 * @returns {Buffer}
 */
function copyBytes(a) {
  return Buffer.from(new Uint8Array(a.buffer, a.byteOffset, a.byteLength));
}

/**
 * Reads the header of the MPEG-1 Layer III frame at `off`. lamejs writes only this kind at 44.1 kHz.
 * @param {Buffer} buf
 * @param {number} off
 * @returns {{ len: number, kbps: number, mono: boolean, crc: boolean }} frame length in bytes and header facts
 */
function frameAt(buf, off) {
  const sync = off + 4 <= buf.length && buf[off] === 0xff && (buf[off + 1] & 0xe0) === 0xe0;
  if (!sync) throw new Error(`mp3: no frame sync at byte ${off}`);
  const version = (buf[off + 1] >> 3) & 3;
  const layer = (buf[off + 1] >> 1) & 3;
  const rate = (buf[off + 2] >> 2) & 3;
  if (version !== 3 || layer !== 1 || rate !== 0) throw new Error('mp3: expected MPEG-1 Layer III at 44.1 kHz');
  const kbps = MPEG1_L3_KBPS[buf[off + 2] >> 4];
  const pad = (buf[off + 2] >> 1) & 1;
  return {
    len: Math.floor((144000 * kbps) / SAMPLE_RATE) + pad,
    kbps,
    mono: (buf[off + 3] >> 6) === 3,
    crc: (buf[off + 1] & 1) === 0,
  };
}

/**
 * Puts a LAME gapless tag in front of the MP3 frames. The tag is a silent first frame (an "Info" header, which LAME
 * uses for constant-bitrate files) that carries the encoder delay and the end padding. Decoders that read it, as
 * browsers do, skip the delay and the padding, so the file plays exactly its own length. Without it every decoded
 * file starts and ends with about 25 ms of silence, which gaps a loop at each wrap.
 * @param {Buffer} body the encoded MP3 frames, starting on a frame boundary
 * @param {number} kbps
 * @param {number} sampleCount PCM samples that were encoded
 * @returns {Buffer} the tag frame followed by `body`
 */
function withGaplessTag(body, kbps, sampleCount) {
  const head = frameAt(body, 0);
  let frames = 0;
  for (let off = 0; off < body.length; off += frameAt(body, off).len) frames++;
  // Decoders drop LAME_DELAY + DECODER_DELAY at the start and `padding` samples at the end.
  const padding = frames * 1152 - LAME_DELAY - DECODER_DELAY - sampleCount;
  if (padding < 0 || padding > 0xfff) throw new Error(`mp3: end padding ${padding} out of range`);

  const tag = Buffer.alloc(head.len); // zeros: a silent frame apart from its header
  body.copy(tag, 0, 0, 4);
  const at = 4 + (head.crc ? 2 : 0) + (head.mono ? 17 : 32); // after the side info
  tag.write('Info', at, 'ascii');
  tag.writeUInt32BE(0x3, at + 4); // flags: frame count and byte count are present
  tag.writeUInt32BE(frames, at + 8);
  tag.writeUInt32BE(body.length, at + 12);
  const lame = at + 16;
  tag.write('LAME3.100', lame, 'ascii');
  // Offsets are from the start of the LAME extension (the version string), as in LAME's VbrTag layout.
  tag[lame + 9] = 0x01; // tag revision 0, VBR method 1 (constant bitrate)
  tag[lame + 20] = kbps; // bitrate, for constant-bitrate files
  const delayPad = (LAME_DELAY << 12) | padding; // 12 bits each
  tag[lame + 21] = (delayPad >> 16) & 0xff;
  tag[lame + 22] = (delayPad >> 8) & 0xff;
  tag[lame + 23] = delayPad & 0xff;
  tag.writeUInt32BE(body.length, lame + 28); // music length in bytes
  return Buffer.concat([tag, body]);
}

/**
 * Encode planar Float32 channels (already at SAMPLE_RATE) to MP3, with a gapless tag.
 * @param {Float32Array[]} chans one or two channels of equal length
 * @param {number} kbps
 * @param {number} gain linear multiplier applied before quantising
 * @returns {Buffer}
 */
function encodeMp3(chans, kbps, gain) {
  const enc = new lamejs.Mp3Encoder(chans.length, SAMPLE_RATE, kbps);
  const n = chans[0].length;
  const step = 1152 * 16;
  const parts = [];
  for (let i = 0; i < n; i += step) {
    const end = Math.min(n, i + step);
    const left = toInt16(chans[0], i, end, gain);
    const mp3 = chans.length === 2
      ? enc.encodeBuffer(left, toInt16(chans[1], i, end, gain))
      : enc.encodeBuffer(left);
    if (mp3.length) parts.push(copyBytes(mp3));
  }
  const tail = enc.flush();
  if (tail.length) parts.push(copyBytes(tail));
  return withGaplessTag(Buffer.concat(parts), kbps, n);
}

/**
 * Fades the last `n` samples of every channel linearly to silence.
 * @param {Float32Array[]} chans
 * @param {number} n
 */
function fadeOut(chans, n) {
  const len = chans[0].length;
  const m = Math.min(n, len);
  for (const c of chans) for (let i = 0; i < m; i++) c[len - m + i] *= (m - 1 - i) / m;
}

/**
 * Decoded peak of an encoded MP3, measured in Chromium at SAMPLE_RATE.
 * @param {import('playwright').Page} page
 * @param {Buffer} mp3
 * @returns {Promise<number>} linear peak
 */
function decodedPeak(page, mp3) {
  return page.evaluate((b64) => window.__peak(b64), mp3.toString('base64'));
}

/**
 * Trim, level, resample, downmix and encode one decoded source. Lossy coding can overshoot or undershoot the
 * peak (and overshoot clips in the decoder), so the encoded MP3 is decoded again and re-encoded with a corrected
 * gain, up to three more times, until its decoded peak is within 0.2 dB of the target. The attempt closest to the
 * target is kept.
 * @param {ReturnType<typeof readPlan>[number]} job
 * @param {{ sampleRate: number, channels: Float32Array[] }} dec decoded source; its arrays are owned here and may be modified
 * @param {import('playwright').Page} page
 * @returns {Promise<{ mp3: Buffer, seconds: number, peakDb: number }>}
 */
async function render(job, dec, page) {
  let chans = dec.channels;
  if (dec.sampleRate !== SAMPLE_RATE) chans = chans.map((c) => resample(c, dec.sampleRate, SAMPLE_RATE));
  if (job.trimStart > 0) {
    const skip = Math.round(job.trimStart * SAMPLE_RATE);
    chans = chans.map((c) => c.subarray(Math.min(skip, c.length)));
  }
  if (job.kind !== 'music') {
    const bounds = activeBounds(chans, 10 ** (SILENCE_DB / 20));
    if (bounds) chans = chans.map((c) => c.subarray(bounds[0], bounds[1]));
    else console.warn(`warning: ${job.file} is below ${SILENCE_DB} dB everywhere, left untrimmed`);
  }
  let cut = false;
  if (job.maxSeconds !== null) {
    const limit = Math.round(job.maxSeconds * SAMPLE_RATE);
    cut = chans[0].length > limit;
    chans = chans.map((c) => c.subarray(0, Math.min(limit, c.length)));
  }
  const out = job.kind === 'music' ? toStereo(chans) : [toMono(chans)];
  // A cut loop keeps its level: it wraps at the cut, so a fade would dip at every loop point. A cut one-shot fades out.
  if (cut && !job.loop) fadeOut(out, Math.round(FADE_OUT_SECONDS * SAMPLE_RATE));
  const n = out[0].length;
  if (n === 0) throw new Error(`${job.file}: no audio left after trimming`);
  const peak = peakOf(out);
  if (!(peak > 0)) throw new Error(`${job.file}: source is silent`);
  const targetLin = 10 ** (PEAK_DB[job.kind] / 20);
  const k = targetLin / peak;
  for (const c of out) for (let i = 0; i < n; i++) c[i] *= k;

  // Coding a pure tone is phase-sensitive, so the decoded peak can jump by several dB for a small gain change.
  // Keep the attempt whose decoded peak lands closest to the target.
  const kbps = BITRATE[job.kind];
  const dbOf = (lin) => (lin > 0 ? 20 * Math.log10(lin) : -Infinity);
  let gain = 1;
  let mp3 = encodeMp3(out, kbps, gain);
  let got = await decodedPeak(page, mp3);
  let best = { mp3, got };
  for (let pass = 0; pass < 3 && got > 0; pass++) {
    const errDb = PEAK_DB[job.kind] - dbOf(got);
    if (Math.abs(errDb) <= 0.2) break;
    // Keep the input below full scale so the corrected encode cannot clip before coding.
    gain = Math.min(gain * 10 ** (errDb / 20), 0.999 / targetLin);
    mp3 = encodeMp3(out, kbps, gain);
    got = await decodedPeak(page, mp3);
    if (Math.abs(PEAK_DB[job.kind] - dbOf(got)) < Math.abs(PEAK_DB[job.kind] - dbOf(best.got))) best = { mp3, got };
  }
  return { mp3: best.mp3, seconds: n / SAMPLE_RATE, peakDb: dbOf(best.got) };
}

/**
 * Add one job to the manifest in the contract shape.
 * @param {{ music: object, voice: object, sfx: object }} manifest
 * @param {ReturnType<typeof readPlan>[number]} job
 */
function record(manifest, job) {
  if (job.kind === 'music') manifest.music[job.id] = { file: job.file, gain: job.gain, loop: job.loop };
  else if (job.kind === 'voice') manifest.voice[job.id] = { file: job.file, gain: job.gain };
  else (manifest.sfx[job.id] ??= []).push({ file: job.file, gain: job.gain });
}

async function main() {
  const args = process.argv.slice(2);
  const flags = args.filter((a) => a.startsWith('--'));
  const positional = args.filter((a) => !a.startsWith('--'));
  for (const f of flags) if (!f.startsWith('--out=')) throw new Error(`unknown flag ${f}`);
  const outFlag = flags.find((f) => f.startsWith('--out='));
  if (outFlag !== undefined && outFlag.length === '--out='.length) throw new Error('--out= needs a directory');
  const planPath = resolve(root, positional[0] ?? DEFAULT_PLAN);
  const outDir = resolve(root, outFlag ? outFlag.slice('--out='.length) : DEFAULT_OUT);

  const jobs = readPlan(planPath);
  if (jobs.length === 0) throw new Error('plan has no entries');
  console.log(`plan: ${planPath}`);
  console.log(`out:  ${outDir}`);

  // Phase 1: decode and render everything in memory, so a failing source leaves the output untouched.
  const rendered = [];
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent('<!doctype html><title>audio decode</title>');
    await page.evaluate(installDecoder, { decodeRate: DECODE_RATE, sampleRate: SAMPLE_RATE });
    for (const job of jobs) {
      const dec = await decodeFiles(page, job.srcs);
      const { mp3, seconds, peakDb } = await render(job, dec, page);
      rendered.push({ job, mp3, seconds });
      console.log(`  ${job.file.padEnd(24)} ${String(mp3.length).padStart(8)} B  ${seconds.toFixed(2)} s  peak ${peakDb.toFixed(2)} dBFS`);
    }
  } finally {
    await browser.close();
  }

  // Phase 2: write files and the manifest.
  const manifest = { music: {}, voice: {}, sfx: {} };
  const produced = new Set();
  let total = 0;
  for (const { job, mp3 } of rendered) {
    const dest = join(outDir, job.file);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, mp3);
    produced.add(job.file);
    total += mp3.length;
    record(manifest, job);
  }
  writeFileSync(join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  const stale = [];
  for (const kind of KINDS) {
    const dir = join(outDir, kind);
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir)) {
      if (f.endsWith('.mp3') && !produced.has(`${kind}/${f}`)) stale.push(`${kind}/${f}`);
    }
  }
  if (stale.length) console.warn(`not in manifest, left in place: ${stale.join(', ')}`);

  const kb = (b) => `${(b / 1024).toFixed(1)} KB`;
  console.log(`wrote ${rendered.length} mp3 files, ${kb(total)} total, plus manifest.json`);
  console.log(`manifest: ${join(outDir, 'manifest.json')}`);
}

main().catch((e) => {
  console.error(`audio build failed: ${e.message}`);
  process.exitCode = 1;
});
