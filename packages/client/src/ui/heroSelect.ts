/**
 * The hero select, MUGEN-style, for the fighter screen. Left: the cursor hero's big portrait and its live sprite preview,
 * with name and epithet on a plate, and the player colour swatches under it. Centre: a face grid, one group per class
 * (the True and False champions side by side; a class with a single champion is centred in its cell). Right: the class,
 * stats, traits, special, dodge, Rift Art and signature weapon. The same heroes, numbers and actions as the fighter
 * screen (App.renderFighter), laid out to fit one screen.
 *
 * Input: hovering a face moves the cursor (the portrait and the panels show the cursor's hero) and calls onCursor; a
 * click picks it (onHero). Arrow keys or the gamepad d-pad move the cursor. Space or gamepad A picks the cursor's hero;
 * Enter (or gamepad A on a pick) picks it and finishes. Escape, gamepad B or Start finishes. onDone is the Back and Done
 * action. Call destroy() when the screen is left: it removes the key and gamepad listeners.
 *
 * The module keeps its own state: the opts give the starting values and the callbacks report each change.
 */
import { ARTS, CLASSES, classOf, dodgeOf, heroClass, heroOf, HEROES, heroWeapon, SKILLS, stanceLookOf, WEAPONS, WeaponId, weaponLookOf } from '@bladerift/shared';
import type { ClassDef, HeroDef } from '@bladerift/shared';
import { COLORS, colorOf, css } from './colors';
import { crestIcon, dodgeIcon, heroArtIcon, heroWeaponIcon, skillIcon, stanceWeaponIcon } from './icons';
import { animatePreview } from './spritePreview';
import './heroSelect.css';

export interface HeroSelectOpts {
  /** The hero to start on (a HEROES id). */
  hero: number;
  /** The player colour to start on (a colors.ts index, or a custom colour value). */
  color: number;
  /** The name to start with. */
  name: string;
  /** A hero was picked (click, Space or Enter). */
  onHero: (id: number) => void;
  /** A colour swatch was picked (index into colors.ts COLORS). */
  onColor: (i: number) => void;
  /** The name changed (trimmed to 16 characters; blank names are not reported). */
  onName: (s: string) => void;
  /** Back or Done: the screen is finished. */
  onDone: () => void;
  /** The cursor moved to another hero by hover, keyboard or gamepad: the hook for the cursor sound. */
  onCursor?: () => void;
}

type Dir = 'left' | 'right' | 'up' | 'down';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
/** The portrait card (240x320) of a hero: assets/art/h-NN.jpg, the same art as the fighter screen. */
const portraitOf = (h: HeroDef) => `assets/art/h-${String(h.portrait).padStart(2, '0')}.jpg`;

/** The classes in their menu order, four to a row. Each holds its heroes, True champion first. */
interface Group {
  cls: ClassDef;
  heroes: HeroDef[];
  row: number;
  col: number;
}
const GROUPS: Group[] = CLASSES.map((cls, i) => ({
  cls,
  heroes: HEROES.filter((h) => h.cls === cls.id).sort((a, b) => Number(a.slot !== 'True') - Number(b.slot !== 'True')),
  row: Math.floor(i / 4),
  col: i % 4,
}));
/** Reading order of every hero (the left and right keys follow it, wrapping). */
const ORDER: number[] = GROUPS.flatMap((g) => g.heroes.map((h) => h.id));
/**
 * Where each face sits on the grid: a visual row (a class row, then its True champion over its False one) and a column.
 * A single champion has the row of the top slot.
 */
const SPOT = new Map<number, { row: number; col: number }>();
for (const g of GROUPS) g.heroes.forEach((h, s) => SPOT.set(h.id, { row: g.row * 2 + s, col: g.col }));

/**
 * The cursor's next hero. Left and right follow the reading order. Up and down go to the nearest row that holds a face
 * in that direction (so a True champion steps down to its own False one), then to the nearest column in that row.
 */
function step(from: number, dir: Dir): number {
  if (dir === 'left' || dir === 'right') {
    const i = ORDER.indexOf(from);
    return ORDER[(i + (dir === 'right' ? 1 : ORDER.length - 1)) % ORDER.length];
  }
  const p = SPOT.get(from);
  if (!p) return from;
  const down = dir === 'down';
  let row: number | undefined;
  for (const id of ORDER) {
    const q = SPOT.get(id);
    if (!q || (down ? q.row <= p.row : q.row >= p.row)) continue;
    if (row === undefined || (down ? q.row < row : q.row > row)) row = q.row;
  }
  if (row === undefined) return from;
  let best = from;
  let bestD = Infinity;
  for (const id of ORDER) {
    const q = SPOT.get(id);
    if (!q || q.row !== row) continue;
    const d = Math.abs(q.col - p.col);
    if (d < bestD) {
      best = id;
      bestD = d;
    }
  }
  return best;
}

