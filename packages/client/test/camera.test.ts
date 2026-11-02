import { FIGHTER } from '@bladerift/shared';
import { describe, expect, it } from 'vitest';
import { CAMERA, FightCamera, type CameraInput } from '../src/game/camera';

const DT = 1 / 60;
const ARENA_W = 1280;
const FLOOR = 600;

/** A desktop view with no touch pads, two fighters on the floor. */
const base = (over: Partial<CameraInput> = {}): CameraInput => ({
  dt: DT,
  viewW: 1280,
  viewH: 720,
  padLeft: 0,
  padRight: 0,
  touch: false,
  fighters: [
    { x: 600, y: FLOOR },
    { x: 640, y: FLOOR },
  ],
  ...over,
});

/** Run `seconds` of frames with the same input and return the last frame. */
function run(cam: FightCamera, input: CameraInput, seconds: number) {
  let f = cam.update(input);
  for (let i = 1; i < Math.round(seconds / DT); i++) f = cam.update(input);
  return f;
}

/** Screen x (px) of a world x, for a frame with the given view size. */
const screenX = (wx: number, f: { zoom: number; x: number }, viewW: number) => viewW / 2 + (wx - f.x) * f.zoom;

/** Screen y (px) of a world y. */
const screenY = (wy: number, f: { zoom: number; y: number }, viewH: number) => viewH / 2 + (wy - f.y) * f.zoom;

describe('FightCamera framing', () => {
  it('frames close fighters at the desktop size: a standing fighter is 19% of the view height', () => {
    const cam = new FightCamera({ arenaW: ARENA_W, floor: FLOOR });
    const f = run(cam, base(), 2);
    const share = (FIGHTER.h * f.zoom) / 720;
    expect(share).toBeGreaterThanOrEqual(0.18);
    expect(share).toBeLessThanOrEqual(0.2);
    expect(share).toBeCloseTo(0.19, 3);
  });

  it('puts the floor at 75% of the view height on desktop', () => {
    const cam = new FightCamera({ arenaW: ARENA_W, floor: FLOOR });
    const f = run(cam, base(), 2);
    expect(screenY(FLOOR, f, 720) / 720).toBeCloseTo(0.75, 3);
  });

  it('frames close fighters larger on touch phones (24% of the view height) and puts the floor at 72%', () => {
    const cam = new FightCamera({ arenaW: ARENA_W, floor: FLOOR });
    const input = base({ viewW: 844, viewH: 390, touch: true, padLeft: 100, padRight: 200 });
    const f = run(cam, input, 2);
    const share = (FIGHTER.h * f.zoom) / 390;
    expect(share).toBeGreaterThanOrEqual(0.22);
    expect(share).toBeLessThanOrEqual(0.26);
    expect(share).toBeCloseTo(0.24, 3);
    expect(screenY(FLOOR, f, 390) / 390).toBeCloseTo(0.72, 3);
  });

  it('zooms out quickly when the fighters part, only as far as needed to keep both in the usable width', () => {
    const cam = new FightCamera({ arenaW: ARENA_W, floor: FLOOR });
    const close = run(cam, base(), 2);
    const parted = base({ fighters: [{ x: 100, y: FLOOR }, { x: 1000, y: FLOOR }] });
    // the fit: (span + 2 x margin) units across the 1280 px view
    const fit = 1280 / (900 + 2 * CAMERA.margin);
    const after = run(cam, parted, 0.5);
    expect(after.zoom).toBeLessThan(close.zoom);
    expect(Math.abs(after.zoom - fit)).toBeLessThan(0.05);
    const settled = run(cam, parted, 3);
    expect(settled.zoom).toBeCloseTo(fit, 4);
    // both fighters sit inside the 95-unit margins, on screen
    expect(screenX(100, settled, 1280)).toBeGreaterThanOrEqual(CAMERA.margin * settled.zoom - 1e-6);
    expect(screenX(1000, settled, 1280)).toBeLessThanOrEqual(1280 - CAMERA.margin * settled.zoom + 1e-6);
  });

  it('zooms back in only after waiting 0.6 s, then slowly', () => {
    const cam = new FightCamera({ arenaW: ARENA_W, floor: FLOOR });
    const parted = base({ fighters: [{ x: 100, y: FLOOR }, { x: 1000, y: FLOOR }] });
    const start = run(cam, parted, 3).zoom;
    const close = base({ fighters: [{ x: 600, y: FLOOR }, { x: 620, y: FLOOR }] });
    const gap = (720 * 0.19) / FIGHTER.h - start;
    expect(gap).toBeGreaterThan(0);

    const early = run(cam, close, 0.5);
    expect(early.zoom).toBe(start); // still waiting
    const mid = run(cam, close, 0.5); // 1.0 s in: 0.4 s of easing at 2/s
    expect(mid.zoom).toBeGreaterThan(start);
    expect(mid.zoom - start).toBeLessThan(0.7 * gap);
    const done = run(cam, close, 6);
    expect(done.zoom).toBeCloseTo((720 * 0.19) / FIGHTER.h, 3);
  });

  it('never zooms in past the target, even with the fighters far closer', () => {
    const cam = new FightCamera({ arenaW: ARENA_W, floor: FLOOR });
    const f = run(cam, base({ fighters: [{ x: 600, y: FLOOR }, { x: 600, y: FLOOR }] }), 4);
    expect(f.zoom).toBeCloseTo((720 * 0.19) / FIGHTER.h, 3);
  });
});

