// Offline renders of the hero rig (render/heroRig.js) to PNG, no browser: node tools/rigshot.mjs [out.png] [modelModule]
// Renders the given model (default: the stock dummy) in a row of poses, scaled up 3x nearest-neighbour.
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const rig = await import(pathToFileURL(resolve('packages/client/src/render/heroRig.js')).href);
const out = process.argv[2] ?? '.cache/rig.png';
let models = [rig.DUMMY_MODEL];
let render = rig.renderHero;
if (process.argv[3]) {
  const m = await import(pathToFileURL(resolve(process.argv[3])).href);
  models = m.MODELS ?? [m.default];
  // a models bundle carries its own copy of the rig (with the heroes' registered weapons): render with that one
  if (m.renderHero) render = m.renderHero;
}

const READY = { crouch: 3, fx: 11, fy: -21, bx: 9, by: -21, ffx: 7, fbx: -7 };
const POSES = [
  { ...READY },
  { ...READY, weapon: 'sword', fx: 12, fy: -21, sa: -0.85 },
  { ...READY, weapon: 'sword', crouch: 2, lean: 3, fx: 16, fy: -37, sa: -1.45, bx: -7, by: -24, ffx: 11, fbx: -10 },
  { ...READY, crouch: 5, lean: 6, fx: 22, fy: -20, sa: 0, weapon: 'spear', two: true, ffx: 15, fbx: -11 },
  { ...READY, yaw: 1.6, weapon: 'scythe', two: true, fx: 15, fy: -24, sa: 0.2 },
  { ...READY, crouch: -1, lean: 2, ffx: 6, ffy: -9, fbx: -4, fby: -4, toeB: true, y: -10 },
];
const CW = 210;
const CH = 130;
const S = 3;
const W = CW * POSES.length * S;
const H = CH * models.length * S;
const px = new Uint8Array(W * H * 4);
for (let i = 0; i < W * H; i++) px.set([42, 34, 56, 255], i * 4);
models.forEach((model, row) => {
  POSES.forEach((pose, col) => {
    const r = render(pose, model);
    for (let k = 0; k < r.n; k++) {
      const x = r.xs[k] + CW / 2;
      const y = r.ys[k] + CH - 14;
      if (x < 0 || y < 0 || x >= CW || y >= CH) continue;
      const c = r.color[k];
      for (let dy = 0; dy < S; dy++)
        for (let dx = 0; dx < S; dx++) {
          const o = (((row * CH + y) * S + dy) * W + (col * CW + x) * S + dx) * 4;
          px[o] = c & 255;
          px[o + 1] = (c >>> 8) & 255;
          px[o + 2] = (c >>> 16) & 255;
          px[o + 3] = 255;
        }
    }
  });
});
// minimal PNG encoder
const crcT = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc = (b) => { let c = -1; for (const v of b) c = crcT[(c ^ v) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
const chunk = (t, d) => { const len = Buffer.alloc(4); len.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
const raw = Buffer.alloc((W * 4 + 1) * H);
for (let y = 0; y < H; y++) { raw[y * (W * 4 + 1)] = 0; Buffer.from(px.buffer, y * W * 4, W * 4).copy(raw, y * (W * 4 + 1) + 1); }
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 6;
writeFileSync(out, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
console.log('wrote', out, W, 'x', H);
