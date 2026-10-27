# S5-LIGHT: light with a direction, a night that is night, and air (20 Oct 2026)

Builder s5-light, branch rf/s5-light, base fix/look-on-qr 2fb304c.
Specs: V1-01, V2-07 (vertex AO only), V1-02, V1-03, V1-04 (references/review/specs/, private).

## Status

- [x] 0. golden and dusk envs at their labelled hours (poses.json), eae54a4
- [x] 1. light contract + vertex AO, 80c7be1 + 150daa8, perf fix in the last commit
- [x] 2. timecycle as data, night, lamp heads, lit windows, 665f0e2 + bbc5a9e
- [x] 3. sky + aerial fog, 7cc85f2 + d5cbab7 + b8808da
- [ ] browser checks the lead runs in the cloud (list at the end): Tom's Mac was heating up and the lead stopped all browser jobs

## Step 0: golden and dusk at their labelled hours

poses.json said golden is "19:30 clear" but pinned clock 0.45, which the game clock reads as 16:23
(sun about 40 degrees up), so no golden frame could ever show a low sun. Now clock 0.586 (19:30) and
dusk clock 0.651 (20:45), the values the V1-02 spec asked D-13 to set. The "before" captures and
perf runs below are all taken with this poses.json on the base renderer, so before and after share
the same poses and envs.

## Step 1: the light contract and vertex AO (80c7be1, tuned in 150daa8)

What changed
- Light is linear (look flag `linear`, default on). shaders/common.js: exact sRGB helpers. light.js:
  albedo decode after the albedo hooks (about a 1.8 power, see below), a 0.80 albedo ceiling, and a
  linear gradeLight. tonemap.js: exposure, the three r170 ACES fit, warmth, contrast, saturation
  after the curve, sRGB encode, 1/255 dither. look/grade.js (new, first beforeSky row): decoded fog
  colour and the curve uniforms once a frame, each sent only when it changes.
- The light contract: gradeLight is still the one choke point. env.lightDir and env.sun reach the
  world (uLightDir, uSun), the sky disc (uSunSky) and the fog from the env alone, through gl.js
  begin() and grade.js; nothing else sets them.
- Day: sun to sky 2:1 (LIN.SUN_SKY 2.0, flat roof UP_LIN 1.0), so the shade side of a wall reads
  about half the lit side (it was 0.72, the "flat noon").
- Golden (a warm sun low in the sky, gw weight): the sun becomes the light and the sky only the
  shade, cooled toward blue-violet (GOLD_COOL), warm ground bounce. No eye adaptation by day or at
  golden; it is kept for night and storm only (ADAPT, NIGHT_DESAT for the decoded navy fill).
- Why about a 1.8 power (c * (0.8 c + 0.2), no pow, since the perf commit) and not the exact sRGB decode: the vertex colours were picked by eye for a flat
  display-space light; with the exact decode every dark albedo (brick, shingle, spruce) went near
  black in shade (299 Fraser's brick wall 42 to 25 luma, the chemin d'Aylmer brick 56 to 25). The
  light, fog and sky still decode exactly. Contract for V2-01 and V2-03: when the albedos are
  re-picked for linear, linearAlbedo() in light.js goes to the exact decode.
- V2-07 vertex AO (look/aobake.js, queued by world/contact.js in postBuild): base walls darken to
  0.74 at the foot and are full at one storey; windows, doors and trim in front of a wall take the
  wall's value at their height (no pale boxes); free posts, trunks and hedges get their own foot;
  soffits x 0.62. 0 vertices, 0 draws, 0 ms a frame. Bake cost: 2.9 s on the whole map in one node
  ctx (about 9 % of the 33 s bake), less per sector in the Worker. The contact strips of the spec
  are not built (they need the triangle budget reconciled first).
- Cars: a baked sill gradient on every body (cars.js groundCarAO, marked block): sills, bumpers and
  arches darken toward the road, the underside goes dark. 0 ms.

Measured (SwiftShader captures, same poses and envs; before = eae54a4, after = 150daa8)
| shot | before | after step 1 | palette |
|---|---|---|---|
| chase_chemin_aylmer noon road | 139,139,145 | 155,150,149 | 156,150,148 |
| fraser_front noon lawn | 124,154,85 | 141,163,91 | 120,140,58 +/- 25 |
| clipHi at noon (6 poses) | 0 to 0.23 % | 0.00 % | <= 0.5 % |
| 299 Fraser wall base / 2 m up (garage door, right) | 1.00 | 0.80 | AO bar: <= 0.85 |
| 299 Fraser brick wall low / high | 1.04 | 0.79 | |

