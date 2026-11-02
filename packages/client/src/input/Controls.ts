/**
 * Fighter input: keyboard (one player, or two sharing a keyboard), gamepads and touch (floating joystick + a thumb
 * cluster of seven tiles: two weapons, skill, jump, roll, heal and the Rift Art). Each local fighter reads one
 * InputSource per tick.
 *
 * The player prefs that shape input (read defensively, see controlPrefs()): `keys` (a solo keyboard remap), `touchScale`,
 * `touchOpacity` and `leftHanded` (the touch layout). Call refreshControls() after a Settings change so a match in
 * progress picks it up.
 */
import { Btn } from '@bladerift/shared';
import { prefs } from '../ui/prefs';

export interface Intent {
  moveX: number;
  moveY: number;
  buttons: number;
}

export type KeyScheme = 'solo' | 'p1' | 'p2';

export interface KeyMap {
  left: string[];
  right: string[];
  down: string[];
  jump: string[];
  a: string[];
  b: string[];
  skill: string[];
  roll: string[];
  heal: string[];
  special: string[];
}

/** A keyboard remap: per solo action, the KeyboardEvent.code values that replace its default keys (up to four). */
export type KeyOverrides = Partial<Record<keyof KeyMap, string[]>>;

export const KEYMAPS: Record<KeyScheme, KeyMap> = {
  solo: {
    left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'], down: ['KeyS', 'ArrowDown'], jump: ['KeyW', 'ArrowUp', 'Space'],
    a: ['KeyJ', 'KeyZ'], b: ['KeyK', 'KeyX'], skill: ['KeyL', 'KeyC'], roll: ['ShiftLeft', 'ShiftRight', 'KeyI'], heal: ['KeyH', 'KeyQ'],
    special: ['KeyU', 'KeyV', 'KeyE'],
  },
  p1: {
    left: ['KeyA'], right: ['KeyD'], down: ['KeyS'], jump: ['KeyW'], a: ['KeyF'], b: ['KeyG'], skill: ['KeyH'], roll: ['ShiftLeft'], heal: ['KeyR'],
    special: ['KeyT'],
  },
  p2: {
    left: ['ArrowLeft'], right: ['ArrowRight'], down: ['ArrowDown'], jump: ['ArrowUp'], a: ['Comma', 'Numpad1'], b: ['Period', 'Numpad2'],
    skill: ['Slash', 'Numpad3'], roll: ['ShiftRight', 'Numpad0'], heal: ['Quote', 'NumpadAdd'],
    special: ['Backslash', 'Numpad4', 'Enter'],
  },
};

/** Human-readable key names for the how-to screen. */
export const KEY_LABEL: Record<KeyScheme, Record<keyof KeyMap, string>> = {
  solo: { left: 'A / ←', right: 'D / →', down: 'S / ↓', jump: 'W / ↑ / Space', a: 'J', b: 'K', skill: 'L', roll: 'Shift', heal: 'H', special: 'U / E' },
  p1: { left: 'A', right: 'D', down: 'S', jump: 'W', a: 'F', b: 'G', skill: 'H', roll: 'Left Shift', heal: 'R', special: 'T' },
  p2: { left: '←', right: '→', down: '↓', jump: '↑', a: ', or Num 1', b: '. or Num 2', skill: '/ or Num 3', roll: 'Right Shift / Num 0', heal: "' or Num +", special: '\\ / Num 4 / Enter' },
};

/** Every key a fighter uses: none of them may scroll the page or press a focused button during a duel. */
const GAME_KEYS = new Set<string>(Object.values(KEYMAPS).flatMap((m) => Object.values(m).flat()));

