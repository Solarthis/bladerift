import Phaser from 'phaser';
import {
  Act, ARENAS, ArtId, classOf, FIGHTER, GameEvent, MOVE_PLUNGE, moveOf, NetProjectile, NetStrike, NetTrap, TICK_RATE, WEAPONS, WeaponId,
} from '@bladerift/shared';
import type { NetGame, ViewFighter } from '../net/NetGame';
import type { Session } from '../net/Session';
import type { InputSource } from '../input/Controls';
import { FighterCanvas, fighterLut, FxModule, FxSprite, PIX, Pose } from '../render/pixel';
import { poseFor } from '../render/poses';
import { FX, PAL, swingFx } from '../render/fxmap';
import { sfx } from '../audio/Sfx';
import { prefs } from '../ui/prefs';
import { buildArena } from '../render/arena';
import { colorOf, accentOf } from '../ui/colors';

/** A fighter controlled on this device: its connection and its input. */
export interface LocalPlayer {
  session: Session;
  input: InputSource;
}

export interface GameSceneData {
  players: LocalPlayer[];
  /** The session the HUD and spectating view follow. */
  primary: Session;
}

interface FighterView {
  id: number;
  canvas: FighterCanvas;
  img: Phaser.GameObjects.Image;
  tag: Phaser.GameObjects.Text;
  ghosts: { img: Phaser.GameObjects.Image; tex: Phaser.Textures.CanvasTexture; life: number }[];
  ghostI: number;
  ghostAt: number;
  /** Pose time held during a hit-stop. */
  frozenT: number;
  freezeUntil: number;
  flashUntil: number;
  lastSeq: number;
  runPhase: number;
  lastX: number;
  wasGround: boolean;
  status: Partial<Record<StatusKind, FxSprite>>;
  stunnedUntil: number;
  koT: number;
  color: number;
  shown: ViewFighter | null;
}

type StatusKind = 'burning' | 'slowed' | 'stunned' | 'rage' | 'divineShield' | 'spellCharge';

interface Scheduled {
  at: number;
  fn: () => void;
}

const STEP_MS = 1000 / TICK_RATE;

export class GameScene extends Phaser.Scene {
  private players: LocalPlayer[] = [];
  private primary!: Session;
  private acc = 0;
  private views = new Map<number, FighterView>();
  private fx: FxSprite[] = [];
  private projViews = new Map<number, { img?: Phaser.GameObjects.Image; fx?: FxSprite; kind: string }>();
  private trapViews = new Map<number, Phaser.GameObjects.Image>();
  private strikeViews = new Map<number, Phaser.GameObjects.Graphics>();
  private scheduled: Scheduled[] = [];
  private shakeT = 0;
  private shakeAmp = 0;
  private clock = 0;
  private arenaW = 1280;
  private floor = 600;
  private camX = 640;
  private camY = 400;
  private camZoom = 1;
  /** Banner / round callbacks for the HUD (set by App). */
  onEvent: ((e: GameEvent) => void) | null = null;

  constructor() {
    super('game');
  }

  init(data: GameSceneData) {
    this.players = data.players;
    this.primary = data.primary;
    this.acc = 0;
    this.views.clear();
    this.fx = [];
    this.projViews.clear();
    this.trapViews.clear();
    this.scheduled = [];
  }

  private get game0(): NetGame | null {
    return this.primary.game;
  }

  create() {
    const g = this.game0;
    const arena = g?.arena ?? ARENAS[0];
    this.arenaW = arena.w;
    this.floor = arena.floor;
    this.cameras.main.setBackgroundColor('#0d0a14');
    buildArena(this, this.game0!.arena);
    this.camX = arena.w / 2;
    this.camY = arena.floor - 200;
    this.events.once('shutdown', () => this.teardown());
  }

  // ------------------------------------------------------------------ arena

  // ------------------------------------------------------------------ loop

