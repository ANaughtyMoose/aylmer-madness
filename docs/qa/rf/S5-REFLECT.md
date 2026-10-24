# S5-REFLECT: cheap analytic reflections (lake, car paint, windows, wet roads)

Builder s5-reflect, branch rf/s5-reflect, base fix/look-on-qr at 2fb304c. Tom (16 Oct): "No reflections in game - is that on purpose?"

The answer is now yes: there are reflections, and all of them are analytic. Each one samples the sky gradient along the reflected ray in the fragment shader. There is no planar pass, no SSR, no runtime cubemap, no texture and no extra draw. Order of work followed world.md section 3.

## Commits

| Step | Commit | What |
|---|---|---|
| 1 lake | 324a7d5 | water.js: Fresnel blend of the sky along the reflected ray, sun glitter path, four ripple trains faded with distance. Flag water2. Flag off runs the old code byte for byte (waterAlbedoV0). |
| 2 car paint | a49de55, 497eb05 | car.js clear coat: analytic sky env plus a dark tree-and-roof skyline band and a sun lobe whose width follows roughness. Paint roughness is set per car (cars.js PAINT_ROUGH). Material codes live in the normal's length (cars.js tagBuilder / finishTags): paint 0.9 to 1.0, glass 0.75, chrome 0.55, rubber and lenses 0.35, matte 0.15. look/carpaint.js routes tagged bodies to MAT_CAR through the existing look.paint hook, so main.js is unchanged. |
| 3 windows | ee65866, 446c711, 7582d60, c36773a | glass.js: Fresnel against the sky (floored at 0.22) plus a golden-hour sun glint. Glass is found two ways, never by colour: (a) atlas window panes by UV cell while the material atlas is bound (materials.js sets uGlassAtlas per draw), and (b) untextured glass tagged by normal length 0.43 (world/glasstag.js) in landmarks.js wallRow, oldaylmer.js and the OSM shop and apartment windows in world/buildings.js. No vertex stream is added. |
| 4 wet roads | 70e9da7 | wet.js plus look/wetroads.js (V5-02 subset). Rain darkens the ground (asphalt about 40 %, grass a little). Up-facing non-grass surfaces get a Fresnel sky sheen, and at night streaks from the 8 nearest streetlamps (4 Hz). Flag wet. Not built: puddles, ripples, lightning, 3D rain, car and signal lights. |

Every shader edit sits in a block marked `s5-reflect`. The shared helpers are in src/core/shaders/reflect.js (reflSky, reflEnv, reflFresnel). water.js prepends them, so glass, car and wet can call them without an index.js edit, and smoke_shaders' fixed chunk list still holds.

**Merge note for s5-light:** reflSky() is the only place that reads the sky contract. It uses uSkyLo / uSkyHi (written by the sky draw), uSunSky and uLightDir, plus the dome ramp t = pow(sin elev, 0.6). If the sky owner ships a skyDirColor(dir), point reflSky at it and change nothing else. The water and wet hooks return albedo before light, so they divide their reflected radiance by ambientLight(n) + uSun * sunLambert(n). If the light contract goes linear, or adds an albedo ceiling, those two functions need the matching conversion.

## Checks run on the Mac (before the lead's stop)

- npm test: 103/103 at 70e9da7, run through qa-slot after the last commit.
- boot.mjs, entries index and prototype: both ok, 0 console errors. Run at ee65866 (steps 1 to 3). **Not yet re-run after 3b to 4.**
- smoke_world: 24/24, vertex data 341 MB, the same as base. The normal tag adds no stream. smoke_shaders: 129/129.
- World normal-length census over the whole node bake: every untagged vertex has length 1.00 to 1.10. The 0.43 band holds only the 1.0 M tagged glass vertices (250k windows).
- Bug found and fixed in 3d: the blob shadow is drawn with a non-uniform scale (2.3 x 1 x 5), which shrinks its normal to 0.43, so it read as glass. Glass and car decoding now require a uniform model scale, and glass skips unlit and translucent draws.

## Perf (perf.mjs, display air 1874x1219, tier med, fresh page per row, Mac under load)

Each cell: frame p95 / GPU p50 / GPU+CPU p95, in ms. Tris did not change on any row. Draws moved by 2 to 8 either way on reused poses, which is noise.

| pose env | before 2fb304c | step 1 324a7d5 | step 2 497eb05 | step 3 7582d60 |
|---|---|---|---|---|
| marina_quay noon | 5.8 / 1.78 / 6.26 | 5.5 / 1.81 / 6.06 | 6.0 / 1.81 / 6.23 | 5.6 / 1.89 / 6.38 |
| marina_quay golden | 6.5 / 1.95 / 7.02 | 6.3 / 1.97 / 6.60 | 5.2 / 1.81 / 5.89 | 5.7 / 1.96 / 6.32 |
| marina_quay night | 6.4 / 1.93 / 6.90 | 5.5 / 1.92 / 6.52 | 5.7 / 1.79 / 5.86 | 6.4 / 2.03 / 6.74 |
| chase_lucerne_golden noon | 6.9 / 2.03 / 7.33 | 6.7 / 2.17 / 7.21 | 6.7 / 2.10 / 7.00 | 6.8 / 2.09 / 6.99 |
| chase_lucerne_golden golden | 6.5 / 2.05 / 7.23 | 6.3 / 1.97 / 6.54 | 6.2 / 2.06 / 6.26 | 6.7 / 2.12 / 6.83 |
| chase_lucerne_golden night | 7.1 / 2.15 / 7.65 | 6.7 / 2.01 / 6.85 | 6.3 / 2.10 / 6.79 | 6.7 / 2.18 / 6.97 |
| principale_strip noon | 7.0 / 2.23 / 8.14 | 6.8 / 2.40 / 7.82 | 6.5 / 2.23 / 7.26 | 6.0 / 2.47 / 7.31 |
| principale_strip golden | 7.2 / 2.35 / 8.47 | 6.2 / 2.31 / 7.17 | 6.4 / 2.21 / 7.17 | 6.0 / 2.40 / 7.18 |
| principale_strip night | 7.1 / 2.28 / 7.82 | 6.7 / 2.52 / 7.69 | 6.4 / 2.33 / 7.35 | 7.7 / 2.26 / 8.81 |