describe('FightCamera horizontal', () => {
  it('stays perfectly still while both fighters are inside the middle half of the usable width', () => {
    const cam = new FightCamera({ arenaW: ARENA_W, floor: FLOOR });
    const first = cam.update(base());
    // the zone is 25% of the usable width either side of the centre: about +-122 units at this zoom
    let prev = first.x;
    for (let i = 0; i < 180; i++) {
      const shift = 60 * Math.sin(i / 9);
      const f = cam.update(base({ fighters: [{ x: 560 + shift, y: FLOOR }, { x: 600 + shift, y: FLOOR }] }));
      expect(f.x).toBe(prev);
      prev = f.x;
    }
  });

  it('pushes the frame once a fighter leaves the dead zone', () => {
    const cam = new FightCamera({ arenaW: ARENA_W, floor: FLOOR });
    const first = cam.update(base());
    const f = run(cam, base({ fighters: [{ x: 900, y: FLOOR }, { x: 940, y: FLOOR }] }), 3);
    expect(f.x).toBeGreaterThan(first.x + 100);
  });

  it('clamps the view 50 units past the left and right arena walls', () => {
    const cam = new FightCamera({ arenaW: ARENA_W, floor: FLOOR });
    const left = run(cam, base({ fighters: [{ x: 10, y: FLOOR }, { x: 30, y: FLOOR }] }), 3);
    const halfLeft = 1280 / left.zoom / 2;
    expect(left.x - halfLeft).toBeCloseTo(-CAMERA.wallSlack, 4);

    const right = run(cam, base({ fighters: [{ x: 1250, y: FLOOR }, { x: 1270, y: FLOOR }] }), 3);
    const halfRight = 1280 / right.zoom / 2;
    expect(right.x + halfRight).toBeCloseTo(ARENA_W + CAMERA.wallSlack, 4);
  });

  it('centres the view when the arena (with its 50-unit margins) is narrower than the view', () => {
    const cam = new FightCamera({ arenaW: 300, floor: FLOOR });
    const f = run(cam, base({ fighters: [{ x: 100, y: FLOOR }, { x: 120, y: FLOOR }] }), 2);
    expect(f.zoom).toBeCloseTo(1280 / 400, 4); // the minimum zoom: the view shows exactly the arena and its margins
    expect(f.x).toBeCloseTo(150, 4);
  });

  it('keeps the fighters at the centre of the usable width between the touch pads', () => {
    const cam = new FightCamera({ arenaW: ARENA_W, floor: FLOOR });
    // usable width: 1000 - 100 - 200 = 700 px, its centre 450 px from the left
    const input = base({ viewW: 1000, viewH: 600, touch: true, padLeft: 100, padRight: 200, fighters: [{ x: 500, y: FLOOR }, { x: 520, y: FLOOR }] });
    const f = run(cam, input, 2);
    expect(screenX(510, f, 1000)).toBeCloseTo(450, 3);
    expect(screenX(500, f, 1000)).toBeGreaterThanOrEqual(100);
    expect(screenX(520, f, 1000)).toBeLessThanOrEqual(800);
  });

  it('zooms out to fit the fighters between the pads, not across the whole view', () => {
    const cam = new FightCamera({ arenaW: ARENA_W, floor: FLOOR });
    // 1000 px view, 500 px usable: the fit (500 / 210 = 2.38 px per unit) is tighter than the touch target (2.77)
    const input = base({ viewW: 1000, viewH: 600, touch: true, padLeft: 250, padRight: 250, fighters: [{ x: 500, y: FLOOR }, { x: 520, y: FLOOR }] });
    const f = run(cam, input, 2);
    expect(f.zoom).toBeCloseTo(Math.min((600 * 0.24) / FIGHTER.h, 500 / (20 + 2 * CAMERA.margin)), 4);
  });
});

