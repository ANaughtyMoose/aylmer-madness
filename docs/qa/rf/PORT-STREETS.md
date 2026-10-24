# Streets port verification

Status: scoped geometry review accepted, tests and both-entry boot green. Ready for the lead's final review before commit. The raw look-diff retains five pre-existing asphalt palette failures; this is not a global visual pass.

Source: `915bb8c`, adapted onto `87e252f` in branch `port/streets`.

## Changes

- `src/game/world/roads.js`: stable per-name residential sidewalk policy, service-way exclusion for sidewalk clipping, square utility and trench repairs, manholes and gutter grates.
- `src/game/world/walks.js`: conditional junction corners, short slab runs, bend joints and the curb on the side without a sidewalk. Junction branch indices still use the full map, including during clipped sector bakes.
- `src/game/world/reactive.js`: pedestrian runs use the sidewalk side on residential roads, or one shoulder where there are no walks.
- `tools/smoke_world.mjs`: walks may cross service entrances but no other road furniture may do so. An additional regression checks that crossing walks and curbs actually exist in the full world.

The existing Principale no-centre-line rule and parking behavior are untouched. No geometry or timing budget changed. No story or character text changed.

## Evidence

- Baseline `node tools/smoke_world.mjs`: 23/23 checks passed, 5,993,845 triangles, 9,958,434 vertices, 342 MB vertex data. Log: `scratchpad/port-streets-world-before.log`.
- After `node tools/smoke_world.mjs`: 24/24 checks passed, 5,955,857 triangles, 9,933,491 vertices, 341 MB vertex data. That is 37,988 fewer triangles and 24,943 fewer vertices with all budgets unchanged. Log: `scratchpad/port-streets-world-after.log`.
- Geometry behavior: 7,012 sidewalk samples continue across service entrances, 14,436 curb samples remain on sides without sidewalks, and no kept roadside furniture sample occupies another street. Both sectors retain their required pavement coverage.
- `npm test`: 86/86 suites passed, including `smoke_react` and `smoke_terrain` timing budgets on the first run. Log: `scratchpad/port-streets-tests.log`.
- JavaScript syntax and `git diff --check`: passed.
- The lead ran both browser captures after the worker's original sandbox denial. Baseline came from the clean detached `wt-port-streets-baseline` at `87e252f`; after came from the unchanged `wt-port-streets` candidate. Both captures: 8/8 clean, zero page errors, noon, identical poses and empty look override.
- Both-entry boot, run by the lead and independently checked from its log: index reached drive in 23.6 s, moved 146.7 m; prototype reached drive in 19.8 s, moved 144.6 m. Zero console errors on both. Preserved log: `scratchpad/port-streets-boot.log`.
- The candidate source fingerprint was rechecked after image review and is unchanged from the green suite. No source or threshold edits followed those tests. The private `port-streets-source.json` records file hashes because both uncommitted capture manifests report the common base commit.

## Independent visual inspection

The builder opened all eight before/after/reference sheets, the chase Principale originals and pixel mask, and the thumbnail sheet. The lead separately inspected all eight sheets. No new lane obstruction, detached sidewalk run or building/sky regression was found in the captured views. Geometry smoke supplies the wider crossing and clearance coverage that these fixed views cannot provide.

| Pose | Changed pixels | Builder observation |
| --- | ---: | --- |
| `fraser_front` | 0.115% | New gutter grate reads as a small rectangular road detail; frontage, driveway and continuous walk remain stable. |
| `mike_lawn` | 0.338% | Small pavement changes across the road; the lane remains clear and foreground house geometry is stable. |
| `denise_friend` | 0.033% | House and lawn stable. The pose shows little street, so it is not evidence for all sidewalk behavior. |
| `arial` | 0.345% | Small distant street changes only. The existing house mismatch against the reference remains later facade work. |
| `principale_british` | 0.398% | Walk and entrance stable; a generic hydrant now appears on the lawn behind the sidewalk. |
| `principale_strip` | 1.393% | Corner slabs and short runs meet the visible roadside without entering the driving lane. The no-centre-line rule remains intact. |
| `chase_fraser` | 1.619% | Foreground walk remains continuous; a small repair and changed residential edging are visible. The broad lighting seam is present before and after. |
| `chase_principale` | 1.465% | Corner joints change and generic roadside props move; the driving lane stays clear. The lane has no new centre markings. |

The six eye poses include their existing Street View references; the two chase poses have no supplied reference. Reference gaps in facade shapes, vegetation, street density and lighting remain. The port does not claim to fix them.

Generic prop movement follows from the existing single seeded RNG consuming the revised `walks` list in `buildReactive`. The separate special-prop placement code was not edited. The visible relocated props remain outside the carriageway.

## Raw look-diff result and limits

The standard look-diff exits 1 with five asphalt palette misses. Those five sampled regions were already outside the unchanged target of RGB 156/150/148, tolerance 16. Four before/after means are identical. Highlight clipping stays below the existing 0.5% limit in every shot, with a maximum of 0.15%.

The fifth region, `chase_principale`, changes from RGB 104.6/105.1/105.2 to 99.1/99.2/101.2. Independent inspection and a pixel check show the region includes the newly placed dark roadside box: all 1,816 changed pixels in the 30,720-pixel region lie within x1094..1151, y440..478, at that box. A separate 6,096-pixel diagnostic rectangle on unobstructed asphalt is identical before and after at RGB 93/93/98. This diagnostic does not replace or modify the official region, palette or threshold.

The inherited asphalt/lighting gap remains Wave B work. Scoped geometry acceptance is recorded separately from the failed full palette result. No budget was raised.

## Evidence locations and reproduction

Evidence is private under the main checkout's `references/places/_feedback/visual-wave/V2-01/`:

- `port-streets-before/` and `port-streets-after/`: PNGs, shot metadata, manifests and successful `vis-check.json` files.
- `look-diff/port-streets-before-vs-port-streets-after/`: all eight sheets and masks, `thumbs.png`, and the raw failing `look-diff.json`.
- `port-streets-source.json`: unchanged candidate fingerprint.
- `port-streets-road-roi.json`: the independent road-region diagnostic.

The visual helper requires a registered task, so `V2-01` is an output namespace only. That task is not implemented or marked complete by this port. Commands used server 8243 and CDP 9543, with `CMP_REF_ROOT` set to the main checkout. Capture flags: `--task=V2-01 --tag=port-streets-before` or `port-streets-after`, `--look= --poses=fraser_front,mike_lawn,denise_friend,arial,principale_british,principale_strip,chase_fraser,chase_principale --env=noon`. The look-diff used those two tags and all eight poses in `--scope`.

The original repair tint is retained. The current prototype shader does not explicitly suppress its crack network based on that tint, so this port does not claim that behavior.