const CODE_NAME: Record<string, string> = {
  ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', Space: 'Space', ShiftLeft: 'Left Shift', ShiftRight: 'Right Shift',
  ControlLeft: 'Left Ctrl', ControlRight: 'Right Ctrl', AltLeft: 'Left Alt', AltRight: 'Right Alt', Enter: 'Enter', NumpadEnter: 'Num Enter',
  NumpadAdd: 'Num +', NumpadSubtract: 'Num -', NumpadMultiply: 'Num *', NumpadDivide: 'Num /', NumpadDecimal: 'Num .', Comma: ',',
  Period: '.', Slash: '/', Backslash: '\\', Quote: "'", Semicolon: ';', BracketLeft: '[', BracketRight: ']', Minus: '-', Equal: '=',
  Backquote: '`', Tab: 'Tab', Backspace: 'Backspace',
};

/** A KeyboardEvent.code as a short key name for the how-to screen ('KeyW' is W, 'Numpad3' is Num 3). */
export function codeLabel(code: string): string {
  if (CODE_NAME[code]) return CODE_NAME[code];
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (/^Numpad[0-9]$/.test(code)) return `Num ${code.slice(6)}`;
  return code;
}

// ---------------------------------------------------------------- prefs

/** The control prefs, with defaults. */
export interface ControlPrefs {
  keys: KeyOverrides;
  /** Touch buttons and stick size, 0.6..1.6 (1 = the layout in hud.css). */
  touchScale: number;
  /** Touch button opacity, 0.2..1 (0.9 = the layout in hud.css). */
  touchOpacity: number;
  /** The stick on the right and the buttons on the left. */
  leftHanded: boolean;
}

const DEFAULT_TOUCH_OPACITY = 0.9;
const CODE = /^[A-Za-z0-9]{1,20}$/;

/** Only well-formed remaps survive: a known action, one to four plain key codes, no duplicates. Anything else is dropped. */
function parseKeys(v: unknown): KeyOverrides {
  const out: KeyOverrides = {};
  if (!v || typeof v !== 'object') return out;
  const rec = v as Record<string, unknown>;
  for (const action of Object.keys(KEYMAPS.solo) as (keyof KeyMap)[]) {
    const raw = rec[action];
    const arr: unknown[] = typeof raw === 'string' ? [raw] : Array.isArray(raw) ? raw : [];
    const codes = Array.from(new Set(arr.filter((c): c is string => typeof c === 'string' && CODE.test(c)))).slice(0, 4);
    if (codes.length) out[action] = codes;
  }
  return out;
}

/** The control prefs, read defensively: a missing, junk or out-of-range value falls back to its default. */
export function controlPrefs(): ControlPrefs {
  let p: Record<string, unknown> = {};
  try {
    p = (prefs() as unknown as Record<string, unknown>) ?? {};
  } catch {
    /* unreadable prefs: the defaults */
  }
  const num = (v: unknown, lo: number, hi: number, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d);
  return {
    keys: parseKeys(p.keys),
    touchScale: num(p.touchScale, 0.6, 1.6, 1),
    touchOpacity: num(p.touchOpacity, 0.2, 1, DEFAULT_TOUCH_OPACITY),
    leftHanded: p.leftHanded === true,
  };
}

/** The solo bindings with a remap merged over the defaults: an action the remap names uses its new keys only. */
function soloWith(keys: KeyOverrides): KeyMap {
  const m: KeyMap = { ...KEYMAPS.solo };
  for (const action of Object.keys(keys) as (keyof KeyMap)[]) {
    const codes = keys[action];
    if (codes) m[action] = codes;
  }
  return m;
}

/** The bindings in use now: the defaults with the solo remap merged over them (kept in sync by loadKeys()). */
let active: Record<KeyScheme, KeyMap> = KEYMAPS;

function loadKeys() {
  active = { ...KEYMAPS, solo: soloWith(controlPrefs().keys) };
  GAME_KEYS.clear();
  for (const m of Object.values(active)) for (const codes of Object.values(m)) for (const c of codes) GAME_KEYS.add(c);
}

/** The bindings a scheme uses now (the solo remap included). */
export function keyBindings(scheme: KeyScheme): KeyMap {
  return active[scheme];
}

