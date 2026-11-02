/**
 * Animated stage elements (one module per arena theme: hall.ts, bridge.ts, embers.ts, crypt.ts, grove.ts), built by
 * render/arena.ts after the wall and floor. Each module exports `build: BuildStageFx`.
 *
 * Coordinates: the back wall is drawn at horizontal scroll factor `FAR` (things fixed to the wall use
 * `setScrollFactor(FAR, 1)`); the floor runs from `wallBase` (its far edge) down past `floor` (the fighters' line);
 * the wall picture spans `wallTop`..`wallBase` and repeats every `tw` world units, centred on `W / 2`.
 * Depths: wall details -19.9 .. -19.6 (on the wall, under the floor strips at -19), floor decals -18.7, air behind the
 * fighters 7.3, glowing air in front of everything 13.2 (additive, above the light map at 12.5).
 */
import type Phaser from 'phaser';

export interface StageCtx {
  scene: Phaser.Scene;
  theme: string;
  /** Arena width (world units) and the fighters' floor line (y). */
  W: number;
  floor: number;
  /** The foot and the top of the back wall (y), its horizontal scroll factor, and the width of one wall picture. */
  wallBase: number;
  wallTop: number;
  FAR: number;
  tw: number;
  /** 'low' on weak devices (Settings > Graphics): at most a third of the particles, no extra lights. */
  quality: 'high' | 'low';
}

export interface StageFx {
  /** Once per frame after the camera moved. `dt` in seconds. Must not allocate per frame. */
  update(dt: number, cam: Phaser.Cameras.Scene2D.Camera): void;
  destroy(): void;
}

export type BuildStageFx = (ctx: StageCtx) => StageFx;
