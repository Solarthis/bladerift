Finding skipped: I could not reproduce a lying/upright alternation in the K.O. hold, and I made no edits to `packages/client/src/render/*`.

**Why the code cannot produce the flicker on its own**
- The K.O. ground branch (`spriteAnim.ts` ~lines 371-379) always draws `down` (a single frame, `hurt:5`, per `atlas.json`) with `rot` 0 and only a bounce offset. It cannot draw upright.
- Upright drawings come only from the K.O. air branch (`spriteAnim.ts` ~lines 362-369: `launched`/`knockFall` with `rot` about -7 to -14). That branch needs `v.ground` to be false.
- Sim trace (`packages/shared`, bridge arena, one run with the winner idle and one with the winner walking onto the victim): the victim's `ground` goes 0 to 1 once at landing (tick 33) and never flips back during the K.O. So the sim does not produce the flicker.

**What the evidence still leaves open**
- `crop-loser-desk.png` #028-029 show a larger, upright figure under the same "Thorne" label, with a different framing and zoom than #026-027 and #030-033. The upright figure may be a camera or framing change, or the other fighter (both are Thorne in that match), rather than the loser's sprite flipping. I did not confirm which, and did not run the browser repro.
- If the owner still sees it, the next check is a Playwright capture that logs the loser's view `ground`, `act` and frame name per render frame during the K.O. in the real match, plus which sprite instance is drawn at #028.

No tsc or vitest run was needed, since no files changed. Scratch traces were removed; the repo is untouched by me.