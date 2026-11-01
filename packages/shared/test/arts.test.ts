import { describe, expect, it } from 'vitest';
import { Act, ArtId, Btn, CLASSES, ClassId, FIGHTER, HEROES, heroWeapon, InputCmd, Loadout, RIFT, ROUND, sanitizeLoadout, SkillId, World, WeaponId } from '../src/index';

/** Every Rift Art starts with the superpause: its timeline runs after it. */
const SP = FIGHTER.superpause;

/** The hero whose Art is the class's own (Sable for the assassin's Flash Step, Leon for Saber...). */
const heroFor = (cls: ClassId) => HEROES.find((h) => h.cls === cls && h.art === CLASSES[cls].art)!.id;
const loadFor = (cls: ClassId, b = WeaponId.Bow): Loadout => sanitizeLoadout({ weapons: [0, b], skill: SkillId.LionsRoar, hero: heroFor(cls) });
const cmd = (seq: number, moveX = 0, buttons = 0): InputCmd => ({ seq, moveX, moveY: 0, buttons, viewTick: 0 });

/** A live duel, fighters `gap` apart, A of class `a`, B of class `b`, A's gauge full. */
function duel(a: ClassId, b: ClassId = ClassId.Saber, gap = 60) {
  const w = new World({ arenaId: 'bridge', wins: 2, roundTime: 90 });
  const fa = w.addFighter(1, 0, 'A', loadFor(a));
  const fb = w.addFighter(2, 1, 'B', loadFor(b, WeaponId.Shield));
  w.start();
  for (let i = 0; i < ROUND.introTicks + 1; i++) w.step();
  fa.s.x = 600;
  fb.s.x = 600 + gap;
  fa.s.face = 1;
  fb.s.face = -1;
  fa.s.rift = RIFT.max;
  return { w, fa, fb };
}

function run(w: World, n: number, a: (i: number) => InputCmd, b: (i: number) => InputCmd = (i) => cmd(i)) {
  const fa = w.fighters.get(1)!;
  const fb = w.fighters.get(2)!;
  // the callbacks get the loop index; sequence numbers are filled in here
  for (let i = 0; i < n; i++) {
    fa.inputs.push({ ...a(i + 1), seq: fa.lastSeq + 1 });
    fb.inputs.push({ ...b(i + 1), seq: fb.lastSeq + 1 });
    w.step();
  }
}

describe('classes', () => {
  it("slot A is always the hero's own weapon; health and speed follow the class", () => {
    for (const h of HEROES) {
      const l = sanitizeLoadout({ weapons: [WeaponId.Hammer, WeaponId.Hammer], skill: 0, hero: h.id });
      expect(l.weapons[0]).toBe(heroWeapon(h.id));
      expect(l.weapons[1]).toBe(heroWeapon(h.id)); // the kit: one weapon, A light and B heavy
    }
    // as in their legends: no bow for Gilgamesh, surgical knives for Jack, a kopis for Alexander, living chains for Enkidu,
    // a quill for Dumas, twin blades for the Hashashin
    expect([heroWeapon(2), heroWeapon(10), heroWeapon(11), heroWeapon(4), heroWeapon(6), heroWeapon(8)]).toEqual([
      WeaponId.Gate, WeaponId.Knives, WeaponId.Kopis, WeaponId.Chains, WeaponId.Quill, WeaponId.TwinBlades,
    ]);
    // no two heroes who share a class fight with the same moves
    const byClass = new Map<number, Set<number>>();
    for (const h of HEROES) (byClass.get(h.cls) ?? byClass.set(h.cls, new Set()).get(h.cls)!).add(heroWeapon(h.id));
    for (const h of HEROES) expect(byClass.get(h.cls)!.size, h.name).toBe(HEROES.filter((x) => x.cls === h.cls).length);
    const { fa, fb } = duel(ClassId.Assassin, ClassId.Berserker);
    expect(fa.s.hp).toBe(CLASSES[ClassId.Assassin].hp);
    expect(fb.s.hp).toBe(CLASSES[ClassId.Berserker].hp);
  });

  it('the assassin outruns the berserker and has a triple jump', () => {
    const { w, fa, fb } = duel(ClassId.Assassin, ClassId.Berserker, 300);
    fb.s.face = 1;
    const a0 = fa.s.x;
    const b0 = fb.s.x;
    run(w, 30, (i) => cmd(i, 1), (i) => cmd(i, 1));
    // (Humbaba is a quick beast for a Berserker: HERO_TUNE speed)
    expect(fa.s.x - a0).toBeGreaterThan((fb.s.x - b0) * 1.1);
    expect(CLASSES[ClassId.Assassin].airJumps).toBe(2);
  });

  it('the Rift gauge fills over time and from hits', () => {
    const { w, fa, fb } = duel(ClassId.Saber, ClassId.Saber, 40);
    fa.s.rift = 0;
    fb.s.rift = 0;
    run(w, 60, (i) => cmd(i));
    expect(fa.s.rift).toBeGreaterThan(5);
    const before = fa.s.rift;
    run(w, 20, (i) => cmd(i, 0, i === 1 ? Btn.A : 0));
    expect(fa.s.rift - before).toBeGreaterThan(12);
    expect(fb.s.rift).toBeGreaterThan(fa.s.rift * 0.5);
  });
});

