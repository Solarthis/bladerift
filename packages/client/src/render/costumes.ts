/**
 * Costume pieces for the PixelFX fighter: hair, crowns, caps, hoods, masks, horns, capes, coats, scarves, chains,
 * pauldrons and a book. Every piece is drawn in the rig's local pixel space (feet at (0, 0), y down, facing +x) and
 * anchored to the skeleton's joints, so it follows the pose: tails sway with the lean, the far side goes behind the
 * body, and a turned figure turns its back pieces with it. Pieces go into two layers: `back` (cape, long hair, tails,
 * far pauldron) is painted behind the body, `front` (crown, mask, scarf, chains, near pauldron) in front of it. Each
 * layer gets a one pixel ink outline (#0e0c14, the rig's ink) round its silhouette.
 *
 * Costumes are rebuilt only when the pose changes (12 fps steps), into preallocated buffers.
 */
// @ts-expect-error - plain JS vendor module
import { skeleton } from '../vendor/pixelfx/core/index.js';

/** Grid size, and where local (0, 0) (the feet) sits in it. */
export const CW = 96;
export const CH = 64;
export const CX = 48;
export const CY = 56;
/** The rig's ink, as an ABGR colour. */
export const INK = 0xff140c0e;

export interface Costume {
  back: Uint32Array;
  front: Uint32Array;
}
export interface CostumeStyle {
  costume: readonly string[];
  /** Armour and accent (0xRRGGBB) of the hero. */
  armor: number;
  accent: number;
}
export function newCostume(): Costume {
  return { back: new Uint32Array(CW * CH), front: new Uint32Array(CW * CH) };
}

type Vec = [number, number];
type Ramp = [number, number, number, number];
/** A fill: the colour at (x, y); for an ellipse it also gets the normalised (u, v) inside it. */
type Fill = (x: number, y: number, u: number, v: number) => number;

// ------------------------------------------------------------------ colour

const channels = (c: number): [number, number, number] => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
const mixRgb = (a: number, b: number, t: number) => {
  const A = channels(a), B = channels(b);
  return (Math.round(A[0] + (B[0] - A[0]) * t) << 16) | (Math.round(A[1] + (B[1] - A[1]) * t) << 8) | Math.round(A[2] + (B[2] - A[2]) * t);
};
/** 0xRRGGBB to the ABGR word the canvas buffer uses. */
const abgr = (c: number) => (0xff000000 | ((c & 255) << 16) | (c & 0xff00) | ((c >> 16) & 255)) >>> 0;
/** Four tones of one colour: highlight, base, shade, deep. */
export const ramp = (c: number): Ramp => [abgr(mixRgb(c, 0xffffff, 0.42)), abgr(c), abgr(mixRgb(c, 0, 0.3)), abgr(mixRgb(c, 0, 0.55))];
const solid = (c: number): Fill => () => c;

/** Light from up-left-front, as in the rig: which of the four tones an ellipse's normal catches. */
const toneOf = (d: number) => (d > 0.55 ? 0 : d > 0.1 ? 1 : d > -0.4 ? 2 : 3);
const litFill =
  (R: Ramp): Fill =>
  (_x, _y, u, v) => {
    const z = Math.sqrt(Math.max(0, 1 - u * u - v * v));
    return R[toneOf(-0.5 * u - 0.7 * v + 0.5 * z)];
  };

// ------------------------------------------------------------------ pixel primitives (grid cells, rounded)

function put(a: Uint32Array, x: number, y: number, c: number) {
  const gx = Math.round(x) + CX, gy = Math.round(y) + CY;
  if (gx >= 0 && gy >= 0 && gx < CW && gy < CH) a[gy * CW + gx] = c;
}

/** Filled ellipse; `clip` (optional) cuts it down to where it may show. */
function ell(a: Uint32Array, cx: number, cy: number, rx: number, ry: number, fill: Fill, clip?: (x: number, y: number) => boolean) {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const u = (x - cx) / rx, v = (y - cy) / ry;
      if (u * u + v * v > 1) continue;
      if (clip && !clip(x, y)) continue;
      put(a, x, y, fill(x, y, u, v));
    }
}