  override update(_time: number, deltaMs: number) {
    const dt = Math.min(0.1, deltaMs / 1000);
    this.clock += dt;
    // fixed-step input
    this.acc += Math.min(deltaMs, 250);
    let n = 0;
    while (this.acc >= STEP_MS && n < 5) {
      this.acc -= STEP_MS;
      n++;
      for (const p of this.players) {
        const g = p.session.game;
        if (!g) continue;
        const i = p.input.read();
        p.session.sendInput(g.tick(i.moveX, i.moveY, i.buttons));
      }
    }
    if (this.acc >= STEP_MS) {
      const skip = Math.floor(this.acc / STEP_MS);
      for (const p of this.players) p.session.game?.skipTicks(skip);
      this.acc -= skip * STEP_MS;
    }
    for (const p of this.players) {
      p.session.flushInputs();
      if (p.session.game) p.session.game.renderAlpha = this.acc / STEP_MS;
    }
    const g = this.game0;
    if (!g) return;
    const now = performance.now();

    // fighters: the primary game's view, with each local player's own predicted fighter
    const list = g.fighters(now);
    const mine = new Map<number, ViewFighter>();
    for (const p of this.players) {
      const pg = p.session.game;
      if (!pg || pg === g) continue;
      for (const f of pg.fighters(now)) if (f.self) mine.set(f.id, f);
    }
    for (let i = 0; i < list.length; i++) {
      const m = mine.get(list[i].id);
      if (m) list[i] = m;
    }
    const seen = new Set<number>();
    for (const v of list) {
      seen.add(v.id);
      this.drawFighter(v, now, dt);
    }
    for (const [id, fv] of this.views) if (!seen.has(id)) this.removeView(id, fv);

    // events (the primary's; same-device sessions get identical ones)
    for (const e of g.drainEvents(now)) this.onGameEvent(e, list);
    // other local sessions: drain so their queues stay short
    for (const p of this.players) if (p.session.game && p.session.game !== g) p.session.game.drainEvents(now);

    this.drawProjectiles(g.projectiles(now));
    this.drawTraps(g.traps());
    this.drawStrikes(g.latest?.strikes ?? []);
    // scheduled visuals (effects lined up with strikes)
    for (let i = this.scheduled.length - 1; i >= 0; i--) {
      if (now >= this.scheduled[i].at) {
        const s = this.scheduled[i];
        this.scheduled.splice(i, 1);
        s.fn();
      }
    }
    for (let i = this.fx.length - 1; i >= 0; i--) {
      this.fx[i].update(dt);
      if (this.fx[i].dead) this.fx.splice(i, 1);
    }
    this.updateCamera(list, dt);
  }

  // ------------------------------------------------------------------ fighters

  private viewFor(v: ViewFighter): FighterView {
    let fv = this.views.get(v.id);
    if (fv) return fv;
    const r = this.primary.roster.get(v.id) ?? [...this.players].map((p) => p.session.roster.get(v.id)).find(Boolean);
    const color = colorOf(r?.color ?? v.seat * 5);
    const lut = fighterLut(color, accentOf(r?.look?.accent ?? 0));
    const canvas = new FighterCanvas(this, `fighter${v.id}`, lut);
    const img = this.add.image(v.x, v.y, canvas.key).setOrigin(FighterCanvas.originX, FighterCanvas.originY).setScale(PIX).setDepth(10);
    const tag = this.add
      .text(v.x, v.y - 70, r?.name ?? '', { fontFamily: 'Lilita One, sans-serif', fontSize: '12px', color: '#' + color.toString(16).padStart(6, '0'), stroke: '#0b0814', strokeThickness: 3 })
      .setOrigin(0.5, 1)
      .setDepth(30);
    fv = {
      id: v.id, canvas, img, tag, ghosts: [], ghostI: 0, ghostAt: 0, frozenT: 0, freezeUntil: 0, flashUntil: 0, lastSeq: -1, runPhase: 0,
      lastX: v.x, wasGround: true, status: {}, stunnedUntil: 0, koT: 0, color, shown: null,
    };
    for (let i = 0; i < 4; i++) {
      const key = `ghost${v.id}_${i}`;
      if (this.textures.exists(key)) this.textures.remove(key);
      const tex = this.textures.createCanvas(key, canvas.tex.width, canvas.tex.height)!;
      tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
      const gimg = this.add.image(0, 0, key).setOrigin(FighterCanvas.originX, FighterCanvas.originY).setScale(PIX).setDepth(9).setVisible(false).setTint(color);
      gimg.tintMode = Phaser.TintModes.FILL;
      fv.ghosts.push({ img: gimg, tex, life: 0 });
    }
    this.views.set(v.id, fv);
    return fv;
  }

