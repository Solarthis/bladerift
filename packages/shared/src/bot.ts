/**
 * Duel bot. Each tick it reads the World and returns one InputCmd. It keeps its weapon's spacing (on hard, just outside
 * reach), swings when it can connect, punishes the opponent's recovery, stun and drinking, answers swings and shots (a
 * roll, or the shield raised in time to parry), drinks its flask when safe, aims its skill, and climbs or drops through
 * ledges to follow. Difficulty changes reaction time, how often it commits and how exact its timing is (see TUNE).
 * Everything comes from its seeded Rng, so a seed always plays the same match.
 */
import { DT, FIGHTER } from './constants';
import { ArtId, classOf, RIFT } from './classes';
import { solidAt, surfaceBelow } from './arena';
import { Act, currentMove, FLASH } from './fighter';
import { Btn, InputCmd } from './input';
import { Rng } from './math';
import { Box, dodgeOf, Loadout, Move, SKILL_FX, SKILLS, WEAPONS, WeaponId } from './weapons';
import { HEROES, HERO_COUNT, sanitizeLoadout } from './heroes';
import { bodyBox, Fighter, moveBox, Projectile, ProjKind, World } from './world';

export type BotDifficulty = 'easy' | 'normal' | 'hard';

interface Tune {
  /** Ticks from noticing a swing or shot to answering it. */
  react: number;
  /** Chance to answer a given swing or shot at all. */
  dodge: number;
  /** Of the answers to a swing, chance to raise the shield instead of rolling (when it can parry). */
  parry: number;
  /** Chance a roll goes through the opponent rather than away from them. */
  through: number;
  /** Per-tick chance to swing when in reach. */
  attack: number;
  /** Per-tick chance to take a punish: a swing into recovery, a stun, a drink. */
  punish: number;
  /** Chance to continue a combo into its next hit. */
  chain: number;
  /** Per-tick chance to start a lunge or bow draw while its window is open. */
  ranged: number;
  /** Per-tick chance to fire a skill whose conditions hold. */
  skill: number;
  /** Per-tick chance to drink when safe, and the health fraction under which it considers it. */
  heal: number;
  healBelow: number;
  /** Ticks standing still in reach before each swing (a visible wind-up). */
  windup: number;
  /** Spacing: wanted gap = reach * spaceMul + HALF + spaceAdd. */
  spaceMul: number;
  spaceAdd: number;
  /** Chance to back off when too close. */
  retreat: number;
  /** Per-tick chance to jump toward an opponent on a higher ledge, or to drop toward one below. */
  climb: number;
  drop: number;
  /** Per-tick chance to hop in from just outside reach and swing from the air. */
  hop: number;
  /** Per-tick chance to air-dash in toward a grounded opponent just out of reach, and to jump off a wall we are pinned to. */
  dash: number;
  wall: number;
  /** Ticks a movement choice is kept before it may change (plus a random extra of up to as much again). */
  commit: number;
}

const TUNE: Record<BotDifficulty, Tune> = {
  easy: {
    react: 24, dodge: 0.2, parry: 0, through: 0.2, attack: 0.3, punish: 0.45, chain: 0.3, ranged: 0.12, skill: 0.01,
    heal: 0.25, healBelow: 0.4, windup: 14, spaceMul: 0.5, spaceAdd: 0, retreat: 0.3, climb: 0.02, drop: 0.02, hop: 0.01, dash: 0.05, wall: 0.2, commit: 26,
  },
  normal: {
    react: 12, dodge: 0.55, parry: 0.35, through: 0.5, attack: 0.45, punish: 0.85, chain: 0.7, ranged: 0.35, skill: 0.04,
    heal: 0.5, healBelow: 0.45, windup: 3, spaceMul: 0.85, spaceAdd: 0, retreat: 0.5, climb: 0.05, drop: 0.05, hop: 0.03, dash: 0.25, wall: 0.6, commit: 16,
  },
  hard: {
    react: 5, dodge: 0.92, parry: 0.8, through: 0.85, attack: 0.7, punish: 1, chain: 0.95, ranged: 0.7, skill: 0.12,
    heal: 0.9, healBelow: 0.55, windup: 0, spaceMul: 1, spaceAdd: 4, retreat: 0.7, climb: 0.12, drop: 0.12, hop: 0.06, dash: 0.6, wall: 0.95, commit: 12,
  },
};

type MoveMode = 'in' | 'back' | 'hold' | 'strafe';
/** Melee: spaced for the chosen melee weapon. Range: keeps its distance and draws the bow. */
type Mode = 'melee' | 'range';