/** Filled polygon (even-odd scanlines). */
function poly(a: Uint32Array, pts: Vec[], fill: Fill) {
  let minY = Infinity, maxY = -Infinity;
  for (const p of pts) {
    if (p[1] < minY) minY = p[1];
    if (p[1] > maxY) maxY = p[1];
  }
  const xs: number[] = [];
  for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
    xs.length = 0;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], q = pts[(i + 1) % pts.length];
      if ((p[1] <= y && q[1] > y) || (q[1] <= y && p[1] > y)) xs.push(p[0] + ((y - p[1]) * (q[0] - p[0])) / (q[1] - p[1]));
    }
    xs.sort((m, n) => m - n);
    for (let k = 0; k + 1 < xs.length; k += 2)
      for (let x = Math.round(xs[k]); x <= Math.round(xs[k + 1]); x++) put(a, x, y, fill(x, y, 0, 0));
  }
}

/** A thick capsule from A to B. */
function capsule(a: Uint32Array, A: Vec, B: Vec, r: number, fill: Fill) {
  const dx = B[0] - A[0], dy = B[1] - A[1], L2 = dx * dx + dy * dy || 1e-6;
  for (let y = Math.floor(Math.min(A[1], B[1]) - r); y <= Math.ceil(Math.max(A[1], B[1]) + r); y++)
    for (let x = Math.floor(Math.min(A[0], B[0]) - r); x <= Math.ceil(Math.max(A[0], B[0]) + r); x++) {
      const t = Math.max(0, Math.min(1, ((x - A[0]) * dx + (y - A[1]) * dy) / L2));
      const ex = x - (A[0] + dx * t), ey = y - (A[1] + dy * t);
      if (ex * ex + ey * ey <= r * r) put(a, x, y, fill(x, y, 0, 0));
    }
}

/** A chain: one-pixel links alternating bright and dark along A to B. */
function chain(a: Uint32Array, A: Vec, B: Vec, bright: number, dark: number) {
  const n = Math.max(1, Math.round(Math.hypot(B[0] - A[0], B[1] - A[1])));
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    put(a, A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, k % 2 ? bright : dark);
  }
}

/** One ink pixel round every silhouette (empty cells next to a filled one). */
function outline(a: Uint32Array) {
  const ring: number[] = [];
  for (let i = 0; i < a.length; i++) {
    if (a[i]) continue;
    const x = i % CW, y = (i / CW) | 0;
    if ((x > 0 && a[i - 1]) || (x < CW - 1 && a[i + 1]) || (y > 0 && a[i - CW]) || (y < CH - 1 && a[i + CW])) ring.push(i);
  }
  for (const i of ring) a[i] = INK;
}

// ------------------------------------------------------------------ the figure's anchors for one pose

interface Ctx {
  /** Joints, screen space: x right, y down, feet at 0, the figure's whole yaw applied. */
  J: Record<string, [number, number, number]>;
  /** Facing: +1 when he looks right, -1 when turned about. */
  s: number;
  /** Behind him: -s. */
  b: number;
  /** Cloth and hair trail with the lean (px). */
  drag: number;
  back: Uint32Array;
  front: Uint32Array;
  armor: Ramp;
  accent: Ramp;
}

const P = (c: Ctx, k: string): Vec => [c.J[k][0], c.J[k][1]];

// ------------------------------------------------------------------ hair

