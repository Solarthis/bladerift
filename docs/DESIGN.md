# Bladerift — design brief

A lightweight web game: **two players fight each other** with medieval weapons in side-view arenas. Online by
room code, on one Wi-Fi, two players on one device, or against a bot. Built on the Skyfire Squad scaffold
(same stack, same online server pattern, same painted character rig).

## What the reference recording shows (and what we take from it)

The 5-second phone recording is a side-view, painted pixel-art action platformer played in landscape:

| Seen in the recording | What Bladerift does with it |
| --- | --- |
| Left floating joystick; right thumb cluster: 2 weapon buttons, 2 skill buttons, jump, roll, heal | Same thumb layout: **Weapon A, Weapon B, Skill, Jump, Roll, Heal**, joystick on the left |
| Fast melee: wide crescent slashes, thrusts, charged swings, hit flashes, big damage numbers | Every weapon has a combo with wind-up / active / recovery, crescent trails, hit-stop, shake and damage numbers |
| Dodge roll through attacks | Roll with invulnerable frames and a cooldown: the core defensive move |
| A health flask with limited uses | One flask per round, drunk over 0.8 s, interrupted by a hit |
| A big boss health bar along the top | No bosses: **two fighter health bars** along the top, round wins under them |
| Painted parallax biomes (crypt, burning ruins, moonlit bridge, forest) | Four original duel arenas with painted parallax backdrops |
| Weapon icons on the buttons | Buttons show the equipped weapon's icon and cooldown sweep |

Bladerift is an original game in this genre (a 1v1 duelling platformer). It copies no characters, art, names or
levels from the recording.

## Core loop

1. Pick a fighter (look), **two weapons** and **one skill**.
2. Duel: first to **2 round wins** (best of 3; host can set 1 / 2 / 3). 90 s rounds; at time-out the higher health % wins.
3. Between rounds both players may swap their loadout (8 s).
4. Results screen; rematch or back to the lobby.

## Fighter controls

| Action | Touch | Keyboard P1 | Keyboard P2 (same device) | Gamepad |
| --- | --- | --- | --- | --- |
| Move / aim down | joystick | A / D, S | ← / →, ↓ | left stick |
| Jump (double jump) | Jump | W or Space | ↑ | A |
| Weapon A | button | J | Numpad 1 / , | X |
| Weapon B | button | K | Numpad 2 / . | Y |
| Skill | button | L | Numpad 3 / / | RB |
| Roll | button | Shift / I | Numpad 0 / ' | B |
| Heal | button | H | Numpad + / ; | LB |

Holding down + jump drops through a platform. Attacking in the air does an aerial; down + attack in the air does a plunge.

## Weapons (any two)

| Weapon | Style | Signature |
| --- | --- | --- |
| **Scythe** | Slow, very wide arcs, long reach | 3rd hit hooks and **pulls the enemy in**; tip hits crit |
| **Lance** | Long, narrow thrusts | Hold to charge a **lunge** that dashes across the arena |
| **Twin Daggers** | Very fast 4-hit flurry, short reach | Hits from **behind crit** ×1.5 |
| **Longsword** | Balanced 3-hit combo | 3rd hit **launches** upward |
| **War Hammer** | Very slow, huge damage | 3rd hit is a **ground slam shockwave** |
| **Bow** | Ranged arrows | Hold to charge a piercing arrow |
| **Tower Shield** | Defence | Hold to **block** frontal hits; a block at the right moment **parries** and stuns; tap to bash |

## Skills (pick one)

| Skill | Effect |
| --- | --- |
| **Fire Bomb** | Thrown arc, explodes, sets the target **burning** |
| **Frost Shard** | Fast bolt; **slows** the target |
| **Snare Trap** | Placed on the floor; **roots** whoever steps on it |
| **Blink** | Short teleport forward with invulnerability |

## Combat rules

- 1000 HP per fighter. Hits cause hit-stun (longer for heavy weapons) and knockback; a 3-hit combo can't stun-lock
  forever: after 4 consecutive hits within 1.2 s the defender gets a short invulnerable "break".
- Roll: 0.36 s, invulnerable for the first 0.26 s, 0.7 s cooldown. Rolling through an enemy is allowed.
- Heal flask: +30 % max HP over 0.8 s, one per round, cancelled by a hit (the charge is spent).
- Skill cooldowns 6-9 s. Weapon B can be a second melee weapon, the bow or the shield.
- Arena edges are walls (no ring-outs); platforms are one-way.

## Modes

- **Play online**: create a match (4-letter code, QR, share link) or join by code; spectators can watch.
- **Same device (2 players)**: two keyboards halves or two gamepads, or split touch on a tablet.
- **Practice vs bot**: easy / normal / hard bot that spaces, rolls, punishes and heals.
- **LAN host**: the PC launcher serves the game on the Wi-Fi like Skyfire Squad.

## Technical approach (reused from Skyfire Squad)

- `packages/shared`: deterministic 60 Hz fighter simulation (movement, attacks, hit boxes, projectiles), binary
  protocol, room (2 fighter seats + spectators), bot. The **same Room runs in the browser** for practice and same-device
  play, so offline play exercises the real network path.
- Server-authoritative netcode: client-side prediction of your own fighter, interpolation of the opponent, hit
  decisions on the server with bounded lag compensation (rewind to what the attacker saw).
- `packages/client`: Vite + Phaser 4 PWA; the painted hero rig (cut-out skeleton with IK) drives every attack pose,
  so new weapons need only a weapon sprite and a pose table; procedural audio.
- Online server: a separate Hostinger Node.js web app, like Skyfire's.
- Web: `https://games.matsolutions.gy/bladerift/` (Skyfire stays at the root).
- Art: weapon sprites, arena backdrops and new outfits generated with the Codex CLI image tool, then sliced and packed.