/** A melee swing of the opponent that can still reach us. `at` ticks until its hit window opens, `end` until it closes. */
interface Swing {
  seq: number;
  at: number;
  end: number;
  move: Move;
}
/** A projectile of the opponent heading for us: `ticks` until it arrives, `away` the way to step to get clear of a bomb. */
interface Shot {
  id: number;
  kind: ProjKind;
  ticks: number;
  away: number;
}
interface ShotMemory {
  t: number;
  answer: boolean;
  block: boolean;
  through: boolean;
}
interface Plan {
  seq: number;
  at: number;
  block: boolean;
}
interface Geo {
  dist: number;
  dir: number;
  dy: number;
  facing: boolean;
}

const HALF = FIGHTER.w / 2;
const CHEST = FIGHTER.h / 2;

const isBow = (w: WeaponId) => WEAPONS[w].arrowSpeed !== undefined;
const isShield = (w: WeaponId) => WEAPONS[w].block === true;
/** A zoner's kit: its weapon fights from range (bow, staff, gate). */
const isRanged = (load: Loadout) => isBow(load.weapons[0]);
/** Forward reach of a weapon's opening hit, from the feet to the far edge of its box. */
const reachOf = (w: WeaponId) => {
  const m = WEAPONS[w].combo[0];
  return m.box.x + m.box.w;
};
const overlaps = (a: Box, b: Box) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
/** Slot (0 or 1) holding a weapon matching pred, -1 if neither does. */
const slotOf = (load: Loadout, pred: (w: WeaponId) => boolean) => (pred(load.weapons[0]) ? 0 : pred(load.weapons[1]) ? 1 : -1);

export function botLoadout(seed: number): Loadout {
  const rng = new Rng(seed * 2654435761);
  const hero = rng.int(HERO_COUNT);
  // (the hero fixes the whole kit: weapon and special)
  return sanitizeLoadout({ hero });
}

/** The opponent's melee swing that can still reach us, with a margin for steps and lunges. */
function swingAt(me: Fighter, foe: Fighter): Swing | null {
  const o = foe.s;
  // a fighter in the Grim Fog is unseen: its swings give no warning, so the bot cannot dodge or parry them
  if (o.act !== Act.Attack || o.veil > 0) return null;
  const m = currentMove(o, foe.load);
  if (!m || m.arrow) return null;
  const close = m.startup + m.active;
  if (o.actT >= close) return null;
  const pad = HALF + 16 + (m.step ?? 0) * 0.5 + (m.dash ?? 0) * 0.25;
  const hb = moveBox(m, o.x, o.y, o.face);
  if (!overlaps({ x: hb.x - pad, y: hb.y, w: hb.w + 2 * pad, h: hb.h }, bodyBox(me.s.x, me.s.y))) return null;
  return { seq: o.moveSeq, at: Math.max(0, m.startup - o.actT), end: close - o.actT, move: m };
}

/** Where and when a bomb comes down (it is lobbed with the same physics the World uses). */
function bombLanding(w: World, p: Projectile): { x: number; ticks: number } {
  let x = p.x;
  let y = p.y;
  let vy = p.vy;
  for (let t = 1; t < 300; t++) {
    vy += SKILL_FX.bomb.gravity * DT;
    const py = y;
    x += p.vx * DT;
    y += vy * DT;
    if (vy >= 0 && y >= surfaceBelow(w.arena, x, py)) return { x, ticks: t };
  }
  return { x, ticks: 300 };
}

/** The opponent's projectile that reaches us soonest (arrows and frost by flight, bombs by where they land). */
function incomingShot(w: World, me: Fighter, foe: Fighter): Shot | null {
  const s = me.s;
  let best: Shot | null = null;
  for (const p of w.projectiles) {
    if (p.owner !== foe.id) continue;
    let ticks: number;
    let away = 0;
    if (p.kind === 'bomb') {
      const land = bombLanding(w, p);
      if (Math.abs(land.x - s.x) > 110) continue;
      ticks = land.ticks;
      away = s.x >= land.x ? 1 : -1;
    } else {
      if ((p.vx > 0) !== s.x > p.x) continue; // flying away from us
      if (Math.abs(p.y - (s.y - CHEST)) > 42) continue; // passes above or below us
      ticks = Math.max(0, (Math.abs(p.x - s.x) - HALF) / Math.abs(p.vx * DT));
      if (ticks > 60) continue;
    }
    if (!best || ticks < best.ticks) best = { id: p.id, kind: p.kind, ticks, away };
  }
  return best;
}

