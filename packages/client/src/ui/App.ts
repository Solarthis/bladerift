import Phaser from 'phaser';
import QRCode from 'qrcode';
import {
  ARENAS, artOf, CLASSES, classOf, DEFAULT_LOADOUT, Loadout, LobbyStateMsg, MatchEndMsg, RIFT, Room, sanitizeLoadout, SKILLS, SKILL_COUNT, WEAPONS,
  WEAPON_COUNT,
} from '@bladerift/shared';
import { BootScene } from '../game/BootScene';
import { GameScene, LocalPlayer } from '../game/GameScene';
import { GamepadSource, isTouchDevice, KEY_LABEL, KeyboardSource, KeyScheme, MergedSource, TouchSource } from '../input/Controls';
import { Profile, Session } from '../net/Session';
import { localRoom } from '../net/transport';
import {
  checkOnlineRoom, createOnlineRoom, hostedMatch, inviteLink, normalizeCode, onlineAvailable, onlineRoomExists, rememberHostedMatch, wsUrlFor,
} from '../net/online';
import { sfx } from '../audio/Sfx';
import { prefs, setPref } from './prefs';
import { Hud } from './Hud';
import { ACCENTS, accentOf, COLORS, colorOf, css } from './colors';
import { artIcon, crestIcon, skillIcon, weaponIcon } from './icons';
import { measureViewport, setViewport, viewH, viewW } from './viewport';
import { drawPreview } from './preview';

type Screen = 'title' | 'fighter' | 'online' | 'lobby' | 'game' | 'results' | 'settings' | 'howto' | 'connecting';

