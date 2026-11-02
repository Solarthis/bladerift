**Hud map (read-only; nothing edited)**

**Wiring.** `GameScene` does not call Hud directly. It emits events through `onEvent` (`game/GameScene.ts:563`, fired at `:2101`). The real caller is `ui/App.ts`:
- `:819` `new Hud(this.ui)`
- `:820` `hud.onMenu = confirmLeave`
- `:823` `scene.onEvent → hud.onEvent(e, roster, game)`
- `:830` `hud.update(g, roster, rtt, dt)` every RAF frame
- `:887` `hud.destroy()`

`cinematic.ts:175` and `:252` toggle a `.cinematic` class on `.hud`, which hides panels (`hud.css:388-398`). I did not verify where `hudbars.css` is imported.

**Hud.ts exports and members** (`export class Hud`, `:77`)
- `root` (`:78`), `onMenu` (`:94`), `constructor(parent)` (`:96`), `update(...)` (`:166`), `onEvent(...)` (`:269`), `destroy()` (`:385`).
- Private: `countHit` (`:302`), `popCombo` (`:319`), `resetCombos` (`:332`), `fillVs` (`:340`), `showBanner(text, ms, cls, accent?, fresh?, sub?)` (`:359`).
- Constants: `CHIPS` (`:13`), `COMBO_MIN=2`, `COMBO_GAP_MS=1300`, `COMBO_HOLD_MS=1500` (`:22-24`), `KO_MS=2000` (`:26`), `INTRO_VS=1.4`, `INTRO_ROUND=0.5` (`:28-29`), `TICK_RATE=60` (`:31`).
- Markup built in the constructor: side panels (`:99-113`), combo counters (`:114`), VS band (`:115-117`), banner and net (`:120`).

**Banners and announcements** (all via `showBanner`, which rebuilds `.bn-t` and an optional `<small>` sub-line, `:359-383`)
- `ROUND N` and `READY` during intro (`:247-248`, `:258-261`). Text is `ROUND ${g.round}` for the first `INTRO_ROUND` seconds, then `READY`, 300 ms each.
- VS band between rounds: `.hud-vs.on` when `intro && left > 1.4 && round > 1` (`:254-257`). `fillVs` (`:340`) fills the names. The portrait VS splash is the menus' job, per the comment at `:253`.
- `FIGHT!`, 900 ms (`:273`), on the `fight` event.
- `K.O.` on a `round` event with `why !== 1`, or `TIME!` when `why === 1`. Holds `KO_MS` (`:277`).
- Art name, uppercased, 1100 ms, accent-coloured (`:282-289`). Skipped when `.cinematic` is on (`:284`).
- `WINNER!` with winner name and hero quote as sub-line, 4000 ms (`:290-296`).
- Names appear only in the `WINNER` sub-line, the VS band, and the side panel (`.hp-name` at `:176`, `.hp-hero span` at `:184`).

**Rift (super) gauge**
- Value: `rift = min(1, f.rift / RIFT.max)` (`:229`). `RIFT.max = 1000` is in `packages/shared/src/classes.ts:152`.
- Fill width (`:231`). Ready state toggles `.ready` on the rift and the art icon (`:232-233`).
- Label (`:234`): `ART READY` when full, else `Math.floor(rift*100) + '%'`. That is the `%` label.
- CSS: `hud.css:58-134` (`.rift` `:82`, `.rift-fill` `:101`, `.rift-pct` `:106`, `.rift.ready` `:122`, pulse keyframes `:131`). `hudbars.css:102-129` for the striped fill and ready animation.

**Combo counter**
- Count logic in `countHit` (`:302-316`). Burning ticks with `e.n === 0` are ignored (`:307`). A hit on a victim resets their chain (`:308`). The count is the sim's `e.n` when positive, else a timed increment.
- Shows at `COMBO_MIN` (`:315`). `popCombo` (`:319-330`) updates the numeral and runs a 90 ms pop animation.
- Chain ends in `update` after `COMBO_GAP_MS` (`:239-241`). The panel hides after `COMBO_HOLD_MS`.
- CSS: `hud.css:332` (`.combo-big`), `:346` (`.right`), `:347` (`.on`), `:349` (`.cb-n`), `:376` (`.cb-l`). Markup at `Hud.ts:114`.

**Health bars**
- Values (`:196-203`): `hp = max(0, f.hp)`, max from `heroClass(...).hp` (default 1000). Bar width is `hp/max`. Numeral is `Math.ceil(hp)`.
- Trail (`:198-202`): a red trail catches up at `max * 0.5 * dt` per second.
- Low and mid thresholds at 25% and 50% toggle `.low` and `.mid` (`:204-205`).
- Hit flash on any drop of more than 0.5 (`:207-211`, class `hit`).
- CSS: `hud.css:15-55` for layout, `hudbars.css:19` (`.hp-bar`), `:40` (`.hp-fill`), `:47` (`.mid`), `:53` (`.low`), `:60` (`.hp-trail`), `:64` (`.hp-sheen`), `:78` (`.hp-num`), `:88-95` (`.hit`).
- Ranged heat and Sun Crescent strip (`:213-227`): `hudbars.css:132-177`.

**Timer**
- `clock` element (`:81`, markup `:116`). Shows `Math.ceil(g.timeLeft)` (`:244-245`).
- `.hurry` class when `phase === 'fight' && t <= 10` (`:246`).
- `timeLeft` comes from the protocol as u16/10 (`shared/src/protocol.ts:289`).
- CSS: `hud.css:55` (size), `hudbars.css:202` (glow).

**Other**
- Status chips (`CHIPS`, `:13-19`, set at `:236`). CSS `hud.css:140-173`.
- Round pips (`:178`, `:135`).
- Ping (`:264-266`).
- Menu button (`:118`, `:163`).
- Banner CSS: `hud.css:235` (`.hud-banner`), `:251` (`.on`), `:263` (slam), `:271-304` (rings and rays), `:308-327` (per-type sizes and colours, `.ko.time` at `:324`).
- VS band CSS: `hud.css:176-216`.

**Notes for the overhaul**
- The `ROUND` element at `:82` and the banner both show round text, so round number is shown twice during intro.
- Banner `sub` is the only place a name appears on the banner itself. Any K.O. or FIGHT name would need to extend the `sub` path.