export class BotBrain {
  private seq = 0;
  private rng: Rng;
  /** Buttons sent last tick: a press is an edge against this, so a held button is never pressed twice. */
  private prev = 0;
  /** A button held on purpose (a shield guard or a charge), what kind it is, and its target. */
  private hold = 0;
  private holdKind: 'none' | 'block' | 'charge' = 'none';
  private holdTarget = 0;
  /** A guard tapped to bash: it is released on the next tick. */
  private bash = false;
  /** A reaction to the opponent's swing that has been decided but not yet carried out. */
  private plan: Plan | null = null;
  /** moveSeq of the last swing this bot has decided about (one decision per swing). */
  private answered = -1;
  private shots = new Map<number, ShotMemory>();
  private mode: Mode = 'melee';
  /** Slot of the weapon the current mode uses. */
  private slot = 0;
  private modeT = 0;
  private moveMode: MoveMode = 'hold';
  private moveT = 0;
  private strafeDir = 1;
  /** Ticks in a row with no movement and no button. */
  private idleT = 0;
  /** Wind-up before a swing: -1 means not yet in reach. */
  private windT = -1;
  private chainSeq = -1;
  /** After laying a trap, back off for a while so the opponent walks onto it. */
  private backT = 0;
  /** Damage dealt by both fighters at the last check, and how long it has been since it changed. */
  private dealtSeen = -1;
  private quietT = 0;
  /** Nothing has landed for a long time (a stand-off): stop guarding shots and close in. */
  private bored = false;
  /** Pushing into something without moving: ticks stuck, the x last seen, and ticks left backing off. */
  private stuckT = 0;
  private lastX = -1e9;
  private unstuckT = 0;
  /** Ticks in a row the Rift gauge has been full without its Art being used. */
  private fullT = 0;

  constructor(readonly id: number, seed: number, readonly level: BotDifficulty = 'normal') {
    this.rng = new Rng(seed);
  }

  think(w: World): InputCmd {
    const cmd: InputCmd = { seq: ++this.seq, moveX: 0, moveY: 0, buttons: 0, viewTick: 0 };
    const me = w.fighters.get(this.id);
    const foe = me ? w.opponent(me) : undefined;
    this.fullT = me && me.s.rift >= RIFT.max ? this.fullT + 1 : 0;
    if (me && foe && w.phase === 'fight' && me.s.lock === 0) {
      this.act(w, me, foe, cmd);
      if (me.s.rift >= RIFT.max && !(this.prev & Btn.Special) && this.wantArt(w, me, foe)) cmd.buttons |= Btn.Special;
    } else this.reset();
    this.idleT = cmd.moveX === 0 && cmd.buttons === 0 ? this.idleT + 1 : 0;
    this.prev = cmd.buttons;
    return cmd;
  }

  /**
   * When to spend a full Rift gauge, per hero's Art. Projectile and ground Arts wait for the right geometry (aligned,
   * facing, grounded opponent); defensive Arts go off on a swing or shot that is about to land. A gauge that has been
   * full for a while (urgent) is spent on looser conditions, so it is never hoarded.
   */
  private wantArt(w: World, me: Fighter, foe: Fighter): boolean {
    const s = me.s;
    const o = foe.s;
    if (o.act === Act.KO || o.invuln > 0) return false;
    if (this.level === 'easy' && this.rng.next() > 0.02) return false;
    const C = classOf(me.load.cls);
    const dx = o.x - s.x;
    const dist = Math.abs(dx);
    const aligned = Math.abs(o.y - s.y) < 40;
    const facing = s.face === (dx >= 0 ? 1 : -1);
    const free = s.act === Act.Free;
    // defensive Arts also cut in during our own swing (an attack can be cancelled into the Art)
    const can = free || s.act === Act.Attack;
    const grounded = o.ground > 0;
    const still = Math.abs(o.vx) < 20 && o.act === Act.Free;
    const urgent = this.fullT > 240;
    const vuln = this.vulnerable(foe);
    const sw = swingAt(me, foe);
    const incoming = sw !== null && sw.at <= 14;
    const shot = incomingShot(w, me, foe);
    const threatened = incoming || (shot !== null && shot.ticks <= 20);
    switch (HEROES[me.load.hero]?.art) {
      case ArtId.FlashStep:
        // a counter: vanish under a swing about to land, break out of a stun, or punish a recovering opponent up close
        return s.act === Act.Stun || (can && sw !== null && sw.at <= 10) || (free && vuln && dist < 200) || (urgent && free && dist < 260);
      case ArtId.Bulwark:
        return (can && threatened) || (free && s.hp < C.hp * 0.4 && o.act === Act.Attack && dist < 200) || (urgent && free && dist < 160);
      case ArtId.PiercingFang: return free && aligned && facing && dist > 90 && dist < 520;
      case ArtId.RadiantCleave: return free && aligned && facing && dist > 110 && dist < 900;
      case ArtId.HailOfArrows: return free && grounded && (vuln || still || urgent);
      case ArtId.ThunderCall: case ArtId.ChainsOfGenesis: return free && grounded;
      case ArtId.VaultOfAges: return free && aligned && facing && dist > 120 && dist < 900;
      case ArtId.PhantomHand: return free && aligned && facing && grounded && dist > 80 && dist < 600;
      case ArtId.Stampede: return free && aligned && facing && dist > 80 && (grounded || urgent);
      case ArtId.NightHunt: return free && grounded && dist > 120 && dist < 520;
      case ArtId.BloodFrenzy: return can && dist < 120;
      case ArtId.GrimFog: return free && dist > 140 && s.veil === 0 && o.act !== Act.Attack;
      // a heal and a damage buff: only when hurt, and not in the middle of an exchange unless badly hurt
      case ArtId.RewrittenFate: return free && s.hp < C.hp * 0.75 && ((dist > 120 && o.act !== Act.Attack) || s.hp < C.hp * 0.4 || (urgent && dist > 120));
      default: return free;
    }
  }

