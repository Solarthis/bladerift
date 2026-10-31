/**
 * Rift Art cinematics: the MUGEN "super" staging (docs/feel/mugen-reference.md, groups C and F).
 *
 * GameScene calls these from its event cases; every call returns at once and cleans up after itself.
 *
 *   // 'art' event (the sim's ~45-tick superpause plays underneath it):
 *   playSuperCinematic(this, { casterId: e.p, heroId: v.hero, artId: e.art, x: v.x, y: v.y });
 *   // every 'hit' event by a fighter (a no-op unless that fighter cast a big Art in the last few seconds):
 *   superConnect(this, { attackerId: e.a, x: e.x, y: e.y });
 *   // every 'ko' event (white-out when an Art landed the finish, a short white flash otherwise):
 *   koCinematic(this, { x: v.x, y: v.y - 30, attackerId: e.a });
 *
 * Signatures:
 *   playSuperCinematic(scene, SuperOpts): CineHandle
 *     SuperOpts = { casterId, heroId, x, y, artId?, side?: 'left' | 'right', pauseMs? = 750, activeMs?, camera? }
 *   superConnect(scene, ConnectOpts): CineHandle | null
 *     ConnectOpts = { attackerId, x, y, ko?, force?, camera? }
 *   koCinematic(scene, KoOpts): CineHandle
 *     KoOpts = { x, y, attackerId?, whiteout?, camera? }
 *   preloadCinematic(heroId): void       (the HUD calls it when a fighter appears, so the cut-in bust is decoded early)
 *   cancelCinematics(scene?): void       (drops everything at once, e.g. on leaving a match)
 *   CineHandle = { done: Promise<void>  (the cut-in / beat is over), end: Promise<void> (every layer is gone), cancel() }
 *
 * `camera` is optional: anything with zoomTo(x, y, zoom, inMs, holdMs, outMs). Left out, the scene's own `zoomTo` is
 * used when GameScene has one (group D16); pass `camera: null` to keep the camera still.
 *
 * Super timeline (ms after the call; the cut-in ends with the superpause):
 *     0      hero-colour wash at 85% (radial: white-hot at the caster), the HUD panels hide, letterbox bars slide in
 *    40-300  the wash fades into the background dim (82% black with a 16% hero tint, under the fighters and FX)
 *     0-120  manga focus lines around the caster fade in and flicker
 *    70-250  the slanted cut-in panel slams in from the far side (portrait push-in, speed stripes), white flick at 250
 *   160-330  the Art name slams in (huge, italic, stroked, chromatic offset), the hero name slides under it
 *   600-780  panel, name, focus lines and bars slide out; the dim holds through the Art (activeMs), then fades 300 ms
 * Connect beat (big Arts only, once per cast): accent flash, a speed-line background takeover and a radial burst
 * behind the fighters for 700 ms (fade 200 ms), zoom 1.8x on the hit. A K.O. by the Art: 1.3 s white-out.
 */
import Phaser from 'phaser';
import { ARTS, ArtId, heroOf } from '@bladerift/shared';

// ------------------------------------------------------------------ public types

export interface CineCamera {
  zoomTo(x: number, y: number, zoom: number, inMs: number, holdMs: number, outMs: number): void;
}

export interface SuperOpts {
  /** The caster's fighter id (the 'art' event's `p`); connects and K.O.s are matched to the cast by it. */
  casterId: number;
  heroId: number;
  /** World position of the caster (its feet). */
  x: number;
  y: number;
  /** Defaults to the hero's own Art. */
  artId?: number;
  /** Where the cut-in panel goes; by default the screen half away from the caster. */
  side?: 'left' | 'right';
  /** Length of the superpause the cut-in fills (default 750 ms = 45 ticks). */
  pauseMs?: number;
  /** How long the background stays dim after the pause (default: the Art's own ticks, 400-2000 ms). */
  activeMs?: number;
  camera?: CineCamera | null;
}

export interface ConnectOpts {
  /** The 'hit' event's attacker id. */
  attackerId: number;
  /** World position of the hit. */
  x: number;
  y: number;
  /** This hit ends the round (a white-out follows). koCinematic does the same from the 'ko' event. */
  ko?: boolean;
  /** Play the beat even for a small Art, or with no cinematic before it. */
  force?: boolean;
  camera?: CineCamera | null;
}

