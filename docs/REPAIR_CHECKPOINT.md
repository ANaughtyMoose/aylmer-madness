# Aylmer repair checkpoint — 15 September 2026

Branch: `codex/aylmer-repairs`
Checkout: `C:\Users\Tom PC\Documents\Codex\2026-09-15\you-x20\work\aylmer-madness`
Original checkout unchanged. Recovery prompt was saved and pushed before implementation (64361ef). Intermediate remote backup: 160bfc3. Use the current branch head for the finished repair pass.

## Implemented
- Grass, land use, asphalt, sidewalks and markings share terrain triangles, preventing their surfaces from crossing between vertices.
- Residential streets now receive sidewalks on both sides. Placement checks keep street furniture and curb corners off asphalt.
- Rail embankment crossings now paint pavement and sidewalk onto the actual feature triangles. This fixes the remaining grass strip observed on Samuel-Edey during the browser check.
- Removed the fixed horizontal Saint-Paul fence from the historic landmark. Its new perimeter follows mapped edges with road/sidewalk setbacks and matching collision; entrance pillars retained.
- Pause immediately gates gameplay audio, including an already-playing siren. Mission briefing artwork, objective, resume/restart controls and collapsed upcoming/completed lists replace the long mission wall. Restart opens the current mission briefing. The gameplay counter is hidden during pause.
- Campaign missions unlock in order with existing story prerequisites. Completed missions remain replayable. The next-job hint uses all definitions, preventing a missing hint when a story beat unlocks. Save completion is preserved.
- Sparse asphalt patches, thin cracks, manholes, sidewalk joints, faded lane paint and different pavement ages. Summer appearance retained; cosmetic cracks do not alter driving physics.
- Ranger cab roof bevels, rusty spare tire, bed anchor and a 12-link chain. Tire motion responds to meaningful vertical impulses, settles, and is limited to 7.5 cm. Chain endpoints stay attached. Reset clears spare motion. Three extra draw calls per visible Ranger.
- Opus Glenwood work integrated (d1db6a1/0c577fa from c6943589/d070a466); checked in the actual game on Rue Glenwood.

## Validation
- Final full run: 52/53 suites passed. Only failure was the cemetery landmark missing its entrance-pillar colliders after fence removal. Restored pillars; targeted smoke_landmarks.mjs now passes. No other gameplay change after that run. All 53 groups have passing results across that run and targeted correction.
- smoke_campaign_spare.mjs passes: entire campaign progresses with one new job at a time; legacy completion remains replayable; idle tire stays still; impacts move it; lift stays bounded and settles; both chain endpoints remain attached; three draw calls.
- smoke_street_surface.mjs passes: uploaded road geometry stays above grass at the formerly broken crossing, road/physics heights agree, and fence panels sampled every tenth of their length clear road/sidewalk corridors.
- World regression: 22/22. Latest measured buffers approximately 327 MB, below unchanged 340 MB ceiling. Non-house triangle ceiling raised deliberately from 3.95M to 4.7M for two-sided residential walks and shared terrain subdivisions; memory limit unchanged.
- Topography mesh, house/Glenwood, radio, saves, driving and UI suites passed.
- Actual browser: inspected Fraser, Glenwood and Samuel-Edey/Saint-Paul. Confirmed crossing grass strip removed and fence behind sidewalk; houses render in game; rusty tire visible in close chase camera.
- Actual pause test: gain=0 with active siren, time frozen, mission unchanged. Restart opens briefing then resumes the same job. Old counter is absent from pause.
- Browser reported MutationObserver errors on reload; no MutationObserver exists in game sources and no game stack was supplied. Source not established; do not falsely claim a clean browser console.

## Limits / follow-up
- These are representative in-game views plus automated geometry checks, not an exhaustive drive of every map street. Small junction/curve sidewalk seams may still warrant a separate visual polish pass.
- Opus carports retain the pre-existing whole-footprint collision; driving under them is not supported. Steps/railings have no separate collision.
- Tire bounce and chain endpoints were tested numerically; a long manual bump-driving session was not performed.
- No main merge or deployment. Repository is public, with dynamic pages-build-deployment active; no workflow files changed, tags pushed or CI runs requested.

## Resume safely
Read this checkpoint and docs/CLAUDE-RECOVERY.md, inspect git status/log, and continue from branch head. Do not reapply Opus commits or redo finished repairs. Use `node tools/serve.mjs 8136` and `/tools/repair-review.html` for the real-game review harness. Test serially: the full runner needs permission to spawn child Node processes on this machine; sandbox failure otherwise produces misleading no-output failures. Run local tests, batch pushes, and check repository visibility/workflows before pushing.
