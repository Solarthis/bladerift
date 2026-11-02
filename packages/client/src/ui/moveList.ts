import { heroOf } from '@bladerift/shared';
import './moveList.css';

/** One row of a hero's move list (`movelists/hNN.json`, schema in `movelists/README.md`). */
export interface MoveEntry {
  name: string;
  /** Notation: LIGHT, HEAVY, JUMP, DODGE, SPECIAL, ART, arrows, `+` together, `,` in sequence, `(close)` style tags. */
  input: string;
  /** normal, heavy, launcher, air, plunge, throw, special, ex, art or dodge; anything else files under Normals. */
  kind: string;
  /** One number, a list of hits (per-hit damage), or free text. */
  damage?: number | number[] | string;
  notes?: string;
}

/** One named combo in a hero's list. */
export interface ComboEntry {
  name: string;
  input: string;
  notes?: string;
}

/** A hero's move list file, normalised: missing arrays become empty. */
export interface MoveList {
  hero: number;
  name: string;
  weapon?: string;
  style?: string;
  moves: MoveEntry[];
  combos: ComboEntry[];
}

/** One line of the universal system, shown in every hero's panel. */
export interface GeneralControl {
  name: string;
  input: string;
  notes: string;
}

/**
 * The universal system: the same for every hero (see `docs/feel/mugen-reference.md` for the timing it follows).
 * Inputs use the same notation as the hero lists.
 */
export const GENERAL_CONTROLS: GeneralControl[] = [
  { name: 'Launcher', input: '↓+LIGHT', notes: 'Launches a grounded opponent into the air.' },
  { name: 'Air combo', input: 'LIGHT, LIGHT, LIGHT (air)', notes: 'Light swings in the air. The first few hold a juggled opponent up for more hits.' },
  { name: 'Throw', input: '→+HEAVY (close)', notes: 'Grabs an opponent at close range.' },
  { name: 'Throw break', input: 'LIGHT or HEAVY', notes: 'Press either attack in the first moment of a grab (8 ticks) to break free.' },
  { name: 'EX', input: 'ART', notes: 'At half the Rift gauge: the hero’s EX special.' },
  { name: 'Rift Art', input: 'ART', notes: 'At a full Rift gauge: the hero’s Rift Art.' },
  { name: 'Block', input: 'BLOCK (hold)', notes: 'Guards hits from the front for a little chip damage (holding ↓ on the ground crouch-guards too). Guard breakers, unblockables and Rift Arts get through.' },
  { name: 'Perfect block', input: 'BLOCK (just before the hit)', notes: 'Press BLOCK within 8 ticks (about 1/8 s) before ANY attack lands to parry it: from any side, in the air, guard breakers, shots and Rift Arts too. No damage, a melee attacker is staggered and you can punish at once. Pressing again within 3/4 s only guards, a perfect block that catches nothing costs a little Rift gauge, and throws still beat it.' },
  { name: 'Dodge', input: 'DODGE', notes: 'Roll out of the way. Invulnerable for the first part of the roll.' },
];

/** Panel sections in display order. Each move's kind picks its section. */
const SECTIONS: { title: string; kinds: string[] }[] = [
  { title: 'Normals', kinds: ['normal', 'heavy', 'launcher'] },
  { title: 'Specials', kinds: ['special', 'dodge'] },
  { title: 'Air', kinds: ['air', 'plunge'] },
  { title: 'Throws', kinds: ['throw'] },
  { title: 'EX and Rift Art', kinds: ['ex', 'art'] },
];

/** Kinds that need no tag on their row, because their section already says it. */
const PLAIN_KIND = new Set(['normal', 'special']);

/** Button glyphs: round face buttons for LIGHT, HEAVY and SPECIAL, word pills for the rest. */
const BUTTONS: Record<string, { cls: string; label: string; pill?: boolean }> = {
  LIGHT: { cls: 'ml-b-light', label: 'L' },
  HEAVY: { cls: 'ml-b-heavy', label: 'H' },
  SPECIAL: { cls: 'ml-b-special', label: 'S' },
  ART: { cls: 'ml-b-art', label: 'ART', pill: true },
  JUMP: { cls: 'ml-b-jump', label: 'JUMP', pill: true },
  DODGE: { cls: 'ml-b-dodge', label: 'DODGE', pill: true },
};

