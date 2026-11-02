# Move lists (one JSON per hero: h00.json .. h13.json)

Read by `ui/moveList.ts`. Schema:

```json
{
  "hero": 0,
  "name": "Richard Lionheart",
  "weapon": "Lion-Hilt Longsword",
  "style": "One sentence on how this hero wants to fight.",
  "moves": [
    { "name": "Lion Combo", "input": "LIGHT, LIGHT, LIGHT", "kind": "normal", "damage": [90, 95, 132], "notes": "The third swing launches." }
  ],
  "combos": [
    { "name": "Bread and butter", "input": "LIGHT, LIGHT, ↓+LIGHT, JUMP, LIGHT, LIGHT, LIGHT", "notes": "Launcher into the air combo." }
  ]
}
```

`kind` is one of `normal`, `heavy`, `launcher`, `air`, `plunge`, `throw`, `special`, `ex`, `art`, `dodge`.
Input notation: `LIGHT`, `HEAVY`, `JUMP`, `DODGE`, `SPECIAL`, `ART`, arrows `→ ← ↓`, `+` for together, `,` for in
sequence, `(close)`, `(air)`, `(hold)`. Every hero has: the light combo, the heavy (or Sun Crescent / charged shot),
the launcher `↓+LIGHT`, the air combo `LIGHT, LIGHT, LIGHT (air)`, the plunge `HEAVY (air)` where the weapon has one,
the throw `→+HEAVY (close)`, the special (SPECIAL), the EX special (`ART` at 50% gauge), the Rift Art (`ART` at 100%),
and the dodge (DODGE). Damage numbers come from packages/shared/src/weapons.ts and classes.ts (do not invent them).
