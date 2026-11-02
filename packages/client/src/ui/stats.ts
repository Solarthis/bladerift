/**
 * Local player records: per-hero duel totals, the overall win streak, arcade bests and survival bests. They live in this
 * browser's localStorage under one versioned key and never reach the server. Every storage access is guarded, so a
 * private window or a blocked store just means the records are kept in memory for the visit. The records screen
 * (renderStats) is read-only. The lead wires recordMatch into the match end, and modes.ts calls recordArcade and
 * recordSurvival.
 */
import { HEROES, heroOf } from '@bladerift/shared';
import './stats.css';

export const STATS_KEY = 'bladerift.stats';
/** Bump when the stored shape changes; a stored record with another version is dropped and started again. */
export const STATS_VERSION = 1;
/** Arcade ladder length (ARCADE_STAGES in modes.ts; repeated here so this module has no import cycle). */
const LADDER = 7;

/** One finished duel, as the match end reports it for the local player. */
export interface MatchResult {
  /** The local player's hero id. */
  hero: number;
  /** The opposing hero id (for the head-to-head line). */
  foeHero: number;
  won: boolean;
  roundsWon: number;
  roundsLost: number;
  perfects: number;
  bestCombo: number;
  seconds: number;
  /** Match mode, for example 'online', 'lan', 'practice' or 'local'. */
  mode: string;
}

/** A hero's duel totals. */
export interface HeroRecord {
  wins: number;
  losses: number;
  roundsWon: number;
  roundsLost: number;
  perfects: number;
  bestCombo: number;
  seconds: number;
}

/** Wins and losses of one hero against another. */
export interface Matchup {
  wins: number;
  losses: number;
}

/** The arcade ladder for one hero: the highest stage reached (1-based) and the full clears. */
export interface ArcadeRecord {
  bestStage: number;
  clears: number;
}

/** Everything stored. Keys of the maps are hero ids as strings. */
export interface StatsData {
  v: number;
  heroes: Record<string, HeroRecord>;
  vs: Record<string, Record<string, Matchup>>;
  modes: Record<string, number>;
  /** Consecutive duel wins now, and the best run of them ever. */
  streak: number;
  bestStreak: number;
  arcade: Record<string, ArcadeRecord>;
  /** Most survival wins in one run, per hero. */
  survival: Record<string, number>;
}

const emptyHero = (): HeroRecord => ({ wins: 0, losses: 0, roundsWon: 0, roundsLost: 0, perfects: 0, bestCombo: 0, seconds: 0 });

const fresh = (): StatsData => ({
  v: STATS_VERSION,
  heroes: {},
  vs: {},
  modes: {},
  streak: 0,
  bestStreak: 0,
  arcade: {},
  survival: {},
});

/** A value read from storage as an object, or an empty one. */
const obj = (v: unknown): Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
/** A stored number: finite and above zero, otherwise 0. */
const pos = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);
/** A count to add: the whole part of a finite non-negative number. */
const whole = (v: number): number => (Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);
const clampInt = (v: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, Number.isFinite(v) ? Math.floor(v) : lo));
/** A hero id as a map key, or null when it is not a usable id. */
const idKey = (id: number): string | null => (Number.isInteger(id) && id >= 0 ? String(id) : null);
/** A mode name as a map key: short, lower case, 'other' when empty. */
const modeKey = (m: string): string => (typeof m === 'string' ? m.trim().toLowerCase().slice(0, 24) : '') || 'other';
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** Portrait card for a hero: assets/art/h-NN.jpg (same path the hero select uses). */
const faceUrl = (portrait: number) => `assets/art/h-${String(portrait).padStart(2, '0')}.jpg`;

function readHero(v: unknown): HeroRecord {
  const o = obj(v);
  return {
    wins: pos(o.wins),
    losses: pos(o.losses),
    roundsWon: pos(o.roundsWon),
    roundsLost: pos(o.roundsLost),
    perfects: pos(o.perfects),
    bestCombo: pos(o.bestCombo),
    seconds: pos(o.seconds),
  };
}