/** What the screen shows for a hero: its class's numbers, nudged by the hero's own tune (as on the fighter screen). */
function statsOf(h: HeroDef) {
  const C = classOf(h.cls);
  const hw = heroWeapon(h.id);
  const reachOf: Record<number, number> = { [WeaponId.Daggers]: 1, [WeaponId.Sword]: 3, [WeaponId.Gate]: 5, [WeaponId.Chains]: 5 };
  const T = heroClass({ cls: h.cls, hero: h.id });
  const nudge = (b: number, k: number) => Math.max(1, Math.min(5, Math.round(b + k)));
  // a hero with a weapon of its own reaches as far as that weapon does
  const traits = [
    T.airJumps > C.airJumps ? 'Triple jump' : '',
    (T.jump ?? 1) >= 1.08 ? 'High leap' : (T.jump ?? 1) <= 0.92 ? 'Low jump' : '',
    (T.weight ?? 1) <= 0.86 ? 'Heavy: hard to launch' : (T.weight ?? 1) >= 1.1 ? 'Light: thrown far' : '',
  ].filter(Boolean);
  return {
    C,
    hw,
    power: nudge(C.bars.power, (T.dmg / C.dmg - 1) * 6),
    speed: nudge(C.bars.speed, (T.speed / C.speed - 1) * 7),
    health: nudge(C.bars.health, (T.hp / C.hp - 1) * 12),
    reach: hw === C.signature ? C.bars.reach : reachOf[hw] ?? C.bars.reach,
    traits,
    sp: SKILLS[h.id],
    dg: dodgeOf({ hero: h.id }),
    art: ARTS[h.art] ?? ARTS[0],
    wa: weaponLookOf(h.id),
    st: stanceLookOf(h.id),
  };
}

/** The right-hand panel for a hero: class, lore, numbers, traits, and the four kit items. */
function infoHtml(h: HeroDef): string {
  const s = statsOf(h);
  const bar = (label: string, v: number) => `<div class="hsel-bar"><span>${label}</span><i>${'<b></b>'.repeat(v)}${'<em></em>'.repeat(5 - v)}</i></div>`;
  const shot = !!WEAPONS[s.hw].arrowSpeed;
  const heavy = s.hw === WeaponId.Gate ? 'a held volley' : shot ? 'a held shot' : 'a heavy strike';
  return `<div class="hsel-cls"><img src="${crestIcon(s.C.id)}" alt=""><div><b>${esc(s.C.name)}</b><small>${esc(s.C.title)}</small></div></div>
      <p class="hsel-lore">${esc(h.lore)}</p>
      <div class="hsel-bars">${bar('Power', s.power)}${bar('Speed', s.speed)}${bar('Health', s.health)}${bar('Reach', s.reach)}</div>
      ${s.traits.length ? `<div class="hsel-traits">${s.traits.map((t) => `<span>${esc(t)}</span>`).join('')}</div>` : ''}
      <p class="hsel-blurb">${esc(s.C.blurb)}</p>
      <div class="hsel-items">
        <div class="hsel-it hsel-k-special"><img src="${skillIcon(h.id)}" alt=""><div><small>Special</small><b>${esc(s.sp.name)}</b><p>${esc(s.sp.blurb)}</p></div></div>
        <div class="hsel-it hsel-k-dodge"><img src="${dodgeIcon(h.id)}" alt=""><div><small>Dodge</small><b>${esc(s.dg.name)}</b><p>${esc(s.dg.blurb)}</p></div></div>
        <div class="hsel-it hsel-k-art"><img src="${heroArtIcon(h.id)}" alt=""><div><small>Rift Art</small><b>${esc(s.art.name)}</b><p>${esc(s.art.blurb)}</p></div></div>
        <div class="hsel-it hsel-k-sig"><img src="${heroWeaponIcon(h.id)}" alt=""><div><small>Signature weapon <em>locked to the hero</em></small><b>${esc(s.wa.name)}</b><p>${esc(s.wa.blurb)}</p></div></div>
        <div class="hsel-it hsel-k-sig"><img src="${stanceWeaponIcon(h.id)}" alt=""><div><small>Second stance <em>Stance button</em></small><b>${esc(s.st.name)}</b><p>${esc(s.st.blurb)}</p></div></div>
      </div>
      <p class="hsel-note">${esc(h.name)} fights with the ${esc(s.wa.name)}: light ${shot ? 'shots' : 'combo'} on one button, ${heavy} on the other${shot ? '' : ' (a plunge in the air)'}. Stance switches to the ${esc(s.st.name)} and its own moves.</p>`;
}