Reading: on a loaded machine the p95 numbers are noise; GPU p50 is the steadier signal. Steps 1 to 3 together cost +0.0 to +0.24 ms GPU p50 at the worst row (principale_strip noon) and +0.03 to +0.11 ms at the marina. That is inside the 0.1 to 0.3 (lake), 0.1 to 0.2 (paint) and under 0.1 (glass) targets. Every run had budget pass true: p95 well under 16.7 ms and GPU+CPU well under 12 ms. Raw JSON: references/review/rf-s5-reflect/perf-*.json.

## Frames (references/review/rf-s5-reflect/)

- before/ (2fb304c), v1/ (steps 1 to 3 first cut), v2/ and v3/ (glass tuning; v3 is 7582d60, before the 3d blob-shadow fix): marina_quay, chase_lucerne_golden, principale_strip, chase_principale at noon, golden and night. v2 and v3 also have hood_hull_bridge.
- wet0/ (flag wet off) against wet1/ (wet on, before the streak shininess tweak in 70e9da7): chase_principale, principale_strip, chase_chemin_aylmer, hood_hull_bridge at rain and nightrain. nightrain is a scratch env (night phase, rain weather) injected at read time; poses.json is not edited.
- What they show:
  - The marina lake now takes the sky: pale blue at noon, mauve at golden (it was teal), navy at night.
  - The Ranger's backlight is a dark mirror of the sky, and the hood in hood_hull_bridge picks up the golden-hour pink.
  - Atlas house windows show the sky. OSM shop windows are greyer, but it stays a subtle read at eye level, because they mostly reflect the street.
  - In rain the road goes dark with a silver sheen toward the horizon; at night sodium blobs and streaks sit under the lamps.

## Browser checks the lead still needs to run (cloud)

Use the final commit 70e9da7 for all of these. The nightrain env needs either a poses.json entry `{"label":"23:30 rain","phase":"night","weather":"rain"}` or the read-time preload in this builder's scratchpad (nightrain.mjs).
1. Boot: `node tools/qa/boot.mjs --entries=index,prototype`. Expect both ok and 0 console errors. The last boot was at ee65866, so this covers 3b to 4 (glasstag, car tag change, wet).
2. Perf, final: `perf.mjs --poses=marina_quay,chase_lucerne_golden,principale_strip --env=noon,golden,night --tier=med --fresh` at 70e9da7. Compare with perf-before.json. Pass if GPU p50 delta is <= 0.3 ms per row and budgets pass.
3. Perf, wet: `perf.mjs --poses=chase_principale,principale_strip,chase_chemin_aylmer --env=rain,nightrain --tier=med --fresh` at 70e9da7 and at c36773a (the same code without step 4). Pass if the step-4 delta is <= 0.4 ms GPU p50 at nightrain.
4. Frames at 70e9da7 (capture-run, default qa settings): marina_quay, chase_lucerne_golden, principale_strip, chase_principale, hood_hull_bridge at noon, golden, night and nightrain. Look for:
   - the blob shadow under the car no longer tinted (3d fix; it was tinted in v3 hood_hull_bridge, rows 680 to 799);
   - lake, paint and glass as in v3;
   - the night lamp streaks in chase_principale nightrain now longer, not round blobs.
5. Identity: the same capture with `?look=-water2,-carpaint,-glass,-wet` at marina_quay and principale_strip, noon and night, then look-diff against before/. Expect 0 pixels over 1/255. Caveat: car bodies keep tagged normals with the flag off. MAT_WORLD normalises them, so a 1/255 rounding difference on car pixels is possible; report it if it shows.
6. Optional, if the lead wants spec numbers: the V3-06 mirror correlation at marina_quay (r >= 0.5 at noon, golden, night), and a sun-facing glitter view over the lake at golden (not in any pose today: chase_lucerne_golden shows no water).

## Open issues and decisions for the lead

- Out of scope by design, from the specs: the V3-06 mast and tree streaks and the tea-brown shore band; V3-02 interiors, curtains and lit windows at night; V5-02 puddles, ripples, lightning, 3D rain, and car or signal lights in the streak list.
- Glass at eye level on OSM shop fronts is honest but subtle. It mostly reflects the street (uGround x 0.85). A skyline band like the cars' would make it read more. That is a taste call for Tom.
- Car paint is subtle on vertical panels seen head-on (F about 0.04, which is physically right). It reads best on the hood, the roof and the glass.
- Car material tags are always baked: cars.js cannot import look/flags.js, because flags.js needs a document and smoke_world stubs it without documentElement. Flag carpaint off routes nothing to MAT_CAR.
- glass.js and water.js import game/look/flags.js and game/world/glasstag.js from core/shaders. This follows the V3-06 spec pattern; core/audition.js already imports from game/.
- Snapshot worktree /Users/thomaslever/Desktop/Coding Projects/wt-rf-s5-reflect-base (detached, clean, used to measure each commit without editing under a running job) is left in place. Removing it is the lead's call (worktree remove is not lossless for ignored files; there are none of mine there).
