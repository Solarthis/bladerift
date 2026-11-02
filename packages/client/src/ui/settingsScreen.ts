/**
 * Settings screen: four tabs (Audio, Video, Controls, Game) on one phone-first layout. Every value is a pref in
 * ui/prefs.ts and is saved on change. `onChange` gets the full prefs after each change, so the game applies them live.
 *
 * Keyboard remap works on the solo scheme (the one-player keys): click an action, press the new key, Esc cancels.
 * Pressing a key that another action uses swaps the two. Touch preview mirrors the real layout's size, opacity and
 * left-handed swap through the same CSS variables the game reads (see prefs.ts applyPrefsToDocument).
 */
import { KEYMAPS } from '../input/Controls';
import { updateReady } from '../update';
import { KEY_ACTIONS, KeyAction, Prefs, prefs, Quality, setPref, withKeyOverrides } from './prefs';
import './settings.css';

export interface SettingsOptions {
  /** Called with the full prefs after every change. */
  onChange: (p: Prefs) => void;
  /** The header's back button. */
  onBack: () => void;
  /** Release id shown in the Game tab. */
  version: string;
  /** Shows an update button in the Game tab when given (the caller runs the update check). */
  onUpdate?: () => void;
}

type Tab = 'audio' | 'video' | 'controls' | 'game';

const TABS: { id: Tab; label: string }[] = [
  { id: 'audio', label: 'Audio' },
  { id: 'video', label: 'Video' },
  { id: 'controls', label: 'Controls' },
  { id: 'game', label: 'Game' },
];

const ACTION_NAMES: Record<KeyAction, string> = {
  left: 'Move left',
  right: 'Move right',
  down: 'Down',
  jump: 'Jump',
  a: 'Light attack',
  b: 'Heavy attack',
  skill: 'Skill',
  roll: 'Roll',
  heal: 'Heal',
  special: 'Rift Art',
  block: 'Block / perfect block',
  stance: 'Stance (second weapon)',
};

const NUM_PREFS = ['volume', 'musicVol', 'sfxVol', 'voiceVol', 'shake', 'touchScale', 'touchOpacity'] as const;
const BOOL_PREFS = ['haptics', 'highRefresh', 'fullscreen', 'damageNumbers', 'faceMove', 'leftHanded'] as const;
type NumPref = (typeof NUM_PREFS)[number];
type BoolPref = (typeof BOOL_PREFS)[number];
const isNumPref = (k: string | undefined): k is NumPref => (NUM_PREFS as readonly string[]).includes(k ?? '');
const isBoolPref = (k: string | undefined): k is BoolPref => (BOOL_PREFS as readonly string[]).includes(k ?? '');

/** Keys that cannot be bound: browser, system and media keys. Escape is reserved for cancelling a rebind. */
const BLOCKED = new Set(['Tab', 'F5', 'F11', 'F12', 'MetaLeft', 'MetaRight', 'ContextMenu', 'AudioVolumeUp', 'AudioVolumeDown', 'AudioVolumeMute']);
const VALID_CODE = /^[A-Za-z0-9]{1,24}$/;

const KEY_NAMES: Record<string, string> = {
  ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', Space: 'Space', Enter: 'Enter', NumpadEnter: 'Num Enter',
  ShiftLeft: 'L Shift', ShiftRight: 'R Shift', ControlLeft: 'L Ctrl', ControlRight: 'R Ctrl', AltLeft: 'L Alt', AltRight: 'R Alt',
  Backspace: 'Backspace', CapsLock: 'Caps', Comma: ',', Period: '.', Slash: '/', Backslash: '\\', Quote: "'", Semicolon: ';',
  BracketLeft: '[', BracketRight: ']', Minus: '-', Equal: '=', Backquote: '`', NumpadAdd: 'Num +', NumpadSubtract: 'Num -',
  NumpadMultiply: 'Num *', NumpadDivide: 'Num /', NumpadDecimal: 'Num .',
};

