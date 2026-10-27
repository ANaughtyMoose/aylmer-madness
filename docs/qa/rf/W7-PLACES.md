# W7-PLACES report (branch rf/w7-places, from fix/look-on-qr 17fc765, merged c685390)

Goal (bar 10): the Tim's, rue Principale, the Galeries, the Super C and the marina read on sight. Continues W6-BOARDS (steps 2, 3) and W6-PLACES (Super C fascia, Galeries name, Grande-Riviere, modern-name smoke), per specs D-12 and V3-04. No photo was opened; positions come from the specs' OSM numbers.

## Done (one commit per place)
1. Galeries and Super C (aed3f20), src/game/landmarks.js.
   - SUPER_C board on the real east storefront wall (D-12): (66.66, -275.00), yaw -0.0759, 20 x 3.3 m, y 4.3 over the site ground (bottom about 30.98 abs), wall mount, 96 px cap, `fit`. The old board at (63, -275.8) sat inside footprint 68609502 and is gone. Red fascia 26 x 4.4 m and a 17 x 3 m glass front on that wall plane (the old panel was 1.1 m inside the footprint). Tom's pylon panel stays.
   - GALERIES_NAME over the south doors: (-0.41, -286.55), yaw GA_YAW, 20 x 2.6 m, y 5.66 (bottom about 32.34 abs, 0.94 m over the vestibule top), brown #6a4a1c like the lot board (kept).
   - CT_PYLON (V3-04 design 3): 9.1 x 3.9 at y 4.0 on two 0.45 m steel posts at +-3.2 m, cabinet bars, 1.2 m stone skirt; backing box keeps its g.y - 0.06 edge.
   - Sign atlas: opt-in `fit` (true glyph shape on boards taller than the 8:1 cell), `cap` (font px), `style:'tims'`. All other boards draw exactly as before.
2. The Tim's (ac1c070, V3-04 design 1). TIMS_SITE replaces the historicstrip `timhortons` entry by key before the hide loop, behind flag `landmarks2` (on; `?look=-landmarks2` gives the old box). Key, PLACES.tims and nuittim untouched. Stone walls on OSM ring 94173715, quoins, plinth, eave band, a true gable roof (ridge 7.57 m) with stone gable ends to Principale, a door between two windows on the gable, four east windows around a 5.6 m bay, the two east dormers as gabled dormers out of the slope. TIMS_SIGN on the east wall at z -182, 5.2 x 1.5 m (41.6 px at 30 m), cream script on red. Pavers #9A5E4A with 0.6 m joints (forecourt and east strip), TIMS_LAMP (-233.0, -163.5, h 4.2) in both bakes, back lot TIMS_LOT with standards at (-272.8, -181) and (-268, -194). No drive-through. Bake 312 near / 144 far / 220 site tris against {4500, 900, 1000} (lower than the default 8000/4000/1800 it had).
3. Rue Principale: Saint-Paul (06d16dd, V3-04 design 2). Footprint 68609126 hidden as british hide[1]; buildStPaul chained after buildBritish in both bakes (no new draw): rubble nave with three windows per long side, steep gable roof, a 5 m frontispiece tower to 22 m, louvred belfry to 26.5 m, an octagonal tin spire (0xc9ccce) and cross to 44 m, lifted to the church's own ground. Board PAROISSE SAINT-PAUL (-926, -389.5). British near 3220/12000, far 574/1400; british.near and centre unchanged. A collider-only `stpaul` entry shares the British collider set (query by the church returns 9 segments).
4. Grande-Riviere lines (96b2e34, D-12 section 3, Tom 14 Oct), src/game/world/landcover.js: LINED_SCHOOLS, LINE, minRect, fieldLines, fieldPieces, emitted after the area loop through ctx.drapeQuad, gated per piece midpoint on `inside`. Track 2 rings (100 segments), gridiron 17 segments clipped to the infield, 1882 m of line, 285 pieces = 570 tris. Every AREA entry and the sand branch unchanged.
5. Modern-name smoke (96b2e34, d9fcc0c): tools/smoke_w7_modern_names.mjs. 77 modern names, 288 sign texts (storefronts.json, every landmark board, every signage plan name): 0 hits. It found "Garage Hugo Caumartin" on the 143 Principale board (oldaylmer.js garage143), an owner's name taken from 2026 OSM with no 2004 source; safe default applied: the board now reads plain GARAGE (the D32 "no owner's name on a garage sign" rule). Desjardins is allowed (2004).
6. tools/smoke_w7_places.mjs (0b3c470): 27 asserts over items 1 to 4 (V3-04 smoke_caricature and D-12 asserts that apply). GREEN.

