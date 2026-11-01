import Phaser from 'phaser';
import QRCode from 'qrcode';
import {
  ARENAS, ARTS, CLASSES, classOf, DEFAULT_LOADOUT, dodgeOf, FIGHTER, hasCrescent, HEROES, HeroDef, heroOf, Loadout, LobbyStateMsg, MatchEndMsg, RIFT, Room, sanitizeLoadout,
  heroClass, heroWeapon, SKILLS, weaponLookOf, WeaponId, WEAPONS, WEAPON_COUNT,
} from '@bladerift/shared';
import { BootScene } from '../game/BootScene';
import { GameScene, LocalPlayer } from '../game/GameScene';
import { GamepadSource, isTouchDevice, KEY_LABEL, KeyboardSource, KeyScheme, MergedSource, TouchSource } from '../input/Controls';
import { Profile, Session } from '../net/Session';
import { localRoom } from '../net/transport';
import { attachGuest, dialHost, DirectLink, directRoom, HostListener } from '../net/p2p';
import {
  checkOnlineRoom, createOnlineRoom, hostedMatch, inviteLink, normalizeCode, onlineAvailable, onlineRoomExists, rememberHostedMatch, wsUrlFor,
} from '../net/online';
import { sfx } from '../audio/Sfx';
import { prefs, setPref } from './prefs';
import { Hud } from './Hud';
import { ACCENTS, accentOf, COLORS, colorOf, css } from './colors';
import { quotesOf } from './quotes';
import { checkForUpdate, CURRENT_RELEASE, updateReady } from '../update';
import { crestIcon, dodgeIcon, heroArtIcon, heroWeaponIcon, skillIcon } from './icons';
import { animatePreview } from './spritePreview';
import { startTitleShowcase } from './titleShowcase';
import { prefetchHeroSprites } from '../render/spriteFighter';
import { warmAllAtlases } from '../render/atlasStore';
import { measureViewport, setViewport, viewH, viewW } from './viewport';

type Screen = 'title' | 'fighter' | 'online' | 'lobby' | 'game' | 'results' | 'settings' | 'howto' | 'connecting';

const PROFILE_KEYS = ['bladerift.profile', 'bladerift.profile2'];
const NAMES = ['Ronin', 'Vesper', 'Kael', 'Isolde', 'Marrow', 'Tamsin', 'Corvin', 'Wren'];

/** Hero portrait card (240x320, framed): assets/art/h-00.jpg .. h-13.jpg. */
const heroPortrait = (h: HeroDef) => `assets/art/h-${String(h.portrait).padStart(2, '0')}.jpg`;
/** Square Rift Art icon by ArtId: the seven original arts have their own icon, the new seven share i-art. */

function loadProfile(i: number): Profile {
  let p: Partial<Profile> = {};
  try {
    p = JSON.parse(localStorage.getItem(PROFILE_KEYS[i]) ?? '{}') ?? {};
  } catch {
    /* blocked */
  }
  const rnd = Math.floor(Math.random() * NAMES.length);
  return {
    name: typeof p.name === 'string' && p.name ? p.name.slice(0, 16) : i ? 'Player 2' : NAMES[rnd],
    color: typeof p.color === 'number' ? p.color : i ? 1 : 0,
    look: { ...{ accent: i ? 1 : 0, skin: 0, head: 0, face: 0, back: 0, outfit: 0, hair: 0, thrust: 0, flame: 0, hairCol: 0 }, ...(p.look ?? {}) },
    load: sanitizeLoadout(p.load ?? (i ? { weapons: [2, 6], skill: 1, cls: 4 } : DEFAULT_LOADOUT)),
  };
}

