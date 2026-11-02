import Phaser from 'phaser';
import QRCode from 'qrcode';
import {
  ARENAS, BotBrain, BotDifficulty, classOf, DEFAULT_LOADOUT, FIGHTER, GameEvent, hasCrescent, heroClass, heroOf, Loadout, LobbyStateMsg, MatchEndMsg,
  HeroDef, RIFT, Room, sanitizeLoadout, SKILLS, weaponLookOf,
} from '@bladerift/shared';
import { BootScene } from '../game/BootScene';
import { GameScene, LocalPlayer } from '../game/GameScene';
import { controlPrefs, GamepadSource, InputSource, isTouchDevice, keyLabels, KEY_LABEL, KeyboardSource, KeyScheme, MergedSource, refreshControls, TouchSource } from '../input/Controls';
import { Profile, Session } from '../net/Session';
import { localRoom } from '../net/transport';
import { attachGuest, dialHost, DirectLink, directRoom, HostListener } from '../net/p2p';
import {
  checkOnlineRoom, createOnlineRoom, hostedMatch, inviteLink, normalizeCode, onlineAvailable, onlineRoomExists, rememberHostedMatch, wsUrlFor,
} from '../net/online';
import { sfx } from '../audio/Sfx';
import { music } from '../audio/Music';
import { announcer } from '../audio/Announcer';
import { samples } from '../audio/Samples';
import { applyPrefsToDocument, prefs, Prefs } from './prefs';
import { Hud } from './Hud';
import { colorOf, css } from './colors';
import { checkForUpdate, CURRENT_RELEASE, updateReady } from '../update';
import { crestIcon, heroArtIcon, heroWeaponIcon, skillIcon } from './icons';
import { startTitleShowcase } from './titleShowcase';
import { prefetchHeroSprites } from '../render/spriteFighter';
import { warmAllAtlases } from '../render/atlasStore';
import { measureViewport, setViewport, viewH, viewW } from './viewport';
import { mountHeroSelect } from './heroSelect';
import { mountSettings } from './settingsScreen';
import { showVsSplash } from './vsSplash';
import { ArcadeRun, arcadeSummary, ArcadeStage, renderLadder, renderRunOver, renderSurvival, RunDifficulty, SurvivalFight, SurvivalRun, survivalSummary } from './modes';
import { recordMatch, renderStats } from './stats';
import { DummyMode, mountTraining, Training } from './training';
import { showMoveList } from './moveList';

/**
 * Screens. `game` hides the menus (the match runs under #ui); `modes` is a run's own screens (the arcade ladder, the
 * survival stage, the run-over card) drawn straight into #ui; `records` is the stats screen, drawn the same way.
 */
type Screen = 'title' | 'fighter' | 'online' | 'lobby' | 'game' | 'results' | 'settings' | 'howto' | 'connecting' | 'modes' | 'records';

/** The music track each menu screen plays (game and the run/record screens keep the current track or set their own). */
const TRACK: Partial<Record<Screen, 'title' | 'select' | 'results'>> = {
  title: 'title', howto: 'title', settings: 'title', records: 'title', online: 'title', connecting: 'title', modes: 'title',
  fighter: 'select', lobby: 'select', results: 'results',
};

/** Everything a match needs to start as a private practice room (the arcade, survival and training fights). */
interface FightOpts {
  arenaId: string;
  botLevel: BotDifficulty;
  /** The bot's hero (a HEROES id); unset: a random one. */
  botHero?: number;
  training?: boolean;
  infiniteRift?: boolean;
  /** Survival: each seat's health at the start (absolute points; 0 or less, or unset: full). */
  carryHp?: boolean;
  startHp?: number[];
  /** The mode name shown on the VS card. */
  label?: string;
}

/** Training menu state that outlives a match restart (the menu keeps its choices). */
interface TrainState {
  level: DummyMode;
  infinite: boolean;
  arena: string;
}

/** Per-match counters for the records and the training readout. */
interface MatchStat {
  startedAt: number;
  bestCombo: number;
  liveCombo: number;
  perfects: number;
  totalDamage: number;
  /** The local fighter has been hit since the round started (a perfect round has none). */
  tookDamage: boolean;
}

const PROFILE_KEYS = ['bladerift.profile', 'bladerift.profile2'];
const NAMES = ['Ronin', 'Vesper', 'Kael', 'Isolde', 'Marrow', 'Tamsin', 'Corvin', 'Wren'];

