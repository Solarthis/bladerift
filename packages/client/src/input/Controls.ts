/**
 * Fighter input: keyboard (one player, or two sharing a keyboard), gamepads and touch (floating joystick + a thumb
 * cluster of seven tiles: two weapons, skill, jump, roll, heal and the Rift Art). Each local fighter reads one
 * InputSource per tick.
 */
import { Btn } from '@bladerift/shared';

export interface Intent {
  moveX: number;
  moveY: number;
  buttons: number;
}

export type KeyScheme = 'solo' | 'p1' | 'p2';

interface KeyMap {
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
  }
  read(): Intent {
    const m = KEYMAPS[this.scheme];
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

const STICK_R = 46;
/** The stick's dead zone, with hysteresis: a resting thumb never creeps the hero along (it must pass STICK_ON to start
 * moving and fall under STICK_OFF to stop), and past it the push is rescaled so a firm push is a full run. */
const STICK_ON = 0.34;
const STICK_OFF = 0.24;
const STICK_FULL = 0.8;

/** On-screen controls: a floating joystick on the left half, the thumb cluster on the right. */
export class TouchSource implements InputSource {
  readonly root: HTMLElement;
  private stick = { id: -1, ox: 0, oy: 0, x: 0, y: 0 };
  /** The stick is past its dead zone (see STICK_ON / STICK_OFF). */
  private moving = false;
  private pressed = new Map<number, number>();
  /** Buttons pressed since the last read: a tap quicker than a frame (down and up between two reads) still counts once. */
  private tapped = 0;
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
    this.knob = this.root.querySelector('.stick-knob')!;
    this.base = this.root.querySelector('.stick-base')!;
    this.arrow = this.root.querySelector('.stick-arrow')!;
    this.hint = this.root.querySelector('.touch-hint')!;
    for (const el of this.root.querySelectorAll<HTMLElement>('.tb')) this.btnEls.set(el.dataset.b!, el);
    const zone = this.root.querySelector<HTMLElement>('.stick-zone')!;
    zone.addEventListener('pointerdown', (e) => {
      if (this.stick.id >= 0) return;
      zone.setPointerCapture(e.pointerId);
      this.stick = { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: 0, y: 0 };
      this.base.style.left = e.clientX + 'px';
      this.base.style.top = e.clientY + 'px';
      this.base.classList.add('on');
      e.preventDefault();
    });
    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.stick.id) return;
      let dx = e.clientX - this.stick.ox;
      let dy = e.clientY - this.stick.oy;
      const d = Math.hypot(dx, dy);
      if (d > STICK_R) {
        // the base follows a thumb that slides past its edge
        this.stick.ox += (dx / d) * (d - STICK_R);
        this.stick.oy += (dy / d) * (d - STICK_R);
        this.base.style.left = this.stick.ox + 'px';
        this.base.style.top = this.stick.oy + 'px';
        dx = (dx / d) * STICK_R;
        dy = (dy / d) * STICK_R;
      }
      this.stick.x = dx / STICK_R;
      this.stick.y = dy / STICK_R;
      this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
      this.aim(dx, dy);
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId !== this.stick.id) return;
      this.stick = { id: -1, ox: 0, oy: 0, x: 0, y: 0 };
      this.knob.style.transform = '';
      this.base.classList.remove('on', 'lit-l', 'lit-r', 'lit-d');
    };
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);
    for (const b of BUTTONS) {
      const el = this.btnEls.get(b.id)!;
      el.addEventListener('pointerdown', (e) => {
        el.setPointerCapture(e.pointerId);
        this.pressed.set(e.pointerId, b.bit);
        this.tapped |= b.bit;
        el.classList.add('down');
        this.ripple(el, e);
        navigator.vibrate?.(8);
        e.preventDefault();
      });
      const up = (e: PointerEvent) => {
        if (!this.pressed.has(e.pointerId)) return;
        this.pressed.delete(e.pointerId);
        if (![...this.pressed.values()].includes(b.bit)) el.classList.remove('down');
      };
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
    }
  }

  /** The joystick shows where it reads: an arrow out to the knob, and the cardinal chevrons it lights. */
  private aim(dx: number, dy: number) {
    const mag = Math.min(1, Math.hypot(dx, dy) / STICK_R);
    const deg = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
    this.arrow.style.transform = `rotate(${deg}deg)`;
    this.base.style.setProperty('--mag', mag.toFixed(2));
    const { x, y } = this.stick;
    this.base.classList.toggle('lit-l', x < -STICK_ON);
    this.base.classList.toggle('lit-r', x > STICK_ON);
    this.base.classList.toggle('lit-d', y > 0.6);
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
    const ax = Math.abs(this.stick.x);
    this.moving = ax >= (this.moving ? STICK_OFF : STICK_ON);
    // past the dead zone: from a walk at the edge of it to a full run at STICK_FULL (never under the fighter's turn threshold)
    const x = this.moving ? Math.sign(this.stick.x) * Math.min(1, 0.35 + (0.65 * Math.max(0, ax - STICK_OFF)) / (STICK_FULL - STICK_OFF)) : 0;
    return { moveX: x, moveY: this.stick.y > 0.6 ? 1 : 0, buttons: b };
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
    // the readout: the charge while it fills, READY once it glows
    const artLabel = ready ? 'READY' : `${Math.floor(Math.max(0, Math.min(1, s.rift)) * 100)}%`;
    const artEm = art.querySelector('em')!;
    if (artEm.textContent !== artLabel) artEm.textContent = artLabel;
    if (ready && !this.artWasReady) this.maybeHint();
    this.artWasReady = ready;
    const heal = this.btnEls.get('heal')!;
    heal.querySelector('em')!.textContent = String(s.flask);
    heal.classList.toggle('empty', s.flask <= 0);
  }

  destroy() {
    window.clearTimeout(this.hintTimer);
    this.root.remove();
  }
}

export const isTouchDevice = () => matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
