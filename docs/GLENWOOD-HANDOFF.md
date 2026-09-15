# Glenwood bungalows — handoff

Branch `claude/glenwood-houses`, started from `4c322b7` (`codex/complete-aylmer`).
Checkout: `C:\Users\Tom PC\Documents\GitHub Clone\aylmer-madness-glenwood` (a git
worktree of the main clone; the main checkout and Codex's repair checkout were not touched).

Implementation commit: `c6943589d3e2bbd6d9dab6354b37baf1d3f63f7d`. This document is the
commit after it (`[skip ci]`).

## What changed

| file | change |
|---|---|
| `src/game/glenwood.js` | **new.** Builder for three variants + `chooseGlenwood()` selection rule |
| `src/game/houses.js` | import + `glenwoodPlan()` export + an early branch in `buildHouse()` (≈50 lines, nothing existing altered) |
| `src/game/glenwood_lab.html`, `glenwood_lab.js` | **new.** Dedicated preview page |
| `tools/smoke_glenwood.mjs` | **new.** Targeted test; picked up automatically by `npm test` |
| `docs/GLENWOOD-HANDOFF.md` | this file |

Not touched: `world.js`, `terrain.js`, `main.js`, CSS, missions/audio/vehicles, map data,
workflows (there is no `.github/workflows` on this branch).

## The three variants

References: three Street View frames in the user's Downloads (`Codex Image … 09_41_55`,
`09_42_01`, `09_42_06`). All three share the silhouette that the generic
`mid_bungalow_hip` / `_gable` archetypes miss: **a very shallow gable whose ridge runs
front-to-back**, so the street sees a low triangle of siding under a thick fascia, and one
slope simply continues past the wall over the carport or porch.

| id | reference | built as |
|---|---|---|
| `glenwood_carport` | No. 294 | wide front gable (peak mid-body, rise 0.75–1.3 m), 3.0–3.8 m open carport carved from one end of the footprint with two posts, white siding, grey stone lower facade on the far side of the door, 0.7 m exposed foundation with three basement windows, 3-step stoop with one dark railing, small dark chimney |
| `glenwood_picture` | No. 4 | asymmetric gable peaking at 62 % over the entry (long shallow slope over the carport), beige siding, 1.0 m raised white foundation, large picture window over a stone band, sidelight, 4 steps with white railings both sides, privacy screen at the back of the carport |
| `glenwood_porch` | small white one | narrower; entry corner inset under the main roof as a covered porch (deck, two posts, header), clapboard white, brown fascia, 0.6 m exposed basement with windows, modest stone chimney, side driveway |

Heights: floor 0.6–1.0 m above grade, 2.4–2.5 m walls, eave 3.0–3.45 m. The carport or
porch side mirrors per house from the seed (both occur, test-checked).

## Budgets (measured, `node tools/smoke_glenwood.mjs`)

| variant | lod0 | lod1 | lod2 | eave | ridge | carport underside at posts |
|---|---|---|---|---|---|---|
| glenwood_carport (16 × 10) | 126 | 58 | 18 | 3.20 | 4.44 | 2.59 m |
| glenwood_picture (13.5 × 10) | 130 | 58 | 18 | 3.45 | 4.35 | 3.12 m |
| glenwood_porch (9 × 8.5) | 122 | 76 | 22 | 3.00 | 3.88 | — |

Existing ceilings are 160 / 80 / 48 and every build also passes `opts.budget` / a per-lod
cap to a `room()` guard. Clearance is clamped in code to ≥ 2.35 m (slope flattens if needed).
`smoke_houses.mjs` after the change: mean 94.9 tris, worst 158, all checks pass.

## Selection — how it reaches the game with no world.js change

`buildHouse(mb, b, hs, mats, rng, opts)` now honours `opts.glenwood`:

- **unset (what world.js passes today):** Glenwood only if `b.addr` matches
  `GLENWOOD_STREETS` (`/\bRue Glenwood\b/i`) **and** the normalised attributes are
  detached, one storey, and the building is `k: 'house'` or carries Phase-1 `hs`.
  Over the real MAP: 31 buildings on Rue Glenwood, **29** get a variant
  (carport 11, picture 9, porch 9); nothing off that street (test-checked).
