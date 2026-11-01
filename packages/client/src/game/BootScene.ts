import Phaser from 'phaser';

/** Loads the painted backdrops, platform strips and item sprites, then waits for the app to start a match. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  preload() {
    const base = 'assets/art/';
    for (const t of ['hall', 'bridge', 'embers', 'crypt', 'grove']) this.load.image(`p-${t}`, `${base}p-${t}.png`);
    this.load.image('pillar-hall', `${base}pillar-hall.png`);
    // each arena's back wall and its seamless floor (render/arena.ts lays the floor in perspective)
    for (const t of ['hall', 'bridge', 'embers', 'crypt', 'grove']) {
      this.load.image(`wall-${t}`, `${base}wall-${t}.jpg`);
      this.load.image(`floor-${t}`, `${base}floor-${t}.jpg`);
    }
    for (const n of ['s-bomb', 's-frost', 's-trap', 's-trap-shut', 's-blink', 'w-arrow']) this.load.image(n, `${base}${n}.png`);
  }

  create() {
    this.game.events.emit('booted');
  }
}