export interface KoOpts {
  /** World position of the victim (the finishing hit). */
  x: number;
  y: number;
  /** The 'ko' event's attacker: a K.O. during that fighter's Art becomes a white-out. */
  attackerId?: number;
  /** Force the long white-out (true) or the short flash (false). */
  whiteout?: boolean;
  camera?: CineCamera | null;
}

export interface CineHandle {
  /** The cut-in (or beat) is over. */
  done: Promise<void>;
  /** Every layer, including the background dim, is gone. */
  end: Promise<void>;
  cancel(): void;
}

// ------------------------------------------------------------------ tuning

/** Arts whose first landed hit earns the background takeover. */
export const BIG_ARTS: ReadonlySet<number> = new Set<number>([
  ArtId.RadiantCleave, ArtId.VaultOfAges, ArtId.ThunderCall, ArtId.Stampede, ArtId.NightHunt, ArtId.PiercingFang,
  ArtId.PhantomHand, ArtId.FlashStep, ArtId.ChainsOfGenesis, ArtId.HailOfArrows,
]);

/** Depths in GameScene: the arena is at -1 and below, fighters at 7+, so these sit between them. */
const DEPTH_DIM = -0.5;
const DEPTH_TAKEOVER = -0.45;
const DEPTH_STREAKS = -0.44;
const DEPTH_BURST = -0.43;

const WASH_ALPHA = 0.85;
const DIM_ALPHA = 0.82;
/** A cast stays "live" for connects this long after its pause ends. */
const CONNECT_WINDOW_MS = 2600;

/** Dev only (?cine): stretches every duration, so screenshots land on exact beats. */
let timeScale = 1;
const T = (ms: number) => ms * timeScale;

// ------------------------------------------------------------------ small helpers

const hex = (rgb: number) => '#' + (rgb & 0xffffff).toString(16).padStart(6, '0');
const mix = (a: number, b: number, k: number) => {
  const ch = (s: number) => Math.round(((a >> s) & 255) * (1 - k) + ((b >> s) & 255) * k);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
};
const lighten = (c: number, k: number) => mix(c, 0xffffff, k);
const pad2 = (n: number) => String(n).padStart(2, '0');
/** Piecewise-linear value of a [t, v] track at time t. */
function track(t: number, pts: [number, number][]): number {
  if (t <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    const [t1, v1] = pts[i];
    if (t <= t1) {
      const [t0, v0] = pts[i - 1];
      return v0 + (v1 - v0) * ((t - t0) / (t1 - t0 || 1));
    }
  }
  return pts[pts.length - 1][1];
}
const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** A promise and its resolver. */
function latch(): { p: Promise<void>; open: () => void } {
  let open!: () => void;
  const p = new Promise<void>((r) => (open = r));
  return { p, open };
}

// ------------------------------------------------------------------ cut-in art

const cuts = new Map<number, HTMLImageElement>();

/** Starts loading the hero's transparent cut-in bust (assets/art/cut-XX.png); h-XX.jpg stands in until it loads. */
export function preloadCinematic(heroId: number) {
  const n = heroOf(heroId)?.portrait ?? heroId;
  if (cuts.has(n)) return;
  const img = new Image();
  img.decoding = 'async';
  img.src = `assets/art/cut-${pad2(n)}.png`;
  cuts.set(n, img);
}

function cutSrc(n: number): string | null {
  const img = cuts.get(n);
  return img && img.complete && img.naturalWidth > 0 ? img.src : null;
}

// ------------------------------------------------------------------ the HUD

let hudHolds = 0;
/** Hides the HUD panels (the `.cinematic` class on the HUD root, ui/hud.css) while any cinematic holds it. */
function holdHud(on: boolean) {
  hudHolds = Math.max(0, hudHolds + (on ? 1 : -1));
  document.querySelector('.hud')?.classList.toggle('cinematic', hudHolds > 0);
}

/** The DOM layer under the HUD and the touch controls (first child of #ui), created on demand. */
function domRoot(): HTMLElement {
  let root = document.querySelector<HTMLElement>('.cine-root');
  if (root && root.isConnected) return root;
  root = document.createElement('div');
  root.className = 'cine-root';
  root.setAttribute('aria-hidden', 'true');
  const ui = document.getElementById('ui') ?? document.body;
  ui.insertBefore(root, ui.firstChild);
  return root;
}