/** Short label for a KeyboardEvent.code, as the player reads it on the keyboard. */
export function codeLabel(code: string): string {
  const named = KEY_NAMES[code];
  if (named) return named;
  const m = /^Key([A-Z])$/.exec(code) ?? /^Digit([0-9])$/.exec(code);
  if (m) return m[1];
  const n = /^Numpad([0-9])$/.exec(code);
  if (n) return `Num ${n[1]}`;
  return code;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const pct = (v: number) => `${Math.round(v * 100)}%`;

function slider(pref: NumPref, name: string, note: string, min: number, max: number, step: number, value: number): string {
  return `<div class="st-row">
    <label class="st-name" for="st-${pref}">${name}${note ? `<small>${note}</small>` : ''}</label>
    <div class="st-ctl"><input id="st-${pref}" type="range" min="${min}" max="${max}" step="${step}" value="${value}" data-pref="${pref}"><output>${pct(value)}</output></div>
  </div>`;
}

function check(pref: BoolPref, name: string, note: string, value: boolean): string {
  return `<label class="st-row st-check">
    <span class="st-name">${name}${note ? `<small>${note}</small>` : ''}</span>
    <input type="checkbox" data-pref="${pref}" ${value ? 'checked' : ''}>
  </label>`;
}

function qualitySeg(q: Quality): string {
  const btn = (id: Quality, label: string) =>
    `<button type="button" data-q="${id}" class="${q === id ? 'on' : ''}" aria-pressed="${q === id}">${label}</button>`;
  return `<div class="st-row">
    <span class="st-name">Graphics quality<small>Low trims background and particle work for a steadier frame rate</small></span>
    <div class="st-seg" role="group" aria-label="Graphics quality">${btn('high', 'High')}${btn('low', 'Low')}</div>
  </div>`;
}

function audioTab(p: Prefs): string {
  return `<section class="card st-card"><h3>Volume</h3>
    ${slider('volume', 'Master', 'Scales every channel below', 0, 1, 0.05, p.volume)}
    ${slider('musicVol', 'Music', 'Menus and stage tracks', 0, 1, 0.05, p.musicVol)}
    ${slider('sfxVol', 'Effects', 'Hits, moves and footsteps', 0, 1, 0.05, p.sfxVol)}
    ${slider('voiceVol', 'Voice', 'Announcer: rounds, KO and results', 0, 1, 0.05, p.voiceVol)}
  </section>`;
}

function videoTab(p: Prefs): string {
  const hint = p.qualityHint && p.quality !== 'low'
    ? `<div class="st-note st-hint"><span>This phone dropped frames in a match. Low keeps the game smooth.</span><button type="button" data-act="use-low">Use Low</button></div>`
    : '';
  return `<section class="card st-card"><h3>Picture</h3>
    ${hint}
    ${qualitySeg(p.quality)}
    ${slider('shake', 'Screen shake', 'Explosions, hits and recoil', 0, 1, 0.1, p.shake)}
    ${check('highRefresh', 'High refresh rate', 'Every frame on 90-144 Hz screens. Uses more battery', p.highRefresh)}
    ${check('fullscreen', 'Fullscreen in matches', 'Android: fullscreen and landscape on the first tap', p.fullscreen)}
    ${check('damageNumbers', 'Damage numbers', 'Floating numbers on hits you deal', p.damageNumbers)}
  </section>`;
}

/** Touch preview: a stick and a 3x3 cluster of the seven buttons, scaled and faded with the same prefs. */
const PREVIEW_CELLS = ['Heal', 'Art', 'Skill', 'Roll', 'B', 'Jump', '', 'A', ''];

function touchPreview(p: Prefs): string {
  const cells = PREVIEW_CELLS.map((c) => (c ? `<span>${c}</span>` : '<span class="empty"></span>')).join('');
  return `<div class="st-pv${p.leftHanded ? ' lh' : ''}" style="--touch-scale:${p.touchScale};--touch-opacity:${p.touchOpacity}" aria-hidden="true">
    <div class="st-pv-stick"></div>
    <div class="st-pv-grid">${cells}</div>
  </div>`;
}

function keysCard(pending: KeyAction | null, note: string): string {
  const eff = withKeyOverrides(KEYMAPS.solo);
  const binds = KEY_ACTIONS.map((a) => {
    const codes = eff[a];
    const waiting = pending === a;
    const label = `${ACTION_NAMES[a]}, now ${codeLabel(codes[0])}. Press to change`;
    const alts = codes.length > 1 ? `<small>also ${codes.slice(1).map(codeLabel).map(esc).join(', ')}</small>` : '';
    return `<button type="button" class="st-bind${waiting ? ' wait' : ''}" data-bind="${a}" aria-label="${esc(label)}">
      <span class="st-bname">${ACTION_NAMES[a]}</span>
      <span class="st-bkey">${waiting ? 'Press a key…' : `<b>${esc(codeLabel(codes[0]))}</b>`}</span>
      ${waiting ? '' : alts}
    </button>`;
  }).join('');
  return `<section class="card st-card"><h3>Keyboard</h3>
    <p class="st-help">${pending ? 'Press the new key. Esc cancels.' : 'Select an action, then press the key for it. Two-player keys stay as they are.'}</p>
    ${note ? `<div class="st-note" role="status"><span>${esc(note)}</span></div>` : ''}
    <div class="st-binds">${binds}</div>
    <div class="st-actions"><button type="button" data-act="reset-keys">Reset to defaults</button></div>
  </section>`;
}

function touchCard(p: Prefs): string {
  return `<section class="card st-card"><h3>Touch</h3>
    ${slider('touchScale', 'Size', 'Stick and buttons', 0.8, 1.3, 0.05, p.touchScale)}
    ${slider('touchOpacity', 'Opacity', 'How solid the controls look', 0.3, 1, 0.05, p.touchOpacity)}
    ${check('leftHanded', 'Left-handed', 'Swap the stick and the buttons', p.leftHanded)}
    ${check('faceMove', 'Face where I run', 'When not aiming, turn to the way you move', p.faceMove)}
    ${touchPreview(p)}
  </section>`;
}

function gameTab(p: Prefs, opts: SettingsOptions): string {
  const update = opts.onUpdate
    ? `<button type="button" class="update-btn inline${updateReady() ? ' ready' : ''}" data-act="update">${updateReady() ? 'Update ready' : 'Update game'}</button>`
    : '';
  return `<section class="card st-card"><h3>Feedback</h3>
    ${check('haptics', 'Vibration', 'Bursts, hits and shield cracks. iPhone ignores it', p.haptics)}
  </section>
  <section class="card st-card"><h3>About</h3>
    <div class="st-row"><span class="st-name">Version <b>${esc(opts.version)}</b></span>${update}</div>
    <p class="st-credits">Music, voice and sounds: Kenney, Emma_MA, beardalaxy, Juhani Junkala, HydroGene, nene, MintoDog,
      cynicmusic, pmiller, StarNinjas, BMacZero, artisticdude, PagDev, untamedpixels (CC0). "K.O." and "Continue" voice:
      Alba MacKenna, CC-BY 4.0. Effects: PixelFX (MIT), after Hugo Duprez's Sprite Fusion VFX.</p>
  </section>`;
}

/**
 * Mounts the settings screen into `root` (its content is replaced; root should be a positioned box, such as #ui).
 * Returns destroy(), which removes every listener and clears root.
 */
export function mountSettings(root: HTMLElement, opts: SettingsOptions): { destroy(): void } {
  const ac = new AbortController();
  const signal = ac.signal;
  let tab: Tab = 'audio';
  /** The action waiting for a key, or null. */
  let pending: KeyAction | null = null;
  /** A message under the keyboard list (a blocked key). */
  let note = '';

  root.innerHTML = `<div class="st">
    <div class="hdr"><button class="back" data-act="back" aria-label="Back">‹</button><h2>Settings</h2></div>
    <nav class="st-tabs" role="tablist" aria-label="Settings sections"></nav>
    <div class="st-body"></div>
  </div>`;
  const tabsEl = root.querySelector<HTMLElement>('.st-tabs')!;
  const bodyEl = root.querySelector<HTMLElement>('.st-body')!;

  const emit = () => opts.onChange(prefs());
  const set = <K extends keyof Prefs>(k: K, v: Prefs[K]) => {
    setPref(k, v);
    emit();
  };

  const paintTabs = () => {
    tabsEl.innerHTML = TABS.map(
      (t) => `<button type="button" role="tab" class="st-tab${tab === t.id ? ' on' : ''}" data-tab="${t.id}" aria-selected="${tab === t.id}">${t.label}</button>`,
    ).join('');
  };

  const paintBody = () => {
    const p = prefs();
    bodyEl.innerHTML =
      tab === 'audio' ? audioTab(p)
      : tab === 'video' ? videoTab(p)
      : tab === 'controls' ? keysCard(pending, note) + touchCard(p)
      : gameTab(p, opts);
  };

  const paintPreview = () => {
    const pv = root.querySelector<HTMLElement>('.st-pv');
    if (!pv) return;
    const p = prefs();
    pv.style.setProperty('--touch-scale', String(p.touchScale));
    pv.style.setProperty('--touch-opacity', String(p.touchOpacity));
    pv.classList.toggle('lh', p.leftHanded);
  };

  /** Quality buttons and the suggestion note, updated in place (no re-render, so the focus stays put). */
  const paintQuality = () => {
    const q = prefs().quality;
    root.querySelectorAll<HTMLElement>('[data-q]').forEach((b) => {
      const on = b.dataset.q === q;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
    });
    if (q === 'low') root.querySelector('.st-hint')?.remove();
  };

  /** Swap semantics: the new key takes the action's place, and a key another action had gives up its old key. */
  const bindKey = (action: KeyAction, code: string) => {
    const eff = withKeyOverrides(KEYMAPS.solo);
    const old = eff[action][0];
    const keys: Prefs['keys'] = { ...prefs().keys };
    for (const other of KEY_ACTIONS) {
      if (other === action || !eff[other].includes(code)) continue;
      keys[other] = [...new Set(eff[other].map((c) => (c === code ? old : c)))];
    }
    keys[action] = [code, ...eff[action].filter((c) => c !== code && c !== old)];
    set('keys', keys);
  };

  root.addEventListener(
    'click',
    (e) => {
      const t = (e.target as HTMLElement).closest<HTMLElement>('[data-tab],[data-q],[data-bind],[data-act]');
      if (!t || !root.contains(t)) return;
      if (t.dataset.tab) {
        tab = t.dataset.tab as Tab;
        pending = null;
        note = '';
        paintTabs();
        paintBody();
        return;
      }
      if (t.dataset.q) {
        const q: Quality = t.dataset.q === 'low' ? 'low' : 'high';
        setPref('quality', q);
        if (q === 'low') setPref('qualityHint', false);
        emit();
        paintQuality();
        return;
      }
      if (t.dataset.bind) {
        const a = t.dataset.bind as KeyAction;
        pending = pending === a ? null : a;
        note = '';
        paintBody();
        return;
      }
      switch (t.dataset.act) {
        case 'back':
          opts.onBack();
          break;
        case 'update':
          opts.onUpdate?.();
          break;
        case 'use-low':
          setPref('quality', 'low');
          setPref('qualityHint', false);
          emit();
          paintQuality();
          break;
        case 'reset-keys':
          pending = null;
          note = '';
          set('keys', {});
          paintBody();
          break;
      }
    },
    { signal },
  );

  root.addEventListener(
    'input',
    (e) => {
      const el = e.target as HTMLInputElement;
      const k = el.dataset.pref;
      if (!isNumPref(k) || el.type !== 'range') return;
      const v = Number(el.value);
      const out = el.parentElement?.querySelector('output');
      if (out) out.textContent = pct(v);
      set(k, v);
      if (k === 'touchScale' || k === 'touchOpacity') paintPreview();
    },
    { signal },
  );

  root.addEventListener(
    'change',
    (e) => {
      const el = e.target as HTMLInputElement;
      const k = el.dataset.pref;
      if (el.type !== 'checkbox' || !isBoolPref(k)) return;
      set(k, el.checked);
      if (k === 'leftHanded') paintPreview();
    },
    { signal },
  );

  // while an action waits for a key, the next key press is the binding; this runs before the game's own key listeners
  window.addEventListener(
    'keydown',
    (e) => {
      const action = pending;
      if (action === null) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.repeat) return;
      if (e.code === 'Escape') {
        pending = null;
        note = '';
        paintBody();
        return;
      }
      if (!VALID_CODE.test(e.code) || BLOCKED.has(e.code)) {
        note = 'That key cannot be used. Try another.';
        paintBody();
        return;
      }
      pending = null;
      note = '';
      bindKey(action, e.code);
      paintBody();
    },
    { capture: true, signal },
  );

  paintTabs();
  paintBody();

  return {
    destroy() {
      ac.abort();
      root.innerHTML = '';
    },
  };
}