const HAIR_COL: Record<string, number> = {
  hairGold: 0xf0c040,
  hairBlackLong: 0x4a4660,
  hairBlack: 0x4a4660,
  hairGreenLong: 0x7fd18a,
  hairPink: 0xf08ac4,
  hairOrange: 0xe8702a,
  hairRed: 0xc8321e,
  hairBrown: 0x6e4a2c,
  hairSilver: 0xdfe4ee,
};
/** How each hair reads: how big its cap is, and what hangs behind the head. */
const HAIR_SHAPE: Record<string, { rx: number; ry: number; tail: 'short' | 'long' | 'braid' | 'curly' | 'spike' | 'none' }> = {
  hairGold: { rx: 3.7, ry: 3.4, tail: 'short' },
  hairBlackLong: { rx: 3.8, ry: 3.5, tail: 'long' },
  hairBlack: { rx: 3.9, ry: 3.6, tail: 'short' },
  hairGreenLong: { rx: 3.7, ry: 3.4, tail: 'braid' },
  hairPink: { rx: 4.1, ry: 3.8, tail: 'curly' },
  hairOrange: { rx: 4.1, ry: 3.8, tail: 'curly' },
  hairRed: { rx: 3.6, ry: 3.2, tail: 'spike' },
  hairBrown: { rx: 3.6, ry: 3.3, tail: 'none' },
  hairSilver: { rx: 3.5, ry: 3.2, tail: 'spike' },
};

function hair(c: Ctx, tag: string) {
  const shape = HAIR_SHAPE[tag], R = ramp(HAIR_COL[tag]);
  const H = P(c, 'head'), C = P(c, 'chest');
  // the cap over the top and back of the head; the forehead stays clear
  ell(c.front, H[0] + c.b * 0.5, H[1] - 0.6, shape.rx, shape.ry, litFill(R), (x, y) => !((x - H[0]) * c.s > 1.2 && y > H[1] - 1.2));
  if (shape.tail === 'spike') {
    for (let i = 0; i < 3; i++) {
      const bx = H[0] + c.b * (0.2 + i * 1.5), by = H[1] - 2.2 + i * 0.5;
      poly(c.front, [[bx - 1.3, by], [bx + 1.3, by - 0.3], [bx + c.b * 2.4, by - 2.6 - i * 0.2]], (x, y) => (y < by - 1 ? R[0] : R[1]));
    }
  }
  const tailX = C[0] + c.b * 4.0 + c.drag, tailY = C[1] + 4;
  const lit = (x: number, y: number) => (y < H[1] - 0.5 ? R[0] : (x - H[0]) * c.b > 2.3 ? R[2] : R[1]);
  switch (shape.tail) {
    case 'short':
      ell(c.back, H[0] + c.b * 2.4, H[1] + 1.4, 2.4, 2.9, litFill(R));
      break;
    case 'long':
    case 'braid':
      poly(c.back, [[H[0] + c.b * 2.0, H[1] - 2.6], [H[0] + c.b * 4.6, H[1] - 0.4], [tailX + c.b * 1.2, tailY], [C[0] + c.b * 1.0 + c.drag * 0.6, tailY + 0.5], [H[0] + c.b * 1.2, H[1] + 2.8]], lit);
      if (shape.tail === 'braid') {
        // a plait down the back, tied off in accent
        chain(c.back, [H[0] + c.b * 3.0, H[1] + 1.0], [tailX + c.b * 0.5, tailY - 1], R[2], R[1]);
        put(c.back, tailX + c.b * 0.5, tailY - 1, c.accent[1]);
      }
      break;
    case 'curly':
      ell(c.back, H[0] + c.b * 3.4, H[1] + 0.6, 1.9, 2.1, litFill(R));
      ell(c.back, H[0] + c.b * 2.2, H[1] + 2.8, 1.8, 1.7, litFill(R));
      ell(c.front, H[0] + c.b * 1.2, H[1] - 3.0, 1.5, 1.4, litFill(R));
      break;
    default:
      break;
  }
}

// ------------------------------------------------------------------ head pieces

