**Verdict: SHIP AFTER FIXES.** Core flows run with no console or page errors, and the tests pass. Fix the franchise-looking hero names, the missing K.O. announcer line, the throw-break input, and the uncommitted working tree before deploy.

**Checks run**
- `npx vitest run`: 19 files, 467 tests pass.
- `tsc --noEmit` for shared, client and server: clean. `tools/servercheck.mjs` not run (needs a build).
- `.cache/gate/integ-flow.mjs`: every check PASS (arcade ladder, continues, survival carry-over, run over, practice results, records, training dummies, infinite gauge, reset).
- My runs at 1280x720 and 844x390 (title, arcade to K.O. and round 2, forfeit to ladder, training, hero select, settings, move list, records): no page or console errors. Audio requests verified in play. I did not listen to audio, and did not play throws or EX.

**Requirement checklist**
1. Music: **MET**. Title, select and stage-hall tracks load in play (`music.play('stage-'+theme)` at GameScene.ts:632, victory at App.ts:1207).
2. Announcer: **PARTIAL**. Round, fight, ready, perfect, timeOver, draw, youWin/youLose and winner lines load. No K.O. line exists (see defect 2).
3. Recorded SFX: **MET**. 18 of 19 manifest ids; hits, blocks, whooshes, throws, parries, footsteps and body falls play as samples. `wind` is missing and falls back to synth.
4. K.O. and round flow: **PARTIAL**. At 1280x720: white flash, ring, red "K.O." banner, a 2.5 s hold (60 ticks/s, matching koTicks 150), "ME WINS", ROUND 2 intro, and "WINNER!!" at match end. Slow motion is client-side and not visible in the tick data. No winner pose is evidenced. The phone K.O. framing crops (defect 4).
5. Fighters big enough: **MET** in fights. About 21% of screen height at 1280x720 (`critic-desk-05-fight-start.png`), about 17% in round 2, about 18% at 844x390 (`critic-m844-05-fight-start.png`). The wide intro framing shows about 13% for roughly a second.
6. VS splash and intros: **MET** for the splash. Portraits, names, stage and "ARCADE 1/7" appear at both sizes. ROUND 1 and FIGHT banners follow. Walk-in poses are not evidenced.
7. Deeper moves: **MET** in code and tests, with a documentation error. Throw tech window (world.ts:660-701, fighter.ts:1058-1061), EX, per-hero move lists and training are present. The general move list misstates the throw break (defect 3).
8. MUGEN-style hero select: **PARTIAL**. Large preview, class grid with TRUE/FALSE tags, stats and skill list. No opponent portrait, so no VS-style both-sides layout, and the preview animation is not evident.
9. Arcade, survival, training, records: **MET**. Seven-stage ladder, continues, CLEARED, survival carry-over, run over, records totals, training HUD (LAST/COMBO/HITS/BEST), dummy modes and reset.
10. Animated stages: **PARTIAL**. Five arenas have stage-FX modules (arena.ts:15-24). The integrator measured 0.3-1.3% pixel change over 700 ms, and I saw no obvious motion in the captures.
11. Full settings: **MET**. Audio: four channels. Video: graphics quality, screen shake, high refresh, fullscreen, damage numbers. Controls: keyboard remap, touch size, opacity, left-handed. Game: vibration, about, update. I read the Video, Controls and Game tabs but did not interact with them.

**Remaining defects (most severe first)**
1. **MAJOR, before public launch.** Several roster and ladder names match Fate/Grand Order Servant names: Cú Chulainn (heroes.ts:33), Gilgamesh (:31), Hassan with the epithet "Old Man of the Mountain" (:41), plus Enkidu, Alexander, Alcides, Jack the Ripper, François Prelati, Alexandre Dumas and Humbaba. The brief forbids copying franchise names, so verify each and rename.
2. **MAJOR.** No K.O. announcer line. The manifest has no `ko` voice, `say('ko')` is never called, and the Voice setting promises "KO" announcements (settingsScreen.ts:108). `continue` and `newChallenger` are also absent.
3. **MAJOR.** The move list gives throw break as →+HEAVY (moveList.ts:48). The sim breaks with LIGHT or HEAVY during the tech window (fighter.ts:1061), and h00.json says the same. Players will be told the wrong input.
4. **MAJOR on phones.** At 844x390 the K.O. camera zooms to about 2.9x on the winner, cropping the winner's body at the bottom edge, and the frame is mostly ring and blur (`critic-m844-06-ko-00.png`, `critic-m844-06-ko-02.png`). The desktop K.O. zoom reaches about 4.5x.
5. **MAJOR, ship hygiene.** 108 files are uncommitted, including re-encoded audio MP3s and untracked `art/**/old/` folders. The build cannot be reproduced from git. Commit before deploy.
6. **MINOR-MAJOR.** Stage animation is barely visible (defect in requirement 10).
7. **MINOR.** At 844x390 the hero select shows two red-outlined cards (saved Saber, and Hassan under the pointer) and a Hassan preview while the saved loadout is Lionheart (`critic-m844-12-heroselect.png`). Likely a hover state from the emulated touch. Confirm on a device.
8. **MINOR.** The wide intro framing shows sprites near 13% of screen height at 1280x720 (`critic-desk-04-intro-900.png`), below the 16-20% reference.
9. **MINOR.** The winner banner uses the raw profile name, so the default profile reads "ME WINS" (koSequence.ts:386, `critic-desk-06-ko-03.png`).
10. **MINOR.** The arcade ladder's sticky header covers the top of the first list card at 1280x720 (`critic-desk-03-ladder.png`).
11. **MINOR.** `wind` is missing from the manifest, so `dodgeFog` and `artFog` use the synth fallback (Sfx.ts:182-183).
12. **MINOR.** The hero select has no opponent portrait, so the reference's both-sides layout is absent.

**Evidence**
- Screenshots: `C:/Users/vascu/AppData/Local/Temp/claude/C--/3e5d6721-b735-4f36-b275-bbd396a973d7/scratchpad/qa/critic-desk-*.png` and `critic-m844-*.png`.
- Logs: `.../scratchpad/qa/critic-desk.log`, `critic-m844.log`, `critic-flow.log`.
- Scripts I added under `C:/Users/vascu/Projects/bladerift/.cache/gate/`: `critic-run.mjs`, `critic-ko-timing.mjs`, `critic-probe.mjs`, `critic-audio.mjs`. No app source was edited.