  private removeView(id: number, fv: FighterView) {
    fv.img.destroy();
    fv.tag.destroy();
    for (const gh of fv.ghosts) gh.img.destroy();
    for (const s of Object.values(fv.status)) s?.destroy();
    this.views.delete(id);
  }

  private drawFighter(v: ViewFighter, now: number, dt: number) {
    const fv = this.viewFor(v);
    fv.shown = v;
    // swing effects for moves this device predicted (yours) start now; others come with their 'swing' events
    if (v.self && v.act === Act.Attack && v.moveSeq !== fv.lastSeq) this.startSwing(v.id, v.weapons[v.slot], v.move, v.actTf);
    if (v.self) fv.lastSeq = v.moveSeq;
    // hit-stop: the pose holds while frozen
    let t = v.actTf;
    if (now < fv.freezeUntil) t = fv.frozenT;
    else fv.frozenT = v.actTf;
    const speed = Math.abs(v.vx);
    if (v.ground && speed > 25) fv.runPhase += dt * (6 + speed / 28);
    const pose = poseFor({ ...v, actTf: t }, { time: this.clock, runPhase: fv.runPhase });
    const flash = now < fv.flashUntil ? 0.8 : v.invuln && v.act !== Act.Roll && Math.floor(this.clock * 12) % 2 ? 0.35 : 0;
    const tint = v.slowed ? 0xffffd2a8 : 0;
    fv.canvas.draw(stripXY(pose), flash, tint);
    fv.img.setPosition(v.x, v.y).setFlipX(v.face < 0);
    // KO: topple over backwards
    if (v.act === Act.KO) {
      fv.koT = Math.min(1, fv.koT + dt * 3);
      fv.img.setAngle(-v.face * 85 * Phaser.Math.Easing.Cubic.Out(fv.koT));
    } else {
      fv.koT = 0;
      fv.img.setAngle(0);
    }
    fv.tag.setPosition(v.x, v.y - 62);
    // after-images
    if (pose.ghost && now - fv.ghostAt > 45) {
      fv.ghostAt = now;
      const gh = fv.ghosts[fv.ghostI++ % fv.ghosts.length];
      gh.tex.context.clearRect(0, 0, gh.tex.width, gh.tex.height);
      gh.tex.context.drawImage(fv.canvas.tex.getSourceImage() as HTMLCanvasElement, 0, 0);
      gh.tex.refresh();
      gh.img.setPosition(v.x, v.y).setFlipX(v.face < 0).setVisible(true).setAlpha(0.5);
      gh.life = 0.22;
    }
    for (const gh of fv.ghosts) {
      if (gh.life <= 0) continue;
      gh.life -= dt;
      gh.img.setAlpha(Math.max(0, gh.life / 0.22) * 0.5);
      if (gh.life <= 0) gh.img.setVisible(false);
    }
    // plunge landing
    if (v.ground && !fv.wasGround && v.act === Act.Attack && v.move === MOVE_PLUNGE) {
      this.addFx(FX.heavyLanding, v.x, v.y, v.face < 0, 1.4);
      this.shake(0.5);
      sfx.play('impact', { x: v.x, y: v.y });
    }
    fv.wasGround = v.ground;
    // status loops follow the body
    this.statusLoop(fv, 'burning', v.burning, v);
    this.statusLoop(fv, 'slowed', v.slowed || v.rooted, v);
    this.statusLoop(fv, 'stunned', now < fv.stunnedUntil, v);
    // Rift Art auras: Blood Frenzy's rage, Bulwark's barrier, the wind-up glow of Radiant Cleave / Thunder Call
    const art = v.act === Act.Art ? classOf(v.cls).art : -1;
    this.statusLoop(fv, 'rage', v.frenzy || art === ArtId.BloodFrenzy, v);
    this.statusLoop(fv, 'divineShield', art === ArtId.Bulwark, v);
    this.statusLoop(fv, 'spellCharge', (art === ArtId.RadiantCleave || art === ArtId.ThunderCall) && v.actTf < 20, v, art === ArtId.ThunderCall ? PAL.violet : PAL.gold);
    // Flash Step: gone from sight while it slips behind the opponent
    fv.img.setAlpha(art === ArtId.FlashStep && v.actTf < 9 ? 0.15 : 1);
    fv.lastX = v.x;
  }