/** How-to labels for a scheme. A remapped solo action is named from its key codes; the rest keep the hand-written names. */
export function keyLabels(scheme: KeyScheme): Record<keyof KeyMap, string> {
  const labels = { ...KEY_LABEL[scheme] };
  if (scheme !== 'solo') return labels;
  const remap = controlPrefs().keys;
  const m = soloWith(remap);
  for (const action of Object.keys(remap) as (keyof KeyMap)[]) labels[action] = m[action].map(codeLabel).join(' / ');
  return labels;
}

/**
 * Re-read the control prefs and apply them: the solo keyboard remap, and every touch layout on screen (size, opacity,
 * handedness). Call after a Settings change; a match in progress picks the change up at once.
 */
export function refreshControls() {
  loadKeys();
  for (const t of liveTouch) t.refresh();
}

/** The touch controls are mirrored (stick on the right): the HUD's side-of-screen maths must follow (see GameScene). */
export const touchLeftHanded = () => controlPrefs().leftHanded;

// ---------------------------------------------------------------- keyboard, pads, merge

const held = new Set<string>();
let keysBound = false;
function bindKeys() {
  if (keysBound) return;
  keysBound = true;
  addEventListener('keydown', (e) => {
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    held.add(e.code);
    if (document.body.dataset.screen === 'game' && GAME_KEYS.has(e.code)) {
      e.preventDefault();
      // a focused button would take Enter or Space as a click (the pause button, say)
      const a = document.activeElement;
      if (a instanceof HTMLButtonElement) a.blur();
    }
  });
  addEventListener('keyup', (e) => {
    held.delete(e.code);
    if (document.body.dataset.screen === 'game' && GAME_KEYS.has(e.code)) e.preventDefault();
  });
  addEventListener('blur', () => held.clear());
}

const any = (codes: string[]) => codes.some((c) => held.has(c));

export interface InputSource {
  read(): Intent;
  destroy(): void;
}

export class KeyboardSource implements InputSource {
  constructor(readonly scheme: KeyScheme) {
    bindKeys();
    // a new source takes the prefs as they stand now (a remap may have changed since the last match)
    loadKeys();
  }
  read(): Intent {
    const m = active[this.scheme];
    let b = 0;
    if (any(m.jump)) b |= Btn.Jump;
    if (any(m.a)) b |= Btn.A;
    if (any(m.b)) b |= Btn.B;
    if (any(m.skill)) b |= Btn.Skill;
    if (any(m.roll)) b |= Btn.Roll;
    if (any(m.heal)) b |= Btn.Heal;
    if (any(m.special)) b |= Btn.Special;
    return { moveX: (any(m.right) ? 1 : 0) - (any(m.left) ? 1 : 0), moveY: any(m.down) ? 1 : 0, buttons: b };
  }
  destroy() {}
}

export class GamepadSource implements InputSource {
  constructor(readonly index: number) {}
  read(): Intent {
    const p = navigator.getGamepads?.()[this.index];
    if (!p) return { moveX: 0, moveY: 0, buttons: 0 };
    const btn = (i: number) => !!p.buttons[i]?.pressed;
    let x = p.axes[0] ?? 0;
    let y = p.axes[1] ?? 0;
    if (Math.abs(x) < 0.25) x = 0;
    if (Math.abs(y) < 0.4) y = 0;
    if (btn(14)) x = -1;
    if (btn(15)) x = 1;
    if (btn(13)) y = 1;
    let b = 0;
    if (btn(0) || btn(12)) b |= Btn.Jump;
    if (btn(2)) b |= Btn.A;
    if (btn(3)) b |= Btn.B;
    if (btn(7) || btn(6)) b |= Btn.Special;
    if (btn(5)) b |= Btn.Skill;
    if (btn(1)) b |= Btn.Roll;
    if (btn(4)) b |= Btn.Heal;
    return { moveX: x, moveY: Math.max(0, y), buttons: b };
  }
  destroy() {}
}

