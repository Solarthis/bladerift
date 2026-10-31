export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const approach = (v: number, target: number, step: number) =>
  v < target ? Math.min(v + step, target) : Math.max(v - step, target);

export function angleLerp(a: number, b: number, t: number) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

/** Quantize an angle in [-PI, PI] to a u16. */
export const encodeAngle = (a: number) => Math.round(((a + Math.PI) / (Math.PI * 2)) * 65535) & 0xffff;
export const decodeAngle = (u: number) => (u / 65535) * Math.PI * 2 - Math.PI;

/** Deterministic mulberry32 RNG. */
export class Rng {
  constructor(private s: number) {}
  next() {
    let t = (this.s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(lo: number, hi: number) {
    return lo + (hi - lo) * this.next();
  }
  int(n: number) {
    return Math.floor(this.next() * n);
  }
}
