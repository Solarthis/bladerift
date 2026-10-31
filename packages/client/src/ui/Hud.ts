import { FIGHTER, GameEvent, RosterEntry, SKILLS, WEAPONS } from '@bladerift/shared';
import type { NetGame } from '../net/NetGame';
import { colorOf, css } from './colors';
import { skillIcon, weaponIcon } from './icons';

interface Side {
  root: HTMLElement;
  name: HTMLElement;
  bar: HTMLElement;
  trail: HTMLElement;
  hpText: HTMLElement;
  pips: HTMLElement;
  gear: HTMLElement;
  shownHp: number;
  trailHp: number;
  key: string;
}

/** The in-match overlay: both fighters' health along the top, round wins, the clock and the round banners. */
export class Hud {
  readonly root: HTMLElement;
  private sides: [Side, Side];
  private clock: HTMLElement;
  private round: HTMLElement;
  private banner: HTMLElement;
  private net: HTMLElement;
  private bannerUntil = 0;
  private lastPhase = '';
  onMenu: (() => void) | null = null;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'hud';
    const side = (cls: string) => `<div class="hp-side ${cls}"><div class="hp-top"><b class="hp-name"></b><span class="hp-pips"></span></div>
      <div class="hp-bar"><div class="hp-trail"></div><div class="hp-fill"></div><span class="hp-num"></span></div><div class="hp-gear"></div></div>`;
    this.root.innerHTML = `${side('left')}<div class="hud-mid"><div class="hud-round"></div><div class="hud-clock">90</div></div>${side('right')}
      <button class="hud-menu" aria-label="Menu">II</button><div class="hud-banner"></div><div class="hud-net"></div>`;
    parent.appendChild(this.root);
    const mk = (el: HTMLElement): Side => ({
      root: el, name: el.querySelector('.hp-name')!, bar: el.querySelector('.hp-fill')!, trail: el.querySelector('.hp-trail')!, hpText: el.querySelector('.hp-num')!,
      pips: el.querySelector('.hp-pips')!, gear: el.querySelector('.hp-gear')!, shownHp: FIGHTER.maxHp, trailHp: FIGHTER.maxHp, key: '',
    });
    const els = this.root.querySelectorAll<HTMLElement>('.hp-side');
    this.sides = [mk(els[0]), mk(els[1])];
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
      const key = `${r?.name}|${r?.color}|${f?.weapons}|${f?.skill}|${g.wins[seat]}|${g.settings.wins}`;
      if (key !== s.key) {
        s.key = key;
        s.name.textContent = r?.name ?? '—';
        s.root.style.setProperty('--c', css(colorOf(r?.color ?? seat * 5)));
        s.pips.innerHTML = Array.from({ length: g.settings.wins }, (_, i) => `<i class="${i < g.wins[seat] ? 'won' : ''}"></i>`).join('');
        s.gear.innerHTML = f
          ? `<img src="${weaponIcon(f.weapons[0])}" title="${WEAPONS[f.weapons[0]]?.name}"><img src="${weaponIcon(f.weapons[1])}" title="${WEAPONS[f.weapons[1]]?.name}"><img src="${skillIcon(f.skill)}" title="${SKILLS[f.skill]?.name}">`
          : '';
      }
      const hp = f ? Math.max(0, f.hp) : 0;
      s.shownHp = hp;
      // the red trail catches up a moment after a hit
      if (s.trailHp < hp) s.trailHp = hp;
      else s.trailHp = Math.max(hp, s.trailHp - FIGHTER.maxHp * 0.5 * dt);
      s.bar.style.width = (hp / FIGHTER.maxHp) * 100 + '%';
      s.trail.style.width = (s.trailHp / FIGHTER.maxHp) * 100 + '%';
      s.hpText.textContent = String(Math.ceil(hp));
      s.root.classList.toggle('low', hp < FIGHTER.maxHp * 0.25);
    }
    const t = Math.ceil(g.timeLeft);
    if (this.clock.textContent !== String(t)) this.clock.textContent = String(t);
    this.clock.classList.toggle('hurry', g.phase === 'fight' && t <= 10);
    const roundText = `ROUND ${g.round}`;
    if (this.round.textContent !== roundText) this.round.textContent = roundText;
    // intro countdown
    if (g.phase === 'intro') {
      const left = g.phaseLeft / 60;
      this.showBanner(left > 1 ? roundText : 'READY', 300, left > 1 ? '' : 'ready');
    }
    if (g.phase !== this.lastPhase) this.lastPhase = g.phase;
    if (now > this.bannerUntil) this.banner.classList.remove('on');
    const ping = Math.round(rtt);
    const netText = g.local ? '' : `${ping} ms`;
    if (this.net.textContent !== netText) this.net.textContent = netText;
  }

  onEvent(e: GameEvent, roster: Map<number, RosterEntry>, g: NetGame) {
    switch (e.t) {
      case 'fight':
        this.showBanner('FIGHT!', 900, 'fight');
        break;
      case 'round': {
        this.showBanner(e.why === 1 ? 'TIME!' : 'K.O.', 1600, 'ko');
        break;
      }
      case 'match': {
        const f = g.fighters().find((x) => x.seat === e.winner);
        const name = f ? roster.get(f.id)?.name : '';
        this.showBanner(`${(name ?? 'Winner').toUpperCase()} WINS`, 4000, 'win');
        break;
      }
    }
  }

  private showBanner(text: string, ms: number, cls: string) {
    if (this.banner.textContent !== text) {
      this.banner.textContent = text;
      this.banner.className = `hud-banner on ${cls}`;
      // restart the pop animation
      void this.banner.offsetWidth;
    }
    this.banner.classList.add('on');
    this.bannerUntil = performance.now() + ms;
  }

  destroy() {
    this.root.remove();
  }
}