- `false` — never. `true` / `'auto'` — any detached one-storey house (don't do this map-wide).
- `'glenwood_carport' | 'glenwood_picture' | 'glenwood_porch'` — forced; if the frontage
  is too narrow it falls back to the next smaller variant (carport ≥ 12 m, picture ≥ 10.5 m,
  porch ≥ 6.5 m, depth ≥ 6 m), else the normal archetype.

Variant choice and colour jitter come from `houseSeed(b, index)`, never from `rng`, so the
lod 0 and lod 2 bakes of one house agree. Colliders: the branch calls `opts.addSegment` once
per footprint edge in the same order `emitWalls` does.

The result object gains `glenwood: { variant, side, clearance, frontage, depth }`;
`archetype` is the variant id. `ARCHETYPES` is unchanged (the variants are exported as
`GLENWOOD_VARIANTS`), so existing tests and the house lab keep their tables.

## Integration instructions for Codex

1. Merge or cherry-pick `c6943589`. No edits to `world.js` are needed for Rue Glenwood.
2. To **disable**: in `world.js`, add `glenwood: false` to both `buildHouse` option objects
   (the lod 0 and lod 2 calls, ~lines 1366 and 1372).
3. To **extend** to neighbouring streets (Nelson, King, Montgomery, Elizabeth are within
   260 m) edit `GLENWOOD_STREETS` in `glenwood.js` — only after looking at them; the
   references only cover Rue Glenwood / Fraser.
4. Run `node tools/smoke_glenwood.mjs` and `node tools/smoke_houses.mjs`, then boot per
   `docs/VERIFY.md` and drive to Rue Glenwood (MAP centre ≈ x 733, z 357).

## Checks performed

- `node tools/smoke_glenwood.mjs` — all pass: budgets at 3 lods; shallow roof rise and apex
  above ridge; carport clearance; 288 cases (3 variants × 24 rotations × 4 street sides)
  asserting the chosen front faces the street, the steps/deck/walk are on the street side,
  nothing low sticks out the back or sides, and nothing above 2.2 m leaves the footprint
  beyond the 0.55 m overhang; narrow-footprint fallbacks; mirroring; real-MAP selection.
- `node tools/smoke_houses.mjs` — all pass.
- `node --check` on both modules.
- The full `npm test` run was **not** done (the machine was out of memory; see below).

## Visual verification

**Done in a real browser, on the preview page only — not in the game.** The Claude-in-Chrome
extension dropped when the machine ran out of memory, so the pass used headless Chrome
(SwiftShader, own profile, CDP port 9223 so Codex's 9222 was left alone) driven by
`tools/headless.mjs --menu`, loading `src/game/glenwood_lab.html` with the **real atlas**.
Six screenshots were taken and inspected by eye: all three from the front, from behind and
from the air, plus close front views of each and a street-eye view of the carport.

Seen and confirmed: the steps, doors, walks and driveways face the street and the backs
have windows only; the shallow front gable with its fascia reads on all three; the No. 294
carport stands on posts over the driveway with visible headroom; the grey stone lower
facade, the exposed foundation with basement windows and the 3-step stoop with a dark
railing are all there; No. 4 shows the picture window over the stone band, the sidelight,
four steps with two railings, and the carport privacy screen; the porch variant shows the
inset porch on two posts, its deck and steps, a basement window and the chimney. The page
logged no errors (only a favicon 404).

Found and fixed during the pass: the lab's side selector was labelled backwards (side −1
puts the carport on the viewer's right). Only the label changed; the builder already
mirrors both ways.

**Not verified:** the houses inside the running game on the real Rue Glenwood terrain, and
the full `npm test`. Codex should boot per `docs/VERIFY.md` after integrating.

Preview: `node tools/serve.mjs` then
`http://localhost:8123/src/game/glenwood_lab.html?focus=0&view=eye` (`focus` −1/0/1/2,
`view` front/back/left/right/aerial/eye/orbit, `lod` 0/1/2, `side` 1/−1).

## Limitations / what remains

- The carport is carved from the footprint, and colliders are the whole footprint, so the
  car cannot drive *under* a carport (same as existing attached garages). Making it
  drivable needs world.js to skip the carport rect when registering segments.
- Steps, railings and the walk stand proud of the footprint (as existing porches/steps do)
  and have no colliders.
- Terrain: the house sits at `opts.y`; the raised foundation is uniform, so on a slope the
  exposed foundation height does not vary side to side (world.js's skirt still covers gaps).
- Only rectangular body geometry on the footprint's largest rectangle; an L-plan's second
  wing is not drawn for Glenwood houses (29 real candidates, all simple bungalows).
- Windows use the existing decals; no new atlas tiles. Railings are flat bands, no balusters.
- Neighbouring streets are deliberately not included (see step 3).