  /** Can the fighter roll now: a ground roll off cooldown, or another air dash this airtime. */
  private canRoll(me: Fighter): boolean {
    return me.s.ground ? me.s.rollCd === 0 : me.s.dash < classOf(me.load.cls).dashes;
  }

  private reset() {
    this.clearHold();
    this.plan = null;
    this.windT = -1;
    this.moveT = 0;
    this.backT = 0;
  }

  private clearHold() {
    this.hold = 0;
    this.holdKind = 'none';
    this.bash = false;
  }

  private act(w: World, me: Fighter, foe: Fighter, cmd: InputCmd) {
    const s = me.s;
    const T = TUNE[this.level];
    const dx = foe.s.x - s.x;
    const g: Geo = { dist: Math.abs(dx), dir: dx >= 0 ? 1 : -1, dy: foe.s.y - s.y, facing: false };
    g.facing = s.face === g.dir;
    const dealt = me.dealt + foe.dealt;
    if (dealt !== this.dealtSeen) {
      this.dealtSeen = dealt;
      this.quietT = 0;
    } else this.quietT++;
    this.bored = this.quietT > 360;
    this.refreshMode(me);
    if (this.holdKind !== 'none' && this.continueHold(w, me, foe, g, cmd)) return;
    if (s.act === Act.Ledge) {
      // hanging from an edge: climb up, or let go when they are below us
      if (g.dy > 60 && this.rng.next() < 0.5) cmd.moveY = 1;
      else if (!(this.prev & Btn.Jump)) cmd.buttons |= Btn.Jump;
      return;
    }
    if (s.act === Act.Attack) {
      this.chain(me, foe, g, cmd, T);
      return;
    }
    // rolling, stunned, healing, casting, or a charge we did not start: nothing to decide
    if (s.act !== Act.Free) return;
    if (this.react(w, me, foe, g, cmd, T)) return;
    if (!s.ground && this.air(w, me, foe, g, cmd, T)) return;
    if (this.heal(w, me, foe, g, cmd, T)) return;
    if (this.skill(w, me, foe, g, cmd, T)) return;
    // while a swing of theirs can reach us, our own swing would only trade: answer it instead
    if (!swingAt(me, foe) && this.attack(me, foe, g, cmd, T)) return;
    this.platforms(w, me, g, cmd, T);
    this.move(w, me, foe, g, cmd, T);
  }

  /** Pick the weapon to space for, every so often: a melee weapon, or the bow. */
  private refreshMode(me: Fighter) {
    if (this.modeT > 0) {
      this.modeT--;
      return;
    }
    this.modeT = 80 + this.rng.int(120);
    const bow = slotOf(me.load, isBow);
    const melee = [0, 1].filter((i) => !isBow(me.load.weapons[i]) && !isShield(me.load.weapons[i]));
    if (bow >= 0 && (melee.length === 0 || (!this.bored && this.rng.next() < 0.35))) {
      this.mode = 'range';
      this.slot = bow;
    } else {
      this.mode = 'melee';
      this.slot = melee.length ? melee[this.rng.int(melee.length)] : 0;
    }
  }

  /** The opponent is open: recovering from a swing, stunned, or drinking. */
  private vulnerable(foe: Fighter): boolean {
    const o = foe.s;
    if (o.act === Act.Stun || o.act === Act.Heal) return true;
    if (o.act === Act.Attack) {
      const m = currentMove(o, foe.load);
      return !!m && o.actT >= m.startup + m.active;
    }
    if (o.act === Act.Skill) return o.actT >= SKILLS[foe.load.skill].startup;
    return false;
  }