/** Tokens of the input notation: a (tag), a word, an arrow, `+`, `,`, another word, or any other character. */
const TOKEN = /\(([^)]*)\)|([A-Za-z]+)|([→←↓↑])|(\+)|(,)|([^\s])/g;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const isRec = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/** Renders a notation string as button glyphs. The text stays in aria-label, so the glyphs are decoration for screen readers. */
export function inputHtml(input: string): string {
  const out: string[] = [];
  for (const m of input.matchAll(TOKEN)) {
    const [, tag, word, arrow, plus, comma, other] = m;
    if (tag !== undefined) out.push(`<span class="ml-tag">${esc(tag.trim())}</span>`);
    else if (word !== undefined) {
      const b = BUTTONS[word.toUpperCase()];
      out.push(
        b
          ? `<span class="ml-btn ${b.cls}${b.pill ? ' ml-pill' : ''}" title="${word.toUpperCase()}">${b.label}</span>`
          : `<span class="ml-word">${esc(word)}</span>`,
      );
    } else if (arrow !== undefined) out.push(`<span class="ml-arrow">${arrow}</span>`);
    else if (plus !== undefined) out.push('<span class="ml-plus">+</span>');
    else if (comma !== undefined) out.push('<span class="ml-gap"></span>');
    else if (other !== undefined) out.push(`<span class="ml-word">${esc(other)}</span>`);
  }
  return `<span class="ml-input" role="img" aria-label="${esc(input)}">${out.join('')}</span>`;
}

/** Damage as shown: a number, the hits joined with slashes, or free text. */
function damageText(d: MoveEntry['damage']): string {
  if (typeof d === 'number') return String(d);
  if (typeof d === 'string') return d;
  if (Array.isArray(d)) return d.join(' / ');
  return '';
}

function parseList(raw: unknown, path: string): MoveList | null {
  if (!isRec(raw)) return null;
  const fromFile = /h(\d+)\.json$/.exec(path);
  const hero = typeof raw.hero === 'number' ? raw.hero : fromFile ? Number(fromFile[1]) : NaN;
  if (!Number.isInteger(hero)) return null;
  const moves: MoveEntry[] = (Array.isArray(raw.moves) ? raw.moves : []).filter(isRec).map((m) => {
    const dmg = m.damage;
    const damage: MoveEntry['damage'] =
      typeof dmg === 'number' || typeof dmg === 'string'
        ? dmg
        : Array.isArray(dmg)
          ? dmg.filter((n): n is number => typeof n === 'number')
          : undefined;
    return { name: str(m.name), input: str(m.input), kind: str(m.kind) || 'normal', damage, notes: str(m.notes) };
  });
  const combos: ComboEntry[] = (Array.isArray(raw.combos) ? raw.combos : [])
    .filter(isRec)
    .map((c) => ({ name: str(c.name), input: str(c.input), notes: str(c.notes) }));
  return { hero, name: str(raw.name), weapon: str(raw.weapon), style: str(raw.style), moves, combos };
}

/** Every `movelists/hNN.json`, read once. A missing file just means no list for that hero. */
const LISTS = new Map<number, MoveList>();
for (const [path, mod] of Object.entries(import.meta.glob('./movelists/h*.json', { eager: true }) as Record<string, unknown>)) {
  const raw = isRec(mod) && 'default' in mod ? mod.default : mod;
  const list = parseList(raw, path);
  if (list) LISTS.set(list.hero, list);
}

function rowHtml(name: string, input: string, notes: string, tag = '', dmg = ''): string {
  return `<li class="ml-row">
  <div class="ml-top"><span class="ml-name">${esc(name)}</span>${tag}${dmg}</div>
  ${inputHtml(input)}
  ${notes ? `<p class="ml-notes">${esc(notes)}</p>` : ''}
</li>`;
}

