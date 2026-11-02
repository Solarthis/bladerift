/**
 * The fight camera brain: a pure, deterministic function of the last frame's state and this frame's input, with no
 * Phaser or DOM access. GameScene feeds it the view size, the touch-control pads and the fighters' feet, and applies the
 * returned zoom and view centre to the Phaser camera.
 *
 * The framing rules (measured off the MUGEN reference, docs/feel/mugen-reference.md section 5):
 * - Zoom is fixed on the fighters' size: a standing fighter (FIGHTER.h) is `heightShare` of the view height (19% on
 *   desktop, 24% on touch phones). The camera zooms out only as far as needed to keep both fighters, with `margin`
 *   world units beyond each, inside the usable width between the touch pads. It never zooms out past the arena.
 * - Zoom-out is quick (8/s). Zoom-in waits 0.6 s of wanting it, then eases slowly (2/s), so the frame never breathes.
 * - Horizontal: a dead zone (the middle half of the usable width) in which the camera does not move at all. A fighter
 *   that leaves it pushes the frame just far enough to bring it back to the edge of the zone.
 * - Vertical: the floor sits at 75% of the view height (72% on touch, so more of the floor shows above the buttons).
 *   The camera rises only when a fighter is more than `liftAbove` units above the floor, and never lets the highest
 *   head leave the top of the view.
 * - The view never shows more than `wallSlack` units past the arena walls. An arena narrower than the view is centred.
 */
import { FIGHTER } from '@bladerift/shared';

/** The tuning, in one place. World units unless noted. */
export const CAMERA = {
  /** A standing fighter's height as a share of the view height: desktop 19% (18-20%), touch 24% (22-26%). */
  heightShare: { desktop: 0.19, touch: 0.24 },
  /** The floor line's place down the view (share of its height from the top): desktop 75%, touch 72%. */
  floorShare: { desktop: 0.75, touch: 0.72 },
  /** Units kept clear beyond each fighter's x, on both sides, when zooming out to fit both. */
  margin: 95,
  /** A fighter this far above the floor starts to lift the camera. */
  liftAbove: 110,
  /** Units kept clear above the highest fighter's head when the camera lifts (a touch view's floor is lower on screen). */
  headroom: 6,
  /** Half-width of the horizontal dead zone, as a share of the usable width (0.25 = the middle half). */
  deadShare: 0.25,
  /** How far the view may show past the arena walls. */
  wallSlack: 50,
  /** Zoom-out ease rate (per second). */
  zoomOutRate: 8,
  /** Zoom-in ease rate (per second), used only after the wait. */
  zoomInRate: 2,
  /** Seconds of wanting a closer frame before the zoom-in starts. */
  zoomInWait: 0.6,
  /** Horizontal pan ease rate (per second), once a fighter has left the dead zone. */
  panRate: 8,
  /** Vertical ease rate (per second). */
  liftRate: 6,
  /** Longest frame step taken, in seconds: a stalled tab must not jump the camera. */
  maxDt: 0.25,
} as const;

/** One frame's input to the camera. */
export interface CameraInput {
  /** Frame time, seconds (clamped to 0..CAMERA.maxDt). */
  dt: number;
  /** View size in screen pixels. */
  viewW: number;
  viewH: number;
  /** Screen pixels the touch controls take on the left (the stick) and right (the buttons); 0 without touch controls. */
  padLeft: number;
  padRight: number;
  /** A touch layout: the smaller fighter target and the higher floor line. */
  touch: boolean;
  /** Fighter feet, in world units: x across, y down (the floor is the largest y). */
  fighters: { x: number; y: number }[];
}

/** The camera for this frame: zoom in screen pixels per world unit, and the world point at the view centre. */
export interface CameraFrame {
  zoom: number;
  x: number;
  y: number;
}

/** Construction options: the arena's width and floor line (world units). */
export interface FightCameraOpts {
  arenaW: number;
  floor: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Frame-rate independent exponential ease of `v` towards `target`. */
const easeTo = (v: number, target: number, rate: number, dt: number) => v + (target - v) * (1 - Math.exp(-rate * dt));

/** The fight camera. One instance per match; call update() once per frame. */
export class FightCamera {
  private readonly arenaW: number;
  private readonly floor: number;
  /** False until the first update (and after reset): that update frames the fighters at once, without easing. */
  private started = false;
  /** Zoom in screen pixels per world unit. */
  private zoom = 1;
  /** World x at the centre of the usable width (the dead zone's frame). */
  private fc = 0;
  /** World y at the view centre. */
  private cy = 0;
  /** Seconds the closer zoom has been wanted. */
  private zoomInWait = 0;