  /** Keep a guard or a charge going, or let it go. Returns true when it has decided this tick's command. */
  private continueHold(w: World, me: Fighter, foe: Fighter, g: Geo, cmd: InputCmd): boolean {
    const s = me.s;
    if (this.holdKind === 'block') {
      if (s.act !== Act.Block) {
        this.clearHold();
        return false;
      }
      const shot = incomingShot(w, me, foe);
      const incoming = swingAt(me, foe) !== null || (!this.bored && shot !== null && shot.ticks <= 14);
      const release =
        this.bash ||
        (this.vulnerable(foe) && g.dist <= reachOf(WeaponId.Shield) + HALF + 30 && s.blockT < FIGHTER.parryWindow) ||
        (!incoming && s.blockT >= FIGHTER.parryWindow) ||
        s.blockT > 60;
      if (release) this.clearHold();
      else cmd.buttons |= this.hold;
      return true;
    }
    if (this.holdKind === 'charge') {
      if (s.act !== Act.Charge) {
        this.clearHold();
        return false;
      }
      const c = WEAPONS[me.load.weapons[s.slot]].charged;
      const max = c ? c.max : 0;
      if (s.charge >= this.holdTarget || s.charge >= max - 2 || g.dist < 90) this.clearHold();
      else cmd.buttons |= this.hold;
      return true;
    }
    return false;
  }

  /** Continue a combo: press again in the chain window so the next hit is buffered for when it opens. */
  private chain(me: Fighter, foe: Fighter, g: Geo, cmd: InputCmd, T: Tune) {
    const s = me.s;
    const m = currentMove(s, me.load);
    if (!m || m.arrow || m.plunge || m.dash || this.chainSeq === s.moveSeq) return;
    if (isShield(me.load.weapons[s.slot])) return;
    const chainAt = m.startup + m.active + Math.ceil(m.recovery * 0.35);
    const total = m.startup + m.active + m.recovery;
    // the press is buffered for 10 ticks, so pressing a few ticks before the chain window opens is enough
    if (s.actT < chainAt - 4 || s.actT >= total) return;
    this.chainSeq = s.moveSeq;
    const btn = s.slot === 0 ? Btn.A : Btn.B;
    if (g.dist > reachOf(me.load.weapons[s.slot]) + HALF + 14 || this.rng.next() >= T.chain) return;
    if (!(this.prev & btn)) cmd.buttons |= btn;
  }

  /** Answer the opponent's swings and shots: roll, or raise the shield to parry, on the right frame. */
  private react(w: World, me: Fighter, foe: Fighter, g: Geo, cmd: InputCmd, T: Tune): boolean {
    const s = me.s;
    const shieldSlot = slotOf(me.load, isShield);
    const sw = swingAt(me, foe);
    if (sw && sw.seq !== this.answered) {
      this.answered = sw.seq;
      if (this.rng.next() < T.dodge) {
        const canBlock = shieldSlot >= 0 && !sw.move.breaksGuard;
        this.plan = { seq: sw.seq, at: w.tick + T.react, block: canBlock && this.rng.next() < T.parry };
      }
    }
    if (this.plan) {
      const P = this.plan;
      if (!sw || sw.seq !== P.seq) this.plan = null;
      else if (w.tick < P.at) return true; // reacting: stand still
      else {
        if (!P.block && !this.canRoll(me) && shieldSlot >= 0 && !sw.move.breaksGuard) P.block = true;
        if (P.block) {
          if (!s.ground) this.plan = null;
          else if (sw.at <= 3) {
            this.startBlock(me, cmd, false);
            this.plan = null;
            return true;
          } else return true; // hold ground until the frame is right
        } else if (!this.canRoll(me) || sw.end <= 1) this.plan = null;
        else if (sw.at <= 2) {
          this.roll(me, g, cmd, T);
          this.plan = null;
          return true;
        } else return true; // wait for the roll frame
      }
    }

    for (const id of this.shots.keys()) if (!w.projectiles.some((p) => p.id === id)) this.shots.delete(id);
    const shot = incomingShot(w, me, foe);
    if (!shot || this.bored) return false;
    let m = this.shots.get(shot.id);
    if (!m) {
      // (against a zoner, a melee fighter dodges its shots forward: backing off only gives it the range it wants)
      const rush = isRanged(foe.load) && !isRanged(me.load);
      m = { t: w.tick, answer: this.rng.next() < T.dodge, block: this.rng.next() < T.parry, through: this.rng.next() < T.through || rush };
      this.shots.set(shot.id, m);
    }
    if (!m.answer || w.tick - m.t < T.react) return false;
    if (shot.kind === 'bomb') {
      if (shot.ticks <= 4) return false;
      cmd.moveX = shot.away; // get out from under the blast
      return true;
    }
    if (m.block && shieldSlot >= 0 && s.ground) {
      if (shot.ticks <= 8) {
        this.startBlock(me, cmd, false);
        return true;
      }
      return false; // keep moving; guard only when it is about to land
    }
    if (this.canRoll(me) && shot.ticks <= 10) {
      cmd.moveX = this.dodgeDir(me, g, m.through);
      cmd.buttons |= Btn.Roll;
      return true;
    }
    return false;
  }