// ------------------------------------------------------------------ per-scene state

interface Cast {
  casterId: number;
  heroId: number;
  artId: number;
  accent: number;
  x: number;
  /** performance.now() of the cast, and when its connect window closes. */
  t0: number;
  until: number;
  connected: boolean;
  dim: Phaser.GameObjects.Rectangle | null;
  /** The background dim ends (drawn by the dim's ticker). */
  dimEnd: number;
}

type Ticker = (now: number, cam: Phaser.Cameras.Scene2D.Camera) => boolean;

interface SceneState {
  casts: Map<number, Cast>;
  tickers: Set<Ticker>;
  cleanups: Set<() => void>;
}

const states = new WeakMap<Phaser.Scene, SceneState>();
let lastScene: Phaser.Scene | null = null;

function stateOf(scene: Phaser.Scene): SceneState {
  let s = states.get(scene);
  if (s) return s;
  const st: SceneState = { casts: new Map(), tickers: new Set(), cleanups: new Set() };
  s = st;
  states.set(scene, st);
  // after GameScene.update, so the camera zoom of this frame is known
  const step = () => {
    const now = performance.now();
    const cam = scene.cameras.main;
    for (const t of [...st.tickers]) if (!t(now, cam)) st.tickers.delete(t);
  };
  scene.events.on(Phaser.Scenes.Events.POST_UPDATE, step);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    scene.events.off(Phaser.Scenes.Events.POST_UPDATE, step);
    clearState(st);
    states.delete(scene);
  });
  return st;
}

function clearState(st: SceneState) {
  for (const c of [...st.cleanups]) c();
  st.cleanups.clear();
  st.tickers.clear();
  st.casts.clear();
}

/** Drops every cinematic of the scene (or of the last scene used) at once. */
export function cancelCinematics(scene?: Phaser.Scene) {
  const sc = scene ?? lastScene;
  const st = sc ? states.get(sc) : undefined;
  if (st) clearState(st);
  hudHolds = 0;
  document.querySelector('.hud')?.classList.remove('cinematic');
  document.querySelector('.cine-root')?.replaceChildren();
}

function cameraOf(scene: Phaser.Scene, c: CineCamera | null | undefined): CineCamera | null {
  if (c === null) return null;
  if (c) return c;
  const z = (scene as unknown as { zoomTo?: CineCamera['zoomTo'] }).zoomTo;
  return typeof z === 'function' ? { zoomTo: z.bind(scene) } : null;
}

/** World point -> fraction of the screen (0..1). */
function toScreen(scene: Phaser.Scene, x: number, y: number) {
  const cam = scene.cameras.main;
  const wv = cam.worldView;
  const w = scene.scale.width || 1;
  const h = scene.scale.height || 1;
  if (!wv.width) return { fx: 0.5, fy: 0.6 };
  return { fx: Phaser.Math.Clamp(((x - wv.x) * cam.zoom) / w, 0.05, 0.95), fy: Phaser.Math.Clamp(((y - wv.y) * cam.zoom) / h, 0.1, 0.9) };
}

/**
 * A screen-fixed object that covers the view at any camera zoom: Phaser scales scroll-factor-0 objects about the view
 * centre, so they are placed there and counter-scaled every frame.
 */
function pinToScreen(o: Phaser.GameObjects.Components.Transform, scene: Phaser.Scene, cam: Phaser.Cameras.Scene2D.Camera) {
  o.setPosition(scene.scale.width / 2, scene.scale.height / 2);
  o.setScale(1 / (cam.zoom || 1));
}

/** Runs a WAAPI animation with the dev time scale; `at` and `dur` in ms. */
function play(el: Element, frames: Keyframe[], at: number, dur: number, easing = 'linear', extra: KeyframeAnimationOptions = {}) {
  return el.animate(frames, { delay: T(at), duration: T(dur), easing, fill: 'both', ...extra });
}

// ------------------------------------------------------------------ the super cinematic

