import { ARTS, classOf, GameEvent, heroOf, RIFT, RosterEntry, SKILLS, WEAPONS } from '@bladerift/shared';
import type { NetGame, ViewFighter } from '../net/NetGame';
import { colorOf, css } from './colors';
import { artIconOf, skillIcon, weaponIcon } from './icons';

const asset = (n: string) => `assets/art/${n}.jpg`;
/** Hero portraits are h-00..h-13, and HeroDef.portrait is the index. */
const portraitOf = (n: number) => asset(`h-${String(n).padStart(2, '0')}`);

/** Status chips, in display order, keyed by their ViewFighter flag. */
const CHIPS = [
  { k: 'burning', label: 'BURN' },
  { k: 'slowed', label: 'SLOW' },
  { k: 'rooted', label: 'ROOT' },
  { k: 'buff', label: 'EMPOWERED' },
  { k: 'frenzy', label: 'FRENZY' },
] as const;

/** Hits in a row that earn the combo counter, and the pause that ends a chain. */
const COMBO_MIN = 3;
const COMBO_GAP_MS = 1800;
/** Intro seconds left: the VS card first, then ROUND N, then READY. */
const INTRO_VS = 1.4;
const INTRO_ROUND = 0.5;
/** The intro counts down in simulation ticks. */
const TICK_RATE = 60;

interface Combo {
  n: number;
  t: number;
}

interface Side {
  root: HTMLElement;
  name: HTMLElement;
  heroName: HTMLElement;
  epithet: HTMLElement;
  portrait: HTMLImageElement;
  bar: HTMLElement;
  trail: HTMLElement;
  hpText: HTMLElement;
  pips: HTMLElement;
  gear: HTMLElement;
  rift: HTMLElement;
  riftWrap: HTMLElement;
  riftPct: HTMLElement;
  artWrap: HTMLElement;
  artIcon: HTMLImageElement;
  chips: HTMLElement[];
  combo: HTMLElement;
  trailHp: number;
  key: string;
}

interface VsSide {
  root: HTMLElement;
  name: HTMLElement;
}

const setText = (el: HTMLElement, text: string) => {
  if (el.textContent !== text) el.textContent = text;
};

/** The in-match overlay: both fighters along the top band, round wins, the clock, the status and the banners. */
export class Hud {
  readonly root: HTMLElement;
  private sides: [Side, Side];
  private mid: HTMLElement;
  private clock: HTMLElement;
  private round: HTMLElement;
  private banner: HTMLElement;
  private vs: HTMLElement;
  private vsSides: [VsSide, VsSide];
  private vsKey = '';
  private net: HTMLElement;
  private bannerUntil = 0;
  private combo: [Combo, Combo] = [
    { n: 0, t: 0 },
    { n: 0, t: 0 },
  ];
  onMenu: (() => void) | null = null;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'hud';
    const side = (cls: string) => `<div class="hp-side ${cls}">
      <div class="hp-top">
        <span class="hp-portrait"><img alt=""></span>
        <div class="hp-id"><b class="hp-name"></b><small class="hp-hero"><span></span><i></i></small></div>
        <span class="hp-pips"></span>
      </div>
      <div class="hp-bar"><div class="hp-trail"></div><div class="hp-fill"></div><span class="hp-num"></span></div>
      <div class="rift-row">
        <span class="rift-art"><img alt=""></span>
        <div class="rift"><div class="rift-fill"></div><span class="rift-pct"></span></div>
        <div class="hp-gear"></div>
      </div>
      <div class="hp-status">${CHIPS.map((c) => `<i class="chip chip-${c.k}">${c.label}</i>`).join('')}<b class="hp-combo"></b></div>
    </div>`;
    const vsSide = (cls: string) => `<div class="hud-vs-side ${cls}"><b class="hud-vs-name"></b></div>`;
    this.root.innerHTML = `${side('left')}<div class="hud-mid"><div class="hud-round"></div><div class="hud-clock">90</div></div>${side('right')}
      <div class="hud-vs">${vsSide('l')}<span class="hud-vs-x">VS</span>${vsSide('r')}</div>
      <button class="hud-menu" aria-label="Menu">II</button>
      <div class="hud-banner"></div><div class="hud-net"></div>`;
    parent.appendChild(this.root);

