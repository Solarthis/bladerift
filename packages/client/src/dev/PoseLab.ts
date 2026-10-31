/**
 * Dev bench (?lab): every weapon's moves and every fighter state animated side by side with the real pose code, so
 * animation work can be judged frame by frame. ?lab&t=12 freezes every cell at tick 12; ?lab&w=1 shows one weapon.
 */
// @ts-expect-error - plain JS vendor module
import { posed } from '../vendor/pixelfx/core/index.js';
import { Act, FIGHTER, MOVE_AIR, MOVE_CHARGED, MOVE_PLUNGE, moveOf, SKILLS, WEAPONS } from '@bladerift/shared';
import { fighterLut } from '../render/pixel';
import { poseFor } from '../render/poses';
import type { ViewFighter } from '../net/NetGame';

interface Cell {
  label: string;
  weapon: number;
  act: number;
  move: number;
  len: number;
  ground: boolean;
  vx: number;
  vy: number;
}

export function startPoseLab() {
  const q = new URL(location.href).searchParams;
  const only = q.has('w') ? Number(q.get('w')) : -1;
  const freeze = q.has('t') ? Number(q.get('t')) : -1;
  document.body.innerHTML = '';
  document.body.style.cssText = 'margin:0;background:#1a1424;color:#ddd;font:12px sans-serif;overflow:auto;touch-action:auto';
  const cells: Cell[] = [];
  for (let w = 0; w < WEAPONS.length; w++) {
    if (only >= 0 && w !== only) continue;
    const def = WEAPONS[w];
    const add = (label: string, act: number, move: number, len: number, ground = true, vx = 0, vy = 0) => cells.push({ label: `${def.short}: ${label}`, weapon: w, act, move, len, ground, vx, vy });
    add('idle', Act.Free, 0, 60);
    add('run', Act.Free, 0, 60, true, 230);
    add('jump', Act.Free, 0, 30, false, 0, -300);
    add('fall', Act.Free, 0, 30, false, 0, 300);
    def.combo.forEach((m, i) => add(`combo ${i + 1}`, Act.Attack, i, m.startup + m.active + m.recovery));
    add('air', Act.Attack, MOVE_AIR, def.air.startup + def.air.active + def.air.recovery, false);
    if (def.plunge) add('plunge', Act.Attack, MOVE_PLUNGE, 60, false);
    if (def.charged) {
      add('charge', Act.Charge, 0, 50);
      const c = def.charged;
      add('charged', Act.Attack, MOVE_CHARGED, c.startup + c.active + c.recovery);
    }
    if (def.block) add('block', Act.Block, 0, 40);
    add('roll', Act.Roll, 0, FIGHTER.rollTicks);
    add('stun', Act.Stun, 0, 30);
    add('heal', Act.Heal, 0, FIGHTER.healTicks);
    add('skill', Act.Skill, 0, SKILLS[0].startup + SKILLS[0].recovery);
    add('KO', Act.KO, 0, 30);
    add('win', Act.Win, 0, 30);
  }
  const grid = document.createElement('div');
  grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,180px);gap:6px;padding:8px';
  document.body.appendChild(grid);
  const W = 110;
  const H = 90;
  const lut = fighterLut(0xc8343c, 0xf53cd1);
  const items = cells.map((c) => {
    const box = document.createElement('div');
    box.style.cssText = 'background:#2a2238;border-radius:6px;padding:4px';
    const cv = document.createElement('canvas');
    cv.width = W;
    cv.height = H;
    cv.style.cssText = `width:${W * 1.6}px;height:${H * 1.6}px;image-rendering:pixelated;display:block`;
    const lab = document.createElement('div');
    lab.textContent = c.label;
    box.append(cv, lab);
    grid.appendChild(box);
    return { c, cv, lab, ctx: cv.getContext('2d')!, img: new ImageData(W, H) };
  });
  let t0 = performance.now();
  const frame = () => {
    const now = performance.now();
    for (const it of items) {
      const c = it.c;
      const tick = freeze >= 0 ? freeze : ((now - t0) / (1000 / 60)) % (c.len + 20);
      const v = {
        act: c.act, actTf: Math.min(tick, c.len), ground: c.ground, vx: c.vx, vy: c.vy, weapons: [c.weapon, c.weapon], slot: 0, move: c.move, charge: 40, skill: 0, face: 1,
      } as unknown as ViewFighter;
      const m = c.act === Act.Attack ? moveOf(c.weapon, c.move) : null;
      const pose = poseFor(v, { time: now / 1000, runPhase: now / 1000 * 10 });
      const r = posed({ ...pose, x: undefined, y: undefined }) as { n: number; xs: Int16Array; ys: Int16Array; color: Uint32Array };
      const b = new Uint32Array(it.img.data.buffer);
      b.fill(0xff382a44);
      for (let x = 0; x < W; x++) b[(H - 14) * W + x] = 0xff5a4a6e;
      for (let i = 0; i < r.n; i++) {
        const x = r.xs[i] + 40;
        const y = r.ys[i] + H - 14;
        if (x >= 0 && y >= 0 && x < W && y < H) b[y * W + x] = lut.get(r.color[i]) ?? r.color[i];
      }
      it.ctx.putImageData(it.img, 0, 0);
      // the hit box while the move can hit (art px: world units / 1.38)
      if (m && tick >= m.startup && tick < m.startup + m.active && !m.arrow) {
        it.ctx.strokeStyle = '#ff4060';
        it.ctx.strokeRect(40 + m.box.x / 1.38, H - 14 + m.box.y / 1.38, m.box.w / 1.38, m.box.h / 1.38);
      }
      it.lab.textContent = `${c.label}  t=${Math.floor(tick)}${m ? `  [${m.startup}/${m.active}/${m.recovery}]` : ''}`;
    }
    requestAnimationFrame(frame);
  };
  t0 = performance.now();
  requestAnimationFrame(frame);
}
