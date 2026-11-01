// Per-hero feel card: what a player feels in the first seconds with a hero, measured in the real sim.
// Run from the repo root: npx tsx tools/feelsim.ts
//   run     top ground speed (units/s)          jump   peak jump height (units)      dash  ground dash distance
//   A@d     mashing A against an idle foe that stands d units away: hits landed in 2 s, damage, and the full combo's time
//   B       one heavy (B) at mid range: hits / damage
import { ROUND } from '../packages/shared/src/constants';
import { Act } from '../packages/shared/src/fighter';
import { heroClass, HEROES, sanitizeLoadout } from '../packages/shared/src/heroes';
import { Btn, type InputCmd } from '../packages/shared/src/input';
import { World } from '../packages/shared/src/world';

const cmd = (seq: number, buttons = 0, moveX = 0, moveY = 0): InputCmd => ({ seq, moveX, moveY, buttons, viewTick: 0 });

function setup(h: number, foe = 13) {
  const world = new World({ arenaId: 'training', wins: ROUND.defaultWins, roundTime: ROUND.defaultTime });
  const a = world.addFighter(1, 0, 'A', sanitizeLoadout({ hero: h }), true);
  const b = world.addFighter(2, 1, 'B', sanitizeLoadout({ hero: foe }), true);
  world.start();
  // skip the intro
  let seq = 0;
  while (world.phase !== 'fight' && world.tick < 2000) {
    a.inputs.push(cmd(seq++));
    b.inputs.push(cmd(seq));
    world.step();
  }
  return { world, a, b, seq };
}

function place(world: World, a: { s: { x: number; y: number; face: number } }, b: { s: { x: number; y: number; face: number } }, d: number) {
  const mid = world.arena.w / 2;
  a.s.x = mid - d / 2;
  b.s.x = mid + d / 2;
  a.s.y = b.s.y = world.arena.floor;
  a.s.face = 1;
  b.s.face = -1;
}

function mash(h: number, d: number, btn: number, ticks = 120) {
  const { world, a, b } = setup(h);
  place(world, a, b, d);
  const hp0 = b.s.hp;
  let hits = 0;
  let lastStun = 0;
  let seq = 1000;
  for (let t = 0; t < ticks; t++) {
    a.inputs.push(cmd(seq++, t % 2 === 0 ? btn : 0));
    b.inputs.push(cmd(seq));
    world.step();
    if (b.s.act === Act.Stun && b.s.stun > lastStun) hits++;
    lastStun = b.s.act === Act.Stun ? b.s.stun : 0;
  }
  return { hits, dmg: Math.round(hp0 - b.s.hp) };
}

function move(h: number) {
  const { world, a, b } = setup(h);
  place(world, a, b, 900);
  let seq = 2000;
  let top = 0;
  const x0 = a.s.x;
  for (let t = 0; t < 60; t++) {
    a.inputs.push(cmd(seq++, 0, 1));
    b.inputs.push(cmd(seq));
    world.step();
  }
  top = ((a.s.x - x0) / 60) * 60; // rough average incl. acceleration
  // jump
  place(world, a, b, 900);
  const y0 = a.s.y;
  let peak = 0;
  for (let t = 0; t < 70; t++) {
    a.inputs.push(cmd(seq++, t < 20 ? Btn.Jump : 0));
    b.inputs.push(cmd(seq));
    world.step();
    peak = Math.max(peak, y0 - a.s.y);
  }
  // roll / dash distance
  for (let t = 0; t < 60; t++) {
    a.inputs.push(cmd(seq++));
    b.inputs.push(cmd(seq));
    world.step();
  }
  place(world, a, b, 900);
  const x1 = a.s.x;
  for (let t = 0; t < 40; t++) {
    a.inputs.push(cmd(seq++, t === 1 ? Btn.Roll : 0, t === 1 ? 1 : 0));
    b.inputs.push(cmd(seq));
    world.step();
  }
  return { run: Math.round(top), jump: Math.round(peak), dash: Math.round(a.s.x - x1) };
}

const pad = (s: string | number, n: number) => String(s).padEnd(n);
console.log(pad('hero', 20) + pad('cls', 10) + pad('hp', 6) + pad('run', 6) + pad('jump', 6) + pad('dash', 6) + pad('A@60', 12) + pad('A@110', 12) + pad('A@180', 12) + 'B@150');
for (const h of HEROES) {
  const C = heroClass(sanitizeLoadout({ hero: h.id }));
  const m = move(h.id);
  const a1 = mash(h.id, 60, Btn.A);
  const a2 = mash(h.id, 110, Btn.A);
  const a3 = mash(h.id, 180, Btn.A);
  const bb = mash(h.id, 150, Btn.B, 90);
  const f = (r: { hits: number; dmg: number }) => `${r.hits}h ${r.dmg}`;
  console.log(pad(h.name.slice(0, 19), 20) + pad(['Saber', 'Archer', 'Lancer', 'Caster', 'Assassin', 'Berserker', 'Shielder', 'Rider'][h.cls], 10) + pad(C.hp, 6) + pad(m.run, 6) + pad(m.jump, 6) + pad(m.dash, 6) + pad(f(a1), 12) + pad(f(a2), 12) + pad(f(a3), 12) + f(bb));
}
