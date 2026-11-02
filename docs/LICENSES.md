# Asset and dependency licensing

Bladerift ships **original art, arenas and characters** (listed under "Original" below), the vendored **PixelFX**
effects library (MIT), and a recorded **audio pack** of CC0 and CC-BY 4.0 sounds (listed under "Audio pack").

## Original content (owned by MAT Solutions)

| Content | Source of truth | How it was made |
|---|---|---|
| Heroes (portraits, sprite sheets, character bibles) | `art/characters/h*`, `packages/client/public/assets/characters` | Original designs, made for this project with AI image tools and the `tools/sprites` pipeline. The heroes take archetypes and legendary or historical names only; no franchise designs, likenesses or ability names are copied |
| Arenas and stage effects | `art/arenas`, `packages/client/src/render/arena.ts`, `render/stageFx/` | Original, drawn in code and from project art |
| UI illustrations, icons, app icon | `packages/client/src/ui/art.ts`, `art-src/icon.svg` | Inline SVG authored in code |
| Synthesized sound effects | `packages/client/src/audio/Sfx.ts` | Synthesized at runtime with the Web Audio API, used where no recorded sample fits |

## PixelFX (third-party, MIT)

`packages/client/src/vendor/pixelfx/`: pixel-art attack animations and effects, MIT licence. The licence and notice are
kept beside the code (`LICENSE`, `NOTICE.md`).

## Audio pack (third-party, recorded)

