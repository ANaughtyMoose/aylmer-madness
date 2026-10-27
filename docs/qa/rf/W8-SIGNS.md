# W8-SIGNS report (branch rf/w8-signs, from fix/look-on-qr c2928ca)

Continues W7-PLACES "Not done": the Grande-Riviere name board, D-12's two place keys, and V3-04's lit-sign night overlay for the five recognition places. Specs: references/review/specs/D-12.md (designs 1 and 4) and V3-04.md (section 4). D-12's surname renames in storefronts.json are skipped (they wait on Tom). No photo was opened. Every test ran on the Colab VM through ct.py.

## Done
1. Grande-Riviere board (fd6dc7d), src/game/landmarks.js. Cheaper clean option: a small school site, not a storefront-style `signs` spec. signage.js has no `signs` array, so the spec route needed new signage code and a second sign path; a site reuses the landmark board path (main sign mesh, its footing rule, its frame) as it is.
   - `GRANDE_RIVIERE` = D-12's numbers: (-701.45, -1093.99), yaw 1.4968, 13.0 x 1.8 m, y 4.4 over the site ground, wall mount, navy #1d3f6e (the PWHS school colour), `fit`, cap 84 px. 0.15 m off the west wall of OSM 68609168, facing Rue Broad (30.6 m to its centreline). Top at 6.2 m under the 7.0 m wall.
   - Site `granderiviere` (r 12, no `hide`, the OSM building stays): its only geometry is a concrete sign band behind the board (14.2 x 2.6 m, 0.2 m deep, centred on the wall plane, face 0.1 m proud, 5 mm behind the board frame) and a coping cap. 24 near / 24 far / 12 site tris against BUDGET {48, 48, 24}; 4 colliders round the band (needed by smoke_landmarks; they sit 0.1 m outside the real wall, so they change nothing for the car).
   - Draw cost: +1 draw (the 12-tri site mesh with the board frame) only while the band is in frame within drawDist + 160. The board text rides the existing main sign mesh (no draw).
   - Sign atlas: this is board 49. With the old layout (`cols = ceil(n/16)`) it would have opened a fourth 1024 x 2048 column (8 MB of texture for one cell). Now (64027ca) the columns grow by a row instead: 3 x 17 cells (3072 x 2176, +0.5 MB). Up to 48 boards the layout is exactly as before.