  private statusLoop(fv: FighterView, kind: StatusKind, on: boolean, v: ViewFighter, palette?: string[]) {
    const cur = fv.status[kind];
    if (on && (!cur || cur.dead)) {
      fv.status[kind] = new FxSprite(this, FX[kind], v.x, v.y, v.face < 0, palette ? { palette } : {}, 9, 12, 30);
    } else if (!on && cur && !cur.dead) {
      cur.stop();
    }
    const s = fv.status[kind];
    if (s && !s.dead) {
      s.setPosition(v.x, v.y);
      s.update(0);
      if (!this.fx.includes(s)) this.fx.push(s);
    }
  }

  /** Swing effect lined up with the move's first hitting tick (`actT` ticks already elapsed). */
  private startSwing(id: number, weapon: number, move: number, actT: number) {
    const m = moveOf(weapon, move);
    if (!m) return;
    const sw = swingFx(weapon, move);
    const delay = Math.max(0, (m.startup - actT) * STEP_MS);
    sfx.play(weapon === WeaponId.Hammer || weapon === WeaponId.Scythe ? 'swing' : 'swing', { pitch: weapon === WeaponId.Daggers ? 1.4 : weapon === WeaponId.Hammer ? 0.7 : 1 });
    const fire = () => {
      const fv = this.views.get(id);
      const v = fv?.shown;
      if (!fv || !v || v.act !== Act.Attack) return;
      if (sw) this.addFx(sw.mod, v.x, v.y, v.face < 0, sw.rate, sw.opts);
      // the hammer's third blow and any hammer plunge crack the ground
      if (weapon === WeaponId.Hammer && move === 2) {
        this.addFx(FX.groundSlam, v.x + v.face * 40, v.y, v.face < 0, 1.8);
        this.shake(0.9);
        sfx.play('explosion', { x: v.x, y: v.y, volume: 0.6, pitch: 0.8 });
      }
    };
    if (delay <= 0) fire();
    else this.scheduled.push({ at: performance.now() + delay, fn: fire });
  }

  private addFx(mod: FxModule, x: number, y: number, flip: boolean, rate = 1, opts: Record<string, unknown> = {}, depthBack = 5, depthFront = 15) {
    const f = new FxSprite(this, mod, x, y, flip, opts, depthBack, depthFront);
    f.rate = rate;
    this.fx.push(f);
    return f;
  }

  // ------------------------------------------------------------------ events