function sectionHtml(title: string, rows: string[]): string {
  return `<section class="ml-sec"><h3>${esc(title)}</h3><ul class="ml-list">${rows.join('')}</ul></section>`;
}

function bodyHtml(list: MoveList | undefined): string {
  const parts: string[] = [];
  if (list) {
    for (const sec of SECTIONS) {
      const rows = list.moves
        .filter((m) => sec.kinds.includes(m.kind) || (sec.title === 'Normals' && !SECTIONS.some((s) => s.kinds.includes(m.kind))))
        .map((m) => {
          const dmg = damageText(m.damage);
          const tag = PLAIN_KIND.has(m.kind) ? '' : `<span class="ml-kind">${esc(m.kind)}</span>`;
          const dmgHtml = dmg ? `<span class="ml-dmg" title="Damage per hit">${esc(dmg)} <small>dmg</small></span>` : '';
          return rowHtml(m.name, m.input, m.notes ?? '', tag, dmgHtml);
        });
      if (rows.length) parts.push(sectionHtml(sec.title, rows));
    }
    if (list.combos.length) parts.push(sectionHtml('Combos', list.combos.map((c) => rowHtml(c.name, c.input, c.notes ?? ''))));
  } else {
    parts.push('<p class="ml-empty">No move list for this hero yet.</p>');
  }
  parts.push(sectionHtml('General controls', GENERAL_CONTROLS.map((g) => rowHtml(g.name, g.input, g.notes))));
  return parts.join('');
}

/** The open panel, if any: showing a second one replaces it. */
let current: { close: (notify: boolean) => void } | null = null;

/**
 * Opens a hero's move list as a modal panel inside `root` (the #ui layer). Closes on Esc, on a tap or click outside the
 * panel, or on its Close button; `onClose` runs once for those closes. Opening while one is already up replaces it
 * without calling the old one's `onClose`.
 */
export function showMoveList(root: HTMLElement, heroId: number, onClose: () => void): void {
  current?.close(false);
  const list = LISTS.get(heroId);
  const name = list?.name || heroOf(heroId).name;
  const style = list?.style ?? '';
  const weapon = list?.weapon ?? '';

  const overlay = document.createElement('div');
  overlay.className = 'ml-overlay';
  overlay.innerHTML = `<div class="ml-panel" role="dialog" aria-modal="true" aria-labelledby="ml-title">
  <header class="ml-head">
    <div class="ml-id">
      <small>Move list</small>
      <h2 id="ml-title">${esc(name)}</h2>
      ${weapon ? `<p class="ml-weapon">${esc(weapon)}</p>` : ''}
    </div>
    <button type="button" class="ml-close" data-ml-close>Close</button>
  </header>
  ${style ? `<p class="ml-style">${esc(style)}</p>` : ''}
  <div class="ml-body">${bodyHtml(list)}</div>
</div>`;
  root.appendChild(overlay);

  const closeBtn = overlay.querySelector<HTMLButtonElement>('[data-ml-close]');
  const returnTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  let pressedOutside = false;
  let done = false;

  const close = (notify: boolean) => {
    if (done) return;
    done = true;
    window.removeEventListener('keydown', onKey, true);
    overlay.remove();
    if (current === handle) current = null;
    try {
      returnTo?.focus({ preventScroll: true });
    } catch {
      /* the element may be gone */
    }
    if (notify) onClose();
  };
  const handle = { close };

  // capture phase, so Esc never reaches the game's own key handling while the panel is up
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' || e.key === 'Esc') {
      e.preventDefault();
      e.stopPropagation();
      close(true);
    } else if (e.key === 'Tab') {
      // the Close button is the only control, so Tab keeps focus on it
      e.preventDefault();
      closeBtn?.focus({ preventScroll: true });
    }
  };
  window.addEventListener('keydown', onKey, true);

  // a drag that starts inside the panel and ends on the backdrop must not close it
  overlay.addEventListener('pointerdown', (e) => {
    pressedOutside = e.target === overlay;
  });
  overlay.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (t.closest('[data-ml-close]') || (pressedOutside && t === overlay)) close(true);
  });

  current = handle;
  closeBtn?.focus({ preventScroll: true });
}