export function playSuperCinematic(scene: Phaser.Scene, o: SuperOpts): CineHandle {
  lastScene = scene;
  const st = stateOf(scene);
  const hero = heroOf(o.heroId);
  const artId = o.artId ?? hero.art;
  const art = ARTS[artId];
  const accent = hero?.accent ?? 0xffffff;
  const pause = o.pauseMs ?? 750;
  const active = o.activeMs ?? Phaser.Math.Clamp(((art?.ticks ?? 40) / 60) * 1000, 400, 2000);
  const now = performance.now();
  const reduce = reducedMotion();

  // a second cast by the same fighter replaces the first; the other fighter's keeps its own dim
  st.casts.get(o.casterId)?.dim?.destroy();
  const cast: Cast = {
    casterId: o.casterId, heroId: o.heroId, artId, accent, x: o.x, t0: now,
    until: now + T(pause + Math.max(active, CONNECT_WINDOW_MS)), connected: false, dim: null, dimEnd: now + T(pause + active),
  };
  st.casts.set(o.casterId, cast);

  const done = latch();
  const end = latch();
  let alive = true;
  holdHud(true);
  let hudHeld = true;
  const releaseHud = () => {
    if (hudHeld) holdHud(false);
    hudHeld = false;
  };

  // ---- Phaser: the background dim (between the arena and the fighters)
  const w = scene.scale.width;
  const h = scene.scale.height;
  const dim = scene.add.rectangle(w / 2, h / 2, w, h, mix(0x000000, accent, 0.16), 1).setScrollFactor(0).setDepth(DEPTH_DIM).setAlpha(0);
  cast.dim = dim;
  const dimTick: Ticker = (t, cam) => {
    if (!dim.active) return false;
    pinToScreen(dim, scene, cam);
    dim.setSize(scene.scale.width, scene.scale.height);
    const e = cast.dimEnd - cast.t0;
    const k = (t - cast.t0) / (timeScale || 1);
    const ee = e / (timeScale || 1);
    dim.setAlpha(track(k, [[40, 0], [300, DIM_ALPHA], [ee, DIM_ALPHA], [ee + 300, 0]]));
    if (k > ee) releaseHud();
    if (k >= ee + 300) {
      finish();
      return false;
    }
    return true;
  };
  st.tickers.add(dimTick);

  // ---- DOM: wash, focus lines, bars, the cut-in panel, the Art name
  const { fx, fy } = toScreen(scene, o.x, o.y - 40);
  const side = o.side ?? (fx < 0.5 ? 'right' : 'left');
  const n = hero?.portrait ?? o.heroId;
  const bust = cutSrc(n);
  const portrait = `assets/art/h-${pad2(n)}.jpg`;
  const name = (art?.name ?? 'Rift Art').toUpperCase();
  const el = document.createElement('div');
  el.className = `cine cine-super ${side}${bust ? ' has-bust' : ''}`;
  el.style.setProperty('--ac', hex(accent));
  el.style.setProperty('--ac-hi', hex(lighten(accent, 0.55)));
  el.style.setProperty('--ac-lo', hex(mix(accent, 0x000000, 0.55)));
  el.style.setProperty('--ax', `${(fx * 100).toFixed(1)}%`);
  el.style.setProperty('--ay', `${(fy * 100).toFixed(1)}%`);
  el.innerHTML = `
    <div class="cine-wash"></div>
    <div class="cine-focus"><i></i></div>
    <div class="cine-bars"><i class="t"></i><i class="b"></i></div>
    <div class="cine-panel"><div class="cine-pbg"></div><div class="cine-pst"></div><div class="cine-pz"><img class="cine-pt" alt="" src="${bust ?? portrait}"></div></div>
    <div class="cine-title"><b data-t="${esc(name)}">${esc(name)}</b><small>${esc((hero?.name ?? '').toUpperCase())}</small></div>
    <div class="cine-flick"></div>`;
  domRoot().appendChild(el);
  const q = (s: string) => el.querySelector(s)!;
  const dir = side === 'right' ? 1 : -1;
  const out = Math.max(450, pause - 150);
  const fin = out + 180;
  const anims: Animation[] = [];
  const A = (...a: Parameters<typeof play>) => anims.push(play(...a));
  // wash: on at once, held 60 ms, gone by 300 ms
  const washPeak = reduce ? 0.45 : WASH_ALPHA;
  A(q('.cine-wash'), [{ opacity: washPeak }, { opacity: washPeak, offset: 0.2 }, { opacity: 0 }], 0, 300);
  // letterbox bars
  A(q('.cine-bars .t'), [{ transform: 'translateY(-100%)' }, { transform: 'none' }], 0, 140, 'cubic-bezier(.2,.8,.3,1)');
  A(q('.cine-bars .b'), [{ transform: 'translateY(100%)' }, { transform: 'none' }], 0, 140, 'cubic-bezier(.2,.8,.3,1)');
  A(q('.cine-bars'), [{ opacity: 1 }, { opacity: 0 }], out + 40, 140);
  // focus lines: fade in, flicker (a stepped twitch), fade out
  A(q('.cine-focus'), [{ opacity: 0 }, { opacity: 1, offset: 0.14 }, { opacity: 1, offset: 0.82 }, { opacity: 0 }], 0, fin - 20);
  if (!reduce) {
    const tw = (r: number, s: number) => ({ transform: `rotate(${r}deg) scale(${s})`, easing: 'steps(1, end)' });
    A(q('.cine-focus i'), [tw(0, 1), tw(2.2, 1.04), tw(-1.6, 0.98), tw(1, 1.02), tw(0, 1)], 0, 132, 'linear', { iterations: Math.ceil(fin / 132) + 1 });
  }
  // the panel: slams in with an overshoot, holds with a twitch, slides back out
  const off = `${dir * 125}%`;
  A(q('.cine-panel'), [
    { transform: `translateX(${off}) skewX(-12deg)`, opacity: 1 },
    { transform: `translateX(${off}) skewX(-12deg)`, offset: 70 / fin },
    { transform: `translateX(${-dir * 4}%) skewX(-12deg)`, offset: 230 / fin, easing: 'ease-out' },
    { transform: 'translateX(0) skewX(-12deg)', offset: 280 / fin },
    { transform: 'translateX(0) skewX(-12deg)', offset: out / fin, easing: 'cubic-bezier(.6,0,.9,.4)' },
    { transform: `translateX(${off}) skewX(-12deg)` },
  ], 0, fin);
  A(q('.cine-pt'), [{ scale: '1.02' }, { scale: '1.16' }], 70, fin - 70, 'cubic-bezier(.1,.6,.4,1)');
  A(q('.cine-pst'), [{ transform: 'translateX(0)' }, { transform: `translateX(${-dir * 240}px)` }], 0, 400, 'linear', { iterations: Math.ceil(fin / 400) + 1 });
  // the white flick as the panel lands
  A(q('.cine-flick'), [{ opacity: 0 }, { opacity: reduce ? 0.15 : 0.5, offset: 0.25 }, { opacity: 0 }], 230, 90);
  // the Art name: a slam with overshoot, then out sideways
  A(q('.cine-title b'), [
    { transform: 'skewX(-10deg) scale(2.8) rotate(-7deg)', opacity: 0 },
    { transform: 'skewX(-10deg) scale(0.93) rotate(0deg)', opacity: 1, offset: 0.55 },
    { transform: 'skewX(-10deg) scale(1.05)', opacity: 1, offset: 0.8 },
    { transform: 'skewX(-10deg) scale(1)', opacity: 1 },
  ], 160, 170, 'ease-out');
  A(q('.cine-title small'), [{ transform: `translateX(${dir * 40}%)`, opacity: 0 }, { transform: 'none', opacity: 1 }], 220, 120, 'ease-out');
  A(q('.cine-title'), [{ transform: 'none', opacity: 1 }, { transform: `translateX(${dir * 18}%)`, opacity: 0 }], out, 160, 'cubic-bezier(.6,0,.9,.4)');

  // ---- camera: push in on the caster for the pause
  cameraOf(scene, o.camera)?.zoomTo(o.x, o.y - 34, 1.5, T(100), T(Math.max(0, pause - 350)), T(250));

  const domGone = window.setTimeout(() => {
    el.remove();
    done.open();
  }, T(fin + 20));

  function finish() {
    if (!alive) return;
    alive = false;
    window.clearTimeout(domGone);
    for (const a of anims) a.cancel();
    el.remove();
    if (dim.active) dim.destroy();
    if (cast.dim === dim) cast.dim = null;
    releaseHud();
    st.tickers.delete(dimTick);
    st.cleanups.delete(finish);
    done.open();
    end.open();
  }
  st.cleanups.add(finish);
  return { done: done.p, end: end.p, cancel: finish };
}