  /**
   * In the air: wall-jump off a wall that has us pinned, or that the opponent is above us along, and air-dash in toward
   * a grounded opponent who is just out of reach. (Dodges of swings and shots are in react.)
   */
  private air(w: World, me: Fighter, foe: Fighter, g: Geo, cmd: InputCmd, T: Tune): boolean {
    const s = me.s;
    if (cmd.buttons !== 0 || this.prev & (Btn.Jump | Btn.Roll)) return false;
    if (s.wallSide !== 0 && (s.wall !== 0 || s.wallT > 0) && s.vy > -200) {
      const cornered = s.wallSide < 0 ? s.x < 160 : w.arena.w - s.x < 160;
      const pinned = cornered && g.dir === -s.wallSide;
      if ((pinned || g.dy < -40) && this.rng.next() < T.wall) {
        // kick off the wall, back out over the opponent (the wall jump is the only jump that climbs past a wall)
        cmd.moveX = -s.wallSide;
        cmd.buttons |= Btn.Jump;
        return true;
      }
    }
    const reach = reachOf(me.load.weapons[this.slot]) + HALF;
    if (
      this.canRoll(me) && g.facing && s.vy > 0 && Math.abs(g.dy) < 80 && foe.s.ground > 0 &&
      g.dist > reach + 60 && g.dist < reach + 240 && this.rng.next() < T.dash
    ) {
      cmd.moveX = g.dir;
      cmd.buttons |= Btn.Roll;
      return true;
    }
    return false;
  }

  private roll(me: Fighter, g: Geo, cmd: InputCmd, T: Tune) {
    cmd.moveX = this.dodgeDir(me, g, this.rng.next() < T.through);
    cmd.buttons |= Btn.Roll;
  }

  /**
   * The stick for a dodge. A behind-step (Flash Step, Shadow Sink) lands behind a close foe only with the stick released
   * (fighter.ts: no direction and the opponent close). Other dodges are rolled through the foe, or away from it.
   */
  private dodgeDir(me: Fighter, g: Geo, through: boolean): number {
    const D = dodgeOf(me.load);
    if (D.behind && g.dist < FLASH.behindRange && Math.abs(g.dy) < 90) return 0;
    return through ? g.dir : -g.dir;
  }

  private startBlock(me: Fighter, cmd: InputCmd, bash: boolean) {
    this.hold = slotOf(me.load, isShield) === 0 ? Btn.A : Btn.B;
    this.holdKind = 'block';
    this.bash = bash;
    cmd.buttons |= this.hold;
  }

  private startCharge(btn: number, target: number, cmd: InputCmd) {
    this.hold = btn;
    this.holdKind = 'charge';
    this.holdTarget = target;
    this.bash = false;
    cmd.buttons |= btn;
  }

  /** Drink the flask only when nothing can reach us during the 48 ticks it takes. */
  private heal(w: World, me: Fighter, foe: Fighter, g: Geo, cmd: InputCmd, T: Tune): boolean {
    const s = me.s;
    if (!s.ground || s.flask <= 0 || s.hp > FIGHTER.maxHp * T.healBelow) return false;
    const o = foe.s;
    // (a knocked-down foe lies there for half a second: time to drink)
    const safe = (o.act === Act.Stun && o.stun > 48) || o.act === Act.Down || (g.dist >= 260 && o.act !== Act.Attack && o.act !== Act.Charge);
    if (!safe || incomingShot(w, me, foe) !== null) return false;
    if (this.rng.next() >= T.heal) return false;
    cmd.buttons |= Btn.Heal;
    return true;
  }

  /** The hero's special, where it lands: shots along a level line in range, a roar when the foe is close, a dash in
   * charging distance. */
  private skill(_w: World, me: Fighter, foe: Fighter, g: Geo, cmd: InputCmd, T: Tune): boolean {
    const s = me.s;
    if (s.skillCd > 0) return false;
    const sk = SKILLS[me.load.skill];
    if (!sk || swingAt(me, foe)) return false;
    let ok = false;
    if (sk.kind === 'aura') ok = g.dist <= (sk.radius ?? 90) * 0.9 && Math.abs(g.dy) < 70;
    else if (sk.kind === 'dash') ok = g.dist >= 90 && g.dist <= ((sk.vx ?? 600) * (sk.active ?? 16)) / 60 + 40 && Math.abs(g.dy) < (sk.vy ? 120 : 40);
    else {
      const range = ((sk.speed ?? 900) * (sk.life ?? 60)) / 60;
      ok = g.dist >= 80 && g.dist <= Math.min(range * 0.9, 700) && Math.abs(g.dy) < (sk.gravity ? 90 : 50);
    }
    if (!ok || this.rng.next() >= T.skill * 1.6) return false;
    if (s.face !== g.dir) {
      cmd.moveX = g.dir * 0.5; // turn to aim first
      return true;
    }
    cmd.buttons |= Btn.Skill;
    return true;
  }