/** Reads the stored records, rebuilding every field so a damaged or old entry cannot poison the numbers. */
function load(): StatsData {
  try {
    const raw = localStorage.getItem(STATS_KEY);
    if (!raw) return fresh();
    const p = obj(JSON.parse(raw));
    if (p.v !== STATS_VERSION) return fresh();
    const out = fresh();
    for (const [k, v] of Object.entries(obj(p.heroes))) out.heroes[k] = readHero(v);
    for (const [k, row] of Object.entries(obj(p.vs))) {
      const r: Record<string, Matchup> = {};
      for (const [foe, m] of Object.entries(obj(row))) r[foe] = { wins: pos(obj(m).wins), losses: pos(obj(m).losses) };
      out.vs[k] = r;
    }
    for (const [k, v] of Object.entries(obj(p.modes))) out.modes[k] = pos(v);
    out.streak = pos(p.streak);
    out.bestStreak = pos(p.bestStreak);
    for (const [k, v] of Object.entries(obj(p.arcade))) {
      out.arcade[k] = { bestStage: clampInt(pos(obj(v).bestStage), 0, LADDER), clears: pos(obj(v).clears) };
    }
    for (const [k, v] of Object.entries(obj(p.survival))) out.survival[k] = pos(v);
    return out;
  } catch {
    return fresh();
  }
}

/** The records in memory: loaded from storage on first use, then kept up to date by the record calls. */
let cache: StatsData | null = null;
const data = (): StatsData => {
  if (!cache) cache = load();
  return cache;
};

/** Writes the records back. A full or blocked store only costs persistence, not the numbers for this visit. */
function save(): void {
  try {
    localStorage.setItem(STATS_KEY, JSON.stringify(data()));
  } catch {
    /* storage unavailable: the records stay in memory until the page closes */
  }
}

/**
 * Records one finished duel for the local player: the hero's totals, the head-to-head against the opposing hero, the
 * mode count and the win streak. A draw or a loss both count as a loss and end the streak.
 */
export function recordMatch(r: MatchResult): void {
  const key = idKey(r.hero);
  if (key === null) return;
  const d = data();
  const h = (d.heroes[key] ??= emptyHero());
  if (r.won) h.wins += 1;
  else h.losses += 1;
  h.roundsWon += whole(r.roundsWon);
  h.roundsLost += whole(r.roundsLost);
  h.perfects += whole(r.perfects);
  h.bestCombo = Math.max(h.bestCombo, whole(r.bestCombo));
  h.seconds += whole(r.seconds);

  d.streak = r.won ? d.streak + 1 : 0;
  d.bestStreak = Math.max(d.bestStreak, d.streak);

  const foe = idKey(r.foeHero);
  if (foe !== null) {
    const row = (d.vs[key] ??= {});
    const m = (row[foe] ??= { wins: 0, losses: 0 });
    if (r.won) m.wins += 1;
    else m.losses += 1;
  }

  const mode = modeKey(r.mode);
  d.modes[mode] = (d.modes[mode] ?? 0) + 1;
  save();
}

/**
 * Records the end of one arcade run for a hero. `stage` is the stage the run reached (1-based, 1..7); a full clear
 * counts as the last stage whatever `stage` says, and adds to the clears.
 */
export function recordArcade(heroId: number, cleared: boolean, stage: number): void {
  const key = idKey(heroId);
  if (key === null) return;
  const d = data();
  const a = (d.arcade[key] ??= { bestStage: 0, clears: 0 });
  const reached = cleared ? LADDER : clampInt(stage, 1, LADDER);
  a.bestStage = Math.max(a.bestStage, reached);
  if (cleared) a.clears += 1;
  save();
}

/** Records a survival run's wins for a hero; the best run is kept. */
export function recordSurvival(heroId: number, wins: number): void {
  const key = idKey(heroId);
  if (key === null) return;
  const d = data();
  d.survival[key] = Math.max(d.survival[key] ?? 0, whole(wins));
  save();
}

/** A copy of the local records. Changing the copy does not change what is stored. */
export function getStats(): StatsData {
  return JSON.parse(JSON.stringify(data())) as StatsData;
}

/** A duration in seconds as "45s", "12m" or "3h 20m"; a dash when there is none. */
function fmtTime(sec: number): string {
  if (sec <= 0) return '—';
  const m = Math.floor(sec / 60);
  if (m < 1) return `${Math.floor(sec)}s`;
  const h = Math.floor(m / 60);
  return h ? `${h}h ${m % 60}m` : `${m}m`;
}

