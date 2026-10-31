/**
 * Duel bot: keeps its weapon's range, attacks when in reach, rolls or blocks the opponent's swings (with a
 * difficulty-dependent reaction time and success rate), heals when safe, and uses its skill. Deterministic per seed.
 */
import { FIGHTER } from './constants';
import { Act, currentMove, isActive } from './fighter';
import { Btn, InputCmd } from './input';
import { Rng } from './math';
import { Loadout, SkillId, WEAPONS, WeaponId } from './weapons';
import { Fighter, World } from './world';

export type BotDifficulty = 'easy' | 'normal' | 'hard';

const LEVEL = {
  easy: { react: 24, dodge: 0.18, aggro: 0.45, combo: 0.5, skill: 0.004 },
  normal: { react: 13, dodge: 0.45, aggro: 0.7, combo: 0.8, skill: 0.012 },
  hard: { react: 7, dodge: 0.75, aggro: 0.9, combo: 1, skill: 0.025 },
} as const;

/** Reach of a weapon's first combo move (how close the bot wants to be). */
function reach(w: WeaponId) {
  const m = WEAPONS[w].combo[0];
  return m.box.x + m.box.w;
}

export function botLoadout(seed: number): Loadout {
  const rng = new Rng(seed * 2654435761);
  const melee = [WeaponId.Sword, WeaponId.Scythe, WeaponId.Lance, WeaponId.Daggers, WeaponId.Hammer];
  const second = [WeaponId.Bow, WeaponId.Shield, WeaponId.Daggers, WeaponId.Lance];
  const a = melee[rng.int(melee.length)];
  let b = second[rng.int(second.length)];
  if (b === a) b = WeaponId.Bow;
  return { weapons: [a, b], skill: rng.int(4) as SkillId };
}

export class BotBrain {
  private seq = 0;
  private rng: Rng;
  private held = 0;
  private holdT = 0;
  private reactAt = -1;
  private plan: 'none' | 'roll' | 'block' | 'jump' = 'none';
  private lastSeenMove = -1;
  private strafe = 0;
  private strafeT = 0;

  constructor(readonly id: number, seed: number, readonly level: BotDifficulty = 'normal') {
    this.rng = new Rng(seed);
  }