Golden in step 1 is still the legacy dusk palette (pink sky) because the env colours are the old
table; step 2 replaces them. Night in step 1 is bluer than before (decoded navy fill): step 2's
table fixes it; NIGHT_DESAT limits it meanwhile.

## Step 2: timecycle as data, night, lamp heads, lit windows (665f0e2)

What changed (V1-02, smallest version that stands alone; V3-02 night side)
- assets/look/timecycle.json: 9 clear rows by hour (05:00 to 01:00) with sky zenith, horizon/fog,
  sun colour and strength, the world's ambient (ambSky, ambGround, now separate from the dome
  zenith), fog density, cumulus cover, cirrus and the town glow; one block of night colours per
  weather (rain, storm and overcast nights are navy with low cloud lit by the town, never the
  daytime storm grey).
- look/timecycle.js: the sampler (no allocation), the real sun path over Aylmer (45.40 N,
  75.85 W, EDT) on the game's date, the moon as the night fill direction. 13:00 is held from
  11:30 to 14:00 and is TIME_OF_DAY.day exactly, and the weather leans every day row through
  weather.tintEnv as it always did, so every noon frame in every weather is the shipped one
  (smoke: equal to tintEnv(TIME_OF_DAY.day) within 1e-6 at 11:52, 13:00 and 14:00, all 6 weathers).
  Night: each weather's night colours replace the clear row by (1 - w), w = (sky lum / noon sky
  lum)^2, so a daytime tint applied at 23:30 is under 2 % of its noon strength.
