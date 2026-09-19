# Aylmer 2004 visual prototype

Run `node tools/serve.mjs 8140`, then open http://localhost:8140/prototype.html. The original renderer remains at index.html. No npm install or build is necessary; Node and a browser with WebGL2 are required. `node tools/build-prototype.mjs` makes a portable copy in out/aylmer-2004-prototype. Its Start.command uses port 8141.

This branch tests a new renderer against the existing game. It is a foundation for the art direction, not a completed Midtown Madness-quality city rebuild.

See [the running session log](docs/PROTOTYPE-SESSION-LOG.md), [active backlog](docs/PROTOTYPE-BACKLOG.md), and [radio plan](docs/RADIO-2004-PLAN.md).

## What changed

- Three.js r170 adapter consumes the existing world and car meshes. Driving, collision and traffic remain the existing implementation. The prototype now uses clock-driven calendar progression as requested.
- Existing photographic building atlas, plus three CC0 ground colour maps shared through Paul's project. Matte surroundings, restrained car reflections, subtle water normals. No bloom or motion blur.
- Continuous summer sunlight and sky across 24 hours, with a 24-minute default cycle. The review panel offers 12/24/48 minutes, a time slider, fixed time and acceleration.
- Near-player directional shadows: 2048px, light-space camera snapping, coverage fading between 48–72 metres. Buildings and vehicles cast onto geometry. Back-face shadow rendering and bias reduce road acne. Fine poles and open geometry still need moving-camera review.
- Warm headlights (one shadow map), six nearby local lamp lights, and a blue ambient night fill for arcade visibility. Existing distant lamp pools remain; the six actual streetlights do not cast shadows, so they may spill through walls.
- Separate prototype save/settings namespace on the same origin. Save files retain exact visual hour, including saves inside a mission.
- Optional UV/atlas buffers are omitted when unused; draw objects and materials are reused rather than rebuilt every frame.

New games start June 26, 2004 at 06:00. Midnight advances the date, with 24 game hours per 24 real minutes by default (48 minutes remains available). Jobs no longer consume a day or change the hour. The campaign ends after the full final day, September 6. The dated daily weather file now controls the sky/rain, and recorded sunrise/sunset anchor the sun. These are daily records, not an exact hourly rain reconstruction. This changes campaign pacing; repeat-job rewards still need a separate balance review.

## Controls and review

Start or continue a game, dismiss the opening story, then expand “AYLMER · ÉTÉ 2004” at the bottom. Compare morning, noon, evening and night. Use Fraser, Principale and Marina to jump near representative areas; the road snap may place you on an adjoining street. These review teleports do not complete missions. Use the original controls to drive. F5 saves within the prototype; Escape pauses.

“Mesurer les performances” reports the last 600 eligible frame intervals, render calls/triangles including shadow passes, and estimated geometry allocation. It excludes pauses over 250 ms, so it does not measure startup stalls or establish a worst-case frame-time bound. Geometry figures are buffer estimates, not total process/GPU memory. Compare after settling at the same location and resolution.

References: references.html contains four San Francisco screenshots and two further vehicle/cockpit source links. Images stay hosted by their publishers. They are reference material only and are not game assets.

## Decisions for Thomas

| Decision | Suggested direction | Trade-off / alternative |
|---|---|---|
| Overall era | Midtown Madness 2-like, as remembered in 2004 | More polish is possible, but glossy cars and heavy post-processing change the mood. |
| Day length | 24 minutes initially | 12 makes sunsets frequent; 48 gives room for an ordinary drive or errand. Adjustable now. |
| Midnight and campaign | Confirmed: advance the date at midnight | Implemented; review the economy now that jobs no longer consume days. |
| Mission starting time | Confirmed: continuous clock | Implemented; night-specific stories may need explicit waiting/eligibility later. |
| Night brightness | Readable blue fill plus warm lights | Darker nights are atmospheric but harder to navigate; brighter nights can feel like daytime tinted blue. |
| Shadows | Detailed nearby, fade with distance | Extending coverage costs sharpness or another shadow cascade and additional work per frame. |
| First art district | Principale, then Fraser and marina | Concentrated effort establishes a convincing target; a whole-map pass is broader but thinner. |
| Buildings | Local façade textures, roof edges, porches and signs | More recognizable than generic high-detail buildings; requires reference and authored assets. |
| Trees | Replace cone silhouettes with restrained low-poly crowns / cutout foliage next | Big visual gain; alpha-cutout leaves complicate shadows and increase overdraw. People stay deferred. |
| Weather and effects | Modest haze and rain response; leave bloom/motion blur off | Strong effects can impress in screenshots but obscure the town and cost performance. |
| Car finish | Mild paint/glass sheen, mostly worn materials | More reflection makes cars richer but risks Paul's glossier feel. |
| Performance target | Aim for smooth 60 fps on your usual computer | Need a representative moving route and target device before setting a firm graphics budget. |
| Adoption | Review separate version before merging | The adapter preserves the game well but adds a second renderer to maintain until a choice is made. |

## Next art pass

1. Approve one representative Principale block in noon, dusk and night: façade scale, signage, porch/roof silhouettes, lamp placement and pavement.
2. Improve trees and sky/cloud art, then bring Fraser and the marina to the same standard. Avoid increasing detail evenly across every distant building.
3. Run a repeatable moving route through all three areas, wet weather, dusk and night; measure frame-time spikes and shadow stability on Thomas's target device.
4. Expand the approved materials and architecture treatment across the map. Decide calendar integration separately so visual approval does not silently rebalance the game.

## Validation

`npm test` runs all existing smoke suites plus the adapter regression suite. `node tools/check-prototype.mjs` checks solar direction, finite values throughout the cycle, midnight continuity, time controls and entry-point isolation. Browser checks cover shader compilation, startup, restored saves, time controls, location review and screenshots. See the handoff test-results.txt for the executed suite result and the review notes for measured viewpoints.

At the Principale/Bancroft stationary view in the Codex browser (1280×720 viewport, 1632×918 internal render), the observed 600-frame sample had median 16.6 ms, p95 18.3 ms, 116 draws and 164k rendered triangles including shadows. The optional-buffer optimization reduced estimated geometry from 348 MiB to 270 MiB (about 22%). This is not a full-map or cross-device benchmark.

Known limits: detailed near shadows fade in the distance; ambient fill does not provide full ambient occlusion; lamp point lights do not shadow; there are no real-time mirrors, new people, or comprehensive new building/tree assets. Low-angle and moving shadows require broader validation before replacing the original renderer. The original game remains available for comparison.

## Local radio

The expanded panel accepts local MP3/M4A/OGG/WAV files and stores them in this browser when possible. Choose files, then Écouter; Suivant and Arrêter control playback. No file is uploaded or bundled in GitHub. A complete period aircheck can contain songs, ads and announcers in one MP3. Authentic 2004 audio has not yet been supplied; see the radio plan for sources and limitations.

## Credits

Three.js r170: MIT, vendor/prototype/LICENSE-three.txt. Surface textures: ambientCG CC0 via Paul's shared project, assets/prototype/CREDITS.md. All other assets retain their existing repository credits. No Midtown Madness assets or Paul-specific game code/models were imported.