  private onGameEvent(e: GameEvent, list: ViewFighter[]) {
    const find = (id: number) => list.find((f) => f.id === id);
    const isLocal = (id: number) => this.players.some((p) => p.session.selfId === id);
    switch (e.t) {
      case 'swing': {
        if (isLocal(e.p)) break; // predicted already
        this.startSwing(e.p, e.w, e.m, 0);
        break;
      }
      case 'hit': {
        const a = find(e.a);
        const v = find(e.v);
        const burn = e.w === 200;
        const heavy = e.w === WeaponId.Hammer || e.amt >= 140;
        if (!burn) {
          const flip = a ? a.x > e.x : false;
          this.addFx(e.crit ? FX.critHit : heavy ? FX.bluntHit : FX.hitSpark, e.x, e.y + 14, flip, 1.3, {}, 16, 26);
          // Flash Step's cuts: a cyan slash on every strike of the flurry
          if (e.w === 104) this.addFx(FX.claw, e.x, e.y + 26, flip, 2.4, { palette: PAL.cyan }, 16, 26);
          const stop = Math.min(0.16, 0.05 + e.amt / 1600);
          for (const id of [e.a, e.v]) {
            const fv = this.views.get(id);
            if (fv) fv.freezeUntil = performance.now() + stop * 1000;
          }
          for (const f of this.fx) if (f.rate > 1.1) f.freeze = Math.max(f.freeze, stop);
          const wdef = WEAPONS[e.w];
          this.shake(Math.max(0.15, wdef ? Math.max(...wdef.combo.map((m) => m.shake ?? 0)) * 0.7 : 0.2, e.crit ? 0.5 : 0));
          sfx.play(heavy ? 'impact' : 'hit', { x: e.x, y: e.y, pitch: e.crit ? 1.2 : 1 });
          if (isLocal(e.v)) navigator.vibrate?.(e.amt > 120 ? 40 : 18);
        }
        const fv = this.views.get(e.v);
        if (fv && !burn) fv.flashUntil = performance.now() + 90;
        if (prefs().damageNumbers && v) {
          const pal = burn ? ['#1a0a04', '#4a1a06', '#8c3a08', '#d46a10', '#ff9a2a', '#ffc46a', '#ffe8b0', '#ffffff'] : undefined;
          const mod = e.crit ? FX.critNumber : FX.damageNumber;
          this.addFx(mod, v.x + (Math.random() * 16 - 8), v.y - FIGHTER.h - 6, false, 1.1, { text: e.crit ? `${e.amt}!` : `-${e.amt}`, ...(pal ? { palette: pal } : {}) }, 31, 32);
        }
        break;
      }
      case 'block': {
        const v = find(e.v);
        const a = find(e.a);
        if (v) this.addFx(FX.shieldBlock, v.x, v.y, a ? a.x < v.x : v.face < 0, 1.4);
        sfx.play('shieldHit', { x: e.x, y: e.y });
        this.shake(0.15);
        break;
      }
      case 'parry': {
        this.addFx(FX.parry, e.x, e.y + 20, false, 1.3, {}, 16, 26);
        sfx.play('shieldBreak', { x: e.x, y: e.y });
        const fv = this.views.get(e.v);
        if (fv) fv.stunnedUntil = performance.now() + (FIGHTER.parryStun / TICK_RATE) * 1000;
        for (const id of [e.a, e.v]) {
          const f = this.views.get(id);
          if (f) f.freezeUntil = performance.now() + 140;
        }
        this.shake(0.4);
        break;
      }
      case 'shoot': {
        const names = ['swing', 'grenadeThrow', 'railgun', 'reload'] as const;
        sfx.play(names[e.kind] ?? 'swing', { volume: 0.8, pitch: e.kind === 0 ? 1.5 : 1 });
        break;
      }
      case 'boom':
        this.addFx(FX.smallExplosion, e.x, e.y, false, 1.6, {}, 16, 26);
        sfx.play('explosion', { x: e.x, y: e.y });
        this.shake(0.6);
        break;
      case 'trap': {
        const img = this.add.image(e.x, e.y, 's-trap-shut').setOrigin(0.5, 1).setScale(0.16).setDepth(11);
        this.tweens.add({ targets: img, alpha: 0, delay: 900, duration: 400, onComplete: () => img.destroy() });
        sfx.play('impact', { x: e.x, y: e.y, pitch: 1.4 });
        break;
      }
      case 'roll': {
        const v = find(e.p);
        if (v) this.addFx(FX.poof, v.x - v.face * 6, v.y, v.face > 0, 2.2, {}, 8, 8);
        sfx.play('jetStart', { volume: 0.4 });
        break;
      }
      case 'heal': {
        const v = find(e.p);
        if (v) this.addFx(FX.heal, v.x, v.y, false, 1.2, {}, 9, 16);
        sfx.play('pickupHealth');
        break;
      }
      case 'blink':
        this.addFx(FX.blinkOut, e.x0, e.y, false, 1.6);
        this.addFx(FX.blinkIn, e.x1, e.y, false, 1.6);
        sfx.play('railgun', { pitch: 1.6, volume: 0.6 });
        break;
      case 'art': {
        const v = find(e.p);
        sfx.play('railgun', { pitch: 0.7, volume: 0.9 });
        this.shake(0.35);
        if (v) {
          if (e.art === ArtId.ThunderCall) this.addFx(FX.circleCast, v.x, v.y, v.face < 0, 1.6, { palette: PAL.violet });
          else if (e.art === ArtId.PiercingFang) this.addFx(FX.chargeUp, v.x, v.y, v.face < 0, 2.4, { palette: PAL.crimson });
          else if (e.art === ArtId.HailOfArrows) this.addFx(FX.circleCast, v.x, v.y, v.face < 0, 1.8, { palette: PAL.gold });
          else if (e.art === ArtId.BloodFrenzy) this.addFx(FX.pow, v.x, v.y - 34, false, 1.2, { palette: PAL.crimson }, 31, 32);
          // every Art freezes the moment for a beat
          const fv = this.views.get(e.p);
          if (fv) fv.freezeUntil = performance.now() + 120;
        }
        break;
      }
      case 'strike':
        this.addFx(FX.lightningStrike, e.x, e.y, false, 1.6, {}, 16, 26);
        sfx.play('explosion', { x: e.x, y: e.y, pitch: 1.6, volume: 0.8 });
        this.shake(0.55);
        break;
      case 'ko': {
        const v = find(e.v);
        if (v) this.addFx(FX.pow, v.x, v.y - 30, false, 1, {}, 31, 32);
        sfx.play('death');
        this.shake(0.8);
        break;
      }
      case 'fight':
        sfx.play('matchStart');
        break;
      case 'round':
        sfx.play('kill');
        break;
      case 'match':
        sfx.play('matchEnd');
        break;
    }
    this.onEvent?.(e);
  }