/** Hero portrait card (240x320, framed): assets/art/h-00.jpg .. h-13.jpg. */
const heroPortrait = (h: HeroDef) => `assets/art/h-${String(h.portrait).padStart(2, '0')}.jpg`;

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
  /** The hero select (the fighter screen) and the settings screen, while they are shown. */
  private heroSel: { destroy(): void } | null = null;
  private settingsUi: { destroy(): void } | null = null;
  /** The training overlay and its menu state. It stays mounted across match restarts (see mountTrainingUi). */
  private training: Training | null = null;
  private trainingEl: HTMLElement | null = null;
  private train: TrainState = { level: 'dummy-stand', infinite: false, arena: 'hall' };
  /** A training match is the one running (its own overlay, no results screen, no records). */
  private trainingOn = false;
  /** The arcade or survival run in progress (its screens go between the fights), and which kind it is. */
  private run: ArcadeRun | SurvivalRun | null = null;
  private runKind: 'arcade' | 'survival' | null = null;
  /** The match in progress: its label on the VS card, and its counters. */
  private label = 'Practice';
  private stat: MatchStat = { startedAt: 0, bestCombo: 0, liveCombo: 0, perfects: 0, totalDamage: 0, tookDamage: false };
  /** The K.O. has faded the HUD and the touch controls; the next round's intro brings them back. */
  private koHidden = false;
  /** A local match holds still (its room skips ticks) while the leave card or the move list is open. */
  private localHold = false;

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
    // the first tap or key unlocks every audio channel (browsers need a gesture); volumes follow the settings
    const unlock = () => {
      sfx.unlock();
      music.unlock();
      announcer.unlock();
      this.applyVolumes();
    };
    document.addEventListener('pointerdown', unlock, { capture: true });
    document.addEventListener('keydown', unlock, { capture: true });
    sfx.volume = prefs().volume;
    this.applyVolumes();
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
    this.teardown(s);
    this.screen = s;
    document.body.dataset.screen = s;
    const track = TRACK[s];
    if (track) music.play(track);
    // (the match, the run screens and the records draw their own content: see startGameView, showModes, records)
    if (s === 'game' || s === 'modes' || s === 'records') {
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
    this.ui.querySelectorAll<HTMLElement>('[data-keep]').forEach((el) => {
      const v = keep.get(el.dataset.keep!);
      if (v) [el.scrollLeft, el.scrollTop] = v;
    });
  }

  /**
   * Draws a run screen (the difficulty pick, the ladder, the survival stage, the run-over card) straight into #ui. It
   * takes the same teardown as show(); `track` is the music for it.
   */
  private showModes(draw: (root: HTMLElement) => void, track: 'title' | 'results' = 'title') {
    this.teardown('modes');
    this.screen = 'modes';
    document.body.dataset.screen = 'modes';
    music.play(track);
    this.ui.innerHTML = '';
    draw(this.ui);
  }

  /** Leaving a screen: its mounted widgets go (the hero select and settings listen for keys; training is a menu). */
  private teardown(next: Screen) {
    if (this.screen === 'fighter') {
      this.heroSel?.destroy();
      this.heroSel = null;
    }
    if (this.screen === 'settings') {
      this.settingsUi?.destroy();
      this.settingsUi = null;
    }
    if (next !== 'game') {
      if (this.training) this.dropTraining();
      this.trainingOn = false;
    }
  }

  /** Applies the channel volumes (Settings: master x channel) to the music, the sample pack and the announcer. */
  private applyVolumes(p: Prefs = prefs()) {
    music.setVolume(p.volume * p.musicVol);
    // (the sfx master gain already carries p.volume: Sfx routes the samples through it)
    samples.setVolume(p.sfxVol);
    announcer.setVolume(p.volume * p.voiceVol);
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
            <div class="menu-grid menu-grid-big">
              <button class="big primary" data-act="arcade">Arcade</button>
              <button class="big" data-act="survival">Survival</button>
              <button class="big" data-act="training">Training</button>
            </div>
            <div class="menu-grid menu-grid-vs">
              ${this.lan ? `<button class="big" data-act="lan">Join Wi&#8209;Fi duel</button>` : ''}
              ${onlineAvailable() ? `<button class="big" data-act="online">Play online</button>` : ''}
              <button class="big" data-act="practice">Practice vs bot</button>
              <button class="big" data-act="local">Two players, one device</button>
            </div>
            <div class="row menu-small"><button data-act="fighter">Fighter</button><button data-act="movelist">Move list</button><button data-act="records">Records</button><button data-act="howto">How to play</button><button data-act="settings">Settings</button></div>
          </div>
          <div class="credit">Effects &amp; animation: PixelFX (MIT) · build ${esc(String(import.meta.env.VITE_RELEASE ?? 'dev'))}</div>
        </div>`;
      case 'fighter':
        return `<div class="hsel-host"></div>`;
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
      case 'settings':
        return `<div class="settings-host"></div>`;
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

  /** A screen header: back button, title, and an optional tool button after the title (the lobby's Move list). */
  private header(title: string, back = 'back', tool = '') {
    return `<div class="hdr"><button class="back" data-act="${back}" aria-label="Back">‹</button><h2>${esc(title)}</h2>${tool}</div>`;
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
    return `${this.header(title, 'leave', '<button class="small hdr-tool" data-act="movelist">Move list</button>')}
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
    // (the solo column names the player's own keys when they were remapped in Settings)
    const k = { ...KEY_LABEL, solo: keyLabels('solo') };
    const row = (label: string, key: keyof (typeof k)['solo']) => `<tr><td>${label}</td><td>${k.solo[key]}</td><td>${k.p1[key]}</td><td>${k.p2[key]}</td></tr>`;
    return `${this.header('How to play')}
      <div class="howto">
      <div class="card howto-keys">
        <h3>Controls</h3>
        <table><tr><th></th><th>Keyboard</th><th>Player 1</th><th>Player 2</th></tr>
          ${row('Move', 'left')}${row('Jump (again in the air)', 'jump')}${row('Light attack (combo; an air combo in the air)', 'a')}${row('Heavy attack · plunge in the air', 'b')}${row('Skill', 'skill')}${row('Roll / air dash', 'roll')}${row('Heal flask', 'heal')}${row('Rift Art', 'special')}
        </table>
        <p class="howto-pad">Phone: ${controlPrefs().leftHanded ? 'joystick on the right, buttons on the left' : 'joystick on the left, buttons on the right'}. Gamepads work too (X / Y weapons, A jump, B roll, RB skill, LB heal, triggers Rift Art).</p>
      </div>
      <div class="card howto-rules" data-keep="howto">
        <h3>How to win</h3>
        <p>Knock your opponent out to win the round. Win the number of rounds set in the lobby (1, 2 or 3) to take the match. If time runs out, more health wins.</p>
        <p><b>Guard and parry:</b> hold <b>down</b> on the ground to guard against hits from the side you face (you take a little chip damage; heavy attacks break it). Press down <b>just before</b> a hit lands to <b>parry</b>: a melee attacker is staggered, and a shot flies straight back at whoever fired it. Swinging a melee weapon into a shot cuts it out of the air, so you can fight your way in against archers and casters.</p>
        <p><b>Classes and Rift Arts:</b> every hero fights with its own weapon, special, dodge and Rift Art. The Rift gauge under your health fills slowly on its own and fast when you hit or get hit; when it glows, unleash the Art. The Assassin's <b>Flash Step</b> even works while you are being comboed.</p>
        <ul>
          <li><b>Combos:</b> keep pressing a weapon button to chain its strikes.</li>
          <li><b>Hold</b> the Lance to charge a lunge, the Bow for a heavy shot, the Shield to block. Block just before a hit to <b>parry</b>.</li>
          <li><b>Launcher:</b> down + light on the ground pops them high into the air; jump after them and keep hitting.</li>
          <li><b>Air combo:</b> tap light attack while jumping or falling: two quick swings and a finisher that knocks them down. Your swings slow your fall, and a foe you juggle floats with you; land to start a new one.</li>
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
    // (mounted after the generic binding above, so their own buttons are not bound twice)
    if (this.screen === 'fighter') this.mountHeroSelect(root);
    if (this.screen === 'lobby') this.bindLobby(root);
    if (this.screen === 'settings') this.mountSettingsUi(root);
    if (this.screen === 'online') {
      const inp = root.querySelector<HTMLInputElement>('#code');
      inp?.addEventListener('keydown', (e) => e.key === 'Enter' && this.act('join', inp));
    }
  }

  /** The fighter screen: the hero select (its own state; the callbacks save each change to the profile being edited). */
  private mountHeroSelect(root: HTMLElement) {
    const host = root.querySelector<HTMLElement>('.hsel-host');
    if (!host) return;
    const p = this.profiles[this.editing];
    this.heroSel = mountHeroSelect(host, {
      hero: p.load.hero,
      color: p.color,
      name: p.name,
      onHero: (id) => {
        p.load = sanitizeLoadout({ ...p.load, hero: id });
        sfx.play('uiClick');
        saveProfile(this.editing, p);
      },
      onColor: (i) => {
        p.color = i;
        sfx.play('uiClick');
        saveProfile(this.editing, p);
      },
      onName: (name) => {
        p.name = name;
        saveProfile(this.editing, p);
      },
      onDone: () => this.act('back', host),
      onCursor: () => sfx.play('uiHover'),
    });
  }

  /** The settings screen: every change applies live (volumes, touch layout, key remap) and is saved by the prefs. */
  private mountSettingsUi(root: HTMLElement) {
    const host = root.querySelector<HTMLElement>('.settings-host');
    if (!host) return;
    this.settingsUi = mountSettings(host, {
      version: CURRENT_RELEASE,
      onChange: (p) => {
        sfx.volume = p.volume;
        this.applyVolumes(p);
        refreshControls();
        applyPrefsToDocument();
      },
      onBack: () => this.show('title'),
      onUpdate: () => {
        const b = host.querySelector<HTMLElement>('.update-btn');
        if (b) this.act('update', b);
      },
    });
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
      case 'records':
        this.show('records');
        renderStats(this.ui, () => this.show('title'));
        break;
      case 'movelist':
        showMoveList(this.ui, this.profiles[0].load.hero, () => {});
        break;
      case 'arcade':
        this.showModes((root) => this.drawDifficulty(root));
        break;
      case 'survival':
        this.startSurvival();
        break;
      case 'training':
        this.startTraining();
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
    this.holdLocal(this.room);
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
      this.onMatchOver(m, s);
      setTimeout(() => {
        if (this.screen === 'game') {
          this.endGameView();
          // a run's fight goes to the run's own screens; any other match to the results
          if (this.runKind) this.afterRunFight();
          else this.show('results');
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
      this.stat = { startedAt: performance.now(), bestCombo: 0, liveCombo: 0, perfects: 0, totalDamage: 0, tookDamage: false };
      this.koHidden = false;
      if (this.trainingOn) this.mountTrainingUi();
      else this.dropTraining();
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
            this.touch.setFaded(this.koHidden);
            src.push(this.touch);
          }
          const input: InputSource = new MergedSource(src);
          // (training reads the local input once per tick: the input column and the frame counts)
          inputs.push({ session: me, input: this.training ? this.tapInput(input) : input });
        }
      }
      this.inputs = inputs;
      this.hud = new Hud(this.ui);
      this.hud.onMenu = () => this.confirmLeave();
      this.game!.scene.start('game', { players: inputs, primary: this.sessions[0] });
      const scene = this.game!.scene.getScene('game') as GameScene;
      scene.onEvent = (e) => {
        this.hud?.onEvent(e, this.sessions[0].roster, this.sessions[0].game!);
        this.onFightEvent(e);
      };
      let last = performance.now();
      const loop = () => {
        if (this.screen !== 'game' || !this.hud) return;
        const now = performance.now();
        const g = this.sessions[0]?.game;
        if (g) {
          this.hud.update(g, this.sessions[0].roster, this.sessions[0].rtt, (now - last) / 1000);
          // the next round's intro brings the HUD and the touch controls back (the K.O. banners run first)
          if (this.koHidden && g.phase === 'intro') this.fadeHud(false);
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
      // the VS card (training has no match start to announce)
      if (!this.trainingOn) this.vsSplash();
    };
    if (this.booted) go();
    else this.game.events.once('booted', go);
  }

  /** Per-event hooks of the running match: the HUD's K.O. slow-mo and result words, the training readout, the counters. */
  private onFightEvent(e: GameEvent) {
    const s = this.sessions[0];
    const me = s?.selfId ?? -1;
    const mySeat = s?.roster.get(me)?.seat ?? -1;
    switch (e.t) {
      case 'fight':
        this.stat.tookDamage = false;
        this.fadeHud(false);
        break;
      case 'round': {
        // the K.O. slow-mo fades the HUD (its banners stay up) until the next round's intro. The result words (PERFECT,
        // DOUBLE K.O., TIME OVER) belong to the K.O. sequence in the scene, so the DOM does not draw them again.
        if (e.why === 0) this.fadeHud(true);
        if (e.winner === mySeat && !this.stat.tookDamage && e.why === 0) this.stat.perfects++;
        break;
      }
      case 'hit':
        if (e.v === me) this.stat.tookDamage = true;
        // (burning ticks are not combo hits: the sim numbers them 0)
        if (e.a !== me || e.v === me || e.n === 0) break;
        this.stat.totalDamage += e.amt;
        this.stat.liveCombo = e.n;
        this.stat.bestCombo = Math.max(this.stat.bestCombo, e.n);
        // (the training overlay carries the damage, combo, hits and best readout; the HUD's own training line would sit on it)
        if (this.trainingOn) this.training?.setHit({ damage: e.amt, combo: e.n });
        break;
      default:
        break;
    }
  }

  /** Passes every read of a local input source to the training overlay (one read per sim tick). */
  private tapInput(src: InputSource): InputSource {
    return {
      read: () => {
        const i = src.read();
        this.training?.pushInput(i.buttons, i.moveX, i.moveY);
        return i;
      },
      destroy: () => src.destroy(),
    };
  }

  /** Mounts the training overlay once. A restart re-attaches the same one, so its menu keeps the choices made. */
  private mountTrainingUi() {
    if (this.training && this.trainingEl) {
      this.ui.appendChild(this.trainingEl);
      return;
    }
    this.training = mountTraining(this.ui, {
      onDummy: (mode) => this.setDummy(mode),
      onInfiniteRift: (on) => this.setInfinite(on),
      onReset: () => this.restartTraining(),
      onMoveList: () => this.openMoveList(),
    });
    this.trainingEl = this.ui.lastElementChild as HTMLElement;
  }

  private dropTraining() {
    this.training?.destroy();
    this.training = null;
    this.trainingEl = null;
  }

  /** The dummy's behaviour changes live: the bot gets a brain at the new level (no restart). */
  private setDummy(mode: DummyMode) {
    this.train.level = mode;
    const r = this.room;
    if (!r) return;
    r.botLevel = mode;
    if (r.bot) r.bot.brain = new BotBrain(r.bot.id, r.bot.id * 7919, mode);
  }

  /** The Rift gauge stays full while on (the running match reads its own copy of the settings each tick). */
  private setInfinite(on: boolean) {
    this.train.infinite = on;
    const r = this.room;
    if (!r) return;
    r.settings.infiniteRift = on;
    if (r.world) r.world.settings.infiniteRift = on;
  }

  /** Reset: the same training match again, both fighters back at their start (the readout starts from zero). */
  private restartTraining() {
    this.training?.reset();
    this.startFight({ arenaId: this.train.arena, botLevel: this.train.level, training: true, infiniteRift: this.train.infinite, label: 'Training' });
  }

  private startTraining() {
    this.endRun();
    this.train = { level: 'dummy-stand', infinite: false, arena: 'hall' };
    this.startFight({ arenaId: this.train.arena, botLevel: this.train.level, training: true, infiniteRift: false, label: 'Training' });
  }

  /**
   * Starts a private practice match (the arcade ladder, survival and training fights): a room of its own with the bot in
   * the second seat, the match begins at once and skips the lobby.
   */
  private startFight(o: FightOpts) {
    this.leave(true);
    // (the previous match's view is ended by leave; the lobby listener only acts on the lobby screens, so wait on this one)
    this.screen = 'modes';
    this.mode = 'practice';
    this.trainingOn = !!o.training;
    this.label = o.label ?? 'Practice';
    const room = localRoom('Practice');
    this.room = room;
    this.holdLocal(room);
    room.settings = {
      ...room.settings,
      arenaId: o.arenaId,
      training: !!o.training,
      infiniteRift: !!o.infiniteRift,
      botHero: o.botHero,
      carryHp: !!o.carryHp,
      startHp: o.startHp,
    };
    room.botOn = true;
    room.botLevel = o.botLevel;
    const a = new Session({ kind: 'local', room, owns: true }, this.profiles[0]);
    this.sessions = [a];
    this.wire(a);
    a.connect();
    // the local transport opens on the next microtask: then the duel starts, the way the lobby's Fight button starts it
    queueMicrotask(() => a.lobbyCmd({ op: 'start' }));
  }

  /** The difficulty pick of the arcade ladder: the bots step down (easy) or up (hard) the whole ladder. */
  private drawDifficulty(root: HTMLElement) {
    const opts: { id: RunDifficulty; name: string; blurb: string }[] = [
      { id: 'easy', name: 'Easy', blurb: 'Every opponent one step softer' },
      { id: 'normal', name: 'Normal', blurb: 'The ladder as designed' },
      { id: 'hard', name: 'Hard', blurb: 'Every opponent one step harder' },
    ];
    root.innerHTML = `<div class="screen modes-screen md-pick">
      <div class="md-wrap">
        <header class="md-hdr">
          <button class="md-back" data-x="back" type="button">Back</button>
          <div class="md-title"><h2>Arcade</h2><span class="md-sub">Seven fights up the tower, the last one a boss. Three continues.</span></div>
        </header>
        <div class="md-pick-list">
          ${opts.map((o) => `<button class="big md-pick-btn" data-diff="${o.id}" type="button"><b>${o.name}</b><small>${o.blurb}</small></button>`).join('')}
        </div>
      </div>
    </div>`;
    root.querySelector<HTMLElement>('[data-x="back"]')?.addEventListener('click', () => this.show('title'));
    root.querySelectorAll<HTMLElement>('[data-diff]').forEach((el) =>
      el.addEventListener('click', () => {
        sfx.play('uiClick');
        this.startArcade(el.dataset.diff as RunDifficulty);
      }),
    );
  }

  private startArcade(diff: RunDifficulty) {
    this.endRun();
    this.runKind = 'arcade';
    this.run = new ArcadeRun(this.profiles[0].load.hero, diff, (Math.random() * 1e9) | 0);
    this.showLadder();
  }

  private showLadder() {
    const run = this.run;
    if (!(run instanceof ArcadeRun)) return;
    this.showModes((root) => renderLadder(root, run, (stage) => this.fightArcade(stage), () => this.quitRun()));
  }

  private fightArcade(stage: ArcadeStage) {
    this.startFight({
      arenaId: stage.arenaId,
      botLevel: stage.botLevel,
      botHero: stage.heroId,
      label: `Arcade ${stage.stage}/${stage.total}${stage.boss ? ' · Boss' : ''}`,
    });
  }

  private startSurvival() {
    this.endRun();
    this.runKind = 'survival';
    this.run = new SurvivalRun(this.profiles[0].load.hero, (Math.random() * 1e9) | 0);
    this.showSurvival();
  }

  private showSurvival() {
    const run = this.run;
    if (!(run instanceof SurvivalRun)) return;
    this.showModes((root) => renderSurvival(root, run, (f) => this.fightSurvival(f), () => this.quitRun()));
  }

  private fightSurvival(f: SurvivalFight) {
    // the run's health is a fraction of full health; the room takes absolute points
    const hp = Math.round(f.startHp * heroClass(this.profiles[0].load).hp);
    this.startFight({
      arenaId: f.arenaId,
      botLevel: f.botLevel,
      botHero: f.heroId,
      carryHp: true,
      startHp: [hp, -1],
      label: `Survival · Fight ${f.fight}`,
    });
  }

  /** A run's fight has ended and is recorded: the run's next screen, or its end card. */
  private afterRunFight() {
    const run = this.run;
    if (run instanceof ArcadeRun) {
      if (!run.done()) return this.showLadder();
      const cleared = run.cleared();
      this.showRunOver(
        { title: cleared ? 'Ladder cleared' : 'Defeated', stats: arcadeSummary(run), tone: cleared ? 'win' : 'lose', retryLabel: 'New run' },
        () => this.startArcade(run.difficulty),
      );
    } else if (run instanceof SurvivalRun) {
      if (!run.done()) return this.showSurvival();
      this.showRunOver({ title: 'Run over', stats: survivalSummary(run), tone: 'lose', retryLabel: 'New run' }, () => this.startSurvival());
    } else this.show('title');
  }

  private showRunOver(opts: { title: string; stats: string[]; tone: 'win' | 'lose'; retryLabel: string }, retry: () => void) {
    this.showModes((root) => renderRunOver(root, opts, retry, () => this.quitRun()), 'results');
  }

  /** Ends the run in progress (a quit or a leave). The run records its own result once. */
  private endRun() {
    this.run?.quit();
    this.run = null;
    this.runKind = null;
  }

  /** Quits a run (or training) to the title: the match is left and the run recorded. */
  private quitRun() {
    this.endRun();
    this.leave(true);
    this.show('title');
  }

  /** A match ended, as the local seat saw it: the records, the run's result, the victory track. */
  private onMatchOver(m: MatchEndMsg, s: Session) {
    if (this.trainingOn) return;
    const me = s.roster.get(s.selfId);
    const seat = me?.seat ?? -1;
    // a spectator has no seat to record
    if (!me || seat < 0) return;
    const won = m.winnerId === s.selfId;
    const foe = [...s.roster.values()].find((r) => r.seat >= 0 && r.seat !== seat);
    recordMatch({
      hero: me.load.hero,
      foeHero: foe?.load.hero ?? me.load.hero,
      won,
      roundsWon: m.wins[seat] ?? 0,
      roundsLost: m.wins[1 - seat] ?? 0,
      perfects: this.stat.perfects,
      bestCombo: this.stat.bestCombo,
      seconds: (performance.now() - this.stat.startedAt) / 1000,
      mode: this.runKind ?? this.mode,
    });
    const run = this.run;
    if (run instanceof ArcadeRun) run.recordResult(won);
    else if (run instanceof SurvivalRun) run.recordResult(won, this.survivalHp(seat, me.load));
    music.play('victory');
  }

  /** The local fighter's health when a survival fight ended, as a fraction of full health (the room keeps it). */
  private survivalHp(seat: number, load: Loadout): number {
    const left = this.room?.settings.startHp?.[seat];
    if (left === undefined || left < 0) return 0;
    return Math.min(1, left / heroClass(load).hp);
  }

  /** The VS card as the match starts: both heroes, names, arena and mode. Presentation only; it takes no input. */
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
    const me = s.roster.get(s.selfId);
    const foe = [...s.roster.values()].find((r) => r.seat >= 0 && r.seat !== seat);
    const arena = ARENAS.find((a) => a.id === s.lobby?.settings.arenaId)?.name ?? 'Arena';
    const modeLabel = this.runKind ? this.label : this.mode === 'practice' ? 'Practice' : this.mode === 'local' ? 'Two players' : undefined;
    void showVsSplash(this.ui, {
      p1: { heroId: mine.hero, playerName: me?.name ?? this.profiles[0].name, color: css(colorOf(me?.color ?? this.profiles[0].color)) },
      p2: { heroId: theirs.hero, playerName: foe?.name ?? (this.mode === 'practice' ? 'Bot' : 'Opponent'), color: css(colorOf(foe?.color ?? 1)) },
      arenaName: arena,
      modeLabel,
    });
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

  /** Fades the HUD and the touch controls together: the K.O. fades them, the next round's intro brings them back. */
  private fadeHud(on: boolean) {
    this.koHidden = on;
    this.hud?.setHidden(on);
    this.touch?.setFaded(on);
  }

  /**
   * A local room (practice, arcade, survival, training, same device) runs its own tick loop. Its tick is skipped while an
   * in-match overlay is open (see localHold), so the bot and the clock wait for the player. Online rooms are not wrapped.
   */
  private holdLocal(room: Room) {
    const step = room.tick.bind(room);
    room.tick = () => {
      if (!this.localHold) step();
    };
  }

  /** The move list opened from a match (the leave card or the training menu): the local match holds still until it closes. */
  private openMoveList() {
    this.localHold = true;
    showMoveList(this.ui, this.profiles[0].load.hero, () => {
      this.localHold = false;
    });
  }

  private confirmLeave() {
    // the local match holds still while the card is up; Keep fighting (or the move list's Close) resumes it
    this.localHold = true;
    const el = document.createElement('div');
    el.className = 'modal';
    el.innerHTML = `<div class="card"><h3>Leave the duel?</h3><div class="row"><button data-x="stay" class="primary">Keep fighting</button><button data-x="moves">Move list</button><button data-x="go">Leave</button></div></div>`;
    this.ui.appendChild(el);
    el.addEventListener('click', (e) => {
      const x = (e.target as HTMLElement).dataset.x;
      if (x === 'moves') {
        el.remove();
        this.openMoveList();
        return;
      }
      if (x === 'go') this.leave();
      if (x) {
        el.remove();
        this.localHold = false;
      }
    });
  }

  private leave(silent = false) {
    // (a silent leave starts another match at once, so a run in progress carries on; a real leave ends it)
    if (!silent) this.endRun();
    if (this.screen === 'game') this.endGameView();
    this.listener?.stop();
    this.listener = null;
    this.direct = false;
    this.localHold = false;
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

