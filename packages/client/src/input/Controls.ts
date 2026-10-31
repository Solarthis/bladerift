/**
 * Fighter input: keyboard (one player, or two sharing a keyboard), gamepads and touch (floating joystick + a thumb
 * cluster of six buttons, like the reference: two weapons, skill, jump, roll, heal). Each local fighter reads one
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
}

export const KEYMAPS: Record<KeyScheme, KeyMap> = {
  solo: {
    left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'], down: ['KeyS', 'ArrowDown'], jump: ['KeyW', 'ArrowUp', 'Space'],
    a: ['KeyJ', 'KeyZ'], b: ['KeyK', 'KeyX'], skill: ['KeyL', 'KeyC'], roll: ['ShiftLeft', 'ShiftRight', 'KeyI'], heal: ['KeyH', 'KeyQ'],
  },
  p1: {
    left: ['KeyA'], right: ['KeyD'], down: ['KeyS'], jump: ['KeyW'], a: ['KeyF'], b: ['KeyG'], skill: ['KeyH'], roll: ['ShiftLeft'], heal: ['KeyR'],
  },
  p2: {
    left: ['ArrowLeft'], right: ['ArrowRight'], down: ['ArrowDown'], jump: ['ArrowUp'], a: ['Comma', 'Numpad1'], b: ['Period', 'Numpad2'],
    skill: ['Slash', 'Numpad3'], roll: ['ShiftRight', 'Numpad0'], heal: ['Quote', 'NumpadAdd'],
  },
};

/** Human-readable key names for the how-to screen. */
export const KEY_LABEL: Record<KeyScheme, Record<keyof KeyMap, string>> = {
  solo: { left: 'A / ←', right: 'D / →', down: 'S / ↓', jump: 'W / ↑ / Space', a: 'J', b: 'K', skill: 'L', roll: 'Shift', heal: 'H' },
  p1: { left: 'A', right: 'D', down: 'S', jump: 'W', a: 'F', b: 'G', skill: 'H', roll: 'Left Shift', heal: 'R' },
  p2: { left: '←', right: '→', down: '↓', jump: '↑', a: ', or Num 1', b: '. or Num 2', skill: '/ or Num 3', roll: 'Right Shift / Num 0', heal: "' or Num +" },
};

const held = new Set<string>();
let keysBound = false;
function bindKeys() {
  if (keysBound) return;
  keysBound = true;
  addEventListener('keydown', (e) => {
    if ((e.target as HTMLElement | null)?.tagName === 'INPUT') return;
    held.add(e.code);
    if (document.body.dataset.screen === 'game' && (e.code.startsWith('Arrow') || e.code === 'Space')) e.preventDefault();
  });
  addEventListener('keyup', (e) => held.delete(e.code));
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
    if (btn(2) || btn(7)) b |= Btn.A;
    if (btn(3) || btn(6)) b |= Btn.B;
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
  /** Cooldowns 0..1 (1 = just used). */
  skillCd: number;
  rollCd: number;
  flask: number;
}

const BUTTONS: { id: string; bit: number; label: string; cls: string }[] = [
  { id: 'a', bit: Btn.A, label: '', cls: 'tb-a' },
  { id: 'b', bit: Btn.B, label: '', cls: 'tb-b' },
  { id: 'skill', bit: Btn.Skill, label: '', cls: 'tb-skill' },
  { id: 'jump', bit: Btn.Jump, label: 'JUMP', cls: 'tb-jump' },
  { id: 'roll', bit: Btn.Roll, label: 'ROLL', cls: 'tb-roll' },
  { id: 'heal', bit: Btn.Heal, label: '', cls: 'tb-heal' },
];

/** On-screen controls: a floating joystick on the left half, six buttons on the right. */
export class TouchSource implements InputSource {
  readonly root: HTMLElement;
  private stick = { id: -1, ox: 0, oy: 0, x: 0, y: 0 };
  private pressed = new Map<number, number>();
  private knob: HTMLElement;
  private base: HTMLElement;
  private btnEls = new Map<string, HTMLElement>();

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'touch';
    this.root.innerHTML = `<div class="stick-zone"><div class="stick-base"><div class="stick-knob"></div></div></div>
      <div class="tbuttons">${BUTTONS.map((b) => `<div class="tb ${b.cls}" data-b="${b.id}"><i></i><span>${b.label}</span><em></em></div>`).join('')}</div>`;
    parent.appendChild(this.root);
    this.knob = this.root.querySelector('.stick-knob')!;
    this.base = this.root.querySelector('.stick-base')!;
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
      const R = 46;
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
      this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId !== this.stick.id) return;
      this.stick = { id: -1, ox: 0, oy: 0, x: 0, y: 0 };
      this.knob.style.transform = '';
      this.base.classList.remove('on');
    };
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);
    for (const b of BUTTONS) {
      const el = this.btnEls.get(b.id)!;
      el.addEventListener('pointerdown', (e) => {
        el.setPointerCapture(e.pointerId);
        this.pressed.set(e.pointerId, b.bit);
        el.classList.add('down');
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

  read(): Intent {
    let b = 0;
    for (const bit of this.pressed.values()) b |= bit;
    const x = Math.abs(this.stick.x) < 0.22 ? 0 : this.stick.x;
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
    set('heal', 'assets/art/i-flask.png');
    const cd = (id: string, v: number) => this.btnEls.get(id)!.style.setProperty('--cd', String(Math.max(0, Math.min(1, v))));
    cd('skill', s.skillCd);
    cd('roll', s.rollCd);
    const heal = this.btnEls.get('heal')!;
    heal.querySelector('em')!.textContent = String(s.flask);
    heal.classList.toggle('empty', s.flask <= 0);
  }

  destroy() {
    this.root.remove();
  }
}

export const isTouchDevice = () => matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