  // ------------------------------------------------------------------ projectiles and traps

  private drawProjectiles(list: NetProjectile[]) {
    const seen = new Set<number>();
    for (const p of list) {
      seen.add(p.id);
      let pv = this.projViews.get(p.id);
      if (!pv) {
        pv = { kind: p.kind };
        if (p.kind === 'arrow') pv.fx = new FxSprite(this, FX.arrow, p.x, p.y, p.vx < 0, p.heavy ? { palette: ['#3a1a70', '#7f5ad8', '#e8e2ff', '#ffffff'] } : {}, 14, 14, 10);
        else if (p.kind === 'frost') pv.fx = new FxSprite(this, FX.iceLance, p.x, p.y, p.vx < 0, {}, 14, 14, 10);
        else if (p.kind === 'arcane') pv.fx = new FxSprite(this, FX.energyDisc, p.x, p.y, p.vx < 0, { palette: PAL.violet }, 14, 14, 10);
        else if (p.kind === 'orb') pv.fx = new FxSprite(this, FX.arcaneOrb, p.x, p.y + 30, false, {}, 14, 14, 10);
        else if (p.kind === 'wave') {
          pv.fx = new FxSprite(this, FX.energyDisc, p.x, p.y, p.vx < 0, { palette: PAL.gold }, 14, 14, 10);
          pv.fx.front.setScale(2.6, 3.4);
          pv.fx.back.setScale(2.6, 3.4);
        }
        else {
          pv.img = this.add.image(p.x, p.y, 's-bomb').setScale(0.075).setDepth(14);
          pv.fx = new FxSprite(this, FX.fireball, p.x, p.y, p.vx > 0, { radius: 2 }, 13, 13, 10);
        }
        if (pv.fx) this.fx.push(pv.fx);
        this.projViews.set(p.id, pv);
      }
      pv.fx?.setPosition(p.x, p.kind === 'orb' ? p.y + 30 : p.y);
      if (pv.fx && p.kind === 'arrow') {
        const ang = Math.atan2(p.vy, Math.abs(p.vx)) * (p.vx < 0 ? -1 : 1);
        pv.fx.front.setRotation(ang);
        pv.fx.back.setRotation(ang);
      }
      if (pv.img) pv.img.setPosition(p.x, p.y).setRotation(pv.img.rotation + 0.25 * Math.sign(p.vx));
    }
    for (const [id, pv] of this.projViews) {
      if (seen.has(id)) continue;
      pv.img?.destroy();
      pv.fx?.destroy();
      if (pv.kind === 'frost') {
        const f = this.projViews.get(id);
        void f;
      }
      this.projViews.delete(id);
    }
  }

  private drawTraps(list: NetTrap[]) {
    const seen = new Set<number>();
    for (const t of list) {
      seen.add(t.id);
      let img = this.trapViews.get(t.id);
      if (!img) {
        img = this.add.image(t.x, t.y + 2, 's-trap').setOrigin(0.5, 1).setScale(0.15).setDepth(8);
        this.trapViews.set(t.id, img);
      }
      img.setAlpha(t.armed ? 1 : 0.5);
    }
    for (const [id, img] of this.trapViews) if (!seen.has(id)) (img.destroy(), this.trapViews.delete(id));
  }

