import Phaser from 'phaser';

/** Loads the painted backdrops, platform strips and item sprites, then waits for the app to start a match. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  preload() {
    const base = 'assets/art/';
    for (const t of ['bridge', 'embers', 'crypt', 'grove']) {
      this.load.image(`bg-${t}`, `${base}bg-${t}.jpg`);
      this.load.image(`p-${t}`, `${base}p-${t}.png`);
    }
    for (const n of ['s-bomb', 's-frost', 's-trap', 's-trap-shut', 's-blink', 'w-arrow']) this.load.image(n, `${base}${n}.png`);
  }

  create() {
    this.game.events.emit('booted');
  }
}