    const mk = (el: HTMLElement): Side => {
      const q = <T extends Element = HTMLElement>(sel: string) => el.querySelector<T>(sel)!;
      return {
        root: el,
        name: q('.hp-name'),
        heroName: q('.hp-hero span'),
        epithet: q('.hp-hero i'),
        portrait: q<HTMLImageElement>('.hp-portrait img'),
        bar: q('.hp-fill'),
        trail: q('.hp-trail'),
        hpText: q('.hp-num'),
        pips: q('.hp-pips'),
        gear: q('.hp-gear'),
        rift: q('.rift-fill'),
        riftWrap: q('.rift'),
        riftPct: q('.rift-pct'),
        artWrap: q('.rift-art'),
        artIcon: q<HTMLImageElement>('.rift-art img'),
        chips: Array.from(el.querySelectorAll<HTMLElement>('.chip')),
        combo: q('.hp-combo'),
        trailHp: 1000,
        key: '',
      };
    };
    const els = this.root.querySelectorAll<HTMLElement>('.hp-side');
    this.sides = [mk(els[0]), mk(els[1])];
    const vsEls = this.root.querySelectorAll<HTMLElement>('.hud-vs-side');
    const vs = (el: HTMLElement): VsSide => ({ root: el, name: el.querySelector<HTMLElement>('.hud-vs-name')! });
    this.vsSides = [vs(vsEls[0]), vs(vsEls[1])];
    this.vs = this.root.querySelector('.hud-vs')!;
    this.mid = this.root.querySelector('.hud-mid')!;
    this.clock = this.root.querySelector('.hud-clock')!;
    this.round = this.root.querySelector('.hud-round')!;
    this.banner = this.root.querySelector('.hud-banner')!;
    this.net = this.root.querySelector('.hud-net')!;
    this.root.querySelector('.hud-menu')!.addEventListener('click', () => this.onMenu?.());
  }

  update(g: NetGame, roster: Map<number, RosterEntry>, rtt: number, dt: number) {
    const now = performance.now();
    const fighters = g.fighters(now);
    for (const seat of [0, 1] as const) {
      const s = this.sides[seat];
      const f = fighters.find((x) => x.seat === seat);
      const r = f ? roster.get(f.id) : undefined;
      const key = `${f?.id}|${f?.hero}|${r?.name}|${r?.color}|${f?.weapons}|${f?.skill}|${g.wins[seat]}|${g.settings.wins}`;
      if (key !== s.key) {
        s.key = key;
        s.name.textContent = r?.name ?? '—';
        s.root.style.setProperty('--c', css(colorOf(r?.color ?? seat * 5)));
        s.pips.innerHTML = Array.from({ length: g.settings.wins }, (_, i) => `<i class="${i < g.wins[seat] ? 'won' : ''}"></i>`).join('');
        if (f) {
          const h = heroOf(f.hero);
          s.root.style.setProperty('--ac', css(h.accent));
          s.portrait.src = portraitOf(h.portrait);
          s.heroName.textContent = h.name;
          s.epithet.textContent = h.epithet;
          s.artIcon.src = artIconOf(h.art);
          s.artWrap.title = ARTS[h.art]?.name ?? 'Rift Art';
          s.gear.innerHTML = `<img src="${weaponIcon(f.weapons[0])}" title="${WEAPONS[f.weapons[0]]?.name}"><img src="${weaponIcon(f.weapons[1])}" title="${WEAPONS[f.weapons[1]]?.name}"><img src="${skillIcon(f.skill)}" title="${SKILLS[f.skill]?.name}">`;
        } else {
          s.heroName.textContent = '';
          s.epithet.textContent = '';
          s.gear.innerHTML = '';
        }
      }
      const hp = f ? Math.max(0, f.hp) : 0;
      const max = f ? classOf(f.cls).hp : 1000;
      // the red trail catches up a moment after a hit
      if (s.trailHp < hp) s.trailHp = hp;
      else s.trailHp = Math.max(hp, s.trailHp - max * 0.5 * dt);
      s.bar.style.width = (hp / max) * 100 + '%';
      s.trail.style.width = (s.trailHp / max) * 100 + '%';
      setText(s.hpText, String(Math.ceil(hp)));
      s.root.classList.toggle('low', hp < max * 0.25);

      const rift = f ? Math.min(1, f.rift / RIFT.max) : 0;
      const ready = rift >= 1;
      s.rift.style.width = rift * 100 + '%';
      s.riftWrap.classList.toggle('ready', ready);
      s.artWrap.classList.toggle('ready', ready);
      setText(s.riftPct, ready ? 'ART READY' : `${Math.floor(rift * 100)}%`);

      s.chips.forEach((el, i) => el.classList.toggle('on', !!f && !!f[CHIPS[i].k]));

      const c = this.combo[seat];
      if (c.n && now - c.t > COMBO_GAP_MS) c.n = 0;
      s.combo.classList.toggle('on', c.n >= COMBO_MIN);
    }

    const t = Math.ceil(g.timeLeft);
    setText(this.clock, String(t));
    this.clock.classList.toggle('hurry', g.phase === 'fight' && t <= 10);
    const roundText = `ROUND ${g.round}`;
    setText(this.round, roundText);

    // round intro: both heroes in the top band, then the round number, then READY
    const intro = g.phase === 'intro';
    const left = g.phaseLeft / TICK_RATE;
    // (the menus' portrait VS splash plays at the start of a match; the band card only between rounds)
    const vsOn = intro && left > INTRO_VS && g.round > 1;
    this.vs.classList.toggle('on', vsOn);
    this.mid.classList.toggle('away', vsOn);
    if (vsOn) this.fillVs(fighters);
    if (intro && !vsOn) {
      const round = left > INTRO_ROUND;
      this.showBanner(round ? roundText : 'READY', 300, round ? '' : 'ready');
    }
    if (now > this.bannerUntil) this.banner.classList.remove('on');

    const ping = Math.round(rtt);
    const netText = g.local ? '' : `${ping} ms`;
    setText(this.net, netText);
  }

  onEvent(e: GameEvent, roster: Map<number, RosterEntry>, g: NetGame) {
    switch (e.t) {
      case 'fight':
        this.resetCombos();
        this.showBanner('FIGHT!', 900, 'fight', undefined, true);
        break;
      case 'round':
        this.resetCombos();
        this.showBanner(e.why === 1 ? 'TIME!' : 'K.O.', 1600, 'ko', undefined, true);
        break;
      case 'hit':
        this.countHit(e, g);
        break;
      case 'art': {
        const f = g.fighters().find((x) => x.id === e.p);
        const accent = f ? heroOf(f.hero).accent : undefined;
        this.showBanner(ARTS[e.art]?.name.toUpperCase() ?? 'RIFT ART', 1100, 'art', accent, true);
        break;
      }
      case 'match': {
        const f = g.fighters().find((x) => x.seat === e.winner);
        const name = f ? roster.get(f.id)?.name : '';
        this.showBanner(`${(name ?? 'Winner').toUpperCase()} WINS`, 4000, 'win', undefined, true);
        break;
      }
    }
  }

  /** Hits in a row for the attacker; a hit on a fighter breaks that fighter's chain. */
  private countHit(e: Extract<GameEvent, { t: 'hit' }>, g: NetGame) {
    const fs = g.fighters();
    const att = fs.find((x) => x.id === e.a);
    const vic = fs.find((x) => x.id === e.v);
    if (vic) this.combo[vic.seat as 0 | 1] = { n: 0, t: 0 };
    if (!att || !vic || att.id === vic.id) return;
    const now = performance.now();
    const c = this.combo[att.seat as 0 | 1];
    c.n = now - c.t < COMBO_GAP_MS ? c.n + 1 : 1;
    c.t = now;
    if (c.n >= COMBO_MIN) this.popCombo(att.seat as 0 | 1, c.n);
  }

  private popCombo(seat: 0 | 1, n: number) {
    const el = this.sides[seat].combo;
    setText(el, `${n} HIT COMBO`);
    el.classList.remove('pop');
    el.classList.add('on');
    void el.offsetWidth; // restart the pop
    el.classList.add('pop');
  }

  private resetCombos() {
    this.combo = [
      { n: 0, t: 0 },
      { n: 0, t: 0 },
    ];
  }

  private fillVs(fighters: ViewFighter[]) {
    const seats = [0, 1] as const;
    const key = seats.map((seat) => fighters.find((x) => x.seat === seat)?.hero ?? -1).join(',');
    if (key === this.vsKey) return;
    this.vsKey = key;
    for (const seat of seats) {
      const v = this.vsSides[seat];
      const f = fighters.find((x) => x.seat === seat);
      if (!f) {
        v.name.textContent = '—';
        continue;
      }
      const h = heroOf(f.hero);
      v.name.textContent = h.name;
      v.root.style.setProperty('--ac', css(h.accent));
    }
  }

  private showBanner(text: string, ms: number, cls: string, accent?: number, fresh = false) {
    const b = this.banner;
    if (accent === undefined) b.style.removeProperty('--ac');
    else b.style.setProperty('--ac', css(accent));
    const className = `hud-banner on ${cls}`;
    if (fresh || b.textContent !== text || b.className !== className) {
      // off, then on again in the same frame: the pop animation restarts
      b.className = 'hud-banner';
      b.textContent = text;
      void b.offsetWidth;
      b.className = className;
    }
    this.bannerUntil = performance.now() + ms;
  }

  destroy() {
    this.root.remove();
  }
}