/** Several sources merged (keyboard + gamepad for one player). */
export class MergedSource implements InputSource {
  constructor(private sources: InputSource[]) {}
  read(): Intent {
    let mx = 0;
    let my = 0;
    let b = 0;
    for (const s of this.sources) {
      const i = s.read();
      if (Math.abs(i.moveX) > Math.abs(mx)) mx = i.moveX;
      if (i.moveY > my) my = i.moveY;
      b |= i.buttons;
    }
    return { moveX: mx, moveY: my, buttons: b };
  }
  destroy() {
    for (const s of this.sources) s.destroy();
  }
}

// ---------------------------------------------------------------- touch

export interface TouchButtonState {
  aIcon: string;
  bIcon: string;
  skillIcon: string;
  artIcon: string;
  /** Cooldowns 0..1 (1 = just used). */
  skillCd: number;
  rollCd: number;
  /** An overheated ranged weapon cooling (1 = just overheated, 0 = ready): sweeps the attack buttons. */
  reload: number;
  /** The Sun Crescent recharging (1 = just thrown): sweeps the heavy button only. */
  crescent: number;
  flask: number;
  /** Rift gauge 0..1 (1 = the Art is ready). */
  rift: number;
}

// square, framed image tiles (the art carries the meaning; the two attacks share the hero's weapon art, so they carry a
// small caption: the light combo and the heavy strike)
const BUTTONS: { id: string; bit: number; label: string; cls: string }[] = [
  { id: 'a', bit: Btn.A, label: 'Light', cls: 'tb-a' },
  { id: 'b', bit: Btn.B, label: 'Heavy', cls: 'tb-b' },
  { id: 'skill', bit: Btn.Skill, label: '', cls: 'tb-skill' },
  { id: 'jump', bit: Btn.Jump, label: '', cls: 'tb-jump' },
  { id: 'roll', bit: Btn.Roll, label: '', cls: 'tb-roll' },
  { id: 'heal', bit: Btn.Heal, label: '', cls: 'tb-heal' },
  { id: 'art', bit: Btn.Special, label: '', cls: 'tb-art' },
];

/** A tile's column on the 3x3 grid, counted from the right as hud.css places it (mirrored when left-handed). */
const COLUMN: Record<string, number> = { a: 0, b: 0, heal: 0, skill: 1, jump: 1, art: 1, roll: 2 };

/** The first time a device's Art glows, one hint says how to use it. Kept in localStorage, guarded. */
const HINT_KEY = 'bladerift.hint.artHold.v1';
let hintShownThisPage = false;
function hintSeen(): boolean {
  if (hintShownThisPage) return true;
  try {
    return localStorage.getItem(HINT_KEY) === '1';
  } catch {
    return false;
  }
}
function markHintSeen() {
  hintShownThisPage = true;
  try {
    localStorage.setItem(HINT_KEY, '1');
  } catch {
    // storage blocked: the page-level flag still keeps it to once
  }
}

/** The stick's radius at scale 1 (px). */
const STICK_R = 46;
/** The stick's dead zone, with hysteresis: a resting thumb never creeps the hero along (it must pass STICK_ON to start
 * moving and fall under STICK_OFF to stop), and past it the push is rescaled so a firm push is a full run. */
const STICK_ON = 0.34;
const STICK_OFF = 0.24;
const STICK_FULL = 0.8;
/** The down push that reads as down (the stick's units: 1 = the full radius). */
const DOWN = 0.6;
/** A button held or tapped in the last CHORD_MS (ms) reads the stick with the looser thresholds below, so a push down
 * (launcher: down + Light) or forward (throw: forward + Heavy) lands together with the tap, even a frame late. */
const CHORD_MS = 160;
const CHORD_ON = 0.2;
const CHORD_DOWN = 0.3;
/** With a button in the chord, a push past the dead zone reads at least this firm (the sim turns and throws past 0.5). */
const CHORD_FWD = 0.6;

/** Every touch layout on screen, so refreshControls() can re-lay them out. */
const liveTouch = new Set<TouchSource>();