// ------------------------------------------------------------------ the on-connect beat

export function superConnect(scene: Phaser.Scene, o: ConnectOpts): CineHandle | null {
  lastScene = scene;
  const st = stateOf(scene);
  const now = performance.now();
  const cast = st.casts.get(o.attackerId);
  const live = cast && now <= cast.until;
  if (o.ko && live) {
    // the Art's finishing hit: white-out (koCinematic does this from the 'ko' event too; the second call is skipped)
    return koCinematic(scene, { x: o.x, y: o.y, attackerId: o.attackerId, camera: o.camera });
  }
  if (!o.force && (!live || cast.connected || !BIG_ARTS.has(cast.artId))) return null;
  if (cast) cast.connected = true;
  const accent = cast?.accent ?? 0xffffff;
  const fromX = cast?.x ?? o.x - 100;
  const dir = o.x >= fromX ? 1 : -1;
  const hold = 700;
  const fade = 200;
  const total = hold + fade;
  const done = latch();
  const end = latch();
  let alive = true;
  // the dim stays at least as long as the beat
  if (cast) cast.dimEnd = Math.max(cast.dimEnd, now + T(total));

  // ---- the speed-line background (screen space) and the radial burst at the hit (world space)
  const w = scene.scale.width;
  const h = scene.scale.height;
  const bg = scene.add.graphics().setScrollFactor(0).setDepth(DEPTH_TAKEOVER);
  const streaks = scene.add.graphics().setScrollFactor(0).setDepth(DEPTH_STREAKS).setBlendMode(Phaser.BlendModes.ADD);
  const burst = scene.add.graphics().setDepth(DEPTH_BURST).setBlendMode(Phaser.BlendModes.ADD);
  const deep = mix(accent, 0x000000, 0.72);
  const mid = mix(accent, 0x000000, 0.35);
  const hi = lighten(accent, 0.6);
  // seeded streaks: lane (0..1 down the screen), length, thickness, speed, phase
  const lanes = Array.from({ length: 30 }, (_, i) => ({
    y: (i + Math.random() * 0.8) / 30,
    len: 0.25 + Math.random() * 0.55,
    th: 1 + Math.random() * (i % 5 === 0 ? 7 : 3),
    sp: 0.7 + Math.random() * 0.8,
    ph: Math.random(),
    c: i % 3 === 0 ? 0xffffff : hi,
  }));
  const hx = o.x;
  const hy = o.y;

  // a hard accent flash on the hit
  const el = document.createElement('div');
  el.className = 'cine cine-connect';
  el.style.setProperty('--ac', hex(accent));
  el.innerHTML = '<div class="cine-wash"></div>';
  domRoot().appendChild(el);
  const flash = play(el.firstElementChild!, [{ opacity: 0.6 }, { opacity: 0 }], 0, 160, 'ease-out');

  const tick: Ticker = (t, cam) => {
    if (!alive) return false;
    const k = (t - now) / (timeScale || 1);
    if (k >= total) {
      finish();
      return false;
    }
    const a = track(k, [[0, 0], [60, 1], [hold, 1], [total, 0]]);
    const vw = scene.scale.width || w;
    const vh = scene.scale.height || h;
    // background: deep accent at the edges, brighter band through the middle
    pinToScreen(bg, scene, cam);
    pinToScreen(streaks, scene, cam);
    bg.clear();
    bg.fillGradientStyle(deep, deep, mid, mid, 0.95 * a, 0.95 * a, 0.95 * a, 0.95 * a);
    bg.fillRect(-vw / 2, -vh / 2, vw, vh / 2);
    bg.fillGradientStyle(mid, mid, deep, deep, 0.95 * a, 0.95 * a, 0.95 * a, 0.95 * a);
    bg.fillRect(-vw / 2, 0, vw, vh / 2);
    // streaks race across at ~1500 px/s, slanted a little
    streaks.clear();
    const span = vw * 1.6;
    for (const l of lanes) {
      const len = l.len * vw;
      const p = (l.ph * span + (k / 1000) * 1500 * l.sp) % span;
      const x0 = dir > 0 ? -vw * 0.8 + p - len : vw * 0.8 - p + len;
      const x1 = x0 + dir * len;
      const y = -vh / 2 + l.y * vh;
      const slope = -0.12 * dir;
      streaks.lineStyle(l.th, l.c, 0.55 * a);
      streaks.lineBetween(x0, y, x1, y + slope * len);
    }
    // radial burst: rays turning slowly from the hit, and a shock ring
    burst.clear();
    const R = Math.max(vw, vh) / (cam.zoom || 1);
    const rays = 22;
    const spin = (k / 1000) * 0.9;
    for (let i = 0; i < rays; i++) {
      const ang = (i / rays) * Math.PI * 2 + spin;
      const wdt = i % 2 ? 0.035 : 0.075;
      const r = R * (i % 3 ? 0.75 : 1.1);
      burst.fillStyle(i % 2 ? hi : 0xffffff, 0.22 * a);
      burst.fillTriangle(hx, hy, hx + Math.cos(ang - wdt) * r, hy + Math.sin(ang - wdt) * r, hx + Math.cos(ang + wdt) * r, hy + Math.sin(ang + wdt) * r);
    }
    const rp = Math.min(1, k / 320);
    burst.lineStyle(10 * (1 - rp) + 2, 0xffffff, 0.9 * (1 - rp) * a);
    burst.strokeCircle(hx, hy, 20 + rp * 260);
    burst.fillStyle(0xffffff, 0.5 * (1 - rp));
    burst.fillCircle(hx, hy, 30 + rp * 40);
    return true;
  };
  st.tickers.add(tick);
  cameraOf(scene, o.camera)?.zoomTo(o.x, o.y, 1.8, T(80), T(hold - 80), T(33));

  function finish() {
    if (!alive) return;
    alive = false;
    flash.cancel();
    el.remove();
    bg.destroy();
    streaks.destroy();
    burst.destroy();
    st.tickers.delete(tick);
    st.cleanups.delete(finish);
    done.open();
    end.open();
  }
  st.cleanups.add(finish);
  return { done: done.p, end: end.p, cancel: finish };
}