function crown(c: Ctx) {
  const H = P(c, 'head'), G = ramp(0xf0c040), y0 = H[1] - 2.3;
  ell(c.front, H[0] + c.b * 0.2, y0, 3.5, 1.4, litFill(G));
  for (const k of [-2.4, 0, 2.4]) {
    const x = H[0] + k + c.b * 0.2;
    poly(c.front, [[x - 1.1, y0 - 0.6], [x + 1.1, y0 - 0.6], [x, y0 - 3.4]], (px, py) => (px > x ? G[0] : G[1]));
  }
  put(c.front, H[0] + c.s * 1.6, y0, c.accent[1]);
}

function cap(c: Ctx) {
  const H = P(c, 'head'), R = c.armor;
  ell(c.front, H[0] + c.b * 0.3, H[1] - 2.5, 3.4, 2.4, litFill(R));
  // the peak, sticking out in front
  poly(c.front, [[H[0] + c.s * 0.5, H[1] - 2.0], [H[0] + c.s * 4.6, H[1] - 1.5], [H[0] + c.s * 3.8, H[1] - 0.2], [H[0] + c.s * 0.5, H[1] - 0.7]], (x, y) => (y < H[1] - 1.2 ? R[1] : R[3]));
  put(c.front, H[0] + c.s * 1.6, H[1] - 3.0, c.accent[0]);
}

function hood(c: Ctx) {
  const H = P(c, 'head'), C = P(c, 'chest'), N = P(c, 'neck'), R = c.armor;
  ell(c.back, H[0] + c.b * 1.4, H[1] - 0.6, 4.6, 4.6, litFill(R));
  poly(c.back, [[H[0] + c.b * 2.5, H[1] + 1], [H[0] + c.b * 4.6, H[1] + 2], [C[0] + c.b * 4.4 + c.drag, C[1] + 6], [C[0] + c.b * 0.2, C[1] + 5], [N[0] + c.b * 1.2, N[1] + 1]], (x, y) => (y > C[1] + 4 ? c.accent[1] : R[1]));
  // the rim round the face
  ell(c.front, H[0] + c.b * 0.6, H[1] - 1.6, 3.9, 3.3, litFill(R), (x, y) => !((x - H[0]) * c.s > 1.5 && y > H[1] - 1));
}

function skullMask(c: Ctx) {
  const H = P(c, 'head'), S = ramp(0xe8e2d0);
  ell(c.front, H[0] + c.s * 0.8, H[1] + 0.3, 2.9, 3.1, litFill(S), (x, y) => (x - H[0]) * c.s > -0.8 || y > H[1] - 1.2);
  // eye socket, a crack from it, the jaw line
  put(c.front, H[0] + c.s * 1.9, H[1] - 0.6, INK);
  put(c.front, H[0] + c.s * 2.6, H[1] - 0.6, INK);
  put(c.front, H[0] + c.s * 2.2, H[1] - 1.6, S[3]);
  for (let k = 0.6; k <= 2.8; k += 0.8) put(c.front, H[0] + c.s * k, H[1] + 2.4, INK);
}

function maskCloth(c: Ctx) {
  const H = P(c, 'head'), R = c.armor;
  poly(c.front, [[H[0] + c.s * 0.6, H[1] + 0.4], [H[0] + c.s * 3.4, H[1] + 0.1], [H[0] + c.s * 3.1, H[1] + 3.3], [H[0] + c.s * 0.9, H[1] + 3.6]], (x, y) => (y < H[1] + 1.4 ? R[1] : R[2]));
}