/** On-screen controls: a floating joystick on the left half, the thumb cluster on the right (mirrored when left-handed). */
export class TouchSource implements InputSource {
  readonly root: HTMLElement;
  private stick = { id: -1, ox: 0, oy: 0, x: 0, y: 0 };
  /** The stick is past its dead zone (see STICK_ON / STICK_OFF). */
  private moving = false;
  private pressed = new Map<number, number>();
  /** Buttons pressed since the last read: a tap quicker than a frame (down and up between two reads) still counts once. */
  private tapped = 0;
  /** performance.now() until which the chord thresholds apply (set by each button press, see CHORD_MS). */
  private chordUntil = 0;
  /** The control prefs in use (see refresh()). */
  private scale = 1;
  private opacity = DEFAULT_TOUCH_OPACITY;
  private left = false;
  /** The Art tile glows and the heal flask is empty: their own opacity rules win over the pref. */
  private artReady = false;
  private flaskEmpty = false;
  private zone: HTMLElement;
  private knob: HTMLElement;
  private base: HTMLElement;
  private arrow: HTMLElement;
  private hint: HTMLElement;
  private hintTimer = 0;
  private artWasReady = false;
  private btnEls = new Map<string, HTMLElement>();

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'touch';
    this.root.innerHTML = `<div class="stick-zone"><div class="stick-base">
        <i class="sd sd-u"></i><i class="sd sd-d"></i><i class="sd sd-l"></i><i class="sd sd-r"></i>
        <b class="stick-arrow"></b><div class="stick-knob"></div>
      </div></div>
      <div class="tbuttons">${BUTTONS.map((b) => `<div class="tb ${b.cls}" data-b="${b.id}"><i></i><span>${b.label}</span><em></em></div>`).join('')}</div>
      <div class="touch-hint" role="note">Hold the art tile when it glows</div>`;
    parent.appendChild(this.root);
    this.zone = this.root.querySelector<HTMLElement>('.stick-zone')!;
    this.knob = this.root.querySelector('.stick-knob')!;
    this.base = this.root.querySelector('.stick-base')!;
    this.arrow = this.root.querySelector('.stick-arrow')!;
    this.hint = this.root.querySelector('.touch-hint')!;
    for (const el of this.root.querySelectorAll<HTMLElement>('.tb')) this.btnEls.set(el.dataset.b!, el);
    const zone = this.zone;
    zone.addEventListener('pointerdown', (e) => {
      if (this.stick.id >= 0) return;
      zone.setPointerCapture(e.pointerId);
      this.stick = { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: 0, y: 0 };
      this.base.style.left = e.clientX + 'px';
      this.base.style.top = e.clientY + 'px';
      this.base.style.opacity = String(Math.min(1, this.opacity + 0.1));
      this.base.classList.add('on');
      e.preventDefault();
    });
    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.stick.id) return;
      const R = this.radius();
      let dx = e.clientX - this.stick.ox;
      let dy = e.clientY - this.stick.oy;
      const d = Math.hypot(dx, dy);
      if (d > R) {
        // the base follows a thumb that slides past its edge
        this.stick.ox += (dx / d) * (d - R);
        this.stick.oy += (dy / d) * (d - R);
        this.base.style.left = this.stick.ox + 'px';
        this.base.style.top = this.stick.oy + 'px';
        dx = (dx / d) * R;
        dy = (dy / d) * R;
      }
      this.stick.x = dx / R;
      this.stick.y = dy / R;
      // the knob sits in the base, which is scaled as a whole: its own offset is in unscaled px
      this.knob.style.transform = `translate(${dx / this.scale}px, ${dy / this.scale}px)`;
      this.aim(dx, dy);
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId !== this.stick.id) return;
      this.stick = { id: -1, ox: 0, oy: 0, x: 0, y: 0 };
      this.knob.style.transform = '';
      this.base.classList.remove('on', 'lit-l', 'lit-r', 'lit-d');
      this.base.style.opacity = this.stickRest();
    };
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);
    for (const b of BUTTONS) {
      const el = this.btnEls.get(b.id)!;
      el.addEventListener('pointerdown', (e) => {
        el.setPointerCapture(e.pointerId);
        this.pressed.set(e.pointerId, b.bit);
        this.tapped |= b.bit;
        this.chordUntil = performance.now() + CHORD_MS;
        el.classList.add('down');
        // .down is full opaque; the inline opacity would hide it, so it is set back on release
        el.style.opacity = '1';
        this.ripple(el, e);
        navigator.vibrate?.(8);
        e.preventDefault();
      });
      const up = (e: PointerEvent) => {
        if (!this.pressed.has(e.pointerId)) return;
        this.pressed.delete(e.pointerId);
        if (![...this.pressed.values()].includes(b.bit)) {
          el.classList.remove('down');
          this.setRest(b.id);
        }
      };
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
    }
    liveTouch.add(this);
    this.refresh();
  }

  /** Re-read the control prefs (size, opacity, handedness) and lay the touch controls out again. */
  refresh() {
    const cp = controlPrefs();
    this.scale = cp.touchScale;
    this.opacity = cp.touchOpacity;
    this.left = cp.leftHanded;
    // a hook for the stylesheet (the hint's pointer and any other side-specific art)
    this.root.classList.toggle('lefty', this.left);
    // hud.css sizes a tile with --tb (and --step follows it); an inline value wins over that rule
    this.root.style.setProperty('--tb', `calc(clamp(56px, calc(var(--u) * 16.5), 74px) * ${this.scale})`);
    // the stick is scaled as a whole around its centre, which sits on the touch point
    this.base.style.setProperty('scale', String(this.scale));
    // mirror: the stick zone on the right; the cluster and the hint on the left, each tile keeping its row
    this.zone.style.left = this.left ? 'auto' : '';
    this.zone.style.right = this.left ? '0' : '';
    const cluster = this.root.querySelector<HTMLElement>('.tbuttons')!;
    cluster.style.left = this.left ? 'max(6px, env(safe-area-inset-left))' : '';
    cluster.style.right = this.left ? 'auto' : '';
    for (const b of BUTTONS) {
      const el = this.btnEls.get(b.id)!;
      const col = COLUMN[b.id] ?? 0;
      el.style.left = this.left ? (col ? `calc(var(--step) * ${col})` : '0') : '';
      el.style.right = this.left ? 'auto' : '';
      this.setRest(b.id);
    }
    this.hint.style.left = this.left ? 'calc(max(6px, env(safe-area-inset-left)) + var(--step))' : '';
    this.hint.style.right = this.left ? 'auto' : '';
    if (this.stick.id < 0) {
      this.base.style.left = this.left ? 'calc(100% - 18%)' : '';
      this.base.style.opacity = this.stickRest();
    }
  }

  /** The stick's opacity at rest (the base is faint until a thumb lands, as in styles.css at 0.9). */
  private stickRest(): string {
    return String(this.opacity * 0.55);
  }

  /** A tile's opacity at rest: the pref, except the glowing Art (full) and an empty flask (faded by styles.css). */
  private setRest(id: string) {
    const el = this.btnEls.get(id);
    if (!el || el.classList.contains('down')) return;
    const op = id === 'art' && this.artReady ? '' : id === 'heal' && this.flaskEmpty ? '' : String(this.opacity);
    if (el.style.opacity !== op) el.style.opacity = op;
  }

  private radius(): number {
    return STICK_R * this.scale;
  }

  /** A button held or tapped within CHORD_MS. */
  private chord(): boolean {
    return this.pressed.size > 0 || performance.now() < this.chordUntil;
  }

  /** The joystick shows where it reads: an arrow out to the knob, and the cardinal chevrons it lights. */
  private aim(dx: number, dy: number) {
    const mag = Math.min(1, Math.hypot(dx, dy) / this.radius());
    const deg = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
    this.arrow.style.transform = `rotate(${deg}deg)`;
    this.base.style.setProperty('--mag', mag.toFixed(2));
    const { x, y } = this.stick;
    this.base.classList.toggle('lit-l', x < -STICK_ON);
    this.base.classList.toggle('lit-r', x > STICK_ON);
    this.base.classList.toggle('lit-d', y > (this.chord() ? CHORD_DOWN : DOWN));
  }

  /** A soft ring from the press point, cleared when its animation ends. */
  private ripple(el: HTMLElement, e: PointerEvent) {
    const r = el.getBoundingClientRect();
    const ring = document.createElement('span');
    ring.className = 'tb-ripple';
    ring.style.left = `${e.clientX - r.left}px`;
    ring.style.top = `${e.clientY - r.top}px`;
    el.appendChild(ring);
    setTimeout(() => ring.remove(), 650);
  }

  private maybeHint() {
    if (hintSeen()) return;
    markHintSeen();
    this.hint.classList.add('on');
    window.clearTimeout(this.hintTimer);
    this.hintTimer = window.setTimeout(() => this.hint.classList.remove('on'), 5000);
  }

  read(): Intent {
    let b = this.tapped;
    this.tapped = 0;
    for (const bit of this.pressed.values()) b |= bit;
    const chord = this.chord();
    const ax = Math.abs(this.stick.x);
    this.moving = ax >= (this.moving ? STICK_OFF : chord ? CHORD_ON : STICK_ON);
    // past the dead zone: from a walk at the edge of it to a full run at STICK_FULL (never under the fighter's turn threshold)
    let x = 0;
    if (this.moving) {
      x = Math.sign(this.stick.x) * Math.min(1, 0.35 + (0.65 * Math.max(0, ax - STICK_OFF)) / (STICK_FULL - STICK_OFF));
      // a push with a button in the chord reads firm enough to turn and to throw
      if (chord) x = Math.sign(x) * Math.max(Math.abs(x), CHORD_FWD);
    }
    return { moveX: x, moveY: this.stick.y > (chord ? CHORD_DOWN : DOWN) ? 1 : 0, buttons: b };
  }

  /** Icons, cooldown sweeps and the flask count on the buttons. */
  show(s: TouchButtonState) {
    const set = (id: string, icon: string) => {
      const i = this.btnEls.get(id)!.querySelector('i')!;
      if (i.dataset.icon !== icon) {
        i.dataset.icon = icon;
        i.style.backgroundImage = icon ? `url(${icon})` : '';
      }
    };
    set('a', s.aIcon);
    set('b', s.bIcon);
    set('skill', s.skillIcon);
    set('art', s.artIcon);
    set('jump', 'assets/art/i-jump.jpg');
    set('roll', 'assets/art/i-roll.jpg');
    set('heal', 'assets/art/i-heal.jpg');
    const cd = (id: string, v: number) => this.btnEls.get(id)!.style.setProperty('--cd', String(Math.max(0, Math.min(1, v))));
    cd('skill', s.skillCd);
    cd('roll', s.rollCd);
    cd('a', s.reload);
    cd('b', Math.max(s.reload, s.crescent));
    // the Art tile fills from the bottom with the gauge and glows when ready
    const art = this.btnEls.get('art')!;
    art.style.setProperty('--fill', String(Math.max(0, Math.min(1, s.rift))));
    const ready = s.rift >= 1;
    art.classList.toggle('ready', ready);
    this.artReady = ready;
    this.setRest('art');
    // the readout: the charge while it fills, READY once it glows
    const artLabel = ready ? 'READY' : `${Math.floor(Math.max(0, Math.min(1, s.rift)) * 100)}%`;
    const artEm = art.querySelector('em')!;
    if (artEm.textContent !== artLabel) artEm.textContent = artLabel;
    if (ready && !this.artWasReady) this.maybeHint();
    this.artWasReady = ready;
    const heal = this.btnEls.get('heal')!;
    heal.querySelector('em')!.textContent = String(s.flask);
    heal.classList.toggle('empty', s.flask <= 0);
    this.flaskEmpty = s.flask <= 0;
    this.setRest('heal');
  }

  destroy() {
    window.clearTimeout(this.hintTimer);
    liveTouch.delete(this);
    this.root.remove();
  }
}

export const isTouchDevice = () => matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

loadKeys();