/** One hero's row on the records screen. */
interface HeroRow {
  id: number;
  name: string;
  epithet: string;
  face: string;
  h: HeroRecord;
  games: number;
  /** Whole-number win rate in percent, or null with no games. */
  rate: number | null;
  clears: number;
  bestStage: number;
  survival: number;
  /** The opponent this hero has lost to most, or null when no losses. */
  nemesis: { name: string; losses: number } | null;
}

/** Every hero, the ones played first (most games first), then the rest in roster order. */
function heroRows(d: StatsData): HeroRow[] {
  const rows = HEROES.map((hero): HeroRow => {
    const key = String(hero.id);
    const h = d.heroes[key] ?? emptyHero();
    const games = h.wins + h.losses;
    const a = d.arcade[key];
    let nemesis: HeroRow['nemesis'] = null;
    for (const [foe, m] of Object.entries(d.vs[key] ?? {})) {
      if (m.losses > 0 && (!nemesis || m.losses > nemesis.losses)) {
        nemesis = { name: heroOf(Number(foe)).name, losses: m.losses };
      }
    }
    return {
      id: hero.id,
      name: hero.name,
      epithet: hero.epithet,
      face: faceUrl(hero.portrait),
      h,
      games,
      rate: games ? Math.round((h.wins / games) * 100) : null,
      clears: a?.clears ?? 0,
      bestStage: a?.bestStage ?? 0,
      survival: d.survival[key] ?? 0,
      nemesis,
    };
  });
  return rows.sort((x, y) => y.games - x.games || x.id - y.id);
}

/** A stat tile on the totals panel. */
interface Tile {
  label: string;
  value: string;
  sub?: string;
}

/** The totals across every hero, and the streak and mode lines. */
function totalsOf(d: StatsData): { tiles: Tile[]; matches: number; modes: string } {
  let wins = 0;
  let losses = 0;
  let roundsWon = 0;
  let roundsLost = 0;
  let perfects = 0;
  let bestCombo = 0;
  let seconds = 0;
  for (const h of Object.values(d.heroes)) {
    wins += h.wins;
    losses += h.losses;
    roundsWon += h.roundsWon;
    roundsLost += h.roundsLost;
    perfects += h.perfects;
    bestCombo = Math.max(bestCombo, h.bestCombo);
    seconds += h.seconds;
  }
  let clears = 0;
  let bestStage = 0;
  for (const a of Object.values(d.arcade)) {
    clears += a.clears;
    bestStage = Math.max(bestStage, a.bestStage);
  }
  const survival = Math.max(0, ...Object.values(d.survival));
  const matches = wins + losses;
  const rate = matches ? `${Math.round((wins / matches) * 100)}%` : '—';
  const tiles: Tile[] = [
    { label: 'Matches', value: String(matches), sub: `${wins} won · ${losses} lost` },
    { label: 'Win rate', value: rate, sub: matches ? `${wins} of ${matches}` : '' },
    { label: 'Rounds won', value: String(roundsWon), sub: `${roundsLost} lost` },
    { label: 'Perfects', value: String(perfects) },
    { label: 'Best combo', value: bestCombo ? String(bestCombo) : '—' },
    { label: 'Time played', value: fmtTime(seconds) },
    { label: 'Streak', value: String(d.streak), sub: 'wins in a row' },
    { label: 'Best streak', value: String(d.bestStreak), sub: 'wins in a row' },
    { label: 'Arcade clears', value: String(clears), sub: bestStage ? `best stage ${bestStage} of ${LADDER}` : 'no runs yet' },
    { label: 'Survival best', value: survival ? String(survival) : '—', sub: survival ? 'wins in one run' : '' },
  ];
  const modes = Object.entries(d.modes)
    .sort((a, b) => b[1] - a[1])
    .map(([m, n]) => `${m === 'lan' ? 'LAN' : cap(m)} ${n}`)
    .join(' · ');
  return { tiles, matches, modes };
}

/** Three stars, lit one per arcade clear up to three. */
const stars = (clears: number): string =>
  `<span class="rs-stars" role="img" aria-label="${clears} arcade ${clears === 1 ? 'clear' : 'clears'}">${[1, 2, 3]
    .map((n) => `<i class="${clears >= n ? 'on' : ''}"></i>`)
    .join('')}</span>`;