// ------------------------------------------------------------------ K.O.

let lastKoAt = -1e9;

export function koCinematic(scene: Phaser.Scene, o: KoOpts): CineHandle {
  lastScene = scene;
  const st = stateOf(scene);
  const now = performance.now();
  const done = latch();
  const end = latch();
  // superConnect({ ko }) and the 'ko' event can both ask for it in the same frame
  if (now - lastKoAt < 300) {
    done.open();
    end.open();
    return { done: done.p, end: end.p, cancel: () => {} };
  }
  lastKoAt = now;
  const cast = o.attackerId !== undefined ? st.casts.get(o.attackerId) : undefined;
  const white = o.whiteout ?? (!!cast && now <= cast.until);
  const total = white ? 1300 : 320;
  let alive = true;

  // ---- DOM: the white-out (or a short flash)
  const { fx, fy } = toScreen(scene, o.x, o.y);
  const el = document.createElement('div');
  el.className = 'cine cine-ko';
  el.style.setProperty('--ax', `${(fx * 100).toFixed(1)}%`);
  el.style.setProperty('--ay', `${(fy * 100).toFixed(1)}%`);
  el.innerHTML = '<div class="cine-white"></div>';
  domRoot().appendChild(el);
  const wf = white
    ? play(el.firstElementChild!, [{ opacity: 1 }, { opacity: 1, offset: 0.14 }, { opacity: 0.92, offset: 0.4 }, { opacity: 0 }], 0, total, 'ease-in')
    : play(el.firstElementChild!, [{ opacity: 0.8 }, { opacity: 0 }], 0, total, 'ease-out');
  if (white) holdHud(true);

  // ---- Phaser: a light ring and rays bursting from the victim, behind the fighters
  const g = scene.add.graphics().setDepth(DEPTH_BURST).setBlendMode(Phaser.BlendModes.ADD);
  const hx = o.x;
  const hy = o.y;
  const life = 600;
  const tick: Ticker = (t, cam) => {
    if (!alive) return false;
    const k = (t - now) / (timeScale || 1);
    if (k >= Math.max(total, life)) {
      finish();
      return false;
    }
    g.clear();
    const p = Math.min(1, k / life);
    const e = 1 - (1 - p) * (1 - p);
    const R = Math.max(scene.scale.width, scene.scale.height) / (cam.zoom || 1);
    g.lineStyle(14 * (1 - p) + 2, 0xffffff, 0.95 * (1 - p));
    g.strokeCircle(hx, hy, 24 + e * R * 0.45);
    g.lineStyle(5 * (1 - p) + 1, 0xffe6a0, 0.8 * (1 - p));
    g.strokeCircle(hx, hy, 12 + e * R * 0.3);
    for (let i = 0; i < 16; i++) {
      const ang = (i / 16) * Math.PI * 2 + 0.2;
      const r0 = 30 + e * R * 0.1;
      const r1 = r0 + R * (0.25 + (i % 3) * 0.12) * e;
      g.lineStyle(i % 2 ? 2 : 5, 0xffffff, 0.7 * (1 - p));
      g.lineBetween(hx + Math.cos(ang) * r0, hy + Math.sin(ang) * r0, hx + Math.cos(ang) * r1, hy + Math.sin(ang) * r1);
    }
    return true;
  };
  st.tickers.add(tick);
  cameraOf(scene, o.camera)?.zoomTo(o.x, o.y - 10, 2.0, T(90), T(white ? 900 : 450), T(50));

  const doneT = window.setTimeout(() => done.open(), T(total));
  function finish() {
    if (!alive) return;
    alive = false;
    window.clearTimeout(doneT);
    wf.cancel();
    el.remove();
    g.destroy();
    if (white) holdHud(false);
    st.tickers.delete(tick);
    st.cleanups.delete(finish);
    done.open();
    end.open();
  }
  st.cleanups.add(finish);
  return { done: done.p, end: end.p, cancel: finish };
}

