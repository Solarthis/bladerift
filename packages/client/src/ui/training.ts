import { Btn } from '@bladerift/shared';

/**
 * TRAINING mode overlay for a practice match (settings { training: true }). Three parts, all pointer-transparent except
 * the menu: an input history column on the left (last inputs as arrows and button glyphs, with frame counts), a damage
 * panel at the top centre (last hit, combo damage, combo hits, best combo) and a compact menu tab under it (dummy
 * behaviour, infinite gauge, reset positions, move list). Styles: ui/training.css (imported from main.ts).
 */

/** The dummy behaviours the menu can set. The sim applies them; this module only reports the choice. */
export type DummyMode = 'dummy-stand' | 'dummy-guard' | 'dummy-jump' | 'cpu';

export interface TrainingOpts {
  onDummy: (mode: DummyMode) => void;
  onInfiniteRift: (on: boolean) => void;
  onReset: () => void;
  onMoveList: () => void;
}

export interface Training {
  /** One call per sim tick (or per rendered frame): buttons is a Btn bitmask, moveX/moveY are -1..1 (moveY + is down). */
  pushInput(buttons: number, moveX: number, moveY: number): void;
  /** Report a landed hit. damage is the hit's damage; combo is the running hit count of the combo (1 on the first hit). */
  setHit(info: { damage: number; combo: number }): void;
  /** A fresh match: zeroes the last, combo, hits and best counters (the menu's choices stay). */
  reset(): void;
  destroy(): void;
}

/** Input history rows shown, newest first. */
const ROWS = 12;
/** An analog axis past this counts as a held direction. */
const AXIS = 0.35;
/** A hit this long after the previous one still belongs to the same combo (ms). Same window as Hud.ts COMBO_GAP_MS. */
const COMBO_GAP_MS = 1300;

/** Button glyphs in reading order. Colours follow the touch art tiles, so a glyph reads like the button it came from. */
const GLYPHS: { bit: number; ch: string; cls: string; name: string }[] = [
  { bit: Btn.Jump, ch: 'J', cls: 'jump', name: 'Jump' },
  { bit: Btn.A, ch: 'A', cls: 'a', name: 'Light' },
  { bit: Btn.B, ch: 'B', cls: 'b', name: 'Heavy' },
  { bit: Btn.Skill, ch: 'S', cls: 'skill', name: 'Skill' },
  { bit: Btn.Roll, ch: 'R', cls: 'roll', name: 'Roll' },
  { bit: Btn.Heal, ch: 'H', cls: 'heal', name: 'Heal' },
  { bit: Btn.Special, ch: 'X', cls: 'art', name: 'Rift Art' },
];

const DUMMIES: { mode: DummyMode; label: string }[] = [
  { mode: 'dummy-stand', label: 'Stand' },
  { mode: 'dummy-guard', label: 'Guard' },
  { mode: 'dummy-jump', label: 'Jump' },
  { mode: 'cpu', label: 'CPU' },
];

// Arrow glyph points right; the row rotates it to the direction. Neutral is a dot.
const ARROW = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 8h10.5M8.5 4.2 12.3 8l-3.8 3.8" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const NEUTRAL = '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="2.6" fill="currentColor"/></svg>';

interface Entry {
  dx: number;
  dy: number;
  buttons: number;
  frames: number;
}

/** Quantizes the stick to one of the eight directions (or neutral). dy is +1 for down, as in the sim. */
function dirOf(moveX: number, moveY: number): [number, number] {
  const dx = moveX > AXIS ? 1 : moveX < -AXIS ? -1 : 0;
  const dy = moveY > AXIS ? 1 : moveY < -AXIS ? -1 : 0;
  return [dx, dy];
}