describe('Rift Arts', () => {
  it('Flash Step: untouchable, reappears behind the opponent and lands a flurry', () => {
    const { w, fa, fb } = duel(ClassId.Assassin, ClassId.Saber, 160);
    const hp = fb.s.hp;
    run(w, 1, (i) => cmd(i, 0, Btn.Special));
    expect(fa.s.act).toBe(Act.Art);
    expect(fa.s.invuln).toBeGreaterThan(40);
    expect(fa.s.rift).toBe(0);
    run(w, 10 + SP, (i) => cmd(i));
    // now behind B (B faces left, so behind is to its right)
    expect(fa.s.x).toBeGreaterThan(fb.s.x);
    run(w, 45, (i) => cmd(i));
    // five cuts and a finisher (15 / 32 x the assassin's backstab 1.9, x its damage 0.86: 177)
    expect(hp - fb.s.hp).toBeGreaterThan(150);
  });

  it('Flash Step breaks out of hit-stun (a counter)', () => {
    const { w, fa } = duel(ClassId.Assassin);
    fa.s.act = Act.Stun;
    fa.s.stun = 40;
    run(w, 1, (i) => cmd(i, 0, Btn.Special));
    expect(fa.s.act).toBe(Act.Art);
  });

  it('nothing happens without a full gauge', () => {
    const { w, fa } = duel(ClassId.Assassin);
    fa.s.rift = RIFT.max - 200;
    run(w, 1, (i) => cmd(i, 0, Btn.Special));
    expect(fa.s.act).not.toBe(Act.Art);
  });

  it('Piercing Fang lunges across the arena, breaks a guard and cannot be staggered', () => {
    const { w, fa, fb } = duel(ClassId.Lancer, ClassId.Shielder, 340);
    const hp = fb.s.hp;
    run(w, 40 + SP, (i) => cmd(i, 0, i === 1 ? Btn.Special : 0), (i) => cmd(i, 0, Btn.B));
    expect(hp - fb.s.hp).toBeGreaterThan(150);
  });

  it('Radiant Cleave sends a wave that hits at range', () => {
    const { w, fb } = duel(ClassId.Saber, ClassId.Archer, 500);
    const hp = fb.s.hp;
    run(w, 80 + SP, (i) => cmd(i, 0, i === 1 ? Btn.Special : 0));
    expect(hp - fb.s.hp).toBeGreaterThan(150);
  });

  it('Thunder Call strikes where the opponent stands', () => {
    const { w, fb } = duel(ClassId.Caster, ClassId.Saber, 300);
    const hp = fb.s.hp;
    run(w, 120, (i) => cmd(i, 0, i === 1 ? Btn.Special : 0));
    expect(hp - fb.s.hp).toBeGreaterThan(90);
  });

  it('Hail of Arrows rains around the opponent', () => {
    const { w, fb } = duel(ClassId.Archer, ClassId.Saber, 400);
    const hp = fb.s.hp;
    run(w, 100, (i) => cmd(i, 0, i === 1 ? Btn.Special : 0));
    expect(hp - fb.s.hp).toBeGreaterThan(60);
  });

  it('Blood Frenzy: hits land but do not stagger the berserker', () => {
    const { w, fa } = duel(ClassId.Berserker, ClassId.Saber, 40);
    run(w, 30 + SP, (i) => cmd(i, 0, i === 1 ? Btn.Special : 0));
    expect(fa.s.frenzy).toBeGreaterThan(300);
    // (the roar knocked the saber down and away: let it get up, then bring it back in reach)
    run(w, 70, (i) => cmd(i));
    const fb = w.fighters.get(2)!;
    expect(fb.s.act).toBe(Act.Free);
    fb.s.x = fa.s.x + 40;
    fb.s.act = Act.Free;
    fb.s.stun = 0;
    const hp = fa.s.hp;
    run(w, 30, (i) => cmd(i), (i) => cmd(i, 0, i % 3 === 1 ? Btn.A : 0));
    expect(fa.s.hp).toBeLessThan(hp);
    expect(fa.s.act).not.toBe(Act.Stun);
  });

  it('Bulwark: untouchable, reflects arrows back at the archer', () => {
    const { w, fa, fb } = duel(ClassId.Shielder, ClassId.Archer, 300);
    const hp = fa.s.hp;
    const hpB = fb.s.hp;
    run(w, 90, (i) => cmd(i, 0, i === 1 ? Btn.Special : 0), (i) => cmd(i, 0, i % 20 === 5 ? Btn.A : 0));
    expect(fa.s.hp).toBe(hp);
    expect(fb.s.hp).toBeLessThan(hpB);
    void ArtId;
  });
});