// ------------------------------------------------------------------ dev hook (?cine)

/**
 * In a match opened with ?cine, the console gets `__cine`:
 *   __cine.play(heroId?, seat = 0)   the super cinematic for that seat's fighter (as that hero, if given)
 *   __cine.connect(ko = false)       the connect beat on the other fighter (needs a play() just before)
 *   __cine.ko(whiteout = true)       the K.O. staging on seat 1
 *   __cine.slow(k)                   stretch every duration k times (for screenshots); slow(1) restores
 */
if (typeof location !== 'undefined' && new URLSearchParams(location.search).has('cine')) {
  type Dev = { game?: { scene: { getScene(k: string): Phaser.Scene } } };
  const sceneOf = () => (window as unknown as { bladerift?: Dev }).bladerift?.game?.scene.getScene('game') ?? null;
  const fighters = (sc: Phaser.Scene) =>
    ((sc as unknown as { lastList?: { id: number; seat: number; hero: number; x: number; y: number }[] }).lastList ?? []);
  const pick = (sc: Phaser.Scene, seat: number) => fighters(sc).find((f) => f.seat === seat) ?? fighters(sc)[seat];
  (window as unknown as { __cine: unknown }).__cine = {
    slow(k: number) {
      timeScale = Math.max(0.01, k);
    },
    play(heroId?: number, seat = 0) {
      const sc = sceneOf();
      const f = sc && pick(sc, seat);
      if (!sc || !f) return 'no match running';
      const hid = heroId ?? f.hero;
      preloadCinematic(hid);
      playSuperCinematic(sc, { casterId: f.id, heroId: hid, x: f.x, y: f.y, camera: null });
      return `cinematic: hero ${hid}`;
    },
    connect(ko = false) {
      const sc = sceneOf();
      const a = sc && pick(sc, 0);
      const v = sc && pick(sc, 1);
      if (!sc || !a || !v) return 'no match running';
      superConnect(sc, { attackerId: a.id, x: v.x, y: v.y - 30, ko, force: true, camera: null });
      return 'connect';
    },
    ko(whiteout = true) {
      const sc = sceneOf();
      const v = sc && pick(sc, 1);
      if (!sc || !v) return 'no match running';
      koCinematic(sc, { x: v.x, y: v.y - 30, whiteout, camera: null });
      return 'ko';
    },
    cancel() {
      cancelCinematics();
    },
  };
}
