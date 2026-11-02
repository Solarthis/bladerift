App.ts map (read-only; nothing edited). BRIEF rules noted: edit only owned files, assets CC0/CC-BY/MIT/OFL only.

**Screens and renderers** (`packages/client/src/ui/App.ts`)
- `type Screen` = title | fighter | online | lobby | game | results | settings | howto | connecting (l.29).
- `show(s)` l.177-205: sets `body[data-screen]`, skips the DOM for `game`, otherwise `render(s)` into `#ui`, then `bind()`, starts the title showcase (l.192), warms atlases (l.195-198), animates hero previews (l.200).
- `render(s)` switch l.207-256: title l.209, fighter l.227 → `renderFighter`, online l.228, connecting l.236, lobby l.239 → `renderLobby`, results l.241 → `renderResults`, settings l.242-250, howto l.252 → `renderHowto`.

**Title buttons** (l.209-225): `update` (update-btn), `lan` (only if `this.lan`), `online` (if `onlineAvailable()`), `practice`, `local`, then a row of `fighter`, `howto`, `settings`. An arcade "All games" back link shows under `/bladerift/`.

**Hero select (fighter)**
- Render `renderFighter` l.279-355. Hero columns are built from `CLASSES`/`HEROES` (l.303-315), one True and one Extra/False slot per class. Detail panels: portrait card, info card (bars, traits, special, dodge), gear card (colour swatches, Rift Art, locked signature weapon, note).
- State: `profiles[editing]` (l.71), `editing` (l.73), `editBack` (l.74). Profiles are stored under `bladerift.profile` / `bladerift.profile2` (l.31, `loadProfile`/`saveProfile` l.38-60).
- Handlers: `bindFighter` l.497-515 (name input `#fname`, `data-pick` hero/color; `accent` is handled at l.509 but no markup emits it). `act` cases `back` l.530-538 (sends `loadout` and `rename` lobby commands when in a lobby, then `show(editBack)`), `fighter` l.539, `gear` l.544 (from lobby seat "Change gear").
- Classes: `roster.css` l.1-500 holds `.screen-fighter` (l.6), `.hs-hdr` (l.7-20), `.hs` (l.22), `.hs-roster` (l.35), `.hs-col`/`.current`/`-h` (l.46-73), `.hs-slots`/`.hs-gap` (l.75-83), `.hs-hero`/`.on`/`-tag`/`-nm` (l.84-141), `.hs-detail` (l.142-157), `.hs-portrait`/`-frame`/`-sprite`/`-id`/`-class` (l.158-222), `.hs-info`/`-lore`/`-bars`/`-traits`/`-bar`/`-blurb` (l.223-233), `.hs-item` plus `.hs-special`/`.hs-sig` (l.234-257), `.hs-gear*`/`.hs-lbl`/`.hs-gear .sw` (l.260-308), `.hs-note` (l.309), responsive media at l.322-365. `.hs-art`, `.hs-dodge` and `.hs-lock` have no dedicated rules (`.hs-lock` only at l.332). Shared styles in `styles.css`: `.hdr` (l.136-158), `.card` (l.128), `.sws`/`.sw` (l.278-292).

**Practice lobby**
- `renderLobby` l.357-421. Seat cards `seatCard` l.365-394. When `l.bot` is on and the seat is empty, a mystery card (`.bot-seat`, `.bot-mystery`, `.bot-lvl`) shows, with "Mystery hero / drawn when the duel starts" (l.371-380).
- Arena cards l.396 from `ARENAS` (`shared/src/arena.ts:33`: hall, bridge, embers, crypt, grove). Rounds 1/2/3 at l.415, round time 90/120/180 at l.416, bot toggle and easy/normal/hard at l.403-404. Fight button l.418.
- Handlers `bindLobby` l.517-526 (`data-arena`, `data-set`, `data-level`, `data-seat`). `act` cases `bot` l.581, `start` l.584, `rematch` l.587, `toLobby` l.590.
- Classes: `.lobby`, `.seats`, `.seat*`, `.bot-*` are in `roster.css` l.387-500 and `styles.css` l.353-656; `.opt`, `.seg`, `.arena*` are in `styles.css`.
- Server side: bot hero is `botLoadout(seed)` (`shared/src/bot.ts:128`), applied at `shared/src/room.ts:424`. Difficulty is `botLevel` (`room.ts:102`, `:362`). Defaults: `ROUND.defaultWins`, `defaultTime: 120` (`shared/src/constants.ts:145`).

**Results** `renderResults` l.423-437: winner line, per-side rounds, damage and hits from `MatchEndMsg.rows`. Buttons: Rematch (host only), Lobby (`toLobby`), Main menu (`leave`).

**Match start and modes**
- `mode` is `'online'|'lan'|'practice'|'local'` (l.77).
- Practice and two-players-one-device: `startLocal` l.608-625 (`localRoom`, `botOn = true` for practice, a second Session for local).
- Online: `createOnline` l.627, `joinOnline` l.640 (direct link first via `dialHost`, otherwise the server), `connectDirectGuest` l.663, `goDirectHost` l.707, `connectOnline` l.731. LAN: `connectLan` l.136 with `probeLanHost` l.120.
- Start: `maybeStartGame` l.787 → `startGameView` l.794-852 (`show('game')`, `scene.start('game', …)` at l.821). `GameSceneData` is `{ players: LocalPlayer[], primary: Session }` (`packages/client/src/game/GameScene.ts:26-29`; `LocalPlayer` at l.20-24; `init` at l.569). `vsSplash` l.855-883.

**Match-end detection**
- Server: `room.ts:501` sets phase `results`, `room.ts:504` broadcasts `MatchEnd`, `room.ts:508-511` holds for `RESULTS_SECONDS = 15` (`room.ts:65`), then `endToLobby`.
- Client: `Session.ts:201-202` emits `end`. `App.wire` l.772-780 stores `lastEnd` and after 3200 ms calls `show('results')` if still in game.
- The lobby phase (`Session.ts:186-187`, `App.wire` l.765-770) returns the screen to the lobby. Per-round KO events go to `hud.onEvent` (l.823); the app has no round-level end signal.

**Settings** `renderSettings` l.242-250: volume (`data-pref="volume"`), screen shake, vibration checkbox, version and update button. `bind` l.481-490 writes via `setPref` (`ui/prefs.ts:47`). `damageNumbers` appears in the type cast but is not rendered.

**CSS files** (imported in `packages/client/src/main.ts:1-7`): `styles.css` (1132 lines, tokens, screens, lobby, results, settings, howto), `ui/roster.css` (500, hero select, VS splash l.387-402, bot mystery l.443-463, update button l.491-498), `ui/hud.css` (645), `ui/hudbars.css` (206). Fonts: Lilita One, Nunito.

**Other notes**
- `update-btn` class is styled in `roster.css:491`.
- `.hs-sprite` is painted by `ui/spritePreview.ts` (`animatePreview`, called at App.ts:200).
- Hero portraits are `assets/art/h-NN.jpg` (App.ts:35).