function mane(c: Ctx) {
  const H = P(c, 'head'), N = P(c, 'neck'), M = ramp(0xa06a3a), cx = H[0] + c.b * 0.6, cy = H[1] + 1.2;
  // a ragged ring of fur round the back of the head and neck
  for (let y = Math.floor(cy - 7); y <= Math.ceil(cy + 7); y++)
    for (let x = Math.floor(cx - 7); x <= Math.ceil(cx + 7); x++) {
      if ((x - H[0]) * c.s > 1.5) continue;
      const u = (x - cx) / 6, v = (y - cy) / 6.4, r = Math.hypot(u, v), ang = Math.atan2(v, u);
      if (r > 1 + 0.16 * (Math.sin(7 * ang + 1) + Math.sin(3 * ang)) * 0.5) continue;
      put(c.back, x, y, Math.sin(9 * ang) > 0.55 ? M[3] : litFill(M)(x, y, u, v));
    }
  // the mane runs on down onto the shoulders
  poly(c.back, [[N[0] + c.b * 3.5, N[1] - 1], [N[0] + c.b * 5.2, N[1] + 3], [N[0] + c.b * 1.0, N[1] + 5], [N[0] - c.s * 0.2, N[1] + 1]], solid(M[1]));
}

function horns(c: Ctx) {
  const H = P(c, 'head'), B = ramp(0xe4dcc4);
  capsule(c.front, [H[0] + c.b * 0.8, H[1] - 2.2], [H[0] + c.b * 2.6, H[1] - 5.4], 0.9, solid(B[1]));
  capsule(c.front, [H[0] + c.b * 2.6, H[1] - 5.4], [H[0] + c.b * 4.5, H[1] - 4.4], 0.6, solid(B[3]));
}

function eyesRed(c: Ctx) {
  const H = P(c, 'head');
  put(c.front, H[0] + c.s * 1.9, H[1] - 0.8, 0xff2a2a);
  put(c.front, H[0] + c.s * 2.6, H[1] - 0.8, 0xff7a6a);
}

// ------------------------------------------------------------------ body pieces

function cape(c: Ctx) {
  const C = P(c, 'chest'), Pv = P(c, 'pelvis'), R = ramp(0xa8202a), drag = c.drag;
  poly(
    c.back,
    [[C[0] + c.b * 1.6, C[1] - 4.2], [C[0] + c.b * 4.0, C[1] - 2.0], [Pv[0] + c.b * 7.0 + drag, -1.5], [Pv[0] + c.b * 2.0 + drag * 0.5, -0.5], [C[0] + c.b * 0.4, C[1] + 5]],
    (x, y) => (y > -3 ? c.accent[1] : (x * c.b + y * 0.3) % 4 > 1 ? R[1] : R[2]),
  );
  // a lighter fold near the top
  capsule(c.back, [C[0] + c.b * 2.2, C[1] - 1.0], [Pv[0] + c.b * 4.6 + drag, Pv[1] + 5], 0.5, solid(R[0]));
}

function coat(c: Ctx) {
  const W = P(c, 'waist'), Pv = P(c, 'pelvis'), C = P(c, 'chest'), N = P(c, 'neck'), R = c.armor, drag = c.drag;
  poly(
    c.back,
    [[W[0] + c.b * 2.2, W[1] - 1.5], [W[0] + c.b * 4.4, W[1] - 0.5], [Pv[0] + c.b * 5.2 + drag, Pv[1] + 13.5], [Pv[0] + c.b * 3.2 + drag, Pv[1] + 11], [Pv[0] + c.b * 1.6 + drag * 0.5, Pv[1] + 14.5], [Pv[0] + c.b * 0.4, Pv[1] + 5]],
    (x, y) => (y > Pv[1] + 9 ? c.accent[1] : R[2]),
  );
  // the high collar and the lapel line down the chest, with buttons
  ell(c.front, N[0] + c.b * 0.6, N[1] - 0.4, 2.6, 1.7, litFill(R));
  chain(c.front, [C[0] + c.s * 2.3, C[1] - 2.0], [W[0] + c.s * 2.0, W[1] + 1.0], R[3], R[2]);
  put(c.front, C[0] + c.s * 2.6, C[1] + 2.5, c.accent[0]);
  put(c.front, W[0] + c.s * 2.3, W[1] - 1.5, c.accent[0]);
}