  /** Swing, shield-bash, lunge or shoot. Returns true when it has decided this tick's command. */
  private attack(me: Fighter, foe: Fighter, g: Geo, cmd: InputCmd, T: Tune): boolean {
    const s = me.s;
    const o = foe.s;
    const vuln = this.vulnerable(foe);
    // a guard that has only just gone up still parries: do not walk into it
    const guardFresh = o.act === Act.Block && o.blockT < 14 && !vuln && !this.bored;
    const order = [this.slot, 1 - this.slot];
    let inReach = false;
    if (!guardFresh && Math.abs(g.dy) < 50) {
      for (const i of order) {
        const wp = me.load.weapons[i];
        const btn = i === 0 ? Btn.A : Btn.B;
        // a bow fighter (no melee weapon in the kit) snaps off quick shots at close and middle range too
        if (isBow(wp)) {
          if (g.dist < 420 && g.facing && !(this.prev & btn) && this.rng.next() < (vuln ? T.punish : T.attack * 0.6)) {
            cmd.buttons |= btn;
            return true;
          }
          continue;
        }
        if (g.dist > reachOf(wp) + HALF + 2) continue;
        inReach = true;
        if (!g.facing) {
          cmd.moveX = g.dir * 0.4; // turn to face them
          return true;
        }
        if (this.prev & btn) continue;
        // (the kit's B with a shield is the heavy bash: swing it like any weapon)
        const heavyBash = i === 1 && me.load.weapons[0] === me.load.weapons[1];
        if (isShield(wp) && !heavyBash) {
          if (s.ground && (vuln || this.rng.next() < T.attack * 0.5)) {
            this.startBlock(me, cmd, true);
            return true;
          }
          continue;
        }
        if (!vuln && T.windup > 0) {
          if (this.windT < 0) this.windT = T.windup;
          if (this.windT > 0) {
            this.windT--; // telegraph: stand still in reach before the swing
            return true;
          }
        }
        if (this.rng.next() >= (vuln ? T.punish : T.attack)) return false;
        this.windT = -1;
        if (!s.ground && WEAPONS[wp].plunge && g.dy > -10) cmd.moveY = 1; // plunge onto them
        cmd.buttons |= btn;
        return true;
      }
    }
    // lance lunge (hold to charge) or bow draw (hold to draw), out of melee reach
    for (const i of order) {
      const wp = me.load.weapons[i];
      const c = WEAPONS[wp].charged;
      const btn = i === 0 ? Btn.A : Btn.B;
      const bow = isBow(wp);
      if (!c || (!s.ground && !bow) || this.prev & btn) continue;
      const lo = bow ? 260 : 100;
      const hi = bow ? 520 : 230;
      if (g.dist < lo || g.dist > hi || Math.abs(g.dy) > 40 || !g.facing) continue;
      const p = vuln ? 1 : this.mode === 'range' ? T.ranged : T.ranged * 0.3;
      if (this.rng.next() >= p) continue;
      const target = bow ? (this.rng.next() < 0.6 ? 26 + this.rng.int(18) : 3) : 18 + this.rng.int(14);
      this.startCharge(btn, target, cmd);
      return true;
    }
    if (!inReach) this.windT = -1;
    // hop in from just outside reach and swing from the air
    const reach = reachOf(me.load.weapons[this.slot]) + HALF;
    if (
      this.mode === 'melee' && s.ground && !vuln && g.facing && Math.abs(g.dy) < 40 &&
      g.dist > reach + 2 && g.dist < reach + 90 && this.rng.next() < T.hop
    ) {
      cmd.buttons |= Btn.Jump;
      return true;
    }
    return false;
  }

  private platforms(w: World, me: Fighter, g: Geo, cmd: InputCmd, T: Tune) {
    const s = me.s;
    if (cmd.buttons !== 0) return;
    if (s.ground && g.dy < -60 && g.dist < 220 && this.rng.next() < T.climb) {
      cmd.buttons |= Btn.Jump;
      return;
    }
    if (!s.ground && s.jumps > 0 && s.vy > 0 && g.dy < -80 && g.dist < 160 && this.rng.next() < T.climb * 2) {
      cmd.buttons |= Btn.Jump;
      return;
    }
    const ledge = s.ground && s.y < w.arena.floor - 0.5;
    if (ledge && g.dy > 60 && g.dist < 200 && this.rng.next() < T.drop) {
      cmd.moveY = 1; // drop through the platform toward them
      cmd.buttons |= Btn.Jump;
    }
  }