2. Place keys (fd6dc7d), src/game/places.js, D-12 design 4 verbatim: `superc` { x 67.6, z -263.2, a 1.4949, 'Super C, Galeries d’Aylmer' } (not snapped, the yogurt-run door; no mission retargeted) and `granderiviere` { road 'Rue Broad', (-732.1, -1093.7), 'École secondaire Grande-Rivière', snap }. Resolves to (-732.13, -1093.70).
3. Lit-sign night overlay (fd6dc7d), landmarks.js, V3-04 section 4. The five boards carry `lit: true`: Tim Hortons (TIMS_SIGN), PAROISSE SAINT-PAUL (SP_SIGN), LES GALERIES D’AYLMER, Super C (the D-12 wall board), MARINA D’AYLMER. They stay in the main sign mesh (8 vertices per board, smoke_landmark_ground's indexing holds). buildSignMesh also bakes the same quads, same texels, `LIT_OUT` 0.08 m further out (0.21 m off the board), into one small mesh per owning site (timhortons, british, galeries, marina: 4 meshes, 10 quads, 20 tris in all). In the wrapped world.draw: only when `nightAmount(r.env) > 0.35`, only when the car is within 250 m of that mesh's box centre, only if `r.visible`, drawn with a preallocated `{ tex: signs.tex, unlit: true, colorMul: [0.92, 0.88, 0.84] }`: the renderer's existing uUnlit path, no shader change, no new pass, no per-frame allocation. By day and beyond 250 m nothing is drawn. `world.landmarks.stats.lit` counts overlay draws; `world.landmarks.signs.lit` lists them. Exports: `GRANDE_RIVIERE`, `LIT_OUT`, `LIT_NIGHT`, `LIT_NEAR`, `LIT_MUL`.
   - Not built from V3-04 (out of this task): the CT pylon is not lit (the task named five places; it is one line, `lit: true` on CT_PYLON, if the lead wants it), the back-lot night mesh, LANDMARK_LIGHTS, the glass helper.
   - Expected perf: +0 draws by day. At night, +1 draw per lit place within 250 m and in frame (at most 2 at the Galeries, where Super C and the mall name share one mesh). V3-04 flagged galeries_lot (perf8) as near the Galeries: expect up to +1 draw, 8 tris there at night.
4. tools/smoke_w8_signs.mjs: 20 asserts (board on the wall, outside the footprint, facing Broad, legible 42 m, budget, colliders; both place keys; exactly five lit boards, 8 vertices per lit board, overlay 0.08 m proud of its twin, nothing by day, the Tim's glows at night from 20 m, same opts object every frame, nothing beyond 250 m).

## Checks
- Named smokes on the VM at 11663b7: GREEN (w8_signs 20/20, landmarks, landmark_ground, landmark_roads incl. granderiviere clear of every street, w7_places, w7_modern_names 4/4, camera_world, historic_mall, no_dashes 6/6).
- Full suite: NOT RUN. Three attempts at 862aa43 (two full, one named) all stopped before any test with `AssertionError: patch sha mismatch` in the VM's patch reassembly (slot 1, patch 36820 KB): the queue, not the code. No full-suite run was used up.
- Not yet tested on the VM: 64027ca (sign atlas 3 x 17 instead of a fourth column). It moves cell positions only for 49+ boards; smoke_landmark_ground checks heights, not UVs. Lead: rerun `ct.py test rf/w8-signs` once the slot is fixed (target GREEN, 117 with the 3 VM-only fails counted green, plus smoke_w8_signs).

## Night screenshot poses for the lead (HUD-free, night env, med)
- The Tim's: eye (-212, ground + 2.0, -190) looking at the sign (-237.8, ground + 2.8, -182); also the nuittim 3 a.m. pose.
- Saint-Paul board: eye (-926, ground + 1.6, -370) looking at (-926, ground + 1.7, -389.5) (19.5 m south, on the chemin Eardley side).
- The Galeries name: eye (9.1, ground + 2.4, -247.9) looking at (-0.41, ground + 7, -286.55).
- The Super C: D-13's superc_front, eye (63.0, ground + 2.4, -238.0) looking at (66.66, ground + 6, -275.0).
- The marina: the board (-1673.5, ground + 2, -114) is double faced, normal (-0.828, 0.560) or its opposite. Eye 15 m out on whichever side is clear of the capitainerie: (-1661.1, ground + 1.6, -122.4) or (-1685.9, ground + 1.6, -105.6). Plus marina_quay at night.
- Grande-Riviere (noon and night; it is not lit): eye (-735, ground + 1.6, -1060) looking at (-701.45, ground + 5.3, -1093.99), a chase-like view from Broad about 46 m out.
- Each night pose: the board should read as a backlit panel; check for z-fight between the overlay and the board (0.08 m) at 200 to 250 m, and the pop when it switches on at nightAmount 0.35 (a dusk pose).

## Cloud checks for the lead
- boot.mjs on index.html and prototype.html: 0 console errors (prototype renders `unlit` through MeshBasicMaterial, as the lamp pools do).
- perf.mjs perf8 noon/night/rain med: day draws delta 0 (+1 only if the school band is in frame), night delta at most +1 at galeries_lot.
- The poses above.

## For the lead / Tom
- Tom: was the 2004 board on Grande-Riviere's west wall at all? Default: the name on the wall facing Broad, from the OSM name only.
- Lead: CT_PYLON lit or not (spec says lit; task named five). Default: not lit.
- Lead: poses.json still needs chase_principale_west and superc_front's new target (from W7-PLACES).