- look/envcycle.js: the table path behind flag `timecycle` (classic entry only; the prototype keeps
  daylight.js), env fields cloned and eased generically, a clock jump snaps the whole env (a pin,
  A.env, a capture's clock write). The table loads with fetch at install; until it arrives the
  legacy cycle draws.
- The night gates keep their evening moments: pools 20:42, G.night 20:46, cones 20:52 (legacy
  20:39, 20:45, 20:54). In the small hours they now stay on: the sky stays at its darkest to about
  03:30 ("later" ease), so the 03:00 Nuit du Tim has its lights (legacy switched them off at 02:47).
- Night glow (flag `glass`): lit house windows (45 % of panes, a fixed hash per window, warm
  amber), lit shop and flat windows (55 %, warm white) and every street lamp's lens (a new
  down-facing quad, 2 tris a lamp, inside the pole's index range so a snapped pole loses it). The
  tag is 2 x kind added to the vertex colour (no new attribute); shaders/glass.js strips it and adds
  the glow scaled by uNightGlow = nightAmount(env) (look/glow.js), the rule the pools and the
  headlights already follow. On textured panes only the dark glass glows, not the frame. AO skips
  tagged vertices. Contract for V1-05: vertex colour must stay a float, or the kind must travel
  another way.
- tools/smoke_timecycle.mjs (60 checks): noon identity in every weather, night is night at 22:30,
  23:30, 01:00 and 03:00 in all 6 weathers (sky and fog luma <= 42, B-R 19 to 35, no sepia ground,
  fog density <= 0.0026, cones on), night rain is not a fog, 3 a.m. darker than 05:00, golden is
  low (11.5 degrees), warm and from the west (azimuth 289), the sun path (peak 65.9 degrees at
  13:09 on 15 July), the evening gates, no allocation.

Step 2 tuning (bbc5a9e): the decoded night table read too dark through the ACES toe (sky luma 8,
road 15 at principale_strip), so the eye's night adaptation may go to 4.5x (ADAPT_MAX); golden
shade less violet (GOLD_COOL).

Measured, step 2 (bbc5a9e, SwiftShader captures)
| shot | before | after | bar |
|---|---|---|---|
| principale_strip night sky | 42,45,75 (luma 47) | 10,17,44 (luma 18) | luma <= 42, B-R 19 to 35 |
| principale_strip night road | 48,52,87 (luma 55) | 22,28,55 (luma 29) | >= 16, sky-road >= 10 (11) |
| chase_principale night road / sky | 72 / 45 | 58 / 18 | separation 40 |
| chase_lucerne_golden golden sun | 57 degrees up, pink tint | 11.5 degrees, azimuth 289, warm | low, warm, side |
| every noon shot | | identical to step 1 (noon held) | out-of-scope 0 |
Night frames now show lit windows (about half), glowing lamp lenses and the pools; noon is unchanged.

## Step 3: sky and air (7cc85f2, tuned d5cbab7 and b8808da)

What changed
- shaders/sky.js (V1-03, flag `sky2`): a per-pixel dome: gradient (gradPow 0.6, or 0.30 when the
  horizon is warm and the zenith blue, so a golden sky stays blue overhead), a milky horizon band,
  a sun glow that widens as the sun drops, a cooler anti-sun side, a value-noise cumulus deck
  (2 octaves on medium, 1 on low, 3 on high via setSkyTier; cover from the timecycle, else the
  weather's darkness), lit from the sun side with golden undersides and a silver lining, cirrus,
  a static star lattice at night, and the town's sodium glow low toward Parliament (faded inside
  Hull). The 28 octagon puffs go: the clouds draw becomes 0 triangles (same draw count, -672 tris).
  Flag off: the old formula, exactly. Exports skyGradient, skyDirColor (for V3-06), skyHorizon.
- shaders/fog.js (V1-04, smallest version, flag `aerial`): fog colour is skyHorizon in the view
  direction (decoded), the air thins above the eye (x0.35 at 160 m up), and a warm inscatter
  4f(1-f) toward a low sun. Not built: the distant treelines and hills of the V1-04 spec
  (distant.js), and the distant mesh still draws at fogMul 0.28 from main.js.
- game/sky.js: the sky uniforms once a frame from the env (no allocation, smoke checked).
- tools/smoke_sky.mjs (25 checks).

Measured, step 3 (d5cbab7; b8808da adds the warm-horizon gradient, not captured: the lead stopped
browser jobs before that capture ran)
| shot | step 2 | step 3 | note |
|---|---|---|---|
| chase_chemin_aylmer noon sky | 157,184,217 | 164,187,216 | palette sky_zenith #A6BBD6 = 166,187,214 |
| principale_strip noon sky | 159,185,217 | 169,191,218 | |
| principale_strip night sky | 10,17,44 | 8,15,41 | stars, glow-lit cloud bellies |
| clipHi, all 18 shots | <= 0.37 % | <= 0.37 % | noon 0.00 % |

Frames (private folder, game renders only):
/Users/thomaslever/Desktop/Coding Projects/aylmer-madness/references/review/rf-s5-light/
before/ (eae54a4), s1-b/ (step 1), s2-b/ (step 2), s3-b/ (step 3), each with
chase_lucerne_golden__golden, marina_quay__golden, principale_strip__night, chase_chemin_aylmer__noon,
fraser_front__noon and the other noon, golden and night shots of those six poses.

## Perf (perf.mjs, perf8, med, display air 1874x1219, 300 frames, fresh page per row)

Before eae54a4 complete (24/24); step 1 150daa8 complete (24/24); step 2 bbc5a9e 11/24 rows (the
lead interrupted it); step 3 not run. The runs were back to back on a Mac that was heating up, so
later runs are hotter: read the deltas as an upper bound.
| | GPU p50, median delta vs before | GPU+CPU p95, median delta | worst GPU+CPU p95 |
|---|---|---|---|
| before | | | 9.72 ms (hood_hull_bridge night) |
| step 1 | +0.79 ms (0.08 to 1.87) | +2.10 ms | 13.92 ms (mike_lawn golden): OVER the 12 ms bar |
| step 2 (11 rows) | +1.14 ms vs before, about 0 vs step 1 on the same rows | +2.40 ms | 11.64 ms |
Tris and draws unchanged within noise (tris 98k to 235k, draws 333 to 396, <= 400).

Step 1's GPU cost is over V1-01's 0.15 ms cap even allowing for heat. The last commit takes out
the per-pixel pow calls (the albedo and colour-multiplier decode is now c * (0.8 c + 0.2), and
contrast 0 skips three more pow); it is not measured yet. If the cloud run still shows more than
0.15 ms for step 1, the next cuts are: the sRGB encode by a sqrt-based fit, and the sky decode
moved to the CPU for uSkyLo/uSkyHi. The sky (0.3 ms cap) and the fog (0.10 ms cap) are unmeasured:
cut order for the sky is cirrus off on med, then 1 octave on med; for the fog, the inscatter pow.

## Checks run on this Mac
- npm test (through qa-slot, at 3884943): 105/105 suites passed (new: smoke_timecycle 60 checks, smoke_sky 25).
- node tools/smoke_world.mjs 24/24 (town and house tris and 341 MB unchanged; the lamp lenses add
  2 tris a streetlight).
- Captures (SwiftShader, 18 shots each, 0 page errors every time, which also proves the program
  compiles in Chrome): before, s1-a, s1-b, s2-a, s2-b, s3-a, s3-b.
- AO bake: 2.9 s on the whole-map node bake (about 9 %); per sector in the Worker, less.

## Browser checks the lead still needs to run (cloud)
All from the head of rf/s5-light, ports of the lead's choosing.
1. Perf, the binding numbers: `node tools/qa/perf.mjs --poses=perf8 --env=noon,golden,night --tier=med --fresh --frames=300`
   on the head, and the same on fix/look-on-qr 2fb304c with this branch's poses.json (golden clock
   0.586) for the before. Bars: p95 <= 16.7 ms, GPU+CPU p95 < 12 ms, tris <= 450k, draws <= 400;
   per-task GPU caps: V1-01 0.15 ms, V1-02 0, V1-03 0.3 ms, V1-04 0.10 ms, V2-07 0. If step costs
   are wanted separately, also on 150daa8 (step 1), bbc5a9e (step 2), b8808da (step 3), each with
   the head's perf commit cherry-picked, or simply the head with `?look=-sky2,-aerial` and
   `?look=-sky2,-aerial,-timecycle,-glass` (perf.mjs has no --look; the lead's rig decides).
2. Captures, the report frames at the head: poses chase_lucerne_golden, marina_quay,
   principale_strip, chase_chemin_aylmer, fraser_front, chase_principale; envs noon, golden, night
   (18 shots). Then look-diff before vs head on the core set at noon for the palette and clipHi
   lines: `node tools/qa/vis-check.mjs --task=V1-01 --tag=after --poses=core --env=noon`.
3. Night bars on the head: principale_strip, chase_galeries, marina_quay at night and at
   23:30 rain (`AYLMER.time(23.5); AYLMER.weather('rain')`): sky luma <= 42, sky B-R 19 to 35,
   road luma >= 16, |sky - road| >= 10.
4. Boot both entries with 0 console errors: `node tools/qa/boot.mjs --entries=index,prototype`
   (the prototype entry keeps its own renderer; grade, glow and sky guard r.isPrototype).
5. Regression beats: `node tools/review/harness.mjs --plan ranger-rerun --only crash,freeRoam,blitz`
   and `--only course`.

## Open issues and decisions for the lead
- poses.json golden clock 0.45 -> 0.586 and dusk 0.651 (step 0): a shared QA file; D-13 was
  asked for exactly this in the V1-02 spec.
- Step 1 perf is over its cap on the hot run (above); the fix is committed, unmeasured.
- The albedo decode is a 1.8-ish power, not exact sRGB, until V2-01/V2-03 re-pick albedos.
- Night glow rides in the vertex colour (2 x kind added): V1-05 vertex packing must keep it.
- Not built: V2-07 contact strips, V1-04 distant rings and hills, V4-01 coronas. Golden lake is
  still teal (V3-06, rf/s5-reflect); skyDirColor is exported for it. Both branches touch
  shaders/index.js FRAG_MAIN only if s5-reflect edits it: mine changes the base and light lines.
- The timecycle loads by fetch at boot; until it arrives (a few ms) the legacy cycle draws.
- Golden and night frames of b8808da (warm-horizon gradient) were not captured.

## Cuts applied (branch rf/s5-light-cuts, 20 Oct 2026, builder w6-lightcuts)

From references/review/rf-s5-light/CUT-PLAN.md, order 2, 1, 4, 5, 9. Stopped at the 11:57 hard
stop; smoke_shaders (137), smoke_sky (25), smoke_timecycle (60) green after every commit. The full
`npm test` through qa-slot (AYLMER_QA_SLOTS=1) was NOT run.

| Commit | Cut | What changed | Look |
|---|---|---|---|
| 6ca2f97 | 2 (partial) | fog.js: sunC uses new uniform uSunSkyLin, decoded on the CPU in gl.js via srgbToLinear3 (3 pow off every fogged pixel) | identical |
| 793f0ac | 4 (partial) | skyGradient: pow(s,8), pow(s,48) by squarings (also runs inside skyHorizon for fog) | identical |
| 103d717 | 9 | tonemap: uniform branches skip uLift when 0 and uSat when 1; clamp kept | identical |
| b0ab1ec | 4 (partial) | sky corona: pow(s,900), pow(s,120) share one log2 | identical |

Not done yet (next builder, in this order):
1. Cut 2 rest: uColorMul decode (index.js `linearAlbedo(uColorMul)`). linearAlbedo depends on
   linearDraw(), so the CPU needs the same flag before sending uColorMulLin.
2. Cut 1: skyHorizon as its own folded function with 3 CPU-folded vec3 uniforms.
3. Cut 4 rest: fog pow(s, INS_POW) (INS_POW is a knob, 6.0; squarings only if it stays 6);
   hoist normalize(uLightDir) after checking gradeLight sends it unit.
4. Cut 5: hoist H, warmLo and the gradPow exponent to uniforms.
5. Then cut 8, measure, then the skyDirColor merge.

What to measure in the cloud: GPU p50/p95 at noon, golden (mike_lawn) and night, med and high
tier, on rf/s5-light (6181fca) vs rf/s5-light-cuts head, back to back on a cool rig. Expected from
these four commits: about 0.05 to 0.10 ms GPU p50 at street poses (fog sun decode plus the
skyHorizon lobes), a little more on sky-heavy poses. Also eyeball golden and night for any change
in the sun glow and corona (there should be none).

## Wave 7 (27 Oct 2026, builder s5-light, branch rf/s5-light-cuts)

No tests on Tom's Mac (brief update 27 Oct 00:55): every check below ran on the Colab VM through ct.py.

### Merges
- a74c2fa: fix/look-on-qr (786acf4, with s5-reflect). Conflicts kept both sides:
  - shaders/glass.js: s5-reflect's glassReflect (Fresnel sky, glint, tag by normal length) runs first,
    then S5-LIGHT's glassGlow (night windows and lamp lenses, tag in vCol as +2 x kind). Neither test
    reads the other's tag. Uniforms uGlassOn, uGlassAtlas and uNightGlow all live in glass.js.
  - cars.js: groundCarAO(mb) then finishTags(mb).
  - world/buildings.js: OSM shop windows keep the glow colour and get tagGlass.
  - look/frame.js: grade, glow, carpaint and wetroads all registered.
- b6b1ffc: fix/look-on-qr again (races, bugs, medals and ghost, cop escape, opening, English, canon). Clean merge.

### Reflections in linear light (d0945e0)
- sky.js skyDirColor(dir) is now the cheap reflection sky: one pow for the gradient plus the sun lobes
  by squarings. It has no haze band, no anti-sun and no town glow. On a linear draw it returns LINEAR
  light, built from uniforms decoded on the CPU (uSkyLoLin, uSkyHiLin, uSkyHLin, uSunSkyLin), so there
  is no decode per pixel. With sky2 off it is reflSky's old formula, exact in display space.
- reflect.js: reflSky(R) is now `return skyDirColor(R);`.
- Lake and wet road: their hooks run BEFORE the light, on an albedo that linearAlbedo() decodes and
  albedoCeil() caps at 0.80. So a linear reflection could not just be swapped in: dividing radiance by
  the light and then decoding blows up at night, and the cap clips wet highlights. With linear on, the
  reflected radiance now goes to gReflRad and FRAG_MAIN adds it after the light
  (`col += gReflRad * mulL`). With linear off, the old divide by the light is unchanged. The lake glitter
  uses uSunSkyLin when linear.
- Glass and car paint already add their reflection after the light, so they just get the linear sky.

### Cuts applied (CUT-PLAN.md numbering)
| Cut | What | Tier | Look |
|---|---|---|---|
| 1 | skyHorizonAz: H + sun lobes + anti-sun + town glow, from uniforms folded in game/sky.js (uSkyFold0/1, uSkyGlowK) | all | identical (smoke: folded vs old algebra, worst error under 2e-6) |
| 3 | fog horizon built in linear (skyHorizonLin from uSkyHLin, uSunSkyLin, uSkyGlowKLin); no per-pixel srgbToLinear(hor) | all | glow falloff slightly different in linear; 0.10 / 0.24 NOT retuned (needs eyes at golden) |
| 4 rest | normalize(uLightDir) moved to the CPU (uSkyL); fog inscatter pow(s,6) is now s2*s2*s2 | all | identical |
| 5 | H, warmLo and the gradient exponent, low, day, anti-sun scale and sun azimuth folded on the CPU | all | identical |
| 6 | cloud light from the first octave's analytic slope (skyNoiseD) instead of a 4th noise | low, med (high keeps the 4th tap) | very close (smoke: slope matches a finite difference) |
| 7 | cirrus only on high; octaves follow G.quality (low 1, med 2, high 3). setSkyTier was never called, so the tier really reaches the sky now | low, med | faint cirrus gone on med |
| 8 | tonemap sRGB encode by the sqrt fit with the linear toe kept (max 0.40/255), and the sky decode by the cubic (0.43/255); uToneFast from look/grade.js | low, med (high exact) | under the dither |
Skipped: the rest of cut 2 (the uColorMul decode). Since 3884943 it is c*(0.8c+0.2) on a uniform (2 ALU), and moving it to the CPU means work per draw keyed on material, for well under 0.01 ms. Cut 10 needs a ruling.
Note: without the fit's linear toe (as written in CUT-PLAN), the sqrt fit is off by up to 8/255 below 0.0015 linear, which hits night blacks. The toe fixes that.

### Bug fixed on the way (d08fa6e)
timecycle.js coverDay built a 7-array table on every sample (it runs on the fixed step, so it allocated every frame). smoke_timecycle's no-allocation check is RED on the VM at a74c2fa too (8 MB per 20k samples). On the Mac it passed only because GC ran in the middle of the loop. The table is now hoisted.

### Checks (Colab VM)
- smoke_sky 45/45 (20 new wave 7 checks), smoke_shaders 144, smoke_timecycle 60, smoke_world 24/24: GREEN at d08fa6e.
- Full suite: see the final line below.
- There is no GLSL compiler on the Mac or the VM. The shader was reviewed by hand from shaders.assemble(), and a boot in the cloud is the compile proof.

### Cloud checks for the lead
1. Compile and boot, 0 console errors: `node tools/qa/boot.mjs --entries=index,prototype`
2. Perf, the binding numbers (cool rig, back to back, fresh page per row):
   `node tools/qa/perf.mjs --poses=perf8 --env=noon,golden,night --tier=med,high --fresh --frames=300 --display=air --out=s5-cuts-head.json`
   on rf/s5-light-cuts head, then the same with `--out=s5-light-6181fca.json` on 6181fca (rf/s5-light, before the cuts), and on fix/look-on-qr for the base. Bars: GPU+CPU p95 < 12 ms, p95 <= 16.7 ms, tris <= 450k, draws <= 400.
3. Look: golden (chase_lucerne_golden, marina_quay) and night (principale_strip) at med and high. Check the fog's warm glow toward the sun (cut 3), the cloud shading on med vs high (cut 6), and the lake, wet road at night and glass reflections with linear on (they should be darker and more saturated than before, no longer washed out) and with `?look=-linear` (identical to s5-reflect).
4. Regression beats: `node tools/review/harness.mjs --plan ranger-rerun --only crash,freeRoam,blitz`

### Expected cost per cut (desk estimate, GPU p50 on the Air backbuffer at med, street poses)
| Cut | Saving |
|---|---|
| 2 partial + 4 + 9 (wave 6 commits) | 0.05 to 0.10 ms |
| 1 folded horizon | 0.10 to 0.20 ms (on every fogged pixel) |
| 3 fog in linear | 0.04 to 0.08 ms |
| 4 rest + 5 | 0.03 to 0.05 ms |
| 6 analytic cloud light (med) | 0.05 to 0.10 ms at golden with cover |
| 7 cirrus off (med) | 0.03 to 0.06 ms |
| 8 fast encode (med) | 0.06 to 0.12 ms |
| reflection change | about 0: skyDirColor is cheaper than the old full skyGradient, and the same as the old reflSky |
Total about 0.35 to 0.70 ms off the step 1+3 cost at med. Against the 13.92 ms hot worst (which predates 3884943, itself about 0.8 ms GPU), the head should land near or under 12 ms. Only the cloud run can say.

### Decisions for the lead
- Water and wet now add their reflection after the light when linear is on. The lake looks different from s5-reflect's display-space tuning (that was the point), but WATER.F0/FMAX and the wet gain were not retuned.
- The wet-road lamp highlight colours (uWetLightCol) are still display sRGB inside a linear sum. Left as is.
- Medium loses the cirrus.

### Final (27 Oct)
- 4bd11ee merged fix/look-on-qr at 4b6f534 (crash night, shortcuts, ramps2). The merge was clean. The 92ef8bc full run was red only on smoke_missionclose, which came from the older integration head; after this merge it passes.
- Full suite on the Colab VM at 4bd11ee: 114/117 GREEN. The only failures are the 3 that fail on the VM alone (smoke_audio, smoke_harness_gate, smoke_models), which the lead reruns on the Mac.
