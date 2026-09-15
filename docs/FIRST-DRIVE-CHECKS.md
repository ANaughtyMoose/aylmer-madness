# First-drive implementation — 12 September 2026

## Delivered locally
- Explicit cinematic Start/Continue screens for new game, mission briefing, alternator pickup and mission completion. Real HTML text, keyboard/mouse controls, image-loading fallback, focus handling, and simulation hold.
- Approved Canadian Tire artwork and revised Fraser illustration installed locally. Fraser illustration includes gravel, hedge, chain-link fence, raised steps and corrected red tree.
- Authored 299 Fraser duplex replaces both generic building halves; matching collision footprints, garages, porch, windows, gravel, hedge and lawn trees. Aprons/hedge shortened behind sidewalk after user feedback.
- Ranger and dark-blue Saturn parked on 299's left side; bicycle moved off roadway. Existing nearby home bicycle saves corrected on load.
- Full-footprint recovery validation, candidate road search, no tow charge without successful placement; race starts use placement validation.
- Timed stages retain authored duration rather than a 60-second minimum.
- Explicit ? controls toggle, larger readable panel, duplicate large Psst toast removed, focus loss pauses driving.

## Verification
- Baseline: 36/38 smoke suites passed. Existing failures: smoke_react performance budget and smoke_save legacy storage / confirmation assertions.
- Full implementation run: 38/40 suites passed, with only those same two pre-existing failures. New cinematic and real-world home-parking suites pass.
- Following final hedge/control adjustments: home-parking (including roadside clearance), story (2548 assertions), UI (98 assertions) pass. Keyboard toggle verified open and closed in actual preview.
- Browser integration fixture ran the real game: opening freezes vehicle/time/fuel; brief freezes mission elapsed; pickup opens return card; return awards money, spends one day and autosaves; repeated Continue cannot settle again. All nine checks passed. Arrivals were simulated, not a hands-on drive of the whole route.
- Opening and mission brief visually inspected; smaller 1024×768 opening inspected. Remaining size/language/weather matrix from the broader plan is not yet exhausted.
- User visually reviewed new 3D house and requested the subsequent hedge/apron reduction, now applied and checked numerically against road geometry.

## Limits / next pass
This is the first playable slice, not completion of every phase of the improvement plan. Full driving-feel assessment and exact Saturn body/wheel refinement remain. The Saturn is present at home initially and remains parked unless taken; no new daily attendance schedule was invented. Existing save-suite failures are recorded rather than silently reclassified as passing.

Preview: http://127.0.0.1:8124/
Branch: feature/cinematic-first-drive
No push, pull request or merge performed.