  /** Thunder Call targets: a crackling ring on the floor that tightens until the bolt lands. */
  private drawStrikes(list: NetStrike[]) {
    const seen = new Set<number>();
    for (const s of list) {
      seen.add(s.id);
      let g = this.strikeViews.get(s.id);
      if (!g) {
        g = this.add.graphics().setDepth(7);
        this.strikeViews.set(s.id, g);
      }
      const k = Math.max(0, Math.min(1, s.left / 20));
      g.clear();
      g.lineStyle(2, 0xc09cff, 0.5 + (1 - k) * 0.5);
      g.strokeEllipse(s.x, s.y - 2, 30 + 50 * k, 8 + 12 * k);
      g.fillStyle(0x8a5ae0, 0.18 + (1 - k) * 0.3);
      g.fillEllipse(s.x, s.y - 2, 30, 8);
    }
    for (const [id, g] of this.strikeViews) if (!seen.has(id)) (g.destroy(), this.strikeViews.delete(id));
  }

  // ------------------------------------------------------------------ camera

  private shake(amp: number, extra = 0) {
    const k = prefs().shake;
    this.shakeAmp = Math.max(this.shakeAmp, (amp + extra) * 7 * k);
    this.shakeT = 0.22;
  }

  private updateCamera(list: ViewFighter[], dt: number) {
    const cam = this.cameras.main;
    const vw = this.scale.width;
    const vh = this.scale.height;
    const alive = list.length ? list : [];
    let minX = this.arenaW / 2;
    let maxX = this.arenaW / 2;
    let minY = this.floor;
    let maxY = this.floor;
    if (alive.length) {
      minX = Math.min(...alive.map((f) => f.x));
      maxX = Math.max(...alive.map((f) => f.x));
      minY = Math.min(...alive.map((f) => f.y));
      maxY = Math.max(...alive.map((f) => f.y));
    }
    // how much world fits: about 340-520 units of height, zoomed out to keep both fighters in view
    const wantH = Phaser.Math.Clamp(vh * 0.62, 330, 520);
    let zoom = vh / wantH;
    zoom = Math.min(zoom, vw / (maxX - minX + 300), vh / (maxY - minY + 260));
    zoom = Math.max(zoom, vw / (this.arenaW + 240));
    const cx = (minX + maxX) / 2;
    const cy = Math.min(this.floor - (vh / zoom) * 0.36, (minY + maxY) / 2 - 40);
    const k = 1 - Math.exp(-dt * 6);
    this.camZoom += (zoom - this.camZoom) * k;
    this.camX += (cx - this.camX) * k;
    this.camY += (cy - this.camY) * k;
    const halfW = vw / this.camZoom / 2;
    const halfH = vh / this.camZoom / 2;
    const x = Phaser.Math.Clamp(this.camX, halfW - 120, this.arenaW + 120 - halfW);
    const y = Math.min(this.camY, this.floor + 70 - halfH);
    let sx = 0;
    let sy = 0;
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      sx = (Math.random() * 2 - 1) * this.shakeAmp;
      sy = (Math.random() * 2 - 1) * this.shakeAmp;
      this.shakeAmp *= 0.86;
    }
    cam.setZoom(this.camZoom);
    cam.centerOn(halfW * 2 > this.arenaW + 240 ? this.arenaW / 2 : x + sx, y + sy);
    const me = list.find((f) => f.self);
    if (me) sfx.setListener(me.x, me.y);
  }

  private teardown() {
    for (const [id, fv] of this.views) this.removeView(id, fv);
    for (const f of this.fx) f.destroy();
    this.fx = [];
    for (const pv of this.projViews.values()) (pv.img?.destroy(), pv.fx?.destroy());
    this.projViews.clear();
  }
}

/** The rig's own floor offsets are left to the simulation (it already moves the fighter). */
function stripXY(p: Pose): Pose {
  if (p.x === undefined && p.y === undefined) return p;
  const { x: _x, y: _y, ...rest } = p;
  void _x;
  void _y;
  return rest;
}