function scarf(c: Ctx) {
  const N = P(c, 'neck'), R = ramp(0xb8262e), drag = c.drag;
  // the tail streams back from the neck
  capsule(c.back, [N[0] + c.b * 1.0, N[1] + 1.2], [N[0] + c.b * 4.6 + drag * 1.1, N[1] + 4.6], 1.1, (x, y) => (y < N[1] + 3 ? R[1] : R[2]));
  capsule(c.back, [N[0] + c.b * 3.4 + drag, N[1] + 4.2], [N[0] + c.b * 6.0 + drag * 1.4, N[1] + 6.4], 0.9, solid(R[3]));
  ell(c.front, N[0] + c.s * 0.1, N[1] + 1.1, 2.6, 1.5, litFill(R));
}

function chains(c: Ctx) {
  const A = c.accent, BR = A[0], DK = A[3];
  chain(c.front, P(c, 'elbowN'), P(c, 'handN'), BR, DK);
  chain(c.back, P(c, 'elbowF'), P(c, 'handF'), BR, DK);
  // a bandolier from the near shoulder across the chest to the far hip
  const S = P(c, 'shoulderN'), Pv = P(c, 'pelvis');
  chain(c.front, [S[0] + c.s * 0.8, S[1] + 1.0], [Pv[0] - c.s * 2.4, Pv[1] + 2.0], BR, DK);
  chain(c.front, [S[0] + c.s * 0.8, S[1] + 2.0], [Pv[0] - c.s * 2.4, Pv[1] + 3.0], DK, BR);
}

function pauldrons(c: Ctx) {
  const SN = P(c, 'shoulderN'), SF = P(c, 'shoulderF'), R = c.armor, Ac = c.accent[1];
  const plate = (layer: Uint32Array, x: number, y: number, A: Ramp) => ell(layer, x, y, 3.3, 2.5, (px, py, u, v) => (u * u + v * v > 0.6 ? Ac : litFill(A)(px, py, u, v)));
  plate(c.back, SF[0] + c.b * 0.2, SF[1] - 0.9, [R[2], R[3], R[3], R[3]]);
  plate(c.front, SN[0] + c.s * 0.3, SN[1] - 0.9, R);
}

function book(c: Ctx) {
  const Hd = P(c, 'handF'), x0 = Hd[0] - 1.2, y0 = Hd[1] - 2.2, pages = abgr(0xf2e6c8);
  poly(c.front, [[x0, y0], [x0 + 4.4, y0 - 0.4], [x0 + 4.6, y0 + 3.4], [x0 + 0.2, y0 + 3.8]], (x, y) => (x > x0 + 3.2 || y > y0 + 2.8 ? pages : c.accent[1]));
}

// ------------------------------------------------------------------ the table of tags

const PIECES: Record<string, (c: Ctx) => void> = {
  crown,
  cap,
  hood,
  skullMask,
  maskCloth,
  mane,
  horns,
  eyesRed,
  cape,
  coat,
  scarf,
  chains,
  pauldrons,
  book,
};

/** Draws a hero's costume for one pose into `out` (the two layers are cleared first). */
export function buildCostume(pose: Record<string, unknown>, style: CostumeStyle, out: Costume): Costume {
  out.back.fill(0);
  out.front.fill(0);
  const sk = skeleton(pose) as { joints: Record<string, [number, number, number]> };
  const J = sk.joints;
  const yaw = ((pose.yaw as number) ?? 0) + (pose.face === -1 ? Math.PI : 0);
  const s = Math.cos(yaw) >= 0 ? 1 : -1;
  // the head's lean and the neck-to-hip lean pull the long pieces back and forth
  const lean = J.neck[0] - J.pelvis[0];
  const c: Ctx = {
    J,
    s,
    b: -s,
    drag: -lean * 0.35,
    back: out.back,
    front: out.front,
    armor: ramp(style.armor),
    accent: ramp(style.accent),
  };
  for (const tag of style.costume) {
    if (tag in HAIR_COL) hair(c, tag);
    else PIECES[tag]?.(c);
  }
  outline(out.back);
  outline(out.front);
  return out;
}
