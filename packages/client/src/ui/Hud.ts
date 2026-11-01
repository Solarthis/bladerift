import { ARTS, classOf, FIGHTER, GameEvent, hasCrescent, heroOf, isRanged, RIFT, RosterEntry, SKILLS, WEAPONS } from '@bladerift/shared';
import type { NetGame, ViewFighter } from '../net/NetGame';
import { colorOf, css } from './colors';
import { artIconOf, skillIcon, weaponIcon } from './icons';
import { preloadCinematic } from '../game/cinematic';
import { quotesOf } from './quotes';

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

/** Hits in a row that earn the big combo counter, the pause that ends a chain, and how long the count lingers. */
const COMBO_MIN = 2;
const COMBO_GAP_MS = 1300;
const COMBO_HOLD_MS = 1500;
/** How long the K.O. banner holds. */
const KO_MS = 2000;
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
  /** The big combo counter on this fighter's side of the screen, and its numeral. */
  combo: HTMLElement;
  comboN: HTMLElement;
  trailHp: number;
  /** The ranged heat strip under the health bar (bow, staff and Gate heroes only). */
  heat: HTMLElement;
  heatFill: HTMLElement;
  /** Health last frame: a drop flashes the bar. */
  lastHp: number;
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
  private bannerKey = '';
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
      <div class="hp-bar"><div class="hp-trail"></div><div class="hp-fill"></div><i class="hp-sheen"></i><span class="hp-num"></span></div>
      <div class="hp-heat"><i></i><span>OVERHEAT</span></div>
      <div class="rift-row">
        <span class="rift-art"><img alt=""></span>
        <div class="rift"><div class="rift-fill"></div><span class="rift-pct"></span></div>
        <div class="hp-gear"></div>
      </div>
      <div class="hp-status">${CHIPS.map((c) => `<i class="chip chip-${c.k}">${c.label}</i>`).join('')}</div>
    </div>`;
    const combo = (cls: string) => `<div class="combo-big ${cls}"><b class="cb-n" data-n="2">2</b><span class="cb-l">HITS!</span></div>`;
    const vsSide = (cls: string) => `<div class="hud-vs-side ${cls}"><b class="hud-vs-name"></b></div>`;
    this.root.innerHTML = `${side('left')}<div class="hud-mid"><div class="hud-round"></div><div class="hud-clock">90</div></div>${side('right')}
      <div class="hud-vs">${vsSide('l')}<span class="hud-vs-x">VS</span>${vsSide('r')}</div>
      <button class="hud-menu" aria-label="Menu">II</button>
      ${combo('left')}${combo('right')}
      <div class="hud-banner"></div><div class="hud-net"></div>`;
    parent.appendChild(this.root);

    const combos = this.root.querySelectorAll<HTMLElement>('.combo-big');
    const mk = (el: HTMLElement, combo: HTMLElement): Side => {
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
        combo,
        comboN: combo.querySelector<HTMLElement>('.cb-n')!,
        trailHp: 1000,
        heat: q('.hp-heat'),
        heatFill: q('.hp-heat i'),
        lastHp: 0,
        key: '',
      };
    };
    const els = this.root.querySelectorAll<HTMLElement>('.hp-side');
    this.sides = [mk(els[0], combos[0]), mk(els[1], combos[1])];
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
          preloadCinematic(f.hero);
          s.root.style.setProperty('--ac', css(h.accent));
          s.portrait.src = portraitOf(h.portrait);
          s.heroName.textContent = h.name;
          s.epithet.textContent = h.epithet;
          s.artIcon.src = artIconOf(h.art);
          s.artWrap.title = ARTS[h.art]?.name ?? 'Rift Art';
          // the kit: one weapon (light and heavy attacks) and the skill
          s.gear.innerHTML = `<img src="${weaponIcon(f.weapons[0])}" title="${WEAPONS[f.weapons[0]]?.name}"><img src="${skillIcon(f.skill)}" title="${SKILLS[f.skill]?.name}">`;
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
      s.root.classList.toggle('mid', hp >= max * 0.25 && hp < max * 0.5);
      // a hit flashes the bar (the animation restarts on every drop)
      if (hp < s.lastHp - 0.5) {
        s.root.classList.remove('hit');
        void s.root.offsetWidth;
        s.root.classList.add('hit');
      }
      s.lastHp = hp;
      // ranged heroes: the heat their shots build, red while the weapon cools from an overheat
      const ranged = !!f && !!WEAPONS[f.weapons[0]] && isRanged(WEAPONS[f.weapons[0]]);
      s.root.classList.toggle('ranged', ranged);
      if (ranged && f) {
        s.heatFill.style.width = Math.min(1, f.heat / FIGHTER.heatMax) * 100 + '%';
        s.heat.classList.toggle('over', f.reload);
      }
      // the Sun Crescent: the same strip in gold, refilling while it recharges and brimming when B will throw it
      const crescent = !!f && hasCrescent(f);
      s.root.classList.toggle('crescent', crescent);
      if (crescent && f) {
        const k = f.reload ? 1 - Math.max(0, f.heat - FIGHTER.heatReady) / (FIGHTER.crescentHeat - FIGHTER.heatReady) : 1;
        s.heatFill.style.width = k * 100 + '%';
        s.heat.classList.toggle('ready', !f.reload);
      }

      const rift = f ? Math.min(1, f.rift / RIFT.max) : 0;
      const ready = rift >= 1;
      s.rift.style.width = rift * 100 + '%';
      s.riftWrap.classList.toggle('ready', ready);
      s.artWrap.classList.toggle('ready', ready);
      setText(s.riftPct, ready ? 'ART READY' : `${Math.floor(rift * 100)}%`);

      s.chips.forEach((el, i) => el.classList.toggle('on', !!f && !!f[CHIPS[i].k]));

      // the count lingers a moment after the chain ends, then slides away
      const c = this.combo[seat];
      if (c.n && now - c.t > COMBO_GAP_MS) c.n = 0;
      if (now - c.t > COMBO_HOLD_MS) s.combo.classList.remove('on');
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
      this.showBanner(round ? roundText : 'READY', 300, round ? 'round' : 'ready');
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
        this.showBanner(e.why === 1 ? 'TIME!' : 'K.O.', KO_MS, e.why === 1 ? 'ko time' : 'ko', undefined, true);
        break;
      case 'hit':
        this.countHit(e, g);
        break;
      case 'art': {
        // the cinematic (game/cinematic.ts) shows the Art's name in its cut-in and marks the HUD; this is the fallback
        if (this.root.classList.contains('cinematic')) break;
        const f = g.fighters().find((x) => x.id === e.p);
        const accent = f ? heroOf(f.hero).accent : undefined;
        this.showBanner(ARTS[e.art]?.name.toUpperCase() ?? 'RIFT ART', 1100, 'art', accent, true);
        break;
      }
      case 'match': {
        const f = g.fighters().find((x) => x.seat === e.winner);
        const name = (f ? roster.get(f.id)?.name : '') || 'Winner';
        // the winner's hero has the last word
        const said = f ? ` · “${quotesOf(f.hero).win}”` : '';
        this.showBanner('WINNER!', 4000, 'win', undefined, true, name.toUpperCase() + said);
        break;
      }
    }
  }

  /** Hits in a row for the attacker; a hit on a fighter breaks that fighter's chain. */
  private countHit(e: Extract<GameEvent, { t: 'hit' }>, g: NetGame) {
    const fs = g.fighters();
    const att = fs.find((x) => x.id === e.a);
    const vic = fs.find((x) => x.id === e.v);
    // (burning ticks are not combo hits: the sim numbers them 0)
    if (e.n === 0) return;
    if (vic) this.combo[vic.seat as 0 | 1].n = 0;
    if (!att || !vic || att.id === vic.id) return;
    const now = performance.now();
    const c = this.combo[att.seat as 0 | 1];
    // the sim's own count of the victim's combo (it knows when a fighter recovered in between)
    c.n = e.n > 0 ? e.n : now - c.t < COMBO_GAP_MS ? c.n + 1 : 1;
    c.t = now;
    if (c.n >= COMBO_MIN) this.popCombo(att.seat as 0 | 1, c.n);
  }

  /** The big numeral: its new count, and a pop (1.45x back to 1 in 90 ms) on every hit. */
  private popCombo(seat: 0 | 1, n: number) {
    const s = this.sides[seat];
    const text = String(n);
    setText(s.comboN, text);
    s.comboN.dataset.n = text;
    s.combo.classList.add('on');
    s.comboN.getAnimations().forEach((a) => a.cancel());
    s.comboN.animate(
      [{ transform: 'skewX(-8deg) scale(1.45)', filter: 'brightness(1.8)' }, { transform: 'skewX(-8deg) scale(1)', filter: 'brightness(1)' }],
      { duration: 90, easing: 'ease-out' },
    );
  }

  private resetCombos() {
    this.combo = [
      { n: 0, t: 0 },
      { n: 0, t: 0 },
    ];
    for (const s of this.sides) s.combo.classList.remove('on');
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

  /** A comic slam-in banner (ui/hud.css: scale-in with overshoot, a light ring and rays behind it); `sub` is a small second line. */
  private showBanner(text: string, ms: number, cls: string, accent?: number, fresh = false, sub = '') {
    const b = this.banner;
    if (accent === undefined) b.style.removeProperty('--ac');
    else b.style.setProperty('--ac', css(accent));
    const className = `hud-banner on ${cls}`;
    const key = `${text}|${sub}`;
    if (fresh || this.bannerKey !== key || b.className !== className) {
      // off, then on again in the same frame: the slam animation restarts
      this.bannerKey = key;
      b.className = 'hud-banner';
      b.replaceChildren();
      const t = document.createElement('span');
      t.className = 'bn-t';
      t.textContent = text;
      b.appendChild(t);
      if (sub) {
        const s = document.createElement('small');
        s.textContent = sub;
        b.appendChild(s);
      }
      void b.offsetWidth;
      b.className = className;
    }
    this.bannerUntil = performance.now() + ms;
  }

  destroy() {
    this.root.remove();
  }
}