Shipped in `packages/client/public/assets/audio/` (`music/`, `voice/`, `sfx/`, `manifest.json`), built by
`tools/audio/build.mjs` from `tools/audio/plan.json`. Every source below is **CC0 1.0 Universal** (public domain
dedication, https://creativecommons.org/publicdomain/zero/1.0/), so no attribution is legally required. The
"credit requested" column records what the author asked for. It is courtesy, not a licence term. Sources were
downloaded to `.cache/assets/` and checked there (see each folder's `SOURCES.md`).

**Exception (CC-BY 4.0, attribution required):** the `ko` and `continue` voice lines are from Alba MacKenna's
"Voice Pack: Fighting Game Announcer" (https://opengameart.org/content/voice-pack%E2%94%82fighting-game-announcer),
licensed CC-BY 4.0 (https://creativecommons.org/licenses/by/4.0/). They are used unmodified apart from trimming,
level and MP3 encoding. The in-game credit is in Settings > Game > About.

### Music (manifest `music` ids)

| Id | Track (as shipped) | Author | Source | Credit requested |
|---|---|---|---|---|
| `title` | Determined Pursuit (epic orchestra loop) | Emma_MA | https://opengameart.org/content/determined-pursuit-epic-orchestra-loop | Optional: "Determined Pursuit (epic orchestra loop)" by Emma_MA, CC0 |
| `select` | Character Selection Theme Loop | beardalaxy | https://opengameart.org/content/character-selection-theme-loop | Credit appreciated, not necessary |
| `stage-hall` | Epic Boss Battle [Seamlessly Looping] | Juhani Junkala (OGA upload by SubspaceAudio) | https://opengameart.org/content/boss-battle-music | Optional |
| `stage-bridge` | JRPG Epic Rock Battle Theme #1 (loop cut) | HydroGene | https://opengameart.org/content/jrpg-epic-rock-battle-theme-1 | Author asks to be told about projects that use it |
| `stage-embers` | Boss Battle #2 [Symphonic Metal]: opening, then the loop twice (about 106 s) | nene | https://opengameart.org/node/84428 | None on the page |
| `stage-crypt` | 8-bit Infinite Darkness | HydroGene | https://opengameart.org/content/8-bit-infinite-darkness | Optional |
| `stage-grove` | Fairy Battles (bpm 180) | MintoDog | https://opengameart.org/content/fairy-battles | None recorded |
| `victory` | Victory Theme for RPG (cut to 20 s, faded out) | cynicmusic | https://opengameart.org/content/victory-theme-for-rpg | None recorded |
| `results` | Calm Track (loop) | pmiller | https://opengameart.org/content/calm-track | None recorded |

### Voice (manifest `voice` ids)

| Ids | Pack | Author | Source | Credit requested |
|---|---|---|---|---|
| `round1`, `round2`, `round3`, `finalRound`, `fight`, `ready`, `perfect`, `youWin`, `youLose`, `draw`, `gameOver`, `winner` | Kenney Voiceover Pack: Fighter | Kenney Vleugels (Kenney.nl) | https://kenney.nl/assets/voiceover-pack-fighter | None |
| `timeOver` | Kenney Voiceover Pack #1 (40+ lines), Male set | Kenney Vleugels (Kenney.nl); voice by Jeffrey M. Smith | https://opengameart.org/content/voiceover-pack-40-lines | None |
| `ko` ("Finish", FX version), `continue` (FX version) | Voice Pack: Fighting Game Announcer | Alba MacKenna (Alba_Mac) | https://opengameart.org/content/voice-pack%E2%94%82fighting-game-announcer | **CC-BY 4.0: credit "Alba MacKenna"** |

### Sound effects (manifest `sfx` ids)

| Ids | Pack | Author | Source | Credit requested |
|---|---|---|---|---|
| `hitLight`, `hitHeavy`, `hitCrit`, `throw`, `bodyFall`, `land`, `step` | Kenney Impact Sounds | Kenney (kenney.nl) | https://kenney.nl/assets/impact-sounds | None |
| `koThud` | Kenney Music Jingles (HIT15) | Kenney (kenney.nl) | https://kenney.nl/assets/music-jingles | None |
| `uiMove`, `uiSelect`, `uiBack`, `uiStart` | Kenney Interface Sounds | Kenney (kenney.nl) | https://kenney.nl/assets/interface-sounds | None |
| `slash`, `block` | 20 Sword Sound Effects: attacks and clashes | StarNinjas | https://opengameart.org/content/20-sword-sound-effects-attacks-and-clashes | None recorded |
| `parry` | Metal Impact Sounds (clink2) | BMacZero | https://opengameart.org/content/metal-impact-sounds | None recorded |
| `whoosh`, `whooshHeavy` | Swishes Sound Pack | artisticdude | https://opengameart.org/content/swishes-sound-pack | Credited, not required |
| `fire` | Fireplace Sound Loop (cut to 30 s) | PagDev | https://opengameart.org/content/fireplace-sound-loop | None recorded |
| `wind` | 150 Combat Sound Effects (Wind Spell Impact 1 and 3) | untamedpixels (bundled sources per its LICENSES.txt) | https://opengameart.org/content/150-combat-sound-effects | None recorded |

## Fonts (bundled via @fontsource, self-hosted)

| Font | Author | License | Attribution requirement |
|---|---|---|---|
| Lilita One | Juan Montoreano | SIL Open Font License 1.1 | Keep the license with redistributed font files (included in `node_modules/@fontsource/lilita-one/LICENSE`); the Reserved Font Name may not be used for modified versions |
| Nunito | Vernon Adams, Cyreal, Jacques Le Bailly | SIL Open Font License 1.1 | Same as above |

Commercial use and embedding in apps/web pages are permitted under OFL 1.1.

## Runtime / build dependencies

| Package | License | Use |
|---|---|---|
| phaser 4 | MIT | Rendering engine |
| ws | MIT | LAN server WebSockets |
| qrcode | MIT | Join QR codes |
| vite, vite-plugin-pwa, workbox | MIT | Build, service worker |
| @resvg/resvg-js | MPL-2.0 | Build-time SVG rasterization only (not shipped) |
| playwright, vitest, tsx, esbuild, typescript | Apache-2.0 / MIT | Development and testing only (not shipped) |

No purchased or premium assets were used. No font or audio source requires visible in-game attribution (OFL only requires the license to accompany redistributed font files; CC0 requires none). The author credit requests are listed in the Audio pack section above.