  /** The distance the bot wants between itself and the opponent in its current mode. */
  private gap(me: Fighter, foe: Fighter, T: Tune): number {
    if (this.mode === 'range') return 340;
    // a ready skill is worth a step back to where it lands (not against a zoner: out there is where it wants us)
    if (this.level !== 'easy' && me.s.skillCd === 0 && !isRanged(foe.load)) {
      const sk = SKILLS[me.load.skill];
      if (sk?.kind === 'shot') return 260;
      if (sk?.kind === 'dash') return 170;
    }
    if (me.s.veil > 0 && this.mode === 'melee') return reachOf(me.load.weapons[this.slot]) * 0.7 + HALF;
    return reachOf(me.load.weapons[this.slot]) * T.spaceMul + HALF + T.spaceAdd;
  }

  /** Walk to the wanted gap, hold it, or back off; the choice is kept for a while so the bot does not jitter. */
  private move(w: World, me: Fighter, foe: Fighter, g: Geo, cmd: InputCmd, T: Tune) {
    const s = me.s;
    const o = foe.s;
    if (this.backT > 0) {
      this.backT--;
      cmd.moveX = -g.dir;
      return;
    }
    for (const t of w.traps) {
      // step off an armed trap the opponent set under us
      if (t.owner === foe.id && w.tick >= t.armAt && s.ground && Math.abs(t.x - s.x) < 46) {
        cmd.moveX = s.x >= t.x ? 1 : -1;
        return;
      }
    }
    const vuln = this.vulnerable(foe);
    const idle = this.idleT > 40 || this.bored;
    const lunging = o.act === Act.Charge && g.dist < 280;
    const err = g.dist - this.gap(me, foe, T);
    // pushing at a wall or a block that we cannot get over: back off for a while, and try a jump once
    const moved = Math.abs(s.x - this.lastX) > 0.5;
    this.lastX = s.x;
    if (!moved && this.moveMode === 'in' && !vuln) this.stuckT++;
    else this.stuckT = 0;
    // a jump, then a second one in the air: enough to clear a block about as tall as two jumps
    if (this.stuckT === 12 || this.stuckT === 16) cmd.buttons |= Btn.Jump;
    // a very long stand-off: keep hopping at the obstacle, so a ledge grab or a double jump can get them over it
    if (this.quietT > 900 && this.quietT % 8 === 0 && !vuln) cmd.buttons |= Btn.Jump;
    if (this.stuckT > 20) {
      this.stuckT = 0;
      this.unstuckT = 30;
    }
    let mode = this.moveMode;
    if (this.unstuckT > 0 && !vuln) {
      this.unstuckT--;
      mode = 'back';
    } else if (vuln || idle) mode = 'in';
    else if (lunging) mode = 'back';
    else if (this.moveT <= 0 || (mode === 'in' && err < -20) || (mode === 'back' && err > 20)) {
      this.moveT = T.commit + this.rng.int(T.commit);
      if (err > 14) mode = 'in';
      else if (err < -14) mode = this.rng.next() < T.retreat ? 'back' : 'hold';
      else mode = this.rng.next() < 0.3 ? 'strafe' : 'hold';
      if (mode === 'strafe') this.strafeDir = this.rng.next() < 0.5 ? -1 : 1;
    }
    this.moveT--;
    const backDir = -g.dir;
    if (mode === 'back' && (backDir > 0 ? s.x > w.arena.w - 130 : s.x < 130)) {
      // cornered: jump toward the wall, touch it, then wall-jump back out past the opponent
      if (s.ground && !(this.prev & Btn.Jump) && cmd.buttons === 0 && this.rng.next() < T.wall) {
        this.moveMode = mode;
        cmd.moveX = backDir;
        cmd.buttons |= Btn.Jump;
        return;
      }
      mode = 'hold';
    }
    this.moveMode = mode;
    if (mode === 'in') cmd.moveX = g.dir;
    else if (mode === 'back') cmd.moveX = backDir;
    else if (mode === 'strafe') cmd.moveX = this.strafeDir * 0.35;
    // a solid block in the way on the ground: jump it
    if (cmd.moveX !== 0 && cmd.buttons === 0 && s.ground && solidAt(w.arena, s.x + Math.sign(cmd.moveX) * (HALF + 6), s.y - 12)) {
      if (!(this.prev & Btn.Jump)) cmd.buttons |= Btn.Jump;
    }
  }
}