describe('FightCamera vertical', () => {
  it('does not lift for a fighter within 110 units of the floor', () => {
    const cam = new FightCamera({ arenaW: ARENA_W, floor: FLOOR });
    const ground = run(cam, base(), 2);
    const hop = run(cam, base({ fighters: [{ x: 600, y: FLOOR - 100 }, { x: 640, y: FLOOR }] }), 3);
    expect(hop.y).toBeCloseTo(ground.y, 6);
  });

  it('lifts the camera for a high jump and keeps the head in view', () => {
    const cam = new FightCamera({ arenaW: ARENA_W, floor: FLOOR });
    const ground = run(cam, base(), 2);
    const jump = base({ fighters: [{ x: 600, y: 300 }, { x: 640, y: FLOOR }] });
    const high = run(cam, jump, 3);
    expect(high.y).toBeLessThan(ground.y - 100);
    expect(screenY(300 - FIGHTER.h, high, 720)).toBeGreaterThanOrEqual(0);
  });

  it('keeps the head of a touch-view fighter on screen when it lifts', () => {
    const cam = new FightCamera({ arenaW: ARENA_W, floor: FLOOR });
    const input = base({ viewW: 844, viewH: 390, touch: true, padLeft: 100, padRight: 200, fighters: [{ x: 600, y: FLOOR - 120 }, { x: 640, y: FLOOR }] });
    const f = run(cam, input, 3);
    expect(screenY(FLOOR - 120 - FIGHTER.h, f, 390)).toBeGreaterThanOrEqual(0);
  });
});

describe('FightCamera robustness', () => {
  it('is deterministic: the same inputs give the same frames', () => {
    const a = new FightCamera({ arenaW: ARENA_W, floor: FLOOR });
    const b = new FightCamera({ arenaW: ARENA_W, floor: FLOOR });
    for (let i = 0; i < 300; i++) {
      const input = base({ fighters: [{ x: 300 + 3 * i, y: FLOOR - (i % 90) }, { x: 900 - 2 * i, y: FLOOR }] });
      expect(a.update(input)).toEqual(b.update(input));
    }
  });

  it('returns finite values with no fighters, zero dt or a huge dt', () => {
    const cam = new FightCamera({ arenaW: ARENA_W, floor: FLOOR });
    const empty = cam.update(base({ fighters: [] }));
    for (const v of [empty.zoom, empty.x, empty.y]) expect(Number.isFinite(v)).toBe(true);
    const still = cam.update(base({ dt: 0 }));
    expect(still).toEqual(empty);
    const stall = cam.update(base({ dt: 30, fighters: [{ x: 900, y: FLOOR }, { x: 100, y: FLOOR }] }));
    expect(Number.isFinite(stall.zoom) && Number.isFinite(stall.x) && Number.isFinite(stall.y)).toBe(true);
  });

  it('frames the fighters at once after reset()', () => {
    const cam = new FightCamera({ arenaW: ARENA_W, floor: FLOOR });
    run(cam, base({ fighters: [{ x: 100, y: FLOOR }, { x: 1000, y: FLOOR }] }), 3);
    cam.reset();
    const f = cam.update(base());
    expect(f.zoom).toBeCloseTo((720 * 0.19) / FIGHTER.h, 6);
  });
});