## Screenshot poses for the friends' test (HUD-free, noon, med)
- The Tim's: free cam eye (-212, 2.0 m over ground, -190) looking at the sign (-237.8, ground + 2.8, -182), on Wilfrid-Lavigne's west lane; second take, the postcard corner: eye (-224, ground + 2.0, -150) looking at (-240, ground + 4, -172) (stone gable, lamp, sign).
- Rue Principale: V3-04's chase_principale_west, car at (-300, -142), heading 264, chase camera; the spire is about 28 deg right of the heading over the roofs.
- The Galeries: eye (9.1, ground + 2.4, -247.9) looking at the name board (-0.41, ground + 7, -286.55): doors, canopy and LES GALERIES D'AYLMER.
- The Super C: D-13's superc_front, eye (63.0, -238.0), with its target moved to (66.66, -275.0) (D-12 ask d). The pad building 68609352 blocks it from Principale at x 67 to 100.
- The marina: the existing marina_quay pose (unchanged by this branch).

## Checks
- Named smokes on the VM after each step: GREEN (landmarks, landmark_ground, landmark_roads 73/73, historic_mall, principale, world 24/24, sectors, signs, w7_modern_names 4/4, w7_places 27/27).
- Full suite run 1 (9159f9d, after merging fix/look-on-qr c685390): RED, 104/117. Cause was mine: landmarks.js imported look/flags.js, which reads document.documentElement at load, and ten smokes stub `document` without it (TypeError in flags.js:17); then a camera smoke's canvas stub has no ctx.scale. Fixed: the landmarks2 flag is read from location.search directly, and `fit` calls scale only when it exists. The ten smokes rerun by name: GREEN.
- Full suite run 2 (494e088, fix/look-on-qr c685390 merged): GREEN, 114/117; the 3 failures are smoke_audio, smoke_harness_gate, smoke_models (VM-only, counted green; lead reruns them on the Mac).

## Cloud checks for the lead
- boot.mjs on index.html and prototype.html: 0 console errors (the sign canvas now uses ctx.scale and an italic script font chain).
- The five poses above at noon, plus the Tim's at night (sign drawn lit as before; no night overlay was built).
- perf.mjs perf8 noon/night/rain med: expected draws delta 0 (Saint-Paul is in the British meshes; the Tim's keeps the strip shop's 3 meshes), tris delta small (Tim's bake is smaller than the box's budget; British far +174 tris at mike_lawn).
- Look at the Tim's dormers and the roof overhang in the near bake, the Super C fascia for z-fight against the OSM wall (panel 0.05 m proud), the name board against the vestibule from 15 to 46 m, the pylon posts against the lot lanes, and the spire proportion against references/places/eglise-saint-paul (not opened here; if the reference spire-to-eave ratio x 1.3 is lower, cut SAINT_PAUL.tip).

## Not done
- Grande-Riviere wall sign: landmark boards are tied to a site's ground (smoke_landmark_ground's footing rule), and there is no site at the school; a site needs real geometry. It belongs in signage specs (D-12 design 1 via V3-03) or a small school site. Not added.
- V3-04 lit-sign overlay, night mesh, LANDMARK_LIGHTS and the glass helper pass: out of the five-places scope.
- D-12 place keys `superc` and `granderiviere` (places.js) and the storefront surname renames: not in this task's list.

## For the lead / Tom
- Tom: was the 143 Principale garage "Garage Hugo Caumartin" in 2004? The name is still the game's repair garage in places.js, economy.js and damage.js (toasts and label), only the board dropped it. Default here: plain GARAGE board.
- Lead: poses.json owner adds chase_principale_west and moves superc_front's target (above).
