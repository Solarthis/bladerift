// The MUGEN-style VS card shown as a match starts: both portraits slam in from the sides, a giant "VS" hits the centre
// with a flash and a shake, the arena and mode fade in, then the card wipes away. Presentation only: it reads and writes
// no game state, and its one input is a press that skips it (after SKIP_AFTER_MS, so the press that started the match
// cannot end it). The card never takes pointer input, so it does not block the game underneath.
import { heroOf } from '@bladerift/shared';
import { prefs } from './prefs';
import './vsSplash.css';

export interface VsSide {
  heroId: number;
  playerName: string;
  /** Any CSS colour; the player colour of the fighter. */
  color: string;
}

export interface VsSplashData {
  p1: VsSide;
  p2: VsSide;
  arenaName: string;
  modeLabel?: string;
}

/** Length of the full card (ms). It is the timeline in vsSplash.css: the wipe-out ends exactly here. */
const RUN_MS = 2400;
/** Reduced motion: fades only, no slam, shake or flash. */
const CALM_MS = 1200;
/** A tap or key press skips the card only after this long (ms). */
const SKIP_AFTER_MS = 600;
/** The skip fade (ms) before the card is removed. */
const SKIP_FADE_MS = 160;
/** Used when a colour is not a valid CSS colour. */
const FALLBACK_COLOR = '#e9b64a';

const reducedMotion = (): boolean => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** The lobby's portrait for a hero (the same image as the hero select card). */
const portraitOf = (heroId: number): string => `assets/art/h-${String(heroOf(heroId).portrait).padStart(2, '0')}.jpg`;

function safeColor(c: string): string {
  try {
    return typeof CSS !== 'undefined' && CSS.supports('color', c) ? c : FALLBACK_COLOR;
  } catch {
    return FALLBACK_COLOR;
  }
}

/** Creates an element with its class and text (text goes in via textContent, so player names are never parsed as HTML). */
function make<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

/** One fighter's half: the slanted portrait with its colour ring, then the player name, hero name and epithet. */
function buildSide(s: VsSide, dir: 'l' | 'r'): HTMLElement {
  const hero = heroOf(s.heroId);
  const box = make('div', `vss-${dir}`);
  const side = make('div', 'vss-side');
  const pic = make('div', 'vss-pic');
  const frame = make('div', 'vss-frame');
  const img = make('img');
  img.src = portraitOf(s.heroId);
  img.alt = '';
  img.decoding = 'async';
  frame.append(img);
  pic.append(frame);
  const name = make('div', 'vss-name');
  name.append(make('div', 'vss-tag', s.playerName), make('div', 'vss-hero', hero.name), make('div', 'vss-epi', hero.epithet));
  side.append(pic, name);
  box.append(side);
  return box;
}

/** The whole card as a DOM tree (not yet attached). */
function buildCard(data: VsSplashData, calm: boolean, shake: boolean): HTMLElement {
  const root = make('div', 'vss');
  root.setAttribute('aria-hidden', 'true');
  // inline: the card must never take a click, whatever the page's own rules say for #ui children
  root.style.pointerEvents = 'none';
  root.style.setProperty('--vss-cl', safeColor(data.p1.color));
  root.style.setProperty('--vss-cr', safeColor(data.p2.color));
  if (calm) root.classList.add('vss-calm');
  else if (!shake) root.classList.add('vss-noshake');

  const bg = make('div', 'vss-bg');
  bg.append(make('div', 'vss-lines'), make('div', 'vss-band vss-band-l'), make('div', 'vss-band vss-band-r'));

  const stage = make('div', 'vss-stage');
  const fight = make('div', 'vss-fight');
  fight.append(buildSide(data.p1, 'l'), buildSide(data.p2, 'r'));
  const markWrap = make('div', 'vss-mark-wrap');
  markWrap.append(make('div', 'vss-mark', 'VS'));
  const foot = make('div', 'vss-foot');
  foot.append(make('div', 'vss-arena', data.arenaName));
  if (data.modeLabel) foot.append(make('div', 'vss-mode', data.modeLabel));
  stage.append(fight, markWrap, foot);

  root.append(bg, stage, make('div', 'vss-flash'));
  return root;
}

/**
 * Shows the VS card over `root` (the #ui layer, which must be positioned) and resolves when it is done: after the
 * ~2.4 s timeline (1.2 s with reduced motion), or about 0.2 s after a tap or key press once SKIP_AFTER_MS has passed.
 * The card removes itself before the promise resolves, so the caller can start the next thing straight away.
 */
export function showVsSplash(root: HTMLElement, data: VsSplashData): Promise<void> {
  return new Promise<void>((resolve) => {
    const calm = reducedMotion();
    let shake = true;
    try {
      shake = prefs().shake > 0;
    } catch {
      shake = true;
    }
    const card = buildCard(data, calm, shake);
    root.appendChild(card);

    let done = false;
    let endTimer = 0;
    let armTimer = 0;

    const onPress = (e: Event) => {
      if (e instanceof KeyboardEvent && e.repeat) return;
      skip();
    };

    const finish = (skipped: boolean) => {
      if (done) return;
      done = true;
      window.clearTimeout(endTimer);
      window.clearTimeout(armTimer);
      window.removeEventListener('pointerdown', onPress);
      window.removeEventListener('keydown', onPress);
      if (skipped) {
        card.classList.add('vss-skip');
        window.setTimeout(() => {
          card.remove();
          resolve();
        }, SKIP_FADE_MS);
      } else {
        card.remove();
        resolve();
      }
    };

    const skip = () => finish(true);

    endTimer = window.setTimeout(() => finish(false), calm ? CALM_MS : RUN_MS);
    armTimer = window.setTimeout(() => {
      if (done) return;
      window.addEventListener('pointerdown', onPress, { passive: true });
      window.addEventListener('keydown', onPress);
    }, SKIP_AFTER_MS);
  });
}