  think(w: World): InputCmd {
    const me = w.fighters.get(this.id);
    const cmd: InputCmd = { seq: ++this.seq, moveX: 0, moveY: 0, buttons: 0, viewTick: 0 };
    if (!me) return cmd;
    const foe = w.opponent(me);
    const L = LEVEL[this.level];
    const s = me.s;
    if (!foe || w.phase !== 'fight' || s.lock > 0) {
      this.held = 0;
      return cmd;
    }
    const o = foe.s;
    const dx = o.x - s.x;
    const dist = Math.abs(dx);
    const dy = o.y - s.y;
    const dir = dx >= 0 ? 1 : -1;
    const shieldSlot = me.load.weapons[1] === WeaponId.Shield ? 1 : me.load.weapons[0] === WeaponId.Shield ? 0 : -1;
    const bowSlot = me.load.weapons[0] === WeaponId.Bow ? 0 : me.load.weapons[1] === WeaponId.Bow ? 1 : -1;
    const meleeSlot = WEAPONS[me.load.weapons[0]].combo[0].arrow || WEAPONS[me.load.weapons[0]].block ? 1 : 0;
    const meleeW = me.load.weapons[meleeSlot];
    const want = WEAPONS[meleeW].block || WEAPONS[meleeW].combo[0].arrow ? 40 : reach(meleeW) * 0.75;

    // --- react to the opponent's swing (after a reaction delay)
    const om = currentMove(o, foe.load);
    if (om && o.act === Act.Attack && o.moveSeq !== this.lastSeenMove) {
      this.lastSeenMove = o.moveSeq;
      const threat = om.arrow ? Math.abs(dy) < 50 : dist < om.box.x + om.box.w + 60;
      if (threat && this.rng.next() < L.dodge) {
        this.reactAt = w.tick + L.react;
        this.plan = shieldSlot >= 0 && !om.breaksGuard && this.rng.next() < 0.6 ? 'block' : om.arrow && this.rng.next() < 0.4 ? 'jump' : 'roll';
      }
    }
    if (this.plan !== 'none' && w.tick >= this.reactAt) {
      const p = this.plan;
      this.plan = 'none';
      if (p === 'roll' && s.rollCd === 0) {
        cmd.moveX = this.rng.next() < 0.6 ? dir : -dir; // through them or away
        cmd.buttons |= Btn.Roll;
        return this.finish(cmd);
      }
      if (p === 'block') {
        this.held = shieldSlot === 0 ? Btn.A : Btn.B;
        this.holdT = 30;
      }
      if (p === 'jump') cmd.buttons |= Btn.Jump;
    }

    // --- keep holding (block / bow draw / lance charge)
    if (this.held && this.holdT > 0) {
      this.holdT--;
      cmd.buttons |= this.held;
      if (Math.abs(dx) > 6) cmd.moveX = dir * 0.01; // face them
      if (this.holdT === 0) this.held = 0;
      return this.finish(cmd);
    }

    // --- heal when safe
    if (s.hp < FIGHTER.maxHp * 0.42 && s.flask > 0 && dist > 260 && s.ground && this.rng.next() < 0.08) {
      cmd.buttons |= Btn.Heal;
      return this.finish(cmd);
    }

    // --- skill
    if (s.skillCd === 0 && this.rng.next() < L.skill * 3) {
      const sk = me.load.skill;
      const ok =
        (sk === SkillId.Bomb && dist > 150 && dist < 420) ||
        (sk === SkillId.Frost && Math.abs(dy) < 40 && dist > 120) ||
        (sk === SkillId.Trap && dist < 140) ||
        (sk === SkillId.Blink && dist > 260);
      if (ok) {
        cmd.moveX = dir * 0.5;
        cmd.buttons |= Btn.Skill;
        return this.finish(cmd);
      }
    }

    // --- ranged poke from afar
    if (bowSlot >= 0 && dist > 260 && Math.abs(dy) < 60 && s.act === Act.Free && this.rng.next() < L.aggro * 0.05) {
      this.held = bowSlot === 0 ? Btn.A : Btn.B;
      this.holdT = this.rng.next() < 0.5 ? 4 : 30;
      cmd.moveX = dir * 0.01;
      cmd.buttons |= this.held;
      return this.finish(cmd);
    }

    // --- movement: get to range (strafe a little when there)
    if (--this.strafeT <= 0) {
      this.strafeT = 20 + this.rng.int(40);
      this.strafe = this.rng.next() < 0.35 ? (this.rng.next() < 0.5 ? -1 : 1) : 0;
    }
    if (dist > want + 10) cmd.moveX = dir;
    else if (dist < want * 0.5) cmd.moveX = -dir * 0.6;
    else cmd.moveX = this.strafe * 0.4;
    // follow them up / down platforms
    if (dy < -60 && dist < 200 && s.ground && this.rng.next() < 0.06) cmd.buttons |= Btn.Jump;
    if (dy > 60 && s.ground && dist < 160 && this.rng.next() < 0.05) {
      cmd.moveY = 1;
      cmd.buttons |= Btn.Jump;
    }

    // --- attack when in reach
    const inReach = dist < reach(meleeW) + 8 && Math.abs(dy) < 50;
    if (inReach && o.act !== Act.KO && o.invuln === 0) {
      const facing = (dx > 0) === (s.face > 0);
      if (!facing) cmd.moveX = dir * 0.4;
      else if (this.rng.next() < L.aggro * 0.35 || (s.act === Act.Attack && this.rng.next() < L.combo * 0.5)) {
        const btn = meleeSlot === 0 ? Btn.A : Btn.B;
        // a lance charges sometimes
        if (WEAPONS[meleeW].charged && !WEAPONS[meleeW].arrowSpeed && this.rng.next() < 0.25 && dist > 90) {
          this.held = btn;
          this.holdT = 24;
        }
        if (!(this.prev & btn)) cmd.buttons |= btn;
      }
    }
    void isActive;
    return this.finish(cmd);
  }

  private prev = 0;
  private finish(cmd: InputCmd) {
    this.prev = cmd.buttons;
    return cmd;
  }

  /** The bot's view of its own fighter (unused fields kept for tests). */
  static seat(f: Fighter) {
    return f.seat;
  }
}