function saveProfile(i: number, p: Profile) {
  try {
    localStorage.setItem(PROFILE_KEYS[i], JSON.stringify(p));
  } catch {
    /* blocked */
  }
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export class App {
  private ui = document.getElementById('ui')!;
  private screen: Screen = 'title';
  private game: Phaser.Game | null = null;
  private booted = false;
  /** The background download of every hero atlas has been started (once per page). */
  private warmed = false;
  private profiles: [Profile, Profile] = [loadProfile(0), loadProfile(1)];
  /** Which profile the fighter screen edits, and where it returns. */
  private editing = 0;
  private editBack: Screen = 'title';
  private sessions: Session[] = [];
  private room: Room | null = null;
  private mode: 'online' | 'lan' | 'practice' | 'local' = 'practice';
  /** Set when this page is served by a LAN host (packages/server): its same-origin socket and the Wi-Fi join address. */
  private lan: { ws: string; join: string } | null = null;
  private hud: Hud | null = null;
  private touch: TouchSource | null = null;
  private inputs: LocalPlayer[] = [];
  private code = '';
  /** In a direct (peer-to-peer) match, and the host's listener for guests who link straight here. */
  private direct = false;
  private listener: HostListener | null = null;
  private lastEnd: MatchEndMsg | null = null;
  private onlineMsg = '';
  private toastTimer = 0;

  start() {
    this.fit();
    addEventListener('resize', () => this.fit());
    window.visualViewport?.addEventListener('resize', () => this.fit());
    setInterval(() => this.fit(), 1000);
    // a newer release finished downloading: the Update buttons say so
    window.addEventListener('bladerift:update-ready', () => {
      this.ui.querySelectorAll<HTMLElement>('.update-btn').forEach((b) => {
        b.classList.add('ready');
        if (!b.dataset.busy) b.textContent = 'Update ready';
      });
    });
    document.addEventListener('pointerdown', () => sfx.unlock(), { capture: true });
    document.addEventListener('keydown', () => sfx.unlock(), { capture: true });
    sfx.volume = prefs().volume;
    this.bootPhaser();
    const room = new URL(location.href).searchParams.get('room');
    if (room && onlineAvailable()) {
      this.mode = 'online';
      this.show('online');
      void this.joinOnline(normalizeCode(room));
    } else this.show('title');
    void this.probeLanHost();
  }

  /**
   * A LAN host serves /api/info on the same origin. If it answers, this page IS that host's client: offer the Wi-Fi
   * duel over a same-origin socket (the host console's ?host= link joins at once, with the host key).
   */
  private async probeLanHost() {
    if (import.meta.env.DEV) return;
    try {
      const r = await fetch('/api/info', { cache: 'no-store' });
      const info = r.ok && r.headers.get('content-type')?.includes('json') ? await r.json() : null;
      if (!info || typeof info.v !== 'number') return;
      const addr = Array.isArray(info.lan) && typeof info.lan[0] === 'string' ? info.lan[0] : location.hostname;
      this.lan = { ws: `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`, join: `${location.protocol}//${addr}:${info.port ?? location.port}` };
      const hostKey = new URL(location.href).searchParams.get('host') ?? undefined;
      if (hostKey && this.screen === 'title') this.connectLan(hostKey);
      else if (this.screen === 'title') this.show('title');
    } catch {
      /* not a LAN host: the public site */
    }
  }

  private connectLan(hostKey?: string) {
    if (!this.lan) return;
    this.leave(true);
    this.mode = 'lan';
    this.code = '';
    const s = new Session({ kind: 'ws', url: this.lan.ws }, this.profiles[0], hostKey);
    this.sessions = [s];
    this.wire(s);
    s.on('status', (st) => {
      if (st === 'closed' && this.screen !== 'title') {
        this.leave(true);
        this.show('title');
        this.toast('Disconnected from the Wi-Fi host.');
      }
    });
    s.connect();
    this.show('connecting');
  }

  private fit() {
    const v = measureViewport();
    setViewport(v.w, v.h, v.top);
    document.body.classList.toggle('portrait', v.h > v.w && isTouchDevice());
  }

  private bootPhaser() {
    this.game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: 'game',
      backgroundColor: '#0d0a14',
      scale: { mode: Phaser.Scale.RESIZE, width: viewW(), height: viewH() },
      render: { antialias: true, roundPixels: false, powerPreference: 'high-performance' },
      scene: [BootScene, GameScene],
      input: { keyboard: false, gamepad: false },
      audio: { noAudio: true },
    });
    this.game.events.once('booted', () => (this.booted = true));
  }

  // ------------------------------------------------------------------ screens

  private show(s: Screen) {
    this.screen = s;
    document.body.dataset.screen = s;
    if (s === 'game') {
      this.ui.innerHTML = '';
      return;
    }
    // panels marked data-keep keep their scroll position across a re-render (hero picks redraw the screen)
    const keep = new Map<string, [number, number]>();
    this.ui.querySelectorAll<HTMLElement>('[data-keep]').forEach((el) => keep.set(el.dataset.keep!, [el.scrollLeft, el.scrollTop]));
    this.ui.innerHTML = `<div class="screen screen-${s}">${this.render(s)}</div>`;
    this.bind(this.ui.firstElementChild as HTMLElement);
    // the title screen's face-off of two live heroes
    const tl = this.ui.querySelector<HTMLCanvasElement>('canvas.title-hero.left');
    const tr = this.ui.querySelector<HTMLCanvasElement>('canvas.title-hero.right');
    if (tl && tr) startTitleShowcase(tl, tr);
    // once the title is up and quiet, every hero's atlas downloads to the device in the background (your own hero first),
    // so hero select and the match never wait for one
    if (tl && tr && !this.warmed) {
      this.warmed = true;
      setTimeout(() => void warmAllAtlases(this.profiles.map((p) => p.load.hero)), 2500);
    }
    // the hero select's live sprite preview
    this.ui.querySelectorAll<HTMLCanvasElement>('canvas.hs-sprite').forEach((cv) => void animatePreview(cv, Number(cv.dataset.hero)));
    this.ui.querySelectorAll<HTMLElement>('[data-keep]').forEach((el) => {
      const v = keep.get(el.dataset.keep!);
      if (v) [el.scrollLeft, el.scrollTop] = v;
    });
  }

  private render(s: Screen): string {
    switch (s) {
      case 'title':
        return `<div class="title-bg" aria-hidden="true"><div class="title-art"></div><div class="title-rift"></div>${'<i class="ember"></i>'.repeat(14)}</div>
        <canvas class="title-hero left" aria-hidden="true"></canvas><canvas class="title-hero right" aria-hidden="true"></canvas>
        <div class="title-wrap">
          ${/\/bladerift\//.test(location.pathname) ? '<a class="arcade-back" href="../" aria-label="Back to all games">‹ All games</a>' : ''}
          <button class="update-btn${updateReady() ? ' ready' : ''}" data-act="update">${updateReady() ? 'Update ready' : 'Update game'}</button>
          <div class="logo"><span>BLADE</span><span>RIFT</span></div>
          <div class="tag">One rift. Two fighters. Pick your blades.</div>
          <div class="menu">
            ${this.lan ? `<button class="big primary" data-act="lan">Join Wi&#8209;Fi duel</button>` : ''}
            ${onlineAvailable() ? `<button class="big ${this.lan ? '' : 'primary'}" data-act="online">Play online</button>` : ''}
            <button class="big" data-act="practice">Practice vs bot</button>
            <button class="big" data-act="local">Two players, one device</button>
            <div class="row"><button data-act="fighter">Fighter</button><button data-act="howto">How to play</button><button data-act="settings">Settings</button></div>
          </div>
          <div class="credit">Effects &amp; animation: PixelFX (MIT) · build ${esc(String(import.meta.env.VITE_RELEASE ?? 'dev'))}</div>
        </div>`;
      case 'fighter':
        return this.renderFighter();
      case 'online':
        return `${this.header('Play online')}
          <div class="card online-card">
            <button class="big primary" data-act="create">Create a match</button>
            <div class="or">or join a friend</div>
            <div class="join-row"><input id="code" maxlength="12" placeholder="CODE" autocomplete="off" autocapitalize="characters" spellcheck="false"><button data-act="join">Join</button></div>
            <div class="msg">${esc(this.onlineMsg)}</div>
          </div>`;
      case 'connecting':
        return `<div class="center-msg"><div class="spinner"></div><div>${esc(this.onlineMsg || 'Connecting…')}</div><button data-act="leave">Cancel</button></div>`;
      case 'lobby':
        return this.renderLobby();
      case 'results':
        return this.renderResults();
      case 'settings': {
        const p = prefs();
        return `${this.header('Settings')}<div class="card settings">
          <label>Sound <input type="range" min="0" max="1" step="0.05" value="${p.volume}" data-pref="volume"></label>
          <label>Screen shake <input type="range" min="0" max="1" step="0.1" value="${p.shake}" data-pref="shake"></label>
          <label class="check"><input type="checkbox" ${p.haptics ? 'checked' : ''} data-pref="haptics"> Vibration</label>
          <div class="update-row"><span>Version <b>${esc(CURRENT_RELEASE)}</b></span><button class="update-btn inline${updateReady() ? ' ready' : ''}" data-act="update">${updateReady() ? 'Update ready' : 'Update game'}</button></div>
        </div>`;
      }
      case 'howto':
        return this.renderHowto();
      default:
        return '';
    }
  }

  /** The Update button: install a newer release now (the page reloads), or say it is already the latest. */
  private async updateGame(btn: HTMLElement) {
    if (btn.dataset.busy) return;
    btn.dataset.busy = '1';
    btn.textContent = 'Checking…';
    const r = await checkForUpdate();
    if (r === 'reloading') {
      btn.textContent = 'Updating…';
      return;
    }
    btn.textContent = r === 'offline' ? 'Offline: try later' : 'Up to date ✓';
    window.setTimeout(() => {
      delete btn.dataset.busy;
      if (btn.isConnected) btn.textContent = 'Update game';
    }, 2500);
  }

  private header(title: string, back = 'back') {
    return `<div class="hdr"><button class="back" data-act="${back}" aria-label="Back">‹</button><h2>${esc(title)}</h2></div>`;
  }

  private renderFighter() {
    const p = this.profiles[this.editing];
    const h = heroOf(p.load.hero);
    const C = classOf(h.cls);
    const A = ARTS[h.art] ?? ARTS[0];
    const wa = weaponLookOf(h.id);
    // a hero with a weapon of its own (not the class's) reaches as far as that weapon does
    const hw = heroWeapon(h.id);
    const reach = hw === C.signature ? C.bars.reach : ({ [WeaponId.Daggers]: 1, [WeaponId.Sword]: 3, [WeaponId.Gate]: 5, [WeaponId.Chains]: 5 } as Record<number, number>)[hw] ?? C.bars.reach;
    // the bars and traits are the hero's own (its class's numbers with the hero's tune: HERO_TUNE)
    const T = heroClass({ cls: h.cls, hero: h.id });
    const nudge = (b: number, k: number) => Math.max(1, Math.min(5, Math.round(b + k)));
    const power = nudge(C.bars.power, (T.dmg / C.dmg - 1) * 6);
    const speedBar = nudge(C.bars.speed, (T.speed / C.speed - 1) * 7);
    const health = nudge(C.bars.health, (T.hp / C.hp - 1) * 12);
    const traits = [
      T.airJumps > C.airJumps ? 'Triple jump' : '',
      (T.jump ?? 1) >= 1.08 ? 'High leap' : (T.jump ?? 1) <= 0.92 ? 'Low jump' : '',
      (T.weight ?? 1) <= 0.86 ? 'Heavy: hard to launch' : (T.weight ?? 1) >= 1.1 ? 'Light: thrown far' : '',
    ].filter(Boolean);
    // the hero's own special and dodge (skill N and DODGES[N] belong to hero N): nothing to pick, the hero fixes them
    const sp = SKILLS[h.id];
    const dg = dodgeOf({ hero: h.id });
    const slot = (x: HeroDef) => (x.slot === 'True' ? 'True' : x.slot === 'False' ? 'False' : 'Extra');
    const card = (x: HeroDef) =>
      `<button class="hs-hero ${x.id === h.id ? 'on' : ''}" data-pick="hero" data-i="${x.id}" title="${esc(x.name)}, ${esc(x.epithet)}" aria-label="${esc(x.name)}" aria-pressed="${x.id === h.id}">
        <img src="${heroPortrait(x)}" alt=""><span class="hs-tag">${slot(x)}</span><span class="hs-nm">${esc(x.name)}</span></button>`;
    // one column per class: the True champion above the False one (Aegis, the Extra, sits in the lower slot)
    const columns = CLASSES.map((k) => {
      const members = HEROES.filter((x) => x.cls === k.id);
      const top = members.find((x) => x.slot === 'True');
      const low = members.find((x) => x.slot !== 'True');
      return `<div class="hs-col ${k.id === C.id ? 'current' : ''}">
        <div class="hs-col-h"><img src="${crestIcon(k.id)}" alt=""><span>${esc(k.name)}</span></div>
        <div class="hs-slots">${top ? card(top) : '<span class="hs-gap"></span>'}${low ? card(low) : '<span class="hs-gap"></span>'}</div>
      </div>`;
    }).join('');
    const bar = (label: string, v: number) => `<div class="hs-bar"><span>${label}</span><i>${'<b></b>'.repeat(v)}${'<em></em>'.repeat(5 - v)}</i></div>`;
    const sw = (kind: string, list: { name: string; rgb: number }[], cur: number) =>
      list.map((c, i) => `<button class="sw ${cur === i ? 'on' : ''}" data-pick="${kind}" data-i="${i}" style="--c:${css(c.rgb)}" title="${c.name}" aria-label="${c.name}"></button>`).join('');
    const title = this.editing ? 'Player 2 hero' : 'Your hero';
    return `<div class="hdr hs-hdr"><button class="back" data-act="back" aria-label="Back">‹</button><h2>${esc(title)}</h2>
        <span class="hs-grow"></span><input id="fname" maxlength="16" value="${esc(p.name)}" placeholder="Name" aria-label="Name"><button class="primary hs-done" data-act="back">Done</button></div>
      <div class="hs">
        <div class="card hs-roster" data-keep="roster" aria-label="Roster">${columns}</div>
        <div class="hs-detail">
          <div class="card hs-portrait">
            <div class="hs-frame"><img src="${heroPortrait(h)}" alt="${esc(h.name)}"><canvas class="hs-sprite" data-hero="${h.id}" hidden aria-hidden="true"></canvas></div>
            <div class="hs-id">
              <small>${slot(h)} champion</small>
              <h2>${esc(h.name)}</h2>
              <p>${esc(h.epithet)}</p>
            </div>
            <div class="hs-class"><img src="${crestIcon(C.id)}" alt=""><div><b>${esc(C.name)}</b><small>${esc(C.title)}</small></div></div>
          </div>
          <div class="card hs-info" data-keep="info">
            <p class="hs-lore">${esc(h.lore)}</p>
            <div class="hs-bars">${bar('Power', power)}${bar('Speed', speedBar)}${bar('Health', health)}${bar('Reach', reach)}</div>
            ${traits.length ? `<div class="hs-traits">${traits.map((t) => `<span>${esc(t)}</span>`).join('')}</div>` : ''}
            <p class="hs-blurb">${esc(C.blurb)}</p>
            <div class="hs-item hs-special"><img src="${skillIcon(h.id)}" alt=""><div><small>Special</small><b>${esc(sp.name)}</b><p>${esc(sp.blurb)}</p></div></div>
            <div class="hs-item hs-dodge"><img src="${dodgeIcon(h.id)}" alt=""><div><small>Dodge</small><b>${esc(dg.name)}</b><p>${esc(dg.blurb)}</p></div></div>
          </div>
          <div class="card hs-gear" data-keep="gear">
            <div class="hs-gear-a">
              <div class="hs-lbl">Player colour <small>name tag and effects</small></div>
              <div class="sws">${sw('color', COLORS, p.color)}</div>
            </div>
            <div class="hs-gear-b">
              <div class="hs-item hs-art"><img src="${heroArtIcon(h.id)}" alt=""><div><small>Rift Art</small><b>${esc(A.name)}</b><p>${esc(A.blurb)}</p></div></div>
              <div class="hs-item hs-sig"><img src="${heroWeaponIcon(h.id)}" alt=""><div><small>Signature weapon<span class="hs-lock">, locked to the hero</span></small><b>${esc(wa.name)}</b><p>${esc(wa.blurb)}</p></div></div>
              <p class="hs-note">${esc(h.name)} fights with the ${esc(wa.name)} alone: light ${WEAPONS[hw].arrowSpeed ? 'shots' : 'combo'} on one button, ${hw === WeaponId.Gate ? 'a held volley' : WEAPONS[hw].arrowSpeed ? 'a held shot' : 'a heavy strike'} on the other${WEAPONS[hw].arrowSpeed ? '' : ' (a plunge in the air)'}.</p>
            </div>
          </div>
        </div>
      </div>`;
  }

  private renderLobby() {
    const s = this.sessions[0];
    const l = s?.lobby;
    if (!s || !l) return `<div class="center-msg"><div class="spinner"></div>Waiting for the host…</div>`;
    // (two players on one device: either local session may hold host)
    const host = this.sessions.some((x) => x.isHost);
    // the seated heroes' sprite atlases download while the lobby is open, so the duel starts with them
    for (const r of s.roster.values()) if (r.seat >= 0) prefetchHeroSprites(r.load.hero, this.game?.textures);
    const seatCard = (seat: number) => {
      const r = [...s.roster.values()].find((x) => x.seat === seat);
      const isMe = this.sessions.some((x) => x.selfId === r?.id);
      if (!r) {
        const takeSide = (this.mode === 'online' || this.mode === 'lan') && !this.sessions.some((x) => s.roster.get(x.selfId)?.seat === seat) ? `<button class="small" data-seat="${seat}">Take this side</button>` : '';
        // the bot's hero is drawn when the duel starts, so its card is a mystery card the size of a player's
        if (l.bot) {
          const lvl = l.botLevel.charAt(0).toUpperCase() + l.botLevel.slice(1);
          return `<div class="seat bot-seat" style="--c:#7a6a96">
            <div class="seat-art"><div class="bot-mystery" aria-hidden="true"><span>?</span></div><span class="seat-no">CPU</span></div>
            <div class="seat-info">
              <b class="seat-name">Bot</b>
              <div class="seat-hero"><span class="seat-hname">Mystery hero</span><small>drawn when the duel starts</small></div>
              <div class="seat-meta"><span class="bot-lvl">${esc(lvl)} bot</span></div>${takeSide}
            </div></div>`;
        }
        return `<div class="seat empty"><div class="seat-empty">Waiting for a challenger…</div>${takeSide}</div>`;
      }
      const gear = `<img src="${heroWeaponIcon(r.load.hero ?? 0)}" title="${weaponLookOf(r.load.hero ?? 0).name}">` + `<img src="${skillIcon(r.load.skill)}" title="${SKILLS[r.load.skill].name}">`;
      const which = this.sessions.findIndex((x) => x.selfId === r.id);
      const hero = heroOf(r.load.hero);
      return `<div class="seat" style="--c:${css(colorOf(r.color))}">
        <div class="seat-art"><img class="seat-port" src="${heroPortrait(hero)}" alt="${esc(hero.name)}"><span class="seat-no">P${seat + 1}</span></div>
        <div class="seat-info">
          <b class="seat-name">${esc(r.name)}${r.host ? ' <i class="crown" title="Host">★</i>' : ''}</b>
          <div class="seat-hero"><span class="seat-hname">${esc(hero.name)}</span><small>${esc(hero.epithet)}</small></div>
          <div class="seat-meta"><div class="seat-class"><img src="${crestIcon(classOf(r.load.cls).id)}" alt="">${esc(classOf(r.load.cls).name)}</div><div class="gear">${gear}</div></div>
          ${isMe ? `<button class="small" data-act="gear" data-who="${which}">Change gear</button>` : r.ping ? `<span class="ping">${r.ping} ms</span>` : ''}
        </div></div>`;
    };
    const watchers = [...s.roster.values()].filter((r) => r.seat < 0);
    const arenaCards = ARENAS.map((a) => `<button class="arena ${l.settings.arenaId === a.id ? 'on' : ''}" ${host ? `data-arena="${a.id}"` : 'disabled'}><img src="assets/art/wall-${a.theme}.jpg" alt=""><span>${a.name}</span></button>`).join('');
    const opt = (k: string, v: number, label: string, cur: number) => `<button class="seg ${cur === v ? 'on' : ''}" ${host ? `data-set="${k}" data-v="${v}"` : 'disabled'}>${label}</button>`;
    // the current arena's name (the chips only show a thumbnail and a short label)
    const arenaName = ARENAS.find((a) => a.id === l.settings.arenaId)?.name ?? '';
    const codeBox = this.mode === 'online' ? `<div class="code-box"><div><small>Match code</small><b>${esc(this.code)}</b></div><img id="qr" alt="QR code"><button class="small" data-act="share">Share link</button></div>` : '';
    const lanBox = this.mode === 'lan' && this.lan ? `<div class="code-box"><div><small>Join on this Wi&#8209;Fi</small><b class="lan-addr">${esc(this.lan.join.replace(/^https?:\/\//, ''))}</b></div></div>` : '';
    const title = this.mode === 'online' ? 'Duel lobby' : this.mode === 'lan' ? 'Wi‑Fi duel' : this.mode === 'local' ? 'Two players' : 'Practice';
    const botRow = this.mode !== 'local' ? `<div class="opt opt-bot"><span>Bot</span>${host ? `<button class="seg tog ${l.bot ? 'on' : ''}" data-act="bot">${l.bot ? 'On' : 'Off'}</button>` : `<span class="seg-val">${l.bot ? 'On' : 'Off'}</span>`}
      <div class="segs ${l.bot ? '' : 'off'}">${(['easy', 'normal', 'hard'] as const).map((lv) => `<button class="seg ${l.botLevel === lv ? 'on' : ''}" ${host ? `data-level="${lv}"` : 'disabled'}>${lv}</button>`).join('')}</div></div>` : '';
    return `${this.header(title, 'leave')}
      <div class="lobby">
        <div class="lobby-stage">
          <div class="seats">${seatCard(0)}<div class="vs"><span>VS</span></div>${seatCard(1)}</div>
          ${watchers.length ? `<div class="watchers">Watching: ${watchers.map((w) => esc(w.name)).join(', ')}</div>` : ''}
          ${codeBox}${lanBox}
        </div>
        <div class="card lobby-opts">
          <div class="opt-h">Arena <b>${esc(arenaName)}</b></div>
          <div class="arenas">${arenaCards}</div>
          <div class="opt"><span>Rounds to win</span><div class="segs">${opt('wins', 1, '1', l.settings.wins)}${opt('wins', 2, '2', l.settings.wins)}${opt('wins', 3, '3', l.settings.wins)}</div></div>
          <div class="opt"><span>Round time</span><div class="segs">${opt('roundTime', 90, '90s', l.settings.roundTime)}${opt('roundTime', 120, '120s', l.settings.roundTime)}${opt('roundTime', 180, '180s', l.settings.roundTime)}</div></div>
          ${botRow}
          <div class="lobby-go">${host ? `<button class="big primary" data-act="start">Fight!</button>` : `<div class="wait">The host starts the duel.</div>`}</div>
        </div>
      </div>`;
  }

  private renderResults() {
    const m = this.lastEnd;
    const s = this.sessions[0];
    if (!m || !s) return '';
    const row = (seat: number) => {
      const r = m.rows.find((x) => x.seat === seat);
      const e = r ? s.roster.get(r.id) : undefined;
      const port = e ? `<img class="res-port" src="${heroPortrait(heroOf(e.load.hero))}" alt="">` : '';
      return `<div class="res-side ${m.winner === seat ? 'won' : ''}" style="--c:${css(colorOf(e?.color ?? 0))}">${port}<div class="res-body"><b>${esc(e?.name ?? '—')}</b>
        <div class="big-num">${m.wins[seat]}</div><small>rounds</small><div>${r?.dealt ?? 0} damage · ${r?.hits ?? 0} hits</div></div></div>`;
    };
    const winner = s.roster.get(m.winnerId)?.name ?? 'Winner';
    return `<div class="results"><div class="res-kicker">Match over</div><h1>${esc(winner)} wins!</h1><div class="res-row">${row(0)}<div class="vs"><span>VS</span></div>${row(1)}</div>
      <div class="row res-acts">${this.sessions.some((x) => x.isHost) ? `<button class="big primary" data-act="rematch">Rematch</button>` : ''}<button class="big" data-act="toLobby">Lobby</button><button class="big" data-act="leave">Main menu</button></div></div>`;
  }

  private renderHowto() {
    const k = KEY_LABEL;
    const row = (label: string, key: keyof (typeof k)['solo']) => `<tr><td>${label}</td><td>${k.solo[key]}</td><td>${k.p1[key]}</td><td>${k.p2[key]}</td></tr>`;
    return `${this.header('How to play')}
      <div class="howto">
      <div class="card howto-keys">
        <h3>Controls</h3>
        <table><tr><th></th><th>Keyboard</th><th>Player 1</th><th>Player 2</th></tr>
          ${row('Move', 'left')}${row('Jump (again in the air)', 'jump')}${row('Light attack (combo)', 'a')}${row('Heavy attack · plunge in the air', 'b')}${row('Skill', 'skill')}${row('Roll / air dash', 'roll')}${row('Heal flask', 'heal')}${row('Rift Art', 'special')}
        </table>
        <p class="howto-pad">Phone: joystick on the left, buttons on the right. Gamepads work too (X / Y weapons, A jump, B roll, RB skill, LB heal, triggers Rift Art).</p>
      </div>
      <div class="card howto-rules" data-keep="howto">
        <h3>How to win</h3>
        <p>Knock your opponent out to win the round. Win the number of rounds set in the lobby (1, 2 or 3) to take the match. If time runs out, more health wins.</p>
        <p><b>Guard and parry:</b> hold <b>down</b> on the ground to guard against hits from the side you face (you take a little chip damage; heavy attacks break it). Press down <b>just before</b> a hit lands to <b>parry</b>: a melee attacker is staggered, and a shot flies straight back at whoever fired it. Swinging a melee weapon into a shot cuts it out of the air, so you can fight your way in against archers and casters.</p>
        <p><b>Classes and Rift Arts:</b> every hero fights with its own weapon, special, dodge and Rift Art. The Rift gauge under your health fills slowly on its own and fast when you hit or get hit; when it glows, unleash the Art. The Assassin's <b>Flash Step</b> even works while you are being comboed.</p>
        <ul>
          <li><b>Combos:</b> keep pressing a weapon button to chain its strikes.</li>
          <li><b>Hold</b> the Lance to charge a lunge, the Bow for a heavy shot, the Shield to block. Block just before a hit to <b>parry</b>.</li>
          <li><b>Down + attack</b> in the air: a plunging strike that bounces you off a hit. <b>Down + jump</b>: drop through a ledge. <b>Down</b> in the air falls fast; on the ground it crouches under high swings.</li>
          <li><b>Walls and ledges:</b> slide down a wall and jump off it; grab a ledge and jump to climb. <b>Roll in the air</b> to dash. A hit that lands can be cancelled into a jump.</li>
          <li>Rolling makes you untouchable for a moment. One heal flask per round, and a hit while drinking spills it.</li>
          <li><b>Heat:</b> ranged heroes (bow, staff, Gilgamesh's Gate) build heat with every shot. About five quick shots overheat the weapon, which then needs about 1.5 s to cool (the strip under your health bar shows it).</li>
        </ul>
      </div>
      </div>`;
  }

  // ------------------------------------------------------------------ binding

  private bind(root: HTMLElement) {
    root.querySelectorAll<HTMLElement>('[data-act]').forEach((el) =>
      el.addEventListener('click', () => {
        sfx.play('uiClick');
        this.act(el.dataset.act!, el);
      }),
    );
    if (this.screen === 'fighter') this.bindFighter(root);
    if (this.screen === 'lobby') this.bindLobby(root);
    if (this.screen === 'settings') {
      root.querySelectorAll<HTMLInputElement>('[data-pref]').forEach((el) =>
        el.addEventListener('input', () => {
          const k = el.dataset.pref as 'volume' | 'shake' | 'damageNumbers' | 'haptics';
          const v = el.type === 'checkbox' ? el.checked : Number(el.value);
          setPref(k, v as never);
          if (k === 'volume') sfx.volume = Number(v);
        }),
      );
    }
    if (this.screen === 'online') {
      const inp = root.querySelector<HTMLInputElement>('#code');
      inp?.addEventListener('keydown', (e) => e.key === 'Enter' && this.act('join', inp));
    }
  }

  private bindFighter(root: HTMLElement) {
    const p = this.profiles[this.editing];
    root.querySelector<HTMLInputElement>('#fname')!.addEventListener('input', (e) => {
      p.name = (e.target as HTMLInputElement).value.slice(0, 16) || p.name;
      saveProfile(this.editing, p);
    });
    root.querySelectorAll<HTMLElement>('[data-pick]').forEach((el) =>
      el.addEventListener('click', () => {
        const i = Number(el.dataset.i);
        const k = el.dataset.pick!;
        if (k === 'color') p.color = i;
        else if (k === 'hero') p.load = sanitizeLoadout({ ...p.load, hero: i }); // the hero fixes class, signature and Rift Art
        else if (k === 'accent') p.look = { ...p.look!, accent: i };
        sfx.play('uiClick');
        saveProfile(this.editing, p);
        this.show('fighter');
      }),
    );
  }

  private bindLobby(root: HTMLElement) {
    // host settings go through the host session (either local player may hold it on one device)
    const s = this.hostSession();
    root.querySelectorAll<HTMLElement>('[data-arena]').forEach((el) => el.addEventListener('click', () => s.lobbyCmd({ op: 'settings', settings: { arenaId: el.dataset.arena } })));
    root.querySelectorAll<HTMLElement>('[data-set]').forEach((el) => el.addEventListener('click', () => s.lobbyCmd({ op: 'settings', settings: { [el.dataset.set!]: Number(el.dataset.v) } })));
    root.querySelectorAll<HTMLElement>('[data-level]').forEach((el) => el.addEventListener('click', () => s.lobbyCmd({ op: 'botLevel', level: el.dataset.level as 'easy' })));
    root.querySelectorAll<HTMLElement>('[data-seat]').forEach((el) => el.addEventListener('click', () => s.lobbyCmd({ op: 'seat', seat: Number(el.dataset.seat) })));
    const qr = root.querySelector<HTMLImageElement>('#qr');
    if (qr && this.code) void QRCode.toDataURL(inviteLink(this.code), { margin: 1, width: 160, color: { dark: '#0d0a14', light: '#f4ead8' } }).then((u) => (qr.src = u));
  }

  private act(a: string, el: HTMLElement) {
    switch (a) {
      case 'back':
        if (this.screen === 'fighter') {
          // a loadout change goes to the lobby
          const s = this.sessions[this.editing];
          if (s?.lobby) s.lobbyCmd({ op: 'loadout', load: this.profiles[this.editing].load });
          if (s?.lobby) s.lobbyCmd({ op: 'rename', name: this.profiles[this.editing].name, color: this.profiles[this.editing].color, look: this.profiles[this.editing].look });
          this.show(this.editBack);
        } else this.show('title');
        break;
      case 'fighter':
        this.editing = 0;
        this.editBack = 'title';
        this.show('fighter');
        break;
      case 'gear':
        this.editing = Number(el.dataset.who ?? 0);
        this.editBack = 'lobby';
        this.show('fighter');
        break;
      case 'settings':
      case 'howto':
        this.show(a);
        break;
      case 'update':
        void this.updateGame(el);
        break;
      case 'online':
        this.mode = 'online';
        this.onlineMsg = '';
        this.show('online');
        break;
      case 'create':
        void this.createOnline();
        break;
      case 'join': {
        const code = normalizeCode((this.ui.querySelector<HTMLInputElement>('#code')?.value ?? '').trim());
        if (code.length !== 4) {
          this.onlineMsg = 'Codes have 4 letters.';
          this.show('online');
        } else void this.joinOnline(code);
        break;
      }
      case 'lan':
        this.connectLan();
        break;
      case 'practice':
        this.startLocal('practice');
        break;
      case 'local':
        this.startLocal('local');
        break;
      case 'bot':
        this.hostSession()?.lobbyCmd({ op: 'bot', on: !this.sessions[0].lobby?.bot });
        break;
      case 'start':
        this.hostSession()?.lobbyCmd({ op: 'start' });
        break;
      case 'rematch':
        this.hostSession()?.lobbyCmd({ op: 'rematch' });
        break;
      case 'toLobby':
        this.hostSession()?.lobbyCmd({ op: 'toLobby' });
        this.show('lobby');
        break;
      case 'share': {
        const link = inviteLink(this.code);
        if (navigator.share) void navigator.share({ title: 'Bladerift duel', text: `Duel me in Bladerift! Code ${this.code}`, url: link }).catch(() => {});
        else void navigator.clipboard?.writeText(link).then(() => this.toast('Link copied'));
        break;
      }
      case 'leave':
        this.leave();
        break;
    }
  }

  // ------------------------------------------------------------------ connections

  private startLocal(kind: 'practice' | 'local') {
    this.leave(true);
    this.mode = kind;
    this.room = localRoom(kind === 'practice' ? 'Practice' : 'Same device');
    const a = new Session({ kind: 'local', room: this.room, owns: true }, this.profiles[0]);
    this.sessions = [a];
    if (kind === 'practice') this.room.botOn = true;
    this.wire(a);
    a.connect();
    if (kind === 'local') {
      const b = new Session({ kind: 'local', room: this.room, owns: false }, this.profiles[1]);
      this.sessions.push(b);
      b.on('match', () => this.maybeStartGame());
      b.on('lobby', () => this.screen === 'lobby' && this.show('lobby'));
      setTimeout(() => b.connect(), 30);
    }
    this.show('lobby');
  }

  private async createOnline() {
    this.onlineMsg = 'Creating a match…';
    this.show('connecting');
    try {
      const r = await createOnlineRoom();
      rememberHostedMatch(r.code, r.hostKey);
      this.connectOnline(r.code, r.hostKey);
    } catch (e) {
      this.onlineMsg = (e as Error).message;
      this.show('online');
    }
  }

  private async joinOnline(code: string) {
    this.onlineMsg = 'Finding the match…';
    this.show('connecting');
    const mine = hostedMatch();
    if (mine?.code !== code) {
      // a direct link to the host first: no server in between (a host already in a direct match is only reachable so)
      this.onlineMsg = 'Linking straight to your friend…';
      this.show('connecting');
      const link = await dialHost(code);
      if (link) return this.connectDirectGuest(code, link);
    }
    this.onlineMsg = 'Joining through the online server…';
    this.show('connecting');
    try {
      await checkOnlineRoom(code);
      this.connectOnline(code, mine?.code === code ? mine.hostKey : undefined);
    } catch (e) {
      this.onlineMsg = (e as { status?: number }).status === 404 ? `No match with the code ${code}.` : (e as Error).message;
      this.show('online');
    }
  }

  /** The guest's side of a direct match: the host's page runs it, this session talks to it over the link. */
  private connectDirectGuest(code: string, link: DirectLink, resume = '', tries = 0) {
    const wasGame = this.screen === 'game';
    this.leave(true);
    this.mode = 'online';
    this.code = code;
    this.direct = true;
    const s = new Session({ kind: 'rtc', link }, this.profiles[0]);
    // (a re-link presents the seat token, so the host gives this player its fighter back)
    if (resume) s.resumeToken = resume;
    this.sessions = [s];
    this.wire(s);
    s.on('status', (st) => {
      if (st !== 'closed' || this.screen === 'title' || this.sessions[0] !== s) return;
      // the link dropped: dial the host again (it keeps listening and keeps the seat for a while)
      if (tries < 3 && s.resumeToken) {
        const token = s.resumeToken;
        this.onlineMsg = 'Link lost: reconnecting to your friend…';
        this.show('connecting');
        void dialHost(code).then((l) => {
          if (l) return this.connectDirectGuest(code, l, token, tries + 1);
          this.onlineMsg = 'The direct link to the host was lost.';
          this.leave(true);
          this.show('online');
        });
        return;
      }
      this.onlineMsg = 'The direct link to the host was lost.';
      this.leave(true);
      this.show('online');
    });
    s.connect();
    history.replaceState(null, '', inviteLink(code));
    if (!resume) this.toast('Direct link: no server in between');
    else {
      this.onlineMsg = '';
      this.toast('Reconnected to your friend');
    }
    void wasGame;
  }

  /**
   * A guest reached this host directly: the match moves into this page (the same Room the server runs) and the server
   * room is left. The listener stays on, so the guest (or anyone with the code) can link again after a drop.
   */
  private goDirectHost(code: string, link: DirectLink) {
    // already running the direct match: a re-link (or a spectator) joins it; the listener keeps going
    if (this.room && this.direct) {
      attachGuest(this.room, link);
      return;
    }
    const profile = this.profiles[0];
    this.leave(true);
    this.mode = 'online';
    this.code = code;
    this.direct = true;
    const room = directRoom(code);
    this.room = room;
    const s = new Session({ kind: 'local', room, owns: true }, profile);
    this.sessions = [s];
    this.wire(s);
    s.connect();
    // (the host's own Hello first, so it takes the first seat and host rights)
    setTimeout(() => attachGuest(room, link), 60);
    this.listener = new HostListener(code, (l) => this.goDirectHost(code, l), 3000);
    this.toast('Your friend linked straight to you: no server lag');
    this.show('lobby');
  }

  private connectOnline(code: string, hostKey?: string) {
    this.leave(true);
    this.mode = 'online';
    this.code = code;
    const s = new Session({ kind: 'ws', url: wsUrlFor(code) }, this.profiles[0], hostKey, () => onlineRoomExists(code));
    this.sessions = [s];
    this.wire(s);
    s.on('status', (st) => {
      if (st === 'closed' && this.screen !== 'title') {
        this.onlineMsg = this.onlineMsg || 'Disconnected.';
        this.leave(true);
        this.show('online');
      }
    });
    s.connect();
    history.replaceState(null, '', inviteLink(code));
    // the host also listens for a guest who can link straight to this device, but only while it waits alone in the
    // lobby: once a guest sits down through the server (or a match runs) nobody may pull it out by dialling the code
    if (hostKey) {
      const listen = (l: LobbyStateMsg | null) => {
        if (this.direct || this.sessions[0] !== s) return;
        const alone = !l || (l.phase === 'lobby' && l.roster.length <= 1);
        if (alone && !this.listener) this.listener = new HostListener(code, (link) => this.goDirectHost(code, link));
        else if (!alone && this.listener) {
          this.listener.stop();
          this.listener = null;
        }
      };
      listen(null);
      s.on('lobby', listen);
    }
  }

  private wire(s: Session) {
    s.on('lobby', (l: LobbyStateMsg) => {
      if (l.phase === 'lobby' && (this.screen === 'connecting' || this.screen === 'lobby' || this.screen === 'game')) {
        if (this.screen === 'game') this.endGameView();
        this.show('lobby');
      }
    });
    s.on('match', () => this.maybeStartGame());
    s.on('end', (m: MatchEndMsg) => {
      this.lastEnd = m;
      setTimeout(() => {
        if (this.screen === 'game') {
          this.endGameView();
          this.show('results');
        }
      }, 3200);
    });
    s.on('notice', (n) => {
      this.onlineMsg = n.text;
      this.toast(n.text);
    });
  }

  private maybeStartGame() {
    // every local session must have its match before the scene starts
    if (!this.sessions.every((s) => s.game)) return;
    if (this.screen === 'game') this.endGameView();
    this.startGameView();
  }

  private startGameView() {
    if (!this.game) return;
    const go = () => {
      // both fighters' atlases onto the GPU now: they finish while the VS card is up
      const g0 = this.sessions[0]?.game;
      if (g0) for (const f of g0.fighters(performance.now())) prefetchHeroSprites(f.hero, this.game!.textures);
      this.show('game');
      const inputs: LocalPlayer[] = [];
      const pads = (n: number) => new GamepadSource(n);
      if (this.mode === 'local') {
        inputs.push({ session: this.sessions[0], input: new MergedSource([new KeyboardSource('p1'), pads(0)]) });
        inputs.push({ session: this.sessions[1], input: new MergedSource([new KeyboardSource('p2'), pads(1)]) });
      } else {
        const me = this.sessions[0];
        const seat = me.roster.get(me.selfId)?.seat ?? -1;
        if (seat >= 0) {
          const src: (KeyboardSource | GamepadSource | TouchSource)[] = [new KeyboardSource('solo' as KeyScheme), pads(0)];
          if (isTouchDevice()) {
            this.touch = new TouchSource(this.ui);
            src.push(this.touch);
          }
          inputs.push({ session: me, input: new MergedSource(src) });
        }
      }
      this.inputs = inputs;
      this.hud = new Hud(this.ui);
      this.hud.onMenu = () => this.confirmLeave();
      this.game!.scene.start('game', { players: inputs, primary: this.sessions[0] });
      const scene = this.game!.scene.getScene('game') as GameScene;
      scene.onEvent = (e) => this.hud?.onEvent(e, this.sessions[0].roster, this.sessions[0].game!);
      let last = performance.now();
      const loop = () => {
        if (this.screen !== 'game' || !this.hud) return;
        const now = performance.now();
        const g = this.sessions[0]?.game;
        if (g) {
          this.hud.update(g, this.sessions[0].roster, this.sessions[0].rtt, (now - last) / 1000);
          if (this.touch) {
            const f = g.fighters(now).find((x) => x.self);
            if (f) {
              this.touch.show({
                aIcon: heroWeaponIcon(f.hero), bIcon: heroWeaponIcon(f.hero), skillIcon: skillIcon(f.skill), artIcon: heroArtIcon(f.hero),
                skillCd: f.skillCd / ((SKILLS[f.skill]?.cooldown ?? 1) * heroClass({ cls: f.cls, hero: f.hero }).skillCd), rollCd: f.rollCd / 40, flask: f.flask, rift: f.rift / RIFT.max,
                // (the Sun Crescent's cooldown sweeps the heavy button only: B still cleaves meanwhile)
                reload: f.reload && !hasCrescent(f) ? (f.heat - FIGHTER.heatReady) / (FIGHTER.heatMax - FIGHTER.heatReady) : 0,
                crescent: f.reload && hasCrescent(f) ? (f.heat - FIGHTER.heatReady) / (FIGHTER.crescentHeat - FIGHTER.heatReady) : 0,
              });
            }
          }
        }
        last = now;
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
      this.vsSplash();
    };
    if (this.booted) go();
    else this.game.events.once('booted', go);
  }

  /** A short VS card as the match starts: both heroes slide in from the sides, then it clears. Never takes input. */
  private vsSplash(tries = 0) {
    const s = this.sessions[0];
    const g = s?.game;
    if (!s || !g || this.screen !== 'game') return;
    const fs = g.fighters(performance.now());
    const mine = fs.find((f) => f.self) ?? fs[0];
    const theirs = fs.find((f) => f !== mine) ?? fs[1];
    // both fighters appear with the first world snapshot: wait a little for them
    if (!mine || !theirs) {
      if (tries < 40) window.setTimeout(() => this.vsSplash(tries + 1), 50);
      return;
    }
    const seat = s.roster.get(s.selfId)?.seat ?? -1;
    const foe = [...s.roster.values()].find((r) => r.seat >= 0 && r.seat !== seat);
    const who = (f: typeof mine, name: string) => {
      const h = heroOf(f.hero);
      return `<div class="vs-side"><div class="vs-frame"><img src="${heroPortrait(h)}" alt=""></div>
        <b>${esc(h.name)}</b><small>${esc(h.epithet)}</small><span>${esc(name)}</span><q class="vs-quote">${esc(quotesOf(f.hero).vs)}</q></div>`;
    };
    const el = document.createElement('div');
    el.className = 'vs-splash';
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = `<div class="vs-l">${who(mine, s.roster.get(s.selfId)?.name ?? this.profiles[0].name)}</div>
      <div class="vs-mark">VS</div>
      <div class="vs-r">${who(theirs, foe?.name ?? (this.mode === 'practice' ? 'Bot' : 'Opponent'))}</div>`;
    this.ui.appendChild(el);
    window.setTimeout(() => el.classList.add('out'), 1650);
    window.setTimeout(() => el.remove(), 2000);
  }

  private endGameView() {
    this.game?.scene.stop('game');
    this.hud?.destroy();
    this.hud = null;
    this.touch?.destroy();
    this.touch = null;
    for (const p of this.inputs) p.input.destroy();
    this.inputs = [];
  }

  private confirmLeave() {
    const el = document.createElement('div');
    el.className = 'modal';
    el.innerHTML = `<div class="card"><h3>Leave the duel?</h3><div class="row"><button data-x="stay" class="primary">Keep fighting</button><button data-x="go">Leave</button></div></div>`;
    this.ui.appendChild(el);
    el.addEventListener('click', (e) => {
      const x = (e.target as HTMLElement).dataset.x;
      if (x === 'go') this.leave();
      if (x) el.remove();
    });
  }

  private leave(silent = false) {
    if (this.screen === 'game') this.endGameView();
    this.listener?.stop();
    this.listener = null;
    this.direct = false;
    for (const s of this.sessions) s.close();
    this.sessions = [];
    this.room = null;
    if (this.mode === 'online' && !silent) history.replaceState(null, '', location.pathname);
    if (!silent) this.show('title');
  }

  /** The local session that is host (two players on one device may have either). */
  private hostSession() {
    return this.sessions.find((x) => x.isHost) ?? this.sessions[0];
  }

  private toast(text: string) {
    let el = document.querySelector<HTMLElement>('.toast');
    if (!el) {
      el = document.createElement('div');
      el.className = 'toast';
      document.body.appendChild(el);
    }
    el.textContent = text;
    el.classList.add('on');
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => el!.classList.remove('on'), 2600);
  }
}

void accentOf;