const tileHtml = (h: HeroDef) =>
  `<div class="hsel-tile" role="button" tabindex="-1" data-id="${h.id}" aria-label="${esc(h.name)}, ${esc(h.epithet)}" aria-pressed="false"><img src="${portraitOf(h)}" alt="" draggable="false"><span class="hsel-tag">${h.slot}</span><span class="hsel-nm">${esc(h.name)}</span></div>`;

const groupHtml = (g: Group) =>
  `<div class="hsel-group${g.heroes.length === 1 ? ' solo' : ''}"><div class="hsel-glabel"><img src="${crestIcon(g.cls.id)}" alt="">${esc(g.cls.name)}</div><div class="hsel-slots">${g.heroes.map(tileHtml).join('')}</div></div>`;

/**
 * Mounts the hero select into `root` (made positioned if it is static; the screen fills it). Returns the handle whose
 * destroy() removes the screen and its listeners.
 */
export function mountHeroSelect(root: HTMLElement, opts: HeroSelectOpts): { destroy(): void } {
  let hero = heroOf(opts.hero).id;
  let cursor = hero;
  let color = opts.color;

  if (getComputedStyle(root).position === 'static') root.style.position = 'relative';

  const wrap = document.createElement('div');
  wrap.className = 'hsel';
  wrap.style.setProperty('--pc', css(colorOf(color)));
  wrap.innerHTML = `
    <header class="hsel-hdr">
      <button class="hsel-back" data-act="done" aria-label="Back">‹</button>
      <h2>Choose your hero</h2>
      <span class="hsel-grow"></span>
      <input id="fname" class="hsel-name" maxlength="16" value="${esc(opts.name)}" placeholder="Name" aria-label="Name">
      <button class="primary hsel-done" data-act="done">Done</button>
    </header>
    <div class="hsel-body">
      <section class="hsel-left">
        <div class="hsel-stage"></div>
        <div class="hsel-gear">
          <div class="hsel-lbl">Player colour <small>name tag and effects</small></div>
          <div class="hsel-sws" role="group" aria-label="Player colour">${COLORS.map((c, i) => `<button class="hsel-sw" style="--c:${css(c.rgb)}" title="${esc(c.name)}" aria-label="${esc(c.name)}" aria-pressed="false" data-i="${i}"></button>`).join('')}</div>
        </div>
      </section>
      <section class="hsel-faces" aria-label="Heroes">${GROUPS.map(groupHtml).join('')}</section>
      <section class="hsel-info"></section>
    </div>`;
  root.append(wrap);

  const stage = wrap.querySelector<HTMLElement>('.hsel-stage')!;
  const info = wrap.querySelector<HTMLElement>('.hsel-info')!;
  const faces = wrap.querySelector<HTMLElement>('.hsel-faces')!;
  const nameIn = wrap.querySelector<HTMLInputElement>('.hsel-name')!;
  const swatches = Array.from(wrap.querySelectorAll<HTMLElement>('.hsel-sw'));
  const tiles = new Map<number, HTMLElement>();

  faces.querySelectorAll<HTMLElement>('.hsel-tile').forEach((el) => {
    const id = Number(el.dataset.id);
    tiles.set(id, el);
    el.addEventListener('pointerenter', () => hover(id));
    el.addEventListener('click', () => pick(id));
  });
  // the cursor goes back to the picked hero when the mouse leaves the faces (no sound: it is not a move)
  faces.addEventListener('pointerleave', () => {
    if (cursor !== hero) {
      cursor = hero;
      repaint();
    }
  });

  swatches.forEach((el, i) =>
    el.addEventListener('click', () => {
      color = i;
      wrap.style.setProperty('--pc', css(colorOf(color)));
      paintSwatches();
      opts.onColor(i);
    }),
  );

  nameIn.addEventListener('input', () => {
    const v = nameIn.value.slice(0, 16);
    if (v.trim()) opts.onName(v);
  });

  wrap.querySelectorAll<HTMLElement>('[data-act="done"]').forEach((el) => el.addEventListener('click', () => opts.onDone()));

  const paintSwatches = () =>
    swatches.forEach((el, i) => {
      el.classList.toggle('on', i === color);
      el.setAttribute('aria-pressed', String(i === color));
    });

  /** The stage (portrait, live sprite, plate) and the info panel show the cursor's hero. */
  const paintStage = () => {
    const h = heroOf(cursor);
    const C = classOf(h.cls);
    stage.innerHTML = `<img class="hsel-portrait" src="${portraitOf(h)}" alt="${esc(h.name)}">
      <canvas class="hsel-sprite" hidden aria-hidden="true"></canvas>
      <div class="hsel-ctag"><img src="${crestIcon(C.id)}" alt=""><span>${esc(C.name)}</span></div>
      <div class="hsel-plate"><small>${h.slot === 'Extra' ? 'Extra champion' : `${h.slot} champion`}</small><h2>${esc(h.name)}</h2><p>${esc(h.epithet)}</p></div>`;
    const cv = stage.querySelector<HTMLCanvasElement>('canvas');
    if (cv) animatePreview(cv, h.id).catch(() => undefined);
    info.innerHTML = infoHtml(h);
  };

  const repaint = () => {
    tiles.forEach((el, id) => {
      el.classList.toggle('on', id === hero);
      el.classList.toggle('cur', id === cursor);
      el.setAttribute('aria-pressed', String(id === hero));
      el.tabIndex = id === cursor ? 0 : -1;
    });
    paintSwatches();
    paintStage();
  };

  const hover = (id: number) => {
    if (id === cursor) return;
    cursor = id;
    repaint();
    opts.onCursor?.();
  };

  const move = (dir: Dir) => {
    const next = step(cursor, dir);
    if (next === cursor) return;
    cursor = next;
    repaint();
    // keep keyboard focus on the grid when it was there (or nowhere), so Enter and Space keep working
    const a = document.activeElement;
    if (a === null || a === document.body || (a instanceof HTMLElement && a.classList.contains('hsel-tile'))) tiles.get(cursor)?.focus({ preventScroll: true });
    opts.onCursor?.();
  };

  const pick = (id: number) => {
    hero = id;
    cursor = id;
    repaint();
    opts.onHero(id);
  };

  const confirm = () => {
    if (cursor !== hero) pick(cursor);
    opts.onDone();
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    const t = e.target;
    if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement) {
      // typing: Enter or Escape leaves the field, the arrows edit it
      if (e.key === 'Enter' || e.key === 'Escape') {
        t.blur();
        e.preventDefault();
      }
      return;
    }
    // a focused button keeps its own Enter and Space (Done, Back, a colour swatch)
    const onButton = t instanceof HTMLButtonElement;
    if (e.key === 'ArrowLeft') move('left');
    else if (e.key === 'ArrowRight') move('right');
    else if (e.key === 'ArrowUp') move('up');
    else if (e.key === 'ArrowDown') move('down');
    else if (e.key === 'Enter' && !onButton) confirm();
    else if (e.key === ' ' && !onButton) pick(cursor);
    else if (e.key === 'Escape') opts.onDone();
    else return;
    e.preventDefault();
  };

  // gamepad: the d-pad or left stick moves (with key repeat), A confirms, B and Start finish
  const DIRS: Record<string, Dir> = { up: 'up', down: 'down', left: 'left', right: 'right' };
  const seen: Record<string, boolean> = {};
  const again: Record<string, number> = {};
  let raf = 0;
  const pad = (): Gamepad | null => {
    const pads = typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : [];
    for (const p of pads) if (p && p.connected) return p;
    return null;
  };
  const padAct = (k: string) => {
    if (k in DIRS) {
      if (document.activeElement !== nameIn) move(DIRS[k]);
      return;
    }
    if (k === 'a') {
      const a = document.activeElement;
      if (a instanceof HTMLButtonElement) a.click();
      else if (a !== nameIn) confirm();
      return;
    }
    if (document.activeElement === nameIn) nameIn.blur();
    else opts.onDone();
  };
  const poll = (now: number) => {
    raf = requestAnimationFrame(poll);
    const g = pad();
    if (!g) return;
    const btn = (i: number) => !!g.buttons[i]?.pressed;
    const ax = (i: number) => g.axes[i] ?? 0;
    const input: Record<string, boolean> = {
      up: btn(12) || ax(1) < -0.5,
      down: btn(13) || ax(1) > 0.5,
      left: btn(14) || ax(0) < -0.5,
      right: btn(15) || ax(0) > 0.5,
      a: btn(0),
      b: btn(1),
      start: btn(9),
    };
    for (const k of Object.keys(input)) {
      if (!input[k]) {
        seen[k] = false;
        continue;
      }
      if (!seen[k]) {
        seen[k] = true;
        again[k] = now + 380;
        padAct(k);
      } else if (k in DIRS && now >= again[k]) {
        again[k] = now + 120;
        padAct(k);
      }
    }
  };

  repaint();
  window.addEventListener('keydown', onKey);
  raf = requestAnimationFrame(poll);

  return {
    destroy() {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey);
      wrap.remove();
    },
  };
}
