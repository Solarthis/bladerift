/**
 * Game modes beyond the duel: the Arcade ladder (seven fights up a tower, three continues) and Survival (endless wins,
 * health carried over). The run logic is plain state; the screens render into a host element and call back into the
 * app. Runs are seeded, so a ladder can be rebuilt from its seed. The sim never sees a run: the lead passes each
 * fight's arena and bot level into the match settings, and a survival fight's starting health as `startHp`.
 */
import { ARENAS, BotDifficulty, getArena, HEROES, heroOf } from '@bladerift/shared';
import { recordArcade, recordSurvival } from './stats';
import './modes.css';

export type RunDifficulty = 'easy' | 'normal' | 'hard';

/** One opponent on a ladder or in survival. */
export interface Opponent {
  heroId: number;
  botLevel: BotDifficulty;
  arenaId: string;
  boss: boolean;
}

/** The current arcade stage: an opponent plus where it sits on the ladder. `stage` is 1-based. */
export interface ArcadeStage extends Opponent {
  stage: number;
  total: number;
}

/** The current survival fight: an opponent plus the run's streak and the health the fight starts at. */
export interface SurvivalFight extends Opponent {
  /** Fight number, 1-based (wins + 1). */
  fight: number;
  wins: number;
  /** Health the fight starts at, as a fraction of full health (0..1). */
  startHp: number;
}

export const ARCADE_STAGES = 7;
export const ARCADE_CONTINUES = 3;
/** Health won back after each survival win, as a fraction of full health. */
export const SURVIVAL_HEAL = 0.25;

/** Gilgamesh is the final boss, or Alexander when the player is Gilgamesh. */
const BOSS_ID = 2;
const BOSS_ALT_ID = 11;
/** Rising bot levels for stages 1..7 at normal difficulty. */
const LADDER_LEVELS: BotDifficulty[] = ['easy', 'easy', 'normal', 'normal', 'normal', 'hard', 'hard'];
const LEVEL_STEPS: BotDifficulty[] = ['easy', 'normal', 'hard'];