/** One labelled cell of a hero row. The label shows only on phones, where the columns stack. */
const cell = (cls: string, label: string, value: string, title?: string): string =>
  `<span class="rs-c ${cls}"${title ? ` title="${title}"` : ''}><small>${label}</small><span class="rs-v">${value}</span></span>`;

/** One hero's row: face, name, record, win-rate bar, arcade stars and best stage, survival, then the detail cells. */
function rowHtml(r: HeroRow): string {
  const played = r.games > 0;
  const dash = '<b>—</b>';
  const who = `<div class="rs-who"><b>${esc(r.name)}</b><span>${esc(r.epithet)}</span>${
    r.nemesis ? `<em>Most losses to ${esc(r.nemesis.name)} (${r.nemesis.losses})</em>` : ''
  }</div>`;
  const record = cell('rs-rec', 'Record', played ? `<b>${r.h.wins} W · ${r.h.losses} L</b>` : dash);
  const rate = cell(
    'rs-rate',
    'Win rate',
    played
      ? `<span class="rs-bar"><i style="width:${r.rate ?? 0}%"></i></span><b>${r.rate}%</b>`
      : `<span class="rs-bar"><i style="width:0%"></i></span>${dash}`,
  );
  const arcade = cell(
    'rs-arc',
    'Arcade',
    r.bestStage ? `${stars(r.clears)}<b>Stage ${r.bestStage}/${LADDER}</b>` : `${stars(0)}${dash}`,
  );
  const survival = cell('rs-surv', 'Survival', r.survival ? `<b>${r.survival}</b>` : dash, 'Most wins in one survival run');
  const rounds = cell('rs-rnd', 'Rounds', played ? `<b>${r.h.roundsWon}</b>` : dash, 'Rounds won');
  const perf = cell('rs-perf', 'Perfects', played ? `<b>${r.h.perfects}</b>` : dash);
  const combo = cell('rs-cmb', 'Combo', played && r.h.bestCombo ? `<b>${r.h.bestCombo}</b>` : dash, 'Best combo');
  const time = cell('rs-time', 'Time', played ? `<b>${fmtTime(r.h.seconds)}</b>` : dash, 'Time played');
  return `<li class="rs-row${played ? '' : ' is-idle'}">
      <img class="rs-face" src="${r.face}" alt="" loading="lazy" draggable="false">
      ${who}${record}${rate}${arcade}${survival}${rounds}${perf}${combo}${time}
    </li>`;
}

/**
 * The records screen: totals and streaks across every hero, then one row per hero with portrait, record, win-rate bar,
 * arcade stars and best stage, survival best and the detail numbers. Back calls onBack. Read-only.
 */
export function renderStats(root: HTMLElement, onBack: () => void): void {
  const d = data();
  const { tiles, matches, modes } = totalsOf(d);
  const tileHtml = tiles
    .map((t) => `<div class="rs-tile"><dt>${esc(t.label)}</dt><dd>${esc(t.value)}${t.sub ? `<small>${esc(t.sub)}</small>` : ''}</dd></div>`)
    .join('');
  const heads = ['Hero', 'Record', 'Win rate', 'Arcade', 'Survival', 'Rounds', 'Perfects', 'Combo', 'Time']
    .map((t) => `<span>${t}</span>`)
    .join('');

  root.innerHTML = `<div class="screen rs-screen">
    <div class="rs-wrap">
      <header class="hdr rs-hdr">
        <button class="back" data-act="back" aria-label="Back">‹</button>
        <h2>Records</h2>
        <span class="rs-sub">Saved on this device</span>
      </header>
      <section class="rs-card rs-totals" aria-label="Totals">
        <dl class="rs-tiles">${tileHtml}</dl>
        ${modes ? `<p class="rs-modes">By mode: ${esc(modes)}</p>` : ''}
        ${matches ? '' : '<p class="rs-modes">Nothing recorded yet. Finish a duel, an arcade run or a survival run and it shows up here.</p>'}
      </section>
      <section class="rs-card rs-table" aria-label="Heroes">
        <div class="rs-head" aria-hidden="true">${heads}</div>
        <ol class="rs-list">${heroRows(d).map(rowHtml).join('')}</ol>
      </section>
      <p class="rs-note">Stars: one per full arcade clear, three lit at three clears. Survival is the most wins in one run.</p>
    </div>
  </div>`;

  root.querySelector<HTMLButtonElement>('[data-act="back"]')?.addEventListener('click', onBack);
}