  constructor(opts: FightCameraOpts) {
    this.arenaW = opts.arenaW;
    this.floor = opts.floor;
  }

  /** Forget the framing: the next update frames the fighters at once (call at each match or round start). */
  reset(): void {
    this.started = false;
    this.zoomInWait = 0;
  }

  /** Advance the camera by one frame and return where it looks. */
  update(input: CameraInput): CameraFrame {
    const dt = Number.isFinite(input.dt) ? clamp(input.dt, 0, CAMERA.maxDt) : 0;
    const vw = Math.max(1, input.viewW);
    const vh = Math.max(1, input.viewH);
    // the touch pads each take at most half the view, so the usable width never collapses to nothing
    const padL = clamp(input.padLeft, 0, vw / 2);
    const padR = clamp(input.padRight, 0, vw / 2);
    const useW = vw - padL - padR;

    // the fighters' extent: x across, the highest feet (smallest y) for the lift
    let minX = this.arenaW / 2;
    let maxX = minX;
    let minY = this.floor;
    if (input.fighters.length) {
      minX = Infinity;
      maxX = -Infinity;
      minY = Infinity;
      for (const f of input.fighters) {
        if (f.x < minX) minX = f.x;
        if (f.x > maxX) maxX = f.x;
        if (f.y < minY) minY = f.y;
      }
    }

    const share = input.touch ? CAMERA.heightShare.touch : CAMERA.heightShare.desktop;
    const floorShare = input.touch ? CAMERA.floorShare.touch : CAMERA.floorShare.desktop;
    // the zoom: the closest framing that keeps both fighters in the usable width, never out past the arena
    const closeZoom = (vh * share) / FIGHTER.h;
    const fitZoom = useW / (maxX - minX + 2 * CAMERA.margin);
    const minZoom = vw / (this.arenaW + 2 * CAMERA.wallSlack);
    const want = Math.max(minZoom, Math.min(closeZoom, fitZoom));

    if (!this.started) {
      this.started = true;
      this.zoom = want;
      this.fc = (minX + maxX) / 2;
      this.cy = this.verticalTarget(minY, vh / this.zoom, floorShare);
    }

    // zoom out fast when the fighters part; zoom in only once the closer framing has been wanted for a while
    if (want < this.zoom) {
      this.zoomInWait = 0;
      this.zoom = easeTo(this.zoom, want, CAMERA.zoomOutRate, dt);
    } else if (want > this.zoom) {
      this.zoomInWait += dt;
      if (this.zoomInWait > CAMERA.zoomInWait) this.zoom = easeTo(this.zoom, want, CAMERA.zoomInRate, dt);
    } else {
      this.zoomInWait = 0;
    }

    // horizontal: still while both fighters are in the dead zone; otherwise push the frame to the zone's edge
    const dz = (CAMERA.deadShare * useW) / this.zoom;
    let target = this.fc;
    if (maxX - minX > 2 * dz) target = (minX + maxX) / 2;
    else if (minX < this.fc - dz) target = minX + dz;
    else if (maxX > this.fc + dz) target = maxX - dz;
    this.fc = easeTo(this.fc, target, CAMERA.panRate, dt);

    // vertical: the floor at its share of the view, lifted only for a high fighter, and the head kept in view
    this.cy = easeTo(this.cy, this.verticalTarget(minY, vh / this.zoom, floorShare), CAMERA.liftRate, dt);

    // the view centre sits this far from the usable centre (the pads shift the frame towards the open side)
    const off = (padR - padL) / 2 / this.zoom;
    const halfW = vw / this.zoom / 2;
    let x = this.fc + off;
    if (halfW * 2 >= this.arenaW + 2 * CAMERA.wallSlack) x = this.arenaW / 2;
    else x = clamp(x, halfW - CAMERA.wallSlack, this.arenaW + CAMERA.wallSlack - halfW);
    return { zoom: this.zoom, x, y: this.cy };
  }

  /**
   * The view-centre y that frames the floor at its share and lifts for the highest fighter (feet at `minY`) when the
   * fighter is above the lift line, or when its head would leave the top of a view `h` units tall.
   */
  private verticalTarget(minY: number, h: number, floorShare: number): number {
    const below = (floorShare - 0.5) * h; // how far the floor line sits below the view centre
    const floorCy = this.floor - below;
    const liftCy = minY + CAMERA.liftAbove - below;
    const headCy = minY - FIGHTER.h - CAMERA.headroom + h / 2;
    return Math.min(floorCy, liftCy, headCy);
  }
}