/** Builds the overlay under `root` (the #ui layer) and returns its controls. */
export function mountTraining(root: HTMLElement, opts: TrainingOpts): Training {
  const el = document.createElement('div');
  el.className = 'training';
  el.innerHTML = `
    <div class="tr-inputs" aria-label="Input history"></div>
    <div class="tr-top">
    <div class="tr-dmg" aria-label="Damage">
      <div class="tr-cell"><span>LAST</span><b class="tr-last">0</b></div>
      <div class="tr-cell tr-combo-cell"><span>COMBO</span><b class="tr-cdmg">0</b></div>
      <div class="tr-cell"><span>HITS</span><b class="tr-hits">0</b></div>
      <div class="tr-cell"><span>BEST</span><b class="tr-best">0</b></div>
    </div>
    <div class="tr-menu-wrap">
      <button type="button" class="tr-tab" aria-expanded="false">TRAINING</button>
      <div class="tr-menu" hidden>
        <div class="tr-grid tr-dummy" role="group" aria-label="Dummy">
          ${DUMMIES.map((d) => `<button type="button" data-mode="${d.mode}" aria-pressed="false">${d.label}</button>`).join('')}
        </div>
        <button type="button" class="tr-wide tr-rift" data-act="rift" aria-pressed="false">Infinite gauge: off</button>
        <div class="tr-grid">
          <button type="button" data-act="reset">Reset</button>
          <button type="button" data-act="moves">Move list</button>
        </div>
      </div>
    </div>
    </div>`;
  root.appendChild(el);

  const inputs = el.querySelector<HTMLElement>('.tr-inputs')!;
  const lastEl = el.querySelector<HTMLElement>('.tr-last')!;
  const cdmgEl = el.querySelector<HTMLElement>('.tr-cdmg')!;
  const hitsEl = el.querySelector<HTMLElement>('.tr-hits')!;
  const bestEl = el.querySelector<HTMLElement>('.tr-best')!;
  const dmgPanel = el.querySelector<HTMLElement>('.tr-dmg')!;
  const tab = el.querySelector<HTMLButtonElement>('.tr-tab')!;
  const menu = el.querySelector<HTMLElement>('.tr-menu')!;
  const riftBtn = el.querySelector<HTMLButtonElement>('.tr-rift')!;

  // ---- input history: consecutive identical inputs merge into one row with a frame count
  const hist: Entry[] = [];
  const frameEls: HTMLElement[] = [];

  const rowHtml = (e: Entry, now: boolean): string => {
    const idle = e.dx === 0 && e.dy === 0;
    const deg = idle ? 0 : Math.round((Math.atan2(e.dy, e.dx) * 180) / Math.PI);
    const btns = GLYPHS.filter((g) => (e.buttons & g.bit) !== 0)
      .map((g) => `<i class="tr-b tr-b-${g.cls}" title="${g.name}">${g.ch}</i>`)
      .join('');
    const cls = `tr-row${idle ? ' idle' : ''}${now ? ' now' : ''}`;
    const dir = idle ? NEUTRAL : `<span class="tr-dir" style="transform:rotate(${deg}deg)">${ARROW}</span>`;
    return `<div class="${cls}">${dir}<span class="tr-btns">${btns}</span><span class="tr-f">${fmtFrames(e.frames)}</span></div>`;
  };

  const drawInputs = () => {
    inputs.innerHTML = hist.map((e, i) => rowHtml(e, i === 0)).join('');
    frameEls.length = 0;
    inputs.querySelectorAll<HTMLElement>('.tr-f').forEach((f) => frameEls.push(f));
  };

  const pushInput = (buttons: number, moveX: number, moveY: number) => {
    const [dx, dy] = dirOf(moveX, moveY);
    const b = buttons & 127;
    const head = hist[0];
    if (head && head.dx === dx && head.dy === dy && head.buttons === b) {
      head.frames++;
      if (frameEls[0]) frameEls[0].textContent = fmtFrames(head.frames);
      return;
    }
    hist.unshift({ dx, dy, buttons: b, frames: 1 });
    if (hist.length > ROWS) hist.length = ROWS;
    drawInputs();
  };

  // ---- damage panel
  let last = 0;
  let comboHits = 0;
  let comboDmg = 0;
  let best = 0;
  let lastAt = -Infinity;
  let endTimer = 0;

  const pop = (node: HTMLElement) => {
    node.classList.remove('tr-pop');
    void node.offsetWidth;
    node.classList.add('tr-pop');
  };

  const setHit = (info: { damage: number; combo: number }) => {
    const now = performance.now();
    const dmg = Math.max(0, Math.round(info.damage) || 0);
    const hits = Math.max(1, Math.floor(info.combo) || 1);
    const continuing = now - lastAt < COMBO_GAP_MS && hits > comboHits;
    comboDmg = continuing ? comboDmg + dmg : dmg;
    comboHits = hits;
    lastAt = now;
    last = dmg;
    best = Math.max(best, hits);

    lastEl.textContent = String(last);
    cdmgEl.textContent = String(comboDmg);
    hitsEl.textContent = String(comboHits);
    bestEl.textContent = String(best);
    pop(cdmgEl);
    dmgPanel.classList.remove('ended');
    window.clearTimeout(endTimer);
    endTimer = window.setTimeout(() => dmgPanel.classList.add('ended'), COMBO_GAP_MS);
  };

  const reset = () => {
    window.clearTimeout(endTimer);
    last = 0;
    comboHits = 0;
    comboDmg = 0;
    best = 0;
    lastAt = -Infinity;
    lastEl.textContent = '0';
    cdmgEl.textContent = '0';
    hitsEl.textContent = '0';
    bestEl.textContent = '0';
    dmgPanel.classList.remove('ended');
  };

  // ---- menu
  const setDummy = (mode: DummyMode) => {
    el.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((b) => {
      const on = b.dataset.mode === mode;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
    });
  };
  setDummy('dummy-stand');

  let rift = false;
  const setRift = (on: boolean) => {
    rift = on;
    riftBtn.textContent = `Infinite gauge: ${on ? 'on' : 'off'}`;
    riftBtn.classList.toggle('on', on);
    riftBtn.setAttribute('aria-pressed', String(on));
  };
  setRift(false);

  const setOpen = (open: boolean) => {
    menu.hidden = !open;
    tab.setAttribute('aria-expanded', String(open));
    tab.classList.toggle('open', open);
  };
  setOpen(false);

  const onClick = (ev: Event) => {
    const target = (ev.target as HTMLElement).closest<HTMLButtonElement>('button');
    if (!target) return;
    if (target === tab) {
      setOpen(menu.hidden);
      return;
    }
    const mode = target.dataset.mode as DummyMode | undefined;
    if (mode) {
      setDummy(mode);
      opts.onDummy(mode);
      return;
    }
    switch (target.dataset.act) {
      case 'rift':
        setRift(!rift);
        opts.onInfiniteRift(rift);
        break;
      case 'reset':
        opts.onReset();
        break;
      case 'moves':
        opts.onMoveList();
        break;
    }
  };
  el.addEventListener('click', onClick);

  return {
    pushInput,
    setHit,
    reset,
    destroy() {
      window.clearTimeout(endTimer);
      el.removeEventListener('click', onClick);
      el.remove();
    },
  };
}

/** Frame counts: plain up to 999, then capped so the column keeps its width through long idle stretches. */
function fmtFrames(n: number): string {
  return n > 999 ? '999+' : `${n}`;
}