/** Seeded PRNG (mulberry32): the same seed always draws the same ladder. */
function rng(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** Portrait card for a hero: assets/art/h-NN.jpg (same path the hero select uses). */
const faceUrl = (heroId: number) => `assets/art/h-${String(heroOf(heroId).portrait).padStart(2, '0')}.jpg`;

/** One step easier or harder on the bot ladder, clamped to easy..hard. */
function shiftLevel(lvl: BotDifficulty, dir: number): BotDifficulty {
  const i = clamp(LEVEL_STEPS.indexOf(lvl) + dir, 0, LEVEL_STEPS.length - 1);
  return LEVEL_STEPS[i];
}

/**
 * Arcade ladder: seven opponents, six random heroes then a final boss. Easy runs shift every rung one step down, hard
 * runs one step up. Three continues: a loss can retry the same stage while continues remain.
 */
export class ArcadeRun {
  /** The seven opponents, bottom rung first (index 0 is stage 1, the boss is last). */
  readonly ladder: Opponent[];
  readonly total = ARCADE_STAGES;
  private idx = 0;
  private left = ARCADE_CONTINUES;
  private status: 'playing' | 'lost' | 'cleared' = 'playing';
  private saved = false;

  /** @param playerHero the player's hero id (excluded from the ladder) @param seed draws the heroes and arenas */
  constructor(readonly playerHero: number, readonly difficulty: RunDifficulty, seed: number) {
    const rand = rng(seed);
    const boss = playerHero === BOSS_ID ? BOSS_ALT_ID : BOSS_ID;
    const pool = HEROES.map((h) => h.id).filter((id) => id !== playerHero && id !== boss);
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    // arenas cycle through the five in a seeded rotation
    const start = Math.floor(rand() * ARENAS.length);
    const shift = difficulty === 'easy' ? -1 : difficulty === 'hard' ? 1 : 0;
    this.ladder = LADDER_LEVELS.map((lvl, i) => {
      const last = i === ARCADE_STAGES - 1;
      return {
        heroId: last ? boss : pool[i],
        botLevel: shiftLevel(lvl, shift),
        arenaId: ARENAS[(start + i) % ARENAS.length].id,
        boss: last,
      };
    });
  }

  /** The current stage (1-based). Once the run has ended, the stage it ended on. */
  current(): ArcadeStage {
    return { ...this.ladder[this.idx], stage: this.idx + 1, total: this.total };
  }

  /** Continues left (starts at ARCADE_CONTINUES). */
  get continues(): number {
    return this.left;
  }

  /** A win climbs a rung; the seventh win clears the ladder. A loss ends the attempt (see canContinue). */
  recordResult(win: boolean): void {
    if (this.status !== 'playing') return;
    if (!win) {
      this.status = 'lost';
      this.settle();
      return;
    }
    if (this.idx === this.total - 1) {
      this.status = 'cleared';
      this.settle();
      return;
    }
    this.idx++;
  }

  /** Lost this stage with continues left: the player may spend one to retry it. */
  canContinue(): boolean {
    return this.status === 'lost' && this.left > 0;
  }

  /** Spend a continue and retry the same stage. Returns false when none can be spent. */
  continueRun(): boolean {
    if (!this.canContinue()) return false;
    this.left--;
    this.status = 'playing';
    return true;
  }

  /** The last fight was lost (the run may still continue). */
  failed(): boolean {
    return this.status === 'lost';
  }

  /** The run is over: cleared, or lost with no continues left. */
  done(): boolean {
    return this.status === 'cleared' || (this.status === 'lost' && this.left === 0);
  }

  /** All seven stages beaten. */
  cleared(): boolean {
    return this.status === 'cleared';
  }

  /** Leave the run: an unfinished run counts as lost on its current stage. Records the result once. */
  quit(): void {
    if (this.status !== 'cleared') {
      this.status = 'lost';
      this.left = 0;
    }
    this.settle();
  }

  private settle(): void {
    if (!this.done() || this.saved) return;
    this.saved = true;
    recordArcade(this.playerHero, this.status === 'cleared', this.idx + 1);
  }
}

/**
 * Survival: endless. Each win brings a new random opponent at a higher bot level (easy for the first two fights,
 * normal for the next two, hard after) and wins back 25% of full health, which the next fight starts with. The run
 * ends on the first loss.
 */
export class SurvivalRun {
  /** Wins in a row so far. */
  wins = 0;
  /** Health the next fight starts with, as a fraction of full health (1 at the start). Pass into the match settings. */
  startHp = 1;
  private readonly rand: () => number;
  private opp: Opponent;
  private status: 'playing' | 'over' = 'playing';
  private saved = false;

  /** @param playerHero the player's hero id (never drawn as an opponent) @param seed draws the opponents */
  constructor(readonly playerHero: number, seed: number) {
    this.rand = rng(seed);
    this.opp = this.draw(null);
  }

  /** The fight that is next (or running). */
  current(): SurvivalFight {
    return { ...this.opp, fight: this.wins + 1, wins: this.wins, startHp: this.startHp };
  }

  /**
   * A fight ended. A win adds to the streak and sets the next fight's health: the health left plus 25%, capped at full.
   * `hpLeft` is the player's health at the end of the fight as a fraction of full (0..1); omit it only when unknown.
   */
  recordResult(win: boolean, hpLeft = 0): void {
    if (this.status !== 'playing') return;
    if (!win) {
      this.status = 'over';
      this.save();
      return;
    }
    this.wins++;
    this.startHp = clamp(clamp(hpLeft, 0, 1) + SURVIVAL_HEAL, 0, 1);
    this.opp = this.draw(this.opp);
  }

  /** The run is over (a loss, or the player left). */
  done(): boolean {
    return this.status === 'over';
  }

  /** Leave the run. Records the streak once. */
  quit(): void {
    this.status = 'over';
    this.save();
  }

  private draw(prev: Opponent | null): Opponent {
    const pool = HEROES.map((h) => h.id).filter((id) => id !== this.playerHero && id !== prev?.heroId);
    const arenas = ARENAS.map((a) => a.id).filter((id) => id !== prev?.arenaId);
    const botLevel: BotDifficulty = this.wins < 2 ? 'easy' : this.wins < 4 ? 'normal' : 'hard';
    return {
      heroId: pool[Math.floor(this.rand() * pool.length)],
      botLevel,
      arenaId: arenas[Math.floor(this.rand() * arenas.length)],
      boss: false,
    };
  }

  private save(): void {
    if (this.saved) return;
    this.saved = true;
    recordSurvival(this.playerHero, this.wins);
  }
}

/** Stat lines for renderRunOver, from a finished (or quit) arcade run. */
export function arcadeSummary(run: ArcadeRun): string[] {
  const c = run.current();
  const reached = run.cleared() ? `Cleared all ${run.total} stages` : `Reached stage ${c.stage} of ${run.total}`;
  return [reached, `Difficulty: ${cap(run.difficulty)}`, `Continues left: ${run.continues} of ${ARCADE_CONTINUES}`];
}

/** Stat lines for renderRunOver, from a finished (or quit) survival run. */
export function survivalSummary(run: SurvivalRun): string[] {
  return [`Streak: ${run.wins} ${run.wins === 1 ? 'win' : 'wins'}`, `Health going into the last fight: ${Math.round(run.startHp * 100)}%`];
}

/** The ladder screen: a tower of opponent tiles, boss on top, the current stage highlighted. Quit calls run.quit(). */
export function renderLadder(root: HTMLElement, run: ArcadeRun, onFight: (stage: ArcadeStage) => void, onQuit: () => void): void {
  const cur = run.current();
  const over = run.done();
  const cleared = run.cleared();
  const lost = run.failed();

  const rungs = run.ladder
    .map((o, i) => ({ o, i }))
    .reverse()
    .map(({ o, i }) => {
      const stageNo = i + 1;
      let state: 'cleared' | 'current' | 'lost' | 'locked';
      if (cleared || stageNo < cur.stage) state = 'cleared';
      else if (stageNo === cur.stage) state = lost ? 'lost' : 'current';
      else state = 'locked';
      const hero = heroOf(o.heroId);
      const arena = getArena(o.arenaId).name;
      const stamp =
        state === 'cleared' ? '<span class="md-stamp ok">Cleared</span>'
        : state === 'lost' ? '<span class="md-stamp bad">Defeated</span>'
        : state === 'current' ? '<span class="md-tag">Next fight</span>'
        : '<span class="md-tag dim">Locked</span>';
      return `<li class="md-rung is-${state}${o.boss ? ' is-boss' : ''}" data-stage="${stageNo}">
        <span class="md-no">${stageNo}</span>
        <img class="md-face" src="${faceUrl(o.heroId)}" alt="" loading="lazy" draggable="false">
        <div class="md-info">
          <b class="md-nm">${esc(hero.name)}</b>
          <span class="md-ep">${esc(hero.epithet)}</span>
          <span class="md-meta">${esc(cap(o.botLevel))} bot · ${esc(arena)}</span>
          ${o.boss ? '<span class="md-boss">Final boss</span>' : ''}
        </div>
        ${stamp}
      </li>`;
    })
    .join('');

  let action = '';
  if (run.canContinue()) action = `<button class="big md-go" data-act="fight" type="button">Continue (${run.continues} left)</button>`;
  else if (!over) action = `<button class="big md-go" data-act="fight" type="button">Fight stage ${cur.stage}</button>`;
  const sub = `${cap(run.difficulty)} · Stage ${cur.stage} of ${cur.total} · ${run.continues} ${run.continues === 1 ? 'continue' : 'continues'}`;

  root.innerHTML = `<div class="screen modes-screen md-ladder">
    <div class="md-wrap">
      <header class="md-hdr">
        <button class="md-back" data-act="quit" type="button">Quit</button>
        <div class="md-title"><h2>Arcade ladder</h2><span class="md-sub">${esc(sub)}</span></div>
      </header>
      <ol class="md-tower" aria-label="Opponents, boss at the top">${rungs}</ol>
      <footer class="md-foot">${action}</footer>
    </div>
  </div>`;

  root.querySelector<HTMLButtonElement>('[data-act="quit"]')?.addEventListener('click', () => {
    run.quit();
    onQuit();
  });
  root.querySelector<HTMLButtonElement>('[data-act="fight"]')?.addEventListener('click', () => {
    run.continueRun(); // a no-op unless the run is lost with continues left
    onFight(run.current());
  });

  // bring the stage to fight into view (the boss tile is at the top of a long tower)
  const screen = root.querySelector<HTMLElement>('.modes-screen');
  const focus = root.querySelector<HTMLElement>('.is-current, .is-lost');
  if (screen && focus) {
    const r = focus.getBoundingClientRect();
    const s = screen.getBoundingClientRect();
    screen.scrollTop += r.top - s.top - screen.clientHeight / 2 + r.height / 2;
  }
}

/** Survival between fights: the streak, the health going in, the next opponent. Quit calls run.quit(). */
export function renderSurvival(root: HTMLElement, run: SurvivalRun, onFight: (fight: SurvivalFight) => void, onQuit: () => void): void {
  const f = run.current();
  const hero = heroOf(f.heroId);
  const hp = Math.round(f.startHp * 100);
  root.innerHTML = `<div class="screen modes-screen md-survival">
    <div class="md-wrap">
      <header class="md-hdr">
        <button class="md-back" data-act="quit" type="button">Quit</button>
        <div class="md-title"><h2>Survival</h2><span class="md-sub">Fight ${f.fight} · ${esc(cap(f.botLevel))} bot</span></div>
      </header>
      <div class="md-body">
        <section class="md-panel md-streak">
          <span class="md-num">${f.wins}</span>
          <span class="md-lbl">${f.wins === 1 ? 'win' : 'wins'} in a row</span>
        </section>
        <section class="md-panel md-health">
          <div class="md-row"><span>Health going in</span><b>${hp}%</b></div>
          <div class="md-bar" role="img" aria-label="Health ${hp} percent"><i style="width:${hp}%"></i></div>
          <p class="md-note">Win and 25% health comes back. One loss ends the run.</p>
        </section>
        <section class="md-panel md-next">
          <img class="md-face" src="${faceUrl(f.heroId)}" alt="" loading="lazy" draggable="false">
          <div class="md-info">
            <span class="md-kicker">Next opponent</span>
            <b class="md-nm">${esc(hero.name)}</b>
            <span class="md-ep">${esc(hero.epithet)}</span>
            <span class="md-meta">${esc(cap(f.botLevel))} bot · ${esc(getArena(f.arenaId).name)}</span>
          </div>
        </section>
      </div>
      <footer class="md-foot"><button class="big md-go" data-act="fight" type="button">Fight</button></footer>
    </div>
  </div>`;

  root.querySelector<HTMLButtonElement>('[data-act="quit"]')?.addEventListener('click', () => {
    run.quit();
    onQuit();
  });
  root.querySelector<HTMLButtonElement>('[data-act="fight"]')?.addEventListener('click', () => onFight(run.current()));
}

/**
 * The end-of-run card (arcade clear or defeat, survival loss). `retryLabel` names the first button, for example
 * "Continue (2 left)" or "New run"; the second always returns to the main menu.
 */
export function renderRunOver(
  root: HTMLElement,
  opts: { title: string; stats: string[]; retryLabel?: string; note?: string; tone?: 'win' | 'lose' },
  onRetry: () => void,
  onMenu: () => void,
): void {
  root.innerHTML = `<div class="screen modes-screen md-over">
    <div class="md-over-card">
      <h2 class="md-over-title${opts.tone === 'lose' ? ' lose' : ''}">${esc(opts.title)}</h2>
      <ul class="md-over-stats">${opts.stats.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>
      ${opts.note ? `<p class="md-note">${esc(opts.note)}</p>` : ''}
      <div class="md-over-btns">
        <button class="big" data-act="retry" type="button">${esc(opts.retryLabel ?? 'Play again')}</button>
        <button class="big" data-act="menu" type="button">Main menu</button>
      </div>
    </div>
  </div>`;
  root.querySelector<HTMLButtonElement>('[data-act="retry"]')?.addEventListener('click', onRetry);
  root.querySelector<HTMLButtonElement>('[data-act="menu"]')?.addEventListener('click', onMenu);
}