const PROFILE_KEYS = ['bladerift.profile', 'bladerift.profile2'];
const NAMES = ['Ronin', 'Vesper', 'Kael', 'Isolde', 'Marrow', 'Tamsin', 'Corvin', 'Wren'];

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
  private profiles: [Profile, Profile] = [loadProfile(0), loadProfile(1)];
  /** Which profile the fighter screen edits, and where it returns. */
  private editing = 0;
  private editBack: Screen = 'title';
  private sessions: Session[] = [];
  private room: Room | null = null;
  private mode: 'online' | 'practice' | 'local' = 'practice';
  private hud: Hud | null = null;
  private touch: TouchSource | null = null;
  private inputs: LocalPlayer[] = [];
  private code = '';
  private lastEnd: MatchEndMsg | null = null;
  private onlineMsg = '';
  private toastTimer = 0;

  start() {
    this.fit();
    addEventListener('resize', () => this.fit());
    window.visualViewport?.addEventListener('resize', () => this.fit());
    setInterval(() => this.fit(), 1000);
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
    this.ui.innerHTML = `<div class="screen screen-${s}">${this.render(s)}</div>`;
    this.bind(this.ui.firstElementChild as HTMLElement);
  }

  private render(s: Screen): string {
    switch (s) {
      case 'title':
        return `<div class="title-wrap">
          <div class="logo"><span>BLADE</span><span>RIFT</span></div>
          <div class="tag">One rift. Two fighters. Pick your blades.</div>
          <div class="menu">
            ${onlineAvailable() ? `<button class="big primary" data-act="online">Play online</button>` : ''}
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
          <label class="check"><input type="checkbox" ${p.damageNumbers ? 'checked' : ''} data-pref="damageNumbers"> Damage numbers</label>
          <label class="check"><input type="checkbox" ${p.haptics ? 'checked' : ''} data-pref="haptics"> Vibration</label>
        </div>`;
      }
      case 'howto':
        return this.renderHowto();
      default:
        return '';
    }
  }

  private header(title: string, back = 'back') {
    return `<div class="hdr"><button class="back" data-act="${back}" aria-label="Back">‹</button><h2>${esc(title)}</h2></div>`;
  }

  private renderFighter() {
    const p = this.profiles[this.editing];
    const tile = (kind: string, i: number, icon: string, name: string, on: boolean) =>
      `<button class="tile ${on ? 'on' : ''}" data-pick="${kind}" data-i="${i}" title="${esc(name)}"><img src="${icon}" alt=""><span>${esc(name)}</span></button>`;
    const C = classOf(p.load.cls);
    const weapons = (slot: number) =>
      Array.from({ length: WEAPON_COUNT }, (_, i) => i)
        .filter((i) => i !== C.signature)
        .map((i) => tile(`w${slot}`, i, weaponIcon(i), WEAPONS[i].short, p.load.weapons[slot] === i))
        .join('');
    const bar = (label: string, v: number) => `<div class="stat"><span>${label}</span><i>${'<b></b>'.repeat(v)}${'<em></em>'.repeat(5 - v)}</i></div>`;
    const classes = CLASSES.map(
      (k) => `<button class="cls ${k.id === C.id ? 'on' : ''}" data-pick="cls" data-i="${k.id}" title="${esc(k.name)}"><img src="${crestIcon(k.id)}" alt=""><span>${esc(k.name)}</span></button>`,
    ).join('');
    const art = artOf(C.id);
    const skills = Array.from({ length: SKILL_COUNT }, (_, i) => tile('skill', i, skillIcon(i), SKILLS[i].name, p.load.skill === i)).join('');
    const sw = (kind: string, list: { name: string; rgb: number }[], cur: number) =>
      list.map((c, i) => `<button class="sw ${cur === i ? 'on' : ''}" data-pick="${kind}" data-i="${i}" style="--c:${css(c.rgb)}" title="${c.name}"></button>`).join('');
    const wa = WEAPONS[p.load.weapons[0]];
    const wb = WEAPONS[p.load.weapons[1]];
    const sk = SKILLS[p.load.skill];
    return `${this.header(this.editing ? 'Player 2 fighter' : 'Your fighter')}
      <div class="fighter-grid">
        <div class="card preview-card">
          <canvas id="preview" width="200" height="200"></canvas>
          <input id="fname" maxlength="16" value="${esc(p.name)}" placeholder="Name">
          <div class="sws">${sw('color', COLORS, p.color)}</div>
          <div class="sws small">${sw('accent', ACCENTS, p.look?.accent ?? 0)}</div>
        </div>
        <div class="card gear-card">
          <h3>Class</h3><div class="tiles classes">${classes}</div>
          <div class="class-info">
            <img class="crest" src="${crestIcon(C.id)}" alt="">
            <div><b>${esc(C.name)}</b> <small>${esc(C.title)}</small><p>${esc(C.blurb)}</p>
              <div class="stats">${bar('Power', C.bars.power)}${bar('Speed', C.bars.speed)}${bar('Health', C.bars.health)}${bar('Reach', C.bars.reach)}</div></div>
            <div class="art-box"><img src="${artIcon(C.id)}" alt=""><div><small>Rift Art</small><b>${esc(art.name)}</b><p>${esc(art.blurb)}</p></div></div>
          </div>
          <h3>Signature weapon <small>${esc(wa.name)}: ${esc(wa.blurb)}</small></h3><div class="tiles"><div class="tile on locked"><img src="${weaponIcon(C.signature)}" alt=""><span>${esc(wa.short)}</span></div></div>
          <h3>Second weapon <small>${esc(wb.blurb)}</small></h3><div class="tiles">${weapons(1)}</div>
          <h3>Skill <small>${esc(sk.blurb)}</small></h3><div class="tiles">${skills}</div>
          <button class="primary done" data-act="back">Done</button>
        </div>
      </div>`;
  }

  private renderLobby() {
    const s = this.sessions[0];
    const l = s?.lobby;
    if (!s || !l) return `<div class="center-msg"><div class="spinner"></div>Waiting for the host…</div>`;
    const host = s.isHost;
    const seatCard = (seat: number) => {
      const r = [...s.roster.values()].find((x) => x.seat === seat);
      const isMe = this.sessions.some((x) => x.selfId === r?.id);
      if (!r) {
        const bot = l.bot ? `<div class="seat-bot">Bot (${l.botLevel})</div>` : `<div class="seat-empty">Waiting for a challenger…</div>`;
        return `<div class="seat empty">${bot}${this.mode === 'online' && !this.sessions.some((x) => s.roster.get(x.selfId)?.seat === seat) ? `<button class="small" data-seat="${seat}">Take this side</button>` : ''}</div>`;
      }
      const gear = r.load.weapons.map((w) => `<img src="${weaponIcon(w)}" title="${WEAPONS[w].name}">`).join('') + `<img src="${skillIcon(r.load.skill)}" title="${SKILLS[r.load.skill].name}">`;
      const which = this.sessions.findIndex((x) => x.selfId === r.id);
      return `<div class="seat" style="--c:${css(colorOf(r.color))}"><canvas class="seat-pv" data-color="${r.color}" data-accent="${r.look?.accent ?? 0}" data-w="${r.load.weapons[0]}" data-flip="${seat}" width="120" height="120"></canvas>
        <b>${esc(r.name)}${r.host ? ' <i class="crown" title="Host">★</i>' : ''}</b><div class="seat-class"><img src="${crestIcon(r.load.cls)}" alt="">${esc(classOf(r.load.cls).name)}</div><div class="gear">${gear}</div>
        ${isMe ? `<button class="small" data-act="gear" data-who="${which}">Change gear</button>` : r.ping ? `<span class="ping">${r.ping} ms</span>` : ''}</div>`;
    };
    const watchers = [...s.roster.values()].filter((r) => r.seat < 0);
    const arenaCards = ARENAS.map((a) => `<button class="arena ${l.settings.arenaId === a.id ? 'on' : ''}" ${host ? `data-arena="${a.id}"` : 'disabled'}><img src="assets/art/bg-${a.theme}.jpg" alt=""><span>${a.name}</span></button>`).join('');
    const opt = (k: string, v: number, label: string, cur: number) => `<button class="seg ${cur === v ? 'on' : ''}" ${host ? `data-set="${k}" data-v="${v}"` : 'disabled'}>${label}</button>`;
    const codeBox = this.mode === 'online' ? `<div class="code-box"><div><small>Match code</small><b>${esc(this.code)}</b></div><img id="qr" alt="QR code"><button class="small" data-act="share">Share link</button></div>` : '';
    const title = this.mode === 'online' ? 'Duel lobby' : this.mode === 'local' ? 'Two players' : 'Practice';
    const botRow = this.mode !== 'local' ? `<div class="opt"><span>Bot</span>${host ? `<button class="seg ${l.bot ? 'on' : ''}" data-act="bot">${l.bot ? 'On' : 'Off'}</button>` : `<span>${l.bot ? 'On' : 'Off'}</span>`}
      ${(['easy', 'normal', 'hard'] as const).map((lv) => `<button class="seg ${l.botLevel === lv ? 'on' : ''}" ${host ? `data-level="${lv}"` : 'disabled'}>${lv}</button>`).join('')}</div>` : '';
    return `${this.header(title, 'leave')}
      <div class="lobby">
        <div class="seats">${seatCard(0)}<div class="vs">VS</div>${seatCard(1)}</div>
        ${watchers.length ? `<div class="watchers">Watching: ${watchers.map((w) => esc(w.name)).join(', ')}</div>` : ''}
        <div class="card lobby-opts">
          ${codeBox}
          <div class="arenas">${arenaCards}</div>
          <div class="opt"><span>Rounds to win</span>${opt('wins', 1, '1', l.settings.wins)}${opt('wins', 2, '2', l.settings.wins)}${opt('wins', 3, '3', l.settings.wins)}</div>
          <div class="opt"><span>Round time</span>${opt('roundTime', 60, '60s', l.settings.roundTime)}${opt('roundTime', 90, '90s', l.settings.roundTime)}${opt('roundTime', 120, '120s', l.settings.roundTime)}</div>
          ${botRow}
          ${host ? `<button class="big primary" data-act="start">Fight!</button>` : `<div class="wait">The host starts the duel.</div>`}
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
      return `<div class="res-side ${m.winner === seat ? 'won' : ''}" style="--c:${css(colorOf(e?.color ?? 0))}"><b>${esc(e?.name ?? '—')}</b>
        <div class="big-num">${m.wins[seat]}</div><small>rounds</small><div>${r?.dealt ?? 0} damage · ${r?.hits ?? 0} hits</div></div>`;
    };
    const winner = s.roster.get(m.winnerId)?.name ?? 'Winner';
    return `<div class="results"><h1>${esc(winner)} wins!</h1><div class="res-row">${row(0)}${row(1)}</div>
      <div class="row">${s.isHost ? `<button class="big primary" data-act="rematch">Rematch</button>` : ''}<button class="big" data-act="toLobby">Lobby</button><button class="big" data-act="leave">Main menu</button></div></div>`;
  }

  private renderHowto() {
    const k = KEY_LABEL;
    const row = (label: string, key: keyof (typeof k)['solo']) => `<tr><td>${label}</td><td>${k.solo[key]}</td><td>${k.p1[key]}</td><td>${k.p2[key]}</td></tr>`;
    return `${this.header('How to play')}
      <div class="card howto">
        <p>Knock your opponent out to win the round. Win ${'2'} rounds to take the match. If time runs out, more health wins.</p>
        <table><tr><th></th><th>Keyboard</th><th>Player 1</th><th>Player 2</th></tr>
          ${row('Move', 'left')}${row('Jump (again in the air)', 'jump')}${row('Signature weapon', 'a')}${row('Second weapon', 'b')}${row('Skill', 'skill')}${row('Roll / air dash', 'roll')}${row('Heal flask', 'heal')}${row('Rift Art', 'special')}
        </table>
        <p>Phone: joystick on the left, buttons on the right. Gamepads work too (X / Y weapons, A jump, B roll, RB skill, LB heal, triggers Rift Art).</p>
        <p><b>Classes and Rift Arts:</b> every class has a signature weapon and a Rift Art. The Rift gauge under your health fills slowly on its own and fast when you hit or get hit; when it glows, unleash the Art. The Assassin's <b>Flash Step</b> even works while you are being comboed.</p>
        <ul>
          <li><b>Combos:</b> keep pressing a weapon button to chain its strikes.</li>
          <li><b>Hold</b> the Lance to charge a lunge, the Bow for a heavy shot, the Shield to block. Block just before a hit to <b>parry</b>.</li>
          <li><b>Down + attack</b> in the air: a plunging strike that bounces you off a hit. <b>Down + jump</b>: drop through a ledge. <b>Down</b> in the air falls fast; on the ground it crouches under high swings.</li>
          <li><b>Walls and ledges:</b> slide down a wall and jump off it; grab a ledge and jump to climb. <b>Roll in the air</b> to dash. A hit that lands can be cancelled into a jump.</li>
          <li>Rolling makes you untouchable for a moment. One heal flask per round, and a hit while drinking spills it.</li>
        </ul>
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
    const cv = root.querySelector<HTMLCanvasElement>('#preview')!;
    drawPreview(cv, p.color, p.look?.accent ?? 0, p.load.weapons[0], false);
    root.querySelector<HTMLInputElement>('#fname')!.addEventListener('input', (e) => {
      p.name = (e.target as HTMLInputElement).value.slice(0, 16) || p.name;
      saveProfile(this.editing, p);
    });
    root.querySelectorAll<HTMLElement>('[data-pick]').forEach((el) =>
      el.addEventListener('click', () => {
        const i = Number(el.dataset.i);
        const k = el.dataset.pick!;
        if (k === 'color') p.color = i;
        else if (k === 'cls') p.load = sanitizeLoadout({ ...p.load, cls: i });
        else if (k === 'accent') p.look = { ...p.look!, accent: i };
        else if (k === 'skill') p.load = { ...p.load, skill: i };
        else {
          const slot = k === 'w0' ? 0 : 1;
          const w = [...p.load.weapons] as Loadout['weapons'];
          if (w[slot ^ 1] === i) w[slot ^ 1] = w[slot];
          w[slot] = i;
          p.load = sanitizeLoadout({ weapons: w, skill: p.load.skill });
        }
        sfx.play('uiClick');
        saveProfile(this.editing, p);
        this.show('fighter');
      }),
    );
  }

  private bindLobby(root: HTMLElement) {
    const s = this.sessions[0];
    root.querySelectorAll<HTMLElement>('[data-arena]').forEach((el) => el.addEventListener('click', () => s.lobbyCmd({ op: 'settings', settings: { arenaId: el.dataset.arena } })));
    root.querySelectorAll<HTMLElement>('[data-set]').forEach((el) => el.addEventListener('click', () => s.lobbyCmd({ op: 'settings', settings: { [el.dataset.set!]: Number(el.dataset.v) } })));
    root.querySelectorAll<HTMLElement>('[data-level]').forEach((el) => el.addEventListener('click', () => s.lobbyCmd({ op: 'botLevel', level: el.dataset.level as 'easy' })));
    root.querySelectorAll<HTMLElement>('[data-seat]').forEach((el) => el.addEventListener('click', () => s.lobbyCmd({ op: 'seat', seat: Number(el.dataset.seat) })));
    root.querySelectorAll<HTMLCanvasElement>('.seat-pv').forEach((cv) => drawPreview(cv, Number(cv.dataset.color), Number(cv.dataset.accent), Number(cv.dataset.w), cv.dataset.flip === '1'));
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
      case 'practice':
        this.startLocal('practice');
        break;
      case 'local':
        this.startLocal('local');
        break;
      case 'bot':
        this.sessions[0]?.lobbyCmd({ op: 'bot', on: !this.sessions[0].lobby?.bot });
        break;
      case 'start':
        this.sessions[0]?.lobbyCmd({ op: 'start' });
        break;
      case 'rematch':
        this.sessions[0]?.lobbyCmd({ op: 'rematch' });
        break;
      case 'toLobby':
        if (this.sessions[0]?.isHost) this.sessions[0].lobbyCmd({ op: 'toLobby' });
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
    try {
      await checkOnlineRoom(code);
      const mine = hostedMatch();
      this.connectOnline(code, mine?.code === code ? mine.hostKey : undefined);
    } catch (e) {
      this.onlineMsg = (e as { status?: number }).status === 404 ? `No match with the code ${code}.` : (e as Error).message;
      this.show('online');
    }
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
                aIcon: weaponIcon(f.weapons[0]), bIcon: weaponIcon(f.weapons[1]), skillIcon: skillIcon(f.skill), artIcon: artIcon(f.cls),
                skillCd: f.skillCd / ((SKILLS[f.skill]?.cooldown ?? 1) * classOf(f.cls).skillCd), rollCd: f.rollCd / 40, flask: f.flask, rift: f.rift / RIFT.max,
              });
            }
          }
        }
        last = now;
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    };
    if (this.booted) go();
    else this.game.events.once('booted', go);
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
    for (const s of this.sessions) s.close();
    this.sessions = [];
    this.room = null;
    if (this.mode === 'online' && !silent) history.replaceState(null, '', location.pathname);
    if (!silent) this.show('title');
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
